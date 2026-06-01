import { pb, ensureValidAuth } from '../src/api/pocketbase'
import { useAuthStore } from '../src/stores/authStore'
import { imageStorageService, videoStorageService } from './imageStorageService'
import type { ProjectState, AssetLibraryItem, Character, Scene, Prop } from '../types'

import {
  getAllProjectsMetadata,
  createNewProjectState,
  deleteProjectFromDB,
  getAllAssetLibraryItems as getLocalAssetLibraryItems,
  deleteAssetFromLibrary as deleteAssetFromDB,
  saveAssetToLibrary as saveAssetToDB,
  loadProjectFromDB,
  saveProjectToDB,
  deleteProjectStage,
} from './storageService'

class HybridStorageService {
  private async isOnline(): Promise<boolean> {
    if (!pb.authStore.isValid) return false
    // Verify the token is still fresh — refresh it silently
    const refreshed = await ensureValidAuth()
    console.log('[HybridStorage] isOnline:', { refreshed, hasToken: !!pb.authStore.token, hasModel: !!pb.authStore.model })
    return refreshed
  }

  private async currentUserId(): Promise<string | null> {
    const id = pb.authStore.model?.id || null
    console.log('[HybridStorage] currentUserId:', { id, modelId: pb.authStore.model?.id })
    return id
  }

  // ─── 项目 ────────────────────────────────────────

  async getAllProjects(): Promise<ProjectState[]> {
    const all = await getAllProjectsMetadata()
    const userId = await this.currentUserId()
    if (!userId) return []
    return all.filter((p) => p.userId === userId)
  }

  async getProject(id: string): Promise<ProjectState | null> {
    return loadProjectFromDB(id)
  }

  async saveProject(project: ProjectState): Promise<void> {
    const userId = await this.currentUserId()
    const online = await this.isOnline()
    console.log('[HybridStorage] saveProject:', { projectId: project.id, userId, isOnline: online, authModelId: pb.authStore.model?.id })
    if (userId && !project.userId) {
      project.userId = userId
      console.log('[HybridStorage] set project.userId =', userId)
    }
    await saveProjectToDB(project)
    if (online) {
      this.syncProjectToCloud(project).catch((err) =>
        console.error('[HybridStorage] syncProjectToCloud failed:', err)
      )
    }
  }

  async deleteProject(id: string): Promise<void> {
    // 1. Load project to find local image/video references
    let project: ProjectState | null = null
    try {
      project = await loadProjectFromDB(id)
    } catch {
      console.warn('[HybridStorage] deleteProject: could not load project')
    }

    // 2. Clear canvas in-memory state first (timers, pending saves, currentProjectId)
    await canvasSyncService?.cleanup?.()
    // 3. Delete canvas data from storage (local + cloud)
    await canvasSyncService?.deleteCanvasData?.(id)

    // 4. Delete IndexedDB images and videos belonging to this project
    if (project) {
      const imageIds: string[] = []
      const videoIds: string[] = []

      const collectLocalId = (url?: string) => {
        if (url?.startsWith('local:')) imageIds.push(url.substring(6))
      }

      project.scriptData?.characters?.forEach((c) => {
        collectLocalId(c.imageUrl)
        c.variations?.forEach((v) => collectLocalId(v.imageUrl))
      })
      project.scriptData?.scenes?.forEach((s) => collectLocalId(s.imageUrl))
      project.scriptData?.props?.forEach((p) => collectLocalId(p.imageUrl))
      project.shots?.forEach((s) => {
        s.keyframes?.forEach((kf) => collectLocalId(kf.imageUrl))
        if (s.interval?.videoUrl?.startsWith('local:')) {
          videoIds.push(s.interval.videoUrl.substring(6))
        }
      })

      await Promise.allSettled(imageIds.map((imgId) => imageStorageService.deleteImage(imgId)))
      await Promise.allSettled(videoIds.map((vidId) => videoStorageService.deleteVideo(vidId)))
    }

    // 5. Delete associated asset library items (local)
    const localAssets = await getLocalAssetLibraryItems()
    const projectAssets = localAssets.filter((a) => a.projectId === id)
    await Promise.allSettled(projectAssets.map((a) => deleteAssetFromDB(a.id)))

    // 6. Delete project from IndexedDB
    await deleteProjectFromDB(id)

    // 7. Cloud cleanup
    if (await this.isOnline()) {
      const userId = await this.currentUserId()
      if (!userId) return
      try {
        // 7a. Delete project from PocketBase (FIXED: data.id instead of id)
        const projectRecords = await pb.collection('projects').getList(1, 1, {
          filter: `data.id = "${id}"`,
        })
        if (projectRecords.items.length > 0) {
          await pb.collection('projects').delete(projectRecords.items[0].id)
        }

        // 7b. Delete associated cloud asset records (also removes uploaded images from file storage)
        for (const asset of projectAssets) {
          const assetRecords = await pb.collection('asset_library').getList(1, 1, {
            filter: `data.id = "${(asset as any).data?.id || asset.id}"`,
          })
          if (assetRecords.items.length > 0) {
            await pb.collection('asset_library').delete(assetRecords.items[0].id)
          }
        }
      } catch (err) {
        console.error('[HybridStorage] deleteProject cloud failed:', err)
      }
    }
  }

  // ─── 同步 ────────────────────────────────────────

  async syncFromCloud(): Promise<{ uploaded: number; downloaded: number; conflicts: number }> {
    const userId = await this.currentUserId()
    if (!userId) return { uploaded: 0, downloaded: 0, conflicts: 0 }

    const result = { uploaded: 0, downloaded: 0, conflicts: 0 }
    try {
      const localProjects = await getAllProjectsMetadata()
      const cloudProjects = await pb.collection('projects').getFullList({
        filter: `user_id = "${userId}"`,
      })

      const cloudMap = new Map<string, any>()
      for (const cp of cloudProjects) {
        const item = cp as any
        if (item.data && item.data.id) {
          cloudMap.set(item.data.id, { cloudId: item.id, userId: item.user_id, data: item.data, updated: item.updated })
        }
      }

      const localMap = new Map<string, ProjectState>()
      for (const p of localProjects) {
        localMap.set(p.id, p)
      }

      for (const [localId, cloud] of cloudMap) {
        if (!localMap.has(localId)) {
          const project = cloud.data as ProjectState
          project.userId = project.userId || cloud.userId
          await saveProjectToDB(project)
          result.downloaded++
        }
      }

      for (const [localId, local] of localMap) {
        if (!cloudMap.has(localId) && local.userId === userId) {
          await this.syncProjectToCloud(local)
          result.uploaded++
        }
      }

      return result
    } catch (error) {
      console.error('[HybridStorage] syncFromCloud failed:', error)
      return result
    }
  }

  async exportToCloud(): Promise<number> {
    const userId = await this.currentUserId()
    if (!userId) return 0

    const localProjects = await getAllProjectsMetadata()
    let count = 0
    for (const project of localProjects) {
      if (project.userId !== userId) continue
      try {
        await this.syncProjectToCloud(project)
        count++
      } catch (err) {
        console.error('[HybridStorage] exportToCloud failed for project:', project.id, err)
      }
    }
    return count
  }

  private async syncProjectToCloud(project: ProjectState): Promise<void> {
    const userId = project.userId || await this.currentUserId()
    console.log('[HybridStorage] syncProjectToCloud:', { projectId: project.id, userId, hasUserField: !!project.userId })
    if (!userId) {
      console.warn('[HybridStorage] syncProjectToCloud: no userId, skipping')
      return
    }
    try {
      const existing = await pb.collection('projects').getList(1, 1, {
        filter: `data.id = "${project.id}"`,
      })
      const body = {
        user_id: userId,
        title: project.title,
        data: { ...project, userId },
        description: project.title,
        status: 'draft',
      }
      console.log('[HybridStorage] syncProjectToCloud body:', { user_id: body.user_id, title: body.title, dataId: body.data.id })
      if (existing.items.length > 0) {
        console.log('[HybridStorage] updating existing project:', existing.items[0].id)
        await pb.collection('projects').update(existing.items[0].id, body)
      } else {
        console.log('[HybridStorage] creating new project')
        await pb.collection('projects').create(body)
      }
      console.log('[HybridStorage] syncProjectToCloud success')
    } catch (error) {
      console.error('[HybridStorage] syncProjectToCloud failed:', error)
    }
  }

  // ─── 资产库 ──────────────────────────────────────

  async getAllAssetLibraryItems(): Promise<AssetLibraryItem[]> {
    let localItems = await getLocalAssetLibraryItems()
    if (await this.isOnline()) {
      await this.syncAssetLibraryFromCloud()
      localItems = await getLocalAssetLibraryItems()
    }
    // Dedup by type + data.id to avoid mixing same-id across entity types
    const seen = new Set<string>()
    return localItems.filter((item: any) => {
      const key = `${item.type || '?'}:${item.data?.id || item.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async saveAssetToLibrary(item: AssetLibraryItem): Promise<void> {
    await saveAssetToDB(item)
    if (await this.isOnline()) {
      this.syncAssetToCloud(item).catch((err) =>
        console.error('[HybridStorage] syncAssetToCloud failed:', err)
      )
    }
  }

  async deleteAssetFromLibrary(id: string): Promise<void> {
    await deleteAssetFromDB(id)
    if (await this.isOnline()) {
      try {
        const records = await pb.collection('asset_library').getList(1, 1, {
          filter: `id = "${id}"`,
        })
        if (records.items.length > 0) {
          await pb.collection('asset_library').delete(records.items[0].id)
        }
      } catch (err) {
        console.error('[HybridStorage] deleteAssetFromLibrary cloud failed:', err)
      }
    }
  }

  private async syncAssetLibraryFromCloud(): Promise<void> {
    const userId = await this.currentUserId()
    if (!userId) return
    try {
      const cloudItems = await pb.collection('asset_library').getFullList({
        filter: `user_id = "${userId}"`,
      })
      const localItems = await getLocalAssetLibraryItems()
      for (const item of cloudItems) {
        const raw = item as any
        const dataId = raw.data?.id
        const cloudType = raw.type || '?'
        // Check if a local item already represents the same asset (same type + data.id)
        const existing = dataId
          ? localItems.find((a: any) => (a.type || '?') === cloudType && a.data?.id === dataId)
          : null
        if (existing) {
          // Update existing local entry with latest cloud data, keeping local id
          await saveAssetToDB({
            ...existing,
            name: raw.name || existing.name,
            type: raw.type || existing.type,
            data: raw.data || existing.data,
            projectId: raw.project_id || existing.projectId || '',
            projectName: raw.project_name || existing.projectName || '',
            updatedAt: Date.now(),
          } as any)
        } else {
          await saveAssetToDB({
            id: raw.id,
            type: raw.type,
            name: raw.name,
            data: raw.data,
            projectId: raw.project_id || '',
            projectName: raw.project_name || '',
          } as any)
        }
      }
    } catch (err) {
      console.error('[HybridStorage] syncAssetLibraryFromCloud failed:', err)
    }
  }

  private async syncAssetToCloud(item: AssetLibraryItem): Promise<void> {
    const userId = await this.currentUserId()
    if (!userId) return
    try {
      const itemData = item as any
      const dataObj = { ...(itemData.data || {}) }
      const imageUrl: string | undefined = dataObj.imageUrl
      let blob: Blob | null = null

      // Get image blob from IndexedDB if local reference
      if (imageUrl && imageUrl.startsWith('local:')) {
        const imageId = imageUrl.substring(6)
        blob = await imageStorageService.getImage(imageId)
      }

      const assetType = itemData.type || 'character'
      const existing = await pb.collection('asset_library').getList(1, 1, {
        filter: `data.id = "${dataObj.id || item.id}" && type = "${assetType}"`,
      })

      const formData = new FormData()
      formData.append('user_id', userId)
      formData.append('type', assetType)
      formData.append('name', item.name)
      // Only include project_id if it looks like a valid PB record ID (15 alphanumeric chars)
      // Local UUIDs (36 chars with hyphens) would cause 400 on relation fields
      if (itemData.projectId && /^[a-z0-9]{15}$/.test(itemData.projectId)) {
        formData.append('project_id', itemData.projectId)
      }
      formData.append('project_name', itemData.projectName || '')
      formData.append('data', JSON.stringify(dataObj))

      if (blob) {
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : blob.type === 'image/gif' ? 'gif' : 'jpg'
        formData.append('image', blob, `asset_${Date.now()}.${ext}`)
      }

      let result: any
      if (existing.items.length > 0) {
        result = await pb.collection('asset_library').update(existing.items[0].id, formData)
      } else {
        result = await pb.collection('asset_library').create(formData)
      }

      // Update local IndexedDB record with PocketBase file URL
      if (blob && result?.image) {
        const pbUrl = `${pb.baseUrl}/api/files/${result.collectionId}/${result.id}/${result.image}`
        dataObj.imageUrl = pbUrl
        itemData.data = dataObj
        await saveAssetToDB(itemData as AssetLibraryItem)
        console.log('[HybridStorage] syncAssetToCloud: updated local imageUrl to PocketBase URL')
      }

      console.log(`[HybridStorage] syncAssetToCloud success (${existing.items.length > 0 ? 'update' : 'create'})`)
    } catch (error: any) {
      // Log full error details including PocketBase response body
      if (error?.response) {
        console.error(`[HybridStorage] syncAssetToCloud failed: ${error.message}`, JSON.stringify(error.response))
      } else {
        console.error(`[HybridStorage] syncAssetToCloud failed:`, error?.message || error)
      }
    }
  }
}

export const hybridStorage = new HybridStorageService()

export const getAllProjects = () => hybridStorage.getAllProjects()
export const getProject = (id: string) => hybridStorage.getProject(id)
export const saveProject = (project: ProjectState) => hybridStorage.saveProject(project)
export const deleteProject = (id: string) => hybridStorage.deleteProject(id)
export const syncFromCloud = () => hybridStorage.syncFromCloud()
export const exportToCloud = () => hybridStorage.exportToCloud()
export const getAllAssetLibraryItems = () => hybridStorage.getAllAssetLibraryItems()
export const saveAssetToLibrary = (item: AssetLibraryItem) => hybridStorage.saveAssetToLibrary(item)
export const deleteAssetFromLibrary = (id: string) => hybridStorage.deleteAssetFromLibrary(id)

import { canvasSyncService } from './canvasSyncService'
