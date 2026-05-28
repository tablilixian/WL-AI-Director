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
  isCharacterTurnaround?: boolean;
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

  generateTraceId(): string {
    return `i2i_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  async generateImage(options: GenerateImageOptions): Promise<string> {
    const { prompt, referenceImages = [], aspectRatio = '16:9', onProgress, isCharacterTurnaround } = options;
    const provider = this.getProvider();
    const traceId = this.generateTraceId();
    const startTime = Date.now();
    const isImageToImage = referenceImages.length > 0;

    console.log(`\n========== [I2I:${traceId}] 图生图流程启动 ==========`);
    console.log(`[I2I:${traceId}] 阶段 1/5 - 发起请求`);
    console.log(`[I2I:${traceId}] 请求类型: ${isImageToImage ? '图生图 (Image-to-Image)' : '文生图 (Text-to-Image)'}`);
    console.log(`[I2I:${traceId}] 当前提供商: ${provider}`);
    console.log(`[I2I:${traceId}] 提示词: ${prompt}`);
    console.log(`[I2I:${traceId}] 宽高比: ${aspectRatio}`);
    console.log(`[I2I:${traceId}] 参考图数量: ${referenceImages.length}`);
    if (isImageToImage) {
      console.log(`[I2I:${traceId}] 参考图详情:`);
      referenceImages.forEach((img, i) => {
        console.log(`  [${i + 1}] 来源类型: ${img.startsWith('data:') ? 'Base64' : img.startsWith('local:') ? '本地IndexedDB' : img.startsWith('blob:') ? 'Blob URL' : '远程URL'}`);
        console.log(`  [${i + 1}] 数据长度: ${img.length} 字符`);
        console.log(`  [${i + 1}] 预览前缀: ${img.substring(0, 60)}...`);
      });
    }

    logger.debug(LogCategory.CANVAS, `[I2I:${traceId}] Generating image with ${provider}, isI2I=${isImageToImage}`);

    onProgress?.(10);

    try {
      const { callImageApi } = await import('../../../../services/adapters/imageAdapter');

      onProgress?.(30);

      console.log(`[I2I:${traceId}] 阶段 2/5 - 调用 ImageAdapter (callImageApi)...`);

      const imageUrl = await callImageApi({
        prompt,
        referenceImages,
        aspectRatio,
        resourceType: 'canvas',
        resourceId: traceId,
        isCharacterTurnaround
      }, undefined, traceId);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`\n[I2I:${traceId}] 阶段 5/5 - 生成完成 ✓`);
      console.log(`[I2I:${traceId}] 总耗时: ${totalTime}s`);
      console.log(`[I2I:${traceId}] 结果类型: ${imageUrl?.startsWith('local:') ? '本地IndexedDB引用' : imageUrl?.startsWith('data:') ? 'Base64' : '未知'}`);
      console.log(`[I2I:${traceId}] 结果ID: ${imageUrl}`);
      console.log(`========== [I2I:${traceId}] 流程结束 ==========\n`);

      onProgress?.(100);

      return imageUrl;
    } catch (error: any) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`\n[I2I:${traceId}] ❌ 图生图流程失败 (${totalTime}s)`);
      console.error(`[I2I:${traceId}] 错误信息: ${error.message}`);
      if (error.stack) {
        console.error(`[I2I:${traceId}] 错误堆栈: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      logger.error(LogCategory.CANVAS, `[I2I:${traceId}] Image generation failed`, error);
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

      onProgress?.(60);

      console.log('[CanvasModelService] 视频生成完成，URL:', videoUrl);

      try {
        let downloadUrl = videoUrl;
        
        if (videoUrl.includes('maas-watermark-prod-new.cn-wlcb.ufileos.com')) {
          downloadUrl = videoUrl.replace(
            'https://maas-watermark-prod-new.cn-wlcb.ufileos.com',
            '/video-proxy'
          );
          console.log('[CanvasModelService] 使用代理下载视频:', downloadUrl);
        } else if (videoUrl.includes('aigc-files.bigmodel.cn')) {
          downloadUrl = videoUrl.replace(
            'https://aigc-files.bigmodel.cn',
            '/bigmodel-files'
          );
          console.log('[CanvasModelService] 使用代理下载 bigmodel 视频:', downloadUrl);
        } else {
          console.log('[CanvasModelService] 尝试直接下载视频...');
        }
        
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`下载失败: ${response.status}`);
        }
        
        const videoBlob = await response.blob();
        console.log('[CanvasModelService] 视频下载成功，大小:', videoBlob.size);
        
        const { unifiedImageService } = await import('../../../../services/unifiedImageService');
        const localVideoUrl = await unifiedImageService.saveVideoToLocal(URL.createObjectURL(videoBlob));
        
        console.log('[CanvasModelService] 视频保存到本地成功:', localVideoUrl);
        onProgress?.(100);
        
        return localVideoUrl;
      } catch (downloadError: any) {
        console.error('[CanvasModelService] 视频下载失败:', downloadError);
        console.log('[CanvasModelService] 使用外部视频 URL');
        onProgress?.(100);
        return videoUrl;
      }
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

  async enhancePrompt(
    prompt: string, 
    mode: 'image-to-image' | 'style-transfer' | 'background-replace' | 'expand' | 'text-to-image',
    referenceImageCount: number = 0
  ): Promise<string> {
    const modePrompts: Record<string, string> = {
      'image-to-image': 'Optimize this image editing prompt. Focus on specific visual changes while maintaining the original composition. Be precise about what to modify.',
      'style-transfer': 'Enhance this style transfer prompt. Include specific artistic style details, color palettes, brush techniques, or visual characteristics.',
      'background-replace': 'Improve this background replacement prompt. Describe the new environment in detail including lighting, atmosphere, and perspective.',
      'expand': 'Enhance this image expansion prompt. Describe what should naturally extend beyond the original boundaries.',
      'text-to-image': 'Optimize this image generation prompt. Add vivid visual details, composition, lighting, and artistic style.'
    };

    const systemPrompt = modePrompts[mode] || modePrompts['text-to-image'];
    const contextInfo = referenceImageCount > 0 
      ? `\n\nNote: This prompt will be applied to ${referenceImageCount} reference image(s).` 
      : '';

    try {
      const { chatCompletion } = await import('../../../../services/ai/apiCore');

      const enhancedPrompt = await chatCompletion(
        `${systemPrompt}\n\nOriginal prompt: ${prompt}${contextInfo}\n\nReturn ONLY the enhanced prompt, no explanations.`,
        undefined,
        0.7,
        1024
      );

      console.log(`[CanvasModelService] Prompt enhanced for mode: ${mode}`);
      return enhancedPrompt || prompt;
    } catch (error: any) {
      logger.warn(LogCategory.CANVAS, '[CanvasModelService] Prompt enhancement failed, using original', error);
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

  async replaceBackground(imageUrl: string, backgroundDescription: string, onProgress?: (progress: number) => void): Promise<string> {
    console.log('=== 背景替换请求 ===');
    console.log('[背景描述]', backgroundDescription);

    onProgress?.(10);

    const prompt = `Replace the background of this image with: ${backgroundDescription}. Keep the main subject intact and naturally blend it with the new background.`;

    return this.generateImage({
      prompt,
      referenceImages: [imageUrl],
      aspectRatio: '16:9',
      onProgress
    });
  }

  async expandImage(imageUrl: string, expandDirection: string, onProgress?: (progress: number) => void): Promise<string> {
    console.log('=== 图片扩展请求 ===');
    console.log('[扩展方向]', expandDirection);

    onProgress?.(10);

    const directionPrompts: Record<string, string> = {
      'all': 'Expand this image in all directions, naturally extending the scene.',
      'left': 'Expand this image to the left, naturally extending the scene.',
      'right': 'Expand this image to the right, naturally extending the scene.',
      'top': 'Expand this image to the top, naturally extending the scene.',
      'bottom': 'Expand this image to the bottom, naturally extending the scene.',
      'left-right': 'Expand this image to the left and right, naturally extending the scene.',
      'top-bottom': 'Expand this image to the top and bottom, naturally extending the scene.'
    };

    const prompt = directionPrompts[expandDirection] || directionPrompts['all'];

    return this.generateImage({
      prompt,
      referenceImages: [imageUrl],
      aspectRatio: '16:9',
      onProgress
    });
  }

  async removeBackground(imageUrl: string, onProgress?: (progress: number) => void): Promise<string> {
    console.log('=== 智能抠图请求 ===');

    onProgress?.(10);

    const prompt = 'Remove the background from this image, keeping only the main subject. Output a PNG with transparent background.';

    return this.generateImage({
      prompt,
      referenceImages: [imageUrl],
      aspectRatio: '16:9',
      onProgress
    });
  }

  async inpaint(
    compositedImageUrl: string,
    prompt: string,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    console.log('=== 局部重绘请求 ===');
    console.log('[提示词]', prompt);

    onProgress?.(10);

    try {
      const { callDramaBackendInpaintApi } = await import('../../../../services/adapters/imageAdapter');
      const traceId = this.generateTraceId();

      const result = await callDramaBackendInpaintApi({
        prompt,
        referenceImages: [compositedImageUrl],
      }, traceId);

      onProgress?.(100);
      return result;
    } catch (error) {
      console.error('局部重绘失败:', error);
      throw error;
    }
  }

  async generateVariants(imageUrl: string, options: {
    count?: number;
    strength?: number;
  } = {}, onProgress?: (progress: number) => void): Promise<string[]> {
    const { count = 4, strength = 0.7 } = options;

    console.log('=== 图片变体请求 ===');
    console.log('[变体数量]', count);
    console.log('[变体强度]', strength);

    onProgress?.(10);

    const variants: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const prompt = `Generate a variant of this image with ${Math.round(strength * 100)}% variation. Keep the main composition but change some details, lighting, or style. Create variation ${i + 1} of ${count}.`;

        const variant = await this.generateImage({
          prompt,
          referenceImages: [imageUrl],
          aspectRatio: '16:9',
          onProgress: (p) => {
            const baseProgress = 10 + (i / count) * 80;
            onProgress?.(baseProgress + (p / count));
          }
        });

        variants.push(variant);
        console.log(`[变体 ${i + 1}/${count}] 生成完成`);
      } catch (error) {
        console.error(`[变体 ${i + 1}/${count}] 生成失败:`, error);
      }
    }

    onProgress?.(100);

    return variants;
  }
}

export const canvasModelService = new CanvasModelService();
