# Drama Backend API 文档

**版本:** 0.1.0  
---

## 目录

- [根端点](#根端点)
- [健康检查](#健康检查)
- [图像生成](#图像生成)
- [提示词增强](#提示词增强)
- [风格迁移](#风格迁移)
- [IPA 风格迁移](#ipa-风格迁移)
- [图像上传](#图像上传)
- [图像查看](#图像查看)
- [分镜生成](#分镜生成)
- [图像分割网格](#图像分割网格)
- [图像修复](#图像修复)
- [视觉语言模型](#视觉语言模型)
- [360 HDRI 图像生成](#360-hdri-图像生成)
- [视频生成](#视频生成)
- [图像转视频](#图像转视频)
- [图像转视频（宫格）](#图像转视频宫格)
- [错误响应](#错误响应)

---

## 根端点

### GET /

获取服务基本信息

**响应示例:**
```json
{
  "message": "dramabackend"
}
```

---

## 健康检查

### GET /api/v1/health

服务健康检查端点

**响应示例:**
```json
{
  "status": "ok"
}
```

---

## 图像生成

### POST /api/v1/generate/txt2image

根据文本描述生成图像

**请求体 (Text2ImageRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 1024 | 图像宽度 |
| `height` | integer | 否 | 768 | 图像高度 |

**请求示例:**
```json
{
  "prompt": "A beautiful sunset over the ocean",
  "width": 1024,
  "height": 768
}
```

**响应:** 返回生成的图像数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "z-image_00039_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=z-image_00039_.png",
    "duration": 3.63
}
```

### POST /api/v1/generate/txt2imageanime

生成动漫风格图像

**请求体 (Text2ImageRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 1024 | 图像宽度 |
| `height` | integer | 否 | 768 | 图像高度 |

**请求示例:**
```json
{
  "prompt": "An anime girl with long pink hair in a cherry blossom garden",
  "width": 1024,
  "height": 768
}
```

**响应:** 返回生成的动漫风格图像数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "anime_image_00001_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=anime_image_00001_.png",
    "duration": 4.20
}
```

**说明:**
- 使用动漫风格模型生成图像
- 适用于生成日式动漫风格的角色和场景

### POST /api/v1/generate/image2image

基于参考图像生成新图像

**请求体 (Image2ImageRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 1024 | 图像宽度 |
| `height` | integer | 否 | 768 | 图像高度 |
| `image1` | string | 否 | "" | 参考图像1（文件名） |
| `image2` | string | 否 | "" | 参考图像2（文件名） |
| `image3` | string | 否 | "" | 参考图像3（文件名） |

**请求示例:**
```json
{
  "prompt": "Transform this landscape to autumn style",
  "width": 1024,
  "height": 768,
  "image1": "image1.png"
}
```

**响应:** 返回生成的图像数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "z-image_00039_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=z-image_00039_.png",
    "duration": 3.63
}
```

### GET /api/v1/generate/image

生成默认图像（使用预置提示词）

**请求参数:** 无

**响应:** 返回生成的图像数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "z-image_00039_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=z-image_00039_.png",
    "duration": 3.63
}
```

**说明:**
- 该端点使用内部预置的提示词生成图像
- 适用于快速测试或生成默认风格图像

---

## 提示词增强

### POST /api/v1/generate/image2promptenhance

提示词增强（根据输入提示词生成更丰富的提示词）

**请求体 (Image2PromptEnhanceRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 原始提示词 |

**请求示例:**
```json
{
  "prompt": "a beautiful landscape"
}
```

**响应:** 返回增强后的提示词

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "output": "A stunningly beautiful landscape with rolling green hills, majestic mountains in the distance, vibrant wildflowers blooming in the foreground, a serene lake reflecting the golden sunset sky, fluffy white clouds drifting lazily overhead, and a gentle breeze rustling through the tall grass, creating a peaceful and idyllic scene.",
    "duration": 1.23
}
```

**说明:**
- 该端点使用AI模型对输入提示词进行扩展和增强
- 生成更详细、更具描述性的提示词
- 适用于提升图像生成质量

### POST /api/v1/generate/image2character

基于角色设计图生成角色立绘图（三视图）

**请求体 (Image2CharacterRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `image` | string | 是 | - | 角色设计图（文件名） |

**请求示例:**
```json
{
  "image": "character_design.png"
}
```

**响应:** 返回生成的角色立绘图

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "dramma_character_visual_image.png",
    "full_url": "http://117.50.108.73:8082/view?filename=dramma_character_visual_image.png",
    "duration": 3.63
}
```

**说明:** 
- 该接口将根据输入的角色设计图生成三视图立绘图
- 包含正面特写、侧面全身、背面全身三个视角
- 背景为纯白色

---

## 风格迁移

### POST /api/v1/generate/image2styletransfer

基于参考图像进行风格迁移

**请求体 (Image2StyleTransferRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `image1` | string | 是 | - | 目标图像（需要进行风格迁移的图像） |
| `image2` | string | 是 | - | 参考图像（提供风格参考的图像） |
| `prompt` | string | 否 | "" | 增强提示词 |
| `enhance` | boolean | 否 | false | 是否增强风格迁移效果 |

**请求示例:**
```json
{
  "image1": "target_image.png",
  "image2": "style_reference.png",
  "prompt": "Make it more vibrant",
  "enhance": true
}
```

**响应:** 返回风格迁移后的图像

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "styletransfer_00001_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=styletransfer_00001_.png",
    "duration": 4.55
}
```

**说明:**
- 该端点将 image2 的风格迁移到 image1 上
- image1 是目标图像，image2 是风格参考图像
- 适用于将一幅图像的风格应用到另一幅图像上

---

## IPA 风格迁移

### POST /api/v1/generate/image2ipastyletransfer

基于参考图像进行 IPA 风格迁移

**请求体 (Image2IPAStyleTransferRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述 |
| `width` | integer | 否 | 1024 | 图像宽度 |
| `height` | integer | 否 | 768 | 图像高度 |
| `image1` | string | 否 | "" | 参考图像1 |
| `image2` | string | 否 | "" | 参考图像2 |
| `image3` | string | 否 | "" | 参考图像3 |
| `ref_image` | string | 否 | "" | 风格迁移参考图像 |
| `enhance` | boolean | 否 | false | 是否增强风格迁移效果 |

**请求示例:**
```json
{
  "prompt": "画面是1个男人参考(图2三视图)手指前方和他的龙，画面4k，高清",
  "width": 1024,
  "height": 768,
  "image1": "style_reference.png",
  "image2": "reference.png",
  "ref_image": "style_guide.png",
  "enhance": true
}
```

**响应:** 返回风格迁移后的图像

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "ipastyletransfer_00001_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=ipastyletransfer_00001_.png",
    "duration": 4.55
}
```

**说明:**
- 该端点使用 IPA (Instant Pose and Appearance) 技术进行风格迁移
- 支持多个参考图像的融合
- 适用于更精细的风格和姿态控制

---

## 图像上传

### POST /api/v1/generate/uploadimage

上传图像到 Drama Backend 服务器

**请求体:**
采用form-data形式(不要填Content-Type)

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `file` | binary | 是 | 要上传的图像文件 |

**响应示例:**
```json
{
  "success": true,
  "filename": "uploaded_image.png"
}
```

### POST /api/v1/generate/upload

手动上传文件（流式接收，不会触发 Starlette 的 1MB 自动溢写）

**请求体:**
采用form-data形式或直接流式上传

**响应示例:**
```json
{
  "status": "success"
}
```

---

## 图像查看

### GET /view

从 ComfyUI 服务器获取图像

**查询参数:**

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `filename` | string | 是 | 要获取的图像文件名 |

**响应:** 返回图像二进制数据 (image/png)

---

## 分镜生成

### POST /api/v1/generate/image2storyboard

根据文本描述生成分镜图像（格子分镜）

**请求体 (Image2StoryboardRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（每行描述一个分镜场景） |
| `gridnum` | integer | 否 | 4 | 分镜格子数量 |
| `width` | integer | 否 | 1024 | 分镜图像每个item宽度 |
| `image` | string | 否 | "" | 参考图像（文件名） |

**请求示例:**
```json
{
  "prompt": "Character enters the forest\nCharacter finds a treasure\nCharacter leaves with treasure",
  "gridnum": 4,
  "width": 1024,
  "image": "reference.png"
}
```

**响应:** 返回生成的分镜图像数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "storyboard_00001_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=storyboard_00001_.png",
    "duration": 5.23
}
```

---

## 图像分割网格

### POST /api/v1/generate/image2splitegrid

将图像分割成网格布局

**请求体 (Image2SpliteGridRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `row` | integer | 否 | 2 | 网格行数 |
| `column` | integer | 否 | 2 | 网格列数 |
| `target_width` | integer | 否 | 1024 | 目标图像宽度 |
| `target_height` | integer | 否 | 768 | 目标图像高度 |
| `image` | string | 是 | - | 要分割的图像（文件名） |

**请求示例:**
```json
{
  "row": 2,
  "column": 2,
  "target_width": 1024,
  "target_height": 768,
  "image": "input_image.png"
}
```

**响应:** 返回分割后的网格图像

**响应示例:**
```json
{
    "prompt_id": "c9c1236f-fff7-4083-b405-cb422ee285d9",
    "images": [
        {
            "filename": "splitegrid_img_1716656698_00001_.png",
            "url": "http://100.90.169.105:8081/view?filename=splitegrid_img_1716656698_00001_.png"
        },
        {
            "filename": "splitegrid_img_1716656698_00002_.png",
            "url": "http://100.90.169.105:8081/view?filename=splitegrid_img_1716656698_00002_.png"
        },
        {
            "filename": "splitegrid_img_1716656698_00003_.png",
            "url": "http://100.90.169.105:8081/view?filename=splitegrid_img_1716656698_00003_.png"
        },
        {
            "filename": "splitegrid_img_1716656698_00004_.png",
            "url": "http://100.90.169.105:8081/view?filename=splitegrid_img_1716656698_00004_.png"
        }
    ],
    "total_count": 4,
    "duration": 1.03
}
```

**说明:**
- 该端点将输入图像按照指定的行列数分割成网格
- 适用于将大图分割成小图、或创建拼图效果
- 支持任意行列组合（如 2x2, 3x3, 2x3 等）

---

## 图像修复

### POST /api/v1/generate/image2inpaint

对图像进行修复或编辑（Inpainting）

**请求体 (Image2InpaintRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 图像修复描述（描述需要修复或添加的内容） |
| `image` | string | 是 | - | 要修复的图像（文件名） |

**请求示例:**
```json
{
  "prompt": "Remove the person and fill with forest background",
  "image": "input_image.png"
}
```

**响应:** 返回修复后的图像

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "inpaint_00001_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=inpaint_00001_.png",
    "duration": 4.55
}
```

**说明:**
- 该端点使用 Inpainting 技术对图像进行修复或编辑
- 可以移除图像中的不需要元素并智能填充背景
- 可以根据提示词添加新元素到图像中

---

## 视觉语言模型

### POST /api/v1/generate/image2vl

基于图像和文本提示进行视觉语言模型推理

**请求体 (Image2VLRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `system_prompt` | string | 是 | - | 系统提示词 |
| `prompt` | string | 是 | - | 用户提示词 |
| `image` | string | 否 | "" | 参考图像（文件名） |

**请求示例:**
```json
{
  "system_prompt": "You are a helpful assistant.",
  "prompt": "Describe this image in detail",
  "image": "input_image.png"
}
```

**响应:** 返回模型生成的文本结果

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "output": "镜头从低角仰视缓缓抬升至中景，男子静坐石阶，烛光在衣褶投下流动阴影；手持微颤，眼神凝望远方，似有心事未诉。暖黄光线勾勒轮廓，木窗格虚化成背景呼吸脉动。\n\n镜头横向平滑右移，聚焦其左手轻抚袖口细节，布料纹理清晰可见；耳后簪子反射烛火余晖，眉宇间紧锁一丝沉思。远处三支蜡烛依次渐隐，在空间纵深里营造仪式感压迫气氛。\n\n近景特写他指尖微微蜷曲，指腹压住袍边暗纹处——那是旧伤痕印记；瞳孔深处映着一缕斜射而来的烛焰，情绪由内敛转为警觉。背景柱体模糊，强化角色心理独白强度。\n\n缓慢拉远镜头，展现全身盘腿端坐姿态，灰袍宽大垂落形成对称美感；身后阶梯层层叠起，烛台排列如阵列守卫。面部神情自若却透出压抑重量，暗示即将发生重大抉择或对话转折。",
    "duration": 3.12
}
```

---

## 360 HDRI 图像生成

### POST /api/v1/generate/image2360hdri

将输入图像转换为 360° 全景 HDRI 图像

**请求体 (Image2360HDRIRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `image` | string | 否 | "" | 输入图像（文件名） |

**请求示例:**
```json
{
  "image": "input_image.png"
}
```

**响应:** 返回生成的 360° HDRI 全景图像

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "360hdri_00001_.png",
    "full_url": "http://117.50.108.73:8082/view?filename=360hdri_00001_.png",
    "duration": 5.50
}
```

**说明:**
- 该端点将普通图像转换为 360° 全景 HDRI 图像
- 适用于创建全景环境贴图和虚拟现实场景

---

## 视频生成

### POST /api/v1/generate/video

生成视频

**请求体:** 无（当前版本不需要请求参数）

**请求示例:**
```json
{}
```

**响应:** 返回生成的视频信息

**响应示例:**
```json
{
    "status": "video generated"
}
```

---

## 图像转视频

### POST /api/v1/generate/image2videomsr

基于图像生成视频（MSR 多帧超分辨率技术）

**请求体 (Image2VideoMsrRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 640 | 视频宽度 |
| `height` | integer | 否 | 320 | 视频高度 |
| `duration` | integer | 否 | 5 | 视频时长（秒） |
| `fps` | integer | 否 | 30 | 视频帧率（帧/秒） |
| `image1` | string | 否 | "" | 参考图像1（文件名） |
| `image2` | string | 否 | "" | 参考图像2（文件名） |
| `image3` | string | 否 | "" | 参考图像3（文件名） |
| `image4` | string | 否 | "" | 参考图像4（文件名） |
| `background` | string | 是 | - | 背景图像（文件名） |

**请求示例:**
```json
{
  "prompt": "A beautiful sunset over the ocean, waves crashing on the shore",
  "width": 1024,
  "height": 768,
  "duration": 10,
  "fps": 30,
  "image1": "reference_image.png",
  "background": "background.png"
}
```

**响应:** 返回生成的视频数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "video_00001_.mp4",
    "full_url": "http://117.50.108.73:8082/view?filename=video_00001_.mp4",
    "duration": 15.30
}
```

**说明:**
- 该端点使用 MSR (Multi-Frame Super-Resolution) 技术生成视频
- 支持最多4张参考图像和1张背景图像
- 根据提示词和参考图像生成连贯的视频内容
- 适用于从静态图像生成动态视频效果

### POST /api/v1/generate/image2videomkr

基于图像生成视频（MKR 多关键帧技术）

**请求体 (Image2VideoMkrRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 640 | 视频宽度 |
| `height` | integer | 否 | 320 | 视频高度 |
| `duration` | integer | 否 | 12 | 视频总时长（秒） |
| `fps` | integer | 否 | 30 | 每秒帧数 |
| `images` | array | 否 | [] | 包含图片名称及其对应帧位置的列表 |

**ImageFrameItem 结构体:**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `image` | string | 是 | 图片的文件名或路径 |
| `frame_index` | integer | 是 | 该图片对应的帧索引位置，-1通常表示结束或特殊标记 |

**请求示例:**
```json
{
  "prompt": "A character walking through a forest",
  "width": 1024,
  "height": 768,
  "duration": 12,
  "fps": 30,
  "images": [
    {
      "image": "frame_start.png",
      "frame_index": 0
    },
    {
      "image": "frame_mid.png",
      "frame_index": 180
    },
    {
      "image": "frame_end.png",
      "frame_index": 360
    }
  ]
}
```

**响应:** 返回生成的视频数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "video_mkr_00001_.mp4",
    "full_url": "http://117.50.108.73:8082/view?filename=video_mkr_00001_.mp4",
    "duration": 20.50
}
```

**说明:**
- 该端点使用 MKR (Multi-Keyframe Rendering) 技术生成视频
- 通过多个关键帧图像进行插值生成连贯的视频
- `frame_index` 根据 `duration × fps` 计算，如 12秒 × 30fps = 360帧
- 适用于需要精确控制关键帧位置的视频生成场景

### POST /api/v1/generate/image2videomkrgrid

基于图像生成视频（MKR Grid 宫格视频技术）

**请求体 (Image2VideoMkrGridRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 640 | 视频宽度 |
| `height` | integer | 否 | 320 | 视频高度 |
| `duration` | integer | 否 | 12 | 视频总时长（秒） |
| `fps` | integer | 否 | 30 | 每秒帧数 |
| `image` | string | 否 | "" | 输入图像（文件名） |
| `gridtype` | integer | 否 | 4 | 宫格类型，仅支持 4、6、9 |
| `frame_indexs` | array | 否 | [0,0,0,0] | 帧索引位置列表，长度必须等于 gridtype |

**校验规则:**
- `gridtype` 仅允许取值 4、6、9
- `frame_indexs` 的长度必须等于 `gridtype` 的值
- 例如 `gridtype=6` 时，`frame_indexs` 需要提供 6 个帧索引

**请求示例:**
```json
{
  "prompt": "A character walking through a fantasy landscape",
  "width": 640,
  "height": 320,
  "duration": 12,
  "fps": 30,
  "image": "input_image.png",
  "gridtype": 4,
  "frame_indexs": [0, 90, 180, 360]
}
```

**响应:** 返回生成的视频数据

**响应示例:**
```json
{
    "prompt_id": "1e315014-43e3-4140-bbf3-ef1a1119705e",
    "filename": "video_mkrgrid_00001_.mp4",
    "full_url": "http://117.50.108.73:8082/view?filename=video_mkrgrid_00001_.mp4",
    "duration": 20.50
}
```

**说明:**
- 该端点使用 MKR (Multi-Keyframe Rendering) 宫格视频技术生成视频
- 将输入图像分割为指定数量的宫格（4/6/9宫格），在每个宫格内分别处理
- `frame_indexs` 根据 `duration × fps` 计算，如 12秒 × 30fps = 360帧
- 适用于需要多宫格布局的视频生成场景

---

### POST /api/v1/generate/deduction

剧情推演：基于当前帧画面分析 + 剧情方向，推演下一帧的构图描述和关键要素

**处理流程（服务端内部）：**

1. 用 `analysis_system_prompt` + `analysis_prompt` 调 VLM（image2vl）分析画面
2. 用 `deduction_system_prompt` + `deduction_prompt` + 分析结果调 LLM 推演下一帧
3. 返回结构化分析 + 推演结果

**请求体 (DeductionRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `image` | string | 是 | - | 当前帧图片（已上传的文件名） |
| `analysis_system_prompt` | string | 否 | 见下方 | VLM 画面分析的系统提示词 |
| `analysis_prompt` | string | 否 | 见下方 | VLM 画面分析的用户提示词 |
| `deduction_system_prompt` | string | 否 | 见下方 | LLM 剧情推演的系统提示词 |
| `deduction_prompt` | string | 否 | 见下方 | LLM 剧情推演的用户提示词 |

**默认提示词：**

| 字段 | 默认值 |
|------|--------|
| `analysis_system_prompt` | "你是一个专业的影视镜头分析师。请从电影摄影的角度分析这张画面。" |
| `analysis_prompt` | "请分析这张画面的以下要素，每项用一句话描述：\n1. 场景：这是什么场景/环境？\n2. 构图：镜头构图方式、主体位置\n3. 光影：光源方向、光线质感、色调\n4. 角色/主体：画面中的角色或主要视觉元素\n5. 情绪/氛围：画面的情绪基调\n6. 镜头语言：机位、焦段、运镜方式" |
| `deduction_system_prompt` | "你是一个专业的影视编剧。请基于当前帧的画面分析和剧情方向，推演下一帧的内容。" |
| `deduction_prompt` | "基于以上画面分析结果，推演下一帧的内容。要求：\n1. 保持角色、场景、光影风格的一致性\n2. 叙事要自然推进，有合理的动因\n3. 明确描述构图变化和镜头运动\n4. 输出结构化的推演结果" |

**响应 (DeductionResponse):**

| 字段 | 类型 | 描述 |
|------|------|------|
| `analysis` | object | 当前帧的画面分析结果 |
| `analysis.scene` | string | 场景描述 |
| `analysis.composition` | string | 构图分析 |
| `analysis.lighting` | string | 光影描述 |
| `analysis.characters` | string | 角色/主体描述 |
| `analysis.mood` | string | 情绪氛围 |
| `analysis.camera` | string | 镜头语言 |
| `deduction` | object | 剧情推演结果 |
| `deduction.next_frame` | string | 下一帧的画面描述（用于图生图 prompt） |
| `deduction.rationale` | string | 推演逻辑说明 |
| `deduction.key_elements` | string[] | 下一帧需保留的关键元素 |
| `deduction.changes` | string[] | 相对当前帧的变化 |

**请求示例:**
```json
{
  "image": "keyframe_001.png",
  "analysis_prompt": "请分析这张画面的场景、构图、光影、角色、情绪和镜头语言",
  "deduction_prompt": "主角发现密道，决定探索。基于画面分析，推演下一帧的内容"
}
```

**响应示例:**
```json
{
  "analysis": {
    "scene": "古堡密室内景",
    "composition": "中景镜头，角色坐于石阶中央，构图对称",
    "lighting": "暖黄烛光，右侧单光源，墙壁投射阴影",
    "characters": "中年男子，灰色长袍，面容凝重",
    "mood": "沉思、压抑、等待",
    "camera": "固定机位，轻微仰拍，镜头距离约2米"
  },
  "deduction": {
    "next_frame": "主角从石阶上缓缓站起身，视线转向右侧墙壁上的暗门；镜头跟随上升，变为站姿中景；暗门边缘透出微光",
    "rationale": "角色长时间沉思后进入行动阶段，由静转动是叙事的自然推进；转向暗门为下一场景做铺垫",
    "key_elements": ["暖黄烛光", "灰色长袍", "古堡密室背景", "中年男子"],
    "changes": ["从坐姿变为站姿", "视线方向改变", "引入暗门新元素", "镜头从仰拍变为平视"]
  }
}
```

**说明:**
- 前端完全控制 prompt，后端只做编排（image2vl → LLM）
- 如果图像尚未上传，需先调用 `/api/v1/generate/uploadimage` 上传

---

## 错误响应

所有端点可能返回以下错误状态码：

| 状态码 | 描述 |
|--------|------|
| 400 | 请求参数错误 |
| 500 | 服务器内部错误 |
| 502 | Drama Backend 服务不可用 |

---