/**
 * Canvas Model Service
 * 适配 WL AI Director 的模型能力到画布模块
 */

import { logger, LogCategory } from '../../../../services/logger';
import { AspectRatio } from '../../../../types/model';

interface GenerateImageOptions {
  prompt: string;
  referenceImages?: string[];
  aspectRatio?: AspectRatio;
  onProgress?: (progress: number) => void;
}

interface GenerateVideoOptions {
  prompt: string;
  startImage?: string;
  endImage?: string;
  aspectRatio?: AspectRatio;
  duration?: number;
  onProgress?: (progress: number) => void;
}

export class CanvasModelService {
  private async getApiConfig() {
    const { getApiBase, checkApiKey, resolveRequestModel } = await import('../../../../services/ai/apiCore');
    const { getActiveImageModel, getActiveVideoModel } = await import('../../../../services/ai/apiCore');

    return {
      getApiBase,
      checkApiKey,
      resolveRequestModel,
      getActiveImageModel,
      getActiveVideoModel
    };
  }

  private getProvider(): 'antsk' | 'bigmodel' {
    try {
      const { getActiveImageModel } = require('../../../../services/ai/apiCore');
      const model = getActiveImageModel();
      return model?.providerId === 'bigmodel' ? 'bigmodel' : 'antsk';
    } catch {
      return 'antsk';
    }
  }

  async generateImage(options: GenerateImageOptions): Promise<string> {
    const { prompt, referenceImages = [], aspectRatio = '16:9', onProgress } = options;
    const provider = this.getProvider();

    console.log('=== 图片生成请求 ===');
    console.log('[请求类型]', referenceImages.length > 0 ? '图生图 (Image-to-Image)' : '文生图 (Text-to-Image)');
    console.log('[提供商]', provider);
    console.log('[提示词]', prompt);
    console.log('[宽高比]', aspectRatio);
    console.log('[参考图数量]', referenceImages.length);
    if (referenceImages.length > 0) {
      console.log('[参考图信息]');
      referenceImages.forEach((img, i) => {
        console.log(`  参考图 ${i + 1}:`, {
          类型: img.startsWith('data:') ? 'Base64' : img.startsWith('local:') ? '本地引用' : 'URL',
          长度: img.length,
          前缀: img.substring(0, 50) + '...'
        });
      });
    }

    logger.debug(LogCategory.CANVAS, `[CanvasModelService] Generating image with ${provider}`);

    onProgress?.(10);

    try {
      const { callImageApi } = await import('../../../../services/adapters/imageAdapter');

      onProgress?.(30);

      console.log('[调用 API] 开始调用 callImageApi...');

      const imageUrl = await callImageApi({
        prompt,
        referenceImages,
        aspectRatio,
        resourceType: 'canvas',
        resourceId: 'canvas-' + Date.now()
      });

      console.log('=== 图片生成响应 ===');
      console.log('[响应类型]', imageUrl?.startsWith('local:') ? '本地引用' : imageUrl?.startsWith('data:') ? 'Base64' : '未知');
      console.log('[响应内容]', {
        长度: imageUrl?.length,
        前缀: imageUrl?.substring(0, 50) + '...'
      });

      onProgress?.(100);

      return imageUrl;
    } catch (error: any) {
      console.error('=== 图片生成失败 ===');
      console.error('[错误信息]', error.message);
      logger.error(LogCategory.CANVAS, '[CanvasModelService] Image generation failed', error);
      throw error;
    }
  }

  async generateVideo(options: GenerateVideoOptions): Promise<string> {
    const { prompt, startImage, endImage, aspectRatio = '16:9', duration = 8, onProgress } = options;

    logger.debug(LogCategory.CANVAS, '[CanvasModelService] Generating video');

    onProgress?.(10);

    try {
      const { callVideoApi } = await import('../../../../services/adapters/videoAdapter');

      onProgress?.(30);

      const videoUrl = await callVideoApi({
        prompt,
        startImage,
        endImage,
        aspectRatio,
        duration: duration as any
      });

      onProgress?.(100);

      return videoUrl;
    } catch (error: any) {
      logger.error(LogCategory.CANVAS, '[CanvasModelService] Video generation failed', error);
      throw error;
    }
  }

  async improvePrompt(prompt: string): Promise<string> {
    try {
      const { chatCompletion } = await import('../../../../services/ai/apiCore');

      const improvedPrompt = await chatCompletion(
        `Optimize this image generation prompt to be more detailed and visually descriptive. Return only the optimized prompt, no explanations:\n\n${prompt}`,
        undefined,
        0.7,
        1024
      );

      return improvedPrompt || prompt;
    } catch (error: any) {
      logger.warn(LogCategory.CANVAS, '[CanvasModelService] Prompt improvement failed, using original', error);
      return prompt;
    }
  }

  async generateTitle(prompt: string): Promise<string> {
    try {
      const { chatCompletion } = await import('../../../../services/ai/apiCore');

      const title = await chatCompletion(
        `Generate a very short, concise title (max 5 words) for an image generated from this prompt. Return ONLY the title, no quotes:\n\n${prompt}`,
        undefined,
        0.7,
        100
      );

      return title?.trim() || prompt.slice(0, 30);
    } catch {
      return prompt.slice(0, 30);
    }
  }

  async styleTransfer(imageUrl: string, style: string, onProgress?: (progress: number) => void): Promise<string> {
    const stylePrompts: Record<string, string> = {
      'anime': 'Convert this image to anime style, maintaining the composition and key features. High quality anime illustration.',
      'oil-painting': 'Convert this image to oil painting style with rich textures and brush strokes. Classic oil painting aesthetic.',
      'watercolor': 'Convert this image to watercolor painting style with soft edges and translucent washes.',
      'sketch': 'Convert this image to pencil sketch style with detailed line work and shading.',
      'pixel-art': 'Convert this image to pixel art style, 8-bit retro game aesthetic.',
      'cyberpunk': 'Convert this image to cyberpunk style with neon lights, futuristic elements, and high-tech atmosphere.',
      'ghibli': 'Convert this image to Studio Ghibli animation style, soft and dreamy.',
      '3d-render': 'Convert this image to 3D rendered style with realistic lighting and materials.',
      'comic': 'Convert this image to comic book style with bold lines and vibrant colors.',
      'pop-art': 'Convert this image to pop art style inspired by Andy Warhol and Roy Lichtenstein.'
    };

    const stylePrompt = stylePrompts[style] || `Convert this image to ${style} style.`;

    console.log('=== 风格迁移请求 ===');
    console.log('[风格]', style);
    console.log('[提示词]', stylePrompt);

    onProgress?.(10);

    return this.generateImage({
      prompt: stylePrompt,
      referenceImages: [imageUrl],
      aspectRatio: '16:9',
      onProgress
    });
  }
}

export const canvasModelService = new CanvasModelService();
