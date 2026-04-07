# 项目保存机制与同步策略

## 1. 当前保存机制概述

### 1.1 保存触发点

项目保存有以下几个触发点：

| 触发场景 | 保存方法 | 位置 |
|---------|---------|------|
| **项目内容变化** | 自动保存（hash 检测） | App.tsx useEffect |
| **切换页签** | 强制保存 | App.tsx setStage() |
| **退出项目** | 强制保存 | App.tsx handleExit() |
| **AI 生成完成** | 手动保存 | 各 Stage 组件 |

### 1.2 保存流程

```
用户操作 → hash 变化检测 → 延迟 1s → 调用 hybridStorage.saveProject()
                                                    ↓
                                         1. 递增版本号 (version++)
                                                    ↓
                                         2. 保存到 IndexedDB（本地）
                                                    ↓
                                         3. 保存到 Supabase（云端）
                                                    ↓
                                         4. 返回保存状态
```

---

## 2. 自动保存逻辑（App.tsx）

### 2.1 核心代码

```typescript
// App.tsx - useEffect 监听 project 变化
useEffect(() => {
  if (!project || isExiting || isAIProcessing) return;

  // 首次加载跳过
  if (isFirstLoadRef.current) {
    isFirstLoadRef.current = false;
    lastSavedHashRef.current = computeProjectHash(project);
    return;
  }

  // 计算 hash
  const currentHash = computeProjectHash(project);
  
  // 无变化跳过
  if (currentHash === lastSavedHashRef.current) {
    return;
  }

  // 延迟 1s 后保存
  saveTimeoutRef.current = setTimeout(async () => {
    await hybridStorage.saveProject(project);
    lastSavedHashRef.current = currentHash;
  }, 1000);
}, [project, isExiting]);
```

### 2.2 hash 计算

```typescript
const computeProjectHash = (project: ProjectState | null): string => {
  if (!project) return '';
  const { stage, ...projectWithoutStage } = project;
  const projectString = JSON.stringify(projectWithoutStage);
  // DJB2 hash 算法
  let hash = 0;
  for (let i = 0; i < projectString.length; i++) {
    const char = projectString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};
```

---

## 3. 混合存储服务（hybridStorageService.ts）

### 3.1 保存流程

```typescript
async saveProject(project: ProjectState): Promise<void> {
  // 1. 递增版本号
  const updatedProject = this.incrementVersion(project);

  // 2. 先保存到 IndexedDB（保证离线可用）
  await saveProjectToDB(updatedProject);

  // 3. 如果已登录，同时保存到云端
  if (user) {
    // 使用乐观锁防止冲突
    if (!this.acquireLock(cloudId, project.version || 0)) {
      logger.warn('版本冲突，放弃保存');
      return;
    }
    // upsert 到 Supabase
    await supabase.from('projects').upsert({...});
    this.releaseLock(cloudId);
  }
}
```

### 3.2 存储策略

| 存储位置 | 用途 | 同步方式 |
|---------|------|---------|
| IndexedDB | 本地缓存 | 自动 |
| Supabase | 云端存储 | 实时（保存时） |

---

## 4. 当前存在的问题

### 4.1 频繁同步问题

- **触发条件**：project 对象任何字段变化都会触发保存
- **问题**：画布操作频繁（拖拽、缩放、绘制），会不断触发保存 → 不断同步云端
- **影响**：网络请求过多，用户体验差

### 4.2 画布数据未分离

- 画布数据目前存储在 localStorage（`wl-canvas-backup`）
- 未与项目关联，所有项目共用一个键
- 如果将画布数据放入 ProjectState，会放大频繁同步问题

---

## 5. 优化方案建议

### 5.1 方案 A：分离存储（本地方案）

- **画布数据**：存储在 localStorage/IndexedDB（按项目ID分开）
- **云端同步**：只在切换页签、退出项目时同步
- **优点**：不影响云端同步频率
- **缺点**：画布数据不跟随项目同步（多设备问题）

### 5.2 方案 B：延迟同步方案

- **本地保存**：实时保存到 IndexedDB（无延迟）
- **云端同步**：增加"待同步"标记，定期批量同步
- **优点**：减少网络请求
- **缺点**：实现复杂，可能有数据丢失风险

### 5.3 方案 C：增量同步

- **对比变化**：只同步变化的部分（diff）
- **优点**：减少数据传输量
- **缺点**：实现最复杂，需要版本控制

---

## 6. 待讨论问题

1. **画布数据是否需要跨设备同步？**
   - 如果需要：考虑方案 B 或 C
   - 如果不需要：方案 A 最简单

2. **是否接受画布数据延迟同步？**
   - 即：本地实时保存，云端延迟同步

3. **画布数据大小？**
   - 影响存储方式选择

---

## 7. 相关代码位置

| 文件 | 作用 |
|------|------|
| App.tsx | 项目自动保存逻辑 |
| services/hybridStorageService.ts | 双写存储逻辑 |
| services/storageService.ts | IndexedDB 操作 |
| src/modules/canvas/services/canvasIntegrationService.ts | 画布保存逻辑 |
