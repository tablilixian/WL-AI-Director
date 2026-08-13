import { describe, it, expect } from 'vitest';
import { repairBrokenJson } from '../services/ai/apiCore';

describe('repairBrokenJson (B01 剧本解析兜底修复)', () => {
  it('修复字符串值内部的未转义双引号（导致 Expected "," or "}"）', () => {
    const broken = `{
  "title": "测试剧本",
  "characters": [{"id": "1", "name": "他说"你好"大声地", "gender": "男"}],
  "scenes": [{"id": "s1", "location": "街道", "time": "夜", "atmosphere": "紧张"}]
}`;
    const fixed = repairBrokenJson(broken);
    expect(() => JSON.parse(fixed)).not.toThrow();
    const parsed = JSON.parse(fixed);
    expect(parsed.characters[0].name).toBe('他说"你好"大声地');
  });

  it('修复字符串值内部的原始换行（V8: Bad control character）', () => {
    const broken = `{
  "logline": "一个跨越时间的故事
讲述爱与勇气",
  "characters": []
}`;
    const fixed = repairBrokenJson(broken);
    expect(() => JSON.parse(fixed)).not.toThrow();
    const parsed = JSON.parse(fixed);
    expect(parsed.logline).toContain('跨越时间');
  });

  it('修复对象末尾的多余逗号', () => {
    const broken = `{
  "title": "x",
  "genre": "通用",
}`;
    const fixed = repairBrokenJson(broken);
    expect(() => JSON.parse(fixed)).not.toThrow();
  });

  it('从 markdown 围栏 + 前后噪声中截出 JSON', () => {
    const broken = `好的，这是解析结果：
\`\`\`json
{
  "title": "剧名",
  "characters": [{"id": "1", "name": "小明", "gender": "男", "age": "12", "personality": "活泼"}]
}
\`\`\`
以上为结果。`;
    const fixed = repairBrokenJson(broken);
    expect(() => JSON.parse(fixed)).not.toThrow();
    const parsed = JSON.parse(fixed);
    expect(parsed.characters[0].name).toBe('小明');
  });
});
