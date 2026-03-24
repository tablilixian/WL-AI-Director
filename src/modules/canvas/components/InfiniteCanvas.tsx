/**
 * Infinite Canvas Component
 * 提供无限画布功能，支持平移、缩放、图层管理
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useCanvasControls } from '../hooks/useCanvasControls';
import { CanvasLayer } from './CanvasLayer';
import { Minimap } from './Minimap';
import { CanvasToolbar } from './CanvasToolbar';
import { LayerPanel } from './LayerPanel';
import { PromptBar } from './PromptBar';

interface InfiniteCanvasProps {
  className?: string;
}

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ className = '' }) => {
  const { 
    layers, 
    offset, 
    scale, 
    selectedLayerId, 
    selectedLayerIds, 
    selectLayer, 
    selectAllLayers,
    clearSelection,
    deleteLayer,
    copySelectedLayers,
    pasteLayers,
    toggleLayerLock,
    toggleLayerVisibility,
    undo, 
    redo 
  } = useCanvasStore();
  const { handleMouseDown, handleWheel } = useCanvasControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const deltaX = e.clientX - lastMouseRef.current.x;
        const deltaY = e.clientY - lastMouseRef.current.y;
        useCanvasStore.getState().setOffset({
          x: offset.x + deltaX,
          y: offset.y + deltaY
        });
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 检查是否在输入框中
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            if (e.shiftKey) {
              e.preventDefault();
              console.log('[Keyboard] Ctrl+Shift+Z 被按下，执行重做');
              redo();
            } else {
              e.preventDefault();
              console.log('[Keyboard] Ctrl+Z 被按下，执行撤销');
              undo();
            }
            break;
          case 'y':
            e.preventDefault();
            console.log('[Keyboard] Ctrl+Y 被按下，执行重做');
            redo();
            break;
          case 'a':
            e.preventDefault();
            console.log('[Keyboard] Ctrl+A 被按下，全选图层');
            selectAllLayers();
            break;
          case 'c':
            e.preventDefault();
            console.log('[Keyboard] Ctrl+C 被按下，复制图层');
            copySelectedLayers();
            break;
          case 'v':
            e.preventDefault();
            console.log('[Keyboard] Ctrl+V 被按下，粘贴图层');
            pasteLayers();
            break;
          case 'l':
            e.preventDefault();
            if (selectedLayerId) {
              console.log('[Keyboard] Ctrl+L 被按下，切换锁定');
              if (selectedLayerIds.length > 1) {
                selectedLayerIds.forEach(id => toggleLayerLock(id));
              } else {
                toggleLayerLock(selectedLayerId);
              }
            }
            break;
          case 'h':
            e.preventDefault();
            if (selectedLayerId) {
              console.log('[Keyboard] Ctrl+H 被按下，切换可见性');
              if (selectedLayerIds.length > 1) {
                selectedLayerIds.forEach(id => toggleLayerVisibility(id));
              } else {
                toggleLayerVisibility(selectedLayerId);
              }
            }
            break;
        }
      } else {
        switch (e.key) {
          case 'Delete':
          case 'Backspace':
            e.preventDefault();
            if (selectedLayerIds.length > 0) {
              console.log('[Keyboard] Delete 被按下，删除选中图层');
              selectedLayerIds.forEach(id => deleteLayer(id));
              clearSelection();
            }
            break;
          case 'Escape':
            e.preventDefault();
            console.log('[Keyboard] Escape 被按下，清除选择');
            clearSelection();
            break;
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [offset, undo, redo]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || e.target === e.currentTarget) {
      selectLayer(null);
    }
  }, [selectLayer]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
    handleMouseDown(e);
  }, [handleMouseDown]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gray-900 ${className}`}>
      <CanvasToolbar />

      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <pattern
              id="grid"
              width={50 * scale}
              height={50 * scale}
              patternUnits="userSpaceOnUse"
              x={offset.x % (50 * scale)}
              y={offset.y % (50 * scale)}
            >
              <path
                d={`M ${50 * scale} 0 L 0 0 0 ${50 * scale}`}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0'
          }}
        >
          {layers.map((layer) => (
            <CanvasLayer
              key={layer.id}
              layer={layer}
              isSelected={selectedLayerIds.includes(layer.id)}
            />
          ))}
        </div>
      </div>

      <Minimap />
      <LayerPanel />
      <PromptBar selectedLayerId={selectedLayerId} />
    </div>
  );
};
