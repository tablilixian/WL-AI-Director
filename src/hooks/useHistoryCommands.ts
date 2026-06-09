import { useCallback } from 'react';
import { useHistoryStore } from '../stores/historyStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useEditorStore } from '../stores/editorStore';

export function useHistoryCommands() {
  const canUndo = useHistoryStore(s => s.canUndo);
  const canRedo = useHistoryStore(s => s.canRedo);

  const undo = useCallback(() => {
    const tracks = useHistoryStore.getState().undo();
    if (!tracks) return;

    useTimelineStore.setState({ tracks });
    useEditorStore.setState({ tracks, updatedAt: Date.now() });
  }, []);

  const redo = useCallback(() => {
    const tracks = useHistoryStore.getState().redo();
    if (!tracks) return;

    useTimelineStore.setState({ tracks });
    useEditorStore.setState({ tracks, updatedAt: Date.now() });
  }, []);

  return { undo, redo, canUndo, canRedo };
}
