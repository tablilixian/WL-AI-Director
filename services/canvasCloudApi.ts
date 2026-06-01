import { pb } from '../src/api/pocketbase';

export interface CloudCanvasData {
  projectId: string;
  layers: any[];
  offset: { x: number; y: number };
  scale: number;
  version: number;
  savedAt: number;
}

export const canvasCloudApi = {
  async get(projectId: string): Promise<CloudCanvasData | null> {
    try {
      const records = await pb.collection('canvas_data').getList(1, 1, {
        filter: `project_id = "${projectId}"`,
      });
      if (records.items.length === 0) return null;
      const r = records.items[0] as any;
      return {
        projectId: r.project_id,
        layers: r.layers || [],
        offset: r.canvas_offset || { x: 0, y: 0 },
        scale: r.scale || 1,
        version: r.version || 1,
        savedAt: Date.now(),
      };
    } catch (error: any) {
      if (error?.status !== 0) {
        console.error('[CanvasCloudApi] get failed:', error);
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
        layers: data.layers,
        canvas_offset: data.offset,
        scale: data.scale,
        version: data.version,
      };
      if (existing.items.length > 0) {
        await pb.collection('canvas_data').update(existing.items[0].id, body);
      } else {
        await pb.collection('canvas_data').create(body);
      }
    } catch (error: any) {
      if (error?.status !== 0) {
        console.error('[CanvasCloudApi] save failed:', error);
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
    } catch (error: any) {
      if (error?.status !== 0) {
        console.error('[CanvasCloudApi] delete failed:', error);
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
