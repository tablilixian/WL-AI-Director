/**
 * 轨道头部组件
 * 显示轨道名称、锁定和隐藏按钮
 */

import React from 'react';
import { Lock, Unlock, Eye, EyeOff, Film, Music, Type, GripVertical } from 'lucide-react';
import { Track } from '../../../types/editor';
import { useEditorStore } from '../../../stores/editorStore';

interface TrackHeaderProps {
  track: Track;
  height: number;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({ track, height }) => {
  const { updateTrack } = useEditorStore();

  const toggleLock = () => {
    updateTrack(track.id, { locked: !track.locked });
  };

  const toggleVisible = () => {
    updateTrack(track.id, { visible: !track.visible });
  };

  const getTrackIcon = () => {
    switch (track.type) {
      case 'video':
        return <Film className="w-3.5 h-3.5" />;
      case 'audio':
        return <Music className="w-3.5 h-3.5" />;
      case 'text':
        return <Type className="w-3.5 h-3.5" />;
      default:
        return <Film className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div
      className={`
        flex items-center gap-2 px-2 border-b border-[var(--border-subtle)]
        ${track.locked ? 'bg-[var(--bg-hover)] opacity-60' : 'bg-[var(--bg-secondary)]'}
      `}
      style={{ height }}
    >
      {/* 拖拽手柄 */}
      <div className="cursor-grab active:cursor-grabbing text-[var(--text-muted)]">
        <GripVertical className="w-3 h-3" />
      </div>

      {/* 轨道图标 */}
      <div className={`
        flex items-center justify-center w-6 h-6 rounded
        ${track.type === 'video' ? 'bg-blue-500/20 text-blue-400' :
          track.type === 'audio' ? 'bg-green-500/20 text-green-400' :
          'bg-purple-500/20 text-purple-400'}
      `}>
        {getTrackIcon()}
      </div>

      {/* 轨道名称 */}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-[var(--text-secondary)] truncate block">
          {track.name}
        </span>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleVisible}
          className={`
            p-1 rounded hover:bg-[var(--bg-hover)] transition-colors
            ${track.visible ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}
          `}
          title={track.visible ? '隐藏轨道' : '显示轨道'}
        >
          {track.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={toggleLock}
          className={`
            p-1 rounded hover:bg-[var(--bg-hover)] transition-colors
            ${track.locked ? 'text-amber-400' : 'text-[var(--text-muted)]'}
          `}
          title={track.locked ? '解锁轨道' : '锁定轨道'}
        >
          {track.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};

export default TrackHeader;
