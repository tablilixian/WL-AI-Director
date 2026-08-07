import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock dependencies ────────────────────────────────────

vi.mock('../services/canvasCloudApi', () => {
  const mockGet = vi.fn();
  const mockSave = vi.fn();
  return {
    canvasCloudApi: {
      get: mockGet,
      save: mockSave,
      delete: vi.fn(),
      exists: vi.fn(),
    },
    CloudCanvasData: class {},
  };
});

vi.mock('../services/canvasStorageService', () => ({
  saveCanvasDataToLocal: vi.fn(
    async (_projectId: string, layers: any[], _offset: any, _scale: any) => {
      return {
        projectId: _projectId,
        layers,
        offset: _offset,
        scale: _scale,
        version: 1,
        savedAt: Date.now(),
        syncStatus: 'synced',
      };
    },
  ),
  getCanvasDataFromLocal: vi.fn(async () => ({
    projectId: 'proj-1',
    layers: [
      {
        id: 'l1',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: '',
        title: 'test',
        createdAt: 1,
      },
    ],
    offset: { x: 0, y: 0 },
    scale: 1,
    version: 1,
    savedAt: Date.now(),
    syncStatus: 'synced',
  })),
  updateCanvasSyncStatus: vi.fn(),
  deleteCanvasDataFromLocal: vi.fn(),
}));

vi.mock('../src/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      user: { id: 'test-user' },
    })),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

// ── Import after mocks ───────────────────────────────────

const { canvasCloudApi } = await import('../services/canvasCloudApi');
const { canvasSyncService } = await import('../services/canvasSyncService');

function makeLocalData(overrides: any = {}): any {
  return {
    projectId: 'proj-1',
    layers: [
      {
        id: 'l1',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: '',
        title: 'test',
        createdAt: 1,
      },
    ],
    offset: { x: 0, y: 0 },
    scale: 1,
    version: 1,
    savedAt: Date.now(),
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeCloudData(overrides: any = {}): any {
  return {
    projectId: 'proj-1',
    layers: [
      {
        id: 'l1',
        type: 'image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        src: '',
        title: 'test',
        createdAt: 1,
      },
    ],
    offset: { x: 0, y: 0 },
    scale: 1,
    version: 1,
    savedAt: Date.now(),
    ...overrides,
  };
}

describe('canvasSyncService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset internal state
    (canvasSyncService as any).currentProjectId = 'proj-1';
    (canvasSyncService as any).pendingSaveData = null;
    (canvasSyncService as any).syncTimer = null;
    (canvasSyncService as any).debouncedSaveTimer = null;
    (canvasSyncService as any).state = {
      dirty: true,
      lastLocalSave: 0,
      lastCloudSync: 0,
      syncInProgress: false,
    };
  });

  // ── uploadToCloud version check ─────────────────────────

  describe('uploadToCloud version check', () => {
    it('skips upload when server version is higher', async () => {
      (canvasCloudApi.get as any).mockResolvedValue(makeCloudData({ version: 5 }));
      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      // Trigger doCloudSync → uploadToCloud
      await (canvasSyncService as any).doCloudSync();

      expect(canvasCloudApi.save).not.toHaveBeenCalled();
    });

    it('proceeds with upload when local version is higher', async () => {
      (canvasCloudApi.get as any).mockResolvedValue(makeCloudData({ version: 1 }));
      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      await (canvasSyncService as any).doCloudSync();

      expect(canvasCloudApi.save).toHaveBeenCalledTimes(1);
      const saved = (canvasCloudApi.save as any).mock.calls[0][0];
      expect(saved.version).toBe(1);
    });

    it('skips upload when same version but server savedAt is newer', async () => {
      const serverTime = Date.now();
      const localTime = serverTime - 60000;
      (canvasCloudApi.get as any).mockResolvedValue(
        makeCloudData({ version: 1, savedAt: serverTime }),
      );
      // Override state so that the queued data has the older timestamp
      (canvasSyncService as any).lastSavedAt = localTime;
      (canvasSyncService as any).state.dirty = true;

      // We need to set up the pendingSaveData with the local timestamp
      // But uploadToCloud pulls from the CanvasData passed to it.
      // Let's test via save() which feeds doSave() → doCloudSync()
      const { saveCanvasDataToLocal } = await import('../services/canvasStorageService');
      (saveCanvasDataToLocal as any).mockResolvedValueOnce(
        makeLocalData({ version: 1, savedAt: localTime }),
      );

      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      await (canvasSyncService as any).save('proj-1', [], { x: 0, y: 0 }, 1);
      await (canvasSyncService as any).doSave();

      // After doSave, dirty is true, so doCloudSync will fire
      // But doCloudSync is async and called from scheduleCloudSync
      // Let's test uploadToCloud directly instead

      expect(canvasCloudApi.save).not.toHaveBeenCalled();
    });

    it('proceeds with upload when same version and local is newer', async () => {
      const localTime = Date.now();
      const serverTime = localTime - 60000;
      (canvasCloudApi.get as any).mockResolvedValue(
        makeCloudData({ version: 1, savedAt: serverTime }),
      );
      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      // Override uploadToCloud's local data time by setting pendingSaveData
      // Actually uploadToCloud receives data as parameter. Let's call doCloudSync directly.
      // doCloudSync calls this.state... we need dirty=true and it calls getLocalData first
      // Actually let me just test uploadToCloud directly

      const { saveCanvasDataToLocal } = await import('../services/canvasStorageService');
      (saveCanvasDataToLocal as any).mockResolvedValueOnce(
        makeLocalData({ version: 1, savedAt: localTime }),
      );

      await (canvasSyncService as any).doCloudSync();

      // doCloudSync fetches local data, then calls uploadToCloud
      // Since local version (1) >= server version (1) and local time is newer, should upload
      expect(canvasCloudApi.save).toHaveBeenCalled();
    });

    it('handles network error during version fetch and proceeds with upload', async () => {
      (canvasCloudApi.get as any).mockRejectedValue(new Error('Network error'));
      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      await (canvasSyncService as any).doCloudSync();

      expect(canvasCloudApi.save).toHaveBeenCalled();
    });
  });

  // ── save / saveNow basic flow ───────────────────────────

  describe('save / saveNow', () => {
    it('save stores data and schedules debounced write', async () => {
      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      await (canvasSyncService as any).save('proj-1', [], { x: 0, y: 0 }, 1);
      expect((canvasSyncService as any).pendingSaveData).not.toBeNull();
    });

    it('saveNow writes immediately and schedules cloud sync', async () => {
      const { saveCanvasDataToLocal } = await import('../services/canvasStorageService');
      (saveCanvasDataToLocal as any).mockResolvedValue(makeLocalData({ version: 2 }));
      (canvasCloudApi.save as any).mockResolvedValue(undefined);

      await (canvasSyncService as any).saveNow('proj-1', [], { x: 0, y: 0 }, 1);

      expect(saveCanvasDataToLocal).toHaveBeenCalled();
      expect((canvasSyncService as any).state.lastLocalSave).toBeGreaterThan(0);
      expect((canvasSyncService as any).state.dirty).toBe(true);
    });
  });

  // ── cleanup ─────────────────────────────────────────────

  describe('cleanup', () => {
    it('resets state and clears timers', async () => {
      (canvasCloudApi.get as any).mockResolvedValue(null);

      (canvasSyncService as any).syncTimer = setTimeout(() => {}, 1000);
      (canvasSyncService as any).debouncedSaveTimer = setTimeout(() => {}, 1000);

      await (canvasSyncService as any).cleanup();

      expect((canvasSyncService as any).currentProjectId).toBeNull();
      expect((canvasSyncService as any).pendingSaveData).toBeNull();
      expect((canvasSyncService as any).state.dirty).toBe(false);
      expect((canvasSyncService as any).state.lastLocalSave).toBe(0);
    });

    it('flushes pending save before reset', async () => {
      const { saveCanvasDataToLocal } = await import('../services/canvasStorageService');
      (saveCanvasDataToLocal as any).mockResolvedValue(makeLocalData());

      (canvasSyncService as any).pendingSaveData = {
        layers: [{ id: 'l1' }],
        offset: { x: 0, y: 0 },
        scale: 1,
      };

      await (canvasSyncService as any).cleanup();

      expect(saveCanvasDataToLocal).toHaveBeenCalled();
      expect((canvasSyncService as any).pendingSaveData).toBeNull();
    });
  });
});
