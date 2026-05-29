import React, { useState, useMemo } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { styleTemplates, templateCategories, StyleTemplate } from '../data/styleTemplates';

export const StyleTemplatePanel: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const setSuggestedPrompt = useCanvasStore((s) => s.setSuggestedPrompt);
  const setTemplatePanelOpen = useCanvasStore((s) => s.setTemplatePanelOpen);

  const filteredTemplates = useMemo(() => {
    if (activeCategory === 'all') return styleTemplates;
    return styleTemplates.filter((t) => t.category === activeCategory);
  }, [activeCategory]);

  const handleSelectTemplate = (template: StyleTemplate) => {
    setSuggestedPrompt(template.prompt);
    setTemplatePanelOpen(false);
  };

  return (
    <div className="absolute top-24 right-4 z-50 w-80 bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700 flex flex-col max-h-[70vh]">
      <div className="flex items-center justify-between p-3 border-b border-gray-700 shrink-0">
        <h3 className="text-sm font-medium text-white">风格模板</h3>
        <button
          onClick={() => setTemplatePanelOpen(false)}
          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

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
              title={template.prompt}
            >
              <div className={`h-16 bg-gradient-to-br ${template.gradient} flex items-center justify-center`}>
                <span className="text-xs text-white/80 font-medium drop-shadow-md">
                  {template.name}
                </span>
              </div>
              <div className="p-1.5">
                <p className="text-xs text-gray-400 truncate">{template.name}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
