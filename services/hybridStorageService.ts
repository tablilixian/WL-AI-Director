import { pb, ensureValidAuth } from '../src/api/pocketbase';
import { imageStorageService, videoStorageService } from './imageStorageService';
import type { ProjectState, AssetLibraryItem } from '../types';

import {
  getAllProjectsMetadata,
  deleteProjectFromDB,
  getAllAssetLibraryItems as getLocalAssetLibraryItems,
  deleteAssetFromLibrary as deleteAssetFromDB,
  saveAssetToLibrary as saveAssetToDB,
  loadProjectFromDB,
  saveProjectToDB,
} from './storageService';

class HybridStorageService {
  private async isOnline(): Promise<boolean> {
    if (!pb.authStore.isValid) return false;
    // Verify the token is still fresh — refresh it silently
    const refreshed = await ensureValidAuth();
    logger.info(LogCategory.STORAGE, '[HybridStorage] isOnline:', {
      refreshed,
      hasToken: !!pb.authStore.token,
      hasModel: !!pb.authStore.model,
    });
    return refreshed;
  }

  private async currentUserId(): Promise<string | null> {
    const id = pb.authStore.model?.id || null;
    logger.info(LogCategory.STORAGE, '[HybridStorage] currentUserId:', {
      id,
      modelId: pb.authStore.model?.id,
    });
    return id;
  }

  // ─── 项目 ────────────────────────────────────────

  async getAllProjects(): Promise<ProjectState[]> {
    const all = await getAllProjectsMetadata();
    const userId = await this.currentUserId();
    if (!userId) return [];
    return all.filter((p) => p.userId === userId);
  }

  async getProject(id: string): Promise<ProjectState | null> {
    return loadProjectFromDB(id);
  }

  async saveProject(project: ProjectState): Promise<void> {
    const userId = await this.currentUserId();
    const online = await this.isOnline();
    logger.info(LogCategory.STORAGE, '[HybridStorage] saveProject:', {
      projectId: project.id,
      userId,
      isOnline: online,
      authModelId: pb.authStore.model?.id,
    });
    if (userId && !project.userId) {
      project.userId = userId;
      logger.info(LogCategory.STORAGE, '[HybridStorage] set project.userId =', userId);
    }
    await saveProjectToDB(project);
    if (online) {
      this.syncProjectToCloud(project).catch((err) =>
        logger.error(LogCategory.STORAGE, '[HybridStorage] syncProjectToCloud failed:', err),
      );
    }
  }

  async deleteProject(id: string): Promise<void> {
    // 1. Load project to find local image/video references
    let project: ProjectState | null = null;
    try {
      project = await loadProjectFromDB(id);
    } catch {
      logger.warn(LogCategory.STORAGE, '[HybridStorage] deleteProject: could not load project');
    }

    // 2. Clear canvas in-memory state first (timers, pending saves, currentProjectId)
    await canvasSyncService?.cleanup?.();
    // 3. Delete canvas data from storage (local + cloud)
    await canvasSyncService?.deleteCanvasData?.(id);

    // 4. Delete IndexedDB images and videos belonging to this project
    if (project) {
      const imageIds: string[] = [];
      const videoIds: string[] = [];

      const collectLocalId = (url?: string) => {
        if (url?.startsWith('local:')) imageIds.push(url.substring(6));
      };

      project.scriptData?.characters?.forEach((c) => {
        collectLocalId(c.imageUrl);
        c.variations?.forEach((v) => collectLocalId(v.imageUrl));
      });
      project.scriptData?.scenes?.forEach((s) => collectLocalId(s.imageUrl));
      project.scriptData?.props?.forEach((p) => collectLocalId(p.imageUrl));
      project.shots?.forEach((s) => {
        s.keyframes?.forEach((kf) => collectLocalId(kf.imageUrl));
        if (s.interval?.videoUrl?.startsWith('local:')) {
          videoIds.push(s.interval.videoUrl.substring(6));
        }
      });

      await Promise.allSettled(imageIds.map((imgId) => imageStorageService.deleteImage(imgId)));
      await Promise.allSettled(videoIds.map((vidId) => videoStorageService.deleteVideo(vidId)));
    }

    // 5. Delete project from IndexedDB
    await deleteProjectFromDB(id);

    // 7. Cloud cleanup — 只删项目记录，保留资产库（资产可跨项目共享）
    if (await this.isOnline()) {
      const userId = await this.currentUserId();
      if (!userId) return;
      try {
        const projectRecords = await pb.collection('projects').getList(1, 1, {
          filter: `data.id = "${id}"`,
        });
        if (projectRecords.items.length > 0) {
          await pb.collection('projects').delete(projectRecords.items[0].id);
        }
      } catch (err) {
        logger.error(LogCategory.STORAGE, '[HybridStorage] deleteProject cloud failed:', err);
      }
    }
  }

  // ─── 同步 ────────────────────────────────────────

  async syncFromCloud(): Promise<{ uploaded: number; downloaded: number; conflicts: number }> {
    const userId = await this.currentUserId();
    if (!userId) return { uploaded: 0, downloaded: 0, conflicts: 0 };

    const result = { uploaded: 0, downloaded: 0, conflicts: 0 };
    try {
      const localProjects = await getAllProjectsMetadata();
      const cloudProjects = await pb.collection('projects').getFullList({
        filter: `user_id = "${userId}"`,
      });

      const cloudMap = new Map<string, any>();
      for (const cp of cloudProjects) {
        const item = cp as any;
        if (item.data && item.data.id) {
          cloudMap.set(item.data.id, {
            cloudId: item.id,
            userId: item.user_id,
            data: item.data,
            updated: item.updated,
          });
        }
      }

      const localMap = new Map<string, ProjectState>();
      for (const p of localProjects) {
        localMap.set(p.id, p);
      }

      for (const [localId, cloud] of cloudMap) {
        if (!localMap.has(localId)) {
          const project = cloud.data as ProjectState;
          project.userId = project.userId || cloud.userId;
          await saveProjectToDB(project);
          result.downloaded++;
        }
      }

      for (const [localId, local] of localMap) {
        if (!cloudMap.has(localId) && local.userId === userId) {
          await this.syncProjectToCloud(local);
          result.uploaded++;
        }
      }

      return result;
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[HybridStorage] syncFromCloud failed:', error);
      return result;
    }
  }

  async exportToCloud(): Promise<number> {
    const userId = await this.currentUserId();
    if (!userId) return 0;

    const localProjects = await getAllProjectsMetadata();
    let count = 0;
    for (const project of localProjects) {
      if (project.userId !== userId) continue;
      try {
        await this.syncProjectToCloud(project);
        count++;
      } catch (err) {
        logger.error(LogCategory.STORAGE, '[HybridStorage] exportToCloud failed for project:', [
          project.id,
          err,
        ]);
      }
    }
    return count;
  }

  private async syncProjectToCloud(project: ProjectState): Promise<void> {
    const userId = project.userId || (await this.currentUserId());
    logger.info(LogCategory.STORAGE, '[HybridStorage] syncProjectToCloud:', {
      projectId: project.id,
      userId,
      hasUserField: !!project.userId,
    });
    if (!userId) {
      logger.warn(LogCategory.STORAGE, '[HybridStorage] syncProjectToCloud: no userId, skipping');
      return;
    }
    try {
      const existing = await pb.collection('projects').getList(1, 1, {
        filter: `data.id = "${project.id}"`,
      });
      const body = {
        user_id: userId,
        title: project.title,
        data: { ...project, userId },
        description: project.title,
        status: 'draft',
      };
      logger.info(LogCategory.STORAGE, '[HybridStorage] syncProjectToCloud body:', {
        user_id: body.user_id,
        title: body.title,
        dataId: body.data.id,
      });
      if (existing.items.length > 0) {
        logger.info(
          LogCategory.STORAGE,
          '[HybridStorage] updating existing project:',
          existing.items[0].id,
        );
        await pb.collection('projects').update(existing.items[0].id, body);
      } else {
        logger.info(LogCategory.STORAGE, '[HybridStorage] creating new project');
        await pb.collection('projects').create(body);
      }
      logger.info(LogCategory.STORAGE, '[HybridStorage] syncProjectToCloud success');
    } catch (error) {
      logger.error(LogCategory.STORAGE, '[HybridStorage] syncProjectToCloud failed:', error);
    }
  }

  // ─── 资产库 ──────────────────────────────────────

  async getAllAssetLibraryItems(): Promise<AssetLibraryItem[]> {
    let localItems = await getLocalAssetLibraryItems();
    if (await this.isOnline()) {
      await this.syncAssetLibraryFromCloud();
      localItems = await getLocalAssetLibraryItems();
    }
    // Dedup by type + data.id to avoid mixing same-id across entity types
    const seen = new Set<string>();
    return localItems.filter((item: any) => {
      const key = `${item.type || '?'}:${item.data?.id || item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 保存资产到本地 + 同步到云端
   * 返回保存后的 AssetLibraryItem（含云端 PB URL，如果同步成功）
   */
  async saveAssetToLibrary(item: AssetLibraryItem): Promise<AssetLibraryItem> {
    await saveAssetToDB(item);
    if (await this.isOnline()) {
      try {
        await this.syncAssetToCloud(item);
        // syncAssetToCloud 已更新本地记录中的 PB URL，重新读取
        const items = await getLocalAssetLibraryItems();
        const updated = items.find((i: any) => i.id === item.id);
        return updated || item;
      } catch (err) {
        logger.error(LogCategory.STORAGE, '[HybridStorage] syncAssetToCloud failed:', err);
      }
    }
    return item;
  }

  async deleteAssetFromLibrary(id: string): Promise<void> {
    // 先取本地记录获取 cloudId，用于 PB 删除
    const localItems = await getLocalAssetLibraryItems();
    const localItem = localItems.find((i: any) => i.id === id);
    const cloudId = localItem?.cloudId;

    await deleteAssetFromDB(id);
    if (await this.isOnline()) {
      try {
        if (cloudId) {
          await pb.collection('asset_library').delete(cloudId);
          logger.info(
            LogCategory.STORAGE,
            '[HybridStorage] deleteAssetFromLibrary: deleted cloud by cloudId:',
            cloudId,
          );
        }
      } catch (err) {
        logger.error(
          LogCategory.STORAGE,
          '[HybridStorage] deleteAssetFromLibrary cloud failed:',
          err,
        );
      }
    }
  }

  private async syncAssetLibraryFromCloud(): Promise<void> {
    const userId = await this.currentUserId();
    if (!userId) return;
    try {
      const cloudItems = await pb.collection('asset_library').getFullList({
        filter: `user_id = "${userId}"`,
      });
      const localItems = await getLocalAssetLibraryItems();
      for (const item of cloudItems) {
        const raw = item as any;
        // 优先用 cloudId（PB 记录 ID）匹配
        let existing = localItems.find((a: any) => a.cloudId === raw.id);
        // 降级：无 cloudId 的老记录用 data.id + type 匹配
        if (!existing) {
          const dataId = raw.data?.id;
          const cloudType = raw.type || '?';
          existing = dataId
            ? localItems.find((a: any) => (a.type || '?') === cloudType && a.data?.id === dataId)
            : undefined;
        }
        if (existing) {
          // Update existing local entry with latest cloud data, keeping local id
          await saveAssetToDB({
            ...existing,
            name: raw.name || existing.name,
            type: raw.type || existing.type,
            data: raw.data || existing.data,
            projectId: raw.project_id || existing.projectId || '',
            projectName: raw.project_name || existing.projectName || '',
            cloudId: raw.id, // 补齐 cloudId
            updatedAt: Date.now(),
          } as any);
        } else {
          await saveAssetToDB({
            id: raw.id,
            type: raw.type,
            name: raw.name,
            data: raw.data,
            projectId: raw.project_id || '',
            projectName: raw.project_name || '',
            cloudId: raw.id,
          } as any);
        }
      }
    } catch (err) {
      logger.error(LogCategory.STORAGE, '[HybridStorage] syncAssetLibraryFromCloud failed:', err);
    }
  }

  /**
   * 遍历 dataObj，收集所有 local: 图片引用及其对象路径
   * 支持字段：
   *   imageUrl, threeViewImageUrl,
   *   variations[].imageUrl,
   *   turnaround.imageUrl,
   *   signaturePose.previewImageUrl,
   *   microAction.previewImageUrl
   */
  // PB 真实 schema：主图用单文件字段 `image`，其余所有图片用多文件字段 `images`（maxSelect 20）。
  // 注意：早期错误地使用 image2..image9 独立字段，但 PB 集合并不存在这些字段，
  // 导致 threeView / variations / turnaround 等嵌套图片的 PB URL 永不回写（见自测 hybridStorage-cloud-sync）。
  // 主图路径
  private readonly PRIMARY_IMAGE_PATH = 'imageUrl';
  // 其余图片路径，按顺序对应 PB `images[]` 数组下标
  private readonly SECONDARY_IMAGE_PATHS: string[] = [
    'threeViewImageUrl',
    'turnaround.imageUrl',
    'signaturePose.previewImageUrl',
    'microAction.previewImageUrl',
    'variations.0.imageUrl',
    'variations.1.imageUrl',
    'variations.2.imageUrl',
    'variations.3.imageUrl',
  ];

  /**
   * 根据 . 分隔的路径字符串设置嵌套对象的值
   * 如 setNestedValue(obj, 'variations.0.imageUrl', url)
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (key.match(/^\d+$/)) {
        current = current[parseInt(key, 10)];
      } else {
        current = current[key];
      }
      if (!current) return;
    }
    const lastKey = parts[parts.length - 1];
    if (lastKey.match(/^\d+$/)) {
      current[parseInt(lastKey, 10)] = value;
    } else {
      current[lastKey] = value;
    }
  }

  /**
   * 同步资产到 PocketBase 云端
   *
   * 每个图片对应一个独立的 PB 单文件字段（image / image2 ~ image9），
   * 只上传当前为 local: 的图片，已有 PB 文件的字段不传 → PB 保留原文件。
   */
  private async syncAssetToCloud(item: AssetLibraryItem): Promise<void> {
    const userId = await this.currentUserId();
    if (!userId) return;

    try {
      const itemData = item as any;
      const dataObj = JSON.parse(JSON.stringify(itemData.data || {}));
      const assetType = itemData.type || 'character';

      // 1. 解析主图与多图：收集 local: URL 并解析 blob
      const resolveLocal = async (path: string): Promise<{ path: string; blob: Blob } | null> => {
        const val = this.getNestedValue(dataObj, path);
        if (typeof val === 'string' && val.startsWith('local:')) {
          const blob = await imageStorageService.getImage(val.substring(6));
          if (blob) return { path, blob };
          logger.warn(
            LogCategory.STORAGE,
            `[HybridStorage] syncAssetToCloud: cannot read blob for ${path}`,
          );
        }
        return null;
      };

      const primaryEntry = await resolveLocal(this.PRIMARY_IMAGE_PATH);
      const secondaryEntries: { path: string; blob: Blob }[] = [];
      for (const p of this.SECONDARY_IMAGE_PATHS) {
        const e = await resolveLocal(p);
        if (e) secondaryEntries.push(e);
      }

      // 2. 查找/创建 PB 记录
      //    优先用 cloudId（PB 记录 ID）精确匹配，避免跨项目 data.id 重复误匹配
      let existingId: string | null = null;
      if (itemData.cloudId) {
        try {
          const existingRecord = await pb.collection('asset_library').getOne(itemData.cloudId);
          if (existingRecord?.id) {
            existingId = existingRecord.id;
          }
        } catch {
          /* record no longer exists → will create new */
        }
      }
      if (!existingId) {
        const escapedName = (itemData.name || '').replace(/"/g, '\\"');
        const existing = await pb.collection('asset_library').getList(1, 1, {
          filter: `data.id = "${dataObj.id || item.id}" && data.name = "${escapedName}" && type = "${assetType}"`,
        });
        if (existing.items.length > 0) {
          existingId = existing.items[0].id;
        }
      }

      // 3. 构建 FormData（只 append 有 local: 图片的字段，已有 PB 文件的字段不传 → PB 保留原文件）
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('type', assetType);
      formData.append('name', item.name);
      formData.append('project_name', itemData.projectName || '');
      formData.append('data', JSON.stringify(dataObj));

      const ts = Date.now();
      if (primaryEntry) {
        formData.append(
          'image',
          primaryEntry.blob,
          `asset_${ts}_image.${this.blobExt(primaryEntry.blob)}`,
        );
      }
      for (const entry of secondaryEntries) {
        formData.append(
          'images',
          entry.blob,
          `asset_${ts}_${entry.path}.${this.blobExt(entry.blob)}`,
        );
      }

      // 4. 发送到 PB
      let result: any;
      if (existingId) {
        result = await pb.collection('asset_library').update(existingId, formData);
      } else {
        result = await pb.collection('asset_library').create(formData);
      }

      // 5. 将 PB 返回的文件名写回 dataObj
      //    主图 → result.image；其余 → result.images[]（与上传顺序一致）
      const baseFileUrl = `${pb.baseUrl}/api/files/${result.collectionId}/${result.id}`;
      if (primaryEntry && result.image) {
        const pbUrl = `${baseFileUrl}/${result.image}`;
        this.setNestedValue(dataObj, this.PRIMARY_IMAGE_PATH, pbUrl);
        logger.info(
          LogCategory.STORAGE,
          `[HybridStorage] syncAssetToCloud: ${this.PRIMARY_IMAGE_PATH} -> ${pbUrl}`,
        );
      }
      const secondaryFiles: string[] = result.images || [];
      secondaryEntries.forEach((entry, idx) => {
        const filename = secondaryFiles[idx];
        if (filename) {
          const pbUrl = `${baseFileUrl}/${filename}`;
          this.setNestedValue(dataObj, entry.path, pbUrl);
          logger.info(
            LogCategory.STORAGE,
            `[HybridStorage] syncAssetToCloud: ${entry.path} -> ${pbUrl}`,
          );
        }
      });

      // 6. 更新 PB 记录中的 data JSON（带 PB URL）
      const dataFormData = new FormData();
      dataFormData.append('data', JSON.stringify(dataObj));
      await pb.collection('asset_library').update(result.id, dataFormData);

      // 7. 回存 cloudId 到本地 + 更新 data 中的 PB URL
      itemData.cloudId = result.id;
      itemData.data = dataObj;
      await saveAssetToDB(itemData as AssetLibraryItem);
      logger.info(
        LogCategory.STORAGE,
        `[HybridStorage] syncAssetToCloud success (${existingId ? 'update' : 'create'})`,
      );
    } catch (error: any) {
      if (error?.response) {
        logger.error(
          LogCategory.STORAGE,
          `[HybridStorage] syncAssetToCloud failed: ${error.message}`,
          JSON.stringify(error.response),
        );
      } else {
        logger.error(
          LogCategory.STORAGE,
          `[HybridStorage] syncAssetToCloud failed:`,
          error?.message || error,
        );
      }
    }
  }

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    for (const key of parts) {
      if (current == null) return undefined;
      if (key.match(/^\d+$/)) {
        current = current[parseInt(key, 10)];
      } else {
        current = current[key];
      }
    }
    return current;
  }

  private blobExt(blob: Blob): string {
    return blob.type === 'image/png'
      ? 'png'
      : blob.type === 'image/webp'
        ? 'webp'
        : blob.type === 'image/gif'
          ? 'gif'
          : 'jpg';
  }
}

export const hybridStorage = new HybridStorageService();

export const getAllProjects = () => hybridStorage.getAllProjects();
export const getProject = (id: string) => hybridStorage.getProject(id);
export const saveProject = (project: ProjectState) => hybridStorage.saveProject(project);
export const deleteProject = (id: string) => hybridStorage.deleteProject(id);
export const syncFromCloud = () => hybridStorage.syncFromCloud();
export const exportToCloud = () => hybridStorage.exportToCloud();
export const getAllAssetLibraryItems = () => hybridStorage.getAllAssetLibraryItems();
export const saveAssetToLibrary = (item: AssetLibraryItem): Promise<AssetLibraryItem> =>
  hybridStorage.saveAssetToLibrary(item);
export const deleteAssetFromLibrary = (id: string) => hybridStorage.deleteAssetFromLibrary(id);

import { canvasSyncService } from './canvasSyncService';
import { logger, LogCategory } from './logger.ts';
