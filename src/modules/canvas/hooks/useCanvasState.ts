/**
 * Canvas State Management
 * 使用 Zustand 管理画布状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LayerData, CanvasOffset } from '../types/canvas';
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
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  clearHistory: () => void;
  clearCanvas: () => void;
  importLayers: (layers: LayerData[]) => void;
  exportLayers: () => LayerData[];
  toggleLayerLock: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  alignLayers: (layerIds: string[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeLayers: (layerIds: string[], direction: 'horizontal' | 'vertical') => void;
}

const initialState: CanvasState = {
  layers: [],
  offset: { x: 0, y: 0 },
  scale: 1,
  selectedLayerId: null,
  selectedLayerIds: [],
  history: [],
  historyIndex: -1
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

      clearSelection: () => set({ selectedLayerId: null, selectedLayerIds: [] }),

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

      importLayers: (layers) => {
        const state = get();
        set({
          layers: [...state.layers, ...layers],
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
      }
    }),
    {
      name: 'wl-canvas-state',
      partialize: (state) => ({
        layers: state.layers,
        offset: state.offset,
        scale: state.scale
      })
    }
  )
);
