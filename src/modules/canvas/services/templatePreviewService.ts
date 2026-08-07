import { pb } from '../../../../src/api/pocketbase';
import { imageStorageService } from '../../../../services/imageStorageService';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { canvasModelService } from '../services/canvasModelService';
import { styleTemplates, StyleTemplate } from '../data/styleTemplates';
import { logger, LogCategory } from '../../../../services/logger.ts';

const COLLECTION_NAME = 'template_previews';
const LOCAL_PREFIX = 'template_preview_';
const COLLECTION_ID = 'pbc_4294202090';

function localKey(templateId: string): string {
  return `${LOCAL_PREFIX}${templateId}`;
}

async function ensureAuth(): Promise<void> {
  if (pb.authStore.isValid) return;
  try {
    await pb.collection('users').authWithPassword('admin@wlai.com', 'admin123456');
  } catch {
    try {
      await pb.admins.authWithPassword('admin@wlai.com', 'admin123456');
    } catch {
      // 静默失败，由调用方处理
    }
  }
}

export const templatePreviewService = {
  async getPreviewBlob(templateId: string): Promise<Blob | null> {
    const cached = await imageStorageService.getImage(localKey(templateId));
    if (cached) return cached;

    try {
      await ensureAuth();
      const records = await pb.collection(COLLECTION_NAME).getList(1, 1, {
        filter: `template_id = "${templateId}"`,
        requestKey: `template_preview_${templateId}`,
      });

      if (records.items.length > 0) {
        const record = records.items[0];
        const filename = record.preview;
        const fileUrl = `${pb.baseUrl}/api/files/${COLLECTION_ID}/${record.id}/${filename}`;
        const res = await fetch(fileUrl, {
          headers: pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {},
        });
        if (res.ok) {
          const blob = await res.blob();
          await imageStorageService.saveImage(localKey(templateId), blob);
          return blob;
        }
      }
    } catch (e) {
      logger.debug(LogCategory.CANVAS, '[templatePreview] 远端拉取失败（预览图需点击生成）:', e);
    }

    return null;
  },

  async savePreview(templateId: string, blob: Blob): Promise<void> {
    await imageStorageService.saveImage(localKey(templateId), blob);

    try {
      const records = await pb.collection(COLLECTION_NAME).getList(1, 1, {
        filter: `template_id = "${templateId}"`,
      });

      const fd = new FormData();
      fd.append('template_id', templateId);
      fd.append('preview', new File([blob], `${templateId}.png`, { type: 'image/png' }));

      if (records.items.length > 0) {
        await pb.collection(COLLECTION_NAME).update(records.items[0].id, fd);
      } else {
        await pb.collection(COLLECTION_NAME).create(fd);
      }
    } catch (e) {
      logger.warn(LogCategory.CANVAS, '[templatePreview] 远端保存失败:', e);
    }
  },

  async generatePreview(template: StyleTemplate): Promise<void> {
    const prompt = `${template.subjectPlaceholder}, ${template.stylePrompt}`;
    const imageUrl = await canvasModelService.generateImage({
      prompt,
      negativePrompt: template.negativePrompt,
      aspectRatio: '16:9',
    });

    const resolvedUrl = await unifiedImageService.resolveForApi(imageUrl);
    const res = await fetch(resolvedUrl);
    const blob = await res.blob();

    await this.savePreview(template.id, blob);
  },

  async hasLocalPreview(templateId: string): Promise<boolean> {
    return (await imageStorageService.getImage(localKey(templateId))) !== null;
  },

  async getPreviewUrl(templateId: string): Promise<string | null> {
    const blob = await this.getPreviewBlob(templateId);
    return blob ? URL.createObjectURL(blob) : null;
  },

  async generateAllPreviews(onProgress?: (done: number, total: number) => void): Promise<void> {
    for (let i = 0; i < styleTemplates.length; i++) {
      await this.generatePreview(styleTemplates[i]);
      onProgress?.(i + 1, styleTemplates.length);
    }
  },

  async generateCategoryPreviews(
    category: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    const filtered = styleTemplates.filter((t) => t.category === category);
    for (let i = 0; i < filtered.length; i++) {
      await this.generatePreview(filtered[i]);
      onProgress?.(i + 1, filtered.length);
    }
  },
};
