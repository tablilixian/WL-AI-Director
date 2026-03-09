import { imageStorageService, videoStorageService } from '../services/imageStorageService';

export interface ImageSource {
  type: 'local' | 'cloud' | 'base64' | 'video';
  url?: string;
  localImageId?: string;
  localVideoId?: string;
}

export const parseImageUrl = (imageUrl: string | undefined): ImageSource => {
  if (!imageUrl) {
    return { type: 'cloud' };
  }

  // 检查是否是本地图片 ID（格式：local:{id}）
  if (imageUrl.startsWith('local:')) {
    const localImageId = imageUrl.substring(6);
    return { type: 'local', localImageId };
  }

  if (imageUrl.startsWith('video:')) {
    const localVideoId = imageUrl.substring(6);
    return { type: 'video', localVideoId };
  }

  // 检查是否是 base64 图片
  if (imageUrl.startsWith('data:image')) {
    return { type: 'base64', url: imageUrl };
  }

  if (imageUrl.startsWith('data:video')) {
    return { type: 'base64', url: imageUrl };
  }

  // 默认是云端 URL
  return { type: 'cloud', url: imageUrl };
};

export const getImageUrl = async (imageUrl: string | undefined): Promise<string | null> => {
  const source = parseImageUrl(imageUrl);

  if (source.type === 'local') {
    const blob = await imageStorageService.getImage(source.localImageId!);
    if (!blob) {
      console.warn('[ImageUtils] 本地图片不存在:', source.localImageId);
      return null;
    }
    return URL.createObjectURL(blob);
  }

  if (source.type === 'video') {
    const blob = await videoStorageService.getVideo(source.localVideoId!);
    if (!blob) {
      console.warn('[ImageUtils] 本地视频不存在:', source.localVideoId);
      return null;
    }
    return URL.createObjectURL(blob);
  }

  if (source.type === 'base64') {
    return source.url;
  }

  return source.url || null;
};

export const isLocalImage = (imageUrl: string | undefined): boolean => {
  return imageUrl?.startsWith('local:') || false;
};

export const getLocalImageId = (imageUrl: string | undefined): string | undefined => {
  if (isLocalImage(imageUrl)) {
    return imageUrl?.substring(6);
  }
  return undefined;
};

export const revokeObjectUrl = (url: string | null): void => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

export const convertImageUrlToBase64 = async (imageUrl: string | undefined): Promise<string | undefined> => {
  if (!imageUrl) {
    return undefined;
  }

  const source = parseImageUrl(imageUrl);

  if (source.type === 'base64') {
    return source.url;
  }

  if (source.type === 'local') {
    const blob = await imageStorageService.getImage(source.localImageId!);
    if (!blob) {
      console.warn('[ImageUtils] 本地图片不存在:', source.localImageId);
      return undefined;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        resolve(event.target?.result as string);
      };
      reader.onerror = () => {
        reject(new Error('读取本地图片失败'));
      };
      reader.readAsDataURL(blob);
    });
  }

  if (source.type === 'cloud') {
    try {
      const response = await fetch(source.url!);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve(event.target?.result as string);
        };
        reader.onerror = () => {
          reject(new Error('读取云端图片失败'));
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('[ImageUtils] 读取云端图片失败:', error);
      return undefined;
    }
  }

  return undefined;
};

export const saveVideoToLocal = async (videoBase64: string): Promise<string> => {
  const cleanBase64 = videoBase64.replace(/^data:video\/[^;]+;base64,/, '');
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'video/mp4' });
  
  const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await videoStorageService.saveVideo(videoId, blob);
  
  return `video:${videoId}`;
};
