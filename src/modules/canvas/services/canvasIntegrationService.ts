/**
 * Canvas Integration Service
 * 处理画布与项目数据的集成
 *
 * 集成 canvasSyncService 实现 Local-First 架构：
 * - 本地保存：实时（防抖 500ms）
 * - 云端同步：延迟（停止操作 10s 后，最小间隔 30s）
 * - 关键节点：强制同步（切换项目、退出、手动保存）
 */

import { Shot, Keyframe } from '../../../../types';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';
import { logger, LogCategory } from '../../../../services/logger';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { CanvasData } from '../../../../services/canvasStorageService';
import { canvasSyncService } from '../../../../services/canvasSyncService';
import { validateCanvasIntegrity } from './canvasIntegrity';
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
  startY: 100,
};

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  sortByPosition: true,
  includeAnnotations: false,
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
  private exitPromise: Promise<void> | null = null;

  /**
   * 保存队列：将所有写操作串行化，消除竞态
   *
   * 核心思路：每个新的写操作都 chain 在上一个操作的 Promise 之后，
   * 保证后一个操作必须等前一个完成才执行。
   *
   * 不受单个操作失败影响：如果前一个 reject，后一个仍会执行。
   */
  private pendingSave: Promise<void> = Promise.resolve();

  /**
   * 将写操作加入队列，返回执行完成的 Promise
   * 所有写操作（auto-save、saveImmediately、clearCanvas、forceSync）都通过此方法串行化
   */
  private enqueueSave<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.pendingSave;
    const next = prev.then(
      () => fn(),
      () => fn(),
    );
    // Keep the chain alive regardless of individual failures
    this.pendingSave = next.then(
      () => {},
      () => {},
    );
    return next;
  }

  /**
   * sessionStorage 备份的 key 前缀
   */
  private readonly STORAGE_KEY_PREFIX = 'canvas-backup:';

  constructor() {
    this.cleanupLegacyLocalStorage();
  }

  // =================================================================
  //  生命周期：enter / exit
  //  所有项目进入/退出操作通过此两方法统一管理，确保 setup 与 teardown 配对
  // =================================================================

  /**
   * 进入项目 - 设置自动保存、加载画布数据
   *
   * 安全边界：
   * - 如果已有活动项目且不同，先自动 exit()
   * - 如果 projectId 相同，跳过（防止重复加载）
   * - 先检查 sessionStorage 同步备份（beforeunload 时的兜底），再从 IndexedDB/云端恢复
   * - isLoading 标志阻止自动保存写入空数据
   */
  async enter(projectId: string): Promise<void> {
    if (!projectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] enter 失败：projectId 为空');
      return;
    }
    if (this.currentProjectId === projectId) {
      logger.info(LogCategory.CANVAS, '[CanvasIntegration] 已在项目中，跳过 enter:', projectId);
      return;
    }

    // 等待正在执行的 exit() 完成，防止"退出中又进入"的竞态
    if (this.exitPromise) {
      logger.info(LogCategory.CANVAS, '[CanvasIntegration] enter 等待 exit 完成...');
      await this.exitPromise;
    }

    if (this.currentProjectId) {
      logger.info(
        LogCategory.CANVAS,
        '[CanvasIntegration] enter 检测到活动项目，先退出:',
        this.currentProjectId,
      );
      await this.exit();
    }

    logger.info(LogCategory.CANVAS, '[CanvasIntegration] ========== 进入项目 ==========');
    logger.info(LogCategory.CANVAS, '[CanvasIntegration] 项目ID:', projectId);
    this.currentProjectId = projectId;
    this.isLoading = true;
    this.loadingPromise = (async () => {
      try {
        // 在加载新数据前清空旧画布，防止新项目没有画布数据时显示旧项目的图层
        const {
          importLayers,
          setOffset,
          setScale,
          setProjectId: setStoreProjectId,
        } = useCanvasStore.getState();
        importLayers([], true);
        setOffset({ x: 0, y: 0 });
        setScale(1);

        this.setupAutoSave();
        this.setupBeforeUnload();
        await canvasSyncService.init(projectId);
        setStoreProjectId(projectId);

        // 优先检查 sessionStorage 同步备份
        // 场景：用户关闭页面前 beforeunload 写入了 sessionStorage，
        // 但 IndexedDB 写入未完成（浏览器终止了事务）
        const backup = this.restoreSessionBackup(projectId);
        if (backup) {
          logger.info(LogCategory.CANVAS, '[CanvasIntegration] 从 sessionStorage 备份恢复画布');
          await this.importCanvasData(backup);
          return;
        }

        // 正常路径：从 IndexedDB 加载（可能触发云端冲突解决）
        await this._restoreCanvasState();
      } finally {
        this.isLoading = false;
      }
    })();

    await this.loadingPromise;
  }

  /**
   * 退出项目 - 保存、清理、释放资源
   *
   * 执行顺序（防止任何竞态）：
   * 1. 立即清除 currentProjectId → 后续 auto-save 调用变为 no-op
   * 2. 同步写入 sessionStorage 备份 → 即使页面关闭也不丢
   * 3. 取消 Zustand 订阅和 beforeunload 监听
   * 4. 等待保存队列排空 → 所有暂存的写操作按序完成
   * 5. 清理 canvasSyncService
   */
  async exit(): Promise<void> {
    if (!this.currentProjectId) {
      logger.info(LogCategory.CANVAS, '[CanvasIntegration] 无活动项目，跳过 exit');
      return;
    }
    // Dedup：如果 exit 已在执行，复用其 Promise（防止并发 exit）
    if (this.exitPromise) return this.exitPromise;

    const projectId = this.currentProjectId;
    logger.info(LogCategory.CANVAS, '[CanvasIntegration] ========== 退出项目 ==========');
    logger.info(LogCategory.CANVAS, '[CanvasIntegration] 项目ID:', projectId);

    this.exitPromise = (async () => {
      // 1. 立即切断 projectId → 此后所有 auto-save/saveImmediately 变为 no-op
      this.currentProjectId = '';

      // 2. 同步备份到 sessionStorage（必须在清空 store 之前，否则备份为空）
      this.backupToSessionStorage(projectId);

      // 3. 清空 Zustand store，防止残留图层显示
      const { importLayers, setOffset, setScale } = useCanvasStore.getState();
      importLayers([], true);
      setOffset({ x: 0, y: 0 });
      setScale(1);

      // 3. 取消定时器，避免残留的 auto-save 在退出后意外执行
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }

      // 4. 取消订阅和监听（不再接收 Zustand 变化和页面关闭事件）
      this.teardownAutoSave();
      this.teardownBeforeUnload();

      // 5. 等待保存队列排空（逐个执行完所有已入队的保存）
      await this.enqueueSave(async () => {
        try {
          await canvasSyncService.forceSync();
        } catch (e) {
          logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 退出时同步失败:', e);
        }
        // forceSync 失败后仍执行 cleanup，确保定时器/状态被重置
        await canvasSyncService.cleanup();
      });
    })();

    await this.exitPromise;
    this.exitPromise = null;
  }

  /**
   * 设置当前项目ID（兼容旧接口，内部委托给 enter）
   */
  async setProjectId(projectId: string): Promise<void> {
    await this.enter(projectId);
  }

  // =================================================================
  //  自动保存（Zustand 订阅 → timer → 保存队列）
  // =================================================================

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

  private teardownAutoSave(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.currentProjectId) {
        // 通过保存队列串行化，避免与 saveImmediately / clearCanvas 竞态
        this.enqueueSave(() => this.saveCanvasState());
      }
    }, 1000);
  }

  // =================================================================
  //  beforeunload 处理 + sessionStorage 同步备份
  // =================================================================

  private handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.currentProjectId) return;

    // 同步备份：写入 sessionStorage（浏览器关闭时不丢失，不受 async 影响）
    this.backupToSessionStorage(this.currentProjectId);

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // 最佳努力异步保存（现代浏览器会给正在执行的 IndexedDB 事务一定的完成时间）
    this.enqueueSave(() => this.doImmediateSave()).catch(() => {});

    // 触发浏览器的"离开确认"对话框，为异步保存争取时间
    event.preventDefault();
    event.returnValue = '';
  };

  private setupBeforeUnload(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  private teardownBeforeUnload(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  // =================================================================
  //  sessionStorage 同步备份
  //  作为 beforeunload 的最后一道防线，保证在 IndexedDB 写入被中断时
  //  仍能通过同步的 sessionStorage 恢复画布数据
  // =================================================================

  private backupToSessionStorage(projectId: string): void {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;

    const state = useCanvasStore.getState();
    if (!state.layers || state.layers.length === 0) return;

    const backupData: CanvasData = {
      version: 2,
      projectId,
      layers: state.layers.map((l) => {
        const { src, ...rest } = l;
        // blob URLs（URL.createObjectURL）在页面关闭后失效，不保存
        // data: URI 和 http(s) URL 可以保存，但 data: URI 可能非常大
        // 最佳实践：保留 imageId 用于 IndexedDB 恢复，保留非 blob 的 src
        const safeSrc = src && !src.startsWith('blob:') ? src : undefined;
        return { ...rest, src: safeSrc };
      }),
      offset: state.offset,
      scale: state.scale,
      savedAt: Date.now(),
      syncStatus: 'synced' as const,
    };

    const key = `${this.STORAGE_KEY_PREFIX}${projectId}`;
    try {
      sessionStorage.setItem(key, JSON.stringify(backupData));
      logger.info(
        LogCategory.CANVAS,
        `[CanvasIntegration] sessionStorage 备份完成: ${state.layers.length} layers`,
      );
    } catch (e) {
      // sessionStorage 配额不足（通常 5MB），静默放弃
      logger.warn(
        LogCategory.CANVAS,
        '[CanvasIntegration] sessionStorage 备份失败（可能超出配额）:',
        e,
      );
    }
  }

  private restoreSessionBackup(projectId: string): CanvasData | null {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return null;

    const key = `${this.STORAGE_KEY_PREFIX}${projectId}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      // 读取后立即清除，避免下次再恢复
      sessionStorage.removeItem(key);

      const data: CanvasData = JSON.parse(raw);

      // 校验：备份超过 10 分钟视为过期（正常流程中备份写入后应在数秒内被加载）
      if (data.savedAt && Date.now() - data.savedAt > 10 * 60 * 1000) {
        logger.info(
          LogCategory.CANVAS,
          '[CanvasIntegration] sessionStorage 备份已过期（>10分钟），忽略',
        );
        return null;
      }

      logger.info(
        LogCategory.CANVAS,
        `[CanvasIntegration] 从 sessionStorage 恢复备份: ${data.layers?.length || 0} layers`,
      );
      return data;
    } catch (e) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] sessionStorage 恢复失败:', e);
      return null;
    }
  }

  /**
   * 清理旧的 localStorage 数据（已迁移到 IndexedDB）
   */
  private cleanupLegacyLocalStorage(): void {
    if (typeof window !== 'undefined') {
      const oldData = localStorage.getItem('wl-canvas-state');
      if (oldData) {
        logger.info(
          LogCategory.CANVAS,
          '[CanvasIntegration] 清理旧的 localStorage 数据（已迁移到 IndexedDB）',
        );
        localStorage.removeItem('wl-canvas-state');
      }
    }
  }

  /**
   * 安全地将图层序列化为可保存的格式
   *
   * 核心原则：先持久化，后移除 src。
   * - 图片保存到 IndexedDB IMAGES store 成功 → 用 imageId 替代 src
   * - 图片保存失败 → 保留原始 src，下次保存可重试
   * - 不修改原始 layer 对象
   */
  private async serializeLayerForSave(layer: LayerData): Promise<LayerData> {
    const src = layer.src;
    let imageId = layer.imageId;

    if (src && src.startsWith('data:') && !imageId) {
      try {
        const imgId = unifiedImageService.generateImageId();
        const response = await fetch(src);
        const blob = await response.blob();
        await unifiedImageService.saveImage(imgId, blob);
        imageId = imgId;
      } catch (e) {
        logger.warn(
          LogCategory.CANVAS,
          `[CanvasIntegration] 保存图片到 IndexedDB 失败，保留原始 src:`,
          e,
        );
        // 保存失败，保留原始 layer（含 src），下次保存可重试
        return layer;
      }
    }

    // 图片已保存成功：src 改为 local: 持久引用，不再携带 data: base64。
    // 这样 IndexedDB 与云端都不会存几 MB 的 base64（云端 json 字段默认上限 1MB，
    // 超出会 400），渲染层通过 unifiedImageService 按 imageId 解析本地图片。
    const safeSrc =
      src && !src.startsWith('data:') && !src.startsWith('blob:')
        ? src
        : imageId
          ? `local:${imageId}`
          : src;
    return { ...layer, imageId, src: safeSrc };
  }

  /**
   * 手动触发即时保存（用于事件触发，如服务器响应后）
   * 立即执行，无延迟，绕过 canvasSyncService 的 500ms 防抖
   * @returns 保存完成的 Promise（可用于退出前等待保存完成）
   */
  saveImmediately(_force?: boolean): Promise<void> {
    return this.enqueueSave(() => this.doImmediateSave()).catch((e) => {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 即时保存失败:', e);
    });
  }

  private async doImmediateSave(): Promise<void> {
    if (!this.currentProjectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法立即保存');
      return;
    }

    // 防止在加载过程中保存空数据
    if (this.isLoading) {
      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 正在加载画布，跳过即时保存');
      return;
    }

    const { layers, offset, scale } = useCanvasStore.getState();

    const layersToSave = await Promise.all(layers.map((l) => this.serializeLayerForSave(l)));

    try {
      await canvasSyncService.saveNow(this.currentProjectId, layersToSave, offset, scale);
      logger.info(LogCategory.CANVAS, '[CanvasIntegration] 即时保存画布成功');
      useCanvasStore.getState().setLastSaveError(null);
    } catch (e) {
      logger.error(LogCategory.CANVAS, '[CanvasIntegration] 即时保存画布失败', e);
      useCanvasStore
        .getState()
        .setLastSaveError('即时保存失败，最近的修改可能未备份，请检查存储权限或空间');
    }
  }

  private async saveCanvasState(): Promise<void> {
    // console.log('[CanvasIntegration] 保存画布');

    // 防止在加载过程中自动保存空数据
    if (this.isLoading) {
      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 正在加载画布，跳过自动保存');
      return;
    }

    const { layers, offset, scale } = useCanvasStore.getState();

    if (!this.currentProjectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法保存画布数据');
      return;
    }

    const layersToSave = await Promise.all(layers.map((l) => this.serializeLayerForSave(l)));

    try {
      await canvasSyncService.save(this.currentProjectId, layersToSave, offset, scale);
      useCanvasStore.getState().setLastSaveError(null);
    } catch (error) {
      logger.error(LogCategory.CANVAS, '[CanvasIntegration] 保存画布状态失败', error);
      useCanvasStore
        .getState()
        .setLastSaveError('自动保存失败，最近的修改可能未备份，请检查存储权限或空间');
    }
  }

  /**
   * 将分镜导入画布
   */
  async importShotsToCanvas(shots: Shot[], options: ImportOptions = {}): Promise<number> {
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
          logger.warn(
            LogCategory.CANVAS,
            `[CanvasIntegration] 跳过无法解析的关键帧: ${shotIndex}-${kfIndex}`,
          );
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
            logger.debug(
              LogCategory.CANVAS,
              `[CanvasIntegration] 图片已保存到 IndexedDB: ${imageId}`,
            );
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
            logger.warn(
              LogCategory.CANVAS,
              '[CanvasIntegration] 获取镜头图片尺寸失败，使用默认值:',
              e,
            );
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
          linkedResourceType: 'keyframe',
        };

        addLayer(layer);
        importedCount++;

        if (importedCount === 1) {
          logger.debug(
            LogCategory.CANVAS,
            `[CanvasIntegration] 第一个图层 src 长度: ${layer.src?.length}, 前缀: ${layer.src?.substring(0, 50)}`,
          );
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
    y: number = 100,
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
      linkedResourceType: 'character',
    };

    addLayer(layer);

    logger.debug(
      LogCategory.CANVAS,
      `[CanvasIntegration] 导入角色: ${characterName}, 尺寸: ${width}x${height}, imageId: ${imageId}`,
    );
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
    y: number = 100,
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
      linkedResourceType: 'scene',
    };

    addLayer(layer);

    logger.debug(
      LogCategory.CANVAS,
      `[CanvasIntegration] 导入场景: ${sceneName}, 尺寸: ${width}x${height}, imageId: ${imageId}`,
    );
    return layerId;
  }

  /**
   * 将画布内容导出为关键帧
   */
  exportCanvasToKeyframes(options: ExportOptions = {}): Partial<Keyframe>[] {
    const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const { layers } = useCanvasStore.getState();

    const imageLayers = layers.filter((l) => l.type === 'image' && l.src);

    let sortedLayers = imageLayers;
    if (opts.sortByPosition) {
      sortedLayers = [...imageLayers].sort((a, b) => {
        const rowDiff = Math.floor(a.y / 320) - Math.floor(b.y / 320);
        if (rowDiff !== 0) return rowDiff;
        return a.x - b.x;
      });
    }

    const keyframes: Partial<Keyframe>[] = sortedLayers.map((layer, _index) => ({
      id: crypto.randomUUID(),
      type: 'end' as const,
      imageUrl: layer.src,
      visualPrompt: layer.title,
      status: 'completed' as const,
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
      imageLayers: layers.filter((l) => l.type === 'image').length,
      videoLayers: layers.filter((l) => l.type === 'video').length,
      otherLayers: layers.filter((l) => !['image', 'video'].includes(l.type)).length,
    };
  }

  /**
   * 清空画布（会保存空状态到 IndexedDB，确保刷新后保持为空）
   */
  async clearCanvas(): Promise<void> {
    const { clearCanvas, offset, scale } = useCanvasStore.getState();
    clearCanvas();

    // 清除因清空画布触发的自动保存定时器
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.currentProjectId) {
      const projectId = this.currentProjectId;
      // 通过保存队列串行化：清空操作会等待之前的 auto-save 完成，undo 触发的 auto-save 会等待清空完成
      await this.enqueueSave(() => canvasSyncService.saveNow(projectId, [], offset, scale));
    }

    logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布已清空');
  }

  /**
   * 强制同步到云端
   * 用于关键节点：切换项目、退出、手动保存
   */
  async forceSync(): Promise<void> {
    logger.info(LogCategory.CANVAS, '[CanvasIntegration] 强制同步到云端');
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.enqueueSave(() => canvasSyncService.forceSync());
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
  /**
   * 加载并恢复画布数据到 Zustand store（内部实现）
   * 由 enter() 和 restoreCanvasState() 调用
   */
  private async _restoreCanvasState(): Promise<boolean> {
    try {
      // 注意：此方法仅从 enter() 内部的 loadingPromise 调用，
      // 或在 restoreCanvasState() 中调用。从 loadingPromise 内部
      // 调用时不应检查 isLoading/loadingPromise（否则会造成自引用死锁）。

      if (!this.currentProjectId) {
        logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法恢复画布数据');
        return false;
      }

      const canvasData = await canvasSyncService.load();

      if (!canvasData) {
        logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 未找到画布数据');
        return false;
      }

      logger.debug(
        LogCategory.CANVAS,
        `[CanvasIntegration] 加载画布数据，版本: ${canvasData.version}, 图层数: ${canvasData.layers.length}`,
      );

      await this.importCanvasData(canvasData);
      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 画布状态已恢复');

      // 只读完整性校验（R4）：不修改数据，只把问题暴露给用户
      const issues = validateCanvasIntegrity(canvasData.layers);
      if (issues.length > 0) {
        for (const issue of issues) {
          logger.warn(
            LogCategory.CANVAS,
            `[Integrity] ${issue.code} (${issue.severity}): ${issue.message}`,
            issue.layerId ? [issue.layerId] : [],
          );
        }
        useCanvasStore.getState().setIntegrityIssues(issues);
      } else {
        useCanvasStore.getState().setIntegrityIssues([]);
      }

      return true;
    } catch (error) {
      logger.error(LogCategory.CANVAS, '[CanvasIntegration] 恢复画布状态失败', error);
      return false;
    }
  }

  /**
   * 将 CanvasData 恢复到 Zustand store
   * 处理图层恢复（imageId → blob URL、video 恢复、drawing 恢复等）
   */
  private async importCanvasData(canvasData: CanvasData): Promise<void> {
    const { importLayers, setOffset, setScale } = useCanvasStore.getState();

    if (canvasData.layers && canvasData.layers.length > 0) {
      const restoredLayers = await Promise.all(
        canvasData.layers.map(async (layer) => {
          if (layer.type === 'image') {
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getImage(layer.imageId);
                if (blob) {
                  // 保留持久引用(local:/video:)，blob 仅用于校验资源存在，不写入 layer.src
                  return { ...layer };
                }
              } catch (e) {
                logger.warn(LogCategory.CANVAS, '恢复图片失败 (imageId):', e);
              }
            }

            if (layer.src && layer.src.startsWith('local:')) {
              try {
                const localId = layer.src.replace('local:', '');
                const blob = await unifiedImageService.getImage(localId);
                if (blob) {
                  // 保留持久引用(local:/video:)，blob 仅用于校验资源存在，不写入 layer.src
                  return { ...layer };
                }
              } catch (e) {
                logger.warn(LogCategory.CANVAS, '恢复图片失败 (local:):', e);
              }
            }
          } else if (layer.type === 'video') {
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getVideo(layer.imageId);
                if (blob) {
                  logger.info(
                    LogCategory.CANVAS,
                    '[CanvasIntegration] 恢复视频成功 (imageId):',
                    layer.imageId,
                  );
                  // 保留持久引用(local:/video:)，blob 仅用于校验资源存在，不写入 layer.src
                  return { ...layer };
                }
              } catch (e) {
                logger.warn(LogCategory.CANVAS, '恢复视频失败 (imageId):', e);
              }
            }
            if (layer.src && layer.src.startsWith('video:')) {
              try {
                const videoId = layer.src.replace('video:', '');
                const blob = await unifiedImageService.getVideo(videoId);
                if (blob) {
                  // 保留持久引用(local:/video:)，blob 仅用于校验资源存在，不写入 layer.src
                  return { ...layer };
                }
              } catch (e) {
                logger.warn(LogCategory.CANVAS, '恢复视频失败:', e);
              }
            }
          } else if (layer.type === 'panorama') {
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getImage(layer.imageId);
                if (blob) {
                  // 保留持久引用(local:/video:)，blob 仅用于校验资源存在，不写入 layer.src
                  return { ...layer };
                }
              } catch (e) {
                logger.warn(LogCategory.CANVAS, '恢复全景图失败 (imageId):', e);
              }
            }
            if (layer.src && layer.src.startsWith('local:')) {
              try {
                const localId = layer.src.replace('local:', '');
                const blob = await unifiedImageService.getImage(localId);
                if (blob) {
                  // 保留持久引用(local:/video:)，blob 仅用于校验资源存在，不写入 layer.src
                  return { ...layer };
                }
              } catch (e) {
                logger.warn(LogCategory.CANVAS, '恢复全景图失败 (local:):', e);
              }
            }
          } else if (layer.type === 'drawing') {
            logger.info(LogCategory.CANVAS, '[CanvasIntegration] 恢复 drawing 图层:', [
              layer.id,
              'imageId:',
              layer.imageId,
              'src:',
              layer.src?.substring(0, 50),
            ]);
            if (layer.imageId) {
              try {
                const blob = await unifiedImageService.getImage(layer.imageId);
                if (blob) {
                  logger.info(LogCategory.CANVAS, '[CanvasIntegration] 恢复 drawing 图层成功:', [
                    layer.id,
                    'blob size:',
                    blob.size,
                  ]);
                  // 保留持久引用(local:/video:)，blob 仅校验存在，不写入 layer.src
                  return { ...layer };
                } else {
                  logger.warn(
                    LogCategory.CANVAS,
                    '[CanvasIntegration] 恢复 drawing 图层失败: blob 为空',
                    [layer.id, layer.imageId],
                  );
                }
              } catch (e) {
                logger.warn(
                  LogCategory.CANVAS,
                  '[CanvasIntegration] 恢复绘制图层失败 (imageId):',
                  e,
                );
              }
            } else if (layer.src && layer.src.startsWith('data:')) {
              return layer;
            } else {
              logger.warn(
                LogCategory.CANVAS,
                '[CanvasIntegration] 恢复 drawing 图层失败: 没有 imageId 且 src 不是 data:',
                layer.id,
              );
            }
          }
          return layer;
        }),
      );

      if (restoredLayers.length > 0) {
        importLayers(restoredLayers, true);
      }
    }

    if (canvasData.offset) {
      setOffset(canvasData.offset);
    }

    if (canvasData.scale) {
      setScale(canvasData.scale);
    }
  }

  /**
   * 恢复画布状态（公开 API，供 "恢复" 按钮调用）
   *
   * 恢复优先级：
   * 1. sessionStorage 同步备份（beforeunload 时写入的最新数据）
   * 2. IndexedDB 本地数据（含云端同步）
   */
  async restoreCanvasState(): Promise<boolean> {
    if (!this.currentProjectId) {
      logger.debug(LogCategory.CANVAS, '[CanvasIntegration] 未设置项目ID，无法恢复画布数据');
      return false;
    }

    // 如果 enter() 仍在加载中，等待完成（防止与 loadingPromise 内部 _restoreCanvasState 竞态）
    if (this.isLoading && this.loadingPromise) {
      logger.info(LogCategory.CANVAS, '[CanvasIntegration] restoreCanvasState 等待 enter 完成...');
      await this.loadingPromise;
    }

    // 先检查 sessionStorage 备份
    const backup = this.restoreSessionBackup(this.currentProjectId);
    if (backup) {
      logger.info(
        LogCategory.CANVAS,
        '[CanvasIntegration] 从 sessionStorage 备份恢复画布（公开 restore）',
      );
      await this.importCanvasData(backup);
      return true;
    }

    // 回退到正常加载
    return this._restoreCanvasState();
  }

  /**
   * 清理资源（兼容旧接口，委托给 exit）
   *
   * 旧代码中 handleExitProject 会先调用 saveImmediately 再调用 cleanup。
   * 现在 exit() 内部已完成保存 + 清理，所以 cleanup 直接委托给 exit。
   * 多次调用安全（exit 有 !currentProjectId 防护）。
   */
  async cleanup(): Promise<void> {
    await this.exit();
  }
}

export const canvasIntegrationService = new CanvasIntegrationService();
