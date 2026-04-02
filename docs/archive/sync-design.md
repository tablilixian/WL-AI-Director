# 数据同步架构设计

## 目标

实现用户数据在多设备间同步：
- 用户自备 API Key（前端直接调用 AI）
- 数据存储到 Supabase（云端）
- 登录后可从任意设备继续工作

## 当前状态

### 存储现状
- **IndexedDB**: 存储完整 ProjectState（包含 scripts, shots, characters, scenes）
- **Supabase**: 有 API 层，但未实际使用

### 数据结构差异
```
IndexedDB (ProjectState):
{
  id: "xxx",
  title: "项目1",
  scriptData: { ... },
  characters: [ ... ],
  scenes: [ ... ],
  shots: [ ... ]
}

Supabase (关系型):
projects ← scripts ← shots
         ← characters
         ← scenes
```

## 架构设计

### 混合存储策略 (Hybrid Storage)

```
┌─────────────────────────────────────────────────────────┐
│                     UI 组件                              │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              HybridStorageService (新)                    │
│  - 优先读: Supabase → IndexedDB                         │
│  - 写入: 同时写 Supabase + IndexedDB                     │
│  - 同步: 登录时从 Supabase 拉取                         │
└──────┬──────────────────────────────┬────────────────────┘
       │                              │
┌──────▼──────┐              ┌───────▼───────┐
│ Supabase    │              │ IndexedDB     │
│ (云端/同步) │              │ (本地缓存)    │
└─────────────┘              └───────────────┘
```

### API 设计

```typescript
// 新的混合存储服务
export const storageService = {
  // 项目操作
  getAllProjects(): Promise<ProjectState[]>,      // 优先 Supabase
  getProject(id: string): Promise<ProjectState>,   // 优先 Supabase
  saveProject(project: ProjectState): Promise<void>, // 双写
  deleteProject(id: string): Promise<void>,         // 双删
  
  // 同步操作
  syncFromCloud(): Promise<void>,                   // 登录后同步
  exportToCloud(): Promise<void>,                   // 手动导出到云端
}
```

## 实现步骤

### 1. 创建 HybridStorageService
- 封装 Supabase API 调用
- 封装 IndexedDB 操作
- 实现双写逻辑

### 2. 数据模型转换
- `ProjectState` ↔ `Supabase 关系表`
- 处理 UUID 生成（本地优先）

### 3. 同步逻辑
- 登录时检测是否有云端数据
- 冲突处理：时间戳优先（最新覆盖）
- 首次同步：云端数据合并到本地

### 4. 渐进式迁移
- 保持向后兼容
- 已有本地数据不受影响
- 新数据自动同步

## 待处理细节

- [ ] Supabase 表需要添加 user_id 关联
- [ ] 处理离线场景（IndexedDB 作为主存储）
- [ ] 冲突解决策略
- [ ] 初始同步时去重逻辑
