import { useCallback } from 'react';
import {
  normalizeTrack as _normalizeTrack,
  insertClipAtIndex as _insertClipAtIndex,
  rippleTrimClip as _rippleTrimClip,
  removeClipWithRipple as _removeClipWithRipple,
  getTrackClips as _getTrackClips,
} from '../lib/gapEngine';
import type { Clip } from '../types/editor';

export function useGapEngine() {
  const normalizeTrack = useCallback((trackId: string) => _normalizeTrack(trackId), []);
  const insertClipAtIndex = useCallback((clipId: string, targetTrackId: string, index: number) => _insertClipAtIndex(clipId, targetTrackId, index), []);
  const rippleTrimClip = useCallback((clipId: string, side: 'left' | 'right', deltaTime: number) => _rippleTrimClip(clipId, side, deltaTime), []);
  const removeClipWithRipple = useCallback((clipId: string) => _removeClipWithRipple(clipId), []);
  const getTrackClips = useCallback((trackId: string): Clip[] => _getTrackClips(trackId), []);

  return { normalizeTrack, insertClipAtIndex, rippleTrimClip, removeClipWithRipple, getTrackClips };
}
