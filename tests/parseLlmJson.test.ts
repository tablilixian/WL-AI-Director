import { describe, it, expect } from 'vitest';
import { parseLlmJson } from '../services/ai/apiCore';

describe('parseLlmJson (统一 LLM JSON 健壮解析)', () => {
  it('合法对象 JSON 直接透传，行为与 JSON.parse 一致', () => {
    const raw = '{"a":1,"b":[1,2,3]}';
    expect(parseLlmJson(raw)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('合法数组 JSON 直接透传', () => {
    const raw = '[{"x":1},{"x":2}]';
    expect(parseLlmJson(raw)).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('修复字符串值内部的未转义双引号（Expected "," or "}"）', () => {
    const broken = `{
  "name": "他说"你好"大声地",
  "gender": "男"
}`;
    const parsed = parseLlmJson<{ name: string; gender: string }>(broken);
    expect(parsed.name).toBe('他说"你好"大声地');
    expect(parsed.gender).toBe('男');
  });

  it('修复字符串值内部的原始换行（V8: Bad control character）', () => {
    const broken = `{
  "logline": "一个跨越时间的故事
讲述爱与勇气",
  "items": []
}`;
    const parsed = parseLlmJson<{ logline: string }>(broken);
    expect(parsed.logline).toContain('跨越时间');
  });

  it('修复对象/数组末尾的多余逗号', () => {
    const broken = `{
  "title": "x",
  "genre": "通用",
}`;
    expect(() => parseLlmJson(broken)).not.toThrow();
  });

  it('从 markdown 围栏 + 前后噪声中截出 JSON', () => {
    const broken = `好的，这是结果：
\`\`\`json
{"title":"剧名","ok":true}
\`\`\`
以上为结果。`;
    const parsed = parseLlmJson<{ title: string; ok: boolean }>(broken);
    expect(parsed.title).toBe('剧名');
    expect(parsed.ok).toBe(true);
  });

  it('完全非法输入抛出带上下文的错误', () => {
    expect(() => parseLlmJson('这不是 json 而且也无法修复{{{', '测试上下文')).toThrow(/测试上下文/);
  });

  it('修复数组元素之间漏写的逗号（Expected "," or "]"，命中 s2 分镜生成报错）', () => {
    const broken = `{
  "shots": [
    {"id":"s2_sh1","actionSummary":"踱步","dialogue":""}
    {"id":"s2_sh2","actionSummary":"对视","dialogue":""}
  ]
}`;
    const parsed = parseLlmJson<{ shots: Array<{ id: string }> }>(broken);
    expect(Array.isArray(parsed.shots)).toBe(true);
    expect(parsed.shots).toHaveLength(2);
    expect(parsed.shots[0].id).toBe('s2_sh1');
    expect(parsed.shots[1].id).toBe('s2_sh2');
  });

  it('修复同一数组内相邻字符串/数字缺逗号', () => {
    const broken = `{"vals": ["a" "b" "c" 1 2 3]}`;
    const parsed = parseLlmJson<{ vals: Array<string | number> }>(broken);
    expect(parsed.vals).toEqual(['a', 'b', 'c', 1, 2, 3]);
  });

  it('修复嵌套数组内元素缺逗号（不误伤对象容器）', () => {
    const broken = `{
  "scene": {"shots": [{"id":"a"}{"id":"b"}]},
  "list": [[1 2][3 4]]
}`;
    const parsed = parseLlmJson<{ scene: { shots: Array<{ id: string }> }; list: number[][] }>(
      broken,
    );
    expect(parsed.scene.shots).toHaveLength(2);
    expect(parsed.list).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('对象容器内不误补逗号（key:"..." 结构保持原样）', () => {
    // 合法对象，修复器不应在 key/value 之间插入多余逗号
    const raw = `{"title":"剧名","meta":{"year":2024,"ok":true},"list":[1,2,3]}`;
    const parsed = parseLlmJson<{
      title: string;
      meta: { year: number; ok: boolean };
      list: number[];
    }>(raw);
    expect(parsed.title).toBe('剧名');
    expect(parsed.meta.year).toBe(2024);
    expect(parsed.list).toEqual([1, 2, 3]);
  });
});
