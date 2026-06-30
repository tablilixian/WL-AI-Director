import React, { useState, useMemo, useCallback } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { X, Sparkles, Plus, Trash2, ChevronUp, ChevronDown, Film, Grid } from 'lucide-react';
import type { LayerData } from '../types/canvas';

interface MkrVideoConfigBarProps {
  layerId: string;
}

type MkrWorkMode = 'regular' | 'grid';

interface MkrFrameConfig {
  layerId: string;
  frameIndex: number;
  prompt: string;
}

interface MkrGenerationConfig {
  mode: MkrWorkMode;
  frames: MkrFrameConfig[];
  globalPrompt: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  // Grid mode
  gridtype: number;
  gridFrameIndexs: number[];
}

const VIDEO_SIZE_PRESETS = [
  { label: '横屏 720p', width: 1280, height: 720 },
  { label: '测试 640p', width: 640, height: 320 },
  { label: '竖屏 720p', width: 720, height: 1280 },
  { label: '方形 720p', width: 720, height: 720 },
];

function parseConfig(layer: LayerData | undefined): MkrGenerationConfig | null {
  if (!layer?.generationPrompt) return null;
  try {
    return JSON.parse(layer.generationPrompt) as MkrGenerationConfig;
  } catch {
    return null;
  }
}

function buildConfig(sourceLayerIds: string[] | undefined, layers: LayerData[]): MkrGenerationConfig {
  const ids = sourceLayerIds || [];
  const sourceLayers = ids.map(id => layers.find(l => l.id === id)).filter(Boolean) as LayerData[];
  const totalFrames = 360;
  const gridFrames = ids.length > 0 ? ids.length : 4;
  return {
    mode: 'regular',
    frames: sourceLayers.map((l, i) => ({
      layerId: l.id,
      frameIndex: i === 0 ? 0 : i === sourceLayers.length - 1 ? -1 : Math.round(i * totalFrames / (sourceLayers.length - 1)),
      prompt: '',
    })),
    globalPrompt: '',
    duration: 12,
    fps: 30,
    width: 640,
    height: 320,
    gridtype: Math.min(gridFrames, [4, 6, 9].includes(gridFrames) ? gridFrames : 4) as 4 | 6 | 9,
    gridFrameIndexs: new Array(gridFrames).fill(0).map((_, i) => i === 0 ? 0 : Math.round(i * totalFrames / (gridFrames - 1))),
  };
}

function saveConfig(layerId: string, config: MkrGenerationConfig) {
  const { updateLayer } = useCanvasStore.getState();
  updateLayer(layerId, { generationPrompt: JSON.stringify(config) });
}

export const MkrVideoConfigBar: React.FC<MkrVideoConfigBarProps> = ({ layerId }) => {
  const { layers, addLayer, selectLayer, deleteLayer, updateLayer } = useCanvasStore();
  const layer = layers.find(l => l.id === layerId);

  const [config, setConfig] = useState<MkrGenerationConfig>(() => {
    const existing = parseConfig(layer);
    if (existing) return existing;
    return buildConfig(layer?.sourceLayerIds, layers);
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  const totalFrames = useMemo(() => config.duration * config.fps, [config.duration, config.fps]);

  const sortedKeyframes = useMemo(() =>
    [...config.frames].sort((a, b) => {
      if (a.frameIndex === -1 && b.frameIndex === -1) return 0;
      if (a.frameIndex === -1) return 1;
      if (b.frameIndex === -1) return -1;
      return a.frameIndex - b.frameIndex;
    }),
    [config.frames]
  );

  const updateConfig = useCallback((updater: (prev: MkrGenerationConfig) => MkrGenerationConfig) => {
    setConfig(prev => {
      const next = updater(prev);
      saveConfig(layerId, next);
      return next;
    });
  }, [layerId]);

  const updateFrameIndex = useCallback((frameLayerId: string, newIndex: number) => {
    updateConfig(prev => ({
      ...prev,
      frames: prev.frames.map(f =>
        f.layerId === frameLayerId ? { ...f, frameIndex: Math.max(-1, Math.min(newIndex, totalFrames)) } : f
      ),
    }));
  }, [updateConfig, totalFrames]);

  const updateFramePrompt = useCallback((frameLayerId: string, prompt: string) => {
    updateConfig(prev => ({
      ...prev,
      frames: prev.frames.map(f => f.layerId === frameLayerId ? { ...f, prompt } : f),
    }));
  }, [updateConfig]);

  const removeKeyframe = useCallback((frameLayerId: string) => {
    updateConfig(prev => ({
      ...prev,
      frames: prev.frames.filter(f => f.layerId !== frameLayerId),
    }));
  }, [updateConfig]);

  const moveKeyframe = useCallback((frameLayerId: string, direction: -1 | 1) => {
    updateConfig(prev => {
      const idx = prev.frames.findIndex(f => f.layerId === frameLayerId);
      if (idx === -1) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.frames.length) return prev;
      const items = [...prev.frames];
      [items[idx], items[nextIdx]] = [items[nextIdx], items[idx]];
      return { ...prev, frames: items };
    });
  }, [updateConfig]);

  const addImageFromCanvas = useCallback((imageLayerId: string) => {
    const imageLayer = layers.find(l => l.id === imageLayerId && l.type === 'image');
    if (!imageLayer || config.frames.some(f => f.layerId === imageLayerId)) return;
    updateConfig(prev => ({
      ...prev,
      frames: [...prev.frames, {
        layerId: imageLayer.id,
        frameIndex: prev.frames.some(f => f.frameIndex === -1) ? Math.round(totalFrames / 2) : -1,
        prompt: '',
      }],
    }));
  }, [layers, config.frames, totalFrames, updateConfig]);

  const availableCanvasImages = useMemo(() =>
    layers.filter(l => l.type === 'image' && !config.frames.some(f => f.layerId === l.id)),
    [layers, config.frames]
  );

  const canGenerate = !isGenerating && (config.mode === 'regular' ? config.frames.length > 0 : true);

  const handleGenerate = async () => {
    if (!canGenerate || !layer) return;
    setIsGenerating(true);
    setProgress(0);
    setProgressLabel('准备生成...');

    try {
      const { videoStorageService } = await import('../../../../services/imageStorageService');
      let videoUrl: string;

      if (config.mode === 'grid') {
        // Grid mode: use generateVideoMkrGrid
        const refLayer = layers.find(l => l.type === 'image' && !l.isLoading && l.src);
        if (!refLayer) {
          throw new Error('请先添加一张参考图片');
        }

        const fullPrompt = config.globalPrompt;
        setProgressLabel('正在生成 MKR 宫格视频...');

        videoUrl = await canvasModelService.generateVideoMkrGrid({
          prompt: fullPrompt,
          refImage: refLayer.src,
          gridtype: config.gridtype as 4 | 6 | 9,
          frameIndexs: config.gridFrameIndexs,
          width: config.width,
          height: config.height,
          duration: config.duration,
          fps: config.fps,
          onProgress: (p) => setProgress(p),
        });
      } else {
        // Regular mode: use generateVideoMkr
        const sorted = [...config.frames].sort((a, b) => {
          if (a.frameIndex === -1 && b.frameIndex === -1) return 0;
          if (a.frameIndex === -1) return 1;
          if (b.frameIndex === -1) return -1;
          return a.frameIndex - b.frameIndex;
        });

        const images = sorted.map(f => ({
          src: layers.find(l => l.id === f.layerId)?.src || '',
          frameIndex: f.frameIndex,
        }));

        const perFramePrompts = sorted
          .filter(f => f.prompt.trim())
          .map((f, i) => `[关键帧${i + 1} - frame ${f.frameIndex === -1 ? '结束' : f.frameIndex}] ${f.prompt}`);
        const fullPrompt = [config.globalPrompt, ...perFramePrompts].filter(Boolean).join('\n');

        setProgressLabel('正在生成 MKR 视频...');

        videoUrl = await canvasModelService.generateVideoMkr({
          prompt: fullPrompt,
          images,
          width: config.width,
          height: config.height,
          duration: config.duration,
          fps: config.fps,
          onProgress: (p) => setProgress(p),
        });
      }

      setProgressLabel('处理视频文件...');
      setProgress(90);

      let resolvedUrl = videoUrl;
      let videoId: string | undefined;

      if (videoUrl.startsWith('video:')) {
        const localId = videoUrl.replace('video:', '');
        videoId = localId;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) resolvedUrl = URL.createObjectURL(blob);
      } else if (videoUrl.startsWith('local:')) {
        const localId = videoUrl.replace('local:', '');
        videoId = localId;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) resolvedUrl = URL.createObjectURL(blob);
      }

      updateLayer(layer.id, {
        src: resolvedUrl,
        imageId: videoId,
        title: 'MKR视频',
        isLoading: false,
        generationPrompt: JSON.stringify(config),
      });

      setProgress(100);
      setProgressLabel('生成完成！');
    } catch (error: any) {
      console.error('MKR 视频生成失败:', error);
      updateLayer(layer.id, { error: error.message, isLoading: false });
    } finally {
      setIsGenerating(false);
    }
  };

  const timelinePercentage = (frameIndex: number) =>
    frameIndex === -1 ? 100 : totalFrames > 0 ? (frameIndex / totalFrames) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] flex justify-center pb-4 pointer-events-none">
      <div className="w-[95vw] max-w-[1100px] bg-gray-800/95 backdrop-blur-sm rounded-t-xl border border-gray-700 shadow-2xl pointer-events-auto flex flex-col max-h-[55vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/60">
          <div className="flex items-center gap-3">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">MKR 多关键帧配置</span>

            {/* Mode toggle */}
            <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5 gap-0.5">
              <button
                onClick={() => updateConfig(prev => ({ ...prev, mode: 'regular' }))}
                className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                  config.mode === 'regular' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Film className="w-3 h-3 inline mr-1" />
                逐帧
              </button>
              <button
                onClick={() => updateConfig(prev => ({ ...prev, mode: 'grid' }))}
                className={`px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                  config.mode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Grid className="w-3 h-3 inline mr-1" />
                宫格
              </button>
            </div>

            <span className="text-[10px] text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded-full">
              {config.mode === 'regular' ? `${config.frames.length} 关键帧` : `${config.gridtype} 宫格`} · {config.duration}s · {totalFrames}帧
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isGenerating && (
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mr-2">
                <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>{progressLabel}</span>
                <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <button
              onClick={() => { selectLayer(null); }}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {config.mode === 'regular' ? (
          <>
            {/* Timeline */}
            <div className="px-4 pt-3 pb-1.5">
              <div className="relative h-[52px] bg-gray-800/80 rounded-lg border border-gray-700/60 overflow-hidden">
                {sortedKeyframes.map((kf) => {
                  const pct = timelinePercentage(kf.frameIndex);
                  const src = layers.find(l => l.id === kf.layerId)?.src || '';
                  return (
                    <div
                      key={kf.layerId}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 transition-all duration-200"
                      style={{ left: `${pct}%` }}
                    >
                      <div className="w-[30px] h-[30px] rounded overflow-hidden border-2 border-purple-500 bg-gray-700 shadow-md">
                        {src && <img src={src} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className={`text-[7px] font-mono whitespace-nowrap bg-gray-900/80 px-1 rounded ${
                        kf.frameIndex === -1 ? 'text-green-400' : 'text-purple-300'
                      }`}>
                        {kf.frameIndex === -1 ? '结束' : `#${kf.frameIndex}`}
                      </span>
                    </div>
                  );
                })}
                {Array.from({ length: 9 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 w-px bg-gray-700/50"
                    style={{ left: `${(i / 8) * 100}%`, height: i % 4 === 0 ? '8px' : '4px' }}
                  />
                ))}
                <div className="absolute bottom-0 left-2 text-[7px] text-gray-600">0</div>
                <div className="absolute bottom-0 right-2 text-[7px] text-gray-600">{totalFrames}</div>
              </div>
            </div>

            {/* Keyframe list */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-1">
              <div className="space-y-1.5">
                {config.frames.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-4 text-gray-500 text-[10px] gap-1">
                    <Film className="w-5 h-5 opacity-30" />
                    <p>尚未设置关键帧</p>
                  </div>
                )}

                {config.frames.map((kf, idx) => {
                  const imageLayer = layers.find(l => l.id === kf.layerId);
                  const src = imageLayer?.src || '';
                  const title = imageLayer?.title || '未知';
                  return (
                    <div
                      key={kf.layerId}
                      className="bg-gray-800/40 rounded-lg border border-gray-700/40 p-2 group hover:border-gray-600/60 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        {/* Index + Thumbnail */}
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-purple-600 text-white text-[7px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <div className="w-8 h-8 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                            {src && <img src={src} alt={title} className="w-full h-full object-cover" />}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[10px] text-gray-400 truncate max-w-[80px]">{title}</span>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] text-gray-500">帧:</span>
                            {kf.frameIndex === -1 ? (
                              <span className="text-[9px] text-green-400 font-semibold flex items-center gap-1">
                                结束
                                <button
                                  onClick={() => updateFrameIndex(kf.layerId, Math.round(totalFrames / 2))}
                                  className="text-[8px] text-purple-400/60 hover:text-purple-400 underline"
                                >
                                  设具体
                                </button>
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="range"
                                  min={0}
                                  max={totalFrames}
                                  value={kf.frameIndex}
                                  onChange={(e) => updateFrameIndex(kf.layerId, Number(e.target.value))}
                                  className="w-16 h-1 accent-purple-500"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={totalFrames}
                                  value={kf.frameIndex}
                                  onChange={(e) => updateFrameIndex(kf.layerId, Number(e.target.value))}
                                  className="w-10 bg-gray-900 border border-gray-700 rounded text-[9px] text-gray-300 px-0.5 py-0 text-center focus:outline-none focus:border-purple-500 font-mono"
                                />
                                <button
                                  onClick={() => updateFrameIndex(kf.layerId, -1)}
                                  className="text-[8px] text-purple-400/60 hover:text-purple-400 underline whitespace-nowrap"
                                >
                                  结束
                                </button>
                              </div>
                            )}
                          </div>

                          <input
                            type="text"
                            value={kf.prompt}
                            onChange={(e) => updateFramePrompt(kf.layerId, e.target.value)}
                            placeholder="帧描述..."
                            className="flex-1 min-w-[80px] bg-gray-900/60 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => moveKeyframe(kf.layerId, -1)}
                            disabled={idx === 0}
                            className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => moveKeyframe(kf.layerId, 1)}
                            disabled={idx === config.frames.length - 1}
                            className="p-0.5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => removeKeyframe(kf.layerId)}
                            className="p-0.5 text-gray-500 hover:text-red-400"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Grid mode: single image + gridtype + frame indexs */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-1">
              {/* Reference image selector */}
              <div className="pt-3 pb-2">
                <span className="text-[10px] text-gray-400 mb-2 block">参考图片（所有宫格共用）</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {layers.filter(l => l.type === 'image' && !l.isLoading && l.src).map(l => (
                    <div
                      key={l.id}
                      className={`w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                        config.gridFrameIndexs.length > 0 ? 'border-purple-500' : 'border-gray-600 hover:border-gray-500'
                      }`}
                      title={l.title}
                    >
                      {l.src && <img src={l.src} alt="" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid type selector */}
              <div className="pb-2">
                <span className="text-[10px] text-gray-400 mb-2 block">宫格类型</span>
                <div className="flex items-center gap-2">
                  {[4, 6, 9].map(g => (
                    <button
                      key={g}
                      onClick={() => updateConfig(prev => ({
                        ...prev,
                        gridtype: g,
                        gridFrameIndexs: new Array(g).fill(0).map((_, i) =>
                          i === 0 ? 0 : Math.round(i * totalFrames / (g - 1))
                        ),
                      }))}
                      className={`px-3 py-1 text-[10px] rounded-lg border transition-colors ${
                        config.gridtype === g
                          ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {g} 宫格
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame indexs per grid cell */}
              <div className="pb-2">
                <span className="text-[10px] text-gray-400 mb-2 block">每个宫格的帧位置</span>
                <div className="grid grid-cols-3 gap-2">
                  {config.gridFrameIndexs.map((fi, idx) => (
                    <div key={idx} className="flex items-center gap-1 bg-gray-800/40 rounded-lg px-2 py-1.5">
                      <span className="text-[9px] text-gray-500 w-4">#{idx + 1}</span>
                      <input
                        type="number"
                        min={0}
                        max={totalFrames}
                        value={fi}
                        onChange={(e) => {
                          const newIndexs = [...config.gridFrameIndexs];
                          newIndexs[idx] = Math.max(0, Math.min(totalFrames, Number(e.target.value)));
                          updateConfig(prev => ({ ...prev, gridFrameIndexs: newIndexs }));
                        }}
                        className="w-14 bg-gray-900 border border-gray-700 rounded text-[9px] text-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-purple-500 font-mono"
                      />
                      <input
                        type="range"
                        min={0}
                        max={totalFrames}
                        value={fi}
                        onChange={(e) => {
                          const newIndexs = [...config.gridFrameIndexs];
                          newIndexs[idx] = Number(e.target.value);
                          updateConfig(prev => ({ ...prev, gridFrameIndexs: newIndexs }));
                        }}
                        className="flex-1 h-1 accent-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer: settings + generate */}
        <div className="border-t border-gray-700/60 px-4 py-2 space-y-2">
          {/* Global prompt */}
          <input
            type="text"
            value={config.globalPrompt}
            onChange={(e) => updateConfig(prev => ({ ...prev, globalPrompt: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="全局场景描述（所有关键帧共享）..."
            className="w-full bg-gray-700/50 border border-gray-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            disabled={isGenerating}
          />

          {/* Settings row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                时长:
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={config.duration}
                  onChange={(e) => updateConfig(prev => ({ ...prev, duration: Math.max(1, Math.min(30, Number(e.target.value))) }))}
                  className="w-10 bg-gray-700 border border-gray-700 rounded text-[10px] text-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-purple-500 font-mono"
                  disabled={isGenerating}
                />
                s
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                FPS:
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={config.fps}
                  onChange={(e) => updateConfig(prev => ({ ...prev, fps: Math.max(1, Math.min(60, Number(e.target.value))) }))}
                  className="w-10 bg-gray-700 border border-gray-700 rounded text-[10px] text-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-purple-500 font-mono"
                  disabled={isGenerating}
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                尺寸:
                <select
                  value={VIDEO_SIZE_PRESETS.findIndex(p => p.width === config.width && p.height === config.height)}
                  onChange={(e) => {
                    const preset = VIDEO_SIZE_PRESETS[Number(e.target.value)];
                    if (preset) updateConfig(prev => ({ ...prev, width: preset.width, height: preset.height }));
                  }}
                  className="bg-gray-700 border border-gray-700 rounded text-[10px] text-gray-300 px-1 py-0.5 focus:outline-none focus:border-purple-500"
                  disabled={isGenerating}
                >
                  {VIDEO_SIZE_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.label} ({p.width}×{p.height})</option>
                  ))}
                </select>
              </label>

              {/* Add image buttons (regular mode only) */}
              {config.mode === 'regular' && availableCanvasImages.length > 0 && (
                <div className="flex items-center gap-1">
                  {availableCanvasImages.slice(0, 4).map(l => (
                    <button
                      key={l.id}
                      onClick={() => addImageFromCanvas(l.id)}
                      className="w-5 h-5 rounded overflow-hidden bg-gray-700 border border-gray-600 hover:border-purple-500 transition-all relative group/img"
                      title={`添加 ${l.title}`}
                    >
                      {l.src && <img src={l.src} alt="" className="w-full h-full object-cover" />}
                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/50 transition-colors flex items-center justify-center">
                        <Plus className="w-2.5 h-2.5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { selectLayer(null); }}
                className="px-2.5 py-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                disabled={isGenerating}
              >
                关闭
              </button>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="px-3.5 py-1.5 text-[10px] text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isGenerating ? (
                  <>生成中...</>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    生成视频
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
