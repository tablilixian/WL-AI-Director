import { pb } from '../src/api/pocketbase';
import { logger, LogCategory } from './logger.ts';

export interface CloudLayer {
  id?: string;
  src?: string;
  imageId?: string;
  type?: string;
  [key: string]: unknown;
}

export interface CloudCanvasData {
  projectId: string;
  layers: CloudLayer[];
  offset: { x: number; y: number };
  scale: number;
  version: number;
  savedAt: number;
}

/**
 * 云端同步时图层 src 不能携带 base64 / blob 大体积数据。
 *
 * PocketBase 的 json 字段默认上限 1MB（validation_json_size_limit），
 * 一张生成图的 data: URL 轻松突破该上限，导致 update 返回 400
 * "Failed to update record"（见 canvasSyncService 上传链路）。
 *
 * 这里剥掉 data:/blob: 的 src：
 *  - 若图层已落库到 IndexedDB（有 imageId），改用 local:${imageId} 持久引用，
 *    渲染层通过 unifiedImageService 按 imageId 解析本地图片；
 *  - 若尚无 imageId（理论上不应发生），直接丢弃 src，等下次携带 imageId 重试。
 * 其它 scheme（local:/http(s):）保持不变。
 */
export const sanitizeLayersForCloud = (layers: CloudLayer[]): CloudLayer[] => {
  if (!Array.isArray(layers)) return layers;
  return layers.map((layer) => {
    if (!layer || typeof layer !== 'object') return layer;
    const src: string | undefined = layer.src;
    if (src && (src.startsWith('data:') || src.startsWith('blob:'))) {
      const { src: _dropped, ...rest } = layer;
      if (layer.imageId) {
        return { ...rest, src: `local:${layer.imageId}` };
      }
      return rest;
    }
    return layer;
  });
};

export const canvasCloudApi = {
  async get(projectId: string): Promise<CloudCanvasData | null> {
    try {
      const records = await pb.collection('canvas_data').getList(1, 1, {
        filter: `project_id = "${projectId}"`,
      });
      if (records.items.length === 0) return null;
      const r = records.items[0];
      return {
        projectId: r.project_id,
        layers: r.layers || [],
        offset: r.canvas_offset || { x: 0, y: 0 },
        scale: r.scale || 1,
        version: r.version || 1,
        savedAt: Date.now(),
      };
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status !== 0) {
        logger.error(LogCategory.STORAGE, '[CanvasCloudApi] get failed:', error);
      }
      throw error;
    }
  },

  async save(data: CloudCanvasData): Promise<void> {
    try {
      const existing = await pb.collection('canvas_data').getList(1, 1, {
        filter: `project_id = "${data.projectId}"`,
      });
      const body = {
        project_id: data.projectId,
        layers: sanitizeLayersForCloud(data.layers),
        canvas_offset: data.offset,
        scale: data.scale,
        version: data.version,
      };
      if (existing.items.length > 0) {
        await pb.collection('canvas_data').update(existing.items[0].id, body);
      } else {
        await pb.collection('canvas_data').create(body);
      }
    } catch (error: unknown) {
      const err = error as { status?: number; data?: unknown };
      if (err.status !== 0) {
        // 输出字段级校验错误（如 validation_json_size_limit），便于定位 400 根因
        const detail = err.data ? ` | ${JSON.stringify(err.data)}` : '';
        logger.error(LogCategory.STORAGE, `[CanvasCloudApi] save failed:${detail}`, error);
      }
      throw error;
    }
  },

  async delete(projectId: string): Promise<void> {
    try {
      const existing = await pb.collection('canvas_data').getList(1, 1, {
        filter: `project_id = "${projectId}"`,
      });
      if (existing.items.length > 0) {
        await pb.collection('canvas_data').delete(existing.items[0].id);
      }
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status !== 0) {
        logger.error(LogCategory.STORAGE, '[CanvasCloudApi] delete failed:', error);
      }
      throw error;
    }
  },

  async exists(projectId: string): Promise<boolean> {
    try {
      const records = await pb.collection('canvas_data').getList(1, 1, {
        filter: `project_id = "${projectId}"`,
      });
      return records.items.length > 0;
    } catch {
      return false;
    }
  },
};
