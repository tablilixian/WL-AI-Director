/**
 * Asset Store - Blob-based image storage for performance
 * Stores images as Blobs in IndexedDB instead of Base64 strings in React state.
 * This reduces memory usage and speeds up saves since layer metadata stays small.
 */

import { logger, LogCategory } from '../../../../services/logger';

const DB_NAME = 'wl-canvas-assets';
const DB_VERSION = 1;
const ASSETS_STORE = 'assets';

interface AssetRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

const blobUrlCache = new Map<string, string>();

function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }
    };
  });
}

function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

  const byteString = atob(data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: mimeType });
}

export async function storeAsset(base64: string): Promise<string> {
  const id = crypto.randomUUID();
  const blob = base64ToBlob(base64);

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);

    const record: AssetRecord = {
      id,
      blob,
      mimeType: blob.type,
      size: blob.size,
      createdAt: Date.now()
    };

    store.put(record);
    tx.oncomplete = () => {
      logger.debug(LogCategory.CANVAS, `[AssetStore] Asset stored: ${id}`);
      resolve(id);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAssetUrl(id: string): Promise<string | null> {
  if (blobUrlCache.has(id)) {
    return blobUrlCache.get(id)!;
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as AssetRecord | undefined;
      if (!record) {
        resolve(null);
        return;
      }

      const url = URL.createObjectURL(record.blob);
      blobUrlCache.set(id, url);
      resolve(url);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getAssetBlob(id: string): Promise<Blob | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result as AssetRecord | undefined;
      resolve(record?.blob ?? null);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getAssetBase64(id: string): Promise<string | null> {
  const blob = await getAssetBlob(id);
  if (!blob) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function deleteAsset(id: string): Promise<void> {
  const cachedUrl = blobUrlCache.get(id);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    blobUrlCache.delete(id);
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAssets(ids: string[]): Promise<void> {
  for (const id of ids) {
    const cachedUrl = blobUrlCache.get(id);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      blobUrlCache.delete(id);
    }
  }

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);

    for (const id of ids) {
      store.delete(id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function preloadAssetUrls(ids: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    ids.map(async (id) => {
      const url = await getAssetUrl(id);
      if (url) {
        results.set(id, url);
      }
    })
  );

  return results;
}

export async function clearAllAssets(): Promise<void> {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobUrlCache.clear();

  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    const store = tx.objectStore(ASSETS_STORE);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllAssetIds(): Promise<string[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.getAllKeys();

    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
}

export const assetStore = {
  storeAsset,
  getAssetUrl,
  getAssetBlob,
  getAssetBase64,
  deleteAsset,
  deleteAssets,
  preloadAssetUrls,
  clearAllAssets,
  getAllAssetIds
};
