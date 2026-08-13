/**
 * 七层提示词架构 - 结构化类型定义
 *
 * 参考 Hell-Grind-AIGC-Skill 的 prompt-architecture，将扁平字符串 prompt
 * 升级为分层结构化对象，支持按层诊断、复用与注入。
 *
 * 分层原则（按变更频率）：
 * - system prompt: L1 意图规则 + L5 摄影(美术指导) + L6 约束 + L7 连续性
 * - user prompt:   L2 资产 + L3 空间 + L4 动作
 *
 * 详见 docs/analysis/seven-layer-prompt-implementation.md
 */

import type { ArtDirection, CameraChoreography, Character, Prop, Scene } from '../types';

/** 生成目标类型，决定意图层的角色设定与输出格式 */
export type PromptTarget =
  | 'art-direction' // 全局美术指导文档
  | 'character-design' // 角色视觉设计
  | 'scene-environment' // 场景环境（无人物）
  | 'prop-design' // 道具设计
  | 'keyframe-start' // 关键帧-起始帧
  | 'keyframe-end' // 关键帧-结束帧
  | 'video-motion' // 视频运动
  | 'style-detection'; // 风格检测

/**
 * L1 意图层
 * 描述"这次生成要做什么"以及"输出应该长什么样"。
 */
export interface PromptIntent {
  target: PromptTarget;
  /** 视觉风格（live-action / anime / 3d-animation 等），用于角色行与资产层 */
  visualStyle?: string;
  /** 输出格式：json / text */
  outputFormat: 'json' | 'text';
  /** JSON 结构描述（当 outputFormat='json' 时） */
  outputSchema?: string;
  /** 输出语言，如 '中文' / 'English' */
  language: string;
  /** 期望字数范围（用于约束生成长度） */
  wordCountRange?: { min: number; max: number };
  /** 质量增强标签（来自 promptConstants.DEFAULT_QUALITY_TAGS） */
  qualityTags?: string;
  /** 是否保留英文摄影术语不翻译（如 Rembrandt lighting / Dutch angle） */
  cinematographyTermsRule?: boolean;
}

/**
 * L6 约束层 - 三栏约束（借鉴 HGAS）
 * 比单纯 negativePrompt 更精准地控制跨镜头一致性。
 */
export interface ShotConstraint {
  /** 必须保持不变的元素（如"红色外套"、"短发"、"标志性伤疤"） */
  mustHold: string[];
  /** 本镜头允许发生的变化（如"衣服破损"、"从站立到跪下"） */
  changesHere: string[];
  /** 禁止出现的元素（即增强版 negativePrompt） */
  mustNotAppear: string[];
}

/**
 * L7 连续性层上下文
 * 注入前后镜头/角色状态，保证跨镜头视觉连贯。
 */
export interface ContinuityContext {
  /** 前一镜头动作/画面摘要 */
  previousShotSummary?: string;
  /** 当前镜头中每个角色的状态版本 */
  characterStates: {
    characterId: string;
    /** 状态标签，如 "default" / "受伤后" / "换装后" */
    stateLabel: string;
    /** 相对基线的视觉变化描述 */
    visualDelta?: string;
  }[];
  /** 美术指导一致性锚点（从 ArtDirection.consistencyAnchors 透传） */
  consistencyAnchors?: string;
}

/** L2 资产层数据容器 */
export interface PromptAssets {
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
  /** 时代背景注入块（来自 eraContext.buildEraContextBlock） */
  eraContextBlock?: string;
}

/** L3 空间层数据 */
export interface PromptSpatial {
  cameraChoreography?: CameraChoreography;
  /** 自定义机位角度（当无结构化 CameraChoreography 时） */
  customAngle?: string;
  /** 自定义景别（当无结构化 CameraChoreography 时） */
  customShotSize?: string;
}

/** L4 动作层数据 */
export interface PromptAction {
  actionSummary?: string;
  dialogue?: string;
  /** 微动作特征（来自 Character.microAction） */
  microActions?: string[];
  /** 标志性姿态（来自 Character.signaturePose） */
  signaturePoses?: string[];
}

/**
 * 七层结构化提示词容器
 * PromptBuilder 消费此对象，分别渲染 system / user prompt。
 */
export interface LayeredPrompt {
  intent: PromptIntent;
  assets: PromptAssets;
  spatial?: PromptSpatial;
  action?: PromptAction;
  photography?: ArtDirection;
  constraints?: ShotConstraint;
  continuity?: ContinuityContext;
}
