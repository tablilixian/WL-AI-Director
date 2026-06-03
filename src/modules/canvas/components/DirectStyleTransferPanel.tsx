import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface DirectStyleTransferPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const DirectStyleTransferPanel: React.FC<DirectStyleTransferPanelProps> = ({ selectedLayerId, onClose }) => {
  const [selectedStyleLayerId, setSelectedStyleLayerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer } = useCanvasStore();

  const targetLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasTarget = targetLayer?.type === 'image' && targetLayer?.src && !targetLayer?.isLoading;

  const imageLayers = layers.filter(l =>
    l.id !== selectedLayerId && l.type === 'image' && l.src && !l.isLoading
  );
  const selectedStyleLayer = selectedStyleLayerId ? layers.find(l => l.id === selectedStyleLayerId) : null;

  const handleStyleTransfer = async () => {
    if (!hasTarget || !selectedStyleLayer || isProcessing || !targetLayer) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const resultUrl = await canvasModelService.directStyleTransfer(
        targetLayer.src,
        selectedStyleLayer.src,
        (p) => setProgress(p),
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
          const imgId = `canvas_direct_style_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const response = await fetch(resolvedUrl);
          const blob = await response.blob();
          await imageStorageService.saveImage(imgId, blob);
          imageId = imgId;
        } catch (e) {
          console.warn('[DirectStyleTransfer] 保存图片到 IndexedDB 失败:', e);
        }
      }

      addLayer({
        id: crypto.randomUUID(),
        type: 'image',
        x: targetLayer.x + targetLayer.width + 20,
        y: targetLayer.y,
        width: targetLayer.width,
        height: targetLayer.height,
        src: resolvedUrl,
        imageId,
        title: `${targetLayer.title} - 风格迁移`,
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: targetLayer.id,
        sourceLayerIds: [targetLayer.id, selectedStyleLayer.id],
        operationType: 'direct-style-transfer',
      });

      onClose();
    } catch (error: any) {
      console.error('风格迁移失败:', error);
      alert(`风格迁移失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasTarget) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">风格参考迁移</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张目标图片，然后再使用风格参考迁移功能。
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
          <h3 className="text-lg font-bold text-[var(--text-primary)]">风格参考迁移</h3>
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
            将选中的风格参考图的风格迁移到目标图片上。
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            目标图片: {targetLayer?.title}
          </p>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            选择风格参考图（点击选择）:
          </p>
          {imageLayers.length === 0 ? (
            <p className="text-xs text-yellow-400">
              画布上没有其他可用图片，请先添加一张风格参考图片。
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {imageLayers.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedStyleLayerId(l.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedStyleLayerId === l.id
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                  title={l.title}
                >
                  <img
                    src={l.src}
                    alt={l.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white truncate px-1 py-0.5">
                    {l.title}
                  </div>
                </button>
              ))}
            </div>
          )}
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
          <button
            onClick={handleStyleTransfer}
            disabled={!selectedStyleLayer}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
              selectedStyleLayer
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            开始风格迁移
          </button>
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
