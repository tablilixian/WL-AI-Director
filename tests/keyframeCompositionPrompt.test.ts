import { describe, it, expect } from 'vitest';
import { buildKeyframePrompt } from '../components/StageDirector/utils';

describe('buildKeyframePrompt 多角色构图指令', () => {
  const baseArgs = [
    '李云龙在村口怒吼',
    'live-action',
    'Tracking Shot',
    'start' as const,
    undefined,
    undefined,
    undefined,
  ];

  it('单个角色时不要求"多角色"，但应出现该角色名', async () => {
    const prompt = await (buildKeyframePrompt as any)(...baseArgs, [
      { name: '李云龙', visualPrompt: '粗布军服', hasImage: true },
    ]);
    expect(prompt).toContain('李云龙');
    // 单角色不应触发"多角色构图要求"段落
    expect(prompt).not.toContain('MULTI-SUBJECT COMPOSITION');
  });

  it('两个角色时必须包含【多角色构图要求】且列出全部角色名', async () => {
    const prompt = await (buildKeyframePrompt as any)(...baseArgs, [
      { name: '李云龙', visualPrompt: '粗布军服', hasImage: true },
      { name: '秀芹', visualPrompt: '碎花棉袄', hasImage: true },
    ]);
    expect(prompt).toContain('MULTI-SUBJECT COMPOSITION');
    expect(prompt).toContain('李云龙');
    expect(prompt).toContain('秀芹');
    // 明确要求"全部角色都须完整、清晰入镜"，避免次要角色被漏掉
    expect(prompt).toContain('缺一不可');
    expect(prompt).toContain('清晰入镜');
    // 角色数量写入段落
    expect(prompt).toContain('2 名角色');
  });

  it('三个角色时数量与角色名均正确', async () => {
    const prompt = await (buildKeyframePrompt as any)(...baseArgs, [
      { name: 'A', visualPrompt: '', hasImage: true },
      { name: 'B', visualPrompt: '', hasImage: true },
      { name: 'C', visualPrompt: '', hasImage: true },
    ]);
    expect(prompt).toContain('3 名角色');
    expect(prompt).toContain('A');
    expect(prompt).toContain('B');
    expect(prompt).toContain('C');
  });

  it('有参考图的角色：定妆照生成提示词不得泄漏进关键帧提示词', async () => {
    // 用一段典型的"角色定妆照"文案（含专属姿态/机位/打光指令）作为 visualPrompt
    const portraitPrompt =
      '8K真人电影摄影风格，倚靠在战场的断壁残垣上，一手搭在日军军刀刀柄上，三点布光结合黄昏逆光';
    const prompt = await (buildKeyframePrompt as any)(...baseArgs, [
      { name: '李云龙', visualPrompt: portraitPrompt, hasImage: true },
      { name: '赵刚', visualPrompt: '儒雅理性的指挥官，倚靠废墟残墙', hasImage: true },
    ]);
    // 关键回归点：定妆照专属文案不应出现（避免与关键帧场景冲突、角色姿态错乱）
    expect(prompt).not.toContain('断壁残垣');
    expect(prompt).not.toContain('日军军刀刀柄');
    expect(prompt).not.toContain('三点布光结合黄昏逆光');
    // 但仍应出现"以参考图为准"的精简提示，并列出角色名
    expect(prompt).toContain('以参考图为准');
    expect(prompt).toContain('李云龙');
    expect(prompt).toContain('赵刚');
    // 不应再出现旧的"【角色外观】...当前镜头涉及以下角色，外观描述必须严格遵循"整段
    expect(prompt).not.toContain('外观描述必须严格遵循');
  });

  it('无参考图的角色：仍以文字回退注入外观描述', async () => {
    const prompt = await (buildKeyframePrompt as any)(...baseArgs, [
      { name: '李云龙', visualPrompt: '粗布军服八路军指挥官', hasImage: false },
    ]);
    // 无参考图 → 文字回退段应出现，并包含其外观描述
    expect(prompt).toContain('文字回退');
    expect(prompt).toContain('粗布军服八路军指挥官');
    // 单角色仍不触发多角色段落
    expect(prompt).not.toContain('MULTI-SUBJECT COMPOSITION');
  });
});
