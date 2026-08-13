/**
 * L6 约束层（system 侧）
 * 三栏约束：mustHold / changesHere / mustNotAppear（借鉴 HGAS）。
 */
import type { ShotConstraint } from '../../../types/prompt';

export const buildConstraintBlock = (constraint: ShotConstraint): string => {
  const parts: string[] = ['## Continuity & Constraint Rules'];

  if (constraint.mustHold.length > 0) {
    parts.push(`【必须保持 MUST HOLD】\n${constraint.mustHold.map((s) => `- ${s}`).join('\n')}`);
  }
  if (constraint.changesHere.length > 0) {
    parts.push(
      `【允许变化 CHANGES HERE】\n${constraint.changesHere.map((s) => `- ${s}`).join('\n')}`,
    );
  }
  if (constraint.mustNotAppear.length > 0) {
    parts.push(
      `【禁止出现 MUST NOT APPEAR】\n${constraint.mustNotAppear.map((s) => `- ${s}`).join('\n')}`,
    );
  }

  return parts.filter(Boolean).join('\n\n');
};
