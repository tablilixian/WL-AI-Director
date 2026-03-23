/**
 * Canvas Integration Service
 * 处理画布与项目数据的集成
 */

import { ProjectState, Shot, Keyframe } from '../../../../types';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';
import { logger, LogCategory } from '../../../../services/logger';
import { imageStorageService } from '../../../../services/imageStorageService';

interface ImportOptions {
  layout?: 'grid' | 'timeline';
  columns?: number;
  spacing?: number;
  startX?: number;
  startY?: number;
}

interface ExportOptions {
  sortByPosition?: boolean;
  includeAnnotations?: boolean;
}

const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  layout: 'grid',
  columns: 4,
  spacing: 20,
  startX: 100,
  startY: 100
};

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  sortByPosition: true,
  includeAnnotations: false
};

/**
 * 解析图片 URL
 * 支持 base64、HTTP URL、本地引用 (local:img_xxx)
 */
async function resolveImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';

  // 如果是 base64 或 HTTP URL，直接返回
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // 如果是本地引用 (local:img_xxx)，从 IndexedDB 获取
  if (imageUrl.startsWith('local:')) {
    const localId = imageUrl.replace('local:', '');
    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 解析本地图片引用: ${localId}`);

    try {
      const blob = await imageStorageService.getImage(localId);
      if (blob) {
        // 将 Blob 转换为 base64
        const base64 = await blobToBase64(blob);
        logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 本地图片解析成功: ${localId}`);
        return base64;
      } else {
        logger.warn(LogCategory.CANVAS, `[CanvasIntegration] 本地图片不存在: ${localId}`);
        return '';
      }
    } catch (error) {
      logger.error(LogCategory.CANVAS, `[CanvasIntegration] 解析本地图片失败: ${localId}`, error);
      return '';
    }
  }

  // 其他格式，尝试直接返回
  return imageUrl;
}

/**
 * Blob 转 Base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export class CanvasIntegrationService {
  /**
   * 将分镜导入画布
   */
  async importShotsToCanvas(
    shots: Shot[],
    options: ImportOptions = {}
  ): Promise<number> {
    const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
    const { addLayer } = useCanvasStore.getState();

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导入 ${shots.length} 个分镜到画布`);

    let importedCount = 0;

    for (let shotIndex = 0; shotIndex < shots.length; shotIndex++) {
      const shot = shots[shotIndex];
      if (!shot.keyframes || shot.keyframes.length === 0) {
        continue;
      }

      for (let kfIndex = 0; kfIndex < shot.keyframes.length; kfIndex++) {
        const keyframe = shot.keyframes[kfIndex];
        if (!keyframe.imageUrl) {
          continue;
        }

        // 解析图片 URL（处理本地引用）
        const resolvedUrl = await resolveImageUrl(keyframe.imageUrl);
        if (!resolvedUrl) {
          logger.warn(LogCategory.CANVAS, `[CanvasIntegration] 跳过无法解析的关键帧: ${shotIndex}-${kfIndex}`);
          continue;
        }

        const col = importedCount % (opts.columns || 4);
        const row = Math.floor(importedCount / (opts.columns || 4));

        const layer: LayerData = {
          id: crypto.randomUUID(),
          type: 'image',
          x: (opts.startX || 100) + col * (400 + (opts.spacing || 20)),
          y: (opts.startY || 100) + row * (300 + (opts.spacing || 20)),
          width: 400,
          height: 300,
          src: resolvedUrl,
          title: `镜头 ${shotIndex + 1}-${kfIndex + 1}`,
          createdAt: Date.now(),
          linkedResourceId: shot.id,
          linkedResourceType: 'keyframe'
        };

        addLayer(layer);
        importedCount++;

        if (importedCount === 1) {
          logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 第一个图层 src 长度: ${layer.src?.length}, 前缀: ${layer.src?.substring(0, 50)}`);
        }
      }
    }

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 成功导入 ${importedCount} 个图层`);
    return importedCount;
  }

  /**
   * 将关键帧导入画布
   */
  async importKeyframesToCanvas(
    keyframes: Keyframe[],
    options: ImportOptions = {}
  ): Promise<number> {
    const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
    const { addLayer } = useCanvasStore.getState();

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导入 ${keyframes.length} 个关键帧到画布`);

    let importedCount = 0;

    for (let index = 0; index < keyframes.length; index++) {
      const keyframe = keyframes[index];
      if (!keyframe.imageUrl) {
        continue;
      }

      // 解析图片 URL（处理本地引用）
      const resolvedUrl = await resolveImageUrl(keyframe.imageUrl);
      if (!resolvedUrl) {
        logger.warn(LogCategory.CANVAS, `[CanvasIntegration] 跳过无法解析的关键帧: ${index}`);
        continue;
      }

      const col = importedCount % (opts.columns || 4);
      const row = Math.floor(importedCount / (opts.columns || 4));

      const layer: LayerData = {
        id: crypto.randomUUID(),
        type: 'image',
        x: (opts.startX || 100) + col * (400 + (opts.spacing || 20)),
        y: (opts.startY || 100) + row * (300 + (opts.spacing || 20)),
        width: 400,
        height: 300,
        src: resolvedUrl,
        title: `关键帧 ${index + 1}`,
        createdAt: Date.now(),
        linkedResourceId: keyframe.id,
        linkedResourceType: 'keyframe'
      };

      addLayer(layer);
      importedCount++;
    }

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 成功导入 ${importedCount} 个图层`);
    return importedCount;
  }

  /**
   * 将角色导入画布
   */
  async importCharacterToCanvas(
    characterId: string,
    characterName: string,
    imageUrl: string,
    x: number = 100,
    y: number = 100
  ): Promise<string> {
    const { addLayer } = useCanvasStore.getState();

    const layerId = crypto.randomUUID();

    const layer: LayerData = {
      id: layerId,
      type: 'image',
      x,
      y,
      width: 400,
      height: 400,
      src: imageUrl,
      title: characterName,
      createdAt: Date.now(),
      linkedResourceId: characterId,
      linkedResourceType: 'character'
    };

    addLayer(layer);

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导入角色: ${characterName}`);
    return layerId;
  }

  /**
   * 将场景导入画布
   */
  async importSceneToCanvas(
    sceneId: string,
    sceneName: string,
    imageUrl: string,
    x: number = 100,
    y: number = 100
  ): Promise<string> {
    const { addLayer } = useCanvasStore.getState();

    const layerId = crypto.randomUUID();

    const layer: LayerData = {
      id: layerId,
      type: 'image',
      x,
      y,
      width: 640,
      height: 360,
      src: imageUrl,
      title: sceneName,
      createdAt: Date.now(),
      linkedResourceId: sceneId,
      linkedResourceType: 'scene'
    };

    addLayer(layer);

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导入场景: ${sceneName}`);
    return layerId;
  }

  /**
   * 将画布内容导出为关键帧
   */
  exportCanvasToKeyframes(options: ExportOptions = {}): Partial<Keyframe>[] {
    const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const { layers } = useCanvasStore.getState();

    const imageLayers = layers.filter(l => l.type === 'image' && l.src);

    let sortedLayers = imageLayers;
    if (opts.sortByPosition) {
      sortedLayers = [...imageLayers].sort((a, b) => {
        const rowDiff = Math.floor(a.y / 320) - Math.floor(b.y / 320);
        if (rowDiff !== 0) return rowDiff;
        return a.x - b.x;
      });
    }

    const keyframes: Partial<Keyframe>[] = sortedLayers.map((layer, index) => ({
      id: crypto.randomUUID(),
      type: 'end' as const,
      imageUrl: layer.src,
      visualPrompt: layer.title,
      status: 'completed' as const
    }));

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导出 ${keyframes.length} 个关键帧`);
    return keyframes;
  }

  /**
   * 获取画布内容摘要
   */
  getCanvasSummary(): {
    totalLayers: number;
    imageLayers: number;
    videoLayers: number;
    otherLayers: number;
  } {
    const { layers } = useCanvasStore.getState();

    return {
      totalLayers: layers.length,
      imageLayers: layers.filter(l => l.type === 'image').length,
      videoLayers: layers.filter(l => l.type === 'video').length,
      otherLayers: layers.filter(l => !['image', 'video'].includes(l.type)).length
    };
  }

  /**
   * 清空画布
   */
  clearCanvas(): void {
    const { clearCanvas } = useCanvasStore.getState();
    clearCanvas();
    logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布已清空');
  }

  /**
   * 保存画布状态
   */
  async saveCanvasState(): Promise<void> {
    const { layers, offset, scale } = useCanvasStore.getState();

    const state = {
      layers,
      offset,
      scale,
      savedAt: Date.now()
    };

    localStorage.setItem('wl-canvas-backup', JSON.stringify(state));
    logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布状态已保存');
  }

  /**
   * 恢复画布状态
   */
  async restoreCanvasState(): Promise<boolean> {
    try {
      const saved = localStorage.getItem('wl-canvas-backup');
      if (!saved) return false;

      const state = JSON.parse(saved);
      const { importLayers, setOffset, setScale } = useCanvasStore.getState();

      if (state.layers && state.layers.length > 0) {
        importLayers(state.layers);
      }

      if (state.offset) {
        setOffset(state.offset);
      }

      if (state.scale) {
        setScale(state.scale);
      }

      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布状态已恢复');
      return true;
    } catch (error) {
      logger.error(LogCategory.CANVAS, '[CanvasIntegration] 恢复画布状态失败', error);
      return false;
    }
  }
}

export const canvasIntegrationService = new CanvasIntegrationService();
