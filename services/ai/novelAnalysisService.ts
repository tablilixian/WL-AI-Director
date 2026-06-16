import { NovelChapter, NovelCharacter, NovelScene, NovelItem, WorldSetting } from '../../types/novel';
import {
  retryOperation,
  cleanJsonString,
  chatCompletion,
  logScriptProgress,
  getDefaultChatModelId,
} from './apiCore';
import { logger, LogCategory } from '../logger';

export const splitChaptersByAI = async (
  rawText: string,
  model?: string,
  onProgress?: (msg: string) => void
): Promise<{ index: number; title: string; content: string }[]> => {
  const resolvedModel = model || getDefaultChatModelId();
  const onLog = onProgress || logScriptProgress;
  onLog('正在分析章节结构...');

  const prompt = `请分析以下小说文本，按照原文的章节结构进行拆分。

要求：
1. 识别原文中的章节标记（如"第一章"、"第1章"、"Chapter 1"等）
2. 如果没有明确的章节标记，按情节转折点智能切分
3. 保留每个章节的完整内容，不要删减或改写
4. 按原文顺序输出

输出 JSON 格式（严格 JSON，不要 markdown 包裹）：
{
  "chapters": [
    { "index": 1, "title": "章节标题", "content": "该章节的完整内容" },
    { "index": 2, "title": "章节标题", "content": "该章节的完整内容" }
  ]
}

原文：
${rawText.slice(0, 60000)}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.3, 16000, 'json_object')
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);
    const chapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    onLog(`章节拆分完成，共 ${chapters.length} 章`);
    return chapters;
  } catch (error: any) {
    logger.error(LogCategory.AI, '章节拆分失败:', error);
    throw new Error(`章节拆分失败: ${error.message}`);
  }
};

export const analyzeNovel = async (
  novelInfo: {
    title: string;
    chapters: { index: number; title: string; summary?: string; content?: string }[];
  },
  model?: string,
  onProgress?: (msg: string) => void
): Promise<{
  characters: NovelCharacter[];
  keyScenes: NovelScene[];
  keyItems: NovelItem[];
  worldSettings: WorldSetting[];
  summary: string;
  genre: string;
}> => {
  const resolvedModel = model || getDefaultChatModelId();
  const onLog = onProgress || logScriptProgress;
  onLog('正在分析小说内容...');

  const chapterList = novelInfo.chapters.map(ch =>
    `第${ch.index}章 ${ch.title}${ch.summary ? `：${ch.summary}` : ''}`
  ).join('\n');

  const sampleContent = novelInfo.chapters.slice(0, 5).map(ch =>
    `【第${ch.index}章 ${ch.title}】\n${(ch.content || '').slice(0, 3000)}`
  ).join('\n\n');

  const prompt = `你是一位资深文学编辑，正在分析一部小说。请从以下小说内容中提取结构化的分析数据。

小说标题：${novelInfo.title}

## 章节列表
${chapterList}

## 小说内容节选（前5章）
${sampleContent}

## 分析要求

### 1. 角色提取
提取所有重要角色，输出格式：
- name: 姓名
- aliases: 别名/昵称数组
- gender: 性别
- age: 年龄
- personality: 性格特征
- background: 背景故事
- appearance: 外貌描述（文学性描写）
- visualPrompt: 用于 AI 绘图的详细视觉描述（英文），包含：脸型、眼睛颜色与形状、发型发色、肤色、体型、典型着装风格、标志性特征、整体气质氛围。例如 "A young man with delicate facial features, long purple hair tied loosely, narrow amber eyes, pale skin, slender build, wearing a tattered purple robe, with a wild and untamed aura"
- role: 角色定位（protagonist主角/antagonist反派/supporting配角/minor龙套）
- relevance: 重要度（0-10）

### 2. 关键场景提取
提取对剧情有重大影响的关键场景：
- name: 场景名称
- description: 场景描述
- chapterIndex: 所属章节序号
- characters: 出场角色名数组
- significance: 在剧情中的意义

### 3. 关键物品提取
提取在剧情中有重要作用的物品：
- name: 物品名称
- category: 分类（武器/饰品/工具/文书/交通工具/衣物/其他）
- description: 外观描述
- significance: 在剧情中的作用
- ownerCharacterId: 归属角色名（如明确）

### 4. 世界观设定提取
提取小说的世界观设定：
- name: 设定名称
- category: 类别（magic_system魔法体系/political政治/geography地理/history历史/culture文化/technology科技/other其他）
- description: 简介
- details: 详细设定

### 5. 整体信息
- summary: 一句话概括
- genre: 小说类型

输出严格 JSON 格式（不要 markdown 包裹）：
{
  "characters": [...],
  "keyScenes": [...],
  "keyItems": [...],
  "worldSettings": [...],
  "summary": "...",
  "genre": "..."
}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.5, 16000, 'json_object')
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);

    const characters: NovelCharacter[] = (Array.isArray(parsed.characters) ? parsed.characters : []).map(
      (c: any, i: number) => ({
        id: `novel-char-${Date.now()}-${i}`,
        name: c.name || '',
        aliases: Array.isArray(c.aliases) ? c.aliases : [],
        gender: c.gender || '',
        age: c.age || '',
        personality: c.personality || '',
        background: c.background || '',
        appearance: c.appearance || '',
        visualPrompt: c.visualPrompt || '',
        role: ['protagonist', 'antagonist', 'supporting', 'minor'].includes(c.role)
          ? c.role : 'supporting',
        relationships: [],
        firstAppearance: c.firstAppearance ?? 1,
        relevance: typeof c.relevance === 'number' ? c.relevance : 5,
      })
    );

    const keyScenes: NovelScene[] = (Array.isArray(parsed.keyScenes) ? parsed.keyScenes : []).map(
      (s: any, i: number) => ({
        id: `novel-scene-${Date.now()}-${i}`,
        name: s.name || '',
        description: s.description || '',
        chapterIndex: s.chapterIndex ?? 1,
        characters: Array.isArray(s.characters) ? s.characters : [],
        significance: s.significance || '',
      })
    );

    const keyItems: NovelItem[] = (Array.isArray(parsed.keyItems) ? parsed.keyItems : []).map(
      (item: any, i: number) => ({
        id: `novel-item-${Date.now()}-${i}`,
        name: item.name || '',
        category: item.category || '其他',
        description: item.description || '',
        significance: item.significance || '',
        ownerCharacterId: item.ownerCharacterId || undefined,
        chapters: Array.isArray(item.chapters) ? item.chapters : [],
      })
    );

    const worldSettings: WorldSetting[] = (Array.isArray(parsed.worldSettings) ? parsed.worldSettings : []).map(
      (ws: any, i: number) => ({
        id: `novel-ws-${Date.now()}-${i}`,
        name: ws.name || '',
        category: ['magic_system', 'political', 'geography', 'history', 'culture', 'technology', 'other'].includes(ws.category)
          ? ws.category : 'other',
        description: ws.description || '',
        details: ws.details || '',
        relatedChapters: Array.isArray(ws.relatedChapters) ? ws.relatedChapters : [],
      })
    );

    onLog(`分析完成：${characters.length} 个角色、${keyScenes.length} 个场景、${keyItems.length} 个物品、${worldSettings.length} 个世界观设定`);

    return {
      characters,
      keyScenes,
      keyItems,
      worldSettings,
      summary: parsed.summary || '',
      genre: parsed.genre || '通用',
    };
  } catch (error: any) {
    logger.error(LogCategory.AI, '小说分析失败:', error);
    throw new Error(`小说分析失败: ${error.message}`);
  }
};

export const analyzeSingleChapter = async (
  chapter: { index: number; title: string; content: string },
  model?: string
): Promise<{ summary: string; keyEvents: string[] }> => {
  const resolvedModel = model || getDefaultChatModelId();

  const prompt = `请分析以下小说章节内容，提取章节摘要和关键事件。

章节：第${chapter.index}章 ${chapter.title}

内容：
${chapter.content.slice(0, 10000)}

输出 JSON：
{
  "summary": "200字以内的章节摘要",
  "keyEvents": ["事件1", "事件2", ...]
}`;

  try {
    const responseText = await retryOperation(() =>
      chatCompletion(prompt, resolvedModel, 0.4, 4096, 'json_object')
    );
    const text = cleanJsonString(responseText);
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || '',
      keyEvents: Array.isArray(parsed.keyEvents) ? parsed.keyEvents : [],
    };
  } catch {
    return { summary: '', keyEvents: [] };
  }
};
