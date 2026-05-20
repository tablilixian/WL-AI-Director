# Film System 胶片系统 - 技术文档

> **来源项目**: MOKE Vision One  
> **文档版本**: v1.0  
> **最后更新**: 2026-05-18  
> **适用目标**: WL AI Director StageAssets / StageDirector 模块集成

---

## 1. 系统概述

Film System 是一个专业的胶片模拟与摄影风格控制系统，为 AI 图像生成提供真实胶片摄影的美学控制。系统包含 30+ 专业胶片预设、相机/镜头/灯光/美学修饰四层叠加、环境参数三滑块调节以及自定义胶片管理功能。

### 1.1 核心特性

| 特性 | 描述 |
|------|------|
| **胶片预设库** | 30+ 专业胶片模拟（Kodak、Fuji、Ilford、CineStill 等） |
| **四层叠加** | 胶片 + 相机 + 镜头 + 灯光/美学，自由组合 |
| **环境参数** | 大气透视 / 空气透视 / 空气雾气湿度三滑块 |
| **智能推荐** | 根据所选胶片自动推荐环境参数值 |
| **自定义胶片** | 用户可创建并保存自己的胶片风格 |
| **Prompt 生成** | 自动拼接完整的摄影风格提示词片段 |

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Film System 胶片系统                        │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│ Film Presets│ Camera/Lens │ Lighting/   │ Atmosphere Controls   │
│   Library   │   Presets   │  Aesthetic  │  (3-Sliders)          │
├─────────────┼─────────────┼─────────────┼───────────────────────┤
│ • 30+ Films │ • 35mm SLR  │ • 11 Light  │ • Atmospheric (0-100) │
│ • 5 Cats    │ • Medium Fmt│ • 12 Aesth  │ • Aerial (0-100)      │
│ • Custom    │ • Cinema    │             │ • Humidity (0-100)    │
│   Films     │ • Large Fmt │             │                       │
└─────────────┴─────────────┴─────────────┴───────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │   Prompt Snippet Generator  │
              │  (自动拼接完整英文提示词)      │
              └─────────────────────────────┘
```

---

## 2. 核心数据类型定义

### 2.1 胶片预设类型

```typescript
// data/filmData.ts
export interface FilmPreset {
  id: string;           // 唯一标识，如 'portra-400'
  name: string;         // 显示名称，如 'Kodak Portra 400'
  description: string;  // 中文描述
  category: string;     // 分类名称
  promptSnippet: string;// 英文提示词片段
}
```

### 2.2 预设选项类型

```typescript
// 用于相机、镜头、灯光、美学修饰
export interface PresetOption {
  name: string;    // 显示名称
  snippet: string; // 英文提示词片段
}
```

### 2.3 自定义胶片类型

```typescript
// services/customFilmStore.ts
export interface CustomFilm extends FilmPreset {
  isCustom: true;      // 标识为自定义
  brand: string;       // 品牌
  iso: number;         // ISO 值
  filmType: FilmType;  // 胶片类型
  grain: FilmGrain;    // 颗粒度
  createdAt: number;   // 创建时间戳
}

export type FilmType = '彩色负片' | '黑白' | '彩色反转片';
export type FilmGrain = 'ultra-fine' | 'fine' | 'medium' | 'coarse';
```

### 2.4 环境参数类型

```typescript
// services/atmosphereRecommender.ts
export interface AtmosphereRecommendation {
  atmospheric: number; // 大气透视 0-100
  aerial: number;      // 空气透视 0-100
  humidity: number;    // 空气雾气湿度 0-100
}

// components/film/AtmosphereControls.tsx
export interface AtmosphereDimensionState {
  enabled: boolean;
  value: number; // 0-100
}

export interface AtmosphereState {
  atmospheric: AtmosphereDimensionState;
  aerial: AtmosphereDimensionState;
  humidity: AtmosphereDimensionState;
}
```

---

## 3. 胶片预设库详解

### 3.1 分类结构

| 分类 | 数量 | 代表胶片 |
|------|------|----------|
| 经典彩色负片 | 9 | Portra 400/160/800, Gold 200, Ektar 100, Superia 400, Pro 400H |
| 反转片/正片 | 4 | Velvia 50/100, Provia 100F, Ektachrome E100 |
| 电影胶片 | 4 | CineStill 800T/50D, Vision3 500T/250D |
| 黑白胶片 | 6 | Tri-X 400, HP5 Plus 400, Delta 3200, T-Max 400, FP4 Plus 125, Pan F Plus 50 |
| 特殊/即时成像 | 4 | Lomo 400, Aerochrome, Polaroid 600, Instax |

### 3.2 完整胶片数据

#### 3.2.1 经典彩色负片 (9种)

```typescript
// Kodak Portra 系列
{
  id: 'portra-400',
  name: 'Kodak Portra 400',
  description: '柔和肤色、低饱和、奶油质感，人像胶片之王',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak Portra 400, soft pastel tones, creamy skin tones, natural warm colors, fine film grain',
},
{
  id: 'portra-160',
  name: 'Kodak Portra 160',
  description: '精细颗粒、自然色彩、低对比，适合明亮光线',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak Portra 160, ultra-fine grain, natural color rendition, low contrast, smooth tonal transitions',
},
{
  id: 'portra-800',
  name: 'Kodak Portra 800',
  description: '高感光、颗粒感、温暖偏色，暗光人像利器',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak Portra 800, visible film grain, warm color cast, slightly desaturated, good for low light',
},

// Kodak 消费级
{
  id: 'gold-200',
  name: 'Kodak Gold 200',
  description: '暖色调、高饱和、怀旧感，日常记录首选',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak Gold 200, warm golden tones, saturated colors, nostalgic vintage feel, consumer film look',
},
{
  id: 'ultramax-400',
  name: 'Kodak Ultramax 400',
  description: '鲜艳色彩、蓝调偏冷、活力十足',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak Ultramax 400, vivid saturated colors, slightly cool blue tones, punchy contrast',
},
{
  id: 'ektar-100',
  name: 'Kodak Ektar 100',
  description: '超细颗粒、极高饱和、色彩浓郁鲜艳',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak Ektar 100, extremely fine grain, hyper-saturated vivid colors, deep reds and blues, high contrast',
},
{
  id: 'colorplus-200',
  name: 'Kodak ColorPlus 200',
  description: '偏暖日常感、经济实惠的街拍卷',
  category: '经典彩色负片',
  promptSnippet: 'shot on Kodak ColorPlus 200, warm tones, everyday casual look, moderate grain, slightly saturated',
},

// Fujifilm
{
  id: 'superia-400',
  name: 'Fuji Superia 400',
  description: '绿色偏移、冷调清新，日系经典',
  category: '经典彩色负片',
  promptSnippet: 'shot on Fuji Superia 400, cool green-blue tones, slightly muted, clean and fresh look, moderate grain',
},
{
  id: 'pro-400h',
  name: 'Fuji Pro 400H',
  description: '柔和过曝、低饱和、仙气飘飘',
  category: '经典彩色负片',
  promptSnippet: 'shot on Fuji Pro 400H, soft pastel overexposed look, low saturation, delicate skin tones, ethereal dreamy quality',
},
```

#### 3.2.2 反转片/正片 (4种)

```typescript
{
  id: 'velvia-50',
  name: 'Fuji Velvia 50',
  description: '极高饱和、浓郁色彩，风光摄影之王',
  category: '反转片 / 正片',
  promptSnippet: 'shot on Fuji Velvia 50, ultra-saturated colors, deep rich greens and reds, high contrast, extremely fine grain, landscape film',
},
{
  id: 'velvia-100',
  name: 'Fuji Velvia 100',
  description: '高饱和但比 Velvia 50 更柔和',
  category: '反转片 / 正片',
  promptSnippet: 'shot on Fuji Velvia 100, saturated vibrant colors, slightly softer than Velvia 50, rich tones, fine grain',
},
{
  id: 'provia-100f',
  name: 'Fuji Provia 100F',
  description: '自然色彩、中性平衡、万用型反转片',
  category: '反转片 / 正片',
  promptSnippet: 'shot on Fuji Provia 100F, natural accurate colors, neutral tone, fine grain, versatile slide film',
},
{
  id: 'ektachrome-e100',
  name: 'Kodak Ektachrome E100',
  description: '精细颗粒、冷蓝色调、高对比透明感',
  category: '反转片 / 正片',
  promptSnippet: 'shot on Kodak Ektachrome E100, cool blue tones, fine grain, high contrast, vivid but natural colors, slide film transparency',
},
```

#### 3.2.3 电影胶片 (4种)

```typescript
{
  id: 'cinestill-800t',
  name: 'CineStill 800T',
  description: '霓虹光晕、红移、城市夜景电影质感',
  category: '电影胶片',
  promptSnippet: 'shot on Cinestill 800T, halation around highlights, warm red-orange glow on lights, cinematic tungsten-balanced, neon light halos, urban night atmosphere',
},
{
  id: 'cinestill-50d',
  name: 'CineStill 50D',
  description: '日光型电影卷、细腻温润',
  category: '电影胶片',
  promptSnippet: 'shot on Cinestill 50D, daylight-balanced cinema film, fine grain, natural colors, soft cinematic quality',
},
{
  id: 'vision3-500t',
  name: 'Kodak Vision3 500T',
  description: '电影工业级、钨丝灯平衡、丰富暗部细节',
  category: '电影胶片',
  promptSnippet: 'shot on Kodak Vision3 500T, cinema film stock, tungsten balanced, rich shadow detail, cinematic color science',
},
{
  id: 'vision3-250d',
  name: 'Kodak Vision3 250D',
  description: '电影日光卷、自然还原、细腻画质',
  category: '电影胶片',
  promptSnippet: 'shot on Kodak Vision3 250D, cinema daylight film, natural color rendition, fine grain, motion picture quality',
},
```

#### 3.2.4 黑白胶片 (6种)

```typescript
{
  id: 'tri-x-400',
  name: 'Kodak Tri-X 400',
  description: '经典黑白、高对比、明显颗粒，新闻摄影传奇',
  category: '黑白胶片',
  promptSnippet: 'shot on Kodak Tri-X 400, classic black and white, high contrast, visible grain, rich blacks, timeless photojournalistic look',
},
{
  id: 'hp5-plus-400',
  name: 'Ilford HP5 Plus 400',
  description: '宽容度高、中等对比，百搭黑白卷',
  category: '黑白胶片',
  promptSnippet: 'shot on Ilford HP5 Plus 400, black and white, wide exposure latitude, medium contrast, versatile grain structure',
},
{
  id: 'delta-3200',
  name: 'Ilford Delta 3200',
  description: '极高感光、粗颗粒、暗光戏剧感',
  category: '黑白胶片',
  promptSnippet: 'shot on Ilford Delta 3200, black and white, pronounced grain, high ISO low light capability, gritty dramatic look',
},
{
  id: 'tmax-400',
  name: 'Kodak T-Max 400',
  description: '细颗粒黑白、现代感、平滑过渡',
  category: '黑白胶片',
  promptSnippet: 'shot on Kodak T-Max 400, black and white, fine grain for its speed, modern tonal range, smooth gradations',
},
{
  id: 'fp4-plus-125',
  name: 'Ilford FP4 Plus 125',
  description: '极细颗粒、经典影调、优美高光细节',
  category: '黑白胶片',
  promptSnippet: 'shot on Ilford FP4 Plus 125, black and white, extremely fine grain, classic tonal range, beautiful highlight detail',
},
{
  id: 'pan-f-plus-50',
  name: 'Ilford Pan F Plus 50',
  description: '超细颗粒、极高解析力，黑白艺术之选',
  category: '黑白胶片',
  promptSnippet: 'shot on Ilford Pan F Plus 50, black and white, ultra-fine grain, extraordinary sharpness, rich tonal gradation',
},
```

#### 3.2.5 特殊/即时成像 (4种)

```typescript
{
  id: 'lomo-400',
  name: 'Lomography Color 400',
  description: '交叉冲洗、偏色、实验 Lo-Fi 美学',
  category: '特殊 / 即时成像',
  promptSnippet: 'shot on Lomography Color 400, cross-processed colors, color shifts, experimental lo-fi aesthetic, unpredictable tones',
},
{
  id: 'aerochrome',
  name: 'Kodak Aerochrome',
  description: '红外彩色、植物变粉红、超现实梦境',
  category: '特殊 / 即时成像',
  promptSnippet: 'shot on Kodak Aerochrome infrared film, false color, pink-magenta foliage, surreal dreamlike landscape, infrared photography',
},
{
  id: 'polaroid-600',
  name: 'Polaroid 600',
  description: '即时成像、方形画幅、褪色复古感',
  category: '特殊 / 即时成像',
  promptSnippet: 'shot on Polaroid 600 instant film, square format, slightly faded colors, soft vintage look, white border frame',
},
{
  id: 'instax',
  name: 'Fujifilm Instax',
  description: '即时成像、鲜艳活泼、小画幅',
  category: '特殊 / 即时成像',
  promptSnippet: 'shot on Fujifilm Instax, instant film, bright cheerful colors, small format, casual snapshot aesthetic',
},
```

---

## 4. 相机/镜头/灯光/美学预设

### 4.1 相机预设 (22种)

```typescript
// 35mm 经典相机
{ name: 'Canon AE-1 (35mm SLR)', snippet: 'Canon AE-1, 35mm SLR, manual focus' },
{ name: 'Nikon FM2 (全机械)', snippet: 'Nikon FM2, mechanical 35mm SLR, precise metering' },
{ name: 'Nikon F3 (专业级)', snippet: 'Nikon F3, professional 35mm SLR' },
{ name: 'Leica M6 (旁轴传奇)', snippet: 'Leica M6 rangefinder, precise manual focus, minimalist design' },
{ name: 'Leica M3 (经典传奇)', snippet: 'Leica M3, legendary rangefinder, classic photography' },
{ name: 'Contax T2 (钛机身)', snippet: 'Contax T2, titanium compact camera, Carl Zeiss Sonnar 38mm f/2.8 lens' },
{ name: 'Contax G2 (自动旁轴)', snippet: 'Contax G2 rangefinder, Carl Zeiss lens, autofocus film camera' },
{ name: 'Olympus OM-1 (轻巧)', snippet: 'Olympus OM-1, compact lightweight SLR' },
{ name: 'Pentax K1000 (经典学生机)', snippet: 'Pentax K1000, simple reliable SLR, fully manual' },
{ name: 'Yashica T4 (蔡司便携)', snippet: 'Yashica T4, Carl Zeiss Tessar 35mm f/3.5, compact point-and-shoot' },

// 中画幅相机
{ name: 'Hasselblad 500CM (6×6)', snippet: 'Hasselblad 500CM, medium format 6x6, square format, Carl Zeiss Planar 80mm' },
{ name: 'Mamiya RZ67 (6×7)', snippet: 'Mamiya RZ67, medium format 6x7, extremely detailed, shallow depth of field' },
{ name: 'Pentax 67 (6×7)', snippet: 'Pentax 67, medium format SLR, 6x7, legendary 105mm f/2.4 lens' },
{ name: 'Rolleiflex 2.8F (双反)', snippet: 'Rolleiflex 2.8F, twin-lens reflex, medium format 6x6, waist-level viewfinder' },
{ name: 'Mamiya 7 (中画幅旁轴)', snippet: 'Mamiya 7, medium format rangefinder, 6x7, sharp optics' },

// 电影摄影机
{ name: 'ARRI ALEXA 35 (电影旗舰)', snippet: 'shot on ARRI ALEXA 35, ARRI color science, cinema-grade image, wide dynamic range, natural film-like texture' },
{ name: 'ARRI ALEXA Mini LF (大画幅)', snippet: 'shot on ARRI ALEXA Mini LF, large format sensor, cinematic shallow depth of field, ARRI color science' },
{ name: 'ARRI ALEXA 65 (IMAX级)', snippet: 'shot on ARRI ALEXA 65, 65mm large format, IMAX-grade resolution, extraordinary detail, epic cinematic scale' },
{ name: 'Sony VENICE 2 (8.6K)', snippet: 'shot on Sony VENICE 2, full-frame 8.6K, dual base ISO, cinematic depth, high-end production' },

// 大画幅
{ name: '4×5 大画幅 (移轴)', snippet: '4x5 large format camera, tilt-shift, extreme detail and resolution, shallow plane of focus' },
{ name: '8×10 大画幅 (超大底片)', snippet: '8x10 large format, ultra-high resolution, extraordinary detail, massive negative' },
```

### 4.2 镜头预设 (16种)

```typescript
// 标准镜头
{ name: '50mm f/1.4 标准镜头', snippet: '50mm f/1.4 lens, natural perspective, shallow depth of field, creamy bokeh' },
{ name: '35mm f/2 广角镜头', snippet: '35mm f/2 wide-angle lens, environmental context, slight barrel distortion' },
{ name: '85mm f/1.8 人像镜头', snippet: '85mm f/1.8 portrait lens, flattering perspective, beautiful background separation, smooth bokeh' },
{ name: '135mm f/2 中长焦', snippet: '135mm f/2 telephoto, compressed perspective, extreme bokeh, subject isolation' },
{ name: '28mm f/2.8 广角', snippet: '28mm f/2.8 wide-angle, expansive view, street photography perspective' },

// 经典光学
{ name: '蔡司 Planar 镜头', snippet: 'Carl Zeiss Planar lens, exceptional sharpness, smooth rendering, 3D pop' },
{ name: '蔡司 Sonnar 镜头', snippet: 'Carl Zeiss Sonnar lens, beautiful color rendering, classic optical character' },
{ name: 'Leica Summilux 镜头', snippet: 'Leica Summilux lens, exceptional micro-contrast, three-dimensional rendering' },
{ name: 'Leica Summicron 镜头', snippet: 'Leica Summicron lens, razor-sharp, classic Leica rendering' },
{ name: 'Helios 44-2 (旋涡散景)', snippet: 'Helios 44-2 58mm f/2, famous swirly bokeh, vintage Soviet lens character' },
{ name: 'Petzval 镜头 (19世纪)', snippet: 'Petzval lens, dramatic swirly bokeh, sharp center soft edges, 19th century optical design' },
{ name: '古董老镜头 (泛用)', snippet: 'vintage lens, soft glow, optical imperfections, swirly bokeh, character-rich rendering' },

// 电影镜头
{ name: 'ARRI Signature Prime (电影)', snippet: 'ARRI Signature Prime lens, large format coverage, creamy smooth bokeh, organic cinematic rendering, warm color character' },
{ name: 'ARRI Master Anamorphic (变形宽银幕)', snippet: 'ARRI Master Anamorphic lens, 2x anamorphic squeeze, oval bokeh, horizontal lens flare, widescreen cinematic look' },
{ name: 'Cooke Anamorphic/i (变形)', snippet: 'Cooke Anamorphic/i lens, 2x anamorphic, warm Cooke Look, smooth skin tones, elegant oval bokeh' },
{ name: '变形宽银幕镜头 (泛用)', snippet: 'anamorphic lens, 2x squeeze, oval bokeh, horizontal blue lens flare, widescreen cinematic aspect ratio 2.39:1' },
```

### 4.3 灯光预设 (11种)

```typescript
{ name: '黄金时段 (Golden Hour)', snippet: 'golden hour, warm directional sunlight, long shadows, golden warm light' },
{ name: '蓝调时刻 (Blue Hour)', snippet: 'blue hour, cool twilight, soft diffused light, deep blue sky' },
{ name: '正午硬光 (Harsh Midday)', snippet: 'harsh midday sun, strong shadows, high contrast, bright highlights' },
{ name: '阴天柔光 (Overcast)', snippet: 'overcast soft light, even diffused illumination, no harsh shadows' },
{ name: '窗户光 (Window Light)', snippet: 'window light, soft directional natural light, Vermeer-like illumination' },
{ name: '霓虹灯 (Neon Lights)', snippet: 'neon lights, colorful artificial lighting, urban night, mixed color temperature' },
{ name: '逆光 (Backlit)', snippet: 'backlit, rim lighting, lens flare, silhouette edges, halo effect' },
{ name: '烛光 (Candlelight)', snippet: 'candlelight, warm orange glow, intimate low light, soft flickering illumination' },
{ name: '轻微过曝 (Overexposed)', snippet: 'slight overexposure, bright airy feel, lifted shadows, dreamy quality' },
{ name: '欠曝暗调 (Underexposed)', snippet: 'underexposed, moody dark tones, deep shadows, dramatic atmosphere' },
{ name: '推冲处理 (Push +1)', snippet: 'push processed +1 stop, increased contrast, more grain, punchier tones' },
```

### 4.4 美学修饰预设 (12种)

```typescript
{ name: '怀旧复古 (Nostalgic)', snippet: 'nostalgic, analog warmth, film photography aesthetic, natural imperfections, light leaks' },
{ name: '梦幻飘渺 (Dreamy)', snippet: 'dreamy, ethereal, soft focus, hazy atmosphere, airy bright feeling' },
{ name: '忧郁深沉 (Melancholic)', snippet: 'melancholic, moody, atmospheric, contemplative, deep shadows, muted tones' },
{ name: '纪实街拍 (Documentary)', snippet: 'documentary style, street photography feel, candid, raw, decisive moment' },
{ name: '亲密私密 (Intimate)', snippet: 'intimate, candid moment, personal atmosphere, close perspective, warm tones' },
{ name: '粗颗粒质感 (Gritty)', snippet: 'coarse grain, gritty dramatic look, raw energy, high contrast, visible film grain' },
{ name: '柔和奶油感 (Creamy)', snippet: 'creamy tones, soft pastel colors, matte finish, low contrast, smooth tonal transitions' },
{ name: '浓郁高对比 (Rich Contrast)', snippet: 'rich blacks, deep shadows, high contrast, saturated colors, punchy tones' },
{ name: '交叉冲洗 (Cross-Process)', snippet: 'cross-processed, unusual color shifts, increased contrast, experimental look, unpredictable tones' },
{ name: '跳漂效果 (Bleach Bypass)', snippet: 'bleach bypass look, desaturated, high contrast, silver-retained, gritty cinematic' },
{ name: '手工冲洗 (Hand-Developed)', snippet: 'hand-developed, organic imperfections, uneven development, artisanal film processing' },
{ name: '漏光与划痕 (Light Leaks)', snippet: 'light leaks, dust and scratches, analog imperfections, vintage degraded film look' },
```

---

## 5. 环境参数系统

### 5.1 参数定义

| 参数 | 英文 | 范围 | 语义 |
|------|------|------|------|
| 大气透视 | atmospheric | 0-100 | 远景的色彩衰减与柔化程度 |
| 空气透视 | aerial | 0-100 | 纵深处的蓝移与明度衰减 |
| 空气雾气/湿度 | humidity | 0-100 | 画面湿润感、光晕与朦胧柔焦 |

### 5.2 智能推荐引擎

```typescript
// services/atmosphereRecommender.ts
// 三层优先级推荐系统

// 层 ①: 关键词命中表（主流胶片手工标注）
const KEYWORD_TABLE = [
  // CineStill 系列
  { keywords: ['cinestill 800t'], rec: { atmospheric: 70, aerial: 55, humidity: 85 } },
  { keywords: ['cinestill 50d'], rec: { atmospheric: 55, aerial: 70, humidity: 60 } },
  
  // Portra 系列
  { keywords: ['portra 160'], rec: { atmospheric: 35, aerial: 40, humidity: 30 } },
  { keywords: ['portra 400'], rec: { atmospheric: 40, aerial: 45, humidity: 40 } },
  { keywords: ['portra 800'], rec: { atmospheric: 55, aerial: 50, humidity: 55 } },
  
  // 反转片
  { keywords: ['velvia 50'], rec: { atmospheric: 20, aerial: 85, humidity: 15 } },
  { keywords: ['velvia 100'], rec: { atmospheric: 25, aerial: 80, humidity: 20 } },
  
  // 黑白高速
  { keywords: ['delta 3200'], rec: { atmospheric: 75, aerial: 35, humidity: 55 } },
  
  // ... 更多胶片
];

// 层 ②: 字段规则公式（基于 ISO / 类型 / 颗粒推导）
function ruleBasedRecommend(iso, filmType, grain, description) {
  // atmospheric: ISO 越高、颗粒越粗 → 值越大
  // aerial: 反转片/日光型 → 偏高；黑白/钨丝 → 偏低
  // humidity: 高 ISO + 电影感 + 钨丝 → 偏高；反转片超细 → 偏低
}

// 层 ③: 兜底默认值
const DEFAULT_ATMOSPHERE = { atmospheric: 50, aerial: 50, humidity: 50 };
```

### 5.3 推荐算法逻辑

```typescript
export function recommendAtmosphere(film: FilmPreset | CustomFilm | null): AtmosphereRecommendation {
  if (!film) return { ...DEFAULT_ATMOSPHERE };

  // 层 ①: 关键词命中
  const haystack = `${film.id} ${film.name} ${film.promptSnippet}`;
  for (const entry of KEYWORD_TABLE) {
    if (hitKeyword(haystack, entry.keywords)) {
      return { ...entry.rec };
    }
  }

  // 层 ②: 字段规则（自定义胶片主路径）
  const custom = film as Partial<CustomFilm>;
  const iso = custom.iso ?? extractIsoFromText(haystack);
  return ruleBasedRecommend(iso, custom.filmType, custom.grain, film.description ?? '');
}
```

### 5.4 典型胶片推荐值

| 胶片 | atmospheric | aerial | humidity | 原因 |
|------|-------------|--------|----------|------|
| CineStill 800T | 70 | 55 | 85 | 钨丝灯红光晕 + 雾化 |
| Portra 400 | 40 | 45 | 40 | 经典人像奶油 |
| Velvia 50 | 20 | 85 | 15 | 风光之王极致通透 |
| Delta 3200 | 75 | 35 | 55 | 推片王粗颗粒 |
| Ektar 100 | 25 | 75 | 20 | 超细颗粒 + 高饱和远景清晰 |

---

## 6. 自定义胶片系统

### 6.1 数据结构

```typescript
// 胶片类型映射
const FILM_TYPE_PROMPT_FRAGMENTS: Record<FilmType, string> = {
  '彩色负片': 'color negative film',
  '黑白': 'black and white film',
  '彩色反转片': 'color reversal slide film',
};

// 颗粒度映射
const GRAIN_PROMPT_FRAGMENTS: Record<FilmGrain, string> = {
  'ultra-fine': 'ultra-fine grain',
  'fine': 'fine grain',
  'medium': 'moderate grain',
  'coarse': 'coarse visible grain',
};

// 颗粒度中文标签
const GRAIN_LABELS: Record<FilmGrain, string> = {
  'ultra-fine': '超细颗粒',
  'fine': '细颗粒',
  'medium': '中等颗粒',
  'coarse': '粗颗粒',
};
```

### 6.2 Prompt 片段生成

```typescript
function buildPromptSnippet(input: CustomFilmInput): string {
  const typeFrag = FILM_TYPE_PROMPT_FRAGMENTS[input.filmType];
  const grainFrag = GRAIN_PROMPT_FRAGMENTS[input.grain];
  // 示例：shot on Kodak MyStock 400, ISO 400, color negative film, fine grain
  return `shot on ${input.brand} ${input.name}, ISO ${input.iso}, ${typeFrag}, ${grainFrag}`;
}
```

### 6.3 持久化 API

```typescript
// 存储 key
const CUSTOM_FILM_STORAGE_KEY = 'moke_custom_films_v1';
const CUSTOM_FILM_MAX = 100; // 数量上限
const CUSTOM_FILM_CATEGORY = '我的自定义';

// 核心 API
export function loadCustomFilms(): CustomFilm[];
export function saveCustomFilms(list: CustomFilm[]): boolean;
export function addCustomFilm(input: CustomFilmInput): CustomFilm;
export function removeCustomFilm(id: string): boolean;
export function isNameTaken(name: string, builtinNames: string[], customNames: string[]): boolean;
export function bulkImportCustomFilms(inputs: CustomFilmInput[], builtinNames: string[]): BulkImportResult;
```

### 6.4 批量导入功能

```typescript
export interface BulkImportResult {
  added: number;           // 实际新增条数
  skippedDuplicate: number;// 因重名跳过的条数
  skippedByLimit: number;  // 因达到上限跳过的条数
  addedFilms: CustomFilm[];// 新增胶片列表
}

// 使用示例
const result = bulkImportCustomFilms(presetTemplates, builtinFilmNames);
console.log(`成功导入 ${result.added} 条，跳过重复 ${result.skippedDuplicate} 条`);
```

---

## 7. Prompt 生成逻辑

### 7.1 完整提示词拼接

```typescript
// FilmSystem.tsx 中的生成逻辑
function generatePromptSnippet(): string {
  const parts: string[] = [];
  
  // 1. 胶片预设
  if (selectedFilm) {
    parts.push(selectedFilm.promptSnippet);
  }
  
  // 2. 相机预设
  if (selectedCamera) {
    parts.push(selectedCamera.snippet);
  }
  
  // 3. 镜头预设
  if (selectedLens) {
    parts.push(selectedLens.snippet);
  }
  
  // 4. 灯光预设
  if (selectedLighting) {
    parts.push(selectedLighting.snippet);
  }
  
  // 5. 美学修饰
  if (selectedAesthetic) {
    parts.push(selectedAesthetic.snippet);
  }
  
  // 6. 环境参数
  const atmosphereFragment = formatAtmospherePromptFragment(atmosphereValues);
  if (atmosphereFragment) {
    parts.push(atmosphereFragment);
  }
  
  return parts.join(', ');
}
```

### 7.2 环境参数片段格式化

```typescript
export function formatAtmospherePromptFragment(values: AtmosphereState): string {
  const parts: string[] = [];
  if (values.atmospheric.enabled)
    parts.push(`atmospheric perspective ${clamp(values.atmospheric.value)}%`);
  if (values.aerial.enabled)
    parts.push(`aerial haze ${clamp(values.aerial.value)}%`);
  if (values.humidity.enabled)
    parts.push(`atmospheric humidity ${clamp(values.humidity.value)}%`);
  return parts.join(', ');
}
```

### 7.3 输出示例

```
输入选择：
- 胶片: Kodak Portra 400
- 相机: Leica M6
- 镜头: 50mm f/1.4
- 灯光: 黄金时段
- 美学: 怀旧复古
- 环境: atmospheric=40%, aerial=45%, humidity=40%

输出 Prompt:
shot on Kodak Portra 400, soft pastel tones, creamy skin tones, natural warm colors, fine film grain, 
Leica M6 rangefinder, precise manual focus, minimalist design, 
50mm f/1.4 lens, natural perspective, shallow depth of field, creamy bokeh, 
golden hour, warm directional sunlight, long shadows, golden warm light, 
nostalgic, analog warmth, film photography aesthetic, natural imperfections, light leaks, 
atmospheric perspective 40%, aerial haze 45%, atmospheric humidity 40%
```

---

## 8. 组件实现参考

### 8.1 主组件结构

```typescript
// FilmSystem.tsx 核心状态
interface FilmSystemState {
  // 预设选择
  selectedFilm: FilmPreset | null;
  selectedCamera: PresetOption | null;
  selectedLens: PresetOption | null;
  selectedLighting: PresetOption | null;
  selectedAesthetic: PresetOption | null;
  
  // 环境参数
  atmosphereValues: AtmosphereState;
  recommendedAtmosphere: AtmosphereRecommendation | null;
  
  // 自定义胶片
  customFilms: CustomFilm[];
  isAddingCustom: boolean;
  
  // UI 状态
  activeTab: 'film' | 'camera' | 'lens' | 'lighting' | 'custom';
}
```

### 8.2 环境参数控制组件

```typescript
// AtmosphereControls.tsx 关键接口
interface AtmosphereControlsProps {
  values: AtmosphereState;
  recommended: AtmosphereRecommendation | null;
  onChange: (next: AtmosphereState) => void;
}

// 功能：
// - 三对 [复选框 + 滑块 + 数值 + 单项重置]
// - "使用胶片推荐" 一键覆盖
// - "全部重置" 禁用所有
```

### 8.3 自定义胶片表单

```typescript
// 表单字段
interface CustomFilmForm {
  brand: string;      // 品牌（如 Kodak）
  name: string;       // 型号（如 MyStock 400）
  iso: number;        // ISO 值（8-12800）
  filmType: FilmType; // 彩色负片 / 黑白 / 彩色反转片
  grain: FilmGrain;   // ultra-fine / fine / medium / coarse
  description?: string;// 可选描述
}

// 验证规则
// - brand 和 name 必填
// - iso 必须在 8-12800 范围内
// - name 不能与内置胶片或其他自定义胶片重名
```

---

## 9. 集成建议

### 9.1 与 WL AI Director 的集成点

| MOKE 功能 | 集成目标模块 | 集成方式 |
|-----------|-------------|----------|
| 胶片预设库 | StageAssets | 新增"胶片风格"资产分类 |
| 相机/镜头预设 | StageAssets | 作为镜头/设备资产 |
| 环境参数 | StageDirector | 在关键帧编辑器中添加三滑块 |
| 自定义胶片 | StageAssets | 用户可保存自定义风格为资产 |
| Prompt 生成 | StagePrompts | 自动拼接摄影风格片段 |

### 9.2 推荐集成顺序

1. **Phase 1**: 移植 `filmData.ts` 数据文件（胶片、相机、镜头、灯光、美学）
2. **Phase 2**: 创建 `FilmStyleSelector` 组件，集成到 StageAssets
3. **Phase 3**: 移植 `atmosphereRecommender.ts` 智能推荐引擎
4. **Phase 4**: 在 StageDirector 的关键帧编辑器中添加环境参数控制
5. **Phase 5**: 集成自定义胶片功能，与 GlobalAssetContext 打通

### 9.3 数据映射建议

```typescript
// 将 FilmPreset 映射为 WL AI Director 的 Asset 类型
interface FilmStyleAsset {
  id: string;
  type: 'film-style';
  name: string;
  category: string;
  metadata: {
    filmPresetId?: string;
    camera?: string;
    lens?: string;
    lighting?: string;
    aesthetic?: string;
    atmosphere?: AtmosphereRecommendation;
  };
  promptSnippet: string; // 可直接拼入提示词
}
```

---

## 10. 附录

### 10.1 文件清单

```
MOKE-Vision-One/
├── data/
│   └── filmData.ts                    # 胶片/相机/镜头/灯光/美学预设数据
├── components/film/
│   ├── FilmSystem.tsx                 # 主组件
│   └── AtmosphereControls.tsx         # 环境参数三滑块组件
├── services/
│   ├── customFilmStore.ts             # 自定义胶片持久化
│   └── atmosphereRecommender.ts       # 环境参数智能推荐
└── types.ts                           # 类型定义
```

### 10.2 依赖要求

```json
{
  "dependencies": {
    "lucide-react": "^0.577.0"      // 图标库（Wind, Mountain, Droplets 等）
  }
}
```

### 10.3 胶片知识速查

| 胶片类型 | 特点 | 适用场景 |
|----------|------|----------|
| 彩色负片 | 宽容度高、色彩自然 | 人像、日常、婚礼 |
| 反转片 | 饱和度高、通透 | 风光、产品 |
| 电影胶片 | 色彩科学专业 | 视频、电影感照片 |
| 黑白胶片 | 影调丰富、艺术感 | 纪实、街头、艺术 |
| 即时成像 | 独特质感、方形画幅 | 复古、创意 |

---

> **文档结束**  
> 如需更详细的代码实现或特定功能说明，请参考原始项目源代码。
