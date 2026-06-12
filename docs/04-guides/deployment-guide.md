---
title: 部署指南
category: guides
status: active
audience: developer
created: 2026-06-12
updated: 2026-06-12
---

# WL AI Director — 部署指南

## 一键部署

项目根目录提供 `setup.sh` 脚本，一条命令即可完成全部部署：

```bash
chmod +x setup.sh && ./setup.sh
```

脚本自动完成以下步骤：

| 步骤 | 说明 |
|------|------|
| 创建 `.env` | 生成默认配置（如已存在则跳过） |
| 创建必要目录 | `pb_data/` `pb_migrations/` `pb_hooks/` |
| 构建前端 | Vite 构建 → Nginx 镜像 |
| 启动 PocketBase | Docker 容器，自动执行迁移脚本 |
| 创建管理员 | 根据 `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` 自动创建 |
| 等待就绪 | 健康检查通过后输出访问地址 |

部署完成后：

```
前端:       http://localhost:3005
PocketBase: http://localhost:8090
管理后台:   http://localhost:8090/_/
管理员:     admin@wlai.com / admin123456
```

如需自定义账号密码，在执行前设置环境变量：

```bash
PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD=your-password ./setup.sh
```

---

## 架构概述

```
┌─────────────────────────────────────────┐
│             用户浏览器                    │
│  React SPA (Vite 构建)                   │
│  IndexedDB (主存储)                      │
│  ←→ PocketBase SDK (认证 + 同步)         │
└──────────────────┬──────────────────────┘
                   │ HTTP
          ┌────────▼────────┐
          │   PocketBase    │
          │  v0.39.0+ Docker│
          │  Auth + DB + FS │
          └─────────────────┘
```

- **前端**: 静态 SPA，打包后由 Nginx 或 Vercel 托管
- **后端**: PocketBase (Docker 容器)，提供认证、数据持久化、文件存储
- **数据策略**: Local-First — IndexedDB 为主，PocketBase 异步备份

---

## 前置要求

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| Docker & Docker Compose | Docker 24+ / Compose 2+ | 运行 PocketBase |
| Node.js | 18+ | 本地构建前端 |
| npm | 9+ | 依赖管理 |
| Vercel CLI（可选） | 最新 | Vercel 部署 |

---

## 环境变量

### 本地开发

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

```env
# PocketBase 服务地址
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

### 生产部署

根据部署方式设置 `VITE_POCKETBASE_URL`：

| 场景 | 值 |
|------|-----|
| 同一台机器 Docker compose | `http://pocketbase:8090`（容器内）或 `http://<IP>:8090`（外部） |
| 前后端分离部署 | `https://<your-pb-domain>` |
| Vercel + 独立 PB 服务器 | `https://<your-pb-domain>` |

> `VITE_` 前缀变量会在构建时打包进前端产物，部署后修改需重新构建。

---

## 部署 PocketBase

### Docker Compose（推荐）

项目根目录已有 `docker-compose.yaml`：

```bash
# 启动 PocketBase
docker compose up -d pocketbase

# 查看日志
docker compose logs -f pocketbase
```

PocketBase 在 `http://127.0.0.1:8090` 监听。

### 自动化机制

PocketBase 容器启动时会自动执行两项初始化：

| 机制 | 说明 | 配置方式 |
|------|------|---------|
| **管理员创建** | 通过 `PB_ADMIN_EMAIL` 和 `PB_ADMIN_PASSWORD` 环境变量自动创建 | `docker-compose.yaml` 的 `environment` 段 |
| **数据库迁移** | `pb_migrations/` 下的 `.js` 文件自动执行，创建 / 更新集合结构 | 文件放在 `./pb_migrations:/pb_data/pb_migrations` |

因此 **不需要手动创建管理员或集合**，容器启动后即全部就绪。

### 数据持久化

| 挂载路径 | 用途 |
|---------|------|
| `./pb_data/` | PocketBase 数据库、文件存储 |
| `./pb_migrations/` | 数据库迁移脚本（自动执行） |

> 删除容器不会丢失数据，数据保留在 `./pb_data/` 目录。

### 集合结构参考

以下是迁移脚本 `pb_migrations/` 自动创建的全部集合。部署时无需手动操作。

#### `users`（内置 auth 集合）

系统内置的用户认证集合。

| 字段 | 类型 | 说明 |
|------|------|------|
| email | email | 登录账号 |
| password | password | 加密存储 |
| name | text | 用户昵称 |
| avatar | file | 头像 |
| api_key | text | API Key 备用 |

**权限规则**：
- `updateRule`: 用户只能更新自己

#### `projects`（base 集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | relation → users | 所属用户 |
| title | text | 项目标题 |
| description | text | 项目描述 |
| status | text | 项目状态 |
| settings | json | 项目设置 |
| data | json | ProjectState JSON blob |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限规则**：用户只能操作自己的项目（`@request.auth.id = user_id.id`），管理员可操作全部。

#### `asset_library`（base 集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | relation → users | 所属用户 |
| type | select | `character` / `scene` / `prop` / `turnaround` |
| name | text | 资产名称 |
| project_name | text | 来源项目名称 |
| data | json | 资产完整数据 |
| image | file | 资产图片（最多支持 image2 ~ image9 共 10 张） |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限规则**：用户只能操作自己的资产，管理员可操作全部。

#### `canvas_data`（base 集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| project_id | text | 项目 UUID |
| layers | json | 图层数据 |
| canvas_offset | json | 视口偏移 |
| scale | number | 缩放比例 |
| version | number | 版本号（冲突检测） |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限规则**：登录用户可操作全部画布数据。

#### `template_previews`（base 集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| template_id | text | 模板 ID |
| preview | file | 预览图（png/jpeg/webp，最大 5MB） |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限规则**：登录用户可操作。

#### `user_templates`（base 集合）

| 字段 | 类型 | 说明 |
|------|------|------|
| template_id | text | 模板 ID |
| name | text | 模板名称 |
| category | text | 分类 |
| subjectPlaceholder | text | 主题占位符（英文） |
| subjectPlaceholderZh | text | 主题占位符（中文） |
| stylePrompt | text | 风格提示词（英文） |
| stylePromptZh | text | 风格提示词（中文） |
| negativePrompt | text | 负面提示词（英文） |
| negativePromptZh | text | 负面提示词（中文） |
| gradient | text | 渐变值 |
| userId | text | 用户 ID |
| created | autodate | 创建时间 |
| updated | autodate | 更新时间 |

**权限规则**：登录用户可操作。

---

## 部署前端

### 方式一：Docker Compose（前后端一体，推荐）

使用 `setup.sh` 一键部署，或手动执行：

```bash
# 确保 .env 已配置
cp -n .env.example .env

# 构建并启动全部服务
docker compose up -d --build

# 访问
# 前端: http://localhost:3005
# PocketBase: http://localhost:8090
```

**Dockerfile** 采用多阶段构建：

| 阶段 | 基础镜像 | 操作 |
|------|---------|------|
| builder | node:20-alpine | 安装依赖 → Vite 构建 |
| production | nginx:alpine | 复制构建产物 + nginx.conf |

**Nginx 配置要点**（参见 `nginx.conf`）：
- SPA 路由：`try_files $uri $uri/ /index.html`
- 静态资源：1 年缓存 + `immutable`
- Gzip 压缩：text/css, js, json, svg 等
- 安全头：X-Frame-Options, X-Content-Type-Options, XSS Protection

### 方式二：独立部署（前端静态托管）

适用于前后端分离的场景（如 Vercel + 独立 PocketBase 服务器）。

```bash
# 1. 设置生产环境变量
echo "VITE_POCKETBASE_URL=https://your-pb-server.com" > .env

# 2. 构建
npm run build

# 3. 产物在 dist/ 目录，可直接部署到任何静态托管服务
#    - Vercel
#    - Netlify
#    - 阿里云 OSS + CDN
#    - 自有 Nginx / Caddy
```

### 方式三：Vercel 部署

> Vercel 部署仅托管前端，PocketBase 仍需独立运行。

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 部署
vercel --prod
```

**环境变量**（在 Vercel Dashboard 设置）：

| 变量 | 说明 |
|------|------|
| `VITE_POCKETBASE_URL` | PocketBase 公网地址，如 `https://pb.your-domain.com` |

> `vercel.json` 中旧有的 Supabase Edge Functions 配置已废弃，不影响前端部署。

---

## 验证部署

### PocketBase 健康检查

```bash
curl http://127.0.0.1:8090/api/health
# 预期返回: {"code":200,"message":"OK"}
```

### 前端验证

| 检查项 | 预期 |
|--------|------|
| 页面加载 | 无白屏，控制台无 404 |
| 注册/登录 | 能正常创建账号并登录 |
| 项目创建 | 数据写入 IndexedDB 并同步到 PocketBase |
| 资产库 | 图片上传正常，`local:{id}` 和 PB URL 均可用 |

---

## 运维管理

### 查看日志

```bash
# PocketBase
docker compose logs -f pocketbase

# 前端 Nginx
docker compose logs -f bigbanana-ai
```

### 常用命令

```bash
# 重启 PocketBase
docker compose restart pocketbase

# 重新构建前端
docker compose up -d --build bigbanana-ai

# 停止全部
docker compose down

# 停止并删除数据卷（谨慎！会清除所有数据）
docker compose down -v
```

### Token 刷新机制

PocketBase 登录 Token 有效期为 30 分钟。应用内置自动刷新：
- 每 30 分钟定时调用 `authRefresh()`
- 每次 API 操作前调用 `ensureValidAuth()` 校验
- 如 Token 过期，自动刷新或引导重新登录

---

## 常见问题

### Q: 登录报 400 错误？

检查 PocketBase 是否运行：

```bash
curl http://127.0.0.1:8090/api/health
```

如无响应，检查 Docker 容器状态：

```bash
docker compose ps
docker compose logs pocketbase
```

### Q: 密码重置不生效？

本地开发无邮件服务器，PocketBase 会在日志输出重置链接：

```bash
docker compose logs pocketbase 2>&1 | grep password
```

### Q: Docker 重启后数据丢失？

不会。`pb_data/` 挂载了 host volume，容器删除后数据仍在。

```bash
# 确认数据目录存在
ls -la ./pb_data/
```

### Q: 图片不显示？

检查 `data.imageUrl` 格式：
- `local:{id}` → 图片在 IndexedDB 中
- `http://.../api/files/...` → 图片在 PocketBase 文件存储中

### Q: 前端连不上 PocketBase？

1. 确认 `VITE_POCKETBASE_URL` 值是否正确
2. Docker compose 部署时，前端容器内 `localhost` 指向自身，需用服务名 `http://pocketbase:8090`
3. 跨域场景需配置 PocketBase CORS（默认允许所有来源）

### Q: Nginx 413 Request Entity Too Large？

`nginx.conf` 中 `client_max_body_size` 设为 10m，如需上传大文件：

```nginx
client_max_body_size 50m;
```

修改后重启容器：

```bash
docker compose restart bigbanana-ai
```
