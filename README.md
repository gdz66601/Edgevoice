<div align="center">
  <img src="Edgechat.png" alt="CFChat Logo" />
</div>

[![GitHub Repo](https://img.shields.io/badge/GitHub-gdz66601%2FEdgechat-181717?logo=github)](https://github.com/gdz66601/Edgechat)
[![License: GPL v3 or later](https://img.shields.io/badge/License-GPLv3%2B-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Hono](https://img.shields.io/badge/Hono-ff6b00?logo=hono&logoColor=white)](https://hono.dev/)
[![D1](https://img.shields.io/badge/Cloudflare-D1-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![R2](https://img.shields.io/badge/Cloudflare-R2-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)

CFChat 是一个运行在 Cloudflare Workers 上的团队聊天系统。它提供账号体系、公开群组、私有群组、私信、实时消息、文件上传和管理员后台，目标是在 Cloudflare 生态中以较低运维成本实现一套可直接落地的站内 IM。

本项目采用 `GPL-3.0-or-later` 协议，见 [LICENSE](/C:/Users/temp/code/cfchat/LICENSE)。

## 功能

- 管理员创建用户，不开放自助注册
- 公开群组、私有群组、私信会话
- 群主管理成员，管理员可查看任意群组和私信消息
- WebSocket 实时消息与历史消息分页
- 文件上传与头像资源存储在 R2
- 后台分为用户管理、消息查看、网站设置三个子页面
- 支持消息检索、成员邀请、文件发送
- 静态资源由 Cloudflare Static Assets 托管
- 通过 Cron Trigger 定时清理过期消息

## 技术栈

- 前端：Vue 3、Vue Router、Vite
- 后端：Cloudflare Workers、Hono
- 实时层：Durable Objects WebSocket Hibernation
- 数据库：Cloudflare D1
- 会话：Cloudflare KV
- 文件：Cloudflare R2
- 部署：Wrangler

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
├─ TECHNICAL.md
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
- `KV`：登录 session
- `R2`：聊天附件、头像
- `Durable Objects`：聊天室 WebSocket 房间
- `Static Assets`：托管前端产物
- `Cron Triggers`：定时清理过期消息

## 环境变量

当前项目使用这些变量：

```toml
[vars]
ADMIN_USERNAMES = "admin"
MESSAGE_RETENTION_DAYS = "7"
ALLOWED_FILE_TYPES = "image/,video/,application/pdf,text/"
MAX_FILE_SIZE = "20971520"
```

含义：

- `ADMIN_USERNAMES`：逗号分隔的管理员用户名
- `MESSAGE_RETENTION_DAYS`：消息保留天数
- `ALLOWED_FILE_TYPES`：允许上传的 MIME 前缀
- `MAX_FILE_SIZE`：单文件大小上限，单位字节

## 请求与成本优化

项目已经做了几项专门针对 Cloudflare 计费模型的优化：

- 静态资源不再手动 `ASSETS.fetch()`，由平台自动处理
- `run_worker_first` 只作用于 `"/api/*"` 和 `"/files/*"`
- 消息清理改为原生 `scheduled`，不再通过每个请求触发调度型 DO
- `/files/:key` 返回 `Cache-Control`、`ETag` 和 `Last-Modified`
- 聊天页初始化聚合为 `/api/bootstrap`
- 后台概览聚合为 `/api/admin/overview`

## 后台页面

- `/admin/users`：用户管理
- `/admin/messages`：消息查看
- `/admin/site`：网站设置

## 技术说明

更完整的架构、数据模型、实时链路、部署方式和优化说明见：

- [TECHNICAL.md](/C:/Users/temp/code/cfchat/TECHNICAL.md)

## 协议说明

本项目采用 `GNU GPL v3.0 or later`。

这意味着你可以使用、修改和分发本项目，但如果你分发修改版本，需要继续提供对应源代码，并保持 GPL 兼容。
