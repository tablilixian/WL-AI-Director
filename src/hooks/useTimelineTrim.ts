import React, { useCallback, useState, useRef } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useHistoryStore } from '../stores/historyStore';
import { pixelsToTime } from '../utils/timeCalculation';

export function useTimelineTrim(clipId: string) {
  const [isTrimming, setIsTrimming] = useState<'start' | 'end' | null>(null);
  const trimState = useRef({
    startX: 0,
    originalStartTime: 0,
    originalDuration: 0,
    originalInPoint: 0,
    originalOutPoint: 0,
  });

  const zoom = useTimelineStore(s => s.zoom);
  const updateClip = useTimelineStore(s => s.updateClip);
  const findClip = useTimelineStore(s => s.findClip);
  const findTrackByClip = useTimelineStore(s => s.findTrackByClip);
  const pushHistory = useHistoryStore(s => s.pushHistory);

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

    const minDuration = 100;

    if (isTrimming === 'start') {
      let newStartTime = trimState.current.originalStartTime + deltaTime;
      let newDuration = trimState.current.originalDuration - deltaTime;
      let newInPoint = trimState.current.originalInPoint + deltaTime;

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

      if (newInPoint < 0) return;

      updateClip(clipId, {
        startTime: Math.max(0, newStartTime),
        duration: Math.max(minDuration, newDuration),
        inPoint: Math.max(0, newInPoint),
      });
    } else if (isTrimming === 'end') {
      let newDuration = trimState.current.originalDuration + deltaTime;
      let newOutPoint = trimState.current.originalOutPoint + deltaTime;

      if (newDuration < minDuration) {
        newDuration = minDuration;
        newOutPoint = trimState.current.originalInPoint + minDuration;
      }

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

    const { tracks } = useTimelineStore.getState();
    pushHistory(tracks, '裁剪片段');
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
