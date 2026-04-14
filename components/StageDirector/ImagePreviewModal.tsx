import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { unifiedImageService } from '../../services/unifiedImageService';

interface ImagePreviewModalProps {
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ imageUrl, title, onClose }) => {
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
        const url = await unifiedImageService.resolveForDisplay(imageUrl);
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
      className="fixed inset-0 z-50 bg-[var(--overlay-full)] backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button 
        className="absolute top-6 right-6 p-3 bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] rounded-full text-[var(--text-primary)] transition-colors z-10"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>
      
      {title && (
        <div className="absolute top-6 left-6 z-10">
            <div className="bg-[var(--overlay-medium)] backdrop-blur-sm px-4 py-2 rounded-lg border border-[var(--overlay-border)]">
            <h3 className="text-[var(--text-primary)] font-bold text-sm">{title}</h3>
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-center p-8 w-full h-full">
        {loading ? (
          <div className="flex items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-[var(--accent)]" />
          </div>
        ) : src ? (
          <img 
            src={src} 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            alt={title || 'Preview'}
          />
        ) : null}
      </div>
      
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-[var(--overlay-medium)] backdrop-blur-sm px-4 py-2 rounded-full border border-[var(--overlay-border)]">
          <p className="text-[var(--text-primary)]/60 text-xs">点击任意位置关闭</p>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
