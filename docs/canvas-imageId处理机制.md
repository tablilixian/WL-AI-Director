# 无限画布图片存储机制 - imageId 字段处理

## 概述

画布中的图片图层有两种存储方式：
- `src`: 图片数据（Base64 或 blob URL）
- `imageId`: IndexedDB 中高分辨率图片的引用 ID

本文档说明不同场景下图片的存储方式和 imageId 的处理逻辑。

---

## 场景 3：导入分镜/关键帧到画布

**文件**: `canvasIntegrationService.ts`  
**函数**: `importShotsToCanvas()` (L92)

### 处理流程

```
1. 从项目分镜/关键帧获取 imageUrl
         ↓
2. 调用 resolveImageUrl() 解析 URL（支持 base64/local:/HTTP）
         ↓
3. 如果是 base64 格式：
   - 生成 imageId: `canvas_img_${Date.now()}_${random}`
   - 将 base64 转为 blob
   - 保存到 IndexedDB: imageStorageService.saveImage(imageId, blob)
         ↓
4. 创建图层：
   - src: resolvedUrl (Base64)
   - imageId: 保存的 ID
   - linkedResourceId: 关联的分镜 ID
   - linkedResourceType: 'keyframe'
```

### 代码片段 (L120-148)

```typescript
let imageId: string | undefined;
if (resolvedUrl.startsWith('data:')) {
  const imgId = `canvas_img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const response = await fetch(resolvedUrl);
  const blob = await response.blob();
  await imageStorageService.saveImage(imgId, blob);
  imageId = imgId;
}

const layer: LayerData = {
  src: resolvedUrl,
  imageId,
  linkedResourceId: shot.id,
  linkedResourceType: 'keyframe'
  // ...
};
```

### 结论
- ✅ **会生成 imageId**，存储到 IndexedDB
- ✅ `src` 存储完整 Base64 数据

---

## 场景 4：手动上传图片

**文件**: `CanvasToolbar.tsx`  
**函数**: `handleAddImage()` (L44)

### 处理流程

```
1. 用户选择本地图片文件
         ↓
2. FileReader.readAsDataURL(file) 读取为 base64
         ↓
3. 直接添加到图层：
   - src: base64
   - ❌ 没有生成 imageId
   - ❌ 没有保存到 IndexedDB
```

### 代码片段 (L44-74)

```typescript
const handleAddImage = () => {
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target?.result as string;
    useCanvasStore.getState().addLayer({
      src: base64,
      title: file.name
      // ❌ 没有 imageId！
    });
  };
  reader.readAsDataURL(file);
};
```

### 问题
- ❌ **没有生成 imageId**
- ❌ **没有保存到 IndexedDB**
- ⚠️ 图片只存在于内存中，页面刷新后可能丢失

---

## 场景 1：AI 生成图片（文生图）

**文件**: `PromptBar.tsx`  
**函数**: `handleGenerate()` - mode === 'generate' (L63)

### 处理流程

```
1. 调用 canvasModelService.generateImage() 生成图片
         ↓
2. resolveImageUrl() 解析返回的 URL
         ↓
3. 如果是 base64 格式：
   - 生成 imageId: `canvas_gen_${Date.now()}_${random}`
   - 将 base64 转为 blob
   - 保存到 IndexedDB: imageStorageService.saveImage(imageId, blob)
         ↓
4. 更新图层：
   - src: resolvedUrl (Base64)
   - imageId: 保存的 ID
   - operationType: 'text-to-image'
```

### 代码片段 (L88-111)

```typescript
const imageUrl = await canvasModelService.generateImage({ prompt, ... });
const resolvedUrl = await resolveImageUrl(imageUrl);

let imageId: string | undefined;
if (resolvedUrl.startsWith('data:')) {
  const imgId = `canvas_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const response = await fetch(resolvedUrl);
  const blob = await response.blob();
  await imageStorageService.saveImage(imgId, blob);
  imageId = imgId;
}

updateLayer(placeholderId, {
  src: resolvedUrl,
  imageId,
  operationType: 'text-to-image'
});
```

### 结论
- ✅ **会生成 imageId**，存储到 IndexedDB
- ✅ `src` 存储完整 Base64 数据

---

## 场景 2：AI 修改图片（图生图）

**文件**: `PromptBar.tsx`  
**函数**: `handleGenerate()` - mode === 'edit' (L117)

### 处理流程

```
1. 获取选中图片的 src 作为参考图
         ↓
2. 调用 canvasModelService.generateImage() 
   参数: referenceImages: [selectedLayer.src]
         ↓
3. 解析返回的 base64 图片
         ↓
4. 生成 imageId: `canvas_edit_${Date.now()}_${random}`
5. 保存到 IndexedDB
         ↓
6. 创建新图层：
   - src: 生成的 base64
   - imageId: 保存的 ID
   - sourceLayerId: 原始图片图层 ID
   - operationType: 'image-to-image'
```

### 代码片段 (L131-159)

```typescript
const editedUrl = await canvasModelService.generateImage({
  prompt: `Edit this image: ${prompt}`,
  referenceImages: [selectedLayer.src],
  // ...
});

const resolvedUrl = await resolveImageUrl(editedUrl);

let imageId: string | undefined;
if (resolvedUrl.startsWith('data:')) {
  const imgId = `canvas_edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const response = await fetch(resolvedUrl);
  const blob = await response.blob();
  await imageStorageService.saveImage(imgId, blob);
  imageId = imgId;
}

addLayer({
  src: resolvedUrl,
  imageId,
  sourceLayerId: selectedLayer.id,
  operationType: 'image-to-image'
});
```

### 结论
- ✅ **会生成 imageId**，存储到 IndexedDB
- ✅ `src` 存储完整 Base64 数据
- ✅ 保留 `sourceLayerId` 关联原始图片

---

## 总结对比表

| 场景 | imageId | IndexedDB | src 格式 | 说明 |
|------|---------|-----------|----------|------|
| 3. 导入分镜/关键帧 | ✅ | ✅ | Base64 | 正常工作 |
| 4. 手动上传图片 | ❌ | ❌ | Base64 | **需修复** |
| 1. AI 生成图片 | ✅ | ✅ | Base64 | 正常工作 |
| 2. AI 修改图片 | ✅ | ✅ | Base64 | 正常工作 |

---

## 待讨论问题

1. **场景 4（手动上传）是否需要修复？**
   - 如果需要，应在上传时也生成 imageId 并保存到 IndexedDB

2. **图生视频时的图片来源问题**
   - 当前从 `selectedLayer.src` 获取，但这是 blob URL
   - 建议：优先使用 `imageId` 从 IndexedDB 获取高质量原图

3. **数据持久化**
   - 当前只有 AI 生成/修改的图片有 imageId，导入的图片也有
   - 手动上传的图片没有 imageId，刷新后可能丢失
