/**
 * 剧本质量检测服务
 * 基于26条漫剧创作约束，对剧本进行量化评估
 */

import { Shot } from "../../types";
import { logger, LogCategory } from '../logger';

export interface QualityIssue {
  type: 'hook' | 'density' | 'rhythm' | 'visual' | 'dialogue';
  severity: 'error' | 'warning' | 'info';
  location: string;
  description: string;
  suggestion: string;
}

export interface QualityCheckResult {
  score: number;
  issues: QualityIssue[];
  suggestions: string[];
}

const hookKeywords = [
  '！', '？', '"', '"',
  '突然', '猛地', '瞬间',
  '响起', '传来', '爆发',
  '跪', '倒', '扑', '冲',
  '耳光', '摔', '砸', '撕',
];

const greetingPatterns = /^(你好|您好|早上好|晚安|吃了|在吗|嗨|嘿)[^a-zA-Z0-9]?/;

const visualVerbs = [
  '握紧', '攥紧', '颤抖', '抽搐', '低头', '抬头',
  '挥拳', '重击', '撩发', '撕扯', '攥进', '抠进',
  '青筋', '咬牙', '瞪眼', '皱眉', '咬唇',
];

const emotionalDialoguePatterns = [
  /我很[高兴生气愤怒开心伤心难过]/,
  /我[很非常]?[生气愤怒悲伤高兴]/,
  /他[看起来似乎像是]/,
  /气氛/,
  /[悲伤]痛/,
  /压抑/,
  /好[高兴开心爽]/,
  /太[高兴开心爽生气愤怒]/,
];

export const detectOpeningHook = (scriptText: string): QualityCheckResult => {
  const lines = scriptText.split('\n').filter(l => l.trim());
  const firstLines = lines.slice(0, 10);

  const hasHook = firstLines.some(line =>
    hookKeywords.some(k => line.includes(k))
  );

  const hasGreeting = greetingPatterns.test(scriptText);

  if (hasGreeting) {
    return {
      score: 4,
      issues: [{
        type: 'hook',
        severity: 'error',
        location: '开场第1行',
        description: '开场使用平淡寒暄，可能导致观众流失',
        suggestion: '建议前三行内出现：质问、惊呼、命令、或巨大声响（如摔杯子、响亮的耳光声）'
      }],
      suggestions: [
        '第一句台词必须是质问、惊呼、命令',
        '或以巨大的声响/动作开场（如：响亮的耳光声）',
        '避免以"你好""吃了没"等平淡寒暄开始'
      ]
    };
  }

  if (!hasHook) {
    return {
      score: 6,
      issues: [{
        type: 'hook',
        severity: 'warning',
        location: '开场前10行',
        description: '开场缺乏冲突/悬念/危机元素',
        suggestion: '建议前三行内出现：质问、惊呼、命令、或巨大声响'
      }],
      suggestions: [
        '开场前三行必须出现钩子',
        '可使用：！？、突然、猛地、响起等关键词',
        '或强烈的动作/声音开场'
      ]
    };
  }

  return { score: 10, issues: [], suggestions: [] };
};

export const detectMutedTest = (shots: Shot[]): QualityCheckResult => {
  const issues: QualityIssue[] = [];

  shots.forEach((shot, index) => {
    const actionLength = shot.actionSummary?.length || 0;
    const hasVisualVerbs = visualVerbs.some(v =>
      shot.actionSummary?.includes(v)
    );

    const isDialogueOnly = actionLength < 20 && !hasVisualVerbs;

    const hasRedundantDialogue = shot.dialogue &&
      emotionalDialoguePatterns.some(p => p.test(shot.dialogue));

    if (isDialogueOnly && shot.dialogue) {
      issues.push({
        type: 'dialogue',
        severity: 'warning',
        location: `SHOT ${index + 1}`,
        description: '该镜头以对话为主，动作描写较少',
        suggestion: '建议增加角色动作（如：切牛排的手停顿、攥紧拳头等）'
      });
    }

    if (hasRedundantDialogue) {
      issues.push({
        type: 'dialogue',
        severity: 'error',
        location: `SHOT ${index + 1}`,
        description: '台词描述了情绪，而非通过动作传达',
        suggestion: '删除情绪词汇，让角色通过动作/表情传达情绪'
      });
    }
  });

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  let score = 10;
  score -= errorCount * 5;
  score -= warningCount * 2;
  score = Math.max(0, Math.min(10, score));

  return {
    score,
    issues,
    suggestions: issues.length > 0
      ? ['每场戏确保有足够的动作描写', '情绪通过动作传达，而非直接说出']
      : []
  };
};

export const checkScriptQuality = (scriptText: string, shots: Shot[]): QualityCheckResult => {
  const hookResult = detectOpeningHook(scriptText);
  const mutedResult = detectMutedTest(shots);

  const allIssues = [...hookResult.issues, ...mutedResult.issues];
  const allSuggestions = [...hookResult.suggestions, ...mutedResult.suggestions];

  const totalScore = Math.round((hookResult.score + mutedResult.score) / 2);

  if (totalScore >= 8) {
    logger.debug(LogCategory.AI, `✅ 剧本质量检查通过 (评分: ${totalScore}/10)`);
  } else {
    logger.warn(LogCategory.AI, `⚠️ 剧本质量检查提醒 (评分: ${totalScore}/10): ${allIssues.map(i => i.description).join(', ')}`);
  }

  return {
    score: totalScore,
    issues: allIssues,
    suggestions: allSuggestions
  };
};