/**
 * 时间线主组件
 * 渲染多轨时间线，支持滚动和缩放
 */

import React, { useRef, useCallback, useMemo } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { TRACK_HEIGHT, TRACK_HEADER_WIDTH, DEFAULT_ZOOM } from '../../../types/editor';
import { timeToPixels, pixelsToTime, calculateTimelineWidth } from '../../../utils/timeCalculation';
import { formatTime } from '../../../utils/timeFormat';
import { TrackHeader } from './TrackHeader';
import { Track } from './Track';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { SnapControls } from './SnapControls';

interface TimelineProps {
  /** 视口宽度，默认 800 */
  viewportWidth?: number;
  /** 最小缩放级别 */
  minZoom?: number;
  /** 最大缩放级别 */
  maxZoom?: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  viewportWidth = 800,
  minZoom = 10,
  maxZoom = 500,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const {
    tracks,
    currentTime,
    duration,
    zoom,
    scrollPosition,
    playState,
    selectedClipIds,
    seek,
    setZoom,
    setScrollPosition,
  } = useEditorStore();

  // 计算时间线总宽度
  const totalWidth = useMemo(() => {
    const minWidth = Math.max(duration * 2, viewportWidth);
    const result = Math.max(calculateTimelineWidth(minWidth, zoom), viewportWidth);
    console.log('[Timeline] 计算 totalWidth', { duration, minWidth, result, zoom });
    return result;
  }, [duration, zoom, viewportWidth]);

  // 处理滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollPosition(e.currentTarget.scrollLeft);
  }, [setScrollPosition]);

  // 处理缩放
  const handleZoomChange = useCallback((delta: number) => {
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom + delta));
    setZoom(newZoom);
  }, [zoom, minZoom, maxZoom, setZoom]);

  // 处理滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      handleZoomChange(-e.deltaY * 0.5);
    }
  }, [handleZoomChange]);

  // 处理时间线点击跳转
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!contentRef.current) return;

    const rect = contentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollPosition;
    const clickTime = pixelsToTime(Math.max(0, x), zoom);

    seek(Math.min(clickTime, duration));
  }, [scrollPosition, zoom, seek, duration]);

  // 处理键盘快捷键
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Home':
          e.preventDefault();
          seek(0);
          break;
        case 'End':
          e.preventDefault();
          seek(duration);
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomChange(10);
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleZoomChange(-10);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [seek, duration, handleZoomChange]);

  
  const playheadX = timeToPixels(currentTime, zoom) - scrollPosition;

  return (
    <div 
      ref={containerRef}
      className="flex flex-col bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] select-none"
      style={{ height: Math.max(250, tracks.length * TRACK_HEIGHT + 80) }}
      onWheel={handleWheel}
    >
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">缩放:</span>
            <input
              type="range"
              min={minZoom}
              max={maxZoom}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 h-1 bg-[var(--bg-hover)] rounded appearance-none cursor-pointer"
            />
            <span className="text-xs text-[var(--text-secondary)] font-mono">
              {zoom}px/s
            </span>
          </div>

          <SnapControls />
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          {playState === 'playing' && (
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </div>
      </div>

      {/* 时间线内容 */}
      <div 
        className="flex-1 overflow-x-auto overflow-y-auto"
        onScroll={handleScroll}
      >
        <div
          ref={contentRef}
          className="relative min-h-full flex"
          style={{ width: totalWidth }}
        >
          <div className="sticky left-0 z-20 flex-shrink-0">
            <div className="h-8 border-b border-[var(--border-subtle)]" />
            {tracks.map((track) => (
              <TrackHeader
                key={track.id}
                track={track}
                height={TRACK_HEIGHT}
              />
            ))}
          </div>

          <div
            className="flex-1 relative"
          >
            <Ruler
              width={totalWidth}
              height={32}
              zoom={zoom}
              scrollPosition={scrollPosition}
              duration={duration}
              onClick={(time) => seek(time)}
            />

            {/* 轨道列表 */}
            {tracks.map((track) => (
              <Track
                key={track.id}
                track={track}
                height={TRACK_HEIGHT}
                zoom={zoom}
                scrollPosition={scrollPosition}
                selectedClipIds={selectedClipIds}
              />
            ))}

            {/* 播放头 */}
            {playheadX >= 0 && (
              <Playhead
                x={playheadX}
                height={tracks.length * TRACK_HEIGHT + 32}
                currentTime={currentTime}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
