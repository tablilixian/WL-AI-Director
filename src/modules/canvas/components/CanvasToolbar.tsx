/**
 * Canvas Toolbar Component
 * 提供画布操作工具栏
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useCanvasControls } from '../hooks/useCanvasControls';
import { DrawingTool } from '../types/canvas';

export const CanvasToolbar: React.FC = () => {
  const { 
    layers, 
    selectedLayerId,
    selectedLayerIds,
    deleteLayer, 
    duplicateLayer, 
    undo, 
    redo, 
    clearCanvas,
    toggleLayerLock,
    toggleLayerVisibility,
    setLayerOpacity,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    alignLayers,
    distributeLayers,
    groupSelectedLayers,
    ungroupLayers,
    mergeSelectedLayers,
    setScale,
    activeTool,
    strokeColor,
    strokeWidth,
    setActiveTool,
    setStrokeColor,
    setStrokeWidth
  } = useCanvasStore();
  const { zoomIn, zoomOut, resetZoom, fitToContent } = useCanvasControls();
  const autoArrangeLayers = useCanvasStore((s) => s.autoArrangeLayers);
  const scale = useCanvasStore((s) => s.scale);
  const templatePanelOpen = useCanvasStore((s) => s.templatePanelOpen);
  const setTemplatePanelOpen = useCanvasStore((s) => s.setTemplatePanelOpen);

  const [isToolOpen, setIsToolOpen] = useState(false);
  const toolRef = useRef<HTMLDivElement>(null);
  const [isLayerOpen, setIsLayerOpen] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  const [isArrangeOpen, setIsArrangeOpen] = useState(false);
  const arrangeRef = useRef<HTMLDivElement>(null);
  const [showToolColor, setShowToolColor] = useState(false);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (arrangeRef.current && !arrangeRef.current.contains(e.target as Node)) {
        setIsArrangeOpen(false);
      }
    };
    if (isArrangeOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isArrangeOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (layerRef.current && !layerRef.current.contains(e.target as Node)) {
        setIsLayerOpen(false);
      }
    };
    if (isLayerOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isLayerOpen]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (toolRef.current && !toolRef.current.contains(e.target as Node)) {
        setIsToolOpen(false);
        setShowToolColor(false);
      }
    };
    if (isToolOpen || showToolColor) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isToolOpen, showToolColor]);

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasMultipleSelection = selectedLayerIds.length > 1;
  const hasMultipleImageSelection = selectedLayerIds.filter(id => {
    const layer = layers.find(l => l.id === id);
    return layer?.type === 'image';
  }).length >= 2;

  const toolIcons: Record<DrawingTool, { icon: React.ReactNode; label: string }> = {
    select: {
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>,
      label: '选择'
    },
    pencil: {
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
      label: '画笔'
    },
    rectangle: {
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
      label: '矩形'
    },
    arrow: {
      icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>,
      label: '箭头'
    }
  };

  const toolColors = ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
  const toolStrokeWidths = [2, 4, 6, 8, 12];
  const isDrawingTool = activeTool !== 'select';

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-gray-800/90 backdrop-blur-sm rounded-lg p-1.5 shadow-lg border border-gray-700">
      <div className="relative" ref={toolRef}>
        <button
          onClick={() => setIsToolOpen(!isToolOpen)}
          className={`flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
            isToolOpen
              ? 'bg-gray-700 text-white'
              : 'hover:bg-gray-700 text-gray-300 hover:text-white'
          }`}
          title="绘图工具"
        >
          {toolIcons[activeTool].icon}
          <span>{toolIcons[activeTool].label}</span>
          <svg className={`w-3 h-3 transition-transform ${isToolOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isToolOpen && (
          <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px] z-50" onClick={(e) => e.stopPropagation()}>
            {(Object.keys(toolIcons) as DrawingTool[]).map(tool => (
              <button
                key={tool}
                onClick={() => { setActiveTool(tool); setIsToolOpen(false); }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors ${
                  activeTool === tool
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {toolIcons[tool].icon}
                {toolIcons[tool].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isDrawingTool && (
        <>
          <div className="relative">
            <button
              onClick={() => setShowToolColor(!showToolColor)}
              className="p-2 hover:bg-gray-700 rounded-md transition-colors"
              title="颜色选择"
            >
              <div className="w-4 h-4 rounded-full border border-gray-500" style={{ backgroundColor: strokeColor }} />
            </button>
            {showToolColor && (
              <div className="absolute top-full left-0 mt-1.5 p-2 bg-gray-800 rounded-lg shadow-lg border border-gray-700 flex gap-1">
                {toolColors.map(color => (
                  <button
                    key={color}
                    onClick={() => { setStrokeColor(color); setShowToolColor(false); }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      strokeColor === color ? 'border-white' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </div>

          <select
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            className="bg-gray-700 text-white text-xs rounded px-1 py-1.5 border border-gray-600 focus:outline-none focus:border-blue-500 w-10"
            title="线条粗细"
          >
            {toolStrokeWidths.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>

          <div className="w-px h-6 bg-gray-600 mx-1" />
        </>
      )}


      <div className="w-px h-6 bg-gray-600 mx-1" />

      {selectedLayerId && (
        <>
          <div className="relative" ref={layerRef}>
            <button
              onClick={() => setIsLayerOpen(!isLayerOpen)}
              className={`flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                isLayerOpen
                  ? 'bg-gray-700 text-white'
                  : 'hover:bg-gray-700 text-gray-300 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span>图层</span>
              <svg className={`w-3 h-3 transition-transform ${isLayerOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isLayerOpen && (
              <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">属性</div>
                <button onClick={() => { toggleLayerVisibility(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {selectedLayer?.visible === false ? '显示' : '隐藏'}
                </button>
                <button onClick={() => { toggleLayerLock(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                  {selectedLayer?.locked ? '解锁' : '锁定'}
                </button>
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((selectedLayer?.opacity ?? 1) * 100)}
                      onChange={(e) => setLayerOpacity(selectedLayerId, parseInt(e.target.value) / 100)}
                      className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{Math.round((selectedLayer?.opacity ?? 1) * 100)}%</span>
                  </div>
                </div>

                <div className="border-t border-gray-700 my-1" />

                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">操作</div>
                <button onClick={() => { duplicateLayer(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  复制
                </button>
                <button onClick={() => { if (selectedLayerIds.length > 1) { selectedLayerIds.forEach(id => deleteLayer(id)); } else { deleteLayer(selectedLayerId); } setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  删除
                </button>

                <div className="border-t border-gray-700 my-1" />

                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">排序</div>
                <button onClick={() => { bringToFront(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" /></svg>
                  置顶
                </button>
                <button onClick={() => { sendToBack(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" /></svg>
                  置底
                </button>
                <button onClick={() => { bringForward(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  前移一层
                </button>
                <button onClick={() => { sendBackward(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  后移一层
                </button>

                <div className="border-t border-gray-700 my-1" />

                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">组合</div>
                <button onClick={() => { groupSelectedLayers(); setIsLayerOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">编组</button>
                {selectedLayer?.type === 'group' && (
                  <button onClick={() => { ungroupLayers(selectedLayerId); setIsLayerOpen(false); }} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2">解组</button>
                )}
                <button onClick={() => { mergeSelectedLayers(); setIsLayerOpen(false); }} disabled={!hasMultipleImageSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">合并图层</button>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          <div className="relative" ref={arrangeRef}>
            <button
              onClick={() => setIsArrangeOpen(!isArrangeOpen)}
              className={`flex items-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                isArrangeOpen
                  ? 'bg-gray-700 text-white'
                  : 'hover:bg-gray-700 text-gray-300 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>对齐</span>
              <svg className={`w-3 h-3 transition-transform ${isArrangeOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isArrangeOpen && (
              <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">对齐</div>
                <button onClick={() => { alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'left'); setIsArrangeOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">左对齐</button>
                <button onClick={() => { alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'center'); setIsArrangeOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">水平居中</button>
                <button onClick={() => { alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'right'); setIsArrangeOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">右对齐</button>
                <button onClick={() => { alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'top'); setIsArrangeOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">顶部对齐</button>
                <button onClick={() => { alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'middle'); setIsArrangeOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">垂直居中</button>
                <button onClick={() => { alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'bottom'); setIsArrangeOpen(false); }} disabled={!hasMultipleSelection} className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed">底部对齐</button>
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={undo}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Undo (Ctrl+Z)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </button>

      <button
        onClick={redo}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={5}
          max={200}
          value={Math.round(scale * 100)}
          onChange={(e) => setScale(Number(e.target.value) / 100)}
          className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
          title="Zoom"
        />
        <span className="text-sm text-gray-300 min-w-[45px] text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
      </div>

      <button
        onClick={fitToContent}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Fit to Content"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>

      <button
        onClick={autoArrangeLayers}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Auto Arrange Layers"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      </button>

      <button
        onClick={() => setTemplatePanelOpen(!templatePanelOpen)}
        className={`p-2 rounded-md transition-colors ${
          templatePanelOpen
            ? 'bg-blue-600 text-white'
            : 'hover:bg-gray-700 text-gray-300 hover:text-white'
        }`}
        title="风格模板"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      <span className="px-2 text-xs text-gray-400">
        {layers.length} layers
      </span>
    </div>
  );
};
