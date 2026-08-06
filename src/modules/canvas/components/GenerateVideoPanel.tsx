import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { CameraChoreography, renderCameraChoreographyPrompt } from '../../../../types';
import { CAMERA_MOVEMENT_TYPES, CAMERA_SHOT_SIZES, CAMERA_ANGLES, CAMERA_SUBJECT_POSITIONS, CAMERA_FOCUS_TYPES, CAMERA_MOVEMENT_SPEEDS } from '../../../../components/StageDirector/constants';
import { Plus, GripVertical, Trash2, ChevronDown, Sparkles, Camera, Sun, Mic, Settings, Film, Clock, X, Maximize2, Eye, EyeOff, Layout } from 'lucide-react';
import { UI_VIDEO_SIZE_PRESETS } from '../../../../config/sizeConfig';
import { ResolvedImage } from './ResolvedImage';

interface GenerateVideoPanelProps {
  selectedLayerIds: string[];
  initialConfig?: GenerationConfig;
  onClose: () => void;
}

// ─── 类型定义 ────────────────────────────────────────────

interface ImageSequenceItem {
  layerId: string;
  order: number;
  imagePrompt: string;
}

interface CameraMovement {
  id: string;
  label: string;
  description: string;
  promptEn: string;
}

interface LightingPreset {
  id: string;
  label: string;
  description: string;
  promptEn: string;
}

interface DialogueEntry {
  id: string;
  timestamp: number;
  type: 'dialogue' | 'narration';
  character: string;
  text: string;
}

interface VideoSizePreset {
  label: string;
  width: number;
  height: number;
  aspectRatio: string;
}

type RightTab = 'prompt' | 'settings' | 'camera' | 'lighting' | 'dialogue' | 'actions' | 'templates';

export interface GenerationConfig {
  imageSequence: { layerId: string; imagePrompt: string }[];
  globalPrompt: string;
  // 结构化提示词
  subjectPrompt: string;
  actionPrompt: string;
  environmentPrompt: string;
  stylePrompt: string;
  negativePrompt: string;
  // 时间戳动作
  timestampActions: TimestampActionItem[];
  // 使用的模板
  appliedTemplateId?: string;
  sizePresetIndex: number;
  useCustomSize: boolean;
  customWidth: number;
  customHeight: number;
  durationMs: number;
  cameraId: string;
  cameraIntensity: number;
  cameraSpeed: number;
  lightingId: string;
  lightingIntensity: number;
  dialogues: DialogueEntry[];
  // 运镜编排（结构化起点→路径→终点）
  useChoreography?: boolean;
  startShotSize?: string;
  startAngle?: string;
  startSubject?: string;
  startFocus?: string;
  movementPath?: string;
  movementSpeed?: string;
  endShotSize?: string;
  endAngle?: string;
  endSubject?: string;
  timingStartRatio?: number;
  timingMoveRatio?: number;
  timingEndRatio?: number;
}

interface TimestampActionItem {
  id: string;
  startTime: number;
  endTime: number;
  description: string;
}

interface VideoTemplate {
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
  useChoreography: boolean;
  startShotSize?: string;
  startAngle?: string;
  startSubject?: string;
  startFocus?: string;
  movementPath?: string;
  movementSpeed?: string;
  endShotSize?: string;
  endAngle?: string;
  endSubject?: string;
  timingStartRatio?: number;
  timingMoveRatio?: number;
  timingEndRatio?: number;
  lightingId: string;
  lightingIntensity: number;
  durationMs: number;
}

// ─── 常量 ────────────────────────────────────────────────

const VIDEO_SIZE_PRESETS: VideoSizePreset[] = UI_VIDEO_SIZE_PRESETS as unknown as VideoSizePreset[];

const CAMERA_MOVEMENTS: CameraMovement[] = [
  { id: 'none', label: '固定镜头', description: '摄像机保持静止', promptEn: 'Static shot, camera remains fixed, no movement.' },
  { id: 'push-in', label: '推镜头', description: '摄像机匀速向前推进，聚焦主体', promptEn: 'Camera slowly pushes in towards the subject, gradual dolly forward, intensifying focus.' },
  { id: 'pull-out', label: '拉镜头', description: '摄像机匀速向后拉远，展示环境', promptEn: 'Camera slowly pulls out, dolly backward, revealing the surrounding environment.' },
  { id: 'pan-left', label: '左摇摄', description: '摄像机水平向左旋转', promptEn: 'Camera pans left, horizontal rotation from left to right, revealing the scene.' },
  { id: 'pan-right', label: '右摇摄', description: '摄像机水平向右旋转', promptEn: 'Camera pans right, horizontal rotation, revealing the scene dynamically.' },
  { id: 'tilt-up', label: '上仰摄', description: '摄像机向上仰起', promptEn: 'Camera tilts upward, revealing the upper part of the scene or subject.' },
  { id: 'tilt-down', label: '下俯摄', description: '摄像机向下俯拍', promptEn: 'Camera tilts downward, revealing the lower part of the scene or subject.' },
  { id: 'follow', label: '跟拍', description: '摄像机跟随主体移动', promptEn: 'Camera follows the subject, tracking movement smoothly, maintaining framing.' },
  { id: 'orbit', label: '环绕', description: '摄像机围绕主体旋转', promptEn: 'Camera orbits around the subject, circular movement, 360-degree rotational shot.' },
  { id: 'shake', label: '手持抖动', description: '模拟手持拍摄的轻微抖动，增加临场感', promptEn: 'Handheld camera effect, slight shake and vibration, adding realism and tension.' },
  { id: 'crane-up', label: '升降上', description: '摄像机向上升起，视野逐渐开阔', promptEn: 'Crane shot, camera rises upward, revealing the scene from an elevated perspective.' },
  { id: 'crane-down', label: '升降下', description: '摄像机向下降落，视野逐渐收窄', promptEn: 'Crane shot, camera descends downward, narrowing the view.' },
];

const LIGHTING_PRESETS: LightingPreset[] = [
  { id: 'none', label: '保持原光', description: '不改变原有的光照效果', promptEn: '' },
  { id: 'front', label: '正面光', description: '光线从正面均匀照射，消除阴影', promptEn: 'Front flat lighting, evenly lit from the camera direction, minimal shadows, details clearly visible.' },
  { id: 'side', label: '侧光', description: '光线从一侧照射，明暗对比强', promptEn: 'Side lighting, strong light from one side creating deep shadows on the opposite side, high contrast dramatic mood.' },
  { id: 'rim', label: '逆光', description: '光线从背后照射，勾勒轮廓', promptEn: 'Backlighting and rim lighting, light source behind the subject creating bright edge highlights and silhouette effect.' },
  { id: 'top', label: '顶光', description: '光线从正上方照射，神秘感', promptEn: 'Top lighting, light source directly above, shadows fall downward, mysterious atmosphere.' },
  { id: 'bottom', label: '底光', description: '光线从下方照射，诡异庄重', promptEn: 'Under lighting, light source below the subject casting shadows upward, dramatic horror effect.' },
  { id: 'rembrandt', label: '伦勃朗光', description: '经典肖像布光，脸颊三角光区', promptEn: 'Rembrandt lighting, classic portrait lighting with a triangle of light on the shadow side cheek, painterly quality.' },
  { id: 'butterfly', label: '蝴蝶光', description: '上前方照射，鼻下蝶形阴影', promptEn: 'Butterfly lighting, key light placed high and directly in front, glamorous and flattering.' },
  { id: 'neon', label: '霓虹光', description: '彩色霓虹灯光，赛博朋克风格', promptEn: 'Neon lighting, colorful neon lights, cyberpunk aesthetic with vibrant colored light sources.' },
  { id: 'golden-hour', label: '黄金时刻', description: '日落时分的温暖金色光线', promptEn: 'Golden hour lighting, warm golden sunlight, long shadows, warm color temperature.' },
];

// ─── 视频模板预设 ──────────────────────────────────────────

interface TemplatePreset {
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

const VIDEO_TEMPLATE_PRESETS: TemplatePreset[] = [
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

const TEMPLATE_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'cinematic', name: '电影质感' },
  { id: 'commercial', name: '商业广告' },
  { id: 'stylized', name: '风格化' },
  { id: 'action', name: '动感节奏' },
  { id: 'nature', name: '自然风光' },
];

const TAB_CONFIG: { id: RightTab; label: string; icon: React.ReactNode }[] = [
  { id: 'prompt',   label: '提示词', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'actions',  label: '动作',   icon: <Film className="w-4 h-4" /> },
  { id: 'templates', label: '模板',  icon: <Layout className="w-4 h-4" /> },
  { id: 'settings', label: '画面',   icon: <Settings className="w-4 h-4" /> },
  { id: 'camera',   label: '运镜',   icon: <Camera className="w-4 h-4" /> },
  { id: 'lighting', label: '光照',   icon: <Sun className="w-4 h-4" /> },
  { id: 'dialogue', label: '对白',   icon: <Mic className="w-4 h-4" /> },
];

// ─── 工具函数 ────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
}

function parseTime(str: string): number | null {
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const min = parseInt(parts[0], 10);
  const sec = parseFloat(parts[1]);
  if (isNaN(min) || isNaN(sec)) return null;
  if (sec >= 60) return null;
  return (min * 60 + sec) * 1000;
}

// ─── 主组件 ──────────────────────────────────────────────

export const GenerateVideoPanel: React.FC<GenerateVideoPanelProps> = ({ selectedLayerIds, initialConfig, onClose }) => {
  const { layers } = useCanvasStore();

  // ── 图片序列状态 ──
  const [imageSequence, setImageSequence] = useState<ImageSequenceItem[]>(() => {
    const imageLayers = layers.filter(l => selectedLayerIds.includes(l.id) && l.type === 'image' && !l.isLoading);
    const dedup = new Map<string, typeof layers[0]>();
    imageLayers.forEach(l => dedup.set(l.id, l));
    return Array.from(dedup.values()).map((l, i) => ({
      layerId: l.id,
      order: i + 1,
      imagePrompt: '',
    }));
  });

  const [showCanvasImagePicker, setShowCanvasImagePicker] = useState(false);

  const imageLookup = useMemo(() => {
    const map = new Map<string, typeof layers[0]>();
    layers.forEach(l => { if (l.type === 'image') map.set(l.id, l); });
    return map;
  }, [layers]);

  const canvasImageLayers = useMemo(
    () => layers.filter(l => l.type === 'image' && !l.isLoading && !imageSequence.some(s => s.layerId === l.id)),
    [layers, imageSequence]
  );

  // ── 配置状态 ──
  const [activeTab, setActiveTab] = useState<RightTab>('prompt');
  const [globalPrompt, setGlobalPrompt] = useState('');
  const [selectedSizePreset, setSelectedSizePreset] = useState(0);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [useCustomSize, setUseCustomSize] = useState(false);
  const [durationMs, setDurationMs] = useState(5000);
  const [durationInput, setDurationInput] = useState('5.000');
  const [selectedCamera, setSelectedCamera] = useState('none');
  const [cameraIntensity, setCameraIntensity] = useState(5);
  const [cameraSpeed, setCameraSpeed] = useState(50);
  const [useChoreography, setUseChoreography] = useState(false);
  const [startShotSize, setStartShotSize] = useState('中景');
  const [startAngle, setStartAngle] = useState('平视');
  const [startSubject, setStartSubject] = useState('居中');
  const [startFocus, setStartFocus] = useState('浅景深');
  const [movementPath, setMovementPath] = useState('');
  const [movementSpeed, setMovementSpeed] = useState('中速');
  const [endShotSize, setEndShotSize] = useState('近景');
  const [endAngle, setEndAngle] = useState('仰拍');
  const [endSubject, setEndSubject] = useState('黄金分割左');
  const [timingStartRatio, setTimingStartRatio] = useState(0.3);
  const [timingMoveRatio, setTimingMoveRatio] = useState(0.4);
  const [timingEndRatio, setTimingEndRatio] = useState(0.3);
  const [selectedLighting, setSelectedLighting] = useState('none');
  const [lightingIntensity, setLightingIntensity] = useState(50);
  const [dialogues, setDialogues] = useState<DialogueEntry[]>([]);
  // ── 结构化提示词 ──
  const [subjectPrompt, setSubjectPrompt] = useState('');
  const [actionPrompt, setActionPrompt] = useState('');
  const [environmentPrompt, setEnvironmentPrompt] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  // ── 时间戳动作 ──
  const [timestampActions, setTimestampActions] = useState<TimestampActionItem[]>([]);
  // ── 模板 ──
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateCategory, setTemplateCategory] = useState('all');
  // ── AI 质检 ──
  const [isCheckingQuality, setIsCheckingQuality] = useState(false);
  const [qualityReport, setQualityReport] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const durationInputRef = useRef<HTMLInputElement>(null);

  // ── 重新生成：应用初始配置 ──

  const configApplied = useRef(false);
  useEffect(() => {
    if (!initialConfig || configApplied.current) return;
    configApplied.current = true;

    setImageSequence(initialConfig.imageSequence.map((item, i) => ({
      ...item,
      order: i + 1,
    })));
    setGlobalPrompt(initialConfig.globalPrompt);
    setSubjectPrompt(initialConfig.subjectPrompt || '');
    setActionPrompt(initialConfig.actionPrompt || '');
    setEnvironmentPrompt(initialConfig.environmentPrompt || '');
    setStylePrompt(initialConfig.stylePrompt || '');
    setNegativePrompt(initialConfig.negativePrompt || '');
    setTimestampActions(initialConfig.timestampActions || []);
    setSelectedTemplateId(initialConfig.appliedTemplateId || null);
    setSelectedSizePreset(initialConfig.sizePresetIndex);
    setUseCustomSize(initialConfig.useCustomSize);
    setCustomWidth(initialConfig.customWidth);
    setCustomHeight(initialConfig.customHeight);
    setDurationMs(initialConfig.durationMs);
    setDurationInput((initialConfig.durationMs / 1000).toFixed(3));
    setSelectedCamera(initialConfig.cameraId);
    setCameraIntensity(initialConfig.cameraIntensity);
    setCameraSpeed(initialConfig.cameraSpeed);
    setSelectedLighting(initialConfig.lightingId);
    setLightingIntensity(initialConfig.lightingIntensity);
    setDialogues(initialConfig.dialogues);
    // 还原运镜编排状态
    if (initialConfig.useChoreography) {
      setUseChoreography(true);
      if (initialConfig.startShotSize) setStartShotSize(initialConfig.startShotSize);
      if (initialConfig.startAngle) setStartAngle(initialConfig.startAngle);
      if (initialConfig.startSubject) setStartSubject(initialConfig.startSubject);
      if (initialConfig.startFocus) setStartFocus(initialConfig.startFocus);
      if (initialConfig.movementPath !== undefined) setMovementPath(initialConfig.movementPath);
      if (initialConfig.movementSpeed) setMovementSpeed(initialConfig.movementSpeed);
      if (initialConfig.endShotSize) setEndShotSize(initialConfig.endShotSize);
      if (initialConfig.endAngle) setEndAngle(initialConfig.endAngle);
      if (initialConfig.endSubject) setEndSubject(initialConfig.endSubject);
      if (initialConfig.timingStartRatio !== undefined) setTimingStartRatio(initialConfig.timingStartRatio);
      if (initialConfig.timingMoveRatio !== undefined) setTimingMoveRatio(initialConfig.timingMoveRatio);
      if (initialConfig.timingEndRatio !== undefined) setTimingEndRatio(initialConfig.timingEndRatio);
    }
  }, [initialConfig]);

  // ── 图片预览状态 ──
  const [activePreviewId, setActivePreviewId] = useState<string | null>(
    imageSequence.length > 0 ? imageSequence[0].layerId : null
  );
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string; width?: number; height?: number } | null>(null);

  // ── 图片序列操作 ──

  const addImageToSequence = useCallback((layerId: string) => {
    setImageSequence(prev => {
      if (prev.some(s => s.layerId === layerId)) return prev;
      return [...prev, { layerId, order: prev.length + 1, imagePrompt: '' }];
    });
    setActivePreviewId(prev => prev || layerId);
  }, []);

  const removeImageFromSequence = useCallback((layerId: string) => {
    setImageSequence(prev => {
      const filtered = prev.filter(s => s.layerId !== layerId);
      return filtered.map((s, i) => ({ ...s, order: i + 1 }));
    });
    setActivePreviewId(prev => {
      if (prev === layerId) {
        const remaining = imageSequence.filter(s => s.layerId !== layerId);
        return remaining.length > 0 ? remaining[0].layerId : null;
      }
      return prev;
    });
  }, [imageSequence]);

  const updateImagePrompt = useCallback((layerId: string, prompt: string) => {
    setImageSequence(prev => prev.map(s => s.layerId === layerId ? { ...s, imagePrompt: prompt } : s));
  }, []);

  const moveImage = useCallback((layerId: string, direction: -1 | 1) => {
    setImageSequence(prev => {
      const idx = prev.findIndex(s => s.layerId === layerId);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }, []);

  // ── 对白操作 ──

  const addDialogue = useCallback(() => {
    const newEntry: DialogueEntry = {
      id: crypto.randomUUID(),
      timestamp: dialogues.length > 0 ? dialogues[dialogues.length - 1].timestamp + 1000 : 1000,
      type: 'dialogue',
      character: '',
      text: '',
    };
    setDialogues(prev => [...prev, newEntry]);
  }, [dialogues]);

  const updateDialogue = useCallback((id: string, updates: Partial<DialogueEntry>) => {
    setDialogues(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const removeDialogue = useCallback((id: string) => {
    setDialogues(prev => prev.filter(d => d.id !== id));
  }, []);

  // ── 时长处理 ──

  const handleDurationSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = parseInt(e.target.value, 10);
    setDurationMs(ms);
    setDurationInput((ms / 1000).toFixed(3));
  }, []);

  const handleDurationInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDurationInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 3 && parsed <= 15) {
      setDurationMs(Math.round(parsed * 1000));
    }
  }, []);

  // ── 生成 ──

  const canGenerate = imageSequence.length > 0 && !isGenerating;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setProgress(0);
    setProgressLabel('准备生成...');

    try {
      const sizePreset = VIDEO_SIZE_PRESETS[selectedSizePreset];
      const finalWidth = useCustomSize ? customWidth : sizePreset.width;
      const finalHeight = useCustomSize ? customHeight : sizePreset.height;
      const finalAspectRatio = useCustomSize ? `${finalWidth}:${finalHeight}` : sizePreset.aspectRatio;

      const activeModel = (await import('../../../../services/modelRegistry')).getActiveVideoModel();
      const aspectRatioMap: Record<string, '16:9' | '9:16' | '1:1'> = {
        '16:9': '16:9', '9:16': '9:16', '1:1': '1:1',
      };
      const aspectRatio = aspectRatioMap[finalAspectRatio] || '16:9';

      // ── 构建结构化 prompt ──
      const promptParts: string[] = [];

      // 主体
      if (subjectPrompt) promptParts.push(`[Subject] ${subjectPrompt}`);
      // 动作
      if (actionPrompt) promptParts.push(`[Action] ${actionPrompt}`);
      // 环境
      if (environmentPrompt) promptParts.push(`[Environment] ${environmentPrompt}`);
      // 风格
      if (stylePrompt) promptParts.push(`[Style] ${stylePrompt}`);
      // 负面
      if (negativePrompt) promptParts.push(`[Negative] ${negativePrompt}`);

      // 时间戳动作
      const validActions = timestampActions
        .filter(a => a.description.trim())
        .sort((a, b) => a.startTime - b.startTime);
      if (validActions.length > 0) {
        promptParts.push('');
        promptParts.push('--- Timestamped action sequence ---');
        validActions.forEach(a => {
          const startStr = formatTime(a.startTime);
          const endStr = formatTime(a.endTime);
          promptParts.push(`[${startStr} - ${endStr}] ${a.description}`);
        });
      }

      // 运镜
      let cameraPrompt = '';
      if (useChoreography && selectedCamera !== 'none') {
        const cc: CameraChoreography = {
          startShotSize: startShotSize as CameraChoreography['startShotSize'],
          startAngle: startAngle as CameraChoreography['startAngle'],
          startSubject: startSubject as CameraChoreography['startSubject'],
          startFocus: startFocus as CameraChoreography['startFocus'],
          movementType: selectedCamera,
          movementPath,
          movementSpeed: movementSpeed as CameraChoreography['movementSpeed'],
          movementIntensity: cameraIntensity,
          endShotSize: endShotSize as CameraChoreography['endShotSize'],
          endAngle: endAngle as CameraChoreography['endAngle'],
          endSubject: endSubject as CameraChoreography['endSubject'],
          timingStartRatio,
          timingMoveRatio,
          timingEndRatio,
        };
        cameraPrompt = renderCameraChoreographyPrompt(cc, actionPrompt || globalPrompt || '', Math.round(durationMs / 1000));
      } else {
        const cameraMove = CAMERA_MOVEMENTS.find(c => c.id === selectedCamera);
        cameraPrompt = cameraMove && selectedCamera !== 'none'
          ? `Camera movement: ${cameraMove.promptEn} Intensity level ${cameraIntensity}/10, speed ${cameraSpeed}/100.`
          : '';
      }
      if (cameraPrompt) promptParts.push('\n' + cameraPrompt);

      // 光照
      const lightingPreset = LIGHTING_PRESETS.find(l => l.id === selectedLighting);
      if (lightingPreset && selectedLighting !== 'none') {
        promptParts.push(`Lighting: ${lightingPreset.promptEn} Apply with intensity ${lightingIntensity}/100.`);
      }

      // 图片序列
      promptParts.push('\n--- Image sequence description ---');
      imageSequence.forEach(s => {
        const layer = imageLookup.get(s.layerId);
        const title = layer?.title || `Image ${s.order}`;
        promptParts.push(s.imagePrompt
          ? `[${title}] ${s.imagePrompt}`
          : `[${title}] No specific prompt.`);
      });

      // 对白/旁白
      const dialogueSegments = dialogues
        .filter(d => d.text.trim())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(d => {
          const timeStr = formatTime(d.timestamp);
          if (d.type === 'narration') return `[${timeStr}] Narration: "${d.text}"`;
          return `[${timeStr}] ${d.character || 'Character'}: "${d.text}"`;
        });
      if (dialogueSegments.length > 0) {
        promptParts.push('\nDialogue and narration timeline:');
        promptParts.push(...dialogueSegments);
      }

      // 全局补充
      if (globalPrompt) promptParts.push('\n' + globalPrompt);

      const fullPrompt = promptParts.join('\n');

      setProgressLabel('正在生成视频 (图片 1/' + imageSequence.length + ')...');

      const firstLayer = imageLookup.get(imageSequence[0].layerId);
      const allImages = imageSequence
        .map(s => imageLookup.get(s.layerId)?.src)
        .filter((s): s is string => !!s);

      const videoUrl = await canvasModelService.generateVideo({
        prompt: fullPrompt,
        startImage: allImages[0],
        endImage: allImages[1],
        referenceImages: allImages,
        aspectRatio,
        duration: Math.round(durationMs / 1000),
        onProgress: (p) => {
          setProgress(p);
        },
      });

      setProgressLabel('处理视频文件...');
      setProgress(90);

      const { videoStorageService } = await import('../../../../services/imageStorageService');
      let resolvedUrl = videoUrl;
      let finalSrc = videoUrl;
      let videoId: string | undefined;

      if (videoUrl.startsWith('local:')) {
        const localId = videoUrl.replace('local:', '');
        videoId = localId;
        finalSrc = videoUrl;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) {
          resolvedUrl = URL.createObjectURL(blob);
        }
      } else if (videoUrl.startsWith('video:')) {
        const localId = videoUrl.replace('video:', '');
        videoId = localId;
        finalSrc = videoUrl;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) {
          resolvedUrl = URL.createObjectURL(blob);
        }
      } else if (videoUrl.startsWith('data:')) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const vidId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await videoStorageService.saveVideo(vidId, blob);
        videoId = vidId;
        finalSrc = `video:${vidId}`;
      }

      const generationConfig: GenerationConfig = {
        imageSequence: imageSequence.map(s => ({ layerId: s.layerId, imagePrompt: s.imagePrompt })),
        globalPrompt,
        subjectPrompt,
        actionPrompt,
        environmentPrompt,
        stylePrompt,
        negativePrompt,
        timestampActions: timestampActions.map(a => ({ ...a })),
        appliedTemplateId: selectedTemplateId || undefined,
        sizePresetIndex: selectedSizePreset,
        useCustomSize,
        customWidth,
        customHeight,
        durationMs,
        cameraId: selectedCamera,
        cameraIntensity,
        cameraSpeed,
        lightingId: selectedLighting,
        lightingIntensity,
        dialogues,
        ...(useChoreography ? {
          useChoreography: true,
          startShotSize,
          startAngle,
          startSubject,
          startFocus,
          movementPath,
          movementSpeed,
          endShotSize,
          endAngle,
          endSubject,
          timingStartRatio,
          timingMoveRatio,
          timingEndRatio,
        } : {}),
      };

      const { addLayer } = useCanvasStore.getState();
      addLayer({
        id: crypto.randomUUID(),
        type: 'video',
        x: firstLayer?.x || 100,
        y: (firstLayer?.y || 100) + (firstLayer?.height || 400) + 40,
        width: finalWidth,
        height: finalHeight,
        src: finalSrc,
        imageId: videoId,
        title: 'AI生成视频',
        createdAt: Date.now(),
        sourceLayerId: imageSequence[0]?.layerId,
        sourceLayerIds: imageSequence.map(s => s.layerId),
        operationType: 'image-to-video',
        duration: durationMs / 1000,
        generationPrompt: JSON.stringify(generationConfig),
      });

      setProgress(100);
      setProgressLabel('生成完成！');

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error: any) {
      console.error('视频生成失败:', error);
      alert(`生成失败: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── 当前尺寸预设 ──
  const currentSize = useCustomSize
    ? { width: customWidth, height: customHeight }
    : VIDEO_SIZE_PRESETS[selectedSizePreset];

  // ── 渲染：左侧图片预览 + 序列 ──────────────────────────

  const activePreviewLayer = activePreviewId ? imageLookup.get(activePreviewId) : null;

  const handleItemClick = useCallback((layerId: string) => {
    setActivePreviewId(layerId);
  }, []);

  const handleItemDoubleClick = useCallback((layerId: string) => {
    const layer = imageLookup.get(layerId);
    if (layer?.src) {
      setLightboxImage({ src: layer.src, title: layer.title, width: layer.width, height: layer.height });
    }
  }, [imageLookup]);

  const renderImageSequence = () => (
    <div className="flex flex-col h-full">
      {/* ── 图片预览区 ── */}
      <div className="border-b border-gray-700/50">
        <button
          onClick={() => setPreviewCollapsed(p => !p)}
          className="flex items-center justify-between w-full px-4 py-2 hover:bg-gray-800/40 transition-colors"
        >
          <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-purple-400" />
            图片预览
          </h3>
          {previewCollapsed ? <EyeOff className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
        </button>

        {!previewCollapsed && (
          <div className="px-3 pb-3">
            {activePreviewLayer?.src ? (
              <div
                className="relative rounded-lg overflow-hidden bg-gray-800 cursor-pointer group/preview"
                onClick={() => handleItemClick(activePreviewLayer.id)}
                onDoubleClick={() => handleItemDoubleClick(activePreviewLayer.id)}
              >
                <ResolvedImage
                  src={activePreviewLayer.src}
                  alt={activePreviewLayer.title}
                  className="w-full h-auto max-h-[180px] object-contain"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/preview:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-white bg-black/50 px-2 py-1 rounded">
                    <Maximize2 className="w-3 h-3" />
                    双击放大
                  </div>
                </div>
                <div className="absolute bottom-1 left-1 text-[9px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded">
                  {activePreviewLayer.title} · {activePreviewLayer.width}×{activePreviewLayer.height}
                </div>
                {selectedCamera !== 'none' && (
                  <div className="absolute bottom-1 right-1 text-[9px] text-white/80 bg-black/60 backdrop-blur-sm px-2 py-1 rounded leading-tight max-w-[60%]">
                    {useChoreography ? (
                      <>
                        <div className="font-semibold text-purple-300">📽 {CAMERA_MOVEMENTS.find(c => c.id === selectedCamera)?.label}</div>
                        <div className="text-[8px] opacity-80">{startShotSize}/{startAngle} → {endShotSize}/{endAngle}</div>
                        <div className="text-[8px] opacity-60">{Math.round(timingStartRatio * 100)}%/{Math.round(timingMoveRatio * 100)}%/{Math.round(timingEndRatio * 100)}%</div>
                        {movementPath && <div className="text-[8px] opacity-70 truncate">{movementPath}</div>}
                      </>
                    ) : (
                      <div>{CAMERA_MOVEMENTS.find(c => c.id === selectedCamera)?.label} 强度{cameraIntensity}/10</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-[10px] text-gray-600 bg-gray-800/40 rounded-lg border border-dashed border-gray-700">
                {imageSequence.length > 0 ? '点击下方图片预览' : '请先添加图片'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 图片序列列表 ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
          <Film className="w-3.5 h-3.5 text-purple-400" />
          图片序列
          <span className="text-[10px] text-gray-500 font-normal">({imageSequence.length}张)</span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {imageSequence.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs gap-2">
            <Film className="w-6 h-6 opacity-30" />
            <p>尚未选择图片</p>
            <p className="text-[10px]">从下方添加画布上的图片</p>
          </div>
        )}

        {imageSequence.map((item, idx) => {
          const layer = imageLookup.get(item.layerId);
          if (!layer) return null;
          const isActive = activePreviewId === item.layerId;
          return (
            <div
              key={item.layerId}
              className={`rounded-lg border overflow-hidden group cursor-pointer transition-all ${
                isActive
                  ? 'border-purple-500/60 bg-purple-500/5'
                  : 'border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/60'
              }`}
              onClick={() => handleItemClick(item.layerId)}
              onDoubleClick={() => handleItemDoubleClick(item.layerId)}
            >
              <div className="flex items-start gap-2 p-2">
                <div className="flex flex-col items-center gap-0.5 pt-0.5">
                  <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                    isActive ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {item.order}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveImage(item.layerId, -1); }}
                    disabled={idx === 0}
                    className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                  >
                    <ChevronDown className="w-2.5 h-2.5 rotate-180" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveImage(item.layerId, 1); }}
                    disabled={idx === imageSequence.length - 1}
                    className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed p-0.5"
                  >
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="w-9 h-9 rounded overflow-hidden bg-gray-700 flex-shrink-0">
                      {layer.src && (
                        <ResolvedImage
                          src={layer.src}
                          alt={layer.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-[11px] text-gray-300 truncate">{layer.title}</p>
                      <p className="text-[9px] text-gray-600">
                        {layer.width}×{layer.height}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeImageFromSequence(item.layerId); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-0.5 mt-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-1">
                    <input
                      type="text"
                      value={item.imagePrompt}
                      onChange={(e) => updateImagePrompt(item.layerId, e.target.value)}
                      placeholder={`描述图片${item.order}在此镜头的动作/表情...`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-gray-900/60 border border-gray-700 rounded px-1.5 py-1 text-[10px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-2 py-2 border-t border-gray-700/50">
        {showCanvasImagePicker ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-2 max-h-36 overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-gray-400">选择画布上的图片</span>
              <button
                onClick={() => setShowCanvasImagePicker(false)}
                className="text-gray-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {canvasImageLayers.length === 0 ? (
              <p className="text-[9px] text-gray-600 text-center py-2">画布上没有其他可用的图片</p>
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {canvasImageLayers.map(l => (
                  <button
                    key={l.id}
                    onClick={() => { addImageToSequence(l.id); setShowCanvasImagePicker(false); }}
                    className="relative group/img aspect-[4/3] rounded overflow-hidden bg-gray-700 border border-transparent hover:border-purple-500 transition-all"
                  >
                    <ResolvedImage src={l.src} alt={l.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                      <Plus className="w-3 h-3 text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowCanvasImagePicker(true)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800/60 rounded-lg border border-dashed border-gray-700 hover:border-gray-600 transition-all"
          >
            <Plus className="w-3 h-3" />
            从画布添加图片
          </button>
        )}
      </div>
    </div>
  );

  // ── 渲染：右侧标签页 ──────────────────────────────────

  const renderTabBar = () => (
    <div className="flex border-b border-gray-700/50">
      {TAB_CONFIG.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors relative ${
            activeTab === tab.id
              ? 'text-purple-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {tab.icon}
          {tab.label}
          {activeTab === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'prompt': return renderPromptTab();
      case 'actions': return renderActionsTab();
      case 'templates': return renderTemplatesTab();
      case 'settings': return renderSettingsTab();
      case 'camera': return renderCameraTab();
      case 'lighting': return renderLightingTab();
      case 'dialogue': return renderDialogueTab();
    }
  };

  // ── Tab: 结构化提示词 ──

  const renderPromptTab = () => {
    const fullPromptPreview = buildFullPromptPreview();
    return (
    <div className="p-4 space-y-3 overflow-y-auto">
      {/* 主体描述 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          主体描述
        </label>
        <input
          value={subjectPrompt}
          onChange={(e) => setSubjectPrompt(e.target.value)}
          placeholder="描述视频中的主要人物/对象的外观特征...&#10;例如：一位穿黑色风衣的年轻男子，短发，眼神坚毅"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      {/* 动作描述 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          动作描述
        </label>
        <textarea
          value={actionPrompt}
          onChange={(e) => setActionPrompt(e.target.value)}
          placeholder="描述主体的动作、行为、情绪变化...&#10;例如：在雨中缓步前行，偶尔抬头看路灯，神情疲惫"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors resize-none"
        />
      </div>

      {/* 环境描述 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          环境描述
        </label>
        <textarea
          value={environmentPrompt}
          onChange={(e) => setEnvironmentPrompt(e.target.value)}
          placeholder="描述场景环境、空间关系、背景细节...&#10;例如：潮湿的柏油路面反射霓虹灯光，雨滴打在水洼上泛起涟漪"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors resize-none"
        />
      </div>

      {/* 风格氛围 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          风格与氛围
        </label>
        <textarea
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="描述视觉风格、色彩基调、情感氛围...&#10;例如：赛博朋克美学，冷色调，电影级景深，略带颗粒感"
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
        />
      </div>

      {/* 负面提示词 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          负面提示词
          <span className="text-[9px] text-gray-600 font-normal">（不希望出现的内容）</span>
        </label>
        <input
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder="例如：卡通风格，低质量，模糊，水印，人物变形"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 transition-colors"
        />
      </div>

      {/* AI 质检按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleQualityCheck}
          disabled={isCheckingQuality || !fullPromptPreview.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-cyan-600/80 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isCheckingQuality ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              AI 质检
            </>
          )}
        </button>
        <span className="text-[10px] text-gray-600">检查提示词是否有逻辑冲突或不合理之处</span>
      </div>

      {/* 质检报告 */}
      {qualityReport && (
        <div className="bg-gray-800/60 rounded-lg border border-cyan-500/30 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-medium text-cyan-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              AI 质检报告
            </h4>
            <button
              onClick={() => setQualityReport(null)}
              className="text-gray-500 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <pre className="text-[11px] text-gray-300 font-sans leading-relaxed whitespace-pre-wrap">
            {qualityReport}
          </pre>
        </div>
      )}

      {/* 全局补充说明 */}
      <div className="border-t border-gray-700/30 pt-3">
        <details className="group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors flex items-center gap-1">
            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
            全局补充提示词（可选）
          </summary>
          <textarea
            value={globalPrompt}
            onChange={(e) => setGlobalPrompt(e.target.value)}
            placeholder="额外的全局描述，会附加在最终提示词末尾"
            rows={2}
            className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
          />
        </details>
      </div>

      {/* 提示词预览 */}
      <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-3">
        <details open>
          <summary className="text-xs font-medium text-gray-400 mb-1 cursor-pointer hover:text-gray-300 transition-colors flex items-center gap-1">
            <ChevronDown className="w-3 h-3" />
            最终提示词预览
          </summary>
          <div className="bg-gray-900 rounded p-2.5 text-[11px] text-gray-500 font-mono leading-relaxed max-h-48 overflow-y-auto mt-1">
            {fullPromptPreview || <span className="text-gray-700">填写上方字段后自动生成</span>}
          </div>
        </details>
      </div>
    </div>
    );
  };

  // ── 构建最终 prompt 预览 ──

  const buildFullPromptPreview = useCallback(() => {
    const parts: string[] = [];

    if (subjectPrompt) parts.push(`[主体] ${subjectPrompt}`);
    if (actionPrompt) parts.push(`[动作] ${actionPrompt}`);
    if (environmentPrompt) parts.push(`[环境] ${environmentPrompt}`);
    if (stylePrompt) parts.push(`[风格] ${stylePrompt}`);
    if (negativePrompt) parts.push(`[负面] ${negativePrompt}`);

    // 时间戳动作
    const validActions = timestampActions
      .filter(a => a.description.trim())
      .sort((a, b) => a.startTime - b.startTime);
    if (validActions.length > 0) {
      parts.push('');
      parts.push('--- 动作时间线 ---');
      validActions.forEach(a => {
        const startStr = formatTime(a.startTime);
        const endStr = formatTime(a.endTime);
        parts.push(`[${startStr} - ${endStr}] ${a.description}`);
      });
    }

    parts.push('');
    parts.push('--- Image sequence description ---');
    imageSequence.forEach((s) => {
      const layer = imageLookup.get(s.layerId);
      const title = layer?.title || 'Image';
      parts.push(s.imagePrompt ? `[${title}] ${s.imagePrompt}` : `[${title}] No specific prompt.`);
    });

    const cameraMove = CAMERA_MOVEMENTS.find(c => c.id === selectedCamera);
    if (selectedCamera !== 'none' && cameraMove) {
      if (useChoreography) {
        parts.push('');
        parts.push(`[运镜编排] ${cameraMove.label}`);
        parts.push(`  起始: ${startShotSize}/${startAngle}/${startSubject}`);
        parts.push(`  结束: ${endShotSize}/${endAngle}/${endSubject}`);
        if (movementPath) parts.push(`  路径: ${movementPath}`);
      } else {
        parts.push(`[运镜] ${cameraMove.label} 强度${cameraIntensity}/10 速度${cameraSpeed}%`);
      }
    }

    const lightingPreset = LIGHTING_PRESETS.find(l => l.id === selectedLighting);
    if (selectedLighting !== 'none' && lightingPreset) {
      parts.push(`[光照] ${lightingPreset.label} 强度${lightingIntensity}%`);
    }

    const dialogueTexts = dialogues
      .filter(d => d.text.trim())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(d => {
        const timeStr = formatTime(d.timestamp);
        if (d.type === 'dialogue') return `[对白][${timeStr}] ${d.character || '角色'}: "${d.text}"`;
        return `[旁白][${timeStr}] "${d.text}"`;
      });
    if (dialogueTexts.length > 0) {
      parts.push('');
      parts.push('--- 对白/旁白 ---');
      parts.push(...dialogueTexts);
    }

    if (globalPrompt) {
      parts.push('');
      parts.push(globalPrompt);
    }

    return parts.join('\n');
  }, [subjectPrompt, actionPrompt, environmentPrompt, stylePrompt, negativePrompt, timestampActions, imageSequence, imageLookup, selectedCamera, useChoreography, startShotSize, startAngle, startSubject, startFocus, movementPath, endShotSize, endAngle, endSubject, cameraIntensity, cameraSpeed, selectedLighting, lightingIntensity, LIGHTING_PRESETS, dialogues, globalPrompt]);

  // ── AI 质检 ──

  const handleQualityCheck = useCallback(async () => {
    const preview = buildFullPromptPreview();
    if (!preview.trim()) return;

    setIsCheckingQuality(true);
    setQualityReport(null);

    try {
      const { chatCompletion } = await import('../../../../services/ai/apiCore');
      const report = await chatCompletion(
        `你是一位专业的 AI 视频提示词质量评审专家。请分析以下视频生成提示词，检查是否存在以下问题：

1. 逻辑冲突：描述中是否存在前后矛盾（如"白天"和"星空"同时出现）
2. 动作冲突：角色动作是否存在物理上不可能的情况
3. 风格冲突：视觉风格描述是否相互矛盾
4. 环境冲突：场景环境元素是否合理共存
5. 运镜与内容冲突：镜头运动是否与画面内容协调
6. 缺失关键信息：是否缺少主体、动作、环境等核心要素

请输出分析结果，格式如下：
✅ 通过 / ⚠️ 警告 / ❌ 问题
- 发现的问题（如有）：
- 改进建议：

提示词内容：
${preview}`,
        undefined,
        0.5,
        2048
      );
      setQualityReport(report || '分析完成，未发现问题。');
    } catch (error: any) {
      setQualityReport(`质检失败: ${error.message}`);
    } finally {
      setIsCheckingQuality(false);
    }
  }, [buildFullPromptPreview]);

  // ── Tab: 画面设置 ──

  const renderSettingsTab = () => (
    <div className="p-4 space-y-5">
      {/* 尺寸选择 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-2">
          <Settings className="w-3.5 h-3.5 text-gray-400" />
          视频尺寸
        </label>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {VIDEO_SIZE_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              onClick={() => { setSelectedSizePreset(i); setUseCustomSize(false); }}
              className={`px-2.5 py-2 text-xs rounded-lg border transition-all ${
                !useCustomSize && selectedSizePreset === i
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">{preset.width}×{preset.height}</div>
            </button>
          ))}
          <button
            onClick={() => setUseCustomSize(true)}
            className={`px-2.5 py-2 text-xs rounded-lg border transition-all ${
              useCustomSize
                ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}
          >
            <div className="font-medium">自定义</div>
            <div className="text-[10px] opacity-60 mt-0.5">自定尺寸</div>
          </button>
        </div>
        {useCustomSize && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              value={customWidth}
              onChange={(e) => setCustomWidth(parseInt(e.target.value) || 720)}
              min={256}
              max={4096}
              step={2}
              className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500/50"
            />
            <span className="text-gray-500 text-xs">×</span>
            <input
              type="number"
              value={customHeight}
              onChange={(e) => setCustomHeight(parseInt(e.target.value) || 720)}
              min={256}
              max={4096}
              step={2}
              className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500/50"
            />
            <span className="text-[10px] text-gray-600">px</span>
          </div>
        )}
        <div className="text-[10px] text-gray-600 mt-1.5">
          当前: {currentSize.width}×{currentSize.height}px
        </div>
      </div>

      {/* 时长 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          视频时长
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={3000}
            max={15000}
            step={100}
            value={durationMs}
            onChange={handleDurationSlider}
            className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
          />
          <input
            ref={durationInputRef}
            type="text"
            value={durationInput}
            onChange={handleDurationInput}
            className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 text-center focus:outline-none focus:border-purple-500/50 font-mono"
          />
          <span className="text-xs text-gray-500">秒</span>
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>3秒</span>
          <span className={durationMs < 3000 || durationMs > 15000 ? 'text-red-400' : ''}>
            {durationMs}ms
          </span>
          <span>15秒</span>
        </div>
      </div>

      {/* 模型信息 */}
      <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-3">
        <div className="text-[10px] text-gray-500 space-y-0.5">
          <p>• 视频尺寸将按实际比例传递给 AI 模型</p>
          <p>• 时长精确到毫秒，模型会根据支持的时长做适配</p>
          <p>• 部分模型不支持竖屏(9:16)或方形(1:1)，会在生成时自动处理</p>
        </div>
      </div>
    </div>
  );

  // ── Tab: 运镜 ──

  const renderSelect = (label: string, value: string, options: readonly string[], onChange: (v: string) => void) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-14 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500/50"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );

  const renderCameraTab = () => (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* 运镜类型选择 */}
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-2">
          <Camera className="w-3.5 h-3.5 text-purple-400" />
          镜头运动类型
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {CAMERA_MOVEMENTS.map(cam => (
            <button
              key={cam.id}
              onClick={() => setSelectedCamera(cam.id)}
              className={`p-2 rounded-lg border text-left transition-all ${
                selectedCamera === cam.id
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
              }`}
            >
              <div className={`text-xs font-medium ${
                selectedCamera === cam.id ? 'text-purple-300' : 'text-gray-300'
              }`}>
                {cam.label}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight line-clamp-2">
                {cam.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedCamera !== 'none' && (
        <>
          {/* 强度 & 速度（基础模式共享） */}
          <div className="space-y-3 bg-gray-800/30 rounded-lg border border-gray-700/50 p-3">
            <div>
              <label className="text-xs text-gray-400 flex items-center justify-between">
                <span>运镜强度</span>
                <span className="text-purple-400 font-mono">{cameraIntensity}/10</span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={cameraIntensity}
                onChange={(e) => setCameraIntensity(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500 mt-1"
              />
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>轻微</span>
                <span>强烈</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 flex items-center justify-between">
                <span>运镜速度</span>
                <span className="text-purple-400 font-mono">{cameraSpeed}%</span>
              </label>
              <input
                type="range"
                min={10}
                max={100}
                value={cameraSpeed}
                onChange={(e) => setCameraSpeed(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500 mt-1"
              />
              <div className="flex justify-between text-[10px] text-gray-600">
                <span>缓慢</span>
                <span>快速</span>
              </div>
            </div>
          </div>

          {/* 运镜编排开关 */}
          <div className="flex items-center gap-2 py-1">
            <button
              onClick={() => setUseChoreography(!useChoreography)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border ${
                useChoreography
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <Layout className="w-3 h-3" />
              {useChoreography ? '运镜编排已开启' : '启用运镜编排（起点→路径→终点）'}
            </button>
          </div>

          {useChoreography && (
            <div className="space-y-4 bg-gray-800/30 rounded-lg border border-purple-500/30 p-3">
              <p className="text-[10px] text-purple-400 font-medium">依据 Seedance 运镜规范：起点 → 路径 → 终点</p>

              {/* 起始帧 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  起始帧姿态
                </h5>
                <div className="space-y-1.5">
                  {renderSelect('景别', startShotSize, CAMERA_SHOT_SIZES, setStartShotSize)}
                  {renderSelect('角度', startAngle, CAMERA_ANGLES, setStartAngle)}
                  {renderSelect('主体位置', startSubject, CAMERA_SUBJECT_POSITIONS, setStartSubject)}
                  {renderSelect('焦点', startFocus, CAMERA_FOCUS_TYPES, setStartFocus)}
                </div>
              </div>

              {/* 运镜路径 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  运镜路径
                </h5>
                <div className="space-y-1.5">
                  {renderSelect('速度', movementSpeed, CAMERA_MOVEMENT_SPEEDS, setMovementSpeed)}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-14 shrink-0">路径描述</span>
                    <input
                      type="text"
                      value={movementPath}
                      onChange={(e) => setMovementPath(e.target.value)}
                      placeholder="如: 从右侧向前推进至面部特写"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* 结束帧 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  结束帧姿态
                </h5>
                <div className="space-y-1.5">
                  {renderSelect('景别', endShotSize, CAMERA_SHOT_SIZES, setEndShotSize)}
                  {renderSelect('角度', endAngle, CAMERA_ANGLES, setEndAngle)}
                  {renderSelect('主体位置', endSubject, CAMERA_SUBJECT_POSITIONS, setEndSubject)}
                </div>
              </div>

              {/* 时间分配 */}
              <div>
                <h5 className="text-[11px] text-gray-300 font-medium mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  时间分配
                </h5>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>起始段占比</span>
                      <span className="text-purple-400 font-mono">{Math.round(timingStartRatio * 100)}%</span>
                    </label>
                    <input
                      type="range" min={10} max={60} value={Math.round(timingStartRatio * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        const remaining = 1 - v;
                        const m = timingMoveRatio / (timingMoveRatio + timingEndRatio);
                        setTimingStartRatio(v);
                        setTimingMoveRatio(Math.round(remaining * m * 100) / 100);
                        setTimingEndRatio(Math.round(remaining * (1 - m) * 100) / 100);
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>运镜段占比</span>
                      <span className="text-purple-400 font-mono">{Math.round(timingMoveRatio * 100)}%</span>
                    </label>
                    <input
                      type="range" min={10} max={70} value={Math.round(timingMoveRatio * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        const remaining = 1 - v;
                        setTimingMoveRatio(v);
                        setTimingStartRatio(Math.round(Math.min(timingStartRatio, remaining - 0.1) * 100) / 100);
                        setTimingEndRatio(Math.round((remaining - Math.min(timingStartRatio, remaining - 0.1)) * 100) / 100);
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 flex items-center justify-between">
                      <span>结束段占比</span>
                      <span className="text-purple-400 font-mono">{Math.round(timingEndRatio * 100)}%</span>
                    </label>
                    <input
                      type="range" min={10} max={60} value={Math.round(timingEndRatio * 100)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) / 100;
                        const remaining = 1 - v;
                        const s = timingStartRatio / (timingStartRatio + timingMoveRatio);
                        setTimingEndRatio(v);
                        setTimingStartRatio(Math.round(remaining * s * 100) / 100);
                        setTimingMoveRatio(Math.round(remaining * (1 - s) * 100) / 100);
                      }}
                      className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Tab: 光照 ──

  const renderLightingTab = () => (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-5 gap-1.5">
        {LIGHTING_PRESETS.map(light => (
          <button
            key={light.id}
            onClick={() => setSelectedLighting(light.id)}
            className={`p-2 rounded-lg border text-center transition-all ${
              selectedLighting === light.id
                ? 'border-yellow-500 bg-yellow-500/10'
                : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
            }`}
          >
            <div className="w-6 h-6 mx-auto mb-1 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 opacity-80" />
            <div className={`text-[10px] font-medium ${
              selectedLighting === light.id ? 'text-yellow-300' : 'text-gray-300'
            }`}>
              {light.label}
            </div>
            <div className="text-[8px] text-gray-500 mt-0.5 leading-tight line-clamp-2">
              {light.description}
            </div>
          </button>
        ))}
      </div>

      {selectedLighting !== 'none' && (
        <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-3">
          <label className="text-xs text-gray-400 flex items-center justify-between">
            <span>光照强度</span>
            <span className="text-yellow-400 font-mono">{lightingIntensity}%</span>
          </label>
          <input
            type="range"
            min={10}
            max={100}
            value={lightingIntensity}
            onChange={(e) => setLightingIntensity(parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-yellow-500 mt-1"
          />
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>自然</span>
            <span>强烈</span>
          </div>
        </div>
      )}
    </div>
  );

  // ── 对白时间编辑态 ──
  const [dialogueTimeRaw, setDialogueTimeRaw] = useState<Record<string, string>>({});

  const commitDialogueTime = (entryId: string, raw: string) => {
    setDialogueTimeRaw(prev => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
    const parsed = parseTime(raw);
    if (parsed !== null && parsed >= 0 && parsed <= durationMs) {
      updateDialogue(entryId, { timestamp: parsed });
    }
  };

  // ── Tab: 对白/旁白 ──

  const renderDialogueTab = () => (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5 text-gray-400" />
          对白与旁白时间线
          <span className="text-gray-500 font-normal">({dialogues.length}条)</span>
        </label>
        <button
          onClick={addDialogue}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      {dialogues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-sm gap-2">
          <Mic className="w-8 h-8 opacity-30" />
          <p>暂无对白或旁白</p>
          <p className="text-xs">点击"添加"按钮来创建</p>
        </div>
      )}

      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
        {dialogues.map((entry) => (
          <div
            key={entry.id}
            className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-2.5 group"
          >
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={dialogueTimeRaw[entry.id] ?? formatTime(entry.timestamp)}
                onChange={(e) => setDialogueTimeRaw(prev => ({ ...prev, [entry.id]: e.target.value }))}
                onBlur={() => commitDialogueTime(entry.id, dialogueTimeRaw[entry.id] ?? formatTime(entry.timestamp))}
                className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 font-mono text-center focus:outline-none focus:border-purple-500/50"
              />
              <select
                value={entry.type}
                onChange={(e) => updateDialogue(entry.id, { type: e.target.value as 'dialogue' | 'narration' })}
                className="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500/50"
              >
                <option value="dialogue">对白</option>
                <option value="narration">旁白</option>
              </select>
              {entry.type === 'dialogue' && (
                <input
                  type="text"
                  value={entry.character}
                  onChange={(e) => updateDialogue(entry.id, { character: e.target.value })}
                  placeholder="角色名"
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                />
              )}
              <button
                onClick={() => removeDialogue(entry.id)}
                className="ml-auto text-gray-400 hover:text-red-400 transition-all p-0.5"
                title="删除此条目"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="flex items-start gap-2">
              <div className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                entry.type === 'dialogue' ? 'bg-blue-400' : 'bg-green-400'
              }`} />
              <input
                type="text"
                value={entry.text}
                onChange={(e) => updateDialogue(entry.id, { text: e.target.value })}
                placeholder={entry.type === 'dialogue' ? '对白内容...' : '旁白内容...'}
                className="flex-1 bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-800/20 rounded-lg border border-gray-700/50 p-2.5">
        <div className="relative h-8 bg-gray-900 rounded overflow-hidden">
          {dialogues
            .filter(d => d.text.trim())
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((entry) => {
              const percent = durationMs > 0 ? (entry.timestamp / durationMs) * 100 : 0;
              return (
                <div
                  key={entry.id}
                  className={`absolute top-0 h-full w-0.5 ${
                    entry.type === 'dialogue' ? 'bg-blue-500' : 'bg-green-500'
                  }`}
                  style={{ left: `${Math.min(percent, 100)}%` }}
                  title={`${formatTime(entry.timestamp)} - ${entry.text}`}
                />
              );
            })}
        </div>
        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
          <span>00:00.000</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>
    </div>
  );

  // ── Tab: 动作时间线 ──

  const addTimestampAction = useCallback(() => {
    const lastAction = timestampActions[timestampActions.length - 1];
    const start = lastAction ? lastAction.endTime : 0;
    const end = Math.min(start + 2000, durationMs);
    setTimestampActions(prev => [...prev, {
      id: crypto.randomUUID(),
      startTime: start,
      endTime: end,
      description: '',
    }]);
  }, [timestampActions, durationMs]);

  const updateTimestampAction = useCallback((id: string, updates: Partial<TimestampActionItem>) => {
    setTimestampActions(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const removeTimestampAction = useCallback((id: string) => {
    setTimestampActions(prev => prev.filter(a => a.id !== id));
  }, []);

  // ── 时间输入编辑状态（临时字符串，不强制格式） ──
  const [timeEditRaw, setTimeEditRaw] = useState<Record<string, { start?: string; end?: string }>>({});

  const getTimeInputValue = (actionId: string, field: 'start' | 'end', msValue: number): string => {
    return timeEditRaw[actionId]?.[field] ?? formatActionTime(msValue);
  };

  const handleTimeInputChange = (actionId: string, field: 'start' | 'end', raw: string) => {
    setTimeEditRaw(prev => ({
      ...prev,
      [actionId]: { ...prev[actionId], [field]: raw },
    }));
  };

  const commitTimeInput = (actionId: string, field: 'start' | 'end', action: TimestampActionItem) => {
    const raw = timeEditRaw[actionId]?.[field];
    if (raw === undefined) return;

    // 清除编辑态
    setTimeEditRaw(prev => {
      const next = { ...prev };
      if (next[actionId]) {
        delete next[actionId][field];
        if (Object.keys(next[actionId]).length === 0) delete next[actionId];
      }
      return next;
    });

    // 尝试解析
    const parsed = parseTimeDisplay(raw);
    if (parsed === null) return;

    if (field === 'start') {
      if (parsed >= 0 && parsed < action.endTime) {
        updateTimestampAction(actionId, { startTime: parsed });
      }
    } else {
      if (parsed > action.startTime && parsed <= durationMs) {
        updateTimestampAction(actionId, { endTime: parsed });
      }
    }
  };

  const parseTimeDisplay = (str: string): number | null => {
    const parts = str.split(':');
    if (parts.length !== 2) return null;
    const min = parseInt(parts[0], 10);
    const sec = parseFloat(parts[1]);
    if (isNaN(min) || isNaN(sec)) return null;
    if (sec >= 60) return null;
    return (min * 60 + sec) * 1000;
  };

  const formatActionTime = (ms: number): string => {
    const totalSec = ms / 1000;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (!isFinite(sec) || isNaN(sec)) return '00:00.000';
    return `${min.toString().padStart(2, '0')}:${sec.toFixed(3).padStart(6, '0')}`;
  };

  const renderActionsTab = () => (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5 text-green-400" />
          动作时间线
          <span className="text-gray-500 font-normal">({timestampActions.length}段)</span>
        </label>
        <button
          onClick={addTimestampAction}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加动作段
        </button>
      </div>

      <p className="text-[10px] text-gray-500">
        将视频按时间段分解为连续的动作序列。模型将按时间顺序依次执行各段动作描述。
        <span className="text-green-500/70"> Sora 2 等模型对此格式响应最佳。</span>
      </p>

      {timestampActions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-500 text-sm gap-2">
          <Film className="w-8 h-8 opacity-30" />
          <p>暂无动作分段</p>
          <p className="text-xs">点击"添加动作段"将视频动作分解为时间序列</p>
        </div>
      )}

      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {timestampActions.map((action, idx) => (
          <div
            key={action.id}
            className="bg-gray-800/40 rounded-lg border border-green-700/30 p-2.5 group"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-500 font-mono w-5">#{idx + 1}</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={getTimeInputValue(action.id, 'start', action.startTime)}
                  onChange={(e) => handleTimeInputChange(action.id, 'start', e.target.value)}
                  onBlur={() => commitTimeInput(action.id, 'start', action)}
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 font-mono text-center focus:outline-none focus:border-green-500/50"
                />
                <span className="text-gray-600 text-[10px]">→</span>
                <input
                  type="text"
                  value={getTimeInputValue(action.id, 'end', action.endTime)}
                  onChange={(e) => handleTimeInputChange(action.id, 'end', e.target.value)}
                  onBlur={() => commitTimeInput(action.id, 'end', action)}
                  className="w-20 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200 font-mono text-center focus:outline-none focus:border-green-500/50"
                />
              </div>
              <span className="text-[10px] text-gray-600">
                时长 {(action.endTime - action.startTime) / 1000}s
              </span>
              <button
                onClick={() => removeTimestampAction(action.id)}
                className="ml-auto text-gray-400 hover:text-red-400 transition-all p-0.5"
                title="删除此动作段"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <textarea
              value={action.description}
              onChange={(e) => updateTimestampAction(action.id, { description: e.target.value })}
              placeholder={`描述第 ${idx + 1} 段的动作内容...`}
              rows={2}
              className="w-full bg-gray-900/60 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500/50 transition-colors resize-none"
            />
          </div>
        ))}
      </div>

      {/* 时间轴可视化 */}
      {timestampActions.length > 0 && (
        <div className="bg-gray-800/20 rounded-lg border border-gray-700/50 p-2.5">
          <div className="relative h-8 bg-gray-900 rounded overflow-hidden">
            {timestampActions
              .filter(a => a.description.trim())
              .sort((a, b) => a.startTime - b.startTime)
              .map((action, idx) => {
                const left = durationMs > 0 ? (action.startTime / durationMs) * 100 : 0;
                const width = durationMs > 0 ? ((action.endTime - action.startTime) / durationMs) * 100 : 0;
                const colors = ['bg-green-500', 'bg-blue-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500'];
                return (
                  <div
                    key={action.id}
                    className={`absolute top-1 bottom-1 rounded ${colors[idx % colors.length]} opacity-60`}
                    style={{ left: `${Math.min(left, 100)}%`, width: `${Math.min(width, 100 - left)}%` }}
                    title={`${formatActionTime(action.startTime)}-${formatActionTime(action.endTime)}: ${action.description}`}
                  />
                );
              })}
          </div>
          <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
            <span>00:00.000</span>
            <span>{formatTime(durationMs)}</span>
          </div>
        </div>
      )}
    </div>
  );

  // ── Tab: 视频模板 ──

  const applyTemplate = useCallback((template: TemplatePreset) => {
    setSubjectPrompt(template.subjectPrompt);
    setActionPrompt(template.actionPrompt);
    setEnvironmentPrompt(template.environmentPrompt);
    setStylePrompt(template.stylePrompt);
    setNegativePrompt(template.negativePrompt);
    setSelectedCamera(template.cameraId);
    setCameraIntensity(template.cameraIntensity);
    setCameraSpeed(template.cameraSpeed);
    setSelectedLighting(template.lightingId);
    setLightingIntensity(template.lightingIntensity);
    setDurationMs(template.durationMs);
    setDurationInput((template.durationMs / 1000).toFixed(3));
    setSelectedTemplateId(template.id);
  }, []);

  const saveCurrentAsTemplate = useCallback(() => {
    const name = prompt('输入模板名称：');
    if (!name?.trim()) return;
    const template: TemplatePreset = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      description: `${actionPrompt?.slice(0, 50) || '自定义模板'}`,
      category: 'custom',
      subjectPrompt,
      actionPrompt,
      environmentPrompt,
      stylePrompt,
      negativePrompt,
      cameraId: selectedCamera,
      cameraIntensity,
      cameraSpeed,
      lightingId: selectedLighting,
      lightingIntensity,
      durationMs,
    };
    // 保存到 localStorage
    try {
      const existing = JSON.parse(localStorage.getItem('video_templates') || '[]');
      existing.push(template);
      localStorage.setItem('video_templates', JSON.stringify(existing));
      alert(`模板"${name}"已保存！`);
    } catch {
      alert('保存失败');
    }
  }, [subjectPrompt, actionPrompt, environmentPrompt, stylePrompt, negativePrompt, selectedCamera, cameraIntensity, cameraSpeed, selectedLighting, lightingIntensity, durationMs]);

  const [customTemplates, setCustomTemplates] = useState<TemplatePreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('video_templates') || '[]');
    } catch {
      return [];
    }
  });

  const deleteCustomTemplate = useCallback((id: string) => {
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    localStorage.setItem('video_templates', JSON.stringify(updated));
  }, [customTemplates]);

  const filteredTemplates = useMemo(() => {
    const presets = templateCategory === 'all'
      ? VIDEO_TEMPLATE_PRESETS
      : VIDEO_TEMPLATE_PRESETS.filter(t => t.category === templateCategory);
    return [...presets, ...customTemplates];
  }, [templateCategory, customTemplates]);

  const renderTemplatesTab = () => (
    <div className="p-4 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Layout className="w-3.5 h-3.5 text-purple-400" />
          视频模板
        </label>
        <button
          onClick={saveCurrentAsTemplate}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          保存当前配置为模板
        </button>
      </div>

      <p className="text-[10px] text-gray-500">
        选择一个模板快速应用运镜、光照、风格和时长的组合配置。选中模板后可在各标签页中微调。
      </p>

      {/* 分类筛选 */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setTemplateCategory(cat.id)}
            className={`shrink-0 px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
              templateCategory === cat.id
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            {cat.name}
          </button>
        ))}
        {customTemplates.length > 0 && (
          <button
            onClick={() => setTemplateCategory('custom')}
            className={`shrink-0 px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
              templateCategory === 'custom'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            自定义
          </button>
        )}
      </div>

      {/* 模板列表 */}
      <div className="grid grid-cols-2 gap-2">
        {filteredTemplates.map(template => (
          <div
            key={template.id}
            className={`rounded-lg border p-3 cursor-pointer transition-all ${
              selectedTemplateId === template.id
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-gray-700/50 bg-gray-800/40 hover:border-gray-600'
            }`}
            onClick={() => applyTemplate(template)}
          >
            <div className="flex items-start justify-between mb-1">
              <h4 className={`text-xs font-medium ${
                selectedTemplateId === template.id ? 'text-purple-300' : 'text-gray-300'
              }`}>
                {template.name}
              </h4>
              {template.id.startsWith('custom_') && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCustomTemplate(template.id); }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mb-1.5 line-clamp-2">{template.description}</p>
            <div className="flex flex-wrap gap-1">
              {template.cameraId !== 'none' && (
                <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                  {CAMERA_MOVEMENTS.find(c => c.id === template.cameraId)?.label || template.cameraId}
                </span>
              )}
              {template.lightingId !== 'none' && (
                <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                  {LIGHTING_PRESETS.find(l => l.id === template.lightingId)?.label || template.lightingId}
                </span>
              )}
              <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                {template.durationMs / 1000}s
              </span>
              {template.category !== 'custom' && (
                <span className="text-[9px] text-gray-600 bg-gray-700/30 px-1.5 py-0.5 rounded">
                  {TEMPLATE_CATEGORIES.find(c => c.id === template.category)?.name || template.category}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── 主渲染 ──────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-[90vw] h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-semibold text-white">AI 视频生成</h2>
            <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{imageSequence.length} 张图片 · {durationMs}ms</span>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex min-h-0">
          {/* 左侧：图片序列 */}
          <div className="w-[340px] flex-shrink-0 border-r border-gray-700/50 flex flex-col">
            {renderImageSequence()}
          </div>

          {/* 右侧：配置标签页 */}
          <div className="flex-1 flex flex-col min-w-0">
            {renderTabBar()}
            <div className="flex-1 overflow-y-auto">
              {renderTabContent()}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>总时长: <span className="text-gray-300 font-mono">{durationInput}s</span></span>
            <span className="text-gray-700">|</span>
            <span>尺寸: <span className="text-gray-300">{currentSize.width}×{currentSize.height}</span></span>
          </div>

          <div className="flex items-center gap-3">
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span>{progressLabel}</span>
              </div>
            )}

            {isGenerating && (
              <div className="w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="px-5 py-2 text-xs text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>生成中...</>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  生成视频
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 双击放大灯箱 ── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-[80vw] max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-sm text-white/80 truncate">{lightboxImage.title}</span>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ResolvedImage
              src={lightboxImage.src}
              alt={lightboxImage.title}
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
            />
            {lightboxImage.width && lightboxImage.height && (
              <span className="mt-2 text-[11px] text-white/40">
                {lightboxImage.width} × {lightboxImage.height}px
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
