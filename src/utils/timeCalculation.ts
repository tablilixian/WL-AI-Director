/**
 * 时间计算工具函数
 * 用于像素与毫秒之间的转换，以及时间线的各种计算
 */

import { MS_PER_SECOND, clampTime } from './timeFormat';
import { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, TRACK_HEIGHT, TRACK_HEADER_WIDTH } from '../types/editor';

// ============================================================
// 缩放相关
// ============================================================

/**
 * 计算像素/秒转换为像素/毫秒
 */
export function zoomToPixelsPerMs(zoom: number): number {
  return zoom / MS_PER_SECOND;
}

/**
 * 毫秒转换为像素
 * @param ms - 毫秒数
 * @param zoom - 缩放级别（像素/秒）
 * @returns 像素数
 */
export function timeToPixels(ms: number, zoom: number): number {
  return (ms / MS_PER_SECOND) * zoom;
}

/**
 * 像素转换为毫秒
 * @param pixels - 像素数
 * @param zoom - 缩放级别（像素/秒）
 * @returns 毫秒数
 */
export function pixelsToTime(pixels: number, zoom: number): number {
  return (pixels / zoom) * MS_PER_SECOND;
}

/**
 * 限制缩放级别在有效范围内
 */
export function clampZoom(zoom: number): number {
  return clampTime(zoom, MIN_ZOOM, MAX_ZOOM);
}

/**
 * 计算时间线总宽度
 * @param duration - 总时长（毫秒）
 * @param zoom - 缩放级别（像素/秒）
 * @returns 总宽度（像素）
 */
export function calculateTimelineWidth(duration: number, zoom: number): number {
  return timeToPixels(duration, zoom) + TRACK_HEADER_WIDTH + 100; // 额外 100px 边距
}

// ============================================================
// 时间线导航
// ============================================================

/**
 * 计算滚动位置以居中显示指定时间
 * @param time - 要显示的时间（毫秒）
 * @param viewportWidth - 视口宽度（像素）
 * @param zoom - 缩放级别（像素/秒）
 * @returns 滚动位置（像素）
 */
export function calculateScrollToTime(
  time: number,
  viewportWidth: number,
  zoom: number
): number {
  const centerOffset = viewportWidth / 2;
  return timeToPixels(time, zoom) - centerOffset + TRACK_HEADER_WIDTH;
}

/**
 * 计算时间线可视范围
 * @param scrollPosition - 滚动位置（像素）
 * @param viewportWidth - 视口宽度（像素）
 * @param zoom - 缩放级别（像素/秒）
 * @returns 可视范围 { start, end }（毫秒）
 */
export function calculateVisibleRange(
  scrollPosition: number,
  viewportWidth: number,
  zoom: number
): { start: number; end: number } {
  const start = pixelsToTime(Math.max(0, scrollPosition - TRACK_HEADER_WIDTH), zoom);
  const end = pixelsToTime(scrollPosition + viewportWidth, zoom);
  return { start, end };
}

/**
 * 检查指定时间是否在可视范围内
 */
export function isTimeVisible(
  time: number,
  scrollPosition: number,
  viewportWidth: number,
  zoom: number
): boolean {
  const { start, end } = calculateVisibleRange(scrollPosition, viewportWidth, zoom);
  return time >= start && time <= end;
}

// ============================================================
// 片段计算
// ============================================================

/**
 * 计算片段的结束时间
 */
export function getClipEndTime(clip: { startTime: number; duration: number }): number {
  return clip.startTime + clip.duration;
}

/**
 * 检查两个片段是否重叠
 */
export function clipsOverlap(
  clip1: { startTime: number; duration: number },
  clip2: { startTime: number; duration: number }
): boolean {
  const end1 = getClipEndTime(clip1);
  const end2 = getClipEndTime(clip2);
  return clip1.startTime < end2 && end1 > clip2.startTime;
}

/**
 * 计算片段在指定时间的相对位置
 * @param clip - 片段
 * @param time - 当前时间（毫秒）
 * @returns 相对时间（毫秒），如果不在片段范围内返回 null
 */
export function getClipRelativeTime(
  clip: { startTime: number; duration: number; inPoint: number },
  time: number
): number | null {
  if (time < clip.startTime || time >= clip.startTime + clip.duration) {
    return null;
  }
  return time - clip.startTime + clip.inPoint;
}

/**
 * 检查时间点是否在片段范围内
 */
export function isTimeInClip(
  time: number,
  clip: { startTime: number; duration: number }
): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}

// ============================================================
// 时间线标尺
// ============================================================

/**
 * 计算标尺刻度间隔
 * 根据缩放级别自动选择合适的刻度间隔
 */
export function calculateRulerInterval(zoom: number): number {
  if (zoom >= 200) return MS_PER_SECOND; // 每秒一个刻度
  if (zoom >= 100) return MS_PER_SECOND * 2; // 每 2 秒
  if (zoom >= 50) return MS_PER_SECOND * 5; // 每 5 秒
  if (zoom >= 25) return MS_PER_SECOND * 10; // 每 10 秒
  if (zoom >= 10) return MS_PER_SECOND * 30; // 每 30 秒
  return MS_PER_SECOND * 60; // 每分钟
}

/**
 * 生成标尺刻度点
 * @param duration - 总时长（毫秒）
 * @param zoom - 缩放级别
 * @param scrollPosition - 滚动位置
 * @param viewportWidth - 视口宽度
 * @returns 刻度点列表
 */
export function generateRulerTicks(
  duration: number,
  zoom: number,
  scrollPosition: number,
  viewportWidth: number
): Array<{ time: number; x: number; major: boolean }> {
  const interval = calculateRulerInterval(zoom);
  const majorInterval = interval >= MS_PER_SECOND * 60 ? interval : interval * 5;
  
  const { start } = calculateVisibleRange(scrollPosition, viewportWidth, zoom);
  const { end } = calculateVisibleRange(scrollPosition, viewportWidth, zoom);
  
  const ticks: Array<{ time: number; x: number; major: boolean }> = [];
  
  // 从可见范围的起点向前取整到最近的 interval
  const firstTick = Math.floor(start / interval) * interval;
  
  for (let time = firstTick; time <= end + interval; time += interval) {
    if (time < 0) continue;
    if (time > duration) break;
    
    const x = timeToPixels(time, zoom);
    const major = time % majorInterval === 0;
    
    ticks.push({ time, x, major });
  }
  
  return ticks;
}

// ============================================================
// 片段位置计算
// ============================================================

/**
 * 计算片段在时间线上的像素位置和宽度
 */
export function getClipPosition(
  clip: { startTime: number; duration: number },
  zoom: number
): { x: number; width: number } {
  return {
    x: timeToPixels(clip.startTime, zoom),
    width: timeToPixels(clip.duration, zoom),
  };
}

/**
 * 限制片段在轨道范围内
 * @param startTime - 片段起始时间
 * @param duration - 片段时长
 * @param minTime - 最小时间（通常为 0）
 * @param maxTime - 最大时间（轨道边界）
 * @returns 调整后的 { startTime, duration }
 */
export function clampClipToTrack(
  startTime: number,
  duration: number,
  minTime: number = 0,
  maxTime?: number
): { startTime: number; duration: number } {
  let newStartTime = Math.max(minTime, startTime);
  let newDuration = duration;
  
  if (maxTime !== undefined) {
    // 如果起始位置超出范围，调整起始位置
    if (newStartTime >= maxTime) {
      newStartTime = maxTime - duration;
      newDuration = 0;
    } else {
      // 确保片段不超过右边界
      const endTime = newStartTime + newDuration;
      if (endTime > maxTime) {
        newDuration = maxTime - newStartTime;
      }
    }
  }
  
  return {
    startTime: Math.max(0, newStartTime),
    duration: Math.max(0, newDuration),
  };
}

// ============================================================
// 播放控制
// ============================================================

/**
 * 计算播放头位置
 */
export function getPlayheadPosition(currentTime: number, zoom: number): number {
  return timeToPixels(currentTime, zoom);
}

/**
 * 跳转到指定时间（带边界限制）
 */
export function seekToTime(time: number, duration: number): number {
  return clampTime(time, 0, duration);
}

/**
 * 计算播放进度百分比
 */
export function calculateProgress(currentTime: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}

// ============================================================
// 轨道高度计算
// ============================================================

/**
 * 计算轨道 Y 坐标
 */
export function getTrackY(trackIndex: number): number {
  return trackIndex * TRACK_HEIGHT;
}

/**
 * 获取轨道索引
 */
export function getTrackIndex(y: number): number {
  return Math.floor(y / TRACK_HEIGHT);
}
