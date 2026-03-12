import { supabase } from '../src/api/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { DB_NAME, DB_VERSION, STORE_NAMES } from './dbConfig';
import { logger, LogCategory } from './logger';

export interface LocalImage {
  id: string;
  blob: Blob;
  createdAt: number;
  type: string;
  size: number;
}

export interface LocalVideo {
  id: string;
  blob: Blob;
  createdAt: number;
  type: string;
  size: number;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      
      // 检查必要的 store 是否存在
      const requiredStores = [STORE_NAMES.IMAGES, STORE_NAMES.VIDEOS];
      const missingStores = requiredStores.filter(store => !db.objectStoreNames.contains(store));
      
      if (missingStores.length > 0) {
        logger.warn(LogCategory.IMAGE, `⚠️ 检测到缺失的 store: ${missingStores.join(', ')}`);
        logger.warn(LogCategory.IMAGE, `💡 提示: 请在浏览器开发者工具中清理 IndexedDB 后刷新页面`);
      }
      
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORE_NAMES.IMAGES)) {
        const store = db.createObjectStore(STORE_NAMES.IMAGES, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        logger.debug(LogCategory.IMAGE, `✅ 创建 store: ${STORE_NAMES.IMAGES}`);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.VIDEOS)) {
        const store = db.createObjectStore(STORE_NAMES.VIDEOS, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        logger.debug(LogCategory.IMAGE, `✅ 创建 store: ${STORE_NAMES.VIDEOS}`);
      }
    };
  });
};

export const imageStorageService = {
  async saveImage(id: string, blob: Blob): Promise<void> {
    logger.debug(LogCategory.IMAGE, `💾 保存图片到本地: ${id}, 大小: ${blob.size}`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    
    const image: LocalImage = {
      id,
      blob,
      createdAt: Date.now(),
      type: blob.type,
      size: blob.size
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(image);
      request.onsuccess = () => {
        logger.debug(LogCategory.IMAGE, `✅ 图片保存成功: ${id}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getImage(id: string): Promise<Blob | null> {
    logger.debug(LogCategory.IMAGE, `📖 读取本地图片: ${id}`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result as LocalImage | undefined;
        if (result) {
          logger.debug(LogCategory.IMAGE, `✅ 图片读取成功: ${id}`);
          resolve(result.blob);
        } else {
          logger.debug(LogCategory.IMAGE, `❌ 图片不存在: ${id}`);
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteImage(id: string): Promise<void> {
    logger.debug(LogCategory.IMAGE, `🗑️ 删除本地图片: ${id}`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        logger.debug(LogCategory.IMAGE, `✅ 图片删除成功: ${id}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async uploadToCloud(id: string, blob: Blob, path: string): Promise<string> {
    logger.debug(LogCategory.IMAGE, `☁️ 上传图片到云端: ${id}, 路径: ${path}`);
    
    const { user } = useAuthStore.getState();
    if (!user) {
      throw new Error('用户未登录');
    }

    const fileName = `${id}.png`;
    const fullPath = `${path}/${fileName}`;
    logger.debug(LogCategory.IMAGE, `📁 完整路径: ${fullPath}`);

    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('projects')
      .upload(fullPath, blob, {
        upsert: true,
        contentType: 'image/png'
      });

    if (uploadError) {
      logger.error(LogCategory.IMAGE, '❌ 上传失败:', uploadError);
      throw uploadError;
    }

    logger.debug(LogCategory.IMAGE, '✅ 上传成功，获取公共URL...');
    const { data: { publicUrl } } = supabase.storage
      .from('projects')
      .getPublicUrl(fullPath);

    logger.debug(LogCategory.IMAGE, `✅ 图片上传成功: ${publicUrl}`);
    return publicUrl;
  },

  async cleanOldImages(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    logger.debug(LogCategory.IMAGE, `🧹 清理过期图片，最大年龄: ${maxAge} ms`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    const index = store.index('createdAt');
    
    const cutoffTime = Date.now() - maxAge;
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          logger.debug(LogCategory.IMAGE, `✅ 清理完成，删除了 ${deletedCount} 张图片`);
          resolve(deletedCount);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  },

  async getAllImages(): Promise<LocalImage[]> {
    logger.debug(LogCategory.IMAGE, '📋 获取所有本地图片');
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result = request.result as LocalImage[];
        logger.debug(LogCategory.IMAGE, `✅ 找到 ${result.length} 张本地图片`);
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }
};

export const generateImageId = (): string => {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const videoStorageService = {
  async saveVideo(id: string, blob: Blob): Promise<void> {
    logger.debug(LogCategory.VIDEO, `💾 保存视频到本地: ${id}, 大小: ${blob.size}`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    
    const video: LocalVideo = {
      id,
      blob,
      createdAt: Date.now(),
      type: blob.type,
      size: blob.size
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(video);
      request.onsuccess = () => {
        logger.debug(LogCategory.VIDEO, `✅ 视频保存成功: ${id}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getVideo(id: string): Promise<Blob | null> {
    logger.debug(LogCategory.VIDEO, `📖 读取本地视频: ${id}`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readonly');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result as LocalVideo | undefined;
        if (result) {
          logger.debug(LogCategory.VIDEO, `✅ 视频读取成功: ${id}`);
          resolve(result.blob);
        } else {
          logger.debug(LogCategory.VIDEO, `❌ 视频不存在: ${id}`);
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteVideo(id: string): Promise<void> {
    logger.debug(LogCategory.VIDEO, `🗑️ 删除本地视频: ${id}`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        logger.debug(LogCategory.VIDEO, `✅ 视频删除成功: ${id}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getVideoUrl(id: string): Promise<string | null> {
    const blob = await this.getVideo(id);
    if (!blob) {
      return null;
    }
    return URL.createObjectURL(blob);
  },

  async cleanOldVideos(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    logger.debug(LogCategory.VIDEO, `🧹 清理过期视频，最大年龄: ${maxAge} ms`);
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    const index = store.index('createdAt');
    
    const cutoffTime = Date.now() - maxAge;
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          logger.debug(LogCategory.VIDEO, `✅ 清理完成，删除了 ${deletedCount} 个视频`);
          resolve(deletedCount);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  },

  async getAllVideos(): Promise<LocalVideo[]> {
    logger.debug(LogCategory.VIDEO, '📋 获取所有本地视频');
    
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readonly');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result = request.result as LocalVideo[];
        logger.debug(LogCategory.VIDEO, `✅ 找到 ${result.length} 个本地视频`);
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }
};

export const generateVideoId = (): string => {
  return `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};
