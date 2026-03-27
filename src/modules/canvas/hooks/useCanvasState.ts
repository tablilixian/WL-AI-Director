/**
 * Canvas State Management
 * 使用 Zustand 管理画布状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  LayerData, 
  CanvasOffset, 
  PromptLayerData, 
  PromptLayerConfig, 
  PromptMode,
  PROMPT_MODE_COLORS 
} from '../types/canvas';
import { assetStore } from '../services/assetStore';

const MAX_HISTORY = 20;

interface CanvasHistory {
  layers: LayerData[];
  timestamp: number;
}

interface CanvasState {
  layers: LayerData[];
  offset: CanvasOffset;
  scale: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  history: CanvasHistory[];
  historyIndex: number;
  clipboard: LayerData[];
}

interface CanvasActions {
  addLayer: (layer: LayerData) => void;
  updateLayer: (id: string, updates: Partial<LayerData>) => void;
  deleteLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, newIndex: number) => void;
  setOffset: (offset: CanvasOffset) => void;
  setScale: (scale: number) => void;
  selectLayer: (id: string | null, multiSelect?: boolean) => void;
  selectMultipleLayers: (ids: string[]) => void;
  selectAllLayers: () => void;
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  clearHistory: () => void;
  clearCanvas: () => void;
  importLayers: (layers: LayerData[], replace?: boolean) => void;
  exportLayers: () => LayerData[];
  copySelectedLayers: () => void;
  pasteLayers: () => void;
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  alignLayers: (layerIds: string[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeLayers: (layerIds: string[], direction: 'horizontal' | 'vertical') => void;
  groupSelectedLayers: () => void;
  ungroupLayers: (groupId: string) => void;
  mergeSelectedLayers: () => Promise<void>;
  searchLayers: (query: string) => LayerData[];
  createPromptLayer: (x: number, y: number, mode?: PromptMode) => string;
  updatePromptConfig: (id: string, config: Partial<PromptLayerConfig>) => void;
  linkLayerToPrompt: (promptId: string, layerId: string) => boolean;
  unlinkLayerFromPrompt: (promptId: string, layerId: string) => void;
  getPromptLinkedLayers: (promptId: string) => LayerData[];
}

const initialState: CanvasState = {
  layers: [],
  offset: { x: 0, y: 0 },
  scale: 1,
  selectedLayerId: null,
  selectedLayerIds: [],
  history: [],
  historyIndex: -1,
  clipboard: []
};

export const useCanvasStore = create<CanvasState & CanvasActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addLayer: (layer) => {
        const state = get();
        const newLayers = [...state.layers, layer];
        set({
          layers: newLayers,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      updateLayer: (id, updates) => {
        const state = get();
        const newLayers = state.layers.map(l =>
          l.id === id ? { ...l, ...updates } : l
        );
        set({
          layers: newLayers,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      deleteLayer: (id) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        
        if (layer?.imageId) {
          assetStore.deleteAsset(layer.imageId).catch(console.error);
        }
        if (layer?.thumbnailId) {
          assetStore.deleteAsset(layer.thumbnailId).catch(console.error);
        }

        const newLayers = state.layers.filter(l => l.id !== id);
        set({
          layers: newLayers,
          selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      duplicateLayer: (id) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        if (!layer) return;

        const newLayer: LayerData = {
          ...layer,
          id: crypto.randomUUID(),
          x: layer.x + 20,
          y: layer.y + 20,
          title: `${layer.title} (copy)`,
          createdAt: Date.now(),
          annotations: layer.annotations?.map(a => ({ ...a, id: crypto.randomUUID() }))
        };

        const newLayers = [...state.layers, newLayer];
        set({
          layers: newLayers,
          selectedLayerId: newLayer.id,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      reorderLayer: (id, newIndex) => {
        const state = get();
        const currentIndex = state.layers.findIndex(l => l.id === id);
        if (currentIndex === -1) return;

        const newLayers = [...state.layers];
        const [layer] = newLayers.splice(currentIndex, 1);
        newLayers.splice(newIndex, 0, layer);

        set({
          layers: newLayers,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      setOffset: (offset) => set({ offset }),

      setScale: (scale) => set({ scale: Math.min(Math.max(scale, 0.1), 5) }),

      selectLayer: (id, multiSelect = false) => {
        const state = get();
        if (multiSelect) {
          if (id === null) {
            set({ selectedLayerId: null, selectedLayerIds: [] });
          } else {
            const currentIds = state.selectedLayerIds;
            if (currentIds.includes(id)) {
              const newIds = currentIds.filter(i => i !== id);
              set({ 
                selectedLayerId: newIds.length > 0 ? newIds[newIds.length - 1] : null,
                selectedLayerIds: newIds 
              });
            } else {
              const newIds = [...currentIds, id];
              set({ selectedLayerId: id, selectedLayerIds: newIds });
            }
          }
        } else {
          set({ selectedLayerId: id, selectedLayerIds: id ? [id] : [] });
        }
      },

      selectMultipleLayers: (ids) => set({ 
        selectedLayerIds: ids,
        selectedLayerId: ids.length > 0 ? ids[ids.length - 1] : null
      }),

      selectAllLayers: () => {
        const state = get();
        const allIds = state.layers.map(l => l.id);
        set({ 
          selectedLayerIds: allIds,
          selectedLayerId: allIds.length > 0 ? allIds[allIds.length - 1] : null
        });
      },

      clearSelection: () => set({ selectedLayerId: null, selectedLayerIds: [] }),

      copySelectedLayers: () => {
        const state = get();
        const selectedLayers = state.layers.filter(l => state.selectedLayerIds.includes(l.id));
        if (selectedLayers.length > 0) {
          set({ clipboard: selectedLayers });
          console.log('[Clipboard] 复制了', selectedLayers.length, '个图层');
        }
      },

      pasteLayers: () => {
        const state = get();
        if (state.clipboard.length === 0) return;

        const newLayers = state.clipboard.map(layer => ({
          ...layer,
          id: crypto.randomUUID(),
          x: layer.x + 20,
          y: layer.y + 20,
          title: `${layer.title} (copy)`,
          createdAt: Date.now()
        }));

        set({
          layers: [...state.layers, ...newLayers],
          selectedLayerIds: newLayers.map(l => l.id),
          selectedLayerId: newLayers[newLayers.length - 1]?.id || null,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });

        console.log('[Clipboard] 粘贴了', newLayers.length, '个图层');
      },

      undo: () => {
        const state = get();
        console.log('[Undo] 当前状态:', {
          historyIndex: state.historyIndex,
          historyLength: state.history.length,
          currentLayers: state.layers.length
        });

        if (state.historyIndex < 0) {
          console.log('[Undo] historyIndex < 0，无法撤销');
          return;
        }

        const previousState = state.history[state.historyIndex];
        console.log('[Undo] 恢复到:', {
          targetLayers: previousState.layers.length,
          newIndex: state.historyIndex - 1
        });

        set({
          layers: previousState.layers,
          historyIndex: state.historyIndex - 1
        });
      },

      redo: () => {
        const state = get();
        console.log('[Redo] 当前状态:', {
          historyIndex: state.historyIndex,
          historyLength: state.history.length,
          currentLayers: state.layers.length
        });

        if (state.historyIndex >= state.history.length - 1) {
          console.log('[Redo] 无法重做');
          return;
        }

        const nextState = state.history[state.historyIndex + 1];
        console.log('[Redo] 恢复到:', {
          targetLayers: nextState.layers.length,
          newIndex: state.historyIndex + 1
        });

        set({
          layers: nextState.layers,
          historyIndex: state.historyIndex + 1
        });
      },

      pushHistory: () => {
        const state = get();
        set({
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      clearHistory: () => set({ history: [], historyIndex: -1 }),

      clearCanvas: () => {
        const state = get();
        state.layers.forEach(layer => {
          if (layer.imageId) {
            assetStore.deleteAsset(layer.imageId).catch(console.error);
          }
          if (layer.thumbnailId) {
            assetStore.deleteAsset(layer.thumbnailId).catch(console.error);
          }
        });
        set({
          layers: [],
          selectedLayerId: null,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      importLayers: (layers, replace = false) => {
        const state = get();
        const newLayers = replace ? layers : [...state.layers, ...layers];
        set({
          layers: newLayers,
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });
      },

      exportLayers: () => get().layers,

      toggleLayerLock: (id) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        if (!layer) return;
        state.updateLayer(id, { locked: !layer.locked });
      },

      toggleLayerVisibility: (id) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        if (!layer) return;
        state.updateLayer(id, { visible: layer.visible === false ? true : false });
      },

      setLayerOpacity: (id, opacity) => {
        const state = get();
        state.updateLayer(id, { opacity: Math.max(0, Math.min(1, opacity)) });
      },

      bringToFront: (id) => {
        const state = get();
        const maxZIndex = Math.max(...state.layers.map(l => l.zIndex || 0), 0);
        state.updateLayer(id, { zIndex: maxZIndex + 1 });
      },

      sendToBack: (id) => {
        const state = get();
        const minZIndex = Math.min(...state.layers.map(l => l.zIndex || 0), 0);
        state.updateLayer(id, { zIndex: minZIndex - 1 });
      },

      bringForward: (id) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        if (!layer) return;
        state.updateLayer(id, { zIndex: (layer.zIndex || 0) + 1 });
      },

      sendBackward: (id) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        if (!layer) return;
        state.updateLayer(id, { zIndex: (layer.zIndex || 0) - 1 });
      },

      alignLayers: (layerIds, alignment) => {
        const state = get();
        const layers = state.layers.filter(l => layerIds.includes(l.id));
        if (layers.length < 2) return;

        let targetValue: number;
        switch (alignment) {
          case 'left':
            targetValue = Math.min(...layers.map(l => l.x));
            layers.forEach(l => state.updateLayer(l.id, { x: targetValue }));
            break;
          case 'center':
            targetValue = layers.reduce((sum, l) => sum + l.x + l.width / 2, 0) / layers.length;
            layers.forEach(l => state.updateLayer(l.id, { x: targetValue - l.width / 2 }));
            break;
          case 'right':
            targetValue = Math.max(...layers.map(l => l.x + l.width));
            layers.forEach(l => state.updateLayer(l.id, { x: targetValue - l.width }));
            break;
          case 'top':
            targetValue = Math.min(...layers.map(l => l.y));
            layers.forEach(l => state.updateLayer(l.id, { y: targetValue }));
            break;
          case 'middle':
            targetValue = layers.reduce((sum, l) => sum + l.y + l.height / 2, 0) / layers.length;
            layers.forEach(l => state.updateLayer(l.id, { y: targetValue - l.height / 2 }));
            break;
          case 'bottom':
            targetValue = Math.max(...layers.map(l => l.y + l.height));
            layers.forEach(l => state.updateLayer(l.id, { y: targetValue - l.height }));
            break;
        }
      },

      distributeLayers: (layerIds, direction) => {
        const state = get();
        const layers = state.layers.filter(l => layerIds.includes(l.id));
        if (layers.length < 3) return;

        if (direction === 'horizontal') {
          const sorted = [...layers].sort((a, b) => a.x - b.x);
          const totalWidth = sorted.reduce((sum, l) => sum + l.width, 0);
          const totalSpace = sorted[sorted.length - 1].x + sorted[sorted.length - 1].width - sorted[0].x;
          const gap = (totalSpace - totalWidth) / (sorted.length - 1);
          
          let currentX = sorted[0].x;
          sorted.forEach((l, i) => {
            if (i > 0) {
              state.updateLayer(l.id, { x: currentX });
            }
            currentX += l.width + gap;
          });
        } else {
          const sorted = [...layers].sort((a, b) => a.y - b.y);
          const totalHeight = sorted.reduce((sum, l) => sum + l.height, 0);
          const totalSpace = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height - sorted[0].y;
          const gap = (totalSpace - totalHeight) / (sorted.length - 1);
          
          let currentY = sorted[0].y;
          sorted.forEach((l, i) => {
            if (i > 0) {
              state.updateLayer(l.id, { y: currentY });
            }
            currentY += l.height + gap;
          });
        }
      },

      groupSelectedLayers: () => {
        const state = get();
        const selectedLayers = state.layers.filter(l => state.selectedLayerIds.includes(l.id));
        if (selectedLayers.length < 2) {
          alert('请选择至少两个图层进行分组');
          return;
        }

        const minX = Math.min(...selectedLayers.map(l => l.x));
        const minY = Math.min(...selectedLayers.map(l => l.y));
        const maxX = Math.max(...selectedLayers.map(l => l.x + l.width));
        const maxY = Math.max(...selectedLayers.map(l => l.y + l.height));

        const groupId = crypto.randomUUID();
        const groupLayer: LayerData = {
          id: groupId,
          type: 'group',
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          src: '',
          title: `分组 (${selectedLayers.length}个图层)`,
          color: '#6366f1',
          createdAt: Date.now()
        };

        const updatedLayers = state.layers.map(l => {
          if (state.selectedLayerIds.includes(l.id)) {
            return { ...l, parentId: groupId };
          }
          return l;
        });

        set({
          layers: [...updatedLayers, groupLayer],
          selectedLayerId: groupId,
          selectedLayerIds: [groupId],
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });

        console.log('[Group] 创建分组:', groupId, '包含', selectedLayers.length, '个图层');
      },

      ungroupLayers: (groupId) => {
        const state = get();
        const updatedLayers = state.layers.map(l => {
          if (l.parentId === groupId) {
            return { ...l, parentId: undefined };
          }
          return l;
        }).filter(l => l.id !== groupId);

        set({
          layers: updatedLayers,
          selectedLayerId: null,
          selectedLayerIds: [],
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });

        console.log('[Group] 解散分组:', groupId);
      },

      mergeSelectedLayers: async () => {
        const state = get();
        const selectedLayers = state.layers.filter(l => state.selectedLayerIds.includes(l.id) && l.type === 'image');
        
        if (selectedLayers.length < 2) {
          alert('请选择至少两个图片图层进行合并');
          return;
        }

        const minX = Math.min(...selectedLayers.map(l => l.x));
        const minY = Math.min(...selectedLayers.map(l => l.y));
        const maxX = Math.max(...selectedLayers.map(l => l.x + l.width));
        const maxY = Math.max(...selectedLayers.map(l => l.y + l.height));

        const canvas = document.createElement('canvas');
        canvas.width = maxX - minX;
        canvas.height = maxY - minY;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        for (const layer of selectedLayers) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve) => {
            img.onload = () => {
              ctx.drawImage(img, layer.x - minX, layer.y - minY, layer.width, layer.height);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = layer.src;
          });
        }

        const mergedBase64 = canvas.toDataURL('image/png');
        const mergedLayerId = crypto.randomUUID();

        const mergedLayer: LayerData = {
          id: mergedLayerId,
          type: 'image',
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          src: mergedBase64,
          title: `合并图层 (${selectedLayers.length}个)`,
          createdAt: Date.now()
        };

        const remainingLayers = state.layers.filter(l => !state.selectedLayerIds.includes(l.id));

        set({
          layers: [...remainingLayers, mergedLayer],
          selectedLayerId: mergedLayerId,
          selectedLayerIds: [mergedLayerId],
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });

        console.log('[Merge] 合并图层:', selectedLayers.length, '个');
      },

      searchLayers: (query) => {
        const state = get();
        if (!query.trim()) return [];
        const lowerQuery = query.toLowerCase();
        return state.layers.filter(l => 
          l.title.toLowerCase().includes(lowerQuery) ||
          l.text?.toLowerCase().includes(lowerQuery)
        );
      },

      createPromptLayer: (x, y, mode = 'image-to-image') => {
        const state = get();
        const id = crypto.randomUUID();
        const promptConfig: PromptLayerConfig = {
          prompt: '',
          isEnhanced: false,
          mode,
          aspectRatio: '16:9',
          linkedLayerIds: [],
          outputLayerIds: [],
          nodeColor: PROMPT_MODE_COLORS[mode]
        };

        const layer: PromptLayerData = {
          id,
          type: 'prompt',
          x,
          y,
          width: 280,
          height: 180,
          src: '',
          title: `提示词 - ${mode}`,
          createdAt: Date.now(),
          color: PROMPT_MODE_COLORS[mode],
          promptConfig
        };

        set({
          layers: [...state.layers, layer],
          history: [...state.history.slice(0, state.historyIndex + 1), {
            layers: state.layers,
            timestamp: Date.now()
          }].slice(-MAX_HISTORY),
          historyIndex: state.historyIndex + 1
        });

        return id;
      },

      updatePromptConfig: (id, config) => {
        const state = get();
        const layer = state.layers.find(l => l.id === id);
        if (!layer || layer.type !== 'prompt') return;

        const promptLayer = layer as PromptLayerData;
        const newConfig = { ...promptLayer.promptConfig, ...config };
        
        if (config.mode) {
          newConfig.nodeColor = PROMPT_MODE_COLORS[config.mode];
        }

        const updates: any = { 
          promptConfig: newConfig,
          color: newConfig.nodeColor
        };
        
        if (config.prompt) {
          updates.title = `提示词 - ${config.prompt.slice(0, 20)}`;
        }

        state.updateLayer(id, updates);
      },

      linkLayerToPrompt: (promptId, layerId) => {
        const state = get();
        const promptLayer = state.layers.find(l => l.id === promptId) as PromptLayerData | undefined;
        const targetLayer = state.layers.find(l => l.id === layerId);

        if (!promptLayer || promptLayer.type !== 'prompt') return false;
        if (!targetLayer || targetLayer.type !== 'image') return false;
        if (promptLayer.promptConfig.linkedLayerIds.length >= 5) return false;
        if (promptLayer.promptConfig.linkedLayerIds.includes(layerId)) return false;

        const newLinkedIds = [...promptLayer.promptConfig.linkedLayerIds, layerId];
        state.updatePromptConfig(promptId, { linkedLayerIds: newLinkedIds });
        
        return true;
      },

      unlinkLayerFromPrompt: (promptId, layerId) => {
        const state = get();
        const promptLayer = state.layers.find(l => l.id === promptId) as PromptLayerData | undefined;
        if (!promptLayer || promptLayer.type !== 'prompt') return;

        const newLinkedIds = promptLayer.promptConfig.linkedLayerIds.filter(id => id !== layerId);
        state.updatePromptConfig(promptId, { linkedLayerIds: newLinkedIds });
      },

      getPromptLinkedLayers: (promptId) => {
        const state = get();
        const promptLayer = state.layers.find(l => l.id === promptId) as PromptLayerData | undefined;
        if (!promptLayer || promptLayer.type !== 'prompt') return [];

        return state.layers.filter(l => 
          promptLayer.promptConfig.linkedLayerIds.includes(l.id)
        );
      }
    }),
    {
      name: 'wl-canvas-state',
      partialize: (state) => ({
        layers: state.layers.map(layer => {
          const { src, thumbnail, ...rest } = layer;
          return { ...rest, srcSaved: src ? true : false };
        }),
        offset: state.offset,
        scale: state.scale
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.layers.length > 0) {
          console.log('[Canvas] 恢复图层，重新加载图片...');
          
          Promise.all(state.layers.map(async (layer) => {
            // 处理 image 类型
            if (layer.type === 'image') {
              // 优先使用 imageId
              if (layer.imageId) {
                try {
                  const { imageStorageService } = await import('../../../../services/imageStorageService');
                  const blob = await imageStorageService.getImage(layer.imageId);
                  if (blob) {
                    return { ...layer, src: URL.createObjectURL(blob) };
                  }
                } catch (e) {
                  console.warn('恢复图片失败 (imageId):', layer.id, e);
                }
              }
              // 如果 src 是 local: 格式，从 src 解析
              if (layer.src && layer.src.startsWith('local:')) {
                const localId = layer.src.replace('local:', '');
                try {
                  const { imageStorageService } = await import('../../../../services/imageStorageService');
                  const blob = await imageStorageService.getImage(localId);
                  if (blob) {
                    return { ...layer, src: URL.createObjectURL(blob), imageId: localId };
                  }
                } catch (e) {
                  console.warn('恢复图片失败 (local:):', layer.id, e);
                }
              }
            }
            // 处理 video 类型
            else if (layer.type === 'video' && layer.src && layer.src.startsWith('video:')) {
              try {
                const { videoStorageService } = await import('../../../../services/imageStorageService');
                const videoId = layer.src.replace('video:', '');
                const blob = await videoStorageService.getVideo(videoId);
                if (blob) {
                  return { ...layer, src: URL.createObjectURL(blob) };
                }
              } catch (e) {
                console.warn('恢复视频失败:', layer.id, e);
              }
            }
            // 处理 drawing 类型
            else if (layer.type === 'drawing') {
              if (layer.imageId) {
                try {
                  const { imageStorageService } = await import('../../../../services/imageStorageService');
                  const blob = await imageStorageService.getImage(layer.imageId);
                  if (blob) {
                    return { ...layer, src: URL.createObjectURL(blob) };
                  }
                } catch (e) {
                  console.warn('恢复绘制图层失败:', layer.id, e);
                }
              }
              // 如果 src 是 local: 格式
              if (layer.src && layer.src.startsWith('local:')) {
                const localId = layer.src.replace('local:', '');
                try {
                  const { imageStorageService } = await import('../../../../services/imageStorageService');
                  const blob = await imageStorageService.getImage(localId);
                  if (blob) {
                    return { ...layer, src: URL.createObjectURL(blob), imageId: localId };
                  }
                } catch (e) {
                  console.warn('恢复绘制图层失败 (local:):', layer.id, e);
                }
              }
            }
            return layer;
          })).then(restoredLayers => {
            state.layers = restoredLayers;
            console.log('[Canvas] 图片恢复完成');
          });
        }
      }
    }
  )
);
