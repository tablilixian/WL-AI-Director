import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { getImageUrl } from '../../utils/imageUtils';

interface ImagePreviewModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, onClose }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadImage = async () => {
      if (!imageUrl) {
        setSrc(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const url = await getImageUrl(imageUrl);
        setSrc(url);
      } catch (err) {
        console.error('[ImagePreviewModal] 加载图片失败:', err);
        setSrc(null);
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [imageUrl]);

  if (!imageUrl) return null;

  return (
    <div 
      className="absolute inset-0 z-50 bg-[var(--bg-base)]/95 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-3 hover:bg-[var(--text-primary)]/10 rounded-full transition-colors group z-10"
      >
        <X className="w-6 h-6 text-[var(--text-primary)] group-hover:rotate-90 transition-transform" />
      </button>
      <div className="flex items-center justify-center p-8 w-full h-full">
        {loading ? (
          <div className="flex items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-[var(--accent)]" />
          </div>
        ) : src ? (
          <img 
            src={src} 
            alt="Preview" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : null}
      </div>
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-2 bg-[var(--bg-base)]/60 backdrop-blur rounded-lg border border-[var(--overlay-border)]">
        <p className="text-xs text-[var(--text-secondary)] font-mono">点击任意处关闭</p>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
