import { describe, it, expect, vi, beforeEach } from 'vitest';

// 捕获 generateImage 透传给 callImageApi 的参数（避免真实网络 / Drama Backend）
const callImageApiMock = vi.fn((..._args: any[]) => 'local:test');
vi.mock('../services/adapters/imageAdapter', () => ({
  callImageApi: (...args: any[]) => callImageApiMock(...args),
}));

vi.mock('../services/modelRegistry', () => ({
  getActiveModel: () => ({ apiModel: 'x', id: 'x', providerId: 'wldrama' }),
  getActiveImageModel: () => ({ apiModel: 'x', id: 'x', providerId: 'wldrama' }),
  getApiBaseUrlForModel: () => 'http://117.50.108.73:8082',
  getApiKeyForModel: () => 'key',
}));

import { generateImage } from '../services/ai/visualService';
import { shouldUseIPAFusion, appendStyleAnchor } from '../components/StageDirector/utils';

describe('shouldUseIPAFusion - 关键帧是否启用 IPA 多参考融合', () => {
  it('多参考图（场景+角色）且关联角色 → true', () => {
    expect(shouldUseIPAFusion(2, 1)).toBe(true);
    expect(shouldUseIPAFusion(3, 2)).toBe(true);
    expect(shouldUseIPAFusion(4, 1)).toBe(true);
  });

  it('仅单张参考图（如只有场景）→ false（image2image 足够）', () => {
    expect(shouldUseIPAFusion(1, 1)).toBe(false);
  });

  it('无关联角色 → false（不需要多角色融合）', () => {
    expect(shouldUseIPAFusion(3, 0)).toBe(false);
  });
});

describe('appendStyleAnchor - 真人电影风格锁定（对抗 IPA 漂移）', () => {
  it('live-action 默认 prompt 不含真人关键词时，尾部追加风格锁定段', () => {
    const out = appendStyleAnchor('李云龙在村口', 'live-action');
    expect(out).toContain('【风格锁定】STYLE LOCK');
    expect(out).toContain('photorealistic');
    expect(out.startsWith('李云龙在村口')).toBe(true);
  });

  it('prompt 已含真人写实关键词时不重复追加', () => {
    const p = 'photorealistic 李云龙在村口';
    expect(appendStyleAnchor(p, 'live-action')).toBe(p);
  });

  it('未知视觉风格回退为原 prompt（不崩溃）', () => {
    const p = 'some prompt';
    expect(appendStyleAnchor(p, 'unknown-style')).toBe(p);
  });
});

describe('generateImage - useIPA 透传 isIPAStyleTransfer', () => {
  beforeEach(() => callImageApiMock.mockClear());

  it('useIPA=true → callImageApi 收到 isIPAStyleTransfer:true 与参考图', async () => {
    await generateImage(
      '李云龙与秀芹在村口',
      ['local:scene1', 'local:char1'],
      '16:9',
      false,
      false,
      'keyframe',
      'shot-1',
      undefined,
      true,
    );
    expect(callImageApiMock).toHaveBeenCalledTimes(1);
    const opts = callImageApiMock.mock.calls[0][0];
    expect(opts.isIPAStyleTransfer).toBe(true);
    expect(opts.referenceImages).toEqual(['local:scene1', 'local:char1']);
  });

  it('useIPA 省略 → 默认 undefined，不误触发 IPA 路由', async () => {
    await generateImage('村口全景', ['local:scene1'], '16:9', false, false, 'keyframe', 'shot-1');
    const opts = callImageApiMock.mock.calls[0][0];
    expect(opts.isIPAStyleTransfer).toBeUndefined();
  });
});
