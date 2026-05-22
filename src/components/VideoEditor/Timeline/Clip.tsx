import React from 'react';
import { Film, Music, Type, X } from 'lucide-react';
import { Clip as ClipType, Track as TrackType } from '../../../types/editor';
import { timeToPixels } from '../../../utils/timeCalculation';
import { formatTime } from '../../../utils/timeFormat';
import { useEditorStore } from '../../../stores/editorStore';
import { useTimelineDrag } from '../../../hooks/useTimelineDrag';
import { useTimelineTrim } from '../../../hooks/useTimelineTrim';

const TRIM_HANDLE_WIDTH = 6;

export const Clip: React.FC<{
  clip: ClipType;
  track: TrackType;
  height: number;
  zoom: number;
  isSelected: boolean;
}> = ({ clip, track, height, zoom, isSelected }) => {
  const selectClip = useEditorStore(s => s.selectClip);
  const removeClips = useEditorStore(s => s.removeClips);
  const left = timeToPixels(clip.startTime, zoom);
  const width = Math.max(40, timeToPixels(clip.duration || 100, zoom));

  const {
    isDragging,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  } = useTimelineDrag(clip.id);

  const {
    isTrimStart,
    isTrimEnd,
    handleTrimStart,
    handleTrimEndStart,
    handleTrimMove,
    handleTrimEnd,
  } = useTimelineTrim(clip.id);

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

  const isTrimming = isTrimStart || isTrimEnd;
  const isInteractive = !track.locked && track.visible;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeClips([clip.id]);
  };

  return (
    <div
      className={`absolute top-1 rounded-md overflow-hidden cursor-pointer bg-gradient-to-b ${colors[track.type] || ''} ${isSelected ? 'ring-2 ring-white/50' : ''} ${isDragging ? 'opacity-70 shadow-lg z-10' : ''}`}
      style={{ left, width: Math.max(40, width), height: height - 2 }}
      onClick={(e) => {
        if (!isDragging && !isTrimming) {
          selectClip(clip.id, e.shiftKey || e.metaKey);
        }
      }}
      onPointerDown={isInteractive ? handleDragStart : undefined}
      onPointerMove={isInteractive ? handleDragMove : undefined}
      onPointerUp={isInteractive ? handleDragEnd : undefined}
    >
      {/* 左侧裁剪手柄 */}
      {!track.locked && width > 60 && (
        <div
          className="absolute left-0 top-0 bottom-0 cursor-col-resize hover:bg-white/20 transition-colors z-10"
          style={{ width: TRIM_HANDLE_WIDTH }}
          onPointerDown={handleTrimStart}
          onPointerMove={handleTrimMove}
          onPointerUp={handleTrimEnd}
        >
          {isSelected && (
            <div className="absolute inset-y-0 right-0 w-0.5 bg-white/60" />
          )}
        </div>
      )}

      {/* 片段内容 */}
      <div className="relative flex items-center h-full px-2 gap-1.5 pointer-events-none">
        <span className="text-white/80">{icons[track.type]}</span>
        <div className="flex flex-col min-w-0 flex-1">
          {clip.name && (
            <span className="text-[9px] text-white/70 truncate leading-tight">
              {clip.name}
            </span>
          )}
          <span className="text-[10px] text-white/90 truncate font-medium leading-tight">
            {clip.duration > 0 ? formatTime(clip.duration) : '0:00'}
          </span>
        </div>
      </div>

      {/* 删除按钮 */}
      {isSelected && !track.locked && width > 80 && (
        <button
          onClick={handleDelete}
          className="absolute top-1 right-1 p-0.5 rounded bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-colors pointer-events-auto z-20"
          title="删除片段"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* 右侧裁剪手柄 */}
      {!track.locked && width > 60 && (
        <div
          className="absolute right-0 top-0 bottom-0 cursor-col-resize hover:bg-white/20 transition-colors z-10"
          style={{ width: TRIM_HANDLE_WIDTH }}
          onPointerDown={handleTrimEndStart}
          onPointerMove={handleTrimMove}
          onPointerUp={handleTrimEnd}
        >
          {isSelected && (
            <div className="absolute inset-y-0 left-0 w-0.5 bg-white/60" />
          )}
        </div>
      )}
    </div>
  );
};