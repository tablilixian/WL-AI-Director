# WL AI Director JSON 数据序列化与反序列化文档

本文档详细说明了项目中各个 JSON 数据的格式、序列化/反序列化方式及相关代码。

---

## 目录

1. [画布 JSON (Canvas JSON)](#1-画布-json-canvas-json)
2. [项目 JSON (Project JSON)](#2-项目-json-project-json)
3. [剧本 JSON (Script JSON)](#3-剧本-json-script-json)
4. [分镜 JSON (Shot JSON)](#4-分镜-json-shot-json)
5. [角色 JSON (Character JSON)](#5-角色-json-character-json)
6. [场景 JSON (Scene JSON)](#6-场景-json-scene-json)

---

## 1. 画布 JSON (Canvas JSON)

### 1.1 存储位置

- **localStorage 键**: `wl-canvas-backup`
- **Zustand 持久化键**: `wl-canvas-state`

### 1.2 保存代码

**文件**: `src/modules/canvas/services/canvasIntegrationService.ts`

```typescript
// 第 349-406 行
async saveCanvasState(): Promise<void> {
  const { layers, offset, scale } = useCanvasStore.getState();

  // 1. 处理每个图层：移除 src, thumbnail 大字段，保存 drawing 类型到 IndexedDB
  const layersToSave = await Promise.all(layers.map(async (layer) => {
    const { src, thumbnail, ...rest } = layer;
    
    let imageId = layer.imageId;
    
    // 对于 drawing 类型，将 data: URL 保存到 IndexedDB
    if (layer.type === 'drawing' && src && src.startsWith('data:')) {
      const { imageStorageService } = await import('../../../../services/imageStorageService');
      const imgId = `canvas_drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const response = await fetch(src);
      const blob = await response.blob();
      await imageStorageService.saveImage(imgId, blob);
      imageId = imgId;
    }
    
    return {
      ...rest,
      imageId,
      srcSaved: src ? true : false
    };
  }));

  // 2. 构建 state 对象
  const state = {
    layers: layersToSave,
    offset,
    scale,
    savedAt: Date.now()
  };

  // 3. JSON.stringify → localStorage
  localStorage.setItem('wl-canvas-backup', JSON.stringify(state));
}
```

### 1.3 加载代码

**文件**: `src/modules/canvas/services/canvasIntegrationService.ts`

```typescript
// 第 411-496 行
async restoreCanvasState(): Promise<boolean> {
  // 1. 从 localStorage 获取
  const saved = localStorage.getItem('wl-canvas-backup');
  if (!saved) return false;

  // 2. JSON.parse
  const state = JSON.parse(saved);

  // 3. 恢复图层：从 IndexedDB 加载图片 Blob → URL.createObjectURL
  if (state.layers && state.layers.length > 0) {
    const restoredLayers = await Promise.all(state.layers.map(async (layer: any) => {
      if (layer.type === 'image') {
        // 优先使用 imageId
        if (layer.imageId) {
          const { imageStorageService } = await import('../../../../services/imageStorageService');
          const blob = await imageStorageService.getImage(layer.imageId);
          if (blob) {
            return { ...layer, src: URL.createObjectURL(blob) };
          }
        }
        // 处理 local: 引用
        if (layer.src && layer.src.startsWith('local:')) {
          const localId = layer.src.replace('local:', '');
          const blob = await imageStorageService.getImage(localId);
          if (blob) {
            return { ...layer, src: URL.createObjectURL(blob), imageId: localId };
          }
        }
      }
      // video 类型处理
      else if (layer.type === 'video' && layer.src && layer.src.startsWith('video:')) {
        const { videoStorageService } = await import('../../../../services/imageStorageService');
        const videoId = layer.src.replace('video:', '');
        const blob = await videoStorageService.getVideo(videoId);
        if (blob) {
          return { ...layer, src: URL.createObjectURL(blob) };
        }
      }
      // drawing 类型处理
      else if (layer.type === 'drawing') {
        if (layer.imageId) {
          const blob = await imageStorageService.getImage(layer.imageId);
          if (blob) {
            return { ...layer, src: URL.createObjectURL(blob) };
          }
        }
      }
      return layer;
    }));

    importLayers(restoredLayers, true);
  }

  // 4. 恢复 offset 和 scale
  if (state.offset) setOffset(state.offset);
  if (state.scale) setScale(state.scale);

  return true;
}
```

### 1.4 Zustand 持久化代码

**文件**: `src/modules/canvas/hooks/useCanvasState.ts`

```typescript
// 第 724-815 行
export const useCanvasStore = create<CanvasState & CanvasActions>()(
  persist(
    (set, get) => ({
      // ... actions
    }),
    {
      name: 'wl-canvas-state',
      // 序列化：移除 src, thumbnail 大字段
      partialize: (state) => ({
        layers: state.layers.map(layer => {
          const { src, thumbnail, ...rest } = layer;
          return { ...rest, srcSaved: src ? true : false };
        }),
        offset: state.offset,
        scale: state.scale
      }),
      // 反序列化：恢复图片 Blob
      onRehydrateStorage: () => (state) => {
        if (state && state.layers.length > 0) {
          Promise.all(state.layers.map(async (layer) => {
            if (layer.type === 'image' && layer.imageId) {
              const blob = await imageStorageService.getImage(layer.imageId);
              if (blob) {
                return { ...layer, src: URL.createObjectURL(blob) };
              }
            }
            // ... 其他类型处理
          })).then(restoredLayers => {
            state.layers = restoredLayers;
          });
        }
      }
    }
  )
);
```

### 1.5 JSON 示例

```json
{
  "layers": [
    {
      "id": "layer-550e8400-e29b-41d4-a716-446655440000",
      "type": "image",
      "x": 100,
      "y": 100,
      "width": 400,
      "height": 300,
      "src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "imageId": "canvas_img_1700000000000_abc123",
      "title": "镜头 1-1",
      "createdAt": 1700000000000,
      "locked": false,
      "visible": true,
      "opacity": 1,
      "zIndex": 0,
      "linkedResourceId": "shot-001",
      "linkedResourceType": "keyframe",
      "operationType": "import"
    },
    {
      "id": "layer-550e8400-e29b-41d4-a716-446655440001",
      "type": "text",
      "x": 200,
      "y": 50,
      "width": 300,
      "height": 50,
      "src": "",
      "title": "标题文字",
      "createdAt": 1700000001000,
      "text": "这是一个测试标题",
      "color": "#FFFFFF",
      "fontSize": 24,
      "locked": false,
      "visible": true,
      "opacity": 1
    },
    {
      "id": "layer-550e8400-e29b-41d4-a716-446655440002",
      "type": "drawing",
      "x": 50,
      "y": 200,
      "width": 500,
      "height": 400,
      "src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "imageId": "canvas_drawing_1700000002000_xyz789",
      "title": "手绘图层",
      "createdAt": 1700000002000,
      "annotations": [
        {
          "id": "ann-001",
          "type": "path",
          "points": [
            { "x": 10, "y": 10 },
            { "x": 50, "y": 50 },
            { "x": 100, "y": 30 }
          ],
          "color": "#FF0000",
          "width": 2
        }
      ]
    }
  ],
  "offset": { "x": 0, "y": 0 },
  "scale": 1,
  "savedAt": 1712000000000
}
```

### 1.6 字段详解

#### 1.6.1 根对象字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `layers` | `LayerData[]` | 图层数组，包含所有画布元素 |
| `offset` | `{ x: number, y: number }` | 画布视图偏移量 |
| `scale` | `number` | 画布缩放比例 (0.1 - 5) |
| `savedAt` | `number` | 保存时间戳 (Unix timestamp) |

#### 1.6.2 LayerData 字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `id` | `string` | 图层唯一标识 (UUID) | ✅ |
| `parentId` | `string?` | 所属分组 ID | ❌ |
| `type` | `LayerType` | 图层类型: `image` \| `video` \| `sticky` \| `text` \| `group` \| `drawing` \| `audio` \| `prompt` | ✅ |
| `x` | `number` | 画布上的 X 坐标 | ✅ |
| `y` | `number` | 画布上的 Y 坐标 | ✅ |
| `width` | `number` | 图层宽度 (像素) | ✅ |
| `height` | `number` | 图层高度 (像素) | ✅ |
| `src` | `string` | 图片/视频源 (Base64 Data URL 或 Blob URL) | ✅ |
| `thumbnail` | `string?` | 256px 缩略图 Base64 | ❌ |
| `imageId` | `string?` | IndexedDB 中图片的 ID | ❌ |
| `thumbnailId` | `string?` | IndexedDB 中缩略图的 ID | ❌ |
| `color` | `string?` | 图层颜色 | ❌ |
| `text` | `string?` | 文本内容 | ❌ |
| `fontSize` | `number?` | 字体大小 | ❌ |
| `title` | `string` | 图层名称 | ✅ |
| `createdAt` | `number` | 创建时间戳 | ✅ |
| `flipX` | `boolean?` | 水平翻转 | ❌ |
| `flipY` | `boolean?` | 垂直翻转 | ❌ |
| `duration` | `number?` | 视频/音频时长 (秒) | ❌ |
| `isLoading` | `boolean?` | 是否正在加载 | ❌ |
| `progress` | `number?` | 生成进度 (0-100) | ❌ |
| `error` | `string?` | 错误信息 | ❌ |
| `annotations` | `Annotation[]?` | 标注数组 | ❌ |
| `locked` | `boolean?` | 是否锁定 | ❌ |
| `visible` | `boolean?` | 是否可见 | ❌ |
| `opacity` | `number?` | 透明度 (0-1) | ❌ |
| `zIndex` | `number?` | 图层堆叠顺序 | ❌ |
| `sourceLayerId` | `string?` | 来源图层 ID | ❌ |
| `operationType` | `string?` | 操作类型 | ❌ |
| `linkedResourceId` | `string?` | 关联的资源 ID | ❌ |
| `linkedResourceType` | `string?` | 关联的资源类型 | ❌ |

#### 1.6.3 Annotation 标注类型

**DrawingPath (绘制路径)**:
```json
{
  "id": "ann-001",
  "type": "path",
  "points": [
    { "x": 10, "y": 10 },
    { "x": 50, "y": 50 }
  ],
  "color": "#FF0000",
  "width": 2
}
```

**TextAnnotation (文字标注)**:
```json
{
  "id": "ann-002",
  "type": "text",
  "x": 100,
  "y": 100,
  "text": "标注文字",
  "color": "#FFFFFF",
  "fontSize": 16
}
```

**RectangleAnnotation (矩形标注)**:
```json
{
  "id": "ann-003",
  "type": "rectangle",
  "vertices": [
    { "x": 0, "y": 0 },
    { "x": 100, "y": 0 },
    { "x": 100, "y": 100 },
    { "x": 0, "y": 100 }
  ],
  "color": "#00FF00",
  "strokeWidth": 1
}
```

### 1.7 TypeScript 接口

```typescript
// 文件: src/modules/canvas/types/canvas.ts

export interface CanvasState {
  layers: LayerData[];
  offset: { x: number; y: number };
  scale: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
}

export interface LayerData {
  id: string;
  parentId?: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  thumbnail?: string;
  imageId?: string;
  thumbnailId?: string;
  color?: string;
  text?: string;
  fontSize?: number;
  title: string;
  createdAt: number;
  flipX?: boolean;
  flipY?: boolean;
  duration?: number;
  isLoading?: boolean;
  progress?: number;
  error?: string;
  annotations?: Annotation[];
  locked?: boolean;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  sourceLayerId?: string;
  operationType?: string;
  linkedResourceId?: string;
  linkedResourceType?: 'character' | 'scene' | 'keyframe';
}

export type LayerType = 'image' | 'video' | 'sticky' | 'text' | 'group' | 'drawing' | 'audio' | 'prompt';

export type Annotation = DrawingPath | TextAnnotation | RectangleAnnotation;
```

---

## 2. 项目 JSON (Project JSON)

### 2.1 存储位置

- **Supabase 数据库表**: `projects`

### 2.2 保存/加载代码

```typescript
// 文件: src/api/projects.ts

// 保存
await supabase
  .from('projects')
  .update({ title, description, settings, updated_at: new Date().toISOString() })
  .eq('id', projectId);

// 加载
const { data } = await supabase
  .from('projects')
  .select('*')
  .eq('id', projectId)
  .single();
```

### 2.3 JSON 示例

```json
{
  "id": "project-550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-550e8400-e29b-41d4-a716-446655440000",
  "title": "我的短剧项目",
  "description": "一个关于冒险的故事",
  "status": "active",
  "settings": {},
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T12:30:00Z"
}
```

### 2.4 TypeScript 接口

```typescript
// 文件: src/types/supabase/index.ts

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  settings: Json;
  created_at: string;
  updated_at: string;
}
```

---

## 3. 剧本 JSON (Script JSON)

### 3.1 存储位置

- **Supabase 数据库表**: `scripts`

### 3.2 JSON 示例

```json
{
  "id": "script-550e8400-e29b-41d4-a716-446655440001",
  "project_id": "project-550e8400-e29b-41d4-a716-446655440000",
  "content": "这是一个测试剧本内容...",
  "metadata": {
    "title": "冒险之旅",
    "genre": "奇幻",
    "logline": "主角踏上寻找宝藏的旅程",
    "targetDuration": "5分钟",
    "language": "中文",
    "visualStyle": "anime",
    "shotGenerationModel": "gpt-5.1"
  },
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T12:30:00Z"
}
```

---

## 4. 分镜 JSON (Shot JSON)

### 4.1 存储位置

- **Supabase 数据库表**: `shots`

### 4.2 JSON 示例

```json
{
  "id": "shot-550e8400-e29b-41d4-a716-446655440002",
  "script_id": "script-550e8400-e29b-41d4-a716-446655440001",
  "shot_number": 1,
  "description": "主角站在山顶，眺望远方",
  "camera_movement": "pan right",
  "shotSize": "wide",
  "start_frame_url": "data:image/png;base64,...",
  "end_frame_url": "data:image/png;base64,...",
  "video_url": "data:video/mp4;base64,...",
  "video_status": "completed",
  "video_task_id": "task-001",
  "prompt": "A hero standing on a mountain peak...",
  "characters": ["char-001", "char-002"],
  "characterVariations": {
    "char-001": "var-casual"
  },
  "props": ["prop-001"],
  "keyframes": [
    {
      "id": "kf-001",
      "type": "start",
      "visualPrompt": "主角站在山顶",
      "imageUrl": "data:image/png;base64,...",
      "status": "completed"
    },
    {
      "id": "kf-002",
      "type": "end",
      "visualPrompt": "主角转身离去",
      "imageUrl": "data:image/png;base64,...",
      "status": "completed"
    }
  ],
  "interval": {
    "id": "int-001",
    "startKeyframeId": "kf-001",
    "endKeyframeId": "kf-002",
    "duration": 5,
    "motionStrength": 0.8,
    "videoUrl": "data:video/mp4;base64,...",
    "status": "completed"
  },
  "nineGrid": {
    "panels": [
      { "index": 0, "shotSize": "extreme-wide", "cameraAngle": "aerial", "description": "全景" }
    ],
    "imageUrl": "data:image/png;base64,...",
    "status": "completed"
  }
}
```

---

## 5. 角色 JSON (Character JSON)

### 5.1 存储位置

- **Supabase 数据库表**: `characters`
- **本地类型定义**: `types.ts`

### 5.2 JSON 示例

```json
{
  "id": "char-550e8400-e29b-41d4-a716-446655440003",
  "project_id": "project-550e8400-e29b-41d4-a716-446655440000",
  "name": "主角小明",
  "gender": "男",
  "age": "25",
  "personality": "勇敢、机智",
  "visualPrompt": "年轻男子，黑色短发，深邃眼眸",
  "negativePrompt": "不要画手指畸形",
  "coreFeatures": "左脸有疤痕",
  "referenceImage": "data:image/png;base64,...",
  "referenceImageSource": "local",
  "localImageId": "img_1700000000001",
  "turnaround": {
    "panels": [
      { "index": 0, "viewAngle": "正面", "shotSize": "全身", "description": "正面全身" }
    ],
    "imageUrl": "data:image/png;base64,...",
    "status": "completed"
  },
  "variations": [
    {
      "id": "var-casual",
      "name": "日常装",
      "visualPrompt": "穿日常服装",
      "referenceImage": "data:image/png;base64,...",
      "status": "completed"
    }
  ],
  "status": "completed"
}
```

---

## 6. 场景 JSON (Scene JSON)

### 6.1 存储位置

- **Supabase 数据库表**: `scenes`
- **本地类型定义**: `types.ts`

### 6.2 JSON 示例

```json
{
  "id": "scene-550e8400-e29b-41d4-a716-446655440004",
  "project_id": "project-550e8400-e29b-41d4-a716-446655440000",
  "name": "山顶",
  "location": "室外",
  "time": "黄昏",
  "atmosphere": "神秘",
  "visualPrompt": "高山上，夕阳西下",
  "negativePrompt": "不要有现代建筑",
  "referenceImage": "data:image/png;base64,...",
  "referenceImageSource": "cloud",
  "status": "completed"
}
```

#### 1.6.4 Prompt Layer 特殊字段 (linkedLayerIds)

Prompt Layer 是画布中的一种特殊图层类型，用于 AI 提示词生成。其配置通过 `promptConfig` 字段存储。

**PromptLayerConfig 结构**:
```typescript
export interface PromptLayerConfig {
  prompt: string;              // 用户输入的原始提示词
  enhancedPrompt?: string;    // AI 增强后的提示词
  isEnhanced: boolean;        // 是否已增强
  mode: PromptMode;           // 生成模式
  aspectRatio: '16:9' | '9:16' | '1:1';
  linkedLayerIds: string[];    // 关联的源图片 Layer IDs（最多 5 个）
  outputLayerIds: string[];   // 生成的结果 Layer IDs
  nodeColor: string;          // 节点颜色
}
```

**Prompt Layer JSON 示例**:
```json
{
  "id": "layer-prompt-001",
  "type": "prompt",
  "x": 300,
  "y": 200,
  "width": 280,
  "height": 180,
  "src": "",
  "title": "提示词 - 图生图",
  "createdAt": 1700000003000,
  "color": "#3b82f6",
  "promptConfig": {
    "prompt": "将图片转换为油画风格",
    "enhancedPrompt": "将图片转换为油画风格，色彩鲜艳，笔触明显",
    "isEnhanced": true,
    "mode": "image-to-image",
    "aspectRatio": "16:9",
    "linkedLayerIds": [
      "layer-550e8400-e29b-41d4-a716-446655440000"
    ],
    "outputLayerIds": [
      "layer-result-001"
    ],
    "nodeColor": "#3b82f6"
  }
}
```

**linkedLayerIds 字段说明**:

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `linkedLayerIds` | `string[]` | 关联的源图片 Layer IDs，最多 5 个 | ✅ |

**用途**:
- 用于图生图、风格迁移、背景替换等 AI 操作时，关联源图片图层
- 在 AI 生成时，源图片作为参考/上下文
- 限制最多 5 个，防止提示词过于复杂

**使用位置**:
- `src/modules/canvas/hooks/useCanvasState.ts` - `linkLayerToPrompt`, `unlinkLayerFromPrompt` 函数
- `src/modules/canvas/components/PromptLinkPanel.tsx` - UI 显示关联数量
- `src/modules/canvas/components/ConnectionLines.tsx` - 绘制连接线

---

## 7. 数据结构总结表

| 数据类型 | 存储位置 | 序列化方式 | TypeScript 接口 |
|---------|---------|-----------|-----------------|
| 画布状态 | localStorage | JSON.stringify | CanvasState, LayerData |
| 项目 | Supabase | supabase.update | Project |
| 剧本 | Supabase | supabase.update | Script |
| 分镜 | Supabase | supabase.update | Shot |
| 角色 | Supabase | supabase.update | Character |
| 场景 | Supabase | supabase.update | Scene |

---

## 8. 相关文件索引

| 文件路径 | 用途 |
|---------|------|
| `src/modules/canvas/services/canvasIntegrationService.ts` | 画布保存/恢复服务 |
| `src/modules/canvas/hooks/useCanvasState.ts` | Zustand 画布状态管理 |
| `src/modules/canvas/types/canvas.ts` | 画布类型定义 |
| `src/types/supabase/index.ts` | Supabase 类型定义 |
| `types.ts` | 项目核心类型定义 |
| `services/imageStorageService.ts` | IndexedDB 图片存储服务 |
| `src/api/projects.ts` | 项目 API |
