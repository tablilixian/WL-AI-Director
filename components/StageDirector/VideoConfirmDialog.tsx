import React, { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Image,
  Film,
  AlertTriangle,
  Check,
  Sparkles,
  Camera,
  Type,
} from 'lucide-react';
import {
  VideoGenerationMode,
  AspectRatio,
  VideoDuration,
  CameraChoreography,
  NineGridPanel,
} from '../../types';
import { useImageLoader } from '../../hooks/useImageLoader';

interface VideoConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;

  // 镜头信息
  shotId: string;
  shotIndex: number;
  cameraMovement?: string;
  shotSize?: string;
  actionSummary?: string;
  cameraChoreography?: CameraChoreography;

  // 生成模式
  mode: VideoGenerationMode;

  // 模型信息
  modelName: string;
  modelProvider: string;

  // 视频规格
  aspectRatio: AspectRatio;
  duration: VideoDuration;
  fps: number;
  width: number;
  height: number;

  // 提示词
  videoPrompt: string;
  language: string;
  eraContext?: string;

  // Prompt 拼装来源
  fourGridDescriptions?: string[];
  fourGridStatus?: string;
  nineGridPanels?: NineGridPanel[];

  // 参考图片
  startKeyframeImageUrl?: string;
  endKeyframeImageUrl?: string;
  refGridImageUrl?: string;
  backgroundImage?: string;
  timedKeyframeImages?: { positionPercent: number; imageUrl?: string }[];

  // 模式专属参数
  gridType?: number;
  frameIndexesPercent?: number[];
}

const MODE_LABELS: Record<VideoGenerationMode, { label: string; desc: string }> = {
  basic: { label: '基本模式', desc: '线性播放，首尾帧 + 提示词生成连续视频' },
  msr: { label: 'MSR 多帧超分', desc: '多张参考图 + 背景参考图，多帧超分辨率生成' },
  mkr: { label: 'MKR 多关键帧', desc: '在指定时间位置插入关键帧，精确控制画面节奏' },
  'mkr-grid': { label: 'MKR Grid 网格', desc: '以宫格整图为参考，按帧索引位置逐格生成连续视频' },
};

const GRID_LABELS: Record<number, string> = {
  4: '4格 (2×2)',
  6: '6格 (2×3)',
  9: '9格 (3×3)',
};

function formatShotId(id: string, index: number): string {
  const parts = id.split('-').slice(1);
  if (parts.length === 1) return `SHOT-${String(parts[0]).padStart(3, '0')}`;
  if (parts.length === 2) return `SHOT-${String(parts[0]).padStart(3, '0')}-${parts[1]}`;
  return `SHOT-${String(index + 1).padStart(3, '0')}`;
}

function buildJsonPreview(props: VideoConfirmDialogProps, actualFrameIndexes?: number[]): string {
  const base = {
    prompt: props.videoPrompt,
    width: props.width,
    height: props.height,
    duration: props.duration,
    fps: props.fps,
  };

  switch (props.mode) {
    case 'basic':
    case 'msr':
      return JSON.stringify(
        {
          ...base,
          background: '<上传后文件名>',
          image1: '<上传后文件名>',
          ...(props.mode === 'msr' ? { image2: '<上传后文件名>' } : {}),
        },
        null,
        2,
      );
    case 'mkr':
      return JSON.stringify(
        {
          ...base,
          images: (props.timedKeyframeImages || []).map((_, i) => ({
            image: `<上传后文件名 #${i + 1}>`,
            frame_index: props.timedKeyframeImages?.[i]?.positionPercent,
          })),
        },
        null,
        2,
      );
    case 'mkr-grid':
      return JSON.stringify(
        {
          ...base,
          image: '<上传后文件名>',
          gridtype: props.gridType || 4,
          frame_indexs: actualFrameIndexes || [],
        },
        null,
        2,
      );
  }
}

const ImageThumb: React.FC<{ url?: string; label: string; sublabel?: string }> = ({
  url,
  label,
  sublabel,
}) => {
  const { src, loading, error } = useImageLoader(url);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-20 h-14 bg-[var(--bg-base)] rounded border border-[var(--border-primary)] overflow-hidden flex items-center justify-center">
        {loading ? (
          <span className="text-[8px] text-[var(--text-muted)]">加载中...</span>
        ) : error || !src ? (
          <div className="flex flex-col items-center gap-0.5">
            <Image className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-[7px] text-[var(--text-muted)]">无</span>
          </div>
        ) : (
          <img src={src} className="w-full h-full object-cover" alt={label} />
        )}
      </div>
      <span className="text-[8px] text-[var(--text-tertiary)] text-center leading-tight">
        {label}
      </span>
      {sublabel && <span className="text-[7px] text-[var(--text-muted)]">{sublabel}</span>}
    </div>
  );
};

const VideoConfirmDialog: React.FC<VideoConfirmDialogProps> = (props) => {
  const {
    isOpen,
    onClose,
    onConfirm,
    shotId,
    shotIndex,
    cameraMovement,
    shotSize,
    actionSummary,
    cameraChoreography,
    mode,
    modelName,
    modelProvider,
    aspectRatio,
    duration,
    fps,
    width,
    height,
    videoPrompt,
    language,
    eraContext,
    fourGridDescriptions,
    nineGridPanels,
    startKeyframeImageUrl,
    endKeyframeImageUrl,
    refGridImageUrl,
    backgroundImage,
    timedKeyframeImages,
    gridType,
    frameIndexesPercent,
  } = props;

  const [showSources, setShowSources] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  const modeInfo = MODE_LABELS[mode];
  const totalFrames = duration * fps;
  // 根据百分比和总帧数计算实际帧索引（与 orchestrator 公式一致）
  const actualFrameIndexes = frameIndexesPercent?.map((pct) =>
    Math.min(Math.round((pct / 100) * totalFrames), totalFrames - 1),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-xl max-w-4xl w-full mx-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--border-primary)] shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="text-lg font-bold text-[var(--text-primary)]">视频参数确认</h3>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--accent-bg)] rounded border border-[var(--accent-border)]">
              <span className="text-[10px] font-bold font-mono text-[var(--accent-text)]">
                {formatShotId(shotId, shotIndex)}
              </span>
              {cameraMovement && (
                <span className="text-[9px] text-[var(--text-tertiary)]">| {cameraMovement}</span>
              )}
              {shotSize && (
                <span className="text-[9px] text-[var(--text-tertiary)]">| {shotSize}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* 生成模式 */}
          <div className="bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-primary)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                生成模式
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-[var(--accent-bg)] text-[var(--accent-text)] rounded text-xs font-bold border border-[var(--accent-border)]">
                {modeInfo.label}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">{modeInfo.desc}</span>
            </div>

            {mode === 'mkr-grid' && gridType && (
              <div className="bg-[var(--bg-base)] rounded p-3 space-y-1.5">
                <div className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">
                  网格配置
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-tertiary)]">类型:</span>
                    <span className="text-[var(--text-primary)] font-mono">
                      {GRID_LABELS[gridType] || `${gridType}格`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-tertiary)]">总帧数:</span>
                    <span className="text-[var(--text-primary)] font-mono">{totalFrames} 帧</span>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] mt-1">
                  帧索引 (frame_indexs):
                </div>
                <div className="flex flex-wrap gap-2">
                  {(actualFrameIndexes || []).map((idx, i) => (
                    <div
                      key={i}
                      className="px-2 py-1 bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded text-[10px] font-mono text-[var(--text-primary)]"
                    >
                      #{i + 1}: {idx}
                      {frameIndexesPercent && (
                        <span className="text-[var(--text-muted)] ml-1">
                          ({frameIndexesPercent[i]}%)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mode === 'mkr' && timedKeyframeImages && timedKeyframeImages.length > 0 && (
              <div className="bg-[var(--bg-base)] rounded p-3 space-y-1.5">
                <div className="text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-wider">
                  关键帧位置
                </div>
                <div className="space-y-1">
                  {timedKeyframeImages.map((tk, i) => (
                    <div key={i} className="flex items-center gap-3 text-[11px]">
                      <span className="text-[var(--text-muted)] font-mono w-6">#{i + 1}</span>
                      <div className="flex-1 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)] rounded-full"
                          style={{ width: `${tk.positionPercent}%` }}
                        />
                      </div>
                      <span className="text-[var(--text-primary)] font-mono w-12 text-right">
                        {tk.positionPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 模型与输出规格 */}
          <div className="bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-primary)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                模型与输出规格
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-tertiary)]">模型:</span>
                <span className="text-[var(--text-primary)]">{modelName}</span>
                <span className="text-[8px] px-1 py-0.5 bg-[var(--bg-hover)] rounded text-[var(--text-muted)]">
                  {modelProvider}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-tertiary)]">比例:</span>
                <span className="text-[var(--text-primary)] font-mono">{aspectRatio}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-tertiary)]">分辨率:</span>
                <span className="text-[var(--text-primary)] font-mono">
                  {width} × {height}
                  {mode === 'mkr-grid' && (
                    <span className="text-[var(--warning-text)] ml-1">(MKR Grid 强制默认值)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-tertiary)]">帧率:</span>
                <span className="text-[var(--text-primary)] font-mono">{fps} fps</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-tertiary)]">时长:</span>
                <span className="text-[var(--text-primary)] font-mono">{duration} 秒</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-tertiary)]">总帧数:</span>
                <span className="text-[var(--text-primary)] font-mono">{totalFrames} 帧</span>
              </div>
            </div>
          </div>

          {/* 完整提示词 */}
          <div className="bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-primary)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Type className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                完整提示词
              </span>
              <span className="text-[8px] text-[var(--text-muted)]">
                (最终发送给 API 的 prompt 字段)
              </span>
            </div>
            <div className="bg-[var(--bg-base)] rounded p-3 border border-[var(--border-primary)] max-h-32 overflow-y-auto">
              <pre className="text-[11px] text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
                {videoPrompt}
              </pre>
            </div>

            {/* 提示词拼装来源 */}
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showSources ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              提示词拼装来源 {showSources ? '收起' : '展开'}
            </button>

            {showSources && (
              <div className="bg-[var(--bg-base)] rounded p-3 border border-[var(--border-primary)] space-y-2 text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="text-[var(--text-tertiary)] shrink-0 w-20">① 叙事动作:</span>
                  <span className="text-[var(--text-primary)]">{actionSummary || '（无）'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[var(--text-tertiary)] shrink-0 w-20">② 运镜:</span>
                  <span className="text-[var(--text-primary)]">{cameraMovement || '（无）'}</span>
                </div>
                {cameraChoreography && (
                  <div className="flex items-start gap-2">
                    <span className="text-[var(--text-tertiary)] shrink-0 w-20">③ 运镜编排:</span>
                    <span className="text-[var(--text-primary)]">
                      {cameraChoreography.movementType} · {cameraChoreography.movementSpeed} ·{' '}
                      {cameraChoreography.startShotSize}→{cameraChoreography.endShotSize}
                    </span>
                  </div>
                )}
                {eraContext && (
                  <div className="flex items-start gap-2">
                    <span className="text-[var(--text-tertiary)] shrink-0 w-20">④ 时代/风格:</span>
                    <span className="text-[var(--text-primary)]">{eraContext}</span>
                  </div>
                )}
                {fourGridDescriptions && fourGridDescriptions.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[var(--text-tertiary)] shrink-0 w-20">⑤ 宫格描述:</span>
                    <div className="text-[var(--text-primary)]">
                      {fourGridDescriptions.map((d, i) => (
                        <div key={i} className="truncate">
                          分镜{i + 1}: {d}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {nineGridPanels && nineGridPanels.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[var(--text-tertiary)] shrink-0 w-20">⑤ 九宫格描述:</span>
                    <div className="text-[var(--text-primary)]">
                      {nineGridPanels.map((p, i) => (
                        <div key={i} className="truncate">
                          面板{i + 1} ({p.shotSize}/{p.cameraAngle}): {p.description}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="text-[var(--text-tertiary)] shrink-0 w-20">⑥ 语言:</span>
                  <span className="text-[var(--text-primary)]">{language}</span>
                </div>
              </div>
            )}
          </div>

          {/* 参考图片 */}
          <div className="bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-primary)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                参考图片
              </span>
              <span className="text-[8px] text-[var(--text-muted)]">
                (所有图片先上传到服务端，请求体中只传文件名)
              </span>
            </div>

            <div className="flex flex-wrap gap-4">
              {/* 模式专属首图 */}
              {mode === 'mkr-grid' && refGridImageUrl && (
                <ImageThumb url={refGridImageUrl} label="宫格整图" sublabel="refImage" />
              )}
              {mode !== 'mkr-grid' && startKeyframeImageUrl && (
                <ImageThumb
                  url={startKeyframeImageUrl}
                  label="首帧"
                  sublabel={mode === 'basic' ? 'background' : 'reference'}
                />
              )}
              {(mode === 'basic' || mode === 'msr') && endKeyframeImageUrl && (
                <ImageThumb
                  url={endKeyframeImageUrl}
                  label={mode === 'msr' ? '尾帧 image2' : '尾帧'}
                  sublabel="image2"
                />
              )}

              {/* mkr 关键帧 */}
              {mode === 'mkr' &&
                timedKeyframeImages &&
                timedKeyframeImages.length > 0 &&
                timedKeyframeImages.map((tk, i) => (
                  <ImageThumb
                    key={i}
                    url={tk.imageUrl}
                    label={`关键帧 #${i + 1}`}
                    sublabel={`${tk.positionPercent}%`}
                  />
                ))}

              {/* msr 背景 */}
              {mode === 'msr' && backgroundImage && (
                <ImageThumb url={backgroundImage} label="背景参考图" sublabel="background" />
              )}
            </div>

            {mode === 'mkr-grid' && !refGridImageUrl && (
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--warning-bg)]/20 border border-[var(--warning-border)]/30 rounded text-[10px] text-[var(--warning-text)]">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                未找到宫格参考图，请先完成推演或生成九宫格
              </div>
            )}
          </div>

          {/* JSON 预览 */}
          <div className="bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-primary)] p-4 space-y-2">
            <button
              onClick={() => setShowJsonPreview(!showJsonPreview)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {showJsonPreview ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              发送的完整 JSON {showJsonPreview ? '收起' : '展开'}
            </button>
            {showJsonPreview && (
              <pre className="bg-[var(--bg-base)] rounded p-3 border border-[var(--border-primary)] text-[10px] font-mono text-[var(--text-primary)] overflow-x-auto whitespace-pre">
                {buildJsonPreview(props, actualFrameIndexes)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-[var(--border-primary)] flex justify-between items-center shrink-0">
          <p className="text-[10px] text-[var(--text-muted)]">
            请确认以上参数符合预期，确认后将触发视频生成
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] text-sm hover:text-[var(--text-primary)] transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="px-5 py-2 bg-[var(--accent)] text-[var(--text-primary)] text-sm font-bold rounded-lg hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              确认，生成视频
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoConfirmDialog;
