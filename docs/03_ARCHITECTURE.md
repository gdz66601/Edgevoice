# Edgechat 系统架构文档

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 1. 系统设计理念

### 1.1 核心原则
- 无服务器设计（Serverless）：降低运维成本
- 边缘优先（Edge First）：提升全球访问性能
- 实时优先（Real-time First）：支持低延迟通信
- 安全第一（Security First）：每一层都有防护
- 可扩展性：支持百万级消息、万级并发

### 1.2 架构等级
- L1：无服务器计算层（Cloudflare Workers）
- L2：实时通信层（Durable Objects）
- L3：数据层（D1、KV、R2）
- L4：边界安全（CORS、鉴权、限流）

## 2. 系统上下文

### 2.1 参与者
- 用户：通过浏览器访问前端
- 管理员：使用后台管理面板
- 外部系统：无（不支持 API）

### 2.2 通信边界
```
[浏览器] <--HTTPS/WSS--> [Cloudflare Edge]
           <--Worker---> [Durable Objects]
           <--Worker---> [D1/KV/R2]
```

### 2.3 部署位置
- 前端：Cloudflare Pages 或 R2（CDN）
- 后端：Cloudflare Workers（全球 200+ 个数据中心）
- 数据库：Cloudflare D1（SQLite，多地复制）
- 缓存：Cloudflare KV（全球分布式）
- 文件：Cloudflare R2（S3 兼容）

## 3. 模块划分

### 3.1 前端模块

**前端结构**：
```
frontend/
├── index.html           # 入口文件
├── src/
│   ├── main.js          # Vue 应用入口
│   ├── App.vue          # 根组件
│   ├── api.js           # HTTP 客户端
│   ├── store.js         # 状态管理（Reactive）
│   ├── router.js        # 路由配置
│   ├── components/      # 通用组件
│   ├── pages/           # 页面组件
│   └── style.css        # 全局样式
├── vite.config.js       # Vite 配置
└── package.json
```

**主要页面**：
- login.vue：登录页
- dashboard.vue：主聊天界面
- admin.vue：管理后台
- 404.vue：错误页

**关键组件**：
- ChatWindow：消息窗口（实时更新）
- UserList：用户列表
- GroupList：群组列表
- FileUpload：文件上传
- MessageInput：消息输入框

### 3.2 后端模块

**后端结构**：
```
worker/
├── src/
│   ├── index.js         # 主入口与路由注册
│   ├── middleware.js    # 认证与授权中间件
│   ├── auth.js          # 会话管理
│   ├── db.js            # 数据库查询函数
│   ├── api/
│   │   ├── auth.js      # 登录、注销端点
│   │   ├── message.js   # 消息 API
│   │   ├── group.js     # 群组 API
│   │   ├── user.js      # 用户 API
│   │   ├── admin.js     # 管理员操作
│   │   └── upload.js    # 文件上传
│   ├── do/
│   │   └── ChannelRoom.js # Durable Object（WebSocket 管理）
│   ├── audit.js         # 审计日志
│   ├── permissions.js   # 权限检查
│   ├── validation.js    # 输入验证
│   ├── schema.sql       # 数据库 DDL
│   └── migrations/      # 数据库迁移脚本
├── wrangler.toml        # Worker 配置
└── package.json
```

**主要模块职责**：
- index.js：路由分发、CORS、错误处理
- middleware.js：提取并验证会话令牌
- auth.js：密码验证、会话创建、过期检查
- db.js：所有 SQL 查询封装
- validation.js：XSS 防护、输入清理
- permissions.js：权限检查函数
- audit.js：审计日志记录
- ChannelRoom.js：WebSocket 连接、消息广播、速率限制

## 4. 数据流与通信模式

### 4.1 登录流程
```
[用户] -> [前端] -> [Worker /api/auth/login]
       -> [数据库查询用户]
       -> [密码验证（PBKDF2）]
       -> [创建会话，存储在 KV]
       -> [返回 HttpOnly Cookie]
       -> [前端存储会话状态]
```

### 4.2 消息发送流程
```
[用户输入] -> [前端] -> [WebSocket 连接到 ChannelRoom Durable Object]
          -> [验证会话、权限]
          -> [速率限制检查]
          -> [消息大小检查]
          -> [消息内容清理（XSS）]
          -> [写入 D1 数据库]
          -> [广播给所有在线连接]
          -> [离线用户在上线时拉取历史]
```

### 4.3 群组创建流程
```
[创建请求] -> [Worker /api/group/create]
          -> [权限检查（登录用户）]
          -> [输入验证（群组名、描述）]
          -> [原子插入：群组 + 成员关系]
          -> [返回群组 ID]
          -> [前端刷新群组列表]
```

## 5. 数据模型（简化视图）

### 5.1 主要实体

**用户表（users）**：
- id、username、password_hash、display_name、avatar_url、is_admin

**群组表（channels）**：
- id、name、description、avatar_url、is_private、dm_key（用于 DM）

**消息表（messages）**：
- id、channel_id、user_id、content、created_at、is_deleted

**成员关系表（channel_members）**：
- id、channel_id、user_id、joined_at

**会话表（KV）**：
- key: 会话令牌、value: {userId, expiresAt, createdAt}

**审计日志表（admin_audit_log）**：
- id、admin_user_id、action、target_type、target_id、details、ip_address、user_agent、created_at

### 5.2 关键索引
- messages(channel_id, created_at)：历史消息查询
- channel_members(channel_id, user_id)：成员检查
- users(username)：登录查询
- admin_audit_log(admin_user_id, created_at)：审计查询

## 6. 安全架构

### 6.1 身份验证
- 用户名 + 密码登录
- PBKDF2 密码哈希（10 万次迭代）
- 会话存储在 HttpOnly、Secure、SameSite 的 Cookie

### 6.2 授权
- 中间件验证会话有效性和过期时间
- 权限检查函数：requireChannelAccess、canSendMessage 等
- 防止权限提升攻击

### 6.3 数据保护
- 消息内容 XSS 清理（HTML 标签移除）
- 文件上传黑名单（.php、.exe、.sh 等）
- MIME 类型和扩展名双重验证
- 用户输入长度限制

### 6.4 速率限制
- WebSocket 消息：10 消息/秒/用户
- 消息大小：10KB
- 文件大小：20MB
- 登录尝试：可扩展

### 6.5 审计与合规
- 所有管理员操作记录（创建时间、IP、User-Agent）
- 消息软删除（7 天后自动硬删除）
- 数据导出与隐私删除（待实现）

## 7. 可靠性与容错

### 7.1 故障转移
- Cloudflare 自动负载均衡（多数据中心）
- D1 数据库自动备份
- KV 分布式副本（多个地域）

### 7.2 并发处理
- DM 频道创建：INSERT OR IGNORE 原子操作
- WebSocket 广播：连接快照 + Promise.allSettled
- 数据库连接：无连接池（Workers 特性）

### 7.3 消息持久化
- 所有消息立即写入 D1
- 非实时模式：轮询拉取历史（降级方案）
- 离线用户：上线后自动同步

## 8. 扩展性设计

### 8.1 水平扩展
- 无状态 Worker（可自动扩展）
- Durable Objects：单个频道一个实例（自动分片）
- D1：支持单表千万级行数

### 8.2 垂直扩展
- 缓存策略：频繁查询使用 KV
- 索引优化：关键字段加索引
- 消息分页：避免一次加载全部

### 8.3 功能扩展
- 插件架构预留（目前不实现）
- API 版本管理（/v1/、/v2/）
- 特性开关（环境变量控制）

## 9. 部署拓扑

### 9.1 生产环境
```
[用户浏览器（全球）]
         ↓ HTTPS
[Cloudflare Edge Network（200+ 个 POP）]
         ↓
[Cloudflare Workers（全球执行）]
         ↓
[Durable Objects（就近执行）]
         ↓
[D1（多地复制）] + [KV（全球缓存）] + [R2（多地存储）]
```

### 9.2 开发环境
```
[本地浏览器]
      ↓ HTTP
[本地开发服务器（npm run dev）]
      ↓
[本地 SQLite + 内存 KV]
```

## 10. 性能考虑

### 10.1 延迟优化
- Durable Objects 就近执行（最近的地域）
- KV 全球缓存（< 10ms 访问）
- Worker 边缘计算（避免中心数据中心往返）

### 10.2 吞吐量优化
- 异步日志写入（不阻塞请求）
- 数据库连接池（Workers 层）
- 消息批处理（每 100ms 写一次）

### 10.3 存储优化
- 消息软删除（节省存储，便于恢复）
- 自动清理过期会话（保持 KV 洁净）
- 文件生命周期管理（R2）

## 11. 监测与可观测性

### 11.1 日志
- 结构化日志（JSON 格式）
- 审计日志（所有写操作）
- 错误追踪（包含堆栈和上下文）

### 11.2 指标
- API 响应时间分布
- 消息发送成功率
- WebSocket 连接数
- 数据库查询性能

### 11.3 告警阈值
- 错误率 > 1%：触发告警
- 响应时间 > 1s：触发告警
- 数据库连接错误：立即告警

## 变更记录

### v2.0.0
- 新增：安全架构详细说明
- 新增：审计日志和权限模块
- 修改：WebSocket 竞态条件修复
- 新增：速率限制和消息验证

### v1.0.0
- 初始架构设计
