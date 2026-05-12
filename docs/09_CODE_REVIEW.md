# Edgechat 代码审查报告

> 审查日期：2026-05-12
> 审查范围：worker/、frontend/、tests/、scripts/、docs/、wrangler/Docker 配置、迁移脚本
> 审查方法：4 个并行 Explore agent 分头审查后端、前端、安全、测试与配置；关键发现交叉验证

---

## 0. 项目概况

| 维度 | 说明 |
|------|------|
| 技术栈 | Cloudflare Workers (Hono) + D1 + Durable Objects + KV + R2 + Vue 3 + Vite |
| 代码规模 | worker ~4.4k 行、frontend ~6k 行、tests 64 行 |
| 核心能力 | 公开/私有频道、私聊（DM）、E2EE、文件上传、内容审核、邀请注册、管理员后台 |
| 实时层 | DO（ChannelRoom）+ WebSocket Hibernation API |
| 持久化 | D1（结构化数据）+ KV（Session）+ R2（文件） |

整体架构选择成熟（DO 做实时房间、KV 存会话、R2 存文件、审计日志、软删 + GC），但工程化与安全细节存在阻塞生产的缺口。

## 0.1 综合评分

| 维度 | 评分 |
|------|------|
| 安全性 | ⭐⭐⭐ / 5 |
| 可靠性 | ⭐⭐⭐ / 5 |
| 性能 | ⭐⭐⭐ / 5 |
| 工程化 | ⭐⭐ / 5 |
| **综合** | **⭐⭐⭐ / 5** |

修复本报告 §6 的 Top-10 清单后，整体可以稳定到 4 / 5 星。

---

## 1. 严重问题（阻塞生产）

### S1. 测试覆盖率 <6%，但文档声称 70%+
- `tests/validation.test.js` 仅 64 行，仅覆盖 4 个工具模块
- `docs/07_TEST_PLAN.md:289` 自称 70-77% 覆盖、245/250 测试通过——与现实严重不符
- 认证、会话、权限、WebSocket、API 路由、DB 全部零测试

### S2. CI 不跑测试
- `.github/workflows/deploy-worker.yml:38-65` 的 master push 直接 build → deploy
- **不执行 `npm run check`**
- `package.json:16` 的 `check` 脚本形同虚设

### S3. PBKDF2 迭代次数 100,000，远低于 2026 标准
- `worker/src/auth.js:30` `iterations: 100000`
- OWASP 2023+ 推荐 ≥ 600,000
- 一旦数据库泄露，常见密码可在数小时内被 GPU 离线破解
- **修复**：升级到 600k；增加 `password_hash_version` 列，登录时 lazy 重哈希

### S4. 关键路径无速率限制
- `worker/src/index.js:196-235` `/api/auth/login` 无任何防护
- 注册端点、密码修改、`/api/dm/open` 全无频率限制
- 仅 `ChannelRoom.js:79` 在 DO 内对消息发送做了 10 msg/s 限流
- 注册接口的"用户名已存在"错误（`index.js:163`）+ 管理员创建错误（`admin.js:299`）泄露用户名枚举
- 任意登录用户可向任意人 spam DM（无 block list、无 first-message-accept 流程）

### S5. 数据库迁移无版本管理
- `worker/migrations/` 9 个文件无 `schema_migrations` 表
- CI 从不应用迁移（`deploy-worker.yml:54` 仅在首次创建 D1 时跑 schema.sql）
- 多个迁移非幂等：
  - `2026-04-05-private-groups.sql:19-20` `DROP TABLE + RENAME`
  - `2026-05-11-admin-audit-nullable-user.sql:41-42` 同理
  - `ADD COLUMN` 重复执行直接 SQLite 错误
- 0 个 down 脚本，无回滚机制

### S6. 部署每次都"复活"管理员账户
- `deploy-worker.yml:62` 每次部署执行 admin upsert SQL
- 覆盖 `is_admin=1`、`is_disabled=0`、`deleted_at=NULL`
- 即使你手动禁用了管理员，下次部署会被自动复活——隐蔽且严重

### S7. Docker 默认密码硬编码且文档错乱
- `docker-start.sh:48` 硬编码 `admin123`
- `DOCKER.md:23` 说默认密码是 `admin`（与脚本不符）
- `DOCKER.md:45` 给出疑似 bcrypt 哈希示例，但项目用 PBKDF2——按文档 INSERT 出来的账号无法登录

---

## 2. 高危安全问题

| 编号 | 严重度 | 问题 | 位置 |
|------|--------|------|------|
| H1 | High | 缺 CSP（仅 `/files/*` 路径有），缺 HSTS | `worker/src/index.js:32-41` |
| H2 | High | `siteIconUrl` 未做 URL 协议校验，可写入任意字符串；`isValidUrl` 已存在但未被调用 | `worker/src/api/admin.js:144-155` |
| H3 | High | 前端仍把 token 写入 localStorage（同时维护 `edgechat:` 和 `cfchat:` 两套 key），后端已用 HttpOnly Cookie，localStorage 路径成纯 XSS 暴露面 | `frontend/src/auth-storage.js:1-54` |
| H4 | High | E2EE 房间口令以**明文**存入 localStorage——XSS 即可秒读所有口令 | `frontend/src/composables/useChatRoom.js:67-88` |
| H5 | Medium | E2EE 的 AAD 仅绑定 `roomKey`，不含 senderId——服务器/中间人可重新归属密文给其他发送者 | `frontend/src/e2ee.js:63-65` |
| H6 | Medium | 自定义背景 CSS 注入：`document.body.style.background = profileForm.customBackground` 直接拼用户输入 | `frontend/src/pages/SettingsPage.vue:28-34`、`frontend/src/main.js:10-13` |
| H7 | Medium | `/files/:key` 公开访问无鉴权，离群成员可继续访问历史附件（仅靠 key 不可枚举） | `worker/src/api/upload.js:154-192` |
| H8 | Medium | 管理员读取私有 DM/频道没有审计日志（仅写操作有） | `worker/src/api/admin.js:571-582` |
| H9 | Medium | 密码强度仅计算 `strength` 字段从不强制——"12345678" 可通过 | `worker/src/validation.js:116-146` |
| H10 | Low | `verifyPassword` 非常时比较；PBKDF2 派生主导耗时，时序泄露很小但非最佳实践 | `worker/src/auth.js:43-46` |
| H11 | Low | `randomToken(24)` 192 bit 熵足够；`fromBase64Url` 不校验非法字符——可能 500 | `worker/src/auth.js:9-14` |

> **更正一处误报**：Worker → DO 内部转发会把 token 放进 URL（`index.js:540`），但前端 ws URL 并不带 token（`api.js:161-165`），仅依赖 cookie。所以这是低危的内部日志暴露，不是远程泄漏。

---

## 3. 可靠性 / 性能问题

### 3.1 WebSocket
1. **客户端无重连、无心跳**：`frontend/src/ws.js` 仅 34 行裸包装；网络抖动后 `wsStatus` 永远停在 closed，用户必须切房间才能恢复
2. **DO 缺心跳**：`worker/src/do/ChannelRoom.js:74-90`。Cloudflare 90 秒空闲断开
3. **DO 缺踢人通道**：管理员踢人/封禁后客户端不会立刻断开（`WEBSOCKET_AUTH.md:31-38` 已自陈）
4. **消息丢失**：`useChatRoom.js:417-464` `sendMessage` 仅在 `OPEN` 时发送；连接中点击直接报错，无队列缓存

### 3.2 数据库与查询
1. **DO 广播路径 N 次重校验**：`ChannelRoom.js:174-190` 每条消息广播时对每个 socket 都重做 `validateSession + requireAccessibleRoom`（KV + 多次 D1）。100 人房间每条消息 = 100 次重校验
2. **Bootstrap N+1 查询**：`index.js:393-477` 频道列表 5 个相关子查询 × N 频道
3. **admin overview 全表无分页**：`admin.js:10-77`
4. **缺索引**：
   - `channel_members(user_id)` 反向索引缺失
   - `messages.deleted_at`、`channels.deleted_at`、`users.deleted_at` 都无索引但被 WHERE 使用
   - admin 消息搜索 `LIKE %keyword%` 全表扫描

### 3.3 文件上传
- **大文件上传内存炸**：`upload.js:121-129` `await file.arrayBuffer()` 全量读入；100MB 撞 Worker 128MB 限制
- 应改用 `c.env.FILES.put(key, file.stream())`

### 3.4 GC 与并发
- **GC 步骤无错误隔离**：`gc.js:505-523` 任一步抛错中断后续；`runScheduledGc` 在 `scheduled()` 内未 try/catch（`index.js:573-576`）
- **注册并发竞态**：`index.js:107-194` 先 INSERT 用户再 UPDATE invite，未在事务/条件 INSERT 中处理并发消费同一 invite

### 3.5 Cookie 处理
- `index.js:217` 用 `c.req.url.startsWith('https://')` 判断 Secure，CDN 后协议不可靠
- `index.js:271-274` 注销 cookie 缺 path/secure/sameSite/httpOnly，可能清不掉
- `middleware.js:7-13` `split('=')` 解析 cookie，对含 `=` 的 base64 padding 会被切断

---

## 4. 代码质量 / 架构问题

### 4.1 僵尸代码（未被引用，可直接删除）
- **`worker/src/permissions.js`** 整文件 159 行无任何 import，被 `db.js` 的 `requireAccessibleRoom` 取代
- **`worker/src/do/Scheduler.js`** 仅在 `index.js` 中作为 export 给 binding，没有任何 fetch 调用，与 `scheduled()` 重复
- **`frontend/src/components/chat/`** 6 个 Vue 组件完全没被任何文件引用——`ChatPage.vue` 把所有内容 inline 进了 770 行模板
- **`ChatPage.vue:607`** `v-if="false && canManageActiveRoom"` 死代码

### 4.2 巨型文件（应拆分）
- `frontend/src/pages/ChatPage.vue` 770 行
- `frontend/src/composables/useChatRoom.js` 745 行（一次返回 50+ 字段）
- `worker/src/api/admin.js` 583 行
- `worker/src/api/channels.js` 526 行

### 4.3 重复实现
- 频道行映射 + avatarUrl 拼接在 `index.js:480-509`、`channels.js:14-29`、`dm.js:32-44` 各写一遍
- 超级管理员判定 `admin.js:333,401,460` 三次复制
- 注册链接 UI 在 `AdminUsersPage.vue:74-167` 与 `AdminSitePage.vue:120-167` 几乎一字不差
- `validation.js:14-51` `sanitizeText` 用 `text.split('').filter()` 处理代理对会拆错

### 4.4 命名 / 迁移期一致性
- cookie 用 `cfchat_token`，localStorage 用 `edgechat:*` 与 `cfchat:*` 两套
- 事件 `edgechat:auth-invalid` + `cfchat:auth-invalid` 同时派发
- 没有清理时间表

---

## 5. UX / 可访问性

- 大量使用 `window.confirm` / `window.prompt`：
  - `useChatRoom.js:556,578,613` 删群/踢人/禁言
  - `AdminUsersPage.vue:59` 用 `prompt` 收集**新密码**——明文输入框
- IME 组合输入未保护：`useChatRoom.js:466-471` Enter 直接发送，中文/日文输入法选词被打断
- 按钮普遍缺 `aria-label`
- AdminUsersPage 多处 PATCH/POST 无 try/catch，失败静默
- 错误文案中英混杂（`"You no longer have access..."` 与 `"消息包含违禁词"` 在同文件）
- 加密失败显示"加密"二字反而让用户困惑（`ChatPage.vue:474`）
- `ChatPage.vue:496` `<label class="error-text">` 误用 label 元素

---

## 6. 上线前 Top-10 优先修复清单

| # | 优先级 | 修复项 | 涉及文件 |
|---|--------|--------|----------|
| 1 | P0 | PBKDF2 提到 600,000+，加版本号支持懒重哈希 | `auth.js`、`schema.sql` |
| 2 | P0 | 登录/注册/DM 加速率限制（KV 计数 or Cloudflare Rate Limiting） | `index.js`、新建 `rate-limit.js` |
| 3 | P0 | 移除部署时 admin upsert，改为一次性初始化 | `deploy-worker.yml` |
| 4 | P0 | CI 加测试 gate（`pull_request` 触发 `npm run check`） | `.github/workflows/` |
| 5 | P0 | 添加 CSP + HSTS；移除 localStorage token，仅留 HttpOnly Cookie | `index.js`、`auth-storage.js` |
| 6 | P1 | WebSocket 加心跳 + 客户端重连 + 断线消息补拉 | `ws.js`、`ChannelRoom.js`、`useChatRoom.js` |
| 7 | P1 | DO 广播缓存会话校验结果（5-10s TTL），实现踢人/封禁主动断连 | `ChannelRoom.js`、`api/admin.js` |
| 8 | P1 | 迁移版本表 + 幂等改造 + CI 自动应用 | `worker/migrations/`、`schema.sql` |
| 9 | P1 | 删除僵尸代码（`permissions.js`、`do/Scheduler.js`、`components/chat/*.vue`） | 多处 |
| 10 | P1 | 修复 Docker/文档密码不一致；统一 cookie/localStorage key 命名 | `DOCKER.md`、`docker-start.sh`、`auth-storage.js` |

---

## 7. 亮点（不应忽略的工程优点）

- **参数化 SQL 全面落实**——审查未发现任何 SQL 注入风险点
- **Vue 全程文本插值**（无 v-html、innerHTML）
- **上传安全**：白名单 + SVG 强制 attachment + 文件路径 sandbox CSP
- **审计日志机制**完整覆盖管理员写操作
- **软删 + GC 队列**有 `pending_r2_delete` 重试机制
- **session_version 失效机制**：禁用/改密/删用户后旧 token 立即失效
- **WebSocket 上每条消息重校验权限**（虽然性能差，但安全语义正确）
- **AES-GCM-256 + 随机 IV** 的 E2EE 密码学选择正确

---

## 8. 后续行动

本报告作为修复工作的依据。修复将以 §6 Top-10 清单为序，分批提交。每个修复 PR 需要：
1. 引用本报告的对应章节
2. 至少补一个回归测试
3. 更新相关文档（`05_SECURITY.md`、`07_TEST_PLAN.md`、`08_OPERATIONS.md`）
