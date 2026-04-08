/**
 * 画布同步服务
 * 
 * 职责：
 * 1. 管理本地保存（高频）
 * 2. 管理云端同步（低频）
 * 3. 处理冲突检测
 * 4. 提供降级方案
 * 
 * 设计原则：Local-First
 * - 本地保存是必须成功的
 * - 云端同步是可选的，失败不影响本地功能
 */

import { logger, LogCategory } from './logger';
import { useAuthStore } from '../src/stores/authStore';
import {
  saveCanvasDataToLocal,
  getCanvasDataFromLocal,
  updateCanvasSyncStatus,
  deleteCanvasDataFromLocal,
  CanvasData,
} from './canvasStorageService';
import { canvasCloudApi, CloudCanvasData } from './canvasCloudApi';

/**
 * 同步配置
 */
interface SyncConfig {
  localSaveDebounce: number;
  cloudSyncMinInterval: number;
  cloudSyncDelay: number;
  cloudSyncRetryTimes: number;
  cloudSyncRetryDelay: number;
  cloudSyncEnabled: boolean;
}

/**
 * 冲突解决策略
 */
export enum ConflictResolution {
  USE_LOCAL = 'use_local',
  USE_CLOUD = 'use_cloud',
  ASK_USER = 'ask_user',
}

/**
 * 同步状态
 */
interface SyncState {
  dirty: boolean;
  lastLocalSave: number;
  lastCloudSync: number;
  syncInProgress: boolean;
}

/**
 * 云端同步配置存储键
 */
const CLOUD_SYNC_CONFIG_KEY = 'wl-canvas-cloud-sync-config';

/**
 * 获取云端同步配置
 */
function getStoredSyncConfig(): { enabled: boolean } {
  try {
    const stored = localStorage.getItem(CLOUD_SYNC_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return { enabled: true };
}

/**
 * 画布同步服务类
 */
class CanvasSyncService {
  private config: SyncConfig = {
    localSaveDebounce: 500,
    cloudSyncMinInterval: 30000,
    cloudSyncDelay: 10000,
    cloudSyncRetryTimes: 3,
    cloudSyncRetryDelay: 5000,
    cloudSyncEnabled: true,
  };

  private state: SyncState = {
    dirty: false,
    lastLocalSave: 0,
    lastCloudSync: 0,
    syncInProgress: false,
  };

  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private currentProjectId: string | null = null;
  private debouncedSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSaveData: { layers: any[]; offset: { x: number; y: number }; scale: number } | null = null;

  constructor() {
    this.config.cloudSyncEnabled = getStoredSyncConfig().enabled;
  }

  /**
   * 初始化 - 进入项目时调用
   */
  async init(projectId: string): Promise<void> {
    logger.debug(LogCategory.CANVAS, `[CanvasSync] 初始化，项目: ${projectId}`);
    
    this.currentProjectId = projectId;
    this.state = {
      dirty: false,
      lastLocalSave: 0,
      lastCloudSync: 0,
      syncInProgress: false,
    };

    // 检查是否有待同步的数据（上次未完成）
    const localData = await getCanvasDataFromLocal(projectId);
    if (localData && localData.syncStatus === 'pending') {
      logger.debug(LogCategory.CANVAS, `[CanvasSync] 发现待同步数据，尝试后台同步`);
      this.scheduleCloudSync();
    }
  }

  /**
   * 保存画布状态 - 用户操作时调用
   * 本地立即保存，云端延迟同步
   * 
   * @param projectId 项目ID（必须传入，确保数据正确关联）
   * @param layers 图层数据
   * @param offset 画布偏移
   * @param scale 画布缩放
   */
  async save(
    projectId: string,
    layers: any[],
    offset: { x: number; y: number },
    scale: number
  ): Promise<void> {
    if (!projectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasSync] 项目ID为空，无法保存');
      return;
    }

    // 更新当前项目ID
    this.currentProjectId = projectId;
    this.pendingSaveData = { layers, offset, scale };

    // 清除之前的防抖定时器
    if (this.debouncedSaveTimer) {
      clearTimeout(this.debouncedSaveTimer);
    }

    // 防抖保存
    this.debouncedSaveTimer = setTimeout(() => {
      this.doSave();
    }, this.config.localSaveDebounce);
  }

  /**
   * 执行保存
   */
  private async doSave(): Promise<void> {
    if (!this.currentProjectId || !this.pendingSaveData) {
      return;
    }

    const { layers, offset, scale } = this.pendingSaveData;
    this.pendingSaveData = null;

    try {
      // 1. 保存到本地 IndexedDB（必须成功）
      const canvasData = await saveCanvasDataToLocal(
        this.currentProjectId,
        layers,
        offset,
        scale
      );

      this.state.lastLocalSave = Date.now();
      this.state.dirty = true;

      logger.debug(
        LogCategory.CANVAS,
        `[CanvasSync] 本地保存成功，项目: ${this.currentProjectId}, 版本: ${canvasData.version}`
      );

      // 2. 调度云端同步（延迟执行）
      this.scheduleCloudSync();
    } catch (error) {
      // 本地保存失败是严重错误，需要抛出
      logger.error(LogCategory.CANVAS, '[CanvasSync] 本地保存失败:', error);
      throw error;
    }
  }

  /**
   * 调度云端同步
   */
  private scheduleCloudSync(): void {
    if (!this.config.cloudSyncEnabled) {
      return;
    }

    // 清除之前的定时器
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    // 检查最小间隔
    const timeSinceLastSync = Date.now() - this.state.lastCloudSync;
    const delay = Math.max(
      this.config.cloudSyncDelay,
      this.config.cloudSyncMinInterval - timeSinceLastSync
    );

    this.syncTimer = setTimeout(() => {
      this.doCloudSync();
    }, delay);
  }

  /**
   * 执行云端同步
   */
  private async doCloudSync(): Promise<void> {
    if (!this.currentProjectId) {
      return;
    }

    // 检查是否启用云端同步
    if (!this.config.cloudSyncEnabled) {
      logger.debug(LogCategory.CANVAS, '[CanvasSync] 云端同步已禁用，跳过');
      return;
    }

    // 检查是否有脏数据
    if (!this.state.dirty) {
      logger.debug(LogCategory.CANVAS, '[CanvasSync] 无脏数据，跳过同步');
      return;
    }

    // 检查用户登录状态
    const { user } = useAuthStore.getState();
    if (!user) {
      logger.debug(LogCategory.CANVAS, '[CanvasSync] 用户未登录，跳过云端同步');
      return;
    }

    // 防止重复同步
    if (this.state.syncInProgress) {
      logger.debug(LogCategory.CANVAS, '[CanvasSync] 同步进行中，跳过');
      return;
    }

    this.state.syncInProgress = true;

    try {
      // 获取本地数据
      const localData = await getCanvasDataFromLocal(this.currentProjectId);
      if (!localData) {
        logger.warn(LogCategory.CANVAS, '[CanvasSync] 本地无数据，跳过同步');
        return;
      }

      // 上传到云端
      await this.uploadToCloud(localData);

      // 更新同步状态
      await updateCanvasSyncStatus(this.currentProjectId, 'synced');
      
      this.state.dirty = false;
      this.state.lastCloudSync = Date.now();

      logger.debug(
        LogCategory.CANVAS,
        `[CanvasSync] 云端同步成功，项目: ${this.currentProjectId}`
      );
    } catch (error) {
      logger.error(LogCategory.CANVAS, '[CanvasSync] 云端同步失败:', error);
      
      // 标记为待同步，下次重试
      await updateCanvasSyncStatus(this.currentProjectId, 'pending');
    } finally {
      this.state.syncInProgress = false;
    }
  }

  /**
   * 上传到云端（带重试）
   */
  private async uploadToCloud(data: CanvasData): Promise<void> {
    const cloudData: CloudCanvasData = {
      projectId: data.projectId,
      layers: data.layers,
      offset: data.offset,
      scale: data.scale,
      version: data.version,
      savedAt: data.savedAt,
    };

    let lastError: Error | null = null;

    for (let i = 0; i < this.config.cloudSyncRetryTimes; i++) {
      try {
        await canvasCloudApi.save(cloudData);
        return; // 成功
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          LogCategory.CANVAS,
          `[CanvasSync] 上传失败，第 ${i + 1} 次重试:`,
          error
        );

        if (i < this.config.cloudSyncRetryTimes - 1) {
          await this.delay(this.config.cloudSyncRetryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * 强制同步云端 - 关键节点调用
   */
  async forceSync(): Promise<void> {
    logger.debug(LogCategory.CANVAS, '[CanvasSync] 强制同步');

    // 取消定时器，立即执行
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    // 先执行待处理的保存
    if (this.debouncedSaveTimer) {
      clearTimeout(this.debouncedSaveTimer);
      this.debouncedSaveTimer = null;
    }

    if (this.pendingSaveData) {
      await this.doSave();
    }

    // 强制同步
    if (this.state.dirty) {
      await this.doCloudSync();
    }
  }

  /**
   * 加载画布状态 - 进入项目时调用
   * 会检查本地和云端数据，决定使用哪个版本
   */
  async load(): Promise<CanvasData | null> {
    if (!this.currentProjectId) {
      logger.warn(LogCategory.CANVAS, '[CanvasSync] 未初始化项目ID，无法加载');
      return null;
    }

    logger.debug(LogCategory.CANVAS, `[CanvasSync] 加载画布数据，项目: ${this.currentProjectId}`);

    // 1. 获取本地数据
    const localData = await getCanvasDataFromLocal(this.currentProjectId);

    // 2. 检查是否启用云端同步
    if (!this.config.cloudSyncEnabled) {
      logger.debug(LogCategory.CANVAS, '[CanvasSync] 云端同步已禁用，使用本地数据');
      return localData;
    }

    // 3. 检查用户登录状态
    const { user } = useAuthStore.getState();
    if (!user) {
      logger.debug(LogCategory.CANVAS, '[CanvasSync] 用户未登录，使用本地数据');
      return localData;
    }

    // 4. 尝试获取云端数据
    try {
      const cloudData = await canvasCloudApi.get(this.currentProjectId);

      // 5. 决定使用哪个版本
      const resolution = this.determineSyncDirection(localData, cloudData);

      switch (resolution) {
        case ConflictResolution.USE_LOCAL:
          logger.debug(LogCategory.CANVAS, '[CanvasSync] 使用本地数据');
          // 如果本地有 pending 状态，尝试上传
          if (localData && localData.syncStatus === 'pending') {
            this.scheduleCloudSync();
          }
          return localData;

        case ConflictResolution.USE_CLOUD:
          logger.debug(LogCategory.CANVAS, '[CanvasSync] 使用云端数据');
          // 下载云端数据到本地
          if (cloudData) {
            await this.downloadFromCloud(cloudData);
            return await getCanvasDataFromLocal(this.currentProjectId);
          }
          return null;

        case ConflictResolution.ASK_USER:
          // 暂时使用本地数据，标记冲突
          logger.warn(LogCategory.CANVAS, '[CanvasSync] 检测到冲突，使用本地数据');
          if (localData) {
            await updateCanvasSyncStatus(this.currentProjectId, 'conflict');
          }
          return localData;

        default:
          return localData;
      }
    } catch (error) {
      logger.error(LogCategory.CANVAS, '[CanvasSync] 获取云端数据失败，使用本地数据:', error);
      return localData;
    }
  }

  /**
   * 确定同步方向
   */
  private determineSyncDirection(
    localData: CanvasData | null,
    cloudData: CloudCanvasData | null
  ): ConflictResolution {
    // 情况1: 本地有，云端没有 -> 使用本地
    if (localData && !cloudData) {
      return ConflictResolution.USE_LOCAL;
    }

    // 情况2: 云端有，本地没有 -> 使用云端
    if (!localData && cloudData) {
      return ConflictResolution.USE_CLOUD;
    }

    // 情况3: 都没有 -> 无数据
    if (!localData && !cloudData) {
      return ConflictResolution.USE_LOCAL;
    }

    // 情况4: 都有 -> 比较版本
    if (localData && cloudData) {
      // 如果本地有待同步数据，优先使用本地
      if (localData.syncStatus === 'pending') {
        return ConflictResolution.USE_LOCAL;
      }

      // 版本差距过大，需要用户决定
      if (Math.abs(localData.version - cloudData.version) > 10) {
        return ConflictResolution.ASK_USER;
      }

      // 版本相同，比较时间戳
      if (localData.version === cloudData.version) {
        return localData.savedAt >= cloudData.savedAt
          ? ConflictResolution.USE_LOCAL
          : ConflictResolution.USE_CLOUD;
      }

      // 版本不同，使用版本号更高的
      return localData.version > cloudData.version
        ? ConflictResolution.USE_LOCAL
        : ConflictResolution.USE_CLOUD;
    }

    return ConflictResolution.USE_LOCAL;
  }

  /**
   * 从云端下载数据到本地
   */
  private async downloadFromCloud(cloudData: CloudCanvasData): Promise<void> {
    const { saveCloudCanvasDataToLocal } = await import('./canvasStorageService');
    await saveCloudCanvasDataToLocal(cloudData);
    logger.debug(LogCategory.CANVAS, `[CanvasSync] 云端数据已下载到本地，项目: ${cloudData.projectId}`);
  }

  /**
   * 清理 - 退出项目时调用
   */
  async cleanup(): Promise<void> {
    logger.debug(LogCategory.CANVAS, `[CanvasSync] 清理，项目: ${this.currentProjectId}`);

    // 清除定时器
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.debouncedSaveTimer) {
      clearTimeout(this.debouncedSaveTimer);
      this.debouncedSaveTimer = null;
    }

    // 执行待处理的保存
    if (this.pendingSaveData) {
      await this.doSave();
    }

    this.currentProjectId = null;
    this.pendingSaveData = null;
    this.state = {
      dirty: false,
      lastLocalSave: 0,
      lastCloudSync: 0,
      syncInProgress: false,
    };
  }

  /**
   * 设置云端同步开关
   */
  setCloudSyncEnabled(enabled: boolean): void {
    this.config.cloudSyncEnabled = enabled;
    localStorage.setItem(
      CLOUD_SYNC_CONFIG_KEY,
      JSON.stringify({ enabled })
    );
    logger.debug(LogCategory.CANVAS, `[CanvasSync] 云端同步已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 获取云端同步开关状态
   */
  isCloudSyncEnabled(): boolean {
    return this.config.cloudSyncEnabled;
  }

  /**
   * 获取当前同步状态
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * 删除画布数据（本地和云端）
   */
  async deleteCanvasData(projectId: string): Promise<void> {
    logger.debug(LogCategory.CANVAS, `[CanvasSync] 删除画布数据，项目: ${projectId}`);

    // 删除本地数据
    await deleteCanvasDataFromLocal(projectId);

    // 如果启用云端同步且已登录，删除云端数据
    if (this.config.cloudSyncEnabled) {
      const { user } = useAuthStore.getState();
      if (user) {
        try {
          await canvasCloudApi.delete(projectId);
          logger.debug(LogCategory.CANVAS, `[CanvasSync] 云端画布数据已删除，项目: ${projectId}`);
        } catch (error) {
          // 云端删除失败不影响本地
          logger.error(LogCategory.CANVAS, '[CanvasSync] 删除云端数据失败:', error);
        }
      }
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 画布同步服务实例
 */
export const canvasSyncService = new CanvasSyncService();
