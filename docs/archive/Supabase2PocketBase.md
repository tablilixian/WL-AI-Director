# Supabase → PocketBase 迁移方案

## 一、项目目标

将后端从 Supabase（海外、网络延迟严重）切换为 PocketBase 自托管方案。
同时将数据架构从「云端为主」改为 **Local-First**（IndexedDB 主 + PocketBase 备份/桥接）。

## 二、架构概览

```
┌─────────────────────────────────────────────────┐
│                   前端 (Vite+React)              │
├─────────────────────────────────────────────────┤
│  authStore        ←  PocketBase SDK (0.27.0)    │
│                   认证状态管理                     │
├─────────────────────────────────────────────────┤
│  hybridStorage    ←  本地 IndexedDB (主)         │
│  Service           →  PocketBase (异步备份)      │
├─────────────────────────────────────────────────┤
│  canvasSyncService   Local-First 画布同步         │
│  canvasCloudApi   ←  PocketBase canvas_data      │
├─────────────────────────────────────────────────┤
│  imageStorage     ←  本地 IndexedDB (全)          │
│  Service           →  URL.createObjectURL()       │
├─────────────────────────────────────────────────┤
│      ↓ HTTP (127.0.0.1:8090)                    │
├─────────────────────────────────────────────────┤
│            PocketBase v0.39.0 (Docker)           │
│  users (auth) | projects | asset_library        │
│  canvas_data                                    │
└─────────────────────────────────────────────────┘
```

### 核心原则

- **写 IndexedDB 是必须成功的**，写 PocketBase 是异步可失败的
- **登录时从 PocketBase 拉取数据灌入 IndexedDB**
- 数据以 `ProjectState` JSON blob 存入 `projects.data`
- API Key 存在浏览器 localStorage / 模型注册中心，PB `users.api_key` 备用

## 三、当前状态

### ✅ 已完成（全部）

| 模块 | 状态 | 说明 |
|------|------|------|
| Docker 部署 | ✅ | `docker-compose.yaml`，挂载 `pb_data` 和 `pb_migrations` |
| PB 客户端 | ✅ | `src/api/pocketbase.ts`，含 `ensureValidAuth()` 和自动刷新 |
| 认证 | ✅ | 注册/登录/登出/密码重置/Profile 更新 |
| Token 刷新 | ✅ | 30 分钟定时 `authRefresh()` + 操作前校验 |
| 项目同步 | ✅ | `hybridStorageService` 双写 PB，按 `data.id` + `userId` 过滤 |
| 画布同步 | ✅ | `canvasSyncService`，load 去重，切换项目清除定时器 |
| 资产库同步 | ✅ | 图片上传 PB file 字段，去重（`type + data.id`） |
| 死代码清理 | ✅ | 删除 `src/api/supabase.ts` 等 5 文件 + `supabase/` 目录 + 卸载包 |
| 用户 Profile | ✅ | PB `users` 集合添加 `api_key` 字段，`updateRule` 授权 |
| 密码重置 | ✅ | 登录页「忘记密码」链接，调用 `requestPasswordReset` |
| 测试 | ✅ | 76 个 Vitest 测试通过（3 个新测试文件覆盖认证/资产库/画布） |

### PocketBase 集合 Schema

#### `users` (内置 auth 集合)

| 字段 | 类型 | 说明 |
|------|------|------|
| email | email | 登录账号 |
| password | password | 加密存储 |
| name | text | 用户昵称 |
| avatar | file | 头像 |
| api_key | text | AI 厂商 API Key（备用，主存在 localStorage） |

API Rules: `updateRule = @request.auth.id = id`

#### `projects` (type: base)

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | relation→users | 所属用户 |
| title | text | 项目标题 |
| data | json | `ProjectState` JSON blob（含剧本、角色、场景等） |
| project_name | text | 冗余字段，方便列表 |
| created/updated | autodate | 时间戳 |

#### `asset_library` (type: base)

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | relation→users | 所属用户 |
| type | select | `character` / `scene` / `prop` / `turnaround` |
| name | text | 资产名称 |
| data | json | 资产完整数据（含 `imageUrl`） |
| image | file | 资产图片（PocketBase 文件存储） |
| project_id | relation→projects | 可选，来源项目 |
| project_name | text | 来源项目名称 |

#### `canvas_data` (type: base)

| 字段 | 类型 | 说明 |
|------|------|------|
| project_id | text | 项目 ID（文本字段，存储本地 UUID） |
| layers | json | 图层数据 |
| offset/scale | json/json/number | 画布视口状态 |
| version | number | 版本号，冲突检测 |

## 四、环境搭建

### 启动 PocketBase

```bash
docker compose up -d pocketbase

# 管理员登录
http://127.0.0.1:8090/_/
# admin@wlai.com / admin123456
```

### 启动前端

```bash
npm run dev
# → http://localhost:3001
```

## 五、代码文件清单

### 核心文件

| 文件 | 说明 |
|------|------|
| `src/api/pocketbase.ts` | PB 客户端 + `ensureValidAuth()` + 定时刷新 |
| `src/stores/authStore.ts` | 认证状态: signIn/signUp/signOut/resetPassword/changePassword/updateProfile |
| `services/hybridStorageService.ts` | 混合存储: 项目 + 资产库 CRUD、去重、同步 |
| `services/canvasCloudApi.ts` | 画布云端 CRUD |
| `services/canvasSyncService.ts` | 画布同步服务（load 去重、防抖保存） |
| `services/imageStorageService.ts` | 图片本地 IndexedDB 存储 |
| `docker-compose.yaml` | Docker 编排（PB + 前端 Nginx） |

### 测试文件

| 文件 | 覆盖 |
|------|------|
| `tests/pb-auth.test.ts` | 注册/登录/登出/密码重置/Profile/会话恢复 (12 用例) |
| `tests/hybridStorage.test.ts` | 资产库去重/同步/类型过滤/isOnline (11 用例) |
| `tests/canvas-sync-dedup.test.ts` | load 去重/cleanup/无 projectId (4 用例) |

### 已清理的死代码

| 文件 | 原因 |
|------|------|
| `src/api/supabase.ts` | Supabase 客户端 |
| `src/api/projects.ts` | Supabase CRUD |
| `src/api/assetLibrary.ts` | Supabase CRUD |
| `src/api/storage.ts` | Supabase Storage |
| `src/api/video.ts` | Supabase Edge Function 调用 |
| `src/types/supabase/` | Supabase 类型定义 |
| `supabase/` (整个目录) | 3 个 Edge Function + SQL 迁移 |
| `@supabase/supabase-js` | npm 依赖已卸载 |

## 六、常见问题

### Q: 登录/注册报 400？
- 检查 `VITE_POCKETBASE_URL` 是否正确，PocketBase 是否在运行
- `curl http://127.0.0.1:8090/api/health` 返回 200 则正常

### Q: 密码重置不生效？
本地开发无邮件服务器，PocketBase 会在日志输出重置链接：
```bash
docker logs wl-ai-director-pb 2>&1 | grep password
```

### Q: 资产库图片不显示？
检查 `data.imageUrl`：
- `local:{id}` → 图片在 IndexedDB 中
- `http://.../api/files/...` → 图片在 PocketBase file 字段中

### Q: Token 过期了怎么办？
自动处理：每 30 分钟 `authRefresh()` 延长一次。操作前也会调用 `ensureValidAuth()` 校验。

### Q: Docker 重启后数据丢失？
不会。`pb_data/` 和 `pb_migrations/` 都挂载了 host volume。
