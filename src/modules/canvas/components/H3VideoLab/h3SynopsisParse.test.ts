import { describe, it, expect } from 'vitest';
import { parseJsonSafe } from './h3SynopsisParse';

describe('parseJsonSafe (H3 AI 助手 JSON 容错)', () => {
  it('解析干净 JSON', () => {
    const r = parseJsonSafe(
      JSON.stringify({
        description: 'A',
        soundscape: 'B',
        music: 'C',
        dialogues: [{ timestamp: 1, character: 'X', text: 'hi' }],
      }),
    );
    expect(r?.description).toBe('A');
    expect(r?.dialogues[0].text).toBe('hi');
  });

  it('解析 ```json 代码块', () => {
    const r = parseJsonSafe('```json\n{"description":"A","soundscape":"B","music":"C"}\n```');
    expect(r?.description).toBe('A');
  });

  it('解析散文包裹的 JSON', () => {
    const r = parseJsonSafe(
      'Sure! Here is the result:\n{"description":"A","soundscape":"B","music":"C"}\nHope that helps.',
    );
    expect(r?.description).toBe('A');
  });

  it('修复被截断的 JSON', () => {
    const truncated =
      '{"description":"A long text that gets cut off before closing","soundscape":"B"';
    const r = parseJsonSafe(truncated);
    expect(r).not.toBeNull();
    expect(r?.description).toContain('cut off');
    expect(r?.soundscape).toBe('B');
  });

  it('兼容官方长字段名别名', () => {
    const r = parseJsonSafe(
      JSON.stringify({
        integrated_multimodal_description: 'D',
        overall_soundscape: 'S',
        non_diegetic_music: 'M',
      }),
    );
    expect(r?.description).toBe('D');
    expect(r?.soundscape).toBe('S');
    expect(r?.music).toBe('M');
  });

  it('对白键名别名归一', () => {
    const r = parseJsonSafe(
      JSON.stringify({ description: 'A', dialogues: [{ time: 2, speaker: 'Bob', line: 'hello' }] }),
    );
    expect(r?.dialogues[0]).toEqual({ timestamp: 2, character: 'Bob', text: 'hello' });
  });

  it('无 JSON 对象时返回 null', () => {
    expect(parseJsonSafe('Sorry, I cannot help with that.')).toBeNull();
  });
});
