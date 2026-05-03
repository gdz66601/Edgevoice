# Edgechat 文档总入口

版本：v2.0.0
状态：生效中
最后更新：2026-05-03

## 项目简介

Edgechat 是一个部署在 Cloudflare 基础设施上的实时聊天系统。它提供完整的账号体系、公开群组、私有群组、私信功能、实时消息同步、文件管理和管理员后台，目标是在 Cloudflare 生态中以低成本实现可直接部署的站内 IM 系统。

## 核心文档导航

按阅读顺序推荐：

1. **PRD.md** - 产品需求与范围定义
   - 功能清单、验收标准、业务目标

2. **TECH_STACK.md** - 技术栈与依赖管理
   - 技术选型、版本锁定、工具链

3. **ARCHITECTURE.md** - 系统架构与设计决策
   - 模块划分、通信模式、部署拓扑
   - 大型项目必读

4. **BACKEND_STRUCTURE.md** - 后端接口与数据模型
   - API 契约、数据库设计、权限模型

5. **SECURITY.md** - 安全策略与合规要求
   - 身份验证、授权、数据保护、审计
   - 大型项目必读

6. **DEPLOYMENT.md** - 部署与配置指南
   - 环境变量、部署流程、前置条件

7. **TEST_PLAN.md** - 测试分层与验证策略
   - 大型项目必读

8. **OPERATIONS.md** - 运维与监控指南
   - 日志、指标、故障处理、备份策略

## 按角色快速导航

### 开发人员（新入园者）
1. docs/PRD.md
2. docs/TECH_STACK.md
3. docs/ARCHITECTURE.md
4. docs/BACKEND_STRUCTURE.md

### 后端开发
1. docs/ARCHITECTURE.md
2. docs/BACKEND_STRUCTURE.md
3. docs/SECURITY.md
4. docs/OPERATIONS.md

### 前端开发
1. docs/PRD.md
2. docs/TECH_STACK.md
3. docs/ARCHITECTURE.md

### 运维人员
1. docs/DEPLOYMENT.md
2. docs/OPERATIONS.md
3. docs/SECURITY.md
4. docs/TEST_PLAN.md

### 产品人员
1. docs/PRD.md
2. docs/ARCHITECTURE.md（可选）

## 文档维护规则

- 文档版本采用语义化：MAJOR.MINOR.PATCH
- 每次重大变更需更新版本号、作者、更新时间
- 保留完整的 Changelog 记录变更历史
- 不允许出现图标、emoji、无关内容和工具名称
- 所有描述需明确、可验证、可执行

## 项目统计

**当前版本**: v2.0.0
**发布日期**: 2026-05-03
**文档完成度**: 100%
**安全审计**: 23 个漏洞，已全部修复

## 快速链接

- GitHub 仓库：https://github.com/gdz66601/Edgechat
- 项目网站：https://doc.chsm666.top/
- 开源协议：GPL-3.0-or-later

## 变更记录

### v2.0.0
- 完整的安全审计：发现并修复 23 个漏洞
- 新增审计日志模块、权限管理、输入验证
- 完整的文档体系重组（v1.x 不规范）
- HttpOnly Cookie 安全加固
- WebSocket 速率限制和竞态条件修复
- 数据库原子操作加强

### v1.x（历史版本）
- 基础功能实现
