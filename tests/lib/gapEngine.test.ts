import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../../src/stores/timelineStore';
import {
  normalizeTrack,
  insertClipAtIndex,
  rippleTrimClip,
  removeClipWithRipple,
  getTrackClips,
} from '../../src/lib/gapEngine';

function makeClip(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id || 'clip-1',
    trackId: overrides.trackId || '',
    sourceId: overrides.sourceId || 'src-1',
    sourceType: 'video' as const,
    sourceUrl: overrides.sourceUrl || '',
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 5000,
    inPoint: 0,
    outPoint: 5000,
    volume: 1,
    speed: 1,
    opacity: 1,
    ...overrides,
  };
}

function setupTrackWithClips(clips: Record<string, any>[]) {
  const trackId = useTimelineStore.getState().addTrack('video', 'Test');
  for (const c of clips) {
    const state = useTimelineStore.getState();
    const track = state.tracks.find(t => t.id === trackId)!;
    state.addClip(trackId, makeClip({ ...c, trackId }));

    // Override auto-calculated startTime
    if (c.startTime !== undefined) {
      useTimelineStore.getState().updateClip(c.id || 'clip-1', { startTime: c.startTime });
    }
  }
  return trackId;
}

beforeEach(() => {
  useTimelineStore.setState({
    tracks: [],
    selectedClipIds: [],
    zoom: 50,
    scrollPosition: 0,
    activeTrackId: null,
    expandedTrackIds: [],
    activeTool: 'select',
    epoch: 0,
    _batchDepth: 0,
    _pendingEpochIncrement: false,
  });
});

describe('getTrackClips', () => {
  it('should return empty array for non-existent track', () => {
    expect(getTrackClips('nonexistent')).toEqual([]);
  });

  it('should return clips sorted by startTime', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 5000, duration: 1000 },
      { id: 'c2', startTime: 0, duration: 1000 },
    ]);
    const clips = getTrackClips(tid);
    expect(clips[0].id).toBe('c2');
    expect(clips[1].id).toBe('c1');
  });
});

describe('normalizeTrack', () => {
  it('should do nothing on empty track', () => {
    const tid = useTimelineStore.getState().addTrack('video');
    normalizeTrack(tid);
    expect(useTimelineStore.getState().tracks.find(t => t.id === tid)!.clips).toEqual([]);
  });

  it('should close gaps between clips', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 3000 },
      { id: 'c2', startTime: 5000, duration: 2000 },
    ]);
    normalizeTrack(tid);
    const clips = getTrackClips(tid);
    expect(clips[0].startTime).toBe(0);
    expect(clips[1].startTime).toBe(3000);
  });

  it('should not change already contiguous clips', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 3000 },
      { id: 'c2', startTime: 3000, duration: 2000 },
    ]);
    const epochBefore = useTimelineStore.getState().epoch;
    normalizeTrack(tid);
    const clips = getTrackClips(tid);
    expect(clips[0].startTime).toBe(0);
    expect(clips[1].startTime).toBe(3000);
    expect(useTimelineStore.getState().epoch).toBe(epochBefore);
  });
});

describe('insertClipAtIndex', () => {
  it('should insert clip at index 0 and push others down', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 3000 },
      { id: 'c2', startTime: 3000, duration: 2000 },
    ]);
    const { addTrack } = useTimelineStore.getState();
    const otherTid = addTrack('video', 'Other');
    useTimelineStore.getState().addClip(tid, makeClip({ id: 'new-clip', startTime: 0, duration: 1000 }));

    insertClipAtIndex('new-clip', tid, 0);
    const clips = getTrackClips(tid);
    expect(clips).toHaveLength(3);
    expect(clips[0].id).toBe('new-clip');
    expect(clips[0].startTime).toBe(0);
    expect(clips[1].startTime).toBe(1000);
    expect(clips[2].startTime).toBe(4000);
  });
});

describe('rippleTrimClip', () => {
  it('should trim right side and ripple downstream clips', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 3000 },
      { id: 'c2', startTime: 3000, duration: 2000 },
    ]);
    rippleTrimClip('c1', 'right', 1000);
    const clips = getTrackClips(tid);
    expect(clips[0].duration).toBe(4000);
    expect(clips[1].startTime).toBe(4000);
  });

  it('should trim left side and ripple downstream clips', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 1000, duration: 3000 },
      { id: 'c2', startTime: 4000, duration: 2000 },
    ]);
    rippleTrimClip('c1', 'left', 500);
    const clips = getTrackClips(tid);
    expect(clips[0].startTime).toBe(1500);
    expect(clips[0].duration).toBe(2500);
    expect(clips[1].startTime).toBe(4500);
  });

  it('should clamp delta to not go below min duration', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 200 },
    ]);
    rippleTrimClip('c1', 'right', -200);
    const clips = getTrackClips(tid);
    expect(clips[0].duration).toBe(100);
  });

  it('should do nothing on locked track', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 3000 },
    ]);
    useTimelineStore.getState().updateTrack(tid, { locked: true });
    rippleTrimClip('c1', 'right', 1000);
    const clips = getTrackClips(tid);
    expect(clips[0].duration).toBe(3000);
  });
});

describe('removeClipWithRipple', () => {
  it('should remove clip and close the gap', () => {
    const tid = setupTrackWithClips([
      { id: 'c1', startTime: 0, duration: 3000 },
      { id: 'c2', startTime: 3000, duration: 2000 },
      { id: 'c3', startTime: 5000, duration: 1000 },
    ]);
    removeClipWithRipple('c2');
    const clips = getTrackClips(tid);
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('c1');
    expect(clips[1].id).toBe('c3');
    expect(clips[1].startTime).toBe(3000);
  });
});
