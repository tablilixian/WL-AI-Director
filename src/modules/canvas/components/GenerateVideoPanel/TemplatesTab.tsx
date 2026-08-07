import React from 'react';
import { Layout, Plus, Trash2 } from 'lucide-react';
import {
  CAMERA_MOVEMENTS,
  LIGHTING_PRESETS,
  TEMPLATE_CATEGORIES,
  type GenerationPanelState,
} from './types';

export const TemplatesTab: React.FC<{ panel: GenerationPanelState }> = ({ panel }) => {
  const {
    templateCategory,
    setTemplateCategory,
    selectedTemplateId,
    filteredTemplates,
    applyTemplate,
    saveCurrentAsTemplate,
    deleteCustomTemplate,
  } = panel;

  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
          <Layout className="w-3.5 h-3.5 text-purple-400" />
          视频模板
        </label>
        <button
          onClick={saveCurrentAsTemplate}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          保存当前配置为模板
        </button>
      </div>

      <p className="text-[10px] text-gray-500">
        选择一个模板快速应用运镜、光照、风格和时长的组合配置。选中模板后可在各标签页中微调。
      </p>

      {/* 分类筛选 */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setTemplateCategory(cat.id)}
            className={`shrink-0 px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
              templateCategory === cat.id
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* 模板列表 */}
      <div className="grid grid-cols-2 gap-2">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className={`rounded-lg border p-3 cursor-pointer transition-all ${
              selectedTemplateId === template.id
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-gray-700/50 bg-gray-800/40 hover:border-gray-600'
            }`}
            onClick={() => applyTemplate(template)}
          >
            <div className="flex items-start justify-between mb-1">
              <h4
                className={`text-xs font-medium ${
                  selectedTemplateId === template.id ? 'text-purple-300' : 'text-gray-300'
                }`}
              >
                {template.name}
              </h4>
              {template.id.startsWith('custom_') && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCustomTemplate(template.id);
                  }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mb-1.5 line-clamp-2">{template.description}</p>
            <div className="flex flex-wrap gap-1">
              {template.cameraId !== 'none' && (
                <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                  {CAMERA_MOVEMENTS.find((c) => c.id === template.cameraId)?.label ||
                    template.cameraId}
                </span>
              )}
              {template.lightingId !== 'none' && (
                <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                  {LIGHTING_PRESETS.find((l) => l.id === template.lightingId)?.label ||
                    template.lightingId}
                </span>
              )}
              <span className="text-[9px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
                {template.durationMs / 1000}s
              </span>
              {template.category !== 'custom' && (
                <span className="text-[9px] text-gray-600 bg-gray-700/30 px-1.5 py-0.5 rounded">
                  {TEMPLATE_CATEGORIES.find((c) => c.id === template.category)?.name ||
                    template.category}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
