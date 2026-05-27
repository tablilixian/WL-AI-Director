/**
 * 模型适配器统一导出
 */

// Chat 适配器
export { callChatApi, verifyApiKey, ApiKeyError } from './chatAdapter';

// Image 适配器
export { callImageApi, callDramaBackendSpliteGridApi, callDramaBackendInpaintApi, isAspectRatioSupported as isImageAspectRatioSupported } from './imageAdapter';

// Video 适配器
export { callVideoApi, isAspectRatioSupported as isVideoAspectRatioSupported, isDurationSupported } from './videoAdapter';
