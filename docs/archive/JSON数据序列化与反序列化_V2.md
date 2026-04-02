# WL AI Director JSON 数据序列化与反序列化文档 (V2 - 基于真实项目)

本文档详细说明了项目中各个 JSON 数据的格式、序列化/反序列化方式及相关代码。
基于真实项目 `wl_backup_2026-03-27T09-33-15-119Z.json` 导出文件分析。

---

## 目录

1. [WLDB 顶层结构](#1-wldb-顶层结构)
2. [ProjectState 项目状态](#2-projectstate-项目状态)
3. [ScriptData 剧本数据](#3-scriptdata-剧本数据)
4. [Character 角色数据](#4-character-角色数据)
5. [Scene 场景数据](#5-scene-场景数据)
6. [Prop 道具数据](#6-prop-道具数据)
7. [Shot 分镜数据](#7-shot-分镜数据)
8. [AssetLibrary 资产库](#8-assetlibrary-资产库)
9. [数据存储格式](#9-数据存储格式)
10. [RenderLog 渲染日志](#10-renderlog-渲染日志)
11. [相关文件索引](#11-相关文件索引)

---

## 1. WLDB 顶层结构

### 1.1 JSON 示例

```json
{
  "schemaVersion": 1,
  "exportedAt": 1774603995117,
  "scope": "all",
  "dbName": "WLDB",
  "dbVersion": 7,
  "stores": {
    "projects": [...],
    "assetLibrary": [...]
  }
}
```

### 1.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaVersion` | `number` | 数据模式版本 (当前为 1) |
| `exportedAt` | `number` | 导出时间戳 (Unix milliseconds) |
| `scope` | `string` | 导出范围 (`all` = 全部数据) |
| `dbName` | `string` | 数据库名称 (`WLDB`) |
| `dbVersion` | `number` | 数据库版本 (当前为 7) |
| `stores` | `object` | 存储对象，包含 projects 和 assetLibrary |

---

## 2. ProjectState 项目状态

### 2.1 存储位置

- **IndexedDB**: `WLDB.projects` store
- **内存**: `ProjectState` 接口

### 2.2 JSON 示例

```json
{
  "id": "4e5c9b34-e9dd-4158-b035-dfaa3a2cda92",
  "title": "田忌赛马",
  "createdAt": 1773282937853,
  "lastModified": 1773295645554,
  "version": 9,
  "stage": "export",
  "targetDuration": "60s",
  "language": "中文",
  "visualStyle": "live-action",
  "shotGenerationModel": "gpt-5.1",
  "rawScript": "**标题：田忌赛马**\n\n**人物：**\n- 田忌：齐国大将...",
  "scriptData": {...},
  "shots": [...],
  "isParsingScript": false,
  "renderLogs": [...]
}
```

### 2.3 字段说明

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `id` | `string` | 项目唯一 ID (UUID) | ✅ |
| `title` | `string` | 项目标题 | ✅ |
| `createdAt` | `number` | 创建时间戳 (Unix ms) | ✅ |
| `lastModified` | `number` | 最后修改时间戳 | ✅ |
| `version` | `number` | 数据版本号 | ✅ |
| `stage` | `string` | 当前阶段 | ✅ |
| `targetDuration` | `string` | 目标时长 | ✅ |
| `language` | `string` | 语言 | ✅ |
| `visualStyle` | `string` | 视觉风格 | ✅ |
| `shotGenerationModel` | `string` | 分镜生成模型 | ✅ |
| `rawScript` | `string` | 原始剧本 (Markdown格式) | ✅ |
| `scriptData` | `ScriptData` | 剧本数据对象 | ❌ |
| `shots` | `Shot[]` | 分镜数组 | ❌ |
| `isParsingScript` | `boolean` | 是否正在解析剧本 | ✅ |
| `renderLogs` | `RenderLog[]` | 渲染日志数组 | ❌ |

### 2.4 Stage 可选值

```
script | assets | director | export | prompts | canvas
```

---

## 3. ScriptData 剧本数据

### 3.1 JSON 示例

```json
{
  "title": "田忌赛马",
  "genre": "历史剧",
  "logline": "",
  "language": "中文",
  "artDirection": {
    "colorPalette": {
      "primary": "深赭石色与青铜色为主...",
      "secondary": "青瓷绿与靛蓝色...",
      "accent": "朱红色与金色...",
      "skinTones": "温暖的象牙色到浅棕色...",
      "saturation": "中等饱和度...",
      "temperature": "温暖色调为主..."
    },
    "characterDesignRules": {
      "proportions": "7.5头身比例...",
      "eyeStyle": "大而富有表现力的眼睛...",
      "lineWeight": "清晰流畅的线条...",
      "detailLevel": "高细节处理..."
    },
    "lightingStyle": "三点式电影照明...",
    "textureStyle": "平滑的卡通渲染风格...",
    "moodKeywords": ["历史感", "戏剧性", "东方美学"],
    "consistencyAnchors": "高质量2D动画风格..."
  },
  "characters": [...],
  "scenes": [...],
  "props": [],
  "storyParagraphs": [...],
  "targetDuration": "120s",
  "visualStyle": "2d-animation",
  "shotGenerationModel": "glm-4-plus"
}
```

### 3.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 剧本标题 |
| `genre` | `string` | 剧本类型/题材 |
| `logline` | `string` | 一句话剧情摘要 |
| `language` | `string` | 语言 |
| `artDirection` | `ArtDirection` | 全局美术指导 |
| `characters` | `Character[]` | 角色列表 |
| `scenes` | `Scene[]` | 场景列表 |
| `props` | `Prop[]` | 道具列表 |
| `storyParagraphs` | `StoryParagraph[]` | 故事段落列表 |
| `targetDuration` | `string` | 目标时长 |
| `visualStyle` | `string` | 视觉风格 |
| `shotGenerationModel` | `string` | 分镜生成模型 |

---

## 4. Character 角色数据

### 4.1 JSON 示例

```json
{
  "id": "1",
  "name": "田忌",
  "gender": "男",
  "age": "成年",
  "personality": "性格耿直但屡屡受挫，后来变得坚定有策略",
  "variations": [],
  "visualPrompt": "一位中年男性角色，7.5头身比例...",
  "negativePrompt": "避免过于夸张的表情...",
  "status": "completed",
  "imageUrl": "local:img_1773285561503_omefhsr",
  "turnaround": {
    "panels": [...],
    "imageUrl": "local:img_1773386819874_d2stjyg",
    "status": "completed"
  }
}
```

### 4.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 角色 ID |
| `name` | `string` | 角色名称 |
| `gender` | `string` | 性别 |
| `age` | `string` | 年龄 |
| `personality` | `string` | 性格描述 |
| `variations` | `CharacterVariation[]` | 角色变体列表 |
| `visualPrompt` | `string` | 视觉提示词 |
| `negativePrompt` | `string` | 负面提示词 |
| `status` | `string` | 状态 |
| `imageUrl` | `string` | 角色参考图 (格式: `local:img_xxx` 或 `https://xxx` 或 `data:image/...`) |
| `turnaround` | `CharacterTurnaroundData` | 角色九宫格数据 |

### 4.3 CharacterVariation 角色变体

```json
{
  "id": "var-casual",
  "name": "日常装",
  "visualPrompt": "穿日常服装...",
  "imageUrl": "data:image/png;base64,...",
  "status": "completed"
}
```

### 4.4 CharacterTurnaroundPanel 九宫格面板

```json
{
  "index": 0,
  "viewAngle": "正面",
  "shotSize": "全身",
  "description": "正面全身描述..."
}
```

---

## 5. Scene 场景数据

### 5.1 JSON 示例

```json
{
  "id": "scene1",
  "location": "齐国赛马场",
  "time": "白天",
  "atmosphere": "尘土飞扬，人声鼎沸...",
  "visualPrompt": "齐国赛马场，白天...",
  "negativePrompt": "避免现代元素...",
  "status": "completed",
  "imageUrl": "local:img_1773286186269_yyniqe4"
}
```

### 5.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 场景 ID |
| `location` | `string` | 地点 |
| `time` | `string` | 时间 |
| `atmosphere` | `string` | 氛围描述 |
| `visualPrompt` | `string` | 视觉提示词 |
| `negativePrompt` | `string` | 负面提示词 |
| `status` | `string` | 状态 |
| `imageUrl` | `string` | 场景参考图 (格式: `local:img_xxx` 或 `https://xxx` 或 `data:image/...`) |

---

## 6. Prop 道具数据

### 6.1 JSON 示例

```json
{
  "id": "prop1",
  "name": "赛马",
  "category": "动物",
  "description": "一匹骏马，毛色为深棕色...",
  "visualPrompt": "一匹骏马，毛色为深棕色...",
  "negativePrompt": "避免现代元素...",
  "status": "completed",
  "imageUrl": "local:img_1773286186269_yyniqe4"
}
```

### 6.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 道具 ID |
| `name` | `string` | 道具名称 |
| `category` | `string` | 道具类别 |
| `description` | `string` | 道具描述 |
| `visualPrompt` | `string` | 视觉提示词 |
| `negativePrompt` | `string` | 负面提示词 |
| `status` | `string` | 状态 |
| `imageUrl` | `string` | 道具参考图 (格式: `local:img_xxx` 或 `https://xxx` 或 `data:image/...`) |

---

## 7. Shot 分镜数据

### 7.1 JSON 示例

```json
{
  "id": "shot-1",
  "sceneId": "scene1",
  "actionSummary": "田忌的骏马与齐威王的马匹并排站立...",
  "dialogue": "",
  "cameraMovement": "Horizontal Right Shot",
  "shotSize": "Wide Shot",
  "characters": ["田忌", "齐威王", "骑士"],
  "keyframes": [
    {
      "id": "kf-1-start",
      "type": "start",
      "visualPrompt": "赛马场全景...",
      "imageUrl": "local:img_1773287469529_otc64yb",
      "status": "completed"
    }
  ],
  "videoModel": "cogvideox-flash",
  "interval": {
    "id": "int-shot-1-1773287733855",
    "startKeyframeId": "kf-1-start",
    "endKeyframeId": "kf-1-end",
    "duration": 5,
    "motionStrength": 5,
    "videoPrompt": "田忌的骏马与齐威王的马匹并排站立...",
    "status": "completed",
    "videoUrl": "video:vid_1773288693620_8cc5wrs"
  }
}
```

### 8.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 分镜 ID |
| `sceneId` | `string` | 关联场景 ID |
| `actionSummary` | `string` | 动作摘要 |
| `dialogue` | `string` | 对话内容 |
| `cameraMovement` | `string` | 镜头运动 |
| `shotSize` | `string` | 景别 |
| `characters` | `string[]` | 出现的角色名称数组 |
| `characterVariations` | `object` | 角色变体映射 |
| `props` | `string[]` | 使用的道具 ID 数组 |
| `keyframes` | `Keyframe[]` | 关键帧数组 |
| `videoModel` | `string` | 视频生成模型 |
| `interval` | `VideoInterval` | 视频插值数据 |
| `nineGrid` | `NineGridData` | 九宫格预览数据 |

### 7.3 Keyframe 关键帧

```json
{
  "id": "kf-1-start",
  "type": "start",
  "visualPrompt": "赛马场全景，深赭石色与青铜色为主...",
  "imageUrl": "local:img_1773287469529_otc64yb",
  "status": "completed"
}
```

### 7.4 VideoInterval 视频插值

```json
{
  "id": "int-shot-1-1773287733855",
  "startKeyframeId": "kf-1-start",
  "endKeyframeId": "kf-1-end",
  "duration": 5,
  "motionStrength": 5,
  "videoPrompt": "田忌的骏马与齐威王的马匹并排站立...",
  "status": "completed",
  "videoUrl": "video:vid_1773288693620_8cc5wrs"
}
```

### 7.5 NineGridData 九宫格预览

```json
{
  "panels": [
    {
      "index": 0,
      "shotSize": "远景",
      "cameraAngle": "俯拍",
      "description": "建立全景..."
    }
  ],
  "imageUrl": "local:img_1773308502891_sl2ox9r",
  "prompt": "九宫格分镜描述...",
  "status": "completed"
}
```

---

## 8. AssetLibrary 资产库

### 8.1 JSON 示例

```json
{
  "id": "09967d9d-c28f-467e-9233-ab98a03f8831",
  "type": "character",
  "name": "田忌",
  "projectId": "e83bc53b-f050-4f85-93a8-e083961ec8dd",
  "projectName": "田忌赛马2",
  "createdAt": 1773308363516,
  "updatedAt": 1773308363516,
  "data": {
    "id": "char1",
    "name": "田忌",
    ...
  }
}
```

### 7.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 资产唯一 ID |
| `type` | `string` | 资产类型 (`character`/`scene`/`prop`) |
| `name` | `string` | 资产名称 |
| `projectId` | `string` | 所属项目 ID |
| `projectName` | `string` | 所属项目名称 |
| `createdAt` | `number` | 创建时间戳 |
| `updatedAt` | `number` | 更新时间戳 |
| `data` | `Character\|Scene\|Prop` | 资产数据 |

---

## 9. 数据存储格式

### 9.1 图片/视频引用格式

| 格式 | 说明 | 示例 |
|------|------|------|
| `local:img_xxx` | IndexedDB 本地图片 | `local:img_1773285561503_omefhsr` |
| `video:vid_xxx` | IndexedDB 视频 | `video:vid_1773288693620_8cc5wrs` |
| `https://xxx.supabase.co/...` | 云端存储图片 | `https://wgmnizpejtuwvcaqsbvy.supabase.co/storage/...` |
| `data:image/...` | Base64 编码图片 | `data:image/png;base64,iVBORw0KGgoAAAANS...` |

### 9.2 序列化代码

**保存项目 (IndexedDB)**:
```typescript
// 项目保存
const projectData = {
  id: project.id,
  title: project.title,
  createdAt: Date.now(),
  lastModified: Date.now(),
  version: 1,
  stage: 'script',
  // ... 其他字段
};
db.transaction('projects', 'readwrite')
  .objectStore('projects')
  .put(projectData);
```

**加载项目**:
```typescript
const tx = db.transaction('projects', 'readonly');
const store = tx.objectStore('projects');
const request = store.get(projectId);
request.onsuccess = () => {
  const project = request.result;
  // 恢复 scriptData.characters 等
};
```

---

## 10. RenderLog 渲染日志

### 10.1 JSON 示例

```json
{
  "type": "keyframe",
  "resourceId": "image-1773285561504",
  "resourceName": "Chinese person, East Asian facial features...",
  "status": "success",
  "model": "cogview-3-flash",
  "prompt": "Chinese person, East Asian facial features...",
  "duration": 15866,
  "id": "log-1773285561504-t9v6ecov7",
  "timestamp": 1773285561504
}
```

### 10.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 资源类型 |
| `resourceId` | `string` | 资源 ID |
| `resourceName` | `string` | 资源名称 |
| `status` | `string` | 状态 (`success`/`failed`) |
| `model` | `string` | 使用的模型 |
| `prompt` | `string` | 使用的提示词 |
| `error` | `string` | 错误信息 (失败时) |
| `duration` | `number` | 耗时 (毫秒) |
| `id` | `string` | 日志 ID |
| `timestamp` | `number` | 时间戳 |

---

## 11. 相关文件索引

| 文件路径 | 用途 |
|---------|------|
| `types.ts` | 项目核心类型定义 (ProjectState, ScriptData, Character 等) |
| `src/types/supabase/index.ts` | Supabase 数据库类型 |
| `src/modules/canvas/types/canvas.ts` | 画布类型定义 |
| `services/imageStorageService.ts` | IndexedDB 图片存储服务 |
| `services/dbConfig.ts` | IndexedDB 配置 (WLDB) |
