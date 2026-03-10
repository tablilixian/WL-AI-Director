import React from 'react';
import { Loader2, X, Film, Clock } from 'lucide-react';
import { STYLES } from './constants';

interface Props {
  isOpen: boolean;
  phase: string;
  progress: number;
  currentShot?: number;
  totalShots?: number;
  onClose: () => void;
}

const MergeProgressModal: React.FC<Props> = ({
  isOpen,
  phase,
  progress,
  currentShot,
  totalShots,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className={STYLES.modal.overlay}>
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-[var(--border-primary)] bg-[var(--bg-elevated)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
                  <Film className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">视频合并中</h3>
                  <p className="text-xs text-[var(--text-tertiary)]">Video Merging</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Progress Circle */}
            <div className="flex justify-center mb-8">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="var(--bg-hover)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 56}`}
                    strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress / 100)}`}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-3xl font-mono font-bold text-[var(--text-primary)]">{progress}</span>
                    <span className="text-sm text-[var(--text-tertiary)]">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase Info */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{phase}</span>
              </div>
              {currentShot !== undefined && totalShots !== undefined && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                  <Clock className="w-3 h-3" />
                  <span>镜头 {currentShot} / {totalShots}</span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-[var(--bg-hover)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-elevated)]">
            <p className="text-xs text-[var(--text-tertiary)] text-center">
              请勿关闭此窗口，合并过程可能需要几分钟时间
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MergeProgressModal;
