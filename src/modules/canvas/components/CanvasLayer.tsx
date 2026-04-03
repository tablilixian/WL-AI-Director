/**
 * Canvas Layer Component
 * 渲染单个图层，支持拖拽、缩放、选中状态
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { LayerData, PromptLayerData } from '../types/canvas';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useSnapAlignment } from '../hooks/useSnapAlignment';
import { ResizeHandle } from './ResizeHandle';
import { PromptLayer } from './PromptLayer';
import { unifiedImageService } from '../../../../services/unifiedImageService';
import { canvasIntegrationService } from '../services/canvasIntegrationService';

interface CanvasLayerProps {
  layer: LayerData;
  isSelected: boolean;
  onPromptLinkRequest?: (layerId: string, x: number, y: number) => void;
  onContextMenuRequest?: (layerId: string, x: number, y: number) => void;
}

/**
 * 解析图片 URL 为显示用 URL（blob: 或 data:）
 * 
 * @deprecated 使用 unifiedImageService.resolveForDisplay() 代替
 */
async function resolveImageSrc(src: string): Promise<string> {
  return await unifiedImageService.resolveForDisplay(src);
}

export const CanvasLayer: React.FC<CanvasLayerProps> = ({ 
  layer, 
  isSelected, 
  onPromptLinkRequest, 
  onContextMenuRequest 
}) => {
  const { selectLayer, updateLayer, layers } = useCanvasStore();
  const { calculateSnap } = useSnapAlignment();
  const layerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(layer.title);
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  
  const dragStartRef = useRef({ 
    x: 0, 
    y: 0, 
    layerX: 0, 
    layerY: 0, 
    childPositions: [] as { id: string; x: number; y: number }[] 
  });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    let objectUrl: string | null = null;
    
    const resolve = async () => {
      if (layer.type === 'image' || layer.type === 'drawing') {
        console.log('[CanvasLayer] 解析图片/drawing:', layer.id, 'type:', layer.type, 'src:', layer.src?.substring(0, 30), 'imageId:', layer.imageId);
        
        let srcToResolve = layer.src;
        
        // 对于 drawing 类型，如果 src 为空但有 imageId，则使用 imageId
        if (layer.type === 'drawing' && !srcToResolve && layer.imageId) {
          srcToResolve = `local:${layer.imageId}`;
          console.log('[CanvasLayer] drawing 类型使用 imageId 构造 URL:', srcToResolve);
        }
        
        const resolved = await resolveImageSrc(srcToResolve);
        console.log('[CanvasLayer] 解析结果:', layer.id, 'resolved:', resolved?.substring(0, 50));
        setResolvedSrc(resolved);
        if (resolved.startsWith('blob:') && resolved !== layer.src) {
          objectUrl = resolved;
        }
      } else {
        setResolvedSrc(layer.src);
      }
    };
    
    resolve();
    
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [layer.src, layer.type, layer.imageId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || e.shiftKey) return;
    e.stopPropagation();
    const multiSelect = e.ctrlKey || e.metaKey;
    selectLayer(layer.id, multiSelect);
    if (layer.locked) return;
    setIsDragging(true);
    
    const childLayers = layers.filter(l => l.parentId === layer.id);
    const childPositions = childLayers.map(child => ({ id: child.id, x: child.x, y: child.y }));
    
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      layerX: layer.x,
      layerY: layer.y,
      childPositions
    };
  }, [layer.id, layer.x, layer.y, layer.locked, layers, selectLayer]);

  const handleResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    if (layer.locked) return;
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: layer.width,
      height: layer.height
    };
  }, [layer.width, layer.height, layer.locked]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenaming(true);
    setNewTitle(layer.title);
  }, [layer.title]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectLayer(layer.id);
    if (onContextMenuRequest) {
      onContextMenuRequest(layer.id, e.clientX, e.clientY);
    }
  }, [layer.id, selectLayer, onContextMenuRequest]);

  const handleRenameSubmit = useCallback(() => {
    if (newTitle.trim()) {
      updateLayer(layer.id, { title: newTitle.trim() });
    }
    setIsRenaming(false);
  }, [layer.id, newTitle, updateLayer]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewTitle(layer.title);
    }
  }, [handleRenameSubmit, layer.title]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = (e.clientX - dragStartRef.current.x);
        const deltaY = (e.clientY - dragStartRef.current.y);
        const newX = dragStartRef.current.layerX + deltaX;
        const newY = dragStartRef.current.layerY + deltaY;
        const snapped = calculateSnap(layer, newX, newY);
        updateLayer(layer.id, { x: snapped.x, y: snapped.y });

        if (layer.type === 'group' && dragStartRef.current.childPositions.length > 0) {
          dragStartRef.current.childPositions.forEach(childPos => {
            updateLayer(childPos.id, { 
              x: childPos.x + deltaX, 
              y: childPos.y + deltaY 
            });
          });
        }
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.x;
        const deltaY = e.clientY - resizeStartRef.current.y;
        const newWidth = Math.max(50, resizeStartRef.current.width + deltaX);
        const newHeight = Math.max(50, resizeStartRef.current.height + deltaY);
        updateLayer(layer.id, { width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      
      // 拖拽/调整大小结束后触发自动保存（带 1s 延迟，等待操作完全结束）
      canvasIntegrationService.triggerAutoSave('transform');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, layer, layers, updateLayer, calculateSnap]);

  const renderContent = () => {
    switch (layer.type) {
      case 'image':
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
              <div className="text-gray-500 text-sm">
                {layer.src ? '加载中...' : '等待图片...'}
              </div>
            </div>
          );
        }
        return (
          <img
            src={resolvedSrc}
            alt={layer.title}
            className="w-full h-full object-contain"
            draggable={false}
            onError={(e) => {
              console.error('图片加载失败:', {
                layerId: layer.id,
                title: layer.title,
                srcLength: layer.src?.length,
                srcPrefix: layer.src?.substring(0, 50)
              });
            }}
            onLoad={() => {
              console.log('图片加载成功:', layer.id);
            }}
          />
        );
      case 'video':
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg">
              <div className="text-gray-500 text-sm">等待视频...</div>
            </div>
          );
        }
        return (
          <video
            src={resolvedSrc}
            className="w-full h-full object-contain"
            controls={isSelected}
            loop
            muted
          />
        );
      case 'sticky':
        return (
          <div
            className="w-full h-full p-3 rounded-lg shadow-lg"
            style={{ backgroundColor: layer.color || '#fef3c7' }}
          >
            <textarea
              className="w-full h-full bg-transparent resize-none outline-none text-sm"
              value={layer.text || ''}
              onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
              placeholder="Enter text..."
            />
          </div>
        );
      case 'text':
        return (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ color: layer.color || '#ffffff', fontSize: layer.fontSize || 24 }}
          >
            {layer.text || 'Text'}
          </div>
        );
      case 'group':
        return (
          <div
            className="w-full h-full border-2 border-dashed rounded-lg"
            style={{ borderColor: layer.color || '#6366f1' }}
          >
            <span className="absolute top-2 left-2 text-xs text-gray-400">
              {layer.title}
            </span>
          </div>
        );
      case 'drawing':
        if (!resolvedSrc) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-transparent">
              <div className="text-gray-500 text-sm">
                {layer.src ? '加载中...' : '绘制中...'}
              </div>
            </div>
          );
        }
        return (
          <img
            src={resolvedSrc}
            alt={layer.title}
            className="w-full h-full object-contain"
            draggable={false}
          />
        );
      case 'prompt':
        return (
          <PromptLayer
            layer={layer as PromptLayerData}
            isSelected={isSelected}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={layerRef}
      className={`absolute transition-shadow duration-150 ${
        isSelected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:ring-1 hover:ring-gray-500'
      } ${layer.locked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: layer.x,
        top: layer.y,
        width: layer.width,
        height: layer.height,
        zIndex: layer.zIndex ?? (isSelected ? 100 : 10),
        opacity: layer.opacity ?? 1,
        display: layer.visible === false ? 'none' : 'block'
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {layer.isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white">
              {layer.progress !== undefined ? `${Math.round(layer.progress)}%` : 'Loading...'}
            </span>
          </div>
        </div>
      )}

      {layer.error && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center rounded-lg">
          <span className="text-sm text-red-500">{layer.error}</span>
        </div>
      )}

      {renderContent()}

      {isSelected && !isResizing && !layer.locked && (
        <>
          <ResizeHandle position="nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <ResizeHandle position="ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <ResizeHandle position="sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
          <ResizeHandle position="se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}

      {layer.locked && (
        <div className="absolute top-1 right-1 p-1 bg-gray-800/80 rounded">
          <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {isSelected && (
        <div 
          className="absolute -top-6 left-0 px-2 py-0.5 bg-blue-500 text-white text-xs rounded truncate max-w-full flex items-center gap-1 cursor-pointer"
          onDoubleClick={handleDoubleClick}
        >
          {layer.locked && (
            <svg className="w-3 h-3 text-yellow-300" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}
          {isRenaming ? (
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleRenameKeyDown}
              className="bg-transparent border-none outline-none text-white text-xs w-20"
              autoFocus
            />
          ) : (
            layer.title
          )}
        </div>
      )}
    </div>
  );
};
