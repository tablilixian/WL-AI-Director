import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEditorStore } from '../../../stores/editorStore';

interface PlaybackControlsProps {
  compact?: boolean;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  compact = false,
}) => {
  const {
    playState,
    currentTime,
    duration,
    loop,
    playbackRate,
    play,
    pause,
    seek,
    toggleLoop,
    setPlaybackRate,
  } = useEditorStore();

  const isPlaying = playState === 'playing';

  const handleSeek = (delta: number) => {
    seek(Math.max(0, Math.min(duration, currentTime + delta)));
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const rates = [0.5, 1, 1.5, 2];

  return (
    <div className={`flex items-center gap-2 ${compact ? 'p-2' : 'p-3'} bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)]`}>
      <button
        onClick={() => seek(0)}
        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
        title="回到开头"
      >
        <SkipBack className="w-4 h-4" />
      </button>

      <button
        onClick={() => handleSeek(-5)}
        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors text-xs font-mono"
        title="后退 5 秒"
      >
        -5s
      </button>

      <button
        onClick={() => isPlaying ? pause() : play()}
        className="p-2.5 rounded-full bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
        title={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" />
        )}
      </button>

      <button
        onClick={() => handleSeek(5)}
        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors text-xs font-mono"
        title="前进 5 秒"
      >
        +5s
      </button>

      <button
        onClick={() => seek(duration)}
        className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
        title="跳到结尾"
      >
        <SkipForward className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />

      <div className="flex items-center gap-1 font-mono text-xs text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)]">{formatTime(currentTime)}</span>
        <span className="text-[var(--text-muted)]">/</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />

      <button
        onClick={toggleLoop}
        className={`p-1.5 rounded transition-colors ${
          loop
            ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
            : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
        }`}
        title="循环播放"
      >
        <Repeat className="w-4 h-4" />
      </button>

      {!compact && (
        <>
          <div className="w-px h-6 bg-[var(--border-subtle)] mx-1" />

          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
          >
            {rates.map(rate => (
              <option key={rate} value={rate}>{rate}x</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
};
