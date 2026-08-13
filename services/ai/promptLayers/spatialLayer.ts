/**
 * L3 空间层（user 侧）
 * 机位 / 景别 / 主体位置 / 运镜编排。
 */
import type { PromptSpatial } from '../../../types/prompt';
import { renderCameraChoreographyPrompt } from '../../../types';

export const buildSpatialBlock = (spatial: PromptSpatial, actionSummary?: string): string => {
  if (spatial.cameraChoreography) {
    return buildCameraChoreographyBlock(spatial.cameraChoreography, actionSummary);
  }

  const parts: string[] = ['## Spatial Composition'];
  if (spatial.customShotSize) {
    parts.push(`Shot Size: ${spatial.customShotSize}`);
  }
  if (spatial.customAngle) {
    parts.push(`Camera Angle: ${spatial.customAngle}`);
  }
  return parts.join('\n');
};

const buildCameraChoreographyBlock = (
  cc: NonNullable<PromptSpatial['cameraChoreography']>,
  actionSummary?: string,
): string => {
  const choreography = renderCameraChoreographyPrompt(cc, actionSummary ?? '', 8);
  return `## Spatial Composition (Camera Choreography)\n${choreography}`;
};
