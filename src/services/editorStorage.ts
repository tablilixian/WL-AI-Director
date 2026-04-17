/**
 * 编辑器存储服务
 * 使用 localStorage 存储编辑器状态
 * 
 * 后续可升级为 IndexedDB 以支持更大的数据量
 */

import { Track, EditorPreferences } from '../types/editor';

const STORAGE_PREFIX = 'video-editor-';
const PREFERENCES_KEY = 'video-editor-preferences';

// ============================================================
// 类型定义
// ============================================================

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

// ============================================================
// 存储键
// ============================================================

function getProjectKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

// ============================================================
// 存储服务类
// ============================================================

class EditorStorageService {
  private isAvailable: boolean;

  constructor() {
    this.isAvailable = this.checkAvailability();
  }

  /**
   * 检查 localStorage 是否可用
   */
  private checkAvailability(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存编辑器状态
   */
  async save(projectId: string, data: Partial<StoredEditorState>): Promise<boolean> {
    if (!this.isAvailable) {
      console.warn('[EditorStorage] localStorage 不可用');
      return false;
    }

    try {
      const key = getProjectKey(projectId);
      const existing = this.loadRaw(key);

      const state: StoredEditorState = {
        projectId,
        createdAt: data.createdAt || Date.now(),
        updatedAt: Date.now(),
        tracks: data.tracks || [],
        zoom: data.zoom || 50,
        version: 1,
        ...existing,
        ...data,
      };

      localStorage.setItem(key, JSON.stringify(state));
      console.log('[EditorStorage] 已保存:', projectId);
      return true;
    } catch (error) {
      console.error('[EditorStorage] 保存失败:', error);
      return false;
    }
  }

  /**
   * 加载编辑器状态
   */
  async load(projectId: string): Promise<StoredEditorState | null> {
    if (!this.isAvailable) {
      return null;
    }

    try {
      const key = getProjectKey(projectId);
      return this.loadRaw(key);
    } catch (error) {
      console.error('[EditorStorage] 加载失败:', error);
      return null;
    }
  }

  /**
   * 删除编辑器状态
   */
  async delete(projectId: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const key = getProjectKey(projectId);
      localStorage.removeItem(key);
      console.log('[EditorStorage] 已删除:', projectId);
      return true;
    } catch (error) {
      console.error('[EditorStorage] 删除失败:', error);
      return false;
    }
  }

  /**
   * 列出所有已保存的项目
   */
  async listProjects(): Promise<string[]> {
    if (!this.isAvailable) {
      return [];
    }

    const projects: string[] = [];
    const prefix = STORAGE_PREFIX;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        projects.push(key.replace(prefix, ''));
      }
    }

    return projects;
  }

  /**
   * 获取项目最后更新时间
   */
  async getLastUpdated(projectId: string): Promise<number | null> {
    const state = await this.load(projectId);
    return state?.updatedAt || null;
  }

  /**
   * 保存用户偏好设置
   */
  async savePreferences(prefs: Partial<StoredPreferences>): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const existing = this.loadPreferences();
      const merged = { ...existing, ...prefs };
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(merged));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 加载用户偏好设置
   */
  async loadPreferences(): Promise<StoredPreferences> {
    if (!this.isAvailable) {
      return this.getDefaultPreferences();
    }

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

  /**
   * 获取默认偏好设置
   */
  private getDefaultPreferences(): StoredPreferences {
    return {
      theme: 'dark',
      snapEnabled: true,
      snapThreshold: 500,
    };
  }

  /**
   * 清空所有编辑器数据
   */
  async clearAll(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }

    const keysToRemove: string[] = [];
    const prefix = STORAGE_PREFIX;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(prefix) || key === PREFERENCES_KEY)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('[EditorStorage] 已清空所有数据');
  }

  /**
   * 获取存储使用情况
   */
  getStorageInfo(): { used: number; available: boolean } {
    if (!this.isAvailable) {
      return { used: 0, available: false };
    }

    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          used += value.length;
        }
      }
    }

    return { used, available: true };
  }

  /**
   * 内部方法：加载原始数据
   */
  private loadRaw(key: string): StoredEditorState | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return null;
  }
}

// ============================================================
// 导出单例
// ============================================================

export const editorStorage = new EditorStorageService();

// ============================================================
// 便捷函数
// ============================================================

export async function saveEditorState(
  projectId: string,
  tracks: Track[],
  zoom: number
): Promise<boolean> {
  return editorStorage.save(projectId, { tracks, zoom });
}

export async function loadEditorState(
  projectId: string
): Promise<StoredEditorState | null> {
  return editorStorage.load(projectId);
}

export async function deleteEditorState(
  projectId: string
): Promise<boolean> {
  return editorStorage.delete(projectId);
}

export async function listEditorProjects(): Promise<string[]> {
  return editorStorage.listProjects();
}
