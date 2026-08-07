import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { CameraChoreography, renderCameraChoreographyPrompt } from '../../../../types';
import { Film, Sparkles, X } from 'lucide-react';
import { ResolvedImage } from './ResolvedImage';
import { logger, LogCategory } from '../../../../services/logger.ts';
import {
  VIDEO_SIZE_PRESETS,
  CAMERA_MOVEMENTS,
  LIGHTING_PRESETS,
  VIDEO_TEMPLATE_PRESETS,
  formatTime,
  type GenerationPanelState,
  type ImageSequenceItem,
  type DialogueEntry,
  type TimestampActionItem,
  type TemplatePreset,
  type RightTab,
} from './GenerateVideoPanel/types';
import { ImageSequencePanel } from './GenerateVideoPanel/ImageSequencePanel';
import { TabBar } from './GenerateVideoPanel/TabBar';
import { PromptTab } from './GenerateVideoPanel/PromptTab';
import { SettingsTab } from './GenerateVideoPanel/SettingsTab';
import { CameraTab } from './GenerateVideoPanel/CameraTab';
import { LightingTab } from './GenerateVideoPanel/LightingTab';
import { DialogueTab } from './GenerateVideoPanel/DialogueTab';
import { ActionsTab } from './GenerateVideoPanel/ActionsTab';
import { TemplatesTab } from './GenerateVideoPanel/TemplatesTab';

interface GenerateVideoPanelProps {
  selectedLayerIds: string[];
  initialConfig?: GenerationConfig;
  onClose: () => void;
}

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

export const GenerateVideoPanel: React.FC<GenerateVideoPanelProps> = ({
  selectedLayerIds,
  initialConfig,
  onClose,
}) => {
  const { layers } = useCanvasStore();

  // ── 图片序列状态 ──
  const [imageSequence, setImageSequence] = useState<ImageSequenceItem[]>(() => {
    const imageLayers = layers.filter(
      (l) => selectedLayerIds.includes(l.id) && l.type === 'image' && !l.isLoading,
    );
    const dedup = new Map<string, (typeof layers)[0]>();
    imageLayers.forEach((l) => dedup.set(l.id, l));
    return Array.from(dedup.values()).map((l, i) => ({
      layerId: l.id,
      order: i + 1,
      imagePrompt: '',
    }));
  });

  const [showCanvasImagePicker, setShowCanvasImagePicker] = useState(false);

  const imageLookup = useMemo(() => {
    const map = new Map<string, (typeof layers)[0]>();
    layers.forEach((l) => {
      if (l.type === 'image') map.set(l.id, l);
    });
    return map;
  }, [layers]);

  const canvasImageLayers = useMemo(
    () =>
      layers.filter(
        (l) => l.type === 'image' && !l.isLoading && !imageSequence.some((s) => s.layerId === l.id),
      ),
    [layers, imageSequence],
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
  const durationInputRef = useRef<HTMLInputElement>(null);

  // ── 重新生成：应用初始配置 ──

  const configApplied = useRef(false);
  useEffect(() => {
    if (!initialConfig || configApplied.current) return;
    configApplied.current = true;

    setImageSequence(
      initialConfig.imageSequence.map((item, i) => ({
        ...item,
        order: i + 1,
      })),
    );
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
      if (initialConfig.timingStartRatio !== undefined)
        setTimingStartRatio(initialConfig.timingStartRatio);
      if (initialConfig.timingMoveRatio !== undefined)
        setTimingMoveRatio(initialConfig.timingMoveRatio);
      if (initialConfig.timingEndRatio !== undefined)
        setTimingEndRatio(initialConfig.timingEndRatio);
    }
  }, [initialConfig]);

  // ── 图片预览状态 ──
  const [activePreviewId, setActivePreviewId] = useState<string | null>(
    imageSequence.length > 0 ? imageSequence[0].layerId : null,
  );
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    title: string;
    width?: number;
    height?: number;
  } | null>(null);

  // ── 图片序列操作 ──

  const addImageToSequence = useCallback((layerId: string) => {
    setImageSequence((prev) => {
      if (prev.some((s) => s.layerId === layerId)) return prev;
      return [...prev, { layerId, order: prev.length + 1, imagePrompt: '' }];
    });
    setActivePreviewId((prev) => prev || layerId);
  }, []);

  const removeImageFromSequence = useCallback(
    (layerId: string) => {
      setImageSequence((prev) => {
        const filtered = prev.filter((s) => s.layerId !== layerId);
        return filtered.map((s, i) => ({ ...s, order: i + 1 }));
      });
      setActivePreviewId((prev) => {
        if (prev === layerId) {
          const remaining = imageSequence.filter((s) => s.layerId !== layerId);
          return remaining.length > 0 ? remaining[0].layerId : null;
        }
        return prev;
      });
    },
    [imageSequence],
  );

  const updateImagePrompt = useCallback((layerId: string, prompt: string) => {
    setImageSequence((prev) =>
      prev.map((s) => (s.layerId === layerId ? { ...s, imagePrompt: prompt } : s)),
    );
  }, []);

  const moveImage = useCallback((layerId: string, direction: -1 | 1) => {
    setImageSequence((prev) => {
      const idx = prev.findIndex((s) => s.layerId === layerId);
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
    setDialogues((prev) => [...prev, newEntry]);
  }, [dialogues]);

  const updateDialogue = useCallback((id: string, updates: Partial<DialogueEntry>) => {
    setDialogues((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  }, []);

  const removeDialogue = useCallback((id: string) => {
    setDialogues((prev) => prev.filter((d) => d.id !== id));
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
      const finalAspectRatio = useCustomSize
        ? `${finalWidth}:${finalHeight}`
        : sizePreset.aspectRatio;

      (await import('../../../../services/modelRegistry')).getActiveVideoModel();
      const aspectRatioMap: Record<string, '16:9' | '9:16' | '1:1'> = {
        '16:9': '16:9',
        '9:16': '9:16',
        '1:1': '1:1',
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
        .filter((a) => a.description.trim())
        .sort((a, b) => a.startTime - b.startTime);
      if (validActions.length > 0) {
        promptParts.push('');
        promptParts.push('--- Timestamped action sequence ---');
        validActions.forEach((a) => {
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
        cameraPrompt = renderCameraChoreographyPrompt(
          cc,
          actionPrompt || globalPrompt || '',
          Math.round(durationMs / 1000),
        );
      } else {
        const cameraMove = CAMERA_MOVEMENTS.find((c) => c.id === selectedCamera);
        cameraPrompt =
          cameraMove && selectedCamera !== 'none'
            ? `Camera movement: ${cameraMove.promptEn} Intensity level ${cameraIntensity}/10, speed ${cameraSpeed}/100.`
            : '';
      }
      if (cameraPrompt) promptParts.push('\n' + cameraPrompt);

      // 光照
      const lightingPreset = LIGHTING_PRESETS.find((l) => l.id === selectedLighting);
      if (lightingPreset && selectedLighting !== 'none') {
        promptParts.push(
          `Lighting: ${lightingPreset.promptEn} Apply with intensity ${lightingIntensity}/100.`,
        );
      }

      // 图片序列
      promptParts.push('\n--- Image sequence description ---');
      imageSequence.forEach((s) => {
        const layer = imageLookup.get(s.layerId);
        const title = layer?.title || `Image ${s.order}`;
        promptParts.push(
          s.imagePrompt ? `[${title}] ${s.imagePrompt}` : `[${title}] No specific prompt.`,
        );
      });

      // 对白/旁白
      const dialogueSegments = dialogues
        .filter((d) => d.text.trim())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((d) => {
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
        .map((s) => imageLookup.get(s.layerId)?.src)
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
      let _resolvedUrl = videoUrl;
      let finalSrc = videoUrl;
      let videoId: string | undefined;

      if (videoUrl.startsWith('local:')) {
        const localId = videoUrl.replace('local:', '');
        videoId = localId;
        finalSrc = videoUrl;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) {
          _resolvedUrl = URL.createObjectURL(blob);
        }
      } else if (videoUrl.startsWith('video:')) {
        const localId = videoUrl.replace('video:', '');
        videoId = localId;
        finalSrc = videoUrl;
        const blob = await videoStorageService.getVideo(localId);
        if (blob) {
          _resolvedUrl = URL.createObjectURL(blob);
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
        imageSequence: imageSequence.map((s) => ({
          layerId: s.layerId,
          imagePrompt: s.imagePrompt,
        })),
        globalPrompt,
        subjectPrompt,
        actionPrompt,
        environmentPrompt,
        stylePrompt,
        negativePrompt,
        timestampActions: timestampActions.map((a) => ({ ...a })),
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
        ...(useChoreography
          ? {
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
            }
          : {}),
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
        sourceLayerIds: imageSequence.map((s) => s.layerId),
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
      logger.error(LogCategory.CANVAS, '视频生成失败:', error);
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

  const activePreviewLayer = activePreviewId ? (imageLookup.get(activePreviewId) ?? null) : null;

  const handleItemClick = useCallback((layerId: string) => {
    setActivePreviewId(layerId);
  }, []);

  const handleItemDoubleClick = useCallback(
    (layerId: string) => {
      const layer = imageLookup.get(layerId);
      if (layer?.src) {
        setLightboxImage({
          src: layer.src,
          title: layer.title,
          width: layer.width,
          height: layer.height,
        });
      }
    },
    [imageLookup],
  );

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
      .filter((a) => a.description.trim())
      .sort((a, b) => a.startTime - b.startTime);
    if (validActions.length > 0) {
      parts.push('');
      parts.push('--- 动作时间线 ---');
      validActions.forEach((a) => {
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

    const cameraMove = CAMERA_MOVEMENTS.find((c) => c.id === selectedCamera);
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

    const lightingPreset = LIGHTING_PRESETS.find((l) => l.id === selectedLighting);
    if (selectedLighting !== 'none' && lightingPreset) {
      parts.push(`[光照] ${lightingPreset.label} 强度${lightingIntensity}%`);
    }

    const dialogueTexts = dialogues
      .filter((d) => d.text.trim())
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((d) => {
        const timeStr = formatTime(d.timestamp);
        if (d.type === 'dialogue')
          return `[对白][${timeStr}] ${d.character || '角色'}: "${d.text}"`;
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
  }, [
    subjectPrompt,
    actionPrompt,
    environmentPrompt,
    stylePrompt,
    negativePrompt,
    timestampActions,
    imageSequence,
    imageLookup,
    selectedCamera,
    useChoreography,
    startShotSize,
    startAngle,
    startSubject,
    startFocus,
    movementPath,
    endShotSize,
    endAngle,
    endSubject,
    cameraIntensity,
    cameraSpeed,
    selectedLighting,
    lightingIntensity,
    LIGHTING_PRESETS,
    dialogues,
    globalPrompt,
  ]);

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
        2048,
      );
      setQualityReport(report || '分析完成，未发现问题。');
    } catch (error: any) {
      setQualityReport(`质检失败: ${error.message}`);
    } finally {
      setIsCheckingQuality(false);
    }
  }, [buildFullPromptPreview]);

  // ── 动作时间线操作 ──

  const addTimestampAction = useCallback(() => {
    const lastAction = timestampActions[timestampActions.length - 1];
    const start = lastAction ? lastAction.endTime : 0;
    const end = Math.min(start + 2000, durationMs);
    setTimestampActions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        startTime: start,
        endTime: end,
        description: '',
      },
    ]);
  }, [timestampActions, durationMs]);

  const updateTimestampAction = useCallback((id: string, updates: Partial<TimestampActionItem>) => {
    setTimestampActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  }, []);

  const removeTimestampAction = useCallback((id: string) => {
    setTimestampActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ── 视频模板 ──

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
  }, [
    subjectPrompt,
    actionPrompt,
    environmentPrompt,
    stylePrompt,
    negativePrompt,
    selectedCamera,
    cameraIntensity,
    cameraSpeed,
    selectedLighting,
    lightingIntensity,
    durationMs,
  ]);

  const [customTemplates, setCustomTemplates] = useState<TemplatePreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('video_templates') || '[]');
    } catch {
      return [];
    }
  });

  const deleteCustomTemplate = useCallback(
    (id: string) => {
      const updated = customTemplates.filter((t) => t.id !== id);
      setCustomTemplates(updated);
      localStorage.setItem('video_templates', JSON.stringify(updated));
    },
    [customTemplates],
  );

  const filteredTemplates = useMemo(() => {
    const presets =
      templateCategory === 'all'
        ? VIDEO_TEMPLATE_PRESETS
        : VIDEO_TEMPLATE_PRESETS.filter((t) => t.category === templateCategory);
    return [...presets, ...customTemplates];
  }, [templateCategory, customTemplates]);

  // ── 聚合下发状态（Phase 3 拆分：props 下发策略） ──
  const panel: GenerationPanelState = {
    selectedLayerIds,
    onClose,
    imageSequence,
    setImageSequence,
    showCanvasImagePicker,
    setShowCanvasImagePicker,
    imageLookup,
    canvasImageLayers,
    activePreviewId,
    setActivePreviewId,
    activePreviewLayer,
    previewCollapsed,
    setPreviewCollapsed,
    lightboxImage,
    setLightboxImage,
    addImageToSequence,
    removeImageFromSequence,
    updateImagePrompt,
    moveImage,
    handleItemClick,
    handleItemDoubleClick,
    activeTab,
    setActiveTab,
    globalPrompt,
    setGlobalPrompt,
    subjectPrompt,
    setSubjectPrompt,
    actionPrompt,
    setActionPrompt,
    environmentPrompt,
    setEnvironmentPrompt,
    stylePrompt,
    setStylePrompt,
    negativePrompt,
    setNegativePrompt,
    timestampActions,
    setTimestampActions,
    selectedTemplateId,
    setSelectedTemplateId,
    templateCategory,
    setTemplateCategory,
    selectedSizePreset,
    setSelectedSizePreset,
    customWidth,
    setCustomWidth,
    customHeight,
    setCustomHeight,
    useCustomSize,
    setUseCustomSize,
    durationMs,
    setDurationMs,
    durationInput,
    setDurationInput,
    durationInputRef,
    currentSize,
    handleDurationSlider,
    handleDurationInput,
    selectedCamera,
    setSelectedCamera,
    cameraIntensity,
    setCameraIntensity,
    cameraSpeed,
    setCameraSpeed,
    useChoreography,
    setUseChoreography,
    startShotSize,
    setStartShotSize,
    startAngle,
    setStartAngle,
    startSubject,
    setStartSubject,
    startFocus,
    setStartFocus,
    movementPath,
    setMovementPath,
    movementSpeed,
    setMovementSpeed,
    endShotSize,
    setEndShotSize,
    endAngle,
    setEndAngle,
    endSubject,
    setEndSubject,
    timingStartRatio,
    setTimingStartRatio,
    timingMoveRatio,
    setTimingMoveRatio,
    timingEndRatio,
    setTimingEndRatio,
    selectedLighting,
    setSelectedLighting,
    lightingIntensity,
    setLightingIntensity,
    dialogues,
    setDialogues,
    addDialogue,
    updateDialogue,
    removeDialogue,
    isCheckingQuality,
    qualityReport,
    setQualityReport,
    buildFullPromptPreview,
    handleQualityCheck,
    addTimestampAction,
    updateTimestampAction,
    removeTimestampAction,
    filteredTemplates,
    applyTemplate,
    saveCurrentAsTemplate,
    deleteCustomTemplate,
    customTemplates,
    isGenerating,
    progress,
    progressLabel,
    canGenerate,
    handleGenerate,
  };

  // ── 主渲染 ──────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
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
            <span className="text-xs text-gray-500">
              {imageSequence.length} 张图片 · {durationMs}ms
            </span>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex min-h-0">
          {/* 左侧：图片序列 */}
          <div className="w-[340px] flex-shrink-0 border-r border-gray-700/50 flex flex-col">
            <ImageSequencePanel panel={panel} />
          </div>

          {/* 右侧：配置标签页 */}
          <div className="flex-1 flex flex-col min-w-0">
            <TabBar panel={panel} />
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'prompt' && <PromptTab panel={panel} />}
              {activeTab === 'actions' && <ActionsTab panel={panel} />}
              {activeTab === 'templates' && <TemplatesTab panel={panel} />}
              {activeTab === 'settings' && <SettingsTab panel={panel} />}
              {activeTab === 'camera' && <CameraTab panel={panel} />}
              {activeTab === 'lighting' && <LightingTab panel={panel} />}
              {activeTab === 'dialogue' && <DialogueTab panel={panel} />}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>
              总时长: <span className="text-gray-300 font-mono">{durationInput}s</span>
            </span>
            <span className="text-gray-700">|</span>
            <span>
              尺寸:{' '}
              <span className="text-gray-300">
                {currentSize.width}×{currentSize.height}
              </span>
            </span>
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
