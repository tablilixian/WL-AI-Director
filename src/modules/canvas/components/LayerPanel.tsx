/**
 * Layer Panel Component
 * 提供图层列表管理面板
 */

import React, { useState } from 'react';
import { useCanvasStore } from '../hooks/useCanvasState';
import { LayerData } from '../types/canvas';

export const LayerPanel: React.FC = () => {
  const { layers, selectedLayerId, selectedLayerIds, selectLayer, deleteLayer, updateLayer, searchLayers } = useCanvasStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const filteredLayers = isSearching && searchQuery.trim() 
    ? searchLayers(searchQuery)
    : layers;

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const renderLayerItem = (layer: LayerData, depth: number = 0) => {
    const childLayers = layers.filter(l => l.parentId === layer.id);
    const isGroup = layer.type === 'group';
    const isExpanded = expandedGroups.has(layer.id);

    return (
      <div key={layer.id}>
        <div
          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
            selectedLayerIds.includes(layer.id)
              ? 'bg-blue-600/30 border border-blue-500'
              : 'hover:bg-gray-700 border border-transparent'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => selectLayer(layer.id)}
        >
          {isGroup && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleGroupExpand(layer.id);
              }}
              className="p-0.5 hover:bg-gray-600 rounded"
            >
              <svg className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <div
            className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 relative"
            style={{
              backgroundColor: layer.type === 'sticky' ? layer.color : undefined
            }}
          >
            {layer.type === 'video' ? (
              <>
                {layer.src && (layer.src.startsWith('http') || layer.src.startsWith('blob:') || layer.src.startsWith('data:')) ? (
                  <video
                    src={layer.src}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                ) : (
                  <div className="w-full h-full bg-purple-900/50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="absolute bottom-0 right-0 bg-purple-600 rounded-tl px-0.5">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </>
            ) : layer.src && !layer.src.startsWith('video:') && !layer.src.startsWith('local:') ? (
              <img
                src={layer.thumbnail || layer.src}
                alt={layer.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gray-400">
                {getLayerIcon(layer.type)}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">
              {layer.title}
            </div>
            <div className="text-xs text-gray-500">
              {layer.type}{isGroup ? ` (${childLayers.length})` : ''}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteLayer(layer.id);
            }}
            className="p-1 hover:bg-red-600 rounded text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isGroup && isExpanded && childLayers.length > 0 && (
          <div>
            {childLayers.map(child => renderLayerItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const getLayerIcon = (type: LayerData['type']) => {
    switch (type) {
      case 'image':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'video':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      case 'sticky':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'text':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'group':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        );
    }
  };

  if (isCollapsed) {
    return (
      <div className="absolute top-24 right-4 z-50">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700 text-gray-300 hover:text-white transition-colors"
          title="Show Layers"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-24 right-4 z-50 w-64 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-700">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white">Layers</h3>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-2 border-b border-gray-700">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearching(e.target.value.trim().length > 0);
            }}
            placeholder="搜索图层..."
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 pl-8 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <svg className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {isSearching && (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsSearching(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {isSearching && (
          <div className="text-xs text-gray-400 mt-1">
            找到 {filteredLayers.length} 个图层
          </div>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {filteredLayers.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {isSearching ? '没有找到匹配的图层' : 'No layers yet'}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {[...filteredLayers].reverse().filter(l => !l.parentId).map(layer => renderLayerItem(layer))}
          </div>
        )}
      </div>
    </div>
  );
};
