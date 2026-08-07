import { describe, it, expect, beforeEach } from 'vitest';
import {
  isLikelyPanoramaImage,
  clampFov,
  clampPitch,
  computePanoramaResolution,
  PANORAMA_DEFAULTS,
  VIEW_ANGLE_LABELS,
} from '../src/modules/canvas/utils/panoramaUtils';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import type { PanoramaLayerData, PanoramaCameraState } from '../src/modules/canvas/types/canvas';

function createPanoramaLayer(overrides: Partial<PanoramaLayerData> = {}): PanoramaLayerData {
  return {
    id: crypto.randomUUID(),
    type: 'panorama',
    x: 100,
    y: 100,
    width: 640,
    height: 360,
    src: 'data:image/png;base64,test',
    title: 'test panorama',
    createdAt: Date.now(),
    isPanorama: true,
    ...overrides,
  } as PanoramaLayerData;
}

// ── 1. panoramaUtils ──────────────────────────────────────

describe('panoramaUtils', () => {
  describe('isLikelyPanoramaImage', () => {
    it('detects panorama by filename keywords', () => {
      expect(isLikelyPanoramaImage('room_360.jpg')).toBe(true);
      expect(isLikelyPanoramaImage('全景图.png')).toBe(true);
      expect(isLikelyPanoramaImage('panorama_view.jpg')).toBe(true);
      expect(isLikelyPanoramaImage('equirectangular.png')).toBe(true);
      expect(isLikelyPanoramaImage('spherical_view.jpg')).toBe(true);
      expect(isLikelyPanoramaImage('vr_scene.jpg')).toBe(true);
    });

    it('detects panorama by aspect ratio ~2:1', () => {
      expect(isLikelyPanoramaImage(undefined, 2048, 1024)).toBe(true);
      expect(isLikelyPanoramaImage(undefined, 4000, 2000)).toBe(true);
      expect(isLikelyPanoramaImage(undefined, 1920, 1080)).toBe(false);
      expect(isLikelyPanoramaImage(undefined, 1000, 1000)).toBe(false);
    });

    it('returns false for normal images', () => {
      expect(isLikelyPanoramaImage('cat.jpg', 1920, 1080)).toBe(false);
      expect(isLikelyPanoramaImage('', 800, 600)).toBe(false);
    });

    it('returns false when no data provided', () => {
      expect(isLikelyPanoramaImage()).toBe(false);
    });
  });

  describe('clampFov', () => {
    it('clamps to min/max range', () => {
      expect(clampFov(10)).toBe(PANORAMA_DEFAULTS.fovMin);
      expect(clampFov(200)).toBe(PANORAMA_DEFAULTS.fovMax);
      expect(clampFov(75)).toBe(75);
    });
  });

  describe('clampPitch', () => {
    it('clamps to ±85 degrees', () => {
      expect(clampPitch(-100)).toBe(-85);
      expect(clampPitch(100)).toBe(85);
      expect(clampPitch(30)).toBe(30);
    });
  });

  describe('computePanoramaResolution', () => {
    it('computes 16:9 resolution from long side', () => {
      const res = computePanoramaResolution(1536);
      expect(res.w).toBe(1536);
      expect(res.h).toBe(864);
    });

    it('uses default long side when not specified', () => {
      const res = computePanoramaResolution();
      expect(res.w).toBe(PANORAMA_DEFAULTS.renderLongSide);
    });
  });

  describe('VIEW_ANGLE_LABELS', () => {
    it('has 4 angles for quad mode', () => {
      expect(VIEW_ANGLE_LABELS.quad).toHaveLength(4);
      expect(VIEW_ANGLE_LABELS.quad[0].label).toBe('正面');
      expect(VIEW_ANGLE_LABELS.quad[2].label).toBe('背面');
    });

    it('has 12 angles for dodeca mode', () => {
      expect(VIEW_ANGLE_LABELS.dodeca).toHaveLength(12);
      expect(VIEW_ANGLE_LABELS.dodeca[0].yaw).toBe(0);
      expect(VIEW_ANGLE_LABELS.dodeca[11].yaw).toBe(330);
    });

    it('has custom entry for custom mode', () => {
      expect(VIEW_ANGLE_LABELS.custom).toEqual([]);
    });
  });
});

// ── 2. Panorama Layer CRUD in Store ───────────────────────

describe('Panorama Layer in CanvasStore', () => {
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
      activeTool: 'select',
      strokeColor: '#ffffff',
      strokeWidth: 4,
    });
  });

  it('adds a panorama layer', () => {
    const layer = createPanoramaLayer({ id: 'pano1' });
    useCanvasStore.getState().addLayer(layer);
    const state = useCanvasStore.getState();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].type).toBe('panorama');
  });

  it('supports cameraState on panorama layer', () => {
    const cameraState: PanoramaCameraState = { yaw: 45, pitch: 10, fov: 60 };
    const layer = createPanoramaLayer({ id: 'pano2', cameraState });
    useCanvasStore.getState().addLayer(layer);
    const stored = useCanvasStore.getState().layers[0] as PanoramaLayerData;
    expect(stored.cameraState).toEqual(cameraState);
  });

  it('updates panorama layer properties', () => {
    const layer = createPanoramaLayer({ id: 'pano3' });
    useCanvasStore.getState().addLayer(layer);
    useCanvasStore.getState().updateLayer('pano3', { title: 'updated panorama' });
    const stored = useCanvasStore.getState().layers[0];
    expect(stored.title).toBe('updated panorama');
  });

  it('deletes a panorama layer', () => {
    const layer = createPanoramaLayer({ id: 'pano4' });
    useCanvasStore.getState().addLayer(layer);
    useCanvasStore.getState().deleteLayer('pano4');
    expect(useCanvasStore.getState().layers).toHaveLength(0);
  });

  it('copies and pastes a panorama layer', () => {
    const layer = createPanoramaLayer({ id: 'pano5' });
    useCanvasStore.getState().addLayer(layer);
    useCanvasStore.getState().selectLayer('pano5');
    useCanvasStore.getState().copySelectedLayers();
    useCanvasStore.getState().pasteLayers();
    const state = useCanvasStore.getState();
    expect(state.layers).toHaveLength(2);
    expect(state.layers[1].type).toBe('panorama');
    expect(state.layers[1].id).not.toBe('pano5');
  });

  it('restores panorama layer after undo', () => {
    useCanvasStore.getState().addLayer(createPanoramaLayer({ id: 'pano6' }));
    useCanvasStore.getState().deleteLayer('pano6');
    expect(useCanvasStore.getState().layers).toHaveLength(0);
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().layers).toHaveLength(1);
    expect(useCanvasStore.getState().layers[0].type).toBe('panorama');
  });
});

// ── 3. Layer type discrimination ──────────────────────────

describe('PanoramaLayerData type', () => {
  it('has correct type literal', () => {
    const layer: PanoramaLayerData = createPanoramaLayer();
    expect(layer.type).toBe('panorama');
  });

  it('extends LayerData with panorama-specific fields', () => {
    const layer: PanoramaLayerData = createPanoramaLayer({
      aspectRatio: 2.0,
      cameraState: { yaw: 0, pitch: 0, fov: 75 },
    });
    expect(layer.aspectRatio).toBe(2.0);
    expect(layer.cameraState).toBeDefined();
    expect(layer.x).toBe(100);
    expect(layer.width).toBe(640);
  });
});
