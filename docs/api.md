# Drama Backend API 文档

**版本:** 0.1.0  
---

## 目录

- [根端点](#根端点)
- [健康检查](#健康检查)
- [图像生成](#图像生成)
- [风格迁移](#风格迁移)
- [IPA 风格迁移](#ipa-风格迁移)
- [图像上传](#图像上传)
- [图像查看](#图像查看)
- [分镜生成](#分镜生成)
- [图像分割网格](#图像分割网格)
- [图像修复](#图像修复)
- [视觉语言模型](#视觉语言模型)
- [视频生成](#视频生成)

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

### POST /api/v1/generate/image2image

基于参考图像生成新图像

**请求体 (Image2ImageRequest):**

| 字段 | 类型 | 必填 | 默认值 | 描述 |
|------|------|------|--------|------|
| `prompt` | string | 是 | - | 场景描述（从脚本内容派生） |
| `width` | integer | 否 | 1024 | 图像宽度 |
| `height` | integer | 否 | 768 | 图像高度 |
| `image1` | string | 是 | "" | 参考图像1（文件名） |
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

**请求示例:**
```json
{
  "image1": "target_image.png",
  "image2": "style_reference.png"
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
| `image1` | string | 否 | "" | 风格参考图像 |
| `image2` | string | 否 | "" | 参考图像1 |
| `image3` | string | 否 | "" | 参考图像2 |

**请求示例:**
```json
{
  "prompt": "画面是1个男人参考(图2三视图)手指前方和他的龙，画面4k，高清",
  "width": 1024,
  "height": 768,
  "image1": "style_reference.png",
  "image2": "reference.png",
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

### GET /api/v1/view

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

## 错误响应

所有端点可能返回以下错误状态码：

| 状态码 | 描述 |
|--------|------|
| 400 | 请求参数错误 |
| 500 | 服务器内部错误 |
| 502 | Drama Backend 服务不可用 |

---
