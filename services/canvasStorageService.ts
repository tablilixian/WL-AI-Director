/**
 * 画布数据存储服务
 * 
 * 负责画布数据的本地存储和同步管理
 * 采用 Local-First 架构：
 * - 本地实时保存
 * - 后台异步同步到云端
 * - 支持冲突解决（以最后一次保存为准）
 */

import { openDB } from './storageService';
import { DB_NAME, DB_VERSION, STORE_NAMES } from './dbConfig';
import { logger, LogCategory } from './logger';

/**
 * 画布数据接口
 */
export interface CanvasData {
  projectId: string;
  layers: any[];
  offset: { x: number; y: number };
  scale: number;
  savedAt: number;
  version: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

/**
 * 云端画布数据结构（用于同步）
 */
export interface CloudCanvasData {
  projectId: string;
  layers: any[];
  offset: { x: number; y: number };
  scale: number;
  savedAt: number;
  version: number;
  updatedAt?: string;
}

/**
 * 数据库连接缓存（确保使用同一个连接）
 */
let dbInstance: IDBDatabase | null = null;

/**
 * 获取数据库连接（带缓存）
 * 使用 storageService 的 openDB，确保数据库结构正确
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance && dbInstance.name === DB_NAME && dbInstance.version === DB_VERSION) {
    return dbInstance;
  }
  
  dbInstance = await openDB();
  console.log('[CanvasStorage] IndexedDB 连接成功，版本:', dbInstance.version);
  return dbInstance;
}

/**
 * 保存画布数据到本地 IndexedDB
 * 
 * @param projectId 项目ID
 * @param layers 图层数据
 * @param offset 画布偏移
 * @param scale 画布缩放
 * @returns 保存后的 CanvasData
 */
export async function saveCanvasDataToLocal(
  projectId: string,
  layers: any[],
  offset: { x: number; y: number },
  scale: number
): Promise<CanvasData> {
  console.log('[CanvasStorage] saveCanvasDataToLocal 被调用，projectId:', projectId);
  
  try {
    const db = await getDB();
    console.log('[CanvasStorage] IndexedDB 连接成功');
    
    if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] CANVAS_DATA store 不存在，无法保存`);
      throw new Error('CANVAS_DATA store 不存在');
    }
    
    const existing = await getCanvasDataFromLocal(projectId);
    const newVersion = existing ? existing.version + 1 : 1;
    console.log('[CanvasStorage] 新版本号:', newVersion);
    
    const canvasData: CanvasData = {
      projectId,
      layers,
      offset,
      scale,
      savedAt: Date.now(),
      version: newVersion,
      syncStatus: 'pending'
    };
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.CANVAS_DATA, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.CANVAS_DATA);
      const request = store.put(canvasData);
      
      request.onsuccess = () => {
        logger.debug(LogCategory.CANVAS, `[CanvasStorage] 画布数据已保存到本地，项目: ${projectId}, 版本: ${newVersion}`);
        console.log('[CanvasStorage] 保存成功，版本:', newVersion);
        resolve(canvasData);
      };
      
      request.onerror = () => {
        logger.error(LogCategory.CANVAS, `[CanvasStorage] 保存画布数据失败: ${request.error}`);
        console.error('[CanvasStorage] 保存失败:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(LogCategory.CANVAS, `[CanvasStorage] saveCanvasDataToLocal 异常:`, error);
    throw error;
  }
}

/**
 * 从本地 IndexedDB 获取画布数据
 * 
 * @param projectId 项目ID
 * @returns 画布数据，如果不存在返回 null
 */
export async function getCanvasDataFromLocal(projectId: string): Promise<CanvasData | null> {
  try {
    const db = await getDB();
    
    if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] CANVAS_DATA store 不存在，返回 null`);
      return null;
    }
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.CANVAS_DATA, 'readonly');
      const store = tx.objectStore(STORE_NAMES.CANVAS_DATA);
      const request = store.get(projectId);
      
      request.onsuccess = () => {
        if (request.result) {
          logger.debug(LogCategory.CANVAS, `[CanvasStorage] 从本地加载画布数据，项目: ${projectId}, 版本: ${request.result.version}`);
        }
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        logger.error(LogCategory.CANVAS, `[CanvasStorage] 获取画布数据失败: ${request.error}`);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(LogCategory.CANVAS, `[CanvasStorage] getCanvasDataFromLocal 异常:`, error);
    return null;
  }
}

/**
 * 删除本地画布数据
 * 
 * @param projectId 项目ID
 */
export async function deleteCanvasDataFromLocal(projectId: string): Promise<void> {
  try {
    const db = await getDB();
    
    if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] CANVAS_DATA store 不存在，无需删除`);
      return;
    }
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.CANVAS_DATA, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.CANVAS_DATA);
      const request = store.delete(projectId);
      
      request.onsuccess = () => {
        logger.debug(LogCategory.CANVAS, `[CanvasStorage] 删除本地画布数据，项目: ${projectId}`);
        resolve();
      };
      
      request.onerror = () => {
        logger.error(LogCategory.CANVAS, `[CanvasStorage] 删除画布数据失败: ${request.error}`);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(LogCategory.CANVAS, `[CanvasStorage] deleteCanvasDataFromLocal 异常:`, error);
  }
}

/**
 * 获取所有待同步的画布数据
 * 
 * @returns 待同步的画布数据列表
 */
export async function getPendingSyncCanvasData(): Promise<CanvasData[]> {
  try {
    const db = await getDB();
    
    if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] CANVAS_DATA store 不存在，返回空列表`);
      return [];
    }
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.CANVAS_DATA, 'readonly');
      const store = tx.objectStore(STORE_NAMES.CANVAS_DATA);
      const index = store.index('syncStatus');
      const request = index.getAll('pending');
      
      request.onsuccess = () => {
        logger.debug(LogCategory.CANVAS, `[CanvasStorage] 获取到 ${request.result.length} 条待同步画布数据`);
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        logger.error(LogCategory.CANVAS, `[CanvasStorage] 获取待同步画布数据失败: ${request.error}`);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(LogCategory.CANVAS, `[CanvasStorage] getPendingSyncCanvasData 异常:`, error);
    return [];
  }
}

/**
 * 更新同步状态
 * 
 * @param projectId 项目ID
 * @param status 新的同步状态
 */
export async function updateCanvasSyncStatus(
  projectId: string,
  status: 'synced' | 'pending' | 'conflict'
): Promise<void> {
  try {
    const db = await getDB();
    
    if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] CANVAS_DATA store 不存在，无法更新状态`);
      return;
    }
    
    const existing = await getCanvasDataFromLocal(projectId);
    
    if (!existing) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] 画布数据不存在，无法更新状态: ${projectId}`);
      return;
    }
    
    const updated: CanvasData = {
      ...existing,
      syncStatus: status
    };
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.CANVAS_DATA, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.CANVAS_DATA);
      const request = store.put(updated);
      
      request.onsuccess = () => {
        logger.debug(LogCategory.CANVAS, `[CanvasStorage] 更新同步状态: ${projectId} -> ${status}`);
        resolve();
      };
      
      request.onerror = () => {
        logger.error(LogCategory.CANVAS, `[CanvasStorage] 更新同步状态失败: ${request.error}`);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(LogCategory.CANVAS, `[CanvasStorage] updateCanvasSyncStatus 异常:`, error);
  }
}

/**
 * 检查本地和云端数据，确定是否需要同步
 * 
 * @param localData 本地画布数据
 * @param cloudData 云端画布数据
 * @returns 同步方向: 'upload' | 'download' | 'none'
 */
export function determineSyncDirection(
  localData: CanvasData | null,
  cloudData: CloudCanvasData | null
): 'upload' | 'download' | 'none' {
  // 情况1: 本地有，云端没有 -> 上传
  if (localData && !cloudData) {
    return 'upload';
  }
  
  // 情况2: 云端有，本地没有 -> 下载
  if (!localData && cloudData) {
    return 'download';
  }
  
  // 情况3: 都没有 -> 无需同步
  if (!localData && !cloudData) {
    return 'none';
  }
  
  // 情况4: 都有 -> 比较版本号
  if (localData && cloudData) {
    if (localData.version > cloudData.version) {
      return 'upload';
    } else if (cloudData.version > localData.version) {
      return 'download';
    } else {
      // 版本相同，比较时间戳
      if (localData.savedAt > cloudData.savedAt) {
        return 'upload';
      } else if (cloudData.savedAt > localData.savedAt) {
        return 'download';
      }
    }
  }
  
  return 'none';
}

/**
 * 保存云端画布数据到本地（用于下载覆盖）
 * 
 * @param cloudData 云端画布数据
 */
export async function saveCloudCanvasDataToLocal(cloudData: CloudCanvasData): Promise<void> {
  try {
    const canvasData: CanvasData = {
      ...cloudData,
      syncStatus: 'synced'
    };
    
    const db = await getDB();
    
    if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
      logger.warn(LogCategory.CANVAS, `[CanvasStorage] CANVAS_DATA store 不存在，无法保存云端数据`);
      return;
    }
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES.CANVAS_DATA, 'readwrite');
      const store = tx.objectStore(STORE_NAMES.CANVAS_DATA);
      const request = store.put(canvasData);
      
      request.onsuccess = () => {
        logger.debug(LogCategory.CANVAS, `[CanvasStorage] 云端画布数据已保存到本地，项目: ${cloudData.projectId}`);
        resolve();
      };
      
      request.onerror = () => {
        logger.error(LogCategory.CANVAS, `[CanvasStorage] 保存云端画布数据失败: ${request.error}`);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(LogCategory.CANVAS, `[CanvasStorage] saveCloudCanvasDataToLocal 异常:`, error);
  }
}
