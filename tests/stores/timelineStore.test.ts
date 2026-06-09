import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../../src/stores/timelineStore';

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
});

describe('timelineStore', () => {
  describe('addTrack', () => {
    it('should add a video track', () => {
      const id = useTimelineStore.getState().addTrack('video', '视频 1');
      const { tracks } = useTimelineStore.getState();

      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe(id);
      expect(tracks[0].type).toBe('video');
      expect(tracks[0].name).toBe('视频 1');
      expect(tracks[0].clips).toEqual([]);
    });

    it('should increment epoch after add', () => {
      const epochBefore = useTimelineStore.getState().epoch;
      useTimelineStore.getState().addTrack('audio');
      expect(useTimelineStore.getState().epoch).toBe(epochBefore + 1);
    });
  });

  describe('addClip', () => {
    it('should add a clip to a track', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      const clip = makeClip({ id: 'clip-1' });

      useTimelineStore.getState().addClip(trackId, clip);
      const { tracks, epoch } = useTimelineStore.getState();

      expect(tracks[0].clips).toHaveLength(1);
      expect(tracks[0].clips[0].id).toBe('clip-1');
      expect(tracks[0].clips[0].trackId).toBe(trackId);
    });

    it('should auto-place clip after last clip end', () => {
      const trackId = useTimelineStore.getState().addTrack('video');

      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2', startTime: 0, duration: 3000 }));

      const clips = useTimelineStore.getState().tracks[0].clips;
      expect(clips[1].startTime).toBe(5000);
    });

    it('should increment epoch', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      const epochBefore = useTimelineStore.getState().epoch;
      useTimelineStore.getState().addClip(trackId, makeClip());
      expect(useTimelineStore.getState().epoch).toBe(epochBefore + 1);
    });
  });

  describe('removeClips', () => {
    it('should remove clips by id', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2' }));
      useTimelineStore.getState().selectClip('c1');

      useTimelineStore.getState().removeClips(['c1']);
      const { tracks, selectedClipIds } = useTimelineStore.getState();

      expect(tracks[0].clips).toHaveLength(1);
      expect(tracks[0].clips[0].id).toBe('c2');
      expect(selectedClipIds).not.toContain('c1');
    });
  });

  describe('moveClip', () => {
    it('should move a clip to a different track', () => {
      const t1 = useTimelineStore.getState().addTrack('video');
      const t2 = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(t1, makeClip({ id: 'c1' }));

      useTimelineStore.getState().moveClip('c1', t2, 1000);
      const { tracks } = useTimelineStore.getState();

      expect(tracks.find(t => t.id === t1)?.clips).toHaveLength(0);
      expect(tracks.find(t => t.id === t2)?.clips).toHaveLength(1);
      expect(tracks.find(t => t.id === t2)?.clips[0].startTime).toBe(1000);
    });
  });

  describe('splitClip', () => {
    it('should split a clip at the given time', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 10000 }));

      useTimelineStore.getState().splitClip('c1', 4000);
      const clips = useTimelineStore.getState().tracks[0].clips;

      expect(clips).toHaveLength(2);
      expect(clips[0].id).toBe('c1-split-1');
      expect(clips[0].duration).toBe(4000);
      expect(clips[1].id).toBe('c1-split-2');
      expect(clips[1].startTime).toBe(4000);
      expect(clips[1].duration).toBe(6000);
    });

    it('should not split at clip boundaries', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));

      useTimelineStore.getState().splitClip('c1', 0);
      expect(useTimelineStore.getState().tracks[0].clips).toHaveLength(1);
    });
  });

  describe('duplicateClip', () => {
    it('should duplicate a clip after the original', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', startTime: 0, duration: 5000 }));

      useTimelineStore.getState().duplicateClip('c1');
      const clips = useTimelineStore.getState().tracks[0].clips;

      expect(clips).toHaveLength(2);
      expect(clips[1].startTime).toBe(5000);
      expect(clips[1].sourceId).toBe('src-1');
    });
  });

  describe('selectClip', () => {
    it('should select a clip', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2' }));

      useTimelineStore.getState().selectClip('c1');
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['c1']);
    });

    it('should multi-select with shift', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2' }));

      useTimelineStore.getState().selectClip('c1');
      useTimelineStore.getState().selectClip('c2', true);
      expect(useTimelineStore.getState().selectedClipIds).toEqual(['c1', 'c2']);
    });

    it('should deselect on second click with multi', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));
      useTimelineStore.getState().selectClip('c1');
      useTimelineStore.getState().selectClip('c1', true);
      expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
    });
  });

  describe('withBatch', () => {
    it('should defer epoch increment inside batch', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      const epochBefore = useTimelineStore.getState().epoch;

      useTimelineStore.getState().withBatch(() => {
        useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));
        useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2' }));
        expect(useTimelineStore.getState().epoch).toBe(epochBefore);
      });
    });

    it('should increment epoch once at end of batch', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      const epochBefore = useTimelineStore.getState().epoch;

      useTimelineStore.getState().withBatch(() => {
        useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));
        useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c2' }));
      });

      expect(useTimelineStore.getState().epoch).toBe(epochBefore + 1);
    });
  });

  describe('removeTrack', () => {
    it('should remove a track and its clips', () => {
      const t1 = useTimelineStore.getState().addTrack('video');
      const t2 = useTimelineStore.getState().addTrack('audio');
      useTimelineStore.getState().addClip(t1, makeClip({ id: 'c1' }));

      useTimelineStore.getState().removeTrack(t1);
      const { tracks, selectedClipIds } = useTimelineStore.getState();

      expect(tracks).toHaveLength(1);
      expect(tracks[0].type).toBe('audio');
    });
  });

  describe('updateClip', () => {
    it('should update clip properties', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1', volume: 1 }));

      useTimelineStore.getState().updateClip('c1', { volume: 0.5 });
      expect(useTimelineStore.getState().tracks[0].clips[0].volume).toBe(0.5);
    });
  });

  describe('find helpers', () => {
    it('findClip should return the clip', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));

      const found = useTimelineStore.getState().findClip('c1');
      expect(found).toBeDefined();
      expect(found!.id).toBe('c1');
    });

    it('findTrack should return the track', () => {
      const id = useTimelineStore.getState().addTrack('video');
      expect(useTimelineStore.getState().findTrack(id)).toBeDefined();
    });

    it('findTrackByClip should return the containing track', () => {
      const trackId = useTimelineStore.getState().addTrack('video');
      useTimelineStore.getState().addClip(trackId, makeClip({ id: 'c1' }));

      const track = useTimelineStore.getState().findTrackByClip('c1');
      expect(track).toBeDefined();
      expect(track!.id).toBe(trackId);
    });
  });

  describe('setZoom', () => {
    it('should clamp zoom to valid range', () => {
      useTimelineStore.getState().setZoom(5);
      expect(useTimelineStore.getState().zoom).toBe(10);

      useTimelineStore.getState().setZoom(600);
      expect(useTimelineStore.getState().zoom).toBe(500);
    });
  });
});
