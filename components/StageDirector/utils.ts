import {
  Shot,
  ProjectState,
  Keyframe,
  NineGridPanel,
  NineGridData,
  AspectRatio,
  CameraChoreography,
  renderCameraChoreographyPrompt,
} from '../../types';

/** Pipeline 字段自动打通：从 shot 现有字段带入的预览数据 */
export interface PipelineShotData {
  shotSize?: string;
  cameraMovement?: string;
  actionSummary?: string;
  cameraChoreography?: CameraChoreography;
}
import { VISUAL_STYLE_PROMPTS, VIDEO_PROMPT_TEMPLATES, NINE_GRID } from './constants';
import { getCameraMovementCompositionGuide } from './cameraMovementGuides';
import { logger, LogCategory } from '../../services/logger';

/**
 * 根据横竖屏比例获取 CSS aspect-ratio 值
 */
export const getImageAspectRatio = (ratio: AspectRatio): string => {
  switch (ratio) {
    case '16:9':
      return '16 / 9';
    case '9:16':
      return '9 / 16';
    case '1:1':
      return '1 / 1';
  }
};

/**
 * 根据横竖屏比例获取默认视频分辨率
 */
export const getDefaultResolution = (ratio: AspectRatio): { width: number; height: number } => {
  switch (ratio) {
    case '16:9':
      return { width: 640, height: 320 };
    case '9:16':
      return { width: 320, height: 640 };
    case '1:1':
      return { width: 512, height: 512 };
  }
};

/**
 * getRefImagesForShot 的返回类型
 * hasTurnaround 标记是否包含了角色九宫格造型图，
 * 用于在提示词中告知 AI 如何正确解读多视角参考。
 */
export interface RefImagesResult {
  images: string[];
  hasTurnaround: boolean;
}

/**
 * 获取镜头的参考图片
 * 增强版：如果角色有九宫格造型图，将整张九宫格图作为额外参考传入，
 * 并通过 hasTurnaround 标记告知调用方，以便在提示词中正确描述。
 */
export const getRefImagesForShot = (
  shot: Shot,
  scriptData: ProjectState['scriptData'],
): RefImagesResult => {
  const referenceImages: string[] = [];
  let hasTurnaround = false;

  if (!scriptData) return { images: referenceImages, hasTurnaround };

  // 1. 场景参考图（环境/氛围） - 优先级最高
  const scene = scriptData.scenes.find((s) => String(s.id) === String(shot.sceneId));
  if (scene?.imageUrl) {
    referenceImages.push(scene.imageUrl);
  }

  // 2. 角色参考图（外观）
  if (shot.characters) {
    shot.characters.forEach((charId) => {
      const char = scriptData.characters.find((c) => String(c.id) === String(charId));
      if (!char) return;

      // 检查是否为此镜头选择了特定变体
      const varId = shot.characterVariations?.[charId];
      if (varId) {
        const variation = char.variations?.find((v) => v.id === varId);
        if (variation?.imageUrl) {
          referenceImages.push(variation.imageUrl);
          return;
        }
      }

      if (char.threeViewImageUrl) {
        referenceImages.push(char.threeViewImageUrl);
      } else if (char.imageUrl) {
        referenceImages.push(char.imageUrl);
      }

      // 如果角色有已完成的九宫格造型图，追加为额外参考
      if (char.turnaround?.status === 'completed' && char.turnaround.imageUrl) {
        referenceImages.push(char.turnaround.imageUrl);
        hasTurnaround = true;
      }
    });
  }

  // 3. 道具参考图（物品一致性）
  if (shot.props && scriptData.props) {
    shot.props.forEach((propId) => {
      const prop = scriptData.props.find((p) => String(p.id) === String(propId));
      if (prop?.imageUrl) {
        referenceImages.push(prop.imageUrl);
      }
    });
  }

  return { images: referenceImages, hasTurnaround };
};

/**
 * 获取镜头关联的道具信息（用于提示词注入）
 * hasImage 标记该道具是否有参考图，用于提示词中区分"参考图一致性"和"文字描述约束"
 */
export const getPropsInfoForShot = (
  shot: Shot,
  scriptData: ProjectState['scriptData'],
): { name: string; description: string; hasImage: boolean }[] => {
  if (!scriptData || !shot.props || !scriptData.props) return [];

  return shot.props
    .map((propId) => scriptData.props.find((p) => String(p.id) === String(propId)))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      name: p.name,
      description: p.description || p.visualPrompt || '',
      hasImage: !!p.imageUrl,
    }));
};

/**
 * 构建关键帧提示词 - 简化版
 * 为起始帧和结束帧生成基础的视觉描述
 * @param propsInfo - 可选，镜头关联的道具信息列表
 */
export const buildKeyframePrompt = async (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  chatCompletion?: (
    prompt: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    responseFormat?: 'json_object',
  ) => Promise<string>,
  model?: string,
  characterDescriptions?: { name: string; visualPrompt: string; hasImage: boolean }[],
  eraContext?: string,
  knowledgeBase?: string,
): Promise<string> => {
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  logger.info(LogCategory.AI, '🎨 [buildKeyframePrompt] visualStyle key:', [
    visualStyle,
    '→ resolved style:',
    stylePrompt.substring(0, 60),
  ]);
  const cameraGuide = await getCameraMovementCompositionGuide(
    cameraMovement,
    frameType,
    chatCompletion,
    model,
  );

  const isStart = frameType === 'start';
  const frameTypeLabel = isStart ? '起始' : '结束';
  const frameTypeZh = isStart ? '起始帧' : '结束帧';
  const frameFocus = isStart
    ? `场景建立与角色入场：侧重建构环境氛围、角色初始位置与姿态、动作发起的瞬间状态。`
    : `动作收束与情绪落点：侧重动作结果、角色反应与表情、画面最终定格、情绪高潮的尾声。`;

  const compositionNote = `帧类型: ${frameTypeLabel}帧，镜头运动: ${cameraMovement}
帧类型差异化约束: ${frameTypeZh}必须侧重"${isStart ? '起始——场景确立、角色初始状态、动作开端' : '结束——动作达成的结果、角色情绪落点、画面最终构图'}"
${frameFocus}
构图指导: ${cameraGuide}`;

  // 角色外观描述（仅作为"无参考图"时的文字回退）。
  // 注意：char.visualPrompt 是"角色定妆照/肖像"的生成提示词，内含专属机位、打光、标志性姿态等
  // 生成指令，绝不应原样注入关键帧提示词——它会与镜头场景冲突，导致角色姿态/构图错乱。
  // 当角色已提供参考图时，外观完全由参考图承载，【角色一致性要求】已强制"须与参考图完全一致"，
  // 因此此处只保留角色名提示；仅对"无参考图"的角色，才用 visualPrompt 做文字回退。
  let characterDescriptionsSection = '';
  if (characterDescriptions && characterDescriptions.length > 0) {
    const withoutImage = characterDescriptions.filter((c) => !c.hasImage);
    const withImageNames = characterDescriptions.filter((c) => c.hasImage).map((c) => c.name);

    const parts: string[] = [];

    if (withoutImage.length > 0) {
      const descLines = withoutImage
        .map(
          (c) =>
            `- ${c.name}: ${c.visualPrompt || '未提供详细描述'}（无参考图，请严格按文字描述还原外观）`,
        )
        .join('\n');
      parts.push(`【角色外观（文字回退）】CHARACTER APPEARANCE (TEXT FALLBACK)
以下角色未提供参考图，画面中人物外观请严格依照下列文字描述还原：
${descLines}`);
    }

    if (withImageNames.length > 0) {
      parts.push(
        `【角色外观】以下角色外观以参考图为准，人物须与各自参考图完全一致：${withImageNames.join('、')}`,
      );
    }

    characterDescriptionsSection = parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
  }

  // 角色一致性要求
  const characterConsistencyGuide = `【角色一致性要求】CHARACTER CONSISTENCY REQUIREMENTS
如果提供了角色参考图，画面中的人物外观必须严格遵循参考图：
• 面部特征、发型、服装、体型必须与参考图完全一致
• 这是最高优先级要求，不可妥协`;

  // 多角色构图要求：强制所有出场角色都清晰入镜，避免图生图时次要角色被漏掉
  const multiSubjectComposition =
    characterDescriptions && characterDescriptions.length >= 2
      ? `\n\n【多角色构图要求】MULTI-SUBJECT COMPOSITION
本镜头必须同时包含以下全部 ${characterDescriptions.length} 名角色，缺一不可，且每名角色都须完整、清晰入镜（不可仅以局部特写或背影呈现）：
${characterDescriptions.map((c) => `• ${c.name}`).join('\n')}
请合理安排各角色在画面中的空间位置（如左/中/右、前/后景层次），确保所有角色都真实出现在最终画面中，不要遗漏任何一名角色。`
      : '';

  // 道具一致性要求（仅在有道具时添加）
  let propConsistencyGuide = '';
  if (propsInfo && propsInfo.length > 0) {
    const propsWithImage = propsInfo.filter((p) => p.hasImage);
    const propsWithoutImage = propsInfo.filter((p) => !p.hasImage);

    const sections: string[] = [];

    if (propsWithImage.length > 0) {
      const list = propsWithImage.map((p) => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
以下道具已提供参考图，画面中出现时必须严格遵循：
• 外形、颜色、材质、细节必须与参考图一致
${list}`);
    }

    if (propsWithoutImage.length > 0) {
      const list = propsWithoutImage.map((p) => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`以下道具无参考图，请根据文字描述准确呈现：
${list}`);
    }

    propConsistencyGuide = '\n\n' + sections.join('\n\n');
  }

  const domainKnowledgeSections: string[] = [];
  if (eraContext) {
    domainKnowledgeSections.push(`【时代背景】Era Context
${eraContext}`);
  }
  if (knowledgeBase) {
    domainKnowledgeSections.push(`【领域知识】Domain Knowledge
${knowledgeBase}`);
  }
  const domainKnowledgeBlock =
    domainKnowledgeSections.length > 0 ? '\n\n' + domainKnowledgeSections.join('\n\n') : '';

  return `${basePrompt}

【视觉风格】Visual Style
${stylePrompt}

【构图】Composition
${compositionNote}
${domainKnowledgeBlock}
${characterConsistencyGuide}${multiSubjectComposition}${characterDescriptionsSection}${propConsistencyGuide}`;
};

/**
 * 构建关键帧提示词 - AI增强版
 * 使用LLM动态生成详细的技术规格和视觉细节
 * @param basePrompt - 基础提示词
 * @param visualStyle - 视觉风格
 * @param cameraMovement - 镜头运动
 * @param frameType - 帧类型
 * @param enhanceWithAI - 是否使用AI增强(默认true)
 * @param propsInfo - 可选，镜头关联的道具信息列表
 * @returns 返回完整的提示词或Promise
 */
export const buildKeyframePromptWithAI = async (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  enhanceWithAI: boolean = true,
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  characterDescriptions?: { name: string; visualPrompt: string; hasImage: boolean }[],
  eraContext?: string,
  knowledgeBase?: string,
): Promise<string> => {
  // 如果不需要AI增强,直接使用模板构建
  if (!enhanceWithAI) {
    return await buildKeyframePrompt(
      basePrompt,
      visualStyle,
      cameraMovement,
      frameType,
      propsInfo,
      undefined,
      undefined,
      characterDescriptions,
      eraContext,
      knowledgeBase,
    );
  }

  // 动态导入aiService以避免循环依赖
  try {
    const { enhanceKeyframePrompt } = await import('../../services/aiService');
    const enhanced = await enhanceKeyframePrompt(
      basePrompt,
      visualStyle,
      cameraMovement,
      frameType,
      undefined,
      propsInfo,
    );
    return enhanced;
  } catch (error) {
    logger.error(LogCategory.AI, 'AI增强失败,使用基础提示词:', error);
    return await buildKeyframePrompt(
      basePrompt,
      visualStyle,
      cameraMovement,
      frameType,
      propsInfo,
      undefined,
      undefined,
      undefined,
      eraContext,
      knowledgeBase,
    );
  }
};

/**
 * 构建视频生成提示词
 * @param nineGrid - 可选，如果首帧来自九宫格整图，则使用九宫格分镜模式的视频提示词
 * @param videoDuration - 视频总时长（秒），用于计算九宫格模式下每个面板的停留时间
 */
export const buildVideoPrompt = (
  actionSummary: string,
  cameraMovement: string,
  videoModel:
    | 'sora-2'
    | 'veo'
    | 'veo_3_1-fast'
    | 'veo_3_1-fast-4K'
    | 'veo_3_1_t2v_fast_landscape'
    | 'veo_3_1_t2v_fast_portrait'
    | 'veo_3_1_i2v_s_fast_fl_landscape'
    | 'veo_3_1_i2v_s_fast_fl_portrait'
    | string,
  language: string,
  nineGrid?: NineGridData,
  videoDuration?: number,
  cameraChoreography?: CameraChoreography,
  eraContext?: string,
  knowledgeBase?: string,
): string => {
  const isChinese = language === '中文' || language === 'Chinese';
  const isAsyncVideoModel =
    videoModel === 'sora-2' || videoModel.toLowerCase().startsWith('veo_3_1-fast');

  // 如果有结构化运镜编排，替换 cameraMovement 为渲染后的运镜段落
  let effectiveCameraMovement = cameraMovement;
  if (cameraChoreography) {
    effectiveCameraMovement = renderCameraChoreographyPrompt(
      cameraChoreography,
      actionSummary,
      videoDuration || 8,
    );
  }

  // 领域知识注入
  const domainKnowledgeParts: string[] = [];
  if (eraContext) domainKnowledgeParts.push(`Era Context: ${eraContext}`);
  if (knowledgeBase) domainKnowledgeParts.push(`Domain Knowledge: ${knowledgeBase}`);
  const domainKnowledgeBlock =
    domainKnowledgeParts.length > 0 ? `\n\n${domainKnowledgeParts.join('\n')}` : '';

  // 九宫格分镜模式：有九宫格数据时，使用异步模型专用精简提示词
  // 保留9个面板的景别/角度顺序，但 description 截断到60字符以内，避免超过 Sora-2 的 8192 字符限制
  if (nineGrid && nineGrid.panels.length > 0 && isAsyncVideoModel) {
    const DESC_MAX_LEN = 60;
    const panelDescriptions = nineGrid.panels
      .map((p, idx) => {
        const desc =
          p.description.length > DESC_MAX_LEN
            ? p.description.slice(0, DESC_MAX_LEN) + '...'
            : p.description;
        return `${idx + 1}. ${p.shotSize}/${p.cameraAngle} - ${desc}`;
      })
      .join('\n');

    const totalDuration = videoDuration || 8;
    const secondsPerPanel = Math.max(0.5, Math.round((totalDuration / 9) * 10) / 10);

    const templateGroup = VIDEO_PROMPT_TEMPLATES.sora2NineGrid;

    const template = isChinese ? templateGroup.chinese : templateGroup.english;

    return (
      template
        .replace('{actionSummary}', actionSummary)
        .replace('{panelDescriptions}', panelDescriptions)
        .replace(/\{secondsPerPanel\}/g, String(secondsPerPanel))
        .replace('{cameraMovement}', effectiveCameraMovement)
        .replace('{language}', language) + domainKnowledgeBlock
    );
  }

  // 普通模式
  if (isAsyncVideoModel) {
    const template = isChinese
      ? VIDEO_PROMPT_TEMPLATES.sora2.chinese
      : VIDEO_PROMPT_TEMPLATES.sora2.english;

    return (
      template
        .replace('{actionSummary}', actionSummary)
        .replace('{cameraMovement}', effectiveCameraMovement)
        .replace('{language}', language) + domainKnowledgeBlock
    );
  } else {
    return (
      VIDEO_PROMPT_TEMPLATES.veo.simple
        .replace('{actionSummary}', actionSummary)
        .replace('{cameraMovement}', effectiveCameraMovement)
        .replace('{language}', isChinese ? '中文' : language) + domainKnowledgeBlock
    );
  }
};

/**
 * 从现有提示词中提取基础部分（移除追加的样式/规格段落）
 * 支持三种格式：
 *   - 无分隔旧格式: "...\n\nVisual Style:..."
 *   - 分隔线旧格式: "...\n━━━...\n【视觉风格】..."
 *   - 新格式:       "...\n\n【视觉风格】Visual Style..."
 */
export const extractBasePrompt = (fullPrompt: string, fallback: string): string => {
  // 新格式：\n\n【视觉风格】 开头
  const newMatch = fullPrompt.match(/\n\n【视觉风格】/);
  if (newMatch && newMatch.index && newMatch.index > 0) {
    return fullPrompt.substring(0, newMatch.index).trim();
  }
  // 旧格式：━━━ 分隔线
  const sepMatch = fullPrompt.match(/\n━{2,}[\s\S]*?\n【视觉风格】/);
  if (sepMatch && sepMatch.index && sepMatch.index > 0) {
    return fullPrompt.substring(0, sepMatch.index).trim();
  }
  // 兼容：\n\nVisual Style:
  const visualStyleIndex = fullPrompt.indexOf('\n\nVisual Style:');
  if (visualStyleIndex > 0) {
    return fullPrompt.substring(0, visualStyleIndex).trim();
  }
  return fullPrompt || fallback;
};

/**
 * 生成唯一ID
 */
export const generateId = (prefix: string): string => {
  return `${prefix}-${Date.now()}`;
};

/**
 * 延迟执行
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 图片文件转base64
 */
export const convertImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      resolve(event.target?.result as string);
    };
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    reader.readAsDataURL(file);
  });
};

/**
 * 创建关键帧对象
 */
export const createKeyframe = (
  id: string,
  type: 'start' | 'end',
  visualPrompt: string,
  imageUrl?: string,
  status: 'pending' | 'generating' | 'completed' | 'failed' = 'pending',
  visualPromptSource?: 'auto' | 'manual',
): Keyframe => {
  return {
    id,
    type,
    visualPrompt,
    imageUrl,
    status,
    visualPromptSource,
  };
};

/**
 * 更新镜头中的关键帧
 */
export const updateKeyframeInShot = (
  shot: Shot,
  type: 'start' | 'end',
  keyframe: Keyframe,
): Shot => {
  const newKeyframes = [...(shot.keyframes || [])];
  const idx = newKeyframes.findIndex((k) => k.type === type);

  if (idx >= 0) {
    newKeyframes[idx] = keyframe;
  } else {
    newKeyframes.push(keyframe);
  }

  return { ...shot, keyframes: newKeyframes };
};

/**
 * 生成子镜头ID数组
 * @param originalShotId - 原始镜头ID（如 "shot-1"）
 * @param count - 子镜头数量
 * @returns 子镜头ID数组（如 ["shot-1-1", "shot-1-2", "shot-1-3"]）
 */
export const generateSubShotIds = (originalShotId: string, count: number): string[] => {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`${originalShotId}-${i}`);
  }
  return ids;
};

/** AI 返回的镜头拆分子镜头数据结构 */
interface SubShotData {
  actionSummary: string;
  cameraMovement: string;
  shotSize?: string;
  visualFocus?: string;
  keyframes?: Array<{ type?: string; visualPrompt?: string }>;
}

/**
 * 创建子镜头对象
 * @param originalShot - 原始镜头对象
 * @param subShotData - AI返回的子镜头数据
 * @param subShotId - 子镜头ID
 * @returns 新的Shot对象
 */
export const createSubShot = (
  originalShot: Shot,
  subShotData: SubShotData,
  subShotId: string,
): Shot => {
  // 处理关键帧数组
  const keyframes: Keyframe[] = [];
  if (subShotData.keyframes && Array.isArray(subShotData.keyframes)) {
    subShotData.keyframes.forEach((kf) => {
      const type = kf.type;
      const visualPrompt = kf.visualPrompt;
      if (type && visualPrompt) {
        keyframes.push({
          id: `${subShotId}-${type}`, // 如 "shot-1-1-start", "shot-1-1-end"
          type: type as Keyframe['type'],
          visualPrompt,
          status: 'pending', // 初始状态为pending，等待用户生成图像
        });
      }
    });
  }

  return {
    id: subShotId,
    sceneId: originalShot.sceneId, // 继承原镜头的场景ID
    actionSummary: subShotData.actionSummary, // 使用AI生成的动作描述
    dialogue: undefined, // 不继承对白 - 对白通常只在特定子镜头中出现，由AI在actionSummary中体现
    cameraMovement: subShotData.cameraMovement, // 使用AI生成的镜头运动
    shotSize: subShotData.shotSize, // 使用AI生成的景别
    characters: [...originalShot.characters], // 继承角色列表
    characterVariations: { ...originalShot.characterVariations }, // 继承角色变体映射
    keyframes: keyframes, // 使用AI生成的关键帧（包含visualPrompt）
    videoModel: originalShot.videoModel, // 继承视频模型设置
  };
};

/**
 * 用子镜头数组替换原镜头
 * @param shots - 原始镜头数组
 * @param originalShotId - 要替换的原镜头ID
 * @param subShots - 子镜头数组
 * @returns 更新后的镜头数组
 */
export const replaceShotWithSubShots = (
  shots: Shot[],
  originalShotId: string,
  subShots: Shot[],
): Shot[] => {
  const originalIndex = shots.findIndex((s) => s.id === originalShotId);

  if (originalIndex === -1) {
    logger.error(LogCategory.AI, `未找到ID为 ${originalShotId} 的镜头`);
    return shots;
  }

  // 创建新数组，在原位置插入子镜头
  const newShots = [
    ...shots.slice(0, originalIndex),
    ...subShots,
    ...shots.slice(originalIndex + 1),
  ];

  return newShots;
};

// ============================================
// 九宫格分镜预览工具函数（高级功能）
// ============================================

/**
 * 将选中的九宫格面板描述转换为首帧提示词
 * 将九宫格中选定的视角信息融合到首帧提示词中
 * @param panel - 选中的九宫格面板
 * @param actionSummary - 原始动作描述
 * @param visualStyle - 视觉风格
 * @param cameraMovement - 原始镜头运动
 * @returns 构建好的首帧提示词
 */
export const buildPromptFromNineGridPanel = async (
  panel: NineGridPanel,
  actionSummary: string,
  visualStyle: string,
  cameraMovement: string,
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  chatCompletion?: (
    prompt: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    responseFormat?: 'json_object',
  ) => Promise<string>,
  model?: string,
): Promise<string> => {
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;

  // 角色一致性要求
  const characterConsistencyGuide = `【角色一致性要求】CHARACTER CONSISTENCY REQUIREMENTS
如果提供了角色参考图，画面中的人物外观必须严格遵循参考图：
• 面部特征、发型、服装、体型必须与参考图完全一致
• 这是最高优先级要求，不可妥协`;

  // 道具一致性要求（仅在有道具时添加）
  let propConsistencyGuide = '';
  if (propsInfo && propsInfo.length > 0) {
    const propsWithImage = propsInfo.filter((p) => p.hasImage);
    const propsWithoutImage = propsInfo.filter((p) => !p.hasImage);

    const sections: string[] = [];

    if (propsWithImage.length > 0) {
      const list = propsWithImage.map((p) => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
以下道具已提供参考图，画面中出现时必须严格遵循：
• 外形、颜色、材质、细节必须与参考图一致
${list}`);
    }

    if (propsWithoutImage.length > 0) {
      const list = propsWithoutImage.map((p) => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`以下道具无参考图，请根据文字描述准确呈现：
${list}`);
    }

    propConsistencyGuide = '\n\n' + sections.join('\n\n');
  }

  const startGuide = await getCameraMovementCompositionGuide(
    cameraMovement,
    'start',
    chatCompletion,
    model,
  );

  return `${panel.description}

【来源】九宫格分镜预览 - ${NINE_GRID.positionLabels[panel.index]}
【景别】${panel.shotSize}
【机位角度】${panel.cameraAngle}
【原始动作】${actionSummary}

【视觉风格】Visual Style
${stylePrompt}

【构图】Composition
帧类型: 起始帧，镜头运动: ${cameraMovement}
构图指导: ${startGuide}

${characterConsistencyGuide}${propConsistencyGuide}`;
};

/**
 * 从九宫格图片中裁剪出指定面板的图片
 * 将 3x3 网格中的某一格裁剪为独立的 base64 图片
 * @param nineGridImageUrl - 九宫格整图 (base64)
 * @param panelIndex - 面板索引 (0-8)
 * @returns 裁剪后的 base64 图片
 */
export const cropPanelFromNineGrid = (
  nineGridImageUrl: string,
  panelIndex: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'));
          return;
        }

        // 计算裁剪区域：3x3 网格
        const col = panelIndex % 3; // 列 (0, 1, 2)
        const row = Math.floor(panelIndex / 3); // 行 (0, 1, 2)

        const panelWidth = img.width / 3;
        const panelHeight = img.height / 3;

        const sx = col * panelWidth;
        const sy = row * panelHeight;

        // 设置输出 canvas 尺寸为单个面板大小
        canvas.width = Math.round(panelWidth);
        canvas.height = Math.round(panelHeight);

        // 裁剪并绘制
        ctx.drawImage(
          img,
          Math.round(sx),
          Math.round(sy), // 源坐标
          Math.round(panelWidth),
          Math.round(panelHeight), // 源尺寸
          0,
          0, // 目标坐标
          canvas.width,
          canvas.height, // 目标尺寸
        );

        // 转换为 base64
        const croppedBase64 = canvas.toDataURL('image/png');
        resolve(croppedBase64);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error('九宫格图片加载失败'));
    };
    img.src = nineGridImageUrl;
  });
};

/**
 * 判断关键帧是否启用 IPA 多参考融合。
 *
 * 决策：当参考图 >= 2 张（场景 + 至少一张角色/道具图）且镜头关联了角色时，
 * 启用 image2ipastyletransfer（IPA）做多参考图融合。
 *
 * 原因：image2image 以 image1（场景图）为绝对底图、其余参考图仅为松散参考，
 * 多角色场景下次要角色常被弱化/忽略；IPA 专为"多参考外貌融合"设计，
 * 能保证场景 + 多个角色定妆照按要求合成进同一张画面。
 *
 * @param referenceImageCount 参考图数量（场景图 + 角色图 + 道具图）
 * @param characterCount 镜头关联的角色数量
 */
export const shouldUseIPAFusion = (
  referenceImageCount: number,
  characterCount: number,
): boolean => {
  return referenceImageCount >= 2 && characterCount >= 1;
};

/**
 * 为真人电影风格的关键帧 prompt 防御性追加"风格锁定"段。
 *
 * 用途：关键帧走 IPA 多参考融合时，参考图（定妆照/场景）可能携带非写实风格信号，
 * 导致输出从"真人电影"漂移到插画/二次元。无论 prompt 来自基础版还是 AI 增强版，
 * 都在末尾强制锚定项目的 live-action 写实风格，对抗漂移。
 *
 * 若 prompt 已包含真人写实关键词（photorealistic / real human actors 等），
 * 说明风格段已生效，则不重复追加，避免提示词冗余。
 *
 * @param prompt 已构建的关键帧提示词
 * @param visualStyle 视觉风格 key（如 'live-action'）
 * @returns 追加风格锁定段后的提示词
 */
export const appendStyleAnchor = (prompt: string, visualStyle: string): string => {
  const styleAnchor = VISUAL_STYLE_PROMPTS[visualStyle];
  if (!styleAnchor) return prompt;
  if (/photorealistic|real human actors|live-action photographic/i.test(prompt)) {
    return prompt;
  }
  return `${prompt}\n\n【风格锁定】STYLE LOCK (最高优先级)\n${styleAnchor}`;
};

/**
 * 取镜头的场景参考图（用于两阶段合成的第一阶段底图）。
 * 与 getRefImagesForShot 不同，这里只关心场景，不混入角色/道具图。
 */
export const getSceneImageForShot = (
  shot: Shot,
  scriptData: ProjectState['scriptData'],
): string | undefined => {
  if (!scriptData) return undefined;
  const scene = scriptData.scenes.find((s) => String(s.id) === String(shot.sceneId));
  return scene?.imageUrl;
};

/**
 * 为 N 个登场角色分配画面站位。
 * inpaint 接口无遮罩、只能靠文字描述位置，因此预先给出离散站位描述。
 */
export const assignCharacterLayout = (count: number): string[] => {
  const presets: Record<number, string[]> = {
    1: ['center foreground'],
    2: ['left side of the frame', 'right side of the frame'],
    3: ['left side of the frame', 'center of the frame', 'right side of the frame'],
  };
  if (presets[count]) return presets[count];
  // 超过 3 人：按从左到右均匀分布到左/中/右三栏
  return Array.from({ length: count }, (_, i) => {
    const third = Math.min(2, Math.floor((i / count) * 3));
    return ['left side', 'center', 'right side'][third] + ' of the frame';
  });
};

/**
 * 肖像生成提示词中需要剥离的"专属指令"正则。
 * 这些指令（full body / studio lighting / signature pose 等）是给"生成定妆照"用的，
 * 放到 inpaint 补绘里会干扰"自然地嵌入场景"，须剔除。
 */
const APPEARANCE_STRIP_PATTERNS: RegExp[] = [
  /full[\s-]?body(?:\s+portrait)?/gi,
  /\bportrait\b/gi,
  /studio\s+lighting/gi,
  /signature\s+pose/gi,
  /concept\s+art/gi,
  /character\s+sheet/gi,
  /white\s+background/gi,
  /plain\s+background/gi,
  /front(?:al)?\s+view/gi,
  /\b8k\b|\b4k\b|uhd/gi,
  /highly\s+detailed/gi,
  /hyperrealistic\s+render/gi,
];

/**
 * 从角色定妆照提示词中提取"外貌描述"，剥离肖像生成专属指令，
 * 用于 inpaint 补绘时作为文字外貌依据（inpaint 接口无法接收参考图）。
 */
export const extractAppearanceText = (visualPrompt: string): string => {
  if (!visualPrompt) return '';
  let text = visualPrompt;
  APPEARANCE_STRIP_PATTERNS.forEach((p) => {
    text = text.replace(p, ' ');
  });
  text = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,，.])/g, '$1')
    .trim();
  return text || visualPrompt;
};

/**
 * 构建"空场景"提示词：仅环境、无人物。
 * 用于两阶段合成第一阶段，锁定真人电影风格，作为后续 inpaint 补绘角色的底图。
 * 复用 buildKeyframePrompt 的构图/风格结构，但不含角色段落，并强制"无人"。
 */
export const buildEmptyScenePrompt = async (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
  eraContext?: string,
  knowledgeBase?: string,
): Promise<string> => {
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  const cameraGuide = await getCameraMovementCompositionGuide(cameraMovement, frameType);
  const isStart = frameType === 'start';
  const frameTypeZh = isStart ? '起始帧' : '结束帧';
  const frameFocus = isStart
    ? '场景建立：侧重建构环境氛围、空间层次与光源方向，为即将入场的角色预留构图空间。'
    : '动作收束：侧重环境的最终状态与情绪落点，画面定格在空镜环境。';
  const compositionNote = `帧类型: ${frameTypeZh}帧，镜头运动: ${cameraMovement}\n${frameFocus}\n构图指导: ${cameraGuide}`;

  let propConsistencyGuide = '';
  if (propsInfo && propsInfo.length > 0) {
    const list = propsInfo.map((p) => `- ${p.name}: ${p.description}`).join('\n');
    propConsistencyGuide = `\n\n【道具】PROPS\n以下道具若出现于场景中须准确呈现：\n${list}`;
  }

  const domainKnowledgeSections: string[] = [];
  if (eraContext) domainKnowledgeSections.push(`【时代背景】Era Context\n${eraContext}`);
  if (knowledgeBase) domainKnowledgeSections.push(`【领域知识】Domain Knowledge\n${knowledgeBase}`);
  const domainKnowledgeBlock =
    domainKnowledgeSections.length > 0 ? '\n\n' + domainKnowledgeSections.join('\n\n') : '';

  return `${basePrompt}

【视觉风格】Visual Style
${stylePrompt}

【构图】Composition
${compositionNote}${domainKnowledgeBlock}${propConsistencyGuide}

【空场景指令】EMPTY SCENE (MANDATORY)
This is an ESTABLISHING ENVIRONMENT shot. Render the scene COMPLETELY EMPTY with NO human figures, NO people, NO characters. Only environment, architecture, lighting, atmosphere and any inanimate props. Do not include any person.`;
};

/**
 * 构建单个角色的 inpaint 补绘提示词。
 * inpaint 接口无遮罩、无参考图，因此外貌完全由文字描述承载，
 * 并显式要求"仅添加该角色、不改背景/光照/其他已有主体"，避免破坏底图。
 */
export const buildCharacterInpaintPrompt = (params: {
  name: string;
  appearanceText: string;
  position: string;
  visualStyle: string;
  frameType: 'start' | 'end';
}): string => {
  const styleAnchor = VISUAL_STYLE_PROMPTS[params.visualStyle] || '';
  const frameFocus =
    params.frameType === 'start'
      ? 'This is the establishing start frame: the character should show their initial posture and the beginning of their action.'
      : 'This is the closing end frame: the character should show their resolved posture and final expression.';
  return `Add the character "${params.name}" into the scene, positioned at the ${params.position}.
The person must be rendered NATURALLY within this existing cinematic scene (ignore any standalone portrait / studio / background directives in the description below).

Appearance to render: ${params.appearanceText}

${frameFocus}
Lighting must match the existing scene. Photorealistic, real human actor, live-action film look.
Do NOT alter the background, environment, existing lighting, or any other subject already in the image — only add this one character.
${styleAnchor ? `\nStyle anchor: ${styleAnchor}` : ''}`;
};

/** 两阶段合成所需的外部生成函数（注入以便单元测试 mock 真实 API） */
export interface KeyframeCompositeDeps {
  generateScene: (prompt: string, sceneRefs: string[], negativePrompt?: string) => Promise<string>;
  inpaint: (image: string, prompt: string) => Promise<string>;
  onStage?: (stage: string) => void;
}

export interface KeyframeCompositeParams {
  basePrompt: string;
  visualStyle: string;
  cameraMovement: string;
  frameType: 'start' | 'end';
  sceneImage?: string;
  characterDescriptions: { name: string; visualPrompt: string; hasImage: boolean }[];
  propsInfo?: { name: string; description: string; hasImage: boolean }[];
  eraContext?: string;
  knowledgeBase?: string;
  negativePrompt?: string;
  deps: KeyframeCompositeDeps;
}

/**
 * 关键帧两阶段合成（方案 B）：
 *   阶段 1：生成"无人的真人空场景"底图（image2image / txt2image）；
 *   阶段 2：对每个角色逐个 image2inpaint 把人补绘进画面。
 *
 * 设计要点：
 * - Drama Backend 的 image2inpaint 是无遮罩、无参考图的提示词驱动接口，
 *   故角色外貌由文字描述（visualPrompt 提炼）承载；
 * - 底图为已锁定真人风格的场景，在其上叠加人物，风格漂移风险远低于 IPA 多参考融合；
 * - 角色逐个可控、必入镜；通过 deps 注入生成函数，便于单元测试。
 */
export const generateKeyframeComposite = async (
  params: KeyframeCompositeParams,
): Promise<string> => {
  const { characterDescriptions, sceneImage, deps } = params;

  // 阶段 1：确定底图。
  // 关键修正：如果用户已经生成好场景图（sceneImage 存在），直接复用它作为底图，
  // 不再用 "EMPTY SCENE" 提示词把场景重新画一遍（那会浪费一次生成、还可能改掉用户
  // 看中的场景效果）。仅当完全没有场景图时，才兜底生成"无人的真人空场景"。
  let current: string;
  if (sceneImage) {
    deps.onStage?.(`直接使用已生成的场景图作为底图，开始补绘角色…`);
    current = sceneImage;
  } else {
    const totalStages = characterDescriptions.length + 1;
    deps.onStage?.(`阶段 1/${totalStages}：生成真人空场景…`);
    current = await deps.generateScene(
      await buildEmptyScenePrompt(
        params.basePrompt,
        params.visualStyle,
        params.cameraMovement,
        params.frameType,
        params.propsInfo,
        params.eraContext,
        params.knowledgeBase,
      ),
      [],
      params.negativePrompt,
    );
  }

  const layout = assignCharacterLayout(characterDescriptions.length);
  const totalStages = sceneImage ? characterDescriptions.length : characterDescriptions.length + 1;
  for (let i = 0; i < characterDescriptions.length; i++) {
    const c = characterDescriptions[i];
    const appearance = extractAppearanceText(c.visualPrompt) || c.name;
    const inpaintPrompt = buildCharacterInpaintPrompt({
      name: c.name,
      appearanceText: appearance,
      position: layout[i],
      visualStyle: params.visualStyle,
      frameType: params.frameType,
    });
    // 有场景图时阶段编号从 1 开始（仅角色补绘）；无场景图时从 2 开始（含前面的生成阶段）
    const stageNum = sceneImage ? i + 1 : i + 2;
    deps.onStage?.(`阶段 ${stageNum}/${totalStages}：补绘角色「${c.name}」…`);
    current = await deps.inpaint(current, inpaintPrompt);
  }

  return current;
};

/**
 * IPA 关键帧验证：把"场景图 + 多张角色三视图"按指定分工送进 image2ipastyletransfer。
 *
 * 字段映射（对应 api.md 的 image2ipastyletransfer）：
 *   image1  = 场景概念图
 *   image2  = 角色1 三视图（无三视图时回退定妆照 imageUrl）
 *   image3  = 角色2 三视图（无三视图时回退定妆照 imageUrl）
 *   ref_image = 场景概念图（作为风格参考，与 image1 内容参考同源）
 *
 * 注意：不使用 getRefImagesForShot —— 它会把 turnaround / props 也塞进参考数组，
 * 破坏 image2=角色1 / image3=角色2 的固定分工；此函数独立构造，顺序严格可控。
 */
export interface IPACharacterRef {
  name: string;
  threeViewImageUrl?: string;
  imageUrl?: string;
}

export interface IPAKeyframeRequest {
  prompt: string;
  referenceImages: string[]; // [场景, 角色1, 角色2, ...]
  refImage: string; // 场景概念图
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  resourceType: 'keyframe';
  resourceId: string;
  isIPAStyleTransfer: true;
}

export const buildIPAKeyframeRequest = (params: {
  basePrompt: string;
  sceneImage: string; // 场景概念图 → image1 + ref_image
  characterRefs: IPACharacterRef[];
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  visualStyle?: string;
  shotId: string;
}): IPAKeyframeRequest => {
  const referenceImages = [
    params.sceneImage,
    ...params.characterRefs.map((c) => c.threeViewImageUrl || c.imageUrl || ''),
  ].filter(Boolean);

  // 真人电影风格锚定：对抗 IPA 对参考图风格的复制。
  // 关键帧 prompt 一般已含 live-action 段，此处幂等加固。
  const prompt = appendStyleAnchor(params.basePrompt, params.visualStyle || 'live-action');

  return {
    prompt,
    referenceImages,
    refImage: params.sceneImage,
    negativePrompt: params.negativePrompt,
    aspectRatio: params.aspectRatio || '16:9',
    resourceType: 'keyframe',
    resourceId: params.shotId,
    isIPAStyleTransfer: true,
  };
};
