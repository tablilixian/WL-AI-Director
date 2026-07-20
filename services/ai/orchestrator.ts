import { VideoGenerationMode, AspectRatio, VideoDuration, TimedKeyframe } from '../../types';
import { generateVideo } from './videoService';
import { generateVideoMsr, generateVideoMkr, generateVideoMkrGrid } from './visualService';
import { unifiedImageService } from '../unifiedImageService';
import { logger, LogCategory } from '../logger';
import { retryOperation } from './apiCore';
import { VIDEO_MKR_GRID_DEFAULT } from '../../config/sizeConfig';

/** 统一视频生成请求参数 */
export interface VideoGenerationRequest {
  mode: VideoGenerationMode;
  prompt: string;
  /** basic: 起始帧 base64 */
  startImage?: string;
  /** basic: 结束帧 base64 */
  endImage?: string;
  /** msr: 参考帧列表 base64 */
  referenceImages?: string[];
  /** msr: 背景图 base64 */
  backgroundImage?: string;
  /** mkr: 带时间戳的关键帧列表 */
  timedImages?: { image: string; frame_index: number }[];
  /** mkr-grid: 九宫格整图 base64 */
  refImage?: string;
  /** mkr-grid: 宫格类型 */
  gridType?: number;
  /** mkr-grid: 选中格子索引 */
  frameIndexes?: number[];
  /** 通用参数 */
  modelId: string;
  aspectRatio: AspectRatio;
  duration: VideoDuration;
  width: number;
  height: number;
  fps: number;
}

/** 进度回调 */
export interface VideoGenerationProgress {
  stage: 'preparing' | 'generating' | 'saving';
  percent: number;
  message: string;
}

/** 统一生成结果 */
export interface VideoGenerationResult {
  videoUrl: string;
  status: 'completed';
}

const MAX_RETRIES = 3;

/**
 * 视频生成调度器
 * 统一管理 basic / msr / mkr / mkr-grid 四种模式的执行流程，
 * 提供统一的进度回调、重试逻辑、错误处理。
 */
export class VideoGenerationOrchestrator {

  async generate(
    request: VideoGenerationRequest,
    onProgress?: (progress: VideoGenerationProgress) => void
  ): Promise<VideoGenerationResult> {
    const { mode } = request;
    logger.debug(LogCategory.AI, `🎬 Orchestrator 启动 — 模式: ${mode}`);

    onProgress?.({ stage: 'preparing', percent: 0, message: `准备 ${mode} 模式...` });

    let rawVideoUrl: string;

    switch (mode) {
      case 'basic':
        rawVideoUrl = await this.generateBasic(request, onProgress);
        break;
      case 'msr':
        rawVideoUrl = await this.generateMsr(request, onProgress);
        break;
      case 'mkr':
        rawVideoUrl = await this.generateMkr(request, onProgress);
        break;
      case 'mkr-grid':
        rawVideoUrl = await this.generateMkrGrid(request, onProgress);
        break;
      default:
        throw new Error(`未知视频生成模式: ${mode}`);
    }

    onProgress?.({ stage: 'saving', percent: 90, message: '保存视频到本地...' });

    const videoUrl = await unifiedImageService.saveVideoToLocal(rawVideoUrl);

    onProgress?.({ stage: 'saving', percent: 100, message: '视频生成完成' });

    return { videoUrl, status: 'completed' };
  }

  private async generateBasic(
    req: VideoGenerationRequest,
    onProgress?: (p: VideoGenerationProgress) => void
  ): Promise<string> {
    onProgress?.({ stage: 'generating', percent: 5, message: '首尾帧模式生成中...' });
    const result = await generateVideo(
      req.prompt,
      req.startImage || '',
      req.endImage || '',
      req.modelId,
      req.aspectRatio,
      req.duration
    );
    onProgress?.({ stage: 'generating', percent: 85, message: '首尾帧模式完成' });
    return result;
  }

  private async generateMsr(
    req: VideoGenerationRequest,
    onProgress?: (p: VideoGenerationProgress) => void
  ): Promise<string> {
    onProgress?.({ stage: 'generating', percent: 5, message: 'MSR 多帧超分生成中...' });

    const result = await retryOperation(
      () => generateVideoMsr(
        req.prompt,
        req.referenceImages || [],
        req.backgroundImage || '',
        req.width,
        req.height,
        req.duration,
        req.fps
      ),
      MAX_RETRIES
    );

    onProgress?.({ stage: 'generating', percent: 85, message: 'MSR 生成完成' });
    return result;
  }

  private async generateMkr(
    req: VideoGenerationRequest,
    onProgress?: (p: VideoGenerationProgress) => void
  ): Promise<string> {
    onProgress?.({ stage: 'generating', percent: 5, message: 'MKR 多关键帧生成中...' });

    const result = await retryOperation(
      () => generateVideoMkr(
        req.prompt,
        req.timedImages || [],
        req.width,
        req.height,
        req.duration,
        req.fps
      ),
      MAX_RETRIES
    );

    onProgress?.({ stage: 'generating', percent: 85, message: 'MKR 生成完成' });
    return result;
  }

  private async generateMkrGrid(
    req: VideoGenerationRequest,
    onProgress?: (p: VideoGenerationProgress) => void
  ): Promise<string> {
    onProgress?.({ stage: 'generating', percent: 5, message: 'MKR Grid 宫格视频生成中...' });

    // 百分比 → 实际帧索引（0 ~ totalFrames-1）
    const totalFrames = req.duration * req.fps;
    const frameIndexes = (req.frameIndexes || [0, 0, 0, 0]).map(pct =>
      Math.min(Math.round((pct / 100) * totalFrames), totalFrames - 1)
    );

    // MKR Grid 后端不支持高分辨率，使用默认值 640×320
    const width = VIDEO_MKR_GRID_DEFAULT.width;
    const height = VIDEO_MKR_GRID_DEFAULT.height;

    const result = await retryOperation(
      () => generateVideoMkrGrid(
        req.prompt,
        req.refImage || '',
        req.gridType || 4,
        frameIndexes,
        width,
        height,
        req.duration,
        req.fps
      ),
      MAX_RETRIES
    );

    onProgress?.({ stage: 'generating', percent: 85, message: 'MKR Grid 生成完成' });
    return result;
  }
}

/** 全局单例 */
export const videoOrchestrator = new VideoGenerationOrchestrator();
