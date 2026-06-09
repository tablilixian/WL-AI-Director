import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Scissors,
  Download, Undo2, Redo2, Repeat, RotateCcw, FileJson
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
import { isAudioClip } from '../../types/editor';

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
  const [isExporting, setIsExporting] = useState(false);
  const exportingRef = useRef(false);

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

  const handleExportVideo = useCallback(async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setIsExporting(true);

    const state = useEditorStore.getState();
    const videoTracks = state.tracks.filter(t => t.type === 'video' && t.visible);
    const audioTracks = state.tracks.filter(t => t.type === 'audio' && t.visible);

    if (videoTracks.length === 0 && audioTracks.length === 0) {
      exportingRef.current = false;
      setIsExporting(false);
      alert('没有可导出的内容');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.cssText = 'position:fixed;top:-99999px;left:-99999px;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      exportingRef.current = false;
      setIsExporting(false);
      document.body.removeChild(canvas);
      return;
    }

    const stream = canvas.captureStream(30);
    console.log('[ExportVideo] canvas stream 已创建');

    let audioContext: AudioContext | null = null;
    const audioBuffers: { source: AudioBufferSourceNode; gain: GainNode }[] = [];

    if (audioTracks.length > 0 && audioTracks.some(t => t.clips.length > 0)) {
      audioContext = new AudioContext();
      console.log('[ExportVideo] AudioContext state:', audioContext.state);
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('[ExportVideo] AudioContext resumed');
      }
      const destination = audioContext.createMediaStreamDestination();
      destination.stream.getAudioTracks().forEach(track => {
        stream.addTrack(track);
      });
      console.log('[ExportVideo] 音频轨道已添加到 stream');

      for (const track of audioTracks) {
        for (const clip of track.clips) {
          if (clip.sourceUrl) {
            console.log(`[ExportVideo] 正在加载音频: ${clip.sourceUrl?.slice(0, 60)}...`);
            try {
              const response = await fetch(clip.sourceUrl);
              console.log(`[ExportVideo]   fetch 成功, status=${response.status}`);
              const arrayBuffer = await response.arrayBuffer();
              const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
              console.log(`[ExportVideo]   解码成功, duration=${audioBuffer.duration}s, channels=${audioBuffer.numberOfChannels}`);

              const source = audioContext.createBufferSource();
              source.buffer = audioBuffer;

              const gainNode = audioContext.createGain();
              gainNode.gain.value = clip.volume ?? 1;

              if (isAudioClip(clip) && clip.fadeIn && clip.fadeIn > 0) {
                const fadeInStart = clip.startTime / 1000;
                const fadeInEnd = fadeInStart + clip.fadeIn / 1000;
                gainNode.gain.setValueAtTime(0, audioContext.currentTime + fadeInStart);
                gainNode.gain.linearRampToValueAtTime(clip.volume ?? 1, audioContext.currentTime + fadeInEnd);
              }

              if (isAudioClip(clip) && clip.fadeOut && clip.fadeOut > 0) {
                const fadeOutStart = (clip.startTime + clip.duration - clip.fadeOut) / 1000;
                const fadeOutEnd = (clip.startTime + clip.duration) / 1000;
                gainNode.gain.setValueAtTime(clip.volume ?? 1, audioContext.currentTime + fadeOutStart);
                gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + fadeOutEnd);
              }

              source.connect(gainNode);
              gainNode.connect(destination);

              const offset = clip.inPoint / 1000;
              const duration = clip.duration / 1000;
              const when = audioContext.currentTime + clip.startTime / 1000;

              source.start(when, offset, duration);
              audioBuffers.push({ source, gain: gainNode });
            } catch (error) {
              console.error(`[ExportVideo] 音频加载失败:`, error);
            }
          }
        }
      }
    } else {
      console.log('[ExportVideo] 无音频轨道，跳过音频处理');
    }

    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      mimeType = 'video/webm;codecs=vp8';
    }
    console.log('[ExportVideo] 使用 MIME type:', mimeType);
    console.log('[ExportVideo] stream 轨道数:', stream.getVideoTracks().length, stream.getAudioTracks().length);
    console.log('[ExportVideo] stream video track label:', stream.getVideoTracks()[0]?.label);
    console.log('[ExportVideo] stream video track state:', stream.getVideoTracks()[0]?.readyState);
    console.log('[ExportVideo] stream video track enabled:', stream.getVideoTracks()[0]?.enabled);

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    recorder.onerror = (e) => {
      console.error('[ExportVideo] MediaRecorder 错误:', e);
    };
    console.log('[ExportVideo] recorder state:', recorder.state);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      console.log(`[ExportVideo] ondataavailable: chunk size=${e.data.size}`);
      if (e.data.size > 0) chunks.push(e.data);
    };

    const cleanup = () => {
      audioBuffers.forEach(({ source }) => {
        try {
          source.stop();
        } catch (e) {}
      });
      if (audioContext) audioContext.close();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      exportingRef.current = false;
      setIsExporting(false);
    };

    recorder.onstop = () => {
      const totalBytes = chunks.reduce((s, c) => s + c.size, 0);
      console.log(`[ExportVideo] recorder.onstop: chunks=${chunks.length}, totalBytes=${totalBytes}`);
      const blob = new Blob(chunks, { type: mimeType });
      console.log(`[ExportVideo] 最终 blob size: ${blob.size} bytes`);
      if (blob.size > 1000) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported-video-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        console.warn('[ExportVideo] 导出文件太小，可能有误');
      }
      cleanup();
    };

    recorder.start(1000);
    console.log('[ExportVideo] recorder.start(1000) 已调用');

    // Calculate total duration from clips rather than rely on state.duration
    // which may be stale after timelineStore bidrectional sync.
    let totalDuration = 0;
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd > totalDuration) totalDuration = clipEnd;
      }
    }
    if (totalDuration === 0) {
      recorder.stop();
      cleanup();
      exportingRef.current = false;
      setIsExporting(false);
      alert('没有可导出的内容（片段时长为 0）');
      return;
    }
    const startTime = performance.now();

    const videoElements: { el: HTMLVideoElement; clip: any }[] = [];
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (clip.sourceUrl) {
          console.log(`[ExportVideo] 正在加载视频: ${clip.sourceUrl?.slice(0, 60)}...`);
          const video = document.createElement('video');
          video.src = clip.sourceUrl;
          video.muted = true;
          video.preload = 'auto';
          await new Promise<void>((resolve) => {
            video.onloadeddata = () => {
              console.log(`[ExportVideo]   视频加载成功, duration=${video.duration}s, readyState=${video.readyState}`);
              resolve();
            };
            video.onerror = (e) => {
              console.error(`[ExportVideo]   视频加载失败:`, video.error?.message || e);
              resolve();
            };
          });
          videoElements.push({ el: video, clip });
        }
      }
    }
    console.log(`[ExportVideo] 已准备 ${videoElements.length} 个视频元素`);

    let frameCount = 0;
    let activeEl: HTMLVideoElement | null = null;

    const renderFrame = () => {
      const elapsed = performance.now() - startTime;
      const currentTime = elapsed;
      frameCount++;

      if (currentTime >= totalDuration) {
        console.log(`[ExportVideo] 到达结束时间, 已渲染 ${frameCount} 帧, 停止 recorder`);
        recorder.stop();
        return;
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── Draft upcoming clips' video frames ~200ms before transition ──
      for (const { el, clip } of videoElements) {
        if (currentTime >= clip.startTime - 200 && currentTime < clip.startTime) {
          const targetTime = clip.inPoint / 1000;
          if (Math.abs(el.currentTime - targetTime) > 0.5) {
            el.currentTime = targetTime;
          }
        }
      }

      let currentActiveEl: HTMLVideoElement | null = null;
      for (const { el, clip } of videoElements) {
        if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
          currentActiveEl = el;
          const clipTime = (currentTime - clip.startTime + clip.inPoint) / 1000;
          const diff = Math.abs(el.currentTime - clipTime);
          if (diff > 0.1) {
            el.currentTime = clipTime;
            el.play().catch(() => {});
          }
          // Fallback: if readyState < 2, try drawing anyway (Chrome may still have a frame)
          if (el.readyState >= 2) {
            ctx.globalAlpha = clip.opacity ?? 1;
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          } else {
            // Try drawing anyway — some browsers decode synchronously for drawImage
            try {
              ctx.globalAlpha = clip.opacity ?? 1;
              ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
              ctx.globalAlpha = 1;
            } catch (_e) {}
          }
        }
      }

      // Only keep the active video playing; pause all others
      if (currentActiveEl && currentActiveEl !== activeEl) {
        if (activeEl) activeEl.pause();
        activeEl = currentActiveEl;
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

      if (frameCount % 30 === 0) {
        console.log(`[ExportVideo] 渲染中: currentTime=${currentTime.toFixed(0)}ms / ${totalDuration}ms, frame=${frameCount}`);
      }

      requestAnimationFrame(renderFrame);
    };

    console.log('[ExportVideo] 启动渲染循环');
    renderFrame();
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
            disabled={isExporting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity ${
              isExporting
                ? 'bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-not-allowed'
                : 'bg-[var(--accent)] text-white hover:opacity-90'
            }`}
            title={isExporting ? '导出中...' : '导出视频文件'}
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-pulse' : ''}`} />
            {isExporting ? '导出中...' : '导出视频'}
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
