/**
 * 模型抽象层类型定义
 * 定义模型注册、配置、适配器相关的所有类型
 */

// ============================================
// 基础类型
// ============================================

/**
 * 模型类型
 */
export type ModelType = 'chat' | 'image' | 'video';

/**
 * 横竖屏比例类型
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * 视频时长类型（仅异步视频模式支持）
 */
export type VideoDuration = 4 | 5 | 8 | 10 | 12;

/**
 * 视频生成模式
 */
export type VideoMode = 'sync' | 'async';

// ============================================
// 模型参数配置
// ============================================

/**
 * 对话模型参数
 */
export interface ChatModelParams {
  temperature: number;           // 温度 0-2，默认 0.7
  maxTokens?: number;            // 最大 token，留空表示不限制
  topP?: number;                 // Top P，可选
  frequencyPenalty?: number;     // 频率惩罚，可选
  presencePenalty?: number;      // 存在惩罚，可选
}

/**
 * 图片模型参数
 */
export interface ImageModelParams {
  defaultAspectRatio: AspectRatio;
  supportedAspectRatios: AspectRatio[];
}

/**
 * 视频模型参数
 */
export interface VideoModelParams {
  mode: VideoMode;                        // sync=Veo, async=Sora
  defaultAspectRatio: AspectRatio;
  supportedAspectRatios: AspectRatio[];
  defaultDuration: VideoDuration;
  supportedDurations: VideoDuration[];
}

/**
 * 模型参数联合类型
 */
export type ModelParams = ChatModelParams | ImageModelParams | VideoModelParams;

// ============================================
// 模型定义
// ============================================

/**
 * 模型定义基础接口
 */
export interface ModelDefinitionBase {
  id: string;                    // 唯一标识，如 'gpt-5.1'
  apiModel?: string;             // API 实际模型名（可与其他模型重复）
  name: string;                  // 显示名称，如 'GPT-5.1'
  type: ModelType;               // 模型类型
  providerId: string;            // 提供商 ID
  endpoint?: string;             // API 端点（可覆盖默认）
  description?: string;          // 描述
  isBuiltIn: boolean;            // 是否内置（内置模型不可删除）
  isEnabled: boolean;             // 是否启用
  apiKey?: string;               // 模型专属 API Key（可选，为空时使用全局 Key）
}

/**
 * 对话模型定义
 */
export interface ChatModelDefinition extends ModelDefinitionBase {
  type: 'chat';
  params: ChatModelParams;
}

/**
 * 图片模型定义
 */
export interface ImageModelDefinition extends ModelDefinitionBase {
  type: 'image';
  params: ImageModelParams;
}

/**
 * 视频模型定义
 */
export interface VideoModelDefinition extends ModelDefinitionBase {
  type: 'video';
  params: VideoModelParams;
}

/**
 * 模型定义联合类型
 */
export type ModelDefinition = ChatModelDefinition | ImageModelDefinition | VideoModelDefinition;

// ============================================
// 提供商定义
// ============================================

/**
 * 模型提供商配置
 */
export interface ModelProvider {
  id: string;                    // 唯一标识
  name: string;                  // 显示名称
  baseUrl: string;               // API 基础 URL
  apiKey?: string;               // 独立 API Key（可选）
  isBuiltIn: boolean;            // 是否内置
  isDefault: boolean;            // 是否为默认提供商
}

// ============================================
// 注册中心状态
// ============================================

/**
 * 激活的模型配置
 */
export interface ActiveModels {
  chat: string;                  // 当前激活的对话模型 ID
  image: string;                 // 当前激活的图片模型 ID
  video: string;                 // 当前激活的视频模型 ID
}

/**
 * 模型注册中心状态
 */
export interface ModelRegistryState {
  providers: ModelProvider[];
  models: ModelDefinition[];
  activeModels: ActiveModels;
  globalApiKey?: string;
}

// ============================================
// 服务调用参数
// ============================================

/**
 * 对话服务调用参数
 */
export interface ChatOptions {
  prompt: string;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
  timeout?: number;
  // 可选覆盖模型参数
  overrideParams?: Partial<ChatModelParams>;
}

/**
 * 图片生成调用参数
 */
export interface ImageGenerateOptions {
  prompt: string;
  referenceImages?: string[];
  aspectRatio?: AspectRatio;
  resourceType?: string;  // 资源类型：character, scene, prop, keyframe等
  resourceId?: string;    // 资源ID：用于构建存储路径
}

/**
 * 视频生成调用参数
 */
export interface VideoGenerateOptions {
  prompt: string;
  startImage?: string;
  endImage?: string;
  aspectRatio?: AspectRatio;
  duration?: VideoDuration;
}

// ============================================
// 默认值常量
// ============================================

/**
 * 默认对话模型参数
 */
export const DEFAULT_CHAT_PARAMS: ChatModelParams = {
  temperature: 0.7,
  maxTokens: undefined,
};

/**
 * 默认图片模型参数
 * 注意：Gemini 3 Pro Image 只支持横屏(16:9)和竖屏(9:16)，不支持方形(1:1)
 */
export const DEFAULT_IMAGE_PARAMS: ImageModelParams = {
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],
};

/**
 * 默认视频模型参数 (Veo 首尾帧模式)
 */
export const DEFAULT_VIDEO_PARAMS_VEO: VideoModelParams = {
  mode: 'sync',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],  // Veo 不支持 1:1
  defaultDuration: 8,
  supportedDurations: [8],  // Veo 固定时长
};

/**
 * 默认视频模型参数 (Sora)
 */
export const DEFAULT_VIDEO_PARAMS_SORA: VideoModelParams = {
  mode: 'async',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16', '1:1'],
  defaultDuration: 8,
  supportedDurations: [4, 8, 12],
};

/**
 * 默认视频模型参数 (Veo 3.1 Fast)
 */
export const DEFAULT_VIDEO_PARAMS_VEO_FAST: VideoModelParams = {
  mode: 'async',
  defaultAspectRatio: '16:9',
  supportedAspectRatios: ['16:9', '9:16'],
  defaultDuration: 8,
  supportedDurations: [8],
};

// ============================================
// 内置模型定义
// ============================================

/**
 * 内置对话模型列表
 */
export const BUILTIN_CHAT_MODELS: ChatModelDefinition[] = [
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    type: 'chat',
    providerId: 'antsk',
    description: '剧情脚本切分首选：结构化输出稳定，适合分场/分镜、提取人物与事件',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    type: 'chat',
    providerId: 'antsk',
    description: '创意增强型切分：更适合提供多种切分方案，改写节奏与镜头建议（一致性略弱）',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'gpt-41',
    name: 'GPT-4.1',
    type: 'chat',
    providerId: 'antsk',
    description: '严谨切分：对复杂叙事与长文本更稳，适合时间线梳理、因果关系与要点校对',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    type: 'chat',
    providerId: 'antsk',
    description: '长文友好：适合长篇剧本的分段、摘要与角色弧线整理，文字表达更细腻',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  // BigModel Chat Models
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    type: 'chat',
    providerId: 'bigmodel',
    apiModel: 'glm-4-plus',
    endpoint: '/api/paas/v4/chat/completions',
    description: '智谱 GLM-4 Plus 高性能对话模型，适合剧本分析和脚本生成',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'glm-4-air',
    name: 'GLM-4 Air (高性价比)',
    type: 'chat',
    providerId: 'bigmodel',
    apiModel: 'glm-4-air',
    endpoint: '/api/paas/v4/chat/completions',
    description: '智谱 GLM-4 Air 高性价比对话模型，性能接近 GLM-4 Plus，价格仅为 50%',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash (免费)',
    type: 'chat',
    providerId: 'bigmodel',
    apiModel: 'glm-4-flash',
    endpoint: '/api/paas/v4/chat/completions',
    description: '智谱 GLM-4 Flash 免费快速响应模型，适合实时对话和快速生成',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'glm-4',
    name: 'GLM-4',
    type: 'chat',
    providerId: 'bigmodel',
    apiModel: 'glm-4',
    endpoint: '/api/paas/v4/chat/completions',
    description: '智谱 GLM-4 对话模型，稳定可靠',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
];

/**
 * 内置图片模型列表
 */
export const BUILTIN_IMAGE_MODELS: ImageModelDefinition[] = [
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image(Nano Banana Pro)',
    type: 'image',
    providerId: 'antsk',
    endpoint: '/v1beta/models/gemini-3-pro-image-preview:generateContent',
    description: 'Google Nano Banana Pro 图片生成模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
  // BigModel Image Models
  {
    id: 'cogview-3-flash',
    name: 'CogView-3 Flash (免费)',
    type: 'image',
    providerId: 'bigmodel',
    apiModel: 'cogview-3-flash',
    endpoint: '/api/paas/v4/images/generations',
    description: '智谱 CogView-3 Flash 免费图像生成模型，快速生成，适合体验',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
  {
    id: 'cogview-4',
    name: 'CogView-4',
    type: 'image',
    providerId: 'bigmodel',
    apiModel: 'cogview-4',
    endpoint: '/api/paas/v4/images/generations',
    description: '智谱 CogView-4 图像生成模型，支持多种风格和尺寸',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
  {
    id: 'cogview-3-plus',
    name: 'CogView-3 Plus',
    type: 'image',
    providerId: 'bigmodel',
    apiModel: 'cogview-3-plus',
    endpoint: '/api/paas/v4/images/generations',
    description: '智谱 CogView-3 Plus 高质量图像生成模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
  {
    id: 'cogview-3',
    name: 'CogView-3',
    type: 'image',
    providerId: 'bigmodel',
    apiModel: 'cogview-3',
    endpoint: '/api/paas/v4/images/generations',
    description: '智谱 CogView-3 图像生成模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_IMAGE_PARAMS },
  },
];

/**
 * 内置视频模型列表
 */
export const BUILTIN_VIDEO_MODELS: VideoModelDefinition[] = [
  {
    id: 'veo',
    name: 'Veo 3.1 首尾帧',
    type: 'video',
    providerId: 'antsk',
    endpoint: '/v1/chat/completions',
    description: 'Veo 3.1 首尾帧模式，需要起始帧和结束帧',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_VEO },
  },
  {
    id: 'veo_3_1-fast',
    name: 'Veo 3.1 Fast',
    type: 'video',
    providerId: 'antsk',
    endpoint: '/v1/videos',
    description: '异步模式，支持横屏/竖屏、支持单图和首尾帧，固定 8 秒时长,价格便宜速度快',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_VEO_FAST },
  },
  {
    id: 'sora-2',
    name: 'Sora-2',
    type: 'video',
    providerId: 'antsk',
    endpoint: '/v1/videos',
    description: 'OpenAI Sora 视频生成，异步模式，支持多种时长',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_VIDEO_PARAMS_SORA },
  },
  // BigModel Video Models
  {
    id: 'vidu2',
    name: 'Vidu2 图生视频',
    type: 'video',
    providerId: 'bigmodel',
    apiModel: 'vidu2-image',
    endpoint: '/api/paas/v4/videos/generations',
    description: '智谱 Vidu2 图生视频模型，支持多种分辨率和时长（仅支持横屏）',
    isBuiltIn: true,
    isEnabled: true,
    params: {
      mode: 'async',
      defaultAspectRatio: '16:9',
      supportedAspectRatios: ['16:9'],
      defaultDuration: 5,
      supportedDurations: [5, 10],
    },
  },
  {
    id: 'viduq1',
    name: 'ViduQ1 图生视频',
    type: 'video',
    providerId: 'bigmodel',
    apiModel: 'viduq1-image',
    endpoint: '/api/paas/v4/videos/generations',
    description: '智谱 ViduQ1 图生视频模型，高质量快速生成',
    isBuiltIn: true,
    isEnabled: true,
    params: {
      mode: 'async',
      defaultAspectRatio: '16:9',
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
      defaultDuration: 5,
      supportedDurations: [5, 10],
    },
  },
  {
    id: 'cogvideox-flash',
    name: 'CogVideoX Flash (免费)',
    type: 'video',
    providerId: 'bigmodel',
    apiModel: 'cogvideox-flash',
    endpoint: '/api/paas/v4/videos/generations',
    description: '智谱 CogVideoX Flash 免费视频生成模型，适合基础视频制作（仅支持横屏）',
    isBuiltIn: true,
    isEnabled: true,
    params: {
      mode: 'async',
      defaultAspectRatio: '16:9',
      supportedAspectRatios: ['16:9'],
      defaultDuration: 5,
      supportedDurations: [5, 10],
    },
  },
  {
    id: 'cogvideox-3',
    name: 'CogVideoX 图生视频',
    type: 'video',
    providerId: 'bigmodel',
    apiModel: 'cogvideox-3',
    endpoint: '/api/paas/v4/videos/generations',
    description: '智谱 CogVideoX 图生视频模型，支持高达 4K 分辨率（仅支持横屏）',
    isBuiltIn: true,
    isEnabled: true,
    params: {
      mode: 'async',
      defaultAspectRatio: '16:9',
      supportedAspectRatios: ['16:9'],
      defaultDuration: 5,
      supportedDurations: [5, 10],
    },
  },
];

/**
 * 内置提供商列表
 */
export const BUILTIN_PROVIDERS: ModelProvider[] = [
  {
    id: 'antsk',
    name: 'BigBanana API (api.antsk.cn)',
    baseUrl: 'https://api.antsk.cn',
    isBuiltIn: true,
    isDefault: true,
  },
  {
    id: 'bigmodel',
    name: 'BigModel API (open.bigmodel.cn)',
    baseUrl: 'https://open.bigmodel.cn',
    isBuiltIn: true,
    isDefault: false,
  },
];

/**
 * 所有内置模型
 */
export const ALL_BUILTIN_MODELS: ModelDefinition[] = [
  ...BUILTIN_CHAT_MODELS,
  ...BUILTIN_IMAGE_MODELS,
  ...BUILTIN_VIDEO_MODELS,
];

/**
 * 默认激活模型
 */
export const DEFAULT_ACTIVE_MODELS: ActiveModels = {
  chat: 'gpt-5.1',
  image: 'gemini-3-pro-image-preview',
  video: 'sora-2',
};
