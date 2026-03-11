# WL AI Director - 前后端分离开发计划

## 一、项目概述

### 1.1 现状
- 纯前端项目（React + Vite + TypeScript）
- 数据存储在浏览器 IndexedDB
- API Key 存储在 localStorage
- 视频生成通过 Vite 代理调用第三方 AI API
- 单用户本地使用

### 1.2 目标
- 改造为前后端分离架构
- 支持多用户（注册/登录）
- 数据持久化到云端
- 支持本地开发
- 支持一键部署上线

### 1.3 技术选型

| 模块 | 技术方案 | 说明 |
|------|---------|------|
| 前端框架 | React 19 + Vite + TypeScript | 保持现有技术栈 |
| 数据库 | Supabase PostgreSQL | 云端关系型数据库 |
| 用户认证 | Supabase Auth | 邮箱/OAuth 登录 |
| 文件存储 | Supabase Storage | 对象存储（支持 R2 兼容） |
| Serverless | Supabase Edge Functions | AI 代理、轻量后端逻辑 |
| 外部托管 | Vercel | 托管 Edge Functions + Webhook |
| AI API | 智谱/OpenAI/Veo | 视频生成服务 |

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Vercel (Frontend)                          │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │   React App     │    │  Edge Functions │                     │
│  │  (静态托管)      │    │  (AI 代理/Webhook) │                 │
│  └────────┬────────┘    └────────┬────────┘                     │
│           │                       │                              │
└───────────┼───────────────────────┼──────────────────────────────┘
            │                       │
            │ HTTPS (REST)          │ Webhook
            ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase Cloud                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ PostgreSQL  │  │   Storage   │  │    Auth     │             │
│  │  (数据库)    │  │  (文件存储)  │  │  (用户认证)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
            │
            │ API 调用
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       第三方 AI 服务                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  智谱 BigModel │  │   OpenAI   │  │   Google   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户操作 ──▶ 前端 ──▶ Supabase API ──▶ PostgreSQL
                  │
                  ├─▶ Supabase Storage (图片/视频)
                  │
                  └─▶ Edge Functions ──▶ AI API
                              │
                              └─▶ Webhook ──▶ 更新状态
```

---

## 三、数据库设计

### 3.1 表结构

```sql
-- 用户表 (扩展 Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    api_key TEXT, -- 用户自己的 AI API Key（加密存储）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 项目表
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft', -- draft, processing, completed
    settings JSONB DEFAULT '{}', -- 项目设置
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 剧本/分镜表
CREATE TABLE public.scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT, -- 剧本内容
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 镜头表
CREATE TABLE public.shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
    shot_number INTEGER NOT NULL,
    description TEXT,
    camera_movement TEXT,
    start_frame_url TEXT, -- 起始帧图片 URL
    end_frame_url TEXT,   -- 结束帧图片 URL
    video_url TEXT,       -- 生成的视频 URL
    video_status TEXT,    -- pending, generating, completed, failed
    video_task_id TEXT,   -- AI 任务 ID
    prompt TEXT,          -- 视频生成提示词
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 角色表
CREATE TABLE public.characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    reference_images JSONB DEFAULT '[]', -- 参考图 URL 数组
    variants JSONB DEFAULT '[]', -- 变体图
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 场景表
CREATE TABLE public.scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    reference_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 视频生成任务表 (用于追踪异步任务)
CREATE TABLE public.video_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL, -- AI 服务商的任务 ID
    provider TEXT NOT NULL, -- bigmodel, openai, google
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    result_url TEXT, -- 生成的视频 URL
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### 3.2 RLS 策略 (行级安全)

```sql
-- 启用 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_tasks ENABLE ROW LEVEL SECURITY;

-- profiles: 用户只能查看自己的
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- projects: 用户只能操作自己的项目
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- 其他表类似...
```

### 3.3 存储桶配置

```sql
-- 创建存储桶
INSERT INTO storage.buckets (id, name, public) VALUES
    ('avatars', 'avatars', true),
    ('projects', 'projects', true),
    ('videos', 'videos', true);

-- 存储策略
CREATE POLICY "Avatar upload for authenticated users"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Project files upload for authenticated users"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'projects' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Videos upload for authenticated users"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = ' auth.uid()::videos' ANDtext = (storage.foldername(name))[1]);
```

---

## 四、前端改造计划

### 4.1 项目结构

```
bigbanana-frontend/
├── src/
│   ├── api/                    # API 层
│   │   ├── supabase.ts         # Supabase 客户端
│   │   ├── auth.ts             # 认证相关
│   │   ├── projects.ts         # 项目 API
│   │   ├── scripts.ts          # 剧本 API
│   │   ├── shots.ts            # 镜头 API
│   │   └── video.ts            # 视频生成 API
│   │
│   ├── components/             # 保持现有组件
│   │   └── ...
│   │
│   ├── stores/                 # 状态管理
│   │   ├── authStore.ts       # 认证状态
│   │   ├── projectStore.ts    # 项目状态
│   │   └── ...
│   │
│   ├── hooks/                  # 自定义 Hooks
│   │   ├── useAuth.ts         # 认证 Hook
│   │   ├── useProject.ts      # 项目 Hook
│   │   └── useVideo.ts        # 视频生成 Hook
│   │
│   ├── pages/
│   │   ├── Login.tsx           # 登录页
│   │   ├── Register.tsx        # 注册页
│   │   ├── Dashboard.tsx      # 用户仪表板
│   │   └── ...
│   │
│   ├── types/
│   │   └── supabase.ts        # 数据库类型定义
│   │
│   └── App.tsx                # 路由 + 认证状态
│
├── .env.local                 # 开发环境变量
├── .env.production           # 生产环境变量
└── vercel.json               # Vercel 配置
```

### 4.2 核心模块改造

#### 4.2.1 Supabase 客户端

```typescript
// src/api/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 获取带认证的客户端
export const getSupabaseClient = (accessToken: string) => 
  createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  })
```

#### 4.2.2 认证状态管理

```typescript
// src/stores/authStore.ts
import { create } from 'zustand'
import { supabase } from '../api/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  
  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })
    
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })
  },
  
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
    set({ session: data.session, user: data.user })
  },
  
  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    // 自动登录
    if (data.session) {
      set({ session: data.session, user: data.user })
    }
  },
  
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  }
}))
```

#### 4.2.3 数据存取层

```typescript
// src/api/projects.ts
import { supabase } from './supabase'
import type { Database } from '../types/supabase'

type Project = Database['public']['Tables']['projects']['Row']

export const projectApi = {
  // 获取用户所有项目
  list: async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data
  },
  
  // 获取单个项目（含关联数据）
  get: async (id: string) => {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        scripts(*, shots(*, characters(*), scenes(*)))
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },
  
  // 创建项目
  create: async (title: string, description?: string) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ title, description })
      .select()
      .single()
    if (error) throw error
    return data
  },
  
  // 更新项目
  update: async (id: string, updates: Partial<Project>) => {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
  
  // 删除项目
  delete: async (id: string) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}
```

#### 4.2.4 文件上传

```typescript
.ts
import {// src/api/storage supabase } from './supabase'

export const storageApi = {
  // 上传图片
  uploadImage: async (userId: string, file: File, path: string) => {
    const filePath = `users/${userId}/${path}/${file.name}`
    const { data, error } = await supabase.storage
      .from('projects')
      .upload(filePath, file, { upsert: true })
    if (error) throw error
    
    // 获取公开 URL
    const { data: { publicUrl } } = supabase.storage
      .from('projects')
      .getPublicUrl(filePath)
    
    return publicUrl
  },
  
  // 上传视频
  uploadVideo: async (userId: string, file: File, shotId: string) => {
    const filePath = `users/${userId}/videos/${shotId}/${file.name}`
    const { data, error } = await supabase.storage
      .from('videos')
      .upload(filePath, file, { upsert: true })
    if (error) throw error
    
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath)
    
    return publicUrl
  },
  
  // 删除文件
  delete: async (path: string, bucket: string = 'projects') => {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path])
    if (error) throw error
  }
}
```

---

## 五、Edge Functions 开发

### 5.1 函数列表

| 函数名 | 用途 | 触发方式 |
|--------|------|---------|
| `generate-video` | 发起视频生成请求 | 前端调用 |
| `get-video-status` | 查询视频生成状态 | 前端轮询 |
| `webhook-video-complete` | AI 服务回调处理 | AI 服务 Webhook |
| `get-user-api-key` | 获取用户配置的 API Key | 内部调用 |

### 5.2 generate-video 函数

```typescript
// supabase/functions/generate-video/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 验证用户
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // 从请求获取用户
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // 获取用户的 API Key
  const { data: profile } = await supabase
    .from('profiles')
    .select('api_key')
    .eq('id', user.id)
    .single()
  
  const userApiKey = profile?.api_key
  if (!userApiKey) {
    return new Response('API Key not configured', { status: 400 })
  }
  
  // 获取请求参数
  const { shotId, model, prompt, startFrameUrl, endFrameUrl } = await req.json()
  
  // 调用智谱 API
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/videos/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      image_url: startFrameUrl,
      ...(endFrameUrl && { end_image_url: endFrameUrl })
    })
  })
  
  const result = await response.json()
  
  if (result.task_id) {
    // 保存任务到数据库
    await supabase.from('video_tasks').insert({
      shot_id: shotId,
      task_id: result.task_id,
      provider: 'bigmodel',
      model,
      status: 'processing'
    })
    
    // 更新镜头状态
    await supabase.from('shots').update({
      video_status: 'generating',
      video_task_id: result.task_id
    }).eq('id', shotId)
  }
  
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### 5.3 webhook-video-complete 函数

```typescript
// supabase/functions/webhook-video-complete/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 验证 Webhook 签名
  const signature = req.headers.get('x-webhook-signature')
  if (!signature || !validateSignature(signature)) {
    return new Response('Invalid signature', { status: 401 })
  }
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  const { task_id, status, video_url } = await req.json()
  
  // 查询任务
  const { data: task } = await supabase
    .from('video_tasks')
    .select('*')
    .eq('task_id', task_id)
    .single()
  
  if (!task) {
    return new Response('Task not found', { status: 404 })
  }
  
  // 更新任务状态
  await supabase.from('video_tasks').update({
    status: status === 'SUCCEEDED' ? 'completed' : 'failed',
    result_url: video_url,
    completed_at: new Date().toISOString()
  }).eq('task_id', task_id)
  
  // 更新镜头
  await supabase.from('shots').update({
    video_status: status === 'SUCCEEDED' ? 'completed' : 'failed',
    video_url: video_url
  }).eq('id', task.shot_id)
  
  return new Response('OK')
})
```

---

## 六、本地开发环境

### 6.1 开发架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        本地开发环境                               │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │  Frontend    │   │  Supabase    │   │   Vercel     │        │
│  │  (Vite)      │──▶│  (Cloud)     │   │  (CLI 本地)  │        │
│  │  localhost   │   │  远程云端     │   │  Edge Funcs  │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│        │                                      │                  │
│        │                                      │ 本地模拟        │
│        │                              ┌───────▼───────┐         │
│        │                              │  AI API Mock   │         │
│        │                              │  (可选)        │         │
│        │                              └───────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 环境变量

```bash
# .env.local (前端开发)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# .env (Vercel CLI 本地)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BIGMODEL_API_KEY=your-api-key  # 测试用
```

### 6.3 开发流程

```bash
# 1. 前端开发
cd bigbanana-frontend
npm install
npm run dev  # http://localhost:3000

# 2. Edge Functions 本地开发 (需要 Vercel CLI)
npm i -g vercel
vercel dev   # 本地运行 Edge Functions

# 3. Supabase 本地开发 (可选)
# 如果需要本地数据库
supabase start
# 或者直接使用云端开发
```

---

## 七、线上部署

### 7.1 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         生产环境                                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Vercel (全球 CDN)                       ││
│  │  ┌─────────────────┐    ┌─────────────────────────────┐   ││
│  │  │   Frontend      │    │   Edge Functions            │   ││
│  │  │   (静态托管)     │    │   - generate-video          │   ││
│  │  │                 │    │   - webhook-video-complete  │   ││
│  │  └─────────────────┘    └─────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              │ HTTPS                             │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Supabase Cloud                            ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     ││
│  │  │PostgreSQL│  │ Storage  │  │  Auth   │  │ Realtime │     ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 部署步骤

#### 第一步：部署前端到 Vercel

```bash
# 1. 推送代码到 GitHub
git add .
git commit -m "feat: 前后端分离改造"
git push origin main

# 2. Vercel 导入
# 访问 https://vercel.com/new 选择 GitHub 仓库

# 3. 配置环境变量
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 4. 部署
```

#### 第二步：部署 Edge Functions

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 链接项目
cd bigbanana-frontend
vercel link

# 4. 部署函数
vercel deploy --prod --prod

# 或者单独部署函数
vercel deploy supabase/functions/generate-video --prod
```

#### 第三步：配置 Webhook

```bash
# 在智谱开放平台配置 Webhook
# URL: https://your-project.vercel.app/functions/v1/webhook-video-complete

# 在 Vercel Dashboard 设置环境变量
SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 7.3 一键部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

ENV=$1
PROJECT_NAME="bigbanana"

if [ "$ENV" = "prod" ]; then
    echo "Deploying to production..."
    VERCEL_ENV=production
else
    echo "Deploying to development..."
    VERCEL_ENV=development
fi

# 1. 构建前端
echo "Building frontend..."
cd bigbanana-frontend
npm run build

# 2. 部署前端
echo "Deploying frontend..."
vercel --prod --yes --env VITE_SUPABASE_URL=$VITE_SUPABASE_URL --env VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# 3. 部署 Edge Functions
echo "Deploying Edge Functions..."
cd ../supabase/functions
for dir in */; do
    func_name=$(basename "$dir")
    echo "Deploying $func_name..."
    vercel deploy ./$func_name --prod --yes
done

echo "Deployment completed!"
echo "Frontend: https://$PROJECT_NAME.vercel.app"
```

---

## 八、开发里程碑

### Phase 1: 基础架构 (第 1 周)

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| 创建 Supabase 项目 | 注册、配置 | 2h |
| 设计数据库表 | SQL 脚本 | 4h |
| 配置 RLS 策略 | 安全策略 | 2h |
| 配置存储桶 | 文件存储 | 2h |
| **小计** | | **10h** |

### Phase 2: 用户认证 (第 2 周)

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| 登录页面 | React 登录组件 | 4h |
| 注册页面 | React 注册组件 | 4h |
| 密码重置 | 找回密码流程 | 2h |
| 认证状态管理 | Zustand store | 4h |
| 个人资料页面 | 用户设置 | 4h |
| **小计** | | **18h** |

### Phase 3: 核心功能改造 (第 3-4 周)

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| 项目 CRUD | 增删改查 | 8h |
| 剧本管理 | 剧本编辑 | 8h |
| 镜头管理 | 镜头 CRUD | 8h |
| 角色/场景管理 | 资源管理 | 8h |
| 文件上传 | 图片/视频上传 | 8h |
| **小计** | | **40h** |

### Phase 4: AI 集成 (第 5 周)

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| Edge Function 开发 | AI 代理 | 16h |
| Webhook 处理 | 回调处理 | 8h |
| 状态轮询 | 前端轮询 | 4h |
| 错误处理 | 异常处理 | 4h |
| **小计** | | **32h** |

### Phase 5: 部署与测试 (第 6 周)

| 任务 | 描述 | 预计工时 |
|------|------|---------|
| Vercel 部署 | 前端部署 | 4h |
| Edge Functions 部署 | 函数部署 | 4h |
| 域名配置 | 自定义域名 | 2h |
| 集成测试 | 整体测试 | 8h |
| Bug 修复 | 修复问题 | 8h |
| **小计** | | **26h** |

---

## 九、预算估算

### 9.1 初期成本 (首年)

| 服务 | 免费额度 | 超出费用 |
|------|---------|---------|
| Supabase Free | 500MB 数据库 + 1GB 存储 | $25/500GB |
| Vercel Pro | 100GB 带宽 | $20/月 (可选) |
| 智谱 API | 按量 | 用户自理 |
| 域名 | ~$10/年 | - |

**预计首年成本**: $0 - $250（取决于用户量）

### 9.2 扩展阶段

| 规模 | 预计月成本 |
|------|-----------|
| 100 用户 | $0 - $50 |
| 1000 用户 | $50 - $200 |
| 10000 用户 | $200 - $500 |

---

## 十、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Supabase 免费额度用完 | 服务中断 | 提前监控，及时升级 |
| Edge Functions 超时 | 视频生成失败 | 拆分任务，优化逻辑 |
| API Key 泄露 | 费用损失 | RLS + 使用场景限制 |
| 并发限制 | 请求被拒 | 队列 + 重试机制 |

---

## 附录

### A. 环境变量清单

```bash
# 前端 (.env.local / Vercel)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx

# Edge Functions (Vercel)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
```

### B. 目录结构

```
bigbanana-project/
├── bigbanana-frontend/          # 前端项目
│   ├── src/
│   │   ├── api/               # API 层
│   │   ├── stores/            # 状态管理
│   │   ├── hooks/             # 自定义 Hooks
│   │   ├── pages/             # 页面组件
│   │   └── types/             # 类型定义
│   ├── supabase/              # Supabase 配置
│   │   └── functions/         # Edge Functions
│   ├── vercel.json            # Vercel 配置
│   └── .env.example
│
├── docs/                       # 项目文档
│   ├── database.md            # 数据库设计
│   ├── api.md                 # API 文档
│   └── deploy.md              # 部署指南
│
└── README.md                  # 项目说明
```

---

*文档版本: v1.0*
*最后更新: 2026-02-28*
