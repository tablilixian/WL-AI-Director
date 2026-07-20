# 视频生成高级模式 — 使用说明 & 待修复清单

> 整理日期: 2026-07-16  
> 对应代码: `components/StageDirector/VideoGenerator.tsx`, `AdvancedVideoPanel.tsx`, `orchestrator.ts`  
> 后端 API: drama backend (`/api/v1/generate/image2videomsr`, `image2videomkr`, `image2videomkrgrid`)

---

## 一、整体流程

```
VideoGenerator (基本/高级页签)
  │
  ├─ 基本页签 → handleGenerateVideo (index.tsx:360)
  │    └─ generateVideo() → Sora async / Veo sync
  │
  └─ 高级页签 → handleAdvancedGenerateVideo (index.tsx:492)
       └─ videoOrchestrator.generate()
            ├─ basic    → generateVideo()           [同基本页签]
            ├─ msr      → generateVideoMsr()         → POST /image2videomsr
            ├─ mkr      → generateVideoMkr()         → POST /image2videomkr
            └─ mkr-grid → generateVideoMkrGrid()     → POST /image2videomkrgrid
```

---

## 二、四种模式详解

### 2.1 basic 模式（基本模式）

| 项目 | 内容 |
|------|------|
| **入口** | 高级页签中选择"基本模式" |
| **参数来源** | `shot.interval` 或默认值 |
| **核心字段** | `mode: 'basic'` |
| **触发按钮** | 底部的"开始生成视频"按钮 |

**参数填充**：
```
mode:        shot.interval?.mode         || 'basic'
fps:         shot.interval?.fps          || 30
width:       shot.interval?.width        || getDefaultResolution(ratio).width
height:      shot.interval?.height       || getDefaultResolution(ratio).height
timedKeyframes: shot.interval?.timedKeyframes || []
backgroundImage: shot.interval?.backgroundImage
```

**Orchestrator 请求体** (`index.tsx:614-633`)：
```typescript
{
  mode: 'basic',
  prompt: videoPrompt,
  startImage: startKf → resolveForApi,
  endImage: endKf → resolveForApi (或 ''),
  modelId: params.modelId,
  aspectRatio: params.aspectRatio,
  duration: params.duration,
  /* ⚠️ 以下字段在 basic 模式被忽略 */
  width: params.width,
  height: params.height,
  fps: params.fps,
}
```

**实际调用链路**：
```
orchestrator.generateBasic()
  → videoService.generateVideo()
    → BigModel async: 创建任务 → 轮询 → 下载
    → Veo sync: chat/completions → 提取 MP4 URL
```

---

### 2.2 msr 模式（多帧超分）

| 项目 | 内容 |
|------|------|
| **入口** | 高级页签中选择"MSR 多帧超分辨率增强" |
| **核心字段** | `mode: 'msr'` |
| **背景图** | 可选，暂未实现文件选择器 |
| **后端地址** | `POST /api/v1/generate/image2videomsr` |

**Orchestrator 请求体** (`index.tsx:551-569`)：
```typescript
{
  mode: 'msr',
  prompt: videoPrompt,
  referenceImages: [startImageBase64],  // start keyframe
  backgroundImage: bg,                   // params.backgroundImage → resolveForApi
  modelId: params.modelId,
  aspectRatio: params.aspectRatio,
  duration: params.duration,
  width: params.width,                   // 默认 640
  height: params.height,                 // 默认 320
  fps: params.fps,                       // 默认 30
}
```

**API 请求体** (`imageAdapter.ts:1642-1745`)：
```typescript
POST /api/v1/generate/image2videomsr
{
  prompt,                                  // 视频 prompt
  width: 640, height: 320,                 // 分辨率
  duration: 5,                             // ⚠️ 写死 5，不传 UI 的 duration
  fps: 30,
  background: "uploaded_filename",         // 背景图文件名（上传后获得）
  image1?: "uploaded_filename",            // 参考图 1~4
  image2?: "...",
  image3?: "...",
  image4?: "...",
}
```

**上传流程**：图片先通过 `uploadImageToDramaBackend()` 上传，获得远端文件名，再填入请求体。

---

### 2.3 mkr 模式（多关键帧时间轴）

| 项目 | 内容 |
|------|------|
| **入口** | 高级页签中选择"MKR 多关键帧" |
| **核心字段** | `mode: 'mkr'`, `timedKeyframes: [{keyframeId, positionPercent}]` |
| **UI 控件** | 每个 timedKeyframe 显示时间轴滑块 (0~100%) |
| **后端地址** | `POST /api/v1/generate/image2videomkr` |

**参数填充**：
```
timedKeyframes: shot.interval?.timedKeyframes || []
  // 每个元素: { keyframeId: string, positionPercent: number (0-100) }
```

**Orchestrator 请求体** (`index.tsx:570-592`)：
```typescript
// 遍历 timedKeyframes 实时解析图片
const timedImages = await Promise.all(
  params.timedKeyframes.map(async (tk) => {
    const kf = shot.keyframes?.find(k => k.id === tk.keyframeId);
    const image = kf?.imageUrl ? await unifiedImageService.resolveForApi(kf.imageUrl) : '';
    return { image, frame_index: tk.positionPercent };
  })
);
{
  mode: 'mkr',
  prompt: videoPrompt,
  timedImages: [
    { image: "base64_or_uploaded", frame_index: 0 },
    { image: "base64_or_uploaded", frame_index: 50 },
    ...
  ],
  modelId: params.modelId,
  aspectRatio: params.aspectRatio,
  duration: params.duration,
  width: params.width,       // 默认 640
  height: params.height,     // 默认 320
  fps: params.fps,           // 默认 30
}
```

**API 请求体** (`imageAdapter.ts:1851-1945`)：
```typescript
POST /api/v1/generate/image2videomkr
{
  prompt,
  width: 640, height: 320,
  duration: 12, fps: 30,
  images: [
    { image: "uploaded_filename", frame_index: 0 },
    { image: "uploaded_filename", frame_index: 50 },
  ],
}
```

---

### 2.4 mkr-grid 模式（宫格分镜视频）

| 项目 | 内容 |
|------|------|
| **入口** | 高级页签中选择"MKR Grid 宫格" |
| **核心字段** | `mode: 'mkr-grid'`, 依赖 `shot.nineGrid.imageUrl` |
| **前提** | shot 必须先完成九宫格生成 |
| **后端地址** | `POST /api/v1/generate/image2videomkrgrid` |

**参数填充**：
```
gridType:     shot.interval?.gridType     || 4    // ⚠️ 无 UI 控件
frameIndexes: shot.interval?.frameIndexes || [0,0,0,0]  // ⚠️ 无 UI 控件
```

**Orchestrator 请求体** (`index.tsx:593-613`)：
```typescript
// 需先有 nineGrid 图
if (!shot.nineGrid?.imageUrl) throw new Error('九宫格分镜尚未生成');
const refImage = await unifiedImageService.resolveForApi(shot.nineGrid.imageUrl);
{
  mode: 'mkr-grid',
  prompt: videoPrompt,
  refImage,
  gridType: 4,                    // ⚠️ 写死
  frameIndexes: [0, 0, 0, 0],    // ⚠️ 写死
  modelId: params.modelId,
  aspectRatio: params.aspectRatio,
  duration: params.duration,
  width: params.width,
  height: params.height,
  fps: params.fps,
}
```

**API 请求体** (`imageAdapter.ts:1752-1849`)：
```typescript
POST /api/v1/generate/image2videomkrgrid
{
  prompt,
  width: 640, height: 320,
  duration: 12, fps: 30,
  gridtype: 4,                    // 宫格类型: 4=2x2, 6=?, 9=3x3
  frame_indexs: [0, 0, 0, 0],    // 选中格子索引
  image: "uploaded_ninegrid_filename",
}
```

---

## 三、视频 Prompt 构建规则

`buildVideoPrompt()` (`utils.ts:261-331`)

```
输入:
  - actionSummary:          来自 shot
  - cameraMovement:         来自 shot (有 cameraChoreography 时被替换)
  - modelId:                当前选中模型
  - language:               项目语言
  - nineGrid?:              九宫格数据（仅 mkr-grid / nineGrid 模式）
  - cameraChoreography?:    运镜编排

逻辑分支:
  1. 有 cameraChoreography → 用编排描述替换 cameraMovement
  2. 有 nineGrid + async 模型 → sora2NineGrid 模板
     - 9 格 panel 描述每格截断 60 字
     - 计算 "每秒播放几格" (totalFrames / duration)
  3. async 模型 (sora-2 / veo_3_1_fast) → sora2 模板
  4. sync 模型 (veo) → veo.simple 模板
  5. 末尾追加: eraContext + knowledgeBase
```

---

## 四、参数持久化与预设

### 4.1 Tab 切换持久化

```
Advanced Tab 切走时 →
  cleanup effect [VideoGenerator.tsx:203-209] 调用
  onSaveAdvancedParams(advancedParams)
    → updateShot → 写入 shot.interval { mode, fps, width, height, backgroundImage, timedKeyframes }
```

### 4.2 预设系统

```
保存:
  1. 点击 "将当前参数保存为预设"
  2. 输入名称 + 可选描述
  3. presetManager.createPreset() → 存入 project.videoPresets[]

应用:
  1. 点击预设列表中的某项
  2. presetManager.loadPreset() → 迁移版本
  3. updateShot → 写入 shot.interval

删除:
  点击预设旁的垃圾桶图标 → 从 project.videoPresets 移除
```

---

## 五、九宫格与高级模式的关系

| 场景 | 行为 |
|------|------|
| **九宫格整图作为起始帧** | `isNineGridMode=true` → **强制锁定 basic tab**，Advanced 按钮置灰 |
| **Advanced 手动选 mkr-grid** | 使用 `shot.nineGrid.imageUrl` 作为 refImage，**不需要** `isNineGridMode` 标志 |
| **九宫格模式下点高级 tab** | 按钮 disabled，tooltip 提示"九宫格模式下仅支持基本模式" |

---

## 六、待修复 / 不完整功能清单

| # | 优先级 | 问题 | 位置 | 描述 | 修复方案 |
|---|--------|------|------|------|---------|
| V1 | 🔴 P0 | **mkr-grid 的 gridType/frameIndexes 无 UI 编辑入口** | `index.tsx:602-603` | 写死了 `gridType: 4`、`frameIndexes: [0,0,0,0]`，AdvancedVideoPanel 中没有配置控件 | 在 AdvancedVideoPanel 的 mkr-grid 区块增加 gridType 下拉选择 (4/6/9) 和格子选择 UI |
| V2 | 🔴 P0 | **msr 背景图未实现文件选择器** | `AdvancedVideoPanel.tsx:334` `index.tsx:554` | UI 显示"生成时通过文件选择器完成"，但实际没有文件选择逻辑，backgroundImage 传空 | AdvancedVideoPanel 增加文件上传控件，生成时将上传后的 URL 存入 params.backgroundImage |
| V3 | 🟡 P1 | **basic 高级模式下 width/height/fps 参数被忽略** | `videoService.ts:375-533` | `generateVideo()` 不消费 width/height/fps，这些参数只在 msr/mkr 中有效 | 需要决定：要么在 basic 高级模式隐藏这些参数，要么让 generateVideo 也支持自定义分辨率 |
| V4 | 🟡 P1 | **msr 的 duration 写死 5 秒** | `visualService.ts:1615-1620` | `generateVideoMsr()` 的 duration 默认 5，不从 orchestrator 传入 | orchestrator 的 msr 分支把 `params.duration` 传给 `generateVideoMsr()` |
| V5 | 🟡 P1 | **E02 持久化在 interval 首次为 undefined 时不保存** | `index.tsx:1786` | `s.interval ? {...} : undefined`，如果 interval 从未创建则扔掉高级参数 | 改为无条件创建 interval：`interval: { ... (s.interval || {}), mode, fps, ... }` |
| V6 | 🟢 P2 | **悬空引用校验只在挂载时运行** | `AdvancedVideoPanel.tsx:76-105` | `useEffect([], [])` 只在挂载执行一次，面板打开后 keyframe 被删除时警告不更新 | 依赖 `shotKeyframes` 重新校验，或增加手动"刷新"按钮 |
| V7 | 🟢 P2 | **分辨率与 aspectRatio 无一致性校验** | `AdvancedVideoPanel.tsx:226-243` | 用户可设 width=300x300 但 aspectRatio=16:9 | 选择分辨率预设时自动匹配 aspectRatio，或在提交时做校验提示 |
| V8 | ⚪ P3 | **预设版本迁移逻辑为空** | `videoPresetManager.ts:85-88` | `if (migrated.version < 2) {}` 是 placeholder | 后续新增预设参数时在此处追加迁移逻辑 |
| V9 | 🟢 P2 | **API 参数名 typo `frame_indexs`** | `imageAdapter.ts:1776` | 应为 `frame_indexes`（缺一个 e），但这是后端接口字段名，前端需保持一致 | 确认后端接口名后统一修正，或通知后端修正 |

---

## 七、推荐修复顺序

```
第一轮 (P0 — 功能不可用 / 明显残缺)
  ├── V1: mkr-grid UI 缺失 gridType/frameIndexes 控件
  ├── V2: msr 背景图上传未实现
  └── V5: E02 持久化在 interval 首次 undefined 时不生效

第二轮 (P1 — 参数传递错误 / 不生效)
  ├── V3: basic 高级模式 width/height/fps 被忽略
  ├── V4: msr duration 写死 5 秒
  └── 完成后四种模式的参数链路全部打通

第三轮 (P2 — 完善体验)
  ├── V6: 悬空引用校验可刷新
  └── V7: 分辨率与 aspectRatio 一致性校验
```
