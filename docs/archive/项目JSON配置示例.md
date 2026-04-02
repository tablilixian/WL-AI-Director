# 📄 项目 JSON 配置示例

**版本**：v1.0  
**创建日期**：2024-01-15  
**说明**：展示项目数据结构和本地/云端双格式引用

---

## 一、数据结构概览

```
ProjectState
├── id: string
├── title: string
├── createdAt: number
├── lastModified: number
├── version: number
├── stage: 'script' | 'assets' | 'director' | 'export' | 'prompts' | 'canvas'
│
├── rawScript: string
├── targetDuration: string
├── language: string
├── visualStyle: string
├── shotGenerationModel: string
│
├── scriptData: ScriptData
│   ├── title: string
│   ├── genre: string
│   ├── logline: string
│   ├── characters: Character[]
│   ├── scenes: Scene[]
│   ├── props: Prop[]
│   └── storyParagraphs: StoryParagraph[]
│
├── shots: Shot[]
│   ├── id: string
│   ├── sceneId: string
│   ├── characters: string[]
│   ├── keyframes: Keyframe[]
│   └── interval?: VideoInterval
│
└── renderLogs: RenderLog[]
```

---

## 二、完整 JSON 配置示例

```json
{
  "id": "project_1774580930211",
  "title": "赛博朋克短剧",
  "createdAt": 1774580930211,
  "lastModified": 1774581500000,
  "version": 3,
  "stage": "director",

  "rawScript": "在一个赛博朋克城市中，主角小明发现了一个神秘的芯片...",
  "targetDuration": "3min",
  "language": "zh",
  "visualStyle": "cyberpunk",
  "shotGenerationModel": "gpt-5.1",

  "scriptData": {
    "title": "赛博朋克短剧",
    "genre": "科幻",
    "logline": "一个普通程序员意外获得神秘芯片，卷入公司阴谋",
    "targetDuration": "3min",
    "language": "zh",
    "visualStyle": "cyberpunk",
    "shotGenerationModel": "gpt-5.1",

    "artDirection": {
      "colorPalette": {
        "primary": "霓虹蓝紫色",
        "secondary": "暗灰色",
        "accent": "霓虹粉色",
        "skinTones": "冷白色调",
        "saturation": "高饱和度",
        "temperature": "冷色调"
      },
      "characterDesignRules": {
        "proportions": "7头身，修长体型",
        "eyeStyle": "大眼睛，高光强烈",
        "lineWeight": "细线条，干净利落",
        "detailLevel": "高细节，科技感"
      },
      "lightingStyle": "霓虹灯光，强烈明暗对比",
      "textureStyle": "金属质感，光滑表面",
      "moodKeywords": ["赛博朋克", "霓虹", "未来感", "科技", "神秘"],
      "consistencyAnchors": "赛博朋克风格，霓虹灯光，高科技，金属质感，冷色调"
    },

    "characters": [
      {
        "id": "char_001",
        "name": "小明",
        "gender": "男",
        "age": "25",
        "personality": "内向但勇敢",
        "visualPrompt": "亚洲男性，短发，戴眼镜，穿黑色连帽衫，赛博朋克风格",
        "negativePrompt": "秃头，胡须，肥胖",
        "coreFeatures": "短发，眼镜，瘦削脸型",
        
        "referenceImage": "local:img_1774580930211_ka4m7hl",
        "referenceImageSource": "local",
        "localImageId": "img_1774580930211_ka4m7hl",
        
        "turnaround": {
          "panels": [
            {
              "index": 0,
              "viewAngle": "正面",
              "shotSize": "全身",
              "description": "正面全身，站立姿势"
            },
            {
              "index": 1,
              "viewAngle": "左侧面",
              "shotSize": "全身",
              "description": "左侧全身，展示侧面轮廓"
            }
          ],
          "imageUrl": "local:img_1774580930212_turnaround",
          "imageUrlSource": "local",
          "localImageId": "img_1774580930212_turnaround",
          "status": "completed"
        },

        "variations": [
          {
            "id": "var_001",
            "name": "日常装",
            "visualPrompt": "黑色连帽衫，牛仔裤，运动鞋",
            "referenceImage": "local:img_1774580930213_var1",
            "referenceImageSource": "local",
            "localImageId": "img_1774580930213_var1",
            "status": "completed"
          },
          {
            "id": "var_002",
            "name": "战斗装",
            "visualPrompt": "高科技战斗服，发光线条，护目镜",
            "referenceImage": "local:img_1774580930214_var2",
            "referenceImageSource": "local",
            "localImageId": "img_1774580930214_var2",
            "status": "completed"
          }
        ],
        
        "status": "completed"
      },
      {
        "id": "char_002",
        "name": "反派BOSS",
        "gender": "男",
        "age": "45",
        "personality": "冷酷狡诈",
        "visualPrompt": "中年男性，光头，穿西装，戴墨镜，赛博朋克风格",
        "negativePrompt": "年轻，肥胖，邋遢",
        "coreFeatures": "光头，墨镜，西装",
        
        "referenceImage": "https://xxx.supabase.co/storage/v1/object/public/projects/char_002.png",
        "referenceImageSource": "cloud",
        
        "variations": [],
        "status": "completed"
      }
    ],

    "scenes": [
      {
        "id": "scene_001",
        "location": "赛博朋克城市街道",
        "time": "夜晚",
        "atmosphere": "霓虹灯光，雨天",
        "visualPrompt": "赛博朋克城市街道，霓虹灯招牌，下雨，高楼大厦",
        "negativePrompt": "白天，乡村，简陋",
        
        "referenceImage": "local:img_1774580930215_scene1",
        "referenceImageSource": "local",
        "localImageId": "img_1774580930215_scene1",
        
        "status": "completed"
      },
      {
        "id": "scene_002",
        "location": "公司实验室",
        "time": "白天",
        "atmosphere": "高科技，冷色调",
        "visualPrompt": "高科技实验室，白色墙壁，电脑屏幕，实验设备",
        "negativePrompt": "破旧，杂乱，暖色调",
        
        "referenceImage": "https://xxx.supabase.co/storage/v1/object/public/projects/scene_002.png",
        "referenceImageSource": "cloud",
        
        "status": "completed"
      }
    ],

    "props": [
      {
        "id": "prop_001",
        "name": "神秘芯片",
        "category": "科技设备",
        "description": "发光的蓝色芯片，存储重要数据",
        "visualPrompt": "小型蓝色发光芯片，高科技风格",
        "negativePrompt": "老旧，破损",
        
        "referenceImage": "local:img_1774580930216_prop1",
        "referenceImageSource": "local",
        "localImageId": "img_1774580930216_prop1",
        
        "status": "completed"
      }
    ],

    "storyParagraphs": [
      {
        "id": 1,
        "text": "在一个赛博朋克城市中，主角小明发现了一个神秘的芯片...",
        "sceneRefId": "scene_001"
      },
      {
        "id": 2,
        "text": "小明将芯片带回家中，发现里面存储着惊人的秘密...",
        "sceneRefId": "scene_001"
      }
    ]
  },

  "shots": [
    {
      "id": "shot_001",
      "sceneId": "scene_001",
      "actionSummary": "小明在雨中行走，发现地上的芯片",
      "dialogue": "",
      "cameraMovement": "跟随",
      "shotSize": "中景",
      "characters": ["char_001"],
      "characterVariations": {
        "char_001": "var_001"
      },
      "props": ["prop_001"],
      "videoModel": "veo",

      "keyframes": [
        {
          "id": "kf_001_start",
          "type": "start",
          "visualPrompt": "小明在赛博朋克城市街道上行走，中景，跟随镜头",
          "imageUrl": "local:img_1774580930217_kf1_start",
          "status": "completed"
        },
        {
          "id": "kf_001_end",
          "type": "end",
          "visualPrompt": "小明发现地上的发光芯片，中景，俯拍",
          "imageUrl": "local:img_1774580930218_kf1_end",
          "status": "completed"
        }
      ],

      "interval": {
        "id": "interval_001",
        "startKeyframeId": "kf_001_start",
        "endKeyframeId": "kf_001_end",
        "duration": 5,
        "motionStrength": 0.8,
        "videoUrl": "local:video_1774580930219_shot1",
        "videoPrompt": "小明在雨中行走，发现地上的芯片",
        "status": "completed"
      },

      "nineGrid": {
        "panels": [
          {
            "index": 0,
            "shotSize": "全景",
            "cameraAngle": "平视",
            "description": "城市全景，小明在街道上"
          },
          {
            "index": 4,
            "shotSize": "中景",
            "cameraAngle": "平视",
            "description": "小明行走的侧面"
          }
        ],
        "imageUrl": "local:img_1774580930220_ninegrid",
        "status": "completed"
      }
    },
    {
      "id": "shot_002",
      "sceneId": "scene_001",
      "actionSummary": "小明捡起芯片，查看",
      "dialogue": "这是什么？",
      "cameraMovement": "推近",
      "shotSize": "特写",
      "characters": ["char_001"],
      "characterVariations": {
        "char_001": "var_001"
      },
      "props": ["prop_001"],
      "videoModel": "veo",

      "keyframes": [
        {
          "id": "kf_002_start",
          "type": "start",
          "visualPrompt": "小明的手伸向地上的芯片，特写",
          "imageUrl": "local:img_1774580930221_kf2_start",
          "status": "completed"
        },
        {
          "id": "kf_002_end",
          "type": "end",
          "visualPrompt": "小明拿着芯片，仔细查看，特写",
          "imageUrl": "local:img_1774580930222_kf2_end",
          "status": "completed"
        }
      ],

      "interval": {
        "id": "interval_002",
        "startKeyframeId": "kf_002_start",
        "endKeyframeId": "kf_002_end",
        "duration": 4,
        "motionStrength": 0.6,
        "videoUrl": "local:video_1774580930223_shot2",
        "videoPrompt": "小明捡起芯片，仔细查看",
        "status": "completed"
      }
    }
  ],

  "renderLogs": [
    {
      "id": "log_001",
      "timestamp": 1774580930211,
      "type": "character",
      "resourceId": "char_001",
      "resourceName": "小明",
      "status": "success",
      "model": "gemini-3-pro-image-preview",
      "prompt": "亚洲男性，短发，戴眼镜，穿黑色连帽衫，赛博朋克风格",
      "duration": 5000
    },
    {
      "id": "log_002",
      "timestamp": 1774580935000,
      "type": "scene",
      "resourceId": "scene_001",
      "resourceName": "赛博朋克城市街道",
      "status": "success",
      "model": "gemini-3-pro-image-preview",
      "prompt": "赛博朋克城市街道，霓虹灯招牌，下雨，高楼大厦",
      "duration": 4500
    }
  ]
}
```

---

## 三、双格式引用说明

### 3.1 本地引用格式

```json
{
  "referenceImage": "local:img_1774580930211_ka4m7hl",
  "referenceImageSource": "local",
  "localImageId": "img_1774580930211_ka4m7hl"
}
```

**说明**：
- `referenceImage`: 本地引用格式，以 `local:` 开头
- `referenceImageSource`: 标记图片来源为本地
- `localImageId`: IndexedDB 中的图片 ID

**存储位置**：本地 IndexedDB `images` store

### 3.2 云端引用格式

```json
{
  "referenceImage": "https://xxx.supabase.co/storage/v1/object/public/projects/char_002.png",
  "referenceImageSource": "cloud"
}
```

**说明**：
- `referenceImage`: 云端 URL，指向 Supabase Storage
- `referenceImageSource`: 标记图片来源为云端
- 不需要 `localImageId` 字段

**存储位置**：云端 Supabase Storage

### 3.3 同时支持两种格式

```json
{
  "referenceImage": "local:img_1774580930211_ka4m7hl",
  "referenceImageSource": "local",
  "localImageId": "img_1774580930211_ka4m7hl",
  "cloudUrl": "https://xxx.supabase.co/storage/v1/object/public/projects/char_001.png"
}
```

**说明**：
- 可以同时保存本地和云端引用
- 优先使用本地引用（更快）
- 云端引用作为备份（防止本地数据丢失）

---

## 四、无限画布集成

### 4.1 画布图层数据

```json
{
  "canvasState": {
    "layers": [
      {
        "id": "layer_001",
        "type": "image",
        "x": 100,
        "y": 100,
        "width": 400,
        "height": 400,
        "src": "local:img_1774580930211_ka4m7hl",
        "imageId": "img_1774580930211_ka4m7hl",
        "title": "小明定妆照",
        "format": "png",
        "linkedResourceId": "char_001",
        "linkedResourceType": "character",
        "version": 1,
        "originalSrc": "local:img_1774580930211_ka4m7hl"
      },
      {
        "id": "layer_002",
        "type": "prompt",
        "x": 100,
        "y": 550,
        "width": 280,
        "height": 180,
        "title": "提示词 - 风格迁移",
        "promptConfig": {
          "prompt": "Convert to anime style",
          "enhancedPrompt": "Convert to Studio Ghibli anime style with soft lighting",
          "isEnhanced": true,
          "mode": "style-transfer",
          "aspectRatio": "1:1",
          "linkedLayerIds": ["layer_001"],
          "outputLayerIds": ["layer_003"],
          "nodeColor": "#8b5cf6"
        }
      },
      {
        "id": "layer_003",
        "type": "image",
        "x": 550,
        "y": 100,
        "width": 400,
        "height": 400,
        "src": "local:img_1774580930224_generated",
        "imageId": "img_1774580930224_generated",
        "title": "风格迁移 - 小明定妆照",
        "format": "png",
        "linkedResourceId": "char_001",
        "linkedResourceType": "character",
        "version": 2,
        "originalSrc": "local:img_1774580930211_ka4m7hl",
        "isTemporary": true
      }
    ],
    "offset": { "x": 0, "y": 0 },
    "scale": 1
  }
}
```

### 4.2 图层类型说明

| 类型 | 说明 | src 格式 |
|------|------|----------|
| `image` | 图片图层 | `local:img_xxx` 或 `data:image/png;base64,...` |
| `video` | 视频图层 | `local:video_xxx` 或 `data:video/mp4;base64,...` |
| `prompt` | 提示词图层 | 无 src，使用 promptConfig |
| `drawing` | 绘制图层 | `data:image/png;base64,...` |
| `sticky` | 便签图层 | 无 src，使用 text 字段 |
| `text` | 文字图层 | 无 src，使用 text 字段 |

---

## 五、数据迁移说明

### 5.1 从旧格式迁移

如果旧项目只有 `referenceImage` 字段，没有 `referenceImageSource`：

```typescript
// 迁移逻辑
if (!character.referenceImageSource) {
  if (character.referenceImage?.startsWith('local:')) {
    character.referenceImageSource = 'local';
    character.localImageId = character.referenceImage.replace('local:', '');
  } else if (character.referenceImage?.startsWith('http')) {
    character.referenceImageSource = 'cloud';
  } else if (character.referenceImage?.startsWith('data:')) {
    // base64 格式，需要保存到 IndexedDB
    const localId = `img_${Date.now()}`;
    const blob = base64ToBlob(character.referenceImage);
    await imageStorageService.saveImage(localId, blob);
    character.referenceImage = `local:${localId}`;
    character.referenceImageSource = 'local';
    character.localImageId = localId;
  }
}
```

### 5.2 从本地导出到云端

```typescript
// 导出逻辑
async function exportToCloud(character: Character): Promise<Character> {
  if (character.referenceImageSource === 'local' && character.localImageId) {
    // 从本地获取图片
    const blob = await imageStorageService.getImage(character.localImageId);
    
    // 上传到云端
    const fileName = `${character.id}_${Date.now()}.png`;
    const { data } = await supabase.storage
      .from('projects')
      .upload(fileName, blob);
    
    const { data: urlData } = supabase.storage
      .from('projects')
      .getPublicUrl(fileName);
    
    // 更新引用
    character.cloudUrl = urlData.publicUrl;
    
    return character;
  }
  return character;
}
```

---

## 六、最佳实践

### 6.1 保存数据时

```typescript
// 1. 保存到本地 IndexedDB
await imageStorageService.saveImage(localId, blob);

// 2. 更新项目数据
character.referenceImage = `local:${localId}`;
character.referenceImageSource = 'local';
character.localImageId = localId;

// 3. 保存项目
await saveProject(project);
```

### 6.2 加载数据时

```typescript
// 1. 检查本地是否存在
const blob = await imageStorageService.getImage(character.localImageId);

if (blob) {
  // 2. 使用本地数据
  const objectUrl = URL.createObjectURL(blob);
  return objectUrl;
} else if (character.cloudUrl) {
  // 3. 从云端恢复
  const response = await fetch(character.cloudUrl);
  const blob = await response.blob();
  await imageStorageService.saveImage(character.localImageId, blob);
  return URL.createObjectURL(blob);
} else {
  // 4. 数据丢失
  throw new Error('图片数据丢失');
}
```

### 6.3 导出到云端时

```typescript
// 1. 用户手动触发
async function handleExportToCloud(characterId: string) {
  const character = getCharacter(characterId);
  
  // 2. 上传到云端
  const cloudUrl = await uploadToCloud(character);
  
  // 3. 更新引用
  character.cloudUrl = cloudUrl;
  
  // 4. 保存项目
  await saveProject(project);
  
  // 5. 显示成功提示
  showToast('已导出到云端');
}
```

---

**文档结束**
