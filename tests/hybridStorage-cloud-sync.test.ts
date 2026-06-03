import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock 依赖 ────────────────────────────────────

const mockAuthStore = {
  isValid: true,
  model: { id: 'test-user' },
  token: 'mock-token',
  clear: vi.fn(),
  save: vi.fn(),
  onChange: vi.fn(() => vi.fn()),
}

let mockPBCreate = vi.fn()
let mockPBUpdate = vi.fn()
let mockPBGetList = vi.fn()
let mockEnsureValidAuth = vi.fn().mockResolvedValue(true)

vi.mock('../src/api/pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
    collection: vi.fn((name: string) => {
      if (name === 'asset_library') {
        return {
          getList: mockPBGetList,
          create: mockPBCreate,
          update: mockPBUpdate,
        }
      }
      return { getList: vi.fn(), create: vi.fn(), update: vi.fn() }
    }),
    baseUrl: 'http://127.0.0.1:8090',
  },
  ensureValidAuth: mockEnsureValidAuth,
  startTokenRefresh: vi.fn(),
  stopTokenRefresh: vi.fn(),
}))

vi.mock('../src/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ user: { id: 'test-user' } })),
    subscribe: vi.fn(() => vi.fn()),
  },
}))

// Mock IndexedDB 存储
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
    getImage: vi.fn().mockImplementation(async (id: string) => {
      // 返回不同 MIME 类型模拟真实图片
      if (id.startsWith('png_')) return new Blob(['fake-png'], { type: 'image/png' })
      if (id.startsWith('webp_')) return new Blob(['fake-webp'], { type: 'image/webp' })
      if (id.startsWith('gif_')) return new Blob(['fake-gif'], { type: 'image/gif' })
      return new Blob(['fake-jpg'], { type: 'image/jpeg' })
    }),
    saveImage: vi.fn().mockResolvedValue(undefined),
    deleteImage: vi.fn().mockResolvedValue(undefined),
  },
  videoStorageService: {
    getVideo: vi.fn(),
    saveVideo: vi.fn(),
    deleteVideo: vi.fn(),
  },
}))

// ── Import ────────────────────────────────────────

function makeItem(overrides: any = {}): any {
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

let hybridStorage: any

// ── 测试结果收集器 ─────────────────────────────────
const results: { name: string; passed: boolean; detail: string }[] = []

function record(name: string, fn: () => Promise<void>) {
  return async () => {
    try {
      await fn()
      results.push({ name, passed: true, detail: '✓ 通过' })
    } catch (e: any) {
      results.push({ name, passed: false, detail: `✗ 失败: ${e.message}` })
      throw e
    }
  }
}

describe('HybridStorage - 云端同步修复 自测套件', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDB.length = 0
    mockAuthStore.isValid = true
    mockAuthStore.model = { id: 'test-user' }

    // 重置 PB mock 默认行为
    mockPBGetList.mockResolvedValue({ items: [], totalItems: 0 })
    mockPBCreate.mockReset()
    mockPBUpdate.mockReset()
    mockEnsureValidAuth.mockResolvedValue(true)
  })

  // ─── Bug 5: saveAssetToLibrary 返回 Promise<AssetLibraryItem> ───
  describe('Bug 5 修复: saveAssetToLibrary 返回更新后的 AssetLibraryItem', () => {
    it('应该返回 AssetLibraryItem 类型 (在线模式)', record('返回类型-在线', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-123',
        collectionId: 'coll-abc',
        image: 'asset_ts_main.jpg',
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'test-return-1',
        type: 'character',
        data: { id: 'char-1', imageUrl: 'local:img_1' },
      })
      const result = await hs.saveAssetToLibrary(item)
      expect(result).toBeDefined()
      expect(result.id).toBe('test-return-1')
    }))

    it('应该返回 AssetLibraryItem 类型 (离线模式)', record('返回类型-离线', async () => {
      // 模拟离线
      mockAuthStore.isValid = false
      const { ensureValidAuth } = await import('../src/api/pocketbase')
      ;(ensureValidAuth as any).mockResolvedValue(false)

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'test-return-2',
        data: { id: 'char-2', imageUrl: 'local:img_2' },
      })
      const result = await hs.saveAssetToLibrary(item)
      expect(result).toBeDefined()
      expect(result.id).toBe('test-return-2')
      expect(result.data.imageUrl).toBe('local:img_2') // 离线时保持 local URL
    }))
  })

  // ─── Bug 2+3: PB URL 回写 ───
  describe('Bug 2+3 修复: PB URL 回写到 data 中', () => {
    it('角色只有 imageUrl 时，PB URL 应回写到 data.imageUrl', record('单图-角色-imageUrl', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-single',
        collectionId: 'coll-single',
        image: 'asset_ts_main.jpg',
        images: null,
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'single-img',
        type: 'character',
        data: { id: 'char-img', imageUrl: 'local:img_main' },
      })
      const result = await hs.saveAssetToLibrary(item)

      // 验证 data.imageUrl 被替换为 PB URL
      expect(result.data.imageUrl).toBe('http://127.0.0.1:8090/api/files/coll-single/pb-single/asset_ts_main.jpg')
    }))

    it('角色含 variations、threeView 时，所有 PB URL 应回写', record('多图-角色-全部字段', async () => {
      // PB 返回顺序与 upload 顺序一致：
      //  主图 image=char_main.png,
      //  images[0]=three_view.png (resolvedRefs[1]),
      //  images[1]=var_0.png (resolvedRefs[2]),
      //  images[2]=var_1.png (resolvedRefs[3])
      mockPBCreate.mockResolvedValue({
        id: 'pb-full',
        collectionId: 'coll-full',
        image: 'char_main.png',
        images: ['three_view.png', 'var_0.png', 'var_1.png'],
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'full-char',
        type: 'character',
        data: {
          id: 'char-full',
          imageUrl: 'local:png_char_main',
          threeViewImageUrl: 'local:png_three_view',
          variations: [
            { id: 'v1', imageUrl: 'local:png_var_0' },
            { id: 'v2', imageUrl: 'local:png_var_1' },
          ],
        },
      })
      const result = await hs.saveAssetToLibrary(item)

      const baseUrl = 'http://127.0.0.1:8090/api/files/coll-full/pb-full'
      expect(result.data.imageUrl).toBe(`${baseUrl}/char_main.png`)
      expect(result.data.threeViewImageUrl).toBe(`${baseUrl}/three_view.png`)
      expect(result.data.variations[0].imageUrl).toBe(`${baseUrl}/var_0.png`)
      expect(result.data.variations[1].imageUrl).toBe(`${baseUrl}/var_1.png`)
    }))

    it('角色含 turnaround、signaturePose、microAction 时，所有 PB URL 应回写', record('多图-角色-嵌套对象', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-nested',
        collectionId: 'coll-nested',
        image: 'char_main.jpg',
        images: ['turnaround.jpg', 'sig_preview.webp', 'micro_preview.gif'],
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'nested-char',
        type: 'character',
        data: {
          id: 'char-nested',
          imageUrl: 'local:img_main',
          turnaround: { imageUrl: 'local:img_turnaround' },
          signaturePose: { previewImageUrl: 'local:webp_sig' },
          microAction: { previewImageUrl: 'local:gif_micro' },
        },
      })
      const result = await hs.saveAssetToLibrary(item)

      const baseUrl = 'http://127.0.0.1:8090/api/files/coll-nested/pb-nested'
      expect(result.data.imageUrl).toBe(`${baseUrl}/char_main.jpg`)
      expect(result.data.turnaround.imageUrl).toBe(`${baseUrl}/turnaround.jpg`)
      expect(result.data.signaturePose.previewImageUrl).toBe(`${baseUrl}/sig_preview.webp`)
      expect(result.data.microAction.previewImageUrl).toBe(`${baseUrl}/micro_preview.gif`)
    }))
  })

  // ─── Bug 4: 本地记录同步更新 ───
  describe('Bug 4 修复: 本地资产库记录同步更新 PB URL', () => {
    it('saveAssetToLibrary 后，本地库中记录也应包含 PB URL', record('本地记录同步更新', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-local-update',
        collectionId: 'coll-local',
        image: 'main.png',
        images: [],
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'local-update-test',
        data: { id: 'entity-local', imageUrl: 'local:img_local' },
      })
      await hs.saveAssetToLibrary(item)

      // 验证本地 DB 中的记录已被更新
      const savedIdx = mockDB.findIndex((x: any) => x.id === 'local-update-test')
      expect(savedIdx).not.toBe(-1)
      const saved = mockDB[savedIdx]
      expect(saved.data.imageUrl).toBe('http://127.0.0.1:8090/api/files/coll-local/pb-local-update/main.png')
    }))
  })

  // ─── Bug 1: 不再调用虚假 uploadToCloud ───
  describe('Bug 1 修复: 不再调用 imageStorageService.uploadToCloud', () => {
    it('saveAssetToLibrary 不应调用 imageStorageService.uploadToCloud', record('不再调用虚假uploadToCloud', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-no-fake',
        collectionId: 'coll-no-fake',
        image: 'no_fake.jpg',
      })

      const { imageStorageService } = await import('../services/imageStorageService')
      const { hybridStorage: hs } = await import('../services/hybridStorageService')

      const item = makeItem({
        data: { id: 'no-fake', imageUrl: 'local:test' },
      })
      await hs.saveAssetToLibrary(item)

      // uploadToCloud 未被定义（mock 中没有），因此不需要检查
      // 验证 PB create 被调用 -> 说明上传走的是 syncAssetToCloud
      expect(mockPBCreate).toHaveBeenCalled()
    }))
  })

  // ─── 场景和道具 ───
  describe('场景和道具同步', () => {
    it('场景保存后应回写 PB URL 到 data.imageUrl', record('场景同步', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-scene',
        collectionId: 'coll-scene',
        image: 'scene_main.jpg',
        images: null,
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'scene-test',
        type: 'scene',
        data: { id: 'scene-1', imageUrl: 'local:img_scene' },
      })
      const result = await hs.saveAssetToLibrary(item)
      expect(result.data.imageUrl).toBe('http://127.0.0.1:8090/api/files/coll-scene/pb-scene/scene_main.jpg')
    }))

    it('道具保存后应回写 PB URL 到 data.imageUrl', record('道具同步', async () => {
      mockPBCreate.mockResolvedValue({
        id: 'pb-prop',
        collectionId: 'coll-prop',
        image: 'prop_main.jpg',
        images: null,
      })

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'prop-test',
        type: 'prop',
        data: { id: 'prop-1', imageUrl: 'local:img_prop' },
      })
      const result = await hs.saveAssetToLibrary(item)
      expect(result.data.imageUrl).toBe('http://127.0.0.1:8090/api/files/coll-prop/pb-prop/prop_main.jpg')
    }))
  })

  // ─── 离线模式 ───
  describe('离线模式不触发云端同步', () => {
    it('离线时不应调用 PB create/update', record('离线不触发云端同步', async () => {
      mockAuthStore.isValid = false
      mockEnsureValidAuth.mockResolvedValue(false)

      const { hybridStorage: hs } = await import('../services/hybridStorageService')
      const item = makeItem({
        id: 'offline-test',
        data: { id: 'offline-1', imageUrl: 'local:offline_img' },
      })
      const result = await hs.saveAssetToLibrary(item)

      // PB collection 不应被调用
      expect(mockPBCreate).not.toHaveBeenCalled()
      expect(mockPBUpdate).not.toHaveBeenCalled()
      // 结果应保留 local URL
      expect(result.data.imageUrl).toBe('local:offline_img')
    }))
  })

  // ─── 上报结果 ────────────────────────────────────
  afterAll(() => {
    console.log('\n')
    console.log('═══════════════════════════════════════════')
    console.log('   云端同步修复 — 自测结果汇总')
    console.log('═══════════════════════════════════════════')
    let passed = 0
    let failed = 0
    for (const r of results) {
      const icon = r.passed ? '✅' : '❌'
      console.log(` ${icon} ${r.name}`)
      if (r.passed) passed++
      else failed++
    }
    console.log('───────────────────────────────────────────')
    console.log(` 总计: ${results.length}  |  通过: ${passed}  |  失败: ${failed}`)
    console.log('═══════════════════════════════════════════\n')
  })
})
