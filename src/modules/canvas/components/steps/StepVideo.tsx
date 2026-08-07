import React, { useState, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Loader2,
  ArrowLeft,
  Play,
  RefreshCw,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import {
  getGridTimings,
  type StoryboardResultData,
  type DeductionData,
  type VlmAnalysisData,
  type VideoResultData,
  type KeyframePromptData,
} from '../../types/flow';
import { optimizeVideoFramePrompt } from '../../services/promptOptimizer';

interface StepVideoProps {
  sourceLayerId: string;
  vlmData: VlmAnalysisData | null;
  deductionData: DeductionData;
  storyboardData: StoryboardResultData;
  initialData: VideoResultData | null;
  onSave: (data: VideoResultData) => void;
  onNext: () => void;
  onBack: () => void;
}

function assembleKeyframePrompts(
  splitImages: { gridIndex: number; src: string }[],
  deductionData: DeductionData,
  vlmData: VlmAnalysisData | null,
  totalDuration = 15,
): KeyframePromptData[] {
  const activePanels = deductionData.panels
    .filter((p) => p.checked)
    .sort((a, b) => a.index - b.index);
  const timings = getGridTimings(splitImages.length, totalDuration);

  return splitImages.map((img, i) => {
    const panel = activePanels[i];
    const timing = timings[i] || { index: i, start: 0, end: totalDuration };

    const parts: string[] = [`[${timing.start.toFixed(1)}s-${timing.end.toFixed(1)}s]`];
    if (panel?.shotSize) parts.push(`景别:${panel.shotSize}`);
    if (panel?.cameraAngle) parts.push(`机位:${panel.cameraAngle}`);
    if (panel?.subjectPosition) parts.push(`位置:${panel.subjectPosition}`);
    if (panel?.action) parts.push(`动作:${panel.action}`);
    if (panel?.lighting) parts.push(`光照:${panel.lighting}`);
    if (panel?.dialogue && panel.dialogue !== '无') parts.push(`对白:${panel.dialogue}`);

    const styleParts: string[] = [];
    if (vlmData?.schema.style) styleParts.push(vlmData.schema.style);
    if (vlmData?.schema.colorPalette) styleParts.push(vlmData.schema.colorPalette);
    if (vlmData?.schema.lighting) styleParts.push(vlmData.schema.lighting);

    const sceneTransition = panel?.transitionToNext || '';
    let cameraMovement = '';
    if (sceneTransition === '推镜头') cameraMovement = '缓慢推近';
    else if (sceneTransition === '拉镜头') cameraMovement = '缓慢拉远';
    else if (sceneTransition === '横移') cameraMovement = '水平横移';
    else if (sceneTransition === '跟拍') cameraMovement = '跟随主体运动';
    else if (sceneTransition === '环绕') cameraMovement = '环绕主体旋转';

    const visualPrompt = [
      ...parts,
      ...(styleParts.length ? [`风格:${styleParts.join(',')}`] : []),
    ].join('; ');

    return {
      gridIndex: img.gridIndex,
      imageUrl: img.src,
      visualPrompt: visualPrompt || panel?.rawDescription || '',
      cameraMovement,
      sceneTransition,
      action: panel?.action || '',
      dialogue: panel?.dialogue || '',
      timingStart: timing.start,
      timingEnd: timing.end,
    };
  });
}

export const StepVideo: React.FC<StepVideoProps> = ({
  sourceLayerId: _sourceLayerId,
  vlmData,
  deductionData,
  storyboardData,
  initialData,
  onSave,
  onNext,
  onBack,
}) => {
  const [duration, setDuration] = useState(initialData?.duration || 15);
  const [fps, setFps] = useState(initialData?.fps || 30);
  const [keyframePrompts, setKeyframePrompts] = useState<KeyframePromptData[]>(
    () =>
      initialData?.keyframePrompts ||
      assembleKeyframePrompts(
        storyboardData.splitImages.length > 0 ? storyboardData.splitImages : [],
        deductionData,
        vlmData,
        initialData?.duration || 15,
      ),
  );
  const [videoRef, setVideoRef] = useState<string | null>(initialData?.videoUrl || null);
  const [playableUrl, setPlayableUrl] = useState<string>('');

  // 关键帧缩略图 display URL（从 local:xxx 持久引用解析为 blob:xxx 用于渲染）
  const [displayImageUrls, setDisplayImageUrls] = useState<Record<number, string>>({});
  // 旧数据过期检测
  const [framesExpired, setFramesExpired] = useState(false);
  const [videoExpired, setVideoExpired] = useState(false);

  useEffect(() => {
    if (videoRef) {
      // 旧数据检测：blob: URL 在刷新后已失效
      if (videoRef.startsWith('blob:')) {
        setPlayableUrl('');
        setVideoExpired(true);
        return;
      }
      setVideoExpired(false);
      import('../../../../../services/unifiedImageService').then(({ unifiedImageService }) =>
        unifiedImageService.resolveForDisplay(videoRef).then(setPlayableUrl),
      );
    }
  }, [videoRef]);

  // 解析关键帧 imageUrl (local:img_xxx) 为 display URL (blob:xxx)
  useEffect(() => {
    if (keyframePrompts.length === 0) return;
    // 旧数据检测：任何 imageUrl 是 blob: URL 说明是修复前的旧流程
    if (keyframePrompts.some((kp) => kp.imageUrl?.startsWith('blob:'))) {
      setDisplayImageUrls({});
      setFramesExpired(true);
      return;
    }
    setFramesExpired(false);
    let cancelled = false;
    import('../../../../../services/unifiedImageService').then(({ unifiedImageService }) => {
      Promise.all(
        keyframePrompts.map(async (kp, i) => ({
          index: i,
          url: kp.imageUrl ? await unifiedImageService.resolveForDisplay(kp.imageUrl) : '',
        })),
      ).then((results) => {
        if (cancelled) return;
        const map: Record<number, string> = {};
        results.forEach((r) => {
          map[r.index] = r.url;
        });
        setDisplayImageUrls(map);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [keyframePrompts]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 逐帧 Prompt 优化状态
  const [originalPrompts, setOriginalPrompts] = useState<Record<number, string>>({});
  const [optimizingFrame, setOptimizingFrame] = useState<number | null>(null);
  const [frameOptimizeError, setFrameOptimizeError] = useState<string | null>(null);

  const handleOptimizeFrame = useCallback(
    async (frameIndex: number) => {
      const kp = keyframePrompts[frameIndex];
      if (!kp) return;

      setOptimizingFrame(frameIndex);
      setFrameOptimizeError(null);

      // 保存原始 prompt 以便撤销
      setOriginalPrompts((prev) => {
        if (prev[frameIndex] !== undefined) return prev; // 已有备份，不覆盖
        return { ...prev, [frameIndex]: kp.visualPrompt };
      });

      try {
        const styleContext = vlmData
          ? Object.entries(vlmData.schema)
              .filter(([k]) =>
                ['style', 'colorPalette', 'lighting', 'atmosphere', 'composition'].includes(k),
              )
              .map(([, v]) => v)
              .filter(Boolean)
              .join(', ')
          : '';

        const result = await optimizeVideoFramePrompt({
          rawPrompt: kp.visualPrompt,
          frameIndex,
          cameraMovement: kp.cameraMovement,
          action: kp.action,
          styleContext,
        });
        updatePrompt(frameIndex, 'visualPrompt', result.optimizedPrompt);
      } catch (err: any) {
        setFrameOptimizeError(err.message || '帧 prompt 优化失败');
      } finally {
        setOptimizingFrame(null);
      }
    },
    [keyframePrompts, vlmData],
  );

  const handleUndoFrameOptimize = useCallback(
    (frameIndex: number) => {
      const original = originalPrompts[frameIndex];
      if (original !== undefined) {
        updatePrompt(frameIndex, 'visualPrompt', original);
        setOriginalPrompts((prev) => {
          const next = { ...prev };
          delete next[frameIndex];
          return next;
        });
      }
    },
    [originalPrompts],
  );

  const updatePrompt = (index: number, field: keyof KeyframePromptData, value: string | number) => {
    setKeyframePrompts((prev) =>
      prev.map((kp, i) => (i === index ? { ...kp, [field]: value } : kp)),
    );
  };

  const handleGenerate = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const { canvasModelService } = await import('../../services/canvasModelService');

      const totalFrames = duration * fps;
      const segFrames = totalFrames / keyframePrompts.length;
      const frames = keyframePrompts.map((kp, i) => ({
        src: kp.imageUrl,
        frameIndex:
          i === keyframePrompts.length - 1 ? totalFrames : Math.round(segFrames * (i + 1)),
      }));

      const globalPrompt = keyframePrompts.map((kp) => kp.visualPrompt).join('; ');

      const videoResult = await canvasModelService.generateVideoMkr({
        prompt: globalPrompt,
        images: frames,
        width: 640,
        height: 360,
        duration,
        fps,
        onProgress: (pct: number) => {
          console.log(`[Video] Progress: ${pct}%`);
        },
      });

      const { unifiedImageService } = await import('../../../../../services/unifiedImageService');
      // 将 video:xxx 引用保存为持久化 videoUrl，blob URL 只用于显示
      const videoRef = videoResult.startsWith('video:')
        ? videoResult
        : await unifiedImageService.saveVideoToLocal(videoResult);
      const displayUrl = await unifiedImageService.resolveForDisplay(videoRef);
      setPlayableUrl(displayUrl);
      setVideoRef(videoRef);
    } catch (err: any) {
      setError(err.message || '视频生成失败');
    } finally {
      setIsProcessing(false);
    }
  }, [keyframePrompts, isProcessing, duration, fps]);

  const handleConfirm = () => {
    onSave({ keyframePrompts, videoUrl: videoRef ?? undefined, duration, fps });
    onNext();
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline mt-1">
            关闭
          </button>
        </div>
      )}

      {/* 时长/帧率设置 */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">
            时长（秒）
          </label>
          <input
            type="number"
            min={4}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] focus:border-amber-500 outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-medium text-[var(--text-tertiary)] block mb-1">
            帧率（fps）
          </label>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-full px-2 py-1.5 bg-[var(--bg-base)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] focus:border-amber-500 outline-none"
          >
            <option value={24}>24</option>
            <option value={25}>25</option>
            <option value={30}>30</option>
          </select>
        </div>
      </div>

      <div className="bg-[var(--bg-base)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
        <div className="px-4 py-2 bg-gray-800 border-b border-[var(--border-primary)] flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
            关键帧 Prompt（可编辑）
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">
            {keyframePrompts.length} 帧 / {duration}s @ {fps}fps
          </span>
        </div>
        <div className="p-3 space-y-3">
          {keyframePrompts.map((kp, i) => (
            <div key={i} className="border border-[var(--border-primary)] rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center">
                  F{i + 1}
                </div>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  {kp.timingStart.toFixed(1)}s → {kp.timingEnd.toFixed(1)}s
                  <span className="ml-1.5 text-[var(--text-muted)]">
                    (帧:{' '}
                    {i === keyframePrompts.length - 1
                      ? duration * fps
                      : Math.round(((duration * fps) / keyframePrompts.length) * (i + 1))}
                    )
                  </span>
                </span>
              </div>
              <div className="flex gap-2">
                <div className="w-14 h-10 bg-[var(--bg-hover)] rounded overflow-hidden flex-shrink-0 border border-[var(--border-primary)] flex items-center justify-center">
                  {framesExpired ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : displayImageUrls[i] ? (
                    <img src={displayImageUrls[i]} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 space-y-1">
                  <textarea
                    value={kp.visualPrompt}
                    onChange={(e) => updatePrompt(i, 'visualPrompt', e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[10px] text-[var(--text-primary)] resize-none focus:border-amber-500 outline-none font-mono"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOptimizeFrame(i)}
                      disabled={optimizingFrame !== null}
                      className="inline-flex items-center gap-1 text-[9px] text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="AI 优化此帧 Prompt，使其更具电影感"
                    >
                      {optimizingFrame === i ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      优化此帧
                    </button>
                    {originalPrompts[i] !== undefined && (
                      <button
                        onClick={() => handleUndoFrameOptimize(i)}
                        className="inline-flex items-center gap-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                        title="撤销优化，恢复原始 prompt"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        撤销
                      </button>
                    )}
                    {frameOptimizeError && optimizingFrame === null && (
                      <span className="text-[9px] text-red-400">{frameOptimizeError}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={kp.cameraMovement}
                      onChange={(e) => updatePrompt(i, 'cameraMovement', e.target.value)}
                      placeholder="运镜"
                      className="flex-1 px-1.5 py-0.5 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[9px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                    />
                    <input
                      value={kp.sceneTransition}
                      onChange={(e) => updatePrompt(i, 'sceneTransition', e.target.value)}
                      placeholder="转场"
                      className="flex-1 px-1.5 py-0.5 bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded text-[9px] text-[var(--text-primary)] focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!playableUrl && !isProcessing && (
        <>
          {videoExpired && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-400">视频已过期（旧数据），请重新生成</span>
            </div>
          )}
          <button
            onClick={handleGenerate}
            className="w-full py-3 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            AI 生成 {duration} 秒视频
          </button>
        </>
      )}

      {isProcessing && (
        <div className="py-8 text-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">正在生成视频（约需 2-5 分钟）...</p>
        </div>
      )}

      {playableUrl && (
        <>
          <div className="bg-[var(--bg-base)] rounded-lg border border-green-500/30 overflow-hidden">
            <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center justify-between">
              <span className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5" /> 生成结果
              </span>
              <button
                onClick={handleGenerate}
                disabled={isProcessing}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 重新生成
              </button>
            </div>
            <div className="p-3">
              <video
                src={playableUrl}
                controls
                className="w-full rounded-lg bg-black max-h-52"
                poster={displayImageUrls[0]}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onBack}
              className="flex-1 py-2 border border-[var(--border-primary)] text-[var(--text-secondary)] text-sm rounded-lg hover:text-[var(--text-primary)] flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> 返回宫格
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" /> 完成
            </button>
          </div>
        </>
      )}
    </div>
  );
};
