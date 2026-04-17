import React, { useMemo } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { VideoLayer } from './VideoLayer';
import { TextLayer } from './TextLayer';
import { isTextClip } from '../../../types/editor';

interface PreviewCanvasProps {
  aspectRatio?: '16:9' | '9:16' | '4:3' | '1:1';
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  aspectRatio = '16:9',
}) => {
  const { tracks, currentTime } = useEditorStore();

  const aspectRatioValue = useMemo(() => {
    switch (aspectRatio) {
      case '16:9': return 16 / 9;
      case '9:16': return 9 / 16;
      case '4:3': return 4 / 3;
      case '1:1': return 1;
      default: return 16 / 9;
    }
  }, [aspectRatio]);

  const videoTracks = useMemo(() => {
    return tracks.filter(t => t.type === 'video' && t.visible);
  }, [tracks]);

  const textTracks = useMemo(() => {
    return tracks.filter(t => t.type === 'text' && t.visible);
  }, [tracks]);

  const hasContent = videoTracks.length > 0 || textTracks.length > 0;

  return (
    <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ aspectRatio: `${aspectRatioValue}` }}>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
        {!hasContent ? (
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">🎬</div>
            <div className="text-sm">添加片段开始预览</div>
          </div>
        ) : (
          <>
            {videoTracks.map(track =>
              track.clips.map(clip => (
                <VideoLayer
                  key={clip.id}
                  clipId={clip.id}
                  src={clip.sourceUrl || ''}
                  currentTime={currentTime}
                  startTime={clip.startTime}
                  duration={clip.duration}
                  inPoint={clip.inPoint}
                  outPoint={clip.outPoint}
                  opacity={1}
                  volume={1}
                  visible={track.visible}
                />
              ))
            )}

            {textTracks.map(track =>
              track.clips
                .filter(clip => isTextClip(clip))
                .map(clip => (
                  <TextLayer
                    key={clip.id}
                    clip={clip}
                    currentTime={currentTime}
                    startTime={clip.startTime}
                    duration={clip.duration}
                  />
                ))
            )}
          </>
        )}
      </div>

      <div className="absolute bottom-2 left-2 right-2 flex justify-between text-xs text-white/60">
        <span>{currentTime.toFixed(2)}s</span>
        <span>{aspectRatio}</span>
      </div>
    </div>
  );
};
