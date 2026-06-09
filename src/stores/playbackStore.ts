import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { PlayState } from '../types/editor';
import { clampTime } from '../utils/timeFormat';

interface PlaybackStore {
  currentTime: number;
  playState: PlayState;
  duration: number;
  loop: boolean;
  playbackRate: number;

  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  toggleLoop: () => void;
  setDuration: (duration: number) => void;
}

export const usePlaybackStore = create<PlaybackStore>()(
  subscribeWithSelector((set, get) => ({
    currentTime: 0,
    playState: 'stopped' as PlayState,
    duration: 0,
    loop: false,
    playbackRate: 1,

    play: () => set({ playState: 'playing' }),
    pause: () => set({ playState: 'paused' }),
    stop: () => set({ playState: 'stopped', currentTime: 0 }),

    seek: (time) => {
      const duration = get().duration;
      set({ currentTime: clampTime(time, 0, duration) });
    },

    setPlaybackRate: (rate) => set({ playbackRate: rate }),
    toggleLoop: () => set((state) => ({ loop: !state.loop })),
    setDuration: (duration) => set({ duration }),
  }))
);
