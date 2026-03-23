/**
 * 图片模型适配器
 * 处理 Gemini Image API 和 BigModel CogView API
 */

import { ImageModelDefinition, ImageGenerateOptions, AspectRatio } from '../../types/model';
import { getApiKeyForModel, getApiBaseUrlForModel, getActiveImageModel, getProviderById } from '../modelRegistry';
import { ApiKeyError } from './chatAdapter';
import { storageApi } from '../../src/api/storage';
import { useAuthStore } from '../../src/stores/authStore';
import { imageStorageService, generateImageId } from '../imageStorageService';

/**
 * 重试操作
 */
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 2000
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      // 400/401/403/422 错误不重试（客户端错误，重试无意义）
      // 429 限流错误会重试
      const isClientError = error.message?.includes('400') || 
          error.message?.includes('401') || 
          error.message?.includes('403') ||
          error.message?.includes('422') ||
          error.message?.includes('不安全') ||
          error.message?.includes('敏感') ||
          error.message?.includes('违规');
      
      if (isClientError) {
        console.log(`[Retry] 检测到客户端错误，不再重试: ${error.message}`);
        throw error;
      }
      
      if (i < maxRetries - 1) {
        const retryDelay = delay * (i + 1);
        console.log(`[Retry] 第 ${i + 1}/${maxRetries} 次重试，${retryDelay}ms后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  throw lastError;
};

/**
 * 检查是否为 BigModel 提供商
 */
const isBigModelProvider = (model: ImageModelDefinition): boolean => {
  const provider = getProviderById(model.providerId);
  return provider?.id === 'bigmodel' || model.providerId === 'bigmodel';
};

/**
 * 调用 BigModel CogView API
 */
const callCogViewApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const apiModel = model.apiModel || model.id;
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  
  // BigModel 尺寸映射
  const sizeMap: Record<AspectRatio, string> = {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '1024x1024',
  };
  const size = sizeMap[aspectRatio] || '1024x1024';
  
  const requestBody: any = {
    model: apiModel,
    prompt: options.prompt,
    size,
  };
  
  const response = await retryOperation(async () => {
    const res = await fetch(`${apiBase}${model.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMessage = `HTTP 错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorData.msg || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  });

  // BigModel 返回图片 URL，需要下载并上传到 Supabase Storage
  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error('图片生成失败：未能从响应中提取图片 URL');
  }

  // 开发环境使用代理下载图片以避免 CORS 问题
  const downloadUrl = import.meta.env.DEV 
    ? `/proxy-image/${encodeURIComponent(imageUrl)}`
    : imageUrl;

  const imageResponse = await fetch(downloadUrl);
  if (!imageResponse.ok) {
    throw new Error(`图片下载失败: ${imageResponse.status}`);
  }

  const imageBlob = await imageResponse.blob();
  
  // 保存到本地 IndexedDB
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[ImageAdapter] 图片已保存到本地: ${localImageId}`);
  
  // 返回本地图片 ID，格式为 local:{id}
  return `local:${localImageId}`;
};

/**
 * 调用 Gemini Image API
 */
const callGeminiApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiKey: string,
  apiBase: string
): Promise<string> => {
  const apiModel = model.apiModel || model.id;
  const endpoint = model.endpoint || `/v1beta/models/${apiModel}:generateContent`;
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  
  // 构建提示词
  let finalPrompt = options.prompt;
  
  // 如果有参考图，添加一致性指令
  if (options.referenceImages && options.referenceImages.length > 0) {
    finalPrompt = `
      ⚠️⚠️⚠️ CRITICAL REQUIREMENTS - CHARACTER CONSISTENCY ⚠️⚠️⚠️
      
      Reference Images Information:
      - The FIRST image is the Scene/Environment reference.
      - Any subsequent images are Character references (Base Look or Variation).
      
      Task:
      Generate a cinematic shot matching this prompt: "${options.prompt}".
      
      ⚠️ ABSOLUTE REQUIREMENTS (NON-NEGOTIABLE):
      1. Scene Consistency:
         - STRICTLY maintain the visual style, lighting, and environment from the scene reference.
      
      2. Character Consistency - HIGHEST PRIORITY:
         If characters are present in the prompt, they MUST be IDENTICAL to the character reference images:
         • Facial Features: Eyes (color, shape, size), nose structure, mouth shape, facial contours must be EXACTLY the same
         • Hairstyle & Hair Color: Length, color, texture, and style must be PERFECTLY matched
         • Clothing & Outfit: Style, color, material, and accessories must be IDENTICAL
         • Body Type: Height, build, proportions must remain consistent
         
      ⚠️ DO NOT create variations or interpretations of the character - STRICT REPLICATION ONLY!
      ⚠️ Character appearance consistency is THE MOST IMPORTANT requirement!
    `;
  }

  // 构建请求 parts
  const parts: any[] = [{ text: finalPrompt }];

  // 添加参考图片
  if (options.referenceImages) {
    options.referenceImages.forEach((imgUrl) => {
      const match = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    });
  }

  // 构建请求体
  const requestBody: any = {
    contents: [{
      role: 'user',
      parts: parts,
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };
  
  // 非默认宽高比需要添加 imageConfig
  if (aspectRatio !== '16:9') {
    requestBody.generationConfig.imageConfig = {
      aspectRatio: aspectRatio,
    };
  }

  console.log('=== [ImageAdapter] Gemini 请求详情 ===');
  console.log('[API 地址]', `${apiBase}${endpoint}`);
  console.log('[请求体]', {
    contents: requestBody.contents.map((c: any) => ({
      role: c.role,
      parts: c.parts.map((p: any) => {
        if (p.text) {
          return { type: 'text', 内容: p.text.substring(0, 100) + '...' };
        }
        if (p.inlineData) {
          return { type: 'image', mimeType: p.inlineData.mimeType, 数据长度: p.inlineData.data.length };
        }
        return p;
      })
    })),
    generationConfig: requestBody.generationConfig
  });

  // 调用 API
  const response = await retryOperation(async () => {
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept': '*/*',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      if (res.status === 400) {
        throw new Error('提示词可能包含不安全或违规内容，未能处理。\n\n建议：\n1. 避免使用武器、暴力等敏感词汇\n2. 使用更温和的描述方式\n3. 例如：将"警员"改为"年轻男子"，"手枪"改为"道具"\n\n请修改后重试。');
      }
      if (res.status === 500) {
        throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
      }
      
      let errorMessage = `HTTP 错误: ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        const errorText = await res.text();
        if (errorText) errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    return await res.json();
  });

  console.log('=== [ImageAdapter] Gemini 响应详情 ===');
  console.log('[响应状态]', '成功');
  console.log('[候选数量]', response.candidates?.length || 0);

  // 提取 base64 图片
  const candidates = response.candidates || [];
  let base64Image: string | undefined;
  
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        base64Image = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }
  }

  if (!base64Image) {
    throw new Error('图片生成失败：未能从响应中提取图片数据');
  }

  // 将 base64 转换为 Blob
  const base64Data = base64Image.split(',')[1];
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const imageBlob = new Blob([byteArray], { type: 'image/png' });

  // 保存到本地 IndexedDB
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[ImageAdapter] Gemini图片已保存到本地: ${localImageId}`);
  
  // 返回本地图片 ID，格式为 local:{id}
  return `local:${localImageId}`;
};

/**
 * 调用图片生成 API
 */
export const callImageApi = async (
  options: ImageGenerateOptions,
  model?: ImageModelDefinition
): Promise<string> => {
  // 获取当前激活的模型
  const activeModel = model || getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  // 获取 API 配置
  const apiKey = getApiKeyForModel(activeModel.id);
  if (!apiKey) {
    throw new ApiKeyError('API Key 缺失，请在设置中配置 API Key');
  }
  
  let apiBase = getApiBaseUrlForModel(activeModel.id);
  
  console.log('=== [ImageAdapter] API 调用详情 ===');
  console.log('[模型 ID]', activeModel.id);
  console.log('[模型名称]', activeModel.name);
  console.log('[提供商]', activeModel.providerId);
  console.log('[API 端点]', apiBase);
  console.log('[参考图数量]', options.referenceImages?.length || 0);

  // 根据提供商选择不同的 API
  if (isBigModelProvider(activeModel)) {
    // 开发环境使用代理
    apiBase = '/bigmodel';
    console.log('[API 类型] BigModel CogView');
    return callCogViewApi(options, activeModel, apiKey, apiBase);
  } else {
    console.log('[API 类型] Gemini');
    return callGeminiApi(options, activeModel, apiKey, apiBase);
  }
};

/**
 * 检查宽高比是否支持
 */
export const isAspectRatioSupported = (
  aspectRatio: AspectRatio,
  model?: ImageModelDefinition
): boolean => {
  const activeModel = model || getActiveImageModel();
  if (!activeModel) return false;
  
  return activeModel.params.supportedAspectRatios.includes(aspectRatio);
};
