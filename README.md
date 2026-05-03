# Edgechat

一个部署在 Cloudflare 基础设施上的实时聊天系统。

**版本：** v2.0.0
**状态：** 生产就绪
**许可证：** GPL-3.0-or-later

## 项目概述

Edgechat 是一个功能完整的即时通讯系统，专为部署在 Cloudflare 全球基础设施上而设计。

它支持用户账号、公开频道、私有频道、私信、实时消息同步、文件管理以及管理员后台，适合用于团队内部沟通、私有社区和轻量级站内即时通讯场景。

## 功能特性

- 用户账号系统：仅支持管理员创建用户，不开放自由注册
- 支持公开频道、私有频道和一对一私信
- 基于 WebSocket 的实时消息同步
- 支持分页消息历史记录和消息搜索
- 支持文件上传和头像管理
- 提供管理员后台，包括用户管理、消息查看和站点设置
- 完整的管理员操作审计日志
- XSS 防护和请求限流

## 技术栈

- **前端：** Vue 3、Vue Router、Vite
- **后端：** Cloudflare Workers、Hono
- **实时通信：** Durable Objects + WebSocket Hibernation
- **数据库：** Cloudflare D1（SQLite）
- **会话管理：** Cloudflare KV
- **文件存储：** Cloudflare R2
- **部署工具：** Wrangler、GitHub Actions

## 快速开始

### 环境要求

- Node.js v18.17.0 或更高版本
- npm 10.2.3 或更高版本
- 已启用 Workers、D1、KV 和 R2 的 Cloudflare 账号

### 本地开发

```bash
# 安装依赖
npm install

# 启动前端开发服务器
cd frontend && npm run dev

# 启动后端 Worker 开发服务器（在另一个终端中运行）
cd worker && npm run dev
```

### 部署

完整部署说明请参考：

[docs/06_DEPLOYMENT.md](docs/06_DEPLOYMENT.md)

```bash
npm run build
npm run d1:apply
npm run deploy
```

## 项目文档

完整文档位于 `docs/` 目录中：

1. [00_README.md](docs/00_README.md) - 文档索引
2. [01_PRD.md](docs/01_PRD.md) - 产品需求文档
3. [02_TECH_STACK.md](docs/02_TECH_STACK.md) - 技术栈说明
4. [03_ARCHITECTURE.md](docs/03_ARCHITECTURE.md) - 系统架构
5. [04_BACKEND_STRUCTURE.md](docs/04_BACKEND_STRUCTURE.md) - API 与数据库结构
6. [05_SECURITY.md](docs/05_SECURITY.md) - 安全与合规说明
7. [06_DEPLOYMENT.md](docs/06_DEPLOYMENT.md) - 部署指南
8. [07_TEST_PLAN.md](docs/07_TEST_PLAN.md) - 测试策略
9. [08_OPERATIONS.md](docs/08_OPERATIONS.md) - 运维与监控

建议先阅读：

[docs/00_README.md](docs/00_README.md)

## 安全性

v2.0.0 版本包含较为完整的安全加固措施：

- 使用 HttpOnly Cookie 管理会话
- CORS 白名单校验
- 基于输入清理的 XSS 防护
- 使用参数化查询防止 SQL 注入
- 文件上传校验与扩展名黑名单
- WebSocket 消息限流
- 对所有管理员操作记录审计日志
- 基于时间戳的会话过期机制

完整安全说明请参考：

[docs/05_SECURITY.md](docs/05_SECURITY.md)

## 管理后台页面

- `/admin/users`：用户管理
- `/admin/messages`：消息查看
- `/admin/site`：网站设置

## 贡献

欢迎为 Edgechat 贡献代码、文档或问题反馈。

在开始开发前，请先阅读 `docs/` 目录中的相关文档。

你可以通过以下方式参与：

- 提交 Issue 反馈问题或建议
- 提交 Pull Request 改进功能或修复问题
- 完善文档和部署说明
- 协助测试安全性和兼容性

## 贡献者

感谢所有为本项目提供帮助的贡献者：

[![贡献者](https://contrib.rocks/image?repo=gdz66601/Edgechat)](https://github.com/gdz66601/Edgechat/graphs/contributors)

## 鸣谢

感谢 <a href="https://linux.do" target="_blank">linux do</a> 在推广方面为本项目做出的贡献。

## 许可证

Edgechat 基于 `GNU GPL v3.0 or later` 协议开源。

你可以使用、修改和分发本项目；如果你分发修改后的版本，需要继续提供对应源代码，并保持 GPL 协议兼容。

详情请参见：

[LICENSE](LICENSE)
