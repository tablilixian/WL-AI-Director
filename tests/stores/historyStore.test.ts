import { describe, it, expect, beforeEach } from 'vitest';
import { useHistoryStore } from '../../src/stores/historyStore';

function makeTracks(overrides: Record<string, any> = {}) {
  return [{
    id: 'v1',
    name: '视频 1',
    type: 'video' as const,
    locked: false,
    visible: true,
    clips: [{
      id: 'c1',
      trackId: 'v1',
      sourceId: 'src-1',
      sourceType: 'video' as const,
      sourceUrl: '',
      startTime: 0,
      duration: 5000,
      inPoint: 0,
      outPoint: 5000,
      volume: 1,
      speed: 1,
      opacity: 1,
      ...(overrides.clip || {}),
    }],
    ...overrides,
  }];
}

beforeEach(() => {
  useHistoryStore.getState().reset();
});

describe('historyStore', () => {
  describe('pushHistory', () => {
    it('should set canUndo to true after second push', () => {
      const tracks = makeTracks();
      useHistoryStore.getState().pushHistory(tracks, 'init');
      expect(useHistoryStore.getState().canUndo).toBe(false);

      useHistoryStore.getState().pushHistory(tracks, 'modify');
      expect(useHistoryStore.getState().canUndo).toBe(true);
    });
  });

  describe('undo', () => {
    it('should return previous tracks on undo', () => {
      const tracks1 = makeTracks();
      const tracks2 = makeTracks({ clip: { id: 'c2', duration: 3000 } });

      useHistoryStore.getState().pushHistory(tracks1, 'init');
      useHistoryStore.getState().pushHistory(tracks2, 'add clip');

      const restored = useHistoryStore.getState().undo();
      expect(restored).toBeDefined();
      expect(restored![0].clips).toHaveLength(1);
      expect(restored![0].clips[0].id).toBe('c1');
    });

    it('should return null when no history to undo', () => {
      const result = useHistoryStore.getState().undo();
      expect(result).toBeNull();
    });

    it('should update canUndo/canRedo after undo', () => {
      const tracks = makeTracks();
      useHistoryStore.getState().pushHistory(tracks, 'init');
      useHistoryStore.getState().pushHistory(tracks, 'modify');

      useHistoryStore.getState().undo();
      expect(useHistoryStore.getState().canRedo).toBe(true);
    });
  });

  describe('redo', () => {
    it('should restore tracks after undo+redo', () => {
      const tracks1 = makeTracks();
      const tracks2 = makeTracks({ clip: { id: 'c2', duration: 3000 } });

      useHistoryStore.getState().pushHistory(tracks1, 'init');
      useHistoryStore.getState().pushHistory(tracks2, 'add clip');

      useHistoryStore.getState().undo();
      const restored = useHistoryStore.getState().redo();
      expect(restored).toBeDefined();
      expect(restored![0].clips[0].id).toBe('c2');
      expect(useHistoryStore.getState().canRedo).toBe(false);
    });

    it('should return null when nothing to redo', () => {
      const result = useHistoryStore.getState().redo();
      expect(result).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset undo/redo state', () => {
      useHistoryStore.getState().pushHistory(makeTracks(), 'init');
      useHistoryStore.getState().reset();
      expect(useHistoryStore.getState().canUndo).toBe(false);
      expect(useHistoryStore.getState().canRedo).toBe(false);
      expect(useHistoryStore.getState().undo()).toBeNull();
    });
  });

  describe('history limit', () => {
    it('should handle pushing many entries', () => {
      for (let i = 0; i < 60; i++) {
        useHistoryStore.getState().pushHistory(makeTracks(), `entry ${i}`);
      }
      expect(useHistoryStore.getState().canUndo).toBe(true);
    });
  });

  describe('branch cut on new action after undo', () => {
    it('should discard future history on new push after undo', () => {
      const tracks1 = makeTracks();
      const tracks2 = makeTracks({ clip: { id: 'c2', duration: 3000 } });
      const tracks3 = makeTracks({ clip: { id: 'c3', duration: 1000 } });

      useHistoryStore.getState().pushHistory(tracks1, 'init');
      useHistoryStore.getState().pushHistory(tracks2, 'add c2');
      useHistoryStore.getState().pushHistory(tracks3, 'add c3');

      // Undo twice back to tracks1
      useHistoryStore.getState().undo(); // at tracks2
      useHistoryStore.getState().undo(); // at tracks1

      // Push new history — should cut tracks2/tracks3
      const tracks4 = makeTracks({ clip: { id: 'c4', duration: 4000 } });
      useHistoryStore.getState().pushHistory(tracks4, 'add c4');

      expect(useHistoryStore.getState().canRedo).toBe(false);
      const restored = useHistoryStore.getState().undo();
      expect(restored![0].clips[0].id).toBe('c1');
    });
  });
});
