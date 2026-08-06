import React, { useState } from 'react';
import { useCanvasStore } from '../../hooks/useCanvasState';
import { Image, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { ResolvedImage } from '../ResolvedImage';

interface StepSelectImageProps {
  sourceLayerId: string | null;
  onSelect: (layerId: string) => void;
  onNext: () => void;
}

export const StepSelectImage: React.FC<StepSelectImageProps> = ({ sourceLayerId, onSelect, onNext }) => {
  const { layers } = useCanvasStore();
  const imageLayers = layers.filter(l => l.type === 'image' && !l.isLoading && l.src);
  const [selectedId, setSelectedId] = useState<string | null>(sourceLayerId);
  const [showGrid, setShowGrid] = useState(!sourceLayerId);

  const selectedLayer = selectedId ? imageLayers.find(l => l.id === selectedId) : null;

  const handleConfirm = () => {
    if (!selectedId) return;
    onSelect(selectedId);
    onNext();
  };

  if (!selectedLayer) {
    return (
      <div className="text-center py-8 text-sm text-[var(--text-muted)]">
        未找到选中的图片，请返回画布重新选择
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 已选源图预览 */}
      <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)] flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
            推演源图
          </span>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            换一张
            {showGrid ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        <div className="p-4">
          <div className="aspect-video bg-[var(--bg-hover)] rounded-lg overflow-hidden max-w-lg mx-auto">
            <ResolvedImage src={selectedLayer.src} className="w-full h-full object-cover" alt={selectedLayer.title} />
          </div>
          <p className="text-sm text-[var(--text-primary)] text-center mt-3 font-medium">{selectedLayer.title || '未命名图片'}</p>
          <p className="text-xs text-[var(--text-muted)] text-center mt-1">
            {selectedLayer.width} × {selectedLayer.height}
          </p>
          <p className="text-xs text-[var(--text-muted)] text-center mt-0.5">
            这张图片将作为推演流程的视觉起点
          </p>
        </div>
      </div>

      {/* 可折叠的图片选择网格 */}
      {showGrid && imageLayers.length > 1 && (
        <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] p-4">
          <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Image className="w-4 h-4" />
            更换源图
          </h4>
          <div className="grid grid-cols-4 gap-3 max-h-48 overflow-y-auto">
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
                <ResolvedImage src={layer.src} alt={layer.title} className="w-full h-full object-cover" />
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
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={!selectedId}
          className="px-6 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          确认并开始分析
        </button>
      </div>
    </div>
  );
};
