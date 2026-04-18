# Technical Notes

## 1. 项目目标

CFChat 面向小团队和站内沟通场景，强调三件事：

- 结构简单，便于部署和维护
- 具备真实可用的群聊、私聊和管理能力
- 尽量控制 Cloudflare 请求、KV、R2 的消耗

## 2. 总体架构

### 前端

前端位于 `frontend/`，采用 Vue 3 单页应用：

- `router.js`：页面路由与管理员访问控制
- `store.js`：登录态初始化和 session 保存
- `api.js`：统一封装 HTTP 请求
- `ws.js`：封装 WebSocket 连接
- `pages/`：登录页、聊天页、后台页、设置页

### 后端

后端位于 `worker/src/`，采用 Hono：

- `index.js`：Worker 入口、路由挂载、鉴权和定时任务
- `auth.js`：密码哈希、密码校验、session 生成
- `middleware.js`：普通鉴权和管理员鉴权
- `db.js`：房间访问、成员关系、消息写入等底层数据库逻辑
- `api/`：按业务拆分路由

### Cloudflare 资源职责

- `D1`：结构化业务数据
- `KV`：会话数据
- `R2`：头像和附件
- `Durable Object ChannelRoom`：WebSocket 房间广播
- `Static Assets`：前端静态资源
- `Cron Trigger`：消息清理

## 3. 会话与消息模型

项目把群组和私信统一抽象为 `channels`：

- `public`：公开群组
- `private`：私有群组
- `dm`：私信

核心表：

- `users`
- `channels`
- `channel_members`
- `messages`

设计重点：

- 私信复用 `channels` 表，避免双套会话模型
- `channel_members` 同时承载成员关系和角色
- `messages` 统一记录文本和附件信息
- 过期消息由定时任务直接硬删除

## 4. 请求链路

### 登录

1. 前端调用 `/api/auth/login`
2. Worker 查询 D1 用户记录
3. 校验密码
4. 将 session 写入 KV
5. 返回 token 给前端

### 聊天首页初始化

聊天页通过 `/api/bootstrap` 一次拉取：

- 可见群组列表
- 私信列表
- 可私信用户列表

这样替代了原本 `3` 个请求并发初始化。

### 消息历史

前端通过 `/api/messages` 拉取历史消息，并使用 `before` 分页。

### 实时消息

1. 前端连接 `/api/ws/:kind/:id`
2. Worker 校验登录态和房间访问权限
3. 请求转发给 `ChannelRoom` Durable Object
4. `ChannelRoom` 接管 WebSocket 并广播同房间消息
5. 消息先写入 D1，再推送给在线用户

## 5. 管理后台

后台拆为三个子页面：

### 用户管理

- 创建用户
- 启用/禁用用户
- 重置密码
- 删除用户

### 消息查看

- 搜索消息
- 查看群组列表
- 查看私信列表
- 打开完整会话页

### 网站设置

- 展示站点概况
- 创建后台级群组
- 提供后台操作入口说明

后台页面初始化使用 `/api/admin/overview` 聚合接口，减少请求数。

## 6. 静态资源路由策略

`wrangler.toml` 当前采用：

- `assets.directory = "./frontend/dist"`
- `not_found_handling = "single-page-application"`
- `run_worker_first = ["/api/*", "/files/*"]`

结果是：

- 页面和静态资源由 Static Assets 自动处理
- SPA 深链刷新仍能返回 `index.html`
- 只有 API 和文件下载进入 Worker

这比在 Worker 中手动 `ASSETS.fetch()` 更节省请求。

## 7. 成本优化

### 7.1 定时清理改为 Cron

消息清理曾经容易踩到一个典型问题：每个请求都去触发一次调度型 DO。

现在已经改为 Worker 原生 `scheduled()`：

- 每天北京时间 `03:00`
- 与访问量解耦
- 不再引入额外的 DO 请求开销

### 7.2 R2 文件缓存

`/files/:key` 当前会返回：

- `Cache-Control: public, max-age=31536000, immutable`
- `ETag`
- `Last-Modified`

这可以降低：

- 浏览器重复拉取
- Worker 重复执行
- R2 Class B 读操作

### 7.3 聚合接口

新增两个聚合接口：

- `/api/bootstrap`
- `/api/admin/overview`

目的不是“少写几个请求”，而是降低：

- 首屏加载时的 Worker 命中次数
- 前端并发请求数量
- 页面切换时的数据抖动

## 8. 安全边界与当前取舍

### 鉴权

- 除登录和健康检查外，大部分接口都要求登录
- `/api/admin/*` 额外要求管理员身份
- 管理员身份来自数据库字段 `users.is_admin`

### 文件访问

当前 `/files/:key` 是公开 URL 模式，更偏向站内易分享场景。

如果后续要做更严格的权限控制，可以考虑：

- 签名 URL
- 下载鉴权
- 私有群附件访问校验

### 硬删除

当前消息清理由定时任务直接执行硬删除：

- 优点：D1 空间会随清理逐步释放
- 缺点：被清理后的消息无法再用于后台追踪和审计

## 9. 后续可演进方向

- 删除未再使用的调度型 Durable Object 绑定
- 为附件下载增加权限判断
- 增加未读计数和会话置顶
- 增加更精细的后台运行统计
- 增加边缘缓存命中观测与日志分析
