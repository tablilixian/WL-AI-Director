/**
 * Canvas Integration Service
 * 处理画布与项目数据的集成
 */

import { ProjectState, Shot, Keyframe } from '../../../../types';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';
import { logger, LogCategory } from '../../../../services/logger';
import { unifiedImageService } from '../../../../services/unifiedImageService';

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
        const resolvedUrl = await unifiedImageService.resolveForApi(keyframe.imageUrl);
        if (!resolvedUrl) {
          logger.warn(LogCategory.CANVAS, `[CanvasIntegration] 跳过无法解析的关键帧: ${shotIndex}-${kfIndex}`);
          continue;
        }

        let imageId: string | undefined;
        if (resolvedUrl.startsWith('data:')) {
          try {
            const imgId = unifiedImageService.generateImageId();
            const response = await fetch(resolvedUrl);
            const blob = await response.blob();
            await unifiedImageService.saveImage(imgId, blob);
            imageId = imgId;
            logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 图片已保存到 IndexedDB: ${imageId}`);
          } catch (e) {
            logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 保存图片到 IndexedDB 失败:', e);
          }
        }

        const col = importedCount % (opts.columns || 4);
        const row = Math.floor(importedCount / (opts.columns || 4));

        let width = 400;
        let height = 300;
        try {
          const dims = await unifiedImageService.getDimensions(resolvedUrl);
          width = dims.width + 10;
          height = dims.height + 10;
        } catch (e) {
          logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 获取图片尺寸失败，使用默认尺寸:', e);
        }

        const layer: LayerData = {
          id: crypto.randomUUID(),
          type: 'image',
          x: (opts.startX || 100) + col * (width + (opts.spacing || 20)),
          y: (opts.startY || 100) + row * (height + (opts.spacing || 20)),
          width,
          height,
          src: resolvedUrl,
          imageId,
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

    const resolvedUrl = await unifiedImageService.resolveForApi(imageUrl);
    if (!resolvedUrl) {
      logger.warn(LogCategory.CANVAS, `[CanvasIntegration] 无法解析角色图片: ${characterName}`);
      return '';
    }

    let width = 400;
    let height = 400;
    try {
      const dims = await unifiedImageService.getDimensions(resolvedUrl);
      width = dims.width + 10;
      height = dims.height + 10;
    } catch (e) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 获取角色图片尺寸失败:', e);
    }

    const layerId = crypto.randomUUID();
    
    // 保存图片到 IndexedDB，获取 imageId
    let imageId: string | undefined;
    if (resolvedUrl.startsWith('data:')) {
      try {
        imageId = unifiedImageService.generateImageId();
        const response = await fetch(resolvedUrl);
        const blob = await response.blob();
        await unifiedImageService.saveImage(imageId, blob);
        logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 角色图片已保存: ${imageId}`);
      } catch (e) {
        logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 保存角色图片失败:', e);
      }
    }

    const layer: LayerData = {
      id: layerId,
      type: 'image',
      x,
      y,
      width,
      height,
      src: resolvedUrl,
      imageId,
      title: characterName,
      createdAt: Date.now(),
      linkedResourceId: characterId,
      linkedResourceType: 'character'
    };

    addLayer(layer);

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导入角色: ${characterName}, 尺寸: ${width}x${height}, imageId: ${imageId}`);
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

    const resolvedUrl = await unifiedImageService.resolveForApi(imageUrl);
    if (!resolvedUrl) {
      logger.warn(LogCategory.CANVAS, `[CanvasIntegration] 无法解析场景图片: ${sceneName}`);
      return '';
    }

    let width = 640;
    let height = 360;
    try {
      const dims = await unifiedImageService.getDimensions(resolvedUrl);
      width = dims.width + 10;
      height = dims.height + 10;
    } catch (e) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 获取场景图片尺寸失败:', e);
    }

    const layerId = crypto.randomUUID();
    
    // 保存图片到 IndexedDB，获取 imageId
    let imageId: string | undefined;
    if (resolvedUrl.startsWith('data:')) {
      try {
        imageId = unifiedImageService.generateImageId();
        const response = await fetch(resolvedUrl);
        const blob = await response.blob();
        await unifiedImageService.saveImage(imageId, blob);
        logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 场景图片已保存: ${imageId}`);
      } catch (e) {
        logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 保存场景图片失败:', e);
      }
    }

    const layer: LayerData = {
      id: layerId,
      type: 'image',
      x,
      y,
      width,
      height,
      src: resolvedUrl,
      imageId,
      title: sceneName,
      createdAt: Date.now(),
      linkedResourceId: sceneId,
      linkedResourceType: 'scene'
    };

    addLayer(layer);

    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 导入场景: ${sceneName}, 尺寸: ${width}x${height}, imageId: ${imageId}`);
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

    console.log('[CanvasIntegration] 保存画布，图层数量:', layers.length);
    console.log('[CanvasIntegration] 图层类型分布:', {
      image: layers.filter(l => l.type === 'image').length,
      video: layers.filter(l => l.type === 'video').length,
      drawing: layers.filter(l => l.type === 'drawing').length,
      sticky: layers.filter(l => l.type === 'sticky').length,
      text: layers.filter(l => l.type === 'text').length,
      group: layers.filter(l => l.type === 'group').length,
      other: layers.filter(l => !['image', 'video', 'drawing', 'sticky', 'text', 'group'].includes(l.type)).length
    });

    const layersToSave = await Promise.all(layers.map(async (layer) => {
      const { src, thumbnail, ...rest } = layer;
      
      let imageId = layer.imageId;
      
      if (layer.type === 'drawing' && src && src.startsWith('data:')) {
        try {
          const imgId = unifiedImageService.generateImageId();
          const response = await fetch(src);
          const blob = await response.blob();
          await unifiedImageService.saveImage(imgId, blob);
          imageId = imgId;
          console.log('[CanvasIntegration] 绘制图层已保存到 IndexedDB:', imgId);
        } catch (e) {
          console.warn('[CanvasIntegration] 保存绘制图层失败:', e);
        }
      }
      
      return {
        ...rest,
        imageId,
        srcSaved: src ? true : false
      };
    }));

    console.log('[CanvasIntegration] 保存的图层数量:', layersToSave.length);

    const state = {
      layers: layersToSave,
      offset,
      scale,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem('wl-canvas-backup', JSON.stringify(state));
      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布状态已保存');
    } catch (error) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 保存画布状态失败，尝试清理旧数据');
      localStorage.removeItem('wl-canvas-backup');
      localStorage.setItem('wl-canvas-backup', JSON.stringify(state));
    }
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
        const restoredLayers = await Promise.all(state.layers.map(async (layer: any) => {
          if (layer.type === 'image') {
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getImage(layer.imageId);
                if (blob) {
                  return { ...layer, src: URL.createObjectURL(blob) };
                }
              } catch (e) {
                console.warn('恢复图片失败 (imageId):', e);
              }
            }
            
            if (layer.src && layer.src.startsWith('local:')) {
              try {
                const localId = layer.src.replace('local:', '');
                const blob = await unifiedImageService.getImage(localId);
                if (blob) {
                  return { ...layer, src: URL.createObjectURL(blob) };
                }
              } catch (e) {
                console.warn('恢复图片失败 (local:):', e);
              }
            }
          } else if (layer.type === 'video') {
            // 优先使用 imageId（新版存储方式）
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getVideo(layer.imageId);
                if (blob) {
                  console.log('[CanvasIntegration] 恢复视频成功 (imageId):', layer.imageId);
                  return { ...layer, src: URL.createObjectURL(blob) };
                }
              } catch (e) {
                console.warn('恢复视频失败 (imageId):', e);
              }
            }
            // 兼容旧的 src 存储方式
            if (layer.src && layer.src.startsWith('video:')) {
              try {
                const videoId = layer.src.replace('video:', '');
                const blob = await unifiedImageService.getVideo(videoId);
                if (blob) {
                  return { ...layer, src: URL.createObjectURL(blob) };
                }
              } catch (e) {
                console.warn('恢复视频失败:', e);
              }
            }
          } else if (layer.type === 'drawing') {
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getImage(layer.imageId);
                if (blob) {
                  const src = URL.createObjectURL(blob);
                  console.log('恢复绘制图层成功:', layer.id, layer.imageId);
                  return { ...layer, src };
                }
              } catch (e) {
                console.warn('恢复绘制图层失败 (imageId):', e);
              }
            } else if (layer.src && layer.src.startsWith('data:')) {
              return layer;
            }
          }
          return layer;
        }));

        importLayers(restoredLayers, true);
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
