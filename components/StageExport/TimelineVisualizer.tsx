import React, { useState, useEffect, useRef } from 'react';
import { Film } from 'lucide-react';
import { Shot } from '../../types';
import { STYLES } from './constants';
import { unifiedImageService } from '../../services/unifiedImageService';

interface Props {
  shots: Shot[];
}

const TimelineVisualizer: React.FC<Props> = ({ shots }) => {
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    const loadThumbnails = async () => {
      const newThumbnails = new Map<string, string>();

      for (const shot of shots) {
        if (shot.interval?.videoUrl) {
          const videoUrl = await unifiedImageService.resolveForDisplay(shot.interval.videoUrl);
          if (videoUrl) {
            newThumbnails.set(shot.id, videoUrl);
          }
        }
      }

      setThumbnailUrls(newThumbnails);
    };

    loadThumbnails();
  }, [shots]);

  const handleVideoLoaded = (shotId: string, videoElement: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      setThumbnailUrls(prev => new Map(prev).set(shotId, thumbnailDataUrl));
    }
  };

  return (
    <div className="mb-10">
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono uppercase tracking-widest mb-2 px-1">
        <span>Sequence Map</span>
        <span>TC 00:00:00:00</span>
      </div>
      <div className={STYLES.timeline.container}>
        {shots.length === 0 ? (
          <div className="w-full flex items-center justify-center text-[var(--text-muted)] text-xs font-mono uppercase tracking-widest">
            <Film className="w-4 h-4 mr-2" />
            No Shots Available
          </div>
        ) : (
          shots.map((shot, idx) => {
            const isDone = !!shot.interval?.videoUrl;
            const thumbnailUrl = thumbnailUrls.get(shot.id);
            
            return (
              <div 
                key={shot.id} 
                className={`${STYLES.timeline.segment} ${
                  isDone ? STYLES.timeline.segmentComplete : STYLES.timeline.segmentIncomplete
                }`}
                title={`Shot ${idx+1}: ${shot.actionSummary}`}
              >
                {isDone && thumbnailUrl && (
                  <div className="absolute inset-0 w-full h-full">
                    <img 
                      src={thumbnailUrl} 
                      alt={`Shot ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                {isDone && !thumbnailUrl && (
                  <div className="h-full w-full bg-[var(--accent-bg)]"></div>
                )}
                
                {isDone && thumbnailUrl && (
                  <video
                    ref={(el) => {
                      if (el && !videoRefs.current.has(shot.id)) {
                        videoRefs.current.set(shot.id, el);
                        el.addEventListener('loadeddata', () => {
                          el.currentTime = 0;
                        });
                        el.addEventListener('seeked', () => {
                          handleVideoLoaded(shot.id, el);
                        }, { once: true });
                      }
                    }}
                    src={thumbnailUrl}
                    className="hidden"
                    muted
                    preload="metadata"
                  />
                )}
                
                <div className={STYLES.timeline.tooltip}>
                  <div className="bg-[var(--bg-base)] text-[var(--text-primary)] text-[10px] px-2 py-1 rounded border border-[var(--border-secondary)] shadow-xl">
                    Shot {idx + 1}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TimelineVisualizer;
