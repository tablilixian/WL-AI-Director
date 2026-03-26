import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface RemoveBackgroundPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const RemoveBackgroundPanel: React.FC<RemoveBackgroundPanelProps> = ({ selectedLayerId, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleRemoveBackground = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const resultUrl = await canvasModelService.removeBackground(
        selectedLayer.src,
        (p) => setProgress(p)
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = resultUrl;
      let imageId: string | undefined;

      if (resultUrl.startsWith('local:')) {
        const localId = resultUrl.replace('local:', '');
        imageId = localId;
        const blob = await imageStorageService.getImage(localId);
        if (blob) {
          const reader = new FileReader();
          resolvedUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } else if (resolvedUrl.startsWith('data:')) {
        try {
          const imgId = `canvas_removebg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const response = await fetch(resolvedUrl);
          const blob = await response.blob();
          await imageStorageService.saveImage(imgId, blob);
          imageId = imgId;
          console.log('[RemoveBackground] 抠图结果已保存到 IndexedDB:', imgId);
        } catch (e) {
          console.warn('[RemoveBackground] 保存图片到 IndexedDB 失败:', e);
        }
      }

      const newLayerId = crypto.randomUUID();
      addLayer({
        id: newLayerId,
        type: 'image',
        x: selectedLayer.x + selectedLayer.width + 20,
        y: selectedLayer.y,
        width: selectedLayer.width,
        height: selectedLayer.height,
        src: resolvedUrl,
        imageId,
        title: `${selectedLayer.title} - 抠图`,
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: selectedLayer.id,
        operationType: 'background-remove'
      });

      onClose();
    } catch (error: any) {
      console.error('抠图失败:', error);
      alert(`抠图失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">智能抠图</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张图片，然后再使用此功能。
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
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">智能抠图</h3>
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
            AI 将自动识别图片中的主体，去除背景，生成透明背景图片。
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
              正在智能抠图... {progress}%
            </p>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="aspect-video bg-gray-900 rounded-lg mb-4 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-2">✂️</div>
                <div className="text-sm text-gray-400">点击开始抠图</div>
              </div>
            </div>

            <button
              onClick={handleRemoveBackground}
              className="w-full py-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              开始抠图
            </button>
          </>
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
