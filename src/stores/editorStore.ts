/**
 * 视频编辑器 Zustand Store
 * 管理编辑器所有的状态和操作
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  Track,
  Clip,
  TrackType,
  PlayState,
  EditorState,
  HistoryEntry,
  DEFAULT_ZOOM,
} from '../types/editor';
import { clampTime } from '../utils/timeFormat';
import { MIN_ZOOM, MAX_ZOOM, TRACK_HEADER_WIDTH } from '../types/editor';
import { indexedDBService } from '../services/indexedDB';

const PERSIST_KEY = 'video-editor-persist';

// ============================================================
// Store 接口
// ============================================================

type EditorTool = 'select' | 'trim' | 'split';

interface EditorStore extends EditorState {
  // ---------- 工具 ----------
  activeTool: EditorTool;
  setActiveTool: (tool: EditorTool) => void;

  // ---------- 历史记录 ----------
  canUndo: boolean;
  canRedo: boolean;

  // ---------- 初始化 ----------
  initialize: (projectId: string, initialClips?: Partial<Clip>[]) => void;

  // ---------- 轨道操作 ----------
  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // ---------- 片段操作 ----------
  addClip: (trackId: string, clip: Clip) => void;
  removeClips: (clipIds: string[]) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  splitClip: (clipId: string, splitTime: number) => void;
  duplicateClip: (clipId: string) => void;

  // ---------- 播放控制 ----------
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  toggleLoop: () => void;
  setDuration: (duration: number) => void;

  // ---------- 选择 ----------
  selectClip: (clipId: string, multi?: boolean) => void;
  deselectAll: () => void;
  selectAll: () => void;

  // ---------- 视图 ----------
  setZoom: (zoom: number) => void;
  setScrollPosition: (position: number) => void;
  scrollToTime: (time: number, viewportWidth?: number) => void;

  // ---------- 历史 ----------
  undo: () => void;
  redo: () => void;
  pushHistory: (description?: string) => void;

  // ---------- 持久化 ----------
  save: () => Promise<void>;
  load: () => Promise<boolean>;
  clear: () => void;

  // ---------- 内部方法 ----------
  calculateDuration: () => number;
  findClip: (clipId: string) => Clip | undefined;
  findTrack: (trackId: string) => Track | undefined;
  findTrackByClip: (clipId: string) => Track | undefined;
}

// ============================================================
// 初始状态
// ============================================================

const initialState = {
  projectId: '' as string,
  createdAt: 0,
  updatedAt: 0,
  tracks: [] as Track[],
  currentTime: 0,
  playState: 'stopped' as PlayState,
  duration: 0,
  loop: false,
  playbackRate: 1,
  selectedClipIds: [] as string[],
  zoom: DEFAULT_ZOOM,
  scrollPosition: 0,
  activeTrackId: null as string | null,
  expandedTrackIds: [] as string[],
  activeTool: 'select' as EditorTool,
  canUndo: false,
  canRedo: false,
};

// ============================================================
// 历史记录管理
// ============================================================

const MAX_HISTORY = 50;
let history: HistoryEntry[] = [];
let historyIndex = -1;

function snapshotTracks(tracks: Track[], description?: string): HistoryEntry {
  return {
    tracks: JSON.parse(JSON.stringify(tracks)),
    timestamp: Date.now(),
    description,
  };
}

// ============================================================
// Store 实现
// ============================================================

export const useEditorStore = create<EditorStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ---------- 初始化 ----------
    initialize: (projectId, initialClips = []) => {
      const tracks: Track[] = [
        {
          id: 'video-1',
          name: '视频轨道 1',
          type: 'video',
          locked: false,
          visible: true,
          clips: [],
        },
        {
          id: 'audio-1',
          name: '音频轨道 1',
          type: 'audio',
          locked: false,
          visible: true,
          clips: [],
        },
        {
          id: 'text-1',
          name: '字幕轨道 1',
          type: 'text',
          locked: false,
          visible: true,
          clips: [],
        },
      ];

      // 添加初始片段到视频轨道
      if (initialClips.length > 0) {
        const videoTrack = tracks.find(t => t.type === 'video');
        if (videoTrack) {
          videoTrack.clips = initialClips.map((c, index) => ({
            id: `clip-${Date.now()}-${index}`,
            trackId: videoTrack.id,
            sourceId: c.sourceId || `source-${index}`,
            sourceType: c.sourceType || 'video',
            sourceUrl: c.sourceUrl || '',
            thumbnailUrl: c.thumbnailUrl,
            startTime: c.startTime ?? index * 5000,
            duration: c.duration ?? 4000,
            inPoint: c.inPoint ?? 0,
            outPoint: c.outPoint ?? (c.duration ?? 4000),
            volume: c.volume ?? 1,
            speed: c.speed ?? 1,
            opacity: c.opacity ?? 1,
          })) as Clip[];
        }
      }

      // 重置历史记录
      history = [snapshotTracks(tracks, '初始化')];
      historyIndex = 0;

      set({
        projectId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tracks,
        currentTime: 0,
        playState: 'stopped',
        duration: get().calculateDuration(),
        selectedClipIds: [],
        activeTrackId: 'video-1',
        canUndo: false,
        canRedo: false,
      });
    },

    // ---------- 轨道操作 ----------
    addTrack: (type, name) => {
      const id = `${type}-${Date.now()}`;
      const trackCount = get().tracks.filter(t => t.type === type).length + 1;
      const defaultName = name || `${type === 'video' ? '视频' : type === 'audio' ? '音频' : '字幕'}轨道 ${trackCount}`;

      set(state => ({
        tracks: [...state.tracks, {
          id,
          name: defaultName,
          type,
          locked: false,
          visible: true,
          clips: [],
        }],
        updatedAt: Date.now(),
      }));

      get().pushHistory(`添加${defaultName}`);
      return id;
    },

    removeTrack: (trackId) => {
      const track = get().findTrack(trackId);
      if (!track) return;

      set(state => ({
        tracks: state.tracks.filter(t => t.id !== trackId),
        selectedClipIds: state.selectedClipIds.filter(id => {
          return !track.clips.some(c => c.id === id);
        }),
        activeTrackId: state.activeTrackId === trackId ? null : state.activeTrackId,
        updatedAt: Date.now(),
      }));

      get().pushHistory(`删除${track.name}`);
    },

    updateTrack: (trackId, updates) => {
      set(state => ({
        tracks: state.tracks.map(t =>
          t.id === trackId ? { ...t, ...updates } : t
        ),
        updatedAt: Date.now(),
      }));
    },

    reorderTracks: (fromIndex, toIndex) => {
      set(state => {
        const newTracks = [...state.tracks];
        const [removed] = newTracks.splice(fromIndex, 1);
        newTracks.splice(toIndex, 0, removed);
        return { tracks: newTracks, updatedAt: Date.now() };
      });
      get().pushHistory('重排轨道');
    },

    // ---------- 片段操作 ----------
    addClip: (trackId, clip) => {
      set(state => {
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
        console.log('[EditorStore] addClip 计算', { newDuration: maxEnd, clipCount: newTracks.flatMap(t => t.clips).length });
        return {
          tracks: newTracks,
          duration: maxEnd,
          updatedAt: Date.now(),
        };
      });
      console.log('[EditorStore] addClip 完成', { track: get().tracks.find(t => t.id === trackId)?.clips.length, duration: get().duration });
      get().pushHistory('添加片段');
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
      set(state => ({
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.filter(c => !clipIds.includes(c.id)),
        })),
        selectedClipIds: state.selectedClipIds.filter(id => !clipIds.includes(id)),
        duration: get().calculateDuration(),
        updatedAt: Date.now(),
      }));
      get().pushHistory('删除片段');
    },

    updateClip: (clipId, updates) => {
      set(state => ({
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c =>
            c.id === clipId ? { ...c, ...updates } : c
          ),
        })),
        duration: get().calculateDuration(),
        updatedAt: Date.now(),
      }));
    },

    moveClip: (clipId, newTrackId, startTime) => {
      const clip = get().findClip(clipId);
      if (!clip) return;

      const oldTrack = get().findTrackByClip(clipId);
      if (!oldTrack) return;

      const clampedStartTime = clampTime(startTime, 0);

      set(state => {
        const newTracks = state.tracks.map(t => {
          if (t.id === oldTrack.id && t.id === newTrackId) {
            return {
              ...t,
              clips: t.clips.map(c =>
                c.id === clipId ? { ...c, trackId: newTrackId, startTime: clampedStartTime } : c
              ),
            };
          }
          if (t.id === oldTrack.id) {
            return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
          }
          if (t.id === newTrackId) {
            const updatedClip = { ...clip, trackId: newTrackId, startTime: clampedStartTime };
            return { ...t, clips: [...t.clips, updatedClip] };
          }
          return t;
        });

        return { tracks: newTracks, updatedAt: Date.now() };
      });

      get().pushHistory('移动片段');
    },

    splitClip: (clipId, splitTime) => {
      const clip = get().findClip(clipId);
      if (!clip) return;

      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      // 检查分割点是否有效
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

      set(state => ({
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.flatMap(c =>
            c.id === clipId ? [firstPart, secondPart] : [c]
          ),
        })),
        updatedAt: Date.now(),
      }));

      get().pushHistory('分割片段');
    },

    duplicateClip: (clipId) => {
      const clip = get().findClip(clipId);
      if (!clip) return;

      const newClip: Clip = {
        ...clip,
        id: `${clipId}-dup-${Date.now()}`,
        startTime: clip.startTime + clip.duration,
      };

      set(state => ({
        tracks: state.tracks.map(t =>
          t.id === clip.trackId
            ? { ...t, clips: [...t.clips, newClip] }
            : t
        ),
        duration: get().calculateDuration(),
        updatedAt: Date.now(),
      }));

      get().pushHistory('复制片段');
    },

    // ---------- 播放控制 ----------
    play: () => set({ playState: 'playing' }),
    pause: () => set({ playState: 'paused' }),
    stop: () => set({ playState: 'stopped', currentTime: 0 }),

    seek: (time) => {
      const duration = get().duration;
      set({ currentTime: clampTime(time, 0, duration) });
    },

    setPlaybackRate: (rate) => set({ playbackRate: rate }),
    toggleLoop: () => set(state => ({ loop: !state.loop })),

    setDuration: (duration) => set({ duration }),

    // ---------- 选择 ----------
    selectClip: (clipId, multi = false) => {
      set(state => ({
        selectedClipIds: multi
          ? state.selectedClipIds.includes(clipId)
            ? state.selectedClipIds.filter(id => id !== clipId)
            : [...state.selectedClipIds, clipId]
          : [clipId],
      }));
    },

    deselectAll: () => set({ selectedClipIds: [] }),

    selectAll: () => set(state => ({
      selectedClipIds: state.tracks.flatMap(t => t.clips.map(c => c.id)),
    })),

    // ---------- 视图 ----------
    setActiveTool: (tool) => set({ activeTool: tool }),

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

    // ---------- 历史 ----------
    undo: () => {
      if (historyIndex > 0) {
        historyIndex--;
        const entry = history[historyIndex];
        set({
          tracks: JSON.parse(JSON.stringify(entry.tracks)),
          canUndo: historyIndex > 0,
          canRedo: historyIndex < history.length - 1,
          updatedAt: Date.now(),
        });
      }
    },

    redo: () => {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        const entry = history[historyIndex];
        set({
          tracks: JSON.parse(JSON.stringify(entry.tracks)),
          canUndo: historyIndex > 0,
          canRedo: historyIndex < history.length - 1,
          updatedAt: Date.now(),
        });
      }
    },

    pushHistory: (description) => {
      const tracks = get().tracks;
      const entry = snapshotTracks(tracks, description);

      // 如果当前不在最新位置，删除后面的历史
      if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
      }

      history.push(entry);

      // 限制历史长度
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

    // ---------- 持久化 ----------
    save: async () => {
      const state = get();
      const clipCount = state.tracks.reduce((sum, t) => sum + t.clips.length, 0);
      console.log('[EditorStore] 开始保存，片段数:', clipCount);

      const data = {
        projectId: state.projectId || 'default',
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        tracks: state.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => ({
            ...c,
            sourceUrl: undefined,
          })),
        })),
        zoom: state.zoom,
      };

      try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
        console.log('[EditorStore] 已保存到 localStorage，数据大小:', JSON.stringify(data).length);
      } catch (error) {
        console.error('[EditorStore] 保存失败:', error);
      }
    },

    load: async () => {
      const state = get();
      const hasExistingClips = state.tracks.some(t => t.clips.length > 0);
      console.log('[EditorStore] load() 被调用，当前片段数:', state.tracks.reduce((sum, t) => sum + t.clips.length, 0));
      if (hasExistingClips) {
        console.log('[EditorStore] 已有片段数据，跳过加载');
        return false;
      }

      try {
        const saved = localStorage.getItem(PERSIST_KEY);
        if (!saved) {
          console.log('[EditorStore] localStorage 中没有保存的数据');
          return false;
        }

        const data = JSON.parse(saved);
        console.log('[EditorStore] 找到保存的数据，轨道数:', data.tracks?.length);
        
        for (const track of data.tracks) {
          for (const clip of track.clips) {
            if (clip.sourceId) {
              const file = await indexedDBService.getFile(clip.sourceId);
              if (file) {
                clip.sourceUrl = URL.createObjectURL(file);
                console.log('[EditorStore] 恢复 blob URL:', clip.sourceId);
              } else {
                console.log('[EditorStore] IndexedDB 中未找到文件:', clip.sourceId);
              }
            }
          }
        }

        history = [snapshotTracks(data.tracks, '加载保存')];
        historyIndex = 0;

        const duration = data.tracks.reduce((max: number, t: Track) => {
          for (const c of t.clips) {
            const end = c.startTime + c.duration;
            if (end > max) max = end;
          }
          return max;
        }, 0);

        set({
          projectId: data.projectId || 'default',
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          tracks: data.tracks,
          zoom: data.zoom || DEFAULT_ZOOM,
          playState: 'stopped',
          currentTime: 0,
          duration,
          selectedClipIds: [],
          scrollPosition: 0,
          canUndo: false,
          canRedo: false,
        });

        console.log('[EditorStore] 从 localStorage 加载成功，片段数:', data.tracks.reduce((sum: number, t: Track) => sum + t.clips.length, 0));
        return true;
      } catch (error) {
        console.error('[EditorStore] 加载失败:', error);
      }
      return false;
    },

    clear: () => {
      const { tracks } = get();
      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clip.sourceUrl && clip.sourceUrl.startsWith('blob:')) {
            URL.revokeObjectURL(clip.sourceUrl);
          }
        }
      }
      history = [];
      historyIndex = -1;
      set({ ...initialState });
    },

    // ---------- 内部方法 ----------
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

// ============================================================
// 自动保存订阅（每 30 秒）
// ============================================================

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

useEditorStore.subscribe(
  state => state.updatedAt,
  () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const state = useEditorStore.getState();
      if (state.projectId) {
        state.save();
      }
    }, 30000);
  }
);

// ============================================================
// 导出 store hook
// ============================================================

export const useEditor = useEditorStore;
