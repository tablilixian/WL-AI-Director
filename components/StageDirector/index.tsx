import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Sparkles,
  Loader2,
  AlertCircle,
  Edit2,
  Film,
  Video as VideoIcon,
} from 'lucide-react';
import {
  ProjectState,
  Shot,
  AspectRatio,
  VideoDuration,
  NineGridPanel,
  VideoGenerationMode,
  TimedKeyframe,
} from '../../types';
import { logger, LogCategory } from '../../services/logger';
import {
  generateImage,
  generateInpaintImage,
  generateVideo,
  generateActionSuggestion,
  generateVisualLanguage,
  optimizeKeyframePrompt,
  optimizeBothKeyframes,
  splitShotIntoSubShots,
  generateNineGridPanels,
  generateNineGridImage,
  getActiveChatModel,
  getDefaultChatModelId,
  chatCompletion,
  videoOrchestrator,
} from '../../services/aiService';
import {
  getRefImagesForShot,
  getPropsInfoForShot,
  buildKeyframePrompt,
  buildKeyframePromptWithAI,
  buildVideoPrompt,
  extractBasePrompt,
  generateId,
  delay,
  convertImageToBase64,
  createKeyframe,
  updateKeyframeInShot,
  generateSubShotIds,
  createSubShot,
  replaceShotWithSubShots,
  buildPromptFromNineGridPanel,
  cropPanelFromNineGrid,
  shouldUseIPAFusion,
  appendStyleAnchor,
  getSceneImageForShot,
  generateKeyframeComposite,
  buildIPAKeyframeRequest,
} from './utils';
import { unifiedImageService } from '../../services/unifiedImageService';
import { DEFAULTS, CAMERA_MOVEMENT_TYPES } from './constants';
import EditModal from './EditModal';
import CameraChoreographyModal from './CameraChoreographyModal';
import ShotCard from './ShotCard';
import ShotWorkbench from './ShotWorkbench';
import ImagePreviewModal from './ImagePreviewModal';
import NineGridPreview from './NineGridPreview';
import { useAlert } from '../GlobalAlert';
import { AspectRatioSelector } from '../AspectRatioSelector';
import { getUserAspectRatio, getModelById } from '../../services/modelRegistry';
import { saveProject as saveProjectToCloud } from '../../services/hybridStorageService';
import { presetManager } from '../../services/videoPresetManager';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState> | ((prev: ProjectState) => ProjectState)) => void;
  onApiKeyError?: (error: unknown) => boolean;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

const StageDirector: React.FC<Props> = ({
  project,
  updateProject,
  onApiKeyError,
  onGeneratingChange,
}) => {
  const { showAlert } = useAlert();
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [vlmData, setVlmData] = useState<{ start: string; end: string } | null>(null);
  const [isVlmLoading, setIsVlmLoading] = useState(false);
  const [useAIEnhancement, setUseAIEnhancement] = useState(false); // 是否使用AI增强提示词
  const [isSplittingShot, setIsSplittingShot] = useState(false); // 是否正在拆分镜头
  const [showNineGrid, setShowNineGrid] = useState(false); // 是否显示九宫格预览弹窗
  const [toastMessage, setToastMessage] = useState('');
  const [generationProgress, setGenerationProgress] = useState<{
    percent: number;
    message: string;
  } | null>(null);
  // 关键帧两阶段合成的实时阶段文案：key = `${shotId}:${type}`，
  // 用于在关键帧面板的加载区就地展示进度，替代原先需要点击关闭的模态弹窗。
  const [keyframeStageMessages, setKeyframeStageMessages] = useState<Record<string, string>>({});
  // IPA 关键帧验证开关：开启后，有角色的镜头改走 image2ipastyletransfer
  // （image1=场景 / image2=角色1三视图 / image3=角色2三视图 / ref_image=场景），
  // 用于验证 IPA 多参考融合能否压制风格漂移。默认关闭，关键帧默认仍走方案 B（composite）。
  const [keyframeIPAVerify, setKeyframeIPAVerify] = useState(false);

  // 关键帧生成使用的横竖屏比例（优先读取工程级配置，向后兼容全局）
  const [keyframeAspectRatio, setKeyframeAspectRatioState] = useState<AspectRatio>(
    () => project.aspectRatio ?? getUserAspectRatio(),
  );

  // 同步工程外的 aspectRatio 变更
  useEffect(() => {
    if (project.aspectRatio && project.aspectRatio !== keyframeAspectRatio) {
      setKeyframeAspectRatioState(project.aspectRatio);
    }
  }, [project.aspectRatio]);

  // 包装 setKeyframeAspectRatio，持久化到工程数据
  const setKeyframeAspectRatio = (ratio: AspectRatio) => {
    setKeyframeAspectRatioState(ratio);
    updateProject({ aspectRatio: ratio });
  };

  // 统一的编辑状态
  const [editModal, setEditModal] = useState<{
    type: 'action' | 'keyframe' | 'video';
    value: string;
    shotId?: string;
    frameType?: 'start' | 'end';
    startImageUrl?: string;
    endImageUrl?: string;
    startPrompt?: string;
    endPrompt?: string;
  } | null>(null);

  // 运镜编排弹窗
  const [showChoreographyModal, setShowChoreographyModal] = useState(false);

  const activeShotIndex = project.shots.findIndex((s) => s.id === activeShotId);
  const activeShot = project.shots[activeShotIndex];

  const allStartFramesGenerated =
    project.shots.length > 0 &&
    project.shots.every((s) => s.keyframes?.find((k) => k.type === 'start')?.imageUrl);

  /**
   * 组件加载时，检测并重置卡住的生成状态
   * 解决关闭系统后重新打开时，状态仍为"generating"导致无法重新生成的问题
   */
  useEffect(() => {
    const hasStuckGenerating = project.shots.some((shot) => {
      const stuckKeyframes = shot.keyframes?.some(
        (kf) => kf.status === 'generating' && !kf.imageUrl,
      );
      const stuckVideo = shot.interval?.status === 'generating' && !shot.interval?.videoUrl;
      const stuckNineGrid =
        (shot.nineGrid?.status === 'generating_panels' ||
          shot.nineGrid?.status === 'generating_image' ||
          (shot.nineGrid?.status as string) === 'generating') &&
        !shot.nineGrid?.imageUrl;
      return stuckKeyframes || stuckVideo || stuckNineGrid;
    });

    if (hasStuckGenerating) {
      logger.debug(LogCategory.AI, '🔧 检测到卡住的生成状态，正在重置...');
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map((shot) => ({
          ...shot,
          keyframes: shot.keyframes?.map((kf) =>
            kf.status === 'generating' && !kf.imageUrl ? { ...kf, status: 'failed' as const } : kf,
          ),
          interval:
            shot.interval && shot.interval.status === 'generating' && !shot.interval.videoUrl
              ? { ...shot.interval, status: 'failed' as const }
              : shot.interval,
          nineGrid:
            shot.nineGrid &&
            (shot.nineGrid.status === 'generating_panels' ||
              shot.nineGrid.status === 'generating_image' ||
              (shot.nineGrid.status as string) === 'generating') &&
            !shot.nineGrid.imageUrl
              ? { ...shot.nineGrid, status: 'failed' as const }
              : shot.nineGrid,
        })),
      }));
    }
  }, [project.id]); // 仅在项目ID变化时运行，避免重复执行

  /**
   * 上报生成状态给父组件，用于导航锁定
   * 检测所有可能的生成中状态：批量生成、单个关键帧、视频、九宫格、镜头拆分
   */
  useEffect(() => {
    const hasGeneratingKeyframes = project.shots.some((shot) =>
      shot.keyframes?.some((kf) => kf.status === 'generating'),
    );
    const hasGeneratingVideo = project.shots.some((shot) => shot.interval?.status === 'generating');
    const hasGeneratingNineGrid = project.shots.some(
      (shot) =>
        shot.nineGrid?.status === 'generating_panels' ||
        shot.nineGrid?.status === 'generating_image',
    );

    const generating =
      !!batchProgress ||
      hasGeneratingKeyframes ||
      hasGeneratingVideo ||
      hasGeneratingNineGrid ||
      isSplittingShot;
    onGeneratingChange?.(generating);
  }, [batchProgress, project.shots, isSplittingShot]);

  // 组件卸载时重置生成状态
  useEffect(() => {
    return () => {
      onGeneratingChange?.(false);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timerId = setTimeout(() => setToastMessage(''), 1500);
    return () => clearTimeout(timerId);
  }, [toastMessage]);

  /**
   * 更新镜头
   */
  const updateShot = (shotId: string, transform: (s: Shot) => Shot) => {
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map((s) => (s.id === shotId ? transform(s) : s)),
    }));
  };

  /**
   * 删除分镜
   */
  const handleDeleteShot = (shotId: string) => {
    const shot = project.shots.find((s) => s.id === shotId);
    if (!shot) return;

    const shotIndex = project.shots.findIndex((s) => s.id === shotId);
    const displayName = `SHOT ${String(shotIndex + 1).padStart(3, '0')}`;

    showAlert(`确定要删除 ${displayName} 吗？此操作不可撤销。`, {
      type: 'warning',
      showCancel: true,
      onConfirm: () => {
        // 如果当前选中的就是被删除的分镜，则关闭工作台
        if (activeShotId === shotId) {
          setActiveShotId(null);
        }
        updateProject((prevProject: ProjectState) => ({
          ...prevProject,
          shots: prevProject.shots.filter((s) => s.id !== shotId),
        }));
        showAlert(`${displayName} 已删除`, { type: 'success' });
      },
    });
  };

  /**
   * 生成关键帧
   */
  const handleGenerateKeyframe = async (shot: Shot, type: 'start' | 'end') => {
    const existingKf = shot.keyframes?.find((k) => k.type === type);
    const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);

    // 如果用户已手动锁定提示词，跳过AI覆盖
    if (existingKf?.visualPromptSource === 'manual') {
      showAlert('此镜头的提示词已被用户锁定，如需重新生成请先解锁', { type: 'warning' });
      return;
    }

    const basePrompt = existingKf?.visualPrompt
      ? extractBasePrompt(existingKf.visualPrompt, shot.actionSummary)
      : shot.actionSummary;

    const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';
    logger.info(LogCategory.AI, '🎯 [handleGenerateKeyframe] project.visualStyle:', [
      project.visualStyle,
      'scriptData.visualStyle:',
      project.scriptData?.visualStyle,
      '→ resolved:',
      visualStyle,
    ]);

    // 立即设置生成状态，显示loading
    updateProject((prevProject: ProjectState) => ({
      ...prevProject,
      shots: prevProject.shots.map((s) => {
        if (s.id !== shot.id) return s;
        return updateKeyframeInShot(
          s,
          type,
          createKeyframe(kfId, type, basePrompt, undefined, 'generating'),
        );
      }),
    }));

    // 获取道具信息用于提示词注入
    const propsInfo = getPropsInfoForShot(shot, project.scriptData);

    // 构建角色外观描述（作为参考图的文字回退）
    const characterDescriptions = (shot.characters || [])
      .map((charId) => {
        const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
        if (!char) return null;
        return {
          name: char.name,
          visualPrompt: char.visualPrompt || '',
          hasImage: !!char.imageUrl || !!char.threeViewImageUrl,
        };
      })
      .filter(Boolean) as { name: string; visualPrompt: string; hasImage: boolean }[];

    // 根据开关选择是否使用AI增强
    let prompt: string;
    const guideModel = getActiveChatModel()?.id || getDefaultChatModelId();
    if (useAIEnhancement) {
      try {
        prompt = await buildKeyframePromptWithAI(
          basePrompt,
          visualStyle,
          shot.cameraMovement,
          type,
          true,
          propsInfo,
          characterDescriptions,
          project.eraContext,
          project.knowledgeBase,
        );
      } catch (error) {
        logger.error(LogCategory.AI, 'AI增强失败,使用基础提示词:', error);
        prompt = await buildKeyframePrompt(
          basePrompt,
          visualStyle,
          shot.cameraMovement,
          type,
          propsInfo,
          chatCompletion,
          guideModel,
          characterDescriptions,
          project.eraContext,
          project.knowledgeBase,
        );
      }
    } else {
      prompt = await buildKeyframePrompt(
        basePrompt,
        visualStyle,
        shot.cameraMovement,
        type,
        propsInfo,
        chatCompletion,
        guideModel,
        characterDescriptions,
        project.eraContext,
        project.knowledgeBase,
      );
    }

    try {
      const refResult = getRefImagesForShot(shot, project.scriptData);
      // 组合镜头涉及角色的 negativePrompt
      const shotNegativePrompts: string[] = [];
      (shot.characters || []).forEach((charId) => {
        const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
        if (char?.negativePrompt) shotNegativePrompts.push(char.negativePrompt);
      });
      const combinedNegativePrompt =
        shotNegativePrompts.length > 0 ? shotNegativePrompts.join('\n') : undefined;

      // 后台确认：当前 Drama Backend 图像模型不支持 negative_prompt。
      // 临时置 false 不向下传递负面提示词，验证是否会改善生成效果；
      // 若后台后续支持，改回 true 即可恢复。
      const ENABLE_NEGATIVE_PROMPT = false;
      const effectiveNegativePrompt = ENABLE_NEGATIVE_PROMPT ? combinedNegativePrompt : undefined;

      // 有角色关联时，走方案 B：把角色合成进场景。
      // 背景：IPA 多参考融合会把参考图（定妆照/场景）的风格一起学，在当前参考图质量下
      // 无法产出真人电影感（已实测两次漂移）。
      // 正确做法：用户已经生成好场景图与角色图，直接复用已有场景图作为底图，
      // 再逐个用 inpaint 把角色补绘进去（仅当完全没有场景图时才兜底生成空场景）。
      // 这样不会重复生成场景、也不会改掉用户看中的场景效果。
      const hasCharacters = (shot.characters?.length ?? 0) > 0;
      let url: string;

      if (hasCharacters && keyframeIPAVerify) {
        // IPA 验证模式：image2ipastyletransfer
        //   image1 = 场景概念图
        //   image2 = 角色1 三视图（无三视图时回退定妆照）
        //   image3 = 角色2 三视图（无三视图时回退定妆照）
        //   ref_image = 场景概念图（风格参考）
        // 用于验证 IPA 多参考融合能否压制风格漂移（此前两次实测漂移已回退，本次用对字段重测）。
        const sceneImage = getSceneImageForShot(shot, project.scriptData);
        if (!sceneImage) {
          showAlert('IPA 验证需要先生成场景概念图', { type: 'error' });
          return;
        }
        const characterRefs = (shot.characters || []).map((cid) => {
          const c = project.scriptData?.characters.find((x) => String(x.id) === String(cid));
          return {
            name: c?.name || String(cid),
            threeViewImageUrl: c?.threeViewImageUrl,
            imageUrl: c?.imageUrl,
          };
        });
        const ipaReq = buildIPAKeyframeRequest({
          basePrompt: prompt,
          sceneImage,
          characterRefs,
          negativePrompt: effectiveNegativePrompt,
          aspectRatio: keyframeAspectRatio,
          visualStyle,
          shotId: shot.id,
        });
        url = await generateImage(
          ipaReq.prompt,
          ipaReq.referenceImages,
          ipaReq.aspectRatio,
          false,
          false,
          ipaReq.resourceType,
          ipaReq.resourceId,
          ipaReq.negativePrompt,
          true, // useIPA
          ipaReq.refImage, // refImage
        );
      } else if (hasCharacters) {
        const sceneImage = getSceneImageForShot(shot, project.scriptData);
        url = await generateKeyframeComposite({
          basePrompt,
          visualStyle,
          cameraMovement: shot.cameraMovement,
          frameType: type,
          sceneImage,
          characterDescriptions,
          propsInfo,
          eraContext: project.eraContext,
          knowledgeBase: project.knowledgeBase,
          negativePrompt: effectiveNegativePrompt,
          deps: {
            // 阶段1：空场景底图（仅用场景参考图，不用角色图，避免风格污染）
            generateScene: (p, refs, np) =>
              generateImage(
                p,
                refs,
                keyframeAspectRatio,
                false,
                false,
                'keyframe',
                shot.id,
                np,
                false,
              ),
            // 阶段2：逐个把角色 inpaint 进底图
            inpaint: (img, p) => generateInpaintImage(img, p, 'keyframe', shot.id),
            // 阶段进度就地展示在关键帧面板加载区，不再弹需要点击的模态
            onStage: (s) =>
              setKeyframeStageMessages((prev) => ({
                ...prev,
                [`${shot.id}:${type}`]: s,
              })),
          },
        });
      } else {
        // 无角色镜头：沿用原有单图路径（image2image / txt2image，必要时 IPA）
        const useIPAFusion = shouldUseIPAFusion(
          refResult.images.length,
          shot.characters?.length ?? 0,
        );

        // IPA 多参考融合场景：参考图可能携带非写实风格信号，
        // 在 prompt 末尾防御性追加真人电影风格锁定段，对抗风格漂移。
        if (useIPAFusion) {
          prompt = appendStyleAnchor(prompt, visualStyle);
        }

        url = await generateImage(
          prompt,
          refResult.images,
          keyframeAspectRatio,
          false,
          refResult.hasTurnaround,
          'keyframe',
          shot.id,
          effectiveNegativePrompt,
          useIPAFusion,
        );
      }

      // 使用函数式更新，避免闭包问题
      updateProject((prevProject: ProjectState) => {
        const updatedProject = {
          ...prevProject,
          shots: prevProject.shots.map((s) => {
            if (s.id !== shot.id) return s;
            return updateKeyframeInShot(
              s,
              type,
              createKeyframe(kfId, type, basePrompt, url, 'completed'),
            );
          }),
        };

        // 立即保存到云端
        saveProjectToCloud(updatedProject)
          .then(() => {
            logger.debug(LogCategory.AI, `✅ 关键帧生成完成 (${type})，已保存到云端`);
          })
          .catch((error) => {
            logger.error(LogCategory.AI, '❌ 保存关键帧失败:', error);
          });

        return updatedProject;
      });

      // 生成成功后关闭图片预览 Modal
      setPreviewImage(null);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, errorMessage, e);
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: prevProject.shots.map((s) => {
          if (s.id !== shot.id) return s;
          return updateKeyframeInShot(
            s,
            type,
            createKeyframe(kfId, type, basePrompt, undefined, 'failed'),
          );
        }),
      }));

      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`生成失败: ${errorMessage}`, { type: 'error' });
    } finally {
      // 生成结束（成功/失败）后清除该关键帧的阶段进度文案，避免残留
      setKeyframeStageMessages((prev) => {
        const next = { ...prev };
        delete next[`${shot.id}:${type}`];
        return next;
      });
    }
  };

  /**
   * 上传关键帧图片
   */
  const handleUploadKeyframeImage = async (shot: Shot, type: 'start' | 'end') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showAlert('请选择图片文件！', { type: 'warning' });
        return;
      }

      try {
        const base64Url = await convertImageToBase64(file);
        const existingKf = shot.keyframes?.find((k) => k.type === type);
        const kfId = existingKf?.id || generateId(`kf-${shot.id}-${type}`);

        const updatedProject = {
          ...project,
          shots: project.shots.map((s) => {
            if (s.id !== shot.id) return s;
            const visualPrompt = existingKf?.visualPrompt || shot.actionSummary;
            return updateKeyframeInShot(
              s,
              type,
              createKeyframe(kfId, type, visualPrompt, base64Url, 'completed'),
            );
          }),
        };

        updateProject(updatedProject);

        // 立即保存到云端
        try {
          await saveProjectToCloud(updatedProject);
          logger.info(LogCategory.AI, `✅ 关键帧上传完成 (${type})，已保存到云端`);
        } catch (error) {
          logger.error(LogCategory.AI, '❌ 保存关键帧失败:', error);
        }
      } catch {
        showAlert('读取文件失败！', { type: 'error' });
      }
    };

    input.click();
  };

  /**
   * 生成视频
   * @param shot - 镜头数据
   * @param aspectRatio - 横竖屏比例
   * @param duration - 视频时长（仅异步模型有效）
   * @param modelId - 视频模型 ID
   */
  const handleGenerateVideo = async (
    shot: Shot,
    aspectRatio: AspectRatio = '16:9',
    duration: VideoDuration = 10,
    modelId?: string,
  ) => {
    const sKf = shot.keyframes?.find((k) => k.type === 'start');
    const eKf = shot.keyframes?.find((k) => k.type === 'end');

    // 使用传入的 modelId 或默认模型
    let selectedModel: string = modelId || shot.videoModel || DEFAULTS.videoModel;
    // 规范化模型名称：旧模型名 -> 'veo'
    if (
      selectedModel === 'veo_3_1' ||
      selectedModel.startsWith('veo_3_1_') ||
      selectedModel === 'veo-r2v' ||
      selectedModel.startsWith('veo_3_0_r2v')
    ) {
      selectedModel = 'veo';
    }

    // 必须有起始帧
    if (!sKf?.imageUrl) {
      return showAlert('请先生成起始帧！', { type: 'warning' });
    }

    const projectLanguage = project.language || project.scriptData?.language || '中文';

    // 检测是否为九宫格分镜模式：首帧图片就是九宫格整图时触发
    const isNineGridMode =
      shot.nineGrid?.status === 'completed' &&
      shot.nineGrid?.imageUrl &&
      sKf?.imageUrl === shot.nineGrid.imageUrl;

    // 用户手动编辑过提示词则优先使用，否则动态构建
    const videoPrompt =
      shot.interval?.videoPrompt ||
      buildVideoPrompt(
        shot.actionSummary,
        shot.cameraMovement,
        selectedModel,
        projectLanguage,
        isNineGridMode ? shot.nineGrid : undefined,
        duration,
        shot.cameraChoreography,
        project.eraContext,
        project.knowledgeBase,
      );

    const intervalId = shot.interval?.id || generateId(`int-${shot.id}`);

    // 更新 shot 的 videoModel
    updateShot(shot.id, (s) => ({
      ...s,
      videoModel: selectedModel,
      interval: s.interval
        ? { ...s.interval, status: 'generating', videoPrompt }
        : {
            id: intervalId,
            startKeyframeId: sKf?.id || '',
            endKeyframeId: eKf?.id || '',
            duration: duration,
            motionStrength: 5,
            videoPrompt,
            status: 'generating',
          },
    }));

    try {
      const startImageBase64 = await unifiedImageService.resolveForApi(sKf?.imageUrl);
      const endImageBase64 = await unifiedImageService.resolveForApi(eKf?.imageUrl);

      const videoBase64 = await generateVideo(
        videoPrompt,
        startImageBase64,
        endImageBase64,
        selectedModel,
        aspectRatio,
        duration,
      );

      const videoUrl = await unifiedImageService.saveVideoToLocal(videoBase64);

      const updatedProject: ProjectState = {
        ...project,
        shots: project.shots.map((s) => {
          if (s.id !== shot.id) return s;
          return {
            ...s,
            interval: s.interval
              ? { ...s.interval, videoUrl, status: 'completed' }
              : {
                  id: intervalId,
                  startKeyframeId: sKf?.id || '',
                  endKeyframeId: eKf?.id || '',
                  duration,
                  motionStrength: 5,
                  videoPrompt,
                  videoUrl,
                  status: 'completed',
                },
          };
        }),
      };

      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval
          ? { ...s.interval, videoUrl, status: 'completed' }
          : {
              id: intervalId,
              startKeyframeId: sKf?.id || '',
              endKeyframeId: eKf?.id || '',
              duration,
              motionStrength: 5,
              videoPrompt,
              videoUrl,
              status: 'completed',
            },
      }));

      // 立即保存到云端
      try {
        await saveProjectToCloud(updatedProject);
        logger.info(LogCategory.AI, `✅ 视频生成完成，已保存到云端`);
      } catch (error) {
        logger.error(LogCategory.AI, '❌ 保存视频失败:', error);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, '', e);
      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, status: 'failed' } : undefined,
      }));

      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`视频生成失败: ${errorMessage}`, { type: 'error' });
    }
  };

  /**
   * 高级视频生成入口 — 通过 VideoGenerationOrchestrator 统一调度
   * 1. 解析图片为 base64，构建统一请求
   * 2. 写入 shot.interval + 状态
   * 3. 交给 orchestrator 统一执行 + 进度 + 重试
   * 4. 更新结果
   */
  const handleAdvancedGenerateVideo = async (
    shot: Shot,
    params: {
      mode: VideoGenerationMode;
      fps: number;
      width: number;
      height: number;
      timedKeyframes: TimedKeyframe[];
      backgroundImage?: string;
      gridType?: number;
      frameIndexes?: number[];
      aspectRatio: AspectRatio;
      duration: VideoDuration;
      modelId: string;
    },
  ) => {
    const sKf = shot.keyframes?.find((k) => k.type === 'start');
    const eKf = shot.keyframes?.find((k) => k.type === 'end');
    const intervalId = shot.interval?.id || generateId(`int-${shot.id}`);

    if (!sKf?.imageUrl) {
      return showAlert('请先生成起始帧！', { type: 'warning' });
    }

    const projectLanguage = project.language || project.scriptData?.language || '中文';
    const isGridMode = params.mode === 'mkr-grid';
    const gridPromptData = isGridMode
      ? shot.fourGrid?.status === 'completed'
        ? undefined
        : shot.nineGrid
      : undefined;
    // 用户手动编辑过提示词则优先使用，否则动态构建
    const videoPrompt =
      shot.interval?.videoPrompt ||
      buildVideoPrompt(
        shot.actionSummary,
        shot.cameraMovement,
        params.modelId,
        projectLanguage,
        gridPromptData,
        params.duration,
        shot.cameraChoreography,
        project.eraContext,
        project.knowledgeBase,
      );

    // 写回 shot.interval（含高级参数）
    updateShot(shot.id, (s) => ({
      ...s,
      videoModel: params.modelId,
      interval: {
        id: intervalId,
        startKeyframeId: sKf?.id || '',
        endKeyframeId: eKf?.id || '',
        duration: params.duration,
        motionStrength: 5,
        videoPrompt,
        status: 'generating',
        mode: params.mode,
        fps: params.fps,
        width: params.width,
        height: params.height,
        backgroundImage: params.backgroundImage,
        timedKeyframes: params.timedKeyframes,
        gridType: params.gridType,
        frameIndexes: params.frameIndexes,
      },
    }));

    try {
      // 按模式解析图片 base64，构建统一请求
      let orchRequest: Parameters<typeof videoOrchestrator.generate>[0];

      switch (params.mode) {
        case 'msr': {
          const startImageBase64 = await unifiedImageService.resolveForApi(sKf?.imageUrl);
          const endImageBase64 = eKf?.imageUrl
            ? await unifiedImageService.resolveForApi(eKf.imageUrl)
            : '';
          // background = 当前分镜的场景概念图
          const scene = project.scriptData?.scenes.find(
            (s) => String(s.id) === String(shot.sceneId),
          );
          const bg = scene?.imageUrl ? await unifiedImageService.resolveForApi(scene.imageUrl) : '';
          const refImages = [startImageBase64];
          if (endImageBase64) refImages.push(endImageBase64);
          orchRequest = {
            mode: 'msr',
            prompt: videoPrompt,
            referenceImages: refImages,
            backgroundImage: bg,
            modelId: params.modelId,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            width: params.width,
            height: params.height,
            fps: params.fps,
          };
          break;
        }
        case 'mkr': {
          const timedImages: { image: string; frame_index: number }[] = [];
          const addedKeyframeIds = new Set<string>();

          const addKf = async (kfId: string | undefined, pos: number) => {
            if (!kfId || addedKeyframeIds.has(kfId)) return;
            const kf = shot.keyframes?.find((k) => k.id === kfId);
            if (!kf?.imageUrl) return;
            addedKeyframeIds.add(kfId);
            timedImages.push({
              image: await unifiedImageService.resolveForApi(kf.imageUrl),
              frame_index: pos,
            });
          };

          // 首帧 (position 0%) + 尾帧 (position 100%) 始终传入
          await addKf(shot.interval?.startKeyframeId, 0);
          await addKf(shot.interval?.endKeyframeId, 100);
          // 用户配置的中间帧（自动跳过已传的首尾帧）
          for (const tk of params.timedKeyframes || []) {
            await addKf(tk.keyframeId, tk.positionPercent);
          }
          orchRequest = {
            mode: 'mkr',
            prompt: videoPrompt,
            timedImages,
            modelId: params.modelId,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            width: params.width,
            height: params.height,
            fps: params.fps,
          };
          break;
        }
        case 'mkr-grid': {
          const gridImageUrl =
            shot.fourGrid?.status === 'completed' && shot.fourGrid?.imageUrl
              ? shot.fourGrid.imageUrl
              : shot.nineGrid?.imageUrl;
          if (!gridImageUrl) {
            throw new Error('网格分镜图尚未生成，请先完成推演或生成九宫格');
          }
          const refImage = await unifiedImageService.resolveForApi(gridImageUrl);
          orchRequest = {
            mode: 'mkr-grid',
            prompt: videoPrompt,
            refImage,
            gridType: params.gridType || shot.interval?.gridType || 4,
            frameIndexes: params.frameIndexes || shot.interval?.frameIndexes || [0, 0, 0, 0],
            modelId: params.modelId,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            width: params.width,
            height: params.height,
            fps: params.fps,
          };
          break;
        }
        case 'basic':
        default: {
          const startImageBase64 = await unifiedImageService.resolveForApi(sKf?.imageUrl);
          const endImageBase64 = eKf?.imageUrl
            ? await unifiedImageService.resolveForApi(eKf.imageUrl)
            : '';
          orchRequest = {
            mode: 'basic',
            prompt: videoPrompt,
            startImage: startImageBase64,
            endImage: endImageBase64,
            modelId: params.modelId,
            aspectRatio: params.aspectRatio,
            duration: params.duration,
            width: params.width,
            height: params.height,
            fps: params.fps,
          };
          break;
        }
      }

      // 统一调度
      const result = await videoOrchestrator.generate(orchRequest, (progress) => {
        setGenerationProgress({ percent: progress.percent, message: progress.message });
        logger.debug(
          LogCategory.AI,
          `🎬 Orchestrator 进度: ${progress.percent}% — ${progress.message}`,
        );
      });

      // 转为本地引用（避免 base64 嵌入 JSON 导致导出体积过大）
      const localVideoUrl = await unifiedImageService.saveVideoToLocal(result.videoUrl);

      const updatedProject: ProjectState = {
        ...project,
        shots: project.shots.map((s) => {
          if (s.id !== shot.id) return s;
          return {
            ...s,
            interval: s.interval
              ? {
                  ...s.interval,
                  videoUrl: localVideoUrl,
                  status: 'completed',
                }
              : undefined,
          };
        }),
      };

      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval
          ? {
              ...s.interval,
              videoUrl: localVideoUrl,
              status: 'completed',
            }
          : undefined,
      }));

      setGenerationProgress(null);

      try {
        await saveProjectToCloud(updatedProject);
      } catch (error) {
        logger.error(LogCategory.AI, '❌ 保存视频失败:', error);
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setGenerationProgress(null);
      logger.error(LogCategory.AI, '', e);
      updateShot(shot.id, (s) => ({
        ...s,
        interval: s.interval ? { ...s.interval, status: 'failed' } : undefined,
      }));
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`高级视频生成失败: ${errorMessage}`, { type: 'error' });
    }
  };

  /**
   * 复制上一镜头的结束帧
   */
  const handleCopyPreviousEndFrame = () => {
    if (activeShotIndex === 0 || !activeShot) return;

    const previousShot = project.shots[activeShotIndex - 1];
    const previousEndKf = previousShot?.keyframes?.find((k) => k.type === 'end');

    if (!previousEndKf?.imageUrl) {
      showAlert('上一个镜头还没有生成结束帧', { type: 'warning' });
      return;
    }

    const existingStartKf = activeShot.keyframes?.find((k) => k.type === 'start');
    const newStartKfId = existingStartKf?.id || generateId(`kf-${activeShot.id}-start`);

    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s,
        'start',
        createKeyframe(
          newStartKfId,
          'start',
          previousEndKf.visualPrompt,
          previousEndKf.imageUrl,
          'completed',
        ),
      );
    });
  };

  /**
   * 复制下一镜头的起始帧到当前镜头的结束帧
   */
  const handleCopyNextStartFrame = () => {
    if (activeShotIndex >= project.shots.length - 1 || !activeShot) return;

    const nextShot = project.shots[activeShotIndex + 1];
    const nextStartKf = nextShot?.keyframes?.find((k) => k.type === 'start');

    if (!nextStartKf?.imageUrl) {
      showAlert('下一个镜头还没有生成起始帧', { type: 'warning' });
      return;
    }

    const existingEndKf = activeShot.keyframes?.find((k) => k.type === 'end');
    const newEndKfId = existingEndKf?.id || generateId(`kf-${activeShot.id}-end`);

    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s,
        'end',
        createKeyframe(
          newEndKfId,
          'end',
          nextStartKf.visualPrompt,
          nextStartKf.imageUrl,
          'completed',
        ),
      );
    });
  };

  /**
   * 预设系统：保存当前高级面板参数为预设
   */
  const handleSavePreset = (name: string, description?: string) => {
    if (!activeShot) return;
    const interval = activeShot.interval;
    const preset = presetManager.createPreset({
      name,
      description,
      params: {
        mode: interval?.mode || 'basic',
        fps: interval?.fps || 30,
        width: interval?.width || 1920,
        height: interval?.height || 1080,
        duration: (interval?.duration as VideoDuration) || 10,
        modelId: activeShot.videoModel || DEFAULTS.videoModel,
        aspectRatio: (project.aspectRatio || '16:9') as AspectRatio,
        backgroundImage: interval?.backgroundImage,
        timedKeyframes: interval?.timedKeyframes,
      },
    });
    const updatedProject = presetManager.savePreset(project, preset);
    updateProject(updatedProject);
    setToastMessage(`预设「${name}」已保存`);
  };

  /**
   * 预设系统：应用预设到当前镜头
   */
  const handleApplyPreset = (presetId: string) => {
    const preset = project.videoPresets?.find((p) => p.id === presetId);
    if (!preset || !activeShot) return;
    const migrated = presetManager.loadPreset(preset);
    updateShot(activeShot.id, (s) => ({
      ...s,
      videoModel: migrated.params.modelId,
      interval: s.interval
        ? {
            ...s.interval,
            mode: migrated.params.mode,
            fps: migrated.params.fps,
            width: migrated.params.width,
            height: migrated.params.height,
            backgroundImage: migrated.params.backgroundImage,
            timedKeyframes: migrated.params.timedKeyframes,
          }
        : undefined,
    }));
    setToastMessage(`已应用预设「${migrated.name}」`);
  };

  /**
   * 预设系统：删除预设
   */
  const handleDeletePreset = (presetId: string) => {
    const updatedProject = presetManager.deletePreset(project, presetId);
    updateProject(updatedProject);
  };

  /**
   * 批量生成关键帧
   */
  const handleBatchGenerateImages = async () => {
    const isRegenerate = allStartFramesGenerated;

    let shotsToProcess = [];
    if (isRegenerate) {
      showAlert('确定要重新生成所有镜头的首帧吗？这将覆盖现有图片。', {
        type: 'warning',
        showCancel: true,
        onConfirm: async () => {
          shotsToProcess = [...project.shots];
          await executeBatchGenerate(shotsToProcess, isRegenerate);
        },
      });
      return;
    } else {
      shotsToProcess = project.shots.filter(
        (s) => !s.keyframes?.find((k) => k.type === 'start')?.imageUrl,
      );
    }

    if (shotsToProcess.length === 0) return;
    await executeBatchGenerate(shotsToProcess, isRegenerate);
  };

  const executeBatchGenerate = async (shotsToProcess: Shot[], isRegenerate: boolean) => {
    setBatchProgress({
      current: 0,
      total: shotsToProcess.length,
      message: isRegenerate ? '正在重新生成所有首帧...' : '正在批量生成缺失的首帧...',
    });

    for (let i = 0; i < shotsToProcess.length; i++) {
      if (i > 0) await delay(DEFAULTS.batchGenerateDelay);

      const shot = shotsToProcess[i];
      setBatchProgress({
        current: i + 1,
        total: shotsToProcess.length,
        message: `正在生成镜头 ${i + 1}/${shotsToProcess.length}...`,
      });

      try {
        await handleGenerateKeyframe(shot, 'start');
      } catch (e: unknown) {
        logger.error(LogCategory.AI, `Failed to generate for shot ${shot.id}`, e);
        if (onApiKeyError && onApiKeyError(e)) {
          setBatchProgress(null);
          return;
        }
      }
    }

    setBatchProgress(null);
  };

  /**
   * 保存编辑内容
   */
  const handleSaveEdit = () => {
    if (!editModal || !activeShot) return;

    switch (editModal.type) {
      case 'action':
        updateShot(activeShot.id, (s) => ({ ...s, actionSummary: editModal.value }));
        break;
      case 'keyframe':
        updateShot(activeShot.id, (s) => ({
          ...s,
          keyframes:
            s.keyframes?.map((kf) =>
              kf.type === editModal.frameType
                ? { ...kf, visualPrompt: editModal.value, visualPromptSource: 'manual' as const }
                : kf,
            ) || [],
        }));
        break;
      case 'video':
        updateShot(activeShot.id, (s) => ({
          ...s,
          interval: s.interval ? { ...s.interval, videoPrompt: editModal.value } : undefined,
        }));
        break;
    }

    setEditModal(null);
    setVlmData(null);
    setIsVlmLoading(false);
  };

  const handleCloseEdit = () => {
    setEditModal(null);
    setVlmData(null);
    setIsVlmLoading(false);
  };

  const analyzeKeyframeImage = async (imageUrl: string, frameLabel: string): Promise<string> => {
    const vlmSystemPrompt = `你是一个专业的影视镜头分析师。请从电影摄影的角度分析这张${frameLabel}画面。`;
    const vlmPrompt = `请分析这张${frameLabel}画面的以下要素，每项用一句话描述：
1. 场景：这是什么场景/环境？
2. 构图：镜头构图方式、主体位置、景别
3. 光影：光源方向、光线质感、色调
4. 角色：画面中的角色、姿态、表情、服装
5. 关键物体：画面中的重要道具或环境细节
6. 情绪/氛围：画面的情绪基调
7. 镜头语言：机位角度、焦段感`;
    try {
      const result = await generateVisualLanguage(vlmSystemPrompt, vlmPrompt, imageUrl);
      return result || '';
    } catch {
      return '';
    }
  };

  const saveVlmToShot = (
    shotId: string,
    startAnalysis: string,
    endAnalysis: string,
    sKfId: string | undefined,
    eKfId: string | undefined,
  ) => {
    updateShot(shotId, (s) => ({
      ...s,
      vlmAnalysis: {
        startAnalysis,
        endAnalysis,
        startKeyframeId: sKfId || '',
        endKeyframeId: eKfId || '',
      },
    }));
  };

  const runVlmAnalysis = (
    sKf: { imageUrl?: string; id?: string } | undefined,
    eKf: { imageUrl?: string; id?: string } | undefined,
  ) => {
    if (!activeShot) return;
    setIsVlmLoading(true);
    setVlmData(null);

    const rawStartUrl = sKf?.imageUrl;
    const rawEndUrl = eKf?.imageUrl;
    const shotId = activeShot.id;

    Promise.all([
      rawStartUrl ? analyzeKeyframeImage(rawStartUrl, '首帧') : Promise.resolve(''),
      rawEndUrl ? analyzeKeyframeImage(rawEndUrl, '尾帧') : Promise.resolve(''),
    ])
      .then(([start, end]) => {
        const result = { start: start || '', end: end || '' };
        setVlmData(result);
        setIsVlmLoading(false);
        saveVlmToShot(shotId, result.start, result.end, sKf?.id, eKf?.id);
      })
      .catch(() => {
        setIsVlmLoading(false);
      });
  };

  const handleOpenActionEdit = () => {
    if (!activeShot) return;
    const sKf = activeShot.keyframes?.find((k) => k.type === 'start');
    const eKf = activeShot.keyframes?.find((k) => k.type === 'end');

    setEditModal({
      type: 'action',
      value: activeShot.actionSummary,
      startImageUrl: sKf?.imageUrl,
      endImageUrl: eKf?.imageUrl,
      startPrompt: sKf?.visualPrompt,
      endPrompt: eKf?.visualPrompt,
    });

    const vlm = activeShot.vlmAnalysis;
    if (vlm && vlm.startKeyframeId === (sKf?.id || '') && vlm.endKeyframeId === (eKf?.id || '')) {
      setVlmData({ start: vlm.startAnalysis, end: vlm.endAnalysis });
      setIsVlmLoading(false);
    } else {
      runVlmAnalysis(sKf, eKf);
    }
  };

  const handleReAnalyzeVlm = () => {
    if (!activeShot) return;
    const sKf = activeShot.keyframes?.find((k) => k.type === 'start');
    const eKf = activeShot.keyframes?.find((k) => k.type === 'end');
    runVlmAnalysis(sKf, eKf);
  };

  /**
   * AI生成动作建议
   */
  const handleGenerateAIAction = async () => {
    if (!activeShot) return;

    const startKf = activeShot.keyframes?.find((k) => k.type === 'start');
    const endKf = activeShot.keyframes?.find((k) => k.type === 'end');

    if (!startKf?.visualPrompt && !endKf?.visualPrompt) {
      showAlert('请先生成或编辑首帧和尾帧的提示词，以便AI更好地理解场景', { type: 'warning' });
      return;
    }

    setIsAIGenerating(true);

    try {
      const startPrompt = startKf?.visualPrompt || activeShot.actionSummary || '未定义的起始场景';
      const endPrompt = endKf?.visualPrompt || activeShot.actionSummary || '未定义的结束场景';
      const cameraMovement = activeShot.cameraMovement || '平移';
      const startImageUrl = startKf?.imageUrl;
      const endImageUrl = endKf?.imageUrl;

      const suggestion = await generateActionSuggestion(
        startPrompt,
        endPrompt,
        cameraMovement,
        undefined,
        startImageUrl,
        endImageUrl,
      );

      if (editModal && editModal.type === 'action') {
        setEditModal({ ...editModal, value: suggestion });
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, 'AI动作生成失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI动作生成失败: ${errorMessage}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI优化关键帧提示词（单个）
   */
  const handleOptimizeKeyframeWithAI = async (type: 'start' | 'end') => {
    if (!activeShot) return;

    const scene = project.scriptData?.scenes.find(
      (s) => String(s.id) === String(activeShot.sceneId),
    );
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }

    setIsAIGenerating(true);

    try {
      // 获取角色信息
      const characterNames: string[] = [];
      if (activeShot.characters && project.scriptData?.characters) {
        activeShot.characters.forEach((charId) => {
          const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
          if (char) characterNames.push(char.name);
        });
      }

      const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';
      const actionSummary = activeShot.actionSummary || '未定义的动作';
      const cameraMovement = activeShot.cameraMovement || '平移';

      const optimizedPrompt = await optimizeKeyframePrompt(
        type,
        actionSummary,
        cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
        },
        characterNames,
        visualStyle,
      );

      // 检查锁定状态
      const existingKf = activeShot.keyframes?.find((k) => k.type === type);
      if (existingKf?.visualPromptSource === 'manual') {
        showAlert('此镜头提示词已被用户锁定，请先解锁再优化', { type: 'warning' });
        setIsAIGenerating(false);
        return;
      }
      const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-${type}`);

      updateShot(activeShot.id, (s) => {
        return updateKeyframeInShot(
          s,
          type,
          createKeyframe(
            kfId,
            type,
            optimizedPrompt,
            existingKf?.imageUrl,
            existingKf?.status || 'pending',
          ),
        );
      });

      showAlert(`${type === 'start' ? '起始帧' : '结束帧'}提示词已优化`, { type: 'success' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, 'AI优化失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI优化失败: ${errorMessage}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI一次性优化起始帧和结束帧（推荐）
   */
  const handleOptimizeBothKeyframes = async () => {
    if (!activeShot) return;

    const scene = project.scriptData?.scenes.find(
      (s) => String(s.id) === String(activeShot.sceneId),
    );
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }

    setIsAIGenerating(true);

    try {
      // 获取角色信息
      const characterNames: string[] = [];
      if (activeShot.characters && project.scriptData?.characters) {
        activeShot.characters.forEach((charId) => {
          const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
          if (char) characterNames.push(char.name);
        });
      }

      const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';
      const actionSummary = activeShot.actionSummary || '未定义的动作';
      const cameraMovement = activeShot.cameraMovement || '平移';

      const result = await optimizeBothKeyframes(
        actionSummary,
        cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
        },
        characterNames,
        visualStyle,
      );

      // 同时更新起始帧和结束帧（跳过已锁定的帧）
      const startKf = activeShot.keyframes?.find((k) => k.type === 'start');
      const endKf = activeShot.keyframes?.find((k) => k.type === 'end');
      const startKfId = startKf?.id || generateId(`kf-${activeShot.id}-start`);
      const endKfId = endKf?.id || generateId(`kf-${activeShot.id}-end`);

      updateShot(activeShot.id, (s) => {
        let updated = s;
        if (startKf?.visualPromptSource !== 'manual') {
          updated = updateKeyframeInShot(
            updated,
            'start',
            createKeyframe(
              startKfId,
              'start',
              result.startPrompt,
              startKf?.imageUrl,
              startKf?.status || 'pending',
            ),
          );
        }
        if (endKf?.visualPromptSource !== 'manual') {
          updated = updateKeyframeInShot(
            updated,
            'end',
            createKeyframe(
              endKfId,
              'end',
              result.endPrompt,
              endKf?.imageUrl,
              endKf?.status || 'pending',
            ),
          );
        }
        return updated;
      });

      const skippedFrames = [
        startKf?.visualPromptSource === 'manual' ? '起始帧' : null,
        endKf?.visualPromptSource === 'manual' ? '结束帧' : null,
      ].filter(Boolean);
      showAlert(
        `起始帧和结束帧提示词已优化${skippedFrames.length > 0 ? `（${skippedFrames.join('、')}已锁定已跳过）` : ''}`,
        { type: 'success' },
      );
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, 'AI优化失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`AI优化失败: ${errorMessage}`, { type: 'error' });
    } finally {
      setIsAIGenerating(false);
    }
  };

  /**
   * AI拆分镜头
   * 将单个镜头拆分为多个细致的子镜头（按景别和视角）
   */
  const handleSplitShot = async (shot: Shot) => {
    if (!shot) return;

    // 弹出确认提示，告知用户拆分的含义
    showAlert(
      'AI拆分镜头会将当前镜头按不同景别与视角拆分为多个子镜头，原镜头将被替换为拆分后的子镜头序列。此操作不可撤销，建议在拆分前确认镜头内容已编辑完成。\n\n确定要继续拆分吗？',
      {
        title: 'AI拆分镜头',
        type: 'warning',
        showCancel: true,
        confirmText: '确认拆分',
        cancelText: '取消',
        onConfirm: () => executeSplitShot(shot),
      },
    );
  };

  /** 执行AI拆分镜头的实际逻辑 */
  const executeSplitShot = async (shot: Shot) => {
    // 1. 获取场景信息
    const scene = project.scriptData?.scenes.find((s) => String(s.id) === String(shot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }

    // 2. 获取角色名称
    const characterNames: string[] = [];
    if (shot.characters && project.scriptData?.characters) {
      shot.characters.forEach((charId) => {
        const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
        if (char) characterNames.push(char.name);
      });
    }

    const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';
    const activeChatModel = getActiveChatModel();
    const shotGenerationModel =
      project.shotGenerationModel || activeChatModel?.id || getDefaultChatModelId();
    logger.info(LogCategory.AI, '🎬 九宫格分镜 - shotGenerationModel:', [
      shotGenerationModel,
      'activeChatModel:',
      activeChatModel?.id,
    ]);
    logger.info(LogCategory.AI, '🎬 九宫格分镜 - shotGenerationModel:', [
      shotGenerationModel,
      'activeChatModel:',
      activeChatModel?.id,
    ]);

    // 3. 调用AI拆分
    setIsSplittingShot(true);

    try {
      const subShotsData = await splitShotIntoSubShots(
        shot,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
        },
        characterNames,
        visualStyle,
        shotGenerationModel,
      );

      // 4. 生成子镜头对象
      const subShotIds = generateSubShotIds(shot.id, subShotsData.subShots.length);
      const subShots = subShotsData.subShots.map((data, idx) =>
        createSubShot(shot, data, subShotIds[idx]),
      );

      // 5. 替换原镜头
      updateProject((prevProject: ProjectState) => ({
        ...prevProject,
        shots: replaceShotWithSubShots(prevProject.shots, shot.id, subShots),
      }));

      // 6. 关闭工作台，显示成功提示
      setActiveShotId(null);
      showAlert(`镜头已拆分为 ${subShots.length} 个子镜头`, { type: 'success' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, '镜头拆分失败:', e);
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`拆分失败: ${errorMessage}`, { type: 'error' });
    } finally {
      setIsSplittingShot(false);
    }
  };

  /**
   * 九宫格分镜预览 - 第一步：生成镜头描述
   * 使用 AI 将镜头拆分为 9 个不同视角的文字描述，等待用户确认/编辑后再生成图片
   */
  const handleGenerateNineGrid = async (shot: Shot) => {
    if (!shot) return;

    // 1. 获取场景信息
    const scene = project.scriptData?.scenes.find((s) => String(s.id) === String(shot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }

    // 2. 获取角色名称
    const characterNames: string[] = [];
    if (shot.characters && project.scriptData?.characters) {
      shot.characters.forEach((charId) => {
        const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
        if (char) characterNames.push(char.name);
      });
    }

    const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';
    const activeChatModel = getActiveChatModel();
    const shotGenerationModel =
      project.shotGenerationModel || activeChatModel?.id || getDefaultChatModelId();
    logger.info(LogCategory.AI, '🎬 九宫格分镜 - shotGenerationModel:', [
      shotGenerationModel,
      'activeChatModel:',
      activeChatModel?.id,
    ]);

    // 3. 显示弹窗并设置生成状态（仅生成面板描述）
    setShowNineGrid(true);
    updateShot(shot.id, (s) => ({
      ...s,
      nineGrid: {
        panels: [],
        status: 'generating_panels' as const,
      },
    }));

    try {
      // 4. 调用 AI 拆分镜头为 9 个视角（仅文字描述，不生成图片）
      const panels = await generateNineGridPanels(
        shot.actionSummary,
        shot.cameraMovement,
        {
          location: scene.location,
          time: scene.time,
          atmosphere: scene.atmosphere,
        },
        characterNames,
        visualStyle,
        shotGenerationModel,
      );

      // 5. 更新状态为 panels_ready，等待用户确认
      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: {
          panels,
          status: 'panels_ready' as const,
        },
      }));

      showAlert('9个镜头描述已生成，请检查并编辑后确认生成图片', { type: 'success' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, '九宫格镜头描述生成失败:', e);
      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: {
          panels: s.nineGrid?.panels || [],
          status: 'failed' as const,
        },
      }));

      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`镜头描述生成失败: ${errorMessage}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 V2（测试新流程）
   * 先生成风格帧（style frame）作为参考图，再调用 image2storyboard
   */
  const handleGenerateNineGridV2 = async (shot: Shot) => {
    if (!shot) return;

    const scene = project.scriptData?.scenes.find((s) => String(s.id) === String(shot.sceneId));
    if (!scene) {
      showAlert('找不到场景信息', { type: 'warning' });
      return;
    }

    const characterNames: string[] = [];
    if (shot.characters && project.scriptData?.characters) {
      shot.characters.forEach((charId) => {
        const char = project.scriptData?.characters.find((c) => String(c.id) === String(charId));
        if (char) characterNames.push(char.name);
      });
    }

    const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';
    const activeChatModel = getActiveChatModel();
    const shotGenerationModel =
      project.shotGenerationModel || activeChatModel?.id || getDefaultChatModelId();

    setShowNineGrid(true);
    updateShot(shot.id, (s) => ({
      ...s,
      nineGrid: {
        panels: [],
        status: 'generating_panels' as const,
      },
    }));

    try {
      // Step 1: 生成 9 个镜头描述
      const panels = await generateNineGridPanels(
        shot.actionSummary,
        shot.cameraMovement,
        { location: scene.location, time: scene.time, atmosphere: scene.atmosphere },
        characterNames,
        visualStyle,
        shotGenerationModel,
      );

      // Step 2: 生成风格帧（style frame）作为统一参考
      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: { panels, status: 'generating_image' as const },
      }));

      const refResult = getRefImagesForShot(shot, project.scriptData);
      const charDescs = (shot.characters || [])
        .map((charId) => {
          const c = project.scriptData?.characters.find((ch) => String(ch.id) === String(charId));
          if (!c) return null;
          return {
            name: c.name,
            visualPrompt: c.visualPrompt || '',
            hasImage: !!c.imageUrl || !!c.threeViewImageUrl,
          };
        })
        .filter(Boolean) as { name: string; visualPrompt: string; hasImage: boolean }[];
      const styleFramePrompt = await buildKeyframePrompt(
        shot.actionSummary,
        visualStyle,
        shot.cameraMovement,
        'start',
        undefined,
        undefined,
        undefined,
        charDescs,
        project.eraContext,
        project.knowledgeBase,
      );
      const nineGridNegatives: string[] = [];
      (shot.characters || []).forEach((charId) => {
        const c = project.scriptData?.characters.find((ch) => String(ch.id) === String(charId));
        if (c?.negativePrompt) nineGridNegatives.push(c.negativePrompt);
      });
      const styleFrameUrl = await generateImage(
        styleFramePrompt,
        refResult.images,
        keyframeAspectRatio,
        false,
        false,
        'ninegrid-styleframe',
        shot.id,
        nineGridNegatives.length > 0 ? nineGridNegatives.join('\n') : undefined,
      );

      // Step 3: 以风格帧作为参考图 → image2storyboard
      const imageUrl = await generateNineGridImage(
        panels,
        [styleFrameUrl], // 只用风格帧作为参考
        visualStyle,
        keyframeAspectRatio,
        shot.id,
      );

      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: {
          panels,
          imageUrl,
          gridnum: 9,
          prompt: `V2 Flow - Style Frame → Storyboard - ${shot.actionSummary}`,
          status: 'completed' as const,
          styleFramePrompt,
          styleFrameUrl,
        },
      }));

      showAlert('V2 九宫格分镜生成完成！（风格帧→分格）', { type: 'success' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, 'V2 九宫格分镜生成失败:', e);
      updateShot(shot.id, (s) => ({
        ...s,
        nineGrid: {
          panels: s.nineGrid?.panels || [],
          status: 'failed' as const,
        },
      }));
      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`V2 九宫格分镜生成失败: ${errorMessage}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 - 第二步：确认并生成图片
   * 用户确认/编辑完面板描述后，调用图片生成 API 生成九宫格图片
   */
  const handleConfirmNineGridPanels = async (confirmedPanels: NineGridPanel[]) => {
    if (!activeShot) return;

    const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';

    // 1. 更新面板数据并设置生成图片状态
    updateShot(activeShot.id, (s) => ({
      ...s,
      nineGrid: {
        panels: confirmedPanels,
        status: 'generating_image' as const,
      },
    }));

    try {
      // 2. 收集参考图片
      const refResult = getRefImagesForShot(activeShot, project.scriptData);

      // 3. 生成九宫格图片
      const imageUrl = await generateNineGridImage(
        confirmedPanels,
        refResult.images,
        visualStyle,
        keyframeAspectRatio,
        activeShot.id,
      );

      // 4. 更新状态为完成
      updateShot(activeShot.id, (s) => ({
        ...s,
        nineGrid: {
          panels: confirmedPanels,
          imageUrl,
          prompt: `Nine Grid Storyboard - ${activeShot.actionSummary}`,
          status: 'completed' as const,
        },
      }));

      showAlert('九宫格分镜图片生成完成！', { type: 'success' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, '九宫格图片生成失败:', e);
      updateShot(activeShot.id, (s) => ({
        ...s,
        nineGrid: {
          panels: confirmedPanels,
          status: 'failed' as const,
        },
      }));

      if (onApiKeyError && onApiKeyError(e)) return;
      showAlert(`九宫格图片生成失败: ${errorMessage}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 - 仅重新生成图片（保留已有的面板描述文案）
   * 当用户对文案满意但图片效果不好时使用
   */
  const handleRegenerateNineGridImage = async () => {
    if (!activeShot || !activeShot.nineGrid?.panels || activeShot.nineGrid.panels.length !== 9)
      return;

    // 直接使用已有的面板描述重新生成图片
    handleConfirmNineGridPanels(activeShot.nineGrid.panels);
  };

  /**
   * 九宫格分镜预览 - 更新单个面板描述（用户在弹窗中编辑）
   */
  const handleUpdateNineGridPanel = (index: number, updatedPanel: Partial<NineGridPanel>) => {
    if (!activeShot || !activeShot.nineGrid) return;

    updateShot(activeShot.id, (s) => {
      if (!s.nineGrid) return s;
      const newPanels = [...s.nineGrid.panels];
      newPanels[index] = { ...newPanels[index], ...updatedPanel };
      return {
        ...s,
        nineGrid: {
          ...s.nineGrid,
          panels: newPanels,
        },
      };
    });
  };

  /**
   * 九宫格分镜预览 - 选择面板
   * 从九宫格图片中裁剪选中的面板，直接作为首帧使用（九宫格与首帧是替代关系）
   */
  const handleSelectNineGridPanel = async (panel: NineGridPanel) => {
    if (!activeShot || !activeShot.nineGrid?.imageUrl) return;

    const visualStyle = project.scriptData?.visualStyle || project.visualStyle || 'live-action';

    // 1. 构建首帧提示词（保留视角信息，方便后续重新生成）
    const shotPropsInfo = getPropsInfoForShot(activeShot, project.scriptData);
    const guideModel = getActiveChatModel()?.id || getDefaultChatModelId();
    const prompt = await buildPromptFromNineGridPanel(
      panel,
      activeShot.actionSummary,
      visualStyle,
      activeShot.cameraMovement,
      shotPropsInfo,
      chatCompletion,
      guideModel,
    );

    const existingKf = activeShot.keyframes?.find((k) => k.type === 'start');
    const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-start`);

    try {
      // 2. 获取九宫格图片的实际 URL（处理本地图片）
      const nineGridImageUrl = await unifiedImageService.resolveForDisplay(
        activeShot.nineGrid.imageUrl,
      );
      if (!nineGridImageUrl) {
        showAlert('无法加载九宫格图片', { type: 'error' });
        return;
      }

      // 3. 从九宫格图片中裁剪出选中的面板
      const croppedImageUrl = await cropPanelFromNineGrid(nineGridImageUrl, panel.index);

      // 4. 将裁剪后的图片直接设为首帧（九宫格与首帧是替代关系）
      updateShot(activeShot.id, (s) => {
        return updateKeyframeInShot(
          s,
          'start',
          createKeyframe(kfId, 'start', prompt, croppedImageUrl, 'completed'),
        );
      });

      // 4. 关闭弹窗
      setShowNineGrid(false);
      showAlert(`已将「${panel.shotSize}/${panel.cameraAngle}」视角设为首帧`, { type: 'success' });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error(LogCategory.AI, '裁剪九宫格面板失败:', e);
      showAlert(`裁剪失败: ${errorMessage}`, { type: 'error' });
    }
  };

  /**
   * 九宫格分镜预览 - 整张图直接用作首帧
   */
  const handleUseWholeNineGridAsFrame = async () => {
    if (!activeShot || !activeShot.nineGrid?.imageUrl) return;

    // 获取九宫格图片的实际 URL（处理本地图片）
    const nineGridImageUrl = await unifiedImageService.resolveForDisplay(
      activeShot.nineGrid.imageUrl,
    );
    if (!nineGridImageUrl) {
      showAlert('无法加载九宫格图片', { type: 'error' });
      return;
    }

    const existingKf = activeShot.keyframes?.find((k) => k.type === 'start');
    const kfId = existingKf?.id || generateId(`kf-${activeShot.id}-start`);
    const prompt = `九宫格分镜全图 - ${activeShot.actionSummary}`;

    updateShot(activeShot.id, (s) => {
      return updateKeyframeInShot(
        s,
        'start',
        createKeyframe(kfId, 'start', prompt, nineGridImageUrl, 'completed'),
      );
    });

    setShowNineGrid(false);
    showAlert('已将九宫格整图设为首帧', { type: 'success' });
  };

  // 空状态
  if (!project.shots.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] bg-[var(--bg-secondary)]">
        <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
        <p>暂无镜头数据，请先返回阶段 1 生成分镜表。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] relative overflow-hidden">
      {/* Batch Progress Overlay */}
      {batchProgress && (
        <div className="absolute inset-0 z-50 bg-[var(--bg-base)]/80 flex flex-col items-center justify-center backdrop-blur-md animate-in fade-in">
          <Loader2 className="w-12 h-12 text-[var(--accent)] animate-spin mb-6" />
          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            {batchProgress.message}
          </h3>
          <div className="w-64 h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[var(--text-tertiary)] mt-3 text-xs font-mono">
            {Math.round((batchProgress.current / batchProgress.total) * 100)}%
          </p>
        </div>
      )}

      {toastMessage && (
        <div className="fixed left-1/2 top-1/3 z-[9999] w-full max-w-md -translate-x-1/2 rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-elevated)] px-4 py-3 shadow-2xl backdrop-blur">
          <div className="text-xs text-[var(--text-primary)] whitespace-pre-line">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-[var(--border-primary)] bg-[var(--bg-elevated)] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
            导演工作台
            <span className="text-xs text-[var(--text-muted)] font-mono font-normal uppercase tracking-wider bg-[var(--bg-base)]/30 px-2 py-1 rounded">
              Director Workbench
            </span>
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* 横竖屏选择 */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">比例</span>
            <AspectRatioSelector
              value={keyframeAspectRatio}
              onChange={setKeyframeAspectRatio}
              allowSquare={false}
              disabled={!!batchProgress}
            />
          </div>
          <div className="w-px h-6 bg-[var(--bg-hover)]" />
          {/* AI增强开关 */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-base)]/30 border border-[var(--border-primary)]">
            <Sparkles
              className={`w-3.5 h-3.5 ${useAIEnhancement ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-[var(--text-tertiary)]">AI增强提示词</span>
              <input
                type="checkbox"
                checked={useAIEnhancement}
                onChange={(e) => setUseAIEnhancement(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-[var(--border-secondary)] bg-[var(--bg-hover)] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
            </label>
          </div>

          <span className="text-xs text-[var(--text-tertiary)] mr-4 font-mono">
            {project.shots.filter((s) => s.interval?.videoUrl).length} / {project.shots.length} 完成
          </span>
          <button
            onClick={handleBatchGenerateImages}
            disabled={!!batchProgress}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
              allStartFramesGenerated
                ? 'bg-[var(--bg-surface)] text-[var(--text-tertiary)] border border-[var(--border-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)]'
                : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] shadow-lg shadow-[var(--btn-primary-shadow)]'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {allStartFramesGenerated ? '重新生成所有首帧' : '批量生成首帧'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Grid View */}
        <div
          className={`flex-1 overflow-y-auto p-6 transition-all duration-500 ease-in-out ${activeShotId ? 'border-r border-[var(--border-primary)]' : ''}`}
        >
          <div
            className={`grid gap-4 ${activeShotId ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}
          >
            {project.shots.map((shot, idx) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={idx}
                isActive={activeShotId === shot.id}
                aspectRatio={keyframeAspectRatio}
                onClick={() => setActiveShotId(shot.id)}
                onDelete={handleDeleteShot}
              />
            ))}
          </div>
        </div>

        {/* Workbench */}
        {activeShotId && activeShot && (
          <ShotWorkbench
            shot={activeShot}
            shotIndex={activeShotIndex}
            totalShots={project.shots.length}
            scriptData={project.scriptData}
            currentVideoModelId={activeShot.videoModel || DEFAULTS.videoModel}
            nextShotHasStartFrame={
              !!project.shots[activeShotIndex + 1]?.keyframes?.find((k) => k.type === 'start')
                ?.imageUrl
            }
            isAIOptimizing={isAIGenerating}
            isSplittingShot={isSplittingShot}
            keyframeStageMessages={keyframeStageMessages}
            keyframeIPAVerify={keyframeIPAVerify}
            onToggleKeyframeIPAVerify={() => setKeyframeIPAVerify((v) => !v)}
            onClose={() => setActiveShotId(null)}
            onPrevious={() => setActiveShotId(project.shots[activeShotIndex - 1].id)}
            onNext={() => setActiveShotId(project.shots[activeShotIndex + 1].id)}
            onEditActionSummary={handleOpenActionEdit}
            onGenerateAIAction={handleGenerateAIAction}
            onSplitShot={() => handleSplitShot(activeShot)}
            onAddCharacter={(charId) =>
              updateShot(activeShot.id, (s) => ({ ...s, characters: [...s.characters, charId] }))
            }
            onRemoveCharacter={(charId) =>
              updateShot(activeShot.id, (s) => ({
                ...s,
                characters: s.characters.filter((id) => id !== charId),
                characterVariations: Object.fromEntries(
                  Object.entries(s.characterVariations || {}).filter(([k]) => k !== charId),
                ),
              }))
            }
            onVariationChange={(charId, varId) =>
              updateShot(activeShot.id, (s) => ({
                ...s,
                characterVariations: { ...(s.characterVariations || {}), [charId]: varId },
              }))
            }
            onSceneChange={(sceneId) => updateShot(activeShot.id, (s) => ({ ...s, sceneId }))}
            onAddProp={(propId) =>
              updateShot(activeShot.id, (s) => ({ ...s, props: [...(s.props || []), propId] }))
            }
            onRemoveProp={(propId) =>
              updateShot(activeShot.id, (s) => ({
                ...s,
                props: (s.props || []).filter((id) => id !== propId),
              }))
            }
            onGenerateKeyframe={(type) => handleGenerateKeyframe(activeShot, type)}
            onUploadKeyframe={(type) => handleUploadKeyframeImage(activeShot, type)}
            onEditKeyframePrompt={(type, prompt) =>
              setEditModal({ type: 'keyframe', value: prompt, frameType: type })
            }
            onOptimizeKeyframeWithAI={(type) => handleOptimizeKeyframeWithAI(type)}
            onOptimizeBothKeyframes={handleOptimizeBothKeyframes}
            onCopyPreviousEndFrame={handleCopyPreviousEndFrame}
            onCopyNextStartFrame={handleCopyNextStartFrame}
            onToggleKeyframeLock={(type) => {
              updateShot(activeShot.id, (s) => ({
                ...s,
                keyframes:
                  s.keyframes?.map((kf) =>
                    kf.type === type
                      ? {
                          ...kf,
                          visualPromptSource:
                            kf.visualPromptSource === 'manual'
                              ? ('auto' as const)
                              : ('manual' as const),
                        }
                      : kf,
                  ) || [],
              }));
            }}
            useAIEnhancement={useAIEnhancement}
            onToggleAIEnhancement={() => setUseAIEnhancement(!useAIEnhancement)}
            onGenerateVideo={(aspectRatio, duration, modelId) =>
              handleGenerateVideo(activeShot, aspectRatio, duration, modelId)
            }
            onGenerateAdvanced={(params) => handleAdvancedGenerateVideo(activeShot, params)}
            videoPresets={project.videoPresets}
            onSavePreset={handleSavePreset}
            onApplyPreset={handleApplyPreset}
            onDeletePreset={handleDeletePreset}
            shotKeyframes={activeShot?.keyframes}
            projectAspectRatio={project.aspectRatio}
            onVideoModelChange={(modelId) => {
              const model = getModelById(modelId);
              const lines = [
                `已切换视频模型：${model?.name || modelId}`,
                model?.description,
              ].filter(Boolean);
              setToastMessage(lines.join('\n'));
              updateShot(activeShot.id, (s) => ({
                ...s,
                videoModel: modelId,
              }));
            }}
            onSaveAdvancedParams={(params) => {
              if (!activeShot) return;
              updateShot(activeShot.id, (s) => {
                const startKf = s.keyframes?.find((k) => k.type === 'start');
                const endKf = s.keyframes?.find((k) => k.type === 'end');
                return {
                  ...s,
                  interval: s.interval
                    ? {
                        ...s.interval,
                        mode: params.mode,
                        fps: params.fps,
                        width: params.width,
                        height: params.height,
                        backgroundImage: params.backgroundImage,
                        timedKeyframes: params.timedKeyframes,
                        gridType: params.gridType,
                        frameIndexes: params.frameIndexes,
                      }
                    : {
                        id: generateId(`int-${s.id}`),
                        mode: params.mode,
                        fps: params.fps,
                        width: params.width,
                        height: params.height,
                        backgroundImage: params.backgroundImage,
                        timedKeyframes: params.timedKeyframes,
                        gridType: params.gridType,
                        frameIndexes: params.frameIndexes,
                        startKeyframeId: startKf?.id || '',
                        endKeyframeId: endKf?.id || '',
                        duration: 0,
                        motionStrength: 0,
                        status: 'pending',
                      },
                };
              });
            }}
            onEditCameraChoreography={() => setShowChoreographyModal(true)}
            onEditVideoPrompt={() => {
              // 如果videoPrompt不存在，动态生成一个
              let promptValue = activeShot.interval?.videoPrompt;
              if (!promptValue) {
                const selectedModel = activeShot.videoModel || DEFAULTS.videoModel;
                const projectLanguage = project.language || project.scriptData?.language || '中文';
                const startKf = activeShot.keyframes?.find((k) => k.type === 'start');
                const hasFourGrid =
                  activeShot.fourGrid?.status === 'completed' && !!activeShot.fourGrid?.imageUrl;
                // 首帧等于九宫格图时触发九宫格分镜模式
                const isNineGridMode =
                  !hasFourGrid &&
                  activeShot.nineGrid?.status === 'completed' &&
                  activeShot.nineGrid?.imageUrl &&
                  startKf?.imageUrl === activeShot.nineGrid.imageUrl;
                promptValue = buildVideoPrompt(
                  activeShot.actionSummary,
                  activeShot.cameraMovement,
                  selectedModel,
                  projectLanguage,
                  isNineGridMode ? activeShot.nineGrid : undefined,
                  undefined,
                  activeShot.cameraChoreography,
                  project.eraContext,
                  project.knowledgeBase,
                );
              }
              setEditModal({
                type: 'video',
                value: promptValue,
              });
            }}
            onImageClick={(url, title) => setPreviewImage({ url, title })}
            aspectRatio={keyframeAspectRatio}
            onGenerateNineGrid={() => handleGenerateNineGrid(activeShot)}
            onGenerateNineGridV2={() => handleGenerateNineGridV2(activeShot)}
            nineGrid={activeShot.nineGrid}
            onSelectNineGridPanel={handleSelectNineGridPanel}
            onShowNineGrid={() => setShowNineGrid(true)}
            onSaveFourGrid={(fourGrid) => {
              if (activeShot) updateShot(activeShot.id, (s) => ({ ...s, fourGrid }));
            }}
            generationProgress={generationProgress}
            projectLanguage={project.language || project.scriptData?.language || '中文'}
            projectEraContext={project.eraContext}
          />
        )}
      </div>

      {/* Nine Grid Preview Modal */}
      {activeShot && (
        <NineGridPreview
          isOpen={showNineGrid}
          nineGrid={activeShot.nineGrid}
          onClose={() => setShowNineGrid(false)}
          onSelectPanel={handleSelectNineGridPanel}
          onUseWholeImage={handleUseWholeNineGridAsFrame}
          onRegenerate={() => handleGenerateNineGrid(activeShot)}
          onRegenerateImage={handleRegenerateNineGridImage}
          onConfirmPanels={handleConfirmNineGridPanels}
          onUpdatePanel={handleUpdateNineGridPanel}
          aspectRatio={keyframeAspectRatio}
        />
      )}

      {/* Edit Modal */}
      <EditModal
        isOpen={!!editModal}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
        title={
          editModal?.type === 'action'
            ? '编辑叙事动作'
            : editModal?.type === 'keyframe'
              ? '编辑关键帧提示词'
              : '编辑视频提示词'
        }
        icon={
          editModal?.type === 'action' ? (
            <Film className="w-4 h-4 text-[var(--accent-text)]" />
          ) : editModal?.type === 'keyframe' ? (
            <Edit2 className="w-4 h-4 text-[var(--accent-text)]" />
          ) : (
            <VideoIcon className="w-4 h-4 text-[var(--accent-text)]" />
          )
        }
        value={editModal?.value || ''}
        onChange={(value) => setEditModal(editModal ? { ...editModal, value } : null)}
        placeholder={
          editModal?.type === 'action'
            ? '描述镜头的动作和内容...'
            : editModal?.type === 'keyframe'
              ? '输入关键帧的提示词...'
              : '输入视频生成的提示词...'
        }
        textareaClassName={
          editModal?.type === 'keyframe' || editModal?.type === 'video'
            ? 'font-mono'
            : 'font-normal'
        }
        showAIGenerate={editModal?.type === 'action'}
        onAIGenerate={handleGenerateAIAction}
        isAIGenerating={isAIGenerating}
        showKeyframes={editModal?.type === 'action'}
        startImageUrl={editModal?.startImageUrl}
        endImageUrl={editModal?.endImageUrl}
        startPrompt={editModal?.startPrompt}
        endPrompt={editModal?.endPrompt}
        vlmStartAnalysis={
          editModal?.type === 'action' ? (isVlmLoading ? null : vlmData?.start || null) : undefined
        }
        vlmEndAnalysis={
          editModal?.type === 'action' ? (isVlmLoading ? null : vlmData?.end || null) : undefined
        }
        isVlmLoading={editModal?.type === 'action' ? isVlmLoading : false}
        onImageClick={(url, title) => setPreviewImage({ url, title })}
        onReAnalyzeVlm={handleReAnalyzeVlm}
      />

      {/* Image Preview Modal */}
      <ImagePreviewModal
        imageUrl={previewImage?.url || null}
        title={previewImage?.title}
        onClose={() => setPreviewImage(null)}
      />

      {/* 运镜编排弹窗 */}
      {activeShot && (
        <CameraChoreographyModal
          isOpen={showChoreographyModal}
          onClose={() => setShowChoreographyModal(false)}
          onSave={(choreography) => {
            updateShot(activeShot.id, (s) => ({
              ...s,
              cameraChoreography: choreography,
              cameraMovement: choreography
                ? CAMERA_MOVEMENT_TYPES.find((m) => m.id === choreography.movementType)?.label ||
                  choreography.movementType ||
                  s.cameraMovement
                : s.cameraMovement,
              shotSize: choreography?.startShotSize || s.shotSize,
            }));
            setShowChoreographyModal(false);
          }}
          initial={activeShot.cameraChoreography}
        />
      )}
    </div>
  );
};

export default StageDirector;
