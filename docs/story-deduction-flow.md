# 推演 → 视频 Flow 图层化方案

## 1. 目标

- 每个推演流程在画布上独立显示为一个 **flow 图层**
- 流程数据（VLM 分析/推演/宫格/视频）全部存储在 flow 图层的 `generationPrompt` 中
- 去掉 localStorage，利用画布自身的 undo/redo 和持久化
- 已完成的流程可 **导出视频** 到画布上成为一个独立的视频图层

## 2. 类型定义

### types/canvas.ts

在 `operationType` 中新增两个值：

```typescript
operationType?:
  | ...
  | 'story-deduction-flow'    // 🆕 推演流程占位图层
  | 'story-deduction-video';  // 🆕 推演导出的视频
```

### types/flow.ts

`FlowState` 保持不变，但字段中不再包含 `sourceLayerId`（从图层关联关系获取）。

`VideoResultData` 新增 `thumbnailUrl` 用于 flow 图层缩略图。

```typescript
export interface VideoResultData {
  keyframePrompts: KeyframePromptData[];
  videoUrl?: string;
  thumbnailUrl?: string;  // 视频首帧或四宫格预览图
  duration: number;
  fps: number;
}
```

## 3. 图层结构

### flow 占位图层

```
{
  id: string,
  type: 'image',                    // 复用 image 类型，用 operationType 区分
  x, y, width: 180, height: 120,
  src: '',                          // 留空，由 CanvasLayer 特殊渲染
  imageId?: string,                 // 源图缩略图
  title: '推演→视频',
  operationType: 'story-deduction-flow',
  generationPrompt: JSON.stringify({
    sourceLayerId: string,
    phase: FlowPhase,
    vlmAnalysis: VlmAnalysisData | null,
    deduction: DeductionData | null,
    storyboard: StoryboardResultData | null,
    video: VideoResultData | null,
    updatedAt: number,
  }),
}
```

### 导出的视频图层

```
{
  id: string,
  type: 'video',
  x, y, width: 640, height: 360,
  src: playableUrl,                 // blob URL
  imageId: string,                  // video:xxx ID
  title: '推演→视频',
  operationType: 'story-deduction-video',
  sourceLayerId: flowLayerId,
  duration: number,
  generationPrompt: JSON.stringify(flowStateWithoutVideo),
}
```

## 4. 画布渲染

### CanvasLayer.tsx — `renderContent()` 新增 `case 'story-deduction-flow'`

渲染一个卡片 UI，不显示图片/视频内容：

```
┌──────────────────────┐
│ 🎬 推演→视频  ● 2/5  │  ← 标题 + 步骤圆点
│ ┌──────┐              │
│ │源图缩  │  进度条     │  ← 源图缩略图(40x40) + 进度
│ └──────┘  步骤: 分析   │
└──────────────────────┘
```

- 未完成：灰色边框 + 黄色进度点
- 已完成：绿色边框 + 缩略图替换为视频首帧/宫格预览 + 右下播放图标

通过 `resolveImageSrc()` 将 `flowLayer.imageId` 解析出缩略图用于展示。

## 5. 交互流程

### 5.1 创建 flow

右键图片 → **🎬 推演→视频**：

1. 查 `sourceLayerIds` 包含该图的 flow 图层
   - 有 → 打开操作卡（见 5.3）
   - 无 → 创建 flow 占位图层，打开面板
2. flow 图层定位在源图右下 30px

### 5.2 面板数据流

`StoryDeductionFlowPanel` 接收 `flowLayerId` 而非 `sourceLayerId`：

```
props: { flowLayerId: string; onClose: () => void }
```

- 初始化：从 `layers[flowLayerId].generationPrompt` 解析 FlowState
- 每步保存：`updateLayer(flowLayerId, { generationPrompt: JSON.stringify(newFlowState) })`
- 完成时：标记 `phase: 'done'`，更新 `imageId` 为视频首帧/宫格预览

### 5.3 操作卡

点击 flow 图层 → 弹出 `FlowOperationCard`（复用现有 overlay 面板模式）：

```
┌──────────────────────────────────┐
│ 🎬 推演→视频                      │
│ 状态: [进行中⚡ / 已完成✅]        │
├──────────────────────────────────┤
│ ┌────┐  源图: xxx.jpg            │
│ │缩略│  进度: 步骤 2/5 · AI分析   │
│ └────┘  创建: 2026-07-29         │
│                                  │
│  ─── 操作 ───                    │
│                                  │
│  [进行中]                         │
│    ├ 继续推演                     │
│    └ 删除                         │
│                                  │
│  [已完成]                         │
│    ├ 导出视频 → 画布              │
│    ├ 重新生成                     │
│    └ 删除                         │
└──────────────────────────────────┘
```

### 5.4 导出视频

操作卡 → **导出视频 → 画布**：

1. `addLayer({ type: 'video', operationType: 'story-deduction-video', ... })`
2. 视频图层定位在 flow 图层下方 30px
3. 更新 flow 图层 `src` 为视频首帧缩略图

### 5.5 重新生成

操作卡 → **重新生成**：

1. 重置 `generationPrompt` 到初始状态（只保留 `sourceLayerId`）
2. 打开面板从步骤 1 开始

### 5.6 删除

操作卡 → **删除**：

1. 删除 flow 图层
2. 可选是否级联删除已导出的视频图层

## 6. 文件修改清单

| 文件 | 修改内容 |
|---|---|
| `src/modules/canvas/types/canvas.ts` | `operationType` 新增 `story-deduction-flow`、`story-deduction-video` |
| `src/modules/canvas/types/flow.ts` | 无变化（保持现有类型） |
| `src/modules/canvas/components/CanvasLayer.tsx` | `renderContent()` 新增 `operationType === 'story-deduction-flow'` 分支 |
| `src/modules/canvas/components/ImageActionMenu.tsx` | 修改 `story-deduction-flow` action：查已有 flow / 创建新 flow |
| `src/modules/canvas/components/FlowOperationCard.tsx` | **新建** — 操作卡组件 |
| `src/modules/canvas/components/StoryDeductionFlowPanel.tsx` | 改为接收 `flowLayerId`，读写图层数据 |
| `src/modules/canvas/components/steps/StepVideo.tsx` | 去掉自动 addLayer，改为写入 `generationPrompt`；导出时再创建视频层 |
| `src/modules/canvas/components/steps/StepStoryboard.tsx` | 去掉 `handleConfirm` 中的 addLayer（移至 flow panel） |
## 7. 界面变更摘要

| 新增/修改 | 说明 |
|---|---|
| Flow 图层卡片 | 画布上可见的推演流程节点，显示进度和状态 |
| FlowOperationCard | 点击 flow 图层弹出的操作卡 |
| 面板改为图层存储 | 不再依赖 localStorage，数据随画布保存 |
| 视频导出按钮 | 完成的流程可将视频导出到画布 |
