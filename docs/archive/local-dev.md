# 本地开发指南

## 环境要求

- Node.js 18+
- npm 或 yarn
- Vercel CLI (可选，用于本地 Edge Functions 开发)

## 开发环境架构

```
┌─────────────────────────────────────────────────────────────┐
│                        本地开发                              │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Frontend   │    │  Supabase    │    │   Vercel    │ │
│  │  (Vite)     │───▶│   (Cloud)    │    │ (CLI Dev)   │ │
│  │  localhost  │    │  远程云端     │    │ Edge Funcs  │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│        │                                        │           │
│        │                              ┌────────▼────────┐  │
│        │                              │   AI APIs       │  │
│        │                              │ (智谱/OpenAI)   │  │
│        │                              └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd bigbanana-frontend
npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 为 `.env.local`（如果需要）:

```bash
# 已配置的内容
VITE_SUPABASE_URL=https://wgmnizpejtuwvcaqsbvy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_VERCEL_FUNCTION_URL=
```

### 3. 启动前端开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 4. (可选) 本地 Edge Functions 开发

如果需要开发 Edge Functions：

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 启动本地 Edge Functions
vercel dev
```

这会启动：
- 前端: http://localhost:5173
- Edge Functions: http://localhost:54321/functions/v1/

### 5. 配置本地环境变量

创建 `.env.local`:

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_VERCEL_FUNCTION_URL=http://localhost:54321
```

注意：需要先在 Supabase 本地环境运行 `supabase start`

## Supabase 本地开发 (可选)

### 安装 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop install supabase

# Linux
sudo apt install supabase
```

### 启动本地 Supabase

```bash
# 初始化
supabase init

# 启动
supabase start
```

本地服务：
- API: http://localhost:54321
- Studio: http://localhost:54323
- DB: postgresql://postgres:postgres@localhost:54322/postgres

### 推送本地数据库更改

```bash
supabase db push
```

### 生成本地类型

```bash
supabase gen types typescript --local > src/types/supabase.ts
```

## 常见问题

### Q: 前端无法连接 Supabase

A: 检查环境变量是否正确配置，特别是 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

### Q: Edge Functions 调用失败

A: 
1. 确保已配置 `VITE_VERCEL_FUNCTION_URL`
2. 如果是本地开发，确保 `vercel dev` 正在运行
3. 检查浏览器控制台的错误信息

### Q: 如何调试 Edge Functions

A:
```bash
# 启动本地开发环境
vercel dev

# 在 Edge Function 中添加 console.log
# 会在终端输出
```

## 目录结构

```
bigbanana-frontend/
├── src/
│   ├── api/              # API 层
│   │   ├── supabase.ts  # Supabase 客户端
│   │   ├── projects.ts  # 项目 API
│   │   ├── storage.ts   # 存储 API
│   │   └── video.ts    # 视频生成 API
│   │
│   ├── stores/           # 状态管理
│   │   └── authStore.ts # 认证状态
│   │
│   ├── hooks/           # 自定义 Hooks
│   │
│   ├── types/           # 类型定义
│   │   └── supabase/    # Supabase 类型
│   │
│   └── ...
│
├── supabase/
│   └── functions/       # Edge Functions
│       ├── generate-video/
│       ├── webhook-video-complete/
│       └── get-video-status/
│
├── docs/               # 文档
│   ├── supabase-init.sql
│   ├── backend-migration-plan.md
│   ├── deploy.md
│   └── local-dev.md (本文件)
│
├── .env.local          # 本地环境变量
├── vercel.json         # Vercel 配置
└── package.json
```

## 下一步

1. 在 Supabase Dashboard 执行 `docs/supabase-init.sql`
2. 启动开发服务器
3. 注册账号测试
4. 部署到 Vercel
