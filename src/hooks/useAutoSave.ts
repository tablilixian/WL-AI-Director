import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { editorStorage } from '../services/editorStorage';

const AUTO_SAVE_INTERVAL = 30000;

export function useAutoSave(projectId: string) {
  const lastSavedRef = useRef<string>('');

  const { tracks, zoom } = useEditorStore();

  const getStateHash = useCallback(() => {
    return JSON.stringify({ tracks, zoom });
  }, [tracks, zoom]);

  const save = useCallback(async () => {
    const currentHash = getStateHash();
    if (currentHash === lastSavedRef.current) {
      return;
    }

    try {
      await editorStorage.save(projectId, {
        tracks,
        zoom,
      });
      lastSavedRef.current = currentHash;
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }, [projectId, tracks, zoom, getStateHash]);

  useEffect(() => {
    const intervalId = setInterval(save, AUTO_SAVE_INTERVAL);
    return () => clearInterval(intervalId);
  }, [save]);

  useEffect(() => {
    const handleBeforeUnload = () => save();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [save]);

  return { save };
}

export function useLoadProject(projectId: string) {
  const { addTrack, addClip } = useEditorStore();

  const load = useCallback(async () => {
    try {
      const data = await editorStorage.load(projectId);
      if (!data) return false;

      data.tracks?.forEach((track: any) => {
        const trackId = addTrack(track.type, track.name);
        track.clips?.forEach((clip: any) => {
          addClip(trackId, clip);
        });
      });

      return true;
    } catch (error) {
      console.error('Load project failed:', error);
      return false;
    }
  }, [addTrack, addClip]);

  return { load };
}
