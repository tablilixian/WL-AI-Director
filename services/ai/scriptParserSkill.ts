import { Character, CharacterVariation, Scene } from "../../types";
import { logger, LogCategory } from '../logger';
import { cleanJsonString, chatCompletion, retryOperation } from './apiCore';

export type ScriptFormat = 'professional' | 'freeform' | 'minimal';
export type ScriptFormatDetection = {
  format: ScriptFormat;
  confidence: number;
  reason: string;
};

const CN_NUM = '[一二三四五六七八九十百千]+';
const ARABIC_OR_CN = `(?:\\d+|${CN_NUM})`;

export const PROFESSIONAL_SCENE_PATTERNS = [
  new RegExp(`^(?:第\\s*)?${ARABIC_OR_CN}\\s*(?:场|幕|景|个场景)`, 'm'),
  /^(?:【|\[)?\s*(?:场景|场次|SCENE|scene)\s*[：:]\s*\d+/im,
  /^(?:【|\[)?\s*(?:内景|外景|室内|室外|INTERIOR|EXTERIOR|INT\.|EXT\.)/im,
  /^\s*(?:内|外)\s+(?:景|场)\s+\S+/m,
];

const CN_NUM_CAPTURE = '(?:\\d+|' + CN_NUM + ')';
export const SCENE_BOUNDARY_REGEXES = [
  new RegExp(`^(?:第\\s*)?(${CN_NUM_CAPTURE})\\s*(?:场|幕|景|个场景)\\s*(.*)$`, 'm'),
  /^(?:【|\[)?(?:场景|场次|SCENE|scene)\s*[：:]\s*(\d+)\s*[】\]]?\s*(.*)$/im,
  /^(?:【|\[)?\s*(内景|外景|室内|室外|INTERIOR|EXTERIOR|INT\.|EXT\.)\s+?(.*?)$/im,
  /^\s*(内|外)\s+(景|场)\s+(.*)$/m,
];

const CN_NUM_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '百': 100, '千': 1000,
};

function parseChineseNumber(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let total = 0;
  let current = 0;
  for (const ch of s) {
    const v = CN_NUM_MAP[ch];
    if (v === undefined) continue;
    if (v >= 10) {
      total += (current || 1) * v;
      current = 0;
    } else {
      current = v;
    }
  }
  return total + current;
}

export const FREE_FORM_INDICATORS = [
  /[：:]\s*[""""].*?[""""]/,
  /（[^）]+）[：:]/,
  /\n\s*\S+[：:]\s*\n/,
];

export function detectScriptFormat(rawText: string): ScriptFormatDetection {
  const textBlock = rawText.slice(0, 5000);
  let professionalScore = 0;
  let freeformScore = 0;

  for (const pattern of PROFESSIONAL_SCENE_PATTERNS) {
    const matches = textBlock.match(new RegExp(pattern.source, 'gm'));
    if (matches) professionalScore += matches.length * 2;
  }

  const dialoguePattern = /[^：:]+[：:][""""][^""""]+[""""]/g;
  const dialogueMatches = textBlock.match(dialoguePattern);
  if (dialogueMatches && dialogueMatches.length >= 3) {
    professionalScore += 2;
  }

  const lines = textBlock.split('\n').filter(l => l.trim());
  const avgLineLen = lines.reduce((s, l) => s + l.length, 0) / (lines.length || 1);
  if (lines.length >= 10 && avgLineLen > 80) {
    freeformScore += 2;
  }

  if (professionalScore >= freeformScore && professionalScore >= 2) {
    return {
      format: 'professional',
      confidence: Math.min(1, professionalScore / 6),
      reason: `检测到${professionalScore}个专业剧本特征`
    };
  }

  if (freeformScore > professionalScore) {
    return {
      format: 'freeform',
      confidence: Math.min(1, freeformScore / 4),
      reason: '未检测到场景标记，符合自由格式特征'
    };
  }

  return {
    format: 'minimal',
    confidence: 0.5,
    reason: '文本特征不明显，按最小结构处理'
  };
}

export function extractScenesByRegex(rawText: string): {
  boundaries: { sceneNumber: number; startOffset: number; title: string }[];
} {
  const boundaries: { sceneNumber: number; startOffset: number; title: string }[] = [];

  for (const regex of SCENE_BOUNDARY_REGEXES) {
    boundaries.length = 0;
    const regexGlobal = new RegExp(regex.source, 'gm');
    let match;
    let lastIndex = 0;
    let matchCount = 0;

    while ((match = regexGlobal.exec(rawText)) !== null) {
      const sceneNum = match[1] ? parseChineseNumber(match[1]) || (matchCount + 1) : matchCount + 1;
      const title = (match[2] || match[3] || '').trim();
      boundaries.push({
        sceneNumber: sceneNum,
        startOffset: match.index,
        title
      });
      matchCount++;
      if (match.index === lastIndex) regexGlobal.lastIndex++;
      lastIndex = match.index;
    }

    if (boundaries.length >= 2) break;
  }

  return { boundaries };
}

export function validateSceneRefMapping(
  storyParagraphs: { id: number; text: string; sceneRefId: string }[],
  scenes: { id: string; location: string }[]
): { id: number; text: string; sceneRefId: string }[] {
  if (scenes.length === 0) return storyParagraphs;

  const validSceneIds = new Set(scenes.map(s => s.id));
  let fixedCount = 0;

  const validated = storyParagraphs.map((p, idx) => {
    if (!validSceneIds.has(String(p.sceneRefId))) {
      const nearestSceneIndex = Math.min(idx, scenes.length - 1);
      const originalRef = p.sceneRefId;
      p.sceneRefId = scenes[nearestSceneIndex]?.id || String(scenes[0]?.id || '1');
      logger.warn(LogCategory.AI, `⚠️ B01 场景映射修复: paragraph ${p.id} sceneRefId="${originalRef}" → "${p.sceneRefId}" (无效引用，自动修正到最近场景)`);
      fixedCount++;
    }
    return p;
  });

  if (fixedCount > 0) {
    logger.warn(LogCategory.AI, `⚠️ B01 场景映射后处理: 共修复 ${fixedCount}/${storyParagraphs.length} 个段落引用`);
  }

  return validated;
}

export const PARSE_SCRIPT_PROMPT_PROFESSIONAL = (rawText: string, language: string) => `
Analyze the script text and output structured data in ${language}.

The script contains professional scene markers. Use them as the authoritative scene boundaries.
Each scene in "scenes" MUST correspond to one detected scene marker in the original text.
Each "storyParagraph" MUST reference its parent scene via sceneRefId.

Input:
"${rawText.slice(0, 30000)}"

Output ONLY valid JSON with this structure:
{
  "title": "string",
  "genre": "string",
  "logline": "string",
  "characters": [{"id": "string", "name": "string", "gender": "string", "age": "string", "personality": "string"}],
  "scenes": [{"id": "string", "location": "string", "time": "string", "atmosphere": "string"}],
  "storyParagraphs": [{"id": number, "text": "string", "sceneRefId": "string"}]
}

RULES:
1. Scene count MUST match the number of scene markers in the original text — one scene per marker.
2. Every scene MUST have at least one storyParagraph referencing it via sceneRefId.
3. sceneRefId must exactly match the corresponding scene's id.
4. If a scene has no descriptive text, at minimum include one paragraph summarizing it.
`;

export const PARSE_SCRIPT_PROMPT_FREEFORM = (rawText: string, language: string) => `
Analyze the text and output a JSON object in the language: ${language}.

The script does NOT have explicit scene markers. Reasonably infer scene boundaries from narrative flow.

Tasks:
1. Extract title, genre, logline (in ${language}).
2. Extract characters (id, name, gender, age, personality).
3. Extract scenes (id, location, time, atmosphere) — infer from changes in time, location, or narrative focus.
4. Break down the story into paragraphs linked to scenes.

Input:
"${rawText.slice(0, 30000)}"

Output ONLY valid JSON with this structure:
{
  "title": "string",
  "genre": "string",
  "logline": "string",
  "characters": [{"id": "string", "name": "string", "gender": "string", "age": "string", "personality": "string"}],
  "scenes": [{"id": "string", "location": "string", "time": "string", "atmosphere": "string"}],
  "storyParagraphs": [{"id": number, "text": "string", "sceneRefId": "string"}]
}

CONSISTENCY RULE: sceneRefId in storyParagraphs MUST exactly match the id of one of the scenes above.
`;

export const SCRIPT_PARSER_SKILL_DESCRIPTION = {
  name: 'Script Parser',
  version: '1.0.0',
  description: '解析原始剧本为结构化数据，支持专业格式和自由格式两种解析策略',
  strategies: ['professional', 'freeform'] as ScriptFormat[],
};

export async function parseWithSkill(
  rawText: string,
  language: string = '中文',
  model: string,
): Promise<{
  parsed: any;
  format: ScriptFormat;
  detection: ScriptFormatDetection;
}> {
  const detection = detectScriptFormat(rawText);
  logger.debug(LogCategory.AI, `📋 B01 剧本格式检测: ${detection.format} (置信度: ${detection.confidence}, 原因: ${detection.reason})`);

  let prompt: string;
  if (detection.format === 'professional') {
    const sceneBoundaries = extractScenesByRegex(rawText);
    logger.debug(LogCategory.AI, `📋 B01 正则检测到 ${sceneBoundaries.boundaries.length} 个场景边界`);
    prompt = PARSE_SCRIPT_PROMPT_PROFESSIONAL(rawText, language);
  } else {
    prompt = PARSE_SCRIPT_PROMPT_FREEFORM(rawText, language);
  }

  const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.7, 8192, 'json_object'));

  let parsed: any = {};
  try {
    const text = cleanJsonString(responseText);
    parsed = JSON.parse(text);
  } catch (e) {
    logger.error(LogCategory.AI, 'B01 parseWithSkill JSON parse failed:', e);
    parsed = {};
  }

  return { parsed, format: detection.format, detection };
}

// ============================================
// B10: 衣橱系统 — 分析角色跨场景变装/状态变化
// ============================================

export const CHARACTER_VARIATION_PROMPT = (
  characters: Character[],
  scenes: Scene[],
  storyParagraphs: { id: number; text: string; sceneRefId: string }[],
  language: string
) => `
Analyze the script to detect outfit, appearance, or state changes for each character across different scenes.

Characters:
${JSON.stringify(characters.map(c => ({ id: c.id, name: c.name, gender: c.gender, age: c.age })))}

Scenes and their story content:
${scenes.map(s => {
  const sceneParagraphs = storyParagraphs
    .filter(p => String(p.sceneRefId) === String(s.id))
    .map(p => p.text)
    .join('\n');
  return `Scene ${s.id} (${s.location}, ${s.time}, ${s.atmosphere}):\n${sceneParagraphs.slice(0, 500)}`;
}).join('\n\n')}

For each character, determine:
1. If they appear in a scene
2. Whether their outfit or physical state changes compared to their previous appearance
3. What the change is (e.g., "changes into military uniform", "covered in blood", "wearing sunglasses")

Output ONLY a valid JSON array with this structure:
[
  {
    "characterId": "string (matching character id above)",
    "variations": [
      {
        "name": "string (short label like '军装' or '血迹' in ${language})",
        "visualPrompt": "string (detailed visual description of this variation in ${language})",
        "appearsInSceneIds": ["sceneId1", "sceneId2"]
      }
    ]
  }
]

RULES:
- If a character has NO changes across scenes, output empty variations array for them.
- Each unique outfit/state for a character should be one variation.
- A character seen in multiple scenes with the same outfit should only list it once with all scene IDs.
`;

export async function analyzeCharacterVariations(
  characters: Character[],
  scenes: Scene[],
  storyParagraphs: { id: number; text: string; sceneRefId: string }[],
  model: string,
  language: string = '中文',
): Promise<Character[]> {
  if (characters.length === 0 || scenes.length === 0) {
    return characters;
  }

  logger.debug(LogCategory.AI, `👗 B10 分析角色跨场景变装: ${characters.length} 角色, ${scenes.length} 场景`);
  const prompt = CHARACTER_VARIATION_PROMPT(characters, scenes, storyParagraphs, language);

  try {
    const responseText = await retryOperation(() => chatCompletion(prompt, model, 0.5, 4096, 'json_object'));
    const text = cleanJsonString(responseText);
    const parsed: any[] = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      logger.warn(LogCategory.AI, '⚠️ B10 变装分析结果格式异常（非数组），跳过');
      return characters;
    }

    const variationMap = new Map<string, CharacterVariation[]>();
    for (const entry of parsed) {
      if (entry.characterId && Array.isArray(entry.variations)) {
        variationMap.set(entry.characterId, entry.variations.map((v: any, i: number) => ({
          id: `var-${entry.characterId}-${i + 1}`,
          name: v.name || `变体${i + 1}`,
          visualPrompt: v.visualPrompt || '',
          status: 'pending' as const,
        })));
      }
    }

    let totalVariations = 0;
    for (const char of characters) {
      const variations = variationMap.get(char.id);
      if (variations && variations.length > 0) {
        char.variations = variations;
        totalVariations += variations.length;
        logger.debug(LogCategory.AI, `👗 B10 角色 "${char.name}" 检测到 ${variations.length} 种变体: ${variations.map(v => v.name).join(', ')}`);
      }
    }

    logger.debug(LogCategory.AI, `👗 B10 变装分析完成: ${totalVariations} 个角色变体`);
    return characters;
  } catch (e) {
    logger.warn(LogCategory.AI, '⚠️ B10 角色变装分析失败，使用默认空变体:', e);
    return characters;
  }
}
