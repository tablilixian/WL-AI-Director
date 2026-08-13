import { describe, it, expect, vi } from 'vitest';
import {
  generateKeyframeComposite,
  assignCharacterLayout,
  extractAppearanceText,
  buildEmptyScenePrompt,
  buildCharacterInpaintPrompt,
  type KeyframeCompositeDeps,
} from '../components/StageDirector/utils';

describe('assignCharacterLayout', () => {
  it('1 人 → 居中前景', () => {
    expect(assignCharacterLayout(1)).toEqual(['center foreground']);
  });
  it('2 人 → 左 / 右', () => {
    expect(assignCharacterLayout(2)).toEqual(['left side of the frame', 'right side of the frame']);
  });
  it('3 人 → 左 / 中 / 右', () => {
    expect(assignCharacterLayout(3)).toEqual([
      'left side of the frame',
      'center of the frame',
      'right side of the frame',
    ]);
  });
  it('超过 3 人 → 均匀分布到左中右', () => {
    const layout = assignCharacterLayout(5);
    expect(layout).toHaveLength(5);
    expect(layout.every((l) => /of the frame$/.test(l))).toBe(true);
  });
});

describe('extractAppearanceText', () => {
  it('剥离肖像生成专属指令（portrait / studio lighting 等）', () => {
    const input =
      'full body portrait, a grizzled Eighth Route Army commander in grey-blue padded uniform, studio lighting, serious expression, signature pose';
    const out = extractAppearanceText(input);
    expect(out).not.toMatch(/portrait/i);
    expect(out).not.toMatch(/studio lighting/i);
    expect(out).not.toMatch(/signature pose/i);
    expect(out).toContain('grey-blue padded uniform');
    expect(out).toContain('serious expression');
  });

  it('空输入返回空串，非空但剥离后为空则返回原文', () => {
    expect(extractAppearanceText('')).toBe('');
    expect(extractAppearanceText('portrait')).toBe('portrait');
  });
});

describe('buildEmptyScenePrompt', () => {
  it('包含空场景强制指令且不含角色一致性段落', async () => {
    const p = await buildEmptyScenePrompt(
      '昏暗农家院落，煤油灯微光',
      'live-action',
      'Tracking Shot',
      'start',
    );
    expect(p).toContain('EMPTY SCENE');
    expect(p.toLowerCase()).toContain('no people');
    expect(p).toContain('live-action photographic realism');
    // 空场景不应出现"角色一致性要求"这种面向人物的段落
    expect(p).not.toContain('角色一致性要求');
  });
});

describe('buildCharacterInpaintPrompt', () => {
  it('包含角色名、站位、外貌与风格锚定', () => {
    const p = buildCharacterInpaintPrompt({
      name: '李云龙',
      appearanceText: 'grey-blue padded uniform, weathered face',
      position: 'left side of the frame',
      visualStyle: 'live-action',
      frameType: 'start',
    });
    expect(p).toContain('李云龙');
    expect(p).toContain('left side of the frame');
    expect(p).toContain('grey-blue padded uniform');
    expect(p).toContain('photorealistic');
    expect(p).toContain('Do NOT alter the background');
  });
});

describe('generateKeyframeComposite（两阶段合成编排）', () => {
  const characterDescriptions = [
    {
      name: '李云龙',
      visualPrompt: 'full body portrait, grey-blue uniform, studio lighting',
      hasImage: true,
    },
    {
      name: '赵刚',
      visualPrompt: 'portrait, spectacled political commissar, plain background',
      hasImage: true,
    },
  ];

  const makeDeps = (): KeyframeCompositeDeps & {
    generateScene: ReturnType<typeof vi.fn>;
    inpaint: ReturnType<typeof vi.fn>;
    onStage: ReturnType<typeof vi.fn>;
  } => {
    const generateScene = vi.fn(async () => 'local:scene');
    const inpaint = vi.fn(async (_img: string, _p: string) => 'local:after-inpaint');
    const onStage = vi.fn();
    return { generateScene, inpaint, onStage };
  };

  it('已有场景图时直接复用，不再调用 generateScene（修复：不重画场景）', async () => {
    const deps = makeDeps();
    const url = await generateKeyframeComposite({
      basePrompt: '农家院落',
      visualStyle: 'live-action',
      cameraMovement: 'Tracking Shot',
      frameType: 'start',
      sceneImage: 'local:scene-ref',
      characterDescriptions,
      deps,
    });

    // 关键断言：场景图已存在时，不得再生成一次空场景
    expect(deps.generateScene).not.toHaveBeenCalled();
    // 每个角色各 inpaint 一次
    expect(deps.inpaint).toHaveBeenCalledTimes(2);
    // 第一次 inpaint 的底图必须是用户已有的场景图
    expect(deps.inpaint.mock.calls[0][0]).toBe('local:scene-ref');
    // 最终结果应为最后一次 inpaint 的返回
    expect(url).toBe('local:after-inpaint');
  });

  it('无场景图时走兜底：调用一次 generateScene 生成空场景（参考数组为空）', async () => {
    const deps = makeDeps();
    await generateKeyframeComposite({
      basePrompt: '农家院落',
      visualStyle: 'live-action',
      cameraMovement: 'Tracking Shot',
      frameType: 'start',
      characterDescriptions,
      deps,
    });
    expect(deps.generateScene).toHaveBeenCalledTimes(1);
    expect(deps.generateScene.mock.calls[0][1]).toEqual([]);
    expect(deps.generateScene.mock.calls[0][0]).toContain('EMPTY SCENE');
    expect(deps.inpaint).toHaveBeenCalledTimes(2);
  });

  it('inpaint 把前一步结果作为底图传入，并按角色顺序执行', async () => {
    const order: string[] = [];
    const deps: KeyframeCompositeDeps = {
      generateScene: vi.fn(async () => 'local:stage0'),
      inpaint: vi.fn(async (img: string) => {
        order.push(img);
        return 'local:next';
      }),
      onStage: vi.fn(),
    };
    await generateKeyframeComposite({
      basePrompt: '农家院落',
      visualStyle: 'live-action',
      cameraMovement: 'Tracking Shot',
      frameType: 'start',
      sceneImage: 'local:scene-ref',
      characterDescriptions,
      deps,
    });
    // 第一次 inpaint 的底图应是用户已有场景图
    expect(order[0]).toBe('local:scene-ref');
    expect(order[1]).toBe('local:next');
  });

  it('onStage 阶段编号：有场景图时仅角色补绘（阶段数 = 角色数）', async () => {
    const onStage = vi.fn();
    const deps: KeyframeCompositeDeps = {
      generateScene: vi.fn(async () => 'local:scene'),
      inpaint: vi.fn(async () => 'local:next'),
      onStage,
    };
    await generateKeyframeComposite({
      basePrompt: '农家院落',
      visualStyle: 'live-action',
      cameraMovement: 'Tracking Shot',
      frameType: 'start',
      sceneImage: 'local:scene-ref',
      characterDescriptions,
      deps,
    });
    expect(onStage).toHaveBeenCalledTimes(3); // 1 复用提示 + 2 角色
    expect(onStage.mock.calls[0][0]).toContain('直接使用已生成的场景图');
    expect(onStage.mock.calls[1][0]).toContain('阶段 1/2');
    expect(onStage.mock.calls[2][0]).toContain('阶段 2/2');
  });
});
