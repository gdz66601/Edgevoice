# Edgechat 部署与配置指南

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 1. 前置条件

### 1.1 账号与服务

需要的外部账号：
- Cloudflare 账号（包含 Workers、D1、KV、R2）
- GitHub 账号（可选，用于自动部署）

### 1.2 本地工具

安装以下工具：
- Node.js v22.0.0 或更高
- npm 10.2.3 或更高
- Wrangler CLI v4.11.1 或更高：`npm install -g wrangler`

### 1.3 验证环境

```bash
node --version      # 应显示 v22.x 或更高
npm --version       # 应显示 10.x 或更高
wrangler --version  # 应显示 4.11.1 或更高
```

## 2. Cloudflare 资源准备

### 2.1 创建必要资源

**D1 数据库**：
```bash
wrangler d1 create edgechat-db
```
记录返回的数据库 ID。

**KV 命名空间**：
```bash
wrangler kv:namespace create "SESSIONS"
```

**R2 存储桶**：
```bash
wrangler r2 bucket create "edgechat-files"
```

### 2.2 获取资源 ID

所有资源 ID 都需配置到 wrangler.toml。

## 3. 项目配置

### 3.1 克隆和初始化

```bash
git clone https://github.com/gdz66601/Edgechat.git
cd Edgechat
npm install
```

### 3.2 配置 wrangler.toml

编辑 `worker/wrangler.toml`，设置以下值：

```toml
name = "edgechat-worker"
type = "service"
account_id = "your-account-id"
workers_dev = true
route = "https://chat.example.com/*"
zone_id = "your-zone-id"

[env.production]
# 生产环境配置

[env.development]
# 开发环境配置

[[d1_databases]]
binding = "DB"
database_name = "edgechat-db"
database_id = "your-database-id"

[[kv_namespaces]]
binding = "SESSIONS"
id = "your-kv-namespace-id"

[[r2_buckets]]
binding = "FILES"
bucket_name = "edgechat-files"

[env.production.vars]
ALLOWED_ORIGINS = "https://yourdomain.com,https://www.yourdomain.com"
ADMIN_USERNAMES = "admin"
ENVIRONMENT = "production"
MESSAGE_RETENTION_DAYS = "7"
SOFT_DELETE_RETENTION_DAYS = "60"
MAX_FILE_SIZE = "20971520"
ALLOWED_FILE_TYPES = "image/,video/,application/pdf"

[env.production.secrets]
JWT_SECRET = "your-strong-random-secret-key-here"
```

### 3.3 生成 JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

设置生成的值：
```bash
wrangler secret put JWT_SECRET --env production
```

## 4. 数据库初始化

### 4.1 应用迁移脚本

```bash
# 创建基础表
wrangler d1 execute edgechat-db --file worker/schema.sql --env production

# 应用安全审计迁移
wrangler d1 execute edgechat-db --file worker/migrations/2026-05-03-audit-log.sql --env production
```

### 4.2 验证数据库

```bash
wrangler d1 execute edgechat-db "SELECT name FROM sqlite_master WHERE type='table'" --env production
```

应返回表列表：users、channels、messages、channel_members、admin_audit_log 等。

## 5. 初始化管理员账号

使用数据库管理工具（如 D1 Web UI）插入初始管理员：

```sql
INSERT INTO users (username, password_hash, display_name, is_admin)
VALUES ('admin', '<PBKDF2_HASH>', 'Administrator', 1);
```

关于密码哈希：
- 可通过本地脚本生成
- 或使用临时密码，之后通过管理后台重置

## 6. 本地开发

### 6.1 启动开发服务器

```bash
# 前端开发服务器
cd frontend
npm run dev

# 后端 Worker 开发服务器（另一个终端）
cd worker
npm run dev
```

前端运行在 `http://localhost:5173`
后端运行在 `http://localhost:8787`

### 6.2 本地测试

打开浏览器访问 `http://localhost:5173`，使用创建的管理员账号登录。

## 7. 生产部署

### 7.1 手动部署

```bash
# 构建前端
cd frontend
npm run build

# 部署 Worker
cd ../worker
npm run deploy -- --env production
```

### 7.2 使用 GitHub Actions（推荐）

项目已包含 `.github/workflows/deploy-worker.yml`。

配置步骤：
1. 在 GitHub 仓库设置中添加 Secrets：
   - CLOUDFLARE_ACCOUNT_ID
   - CLOUDFLARE_API_TOKEN
   - CLOUDFLARE_DATABASE_ID
   - CLOUDFLARE_KV_NAMESPACE_ID
   - CLOUDFLARE_R2_BUCKET_NAME
   - JWT_SECRET

2. 将代码推送到 main 分支触发自动部署。

## 8. 前端部署（可选）

### 8.1 部署到 Cloudflare Pages

```bash
cd frontend
npm run build

# 使用 Wrangler Pages 部署
wrangler pages deploy dist
```

或在 GitHub 中配置 Pages 自动部署。

### 8.2 使用 CDN

前端产物可部署到 R2，通过 Cloudflare CDN 提供。

## 9. 环境变量管理

### 9.1 生产环境变量

所有环境变量必须在 wrangler.toml 中声明（不要硬编码在代码中）。

关键变量：
- ALLOWED_ORIGINS：CORS 白名单（逗号分隔）
- JWT_SECRET：会话加密密钥（保密）
- DATABASE_URL：D1 连接信息（自动注入）

### 9.2 更新环境变量

修改 wrangler.toml 后，重新部署：
```bash
wrangler deploy --env production
```

## 10. 监测与日志

### 10.1 查看日志

```bash
# 实时日志
wrangler tail --env production

# 查询历史日志（通过 Cloudflare 仪表板）
```

### 10.2 启用详细日志

在 index.js 中添加调试日志：
```javascript
console.log('Debug info', { userId, channelId });
```

日志在 Cloudflare 仪表板的 Workers 日志中可见。

## 11. 性能优化

### 11.1 缓存策略

配置静态资源缓存（Cloudflare 规则）：
```
www.example.com/static/* -> 缓存 30 天
www.example.com/api/* -> 不缓存
```

### 11.2 Worker 性能

- 避免 N+1 查询
- 使用 KV 缓存热数据
- 异步执行非关键操作

## 12. 故障排查

### 12.1 常见问题

**问题**：部署后收到 403 错误
- 检查 ALLOWED_ORIGINS 配置
- 确认前端域名在白名单中

**问题**：WebSocket 连接失败
- 确认使用 WSS（Secure WebSocket）
- 检查防火墙是否阻止 WebSocket

**问题**：文件上传失败
- 检查 R2 桶权限
- 验证文件类型是否在白名单中
- 检查文件大小是否超过 20MB

**问题**：消息未实时更新
- 检查 Durable Objects 是否正确绑定
- 查看 Worker 日志
- 确认 WebSocket 连接未断开

### 12.2 查看日志

```bash
# 查看 Worker 日志
wrangler tail --env production

# 查看 D1 执行日志
wrangler d1 execute edgechat-db "SELECT * FROM sqlite_master" --env production
```

## 13. 安全部署检查

部署前必须检查：
- [ ] HTTPS 已启用
- [ ] CORS 白名单已配置（非 *）
- [ ] JWT_SECRET 已设置为强随机值
- [ ] 初始管理员账号已创建
- [ ] 数据库备份已存在
- [ ] 监测和告警已配置
- [ ] 日志收集已启用
- [ ] 文件上传验证已启用

## 14. 回滚与恢复

### 14.1 回滚部署

```bash
# 查看部署历史
wrangler deployments list

# 恢复到前一个版本
wrangler rollback --env production
```

### 14.2 数据库备份与恢复

D1 自动每日备份。如需恢复：
```bash
# 导出数据
wrangler d1 execute edgechat-db "SELECT * FROM messages LIMIT 100" > backup.sql

# 恢复数据
wrangler d1 execute edgechat-db --file backup.sql
```

## 15. 维护任务

### 15.1 定期任务

- 每周：检查错误日志
- 每月：运行 npm audit，更新依赖
- 每季度：审计管理员权限
- 每年：安全评估与代码审计

### 15.2 监测指标

需监测：
- Worker CPU 时间
- D1 查询耗时
- R2 存储用量
- 错误率和响应时间

## 变更记录

### v2.0.0
- 新增：完整的部署指南
- 新增：安全部署检查清单
- 修改：环境变量配置规范

### v1.0.0
- 初版部署指南
