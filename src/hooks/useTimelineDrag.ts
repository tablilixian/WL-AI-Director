import React, { useCallback, useState, useRef } from 'react';
import { useTimelineStore } from '../stores/timelineStore';
import { useHistoryStore } from '../stores/historyStore';
import { useSnapCalculation, useSnapStore } from '../stores/snapStore';
import { SnapPoint } from '../types/editor';
import { pixelsToTime } from '../utils/timeCalculation';
import { normalizeTrack } from '../lib/gapEngine';

export function useTimelineDrag(clipId: string) {
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef({
    startX: 0,
    startTime: 0,
    trackId: '',
  });

  const zoom = useTimelineStore(s => s.zoom);
  const tracks = useTimelineStore(s => s.tracks);
  const moveClip = useTimelineStore(s => s.moveClip);
  const findClip = useTimelineStore(s => s.findClip);
  const findTrackByClip = useTimelineStore(s => s.findTrackByClip);
  const pushHistory = useHistoryStore(s => s.pushHistory);
  const { calculateClipSnap, getSnapPoints } = useSnapCalculation();
  const setActiveSnap = useSnapStore(s => s.setActiveSnap);
  const clearActiveSnap = useSnapStore(s => s.clearActiveSnap);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    const clip = findClip(clipId);
    if (!clip) return;

    const track = findTrackByClip(clipId);
    if (!track || track.locked) return;

    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragState.current = {
      startX: e.clientX,
      startTime: clip.startTime,
      trackId: track.id,
    };

    setIsDragging(true);
    clearActiveSnap();
  }, [clipId, findClip, findTrackByClip, clearActiveSnap]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragState.current.startX;
    const deltaTime = pixelsToTime(deltaX, zoom);
    let newStartTime = dragState.current.startTime + deltaTime;

    newStartTime = Math.max(0, newStartTime);

    const clip = findClip(clipId);
    if (clip) {
      const snapPoints = getSnapPoints(clipId);
      const { finalTime, snapInfo: snap } = calculateClipSnap(newStartTime, clip.duration, snapPoints);
      newStartTime = finalTime;

      if (snap?.snapped) {
        setActiveSnap({ snapped: true, snapTime: snap.snappedTime, snapPoint: snap.snapPoint });
      } else {
        clearActiveSnap();
      }
    }

    moveClip(clipId, dragState.current.trackId, newStartTime);
  }, [isDragging, zoom, clipId, findClip, getSnapPoints, calculateClipSnap, moveClip, setActiveSnap, clearActiveSnap]);

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
    clearActiveSnap();

    normalizeTrack(dragState.current.trackId);

    const { tracks: tlTracks } = useTimelineStore.getState();
    pushHistory(tlTracks, '移动片段');
  }, [isDragging, pushHistory, clearActiveSnap]);

  return {
    isDragging,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}
