import React, { useRef, useEffect } from 'react';
import { AudioClip } from '../../../types/editor';
import { useEditorStore } from '../../../stores/editorStore';

interface AudioLayerProps {
  clip: AudioClip;
  currentTime: number;
  startTime: number;
  duration: number;
  volume: number;
  muted?: boolean;
}

export const AudioLayer: React.FC<AudioLayerProps> = ({
  clip,
  currentTime,
  startTime,
  duration,
  volume,
  muted = false,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const clipEnd = startTime + duration;
  const isActive = currentTime >= startTime && currentTime < clipEnd;
  const playState = useEditorStore(s => s.playState);

  // ── 播放/暂停（playState + isActive 触发，确保用户手势链） ──
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (playState === 'playing' && isActive && !muted) {
      const promise = el.play();
      if (promise) {
        promise.catch(e => console.warn(`[Audio] play() failed:`, e.message));
      }
    } else if (!isActive || muted || playState !== 'playing') {
      el.pause();
    }
  }, [playState, isActive, muted]);

  // ── 时间同步 ──
  // 只在非播放状态（用户手动拖动）或播放中偏差极大时 seek，避免与音频自有时钟冲突
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !isActive || muted) return;
    const localTime = (currentTime - startTime + clip.inPoint) / 1000;
    if (playState !== 'playing') {
      el.currentTime = localTime;
    } else if (Math.abs(el.currentTime - localTime) > 0.5) {
      el.currentTime = localTime;
    }
  }, [currentTime, startTime, clip.inPoint, isActive, muted, playState]);

  // ── 音量 ──
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // ── 静音 ──
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  if (!clip.sourceUrl) {
    console.warn('[Audio] 无 sourceUrl，不渲染');
    return null;
  }

  return (
    <audio
      ref={audioRef}
      src={clip.sourceUrl}
      preload="auto"
      className="hidden"
      loop={false}
    />
  );
};
