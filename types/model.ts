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
  // OpenRouter Free Chat Models (2026-03) - 已禁用
  // 注意：OpenRouter baseUrl 已包含 /api/v1，endpoint 只需 /chat/completions
  /*
  {
    id: 'or-llama-3.3-70b',
    name: 'Llama 3.3 70B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'meta-llama/llama-3.3-70b-instruct:free',
    endpoint: '/chat/completions',
    description: 'Meta Llama 3.3 70B，通用对话模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-qwen3-coder',
    name: 'Qwen3 Coder (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'qwen/qwen3-coder:free',
    endpoint: '/chat/completions',
    description: 'Qwen3 代码专用模型，262K 上下文',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-qwen3-next-80b',
    name: 'Qwen3 Next 80B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'qwen/qwen3-next-80b-a3b-instruct:free',
    endpoint: '/chat/completions',
    description: 'Qwen3 Next 80B MoE 指令模型，262K 上下文',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gemma-3-27b',
    name: 'Gemma 3 27B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'google/gemma-3-27b-it:free',
    endpoint: '/chat/completions',
    description: 'Google Gemma 3 27B，支持视觉输入',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gemma-3-12b',
    name: 'Gemma 3 12B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'google/gemma-3-12b-it:free',
    endpoint: '/chat/completions',
    description: 'Google Gemma 3 12B',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gemma-3-4b',
    name: 'Gemma 3 4B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'google/gemma-3-4b-it:free',
    endpoint: '/chat/completions',
    description: 'Google Gemma 3 4B，轻量级模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gpt-oss-120b',
    name: 'GPT-OSS 120B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'openai/gpt-oss-120b:free',
    endpoint: '/chat/completions',
    description: 'OpenAI 开源 120B 模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gpt-oss-20b',
    name: 'GPT-OSS 20B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'openai/gpt-oss-20b:free',
    endpoint: '/chat/completions',
    description: 'OpenAI 开源 20B 模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-glm-4.5-air',
    name: 'GLM-4.5 Air (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'z-ai/glm-4.5-air:free',
    endpoint: '/chat/completions',
    description: '智谱 GLM-4.5 Air 轻量版',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-nemotron-3-super',
    name: 'Nemotron 3 Super 120B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    endpoint: '/chat/completions',
    description: 'NVIDIA Nemotron 3 Super 120B，262K 上下文',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-nemotron-3-nano',
    name: 'Nemotron 3 Nano 30B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'nvidia/nemotron-3-nano-30b-a3b:free',
    endpoint: '/chat/completions',
    description: 'NVIDIA Nemotron 3 Nano 30B MoE',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-nemotron-nano-9b',
    name: 'Nemotron Nano 9B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'nvidia/nemotron-nano-9b-v2:free',
    endpoint: '/chat/completions',
    description: 'NVIDIA Nemotron Nano 9B v2',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-nemotron-nano-12b-vl',
    name: 'Nemotron Nano 12B VL (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
    endpoint: '/chat/completions',
    description: 'NVIDIA Nemotron Nano 12B，支持视觉',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-mistral-small',
    name: 'Mistral Small 3.1 24B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'mistralai/mistral-small-3.1-24b-instruct:free',
    endpoint: '/chat/completions',
    description: 'Mistral Small 3.1 24B 指令模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-step-3.5-flash',
    name: 'Step 3.5 Flash (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'stepfun/step-3.5-flash:free',
    endpoint: '/chat/completions',
    description: '阶跃星辰 Step 3.5 Flash，256K 上下文',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-trinity-large',
    name: 'Trinity Large (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'arcee-ai/trinity-large-preview:free',
    endpoint: '/chat/completions',
    description: 'Arcee AI Trinity Large 预览版',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-trinity-mini',
    name: 'Trinity Mini (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'arcee-ai/trinity-mini:free',
    endpoint: '/chat/completions',
    description: 'Arcee AI Trinity Mini 轻量版',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-lfm-thinking',
    name: 'LFM 2.5 1.2B Thinking (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'liquid/lfm-2.5-1.2b-thinking:free',
    endpoint: '/chat/completions',
    description: 'Liquid AI LFM 2.5 思维链推理模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-lfm-instruct',
    name: 'LFM 2.5 1.2B Instruct (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'liquid/lfm-2.5-1.2b-instruct:free',
    endpoint: '/chat/completions',
    description: 'Liquid AI LFM 2.5 指令模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-dolphin-mistral',
    name: 'Dolphin Mistral 24B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    endpoint: '/chat/completions',
    description: 'Dolphin Mistral 24B Venice 版',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gemma-3n-e4b',
    name: 'Gemma 3N E4B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'google/gemma-3n-e4b-it:free',
    endpoint: '/chat/completions',
    description: 'Google Gemma 3N E4B，极轻量模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-gemma-3n-e2b',
    name: 'Gemma 3N E2B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'google/gemma-3n-e2b-it:free',
    endpoint: '/chat/completions',
    description: 'Google Gemma 3N E2B，超轻量模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-qwen3-4b',
    name: 'Qwen3 4B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'qwen/qwen3-4b:free',
    endpoint: '/chat/completions',
    description: 'Qwen3 4B 轻量级模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-llama-3.2-3b',
    name: 'Llama 3.2 3B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'meta-llama/llama-3.2-3b-instruct:free',
    endpoint: '/chat/completions',
    description: 'Meta Llama 3.2 3B 超轻量模型',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  {
    id: 'or-hermes-3-405b',
    name: 'Hermes 3 405B (免费)',
    type: 'chat',
    providerId: 'openrouter',
    apiModel: 'nousresearch/hermes-3-llama-3.1-405b:free',
    endpoint: '/chat/completions',
    description: 'Nous Research Hermes 3 基于 Llama 3.1 405B',
    isBuiltIn: true,
    isEnabled: true,
    params: { ...DEFAULT_CHAT_PARAMS },
  },
  */
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
  // OpenRouter provider - 已禁用
  /*
  {
    id: 'openrouter',
    name: 'OpenRouter (openrouter.ai)',
    baseUrl: 'https://openrouter.ai/api',
    isBuiltIn: true,
    isDefault: false,
  },
  */
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
