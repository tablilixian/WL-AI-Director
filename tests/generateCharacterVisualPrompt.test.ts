import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCharacterVisualPrompt } from '../services/ai/visualService';
import { chatCompletion } from '../services/ai/apiCore';
import type { ArtDirection, Character } from '../types';

// mock 网络层，验证 prompt 分层接线
vi.mock('../services/ai/apiCore', () => ({
  retryOperation: async (fn: () => Promise<string>) => fn(),
  cleanJsonString: (s: string) => s,
  parseLlmJson: (s: string) => JSON.parse(s),
  chatCompletion: vi.fn(async () =>
    JSON.stringify({ visualPrompt: 'MOCK_VP', negativePrompt: 'MOCK_NP' }),
  ),
  getActiveModel: () => undefined,
  logScriptProgress: () => {},
  getDefaultChatModelId: () => 'test-model',
  MAX_TOKENS_LONG: 8192,
  MAX_TOKENS_SHORT: 4096,
}));

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
  moodKeywords: ['tense', 'gritty'],
  consistencyAnchors: 'MASTER STYLE: cohesive noir world.',
};

const mockCharacter: Character = {
  id: 'c1',
  name: '李雷',
  gender: '男',
  age: '28',
  personality: '冷静果断',
  variations: [],
  signaturePose: { original: '靠墙站立' },
  microAction: { original: '顶腮帮子' },
};

describe('generateCharacterVisualPrompt (七层架构试点)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('调用一次 chatCompletion，且 system/user 正确分层', async () => {
    const result = await generateCharacterVisualPrompt(
      mockCharacter,
      mockArtDirection,
      'anime',
      '中文',
    );

    expect(result).toEqual({ visualPrompt: 'MOCK_VP', negativePrompt: 'MOCK_NP' });
    expect(vi.mocked(chatCompletion).mock.calls).toHaveLength(1);

    const [userPrompt, , , , , , systemPrompt] = vi.mocked(chatCompletion).mock.calls[0] as [
      string,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      string,
    ];

    // system 含美术指导 + 角色设定，但不含角色名（资产层在 user）
    expect(systemPrompt).toContain('MASTER STYLE: cohesive noir world.');
    expect(systemPrompt).toContain('world-class visual prompt engineer for anime');
    expect(systemPrompt).not.toContain('李雷');

    // user 含角色资产信息
    expect(userPrompt).toContain('李雷');
    expect(userPrompt).toContain('Visual Style: anime');
    expect(userPrompt).toContain('靠墙站立'); // 标志性姿态进入 user (L4)
  });

  it('无 artDirection 时 system 仍含角色设定且不含美术指导锚点', async () => {
    await generateCharacterVisualPrompt(mockCharacter, undefined, 'anime', '中文');
    const [, , , , , , systemPrompt] = vi.mocked(chatCompletion).mock.calls[0] as [
      string,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      string,
    ];

    expect(systemPrompt).toContain('world-class visual prompt engineer for anime');
    expect(systemPrompt).not.toContain('MASTER STYLE');
  });
});
