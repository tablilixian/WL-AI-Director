/**
 * 视频模型适配器
 * 处理 Veo（同步）和 Sora（异步）API
 */

import {
  VideoModelDefinition,
  VideoGenerateOptions,
  AspectRatio,
  VideoDuration,
} from '../../types/model';
import {
  getApiKeyForModel,
  getApiBaseUrlForModel,
  getActiveVideoModel,
  getProviderById,
} from '../modelRegistry';
import { ApiKeyError } from './chatAdapter';
import { unifiedImageService } from '../unifiedImageService';
import { uploadImageToDramaBackend } from './imageAdapter';
import { videoStorageService } from '../imageStorageService';
import { VIDEO_SORA_SIZE, VIDEO_DRAMA_SIZE, VIDEO_DRAMA_FALLBACK } from '../../config/sizeConfig';

/**
 * 解析图片引用为 Base64 格式
 *
 * @deprecated 使用 unifiedImageService.resolveForApi() 代替
 */
async function resolveImageRef(imageRef: string): Promise<string> {
  return await unifiedImageService.resolveForApi(imageRef);
}

/**
 * 检查是否为 BigModel 视频模型
 */
const isBigModelVideoModel = (modelId: string): boolean => {
  return (
    modelId.startsWith('vidu') || modelId.startsWith('cogvideo') || modelId.startsWith('cogvideox')
  );
};

/**
 * 开发环境获取 API Base URL（使用代理避免 CORS）
 */
const getDevApiBaseUrl = (modelId: string): string => {
  if (isBigModelVideoModel(modelId)) {
    return '/bigmodel';
  }
  return getApiBaseUrlForModel(modelId);
};

/**
 * 重试操作
 */
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 2000,
): Promise<T> => {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (
        error.message?.includes('400') ||
        error.message?.includes('401') ||
        error.message?.includes('403')
      ) {
        throw error;
      }
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
};

/**
 * 调整图片尺寸
 */
const resizeImageToSize = async (
  base64Data: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建 canvas 上下文'));
        return;
      }
      const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetX = (targetWidth - scaledWidth) / 2;
      const offsetY = (targetHeight - scaledHeight) / 2;
      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
      const result = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      resolve(result);
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = `data:image/png;base64,${base64Data}`;
  });
};

void (async (videoUrl: string): Promise<string> => {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`视频下载失败: ${response.status}`);
  }
  const videoBlob = await response.blob();
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      if (result && result.startsWith('data:')) {
        resolve(result);
      } else {
        reject(new Error('视频转换失败'));
      }
    };
    reader.onerror = () => reject(new Error('视频读取失败'));
    reader.readAsDataURL(videoBlob);
  });
});

/**
 * 根据宽高比获取尺寸
 */
const getSizeFromAspectRatio = (
  aspectRatio: AspectRatio,
): { width: number; height: number; size: string } => {
  return VIDEO_SORA_SIZE[aspectRatio];
};

/**
 * 根据宽高比获取 Veo 模型名称
 */
const getVeoModelName = (hasReferenceImage: boolean, aspectRatio: AspectRatio): string => {
  const orientation = aspectRatio === '9:16' ? 'portrait' : 'landscape';

  if (hasReferenceImage) {
    return `veo_3_1_i2v_s_fast_fl_${orientation}`;
  } else {
    return `veo_3_1_t2v_fast_${orientation}`;
  }
};

/**
 * 调用 Veo API（同步模式）
 */
const callVeoApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiKey: string,
  apiBase: string,
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  const hasStartImage = !!options.startImage;

  // Veo 不支持 1:1
  const finalAspectRatio = aspectRatio === '1:1' ? '16:9' : aspectRatio;

  // 获取具体的模型名称
  const modelName = getVeoModelName(hasStartImage, finalAspectRatio);

  // 清理图片数据
  const cleanStart = options.startImage?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';
  const cleanEnd = options.endImage?.replace(/^data:image\/(png|jpeg|jpg);base64,/, '') || '';

  // 构建消息
  const messages: any[] = [{ role: 'user', content: options.prompt }];

  if (cleanStart) {
    messages[0].content = [
      { type: 'text', text: options.prompt },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${cleanStart}` } },
    ];
  }

  if (cleanEnd && Array.isArray(messages[0].content)) {
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${cleanEnd}` },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200000); // 20 分钟

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          stream: false,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error('提示词可能包含不安全或违规内容，未能处理。请修改后重试。');
        }
        if (res.status === 500) {
          throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
        }

        let errorMessage = `HTTP 错误: ${res.status}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          const errorText = await res.text();
          if (errorText) errorMessage = errorText;
        }
        throw new Error(errorMessage);
      }

      return res;
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取视频 URL
    const urlMatch =
      content.match(/https?:\/\/[^\s\])"]+\.mp4[^\s\])"']*/i) ||
      content.match(/https?:\/\/[^\s\])"]+/i);

    if (!urlMatch) {
      throw new Error('视频生成失败：未能从响应中提取视频 URL');
    }

    const videoUrl = urlMatch[0];

    // 下载并转换为 base64
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`视频下载失败: ${videoResponse.status}`);
    }

    const videoBlob = await videoResponse.blob();
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.startsWith('data:')) {
          resolve(result);
        } else {
          reject(new Error('视频转换失败'));
        }
      };
      reader.onerror = () => reject(new Error('视频读取失败'));
      reader.readAsDataURL(videoBlob);
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('视频生成超时 (20分钟)');
    }
    throw error;
  }
};

/**
 * 调用 Sora API（异步模式）
 */
const callSoraApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiKey: string,
  apiBase: string,
): Promise<string> => {
  const aspectRatio = options.aspectRatio || model.params.defaultAspectRatio;
  const duration = options.duration || model.params.defaultDuration;
  const apiModel = model.apiModel || model.id;

  const resolvedStartImage = options.startImage ? await resolveImageRef(options.startImage) : '';
  const resolvedEndImage = options.endImage ? await resolveImageRef(options.endImage) : '';
  const references = [resolvedStartImage, resolvedEndImage].filter(Boolean) as string[];

  const resolvedModel = apiModel || 'sora-2';
  const useReferenceArray = resolvedModel.toLowerCase().startsWith('veo_3_1-fast');

  if (resolvedModel === 'sora-2' && references.length >= 2) {
    throw new Error('Sora-2 不支持首尾帧模式，请只传一张参考图。');
  }

  const { width, height, size } = getSizeFromAspectRatio(aspectRatio);

  console.log(`🎬 使用异步模式生成视频 (${resolvedModel}, ${aspectRatio}, ${duration}秒)...`);
  console.log('[VideoAdapter] 参考图数量:', references.length);

  const isCogVideo = resolvedModel.toLowerCase().includes('cogvideo');
  const isBigModel = model.providerId === 'bigmodel';

  let requestBody: BodyInit;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };

  if (isCogVideo || isBigModel) {
    const jsonData: any = {
      model: resolvedModel,
      prompt: options.prompt,
      duration: duration,
      size: size,
      movement_amplitude: 'auto',
    };

    if (resolvedStartImage) {
      const cleanBase64 = resolvedStartImage.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      jsonData.image_url = `data:image/png;base64,${cleanBase64}`;
    }

    console.log('[VideoAdapter] JSON 请求体:', JSON.stringify(jsonData, null, 2));

    requestBody = JSON.stringify(jsonData);
    headers['Content-Type'] = 'application/json';
  } else {
    const formData = new FormData();
    formData.append('model', resolvedModel);
    formData.append('prompt', options.prompt);
    formData.append('seconds', String(duration));
    formData.append('size', size);

    const appendReference = async (base64: string, filename: string, fieldName: string) => {
      const cleanBase64 = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      const resizedBase64 = await resizeImageToSize(cleanBase64, width, height);
      const byteCharacters = atob(resizedBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      formData.append(fieldName, blob, filename);
    };

    if (useReferenceArray && references.length >= 2) {
      const limited = references.slice(0, 2);
      await appendReference(limited[0], 'reference-start.png', 'input_reference[]');
      await appendReference(limited[1], 'reference-end.png', 'input_reference[]');
    } else if (references.length >= 1) {
      await appendReference(references[0], 'reference.png', 'input_reference');
    }

    requestBody = formData;
  }

  const createResponse = await fetch(`${apiBase}${model.endpoint || '/v1/videos'}`, {
    method: 'POST',
    headers,
    body: requestBody,
  });

  if (!createResponse.ok) {
    if (createResponse.status === 400) {
      throw new Error('提示词可能包含不安全或违规内容，未能处理。请修改后重试。');
    }
    if (createResponse.status === 500) {
      throw new Error('当前请求较多，暂时未能处理成功，请稍后重试。');
    }

    let errorMessage = `创建任务失败: HTTP ${createResponse.status}`;
    try {
      const errorData = await createResponse.json();
      errorMessage = errorData.error?.message || errorMessage;
    } catch {
      const errorText = await createResponse.text();
      if (errorText) errorMessage = errorText;
    }
    throw new Error(errorMessage);
  }

  const createData = await createResponse.json();

  console.log('=== [VideoAdapter] 创建任务响应 ===');
  console.log('[响应数据]', JSON.stringify(createData, null, 2));

  if (createData.error) {
    console.error('API 返回错误:', createData.error);
    throw new Error(
      `视频生成失败: ${createData.error.message || createData.error.msg || JSON.stringify(createData.error)}`,
    );
  }

  const taskId = createData.id || createData.task_id || createData.taskId;

  if (!taskId) {
    console.error('未找到任务 ID，完整响应:', createData);
    throw new Error('创建视频任务失败：未返回任务 ID');
  }

  console.log('📋 视频任务已创建，任务 ID:', taskId);

  // 轮询状态
  const maxPollingTime = 1200000; // 20 分钟
  const pollingInterval = 5000;
  const startTime = Date.now();

  let videoId: string | null = null;
  let videoUrlFromStatus: string | null = null;

  while (Date.now() - startTime < maxPollingTime) {
    await new Promise((resolve) => setTimeout(resolve, pollingInterval));

    // BigModel 使用 /async-result/{id}，其他模型使用 /videos/{id}
    const statusEndpoint =
      model.providerId === 'bigmodel'
        ? '/api/paas/v4/async-result'
        : model.endpoint || '/v1/videos';
    const statusResponse = await fetch(`${apiBase}${statusEndpoint}/${taskId}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!statusResponse.ok) {
      console.warn('⚠️ 查询任务状态失败，继续重试...');
      continue;
    }

    const statusData = await statusResponse.json();
    // BigModel 使用 task_status，其他模型使用 status
    const status = statusData.task_status || statusData.status;
    const isBigModel = model.providerId === 'bigmodel';

    console.log(`🔄 ${model.id} 任务状态:`, status, '进度:', statusData.progress);
    console.log('[完整状态响应]', JSON.stringify(statusData, null, 2));

    if (status === 'completed' || status === 'succeeded' || status === 'SUCCESS') {
      // BigModel 返回 video_result 数组
      if (isBigModel && statusData.video_result && statusData.video_result.length > 0) {
        videoUrlFromStatus = statusData.video_result[0].url || statusData.video_result[0];
        console.log('✅ BigModel 视频 URL:', videoUrlFromStatus);
      } else {
        videoUrlFromStatus = statusData.video_url || statusData.videoUrl || null;
        if (statusData.id && statusData.id.startsWith('video_')) {
          videoId = statusData.id;
        } else {
          videoId =
            statusData.output_video ||
            statusData.video_id ||
            statusData.outputs?.[0]?.id ||
            statusData.id;
        }
        if (!videoId && statusData.outputs && statusData.outputs.length > 0) {
          videoId = statusData.outputs[0];
        }
      }
      console.log('✅ 任务完成，视频:', videoUrlFromStatus || videoId);
      break;
    } else if (status === 'failed' || status === 'error' || status === 'FAIL') {
      const errorMsg =
        statusData.error ||
        statusData.message ||
        statusData.error_message ||
        statusData.result?.error ||
        JSON.stringify(statusData);
      console.error('❌ 视频生成失败，完整响应:', statusData);
      throw new Error(`视频生成失败: ${errorMsg}`);
    }

    console.log('🔄 Sora-2 任务状态:', status, '进度:', statusData.progress);

    if (status === 'completed' || status === 'succeeded') {
      videoUrlFromStatus = statusData.video_url || statusData.videoUrl || null;
      if (statusData.id && statusData.id.startsWith('video_')) {
        videoId = statusData.id;
      } else {
        videoId =
          statusData.output_video ||
          statusData.video_id ||
          statusData.outputs?.[0]?.id ||
          statusData.id;
      }
      if (!videoId && statusData.outputs && statusData.outputs.length > 0) {
        videoId = statusData.outputs[0];
      }
      console.log('✅ 任务完成，视频 ID:', videoId);
      break;
    } else if (status === 'failed' || status === 'error') {
      throw new Error(`视频生成失败: ${statusData.error || statusData.message || '未知错误'}`);
    }
  }

  if (!videoId && !videoUrlFromStatus) {
    throw new Error('视频生成超时 (20分钟) 或未返回视频 ID');
  }

  if (videoUrlFromStatus) {
    console.log('✅ 视频生成完成，URL:', videoUrlFromStatus);
    return videoUrlFromStatus;
  }

  // 下载视频
  const maxDownloadRetries = 5;
  const downloadTimeout = 600000;

  for (let attempt = 1; attempt <= maxDownloadRetries; attempt++) {
    try {
      console.log(`📥 尝试下载视频 (第${attempt}/${maxDownloadRetries}次)...`);

      const downloadController = new AbortController();
      const downloadTimeoutId = setTimeout(() => downloadController.abort(), downloadTimeout);

      const downloadResponse = await fetch(`${apiBase}/v1/videos/${videoId}/content`, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: downloadController.signal,
      });

      clearTimeout(downloadTimeoutId);

      if (!downloadResponse.ok) {
        if (downloadResponse.status >= 500 && attempt < maxDownloadRetries) {
          console.warn(`⚠️ 下载失败 HTTP ${downloadResponse.status}，${5 * attempt}秒后重试...`);
          await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
          continue;
        }
        throw new Error(`视频下载失败: HTTP ${downloadResponse.status}`);
      }

      const videoBlob = await downloadResponse.blob();

      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (result && result.startsWith('data:')) {
            console.log('✅ 视频下载完成并转换为 base64');
            resolve(result);
          } else {
            reject(new Error('视频转换失败'));
          }
        };
        reader.onerror = () => reject(new Error('视频读取失败'));
        reader.readAsDataURL(videoBlob);
      });
    } catch (error: any) {
      if (attempt === maxDownloadRetries) {
        throw error;
      }
      console.warn(`⚠️ 下载出错: ${error.message}，重试中...`);
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    }
  }

  throw new Error('视频下载失败：已达到最大重试次数');
};

/**
 * 调用 Drama Backend 视频生成 API (image2videomsr)
 * 基于图像生成视频（MSR 多帧超分辨率技术）
 */
const callDramaBackendVideoApi = async (
  options: VideoGenerateOptions,
  model: VideoModelDefinition,
  apiBase: string,
): Promise<string> => {
  const tid = `drama_video_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  console.log(`\n========== [${tid}] Drama Backend 视频生成请求开始 ==========`);
  console.log(`[${tid}] 端点: POST /api/v1/generate/image2videomsr`);
  console.log(`[${tid}] 目标地址: ${apiBase}`);
  console.log(`[${tid}] 代理模式: ${import.meta.env.DEV ? '开发环境 (/drama-api)' : '生产环境'}`);

  const baseUrl = import.meta.env.DEV ? '/drama-api' : apiBase;

  const size = VIDEO_DRAMA_SIZE[options.aspectRatio || '16:9'] || VIDEO_DRAMA_FALLBACK;

  const requestBody: any = {
    prompt: options.prompt,
    width: size.width,
    height: size.height,
    duration: options.duration || 5,
    fps: 30,
  };

  // 收集所有图片：优先使用 referenceImages，否则回退 startImage + endImage
  const allImages = options.referenceImages?.length
    ? options.referenceImages
    : ([options.startImage, options.endImage].filter(Boolean) as string[]);

  if (allImages.length === 0) {
    throw new Error('视频生成需要提供至少一张图片');
  }

  // 第一张图作为 background
  const firstFilename = await uploadImageToDramaBackend(allImages[0], baseUrl, tid);
  requestBody.background = firstFilename;
  console.log(`[${tid}] 背景图上传成功 -> filename: ${firstFilename}`);

  if (allImages.length === 1) {
    requestBody.image1 = firstFilename;
    console.log(`[${tid}] 仅一张图，image1 复用背景图`);
  } else {
    // 第二张图作为 image1
    const secondFilename = await uploadImageToDramaBackend(allImages[1], baseUrl, tid);
    requestBody.image1 = secondFilename;
    console.log(`[${tid}] image1 上传成功 -> filename: ${secondFilename}`);

    // 后续图片依次为 image2/image3/image4
    for (let i = 2; i < Math.min(allImages.length, 5); i++) {
      const imgKey = `image${i}`;
      console.log(`[${tid}] 开始上传参考图 ${imgKey}: ${allImages[i].substring(0, 100)}...`);
      const filename = await uploadImageToDramaBackend(allImages[i], baseUrl, tid);
      requestBody[imgKey] = filename;
      console.log(`[${tid}] 参考图 ${imgKey} 上传成功 -> filename: ${filename}`);
    }
  }

  console.log(`\n[${tid}] ========== 请求参数 (JSON) ==========`);
  console.log(JSON.stringify(requestBody, null, 2));
  console.log(`[${tid}] ====================================\n`);

  const data = await retryOperation(async () => {
    const requestUrl = `${baseUrl}/api/v1/generate/image2videomsr`;
    console.log(`[${tid}] 发送请求: POST ${requestUrl}`);

    const res = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log(`[${tid}] 响应状态: ${res.status} ${res.statusText}`);
    console.log(`[${tid}] 响应头:`, Object.fromEntries(res.headers.entries()));

    if (!res.ok) {
      let errorMessage = `HTTP 错误: ${res.status} ${res.statusText}`;
      try {
        const errorText = await res.text();
        console.log(`[${tid}] ========== 错误响应 Body ==========`);
        console.log(errorText);
        console.log(`[${tid}] ===================================`);
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            errorMessage =
              errorData.error?.message ||
              errorData.msg ||
              errorData.detail ||
              errorText.slice(0, 500);
          } catch {
            errorMessage = errorText.slice(0, 500);
          }
        }
      } catch (e) {
        console.log(`[${tid}] 读取响应 Body 失败:`, e);
        errorMessage = `HTTP 错误: ${res.status}`;
      }
      throw new Error(errorMessage);
    }

    const responseData = await res.json();
    console.log(`[${tid}] ========== 成功响应 Body ==========`);
    console.log(JSON.stringify(responseData, null, 2));
    console.log(`[${tid}] ===================================`);
    return responseData;
  });
  const videoUrl = data.full_url;
  if (!videoUrl) {
    throw new Error(`视频生成失败：响应中未找到视频 URL: ${JSON.stringify(data)}`);
  }

  console.log(`[${tid}] 视频URL: ${videoUrl}`);

  let downloadUrl = videoUrl;
  if (import.meta.env.DEV && videoUrl.startsWith('http://117.50.108.73:8082')) {
    downloadUrl = videoUrl.replace('http://117.50.108.73:8082', '/drama-api');
  }

  const videoResponse = await fetch(downloadUrl);
  if (!videoResponse.ok) {
    throw new Error(`视频下载失败: ${videoResponse.status}`);
  }

  const videoBlob = await videoResponse.blob();
  const videoId = `vid_drama_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await videoStorageService.saveVideo(videoId, videoBlob);

  console.log(`[${tid}] 视频已保存: ${videoId}`);
  return `video:${videoId}`;
};

/**
 * 调用视频生成 API
 */
export const callVideoApi = async (
  options: VideoGenerateOptions,
  model?: VideoModelDefinition,
): Promise<string> => {
  // 获取当前激活的模型
  const activeModel = model || getActiveVideoModel();
  if (!activeModel) {
    throw new Error('没有可用的视频模型');
  }

  // WLDrama 提供商走独立的视频生成流程
  const provider = getProviderById(activeModel.providerId);
  if (provider?.id === 'wldrama' || activeModel.providerId === 'wldrama') {
    const apiBase = getDevApiBaseUrl(activeModel.id);
    return callDramaBackendVideoApi(options, activeModel, apiBase);
  }

  // 获取 API 配置
  const apiKey = getApiKeyForModel(activeModel.id);
  if (!apiKey) {
    throw new ApiKeyError('API Key 缺失，请在设置中配置 API Key');
  }

  const apiBase = getDevApiBaseUrl(activeModel.id);

  // 根据模式选择不同的 API
  if (activeModel.params.mode === 'async') {
    return callSoraApi(options, activeModel, apiKey, apiBase);
  } else {
    return callVeoApi(options, activeModel, apiKey, apiBase);
  }
};

/**
 * 检查宽高比是否支持
 */
export const isAspectRatioSupported = (
  aspectRatio: AspectRatio,
  model?: VideoModelDefinition,
): boolean => {
  const activeModel = model || getActiveVideoModel();
  if (!activeModel) return false;

  return activeModel.params.supportedAspectRatios.includes(aspectRatio);
};

/**
 * 检查时长是否支持
 */
export const isDurationSupported = (
  duration: VideoDuration,
  model?: VideoModelDefinition,
): boolean => {
  const activeModel = model || getActiveVideoModel();
  if (!activeModel) return false;

  return activeModel.params.supportedDurations.includes(duration);
};
