# blob: URL 失效问题分析

## 错误信息

```
GET blob:http://localhost:3000/cbc90fe4-d979-494e-b379-66524853d400 net::ERR_FILE_NOT_FOUND
```

## 问题现象

浏览器尝试访问一个 blob: URL，但该 URL 指向的 Blob 对象已经不存在，导致 `ERR_FILE_NOT_FOUND` 错误。

## 根本原因分析

### 1. blob: URL 的生命周期

blob: URL 是通过 `URL.createObjectURL(blob)` 创建的临时 URL，它的生命周期：

```
创建：URL.createObjectURL(blob) → "blob:http://localhost:3000/xxx"
使用：<img src="blob:..."> 或 <video src="blob:...">
释放：URL.revokeObjectURL(url) → Blob URL 失效
```

**重要特性**：
- blob: URL 一旦被 `revokeObjectURL()` 释放，就**永久失效**
- 即使 Blob 对象本身还存在，URL 也不能再使用
- 刷新页面后，所有 blob: URL 都会失效（因为 Blob 对象在内存中）

### 2. 当前代码中的问题点

#### 问题 1：CanvasLayer 组件中的清理逻辑

**文件**: `src/modules/canvas/components/CanvasLayer.tsx` (L55-89)

```typescript
useEffect(() => {
  let objectUrl: string | null = null;
  
  const resolve = async () => {
    if (layer.type === 'image' || layer.type === 'drawing') {
      const resolved = await resolveImageSrc(srcToResolve);
      setResolvedSrc(resolved);
      if (resolved.startsWith('blob:') && resolved !== layer.src) {
        objectUrl = resolved;  // ⚠️ 记录新创建的 blob URL
      }
    } else {
      setResolvedSrc(layer.src);
    }
  };
  
  resolve();
  
  // 清理函数
  return () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);  // ⚠️ 组件卸载时释放
    }
  };
}, [layer.src, layer.type, layer.imageId]);  // ⚠️ 依赖项变化时重新执行
```

**问题场景**：

1. **组件重新渲染**：当 `layer.src` 变化时，useEffect 重新执行
2. **旧 URL 被释放**：清理函数释放了之前的 blob URL
3. **但 DOM 还在使用**：如果 React 还没完成重新渲染，旧的 img/video 标签可能还在尝试访问已释放的 URL

#### 问题 2：数据恢复时创建的 blob URL

**文件**: `src/modules/canvas/services/canvasIntegrationService.ts` (L616-650)

```typescript
const restoredLayers = await Promise.all(state.layers.map(async (layer: any) => {
  if (layer.type === 'image') {
    if (layer.imageId) {
      const blob = await unifiedImageService.getImage(layer.imageId);
      if (blob) {
        return { ...layer, src: URL.createObjectURL(blob) };  // ⚠️ 创建 blob URL
      }
    }
  }
  // ...
}));

importLayers(restoredLayers, true);
```

**问题**：
- 这里创建的 blob URL **没有被跟踪和管理**
- 当组件卸载或数据变化时，这些 URL 没有被释放，造成**内存泄漏**
- 或者，如果手动释放了这些 URL，但图层还在使用，就会出现 `ERR_FILE_NOT_FOUND`

#### 问题 3：视频图层的 src 保存

**文件**: `src/modules/canvas/types/canvas.ts`

```typescript
export interface LayerData {
  src: string;  // ⚠️ 可能存储 blob: URL
  imageId?: string;  // ⚠️ 应该使用这个
  srcSaved?: boolean;
}
```

**问题**：
- 如果 `layer.src` 存储的是 blob: URL，刷新页面后这个 URL 就失效了
- 正确的做法：只存储 `imageId` 或 `video:xxx` 引用，不存储 blob: URL

## 具体场景分析

### 场景 1：页面刷新

```
1. 用户打开页面，加载画布数据
2. 从 IndexedDB 读取图片/视频 Blob
3. 创建 blob: URL: URL.createObjectURL(blob) → "blob:http://localhost:3000/xxx"
4. 渲染：<img src="blob:...">
5. 用户刷新页面
6. ⚠️ 所有内存中的 Blob 对象被清除
7. ⚠️ 但 localStorage 中的图层数据还保存着旧的 blob: URL
8. 尝试恢复时：<img src="blob:..."> → ERR_FILE_NOT_FOUND
```

**解决方案**：
- 不要将 blob: URL 保存到 localStorage
- 刷新后重新从 IndexedDB 加载，重新创建 blob: URL

### 场景 2：切换项目

```
1. 项目 A 有图片图层，src = "blob:http://localhost:3000/aaa"
2. 切换到项目 B
3. ⚠️ 如果项目 A 的 blob URL 被释放
4. ⚠️ 但组件还没完全卸载
5. <img src="blob:..."> → ERR_FILE_NOT_FOUND
```

### 场景 3：快速切换图层

```
1. 选中图层 A，显示图片
2. 快速切换到图层 B
3. useEffect 清理函数释放图层 A 的 blob URL
4. 但 React 可能还在渲染图层 A 的最后一帧
5. <img src="blob:..."> → ERR_FILE_NOT_FOUND
```

## 解决方案

### 方案 1：改进 blob URL 管理（推荐）

**核心思路**：
- 使用统一的图片/视频加载 Hook
- 自动管理 blob URL 的生命周期
- 确保组件卸载时才释放 URL

**实现示例**：

```typescript
// hooks/useBlobUrl.ts
export function useBlobUrl(urlOrId: string | undefined, type: 'image' | 'video') {
  const [blobUrl, setBlobUrl] = useState<string>('');
  
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    
    const load = async () => {
      if (!urlOrId) {
        setBlobUrl('');
        return;
      }
      
      // 如果已经是 blob: 或 data: 或 http:，直接使用
      if (urlOrId.startsWith('blob:') || 
          urlOrId.startsWith('data:') || 
          urlOrId.startsWith('http://') || 
          urlOrId.startsWith('https://')) {
        setBlobUrl(urlOrId);
        return;
      }
      
      // 从 IndexedDB 加载
      try {
        let blob: Blob | null;
        if (type === 'video') {
          blob = await unifiedImageService.getVideo(urlOrId.replace('video:', ''));
        } else {
          blob = await unifiedImageService.getImage(urlOrId.replace('local:', ''));
        }
        
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
        }
      } catch (error) {
        console.error('加载 blob 失败:', error);
        setBlobUrl('');
      }
    };
    
    load();
    
    return () => {
      cancelled = true;
      if (objectUrl) {
        // 延迟释放，给 React 时间完成渲染
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl!);
        }, 100);
      }
    };
  }, [urlOrId, type]);
  
  return blobUrl;
}
```

**使用**：

```typescript
// CanvasLayer.tsx
const resolvedSrc = useBlobUrl(layer.src, layer.type === 'video' ? 'video' : 'image');

return (
  <img src={resolvedSrc} alt={layer.title} />
);
```

### 方案 2：确保只存储引用，不存储 blob URL

**修改序列化逻辑**：

```typescript
// canvasIntegrationService.ts - serializeCanvasState
const serializedLayers = layers.map(layer => {
  const { src, thumbnail, ...rest } = layer;
  
  return {
    ...rest,
    // ⚠️ 确保 src 不是 blob: 格式
    srcSaved: !!src && !src.startsWith('blob:'),
    // 只保存 imageId 或 video:xxx 引用
    imageId: layer.imageId,
  };
});
```

**修改反序列化逻辑**：

```typescript
// 反序列化时，检查 src 是否是无效的 blob: URL
const restoredLayers = await Promise.all(state.layers.map(async (layer: any) => {
  // 如果 src 是 blob: 格式，忽略它，重新从 imageId 加载
  if (layer.src?.startsWith('blob:')) {
    console.warn('检测到无效的 blob: URL，将从 imageId 重新加载:', layer.id);
    layer.src = undefined;
  }
  
  if (layer.imageId) {
    const blob = await unifiedImageService.getImage(layer.imageId);
    if (blob) {
      return { ...layer, src: URL.createObjectURL(blob) };
    }
  }
  return layer;
}));
```

### 方案 3：添加错误处理和降级显示

**CanvasLayer.tsx**：

```typescript
<img
  src={resolvedSrc}
  alt={layer.title}
  className="w-full h-full object-contain"
  onError={(e) => {
    console.error('图片加载失败:', {
      layerId: layer.id,
      title: layer.title,
      src: layer.src?.substring(0, 50)
    });
    
    // 如果是 blob: URL 失败，尝试从 imageId 重新加载
    if (layer.src?.startsWith('blob:') && layer.imageId) {
      console.log('blob URL 失效，尝试从 imageId 重新加载');
      // 触发重新加载逻辑
    }
  }}
/>
```

## 最佳实践建议

### 1. 数据存储规则

✅ **DO**:
- 只存储 `imageId`、`video:xxx`、`local:xxx` 等引用
- 存储原始数据 URL（base64、http://、https://）
- 在 `srcSaved` 字段中标记是否有可用数据

❌ **DON'T**:
- 不要存储 `blob:` URL 到持久化存储（localStorage、IndexedDB）
- 不要假设 blob: URL 在页面刷新后还有效

### 2. blob URL 生命周期管理

```typescript
// ✅ 正确的模式
useEffect(() => {
  let objectUrl: string | null = null;
  
  const load = async () => {
    const blob = await loadBlob();
    objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
  };
  
  load();
  
  return () => {
    // 组件卸载时才释放
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}, [dependency]);
```

### 3. 使用统一的加载服务

推荐使用 `unifiedImageService.resolveForDisplay()`：

```typescript
const displayUrl = await unifiedImageService.resolveForDisplay('local:img_123');
// 自动处理：
// - local:xxx → 从 IndexedDB 加载 → 返回 blob: URL
// - video:xxx → 从视频存储加载 → 返回 blob: URL
// - data:/http:/https: → 直接返回
```

### 4. 添加调试日志

```typescript
console.log('[CanvasLayer] 图层数据:', {
  id: layer.id,
  type: layer.type,
  src: layer.src?.substring(0, 50),
  imageId: layer.imageId,
  isBlobUrl: layer.src?.startsWith('blob:')
});
```

## 修复检查清单

- [ ] 检查所有创建 blob: URL 的地方
- [ ] 确保每个 `createObjectURL` 都有对应的 `revokeObjectURL`
- [ ] 确保只在组件卸载时释放，不在依赖项变化时立即释放
- [ ] 检查序列化逻辑，确保不保存 blob: URL
- [ ] 在反序列化时，检测并忽略无效的 blob: URL
- [ ] 添加错误处理，当 blob: URL 失效时尝试降级方案
- [ ] 考虑使用统一的 Hook 管理 blob URL

## 相关文件

- `/Users/wl/Desktop/job/learn/WL-AI-Director/src/modules/canvas/components/CanvasLayer.tsx`
- `/Users/wl/Desktop/job/learn/WL-AI-Director/src/modules/canvas/services/canvasIntegrationService.ts`
- `/Users/wl/Desktop/job/learn/WL-AI-Director/src/modules/canvas/hooks/useCanvasState.ts`
- `/Users/wl/Desktop/job/learn/WL-AI-Director/services/unifiedImageService.ts`
- `/Users/wl/Desktop/job/learn/WL-AI-Director/services/imageStorageService.ts`

## 总结

blob: URL 失效问题的核心原因是：
1. **生命周期管理不当**：在组件还在使用时就释放了 URL
2. **数据持久化错误**：将临时 blob: URL 保存到持久化存储
3. **缺少错误处理**：没有处理 URL 失效后的降级方案

解决方案：
1. 使用统一的 Hook 管理 blob URL 生命周期
2. 只存储引用（imageId、video:xxx），不存储 blob: URL
3. 添加错误处理和降级显示逻辑
