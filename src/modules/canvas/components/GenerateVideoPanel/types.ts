import type React from 'react';
import { UI_VIDEO_SIZE_PRESETS } from '../../../../../config/sizeConfig';
import type { LayerData } from '../../types/canvas';

// ─── 类型定义（原 GenerateVideoPanel.tsx 共享类型，Phase 3 拆分抽出） ───

export interface ImageSequenceItem {
  layerId: string;
  order: number;
  imagePrompt: string;
}

export interface CameraMovement {
  id: string;
  label: string;
  description: string;
  promptEn: string;
}

export interface LightingPreset {
  id: string;
  label: string;
  description: string;
  promptEn: string;
}

export interface DialogueEntry {
  id: string;
  timestamp: number;
  type: 'dialogue' | 'narration';
  character: string;
  text: string;
}

export interface VideoSizePreset {
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
}

export type RightTab =
  'prompt' | 'settings' | 'camera' | 'lighting' | 'dialogue' | 'actions' | 'templates';

export interface TimestampActionItem {
  id: string;
  startTime: number;
  endTime: number;
  description: string;
}

export interface TemplatePreset {
  id: string;
  name: string;
  description: string;
  category: string;
  subjectPrompt: string;
  actionPrompt: string;
  environmentPrompt: string;
  stylePrompt: string;
  negativePrompt: string;
  cameraId: string;
  cameraIntensity: number;
  cameraSpeed: number;
  lightingId: string;
  lightingIntensity: number;
  durationMs: number;
}

// ─── 常量 ───

export const VIDEO_SIZE_PRESETS: VideoSizePreset[] =
  UI_VIDEO_SIZE_PRESETS as unknown as VideoSizePreset[];

export const CAMERA_MOVEMENTS: CameraMovement[] = [
  {
    id: 'none',
    label: '固定镜头',
    description: '摄像机保持静止',
    promptEn: 'Static shot, camera remains fixed, no movement.',
  },
  {
    id: 'push-in',
    label: '推镜头',
    description: '摄像机匀速向前推进，聚焦主体',
    promptEn:
      'Camera slowly pushes in towards the subject, gradual dolly forward, intensifying focus.',
  },
  {
    id: 'pull-out',
    label: '拉镜头',
    description: '摄像机匀速向后拉远，展示环境',
    promptEn: 'Camera slowly pulls out, dolly backward, revealing the surrounding environment.',
  },
  {
    id: 'pan-left',
    label: '左摇摄',
    description: '摄像机水平向左旋转',
    promptEn: 'Camera pans left, horizontal rotation from left to right, revealing the scene.',
  },
  {
    id: 'pan-right',
    label: '右摇摄',
    description: '摄像机水平向右旋转',
    promptEn: 'Camera pans right, horizontal rotation, revealing the scene dynamically.',
  },
  {
    id: 'tilt-up',
    label: '上仰摄',
    description: '摄像机向上仰起',
    promptEn: 'Camera tilts upward, revealing the upper part of the scene or subject.',
  },
  {
    id: 'tilt-down',
    label: '下俯摄',
    description: '摄像机向下俯拍',
    promptEn: 'Camera tilts downward, revealing the lower part of the scene or subject.',
  },
  {
    id: 'follow',
    label: '跟拍',
    description: '摄像机跟随主体移动',
    promptEn: 'Camera follows the subject, tracking movement smoothly, maintaining framing.',
  },
  {
    id: 'orbit',
    label: '环绕',
    description: '摄像机围绕主体旋转',
    promptEn: 'Camera orbits around the subject, circular movement, 360-degree rotational shot.',
  },
  {
    id: 'shake',
    label: '手持抖动',
    description: '模拟手持拍摄的轻微抖动，增加临场感',
    promptEn: 'Handheld camera effect, slight shake and vibration, adding realism and tension.',
  },
  {
    id: 'crane-up',
    label: '升降上',
    description: '摄像机向上升起，视野逐渐开阔',
    promptEn: 'Crane shot, camera rises upward, revealing the scene from an elevated perspective.',
  },
  {
    id: 'crane-down',
    label: '升降下',
    description: '摄像机向下降落，视野逐渐收窄',
    promptEn: 'Crane shot, camera descends downward, narrowing the view.',
  },
];

export const LIGHTING_PRESETS: LightingPreset[] = [
  { id: 'none', label: '保持原光', description: '不改变原有的光照效果', promptEn: '' },
  {
    id: 'front',
    label: '正面光',
    description: '光线从正面均匀照射，消除阴影',
    promptEn:
      'Front flat lighting, evenly lit from the camera direction, minimal shadows, details clearly visible.',
  },
  {
    id: 'side',
    label: '侧光',
    description: '光线从一侧照射，明暗对比强',
    promptEn:
      'Side lighting, strong light from one side creating deep shadows on the opposite side, high contrast dramatic mood.',
  },
  {
    id: 'rim',
    label: '逆光',
    description: '光线从背后照射，勾勒轮廓',
    promptEn:
      'Backlighting and rim lighting, light source behind the subject creating bright edge highlights and silhouette effect.',
  },
  {
    id: 'top',
    label: '顶光',
    description: '光线从正上方照射，神秘感',
    promptEn:
      'Top lighting, light source directly above, shadows fall downward, mysterious atmosphere.',
  },
  {
    id: 'bottom',
    label: '底光',
    description: '光线从下方照射，诡异庄重',
    promptEn:
      'Under lighting, light source below the subject casting shadows upward, dramatic horror effect.',
  },
  {
    id: 'rembrandt',
    label: '伦勃朗光',
    description: '经典肖像布光，脸颊三角光区',
    promptEn:
      'Rembrandt lighting, classic portrait lighting with a triangle of light on the shadow side cheek, painterly quality.',
  },
  {
    id: 'butterfly',
    label: '蝴蝶光',
    description: '上前方照射，鼻下蝶形阴影',
    promptEn:
      'Butterfly lighting, key light placed high and directly in front, glamorous and flattering.',
  },
  {
    id: 'neon',
    label: '霓虹光',
    description: '彩色霓虹灯光，赛博朋克风格',
    promptEn:
      'Neon lighting, colorful neon lights, cyberpunk aesthetic with vibrant colored light sources.',
  },
  {
    id: 'golden-hour',
    label: '黄金时刻',
    description: '日落时分的温暖金色光线',
    promptEn: 'Golden hour lighting, warm golden sunlight, long shadows, warm color temperature.',
  },
];

export const VIDEO_TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'cinematic-opening',
    name: '电影级开场',
    description: '大气推镜头开场，配合伦勃朗光效，适合剧情片开头',
    category: 'cinematic',
    subjectPrompt: '',
    actionPrompt: '',
    environmentPrompt: '宏大的场景环境，细节丰富，有纵深感',
    stylePrompt: '电影级质感，变形宽银幕镜头，丰富的色彩分级，胶片颗粒纹理',
    negativePrompt: '卡通风格，动漫风格，低质量，模糊，水印',
    cameraId: 'push-in',
    cameraIntensity: 4,
    cameraSpeed: 30,
    lightingId: 'rembrandt',
    lightingIntensity: 70,
    durationMs: 5000,
  },
  {
    id: 'product-showcase',
    name: '产品展示',
    description: '环绕拍摄产品，正面柔和布光，适合商业广告',
    category: 'commercial',
    subjectPrompt: '产品主体，细节清晰，质感突出',
    actionPrompt: '产品缓缓旋转，展示各个角度',
    environmentPrompt: '简洁干净的背景，突出主体',
    stylePrompt: '商业摄影风格，锐利对焦，高清晰度，柔光效果',
    negativePrompt: '卡通，动漫，插画，低质量，模糊，水印，文字，标志',
    cameraId: 'orbit',
    cameraIntensity: 3,
    cameraSpeed: 25,
    lightingId: 'front',
    lightingIntensity: 60,
    durationMs: 8000,
  },
  {
    id: 'cyberpunk-night',
    name: '赛博朋克夜',
    description: '手持跟拍，霓虹灯光，适合都市夜场景',
    category: 'stylized',
    subjectPrompt: '人物或主体在霓虹灯下的轮廓',
    actionPrompt: '在雨中行走或穿梭，动态感强',
    environmentPrompt: '未来都市夜景，全息广告牌，潮湿的街道反射霓虹灯光',
    stylePrompt: '赛博朋克美学，霓虹灯光，雨夜街道，全息显示，银翼杀手风格',
    negativePrompt: '明亮日光，田园风光，中世纪，低质量，模糊',
    cameraId: 'follow',
    cameraIntensity: 5,
    cameraSpeed: 60,
    lightingId: 'neon',
    lightingIntensity: 80,
    durationMs: 6000,
  },
  {
    id: 'dreamy-flashback',
    name: '梦幻回忆',
    description: '缓慢拉远镜头，逆光柔焦，适合回忆/梦境段落',
    category: 'cinematic',
    subjectPrompt: '人物轮廓柔和，表情朦胧',
    actionPrompt: '缓慢动作，带有诗意感',
    environmentPrompt: '温暖的午后环境，光线柔和，有光晕效果',
    stylePrompt: '柔光滤镜，暖色调，浅景深，梦幻氛围，胶片感',
    negativePrompt: '冷色调，高对比度，卡通，动漫，低质量，模糊',
    cameraId: 'pull-out',
    cameraIntensity: 3,
    cameraSpeed: 20,
    lightingId: 'golden-hour',
    lightingIntensity: 60,
    durationMs: 8000,
  },
  {
    id: 'action-climax',
    name: '动作高潮',
    description: '手持抖动+快速运镜，加强紧张感',
    category: 'action',
    subjectPrompt: '动作主体，充满力量感',
    actionPrompt: '快速移动，爆发性动作，冲击感强',
    environmentPrompt: '混乱或紧张的环境，有爆炸/追逐元素',
    stylePrompt: '高对比度，快速剪辑感，略带颗粒，电影级动态模糊',
    negativePrompt: '静态，平滑，低质量，模糊，水印',
    cameraId: 'shake',
    cameraIntensity: 8,
    cameraSpeed: 85,
    lightingId: 'side',
    lightingIntensity: 80,
    durationMs: 4000,
  },
  {
    id: 'nature-landscape',
    name: '自然风光',
    description: '航拍式升降，黄金时刻光线，适合风光/旅行',
    category: 'nature',
    subjectPrompt: '自然主体（山脉/森林/海洋等）',
    actionPrompt: '云层流动，光影缓缓变化',
    environmentPrompt: '广阔的自然景观，有层次感的前中远景',
    stylePrompt: '黄金时刻光线，暖色调，高饱和度，深邃的天空，电影级风光摄影',
    negativePrompt: '城市建筑，人物，卡通，动漫，低质量，模糊',
    cameraId: 'crane-up',
    cameraIntensity: 3,
    cameraSpeed: 15,
    lightingId: 'golden-hour',
    lightingIntensity: 75,
    durationMs: 8000,
  },
  {
    id: 'horror-suspense',
    name: '悬疑惊悚',
    description: '缓慢推镜头+底光，营造不安氛围',
    category: 'cinematic',
    subjectPrompt: '神秘主体，部分隐藏于阴影中',
    actionPrompt: '缓慢、不祥的移动',
    environmentPrompt: '黑暗、压抑的环境，有阴影和未知空间',
    stylePrompt: '高对比度布光，深阴影，冷色调，颗粒感，不安氛围',
    negativePrompt: '明亮，温暖，卡通，动漫，低质量，模糊',
    cameraId: 'push-in',
    cameraIntensity: 2,
    cameraSpeed: 10,
    lightingId: 'bottom',
    lightingIntensity: 40,
    durationMs: 6000,
  },
];

export const TEMPLATE_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'cinematic', name: '电影质感' },
  { id: 'commercial', name: '商业广告' },
  { id: 'stylized', name: '风格化' },
  { id: 'action', name: '动感节奏' },
  { id: 'nature', name: '自然风光' },
];

export const TAB_CONFIG: { id: RightTab; label: string; icon: React.ReactNode }[] = [
  { id: 'prompt', label: '提示词', icon: undefined },
  { id: 'actions', label: '动作', icon: undefined },
  { id: 'templates', label: '模板', icon: undefined },
  { id: 'settings', label: '画面', icon: undefined },
  { id: 'camera', label: '运镜', icon: undefined },
  { id: 'lighting', label: '光照', icon: undefined },
  { id: 'dialogue', label: '对白', icon: undefined },
];

// ─── 工具函数 ───

export function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
}

export function parseTime(str: string): number | null {
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0], 10);
  const sec = parseFloat(parts[1]);
  if (isNaN(min) || isNaN(sec)) return null;
  if (sec >= 60) return null;
  return (min * 60 + sec) * 1000;
}

// ─── 聚合状态契约 ───
// 主组件持有全部 state，构造该对象下发给各展示子组件（props 下发策略，Phase 3）。
// 每个子组件仅解构自身实际使用的字段，保证类型强约束 + 最小暴露面。

export type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

export interface GenerationPanelState {
  // 输入
  selectedLayerIds: string[];
  onClose: () => void;

  // 图片序列
  imageSequence: ImageSequenceItem[];
  setImageSequence: SetState<ImageSequenceItem[]>;
  showCanvasImagePicker: boolean;
  setShowCanvasImagePicker: SetState<boolean>;
  imageLookup: Map<string, LayerData>;
  canvasImageLayers: LayerData[];
  activePreviewId: string | null;
  setActivePreviewId: SetState<string | null>;
  activePreviewLayer: LayerData | null;
  previewCollapsed: boolean;
  setPreviewCollapsed: SetState<boolean>;
  lightboxImage: { src: string; title: string; width?: number; height?: number } | null;
  setLightboxImage: SetState<{
    src: string;
    title: string;
    width?: number;
    height?: number;
  } | null>;
  addImageToSequence: (layerId: string) => void;
  removeImageFromSequence: (layerId: string) => void;
  updateImagePrompt: (layerId: string, prompt: string) => void;
  moveImage: (layerId: string, direction: -1 | 1) => void;
  handleItemClick: (layerId: string) => void;
  handleItemDoubleClick: (layerId: string) => void;

  // 配置 / 提示词
  activeTab: RightTab;
  setActiveTab: SetState<RightTab>;
  globalPrompt: string;
  setGlobalPrompt: SetState<string>;
  subjectPrompt: string;
  setSubjectPrompt: SetState<string>;
  actionPrompt: string;
  setActionPrompt: SetState<string>;
  environmentPrompt: string;
  setEnvironmentPrompt: SetState<string>;
  stylePrompt: string;
  setStylePrompt: SetState<string>;
  negativePrompt: string;
  setNegativePrompt: SetState<string>;
  timestampActions: TimestampActionItem[];
  setTimestampActions: SetState<TimestampActionItem[]>;
  selectedTemplateId: string | null;
  setSelectedTemplateId: SetState<string | null>;
  templateCategory: string;
  setTemplateCategory: SetState<string>;

  // 画面设置
  selectedSizePreset: number;
  setSelectedSizePreset: SetState<number>;
  customWidth: number;
  setCustomWidth: SetState<number>;
  customHeight: number;
  setCustomHeight: SetState<number>;
  useCustomSize: boolean;
  setUseCustomSize: SetState<boolean>;
  durationMs: number;
  setDurationMs: SetState<number>;
  durationInput: string;
  setDurationInput: SetState<string>;
  durationInputRef: React.RefObject<HTMLInputElement | null>;
  currentSize: { width: number; height: number };
  handleDurationSlider: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDurationInput: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // 运镜
  selectedCamera: string;
  setSelectedCamera: SetState<string>;
  cameraIntensity: number;
  setCameraIntensity: SetState<number>;
  cameraSpeed: number;
  setCameraSpeed: SetState<number>;
  useChoreography: boolean;
  setUseChoreography: SetState<boolean>;
  startShotSize: string;
  setStartShotSize: SetState<string>;
  startAngle: string;
  setStartAngle: SetState<string>;
  startSubject: string;
  setStartSubject: SetState<string>;
  startFocus: string;
  setStartFocus: SetState<string>;
  movementPath: string;
  setMovementPath: SetState<string>;
  movementSpeed: string;
  setMovementSpeed: SetState<string>;
  endShotSize: string;
  setEndShotSize: SetState<string>;
  endAngle: string;
  setEndAngle: SetState<string>;
  endSubject: string;
  setEndSubject: SetState<string>;
  timingStartRatio: number;
  setTimingStartRatio: SetState<number>;
  timingMoveRatio: number;
  setTimingMoveRatio: SetState<number>;
  timingEndRatio: number;
  setTimingEndRatio: SetState<number>;

  // 光照
  selectedLighting: string;
  setSelectedLighting: SetState<string>;
  lightingIntensity: number;
  setLightingIntensity: SetState<number>;

  // 对白
  dialogues: DialogueEntry[];
  setDialogues: SetState<DialogueEntry[]>;
  addDialogue: () => void;
  updateDialogue: (id: string, updates: Partial<DialogueEntry>) => void;
  removeDialogue: (id: string) => void;

  // AI 质检
  isCheckingQuality: boolean;
  qualityReport: string | null;
  setQualityReport: SetState<string | null>;
  buildFullPromptPreview: () => string;
  handleQualityCheck: () => Promise<void>;

  // 动作时间线
  addTimestampAction: () => void;
  updateTimestampAction: (id: string, updates: Partial<TimestampActionItem>) => void;
  removeTimestampAction: (id: string) => void;

  // 模板
  filteredTemplates: TemplatePreset[];
  applyTemplate: (template: TemplatePreset) => void;
  saveCurrentAsTemplate: () => void;
  deleteCustomTemplate: (id: string) => void;
  customTemplates: TemplatePreset[];

  // 生成
  isGenerating: boolean;
  progress: number;
  progressLabel: string;
  canGenerate: boolean;
  handleGenerate: () => Promise<void>;
}
