/**
 * Prompt Optimizer Service
 *
 * 为"推演→视频"流程中的各个步骤提供 AI 提示词优化能力。
 * 用户用日常语言描述想法，LLM 将其扩展为专业的影视导演语言。
 */

import { logger, LogCategory } from '../../../../services/logger';

// ========== Step 3: 剧情方向优化 ==========

export interface OptimizeStoryDirectionInput {
  /** 用户输入的原始剧情方向（自然语言） */
  rawDirection: string;
  /** Step 2 的 VLM 画面分析结果 */
  vlmAnalysis?: string | null;
}

export interface OptimizeStoryDirectionOutput {
  /** 优化后的详细剧情描述 */
  optimizedDirection: string;
}

/**
 * 优化 Step 3（剧情推演）的"剧情方向"输入
 */
export async function optimizeStoryDirection(
  input: OptimizeStoryDirectionInput
): Promise<OptimizeStoryDirectionOutput> {
  const { rawDirection, vlmAnalysis } = input;

  const { chat } = await import('../../../../services/modelService');

  const systemPrompt = `你是一位资深影视导演和分镜师，擅长将简单的画面意图扩展为专业的影视镜头描述。

你的任务：
用户会提供一个简短的画面意图（可能只是一两句话），你需要将其扩展为一段专业的"导演笔记"，帮助后续的 AI 分镜师准确理解这个镜头应该怎么拍。

扩展规则：
1. 叙事概要（1-2 句）：基于用户意图，概括这个 15 秒片段要呈现的画面内容
2. 分镜节奏建议：4 个镜头在时间轴上如何分布——画面从哪里开始，经过什么变化，到哪里结束
3. 视觉语言建议：镜头的景别选择、机位角度、光影氛围、运镜方式和转场逻辑
4. 风格一致性：如果有 VLM 分析数据，确保你的描述与画面分析中的风格、光影、色彩保持一致；如果没有，则根据常识推断

重要约束：
- 你输出的是一个"剧情方向描述"，不是最终的分镜表格，不要输出景别/机位/主体位置等具体字段
- 保持专业但不冗余，控制在 200-400 字
- 4 个镜头的逻辑关系由你根据用户意图自行判断——可能是固定机位的时间推进、氛围的渐变、慢动作的时间拉伸等，不要预设"起承转合"等固定模板
- 景别是相机的焦段设定（如全景、特写），不是主体在画面中此刻看起来多大。如果用户的意图是固定镜头，应在描述中明确"固定镜头/机位不变"，主体的远近变化通过位置描述而非景别变化来传达
- 如果用户意图已经包含足够的细节，保持原意并在此基础上专业化，不要曲解`;

  const userMessage = `请将下面的画面意图优化为一段专业的导演笔记：

${vlmAnalysis ? `画面分析参考：\n${vlmAnalysis}\n` : ''}
用户意图：
${rawDirection || '（未提供，请基于画面分析给出合理的视觉推进建议）'}`;

  try {
    logger.info(LogCategory.CANVAS, '[PromptOptimizer] 开始优化剧情方向', {
      rawLength: rawDirection?.length || 0,
      hasContext: !!vlmAnalysis,
    });

    const result = await chat({
      prompt: userMessage,
      systemPrompt,
    });

    logger.info(LogCategory.CANVAS, '[PromptOptimizer] 优化完成', {
      resultLength: result?.length || 0,
    });

    return { optimizedDirection: result || '' };
  } catch (error) {
    logger.error(LogCategory.CANVAS, '[PromptOptimizer] 优化失败', error);
    throw new Error(`AI 优化失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ========== Step 2: VLM System Prompt 优化 ==========

export interface OptimizeVLMSystemPromptInput {
  /** 用户当前输入的 System Prompt */
  rawSystemPrompt: string;
  /** 用户选中的分析维度（中文标签） */
  selectedAspectLabels?: string[];
}

export interface OptimizeVLMSystemPromptOutput {
  /** 优化后的 System Prompt */
  optimizedSystemPrompt: string;
}

/**
 * 优化 Step 2（VLM 分析）的 System Prompt
 */
export async function optimizeVLMSystemPrompt(
  input: OptimizeVLMSystemPromptInput
): Promise<OptimizeVLMSystemPromptOutput> {
  const { rawSystemPrompt, selectedAspectLabels } = input;

  const { chat } = await import('../../../../services/modelService');

  const aspectHint = selectedAspectLabels?.length
    ? `\n当前选中的分析维度：${selectedAspectLabels.join('、')}`
    : '';

  const systemPrompt = `你是一位影视行业的技术美术指导，擅长为 AI 视觉分析模型编写专业的系统提示词（System Prompt）。

你的任务：
用户提供一个 VLM 分析用的 System Prompt（定义 AI 分析师的角色），你需要将其优化为更专业、更精确的版本。

优化要点：
1. 明确"角色定义"——这个 AI 分析师是谁，有什么专业背景
2. 明确"分析目标"——需要分析什么维度、达到什么目的
3. 明确"输出约束"——输出格式、语言风格、精度要求
4. 语言简洁有力，避免冗余描述

重要约束：
- 只输出优化后的 System Prompt，不要加任何前缀、后缀或解释
- 保持原来的角色定位，不要改变分析师的"身份"
- 长度控制在 3-6 句话，不要过于冗长`;

  const userMessage = `请优化下面的 System Prompt：${aspectHint}

原始 System Prompt：
${rawSystemPrompt}`;

  try {
    logger.info(LogCategory.CANVAS, '[PromptOptimizer] 开始优化 VLM System Prompt', {
      rawLength: rawSystemPrompt?.length || 0,
      selectedAspects: selectedAspectLabels?.length || 0,
    });

    const result = await chat({
      prompt: userMessage,
      systemPrompt,
    });

    logger.info(LogCategory.CANVAS, '[PromptOptimizer] VLM System Prompt 优化完成', {
      resultLength: result?.length || 0,
    });

    return { optimizedSystemPrompt: result || '' };
  } catch (error) {
    logger.error(LogCategory.CANVAS, '[PromptOptimizer] VLM System Prompt 优化失败', error);
    throw new Error(`AI 优化失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ========== Step 2: VLM User Prompt 优化 ==========

export interface OptimizeVLMUserPromptInput {
  /** 用户输入的补充要求 */
  rawUserPrompt: string;
  /** 用户选中的分析维度（中文标签） */
  selectedAspectLabels?: string[];
}

export interface OptimizeVLMUserPromptOutput {
  /** 优化后的 User Prompt 补充要求 */
  optimizedUserPrompt: string;
}

/**
 * 优化 Step 2（VLM 分析）的 User Prompt 补充要求
 */
export async function optimizeVLMUserPrompt(
  input: OptimizeVLMUserPromptInput
): Promise<OptimizeVLMUserPromptOutput> {
  const { rawUserPrompt, selectedAspectLabels } = input;

  const { chat } = await import('../../../../services/modelService');

  const aspectHint = selectedAspectLabels?.length
    ? `\n当前选中的分析维度：${selectedAspectLabels.join('、')}`
    : '';

  const systemPrompt = `你是一位影视镜头分析专家，擅长将模糊的分析需求转化为精确的分析指令。

你的任务：
用户会提供一段"对 AI 分析图片的补充要求"，你需要将其优化为更专业、更具体的分析指令。

优化要点：
1. 将口语化的要求转为专业术语（如"看看光线怎么样"→"分析画面中的光源方向、光线质感和明暗对比"）
2. 补充缺失的分析角度——如果用户提的要求太笼统，适度细化
3. 确保指令可执行——每一条要求 AI 都能具体回答
4. 保持简洁，不要超出用户原意的范围

重要约束：
- 只输出优化后的补充要求文本，不要加前缀/后缀/解释
- 如果是单独列出多条要求，用简洁的编号或分点
- 保持用户原始的意图方向，不要自行增加用户没提的维度`;

  const userMessage = `请优化下面的图片分析补充要求：${aspectHint}

原始补充要求：
${rawUserPrompt}`;

  try {
    logger.info(LogCategory.CANVAS, '[PromptOptimizer] 开始优化 VLM User Prompt', {
      rawLength: rawUserPrompt?.length || 0,
      selectedAspects: selectedAspectLabels?.length || 0,
    });

    const result = await chat({
      prompt: userMessage,
      systemPrompt,
    });

    logger.info(LogCategory.CANVAS, '[PromptOptimizer] VLM User Prompt 优化完成', {
      resultLength: result?.length || 0,
    });

    return { optimizedUserPrompt: result || '' };
  } catch (error) {
    logger.error(LogCategory.CANVAS, '[PromptOptimizer] VLM User Prompt 优化失败', error);
    throw new Error(`AI 优化失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}

// ========== Step 5: 视频帧 Prompt 优化 ==========

export interface OptimizeVideoFramePromptInput {
  /** 当前帧的 visualPrompt */
  rawPrompt: string;
  /** 帧索引 */
  frameIndex: number;
  /** 运镜描述 */
  cameraMovement?: string;
  /** 动作描述 */
  action?: string;
  /** 画面风格信息（来自 VLM 分析） */
  styleContext?: string;
}

export interface OptimizeVideoFramePromptOutput {
  /** 优化后的 visualPrompt */
  optimizedPrompt: string;
}

/**
 * 优化 Step 5（视频生成）中某一帧的 visualPrompt
 */
export async function optimizeVideoFramePrompt(
  input: OptimizeVideoFramePromptInput
): Promise<OptimizeVideoFramePromptOutput> {
  const { rawPrompt, cameraMovement, action, styleContext } = input;

  const { chat } = await import('../../../../services/modelService');

  const systemPrompt = `你是一位影视后期导演，擅长为 AI 视频生成模型编写精准的关键帧 Prompt。

你的任务：用户提供一段关键帧的描述（visual prompt），你需要将其优化为更专业、更富有电影感的版本。

优化要点：
1. 使用影视行业的专业描述词汇——增强画面感和画面张力
2. 保持原 prompt 中的关键信息（景别、动作、运镜等），不要删除或改变内容
3. 补充画面氛围描述——适度加入光影、色彩、气氛的关键词
4. 如果有运镜描述，确保在 prompt 中有对应的体现
5. 不要过度扩展——控制在原长度的 1.2-1.5 倍，不要写成一篇小作文

重要约束：
- 只输出优化后的 prompt 文本，不要加任何前缀/后缀/解释
- 格式不变：保持原有的分段结构和时间标记
- 保持原有语义，不添加不存在的内容`;

  const contextParts: string[] = [];
  if (cameraMovement) contextParts.push(`运镜：${cameraMovement}`);
  if (action) contextParts.push(`动作：${action}`);
  if (styleContext) contextParts.push(`风格参考：${styleContext}`);

  const contextBlock = contextParts.length > 0 ? `\n帧上下文：\n${contextParts.join('\n')}\n` : '';

  const userMessage = `请优化下面这个视频帧的 prompt，使其更具电影感：${contextBlock}
原始 prompt：
${rawPrompt}`;

  try {
    logger.info(LogCategory.CANVAS, '[PromptOptimizer] 开始优化视频帧 Prompt', {
      rawLength: rawPrompt?.length || 0,
      hasCameraMovement: !!cameraMovement,
      hasAction: !!action,
    });

    const result = await chat({
      prompt: userMessage,
      systemPrompt,
    });

    logger.info(LogCategory.CANVAS, '[PromptOptimizer] 视频帧 Prompt 优化完成', {
      resultLength: result?.length || 0,
    });

    return { optimizedPrompt: result || '' };
  } catch (error) {
    logger.error(LogCategory.CANVAS, '[PromptOptimizer] 视频帧 Prompt 优化失败', error);
    throw new Error(`AI 优化失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
}
