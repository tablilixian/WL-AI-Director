import { NovelChapter, NovelScene, NovelCharacter, WorldSetting } from '../../types/novel';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  logScriptProgress,
  getDefaultChatModelId,
} from './apiCore';
import { logger, LogCategory } from '../logger';

export interface AdaptationInput {
  novelTitle: string;
  chapters: NovelChapter[];
  selectedScenes: NovelScene[];
  characters: NovelCharacter[];
  worldSettings: WorldSetting[];
}

export interface AdaptationResult {
  title: string;
  genre: string;
  logline: string;
  characters: {
    name: string;
    gender: string;
    age: string;
    personality: string;
    visualPrompt?: string;
  }[];
  scenes: {
    location: string;
    time: string;
    atmosphere: string;
  }[];
  storyParagraphs: { text: string; sceneRefId: string }[];
}

export const adaptToScript = async (
  input: AdaptationInput,
  model?: string,
  onProgress?: (msg: string) => void
): Promise<AdaptationResult> => {
  const resolvedModel = model || getDefaultChatModelId();
  const onLog = onProgress || logScriptProgress;
  onLog('正在生成剧本改编...');

  const sourceText = input.chapters
    .map(ch => `【第${ch.index}章 ${ch.title}】\n${ch.content.slice(0, 5000)}`)
    .join('\n\n');

  const characterList = input.characters
    .map(c => `${c.name}（${c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : c.role === 'supporting' ? '配角' : '龙套'}）：${c.personality}${c.appearance ? `，${c.appearance}` : ''}`)
    .join('\n');

  const sceneList = input.selectedScenes
    .map(s => `- ${s.name}（第${s.chapterIndex}章）：${s.description}`)
    .join('\n');

  const worldContext = input.worldSettings
    .map(ws => `- ${ws.name}：${ws.description}`)
    .join('\n');

  const prompt = `你是一位专业编剧，请将以下小说内容改编为影视剧本格式。

## 原著信息
小说标题：${input.novelTitle}

## 角色列表
${characterList}

## 关键场景参考
${sceneList || '（无特定场景选择）'}

## 世界观设定
${worldContext || '（无特定世界观设定）'}

## 原文内容
${sourceText.slice(0, 50000)}

## 改编要求
1. 尊重原著的人物性格、情节走向和世界观设定，不得随意篡改
2. 将叙事性文字转换为场景描写 + 对白 + 动作提示
3. 合理拆分场次：地点或时间变化时自动分场
4. 保留原著的核心对白和精神内核
5. 每场戏需要标注 location（地点）、time（时间）、atmosphere（氛围）

输出严格 JSON 格式：
{
  "title": "剧本标题（基于原著）",
  "genre": "类型",
  "logline": "一句话梗概（30字以内）",
  "characters": [
    { "name": "角色名", "gender": "性别", "age": "年龄", "personality": "性格描述", "visualPrompt": "外貌+服装的关键词描述（用于AI出图，20字以内）" }
  ],
  "scenes": [
    { "location": "场景地点", "time": "日/夜/清晨/黄昏", "atmosphere": "氛围描述" }
  ],
  "storyParagraphs": [
    { "text": "场景描述或对白内容", "sceneRefId": "对应scenes数组的index（从0开始）" }
  ]
}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.6, 16000, 'json_object')
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const characters = (Array.isArray(parsed.characters) ? parsed.characters : []).map((c: any) => ({
      name: c.name || '',
      gender: c.gender || '',
      age: c.age || '',
      personality: c.personality || '',
      visualPrompt: c.visualPrompt || undefined,
    }));

    const scenes = (Array.isArray(parsed.scenes) ? parsed.scenes : []).map((s: any, i: number) => ({
      location: s.location || `场景${i + 1}`,
      time: s.time || '日',
      atmosphere: s.atmosphere || '',
    }));

    const storyParagraphs = (Array.isArray(parsed.storyParagraphs) ? parsed.storyParagraphs : []).map((p: any) => ({
      text: p.text || '',
      sceneRefId: String(p.sceneRefId ?? '0'),
    }));

    onLog(`剧本改编完成：${characters.length} 个角色、${scenes.length} 场戏、${storyParagraphs.length} 段内容`);

    return {
      title: parsed.title || input.novelTitle,
      genre: parsed.genre || '通用',
      logline: parsed.logline || '',
      characters,
      scenes,
      storyParagraphs,
    };
  } catch (error: any) {
    logger.error(LogCategory.AI, '剧本改编失败:', error);
    throw new Error(`剧本改编失败: ${error.message}`);
  }
};
