/**
 * Thumbnail Service - Generate thumbnails for LOD rendering
 * Creates 256px thumbnails from base64 images for performance optimization
 */

const THUMBNAIL_SIZE = 256;

export async function generateThumbnail(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const aspectRatio = img.width / img.height;
      let width = THUMBNAIL_SIZE;
      let height = THUMBNAIL_SIZE;

      if (aspectRatio > 1) {
        height = THUMBNAIL_SIZE / aspectRatio;
      } else {
        width = THUMBNAIL_SIZE * aspectRatio;
      }

      canvas.width = width;
      canvas.height = height;

      ctx.drawImage(img, 0, 0, width, height);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnail);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64;
  });
}

export async function generateThumbnailFromBlob(blob: Blob): Promise<string> {
  const base64 = await blobToBase64(blob);
  return generateThumbnail(base64);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateVideoThumbnail(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    video.onloadeddata = () => {
      video.currentTime = 1;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const aspectRatio = video.videoWidth / video.videoHeight;
      let width = THUMBNAIL_SIZE;
      let height = THUMBNAIL_SIZE;

      if (aspectRatio > 1) {
        height = THUMBNAIL_SIZE / aspectRatio;
      } else {
        width = THUMBNAIL_SIZE * aspectRatio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);

      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnail);
    };

    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = videoUrl;
  });
}

export const thumbnailService = {
  generateThumbnail,
  generateThumbnailFromBlob,
  generateVideoThumbnail
};
