import React, { useCallback, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Scissors,
  Download, Undo2, Redo2, Repeat, RotateCcw, FileJson
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { Timeline } from './Timeline/Timeline';
import { PreviewCanvas } from './Preview/PreviewCanvas';
import { ImportMedia } from './ImportMedia';
import { usePlayback } from '../../hooks/usePlayback';
import { formatTime } from '../../utils/timeFormat';
import { ProjectState } from '../../../types';
import { unifiedImageService } from '../../../services/unifiedImageService';

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
    tracks,
    load,
    save,
    reset,
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

      console.log('[VideoEditor] 没有保存的状态，初始化默认轨道');
      addTrack('video', '视频 1');
      addTrack('audio', '音频 1');
      addTrack('text', '字幕 1');
    };

    init();
  }, [load, addTrack]);

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

  const handleExportVideo = useCallback(async () => {
    const state = useEditorStore.getState();
    const videoTracks = state.tracks.filter(t => t.type === 'video' && t.visible);
    const audioTracks = state.tracks.filter(t => t.type === 'audio' && t.visible);

    if (videoTracks.length === 0 && audioTracks.length === 0) {
      alert('没有可导出的内容');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stream = canvas.captureStream(30);

    const audioElements: HTMLAudioElement[] = [];
    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (clip.sourceUrl) {
          const audio = new Audio(clip.sourceUrl);
          audio.volume = clip.volume ?? 1;
          audioElements.push(audio);
          const audioStream = (audio as any).captureStream ? (audio as any).captureStream() : null;
          if (audioStream) {
            audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
          }
        }
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exported-video-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);

      audioElements.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
    };

    recorder.start();

    const totalDuration = state.duration;
    const startTime = performance.now();

    const videoElements: { el: HTMLVideoElement; clip: any }[] = [];
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (clip.sourceUrl) {
          const video = document.createElement('video');
          video.src = clip.sourceUrl;
          video.muted = true;
          video.preload = 'auto';
          await new Promise<void>((resolve) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => resolve();
          });
          videoElements.push({ el: video, clip });
        }
      }
    }

    const renderFrame = () => {
      const elapsed = performance.now() - startTime;
      const currentTime = elapsed;

      if (currentTime >= totalDuration) {
        recorder.stop();
        return;
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const { el, clip } of videoElements) {
        if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
          const clipTime = (currentTime - clip.startTime + clip.inPoint) / 1000;
          if (Math.abs(el.currentTime - clipTime) > 0.1) {
            el.currentTime = clipTime;
          }
          if (el.readyState >= 2) {
            ctx.globalAlpha = clip.opacity ?? 1;
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          }
        }
      }

      for (const track of state.tracks.filter(t => t.type === 'text' && t.visible)) {
        for (const clip of track.clips) {
          if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
            const textClip = clip as any;
            if (textClip.text) {
              ctx.fillStyle = textClip.color || '#ffffff';
              ctx.font = `${textClip.fontWeight || 400} ${textClip.fontSize || 48}px ${textClip.fontFamily || 'sans-serif'}`;
              ctx.textAlign = textClip.align || 'center';
              const x = (textClip.x ?? 50) / 100 * canvas.width;
              const y = (textClip.y ?? 50) / 100 * canvas.height;
              ctx.fillText(textClip.text, x, y);
            }
          }
        }
      }

      requestAnimationFrame(renderFrame);
    };

    videoElements.forEach(({ el }) => el.play());
    audioElements.forEach(audio => audio.play());
    renderFrame();
  }, []);

  const handleReset = useCallback(async () => {
    if (window.confirm('确定要重置编辑器吗？这将清除所有编辑状态并重新导入项目视频。')) {
      await reset();
      importedRef.current = '';
      initializingRef.current = false;
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
            onClick={handleExportVideo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            title="导出视频文件"
          >
            <Download className="w-3.5 h-3.5" />
            导出视频
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
