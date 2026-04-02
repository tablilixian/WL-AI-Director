# 创建项目流程分析

## 当前流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           创建项目流程                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Dashboard  │────▶│   App.tsx    │────▶│  Auto-save   │────▶│  IndexedDB   │
│  点击"新建"   │     │ handleOpen   │     │   1秒延迟    │     │   保存       │
└──────────────┘     │   Project    │     │              │     └──────────────┘
                     └──────────────┘     └──────────────┘
                            │                    │
                            │                    ▼
                     ┌──────────────┐     ┌──────────────┐
                     │ setProject()  │     │HybridStorage │
                     │  设置项目状态  │     │ saveProject  │
                     └──────────────┘     └──────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────┐
                                            │   云端保存    │
                                            │ (如果已登录)  │
                                            └──────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           打开已有项目流程                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Dashboard  │────▶│   App.tsx    │────▶│ loadProject  │────▶│ setProject() │
│  点击项目卡片 │     │ handleOpen   │     │   FromDB     │     │  设置状态    │
│              │     │ (string ID)  │     │ 加载完整项目  │     └──────────────┘
└──────────────┘     └──────────────┘     └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           返回项目列表流程                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Sidebar    │────▶│   App.tsx    │────▶│HybridStorage │────▶│ setProject   │
│  点击"返回"   │     │handleExit   │     │ saveProject  │     │    (null)    │
│              │     │  Project     │     │   保存项目   │     └──────────────┘
└──────────────┘     └──────────────┘     └──────────────┘
```

## 详细流程分解

### 1. 创建新项目 (Dashboard.tsx)

```typescript
// Dashboard.tsx - 行 126-129
const handleCreate = () => {
  const newProject = createNewProjectState();  // 创建新项目对象
  onOpenProject(newProject);                    // 传递给 App
};
```

**问题1**: 这里传入的是 `ProjectState` 对象，但类型定义是 `(projectId: string) => void`

### 2. 打开项目处理 (App.tsx)

```typescript
// App.tsx - 行 239-253 (修复后)
const handleOpenProject = async (proj: string | ProjectState) => {
  // 情况A: 传入的是字符串 (项目ID) - 已有项目
  if (typeof proj === 'string') {
    const fullProject = await loadProjectFromDB(proj);  // 从IndexedDB加载
    if (fullProject) setProject(fullProject);
  } 
  // 情况B: 传入的是对象 (ProjectState) - 新建项目
  else {
    setProject(proj);  // 直接使用
  }
};
```

### 3. 自动保存 (App.tsx - useEffect)

```typescript
// App.tsx - 行 167-188
useEffect(() => {
  if (!project) return;
  
  setSaveStatus('unsaved');
  
  // 1秒延迟后自动保存
  saveTimeoutRef.current = setTimeout(async () => {
    setSaveStatus('saving');
    await hybridStorage.saveProject(project);  // 调用 HybridStorage
    setSaveStatus('saved');
  }, 1000);
}, [project]);
```

### 4. HybridStorage 保存 (hybridStorageService.ts)

```typescript
// hybridStorageService.ts - 行 288-295
async saveProject(project: ProjectState): Promise<void> {
  const { user } = useAuthStore.getState();
  
  // 1. 递增版本号
  const updatedProject = this.incrementVersion(project);
  
  // 2. 先保存到本地 IndexedDB
  await saveProjectToDB(updatedProject);
  
  // 3. 如果已登录，同时保存到云端
  if (user) {
    // ... 云端保存逻辑
  }
}
```

### 5. IndexedDB 保存 (storageService.ts)

```typescript
// storageService.ts - 行 150-172
export const saveProjectToDB = async (project: ProjectState): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const p = { ...project, lastModified: Date.now() };
  const request = store.put(p);  // keyPath 是 'id'
  
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
};
```

**IndexedDB Schema**:
- Store Name: `projects`
- KeyPath: `id`

### 6. 返回项目列表 (App.tsx)

```typescript
// App.tsx - 行 257-279
const handleExitProject = async () => {
  // 如果正在生成，弹出警告
  if (isGenerating) {
    showAlert(...);
    return;
  }
  
  // 保存当前项目
  if (project) {
    await hybridStorage.saveProject(project);
  }
  
  // 设置为 null，返回 Dashboard
  setProject(null);
};
```

## 关键数据流

### ProjectState 结构

```typescript
interface ProjectState {
  id: string;                    // UUID (crypto.randomUUID())
  title: string;                 // 项目标题
  createdAt: number;             // 创建时间戳
  lastModified: number;          // 最后修改时间戳
  version: number;               // 版本号 (乐观锁)
  stage: 'script' | 'assets' | 'director' | 'export' | 'prompts';
  // ... 其他字段
}
```

## 当前问题点

### 问题1: 类型不匹配 (已修复)
- Dashboard 定义: `onOpenProject: (projectId: string) => void`
- 实际调用 (新建): `onOpenProject(newProject)` - 传入对象
- 实际调用 (打开): `onOpenProject(proj.id)` - 传入字符串

### 问题2: 新建项目未立即保存
- 新建项目后，依赖 auto-save (1秒延迟)
- 如果用户立即操作或退出，可能丢失数据

### 问题3: 返回时保存失败
- 如果 auto-save 正在执行，handleExitProject 再次保存
- 可能存在竞态条件
