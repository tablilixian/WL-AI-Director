# WL AI Director — 文档索引

> 本文档是 docs/ 目录的导航入口

---

## 📂 目录结构

```
docs/
├── active/                    # 活跃文档（随项目持续更新）
│   ├── PROJECT_STATUS.md      # 项目总览 + 当前进度 + 活跃 TODO
│   ├── REQUIREMENTS.md        # 需求文档（按模块分，标注状态）
│   ├── ROADMAP.md             # 路线图（短期/中期/长期规划）
│   └── ARCHITECTURE.md        # 架构设计 + ADR 记录
├── guides/                    # 用户/开发者指南
│   └── *(待添加)*
├── changelog/                 # 更新日志
│   └── CHANGELOG.md           # 所有变更记录
└── archive/                   # 历史归档（不再维护）
    ├── *(88 个历史文件)*
    └── WL/                    # 早期分析文档
```

---

## 🔗 快速导航

### 日常开发
- [项目状态](./active/PROJECT_STATUS.md) — 当前进度、活跃 TODO、最近变更
- [需求文档](./active/REQUIREMENTS.md) — 所有功能需求及状态
- [更新日志](./changelog/CHANGELOG.md) — 历史变更记录

### 架构与设计
- [架构设计](./active/ARCHITECTURE.md) — 技术栈、模块划分、ADR
- [路线图](./active/ROADMAP.md) — 短中长期规划

### 剧本质量提升
- [漫剧剧本质量提升方案](./active/SCRIPT-QUALITY-IMPROVEMENT.md) — 基于26条创作约束的剧本质量改进

### 历史参考
- [归档文档](./archive/) — 所有历史文档（不再维护）

---

## 📝 文档维护规则

1. **PROJECT_STATUS.md**: 每次开发前后更新（TODO 状态 + 最近变更）
2. **REQUIREMENTS.md**: 新增需求时追加，实现后更新状态
3. **ARCHITECTURE.md**: 架构变更时追加 ADR
4. **ROADMAP.md**: 每季度回顾更新
5. **CHANGELOG.md**: 每次提交重要功能时追加
6. **archive/**: 只读，不再修改
