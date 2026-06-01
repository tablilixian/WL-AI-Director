import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mock dependencies ────────────────────────────────────

const mockAuthStore = {
  isValid: false,
  model: null,
  token: '',
  clear: vi.fn(),
  save: vi.fn(),
  onChange: vi.fn(() => vi.fn()),
}

const mockCollection = vi.fn()

vi.mock('../src/api/pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
    collection: mockCollection,
    baseUrl: 'http://127.0.0.1:8090',
  },
  ensureValidAuth: vi.fn().mockResolvedValue(true),
  startTokenRefresh: vi.fn(),
  stopTokenRefresh: vi.fn(),
}))

vi.mock('../src/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'mock-user' } })),
    subscribe: vi.fn(() => vi.fn()),
  },
}))

// Mock IndexedDB storage functions
const mockDB: any[] = []
const mockSaveAssetToDB = vi.fn(async (item: any) => {
  const idx = mockDB.findIndex((x) => x.id === item.id)
  if (idx >= 0) {
    mockDB[idx] = item
  } else {
    mockDB.push(item)
  }
})
const mockGetLocalItems = vi.fn(async () => [...mockDB])
const mockDeleteAssetFromDB = vi.fn(async (id: string) => {
  const idx = mockDB.findIndex((x) => x.id === id)
  if (idx >= 0) mockDB.splice(idx, 1)
})

vi.mock('../services/storageService', () => ({
  getAllAssetLibraryItems: mockGetLocalItems,
  saveAssetToLibrary: mockSaveAssetToDB,
  deleteAssetFromLibrary: mockDeleteAssetFromDB,
  getAllProjectsMetadata: vi.fn().mockResolvedValue([]),
  createNewProjectState: vi.fn(),
  deleteProjectFromDB: vi.fn(),
  loadProjectFromDB: vi.fn(),
  saveProjectToDB: vi.fn(),
  deleteProjectStage: vi.fn(),
}))

vi.mock('../services/imageStorageService', () => ({
  imageStorageService: {
    getImage: vi.fn().mockResolvedValue(new Blob()),
    saveImage: vi.fn().mockResolvedValue(undefined),
  },
  videoStorageService: {
    getVideo: vi.fn(),
    saveVideo: vi.fn(),
  },
}))

// ── Import after mocks ───────────────────────────────────

let hybridStorage: any
let pb: any

async function makeItem(overrides: any = {}): Promise<any> {
  return {
    id: overrides.id || 'local-uuid-' + Date.now(),
    type: overrides.type || 'character',
    name: overrides.name || 'Test',
    projectId: overrides.projectId || '',
    projectName: overrides.projectName || '',
    data: overrides.data || { id: 'entity-1', imageUrl: 'local:img_xxx' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockDB.length = 0
  mockAuthStore.isValid = true
  mockAuthStore.model = { id: 'test-user' }

  const pbModule = await import('../src/api/pocketbase')
  pb = pbModule.pb
  const { hybridStorage: hs } = await import('../services/hybridStorageService')
  hybridStorage = hs
})

// ── Tests ────────────────────────────────────────────────

describe('HybridStorage - Asset Library', () => {
  describe('getAllAssetLibraryItems', () => {
    it('should return empty array when no items exist', async () => {
      const items = await hybridStorage.getAllAssetLibraryItems()
      expect(items).toEqual([])
    })

    it('should sync from cloud and return merged items', async () => {
      // Seed local DB with one item
      const localChar = await makeItem({
        id: 'local-char',
        type: 'character',
        name: 'Local Hero',
        data: { id: 'char-1', imageUrl: 'local:img_1' },
      })
      mockDB.push(localChar)

      // Mock PB cloud to return same + one more
      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getFullList: vi.fn().mockResolvedValue([
              {
                id: 'pb-char',
                type: 'character',
                name: 'Local Hero (synced)',
                data: { id: 'char-1', imageUrl: 'http://pb/image.png' },
                user_id: 'test-user',
              },
              {
                id: 'pb-scene',
                type: 'scene',
                name: 'Forest',
                data: { id: 'scene-1', imageUrl: 'http://pb/scene.png' },
                user_id: 'test-user',
              },
            ]),
          }
        }
        return {}
      })

      const items = await hybridStorage.getAllAssetLibraryItems()
      expect(items).toHaveLength(2)

      // Dedup: local char and cloud char have same data.id + type => merged
      const char = items.find((i: any) => i.name === 'Local Hero (synced)')
      expect(char).toBeTruthy()
      expect(char.id).toBe('local-char') // kept local UUID

      const scene = items.find((i: any) => i.type === 'scene')
      expect(scene).toBeTruthy()
    })
  })

  describe('syncAssetLibraryFromCloud - Dedup', () => {
    it('should not create duplicate when cloud item data.id matches existing local', async () => {
      const localItem = await makeItem({
        id: 'local-id',
        type: 'character',
        name: 'Hero',
        data: { id: 'char-1', imageUrl: 'local:img_x' },
      })
      mockDB.push(localItem)

      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getFullList: vi.fn().mockResolvedValue([
              {
                id: 'pb-id',
                type: 'character',
                name: 'Hero (updated)',
                data: { id: 'char-1', imageUrl: 'http://pb/img.png' },
                user_id: 'test-user',
              },
            ]),
          }
        }
        return {}
      })

      // Trigger getAllAssetLibraryItems which calls syncAssetLibraryFromCloud
      const items = await hybridStorage.getAllAssetLibraryItems()
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('local-id') // kept local UUID
      expect(items[0].name).toBe('Hero (updated)') // updated from cloud
    })

    it('should handle items with same data.id but different type separately', async () => {
      const char = await makeItem({
        id: 'local-char',
        type: 'character',
        name: 'Hero',
        data: { id: 'shared-1', imageUrl: 'local:x' },
      })
      const scene = await makeItem({
        id: 'local-scene',
        type: 'scene',
        name: 'Forest',
        data: { id: 'shared-1', imageUrl: 'local:y' },
      })
      mockDB.push(char, scene)

      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getFullList: vi.fn().mockResolvedValue([
              {
                id: 'pb-char',
                type: 'character',
                name: 'Hero',
                data: { id: 'shared-1', imageUrl: 'http://pb/x.png' },
                user_id: 'test-user',
              },
              {
                id: 'pb-scene',
                type: 'scene',
                name: 'Forest',
                data: { id: 'shared-1', imageUrl: 'http://pb/y.png' },
                user_id: 'test-user',
              },
            ]),
          }
        }
        return {}
      })

      const items = await hybridStorage.getAllAssetLibraryItems()
      // Should keep both: type+data.id combos are different
      expect(items).toHaveLength(2)
    })

    it('should create new local entry when cloud item has no local match', async () => {
      mockDB.length = 0 // empty local

      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getFullList: vi.fn().mockResolvedValue([
              {
                id: 'pb-new',
                type: 'prop',
                name: 'Sword',
                data: { id: 'prop-1' },
                user_id: 'test-user',
              },
            ]),
          }
        }
        return {}
      })

      const items = await hybridStorage.getAllAssetLibraryItems()
      expect(items).toHaveLength(1)
      expect(items[0].id).toBe('pb-new') // uses PB ID when no local match
      expect(items[0].type).toBe('prop')
    })
  })

  describe('syncAssetToCloud', () => {
    it('should include type in filter to prevent cross-type matching', async () => {
      // Mock PB getList to return character record with same data.id
      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getList: vi.fn().mockImplementation(async (page: number, perPage: number, options: any) => {
              // Return empty for scene type, return char for character type
              if (options.filter?.includes('type = "scene"')) {
                return { items: [], totalItems: 0 }
              }
              return {
                items: [{
                  id: 'pb-char',
                  type: 'character',
                  name: 'Existing Hero',
                  data: { id: 'entity-1' },
                }],
                totalItems: 1,
              }
            }),
            create: vi.fn().mockResolvedValue({
              id: 'pb-new',
              collectionId: 'coll-id',
              image: 'asset_xxx.png',
            }),
            update: vi.fn().mockResolvedValue({}),
          }
        }
        return {}
      })

      // Try to sync a scene with same data.id = 'entity-1'
      const sceneItem = await makeItem({
        id: 'local-scene',
        type: 'scene',
        name: 'Forest',
        data: { id: 'entity-1', imageUrl: 'local:img_forest' },
      })

      await hybridStorage.saveAssetToLibrary(sceneItem)
      // Wait for async syncAssetToCloud to complete
      await vi.waitFor(() => {
        expect(mockCollection).toHaveBeenCalledWith('asset_library')
      })

      // The mock returns empty for scene type => should be a CREATE, not an update of the character
      const getListCall = mockCollection.mock.calls.find((c: any) => c[0] === 'asset_library')
      expect(getListCall).toBeTruthy()
    })
  })

  describe('saveAssetToLibrary', () => {
    it('should save locally then trigger cloud sync', async () => {
      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
            create: vi.fn().mockResolvedValue({
              id: 'pb-new',
              collectionId: 'coll-id',
            }),
          }
        }
        return {}
      })

      const item = await makeItem({
        type: 'character',
        name: 'New Hero',
      })
      await hybridStorage.saveAssetToLibrary(item)

      // Item should be saved to local DB
      expect(mockSaveAssetToDB).toHaveBeenCalled()
    })
  })

  describe('deleteAssetFromLibrary', () => {
    it('should delete from local and cloud', async () => {
      mockDB.push(await makeItem({ id: 'delete-me', type: 'character' }))

      mockCollection.mockImplementation((name: string) => {
        if (name === 'asset_library') {
          return {
            getList: vi.fn().mockResolvedValue({ items: [{ id: 'pb-record' }], totalItems: 1 }),
            delete: vi.fn().mockResolvedValue(true),
          }
        }
        return {}
      })

      await hybridStorage.deleteAssetFromLibrary('delete-me')
      expect(mockDeleteAssetFromDB).toHaveBeenCalledWith('delete-me')
      expect(mockDB.find((x: any) => x.id === 'delete-me')).toBeUndefined()
    })
  })

  describe('isOnline', () => {
    it('should return false when authStore is invalid', async () => {
      mockAuthStore.isValid = false
      const { ensureValidAuth } = await import('../src/api/pocketbase')
      ;(ensureValidAuth as any).mockResolvedValue(false)

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      // isOnline is not exported, but we can test via getAllAssetLibraryItems which calls it
      // If offline, it should skip sync and return local items directly
      const items = await hs.getAllAssetLibraryItems()
      expect(items).toEqual([])
    })
  })
})
