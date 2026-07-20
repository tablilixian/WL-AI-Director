export interface CharacterVariation {
  id: string;
  name: string;
  visualPrompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}

/**
 * 角色九宫格造型设计 - 单个视角面板数据
 * 用于多视角展示角色外观，提升镜头图生成时的角色一致性
 */
export interface CharacterTurnaroundPanel {
  index: number;           // 0-8, 九宫格位置索引
  viewAngle: string;       // 视角：正面/左侧面/右侧面/背面/3/4左侧/3/4右侧/俯视/仰视 等
  shotSize: string;        // 景别：全身/半身/特写 等
  description: string;     // 该格子的视觉描述
}

/**
 * 角色九宫格造型设计数据
 * 提供角色的多视角参考图，用于在分镜生成时按镜头角度匹配最佳参考
 */
export interface CharacterTurnaroundData {
  panels: CharacterTurnaroundPanel[];
  imageUrl?: string;
  prompt?: string;
  status: 'pending' | 'generating_panels' | 'panels_ready' | 'generating_image' | 'completed' | 'failed';
}

/**
 * 视觉描述字段 - 用于角色标志性姿态和病态微动作
 * 支持 AI 润色和预览图功能
 */
export interface VisualDescriptionField {
  original: string;        // 用户输入的原文本
  polished?: string;        // AI 润色后的文本（可编辑）
  previewImageUrl?: string; // 预览图 URL
}

export interface Character {
  id: string;
  name: string;
  gender: string;
  age: string;
  personality: string;
  visualPrompt?: string;
  negativePrompt?: string;
  coreFeatures?: string;
  imageUrl?: string;
  threeViewImageUrl?: string;
  turnaround?: CharacterTurnaroundData;
  variations: CharacterVariation[];
  status?: 'pending' | 'generating' | 'completed' | 'failed';

  // 【新增】病态微动作 - 反派专用
  // 结构：{ original: string, polished?: string, previewImageUrl?: string }
  // 示例：{ original: "说话前用舌头顶一下腮帮子", polished: "..." }
  microAction?: VisualDescriptionField;

  // 【新增】标志性姿态 - 所有主要角色
  // 结构：{ original: string, polished?: string, previewImageUrl?: string }
  // 示例：{ original: "靠在墙上，眼神不聚焦，仿佛无视一切", polished: "..." }
  signaturePose?: VisualDescriptionField;

  // 【新增】角色视觉描述增强 - S级视觉描写
  // 用于更细致的角色外观描述（发型、身材比例、手部动作等）
  enhancedVisualDescription?: {
    headAndHair?: string;      // 头部/发型具体描述
    upperBody?: string;        // 上半身/S形剪影等
    hands?: string;            // 手部动作习惯
    walkingPattern?: string;   // 行走姿态
  };
}

export interface Scene {
  id: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  negativePrompt?: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}

/**
 * 道具/物品 - 用于保持多分镜间物品视觉一致性
 * 如星图、武器、地图、信件等需要在多个镜头中重复出现的物品
 */
export interface Prop {
  id: string;
  name: string;
  category: string;
  description: string;
  visualPrompt?: string;
  negativePrompt?: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}

export type AssetLibraryItemType = 'character' | 'scene' | 'prop' | 'turnaround';

export interface AssetLibraryItem {
  id: string;
  type: AssetLibraryItemType;
  name: string;
  projectId?: string;
  projectName?: string;
  createdAt: number;
  updatedAt: number;
  data: Character | Scene | Prop;
  /** 
   * PB 记录 ID（首次同步后回存），
   * 用于跨项目去重和删除，避免依赖 data.id 误匹配。
   */
  cloudId?: string;
}

export interface Keyframe {
  id: string;
  type: 'start' | 'end';
  visualPrompt: string;
  imageUrl?: string; // 关键帧图像，存储为base64格式（data:image/png;base64,...）
  status: 'pending' | 'generating' | 'completed' | 'failed';
  visualPromptSource?: 'auto' | 'manual'; // 提示词来源：'auto'=AI可覆盖，'manual'=用户手工锁定
}

/** 视频生成模式 */
export type VideoGenerationMode = 'basic' | 'msr' | 'mkr' | 'mkr-grid';

/** MKR 模式下带时间位置的关键帧引用 */
export interface TimedKeyframe {
  keyframeId: string;
  positionPercent: number; // 0-100, 在视频时间轴上的位置百分比
}

export interface VideoInterval {
  id: string;
  startKeyframeId: string;
  endKeyframeId: string;
  duration: number;
  motionStrength: number;
  videoUrl?: string; // 视频数据，存储为base64格式（data:video/mp4;base64,...），避免URL过期问题
  videoPrompt?: string; // 视频生成时使用的提示词
  status: 'pending' | 'generating' | 'completed' | 'failed';
  // === 高级参数（扩展字段，旧项目兼容） ===
  mode?: VideoGenerationMode;        // 生成模式，默认 'basic'
  fps?: number;                      // 帧率，默认 30
  width?: number;                    // 视频宽度（从 aspectRatio 推断，或用户自定义）
  height?: number;                   // 视频高度
  timedKeyframes?: TimedKeyframe[];  // MKR 用：所有帧的时间位置列表
  backgroundImage?: string;          // MSR 用：背景图
  gridType?: number;                 // MKR Grid 用：宫格类型（如 3x3=9, 2x2=4）
  frameIndexes?: number[];           // MKR Grid 用：选中格子的索引
}

/**
 * 九宫格分镜预览 - 单个面板数据
 */
export interface NineGridPanel {
  index: number;           // 0-8, 九宫格位置索引
  shotSize: string;        // 景别：特写/近景/中景/全景/远景 等
  cameraAngle: string;     // 机位角度：俯拍/仰拍/平视/斜拍 等
  description: string;     // 该格子的视觉描述
}

/**
 * 九宫格分镜预览数据
 */
export interface NineGridData {
  panels: NineGridPanel[];  // 格子的描述数据
  gridnum?: number;         // 格子数量（默认 9）
  imageUrl?: string;        // 生成的九宫格图片 (base64)
  prompt?: string;          // 生成时使用的完整提示词
  status: 'pending' | 'generating_panels' | 'panels_ready' | 'generating_image' | 'completed' | 'failed';
  // generating_panels: AI正在生成镜头描述
  // panels_ready: 镜头描述已生成，等待用户确认/编辑后再生成图片
  // generating_image: 用户已确认，正在生成九宫格图片
  // V2 风格帧信息（风格帧→image2storyboard 流程）
  styleFramePrompt?: string; // 风格帧生成的提示词
  styleFrameUrl?: string;    // 风格帧图片
}

export interface FourGridDeduction {
  status: 'idle' | 'analyzing' | 'analysis_done' | 'generating' | 'completed' | 'failed';
  narrativeDirection?: string;
  vlmAnalysis?: string;
  descriptions: string[];
  selectedIndexes: number[];
  imageUrl?: string;
  imageId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Shot {
  id: string;
  sceneId: string;
  actionSummary: string;
  dialogue?: string; 
  cameraMovement: string;
  cameraChoreography?: CameraChoreography; // 结构化运镜编排（起点→路径→终点）
  shotSize?: string; 
  characters: string[]; // Character IDs
  characterVariations?: { [characterId: string]: string }; // Added: Map char ID to variation ID for this shot
  props?: string[]; // 道具ID数组，引用 ScriptData.props 中的道具
  keyframes: Keyframe[];
  interval?: VideoInterval;
  videoModel?: string; // 视频模型 ID，由 modelRegistry 管理
  nineGrid?: NineGridData; // 可选的九宫格分镜预览数据（高级功能）
  fourGrid?: FourGridDeduction;
  vlmAnalysis?: {
    startAnalysis: string;
    endAnalysis: string;
    startKeyframeId: string;
    endKeyframeId: string;
  };
}

// ============================================
// 运镜编排类型 —— "起点→路径→终点" 结构化运镜
// ============================================

export type ShotSizeLabel = '大远景' | '远景' | '全景' | '中全景' | '中景' | '中近景' | '近景' | '特写' | '大特写';
export type CameraAngleLabel = '平视' | '仰拍' | '俯拍' | '鸟瞰' | '斜拍' | '正面' | '侧面' | '背面' | '低角度';
export type SubjectPosition = '居中' | '左侧1/3' | '右侧1/3' | '黄金分割左' | '黄金分割右' | '边缘';
export type FocusType = '浅景深' | '深焦' | '全景清晰' | '柔焦' | '移轴';
export type MovementSpeedLabel = '极慢' | '慢速' | '中速' | '快速' | '极快';

export interface CameraChoreography {
  startShotSize: ShotSizeLabel;
  startAngle: CameraAngleLabel;
  startSubject: SubjectPosition;
  startFocus: FocusType;
  movementType: string;
  movementPath: string;
  movementSpeed: MovementSpeedLabel;
  movementIntensity: number;
  endShotSize: ShotSizeLabel;
  endAngle: CameraAngleLabel;
  endSubject: SubjectPosition;
  timingStartRatio: number;
  timingMoveRatio: number;
  timingEndRatio: number;
}

/**
 * 全局美术指导文档 - 用于统一所有角色和场景的视觉风格
 * 在生成任何角色/场景提示词之前，先由 AI 根据剧本内容生成此文档，
 * 后续所有视觉提示词生成都以此为约束，确保风格一致性。
 */
export interface ArtDirection {
  /** 全局色彩方案 */
  colorPalette: {
    primary: string;      // 主色调描述
    secondary: string;    // 辅色调
    accent: string;       // 点缀色
    skinTones: string;    // 肤色范围描述
    saturation: string;   // 整体饱和度倾向
    temperature: string;  // 整体色温倾向
  };
  /** 角色设计统一规则 */
  characterDesignRules: {
    proportions: string;   // 头身比、体型风格
    eyeStyle: string;      // 眼睛画法统一
    lineWeight: string;    // 线条粗细风格
    detailLevel: string;   // 细节密度级别
  };
  /** 统一光影处理方式 */
  lightingStyle: string;
  /** 材质/质感风格 */
  textureStyle: string;
  /** 3-5个核心风格关键词 */
  moodKeywords: string[];
  /** 一段统一风格的文字锚点描述，所有提示词生成时注入 */
  consistencyAnchors: string;
}

export interface ScriptData {
  title: string;
  genre: string;
  logline: string;
  targetDuration?: string;
  language?: string;
  visualStyle?: string; // Visual style: live-action, anime, 3d-animation, etc.
  shotGenerationModel?: string; // Model used for shot generation
  artDirection?: ArtDirection; // 全局美术指导文档，用于统一角色和场景的视觉风格
  characters: Character[];
  scenes: Scene[];
  props: Prop[]; // 道具列表，用于保持多分镜间物品视觉一致性
  storyParagraphs: { id: number; text: string; sceneRefId: string }[];
}

export interface RenderLog {
  id: string;
  timestamp: number; // Unix timestamp when API was called
  type: 'character' | 'character-variation' | 'scene' | 'prop' | 'keyframe' | 'video' | 'script-parsing';
  resourceId: string; // ID of the resource being generated
  resourceName: string; // Human-readable name
  status: 'success' | 'failed';
  model: string; // Model used (e.g., 'imagen-3', 'veo_3_1_i2v_s_fast_fl_landscape', 'gpt-41')
  prompt?: string; // The prompt used (optional, for debugging)
  error?: string; // Error message if failed
  inputTokens?: number; // Input tokens consumed
  outputTokens?: number; // Output tokens generated
  totalTokens?: number; // Total tokens (if available from API)
  duration?: number; // Time taken in milliseconds
}

/** 视频生成预设（参数快照） */
export interface VideoPreset {
  id: string;
  name: string;
  description?: string;
  version: number;        // 预设数据版本，用于向前兼容迁移
  createdAt: number;
  params: {
    mode: VideoGenerationMode;
    fps: number;
    width: number;
    height: number;
    duration: VideoDuration;
    modelId: string;
    aspectRatio: AspectRatio;
    backgroundImage?: string;
    timedKeyframes?: TimedKeyframe[];
  };
}

export interface ProjectState {
  id: string;
  userId?: string;
  title: string;
  createdAt: number;
  lastModified: number;
  version: number;
  stage: 'script' | 'assets' | 'director' | 'editor' | 'export' | 'prompts' | 'canvas';
  
  // Script Phase Data
  rawScript: string;
  targetDuration: string;
  language: string;
  visualStyle: string; // Visual style: live-action, anime, 3d-animation, etc.
  shotGenerationModel: string; // Model for shot generation
  
  /** 领域知识：时代背景描述（如"抗日战争1940年华北"），注入AI提示词增强历史/文化准确性 */
  eraContext?: string;
  /** 领域知识：自定义知识库（如风格参考、文化细节、技术规范等），逐行注入 */
  knowledgeBase?: string;
  
  scriptData: ScriptData | null;
  shots: Shot[];
  isParsingScript: boolean;
  renderLogs: RenderLog[]; // History of all API calls for this project
  aspectRatio?: AspectRatio; // 工程级横竖屏比例（可选，向后兼容）
  videoPresets?: VideoPreset[]; // 项目级视频生成预设列表
}

// ============================================
// 横竖屏与视频时长类型
// 注意：模型配置相关类型已迁移至 types/model.ts
// ============================================

/**
 * 横竖屏比例类型
 * - 16:9: 横屏（默认）
 * - 9:16: 竖屏
 * - 1:1: 方形
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

// ============================================
// 视觉一致性检查类型
// ============================================

export type ConflictType =
  | 'clothing_mismatch'
  | 'hairstyle_mismatch'
  | 'accessory_mismatch'
  | 'feature_mismatch'
  | 'color_temperature'
  | 'prop_position';

export type ConflictSeverity = 'error' | 'warning' | 'info';

export interface ConsistencyConflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  characterId: string;
  characterName: string;
  shotIds: string[];
  description: string;
  isPlotDriven: boolean;
  plotExplanation: string | null;
  suggestion: string | null;
  userDecision?: 'dismissed' | 'fixed' | 'pending';
}

export interface ConsistencyCheckResult {
  characterId: string;
  characterName: string;
  totalShots: number;
  consistencyScore: number;
  conflicts: ConsistencyConflict[];
  passed: boolean;
}

/**
 * 视频时长类型（仅异步视频模型支持）
 */
export type VideoDuration = number; // 3-15 秒，运行时由 model 的 supportedDurations 约束

/**
 * 将结构化运镜编排渲染为提示词段落
 * 输出格式:
 *   【运镜编排】
 *   0-2.4s [起始:中景/平视/居中/浅景深] 动作描述 - 镜头稳定构图
 *   2.4-5.6s [推镜头] 沿Z轴向前推进至面部特写 | 速度:中速 强度:6/10
 *   5.6-8s [结束:近景/仰拍/黄金分割左] 最终画面构成
 */
export function renderCameraChoreographyPrompt(
  cc: CameraChoreography,
  actionSummary: string,
  totalSeconds: number = 8
): string {
  const tStart = Math.round(totalSeconds * cc.timingStartRatio * 10) / 10;
  const tMove = Math.round(totalSeconds * cc.timingMoveRatio * 10) / 10;
  const tEnd = Math.round(totalSeconds * cc.timingEndRatio * 10) / 10;

  const tStartEnd = tStart;
  const tMoveEnd = Math.round((tStart + tMove) * 10) / 10;
  const tEndEnd = totalSeconds;

  const speedMap: Record<MovementSpeedLabel, string> = {
    '极慢': 'very-slow',
    '慢速': 'slow',
    '中速': 'medium',
    '快速': 'fast',
    '极快': 'very-fast',
  };

  return `【运镜编排】
0-${tStartEnd}s [起始:${cc.startShotSize}/${cc.startAngle}/主体${cc.startSubject}/${cc.startFocus}] ${actionSummary} — 镜头稳定构图，为运动预留空间
${tStartEnd}-${tMoveEnd}s [${cc.movementType}] ${cc.movementPath} | 速度:${cc.movementSpeed}(${speedMap[cc.movementSpeed]}) 强度:${cc.movementIntensity}/10
${tMoveEnd}-${tEndEnd}s [结束:${cc.endShotSize}/${cc.endAngle}/主体${cc.endSubject}] 镜头到位，定格最终画面`;
}
