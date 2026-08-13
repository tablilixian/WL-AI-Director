import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../services/ai/promptBuilder';
import type { ArtDirection, Character } from '../types';
import type { PromptIntent } from '../types/prompt';

const mockArtDirection: ArtDirection = {
  colorPalette: {
    primary: 'deep navy',
    secondary: 'slate gray',
    accent: 'warm amber',
    skinTones: 'warm ivory',
    saturation: 'medium-high',
    temperature: 'cool-leaning',
  },
  characterDesignRules: {
    proportions: '7.5 head ratio',
    eyeStyle: 'large expressive',
    lineWeight: 'clean 2px',
    detailLevel: 'high on face',
  },
  lightingStyle: 'three-point cinematic',
  textureStyle: 'cel-shaded',
  moodKeywords: ['tense', 'gritty', 'noir'],
  consistencyAnchors: 'MASTER STYLE: cohesive noir world.',
};

const mockCharacter: Character = {
  id: 'c1',
  name: '李雷',
  gender: '男',
  age: '28',
  personality: '冷静果断',
  variations: [],
  signaturePose: { original: '靠墙站立，眼神不聚焦' },
  microAction: { original: '说话前用舌头顶腮帮子' },
};

const intent: PromptIntent = {
  target: 'character-design',
  visualStyle: 'anime',
  outputFormat: 'json',
  outputSchema: '{ "visualPrompt": "...", "negativePrompt": "..." }',
  language: '中文',
  wordCountRange: { min: 200, max: 400 },
  cinematographyTermsRule: true,
};

describe('PromptBuilder', () => {
  it('system prompt 包含意图层 + 美术指导，且不含角色资产', () => {
    const builder = new PromptBuilder(intent)
      .withAssets({ characters: [mockCharacter] })
      .withPhotography(mockArtDirection);
    const system = builder.buildSystemPrompt('CRITICAL: describe face in detail.');

    expect(system).toContain('world-class visual prompt engineer for anime');
    expect(system).toContain('MASTER STYLE: cohesive noir world.');
    expect(system).toContain('CRITICAL: describe face in detail.');
    expect(system).toContain('Preserve English cinematography terms untranslated');
    // system 不应包含角色具体资产信息
    expect(system).not.toContain('李雷');
  });

  it('user prompt 包含资产层 + 动作层，且不含美术指导', () => {
    const signaturePose = mockCharacter.signaturePose?.original ?? '';
    const builder = new PromptBuilder(intent)
      .withAssets({ characters: [mockCharacter] })
      .withAction({ signaturePoses: [signaturePose] });
    const user = builder.buildUserPrompt();

    expect(user).toContain('李雷');
    expect(user).toContain('靠墙站立，眼神不聚焦');
    expect(user).toContain('Visual Style: anime');
    // user 不应包含美术指导（属于 system）
    expect(user).not.toContain('MASTER STYLE');
  });

  it('build() 合并模式包含两个层的内容', () => {
    const builder = new PromptBuilder(intent)
      .withAssets({ characters: [mockCharacter] })
      .withPhotography(mockArtDirection);
    const combined = builder.build();

    expect(combined).toContain('MASTER STYLE'); // L5
    expect(combined).toContain('李雷'); // L2
    expect(combined).toContain('\n\n---\n\n'); // 分隔符
  });

  it('约束层与连续性层进入 system prompt', () => {
    const builder = new PromptBuilder(intent)
      .withAssets({ characters: [mockCharacter] })
      .withConstraints({
        mustHold: ['红色外套'],
        changesHere: ['衣服破损'],
        mustNotAppear: ['第三人'],
      })
      .withContinuity({
        previousShotSummary: '上一镜角色转身',
        characterStates: [{ characterId: 'c1', stateLabel: 'default' }],
      });
    const system = builder.buildSystemPrompt();

    expect(system).toContain('【必须保持 MUST HOLD】');
    expect(system).toContain('红色外套');
    expect(system).toContain('【禁止出现 MUST NOT APPEAR】');
    expect(system).toContain('上一镜角色转身');
  });
});
