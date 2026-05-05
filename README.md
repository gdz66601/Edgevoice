<div align="center">
  <img src="Edgechat.png" alt="Edgechat 标志" />
</div>

[GitHub 仓库](https://github.com/gdz66601/Edgechat) · [项目文档](https://doc.chsm666.top/) · [开源协议（GPL v3 或更高版本）](https://www.gnu.org/licenses/gpl-3.0)

EdgeChat 是一个部署在 Cloudflare 上的聊天系统，提供账号体系、公开群组、私有群组、私信、实时消息、文件上传和管理员后台，目标是在 Cloudflare 生态中以较低运维成本实现一套可直接落地的站内 IM。

本项目采用 `GPL-3.0-or-later` 协议，详见 [LICENSE](LICENSE)。

## 功能特性

- 管理员创建用户，不开放自助注册
- 支持公开群组、私有群组与私信会话
- 群主管理成员，管理员可查看任意群组和私信消息
- 支持实时消息、历史消息分页、消息检索、文件发送
- 支持文件上传与头像管理
- 后台包含用户管理、消息查看、网站设置三个子页面
- 现代化 Liquid Glass 风格界面，已适配移动端并支持基础无障碍能力
- 支持定时硬删除过期消息

## 技术栈

- 前端：Vue 3、Vue Router、Vite
- 后端：Cloudflare Workers、Hono
- 实时层：Durable Objects WebSocket Hibernation
- 数据库：Cloudflare D1
- 会话：Cloudflare KV
- 文件：Cloudflare R2
- 部署：Wrangler、GitHub Actions

## 部署

### GitHub Actions 自动部署

推荐优先使用 GitHub Actions 部署，适合长期维护和生产环境更新。

- 快速开始：<https://doc.chsm666.top/guide/getting-started.html>
- 详细教程：<https://doc.chsm666.top/guide/actions-deploy.html>

仓库内已提供 `.github/workflows/deploy-worker.yml`，推送到 `master` 或 `main`，或手动触发 `workflow_dispatch` 后即可执行自动部署。

### 手动部署

如果你希望本地手动部署，完整步骤、资源准备和注意事项请查看文档站教程：

- 手动部署教程：<https://doc.chsm666.top/guide/getting-started.html>
- 文档首页：<https://doc.chsm666.top/>
- Docker 本地部署：[DOCKER.md](DOCKER.md)

## 快速开始

### 安装依赖

```bash
npm install
```

### 前端开发

```bash
npm run dev:frontend
```

### 本地构建

```bash
npm run build
```

### 本地手动发布

```bash
npm run deploy
```

在非交互环境下部署时，需要提前设置 `CLOUDFLARE_API_TOKEN`。

PowerShell 示例：

```powershell
$env:CLOUDFLARE_API_TOKEN = "your-token"
npm run deploy
```

## 项目结构

```text
edgechat/
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

更多实现说明可查看 [TECHNICAL.md](TECHNICAL.md) 和文档站：<https://doc.chsm666.top/>

## 贡献

欢迎提交 Issue 和 Pull Request，一起完善 EdgeChat。

## 贡献者

感谢所有为项目提供帮助的贡献者：

[![贡献者](https://contrib.rocks/image?repo=gdz66601/Edgechat)](https://github.com/gdz66601/Edgechat/graphs/contributors)

## 鸣谢

感谢 <a href="https://linux.do" target="_blank">linux do</a> 在推广方面为本项目做出的贡献。

## 协议说明

本项目采用 `GNU GPL v3.0 or later`。

你可以使用、修改和分发本项目；如果你分发修改版本，需要继续提供对应源代码，并保持 GPL 兼容。
