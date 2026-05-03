#!/bin/bash

echo "🚀 启动 Edgechat Docker 容器..."
echo ""

# 启动容器
docker compose up -d --build

echo ""
echo "⏳ 等待容器启动..."
sleep 10

# 检查容器状态
if ! docker compose ps | grep -q "Up"; then
    echo "❌ 容器启动失败"
    docker compose logs --tail=20
    exit 1
fi

echo "✅ 容器已启动"
echo ""

# 初始化数据库
echo "📊 初始化数据库..."
# Keep the legacy local D1 name to match existing Wrangler state.
docker compose exec -T edgechat wrangler d1 execute cfchat-db --local --file=./worker/schema.sql > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ 数据库表创建成功"
else
    echo "⚠️  数据库可能已存在"
fi

# 创建管理员账户（使用 API）
echo "👤 创建管理员账户..."
sleep 2

# 使用 curl 调用创建用户 API
RESPONSE=$(curl -s -X POST http://localhost:8788/api/admin/users \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","displayName":"Administrator","isAdmin":true}' 2>&1)

if echo "$RESPONSE" | grep -q "id\|success"; then
    echo "✅ 管理员账户创建成功"
    echo ""
    echo "🔐 管理员登录信息："
    echo "   用户名: admin"
    echo "   密码: admin123"
else
    echo "⚠️  管理员账户创建失败或已存在"
    echo "   请访问应用后通过界面创建用户"
fi

echo ""
echo "🎉 Edgechat 启动完成！"
echo ""
echo "📱 访问地址："
echo "   http://localhost:8788"
echo ""
echo "✨ 特性："
echo "   🎨 Liquid Glass 毛玻璃效果"
echo "   📱 移动端完美适配"
echo "   🚀 现代化 UI 设计"
echo ""
echo "📝 常用命令："
echo "   查看日志: docker compose logs -f"
echo "   停止服务: docker compose down"
echo "   重启服务: docker compose restart"
echo ""
