// ============================================================================
// 历史遗留数据处理（已废弃）
// ============================================================================
// 用于从 BigBananaDB 迁移到 WLDB，以及处理旧格式 ID (proj_xxx)
// 正式版本可删除此部分代码
// ============================================================================

/*
import { logger, LogCategory } from './logger';

const OLD_DB_NAME = 'BigBananaDB';
const OLD_DB_VERSION = 6;
const NEW_DB_NAME = 'WLDB';

const STORE_NAMES = {
  PROJECTS: 'projects',
  ASSET_LIBRARY: 'assetLibrary',
  IMAGES: 'images',
  VIDEOS: 'videos',
  PROJECT_STAGES: 'projectStages'
} as const;

export interface MigrationResult {
  success: boolean;
  migratedStores: string[];
  errors: string[];
  stats: {
    projects: number;
    assetLibrary: number;
    images: number;
    videos: number;
    projectStages: number;
  };
}

const openOldDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OLD_DB_NAME, OLD_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECTS)) {
        db.createObjectStore(STORE_NAMES.PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.ASSET_LIBRARY)) {
        db.createObjectStore(STORE_NAMES.ASSET_LIBRARY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.IMAGES)) {
        db.createObjectStore(STORE_NAMES.IMAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.VIDEOS)) {
        db.createObjectStore(STORE_NAMES.VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECT_STAGES)) {
        db.createObjectStore(STORE_NAMES.PROJECT_STAGES, { keyPath: 'id' });
      }
    };
  });
};

const openNewDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NEW_DB_NAME, OLD_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECTS)) {
        db.createObjectStore(STORE_NAMES.PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.ASSET_LIBRARY)) {
        db.createObjectStore(STORE_NAMES.ASSET_LIBRARY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.IMAGES)) {
        db.createObjectStore(STORE_NAMES.IMAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.VIDEOS)) {
        db.createObjectStore(STORE_NAMES.VIDEOS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.PROJECT_STAGES)) {
        db.createObjectStore(STORE_NAMES.PROJECT_STAGES, { keyPath: 'id' });
      }
    };
  });
};

const getAllFromStore = async <T>(db: IDBDatabase, storeName: string): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

const migrateStore = async <T>(
  oldDB: IDBDatabase,
  newDB: IDBDatabase,
  storeName: string
): Promise<number> => {
  const data = await getAllFromStore<T>(oldDB, storeName);
  
  if (data.length === 0) {
    logger.debug(LogCategory.STORAGE, `Store ${storeName} 无数据，跳过`);
    return 0;
  }

  return new Promise((resolve, reject) => {
    const transaction = newDB.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    
    let migratedCount = 0;
    
    data.forEach(item => {
      const request = store.put(item);
      request.onsuccess = () => {
        migratedCount++;
      };
    });
    
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      logger.debug(LogCategory.STORAGE, `✅ Store ${storeName} 迁移完成: ${migratedCount} 条`);
      resolve(migratedCount);
    };
  });
};

export const migrateDatabase = async (): Promise<MigrationResult> => {
  const result: MigrationResult = {
    success: false,
    migratedStores: [],
    errors: [],
    stats: {
      projects: 0,
      assetLibrary: 0,
      images: 0,
      videos: 0,
      projectStages: 0
    }
  };

  try {
    logger.info(LogCategory.STORAGE, '🔄 开始数据库迁移: BigBananaDB -> WLDB');

    const oldDB = await openOldDB();
    logger.info(LogCategory.STORAGE, '✅ 旧数据库打开成功');

    const newDB = await openNewDB();
    logger.info(LogCategory.STORAGE, '✅ 新数据库打开成功');

    const storesToMigrate = [
      STORE_NAMES.PROJECTS,
      STORE_NAMES.ASSET_LIBRARY,
      STORE_NAMES.IMAGES,
      STORE_NAMES.VIDEOS,
      STORE_NAMES.PROJECT_STAGES
    ];

    for (const storeName of storesToMigrate) {
      try {
        const count = await migrateStore(oldDB, newDB, storeName);
        result.stats[storeName as keyof typeof result.stats] = count;
        result.migratedStores.push(storeName);
      } catch (error) {
        const errorMsg = `Store ${storeName} 迁移失败: ${error}`;
        logger.error(LogCategory.STORAGE, errorMsg);
        result.errors.push(errorMsg);
      }
    }

    oldDB.close();
    newDB.close();

    if (result.errors.length === 0) {
      result.success = true;
      logger.info(LogCategory.STORAGE, '✅ 数据库迁移完成');
      logger.info(LogCategory.STORAGE, `📊 迁移统计:`, result.stats);
    } else {
      logger.warn(LogCategory.STORAGE, '⚠️ 数据库迁移完成，但有部分错误');
    }

    return result;
  } catch (error) {
    const errorMsg = `数据库迁移失败: ${error}`;
    logger.error(LogCategory.STORAGE, errorMsg);
    result.errors.push(errorMsg);
    return result;
  }
};

export const checkOldDatabaseExists = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const request = indexedDB.open(OLD_DB_NAME);
    request.onsuccess = () => {
      request.result.close();
      resolve(true);
    };
    request.onerror = () => resolve(false);
  });
};

export const deleteOldDatabase = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(OLD_DB_NAME);
    request.onsuccess = () => {
      logger.info(LogCategory.STORAGE, `✅ 旧数据库 ${OLD_DB_NAME} 已删除`);
      resolve(true);
    };
    request.onerror = () => {
      logger.error(LogCategory.STORAGE, `❌ 删除旧数据库失败: ${request.error}`);
      resolve(false);
    };
  });
};
*/
