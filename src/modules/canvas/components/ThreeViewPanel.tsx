import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';

interface ThreeViewPanelProps {
  selectedLayerId: string | null;
  onClose: () => void;
}

type GenerationMode = 'three-view' | 'turnaround-9';

const MODE_LABELS: Record<GenerationMode, string> = {
  'three-view': '正/侧/背三视图',
  'turnaround-9': '九宫格多角度',
};

const MODE_DESCRIPTIONS: Record<GenerationMode, string> = {
  'three-view': '生成角色的正面、侧面、背面三张视图，以3宫格组合展示',
  'turnaround-9': '生成角色9个不同角度的视图，以3×3九宫格组合展示',
};

export const ThreeViewPanel: React.FC<ThreeViewPanelProps> = ({ selectedLayerId, onClose }) => {
  const [mode, setMode] = useState<GenerationMode>('three-view');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { layers, addLayer } = useCanvasStore();

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasSelectedImage = selectedLayer?.type === 'image' && selectedLayer?.src && !selectedLayer?.isLoading;

  const handleGenerate = async () => {
    if (!hasSelectedImage || !selectedLayer || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const { imageStorageService } = await import('../../../../services/imageStorageService');

      if (mode === 'three-view') {
        const prompt = `Character three-view reference sheet with 3 EQUAL-SIZED panels side by side. Left: front view, Center: side/profile view, Right: back view. ALL 3 panels must be IDENTICAL in size. Clean white or transparent background. Consistent character design across all views. Professional character design sheet, turnaround reference.`;

        const imageUrl = await canvasModelService.generateImage({
          prompt,
          referenceImages: [selectedLayer.src],
          aspectRatio: '16:9',
          onProgress: (p) => setProgress(p),
        });

        let resolvedUrl = imageUrl;
        let imageId: string | undefined;

        if (imageUrl.startsWith('local:')) {
          const localId = imageUrl.replace('local:', '');
          imageId = localId;
          const blob = await imageStorageService.getImage(localId);
          if (blob) {
            const reader = new FileReader();
            resolvedUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        } else if (imageUrl.startsWith('data:')) {
          const imgId = `three_view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          await imageStorageService.saveImage(imgId, blob);
          imageId = imgId;
        }

        addLayer({
          id: crypto.randomUUID(),
          type: 'image',
          x: selectedLayer.x,
          y: selectedLayer.y + selectedLayer.height + 40,
          width: selectedLayer.width * 1.5,
          height: selectedLayer.height * 0.6,
          src: resolvedUrl,
          imageId,
          title: `${selectedLayer.title} - 三视图`,
          createdAt: Date.now(),
          sourceLayerId: selectedLayer.id,
          operationType: 'three-view',
        });

        addLayer({
          id: crypto.randomUUID(),
          type: 'image',
          x: selectedLayer.x,
          y: selectedLayer.y + selectedLayer.height + 40,
          width: size,
          height: size,
          src: resolvedUrl,
          imageId,
          title: `${selectedLayer.title} - 九宫格多角度`,
          createdAt: Date.now(),
          sourceLayerId: selectedLayer.id,
          operationType: 'three-view',
        });
      }

      onClose();
    } catch (error: any) {
      console.error('三视图生成失败:', error);
      alert(`三视图生成失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!hasSelectedImage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[var(--bg-primary)] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
          <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">角色三视图</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">请先选中一张角色图片，然后再使用此功能。</p>
          <button onClick={onClose} className="w-full py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-lg w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)]">
          <div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">角色三视图</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              基于「{selectedLayer?.title}」生成角色多角度视图
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isProcessing ? (
            <div className="py-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-center text-sm text-[var(--text-muted)] mb-2">正在生成三视图... {progress}%</p>
              <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden max-w-md mx-auto">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">生成模式</label>
                <div className="flex gap-2">
                  {(Object.entries(MODE_LABELS) as [GenerationMode, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setMode(key)}
                      className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                        mode === key
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-[var(--border-primary)] bg-[var(--bg-hover)] hover:border-[var(--border-secondary)]'
                      }`}
                    >
                      <div className="text-sm font-bold text-[var(--text-primary)]">{label}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-1">{MODE_DESCRIPTIONS[key]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-[var(--text-muted)] bg-[var(--bg-base)] p-3 rounded-lg border border-[var(--border-primary)]">
                <p>基于角色的定妆照，AI 会保持角色设计的一致性，生成正面、侧面、背面的多角度视图。适合用于角色设计确认和后续分镜制作。</p>
              </div>
            </>
          )}
        </div>

        {!isProcessing && (
          <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors">
              取消
            </button>
            <button
              onClick={handleGenerate}
              className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
            >
              生成{mode === 'three-view' ? '三视图' : '九宫格'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
