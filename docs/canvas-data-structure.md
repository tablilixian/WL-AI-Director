# 画布数据结构与序列化流程文档

## 1. 概述

本文档详细描述了WL AI Director项目中画布（Canvas）模块的数据结构、数据序列化和反序列化流程，以及图片和视频的存储机制。

## 2. 核心数据结构

### 2.1 图层类型定义

文件位置：`src/modules/canvas/types/canvas.ts`

```typescript
export type LayerType = 'image' | 'video' | 'sticky' | 'text' | 'group' | 'drawing' | 'audio' | 'prompt';
```

### 2.2 图层数据接口 (LayerData)

```typescript
export interface LayerData {
  id: string;
  parentId?: string; // ID of the group this layer belongs to
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string; // Base64 or Blob URL (empty for stickies/groups)
  thumbnail?: string; // 256px thumbnail Base64 for LOD rendering
  // Asset store IDs (blob-based storage for performance)
  imageId?: string; // Reference to asset store for full-res image
  thumbnailId?: string; // Reference to asset store for thumbnail
  color?: string; // For stickies, groups, and text
  text?: string; // Main text content for stickies and text layers
  fontSize?: number; // Custom font size for text content
  title: string;
  createdAt: number;
  flipX?: boolean;
  flipY?: boolean;
  duration?: number; // Video/Audio duration in seconds
  isLoading?: boolean;
  progress?: number; // 0-100 for generation progress
  error?: string;
  annotations?: Annotation[];
  // 图层属性
  locked?: boolean; // 是否锁定（防止拖拽和缩放）
  visible?: boolean; // 是否可见
  opacity?: number; // 透明度 0-1
  zIndex?: number; // 图层顺序
  // 来源追踪
  sourceLayerId?: string; // 来源图层 ID
  operationType?: 'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video' | 'style-transfer' | 'background-replace' | 'expand' | 'background-remove' | 'variant' | 'import' | 'drawing';
  // 关联信息（用于与主项目联动）
  linkedResourceId?: string; // 关联的角色/场景 ID
  linkedResourceType?: 'character' | 'scene' | 'keyframe'; // 关联的资源类型
}
```

### 2.3 画布状态接口 (CanvasState)

```typescript
export interface CanvasState {
  layers: LayerData[];
  offset: CanvasOffset;
  scale: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
}
```

### 2.4 JSON序列化格式

序列化到JSON时，数据结构会有所不同：

```typescript
interface SerializedLayerData {
  id: string;
  parentId?: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  // 注意：src和thumbnail字段被排除
  imageId?: string; // Reference to asset store
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
  linkedResourceType?: string;
  srcSaved: boolean; // 新增字段：表示src是否有值
}

interface SerializedCanvasState {
  layers: SerializedLayerData[];
  offset: CanvasOffset;
  scale: number;
  savedAt: number;
}
```

## 3. 数据序列化流程

### 3.1 序列化过程

文件位置：`src/modules/canvas/services/canvasIntegrationService.ts`

```typescript
async saveCanvasState(): Promise<void> {
  const { layers, offset, scale } = useCanvasStore.getState();
  
  const layersToSave = await Promise.all(layers.map(async (layer) => {
    const { src, thumbnail, ...rest } = layer;
    
    let imageId = layer.imageId;
    
    // 处理绘制图层：将base64数据保存到IndexedDB
    if (layer.type === 'drawing' && src && src.startsWith('data:')) {
      try {
        const { imageStorageService } = await import('../../../../services/imageStorageService');
        const imgId = `canvas_drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const response = await fetch(src);
        const blob = await response.blob();
        await imageStorageService.saveImage(imgId, blob);
        imageId = imgId;
      } catch (e) {
        console.warn('[CanvasIntegration] 保存绘制图层失败:', e);
      }
    }
    
    // 返回序列化后的图层数据（排除src和thumbnail，添加srcSaved标志）
    return {
      ...rest,
      imageId,
      srcSaved: src ? true : false
    };
  }));
  
  const state = {
    layers: layersToSave,
    offset,
    scale,
    savedAt: Date.now()
  };
  
  // 保存到localStorage
  localStorage.setItem('wl-canvas-backup', JSON.stringify(state));
}
```

### 3.2 Zustand Persist中间件

文件位置：`src/modules/canvas/hooks/useCanvasState.ts`

```typescript
export const useCanvasStore = create<CanvasState & CanvasActions>()(
  persist(
    (set, get) => ({
      // 状态和方法定义
    }),
    {
      name: 'wl-canvas-state',
      partialize: (state) => ({
        layers: state.layers.map(layer => {
          const { src, thumbnail, ...rest } = layer;
          return { ...rest, srcSaved: src ? true : false };
        }),
        offset: state.offset,
        scale: state.scale
      }),
      onRehydrateStorage: () => (state) => {
        // 反序列化逻辑
      }
    }
  )
);
```

## 4. 数据反序列化流程

### 4.1 反序列化过程

```typescript
async restoreCanvasState(): Promise<boolean> {
  try {
    const saved = localStorage.getItem('wl-canvas-backup');
    if (!saved) return false;

    const state = JSON.parse(saved);
    const { importLayers, setOffset, setScale } = useCanvasStore.getState();

    if (state.layers && state.layers.length > 0) {
      const restoredLayers = await Promise.all(state.layers.map(async (layer: any) => {
        // 处理图片图层
        if (layer.type === 'image') {
          // 优先使用imageId从IndexedDB加载
          if (layer.imageId) {
            try {
              const { imageStorageService } = await import('../../../../services/imageStorageService');
              const blob = await imageStorageService.getImage(layer.imageId);
              if (blob) {
                return { ...layer, src: URL.createObjectURL(blob) };
              }
            } catch (e) {
              console.warn('恢复图片失败 (imageId):', e);
            }
          }
          
          // 如果src是local:格式，从IndexedDB加载
          if (layer.src && layer.src.startsWith('local:')) {
            try {
              const { imageStorageService } = await import('../../../../services/imageStorageService');
              const localId = layer.src.replace('local:', '');
              const blob = await imageStorageService.getImage(localId);
              if (blob) {
                return { ...layer, src: URL.createObjectURL(blob) };
              }
            } catch (e) {
              console.warn('恢复图片失败 (local:):', e);
            }
          }
        } 
        // 处理视频图层
        else if (layer.type === 'video') {
          if (layer.src && layer.src.startsWith('video:')) {
            try {
              const { videoStorageService } = await import('../../../../services/imageStorageService');
              const videoId = layer.src.replace('video:', '');
              const blob = await videoStorageService.getVideo(videoId);
              if (blob) {
                return { ...layer, src: URL.createObjectURL(blob) };
              }
            } catch (e) {
              console.warn('恢复视频失败:', e);
            }
          }
        } 
        // 处理绘制图层
        else if (layer.type === 'drawing') {
          if (layer.imageId) {
            try {
              const { imageStorageService } = await import('../../../../services/imageStorageService');
              const blob = await imageStorageService.getImage(layer.imageId);
              if (blob) {
                return { ...layer, src: URL.createObjectURL(blob) };
              }
            } catch (e) {
              console.warn('恢复绘制图层失败 (imageId):', e);
            }
          }
        }
        return layer;
      }));

      importLayers(restoredLayers, true);
    }

    if (state.offset) {
      setOffset(state.offset);
    }

    if (state.scale) {
      setScale(state.scale);
    }

    return true;
  } catch (error) {
    console.error('[CanvasIntegration] 恢复画布状态失败', error);
    return false;
  }
}
```

## 5. 图片和视频存储机制

### 5.1 存储架构

1. **localStorage**：存储画布状态JSON
   - 键名：`wl-canvas-backup`
   - 内容：序列化后的画布状态（不含图片/视频二进制数据）

2. **IndexedDB**：存储图片和视频二进制数据
   - 数据库名：`wl-canvas-assets`
   - 对象存储：`assets`（图片）和`videos`（视频）

### 5.2 图片存储

文件位置：`services/imageStorageService.ts`

```typescript
export const imageStorageService = {
  async saveImage(id: string, blob: Blob): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    
    const image: LocalImage = {
      id,
      blob,
      createdAt: Date.now(),
      type: blob.type,
      size: blob.size
    };
    
    store.put(image);
  },

  async getImage(id: string): Promise<Blob | null> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.IMAGES, 'readonly');
    const store = tx.objectStore(STORE_NAMES.IMAGES);
    
    const result = store.get(id);
    return result ? result.blob : null;
  }
};
```

### 5.3 视频存储

```typescript
export const videoStorageService = {
  async saveVideo(id: string, blob: Blob): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    
    const video: LocalVideo = {
      id,
      blob,
      createdAt: Date.now(),
      type: blob.type,
      size: blob.size
    };
    
    store.put(video);
  },

  async getVideo(id: string): Promise<Blob | null> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAMES.VIDEOS, 'readonly');
    const store = tx.objectStore(STORE_NAMES.VIDEOS);
    
    const result = store.get(id);
    return result ? result.blob : null;
  }
};
```

### 5.4 ID生成规则

```typescript
// 图片ID生成
const imgId = `canvas_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 视频ID生成
const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// 绘制图层ID生成
const drawingId = `canvas_drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

## 6. srcSaved字段分析

### 6.1 srcSaved的含义

`srcSaved`是一个布尔值，表示图层是否有`src`属性：
- `true`：图层有`src`属性（图片或视频数据）
- `false`：图层没有`src`属性

### 6.2 srcSaved的计算逻辑

```typescript
// 在序列化时计算
srcSaved: src ? true : false
```

### 6.3 用户JSON中视频srcSaved为false的分析

从您提供的JSON中可以看到：

```json
{
  "id": "6d8276d9-a468-4aa2-b3d6-afbee003f905",
  "type": "video",
  "x": 1650,
  "y": -252,
  "width": 640,
  "height": 360,
  "title": "生成视频",
  "isLoading": false,
  "createdAt": 1775099560979,
  "sourceLayerId": "385412cf-7d68-4292-9eb3-89a2fc0b0656",
  "operationType": "image-to-video",
  "progress": 100,
  "srcSaved": false
}
```

**原因分析**：

1. **视频没有成功保存到本地IndexedDB**
   - 视频生成后可能没有调用`saveVideoToLocal`函数
   - 或者视频保存过程中出现了错误

2. **视频URL格式不正确**
   - 视频URL应该以`video:`开头，表示存储在IndexedDB中
   - 如果视频URL是HTTP/HTTPS格式，则`srcSaved`可能为false

3. **视频生成失败或超时**
   - 视频生成过程可能失败，导致没有实际视频数据

### 6.4 视频保存流程

文件位置：`utils/imageUtils.ts`

```typescript
export const saveVideoToLocal = async (videoBase64: string): Promise<string> => {
  const cleanBase64 = videoBase64.replace(/^data:video\/[^;]+;base64,/, '');
  const byteCharacters = atob(cleanBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'video/mp4' });
  
  const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await videoStorageService.saveVideo(videoId, blob);
  
  return `video:${videoId}`; // 返回video:格式的URL
};
```

## 7. 数据流示例

### 7.1 图片图层的完整数据流

1. **创建图层**：
   ```typescript
   {
     id: "img_123",
     type: "image",
     src: "data:image/png;base64,...", // 或 "local:img_xxx" 或 HTTP URL
     imageId: "canvas_img_1775016909648_lbcdpv2vp"
   }
   ```

2. **序列化到JSON**：
   ```typescript
   {
     id: "img_123",
     type: "image",
     // src被排除
     imageId: "canvas_img_1775016909648_lbcdpv2vp",
     srcSaved: true // 因为有src属性
   }
   ```

3. **反序列化恢复**：
   - 读取JSON
   - 使用imageId从IndexedDB获取Blob
   - 创建Blob URL作为新的src
   - 恢复完整的图层对象

### 7.2 视频图层的完整数据流

1. **创建图层**：
   ```typescript
   {
     id: "vid_456",
     type: "video",
     src: "video:vid_xxx" // IndexedDB引用
   }
   ```

2. **序列化到JSON**：
   ```typescript
   {
     id: "vid_456",
     type: "video",
     // src被排除
     srcSaved: true // 因为有src属性
   }
   ```

3. **反序列化恢复**：
   - 读取JSON
   - 从src中提取videoId
   - 使用videoStorageService.getVideo(videoId)获取Blob
   - 创建Blob URL作为新的src

## 8. 关键文件清单

| 文件路径 | 功能描述 |
|---------|---------|
| `src/modules/canvas/types/canvas.ts` | 数据结构类型定义 |
| `src/modules/canvas/hooks/useCanvasState.ts` | Zustand状态管理和持久化 |
| `src/modules/canvas/services/canvasIntegrationService.ts` | 画布集成服务，包含序列化/反序列化逻辑 |
| `services/imageStorageService.ts` | IndexedDB图片和视频存储服务 |
| `utils/imageUtils.ts` | 图片/视频工具函数 |
| `src/modules/canvas/components/CanvasLayer.tsx` | 图层渲染组件 |

## 9. 问题排查指南

### 9.1 视频srcSaved为false的排查步骤

1. **检查视频生成流程**：
   - 确认`canvasModelService.generateVideo`是否成功执行
   - 检查视频下载和保存是否成功

2. **检查视频保存逻辑**：
   - 确认`saveVideoToLocal`函数是否被调用
   - 检查IndexedDB中是否存在对应的视频数据

3. **检查URL格式**：
   - 确认视频URL是否为`video:vid_xxx`格式
   - 验证videoId是否正确

4. **检查IndexedDB状态**：
   - 在浏览器开发者工具中查看IndexedDB
   - 检查`wl-canvas-assets`数据库中的`videos`存储

### 9.2 常见问题及解决方案

1. **问题**：视频生成后无法播放
   **解决**：检查视频URL格式和IndexedDB存储

2. **问题**：图片加载失败
   **解决**：验证imageId是否存在，检查IndexedDB中的图片数据

3. **问题**：画布状态恢复失败
   **解决**：检查localStorage中的JSON格式，验证反序列化逻辑

## 10. 总结

画布模块使用分层存储架构：
- **localStorage**：存储画布状态JSON（轻量级，快速访问）
- **IndexedDB**：存储图片和视频二进制数据（大容量，支持Blob）

序列化时排除了`src`和`thumbnail`等大字段，通过`imageId`和`srcSaved`字段保持数据关联。反序列化时根据这些ID从IndexedDB恢复二进制数据。

视频图层`srcSaved`为false表明视频数据没有成功保存到本地IndexedDB，需要检查视频生成和保存流程。