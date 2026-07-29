import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, ArrowLeft, Check } from 'lucide-react';
import { useCanvasStore } from '../../hooks/useCanvasState';
import type { DeductionData, StoryboardResultData } from '../../types/flow';

interface StepStoryboardProps {
  sourceLayerId: string;
  deductionData: DeductionData;
  initialData: StoryboardResultData | null;
  onSave: (data: StoryboardResultData) => void;
  onNext: () => void;
  onBack: () => void;
}

export const StepStoryboard: React.FC<StepStoryboardProps> = ({ sourceLayerId, deductionData, initialData, onSave, onNext, onBack }) => {
  const { layers } = useCanvasStore();
  const sourceLayer = layers.find(l => l.id === sourceLayerId);

  const [compositeUrl, setCompositeUrl] = useState<string | null>(initialData?.compositeImageUrl || null);
  const [splitImages, setSplitImages] = useState<{ gridIndex: number; src: string }[]>(initialData?.splitImages || []);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePanels = deductionData.panels.filter(p => p.checked);

  const handleGenerate = useCallback(async () => {
    if (!sourceLayer?.src || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { callImageApi } = await import('../../../../../services/adapters/imageAdapter');
      const { unifiedImageService } = await import('../../../../../services/unifiedImageService');

      const resolvedUrl = await unifiedImageService.resolveForApi(sourceLayer.src);

      const descText = activePanels
        .sort((a, b) => a.index - b.index)
        .map(p => {
          const parts = [p.shotSize, p.cameraAngle, p.subjectPosition, p.action, p.lighting].filter(Boolean);
          return parts.join('，') || p.rawDescription || `分镜${p.index + 1}`;
        })
        .join('\n');

      const resultUrl = await callImageApi({
        prompt: descText,
        referenceImages: [resolvedUrl],
        isStoryboard: true,
        gridnum: 4,
        itemWidth: 1024,
      });

      setCompositeUrl(resultUrl);

      const displayUrl = await unifiedImageService.resolveForDisplay(resultUrl);
      setCompositeUrl(displayUrl);

      if (!resultUrl) throw new Error('缺少合成图');
      const { callDramaBackendSpliteGridApi } = await import('../../../../../services/adapters/imageAdapter');
      try {
        const splitResult = await callDramaBackendSpliteGridApi({
          prompt: '',
          referenceImages: [resultUrl],
          isSpliteGrid: true,
          spliteGridRow: 2,
          spliteGridColumn: 2,
        });
        if (Array.isArray(splitResult) && splitResult.length === 4) {
          const loaded = await Promise.all(
            splitResult.map(async (url: string, i: number) => ({
              gridIndex: i,
              src: await unifiedImageService.resolveForDisplay(url),
            }))
          );
          setSplitImages(loaded);
        }
      } catch {
        setSplitImages([]);
      }
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setIsProcessing(false);
    }
  }, [sourceLayer, activePanels, isProcessing]);

  const handleConfirm = () => {
    onSave({ compositeImageUrl: compositeUrl || '', splitImages });
    onNext();
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline mt-1">关闭</button>
        </div>
      )}

      {!compositeUrl && !isProcessing && (
        <button
          onClick={handleGenerate}
          className="w-full py-3 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          开始生成宫格图
        </button>
      )}

      {isProcessing && (
        <div className="py-8 text-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">正在生成宫格图并切分关键帧...</p>
        </div>
      )}

      {compositeUrl && (
        <>
          <div className="bg-[var(--bg-base)] rounded-lg border border-green-500/30 overflow-hidden">
            <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between">
              <span className="text-xs font-bold text-green-400 uppercase tracking-wider">四宫格合成图</span>
              <button
                onClick={handleGenerate}
                disabled={isProcessing}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> 重新生成
              </button>
            </div>
            <div className="p-3">
              <img src={compositeUrl} className="w-full rounded-lg" alt="四宫格" />
            </div>
          </div>

          {splitImages.length > 0 && (
            <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)]">
                <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">切分后的 4 张关键帧</span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-4 gap-2">
                  {splitImages.map((img, i) => (
                    <div key={i} className="aspect-video bg-[var(--bg-hover)] rounded overflow-hidden border border-[var(--border-primary)]">
                      <img src={img.src} className="w-full h-full object-cover" alt={`关键帧${i + 1}`} />
                      <div className="text-center text-[9px] text-[var(--text-muted)] py-0.5">帧{i + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onBack} className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] flex items-center justify-center gap-1">
              <ArrowLeft className="w-4 h-4" /> 返回推演
            </button>
            <button onClick={handleConfirm} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> 确认，生成视频
            </button>
          </div>
        </>
      )}
    </div>
  );
};
