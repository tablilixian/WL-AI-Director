import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { X, Sparkles, Film, Grid, Camera } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import type { LayerData } from '../types/canvas';
import { ResolvedImage } from './ResolvedImage';
import {
  getAvailableModes,
  buildDefaultConfig,
  VIDEO_SIZE_PRESETS,
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  type VideoMode,
  type VideoNodeConfig,
} from '../types/video';
import { logger, LogCategory } from '../../../../services/logger.ts';
import MsrContent from './VideoNodePanel/MsrContent';
import MkrContent from './VideoNodePanel/MkrContent';
import MkrGridContent from './VideoNodePanel/MkrGridContent';

interface VideoNodePanelProps {
  layerId: string;
  onClose?: () => void;
}

function parseConfig(layer: LayerData | undefined): VideoNodeConfig | null {
  if (!layer?.generationPrompt) return null;
  try {
    const parsed = JSON.parse(layer.generationPrompt);
    if (parsed && typeof parsed === 'object' && 'mode' in parsed) {
      return parsed as VideoNodeConfig;
    }
    const legacy = parsed as any;
    if (legacy.frames || legacy.imageSequence) {
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

function saveConfig(layerId: string, config: VideoNodeConfig) {
  const { updateLayer } = useCanvasStore.getState();
  updateLayer(layerId, { generationPrompt: JSON.stringify(config) });
}

export const VideoNodePanel: React.FC<VideoNodePanelProps> = ({ layerId, onClose }) => {
  const { layers, selectLayer, updateLayer } = useCanvasStore();
  const layer = layers.find((l) => l.id === layerId);

  const sourceLayerIds = layer?.sourceLayerIds || [];
  const sourceLayers = useMemo(
    () =>
      sourceLayerIds.map((id) => layers.find((l) => l.id === id)).filter(Boolean) as LayerData[],
    [sourceLayerIds, layers],
  );

  const availableModes = useMemo(
    () => getAvailableModes(sourceLayerIds.length),
    [sourceLayerIds.length],
  );

  const [config, setConfig] = useState<VideoNodeConfig>(() => {
    const existing = parseConfig(layer);
    if (existing && availableModes.includes(existing.mode)) return existing;
    return buildDefaultConfig(sourceLayerIds, availableModes[0]);
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const isInternalRef = useRef(false);

  const isComplete = !!layer?.src && !layer?.isLoading && !layer?.error;
  const [editing, setEditing] = useState(!isComplete);

  // Re-sync config when store changes from outside (connection drag / edge delete)
  useEffect(() => {
    if (isInternalRef.current) {
      isInternalRef.current = false;
      return;
    }
    const existing = parseConfig(layer);
    if (existing && availableModes.includes(existing.mode)) {
      setConfig(existing);
    }
  }, [layer?.generationPrompt, layer?.sourceLayerIds]);

  const activeMode = config.mode;
  const totalFrames = config.duration * config.fps;

  const updateConfig = useCallback(
    (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => {
      setConfig((prev) => {
        const next = updater(prev);
        isInternalRef.current = true;
        saveConfig(layerId, next);
        return next;
      });
    },
    [layerId],
  );

  const setMode = useCallback(
    (mode: VideoMode) => {
      updateConfig((prev) => ({ ...prev, mode }));
    },
    [updateConfig],
  );

  const generateForMsr = useCallback(async () => {
    if (!layer) return;
    const startImage = sourceLayers[0]?.src;
    const endImage = sourceLayers[1]?.src;
    const cameraText =
      config.msr.cameraPreset && config.msr.cameraPreset !== 'none'
        ? `[运镜] ${CAMERA_PRESETS.find((c) => c.id === config.msr.cameraPreset)?.label} (强度 ${config.msr.cameraIntensity})`
        : '';
    const lightingText =
      config.msr.lightingPreset && config.msr.lightingPreset !== 'none'
        ? `[光照] ${LIGHTING_PRESETS.find((l) => l.id === config.msr.lightingPreset)?.label} (强度 ${config.msr.lightingIntensity})`
        : '';
    const dialogueText =
      config.msr.dialogues && config.msr.dialogues.length > 0
        ? config.msr.dialogues.map((d) => `[对白 ${d.speaker || ''}] ${d.text}`).join('\n')
        : '';
    const fullPrompt = [config.globalPrompt, cameraText, lightingText, dialogueText]
      .filter(Boolean)
      .join('\n');
    return canvasModelService.generateVideo({
      prompt: fullPrompt,
      startImage,
      endImage,
      duration: config.duration,
      onProgress: (p) => setProgress(p),
    });
  }, [layer, sourceLayers, config]);

  const generateForMkr = useCallback(async () => {
    const sorted = [...config.mkr.frames].sort((a, b) => {
      if (a.frameIndex === -1 && b.frameIndex === -1) return 0;
      if (a.frameIndex === -1) return 1;
      if (b.frameIndex === -1) return -1;
      return a.frameIndex - b.frameIndex;
    });
    const images = sorted.map((f) => ({
      src: layers.find((l) => l.id === f.layerId)?.src || '',
      frameIndex: f.frameIndex,
    }));
    const perFramePrompts = sorted
      .filter((f) => f.prompt.trim())
      .map(
        (f, i) =>
          `[关键帧${i + 1} - frame ${f.frameIndex === -1 ? '结束' : f.frameIndex}] ${f.prompt}`,
      );
    const fullPrompt = [config.globalPrompt, ...perFramePrompts].filter(Boolean).join('\n');
    return canvasModelService.generateVideoMkr({
      prompt: fullPrompt,
      images,
      width: config.width,
      height: config.height,
      duration: config.duration,
      fps: config.fps,
      onProgress: (p) => setProgress(p),
    });
  }, [config, layers]);

  const generateForMkrGrid = useCallback(async () => {
    const refLayer = sourceLayers[0];
    if (!refLayer?.src) throw new Error('请先添加参考图片');
    return canvasModelService.generateVideoMkrGrid({
      prompt: config.globalPrompt,
      refImage: refLayer.src,
      gridtype: config.mkrGrid.gridtype as 4 | 6 | 9,
      frameIndexs: config.mkrGrid.gridFrameIndexs,
      width: config.width,
      height: config.height,
      duration: config.duration,
      fps: config.fps,
      onProgress: (p) => setProgress(p),
    });
  }, [sourceLayers, config]);

  const handleGenerate = useCallback(async () => {
    if (!layer || isGenerating) return;
    setIsGenerating(true);
    setProgress(0);
    setProgressLabel('准备生成...');

    try {
      setProgressLabel(
        activeMode === 'msr'
          ? '正在生成视频...'
          : activeMode === 'mkr'
            ? '正在生成 MKR 视频...'
            : '正在生成 MKR 宫格视频...',
      );

      let videoUrl: string | undefined;
      if (activeMode === 'msr') {
        videoUrl = await generateForMsr();
      } else if (activeMode === 'mkr') {
        videoUrl = await generateForMkr();
      } else {
        videoUrl = await generateForMkrGrid();
      }
      if (!videoUrl) throw new Error('生成失败：未获得视频 URL');

      setProgressLabel('处理视频文件...');
      setProgress(90);

      const finalSrc = videoUrl;
      let videoId: string | undefined;

      if (videoUrl.startsWith('video:')) {
        videoId = videoUrl.replace('video:', '');
      } else if (videoUrl.startsWith('local:')) {
        videoId = videoUrl.replace('local:', '');
      }

      updateLayer(layer.id, {
        src: finalSrc,
        imageId: videoId,
        title: '视频',
        isLoading: false,
        generationPrompt: JSON.stringify(config),
      });

      setProgress(100);
      setProgressLabel('生成完成！');
    } catch (error: any) {
      logger.error(LogCategory.CANVAS, '[VideoNodePanel] 视频生成失败:', error);
      updateLayer(layer.id, { error: error.message, isLoading: false });
    } finally {
      setIsGenerating(false);
    }
  }, [
    layer,
    isGenerating,
    activeMode,
    config,
    generateForMsr,
    generateForMkr,
    generateForMkrGrid,
    updateLayer,
  ]);

  const canGenerate = useMemo(() => {
    if (isGenerating) return false;
    if (activeMode === 'mkr') return config.mkr.frames.length > 0;
    if (activeMode === 'mkr-grid') return sourceLayers.length > 0;
    return sourceLayers.length > 0;
  }, [isGenerating, activeMode, config.mkr.frames.length, sourceLayers.length]);

  if (!layer) return null;

  // ── Compact "已完成" bar ──
  if (isComplete && !editing) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[200] flex justify-center pb-4 pointer-events-none">
        <div className="w-[95vw] max-w-[1100px] bg-gray-800/95 backdrop-blur-sm rounded-t-xl border border-gray-700 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <Film className="w-4 h-5 text-green-400" />
              <span className="text-sm text-gray-300">
                视频已生成
                {sourceLayers.length > 0 && (
                  <span className="text-gray-500 ml-1">(来源 {sourceLayers.length} 张图片)</span>
                )}
              </span>
              {sourceLayers.length > 0 && (
                <div className="flex items-center -space-x-2">
                  {sourceLayers.slice(0, 5).map((l) => (
                    <div
                      key={l.id}
                      className="w-7 h-7 rounded-full border-2 border-gray-800 overflow-hidden bg-gray-700"
                    >
                      {l.src && (
                        <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="w-px h-5 bg-gray-700" />
              <span className="text-[10px] text-gray-500">
                {activeMode === 'mkr'
                  ? '逐帧 MKR'
                  : activeMode === 'mkr-grid'
                    ? `宫格 Grid`
                    : 'MSR 单图'}
                {' · '}
                {config.duration}s
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isGenerating && (
                <div className="flex items-center gap-2 text-[10px] text-gray-400 mr-2">
                  <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span>{progressLabel}</span>
                </div>
              )}
              <button
                onClick={() => {
                  setEditing(true);
                }}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors font-medium disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                重新生成
              </button>
              <button
                onClick={() => (onClose ? onClose() : selectLayer(null))}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 完整配置面板 ──
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] flex justify-center pb-4 pointer-events-none">
      <div className="w-[95vw] max-w-[1100px] bg-gray-800/95 backdrop-blur-sm rounded-t-xl border border-gray-700 shadow-2xl pointer-events-auto flex flex-col max-h-[55vh]">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/60">
          <div className="flex items-center gap-3">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-white">
              {isComplete ? '重新生成' : '视频生成'}
            </span>

            {availableModes.length > 1 && (
              <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5 gap-0.5">
                {availableModes.map((mode) => {
                  const label =
                    mode === 'msr' ? 'MSR 单图' : mode === 'mkr' ? '逐帧 MKR' : '宫格 Grid';
                  const Icon = mode === 'msr' ? Camera : mode === 'mkr' ? Film : Grid;
                  return (
                    <button
                      key={mode}
                      onClick={() => setMode(mode)}
                      className={`px-2 py-0.5 text-[10px] rounded-md transition-colors flex items-center gap-1 ${
                        activeMode === mode
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <span className="text-[10px] text-gray-500 bg-gray-700/60 px-2 py-0.5 rounded-full">
              {activeMode === 'mkr'
                ? `${config.mkr.frames.length} 关键帧`
                : activeMode === 'mkr-grid'
                  ? `${config.mkrGrid.gridtype} 宫格`
                  : `${sourceLayers.length} 张参考图`}
              {' · '}
              {config.duration}s · {totalFrames}帧
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isGenerating && (
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mr-2">
                <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>{progressLabel}</span>
                <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={() => (onClose ? onClose() : selectLayer(null))}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Content (varies by mode) ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-1">
          {activeMode === 'msr' && (
            <MsrContent
              sourceLayers={sourceLayers}
              config={config}
              updateConfig={updateConfig}
              layers={layers}
            />
          )}
          {activeMode === 'mkr' && (
            <MkrContent
              sourceLayers={sourceLayers}
              config={config}
              updateConfig={updateConfig}
              layers={layers}
              totalFrames={totalFrames}
            />
          )}
          {activeMode === 'mkr-grid' && (
            <MkrGridContent
              sourceLayers={sourceLayers}
              config={config}
              updateConfig={updateConfig}
              totalFrames={totalFrames}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-700/60 px-4 py-2 space-y-2">
          <input
            type="text"
            value={config.globalPrompt}
            onChange={(e) => updateConfig((prev) => ({ ...prev, globalPrompt: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            placeholder="全局场景描述..."
            className="w-full bg-gray-700/50 border border-gray-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            disabled={isGenerating}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                时长:
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={config.duration}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      duration: Math.max(1, Math.min(30, Number(e.target.value))),
                    }))
                  }
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
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      fps: Math.max(1, Math.min(60, Number(e.target.value))),
                    }))
                  }
                  className="w-10 bg-gray-700 border border-gray-700 rounded text-[10px] text-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-purple-500 font-mono"
                  disabled={isGenerating}
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-gray-400">
                尺寸:
                <select
                  value={VIDEO_SIZE_PRESETS.findIndex(
                    (p) => p.width === config.width && p.height === config.height,
                  )}
                  onChange={(e) => {
                    const preset = VIDEO_SIZE_PRESETS[Number(e.target.value)];
                    if (preset)
                      updateConfig((prev) => ({
                        ...prev,
                        width: preset.width,
                        height: preset.height,
                      }));
                  }}
                  className="bg-gray-700 border border-gray-700 rounded text-[10px] text-gray-300 px-1 py-0.5 focus:outline-none focus:border-purple-500"
                  disabled={isGenerating}
                >
                  {VIDEO_SIZE_PRESETS.map((p, i) => (
                    <option key={i} value={i}>
                      {p.label} ({p.width}x{p.height})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => (onClose ? onClose() : selectLayer(null))}
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
