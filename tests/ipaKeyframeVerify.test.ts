import { describe, it, expect } from 'vitest';
import { buildIPAKeyframeRequest } from '../components/StageDirector/utils';

describe('buildIPAKeyframeRequest（IPA 关键帧验证请求构造）', () => {
  const sceneImage = 'local:scene_concept';
  const characterRefs = [
    { name: '李云龙', threeViewImageUrl: 'local:li_three_view', imageUrl: 'local:li_portrait' },
    { name: '赵刚', threeViewImageUrl: 'local:zhao_three_view', imageUrl: 'local:zhao_portrait' },
  ];

  it('referenceImages 顺序严格为 [场景, 角色1三视图, 角色2三视图]', () => {
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落，李云龙踱步，赵刚沉默',
      sceneImage,
      characterRefs,
      shotId: 'shot-1',
    });
    expect(req.referenceImages).toEqual([
      'local:scene_concept',
      'local:li_three_view',
      'local:zhao_three_view',
    ]);
  });

  it('ref_image 使用场景概念图（与 image1 同源）', () => {
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落',
      sceneImage,
      characterRefs,
      shotId: 'shot-1',
    });
    expect(req.refImage).toBe('local:scene_concept');
  });

  it('角色优先使用三视图，缺失三视图时回退定妆照 imageUrl', () => {
    const refs = [
      { name: '李云龙', threeViewImageUrl: 'local:li_three_view', imageUrl: 'local:li_portrait' },
      { name: '赵刚', imageUrl: 'local:zhao_portrait' }, // 无三视图
    ];
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落',
      sceneImage,
      characterRefs: refs,
      shotId: 'shot-1',
    });
    expect(req.referenceImages).toEqual([
      'local:scene_concept',
      'local:li_three_view',
      'local:zhao_portrait',
    ]);
  });

  it('isIPAStyleTransfer 必为 true，resourceType 为 keyframe', () => {
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落',
      sceneImage,
      characterRefs,
      shotId: 'shot-1',
    });
    expect(req.isIPAStyleTransfer).toBe(true);
    expect(req.resourceType).toBe('keyframe');
    expect(req.resourceId).toBe('shot-1');
  });

  it('prompt 追加真人电影风格锁定段（对抗 IPA 风格漂移）', () => {
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落，没有风格关键词',
      sceneImage,
      characterRefs,
      visualStyle: 'live-action',
      shotId: 'shot-1',
    });
    expect(req.prompt).toContain('live-action photographic realism');
    expect(req.prompt).toContain('strictly no cartoon');
  });

  it('角色无任何图片时该行被过滤（不传空串给后端）', () => {
    const refs = [
      { name: '李云龙', threeViewImageUrl: 'local:li_three_view' },
      { name: '赵刚' }, // 既无三视图也无定妆照
    ];
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落',
      sceneImage,
      characterRefs: refs,
      shotId: 'shot-1',
    });
    expect(req.referenceImages).toEqual(['local:scene_concept', 'local:li_three_view']);
  });

  it('negativePrompt 透传', () => {
    const req = buildIPAKeyframeRequest({
      basePrompt: '农家院落',
      sceneImage,
      characterRefs,
      negativePrompt: '避免卡通化',
      shotId: 'shot-1',
    });
    expect(req.negativePrompt).toBe('避免卡通化');
  });
});
