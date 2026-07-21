# VideoConfirmDialog 开发文档

## 设计目标

在用户点击"生成视频"前，弹出一个统一的参数确认窗口，展示最终发送给后端 API 的全部参数，让用户审查确认后再触发实际生成。

## 组件位置

- `components/StageDirector/VideoConfirmDialog.tsx` — 弹框组件
- `components/StageDirector/VideoGenerator.tsx` — 集成弹框逻辑

## Props 接口

```typescript
interface VideoConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;  // 确认后直接触发 VideoGenerator 的 handleGenerate

  // === 镜头信息 ===
  shotId: string;
  shotIndex: number;
  cameraMovement?: string;
  shotSize?: string;
  actionSummary?: string;
  cameraChoreography?: CameraChoreography;

  // === 生成模式 ===
  mode: VideoGenerationMode;

  // === 模型信息 ===
  modelName: string;
  modelProvider: string;

  // === 视频规格 ===
  aspectRatio: AspectRatio;
  duration: VideoDuration;
  fps: number;
  width: number;
  height: number;

  // === 提示词 ===
  videoPrompt: string;        // 最终构建后的完整 prompt
  language: string;           // 用于 prompt 拼装来源展示
  eraContext?: string;        // 同上

  // === Prompt 拼装来源 ===
  fourGridDescriptions?: string[];   // shot.fourGrid.descriptions
  fourGridStatus?: string;           // shot.fourGrid.status
  nineGridPanels?: NineGridPanel[];  // shot.nineGrid.panels

  // === 参考图片（local:xxx 原始引用，通过 useImageLoader 加载） ===
  startKeyframeImageUrl?: string;
  endKeyframeImageUrl?: string;
  refGridImageUrl?: string;    // fourGrid 或 nineGrid 的 imageUrl
  backgroundImage?: string;
  timedKeyframes?: TimedKeyframe[];  // 用于 mkr 模式显示每帧缩略图

  // === 模式专属参数 ===
  gridType?: number;           // mkr-grid
  frameIndexes?: number[];     // mkr-grid（已换算为实际帧索引）
  frameIndexesPercent?: number[]; // mkr-grid（原始百分比，用于显示）
}
```

## 数据流

```
VideoGenerator.tsx
  │
  ├─ state: showConfirmDialog: boolean
  │
  ├─ 用户点击"开始生成视频"
  │     ↓
  ├─ setShowConfirmDialog(true)  ← 不立即调 API
  │     ↓
  ├─ 渲染 <VideoConfirmDialog .../>
  │     ↓
  ├─ 用户审查参数，点击"确认生成"
  │     ↓
  ├─ VideoConfirmDialog.onConfirm()
  │     ↓
  ├─ VideoGenerator.handleConfirmGenerate()
  │     ↓
  ├─ setShowConfirmDialog(false)
  ├─ 根据 activeTab 调用 onGenerate / onGenerateAdvanced
  └─ 生成流程启动
```

## 图片加载方案

所有图片通过 `useImageLoader(imageUrl)` hook 加载：
- 输入: `local:xxx` 原始引用
- 输出: `{ src: blob:xxx | null, loading: boolean, error: boolean }`
- 组件内部自动从 IndexedDB 读取并生成 object URL

不需要在弹框中调用 `resolveForApi()`（那是上传前准备 base64 用的）。

## 不同模式差异化显示

| 区块 | basic | msr | mkr | mkr-grid |
|---|---|---|---|---|
| 参考图片标题 | "首帧 / 尾帧" | "参考图 ×N / 背景" | "关键帧 ×N" | "宫格整图" |
| 额外参数 | — | 背景图 (bg) | 关键帧位置百分比 | gridType / frame_indexs |
| 图片数量 | 1~2 | 1~5 | timedKeyframes.length | 1 |
| 分辨率说明 | 来自高级面板 | 来自高级面板 | 来自高级面板 | 强制 640×320 |

## 自测清单

1. basic 模式：确认弹框显示首帧/尾帧缩略图，prompt 正确
2. msr 模式：显示多张参考图缩略图，背景图标记正确
3. mkr 模式：timedKeyframes 列表每帧带缩略图和位置百分比
4. mkr-grid 模式：显示宫格整图、gridType、frame_indexs（百分比+实际帧号）
5. 弹框中点"取消"→ 不触发 API，弹框关闭
6. 弹框中点"确认生成"→ 弹框关闭，视频生成启动，生成进度条出现
7. 不同模式切换后在弹框中看到对应的参数
8. 图片加载失败时显示 fallback 占位
