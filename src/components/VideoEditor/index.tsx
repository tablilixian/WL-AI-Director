import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Scissors,
  Download, Undo2, Redo2, Repeat, RotateCcw, FileJson, Sparkles
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useHistoryStore } from '../../stores/historyStore';
import { Timeline } from './Timeline/Timeline';
import { PreviewCanvas } from './Preview/PreviewCanvas';
import { ImportMedia } from './ImportMedia';
import { usePlayback } from '../../hooks/usePlayback';
import { useTimelineSplit } from '../../hooks/useTimelineSplit';
import { useHistoryCommands } from '../../hooks/useHistoryCommands';
import { formatTime } from '../../utils/timeFormat';
import { ProjectState } from '../../../types';
import { unifiedImageService } from '../../../services/unifiedImageService';
import { ExportDialog } from './ExportDialog';
import { GenerateSubtitleDialog } from './GenerateSubtitleDialog';
import { TextEditor } from './Preview/TextEditor';

interface VideoEditorProps {
  project?: ProjectState;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({
  project,
}) => {
  usePlayback();

  const {
    playState,
    currentTime,
    duration,
    loop,
    playbackRate,
    play,
    pause,
    seek,
    setPlaybackRate,
    toggleLoop,
    activeTool,
    setActiveTool,
    addTrack,
    addClip,
    tracks,
    load,
    save,
    reset,
  } = useEditorStore();

  const { undo, redo, canUndo, canRedo } = useHistoryCommands();
  const importedRef = useRef<string>('');
  const initializingRef = useRef(false);
  const [initVersion, setInitVersion] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [showSubtitleGen, setShowSubtitleGen] = useState(false);
  const audioUnlockedRef = useRef(false);
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = previewWrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width: cw, height: ch } = entry.contentRect;
      const p = 4; // p-4 = 16px padding each side
      const availW = Math.max(0, cw - p * 2);
      const availH = Math.max(0, ch - p * 2);
      const ratio = 16 / 9;
      let w: number, h: number;
      if (availW / availH > ratio) {
        h = availH;
        w = h * ratio;
      } else {
        w = availW;
        h = w / ratio;
      }
      setPreviewSize({ width: Math.floor(w), height: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctx.resume().then(() => {
      audioUnlockedRef.current = true;
      console.log('[Audio] 已解锁');
    }).catch(() => {});
  }, []);

  // ── Sync editorStore → timelineStore + playbackStore ──
  // (import, init, load, usePlayback animation all write to editorStore)
  const editorTrackHashRef = useRef('');
  const editorTracks = useEditorStore(s => s.tracks);
  useEffect(() => {
    const hash = JSON.stringify(editorTracks);
    if (hash === editorTrackHashRef.current) return;
    editorTrackHashRef.current = hash;
    useTimelineStore.setState({ tracks: JSON.parse(JSON.stringify(editorTracks)) });
  }, [editorTracks]);

  const editorPlaybackRef = useRef({ currentTime: 0, duration: 0, playState: '', loop: false, playbackRate: 1 });
  const edCurrentTime = useEditorStore(s => s.currentTime);
  const edDuration = useEditorStore(s => s.duration);
  const edPlayState = useEditorStore(s => s.playState);
  const edLoop = useEditorStore(s => s.loop);
  const edRate = useEditorStore(s => s.playbackRate);
  useEffect(() => {
    const ref = editorPlaybackRef.current;
    const changed =
      edCurrentTime !== ref.currentTime ||
      edDuration !== ref.duration ||
      edPlayState !== ref.playState ||
      edLoop !== ref.loop ||
      edRate !== ref.playbackRate;
    if (!changed) return;
    Object.assign(ref, { currentTime: edCurrentTime, duration: edDuration, playState: edPlayState, loop: edLoop, playbackRate: edRate });
    usePlaybackStore.setState({
      currentTime: edCurrentTime,
      duration: edDuration,
      playState: edPlayState as any,
      loop: edLoop,
      playbackRate: edRate,
    });
  }, [edCurrentTime, edDuration, edPlayState, edLoop, edRate]);

  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    const init = async () => {
      const hasSaved = await load();
      console.log('[VideoEditor] 加载状态:', hasSaved ? '已恢复' : '无保存状态');

      // Always ensure 3 default track types exist (video/audio/text)
      const tracksAfterLoad = useEditorStore.getState().tracks;
      if (!tracksAfterLoad.some(t => t.type === 'video')) {
        addTrack('video', '视频 1');
      }
      if (!tracksAfterLoad.some(t => t.type === 'audio')) {
        addTrack('audio', '音频 1');
      }
      if (!tracksAfterLoad.some(t => t.type === 'text')) {
        addTrack('text', '字幕 1');
      }
    };

    init();
  }, [load, addTrack, initVersion]);

  useEffect(() => {
    const hasClips = tracks.some(t => t.clips.length > 0);
    if (!hasClips) return;

    const clipCount = tracks.reduce((sum, t) => sum + t.clips.length, 0);
    console.log('[VideoEditor] tracks 变化，执行保存，片段数:', clipCount);
    save();
  }, [tracks, save]);

  useEffect(() => {
    return () => {
      const clipCount = tracks.reduce((sum, t) => sum + t.clips.length, 0);
      console.log('[VideoEditor] 组件卸载，同步保存，片段数:', clipCount);
      save();
    };
  }, [save, tracks]);

  useEffect(() => {
    console.log('[VideoEditor] 组件挂载，当前片段数:', tracks.reduce((sum, t) => sum + t.clips.length, 0));
    return () => {
      console.log('[VideoEditor] 组件卸载，当前片段数:', tracks.reduce((sum, t) => sum + t.clips.length, 0));
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (playState !== 'playing') unlockAudio();
        playState === 'playing' ? pause() : play();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playState, pause, play, undo, redo]);

  const { splitAtPlayhead } = useTimelineSplit();

  const handleToolChange = useCallback((tool: 'select' | 'trim' | 'split') => {
    setActiveTool(tool);
    if (tool === 'split') {
      splitAtPlayhead();
    }
  }, [setActiveTool, splitAtPlayhead]);

  const handleExportJSON = useCallback(() => {
    const state = useEditorStore.getState();
    const exportData = {
      projectId: state.projectId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      duration: state.duration,
      zoom: state.zoom,
      tracks: state.tracks.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        locked: t.locked,
        visible: t.visible,
        clips: t.clips.map(c => ({
          id: c.id,
          name: c.name,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          sourceUrl: c.sourceUrl ? '(blob URL)' : null,
          startTime: c.startTime,
          duration: c.duration,
          inPoint: c.inPoint,
          outPoint: c.outPoint,
          volume: c.volume,
          speed: c.speed,
          opacity: c.opacity,
        })),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-editor-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log('[VideoEditor] 导出 JSON:', exportData);
  }, []);

  const editingClipId = useTimelineStore(s => s.editingClipId);
  const setEditingClipId = useTimelineStore(s => s.setEditingClipId);
  const editingClip = tracks.flatMap(t => t.clips).find(c => c.id === editingClipId);

  const handleOpenExport = useCallback(() => {
    setShowExport(true);
  }, []);

  const handleReset = useCallback(async () => {
    if (window.confirm('确定要重置编辑器吗？这将清除所有编辑状态并重新导入项目视频。')) {
      await reset();
      useTimelineStore.setState({ tracks: [], selectedClipIds: [], zoom: 50, scrollPosition: 0, activeTrackId: null, epoch: 0, _batchDepth: 0, _pendingEpochIncrement: false });
      usePlaybackStore.setState({ currentTime: 0, duration: 0, playState: 'stopped', loop: false, playbackRate: 1 });
      useHistoryStore.getState().reset();
      importedRef.current = '';
      initializingRef.current = false;
      editorTrackHashRef.current = '';
      Object.assign(editorPlaybackRef.current, { currentTime: 0, duration: 0, playState: '', loop: false, playbackRate: 1 });
      setInitVersion(v => v + 1);
      console.log('[VideoEditor] 已重置编辑器');
    }
  }, [reset]);

  const rates = [0.5, 1, 1.5, 2];

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)]">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-base)] border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => seek(0)}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
            title="回到开头"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (playState !== 'playing') unlockAudio();
              playState === 'playing' ? pause() : play();
            }}
            className="p-2 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            title={playState === 'playing' ? '暂停' : '播放'}
          >
            {playState === 'playing' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => seek(duration)}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
            title="跳到结尾"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="ml-4 font-mono text-sm text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)]">{formatTime(currentTime)}</span>
            <span className="mx-1 text-[var(--text-muted)]">/</span>
            <span>{formatTime(duration)}</span>
          </div>

          <button
            onClick={toggleLoop}
            className={`p-1.5 rounded transition-colors ${
              loop
                ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
            title="循环播放"
          >
            <Repeat className="w-4 h-4" />
          </button>

          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none"
          >
            {rates.map(rate => (
              <option key={rate} value={rate}>{rate}x</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-[var(--bg-secondary)] rounded-lg p-1">
          <button
            onClick={() => handleToolChange('select')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTool === 'select'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            选择
          </button>

          <button
            onClick={() => handleToolChange('trim')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTool === 'trim'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Scissors className="w-3 h-3 inline mr-1" />
            裁剪
          </button>

          <button
            onClick={() => handleToolChange('split')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTool === 'split'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            <Scissors className="w-3 h-3 inline mr-1" />
            分割
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition-colors ${
              canUndo
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                : 'text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition-colors ${
              canRedo
                ? 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                : 'text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSubtitleGen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
            title="AI 生成字幕"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI 字幕
          </button>

          <div className="w-px h-5 bg-[var(--border-subtle)] mx-1" />

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            title="重置编辑器"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置
          </button>

          <ImportMedia project={project} />

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] transition-colors"
            title="导出 JSON 工程文件"
          >
            <FileJson className="w-3.5 h-3.5" />
            导出 JSON
          </button>

          <button
            onClick={handleOpenExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            title="导出视频文件"
          >
            <Download className="w-3.5 h-3.5" />
            导出视频
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0">
          <div ref={previewWrapperRef} className="flex-1 flex items-center justify-center p-4 bg-black overflow-hidden min-h-0">
            {previewSize.width > 0 && (
              <PreviewCanvas width={previewSize.width} height={previewSize.height} />
            )}
          </div>
        </div>

        {editingClip && editingClip.type === 'text' && (
          <div className="w-80 overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-base)]">
            <TextEditor
              clip={editingClip as any}
              onUpdate={(updates) => {
                useTimelineStore.getState().updateClip(editingClip.id, updates);
              }}
              onClose={() => setEditingClipId(null)}
            />
          </div>
        )}
      </div>

      <div className="h-80 border-t border-[var(--border-primary)]">
        <Timeline />
      </div>

      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
      />

      <GenerateSubtitleDialog
        isOpen={showSubtitleGen}
        onClose={() => setShowSubtitleGen(false)}
        shots={project?.shots}
      />
    </div>
  );
};

export default VideoEditor;
