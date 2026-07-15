/**
 * 视觉资产生成服务
 * 包含美术指导文档生成、角色/场景视觉提示词生成、图像生成
 */

import { Character, Scene, AspectRatio, ArtDirection, CharacterTurnaroundPanel, Prop } from "../../types";
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
  VISUAL_STYLE_PROMPTS_CN,
} from './promptConstants';
import { callImageApi, callDramaBackendVLApi, callDramaBackendSpliteGridApi, callDramaBackendInpaintApi, callDramaBackendStyleTransferApi, callDramaBackendIPAStyleTransferApi, callDramaBackendPromptEnhanceApi, callDramaBackendVideoMsrApi, callDramaBackendVideoMkrApi, callDramaBackend360HdriApi } from '../adapters/imageAdapter';
import { buildEraContextBlock } from './eraContext';

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

  const eraBlock = buildEraContextBlock(title, genre, characters, language);
  logger.debug(LogCategory.AI, `📖 时代背景注入: ${eraBlock.split('\n')[1]?.trim() || 'unknown'}`);

  const prompt = `You are a world-class Art Director for ${visualStyle} productions. 
Your job is to create a unified Art Direction Brief that will guide ALL visual prompt generation for characters, scenes, and shots in a single project. This document ensures perfect visual consistency across every generated image.

## Project Info
- Title: ${title}
- Genre: ${genre}
- Logline: ${logline}
- Visual Style: ${visualStyle} (${stylePrompt})
- Language: ${language}
${eraBlock}
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
  resourceId?: string,
  negativePrompt?: string
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
        // 当prompt已包含角色/场景一致性要求时（AI增强版或含结构化段落），不再重复包裹
        const hasConsistencySection = /角色一致性|CHARACTER CONSISTENCY|Scene consistency/i.test(prompt);
        if (hasConsistencySection) {
          finalPrompt = prompt;
        } else {
          finalPrompt = `Generate cinematic shot matching: "${prompt}"

Character consistency requirements:
- Facial features, hair, clothing must match character references exactly
- Use turnaround sheet panel that best matches camera angle
- Props and items must match their reference images

Scene consistency requirements:
- Maintain visual style, lighting, and atmosphere from scene reference`;
        }
      }
    }

    logger.debug(LogCategory.AI, `📝 图像生成提示词:\n${'='.repeat(80)}\n${finalPrompt}\n${'='.repeat(80)}`);

    const imageUrl = await callImageApi({
      prompt: finalPrompt,
      referenceImages,
      aspectRatio,
      resourceType,
      resourceId,
      negativePrompt,
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
): Promise<{ visualPrompt: string; negativePrompt: string }> => {
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

## Character Visual Constraints
【标志性姿态】必须展现角色的标志性姿态：${character.signaturePose?.polished || character.signaturePose?.original || '待补充'}
【微动作特征】角色必须携带其微动作特征：${character.microAction?.polished || character.microAction?.original || '无特殊微动作'}

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
   - 【MANDATORY】Include signature pose: Must showcase the character's iconic posture from their signaturePose description
   - 【MANDATORY】Include micro-actions: Must incorporate the character's distinctive micro-movements from their microAction description
   - 【MANDATORY】Silhouette & Linework: Describe S-grade silhouette, body curves, and line aesthetics
   - 【MANDATORY】Body Part Close-ups: Include specific body part details (eyes, lips, fingers, ankles, etc.)
   - 【MANDATORY】Dynamic Motion: Describe walking, turning, hair-flipping, or other movement actions
   
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

Output JSON format:
{
  "visualPrompt": "detailed visual prompt text...",
  "negativePrompt": "things to avoid..."
}

- visualPrompt: Length 200-400 words. Describe the character appearance in ${language}.
- negativePrompt: Describe what should NOT appear (unwanted styles, distortions, etc.) in ${language}.`;
  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 4096));
    let visualPrompt = responseText.trim();
    let negativePrompt = '';
    try {
      const cleaned = cleanJsonString(responseText);
      const parsed = JSON.parse(cleaned);
      if (parsed.visualPrompt) visualPrompt = parsed.visualPrompt;
      if (parsed.negativePrompt) negativePrompt = parsed.negativePrompt;
    } catch {
      // fallback: use raw response as visual prompt
    }
    logger.debug(LogCategory.AI, '✅ 角色视觉提示词生成完成');
    return { visualPrompt, negativePrompt };
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
): Promise<{ visualPrompt: string; negativePrompt: string }> => {
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
   - Environment and background elements (buildings, streets, weather, sky)
   - Architecture and structures
   - Natural elements (sky, water, vegetation)
   - Atmospheric effects (fog, mist, rain, particles, lighting)
   
2. Apply Art Direction:
   - Follow the color palette guidelines
   - Use the specified lighting style
   - Apply the texture style
   - Incorporate the mood keywords
   
3. Be Specific and Actionable:
   - Use concrete, descriptive language suitable for image generation AI
   - Include specific details about materials, textures, and lighting
   - Describe the composition and perspective
   
4. ⛔ ABSOLUTELY NO CHARACTERS - THIS IS THE MOST IMPORTANT RULE:
   - This is a PURE SCENE/ENVIRONMENT shot with ZERO characters
   - DO NOT write about any person, human figure, character, silhouette, or crowd
   - DO NOT use words like 他/她/男子/女子/人物/角色/穿着 in the description
   - DO NOT describe human actions, poses, emotions, or appearances
   - Focus ONLY on: buildings, weather, lighting, atmosphere, objects, nature
   - If you describe a location, describe it as empty - no one is there
   
5. Language:
   - Write the prompt in ${language}
   - Use natural, flowing language

Output JSON format:
{
  "visualPrompt": "detailed visual prompt text for the scene...",
  "negativePrompt": "scene-specific things to avoid..."
}

- visualPrompt: Length 200-400 words. Describe the scene in ${language}.
- negativePrompt: Describe scene-specific visual elements to avoid in ${language}.`;

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, resolvedModel, 0.4, 4096));
    let visualPrompt = responseText.trim();
    let negativePrompt = '';
    try {
      const cleaned = cleanJsonString(responseText);
      const parsed = JSON.parse(cleaned);
      if (parsed.visualPrompt) visualPrompt = parsed.visualPrompt;
      if (parsed.negativePrompt) negativePrompt = parsed.negativePrompt;
    } catch {
      // fallback: use raw response as visual prompt
    }
    logger.debug(LogCategory.AI, '✅ 场景视觉提示词生成完成');
    return { visualPrompt, negativePrompt };
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
Personality: ${(item as Character).personality}
Signature Pose: ${(item as Character).signaturePose?.polished || (item as Character).signaturePose?.original || 'Not provided'}
Micro Action: ${(item as Character).microAction?.polished || (item as Character).microAction?.original || 'Not provided'}`
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
   - Clothing/outfit (style, color, materials, accessories)
   - 【MANDATORY】Include signature pose: Must showcase the character's iconic posture
   - 【MANDATORY】Include micro-actions: Must incorporate the character's distinctive micro-movements
   - 【MANDATORY】Silhouette & Linework: Describe S-grade silhouette, body curves, and line aesthetics
   - 【MANDATORY】Body Part Close-ups: Include specific body part details (eyes, lips, fingers, ankles, etc.)
   - 【MANDATORY】Dynamic Motion: Describe walking, turning, hair-flipping, or other movement actions` : `
   - Environment details (background, foreground, middle ground)
   - Atmospheric elements (weather, lighting, mood)
   - Composition and framing
   - Objects and props in the scene
   ⛔ STRICT RULE: This is a PURE SCENE IMAGE with NO characters. Do NOT describe any person, human figure, character, or crowd. Focus only on the empty environment.`}
   
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

/**
 * 调用 Drama Backend image2character API 生成角色立绘图（三视图）
 * 基于角色设计图，由服务端模型自动生成角色立绘图
 */
export const generateCharacterFromDesignImage = async (
  character: Character,
  designImageUrl: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  logger.debug(LogCategory.AI, `🎨 generateCharacterFromDesignImage 调用 - 基于设计图生成角色立绘图: ${character.name}`);

  try {
    const imageUrl = await callImageApi({
      prompt: `Character turnaround sheet for ${character.name}`,
      referenceImages: [designImageUrl],
      isCharacterTurnaround: true,
      resourceType,
      resourceId,
    });

    logger.debug(LogCategory.AI, '✅ 角色立绘图生成完成');
    return imageUrl;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 角色立绘图生成失败:', error);
    throw new Error(`角色立绘图生成失败: ${error.message}`);
  }
};

/**
 * 生成分镜图像（格子分镜）
 * 调用 Drama Backend image2storyboard API，根据文本描述生成分镜图像
 */
export const generateStoryboardImage = async (
  prompt: string,
  gridnum: number = 4,
  itemWidth: number = 1024,
  referenceImage?: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎨 generateStoryboardImage 调用 - 生成分镜图像`);
    logger.debug(LogCategory.AI, `📝 分镜提示词:\n${'='.repeat(80)}\n${prompt}\n${'='.repeat(80)}`);

    const imageUrl = await callImageApi({
      prompt,
      referenceImages: referenceImage ? [referenceImage] : [],
      isStoryboard: true,
      gridnum,
      itemWidth,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'storyboard-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt: prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, '✅ 分镜图像生成完成');
    return imageUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'storyboard-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt: prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`分镜图像生成失败: ${error.message}`);
  }
};

/**
 * 生成图像分割网格
 * 调用 Drama Backend image2splitegrid API，将图像分割成网格布局
 * 返回分割后的多张图片的 local: 引用
 */
export const generateSpliteGridImage = async (
  imageUrl: string,
  row: number = 2,
  column: number = 2,
  targetWidth: number = 1024,
  targetHeight: number = 720,
  resourceType?: string,
  resourceId?: string,
  selectedIndices?: number[]
): Promise<string[]> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🔲 generateSpliteGridImage 调用 - 图像分割网格`);
    logger.debug(LogCategory.AI, `📐 网格参数: ${row}行 x ${column}列, 目标尺寸: ${targetWidth}x${targetHeight}`);

    const localUrls = await callDramaBackendSpliteGridApi({
      prompt: '',
      referenceImages: [imageUrl],
      isSpliteGrid: true,
      spliteGridRow: row,
      spliteGridColumn: column,
      spliteGridTargetWidth: targetWidth,
      spliteGridTargetHeight: targetHeight,
      resourceType,
      resourceId,
    }, undefined, selectedIndices);

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'splitegrid-' + Date.now(),
      resourceName: `${row}x${column} grid`,
      status: 'success',
      model: imageModelId,
      prompt: `split image into ${row}x${column} grid`,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 图像分割网格完成，共 ${localUrls.length} 张图片`);
    return localUrls;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'splitegrid-' + Date.now(),
      resourceName: `${row}x${column} grid`,
      status: 'failed',
      model: imageModelId,
      prompt: `split image into ${row}x${column} grid`,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`图像分割网格失败: ${error.message}`);
  }
};

/**
 * 生成图像修复（Inpainting）
 * 调用 Drama Backend image2inpaint API，对图像进行修复或编辑
 * 返回修复后的图片 local: 引用
 */
export const generateInpaintImage = async (
  imageUrl: string,
  prompt: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🩹 generateInpaintImage 调用 - 图像修复`);
    logger.debug(LogCategory.AI, `📝 修复提示词: ${prompt}`);

    const localUrl = await callDramaBackendInpaintApi({
      prompt,
      referenceImages: [imageUrl],
      isInpaint: true,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'inpaint-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 图像修复完成: ${localUrl}`);
    return localUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'inpaint-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`图像修复失败: ${error.message}`);
  }
};

/**
 * 360° HDRI 全景图像生成
 * 调用 Drama Backend image2360hdri API，将输入图像转换为 360° 全景 HDRI 图像
 * 返回生成的 HDRI 全景图片 local: 引用
 */
export const generate360HdriImage = async (
  imageUrl?: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🌐 generate360HdriImage 调用 - 360° HDRI 全景生成`);
    logger.debug(LogCategory.AI, `🖼️ 输入图像: ${imageUrl || '无（文生全景）'}`);

    const localUrl = await callDramaBackend360HdriApi(imageUrl);

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: '360hdri-' + Date.now(),
      resourceName: '360° HDRI 全景',
      status: 'success',
      model: imageModelId,
      prompt: '360 HDRI generation',
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 360° HDRI 全景生成完成: ${localUrl}`);
    return localUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: '360hdri-' + Date.now(),
      resourceName: '360° HDRI 全景',
      status: 'failed',
      model: imageModelId,
      prompt: '360 HDRI generation',
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`360° HDRI 全景生成失败: ${error.message}`);
  }
};

/**
 * 风格迁移生成
 * 调用 Drama Backend image2styletransfer API，将风格参考图的风格迁移到目标图像上
 * 返回风格迁移后的图片 local: 引用
 */
export const generateStyleTransferImage = async (
  targetImageUrl: string,
  styleImageUrl: string,
  resourceType?: string,
  resourceId?: string,
  prompt?: string,
  enhance?: boolean,
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎨 generateStyleTransferImage 调用 - 风格迁移`);
    logger.debug(LogCategory.AI, `🖼️ 目标图像: ${targetImageUrl}`);
    logger.debug(LogCategory.AI, `🎯 风格参考图: ${styleImageUrl}`);

    const localUrl = await callDramaBackendStyleTransferApi(
      targetImageUrl,
      styleImageUrl,
      undefined,
      prompt,
      enhance,
    );

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'styletransfer-' + Date.now(),
      resourceName: '风格迁移',
      status: 'success',
      model: imageModelId,
      prompt: 'style transfer',
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 风格迁移完成: ${localUrl}`);
    return localUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'styletransfer-' + Date.now(),
      resourceName: '风格迁移',
      status: 'failed',
      model: imageModelId,
      prompt: 'style transfer',
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`风格迁移失败: ${error.message}`);
  }
};

/**
 * IPA 风格迁移生成
 * 调用 Drama Backend image2ipastyletransfer API，基于参考图像进行 IPA 风格迁移
 * 返回风格迁移后的图片 local: 引用
 */
export const generateIPAStyleTransferImage = async (
  prompt: string,
  referenceImages: string[],
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎨 generateIPAStyleTransferImage 调用 - IPA 风格迁移`);
    logger.debug(LogCategory.AI, `📝 提示词: ${prompt}`);
    logger.debug(LogCategory.AI, `🖼️ 参考图数量: ${referenceImages.length}`);

    const localUrl = await callImageApi({
      prompt,
      referenceImages,
      isIPAStyleTransfer: true,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'ipastyletransfer-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ IPA 风格迁移完成: ${localUrl}`);
    return localUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'ipastyletransfer-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`IPA 风格迁移失败: ${error.message}`);
  }
};

/**
 * 动漫风格图像生成
 * 调用 Drama Backend txt2imageanime API，生成动漫风格图像
 * 返回生成的图片 local: 引用
 */
export const generateAnimeImage = async (
  prompt: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎨 generateAnimeImage 调用 - 动漫风格生成`);
    logger.debug(LogCategory.AI, `📝 提示词: ${prompt}`);

    const localUrl = await callImageApi({
      prompt,
      isAnime: true,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'anime-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 动漫风格生成完成: ${localUrl}`);
    return localUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'anime-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`动漫风格生成失败: ${error.message}`);
  }
};

/**
 * 视觉语言模型推理
 * 调用 Drama Backend image2vl API，基于图像和文本进行视觉语言推理
 */
export const generateVisualLanguage = async (
  systemPrompt: string,
  prompt: string,
  referenceImage?: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🧠 generateVisualLanguage 调用 - 视觉语言推理`);
    logger.debug(LogCategory.AI, `📝 系统提示词: ${systemPrompt}`);
    logger.debug(LogCategory.AI, `📝 用户提示词: ${prompt}`);

    const output = await callDramaBackendVLApi({
      prompt,
      systemPrompt,
      referenceImages: referenceImage ? [referenceImage] : [],
      isVisualLanguage: true,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'vl-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt: prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, '✅ 视觉语言推理完成');
    return output;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'vl-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt: prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`视觉语言推理失败: ${error.message}`);
  }
};

/**
 * 提示词增强
 * 调用 Drama Backend image2promptenhance API，根据输入提示词生成更丰富的提示词
 */
export const generatePromptEnhanceImage = async (
  prompt: string,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `✨ generatePromptEnhanceImage 调用 - 提示词增强`);
    logger.debug(LogCategory.AI, `📝 原始提示词: ${prompt}`);

    const enhancedPrompt = await callDramaBackendPromptEnhanceApi(prompt);

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'promptenhance-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 提示词增强完成，长度: ${enhancedPrompt.length} 字符`);
    return enhancedPrompt;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'promptenhance-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`提示词增强失败: ${error.message}`);
  }
};

export async function generateVisualPrompts(
  characters: Character[],
  scenes: Scene[],
  artDirection: ArtDirection,
  language: string = '中文',
  model?: string
): Promise<{ characters: Array<{ visualPrompt: string; negativePrompt: string }>; scenes: Array<{ visualPrompt: string; negativePrompt: string }> }> {
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

// ============================================
// 视觉风格自动检测
// ============================================

/**
 * 从剧本文本自动推断最匹配的视觉风格
 * 供"自动检测风格"功能使用
 */
export const suggestVisualStyleFromScript = async (
  scriptText: string,
  language: string = '中文',
  model?: string
): Promise<{ suggestedStyle: string; isCustom: boolean; confidence: string; reason: string }> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🔍 suggestVisualStyleFromScript 调用 - 使用模型: ${resolvedModel}`);

  const predefinedList = Object.entries(VISUAL_STYLE_PROMPTS_CN)
    .map(([key, cn]) => `- ${key}: ${cn}`)
    .join('\n');

  const prompt = `You are a professional art director. Determine the visual style for a script.

## STEP 1 — Extract Keywords
List all visual style keywords/phrases from the script (e.g., "水墨写实", "8-bit pixel art", "film noir", "赛博朋克", "watercolor", "classical Chinese painting"). If the script contains explicit style names, treat them as the ground truth.

## STEP 2 — Check Predefined Styles
Here are the available predefined styles:
${predefinedList}

Compare your extracted keywords against them. Ask yourself: is this an EXACT semantic match, or am I stretching?

## STEP 3 — Decide
- If the script gives an explicit style name (like "水墨写实", "像素风", "水彩") → isCustom: true, use that exact name.
- If none of the predefined styles is an unambiguous match → isCustom: true.
- Use isCustom: false ONLY when the script's style is literally the same concept as a predefined style (e.g., script says "anime" → anime). Do NOT treat "pixel art" as a subset of "2d-animation", or "ink wash" as a subset of "oil painting".
- When in doubt, isCustom: true. A custom style name is always better than a wrong match.

## Output JSON
{
  "extractedKeywords": "comma-separated list of style keywords from script",
  "suggestedStyle": "the style name",
  "isCustom": true,
  "confidence": "high|medium|low",
  "reason": "Brief explanation in ${language}"
}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.3, 1024, 'json_object')
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const result = {
      suggestedStyle: parsed.suggestedStyle || 'live-action',
      isCustom: !!parsed.isCustom,
      confidence: parsed.confidence || 'medium',
      reason: parsed.reason || '',
    };

    logger.debug(LogCategory.AI, `✅ 风格检测完成: ${result.suggestedStyle} (${result.confidence})`);
    return result;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 风格检测失败:', error);
    throw new Error(`视觉风格检测失败: ${error.message}`);
  }
};

/**
 * 批量生成道具视觉提示词
 */
export const generateAllPropPrompts = async (
  props: Prop[],
  artDirection: ArtDirection | undefined,
  visualStyle: string = 'anime',
  language: string = '中文',
  model?: string
): Promise<Array<{ visualPrompt: string; negativePrompt: string }>> => {
  if (!props.length) return [];
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🎨 generateAllPropPrompts 调用 - 生成道具视觉提示词，使用模型: ${resolvedModel}`);
  logScriptProgress('正在生成道具视觉提示词...');

  const stylePrompt = getStylePrompt(visualStyle);

  const prompt = `You are a world-class visual prompt engineer for ${visualStyle} productions.
Your task is to create detailed visual prompts for key props/items in a production.

## Visual Style
${visualStyle} (${stylePrompt})

${artDirection ? `
## Art Direction Guidelines
${artDirection.consistencyAnchors}

## Color Palette Guidelines
- Primary: ${artDirection.colorPalette.primary}
- Secondary: ${artDirection.colorPalette.secondary}
- Accent: ${artDirection.colorPalette.accent}
- Saturation: ${artDirection.colorPalette.saturation}
- Temperature: ${artDirection.colorPalette.temperature}

## Lighting & Texture
- Lighting Style: ${artDirection.lightingStyle}
- Texture Style: ${artDirection.textureStyle}

## Mood Keywords
${artDirection.moodKeywords.join(', ')}` : ''}

## Props
${props.map((p, i) => `
${i + 1}. ${p.name}
   - Category: ${p.category}
   - Description: ${p.description}
`).join('\n')}

## Your Task
For EACH prop listed above, create a detailed visual prompt describing how it looks in the ${visualStyle} style.

CRITICAL REQUIREMENTS:
1. Describe the prop's appearance in detail (materials, colors, shape, size, texture)
2. Apply the visual style and art direction guidelines
3. Be specific and actionable for image generation AI
4. Write prompts in ${language}

Output ONLY valid JSON with this exact structure:
{
  "results": [
    {
      "propName": "prop name",
      "visualPrompt": "detailed visual prompt describing the prop...",
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
      throw new Error('批量道具提示词生成结果格式不正确');
    }

    const results = parsed.results.map((r: any) => ({
      visualPrompt: r.visualPrompt || '',
      negativePrompt: r.negativePrompt || ''
    }));

    logger.debug(LogCategory.AI, '✅ 批量道具视觉提示词生成完成');
    return results;
  } catch (error: any) {
    logger.error(LogCategory.AI, '❌ 批量道具视觉提示词生成失败:', error);
    throw new Error(`批量道具视觉提示词生成失败: ${error.message}`);
  }
};

/**
 * 图像转视频 MSR 生成
 * 调用 Drama Backend image2videomsr API，基于图像生成视频（MSR 多帧超分辨率技术）
 * 返回保存后的本地 video: 引用
 */
export const generateVideoMsr = async (
  prompt: string,
  referenceImages: string[] = [],
  backgroundImage: string,
  width: number = 640,
  height: number = 320,
  duration: number = 5,
  fps: number = 30,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎬 generateVideoMsr 调用 - 图像转视频 MSR`);
    logger.debug(LogCategory.AI, `📝 提示词: ${prompt}`);
    logger.debug(LogCategory.AI, `🖼️ 参考图数量: ${referenceImages.length}`);
    logger.debug(LogCategory.AI, `🎥 视频参数: ${width}x${height}, ${duration}秒, ${fps}fps`);

    const localVideoUrl = await callDramaBackendVideoMsrApi({
      prompt,
      referenceImages,
      isVideoMsr: true,
      videoMsrWidth: width,
      videoMsrHeight: height,
      videoMsrDuration: duration,
      videoMsrFps: fps,
      videoMsrBackground: backgroundImage,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'videomsr-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 图像转视频 MSR 完成: ${localVideoUrl}`);
    return localVideoUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'videomsr-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`图像转视频 MSR 失败: ${error.message}`);
  }
};

/**
 * 图像转视频 MKR 生成
 * 调用 Drama Backend image2videomkr API，基于多关键帧生成视频
 * 返回保存后的本地 video: 引用
 */
export const generateVideoMkr = async (
  prompt: string,
  images: { image: string; frame_index: number }[] = [],
  width: number = 640,
  height: number = 320,
  duration: number = 12,
  fps: number = 30,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎬 generateVideoMkr 调用 - 图像转视频 MKR`);
    logger.debug(LogCategory.AI, `📝 提示词: ${prompt}`);
    logger.debug(LogCategory.AI, `🖼️ 关键帧数量: ${images.length}`);
    logger.debug(LogCategory.AI, `🎥 视频参数: ${width}x${height}, ${duration}秒, ${fps}fps`);

    const localVideoUrl = await callDramaBackendVideoMkrApi({
      prompt,
      isVideoMkr: true,
      videoMkrWidth: width,
      videoMkrHeight: height,
      videoMkrDuration: duration,
      videoMkrFps: fps,
      videoMkrImages: images,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'videomkr-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 图像转视频 MKR 完成: ${localVideoUrl}`);
    return localVideoUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'videomkr-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      error: error.message,
      duration: Date.now() - startTime
    });

    throw new Error(`图像转视频 MKR 失败: ${error.message}`);
  }
};

export const generateVideoMkrGrid = async (
  prompt: string,
  refImage: string,
  gridtype: number = 4,
  frame_indexs: number[] = [0, 0, 0, 0],
  width: number = 640,
  height: number = 320,
  duration: number = 12,
  fps: number = 30,
  resourceType?: string,
  resourceId?: string
): Promise<string> => {
  const startTime = Date.now();
  const activeImageModel = getActiveModel('image');
  const imageModelId = activeImageModel?.apiModel || activeImageModel?.id || 'dramabackend';

  try {
    logger.debug(LogCategory.AI, `🎬 generateVideoMkrGrid 调用 - 图像转视频 MKR Grid`);
    logger.debug(LogCategory.AI, `📝 提示词: ${prompt}`);
    logger.debug(LogCategory.AI, `🖼️ 宫格类型: ${gridtype}, 帧索引: [${frame_indexs.join(', ')}]`);
    logger.debug(LogCategory.AI, `🎥 视频参数: ${width}x${height}, ${duration}秒, ${fps}fps`);

    const localVideoUrl = await callDramaBackendVideoMkrGridApi({
      prompt,
      isVideoMkrGrid: true,
      refImage,
      videoMkrGridWidth: width,
      videoMkrGridHeight: height,
      videoMkrGridDuration: duration,
      videoMkrGridFps: fps,
      videoMkrGridType: gridtype,
      videoMkrGridFrameIndexs: frame_indexs,
      resourceType,
      resourceId,
    });

    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'videomkrgrid-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'success',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    logger.debug(LogCategory.AI, `✅ 图像转视频 MKR Grid 完成: ${localVideoUrl}`);
    return localVideoUrl;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'keyframe',
      resourceId: 'videomkrgrid-' + Date.now(),
      resourceName: prompt.substring(0, 50) + '...',
      status: 'failed',
      model: imageModelId,
      prompt,
      duration: Date.now() - startTime
    });

    throw new Error(`图像转视频 MKR Grid 失败: ${error.message}`);
  }
};
