# WL AI Director × GenCanvas 集成开发文档

## 版本信息

| 项目 | 版本 |
|------|------|
| 文档版本 | v1.0 |
| 创建日期 | 2026-03-23 |
| 目标版本 | WL AI Director v2.x |

---

## 一、项目概述

### 1.1 背景

WL AI Director 是一款 AI 漫剧制作工具，采用**关键帧驱动**的工作流（剧本→分镜→关键帧→成片）。GenCanvas 是一款**无限画布 AI 媒体生成工具**，采用**画布优先**的交互方式。

两者的结合可以：
- 在漫剧制作流程中增加**可视化创作空间**
- 支持**自由排列**分镜、角色、素材
- 提供**图层级**的精细编辑能力

### 1.2 目标

将 GenCanvas 的核心画布能力集成到 WL AI Director，**不影响现有功能**。

### 1.3 范围

| 包含 | 不包含 |
|------|--------|
| 无限画布引擎 | GenCanvas 的 AI 生成逻辑 |
| 小地图导航 | （使用 WL AI Director 的模型） |
| 吸附对齐系统 | |
| LOD 渲染优化 | |
| 资产存储优化 | |

---

## 二、技术分析

### 2.1 现有架构

```
WL AI Director
├── 前端：React 19 + TypeScript + Vite + Tailwind CSS
├── 状态管理：Zustand
├── 存储：IndexedDB
├── AI 模型：AntSK + BigModel（OpenAI 兼容协议）
└── 工作流：剧本 → 分镜 → 关键帧 → 成片
```

### 2.2 GenCanvas 架构

```
GenCanvas
├── 前端：React 19 + TypeScript + Vite + Tailwind CSS
├── 状态管理：React useState（集中式）
├── 存储：IndexedDB（Blob 优化）
├── AI 模型：Google Gemini（原生 SDK）
└── 工作流：画布 → 图层 → 生成
```

### 2.3 技术栈兼容性

| 组件 | WL AI Director | GenCanvas | 兼容性 |
|------|----------------|-----------|--------|
| React | 19 | 19 | ✅ 完全兼容 |
| TypeScript | ✅ | ✅ | ✅ |
| Vite | ✅ | ✅ | ✅ |
| Tailwind CSS | v3 | v3 | ✅ |
| 状态管理 | Zustand | useState | ⚠️ 需适配 |
| 存储 | IndexedDB | IndexedDB | ✅ |
| AI SDK | fetch + OpenAI | @google/genai | ⚠️ 需适配 |

---

## 三、集成步骤

### 阶段一：基础设施搭建（2 天）

#### Step 1.1：创建模块目录结构

```
src/modules/canvas/
├── index.ts                    # 模块入口，导出公开 API
├── types/
│   ├── canvas.ts               # 画布相关类型定义
│   └── layer.ts                # 图层类型定义
├── components/
│   ├── InfiniteCanvas.tsx      # 无限画布主组件
│   ├── CanvasLayer.tsx         # 图层组件
│   ├── Minimap.tsx             # 小地图
│   ├── CanvasToolbar.tsx       # 画布工具栏
│   └── LayerPanel.tsx          # 图层面板
├── hooks/
│   ├── useCanvasState.ts       # 画布状态管理
│   ├── useCanvasControls.ts    # 画布控制（平移/缩放）
│   └── useSnapAlignment.ts     # 吸附对齐
├── services/
│   ├── assetStore.ts           # 资产存储（从 GenCanvas 迁移）
│   ├── thumbnailService.ts     # 缩略图生成
│   └── canvasModelService.ts   # 模型服务适配层
└── utils/
    ├── canvasMath.ts           # 数学工具函数
    └── layerUtils.ts           # 图层工具函数
```

#### Step 1.2：类型定义

```typescript
// types/canvas.ts

export interface CanvasState {
  layers: LayerData[];
  offset: { x: number; y: number };
  scale: number;
  selectedLayerId: string | null;
}

export interface LayerData {
  id: string;
  type: 'image' | 'video' | 'sticky' | 'text' | 'group' | 'drawing';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  thumbnail?: string;
  imageId?: string;
  thumbnailId?: string;
  title: string;
  createdAt: number;
  parentId?: string;
  color?: string;
  text?: string;
  annotations?: Annotation[];
}

export type Annotation = DrawingPath | TextAnnotation | RectangleAnnotation;

export interface DrawingPath {
  id: string;
  type: 'path';
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface RectangleAnnotation {
  id: string;
  type: 'rectangle';
  vertices: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}
```

#### Step 1.3：资产存储服务迁移

从 GenCanvas 复制 `services/assetStore.ts`，修改数据库名：
- DB_NAME: `wl-canvas-assets`

---

### 阶段二：核心画布功能（4 天）

#### Step 2.1：画布状态管理（Zustand）

```typescript
// hooks/useCanvasState.ts

import { create } from 'zustand';
import { LayerData } from '../types/canvas';

interface CanvasStore {
  layers: LayerData[];
  offset: { x: number; y: number };
  scale: number;
  selectedLayerId: string | null;
  history: LayerData[][];
  historyIndex: number;

  addLayer: (layer: LayerData) => void;
  updateLayer: (id: string, updates: Partial<LayerData>) => void;
  deleteLayer: (id: string) => void;
  setOffset: (offset: { x: number; y: number }) => void;
  setScale: (scale: number) => void;
  selectLayer: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
}
```

#### Step 2.2：无限画布组件

- 基于 CSS transform 实现平移和缩放
- 支持鼠标拖拽平移（Shift+拖拽或中键）
- 支持滚轮缩放（Ctrl+滚轮）

#### Step 2.3：图层组件

- 支持选中、拖拽、缩放
- 支持图片、视频、文字、便签等类型
- 支持加载状态和错误状态

#### Step 2.4：小地图组件

- 显示所有图层位置
- 支持点击跳转
- 支持拖拽平移

#### Step 2.5：吸附对齐系统

- 支持左对齐、右对齐、上对齐、下对齐、居中对齐
- 吸附阈值：5px

---

### 阶段三：模型服务适配（3 天）

#### Step 3.1：模型服务适配层

```typescript
// services/canvasModelService.ts

export class CanvasModelService {
  generateImage(prompt: string, options?: {...}): Promise<string>
  generateVideo(prompt: string, options?: {...}): Promise<string>
  improvePrompt(prompt: string): Promise<string>
}
```

支持两种提供商：
- AntSK：Gemini 格式
- BigModel：CogView 格式

---

### 阶段四：UI 集成与路由（2 天）

#### Step 4.1：添加路由

- 路径：`/canvas`
- 组件：`InfiniteCanvas`

#### Step 4.2：添加导航入口

- 侧边栏添加"创意画布"入口

---

### 阶段五：功能联动（3 天）

#### Step 5.1：分镜导入画布

```typescript
importStoryboardToCanvas(): void
```

#### Step 5.2：角色导入画布

```typescript
importCharacterToCanvas(characterId: string): void
```

#### Step 5.3：画布导出为分镜

```typescript
exportCanvasToStoryboard(): void
```

---

### 阶段六：测试与优化（3 天）

- 单元测试
- 集成测试
- 性能优化

---

## 四、时间估算

| 阶段 | 时间 | 产出 |
|------|------|------|
| 阶段一：基础设施 | 2 天 | 模块骨架 + 类型定义 + 存储服务 |
| 阶段二：核心画布 | 4 天 | 画布 + 图层 + 小地图 + 吸附 |
| 阶段三：模型适配 | 3 天 | AntSK + BigModel 适配 |
| 阶段四：UI 集成 | 2 天 | 路由 + 导航 |
| 阶段五：功能联动 | 3 天 | 分镜导入 + 角色导入 + 导出 |
| 阶段六：测试优化 | 3 天 | 测试 + 性能优化 |
| **总计** | **17 天** | 完整集成 |

---

## 五、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 与现有功能冲突 | 低 | 独立模块，通过路由隔离 |
| 性能问题 | 中 | LOD 渲染 + Blob 存储优化 |
| IndexedDB 存储空间 | 低 | 使用独立数据库名 |
| 样式不一致 | 低 | 使用 Tailwind CSS 统一风格 |
| API 兼容性 | 中 | 适配层封装差异 |

---

## 六、验收标准

### 功能验收

- [ ] 画布可以平移和缩放
- [ ] 可以创建/删除/移动/缩放图层
- [ ] 小地图正常工作
- [ ] 吸附对齐正常工作
- [ ] 可以调用 AI 生成图像
- [ ] 可以导入分镜到画布
- [ ] 可以导出画布为分镜
- [ ] 撤销/重做正常工作
- [ ] 数据持久化正常

### 性能验收

- [ ] 100 图层时 FPS > 30
- [ ] 图像加载时间 < 2s
- [ ] 保存/加载时间 < 1s

### 兼容性验收

- [ ] 不影响现有功能
- [ ] Chrome/Firefox/Safari 兼容
- [ ] 响应式布局正常
