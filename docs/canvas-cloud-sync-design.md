# 画布云端同步开发文档

## 一、设计原则

### 1.1 核心原则：Local-First

```
┌─────────────────────────────────────────────────────────────────┐
│                    Local-First 架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   用户操作 ──→ 本地保存（实时）──→ 云端同步（异步）              │
│                  │                    │                         │
│                  │                    ├─ 成功：更新同步状态      │
│                  │                    ├─ 失败：标记待重试        │
│                  │                    └─ 禁用：静默忽略          │
│                  │                                               │
│                  └─ 无论云端结果如何，本地数据始终可用            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 关键保证

| 保证 | 说明 |
|------|------|
| **本地优先** | 所有操作先写入本地 IndexedDB，确保数据不丢失 |
| **云端降级** | 云端存储失败/禁用时，不影响本地任何功能 |
| **静默同步** | 云端同步在后台进行，不阻塞用户操作 |
| **冲突可解** | 提供版本号 + 时间戳双重检测，支持手动解决冲突 |

---

## 二、数据库设计

### 2.1 本地存储 (IndexedDB)

**已有结构**：`canvasData` store（dbConfig.ts 已定义）

```typescript
interface CanvasData {
  projectId: string;           // 主键，关联项目
  layers: LayerData[];         // 图层数据（不含 src/thumbnail）
  offset: { x: number; y: number };
  scale: number;
  savedAt: number;             // 本地保存时间戳
  version: number;             // 版本号，每次保存递增
  syncStatus: 'synced' | 'pending' | 'conflict';
}
```

**索引**：
- `syncStatus`：用于查询待同步数据

### 2.2 云端存储 (Supabase)

**新增表**：`canvas_data`

```sql
-- =====================================================
-- 画布数据表
-- =====================================================
CREATE TABLE IF NOT EXISTS public.canvas_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    layers JSONB NOT NULL DEFAULT '[]',
    offset JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
    scale FLOAT DEFAULT 1,
    version INT DEFAULT 1,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT canvas_data_project_unique UNIQUE(project_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_canvas_data_project_id ON canvas_data(project_id);
CREATE INDEX IF NOT EXISTS idx_canvas_data_updated_at ON canvas_data(updated_at);

-- RLS
ALTER TABLE canvas_data ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能操作自己项目的画布数据
CREATE POLICY "Users can view own canvas data" ON canvas_data
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

CREATE POLICY "Users can insert own canvas data" ON canvas_data
    FOR INSERT WITH CHECK (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

CREATE POLICY "Users can update own canvas data" ON canvas_data
    FOR UPDATE USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );

CREATE POLICY "Users can delete own canvas data" ON canvas_data
    FOR DELETE USING (
        auth.uid() IN (SELECT user_id FROM projects WHERE id = canvas_data.project_id)
    );
```

### 2.3 数据结构对比

| 字段 | 本地 (IndexedDB) | 云端 (Supabase) | 说明 |
|------|-----------------|-----------------|------|
| 主键 | projectId | id (UUID) | 云端额外有自增主键 |
| 关联 | - | project_id | 云端关联项目表 |
| layers | LayerData[] | JSONB | 图层数据 |
| offset | {x, y} | JSONB | 画布偏移 |
| scale | number | FLOAT | 画布缩放 |
| version | number | INT | 版本号 |
| savedAt | number (timestamp) | TIMESTAMPTZ | 保存时间 |
| syncStatus | 'synced' \| 'pending' \| 'conflict' | - | 仅本地使用 |
| updatedAt | - | TIMESTAMPTZ | 云端更新时间 |

---

## 三、服务层设计

### 3.1 模块结构

```
services/
├── canvasStorageService.ts      # 本地存储（已有，需扩展）
├── canvasSyncService.ts         # 云端同步服务（新增）
└── canvasCloudApi.ts            # 云端 API 封装（新增）
```

### 3.2 CanvasSyncService 核心逻辑

```typescript
/**
 * 画布同步服务
 * 
 * 职责：
 * 1. 管理本地保存（高频）
 * 2. 管理云端同步（低频）
 * 3. 处理冲突检测
 * 4. 提供降级方案
 */
class CanvasSyncService {
  // ==================== 配置 ====================
  
  private config = {
    // 本地保存配置
    localSaveDebounce: 500,        // 本地保存防抖（ms）
    
    // 云端同步配置
    cloudSyncMinInterval: 30000,   // 云端同步最小间隔（ms）
    cloudSyncDelay: 10000,         // 停止操作后多久同步（ms）
    cloudSyncRetryTimes: 3,        // 云端同步重试次数
    cloudSyncRetryDelay: 5000,     // 重试间隔（ms）
    
    // 开关
    cloudSyncEnabled: true,        // 是否启用云端同步
  };
  
  // ==================== 状态 ====================
  
  private dirty = false;                    // 是否有未同步的更改
  private lastLocalSave = 0;                // 最后本地保存时间
  private lastCloudSync = 0;                // 最后云端同步时间
  private syncTimer: NodeJS.Timeout | null = null;  // 同步定时器
  private currentProjectId: string | null = null;   // 当前项目ID
  
  // ==================== 公共方法 ====================
  
  /**
   * 初始化 - 进入项目时调用
   */
  async init(projectId: string): Promise<void>;
  
  /**
   * 保存画布状态 - 用户操作时调用
   * 本地立即保存，云端延迟同步
   */
  async save(layers: LayerData[], offset: {x, y}, scale: number): Promise<void>;
  
  /**
   * 强制同步云端 - 关键节点调用
   */
  async forceSync(): Promise<void>;
  
  /**
   * 加载画布状态 - 进入项目时调用
   */
  async load(): Promise<CanvasData | null>;
  
  /**
   * 清理 - 退出项目时调用
   */
  async cleanup(): Promise<void>;
  
  /**
   * 设置云端同步开关
   */
  setCloudSyncEnabled(enabled: boolean): void;
}
```

### 3.3 保存流程详解

```
┌─────────────────────────────────────────────────────────────────┐
│                        保存流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户操作画布                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ 防抖 500ms      │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐     失败 ──→ 抛出异常（本地存储失败是严重错误）│
│  │ 保存到 IndexedDB│                                            │
│  └────────┬────────┘                                            │
│           │ 成功                                                │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 标记 dirty=true │                                            │
│  │ 更新 lastLocalSave│                                          │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 启动云端同步定时器│  （延迟 10s，节流 30s）                     │
│  └─────────────────┘                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 云端同步流程详解

```
┌─────────────────────────────────────────────────────────────────┐
│                      云端同步流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  定时器触发 / 强制同步                                           │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ 检查是否启用云端 │── 否 ──→ 静默返回                           │
│  └────────┬────────┘                                            │
│           │ 是                                                  │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 检查 dirty=true │── 否 ──→ 静默返回                           │
│  └────────┬────────┘                                            │
│           │ 是                                                  │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 检查用户登录状态 │── 未登录 ──→ 静默返回                       │
│  └────────┬────────┘                                            │
│           │ 已登录                                              │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 获取本地数据     │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 上传到云端       │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│     ┌─────┴─────┐                                               │
│     │           │                                               │
│   成功        失败                                               │
│     │           │                                               │
│     ▼           ▼                                               │
│ ┌───────┐  ┌──────────────┐                                     │
│ │synced │  │重试 3 次      │                                     │
│ │dirty=false│ │每次间隔 5s    │                                     │
│ └───────┘  └──────┬───────┘                                     │
│                   │                                             │
│              仍失败                                              │
│                   │                                             │
│                   ▼                                             │
│            ┌──────────────┐                                     │
│            │保持 pending   │                                     │
│            │下次启动时重试 │                                     │
│            └──────────────┘                                     │
│                                                                 │
│  注意：无论云端成功与否，本地数据始终可用                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、同步策略详解

### 4.1 触发时机

| 触发点 | 本地保存 | 云端同步 | 说明 |
|--------|---------|---------|------|
| 用户操作画布 | ✅ 防抖 500ms | ❌ | 仅本地保存 |
| 停止操作 10s | - | ✅ | 后台同步 |
| 定时检查 | - | ✅ 每 30s | 检查 dirty |
| 切换项目/退出 | ✅ 强制 | ✅ 强制 | 确保数据不丢失 |
| 浏览器关闭 | ✅ 强制 | ✅ 尝试 | beforeunload |
| 用户手动保存 | ✅ 强制 | ✅ 强制 | 明确保存 |
| 项目加载 | - | ✅ 检查 | 对比云端版本 |

### 4.2 冲突检测与解决

```
┌─────────────────────────────────────────────────────────────────┐
│                      冲突检测逻辑                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  加载项目时：                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ 获取本地数据     │                                            │
│  │ 获取云端数据     │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 比较版本号       │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│     ┌─────┼─────┐                                               │
│     │     │     │                                               │
│  本地>云端 本地<云端 相等                                         │
│     │     │     │                                               │
│     ▼     ▼     ▼                                               │
│  上传本地 下载云端 比较时间戳                                      │
│           │     │                                               │
│           │  ┌──┴──┐                                            │
│           │  │     │                                            │
│           │ 本地新 云端新                                         │
│           │  │     │                                            │
│           │  ▼     ▼                                            │
│           │ 上传  下载                                           │
│                                                                 │
│  特殊情况：                                                      │
│  - 本地有 pending 状态：优先上传本地                              │
│  - 版本差距过大（>10）：提示用户选择                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 冲突解决策略

```typescript
enum ConflictResolution {
  USE_LOCAL = 'use_local',      // 使用本地版本
  USE_CLOUD = 'use_cloud',      // 使用云端版本
  MERGE = 'merge',              // 尝试合并（复杂，暂不实现）
}

async function resolveConflict(
  local: CanvasData,
  cloud: CloudCanvasData
): Promise<ConflictResolution> {
  // 自动解决规则
  if (local.syncStatus === 'pending') {
    return ConflictResolution.USE_LOCAL;
  }
  
  if (local.version > cloud.version + 10) {
    // 版本差距过大，需要用户介入
    return this.askUser(local, cloud);
  }
  
  // 默认：时间戳优先
  return local.savedAt > cloud.savedAt 
    ? ConflictResolution.USE_LOCAL 
    : ConflictResolution.USE_CLOUD;
}
```

---

## 五、错误处理与降级

### 5.1 错误分类

| 错误类型 | 处理方式 | 影响 |
|---------|---------|------|
| 本地存储失败 | 抛出异常，提示用户 | 严重，数据可能丢失 |
| 云端网络超时 | 重试 3 次，标记 pending | 无影响，本地可用 |
| 云端服务器错误 | 重试 3 次，标记 pending | 无影响，本地可用 |
| 用户未登录 | 跳过云端同步 | 无影响，本地可用 |
| 云端功能禁用 | 跳过云端同步 | 无影响，本地可用 |
| 版本冲突 | 标记 conflict，提示用户 | 需要用户选择 |

### 5.2 降级策略

```typescript
/**
 * 云端同步开关控制
 */
interface CloudSyncConfig {
  enabled: boolean;           // 全局开关
  reason?: string;            // 禁用原因
}

// 存储在 localStorage
const CLOUD_SYNC_CONFIG_KEY = 'wl-canvas-cloud-sync-config';

function getCloudSyncConfig(): CloudSyncConfig {
  try {
    const stored = localStorage.getItem(CLOUD_SYNC_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return { enabled: true };
}

function setCloudSyncEnabled(enabled: boolean, reason?: string): void {
  localStorage.setItem(CLOUD_SYNC_CONFIG_KEY, JSON.stringify({
    enabled,
    reason,
  }));
}
```

### 5.3 错误恢复流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      错误恢复流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  应用启动时：                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │ 检查 pending 数据│                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 有 pending？     │── 否 ──→ 正常启动                          │
│  └────────┬────────┘                                            │
│           │ 是                                                  │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 后台自动重试同步 │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 更新同步状态     │                                            │
│  └─────────────────┘                                            │
│                                                                 │
│  用户可在设置中：                                                │
│  - 查看同步状态                                                  │
│  - 手动触发同步                                                  │
│  - 禁用/启用云端同步                                             │
│  - 查看冲突并解决                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 六、API 设计

### 6.1 云端 API (canvasCloudApi.ts)

```typescript
/**
 * 画布云端 API
 */
export const canvasCloudApi = {
  /**
   * 获取画布数据
   */
  async get(projectId: string): Promise<CloudCanvasData | null> {
    const { data, error } = await supabase
      .from('canvas_data')
      .select('*')
      .eq('project_id', projectId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // 未找到
      throw error;
    }
    
    return {
      projectId: data.project_id,
      layers: data.layers,
      offset: data.offset,
      scale: data.scale,
      version: data.version,
      savedAt: new Date(data.saved_at).getTime(),
    };
  },
  
  /**
   * 保存画布数据（upsert）
   */
  async save(data: CloudCanvasData): Promise<void> {
    const { error } = await supabase
      .from('canvas_data')
      .upsert({
        project_id: data.projectId,
        layers: data.layers,
        offset: data.offset,
        scale: data.scale,
        version: data.version,
        saved_at: new Date(data.savedAt).toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id',
      });
    
    if (error) throw error;
  },
  
  /**
   * 删除画布数据
   */
  async delete(projectId: string): Promise<void> {
    const { error } = await supabase
      .from('canvas_data')
      .delete()
      .eq('project_id', projectId);
    
    if (error) throw error;
  },
};
```

### 6.2 服务层 API (canvasSyncService.ts)

```typescript
/**
 * 画布同步服务 - 对外接口
 */
export const canvasSyncService = new CanvasSyncService();

// 使用示例
// 进入项目时
await canvasSyncService.init(projectId);

// 用户操作时
canvasSyncService.save(layers, offset, scale);

// 退出项目时
await canvasSyncService.forceSync();
await canvasSyncService.cleanup();

// 加载时
const data = await canvasSyncService.load();

// 禁用云端同步
canvasSyncService.setCloudSyncEnabled(false);
```

---

## 七、集成点

### 7.1 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `services/dbConfig.ts` | 无需修改（已有 canvasData store） |
| `services/canvasStorageService.ts` | 扩展：添加同步状态更新方法 |
| `src/modules/canvas/services/canvasIntegrationService.ts` | 替换：使用 canvasSyncService |
| `src/modules/canvas/hooks/useCanvasState.ts` | 集成：自动保存逻辑 |
| `components/StageCanvas.tsx` | 调用：初始化和清理 |
| `App.tsx` | 调用：项目切换时同步 |

### 7.2 集成流程

```typescript
// StageCanvas.tsx 或 useCanvasState.ts

import { canvasSyncService } from '@/services/canvasSyncService';

// 进入项目时
useEffect(() => {
  if (project?.id) {
    canvasSyncService.init(project.id);
    canvasSyncService.load().then(data => {
      if (data) {
        useCanvasStore.getState().importLayers(data.layers);
        useCanvasStore.getState().setOffset(data.offset);
        useCanvasStore.getState().setScale(data.scale);
      }
    });
  }
  
  return () => {
    canvasSyncService.forceSync();
    canvasSyncService.cleanup();
  };
}, [project?.id]);

// 用户操作时
const handleCanvasChange = debounce(() => {
  const { layers, offset, scale } = useCanvasStore.getState();
  canvasSyncService.save(layers, offset, scale);
}, 500);
```

---

## 八、测试计划

### 8.1 单元测试

- [ ] 本地保存/加载正常
- [ ] 云端保存/加载正常
- [ ] 云端禁用时本地正常工作
- [ ] 网络错误时重试逻辑
- [ ] 版本冲突检测
- [ ] 时间戳比较逻辑

### 8.2 集成测试

- [ ] 完整保存流程
- [ ] 完整加载流程
- [ ] 项目切换时数据隔离
- [ ] 浏览器关闭时数据保存
- [ ] 离线编辑后上线同步

### 8.3 边界测试

- [ ] 大量图层（100+）性能
- [ ] 频繁操作（每秒 10 次）
- [ ] 长时间离线（7 天+）
- [ ] 并发冲突（多设备同时编辑）

---

## 九、监控与日志

### 9.1 日志格式

```typescript
// 使用现有 logger
import { logger, LogCategory } from '@/services/logger';

// 关键操作日志
logger.debug(LogCategory.CANVAS, `[CanvasSync] 本地保存成功，项目: ${projectId}, 版本: ${version}`);
logger.info(LogCategory.CANVAS, `[CanvasSync] 云端同步成功，项目: ${projectId}`);
logger.warn(LogCategory.CANVAS, `[CanvasSync] 云端同步失败，将重试: ${error}`);
logger.error(LogCategory.CANVAS, `[CanvasSync] 本地保存失败: ${error}`);
```

### 9.2 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|---------|
| 本地保存成功率 | 本地保存成功次数/总次数 | < 99% |
| 云端同步成功率 | 云端同步成功次数/总次数 | < 90% |
| 云端同步延迟 | 从触发到完成的耗时 | > 5s |
| pending 数据量 | 待同步的项目数 | > 10 |
| conflict 数据量 | 冲突的项目数 | > 0 |

---

## 十、实施计划

### Phase 1：基础设施（1-2 天）

1. 创建 Supabase `canvas_data` 表
2. 创建 `canvasCloudApi.ts`
3. 扩展 `canvasStorageService.ts`

### Phase 2：同步服务（2-3 天）

1. 创建 `canvasSyncService.ts`
2. 实现本地保存逻辑
3. 实现云端同步逻辑
4. 实现冲突检测

### Phase 3：集成（1-2 天）

1. 修改 `canvasIntegrationService.ts`
2. 修改 `StageCanvas.tsx`
3. 修改 `App.tsx`

### Phase 4：测试与优化（1-2 天）

1. 单元测试
2. 集成测试
3. 性能优化
4. 文档完善

---

## 十一、FAQ

### Q1: 云端存储失败会影响本地操作吗？

**不会**。本地保存和云端同步是完全独立的两个流程。云端同步失败只会标记 `syncStatus: 'pending'`，下次有机会时会自动重试。

### Q2: 如何完全禁用云端同步？

```typescript
canvasSyncService.setCloudSyncEnabled(false);
// 或在 localStorage 设置
localStorage.setItem('wl-canvas-cloud-sync-config', JSON.stringify({ enabled: false }));
```

### Q3: 多设备同时编辑会怎样？

会检测到版本冲突，标记 `syncStatus: 'conflict'`，用户需要手动选择使用哪个版本。

### Q4: 离线编辑后上线会怎样？

应用启动时会检查 pending 数据，自动尝试同步到云端。

### Q5: 画布数据会很大吗？

图层数据不包含实际的图片/视频内容（src/thumbnail），只包含引用 ID，所以 JSON 体积通常较小（< 100KB）。如果图层特别多（100+），可能需要考虑分片存储。

---

## 十二、附录

### A. 相关文件索引

| 文件 | 说明 |
|------|------|
| `services/dbConfig.ts` | IndexedDB 配置 |
| `services/canvasStorageService.ts` | 本地存储服务 |
| `services/hybridStorageService.ts` | 项目混合存储（参考） |
| `src/modules/canvas/services/canvasIntegrationService.ts` | 画布集成服务 |
| `src/modules/canvas/hooks/useCanvasState.ts` | 画布状态管理 |
| `docs/archive/supabase-init.sql` | Supabase 表结构 |

### B. 参考资料

- [Zustand Persist Middleware](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
