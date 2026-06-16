import { NovelAnalysis } from '../../types/novel';
import { openDB } from '../storageService';
import { STORE_NAMES } from '../dbConfig';

export const saveNovelAnalysis = async (analysis: NovelAnalysis): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.NOVEL_ANALYSES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.NOVEL_ANALYSES);
    const data = { ...analysis, updatedAt: Date.now() };
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const loadNovelAnalysis = async (id: string): Promise<NovelAnalysis | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.NOVEL_ANALYSES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.NOVEL_ANALYSES);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as NovelAnalysis) || null);
    request.onerror = () => reject(request.error);
  });
};

export const getAllNovelAnalyses = async (): Promise<NovelAnalysis[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.NOVEL_ANALYSES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.NOVEL_ANALYSES);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = (request.result as NovelAnalysis[]) || [];
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteNovelAnalysis = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES.NOVEL_ANALYSES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.NOVEL_ANALYSES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const updateNovelAnalysisProjectId = async (analysisId: string, projectId: string): Promise<void> => {
  const analysis = await loadNovelAnalysis(analysisId);
  if (analysis) {
    analysis.projectId = projectId;
    await saveNovelAnalysis(analysis);
  }
};
