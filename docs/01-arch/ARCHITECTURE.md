---
title: 架构设计
category: arch
status: active
audience: developer
created: 2026-01-01
updated: 2026-06-01
---

# WL AI Director — 架构设计

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 19 + TypeScript | 组件化 UI |
| 构建工具 | Vite | 开发服务器 + 打包 |
| 状态管理 | Zustand | 轻量级全局状态 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 本地存储 | IndexedDB (WLDB v7) | 项目数据、图片、视频 |
| 云端存储 | PocketBase v0.39.0 (Docker) | Auth + 文件存储 + 数据同步 |
| 同步层 | HybridStorageService | IndexedDB 主 + PocketBase 异步备份 |
| 国际化 | i18next | 中/英/日 |
| 图标 | lucide-react | 图标库 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                             │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ React UI │  │ Zustand  │  │ IndexedDB│             │
│  │ 组件层   │  │ 状态管理  │  │ (WLDB)   │             │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘             │
│       └──────────────┼─────────────┘                   │
│                      │                                 │
│              ┌───────▼───────┐                         │
│              │ HybridStorage │                         │
│              │   Service     │                         │
│              │ (Local-First) │                         │
│              └───────┬───────┘                         │
│                      │                                 │
│              ┌───────▼───────┐                         │
│              │  videoAdapter  │                         │
│              │ (直调 AI API)  │                         │
│              └───────────────┘                         │
└──────────────────────┬─────────────────────────────────┘
                       │ HTTP (127.0.0.1:8090)
              ┌────────▼────────┐
              │   PocketBase    │
              │  v0.39.0 Docker │
              │  Auth + DB + FS │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   AI 厂商 API   │
              │ (BigModel/Sora/ │
              │  Veo/Dall-E 等) │
              └─────────────────┘
```

**关键区别**: 不再有 Supabase Edge Functions，前端直接调用 AI 厂商 API。

---

## 模块划分

| 模块 | 路径 | 职责 |
|------|------|------|
| Auth | `src/stores/authStore.ts` | PocketBase 认证、Token 刷新 |
| PocketBase 客户端 | `src/api/pocketbase.ts` | PB SDK 单例 + ensureValidAuth |
| HybridStorage | `services/hybridStorageService.ts` | IndexedDB + PB 双写核心 |
| CanvasSync | `services/canvasSyncService.ts` | 画布同步（Local-First） |
| ImageStorage | `services/imageStorageService.ts` | 图片 IndexedDB 存储 |
| Dashboard | `components/Dashboard.tsx` | 项目列表管理 |
| Onboarding | `components/Onboarding/` | 新用户引导 |
| StageScript | `components/StageScript/` | 剧本解析、分镜生成 |
| StageAssets | `components/StageAssets/` | 角色/场景/道具 + 资产库 |
| StageDirector | `components/StageDirector/` | 导演工作台 |
| StagePrompts | `components/StagePrompts/` | 提示词管理 |
| StageExport | `components/StageExport/` | 导出、渲染追踪 |
| ModelConfig | `components/ModelConfig/` | 模型注册中心 |
| Adapters | `services/adapters/` | AI API 适配层（直调） |

---

## 数据流

### 存储策略
- **本地优先**: 所有数据先写 IndexedDB，保证离线可用
- **云端同步**: 登录时从 PocketBase 拉取，修改时异步双写
- **冲突解决**: 时间戳优先（最新覆盖）
- **Token 刷新**: 每 30 分钟 `authRefresh()` + 操作前校验

### AI 调用流程
```
UI 操作 → ModelRegistry 获取  → Adapter 适配  → AI API 调用  → 结果写回
          激活模型 + API Key   (无中间服务)                     IndexedDB
```

视频生成不走 Edge Function，`videoAdapter` 直接调用 BigModel/Sora API 并轮询。

---

## PocketBase 集合

| 集合 | 用途 | 关键字段 |
|------|------|---------|
| `users`（内置 auth） | 邮箱密码认证 | `email`, `password`, `name`, `api_key` |
| `projects`（base） | 项目元数据 + JSON blob | `user_id`, `title`, `data` |
| `asset_library`（base） | 资产库 | `user_id`, `type`, `data`, `image`(file) |
| `canvas_data`（base） | 画布持久化 | `project_id`(text), `layers`, `version` |

---

## 测试策略

| 层级 | 工具 | 覆盖 |
|------|------|------|
| 单元测试 | Vitest + jsdom | 认证流程、资产库去重、画布同步 |
| 集成测试 | Vitest + mock PB | hybridStorage 双写逻辑 |
| E2E | 手动 | 在真实 PB 容器上验证注册→登录→CRUD |

---

## ADR（架构决策记录）

### ADR-001: 采用混合存储架构
- **日期**: 2026-03
- **决策**: 使用 HybridStorageService 实现 IndexedDB + Supabase 双写
- **原因**: 支持离线工作 + 多设备同步
- **状态**: ❌ 已废弃（Supabase 已替换）

### ADR-002: 统一模型注册中心
- **日期**: 2026-03-12
- **决策**: 使用 ModelRegistry 管理所有 AI 模型配置
- **原因**: 支持动态添加/删除模型和厂商，三级 API Key 优先级
- **状态**: ✅ 已实施

### ADR-003: Supabase → PocketBase
- **日期**: 2026-05-29
- **决策**: 将云端存储从 Supabase 切换为自托管 PocketBase (Docker)
- **原因**: Supabase 海外延迟严重，PocketBase 本地部署低延迟
- **状态**: ✅ 已实施

### ADR-004: Local-First + 异步云端备份
- **日期**: 2026-05-29
- **决策**: 所有数据先写 IndexedDB，PocketBase 作为异步备份层
- **原因**: 离线可用，减少网络依赖；PB 失败不影响核心功能
- **状态**: ✅ 已实施

### ADR-005: 直接调用 AI 厂商 API
- **日期**: 2026-06-01（确认）
- **决策**: 视频/图片生成不走中间 Edge Function，前端直接调 AI API
- **原因**: Supabase Edge Functions 已清理；API Key 在浏览器 localStorage 管理
- **状态**: ✅ 已实施

---

> **追加新 ADR 格式**:
> 
> ### ADR-XXX: *(决策标题)*
> - **日期**: 
> - **决策**: 
> - **原因**: 
> - **状态**: ⏳ 待实施 / ✅ 已实施 / ❌ 已废弃
