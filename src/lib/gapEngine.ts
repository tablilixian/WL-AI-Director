import { useTimelineStore } from '../stores/timelineStore';
import type { Clip, Track } from '../types/editor';

export function getTrackClips(trackId: string): Clip[] {
  const { tracks } = useTimelineStore.getState();
  const track = tracks.find(t => t.id === trackId);
  return track ? [...track.clips].sort((a, b) => a.startTime - b.startTime) : [];
}

export function normalizeTrack(trackId: string): void {
  const tl = useTimelineStore.getState();
  const track = tl.tracks.find(t => t.id === trackId);
  if (!track || track.clips.length === 0) return;
  if (track.type !== 'video') return;

  const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);

  const hasGap = sorted.some((c, i) => {
    if (i === 0) return Math.abs(c.startTime) > 1;
    const prevEnd = sorted[i - 1].startTime + sorted[i - 1].duration;
    return Math.abs(c.startTime - prevEnd) > 1;
  });
  if (!hasGap) return;

  tl.withBatch(() => {
    let currentTime = 0;
    for (const clip of sorted) {
      if (Math.abs(clip.startTime - currentTime) > 1) {
        tl.updateClip(clip.id, { startTime: currentTime });
      }
      currentTime += clip.duration;
    }
  });
}

export function insertClipAtIndex(clipId: string, targetTrackId: string, index: number): void {
  const tl = useTimelineStore.getState();
  const clip = tl.findClip(clipId);
  if (!clip) return;

  const track = tl.tracks.find(t => t.id === targetTrackId);
  if (!track) return;

  const trackClips = [...track.clips]
    .filter(c => c.id !== clipId)
    .sort((a, b) => a.startTime - b.startTime);

  trackClips.splice(index, 0, clip);

  tl.withBatch(() => {
    let currentTime = 0;
    for (const c of trackClips) {
      if (c.id === clipId) {
        tl.moveClip(clipId, targetTrackId, currentTime);
      } else {
        if (Math.abs(c.startTime - currentTime) > 1) {
          tl.updateClip(c.id, { startTime: currentTime });
        }
      }
      currentTime += c.duration;
    }
  });
}

export function rippleTrimClip(clipId: string, side: 'left' | 'right', deltaTime: number): void {
  const tl = useTimelineStore.getState();
  const clip = tl.findClip(clipId);
  if (!clip) return;

  const track = tl.findTrackByClip(clipId);
  if (!track || track.locked) return;

  const minDuration = 100;
  const maxDelta = clip.duration - minDuration;
  deltaTime = Math.max(-maxDelta, Math.min(maxDelta, deltaTime));

  const newDuration = clip.duration + (side === 'right' ? deltaTime : -deltaTime);
  const newStartTime = side === 'left' ? clip.startTime + deltaTime : clip.startTime;

  if (newDuration < minDuration || newStartTime < 0) return;

  const downstream = track.clips
    .filter(c => c.id !== clipId && c.startTime >= clip.startTime + clip.duration)
    .sort((a, b) => a.startTime - b.startTime);

  const rippleOffset = side === 'right' ? newDuration - clip.duration : deltaTime;

  tl.withBatch(() => {
    if (side === 'left') {
      tl.updateClip(clipId, {
        startTime: newStartTime,
        duration: newDuration,
        inPoint: clip.inPoint + deltaTime,
      });
    } else {
      tl.updateClip(clipId, {
        duration: newDuration,
        outPoint: clip.outPoint + deltaTime,
      });
    }

    for (const dc of downstream) {
      tl.updateClip(dc.id, { startTime: dc.startTime + rippleOffset });
    }
  });
}

export function removeClipWithRipple(clipId: string): void {
  const tl = useTimelineStore.getState();
  const clip = tl.findClip(clipId);
  if (!clip) return;

  const track = tl.findTrackByClip(clipId);
  if (!track) return;

  const rippleOffset = clip.duration;

  const downstream = track.clips
    .filter(c => c.id !== clipId && c.startTime >= clip.startTime + clip.duration)
    .sort((a, b) => a.startTime - b.startTime);

  tl.withBatch(() => {
    tl.removeClips([clipId]);

    for (const dc of downstream) {
      tl.updateClip(dc.id, { startTime: dc.startTime - rippleOffset });
    }
  });
}
