/**
 * 视觉资产生成服务
 * 包含美术指导文档生成、角色/场景视觉提示词生成、图像生成
 */

import { Character, Scene, AspectRatio, ArtDirection, CharacterTurnaroundPanel } from "../../types";
import { addRenderLogWithTokens } from '../renderLogService';
import { logger, LogCategory } from '../logger';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  checkApiKey,
  getApiBase,
  getActiveModel,
  resolveModel,
  logScriptProgress,
  getActiveChatModel,
  getDefaultChatModelId,
} from './apiCore';
import {
  getStylePrompt,
  getNegativePrompt,
  getSceneNegativePrompt,
} from './promptConstants';
import { callImageApi } from '../adapters/imageAdapter';

// ============================================
// 美术指导文档生成
// ============================================

/**
 * 生成全局美术指导文档（Art Direction Brief）
 * 在生成任何角色/场景提示词之前调用，为整个项目建立统一的视觉风格基准。
 */
export const generateArtDirection = async (
  title: string,
  genre: string,
  logline: string,
  characters: { name: string; gender: string; age: string; personality: string }[],
  scenes: { location: string; time: string; atmosphere: string }[],
  visualStyle: string,
  language: string = '中文',
  model?: string
): Promise<ArtDirection> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateArtDirection 调用 - 生成全局美术指导文档，使用模型: ${resolvedModel}`);
  logScriptProgress('正在生成全局美术指导文档（Art Direction）...');

  const stylePrompt = getStylePrompt(visualStyle);

  const prompt = `You are a world-class Art Director for ${visualStyle} productions. 
Your job is to create a unified Art Direction Brief that will guide ALL visual prompt generation for characters, scenes, and shots in a single project. This document ensures perfect visual consistency across every generated image.

## Project Info
- Title: ${title}
- Genre: ${genre}
- Logline: ${logline}
- Visual Style: ${visualStyle} (${stylePrompt})
- Language: ${language}

## Characters
${characters.map((c, i) => `${i + 1}. ${c.name} (${c.gender}, ${c.age}, ${c.personality})`).join('\n')}

## Scenes
${scenes.map((s, i) => `${i + 1}. ${s.location} - ${s.time} - ${s.atmosphere}`).join('\n')}

## Your Task
Create a comprehensive Art Direction Brief in JSON format. This brief will be injected into EVERY subsequent visual prompt to ensure all characters and scenes share a unified look and feel.

CRITICAL RULES:
- All descriptions must be specific, concrete, and actionable for image generation AI
- The brief must define a COHESIVE visual world - characters and scenes must look like they belong to the SAME production
- Color palette must be harmonious and genre-appropriate
- Character design rules must ensure all characters share the same art style while being visually distinct from each other
- Output all descriptive text in ${language}

Output ONLY valid JSON with this exact structure:
{
  "colorPalette": {
    "primary": "primary color tone description (e.g., 'deep navy blue with slight purple undertones')",
    "secondary": "secondary color description",
    "accent": "accent/highlight color",
    "skinTones": "skin tone range for characters in this style (e.g., 'warm ivory to golden tan, with soft peach undertones')",
    "saturation": "overall saturation tendency (e.g., 'medium-high, slightly desaturated for cinematic feel')",
    "temperature": "overall color temperature (e.g., 'cool-leaning with warm accent lighting')"
  },
  "characterDesignRules": {
    "proportions": "body proportion style (e.g., '7.5 head-to-body ratio, athletic builds, realistic proportions' or '6 head ratio, stylized anime proportions')",
    "eyeStyle": "unified eye rendering approach (e.g., 'large expressive anime eyes with detailed iris reflections' or 'realistic eye proportions with cinematic catchlights')",
    "lineWeight": "line/edge style (e.g., 'clean sharp outlines with 2px weight' or 'soft edges with no visible outlines, photorealistic blending')",
    "detailLevel": "detail density (e.g., 'high detail on faces and hands, medium on clothing textures, stylized backgrounds')"
  },
  "lightingStyle": "unified lighting approach (e.g., 'three-point cinematic lighting with strong rim light, warm key light from 45-degree angle, cool fill')",
  "textureStyle": "material/texture rendering style (e.g., 'smooth cel-shaded with subtle gradient shading' or 'photorealistic with visible skin pores and fabric weave')",
  "moodKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "consistencyAnchors": "A single comprehensive paragraph (80-120 words) that serves as MASTER STYLE REFERENCE. This paragraph will be prepended to every character and scene prompt to anchor visual style. It should describe: overall rendering quality, specific art style fingerprint, color grading approach, lighting philosophy, and emotional tone of visuals. Write it as direct instructions to an image generation AI."
}`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 4096, 'json_object'));
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const artDirection: ArtDirection = {
      colorPalette: parsed.colorPalette,
      characterDesignRules: parsed.characterDesignRules,
      lightingStyle: parsed.lightingStyle,
      textureStyle: parsed.textureStyle,
      moodKeywords: parsed.moodKeywords,
      consistencyAnchors: parsed.consistencyAnchors,
    };

    logger.debug(LogCategory.AI, '✅ 美术指导文档生成完成');
    return artDirection;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 美术指导文档生成失败:', error);
    throw new Error(`美术指导文档生成失败: ${error.message}`);
  }
};

// ============================================
// 图像生成
// ============================================

/**
 * 生成图像
 * 使用图像生成API，支持参考图像确保角色和场景一致性
 */
export const generateImage = async (
  prompt: string,
  referenceImages: string[] = [],
  aspectRatio: AspectRatio = '16:9',
  isVariation: boolean = false,
  hasTurnaround: boolean = false,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();

  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'gemini-3-pro-image-preview';

  try {
    let finalPrompt = prompt;
    if (referenceImages.length > 0) {
      if (isVariation) {
        finalPrompt = `Character outfit variation task. Reference image shows base character appearance.

Task: Generate character with new outfit based on: "${prompt}"

Requirements:
- Face and identity must match reference exactly (eyes, nose, mouth, hair)
- Generate NEW outfit as described in prompt
- Do not copy clothing from reference image
- Body proportions should remain consistent`;
      } else {
        finalPrompt = `Generate cinematic shot matching: "${prompt}"

Character consistency requirements:
- Facial features, hair, clothing must match character references exactly
- Use turnaround sheet panel that best matches camera angle
- Props and items must match their reference images

Scene consistency requirements:
- Maintain visual style, lighting, and environment from scene reference`;
      }
    }

    logger.debug(LogCategory.AI, `📝 图像生成提示词:\n${'='.repeat(80)}\n${finalPrompt}\n${'='.repeat(80)}`);

    const imageUrl = await callImageApi({
      prompt: finalPrompt,
      referenceImages,
      aspectRatio,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'image-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt: prompt,
      duration: Date.now() - startTime
    });

    return imageUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'image-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt: prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw error;
  }
};

// ============================================
// 角色九宫格造型设计（Turnaround Sheet）
// ============================================

/**
 * 角色九宫格造型设计 - 默认视角布局
 * 覆盖常用的拍摄角度，确保角色从各方向都有参考
 */
export const CHARACTER_TURNAROUND_LAYOUT = {
  panelCount: 9,
  viewAngles: ['正面', '左侧面', '右侧面', '背面', '3/4左侧', '3/4右侧', '俯视', '仰视'],
  shotSizes: ['全身', '半身特写', '面部特写', '近景', '中景', '远景'],
  defaultPanels: [
    { index: 0, viewAngle: '正面', shotSize: '全身', description: '' },
    { index: 1, viewAngle: '正面', shotSize: '半身特写', description: '' },
    { index: 2, viewAngle: '正面', shotSize: '面部特写', description: '' },
    { index: 3, viewAngle: '左侧面', shotSize: '全身', description: '' },
    { index: 4, viewAngle: '左侧面', shotSize: '半身特写', description: '' },
    { index: 5, viewAngle: '左侧面', shotSize: '面部特写', description: '' },
    { index: 6, viewAngle: '背面', shotSize: '全身', description: '' },
    { index: 7, viewAngle: '背面', shotSize: '半身特写', description: '' },
    { index: 8, viewAngle: '背面', shotSize: '面部特写', description: '' },
  ]
};

/**
 * 生成角色九宫格造型设计面板描述
 * AI 自动生成 9 个不同角度和景别的角色描述
 */
export const generateCharacterTurnaroundPanels = async (
  character: Character,
  artDirection: ArtDirection,
  visualStyle: string = 'anime',
  language: string = '中文',
  model?: string
): Promise<CharacterTurnaroundPanel[]> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🔄 generateCharacterTurnaroundPanels 调用 - 生成角色九宫格造型设计，使用模型: ${resolvedModel}`);
  logScriptProgress('正在生成角色九宫格造型设计...');

  const stylePrompt = getStylePrompt(visualStyle);

  const prompt = `You are a character design specialist for ${visualStyle} productions.
Your task is to create a 3x3 TURNAROUND SHEET (9 panels) showing the SAME character from 9 different angles and shot sizes.

## Character Information
- Name: ${character.name}
- Gender: ${character.gender}
- Age: ${character.age}
- Personality: ${character.personality}
- Visual Style: ${visualStyle} (${stylePrompt})
- Visual Prompt: ${character.visualPrompt || 'Not provided'}

## Art Direction Guidelines
${artDirection.consistencyAnchors}

## Turnaround Sheet Layout
You must create descriptions for 9 panels with these exact specifications:
- Panel 0: 正面 - 全身 (Full body front view)
- Panel 1: 正面 - 半身特写 (Medium close-up front view)
- Panel 2: 正面 - 面部特写 (Extreme close-up front view)
- Panel 3: 左侧面 - 全身 (Full body left side view)
- Panel 4: 左侧面 - 半身特写 (Medium close-up left side view)
- Panel 5: 左侧面 - 面部特写 (Extreme close-up left side view)
- Panel 6: 背面 - 全身 (Full body back view)
- Panel 7: 背面 - 半身特写 (Medium close-up back view)
- Panel 8: 背面 - 面部特写 (Extreme close-up back view)

## CRITICAL REQUIREMENTS

1. CHARACTER CONSISTENCY - ABSOLUTE PRIORITY:
   - ALL 9 panels MUST show the EXACT SAME character
   - Face: Identical facial features (eyes, nose, mouth, expression style) across all panels
   - Hair: Same hair length, color, texture, and style in all angles
   - Body: Consistent proportions and build across all panels
   - Clothing: The SAME outfit/accessories should appear in all panels (unless the prompt specifies outfit changes)
   
2. ANGLE ACCURACY:
   - Each panel must accurately depict its specified angle (front, side, back)
   - Proper perspective and foreshortening for each view angle
   - Consistent lighting direction relative to character position
   
3. SHOT SIZE ACCURACY:
   - Full body panels: Show entire character from head to toe
   - Medium close-up: Chest to head
   - Extreme close-up: Face only, may include neck and shoulders

4. ART STYLE CONSISTENCY:
   - Apply the art direction guidelines consistently across all panels
   - Maintain the same rendering quality, line weight, and color palette
   - Follow the visual style: ${visualStyle}

Output ONLY valid JSON with this exact structure:
{
  "panels": [
    {
      "index": 0,
      "viewAngle": "正面",
      "shotSize": "全身",
      "description": "detailed description of full body front view..."
    },
    ...
  ]
}

Language: ${language}
Write all descriptions in ${language}.`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 4096, 'json_object'));
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    if (!parsed.panels || parsed.panels.length !== 9) {
      throw new Error('生成的九宫格面板数量不正确');
    }

    const panels: CharacterTurnaroundPanel[] = parsed.panels.map((p: any) => ({
      index: p.index,
      viewAngle: p.viewAngle,
      shotSize: p.shotSize,
      description: p.description,
    }));

    logger.debug(LogCategory.AI, '✅ 角色九宫格造型设计生成完成');
    return panels;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 角色九宫格造型设计生成失败:', error);
    throw new Error(`角色九宫格造型设计生成失败: ${error.message}`);
  }
};

/**
 * 生成角色九宫格图片
 * 根据九宫格面板描述生成一张包含 9 个格子的图片
 */
export const generateCharacterTurnaroundImage = async (
  panels: CharacterTurnaroundPanel[],
  character: Character,
  artDirection: ArtDirection,
  visualStyle: string = 'anime',
  aspectRatio: AspectRatio = '1:1',
  language: string = '中文',
  model?: string
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateCharacterTurnaroundImage 调用 - 生成角色九宫格图片，使用模型: ${resolvedModel}`);
  logScriptProgress('正在生成角色九宫格图片...');

  const stylePrompt = getStylePrompt(visualStyle);

  const panelDescriptions = panels.map(p => 
    `[${p.index + 1}] ${p.viewAngle} ${p.shotSize}: ${p.description}`
  ).join('\n');

  const prompt = `Character turnaround reference sheet with 9 EQUAL-SIZED panels in a perfect 3x3 grid.

Character: ${character.name}, ${character.gender}, ${character.age}
Style: ${visualStyle}. ${character.visualPrompt || ''}

PERFECT 3x3 GRID STRUCTURE:
- Square image divided into 9 IDENTICAL panels
- 3 rows × 3 columns, ALL panels MUST BE EXACTLY THE SAME SIZE
- Symmetrical grid with equal spacing between panels
- Clear visible borders separating each panel

Panel Layout (each panel corresponds to one description):
Row 1: [Panel 1] [Panel 2] [Panel 3]
Row 2: [Panel 4] [Panel 5] [Panel 6]
Row 3: [Panel 7] [Panel 8] [Panel 9]

Panel Descriptions:
${panelDescriptions}

CRITICAL REQUIREMENTS:
- ALL 9 panels must be IDENTICAL in size (same width and height)
- Perfectly symmetrical 3x3 grid layout
- Each panel shows the SAME character from its specified angle
- Consistent character design across all 9 panels
- Professional reference sheet quality
- Equal spacing and borders between all panels
- No panel should be larger or smaller than others

Generate ONE square image with a perfect3x3 grid of 9 equal-sized panels.`;

  logger.debug(LogCategory.AI, `📝 九宫格生成提示词:\n${'='.repeat(80)}\n${prompt}\n${'='.repeat(80)}`);

  try {
    const imageUrl = await callImageApi({
      prompt,
      referenceImages: [],
      aspectRatio,
    });

    logger.debug(LogCategory.AI, '✅ 角色九宫格图片生成完成');
    return imageUrl;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 角色九宫格图片生成失败:', error);
    throw new Error(`角色九宫格图片生成失败: ${error.message}`);
  }
};

// ============================================
// 视觉提示词生成
// ============================================

/**
 * 生成角色视觉提示词
 * 基于角色信息和美术指导，生成详细的视觉描述
 */
export const generateCharacterVisualPrompt = async (
  character: Character,
  artDirection: ArtDirection,
  visualStyle: string = 'anime',
  language: string = '中文',
  model?: string
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateCharacterVisualPrompt 调用 - 生成角色视觉提示词，使用模型: ${resolvedModel}`);
  logScriptProgress('正在生成角色视觉提示词...');

  const stylePrompt = getStylePrompt(visualStyle);

  const prompt = `You are a world-class visual prompt engineer for ${visualStyle} productions.
Your task is to create a detailed visual prompt for generating a character image.

## Character Information
- Name: ${character.name}
- Gender: ${character.gender}
- Age: ${character.age}
- Personality: ${character.personality}
- Visual Style: ${visualStyle} (${stylePrompt})
- Base Visual Prompt: ${character.visualPrompt || 'Not provided'}

## Art Direction Guidelines
${artDirection.consistencyAnchors}

## Character Design Rules
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
${artDirection.moodKeywords.join(', ')}

## Your Task
Create a comprehensive visual prompt that will be used to generate a character image.

CRITICAL REQUIREMENTS:
1. Describe the character's appearance in DETAIL:
   - Facial features (eyes, nose, mouth, eyebrows, expression)
   - Hair (length, color, texture, style, accessories)
   - Body type and proportions
   - Clothing/outfit (style, color, materials, accessories)
   
2. Apply Art Direction:
   - Follow the color palette guidelines
   - Use the specified lighting style
   - Apply the texture style
   - Incorporate the mood keywords
   
3. Be Specific and Actionable:
   - Use concrete, descriptive language suitable for image generation AI
   - Include specific details about materials, textures, and lighting
   - Describe the pose and composition
   
4. Language:
   - Write the prompt in ${language}
   - Use natural, flowing language

Output ONLY the visual prompt (no explanations, no JSON format). Length: 200-400 words.`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 4096));
    const visualPrompt = responseText.trim();

    logger.debug(LogCategory.AI, '✅ 角色视觉提示词生成完成');
    return visualPrompt;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 角色视觉提示词生成失败:', error);
    throw new Error(`角色视觉提示词生成失败: ${error.message}`);
  }
};

/**
 * 生成场景视觉提示词
 * 基于场景信息和美术指导，生成详细的视觉描述
 */
export const generateSceneVisualPrompt = async (
  scene: Scene,
  artDirection: ArtDirection,
  language: string = '中文',
  model?: string
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateSceneVisualPrompt 调用 - 生成场景视觉提示词，使用模型: ${resolvedModel}`);
  logScriptProgress('正在生成场景视觉提示词...');

  const stylePrompt = getStylePrompt('anime');

  const prompt = `You are a world-class visual prompt engineer for anime productions.
Your task is to create a detailed visual prompt for generating a scene/environment image.

## Scene Information
- Location: ${scene.location}
- Time: ${scene.time}
- Atmosphere: ${scene.atmosphere}
- Visual Style: anime (${stylePrompt})
- Base Visual Prompt: ${scene.visualPrompt || 'Not provided'}

## Art Direction Guidelines
${artDirection.consistencyAnchors}

## Scene Design Rules
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
${artDirection.moodKeywords.join(', ')}

## Your Task
Create a comprehensive visual prompt that will be used to generate a scene/environment image.

CRITICAL REQUIREMENTS:
1. Describe the scene in DETAIL:
   - Environment and background elements
   - Architecture and structures
   - Natural elements (sky, water, vegetation)
   - Atmospheric effects (fog, mist, particles)
   
2. Apply Art Direction:
   - Follow the color palette guidelines
   - Use the specified lighting style
   - Apply the texture style
   - Incorporate the mood keywords
   
3. Be Specific and Actionable:
   - Use concrete, descriptive language suitable for image generation AI
   - Include specific details about materials, textures, and lighting
   - Describe the composition and perspective
   
4. IMPORTANT - NO CHARACTERS:
   - This is a PURE SCENE/ENVIRONMENT shot
   - ABSOLUTELY NO people, NO human figures, NO characters, NO silhouettes, NO crowds
   - Empty scene only - background and environment elements only
   
5. Language:
   - Write the prompt in ${language}
   - Use natural, flowing language

Output ONLY the visual prompt (no explanations, no JSON format). Length: 200-400 words.`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 4096));
    const visualPrompt = responseText.trim();

    logger.debug(LogCategory.AI, '✅ 场景视觉提示词生成完成');
    return visualPrompt;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 场景视觉提示词生成失败:', error);
    throw new Error(`场景视觉提示词生成失败: ${error.message}`);
  }
};

/**
 * 生成所有视觉提示词
 * 批量生成角色和场景的视觉提示词
 */
/**
 * 生成单个角色或场景的视觉提示词（包含正负提示词）
 * 用于剧本解析阶段逐个生成视觉描述
 */
export const generateVisualPrompt = async (
  type: 'character' | 'scene',
  item: Character | Scene,
  genre: string,
  visualStyle: string = 'anime',
  language: string = '中文',
  artDirection: ArtDirection,
  model?: string
): Promise<{ visualPrompt: string; negativePrompt: string }> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateVisualPrompt 调用 - 生成${type === 'character' ? '角色' : '场景'}视觉提示词，使用模型: ${resolvedModel}`);
  logScriptProgress(`正在生成${type === 'character' ? '角色' : '场景'}视觉提示词...`);

  const stylePrompt = getStylePrompt(visualStyle);

  const itemInfo = type === 'character' 
    ? `Name: ${(item as Character).name}
Gender: ${(item as Character).gender}
Age: ${(item as Character).age}
Personality: ${(item as Character).personality}`
    : `Location: ${(item as Scene).location}
Time: ${(item as Scene).time}
Atmosphere: ${(item as Scene).atmosphere}`;

  const prompt = `You are a world-class visual prompt engineer for ${visualStyle} productions.
Your task is to create a detailed visual prompt for generating a ${type} image in a ${genre} production.

## ${type === 'character' ? 'Character' : 'Scene'} Information
${itemInfo}
Visual Style: ${visualStyle} (${stylePrompt})

## Art Direction Guidelines
${artDirection.consistencyAnchors}

## Design Rules
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
${artDirection.moodKeywords.join(', ')}

## Your Task
Create a comprehensive visual prompt that will be used to generate a ${type} image.

CRITICAL REQUIREMENTS:
1. Describe the ${type} in DETAIL:
   ${type === 'character' ? `
   - Facial features (eyes, nose, mouth, eyebrows, expression)
   - Hair (length, color, texture, style, accessories)
   - Body type and proportions
   - Clothing/outfit (style, color, materials, accessories)` : `
   - Environment details (background, foreground, middle ground)
   - Atmospheric elements (weather, lighting, mood)
   - Composition and framing
   - Objects and props in the scene`}
   
2. Apply Art Direction:
   - Follow the color palette guidelines
   - Use the specified lighting style
   - Apply the texture style
   - Incorporate the mood keywords
   
3. Be Specific and Actionable:
   - Use concrete, descriptive language suitable for image generation AI
   - Include specific details about materials, textures, and lighting
   - Describe the pose and composition
   
4. Language:
   - Write the prompt in ${language}
   - Use natural, flowing language

Output the result in the following JSON format:
{
  "visualPrompt": "detailed visual prompt (200-400 words)",
  "negativePrompt": "negative prompt describing what to avoid (50-100 words)"
}`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.4, 4096));
    const cleanedText = cleanJsonString(responseText);
    const result = JSON.parse(cleanedText);

    logger.debug(LogCategory.AI, `✅ ${type === 'character' ? '角色' : '场景'}视觉提示词生成完成`);
    return {
      visualPrompt: result.visualPrompt || '',
      negativePrompt: result.negativePrompt || ''
    };
  } catch (error: any) {
    logger.error(LogCategory.AI, `❌ ${type === 'character' ? '角色' : '场景'}视觉提示词生成失败:`, error);
    throw new Error(`${type === 'character' ? '角色' : '场景'}视觉提示词生成失败: ${error.message}`);
  }
};

export async function generateVisualPrompts(
  characters: Character[],
  scenes: Scene[],
  artDirection: ArtDirection,
  language: string = '中文',
  model?: string
): Promise<{ characters: string[]; scenes: string[] }> {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateVisualPrompts 调用 - 批量生成视觉提示词，使用模型: ${resolvedModel}`);

  const characterPromises = characters.map(char => 
    generateCharacterVisualPrompt(char, artDirection, language, resolvedModel)
  );

  const scenePromises = scenes.map(scene => 
    generateSceneVisualPrompt(scene, artDirection, language, resolvedModel)
  );

  const [characterResults, sceneResults] = await Promise.all([
    Promise.all(characterPromises),
    Promise.all(scenePromises)
  ]);

  logger.debug(LogCategory.AI, '✅ 所有视觉提示词生成完成');
  return {
    characters: characterResults,
    scenes: sceneResults
  };
};

/**
 * 批量生成角色视觉提示词（包含正负提示词）
 * 用于剧本解析阶段批量生成所有角色的视觉描述
 */
export const generateAllCharacterPrompts = async (
  characters: Character[],
  artDirection: ArtDirection,
  genre: string,
  visualStyle: string,
  language: string = '中文',
  model?: string
): Promise<Array<{ visualPrompt: string; negativePrompt: string }>> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateAllCharacterPrompts 调用 - 批量生成角色视觉提示词，使用模型: ${resolvedModel}`);
  logScriptProgress('正在批量生成角色视觉提示词...');

  const stylePrompt = getStylePrompt(visualStyle);

  const prompt = `You are a world-class visual prompt engineer for ${visualStyle} productions.
Your task is to create detailed visual prompts for multiple characters in a ${genre} production.

## Art Direction Guidelines
${artDirection.consistencyAnchors}

## Character Design Rules
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
${artDirection.moodKeywords.join(', ')}

## Characters
${characters.map((c, i) => `
${i + 1}. ${c.name}
   - Gender: ${c.gender}
   - Age: ${c.age}
   - Personality: ${c.personality}
   - Visual Style: ${visualStyle} (${stylePrompt})
`).join('\n')}

## Your Task
Create visual prompts for ALL characters above. For each character, generate:
1. A detailed visual prompt (200-400 words) describing their appearance
2. A negative prompt describing what to avoid

CRITICAL REQUIREMENTS for each character:
1. Describe appearance in DETAIL:
   - Facial features (eyes, nose, mouth, eyebrows, expression)
   - Hair (length, color, texture, style, accessories)
   - Body type and proportions
   - Clothing/outfit (style, color, materials, accessories)
   
2. Apply Art Direction:
   - Follow the color palette guidelines
   - Use the specified lighting style
   - Apply the texture style
   - Incorporate the mood keywords
   
3. Be Specific and Actionable:
   - Use concrete, descriptive language suitable for image generation AI
   - Include specific details about materials, textures, and lighting
   - Describe the pose and composition
   
4. Language:
   - Write prompts in ${language}
   - Use natural, flowing language

Output ONLY valid JSON with this exact structure:
{
  "results": [
    {
      "characterName": "character name",
      "visualPrompt": "detailed visual prompt...",
      "negativePrompt": "negative prompt describing what to avoid..."
    },
    ...
  ]
}`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 8192, 'json_object'));
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    if (!parsed.results || !Array.isArray(parsed.results)) {
      throw new Error('批量生成结果格式不正确');
    }

    const results = parsed.results.map((r: any) => ({
      visualPrompt: r.visualPrompt || '',
      negativePrompt: r.negativePrompt || ''
    }));

    logger.debug(LogCategory.AI, '✅ 批量角色视觉提示词生成完成');
    return results;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 批量角色视觉提示词生成失败:', error);
    throw new Error(`批量角色视觉提示词生成失败: ${error.message}`);
  }
};
