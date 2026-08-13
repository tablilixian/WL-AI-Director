import { describe, it, expect } from 'vitest';
import { sanitizeLayersForCloud } from '../services/canvasCloudApi';

// 大体积 data: URL（模拟一张生成图的 base64，轻松突破 PocketBase 1MB json 上限）
const bigDataUrl = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);

describe('sanitizeLayersForCloud', () => {
  it('把 data: src 转为 local: 持久引用（有 imageId 时）', () => {
    const layers = [{ id: 'l1', src: bigDataUrl, imageId: 'img_123', type: 'image' }];
    const out = sanitizeLayersForCloud(layers);
    expect(out[0].src).toBe('local:img_123');
    // 体积从 ~2MB 降到几十字节，杜绝云端 1MB 上限 400
    expect(JSON.stringify(out).length).toBeLessThan(200);
    expect(out[0].imageId).toBe('img_123');
  });

  it('无 imageId 的 data: src 直接丢弃', () => {
    const layers = [{ id: 'l1', src: bigDataUrl, type: 'image' }];
    const out = sanitizeLayersForCloud(layers);
    expect(out[0].src).toBeUndefined();
  });

  it('blob: src 同样处理', () => {
    const layers = [{ id: 'l2', src: 'blob:http://x/abc', imageId: 'img_9' }];
    const out = sanitizeLayersForCloud(layers);
    expect(out[0].src).toBe('local:img_9');
  });

  it('local:/http(s) src 原样保留', () => {
    const layers = [
      { id: 'l3', src: 'local:img_7' },
      { id: 'l4', src: 'https://example.com/a.png' },
    ];
    const out = sanitizeLayersForCloud(layers);
    expect(out[0].src).toBe('local:img_7');
    expect(out[1].src).toBe('https://example.com/a.png');
  });

  it('空 src / 占位图层不受影响', () => {
    const layers = [{ id: 'l5', src: '', isLoading: true }];
    const out = sanitizeLayersForCloud(layers);
    expect(out[0].src).toBe('');
    expect(out[0].isLoading).toBe(true);
  });

  it('非数组输入原样返回', () => {
    expect(sanitizeLayersForCloud(null as any)).toBeNull();
    expect(sanitizeLayersForCloud(undefined as any)).toBeUndefined();
  });
});
