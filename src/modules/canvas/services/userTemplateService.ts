import { pb } from '../../../../src/api/pocketbase';
import { StyleTemplate } from '../data/styleTemplates';
import { logger, LogCategory } from '../../../../services/logger.ts';

const COLLECTION_NAME = 'user_templates';
const STORAGE_KEY = 'user_custom_templates';

const GRADIENT_POOL = [
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-lime-500 to-green-600',
  'from-fuchsia-500 to-pink-600',
  'from-cyan-500 to-blue-600',
];

function pickGradient(): string {
  return GRADIENT_POOL[Math.floor(Math.random() * GRADIENT_POOL.length)];
}

export function generateCustomId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── localStorage helpers ──
function loadLocal(): StyleTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocal(list: StyleTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ── PocketBase sync (uses user auth token) ──
const PB_BASE = pb.baseUrl;

function authHeaders(): Record<string, string> {
  const token = pb.authStore.token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function syncToPb(template: StyleTemplate): Promise<void> {
  const userId = pb.authStore.model?.id;
  if (!userId) return;

  try {
    await fetch(`${PB_BASE}/api/collections/${COLLECTION_NAME}/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        template_id: template.id,
        name: template.name,
        category: 'custom',
        subjectPlaceholder: template.subjectPlaceholder,
        subjectPlaceholderZh: template.subjectPlaceholderZh,
        stylePrompt: template.stylePrompt,
        stylePromptZh: template.stylePromptZh,
        negativePrompt: template.negativePrompt,
        negativePromptZh: template.negativePromptZh,
        gradient: template.gradient,
        userId,
      }),
    });
  } catch (e) {
    logger.warn(LogCategory.CANVAS, '[userTemplate] PB同步失败:', e);
  }
}

async function deleteFromPb(templateId: string): Promise<void> {
  try {
    const res = await fetch(
      `${PB_BASE}/api/collections/${COLLECTION_NAME}/records?filter=${encodeURIComponent(`template_id = "${templateId}"`)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return;
    const data = await res.json();
    if (data.items?.length > 0) {
      await fetch(`${PB_BASE}/api/collections/${COLLECTION_NAME}/records/${data.items[0].id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    }
  } catch (e) {
    logger.warn(LogCategory.CANVAS, '[userTemplate] PB删除失败:', e);
  }
}

// ── Public API ──
export const userTemplateService = {
  async getAll(): Promise<StyleTemplate[]> {
    return loadLocal();
  },

  async save(template: {
    name: string;
    subjectPlaceholder?: string;
    subjectPlaceholderZh?: string;
    stylePrompt: string;
    stylePromptZh?: string;
    negativePrompt?: string;
    negativePromptZh?: string;
  }): Promise<StyleTemplate | null> {
    const id = generateCustomId();
    const entry: StyleTemplate = {
      id,
      name: template.name,
      category: 'custom',
      subjectPlaceholder: template.subjectPlaceholder || '',
      subjectPlaceholderZh: template.subjectPlaceholderZh || '',
      stylePrompt: template.stylePrompt,
      stylePromptZh: template.stylePromptZh || '',
      negativePrompt: template.negativePrompt || '',
      negativePromptZh: template.negativePromptZh || '',
      gradient: pickGradient(),
    };

    const list = loadLocal();
    list.unshift(entry);
    saveLocal(list);

    syncToPb(entry);
    return entry;
  },

  async delete(id: string): Promise<boolean> {
    const list = loadLocal().filter((t) => t.id !== id);
    saveLocal(list);
    deleteFromPb(id);
    return true;
  },
};
