import React, { useMemo } from 'react';
import { TextClip as TextClipType } from '../../../types/editor';

interface TextLayerProps {
  clip: TextClipType;
  currentTime: number;
  startTime: number;
  duration: number;
}

export const TextLayer: React.FC<TextLayerProps> = ({
  clip,
  currentTime,
  startTime,
  duration,
}) => {
  const isActive = currentTime >= startTime && currentTime < startTime + duration;

  const style = useMemo(() => ({
    position: 'absolute' as const,
    left: `${clip.x}%`,
    top: `${clip.y}%`,
    transform: 'translate(-50%, -50%)',
    fontFamily: clip.fontFamily,
    fontSize: `${clip.fontSize}px`,
    fontWeight: clip.fontWeight,
    color: clip.color,
    backgroundColor: clip.backgroundColor || 'transparent',
    textAlign: clip.align,
    padding: clip.backgroundColor ? '4px 8px' : 0,
    borderRadius: clip.backgroundColor ? '4px' : 0,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxWidth: '80%',
  }), [clip]);

  const animationStyle = useMemo(() => {
    if (!isActive || clip.animation === 'none') return {};

    const clipProgress = (currentTime - startTime) / (duration * 0.3);

    switch (clip.animation) {
      case 'fade':
        return {
          opacity: Math.min(1, clipProgress * 2),
        };
      case 'slide':
        return {
          opacity: Math.min(1, clipProgress * 2),
          transform: `translate(-50%, calc(-50% + ${(1 - clipProgress) * 20}px))`,
        };
      case 'pop':
        const scale = Math.min(1, clipProgress * 3) * (clipProgress < 0.5 ? clipProgress * 2 : 1);
        return {
          opacity: Math.min(1, clipProgress * 2),
          transform: `translate(-50%, -50%) scale(${0.5 + scale * 0.5})`,
        };
      default:
        return {};
    }
  }, [isActive, clip.animation, currentTime, startTime, duration]);

  if (!isActive) return null;

  return (
    <div style={{ ...style, ...animationStyle }}>
      {clip.text}
    </div>
  );
};
