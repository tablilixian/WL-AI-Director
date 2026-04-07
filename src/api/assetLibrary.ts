import { supabase } from './supabase'
import type { AssetLibraryItem } from '../../types'

// =====================================================
// Asset Library API
// =====================================================

export const assetLibraryApi = {
  // 获取用户所有资产库项目
  list: async (): Promise<AssetLibraryItem[]> => {
    const { data, error } = await supabase
      .from('asset_library')
      .select('*')
      .order('updated_at', { ascending: false })
    
    if (error) {
      console.error('[AssetLibraryAPI] 获取资产库失败:', error)
      throw error
    }
    
    // 转换 Supabase 数据格式到本地格式
    return (data || []).map(item => ({
      id: item.id,
      type: item.type,
      name: item.name,
      projectId: item.project_id,
      projectName: item.project_name,
      createdAt: new Date(item.created_at).getTime(),
      updatedAt: new Date(item.updated_at).getTime(),
      data: item.data
    }))
  },

  // 获取单个资产库项目
  get: async (id: string): Promise<AssetLibraryItem | null> => {
    const { data, error } = await supabase
      .from('asset_library')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('[AssetLibraryAPI] 获取资产库项目失败:', error)
      throw error
    }
    
    return {
      id: data.id,
      type: data.type,
      name: data.name,
      projectId: data.project_id,
      projectName: data.project_name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      data: data.data
    }
  },

  // 创建资产库项目
  create: async (item: AssetLibraryItem): Promise<AssetLibraryItem> => {
    const { data, error } = await supabase
      .from('asset_library')
      .insert({
        id: item.id,  // 使用客户端生成的 UUID
        type: item.type,
        name: item.name,
        project_id: item.projectId,
        project_name: item.projectName,
        data: item.data
      })
      .select()
      .single()
    
    if (error) {
      console.error('[AssetLibraryAPI] 创建资产库项目失败:', error)
      throw error
    }
    
    return {
      id: data.id,
      type: data.type,
      name: data.name,
      projectId: data.project_id,
      projectName: data.project_name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      data: data.data
    }
  },

  // 更新资产库项目
  update: async (id: string, updates: Partial<AssetLibraryItem>): Promise<AssetLibraryItem> => {
    const updateData: any = {}
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.projectId !== undefined) updateData.project_id = updates.projectId
    if (updates.projectName !== undefined) updateData.project_name = updates.projectName
    if (updates.data !== undefined) updateData.data = updates.data
    
    const { data, error } = await supabase
      .from('asset_library')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('[AssetLibraryAPI] 更新资产库项目失败:', error)
      throw error
    }
    
    return {
      id: data.id,
      type: data.type,
      name: data.name,
      projectId: data.project_id,
      projectName: data.project_name,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      data: data.data
    }
  },

  // 删除资产库项目
  delete: async (id: string): Promise<void> => {
    console.log('[AssetLibraryAPI] 🗑️ 尝试删除资产库项目:', id);
    console.log('[AssetLibraryAPI] Supabase 客户端状态:', supabase ? '已初始化' : '未初始化');
    
    const { error } = await supabase
      .from('asset_library')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('[AssetLibraryAPI] ❌ 删除资产库项目失败:', {
        id,
        error: error.message,
        details: error,
        hint: error.hint,
        code: error.code
      });
      throw new Error(`删除失败：${error.message}`);
    }
    
    console.log('[AssetLibraryAPI] ✅ 删除成功:', id);
  },

  // 批量创建资产库项目
  batchCreate: async (items: AssetLibraryItem[]): Promise<AssetLibraryItem[]> => {
    const records = items.map(item => ({
      type: item.type,
      name: item.name,
      project_id: item.projectId,
      project_name: item.projectName,
      data: item.data
    }))
    
    const { data, error } = await supabase
      .from('asset_library')
      .insert(records)
      .select()
    
    if (error) {
      console.error('[AssetLibraryAPI] 批量创建资产库项目失败:', error)
      throw error
    }
    
    return (data || []).map(item => ({
      id: item.id,
      type: item.type,
      name: item.name,
      projectId: item.project_id,
      projectName: item.project_name,
      createdAt: new Date(item.created_at).getTime(),
      updatedAt: new Date(item.updated_at).getTime(),
      data: item.data
    }))
  },

  // 按类型筛选资产库项目
  listByType: async (type: 'character' | 'scene' | 'prop' | 'turnaround'): Promise<AssetLibraryItem[]> => {
    const { data, error } = await supabase
      .from('asset_library')
      .select('*')
      .eq('type', type)
      .order('updated_at', { ascending: false })
    
    if (error) {
      console.error('[AssetLibraryAPI] 获取资产库项目失败:', error)
      throw error
    }
    
    return (data || []).map(item => ({
      id: item.id,
      type: item.type,
      name: item.name,
      projectId: item.project_id,
      projectName: item.project_name,
      createdAt: new Date(item.created_at).getTime(),
      updatedAt: new Date(item.updated_at).getTime(),
      data: item.data
    }))
  }
}
