import React, { useCallback, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Scissors,
  Upload, Download, Undo2, Redo2, Repeat
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { Timeline } from './Timeline/Timeline';
import { PreviewCanvas } from './Preview/PreviewCanvas';
import { ImportMedia } from './ImportMedia';
import { usePlayback } from '../../hooks/usePlayback';
import { formatTime } from '../../utils/timeFormat';
import { ProjectState } from '../../../types';
import { unifiedImageService } from '../../../services/unifiedImageService';
import { indexedDBService } from '../../services/indexedDB';
import { nanoid } from 'nanoid';

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
    undo,
    redo,
    canUndo,
    canRedo,
    activeTool,
    setActiveTool,
    addTrack,
    addClip,
    removeTrack,
    tracks,
    load,
    save,
  } = useEditorStore();
  const importedRef = useRef<string>('');
  const initializingRef = useRef(false);

  useEffect(() => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    const init = async () => {
      const hasSaved = await load();
      if (hasSaved) {
        console.log('[VideoEditor] 恢复上次编辑状态');
        return;
      }

      const projectId = project?.id;
      if (projectId && project?.shots && project.shots.length > 0) {
        console.log('[VideoEditor] 开始从项目导入视频', { shotsCount: project.shots.length });

        let currentTime = 0;
        const trackId = addTrack('video', '视频轨道');

        for (let i = 0; i < project.shots.length; i++) {
          const shot = project.shots[i];

          if (shot.interval?.videoUrl) {
            const resolvedUrl = await unifiedImageService.resolveForDisplay(shot.interval.videoUrl);

            if (resolvedUrl) {
              const rawDuration = shot.interval.duration || 3;
              const clipDuration = rawDuration * 1000;

              let sourceId = `file-${nanoid()}`;
              
              if (resolvedUrl.startsWith('blob:')) {
                try {
                  const response = await fetch(resolvedUrl);
                  const blob = await response.blob();
                  const file = new File([blob], `shot-${i}.mp4`, { type: blob.type });
                  await indexedDBService.saveFile(sourceId, file);
                  console.log('[VideoEditor] 视频已保存到 IndexedDB', { sourceId });
                } catch (err) {
                  console.error('[VideoEditor] 保存视频到 IndexedDB 失败:', err);
                }
              }

              const clip: any = {
                id: `${project.id}-clip-${i}`,
                type: 'video',
                sourceType: 'video',
                sourceId,
                sourceUrl: resolvedUrl,
                startTime: currentTime,
                duration: clipDuration,
                inPoint: 0,
                outPoint: clipDuration * 1000,
                volume: 1,
                speed: 1,
                opacity: 1,
              };

              addClip(trackId, clip);
              currentTime += clipDuration;
            }
          }
        }
        
        if (currentTime === 0) {
          addTrack('video', '视频 1');
          addTrack('audio', '音频 1');
          addTrack('text', '字幕 1');
        }
        
        importedRef.current = projectId;
        console.log('[VideoEditor] 项目导入完成');
        return;
      }

      console.log('[VideoEditor] 没有保存的状态，初始化默认轨道');
      addTrack('video', '视频 1');
      addTrack('audio', '音频 1');
      addTrack('text', '字幕 1');
    };

    init();
  }, [load, addTrack, addClip, project]);

  useEffect(() => {
    const projectId = project?.id;
    if (!projectId || importedRef.current === projectId) return;
    importedRef.current = projectId;

    const hasSavedClips = tracks.some(t => t.clips.length > 0);
    if (hasSavedClips) {
      console.log('[VideoEditor] 已有片段数据，跳过项目导入');
      return;
    }

    console.log('[VideoEditor] 项目 ID 变化，重新导入视频', { projectId });

    const importVideos = async () => {
      tracks.forEach(track => {
        removeTrack(track.id);
      });

      if (project?.shots && project.shots.length > 0) {
        let currentTime = 0;
        const trackId = addTrack('video', '视频轨道');

        for (let i = 0; i < project.shots.length; i++) {
          const shot = project.shots[i];

          if (shot.interval?.videoUrl) {
            const resolvedUrl = await unifiedImageService.resolveForDisplay(shot.interval.videoUrl);

            if (resolvedUrl) {
              const rawDuration = shot.interval.duration || 3;
              const clipDuration = rawDuration * 1000;

              let sourceId = `file-${nanoid()}`;
              
              if (resolvedUrl.startsWith('blob:')) {
                try {
                  const response = await fetch(resolvedUrl);
                  const blob = await response.blob();
                  const file = new File([blob], `shot-${i}.mp4`, { type: blob.type });
                  await indexedDBService.saveFile(sourceId, file);
                  console.log('[VideoEditor] 视频已保存到 IndexedDB', { sourceId });
                } catch (err) {
                  console.error('[VideoEditor] 保存视频到 IndexedDB 失败:', err);
                }
              }

              const clip: any = {
                id: `${project.id}-clip-${i}`,
                type: 'video',
                sourceType: 'video',
                sourceId,
                sourceUrl: resolvedUrl,
                startTime: currentTime,
                duration: clipDuration,
                inPoint: 0,
                outPoint: clipDuration * 1000,
                volume: 1,
                speed: 1,
                opacity: 1,
              };

              addClip(trackId, clip);
              currentTime += clipDuration;
            }
          }
        }
        
        if (currentTime === 0) {
          addTrack('video', '视频 1');
          addTrack('audio', '音频 1');
          addTrack('text', '字幕 1');
        }
      } else {
        addTrack('video', '视频 1');
        addTrack('audio', '音频 1');
        addTrack('text', '字幕 1');
      }
    };

    importVideos();
  }, [project?.id]);

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

  const handleToolChange = useCallback((tool: 'select' | 'trim' | 'split') => {
    setActiveTool(tool);
  }, [setActiveTool]);

  const handleExport = useCallback(() => {
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
    console.log('[VideoEditor] 导出状态:', exportData);
  }, []);

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
            onClick={() => playState === 'playing' ? pause() : play()}
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

          <div className="w-px h-5 bg-[var(--border-subtle)] mx-1" />

          <ImportMedia />

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="p-4 bg-[var(--bg-secondary)]">
            <PreviewCanvas />
          </div>
        </div>
      </div>

      <div className="h-80 border-t border-[var(--border-primary)]">
        <Timeline />
      </div>
    </div>
  );
};

export default VideoEditor;
