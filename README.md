<div align="center">
  <img src="Edgechat.png" alt="Edgechat 标志" />
</div>

[GitHub 仓库](https://github.com/gdz66601/Edgechat) · [开源协议（GPL v3 或更高版本）](https://www.gnu.org/licenses/gpl-3.0)

EdgeChat 是一个团队聊天系统，提供账号体系、公开群组、私有群组、私信、实时消息、文件上传和管理员后台，目标是在 Cloudflare 生态中以较低运维成本实现一套可直接落地的站内 IM。

本项目采用 `GPL-3.0-or-later` 协议，详见 [LICENSE](LICENSE)。

**[📖 查看项目文档](https://doc.chsm666.top/)**

## 功能

- 管理员创建用户，不开放自助注册
- 支持公开群组、私有群组与私信会话
- 群主管理成员，管理员可查看任意群组和私信消息
- 支持实时消息与历史消息分页
- 支持文件上传与头像管理
- 后台包含用户管理、消息查看、网站设置三个子页面
- 支持消息检索、成员邀请、文件发送
- 支持定时硬删除过期消息

## 技术栈

- 前端：Vue 3、Vue Router、Vite
- 后端：Cloudflare Workers、Hono
- 实时层：Durable Objects WebSocket Hibernation
- 数据库：Cloudflare D1
- 会话：Cloudflare KV
- 文件：Cloudflare R2
- 部署：Wrangler

<img width="2198" height="1932" alt="项目界面截图" src="https://i.chsm666.top/file/1777177920568_photo_2026-04-26_12-30-51.jpg" />

## 项目结构

```text
cfchat/
├─ frontend/
│  ├─ src/
│  │  ├─ api.js
│  │  ├─ router.js
│  │  ├─ store.js
│  │  ├─ ws.js
│  │  ├─ styles.css
│  │  ├─ components/ui/
│  │  └─ pages/
│  └─ vite.config.js
├─ worker/
│  ├─ schema.sql
│  ├─ migrations/
│  └─ src/
│     ├─ index.js
│     ├─ auth.js
│     ├─ db.js
│     ├─ middleware.js
│     ├─ utils.js
│     ├─ api/
│     └─ do/
├─ wrangler.toml
├─ package.json
├─ README.md
└─ LICENSE
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地构建

```bash
npm run build
```

### 前端开发

```bash
npm run dev:frontend
```

### 部署

```bash
npm run deploy
```

在非交互环境下部署时，需要提前设置 `CLOUDFLARE_API_TOKEN`。

PowerShell 示例：

```powershell
$env:CLOUDFLARE_API_TOKEN = "your-token"
npm run deploy
```

## Cloudflare 资源依赖

- `D1`：用户、群组、成员关系、消息
- `KV`：登录会话
- `R2`：聊天附件、头像
- `Durable Objects`：聊天室 WebSocket 房间
- `Static Assets`：托管前端产物
- `Cron Triggers`：定时清理过期消息

## 环境变量

当前项目使用以下变量：

```toml
[vars]
MESSAGE_RETENTION_DAYS = "7"
ALLOWED_FILE_TYPES = "image/,video/,application/pdf,text/"
MAX_FILE_SIZE = "20971520"
```

变量说明：

- `MESSAGE_RETENTION_DAYS`：消息保留天数
- `ALLOWED_FILE_TYPES`：允许上传的 MIME 前缀
- `MAX_FILE_SIZE`：单文件大小上限（字节）

管理员身份通过数据库字段 `users.is_admin` 控制。

## 请求与成本优化

项目已做了多项针对 Cloudflare 计费模型的优化：

- 静态资源不再手动 `ASSETS.fetch()`，由平台自动处理
- `run_worker_first` 仅作用于 `"/api/*"` 与 `"/files/*"`
- 消息清理改为原生 `scheduled`，并对过期消息执行硬删除，不再通过每个请求触发调度型 DO
- `/files/:key` 返回 `Cache-Control`、`ETag` 与 `Last-Modified`
- 聊天页初始化聚合为 `/api/bootstrap`
- 后台概览聚合为 `/api/admin/overview`

## 后台页面

- `/admin/users`：用户管理
- `/admin/messages`：消息查看
- `/admin/site`：网站设置

## 贡献者

感谢所有为项目提供帮助的贡献者：

[![贡献者](https://contrib.rocks/image?repo=gdz66601/Edgechat)](https://github.com/gdz66601/Edgechat/graphs/contributors)

## 协议说明

本项目采用 `GNU GPL v3.0 or later`。

你可以使用、修改和分发本项目；如果你分发修改版本，需要继续提供对应源代码，并保持 GPL 兼容。

## GitHub Actions 自动部署（Cloudflare Token）

本仓库包含 `.github/workflows/deploy-worker.yml`，用于自动化生产环境部署。

触发规则：

- 推送到 `master` 或 `main`
- 通过 `workflow_dispatch` 手动触发

必需的 GitHub 仓库 Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

可选的管理员初始化 Secrets：

- `CFCHAT_ADMIN_USERNAME`
- `CFCHAT_ADMIN_PASSWORD`
- `CFCHAT_ADMIN_DISPLAY_NAME`（可选，默认使用用户名）

推荐的 Token 权限范围：

- `Workers Scripts:Edit`
- `Workers Routes/Cron Triggers:Edit`
- `D1:Edit`
- `Workers KV Storage:Edit`
- `R2:Edit`

部署行为：

- 工作流会先执行构建，再确保 Cloudflare 资源存在。
- D1 数据库：`cfchat-db`
- KV 命名空间：`cfchat-sessions`
- R2 Bucket：`cfchat-files`
- 首次创建 D1 时，会用 `worker/schema.sql` 初始化结构。
- 后续运行会复用已有资源，并只更新同一个 Worker（`name = "cfchat"`）。
- 若设置了管理员初始化 Secrets，部署时会自动创建（或恢复）该管理员账号。
- Cron 触发器会通过 `wrangler deploy` 根据生成配置中的 `[triggers]` 同步。
- `worker/migrations/` 下的 SQL 文件不会在 CI 中自动执行。

除此之外，由衷感谢 <a href="https://linux.do" target="_blank">linux do</a> 在推广方面为本项目做出的贡献
