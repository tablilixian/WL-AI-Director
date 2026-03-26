import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface VariantPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

const variantCounts = [
  { id: 2, name: '2 个' },
  { id: 4, name: '4 个' },
  { id: 6, name: '6 个' }
];

export const VariantPanel: React.FC<VariantPanelProps> = ({ selectedLayerId, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [variantCount, setVariantCount] = useState(4);
  const [strength, setStrength] = useState(0.7);
  const { layers, addLayer, updateLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleGenerateVariants = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const variants = await canvasModelService.generateVariants(
        selectedLayer.src,
        { count: variantCount, strength },
        (p) => setProgress(p)
      );

      const { imageStorageService } = await import('../../../../services/imageStorageService');

      for (let i = 0; i < variants.length; i++) {
        let resolvedUrl = variants[i];
        let imageId: string | undefined;

        if (variants[i].startsWith('local:')) {
          const localId = variants[i].replace('local:', '');
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
            const imgId = `canvas_variant_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
            const response = await fetch(resolvedUrl);
            const blob = await response.blob();
            await imageStorageService.saveImage(imgId, blob);
            imageId = imgId;
            console.log(`[Variant] 变体 ${i + 1} 已保存到 IndexedDB:`, imgId);
          } catch (e) {
            console.warn(`[Variant] 保存变体 ${i + 1} 到 IndexedDB 失败:`, e);
          }
        }

        const col = i % 2;
        const row = Math.floor(i / 2);
        const newLayerId = crypto.randomUUID();
        addLayer({
          id: newLayerId,
          type: 'image',
          x: selectedLayer.x + col * (selectedLayer.width + 20),
          y: selectedLayer.y + row * (selectedLayer.height + 20),
          width: selectedLayer.width,
          height: selectedLayer.height,
          src: resolvedUrl,
          imageId,
          title: `${selectedLayer.title} - 变体 ${i + 1}`,
          isLoading: false,
          createdAt: Date.now(),
          sourceLayerId: selectedLayer.id,
          operationType: 'variant'
        });
      }

      onClose();
    } catch (error: any) {
      console.error('生成变体失败:', error);
      alert(`生成变体失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">生成变体</h3>
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
          <h3 className="text-lg font-bold text-[var(--text-primary)]">生成变体</h3>
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
            基于当前图片，生成多个风格/构图相似但细节不同的变体。
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            基于图片: {selectedLayer?.title}
          </p>
        </div>

        {isProcessing ? (
          <div className="py-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-center text-sm text-[var(--text-muted)]">
              正在生成变体... {progress}%
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
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-400 mb-2 block">变体数量</label>
              <div className="flex gap-2">
                {variantCounts.map((count) => (
                  <button
                    key={count.id}
                    onClick={() => setVariantCount(count.id)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm transition-colors ${
                      variantCount === count.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {count.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-gray-400 mb-2 block">
                变体强度: {Math.round(strength * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(strength * 100)}
                onChange={(e) => setStrength(parseInt(e.target.value) / 100)}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>弱</span>
                <span>强</span>
              </div>
            </div>

            <button
              onClick={handleGenerateVariants}
              className="w-full py-3 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              生成 {variantCount} 个变体
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
