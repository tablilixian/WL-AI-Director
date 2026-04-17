/**
 * 时间线裁剪 Hook
 * 处理片段边缘的裁剪操作
 */

import React, { useCallback, useState, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { pixelsToTime, timeToPixels } from '../utils/timeCalculation';

export function useTimelineTrim(clipId: string) {
  const [isTrimming, setIsTrimming] = useState<'start' | 'end' | null>(null);
  const trimState = useRef({
    startX: 0,
    originalStartTime: 0,
    originalDuration: 0,
    originalInPoint: 0,
    originalOutPoint: 0,
  });

  const { zoom, updateClip, findClip, findTrackByClip, pushHistory } = useEditorStore();

  const handleTrimStart = useCallback((e: React.PointerEvent) => {
    const clip = findClip(clipId);
    if (!clip) return;

    const track = findTrackByClip(clipId);
    if (!track || track.locked) return;

    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    trimState.current = {
      startX: e.clientX,
      originalStartTime: clip.startTime,
      originalDuration: clip.duration,
      originalInPoint: clip.inPoint,
      originalOutPoint: clip.outPoint,
    };

    setIsTrimming('start');
  }, [clipId, findClip, findTrackByClip]);

  const handleTrimEndStart = useCallback((e: React.PointerEvent) => {
    const clip = findClip(clipId);
    if (!clip) return;

    const track = findTrackByClip(clipId);
    if (!track || track.locked) return;

    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    trimState.current = {
      startX: e.clientX,
      originalStartTime: clip.startTime,
      originalDuration: clip.duration,
      originalInPoint: clip.inPoint,
      originalOutPoint: clip.outPoint,
    };

    setIsTrimming('end');
  }, [clipId, findClip, findTrackByClip]);

  const handleTrimMove = useCallback((e: React.PointerEvent) => {
    if (!isTrimming) return;

    const deltaX = e.clientX - trimState.current.startX;
    const deltaTime = pixelsToTime(deltaX, zoom);

    const minDuration = 100; // 最小片段时长 100ms

    if (isTrimming === 'start') {
      // 左侧裁剪：调整起始时间和入点
      let newStartTime = trimState.current.originalStartTime + deltaTime;
      let newDuration = trimState.current.originalDuration - deltaTime;
      let newInPoint = trimState.current.originalInPoint + deltaTime;

      // 边界检查
      if (newDuration < minDuration) {
        const adjustment = minDuration - newDuration;
        newStartTime -= adjustment;
        newDuration = minDuration;
        newInPoint = trimState.current.originalInPoint - adjustment;
      }
      if (newStartTime < 0) {
        const adjustment = -newStartTime;
        newStartTime = 0;
        newDuration -= adjustment;
        newInPoint -= adjustment;
      }

      // 确保不裁剪超出素材范围
      if (newInPoint < 0) return;

      updateClip(clipId, {
        startTime: Math.max(0, newStartTime),
        duration: Math.max(minDuration, newDuration),
        inPoint: Math.max(0, newInPoint),
      });
    } else if (isTrimming === 'end') {
      // 右侧裁剪：调整时长和出点
      let newDuration = trimState.current.originalDuration + deltaTime;
      let newOutPoint = trimState.current.originalOutPoint + deltaTime;

      // 边界检查
      if (newDuration < minDuration) {
        newDuration = minDuration;
        newOutPoint = trimState.current.originalInPoint + minDuration;
      }

      // 确保不裁剪超出素材范围
      if (newOutPoint > trimState.current.originalOutPoint + (trimState.current.originalDuration - minDuration) + 10000) return;

      updateClip(clipId, {
        duration: Math.max(minDuration, newDuration),
        outPoint: newOutPoint,
      });
    }
  }, [isTrimming, zoom, clipId, updateClip]);

  const handleTrimEnd = useCallback((e: React.PointerEvent) => {
    if (!isTrimming) return;

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsTrimming(null);
    pushHistory('裁剪片段');
  }, [isTrimming, pushHistory]);

  return {
    isTrimming,
    isTrimStart: isTrimming === 'start',
    isTrimEnd: isTrimming === 'end',
    handleTrimStart,
    handleTrimEndStart,
    handleTrimMove,
    handleTrimEnd,
  };
}
