import React, { useState, useEffect } from 'react';
import { VideoGenerationMode, TimedKeyframe, VideoPreset, Keyframe } from '../../types';
import { Upload, Save, FolderOpen, Trash2, AlertTriangle, Camera, Film, Type } from 'lucide-react';
import { validateTimedKeyframes } from '../../services/videoPresetManager';
import { PipelineShotData } from './utils';

interface AdvancedVideoPanelProps {
  initialMode?: VideoGenerationMode;
  initialFps?: number;
  initialWidth?: number;
  initialHeight?: number;
  initialTimedKeyframes?: TimedKeyframe[];
  initialBackground?: string;
  isNineGridMode: boolean;
  onParamsChange: (params: {
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    timedKeyframes: TimedKeyframe[];
    backgroundImage?: string;
  }) => void;
  // 预设系统
  videoPresets?: VideoPreset[];
  onSavePreset: (name: string, description?: string) => void;
  onApplyPreset: (presetId: string) => void;
  onDeletePreset?: (presetId: string) => void;
  // 悬空引用校验：当前 shot 的所有 keyframe 列表
  shotKeyframes?: Keyframe[];
  // Pipeline 字段自动打通：shot 现有字段预览
  pipelineShotData?: PipelineShotData;
}

const MODE_OPTIONS: { value: VideoGenerationMode; label: string; desc: string }[] = [
  { value: 'basic', label: '基本模式', desc: '首尾帧 + 运动强度' },
  { value: 'msr', label: 'MSR 多帧超分', desc: '多帧超分辨率增强' },
  { value: 'mkr', label: 'MKR 多关键帧', desc: '多关键帧时间轴控制' },
  { value: 'mkr-grid', label: 'MKR Grid 宫格', desc: '宫格分镜视频' },
];

const RESOLUTION_PRESETS = [
  { label: '720p', w: 1280, h: 720 },
  { label: '1080p', w: 1920, h: 1080 },
  { label: '2K', w: 2560, h: 1440 },
  { label: '4K', w: 3840, h: 2160 },
];

const AdvancedVideoPanel: React.FC<AdvancedVideoPanelProps> = ({
  initialMode = 'basic',
  initialFps = 30,
  initialWidth = 1920,
  initialHeight = 1080,
  initialTimedKeyframes = [],
  initialBackground,
  isNineGridMode,
  onParamsChange,
  videoPresets = [],
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  shotKeyframes,
  pipelineShotData,
}) => {
  const [mode, setMode] = useState<VideoGenerationMode>(initialMode);
  const [fps, setFps] = useState(initialFps);
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [timedKeyframes, setTimedKeyframes] = useState<TimedKeyframe[]>(initialTimedKeyframes);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  // 悬空引用状态
  const [danglingWarning, setDanglingWarning] = useState<{ count: number; allInvalid: boolean } | null>(null);

  // 初始化时执行悬空引用校验
  useEffect(() => {
    if (shotKeyframes && shotKeyframes.length > 0) {
      const validIds = shotKeyframes.map(kf => kf.id);
      const result = validateTimedKeyframes(initialTimedKeyframes, validIds);
      if (result.invalidCount > 0) {
        setDanglingWarning({ count: result.invalidCount, allInvalid: result.allInvalid });
        setTimedKeyframes(result.valid);
        if (result.allInvalid) {
          setMode('basic');
          onParamsChange({
            mode: 'basic',
            timedKeyframes: [],
            fps: initialFps,
            width: initialWidth,
            height: initialHeight,
            backgroundImage: initialBackground,
          });
        } else {
          onParamsChange({
            mode: mode,
            timedKeyframes: result.valid,
            fps: initialFps,
            width: initialWidth,
            height: initialHeight,
            backgroundImage: initialBackground,
          });
        }
      }
    }
  }, []); // 只在挂载时执行一次

  const notify = (updates: Partial<{
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    timedKeyframes: TimedKeyframe[];
    backgroundImage?: string;
  }>) => {
    onParamsChange({
      mode: updates.mode ?? mode,
      fps: updates.fps ?? fps,
      width: updates.width ?? width,
      height: updates.height ?? height,
      timedKeyframes: updates.timedKeyframes ?? timedKeyframes,
      backgroundImage: updates.backgroundImage ?? initialBackground,
    });
  };

  return (
    <div className="space-y-4">
      {isNineGridMode && (
        <div className="px-3 py-2 bg-[var(--warning-bg)]/30 border border-[var(--warning-border)] rounded-lg text-[10px] text-[var(--warning-text)]">
          九宫格模式下仅支持基本模式。请先生成新的首帧以解除九宫格。
        </div>
      )}

      {/* Pipeline 字段预览：从 shot 现有字段自动打通 */}
      {pipelineShotData && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-lg p-3 space-y-2">
          <label className="text-[9px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block flex items-center gap-1">
            <Film className="w-3 h-3" />
            Pipeline 字段预览（自动读取）
          </label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
            {pipelineShotData.shotSize && (
              <div className="flex items-center gap-1.5">
                <Camera className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                <span className="text-[var(--text-tertiary)]">景别:</span>
                <span className="text-[var(--text-primary)]">{pipelineShotData.shotSize}</span>
              </div>
            )}
            {pipelineShotData.cameraMovement && (
              <div className="flex items-center gap-1.5">
                <Camera className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                <span className="text-[var(--text-tertiary)]">运镜:</span>
                <span className="text-[var(--text-primary)]">{pipelineShotData.cameraMovement}</span>
              </div>
            )}
            {pipelineShotData.cameraChoreography && (
              <div className="flex items-center gap-1.5 col-span-2">
                <Camera className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
                <span className="text-[var(--text-tertiary)]">运镜编排:</span>
                <span className="text-[var(--text-primary)] truncate">
                  {pipelineShotData.cameraChoreography.movementType}
                  {' · '}{pipelineShotData.cameraChoreography.movementSpeed}
                  {' · '}{pipelineShotData.cameraChoreography.startShotSize}
                  →{pipelineShotData.cameraChoreography.endShotSize}
                </span>
              </div>
            )}
            {pipelineShotData.actionSummary && (
              <div className="flex items-start gap-1.5 col-span-2">
                <Type className="w-3 h-3 text-[var(--text-muted)] shrink-0 mt-0.5" />
                <span className="text-[var(--text-tertiary)] shrink-0">动作:</span>
                <span className="text-[var(--text-primary)] line-clamp-2">{pipelineShotData.actionSummary}</span>
              </div>
            )}
          </div>
          <div className="text-[8px] text-[var(--text-muted)] italic">
            以上数据来自镜头现有字段，生成时将自动用于提示词构建
          </div>
        </div>
      )}

      {/* Mode Selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
          生成模式
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setMode(opt.value); notify({ mode: opt.value }); }}
              disabled={opt.value !== 'basic' && isNineGridMode}
              className={`p-2 rounded-lg border text-left transition-all ${
                mode === opt.value
                  ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-primary)]'
                  : 'border-[var(--border-primary)] bg-[var(--bg-elevated)] text-[var(--text-tertiary)] hover:border-[var(--border-secondary)]'
              } ${opt.value !== 'basic' && isNineGridMode ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="text-xs font-bold">{opt.label}</div>
              <div className="text-[9px] mt-0.5 opacity-70">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* FPS + Resolution */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
            帧率 (FPS)
          </label>
          <select
            value={fps}
            onChange={(e) => { const v = Number(e.target.value); setFps(v); notify({ fps: v }); }}
            className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {[24, 25, 30, 48, 60].map(f => (
              <option key={f} value={f}>{f} fps</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
            分辨率
          </label>
          <div className="flex gap-1">
            <input
              type="number"
              value={width}
              onChange={(e) => { const v = Number(e.target.value); setWidth(v); notify({ width: v }); }}
              className="flex-1 w-0 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="宽"
              min={256}
            />
            <span className="self-center text-[var(--text-muted)] text-xs">×</span>
            <input
              type="number"
              value={height}
              onChange={(e) => { const v = Number(e.target.value); setHeight(v); notify({ height: v }); }}
              className="flex-1 w-0 bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="高"
              min={256}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {RESOLUTION_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setWidth(p.w); setHeight(p.h); notify({ width: p.w, height: p.h }); }}
                className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                  width === p.w && height === p.h
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]'
                    : 'border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-secondary)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MKR: Timed Keyframes */}
      {mode === 'mkr' && (
        <div className="space-y-2 p-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg">
          {/* 悬空引用警告 */}
          {danglingWarning && (
            <div className="flex items-start gap-2 px-2 py-1.5 bg-[var(--warning-bg)]/30 border border-[var(--warning-border)] rounded text-[9px] text-[var(--warning-text)]">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                {danglingWarning.allInvalid
                  ? '所有关键帧引用已失效，已自动降级为基本模式。'
                  : `${danglingWarning.count} 个关键帧引用已失效（关键帧已被删除），已自动过滤。`}
              </span>
            </div>
          )}
          <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
            关键帧时间轴
          </label>
          {timedKeyframes.length === 0 && !danglingWarning?.allInvalid ? (
            <div className="text-[10px] text-[var(--text-muted)] italic">暂无中间帧，将使用首尾帧模式</div>
          ) : (
            <div className="space-y-1.5">
              {timedKeyframes.map((tk, idx) => {
                const kf = shotKeyframes?.find(k => k.id === tk.keyframeId);
                const isValid = !!kf;
                return (
                  <div key={idx} className={`flex items-center gap-2 text-[10px] ${!isValid ? 'opacity-40' : ''}`}>
                    <span className="text-[var(--text-tertiary)] w-4">{idx + 1}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={tk.positionPercent}
                      onChange={(e) => {
                        const updated = timedKeyframes.map((t, i) =>
                          i === idx ? { ...t, positionPercent: Number(e.target.value) } : t
                        );
                        setTimedKeyframes(updated);
                        notify({ timedKeyframes: updated });
                      }}
                      className="flex-1"
                    />
                    <span className="font-mono text-[var(--text-secondary)] w-8 text-right">{tk.positionPercent}%</span>
                    <span className="text-[var(--text-muted)] truncate max-w-[80px]">
                      {isValid ? `${kf.type}帧` : '已删除'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MSR: Background Image */}
      {mode === 'msr' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block">
            背景参考图（可选）
          </label>
          {initialBackground ? (
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <span>✅ 已上传背景图</span>
              <button
                onClick={() => notify({ backgroundImage: undefined })}
                className="text-[var(--error-text)] hover:underline"
              >
                清除
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <Upload className="w-3 h-3" />
              <span>背景上传将在生成时通过文件选择器完成</span>
            </div>
          )}
        </div>
      )}

      {/* 预设系统 */}
      <div className="border-t border-[var(--border-primary)] pt-3 space-y-2">
        <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest block flex items-center gap-1">
          <FolderOpen className="w-3 h-3" />
          参数预设
        </label>

        {/* 已有预设列表 */}
        {videoPresets.length > 0 && (
          <div className="space-y-1">
            {videoPresets.map(p => (
              <div key={p.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => onApplyPreset(p.id)}
                  className="flex-1 text-left px-2 py-1 text-[9px] bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded hover:border-[var(--accent)] transition-colors truncate"
                  title={`应用预设: ${p.name}${p.description ? ` — ${p.description}` : ''}`}
                >
                  <span className="text-[var(--text-primary)]">{p.name}</span>
                  {p.description && (
                    <span className="text-[var(--text-muted)] ml-1">— {p.description}</span>
                  )}
                </button>
                {onDeletePreset && (
                  <button
                    onClick={() => onDeletePreset(p.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--error-text)] opacity-0 group-hover:opacity-100 transition-all"
                    title="删除预设"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 保存为预设 */}
        {showSaveForm ? (
          <div className="space-y-1.5 p-2 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded">
            <input
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              placeholder="预设名称"
              className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
            <input
              value={presetDesc}
              onChange={e => setPresetDesc(e.target.value)}
              placeholder="描述（可选）"
              className="w-full bg-[var(--bg-base)] border border-[var(--border-secondary)] rounded px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (presetName.trim()) {
                    onSavePreset(presetName.trim(), presetDesc.trim() || undefined);
                    setPresetName('');
                    setPresetDesc('');
                    setShowSaveForm(false);
                  }
                }}
                disabled={!presetName.trim()}
                className={`flex-1 py-1 rounded text-[9px] font-bold transition-colors ${
                  presetName.trim()
                    ? 'bg-[var(--accent)] text-[var(--text-primary)] hover:bg-[var(--accent-hover)]'
                    : 'bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed'
                }`}
              >
                保存
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setPresetName(''); setPresetDesc(''); }}
                className="px-2 py-1 rounded text-[9px] bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded border border-dashed border-[var(--border-primary)] text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border-secondary)] transition-colors"
          >
            <Save className="w-3 h-3" />
            将当前参数保存为预设
          </button>
        )}
      </div>
    </div>
  );
};

export default AdvancedVideoPanel;
