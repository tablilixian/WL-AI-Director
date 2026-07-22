/**
 * ============================================================
 *  尺寸 / 分辨率 全局配置
 *  所有图片、视频、Canvas 图层的宽高统一在此管理
 *  修改此处即可全局调整，无需逐个文件查找
 * ============================================================
 */

// ---- 基础宽高比映射 ----
export type AspectRatioKey = '16:9' | '9:16' | '1:1';

// ============================================================
//  一、视频生成
// ============================================================

/** Sora / BigModel 异步视频 */
export const VIDEO_SORA_SIZE: Record<AspectRatioKey, { width: number; height: number; size: string }> = {
  '16:9': { width: 1280, height: 704, size: '1280x704' },
  '9:16': { width: 704, height: 1280, size: '704x1280' },
  '1:1':  { width: 704, height: 704,  size: '704x704' },
};

/** Drama Backend 视频 (image2videomsr) — 当前为 640p 级别 */
export const VIDEO_DRAMA_SIZE: Record<AspectRatioKey, { width: number; height: number }> = {
  '16:9': { width: 640, height: 320 },
  '9:16': { width: 320, height: 640 },
  '1:1':  { width: 512, height: 512 },
};
export const VIDEO_DRAMA_FALLBACK = { width: 640, height: 320 };

/** 视频 MSR / MKR / MKR Grid 默认尺寸 */
export const VIDEO_MSR_DEFAULT = { width: 640, height: 320 };
export const VIDEO_MKR_DEFAULT = { width: 640, height: 320 };
export const VIDEO_MKR_GRID_DEFAULT = { width: 640, height: 320 };

// ============================================================
//  二、图片生成
// ============================================================

/** BigModel CogView (文生图) */
export const IMAGE_COGVIEW_SIZE: Record<AspectRatioKey, string> = {
  '16:9': '1280x704',
  '9:16': '704x1280',
  '1:1':  '1024x1024',
};
export const IMAGE_COGVIEW_FALLBACK = '1024x1024';

/** Drama Backend I2I / T2I */
export const IMAGE_DRAMA_SIZE: Record<AspectRatioKey, { width: number; height: number }> = {
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '1:1':  { width: 768, height: 768 },
};
export const IMAGE_DRAMA_FALLBACK = { width: 1024, height: 704 };

/** IP A 风格迁移 (复用 Drama Backend 尺寸) */
export const IMAGE_IPA_SIZE = IMAGE_DRAMA_SIZE;
export const IMAGE_IPA_FALLBACK = IMAGE_DRAMA_FALLBACK;

/** 动漫生成 (复用 Drama Backend 尺寸) */
export const IMAGE_ANIME_SIZE = IMAGE_DRAMA_SIZE;
export const IMAGE_ANIME_FALLBACK = IMAGE_DRAMA_FALLBACK;

/** 图像分割网格 */
export const IMAGE_SPLITE_GRID = { targetWidth: 1024, targetHeight: 704 };

// ============================================================
//  三、分镜 / Storyboard
// ============================================================

/** 分镜图每格宽度 */
export const STORYBOARD_ITEM_WIDTH = 1024;

/** 四宫格推演 (StoryDeductionPanel) */
export const STORYBOARD_4GRID = {
  /**
   * 传给 image2storyboard 的 width 参数（对应输出图片的总宽度）
   * 后端据此生成图片，实际输出尺寸由后端决定
   */
  ITEM_WIDTH: 1024,
  /** 图片加载失败时的降级图层尺寸 */
  LAYER_WIDTH: 1024,
  LAYER_HEIGHT: 512,
};

// ============================================================
//  四、Canvas 图层尺寸
// ============================================================

export const CANVAS_LAYER = {
  /** MKR 视频节点 */
  MKR_VIDEO: { width: 640, height: 384 },
  /** 全景图 */
  PANORAMA: { width: 640, height: 384 },
  /** 全景截图缩略图 */
  PANORAMA_SNAPSHOT: { width: 320, height: 192 },
  /** 图片生成占位符 */
  IMAGE_PLACEHOLDER: { width: 448, height: 320 },
  /** 视频生成占位符 */
  VIDEO_PLACEHOLDER: { width: 640, height: 384 },
  /** 文本分析结果 (VisualLanguagePanel) */
  TEXT_ANALYSIS: { width: 320, height: 192 },
  /** 模板占位符 */
  TEMPLATE_PLACEHOLDER: { width: 448, height: 320 },
  /** Prompt 提示层 */
  PROMPT_LAYER: { width: 320, height: 192 },
};

// ============================================================
//  五、视频合成 & 导出
// ============================================================

/** 视频合并分辨率预设 */
export const EXPORT_RESOLUTION_MAP = {
  '720p':  { width: 1280, height: 704,  label: '720p' },
  '1080p': { width: 1920, height: 1088, label: '1080p' },
  '4K':    { width: 3840, height: 2176, label: '4K' },
} as const;

/** FCPXML 导出默认分辨率 */
export const FCPXML_DEFAULT = { width: 1920, height: 1088 };

// ============================================================
//  六、UI 侧视频尺寸预设
// ============================================================

/** GenerateVideoPanel 尺寸选项 (带宽高比推断) */
export const UI_VIDEO_SIZE_PRESETS = [
  { label: '横屏 640p',  width: 640,  height: 320,  aspectRatio: '16:9' },
  { label: '横屏 720p',  width: 1280, height: 704,  aspectRatio: '16:9' },
  { label: '横屏 1080p', width: 1920, height: 1088, aspectRatio: '16:9' },
  { label: '竖屏 640p',  width: 320,  height: 640,  aspectRatio: '9:16' },
  { label: '竖屏 720p',  width: 704,  height: 1280, aspectRatio: '9:16' },
  { label: '竖屏 1080p', width: 1088, height: 1920, aspectRatio: '9:16' },
  { label: '方形小',     width: 512,  height: 512,  aspectRatio: '1:1' },
  { label: '方形 720p',  width: 704,  height: 704,  aspectRatio: '1:1' },
  { label: '方形 1080p', width: 1088, height: 1088, aspectRatio: '1:1' },
] as const;

/** MkrVideoConfigBar 尺寸选项 */
export const UI_MKR_SIZE_PRESETS = [
  { label: '横屏 720p', width: 1280, height: 704 },
  { label: '测试 640p', width: 640,  height: 320 },
  { label: '竖屏 720p', width: 704,  height: 1280 },
  { label: '方形 720p', width: 704,  height: 704 },
] as const;

// ============================================================
//  七、其他
// ============================================================

/** 全景生成输出 */
export const PANORAMA_OUTPUT = { width: 2048, height: 1024 };

/** 场景导入后备尺寸 */
export const SCENE_IMPORT_FALLBACK = { width: 1024, height: 576 };

/** 小地图空画布默认边界 */
export const MINIMAP_EMPTY_BOUNDS = { width: 1024, height: 1024 };

/** StoryboardDeductionPanel 加载失败降级尺寸 */
export const STORYBOARD_FALLBACK_SIZE = { width: 1024, height: 576 };
