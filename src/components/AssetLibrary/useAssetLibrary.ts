/**
 * useAssetLibrary - 资产库共享数据 hook
 * 封装资产库的数据加载、过滤、删除等逻辑
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AssetLibraryItem, AssetLibraryItemType, Character, Scene, Prop } from '../../../types';
import { hybridStorage } from '../../../services/hybridStorageService';
import logger, { LogCategory } from '../../../services/logger';

// 资产类型过滤器
export type AssetFilter = 'all' | AssetLibraryItemType;

export interface UseAssetLibraryOptions {
  /** 初始加载时自动获取所有资产 */
  autoLoad?: boolean;
}

export interface UseAssetLibraryReturn {
  // 数据
  items: AssetLibraryItem[];
  filteredItems: AssetLibraryItem[];
  isLoading: boolean;
  
  // 过滤状态
  filter: AssetFilter;
  projectFilter: string;
  searchQuery: string;
  
  // 设置过滤
  setFilter: (filter: AssetFilter) => void;
  setProjectFilter: (project: string) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
  
  // 数据操作
  refresh: () => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  
  // 派生数据
  projectOptions: string[];
  itemCount: number;
  filteredCount: number;
}

/** 默认过滤值 */
const DEFAULT_FILTER: AssetFilter = 'all';
const DEFAULT_PROJECT_FILTER = 'all';
const DEFAULT_SEARCH_QUERY = '';

export function useAssetLibrary(options: UseAssetLibraryOptions = {}): UseAssetLibraryReturn {
  const { autoLoad = true } = options;
  const [items, setItems] = useState<AssetLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // 过滤状态
  const [filter, setFilter] = useState<AssetFilter>(DEFAULT_FILTER);
  const [projectFilter, setProjectFilter] = useState(DEFAULT_PROJECT_FILTER);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_SEARCH_QUERY);
  
  /**
   * 加载资产列表
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedItems = await hybridStorage.getAllAssetLibraryItems();
      setItems(loadedItems);
      logger.debug(LogCategory.STORAGE, `[useAssetLibrary] 加载 ${loadedItems.length} 个资产`);
    } catch (e) {
      logger.error(LogCategory.STORAGE, '[useAssetLibrary] 加载资产失败', e);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * 删除资产
   */
  const deleteItem = useCallback(async (itemId: string) => {
    logger.debug(LogCategory.STORAGE, `[useAssetLibrary] 删除资产: ${itemId}`);
    await hybridStorage.deleteAssetFromLibrary(itemId);
    setItems(prev => prev.filter(item => item.id !== itemId));
    logger.debug(LogCategory.STORAGE, '[useAssetLibrary] 删除成功');
  }, []);
  
  /**
   * 重置所有过滤条件
   */
  const resetFilters = useCallback(() => {
    setFilter(DEFAULT_FILTER);
    setProjectFilter(DEFAULT_PROJECT_FILTER);
    setSearchQuery(DEFAULT_SEARCH_QUERY);
  }, []);
  
  // 自动加载
  useEffect(() => {
    if (autoLoad) {
      refresh();
    }
  }, [autoLoad, refresh]);
  
  // 过滤后的资产列表
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 类型过滤
      if (filter !== 'all' && item.type !== filter) {
        return false;
      }
      
      // 项目过滤
      if (projectFilter !== DEFAULT_PROJECT_FILTER) {
        const itemProjectName = (item.projectName && item.projectName.trim()) || '未知项目';
        if (itemProjectName !== projectFilter) {
          return false;
        }
      }
      
      // 搜索过滤
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        if (!item.name.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  }, [items, filter, projectFilter, searchQuery]);
  
  // 项目选项（用于下拉筛选）
  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    items.forEach(item => {
      names.add((item.projectName && item.projectName.trim()) || '未知项目');
    });
    return Array.from(names).sort((a, b) => 
      String(a).localeCompare(String(b), 'zh-CN')
    );
  }, [items]);
  
  return {
    // 数据
    items,
    filteredItems,
    isLoading,
    
    // 过滤状态
    filter,
    projectFilter,
    searchQuery,
    
    // 设置过滤
    setFilter,
    setProjectFilter,
    setSearchQuery,
    resetFilters,
    
    // 数据操作
    refresh,
    deleteItem,
    
    // 派生数据
    projectOptions,
    itemCount: items.length,
    filteredCount: filteredItems.length,
  };
}

/**
 * 从资产项获取预览图片 URL
 */
export function getAssetPreviewUrl(item: AssetLibraryItem): string | undefined {
  if (item.type === 'character' || item.type === 'turnaround') {
    return (item.data as Character).imageUrl;
  } else if (item.type === 'scene') {
    return (item.data as Scene).imageUrl;
  } else if (item.type === 'prop') {
    return (item.data as Prop).imageUrl;
  }
  return undefined;
}

/**
 * 获取资产类型的中文标签
 */
export function getAssetTypeLabel(type: AssetLibraryItemType): string {
  const labels: Record<AssetLibraryItemType, string> = {
    character: '角色',
    scene: '场景',
    prop: '道具',
    turnaround: '九宫格',
  };
  return labels[type] || '未知';
}
