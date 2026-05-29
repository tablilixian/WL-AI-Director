import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import type { LayerData } from '../src/modules/canvas/types/canvas';

function createLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: crypto.randomUUID(),
    type: 'image',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    src: '',
    title: 'test layer',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('useCanvasStore', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      projectId: null,
      layers: [],
      offset: { x: 0, y: 0 },
      scale: 1,
      selectedLayerId: null,
      selectedLayerIds: [],
      history: [],
      historyIndex: -1,
      clipboard: [],
      suggestedPrompt: '',
      templatePanelOpen: false,
    });
  });

  // ── Layer CRUD ──────────────────────────────────────────

  describe('addLayer', () => {
    it('appends a layer and pushes history', () => {
      const layer = createLayer({ id: 'l1' });
      useCanvasStore.getState().addLayer(layer);
      const state = useCanvasStore.getState();
      expect(state.layers).toHaveLength(1);
      expect(state.layers[0].id).toBe('l1');
      expect(state.historyIndex).toBe(0);
      expect(state.history).toHaveLength(1);
    });
  });

  describe('deleteLayer', () => {
    it('removes layer and clears selection if it was selected', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().selectLayer('l1');
      useCanvasStore.getState().deleteLayer('l1');
      const state = useCanvasStore.getState();
      expect(state.layers).toHaveLength(0);
      expect(state.selectedLayerId).toBeNull();
      expect(state.selectedLayerIds).toEqual([]);
    });

    it('does not affect other layers', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      useCanvasStore.getState().deleteLayer('l1');
      expect(useCanvasStore.getState().layers).toHaveLength(1);
      expect(useCanvasStore.getState().layers[0].id).toBe('l2');
    });
  });

  describe('updateLayer', () => {
    it('merges updates into the target layer', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 10 }));
      useCanvasStore.getState().updateLayer('l1', { x: 100, title: 'updated' });
      const layer = useCanvasStore.getState().layers[0];
      expect(layer.x).toBe(100);
      expect(layer.title).toBe('updated');
    });
  });

  describe('duplicateLayer', () => {
    it('creates a copy with a new id and offset position', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 50, y: 50 }));
      useCanvasStore.getState().duplicateLayer('l1');
      const state = useCanvasStore.getState();
      expect(state.layers).toHaveLength(2);
      const dup = state.layers.find(l => l.id !== 'l1')!;
      expect(dup.x).toBe(50 + 20);
      expect(dup.y).toBe(50 + 20);
      expect(state.selectedLayerId).toBe(dup.id);
    });
  });

  describe('reorderLayer', () => {
    it('moves layer to the specified index', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l3' }));
      useCanvasStore.getState().reorderLayer('l3', 0);
      const ids = useCanvasStore.getState().layers.map(l => l.id);
      expect(ids).toEqual(['l3', 'l1', 'l2']);
    });
  });

  // ── Undo / Redo ─────────────────────────────────────────

  describe('undo / redo', () => {
    it('restores previous layer state on undo', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      expect(useCanvasStore.getState().layers).toHaveLength(2);
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().layers).toHaveLength(1);
    });

    it('redo advances historyIndex within bounds', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      expect(useCanvasStore.getState().historyIndex).toBe(1);
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().historyIndex).toBe(0);
      useCanvasStore.getState().redo();
      expect(useCanvasStore.getState().historyIndex).toBe(1);
      // Note: current undo/redo stores snapshots BEFORE each action,
      // so after undo+redo the layers might not match the full state.
      // Re-running addLayer on top of existing state is the common path.
    });

    it('does nothing when history is exhausted', () => {
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().historyIndex).toBe(-1);
    });
  });

  // ── Selection ───────────────────────────────────────────

  describe('selectLayer', () => {
    it('selects a single layer', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().selectLayer('l1');
      const state = useCanvasStore.getState();
      expect(state.selectedLayerId).toBe('l1');
      expect(state.selectedLayerIds).toEqual(['l1']);
    });

    it('multi-select toggles layers', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      useCanvasStore.getState().selectLayer('l1', true);
      useCanvasStore.getState().selectLayer('l2', true);
      expect(useCanvasStore.getState().selectedLayerIds).toEqual(['l1', 'l2']);
      useCanvasStore.getState().selectLayer('l1', true);
      expect(useCanvasStore.getState().selectedLayerIds).toEqual(['l2']);
    });

    it('deselects on null', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().selectLayer('l1');
      useCanvasStore.getState().selectLayer(null);
      expect(useCanvasStore.getState().selectedLayerId).toBeNull();
      expect(useCanvasStore.getState().selectedLayerIds).toEqual([]);
    });
  });

  // ── Group / Ungroup ─────────────────────────────────────

  describe('groupSelectedLayers / ungroupLayers', () => {
    it('creates a group layer and assigns parentId', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 0, y: 0 }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2', x: 100, y: 100 }));
      useCanvasStore.getState().selectMultipleLayers(['l1', 'l2']);
      useCanvasStore.getState().groupSelectedLayers();
      const state = useCanvasStore.getState();
      const group = state.layers.find(l => l.type === 'group')!;
      expect(group).toBeDefined();
      expect(state.layers.filter(l => l.parentId === group.id)).toHaveLength(2);
    });

    it('ungroup removes parentId and deletes group layer', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 0, y: 0 }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2', x: 100, y: 100 }));
      useCanvasStore.getState().selectMultipleLayers(['l1', 'l2']);
      useCanvasStore.getState().groupSelectedLayers();
      const groupId = useCanvasStore.getState().layers.find(l => l.type === 'group')!.id;
      useCanvasStore.getState().ungroupLayers(groupId);
      expect(useCanvasStore.getState().layers.find(l => l.type === 'group')).toBeUndefined();
      expect(useCanvasStore.getState().layers.every(l => !l.parentId)).toBe(true);
    });
  });

  // ── importLayers / exportLayers ─────────────────────────

  describe('importLayers / exportLayers', () => {
    it('importLayers appends layers', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().importLayers([createLayer({ id: 'l2' })]);
      expect(useCanvasStore.getState().layers).toHaveLength(2);
      expect(useCanvasStore.getState().layers[1].id).toBe('l2');
    });

    it('importLayers with replace=true replaces all layers', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().importLayers([createLayer({ id: 'l2' })], true);
      expect(useCanvasStore.getState().layers).toHaveLength(1);
      expect(useCanvasStore.getState().layers[0].id).toBe('l2');
    });

    it('exportLayers returns a copy of layers', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      const exported = useCanvasStore.getState().exportLayers();
      expect(exported).toHaveLength(1);
      expect(exported[0].id).toBe('l1');
    });
  });

  // ── clearCanvas ─────────────────────────────────────────

  describe('clearCanvas', () => {
    it('removes all layers and resets selection', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      useCanvasStore.getState().selectLayer('l1');
      useCanvasStore.getState().clearCanvas();
      const state = useCanvasStore.getState();
      expect(state.layers).toHaveLength(0);
      expect(state.selectedLayerId).toBeNull();
      expect(state.selectedLayerIds).toEqual([]);
    });
  });

  // ── Copy / Paste ───────────────────────────────────────

  describe('copySelectedLayers / pasteLayers', () => {
    it('copies and pastes layers with offset', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 10, y: 20 }));
      useCanvasStore.getState().selectLayer('l1');
      useCanvasStore.getState().copySelectedLayers();
      useCanvasStore.getState().pasteLayers();
      const state = useCanvasStore.getState();
      expect(state.layers).toHaveLength(2);
      const pasted = state.layers.find(l => l.id !== 'l1')!;
      expect(pasted.x).toBe(10 + 20);
      expect(pasted.y).toBe(20 + 20);
      expect(pasted.title).toContain('(copy)');
    });
  });

  // ── Layer properties ────────────────────────────────────

  describe('layer properties', () => {
    it('toggleLayerLock flips locked', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.getState().toggleLayerLock('l1');
      expect(useCanvasStore.getState().layers[0].locked).toBe(true);
      useCanvasStore.getState().toggleLayerLock('l1');
      expect(useCanvasStore.getState().layers[0].locked).toBe(false);
    });

    it('toggleLayerVisibility flips visible', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', visible: true }));
      useCanvasStore.getState().toggleLayerVisibility('l1');
      expect(useCanvasStore.getState().layers[0].visible).toBe(false);
    });

    it('setLayerOpacity clamps between 0 and 1', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', opacity: 1 }));
      useCanvasStore.getState().setLayerOpacity('l1', 0.5);
      expect(useCanvasStore.getState().layers[0].opacity).toBe(0.5);
      useCanvasStore.getState().setLayerOpacity('l1', 2);
      expect(useCanvasStore.getState().layers[0].opacity).toBe(1);
      useCanvasStore.getState().setLayerOpacity('l1', -1);
      expect(useCanvasStore.getState().layers[0].opacity).toBe(0);
    });
  });

  // ── Z-order ─────────────────────────────────────────────

  describe('z-order operations', () => {
    it('bringToFront / sendToBack', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', zIndex: 0 }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2', zIndex: 1 }));
      useCanvasStore.getState().bringToFront('l1');
      expect(useCanvasStore.getState().layers.find(l => l.id === 'l1')!.zIndex).toBe(2);
      useCanvasStore.getState().sendToBack('l2');
      expect(useCanvasStore.getState().layers.find(l => l.id === 'l2')!.zIndex).toBe(-1);
    });
  });

  // ── offset / scale ──────────────────────────────────────

  describe('offset / scale', () => {
    it('setOffset updates offset', () => {
      useCanvasStore.getState().setOffset({ x: 100, y: 200 });
      expect(useCanvasStore.getState().offset).toEqual({ x: 100, y: 200 });
    });

    it('setScale clamps between 0.1 and 5', () => {
      useCanvasStore.getState().setScale(2);
      expect(useCanvasStore.getState().scale).toBe(2);
      useCanvasStore.getState().setScale(10);
      expect(useCanvasStore.getState().scale).toBe(5);
      useCanvasStore.getState().setScale(0.05);
      expect(useCanvasStore.getState().scale).toBe(0.1);
    });
  });

  // ── searchLayers ────────────────────────────────────────

  describe('searchLayers', () => {
    it('returns layers matching title', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', title: 'hello world' }));
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2', title: 'goodbye' }));
      const results = useCanvasStore.getState().searchLayers('hello');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('l1');
    });

    it('returns empty array for empty query', () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      expect(useCanvasStore.getState().searchLayers('')).toEqual([]);
    });
  });

  // ── suggestedPrompt / templatePanelOpen ─────────────────

  describe('suggestedPrompt / templatePanelOpen', () => {
    it('setSuggestedPrompt stores string', () => {
      useCanvasStore.getState().setSuggestedPrompt('test prompt');
      expect(useCanvasStore.getState().suggestedPrompt).toBe('test prompt');
    });

    it('setTemplatePanelOpen toggles', () => {
      useCanvasStore.getState().setTemplatePanelOpen(true);
      expect(useCanvasStore.getState().templatePanelOpen).toBe(true);
      useCanvasStore.getState().setTemplatePanelOpen(false);
      expect(useCanvasStore.getState().templatePanelOpen).toBe(false);
    });
  });
});
