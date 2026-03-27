import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { PromptLayerData, PROMPT_MODE_ICONS, PROMPT_MODE_NAMES } from '../types/canvas';

interface PromptLinkPanelProps {
  sourceLayerId: string;
  onClose: () => void;
}

export const PromptLinkPanel: React.FC<PromptLinkPanelProps> = ({ 
  sourceLayerId, 
  onClose 
}) => {
  const { layers, linkLayerToPrompt, createPromptLayer } = useCanvasStore();
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  
  const promptLayers = layers.filter(l => l.type === 'prompt') as PromptLayerData[];
  const availablePrompts = promptLayers.filter(p => 
    p.promptConfig.linkedLayerIds.length < 5 &&
    !p.promptConfig.linkedLayerIds.includes(sourceLayerId)
  );
  
  const sourceLayer = layers.find(l => l.id === sourceLayerId);
  
  const handleLink = () => {
    if (!selectedPromptId) return;
    
    const success = linkLayerToPrompt(selectedPromptId, sourceLayerId);
    if (success) {
      onClose();
    }
  };
  
  const handleCreateAndLink = () => {
    const newPromptId = createPromptLayer(
      sourceLayer ? sourceLayer.x + sourceLayer.width + 50 : 100,
      sourceLayer ? sourceLayer.y : 100,
      'image-to-image'
    );
    
    linkLayerToPrompt(newPromptId, sourceLayerId);
    onClose();
  };
  
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-96 max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-white font-medium">关联到提示词</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {sourceLayer && (
            <div className="flex items-center gap-3 p-2 bg-gray-900/50 rounded-lg">
              <img 
                src={sourceLayer.src} 
                alt={sourceLayer.title}
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{sourceLayer.title}</p>
                <p className="text-xs text-gray-400">源图片</p>
              </div>
              <span className="text-gray-500">→</span>
            </div>
          )}
          
          {availablePrompts.length > 0 ? (
            <>
              <p className="text-xs text-gray-400 uppercase tracking-wider">选择提示词</p>
              {availablePrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => setSelectedPromptId(prompt.id)}
                  className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                    selectedPromptId === prompt.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600 bg-gray-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{PROMPT_MODE_ICONS[prompt.promptConfig.mode]}</span>
                    <span className="text-sm text-white font-medium">
                      {PROMPT_MODE_NAMES[prompt.promptConfig.mode]}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {prompt.promptConfig.linkedLayerIds.length}/5 关联
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">
                    {prompt.promptConfig.prompt || '未输入提示词'}
                  </p>
                </button>
              ))}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 text-sm mb-2">没有可用的提示词</p>
              <p className="text-gray-500 text-xs">所有提示词已满或已关联此图片</p>
            </div>
          )}
          
          <div className="border-t border-gray-700 pt-3">
            <button
              onClick={handleCreateAndLink}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              创建新提示词并关联
            </button>
          </div>
        </div>
        
        <div className="px-4 py-3 border-t border-gray-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedPromptId}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            关联
          </button>
        </div>
      </div>
    </div>
  );
};
