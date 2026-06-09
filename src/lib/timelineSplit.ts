import { useTimelineStore } from '../stores/timelineStore';
import { usePlaybackStore } from '../stores/playbackStore';

export function splitAtPlayhead(): { success: boolean; clipId: string | null; splitTime: number } {
  const tl = useTimelineStore.getState();
  const pb = usePlaybackStore.getState();
  const splitTime = pb.currentTime;

  for (const track of tl.tracks) {
    if (track.locked || !track.visible) continue;

    for (const clip of track.clips) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      if (splitTime > clipStart && splitTime < clipEnd) {
        tl.withBatch(() => {
          tl.splitClip(clip.id, splitTime);
        });
        return { success: true, clipId: clip.id, splitTime };
      }
    }
  }

  return { success: false, clipId: null, splitTime };
}

export function splitClipAt(clipId: string, splitTime: number): { success: boolean; clipId: string | null; splitTime: number } {
  const tl = useTimelineStore.getState();
  const clip = tl.findClip(clipId);
  if (!clip) return { success: false, clipId: null, splitTime };

  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;

  if (splitTime <= clipStart || splitTime >= clipEnd) {
    return { success: false, clipId: null, splitTime };
  }

  tl.withBatch(() => {
    tl.splitClip(clipId, splitTime);
  });

  return { success: true, clipId, splitTime };
}
