🚀 使用方法
方式一:使用 Docker Compose (推荐)

# 构建并启动容器（会重新构建镜像）
docker-compose up -d --build

# 如果怀疑 Docker 构建缓存导致未更新（强制无缓存构建 + 重新创建容器）
docker-compose build --no-cache
docker-compose up -d --force-recreate

# 查看日志
docker-compose logs -f

# 停止容器
docker-compose down

方式二:使用 Docker 命令

# 构建镜像
docker build -t bigbanana-ai .

# 无缓存构建（强制重新拉取/执行每一层）
docker build --no-cache -t bigbanana-ai .

# 运行容器
docker run -d -p 3005:80 --name bigbanana-ai-app bigbanana-ai

# 查看日志
docker logs -f bigbanana-ai-app

# 停止容器
docker stop bigbanana-ai-app

补充：如果你确认容器已更新但页面仍是旧的

- 浏览器可能缓存了静态资源：先尝试强制刷新（Ctrl+F5）或清理站点缓存。
- 如果前面有 CDN/反代，也可能缓存了 index.html，需要在上游刷新缓存。

---

## 📦 PocketBase 数据库管理后台

| 项目 | 说明 |
|------|------|
| 访问地址 | <http://127.0.0.1:8090/_/> |
| 默认管理员邮箱 | `admin@wlai.com` |
| 默认管理员密码 | `admin123456` |

> ⚠️ **注意**：**必须使用 `127.0.0.1` 而不是 `localhost`** 访问管理后台。
>
> 原因是 PocketBase 的 Content-Security-Policy 限制了 `connect-src` 仅允许 `127.0.0.1`，`localhost` 会被 CSP 拦截导致页面无法正常加载 JS 和 API 请求。

