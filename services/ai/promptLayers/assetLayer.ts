/**
 * L2 资产层（user 侧）
 * 角色 / 场景 / 道具描述 + 时代背景注入。
 */
import type { PromptAssets, PromptIntent } from '../../../types/prompt';
import { getStylePrompt } from '../promptConstants';

export const buildAssetBlock = (assets: PromptAssets, intent: PromptIntent): string => {
  const parts: string[] = [];

  if (intent.visualStyle) {
    parts.push(`Visual Style: ${intent.visualStyle} (${getStylePrompt(intent.visualStyle)})`);
  }

  if (assets.characters && assets.characters.length > 0) {
    const charBlocks = assets.characters.map((c, i) => {
      const lines = [
        `${i + 1}. ${c.name}`,
        `Gender: ${c.gender}`,
        `Age: ${c.age}`,
        `Personality: ${c.personality}`,
        `Base Visual Prompt: ${c.visualPrompt || 'Not provided'}`,
      ];
      if (c.enhancedVisualDescription) {
        const e = c.enhancedVisualDescription;
        if (e.headAndHair) lines.push(`Head & Hair: ${e.headAndHair}`);
        if (e.upperBody) lines.push(`Upper Body: ${e.upperBody}`);
        if (e.hands) lines.push(`Hands: ${e.hands}`);
        if (e.walkingPattern) lines.push(`Walking: ${e.walkingPattern}`);
      }
      return lines.join('\n');
    });
    parts.push(`## Character Information\n${charBlocks.join('\n\n')}`);
  }

  if (assets.scenes && assets.scenes.length > 0) {
    const sceneBlocks = assets.scenes.map(
      (s, i) => `${i + 1}. ${s.location} - ${s.time} - ${s.atmosphere}`,
    );
    parts.push(`## Scene Information\n${sceneBlocks.join('\n')}`);
  }

  if (assets.props && assets.props.length > 0) {
    const propBlocks = assets.props.map(
      (p, i) =>
        `${i + 1}. ${p.name} (${p.category}): ${p.description}${p.visualPrompt ? ` | ${p.visualPrompt}` : ''}`,
    );
    parts.push(`## Prop Information\n${propBlocks.join('\n')}`);
  }

  if (assets.eraContextBlock) {
    parts.push(assets.eraContextBlock);
  }

  return parts.filter(Boolean).join('\n\n');
};
