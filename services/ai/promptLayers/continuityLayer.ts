/**
 * L7 连续性层（system 侧）
 * 前镜头上下文 + 角色状态版本 + 风格锚点，保证跨镜头视觉连贯。
 */
import type { ContinuityContext } from '../../../types/prompt';

export const buildContinuityBlock = (continuity: ContinuityContext): string => {
  const parts: string[] = ['## Continuity Context'];

  if (continuity.previousShotSummary) {
    parts.push(`### Previous Shot\n${continuity.previousShotSummary}`);
  }

  if (continuity.characterStates.length > 0) {
    const lines = continuity.characterStates.map(
      (s) => `- ${s.characterId} [${s.stateLabel}]${s.visualDelta ? `: ${s.visualDelta}` : ''}`,
    );
    parts.push(`### Character States\n${lines.join('\n')}`);
  }

  if (continuity.consistencyAnchors) {
    parts.push(`### Style Anchor\n${continuity.consistencyAnchors}`);
  }

  return parts.filter(Boolean).join('\n\n');
};
