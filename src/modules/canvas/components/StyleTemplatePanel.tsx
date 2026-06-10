import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { styleTemplates, templateCategories, StyleTemplate } from '../data/styleTemplates';
import { TemplateApplyDialog } from './TemplateApplyDialog';
import { templatePreviewService } from '../services/templatePreviewService';

export const StyleTemplatePanel: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<StyleTemplate | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [showGenerator, setShowGenerator] = useState(false);
  const [generatingStatus, setGeneratingStatus] = useState<Record<string, 'idle' | 'generating' | 'done' | 'error'>>({});
  const setTemplatePanelOpen = useCanvasStore((s) => s.setTemplatePanelOpen);

  const handleSelectTemplate = (template: StyleTemplate) => {
    setSelectedTemplate(template);
  };

  const filteredTemplates = useMemo(() => {
    if (activeCategory === 'all') return styleTemplates;
    return styleTemplates.filter((t) => t.category === activeCategory);
  }, [activeCategory]);

  const loadPreviews = useCallback(async () => {
    for (const t of filteredTemplates) {
      if (previewUrls[t.id]) continue;
      const url = await templatePreviewService.getPreviewUrl(t.id);
      if (url) {
        setPreviewUrls((prev) => ({ ...prev, [t.id]: url }));
      }
    }
  }, [filteredTemplates]);

  useEffect(() => {
    loadPreviews();
  }, [loadPreviews]);

  const handleGenerateAll = async () => {
    const targets = activeCategory === 'all' ? styleTemplates : filteredTemplates;
    for (const t of targets) {
      setGeneratingStatus((s) => ({ ...s, [t.id]: 'generating' }));
      try {
        await templatePreviewService.generatePreview(t);
        setGeneratingStatus((s) => ({ ...s, [t.id]: 'done' }));
        const url = await templatePreviewService.getPreviewUrl(t.id);
        if (url) setPreviewUrls((p) => ({ ...p, [t.id]: url }));
      } catch {
        setGeneratingStatus((s) => ({ ...s, [t.id]: 'error' }));
      }
    }
  };

  const handleGenerateOne = async (template: StyleTemplate) => {
    setGeneratingStatus((s) => ({ ...s, [template.id]: 'generating' }));
    try {
      await templatePreviewService.generatePreview(template);
      setGeneratingStatus((s) => ({ ...s, [template.id]: 'done' }));
      const url = await templatePreviewService.getPreviewUrl(template.id);
      if (url) setPreviewUrls((p) => ({ ...p, [template.id]: url }));
    } catch {
      setGeneratingStatus((s) => ({ ...s, [template.id]: 'error' }));
    }
  };

  const statusIcon = (template: StyleTemplate) => {
    const s = generatingStatus[template.id];
    if (s === 'generating') return <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />;
    if (s === 'done') return <span className="text-green-400 text-xs">✓</span>;
    if (s === 'error') return <span className="text-red-400 text-xs">✗</span>;
    if (previewUrls[template.id]) return null;
    return null;
  };

  return (
    <>
    <div className="absolute top-24 right-4 z-50 w-80 bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700 flex flex-col max-h-[70vh]">
      <div className="flex items-center justify-between p-3 border-b border-gray-700 shrink-0">
        <h3 className="text-sm font-medium text-white">风格模板</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowGenerator(!showGenerator)}
            className={`p-1 rounded transition-colors ${
              showGenerator ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="预览图管理"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={() => setTemplatePanelOpen(false)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {showGenerator && (
        <div className="p-3 border-b border-gray-700 shrink-0 space-y-2 bg-gray-900/50">
          <p className="text-xs text-gray-400">
            {activeCategory === 'all'
              ? `全部 ${styleTemplates.length} 个模板`
              : `${templateCategories.find(c => c.id === activeCategory)?.name} ${filteredTemplates.length} 个模板`}
          </p>
          <button
            onClick={handleGenerateAll}
            className="w-full px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
          >
            批量生成预览图
          </button>
        </div>
      )}

      <div className="p-2 border-b border-gray-700 shrink-0">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {templateCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-2">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelectTemplate(template)}
              className="group text-left rounded-lg overflow-hidden border border-gray-700 hover:border-blue-500 transition-colors bg-gray-900/50"
              title={template.stylePrompt}
            >
              <div className={`h-16 bg-gradient-to-br ${template.gradient} flex items-center justify-center relative`}>
                {previewUrls[template.id] ? (
                  <img
                    src={previewUrls[template.id]}
                    alt={template.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-white/80 font-medium drop-shadow-md">
                    {template.name}
                  </span>
                )}
                {showGenerator && (
                  <div className="absolute top-1 right-1">
                    {statusIcon(template) || (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleGenerateOne(template); }}
                        className="w-4 h-4 bg-gray-900/70 rounded flex items-center justify-center hover:bg-blue-600 transition-colors"
                        title="生成预览图"
                      >
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-1.5 flex items-center justify-between">
                <p className="text-xs text-gray-400 truncate">{template.name}</p>
                {previewUrls[template.id] && !showGenerator && (
                  <span className="text-[10px] text-green-500 shrink-0">●</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>

    {selectedTemplate && (
      <TemplateApplyDialog
        template={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
      />
    )}
    </>
  );
};
