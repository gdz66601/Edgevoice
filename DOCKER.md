# Edgechat Docker 一键部署

## 🚀 一键启动（推荐）

```bash
./docker-start.sh
```

这个脚本会自动：
- ✅ 构建并启动 Docker 容器
- ✅ 初始化数据库表
- ✅ 创建管理员账户
- ✅ 显示访问信息

## 📱 访问应用

启动后访问：**http://localhost:8788**

## 🔐 默认管理员账户

- **用户名**：`admin`
- **密码**：`admin`

⚠️ 首次登录后请修改密码！

## 🛠️ 手动部署

### 1. 启动容器

```bash
docker compose up -d --build
```

### 2. 初始化数据库

```bash
docker compose exec edgechat wrangler d1 execute cfchat-db --local --file=./worker/schema.sql
```

`cfchat-db` is the retained legacy D1 database name. Keep using it unless you are doing a planned data migration.

### 3. 创建管理员账户

```bash
docker compose exec edgechat wrangler d1 execute cfchat-db --local --command="INSERT INTO users (username, password_hash, password_salt, display_name, is_admin) VALUES ('admin', '\$2a\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'salt', 'Administrator', 1);"
```

## 📊 常用命令

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 完全清理（包括数据）
docker compose down -v
```

## 🔧 故障排查

### 问题：显示"服务器开小差了"

**原因**：数据库未初始化

**解决**：运行 `./docker-start.sh` 或手动执行步骤 2 和 3

### 问题：端口被占用

**解决**：修改 `docker-compose.yml` 中的端口映射

```yaml
ports:
  - "8788:8787"  # 改为其他端口，如 "9000:8787"
```

### 问题：容器一直重启

**解决**：查看日志找出原因

```bash
docker compose logs --tail=50
```

## 🌐 生产部署

Docker 仅用于本地开发和测试。

生产环境请部署到 Cloudflare Workers：

```bash
# 配置 wrangler.toml
# 然后部署
npm run deploy
```

## 📝 注意事项

- 本地开发使用 SQLite（D1 本地模式）
- 数据存储在 `.wrangler/state/` 目录
- 停止容器不会丢失数据
- 使用 `docker compose down -v` 会清除所有数据
