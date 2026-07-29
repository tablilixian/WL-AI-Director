import React, { useState } from 'react';
import { useCanvasStore } from '../../hooks/useCanvasState';
import { Image } from 'lucide-react';

interface StepSelectImageProps {
  sourceLayerId: string | null;
  onSelect: (layerId: string) => void;
  onNext: () => void;
}

export const StepSelectImage: React.FC<StepSelectImageProps> = ({ sourceLayerId, onSelect, onNext }) => {
  const { layers } = useCanvasStore();
  const imageLayers = layers.filter(l => l.type === 'image' && !l.isLoading && l.src);
  const [selectedId, setSelectedId] = useState<string | null>(sourceLayerId);

  const selectedLayer = selectedId ? imageLayers.find(l => l.id === selectedId) : null;

  const handleConfirm = () => {
    if (!selectedId) return;
    onSelect(selectedId);
    onNext();
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] p-4">
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Image className="w-4 h-4" />
          选择画布上的图片作为推演起点
        </h4>

        {imageLayers.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--text-muted)]">
            画布上没有图片，请先上传图片
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-64 overflow-y-auto">
            {imageLayers.map(layer => (
              <button
                key={layer.id}
                onClick={() => setSelectedId(layer.id)}
                className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                  selectedId === layer.id
                    ? 'border-amber-500 ring-2 ring-amber-500/30'
                    : 'border-transparent hover:border-[var(--border-primary)]'
                }`}
              >
                <img src={layer.src} alt={layer.title} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                  <p className="text-[10px] text-white truncate">{layer.title}</p>
                </div>
                {selectedId === layer.id && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedLayer && (
        <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)]">
            <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">已选图片</span>
          </div>
          <div className="p-3">
            <div className="aspect-video bg-[var(--bg-hover)] rounded-lg overflow-hidden max-w-sm mx-auto">
              <img src={selectedLayer.src} className="w-full h-full object-cover" alt={selectedLayer.title} />
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center mt-2">{selectedLayer.title}</p>
            <p className="text-[10px] text-[var(--text-muted)] text-center">{selectedLayer.width}×{selectedLayer.height}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={!selectedId}
          className="px-6 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          确认，进入分析
        </button>
      </div>
    </div>
  );
};
