import { ConsistencyCheckResult, ConsistencyConflict, Character, Scene, Shot, ScriptData } from "../../types";
import { logger, LogCategory } from '../logger';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  chatCompletionStream,
  logScriptProgress,
  getDefaultChatModelId,
} from './apiCore';

let conflictIdCounter = 0;
const nextConflictId = (): string => `conflict-${Date.now()}-${++conflictIdCounter}`;

interface ShotWithScene {
  shot: Shot;
  scene: Scene;
}

const buildConsistencyPrompt = (
  char: Character,
  scriptData: ScriptData,
  shotGroups: ShotWithScene[]
): string => {
  const storyTimeline = scriptData.storyParagraphs
    .map(p => `[段落${p.id}] ${p.text}`)
    .join('\n');

  const shotDetails = shotGroups.map(({ shot, scene }) => {
    const startKf = shot.keyframes.find(k => k.type === 'start');
    const endKf = shot.keyframes.find(k => k.type === 'end');
    return `
--- 分镜 ${shot.id} ---
场景：${scene.location}（${scene.time}，${scene.atmosphere}）
动作描述：${shot.actionSummary}
${shot.dialogue ? `台词：${shot.dialogue}` : ''}
运镜方式：${shot.cameraMovement}
景别：${shot.shotSize || '未指定'}
起始帧视觉描述：${startKf?.visualPrompt || '无'}
${endKf?.visualPrompt ? `结束帧视觉描述：${endKf.visualPrompt}` : ''}`;
  }).join('\n');

  return `你是一位专业的影视视觉连续性检查员。你的任务是仔细对比同一角色在不同分镜中的视觉描述，判断是否存在真正的视觉矛盾，还是剧情需要的合理变化。

## 角色信息
- 名称：${char.name}
- 性别：${char.gender}
- 年龄：${char.age}
- 性格：${char.personality}
- 官方视觉设定：${char.visualPrompt || '未提供'}

## 故事时间线（用于判断剧情合理性）
${storyTimeline}

## 该角色出现的所有分镜
${shotDetails}

## 分析规则

### 一致性检查维度
1. **服装一致性**：颜色、款式、材质是否统一
2. **发型一致性**：长度、颜色、样式是否统一
3. **配饰一致性**：眼镜、首饰、纹身等是否存在或消失
4. **体貌特征**：身高、体型、肤色等是否矛盾
5. **场景色调跳跃**：相邻镜头间色彩或光影是否有不合逻辑的突变

### 如何判断"剧情合理变化" vs "真实冲突"

以下情况属于✅ **剧情合理变化**，不应标记为冲突：
- 场景切换（白天↔夜晚、室内↔室外）导致的光影或服装变化
- 剧情事件导致的合理变化（打斗后衣服破损、落水后换装、下雨后撑伞）
- 时间跳跃（闪回、穿越、蒙太奇）导致的外观变化
- 台词明确提及的换装或改变（如"我去换件衣服"）
- 角色成长或剧情需要的人物造型转变（需有剧情事件支撑）

以下情况属于❌ **真实冲突**，需要标记：
- 同一场景、连续时间线内服装或发型无故变化
- 无任何剧情铺垫的外貌突变
- 同一时刻不同角度下细节不一致
- 前后镜头割裂感明显且无合理解释

### 输出要求

请严格按以下 JSON 格式输出，不要包含其他文字：
{
  "consistencyScore": 数值 0-10,
  "conflicts": [
    {
      "type": "clothing_mismatch" | "hairstyle_mismatch" | "accessory_mismatch" | "feature_mismatch" | "color_temperature" | "prop_position",
      "severity": "error" | "warning" | "info",
      "shotIds": ["涉及的分镜ID数组"],
      "description": "冲突的具体描述",
      "isPlotDriven": true 或 false,
      "plotExplanation": "如果是剧情合理变化，解释剧情依据；否则为 null",
      "suggestion": "如果是真实冲突，给出修复建议；否则为 null"
    }
  ]
}

注意：
- 如果没有冲突，conflicts 数组为空
- 每个冲突的 shotIds 最少2个镜头
- isPlotDriven=true 的冲突 severity 应为 info
- description 用中文描述`;
};

export const checkCharacterConsistency = async (
  char: Character,
  scriptData: ScriptData,
  shotGroups: ShotWithScene[],
  model?: string
): Promise<ConsistencyCheckResult> => {
  if (shotGroups.length < 2) {
    return {
      characterId: char.id,
      characterName: char.name,
      totalShots: shotGroups.length,
      consistencyScore: 10,
      conflicts: [],
      passed: true,
    };
  }

  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🔍 checkCharacterConsistency 调用 - 角色: ${char.name}, 分镜数: ${shotGroups.length}, 模型: ${resolvedModel}`);

  const prompt = buildConsistencyPrompt(char, scriptData, shotGroups);

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.3, 4096, 'json_object')
    );

    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const score = typeof parsed.consistencyScore === 'number' ? parsed.consistencyScore : 10;

    const conflicts: ConsistencyConflict[] = (Array.isArray(parsed.conflicts) ? parsed.conflicts : [])
      .filter((c: any) => c && typeof c === 'object')
      .map((c: any) => ({
        id: nextConflictId(),
        type: c.type || 'feature_mismatch',
        severity: c.isPlotDriven ? 'info' : (c.severity || 'warning'),
        characterId: char.id,
        characterName: char.name,
        shotIds: Array.isArray(c.shotIds) ? c.shotIds : [],
        description: c.description || '',
        isPlotDriven: !!c.isPlotDriven,
        plotExplanation: c.plotExplanation || null,
        suggestion: c.isPlotDriven ? null : (c.suggestion || null),
        userDecision: 'pending',
      }));

    const result: ConsistencyCheckResult = {
      characterId: char.id,
      characterName: char.name,
      totalShots: shotGroups.length,
      consistencyScore: score,
      conflicts,
      passed: score >= 8 && conflicts.every(c => c.isPlotDriven),
    };

    logger.debug(LogCategory.AI, `✅ 角色 ${char.name} 一致性检查完成: 评分 ${score}/10, 冲突 ${conflicts.length} 项`);
    return result;
  } catch (error: any) {
    logger.warn(LogCategory.AI, `⚠️ 角色 ${char.name} 一致性检查失败:`, error?.message);
    return {
      characterId: char.id,
      characterName: char.name,
      totalShots: shotGroups.length,
      consistencyScore: 10,
      conflicts: [],
      passed: true,
    };
  }
};

export const checkAllCharactersConsistency = async (
  scriptData: ScriptData,
  shots: Shot[],
  scenes: Scene[],
  model?: string
): Promise<ConsistencyCheckResult[]> => {
  const sceneMap = new Map(scenes.map(s => [s.id, s]));

  const charShotMap = new Map<string, ShotWithScene[]>();
  for (const shot of shots) {
    const scene = sceneMap.get(shot.sceneId);
    if (!scene) continue;
    for (const charId of shot.characters) {
      if (!charShotMap.has(charId)) {
        charShotMap.set(charId, []);
      }
      charShotMap.get(charId)!.push({ shot, scene });
    }
  }

  const results: ConsistencyCheckResult[] = [];
  for (const char of scriptData.characters) {
    const shotGroups = charShotMap.get(char.id) || [];
    const result = await checkCharacterConsistency(char, scriptData, shotGroups, model);
    results.push(result);
  }

  return results;
};

export const fixKeyframeConsistency = async (
  shot: Shot,
  conflict: ConsistencyConflict,
  scriptData: ScriptData,
  model?: string
): Promise<{ startPrompt: string; endPrompt: string }> => {
  const resolvedModel = model || getDefaultChatModelId();
  logger.debug(LogCategory.AI, `🔄 fixKeyframeConsistency 调用 - 修复分镜 ${shot.id}`);

  const char = scriptData.characters.find(c => c.id === conflict.characterId);
  const prompt = `你是一位专业的影视视觉修复师。请根据以下一致性冲突信息，修复该镜头的关键帧视觉描述。

## 角色信息
${char ? `名称：${char.name}
官方视觉设定：${char.visualPrompt || '未提供'}` : conflict.characterName}

## 冲突描述
${conflict.description}

## 修复建议
${conflict.suggestion || '请根据角色官方视觉设定调整描述，确保与前后的镜头视觉一致'}

## 当前镜头信息
动作描述：${shot.actionSummary}
${shot.dialogue ? `台词：${shot.dialogue}` : ''}
运镜方式：${shot.cameraMovement}
景别：${shot.shotSize || '未指定'}

## 当前关键帧描述
起始帧：${shot.keyframes.find(k => k.type === 'start')?.visualPrompt || '无'}
${shot.keyframes.find(k => k.type === 'end')?.visualPrompt ? `结束帧：${shot.keyframes.find(k => k.type === 'end')?.visualPrompt}` : ''}

## 修复要求
1. 保持镜头动作描述和运镜方式不变
2. 仅调整与角色外观相关的不一致描述
3. 确保与角色的官方视觉设定一致
4. 与前后镜头的角色外观保持连贯

## 输出格式
{
  "startPrompt": "修复后的起始帧视觉描述（约100-150字，中文）",
  "endPrompt": "修复后的结束帧视觉描述（约100-150字，中文）"
}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.5, 2048, 'json_object')
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    return {
      startPrompt: parsed.startPrompt?.trim() || shot.keyframes.find(k => k.type === 'start')?.visualPrompt || '',
      endPrompt: parsed.endPrompt?.trim() || shot.keyframes.find(k => k.type === 'end')?.visualPrompt || '',
    };
  } catch (error: any) {
    logger.error(LogCategory.AI, `❌ fixKeyframeConsistency 失败:`, error?.message);
    throw new Error(`AI修复一致性失败: ${error?.message}`);
  }
};
