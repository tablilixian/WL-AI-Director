import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface DirectStyleTransferPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const DirectStyleTransferPanel: React.FC<DirectStyleTransferPanelProps> = ({ selectedLayerId, onClose }) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [enhancePrompt, setEnhancePrompt] = useState('');
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const { layers, addLayer } = useCanvasStore();

  const styleRefLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasStyleRef = styleRefLayer?.type === 'image' && styleRefLayer?.src && !styleRefLayer?.isLoading;

  const targetImageLayers = layers.filter(l =>
    l.id !== selectedLayerId && l.type === 'image' && l.src && !l.isLoading
  );
  const selectedTargetLayer = selectedTargetId ? layers.find(l => l.id === selectedTargetId) : null;

  const handleStyleTransfer = async () => {
    if (!hasStyleRef || !selectedTargetLayer || isProcessing || !styleRefLayer) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const resultUrl = await canvasModelService.directStyleTransfer(
        selectedTargetLayer.src,
        styleRefLayer.src,
        (p) => setProgress(p),
        enhancePrompt || undefined,
        enhanceEnabled || undefined,
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
        x: selectedTargetLayer.x + selectedTargetLayer.width + 20,
        y: selectedTargetLayer.y,
        width: selectedTargetLayer.width,
        height: selectedTargetLayer.height,
        src: resolvedUrl,
        imageId,
        title: `${selectedTargetLayer.title} - 风格迁移`,
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: selectedTargetLayer.id,
        sourceLayerIds: [selectedTargetLayer.id, styleRefLayer.id],
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

  if (!hasStyleRef) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">风格参考迁移</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张图片作为风格参考，然后再使用风格参考迁移功能。
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

        <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
          选中的图片作为<strong className="text-purple-400">风格参考图</strong>，
          再选一张作为<strong className="text-blue-400">要迁移的目标图</strong>。
          风格参考图的色彩、纹理和整体风格将被迁移到目标图上。
        </p>

        <div className="mb-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400">风格参考图</span>
            <span className="text-sm font-medium text-[var(--text-primary)]">— 此图的风格将被迁移</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-lg overflow-hidden border border-purple-500/30 shrink-0">
              <img src={styleRefLayer?.src} alt={styleRefLayer?.title} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--text-primary)] truncate font-medium">{styleRefLayer?.title}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">色彩、纹理、整体风格走向</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            选择要迁移的目标图（点击选择）:
          </p>
          {targetImageLayers.length === 0 ? (
            <p className="text-xs text-yellow-400">
              画布上没有其他可用图片，请先添加一张目标图片。
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {targetImageLayers.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedTargetId(l.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedTargetId === l.id
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

        {selectedTargetLayer && (
          <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">目标图</span>
              <span className="text-sm font-medium text-[var(--text-primary)]">已选中</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg overflow-hidden border border-blue-500/30 shrink-0">
                <img src={selectedTargetLayer.src} alt={selectedTargetLayer.title} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate font-medium">{selectedTargetLayer.title}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">此图将被应用风格参考图的风格</p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 p-3 bg-gray-800/50 rounded-lg space-y-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            高级选项 <span className="text-xs text-gray-500 font-normal">（可选）</span>
          </p>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">
              增强提示词
            </label>
            <input
              type="text"
              value={enhancePrompt}
              onChange={(e) => setEnhancePrompt(e.target.value)}
              placeholder="例如：让色彩更鲜艳..."
              className="w-full px-3 py-1.5 text-sm bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enhanceEnabled}
              onChange={(e) => setEnhanceEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-[var(--text-muted)]">增强风格迁移效果</span>
          </label>
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
            disabled={!selectedTargetLayer}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
              selectedTargetLayer
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
