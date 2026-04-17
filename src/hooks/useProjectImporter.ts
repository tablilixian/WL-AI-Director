import { useCallback } from 'react';
import { nanoid } from 'nanoid';
import { useEditorStore } from '../stores/editorStore';

interface ImportedShot {
  id: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  subtitle?: string;
}

export function useProjectImporter() {
  const { tracks, addTrack, addClip } = useEditorStore();

  const getOrCreateTrack = useCallback((type: 'video' | 'audio' | 'text', name: string) => {
    let track = tracks.find(t => t.type === type);
    if (!track) {
      const trackId = addTrack(type, name);
      track = useEditorStore.getState().tracks.find(t => t.id === trackId);
    }
    return track;
  }, [tracks, addTrack]);

  const importShot = useCallback((shot: ImportedShot, startTime: number = 0) => {
    if (!shot.videoUrl) return;

    const videoTrack = getOrCreateTrack('video', '视频轨道');
    if (!videoTrack) return;

    const clip: any = {
      id: nanoid(),
      type: 'video',
      sourceType: 'video',
      sourceId: shot.id,
      sourceUrl: shot.videoUrl,
      thumbnailUrl: shot.thumbnailUrl,
      startTime,
      duration: shot.duration || 3000,
      inPoint: 0,
      outPoint: (shot.duration || 3000) * 1000,
      volume: 1,
      speed: 1,
      opacity: 1,
    };

    addClip(videoTrack.id, clip);

    if (shot.subtitle) {
      const textTrack = getOrCreateTrack('text', '字幕轨道');
      if (textTrack) {
        const subtitleClip: any = {
          id: nanoid(),
          type: 'text',
          sourceType: 'text',
          sourceId: `subtitle-${shot.id}`,
          sourceUrl: '',
          startTime,
          duration: shot.duration || 3000,
          inPoint: 0,
          outPoint: (shot.duration || 3000) * 1000,
          volume: 1,
          speed: 1,
          opacity: 1,
          text: shot.subtitle,
          fontFamily: 'Arial, sans-serif',
          fontSize: 24,
          fontWeight: 400,
          color: '#ffffff',
          x: 50,
          y: 80,
          align: 'center',
          animation: 'fade',
        };
        addClip(textTrack.id, subtitleClip);
      }
    }

    return clip;
  }, [getOrCreateTrack, addClip]);

  const importShots = useCallback((shots: ImportedShot[], startTime: number = 0) => {
    let currentTime = startTime;
    shots.forEach(shot => {
      importShot(shot, currentTime);
      currentTime += shot.duration || 3000;
    });
    return currentTime;
  }, [importShot]);

  return { importShot, importShots, getOrCreateTrack };
}
