import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Track, HistoryEntry } from '../types/editor';

const MAX_HISTORY = 50;

function snapshotTracks(tracks: Track[], description?: string): HistoryEntry {
  return {
    tracks: JSON.parse(JSON.stringify(tracks)),
    timestamp: Date.now(),
    description,
  };
}

interface HistoryStore {
  canUndo: boolean;
  canRedo: boolean;

  undo: () => Track[] | null;
  redo: () => Track[] | null;
  pushHistory: (tracks: Track[], description?: string) => void;
  reset: () => void;
}

function createHistoryStore() {
  let history: HistoryEntry[] = [];
  let historyIndex = -1;

  return create<HistoryStore>()(
    subscribeWithSelector((set) => ({
      canUndo: false,
      canRedo: false,

      undo: () => {
        if (historyIndex > 0) {
          historyIndex--;
          const entry = history[historyIndex];
          set({
            canUndo: historyIndex > 0,
            canRedo: historyIndex < history.length - 1,
          });
          return JSON.parse(JSON.stringify(entry.tracks));
        }
        return null;
      },

      redo: () => {
        if (historyIndex < history.length - 1) {
          historyIndex++;
          const entry = history[historyIndex];
          set({
            canUndo: historyIndex > 0,
            canRedo: historyIndex < history.length - 1,
          });
          return JSON.parse(JSON.stringify(entry.tracks));
        }
        return null;
      },

      pushHistory: (tracks, description) => {
        const entry = snapshotTracks(tracks, description);

        if (historyIndex < history.length - 1) {
          history = history.slice(0, historyIndex + 1);
        }

        history.push(entry);

        if (history.length > MAX_HISTORY) {
          history.shift();
        } else {
          historyIndex++;
        }

        set({
          canUndo: historyIndex > 0,
          canRedo: false,
        });
      },

      reset: () => {
        history = [];
        historyIndex = -1;
        set({ canUndo: false, canRedo: false });
      },
    }))
  );
}

export const useHistoryStore = createHistoryStore();
