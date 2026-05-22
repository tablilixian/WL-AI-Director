# WL AI Director — 路线图

> **最后更新**: 2026-04-17
> **维护规则**: 每季度回顾更新

---

## 📅 短期（1-4 周）

> 当前迭代周期内的目标

| 目标 | 优先级 | 状态 | 备注 |
|------|--------|------|------|
| **视频编辑功能开发** | P0 | 🔄 开发中 | 分支: feature/video-editor |
| └── Phase 1: 基础设施 | - | ✅ | 类型定义、Store、工具函数 |
| └── Phase 2: 时间线核心 | - | ✅ | 多轨时间线、拖拽裁剪 |
| └── Phase 3: 预览播放 | - | ✅ | 视频预览、播放控制 |
| └── Phase 4: 吸附系统 | - | ✅ | 吸附对齐、快捷键 |
| └── Phase 5: 字幕功能 | - | ✅ | 文字编辑、样式、动画 |
| └── Phase 6: 音频功能 | - | ✅ | 音频图层、素材库 |
| └── Phase 7: 素材与持久化 | - | ✅ | 自动保存、数据恢复 |
| └── Phase 8: UI 打磨 | - | 🔄 | Sidebar 集成、路由配置 |

---

## 📅 中期（1-3 月）

> 下一个季度的目标

| 目标 | 优先级 | 状态 | 备注 |
|------|--------|------|------|
| **视频编辑 Phase 4-6** | P0 | 🔄 开发中 | 吸附系统、字幕、音频 |
| **视频编辑 Phase 7-8** | P1 | 🔄 开发中 | 素材管理、持久化、UI打磨 |
| **视频编辑 Beta 发布** | P1 | ⏳ | 完整功能可用 |

---

## 📅 长期（3-6 月）

> 未来半年的愿景目标

| 目标 | 优先级 | 状态 | 备注 |
|------|--------|------|------|
| **替换现有导出流程** | P1 | ⏳ | 功能完善后替换 StageExport |
| **高级特效功能** | P2 | 💡 规划中 | 转场、特效、滤镜 |
| **协作功能** | P2 | 💡 规划中 | 多用户同时编辑 |

---

## 📅 功能路线图详情

### 视频编辑模块

```
Phase 1: 基础设施 (Day 1-3) ✅
├── ✅ 类型定义 (types/editor.ts)
├── ✅ Zustand Store (stores/editorStore.ts)
├── ✅ 工具函数 (timeFormat, timeCalculation)
└── ✅ 吸附配置 Store (stores/snapStore.ts)

Phase 2: 时间线核心 (Day 4-8) ✅
├── ✅ Timeline.tsx 主体结构
├── ✅ Track.tsx / Clip.tsx 组件
├── ✅ Playhead.tsx / Ruler.tsx
├── ✅ useTimelineDrag.ts 拖拽逻辑
├── ✅ useTimelineTrim.ts 裁剪逻辑
└── ✅ SnapLine.tsx / SnapControls.tsx

Phase 3: 预览播放 (Day 9-12) ✅
├── ✅ PreviewCanvas.tsx
├── ✅ VideoLayer.tsx 多视频叠加
├── ✅ usePlayback.ts 播放控制
└── ✅ 时间线 ↔ 预览同步

Phase 4: 吸附系统 (Day 13-14) ✅
├── ✅ useSnapCalculation (stores/snapStore)
├── ✅ 吸附线 UI
└── ✅ SnapControls.tsx

Phase 5: 字幕功能 (Day 15-17) ✅
├── ✅ TextClip 类型
├── ✅ TextLayer.tsx Canvas 绘制
└── ✅ TextEditor.tsx 文字编辑面板

Phase 6: 音频功能 (Day 18-20) ✅
├── ✅ AudioLayer.tsx 音频播放
├── ✅ AssetLibrary.tsx 素材库
└── ✅ 音量控制

Phase 7: 素材与持久化 (Day 21-23) ✅
├── ✅ useProjectImporter.ts 导入
├── ✅ editorStorage.ts localStorage
└── ✅ useAutoSave.ts 自动保存

Phase 8: UI 打磨与集成 (Day 24-28) 🔄
├── ✅ 样式优化 (使用现有 CSS 变量)
├── ✅ 快捷键完善
├── 🔄 整体集成测试
└── 🔄 Beta 发布 (待集成到 Sidebar)

里程碑:
├── M1 (Day 7): 时间线 + 预览可运行 ✅
├── M2 (Day 14): 完整拖拽裁剪 + 吸附 ✅
├── M3 (Day 21): 字幕 + 音频功能 ✅
└── M4 (Day 28): Beta 发布 🔄
```

---

## 🗑️ 已取消

| 目标 | 取消原因 | 日期 |
|------|----------|------|
| *(无)* | - | - |
