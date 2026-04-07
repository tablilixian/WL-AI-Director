/**
 * SaveToLibraryDialog Component
 * 用于将画布图层保存到资产库的对话框
 * 
 * 功能：
 * 1. 智能识别图层来源（角色/场景/关键帧）
 * 2. 允许用户选择资产类型（角色/场景/道具）
 * 3. 支持自定义资产名称
 * 4. 保存完整的结构化数据或创建新资产
 */

import React, { useState } from 'react';
import { LayerData } from '../types/canvas';
import type { ProjectState } from '../../../../types';
import { createLibraryItemFromLayer } from '../../../../services/assetLibraryService';
import { hybridStorage } from '../../../../services/hybridStorageService';

interface SaveToLibraryDialogProps {
  layer: LayerData;           // 要保存的图层
  project: ProjectState;      // 当前项目状态
  onClose: () => void;        // 关闭对话框回调
}

/**
 * 资源类型标签映射
 */
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  character: '角色',
  scene: '场景',
  keyframe: '关键帧',
  undefined: '未知'
};

/**
 * 资产类型图标映射
 */
const ASSET_TYPE_ICONS: Record<'character' | 'scene' | 'prop', string> = {
  character: '👤',
  scene: '🏞️',
  prop: '📦'
};

export const SaveToLibraryDialog: React.FC<SaveToLibraryDialogProps> = ({ 
  layer, 
  project, 
  onClose 
}) => {
  // 智能推荐资产类型：根据图层的 linkedResourceType 自动选择
  const [assetType, setAssetType] = useState<'character' | 'scene' | 'prop'>(() => {
    if (layer.linkedResourceType === 'character') return 'character';
    if (layer.linkedResourceType === 'scene') return 'scene';
    return 'character'; // 默认推荐角色类型
  });
  
  // 资产名称，默认为图层标题
  const [assetName, setAssetName] = useState(layer.title || '');
  
  // 保存状态
  const [isSaving, setIsSaving] = useState(false);

  /**
   * 处理保存操作
   */
  const handleSave = async () => {
    // 验证名称不能为空
    if (!assetName.trim()) {
      alert('请输入资产名称');
      return;
    }

    setIsSaving(true);
    try {
      // 从图层创建资产库项
      const item = await createLibraryItemFromLayer(layer, project, assetType, assetName.trim());
      
      // 保存到资产库（云端 + 本地）
      await hybridStorage.saveAssetToLibrary(item);
      
      // 显示成功提示
      alert(`已保存到资产库：${assetName}`);
      
      // 关闭对话框
      onClose();
    } catch (error) {
      // 错误处理
      console.error('[SaveToLibrary] 保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 处理键盘事件（ESC 关闭对话框）
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300]"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div 
        className="bg-gray-800 rounded-lg p-6 w-96 shadow-xl border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 对话框标题 */}
        <h3 id="dialog-title" className="text-lg font-bold text-white mb-4">
          💾 保存到资产库
        </h3>
        
        {/* 资产类型选择 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            资产类型
          </label>
          <div className="flex gap-2">
            {/* 角色类型按钮 */}
            <button
              onClick={() => setAssetType('character')}
              className={`flex-1 px-3 py-2 rounded transition-colors ${
                assetType === 'character' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {ASSET_TYPE_ICONS.character} 角色
            </button>
            
            {/* 场景类型按钮 */}
            <button
              onClick={() => setAssetType('scene')}
              className={`flex-1 px-3 py-2 rounded transition-colors ${
                assetType === 'scene' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {ASSET_TYPE_ICONS.scene} 场景
            </button>
            
            {/* 道具类型按钮 */}
            <button
              onClick={() => setAssetType('prop')}
              className={`flex-1 px-3 py-2 rounded transition-colors ${
                assetType === 'prop' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {ASSET_TYPE_ICONS.prop} 道具
            </button>
          </div>
        </div>
        
        {/* 资产名称输入 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">
            资产名称
          </label>
          <input
            type="text"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="输入资产名称"
            autoFocus
          />
        </div>
        
        {/* 来源信息提示 */}
        {layer.linkedResourceId && layer.linkedResourceType && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded">
            <p className="text-xs text-blue-300">
              ℹ️ 该图层来自 <strong>{RESOURCE_TYPE_LABELS[layer.linkedResourceType]}</strong>，
              将保存完整的 <strong>{RESOURCE_TYPE_LABELS[assetType]}</strong> 数据
            </p>
          </div>
        )}
        
        {/* 操作按钮 */}
        <div className="flex gap-2 justify-end">
          {/* 取消按钮 */}
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded transition-colors"
            disabled={isSaving}
          >
            取消
          </button>
          
          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveToLibraryDialog;
