# ============================================================
# FairyNotes — 多阶段构建
# 阶段1: 安装生产依赖（仅 express，无原生编译）
# 阶段2: 精简运行镜像
# ============================================================
FROM node:24-alpine AS deps
WORKDIR /app
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY web ./web
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "server/src/index.js"]
