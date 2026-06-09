import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../../src/stores/timelineStore';
import { usePlaybackStore } from '../../src/stores/playbackStore';
import { splitClipAt, splitAtPlayhead } from '../../src/lib/timelineSplit';

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
  usePlaybackStore.setState({
    currentTime: 0,
    playState: 'stopped',
    duration: 0,
    loop: false,
    playbackRate: 1,
  });
});

describe('splitClipAt', () => {
  it('should split a clip at the given time', () => {
    const trackId = useTimelineStore.getState().addTrack('video');
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));
    const result = splitClipAt('c1', 2000);
    expect(result.success).toBe(true);
    const clips = useTimelineStore.getState().tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).toBe('c1-split-1');
    expect(clips[0].duration).toBe(2000);
    expect(clips[1].id).toBe('c1-split-2');
    expect(clips[1].startTime).toBe(2000);
    expect(clips[1].duration).toBe(3000);
  });

  it('should return failure if clip does not exist', () => {
    const result = splitClipAt('nonexistent', 1000);
    expect(result.success).toBe(false);
  });

  it('should return failure if split time is at clip boundary', () => {
    const trackId = useTimelineStore.getState().addTrack('video');
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));
    expect(splitClipAt('c1', 0).success).toBe(false);
    expect(splitClipAt('c1', 5000).success).toBe(false);
  });
});

describe('splitAtPlayhead', () => {
  it('should split a clip at the current playhead time', () => {
    const trackId = useTimelineStore.getState().addTrack('video');
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));
    usePlaybackStore.getState().setDuration(30000);
    usePlaybackStore.getState().seek(2000);
    const result = splitAtPlayhead();
    expect(result.success).toBe(true);
    expect(result.clipId).toBe('c1');
    expect(result.splitTime).toBe(2000);
    const clips = useTimelineStore.getState().tracks[0].clips;
    expect(clips).toHaveLength(2);
  });

  it('should skip locked tracks', () => {
    const trackId = useTimelineStore.getState().addTrack('video');
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));
    useTimelineStore.getState().updateTrack(trackId, { locked: true });
    usePlaybackStore.getState().setDuration(30000);
    usePlaybackStore.getState().seek(2000);
    const result = splitAtPlayhead();
    expect(result.success).toBe(false);
  });

  it('should return failure when no clip is at playhead', () => {
    const trackId = useTimelineStore.getState().addTrack('video');
    useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 10000, duration: 5000 }));
    usePlaybackStore.getState().setDuration(30000);
    usePlaybackStore.getState().seek(0);
    const result = splitAtPlayhead();
    expect(result.success).toBe(false);
  });
});
