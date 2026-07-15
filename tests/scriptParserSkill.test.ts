import { describe, it, expect } from 'vitest';
import {
  detectScriptFormat,
  extractScenesByRegex,
  validateSceneRefMapping,
  PROFESSIONAL_SCENE_PATTERNS,
} from '../services/ai/scriptParserSkill';

describe('detectScriptFormat', () => {
  it('should detect professional format with scene markers (Arabic numerals)', () => {
    const text = `第1场 日军司令部
（日军司令部内，气氛凝重）
山本：计划进行得如何？
大佐：一切顺利。

第2场 八路军阵地
（战壕中，战士们严阵以待）
李云龙：传我命令，准备进攻！
`;

    const result = detectScriptFormat(text);
    expect(result.format).toBe('professional');
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should detect professional format with Chinese numeral scene markers', () => {
    const text = `第一场 日军司令部
山本：计划进行得如何？
大佐：一切顺利。

第二场 八路军阵地
李云龙：传我命令，准备进攻！
`;

    const result = detectScriptFormat(text);
    expect(result.format).toBe('professional');
  });

  it('should detect freeform format without scene markers', () => {
    const text = `在一个寂静的夜晚，李云龙独自站在指挥部外望着远处的天空。他深深地吸了一口气心中已经有了盘算。第二天清晨战士们整齐地列队站在操场上李云龙走到队伍前面他的目光扫过每一张年轻而坚定的面孔。

同志们他开口说道声音坚定而有力我们的任务是彻底消灭来犯之敌这关系到整个战区的安危。

战斗进行得异常激烈枪炮声此起彼伏硝烟弥漫在整个阵地上空。在混乱中李云龙敏锐地捕捉到了敌人的动向这是一个绝佳的进攻时机他必须当机立断。`;

    const result = detectScriptFormat(text);
    // Long narrative lines without scene markers → should detect as freeform or minimal
    expect(['freeform', 'minimal']).toContain(result.format);
  });

  it('should handle minimal/empty input', () => {
    expect(detectScriptFormat('').format).toBe('minimal');
    expect(detectScriptFormat('随便写的一句话').format).toBe('minimal');
  });

  it('should detect professional format with 内景/外景 markers', () => {
    const text = `内景 日军司令部 - 夜
山本正在审阅地图。
外景 八路军阵地 - 日
战士们正在修筑工事。`;

    const result = detectScriptFormat(text);
    expect(result.format).toBe('professional');
  });
});

describe('extractScenesByRegex', () => {
  it('should extract scene boundaries from professional script', () => {
    const text = `第1场 日军司令部
（对话内容）

第3场 八路军阵地
（战斗场景）

第5场 医院病房
（伤员救治）`;

    const result = extractScenesByRegex(text);
    expect(result.boundaries.length).toBeGreaterThanOrEqual(2);
    expect(result.boundaries[0].sceneNumber).toBe(1);
    expect(result.boundaries[0].title).toContain('日军');
  });

  it('should extract scene boundaries with Chinese numerals', () => {
    const text = `第一场 日军司令部
（对话内容）

第三场 八路军阵地
（战斗场景）`;

    const result = extractScenesByRegex(text);
    expect(result.boundaries.length).toBe(2);
    expect(result.boundaries[0].sceneNumber).toBe(1);
    expect(result.boundaries[1].sceneNumber).toBe(3);
  });

  it('should return empty for freeform text', () => {
    const result = extractScenesByRegex('这是一段没有场景标记的连续叙述文字。');
    expect(result.boundaries.length).toBe(0);
  });
});

describe('validateSceneRefMapping', () => {
  const scenes = [
    { id: '1', location: '日军司令部' },
    { id: '2', location: '八路军阵地' },
    { id: '3', location: '医院病房' },
  ];

  it('should pass through valid mappings unchanged', () => {
    const paragraphs = [
      { id: 1, text: '段落1', sceneRefId: '1' },
      { id: 2, text: '段落2', sceneRefId: '1' },
      { id: 3, text: '段落3', sceneRefId: '2' },
    ];

    const result = validateSceneRefMapping(paragraphs, scenes);
    expect(result).toEqual(paragraphs);
  });

  it('should fix invalid sceneRefId to nearest scene', () => {
    const paragraphs = [
      { id: 1, text: '段落1', sceneRefId: '99' },
      { id: 2, text: '段落2', sceneRefId: '100' },
    ];

    const result = validateSceneRefMapping(paragraphs, scenes);
    expect(result[0].sceneRefId).toBe('1');
    expect(result[1].sceneRefId).toBe('2');
  });

  it('should handle empty paragraphs', () => {
    const result = validateSceneRefMapping([], scenes);
    expect(result).toEqual([]);
  });

  it('should handle empty scenes gracefully', () => {
    const paragraphs = [
      { id: 1, text: '段落1', sceneRefId: '99' },
    ];

    const result = validateSceneRefMapping(paragraphs, []);
    expect(result[0].sceneRefId).toBe('99');
  });
});

describe('PROFESSIONAL_SCENE_PATTERNS', () => {
  it('should match "第N场" pattern', () => {
    expect(PROFESSIONAL_SCENE_PATTERNS[0].test('第1场')).toBe(true);
    expect(PROFESSIONAL_SCENE_PATTERNS[0].test('第 5 场')).toBe(true);
    expect(PROFESSIONAL_SCENE_PATTERNS[0].test('第10幕')).toBe(true);
    expect(PROFESSIONAL_SCENE_PATTERNS[0].test('第一场')).toBe(true);
    expect(PROFESSIONAL_SCENE_PATTERNS[0].test('第三场')).toBe(true);
  });

  it('should match SCENE/scene prefix pattern', () => {
    expect(PROFESSIONAL_SCENE_PATTERNS[1].test('场景：1')).toBe(true);
    expect(PROFESSIONAL_SCENE_PATTERNS[1].test('[场景: 2]')).toBe(true);
  });

  it('should match 内景/外景 pattern', () => {
    expect(PROFESSIONAL_SCENE_PATTERNS[2].test('内景 日军司令部')).toBe(true);
    expect(PROFESSIONAL_SCENE_PATTERNS[2].test('外景 野外')).toBe(true);
  });
});
