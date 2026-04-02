# 部署指南

## 前置要求

1. Vercel 账号 (vercel.com)
2. Supabase 项目已配置
3. Node.js 18+

## 环境变量

在 Vercel 项目中配置以下环境变量：

```
SUPABASE_URL=https://wgmnizpejtuwvcaqsbvy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

获取 Service Role Key：
1. 打开 Supabase Dashboard
2. 进入 Project Settings → API
3. 找到 `service_role` 密钥（注意：不要暴露给前端）

## 部署步骤

### 方式一：通过 Vercel CLI 部署

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 链接项目
cd bigbanana-frontend
vercel link

# 4. 配置环境变量
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY

# 5. 部署
vercel --prod
```

### 方式二：通过 GitHub 自动部署

1. 将代码推送到 GitHub
2. 访问 https://vercel.com/new
3. 导入 GitHub 仓库
4. 配置环境变量
5. 点击 Deploy

## Edge Functions 部署

Edge Functions 会随主项目一起部署。

部署后获取函数 URL：
- generate-video: `https://<project>.vercel.app/functions/v1/generate-video`
- webhook-video-complete: `https://<project>.vercel.app/functions/v1/webhook-video-complete`
- get-video-status: `https://<project>.vercel.app/functions/v1/get-video-status`

## 配置 Webhook

在智谱开放平台配置 Webhook URL：

```
https://<your-project>.vercel.app/functions/v1/webhook-video-complete
```

## 一键部署脚本

```bash
#!/bin/bash
# deploy.sh

echo "开始部署 WL AI Director..."

# 检查环境变量
if [ -z "$SUPABASE_URL" ]; then
  echo "错误: 请设置 SUPABASE_URL 环境变量"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "错误: 请设置 SUPABASE_SERVICE_ROLE_KEY 环境变量"
  exit 1
fi

# 部署前端
echo "部署前端..."
vercel --prod --yes

echo "部署完成!"
echo "访问 https://<your-project>.vercel.app"
```

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 本地测试 Edge Functions
vercel dev
```
