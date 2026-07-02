import { canvasModelService } from './canvasModelService';
import type { PanoramaGenerationMode } from '../types/canvas';

export interface PanoramaGenerationOptions {
  mode: PanoramaGenerationMode;
  prompt?: string;
  referenceImage?: string;
  onProgress?: (progress: number) => void;
}

export interface PanoramaGenerationResult {
  panoramaSrc: string;
  width: number;
  height: number;
}

class PanoramaGenerationService {
  async generate(options: PanoramaGenerationOptions): Promise<PanoramaGenerationResult> {
    const { mode, prompt, referenceImage, onProgress } = options;

    const finalPrompt = prompt?.trim() || '720 degree equirectangular panorama, seamless, immersive 360 view';

    const result = await canvasModelService.generateImage({
      prompt: finalPrompt,
      referenceImages: mode === 'image-to-panorama' && referenceImage ? [referenceImage] : undefined,
      aspectRatio: '16:9',
      onProgress,
    });

    let panoramaSrc = '';
    if (typeof result === 'string') {
      panoramaSrc = result;
    } else if (result && typeof result === 'object') {
      const r = result as any;
      panoramaSrc = r.images?.[0]?.url || r.images?.[0] || r.url || r.data || '';
    }

    if (!panoramaSrc) {
      throw new Error('全景图生成失败：返回结果为空');
    }

    return {
      panoramaSrc,
      width: 2048,
      height: 1024,
    };
  }
}

export const panoramaGenerationService = new PanoramaGenerationService();
