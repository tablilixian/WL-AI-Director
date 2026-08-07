import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Loader2, Check, AlertCircle } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { isAudioClip } from '../../types/editor';
import { fetchFile } from '@ffmpeg/util';
import { FFmpegWorker } from '../../lib/ffmpegWorker';
import { logger, LogCategory } from '../../../services/logger.ts';

const FFMPEG_LOAD_TIMEOUT = 60_000;

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = 'rendering' | 'transcoding' | 'done' | 'error';

const FFMPEG_LOCAL = '/ffmpeg';

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose }) => {
  const [stage, setStage] = useState<Stage>('rendering');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [outputSize, setOutputSize] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const cancelRef = useRef(false);
  useRef<number>(0);
  const [fileName] = useState(`exported-video-${Date.now()}.mp4`);

  const startExport = useCallback(async () => {
    const state = useEditorStore.getState();
    const videoTracks = state.tracks.filter((t) => t.type === 'video' && t.visible);
    const audioTracks = state.tracks.filter((t) => t.type === 'audio' && t.visible);

    // Calculate total duration
    let dur = 0;
    for (const t of state.tracks) {
      for (const c of t.clips) {
        const end = c.startTime + c.duration;
        if (end > dur) dur = end;
      }
    }
    if (dur === 0) {
      setStage('error');
      setErrorMsg('没有可导出的内容');
      return;
    }
    setTotalDuration(dur);

    // Canvas + stream setup
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    canvas.style.cssText = 'position:fixed;top:-99999px;left:-99999px;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      document.body.removeChild(canvas);
      setStage('error');
      setErrorMsg('无法创建画布');
      return;
    }
    const stream = canvas.captureStream(30);

    // Audio setup (only if there are audio clips)
    let audioContext: AudioContext | null = null;
    const audioBuffers: { source: AudioBufferSourceNode; gain: GainNode }[] = [];

    if (audioTracks.some((t) => t.clips.length > 0)) {
      audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      const destination = audioContext.createMediaStreamDestination();
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

      for (const track of audioTracks) {
        for (const clip of track.clips) {
          if (!clip.sourceUrl) continue;
          try {
            const resp = await fetch(clip.sourceUrl);
            const buf = await resp.arrayBuffer();
            const audioBuf = await audioContext.decodeAudioData(buf);

            const source = audioContext.createBufferSource();
            source.buffer = audioBuf;
            const gainNode = audioContext.createGain();
            gainNode.gain.value = clip.volume ?? 1;

            if (isAudioClip(clip) && clip.fadeIn && clip.fadeIn > 0) {
              const fadeInStart = clip.startTime / 1000;
              const fadeInEnd = fadeInStart + clip.fadeIn / 1000;
              gainNode.gain.setValueAtTime(0, audioContext.currentTime + fadeInStart);
              gainNode.gain.linearRampToValueAtTime(
                clip.volume ?? 1,
                audioContext.currentTime + fadeInEnd,
              );
            }
            if (isAudioClip(clip) && clip.fadeOut && clip.fadeOut > 0) {
              const fadeOutStart = (clip.startTime + clip.duration - clip.fadeOut) / 1000;
              const fadeOutEnd = (clip.startTime + clip.duration) / 1000;
              gainNode.gain.setValueAtTime(
                clip.volume ?? 1,
                audioContext.currentTime + fadeOutStart,
              );
              gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + fadeOutEnd);
            }

            source.connect(gainNode);
            gainNode.connect(destination);
            const offset = clip.inPoint / 1000;
            const clipDur = clip.duration / 1000;
            const when = audioContext.currentTime + clip.startTime / 1000;
            source.start(when, offset, clipDur);
            audioBuffers.push({ source, gain: gainNode });
          } catch (e) {
            logger.warn(LogCategory.VIDEO, '[Export] Audio load failed:', e);
          }
        }
      }
    }

    // MIME type
    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      mimeType = 'video/webm;codecs=vp8';
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Pre-load video elements
    const videoElements: { el: HTMLVideoElement; clip: any }[] = [];
    for (const track of videoTracks) {
      for (const clip of track.clips) {
        if (!clip.sourceUrl) continue;
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

    if (cancelRef.current) return;

    // Start recording
    recorder.start(1000);
    const startWall = performance.now();

    // Elapsed time timer
    const elapsedTimer = setInterval(() => {
      setElapsed(performance.now() - startWall);
    }, 200);

    // Cleanup helper
    const cleanup = () => {
      clearInterval(elapsedTimer);
      audioBuffers.forEach(({ source }) => {
        try {
          source.stop();
        } catch {
          /* empty */
        }
      });
      if (audioContext) audioContext.close();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };

    let activeEl: HTMLVideoElement | null = null;

    const renderFrame = () => {
      if (cancelRef.current) {
        recorder.stop();
        cleanup();
        return;
      }

      const currentTime = performance.now() - startWall;

      if (currentTime >= dur) {
        recorder.stop();
        // Wait for onstop to fire
        return;
      }

      // Progress
      setProgress(Math.min(60, (currentTime / dur) * 60));

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pre-seek upcoming clips
      for (const { el, clip } of videoElements) {
        if (currentTime >= clip.startTime - 200 && currentTime < clip.startTime) {
          const t = clip.inPoint / 1000;
          if (Math.abs(el.currentTime - t) > 0.5) el.currentTime = t;
        }
      }

      // Draw active clip
      let curActiveEl: HTMLVideoElement | null = null;
      for (const { el, clip } of videoElements) {
        if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
          curActiveEl = el;
          const clipTime = (currentTime - clip.startTime + clip.inPoint) / 1000;
          if (Math.abs(el.currentTime - clipTime) > 0.1) {
            el.currentTime = clipTime;
            el.play().catch(() => {});
          }
          if (el.readyState >= 2) {
            ctx.globalAlpha = clip.opacity ?? 1;
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          } else {
            try {
              ctx.globalAlpha = clip.opacity ?? 1;
              ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
              ctx.globalAlpha = 1;
            } catch {
              /* empty */
            }
          }
        }
      }
      if (curActiveEl && curActiveEl !== activeEl) {
        if (activeEl) activeEl.pause();
        activeEl = curActiveEl;
      }

      // Draw text clips
      for (const track of state.tracks.filter((t) => t.type === 'text' && t.visible)) {
        for (const clip of track.clips) {
          if (currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration) {
            const tc = clip as any;
            if (tc.text) {
              ctx.fillStyle = tc.color || '#ffffff';
              ctx.font = `${tc.fontWeight || 400} ${tc.fontSize || 48}px ${tc.fontFamily || 'sans-serif'}`;
              ctx.textAlign = tc.align || 'center';
              ctx.fillText(
                tc.text,
                ((tc.x ?? 50) / 100) * canvas.width,
                ((tc.y ?? 50) / 100) * canvas.height,
              );
            }
          }
        }
      }

      requestAnimationFrame(renderFrame);
    };

    // recorder.onstop handles completion
    recorder.onstop = () => {
      cleanup();

      if (cancelRef.current) return;

      const webmBlob = new Blob(chunks, { type: mimeType });
      logger.info(LogCategory.VIDEO, '[Export] WebM 生成完成, 大小:', [webmBlob.size, 'bytes']);
      setStage('transcoding');
      setProgress(65);

      // Transcode to MP4 via ffmpeg.wasm
      logger.info(LogCategory.VIDEO, '[Export] 开始调用 transcodeToMp4');
      transcodeToMp4(webmBlob, dur, (p) => {
        logger.info(
          LogCategory.VIDEO,
          '[Export] transcodeToMp4 进度回调:',
          (p * 100).toFixed(1) + '%',
        );
        if (!cancelRef.current) setProgress(65 + p * 30);
      })
        .then((mp4Blob) => {
          if (cancelRef.current) return;
          setOutputSize(mp4Blob.size);
          setProgress(100);
          setStage('done');

          // Trigger download
          downloadFile(mp4Blob, fileName);
        })
        .catch((err) => {
          logger.warn(LogCategory.VIDEO, '[Export] ffmpeg failed, fallback to WebM:', err);
          setOutputSize(webmBlob.size);
          setProgress(100);
          setStage('done');
          // Fallback: download the WebM with .mp4 name hint removed
          const fbName = fileName.replace('.mp4', '.webm');
          downloadFile(webmBlob, fbName);
        });
    };

    renderFrame();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStage('rendering');
      setProgress(0);
      setErrorMsg('');
      setOutputSize(0);
      setElapsed(0);
      setTotalDuration(0);
      cancelRef.current = false;
      startExport();
    }
    return () => {
      cancelRef.current = true;
    };
  }, [isOpen, startExport]);

  const handleCancel = () => {
    cancelRef.current = true;
    onClose();
  };

  // Reset state when dialog closes for next open
  const handleClose = useCallback(() => {
    cancelRef.current = true;
    onClose();
  }, [onClose]);

  // Keyboard: Escape to close (only in done/error state)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (stage === 'done' || stage === 'error')) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, stage, handleClose]);

  if (!isOpen) return null;

  const progressPct = Math.round(progress);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] bg-[var(--bg-base)] rounded-xl border border-[var(--border-subtle)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {stage === 'done' ? '导出完成' : '导出视频'}
          </h3>
          {(stage === 'done' || stage === 'error') && (
            <button
              onClick={handleClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {stage === 'rendering' && (
          <div className="space-y-3">
            <div className="text-xs text-[var(--text-secondary)]">正在渲染视频...</div>
            <div className="w-full h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{progressPct}%</span>
              <span>
                {formatDuration(elapsed)} / {formatDuration(totalDuration)}
              </span>
            </div>
            <button
              onClick={handleCancel}
              className="w-full mt-3 py-2 px-3 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              取消
            </button>
          </div>
        )}

        {stage === 'transcoding' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {progress < 68 ? '正在加载转换引擎...' : '正在转换 MP4 格式...'}
            </div>
            <div className="w-full h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="text-xs text-[var(--text-muted)] text-right">{progressPct}%</div>
            {progress < 68 && (
              <div className="text-[10px] text-[var(--text-tertiary)] text-center">
                正在加载转换引擎...
              </div>
            )}
          </div>
        )}

        {stage === 'done' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)]">
              <Check className="w-5 h-5 text-green-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                  {fileName}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">{formatSize(outputSize)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="flex-1 py-2 px-3 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <div className="text-xs text-red-500">{errorMsg}</div>
            </div>
            <button
              onClick={handleClose}
              className="w-full py-2 px-3 rounded-lg border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

async function transcodeToMp4(
  webmBlob: Blob,
  totalDurationMs: number,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  logger.info(LogCategory.VIDEO, '[ffmpeg] 开始转码');
  const ffmpeg = new FFmpegWorker();

  logger.info(LogCategory.VIDEO, '[ffmpeg] 开始加载 ffmpeg WASM...');
  onProgress?.(0);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      logger.error(LogCategory.VIDEO, '[ffmpeg] load timed out after 60s');
    }, FFMPEG_LOAD_TIMEOUT);
    try {
      await ffmpeg.load(
        {
          coreURL: `${FFMPEG_LOCAL}/ffmpeg-core-umd.js`,
          wasmURL: `${FFMPEG_LOCAL}/ffmpeg-core.wasm`,
        },
        controller.signal,
      );
      logger.info(LogCategory.VIDEO, '[ffmpeg] WASM 加载完成');
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    logger.error(LogCategory.VIDEO, '[ffmpeg] WASM 加载失败:', e);
    throw e;
  }

  logger.info(LogCategory.VIDEO, '[ffmpeg] 开始写入输入文件...');
  onProgress?.(0.1);
  try {
    const data = await fetchFile(webmBlob);
    await ffmpeg.writeFile('input.webm', data as Uint8Array);
    logger.info(LogCategory.VIDEO, '[ffmpeg] 输入文件写入完成');
  } catch (e) {
    logger.error(LogCategory.VIDEO, '[ffmpeg] 写入输入文件失败:', e);
    throw e;
  }

  logger.info(LogCategory.VIDEO, '[ffmpeg] 开始转码命令...');
  ffmpeg.onProgress((p) => {
    logger.info(LogCategory.VIDEO, '[ffmpeg] 转码进度原始数据:', JSON.stringify(p));
    const totalUsec = totalDurationMs * 1000;
    const elapsed = typeof p.time === 'number' ? p.time : 0;
    const ratio = totalUsec > 0 ? elapsed / totalUsec : 0;
    const clamped = Math.min(1, Math.max(0, ratio));
    onProgress?.(0.1 + clamped * 0.85);
  });
  try {
    await ffmpeg.exec(
      '-i',
      'input.webm',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-y',
      'output.mp4',
    );
    logger.info(LogCategory.VIDEO, '[ffmpeg] 转码命令完成');
  } catch (e) {
    logger.error(LogCategory.VIDEO, '[ffmpeg] 转码失败:', e);
    throw e;
  }

  logger.info(LogCategory.VIDEO, '[ffmpeg] 开始读取输出文件...');
  onProgress?.(0.95);
  try {
    const data = await ffmpeg.readFile('output.mp4');
    logger.info(LogCategory.VIDEO, '[ffmpeg] 读取完成, 大小:', (data as any).length || 'unknown');
    onProgress?.(1);
    return new Blob([data], { type: 'video/mp4' });
  } catch (e) {
    logger.error(LogCategory.VIDEO, '[ffmpeg] 读取输出文件失败:', e);
    throw e;
  }
}

async function downloadFile(blob: Blob, name: string) {
  // Try File System Access API first (lets user choose location)
  try {
    const handle = await (window as any).showSaveFilePicker?.({
      suggestedName: name,
      types: [
        {
          description: 'Video',
          accept: { [blob.type]: [name.endsWith('.mp4') ? '.mp4' : '.webm'] },
        },
      ],
    });
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
  } catch {
    // User cancelled or API not supported
  }

  // Fallback: download via anchor
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
