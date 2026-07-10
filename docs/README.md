# WL AI Director — 文档索引

> 本文档是 `docs/` 目录的导航入口。

---

## 目录结构

```
docs/
├── 00-project/            # 项目管理 — 进度、路线图、需求（4篇）
├── 01-arch/               # 架构设计 — 技术方案、数据结构、设计决策（6篇）
├── 02-features/           # 功能说明 — 功能全览、机制分析（5篇）
├── 03-api-reference/      # API 参考 — 接口文档、配置说明（7篇）
├── 04-guides/             # 操作指南 — 面向用户/开发者的使用手册（2篇）
├── 05-troubleshooting/    # 问题诊断 — 问题复现、根因分析、修复方案（3篇）
├── 06-adrs/               # 决策记录 — 架构决策记录 (ADR)（1篇）
├── changelog/             # 变更日志
├── archive/               # 历史归档 — 已过时 / 不再维护的文档
├── README.md              # 本文件
```

---

## 各类文档说明

| 目录 | 受众 | 内容特征 | 维护周期 |
|------|------|----------|----------|
| `00-project/` | PM / 全员 | 进度跟踪、需求列表、路线图 | 持续更新 |
| `01-arch/` | 开发者 | 架构图、数据流、关键设计 | 架构变更时 |
| `02-features/` | 产品 / 测试 / 新成员 | 功能范围、使用流程、机制说明 | 功能迭代时 |
| `03-api-reference/` | 对接开发者 | 接口定义、参数说明、配置项 | 接口变更时 |
| `04-guides/` | 用户 / 运维 | 操作步骤、最佳实践、部署流程 | 按版本更新 |
| `05-troubleshooting/` | 维护者 | 问题现象、根因、修复 / 规避方案 | 问题修复后归档 |
| `06-adrs/` | 开发者 | 上下文、选项、决策及理由 | 每次重大决策 |

---

## 快速导航

### 进度与规划
- [项目状态](./00-project/PROJECT_STATUS.md) — 当前进度、活跃 TODO、最近变更
- [需求文档](./00-project/REQUIREMENTS.md) — 功能需求及状态
- [路线图](./00-project/ROADMAP.md) — 短中长期规划

### 架构与设计
- [架构设计](./01-arch/ARCHITECTURE.md) — 技术栈、模块划分、ADR
- [画布数据结构](./01-arch/canvas-data-structure.md) — 序列化 / 存储 / 自动保存
- [画布云端同步](./01-arch/canvas-cloud-sync-design.md) — Local-First 同步方案
- [视频编辑器设计](./01-arch/VIDEO-EDITOR-DESIGN.md)

### 功能说明
- [文生图功能全览](./02-features/文生图功能全览.md)
- [提示词功能全览](./02-features/提示词功能全览.md)
- [Canvas 功能集成计划](./02-features/canvas-feature-integration-plan.md)

### API 与配置
- [API 文档](./03-api-reference/api.md)
- [大模型接口文档](./03-api-reference/大模型接口文档.md)
- [LLM 提供商配置](./03-api-reference/llm-providers-config.md)
- [大模型 API 调用技术细节](./03-api-reference/大模型API调用技术文档.md)
- [模型配置指南](./03-api-reference/model-configuration-guide.md)

### 问题诊断
- [资产库删除问题](./05-troubleshooting/资产库删除问题诊断指南.md)
- [Blob URL 失效分析](./05-troubleshooting/blob_URL_失效问题分析.md)

### 操作指南
- [用户手册](./04-guides/user-guide.md)
- [部署指南](./04-guides/deployment-guide.md)

### 创作案例
- [漫剧创作实录：剑意传承](./漫剧创作实录-剑意传承.md) — 从故事构思到视觉提示词打磨的完整创作过程记录

### 架构决策
- [Supabase → PocketBase 迁移方案](./06-adrs/Supabase2PocketBase.md)

### 变更记录
- [更新日志](./changelog/CHANGELOG.md)

---

## 文档维护规则

1. **00-project/**: 每次开发前后更新 TODO 状态和最近变更
2. **01-arch/**: 架构变更时追加或修订
3. **02-features/**: 新增 / 修改功能时同步更新
4. **03-api-reference/**: 接口变更时同步
5. **04-guides/**: 按版本发布节奏更新
6. **05-troubleshooting/**: 问题修复后移入 `archive/`
7. **06-adrs/**: 每次重大决策追加一条记录
8. **archive/**: 只读，不再修改


