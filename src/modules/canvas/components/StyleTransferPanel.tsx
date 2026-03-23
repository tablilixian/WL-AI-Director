import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface StyleTransferPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

const styles = [
  { id: 'anime', name: '动漫', emoji: '🎨' },
  { id: 'oil-painting', name: '油画', emoji: '🖼️' },
  { id: 'watercolor', name: '水彩', emoji: '🎨' },
  { id: 'sketch', name: '素描', emoji: '✏️' },
  { id: 'pixel-art', name: '像素', emoji: '👾' },
  { id: 'cyberpunk', name: '赛博朋克', emoji: '🌃' },
  { id: 'ghibli', name: '吉卜力', emoji: '🌸' },
  { id: '3d-render', name: '3D渲染', emoji: '🎮' },
  { id: 'comic', name: '漫画', emoji: '💥' },
  { id: 'pop-art', name: '波普', emoji: '🎭' }
];

export const StyleTransferPanel: React.FC<StyleTransferPanelProps> = ({ selectedLayerId, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleStyleTransfer = async (styleId: string) => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const newImageUrl = await canvasModelService.styleTransfer(
        selectedLayer.src,
        styleId,
        (p) => setProgress(p)
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = newImageUrl;

      if (newImageUrl.startsWith('local:')) {
        const localId = newImageUrl.replace('local:', '');
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          const reader = new FileReader();
          resolvedUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      }

      const styleName = styles.find(s => s.id === styleId)?.name || styleId;

      const newLayerId = crypto.randomUUID();
      addLayer({
        id: newLayerId,
        type: 'image',
        x: selectedLayer.x + selectedLayer.width + 20,
        y: selectedLayer.y,
        width: selectedLayer.width,
        height: selectedLayer.height,
        src: resolvedUrl,
        title: `${selectedLayer.title} - ${styleName}`,
        isLoading: false,
        createdAt: Date.now()
      });

      onClose();
    } catch (error: any) {
      console.error('风格迁移失败:', error);
      alert(`风格迁移失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">风格迁移</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张图片，然后再使用风格迁移功能。
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">风格迁移</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-[var(--text-muted)]">
            选择一种风格，AI 将把图片转换为该风格。
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            当前图片: {selectedLayer?.title}
          </p>
        </div>

        {isProcessing ? (
          <div className="py-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-sm text-[var(--text-muted)]">
              正在进行风格迁移... {progress}%
            </p>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {styles.map((style) => (
              <button
                key={style.id}
                onClick={() => handleStyleTransfer(style.id)}
                className="flex flex-col items-center justify-center p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                <span className="text-2xl mb-1">{style.emoji}</span>
                <span className="text-xs text-white">{style.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
