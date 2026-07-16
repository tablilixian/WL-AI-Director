import React, { useCallback } from 'react';
import { Monitor, Smartphone, Square, Minus, Plus } from 'lucide-react';
import { AspectRatio, VideoDuration } from '../types';

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  /** 是否支持方形 (1:1)，默认 true。Veo 模型不支持方形 */
  allowSquare?: boolean;
  /** 紧凑模式，只显示图标 */
  compact?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 横竖屏选择器组件
 * 用于选择图片/视频生成的画面比例
 */
export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  value,
  onChange,
  allowSquare = true,
  compact = false,
  disabled = false
}) => {
  const options: { value: AspectRatio; label: string; icon: React.ReactNode; desc: string }[] = [
    { 
      value: '16:9', 
      label: '横屏', 
      icon: <Monitor className="w-4 h-4" />,
      desc: '1280x720'
    },
    { 
      value: '9:16', 
      label: '竖屏', 
      icon: <Smartphone className="w-4 h-4" />,
      desc: '720x1280'
    },
    { 
      value: '1:1', 
      label: '方形', 
      icon: <Square className="w-4 h-4" />,
      desc: '720x720'
    },
  ];

  const filteredOptions = allowSquare ? options : options.filter(o => o.value !== '1:1');

  return (
    <div className="flex gap-1">
      {filteredOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => !disabled && onChange(option.value)}
          disabled={disabled}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all
            ${value === option.value
              ? 'bg-[var(--accent)] text-[var(--text-primary)]'
              : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:bg-[var(--border-secondary)] hover:text-[var(--text-secondary)]'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title={`${option.label} (${option.desc})`}
        >
          {option.icon}
          {!compact && <span>{option.label}</span>}
        </button>
      ))}
    </div>
  );
};

interface VideoDurationSelectorProps {
  value: VideoDuration;
  onChange: (value: VideoDuration) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

const MIN_DURATION = 3;
const MAX_DURATION = 15;

/**
 * 视频时长选择器组件
 * 支持 3-15 秒自由选择，滑块 + 加减按钮
 */
export const VideoDurationSelector: React.FC<VideoDurationSelectorProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const clampedValue = Math.max(MIN_DURATION, Math.min(MAX_DURATION, value));

  const handleDecrement = useCallback(() => {
    if (!disabled && clampedValue > MIN_DURATION) onChange(clampedValue - 1);
  }, [clampedValue, disabled, onChange]);

  const handleIncrement = useCallback(() => {
    if (!disabled && clampedValue < MAX_DURATION) onChange(clampedValue + 1);
  }, [clampedValue, disabled, onChange]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) onChange(Number(e.target.value));
  }, [disabled, onChange]);

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <button
        onClick={handleDecrement}
        disabled={disabled || clampedValue <= MIN_DURATION}
        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="range"
        min={MIN_DURATION}
        max={MAX_DURATION}
        step={1}
        value={clampedValue}
        onChange={handleSliderChange}
        disabled={disabled}
        className="flex-1 h-1.5 appearance-none bg-[var(--border-secondary)] rounded-full cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]
          [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--bg-surface)]
          disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <button
        onClick={handleIncrement}
        disabled={disabled || clampedValue >= MAX_DURATION}
        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs font-mono font-bold text-[var(--text-primary)] min-w-[3ch] text-center tabular-nums">
        {clampedValue}s
      </span>
    </div>
  );
};

interface VideoSettingsPanelProps {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (value: AspectRatio) => void;
  duration: VideoDuration;
  onDurationChange: (value: VideoDuration) => void;
  /** 视频模型类型，veo 不支持方形和时长选择 */
  modelType: 'sora' | 'veo';
  disabled?: boolean;
  /** 支持的横竖屏比例列表 */
  supportedAspectRatios?: AspectRatio[];
  /** 支持的时长列表 */
  supportedDurations?: VideoDuration[];
}

/**
 * 视频设置面板
 * 组合了横竖屏选择和时长选择
 */
export const VideoSettingsPanel: React.FC<VideoSettingsPanelProps> = ({
  aspectRatio,
  onAspectRatioChange,
  duration,
  onDurationChange,
  modelType,
  disabled = false,
  supportedAspectRatios,
  supportedDurations,
}) => {
  // 根据模型支持的比例过滤
  const allowSquare = supportedAspectRatios 
    ? supportedAspectRatios.includes('1:1')
    : modelType === 'sora';
  
  // 是否显示时长选择器
  const showDuration = supportedDurations 
    ? supportedDurations.length > 1
    : modelType === 'sora';
  
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase">比例</span>
        <AspectRatioSelector
          value={aspectRatio}
          onChange={onAspectRatioChange}
          allowSquare={allowSquare}
          disabled={disabled}
        />
      </div>
      
      {showDuration && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] uppercase">时长</span>
          <VideoDurationSelector value={duration} onChange={onDurationChange} disabled={disabled} />
        </div>
      )}
    </div>
  );
};

export default AspectRatioSelector;
