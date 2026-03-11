# WL AI Director - 功能规范文档 (SPEC)

## 1. 项目概述

**项目名称**: WL AI Director (AI 漫剧工场)  
**项目类型**: AI 一站式短剧/漫剧生成平台  
**技术栈**: React 19, TypeScript, Zustand (状态管理), IndexedDB (本地存储), Supabase (Edge Functions)  
**目标用户**: 短剧/漫剧创作者

### 核心理念
采用 **"Script-to-Asset-to-Keyframe"** 的工业化工作流，通过关键帧驱动 (Keyframe-Driven) 实现精准的镜头控制和角色一致性。

---

## 2. 产品架构

### 2.1 页面流程

```
Dashboard (项目列表)
    │
    ├── [新建项目] → Onboarding (引导流程)
    │                    │
    │                    └── StageScript (剧本阶段)
    │
    └── [打开项目]
                      │
                      ├── StageScript (剧本与分镜)
                      ├── StageAssets (角色与场景资产)
                      ├── StageDirector (导演工作台)
                      ├── StagePrompts (提示词管理)
                      └── StageExport (成片导出)
```

### 2.2 主要模块

| 模块 | 功能 |
|------|------|
| **Auth** | Supabase 认证 (登录/注册) |
| **Dashboard** | 项目管理列表 |
| **Onboarding** | 新用户引导、API Key 配置 |
| **ModelConfig** | AI 模型配置管理 |
| **StageScript** | 剧本创作与分镜生成 |
| **StageAssets** | 角色/场景/道具资产管理 |
| **StageDirector** | 镜头编辑与视频生成 |
| **StagePrompts** | 提示词编辑与管理 |
| **StageExport** | 渲染与导出 |

---

## 3. 阶段功能详解

### 3.1 StageScript - 剧本与分镜

**功能**: 输入故事大纲，AI 自动拆解为标准剧本结构，生成视觉提示词。

**核心功能**:
1. **剧本输入**
   - 支持输入小说/故事大纲
   - 支持设定目标时长 (30s 预告片、3min 短剧等)
   - 支持选择类型 (genre) 和视觉风格 (visual style)

2. **AI 剧本拆解**
   - 自动解析出场次、时间、气氛的标准剧本结构
   - 自动提取角色信息 (姓名、性别、年龄、性格)
   - 自动生成场次描述 (location, time, atmosphere)

3. **视觉提示词生成**
   - 自动将文字描述转化为 Midjourney/Stable Diffusion 提示词
   - 生成全局美术指导文档 (ArtDirection) 统一风格
   - 批量生成角色和场景的视觉提示词

4. **手动编辑**
   - 编辑角色视觉描述和分镜画面提示词
   - 编辑每个分镜的角色列表
   - 编辑分镜的动作描述和台词

**关键数据结构**:
```typescript
ScriptData {
  title: string
  genre: string
  logline: string
  targetDuration?: string
  language?: string
  visualStyle?: string  // live-action, anime, 3d-animation
  artDirection?: ArtDirection
  characters: Character[]
  scenes: Scene[]
  props: Prop[]
  storyParagraphs: { id, text, sceneRefId }[]
}

Shot {
  id: string
  sceneId: string
  actionSummary: string
  dialogue?: string
  cameraMovement: string
  shotSize?: string
  characters: string[]  // Character IDs
  characterVariations?: { [characterId: string]: string }
  props?: string[]
  keyframes: Keyframe[]
  interval?: VideoInterval
  videoModel?: string
  nineGrid?: NineGridData
}
```

---

### 3.2 StageAssets - 资产与选角

**功能**: 管理角色、场景、道具的视觉资产，生成参考图。

**核心功能**:

1. **角色资产 (Character)**
   - 生成角色定妆照 (Reference Image)
   - 衣橱系统 (Wardrobe) - 多套造型管理
     - 添加变体 (Casual, Tactical Gear, Injured 等)
     - 每套变体有独立的 visualPrompt 和 referenceImage
   - 九宫格造型设计 (Turnaround)
     - 9个视角面板 (正面、侧面、背面、3/4 侧等)
     - 多视角参考图用于镜头生成时的角色一致性

2. **场景资产 (Scene)**
   - 生成场景概念图
   - 确保同一场景下不同镜头光影统一

3. **道具资产 (Prop)**
   - 管理需要在多个镜头中重复出现的物品
   - 如星图、武器、地图、信件等
   - 保持物品视觉一致性

4. **资产库 (Asset Library)**
   - 跨项目复用角色/场景/道具
   - 支持导入导出

**关键数据结构**:
```typescript
Character {
  id: string
  name: string
  gender: string
  age: string
  personality: string
  visualPrompt?: string
  negativePrompt?: string
  coreFeatures?: string
  referenceImage?: string  // base64
  turnaround?: CharacterTurnaroundData
  variations: CharacterVariation[]
  status: 'pending' | 'generating' | 'completed' | 'failed'
}

CharacterVariation {
  id: string
  name: string  // "Casual", "Tactical Gear", "Injured"
  visualPrompt: string
  referenceImage?: string
  status?: 'pending' | 'generating' | 'completed' | 'failed'
}

CharacterTurnaroundData {
  panels: CharacterTurnaroundPanel[]  // 9个面板
  imageUrl?: string
  status: 'pending' | 'generating_panels' | 'panels_ready' | 
          'generating_image' | 'completed' | 'failed'
}

Scene {
  id: string
  location: string
  time: string
  atmosphere: string
  visualPrompt?: string
  referenceImage?: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
}

Prop {
  id: string
  name: string
  category: string  // 武器、文件、食物、交通工具等
  description: string
  visualPrompt?: string
  referenceImage?: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
}
```

---

### 3.3 StageDirector - 导演工作台

**功能**: 网格化分镜表管理，精准控制镜头生成。

**核心功能**:

1. **分镜网格视图**
   - 全景式管理所有镜头 (Shots)
   - 按场景分组展示
   - 快速预览每个镜头的状态

2. **关键帧编辑**
   - **Start Frame (首帧)**: 镜头起始画面 (强一致性)
   - **End Frame (尾帧)**: 镜头结束状态 (可选)
   - 支持生成/上传首帧图片

3. **九宫格分镜预览**
   - 一键拆分同一镜头的 9 个视角
   - 先确认描述再生成九宫格图
   - 支持"整图用作首帧"或"裁剪单格用作首帧"

4. **上下文感知**
   - AI 生成镜头时自动读取当前场景图和角色服装图
   - 解决"不连戏"问题

5. **视频生成**
   - 支持单图 Image-to-Video
   - 支持首尾帧 Keyframe Interpolation
   - 支持多种视频模型:
     - Veo 系列 (veo_3_1_i2v_s_fast_fl_landscape/portrait)
     - Sora-2

**关键数据结构**:
```typescript
Keyframe {
  id: string
  type: 'start' | 'end'
  visualPrompt: string
  imageUrl?: string  // base64
  status: 'pending' | 'generating' | 'completed' | 'failed'
}

VideoInterval {
  id: string
  startKeyframeId: string
  endKeyframeId: string
  duration: number
  motionStrength: number
  videoUrl?: string  // base64
  videoPrompt?: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
}

NineGridData {
  panels: NineGridPanel[]  // 9个面板
  imageUrl?: string
  status: 'pending' | 'generating_panels' | 'panels_ready' | 
          'generating_image' | 'completed' | 'failed'
}
```

---

### 3.4 StagePrompts - 提示词管理

**功能**: 集中管理所有提示词，便于优化和复用。

**核心功能**:
1. 按类型分组展示 (角色、场景、道具、关键帧)
2. 提示词编辑和优化
3. 提示词版本历史

---

### 3.5 StageExport - 成片导出

**功能**: 渲染追踪、视频预览与导出。

**核心功能**:

1. **时间轴预览**
   - 可视化时间轴形式预览片段
   - 拖拽调整片段顺序

2. **渲染追踪**
   - 实时监控 API 渲染进度
   - 显示渲染日志 (Render Logs)

3. **资产导出**
   - 导出所有高清关键帧 (PNG)
   - 导出 MP4 片段
   - 支持导出完整项目包 (ZIP)

**关键数据结构**:
```typescript
RenderLog {
  id: string
  timestamp: number
  type: 'character' | 'character-variation' | 'scene' | 'prop' | 
        'keyframe' | 'video' | 'script-parsing'
  resourceId: string
  resourceName: string
  status: 'success' | 'failed'
  model: string
  prompt?: string
  error?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  duration?: number
}
```

---

## 4. AI 模型配置

### 4.1 支持的模型类型

| 类型 | 模型示例 | 用途 |
|------|----------|------|
| **文本模型** | gpt-5.1, gpt-5.2, Claude 3.5 Sonnet | 剧本分析、提示词生成 |
| **视觉模型** | gemini-3-pro-image-preview, Nano Banana Pro | 图片生成 |
| **视频模型** | sora-2, veo_3_1_i2v_s_fast_fl | 视频生成 |

### 4.2 配置结构

```typescript
ModelProvider {
  id: string
  name: string
  baseUrl: string
  apiKey?: string
  isDefault?: boolean
  isBuiltIn?: boolean
}

ModelConfig {
  chatModel: ChatModelConfig
  imageModel: ImageModelConfig
  videoModel: VideoModelConfig
}
```

---

## 5. 数据存储

### 5.1 本地存储 (IndexedDB)

- **hybridStorageService**: 混合存储服务
- **storageService**: 基础存储抽象
- 数据存储在浏览器本地 IndexedDB

### 5.2 云端 (Supabase)

- **Edge Functions**:
  - `generate-video`: 视频生成
  - `get-video-status`: 获取视频生成状态
  - `webhook-video-complete`: 视频生成完成回调
- **Auth**: 用户认证
- **Storage**: 资产文件存储

---

## 6. 状态管理

### 6.1 全局状态 (Zustand)

```typescript
ProjectState {
  id: string
  title: string
  createdAt: number
  lastModified: number
  version: number
  stage: 'script' | 'assets' | 'director' | 'export' | 'prompts'
  
  // Script Phase
  rawScript: string
  targetDuration: string
  language: string
  visualStyle: string
  shotGenerationModel: string
  scriptData: ScriptData | null
  shots: Shot[]
  isParsingScript: boolean
  renderLogs: RenderLog[]
}
```

### 6.2 Auth 状态

```typescript
authStore {
  user: User | null
  loading: boolean
  initialize: () => void
}
```

---

## 7. API 服务

### 7.1 AI 服务层

| 服务文件 | 功能 |
|----------|------|
| `aiService.ts` | AI 统一入口 |
| `scriptService.ts` | 剧本解析与分镜生成 |
| `visualService.ts` | 视觉提示词生成 |
| `shotService.ts` | 镜头生成 |
| `videoService.ts` | 视频生成 |
| `modelService.ts` | 模型调用封装 |
| `modelConfigService.ts` | 模型配置管理 |
| `modelRegistry.ts` | 模型注册表 |

### 7.2 API 适配器

| 适配器 | 功能 |
|--------|------|
| `imageAdapter.ts` | 图片生成适配 |
| `videoAdapter.ts` | 视频生成适配 |
| `chatAdapter.ts` | 对话模型适配 |

---

## 8. 组件结构

### 8.1 核心组件

```
components/
├── Sidebar.tsx              # 侧边栏导航
├── Dashboard.tsx            # 项目列表
├── GlobalAlert.tsx          # 全局提示框
├── ModelSelector.tsx        # 模型选择器
├── AspectRatioSelector.tsx # 画面比例选择器
│
├── Onboarding/              # 引导流程
│   ├── index.tsx
│   ├── WelcomePage.tsx
│   ├── WorkflowPage.tsx
│   ├── ActionPage.tsx
│   ├── ApiKeyPage.tsx
│   └── ProgressDots.tsx
│
├── ModelConfig/             # 模型配置
│   ├── index.tsx
│   ├── ModelList.tsx
│   ├── ModelCard.tsx
│   └── AddModelForm.tsx
│
├── StageScript/            # 剧本阶段
│   ├── index.tsx
│   ├── ScriptEditor.tsx
│   ├── SceneList.tsx
│   ├── CharacterList.tsx
│   ├── SceneBreakdown.tsx
│   ├── ShotRow.tsx
│   ├── ConfigPanel.tsx
│   └── InlineEditor.tsx
│
├── StageAssets/            # 资产阶段
│   ├── index.tsx
│   ├── CharacterCard.tsx
│   ├── SceneCard.tsx
│   ├── PropCard.tsx
│   ├── TurnaroundModal.tsx
│   ├── WardrobeModal.tsx
│   └── ImagePreviewModal.tsx
│
├── StageDirector/          # 导演阶段
│   ├── index.tsx
│   ├── ShotWorkbench.tsx
│   ├── ShotCard.tsx
│   ├── KeyframeEditor.tsx
│   ├── NineGridPreview.tsx
│   ├── EditModal.tsx
│   └── ImagePreviewModal.tsx
│
├── StagePrompts/           # 提示词管理
│   ├── index.tsx
│   ├── CharacterSection.tsx
│   ├── SceneSection.tsx
│   ├── KeyframeSection.tsx
│   ├── PromptEditor.tsx
│   └── CollapsibleSection.tsx
│
└── StageExport/            # 导出阶段
    ├── index.tsx
    ├── TimelineVisualizer.tsx
    ├── StatusPanel.tsx
    ├── RenderLogsModal.tsx
    └── VideoPlayerModal.tsx
```

---

## 9. 用户交互流程

### 9.1 新建项目流程

1. 点击"新建项目" → 进入 Onboarding
2. 配置 API Key (AntSK)
3. 选择工作流 (从脚本开始 / 使用示例)
4. 进入 StageScript

### 9.2 完整创作流程

```
1. StageScript
   └── 输入故事 → AI解析生成 剧本 → 生成视觉提示词
        ↓
2. StageAssets
   └── 生成角色定妆照 → 生成场景概念图 → 管理道具
        ↓
3. StageDirector
   └── 编辑分镜 → 生成首帧/尾帧 → 生成视频
        ↓
4. StageExport
   └── 预览时间轴 → 导出关键帧/视频
```

---

## 10. 配置项

### 10.1 视觉风格 (Visual Style)

- `anime` - 动漫
- `live-action` - 实拍
- `3d-animation` - 3D动画
- `2d-animation` - 2D动画

### 10.2 画面比例 (Aspect Ratio)

- `16:9` - 横屏 (默认)
- `9:16` - 竖屏
- `1:1` - 方形

### 10.3 视频时长 (Video Duration)

- 4秒
- 8秒
- 12秒

---

## 11. 错误处理

### 11.1 API Key 缺失
- 自动弹出 ModelConfig 面板
- 提示用户配置 API Key

### 11.2 生成任务中断
- 切换页面时弹出警告
- 确认是否中断生成任务

### 11.3 渲染失败
- 记录 RenderLog
- 显示错误信息
- 支持重试

---

## 12. 后续开发建议

1. **云端同步**: 实现多设备同步项目
2. **团队协作**: 支持多人协作编辑
3. **更多模板**: 增加预设剧本模板
4. **批量操作**: 批量生成/导出功能
5. **AI 优化**: 基于历史数据优化提示词
