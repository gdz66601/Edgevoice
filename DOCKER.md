# Edgechat Docker 一键部署

## 🚀 一键启动（推荐）

```bash
./docker-start.sh
```

这个脚本会自动：
- ✅ 构建并启动 Docker 容器
- ✅ 初始化数据库 schema 与所有迁移
- ✅ 通过 `scripts/bootstrap-local-admin.mjs` 生成正确的 PBKDF2 哈希并 upsert 管理员账户
- ✅ 显示访问信息

> 自定义初始管理员凭据：
> ```bash
> EDGECHAT_ADMIN_USERNAME=alice \
> EDGECHAT_ADMIN_PASSWORD='Replace-This-Strong-Password' \
> EDGECHAT_ADMIN_DISPLAY_NAME='Alice' \
> ./docker-start.sh
> ```

## 📱 访问应用

启动后访问：**http://localhost:8788**

## 🔐 默认管理员账户

如果未通过环境变量覆盖：
- **用户名**：`admin`
- **密码**：`admin123`

> ⚠️ 这是仅用于首次本地体验的临时弱密码。**首次登录后必须立即修改密码。**
> 切勿将此默认凭据用于任何对外可访问的环境。

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

### 3. 应用迁移

```bash
for f in worker/migrations/*.sql; do
  docker compose exec -T edgechat wrangler d1 execute cfchat-db --local --file="./$f"
done
```

### 4. 创建管理员账户

```bash
# 在宿主机生成包含正确 PBKDF2 哈希的 upsert SQL
EDGECHAT_ADMIN_PASSWORD='Strong-Password-Here' node scripts/bootstrap-local-admin.mjs

# 在容器中执行该 SQL
docker compose exec -T edgechat wrangler d1 execute cfchat-db --local \
  --file=./.tmp/edgechat-local-admin-upsert.sql
```

> ❗ 不要尝试自己手写 `INSERT INTO users (... password_hash, password_salt ...)`：
> 项目使用 PBKDF2-SHA256 派生密码哈希（参见 `worker/src/auth.js`），任何其他算法（bcrypt 等）
> 生成的哈希都将无法登录。

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

**解决**：运行 `./docker-start.sh` 或手动执行步骤 2-4

### 问题：能输入用户名密码但提示账号不存在或密码错误

**原因**：跳过了 `scripts/bootstrap-local-admin.mjs`，直接用了错误算法的哈希

**解决**：清空 users 表后按【手动部署】步骤 4 重新执行 bootstrap 脚本

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

> 生产部署时，**不要**让 CI 在每次发布时执行 admin upsert。请在首次部署后通过 `scripts/bootstrap-local-admin.mjs`
> 一次性创建初始管理员，后续账户管理在应用内完成。

## 📝 注意事项

- 本地开发使用 SQLite（D1 本地模式）
- 数据存储在 `.wrangler/state/` 目录
- 停止容器不会丢失数据
- 使用 `docker compose down -v` 会清除所有数据
