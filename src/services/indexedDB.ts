/**
 * IndexedDB 存储服务
 * 基于 WLDB 统一数据库，存储视频媒体文件及编辑器状态
 */

import { openDB } from '../../services/storageService';
import { STORE_NAMES } from '../../services/dbConfig';

interface StoredFile {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export interface EditorStateData {
  projectId: string;
  tracks: any[];
  zoom: number;
  createdAt: number;
  updatedAt: number;
  version: number;
}

class IndexedDBService {
  async saveFile(id: string, file: File): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.MEDIA_FILES, 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.MEDIA_FILES);

      const storedFile: StoredFile = {
        id,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: Date.now(),
      };

      const request = store.put(storedFile);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getFile(id: string): Promise<File | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.MEDIA_FILES, 'readonly');
      const store = transaction.objectStore(STORE_NAMES.MEDIA_FILES);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result?.file ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFile(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.MEDIA_FILES, 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.MEDIA_FILES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAMES.MEDIA_FILES, STORE_NAMES.EDITOR_STATES], 'readwrite');
      transaction.objectStore(STORE_NAMES.MEDIA_FILES).clear();
      transaction.objectStore(STORE_NAMES.EDITOR_STATES).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async saveState(projectId: string, data: Omit<EditorStateData, 'updatedAt'>): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.EDITOR_STATES, 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.EDITOR_STATES);

      const stateData: EditorStateData = {
        ...data,
        projectId,
        updatedAt: Date.now(),
      };

      const request = store.put(stateData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async loadState(projectId: string): Promise<EditorStateData | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.EDITOR_STATES, 'readonly');
      const store = transaction.objectStore(STORE_NAMES.EDITOR_STATES);
      const request = store.get(projectId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteState(projectId: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.EDITOR_STATES, 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.EDITOR_STATES);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listStateProjects(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.EDITOR_STATES, 'readonly');
      const store = transaction.objectStore(STORE_NAMES.EDITOR_STATES);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllStates(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAMES.EDITOR_STATES, 'readwrite');
      const store = transaction.objectStore(STORE_NAMES.EDITOR_STATES);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const indexedDBService = new IndexedDBService();
