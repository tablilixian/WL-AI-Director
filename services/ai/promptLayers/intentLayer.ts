/**
 * L1 意图层（system 侧）
 * 输出角色设定 + 任务框架 + 输出格式约束。
 */
import type { PromptIntent } from '../../../types/prompt';

const TARGET_NOUN: Record<PromptIntent['target'], string> = {
  'art-direction': 'art direction brief',
  'character-design': 'character',
  'scene-environment': 'scene',
  'prop-design': 'prop',
  'keyframe-start': 'keyframe start frame',
  'keyframe-end': 'keyframe end frame',
  'video-motion': 'video motion',
  'style-detection': 'style',
};

/**
 * 构建意图层 system block。
 * @param taskRequirements 可选，目标专属的 CRITICAL REQUIREMENTS 文本，
 *        用于保持与历史 prompt 的语义等价（如角色需描述面部/发型/标志性姿态等）。
 */
export const buildIntentSystemBlock = (intent: PromptIntent, taskRequirements?: string): string => {
  const styleLabel = intent.visualStyle ?? 'cinematic';
  const noun = TARGET_NOUN[intent.target] ?? 'visual';
  const parts: string[] = [
    `You are a world-class visual prompt engineer for ${styleLabel} productions.`,
    `Your task is to create a detailed visual prompt for generating a ${noun} image.`,
  ];

  if (taskRequirements) {
    parts.push(taskRequirements);
  }

  const termsRule = intent.cinematographyTermsRule
    ? '\nCRITICAL: Preserve English cinematography terms untranslated (e.g., Rembrandt lighting, chiaroscuro, deep focus, Dutch angle, dolly zoom, steadicam, crane shot, POV, bokeh, lens flare, anamorphic).'
    : '';
  parts.push(`Language: Write the prompt in ${intent.language}.${termsRule}`);

  if (intent.outputFormat === 'json' && intent.outputSchema) {
    parts.push(`Output the result in the following JSON format:\n${intent.outputSchema}`);
  }
  if (intent.wordCountRange) {
    parts.push(
      `- visualPrompt: Length ${intent.wordCountRange.min}-${intent.wordCountRange.max} words.`,
    );
    parts.push(
      `- negativePrompt: Describe what should NOT appear (unwanted styles, distortions, etc.).`,
    );
  }

  return parts.join('\n\n');
};
