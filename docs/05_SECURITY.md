# Edgechat 安全与合规规范

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 1. 安全架构与防护策略

### 1.1 防护分层

```
第1层：边界防护（CORS、CSP、速率限制）
第2层：身份验证（密码、会话、HttpOnly Cookie）
第3层：授权与权限（细粒度权限检查）
第4层：输入验证（XSS 防护、长度检查）
第5层：审计与监测（所有操作记录）
```

### 1.2 设计原则
- 安全默认（Secure by Default）
- 最小权限原则（Least Privilege）
- 深度防御（Defense in Depth）
- 可验证性（Verifiable）

## 2. 身份验证

### 2.1 密码策略

**密码哈希**：
- 算法：PBKDF2-SHA256
- 迭代次数：100,000
- 盐：加密生成的随机盐（每用户独立）
- 输出长度：256 位

**密码复杂性**（管理员创建用户时）：
- 最小长度：8 字符
- 无强制大小写或特殊字符要求（便于用户记忆）

**密码重置**：
- 仅管理员可执行
- 防止自我锁定（不允许重置自己密码）
- 防止权限降级（不允许重置其他管理员）
- 重置后用户需用新密码重新登录

### 2.2 会话管理

**会话创建**：
- 触发条件：用户成功登录
- 数据结构（存储于 KV）：
  ```javascript
  {
    userId: 1,
    username: "alice",
    createdAt: 1609459200000,
    expiresAt: 1610064000000,  // 7 天后
    ip: "203.0.113.1",
    userAgent: "Mozilla/5.0..."
  }
  ```
- 存储位置：Cloudflare KV
- 键生成：加密哈希（防止会话预测）

**会话验证**：
- 验证令牌有效性
- 验证过期时间（createdAt + 7 天）
- 验证会话是否在 KV 中存在
- 每次请求都验证（无本地缓存）

**会话过期**：
- 有效期：7 天
- 过期后自动从 KV 删除（由清理任务）
- 过期会话不能用于任何操作
- 用户需重新登录

**会话注销**：
- 从 KV 删除会话记录
- 清除 Cookie（设置 maxAge=0）

### 2.3 Cookie 安全

**HttpOnly Cookie 配置**：
```javascript
c.cookie('cfchat_token', sessionToken, {
  httpOnly: true,    // 防止 JavaScript 访问（XSS）
  secure: true,      // 仅 HTTPS 传输
  sameSite: 'Strict',// 防止 CSRF（拒绝跨站请求）
  maxAge: 604800,    // 7 天（秒）
  path: '/',
  domain: '.example.com'  // 可选，允许子域使用
});
```

**为什么使用 HttpOnly**：
- 防止 XSS 攻击盗取令牌
- 令牌自动在请求中发送（浏览器行为）
- 不允许前端 JavaScript 读取

## 3. 授权与权限

### 3.1 权限模型

**用户角色**：
- 普通用户：基础聊天功能
- 群主：管理自己创建的频道
- 管理员：全局权限，审计操作

**权限检查函数**（worker/src/permissions.js）：

```javascript
// 基础访问权限：用户是否是频道成员
requireChannelAccess(userId, channelId)

// 管理权限：用户是否是频道群主
requireChannelManagement(userId, channelId)

// 消息权限：用户是否可向频道发送消息
canSendMessage(userId, channelId)

// 删除权限：用户是否可删除此消息
canDeleteMessage(userId, messageId)

// 管理员权限：用户是否是系统管理员
requireAdmin(userId)
```

### 3.2 权限检查流程

**每个受保护的 API 调用**：
```
1. 验证会话（validateSession）
2. 提取用户 ID
3. 检查操作类型所需权限
4. 检查权限是否满足
5. 如果权限不足，返回 403 Forbidden
6. 如果权限满足，执行操作
7. 记录到审计日志（管理员操作）
```

### 3.3 防止权限提升

**禁止行为**：
- 普通用户不能修改自己的 is_admin 字段
- 非管理员不能调用管理端点
- 用户不能重置他人密码
- 用户不能查看其他用户的私密信息

**实现方式**：
- 权限检查在服务端执行（不信任前端）
- 每个需要权限的操作都有对应的检查函数
- 权限检查失败返回 403 错误

## 4. 输入验证与清理

### 4.1 验证规则（worker/src/validation.js）

**用户名验证**：
```javascript
validateUsername(username)
  - 长度：3-32 字符
  - 字符集：a-z、0-9、_、-（无特殊字符）
```

**密码验证**：
```javascript
validatePassword(password)
  - 最小长度：8 字符
  - 最大长度：128 字符
  - 允许任何字符（包括空格、特殊字符）
```

**消息内容验证**：
```javascript
validateMessage(content)
  - 最小长度：1 字符
  - 最大长度：10,000 字符
  - 最大字节数：10KB（UTF-8）
  - 自动 HTML 清理：sanitizeText(content)
```

**群组名验证**：
```javascript
validateChannelName(name)
  - 长度：1-100 字符
  - 允许中英文、数字、空格、连字符
```

**文件名验证**：
```javascript
validateFileName(filename)
  - 最大长度：256 字符
  - 禁止路径遍历（../）
  - 禁止特殊路径（CON、PRN、AUX 等）
```

### 4.2 XSS 防护

**HTML 清理规则**（sanitizeText 函数）：
- 移除所有 HTML 标签（< > 字符）
- 转义特殊字符（<、>、&、"、'）
- 移除事件处理器属性（onclick、onload 等）
- 禁止 JavaScript 协议（javascript:）
- 禁止数据协议（data:text/html）

**清理示例**：
```
输入：<img src=x onerror="alert('xss')">
输出：&lt;img src=x onerror=&quot;alert('xss')&quot;&gt;

输入：<script>alert('xss')</script>
输出：&lt;script&gt;alert('xss')&lt;/script&gt;

输入：Hello <b>world</b>
输出：Hello &lt;b&gt;world&lt;/b&gt;
```

**为什么需要清理**：
- 存储后的消息显示在其他用户浏览器中
- 恶意 HTML 可能被解析执行
- 清理后的文本完全安全（纯文本展示）

### 4.3 SQL 注入防护

**预防措施**：
- 仅使用参数化查询（绑定变量）
- 不允许字符串拼接构造 SQL
- 所有用户输入都通过验证函数处理

**正确示例**：
```javascript
// 正确：使用参数绑定
db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

// 错误：字符串拼接（禁止）
db.prepare(`SELECT * FROM users WHERE id = ${userId}`).first();
```

## 5. 文件上传安全

### 5.1 文件类型验证

**双重验证**：
1. MIME 类型检查（Content-Type 头）
2. 文件扩展名检查

**白名单（允许上传）**：
- 图片：image/jpeg、image/png、image/gif、image/webp
- 视频：video/mp4、video/webm、video/quicktime
- 文档：application/pdf

**黑名单（禁止上传）**：
- 执行文件：.exe、.bat、.cmd、.com、.sh、.bash、.zsh
- Web 脚本：.php、.phtml、.php3-5、.asp、.aspx、.jsp、.jspx、.py、.rb、.pl
- 系统文件：.dll、.so、.dylib、.app、.deb、.rpm、.msi
- 配置文件：.htaccess、.conf、.config、.ini
- 归档文件：.zip（可选）
- Java：.jar、.class、.war

**为什么使用黑名单**：
- 防止上传可执行文件（被服务器执行）
- 防止上传脚本文件（被浏览器或解释器执行）
- 防止上传系统配置文件

### 5.2 文件大小限制

- 最大文件大小：20MB
- 超过限制的文件被拒绝

### 5.3 文件存储

- 存储位置：Cloudflare R2（S3 兼容对象存储）
- 访问方式：公开读（无需认证）
- 文件命名：UUID + 原始扩展名（防止冲突）
- 无执行权限（R2 仅提供静态存储，不执行）

## 6. 通信安全

### 6.1 传输层安全

**HTTPS/TLS**：
- 所有通信必须通过 HTTPS
- TLS 1.2 或更高版本
- HTTP 自动重定向到 HTTPS
- Cloudflare 自动处理 SSL/TLS 证书

**WebSocket 安全**：
- 使用 WSS（WebSocket Secure）
- 基于 TLS 加密
- 禁止明文 WS 连接

### 6.2 跨域资源共享（CORS）

**CORS 策略**：
- 使用白名单机制（不允许 * 通配符）
- 白名单配置于环境变量 ALLOWED_ORIGINS
- 示例：
  ```
  ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
  ```

**CORS 头**：
```
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

**为什么使用白名单**：
- 防止 CORS 放松导致的跨域请求滥用
- 恶意网站无法调用此 API
- 即使有漏洞，只能通过白名单的源发起

### 6.3 CSRF 防护

**SameSite Cookie**：
- 配置：sameSite: 'Strict'
- 效果：浏览器拒绝在跨站请求中发送 Cookie
- 防止：来自恶意网站的伪造请求

## 7. 速率限制

### 7.1 WebSocket 消息限制

**规则**：
- 每用户最多 10 消息/秒
- 超限消息被拒绝
- 返回错误响应

**实现**：
- 使用滑动时间窗口
- 跟踪用户最近消息的时间戳
- 如果最近 1 秒内消息数 >= 10，拒绝新消息

### 7.2 登录尝试限制（可选）

**规则**：
- 同一 IP：最多 5 次失败登录/10 分钟
- 同一用户名：最多 10 次失败登录/10 分钟
- 超限返回 429 Too Many Requests

## 8. 审计与日志

### 8.1 审计日志记录

**记录的操作**（表 admin_audit_log）：
- reset_password：管理员重置用户密码
- delete_user：管理员删除用户
- delete_message：管理员删除消息
- 其他管理员操作：根据需要扩展

**记录内容**：
- 操作者用户 ID（admin_user_id）
- 操作类型（action）
- 目标类型和 ID（target_type、target_id）
- 操作详情（details，JSON 格式）
- 请求来源 IP（ip_address）
- 浏览器标识（user_agent）
- 操作时间（created_at）

**敏感字段处理**：
- 不记录新密码值（仅记录"密码已重置"）
- 删除操作记录被删除的数据 ID 和数量
- 其他字段尽量完整，便于审计

### 8.2 日志访问

**访问权限**：
- 仅管理员可查看审计日志
- 普通用户无访问权限

**查询接口**（待实现）：
```
GET /api/admin/audit-logs?action=reset_password&limit=100&offset=0
```

### 8.3 日志保留

- 审计日志无自动删除（长期保存）
- 定期备份（由 Cloudflare 处理）
- 支持数据导出与分析

## 9. 敏感数据保护

### 9.1 密钥与密码

**不存储的信息**：
- 用户登录密码（仅存哈希）
- API 密钥（如存在）
- 令牌或会话密钥明文

**存储方式**：
- 密码：PBKDF2 哈希（单向加密）
- 会话令牌：KV 中加密存储

### 9.2 个人隐私数据

**用户可见字段**（非敏感）：
- username、displayName、avatarUrl、userId

**仅用户自己可见**：
- 用户当前在线状态（未实现）
- 用户最后活动时间（未实现）

**仅管理员可见**：
- is_admin 标志
- 用户创建时间
- 用户的所有消息（审计用途）

### 9.3 数据最小化

- 仅收集必需的用户信息
- 不存储 IP 地址历史（仅审计日志中存储）
- 消息软删除后 7 天硬删除

## 10. 依赖与供应链安全

### 10.1 依赖管理

**审计流程**：
- 新增依赖需先进行 npm audit
- 发现漏洞需评估和修复
- 禁止使用已停止维护的库

**版本锁定**：
- 使用精确版本号（不用 ^、~ 指定符）
- package-lock.json 必须提交版本控制
- 定期更新依赖（安全更新优先）

## 11. 安全事件响应

### 11.1 发现安全问题的流程

1. 确认漏洞的真实性和严重程度
2. 立即创建补丁分支
3. 修复漏洞并充分测试
4. 发布补丁版本（紧急发布）
5. 通知用户升级
6. 记录到安全日志

### 11.2 重大安全事件

- 立即停止受影响的功能
- 备份相关数据
- 通知管理员和用户
- 发布安全公告

## 12. 合规要求

### 12.1 数据保护

- 支持用户数据导出（待实现）
- 支持用户数据删除（待实现）
- 消息保留期可配置

### 12.2 访问控制

- 所有访问都需认证（公开频道除外）
- 权限严格分离
- 无硬编码的后门账号

### 12.3 安全更新

- 关键漏洞修复：7 天内发布补丁
- 高风险漏洞修复：30 天内发布补丁
- 中等风险漏洞修复：90 天内发布补丁

## 13. 部署安全清单

部署前检查：
- [ ] 环境变量已设置（ALLOWED_ORIGINS、JWT_SECRET 等）
- [ ] HTTPS 已启用
- [ ] CORS 白名单已配置
- [ ] 数据库已初始化且备份存在
- [ ] 文件上传验证已启用
- [ ] 审计日志表已创建
- [ ] WebSocket 速率限制已启用
- [ ] 管理员账号已创建
- [ ] 日志监测已配置

## 变更记录

### v2.0.0
- 新增：完整的安全架构文档
- 新增：审计日志与合规要求
- 新增：文件上传安全规范
- 修改：HttpOnly Cookie 强制要求
- 新增：敏感数据保护规范

### v1.0.0
- 初版安全设计（不完整）
