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

**项目阶段**: 核心功能已完成，P0/P1 优化接近完成，P2 进行中  
**技术栈**: React 19 + TypeScript + Vite + Zustand + PocketBase (Auth + 云端同步) + IndexedDB  
**存储架构**: 混合存储 — IndexedDB 本地优先 + PocketBase 异步云端同步

---

## 🎯 优化追踪

### 已完成优化项

| 编号 | 描述 | 优先级 | 涉及文件 |
|------|------|--------|---------|
| A01 | eraContext/knowledgeBase 注入 buildKeyframePrompt 和 buildVideoPrompt | P0 | `types.ts`, `utils.ts`, `index.tsx` |
| A02 | 英文电影术语保留指令注入 4 个提示词模板 | P1 | `visualService.ts`, `shotService.ts` |
| A04 | generateSceneVisualPrompt 使用 visualStyle 参数替代硬编码 'anime' | P1 | `visualService.ts`, `StageAssets/index.tsx` |
| A05 | enhanceWithQualityTags 正则扩展支持中文质量标签 | P2 | `promptConstants.ts` |
| B03 | buildKeyframePrompt 帧类型区分（start=场景建立, end=动作结论） | P0 | `utils.ts`, `shotService.ts` |
| B04 | 角色出场时间线约束注入 buildShotGenerationPrompt | P0 | `modelService.ts` |
| B05 | 情感权重镜头分配注入 buildShotGenerationPrompt | P1 | `modelService.ts` |
| B07 | 情感驱动运镜池引导注入 buildShotGenerationPrompt | P1 | `modelService.ts` |
| C06 | handleGenerateKeyframe 保存 basePrompt 而非合成 prompt | P2 | `index.tsx` |
| E02 | VideoGenerator 卸载时通过 onSaveAdvancedParams 持久化 advancedParams | P2 | `VideoGenerator.tsx`, `ShotWorkbench.tsx`, `index.tsx` |
| E03 | handleAdvancedGenerateVideo 在保存前调用 saveVideoToLocal | P2 | `index.tsx` |
| F01 | 视频时长 3-15s 自由选择（VideoDuration → number，滑块 UI，默认 10） | P0 | `types.ts`, `types/model.ts`, `modelRegistry.ts`, `AspectRatioSelector.tsx`, `index.tsx` |
| F02 | VLM 增强动作建议（generateActionSuggestion 注入关键帧画面分析） | P1 | `shotService.ts`, `index.tsx` |
| F03 | 动作编辑弹窗重新设计（关键帧缩略图 + VLM 分析折叠区 + 重新识别按钮） | P1 | `EditModal.tsx`, `index.tsx` |
| F04 | VLM 分析结果持久化到 JSON 导出（shot.vlmAnalysis） | P1 | `types.ts`, `index.tsx` |

### 未完成 / 待评估

| 编号 | 描述 | 优先级 | 状态 | 备注 |
|------|------|--------|------|------|
| A03, A06 | A 系列剩余项目 | - | ⏳ 待确认 | 需要重新评估必要性 |
| B01, B02, B06 | B 系列剩余项目 | - | ⏳ 待确认 | 需要重新评估必要性 |
| C01-C05 | C 系列剩余项目 | - | ⏳ 待确认 | 需要重新评估必要性 |
| E01 | E 系列剩余项目 | - | ⏳ 待确认 | 需要重新评估必要性 |
| 用户设置页面 | 昵称/API Key/修改密码 UI | P2 | 📝 待做 | `updateProfile` + `changePassword` 已实现，缺 UI |
| 密码重置引导 | 登录页提示查看本地日志获取密码重置链接 | P2 | 📝 待做 | 无邮件服务，需引导用户看日志 |
| 推演状态切换镜头过期 | VideoGenerator 的 fourGrid state 在切换 activeShot 后不更新 | P0 | 🐛 待修 | `useState(shot.fourGrid)` 只初始化不同步 |
| 视频生成实时进度 | orchestrator progress callback 未显示到 UI | P1 | 🚧 待做 | 当前仅 `logger.debug` |

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
| 导演工作台 (StageDirector) | ✅ 完成 | 关键帧、九宫格、推演（DeductionModal）、视频生成（advanced mode + orchestrator 调度） |
| 提示词管理 (StagePrompts) | ✅ 完成 | 按类型分组、编辑、优化 |
| 成片导出 (StageExport) | ✅ 完成 | EDL/FCPXML/ZIP 导出 |
| 画布 (Canvas) | ✅ 完成 | 跨项目隔离、load 去重、防抖保存 |
| 数据同步 | ✅ 完成 | HybridStorageService 双写，资产库去重 |

---

## 🔄 最近变更

| 日期 | 变更 | 类型 |
|------|------|------|
| 2026-07-21 | mkr-grid 推演→视频全链路：DeductionModal + 接口修复 | ✨ 功能 |
| 2026-07-21 | 修复 callDramaBackendVideoMkrGridApi 缺失导入 | 🐛 修复 |
| 2026-07-21 | 修复 frame_indexs 百分比未转帧序号 + 分辨率强制 640×320 | 🐛 修复 |
| 2026-07-21 | 修复 fetch 无超时导致永久挂起（AbortController + 10min） | 🐛 修复 |
| 2026-07-21 | 修复四宫格图片保存使用 raw local:xxx 而非 blob URL | 🐛 修复 |
| 2026-07-16 | P0/P1/P2 批量优化项完成（A/B/C/E 系列 + F 三合一增强） | ✨ 优化 |
| 2026-07-16 | 视频时长 3-15s 自由选择，滑块 UI | ✨ 功能 |
| 2026-07-16 | VLM 增强动作建议 + 画面分析结果持久化 | ✨ 功能 |
| 2026-07-16 | 动作编辑弹窗重设计（关键帧缩略图 + VLM 折叠区 + 重新识别） | 🎨 UI |
| 2026-07-16 | EditModal 图片改用 base64 解决 blob URL 回收报错 | 🐛 修复 |
| 2026-07-16 | VLM 分析结果存入 shot.vlmAnalysis，跟随 JSON 导入导出 | 🏗️ 架构 |
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
