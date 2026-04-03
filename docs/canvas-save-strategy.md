# 画布保存策略文档

## 一、当前实现

### 1.1 保存位置
- **存储介质**：localStorage
- **存储键名**：`wl-canvas-backup`
- **存储格式**：JSON（包含 layers、offset、scale、savedAt）

### 1.2 当前保存逻辑

#### 手动保存
```typescript
// 位置：components/StageCanvas.tsx
const handleSaveCanvas = async () => {
  await canvasIntegrationService.saveCanvasState();
  alert('画布状态已保存');
};
```

#### 恢复（手动）
```typescript
// 位置：components/StageCanvas.tsx
const handleRestoreCanvas = async () => {
  const restored = await canvasIntegrationService.restoreCanvasState();
  // ...
};
```

#### 自动恢复（刚添加）
```typescript
// 位置：components/StageCanvas.tsx - useEffect
React.useEffect(() => {
  // 页面加载时自动恢复
}, []);
```

### 1.3 保存流程（saveCanvasState）

```typescript
// 核心逻辑在 canvasIntegrationService.saveCanvasState()

1. 获取当前 layers
2. 遍历每个图层：
   - image 类型：直接保留 src 和 imageId
   - video 类型：直接保留 src
   - drawing 类型：
     - 如果 src 是 data: 格式 → 提取 blob → 保存到 IndexedDB → 记录 imageId
     - 否则保留原有的 imageId
3. 构建 layersToSave（移除 src，只保留 imageId）
4. 保存到 localStorage
```

### 1.4 恢复流程（restoreCanvasState）

```typescript
1. 从 localStorage 读取 wl-canvas-backup
2. 遍历每个图层：
   - image 类型：
     - 有 imageId → 从 IndexedDB 读取 → 转为 blob URL
     - src 是 local: → 从 IndexedDB 读取
   - video 类型：
     - src 是 video: → 从 videoStorageService 读取
   - drawing 类型：
     - 有 imageId → 从 IndexedDB 读取 → 转为 blob URL
     - src 是 data: → 直接使用
3. 调用 importLayers 加载到画布
```

---

## 二、自动保存实现（2026-04 更新）

### 2.1 三层保护策略

| 层级 | 触发时机 | 延迟 | 说明 |
|------|---------|------|------|
| **快速检查层** | 任何操作时 | 0ms | 计算 hash 比对，无序列化 |
| **延迟保存层** | 检测到变化后 | 2s | 防抖，等待数据稳定 |
| **兜底层** | 定时检查 | 60s | 防止意外退出/崩溃丢失 |

### 2.2 性能优化

- **变化检测**：使用 hash 比对，无变化时不执行序列化
- **保存间隔**：5 秒内不重复保存
- **支持类型**：drawing 和 image 类型都会触发自动保存

### 2.3 触发时机

#### addLayer 时
```typescript
// 位置：useCanvasState.ts - addLayer
if (layer.type === 'drawing' && layer.src && !layer.imageId) {
  canvasIntegrationService.triggerAutoSave();
}

if (layer.type === 'image' && layer.src) {
  canvasIntegrationService.triggerAutoSave();
}
```

#### updateLayer 时
```typescript
// 位置：useCanvasState.ts - updateLayer
const updatedLayer = newLayers.find(l => l.id === id);
if ((updatedLayer?.type === 'drawing' || updatedLayer?.type === 'image') && updates.src) {
  canvasIntegrationService.triggerAutoSave();
}
```

### 2.4 事件触发（用于服务器响应）

```typescript
// AI 生成完成后立即保存
canvasIntegrationService.saveImmediately();
```

### 2.5 防抖机制

```typescript
// 位置：canvasIntegrationService.ts
const AUTO_SAVE_DELAY = 2000; // 2 秒延迟
const MIN_SAVE_INTERVAL = 5000; // 5 秒内不重复保存
const FALLBACK_SAVE_INTERVAL = 60000; // 60 秒兜底

triggerAutoSave() {
  // 1. 快速检查层：计算 hash
  // 2 秒后执行
}
```

### 2.3 当前问题

1. **只有 drawing 类型触发自动保存**（image 类型没有）
2. **2 秒延迟可能不够**（竞态条件）
3. **无兜底保存**（用户没操作时不会自动保存）
4. **无事件触发**（服务器响应不触发保存）

---

## 三、改进方案

### 3.1 三层保护策略

| 层级 | 触发时机 | 延迟 | 说明 |
|------|---------|------|------|
| **即时层** | 鼠标抬起 / 操作完成 | 0-500ms | 用户明确完成操作 |
| **事件层** | 服务器响应 / 生成完成 | 0ms | 数据已处理完成 |
| **兜底层** | 定时检查（无操作） | 30-60s | 防止意外丢失 |

### 3.2 触发点设计

#### 即时保存（鼠标操作）
```typescript
// 场景：用户绘制完成、拖拽完成、缩放完成
// 延迟：500ms（给数据生成留时间）

// 潜在问题：竞态条件
// - 绘制结束 → base64 还在生成 → 就开始保存 → 数据不完整
// - 解决方案：检查数据是否就绪，或保持当前 2 秒延迟
```

#### 事件保存（服务器响应）
```typescript
// 场景：AI 图片/视频生成完成
// 延迟：0ms（数据已经处理完成）

// 潜在问题：无
// - 因为数据已经写入到 layer.src 了
```

#### 兜底保存（定时器）
```typescript
// 场景：用户离开页面/浏览器崩溃
// 延迟：30-60 秒
// 条件：距离上次保存超过 60 秒 且 有未保存的更改
```

### 3.3 需要新增的逻辑

```typescript
class CanvasIntegrationService {
  private lastSaveTime: number = 0;
  private hasUnsavedChanges: boolean = false;
  
  // 即时保存（带延迟，确保数据就绪）
  saveImmediately(delay: number = 500) {
    setTimeout(() => {
      this.saveCanvasState();
    }, delay);
  }
  
  // 事件保存（立即执行）
  saveOnEvent() {
    this.saveCanvasState();
  }
  
  // 兜底保存（定时）
  startAutoSaveTimer(interval: number = 30000) {
    setInterval(() => {
      const now = Date.now();
      if (this.hasUnsavedChanges && (now - this.lastSaveTime) > 60000) {
        this.saveCanvasState();
      }
    }, interval);
  }
}
```

---

## 四、潜在问题与解决方案

### 4.1 竞态条件

**问题**：鼠标抬起时保存，但 base64 数据可能还没生成完成

**场景**：
```
用户绘制结束
    ↓
onMouseUp 触发
    ↓
500ms 后保存开始
    ↓
❌ 但 base64 还在 fetch/convert 中
```

**解决方案**：
- 方案 A：保持当前 2 秒延迟
- 方案 B：添加"数据就绪"检查
- 方案 C：只在 updateLayer 完成后触发（不依赖 mouseUp）

### 4.2 重复保存

**问题**：多个触发点同时触发，导致重复保存

**解决方案**：
- 使用 `lastSaveTime` 检查，5 秒内不重复保存
- 保存完成后重置 `hasUnsavedChanges`

### 4.3 存储空间

**问题**：localStorage 有 5MB 限制，图片太多会溢出

**解决方案**：
- drawing 类型的 src 转换为 imageId 后不保留 src（当前已实现）
- 定期清理旧的备份
- 考虑迁移到 IndexedDB

### 4.4 image 类型也需要自动保存

**问题**：当前只有 drawing 类型触发自动保存

**场景**：导入图片后切换页面，图片也会丢失

**解决方案**：
- image 类型有 src 时也触发自动保存
- 逻辑同 drawing 类型

---

## 五、待讨论问题

1. **即时保存的延迟时间**：500ms 还是 2s？
2. **是否需要保存 image 类型**：目前只有 drawing，需要加上 image 吗？
3. **兜底保存的间隔**：30s 还是 60s？
4. **存储策略**：localStorage 够用，还是需要迁移到 IndexedDB？

---

## 六、相关代码文件

| 文件 | 功能 |
|------|------|
| `canvasIntegrationService.ts` | 保存/恢复逻辑 |
| `useCanvasState.ts` | 状态管理，触发自动保存 |
| `StageCanvas.tsx` | 手动保存/恢复按钮，自动恢复 |
| `CanvasLayer.tsx` | 渲染图层，解析图片 src |
