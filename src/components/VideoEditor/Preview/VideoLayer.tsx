import React, { useRef, useEffect, useState } from 'react';
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

const PRELOAD_THRESHOLD = 2000;

export const VideoLayer: React.FC<VideoLayerProps> = (props) => {
  const isActive = props.visible && props.currentTime >= props.startTime && props.currentTime < props.startTime + props.duration;
  const isUpcoming = props.visible && 
    props.currentTime >= props.startTime - PRELOAD_THRESHOLD && 
    props.currentTime < props.startTime;
  const shouldBeLoaded = isActive || isUpcoming;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const playState = useEditorStore(s => s.playState);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    
    if (playState === 'playing' && isActive) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [playState, isActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldBeLoaded) return;
    
    const targetTime = (props.currentTime - props.startTime + props.inPoint) / 1000;
    if (Math.abs(video.currentTime - targetTime) > 0.1) {
      video.currentTime = targetTime;
    }
  }, [props.currentTime, shouldBeLoaded, props.startTime, props.inPoint]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => setVideoReady(true);
    video.addEventListener('canplay', handleCanPlay);
    
    if (video.readyState >= 3) {
      setVideoReady(true);
    }

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  if (!props.visible) {
    return null;
  }

  return (
    <video
      ref={videoRef}
      src={props.src}
      className="absolute inset-0 w-full h-full object-contain"
      style={{ 
        opacity: props.opacity,
        display: isActive ? 'block' : 'none',
      }}
      muted={props.volume === 0}
      volume={props.volume}
      playsInline
      preload={shouldBeLoaded ? 'auto' : 'metadata'}
    />
  );
};
