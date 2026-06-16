import { describe, it, expect } from 'vitest';
import { parseTxtFile } from '../../services/novel/novelFileParser';

describe('parseTxtFile', () => {
  it('should parse a simple text file without chapters', async () => {
    const content = '这是一段小说内容。\n这是第二行。\n这是第三行。';
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const result = await parseTxtFile(file);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].title).toBe('全文');
    expect(result.rawText).toBe(content);
  });

  it('should split by chapter markers', async () => {
    const content = '第一章 开局\n这是开局的内容。\n\n第二章 发展\n这是发展的内容。\n\n第三章 结局\n这是结局的内容。';
    const file = new File([content], 'novel.txt', { type: 'text/plain' });
    const result = await parseTxtFile(file);
    expect(result.chapters.length).toBeGreaterThanOrEqual(3);
    expect(result.chapters[0].title).toBe('第一章');
    expect(result.chapters[1].title).toBe('第二章');
    expect(result.chapters[2].title).toBe('第三章');
  });

  it('should handle numbered chapter markers', async () => {
    const content = '第1章 开始\n内容一\n第2章 继续\n内容二\n第3章 结束\n内容三';
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const result = await parseTxtFile(file);
    expect(result.chapters.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle English chapter markers', async () => {
    const content = 'Chapter 1 The Beginning\nContent one.\n\nChapter 2 The Middle\nContent two.';
    const file = new File([content], 'novel.txt', { type: 'text/plain' });
    const result = await parseTxtFile(file);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
    expect(result.chapters[0].title).toMatch(/Chapter 1/i);
  });

  it('should handle empty text', async () => {
    const file = new File([''], 'empty.txt', { type: 'text/plain' });
    const result = await parseTxtFile(file);
    expect(result.chapters).toHaveLength(0);
    expect(result.rawText).toBe('');
  });

  it('should preserve full raw text', async () => {
    const content = '第一章 测试\n这是第一章的内容。';
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const result = await parseTxtFile(file);
    expect(result.rawText).toBe(content);
  });
});
