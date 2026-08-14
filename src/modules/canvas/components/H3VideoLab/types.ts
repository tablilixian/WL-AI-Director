// H3 提示词工作室 — 数据模型
// 严格对齐官方 MiniMax H3 提示词协议（skills/h3-prompt-writing，base 模式：I2VA / FL2VA / L2VA）。
// 官方图生视频结构 = 首行「指令行」+ 空行 + 3 个核心字段：
//   integrated_multimodal_description / overall_soundscape / non_diegetic_music
// （subject_definitions / summary / retention_analysis 属 Ref2VA 全参考模式，本工作室不涉及。）
// 本文件不依赖任何现有面板，独立承载工作室功能的数据结构。

/** H3 图生视频模式 */
export type H3Mode = 'i2va' | 'fl2va' | 'l2va';

/** 源图在提示词中的角色（决定指令行锚定位置） */
export type H3ImageRole = 'first' | 'last' | 'ref';

/** 源图规格：仅角色，顺序即 <Picture N> 序号 */
export interface H3ImageSpec {
  role: H3ImageRole;
}

/** 结构化对白：在时间轴上自动转为 <d>[语言] 文本</d> 并按时间追加为镜头行 */
export interface H3Dialogue {
  id: string;
  timestamp: number; // 秒，支持小数（如 3.0）
  character: string; // 说话角色名（可空 = 不署名人声）
  text: string; // 对白内容（不含 <d> 标签，拼装时自动包裹）
}

/** 三种模式的元信息（供 UI 选择 + 规则参考展示） */
export const H3_MODE_META: Record<
  H3Mode,
  {
    label: string;
    en: string;
    desc: string;
    primaryLabel: string;
    needsLast: boolean;
    supportsRef: boolean;
  }
> = {
  i2va: {
    label: '首帧生视频',
    en: 'I2VA',
    desc: '单张首帧 → 视频，从首帧向前发展',
    primaryLabel: '首帧',
    needsLast: false,
    supportsRef: true,
  },
  fl2va: {
    label: '首尾帧',
    en: 'FL2VA',
    desc: '首帧 + 尾帧，模型精确插值到结尾',
    primaryLabel: '首帧',
    needsLast: true,
    supportsRef: false,
  },
  l2va: {
    label: '尾帧生视频',
    en: 'L2VA',
    desc: '单张尾帧 → 视频，向该尾帧收敛',
    primaryLabel: '尾帧',
    needsLast: false,
    supportsRef: true,
  },
};

/** H3 工作室面板的完整配置（同时作为生成落盘的 generationPrompt 快照） */
export interface H3LabConfig {
  mode: H3Mode;
  images: H3ImageSpec[]; // 顺序即 <Picture N> 序号；first/last 决定锚定
  description: string; // 综合多模态描述（integrated_multimodal_description 核心段，建议英文）
  soundscape: string; // 整体声景（overall_soundscape）
  music: string; // 非叙事性音乐（non_diegetic_music，无则 N/A）
  dialogues: H3Dialogue[];
  dialogueLang: string; // 对白 <d> 标签语言名（Chinese / English / ...）
  promptLang: 'en' | 'zh'; // 描述体语言（官方建议英文，H3 按英文结构调参）
  durationSec: number;
  aspectRatio: H3AspectRatio;
}

/** 支持的画幅比例（与后台 image2video 接口一致：仅 16:9 / 9:16 / 1:1） */
export const H3_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type H3AspectRatio = (typeof H3_ASPECT_RATIOS)[number];

/** 画幅 → 像素尺寸（用于落盘图层宽高） */
export const H3_ASPECT_DIMS: Record<H3AspectRatio, [number, number]> = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [1024, 1024],
};

/** <d> 标签语言名（官方示例用英文语言名，如 [English] / [Chinese]） */
export const H3_DIALOGUE_LANGS = [
  'Chinese',
  'English',
  'Japanese',
  'Korean',
  'French',
  'Spanish',
] as const;

/**
 * 官方运镜词表（camera motion：动作类型 + 幅度 + 速度）。
 * 完整写法示例：The camera pushes in with small amplitude at slow speed toward ...
 */
export const H3_CAMERA_MOTIONS: string[] = [
  'Zoom In',
  'Zoom Out',
  'Push In',
  'Pull Out',
  'Pan Left',
  'Pan Right',
  'Truck Left',
  'Truck Right',
  'Tilt Up',
  'Tilt Down',
  'Pedestal Up',
  'Pedestal Down',
  'Arc Shot',
  'Tracking Shot',
  'Static Shot',
  'Shake Slightly',
  'Shake Strongly',
  'POV',
  'Roll Clockwise',
  'Roll Counterclockwise',
];
/** 运镜幅度 / 速度修饰（与动作类型组合成完整运镜表达） */
export const H3_CAMERA_MODIFIERS = [
  'with small amplitude',
  'with large amplitude',
  'at slow speed',
  'at fast speed',
];

/** 标签页枚举（图生视频 base 模式：仅 4 段 + 设置） */
export type H3Tab = 'description' | 'soundscape' | 'music' | 'dialogue' | 'settings';

/** 各段占位示例（引导用户输入，对齐官方 base-en.txt 英文结构） */
export const H3_PLACEHOLDERS = {
  description:
    '[Shot 1] Live-action, cinematic, the young woman shown in <Picture 1> sits by a rain-streaked window, preserving her sweater, seat position, and the room layout. The camera pushes in with small amplitude at slow speed as she turns toward the man and says: <d>[Chinese] 要是时间能停在这一刻就好了。</d>\n[Shot 2] At 00:04.000, the camera cuts to a close-up as he takes her hand.',
  soundscape:
    'Steady rain taps against the window while low room ambience continues underneath. The entrance bell rings once, followed by soft footsteps and the rustle of clothing.',
  music:
    'Sustained cello notes at a slow tempo with widely spaced piano tones, gradually decreasing in volume.',
  dialogueText: '要是时间能停在这一刻就好了',
} as const;
