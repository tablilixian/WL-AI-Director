import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { X, Sparkles, Plus, Trash2, ChevronUp, ChevronDown, Film, Grid, Camera, Sun, Mic } from 'lucide-react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import type { LayerData } from '../types/canvas';
import type { VideoMode, VideoNodeConfig } from '../types/video';
import { ResolvedImage } from './ResolvedImage';
import {
  getAvailableModes,
  buildDefaultConfig,
  VIDEO_SIZE_PRESETS,
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  TOTAL_FRAMES,
} from '../types/video';

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
  const layer = layers.find(l => l.id === layerId);

  const sourceLayerIds = layer?.sourceLayerIds || [];
  const sourceLayers = useMemo(
    () => sourceLayerIds.map(id => layers.find(l => l.id === id)).filter(Boolean) as LayerData[],
    [sourceLayerIds, layers]
  );

  const availableModes = useMemo(
    () => getAvailableModes(sourceLayerIds.length),
    [sourceLayerIds.length]
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

  const isComplete = !!layer.src && !layer.isLoading && !layer.error;
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
      setConfig(prev => {
        const next = updater(prev);
        isInternalRef.current = true;
        saveConfig(layerId, next);
        return next;
      });
    },
    [layerId]
  );

  const setMode = useCallback(
    (mode: VideoMode) => {
      updateConfig(prev => ({ ...prev, mode }));
    },
    [updateConfig]
  );

  const generateForMsr = useCallback(async () => {
    if (!layer) return;
    const startImage = sourceLayers[0]?.src;
    const endImage = sourceLayers[1]?.src;
    const cameraText = config.msr.cameraPreset && config.msr.cameraPreset !== 'none'
      ? `[运镜] ${CAMERA_PRESETS.find(c => c.id === config.msr.cameraPreset)?.label} (强度 ${config.msr.cameraIntensity})`
      : '';
    const lightingText = config.msr.lightingPreset && config.msr.lightingPreset !== 'none'
      ? `[光照] ${LIGHTING_PRESETS.find(l => l.id === config.msr.lightingPreset)?.label} (强度 ${config.msr.lightingIntensity})`
      : '';
    const dialogueText = config.msr.dialogues && config.msr.dialogues.length > 0
      ? config.msr.dialogues.map(d => `[对白 ${d.speaker || ''}] ${d.text}`).join('\n')
      : '';
    const fullPrompt = [config.globalPrompt, cameraText, lightingText, dialogueText]
      .filter(Boolean)
      .join('\n');
    return canvasModelService.generateVideo({
      prompt: fullPrompt,
      startImage,
      endImage,
      duration: config.duration,
      onProgress: p => setProgress(p),
    });
  }, [layer, sourceLayers, config]);

  const generateForMkr = useCallback(async () => {
    const sorted = [...config.mkr.frames].sort((a, b) => {
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
      .map((f, i) =>
        `[关键帧${i + 1} - frame ${f.frameIndex === -1 ? '结束' : f.frameIndex}] ${f.prompt}`
      );
    const fullPrompt = [config.globalPrompt, ...perFramePrompts].filter(Boolean).join('\n');
    return canvasModelService.generateVideoMkr({
      prompt: fullPrompt,
      images,
      width: config.width,
      height: config.height,
      duration: config.duration,
      fps: config.fps,
      onProgress: p => setProgress(p),
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
      onProgress: p => setProgress(p),
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
            : '正在生成 MKR 宫格视频...'
      );

      let videoUrl: string;
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

      let finalSrc = videoUrl;
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
      console.error('[VideoNodePanel] 视频生成失败:', error);
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
                  {sourceLayers.slice(0, 5).map(l => (
                    <div key={l.id} className="w-7 h-7 rounded-full border-2 border-gray-800 overflow-hidden bg-gray-700">
                      {l.src && <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>
              )}
              <div className="w-px h-5 bg-gray-700" />
              <span className="text-[10px] text-gray-500">
                {activeMode === 'mkr' ? '逐帧 MKR' : activeMode === 'mkr-grid' ? `宫格 Grid` : 'MSR 单图'}
                {' · '}{config.duration}s
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
                onClick={() => { setEditing(true); }}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors font-medium disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                重新生成
              </button>
              <button
                onClick={() => onClose ? onClose() : selectLayer(null)}
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
            <span className="text-sm font-semibold text-white">{isComplete ? '重新生成' : '视频生成'}</span>

            {availableModes.length > 1 && (
              <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5 gap-0.5">
                {availableModes.map(mode => {
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
              onClick={() => onClose ? onClose() : selectLayer(null)}
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
            onChange={e =>
              updateConfig(prev => ({ ...prev, globalPrompt: e.target.value }))
            }
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
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
                  onChange={e =>
                    updateConfig(prev => ({
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
                  onChange={e =>
                    updateConfig(prev => ({
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
                    p => p.width === config.width && p.height === config.height
                  )}
                  onChange={e => {
                    const preset = VIDEO_SIZE_PRESETS[Number(e.target.value)];
                    if (preset)
                      updateConfig(prev => ({
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
                onClick={() => onClose ? onClose() : selectLayer(null)}
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

/* ================================================================
 *  MSR Content
 * ================================================================ */

interface MsrContentProps {
  sourceLayers: LayerData[];
  config: VideoNodeConfig;
  updateConfig: (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => void;
  layers: LayerData[];
}

const MsrContent: React.FC<MsrContentProps> = ({
  sourceLayers,
  config,
  updateConfig,
  layers,
}) => {
  const availableImages = layers.filter(
    l => l.type === 'image' && !l.isLoading && l.src
  );

  return (
    <div className="pt-3 pb-1 space-y-3">
      {/* Reference images */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">
          参考图片（第一张为起始帧，可选第二张为结束帧）
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {availableImages.map(l => {
            const isSelected = sourceLayers.some(sl => sl.id === l.id);
            return (
              <div
                key={l.id}
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                  isSelected ? 'border-purple-500 ring-1 ring-purple-500/50' : 'border-gray-600 hover:border-gray-500'
                }`}
                title={l.title}
              >
                {l.src && <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Camera */}
      <details className="group">
        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 flex items-center gap-1.5">
          <Camera className="w-3 h-3" />
          运镜设置
        </summary>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {CAMERA_PRESETS.map(c => (
              <button
                key={c.id}
                onClick={() =>
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, cameraPreset: c.id },
                  }))
                }
                className={`px-2 py-1 text-[9px] rounded-lg border transition-colors ${
                  config.msr.cameraPreset === c.id
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {config.msr.cameraPreset && config.msr.cameraPreset !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500">强度:</span>
              <input
                type="range"
                min={1}
                max={10}
                value={config.msr.cameraIntensity ?? 5}
                onChange={e =>
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, cameraIntensity: Number(e.target.value) },
                  }))
                }
                className="w-24 h-1 accent-purple-500"
              />
              <span className="text-[9px] text-gray-400 w-4">
                {config.msr.cameraIntensity}
              </span>
            </div>
          )}
        </div>
      </details>

      {/* Lighting */}
      <details className="group">
        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 flex items-center gap-1.5">
          <Sun className="w-3 h-3" />
          光照设置
        </summary>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {LIGHTING_PRESETS.map(l => (
              <button
                key={l.id}
                onClick={() =>
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, lightingPreset: l.id },
                  }))
                }
                className={`px-2 py-1 text-[9px] rounded-lg border transition-colors ${
                  config.msr.lightingPreset === l.id
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          {config.msr.lightingPreset && config.msr.lightingPreset !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500">强度:</span>
              <input
                type="range"
                min={1}
                max={10}
                value={config.msr.lightingIntensity ?? 5}
                onChange={e =>
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, lightingIntensity: Number(e.target.value) },
                  }))
                }
                className="w-24 h-1 accent-purple-500"
              />
              <span className="text-[9px] text-gray-400 w-4">
                {config.msr.lightingIntensity}
              </span>
            </div>
          )}
        </div>
      </details>

      {/* Dialogue */}
      <details className="group">
        <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300 flex items-center gap-1.5">
          <Mic className="w-3 h-3" />
          对白 / 旁白
        </summary>
        <div className="mt-2 space-y-1.5">
          {(config.msr.dialogues ?? []).map((d, idx) => (
            <div key={d.id} className="flex items-center gap-1.5">
              <input
                type="text"
                value={d.speaker ?? ''}
                onChange={e => {
                  const newDialogues = [...(config.msr.dialogues ?? [])];
                  newDialogues[idx] = { ...newDialogues[idx], speaker: e.target.value };
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, dialogues: newDialogues },
                  }));
                }}
                placeholder="说话人"
                className="w-16 bg-gray-900/60 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <input
                type="text"
                value={d.text}
                onChange={e => {
                  const newDialogues = [...(config.msr.dialogues ?? [])];
                  newDialogues[idx] = { ...newDialogues[idx], text: e.target.value };
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, dialogues: newDialogues },
                  }));
                }}
                placeholder="对白内容"
                className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={() => {
                  const newDialogues = (config.msr.dialogues ?? []).filter(
                    (_, i) => i !== idx
                  );
                  updateConfig(prev => ({
                    ...prev,
                    msr: { ...prev.msr, dialogues: newDialogues },
                  }));
                }}
                className="p-0.5 text-gray-500 hover:text-red-400"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const newId = `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              updateConfig(prev => ({
                ...prev,
                msr: {
                  ...prev.msr,
                  dialogues: [
                    ...(prev.msr.dialogues ?? []),
                    { id: newId, startTime: 0, endTime: 0, text: '', speaker: '' },
                  ],
                },
              }));
            }}
            className="flex items-center gap-1 text-[9px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加对白
          </button>
        </div>
      </details>
    </div>
  );
};

/* ================================================================
 *  MKR (per-frame) Content
 * ================================================================ */

interface MkrContentProps {
  sourceLayers: LayerData[];
  config: VideoNodeConfig;
  updateConfig: (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => void;
  layers: LayerData[];
  totalFrames: number;
}

const MkrContent: React.FC<MkrContentProps> = ({
  config,
  updateConfig,
  layers,
  totalFrames,
}) => {
  const sortedKeyframes = useMemo(
    () =>
      [...config.mkr.frames].sort((a, b) => {
        if (a.frameIndex === -1 && b.frameIndex === -1) return 0;
        if (a.frameIndex === -1) return 1;
        if (b.frameIndex === -1) return -1;
        return a.frameIndex - b.frameIndex;
      }),
    [config.mkr.frames]
  );

  const timelinePercentage = (frameIndex: number) =>
    frameIndex === -1 ? 100 : totalFrames > 0 ? (frameIndex / totalFrames) * 100 : 0;

  const availableCanvasImages = useMemo(
    () =>
      layers.filter(
        l =>
          l.type === 'image' &&
          !config.mkr.frames.some(f => f.layerId === l.id)
      ),
    [layers, config.mkr.frames]
  );

  const updateFrameIndex = (frameLayerId: string, newIndex: number) => {
    updateConfig(prev => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: prev.mkr.frames.map(f =>
          f.layerId === frameLayerId
            ? { ...f, frameIndex: Math.max(-1, Math.min(newIndex, totalFrames)) }
            : f
        ),
      },
    }));
  };

  const updateFramePrompt = (frameLayerId: string, prompt: string) => {
    updateConfig(prev => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: prev.mkr.frames.map(f =>
          f.layerId === frameLayerId ? { ...f, prompt } : f
        ),
      },
    }));
  };

  const removeKeyframe = (frameLayerId: string) => {
    updateConfig(prev => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: prev.mkr.frames.filter(f => f.layerId !== frameLayerId),
      },
    }));
  };

  const moveKeyframe = (frameLayerId: string, direction: -1 | 1) => {
    updateConfig(prev => {
      const idx = prev.mkr.frames.findIndex(f => f.layerId === frameLayerId);
      if (idx === -1) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.mkr.frames.length) return prev;
      const items = [...prev.mkr.frames];
      [items[idx], items[nextIdx]] = [items[nextIdx], items[idx]];
      return { ...prev, mkr: { ...prev.mkr, frames: items } };
    });
  };

  const addImageFromCanvas = (imageLayerId: string) => {
    const imageLayer = layers.find(l => l.id === imageLayerId && l.type === 'image');
    if (!imageLayer || config.mkr.frames.some(f => f.layerId === imageLayerId)) return;
    updateConfig(prev => ({
      ...prev,
      mkr: {
        ...prev.mkr,
        frames: [
          ...prev.mkr.frames,
          {
            layerId: imageLayer.id,
            frameIndex: prev.mkr.frames.some(f => f.frameIndex === -1)
              ? Math.round(totalFrames / 2)
              : -1,
            prompt: '',
          },
        ],
      },
    }));
  };

  return (
    <div>
      {/* Timeline */}
      <div className="pt-3 pb-1.5">
        <div className="relative h-[52px] bg-gray-800/80 rounded-lg border border-gray-700/60 overflow-hidden">
          {sortedKeyframes.map(kf => {
            const pct = timelinePercentage(kf.frameIndex);
            const src = layers.find(l => l.id === kf.layerId)?.src || '';
            return (
              <div
                key={kf.layerId}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5 transition-all duration-200"
                style={{ left: `${pct}%` }}
              >
                <div className="w-[30px] h-[30px] rounded overflow-hidden border-2 border-purple-500 bg-gray-700 shadow-md">
                  {src && <ResolvedImage src={src} alt="" className="w-full h-full object-cover" />}
                </div>
                <span
                  className={`text-[7px] font-mono whitespace-nowrap bg-gray-900/80 px-1 rounded ${
                    kf.frameIndex === -1 ? 'text-green-400' : 'text-purple-300'
                  }`}
                >
                  {kf.frameIndex === -1 ? '结束' : `#${kf.frameIndex}`}
                </span>
              </div>
            );
          })}
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="absolute bottom-0 w-px bg-gray-700/50"
              style={{
                left: `${(i / 8) * 100}%`,
                height: i % 4 === 0 ? '8px' : '4px',
              }}
            />
          ))}
          <div className="absolute bottom-0 left-2 text-[7px] text-gray-600">0</div>
          <div className="absolute bottom-0 right-2 text-[7px] text-gray-600">
            {totalFrames}
          </div>
        </div>
      </div>

      {/* Keyframe list */}
      <div className="space-y-1.5">
        {config.mkr.frames.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500 text-[10px] gap-1">
            <Film className="w-5 h-5 opacity-30" />
            <p>尚未设置关键帧</p>
          </div>
        )}
        {config.mkr.frames.map((kf, idx) => {
          const imageLayer = layers.find(l => l.id === kf.layerId);
          const src = imageLayer?.src || '';
          const title = imageLayer?.title || '未知';
          return (
            <div
              key={kf.layerId}
              className="bg-gray-800/40 rounded-lg border border-gray-700/40 p-2 group hover:border-gray-600/60 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-purple-600 text-white text-[7px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="w-8 h-8 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                    {src && (
                      <ResolvedImage src={src} alt={title} className="w-full h-full object-cover" />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                    {title}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-gray-500">帧:</span>
                    {kf.frameIndex === -1 ? (
                      <span className="text-[9px] text-green-400 font-semibold flex items-center gap-1">
                        结束
                        <button
                          onClick={() =>
                            updateFrameIndex(kf.layerId, Math.round(totalFrames / 2))
                          }
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
                          onChange={e =>
                            updateFrameIndex(kf.layerId, Number(e.target.value))
                          }
                          className="w-16 h-1 accent-purple-500"
                        />
                        <input
                          type="number"
                          min={0}
                          max={totalFrames}
                          value={kf.frameIndex}
                          onChange={e =>
                            updateFrameIndex(kf.layerId, Number(e.target.value))
                          }
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
                    onChange={e => updateFramePrompt(kf.layerId, e.target.value)}
                    placeholder="帧描述..."
                    className="flex-1 min-w-[80px] bg-gray-900/60 border border-gray-700 rounded px-1.5 py-0.5 text-[9px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
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
                    disabled={idx === config.mkr.frames.length - 1}
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
        {availableCanvasImages.length > 0 && (
          <div className="flex items-center gap-1 pt-1">
            {availableCanvasImages.slice(0, 6).map(l => (
              <button
                key={l.id}
                onClick={() => addImageFromCanvas(l.id)}
                className="w-5 h-5 rounded overflow-hidden bg-gray-700 border border-gray-600 hover:border-purple-500 transition-all relative group/img"
                title={`添加 ${l.title}`}
              >
                {l.src && <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/50 transition-colors flex items-center justify-center">
                  <Plus className="w-2.5 h-2.5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ================================================================
 *  MKR Grid Content
 * ================================================================ */

interface MkrGridContentProps {
  sourceLayers: LayerData[];
  config: VideoNodeConfig;
  updateConfig: (updater: (prev: VideoNodeConfig) => VideoNodeConfig) => void;
  totalFrames: number;
}

const MkrGridContent: React.FC<MkrGridContentProps> = ({
  sourceLayers,
  config,
  updateConfig,
  totalFrames,
}) => {
  return (
    <div className="pt-3 pb-1 space-y-3">
      {/* Reference image */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">
          参考图片（所有宫格共用）
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {sourceLayers.map(l => (
            <div
              key={l.id}
              className="w-14 h-14 rounded-lg overflow-hidden border-2 border-purple-500"
              title={l.title}
            >
              {l.src && <ResolvedImage src={l.src} alt="" className="w-full h-full object-cover" />}
            </div>
          ))}
        </div>
      </div>

      {/* Grid type */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">宫格类型</span>
        <div className="flex items-center gap-2">
          {[4, 6, 9].map(g => (
            <button
              key={g}
              onClick={() =>
                updateConfig(prev => ({
                  ...prev,
                  mkrGrid: {
                    gridtype: g,
                    gridFrameIndexs: new Array(g).fill(0).map((_, i) =>
                      i === 0
                        ? 0
                        : Math.round((i * totalFrames) / (g - 1))
                    ),
                  },
                }))
              }
              className={`px-3 py-1 text-[10px] rounded-lg border transition-colors ${
                config.mkrGrid.gridtype === g
                  ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {g} 宫格
            </button>
          ))}
        </div>
      </div>

      {/* Frame indexs */}
      <div>
        <span className="text-[10px] text-gray-400 mb-2 block">每个宫格的帧位置</span>
        <div className="grid grid-cols-3 gap-2">
          {config.mkrGrid.gridFrameIndexs.map((fi, idx) => (
            <div key={idx} className="flex items-center gap-1 bg-gray-800/40 rounded-lg px-2 py-1.5">
              <span className="text-[9px] text-gray-500 w-4">#{idx + 1}</span>
              <input
                type="number"
                min={0}
                max={totalFrames}
                value={fi}
                onChange={e => {
                  const newIndexs = [...config.mkrGrid.gridFrameIndexs];
                  newIndexs[idx] = Math.max(
                    0,
                    Math.min(totalFrames, Number(e.target.value))
                  );
                  updateConfig(prev => ({
                    ...prev,
                    mkrGrid: { ...prev.mkrGrid, gridFrameIndexs: newIndexs },
                  }));
                }}
                className="w-14 bg-gray-900 border border-gray-700 rounded text-[9px] text-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-purple-500 font-mono"
              />
              <input
                type="range"
                min={0}
                max={totalFrames}
                value={fi}
                onChange={e => {
                  const newIndexs = [...config.mkrGrid.gridFrameIndexs];
                  newIndexs[idx] = Number(e.target.value);
                  updateConfig(prev => ({
                    ...prev,
                    mkrGrid: { ...prev.mkrGrid, gridFrameIndexs: newIndexs },
                  }));
                }}
                className="flex-1 h-1 accent-purple-500"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


