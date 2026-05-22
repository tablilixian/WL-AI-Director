/**
 * 图片模型适配器
 * 处理 Gemini Image API 和 BigModel CogView API
 */

import { ImageModelDefinition, ImageGenerateOptions, AspectRatio } from '../../types/model';
import { getApiKeyForModel, getApiBaseUrlForModel, getActiveImageModel, getProviderById } from '../modelRegistry';
import { enhanceWithQualityTags } from '../ai/promptConstants';
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
 * 检查是否为 Drama Backend 提供商
 */
const isDramaBackendProvider = (model: ImageModelDefinition): boolean => {
  const provider = getProviderById(model.providerId);
  return provider?.id === 'wldrama' || model.providerId === 'wldrama';
};

/**
 * 耗时测量辅助
 */
const measureTime = <T>(label: string, traceId: string, fn: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  return fn().then(result => {
    const elapsed = Date.now() - start;
    console.log(`[I2I:${traceId}] ⏱ ${label}: ${elapsed}ms`);
    return result;
  }).catch(err => {
    const elapsed = Date.now() - start;
    console.error(`[I2I:${traceId}] ⏱ ${label}: ${elapsed}ms (失败)`);
    throw err;
  });
};

/**
 * 调用 BigModel CogView API
 */
const callCogViewApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiKey: string,
  apiBase: string,
  traceId: string
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
  
  const finalPrompt = enhanceWithQualityTags(options.prompt);

  console.log(`[I2I:${traceId}] 提供商: BigModel CogView`);
  console.log(`[I2I:${traceId}] 注意: BigModel 不支持参考图，降级为文生图`);
  console.log(`[I2I:${traceId}] 请求模型: ${apiModel}, 尺寸: ${size}`);
  console.log(`[I2I:${traceId}] ✨ Prompt 质量增强: ${finalPrompt !== options.prompt ? '已追加质量标签' : '用户已包含质量词，跳过'}`);
  
  const requestBody: any = {
    model: apiModel,
    prompt: finalPrompt,
    size,
  };
  
  const response = await measureTime('CogView API 调用', traceId, () =>
    retryOperation(async () => {
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
    })
  );

  // BigModel 返回图片 URL，需要下载并上传到 Supabase Storage
  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error('图片生成失败：未能从响应中提取图片 URL');
  }

  console.log(`[I2I:${traceId}] CogView 响应图片URL: ${imageUrl}`);

  // 开发环境使用代理下载图片以避免 CORS 问题
  const downloadUrl = import.meta.env.DEV 
    ? `/proxy-image/${encodeURIComponent(imageUrl)}`
    : imageUrl;

  const imageBlob = await measureTime('下载生成图片', traceId, async () => {
    const imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) {
      throw new Error(`图片下载失败: ${imageResponse.status}`);
    }
    return await imageResponse.blob();
  });
  
  console.log(`[I2I:${traceId}] 图片下载成功，大小: ${(imageBlob.size / 1024).toFixed(1)}KB`);
  
  // 保存到本地 IndexedDB
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[I2I:${traceId}] 图片已保存到 IndexedDB: ${localImageId}`);
  
  // 返回本地图片 ID，格式为 local:{id}
  return `local:${localImageId}`;
};

/**
 * 调用 Drama Backend API (文生图/图生图)
 */
const callDramaBackendApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiBase: string,
  traceId: string
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  
  // 尺寸映射
  const sizeMap: Record<AspectRatio, { width: number; height: number }> = {
    '16:9': { width: 1024, height: 576 },
    '9:16': { width: 576, height: 1024 },
    '1:1': { width: 768, height: 768 },
  };
  const size = sizeMap[aspectRatio] || { width: 1024, height: 720 };
  
  const hasReferenceImages = options.referenceImages && options.referenceImages.length > 0;
  const endpoint = hasReferenceImages 
    ? '/api/v1/generate/image2image' 
    : '/api/v1/generate/txt2image';
  
  const finalPrompt = hasReferenceImages
    ? options.prompt
    : enhanceWithQualityTags(options.prompt);

  const requestBody: any = {
    prompt: finalPrompt,
    width: size.width,
    height: size.height,
  };
  
  console.log(`[I2I:${traceId}] 阶段 3/5 - 调用提供商 API`);
  console.log(`[I2I:${traceId}] 提供商: Drama Backend (WLDrama)`);
  console.log(`[I2I:${traceId}] 端点: ${endpoint}`);
  console.log(`[I2I:${traceId}] 尺寸: ${size.width}x${size.height}`);
  console.log(`[I2I:${traceId}] 图生图模式: ${hasReferenceImages ? '是' : '否（文生图）'}`);
  if (!hasReferenceImages) {
    console.log(`[I2I:${traceId}] ✨ Prompt 质量增强: ${finalPrompt !== options.prompt ? '已追加质量标签' : '用户已包含质量词，跳过'}`);
  }
  
  if (hasReferenceImages && options.referenceImages) {
    console.log(`[I2I:${traceId}] 开始上传 ${options.referenceImages.length} 张参考图到 Drama Backend...`);
    
    for (let i = 0; i < options.referenceImages.length && i < 3; i++) {
      const imgKey = `image${i + 1}`;
      const imageUrl = options.referenceImages[i];
      
      const filename = await measureTime(`上传参考图 ${imgKey}`, traceId, () =>
        uploadImageToDramaBackend(imageUrl, apiBase, traceId)
      );
      requestBody[imgKey] = filename;
      console.log(`[I2I:${traceId}] 参考图 ${imgKey} 上传成功 -> filename: ${filename}`);
    }
  }
  
  console.log(`[I2I:${traceId}] 请求远端大模型参数:`, JSON.stringify(requestBody, null, 2));
  console.log(`[I2I:${traceId}] 请求端点: ${apiBase}${endpoint}`);
  
  const response = await measureTime('Drama Backend 图片生成', traceId, () =>
    retryOperation(async () => {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    })
  );

  const imageUrl = response.full_url;
  if (!imageUrl) {
    throw new Error('图片生成失败：未能从响应中获取图片 URL');
  }

  console.log(`[I2I:${traceId}] Drama Backend 返回图片URL: ${imageUrl}`);

  // 开发环境：将图片 URL 转换为代理路径
  let downloadUrl = imageUrl;
  if (import.meta.env.DEV && imageUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = imageUrl.replace('http://117.50.108.73:8082', '/drama-api');
    console.log(`[I2I:${traceId}] 开发环境使用代理下载: ${downloadUrl}`);
  }

  const imageBlob = await measureTime('下载生成图片', traceId, async () => {
    const imageResponse = await fetch(downloadUrl);
    if (!imageResponse.ok) {
      throw new Error(`图片下载失败: ${imageResponse.status}`);
    }
    return await imageResponse.blob();
  });
  
  console.log(`[I2I:${traceId}] 图片下载成功，大小: ${(imageBlob.size / 1024).toFixed(1)}KB`);
  
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[I2I:${traceId}] 阶段 4/5 - 图片已保存到 IndexedDB: ${localImageId}`);
  
  return `local:${localImageId}`;
};

/**
 * 解析任意格式图片 URL 为 Blob
 */
const resolveImageToBlob = async (imageUrl: string): Promise<Blob> => {
  if (imageUrl.startsWith('data:')) {
    const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) throw new Error('无效的 Base64 图片格式');
    const mimeType = base64Match[1];
    const binaryString = atob(base64Match[2]);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
  
  if (imageUrl.startsWith('local:')) {
    const localId = imageUrl.replace('local:', '');
    const blob = await imageStorageService.getImage(localId);
    if (!blob) throw new Error(`本地图片不存在: ${localId}`);
    return blob;
  }
  
  if (imageUrl.startsWith('blob:')) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Blob URL 读取失败: ${response.status}`);
    return await response.blob();
  }
  
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`远程图片下载失败: ${response.status}`);
    return await response.blob();
  }
  
  throw new Error(`不支持的图片 URL 格式: ${imageUrl}`);
};

/**
 * 上传图片到 Drama Backend
 * 无论输入什么格式（data: / local: / blob: / http），统一转为 Blob 上传
 * 返回服务器上的 filename，用于后续 image2image 请求
 */
const uploadImageToDramaBackend = async (
  imageUrl: string,
  apiBase: string,
  traceId?: string
): Promise<string> => {
  const blob = await resolveImageToBlob(imageUrl);
  
  if (traceId) {
    console.log(`[I2I:${traceId}]   解析图片成功, Blob大小: ${(blob.size / 1024).toFixed(1)}KB, 类型: ${blob.type}`);
  }
  
  const formData = new FormData();
  formData.append('file', blob, 'reference.png');
  
  const res = await fetch(`${apiBase}/api/v1/generate/uploadimage`, {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
    throw new Error(`图片上传失败: ${res.status}`);
  }
  
  const data = await res.json();
  
  if (traceId) {
    console.log(`[I2I:${traceId}]   上传响应:`, JSON.stringify(data));
  }
  
  // 兼容多种响应格式：{ filename: "xxx" } 或 { data: { filename: "xxx" } } 或 { success: true, filename: "xxx" }
  const filename = data.filename || data.data?.filename || data.file || data.name;
  if (!filename) {
    throw new Error(`图片上传成功但响应中未找到 filename: ${JSON.stringify(data)}`);
  }
  
  return filename;
};

/**
 * 调用 Gemini Image API
 */
const callGeminiApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiKey: string,
  apiBase: string,
  traceId: string
): Promise<string> => {
  const apiModel = model.apiModel || model.id;
  const endpoint = model.endpoint || `/v1beta/models/${apiModel}:generateContent`;
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  
  console.log(`[I2I:${traceId}] 阶段 3/5 - 调用提供商 API`);
  console.log(`[I2I:${traceId}] 提供商: Gemini (${apiModel})`);
  console.log(`[I2I:${traceId}] API端点: ${apiBase}${endpoint}`);
  console.log(`[I2I:${traceId}] 宽高比: ${aspectRatio}`);
  
  // 构建提示词
  let finalPrompt = options.prompt;
  
  // 如果有参考图，添加一致性指令
  if (options.referenceImages && options.referenceImages.length > 0) {
    console.log(`[I2I:${traceId}] 检测到 ${options.referenceImages.length} 张参考图，注入字符一致性指令`);
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
    
    console.log(`[I2I:${traceId}] 最终提示词长度: ${finalPrompt.length} 字符`);
    console.log(`[I2I:${traceId}] 用户原始提示词: "${options.prompt}"`);
  }

  // 构建请求 parts
  const parts: any[] = [{ text: finalPrompt }];

  // 添加参考图片
  if (options.referenceImages) {
    console.log(`[I2I:${traceId}] 开始解析参考图片 (local: → inlineData)...`);
    for (const imgUrl of options.referenceImages) {
      // 处理 data: 格式
      const match = imgUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      if (match) {
        console.log(`[I2I:${traceId}] 参考图为 Base64 格式, 类型: ${match[1]}, 数据长度: ${match[2].length}`);
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
        continue;
      }
      
      // 处理 local: 格式
      if (imgUrl.startsWith('local:')) {
        const localId = imgUrl.replace('local:', '');
        console.log(`[I2I:${traceId}] 从 IndexedDB 读取本地图片: ${localId}`);
        try {
          const blob = await imageStorageService.getImage(localId);
          if (blob) {
            console.log(`[I2I:${traceId}] 本地图片读取成功, 大小: ${(blob.size / 1024).toFixed(1)}KB, 类型: ${blob.type}`);
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            const base64Match = base64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            if (base64Match) {
              console.log(`[I2I:${traceId}] 图片已转为 Base64, 数据长度: ${base64Match[2].length}`);
              parts.push({
                inlineData: {
                  mimeType: base64Match[1],
                  data: base64Match[2],
                },
              });
            }
          } else {
            console.warn(`[I2I:${traceId}] 本地图片不存在: ${localId}`);
          }
        } catch (error) {
          console.error(`[I2I:${traceId}] 解析本地图片失败:`, error);
        }
        continue;
      }
      
      // 处理 blob: 格式（临时对象 URL）
      if (imgUrl.startsWith('blob:')) {
        console.log(`[I2I:${traceId}] 检测到 blob: URL，尝试 fetch 读取...`);
        try {
          const response = await fetch(imgUrl);
          const blob = await response.blob();
          console.log(`[I2I:${traceId}] blob 读取成功, 大小: ${(blob.size / 1024).toFixed(1)}KB, 类型: ${blob.type}`);
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const base64Match = base64.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (base64Match) {
            console.log(`[I2I:${traceId}] blob 已转为 Base64, 数据长度: ${base64Match[2].length}`);
            parts.push({
              inlineData: {
                mimeType: base64Match[1],
                data: base64Match[2],
              },
            });
          }
        } catch (error) {
          console.error(`[I2I:${traceId}] blob URL 读取失败:`, error);
        }
        continue;
      }
    }
    console.log(`[I2I:${traceId}] 参考图片解析完成, 共 ${parts.length - 1} 张图片附加到请求`);
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
    console.log(`[I2I:${traceId}] 设置宽高比: ${aspectRatio}`);
  }

  console.log(`[I2I:${traceId}] 发送 Gemini API 请求 (parts: ${parts.length}, ${parts.filter(p => p.inlineData).length} 张图片)...`);

  // 调用 API
  const response = await measureTime('Gemini API 图片生成', traceId, () =>
    retryOperation(async () => {
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
    })
  );

  console.log(`[I2I:${traceId}] Gemini 响应成功`);
  console.log(`[I2I:${traceId}] 候选数量: ${response.candidates?.length || 0}`);

  // 提取 base64 图片
  const candidates = response.candidates || [];
  let base64Image: string | undefined;
  
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    for (const part of candidates[0].content.parts) {
      if (part.inlineData) {
        base64Image = `data:image/png;base64,${part.inlineData.data}`;
        console.log(`[I2I:${traceId}] 从响应中提取到图片, Base64长度: ${part.inlineData.data.length}`);
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

  console.log(`[I2I:${traceId}] 图片解码完成, Blob大小: ${(imageBlob.size / 1024).toFixed(1)}KB`);

  // 保存到本地 IndexedDB
  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);
  
  console.log(`[I2I:${traceId}] 阶段 4/5 - 图片已保存到 IndexedDB: ${localImageId}`);
  
  // 返回本地图片 ID，格式为 local:{id}
  return `local:${localImageId}`;
};

/**
 * 调用图片生成 API
 */
export const callImageApi = async (
  options: ImageGenerateOptions,
  model?: ImageModelDefinition,
  traceId?: string
): Promise<string> => {
  // 如果没有 traceId 则生成一个（兼容直接调用场景）
  const tid = traceId || `i2i_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  // 获取当前激活的模型
  const activeModel = model || getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  // 获取 API 配置
  const apiKey = getApiKeyForModel(activeModel.id);
  
  let apiBase = getApiBaseUrlForModel(activeModel.id);
  
  const isImageToImage = options.referenceImages && options.referenceImages.length > 0;
  
  console.log(`\n[I2I:${tid}] 阶段 2/5 - ImageAdapter 分发`);
  console.log(`[I2I:${tid}] 模型: ${activeModel.name} (${activeModel.id})`);
  console.log(`[I2I:${tid}] 提供商: ${activeModel.providerId}`);
  console.log(`[I2I:${tid}] API基础地址: ${apiBase}`);
  console.log(`[I2I:${tid}] 图生图: ${isImageToImage ? '是' : '否（文生图）'}`);
  console.log(`[I2I:${tid}] 参考图数量: ${options.referenceImages?.length || 0}`);

  // 根据提供商选择不同的 API
  if (isDramaBackendProvider(activeModel)) {
    console.log(`[I2I:${tid}] → 路由到: Drama Backend (专用 image2image 端点)`);
    // 开发环境使用 Vite 代理解决 CORS，生产环境直接使用服务端地址
    const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;
    return callDramaBackendApi(options, activeModel, baseUrl, tid);
  } else if (isBigModelProvider(activeModel)) {
    if (!apiKey) {
      throw new ApiKeyError('API Key 缺失，请在设置中配置 API Key');
    }
    apiBase = '/bigmodel';
    console.log(`[I2I:${tid}] → 路由到: BigModel CogView (注意: 不支持参考图)`);
    return callCogViewApi(options, activeModel, apiKey, apiBase, tid);
  } else {
    if (!apiKey) {
      throw new ApiKeyError('API Key 缺失，请在设置中配置 API Key');
    }
    console.log(`[I2I:${tid}] → 路由到: Gemini Image (inlineData 方式传入参考图)`);
    return callGeminiApi(options, activeModel, apiKey, apiBase, tid);
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
