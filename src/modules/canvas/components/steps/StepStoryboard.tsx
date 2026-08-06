import React, { useState, useCallback, useEffect } from 'react';
import { Sparkles, Loader2, ArrowLeft, Check, AlertCircle } from 'lucide-react';
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

  // 持久引用 (local:img_xxx) — 保存到 flow state，刷新后仍有效
  const [compositeRef, setCompositeRef] = useState<string | null>(initialData?.compositeImageUrl || null);
  const [splitImageRefs, setSplitImageRefs] = useState<{ gridIndex: number; src: string }[]>(initialData?.splitImages || []);
  // 显示用 URL (blob:xxx) — 仅当前会话有效，刷新后需重新解析
  const [compositeDisplayUrl, setCompositeDisplayUrl] = useState<string>('');
  const [splitDisplayUrls, setSplitDisplayUrls] = useState<Record<number, string>>({});
  // 旧数据过期检测：如果存的是 blob: URL 说明是修复前的旧流程，刷新后已失效
  const [compositeExpired, setCompositeExpired] = useState(false);
  const [splitExpired, setSplitExpired] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePanels = deductionData.panels.filter(p => p.checked);

  // 挂载时 / 持久引用变化时，解析为 display URL
  useEffect(() => {
    if (!compositeRef) {
      setCompositeDisplayUrl('');
      setCompositeExpired(false);
      return;
    }
    // 旧数据检测：blob: URL 在刷新后已失效
    if (compositeRef.startsWith('blob:')) {
      setCompositeDisplayUrl('');
      setCompositeExpired(true);
      return;
    }
    let cancelled = false;
    import('../../../../../services/unifiedImageService').then(({ unifiedImageService }) => {
      unifiedImageService.resolveForDisplay(compositeRef).then(url => {
        if (!cancelled) {
          setCompositeDisplayUrl(url);
          setCompositeExpired(false);
        }
      });
    });
    return () => { cancelled = true; };
  }, [compositeRef]);

  useEffect(() => {
    if (splitImageRefs.length === 0) {
      setSplitDisplayUrls({});
      setSplitExpired(false);
      return;
    }
    // 旧数据检测：任何 src 是 blob: URL 说明是修复前的旧流程
    if (splitImageRefs.some(img => img.src?.startsWith('blob:'))) {
      setSplitDisplayUrls({});
      setSplitExpired(true);
      return;
    }
    let cancelled = false;
    import('../../../../../services/unifiedImageService').then(({ unifiedImageService }) => {
      Promise.all(
        splitImageRefs.map(async (img) => ({
          gridIndex: img.gridIndex,
          url: await unifiedImageService.resolveForDisplay(img.src),
        }))
      ).then(results => {
        if (cancelled) return;
        const map: Record<number, string> = {};
        results.forEach(r => { map[r.gridIndex] = r.url; });
        setSplitDisplayUrls(map);
        setSplitExpired(false);
      });
    });
    return () => { cancelled = true; };
  }, [splitImageRefs]);

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

      // 保存持久引用，display URL 由 useEffect 自动解析
      setCompositeRef(resultUrl);

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
          // 保存持久引用 (local:img_xxx)，display URL 由 useEffect 自动解析
          const loaded = splitResult.map((url: string, i: number) => ({
            gridIndex: i,
            src: url,
          }));
          setSplitImageRefs(loaded);
        }
      } catch {
        setSplitImageRefs([]);
      }
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setIsProcessing(false);
    }
  }, [sourceLayer, activePanels, isProcessing]);

  const handleConfirm = () => {
    // 保存持久引用到 flow state
    onSave({ compositeImageUrl: compositeRef || '', splitImages: splitImageRefs });
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

      {!compositeRef && !isProcessing && (
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

      {compositeRef && (
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
              {compositeDisplayUrl ? (
                <img src={compositeDisplayUrl} className="w-full rounded-lg" alt="四宫格" />
              ) : compositeExpired ? (
                <div className="w-full aspect-video bg-red-500/5 rounded-lg flex flex-col items-center justify-center gap-2 border border-red-500/20">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <p className="text-xs text-red-400">图片已过期（旧数据）</p>
                  <button onClick={handleGenerate} disabled={isProcessing}
                    className="text-[10px] text-amber-400 hover:text-amber-300 underline flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> 重新生成
                  </button>
                </div>
              ) : (
                <div className="w-full aspect-video bg-[var(--bg-hover)] rounded-lg flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-[var(--text-muted)] animate-spin" />
                </div>
              )}
            </div>
          </div>

          {splitImageRefs.length > 0 && (
            <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)]">
                <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">切分后的 4 张关键帧</span>
              </div>
              <div className="p-3">
                {splitExpired ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-xs text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    关键帧已过期，请重新生成宫格图
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {splitImageRefs.map((img, i) => (
                      <div key={i} className="aspect-video bg-[var(--bg-hover)] rounded overflow-hidden border border-[var(--border-primary)]">
                        {splitDisplayUrls[img.gridIndex] ? (
                          <img src={splitDisplayUrls[img.gridIndex]} className="w-full h-full object-cover" alt={`关键帧${i + 1}`} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="w-3 h-3 text-[var(--text-muted)] animate-spin" />
                          </div>
                        )}
                        <div className="text-center text-[9px] text-[var(--text-muted)] py-0.5">帧{i + 1}</div>
                      </div>
                    ))}
                  </div>
                )}
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
