---
title: Seedance 视频提示词系统
category: api-reference
status: active
audience: developer
created: 2026-01-01
updated: 2026-06-01
---

# Seedance 视频提示词系统 - 技术文档

> **来源项目**: MOKE Vision One  
> **文档版本**: v1.0  
> **最后更新**: 2026-05-18  
> **适用目标**: WL AI Director StageDirector 模块集成

---

## 1. 系统概述

Seedance 视频提示词系统是一个专为 AI 视频生成（Seedance 2.0 / Seedance 2.0 Fast）设计的结构化提示词工程框架。它提供模板库、影视术语速查表、资产提取和提示词生成四大核心能力。

### 1.1 核心特性

| 特性 | 描述 |
|------|------|
| **模板驱动** | 9+ 专业视频模板覆盖常见场景 |
| **术语标准化** | 10 大类影视术语中英对照 |
| **资产映射** | 支持 @image1 / @video1 / @audio1 素材引用 |
| **时间轴编排** | 0-3s / 3-7s / 7-10s 分段式提示词结构 |
| **IP 合规** | 内置版权规避策略和原创角色命名规范 |

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Seedance Prompt System                    │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Template    │  CheatSheet  │   Asset      │   Prompt       │
│   Library    │   Database   │  Extractor   │   Generator    │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ • 9+ Templates│ • 10 Categories│ • Scene     │ • Mode        │
│ • Mode Config│   - Shots     │   Extraction│   Selection   │
│ • Asset Map  │   - Moves     │ • Character │ • Time-code   │
│ • Prompt Snip│   - Angles    │   Extraction│   Structure   │
│ • Negatives  │   - Focus     │ • Concept   │ • IP Check    │
│ • Settings   │   - Transitions│  Generation│ • Output      │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

---

## 2. 核心数据类型定义

### 2.1 资产类型 (Asset)

```typescript
// components/seedance/seedanceTypes.ts
export interface Asset {
  name: string;        // 资产标识符，如 @image1, @video1, @audio1
  description: string; // 资产用途描述
  image?: string;      // 可选：预览图 base64
}
```

### 2.2 模板类型 (Template)

```typescript
// components/seedance/templates.ts
export interface Template {
  id: string;           // 模板唯一标识
  name: string;         // 显示名称
  mode: string;         // 生成模式：'全素材参考' | '首尾帧' | '纯文本生成'
  assets: Asset[];      // 所需资产列表
  prompt: string;       // 提示词正文（英文）
  negative: string;     // 负面约束
  settings: {
    duration: string;   // 时长：'10秒', '15秒' 等
    aspectRatio: string;// 比例：'9:16', '16:9', '原比例' 等
    fps?: string;       // 帧率：'24fps', '30fps'
    style?: string;     // 风格描述
  };
  notes?: string;       // 使用说明
}
```

### 2.3 影视术语类型

```typescript
// components/seedance/cheatSheet.ts
export interface CheatSheetTerm {
  zh: string;      // 中文名称
  en: string;      // 英文术语
  desc: string;    // 中文解释
}

type CheatSheetCategory = 
  | 'cameraShots'      // 景别
  | 'cameraMoves'      // 镜头运动
  | 'cameraAngles'     // 机位角度
  | 'focusDepth'       // 焦点景深
  | 'transitions'      // 转场
  | 'rhythm'           // 节奏术语
  | 'lighting'         // 灯光设置
  | 'colorPalette'     // 色彩方案
  | 'artStyle'         // 艺术风格
  | 'filmGrain';       // 胶片纹理
```

---

## 3. 模板库详解

### 3.1 模板列表

| ID | 名称 | 模式 | 时长 | 比例 | 适用场景 |
|----|------|------|------|------|----------|
| A | 电影冒险 | 全素材参考 | 10s | 9:16 | 奇幻冒险短片 |
| B | 延展已有视频 | 全素材参考 | 5s | 原比例 | 视频续作 |
| C | 角色替换 | 全素材参考 | 原时长 | 原比例 | 角色换装 |
| D | IP安全原创生物对战 | 纯文本 | 10s | 9:16 | 动画对战 |
| E | IP安全科幻英雄 | 纯文本 | 10s | 9:16 | 科幻短片 |
| F | 玩偶舞蹈动画 | 全素材参考 | 10s | 9:16 | 玩具动画 |
| G | MV节拍同步蒙太奇 | 全素材参考 | 12s | 原比例 | 音乐视频 |
| H | 产品展示/电商广告 | 全素材参考 | 10s | 16:9 | 产品广告 |
| I | 含对白的短剧 | 全素材参考 | 15s | 9:16 | 剧情短片 |

### 3.2 完整模板示例

#### 模板 A: 电影冒险（10秒，全素材参考）

```typescript
{
  id: 'A',
  name: '电影冒险（10 秒，全素材参考）',
  mode: '全素材参考',
  assets: [
    { name: '@image1', description: '首帧及主角外观' },
    { name: '@video1', description: '镜头节奏参考' },
    { name: '@audio1', description: '氛围节奏参考' }
  ],
  prompt: `9:16 vertical, 10s fantasy adventure cinematic, cel-shading blended with watercolor, cool blue-green palette with warm highlights.
0-3s: hero wakes in a dim ancient chamber; faint glowing runes pulse on wet stone walls; slow dolly out.
3-7s: hero walks to giant rune door and touches circular mechanism; energy ripples activate runes in sequence; heavy door opens into bright light; follow shot.
7-10s: reveal vast world from cliff edge with floating islands and distant glowing ruins; crane up + pullback for scale.
Audio: water-drop echoes and low temple resonance at start; layered activation tones at rune trigger; deep rumble on door opening; orchestral swell on world reveal; wind ambience to end.
Visual control: coherent lighting, physically plausible movement, stable identity.`,
  negative: 'no watermark, no logo, no subtitles, no on-screen text.',
  settings: { duration: '10秒', aspectRatio: '9:16' }
}
```

#### 模板 H: 产品展示/电商广告

```typescript
{
  id: 'H',
  name: '产品展示 / 电商广告（10 秒）',
  mode: '全素材参考',
  assets: [
    { name: '@image1', description: '产品正面高清照片（身份锚点）' }
  ],
  prompt: `16:9 widescreen, 10s, 3D product showcase, studio lighting with soft gradient backdrop, cinematic product commercial tone
0-3s: product rotates 360° at medium speed, clean reflections on surface, hero key light from upper-left
3-7s: product pauses, then splits into 3 sections (top/middle/bottom) in a 3D exploded view, each part floats apart with subtle particle trails, smooth transition
7-10s: parts rapidly reassemble with satisfying snap motion, final hero shot with brand-neutral backdrop glow, slight camera push-in for impact
Material rendering: accurate surface finish, glass reflections, metallic sheen where applicable`,
  negative: 'no watermark, no logo overlay, no text overlay, no price tags, no competitor branding, no distorted proportions',
  settings: { duration: '10 秒', aspectRatio: '16:9' }
}
```

### 3.3 模板应用流程

```typescript
// 模板应用函数示例
function applyTemplate(template: Template): void {
  // 1. 设置生成模式
  setMode(template.mode);
  
  // 2. 初始化资产列表
  setAssets(template.assets.length > 0 
    ? [...template.assets] 
    : [{ name: '@image1', description: '' }]
  );
  
  // 3. 填充提示词段落
  setPromptSegments([{ 
    id: '1', 
    english: template.prompt, 
    chinese: '' 
  }]);
  
  // 4. 设置负面约束
  setNegative(template.negative);
  
  // 5. 应用生成设置
  setDuration(template.settings.duration.replace(/[^0-9]/g, '') || '15');
  setAspectRatio(template.settings.aspectRatio);
  setFps(template.settings.fps || '');
  setStyle(template.settings.style || '');
}
```

---

## 4. 影视术语速查表

### 4.1 术语分类结构

```typescript
const cheatCategories = [
  { id: 'cameraShots', cn: '景别', en: 'Shot Size' },
  { id: 'cameraMoves', cn: '镜头运动', en: 'Camera Move' },
  { id: 'cameraAngles', cn: '机位角度', en: 'Camera Angle' },
  { id: 'focusDepth', cn: '焦点景深', en: 'Focus & DOF' },
  { id: 'transitions', cn: '转场', en: 'Transitions' },
  { id: 'rhythm', cn: '节奏术语', en: 'Rhythm' },
  { id: 'lighting', cn: '灯光设置', en: 'Lighting' },
  { id: 'colorPalette', cn: '色彩方案', en: 'Color' },
  { id: 'artStyle', cn: '艺术风格', en: 'Art Style' },
  { id: 'filmGrain', cn: '胶片纹理', en: 'Film Grain' },
];
```

### 4.2 完整术语数据

#### 4.2.1 景别 (Camera Shots)

```typescript
cameraShots: [
  { zh: '特写（大特写）', en: 'extreme close-up (ECU)', desc: '眼睛、手部、小细节填满画面' },
  { zh: '特写', en: 'close-up (CU)', desc: '面部或单个物体，紧凑构图' },
  { zh: '近景', en: 'medium close-up (MCU)', desc: '头肩景' },
  { zh: '中景', en: 'medium shot (MS)', desc: '腰部以上' },
  { zh: '中全景', en: 'medium full shot', desc: '膝盖以上' },
  { zh: '全景', en: 'full shot (FS)', desc: '全身，头到脚' },
  { zh: '远景', en: 'wide shot (WS)', desc: '主体加大量环境' },
  { zh: '大远景', en: 'extreme wide shot (EWS)', desc: '广阔景观，主体很小' },
  { zh: '双人镜头', en: 'two-shot', desc: '两个主体同框' },
  { zh: '过肩镜头', en: 'over-the-shoulder (OTS)', desc: '一个主体背后看另一个' },
  { zh: '主观视角', en: 'POV shot', desc: '镜头充当角色的眼睛' },
]
```

#### 4.2.2 镜头运动 (Camera Moves)

```typescript
cameraMoves: [
  { zh: '推近', en: 'push-in', desc: '镜头向主体推近（制造紧张/聚焦）' },
  { zh: '拉远', en: 'pull-back / pullout', desc: '镜头远离主体（展示规模）' },
  { zh: '轨道移动', en: 'dolly', desc: '轨道上平滑的横向或前后跟踪' },
  { zh: '横移', en: 'truck left/right', desc: '镜头水平滑动' },
  { zh: '水平摇', en: 'pan left/right', desc: '镜头在轴上水平旋转' },
  { zh: '垂直摇', en: 'tilt up/down', desc: '镜头在轴上垂直旋转' },
  { zh: '升降', en: 'crane up/down', desc: '镜头垂直升降' },
  { zh: '环绕', en: 'orbit / arc', desc: '镜头围绕主体环绕' },
  { zh: '跟拍', en: 'follow shot / tracking shot', desc: '镜头跟随运动主体' },
  { zh: '手持', en: 'handheld', desc: '轻微有机晃动，纪实感' },
  { zh: '斯坦尼康', en: 'Steadicam', desc: '空间中平滑浮动的运动' },
  { zh: '甩镜', en: 'whip pan', desc: '极快水平旋转（转场装置）' },
  { zh: '变焦', en: 'zoom in/out', desc: '镜头焦距变化（非物理移动）' },
]
```

#### 4.2.3 机位角度 (Camera Angles)

```typescript
cameraAngles: [
  { zh: '平视', en: 'eye-level', desc: '中性、自然视角' },
  { zh: '仰拍', en: 'low angle', desc: '镜头仰视主体（力量、英雄感）' },
  { zh: '俯拍', en: 'high angle', desc: '镜头俯视主体（脆弱感）' },
  { zh: '鸟瞰', en: 'bird's eye / top-down', desc: '正上方垂直俯瞰' },
  { zh: '倾斜构图', en: 'dutch angle / tilted', desc: '镜头在轴上倾斜（不安、紧张）' },
  { zh: '虫眼视角', en: 'worm's eye', desc: '极低位，地面仰视' },
]
```

#### 4.2.4 焦点景深 (Focus & Depth)

```typescript
focusDepth: [
  { zh: '浅景深', en: 'shallow depth of field', desc: '背景模糊，主体隔离' },
  { zh: '深焦', en: 'deep focus', desc: '全部清晰对焦，分层构图' },
  { zh: '焦点转移', en: 'rack focus', desc: '焦点从前景转到背景（或反向）' },
  { zh: '分屈光镜', en: 'split diopter', desc: '两个平面同时对焦' },
  { zh: '散景', en: 'bokeh', desc: '柔和的圆形背景虚化高光' },
]
```

#### 4.2.5 转场 (Transitions)

```typescript
transitions: [
  { zh: '硬切', en: 'cut', desc: '镜头间瞬间切换' },
  { zh: '溶解/交叉淡化', en: 'dissolve / crossfade', desc: '两个镜头渐变融合' },
  { zh: '划接', en: 'wipe', desc: '一个镜头滑过另一个' },
  { zh: '匹配剪辑', en: 'match cut', desc: '在相似形状或运动间切换' },
  { zh: '硬切对比', en: 'smash cut', desc: '突然切换制造冲击或对比' },
  { zh: '淡入/淡出', en: 'fade to black / white', desc: '渐变到纯色' },
  { zh: '甩镜转场', en: 'whip transition', desc: '快速摇镜桥接两个场景' },
]
```

#### 4.2.6 节奏术语 (Rhythm)

```typescript
rhythm: [
  { zh: '慢动作', en: 'slow motion / slow-mo', desc: '降低回放速度增强戏剧性' },
  { zh: '延时摄影', en: 'time-lapse', desc: '压缩时间，云/人群快速移动' },
  { zh: '变速', en: 'speed ramp', desc: '一个镜头内从慢到快（或反向）过渡' },
  { zh: '定格', en: 'freeze frame', desc: '单帧定格为静态画面' },
  { zh: '快切', en: 'quick cuts', desc: '快速镜头切换增加活力' },
  { zh: '长镜头', en: 'long take', desc: '无剪辑的长镜头' },
]
```

#### 4.2.7 灯光设置 (Lighting)

```typescript
lighting: [
  { zh: '主光', en: 'key light', desc: '主光源，定义氛围' },
  { zh: '轮廓光/背光', en: 'rim light / backlight', desc: '边缘光，将主体从背景中分离' },
  { zh: '补光', en: 'fill light', desc: '柔化主光的阴影' },
  { zh: '英雄光', en: 'hero lighting', desc: '戏剧化的产品广告式灯光' },
  { zh: '体积光', en: 'volumetric light', desc: '可见的光线穿过大气（丁达尔效应/上帝之光）' },
  { zh: '霓虹光', en: 'neon lighting', desc: '彩色人工灯光，赛博朋克美学' },
  { zh: '黄金时刻', en: 'golden hour', desc: '温暖的低角度自然阳光' },
  { zh: '蓝色时刻', en: 'blue hour', desc: '冷色调黄昏环境光' },
  { zh: '钨丝暖光', en: 'tungsten warm', desc: '室内橙暖色调实景灯光' },
  { zh: '明暗对比', en: 'chiaroscuro', desc: '明暗之间的高对比度' },
]
```

#### 4.2.8 色彩方案 (Color Palette)

```typescript
colorPalette: [
  { zh: '暖色调', en: 'warm palette', desc: '红、橙、金（能量、激情、温馨）' },
  { zh: '冷色调', en: 'cool palette', desc: '蓝、银、青（冷静、科技、忧郁）' },
  { zh: '低饱和', en: 'desaturated / muted', desc: '低饱和度，写实或凄凉感' },
  { zh: '高饱和', en: 'high saturation / vibrant', desc: '鲜艳色彩，用于动画、奇幻、广告' },
  { zh: '单色', en: 'monochromatic', desc: '单一色调的层次变化' },
  { zh: '互补对比', en: 'complementary split', desc: '两种对比色（如青橙对比）' },
  { zh: '粉彩', en: 'pastel', desc: '柔和淡色调，温柔或奇幻感' },
]
```

#### 4.2.9 艺术风格 (Art Style)

```typescript
artStyle: [
  { zh: '照片写实', en: 'photorealistic', desc: '与真实画面无法区分' },
  { zh: '赛璐珞/卡通', en: 'cel-shading / toon', desc: '扁平色彩 + 硬边轮廓' },
  { zh: '水彩', en: 'watercolor', desc: '柔和晕染、纸张纹理、有机边缘' },
  { zh: '水墨', en: 'ink-wash / sumi-e', desc: '中国/日本水墨画美学' },
  { zh: '3D CG 渲染', en: '3D CGI render', desc: '干净 CG，精确材质和光照' },
  { zh: '定格动画', en: 'stop-motion', desc: '逐帧拍摄的实物动画感' },
  { zh: '像素风', en: 'pixel art', desc: '复古低分辨率像素美学' },
  { zh: '油画', en: 'oil painting', desc: '厚重纹理、可见笔触' },
  { zh: '日式动画', en: 'anime', desc: '日式动画风格，表情丰富' },
  { zh: '混合媒介', en: 'mixed media', desc: '一件作品中组合多种视觉风格' },
]
```

#### 4.2.10 胶片纹理 (Film Grain)

```typescript
filmGrain: [
  { zh: '35mm 胶片颗粒', en: '35mm film grain', desc: '有机纹理，经典电影感' },
  { zh: '16mm 胶片颗粒', en: '16mm film grain', desc: '更重的颗粒，独立/复古风' },
  { zh: '干净数字', en: 'clean digital', desc: '无颗粒，锐利的现代质感' },
  { zh: 'VHS / 模拟', en: 'VHS / analog', desc: '扫描线、色彩溢出、复古失真' },
  { zh: 'IMAX 清晰度', en: 'IMAX clarity', desc: '超锐利、大画幅电影级细节' },
]
```

---

## 5. 提示词工程规范

### 5.1 标准输出格式模板

```
模式：[全素材参考 / 首尾帧 / 纯文本]

素材映射：
- @image1：[用途描述]
- @video1：[用途描述]
- @audio1：[用途描述]

正式提示词：
[比例], [时长], [风格].
0-3s: [action + camera].
3-7s: [action + transition].
7-10s: [reveal/climax + resolve].
Keep identity, scene, lighting coherent.

负面约束：
no watermark, no logo, no subtitles, no on-screen text.

生成设置：
时长：10秒
画面比例：9:16
```

### 5.2 时间轴编排规则

| 时间段 | 内容要求 | 示例 |
|--------|----------|------|
| 0-3s | 开场/铺垫，建立场景和主体 | hero wakes in ancient chamber; slow dolly out |
| 3-7s | 发展/升级，主要动作发生 | walks to door, touches mechanism; follow shot |
| 7-10s | 高潮/揭示，收尾 | reveal vast world; crane up + pullback |

### 5.3 IP 合规策略

#### 禁止事项
- ❌ 使用系列名/角色名/品牌词
- ❌ "XX风格"的标志性描述
- ❌ 真实人脸（可能触发合规拦截）

#### 推荐做法
- ✅ 使用原创昵称："Alloy Sentinel" / "Storm Rabbit" / "Lava Iguana"
- ✅ 用通用美学替换标志性特征
- ✅ 负面约束明确列出可推断的品牌名

#### 替换示例
```
❌ "arc reactor" (钢铁侠)
✅ "hex-light energy core"

❌ "Iron Man style"
✅ "custom powered exo-suit with smooth ceramic panels"
```

### 5.4 平台限制

| 限制项 | 规格 |
|--------|------|
| 混合输入总量 | ≤ 12 个文件 |
| 图片限制 | ≤ 9 张 / 30MB |
| 视频限制 | ≤ 3 个 / 50MB / 总时长 2-15s |
| 音频限制 | ≤ 3 个 / 15s / 15MB |
| 生成时长 | 4-15 秒（单次）|
| 超长视频 | 多段拼接链式生成 |

---

## 6. AI 技能系统 Prompt

### 6.1 提示词工程师技能 (prompt-engineer)

```
你是 **Seedance 2.0 提示词工程大师**，精通基于 Seedance 2.0 / Seedance 2.0 Fast 的高控制力视频提示词设计。

## 核心规则（必须严格遵守）
1. **始终先声明模式**：纯文本 / 首尾帧 / 全素材参考（三选一）
2. **始终包含明确的素材映射部分**（@image1=... / @video1=... / @audio1=...）
3. **使用时间码节拍**（0-3s / 3-7s / 7-10s），每段只承载一个主要动作
4. **具体且视觉化**："穿红色风衣的女人走过霓虹灯映照的湿漉漉街道" > "一个女人在走路"
5. **提示词正文用英文**（Seedance 引擎对英文理解最佳），结构说明/注释用中文
6. **音频与对白分层**：对白 `Dialogue (角色名, 情绪): "台词"`；音效独立写 `Sound: [描述]`

## 平台限制（必须遵守）
- 混合输入总量 ≤ 12 个文件 | 图片 ≤ 9 张/30MB | 视频 ≤ 3 个/50MB/总时长 2-15s | 音频 ≤ 3 个/15s/15MB
- 生成时长：4-15 秒（单次）| 超过 15 秒 = 多段拼接链式生成
- 真实人脸可能被合规拦截 → 原创角色优先

## 场景化策略速查
| 场景 | 关键技法 | 推荐模式 |
|------|---------|---------|
| 电商广告 | 360°旋转/英雄光/干净背景 | 全素材参考 |
| 短剧对白 | 情绪标签/音效分层 | 全素材参考 |
| 奇幻仙侠 | 法术粒子/武打编排 | 纯文本 / 全素材参考 |
| MV 节拍 | 节拍锁定/多图蒙太奇 | 全素材参考 + @audio |
| 一镜到底 | 多图航点/单连续镜头 | 全素材参考 |
| IP 安全 | 原创名称/独特特征 | 纯文本 |

用中文和用户沟通，最终提示词正文用英文包在 Markdown 代码块中。
```

---

## 7. 组件实现参考

### 7.1 主窗口组件结构

```typescript
// SeedancePromptWindow.tsx 核心状态
interface SeedanceState {
  // 页面状态
  activeTab: 'create' | 'library' | 'cheatsheet';
  
  // Create 页面状态
  mode: string;                    // 生成模式
  assets: Asset[];                 // 资产列表
  scriptText: string;              // 剧本文本
  promptSegments: PromptSegment[]; // 提示词段落
  negative: string;                // 负面约束
  duration: string;                // 时长
  aspectRatio: string;             // 比例
  fps: string;                     // 帧率
  style: string;                   // 风格
  
  // CheatSheet 状态
  cheatCategory: string;           // 当前术语分类
  
  // 生成状态
  isExtracting: boolean;           // 是否正在提取资产
  isGeneratingPrompt: boolean;     // 是否正在生成提示词
}

interface PromptSegment {
  id: string;
  english: string;
  chinese: string;
}
```

### 7.2 资产提取 Prompt

```typescript
// AI 提取资产 Prompt
const EXTRACT_PROMPT = `请从以下剧本中提取出主要的角色和场景资产，用于AI视频生成的素材映射。
返回纯 JSON 数组，每个对象包含 name（如 @image1, @scene1）和 description（描述外观特征）。
注意：只返回 JSON，不要包含 markdown 代码块标记。

剧本：
${scriptText}

期望输出格式：
[
  {"name": "@image1", "description": "主角外观描述..."},
  {"name": "@scene1", "description": "场景环境描述..."}
]`;
```

### 7.3 提示词生成 Prompt

```typescript
// AI 生成提示词 Prompt
const GENERATE_PROMPT = `基于以下信息，生成一段专业的 Seedance 2.0 视频提示词。

模式：${mode}
资产：${assets.map(a => `${a.name}: ${a.description}`).join('\n')}
剧本/描述：${scriptText}

要求：
1. 使用英文撰写提示词正文
2. 按 0-3s / 3-7s / 7-10s 分段描述
3. 包含具体的镜头运动和景别术语
4. 添加负面约束
5. 返回格式：模式声明 + 素材映射 + 正式提示词 + 负面约束 + 生成设置`;
```

---

## 8. 集成建议

### 8.1 与 WL AI Director 的集成点

| MOKE 功能 | 集成目标模块 | 集成方式 |
|-----------|-------------|----------|
| 模板库 | StageDirector | 新增"视频模板"侧边栏面板 |
| 术语速查表 | StageDirector | 在提示词编辑器旁添加术语浮窗 |
| 资产提取 | StageScript | 剧本解析后自动提取视觉资产 |
| 提示词生成 | StagePrompts | 增强现有提示词管理功能 |

### 8.2 推荐集成顺序

1. **Phase 1**: 移植 `templates.ts` 和 `cheatSheet.ts` 数据文件
2. **Phase 2**: 创建 `VideoPromptAssistant` 组件，集成到 StageDirector
3. **Phase 3**: 在 StageScript 中添加资产提取功能
4. **Phase 4**: 与现有视频生成功能打通

---

## 9. 附录

### 9.1 文件清单

```
MOKE-Vision-One/
├── components/seedance/
│   ├── SeedancePromptWindow.tsx    # 主窗口组件
│   ├── templates.ts                # 模板库数据
│   ├── cheatSheet.ts               # 影视术语数据
│   └── seedanceTypes.ts            # 类型定义
└── services/
    └── chatSkills.ts               # AI技能定义（含提示词工程师）
```

### 9.2 依赖要求

```json
{
  "dependencies": {
    "@google/genai": "^1.36.0",     // Gemini API
    "lucide-react": "^0.577.0"      // 图标库
  }
}
```

---

> **文档结束**  
> 如需更详细的代码实现或特定功能说明，请参考原始项目源代码。
