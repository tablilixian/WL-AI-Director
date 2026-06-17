import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCanvasStore } from '../src/modules/canvas/hooks/useCanvasState';
import type { LayerData } from '../src/modules/canvas/types/canvas';

// ── Mock canvasSyncService ───────────────────────────────

const mockForceSync = vi.fn(async () => {});
const mockSaveNow = vi.fn(async () => {});
const mockSave = vi.fn(async () => {});
const mockCleanup = vi.fn(async () => {});
const mockInit = vi.fn(async () => {});
const mockLoad = vi.fn(async () => null);

vi.mock('../services/canvasSyncService', () => ({
  canvasSyncService: {
    forceSync: mockForceSync,
    saveNow: mockSaveNow,
    save: mockSave,
    cleanup: mockCleanup,
    init: mockInit,
    load: mockLoad,
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
      projectId: null as any,
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

    // Clear sessionStorage between tests (no cross-test leakage)
    sessionStorage.clear();

    // Reset integration service state
    (canvasIntegrationService as any).currentProjectId = '';
    (canvasIntegrationService as any).isLoading = false;
    (canvasIntegrationService as any).loadingPromise = null;
    (canvasIntegrationService as any).saveTimer = null;
    (canvasIntegrationService as any).unsubscribe = null;
    (canvasIntegrationService as any).pendingSave = Promise.resolve();
    (canvasIntegrationService as any).exitPromise = null;
  });

  afterEach(() => {
    if ((canvasIntegrationService as any).saveTimer) {
      clearTimeout((canvasIntegrationService as any).saveTimer);
      (canvasIntegrationService as any).saveTimer = null;
    }
  });

  // ── enter / exit ───────────────────────────────────────

  describe('enter / exit lifecycle', () => {
    it('enter sets projectId, setups auto-save and beforeunload', async () => {
      await canvasIntegrationService.enter('proj-1');

      expect((canvasIntegrationService as any).currentProjectId).toBe('proj-1');
      expect(mockInit).toHaveBeenCalledWith('proj-1');
      expect((canvasIntegrationService as any).unsubscribe).not.toBeNull();
    });

    it('enter skips when already in the same project', async () => {
      await canvasIntegrationService.enter('proj-1');
      vi.clearAllMocks();

      await canvasIntegrationService.enter('proj-1');

      expect(mockInit).not.toHaveBeenCalled();
    });

    it('enter auto-exits previous project first', async () => {
      // Manually set up first project
      (canvasIntegrationService as any).currentProjectId = 'old-proj';

      await canvasIntegrationService.enter('new-proj');

      expect(mockForceSync).toHaveBeenCalled();
      expect((canvasIntegrationService as any).currentProjectId).toBe('new-proj');
    });

    it('enter loads canvas data from sync service', async () => {
      mockLoad.mockResolvedValueOnce({
        projectId: 'proj-1',
        layers: [],
        offset: { x: 0, y: 0 },
        scale: 1,
        savedAt: Date.now(),
        version: 2,
        syncStatus: 'synced',
      });

      await canvasIntegrationService.enter('proj-1');

      expect(mockLoad).toHaveBeenCalled();
    });

    it('exit calls forceSync, cleanup, and clears projectId', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();

      await canvasIntegrationService.exit();

      expect((canvasIntegrationService as any).currentProjectId).toBe('');
      expect((canvasIntegrationService as any).unsubscribe).toBeNull();
      expect(mockForceSync).toHaveBeenCalled();
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('exit is idempotent (multiple calls safe)', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();

      await canvasIntegrationService.exit();
      mockForceSync.mockClear();
      mockCleanup.mockClear();

      await canvasIntegrationService.exit();
      expect(mockForceSync).not.toHaveBeenCalled();
      expect(mockCleanup).not.toHaveBeenCalled();
    });

    it('exit waits for pending saves in queue', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();

      // Enqueue a slow save
      let slowSaveResolve: () => void = () => {};
      const slowSave = new Promise<void>(resolve => { slowSaveResolve = resolve; });
      const saveInQueue = vi.fn(async () => { await slowSave; });
      const queued = (canvasIntegrationService as any).enqueueSave(saveInQueue);

      // Start exit (will wait for queue)
      const exitPromise = canvasIntegrationService.exit();

      // Queue is still processing the slow save, exit should be waiting
      await expect(Promise.race([exitPromise, Promise.resolve('still-waiting')])).resolves.toBe('still-waiting');

      // Complete the slow save
      slowSaveResolve();
      await queued;
      await exitPromise;

      expect(mockForceSync).toHaveBeenCalled();
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('setProjectId delegates to enter', async () => {
      vi.spyOn(canvasIntegrationService, 'enter');

      await canvasIntegrationService.setProjectId('proj-1');

      expect(canvasIntegrationService.enter).toHaveBeenCalledWith('proj-1');
    });

    it('enter clears Zustand store before loading, so stale data from previous project does not leak', async () => {
      // 模拟首次进入 proj-a 时有旧数据
      useCanvasStore.getState().addLayer(createLayer({ id: 'stale-layer', x: 999 }));
      expect(useCanvasStore.getState().layers.length).toBe(1);

      // 进入新项目（load 返回 null → 无数据）
      mockLoad.mockResolvedValueOnce(null);
      await canvasIntegrationService.enter('proj-b');

      // store 应该被清空，而不是残留 proj-a 的图层
      expect(useCanvasStore.getState().layers.length).toBe(0);
    });

    it('exit clears Zustand store after backup', async () => {
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();

      await canvasIntegrationService.exit();

      // exit 应在备份后清空 store
      expect(useCanvasStore.getState().layers.length).toBe(0);
    });

    it('switching projects does not leak layers between them', async () => {
      // 进入 proj-a，有 2 个图层
      mockLoad.mockResolvedValueOnce({
        projectId: 'proj-a',
        layers: [createLayer({ id: 'a1' }), createLayer({ id: 'a2' })],
        offset: { x: 0, y: 0 },
        scale: 1,
        savedAt: Date.now(),
        version: 2,
        syncStatus: 'synced',
      });
      await canvasIntegrationService.enter('proj-a');
      expect(useCanvasStore.getState().layers.length).toBe(2);

      // 进入 proj-b，有 1 个图层
      mockLoad.mockResolvedValueOnce({
        projectId: 'proj-b',
        layers: [createLayer({ id: 'b1' })],
        offset: { x: 0, y: 0 },
        scale: 1,
        savedAt: Date.now(),
        version: 2,
        syncStatus: 'synced',
      });
      await canvasIntegrationService.enter('proj-b');

      // store 应该是 proj-b 的 1 个图层，不是 proj-a 的 2 个
      expect(useCanvasStore.getState().layers.length).toBe(1);
      expect(useCanvasStore.getState().layers[0].id).toBe('b1');
    });
  });

  // ── cleanup (legacy interface delegates to exit) ───────

  describe('cleanup (legacy)', () => {
    it('delegates to exit, which calls forceSync then cleanup', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();

      await canvasIntegrationService.cleanup();

      expect(mockForceSync).toHaveBeenCalledTimes(1);
      expect(mockCleanup).toHaveBeenCalledTimes(1);
      expect((canvasIntegrationService as any).currentProjectId).toBe('');
    });

    it('does not throw when forceSync fails', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();
      mockForceSync.mockRejectedValueOnce(new Error('Sync failed'));

      await expect(canvasIntegrationService.cleanup()).resolves.toBeUndefined();
      // forceSync failed but cleanup should still run
      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it('clears saveTimer on cleanup', async () => {
      (canvasIntegrationService as any).currentProjectId = 'proj-1';
      (canvasIntegrationService as any).unsubscribe = vi.fn();
      (canvasIntegrationService as any).saveTimer = setTimeout(() => {}, 1000);

      await canvasIntegrationService.cleanup();

      expect((canvasIntegrationService as any).saveTimer).toBeNull();
    });
  });

  // ── saveImmediately ─────────────────────────────────────

  describe('saveImmediately', () => {
    it('calls canvasSyncService.saveNow when projectId is set', async () => {
      await canvasIntegrationService.enter('proj-1');
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
      await canvasIntegrationService.saveImmediately();
      expect(mockSaveNow).not.toHaveBeenCalled();
    });
  });

  // ── Zustand subscriber (auto-save) ─────────────────────

  describe('Zustand subscriber (auto-save)', () => {
    it('sets saveTimer when layers change', async () => {
      await canvasIntegrationService.enter('proj-1');

      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));

      // The subscriber fires synchronously on addLayer → scheduleSave sets timer
      await vi.waitFor(() => {
        expect((canvasIntegrationService as any).saveTimer).not.toBeNull();
      });
    });

    it('replaces existing timer on rapid changes', async () => {
      await canvasIntegrationService.enter('proj-1');

      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      const firstTimer = (canvasIntegrationService as any).saveTimer;

      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));
      const secondTimer = (canvasIntegrationService as any).saveTimer;

      expect(secondTimer).not.toBe(firstTimer);
    });

    it('sets saveTimer but does not call save when no projectId', () => {
      (canvasIntegrationService as any).currentProjectId = '';
      (canvasIntegrationService as any).setupAutoSave();

      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));

      expect((canvasIntegrationService as any).saveTimer).not.toBeNull();
    });
  });

  // ── saveCanvasState (called on timer fire) ──────────────

  describe('saveCanvasState', () => {
    it('calls canvasSyncService.save with current state', async () => {
      await canvasIntegrationService.enter('proj-1');
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
      await (canvasIntegrationService as any).saveCanvasState();
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  // ── clearCanvas ─────────────────────────────────────────

  describe('clearCanvas', () => {
    it('persists empty layers to IndexedDB via saveNow', async () => {
      await canvasIntegrationService.enter('proj-1');
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));
      expect(useCanvasStore.getState().layers.length).toBe(1);

      await canvasIntegrationService.clearCanvas();

      expect(useCanvasStore.getState().layers.length).toBe(0);
      expect(mockSaveNow).toHaveBeenCalledWith(
        'proj-1',
        [],
        expect.any(Object),
        expect.any(Number)
      );
    });

    it('is serialized through the save queue (no race with undo)', async () => {
      await canvasIntegrationService.enter('proj-1');
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));

      // clearCanvas enqueues -> saveNow([])
      // If undo happened during queue, it would be queued AFTER clear
      const clearPromise = canvasIntegrationService.clearCanvas();
      
      // Simulate undo (adds layer back)
      useCanvasStore.getState().addLayer(createLayer({ id: 'l2' }));

      await clearPromise;

      // saveNow must have been called with empty array (clear won before undo's save)
      expect(mockSaveNow).toHaveBeenLastCalledWith(
        expect.any(String),
        [],
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  // ── Save queue ──────────────────────────────────────────

  describe('save queue', () => {
    it('serializes concurrent save requests', async () => {
      await canvasIntegrationService.enter('proj-1');

      const executionOrder: string[] = [];
      const enqueueSave = (canvasIntegrationService as any).enqueueSave as ReturnType<typeof vi.fn>;

      await (canvasIntegrationService as any).enqueueSave(async () => {
        executionOrder.push('a');
      });
      await (canvasIntegrationService as any).enqueueSave(async () => {
        executionOrder.push('b');
      });

      expect(executionOrder).toEqual(['a', 'b']);
    });

    it('does not skip subsequent saves when one fails', async () => {
      await canvasIntegrationService.enter('proj-1');

      const executionOrder: string[] = [];

      const a = (canvasIntegrationService as any).enqueueSave(async () => {
        executionOrder.push('a');
        throw new Error('fail');
      });

      const b = (canvasIntegrationService as any).enqueueSave(async () => {
        executionOrder.push('b');
      });

      await expect(a).rejects.toThrow('fail');
      await b;
      expect(executionOrder).toEqual(['a', 'b']);
    });
  });

  // ── sessionStorage backup ───────────────────────────────

  describe('sessionStorage backup', () => {
    it('backupToSessionStorage stores canvas data', async () => {
      await canvasIntegrationService.enter('proj-1');
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1' }));

      (canvasIntegrationService as any).backupToSessionStorage('proj-1');

      const raw = sessionStorage.getItem('canvas-backup:proj-1');
      expect(raw).not.toBeNull();
      const data = JSON.parse(raw!);
      expect(data.projectId).toBe('proj-1');
      expect(data.layers.length).toBe(1);
    });

    it('restoreSessionBackup recovers and removes backup', async () => {
      await canvasIntegrationService.enter('proj-1');
      useCanvasStore.getState().addLayer(createLayer({ id: 'l1', x: 42, y: 99 }));

      // Write backup
      (canvasIntegrationService as any).backupToSessionStorage('proj-1');

      // Clear layers
      useCanvasStore.getState().clearCanvas();

      // Restore
      const restored = (canvasIntegrationService as any).restoreSessionBackup('proj-1');
      expect(restored).not.toBeNull();
      expect(restored.layers.length).toBe(1);
      expect(restored.layers[0].x).toBe(42);
      expect(restored.layers[0].y).toBe(99);

      // Backup should be removed
      expect(sessionStorage.getItem('canvas-backup:proj-1')).toBeNull();
    });

    it('ignores expired backups (>10 min)', async () => {
      const oldData = JSON.stringify({
        projectId: 'proj-1',
        layers: [],
        offset: { x: 0, y: 0 },
        scale: 1,
        savedAt: Date.now() - 11 * 60 * 1000,
        version: 2,
        syncStatus: 'synced',
      });
      sessionStorage.setItem('canvas-backup:proj-1', oldData);

      const result = (canvasIntegrationService as any).restoreSessionBackup('proj-1');
      expect(result).toBeNull();
    });
  });

  // ── forceSync ───────────────────────────────────────────

  describe('forceSync', () => {
    it('goes through save queue then calls forceSync', async () => {
      await canvasIntegrationService.enter('proj-1');

      await canvasIntegrationService.forceSync();

      expect(mockForceSync).toHaveBeenCalled();
    });
  });
});
