import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { CameraChoreography, renderCameraChoreographyPrompt } from '../../../../types';
import { CAMERA_MOVEMENT_TYPES, CAMERA_SHOT_SIZES, CAMERA_ANGLES, CAMERA_SUBJECT_POSITIONS, CAMERA_FOCUS_TYPES, CAMERA_MOVEMENT_SPEEDS } from '../../../../components/StageDirector/constants';
import { Plus, GripVertical, Trash2, ChevronDown, Sparkles, Camera, Sun, Mic, Settings, Film, Clock, X, Maximize2, Eye, EyeOff, Layout } from 'lucide-react';

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

type RightTab = 'prompt' | 'settings' | 'camera' | 'lighting' | 'dialogue';

export interface GenerationConfig {
  imageSequence: { layerId: string; imagePrompt: string }[];
  globalPrompt: string;
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

// ─── 常量 ────────────────────────────────────────────────

const VIDEO_SIZE_PRESETS: VideoSizePreset[] = [
  { label: '横屏 1080p', width: 1920, height: 1080, aspectRatio: '16:9' },
  { label: '横屏 720p',  width: 1280, height: 720,  aspectRatio: '16:9' },
  { label: '测试 640p',  width: 640,  height: 320,  aspectRatio: '2:1' },
  { label: '竖屏 1080p', width: 1080, height: 1920, aspectRatio: '9:16' },
  { label: '竖屏 720p',  width: 720,  height: 1280, aspectRatio: '9:16' },
  { label: '方形 1080p', width: 1080, height: 1080, aspectRatio: '1:1' },
  { label: '方形 720p',  width: 720,  height: 720,  aspectRatio: '1:1' },
];

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

const TAB_CONFIG: { id: RightTab; label: string; icon: React.ReactNode }[] = [
  { id: 'prompt',   label: '提示词', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'settings', label: '画面设置', icon: <Settings className="w-4 h-4" /> },
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
        cameraPrompt = '\n' + renderCameraChoreographyPrompt(cc, globalPrompt || '', Math.round(durationMs / 1000));
      } else {
        const cameraMove = CAMERA_MOVEMENTS.find(c => c.id === selectedCamera);
        cameraPrompt = cameraMove && selectedCamera !== 'none'
          ? `\nCamera movement: ${cameraMove.promptEn} Intensity level ${cameraIntensity}/10, speed ${cameraSpeed}/100.`
          : '';
      }

      const lightingPreset = LIGHTING_PRESETS.find(l => l.id === selectedLighting);
      const lightingPrompt = lightingPreset && selectedLighting !== 'none'
        ? `\nLighting: ${lightingPreset.promptEn} Apply with intensity ${lightingIntensity}/100.`
        : '';

      const dialogueSegments = dialogues
        .filter(d => d.text.trim())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(d => {
          const timeStr = formatTime(d.timestamp);
          if (d.type === 'narration') return `[${timeStr}] Narration: "${d.text}"`;
          return `[${timeStr}] ${d.character || 'Character'}: "${d.text}"`;
        });
      const dialoguePrompt = dialogueSegments.length > 0
        ? `\nDialogue and narration timeline:\n${dialogueSegments.join('\n')}`
        : '';

      const imagePrompts = imageSequence
        .map(s => {
          const layer = imageLookup.get(s.layerId);
          const title = layer?.title || `Image ${s.order}`;
          return s.imagePrompt
            ? `[${title}] ${s.imagePrompt}`
            : `[${title}] No specific prompt.`;
        })
        .join('\n');

      const fullPrompt = [
        globalPrompt,
        `\n--- Image sequence description ---`,
        imagePrompts,
        cameraPrompt,
        lightingPrompt,
        dialoguePrompt,
      ].filter(Boolean).join('\n');

      setProgressLabel('正在生成视频 (图片 1/' + imageSequence.length + ')...');

      const firstLayer = imageLookup.get(imageSequence[0].layerId);
      const startImage = firstLayer?.src || '';

      const videoUrl = await canvasModelService.generateVideo({
        prompt: fullPrompt,
        startImage,
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
      let videoId: string | undefined;

      if (videoUrl.startsWith('local:')) {
        const localId = videoUrl.replace('local:', '');
        videoId = localId;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) {
          resolvedUrl = URL.createObjectURL(blob);
        }
      } else if (videoUrl.startsWith('video:')) {
        const localId = videoUrl.replace('video:', '');
        videoId = localId;
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
      }

      const generationConfig: GenerationConfig = {
        imageSequence: imageSequence.map(s => ({ layerId: s.layerId, imagePrompt: s.imagePrompt })),
        globalPrompt,
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
        src: resolvedUrl,
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
                <img
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
                        <img
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
                    <img src={l.src} alt={l.title} className="w-full h-full object-cover" />
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
      case 'settings': return renderSettingsTab();
      case 'camera': return renderCameraTab();
      case 'lighting': return renderLightingTab();
      case 'dialogue': return renderDialogueTab();
    }
  };

  // ── Tab: 提示词 ──

  const renderPromptTab = () => (
    <div className="p-4 space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          全局视频提示词
        </label>
        <textarea
          value={globalPrompt}
          onChange={(e) => setGlobalPrompt(e.target.value)}
          placeholder="描述视频的整体风格、氛围、叙事方向...&#10;例如：电影级光影，赛博朋克城市夜景，镜头充满动感"
          rows={5}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
        />
        <p className="text-[10px] text-gray-600 mt-1">
          全局提示词会与各图片的描述、运镜、光照等配置合并后一起发送给 AI 模型
        </p>
      </div>

      <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-3">
        <h4 className="text-xs font-medium text-gray-400 mb-2">提示词预览</h4>
        <div className="bg-gray-900 rounded p-2.5 text-[11px] text-gray-500 font-mono leading-relaxed max-h-36 overflow-y-auto">
          <div>{globalPrompt || <span className="text-gray-700">[全局提示词]</span>}</div>
          <div className="text-gray-700">--- Image sequence description ---</div>
          {imageSequence.map((s, i) => {
            const layer = imageLookup.get(s.layerId);
            return (
              <div key={s.layerId} className={s.imagePrompt ? 'text-gray-400' : 'text-gray-700'}>
                [{layer?.title || `Image ${i + 1}`}] {s.imagePrompt || '[无描述]'}
              </div>
            );
          })}
          {selectedCamera !== 'none' && (
            <div className="text-gray-500">
              {useChoreography ? (
                <div className="space-y-0.5">
                  <div className="text-purple-400 font-semibold">[运镜编排模式]</div>
                  <div>起始: {startShotSize}/{startAngle}/{startSubject}</div>
                  <div>运镜: {CAMERA_MOVEMENTS.find(c => c.id === selectedCamera)?.label} → {movementPath || '默认路径'}</div>
                  <div>结束: {endShotSize}/{endAngle}/{endSubject}</div>
                </div>
              ) : (
                <span>[{CAMERA_MOVEMENTS.find(c => c.id === selectedCamera)?.label}]</span>
              )}
            </div>
          )}
          {selectedLighting !== 'none' && (
            <div className="text-gray-500">
              [{LIGHTING_PRESETS.find(l => l.id === selectedLighting)?.label}]
            </div>
          )}
          {dialogues.filter(d => d.text.trim()).length > 0 && (
            <div className="text-gray-500">[{dialogues.filter(d => d.text.trim()).length} 条对白/旁白]</div>
          )}
        </div>
      </div>
    </div>
  );

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
                value={formatTime(entry.timestamp)}
                onChange={(e) => {
                  const parsed = parseTime(e.target.value);
                  if (parsed !== null && parsed >= 0 && parsed <= durationMs) {
                    updateDialogue(entry.id, { timestamp: parsed });
                  }
                }}
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
                className="ml-auto opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-0.5"
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
            <img
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
