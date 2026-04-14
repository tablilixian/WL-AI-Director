# WL AI Director UI 风格指南

> 本文档详细记录了当前项目的UI实现方式、设计规范和组件样式，用于后续UI换皮参考。

---

## 一、技术栈概览

### 1.1 核心框架
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.2.0 | UI框架 |
| TypeScript | 5.8.2 | 类型系统 |
| Vite | 6.2.0 | 构建工具 |
| Zustand | 4.5.0 | 状态管理 |

### 1.2 UI相关依赖
| 技术 | 版本 | 用途 |
|------|------|------|
| Tailwind CSS | CDN引入 | 原子化CSS框架 |
| Lucide React | 0.554.0 | 图标库 |
| Inter | Google Fonts | 主字体 |
| JetBrains Mono | Google Fonts | 等宽字体 |

### 1.3 样式实现方式

```
样式架构:
├── index.html (全局样式、CSS变量回退)
├── public/styles/
│   ├── theme-dark.css  (暗色主题变量)
│   └── theme-light.css (亮色主题变量)
├── contexts/ThemeContext.tsx (主题切换逻辑)
└── components/*.tsx (Tailwind + CSS变量混用)
```

**关键特点：**
- 使用CSS变量实现主题切换
- Tailwind CSS通过CDN引入，非本地构建
- 组件样式采用 `className="..."` 内联方式
- CSS变量命名采用语义化命名（如 `--bg-primary` 而非 `--gray-900`）

---

## 二、主题系统

### 2.1 主题切换机制

```tsx
// ThemeContext.tsx
// 主题存储在 localStorage，key: 'bigbanana_theme'
// 通过 data-theme 属性切换主题
document.documentElement.setAttribute('data-theme', theme);
```

### 2.2 暗色主题 (Dark Theme)

**基础背景色：**
```css
--bg-base: #050505;        /* 页面底层背景 */
--bg-primary: #0A0A0A;     /* 主要背景 */
--bg-secondary: #121212;   /* 次要背景 */
--bg-surface: #141414;     /* 表面/卡片背景 */
--bg-elevated: #1A1A1A;    /* 抬起元素背景 */
--bg-deep: #0F0F0F;        /* 深层背景 */
--bg-sunken: #080808;      /* 下沉背景 */
--bg-hover: #27272a;       /* 悬停状态背景 */
```

**边框色：**
```css
--border-primary: #27272a;    /* 主边框 */
--border-secondary: #3f3f46;  /* 次边框 */
--border-subtle: #18181b;     /* 微妙边框 */
```

**文字色：**
```css
--text-primary: #ffffff;     /* 主文字 */
--text-secondary: #d4d4d8;   /* 次要文字 */
--text-tertiary: #a1a1aa;    /* 三级文字 */
--text-muted: #71717a;       /* 弱化文字 */
```

**强调色 (Accent - 紫色调)：**
```css
--accent: #818cf8;                    /* 主强调色 */
--accent-hover: #6366f1;              /* 悬停状态 */
--accent-muted: #6366f1;              /* 柔和强调 */
--accent-bg: rgba(99, 102, 241, 0.15);  /* 强调背景 */
--accent-bg-hover: rgba(99, 102, 241, 0.25);
--accent-border: rgba(99, 102, 241, 0.3);
--accent-text: #a5b4fc;               /* 强调文字 */
```

**状态色：**
```css
/* 成功 */
--success: #34d399;
--success-bg: rgba(52, 211, 153, 0.1);
--success-border: rgba(52, 211, 153, 0.3);

/* 错误 */
--error: #f87171;
--error-bg: rgba(248, 113, 113, 0.1);
--error-border: rgba(248, 113, 113, 0.3);

/* 警告 */
--warning: #fbbf24;
--warning-bg: rgba(251, 191, 36, 0.1);
--warning-border: rgba(251, 191, 36, 0.3);

/* 信息 */
--info: #60a5fa;
--info-bg: rgba(96, 165, 250, 0.1);
--info-border: rgba(96, 165, 250, 0.3);
```

### 2.3 亮色主题 (Light Theme - Claude风格)

**基础背景色：**
```css
--bg-base: #F7F5F0;        /* 页面底层背景 - 暖白 */
--bg-primary: #FFFFFF;     /* 主要背景 */
--bg-secondary: #FAF9F7;   /* 次要背景 */
--bg-surface: #FFFFFF;     /* 表面/卡片背景 */
--bg-elevated: #F5F3EE;    /* 抬起元素背景 */
--bg-deep: #F0EDE8;        /* 深层背景 */
--bg-sunken: #F9F7F4;      /* 下沉背景 */
--bg-hover: #E5E0DA;       /* 悬停状态背景 */
```

**边框色：**
```css
--border-primary: #E5E0DA;    /* 主边框 */
--border-secondary: #D1CDC6;  /* 次边框 */
--border-subtle: #EDE9E3;     /* 微妙边框 */
```

**文字色：**
```css
--text-primary: #1A1816;     /* 主文字 - 深棕黑 */
--text-secondary: #44413D;   /* 次要文字 */
--text-tertiary: #6B6862;    /* 三级文字 */
--text-muted: #8A8680;       /* 弱化文字 */
```

**强调色 (Accent - 暖棕/琥珀色调)：**
```css
--accent: #B5936B;                      /* 主强调色 */
--accent-hover: #A07D57;                /* 悬停状态 */
--accent-bg: rgba(181, 147, 107, 0.12); /* 强调背景 */
--accent-border: rgba(181, 147, 107, 0.35);
--accent-text: #8B6E4E;                 /* 强调文字 */
```

### 2.4 通用变量

**按钮样式：**
```css
--btn-primary-bg: #ffffff (dark) / #1A1816 (light);
--btn-primary-text: #000000 (dark) / #ffffff (light);
--btn-primary-hover: #e4e4e7 (dark) / #2D2A26 (light);
```

**遮罩层：**
```css
--overlay-heavy: rgba(0, 0, 0, 0.8);
--overlay-medium: rgba(0, 0, 0, 0.6);
--overlay-light: rgba(0, 0, 0, 0.3);
--overlay-full: rgba(0, 0, 0, 0.95);
```

**毛玻璃效果：**
```css
--glass-bg: rgba(20, 20, 20, 0.6) (dark) / rgba(255, 255, 255, 0.75) (light);
--glass-border: rgba(255, 255, 255, 0.08) (dark) / rgba(26, 24, 22, 0.08) (light);
```

---

## 三、组件样式规范

### 3.1 按钮样式

#### 主按钮 (Primary Button)
```tsx
// 暗色主题：白底黑字
// 亮色主题：黑底白字
<button className="px-6 py-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)] transition-colors">
  新建项目
</button>
```

#### 次要按钮 (Secondary Button)
```tsx
<button className="px-4 py-3 border border-[var(--border-primary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-secondary)] transition-colors">
  帮助
</button>
```

#### 强调按钮 (Accent Button)
```tsx
<button className="py-3 bg-[var(--accent)] text-[var(--text-primary)] font-bold hover:bg-[var(--accent-hover)] transition-colors">
  验证并保存
</button>
```

#### 危险按钮 (Danger Button)
```tsx
<button className="py-3 bg-[var(--error-hover-bg)] hover:bg-[var(--error-hover-bg-strong)] text-[var(--error-text)] border border-[var(--error-border)]">
  永久删除
</button>
```

### 3.2 卡片样式

#### 基础卡片
```tsx
<div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--border-secondary)] p-6 transition-all">
  {/* 卡片内容 */}
</div>
```

#### 圆角卡片
```tsx
<div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
  {/* 卡片内容 */}
</div>
```

#### 悬浮卡片 (带阴影)
```tsx
<div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl shadow-lg hover:shadow-xl transition-all">
  {/* 卡片内容 */}
</div>
```

### 3.3 输入框样式

#### 文本输入
```tsx
<input
  type="text"
  className="w-full bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] px-4 py-3 text-sm rounded-lg focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-hover)] transition-all"
  placeholder="请输入..."
/>
```

#### 密码输入
```tsx
<input
  type="password"
  className="w-full bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] px-4 py-3 text-sm rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono placeholder:text-[var(--text-muted)]"
/>
```

#### 下拉选择
```tsx
<div className="relative">
  <select className="w-full bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] px-4 py-3 text-sm rounded-lg focus:border-[var(--accent)] focus:outline-none appearance-none cursor-pointer">
    <option value="">请选择</option>
  </select>
  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
</div>
```

### 3.4 标签样式

#### 状态标签
```tsx
<span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 uppercase tracking-wider">
  剧本阶段
</span>
```

#### 徽章标签
```tsx
<span className="px-2 py-1 bg-[var(--success)] text-[var(--text-primary)] rounded-full text-[9px] font-bold uppercase">
  VIDEO
</span>
```

#### 强调标签
```tsx
<span className="text-[10px] text-[var(--accent-text)] bg-[var(--accent-bg)] px-2 py-0.5 rounded">
  推荐
</span>
```

### 3.5 模态框样式

#### 遮罩层
```tsx
<div className="fixed inset-0 z-[9999] bg-[var(--bg-base)]/80 backdrop-blur-sm flex items-center justify-center p-4">
  {/* 模态内容 */}
</div>
```

#### 模态框主体
```tsx
<div className="bg-[var(--bg-elevated)] border border-[var(--border-secondary)] rounded-xl p-6 max-w-sm w-full shadow-2xl">
  {/* 模态内容 */}
</div>
```

### 3.6 侧边栏样式

```tsx
<aside className="w-72 bg-[var(--bg-base)] border-r border-[var(--border-primary)] h-screen fixed left-0 top-0 flex flex-col z-50">
  {/* Header */}
  <div className="p-6 border-b border-[var(--border-subtle)]">
    {/* Logo & User Info */}
  </div>
  
  {/* Navigation */}
  <nav className="flex-1 py-6 space-y-1">
    {/* Nav Items */}
  </nav>
  
  {/* Footer */}
  <div className="p-6 border-t border-[var(--border-subtle)]">
    {/* Theme Toggle & Settings */}
  </div>
</aside>
```

---

## 四、布局规范

### 4.1 页面布局

#### Dashboard 布局
```tsx
<div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-secondary)] p-8 md:p-12">
  <div className="max-w-7xl mx-auto">
    <header className="mb-16 border-b border-[var(--border-subtle)] pb-8">
      {/* 页面标题和操作按钮 */}
    </header>
    
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {/* 项目卡片网格 */}
    </div>
  </div>
</div>
```

#### 主工作区布局
```tsx
<div className="flex h-screen">
  {/* 侧边栏 - 固定宽度 288px (w-72) */}
  <Sidebar />
  
  {/* 主内容区 */}
  <main className="flex-1 ml-72 overflow-hidden">
    {/* 工作区内容 */}
  </main>
</div>
```

### 4.2 间距规范

| 用途 | Tailwind Class | 实际值 |
|------|---------------|--------|
| 页面内边距 | p-8 / p-12 | 32px / 48px |
| 卡片内边距 | p-4 / p-6 | 16px / 24px |
| 元素间距 | gap-2 / gap-3 / gap-4 | 8px / 12px / 16px |
| 区块间距 | space-y-4 / space-y-6 | 16px / 24px |
| 按钮内边距 | px-4 py-3 / px-6 py-3 | 16px 12px / 24px 12px |

### 4.3 圆角规范

| 用途 | Tailwind Class | 实际值 |
|------|---------------|--------|
| 小圆角 | rounded | 4px |
| 中圆角 | rounded-lg | 8px |
| 大圆角 | rounded-xl | 12px |
| 全圆角 | rounded-full | 50% |

### 4.4 阴影规范

```css
/* 卡片悬浮 */
shadow-lg

/* 模态框 */
shadow-2xl

/* 按钮点击 */
shadow-inner
```

---

## 五、排版规范

### 5.1 字体家族

```css
/* 主字体 */
font-family: 'Inter', sans-serif;

/* 等宽字体 */
font-family: 'JetBrains Mono', monospace;
```

### 5.2 字号规范

| 用途 | Tailwind Class | 实际值 |
|------|---------------|--------|
| 极小标签 | text-[9px] | 9px |
| 小标签 | text-[10px] | 10px |
| 辅助文字 | text-xs | 12px |
| 正文 | text-sm | 14px |
| 小标题 | text-base | 16px |
| 标题 | text-lg | 18px |
| 大标题 | text-xl | 20px |
| 页面标题 | text-3xl | 30px |

### 5.3 字重规范

| 用途 | Tailwind Class |
|------|---------------|
| 轻字重 | font-light (300) |
| 正常 | font-normal (400) |
| 中等 | font-medium (500) |
| 粗体 | font-bold (700) |

### 5.4 字间距

| 用途 | Tailwind Class | 实际值 |
|------|---------------|--------|
| 紧凑 | tracking-tight | -0.025em |
| 正常 | tracking-normal | 0 |
| 宽松 | tracking-wide | 0.025em |
| 更宽 | tracking-wider | 0.05em |
| 最宽 | tracking-widest | 0.1em |

---

## 六、交互与动画

### 6.1 过渡动画

```tsx
// 颜色过渡
className="transition-colors"

// 全属性过渡
className="transition-all"

// 指定时长
className="transition-all duration-200"
className="transition-all duration-700"
```

### 6.2 悬停效果

```tsx
// 背景变化
className="hover:bg-[var(--bg-hover)]"

// 边框变化
className="hover:border-[var(--border-secondary)]"

// 文字颜色变化
className="hover:text-[var(--text-primary)]"

// 缩放效果
className="hover:scale-105"
className="group-hover:scale-110"

// 透明度变化
className="opacity-0 group-hover:opacity-100"
```

### 6.3 加载状态

```tsx
// 旋转加载图标
<Loader2 className="w-4 h-4 animate-spin" />

// 脉冲动画
<Sparkles className="animate-pulse" />
```

### 6.4 禁用状态

```tsx
className="disabled:opacity-50 disabled:cursor-not-allowed"
```

---

## 七、图标使用规范

### 7.1 图标库

使用 Lucide React 图标库，统一导入方式：

```tsx
import { 
  FileText, Users, Clapperboard, Film, 
  ChevronLeft, ListTree, HelpCircle, Cpu, 
  Sun, Moon, Loader2, LogOut, User, PenTool,
  Plus, Trash2, Folder, Calendar, AlertTriangle,
  Check, Edit2, Settings, X, AlertCircle, CheckCircle, Info
} from 'lucide-react';
```

### 7.2 图标尺寸

| 用途 | Tailwind Class | 实际值 |
|------|---------------|--------|
| 极小 | w-2.5 h-2.5 | 10px |
| 小 | w-3 h-3 / w-4 h-4 | 12px / 16px |
| 中 | w-5 h-5 / w-6 h-6 | 20px / 24px |
| 大 | w-8 h-8 | 32px |

### 7.3 图标颜色

```tsx
// 跟随文字颜色
className="text-[var(--text-tertiary)]"

// 强调色
className="text-[var(--accent)]"

// 状态色
className="text-[var(--success)]"
className="text-[var(--error)]"
className="text-[var(--warning)]"
```

---

## 八、滚动条样式

```css
/* Sony Style Scrollbar - 细长矩形 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 0px;  /* 直角，非圆角 */
}

::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}
```

---

## 九、特殊组件

### 9.1 毛玻璃面板

```tsx
<div className="glass-panel">
  {/* 内容 */}
</div>

/* CSS定义 */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
}
```

### 9.2 折扣广告卡片

```tsx
<div className="bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-xl p-5">
  <div className="flex items-start gap-4">
    <div className="w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center">
      <Gift className="w-6 h-6 text-[var(--text-primary)]" />
    </div>
    <div className="flex-1">
      <h3 className="text-base font-bold text-[var(--text-primary)]">
        推荐使用 BigBanana API
      </h3>
      <p className="text-xs text-[var(--text-tertiary)]">
        描述文字...
      </p>
    </div>
  </div>
</div>
```

### 9.3 导航锁定提示

```tsx
<div className="mx-4 mt-4 px-3 py-2.5 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30">
  <div className="flex items-center gap-2">
    <Loader2 className="w-3.5 h-3.5 text-[var(--warning)] animate-spin" />
    <span className="text-[10px] font-medium text-[var(--warning)] uppercase tracking-wide">
      生成任务进行中
    </span>
  </div>
  <p className="text-[10px] text-[var(--text-muted)] mt-1">
    切换页面将导致数据丢失
  </p>
</div>
```

---

## 十、当前UI问题与改进建议

### 10.1 发现的问题

#### 1. 样式不一致
- **问题**：部分组件使用硬编码颜色值，部分使用CSS变量
- **示例**：Toast组件使用 `bg-black/80` 而非CSS变量
- **建议**：统一使用CSS变量，便于主题切换

#### 2. 字体大小过于细碎
- **问题**：存在 `text-[9px]`、`text-[10px]` 等非标准字号
- **影响**：可读性差，不符合设计规范
- **建议**：统一使用 Tailwind 标准字号 (xs, sm, base, lg等)

#### 3. 圆角不统一
- **问题**：部分使用 `rounded`，部分使用 `rounded-lg`，部分使用 `rounded-xl`
- **建议**：制定圆角使用规范，按组件类型统一

#### 4. 间距不规范
- **问题**：存在 `p-1.5`、`px-1.5`、`py-0.5` 等非标准间距
- **建议**：使用标准间距值 (2, 4, 6, 8, 12, 16, 24等)

#### 5. 过度使用内联样式
- **问题**：所有样式都写在 className 中，难以维护
- **建议**：考虑提取公共样式为CSS类或组件

#### 6. 动画效果缺失
- **问题**：页面切换、模态框弹出等缺乏过渡动画
- **建议**：添加 `animate-in fade-in zoom-in` 等动画类

#### 7. 响应式设计不足
- **问题**：主要针对桌面设计，移动端仅显示提示
- **建议**：考虑平板适配或响应式布局

### 10.2 改进建议

#### 短期改进（换皮可解决）
1. 统一颜色变量使用
2. 规范字号和间距
3. 统一圆角规范
4. 添加过渡动画

#### 中期改进
1. 提取公共样式组件
2. 建立设计Token系统
3. 完善响应式设计

#### 长期改进
1. 迁移到本地构建的Tailwind
2. 建立组件库文档
3. 实现主题编辑器

---

## 十一、组件清单

### 11.1 页面级组件

| 组件 | 路径 | 说明 |
|------|------|------|
| Dashboard | components/Dashboard.tsx | 项目列表页 |
| Sidebar | components/Sidebar.tsx | 侧边导航栏 |
| StageScript | components/StageScript/ | 剧本编辑阶段 |
| StageAssets | components/StageAssets/ | 角色场景阶段 |
| StageDirector | components/StageDirector/ | 导演工作台 |
| StageExport | components/StageExport/ | 导出阶段 |
| StagePrompts | components/StagePrompts/ | 提示词管理 |
| StageCanvas | components/StageCanvas.tsx | 创意画布 |

### 11.2 通用组件

| 组件 | 路径 | 说明 |
|------|------|------|
| GlobalAlert | components/GlobalAlert.tsx | 全局提示框 |
| ModelConfig | components/ModelConfig/ | 模型配置弹窗 |
| Onboarding | components/Onboarding/ | 新手引导 |
| AspectRatioSelector | components/AspectRatioSelector.tsx | 宽高比选择器 |
| ModelSelector | components/ModelSelector.tsx | 模型选择器 |

### 11.3 业务组件

| 组件 | 路径 | 说明 |
|------|------|------|
| CharacterCard | components/StageAssets/CharacterCard.tsx | 角色卡片 |
| SceneCard | components/StageAssets/SceneCard.tsx | 场景卡片 |
| PropCard | components/StageAssets/PropCard.tsx | 道具卡片 |
| ShotCard | components/StageDirector/ShotCard.tsx | 镜头卡片 |
| KeyframeEditor | components/StageDirector/KeyframeEditor.tsx | 关键帧编辑器 |
| VideoGenerator | components/StageDirector/VideoGenerator.tsx | 视频生成器 |

---

## 十二、换皮实施建议

### 12.1 换皮步骤

1. **备份当前主题文件**
   - `public/styles/theme-dark.css`
   - `public/styles/theme-light.css`

2. **修改CSS变量**
   - 调整颜色值
   - 保持变量名称不变

3. **检查硬编码颜色**
   - 搜索 `#` 开头的颜色值
   - 搜索 `rgb`、`rgba` 函数
   - 替换为CSS变量

4. **测试主题切换**
   - 测试暗色主题
   - 测试亮色主题
   - 测试切换过程

### 12.2 需要关注的文件

```
需要检查硬编码颜色的文件：
├── components/Dashboard.tsx
├── components/Sidebar.tsx
├── components/StageScript/index.tsx
├── components/StageAssets/*.tsx
├── components/StageDirector/*.tsx
├── components/StageExport/*.tsx
├── components/GlobalAlert.tsx
└── index.html (全局样式)
```

### 12.3 推荐的设计方向

#### 专业工具风格
- 参考：Figma、Notion、Linear
- 特点：简洁、高效、专业
- 配色：中性色为主，强调色点缀

#### 创意工具风格
- 参考：Canva、Framer
- 特点：活泼、现代、有活力
- 配色：渐变、饱和度较高

#### 影视专业风格
- 参考：DaVinci Resolve、Premiere Pro
- 特点：深色为主、专业感强
- 配色：深灰/黑色背景，橙色/蓝色强调

---

*文档版本：1.0*
*最后更新：2026-04-13*
*维护者：WL Team*
