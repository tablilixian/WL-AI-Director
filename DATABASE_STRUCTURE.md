# WL-AI-Director 本地数据库 (WLDB) 数据结构说明文档

## 📋 概述

WL-AI-Director 使用 **IndexedDB** 作为本地数据库，数据库名称为 `WLDB`，当前版本为 `6`。

本数据库用于存储项目的所有本地数据，包括项目信息、资产库、图片、视频等。

---

## 🗂️ 数据表列表

### 1. **projects** (项目数据表)

**用途**: 存储所有项目的基本信息和完整状态

**主键**: `id` (字符串)

**数据结构**:
```typescript
interface ProjectState {
  id: string;                    // 项目唯一标识符
  title: string;                 // 项目标题
  createdAt: number;             // 创建时间戳
  lastModified: number;           // 最后修改时间戳
  version: number;                // 数据版本号，用于并发控制和冲突检测
  stage: 'script' | 'assets' | 'director' | 'export' | 'prompts';  // 当前阶段
  
  // 剧本阶段数据
  rawScript: string;             // 原始剧本文本
  targetDuration: string;         // 目标时长
  language: string;               // 语言
  visualStyle: string;            // 视觉风格：live-action, anime, 3d-animation 等
  shotGenerationModel: string;     // 分镜生成使用的模型
  scriptData: ScriptData | null;  // 解析后的剧本数据
  shots: Shot[];                // 镜头列表
  isParsingScript: boolean;       // 是否正在解析剧本
  renderLogs: RenderLog[];       // 渲染日志历史
}
```

**ScriptData 结构**:
```typescript
interface ScriptData {
  title: string;
  genre: string;
  logline: string;
  targetDuration?: string;
  language?: string;
  visualStyle?: string;
  shotGenerationModel?: string;
  artDirection?: ArtDirection;     // 全局美术指导文档
  characters: Character[];         // 角色列表
  scenes: Scene[];               // 场景列表
  props: Prop[];                 // 道具列表
  storyParagraphs: { id: number; text: string; sceneRefId: string }[];
}
```

**Shot 结构**:
```typescript
interface Shot {
  id: string;
  sceneId: string;
  actionSummary: string;
  dialogue?: string;
  cameraMovement: string;
  shotSize?: string;
  characters: string[];              // 角色ID数组
  characterVariations?: { [characterId: string]: string };  // 角色变体映射
  props?: string[];                  // 道具ID数组
  keyframes: Keyframe[];            // 关键帧列表
  interval?: VideoInterval;            // 视频间隔数据
  videoModel?: string;               // 视频生成模型
  nineGrid?: NineGridData;          // 九宫格分镜预览（可选）
}
```

**Keyframe 结构**:
```typescript
interface Keyframe {
  id: string;
  type: 'start' | 'end';
  visualPrompt: string;
  imageUrl?: string;                // 关键帧图像（base64格式）
  status: 'pending' | 'generating' | 'completed' | 'failed';
}
```

**VideoInterval 结构**:
```typescript
interface VideoInterval {
  id: string;
  startKeyframeId: string;
  endKeyframeId: string;
  duration: number;               // 持续时间（秒）
  motionStrength: number;
  videoUrl?: string;              // 视频数据（base64格式）
  videoPrompt?: string;           // 视频生成提示词
  status: 'pending' | 'generating' | 'completed' | 'failed';
}
```

**RenderLog 结构**:
```typescript
interface RenderLog {
  id: string;
  timestamp: number;             // API调用时间戳
  type: 'character' | 'character-variation' | 'scene' | 'prop' | 'keyframe' | 'video' | 'script-parsing';
  resourceId: string;            // 正在生成的资源ID
  resourceName: string;          // 人类可读的资源名称
  status: 'success' | 'failed';
  model: string;                 // 使用的模型
  prompt?: string;              // 提示词（用于调试）
  error?: string;                // 错误信息（如果失败）
  inputTokens?: number;          // 输入token消耗
  outputTokens?: number;         // 输出token生成
  totalTokens?: number;          // 总token数
  duration?: number;             // 耗时（毫秒）
}
```

---

### 2. **assetLibrary** (资产库数据表)

**用途**: 存储可复用的角色、场景、道具和角色变体

**主键**: `id` (字符串)

**数据结构**:
```typescript
interface AssetLibraryItem {
  id: string;
  type: 'character' | 'scene' | 'prop' | 'turnaround';  // 资产类型
  name: string;
  projectId?: string;            // 关联的项目ID
  projectName?: string;          // 关联的项目名称
  createdAt: number;
  updatedAt: number;
  data: Character | Scene | Prop;  // 具体的资产数据
}
```

**Character 结构**:
```typescript
interface Character {
  id: string;
  name: string;
  gender: string;
  age: string;
  personality: string;
  visualPrompt?: string;
  negativePrompt?: string;       // 负面提示词
  coreFeatures?: string;         // 核心固定特征
  referenceImage?: string;       // 参考图（Supabase URL 或 base64）
  referenceImageSource?: 'local' | 'cloud';  // 图片来源
  localImageId?: string;        // 本地图片ID
  turnaround?: CharacterTurnaroundData;  // 九宫格造型设计
  variations: CharacterVariation[];  // 变体列表
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}
```

**CharacterVariation 结构**:
```typescript
interface CharacterVariation {
  id: string;
  name: string;                 // 变体名称，如 "Casual", "Tactical Gear"
  visualPrompt: string;
  negativePrompt?: string;
  referenceImage?: string;
  referenceImageSource?: 'local' | 'cloud';
  localImageId?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}
```

**CharacterTurnaroundData 结构**:
```typescript
interface CharacterTurnaroundData {
  panels: CharacterTurnaroundPanel[];  // 9个视角面板
  imageUrl?: string;                   // 九宫格整图（base64）
  imageUrlSource?: 'local' | 'cloud';
  localImageId?: string;
  prompt?: string;
  status: 'pending' | 'generating_panels' | 'panels_ready' | 'generating_image' | 'completed' | 'failed';
}
```

**Scene 结构**:
```typescript
interface Scene {
  id: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  negativePrompt?: string;
  referenceImage?: string;
  referenceImageSource?: 'local' | 'cloud';
  localImageId?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}
```

**Prop 结构**:
```typescript
interface Prop {
  id: string;
  name: string;
  category: string;             // 分类：武器、文件、书信、食物、饮品等
  description: string;
  visualPrompt?: string;
  negativePrompt?: string;
  referenceImage?: string;
  referenceImageSource?: 'local' | 'cloud';
  localImageId?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed';
}
```

---

### 3. **images** (图片存储表)

**用途**: 存储所有本地图片的二进制数据

**主键**: `id` (字符串)

**索引**: `createdAt` (非唯一)

**数据结构**:
```typescript
interface LocalImage {
  id: string;          // 图片唯一标识符
  blob: Blob;          // 实际的图片二进制数据
  createdAt: number;    // 创建时间戳
  type: string;         // MIME类型，如 'image/jpeg', 'image/png'
  size: number;         // 文件大小（字节）
}
```

**图片来源**:
- 角色参考图 (`local:{imageId}`)
- 场景参考图 (`local:{imageId}`)
- 道具参考图 (`local:{imageId}`)
- 角色变体图 (`local:{imageId}`)
- 关键帧图片 (`local:{imageId}`)
- 九宫格图片 (`local:{imageId}`)

---

### 4. **videos** (视频存储表)

**用途**: 存储所有本地视频的二进制数据

**主键**: `id` (字符串)

**索引**: `createdAt` (非唯一)

**数据结构**:
```typescript
interface LocalVideo {
  id: string;          // 视频唯一标识符
  blob: Blob;          // 实际的视频二进制数据
  createdAt: number;    // 创建时间戳
  type: string;         // MIME类型，如 'video/mp4'
  size: number;         // 文件大小（字节）
}
```

**视频来源**:
- 镜头视频片段 (`local:{videoId}`)
- 角色九宫格视频（如果有）

---

### 5. **projectStages** (项目阶段表)

**用途**: 存储项目的阶段状态，避免频繁云端同步

**主键**: `projectId` (字符串)

**数据结构**:
```typescript
interface ProjectStage {
  projectId: string;     // 关联的项目ID
  stage: string;         // 阶段：'script' | 'assets' | 'director' | 'export' | 'prompts'
  updatedAt: number;     // 更新时间戳
}
```

**阶段说明**:
- `script`: 剧本编写阶段
- `assets`: 资产创建阶段
- `director`: 分镜导演阶段
- `export`: 导出阶段
- `prompts`: 提示词生成阶段

---

### 6. **资产** (额外资产表)

**用途**: 可能是额外的资产存储表

**注意**: 此表的具体结构和用途需要进一步确认

---

## 🔗 数据关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                     WLDB (Version 6)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  │   projects    │  │ assetLibrary │  │ projectStages │
│  │              │  │              │  │              │
│  │ - ProjectState│  │ - AssetLib...│  │ - ProjectStage│
│  │   - ScriptData│  │   - Character│  │              │
│  │   - Shot[]   │  │   - Scene    │  └──────────────┘
│  │   - Keyframe │  │   - Prop      │
│  │   - Video... │  │   - Variation│
│  └──────────────┘  └──────────────┘
│         │                 │
│         └─────────────────┘
│                   │
│                   ▼
│         ┌──────────────────┐
│         │     images      │
│         │  - LocalImage  │
│         └──────────────────┘
│                   │
│                   ▼
│         ┌──────────────────┐
│         │     videos      │
│         │  - LocalVideo  │
│         └──────────────────┘
│                                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 💾 数据存储策略

### 图片存储
- **本地存储**: IndexedDB `images` 表
- **云端存储**: Supabase Storage
- **引用方式**: 
  - 本地: `local:{imageId}`
  - 云端: Supabase Storage URL

### 视频存储
- **本地存储**: IndexedDB `videos` 表
- **云端存储**: Supabase Storage
- **引用方式**:
  - 本地: `local:{videoId}`
  - 云端: Supabase Storage URL

---

## 🔄 数据同步策略

### 本地优先
- 所有图片和视频优先存储在本地 IndexedDB
- 提供离线访问能力
- 避免云端 URL 过期问题

### 云端备份
- 项目数据同步到 Supabase
- 资产库同步到 Supabase
- 支持多设备访问

### 阶段隔离
- `projectStages` 表避免频繁云端同步
- 仅在阶段变更时同步

---

## 🛠️ 数据库操作

### 导出功能
- **JSON 格式**: 导出数据结构（不含实际文件）
- **ZIP 格式**: 导出完整数据（包含所有图片和视频文件）

### 清空功能
- **安全清空**: 仅清空项目相关数据表
- **受保护的表**: 不会清空其他应用数据
- **清空范围**:
  - ✅ `projects`
  - ✅ `assetLibrary`
  - ✅ `images`
  - ✅ `videos`
  - ✅ `projectStages`
  - ⏭️ 其他表（自动跳过）

---

## 📊 数据统计

通过数据库调试工具可以查看：
- 项目数量
- 资产数量（角色、场景、道具、变体）
- 图片数量
- 视频数量
- 项目阶段数量

---

## 🔧 维护建议

### 定期清理
- 删除已完成的项目
- 清理未使用的资产
- 清理过期的图片和视频

### 数据备份
- 定期导出 ZIP 格式备份
- 保留重要项目的完整数据

### 性能优化
- 监控数据库大小
- 清理重复数据
- 优化索引使用

---

## 📝 版本历史

- **当前版本**: 6
- **数据库名称**: WLDB
- **迁移服务**: `dbMigrationService.ts`
- **兼容性**: 支持从旧版本自动迁移

---

*最后更新: 2026-03-11*
