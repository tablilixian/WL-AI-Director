import React from 'react';
import { Magnet, Crosshair, Circle } from 'lucide-react';
import { useSnapStore } from '../../../stores/snapStore';

interface SnapControlsProps {
  compact?: boolean;
}

export const SnapControls: React.FC<SnapControlsProps> = ({ compact = false }) => {
  const {
    config,
    toggleSnap,
    setThreshold,
    togglePlayheadSnap,
    toggleClipEdgesSnap,
    toggleClipCenterSnap,
  } = useSnapStore();

  const thresholds = [
    { value: 100, label: '100ms' },
    { value: 250, label: '250ms' },
    { value: 500, label: '500ms' },
    { value: 1000, label: '1s' },
  ];

  if (compact) {
    return (
      <button
        onClick={toggleSnap}
        className={`p-1.5 rounded transition-colors ${
          config.enabled
            ? 'bg-green-500/20 text-green-400'
            : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
        }`}
        title={config.enabled ? '吸附已开启' : '吸附已关闭'}
      >
        <Magnet className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)]">
      <button
        onClick={toggleSnap}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
          config.enabled
            ? 'bg-green-500/20 text-green-400'
            : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
        }`}
        title={config.enabled ? '吸附已开启' : '吸附已关闭'}
      >
        <Magnet className="w-3.5 h-3.5" />
        吸附 {config.enabled ? '开' : '关'}
      </button>

      {config.enabled && (
        <>
          <div className="w-px h-5 bg-[var(--border-subtle)]" />

          <select
            value={config.threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none"
            title="吸附灵敏度"
          >
            {thresholds.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <div className="w-px h-5 bg-[var(--border-subtle)]" />

          <button
            onClick={togglePlayheadSnap}
            className={`p-1.5 rounded transition-colors ${
              config.snapToPlayhead
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
            title="吸附到播放头"
          >
            <Crosshair className="w-4 h-4" />
          </button>

          <button
            onClick={toggleClipEdgesSnap}
            className={`p-1.5 rounded transition-colors ${
              config.snapToClipEdges
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
            title="吸附到片段边缘"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="12" height="8" rx="1" />
            </svg>
          </button>

          <button
            onClick={toggleClipCenterSnap}
            className={`p-1.5 rounded transition-colors ${
              config.snapToClipCenter
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
            title="吸附到片段中心"
          >
            <Circle className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
};
