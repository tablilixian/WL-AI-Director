import React, { useRef, useEffect, useState } from 'react';
import { AudioClip } from '../../../types/editor';

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
  const [isActive, setIsActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const clipEnd = startTime + duration;

  useEffect(() => {
    const active = currentTime >= startTime && currentTime < clipEnd;
    setIsActive(active);

    if (audioRef.current) {
      if (active && !muted) {
        const localTime = currentTime - startTime + clip.inPoint / 1000;
        if (Math.abs(audioRef.current.currentTime - localTime) > 0.1) {
          audioRef.current.currentTime = localTime;
        }
        if (audioRef.current.paused) {
          audioRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      } else {
        if (!audioRef.current.paused) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
  }, [currentTime, startTime, duration, clip.inPoint, muted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  if (!clip.sourceUrl) return null;

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
