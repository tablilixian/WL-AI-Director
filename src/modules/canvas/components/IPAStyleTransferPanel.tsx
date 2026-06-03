import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface IPAStyleTransferPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

export const IPAStyleTransferPanel: React.FC<IPAStyleTransferPanelProps> = ({ selectedLayerId, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer } = useCanvasStore();

  const targetLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasTarget = targetLayer?.type === 'image' && targetLayer?.src && !targetLayer?.isLoading;

  const imageLayers = layers.filter(l =>
    l.id !== selectedLayerId && l.type === 'image' && l.src && !l.isLoading
  );

  const toggleRef = (id: string) => {
    setSelectedRefIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!hasTarget || !prompt.trim() || isProcessing || !targetLayer) return;

    setIsProcessing(true);
    setProgress(0);

    const refImages = [targetLayer.src, ...selectedRefIds.map(id => {
      const l = layers.find(ly => ly.id === id);
      return l?.src || '';
    }).filter(Boolean)];

    try {
      const resultUrl = await canvasModelService.ipaStyleTransfer(
        prompt,
        refImages,
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
        title: `${targetLayer.title} - IPA风格迁移`,
        isLoading: false,
        createdAt: Date.now(),
        sourceLayerId: targetLayer.id,
        sourceLayerIds: [targetLayer.id, ...selectedRefIds],
        operationType: 'ipa-style-transfer',
      });

      onClose();
    } catch (error: any) {
      console.error('IPA 风格迁移失败:', error);
      alert(`IPA 风格迁移失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasTarget) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">IPA 风格迁移</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            请先选中一张目标图片，然后再使用 IPA 风格迁移功能。
          </p>
          <button onClick={onClose} className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">IPA 风格迁移</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-3">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="输入场景描述..."
            className="w-full h-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 resize-none focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">目标图片: {targetLayer?.title}</p>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">选择参考图（可多选，作为 style/image1/image2）:</p>
          {imageLayers.length === 0 ? (
            <p className="text-xs text-yellow-400">画布上没有其他可用图片。</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {imageLayers.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggleRef(l.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                    selectedRefIds.includes(l.id)
                      ? 'border-blue-500 ring-2 ring-blue-500/30'
                      : 'border-gray-600 hover:border-gray-400'
                  }`}
                  title={l.title}
                >
                  <img src={l.src} alt={l.title} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white truncate px-1 py-0.5">{l.title}</div>
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
            <p className="text-center text-sm text-[var(--text-muted)]">正在进行 IPA 风格迁移... {progress}%</p>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
              prompt.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            开始生成
          </button>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">取消</button>
        </div>
      </div>
    </div>
  );
};
