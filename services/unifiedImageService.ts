/**
 * 统一图片服务 (Unified Image Service)
 * 
 * 本服务提供全面的图片处理能力，整合项目中分散的图片处理逻辑。
 * 支持多种图片 URL 格式：base64、local:、http://、https://、blob:
 * 
 * 主要功能：
 * - URL 解析：识别图片来源类型
 * - URL 转换：转换为显示用或 API 调用用的格式
 * - 尺寸获取：获取图片宽高（兼容 CORS）
 * - 存储管理：保存/读取/删除本地图片
 * 
 * @module unifiedImageService
 */

import { imageStorageService, generateImageId as generateImageIdBase, videoStorageService } from './imageStorageService';
import { logger, LogCategory } from './logger';

/**
 * 图片来源类型
 * 
 * @typedef {Object} ImageSource
 * @property {'local' | 'cloud' | 'base64' | 'video'} type - 图片来源类型
 * @property {string} [url] - 可用的 URL（cloud/base64 时）
 * @property {string} [localImageId] - 本地图片 ID（local 时）
 * @property {string} [localVideoId] - 本地视频 ID（video 时）
 */
export interface ImageSource {
  type: 'local' | 'cloud' | 'base64' | 'video';
  url?: string;
  localImageId?: string;
  localVideoId?: string;
}

/**
 * 图片尺寸
 * 
 * @typedef {Object} ImageDimensions
 * @property {number} width - 图片宽度
 * @property {number} height - 图片高度
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * 统一图片服务
 * 
 * 提供图片解析、转换、尺寸获取、存储管理等全面功能
 */
export const unifiedImageService = {

  /**
   * 解析图片 URL，返回其来源类型
   * 
   * 识别以下格式：
   * - `local:xxx` - 本地 IndexedDB 存储
   * - `data:image/xxx;base64,xxx` - Base64 内联图片
   * - `video:xxx` - 本地视频存储
   * - `http://xxx` 或 `https://xxx` - 网络图片
   * - `blob:xxx` - 临时 Blob URL
   * 
   * @param imageUrl - 要解析的图片 URL
   * @returns 解析后的图片来源信息
   * 
   * @example
   * // 返回 { type: 'local', localImageId: 'img_123' }
   * const source = unifiedImageService.parseUrl('local:img_123');
   * 
   * @example
   * // 返回 { type: 'base64', url: 'data:image/png;base64,xxx' }
   * const source = unifiedImageService.parseUrl('data:image/png;base64,abc123');
   */
  parseUrl(imageUrl: string | undefined): ImageSource {
    if (!imageUrl) {
      return { type: 'cloud' };
    }

    // 检查是否是本地图片 ID（格式：local:{id}）
    if (imageUrl.startsWith('local:')) {
      const localImageId = imageUrl.substring(6);
      return { type: 'local', localImageId };
    }

    // 检查是否是本地视频（格式：video:{id}）
    if (imageUrl.startsWith('video:')) {
      const localVideoId = imageUrl.substring(6);
      return { type: 'video', localVideoId };
    }

    // 检查是否是 base64 图片
    if (imageUrl.startsWith('data:image')) {
      return { type: 'base64', url: imageUrl };
    }

    // 检查是否是 base64 视频
    if (imageUrl.startsWith('data:video')) {
      return { type: 'base64', url: imageUrl };
    }

    // 默认是网络 URL
    return { type: 'cloud', url: imageUrl };
  },

  /**
   * 将图片 URL 解析为可用于显示的 URL
   * 
   * 转换规则：
   * - base64: 直接返回
   * - blob: 直接返回
   * - http/https: 直接返回
   * - local: 从 IndexedDB 读取，返回 blob: URL
   * 
   * @param imageUrl - 原始图片 URL
   * @returns 可用于 img src 显示的 URL，失败返回空字符串
   * 
   * @example
   * // 假设 IndexedDB 中存在 img_123
   * const displayUrl = await unifiedImageService.resolveForDisplay('local:img_123');
   * // 返回类似: blob:http://localhost:3000/xxx
   */
  async resolveForDisplay(imageUrl: string | undefined): Promise<string> {
    if (!imageUrl) {
      return '';
    }

    const source = this.parseUrl(imageUrl);

    // base64 或网络 URL 直接返回
    if (source.type === 'base64' || source.type === 'cloud') {
      return source.url || '';
    }

    // 视频类型返回空（视频需要特殊处理）
    if (source.type === 'video') {
      logger.warn(LogCategory.IMAGE, '[UnifiedImageService] 视频类型需要使用 resolveForApi');
      return '';
    }

    // local 类型：从 IndexedDB 读取
    if (source.type === 'local' && source.localImageId) {
      try {
        const blob = await imageStorageService.getImage(source.localImageId);
        if (blob) {
          return URL.createObjectURL(blob);
        } else {
          logger.warn(LogCategory.IMAGE, `[UnifiedImageService] 本地图片不存在: ${source.localImageId}`);
          return '';
        }
      } catch (error) {
        logger.error(LogCategory.IMAGE, `[UnifiedImageService] 读取本地图片失败: ${source.localImageId}`, error);
        return '';
      }
    }

    return '';
  },

  /**
   * 将图片 URL 解析为 Base64 格式
   * 
   * 适用于调用 API 时需要 base64 格式的场景
   * 
   * 转换规则：
   * - base64: 直接返回
   * - blob: 转换为 base64
   * - http/https: 下载后转换为 base64
   * - local: 从 IndexedDB 读取后转换为 base64
   * 
   * @param imageUrl - 原始图片 URL
   * @returns Base64 格式的图片数据，失败返回空字符串
   * @throws 网络请求失败时抛出错误
   * 
   * @example
   * // 用于图生视频 API 调用
   * const base64 = await unifiedImageService.resolveForApi('local:img_123');
   */
  async resolveForApi(imageUrl: string | undefined): Promise<string> {
    if (!imageUrl) {
      return '';
    }

    const source = this.parseUrl(imageUrl);

    // base64 直接返回
    if (source.type === 'base64') {
      return source.url || '';
    }

    // local 类型：从 IndexedDB 读取
    if (source.type === 'local' && source.localImageId) {
      try {
        const blob = await imageStorageService.getImage(source.localImageId);
        if (blob) {
          return await this.blobToBase64(blob);
        } else {
          logger.warn(LogCategory.IMAGE, `[UnifiedImageService] 本地图片不存在: ${source.localImageId}`);
          return '';
        }
      } catch (error) {
        logger.error(LogCategory.IMAGE, `[UnifiedImageService] 读取本地图片失败: ${source.localImageId}`, error);
        return '';
      }
    }

    // 视频类型返回空
    if (source.type === 'video') {
      logger.warn(LogCategory.IMAGE, '[UnifiedImageService] 视频类型需要特殊处理');
      return '';
    }

    // 网络 URL：下载后转换
    if (source.type === 'cloud' && source.url) {
      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const blob = await response.blob();
        return await this.blobToBase64(blob);
      } catch (error) {
        logger.error(LogCategory.IMAGE, '[UnifiedImageService] 下载网络图片失败', error);
        return '';
      }
    }

    return '';
  },

  /**
   * 获取图片尺寸
   * 
   * 支持所有 URL 格式，通过 fetch + createObjectURL 方式绕过 CORS 限制
   * 
   * 原理：
   * 1. 对于网络图片，使用 fetch 下载到 Blob，再用 createObjectURL 创建本地 URL
   * 2. 这样可以绑过浏览器 CORS 限制，因为图片数据已经下载到内存中
   * 3. 对于 base64 和 local:，直接创建 Blob URL
   * 
   * @param imageUrl - 原始图片 URL
   * @returns 图片尺寸 { width, height }
   * @throws 无法获取尺寸时抛出错误
   * 
   * @example
   * const dims = await unifiedImageService.getDimensions('local:img_123');
   * console.log(`图片尺寸: ${dims.width}x${dims.height}`);
   */
  async getDimensions(imageUrl: string | undefined): Promise<ImageDimensions> {
    if (!imageUrl) {
      throw new Error('图片 URL 不能为空');
    }

    const source = this.parseUrl(imageUrl);

    // 对于不同类型，使用不同的方式获取尺寸
    if (source.type === 'local' && source.localImageId) {
      // local 类型：从 IndexedDB 读取，再用 blob: URL
      const blob = await imageStorageService.getImage(source.localImageId);
      if (!blob) {
        throw new Error(`本地图片不存在: ${source.localImageId}`);
      }
      return this.getDimensionsFromBlob(blob);
    }

    if (source.type === 'base64') {
      // base64 类型：直接使用
      return this.getDimensionsFromUrl(source.url || '');
    }

    if (source.type === 'cloud' && source.url) {
      // 网络 URL：先下载到 Blob，再用 createObjectURL 绕过 CORS
      try {
        const response = await fetch(source.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        return this.getDimensionsFromBlob(blob);
      } catch (error) {
        throw new Error(`下载图片失败: ${source.url}, ${error}`);
      }
    }

    throw new Error(`不支持的图片类型: ${source.type}`);
  },

  /**
   * 从 Blob 获取图片尺寸
   * 
   * 内部方法，使用 createObjectURL 确保兼容性
   * 
   * @param blob - 图片 Blob
   * @returns 图片尺寸
   */
  async getDimensionsFromBlob(blob: Blob): Promise<ImageDimensions> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl); // 释放资源
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('无法加载图片 Blob'));
      };

      img.src = objectUrl;
    });
  },

  /**
   * 从 URL 获取图片尺寸（直接使用）
   * 
   * 适用于 base64 或已经有 CORS 头的网络 URL
   * 
   * @param url - 图片 URL
   * @returns 图片尺寸
   */
  getDimensionsFromUrl(url: string): Promise<ImageDimensions> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };

      img.onerror = () => {
        reject(new Error(`无法加载图片: ${url}`));
      };

      img.src = url;
    });
  },

  /**
   * 将 Blob 转换为 Base64 字符串
   * 
   * @param blob - 图片 Blob 数据
   * @returns Base64 格式的图片数据（包含 mime type 前缀）
   * 
   * @example
   * const base64 = await unifiedImageService.blobToBase64(blob);
   * // 返回: data:image/png;base64,iVBORw0KGgo...
   */
  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Blob 转 Base64 失败'));
      reader.readAsDataURL(blob);
    });
  },

  /**
   * 将 Base64 字符串转换为 Blob
   * 
   * @param base64 - Base64 格式的图片数据
   * @returns Blob 对象
   * 
   * @example
   * const blob = await unifiedImageService.base64ToBlob('data:image/png;base64,iVBORw0KG...');
   */
  async base64ToBlob(base64: string): Promise<Blob> {
    // 提取 mime type 和数据部分
    const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('无效的 Base64 格式');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // 解码 base64
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  },

  /**
   * 生成唯一的图片 ID
   * 
   * 格式: img_{timestamp}_{random}
   * 
   * @returns 唯一标识符
   * 
   * @example
   * const id = unifiedImageService.generateImageId();
   * // 返回: img_1712035200000_abc123
   */
  generateImageId(): string {
    return generateImageIdBase();
  },

  /**
   * 保存图片到本地 IndexedDB 存储
   * 
   * @param id - 图片 ID（如果为空，将自动生成）
   * @param blob - 图片 Blob 数据
   * @returns 保存的图片 ID
   * 
   * @example
   * const id = await unifiedImageService.saveImage('my_img_1', blob);
   */
  async saveImage(id: string, blob: Blob): Promise<string> {
    const imageId = id || this.generateImageId();
    await imageStorageService.saveImage(imageId, blob);
    logger.debug(LogCategory.IMAGE, `[UnifiedImageService] 保存图片: ${imageId}`);
    return imageId;
  },

  /**
   * 从本地 IndexedDB 读取图片
   * 
   * @param id - 图片 ID
   * @returns 图片 Blob，不存在返回 null
   * 
   * @example
   * const blob = await unifiedImageService.getImage('img_123');
   * if (blob) {
   *   const url = URL.createObjectURL(blob);
   *   // 使用 url...
   * }
   */
  async getImage(id: string): Promise<Blob | null> {
    return await imageStorageService.getImage(id);
  },

  /**
   * 删除本地 IndexedDB 中的图片
   * 
   * @param id - 图片 ID
   * 
   * @example
   * await unifiedImageService.deleteImage('img_123');
   */
  async deleteImage(id: string): Promise<void> {
    await imageStorageService.deleteImage(id);
    logger.debug(LogCategory.IMAGE, `[UnifiedImageService] 删除图片: ${id}`);
  },

  /**
   * 判断是否为本地图片
   * 
   * @param imageUrl - 要检查的 URL
   * @returns 是否为本地图片
   * 
   * @example
   * if (unifiedImageService.isLocalImage(imageUrl)) {
   *   // 处理本地图片...
   * }
   */
  isLocalImage(imageUrl: string | undefined): boolean {
    if (!imageUrl) return false;
    return imageUrl.startsWith('local:');
  },

  /**
   * 从 local: 前缀提取图片 ID
   * 
   * @param imageUrl - local:xxx 格式的 URL
   * @returns 提取的 ID，不符合格式返回 undefined
   * 
   * @example
   * const id = unifiedImageService.getLocalImageId('local:img_123');
   * // 返回: 'img_123'
   */
  getLocalImageId(imageUrl: string | undefined): string | undefined {
    if (!imageUrl || !imageUrl.startsWith('local:')) {
      return undefined;
    }
    return imageUrl.substring(6);
  },

  /**
   * 释放 Blob URL
   * 
   * 释放由 createObjectURL 创建的临时 URL，防止内存泄漏
   * 
   * @param url - 要释放的 URL
   * 
   * @example
   * const displayUrl = await unifiedImageService.resolveForDisplay('local:img_123');
   * // 使用图片...
   * unifiedImageService.revokeObjectUrl(displayUrl);
   */
  revokeObjectUrl(url: string | null): void {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  },

  /**
   * 保存视频到本地 IndexedDB 存储
   * 
   * 支持多种输入格式：
   * - blob: URL - 直接获取 Blob 数据
   * - data:video - Base64 编码的视频，解码后保存
   * - video:xxx - 已经是本地格式，直接返回
   * 
   * 保存后返回本地引用格式: video:{id}
   * 
   * @param videoUrl - 视频 URL（blob: 或 data:video 格式）
   * @returns 本地引用格式的视频 ID
   * @throws 不支持的格式时抛出错误
   * 
   * @example
   * const localVideoUrl = await unifiedImageService.saveVideoToLocal(blobUrl);
   * // 返回: video:vid_1234567890_abc123
   */
  async saveVideoToLocal(videoUrl: string): Promise<string> {
    // 如果已经是 video: 格式，直接返回
    if (videoUrl.startsWith('video:')) {
      return videoUrl;
    }

    let blob: Blob;

    if (videoUrl.startsWith('blob:')) {
      // blob: URL - 直接获取 blob
      try {
        const response = await fetch(videoUrl);
        blob = await response.blob();
      } catch (error) {
        logger.error(LogCategory.IMAGE, '[UnifiedImageService] 从 blob URL 获取视频数据失败', error);
        throw error;
      }
    } else if (videoUrl.startsWith('data:video')) {
      // data: video base64 - 解码
      const cleanBase64 = videoUrl.replace(/^data:video\/[^;]+;base64,/, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: 'video/mp4' });
    } else {
      throw new Error(`不支持的视频 URL 格式: ${videoUrl.substring(0, 50)}`);
    }

    const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await videoStorageService.saveVideo(videoId, blob);

    logger.debug(LogCategory.IMAGE, `[UnifiedImageService] 保存视频: ${videoId}`);
    return `video:${videoId}`;
  },

  /**
   * 从本地存储读取视频
   * 
   * @param videoId - 视频 ID（不含 video: 前缀）
   * @returns 视频 Blob，不存在返回 null
   * 
   * @example
   * const blob = await unifiedImageService.getVideo('vid_1234567890_abc123');
   * if (blob) {
   *   const url = URL.createObjectURL(blob);
   * }
   */
  async getVideo(videoId: string): Promise<Blob | null> {
    return await videoStorageService.getVideo(videoId);
  },

  /**
   * 解析视频 URL 为可用于显示的 blob: URL
   * 
   * @param videoUrl - 视频 URL（video:xxx 格式）
   * @returns 可用于 video 标签 src 的 blob: URL
   * 
   * @example
   * const displayUrl = await unifiedImageService.resolveVideoForDisplay('video:vid_123');
   * // 返回类似: blob:http://localhost:3000/xxx
   */
  async resolveVideoForDisplay(videoUrl: string): Promise<string> {
    if (!videoUrl) {
      return '';
    }

    if (!videoUrl.startsWith('video:')) {
      // 非本地视频，直接返回
      return videoUrl;
    }

    const videoId = videoUrl.substring(6);
    const blob = await videoStorageService.getVideo(videoId);

    if (blob) {
      return URL.createObjectURL(blob);
    }

    logger.warn(LogCategory.IMAGE, `[UnifiedImageService] 本地视频不存在: ${videoId}`);
    return '';
  }
};

/**
 * 兼容旧 API 的导出
 * 
 * 保留与 utils/imageUtils.ts 相同的导出，方便迁移
 */
export {
  // 从 imageStorageService 透传
  imageStorageService,
  // 内部方法也导出，方便直接调用
  // 注意：这些方法已包含在 unifiedImageService 中
};
