# 画布保存策略文档

## 一、架构概述

### 1.1 设计目标

- **Local-First（本地优先）**：画布数据实时保存在本地，后台异步同步到云端
- **按项目关联**：每个项目有独立的画布数据
- **冲突解决**：以最后一次保存（时间戳）为准

### 1.2 存储架构

| 存储位置 | 用途 | 同步方式 |
|---------|------|---------|
| IndexedDB (canvasData store) | 主存储，按项目ID关联 | 后台异步 |
| localStorage (wl-canvas-backup) | 备份，兼容旧版本 | 无 |

---

## 二、数据结构

### 2.1 CanvasData 接口

```typescript
interface CanvasData {
  projectId: string;           // 项目ID（主键）
  layers: any[];               // 图层数据
  offset: { x: number; y: number };  // 画布偏移
  scale: number;               // 画布缩放
  savedAt: number;             // 本地保存时间戳
  version: number;             // 版本号（递增）
  syncStatus: 'synced' | 'pending' | 'conflict';  // 同步状态
}
```

### 2.2 IndexedDB Store

```typescript
// store: canvasData
// keyPath: projectId
// 索引:
//   - savedAt: 用于排序
//   - version: 用于冲突检测
//   - syncStatus: 用于查询待同步数据
```

---

## 三、保存流程

### 3.1 保存（saveCanvasState）

```
用户操作 → 触发 triggerAutoSave() → 延迟后执行 saveCanvasState()
                                              ↓
                           1. 处理绘制图层（data: → IndexedDB）
                                              ↓
                           2. 保存到 IndexedDB（canvasData store）
                                              ↓
                           3. 同时保存到 localStorage（备份）
```

### 3.2 恢复（restoreCanvasState）

```
页面加载 → restoreCanvasState()
                 ↓
    1. 优先从 IndexedDB 加载（按 projectId）
                 ↓
    2. 如果没有，fallback 到 localStorage
                 ↓
    3. 恢复图层、offset、scale 到 store
```

---

## 四、自动保存策略

### 4.1 三层保护

| 层级 | 触发条件 | 延迟 | 作用 |
|-----|---------|------|------|
| **快速检查层** | 用户操作时 | 0ms | 计算 hash 检测变化 |
| **延迟保存层** | 检测到变化 | 1-2s | 等待操作稳定 |
| **兜底层** | 未保存状态 | 60s | 强制保存防丢失 |

### 4.2 触发时机

| 操作类型 | 延迟 | 触发方式 |
|---------|------|---------|
| 绘制/导入图片 | 2s | addLayer / updateLayer |
| 拖拽/缩放/调整大小 | 1s | handleMouseUp / setScale / setOffset |
| 切换页签 | 0s（强制） | setStage in App.tsx |

---

## 五、同步策略（待实现）

### 5.1 同步流程

```
后台任务 → 获取 syncStatus='pending' 的数据 → 上传到云端
                                              ↓
                               1. 本地新 → 上传
                               2. 云端新 → 下载覆盖
                               3. 版本相同 → 时间戳判断
```

### 5.2 冲突解决

| 场景 | 处理 |
|-----|------|
| 本地版本 > 云端版本 | 上传本地 |
| 云端版本 > 本地版本 | 下载云端覆盖本地 |
| 版本相同，时间不同 | 以时间戳为准（后保存的覆盖先保存的） |

---

## 六、相关代码

### 6.1 核心文件

| 文件 | 作用 |
|------|------|
| services/canvasStorageService.ts | 画布数据存储服务（新增） |
| services/dbConfig.ts | 数据库配置（添加 canvasData store） |
| services/storageService.ts | 初始化 canvasData store |
| src/modules/canvas/services/canvasIntegrationService.ts | 画布集成服务 |

### 6.2 关键函数

```typescript
// canvasStorageService.ts
saveCanvasDataToLocal(projectId, layers, offset, scale)  // 保存到 IndexedDB
getCanvasDataFromLocal(projectId)                         // 从 IndexedDB 获取
getPendingSyncCanvasData()                                // 获取待同步数据

// canvasIntegrationService.ts
setProjectId(projectId)    // 设置当前项目ID
saveCanvasState()          // 保存画布
restoreCanvasState()       // 恢复画布
triggerAutoSave()         // 触发自动保存
```

---

## 七、版本历史

- **v1.0**: 初始版本，localStorage 存储
- **v2.0**: 
  - 添加 IndexedDB 存储（按项目ID关联）
  - 添加版本号管理
  - 添加同步状态标记
  - 支持冲突解决
