---
title: 画布保存/加载生命周期规范
category: arch
status: active
audience: developer
created: 2026-06-17
updated: 2026-06-17
---

# 画布保存/加载生命周期规范

## 1. 概述

本文档描述 WL AI Director 画布模块的保存/加载架构，涵盖：

- 数据流全景
- 生命周期（`enter` / `exit`）
- 保存队列串行化机制
- sessionStorage 同步备份（防浏览器关闭丢数据）
- 现有数据丢失风险及修复

核心服务文件：`src/modules/canvas/services/canvasIntegrationService.ts`

---

## 2. 数据流全景

```
┌─────────────────────────────────────────────────────────┐
│                    用户操作/程序调用                       │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
   ┌──────────────────────┐   ┌──────────────────────┐
   │  Zustand Store        │   │  saveImmediately()   │
   │  (useCanvasState)     │   │  clearCanvas()       │
   │  layers / offset/scale│   │  forceSync()         │
   └──────┬───────────────┘   └──────┬───────────────┘
          │ subscribe                │
          ▼                          ▼
   ┌─────────────────────────────────────────────────────┐
   │             保存队列 (pendingSave chain)               │
   │  所有写操作串行化：下一个必须等上一个完成                │
   └──────────────────────┬──────────────────────────────┘
                          │
                          ▼
   ┌─────────────────────────────────────────────────────┐
   │              canvasSyncService                       │
   │  本地: save() / saveNow() → canvasStorageService    │
   │  云端: forceSync()  → canvasCloudApi                 │
   └──────────────────────┬──────────────────────────────┘
                          │
                          ▼
               ┌──────────────────────┐
               │     IndexedDB         │
               │  (CANVAS_DATA store)  │
               └──────────────────────┘
```

所有写操作的入口：

| 入口 | 触发方式 | 防抖 | 说明 |
|---|---|---|---|
| Zustand subscriber | store 变化 | 1000ms | 自动保存，设计上允许丢少量数据 |
| `saveImmediately` | 手动调用 | 无 | 关键节点的即时保存 |
| `clearCanvas` | 清空画布 | 无 | 清空入队列，等待前序保存完成 |
| `forceSync` | 手动调用 | 无 | 保存+云同步 |
| `beforeunload` | 页面关闭 | 无 | 最佳努力 + sessionStorage 兜底 |
| `exit()` | 退出项目 | 无 | 完整退出流程 |

---

## 3. 生命周期：`enter()` / `exit()`

### 3.1 设计原则

- **成对调用**：`enter(projectId)` 与 `exit()` 必须配对
- **自动清理**：`enter()` 检测到已有活动项目时，自动先调用 `exit()`
- **幂等性**：`exit()` 多次调用安全（无活动项目时直接返回）
- **dedup**: `exit()` 使用 `exitPromise` 防止并发执行

### 3.2 `enter(projectId)` 执行顺序

```
enter(projectId)
  ├── 空 projectId → 跳过
  ├── 已在该项目中 → 跳过
  ├── 等待正在执行的 exit() 完成（exitPromise guard）
  ├── 有活动项目 → await exit()
  │
  ├── currentProjectId = projectId
  ├── isLoading = true
  │
  └── loadingPromise:
       ├── 1. 清空 Zustand store（importLayers([], true)）
       ├── 2. setupAutoSave()    ← 订阅 store 变化
       ├── 3. setupBeforeUnload() ← 注册页面关闭事件
       ├── 4. canvasSyncService.init(projectId)
       ├── 5. setStoreProjectId(projectId)
       │
       ├── 6. 检查 sessionStorage 备份
       │     └── 有 → importCanvasData(backup) → return
       │
       └── 7. _restoreCanvasState()
             ├── canvasSyncService.load()
             │     ├── IndexedDB 读取
             │     ├── 云端拉取 + 冲突解决
             │     └── 返回 CanvasData | null
             └── importCanvasData(canvasData)
                   ├── 恢复图层(imageId → blob URL)
                   ├── 恢复 offset/scale
                   └── importLayers(restoredLayers, true)
```

安全边界：

- **清空 store 在 setupAutoSave 之前**：确保 `prevLayers` 捕获空状态，不会因清空触发 auto-save
- **isLoading 阻止 auto-save**：`saveCanvasState()` 和 `doImmediateSave()` 在 `isLoading=true` 时跳过
- **sessionStorage 备份优先**：如果 beforeunload 时 IndexedDB 写入未完成，备份数据不会丢失

### 3.3 `exit()` 执行顺序

```
exit()
  ├── 无活动项目 → 返回
  ├── exitPromise 已存在 → 复用（dedup）
  │
  └── exitPromise:
       ├── 1. currentProjectId = ''     ← 后续所有保存变为 no-op
       ├── 2. backupToSessionStorage()   ← 同步备份（在清空 store 之前）
       ├── 3. importLayers([], true)     ← 清空 Zustand store
       ├── 4. clearTimeout(saveTimer)
       ├── 5. teardownAutoSave()         ← 取消 Zustand 订阅
       ├── 6. teardownBeforeUnload()     ← 移除 beforeunload 监听
       │
       └── 7. enqueueSave → await
             ├── canvasSyncService.forceSync()  ← 保存+云同步
             ├── canvasSyncService.cleanup()     ← 重置 sync 状态
             └── （forceSync 失败时仍执行 cleanup）
```

安全边界：

- **先切断 projectId**：第 1 步后，任何后续 `saveImmediately`/auto-save 变为空操作
- **备份在清空 store 之前**：确保 sessionStorage 备份的是完整数据
- **await 队列排空**：退出前等待所有未完成的保存写入完成

### 3.4 调用方

| 场景 | 调用的 API | 说明 |
|---|---|---|
| `handleOpenProject` | `setProjectId(id)` → `enter(id)` | 打开项目时加载画布数据 |
| `setStage` | `setProjectId(id)` → `enter(id)` | 切换阶段时确保 project 状态一致 |
| `handleExitProject` | `exit()` + `hybridStorage.saveProject()` | 退出项目时完整退出 |
| StageCanvas mount | 无操作 | 数据已在 enter 时加载到 store |
| StageCanvas unmount | 无操作 | exit() 统一清理 |

---

## 4. 保存队列

### 4.1 实现

```typescript
private pendingSave: Promise<void> = Promise.resolve();

private enqueueSave<T>(fn: () => Promise<T>): Promise<T> {
  const prev = this.pendingSave;
  // 前一个完成后执行，失败时也继续（不 skip）
  const next = prev.then(() => fn(), () => fn());
  // 链始终保持 resolved，不受单个失败影响
  this.pendingSave = next.then(() => {}, () => {});
  return next;
}
```

### 4.2 原理

```
时间:
  enqueueSave(A) → pendingSave = Promise.resolve()
                     ↓
                    A 开始执行
                     ↓
  enqueueSave(B) → pendingSave = A 的 Promise
                     ↓
                    等 A 完成 → B 开始
                     ↓
  enqueueSave(C) → pendingSave = B 的 Promise
                     ↓
                    等 B 完成 → C 开始
```

所有写操作（auto-save、saveImmediately、clearCanvas、forceSync）都通过 `enqueueSave` 串行化，彻底消除竞态。

### 4.3 修复的竞态

| 场景 | 问题 | 修复方式 |
|---|---|---|
| auto-save + saveImmediately 交叉 | 两者同时写 IndexedDB | 队列串行化 |
| clearCanvas + undo 竞态 | 清空保存空数据，undo 恢复旧数据 | clear 入队列，undo 触发的 auto-save 等 clear 完成 |
| beforeunload + auto-save 冲突 | 两个 handler 同时保存 | beforeunload 统一注册，通过队列串行 |
| 退出时正在保存 | cleanup 时写入未完成 | exit() 先 await 队列排空 |

---

## 5. sessionStorage 同步备份

### 5.1 为什么需要

`beforeunload` 事件中调用的 `doImmediateSave()` 是异步操作（`fetch(src) → blob → IndexedDB`），浏览器可能在 IndexedDB 事务完成前就关闭页面。

### 5.2 实现

```typescript
private backupToSessionStorage(projectId: string): void {
  const state = useCanvasStore.getState();
  if (!state.layers || state.layers.length === 0) return;

  const backupData: CanvasData = {
    version: 2,
    projectId,
    layers: state.layers.map(l => {
      const { src, ...rest } = l;
      // blob URL 页面关闭后失效，不保存
      const safeSrc = (src && !src.startsWith('blob:')) ? src : undefined;
      return { ...rest, src: safeSrc } as any;
    }),
    offset: state.offset,
    scale: state.scale,
    savedAt: Date.now(),
    syncStatus: 'synced',
  };

  sessionStorage.setItem(`canvas-backup:${projectId}`, JSON.stringify(backupData));
}

private restoreSessionBackup(projectId: string): CanvasData | null {
  const raw = sessionStorage.getItem(`canvas-backup:${projectId}`);
  if (!raw) return null;
  sessionStorage.removeItem(`canvas-backup:${projectId}`);

  const data: CanvasData = JSON.parse(raw);
  // 超过 10 分钟视为过期
  if (data.savedAt && Date.now() - data.savedAt > 10 * 60 * 1000) return null;

  return data;
}
```

### 5.3 触发时机

| 场景 | 写入 | 恢复 |
|---|---|---|
| beforeunload | ✅ 同步写入 | — |
| exit() | ✅ 同步写入 | — |
| enter() | — | ✅ 优先于 IndexedDB 恢复 |
| restoreCanvasState() 按钮 | — | ✅ 优先于 IndexedDB 恢复 |

### 5.4 安全边界

- sessionStorage 配额约 5MB，超出时静默忽略
- blob URL 被排除（页面关闭后失效），依赖 `imageId` 从 IndexedDB 恢复
- 备份超过 10 分钟视为过期（正常流程中写入后应在数秒内被加载）

---

## 6. 历史数据丢失风险及修复

### 6.1 已修复的问题

| # | 问题 | 根因 | 修复 |
|---|---|---|---|
| 1 | 切换项目时画布数据被清空 | `setProjectId` 中 clearing store 触发 auto-save，在 restore 完成前写入空数据 | 清除 store 后立即取消 auto-save timer |
| 2 | 项目切换时旧数据未保存 | `setProjectId` 在清理旧项目前没有强制同步 | 切换前调用 `forceSync()` |
| 3 | 跨项目图层泄漏 | `exit()` 未清空 Zustand store，新项目无数据时显示旧图层 | `exit()` 和 `enter()` 开头均清空 store |
| 4 | auto-save + saveImmediately 竞态 | 两个异步写操作交叉执行 | 保存队列串行化 |
| 5 | beforeunload 重复注册 | StageCanvas 和服务各注册一次 | 统一在 service 中注册 |
| 6 | clearCanvas + undo 竞态 | 清空入栈 + 异步保存，undo 可插入中间 | 通过 enqueueSave 串行化 |
| 7 | isLoading 未阻止保存 | 加载过程中 auto-save 可能写入空数据 | `saveCanvasState()` 和 `doImmediateSave()` 均检查 `isLoading` |
| 8 | 退出时未清理 | `cleanup()` 未在 `handleExitProject` 中被调用 | 改为 `exit()` 统一管理，`cleanup()` 委托给 `exit()` |

### 6.2 当前风险（已评估可接受）

- **beforeunload 异步保存不可靠**：浏览器可能中断 IndexedDB 事务。缓解：sessionStorage 同步备份
- **sessionStorage 配额上限**：画布数据量大时可能写不进去。缓解：`try/catch` 静默忽略
- **Zustand store 被外部代码直接修改**：非经 `addLayer`/`clearCanvas` 等 API 的修改不会触发 auto-save。缓解：这是 Zustand 的设计特性，需通过 code review 避免

---

## 7. 关键数据结构

### `CanvasData`（IndexedDB / sessionStorage）

```typescript
interface CanvasData {
  projectId: string;
  layers: LayerData[];
  offset: { x: number; y: number };
  scale: number;
  savedAt: number;
  version: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
}
```

### `CanvasIntegrationService` 内部状态

```typescript
class CanvasIntegrationService {
  private currentProjectId: string;        // 活动项目 ID，'' 表示无活动项目
  private isLoading: boolean;              // 加载中，阻止自动保存
  private saveTimer: Timer | null;         // auto-save 1000ms 定时器
  private unsubscribe: (() => void) | null; // Zustand 订阅取消函数
  private pendingSave: Promise<void>;       // 保存队列链
  private exitPromise: Promise<void> | null; // exit() dedup
  private readonly STORAGE_KEY_PREFIX = 'canvas-backup:';
}
```

---

## 8. 测试覆盖

测试文件：`tests/canvas-integration.test.ts`

| 覆盖范围 | 用例数 |
|---|---|
| enter/exit 生命周期 | 11 |
| cleanup（旧接口） | 3 |
| saveImmediately | 2 |
| Zustand 自动订阅 | 3 |
| saveCanvasState | 2 |
| clearCanvas | 2 |
| 保存队列串行化 | 2 |
| sessionStorage 备份 | 3 |
| forceSync | 1 |
| **总计** | **29** |

运行方式：

```bash
npx vitest run tests/canvas-integration.test.ts
```

---

## 9. 常见问答

**Q: 什么时候应该调 `saveImmediately()` 而不是依赖 auto-save？**
A: 关键节点（切换项目、退出、生成完成）应该显式调用 `saveImmediately()`。普通编辑操作依赖 auto-save（1000ms 防抖）即可。

**Q: `enter()` 和 `restoreCanvasState()` 有什么区别？**
A: `enter()` 是完整生命周期入口（清空 store → setup → restore）。`restoreCanvasState()` 是公开的恢复按钮 API（只做 restore，不做 setup）。

**Q: `cleanup()` 和 `exit()` 有什么区别？**
A: `cleanup()` 是旧接口，现在委托给 `exit()`。`exit()` 是完整的退出流程（备份 → 清空 store → 取消订阅 → 等待队列 → forceSync → cleanup）。
