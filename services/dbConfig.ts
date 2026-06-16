/**
 * IndexedDB 统一配置
 * 
 * 所有使用 IndexedDB 的地方都应该从这里导入配置
 * 确保数据库版本号统一管理，避免版本冲突
 */

export const DB_NAME = 'WLDB';

/**
 * 数据库版本号
 * 
 * 重要：每次修改数据库结构（添加/删除 store）时，必须递增此版本号
 * 
 * 版本历史：
 * - 5: 初始版本（projects, assetLibrary, images）
 * - 6: 添加 projectStages store（stage 专用存储）
 * - 7: 修复 VIDEOS store 缺失问题，自动检测并创建缺失的 store
 * - 8: 添加 canvasData store（画布数据独立存储，按项目ID关联）
 * - 9: 确保 videos store 正确创建
 * - 10: 添加 editorStates、mediaFiles store（原 video-editor-files 合并至 WLDB）
 * - 11: 同步现有数据库版本，修复版本冲突
 */
export const DB_VERSION = 11;

export const STORE_NAMES = {
  PROJECTS: 'projects',
  ASSET_LIBRARY: 'assetLibrary',
  IMAGES: 'images',
  VIDEOS: 'videos',
  PROJECT_STAGES: 'projectStages',
  CANVAS_DATA: 'canvasData',
  EDITOR_STATES: 'editorStates',
  MEDIA_FILES: 'mediaFiles',
} as const;

/**
 * 本地存储开关 - 由 hybridStorage 自动启用
 */
export const storageConfig = { 
  _enabled: true, 
  get enabled() { return this._enabled; }, 
  enableForHybrid() { this._enabled = true; }, 
  setEnabled(v: boolean) { this._enabled = v; } 
};
