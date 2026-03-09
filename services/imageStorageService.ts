import { supabase } from '../src/api/supabase';
import { useAuthStore } from '../src/stores/authStore';

const DB_NAME = 'BigBananaDB';
const DB_VERSION = 5;
const IMAGE_STORE_NAME = 'images';
const VIDEO_STORE_NAME = 'videos';

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
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        const store = db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
        const store = db.createObjectStore(VIDEO_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

export const imageStorageService = {
  async saveImage(id: string, blob: Blob): Promise<void> {
    console.log('[ImageStorage] 💾 保存图片到本地:', id, '大小:', blob.size);
    
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IMAGE_STORE_NAME);
    
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
        console.log('[ImageStorage] ✅ 图片保存成功:', id);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getImage(id: string): Promise<Blob | null> {
    console.log('[ImageStorage] 📖 读取本地图片:', id);
    
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE_NAME, 'readonly');
    const store = tx.objectStore(IMAGE_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result as LocalImage | undefined;
        if (result) {
          console.log('[ImageStorage] ✅ 图片读取成功:', id);
          resolve(result.blob);
        } else {
          console.log('[ImageStorage] ❌ 图片不存在:', id);
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteImage(id: string): Promise<void> {
    console.log('[ImageStorage] 🗑️ 删除本地图片:', id);
    
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IMAGE_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        console.log('[ImageStorage] ✅ 图片删除成功:', id);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async uploadToCloud(id: string, blob: Blob, path: string): Promise<string> {
    console.log('[ImageStorage] ☁️ 上传图片到云端:', id, '路径:', path);
    
    const { user } = useAuthStore.getState();
    if (!user) {
      throw new Error('用户未登录');
    }

    const fileName = `${id}.png`;
    const fullPath = `${path}/${fileName}`;
    console.log('[ImageStorage] 📁 完整路径:', fullPath);

    const { error: uploadError, data: uploadData } = await supabase.storage
      .from('projects')
      .upload(fullPath, blob, {
        upsert: true,
        contentType: 'image/png'
      });

    if (uploadError) {
      console.error('[ImageStorage] ❌ 上传失败:', uploadError);
      throw uploadError;
    }

    console.log('[ImageStorage] ✅ 上传成功，获取公共URL...');
    const { data: { publicUrl } } = supabase.storage
      .from('projects')
      .getPublicUrl(fullPath);

    console.log('[ImageStorage] ✅ 图片上传成功:', publicUrl);
    return publicUrl;
  },

  async cleanOldImages(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    console.log('[ImageStorage] 🧹 清理过期图片，最大年龄:', maxAge, 'ms');
    
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IMAGE_STORE_NAME);
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
          console.log('[ImageStorage] ✅ 清理完成，删除了', deletedCount, '张图片');
          resolve(deletedCount);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  },

  async getAllImages(): Promise<LocalImage[]> {
    console.log('[ImageStorage] 📋 获取所有本地图片');
    
    const db = await openDB();
    const tx = db.transaction(IMAGE_STORE_NAME, 'readonly');
    const store = tx.objectStore(IMAGE_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result = request.result as LocalImage[];
        console.log('[ImageStorage] ✅ 找到', result.length, '张本地图片');
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
    console.log('[VideoStorage] 💾 保存视频到本地:', id, '大小:', blob.size);
    
    const db = await openDB();
    const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE_NAME);
    
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
        console.log('[VideoStorage] ✅ 视频保存成功:', id);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getVideo(id: string): Promise<Blob | null> {
    console.log('[VideoStorage] 📖 读取本地视频:', id);
    
    const db = await openDB();
    const tx = db.transaction(VIDEO_STORE_NAME, 'readonly');
    const store = tx.objectStore(VIDEO_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const result = request.result as LocalVideo | undefined;
        if (result) {
          console.log('[VideoStorage] ✅ 视频读取成功:', id);
          resolve(result.blob);
        } else {
          console.log('[VideoStorage] ❌ 视频不存在:', id);
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteVideo(id: string): Promise<void> {
    console.log('[VideoStorage] 🗑️ 删除本地视频:', id);
    
    const db = await openDB();
    const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        console.log('[VideoStorage] ✅ 视频删除成功:', id);
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
    console.log('[VideoStorage] 🧹 清理过期视频，最大年龄:', maxAge, 'ms');
    
    const db = await openDB();
    const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE_NAME);
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
          console.log('[VideoStorage] ✅ 清理完成，删除了', deletedCount, '个视频');
          resolve(deletedCount);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  },

  async getAllVideos(): Promise<LocalVideo[]> {
    console.log('[VideoStorage] 📋 获取所有本地视频');
    
    const db = await openDB();
    const tx = db.transaction(VIDEO_STORE_NAME, 'readonly');
    const store = tx.objectStore(VIDEO_STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result = request.result as LocalVideo[];
        console.log('[VideoStorage] ✅ 找到', result.length, '个本地视频');
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }
};

export const generateVideoId = (): string => {
  return `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};
