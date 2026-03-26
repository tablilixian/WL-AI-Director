/**
 * Infinite Canvas Component
 * 提供无限画布功能，支持平移、缩放、图层管理
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useCanvasControls } from '../hooks/useCanvasControls';
import { CanvasLayer } from './CanvasLayer';
import { Minimap } from './Minimap';
import { CanvasToolbar } from './CanvasToolbar';
import { LayerPanel } from './LayerPanel';
import { PromptBar } from './PromptBar';
import { DrawingToolbar, DrawingTool } from './DrawingToolbar';
import { ConnectionLines } from './ConnectionLines';
import { LayerDetailPanel } from './LayerDetailPanel';
import { CanvasSettingsPanel } from './CanvasSettingsPanel';

interface InfiniteCanvasProps {
  className?: string;
}

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: { x: number; y: number }[];
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
    addLayer,
    undo, 
    redo 
  } = useCanvasStore();
  const { handleMouseDown, handleWheel } = useCanvasControls();
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [showLayerDetail, setShowLayerDetail] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#1f2937');
  const [showGrid, setShowGrid] = useState(true);
  const [gridSnap, setGridSnap] = useState(false);
  const [gridSize, setGridSize] = useState(50);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    points: []
  });

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
      if (activeTool === 'select') {
        selectLayer(null);
      }
    }
  }, [selectLayer, activeTool]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (activeTool === 'select') {
      handleMouseDown(e);
    } else if (e.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      setDrawingState({
        isDrawing: true,
        startX: screenX,
        startY: screenY,
        currentX: screenX,
        currentY: screenY,
        points: [{ x: screenX, y: screenY }]
      });
    }
  }, [activeTool, handleMouseDown]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawingState.isDrawing) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    setDrawingState(prev => ({
      ...prev,
      currentX: screenX,
      currentY: screenY,
      points: activeTool === 'pencil' ? [...prev.points, { x: screenX, y: screenY }] : prev.points
    }));

    if (drawingCanvasRef.current) {
      const ctx = drawingCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (activeTool === 'pencil') {
          ctx.beginPath();
          drawingState.points.forEach((point, i) => {
            if (i === 0) {
              ctx.moveTo(point.x, point.y);
            } else {
              ctx.lineTo(point.x, point.y);
            }
          });
          ctx.lineTo(screenX, screenY);
          ctx.stroke();
        } else if (activeTool === 'rectangle') {
          const width = screenX - drawingState.startX;
          const height = screenY - drawingState.startY;
          ctx.strokeRect(drawingState.startX, drawingState.startY, width, height);
        } else if (activeTool === 'arrow') {
          ctx.beginPath();
          ctx.moveTo(drawingState.startX, drawingState.startY);
          ctx.lineTo(screenX, screenY);
          ctx.stroke();

          const angle = Math.atan2(screenY - drawingState.startY, screenX - drawingState.startX);
          const arrowLength = 15;
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(
            screenX - arrowLength * Math.cos(angle - Math.PI / 6),
            screenY - arrowLength * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(
            screenX - arrowLength * Math.cos(angle + Math.PI / 6),
            screenY - arrowLength * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      }
    }
  }, [drawingState.isDrawing, drawingState.startX, drawingState.startY, drawingState.points, activeTool, strokeColor, strokeWidth]);

  const handleCanvasMouseUp = useCallback(() => {
    if (drawingState.isDrawing) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && drawingCanvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = drawingCanvasRef.current.width;
        canvas.height = drawingCanvasRef.current.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (activeTool === 'pencil' && drawingState.points.length > 1) {
            ctx.beginPath();
            drawingState.points.forEach((point, i) => {
              if (i === 0) {
                ctx.moveTo(point.x, point.y);
              } else {
                ctx.lineTo(point.x, point.y);
              }
            });
            ctx.stroke();
          } else if (activeTool === 'rectangle') {
            const width = drawingState.currentX - drawingState.startX;
            const height = drawingState.currentY - drawingState.startY;
            ctx.strokeRect(drawingState.startX, drawingState.startY, width, height);
          } else if (activeTool === 'arrow') {
            ctx.beginPath();
            ctx.moveTo(drawingState.startX, drawingState.startY);
            ctx.lineTo(drawingState.currentX, drawingState.currentY);
            ctx.stroke();

            const angle = Math.atan2(drawingState.currentY - drawingState.startY, drawingState.currentX - drawingState.startX);
            const arrowLength = 15;
            ctx.beginPath();
            ctx.moveTo(drawingState.currentX, drawingState.currentY);
            ctx.lineTo(
              drawingState.currentX - arrowLength * Math.cos(angle - Math.PI / 6),
              drawingState.currentY - arrowLength * Math.sin(angle - Math.PI / 6)
            );
            ctx.moveTo(drawingState.currentX, drawingState.currentY);
            ctx.lineTo(
              drawingState.currentX - arrowLength * Math.cos(angle + Math.PI / 6),
              drawingState.currentY - arrowLength * Math.sin(angle + Math.PI / 6)
            );
            ctx.stroke();
          }

          const padding = strokeWidth + 2;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

          if (activeTool === 'pencil') {
            drawingState.points.forEach(point => {
              minX = Math.min(minX, point.x);
              minY = Math.min(minY, point.y);
              maxX = Math.max(maxX, point.x);
              maxY = Math.max(maxY, point.y);
            });
          } else {
            minX = Math.min(drawingState.startX, drawingState.currentX);
            minY = Math.min(drawingState.startY, drawingState.currentY);
            maxX = Math.max(drawingState.startX, drawingState.currentX);
            maxY = Math.max(drawingState.startY, drawingState.currentY);
          }

          minX = Math.max(0, minX - padding);
          minY = Math.max(0, minY - padding);
          maxX = Math.min(canvas.width, maxX + padding);
          maxY = Math.min(canvas.height, maxY + padding);

          const cropWidth = Math.max(maxX - minX, 20);
          const cropHeight = Math.max(maxY - minY, 20);

          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cropWidth;
          cropCanvas.height = cropHeight;
          const cropCtx = cropCanvas.getContext('2d');
          if (cropCtx) {
            cropCtx.drawImage(canvas, -minX, -minY);
          }

          const dataUrl = cropCanvas.toDataURL('image/png');
          const canvasX = (minX - offset.x) / scale;
          const canvasY = (minY - offset.y) / scale;
          const canvasWidth = cropWidth / scale;
          const canvasHeight = cropHeight / scale;

          if (cropWidth > 10 && cropHeight > 10) {
            addLayer({
              id: crypto.randomUUID(),
              type: 'drawing',
              x: canvasX,
              y: canvasY,
              width: canvasWidth,
              height: canvasHeight,
              src: dataUrl,
              title: `${activeTool === 'pencil' ? '铅笔' : activeTool === 'rectangle' ? '矩形' : '箭头'}标注`,
              createdAt: Date.now()
            });
          }
        }
      }

      if (drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
        }
      }

      setDrawingState({
        isDrawing: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        points: []
      });
    }
  }, [drawingState, activeTool, strokeColor, strokeWidth, scale, offset, addLayer]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gray-900 ${className}`}>
      <DrawingToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        strokeColor={strokeColor}
        onStrokeColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
      />

      <CanvasToolbar />

      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        style={{ 
          cursor: activeTool !== 'select' ? 'crosshair' : undefined,
          backgroundColor: backgroundColor
        }}
      >
        {showGrid && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <pattern
                id="grid"
                width={gridSize * scale}
                height={gridSize * scale}
                patternUnits="userSpaceOnUse"
                x={offset.x % (gridSize * scale)}
                y={offset.y % (gridSize * scale)}
              >
                <path
                  d={`M ${gridSize * scale} 0 L 0 0 0 ${gridSize * scale}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={1}
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        )}

        <canvas
          ref={drawingCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          width={containerRef.current?.clientWidth || 1920}
          height={containerRef.current?.clientHeight || 1080}
        />

        <ConnectionLines offset={offset} scale={scale} />

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

      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-4 left-4 z-50 p-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors"
        title="画布设置"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {selectedLayerId && (
        <button
          onClick={() => setShowLayerDetail(true)}
          className="absolute top-16 left-4 z-50 p-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors"
          title="图层详情"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      {showLayerDetail && (
        <LayerDetailPanel onClose={() => setShowLayerDetail(false)} />
      )}

      {showSettings && (
        <CanvasSettingsPanel
          backgroundColor={backgroundColor}
          onBackgroundColorChange={setBackgroundColor}
          showGrid={showGrid}
          onShowGridChange={setShowGrid}
          gridSnap={gridSnap}
          onGridSnapChange={setGridSnap}
          gridSize={gridSize}
          onGridSizeChange={setGridSize}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};
