import React from 'react';

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

export const VideoLayer: React.FC<VideoLayerProps> = ({
  src,
  currentTime,
  startTime,
  duration,
  inPoint,
  outPoint,
  opacity,
  volume,
  visible,
}) => {
  if (!visible) return null;

  const isActive = currentTime >= startTime && currentTime < startTime + duration;
  if (!isActive) return null;

  const clipLocalTime = currentTime - startTime + inPoint;
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (videoRef.current && isActive) {
      if (Math.abs(videoRef.current.currentTime - clipLocalTime) > 0.1) {
        videoRef.current.currentTime = clipLocalTime;
      }
    }
  }, [clipLocalTime, isActive]);

  return (
    <video
      ref={videoRef}
      src={src}
      className="absolute inset-0 w-full h-full object-contain"
      style={{ opacity }}
      muted={volume === 0}
      volume={volume}
      playsInline
      preload="auto"
    />
  );
};
