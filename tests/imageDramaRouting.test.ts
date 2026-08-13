import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- 依赖 mock（避免加载重型模块 / 网络 / IndexedDB） ----
vi.mock('../services/modelRegistry', () => ({
  getActiveImageModel: () => ({
    id: 'wldrama-test',
    providerId: 'wldrama',
    name: 'Drama Backend',
    params: { defaultAspectRatio: '16:9' },
  }),
  getApiBaseUrlForModel: () => 'http://117.50.108.73:8082',
  getApiKeyForModel: () => 'key',
  getProviderById: () => ({ id: 'wldrama' }),
  isBigModelProvider: () => false,
}));

vi.mock('../services/imageStorageService', () => ({
  imageStorageService: {
    saveImage: vi.fn(async () => {}),
    getImage: vi.fn(async () => new Blob(['x'])),
  },
  generateImageId: () => 'img_test',
  videoStorageService: { saveVideo: vi.fn(async () => 'v') },
}));

vi.mock('../services/ai/promptConstants', () => ({
  enhanceWithQualityTags: (p: string) => p,
}));

// 捕获 generate 请求的 URL 与 body
let lastGenerateUrl: string | null = null;
let lastGenerateBody: any = null;

import { callImageApi } from '../services/adapters/imageAdapter';

describe('callImageApi Drama Backend 多参考图路由', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', true);
    lastGenerateUrl = null;
    lastGenerateBody = null;
    let uploadCount = 0;
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const urlStr = typeof url === 'string' ? url : String(url);
      // 上传参考图
      if (urlStr.includes('/generate/uploadimage')) {
        uploadCount += 1;
        return new Response(JSON.stringify({ success: true, filename: `ref_${uploadCount}.png` }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // 生成请求（image2image / txt2image / ipastyletransfer）
      if (urlStr.includes('/api/v1/generate/')) {
        try {
          lastGenerateBody = JSON.parse(init?.body);
        } catch {
          /* ignore */
        }
        lastGenerateUrl = urlStr;
        return new Response(
          JSON.stringify({ full_url: 'http://117.50.108.73:8082/view?filename=x.png' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      // 下载生成结果
      return new Response('x', { status: 200 });
    }) as any;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('无参考图 → 走 txt2image（文生图）', async () => {
    const result = await callImageApi({
      prompt: '村口全景',
      aspectRatio: '16:9',
    });
    expect(result).toMatch(/^local:/);
    expect(lastGenerateUrl).toContain('txt2image');
    expect(lastGenerateBody.image1).toBeUndefined();
  });

  it('单张参考图 → 走 image2image（图生图，单参考）', async () => {
    const result = await callImageApi({
      prompt: '村口全景',
      referenceImages: ['local:scene1'],
      aspectRatio: '16:9',
    });
    expect(result).toMatch(/^local:/);
    expect(lastGenerateUrl).toContain('image2image');
    expect(lastGenerateBody.image1).toBeDefined();
    expect(lastGenerateBody.image2).toBeUndefined();
  });

  it('2 张参考图（场景 + 1 角色）→ 走 image2image（图生图）', async () => {
    const result = await callImageApi({
      prompt: '李云龙在村口',
      referenceImages: ['local:scene1', 'local:char1'],
      aspectRatio: '16:9',
      negativePrompt: '低质量',
    });
    expect(result).toMatch(/^local:/);
    expect(lastGenerateUrl).toContain('image2image');
    expect(lastGenerateBody.negative_prompt).toBe('低质量');
    expect(lastGenerateBody.image1).toBeDefined();
    expect(lastGenerateBody.image2).toBeDefined();
    expect(lastGenerateBody.image3).toBeUndefined();
  });

  it('3 张参考图（场景 + 2 角色）→ 走 image2image 且 3 张全传', async () => {
    const result = await callImageApi({
      prompt: '李云龙与秀芹在村口',
      referenceImages: ['local:scene1', 'local:char1', 'local:char2'],
      aspectRatio: '16:9',
    });
    expect(result).toMatch(/^local:/);
    expect(lastGenerateUrl).toContain('image2image');
    expect(lastGenerateBody.image1).toBeDefined();
    expect(lastGenerateBody.image2).toBeDefined();
    expect(lastGenerateBody.image3).toBeDefined();
  });

  it('4 张参考图 → image2image 仅取前 3 张（后端最多 3 个 image 字段）', async () => {
    const result = await callImageApi({
      prompt: '多角色场景',
      referenceImages: ['local:scene1', 'local:char1', 'local:char2', 'local:prop1'],
      aspectRatio: '16:9',
    });
    expect(result).toMatch(/^local:/);
    expect(lastGenerateUrl).toContain('image2image');
    expect(lastGenerateBody.image1).toBeDefined();
    expect(lastGenerateBody.image2).toBeDefined();
    expect(lastGenerateBody.image3).toBeDefined();
    // 第 4 张被截断，不出现在请求体
    expect(lastGenerateBody.image4).toBeUndefined();
  });

  it('显式 isIPAStyleTransfer 仍走 image2ipastyletransfer', async () => {
    await callImageApi({
      prompt: '风格迁移',
      referenceImages: ['local:a'],
      aspectRatio: '16:9',
      isIPAStyleTransfer: true,
    });
    expect(lastGenerateUrl).toContain('image2ipastyletransfer');
  });

  it('2 张参考图 + isIPAStyleTransfer=true → 走 image2ipastyletransfer 且传 image1~2、不传 ref_image', async () => {
    const result = await callImageApi({
      prompt: '李云龙与秀芹在村口',
      referenceImages: ['local:scene1', 'local:char1'],
      aspectRatio: '16:9',
      isIPAStyleTransfer: true,
    });
    expect(result).toMatch(/^local:/);
    expect(lastGenerateUrl).toContain('image2ipastyletransfer');
    expect(lastGenerateBody.image1).toBeDefined();
    expect(lastGenerateBody.image2).toBeDefined();
    // 关键帧场景不传 ref_image，避免风格源污染导致漂移
    expect(lastGenerateBody.ref_image).toBeUndefined();
  });
});
