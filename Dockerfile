# 使用标准 Node.js 镜像（非 Alpine）
FROM node:20

WORKDIR /app

# 安装 wrangler
RUN npm install -g wrangler

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制所有文件
COPY . .

# 构建前端
RUN npm run build

# 暴露端口
EXPOSE 8787

# 启动命令
CMD ["wrangler", "dev", "--port", "8787", "--ip", "0.0.0.0"]
