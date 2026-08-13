/**
 * L4 动作层（user 侧）
 * 动作描述 / 台词 / 微动作 / 标志性姿态。
 */
import type { PromptAction } from '../../../types/prompt';

export const buildActionBlock = (action: PromptAction): string => {
  const parts: string[] = [];

  if (action.actionSummary) {
    parts.push(`## Narrative Action\n${action.actionSummary}`);
  }
  if (action.dialogue) {
    parts.push(`## Dialogue\n${action.dialogue}`);
  }

  const poses = (action.signaturePoses ?? []).filter(Boolean);
  if (poses.length > 0) {
    parts.push(`【标志性姿态】必须展现角色的标志性姿态：${poses.join('；')}`);
  }
  const micro = (action.microActions ?? []).filter(Boolean);
  if (micro.length > 0) {
    parts.push(`【微动作特征】角色必须携带其微动作特征：${micro.join('；')}`);
  }

  return parts.filter(Boolean).join('\n\n');
};
