import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- 依赖 mock（避免加载重型模块 / 网络 / IndexedDB） ----
vi.mock('../services/adapters/imageAdapter', () => ({
  uploadImageToDramaBackend: vi.fn(async (img: string) => {
    if (img.includes('START')) return 'ref_start.png';
    if (img.includes('END')) return 'ref_end.png';
    return 'ref_other.png';
  }),
}));

vi.mock('../services/imageStorageService', () => ({
  videoStorageService: {
    saveVideo: vi.fn(async () => 'vid_test'),
  },
}));

vi.mock('../services/unifiedImageService', () => ({
  unifiedImageService: {
    resolveForApi: vi.fn(async (ref: string) => ref),
  },
}));

// 捕获 generate 请求的 URL 与 body
let lastGenerateUrl: string | null = null;
let lastGenerateBody: any = null;

import { callDramaBackendVideoApi } from '../services/adapters/videoAdapter';

describe('callDramaBackendVideoApi 首尾帧路由', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true);
    lastGenerateUrl = null;
    lastGenerateBody = null;
    // fetch mock：generate 请求返回 full_url，下载请求返回 blob
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const urlStr = typeof url === 'string' ? url : String(url);
      if (urlStr.includes('/api/v1/generate/')) {
        try {
          lastGenerateBody = JSON.parse(init?.body);
        } catch {
          /* ignore */
        }
        lastGenerateUrl = urlStr;
        return new Response(
          JSON.stringify({ full_url: 'http://117.50.108.73:8082/view?filename=video_x.mp4' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('x', { status: 200 });
    }) as any;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const dummyModel = {} as any;

  it('仅首帧（无尾帧）→ 走 image2videomsr，background + image1 复用首帧', async () => {
    const result = await callDramaBackendVideoApi(
      { prompt: 'p', startImage: 'data:image/png;base64,START', aspectRatio: '16:9' },
      dummyModel,
      '/drama-api',
    );

    expect(result).toMatch(/^video:/);
    expect(lastGenerateUrl).toContain('image2videomsr');
    expect(lastGenerateBody.background).toBe('ref_start.png');
    expect(lastGenerateBody.image1).toBe('ref_start.png');
    // MSR 不应出现 MKR 的 images 关键帧数组
    expect(lastGenerateBody.images).toBeUndefined();
  });

  it('首帧 + 尾帧 → 走 image2videomkr，images 数组首帧=0 / 尾帧=-1', async () => {
    const result = await callDramaBackendVideoApi(
      {
        prompt: 'p',
        startImage: 'data:image/png;base64,START',
        endImage: 'data:image/png;base64,END',
        aspectRatio: '16:9',
        duration: 10,
      },
      dummyModel,
      '/drama-api',
    );

    expect(result).toMatch(/^video:/);
    expect(lastGenerateUrl).toContain('image2videomkr');
    // MKR 不应使用 background 字段
    expect(lastGenerateBody.background).toBeUndefined();
    expect(Array.isArray(lastGenerateBody.images)).toBe(true);
    expect(lastGenerateBody.images).toHaveLength(2);
    expect(lastGenerateBody.images[0]).toEqual({ image: 'ref_start.png', frame_index: 0 });
    expect(lastGenerateBody.images[1]).toEqual({ image: 'ref_end.png', frame_index: -1 });
    // duration 透传（尊重用户选择的时长，而非默认 5）
    expect(lastGenerateBody.duration).toBe(10);
  });
});
