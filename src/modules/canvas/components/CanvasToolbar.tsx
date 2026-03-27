/**
 * Canvas Toolbar Component
 * 提供画布操作工具栏
 */

import React from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { useCanvasControls } from '../hooks/useCanvasControls';
import { PromptMode } from '../types/canvas';

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
    groupSelectedLayers,
    ungroupLayers,
    mergeSelectedLayers,
    createPromptLayer
  } = useCanvasStore();
  const { zoomIn, zoomOut, resetZoom, fitToContent } = useCanvasControls();
  const scale = useCanvasStore((s) => s.scale);

  const selectedLayer = selectedLayerId ? layers.find(l => l.id === selectedLayerId) : null;
  const hasMultipleSelection = selectedLayerIds.length > 1;
  const hasMultipleImageSelection = selectedLayerIds.filter(id => {
    const layer = layers.find(l => l.id === id);
    return layer?.type === 'image';
  }).length >= 2;

  const handleAddImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          useCanvasStore.getState().addLayer({
            id: crypto.randomUUID(),
            type: 'image',
            x: 100,
            y: 100,
            width: img.width,
            height: img.height,
            src: base64,
            title: file.name,
            createdAt: Date.now()
          });
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleAddSticky = () => {
    useCanvasStore.getState().addLayer({
      id: crypto.randomUUID(),
      type: 'sticky',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      src: '',
      title: 'New Sticky',
      color: '#fef3c7',
      text: '',
      createdAt: Date.now()
    });
  };

  const handleAddText = () => {
    useCanvasStore.getState().addLayer({
      id: crypto.randomUUID(),
      type: 'text',
      x: 100,
      y: 100,
      width: 200,
      height: 50,
      src: '',
      title: 'New Text',
      color: '#ffffff',
      text: 'Text',
      fontSize: 24,
      createdAt: Date.now()
    });
  };

  const handleAddPrompt = (mode: PromptMode = 'image-to-image') => {
    createPromptLayer(100, 100, mode);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-gray-800/90 backdrop-blur-sm rounded-lg p-1.5 shadow-lg border border-gray-700">
      <button
        onClick={handleAddImage}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Add Image"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      <button
        onClick={handleAddSticky}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Add Sticky"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>

      <button
        onClick={handleAddText}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Add Text"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>

      <button
        onClick={() => handleAddPrompt()}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Add AI Prompt"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      {selectedLayerId && (
        <>
          <button
            onClick={() => toggleLayerLock(selectedLayerId)}
            className={`p-2 rounded-md transition-colors ${
              selectedLayer?.locked 
                ? 'bg-yellow-600 text-white hover:bg-yellow-700' 
                : 'hover:bg-gray-700 text-gray-300 hover:text-white'
            }`}
            title={selectedLayer?.locked ? 'Unlock Layer' : 'Lock Layer'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              {selectedLayer?.locked ? (
                <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
              ) : (
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              )}
            </svg>
          </button>

          <button
            onClick={() => duplicateLayer(selectedLayerId)}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
            title="Duplicate Layer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          <button
            onClick={() => {
              if (selectedLayerIds.length > 1) {
                selectedLayerIds.forEach(id => deleteLayer(id));
              } else {
                deleteLayer(selectedLayerId);
              }
            }}
            className="p-2 hover:bg-red-600 rounded-md text-gray-300 hover:text-white transition-colors"
            title={selectedLayerIds.length > 1 ? `Delete ${selectedLayerIds.length} Layers` : 'Delete Layer'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          <button
            onClick={() => bringToFront(selectedLayerId)}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
            title="Bring to Front"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
            </svg>
          </button>

          <button
            onClick={() => sendToBack(selectedLayerId)}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
            title="Send to Back"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
            </svg>
          </button>

          <button
            onClick={() => bringForward(selectedLayerId)}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
            title="Bring Forward"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>

          <button
            onClick={() => sendBackward(selectedLayerId)}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
            title="Send Backward"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          <button
            onClick={() => alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'left')}
            disabled={!hasMultipleSelection && !selectedLayerId}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title={hasMultipleSelection ? 'Align Left (Multiple)' : 'Align Left'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" />
            </svg>
          </button>

          <button
            onClick={() => alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'center')}
            disabled={!hasMultipleSelection && !selectedLayerId}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title={hasMultipleSelection ? 'Align Center (Multiple)' : 'Align Center'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M5 18h14" />
            </svg>
          </button>

          <button
            onClick={() => alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'right')}
            disabled={!hasMultipleSelection && !selectedLayerId}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title={hasMultipleSelection ? 'Align Right (Multiple)' : 'Align Right'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M6 18h14" />
            </svg>
          </button>

          <button
            onClick={() => alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'top')}
            disabled={!hasMultipleSelection && !selectedLayerId}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title="Align Top"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M6 10h4M14 10h4M8 14h8" />
            </svg>
          </button>

          <button
            onClick={() => alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'middle')}
            disabled={!hasMultipleSelection && !selectedLayerId}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title="Align Middle"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M6 10h4M14 10h4M6 14h12M8 18h8" />
            </svg>
          </button>

          <button
            onClick={() => alignLayers(selectedLayerIds.length > 0 ? selectedLayerIds : [selectedLayerId], 'bottom')}
            disabled={!hasMultipleSelection && !selectedLayerId}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title="Align Bottom"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M6 10h12M8 14h4M14 14h4M10 18h4" />
            </svg>
          </button>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          <button
            onClick={() => toggleLayerVisibility(selectedLayerId)}
            className={`p-2 rounded-md transition-colors ${
              selectedLayer?.visible === false 
                ? 'bg-gray-600 text-gray-400 hover:bg-gray-500' 
                : 'hover:bg-gray-700 text-gray-300 hover:text-white'
            }`}
            title={selectedLayer?.visible === false ? 'Show Layer' : 'Hide Layer'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {selectedLayer?.visible === false ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              )}
            </svg>
          </button>

          <div className="flex items-center gap-1 px-2">
            <span className="text-xs text-gray-400">Opacity:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((selectedLayer?.opacity ?? 1) * 100)}
              onChange={(e) => setLayerOpacity(selectedLayerId, parseInt(e.target.value) / 100)}
              className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              disabled={!selectedLayerId}
            />
            <span className="text-xs text-gray-400 w-8">{Math.round((selectedLayer?.opacity ?? 1) * 100)}%</span>
          </div>

          <div className="w-px h-6 bg-gray-600 mx-1" />

          <button
            onClick={groupSelectedLayers}
            disabled={!hasMultipleSelection}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title="Group Layers (Ctrl+G)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </button>

          {selectedLayer?.type === 'group' && (
            <button
              onClick={() => ungroupLayers(selectedLayerId)}
              className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
              title="Ungroup Layers (Ctrl+Shift+G)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </button>
          )}

          <button
            onClick={mergeSelectedLayers}
            disabled={!hasMultipleImageSelection}
            className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors disabled:opacity-30"
            title="Merge Layers"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          <div className="w-px h-6 bg-gray-600 mx-1" />
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

      <button
        onClick={zoomOut}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Zoom Out"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
        </svg>
      </button>

      <span className="px-2 text-sm text-gray-300 min-w-[50px] text-center">
        {Math.round(scale * 100)}%
      </span>

      <button
        onClick={zoomIn}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Zoom In"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </button>

      <button
        onClick={fitToContent}
        className="p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors"
        title="Fit to Content"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </button>

      <div className="w-px h-6 bg-gray-600 mx-1" />

      <span className="px-2 text-xs text-gray-400">
        {layers.length} layers
      </span>
    </div>
  );
};
