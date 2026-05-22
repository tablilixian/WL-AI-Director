# 视频编辑功能开发文档

> **创建时间**: 2026-04-17
> **分支**: feature/video-editor
> **状态**: 核心功能已完成，持续优化中
> **最后更新**: 2026-04-21

---

## 0. 开发日志

### 2026-04-21 更新

**Bug 修复**:
- ✅ 修复视频切换卡顿问题
  - 原因：VideoLayer 组件在 `isActive` 变化时卸载/重新挂载，导致 video 元素重新加载
  - 解决：改用 CSS `display: none` 隐藏非活跃视频，保持元素在 DOM 中
  - 添加预加载逻辑，提前 2 秒缓冲即将播放的片段
- ✅ 修复进入编辑页面后自动播放问题
  - 原因：`playState === 'stopped'` 时 VideoLayer 仍调用 `play()`
  - 解决：只有 `playState === 'playing'` 时才调用 `play()`
- ✅ 修复暂停后再播放从头开始问题
  - 原因：usePlayback RAF 循环中 `startTimeRef` 重置导致时间计算跳变
  - 解决：新增 `startCurrentTimeRef` 记录播放起始时间，使用增量计算

**提交**: `3625f2b` - fix: 修复视频播放卡顿和自动播放问题

---

## 1. 功能概述

### 1.1 目标
为项目新增一个独立的视频编辑页面，提供多轨时间线编辑能力，包括：
- 多轨时间线编辑（视频轨、音频轨、字幕轨）
- 片段拖拽、裁剪、分割
- 字幕编辑
- 音频编辑

### 1.2 位置
在现有 6 个页签中插入新页签，位于 `director`（导演工作台）和 `export`（成片与导出）之间：

```
1. script    - 剧本与故事 (Phase 01)
2. assets    - 角色与场景 (Phase 02)
3. director  - 导演工作台 (Phase 03) ← 生成视频片段
4. [editor]  - 视频编辑 ✨ (NEW) ← 在这里新增
5. export    - 成片与导出 (Phase 04)
6. canvas    - 创意画布 (Beta)
7. prompts   - 提示词管理 (Advanced)
```

### 1.3 数据来源
- **默认素材**: 从 `project.shots` 导入已完成片段
- **额外素材**: 允许用户上传新素材
- **数据关联**: `clip.sourceId` 关联原 `shot.id`

### 1.4 导出目标
- 生成新文件，不修改原 `project.shots`
- 功能完善后可替换现有导出流程

---

## 2. 技术架构

### 2.1 文件结构

```
src/
├── components/
│   └── VideoEditor/              ← 全新模块
│       ├── index.tsx             # 页面入口
│       ├── Preview/              # 预览区域
│       │   ├── PreviewCanvas.tsx
│       │   ├── VideoLayer.tsx
│       │   ├── TextLayer.tsx
│       │   └── PlaybackControls.tsx
│       ├── Timeline/              # 时间线区域
│       │   ├── Timeline.tsx
│       │   ├── Track.tsx
│       │   ├── Clip.tsx
│       │   ├── Playhead.tsx
│       │   ├── Ruler.tsx
│       │   └── TrackHeader.tsx
│       ├── Sidebar/               # 侧边面板
│       │   ├── EditorSidebar.tsx
│       │   ├── AssetLibrary.tsx
│       │   ├── Inspector.tsx
│       │   └── TextEditor.tsx
│       └── Toolbar/               # 工具栏
│           ├── EditorToolbar.tsx
│           └── SnapToggle.tsx
│
├── stores/
│   ├── editorStore.ts            # 主状态管理
│   └── snapStore.ts              # 吸附配置
│
├── hooks/
│   ├── useTimelineDrag.ts        # 拖拽逻辑
│   ├── useTimelineTrim.ts        # 裁剪逻辑
│   ├── useTimelineSplit.ts       # 分割逻辑
│   ├── usePlayback.ts            # 播放控制
│   ├── useSnapCalculation.ts     # 吸附计算
│   ├── useProjectImporter.ts     # 项目导入
│   ├── useKeyboardShortcuts.ts   # 快捷键
│   └── useAutoSave.ts            # 自动保存
│
├── services/
│   └── editorStorage.ts          # IndexedDB 存储
│
├── types/
│   └── editor.ts                 # 类型定义
│
└── utils/
    ├── timeFormat.ts              # 时间格式化
    └── timeCalculation.ts        # 时间计算
```

### 2.2 核心类型定义

```typescript
// types/editor.ts

// 轨道类型
type TrackType = 'video' | 'audio' | 'text';

// 单个轨道
interface Track {
  id: string;
  name: string;
  type: TrackType;
  locked: boolean;
  visible: boolean;
  clips: Clip[];
}

// 片段基础
interface Clip {
  id: string;
  trackId: string;
  sourceId: string;
  sourceType: 'video' | 'audio' | 'image';
  sourceUrl: string;
  thumbnailUrl?: string;

  // 时间信息（毫秒）
  startTime: number;
  duration: number;
  inPoint: number;
  outPoint: number;

  // 属性
  volume: number;
  speed: number;
  opacity: number;
}

// 文字片段
interface TextClip extends Clip {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor?: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  animation?: 'none' | 'fade' | 'slide' | 'pop';
}

// 音频片段
interface AudioClip extends Clip {
  type: 'audio';
  fadeIn: number;
  fadeOut: number;
}

// 编辑器完整状态
interface EditorState {
  projectId: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  currentTime: number;
  playState: 'playing' | 'paused' | 'stopped';
  duration: number;
  loop: boolean;
  playbackRate: number;
  selectedClipIds: string[];
  zoom: number;
  scrollPosition: number;
  activeTrackId: string | null;
  expandedTrackIds: string[];
}
```

### 2.3 状态管理

**独立 Zustand Store**:
- 不影响现有全局状态
- 内存状态 + IndexedDB 持久化
- 自动保存（30秒间隔）
- Undo/Redo 支持

---

## 3. 核心功能设计

### 3.1 多轨时间线

**轨道结构**:
- 视频轨道 (Video Track): 支持 30+ 个片段
- 音频轨道 (Audio Track): 背景音乐、音效
- 字幕轨道 (Text Track): 文字/字幕

**交互能力**:
| 功能 | 描述 |
|------|------|
| 拖拽移动 | 片段在轨道内/间移动 |
| 裁剪 | 拖拽片段边缘调整入出点 |
| 分割 | 在播放头位置切分片段 |
| 选择 | 单选/多选 (Shift/Cmd) |
| 删除 | 删除选中片段 |

### 3.2 吸附对齐

**吸附类型**:
| 类型 | 说明 |
|------|------|
| 边界吸附 | 片段首尾对齐 |
| 中心吸附 | 片段中心对齐 |
| 播放头吸附 | 对齐播放头位置 |
| 时间点吸附 | 对齐 0s, 5s, 10s 等 |

**配置项**:
- `enabled`: 是否开启
- `threshold`: 吸附阈值 (100ms - 1000ms)
- `snapToPlayhead`: 是否吸附到播放头
- `snapToMarkers`: 是否吸附到时间标记

**快捷键**: `Shift + M` 切换吸附

### 3.3 播放控制

**预览渲染架构**:
```
PreviewCanvas
├── VideoLayer (HTML5 Video 叠加)
│   └── 多视频按轨道顺序叠加
├── TextLayer (Canvas 绘制)
│   └── 当前时间点的文字片段
└── PlaybackControls
    ├── 播放/暂停
    ├── 跳转
    ├── 播放速率
    └── 时间显示
```

**同步机制**:
- 时间线拖拽 → seek()
- 播放 → RAF 循环更新 currentTime
- 点击标尺 → seek()

### 3.4 字幕功能

**能力**:
- 添加文字片段
- 样式：字体、大小、颜色、背景
- 位置：画布坐标 x, y
- 动画：淡入、滑入、弹出
- 对齐：左/中/右

**编辑方式**:
- 在时间线上添加 Text Clip
- 在 Sidebar 的 TextEditor 中编辑样式

### 3.5 音频功能

**能力**:
- 背景音乐上传
- 音视频分离（提取原音频）
- 音量调节（整体/分段）
- 淡入淡出

**轨道**:
- 独立的 Audio Track
- 音量曲线可视化（预留）

---

## 4. UI/UX 设计

### 4.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│  EditorToolbar: [切割] [复制] [删除] | [吸附🧲] | [缩放] [导出] │
├───────────────────────────────────────┬─────────────────────────┤
│                                       │   EditorSidebar         │
│         PreviewCanvas                 │   ┌─────────────────┐   │
│         (16:9 预览)                   │   │ [素材] [属性]   │   │
│                                       │   │ [文字]         │   │
│         [⏮] [▶/⏸] [⏭] 00:05/02:30 │   └─────────────────┘   │
├───────────────────────────────────────┴─────────────────────────┤
│  Timeline                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [时间标尺 Ruler]                                           ││
│  │ V1 🔒👁 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 视频轨道            ││
│  │ A1 🔒👁 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 音频轨道            ││
│  │ T1 🔒👁 │     ████     │ 字幕轨道                ││
│  │         [===========|==========]  │ 播放头               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 时间线交互

**片段组件结构**:
```
┌─Clip────────────────────────┐
│ [左侧手柄] 内容区域 [右侧手柄] │
│ 拖拽裁剪      拖拽移动     拖拽裁剪 │
└────────────────────────────┘
```

**视觉反馈**:
- 选中状态: 蓝色边框 + 高亮
- 拖拽状态: 半透明 + 阴影
- 吸附状态: 显示绿色对齐线

---

## 5. 数据持久化

### 5.1 存储策略

| 存储方式 | 用途 |
|----------|------|
| Zustand (内存) | 当前编辑状态 |
| IndexedDB | 本地持久化 |
| Key 格式 | `video-editor-${projectId}` |

### 5.2 自动保存

- 监听 `updatedAt` 变化
- 30 秒防抖保存
- 手动保存按钮

### 5.3 数据恢复

- 打开页面时检查 IndexedDB
- 存在则加载，不存在则创建默认轨道

---

## 6. 技术选型

| 技术 | 选型 | 理由 |
|------|------|------|
| 状态管理 | Zustand | 轻量、成熟、TypeScript 友好 |
| 持久化 | IndexedDB (idb) | 本地存储，无需后端 |
| 预览渲染 | HTML5 Video + Canvas | 成熟稳定，兼容性好 |
| 时间计算 | 自定义 Hooks | 完全可控 |
| 样式 | Tailwind + 现有 CSS 变量 | 保持一致性 |

---

## 7. 设计原则

| 原则 | 说明 |
|------|------|
| 功能内聚 | 相关功能在 VideoEditor/ 目录下 |
| 独立模块 | 独立 store、hooks，不共享状态 |
| 最小侵入 | 仅通过 Props 接收数据 |
| 数据解耦 | editorStore 可独立持久化 |
| 扩展性 | 预留 Sidebar、Toolbar 扩展位 |

---

## 8. 代码参考

> 以下是从讨论中整理的核心代码片段，开发时可参考。

### 8.1 吸附相关类型

```typescript
// 吸附点类型
type SnapPointType = 'clip-start' | 'clip-end' | 'clip-center' | 'playhead' | 'time-marker';

interface SnapPoint {
  type: SnapPointType;
  time: number;           // 时间位置（毫秒）
  clipId?: string;        // 关联的片段 ID
  trackId?: string;       // 关联的轨道 ID
  label: string;          // 显示标签
}

// 吸附配置
interface SnapConfig {
  enabled: boolean;        // 是否开启吸附
  threshold: number;       // 吸附阈值（毫秒），默认 500ms
  snapToPlayhead: boolean; // 是否吸附到播放头
  snapToMarkers: boolean;  // 是否吸附到时间标记
  snapToClipEdges: boolean; // 是否吸附到片段边界
  snapToClipCenter: boolean; // 是否吸附到片段中心
}

// 吸附结果
interface SnapResult {
  snapped: boolean;
  snappedTime: number;    // 吸附后的时间
  snapPoint: SnapPoint | null;
  distance?: number;       // 原始位置到吸附点的距离
}
```

### 8.2 拖拽状态与 Hook 骨架

```typescript
// 拖拽操作类型
type DragType = 'move' | 'trim-start' | 'trim-end' | 'split';

// 拖拽状态
interface DragState {
  type: DragType | null;
  clipId: string;
  startX: number;          // 鼠标起始 X
  startTime: number;       // clip 起始时间（原始）
  startDuration: number;    // clip 时长（原始）
}

// useTimelineDrag.ts 骨架
export const useTimelineDrag = () => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const { tracks, updateClip, snapToGuides } = useEditorStore();

  // 开始拖拽
  const handleDragStart = (clipId: string, clientX: number) => {
    const clip = findClip(clipId);
    setDragState({
      type: 'move',
      clipId,
      startX: clientX,
      startTime: clip.startTime,
      startDuration: clip.duration
    });
  };

  // 拖拽中
  const handleDragMove = (clientX: number) => {
    if (!dragState) return;
    const deltaX = clientX - dragState.startX;
    const deltaTime = pixelsToTime(deltaX);
    let newStartTime = dragState.startTime + deltaTime;
    newStartTime = snapToGuides(newStartTime, dragState.clipId);
    newStartTime = Math.max(0, newStartTime);
    updateClipPreview(dragState.clipId, { startTime: newStartTime });
  };

  // 结束拖拽
  const handleDragEnd = () => {
    if (!dragState) return;
    commitClipChange(dragState.clipId);
    setDragState(null);
  };

  return { handleDragStart, handleDragMove, handleDragEnd };
};
```

### 8.3 裁剪逻辑

```typescript
// useTimelineTrim.ts
export const useTimelineTrim = () => {
  // 左侧裁剪（调整起始点）
  const handleTrimStart = (clipId: string, newInPoint: number) => {
    const clip = getClip(clipId);
    const deltaInPoint = newInPoint - clip.inPoint;
    const deltaStartTime = deltaInPoint;

    updateClip(clipId, {
      inPoint: newInPoint,
      startTime: clip.startTime + deltaStartTime,
      duration: clip.duration - deltaStartTime
    });
  };

  // 右侧裁剪（调整结束点）
  const handleTrimEnd = (clipId: string, newOutPoint: number) => {
    const clip = getClip(clipId);
    const deltaOutPoint = newOutPoint - clip.outPoint;

    updateClip(clipId, {
      outPoint: newOutPoint,
      duration: clip.duration + deltaOutPoint
    });
  };
};
```

### 8.4 分割逻辑

```typescript
// 分割片段
const handleSplit = (clipId: string, splitTime: number) => {
  const clip = getClip(clipId);
  const splitPosition = splitTime - clip.startTime;

  if (splitPosition <= 0 || splitPosition >= clip.duration) return;

  const firstPart: Clip = {
    ...clip,
    id: `${clip.id}-split-1`,
    duration: splitPosition,
    outPoint: clip.inPoint + splitPosition,
  };

  const secondPart: Clip = {
    ...clip,
    id: `${clip.id}-split-2`,
    startTime: splitTime,
    duration: clip.duration - splitPosition,
    inPoint: clip.inPoint + splitPosition,
  };

  replaceClip(clipId, [firstPart, secondPart]);
};
```

### 8.5 吸附计算

```typescript
// 计算吸附点
const getSnapPoints = (
  tracks: Track[],
  currentClipId?: string,
  excludeTrackId?: string
): SnapPoint[] => {
  const points: SnapPoint[] = [];

  for (const track of tracks) {
    if (track.id === excludeTrackId) continue;

    for (const clip of track.clips) {
      if (clip.id === currentClipId) continue;

      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      const clipCenter = clipStart + clip.duration / 2;

      points.push({
        type: 'clip-start',
        time: clipStart,
        clipId: clip.id,
        label: `${track.name} 开始`,
      });

      points.push({
        type: 'clip-end',
        time: clipEnd,
        clipId: clip.id,
        label: `${track.name} 结束`,
      });
    }
  }

  return points;
};

// 计算吸附
const calculateSnap = (
  currentTime: number,
  snapPoints: SnapPoint[],
  config: SnapConfig
): SnapResult => {
  if (!config.enabled) {
    return { snapped: false, snappedTime: currentTime, snapPoint: null };
  }

  let closestPoint: SnapPoint | null = null;
  let closestDistance = Infinity;

  for (const point of snapPoints) {
    const distance = Math.abs(currentTime - point.time);
    if (distance <= config.threshold && distance < closestDistance) {
      closestDistance = distance;
      closestPoint = point;
    }
  }

  if (closestPoint) {
    return {
      snapped: true,
      snappedTime: closestPoint.time,
      snapPoint: closestPoint,
      distance: closestDistance,
    };
  }

  return { snapped: false, snappedTime: currentTime, snapPoint: null };
};
```

### 8.6 播放控制

```typescript
// usePlayback.ts
const usePlayback = () => {
  const [state, setState] = useState<PlaybackState>({
    playState: 'stopped',
    currentTime: 0,
    loop: false,
    playbackRate: 1
  });

  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const play = () => {
    setState(s => ({ ...s, playState: 'playing' }));
    requestAnimationFrame(tick);
  };

  const pause = () => {
    setState(s => ({ ...s, playState: 'paused' }));
    videoRefs.current.forEach(v => v.pause());
  };

  const seek = (time: number) => {
    setState(s => ({ ...s, currentTime: time }));
    videoRefs.current.forEach((video, clipId) => {
      const clip = findClip(clipId);
      if (clip) {
        const relativeTime = (time - clip.startTime + clip.inPoint) / 1000;
        video.currentTime = relativeTime;
      }
    });
  };

  let lastTimestamp = 0;
  const tick = (timestamp: number) => {
    if (state.playState !== 'playing') return;

    const delta = timestamp - lastTimestamp;
    const newTime = state.currentTime + delta * state.playbackRate;

    if (newTime >= totalDuration) {
      if (state.loop) {
        seek(0);
        requestAnimationFrame(tick);
      } else {
        pause();
      }
    } else {
      seek(newTime);
      requestAnimationFrame(tick);
    }
    lastTimestamp = timestamp;
  };

  return { state, play, pause, seek };
};
```

### 8.7 可见片段计算

```typescript
// 计算当前时间点可见的片段
const getVisibleClips = (
  tracks: Track[],
  currentTime: number
): Clip[] => {
  const visibleClips: Clip[] = [];

  for (const track of tracks) {
    if (track.type !== 'video') continue;

    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;

      if (currentTime >= clip.startTime && currentTime < clipEnd) {
        const relativeTime = currentTime - clip.startTime + clip.inPoint;
        visibleClips.push({ ...clip, relativeTime });
      }
    }
  }

  return visibleClips;
};
```

### 8.8 编辑器存储服务

```typescript
// services/editorStorage.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface EditorDBSchema extends DBSchema {
  editorStates: {
    key: string;
    value: {
      projectId: string;
      data: EditorState;
      updatedAt: number;
    };
  };
}

class EditorStorageService {
  private db: IDBPDatabase<EditorDBSchema> | null = null;

  async init() {
    this.db = await openDB('video-editor-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('editorStates')) {
          db.createObjectStore('editorStates', { keyPath: 'projectId' });
        }
      },
    });
  }

  async save(projectId: string, data: EditorState) {
    if (!this.db) await this.init();
    await this.db!.put('editorStates', {
      projectId,
      data,
      updatedAt: Date.now(),
    });
  }

  async load(projectId: string): Promise<EditorState | null> {
    if (!this.db) await this.init();
    const result = await this.db!.get('editorStates', projectId);
    return result?.data || null;
  }
}

export const editorStorage = new EditorStorageService();
```

### 8.9 页面入口组件

```typescript
// components/VideoEditor/index.tsx
import { useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { PreviewCanvas } from './Preview/PreviewCanvas';
import { Timeline } from './Timeline/Timeline';
import { EditorToolbar } from './Toolbar/EditorToolbar';
import { EditorSidebar } from './Sidebar/EditorSidebar';

interface VideoEditorPageProps {
  projectId: string;
  sourceShots?: Shot[];  // 从现有 project 导入数据
}

export const VideoEditorPage: React.FC<VideoEditorPageProps> = ({
  projectId,
  sourceShots = []
}) => {
  const { initialize, tracks, currentTime, playState, duration } = useEditorStore();

  useEffect(() => {
    const initialClips = sourceShots
      .filter(s => s.videoUrl)
      .map((shot, index) => ({
        id: `clip-${shot.id}`,
        trackId: 'video-1',
        sourceId: shot.id,
        sourceType: 'video' as const,
        sourceUrl: shot.videoUrl,
        startTime: index * 5000,
        duration: shot.duration || 4000,
        inPoint: 0,
        outPoint: shot.duration || 4000,
        volume: 1,
        speed: 1,
        opacity: 1,
      }));

    initialize(projectId, initialClips);
  }, [projectId]);

  return (
    <div className="flex h-screen bg-[var(--bg-base)]">
      <div className="flex-1 flex flex-col">
        <EditorToolbar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <PreviewCanvas
            tracks={tracks}
            currentTime={currentTime}
            isPlaying={playState === 'playing'}
          />
          <Timeline />
        </div>
      </div>
      <EditorSidebar />
    </div>
  );
};
```

### 8.10 自动保存

```typescript
// 自动保存订阅
let saveTimeout: number;
useEditorStore.subscribe(
  state => state.updatedAt,
  () => {
    clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      get().save();
    }, 30000);  // 30 秒防抖
  }
);
```

---

## 9. 附录

### 9.1 主流软件参考

| 软件 | 布局参考 | 交互参考 |
|------|----------|----------|
| CapCut | 简洁一体化 | 拖拽+吸附 |
| DaVinci Resolve | 页面制布局 | 专业精度 |
| Premiere Pro | 多面板悬浮 | 完整功能 |

### 9.2 相关资源

- [React Video Editor](https://www.reactvideoeditor.com/) - React 视频编辑组件库
- [Remotion Editor Starter](https://remotion.dev/) - 基于 Remotion 的编辑器
- [OpenVideo](https://github.com/openvideodev/openvideo) - WebCodecs + WebGL 方案

---

## 10. 功能验收清单

### Phase 1: 基础设施 ✅

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 类型定义 | ✅ 完成 | `types/editor.ts` | Track, Clip, EditorState, Snap* 等 |
| Store 状态管理 | ✅ 完成 | `stores/editorStore.ts` | Zustand + subscribeWithSelector |
| 吸附配置 Store | ✅ 完成 | `stores/snapStore.ts` | persist 中间件 |
| 存储服务 | ✅ 完成 | `services/editorStorage.ts` | localStorage 实现 |
| 时间格式化 | ✅ 完成 | `utils/timeFormat.ts` | |
| 时间计算 | ✅ 完成 | `utils/timeCalculation.ts` | timeToPixels, pixelsToTime |

### Phase 2: 时间线核心 ✅

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 时间线主容器 | ✅ 完成 | `Timeline/Timeline.tsx` | 滚动、缩放 |
| 轨道组件 | ✅ 完成 | `Timeline/Track.tsx` | 背景网格、空状态 |
| 轨道头部 | ✅ 完成 | `Timeline/TrackHeader.tsx` | 名称、锁定、可见性 |
| 片段组件 | ✅ 完成 | `Timeline/Clip.tsx` | 颜色区分、选中状态 |
| 播放头 | ✅ 完成 | `Timeline/Playhead.tsx` | 竖线 + 时间显示 |
| 时间标尺 | ✅ 完成 | `Timeline/Ruler.tsx` | 点击跳转 |
| 拖拽移动 | ✅ 完成 | `hooks/useTimelineDrag.ts` | 轨道内/间移动 |
| 边缘裁剪 | ✅ 完成 | `hooks/useTimelineTrim.ts` | 左右边缘调整 |
| 分割功能 | ❌ 待开发 | `hooks/useTimelineSplit.ts` | 计划中 |
| 吸附控制 UI | ✅ 完成 | `Timeline/SnapControls.tsx` | |
| 吸附线 | ✅ 完成 | `Timeline/SnapLine.tsx` | |

### Phase 3: 预览播放 ✅

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 预览画布 | ✅ 完成 | `Preview/PreviewCanvas.tsx` | 16:9 比例 |
| 视频图层 | ✅ 完成 | `Preview/VideoLayer.tsx` | 预加载优化 |
| 文字图层 | ✅ 完成 | `Preview/TextLayer.tsx` | Canvas 绘制 |
| 音频图层 | ✅ 完成 | `Preview/AudioLayer.tsx` | |
| 播放控制 | ✅ 完成 | `Preview/PlaybackControls.tsx` | |
| 播放循环 | ✅ 完成 | `hooks/usePlayback.ts` | RAF 循环，增量计算 |
| 时间同步 | ✅ 完成 | - | 时间线 ↔ 预览同步 |
| 循环播放 | ✅ 完成 | - | toggleLoop |
| 播放速率 | ✅ 完成 | - | 0.5x, 1x, 1.5x, 2x |

### Phase 4: 吸附系统 ✅

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 吸附计算 | ✅ 完成 | `stores/snapStore.ts` | useSnapCalculation |
| 边界吸附 | ✅ 完成 | - | clip-start, clip-end |
| 中心吸附 | ✅ 完成 | - | clip-center |
| 播放头吸附 | ✅ 完成 | - | playhead |
| 时间标记吸附 | ✅ 完成 | - | 5s 间隔 |
| 吸附配置 UI | ✅ 完成 | `Timeline/SnapControls.tsx` | 开关、阈值 |

### Phase 5: 字幕功能 ⚠️

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 文字片段类型 | ✅ 完成 | `types/editor.ts` | TextClip 接口 |
| 文字图层渲染 | ✅ 完成 | `Preview/TextLayer.tsx` | |
| 文字编辑器 UI | ⚠️ 部分完成 | `Preview/TextEditor.tsx` | 未集成到主界面 |
| 样式编辑 | ❌ 待开发 | - | 字体、大小、颜色 |
| 位置编辑 | ❌ 待开发 | - | x, y 坐标 |
| 文字动画 | ❌ 待开发 | - | fade, slide, pop |

### Phase 6: 音频功能 ⚠️

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 音频轨道 | ✅ 完成 | `stores/editorStore.ts` | addTrack('audio') |
| 音频片段类型 | ✅ 完成 | `types/editor.ts` | AudioClip 接口 |
| 音频图层 | ✅ 完成 | `Preview/AudioLayer.tsx` | |
| 音量控制 | ⚠️ 基础完成 | - | volume 属性 |
| 淡入淡出 | ❌ 待开发 | - | fadeIn, fadeOut |
| 波形显示 | ❌ 待开发 | - | |

### Phase 7: 素材与持久化 ⚠️

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 项目导入 | ✅ 完成 | `VideoEditor/index.tsx` | 从 project.shots 导入 |
| 导入媒体 UI | ✅ 完成 | `ImportMedia.tsx` | |
| 自动保存 | ✅ 完成 | `stores/editorStore.ts` | 30 秒防抖 |
| localStorage 存储 | ✅ 完成 | `services/editorStorage.ts` | |
| Undo/Redo | ✅ 完成 | `stores/editorStore.ts` | 最多 50 步 |
| 素材库 | ⚠️ 部分完成 | `Preview/AssetLibrary.tsx` | 未完善 |

### Phase 8: UI 打磨与集成 ⚠️

| 功能 | 状态 | 文件 | 备注 |
|------|------|------|------|
| 工具栏 | ✅ 完成 | `VideoEditor/index.tsx` | 播放控制、工具选择 |
| 快捷键 | ✅ 完成 | `VideoEditor/index.tsx` | Space, Ctrl+Z, Home, End |
| 缩放控制 | ✅ 完成 | `Timeline/Timeline.tsx` | 滑块 + Ctrl+滚轮 |
| 侧边面板 | ❌ 待开发 | `Sidebar/` | Inspector, AssetLibrary |
| 导出功能 | ❌ 待开发 | - | 仅占位符 |
| 虚拟滚动 | ❌ 待开发 | - | 性能优化 |

### 总体完成度

| Phase | 完成度 | 备注 |
|-------|--------|------|
| Phase 1: 基础设施 | 100% | ✅ |
| Phase 2: 时间线核心 | 85% | 分割功能待开发 |
| Phase 3: 预览播放 | 95% | 基本完成 |
| Phase 4: 吸附系统 | 100% | ✅ |
| Phase 5: 字幕功能 | 40% | 基础类型完成，UI 待完善 |
| Phase 6: 音频功能 | 35% | 基础类型完成，功能待开发 |
| Phase 7: 素材与持久化 | 70% | 核心完成，素材库待完善 |
| Phase 8: UI 打磨与集成 | 50% | 工具栏完成，侧边面板待开发 |
| **总体** | **~70%** | 核心编辑功能可用 |
