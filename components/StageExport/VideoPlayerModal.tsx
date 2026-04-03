import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, Loader2 } from 'lucide-react';
import { Shot, ProjectState } from '../../types';
import { STYLES } from './constants';
import { unifiedImageService } from '../../services/unifiedImageService';
import { logger, LogCategory } from '../../services/logger';

interface Props {
  completedShots: Shot[];
  currentShotIndex: number;
  isPlaying: boolean;
  project: ProjectState;
  onClose: () => void;
  onPlayPause: () => void;
  onPrevShot: () => void;
  onNextShot: () => void;
  onShotChange: (index: number) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const VideoPlayerModal: React.FC<Props> = ({
  completedShots,
  currentShotIndex,
  isPlaying,
  project,
  onClose,
  onPlayPause,
  onPrevShot,
  onNextShot,
  onShotChange,
  videoRef
}) => {
  const currentShot = completedShots[currentShotIndex];
  const shotOriginalIndex = project.shots.findIndex(s => s.id === currentShot.id);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadVideo = async () => {
      if (currentShot?.interval?.videoUrl) {
        setLoading(true);
        try {
          const url = await unifiedImageService.resolveForDisplay(currentShot.interval.videoUrl);
          setVideoUrl(url);
        } catch (err) {
          logger.error(LogCategory.VIDEO, '[VideoPlayerModal] 加载视频失败:', err);
          setVideoUrl(null);
        } finally {
          setLoading(false);
        }
      } else {
        setVideoUrl(null);
        setLoading(false);
      }
    };

    loadVideo();
  }, [currentShot?.id, currentShot?.interval?.videoUrl]);

  return (
    <div className={STYLES.videoModal.overlay}>
      <div className={STYLES.videoModal.container}>
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-primary)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Play className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-lg font-bold text-[var(--text-primary)]">视频预览</h3>
            <span className="px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border-secondary)] text-[var(--text-tertiary)] text-[10px] rounded uppercase font-mono tracking-wider">
              Shot {shotOriginalIndex + 1} / {project.shots.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video Player */}
        <div className={STYLES.videoModal.player} style={{ height: '60vh' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-12 h-12 animate-spin text-[var(--accent)]" />
            </div>
          ) : videoUrl ? (
            <video
              ref={videoRef}
              key={currentShot.id}
              src={videoUrl}
              className="max-w-full max-h-full object-contain"
              autoPlay
              controls={false}
              playsInline
              onEnded={() => {
                if (currentShotIndex < completedShots.length - 1) {
                  onShotChange(currentShotIndex + 1);
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              <span className="text-sm">视频不可用</span>
            </div>
          )}
          
          {/* Play/Pause Overlay Button */}
          <button
            onClick={onPlayPause}
            className="absolute inset-0 flex items-center justify-center bg-transparent hover:bg-[var(--overlay-light)] transition-colors group"
          >
            {!isPlaying && (
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-10 h-10 text-[var(--text-primary)] ml-1" />
              </div>
            )}
          </button>
        </div>

        {/* Shot Info */}
        <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-surface)]">
          <p className="text-sm text-[var(--text-secondary)] mb-2 line-clamp-2">{currentShot.actionSummary}</p>
          {currentShot.dialogue && (
            <p className="text-xs text-[var(--accent-text)] italic">"{currentShot.dialogue}"</p>
          )}
        </div>

        {/* Controls */}
        <div className={STYLES.videoModal.controls}>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevShot}
              disabled={currentShotIndex === 0}
              className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-primary)] flex items-center justify-center transition-colors"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={onPlayPause}
              className="w-12 h-10 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] flex items-center justify-center transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button
              onClick={onNextShot}
              disabled={currentShotIndex === completedShots.length - 1}
              className="w-10 h-10 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:cursor-not-allowed text-[var(--text-primary)] flex items-center justify-center transition-colors"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)] font-mono">
              {currentShotIndex + 1} / {completedShots.length}
            </span>
            <div className="w-px h-4 bg-[var(--border-secondary)]"></div>
            <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">
              {currentShot.cameraMovement}
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerModal;
