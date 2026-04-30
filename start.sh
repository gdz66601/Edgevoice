#!/bin/bash

echo "🚀 启动 Edgechat..."
echo ""

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动前端开发服务器
echo "🎨 启动前端服务器..."
npm run dev:frontend &
FRONTEND_PID=$!

# 等待服务器启动
sleep 5

echo ""
echo "✅ Edgechat 已启动！"
echo ""
echo "📱 访问地址："
echo "   本地: http://localhost:5173"
echo "   网络: http://$(hostname -I | awk '{print $1}'):5173"
echo ""
echo "💡 特性："
echo "   ✨ Liquid Glass 毛玻璃效果"
echo "   📱 移动端适配"
echo "   🎯 现代化 UI 设计"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 等待进程
wait $FRONTEND_PID
