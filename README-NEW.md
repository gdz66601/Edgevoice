# Edgechat - 现代化升级版

## ✨ 新特性

### 🎨 Liquid Glass 毛玻璃效果
- 融合了苹果 Liquid Glass 设计语言
- SVG 滤镜实现物理折射效果
- 动态鼠标跟踪高光
- 多层次光学渲染

### 📱 移动端优化
- 完全响应式设计
- 触摸友好的交互
- 移动端专属布局
- viewport 优化

### 🎯 现代化 UI
- 流畅的动画效果
- 优雅的毛玻璃材质
- 深度感和通透感
- 无障碍支持

## 🚀 快速启动

### 方式一：使用启动脚本（推荐）

```bash
./start.sh
```

### 方式二：手动启动

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev:frontend
```

### 方式三：Docker 部署

```bash
# 使用 Docker Compose
docker compose up -d

# 或使用 Docker
docker build -t edgechat .
docker run -d -p 8787:8787 edgechat
```

## 🌐 访问地址

启动后访问：
- 本地：http://localhost:5173
- 网络：http://your-ip:5173

## 🎨 设计特点

### Liquid Glass 效果
- **物理折射**：SVG 滤镜模拟光线穿过流体的扭曲
- **多层解耦**：滤镜层、遮罩层、高光层、内容层分离
- **动态交互**：鼠标移动时实时更新镜面高光

### 响应式设计
- 桌面端：完整功能布局
- 平板端：自适应调整
- 手机端：优化的移动体验

### 无障碍支持
- `prefers-reduced-motion`：减少动画
- `prefers-reduced-transparency`：降低透明度
- 语义化 HTML 结构

## 📁 项目结构

```
Edgechat/
├── frontend/
│   ├── src/
│   │   ├── styles.css           # 原有样式
│   │   ├── styles-liquid.css    # Liquid Glass 样式
│   │   ├── liquid-glass.js      # 交互效果
│   │   └── main.js              # 入口文件
│   └── index.html               # HTML 模板（含 SVG 滤镜）
├── worker/                      # Cloudflare Workers 后端
├── Dockerfile                   # Docker 镜像
├── docker-compose.yml           # Docker Compose 配置
├── start.sh                     # 快速启动脚本
└── DOCKER.md                    # Docker 部署文档
```

## 🛠️ 技术栈

- **前端**：Vue 3 + Vite
- **样式**：CSS3 + SVG Filters
- **后端**：Cloudflare Workers + Hono
- **实时**：WebSocket (Durable Objects)
- **数据库**：Cloudflare D1
- **存储**：Cloudflare R2
- **容器**：Docker + Docker Compose

## 📝 更新日志

### v2.0.0 - 现代化升级
- ✨ 添加 Liquid Glass 毛玻璃效果
- 📱 完善移动端适配
- 🎨 现代化 UI 设计
- 🐳 添加 Docker 支持
- 🚀 优化启动流程

## 📄 许可证

GPL-3.0-or-later

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
