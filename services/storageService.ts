import { ProjectState, AssetLibraryItem } from '../types';
import { DB_NAME, DB_VERSION, STORE_NAMES, storageConfig } from './dbConfig';
import { logger, LogCategory } from './logger';
import { migrateProject, needsMigration } from '../utils/dataMigration';

const EXPORT_SCHEMA_VERSION = 1;

export interface IndexedDBExportPayload {
  schemaVersion: number;
  exportedAt: number;
  scope?: 'all' | 'project';
  dbName: string;
  dbVersion: number;
  stores: {
    projects: ProjectState[];
    assetLibrary: AssetLibraryItem[];
  };
}

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECTS)) {
        db.createObjectStore(STORE_NAMES.PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.ASSET_LIBRARY)) {
        db.createObjectStore(STORE_NAMES.ASSET_LIBRARY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.IMAGES)) {
        const store = db.createObjectStore(STORE_NAMES.IMAGES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.VIDEOS)) {
        const store = db.createObjectStore(STORE_NAMES.VIDEOS, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECT_STAGES)) {
        db.createObjectStore(STORE_NAMES.PROJECT_STAGES, { keyPath: 'projectId' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.CANVAS_DATA)) {
        const store = db.createObjectStore(STORE_NAMES.CANVAS_DATA, { keyPath: 'projectId' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
        store.createIndex('version', 'version', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
      }
    };
  });
};

const isValidExportPayload = (data: unknown): data is IndexedDBExportPayload => {
  const payload = data as IndexedDBExportPayload;
  return !!(
    payload &&
    payload.stores &&
    Array.isArray(payload.stores.projects) &&
    Array.isArray(payload.stores.assetLibrary)
  );
};

export const exportIndexedDBData = async (): Promise<IndexedDBExportPayload> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAMES.PROJECTS, STORE_NAMES.ASSET_LIBRARY], 'readonly');
    const projectStore = tx.objectStore(STORE_NAMES.PROJECTS);
    const assetStore = tx.objectStore(STORE_NAMES.ASSET_LIBRARY);

    const projectsRequest = projectStore.getAll();
    const assetsRequest = assetStore.getAll();

    projectsRequest.onerror = () => reject(projectsRequest.error);
    assetsRequest.onerror = () => reject(assetsRequest.error);

    tx.oncomplete = () => {
      resolve({
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: Date.now(),
        scope: 'all',
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        stores: {
          projects: (projectsRequest.result as ProjectState[]) || [],
          assetLibrary: (assetsRequest.result as AssetLibraryItem[]) || []
        }
      });
    };

    tx.onerror = () => reject(tx.error);
  });
};

export const exportProjectData = async (project: ProjectState): Promise<IndexedDBExportPayload> => {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    scope: 'project',
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    stores: {
      projects: [project],
      assetLibrary: []
    }
  };
};

export const importIndexedDBData = async (
  payload: unknown,
  options?: { mode?: 'merge' | 'replace' }
): Promise<{ projects: number; assets: number }> => {
  if (!isValidExportPayload(payload)) {
    throw new Error('导入文件格式不正确');
  }

  const mode = options?.mode || 'merge';
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAMES.PROJECTS, STORE_NAMES.ASSET_LIBRARY], 'readwrite');
    const projectStore = tx.objectStore(STORE_NAMES.PROJECTS);
    const assetStore = tx.objectStore(STORE_NAMES.ASSET_LIBRARY);

    if (mode === 'replace') {
      projectStore.clear();
      assetStore.clear();
    }

    let projectsWritten = 0;
    let assetsWritten = 0;

    payload.stores.projects.forEach(project => {
      // Migration: veo-r2v 模型已下线，迁移为 veo
      if (project.shots) {
        project.shots.forEach((shot: any) => {
          if (shot.videoModel === 'veo-r2v') {
            shot.videoModel = 'veo';
          }
        });
      }
      const request = projectStore.put(project);
      request.onsuccess = () => {
        projectsWritten += 1;
      };
      request.onerror = () => reject(request.error);
    });

    payload.stores.assetLibrary.forEach(item => {
      const request = assetStore.put(item);
      request.onsuccess = () => {
        assetsWritten += 1;
      };
      request.onerror = () => reject(request.error);
    });

    tx.oncomplete = () => resolve({ projects: projectsWritten, assets: assetsWritten });
    tx.onerror = () => reject(tx.error);
  });
};

export const saveProjectToDB = async (project: ProjectState): Promise<void> => {
  if (!storageConfig.enabled) { logger.debug(LogCategory.STORAGE, '本地存储已禁用'); return; }
  
  logger.debug(LogCategory.STORAGE, '💾 开始保存项目到 IndexedDB:', project.title);
  const db = await openDB();
  logger.debug(LogCategory.STORAGE, '✅ IndexedDB 数据库已打开');
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.PROJECTS);
    const p = { ...project, lastModified: Date.now() };
    logger.debug(LogCategory.STORAGE, '💾 正在执行 put 操作...');
    const request = store.put(p);
    request.onsuccess = () => {
      logger.debug(LogCategory.STORAGE, '✅ IndexedDB put 操作成功');
      resolve();
    };
    request.onerror = () => {
      logger.error(LogCategory.STORAGE, '❌ IndexedDB put 操作失败:', request.error);
      reject(request.error);
    };
  });
};

export const loadProjectFromDB = async (id: string): Promise<ProjectState> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_NAMES.PROJECTS);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) {
        const project = request.result;
        
        // Migration: ensure renderLogs exists for old projects
        if (!project.renderLogs) {
          project.renderLogs = [];
        }
        
        // Migration: ensure scriptData.props exists for old projects
        if (project.scriptData && !project.scriptData.props) {
          project.scriptData.props = [];
        }
        
        // Migration: veo-r2v 模型已下线，迁移为 veo
        let migrated = false;
        if (project.shots) {
          project.shots.forEach((shot: any) => {
            if (shot.videoModel === 'veo-r2v') {
              shot.videoModel = 'veo';
              migrated = true;
            }
          });
        }
        
        // Migration: 图片字段统一 (referenceImage -> imageUrl)
        if (needsMigration(project)) {
          const migratedProject = migrateProject(project);
          Object.assign(project, migratedProject);
          migrated = true;
          logger.debug(LogCategory.STORAGE, `🔄 项目 "${project.title}" 已迁移图片字段格式`);
        }
        
        // 如果发生了迁移，异步回写 IndexedDB，避免每次加载都重复执行
        if (migrated) {
          openDB().then(writeDb => {
            const writeTx = writeDb.transaction(STORE_NAMES.PROJECTS, 'readwrite');
            writeTx.objectStore(STORE_NAMES.PROJECTS).put(project);
            logger.debug(LogCategory.STORAGE, `🔄 项目 "${project.title}" 已迁移旧数据格式`);
          }).catch(() => { /* 回写失败不影响运行 */ });
        }
        resolve(project);
      }
      else reject(new Error("Project not found"));
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjectsMetadata = async (): Promise<ProjectState[]> => {
  logger.debug(LogCategory.STORAGE, '📋 getAllProjectsMetadata 开始执行');
  const db = await openDB();
  logger.debug(LogCategory.STORAGE, '✅ 数据库已打开');
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_NAMES.PROJECTS);
    const request = store.getAll(); 
    
    request.onsuccess = () => {
       const projects = request.result as ProjectState[];
       logger.debug(LogCategory.STORAGE, `✅ 从 IndexedDB 获取到 ${projects.length} 个项目`);
       // Sort by last modified descending
       projects.sort((a, b) => b.lastModified - a.lastModified);
       logger.debug(LogCategory.STORAGE, '✅ 项目列表已排序');
       resolve(projects);
    };
    
    request.onerror = () => {
      logger.error(LogCategory.STORAGE, '❌ 获取项目失败:', request.error);
      reject(request.error);
    };
  });
};

// =========================
// Asset Library Operations
// =========================

export const saveAssetToLibrary = async (item: AssetLibraryItem): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.ASSET_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.ASSET_LIBRARY);
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllAssetLibraryItems = async (): Promise<AssetLibraryItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.ASSET_LIBRARY, 'readonly');
    const store = tx.objectStore(STORE_NAMES.ASSET_LIBRARY);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as AssetLibraryItem[]) || [];
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteAssetFromLibrary = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.ASSET_LIBRARY, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.ASSET_LIBRARY);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 从IndexedDB中删除项目及其所有关联资源
 * 由于所有媒体资源（图片、视频）都以Base64格式存储在项目对象内部，
 * 删除项目记录时会自动清理所有相关资源：
 * - 角色参考图 (Character.referenceImage)
 * - 角色变体参考图 (CharacterVariation.referenceImage)
 * - 场景参考图 (Scene.referenceImage)
 * - 关键帧图像 (Keyframe.imageUrl)
 * - 视频片段 (VideoInterval.videoUrl)
 * - 渲染日志 (RenderLog[])
 * @param id - 项目ID
 */
  export const deleteProjectFromDB = async (id: string): Promise<void> => {
  // 验证项目ID
  if (!id || typeof id !== 'string') {
    logger.error(LogCategory.STORAGE, '❌ 无效的项目ID:', id);
    throw new Error('无效的项目ID');
  }
  
  logger.debug(LogCategory.STORAGE, `🗑️ 开始删除项目: ${id}`);
  
  const db = await openDB();
  
  // 先获取项目信息以便记录删除的资源统计
  let project: ProjectState | null = null;
  try {
    project = await loadProjectFromDB(id);
  } catch (e) {
    logger.warn(LogCategory.STORAGE, '无法加载项目信息，直接删除');
  }
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.PROJECTS);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      if (project) {
        // 统计被删除的资源
        let resourceCount = {
          characters: 0,
          characterVariations: 0,
          scenes: 0,
          props: 0,
          keyframes: 0,
          videos: 0,
          renderLogs: project.renderLogs?.length || 0
        };
        
        if (project.scriptData) {
          resourceCount.characters = project.scriptData.characters.filter(c => c.imageUrl).length;
          resourceCount.scenes = project.scriptData.scenes.filter(s => s.imageUrl).length;
          resourceCount.props = (project.scriptData.props || []).filter(p => p.imageUrl).length;
          
          project.scriptData.characters.forEach(c => {
            if (c.variations) {
              resourceCount.characterVariations += c.variations.filter(v => v.imageUrl).length;
            }
          });
        }
        
        if (project.shots) {
          project.shots.forEach(shot => {
            if (shot.keyframes) {
              resourceCount.keyframes += shot.keyframes.filter(kf => kf.imageUrl).length;
            }
            if (shot.interval?.videoUrl) {
              resourceCount.videos++;
            }
          });
        }
        
        logger.info(LogCategory.STORAGE, `✅ 项目已删除: ${project.title}`);
        logger.info(LogCategory.STORAGE, `📊 清理的资源统计:`, resourceCount);
        logger.info(LogCategory.STORAGE, `   - 角色参考图: ${resourceCount.characters}个`);
        logger.info(LogCategory.STORAGE, `   - 角色变体图: ${resourceCount.characterVariations}个`);
        logger.info(LogCategory.STORAGE, `   - 场景参考图: ${resourceCount.scenes}个`);
        logger.info(LogCategory.STORAGE, `   - 道具参考图: ${resourceCount.props}个`);
        logger.info(LogCategory.STORAGE, `   - 关键帧图像: ${resourceCount.keyframes}个`);
        logger.info(LogCategory.STORAGE, `   - 视频片段: ${resourceCount.videos}个`);
        logger.info(LogCategory.STORAGE, `   - 渲染日志: ${resourceCount.renderLogs}条`);
      } else {
        logger.info(LogCategory.STORAGE, `✅ 项目已删除: ${id}`);
      }
      
      resolve();
    };
    
    request.onerror = () => {
      logger.error(LogCategory.STORAGE, `❌ 删除项目失败: ${id}`, request.error);
      reject(request.error);
    };
  });
};

/**
 * Convert a File object (image) to Base64 data URL
 * @param file - Image file to convert
 * @returns Promise<string> - Base64 data URL (e.g., "data:image/png;base64,...")
 */
export const convertImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      reject(new Error('只支持图片文件'));
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      reject(new Error('图片大小不能超过 10MB'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error('图片读取失败'));
    };
    
    reader.readAsDataURL(file);
  });
};

// Initial template for new projects
export const createNewProjectState = (): ProjectState => {
  const id = crypto.randomUUID();
  return {
    id,
    title: '未命名项目',
    createdAt: Date.now(),
    lastModified: Date.now(),
    version: 1,
    stage: 'script',
    targetDuration: '60s',
    language: '中文',
    visualStyle: 'live-action',
    shotGenerationModel: 'gpt-5.1',
    rawScript: `标题：示例剧本

场景 1
外景。夜晚街道 - 雨夜
霓虹灯在水坑中反射出破碎的光芒。
侦探（30岁,穿着风衣）站在街角,点燃了一支烟。

侦探
这雨什么时候才会停？`,
    scriptData: null,
    shots: [],
    isParsingScript: false,
    renderLogs: [],
  };
};

// ============================================
// Stage 专用存储（避免频繁云端同步）
// ============================================

/**
 * 保存项目的当前 stage 到单独的 store
 * 这样 stage 变化不会触发完整的项目云端同步
 */
export const saveCurrentStage = async (projectId: string, stage: string): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.PROJECT_STAGES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.PROJECT_STAGES);
    await store.put({ projectId, stage, updatedAt: Date.now() });
    logger.debug(LogCategory.STORAGE, `Stage 已保存: ${projectId} -> ${stage}`);
  } catch (error) {
    logger.error(LogCategory.STORAGE, '保存 stage 失败:', error);
  }
};

/**
 * 获取项目的当前 stage
 * 如果没有保存过，返回默认值 'script'
 */
export const getCurrentStage = async (projectId: string): Promise<string> => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAMES.PROJECT_STAGES, 'readonly');
      const store = tx.objectStore(STORE_NAMES.PROJECT_STAGES);
      const request = store.get(projectId);
      request.onsuccess = () => {
        const result = request.result as { projectId: string; stage: string; updatedAt: number } | undefined;
        resolve(result?.stage || 'script');
      };
      request.onerror = () => {
        logger.error(LogCategory.STORAGE, '获取 stage 失败:', request.error);
        resolve('script');
      };
    });
  } catch (error) {
    logger.error(LogCategory.STORAGE, '获取 stage 失败:', error);
    return 'script';
  }
};

/**
 * 删除项目的 stage 记录
 * 用于删除项目时清理数据
 */
export const deleteProjectStage = async (projectId: string): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.PROJECT_STAGES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.PROJECT_STAGES);
    await store.delete(projectId);
    logger.debug(LogCategory.STORAGE, `Stage 已删除: ${projectId}`);
  } catch (error) {
    logger.error(LogCategory.STORAGE, '删除 stage 失败:', error);
  }
};
