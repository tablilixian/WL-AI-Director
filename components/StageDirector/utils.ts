import { Shot, ProjectState, Keyframe, NineGridPanel, NineGridData, AspectRatio, CameraChoreography, renderCameraChoreographyPrompt } from '../../types';

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
    case '16:9': return '16 / 9';
    case '9:16': return '9 / 16';
    case '1:1': return '1 / 1';
  }
};

/**
 * 根据横竖屏比例获取默认视频分辨率
 */
export const getDefaultResolution = (ratio: AspectRatio): { width: number; height: number } => {
  switch (ratio) {
    case '16:9': return { width: 1920, height: 1088 };
    case '9:16': return { width: 1088, height: 1920 };
    case '1:1': return { width: 1088, height: 1088 };
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
export const getRefImagesForShot = (shot: Shot, scriptData: ProjectState['scriptData']): RefImagesResult => {
  const referenceImages: string[] = [];
  let hasTurnaround = false;
  
  if (!scriptData) return { images: referenceImages, hasTurnaround };
  
  // 1. 场景参考图（环境/氛围） - 优先级最高
  const scene = scriptData.scenes.find(s => String(s.id) === String(shot.sceneId));
  if (scene?.imageUrl) {
    referenceImages.push(scene.imageUrl);
  }

  // 2. 角色参考图（外观）
  if (shot.characters) {
    shot.characters.forEach(charId => {
      const char = scriptData.characters.find(c => String(c.id) === String(charId));
      if (!char) return;

      // 检查是否为此镜头选择了特定变体
      const varId = shot.characterVariations?.[charId];
      if (varId) {
        const variation = char.variations?.find(v => v.id === varId);
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
    shot.props.forEach(propId => {
      const prop = scriptData.props.find(p => String(p.id) === String(propId));
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
export const getPropsInfoForShot = (shot: Shot, scriptData: ProjectState['scriptData']): { name: string; description: string; hasImage: boolean }[] => {
  if (!scriptData || !shot.props || !scriptData.props) return [];
  
  return shot.props
    .map(propId => scriptData.props.find(p => String(p.id) === String(propId)))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map(p => ({ name: p.name, description: p.description || p.visualPrompt || '', hasImage: !!p.imageUrl }));
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
  chatCompletion?: (prompt: string, model?: string, temperature?: number, maxTokens?: number, responseFormat?: string) => Promise<string>,
  model?: string,
  characterDescriptions?: { name: string; visualPrompt: string; hasImage: boolean }[],
  eraContext?: string,
  knowledgeBase?: string
): Promise<string> => {
  const stylePrompt = VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
  console.log('🎨 [buildKeyframePrompt] visualStyle key:', visualStyle, '→ resolved style:', stylePrompt.substring(0, 60));
  const cameraGuide = await getCameraMovementCompositionGuide(cameraMovement, frameType, chatCompletion, model);

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

  // 角色外观描述（文字回退，当 API 不支持参考图时保证一致性）
  let characterDescriptionsSection = '';
  if (characterDescriptions && characterDescriptions.length > 0) {
    const descLines = characterDescriptions.map(c =>
      `- ${c.name}: ${c.visualPrompt || '未提供详细描述'}${c.hasImage ? '（已提供参考图）' : ''}`
    ).join('\n');
    characterDescriptionsSection = `\n\n【角色外观】CHARACTER APPEARANCE
当前镜头涉及以下角色，外观描述必须严格遵循：
${descLines}`;
  }

  // 角色一致性要求
  const characterConsistencyGuide = `【角色一致性要求】CHARACTER CONSISTENCY REQUIREMENTS
如果提供了角色参考图，画面中的人物外观必须严格遵循参考图：
• 面部特征、发型、服装、体型必须与参考图完全一致
• 这是最高优先级要求，不可妥协`;

  // 道具一致性要求（仅在有道具时添加）
  let propConsistencyGuide = '';
  if (propsInfo && propsInfo.length > 0) {
    const propsWithImage = propsInfo.filter(p => p.hasImage);
    const propsWithoutImage = propsInfo.filter(p => !p.hasImage);

    let sections: string[] = [];

    if (propsWithImage.length > 0) {
      const list = propsWithImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
以下道具已提供参考图，画面中出现时必须严格遵循：
• 外形、颜色、材质、细节必须与参考图一致
${list}`);
    }

    if (propsWithoutImage.length > 0) {
      const list = propsWithoutImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
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
  const domainKnowledgeBlock = domainKnowledgeSections.length > 0
    ? '\n\n' + domainKnowledgeSections.join('\n\n')
    : '';

  return `${basePrompt}

【视觉风格】Visual Style
${stylePrompt}

【构图】Composition
${compositionNote}
${domainKnowledgeBlock}
${characterConsistencyGuide}${characterDescriptionsSection}${propConsistencyGuide}`;
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
  knowledgeBase?: string
): Promise<string> => {
  // 如果不需要AI增强,直接使用模板构建
  if (!enhanceWithAI) {
    return await buildKeyframePrompt(basePrompt, visualStyle, cameraMovement, frameType, propsInfo, undefined, undefined, characterDescriptions, eraContext, knowledgeBase);
  }
  
  // 动态导入aiService以避免循环依赖
  try {
    const { enhanceKeyframePrompt } = await import('../../services/aiService');
    const enhanced = await enhanceKeyframePrompt(basePrompt, visualStyle, cameraMovement, frameType, undefined, propsInfo);
    return enhanced;
  } catch (error) {
    logger.error(LogCategory.AI, 'AI增强失败,使用基础提示词:', error);
    return await buildKeyframePrompt(basePrompt, visualStyle, cameraMovement, frameType, propsInfo, undefined, undefined, undefined, eraContext, knowledgeBase);
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
  videoModel: 'sora-2' | 'veo' | 'veo_3_1-fast' | 'veo_3_1-fast-4K' | 'veo_3_1_t2v_fast_landscape' | 'veo_3_1_t2v_fast_portrait' | 'veo_3_1_i2v_s_fast_fl_landscape' | 'veo_3_1_i2v_s_fast_fl_portrait' | string,
  language: string,
  nineGrid?: NineGridData,
  videoDuration?: number,
  cameraChoreography?: CameraChoreography,
  eraContext?: string,
  knowledgeBase?: string
): string => {
  const isChinese = language === '中文' || language === 'Chinese';
  const isAsyncVideoModel = videoModel === 'sora-2' || videoModel.toLowerCase().startsWith('veo_3_1-fast');

  // 如果有结构化运镜编排，替换 cameraMovement 为渲染后的运镜段落
  let effectiveCameraMovement = cameraMovement;
  if (cameraChoreography) {
    effectiveCameraMovement = renderCameraChoreographyPrompt(cameraChoreography, actionSummary, videoDuration || 8);
  }

  // 领域知识注入
  const domainKnowledgeParts: string[] = [];
  if (eraContext) domainKnowledgeParts.push(`Era Context: ${eraContext}`);
  if (knowledgeBase) domainKnowledgeParts.push(`Domain Knowledge: ${knowledgeBase}`);
  const domainKnowledgeBlock = domainKnowledgeParts.length > 0
    ? `\n\n${domainKnowledgeParts.join('\n')}`
    : '';

  // 九宫格分镜模式：有九宫格数据时，使用异步模型专用精简提示词
  // 保留9个面板的景别/角度顺序，但 description 截断到60字符以内，避免超过 Sora-2 的 8192 字符限制
  if (nineGrid && nineGrid.panels.length > 0 && isAsyncVideoModel) {
    const DESC_MAX_LEN = 60;
    const panelDescriptions = nineGrid.panels.map((p, idx) => {
      const desc = p.description.length > DESC_MAX_LEN 
        ? p.description.slice(0, DESC_MAX_LEN) + '...' 
        : p.description;
      return `${idx + 1}. ${p.shotSize}/${p.cameraAngle} - ${desc}`;
    }).join('\n');
    
    const totalDuration = videoDuration || 8;
    const secondsPerPanel = Math.max(0.5, Math.round((totalDuration / 9) * 10) / 10);
    
    const templateGroup = VIDEO_PROMPT_TEMPLATES.sora2NineGrid;
    
    const template = isChinese ? templateGroup.chinese : templateGroup.english;
    
    return template
      .replace('{actionSummary}', actionSummary)
      .replace('{panelDescriptions}', panelDescriptions)
      .replace(/\{secondsPerPanel\}/g, String(secondsPerPanel))
      .replace('{cameraMovement}', effectiveCameraMovement)
      .replace('{language}', language) + domainKnowledgeBlock;
  }
  
  // 普通模式
  if (isAsyncVideoModel) {
    const template = isChinese 
      ? VIDEO_PROMPT_TEMPLATES.sora2.chinese 
      : VIDEO_PROMPT_TEMPLATES.sora2.english;
    
    return template
      .replace('{actionSummary}', actionSummary)
      .replace('{cameraMovement}', effectiveCameraMovement)
      .replace('{language}', language) + domainKnowledgeBlock;
  } else {
    return VIDEO_PROMPT_TEMPLATES.veo.simple
      .replace('{actionSummary}', actionSummary)
      .replace('{cameraMovement}', effectiveCameraMovement)
      .replace('{language}', isChinese ? '中文' : language) + domainKnowledgeBlock;
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
  return new Promise(resolve => setTimeout(resolve, ms));
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
  visualPromptSource?: 'auto' | 'manual'
): Keyframe => {
  return {
    id,
    type,
    visualPrompt,
    imageUrl,
    status,
    visualPromptSource
  };
};

/**
 * 更新镜头中的关键帧
 */
export const updateKeyframeInShot = (
  shot: Shot,
  type: 'start' | 'end',
  keyframe: Keyframe
): Shot => {
  const newKeyframes = [...(shot.keyframes || [])];
  const idx = newKeyframes.findIndex(k => k.type === type);
  
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

/**
 * 创建子镜头对象
 * @param originalShot - 原始镜头对象
 * @param subShotData - AI返回的子镜头数据
 * @param subShotId - 子镜头ID
 * @returns 新的Shot对象
 */
export const createSubShot = (
  originalShot: Shot,
  subShotData: any,
  subShotId: string
): Shot => {
  // 处理关键帧数组
  const keyframes: any[] = [];
  if (subShotData.keyframes && Array.isArray(subShotData.keyframes)) {
    subShotData.keyframes.forEach((kf: any) => {
      if (kf.type && kf.visualPrompt) {
        keyframes.push({
          id: `${subShotId}-${kf.type}`, // 如 "shot-1-1-start", "shot-1-1-end"
          type: kf.type,
          visualPrompt: kf.visualPrompt,
          status: 'pending' // 初始状态为pending，等待用户生成图像
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
    videoModel: originalShot.videoModel // 继承视频模型设置
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
  subShots: Shot[]
): Shot[] => {
  const originalIndex = shots.findIndex(s => s.id === originalShotId);
  
  if (originalIndex === -1) {
    logger.error(LogCategory.AI, `未找到ID为 ${originalShotId} 的镜头`);
    return shots;
  }
  
  // 创建新数组，在原位置插入子镜头
  const newShots = [
    ...shots.slice(0, originalIndex),
    ...subShots,
    ...shots.slice(originalIndex + 1)
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
  chatCompletion?: (prompt: string, model?: string, temperature?: number, maxTokens?: number, responseFormat?: string) => Promise<string>,
  model?: string
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
    const propsWithImage = propsInfo.filter(p => p.hasImage);
    const propsWithoutImage = propsInfo.filter(p => !p.hasImage);

    let sections: string[] = [];

    if (propsWithImage.length > 0) {
      const list = propsWithImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
以下道具已提供参考图，画面中出现时必须严格遵循：
• 外形、颜色、材质、细节必须与参考图一致
${list}`);
    }

    if (propsWithoutImage.length > 0) {
      const list = propsWithoutImage.map(p => `- ${p.name}: ${p.description}`).join('\n');
      sections.push(`以下道具无参考图，请根据文字描述准确呈现：
${list}`);
    }

    propConsistencyGuide = '\n\n' + sections.join('\n\n');
  }

  const startGuide = await getCameraMovementCompositionGuide(cameraMovement, 'start', chatCompletion, model);

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
  panelIndex: number
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
        const col = panelIndex % 3;        // 列 (0, 1, 2)
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
          Math.round(sx), Math.round(sy),   // 源坐标
          Math.round(panelWidth), Math.round(panelHeight), // 源尺寸
          0, 0,                               // 目标坐标
          canvas.width, canvas.height          // 目标尺寸
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