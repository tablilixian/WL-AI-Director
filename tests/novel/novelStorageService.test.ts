import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NovelAnalysis } from '../../types/novel';
import {
  saveNovelAnalysis,
  loadNovelAnalysis,
  getAllNovelAnalyses,
  deleteNovelAnalysis,
} from '../../services/novel/novelStorageService';

function createMockAnalysis(overrides: Partial<NovelAnalysis> = {}): NovelAnalysis {
  return {
    id: overrides.id || 'test-id',
    projectId: overrides.projectId || '',
    fileInfo: {
      id: 'file-1',
      fileName: 'test.txt',
      fileType: 'txt',
      fileSize: 1000,
      uploadTime: Date.now(),
    },
    rawText: 'test content',
    title: overrides.title || '测试小说',
    author: '测试作者',
    genre: '玄幻',
    summary: '测试摘要',
    chapters: [],
    characters: [],
    keyScenes: [],
    keyItems: [],
    worldSettings: [],
    status: 'completed',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('novelStorageService', () => {
  beforeEach(async () => {
    const all = await getAllNovelAnalyses();
    for (const item of all) {
      await deleteNovelAnalysis(item.id);
    }
  });

  it('should save and load a novel analysis', async () => {
    const analysis = createMockAnalysis();
    await saveNovelAnalysis(analysis);
    const loaded = await loadNovelAnalysis('test-id');
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('测试小说');
    expect(loaded!.status).toBe('completed');
  });

  it('should return null for non-existent id', async () => {
    const result = await loadNovelAnalysis('non-existent');
    expect(result).toBeNull();
  });

  it('should list all saved analyses', async () => {
    const a1 = createMockAnalysis({ id: 'id-1', title: '小说A' });
    const a2 = createMockAnalysis({ id: 'id-2', title: '小说B' });
    await saveNovelAnalysis(a1);
    await saveNovelAnalysis(a2);
    const list = await getAllNovelAnalyses();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('should delete an analysis', async () => {
    const analysis = createMockAnalysis({ id: 'delete-test' });
    await saveNovelAnalysis(analysis);
    await deleteNovelAnalysis('delete-test');
    const loaded = await loadNovelAnalysis('delete-test');
    expect(loaded).toBeNull();
  });

  it('should update existing analysis on duplicate save', async () => {
    const analysis = createMockAnalysis({ title: '原版' });
    await saveNovelAnalysis(analysis);
    const updated = createMockAnalysis({ title: '更新版' });
    await saveNovelAnalysis(updated);
    const loaded = await loadNovelAnalysis('test-id');
    expect(loaded!.title).toBe('更新版');
  });
});
