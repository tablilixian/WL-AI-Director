---
title: 720° 全景功能设计文档
category: features
status: active
audience: developer
created: 2026-07-01
updated: 2026-07-02

> **开发状态**: Phase 1 ✅ 完成 | Phase 2 ✅ 完成 | Phase 3 ✅ 完成
---

# 720° 全景功能设计文档

## 1. 概述

### 1.1 功能定位

在创意画布中增加 **720° 全景图** 能力，允许用户将普通图片或文本描述转换为等距柱状投影（Equirectangular）全景图，并在画布内进行沉浸式 3D 预览、多视角截图导出。

对标 LibTV 的「720°全景」功能：**场景一致性的核心基础设施** — 全景图将"单面视图"展开为"完整空间"，让 AI 视频生成中的场景保持、镜头切换、人物走位有空间依据。

### 1.2 核心价值

| 场景 | 价值 |
|------|------|
| AI 短剧/漫剧制作 | 全景图作为场景底图，保证切镜时场景风格、空间布局一致 |
| 虚拟展厅/空间设计 | 文本/图片一键生成可环视的空间概念图 |
| 产品/品牌展示 | 生成 720° 展示环境，多视角截图用于宣传物料 |

### 1.3 与现有功能的关系

```
                    ┌─────────────────────────┐
                    │     ImageActionMenu      │
                    │  (选中图片后的工具栏)      │
                    ├─────────────────────────┤
                    │  ... 现有功能 ...         │
                    │  ┌───────────────────┐  │
                    │  │ 720° 全景 (新增)   │  │
                    │  └───────────────────┘  │
                    └────────┬────────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │   PanoramaPanel          │  ← 新增
               │   (全景生成配置面板)      │
               └────────┬────────────────┘
                        │
                        ▼
          ┌─────────────────────────────┐
          │   全景图层 (panorama)        │  ← 新增 LayerType
          │   · 等距柱状投影图           │
          │   · 带有 camera state        │
          └────────┬────────────────────┘
                   │ 双击进入全景预览
                   ▼
          ┌─────────────────────────────┐
          │   PanoramaViewer             │  ← 新增
          │   (Three.js 3D 球体预览)     │
          │   · 鼠标拖拽旋转             │
          │   · 滚轮缩放                 │
          │   · 视角截图                 │
          │   · 4/12 视角自动切片        │
          └─────────────────────────────┘
```

---

## 2. 用户交互流程

### 2.1 生成全景图

```
用户选中画布中的图片
  → ImageActionMenu 浮现
  → 点击「720° 全景」(新增按钮)
  → 弹出 PanoramaPanel（配置面板）
    ├── 模式：文本生成 | 基于此图生成
    ├── 提示词输入框（文本模式必填，图模式可选）
    └── 点击「生成」
  → AI 生成等距柱状投影全景图
  → 结果以 panorama 类型图层插入画布
  → 图层缩略图显示为全景图预览
```

### 2.2 全景预览

```
用户双击全景图层（或右键 → 全景预览）
  → 打开 PanoramaViewer（全屏/半屏覆盖）
  → Three.js 渲染球体全景
  → 交互：
    ├── 鼠标拖拽：旋转视角（水平 360° + 垂直 180°）
    ├── 滚轮：缩放视野（FOV 20°~100°）
    ├── 顶部工具栏：
    │   ├── 截图当前视角 → 导出为新 image 图层
    │   ├── 4 大视角截图 → 前后左右 4 张
    │   ├── 12 大视角截图 → 每 30° 一张
    │   └── 重置视角
    └── 右上角关闭按钮 → 回到 2D 画布
```

### 2.3 截图结果处理

```
截图/切片完成后
  → 自动关闭 PanoramaViewer
  → 回到 2D 画布
  → 截图结果以 image 图层数组导入画布
  ├── 单张截图：插入在原全景图旁边
  ├── 4 张切片：自动布局为 2×2 或一字排列
  └── 12 张切片：自动布局为 4×3 或 3×4
```

---

## 3. 数据结构变更

### 3.1 新增 LayerType

```typescript
// src/modules/canvas/types/canvas.ts

// 在 LayerType 联合类型中增加 'panorama'
export type LayerType = 'image' | 'video' | 'sticky' | 'text' | 'group' 
  | 'drawing' | 'audio' | 'prompt' | 'panorama';
```

### 3.2 PanoramaLayerData 接口

```typescript
// src/modules/canvas/types/canvas.ts 新增

/** 全景相机初始视角 */
export interface PanoramaCameraState {
  /** 水平角度 (弧度) */
  azimuth: number;    // 默认 0
  /** 垂直角度 (弧度) */
  pitch: number;      // 默认 0
  /** 视野角度 (度) */
  fov: number;        // 默认 75
}

/** 全景图层数据（扩展 LayerData） */
export interface PanoramaLayerData extends LayerData {
  type: 'panorama';
  /** 是否为全景图 (固定 true，用于运行时判断) */
  isPanorama: true;
  /** 相机初始状态（可选，用于恢复上次查看位置） */
  cameraState?: PanoramaCameraState;
  /** 全景图原始宽高比（用于等距柱状投影校验） */
  aspectRatio?: number;
}

/** 全景截图操作类型 */
export type PanoramaScreenshotMode = 
  | 'single'        // 单张截图（当前视角）
  | 'quad'          // 4 大视角（每 90°）
  | 'dodeca'        // 12 大视角（每 30°）
  | 'custom';       // 自定义角度（预留）
```

### 3.3 operationType 扩展

```typescript
// 在 LayerData.operationType 的联合类型中增加
'panorama-generation'   // 生成来源标记
'panorama-screenshot'   // 全景截图来源标记
```

### 3.4 序列化适配

`panorama` 类型的序列化/反序列化与 `image` 类型一致：
- `src` 存储等距柱状投影图的 Blob URL / Base64
- `imageId` 引用 IndexedDB 中的原始图片数据
- `cameraState` 作为元数据随 JSON 序列化
- 序列化时排除 `src`，保留 `imageId` 和 `cameraState`

---

## 4. 组件架构

### 4.1 新增文件清单

| 文件路径 | 职责 |
|---------|------|
| `components/PanoramaPanel.tsx` | 全景图生成配置面板（AI 参数配置） |
| `components/PanoramaViewer.tsx` | Three.js 全景 3D 预览组件（核心） |
| `components/PanoramaViewerToolbar.tsx` | 全景预览顶部工具栏（截图/切片/重置） |
| `hooks/usePanoramaViewer.ts` | 全景预览器的状态和交互逻辑（相机控制、截图） |
| `services/panoramaGenerationService.ts` | 全景图 AI 生成服务（调用 canvasModelService） |
| `utils/panoramaUtils.ts` | 全景工具函数（等距柱状投影校验、截图转图层） |

### 4.2 PanoramaPanel

```
Props:
  - selectedLayerId: string | null    // 源图片图层（图生图模式）
  - onClose: () => void

状态:
  - mode: 'text-to-panorama' | 'image-to-panorama'
  - prompt: string
  - isLoading: boolean
  - progress: number

流程:
  1. 用户选择模式和填写参数
  2. 调用 panoramaGenerationService.generate()
  3. 等待 AI 返回等距柱状投影图
  4. 创建 panorama 图层插入画布
  5. 关闭面板
```

### 4.3 PanoramaViewer（核心组件）

```
Props:
  - panoramaSrc: string           // 全景图 URL
  - initialCamera?: PanoramaCameraState
  - onClose: () => void
  - onScreenshots: (images: ScreenshotResult[]) => void  // 截图回调

内部实现:
  - 使用原生 Three.js (非 @react-three/fiber)，动态 import 加载
  - 渲染管线:
     1. 加载等距柱状投影图作为纹理
     2. 创建球体几何体 (SphereGeometry, 内表面渲染)
     3. 相机位于球心 (Position: 0,0,0)
     4. 手动相机控制（非 OrbitControls）：维护 yaw/pitch 状态，计算 lookAt
     5. 鼠标滚轮调整 FOV (zoom)
  - 截图实现:
    - 使用 renderer.domElement.toDataURL() 或 toBlob() 捕获当前帧
    - 4/12 视角切片: 直接修改 yaw 值，逐帧渲染并截图

相机控制方案: 手动实现（参考 Infinite-Canvas）
  原因:
  - 对 yaw/pitch 有精确控制，便于自动切片时精确定位角度
  - 不受 OrbitControls 的阻尼/插值影响，截图结果干净无偏差
  - 减少 Three.js 依赖体积（不需要 OrbitControls 代码）
  - 拖拽灵敏度可调（参考值: 0.18）

纹理加载方案: 先加载 Image 元素，再从 Image 创建 Texture
  原因:
  - 复用已缓存的图片，避免重复网络请求
  - 更精确控制加载状态（complete/naturalWidth 检查）
  - 与现有 canvas 图片加载流程一致

技术选型: 原生 Three.js，动态 import
  - 全景预览与 React 树解耦
  - 动态 import 避免主包体积膨胀，仅在进入全景预览时加载
```

### 4.4 PanoramaViewerToolbar

```
渲染在 PanoramaViewer 顶部的浮动工具栏:
  ├── 📷 截图当前视角 (single)
  ├── 🖼 4 大视角截图 (quad)
  │   └── 自动抓取 0° / 90° / 180° / 270° 四张
  ├── 🖼 12 大视角截图 (dodeca)
  │   └── 自动抓取每 30° 一张
  ├── 🔄 重置视角
  └── ✕ 关闭预览
```

---

## 5. AI 生成服务

### 5.1 panoramaGenerationService

```typescript
// src/modules/canvas/services/panoramaGenerationService.ts

interface PanoramaGenerationOptions {
  /** 生成模式 */
  mode: 'text-to-panorama' | 'image-to-panorama';
  /** 提示词（文本模式必填，图模式可选） */
  prompt?: string;
  /** 参考图片 src（图模式必填） */
  referenceImage?: string;
  /** 进度回调 */
  onProgress?: (progress: number) => void;
}

interface PanoramaGenerationResult {
  /** 生成的全景图 src (Blob URL) */
  panoramaSrc: string;
  /** 图片宽度 */
  width: number;
  /** 图片高度 (等距柱状投影通常为 width/2) */
  height: number;
}

class PanoramaGenerationService {
  async generate(options: PanoramaGenerationOptions): Promise<PanoramaGenerationResult>;
}
```

### 5.2 API 对接

全景图生成的 API 调用分为两种路径：

**路径 A：直接调用全景模型 API**
- 如果后端已部署全景专用模型（如 Stable Diffusion 的全景微调模型）
- 传递 prompt/referenceImage + 特殊参数 `panorama: true`
- 返回等距柱状投影图

**路径 B：基于现有 image-to-image 管线**
- 先通过 text-to-image 或 image-to-image 生成普通图
- 再调用 `outpaint` 扩展 API，以"向四周脑补"方式扩展为全景图
- 在 prompt 中注入全景关键词：`"720 degree equirectangular panorama, seamless, ..."`

具体采用哪种路径由后端模型能力决定，前端保持接口抽象。

---

## 6. InfiniteCanvas 集成

### 6.1 图层渲染适配

在 `CanvasLayer.tsx` 中增加 panorama 类型渲染分支：

```typescript
// CanvasLayer.tsx 渲染分支
switch (layer.type) {
  case 'image':
  case 'drawing':
    return <img src={resolvedSrc} />;
  case 'video':
    return <video src={resolvedSrc} />;
  case 'panorama':
    return (
      <div className="panorama-thumbnail" onDoubleClick={openPanoramaViewer}>
        <img src={resolvedSrc} />  {/* 显示全景缩略图 */}
        <div className="panorama-badge">720°</div>  {/* 角标 */}
      </div>
    );
  // ... 其他类型
}
```

### 6.2 ImageActionMenu 新增入口

在 `ImageActionMenu.tsx` 的 groups 数组中增加全景入口：

```typescript
// 新增 group
{
  label: '全景空间',
  icon: <Orbit className="w-3.5 h-3.5" />,  // 使用 lucide-react 的 Orbit 图标
  single: { id: 'panorama', label: '720° 全景' },
}
```

并将 `'panorama'` 加入 `ImageAction` 联合类型。

### 6.3 全景图层交互

| 交互 | 行为 |
|------|------|
| 单击选中 | 显示选中边框，显示 ResizeHandle |
| 双击 | 打开 PanoramaViewer 全屏预览 |
| 拖拽 | 同 image 图层（在 2D 画布上移动位置） |
| 右键菜单 | 增加「全景预览」「导出全景截图」选项 |
| 连接线 | 支持全景图层连接视频节点（作为场景参考图） |

### 6.4 全景自动检测（导入时）

参考 Infinite-Canvas 的 `isLikelyPanoramaImage()`，在用户拖入/导入图片时自动检测是否为全景图：

```typescript
function isLikelyPanoramaImage(src: string, naturalW: number, naturalH: number, fileName?: string): boolean {
  // 检测文件名/标题中是否包含全景关键词
  if (/(?:360|全景|环景|panorama|equirect|spherical|vr\b)/i.test(fileName || '')) {
    return true;
  }
  // 检测宽高比是否 ≈ 2:1（等距柱状投影图标准比例）
  if (naturalW > 0 && naturalH > 0) {
    const aspect = naturalW / naturalH;
    if (aspect >= 1.9 && aspect <= 2.1) return true;
  }
  return false;
}
```

检测到全景图时，弹出提示气泡：
```
"检测到全景图，是否以 720° 全景模式打开？ [进入全景] [取消]"
```

---

## 7. Three.js 技术方案

### 7.1 选型理由

| 方案 | 决策 |
|------|------|
| **原生 Three.js** | ✅ 选用。PanoramaViewer 是独立全屏覆盖层，无需 React 声明式管理，减少 bundle 体积 |
| @react-three/fiber | ❌ 不选用。增加复杂度和依赖，且全景预览与 React 树解耦更简单 |
| Photo Sphere Viewer | ⚠️ 暂不选用。虽然功能丰富但定制灵活性受限，且增加额外依赖 |
| pano-viewer | ⚠️ 暂不选用。社区较小，不如自研 Three.js 方案可控 |

### 7.2 Three.js 加载方式

采用**动态 import** 策略，避免主包体积膨胀：

```typescript
// PanoramaViewer.tsx 动态加载 Three.js
let THREE: typeof import('three') | null = null;
let threeLoadPromise: Promise<typeof import('three')> | null = null;

async function ensureThree(): Promise<typeof import('three') | null> {
  if (THREE) return THREE;
  if (!threeLoadPromise) {
    threeLoadPromise = import('three');
  }
  try {
    THREE = await threeLoadPromise;
    return THREE;
  } catch {
    return null;
  }
}
```

### 7.3 核心渲染逻辑

```typescript
// PanoramaViewer 核心实现 — 手动相机控制（非 OrbitControls）

// ---------- 初始化 ----------
const THREE = await import('three');
if (!THREE) return;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, initW / initH, 1, 1200);
camera.position.set(0, 0, 0);

// 球体（内表面）- 用 BackSide 替代 scale(-1,1,1)
const geometry = new THREE.SphereGeometry(500, 64, 64);
const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// ---------- 纹理加载 ----------
const img = new Image();
img.onload = () => {
  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.x = -1;   // 水平翻转，适配 BackSide 内壁
  texture.offset.x = 1;
  texture.needsUpdate = true;
  sphere.material.map = texture;
  sphere.material.needsUpdate = true;
  // 首次渲染前必须通过 renderer.setSize 同步 canvas 尺寸
  renderer.setSize(containerW, containerH, false);
  requestRender();
};
img.src = panoramaSrc;

// ---------- 相机控制（四元数，替代 camera.lookAt） ----------
interface CameraState {
  yaw: number;    // 0 = 正前方 (FRONT)
  pitch: number;  // 0 = 水平，±85 = 极限
  fov: number;    // 35~100
}
const state: CameraState = { yaw: 0, pitch: 0, fov: 75 };

function updateCamera() {
  const phi = THREE.MathUtils.degToRad(90 - state.pitch);
  const theta = THREE.MathUtils.degToRad(state.yaw);
  const dir = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
  camera.fov = state.fov;
  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
  camera.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  camera.position.set(0, 0, 0);
  camera.updateMatrixWorld(true);
}

// ---------- 尺寸同步（必须用 renderer.setSize） ----------
function syncCanvasSize() {
  const w = Math.round(container.getBoundingClientRect().width);
  const h = Math.round(container.getBoundingClientRect().height);
  if (w > 0 && h > 0) {
    renderer.setSize(w, h, false);  // 同时更新 viewport
    requestRender();
  }
}

// ---------- 拖拽交互 ----------
let dragState: { clientX: number; clientY: number; yaw: number; pitch: number } | null = null;

canvas.addEventListener('mousedown', (e) => {
  dragState = {
    clientX: e.clientX,
    clientY: e.clientY,
    yaw: state.yaw,
    pitch: state.pitch
  };
});

canvas.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  const dx = e.clientX - dragState.clientX;
  const dy = e.clientY - dragState.clientY;
  state.yaw = dragState.yaw - dx * 0.18;       // 灵敏度 0.18
  state.pitch = Math.max(-85, Math.min(85, dragState.pitch + dy * 0.18));
});

canvas.addEventListener('mouseup', () => { dragState = null; });
canvas.addEventListener('mouseleave', () => { dragState = null; });

// ---------- 滚轮缩放 ----------
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  state.fov = Math.max(35, Math.min(100, state.fov + (e.deltaY > 0 ? 5 : -5)));
});

// ---------- 渲染循环 ----------
function renderFrame() {
  updateCamera();
  renderer.render(scene, camera);
}

let animationId = 0;
function startRenderLoop() {
  const loop = () => {
    renderFrame();
    animationId = requestAnimationFrame(loop);
  };
  loop();
}
function stopRenderLoop() {
  cancelAnimationFrame(animationId);
  animationId = 0;
}
```

### 7.4 截图实现

利用手动相机控制的精确性，直接修改 `state.yaw` 完成多角度切片：

```typescript
// 单张截图（当前视角）
function captureCurrentView(): Promise<Blob | null> {
  renderFrame();
  return new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png'));
}

// 4 大视角截图（每 90°）
function captureQuadViews(): Promise<Blob[]> {
  const results: Promise<Blob | null>[] = [];
  for (let angle = 0; angle < 360; angle += 90) {
    state.yaw = angle;
    renderFrame();
    results.push(new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png')));
  }
  // 恢复原始视角
  state.yaw = dragState?.yaw ?? 0;
  return Promise.all(results).then((blobs) => blobs.filter(Boolean) as Blob[]);
}

// 12 大视角截图（每 30°）
function captureDodecaViews(): Promise<Blob[]> {
  const results: Promise<Blob | null>[] = [];
  for (let angle = 0; angle < 360; angle += 30) {
    state.yaw = angle;
    renderFrame();
    results.push(new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png')));
  }
  state.yaw = dragState?.yaw ?? 0;
  return Promise.all(results).then((blobs) => blobs.filter(Boolean) as Blob[]);
}
```

### 7.5 依赖

Three.js 采用**动态 import**，非静态依赖。不加入 `package.json` 的 dependencies：

```typescript
// 按需加载，不增加主包体积
const THREE = await import('three');
```

如需类型支持，仅加 devDependencies：

```json
{
  "devDependencies": {
    "three": "^0.170.0",
    "@types/three": "^0.170.0"
  }
}
```

---

## 8. 存储与持久化

### 8.1 全景图存储

全景图层的数据存储复用现有架构：

| 数据 | 存储位置 | 说明 |
|------|---------|------|
| 等距柱状投影图 (Blob) | IndexedDB (assets) | 通过 `imageStorageService` |
| 缩略图 (256px) | IndexedDB (assets) | 用于画布 LOD 渲染 |
| 图层元数据 (含 cameraState) | IndexedDB (canvas_data) | 随 CanvasState 一起持久化 |
| 序列化 JSON (排除 src) | localStorage 备份 | 紧急恢复用 |

ID 生成规则：
```typescript
const panoramaId = `canvas_panorama_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

### 8.2 反序列化恢复

全景图层的恢复逻辑与 image 图层一致：
- 从 JSON 中读取 `imageId`
- 通过 `imageStorageService.getImage(imageId)` 获取 Blob
- 创建 Object URL 赋给 `src`
- `cameraState` 直接从 JSON 恢复（纯数据，无二进制）

---

## 9. 实施计划

### ✅ Phase 1 — 基础全景能力 (已完成)

| 序号 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 1.1 | 新增 `panorama` 类型定义 + `PanoramaLayerData` 接口 | `types/canvas.ts` | ✅ |
| 1.2 | 实现 `PanoramaViewer` 核心预览（Three.js 动态 import + 手动相机控制 + 渲染循环） | `components/PanoramaViewer.tsx` | ✅ |
| 1.3 | 实现 `PanoramaViewerToolbar`（重置视角、截图、4/12视角切片、缩放指示器、关闭） | `components/PanoramaViewerToolbar.tsx` | ✅ |
| 1.4 | 实现 `PanoramaPanel` 生成配置面板 | `components/PanoramaPanel.tsx` | ✅ |
| 1.5 | 实现 `panoramaGenerationService`（AI 生成对接） | `services/panoramaGenerationService.ts` | ✅ |
| 1.6 | CanvasLayer 增加 panorama 类型渲染分支（缩略图 + 720° 角标 + 双击预览 + 截图回画布） | `components/CanvasLayer.tsx` | ✅ |
| 1.7 | ImageActionMenu 增加「720° 全景」入口 | `components/ImageActionMenu.tsx` | ✅ |
| 1.8 | 序列化/反序列化适配 + Minimap 颜色适配 + index.ts 导出 | `services/canvasIntegrationService.ts` + `Minimap.tsx` + `index.ts` | ✅ |

### ✅ Phase 2 — 全景截图与工具链 (已完成)

| 序号 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 2.1 | PanoramaViewerToolbar 增加单张截图按钮 | `components/PanoramaViewerToolbar.tsx` | ✅ |
| 2.2 | 实现 4/12 视角自动切片（遍历 yaw 截图） | `components/PanoramaViewer.tsx` | ✅ |
| 2.3 | 截图结果自动布局回画布（单张/4张/12张 → 图层数组） | `components/CanvasLayer.tsx` | ✅ |
| 2.4 | 右键菜单增加「全景预览」「导出全景截图」选项 | `components/CanvasLayer.tsx` | ✅ |
| 2.5 | 全景自动检测工具函数 | `utils/panoramaUtils.ts` | ✅ |
| 2.6 | 序号更新 | — | ✅ |
| 2.7 | 截图导出为 PNG（toBlob 方式） | `components/PanoramaViewer.tsx` | ✅ |

### ✅ Phase 3 — 体验增强 (已完成)

| 序号 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 3.1 | 全景自动检测 + 导入提示 | `utils/panoramaUtils.ts` + `components/InfiniteCanvas.tsx` | ✅ |
| 3.2 | 全景图与视频节点的连接线支持 | `components/ConnectionLines.tsx` | ✅ |
| 3.3 | 加载状态指示（纹理加载旋转动画 + "加载全景图..."文字） | `components/PanoramaViewer.tsx` | ✅ |
| 3.4 | 移动端触摸支持（单指旋转 + 双指缩放 + 陀螺仪） | `components/PanoramaViewer.tsx` | ✅ |
| 3.5 | 自定义视角预设保存/恢复（下拉菜单 + 删除） | `components/PanoramaViewer.tsx` + `components/PanoramaViewerToolbar.tsx` | ✅ |
| 3.6 | 全景图上传模式 + 多图拼接 | `components/PanoramaPanel.tsx` + `components/InfiniteCanvas.tsx` | ✅ |
| 3.7 | 全景图 HUD（罗盘 + yaw/pitch/zoom 数值） | `components/PanoramaViewer.tsx` | ✅ |
| 3.8 | 拖拽灵敏度优化（0.18 → 0.08 → 0.02） | `utils/panoramaUtils.ts` | ✅ |
| 3.9 | `renderer.setSize` 替代直接 canvas 赋值（修复 viewport/GL_INVALID_VALUE） | `components/PanoramaViewer.tsx` | ✅ |
| 3.10 | 全景图 IndexedDB 持久化（`imageId` 替代 `src` 序列化） | `components/PanoramaViewer.tsx` + `components/CanvasLayer.tsx` | ✅ |

---

## 10. 开发原则

1. **不破坏现有功能**：全景功能作为增量特性，不修改现有图层类型的渲染逻辑
2. **渐进增强**：Phase 1 完成后即可发布基础功能，后续 Phase 逐步叠加
3. **依赖最小化**：只用 three.js，不引入额外的全景库
4. **复用现有架构**：存储、序列化、生成任务管理等复用 canvas 现有机制
5. **与 ImageActionMenu 风格一致**：UI 交互方式与其他 AI 功能保持一致

---

## 11. 设计决策记录

| 决策 | 选项 | 选择 | 原因 |
|------|------|------|------|
| 3D 引擎 | Three.js / R3F / PSV | Three.js | 全景预览与 React 树解耦，最小化依赖 |
| 加载方式 | 静态依赖 / 动态 import | 动态 import | 主包不增加体积，仅进入全景预览时加载（参考 Infinite-Canvas） |
| 相机控制 | OrbitControls / 手动 yaw/pitch | 手动 yaw/pitch | 精确控制角度，便于自动切片，减小依赖体积（参考 Infinite-Canvas） |
| 纹理加载 | TextureLoader / Image→Texture | Image→Texture | 复用缓存图片，精确加载状态控制（参考 Infinite-Canvas） |
| 全景类型 | `panorama` vs 复用 `image` | 新增 `panorama` 类型 | 语义清晰，便于后续扩展（cameraState 等） |
| 预览方式 | 全屏覆盖 / 弹窗 / 嵌入式 | 全屏覆盖 | 沉浸式体验最佳 |
| 截图实现 | 前端 Canvas 截图 / 后端渲染 | 前端截图 | 即时反馈，无需额外服务端资源 |
| AI 生成 | 纯文本 / 图生图 / 两者 | 两者都支持 | 覆盖更多创作场景 |
| 拖拽灵敏度 | — | 0.02 | 从 0.18 逐步调试确定，避免初始抖动 |
| 全景检测 | 自动检测 / 用户手动 | 两者 | 导入时自动提示 + ImageActionMenu 手动入口 |

### 11.1 已确认的关键参数

| 参数 | 值 | 来源 |
|------|-----|------|
| 球体半径 | 500 | Three.js 全景惯例，不影响视觉 |
| 球体分段 | 64 × 64 | 性能与画质平衡 |
| 相机位置 | 0（球心） | 设置 `camera.position.set(0,0,0)` |
| 相机朝向 | 四元数 `setFromUnitVectors((0,0,-1), dir)` | 替代 `camera.lookAt()`，避免相机矩阵同步问题 |
| 球体渲染 | `side: THREE.BackSide` + 纹理水平翻转 | 替代 `geometry.scale(-1,1,1)` + `FrontSide`，避免法线/UV 映射异常 |
| FOV 范围 | 35° ~ 100° | 防止透视畸变 |
| 垂直旋转范围 | ±85° | 避免两极拉伸畸变 |
| 拖拽灵敏度 | 0.02 | 经实测调低，防止鼠标微小移动导致画面抖动 |
| 渲染分辨率 | 1536px（长边） | Infinite-Canvas 参考值 |
| 纹理环绕 | `wrapS: RepeatWrapping, repeat.x: -1, offset.x: 1` | 水平翻转纹理，适应 BackSide 内壁渲染 |
| 尺寸同步 | `renderer.setSize(w, h, false)` | 替代直接 `canvas.width=` 赋值，确保 WebGL viewport 正确更新 |

---

## 12. 待讨论问题

- [ ] **模型支持**：后端是否有全景专用模型？还是通过 prompt + 扩图实现？
- [ ] **截图分辨率**：截图输出的图片尺寸（建议 1536px 长边，与 Infinite-Canvas 一致）？是否与画布分辨率对齐？
- [ ] **全景图质量**：生成的最大分辨率限制？
- [ ] **移动端策略**：Phase 1 是否支持移动端？

### ✅ 已确认的决策（基于 Infinite-Canvas 参考）

- [x] **Three.js 加载**：动态 import，不加入静态依赖（版本 0.160.0+）
- [x] **相机控制**：手动 yaw/pitch + `quaternion.setFromUnitVectors`，不用 OrbitControls
- [x] **纹理加载**：Image 元素 → `new THREE.Texture(img)`，不用 TextureLoader
- [x] **截图方式**：`canvas.toBlob()` → 上传 → 创建新图层
- [x] **全景检测**：导入图片时检查宽高比（1.9~2.1）和文件名关键词
- [x] **拖拽灵敏度**：0.02（从 0.18 逐步调低，经实测确定）
- [x] **渲染分辨率**：1536px 长边
- [x] **球体渲染**：`BackSide` + 纹理 `repeat.x=-1, offset.x=1`，替代 `scale(-1,1,1)` + `FrontSide`
- [x] **尺寸同步**：必须使用 `renderer.setSize()`，禁止直接赋值 `canvas.width`
