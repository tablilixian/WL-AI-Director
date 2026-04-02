# WL AI Director — 架构设计

> **最后更新**: 2026-04-01  
> **维护规则**: 架构变更时追加 ADR（架构决策记录）

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 19 + TypeScript | 组件化 UI |
| 构建工具 | Vite | 开发服务器 + 打包 |
| 状态管理 | Zustand | 轻量级全局状态 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 本地存储 | IndexedDB (WLDB v7) | 项目数据、图片、视频 |
| 云端存储 | Supabase | Auth + Storage + 数据库 |
| 同步层 | HybridStorageService | 云/本地混合存储 |
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
│              └───────┬───────┘                         │
└──────────────────────┼─────────────────────────────────┘
                       │ HTTPS
              ┌────────▼────────┐
              │   Supabase      │
              │  Auth + Storage │
              │  + Edge Funcs   │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │   AntSK API     │
              │  (AI Models)    │
              └─────────────────┘
```

---

## 模块划分

| 模块 | 路径 | 职责 |
|------|------|------|
| Auth | `src/stores/authStore.ts` | 用户认证、云端同步触发 |
| Dashboard | `components/Dashboard.tsx` | 项目列表管理 |
| Onboarding | `components/Onboarding/` | 新用户引导 |
| StageScript | `components/StageScript/` | 剧本解析、分镜生成 |
| StageAssets | `components/StageAssets/` | 角色/场景/道具 + 资产库 |
| StageDirector | `components/StageDirector/` | 导演工作台 |
| StagePrompts | `components/StagePrompts/` | 提示词管理 |
| StageExport | `components/StageExport/` | 导出、渲染追踪 |
| ModelConfig | `components/ModelConfig/` | 模型注册中心 |
| AI Services | `services/ai/` | AI 调用封装 |
| Adapters | `services/adapters/` | API 适配层 |

---

## 数据流

### 存储策略
- **本地优先**: 所有数据先写 IndexedDB
- **云端同步**: 登录时从 Supabase 拉取，修改时双写
- **冲突解决**: 时间戳优先（最新覆盖）

### AI 调用流程
```
UI 操作 → ModelRegistry 获取激活模型 → Adapter 适配 → AI API 调用 → 结果写回 IndexedDB
```

---

## ADR（架构决策记录）

### ADR-001: 采用混合存储架构
- **日期**: 2026-03
- **决策**: 使用 HybridStorageService 实现 IndexedDB + Supabase 双写
- **原因**: 支持离线工作 + 多设备同步
- **状态**: ✅ 已实施

### ADR-002: 统一模型注册中心
- **日期**: 2026-03-12
- **决策**: 使用 ModelRegistry 管理所有 AI 模型配置
- **原因**: 支持动态添加/删除模型和厂商，三级 API Key 优先级
- **状态**: ✅ 已实施

---

> **追加新 ADR 格式**:
> 
> ### ADR-XXX: *(决策标题)*
> - **日期**: 
> - **决策**: 
> - **原因**: 
> - **状态**: ⏳ 待实施 / ✅ 已实施 / ❌ 已废弃
