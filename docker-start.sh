#!/bin/bash
set -e

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

# 初始化数据库 schema
echo "📊 初始化数据库 schema..."
# Keep the legacy local D1 name to match existing Wrangler state.
docker compose exec -T edgechat wrangler d1 execute cfchat-db --local --file=./worker/schema.sql > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ 数据库表创建成功"
else
    echo "⚠️  数据库可能已存在"
fi

# 应用迁移文件
echo "🔧 应用数据库迁移..."
for migration in $(ls -1 worker/migrations/*.sql 2>/dev/null | sort); do
    echo "  → $migration"
    docker compose exec -T edgechat wrangler d1 execute cfchat-db --local --file="./$migration" > /dev/null 2>&1 || true
done

# 创建管理员账户
# 强烈建议通过 EDGECHAT_ADMIN_USERNAME / EDGECHAT_ADMIN_PASSWORD 显式传入；
# 否则使用一次性弱密码 admin123，仅用于首次本地体验，登录后必须立即修改。
ADMIN_USERNAME="${EDGECHAT_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${EDGECHAT_ADMIN_PASSWORD:-admin123}"
ADMIN_DISPLAY_NAME="${EDGECHAT_ADMIN_DISPLAY_NAME:-Administrator}"

echo "👤 生成管理员引导 SQL..."
EDGECHAT_ADMIN_USERNAME="$ADMIN_USERNAME" \
EDGECHAT_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
EDGECHAT_ADMIN_DISPLAY_NAME="$ADMIN_DISPLAY_NAME" \
node scripts/bootstrap-local-admin.mjs

echo "📝 应用管理员引导 SQL..."
docker compose exec -T edgechat wrangler d1 execute cfchat-db --local \
  --file=./.tmp/edgechat-local-admin-upsert.sql > /dev/null 2>&1 \
  && echo "✅ 管理员账户已就绪" \
  || echo "⚠️  管理员账户应用失败，请检查 wrangler 输出"

echo ""
echo "🎉 Edgechat 启动完成！"
echo ""
echo "📱 访问地址: http://localhost:8788"
echo ""
echo "🔐 默认管理员登录："
echo "   用户名: $ADMIN_USERNAME"
echo "   密码:   $ADMIN_PASSWORD"
echo ""
echo "⚠️  这是首次启动的临时密码，请登录后立即在【设置】中修改。"
echo "    要自定义初始凭据，请设置环境变量后重新执行："
echo "      EDGECHAT_ADMIN_USERNAME=... EDGECHAT_ADMIN_PASSWORD=... ./docker-start.sh"
echo ""
echo "📝 常用命令："
echo "   查看日志: docker compose logs -f"
echo "   停止服务: docker compose down"
echo "   重启服务: docker compose restart"
echo ""
