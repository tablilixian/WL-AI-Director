import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  Track,
  Clip,
  TrackType,
  EditorTool,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  TRACK_HEADER_WIDTH,
} from '../types/editor';
import { clampTime } from '../utils/timeFormat';

let idCounter = 0;
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

interface TimelineStore {
  tracks: Track[];
  selectedClipIds: string[];
  zoom: number;
  scrollPosition: number;
  activeTrackId: string | null;
  expandedTrackIds: string[];
  activeTool: EditorTool;
  epoch: number;
  _batchDepth: number;
  _pendingEpochIncrement: boolean;

  editingClipId: string | null;

  setActiveTool: (tool: EditorTool) => void;
  setEditingClipId: (id: string | null) => void;

  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  addClip: (trackId: string, clip: Clip) => void;
  removeClips: (clipIds: string[]) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, newTrackId: string, startTime: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  duplicateClip: (clipId: string) => void;

  selectClip: (clipId: string, multi?: boolean) => void;
  deselectAll: () => void;
  selectAll: () => void;

  setZoom: (zoom: number) => void;
  setScrollPosition: (position: number) => void;
  scrollToTime: (time: number, viewportWidth?: number) => void;

  calculateDuration: () => number;
  findClip: (clipId: string) => Clip | undefined;
  findTrack: (trackId: string) => Track | undefined;
  findTrackByClip: (clipId: string) => Track | undefined;

  withBatch: (fn: () => void) => void;
  incrementEpoch: () => void;
}

export const useTimelineStore = create<TimelineStore>()(
  subscribeWithSelector((set, get) => ({
    tracks: [],
    selectedClipIds: [],
    zoom: DEFAULT_ZOOM,
    scrollPosition: 0,
    activeTrackId: null,
    expandedTrackIds: [],
    activeTool: 'select' as EditorTool,
    epoch: 0,
    _batchDepth: 0,
    _pendingEpochIncrement: false,
    editingClipId: null,

    setActiveTool: (tool) => set({ activeTool: tool }),
    setEditingClipId: (id) => set({ editingClipId: id }),

    withBatch: (fn) => {
      set((state) => ({ _batchDepth: state._batchDepth + 1 }));
      try {
        fn();
      } finally {
        set((state) => {
          const newDepth = Math.max(0, state._batchDepth - 1);
          if (newDepth === 0 && state._pendingEpochIncrement) {
            return { _batchDepth: 0, _pendingEpochIncrement: false, epoch: state.epoch + 1 };
          }
          return { _batchDepth: newDepth };
        });
      }
    },

    incrementEpoch: () => {
      set((state) => {
        if (state._batchDepth > 0) {
          return { _pendingEpochIncrement: true };
        }
        return { epoch: state.epoch + 1 };
      });
    },

    addTrack: (type, name) => {
      const id = uniqueId(type);
      const trackCount = get().tracks.filter(t => t.type === type).length + 1;
      const defaultName = name || `${type === 'video' ? '视频' : type === 'audio' ? '音频' : '字幕'}轨道 ${trackCount}`;

      set((state) => ({
        tracks: [...state.tracks, {
          id,
          name: defaultName,
          type,
          locked: false,
          visible: true,
          clips: [],
        }],
      }));

      get().incrementEpoch();
      return id;
    },

    removeTrack: (trackId) => {
      const track = get().findTrack(trackId);
      if (!track) return;

      set((state) => ({
        tracks: state.tracks.filter(t => t.id !== trackId),
        selectedClipIds: state.selectedClipIds.filter(id => {
          return !track.clips.some(c => c.id === id);
        }),
        activeTrackId: state.activeTrackId === trackId ? null : state.activeTrackId,
      }));

      get().incrementEpoch();
    },

    updateTrack: (trackId, updates) => {
      set((state) => ({
        tracks: state.tracks.map(t =>
          t.id === trackId ? { ...t, ...updates } : t
        ),
      }));

      get().incrementEpoch();
    },

    reorderTracks: (fromIndex, toIndex) => {
      set((state) => {
        const newTracks = [...state.tracks];
        const [removed] = newTracks.splice(fromIndex, 1);
        newTracks.splice(toIndex, 0, removed);
        return { tracks: newTracks };
      });

      get().incrementEpoch();
    },

    addClip: (trackId, clip) => {
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return state;

        let startTime = clip.startTime;
        if (track.clips.length > 0) {
          const lastClip = track.clips[track.clips.length - 1];
          startTime = lastClip.startTime + lastClip.duration;
        }

        const newClip = { ...clip, trackId, startTime };
        const newTracks = state.tracks.map(t =>
          t.id === trackId
            ? { ...t, clips: [...t.clips, newClip] }
            : t
        );

        let maxEnd = 0;
        for (const t of newTracks) {
          for (const c of t.clips) {
            const clipEnd = c.startTime + c.duration;
            if (clipEnd > maxEnd) maxEnd = clipEnd;
          }
        }

        return { tracks: newTracks };
      });

      get().incrementEpoch();
    },

    removeClips: (clipIds) => {
      const { tracks } = get();
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clipIds.includes(clip.id) && clip.sourceUrl && clip.sourceUrl.startsWith('blob:')) {
            URL.revokeObjectURL(clip.sourceUrl);
          }
        }
      }

      set((state) => ({
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.filter(c => !clipIds.includes(c.id)),
        })),
        selectedClipIds: state.selectedClipIds.filter(id => !clipIds.includes(id)),
      }));

      get().incrementEpoch();
    },

    updateClip: (clipId, updates) => {
      set((state) => ({
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c =>
            c.id === clipId ? { ...c, ...updates } : c
          ),
        })),
      }));

      get().incrementEpoch();
    },

    moveClip: (clipId, newTrackId, startTime) => {
      const clampedStartTime = clampTime(startTime, 0);

      set((state) => {
        const oldTrackIndex = state.tracks.findIndex(t =>
          t.clips.some(c => c.id === clipId)
        );
        if (oldTrackIndex === -1) return state;

        const oldTrackId = state.tracks[oldTrackIndex].id;
        const clip = state.tracks[oldTrackIndex].clips.find(c => c.id === clipId);
        if (!clip) return state;

        const newTracks = state.tracks.map((track, i) => {
          if (i === oldTrackIndex && oldTrackId === newTrackId) {
            return {
              ...track,
              clips: track.clips.map(c =>
                c.id === clipId ? { ...c, startTime: clampedStartTime } : c
              ),
            };
          }
          if (i === oldTrackIndex) {
            return { ...track, clips: track.clips.filter(c => c.id !== clipId) };
          }
          if (track.id === newTrackId) {
            return { ...track, clips: [...track.clips, { ...clip, trackId: newTrackId, startTime: clampedStartTime }] };
          }
          return track;
        });

        return { tracks: newTracks };
      });

      get().incrementEpoch();
    },

    splitClip: (clipId, splitTime) => {
      const clip = get().findClip(clipId);
      if (!clip) return;

      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      if (splitTime <= clipStart || splitTime >= clipEnd) return;

      const splitPosition = splitTime - clipStart;

      const firstPart: Clip = {
        ...clip,
        id: `${clipId}-split-1`,
        duration: splitPosition,
        outPoint: clip.inPoint + splitPosition,
      };

      const secondPart: Clip = {
        ...clip,
        id: `${clipId}-split-2`,
        startTime: splitTime,
        duration: clip.duration - splitPosition,
        inPoint: clip.inPoint + splitPosition,
      };

      set((state) => ({
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.flatMap(c =>
            c.id === clipId ? [firstPart, secondPart] : [c]
          ),
        })),
      }));

      get().incrementEpoch();
    },

    duplicateClip: (clipId) => {
      const clip = get().findClip(clipId);
      if (!clip) return;

      const newClip: Clip = {
        ...clip,
        id: `${clipId}-dup-${Date.now()}`,
        startTime: clip.startTime + clip.duration,
      };

      set((state) => ({
        tracks: state.tracks.map(t =>
          t.id === clip.trackId
            ? { ...t, clips: [...t.clips, newClip] }
            : t
        ),
      }));

      get().incrementEpoch();
    },

    selectClip: (clipId, multi = false) => {
      set((state) => ({
        selectedClipIds: multi
          ? state.selectedClipIds.includes(clipId)
            ? state.selectedClipIds.filter(id => id !== clipId)
            : [...state.selectedClipIds, clipId]
          : [clipId],
      }));
    },

    deselectAll: () => set({ selectedClipIds: [] }),

    selectAll: () => set((state) => ({
      selectedClipIds: state.tracks.flatMap(t => t.clips.map(c => c.id)),
    })),

    setZoom: (zoom) => {
      const clampedZoom = clampTime(zoom, MIN_ZOOM, MAX_ZOOM);
      set({ zoom: clampedZoom });
    },

    setScrollPosition: (position) => {
      set({ scrollPosition: Math.max(0, position) });
    },

    scrollToTime: (time, viewportWidth = 800) => {
      const { zoom } = get();
      const centerOffset = (viewportWidth - TRACK_HEADER_WIDTH) / 2;
      const newPosition = (time / 1000) * zoom - centerOffset;
      set({ scrollPosition: Math.max(0, newPosition) });
    },

    calculateDuration: () => {
      const { tracks } = get();
      let maxEnd = 0;
      for (const track of tracks) {
        for (const clip of track.clips) {
          const clipEnd = clip.startTime + clip.duration;
          if (clipEnd > maxEnd) {
            maxEnd = clipEnd;
          }
        }
      }
      return maxEnd;
    },

    findClip: (clipId) => {
      for (const track of get().tracks) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) return clip;
      }
      return undefined;
    },

    findTrack: (trackId) => {
      return get().tracks.find(t => t.id === trackId);
    },

    findTrackByClip: (clipId) => {
      return get().tracks.find(t => t.clips.some(c => c.id === clipId));
    },
  }))
);
