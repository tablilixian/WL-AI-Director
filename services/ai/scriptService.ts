/**
 * 剧本处理服务
 * 包含剧本解析、分镜生成、续写、改写等功能
 */

import { ScriptData, Shot, Scene, ArtDirection, Prop } from '../../types';
import { addRenderLogWithTokens } from '../renderLogService';
import { logger, LogCategory } from '../logger';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  chatCompletionStream,
  logScriptProgress,
  getDefaultChatModelId,
} from './apiCore';
import { getStylePrompt } from './promptConstants';
import {
  generateArtDirection,
  generateAllCharacterPrompts,
  generateVisualPrompt,
} from './visualService';
import { detectOpeningHook, detectMutedTest } from './scriptQualityService';
import {
  parseWithSkill,
  validateSceneRefMapping,
  analyzeCharacterVariations,
  SCRIPT_PARSER_SKILL_DESCRIPTION,
} from './scriptParserSkill';

// Re-export 日志回调函数（保持外部 API 兼容）
export { setScriptLogCallback, clearScriptLogCallback, logScriptProgress } from './apiCore';

// ============================================
// 剧本解析
// ============================================

/**
 * Agent 1 & 2: Script Structuring & Breakdown
 * 解析原始文本为结构化剧本数据
 * 使用 ScriptParserSkill 支持多策略解析（专业格式/自由格式）
 */
export const parseScriptToData = async (
  rawText: string,
  language: string = '中文',
  model?: string,
  visualStyle: string = 'live-action',
): Promise<ScriptData> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(
    LogCategory.AI,
    `📝 parseScriptToData 调用 - 使用模型: ${resolvedModel}, 视觉风格: ${visualStyle}, 解析策略: ${SCRIPT_PARSER_SKILL_DESCRIPTION.name} v${SCRIPT_PARSER_SKILL_DESCRIPTION.version}`,
  );
  logScriptProgress('正在解析剧本结构...');
  const startTime = Date.now();

  try {
    const { parsed, format, detection } = await parseWithSkill(rawText, language, resolvedModel);

    logger.debug(
      LogCategory.AI,
      `📋 B01 解析完成: 格式=${format}, 置信度=${detection.confidence}, 场景数=${Array.isArray(parsed.scenes) ? parsed.scenes.length : 0}, 段落数=${Array.isArray(parsed.storyParagraphs) ? parsed.storyParagraphs.length : 0}`,
    );

    // Enforce String IDs for consistency and init variations
    const characters = Array.isArray(parsed.characters)
      ? parsed.characters.map((c: any) => ({
          ...c,
          id: String(c.id),
          variations: [],
        }))
      : [];
    const scenes = Array.isArray(parsed.scenes)
      ? parsed.scenes.map((s: any) => ({ ...s, id: String(s.id) }))
      : [];
    let storyParagraphs = Array.isArray(parsed.storyParagraphs)
      ? parsed.storyParagraphs.map((p: any) => ({ ...p, sceneRefId: String(p.sceneRefId) }))
      : [];

    // B01 后处理: 校验 sceneRefId 映射，修复无效引用
    if (scenes.length > 0 && storyParagraphs.length > 0) {
      storyParagraphs = validateSceneRefMapping(storyParagraphs, scenes);
    }

    // B10: 分析角色跨场景变装（填充 character.variations）
    if (characters.length > 0 && scenes.length > 0) {
      const variedChars = await analyzeCharacterVariations(
        characters,
        scenes,
        storyParagraphs,
        resolvedModel,
        language,
      );
      // Merge back variations (characters array is the same objects)
      for (let i = 0; i < characters.length; i++) {
        if (variedChars[i]?.variations?.length) {
          characters[i].variations = variedChars[i].variations;
        }
      }
    }

    const genre = parsed.genre || '通用';

    // ========== Phase 1: 生成全局美术指导文档 ==========
    logger.debug(LogCategory.AI, `🎨 正在为角色和场景生成视觉提示词... 风格: ${visualStyle}`);
    logScriptProgress(`正在生成角色与场景的视觉提示词（风格：${visualStyle}）...`);

    let artDirection: ArtDirection | undefined;
    try {
      artDirection = await generateArtDirection(
        parsed.title || '未命名剧本',
        genre,
        parsed.logline || '',
        characters.map((c: any) => ({
          name: c.name,
          gender: c.gender,
          age: c.age,
          personality: c.personality,
        })),
        scenes.map((s: any) => ({ location: s.location, time: s.time, atmosphere: s.atmosphere })),
        visualStyle,
        language,
        model,
      );
      logger.debug(
        LogCategory.AI,
        `✅ 全局美术指导文档生成完成，风格关键词: ${artDirection.moodKeywords.join(', ')}`,
      );
    } catch (e) {
      logger.warn(LogCategory.AI, '⚠️ 全局美术指导文档生成失败，将使用默认风格:', e);
    }

    // ========== Phase 2: 批量生成角色视觉提示词 ==========
    if (characters.length > 0 && artDirection) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const batchResults = await generateAllCharacterPrompts(
          characters,
          artDirection,
          genre,
          visualStyle,
          language,
          model,
        );

        for (let i = 0; i < characters.length; i++) {
          if (batchResults[i] && batchResults[i].visualPrompt) {
            characters[i].visualPrompt = batchResults[i].visualPrompt;
            characters[i].negativePrompt = batchResults[i].negativePrompt;
          }
        }

        // Fallback: individually generate failed characters
        const failedCharacters = characters.filter((c: any) => !c.visualPrompt);
        if (failedCharacters.length > 0) {
          logger.debug(
            LogCategory.AI,
            `⚠️ ${failedCharacters.length} 个角色需要单独重新生成提示词`,
          );
          logScriptProgress(`${failedCharacters.length} 个角色需要单独重新生成...`);
          for (const char of failedCharacters) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              logger.debug(LogCategory.AI, `  重新生成角色提示词: ${char.name}`);
              logScriptProgress(`重新生成角色视觉提示词：${char.name}`);
              const prompts = await generateVisualPrompt(
                'character',
                char,
                genre,
                visualStyle,
                language,
                artDirection,
                resolvedModel,
              );
              char.visualPrompt = prompts.visualPrompt;
              char.negativePrompt = prompts.negativePrompt;
            } catch (e) {
              logger.error(
                LogCategory.AI,
                `Failed to generate visual prompt for character ${char.name}:`,
                e,
              );
            }
          }
        }
      } catch (e) {
        logger.error(LogCategory.AI, '批量角色提示词生成失败，回退到逐个生成模式:', e);
        for (let i = 0; i < characters.length; i++) {
          try {
            if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
            logger.debug(LogCategory.AI, `  生成角色提示词: ${characters[i].name}`);
            logScriptProgress(`生成角色视觉提示词：${characters[i].name}`);
            const prompts = await generateVisualPrompt(
              'character',
              characters[i],
              genre,
              visualStyle,
              language,
              artDirection,
              resolvedModel,
            );
            characters[i].visualPrompt = prompts.visualPrompt;
            characters[i].negativePrompt = prompts.negativePrompt;
          } catch (e2) {
            logger.error(
              LogCategory.AI,
              `Failed to generate visual prompt for character ${characters[i].name}:`,
              e2,
            );
          }
        }
      }
    } else if (characters.length > 0) {
      for (let i = 0; i < characters.length; i++) {
        try {
          if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1500));
          logger.debug(LogCategory.AI, `  生成角色提示词: ${characters[i].name}`);
          logScriptProgress(`生成角色视觉提示词：${characters[i].name}`);
          const prompts = await generateVisualPrompt(
            'character',
            characters[i],
            genre,
            visualStyle,
            language,
            artDirection,
            resolvedModel,
          );
          characters[i].visualPrompt = prompts.visualPrompt;
          characters[i].negativePrompt = prompts.negativePrompt;
        } catch (e) {
          logger.error(
            LogCategory.AI,
            `Failed to generate visual prompt for character ${characters[i].name}:`,
            e,
          );
        }
      }
    }

    // ========== Phase 3: 生成场景视觉提示词 ==========
    for (let i = 0; i < scenes.length; i++) {
      try {
        if (i > 0 || characters.length > 0)
          await new Promise((resolve) => setTimeout(resolve, 1500));
        logger.debug(LogCategory.AI, `  生成场景提示词: ${scenes[i].location}`);
        logScriptProgress(`生成场景视觉提示词：${scenes[i].location}`);
        const prompts = await generateVisualPrompt(
          'scene',
          scenes[i],
          genre,
          visualStyle,
          language,
          artDirection,
          resolvedModel,
        );
        scenes[i].visualPrompt = prompts.visualPrompt;
        scenes[i].negativePrompt = prompts.negativePrompt;
      } catch (e) {
        logger.error(
          LogCategory.AI,
          `Failed to generate visual prompt for scene ${scenes[i].location}:`,
          e,
        );
      }
    }

    logger.debug(LogCategory.AI, '✅ 视觉提示词生成完成！');
    logScriptProgress('视觉提示词生成完成');

    const result = {
      title: parsed.title || '未命名剧本',
      genre: genre,
      logline: parsed.logline || '',
      language: language,
      artDirection,
      characters,
      scenes,
      props: [],
      storyParagraphs,
    };

    const hookResult = detectOpeningHook(rawText);
    if (hookResult.score < 7) {
      logger.warn(
        LogCategory.AI,
        `⚠️ 剧本质量检测: 开篇评分 ${hookResult.score}/10 - ${hookResult.issues.map((i) => i.description).join('; ')}`,
      );
    }

    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'script-parse-' + Date.now(),
      resourceName: result.title,
      status: 'success',
      model: model ?? '',
      prompt: `ScriptParserSkill v${SCRIPT_PARSER_SKILL_DESCRIPTION.version} | format=${format} | scenes=${scenes.length} | paragraphs=${storyParagraphs.length}`,
      duration: Date.now() - startTime,
    });

    return result;
  } catch (error: any) {
    addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'script-parse-' + Date.now(),
      resourceName: '剧本解析',
      status: 'failed',
      model: model ?? '',
      prompt: `ScriptParserSkill v${SCRIPT_PARSER_SKILL_DESCRIPTION.version} | error=${error.message}`,
      error: error.message,
      duration: Date.now() - startTime,
    });
    throw error;
  }
};

// ============================================
// 道具提取
// ============================================

/**
 * 从剧本故事段落中提取关键道具/物品
 * 独立轻量调用，不稀释主解析 prompt
 * 道具指在多个镜头中重复出现、对视觉一致性重要的物品
 * （如武器、信件、地图、钥匙、照片、特殊饰品等）
 */
export const parsePropsFromStory = async (
  scriptData: ScriptData,
  model?: string,
): Promise<Prop[]> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `📦 parsePropsFromStory 调用 - 使用模型: ${resolvedModel}`);
  logScriptProgress('正在提取剧本中的关键道具...');

  const paragraphsText = scriptData.storyParagraphs
    .map((p) => p.text)
    .join('\n')
    .slice(0, 15000);

  if (!paragraphsText.trim()) return [];

  const charactersContext = scriptData.characters
    .map((c) => `${c.name}（${c.gender}，${c.age}，${c.personality}）`)
    .join('、');

  const scenesContext = scriptData.scenes
    .map((s) => `${s.location}（${s.time}，${s.atmosphere}）`)
    .join('、');

  const prompt = `从以下剧本故事中，提取对视觉一致性重要的关键道具/物品。

"道具/物品"指在多个镜头中重复出现、外观需要保持一致的重要物品。
包括但不限于：武器、信件/文件、地图、钥匙、饰品、特殊服装、交通工具、重要摆件等。
排除：临时性物品（一次性的杯子、纸巾）、背景装饰品（墙上的画）、角色本身。

## 剧本上下文
角色：${charactersContext}
场景：${scenesContext}

## 故事段落
${paragraphsText}

## 要求
1. 只提取"在多个场景/镜头中出现、外观一致性重要"的物品
2. 描述要具体（如"银色左轮手枪"而非"枪"）
3. 给出物品属于哪个角色（所有者和使用频率最高的角色ID）
4. 推测该物品最可能出现在哪些场景中（sceneId列表）

## 输出格式
{
  "props": [
    {
      "name": "物品名称",
      "category": "武器|文件|饰品|工具|交通工具|衣物|其他",
      "description": "外观描述（20-50字，具体到颜色/材质/特征）",
      "ownerCharacterId": "主要使用者的角色ID（如不明确则为null）",
      "sceneIds": ["常出现的场景ID列表"]
    }
  ]
}

如果没有符合条件的物品，返回 {"props": []}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.4, 4096, 'json_object'),
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const rawProps = Array.isArray(parsed.props) ? parsed.props : [];

    const props: Prop[] = rawProps
      .filter((p: any) => p && p.name && p.name.trim())
      .map((p: any, idx: number) => ({
        id: `prop-${Date.now()}-${idx}`,
        name: p.name.trim(),
        category: ['武器', '文件', '饰品', '工具', '交通工具', '衣物', '其他'].includes(p.category)
          ? p.category
          : '其他',
        description: (p.description || '').trim(),
        visualPrompt: '',
        negativePrompt: '',
        imageUrl: undefined,
        status: 'pending' as const,
      }));

    logger.debug(LogCategory.AI, `✅ 道具提取完成：共 ${props.length} 项`);
    logScriptProgress(`提取到 ${props.length} 个道具`);
    return props;
  } catch (error: any) {
    logger.warn(LogCategory.AI, '⚠️ 道具提取失败，将使用空列表:', error?.message);
    return [];
  }
};

// ============================================
// 分镜生成
// ============================================

/**
 * 生成分镜列表
 * 根据剧本数据和目标时长，为每个场景生成适量的分镜头
 */
export const generateShotList = async (
  scriptData: ScriptData,
  model?: string,
  rawScript?: string,
): Promise<Shot[]> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(
    LogCategory.AI,
    `🎬 generateShotList 调用 - 使用模型: ${resolvedModel}, 视觉风格: ${scriptData.visualStyle}${rawScript ? ', 附带原始剧本用于对白提取' : ''}`,
  );
  logScriptProgress('正在生成分镜列表...');

  if (!scriptData.scenes || scriptData.scenes.length === 0) {
    return [];
  }

  const lang = scriptData.language || '中文';
  const visualStyle = scriptData.visualStyle || 'live-action';
  const stylePrompt = getStylePrompt(visualStyle);
  const artDir = scriptData.artDirection;

  const artDirectionBlock = artDir
    ? `
      ⚠️ GLOBAL ART DIRECTION (MANDATORY for ALL visualPrompt fields):
      ${artDir.consistencyAnchors}
      Color Palette: Primary=${artDir.colorPalette.primary}, Secondary=${artDir.colorPalette.secondary}, Accent=${artDir.colorPalette.accent}
      Color Temperature: ${artDir.colorPalette.temperature}, Saturation: ${artDir.colorPalette.saturation}
      Lighting Style: ${artDir.lightingStyle}
      Texture: ${artDir.textureStyle}
      Mood Keywords: ${artDir.moodKeywords.join(', ')}
      Character Proportions: ${artDir.characterDesignRules.proportions}
      Line/Edge Style: ${artDir.characterDesignRules.lineWeight}
      Detail Level: ${artDir.characterDesignRules.detailLevel}
`
    : '';

  const processScene = async (scene: Scene, index: number): Promise<Shot[]> => {
    const sceneStartTime = Date.now();
    const paragraphs = scriptData.storyParagraphs
      .filter((p) => String(p.sceneRefId) === String(scene.id))
      .map((p) => p.text)
      .join('\n');

    if (!paragraphs.trim()) return [];

    // B02: 从原始剧本中提取该场景相关的原文片段，供 AI 提取对白
    let rawSceneText = '';
    if (rawScript) {
      const sceneKeywords = [scene.location, scene.time, scene.atmosphere].filter(Boolean);
      const paragraphKeywords = scriptData.storyParagraphs
        .filter((p) => String(p.sceneRefId) === String(scene.id))
        .slice(0, 3)
        .map((p) => p.text.slice(0, 80));
      const searchKeys = [...sceneKeywords, ...paragraphKeywords].filter((k) => k.length >= 4);
      const lines = rawScript.split('\n');
      let bestStart = -1,
        bestEnd = -1;
      let bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        let score = 0;
        for (const key of searchKeys) {
          if (lines[i].includes(key)) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestStart = Math.max(0, i - 5);
          bestEnd = Math.min(lines.length, i + 15);
        }
      }
      if (bestStart >= 0) {
        rawSceneText = lines.slice(bestStart, bestEnd).join('\n').slice(0, 3000);
      }
    }

    const targetDurationStr = scriptData.targetDuration || '60s';
    const targetSeconds = parseInt(targetDurationStr.replace(/[^\d]/g, '')) || 60;
    const totalShotsNeeded = Math.round(targetSeconds / 10);
    const scenesCount = scriptData.scenes.length;
    const shotsPerScene = Math.max(1, Math.round(totalShotsNeeded / scenesCount));

    const prompt = `
      Act as a professional cinematographer. Generate a detailed shot list (Camera blocking) for Scene ${index + 1}.
      Language for Text Output: ${lang}.
      
      IMPORTANT VISUAL STYLE: ${stylePrompt}
      All 'visualPrompt' fields MUST describe shots in this "${visualStyle}" style.
${artDirectionBlock}
      Scene Details:
      Location: ${scene.location}
      Time: ${scene.time}
      Atmosphere: ${scene.atmosphere}
      
      Scene Action:
      "${paragraphs.slice(0, 5000)}"
      
      ${
        rawSceneText
          ? `Raw Script for this scene (extract dialogue from here):
      "${rawSceneText}"
      `
          : ''
      }
      Context:
      Genre: ${scriptData.genre}
      Visual Style: ${visualStyle} (${stylePrompt})
      Target Duration (Whole Script): ${scriptData.targetDuration || 'Standard'}
      Total Shots Budget: ${totalShotsNeeded} shots (Each shot = 10 seconds of video)
      Shots for This Scene: Approximately ${shotsPerScene} shots
      
      Characters (CRITICAL: use 'id' for the 'characters' field in each shot, NOT the character name):
      ${JSON.stringify(scriptData.characters.map((c) => ({ id: c.id, name: c.name, desc: c.visualPrompt || c.personality })))}

      Professional Camera Movement Reference (Choose from these categories):
      - Horizontal Left Shot (向左平移) - Camera moves left
      - Horizontal Right Shot (向右平移) - Camera moves right
      - Pan Left Shot (平行向左扫视) - Pan left
      - Pan Right Shot (平行向右扫视) - Pan right
      - Vertical Up Shot (向上直线运动) - Move up vertically
      - Vertical Down Shot (向下直线运动) - Move down vertically
      - Tilt Up Shot (向上仰角运动) - Tilt upward
      - Tilt Down Shot (向下俯角运动) - Tilt downward
      - Zoom Out Shot (镜头缩小/拉远) - Pull back/zoom out
      - Zoom In Shot (镜头放大/拉近) - Push in/zoom in
      - Dolly Shot (推镜头) - Dolly in/out movement
      - Circular Shot (环绕拍摄) - Orbit around subject
      - Over the Shoulder Shot (越肩镜头) - Over shoulder perspective
      - Pan Shot (摇镜头) - Pan movement
      - Low Angle Shot (仰视镜头) - Low angle view
      - High Angle Shot (俯视镜头) - High angle view
      - Tracking Shot (跟踪镜头) - Follow subject
      - Handheld Shot (摇摄镜头) - Handheld camera
      - Static Shot (静止镜头) - Fixed camera position
      - POV Shot (主观视角) - Point of view
      - Bird's Eye View Shot (俯瞰镜头) - Overhead view
      - 360-Degree Circular Shot (360度环绕) - Full circle
      - Parallel Tracking Shot (平行跟踪) - Side tracking
      - Diagonal Tracking Shot (对角跟踪) - Diagonal tracking
      - Rotating Shot (旋转镜头) - Rotating movement
      - Slow Motion Shot (慢动作) - Slow-mo effect
      - Time-Lapse Shot (延时摄影) - Time-lapse
      - Canted Shot (斜视镜头) - Dutch angle
      - Cinematic Dolly Zoom (电影式变焦推轨) - Vertigo effect

      Instructions:
      1. Create EXACTLY ${shotsPerScene} shots (or ${shotsPerScene - 1} to ${shotsPerScene + 1} shots if needed for story flow) for this scene.
      2. CRITICAL: Each shot will be 10 seconds. Total shots must match the target duration formula: ${targetSeconds} seconds ÷ 10 = ${totalShotsNeeded} total shots across all scenes.
      3. DO NOT exceed ${shotsPerScene + 1} shots for this scene. Select the most important moments only.
      4. 'cameraMovement': Can reference the Professional Camera Movement Reference list above for inspiration, or use your own creative camera movements. You may use the exact English terms (e.g., "Dolly Shot", "Pan Right Shot", "Zoom In Shot", "Tracking Shot") or describe custom movements.
      5. 'shotSize': Specify the field of view (e.g., Extreme Close-up, Medium Shot, Wide Shot).
       6. 'actionSummary': Detailed description of what happens in the shot (in ${lang}).
       7. 'visualPrompt': Detailed description for image generation in ${visualStyle} style (OUTPUT IN ${lang}). Include style-specific keywords.${artDir ? ' MUST follow the Global Art Direction color palette, lighting, and mood.' : ''} Keep it under 50 words.
       ${rawSceneText ? `8. CRITICAL for 'dialogue': The dialogue field MUST be filled with the EXACT character dialogue extracted from the "Raw Script for this scene" above. Do NOT summarize or paraphrase. If a character speaks, put their exact words in the dialogue field of the corresponding shot. If no one speaks in this shot, set dialogue to empty string.` : ''}
       
       Output ONLY a valid JSON OBJECT with this exact structure (no markdown, no extra text):
       {
         "shots": [
           {
             "id": "string",
             "sceneId": "${scene.id}",
             "actionSummary": "string",
             "dialogue": "string (extract from Raw Script above ${rawSceneText ? '- use the exact spoken lines' : ''})",
            "cameraMovement": "string",
            "shotSize": "string",
            "characters": ["character_id_here"], // ⚠️ MUST use character 'id' from the Characters list above, NOT the name
            "keyframes": [
              {"id": "string", "type": "start|end", "visualPrompt": "string (MUST include ${visualStyle} style keywords${artDir ? ' and follow Art Direction' : ''})"}
            ]
          }
        ]
      }
    `;

    let responseText = '';
    try {
      logger.debug(LogCategory.AI, `  📡 场景 ${index + 1} API调用 - 模型: ${resolvedModel}`);
      responseText = await retryOperation(() =>
        chatCompletion(prompt, resolvedModel, 0.5, 8192, 'json_object'),
      );
      const text = cleanJsonString(responseText);
      const parsed = JSON.parse(text);

      const shots = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray((parsed as any).shots)
          ? (parsed as any).shots
          : [];

      const validShots = Array.isArray(shots) ? shots : [];
      const result = validShots.map((s: any) => ({
        ...s,
        sceneId: String(scene.id),
      }));

      addRenderLogWithTokens({
        type: 'script-parsing',
        resourceId: `shot-gen-scene-${scene.id}-${Date.now()}`,
        resourceName: `分镜生成 - 场景${index + 1}: ${scene.location}`,
        status: 'success',
        model: model ?? '',
        prompt: prompt.substring(0, 200) + '...',
        duration: Date.now() - sceneStartTime,
      });

      return result;
    } catch (e: any) {
      logger.error(LogCategory.AI, `Failed to generate shots for scene ${scene.id}`, e);
      try {
        logger.error(
          LogCategory.AI,
          `  ↳ sceneId=${scene.id}, sceneIndex=${index}, responseText(snippet)=`,
          String(responseText || '').slice(0, 500),
        );
      } catch {
        // ignore
      }

      addRenderLogWithTokens({
        type: 'script-parsing',
        resourceId: `shot-gen-scene-${scene.id}-${Date.now()}`,
        resourceName: `分镜生成 - 场景${index + 1}: ${scene.location}`,
        status: 'failed',
        model: model ?? '',
        prompt: prompt.substring(0, 200) + '...',
        error: e.message || String(e),
        duration: Date.now() - sceneStartTime,
      });

      return [];
    }
  };

  // Process scenes sequentially
  const BATCH_SIZE = 1;
  const allShots: Shot[] = [];

  for (let i = 0; i < scriptData.scenes.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1500));

    const batch = scriptData.scenes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((scene, idx) => processScene(scene, i + idx)));
    batchResults.forEach((shots) => allShots.push(...shots));
  }

  if (allShots.length === 0) {
    throw new Error(
      '分镜生成失败：AI返回为空（可能是 JSON 结构不匹配或场景内容未被识别）。请打开控制台查看分镜生成日志。',
    );
  }

  const mutedResult = detectMutedTest(allShots);
  if (mutedResult.score < 7) {
    logger.warn(
      LogCategory.AI,
      `⚠️ 剧本静音测试: 评分 ${mutedResult.score}/10 - ${mutedResult.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.description)
        .join('; ')}`,
    );
  }

  // 构建角色 name→id 映射，规范化 shot.characters（防止 LLM 输出角色名而非 ID）
  const charNameToId = new Map<string, string>();
  for (const c of scriptData.characters) {
    charNameToId.set(c.name, c.id);
  }

  return allShots.map((s, idx) => ({
    ...s,
    id: `shot-${idx + 1}`,
    characters: (s.characters || []).map((charRef: string) => charNameToId.get(charRef) || charRef),
    keyframes: Array.isArray(s.keyframes)
      ? s.keyframes.map((k: any) => ({
          ...k,
          id: `kf-${idx + 1}-${k.type}`,
          status: 'pending',
        }))
      : [],
  }));
};

// ============================================
// 剧本续写/改写
// ============================================

/**
 * AI续写功能 - 基于已有剧本内容续写后续情节
 */
export const continueScript = async (
  existingScript: string,
  language: string = '中文',
  model?: string,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `✍️ continueScript 调用 - 使用模型: ${resolvedModel}`);
  const startTime = Date.now();

  const prompt = `
你是一位资深剧本创作者。请在充分理解下方已有剧本内容的基础上，续写后续情节。

续写要求：
1. 严格保持原剧本的风格、语气、人物性格和叙事节奏，确保无明显风格断层。
2. 情节发展需自然流畅，逻辑严密，因果关系合理，避免突兀转折。
3. 有效增加戏剧冲突和情感张力，使故事更具吸引力和张力。
4. 续写内容应为原有剧本长度的30%-50%，字数适中，避免过短或过长。
5. 保持剧本的原有格式，包括场景描述、人物对白、舞台指示等，确保格式一致。
6. 输出语言为：${language}，用词准确、表达流畅。
7. 仅输出续写剧本内容，不添加任何说明、前缀或后缀。

已有剧本内容：
${existingScript}

请直接续写剧本内容。（不要包含"续写："等前缀）：
`;

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.8, 4096));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'continue-script',
      resourceName: 'AI续写剧本',
      status: 'success',
      model: resolvedModel,
      duration,
      prompt: existingScript.substring(0, 200) + '...',
    });

    return result;
  } catch (error) {
    logger.error(LogCategory.AI, '❌ 续写失败:', error);
    throw error;
  }
};

/**
 * AI续写功能（流式）
 */
export const continueScriptStream = async (
  existingScript: string,
  language: string = '中文',
  model?: string,
  onDelta?: (delta: string) => void,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `✍️ continueScriptStream 调用 - 使用模型: ${resolvedModel}`);
  const startTime = Date.now();

  const prompt = `
你是一位资深剧本创作者。请在充分理解下方已有剧本内容的基础上，续写后续情节。

续写要求：
1. 严格保持原剧本的风格、语气、人物性格和叙事节奏，确保无明显风格断层。
2. 情节发展需自然流畅，逻辑严密，因果关系合理，避免突兀转折。
3. 有效增加戏剧冲突和情感张力，使故事更具吸引力和张力。
4. 续写内容应为原有剧本长度的30%-50%，字数适中，避免过短或过长。
5. 保持剧本的原有格式，包括场景描述、人物对白、舞台指示等，确保格式一致。
6. 输出语言为：${language}，用词准确、表达流畅。
7. 仅输出续写剧本内容，不添加任何说明、前缀或后缀。

已有剧本内容：
${existingScript}

请直接续写剧本内容。（不要包含"续写："等前缀）：
`;

  try {
    const result = await retryOperation(() =>
      chatCompletionStream(prompt, resolvedModel, 0.8, 4096, undefined, 600000, onDelta),
    );
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'continue-script',
      resourceName: 'AI续写剧本（流式）',
      status: 'success',
      model: resolvedModel,
      duration,
      prompt: existingScript.substring(0, 200) + '...',
    });

    return result;
  } catch (error) {
    logger.error(LogCategory.AI, '❌ 续写失败（流式）:', error);
    throw error;
  }
};

/**
 * AI改写功能 - 对整个剧本进行改写
 */
export const rewriteScript = async (
  originalScript: string,
  language: string = '中文',
  model?: string,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🔄 rewriteScript 调用 - 使用模型: ${resolvedModel}`);
  const startTime = Date.now();

  const prompt = `
你是一位顶级剧本编剧顾问，擅长提升剧本的结构、情感和戏剧张力。请对下方提供的剧本进行系统性、创造性改写，目标是使剧本在连贯性、流畅性和戏剧冲突等方面显著提升。

改写具体要求如下：

1. 保留原剧本的核心故事线和主要人物设定，不改变故事主旨。
2. 优化情节结构，确保事件发展具有清晰的因果关系，逻辑严密。
3. 增强场景之间的衔接与转换，使整体叙事流畅自然。
4. 丰富和提升人物对话，使其更具个性、情感色彩和真实感，避免生硬或刻板。
5. 强化戏剧冲突，突出人物之间的矛盾与情感张力，增加情节的吸引力和感染力。
6. 深化人物内心活动和情感描写，提升剧本的情感深度。
7. 优化整体节奏，合理分配高潮与缓和段落，避免情节拖沓或推进过快。
8. 保持或适度增加剧本内容长度，确保内容充实但不过度冗长。
9. 严格遵循剧本格式规范，包括场景标注、人物台词、舞台指示等。
10. 输出语言为：${language}，确保语言风格与剧本类型相符。

原始剧本内容如下：
${originalScript}

请根据以上要求，输出经过全面改写、结构优化、情感丰富的完整剧本文本。
`;

  try {
    const result = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192));
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'rewrite-script',
      resourceName: 'AI改写剧本',
      status: 'success',
      model: resolvedModel,
      duration,
      prompt: originalScript.substring(0, 200) + '...',
    });

    return result;
  } catch (error) {
    logger.error(LogCategory.AI, '❌ 改写失败:', error);
    throw error;
  }
};

/**
 * AI改写功能（流式）
 */
export const rewriteScriptStream = async (
  originalScript: string,
  language: string = '中文',
  model?: string,
  onDelta?: (delta: string) => void,
): Promise<string> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🔄 rewriteScriptStream 调用 - 使用模型: ${resolvedModel}`);
  const startTime = Date.now();

  const prompt = `
你是一位顶级剧本编剧顾问，擅长提升剧本的结构、情感和戏剧张力。请对下方提供的剧本进行系统性、创造性改写，目标是使剧本在连贯性、流畅性和戏剧冲突等方面显著提升。

改写具体要求如下：

1. 保留原剧本的核心故事线和主要人物设定，不改变故事主旨。
2. 优化情节结构，确保事件发展具有清晰的因果关系，逻辑严密。
3. 增强场景之间的衔接与转换，使整体叙事流畅自然。
4. 丰富和提升人物对话，使其更具个性、情感色彩和真实感，避免生硬或刻板。
5. 强化戏剧冲突，突出人物之间的矛盾与情感张力，增加情节的吸引力和感染力。
6. 深化人物内心活动和情感描写，提升剧本的情感深度。
7. 优化整体节奏，合理分配高潮与缓和段落，避免情节拖沓或推进过快。
8. 保持或适度增加剧本内容长度，确保内容充实但不过度冗长。
9. 严格遵循剧本格式规范，包括场景标注、人物台词、舞台指示等。
10. 输出语言为：${language}，确保语言风格与剧本类型相符。

原始剧本内容如下：
${originalScript}

请根据以上要求，输出经过全面改写、结构优化、情感丰富的完整剧本文本。
`;

  try {
    const result = await retryOperation(() =>
      chatCompletionStream(prompt, resolvedModel, 0.7, 8192, undefined, 600000, onDelta),
    );
    const duration = Date.now() - startTime;

    await addRenderLogWithTokens({
      type: 'script-parsing',
      resourceId: 'rewrite-script',
      resourceName: 'AI改写剧本（流式）',
      status: 'success',
      model: resolvedModel,
      duration,
      prompt: originalScript.substring(0, 200) + '...',
    });

    return result;
  } catch (error) {
    logger.error(LogCategory.AI, '❌ 改写失败（流式）:', error);
    throw error;
  }
};
