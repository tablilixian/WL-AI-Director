import { describe, it, expect } from 'vitest';
import { validateCanvasIntegrity } from '../src/modules/canvas/services/canvasIntegrity';
import type { LayerData } from '../src/modules/canvas/types/canvas';

function makeLayer(partial: Partial<LayerData> & { id: string }): LayerData {
  const { id, ...rest } = partial;
  return {
    id,
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    src: '',
    title: id,
    createdAt: Date.now(),
    ...rest,
  };
}

describe('validateCanvasIntegrity', () => {
  it('返回空数组当图层为空', () => {
    expect(validateCanvasIntegrity([])).toEqual([]);
  });

  it('正常数据无问题', () => {
    const layers = [makeLayer({ id: 'a' }), makeLayer({ id: 'b', sourceLayerId: 'a' })];
    expect(validateCanvasIntegrity(layers)).toEqual([]);
  });

  it('检测重复图层 ID', () => {
    const layers = [makeLayer({ id: 'a' }), makeLayer({ id: 'a' })];
    const issues = validateCanvasIntegrity(layers);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('DUPLICATE_LAYER_ID');
    expect(issues[0].severity).toBe('error');
  });

  it('检测断链来源引用（单来源）', () => {
    const layers = [makeLayer({ id: 'b', sourceLayerId: 'missing' })];
    const issues = validateCanvasIntegrity(layers);
    expect(issues.some((i) => i.code === 'BROKEN_SOURCE_REF')).toBe(true);
  });

  it('检测断链来源引用（多来源，来源排在后面不算断链）', () => {
    const layers = [makeLayer({ id: 'b', sourceLayerIds: ['a'] }), makeLayer({ id: 'a' })];
    expect(validateCanvasIntegrity(layers)).toEqual([]);
  });

  it('检测损坏的推演流 JSON', () => {
    const layers = [
      makeLayer({
        id: 'flow',
        operationType: 'story-deduction-flow',
        generationPrompt: '{ not valid json',
      }),
    ];
    const issues = validateCanvasIntegrity(layers);
    expect(issues.some((i) => i.code === 'CORRUPT_FLOW_DATA')).toBe(true);
  });

  it('合法推演流 JSON 不报错', () => {
    const layers = [
      makeLayer({
        id: 'flow',
        operationType: 'story-deduction-flow',
        generationPrompt: JSON.stringify({ sourceLayerId: 'x', phase: 'done' }),
      }),
    ];
    expect(validateCanvasIntegrity(layers)).toEqual([]);
  });

  it('检测持久 blob: src 并标记为 warning', () => {
    const layers = [makeLayer({ id: 'img', src: 'blob:https://x/abc' })];
    const issues = validateCanvasIntegrity(layers);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('BLOB_SRC_PERSISTED');
    expect(issues[0].severity).toBe('warning');
  });

  it('error 排在 warning 之前', () => {
    const layers = [
      makeLayer({ id: 'dup' }),
      makeLayer({ id: 'dup' }),
      makeLayer({ id: 'img', src: 'blob:https://x/abc' }),
    ];
    const issues = validateCanvasIntegrity(layers);
    const firstErrorIdx = issues.findIndex((i) => i.severity === 'error');
    const firstWarnIdx = issues.findIndex((i) => i.severity === 'warning');
    expect(firstErrorIdx).toBeGreaterThanOrEqual(0);
    expect(firstWarnIdx).toBeGreaterThan(firstErrorIdx);
  });
});
