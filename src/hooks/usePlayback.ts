import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';

export function usePlayback() {
  const {
    playState,
    duration,
    loop,
    playbackRate,
    seek: storeSeek,
  } = useEditorStore();

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = timestamp;
      startTimeRef.current = timestamp;
    }

    const elapsed = (timestamp - startTimeRef.current) * playbackRate;
    const newTime = useEditorStore.getState().currentTime + elapsed / 1000;
    startTimeRef.current = timestamp;
    lastTimeRef.current = timestamp;

    const currentDuration = useEditorStore.getState().duration;

    if (newTime >= currentDuration) {
      if (loop) {
        storeSeek(0);
        startTimeRef.current = timestamp;
      } else {
        storeSeek(currentDuration);
        useEditorStore.getState().pause();
        return;
      }
    } else {
      storeSeek(newTime);
    }

    if (useEditorStore.getState().playState === 'playing') {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, [playbackRate, loop, storeSeek]);

  useEffect(() => {
    if (playState === 'playing') {
      lastTimeRef.current = 0;
      startTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playState, animate]);

  return {
    isPlaying: playState === 'playing',
  };
}
