import { describe, it, expect } from 'vitest';
import { buildH3Prompt, formatH3ShotTime, buildH3InstructionLine } from './buildH3Prompt';
import type { H3LabConfig, H3ImageSpec } from './types';

const base = (images: H3ImageSpec[]): H3LabConfig => ({
  mode: 'i2va',
  images,
  description: '[Shot 1] Live-action, cinematic, the woman shown in <Picture 1> sits by a window.',
  soundscape: '',
  music: '',
  dialogues: [],
  dialogueLang: 'Chinese',
  promptLang: 'en',
  durationSec: 8,
  aspectRatio: '16:9',
});

describe('buildH3Prompt (官方 base 模式)', () => {
  it('I2VA 首行是指令行 + 空行 + 3 字段', () => {
    const p = buildH3Prompt(base([{ role: 'first' }]));
    const lines = p.split('\n');
    expect(lines[0]).toBe(
      'For the target video, at 0.00 seconds, <Picture 1> (from [Shot 1]) is fully referenced.',
    );
    expect(lines[1]).toBe('');
    expect(p).toContain('integrated_multimodal_description: [Shot 1]');
    expect(p).toContain('overall_soundscape: N/A');
    expect(p).toContain('non_diegetic_music: N/A');
  });

  it('FL2VA 指令行锚定 Picture 1 / Picture 2 到时间轴', () => {
    const p = buildH3Prompt({
      ...base([{ role: 'first' }, { role: 'last' }]),
      description: '[Shot 1] A.\n[Shot 2] At 00:05.000, B.',
    });
    const first = p.split('\n')[0];
    expect(first).toBe(
      'For the target video, at 0.00 seconds, <Picture 1> (from [Shot 1]) is fully referenced, and at 8.00 seconds, <Picture 2> (from [Shot 2]) is fully referenced.',
    );
  });

  it('L2VA 指令行把唯一图片锚定到结尾秒', () => {
    const first = buildH3InstructionLine([{ role: 'last' }], 8);
    expect(first).toBe(
      'For the target video, at 8.00 seconds, <Picture 1> (from [Shot 1]) is fully referenced.',
    );
  });

  it('I2VA + 参考图：参考图作为 Picture N 列出 is referenced', () => {
    const first = buildH3InstructionLine([{ role: 'first' }, { role: 'ref' }, { role: 'ref' }], 8);
    expect(first).toBe(
      'For the target video, at 0.00 seconds, <Picture 1> (from [Shot 1]) is fully referenced, and <Picture 2> (from [Shot 2]) is referenced, and <Picture 3> (from [Shot 3]) is referenced.',
    );
  });

  it('结构化对白按时间转写为 <d>[语言] 文本</d> 并追加为镜头行', () => {
    const p = buildH3Prompt({
      ...base([{ role: 'first' }]),
      dialogues: [
        { id: '1', timestamp: 3.5, character: 'Boy', text: '要是时间能停在这一刻就好了' },
      ],
    });
    expect(p).toContain(
      '[Shot 2] At 00:03.500, Boy says: <d>[Chinese] 要是时间能停在这一刻就好了</d>',
    );
  });

  it('分镜时间格式为 At MM:SS.mmm（英文，3 位毫秒）', () => {
    expect(formatH3ShotTime(3.5)).toBe('At 00:03.500');
    expect(formatH3ShotTime(65.25)).toBe('At 01:05.250');
  });
});
