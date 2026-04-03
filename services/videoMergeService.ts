import { ProjectState } from '../types';
import { unifiedImageService } from './unifiedImageService';
import { logger, LogCategory } from './logger';

export interface MergeProgress {
  phase: string;
  progress: number;
  currentShot?: number;
  totalShots?: number;
}

export interface MergeOptions {
  outputName?: string;
  resolution?: '720p' | '1080p' | '4K';
  frameRate?: 24 | 30 | 60;
  quality?: number;
}

const DEFAULT_OPTIONS: MergeOptions = {
  resolution: '1080p',
  frameRate: 30,
  quality: 0.8
};

const RESOLUTION_MAP = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4K': { width: 3840, height: 2160 }
};

class VideoMergeService {
  private isCancelled = false;

  async mergeVideos(
    project: ProjectState,
    options: MergeOptions = {},
    onProgress?: (progress: MergeProgress) => void
  ): Promise<Blob> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.isCancelled = false;

    onProgress?.({ phase: '初始化...', progress: 0 });

    const completedShots = project.shots.filter(shot => shot.interval?.videoUrl);
    if (completedShots.length === 0) {
      throw new Error('没有可合并的视频片段');
    }

    onProgress?.({ 
      phase: '下载视频片段...', 
      progress: 5,
      currentShot: 0,
      totalShots: completedShots.length
    });

    const videoElements: HTMLVideoElement[] = [];

    for (let i = 0; i < completedShots.length; i++) {
      if (this.isCancelled) {
        throw new Error('用户取消了合并操作');
      }

      const shot = completedShots[i];
      const videoUrl = shot.interval!.videoUrl!;

      try {
        logger.debug(LogCategory.VIDEO, `[VideoMergeService] 正在下载视频 ${i + 1}/${completedShots.length}: ${videoUrl}`);
        
        let url: string;
        
        if (videoUrl.startsWith('data:video')) {
          url = videoUrl;
        } else {
          url = await unifiedImageService.resolveForDisplay(videoUrl);
          if (!url) {
            throw new Error(`无法获取视频 URL: ${videoUrl}`);
          }
        }
        
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error('视频加载失败'));
          video.load();
        });

        videoElements.push(video);

        const progress = 5 + Math.round(((i + 1) / completedShots.length) * 15);
        onProgress?.({ 
          phase: `下载视频片段 (${i + 1}/${completedShots.length})...`, 
          progress,
          currentShot: i + 1,
          totalShots: completedShots.length
        });
      } catch (err) {
        logger.error(LogCategory.VIDEO, `下载视频片段 ${i + 1} 失败:`, err);
        throw new Error(`下载视频片段 ${i + 1} 失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    }

    onProgress?.({ phase: '准备合并...', progress: 20 });

    if (videoElements.length === 0) {
      throw new Error('没有可合并的视频数据');
    }

    const { width, height } = RESOLUTION_MAP[opts.resolution!];

    onProgress?.({ phase: '创建画布...', progress: 25 });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文');
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    onProgress?.({ phase: '开始合并...', progress: 30 });

    const stream = canvas.captureStream(opts.frameRate);
    
    let mimeType = 'video/mp4;codecs=avc1.42E01E,mp4a.40.2';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
          }
        }
      }
    }
    
    logger.debug(LogCategory.VIDEO, `[VideoMergeService] 使用编码格式: ${mimeType}`);
    
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5000000
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.start(100);

    let totalDuration = 0;
    for (const video of videoElements) {
      totalDuration += video.duration;
    }

    let currentTime = 0;
    for (let i = 0; i < videoElements.length; i++) {
      if (this.isCancelled) {
        mediaRecorder.stop();
        throw new Error('用户取消了合并操作');
      }

      const video = videoElements[i];
      const videoDuration = video.duration;
      
      await video.play();

      const drawFrame = () => {
        if (this.isCancelled) return;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        const scale = Math.min(width / videoWidth, height / videoHeight);
        const x = (width - videoWidth * scale) / 2;
        const y = (height - videoHeight * scale) / 2;
        
        ctx.drawImage(video, x, y, videoWidth * scale, videoHeight * scale);

        const progress = 30 + Math.round(((currentTime + video.currentTime) / totalDuration) * 60);
        onProgress?.({ 
          phase: `合并视频片段 (${i + 1}/${videoElements.length})...`, 
          progress,
          currentShot: i + 1,
          totalShots: videoElements.length
        });
      };

      const animate = () => {
        if (this.isCancelled) return;
        if (video.ended || video.currentTime >= videoDuration) {
          return;
        }
        drawFrame();
        requestAnimationFrame(animate);
      };

      animate();

      await new Promise<void>((resolve) => {
        video.onended = () => {
          video.pause();
          video.currentTime = 0;
          resolve();
        };
      });

      currentTime += videoDuration;
    }

    onProgress?.({ phase: '完成录制...', progress: 95 });

    mediaRecorder.stop();

    const blob = await new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      mediaRecorder.onerror = (event) => reject(new Error('录制失败'));
    });

    onProgress?.({ phase: '完成！', progress: 100 });

    return blob;
  }

  async cancel(): Promise<void> {
    logger.debug(LogCategory.VIDEO, '[VideoMergeService] 取消合并操作');
    this.isCancelled = true;
  }

  async cleanup(): Promise<void> {
    logger.debug(LogCategory.VIDEO, '[VideoMergeService] 清理临时资源');
    this.isCancelled = false;
  }
}

export const videoMergeService = new VideoMergeService();

export async function mergeVideos(
  project: ProjectState,
  options?: MergeOptions,
  onProgress?: (progress: MergeProgress) => void
): Promise<Blob> {
  return videoMergeService.mergeVideos(project, options, onProgress);
}

export async function cancelMerge(): Promise<void> {
  return videoMergeService.cancel();
}

export async function cleanupMerge(): Promise<void> {
  return videoMergeService.cleanup();
}
