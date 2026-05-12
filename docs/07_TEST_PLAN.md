# Edgechat 测试计划与验收规范

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 1. 测试分层

### 1.1 分层结构

```
单元测试（Unit）          - 函数级别
集成测试（Integration）    - 模块级别
端到端测试（E2E）         - 用户场景级别
性能测试（Performance）    - 负载测试
安全测试（Security）      - 漏洞扫描
```

### 1.2 测试分布（推荐比例）

- 单元测试：60%
- 集成测试：25%
- 端到端测试：15%
- 性能测试：持续监测
- 安全测试：每个版本必做

## 2. 单元测试

### 2.1 范围

所有工具函数和业务逻辑函数：
- worker/src/validation.js
- worker/src/permissions.js
- worker/src/auth.js
- worker/src/audit.js

### 2.2 测试用例示例

**validateUsername 函数**：
```javascript
test('validateUsername accepts valid username', () => {
  assert(validateUsername('alice') === true);
});

test('validateUsername rejects username < 3 chars', () => {
  assert(validateUsername('ab') === false);
});

test('validateUsername rejects special characters', () => {
  assert(validateUsername('alice@') === false);
});
```

**sanitizeText 函数**：
```javascript
test('sanitizeText removes HTML tags', () => {
  const input = '<img src=x onerror="alert(1)">';
  const output = sanitizeText(input);
  assert(!output.includes('<'));
  assert(!output.includes('>'));
});

test('sanitizeText preserves plain text', () => {
  const input = 'Hello world';
  assert(sanitizeText(input) === input);
});
```

### 2.3 覆盖率目标

- 关键安全函数：100% 覆盖
- 验证函数：100% 覆盖
- 工具函数：> 80% 覆盖

## 3. 集成测试

### 3.1 范围

API 端点与数据库交互：
- 登录流程（创建会话、检查权限）
- 消息发送（权限检查、XSS 清理、入库）
- 群组创建（原子操作、成员关系）

### 3.2 测试场景

**场景 1：用户登录**
```
前置条件：用户 'alice' 存在，密码为 'password123'
步骤 1：POST /api/auth/login，用户名 'alice'，密码 'password123'
预期结果 1：返回 200，Cookie 中包含 cfchat_token
预期结果 2：Token 有效期为 7 天
预期结果 3：后续请求自动验证 Token 有效性
```

**场景 2：发送消息**
```
前置条件：用户已登录，频道存在，用户是成员
步骤 1：发送消息 "Hello"
预期结果 1：消息入库，id 分配
预期结果 2：内容被清理（< 转义为 &lt;）
预期结果 3：消息实时推送给其他在线成员
```

**场景 3：权限检查**
```
前置条件：用户 A 创建私有频道，未邀请用户 B
步骤 1：用户 B 尝试发送消息到此频道
预期结果 1：返回 403 Forbidden
预期结果 2：没有对数据库造成任何修改
```

### 3.3 关键路径

必须测试的路径：
1. 登录 -> 发送消息 -> 查看历史 -> 注销
2. 创建群组 -> 邀请成员 -> 删除群组
3. 文件上传 -> 删除文件
4. 管理员重置密码 -> 审计日志

## 4. 端到端测试

### 4.1 范围

从用户界面到后端的完整流程。

### 4.2 测试工具

推荐：Playwright 或 Cypress（支持 WebSocket）

### 4.3 测试用例

**用例 1：完整的聊天流程**
```
1. 打开浏览器，访问 http://localhost:5173
2. 输入用户名 'alice'，密码 'password123'，点击登录
3. 等待页面加载，验证登录成功
4. 点击频道列表中的 'general'
5. 在消息输入框输入 "Hello, World!"
6. 按回车发送
7. 等待消息出现在聊天窗口（< 1 秒）
8. 验证消息作者显示正确
9. 刷新页面，验证消息仍然存在（持久化）
```

**用例 2：创建私有群组**
```
1. 点击 "创建群组" 按钮
2. 输入群组名 "Team A"
3. 选择 "私有"
4. 点击 "创建"
5. 验证群组出现在列表中
6. 邀请用户 'bob'
7. 以 'bob' 的身份登录，验证群组可见
8. 发送一条消息
9. 切换回 'alice'，验证消息可见
```

## 5. 性能测试

### 5.1 性能指标

必须满足：
- 登录响应时间：< 200ms（平均）
- API 响应时间：< 500ms（p99）
- WebSocket 消息延迟：< 100ms
- 页面加载时间：< 2s（首屏）

### 5.2 压力测试场景

**场景 1：并发消息**
```
- 100 个用户并发登录
- 每个用户在同一频道发送 10 条消息
- 预期：无错误，延迟 < 100ms
```

**场景 2：历史消息查询**
```
- 单个用户查询包含 100 万条消息的频道
- 分页加载（每页 50 条）
- 预期：响应时间 < 500ms
```

**场景 3：大文件上传**
```
- 上传 19.9MB 的文件
- 预期：成功，上传时间 < 30s
```

### 5.3 压力测试工具

推荐：Apache JMeter、k6

### 5.4 监测与报告

每次发布前进行性能测试，记录基准值。

## 6. 安全测试

### 6.1 范围

- XSS 漏洞
- SQL 注入
- CSRF 攻击
- 权限绕过
- 敏感信息泄露

### 6.2 XSS 测试

**测试用例**：
```javascript
// 尝试上传包含脚本的消息
const maliciousMessage = '<img src=x onerror="alert(1)">';
// 预期：消息被清理，script 不执行
```

### 6.3 SQL 注入测试

**测试用例**：
```javascript
// 用户名字段注入 SQL
const maliciousUsername = "' OR '1'='1";
// 预期：登录失败，无数据泄露
```

### 6.4 权限绕过测试

**测试用例**：
```javascript
// 普通用户尝试调用管理员接口
POST /api/admin/users/1/reset-password
// 预期：返回 403 Forbidden
```

### 6.5 CORS 测试

**测试用例**：
```javascript
// 来自未授权源的跨域请求
fetch('http://attacker.com')
  .then(() => fetch('https://chat.example.com/api/messages'))
// 预期：请求被浏览器 CORS 策略阻止
```

### 6.6 速率限制测试

**测试用例**：
```javascript
// 单个用户 2 秒内发送 30 条消息
for (let i = 0; i < 30; i++) {
  await sendMessage('test');
}
// 预期：第 11+ 条消息被拒绝，返回 429
```

## 7. 回归测试

### 7.1 范围

每次更新后必须重新运行的测试：
- 所有单元测试
- 关键集成测试
- 关键端到端测试

### 7.2 测试清单

- [ ] 用户登录
- [ ] 发送消息
- [ ] 创建群组
- [ ] 文件上传
- [ ] 权限检查
- [ ] 管理员操作
- [ ] WebSocket 连接
- [ ] 历史消息加载

## 8. 验收标准

### 8.1 功能验收

所有功能必须满足：
- 功能完整（PRD 中定义的所有功能）
- 无关键 Bug
- 性能达标
- 安全无漏洞

### 8.2 质量门槛

进入生产环境前必须满足：
- 代码覆盖率 > 70%
- 所有单元测试通过
- 关键集成测试通过
- 性能测试通过
- 安全审计通过
- 文档完整且更新

### 8.3 发布审批流程

1. 开发人员完成功能实现
2. 提交拉取请求（PR）
3. 代码审查（至少 2 人）
4. 自动化测试通过
5. 手动验收测试
6. 安全审计通过
7. 产品负责人签署
8. 发布到生产环境

## 9. Bug 分类与处理

### 9.1 严重级别

**P0 - 关键**：
- 数据丢失或损坏
- 安全漏洞
- 系统无法运行
- 处理时间：立即

**P1 - 高**：
- 主功能不可用
- 重要功能受影响
- 处理时间：1 天

**P2 - 中**：
- 次要功能问题
- 性能下降
- 处理时间：1 周

**P3 - 低**：
- 用户体验改进
- 小的 UI 问题
- 处理时间：灵活

### 9.2 Bug 追踪

使用 GitHub Issues 或 JIRA：
- 标题：清晰描述问题
- 描述：重现步骤、预期结果、实际结果
- 附件：截图或日志
- 优先级：P0-P3

## 10. 测试环境

### 10.1 开发环境
- 本地运行：npm run dev
- 数据库：SQLite（内存或文件）
- 会话：内存 KV

### 10.2 测试环境
- 独立 Cloudflare Worker
- 专用 D1 数据库
- 数据隔离（不影响生产）

### 10.3 预发布环境
- 与生产配置相同
- 真实数据子集
- 完整的监测

## 11. 测试报告

### 11.1 每次发布的报告应包含

- 测试覆盖率
- 通过/失败的测试数量
- 发现的 Bug 数量和严重级别
- 性能基准值
- 安全审计结果

### 11.2 示例报告

```
Edgechat v2.0.0 Test Report
Date: 2026-05-03

Coverage:
  Statements: 75%
  Branches: 68%
  Functions: 82%
  Lines: 77%

Test Results:
  Passed: 245/250
  Failed: 5
  Skipped: 0

Bugs Found:
  P0: 0
  P1: 2 (已修复)
  P2: 3 (已修复)
  P3: 5 (推迟修复)

Performance:
  Login: 150ms (目标 < 200ms) ✓
  Message Send: 45ms (目标 < 100ms) ✓
  Page Load: 1.8s (目标 < 2s) ✓

Security:
  XSS Tests: 12/12 通过 ✓
  SQL Injection: 8/8 通过 ✓
  CSRF: 5/5 通过 ✓
  Permission: 20/20 通过 ✓
```

## 变更记录

### v2.0.0
- 新增：完整的测试计划
- 新增：安全测试用例
- 新增：性能基准
- 新增：验收标准

### v1.0.0
- 初版测试计划
