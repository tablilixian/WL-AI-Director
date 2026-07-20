/**
 * 图片模型适配器
 * 处理 Gemini Image API 和 BigModel CogView API
 */

import { ImageModelDefinition, ImageGenerateOptions, AspectRatio } from '../../types/model';
import { getApiKeyForModel, getApiBaseUrlForModel, getActiveImageModel, getProviderById } from '../modelRegistry';
import { enhanceWithQualityTags } from '../ai/promptConstants';
import { ApiKeyError } from './chatAdapter';
import { useAuthStore } from '../../src/stores/authStore';
import { imageStorageService, generateImageId, videoStorageService } from '../imageStorageService';
import {
  IMAGE_COGVIEW_SIZE, IMAGE_COGVIEW_FALLBACK,
  IMAGE_DRAMA_SIZE, IMAGE_DRAMA_FALLBACK,
  IMAGE_IPA_SIZE, IMAGE_IPA_FALLBACK,
  IMAGE_ANIME_SIZE, IMAGE_ANIME_FALLBACK,
  STORYBOARD_ITEM_WIDTH,
  IMAGE_SPLITE_GRID,
  VIDEO_MSR_DEFAULT,
  VIDEO_MKR_DEFAULT,
  VIDEO_MKR_GRID_DEFAULT,
} from '../../config/sizeConfig';

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
  
  const size = IMAGE_COGVIEW_SIZE[aspectRatio as keyof typeof IMAGE_COGVIEW_SIZE] || IMAGE_COGVIEW_FALLBACK;
  
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

  if (options.negativePrompt) {
    requestBody.negative_prompt = options.negativePrompt;
  }
  
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
  
  const size = IMAGE_DRAMA_SIZE[aspectRatio as keyof typeof IMAGE_DRAMA_SIZE] || IMAGE_DRAMA_FALLBACK;
  
  const hasReferenceImages = options.referenceImages && options.referenceImages.length > 0;
  const endpoint = hasReferenceImages 
    ? '/api/v1/generate/image2image' 
    : '/api/v1/generate/txt2image';
  
  let finalPrompt = hasReferenceImages
    ? options.prompt
    : enhanceWithQualityTags(options.prompt);

  if (options.autoEnhancePrompt) {
    try {
      console.log(`[I2I:${traceId}] 自动增强提示词...`);
      const enhanced = await callDramaBackendPromptEnhanceApi(options.prompt, traceId);
      if (enhanced) {
        finalPrompt = enhanced;
        console.log(`[I2I:${traceId}] 提示词已自动增强`);
      }
    } catch (e) {
      console.warn(`[I2I:${traceId}] 自动增强失败，使用原始提示词:`, e);
    }
  }

  const requestBody: any = {
    prompt: finalPrompt,
    width: size.width,
    height: size.height,
  };

  if (options.negativePrompt) {
    requestBody.negative_prompt = options.negativePrompt;
  }
  
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
export const uploadImageToDramaBackend = async (
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
    let errorMsg = `图片上传失败: ${res.status}`;
    try {
      const errorBody = await res.text();
      console.error(`[${traceId || 'upload'}] 上传失败响应体:`, errorBody);
      errorMsg += ` - ${errorBody}`;
    } catch (e) {
      // ignore
    }
    throw new Error(errorMsg);
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
 * 调用 Drama Backend 角色立绘图生成 API (image2character)
 * 基于角色设计图生成角色立绘图（三视图）
 */
const callDramaBackendCharacterApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiBase: string,
  traceId: string
): Promise<string> => {
  const startTime = Date.now();

  console.log(`[I2I:${traceId}] 阶段 3/5 - 调用角色立绘图 API`);
  console.log(`[I2I:${traceId}] 提供商: Drama Backend (WLDrama)`);
  console.log(`[I2I:${traceId}] 端点: /api/v1/generate/image2character`);

  // 上传参考图（角色设计图）
  let imageFilename = '';
  if (options.referenceImages && options.referenceImages.length > 0) {
    const imageUrl = options.referenceImages[0];
    console.log(`[I2I:${traceId}] 上传角色设计图到 Drama Backend...`);
    imageFilename = await measureTime('上传角色设计图', traceId, () =>
      uploadImageToDramaBackend(imageUrl, apiBase, traceId)
    );
    console.log(`[I2I:${traceId}] 角色设计图上传成功 -> filename: ${imageFilename}`);
  } else {
    throw new Error('角色立绘图生成需要提供角色设计图');
  }

  const requestBody = { image: imageFilename };

  console.log(`[I2I:${traceId}] 请求参数:`, JSON.stringify(requestBody));

  const response = await measureTime('Drama Backend 角色立绘图生成', traceId, () =>
    retryOperation(async () => {
      const res = await fetch(`${apiBase}/api/v1/generate/image2character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    throw new Error('角色立绘图生成失败：未能从响应中获取图片 URL');
  }

  console.log(`[I2I:${traceId}] Drama Backend 返回图片URL: ${imageUrl}`);

  // 开发环境使用代理下载
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
 * 调用 Drama Backend 分镜生成 API (image2storyboard)
 * 根据文本描述生成分镜图像（格子分镜）
 */
const callDramaBackendStoryboardApi = async (
  options: ImageGenerateOptions,
  model: ImageModelDefinition,
  apiBase: string,
  traceId: string
): Promise<string> => {
  console.log(`[I2I:${traceId}] 阶段 3/5 - 调用分镜生成 API`);
  console.log(`[I2I:${traceId}] 提供商: Drama Backend (WLDrama)`);
  console.log(`[I2I:${traceId}] 端点: /api/v1/generate/image2storyboard`);

  // 上传参考图（可选）
  let imageFilename = '';
  if (options.referenceImages && options.referenceImages.length > 0) {
    const imageUrl = options.referenceImages[0];
    console.log(`[I2I:${traceId}] 上传参考图到 Drama Backend...`);
    imageFilename = await measureTime('上传参考图', traceId, () =>
      uploadImageToDramaBackend(imageUrl, apiBase, traceId)
    );
    console.log(`[I2I:${traceId}] 参考图上传成功 -> filename: ${imageFilename}`);
  }

  const requestBody: any = {
    prompt: options.prompt,
    gridnum: options.gridnum || 4,
    width: options.itemWidth || STORYBOARD_ITEM_WIDTH,
  };
  if (imageFilename) {
    requestBody.image = imageFilename;
  }

  console.log(`[I2I:${traceId}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await measureTime('Drama Backend 分镜生成', traceId, () =>
    retryOperation(async () => {
      const res = await fetch(`${apiBase}/api/v1/generate/image2storyboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    throw new Error('分镜生成失败：未能从响应中获取图片 URL');
  }

  console.log(`[I2I:${traceId}] Drama Backend 返回图片URL: ${imageUrl}`);

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
 * 调用 Drama Backend 图像分割网格 API (image2splitegrid)
 * 将图像按照指定的行列数分割成网格，返回分割后的多张图片
 */
export const callDramaBackendSpliteGridApi = async (
  options: ImageGenerateOptions,
  traceId?: string,
  selectedIndices?: number[]
): Promise<string[]> => {
  const tid = traceId || `sg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[SG:${tid}] 调用图像分割网格 API`);
  console.log(`[SG:${tid}] 端点: /api/v1/generate/image2splitegrid`);
  console.log(`[SG:${tid}] API基础地址: ${apiBase}`);

  // 上传参考图（必填）
  let imageFilename = '';
  if (options.referenceImages && options.referenceImages.length > 0) {
    const imageUrl = options.referenceImages[0];
    console.log(`[SG:${tid}] 上传参考图到 Drama Backend...`);
    imageFilename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
    console.log(`[SG:${tid}] 参考图上传成功 -> filename: ${imageFilename}`);
  } else {
    throw new Error('图像分割网格需要提供参考图像');
  }

  const requestBody: any = {
    row: options.spliteGridRow || 2,
    column: options.spliteGridColumn || 2,
    target_width: options.spliteGridTargetWidth || IMAGE_SPLITE_GRID.targetWidth,
    target_height: options.spliteGridTargetHeight || IMAGE_SPLITE_GRID.targetHeight,
    image: imageFilename,
  };

  console.log(`[SG:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2splitegrid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const images = response.images;
  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new Error(`图像分割网格失败：响应中未找到图片列表: ${JSON.stringify(response)}`);
  }

  console.log(`[SG:${tid}] Drama Backend 返回 ${images.length} 张分割图片`);

  // 只下载需要的格子（用户选中 + 占位保留未选中）
  const selectedSet = selectedIndices ? new Set(selectedIndices) : null;
  const localUrls: (string | null)[] = [];

  for (let i = 0; i < images.length; i++) {
    // 如果指定了选中索引且当前格不在选中列表，跳过下载，留 null 占位
    if (selectedSet && !selectedSet.has(i)) {
      localUrls.push(null);
      console.log(`[SG:${tid}] 第 ${i + 1} 格未选中，跳过下载`);
      continue;
    }

    const item = images[i];
    const imageUrl = item.url;

    if (!imageUrl) {
      console.warn(`[SG:${tid}] 第 ${i + 1} 张图片无 URL，跳过`);
      localUrls.push(null);
      continue;
    }

    let downloadUrl = imageUrl;
    if (import.meta.env.DEV && imageUrl.startsWith('http://117.50.108.73:8082')) {
      downloadUrl = imageUrl.replace('http://117.50.108.73:8082', '/drama-api');
    }

    const imageBlob = await fetch(downloadUrl).then(r => {
      if (!r.ok) throw new Error(`图片下载失败: ${r.status}`);
      return r.blob();
    });

    const localImageId = generateImageId();
    await imageStorageService.saveImage(localImageId, imageBlob);
    localUrls.push(`local:${localImageId}`);

    console.log(`[SG:${tid}] 第 ${i + 1}/${images.length} 张分割图片已保存: ${localImageId}`);
  }

  const downloaded = localUrls.filter(Boolean).length;
  console.log(`[SG:${tid}] 图像分割网格完成，共下载 ${downloaded}/${localUrls.length} 张图片`);
  return localUrls as string[];
};

/**
 * 调用 Drama Backend 图像修复 API (image2inpaint)
 * 对图像进行修复或编辑（Inpainting），返回修复后的图片
 */
export const callDramaBackendInpaintApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `inp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[INP:${tid}] 调用图像修复 API`);
  console.log(`[INP:${tid}] 端点: /api/v1/generate/image2inpaint`);
  console.log(`[INP:${tid}] API基础地址: ${apiBase}`);

  // 上传参考图（要修复的图像）
  let imageFilename = '';
  if (options.referenceImages && options.referenceImages.length > 0) {
    const imageUrl = options.referenceImages[0];
    console.log(`[INP:${tid}] 上传待修复图像到 Drama Backend...`);
    imageFilename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
    console.log(`[INP:${tid}] 图像上传成功 -> filename: ${imageFilename}`);
  } else {
    throw new Error('图像修复需要提供待修复的图像');
  }

  const requestBody: any = {
    prompt: options.prompt,
    image: imageFilename,
  };

  console.log(`[INP:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2inpaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const imageUrl = response.full_url;
  if (!imageUrl) {
    throw new Error(`图像修复失败：响应中未找到图片 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[INP:${tid}] Drama Backend 返回图片URL: ${imageUrl}`);

  let downloadUrl = imageUrl;
  if (import.meta.env.DEV && imageUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = imageUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const imageBlob = await fetch(downloadUrl).then(r => {
    if (!r.ok) throw new Error(`图片下载失败: ${r.status}`);
    return r.blob();
  });

  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);

  console.log(`[INP:${tid}] 修复后图片已保存: ${localImageId}`);
  return `local:${localImageId}`;
};

/**
 * 调用 Drama Backend 360° HDRI 图像生成 API (image2360hdri)
 * 将输入图像转换为 360° 全景 HDRI 图像
 */
export const callDramaBackend360HdriApi = async (
  imageUrl?: string,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `hdri_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[HDRI:${tid}] 调用 360° HDRI 图像生成 API`);
  console.log(`[HDRI:${tid}] 端点: /api/v1/generate/image2360hdri`);
  console.log(`[HDRI:${tid}] API基础地址: ${apiBase}`);

  const requestBody: any = {};

  if (imageUrl) {
    console.log(`[HDRI:${tid}] 上传参考图像到 Drama Backend...`);
    const filename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
    requestBody.image = filename;
    console.log(`[HDRI:${tid}] 参考图像上传成功 -> filename: ${filename}`);
  }

  console.log(`[HDRI:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2360hdri`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const imageUrl_ = response.full_url;
  if (!imageUrl_) {
    throw new Error(`360° HDRI 生成失败：响应中未找到图片 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[HDRI:${tid}] Drama Backend 返回图片URL: ${imageUrl_}`);

  let downloadUrl = imageUrl_;
  if (import.meta.env.DEV && imageUrl_.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = imageUrl_.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const imageBlob = await fetch(downloadUrl).then(r => {
    if (!r.ok) throw new Error(`图片下载失败: ${r.status}`);
    return r.blob();
  });

  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);

  console.log(`[HDRI:${tid}] 360° HDRI 图片已保存: ${localImageId}`);
  return `local:${localImageId}`;
};

/**
 * 调用 Drama Backend 风格迁移 API (image2styletransfer)
 * 基于参考图像进行风格迁移，将 image2 的风格迁移到 image1 上
 */
export const callDramaBackendStyleTransferApi = async (
  targetImageUrl: string,
  styleImageUrl: string,
  traceId?: string,
  prompt?: string,
  enhance?: boolean,
): Promise<string> => {
  const tid = traceId || `st_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[ST:${tid}] 调用风格迁移 API`);
  console.log(`[ST:${tid}] 端点: /api/v1/generate/image2styletransfer`);
  console.log(`[ST:${tid}] API基础地址: ${apiBase}`);

  const targetFilename = await uploadImageToDramaBackend(targetImageUrl, baseUrl, tid);
  console.log(`[ST:${tid}] 目标图像上传成功 -> filename: ${targetFilename}`);

  const styleFilename = await uploadImageToDramaBackend(styleImageUrl, baseUrl, tid);
  console.log(`[ST:${tid}] 风格参考图上传成功 -> filename: ${styleFilename}`);

  const requestBody: any = {
    image1: targetFilename,
    image2: styleFilename,
  };

  if (prompt) {
    requestBody.prompt = prompt;
    console.log(`[ST:${tid}] 增强提示词: ${prompt}`);
  }

  if (enhance !== undefined) {
    requestBody.enhance = enhance;
    console.log(`[ST:${tid}] 增强风格迁移效果: ${enhance}`);
  }

  console.log(`[ST:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2styletransfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const imageUrl = response.full_url;
  if (!imageUrl) {
    throw new Error(`风格迁移失败：响应中未找到图片 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[ST:${tid}] Drama Backend 返回图片URL: ${imageUrl}`);

  let downloadUrl = imageUrl;
  if (import.meta.env.DEV && imageUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = imageUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const imageBlob = await fetch(downloadUrl).then(r => {
    if (!r.ok) throw new Error(`图片下载失败: ${r.status}`);
    return r.blob();
  });

  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);

  console.log(`[ST:${tid}] 风格迁移图片已保存: ${localImageId}`);
  return `local:${localImageId}`;
};

/**
 * 调用 Drama Backend IPA 风格迁移 API (image2ipastyletransfer)
 * 基于参考图像进行 IPA 风格迁移，支持多个参考图像的融合
 */
export const callDramaBackendIPAStyleTransferApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `ipa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[IPA:${tid}] 调用 IPA 风格迁移 API`);
  console.log(`[IPA:${tid}] 端点: /api/v1/generate/image2ipastyletransfer`);
  console.log(`[IPA:${tid}] API基础地址: ${apiBase}`);

  const size = IMAGE_IPA_SIZE[(options.aspectRatio || '16:9') as keyof typeof IMAGE_IPA_SIZE] || IMAGE_IPA_FALLBACK;

  const requestBody: any = {
    prompt: options.prompt,
    width: size.width,
    height: size.height,
  };

  if (options.referenceImages) {
    for (let i = 0; i < Math.min(options.referenceImages.length, 3); i++) {
      const imgKey = `image${i + 1}`;
      const imageUrl = options.referenceImages[i];
      const filename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
      requestBody[imgKey] = filename;
      console.log(`[IPA:${tid}] 参考图 ${imgKey} 上传成功 -> filename: ${filename}`);
    }
  }

  if (options.refImage) {
    const filename = await uploadImageToDramaBackend(options.refImage, baseUrl, tid);
    requestBody.ref_image = filename;
    console.log(`[IPA:${tid}] 风格迁移参考图(ref_image)上传成功 -> filename: ${filename}`);
  }

  if (options.enhance !== undefined) {
    requestBody.enhance = options.enhance;
    console.log(`[IPA:${tid}] 增强风格迁移: ${options.enhance}`);
  }

  console.log(`[IPA:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2ipastyletransfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const imageUrl = response.full_url;
  if (!imageUrl) {
    throw new Error(`IPA 风格迁移失败：响应中未找到图片 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[IPA:${tid}] Drama Backend 返回图片URL: ${imageUrl}`);

  let downloadUrl = imageUrl;
  if (import.meta.env.DEV && imageUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = imageUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const imageBlob = await fetch(downloadUrl).then(r => {
    if (!r.ok) throw new Error(`图片下载失败: ${r.status}`);
    return r.blob();
  });

  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);

  console.log(`[IPA:${tid}] IPA 风格迁移图片已保存: ${localImageId}`);
  return `local:${localImageId}`;
};

/**
 * 调用 Drama Backend 动漫风格生成 API (txt2imageanime)
 * 生成动漫风格图像
 */
export const callDramaBackendAnimeApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `anime_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[ANIME:${tid}] 调用动漫风格生成 API`);
  console.log(`[ANIME:${tid}] 端点: /api/v1/generate/txt2imageanime`);
  console.log(`[ANIME:${tid}] API基础地址: ${apiBase}`);

  const size = IMAGE_ANIME_SIZE[(options.aspectRatio || '16:9') as keyof typeof IMAGE_ANIME_SIZE] || IMAGE_ANIME_FALLBACK;

  const requestBody: any = {
    prompt: options.prompt,
    width: size.width,
    height: size.height,
  };

  if (options.negativePrompt) {
    requestBody.negative_prompt = options.negativePrompt;
  }

  console.log(`[ANIME:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/txt2imageanime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const imageUrl = response.full_url;
  if (!imageUrl) {
    throw new Error(`动漫风格生成失败：响应中未找到图片 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[ANIME:${tid}] Drama Backend 返回图片URL: ${imageUrl}`);

  let downloadUrl = imageUrl;
  if (import.meta.env.DEV && imageUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = imageUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const imageBlob = await fetch(downloadUrl).then(r => {
    if (!r.ok) throw new Error(`图片下载失败: ${r.status}`);
    return r.blob();
  });

  const localImageId = generateImageId();
  await imageStorageService.saveImage(localImageId, imageBlob);

  console.log(`[ANIME:${tid}] 动漫风格图片已保存: ${localImageId}`);
  return `local:${localImageId}`;
};

/**
 * 调用 Drama Backend 视觉语言推理 API (image2vl)
 * 基于图像和文本提示进行视觉语言模型推理，返回文本输出
 */
export const callDramaBackendVLApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `vl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[VL:${tid}] 调用视觉语言推理 API`);
  console.log(`[VL:${tid}] 端点: /api/v1/generate/image2vl`);
  console.log(`[VL:${tid}] API基础地址: ${apiBase}`);

  // 上传参考图（可选）
  let imageFilename = '';
  if (options.referenceImages && options.referenceImages.length > 0) {
    const imageUrl = options.referenceImages[0];
    console.log(`[VL:${tid}] 上传参考图到 Drama Backend...`);
    imageFilename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
    console.log(`[VL:${tid}] 参考图上传成功 -> filename: ${imageFilename}`);
  }

  const requestBody: any = {
    system_prompt: options.systemPrompt || 'You are a helpful assistant.',
    prompt: options.prompt,
  };
  if (imageFilename) {
    requestBody.image = imageFilename;
  }

  console.log(`[VL:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2vl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  if (!response.output) {
    throw new Error(`视觉语言推理失败：响应中未找到 output 字段: ${JSON.stringify(response)}`);
  }

  console.log(`[VL:${tid}] 推理完成，输出长度: ${response.output.length} 字符`);

  return response.output;
};

/**
 * 剧情推演接口类型
 */
export interface DeductionRequest {
  image: string;
  analysis_system_prompt?: string;
  analysis_prompt?: string;
  deduction_system_prompt?: string;
  deduction_prompt?: string;
}

export interface DeductionAnalysis {
  scene: string;
  composition: string;
  lighting: string;
  characters: string;
  mood: string;
  camera: string;
}

export interface DeductionResult {
  next_frame: string;
  rationale: string;
  key_elements: string[];
  changes: string[];
}

export interface DeductionResponse {
  analysis: DeductionAnalysis;
  deduction: DeductionResult;
}

const DEFAULT_ANALYSIS_SYSTEM_PROMPT = '你是一个专业的影视镜头分析师。请从电影摄影的角度分析这张画面。';
const DEFAULT_ANALYSIS_PROMPT = `请分析这张画面的以下要素，每项用一句话描述：
1. 场景：这是什么场景/环境？
2. 构图：镜头构图方式、主体位置
3. 光影：光源方向、光线质感、色调
4. 角色/主体：画面中的角色或主要视觉元素
5. 情绪/氛围：画面的情绪基调
6. 镜头语言：机位、焦段、运镜方式`;

const DEFAULT_DEDUCTION_SYSTEM_PROMPT = '你是一个专业的影视编剧。请基于当前帧的画面分析和剧情方向，推演下一帧的内容。';
const DEFAULT_DEDUCTION_PROMPT = `基于以上画面分析结果，推演下一帧的内容。要求：
1. 保持角色、场景、光影风格的一致性
2. 叙事要自然推进，有合理的动因
3. 明确描述构图变化和镜头运动
4. 输出结构化的推演结果`;

/**
 * 调用 Drama Backend 剧情推演 API (deduction)
 * 画面分析 + 剧情推演两步合一
 *
 * Step 1 (服务端): 用 analysis_system_prompt + analysis_prompt 调 image2vl 分析画面
 * Step 2 (服务端): 用分析结果 + deduction_system_prompt + deduction_prompt 调 LLM 推演剧情
 */
export const callDramaBackendDeductionApi = async (
  imageUrl: string,
  prompts?: {
    analysisSystemPrompt?: string;
    analysisPrompt?: string;
    deductionSystemPrompt?: string;
    deductionPrompt?: string;
  },
  traceId?: string
): Promise<DeductionResponse> => {
  const tid = traceId || `ded_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[DED:${tid}] 调用剧情推演 API`);
  console.log(`[DED:${tid}] 端点: /api/v1/generate/deduction`);

  const imageFilename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
  console.log(`[DED:${tid}] 图片上传成功 -> filename: ${imageFilename}`);

  const requestBody: DeductionRequest = {
    image: imageFilename,
    analysis_system_prompt: prompts?.analysisSystemPrompt || DEFAULT_ANALYSIS_SYSTEM_PROMPT,
    analysis_prompt: prompts?.analysisPrompt || DEFAULT_ANALYSIS_PROMPT,
    deduction_system_prompt: prompts?.deductionSystemPrompt || DEFAULT_DEDUCTION_SYSTEM_PROMPT,
    deduction_prompt: prompts?.deductionPrompt || DEFAULT_DEDUCTION_PROMPT,
  };

  console.log(`[DED:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/deduction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  if (!response.analysis || !response.deduction) {
    throw new Error(`剧情推演失败：响应结构不完整: ${JSON.stringify(response)}`);
  }

  console.log(`[DED:${tid}] 推演完成`);
  console.log(`[DED:${tid}] 画面分析:`, JSON.stringify(response.analysis, null, 2));
  console.log(`[DED:${tid}] 推演结果:`, JSON.stringify(response.deduction, null, 2));

  return response as DeductionResponse;
};

/**
 * 调用 Drama Backend 提示词增强 API (image2promptenhance)
 * 根据输入提示词生成更丰富的提示词
 */
export const callDramaBackendPromptEnhanceApi = async (
  prompt: string,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `pe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[PE:${tid}] 调用提示词增强 API`);
  console.log(`[PE:${tid}] 端点: /api/v1/generate/image2promptenhance`);
  console.log(`[PE:${tid}] API基础地址: ${apiBase}`);

  const requestBody: any = { prompt };

  console.log(`[PE:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2promptenhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  if (!response.output) {
    throw new Error(`提示词增强失败：响应中未找到 output 字段: ${JSON.stringify(response)}`);
  }

  console.log(`[PE:${tid}] 增强完成，输出长度: ${response.output.length} 字符`);
  console.log(`[PE:${tid}] 增强结果: ${response.output}`);

  return response.output;
};

/**
 * 调用 Drama Backend 图像转视频 MSR API (image2videomsr)
 * 基于图像生成视频（MSR 多帧超分辨率技术）
 * 返回保存后的本地 video: 引用
 */
export const callDramaBackendVideoMsrApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `vmsr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[VMSR:${tid}] 调用图像转视频 MSR API`);
  console.log(`[VMSR:${tid}] 端点: /api/v1/generate/image2videomsr`);

  const requestBody: any = {
    prompt: options.prompt,
    width: options.videoMsrWidth || VIDEO_MSR_DEFAULT.width,
    height: options.videoMsrHeight || VIDEO_MSR_DEFAULT.height,
    duration: options.videoMsrDuration || 5,
    fps: options.videoMsrFps || 30,
  };

  if (options.videoMsrBackground) {
    const bgFilename = await uploadImageToDramaBackend(options.videoMsrBackground, baseUrl, tid);
    requestBody.background = bgFilename;
    console.log(`[VMSR:${tid}] 背景图上传成功 -> filename: ${bgFilename}`);
  } else if (options.referenceImages && options.referenceImages.length > 0) {
    // 未指定 background 时，使用第一张参考图作为背景
    const bgFilename = await uploadImageToDramaBackend(options.referenceImages[0], baseUrl, tid);
    requestBody.background = bgFilename;
    console.log(`[VMSR:${tid}] 使用第一张参考图作为背景 -> filename: ${bgFilename}`);
  } else {
    throw new Error('图像转视频需要提供背景图像');
  }

  if (options.referenceImages) {
    for (let i = 0; i < Math.min(options.referenceImages.length, 4); i++) {
      const imgKey = `image${i + 1}`;
      const imageUrl = options.referenceImages[i];
      const filename = await uploadImageToDramaBackend(imageUrl, baseUrl, tid);
      requestBody[imgKey] = filename;
      console.log(`[VMSR:${tid}] 参考图 ${imgKey} 上传成功 -> filename: ${filename}`);
    }
  }

  console.log(`[VMSR:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2videomsr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`;
      try {
        const errorText = await res.text();
        console.error(`[VMSR:${tid}] 服务端响应 ${res.status}:`, errorText.slice(0, 500));
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error?.message || errorData.msg || errorData.detail || errorText.slice(0, 200);
          } catch {
            errorMessage = errorText.slice(0, 200);
          }
        }
      } catch {
        errorMessage = `HTTP ${res.status}`;
      }
      throw new Error(`[MSR] ${errorMessage}\n请求参数: prompt="${requestBody.prompt?.slice(0,50)}..." width=${requestBody.width} height=${requestBody.height}`);
    }

    return await res.json();
  });

  const videoUrl = response.full_url;
  if (!videoUrl) {
    throw new Error(`图像转视频失败：响应中未找到视频 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[VMSR:${tid}] Drama Backend 返回视频URL: ${videoUrl}`);

  let downloadUrl = videoUrl;
  if (import.meta.env.DEV && videoUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = videoUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const videoResponse = await fetch(downloadUrl);
  if (!videoResponse.ok) {
    throw new Error(`视频下载失败: ${videoResponse.status}`);
  }

  const videoBlob = await videoResponse.blob();

  const videoId = `vid_msr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await videoStorageService.saveVideo(videoId, videoBlob);

  console.log(`[VMSR:${tid}] 视频已保存: ${videoId}`);
  return `video:${videoId}`;
};

/**
 * 调用 Drama Backend 图像转视频 MKR API (image2videomkr)
 * 基于图像生成视频（MKR 多关键帧技术）
 * 返回保存后的本地 video: 引用
 */
export const callDramaBackendVideoMkrGridApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `vmkrg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[VMKRG:${tid}] 调用图像转视频 MKR Grid API`);
  console.log(`[VMKRG:${tid}] 端点: /api/v1/generate/image2videomkrgrid`);

  const requestBody: any = {
    prompt: options.prompt,
    width: options.videoMkrGridWidth || VIDEO_MKR_GRID_DEFAULT.width,
    height: options.videoMkrGridHeight || VIDEO_MKR_GRID_DEFAULT.height,
    duration: options.videoMkrGridDuration || 12,
    fps: options.videoMkrGridFps || 30,
    gridtype: options.videoMkrGridType || 4,
    frame_indexs: options.videoMkrGridFrameIndexs || [0, 0, 0, 0],
  };

  // 上传参考图片
  if (options.refImage) {
    const filename = await uploadImageToDramaBackend(options.refImage, baseUrl, tid);
    requestBody.image = filename;
    console.log(`[VMKRG:${tid}] 参考图上传成功 -> image: ${filename}`);
  }

  console.log(`[VMKRG:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 分钟超时

  let response: any;
  try {
    response = await retryOperation(async () => {
      const res = await fetch(`${baseUrl}/api/v1/generate/image2videomkrgrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}`;
        try {
          const errorText = await res.text();
          console.error(`[VMKRG:${tid}] 服务端响应 ${res.status}:`, errorText.slice(0, 500));
          if (errorText) {
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.error?.message || errorData.msg || errorData.detail || errorText.slice(0, 200);
            } catch {
              errorMessage = errorText.slice(0, 200);
            }
          }
        } catch {
          errorMessage = `HTTP ${res.status}`;
        }
        throw new Error(`[MKR Grid] ${errorMessage}\n请求参数: prompt="${requestBody.prompt?.slice(0,50)}..." width=${requestBody.width} height=${requestBody.height} gridtype=${requestBody.gridtype}`);
      }

      return await res.json();
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const videoUrl = response.full_url;
  if (!videoUrl) {
    throw new Error(`图像转视频 Grid 失败：响应中未找到视频 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[VMKRG:${tid}] Drama Backend 返回视频URL: ${videoUrl}`);

  let downloadUrl = videoUrl;
  if (import.meta.env.DEV && videoUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = videoUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  try {
    console.log(`[VMKRG:${tid}] 开始下载视频...`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }

    const videoBlob = await response.blob();
    console.log(`[VMKRG:${tid}] 视频下载成功，大小:`, videoBlob.size);

    const videoId = `vmkrg_${Date.now()}`;
    const { videoStorageService } = await import('../imageStorageService');
    await videoStorageService.saveVideo(videoId, videoBlob);
    console.log(`[VMKRG:${tid}] 视频保存到本地: ${videoId}`);

    return `video:${videoId}`;
  } catch (downloadError: any) {
    console.warn(`[VMKRG:${tid}] 视频下载失败，使用外部 URL:`, downloadError.message);
    return videoUrl;
  }
};

export const callDramaBackendVideoMkrApi = async (
  options: ImageGenerateOptions,
  traceId?: string
): Promise<string> => {
  const tid = traceId || `vmkr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const activeModel = getActiveImageModel();
  if (!activeModel) {
    throw new Error('没有可用的图片模型');
  }

  let apiBase = getApiBaseUrlForModel(activeModel.id);
  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  console.log(`\n[VMKR:${tid}] 调用图像转视频 MKR API`);
  console.log(`[VMKR:${tid}] 端点: /api/v1/generate/image2videomkr`);

  const requestBody: any = {
    prompt: options.prompt,
    width: options.videoMkrWidth || VIDEO_MKR_DEFAULT.width,
    height: options.videoMkrHeight || VIDEO_MKR_DEFAULT.height,
    duration: options.videoMkrDuration || 12,
    fps: options.videoMkrFps || 30,
  };

  // 处理 MKR 关键帧图片
  if (options.videoMkrImages && options.videoMkrImages.length > 0) {
    const images = [];
    for (const item of options.videoMkrImages) {
      const filename = await uploadImageToDramaBackend(item.image, baseUrl, tid);
      images.push({
        image: filename,
        frame_index: item.frame_index,
      });
      console.log(`[VMKR:${tid}] 关键帧上传成功 -> image: ${filename}, frame_index: ${item.frame_index}`);
    }
    requestBody.images = images;
  }

  console.log(`[VMKR:${tid}] 请求参数:`, JSON.stringify(requestBody, null, 2));

  const response = await retryOperation(async () => {
    const res = await fetch(`${baseUrl}/api/v1/generate/image2videomkr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMessage = `HTTP ${res.status}`;
      try {
        const errorText = await res.text();
        console.error(`[VMKR:${tid}] 服务端响应 ${res.status}:`, errorText.slice(0, 500));
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error?.message || errorData.msg || errorData.detail || errorText.slice(0, 200);
          } catch {
            errorMessage = errorText.slice(0, 200);
          }
        }
      } catch {
        errorMessage = `HTTP ${res.status}`;
      }
      throw new Error(`[MKR] ${errorMessage}\n请求参数: prompt="${requestBody.prompt?.slice(0,50)}..." width=${requestBody.width} height=${requestBody.height}`);
    }

    return await res.json();
  });

  const videoUrl = response.full_url;
  if (!videoUrl) {
    throw new Error(`图像转视频失败：响应中未找到视频 URL: ${JSON.stringify(response)}`);
  }

  console.log(`[VMKR:${tid}] Drama Backend 返回视频URL: ${videoUrl}`);

  let downloadUrl = videoUrl;
  if (import.meta.env.DEV && videoUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = videoUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const videoResponse = await fetch(downloadUrl);
  if (!videoResponse.ok) {
    throw new Error(`视频下载失败: ${videoResponse.status}`);
  }

  const videoBlob = await videoResponse.blob();

  const videoId = `vid_mkr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await videoStorageService.saveVideo(videoId, videoBlob);

  console.log(`[VMKR:${tid}] 视频已保存: ${videoId}`);
  return `video:${videoId}`;
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
    // 开发环境使用 Vite 代理解决 CORS，生产环境直接使用服务端地址
    const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

    if (options.isPromptEnhance) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (提示词增强 image2promptenhance 端点)`);
      return callDramaBackendPromptEnhanceApi(options.prompt, tid);
    }

    if (options.isCharacterTurnaround) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (专用 image2character 端点)`);
      return callDramaBackendCharacterApi(options, activeModel, baseUrl, tid);
    }

    if (options.isStoryboard) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (分镜生成 image2storyboard 端点)`);
      return callDramaBackendStoryboardApi(options, activeModel, baseUrl, tid);
    }

    if (options.isIPAStyleTransfer) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (IPA 风格迁移 image2ipastyletransfer 端点)`);
      return callDramaBackendIPAStyleTransferApi(options, tid);
    }

    if (options.isAnime) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (动漫风格生成 txt2imageanime 端点)`);
      return callDramaBackendAnimeApi(options, tid);
    }

    if (options.isVideoMkrGrid) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (MKR Grid 宫格视频 image2videomkrgrid 端点)`);
      return callDramaBackendVideoMkrGridApi(options, tid);
    }

    if (options.isVideoMkr) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (MKR 多关键帧视频 image2videomkr 端点)`);
      return callDramaBackendVideoMkrApi(options, tid);
    }

    if (options.is360HDRI) {
      console.log(`[I2I:${tid}] → 路由到: Drama Backend (360° HDRI 全景图像 image2360hdri 端点)`);
      const refImage = options.referenceImages?.[0];
      return callDramaBackend360HdriApi(refImage, tid);
    }

    console.log(`[I2I:${tid}] → 路由到: Drama Backend (专用 image2image 端点)`);
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


