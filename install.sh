#!/usr/bin/env bash
# ============================================================
# FairyNotes 一键懒人部署脚本
#
# 用法（在任意 Linux 服务器上执行）：
#   curl -fsSL https://raw.githubusercontent.com/famliyroy/fairy-notes/main/install.sh | bash
# 或先下载再执行：
#   wget -O install.sh https://raw.githubusercontent.com/famliyroy/fairy-notes/main/install.sh
#   bash install.sh
#
# 脚本行为：
#   1. 检测并自动安装 Docker（含 compose 插件）
#   2. 克隆/更新本仓库到 ~/fairy-notes（仅取配置文件）
#   3. 从 GHCR 网络拉取官方镜像（无需本地构建；失败则自动回退本地构建）
#   4. 启动服务并打印访问地址
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/famliyroy/fairy-notes.git"
IMAGE="ghcr.io/famliyroy/fairy-notes:latest"
APP_DIR="${APP_DIR:-$HOME/fairy-notes}"
PORT="${PORT:-8080}"

log()  { echo -e "\033[1;35m[🧚 FairyNotes]\033[0m $*"; }
fail() { echo -e "\033[1;31m[✗] $*\033[0m"; exit 1; }

log "开始一键部署（目标目录: $APP_DIR，端口: $PORT）"

# ---- 1. Docker 检测与安装 ----
if ! command -v docker >/dev/null 2>&1; then
  log "未检测到 Docker，自动安装中（需要 sudo 权限，约 1-3 分钟）..."
  curl -fsSL https://get.docker.com | sudo sh || fail "Docker 安装失败，请手动安装后重试"
  sudo systemctl enable --now docker 2>/dev/null || true
fi
if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose 插件不可用。请安装: apt install docker-compose-plugin 或升级 Docker"
fi
# 非 root 用户需要 docker 组权限
if ! docker info >/dev/null 2>&1; then
  fail "当前用户无权访问 Docker。执行: sudo usermod -aG docker $USER 然后重新登录"
fi
log "Docker 环境就绪 ✓"

# ---- 2. 获取仓库（compose 与 .env 模板所在） ----
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull --ff-only 2>/dev/null || log "本地仓库更新失败，使用现有版本"
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR" || fail "仓库克隆失败"
  cd "$APP_DIR"
fi

# ---- 3. 初始化配置 ----
if [ ! -f .env ]; then
  cp .env.example .env
  log "已生成 .env（谷歌 OAuth 未配置时可用开发模式登录，生产建议配置）"
fi

# ---- 4. 拉取镜像并启动（失败自动回退本地构建） ----
log "从 GHCR 拉取官方镜像（amd64/arm64 双架构）..."
if docker compose pull 2>/dev/null; then
  log "镜像拉取成功"
else
  log "镜像拉取失败，回退为本地构建（约需 1-2 分钟）..."
  docker compose build --pull
fi

docker compose up -d || fail "服务启动失败，请检查 docker compose logs"

# ---- 5. 健康检查与完成提示 ----
log "等待服务就绪..."
for i in $(seq 1 15); do
  if curl -fsS --noproxy '*' "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  [ "$i" = 15 ] && fail "健康检查超时，请查看: docker compose logs"
  sleep 2
done

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "${IP:-}" ] && IP=$(curl -fsS --max-time 3 ifconfig.me 2>/dev/null || echo "127.0.0.1")

echo ""
log "✅ 部署完成！"
echo -e "    访问地址:  \033[1;32mhttp://$IP:$PORT\033[0m"
echo -e "    数据位置:  Docker 卷 fairynotes-data（全为密文，可整卷备份）"
echo -e "    常用命令:  cd $APP_DIR && docker compose [logs -f | restart | down]"
echo -e "    谷歌OAuth: 编辑 $APP_DIR/.env 填入 GOOGLE_CLIENT_ID 后 docker compose up -d"
echo -e "    安卓APP:   仓库 Releases 页下载，登录页填 http://$IP:$PORT"
echo ""
