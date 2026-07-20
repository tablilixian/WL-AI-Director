# 推演 → 宫格 → 视频 一体化流程设计

> 设计日期: 2026-07-16  
> 覆盖范围: StageDirector + Canvas 推演能力 + Video Generation Advanced Mode

---

## 一、现状分析

### 已有能力（散落在各模块）

| 能力 | 位置 | 输入 | 输出 |
|------|------|------|------|
| **VLM 画面分析** | `callDramaBackendVLApi` | image + prompt | 结构化画面描述 |
| **剧情推演 API** | `callDramaBackendDeductionApi` | image + analysis prompt + deduction prompt | `{analysis, deduction}` 结构化结果 |
| **四宫格生成** | `StoryDeductionPanel` | image + 4 descriptions → `image2storyboard` | 4格合成图 |
| **单帧推演→图片** | `DeductionPanel` | image → deduction → LLM → image2image | 单张推演图 |
| **宫格切分** | `image2splitegrid` | image + row/column | 格子图片列表 |
| **MKR Grid 视频** | `image2videomkrgrid` | image + gridType + frameIndexes | 视频 |
| **MKR 多关键帧视频** | `image2videomkr` | images[{image, frame_index}] | 视频 |

### 缺口

1. **推演流程在 Canvas 中（创意画布），不在 StageDirector（导演工作台）** —— 用户不能在视频生成界面直接做推演
2. **MKR Grid 的 gridType/frameIndexes 无 UI 控件** —— 写死 4 和 [0,0,0,0]
3. **推演结果与视频生成未打通** —— 推演生成的宫格图不会自动进入视频生成流程
4. **image2videomkrgrid 的 gridType/frameIndexes 语义需要与推演联动** —— 宫格是 AI 生成的，用户需要选择哪些格参与视频

---

## 二、目标流程（完整一体化）

```
StageDirector — 视频生成面板
═══════════════════════════════════════════════════

[阶段1] 画面分析 & 推演
─────────────────────────────────
  首帧图 + 剧情方向(用户输入)
        │
        ▼
  VLM 画面分析 (POST /api/v1/generate/image2vl)
        │  输出: 场景、构图、光影、角色、情绪、镜头语言
        ▼
  LLM 剧情推演 (POST /api/v1/generate/deduction)
        │  或本地调用 AI 生成4个分镜描述
        │  输出: 4个分镜文字描述
        ▼
  用户编辑分镜描述 (可手工修改)

[阶段2] 宫格图生成
─────────────────────────────────
  4个分镜描述 + 首帧参考图
        │
        ▼
  生成 4 宫格图 (POST /api/v1/generate/image2storyboard)
        │  gridnum=4, image=首帧
        │  输出: 4格合成图
        ▼
  保存到 shot.nineGrid
  在 UI 中预览宫格图

[阶段3] 格子选择 → MKR Grid 视频
─────────────────────────────────
  宫格图 + 用户选择格子的索引
        │
        ▼
  gridType: 4      (2×2 固定)
  frameIndexes: [0, 30, 60, 90]  (每格对应视频时间占比，用户可调)
        │
        ▼
  生成 MKR Grid 视频 (POST /api/v1/generate/image2videomkrgrid)
        │  image=宫格图, gridType=4, frame_indexs=[...]
        │  输出: 视频
        ▼
  保存到 shot.interval.videoUrl

═══════════════════════════════════════════════════
```

---

## 三、UI 设计方案

### 在 AdvancedVideoPanel 中新增"推演"区块

放在 mode selector 下方，仅 mkr-grid 模式时显示：

```
┌─────────────────────────────────────────┐
│  [基本]  [MSR]  [MKR]  [MKR Grid]      │  ← mode selector
├─────────────────────────────────────────┤
│  ▼ 画面推演（展开）                      │
│  ┌───────────────────────────────────┐  │
│  │ 参考图: [首帧缩略图]               │  │
│  │                                   │  │
│  │ 剧情方向: [textarea]              │  │
│  │ 例如：主角发现密道，决定探索...     │  │
│  │                                   │  │
│  │ [开始推演 → VLM 分析 + 生成 4 格] │  │
│  └───────────────────────────────────┘  │
│                                          │
│  ▼ 推演结果（VLM+LLM 完成后显示）       │
│  ┌───────────────────────────────────┐  │
│  │ 分镜1: [可编辑]    ▢ 选中         │  │
│  │ 分镜2: [可编辑]    ▢ 选中         │  │
│  │ 分镜3: [可编辑]    ▢ 选中         │  │
│  │ 分镜4: [可编辑]    ▢ 选中         │  │
│  │                                   │  │
│  │ [生成宫格图]                      │  │
│  └───────────────────────────────────┘  │
│                                          │
│  ▼ 宫格预览 & 视频参数                    │
│  ┌───────────────────────────────────┐  │
│  │ ┌────┬────┐                      │  │
│  │ │ 格1 │ 格2 │  ← 点击切换选中    │  │
│  │ ├────┼────┤                      │  │
│  │ │ 格3 │ 格4 │                     │  │
│  │ └────┴────┘                      │  │
│  │                                   │  │
│  │ 每格时间占比: [0%] [30%] [30%] [40%] │
│  │                                   │  │
│  │ gridType: 4  frameIndexes: [0,90,180,360] │
│  └───────────────────────────────────┘  │
│                                          │
│  [现在支持高级视频生成]                    │
└─────────────────────────────────────────┘
```

### 数据流

```
推演阶段:
  userInput narrativeDirection
    → VLM analyze startKeyframe (image2vl)
    → LLM deduce 4 descriptions (本地 AI / deduction API)
    → 4 descriptions → image2storyboard(gridnum=4) → 4-grid image
    → save to shot.nineGrid.imageUrl, shot.nineGrid.panels

格子选择阶段:
  user clicks grid cells → frameIndexes (参与视频的格子索引)
  user adjusts time ratio → timedKeyframes 或 frame_indexs
    → shot.interval.gridType = 4
    → shot.interval.frameIndexes = selected indexes
    → shot.interval.timedKeyframes = time ratios per grid

视频生成阶段:
  handleGenerateAdvanced({ mode: 'mkr-grid', ... })
    → refImage = shot.nineGrid.imageUrl
    → gridType = shot.interval.gridType
    → frameIndexes = shot.interval.frameIndexes
    → CALL image2videomkrgrid
```

---

## 四、涉及的改造点

| # | 改动 | 文件 | 描述 |
|---|------|------|------|
| 1 | **AdvancedVideoPanel 新增推演 UI** | `AdvancedVideoPanel.tsx` | 在 mkr-grid 模式下显示推演、格子选择控件 |
| 2 | **AdvancedVideoPanel 扩展 onParamsChange** | `AdvancedVideoPanel.tsx` | 新增 `gridType`, `frameIndexes` 输出 |
| 3 | **AdvancedVideoPanel 新增 Props** | `AdvancedVideoPanel.tsx` | `shotKeyframes`(已有), `startKeyframeImageUrl`, `onDeduction` 回调 |
| 4 | **VideoGenerator 扩展 advancedParams** | `VideoGenerator.tsx` | 增加 `gridType`, `frameIndexes` |
| 5 | **VideoGenerator 新增推演方法** | `VideoGenerator.tsx` | `handleDeduction()` → VLM + LLM + image2storyboard |
| 6 | **VideoGenerator 向 AdvancedVideoPanel 传推演回调** | `VideoGenerator.tsx` | `onDeduction` prop |
| 7 | **StageDirector 新增推演逻辑** | `index.tsx` | 或复用在 VideoGenerator 中 |
| 8 | **index.tsx 的 onSaveAdvancedParams** | `index.tsx` | 补充保存 `gridType`, `frameIndexes` |
| 9 | **index.tsx 的 handleAdvancedGenerateVideo** | `index.tsx` | 从 params 取 gridType/frameIndexes |
| 10 | **API: callImageApi 支持 storyboard 模式** | `imageAdapter.ts` | 已有 (`isStoryboard` + `gridnum`) |
| 11 | **API: callDramaBackendSpliteGridApi** | `imageAdapter.ts` | 已有，用于宫格切分 (备用) |

---

## 五、四宫格 mode 与现有九宫格 nineGrid 的关系

```
nineGrid (现有, 3×3)
  ─ 从剧本自动生成 9 个 panel 描述
  ─ AI 合成 9 格图
  ─ 用途: 九宫格分镜预览 + sora2nineGrid prompt

四宫格推演 (新增, 2×2)
  ─ 从首帧 + VLM + 用户剧情方向生成 4 个描述
  ─ AI 合成 4 格图 (image2storyboard)
  ─ 用途: mkr-grid 视频生成

两者共存:
  shot.nineGrid 扩展支持 4-grid:
  {
    type: '9grid' | '4grid',     // 新增
    imageUrl: string,
    panels: NineGridPanel[],
    ...
  }
  或新增 shot.fourGrid 字段
```

---

## 六、分步实施建议

```
Step 1 (当前 V1): 给 mkr-grid 加 gridType/frameIndexes UI
  ─ 先让现有 MKR Grid 模式可用
  ─ 允许用户选择格子和调整时间占比
  ─ 参数持久化到 shot.interval

Step 2: 推演入口 + VLM 分析 + LLM 描述生成
  ─ 在 AdvancedVideoPanel 新增推演 UI
  ─ 接入 callDramaBackendVLApi / callDramaBackendDeductionApi
  ─ 用户可编辑分镜描述

Step 3: 宫格图生成 + 打通 mkr-grid
  ─ 调用 image2storyboard 生成 4 格图
  ─ 保存到 shot.nineGrid (扩展类型)
  ─ 自动填充 gridType/frameIndexes
  ─ 用户点击"生成视频" → mkr-grid 模式

Step 4: 完善体验
  ─ 宫格切分 (image2splitegrid) 为独立图片
  ─ 允许导出单个格子
  ─ 时间占比可视化
```
