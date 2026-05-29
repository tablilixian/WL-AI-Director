/**
 * Canvas Integration Service
 * 处理画布与项目数据的集成
 * 
 * 集成 canvasSyncService 实现 Local-First 架构：
 * - 本地保存：实时（防抖 500ms）
 * - 云端同步：延迟（停止操作 10s 后，最小间隔 30s）
 * - 关键节点：强制同步（切换项目、退出、手动保存）
 */

import { ProjectState, Shot, Keyframe } from '../../../../types';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';
import { logger, LogCategory } from '../../../../services/logger';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { 
  saveCanvasDataToLocal, 
  getCanvasDataFromLocal, 
  deleteCanvasDataFromLocal,
  CanvasData
} from '../../../../services/canvasStorageService';
import { canvasSyncService } from '../../../../services/canvasSyncService';
import { assetStore } from '../services/assetStore';

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

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}

export class CanvasIntegrationService {
  private currentProjectId: string = '';
  private isLoading: boolean = false;
  private loadingPromise: Promise<void> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(projectId?: string) {
    if (projectId) {
      this.currentProjectId = projectId;
    }
    this.setupAutoSave();
    this.setupBeforeUnload();
    this.cleanupLegacyLocalStorage();
  }

  /**
   * 清理旧的 localStorage 数据（已迁移到 IndexedDB）
   */
  private cleanupLegacyLocalStorage(): void {
    if (typeof window !== 'undefined') {
      const oldData = localStorage.getItem('wl-canvas-state');
      if (oldData) {
        console.log('[CanvasIntegration] 清理旧的 localStorage 数据（已迁移到 IndexedDB）');
        localStorage.removeItem('wl-canvas-state');
      }
    }
  }

  /**
   * 通过 Zustand subscribe 自动检测画布变化并触发保存
   */
  private setupAutoSave(): void {
    let prevLayers = useCanvasStore.getState().layers;
    let prevOffset = useCanvasStore.getState().offset;
    let prevScale = useCanvasStore.getState().scale;

    this.unsubscribe = useCanvasStore.subscribe((state) => {
      if (state.layers !== prevLayers || state.offset !== prevOffset || state.scale !== prevScale) {
        prevLayers = state.layers;
        prevOffset = state.offset;
        prevScale = state.scale;
        this.scheduleSave();
      }
    });
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.currentProjectId) {
        this.saveCanvasState();
      }
    }, 1000);
  }

  private setupBeforeUnload(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.saveTimer) {
          clearTimeout(this.saveTimer);
          this.saveTimer = null;
        }
        this.doImmediateSave();
      });
    }
  }

  /**
   * 设置当前项目ID
   * 在加载项目时调用
   * 同时初始化 canvasSyncService
   */
  async setProjectId(projectId: string): Promise<void> {
    console.log('[CanvasIntegration] ========== 设置项目ID ==========');
    console.log('[CanvasIntegration] 旧项目ID:', this.currentProjectId);
    console.log('[CanvasIntegration] 新项目ID:', projectId);
    
    if (this.currentProjectId === projectId) {
      console.log('[CanvasIntegration] 项目ID相同，跳过设置');
      return;
    }
    
    if (this.isLoading) {
      console.log('[CanvasIntegration] 正在加载，等待完成...');
      await this.loadingPromise;
    }
    
    this.isLoading = true;
    this.loadingPromise = (async () => {
      try {
        if (this.currentProjectId && this.currentProjectId !== projectId) {
          console.log('[CanvasIntegration] 切换项目，先保存旧项目数据');
          await this.forceSync();
          
          console.log('[CanvasIntegration] 清空旧画布状态');
          const { importLayers, setOffset, setScale } = useCanvasStore.getState();
          importLayers([], true);
          setOffset({ x: 0, y: 0 });
          setScale(1);
        }
        
        this.currentProjectId = projectId;
        
        const { setProjectId } = useCanvasStore.getState();
        setProjectId(projectId);
        
        logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 设置项目ID: ${projectId}`);
        
        await canvasSyncService.init(projectId);
      } finally {
        this.isLoading = false;
      }
    })();
    
    await this.loadingPromise;
  }

  /**
   * 手动触发即时保存（用于事件触发，如服务器响应后）
   * 立即执行，无延迟，绕过 canvasSyncService 的 500ms 防抖
   * @returns 保存完成的 Promise（可用于退出前等待保存完成）
   */
  saveImmediately(_force?: boolean): Promise<void> {
    return this.doImmediateSave().catch(e => {
      console.warn('[CanvasIntegration] 即时保存失败:', e);
    });
  }

  private async doImmediateSave(): Promise<void> {
    if (!this.currentProjectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法立即保存');
      return;
    }

    const { layers, offset, scale } = useCanvasStore.getState();

    const layersToSave = await Promise.all(layers.map(async (layer) => {
      const { src, ...rest } = layer;
      let imageId = layer.imageId;
      if (src && src.startsWith('data:') && !imageId) {
        try {
          const imgId = unifiedImageService.generateImageId();
          const response = await fetch(src);
          const blob = await response.blob();
          await unifiedImageService.saveImage(imgId, blob);
          imageId = imgId;
        } catch (e) {
          console.warn(`[CanvasIntegration] 保存图片到 IndexedDB 失败:`, e);
        }
      }
      return { ...rest, imageId };
    }));

    try {
      await canvasSyncService.saveNow(this.currentProjectId, layersToSave, offset, scale);
      console.log('[CanvasIntegration] 即时保存画布成功');
    } catch (e) {
      console.warn('[CanvasIntegration] 即时保存画布失败:', e);
    }
  }

  private async saveCanvasState(): Promise<void> {
    // console.log('[CanvasIntegration] 保存画布');
    const { layers, offset, scale } = useCanvasStore.getState();

    if (!this.currentProjectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法保存画布数据');
      return;
    }

    const layersToSave = await Promise.all(layers.map(async (layer) => {
      const { src, ...rest } = layer;
      let imageId = layer.imageId;
      if (src && src.startsWith('data:') && !imageId) {
        try {
          const imgId = unifiedImageService.generateImageId();
          const response = await fetch(src);
          const blob = await response.blob();
          await unifiedImageService.saveImage(imgId, blob);
          imageId = imgId;
        } catch (e) {
          console.warn(`[CanvasIntegration] 保存图片到 IndexedDB 失败:`, e);
        }
      }
      return { ...rest, imageId };
    }));

    try {
      await canvasSyncService.save(this.currentProjectId, layersToSave, offset, scale);
    } catch (error) {
      logger.error(LogCategory.CANVAS, `[CanvasIntegration] 保存画布状态失败: ${error}`);
    }
  }

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

        let width = 1024;
        let height = 576;
        try {
          const dims = await unifiedImageService.getDimensions(resolvedUrl);
          width = dims.width + 10;
          height = dims.height + 10;
        } catch (e) {
          try {
            const dims = await loadImageDimensions(resolvedUrl);
            width = dims.width + 10;
            height = dims.height + 10;
          } catch {
            logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 获取镜头图片尺寸失败，使用默认值:', e);
          }
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

    let width = 1024;
    let height = 1024;
    try {
      const dims = await unifiedImageService.getDimensions(resolvedUrl);
      width = dims.width + 10;
      height = dims.height + 10;
    } catch (e) {
      try {
        const dims = await loadImageDimensions(resolvedUrl);
        width = dims.width + 10;
        height = dims.height + 10;
      } catch {
        logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 获取角色图片尺寸失败，使用默认值:', e);
      }
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

    let width = 1024;
    let height = 576;
    try {
      const dims = await unifiedImageService.getDimensions(resolvedUrl);
      width = dims.width + 10;
      height = dims.height + 10;
    } catch (e) {
      try {
        const dims = await loadImageDimensions(resolvedUrl);
        width = dims.width + 10;
        height = dims.height + 10;
      } catch {
        logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 获取场景图片尺寸失败，使用默认值:', e);
      }
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
   * 清空画布（会保存空状态到 IndexedDB，确保刷新后保持为空）
   */
  clearCanvas(): void {
    const { clearCanvas, offset, scale } = useCanvasStore.getState();
    clearCanvas();
    
    if (this.currentProjectId) {
      canvasSyncService.saveNow(this.currentProjectId, [], offset, scale).catch(e => {
        console.warn('[CanvasIntegration] 保存空画布失败:', e);
      });
    }
    
    logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布已清空');
  }

  /**
   * 强制同步到云端
   * 用于关键节点：切换项目、退出、手动保存
   */
  async forceSync(): Promise<void> {
    console.log('[CanvasIntegration] 强制同步到云端');
    await canvasSyncService.forceSync();
  }

  /**
   * 设置云端同步开关
   */
  setCloudSyncEnabled(enabled: boolean): void {
    canvasSyncService.setCloudSyncEnabled(enabled);
    logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 云端同步已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取云端同步开关状态
   */
  isCloudSyncEnabled(): boolean {
    return canvasSyncService.isCloudSyncEnabled();
  }

  /**
   * 获取同步状态
   */
  getSyncState() {
    return canvasSyncService.getState();
  }

  /**
   * 恢复画布状态
   * 使用 canvasSyncService.load() 实现 Local-First 加载
   * - 优先本地数据（IndexedDB）
   * - 检查云端数据
   * - 自动处理冲突
   * 
   * 注意：不再检查 localStorage 数据
   * 原因：已移除 Zustand persist 中间件，画布数据完全由 IndexedDB 管理
   */
  async restoreCanvasState(): Promise<boolean> {
    try {
      if (this.isLoading && this.loadingPromise) {
        console.log('[CanvasIntegration] 等待 setProjectId 完成...');
        await this.loadingPromise;
      }
      
      const store = useCanvasStore.getState();
      
      if (!this.currentProjectId) {
        if (store.projectId) {
          console.log('[CanvasIntegration] currentProjectId 为空，从 store 恢复:', store.projectId);
          this.currentProjectId = store.projectId;
          await canvasSyncService.init(store.projectId);
        } else {
          logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法恢复画布数据');
          return false;
        }
      }

      if (store.projectId && store.projectId !== this.currentProjectId) {
        console.log('[CanvasIntegration] 项目ID不匹配，先保存旧数据再清空');
        console.log('[CanvasIntegration] store 中的项目ID:', store.projectId);
        console.log('[CanvasIntegration] 当前项目ID:', this.currentProjectId);

        // 先保存旧项目的数据，防止丢失
        const oldProjectId = store.projectId;
        const { layers: oldLayers, offset: oldOffset, scale: oldScale } = store;
        if (oldLayers.length > 0) {
          try {
            const layersToSave = await Promise.all(oldLayers.map(async (layer) => {
              const { src, thumbnail, ...rest } = layer;
              let imageId = layer.imageId;
              if (src && src.startsWith('data:') && !imageId) {
                try {
                  const imgId = unifiedImageService.generateImageId();
                  const response = await fetch(src);
                  const blob = await response.blob();
                  await unifiedImageService.saveImage(imgId, blob);
                  imageId = imgId;
                } catch (e) {
                  console.warn(`[CanvasIntegration] 保存旧项目图片失败:`, e);
                }
              }
              return { ...rest, imageId };
            }));
            await canvasSyncService.saveNow(oldProjectId, layersToSave, oldOffset, oldScale);
            console.log('[CanvasIntegration] 旧项目画布数据已保存');
          } catch (e) {
            console.warn('[CanvasIntegration] 保存旧项目画布数据失败:', e);
          }
        }

        store.layers.forEach(layer => {
          if (layer.imageId) {
            assetStore.deleteAsset(layer.imageId).catch(console.error);
          }
          if (layer.thumbnailId) {
            assetStore.deleteAsset(layer.thumbnailId).catch(console.error);
          }
        });
        
        const { importLayers, setOffset, setScale, setProjectId } = store;
        importLayers([], true);
        setOffset({ x: 0, y: 0 });
        setScale(1);
        setProjectId(this.currentProjectId);
      }

      const canvasData = await canvasSyncService.load();
      
      if (!canvasData) {
        logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 未找到画布数据');
        return false;
      }

      logger.debug(LogCategory.CANVAS, `[CanvasIntegration] 加载画布数据，版本: ${canvasData.version}, 图层数: ${canvasData.layers.length}`);
      
      const { importLayers, setOffset, setScale } = useCanvasStore.getState();

      if (canvasData.layers && canvasData.layers.length > 0) {
        const restoredLayers = await Promise.all(canvasData.layers.map(async (layer: any) => {
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
            console.log('[CanvasIntegration] 恢复 drawing 图层:', layer.id, 'imageId:', layer.imageId, 'src:', layer.src?.substring(0, 50));
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getImage(layer.imageId);
                if (blob) {
                  const src = URL.createObjectURL(blob);
                  console.log('[CanvasIntegration] 恢复 drawing 图层成功:', layer.id, 'blob size:', blob.size);
                  return { ...layer, src };
                } else {
                  console.warn('[CanvasIntegration] 恢复 drawing 图层失败: blob 为空', layer.id, layer.imageId);
                }
              } catch (e) {
                console.warn('[CanvasIntegration] 恢复绘制图层失败 (imageId):', e);
              }
            } else if (layer.src && layer.src.startsWith('data:')) {
              return layer;
            } else {
              console.warn('[CanvasIntegration] 恢复 drawing 图层失败: 没有 imageId 且 src 不是 data:', layer.id);
            }
          }
          return layer;
        }));

        importLayers(restoredLayers, true);
      }

      if (canvasData.offset) {
        setOffset(canvasData.offset);
      }

      if (canvasData.scale) {
        setScale(canvasData.scale);
      }

      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布状态已恢复');
      return true;
    } catch (error) {
      logger.error(LogCategory.CANVAS, '[CanvasIntegration] 恢复画布状态失败', error);
      return false;
    }
  }

  /**
   * 清理资源 - 退出项目时调用
   */
  async cleanup(): Promise<void> {
    console.log('[CanvasIntegration] 清理资源，触发强制云同步...');
    // 切换页签前先确保数据已上传到云端
    try {
      await canvasSyncService.forceSync();
    } catch (e) {
      console.warn('[CanvasIntegration] 强制云同步失败:', e);
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await canvasSyncService.cleanup();
  }
}

export const canvasIntegrationService = new CanvasIntegrationService();
