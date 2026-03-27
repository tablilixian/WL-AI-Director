import React, { useState } from 'react';
import { 
  PromptLayerData, 
  PromptMode, 
  PROMPT_MODE_ICONS, 
  PROMPT_MODE_NAMES,
  PROMPT_MODE_COLORS 
} from '../types/canvas';
import { useCanvasStore } from '../hooks/useCanvasState';
import { canvasModelService } from '../services/canvasModelService';
import { imageStorageService } from '../../../../services/imageStorageService';

async function resolveAndSaveImage(imageUrl: string): Promise<{ src: string; imageId?: string }> {
  if (!imageUrl) return { src: '' };
  
  if (imageUrl.startsWith('local:')) {
    return { src: imageUrl, imageId: imageUrl.replace('local:', '') };
  }
  
  if (imageUrl.startsWith('data:')) {
    try {
      const imgId = `canvas_prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await imageStorageService.saveImage(imgId, blob);
      console.log('[PromptLayer] 图片已保存到 IndexedDB:', imgId);
      return { src: `local:${imgId}`, imageId: imgId };
    } catch (e) {
      console.warn('[PromptLayer] 保存图片到 IndexedDB 失败:', e);
      return { src: imageUrl };
    }
  }
  
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const imgId = `canvas_prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await imageStorageService.saveImage(imgId, blob);
      console.log('[PromptLayer] 外部图片已保存到 IndexedDB:', imgId);
      return { src: `local:${imgId}`, imageId: imgId };
    } catch (e) {
      console.warn('[PromptLayer] 下载外部图片失败:', e);
      return { src: imageUrl };
    }
  }
  
  return { src: imageUrl };
}

interface PromptLayerProps {
  layer: PromptLayerData;
  isSelected: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
}

export const PromptLayer: React.FC<PromptLayerProps> = ({ 
  layer, 
  isSelected,
  onDragStart 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const { 
    updatePromptConfig, 
    getPromptLinkedLayers, 
    unlinkLayerFromPrompt,
    addLayer,
    updateLayer
  } = useCanvasStore();
  
  const { promptConfig } = layer;
  const linkedLayers = getPromptLinkedLayers(layer.id);
  
  const handleEditStart = () => {
    setEditPrompt(promptConfig.prompt);
    setIsEditing(true);
  };
  
  const handleEditSave = () => {
    updatePromptConfig(layer.id, { prompt: editPrompt });
    setIsEditing(false);
  };
  
  const handleEditCancel = () => {
    setIsEditing(false);
  };
  
  const handleModeChange = (mode: PromptMode) => {
    updatePromptConfig(layer.id, { mode });
  };
  
  const handleUnlink = (layerId: string) => {
    unlinkLayerFromPrompt(layer.id, layerId);
  };
  
  const handleEnhance = async () => {
    if (!promptConfig.prompt.trim() || isEnhancing) return;
    
    setIsEnhancing(true);
    try {
      const enhanced = await canvasModelService.enhancePrompt(
        promptConfig.prompt,
        promptConfig.mode,
        linkedLayers.length
      );
      updatePromptConfig(layer.id, { 
        enhancedPrompt: enhanced,
        isEnhanced: true 
      });
    } catch (error) {
      console.error('Enhance failed:', error);
    } finally {
      setIsEnhancing(false);
    }
  };
  
  const handleExecute = async () => {
    if (!promptConfig.prompt.trim() || isExecuting || linkedLayers.length === 0) return;
    
    setIsExecuting(true);
    const outputIds: string[] = [];
    
    try {
      const promptToUse = promptConfig.isEnhanced && promptConfig.enhancedPrompt
        ? promptConfig.enhancedPrompt
        : promptConfig.prompt;
      
      for (let i = 0; i < linkedLayers.length; i++) {
        const sourceLayer = linkedLayers[i];
        
        const placeholderId = crypto.randomUUID();
        addLayer({
          id: placeholderId,
          type: 'image',
          x: sourceLayer.x + sourceLayer.width + 20,
          y: sourceLayer.y + (i * 20),
          width: sourceLayer.width,
          height: sourceLayer.height,
          src: '',
          title: `生成中... (${i + 1}/${linkedLayers.length})`,
          isLoading: true,
          progress: 0,
          createdAt: Date.now(),
          sourceLayerId: sourceLayer.id,
          operationType: promptConfig.mode === 'style-transfer' ? 'style-transfer' :
                        promptConfig.mode === 'background-replace' ? 'background-replace' :
                        promptConfig.mode === 'expand' ? 'expand' : 'image-to-image'
        });
        
        try {
          let resultUrl: string;
          
          if (promptConfig.mode === 'style-transfer') {
            resultUrl = await canvasModelService.styleTransfer(
              sourceLayer.src,
              promptToUse,
              (p) => updateLayer(placeholderId, { progress: p })
            );
          } else if (promptConfig.mode === 'background-replace') {
            resultUrl = await canvasModelService.replaceBackground(
              sourceLayer.src,
              promptToUse,
              (p) => updateLayer(placeholderId, { progress: p })
            );
          } else if (promptConfig.mode === 'expand') {
            resultUrl = await canvasModelService.expandImage(
              sourceLayer.src,
              'all',
              (p) => updateLayer(placeholderId, { progress: p })
            );
          } else {
            resultUrl = await canvasModelService.generateImage({
              prompt: promptToUse,
              referenceImages: [sourceLayer.src],
              aspectRatio: promptConfig.aspectRatio,
              onProgress: (p) => updateLayer(placeholderId, { progress: p })
            });
          }
          
          const { src, imageId } = await resolveAndSaveImage(resultUrl);
          
          updateLayer(placeholderId, {
            src,
            imageId,
            title: `${PROMPT_MODE_NAMES[promptConfig.mode]} - ${sourceLayer.title}`,
            isLoading: false,
            progress: 100
          });
          
          outputIds.push(placeholderId);
        } catch (error: any) {
          updateLayer(placeholderId, {
            error: error.message || '生成失败',
            isLoading: false
          });
        }
      }
      
      updatePromptConfig(layer.id, { outputLayerIds: outputIds });
    } finally {
      setIsExecuting(false);
    }
  };
  
  const canExecute = promptConfig.prompt.trim() && linkedLayers.length > 0 && !isExecuting;
  
  return (
    <div 
      className="absolute rounded-xl shadow-2xl border-2 overflow-hidden backdrop-blur-sm"
      style={{
        width: layer.width,
        height: layer.height,
        borderColor: isSelected ? '#ffffff' : promptConfig.nodeColor,
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        boxShadow: isSelected 
          ? `0 0 20px ${promptConfig.nodeColor}40` 
          : `0 4px 20px rgba(0, 0, 0, 0.5)`
      }}
      onMouseDown={onDragStart}
    >
      <div 
        className="px-3 py-2 flex items-center justify-between cursor-move"
        style={{ backgroundColor: `${promptConfig.nodeColor}20` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{PROMPT_MODE_ICONS[promptConfig.mode]}</span>
          <span className="text-sm font-medium text-white truncate">
            {PROMPT_MODE_NAMES[promptConfig.mode]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {promptConfig.isEnhanced && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
              ✨ 已增强
            </span>
          )}
        </div>
      </div>
      
      <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: layer.height - 100 }}>
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="输入提示词..."
              className="w-full h-20 px-2 py-1 text-sm bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleEditSave}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                保存
              </button>
              <button
                onClick={handleEditCancel}
                className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={handleEditStart}
            className="cursor-pointer hover:bg-gray-800/50 rounded-lg p-2 transition-colors"
          >
            {promptConfig.prompt ? (
              <p className="text-sm text-gray-300 line-clamp-3">{promptConfig.prompt}</p>
            ) : (
              <p className="text-sm text-gray-500 italic">点击输入提示词...</p>
            )}
          </div>
        )}
        
        {promptConfig.enhancedPrompt && (
          <div className="mt-2 p-2 bg-green-500/10 rounded-lg border border-green-500/20">
            <p className="text-xs text-green-400 mb-1">✨ 增强后:</p>
            <p className="text-xs text-gray-300 line-clamp-2">{promptConfig.enhancedPrompt}</p>
          </div>
        )}
        
        <div className="flex flex-wrap gap-1 mt-2">
          {Object.entries(PROMPT_MODE_ICONS).map(([mode, icon]) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode as PromptMode)}
              className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                promptConfig.mode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              title={PROMPT_MODE_NAMES[mode as PromptMode]}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>
      
      <div className="px-3 py-2 border-t border-gray-700 bg-gray-900/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">关联:</span>
            <span className="text-xs font-medium text-white">
              {linkedLayers.length}/5
            </span>
          </div>
          <div className="flex -space-x-2">
            {linkedLayers.slice(0, 3).map((linked) => (
              <div
                key={linked.id}
                className="relative group"
              >
                <img
                  src={linked.src}
                  alt={linked.title}
                  className="w-6 h-6 rounded-full border-2 border-gray-800 object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnlink(linked.id);
                  }}
                  className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-white text-[8px] hidden group-hover:flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
            {linkedLayers.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-800 flex items-center justify-center">
                <span className="text-[10px] text-gray-400">+{linkedLayers.length - 3}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleEnhance}
            disabled={!promptConfig.prompt.trim() || isEnhancing}
            className="flex-1 px-2 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            {isEnhancing ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                增强中
              </>
            ) : (
              <>✨ 增强</>
            )}
          </button>
          
          <button
            onClick={handleExecute}
            disabled={!canExecute}
            className="flex-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
          >
            {isExecuting ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                执行中
              </>
            ) : (
              <>▶️ 执行</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
