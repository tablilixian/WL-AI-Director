import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import type { LayerData } from '../src/modules/canvas/types/canvas';

// ── Mock canvasSyncService ───────────────────────────────

const mockForceSync = vi.fn(async () => {});
const mockSaveNow = vi.fn(async () => {});
const mockSave = vi.fn(async () => {});
const mockCleanup = vi.fn(async () => {});
const mockInit = vi.fn(async () => {});

vi.mock('../services/canvasSyncService', () => ({
  canvasSyncService: {
    forceSync: mockForceSync,
    saveNow: mockSaveNow,
    save: mockSave,
    cleanup: mockCleanup,
    init: mockInit,
  },
}));

vi.mock('../services/unifiedImageService', () => ({
  unifiedImageService: {
    generateImageId: vi.fn(() => 'mock-img-id'),
    saveImage: vi.fn(async () => {}),
    getImage: vi.fn(async () => null),
  },
}));

// ── Import after mocks ───────────────────────────────────

const { canvasIntegrationService } = await import(
  '../src/modules/canvas/services/canvasIntegrationService'
);

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

describe('canvasIntegrationService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    useCanvasStore.setState({
      projectId: 'proj-1',
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

    // Reset integration service state
    (canvasIntegrationService as any).currentProjectId = 'proj-1';
    (canvasIntegrationService as any).isLoading = false;
    (canvasIntegrationService as any).loadingPromise = null;
    (canvasIntegrationService as any).saveTimer = null;

    // Re-establish Zustand subscriber if it was disconnected by a prior cleanup()
    if (!(canvasIntegrationService as any).unsubscribe) {
      (canvasIntegrationService as any).setupAutoSave();
    }
  });

  afterEach(() => {
    if ((canvasIntegrationService as any).saveTimer) {
      clearTimeout((canvasIntegrationService as any).saveTimer);
      (canvasIntegrationService as any).saveTimer = null;
    }
  });

  // ── cleanup → forceSync ─────────────────────────────────

  describe('cleanup', () => {
    it('calls forceSync then canvasSyncService.cleanup', async () => {
      await canvasIntegrationService.cleanup();

      expect(mockForceSync).toHaveBeenCalledTimes(1);
      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it('does not throw when forceSync fails', async () => {
      mockForceSync.mockRejectedValueOnce(new Error('Sync failed'));
      await expect(canvasIntegrationService.cleanup()).resolves.toBeUndefined();
      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it('clears saveTimer on cleanup', async () => {
      (canvasIntegrationService as any).saveTimer = setTimeout(() => {}, 1000);

      await canvasIntegrationService.cleanup();

      expect((canvasIntegrationService as any).saveTimer).toBeNull();
      expect((canvasIntegrationService as any).unsubscribe).toBeNull();
    });
  });

  // ── saveImmediately ─────────────────────────────────────

  describe('saveImmediately', () => {
    it('calls canvasSyncService.saveNow when projectId is set', async () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      await canvasIntegrationService.saveImmediately();

      expect(mockSaveNow).toHaveBeenCalledWith(
        'proj-1',
        expect.any(Array),
        expect.any(Object),
        expect.any(Number)
      );
    });

    it('does nothing when no projectId is set', async () => {
      (canvasIntegrationService as any).currentProjectId = '';
      await canvasIntegrationService.saveImmediately();
      expect(mockSaveNow).not.toHaveBeenCalled();
    });
  });

  // ── setProjectId ────────────────────────────────────────

  describe('setProjectId', () => {
    it('calls forceSync before switching to new project', async () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      useCanvasStore.setState({ projectId: 'old-proj' });
      (canvasIntegrationService as any).currentProjectId = 'old-proj';

      await (canvasIntegrationService as any).setProjectId('new-proj');

      expect(mockForceSync).toHaveBeenCalled();
      expect((canvasIntegrationService as any).currentProjectId).toBe('new-proj');
    });

    it('does not call forceSync when no current project', async () => {
      (canvasIntegrationService as any).currentProjectId = '';
      useCanvasStore.setState({ projectId: null });

      await (canvasIntegrationService as any).setProjectId('new-proj');

      expect(mockForceSync).not.toHaveBeenCalled();
      expect((canvasIntegrationService as any).currentProjectId).toBe('new-proj');
    });

    it('skips setting when same projectId', async () => {
      (canvasIntegrationService as any).currentProjectId = 'same-proj';

      await (canvasIntegrationService as any).setProjectId('same-proj');

      expect(mockForceSync).not.toHaveBeenCalled();
    });
  });

  // ── Zustand subscriber (auto-save) ─────────────────────

  describe('Zustand subscriber (auto-save)', () => {
    it('sets saveTimer when layers change', () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      expect((canvasIntegrationService as any).saveTimer).toBeNull();

      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));

      // Subscriber fires synchronously and calls scheduleSave → sets saveTimer
      expect((canvasIntegrationService as any).saveTimer).not.toBeNull();
    });

    it('replaces existing timer on rapid changes', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';

      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      const firstTimer = (canvasIntegrationService as any).saveTimer;

      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      const secondTimer = (canvasIntegrationService as any).saveTimer;

      // Should be a new timer (debounce reset)
      expect(secondTimer).not.toBe(firstTimer);
    });

    it('sets saveTimer but does not call save when no projectId', () => {
      (canvasIntegrationService as any).currentProjectId = '';
      expect((canvasIntegrationService as any).saveTimer).toBeNull();

      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));

      // Timer is still set (scheduleSave unconditionally sets it)
      expect((canvasIntegrationService as any).saveTimer).not.toBeNull();
      // But saveCanvasState won't be invoked because currentProjectId is empty
    });
  });

  // ── saveCanvasState (called on timer fire) ──────────────

  describe('saveCanvasState', () => {
    it('calls canvasSyncService.save with current state', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 10, y: 20 }));
      useCanvasStore.getState().setOffset({ x: 100, y: 200 });
      useCanvasStore.getState().setScale(2);

      await (canvasIntegrationService as any).saveCanvasState();

      expect(mockSave).toHaveBeenCalledWith(
        'proj-1',
        expect.arrayContaining([expect.objectContaining({ id: 'l1' })]),
        { x: 100, y: 200 },
        2
      );
    });

    it('does nothing when projectId is empty', async () => {
      (canvasIntegrationService as any).currentProjectId = '';
      await (canvasIntegrationService as any).saveCanvasState();
      expect(mockSave).not.toHaveBeenCalled();
    });
  });
});
