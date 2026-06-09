import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaybackStore } from '../../src/stores/playbackStore';

beforeEach(() => {
  usePlaybackStore.setState({
    currentTime: 0,
    playState: 'stopped',
    duration: 0,
    loop: false,
    playbackRate: 1,
  });
});

describe('playbackStore', () => {
  describe('play / pause / stop', () => {
    it('should set playState to playing', () => {
      usePlaybackStore.getState().play();
      expect(usePlaybackStore.getState().playState).toBe('playing');
    });

    it('should set playState to paused', () => {
      usePlaybackStore.getState().play();
      usePlaybackStore.getState().pause();
      expect(usePlaybackStore.getState().playState).toBe('paused');
    });

    it('should reset currentTime on stop', () => {
      usePlaybackStore.getState().seek(5000);
      usePlaybackStore.getState().stop();
      expect(usePlaybackStore.getState().playState).toBe('stopped');
      expect(usePlaybackStore.getState().currentTime).toBe(0);
    });
  });

  describe('seek', () => {
    it('should seek to a valid time', () => {
      usePlaybackStore.getState().setDuration(10000);
      usePlaybackStore.getState().seek(5000);
      expect(usePlaybackStore.getState().currentTime).toBe(5000);
    });

    it('should clamp to duration', () => {
      usePlaybackStore.getState().setDuration(10000);
      usePlaybackStore.getState().seek(15000);
      expect(usePlaybackStore.getState().currentTime).toBe(10000);
    });

    it('should clamp to zero', () => {
      usePlaybackStore.getState().seek(-100);
      expect(usePlaybackStore.getState().currentTime).toBe(0);
    });
  });

  describe('playback controls', () => {
    it('should set playback rate', () => {
      usePlaybackStore.getState().setPlaybackRate(2);
      expect(usePlaybackStore.getState().playbackRate).toBe(2);
    });

    it('should toggle loop', () => {
      expect(usePlaybackStore.getState().loop).toBe(false);
      usePlaybackStore.getState().toggleLoop();
      expect(usePlaybackStore.getState().loop).toBe(true);
      usePlaybackStore.getState().toggleLoop();
      expect(usePlaybackStore.getState().loop).toBe(false);
    });

    it('should set duration', () => {
      usePlaybackStore.getState().setDuration(30000);
      expect(usePlaybackStore.getState().duration).toBe(30000);
    });
  });

  describe('edge cases', () => {
    it('should seek to zero when duration is zero', () => {
      usePlaybackStore.getState().seek(1000);
      expect(usePlaybackStore.getState().currentTime).toBe(0);
    });

    it('should maintain currentTime across play/pause', () => {
      usePlaybackStore.getState().setDuration(10000);
      usePlaybackStore.getState().seek(3000);
      usePlaybackStore.getState().play();
      usePlaybackStore.getState().pause();
      expect(usePlaybackStore.getState().currentTime).toBe(3000);
      expect(usePlaybackStore.getState().playState).toBe('paused');
    });
  });
});
