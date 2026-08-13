/**
 * L5 摄影层（system 侧）
 * 美术指导(ArtDirection) → 文本块。该函数从 visualService.ts 迁移而来，逻辑原样保留。
 */
import type { ArtDirection } from '../../../types';

export const buildArtDirectionBlock = (
  artDirection: ArtDirection | undefined,
  designLabel: string,
): string => {
  if (!artDirection) {
    return '## Art Direction\n(未配置全局美术指导，沿用默认风格约束)';
  }
  return `## Art Direction Guidelines
${artDirection.consistencyAnchors}

## ${designLabel} Design Rules
${artDirection.characterDesignRules.proportions}
${artDirection.characterDesignRules.eyeStyle}
${artDirection.characterDesignRules.lineWeight}
${artDirection.characterDesignRules.detailLevel}

## Color Palette Guidelines
- Primary: ${artDirection.colorPalette.primary}
- Secondary: ${artDirection.colorPalette.secondary}
- Accent: ${artDirection.colorPalette.accent}
- Skin Tones: ${artDirection.colorPalette.skinTones}
- Saturation: ${artDirection.colorPalette.saturation}
- Temperature: ${artDirection.colorPalette.temperature}

## Lighting & Texture
- Lighting Style: ${artDirection.lightingStyle}
- Texture Style: ${artDirection.textureStyle}

## Mood Keywords
${artDirection.moodKeywords.join(', ')}`;
};
