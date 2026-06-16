import { logger, LogCategory } from '../logger';

export interface ParsedNovelFile {
  chapters: { title: string; content: string }[];
  rawText: string;
  metadata?: { title?: string; author?: string };
}

export const parseTxtFile = async (file: File): Promise<ParsedNovelFile> => {
  const buffer = await file.arrayBuffer();

  const encoding = detectTextEncoding(buffer);
  const decoder = new TextDecoder(encoding);
  const rawText = decoder.decode(buffer);

  const chapterRegex = /第[一二三四五六七八九十百千\d零〇]+[章节回]|第\s*[0-9]+\s*[章节回]|第\u4e00[章节回]|Chapter\s*(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+|I{1,3}V?|IV|V|VI{0,3})|CHAPTER\s*(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+|I{1,3}V?|IV|V|VI{0,3})|Part\s+\d+|PART\s+\d+|\d+\.\s|^\s*[-—]{3,}\s*$/gm;
  let match: RegExpExecArray | null;
  const chapterStarts: { title: string; index: number }[] = [];
  while ((match = chapterRegex.exec(rawText)) !== null) {
    chapterStarts.push({ title: match[0].trim(), index: match.index });
  }

  let chapters: { title: string; content: string }[];
  if (chapterStarts.length > 0) {
    chapters = chapterStarts.map((cs, i) => {
      const start = cs.index;
      const end = i + 1 < chapterStarts.length ? chapterStarts[i + 1].index : rawText.length;
      return {
        title: cs.title,
        content: rawText.slice(start, end).trim(),
      };
    }).filter(ch => ch.content.length > 0);
  } else {
    const lines = rawText.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      chapters = [{
        title: '全文',
        content: rawText.trim(),
      }];
    } else {
      chapters = [];
    }
  }

  return { chapters, rawText };
};

function detectTextEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'UTF-8';
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return 'UTF-16LE';
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return 'UTF-16BE';
  }
  return 'UTF-8';
}

export const parseEpubFile = async (file: File): Promise<ParsedNovelFile> => {
  if (!file || file.size === 0) {
    throw new Error('EPUB 文件为空，请选择有效的文件');
  }

  let ePub: (data: ArrayBuffer | string) => any;
  try {
    ePub = (await import('epubjs')).default;
  } catch (e) {
    logger.error(LogCategory.STORAGE, 'epubjs 加载失败:', e);
    throw new Error('EPUB 解析库加载失败，请检查网络连接后重试');
  }

  const arrayBuffer = await file.arrayBuffer();

  const book = ePub(arrayBuffer.slice(0));

  try {
    await book.ready;
  } catch (e) {
    logger.error(LogCategory.STORAGE, 'EPUB book.ready 失败:', e);
    throw new Error('EPUB 文件解析失败，文件可能已损坏或格式不完整。请确认文件可以在其他阅读器中正常打开');
  }

  let metadata: ParsedNovelFile['metadata'] = {};
  try {
    const meta = await book.loaded.metadata;
    metadata.title = meta.title || undefined;
    metadata.author = meta.creator || undefined;
  } catch {
  }

  const spineItems = book.spine?.spineItems;
  if (!spineItems || spineItems.length === 0) {
    throw new Error('EPUB 文件中未找到可解析的内容（spine 为空），请确认文件包含正文');
  }

  const chapters: { title: string; content: string }[] = [];
  let loadFailCount = 0;

  for (const section of spineItems) {
    try {
      const doc = await section.load(book.load.bind(book));
      const title = section.idref || `第 ${section.index + 1} 节`;
      let text = doc.textContent?.trim() || '';
      if (text.length > 0) {
        chapters.push({ title, content: text });
      }
    } catch (e) {
      loadFailCount++;
      logger.warn(LogCategory.STORAGE, `EPUB 第 ${section.index + 1} 节 "${section.idref}" 跳过:`, e);
    }
  }

  if (chapters.length === 0) {
    if (loadFailCount > 0) {
      throw new Error(`EPUB 解析完成但内容提取失败（${loadFailCount} 节均无法读取），文件格式可能不兼容，请尝试转换为 TXT 格式`);
    }
    throw new Error('EPUB 解析完成但未提取到任何文字内容，请确认文件包含可读文本');
  }

  if (loadFailCount > 0) {
    logger.warn(LogCategory.STORAGE, `EPUB 解析过程中 ${loadFailCount}/${spineItems.length} 节被跳过`);
  }

  const rawText = chapters.map(ch => ch.content).join('\n\n');
  return { chapters, rawText, metadata };
};

export interface NovelParseError extends Error {
  code: 'UNSUPPORTED_FORMAT' | 'FILE_EMPTY' | 'PARSE_FAILED' | 'NO_CONTENT';
}

function novelError(code: NovelParseError['code'], message: string): NovelParseError {
  const err = new Error(message) as NovelParseError;
  err.code = code;
  return err;
}

const SUPPORTED_EXTENSIONS = ['.epub', '.txt', '.text', '.md', '.html', '.htm'];

export const parseNovelFile = async (file: File): Promise<ParsedNovelFile> => {
  if (!file || file.size === 0) {
    throw novelError('FILE_EMPTY', '文件为空，请选择有效的文件');
  }

  const name = file.name.toLowerCase();
  const ext = SUPPORTED_EXTENSIONS.find(e => name.endsWith(e));

  if (!ext) {
    throw novelError(
      'UNSUPPORTED_FORMAT',
      `不支持的文件格式 "${name.split('.').pop()}"，当前支持：${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }

  if (ext === '.epub') {
    return parseEpubFile(file);
  }

  return parseTxtFile(file);
};
