/**
 * 视频编辑器核心类型定义
 * 
 * 定义编辑器中使用的所有核心数据结构，包括：
 * - 轨道 (Track)
 * - 片段 (Clip)
 * - 编辑器状态 (EditorState)
 * - 吸附相关类型 (Snap*)
 * 
 * @module types/editor
 */

// ============================================================
// 轨道类型
// ============================================================

/** 轨道类型枚举 */
export type TrackType = 'video' | 'audio' | 'text';

/**
 * 单个轨道
 * 轨道是放置片段的容器，可以是视频、音频或文字轨道
 */
export interface Track {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 轨道类型 */
  type: TrackType;
  /** 是否锁定（锁定后不可编辑） */
  locked: boolean;
  /** 是否可见（隐藏后不渲染） */
  visible: boolean;
  /** 轨道上的片段列表 */
  clips: Clip[];
}

// ============================================================
// 片段类型
// ============================================================

/** 素材类型 */
export type SourceType = 'video' | 'audio' | 'image' | 'text';

/**
 * 基础片段接口
 * 所有类型的片段（视频、音频、文字）都继承自此接口
 */
export interface Clip {
  /** 唯一标识 */
  id: string;
  /** 所属轨道 ID */
  trackId: string;
  /** 关联的素材 ID（如 shot.id） */
  sourceId: string;
  /** 素材类型 */
  sourceType: SourceType;
  /** 素材 URL（base64 或 Blob URL） */
  sourceUrl: string;
  /** 视频缩略图 URL（可选） */
  thumbnailUrl?: string;
  /** 片段显示名称 */
  name?: string;

  // ---------- 时间信息（单位：毫秒） ----------
  
  /** 在轨道上的起始位置 */
  startTime: number;
  /** 片段时长 */
  duration: number;
  /** 素材入点（裁剪用） */
  inPoint: number;
  /** 素材出点（裁剪用） */
  outPoint: number;

  // ---------- 属性 ----------
  
  /** 音量 (0-1) */
  volume: number;
  /** 播放速度 (0.25-4) */
  speed: number;
  /** 透明度 (0-1) */
  opacity: number;
}

/**
 * 文字片段
 * 继承自 Clip，添加文字特有的属性
 */
export interface TextClip extends Clip {
  /** 固定为 'text' */
  type: 'text';
  sourceType: 'text';
  
  /** 文字内容 */
  text: string;
  /** 字体名称 */
  fontFamily: string;
  /** 字号（像素） */
  fontSize: number;
  /** 字体粗细 */
  fontWeight: number;
  /** 文字颜色（hex） */
  color: string;
  /** 背景颜色（可选） */
  backgroundColor?: string;
  /** X 坐标（画布百分比 0-100） */
  x: number;
  /** Y 坐标（画布百分比 0-100） */
  y: number;
  /** 文字对齐 */
  align: 'left' | 'center' | 'right';
  /** 动画类型 */
  animation?: TextAnimation;
}

/** 文字动画类型 */
export type TextAnimation = 'none' | 'fade' | 'slide' | 'pop';

/**
 * 音频片段
 * 继承自 Clip，添加音频特有的属性
 */
export interface AudioClip extends Clip {
  /** 固定为 'audio' */
  type: 'audio';
  
  /** 淡入时长（毫秒） */
  fadeIn: number;
  /** 淡出时长（毫秒） */
  fadeOut: number;
}

// ============================================================
// 编辑器状态
// ============================================================

/** 播放状态 */
export type PlayState = 'playing' | 'paused' | 'stopped';

/**
 * 编辑器完整状态
 * 包含时间线、播放、选择、视图等所有状态
 */
export interface EditorState {
  // ---------- 项目信息 ----------
  
  /** 关联的项目 ID */
  projectId: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后更新时间戳 */
  updatedAt: number;

  // ---------- 轨道数据 ----------
  
  /** 轨道列表 */
  tracks: Track[];

  // ---------- 播放状态 ----------
  
  /** 当前播放时间（毫秒） */
  currentTime: number;
  /** 播放状态 */
  playState: PlayState;
  /** 总时长（毫秒，自动计算） */
  duration: number;
  /** 是否循环播放 */
  loop: boolean;
  /** 播放速率 (0.25, 0.5, 1, 1.5, 2) */
  playbackRate: number;

  // ---------- 编辑状态 ----------
  
  /** 当前选中的片段 ID 列表 */
  selectedClipIds: string[];
  /** 缩放级别（像素/秒） */
  zoom: number;
  /** 横向滚动位置（像素） */
  scrollPosition: number;
  /** 当前激活的轨道 ID */
  activeTrackId: string | null;
  /** 展开的轨道 ID 列表 */
  expandedTrackIds: string[];
}

// ============================================================
// 吸附相关类型
// ============================================================

/** 吸附点类型 */
export type SnapPointType = 
  | 'clip-start'    // 片段开始
  | 'clip-end'      // 片段结束
  | 'clip-center'   // 片段中心
  | 'playhead'      // 播放头
  | 'time-marker';  // 时间标记

/**
 * 吸附点
 * 表示一个可以被吸附的目标位置
 */
export interface SnapPoint {
  /** 吸附点类型 */
  type: SnapPointType;
  /** 时间位置（毫秒） */
  time: number;
  /** 关联的片段 ID */
  clipId?: string;
  /** 关联的轨道 ID */
  trackId?: string;
  /** 显示标签 */
  label: string;
}

/**
 * 吸附配置
 * 控制吸附功能的各项参数
 */
export interface SnapConfig {
  /** 是否开启吸附 */
  enabled: boolean;
  /** 吸附阈值（毫秒），默认 500ms */
  threshold: number;
  /** 是否吸附到播放头 */
  snapToPlayhead: boolean;
  /** 是否吸附到时间标记 */
  snapToMarkers: boolean;
  /** 是否吸附到片段边界 */
  snapToClipEdges: boolean;
  /** 是否吸附到片段中心 */
  snapToClipCenter: boolean;
}

/**
 * 吸附结果
 * 描述吸附计算的结果
 */
export interface SnapResult {
  /** 是否吸附成功 */
  snapped: boolean;
  /** 吸附后的时间（毫秒） */
  snappedTime: number;
  /** 吸附到的点 */
  snapPoint: SnapPoint | null;
  /** 原始位置到吸附点的距离（毫秒） */
  distance?: number;
}

// ============================================================
// 拖拽相关类型
// ============================================================

/** 拖拽操作类型 */
export type DragType = 'move' | 'trim-start' | 'trim-end' | 'split';

/**
 * 拖拽状态
 * 描述当前拖拽操作的详细信息
 */
export interface DragState {
  /** 当前拖拽类型 */
  type: DragType | null;
  /** 被拖拽的片段 ID */
  clipId: string;
  /** 鼠标起始 X 坐标 */
  startX: number;
  /** 片段原始起始时间 */
  startTime: number;
  /** 片段原始时长 */
  startDuration: number;
  /** 片段原始入点 */
  startInPoint: number;
}

// ============================================================
// 播放状态
// ============================================================

/**
 * 播放控制状态
 * 封装播放相关的所有状态
 */
export interface PlaybackState {
  /** 播放状态 */
  playState: PlayState;
  /** 当前时间（毫秒） */
  currentTime: number;
  /** 是否循环 */
  loop: boolean;
  /** 播放速率 */
  playbackRate: number;
}

// ============================================================
// 历史记录
// ============================================================

/**
 * 历史记录条目
 * 用于 Undo/Redo 功能
 */
export interface HistoryEntry {
  /** 轨道快照 */
  tracks: Track[];
  /** 时间戳 */
  timestamp: number;
  /** 操作描述 */
  description?: string;
}

// ============================================================
// 导入导出
// ============================================================

/**
 * 编辑器偏好设置
 * 用户自定义的编辑器配置
 */
export interface EditorPreferences {
  /** 是否开启吸附 */
  snapEnabled: boolean;
  /** 吸附阈值（毫秒） */
  snapThreshold: number;
  /** 是否显示波形 */
  showWaveforms: boolean;
  /** 主题 */
  theme: 'dark' | 'light';
  /** 键盘快捷键映射 */
  keyboardShortcuts: Record<string, string>;
}

/**
 * 可序列化的编辑器状态
 * 用于持久化存储
 */
export interface SerializableEditorState {
  projectId: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  zoom: number;
  preferences: EditorPreferences;
}

// ============================================================
// 辅助类型
// ============================================================

/** 获取 Clip 的联合类型 */
export type AnyClip = Clip | TextClip | AudioClip;

/** 判断是否为 TextClip */
export function isTextClip(clip: AnyClip): clip is TextClip {
  return 'text' in clip && 'fontFamily' in clip;
}

/** 判断是否为 AudioClip */
export function isAudioClip(clip: AnyClip): clip is AudioClip {
  return 'fadeIn' in clip && 'fadeOut' in clip;
}

/** 默认吸附配置 */
export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  enabled: true,
  threshold: 500,
  snapToPlayhead: true,
  snapToMarkers: false,
  snapToClipEdges: true,
  snapToClipCenter: false,
};

/** 默认缩放级别（像素/秒） */
export const DEFAULT_ZOOM = 50;

/** 最小缩放级别 */
export const MIN_ZOOM = 10;

/** 最大缩放级别 */
export const MAX_ZOOM = 500;

/** 轨道高度（像素） */
export const TRACK_HEIGHT = 60;

/** 轨道头部宽度（像素） */
export const TRACK_HEADER_WIDTH = 150;

/** 播放头宽度（像素） */
export const PLAYHEAD_WIDTH = 2;
