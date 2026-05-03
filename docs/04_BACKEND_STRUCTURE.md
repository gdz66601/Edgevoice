# Edgechat 后端结构与接口规范

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 1. 数据库模式（完整）

### 1.1 用户表（users）

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_admin ON users(is_admin);
```

**字段说明**：
- username：唯一用户名，登录凭证
- password_hash：PBKDF2 哈希值，不存明文
- display_name：用户昵称，可重复
- avatar_url：头像 URL（R2 地址）
- is_admin：管理员标志（0=否，1=是）
- created_at、updated_at：时间戳

### 1.2 群组表（channels）

```sql
CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  is_private INTEGER DEFAULT 0,
  owner_id INTEGER NOT NULL,
  dm_key TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_channels_owner_id ON channels(owner_id);
CREATE INDEX idx_channels_is_private ON channels(is_private);
CREATE INDEX idx_channels_dm_key ON channels(dm_key);
```

**字段说明**：
- name：群组名称
- description：群组描述
- avatar_url：群组头像（R2 地址）
- is_private：0=公开，1=私有
- owner_id：群主用户 ID
- dm_key：私信标记（格式：user1_id-user2_id，已排序）
- 创建/更新时间

**业务规则**：
- 公开群组：任何人可加入
- 私有群组：需群主邀请
- DM：system 自动创建 DM 频道，DM_KEY 确保一对一唯一

### 1.3 频道成员表（channel_members）

```sql
CREATE TABLE channel_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(channel_id, user_id)
);

CREATE INDEX idx_channel_members_user_id ON channel_members(user_id);
CREATE INDEX idx_channel_members_channel_id ON channel_members(channel_id);
```

**字段说明**：
- channel_id、user_id：联合唯一约束（防止重复加入）
- joined_at：加入时间

**业务规则**：
- 加入群组时插入记录
- 删除用户时级联删除其所有成员关系
- 查询权限时检查是否存在于此表

### 1.4 消息表（messages）

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_channel_id_created_at
  ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_is_deleted ON messages(is_deleted);
```

**字段说明**：
- channel_id：所属频道
- user_id：发送者
- content：消息内容（已清理的 HTML/纯文本）
- is_deleted：软删除标志（0=活跃，1=已删除）
- created_at：发送时间
- deleted_at：删除时间（仅软删除时填充）

**业务规则**：
- 消息立即写入 D1（持久化）
- 软删除后 7 天自动硬删除（通过 cron 触发）
- 历史查询默认不包含已删除消息

### 1.5 审计日志表（admin_audit_log）

```sql
CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_audit_admin_user_created_at
  ON admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX idx_audit_action_created_at
  ON admin_audit_log(action, created_at DESC);
CREATE INDEX idx_audit_target
  ON admin_audit_log(target_type, target_id, created_at DESC);
```

**字段说明**：
- admin_user_id：操作者用户 ID
- action：操作类型（reset_password、delete_user、create_channel 等）
- target_type：目标类型（user、channel、message）
- target_id：目标 ID
- details：JSON 格式的操作详情（变更前后值）
- ip_address：请求来源 IP
- user_agent：请求浏览器信息
- created_at：操作时间

**业务规则**：
- 所有管理员操作必须记录
- 敏感字段（如新密码）不存储原文
- 查询需按时间范围或操作者过滤

## 2. API 接口规范

### 2.1 通用响应格式

所有 API 返回 JSON：

```javascript
// 成功响应
{
  "code": 0,
  "message": "OK",
  "data": { /* 业务数据 */ }
}

// 错误响应
{
  "code": 40001,  // 错误码
  "message": "用户不存在",
  "data": null
}
```

**状态码映射**：
- 200：请求成功
- 400：请求格式错误
- 401：未授权（无效会话）
- 403：禁止访问（权限不足）
- 404：资源不存在
- 429：请求过频（速率限制）
- 500：服务器错误

### 2.2 认证接口

#### POST /api/auth/login

**功能**：用户登录，创建会话

**请求**：
```javascript
{
  "username": "alice",
  "password": "password123"
}
```

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "userId": 1,
    "username": "alice",
    "displayName": "Alice",
    "isAdmin": false
  }
}
```

**失败响应（401）**：
```javascript
{
  "code": 40101,
  "message": "用户名或密码错误",
  "data": null
}
```

**服务端操作**：
1. 查询用户（username）
2. 验证密码哈希
3. 如果正确，创建会话并写入 KV
4. 设置 HttpOnly Cookie：cfchat_token
5. Cookie 属性：secure=true、sameSite=Strict、maxAge=604800（7 天）

#### POST /api/auth/logout

**功能**：用户注销，清除会话

**请求**：无（使用 Cookie）

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "注销成功",
  "data": null
}
```

**服务端操作**：
1. 验证会话有效性
2. 从 KV 删除会话
3. 设置 Cookie 过期：maxAge=0

### 2.3 消息接口

#### POST /api/messages

**功能**：发送消息到指定频道

**请求**：
```javascript
{
  "channelId": 123,
  "content": "Hello, world!"
}
```

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "消息已发送",
  "data": {
    "messageId": 456,
    "channelId": 123,
    "userId": 1,
    "content": "Hello, world!",
    "createdAt": "2026-05-03T10:30:00Z"
  }
}
```

**失败响应（403）**：
```javascript
{
  "code": 40301,
  "message": "您无权向此频道发送消息",
  "data": null
}
```

**服务端处理**：
1. 验证会话
2. 权限检查：canSendMessage(userId, channelId)
3. 消息内容清理：sanitizeText(content)
4. 验证内容长度和大小（< 10KB）
5. 速率限制检查：< 10 消息/秒
6. 写入 D1 数据库
7. 通过 WebSocket 广播给频道内所有连接

#### GET /api/messages?channelId=123&limit=50&offset=0

**功能**：分页获取频道历史消息

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "OK",
  "data": {
    "messages": [
      {
        "messageId": 456,
        "userId": 1,
        "userName": "alice",
        "content": "Hello, world!",
        "createdAt": "2026-05-03T10:30:00Z"
      },
      /* ... 更多消息 ... */
    ],
    "total": 1500,
    "hasMore": true
  }
}
```

**查询参数**：
- channelId：必需
- limit：最多 100，默认 50
- offset：分页偏移，默认 0
- reverse：true 时按时间倒序（新消息优先）

**服务端处理**：
1. 验证会话和权限
2. 查询消息（排除 is_deleted=1）
3. 按 created_at 排序
4. 返回总数和是否有更多

#### DELETE /api/messages/{messageId}

**功能**：删除消息（软删除）

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "消息已删除",
  "data": null
}
```

**服务端处理**：
1. 验证会话
2. 检查权限：用户是消息发送者或管理员
3. 软删除：设置 is_deleted=1、deleted_at=NOW()
4. 广播消息删除事件

### 2.4 群组接口

#### POST /api/channels

**功能**：创建新群组

**请求**：
```javascript
{
  "name": "项目讨论",
  "description": "团队项目讨论频道",
  "isPrivate": true
}
```

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "群组已创建",
  "data": {
    "channelId": 123,
    "name": "项目讨论",
    "isPrivate": true,
    "ownerId": 1
  }
}
```

**服务端处理**：
1. 验证会话
2. 验证输入（名称长度、描述长度）
3. 原子操作：
   - INSERT 群组
   - INSERT 创建者为成员
4. 返回群组 ID

#### GET /api/channels

**功能**：列出用户可访问的所有频道

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "OK",
  "data": {
    "channels": [
      {
        "channelId": 1,
        "name": "通知",
        "isPrivate": false,
        "memberCount": 50,
        "avatarUrl": "https://r2.example.com/..."
      },
      /* ... 更多频道 ... */
    ]
  }
}
```

**服务端处理**：
1. 验证会话
2. 查询逻辑：
   - 公开频道：全部返回
   - 私有频道：仅返回用户是成员的
   - DM：仅返回用户参与的

#### POST /api/channels/{channelId}/members

**功能**：群主邀请成员加入私有群组

**请求**：
```javascript
{
  "userId": 2
}
```

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "成员已添加",
  "data": null
}
```

**服务端处理**：
1. 验证会话
2. 权限检查：用户必须是群组群主
3. 检查成员是否已加入（防止重复）
4. INSERT channel_members
5. 广播成员变化事件

### 2.5 用户接口

#### GET /api/users/me

**功能**：获取当前登录用户信息

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "OK",
  "data": {
    "userId": 1,
    "username": "alice",
    "displayName": "Alice",
    "avatarUrl": "https://r2.example.com/...",
    "isAdmin": false
  }
}
```

### 2.6 管理员接口

#### POST /api/admin/users/{userId}/reset-password

**功能**：管理员重置用户密码

**请求**：
```javascript
{
  "newPassword": "newpass123"
}
```

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "密码已重置",
  "data": null
}
```

**权限检查**：
- 仅管理员可调用
- 不允许重置自己的密码
- 不允许重置其他管理员的密码

**审计**：
- 记录操作到 admin_audit_log
- action = "reset_password"
- 不记录新密码值

#### DELETE /api/admin/users/{userId}

**功能**：管理员删除用户

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "用户已删除",
  "data": null
}
```

**权限检查**：
- 仅管理员可调用
- 不允许删除自己
- 不允许删除其他管理员

**级联删除**：
- 用户的所有消息（软删除）
- 用户的频道成员关系
- 用户创建的私有群组

## 3. 文件上传规范

### 3.1 上传接口

#### POST /api/upload

**请求（multipart/form-data）**：
```
file: <二进制文件>
```

**成功响应（200）**：
```javascript
{
  "code": 0,
  "message": "文件已上传",
  "data": {
    "fileUrl": "https://r2.example.com/files/abc123.jpg",
    "fileSize": 524288,
    "fileName": "photo.jpg",
    "mimeType": "image/jpeg"
  }
}
```

**失败响应（400）**：
```javascript
{
  "code": 40001,
  "message": "文件类型不允许：.exe",
  "data": null
}
```

### 3.2 验证规则

**大小限制**：
- 最大 20MB

**类型白名单**：
- 图片：image/*（jpg、png、gif、webp）
- 视频：video/*（mp4、webm）
- 文档：application/pdf

**扩展名黑名单**：
- 执行文件：.exe、.bat、.sh、.dll、.so、.msi、.deb、.rpm
- Web 脚本：.php、.asp、.jsp、.py、.rb
- 归档：.zip、.rar、.7z（可选禁止）
- 系统文件：.htaccess、.jar、.app

**验证流程**：
1. 检查 MIME 类型（Content-Type）
2. 检查文件扩展名
3. 同时满足白名单且不在黑名单中才接受
4. 检查文件大小
5. 上传到 R2，返回公开 URL

## 4. WebSocket 实时通信

### 4.1 连接建立

**URL**：`wss://worker.example.com/api/ws?channelId=123`

**认证**：
- 从 Cookie 提取会话令牌
- 验证会话有效性
- 检查用户是否是频道成员

**成功连接**：服务端发送确认消息
```javascript
{
  "type": "connected",
  "userId": 1,
  "channelId": 123
}
```

### 4.2 消息格式

**客户端发送**：
```javascript
{
  "type": "message",
  "content": "Hello",
  "timestamp": 1609459200000
}
```

**服务端广播**：
```javascript
{
  "type": "message",
  "messageId": 456,
  "userId": 1,
  "userName": "alice",
  "content": "Hello",
  "createdAt": "2026-05-03T10:30:00Z"
}
```

### 4.3 限流规则

- 最多 10 消息/秒/用户
- 超限消息被拒绝
- 返回错误消息：
```javascript
{
  "type": "error",
  "code": 42901,
  "message": "消息过于频繁，请稍后再试"
}
```

## 5. 鉴权与权限

### 5.1 权限矩阵

| 操作 | 普通用户 | 群主 | 管理员 |
|------|--------|------|--------|
| 发送消息 | 成员频道 | 全部 | 全部 |
| 删除自己的消息 | 支持 | 支持 | 支持 |
| 删除他人消息 | 否 | 频道内 | 全部 |
| 创建频道 | 是 | 是 | 是 |
| 邀请成员 | 否 | 自己的频道 | 全部 |
| 删除频道 | 否 | 自己的频道 | 全部 |
| 查看审计日志 | 否 | 否 | 是 |
| 重置密码 | 否 | 否 | 是 |
| 删除用户 | 否 | 否 | 是 |

### 5.2 权限检查函数

**worker/src/permissions.js**：
```javascript
export async function requireChannelAccess(db, userId, channelId)
export async function canSendMessage(db, userId, channelId)
export async function canDeleteMessage(db, userId, messageId)
export async function canManageChannel(db, userId, channelId)
export async function requireAdmin(db, userId)
```

## 变更记录

### v2.0.0
- 新增：审计日志表
- 新增：安全验证规范
- 修改：消息速率限制从 20/s 降至 10/s
- 新增：HttpOnly Cookie 强制

### v1.0.0
- 初版接口定义
