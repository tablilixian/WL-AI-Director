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
  const { layers, offset, scale, selectedLayerId, selectedLayerIds, selectLayer, undo, redo } = useCanvasStore();
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
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          console.log('[Keyboard] Ctrl+Z 被按下，执行撤销');
          undo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          console.log('[Keyboard] Ctrl+Shift+Z 或 Ctrl+Y 被按下，执行重做');
          redo();
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
