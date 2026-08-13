/**
 * 分镜辅助服务
 * 包含关键帧优化、动作生成、镜头拆分、九宫格分镜等功能
 */

import { AspectRatio, NineGridPanel, Shot } from '../../types';
import { addRenderLogWithTokens } from '../renderLogService';
import { logger, LogCategory } from '../logger';
import {
  retryOperation,
  chatCompletion,
  resolveModel,
  getDefaultChatModelId,
  getErrorMessage,
  parseLlmJson,
  MAX_TOKENS_LONG,
  MAX_TOKENS_SHORT,
} from './apiCore';
import { STORYBOARD_ITEM_WIDTH } from '../../config/sizeConfig';
import { getStylePromptCN, getStylePrompt } from './promptConstants';
import { generateStoryboardImage, generateVisualLanguage } from './visualService';

// ============================================
// 关键帧优化
// ============================================

/**
 * AI一次性优化起始帧和结束帧视觉描述（推荐使用）
 */
export const optimizeBothKeyframes = async (
  actionSummary: string,
  cameraMovement: string,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterInfo: string[],
  visualStyle: string,
  model?: string,
): Promise<{ startPrompt: string; endPrompt: string }> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(
    LogCategory.AI,
    `🎨 optimizeBothKeyframes 调用 - 同时优化起始帧和结束帧 - 使用模型: ${resolvedModel}`,
  );
  const startTime = Date.now();

  const styleDesc = getStylePromptCN(visualStyle);

  const prompt = `
你是一位专业的电影视觉导演和概念艺术家。请为以下镜头同时创作起始帧和结束帧的详细视觉描述。

## 场景信息
**地点：** ${sceneInfo.location}
**时间：** ${sceneInfo.time}
**氛围：** ${sceneInfo.atmosphere}

## 叙事动作
${actionSummary}

## 镜头运动
${cameraMovement}

## 角色信息
${characterInfo.length > 0 ? characterInfo.join('、') : '无特定角色'}

## 视觉风格
${styleDesc}

## 任务要求

你需要为这个8-10秒的镜头创作**起始帧**和**结束帧**两个关键画面的视觉描述。

### 起始帧要求：
• 建立清晰的初始场景和人物状态
• 为即将发生的动作预留视觉空间和动势
• 设定光影和色调基调
• 展现角色的起始表情、姿态和位置
• 根据镜头运动（${cameraMovement}）设置合适的初始构图
• 营造场景氛围，让观众明确故事的起点

### 结束帧要求：
• 展现动作完成后的最终状态和结果
• 体现镜头运动（${cameraMovement}）带来的视角和构图变化
• 展现角色的情绪变化、最终姿态和位置
• 可以有戏剧性的光影和色彩变化
• 达到视觉高潮或情绪释放点
• 为下一个镜头的衔接做准备

### 两帧协调性：
⚠️ **关键**：起始帧和结束帧必须在视觉上连贯协调
- 保持一致的视觉风格和色调基础
- 镜头运动轨迹要清晰可推导
- 人物/物体的空间位置变化要合理
- 光影变化要有逻辑性
- 两帧描述应该能够自然串联成一个流畅的视觉叙事

### 每帧必须包含的视觉元素：

**1. 构图与景别**
- 根据镜头运动确定画面框架和视角
- 主体在画面中的位置和大小
- 前景、中景、背景的层次关系

**2. 光影与色彩**
- 光源的方向、强度和色温
- 主光、辅光、轮廓光的配置
- 整体色调和色彩情绪（暖色/冷色）
- 阴影的长度和密度

**3. 角色细节**（如有）
- 面部表情和眼神方向
- 肢体姿态和重心分布
- 服装状态和细节
- 与环境的互动关系

**4. 环境细节**
- 场景的具体视觉元素
- 环境氛围（雾气、光束、粒子等）
- 背景的清晰度和景深效果
- 环境对叙事的支持

**5. 运动暗示**
- 动态模糊或静止清晰
- 运动方向的视觉引导
- 张力和动势的体现

**6. 电影感细节**
- 画面质感和材质
- 大气透视效果
- 电影级的视觉特征

## 输出格式

请按以下JSON格式输出（注意：描述文本用中文，每个约100-150字）：

\`\`\`json
{
  "startFrame": "起始帧的详细视觉描述...",
  "endFrame": "结束帧的详细视觉描述..."
}
\`\`\`

❌ 避免：
- 不要在描述中包含"Visual Style:"等标签
- 不要分段或使用项目符号
- 不要过于技术化的术语
- 不要描述整个动作过程，只描述画面本身

✅ 追求：
- 流畅的单段描述
- 富有画面感的语言
- 两帧描述相互呼应、逻辑连贯
- 与叙事动作和镜头运动协调一致
- 具体、可视觉化的细节

请开始创作：
`;

  try {
    const result = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.7, MAX_TOKENS_SHORT, 'json_object'),
    );
    const duration = Date.now() - startTime;

    const parsed = parseLlmJson(result) as { startFrame?: string; endFrame?: string };

    if (!parsed.startFrame || !parsed.endFrame) {
      throw new Error('AI返回的JSON格式不正确');
    }

    logger.info(LogCategory.AI, '✅ AI同时优化起始帧和结束帧成功，耗时:', [duration, 'ms']);

    return {
      startPrompt: parsed.startFrame.trim(),
      endPrompt: parsed.endFrame.trim(),
    };
  } catch (error: unknown) {
    logger.error(LogCategory.AI, '❌ AI关键帧优化失败:', error);
    throw new Error(`AI关键帧优化失败: ${getErrorMessage(error)}`);
  }
};

/**
 * AI优化单个关键帧视觉描述（兼容旧版，建议使用 optimizeBothKeyframes）
 */
export const optimizeKeyframePrompt = async (
  frameType: 'start' | 'end',
  actionSummary: string,
  cameraMovement: string,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterInfo: string[],
  visualStyle: string,
  model?: string,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.info(
    LogCategory.AI,
    `🎨 optimizeKeyframePrompt 调用 - ${frameType === 'start' ? '起始帧' : '结束帧'} - 使用模型:`,
    resolvedModel,
  );
  const startTime = Date.now();

  const frameLabel = frameType === 'start' ? '起始帧' : '结束帧';
  const frameFocus =
    frameType === 'start'
      ? '初始状态、起始姿态、预备动作、场景建立'
      : '最终状态、结束姿态、动作完成、情绪高潮';

  const styleDesc = getStylePromptCN(visualStyle);

  const prompt = `
你是一位专业的电影视觉导演和概念艺术家。请为以下镜头的${frameLabel}创作详细的视觉描述。

## 场景信息
**地点：** ${sceneInfo.location}
**时间：** ${sceneInfo.time}
**氛围：** ${sceneInfo.atmosphere}

## 叙事动作
${actionSummary}

## 镜头运动
${cameraMovement}

## 角色信息
${characterInfo.length > 0 ? characterInfo.join('、') : '无特定角色'}

## 视觉风格
${styleDesc}

## 任务要求

作为${frameLabel}，你需要重点描述：**${frameFocus}**

### ${frameType === 'start' ? '起始帧' : '结束帧'}特殊要求：
${
  frameType === 'start'
    ? `
• 建立清晰的初始场景和人物状态
• 为即将发生的动作预留视觉空间和动势
• 设定光影和色调基调
• 展现角色的起始表情、姿态和位置
• 根据镜头运动（${cameraMovement}）设置合适的初始构图
• 营造场景氛围，让观众明确故事的起点
`
    : `
• 展现动作完成后的最终状态和结果
• 体现镜头运动（${cameraMovement}）带来的视角和构图变化
• 展现角色的情绪变化、最终姿态和位置
• 可以有戏剧性的光影和色彩变化
• 达到视觉高潮或情绪释放点
• 为下一个镜头的衔接做准备
`
}

### 必须包含的视觉元素：

**1. 构图与景别**
- 根据镜头运动确定画面框架和视角
- 主体在画面中的位置和大小
- 前景、中景、背景的层次关系

**2. 光影与色彩**
- 光源的方向、强度和色温
- 主光、辅光、轮廓光的配置
- 整体色调和色彩情绪（暖色/冷色）
- 阴影的长度和密度

**3. 角色细节**（如有）
- 面部表情和眼神方向
- 肢体姿态和重心分布
- 服装状态和细节
- 与环境的互动关系

**4. 环境细节**
- 场景的具体视觉元素
- 环境氛围（雾气、光束、粒子等）
- 背景的清晰度和景深效果
- 环境对叙事的支持

**5. 运动暗示**
- 动态模糊或静止清晰
- 运动方向的视觉引导
- 张力和动势的体现

**6. 电影感细节**
- 画面质感和材质
- 大气透视效果
- 电影级的视觉特征

## 输出格式

请直接输出简洁但详细的视觉描述，约100-150字，用中文。

❌ 避免：
- 不要包含"Visual Style:"等标签
- 不要分段或使用项目符号
- 不要过于技术化的术语
- 不要描述整个动作过程，只描述这一帧的画面

✅ 追求：
- 流畅的单段描述
- 富有画面感的语言
- 突出${frameLabel}的特点
- 与叙事动作和镜头运动协调一致
- 具体、可视觉化的细节

请开始创作这一帧的视觉描述：
`;

  try {
    const result = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.7, MAX_TOKENS_SHORT),
    );
    const duration = Date.now() - startTime;

    logger.info(LogCategory.AI, `✅ AI ${frameLabel}优化成功，耗时:`, [duration, 'ms']);

    return result.trim();
  } catch (error: unknown) {
    logger.error(LogCategory.AI, `❌ AI ${frameLabel}优化失败:`, error);
    throw new Error(`AI ${frameLabel}优化失败: ${getErrorMessage(error)}`);
  }
};

// ============================================
// 动作生成
// ============================================

/**
 * AI生成叙事动作建议
 */
/**
 * 用 VLM 分析关键帧图像的实际画面内容
 */
async function analyzeKeyframeImage(imageUrl: string, frameLabel: string): Promise<string> {
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
}

export const generateActionSuggestion = async (
  startFramePrompt: string,
  endFramePrompt: string,
  cameraMovement: string,
  model?: string,
  startImageUrl?: string,
  endImageUrl?: string,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.info(LogCategory.AI, '🎬 generateActionSuggestion 调用 - 使用模型:', resolvedModel);
  const startTime = Date.now();

  // 并行分析首尾帧的实际画面（有图时）
  const [startVlmAnalysis, endVlmAnalysis] = await Promise.all([
    startImageUrl ? analyzeKeyframeImage(startImageUrl, '首帧') : Promise.resolve(''),
    endImageUrl ? analyzeKeyframeImage(endImageUrl, '尾帧') : Promise.resolve(''),
  ]);

  const hasVlmResult = !!(startVlmAnalysis || endVlmAnalysis);

  const prompt = `
你是一位专业的电影动作导演和叙事顾问。请根据提供的首帧和尾帧信息，结合镜头运动，设计一个既符合叙事逻辑又充满视觉冲击力的动作场景。

## 重要约束
⏱️ **时长限制**：这是一个单镜头场景，请严格控制动作复杂度
📹 **镜头要求**：这是一个连续镜头，不要设计多个镜头切换（除非绝对必要，最多2-3个快速切换）

## 输入信息
**镜头运动：** ${cameraMovement}

**首帧文字描述（叙事意图）：**
${startFramePrompt}
${
  startVlmAnalysis
    ? `
**首帧实际画面分析（VLM 视觉识别）：**
${startVlmAnalysis}`
    : ''
}

**尾帧文字描述（叙事意图）：**
${endFramePrompt}
${
  endVlmAnalysis
    ? `
**尾帧实际画面分析（VLM 视觉识别）：**
${endVlmAnalysis}`
    : ''
}
${
  hasVlmResult
    ? `
📌 **对照指南**：文字描述是叙事意图，实际画面分析是真实视觉事实。请以文字描述的叙事意图为主线，同时尊重实际画面的视觉事实（角色实际位置、表情、光影、构图等）。如果两者有差异，以实际画面为准来生成连贯的动作过渡。`
    : ''
}

## 任务要求
1. **时长适配**：动作设计必须在 ${hasVlmResult ? '给定' : '8-10'} 秒内完成，避免过于复杂的多步骤动作
2. **单镜头思维**：优先设计一个连贯的镜头内动作，而非多镜头组合
3. **自然衔接**：动作需要自然地从首帧过渡到尾帧，确保逻辑合理
4. **创新适配**：不要重复已有提示词，结合当前场景创新
5. **镜头语言**：根据提供的镜头运动（${cameraMovement}），设计相应的运镜方案

## 输出格式
请直接输出动作描述文本，无需JSON格式或额外标记。内容应包含：
- 简洁的单镜头动作场景描述
- 关键的运镜说明（推拉摇移等）
- 核心的视觉特效或情感氛围
- 确保描述具有电影感但控制篇幅

请开始创作：
`;

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.8, MAX_TOKENS_SHORT));
    const duration = Date.now() - startTime;

    logger.info(LogCategory.AI, '✅ AI动作生成成功，耗时:', [duration, 'ms']);

    return result.trim();
  } catch (error: unknown) {
    logger.error(LogCategory.AI, '❌ AI动作生成失败:', error);
    throw new Error(`AI动作生成失败: ${getErrorMessage(error)}`);
  }
};

// ============================================
// 镜头拆分
// ============================================

/**
 * AI镜头拆分功能 - 将单个镜头拆分为多个细致的子镜头
 */
export const splitShotIntoSubShots = async (
  shot: Shot,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterNames: string[],
  visualStyle: string,
  model?: string,
): Promise<{ subShots: Shot[] }> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.info(LogCategory.AI, '✂️ splitShotIntoSubShots 调用 - 使用模型:', resolvedModel);
  const startTime = Date.now();

  const styleDesc = getStylePromptCN(visualStyle);

  const prompt = `
你是一位专业的电影分镜师和导演。你的任务是将一个粗略的镜头描述，拆分为多个细致、专业的子镜头。

## 原始镜头信息

**场景地点：** ${sceneInfo.location}
**场景时间：** ${sceneInfo.time}
**场景氛围：** ${sceneInfo.atmosphere}
**角色：** ${characterNames.length > 0 ? characterNames.join('、') : '无特定角色'}
**视觉风格：** ${styleDesc}
**原始镜头运动：** ${shot.cameraMovement || '未指定'}

**原始动作描述：**
${shot.actionSummary}

${
  shot.dialogue
    ? `**对白：** "${shot.dialogue}"

⚠️ **对白处理说明**：原始镜头包含对白。请在拆分时，将对白放在最合适的子镜头中（通常是角色说话的中景或近景镜头），并在该子镜头的actionSummary中明确提及对白内容。其他子镜头不需要包含对白。`
    : ''
}

## 拆分要求

### 核心原则
1. **单一职责**：每个子镜头只负责一个视角或动作细节，避免混合多个视角
2. **时长控制**：每个子镜头时长约2-4秒，总时长保持在8-10秒左右
3. **景别多样化**：合理运用全景、中景、特写等不同景别
4. **连贯性**：子镜头之间要有逻辑的视觉过渡和叙事连贯性

### 拆分维度示例

**景别分类（Shot Size）：**
- **远景 Long Shot / 全景 Wide Shot**：展示整体环境、人物位置关系、空间布局
- **中景 Medium Shot**：展示人物上半身或腰部以上，强调动作和表情
- **近景 Close-up**：展示人物头部或重要物体，强调情感和细节
- **特写 Extreme Close-up**：聚焦关键细节（如手部动作、眼神、物体特写）

### 必须包含的字段

每个子镜头必须包含以下信息：

1. **shotSize**（景别）：明确标注景别类型
2. **cameraMovement**（镜头运动）：描述镜头如何移动
3. **actionSummary**（动作描述）：清晰、具体的动作和画面内容描述（60-100字）
4. **visualFocus**（视觉焦点）：这个镜头的视觉重点
5. **keyframes**（关键帧数组）：包含起始帧(start)和结束帧(end)的视觉描述

### 专业镜头运动参考
- 静止镜头 Static Shot
- 推镜头 Dolly Shot / 拉镜头 Zoom Out
- 跟踪镜头 Tracking Shot
- 平移镜头 Pan Shot
- 环绕镜头 Circular Shot
- 俯视镜头 High Angle / 仰视镜头 Low Angle
- 主观视角 POV Shot
- 越肩镜头 Over the Shoulder

## 输出格式

请输出JSON格式，结构如下：

\`\`\`json
{
  "subShots": [
    {
      "shotSize": "全景 Wide Shot",
      "cameraMovement": "静止镜头 Static Shot",
      "actionSummary": "动作描述...",
      "visualFocus": "视觉焦点描述",
      "keyframes": [
        {
          "type": "start",
          "visualPrompt": "起始帧视觉描述，${styleDesc}，100-150字..."
        },
        {
          "type": "end",
          "visualPrompt": "结束帧视觉描述，${styleDesc}，100-150字..."
        }
      ]
    }
  ]
}
\`\`\`

**关键帧visualPrompt要求**：
- 必须包含视觉风格标记（${styleDesc}）
- 详细描述画面构图、光影、色彩、景深等视觉元素
- 起始帧和结束帧要有明显的视觉差异
- 长度控制在100-150字

## 重要提示

❌ **避免：**
- 不要在单个子镜头中混合多个视角或景别
- 不要拆分过细导致总时长超过10秒
- 不要忽略视觉连贯性

✅ **追求：**
- 每个子镜头职责清晰、画面感强
- 景别和视角多样化但符合叙事逻辑
- 保持电影级的专业表达

请开始拆分，直接输出JSON格式（不要包含markdown代码块标记）：
`;

  try {
    const result = await retryOperation(() =>
      chatCompletion(prompt, model, 0.7, MAX_TOKENS_LONG, 'json_object'),
    );
    const duration = Date.now() - startTime;

    const parsed = parseLlmJson(result) as { subShots: Array<Shot & { visualFocus?: string }> };

    if (!parsed.subShots || !Array.isArray(parsed.subShots) || parsed.subShots.length === 0) {
      throw new Error('AI返回的JSON格式不正确或子镜头数组为空');
    }

    // 验证每个子镜头
    for (const subShot of parsed.subShots) {
      if (
        !subShot.shotSize ||
        !subShot.cameraMovement ||
        !subShot.actionSummary ||
        !subShot.visualFocus
      ) {
        throw new Error(
          '子镜头缺少必需字段（shotSize、cameraMovement、actionSummary、visualFocus）',
        );
      }
      if (
        !subShot.keyframes ||
        !Array.isArray(subShot.keyframes) ||
        subShot.keyframes.length === 0
      ) {
        throw new Error('子镜头缺少关键帧数组（keyframes）');
      }
      for (const kf of subShot.keyframes) {
        if (!kf.type || !kf.visualPrompt) {
          throw new Error('关键帧缺少必需字段（type、visualPrompt）');
        }
        if (kf.type !== 'start' && kf.type !== 'end') {
          throw new Error('关键帧type必须是"start"或"end"');
        }
      }
    }

    logger.info(LogCategory.AI, `✅ 镜头拆分成功，生成 ${parsed.subShots.length} 个子镜头，耗时:`, [
      duration,
      'ms',
    ]);

    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: `shot-split-${shot.id}-${Date.now()}`,
      resourceName: `镜头拆分 - ${shot.actionSummary.substring(0, 30)}...`,
      status: 'success',
      model: model ?? '',
      prompt: prompt.substring(0, 200) + '...',
      duration: duration,
    });

    return parsed;
  } catch (error: unknown) {
    logger.error(LogCategory.AI, '❌ 镜头拆分失败:', error);

    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: `shot-split-${shot.id}-${Date.now()}`,
      resourceName: `镜头拆分 - ${shot.actionSummary.substring(0, 30)}...`,
      status: 'failed',
      model: model ?? '',
      prompt: prompt.substring(0, 200) + '...',
      error: getErrorMessage(error),
      duration: Date.now() - startTime,
    });

    throw new Error(`镜头拆分失败: ${getErrorMessage(error)}`);
  }
};

// ============================================
// 关键帧增强
// ============================================

/**
 * AI增强关键帧提示词 - 添加详细的技术规格和视觉细节
 */
export const enhanceKeyframePrompt = async (
  basePrompt: string,
  visualStyle: string,
  cameraMovement: string,
  frameType: 'start' | 'end',
  model?: string,
  propsInfo?: { name: string; description: string; hasImage: boolean }[],
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.info(
    LogCategory.AI,
    `🎨 enhanceKeyframePrompt 调用 - ${frameType === 'start' ? '起始帧' : '结束帧'} - 使用模型:`,
    resolvedModel,
  );
  const startTime = Date.now();

  const styleDesc = getStylePromptCN(visualStyle);
  const frameLabel = frameType === 'start' ? '起始帧' : '结束帧';
  const frameDesc =
    frameType === 'start'
      ? '建立清晰的初始状态和场景氛围，人物/物体的起始位置、姿态和表情要明确，为后续运动预留视觉空间和动势'
      : '展现动作完成后的最终状态，人物/物体的终点位置、姿态和情绪变化，体现镜头运动带来的视角变化';

  const propsBlock =
    propsInfo && propsInfo.length > 0
      ? propsInfo
          .map((p) => `${p.name}: ${p.description}${p.hasImage ? ' (有参考图)' : ''}`)
          .join('\n')
      : '';

  const prompt = `
Generate a complete keyframe prompt for IMAGE generation (not video). Output ONLY the formatted prompt below, no extra text.

## Input
Scene: ${basePrompt}
Visual Style: ${styleDesc}
Camera: ${cameraMovement}
Frame: ${frameLabel}
${propsBlock ? `Props:\n${propsBlock}` : ''}

## Language Rules
- Output primarily in Chinese
- CRITICAL: Preserve English cinematography terms untranslated (e.g., Rembrandt lighting, chiaroscuro, deep focus, Dutch angle, dolly zoom, steadicam, crane shot, POV, bokeh, lens flare, anamorphic)

## Output Template (fill in all sections, each 2-3 concise bullet points)

画面描述: [rephrase scene in vivid cinematic Chinese, 1-2 sentences]

【视觉风格】Visual Style
[English keywords for image model]

【构图】Composition
帧类型: ${frameLabel}，镜头运动: ${cameraMovement}
帧类型差异化约束: ${frameLabel}必须侧重"${frameDesc}"

【角色一致性要求】CHARACTER CONSISTENCY REQUIREMENTS
如果提供了角色参考图，画面中的人物外观必须严格遵循参考图：
• 面部特征、发型、服装、体型必须与参考图完全一致
• 这是最高优先级要求，不可妥协
${
  propsBlock
    ? `
【道具一致性要求】PROP CONSISTENCY REQUIREMENTS
以下道具已提供参考图，画面中出现时必须严格遵循：
• 外形、颜色、材质、细节必须与参考图一致
${propsBlock}`
    : ''
}

【摄影技术】Cinematography
• 分辨率: 4K (3840×2160)
• 光源: [主光/辅光/背光配置，1-2句]
• 色彩: [色温/色调，1句]
• 景深: [焦点策略，1句]

【场景与氛围】Scene & Atmosphere
• 环境: [背景层次、空间透视，1-2句]
• 氛围: [情绪基调、色彩心理，1句]

【角色演绎】Character Performance
• 表情: [眼神、微表情，1句]
• 姿态: [肢体语言、动作，1句]

Output now:
`;

  try {
    const result = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.7, MAX_TOKENS_SHORT),
    );
    const duration = Date.now() - startTime;

    logger.info(LogCategory.AI, `✅ AI ${frameLabel}增强成功，耗时:`, [duration, 'ms']);

    return result.trim();
  } catch (error: unknown) {
    logger.error(LogCategory.AI, `❌ AI ${frameLabel}增强失败:`, error);
    logger.warn(LogCategory.AI, '⚠️ 回退到基础提示词');
    const fallbackStyle = getStylePrompt(visualStyle);
    return `${basePrompt}

【视觉风格】Visual Style
${fallbackStyle}

【构图】Composition
${frameType === 'start' ? '起始' : '结束'}帧，镜头运动: ${cameraMovement}

【角色一致性要求】CHARACTER CONSISTENCY REQUIREMENTS
如果提供了角色参考图，画面中的人物外观必须严格遵循参考图：
• 面部特征、发型、服装、体型必须与参考图完全一致
• 这是最高优先级要求，不可妥协`;
  }
};

// ============================================
// 九宫格分镜预览
// ============================================

/**
 * 使用 Chat 模型将镜头动作拆分为 9 个不同的摄影视角
 */
export const generateNineGridPanels = async (
  actionSummary: string,
  cameraMovement: string,
  sceneInfo: { location: string; time: string; atmosphere: string },
  characterNames: string[],
  visualStyle: string,
  _model?: string,
): Promise<NineGridPanel[]> => {
  const startTime = Date.now();
  logger.info(LogCategory.AI, '🎬 九宫格分镜 - 开始AI拆分视角...');

  // 直接使用激活的模型，忽略传入的 model 参数
  const resolvedModel = getDefaultChatModelId();
  const resolvedModelObj = resolveModel('chat', resolvedModel);
  logger.info(LogCategory.AI, '🎬 九宫格分镜 - 使用模型:', [resolvedModel, resolvedModelObj?.name]);

  const systemPrompt = `你是一位专业的电影分镜师和摄影指导。你的任务是将一个镜头动作拆解为9个不同的摄影视角，用于九宫格分镜预览。
每个视角必须展示相同场景的不同景别和机位角度组合，确保覆盖从远景到特写、从俯拍到仰拍的多样化视角。`;

  const userPrompt = `请将以下镜头动作拆解为9个不同的摄影视角，用于生成一张3x3九宫格分镜图。

【镜头动作】${actionSummary}
【原始镜头运动】${cameraMovement}
【场景信息】地点: ${sceneInfo.location}, 时间: ${sceneInfo.time}, 氛围: ${sceneInfo.atmosphere}
【角色】${characterNames.length > 0 ? characterNames.join('、') : '无特定角色'}
【视觉风格】${visualStyle}

请按照以下要求返回JSON格式数据：
1. 9个视角必须覆盖不同的景别和角度组合，避免重复
2. 建议覆盖：建立镜头(远/全景)、人物交互(中景)、情绪表达(近景/特写)、氛围细节(各种角度)
3. 每个视角的description必须包含具体的画面内容描述（角色位置、动作、表情、环境细节等）
4. description使用英文撰写，但可以包含场景和角色的中文名称

请严格按照以下JSON格式输出，不要包含其他文字：
{
  "panels": [
    {
      "index": 0,
      "shotSize": "远景",
      "cameraAngle": "俯拍",
      "description": "Establishing aerial shot showing..."
    },
    {
      "index": 1,
      "shotSize": "中景",
      "cameraAngle": "平视",
      "description": "Medium shot at eye level..."
    }
  ]
}

注意：必须恰好返回9个panel（index 0-8），按照九宫格从左到右、从上到下的顺序排列。`;

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(fullPrompt, resolvedModel, 0.7, MAX_TOKENS_LONG, 'json_object'),
    );
    const duration = Date.now() - startTime;

    const parsed = parseLlmJson(responseText) as { panels?: NineGridPanel[] };

    let panels: NineGridPanel[] = parsed.panels || [];

    if (panels.length < 9) {
      for (let i = panels.length; i < 9; i++) {
        panels.push({
          index: i,
          shotSize: '中景',
          cameraAngle: '平视',
          description: `${actionSummary} - alternate angle ${i + 1}`,
        });
      }
    } else if (panels.length > 9) {
      panels = panels.slice(0, 9);
    }

    panels = panels.map((p, idx) => ({ ...p, index: idx }));

    logger.info(LogCategory.AI, `✅ 九宫格分镜 - AI拆分完成，耗时: ${duration}ms`);
    return panels;
  } catch (error: unknown) {
    logger.error(LogCategory.AI, '❌ 九宫格分镜 - AI拆分失败:', error);
    throw new Error(`九宫格视角拆分失败: ${getErrorMessage(error)}`);
  }
};

/**
 * 使用 Drama Backend 分镜生成 API 生成九宫格分镜图片
 */
export const generateNineGridImage = async (
  panels: NineGridPanel[],
  referenceImages: string[] = [],
  visualStyle: string,
  _aspectRatio: AspectRatio = '16:9',
  shotId?: string,
): Promise<string> => {
  const startTime = Date.now();
  logger.info(LogCategory.AI, '🎬 九宫格分镜 - 开始生成九宫格图片...');

  // 将 9 个 panel 描述拼接为多行 prompt（每行对应一个格子）
  const panelLines = panels.map(
    (panel, idx) =>
      `Panel ${idx + 1}: [${panel.shotSize} / ${panel.cameraAngle}] ${panel.description}`,
  );
  const storyboardPrompt = panelLines.join('\n');

  logger.info(LogCategory.AI, '🎬 九宫格分镜 - 调用 Drama Backend image2storyboard 接口');
  logger.info(LogCategory.AI, `🎬 九宫格分镜 - 格子数: ${panels.length}`);

  try {
    const imageUrl = await generateStoryboardImage(
      storyboardPrompt,
      panels.length, // gridnum
      STORYBOARD_ITEM_WIDTH, // itemWidth
      referenceImages[0], // referenceImage (只传第一张)
      'ninegrid',
      shotId,
    );
    const duration = Date.now() - startTime;

    logger.info(LogCategory.AI, `✅ 九宫格分镜 - 图片生成完成，耗时: ${duration}ms`);
    return imageUrl;
  } catch (error: unknown) {
    logger.error(LogCategory.AI, '❌ 九宫格分镜 - 图片生成失败:', error);
    throw new Error(`九宫格图片生成失败: ${getErrorMessage(error)}`);
  }
};
