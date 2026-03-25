/**
 * 画布模块类型定义
 * 基于 GenCanvas 架构，适配 WL AI Director 项目
 */

// ============================================
// 标注类型
// ============================================

export interface DrawingPath {
  id: string;
  type: 'path';
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface RectangleAnnotation {
  id: string;
  type: 'rectangle';
  vertices: { x: number; y: number }[]; // 4 vertices: [topLeft, topRight, bottomRight, bottomLeft]
  color: string;
  strokeWidth: number;
}

export type Annotation = DrawingPath | TextAnnotation | RectangleAnnotation;

// ============================================
// 图层类型
// ============================================

export type LayerType = 'image' | 'video' | 'sticky' | 'text' | 'group' | 'drawing' | 'audio';

export interface LayerData {
  id: string;
  parentId?: string; // ID of the group this layer belongs to
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // Base64 or Blob URL (empty for stickies/groups)
  thumbnail?: string; // 256px thumbnail Base64 for LOD rendering
  // Asset store IDs (blob-based storage for performance)
  imageId?: string; // Reference to asset store for full-res image
  thumbnailId?: string; // Reference to asset store for thumbnail
  color?: string; // For stickies, groups, and text
  text?: string; // Main text content for stickies and text layers
  fontSize?: number; // Custom font size for text content
  title: string;
  createdAt: number;
  flipX?: boolean;
  flipY?: boolean;
  duration?: number; // Video/Audio duration in seconds
  isLoading?: boolean;
  progress?: number; // 0-100 for generation progress
  error?: string;
  annotations?: Annotation[];
  // 图层属性
  locked?: boolean; // 是否锁定（防止拖拽和缩放）
  visible?: boolean; // 是否可见
  opacity?: number; // 透明度 0-1
  zIndex?: number; // 图层顺序
  // 来源追踪
  sourceLayerId?: string; // 来源图层 ID
  operationType?: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video' | 'style-transfer' | 'background-replace' | 'expand' | 'import' | 'drawing'; // 操作类型
  // 关联信息（用于与主项目联动）
  linkedResourceId?: string; // 关联的角色/场景 ID
  linkedResourceType?: 'character' | 'scene' | 'keyframe'; // 关联的资源类型
}

// ============================================
// 画布状态
// ============================================

export interface CanvasOffset {
  x: number;
  y: number;
}

export interface CanvasState {
  layers: LayerData[];
  offset: CanvasOffset;
  scale: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
}

// ============================================
// 吸附对齐
// ============================================

export interface SnapGuide {
  type: 'vertical' | 'horizontal';
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

// ============================================
// 生成任务
// ============================================

export type GenerationStatus = 'queued' | 'generating' | 'polling' | 'completed' | 'failed';

export interface GenerationTask {
  id: string;
  layerId: string;
  status: GenerationStatus;
  abortController: AbortController;
  progress?: number; // 0-100
  mediaType: LayerType;
  startedAt: number;
}

// ============================================
// 模型配置
// ============================================

export interface GenerationOptions {
  prompt: string;
  referenceImages?: string[];
  aspectRatio?: '16:9' | '9:16' | '1:1';
  mediaType: 'image' | 'video';
  // 视频专用
  startImage?: string;
  endImage?: string;
  duration?: number;
}

// ============================================
// 导出配置
// ============================================

export type ExportFormat = 'png' | 'jpg' | 'mp4' | 'wav';

export interface ExportOptions {
  format: ExportFormat;
  quality?: number; // 0-1 for jpg
  includeAnnotations?: boolean;
}

// ============================================
// 小地图
// ============================================

export interface MinimapViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}
