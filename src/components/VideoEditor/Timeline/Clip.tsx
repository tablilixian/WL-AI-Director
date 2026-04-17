/**
 * 片段组件
 * 渲染单个视频/音频/文字片段
 */

import React, { useCallback, useRef, useState } from 'react';
import { Film, Music, Type } from 'lucide-react';
import { Clip as ClipType, Track as TrackType } from '../../../types/editor';
import { timeToPixels } from '../../../utils/timeCalculation';
import { useEditorStore } from '../../../stores/editorStore';
import { useTimelineDrag } from '../../../hooks/useTimelineDrag';
import { useTimelineTrim } from '../../../hooks/useTimelineTrim';

interface ClipProps {
  clip: ClipType;
  track: TrackType;
  height: number;
  zoom: number;
  isSelected: boolean;
}

export const Clip: React.FC<ClipProps> = ({
  clip,
  track,
  height,
  zoom,
  isSelected,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { selectClip } = useEditorStore();
  const { handleDragStart, handleDragMove, handleDragEnd, isDragging } = useTimelineDrag(clip.id);
  const { handleTrimStart, handleTrimEnd, isTrimming } = useTimelineTrim(clip.id);

  // 计算片段位置和宽度
  const left = timeToPixels(clip.startTime, zoom);
  const width = Math.max(20, timeToPixels(clip.duration, zoom));

  // 获取片段颜色
  const getClipColor = () => {
    switch (track.type) {
      case 'video':
        return 'from-blue-600/80 to-blue-700/80 border-blue-500';
      case 'audio':
        return 'from-green-600/80 to-green-700/80 border-green-500';
      case 'text':
        return 'from-purple-600/80 to-purple-700/80 border-purple-500';
      default:
        return 'from-gray-600/80 to-gray-700/80 border-gray-500';
    }
  };

  // 获取片段图标
  const getClipIcon = () => {
    switch (track.type) {
      case 'video':
        return <Film className="w-3 h-3" />;
      case 'audio':
        return <Music className="w-3 h-3" />;
      case 'text':
        return <Type className="w-3 h-3" />;
    }
  };

  // 处理点击选择
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    selectClip(clip.id, e.shiftKey || e.metaKey);
  }, [clip.id, selectClip]);

  // 渲染缩略图
  const renderThumbnail = () => {
    if (track.type !== 'video' || !clip.thumbnailUrl) return null;
    
    return (
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: `url(${clip.thumbnailUrl})` }}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      className={`
        absolute top-1 rounded-md overflow-hidden cursor-pointer
        transition-shadow duration-150
        bg-gradient-to-b ${getClipColor()}
        ${isSelected ? 'ring-2 ring-white/50 shadow-lg z-10' : ''}
        ${isDragging ? 'opacity-70 shadow-xl scale-[1.02]' : ''}
        ${isTrimming ? 'ring-2 ring-amber-400' : ''}
      `}
      style={{
        left,
        width,
        height: height - 2,
      }}
      onClick={handleClick}
      onPointerDown={(e) => {
        // 区分是拖拽还是裁剪
        const rect = e.currentTarget.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const edgeWidth = 8;
        
        if (relativeX < edgeWidth) {
          // 左侧边缘 - 裁剪
          handleTrimStart(e);
        } else if (relativeX > rect.width - edgeWidth) {
          // 右侧边缘 - 裁剪
          handleTrimEnd(e);
        } else {
          // 中间 - 拖拽
          handleDragStart(e);
        }
      }}
    >
      {/* 缩略图背景 */}
      {renderThumbnail()}

      {/* 左侧裁剪手柄 */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors z-10"
        onPointerDown={handleTrimStart}
      />

      {/* 片段内容 */}
      <div className="relative flex items-center h-full px-2 gap-1.5">
        <span className="text-white/80">{getClipIcon()}</span>
        <span className="text-[10px] text-white/90 truncate font-medium">
          {clip.sourceId.length > 10 ? `${clip.sourceId.slice(0, 10)}...` : clip.sourceId}
        </span>
      </div>

      {/* 右侧裁剪手柄 */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 transition-colors z-10"
        onPointerDown={handleTrimEnd}
      />

      {/* 选中边框效果 */}
      {isSelected && (
        <>
          <div className="absolute -left-px -top-px w-2 h-2 border-l-2 border-t-2 border-white/80 rounded-tl" />
          <div className="absolute -right-px -top-px w-2 h-2 border-r-2 border-t-2 border-white/80 rounded-tr" />
          <div className="absolute -left-px -bottom-px w-2 h-2 border-l-2 border-b-2 border-white/80 rounded-bl" />
          <div className="absolute -right-px -bottom-px w-2 h-2 border-r-2 border-b-2 border-white/80 rounded-br" />
        </>
      )}
    </div>
  );
};

export default Clip;
