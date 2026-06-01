import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mock dependencies ────────────────────────────────────

const mockGet = vi.fn()
const mockSave = vi.fn()

vi.mock('../services/canvasCloudApi', () => ({
  canvasCloudApi: {
    get: mockGet,
    save: mockSave,
    delete: vi.fn(),
    exists: vi.fn(),
  },
}))

const mockGetLocal = vi.fn()
const mockSaveLocal = vi.fn()
const mockUpdateSyncStatus = vi.fn()
const mockDeleteLocal = vi.fn()

vi.mock('../services/canvasStorageService', () => ({
  getCanvasDataFromLocal: (...args: any[]) => mockGetLocal(...args),
  saveCanvasDataToLocal: (...args: any[]) => mockSaveLocal(...args),
  updateCanvasSyncStatus: (...args: any[]) => mockUpdateSyncStatus(...args),
  deleteCanvasDataFromLocal: (...args: any[]) => mockDeleteLocal(...args),
}))

vi.mock('../src/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'test-user' } })),
    subscribe: vi.fn(() => vi.fn()),
  },
}))

// Re-mock logger to prevent noise
vi.mock('../services/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  LogCategory: { CANVAS: 'CANVAS', IMAGE: 'IMAGE', APP: 'APP', STORAGE: 'STORAGE' },
}))

// ── Import after mocks ───────────────────────────────────

let canvasSyncService: any
let ConflictResolution: any

beforeEach(async () => {
  vi.clearAllMocks()

  const mod = await import('../services/canvasSyncService')
  canvasSyncService = mod.canvasSyncService
  ConflictResolution = mod.ConflictResolution

  // Set project ID directly (like existing tests do)
  canvasSyncService.currentProjectId = 'proj-1'
  canvasSyncService.state = {
    dirty: false,
    lastLocalSave: 0,
    lastCloudSync: 0,
    syncInProgress: false,
  }
  canvasSyncService.loadPromise = null
})

afterEach(async () => {
  await canvasSyncService.cleanup()
})

// ── Tests ────────────────────────────────────────────────

describe('CanvasSyncService - Load dedup', () => {
  it('should return same promise on concurrent load() calls', async () => {
    mockGetLocal.mockResolvedValue({
      projectId: 'proj-1',
      layers: [],
      offset: { x: 0, y: 0 },
      scale: 1,
      version: 1,
      savedAt: Date.now(),
      syncStatus: 'synced',
    })
    mockGet.mockResolvedValue(null)

    // Call load() twice concurrently
    const [p1, p2] = await Promise.all([
      canvasSyncService.load(),
      canvasSyncService.load(),
    ])

    expect(p1).not.toBeNull()
    expect(p2).not.toBeNull()
    // Should only have triggered local read ONCE (second reused first promise)
    expect(mockGetLocal).toHaveBeenCalledTimes(1)
  })

  it('should allow a new load after previous one completes', async () => {
    mockGetLocal.mockResolvedValue({
      projectId: 'proj-1',
      layers: [],
      offset: { x: 0, y: 0 },
      scale: 1,
      version: 1,
      savedAt: Date.now(),
      syncStatus: 'synced',
    })
    mockGet.mockResolvedValue(null)

    await canvasSyncService.load()
    expect(mockGetLocal).toHaveBeenCalledTimes(1)

    // Second load after completion should be a fresh call
    await canvasSyncService.load()
    expect(mockGetLocal).toHaveBeenCalledTimes(2)
  })

  it('should return null when no projectId is set', async () => {
    canvasSyncService.currentProjectId = null

    const result = await canvasSyncService.load()
    expect(result).toBeNull()
  })
})

describe('CanvasSyncService - Cleanup', () => {
  it('should reset loadPromise on cleanup', async () => {
    mockGetLocal.mockResolvedValue({
      projectId: 'proj-1',
      layers: [],
      offset: { x: 0, y: 0 },
      scale: 1,
      version: 1,
      savedAt: Date.now(),
      syncStatus: 'synced',
    })
    mockGet.mockResolvedValue(null)

    await canvasSyncService.load()

    // cleanup resets loadPromise
    await canvasSyncService.cleanup()
    expect(canvasSyncService.loadPromise).toBeNull()

    // Re-init and load again
    canvasSyncService.currentProjectId = 'proj-1'
    const result = await canvasSyncService.load()
    expect(result).not.toBeNull()
  })
})
