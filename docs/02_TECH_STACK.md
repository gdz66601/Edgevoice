# Edgechat 技术栈文档

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 1. 运行时与语言

- Node.js: v22.0.0 或更高
- JavaScript: ES2020+（支持 async/await、Optional Chaining）
- TypeScript: 可选（项目使用 JavaScript）

## 2. 前端技术栈

### 2.1 核心框架
- Vue: ^3.5.13
- Vue Router: ^4.5.1
- Vite: ^6.3.5（构建工具）

### 2.2 UI 与样式
- CSS 3（无 CSS 预处理器）
- Markdown 渲染：markdown-it（版本待定）
- 无 UI 框架（原生组件）

### 2.3 HTTP 客户端
- Fetch API（原生）
- axios: 不使用（使用原生 Fetch）

### 2.4 构建与测试
- Vite: ^6.3.5（开发服务器与生产构建）
- npm: 10.2.3（包管理）

## 3. 后端技术栈

### 3.1 运行平台
- Cloudflare Workers（无服务器计算）
- Cloudflare Durable Objects（有状态计算）
- Wrangler: ^4.11.1（部署工具）

### 3.2 核心框架
- Hono: ^4.8.3（轻量级 Web 框架）
- Node 兼容环境（WorkerJS）

### 3.3 数据存储
- Cloudflare D1: SQLite（关系型数据库）
- Cloudflare KV: 键值存储（会话缓存）
- Cloudflare R2: S3 兼容对象存储（文件）

### 3.4 认证与加密
- Web Crypto API（原生）
- PBKDF2（密码哈希）
- SHA-256（签名与哈希）

### 3.5 WebSocket 与实时通信
- WebSocket API（原生）
- Durable Objects WebSocket Hibernation（优化内存使用）

## 4. 依赖清单

### 4.1 前端依赖
```json
{
  "vue": "^3.5.13",
  "vue-router": "^4.5.1",
  "vite": "^6.3.5"
}
```

### 4.2 后端依赖
```json
{
  "hono": "^4.8.3",
  "wrangler": "^4.11.1"
}
```

### 4.3 开发依赖
```json
{
  "npm": "10.2.3 或更高",
  "@biomejs/biome": "2.4.11",
  "@vitejs/plugin-vue": "^5.2.3"
}
```

### 4.4 无依赖强制要求
- 禁止引入大型 UI 框架（React、Angular）
- 禁止使用 jQuery
- 禁止使用 Webpack、Gulp 等复杂构建工具
- 禁止使用 ORM（直接使用 SQL）

## 5. 构建与部署工具链

### 5.1 开发环境
- npm install：安装依赖
- npm run dev：启动开发服务器
- npm run build：生产构建

### 5.2 部署流程
- Wrangler 部署：npx wrangler deploy
- GitHub Actions：自动构建与部署
- 部署目标：Cloudflare Workers

### 5.3 数据库迁移
- 手动 SQL 脚本管理（文件在 worker/migrations/）
- 通过 Wrangler D1 命令执行：wrangler d1 execute

### 5.4 配置管理
- wrangler.toml：Worker 配置（环境变量、路由、绑定）
- .env.local：本地开发环境变量（不提交 git）

## 6. 环境变量管理

所有环境变量在 wrangler.toml 中定义，禁止在代码中硬编码。

### 6.1 生产环境必需变量
```toml
ALLOWED_ORIGINS = "https://yourdomain.com,https://www.yourdomain.com"
ADMIN_USERNAMES = "admin"
DATABASE_URL = "<D1 数据库绑定>"
KV_STORE = "<KV 存储绑定>"
R2_BUCKET = "<R2 存储绑定>"
JWT_SECRET = "<强随机密钥，不暴露于代码>"
```

### 6.2 可选变量
```toml
ENVIRONMENT = "production"
MESSAGE_RETENTION_DAYS = "7"
SOFT_DELETE_RETENTION_DAYS = "60"
MAX_FILE_SIZE = "20971520"
ALLOWED_FILE_TYPES = "image/,video/,application/pdf"
```

## 7. 版本锁定与兼容性

### 7.1 支持范围
- 仅保证列出版本的正常工作
- 新增依赖需文档评审
- 依赖更新需测试所有关键路径

### 7.2 依赖审批流程
1. 新增依赖时必须在此文档中记录
2. 必须说明依赖的用途和理由
3. 必须进行安全审计（npm audit）
4. 必须在开发环境验证
5. 禁止使用 ^、~ 版本指定符，必须使用精确版本

### 7.3 定期审计
- 每月运行 npm audit，检查漏洞
- 发现漏洞需立即升级或替换
- 记录审计日期和结果

## 8. 构建产物

### 8.1 前端构建
- 输出目录：dist/
- 产物：index.html、bundle.js、styles.css
- 大小限制：主 bundle < 500KB

### 8.2 后端构建
- 输出目录：dist/（Wrangler 生成）
- 产物：Worker 脚本
- 上传目标：Cloudflare Workers

## 9. 性能目标与优化

### 9.1 前端性能
- 首屏加载：< 2s
- 脚本大小：< 500KB
- CSS 大小：< 100KB
- 缓存策略：浏览器 1 小时

### 9.2 后端性能
- Worker 冷启动：< 100ms
- API 响应时间：< 500ms（99 分位）
- 数据库查询：< 100ms（优化后）
- 消息延迟：< 100ms

## 10. 安全与依赖

### 10.1 第三方服务
- CDN：Cloudflare（已集成）
- 无需外部服务依赖

### 10.2 密钥管理
- JWT_SECRET：在 Cloudflare 环境变量中存储，不在代码中
- 数据库密码：通过 Cloudflare 绑定，不暴露

### 10.3 安全审计
- npm audit：每月运行
- 依赖安全评分：所有依赖需 B 级以上
- 禁止使用已停止维护的库

## 变更记录

### v2.0.0
- 新增：安全和版本锁定要求
- 明确：禁止使用大型框架和 ORM
- 新增：环境变量管理规范

### v1.0.0
- 初版技术栈定义
