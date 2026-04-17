/**
 * 单个轨道组件
 * 渲染轨道内的所有片段
 */

import React from 'react';
import { Track as TrackType } from '../../../types/editor';
import { Clip } from './Clip';

interface TrackProps {
  track: TrackType;
  height: number;
  zoom: number;
  scrollPosition: number;
  selectedClipIds: string[];
}

export const Track: React.FC<TrackProps> = ({
  track,
  height,
  zoom,
  scrollPosition,
  selectedClipIds,
}) => {
  return (
    <div
      className={`
        relative border-b border-[var(--border-subtle)]
        ${!track.visible ? 'opacity-40' : ''}
        ${track.locked ? 'pointer-events-none' : ''}
      `}
      style={{ height }}
    >
      {/* 轨道背景 - 可选：显示网格或辅助线 */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          background: track.type === 'video' 
            ? 'repeating-linear-gradient(90deg, transparent 0px, transparent 49px, var(--border-subtle) 49px, var(--border-subtle) 50px)'
            : undefined,
          opacity: 0.3,
        }}
      />

      {/* 片段列表 */}
      {track.clips.map((clip) => (
        <Clip
          key={clip.id}
          clip={clip}
          track={track}
          height={height - 4}
          zoom={zoom}
          isSelected={selectedClipIds.includes(clip.id)}
        />
      ))}

      {/* 空状态提示 */}
      {track.clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] text-[var(--text-muted)]">
            {track.type === 'video' ? '拖拽素材到此处' :
             track.type === 'audio' ? '拖拽音频到此处' :
             '添加文字'}
          </span>
        </div>
      )}
    </div>
  );
};

export default Track;
