import React, { useRef, useEffect } from 'react';
import { useEditorStore } from '../../../stores/editorStore';

interface VideoLayerProps {
  clipId: string;
  src: string;
  currentTime: number;
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  opacity: number;
  volume: number;
  visible: boolean;
}

export const VideoLayer: React.FC<VideoLayerProps> = (props) => {
  const isActive = props.visible && props.currentTime >= props.startTime && props.currentTime < props.startTime + props.duration;
  const videoRef = useRef<HTMLVideoElement>(null);
  const playState = useEditorStore(s => s.playState);

  useEffect(() => {
    if (!videoRef.current) return;
    playState === 'paused' ? videoRef.current.pause() : videoRef.current.play().catch(() => {});
  }, [playState]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;
    const targetTime = (props.currentTime - props.startTime + props.inPoint) / 1000;
    if (Math.abs(video.currentTime - targetTime) > 0.3) {
      video.currentTime = targetTime;
    }
  }, [props.currentTime, isActive]);

  if (!isActive) {
    return null;
  }

  return (
    <video
      ref={videoRef}
      src={props.src}
      className="absolute inset-0 w-full h-full object-contain"
      style={{ opacity: props.opacity }}
      muted={props.volume === 0}
      volume={props.volume}
      playsInline
      preload="auto"
    />
  );
};
