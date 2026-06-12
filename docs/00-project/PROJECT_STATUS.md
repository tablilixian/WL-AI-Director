---
title: 项目状态
category: project
status: active
audience: pm
created: 2026-01-01
updated: 2026-06-01
---

# WL AI Director — 项目状态

---

## 📌 当前状态

**项目阶段**: 核心功能已完成，持续迭代中  
**技术栈**: React 19 + TypeScript + Vite + Zustand + PocketBase (Auth + 云端同步) + IndexedDB  
**存储架构**: 混合存储 — IndexedDB 本地优先 + PocketBase 异步云端同步

---

## 🎯 活跃 TODO

### P0 — 必须完成
| TODO | 状态 | 负责人 | 备注 |
|------|------|--------|------|
| *(无)* | ✅ | - | - |

### P1 — 重要
| TODO | 状态 | 负责人 | 备注 |
|------|------|--------|------|
| *(无)* | ✅ | - | - |

### P2 — 优化
| TODO | 状态 | 负责人 | 备注 |
|------|------|--------|------|
| 用户设置页面（昵称/API Key/修改密码） | 📝 待做 | - | `updateProfile` + `changePassword` 已实现，缺 UI |
| 密码重置 UI 提示本地日志路径 | 📝 待做 | - | 登录页已加忘记密码，但无邮件需要引导用户看日志 |

---

## 📊 功能模块状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 认证与授权 (Auth) | ✅ 完成 | PocketBase Auth，邮箱密码登录/注册/密码重置/Profile 更新 |
| 项目管理 (Dashboard) | ✅ 完成 | 项目 CRUD，列表展示，按用户过滤 |
| 引导流程 (Onboarding) | ✅ 完成 | 欢迎→工作流→API Key |
| 模型配置 (ModelConfig) | ✅ 完成 | 统一注册中心，三级 API Key，直接调用 AI API |
| 剧本阶段 (StageScript) | ✅ 完成 | 剧本解析、分镜生成、提示词 |
| 资产阶段 (StageAssets) | ✅ 完成 | 角色/场景/道具 + 资产库（本地+PB 双写） |
| 导演工作台 (StageDirector) | ✅ 完成 | 关键帧、九宫格、视频生成（videoAdapter 直调 AI） |
| 提示词管理 (StagePrompts) | ✅ 完成 | 按类型分组、编辑、优化 |
| 成片导出 (StageExport) | ✅ 完成 | EDL/FCPXML/ZIP 导出 |
| 画布 (Canvas) | ✅ 完成 | 跨项目隔离、load 去重、防抖保存 |
| 数据同步 | ✅ 完成 | HybridStorageService 双写，资产库去重 |

---

## 🔄 最近变更

| 日期 | 变更 | 类型 |
|------|------|------|
| 2026-06-01 | Supabase → PocketBase 全功能迁移完成 | 🏗️ 架构 |
| 2026-06-01 | Token 自动刷新、密码重置、Profile 更新 | ✨ 功能 |
| 2026-06-01 | 清理所有 Supabase 死代码 | 🧹 清理 |
| 2026-06-01 | 3 个新测试文件，76 用例通过 | 🧪 测试 |
| 2026-06-01 | 修复资产库跨类型去重、画布 load 去重 | 🐛 修复 |

---

## 📝 开发须知

1. **开发前**：更新此文件的活跃 TODO，标记当前任务为 `🔄 进行中`
2. **开发后**：更新功能模块状态表、最近变更记录
3. **文档同步**：新增功能时，在 `docs/active/REQUIREMENTS.md` 补充需求
4. **架构变更**：在 `docs/active/ARCHITECTURE.md` 记录 ADR（架构决策记录）
5. **PocketBase**：修改集合 schema 需在 `pb_migrations/` 创建迁移 JS 文件
