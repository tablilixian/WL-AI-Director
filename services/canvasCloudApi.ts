/**
 * 画布云端 API
 * 
 * 负责与 Supabase canvas_data 表的交互
 * 所有方法都设计为"失败安全"：错误时抛出异常，由调用方决定如何处理
 */

import { supabase } from '../src/api/supabase';
import { logger, LogCategory } from './logger';

/**
 * 云端画布数据结构
 */
export interface CloudCanvasData {
  projectId: string;
  layers: any[];
  offset: { x: number; y: number };
  scale: number;
  version: number;
  savedAt: number;
}

/**
 * Supabase 返回的原始数据结构
 */
interface SupabaseCanvasData {
  id: string;
  project_id: string;
  layers: any[];
  canvas_offset: { x: number; y: number };
  scale: number;
  version: number;
  saved_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * 画布云端 API
 */
export const canvasCloudApi = {
  /**
   * 获取画布数据
   * 
   * @param projectId 项目 ID
   * @returns 画布数据，如果不存在返回 null
   * @throws 网络错误或权限错误
   */
  async get(projectId: string): Promise<CloudCanvasData | null> {
    logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 获取云端画布数据，项目: ${projectId}`);
    
    try {
      const { data, error } = await supabase
        .from('canvas_data')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) {
        // PGRST116 表示未找到数据，这是正常情况
        if (error.code === 'PGRST116') {
          logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 云端无画布数据，项目: ${projectId}`);
          return null;
        }
        throw error;
      }

      if (!data) {
        return null;
      }

      const result: SupabaseCanvasData = data;
      
      logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 获取成功，项目: ${projectId}, 版本: ${result.version}`);
      
      return {
        projectId: result.project_id,
        layers: result.layers || [],
        offset: result.canvas_offset || { x: 0, y: 0 },
        scale: result.scale || 1,
        version: result.version || 1,
        savedAt: new Date(result.saved_at).getTime(),
      };
    } catch (error) {
      logger.error(LogCategory.CANVAS, `[CanvasCloudApi] 获取失败:`, error);
      throw error;
    }
  },

  /**
   * 保存画布数据（upsert）
   * 
   * @param data 画布数据
   * @throws 网络错误或权限错误
   */
  async save(data: CloudCanvasData): Promise<void> {
    logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 保存到云端，项目: ${data.projectId}, 版本: ${data.version}`);
    
    try {
      const { error } = await supabase
        .from('canvas_data')
        .upsert({
          project_id: data.projectId,
          layers: data.layers,
          canvas_offset: data.offset,
          scale: data.scale,
          version: data.version,
          saved_at: new Date(data.savedAt).toISOString(),
        }, {
          onConflict: 'project_id',
        });

      if (error) {
        throw error;
      }

      logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 保存成功，项目: ${data.projectId}`);
    } catch (error) {
      logger.error(LogCategory.CANVAS, `[CanvasCloudApi] 保存失败:`, error);
      throw error;
    }
  },

  /**
   * 删除画布数据
   * 
   * @param projectId 项目 ID
   * @throws 网络错误或权限错误
   */
  async delete(projectId: string): Promise<void> {
    logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 删除云端画布数据，项目: ${projectId}`);
    
    try {
      const { error } = await supabase
        .from('canvas_data')
        .delete()
        .eq('project_id', projectId);

      if (error) {
        throw error;
      }

      logger.debug(LogCategory.CANVAS, `[CanvasCloudApi] 删除成功，项目: ${projectId}`);
    } catch (error) {
      logger.error(LogCategory.CANVAS, `[CanvasCloudApi] 删除失败:`, error);
      throw error;
    }
  },

  /**
   * 检查云端是否有画布数据
   * 
   * @param projectId 项目 ID
   * @returns 是否存在
   */
  async exists(projectId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('canvas_data')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return !!data;
    } catch (error) {
      logger.error(LogCategory.CANVAS, `[CanvasCloudApi] 检查存在失败:`, error);
      return false;
    }
  },
};
