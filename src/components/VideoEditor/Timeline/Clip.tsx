import React from 'react';
import { Film, Music, Type } from 'lucide-react';
import { Clip as ClipType, Track as TrackType } from '../../../types/editor';
import { timeToPixels } from '../../../utils/timeCalculation';
import { formatTime } from '../../../utils/timeFormat';
import { useEditorStore } from '../../../stores/editorStore';

export const Clip: React.FC<{
  clip: ClipType;
  track: TrackType;
  height: number;
  zoom: number;
  isSelected: boolean;
}> = ({ clip, track, height, zoom, isSelected }) => {
  const selectClip = useEditorStore(s => s.selectClip);
  const left = timeToPixels(clip.startTime, zoom);
  const width = Math.max(40, timeToPixels(clip.duration || 100, zoom));
  const clipDuration = (clip.duration || 0) / 1000;

  const colors: Record<string, string> = {
    video: 'from-blue-600/80 to-blue-700/80 border-blue-500',
    audio: 'from-green-600/80 to-green-700/80 border-green-500',
    text: 'from-purple-600/80 to-purple-700/80 border-purple-500',
  };

  const icons: Record<string, React.ReactNode> = {
    video: <Film className="w-3 h-3" />,
    audio: <Music className="w-3 h-3" />,
    text: <Type className="w-3 h-3" />,
  };

  return (
    <div
      className={`absolute top-1 rounded-md overflow-hidden cursor-pointer bg-gradient-to-b ${colors[track.type] || ''} ${isSelected ? 'ring-2 ring-white/50' : ''}`}
      style={{ left, width: Math.max(40, width), height: height - 2 }}
      onClick={() => selectClip(clip.id, false)}
    >
      <div className="relative flex items-center h-full px-2 gap-1.5">
        <span className="text-white/80">{icons[track.type]}</span>
        <span className="text-[10px] text-white/90 truncate font-medium">
          {clipDuration > 0 ? formatTime(clipDuration) : '0:00'}
        </span>
      </div>
    </div>
  );
};