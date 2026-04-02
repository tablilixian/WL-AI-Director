import { useState, useEffect, useRef } from 'react';
import { unifiedImageService } from '../services/unifiedImageService';

/**
 * 图片加载 Hook
 * 
 * 统一处理各种来源的图片加载：
 * - 云端图片 (http/https)
 * - Base64 内联图片
 * - 本地存储图片 (local:xxx)
 * 
 * @param imageUrl - 图片 URL
 * @returns 加载状态 { src, loading, error }
 */
export const useImageLoader = (imageUrl: string | undefined) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const loadImage = async () => {
      const source = unifiedImageService.parseUrl(imageUrl);
      
      if (source.type === 'cloud' && source.url) {
        setSrc(source.url);
        return;
      }

      if (source.type === 'base64' && source.url) {
        setSrc(source.url);
        return;
      }

      if (source.type === 'local') {
        setLoading(true);
        setError(false);
        
        try {
          const url = await unifiedImageService.resolveForDisplay(imageUrl);
          setSrc(url);
          
          if (url && url.startsWith('blob:')) {
            objectUrlRef.current = url;
          }
        } catch (err) {
          console.error('[useImageLoader] 加载图片失败:', err);
          setError(true);
        } finally {
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      if (objectUrlRef.current) {
        unifiedImageService.revokeObjectUrl(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [imageUrl]);

  return { src, loading, error };
};
