/**
 * 编辑器存储服务
 * 使用 IndexedDB 存储编辑器状态（大对象）
 * 偏好设置仍保留在 localStorage（微型数据）
 */

import { Track } from '../types/editor';
import { indexedDBService } from './indexedDB';
import { logger, LogCategory } from '../../services/logger.ts';

const PREFERENCES_KEY = 'video-editor-preferences';

interface StoredEditorState {
  projectId: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  zoom: number;
  version: number;
}

interface StoredPreferences {
  theme: 'dark' | 'light';
  snapEnabled: boolean;
  snapThreshold: number;
}

class EditorStorageService {
  async save(projectId: string, data: Partial<StoredEditorState>): Promise<boolean> {
    try {
      const existing = await indexedDBService.loadState(projectId);
      const state: StoredEditorState = {
        projectId,
        createdAt: data.createdAt || existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        tracks: data.tracks || existing?.tracks || [],
        zoom: data.zoom ?? existing?.zoom ?? 50,
        version: 1,
      };

      await indexedDBService.saveState(projectId, state);
      return true;
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[EditorStorage] 保存失败:', error);
      return false;
    }
  }

  async load(projectId: string): Promise<StoredEditorState | null> {
    try {
      const state = await indexedDBService.loadState(projectId);
      if (!state) return null;
      return {
        projectId: state.projectId,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        tracks: state.tracks,
        zoom: state.zoom,
        version: state.version,
      };
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[EditorStorage] 加载失败:', error);
      return null;
    }
  }

  async delete(projectId: string): Promise<boolean> {
    try {
      await indexedDBService.deleteState(projectId);
      return true;
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[EditorStorage] 删除失败:', error);
      return false;
    }
  }

  async listProjects(): Promise<string[]> {
    try {
      return await indexedDBService.listStateProjects();
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[EditorStorage] 列出项目失败:', error);
      return [];
    }
  }

  async getLastUpdated(projectId: string): Promise<number | null> {
    const state = await this.load(projectId);
    return state?.updatedAt || null;
  }

  async savePreferences(prefs: Partial<StoredPreferences>): Promise<boolean> {
    try {
      const existing = this.loadPreferences();
      const merged = { ...existing, ...prefs };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(merged));
      return true;
    } catch {
      return false;
    }
  }

  async loadPreferences(): Promise<StoredPreferences> {
    try {
      const raw = localStorage.getItem(PREFERENCES_KEY);
      if (raw) {
        return { ...this.getDefaultPreferences(), ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return this.getDefaultPreferences();
  }

  private getDefaultPreferences(): StoredPreferences {
    return {
      theme: 'dark',
      snapEnabled: true,
      snapThreshold: 500,
    };
  }

  async clearAll(): Promise<void> {
    try {
      await indexedDBService.clearAllStates();
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[EditorStorage] 清空失败:', error);
    }
  }

  getStorageInfo(): { used: number; available: boolean } {
    return { used: 0, available: true };
  }
}

export const editorStorage = new EditorStorageService();

export async function saveEditorState(
  projectId: string,
  tracks: Track[],
  zoom: number,
): Promise<boolean> {
  return editorStorage.save(projectId, { tracks, zoom });
}

export async function loadEditorState(projectId: string): Promise<StoredEditorState | null> {
  return editorStorage.load(projectId);
}

export async function deleteEditorState(projectId: string): Promise<boolean> {
  return editorStorage.delete(projectId);
}

export async function listEditorProjects(): Promise<string[]> {
  return editorStorage.listProjects();
}
