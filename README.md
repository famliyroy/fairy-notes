# 🧚 FairyNotes — 隐私优先的私有部署多端同步笔记软件

![Build Android APK](https://github.com/famliyroy/fairy-notes/actions/workflows/android-build.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android%20%7C%20iOS-lightgrey.svg)

端到端加密 · 零知识后端 · Docker 一键部署 · WebDAV 备份

> **核心理念**：服务器只是一个"不识字的邮局"。所有笔记在你的设备上用主密码派生的密钥加密后才上传，服务器从头到尾只存储密文，**不具备任何解密能力**。

## 功能一览

| 功能 | 说明 |
|---|---|
| 块级编辑 | Enter 新建块 / Shift+Enter 块内换行（参考思源/Notion） |
| 双向链接 + 知识图谱 | `[[笔记标题]]` 建立链接，图谱页可视化（参考 Obsidian） |
| 标签 + 本地全文搜索 | 搜索在本地明文上执行，索引不出设备 |
| 多端同步 | 网页端 + 移动端（Capacitor 封装），密文同步、端内解密。APP 登录页可填写私有服务器地址 |
| WebDAV 加密备份 | 客户端加密后经服务器哑管道上传到你的网盘 |
| 谷歌 OAuth 登录 | 仅用于身份验证；与数据加密完全无关 |

## 🚀 部署

环境要求：任意能跑 Docker 的 Linux 服务器（amd64/arm64 均可），1 核 512MB 起步。

### 方式一：docker compose 部署（推荐）

```bash
mkdir fairy-notes && cd fairy-notes
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/famliyroy/fairy-notes/main/docker-compose.yml
curl -fsSL -o .env.example https://raw.githubusercontent.com/famliyroy/fairy-notes/main/.env.example
cp .env.example .env          # 按需编辑：谷歌 OAuth 客户端 ID（可选）
docker compose pull && docker compose up -d
```

### 方式二：docker run 一条命令部署

```bash
docker run -d \
  --name fairynotes \
  --restart unless-stopped \
  -p 8080:8080 \
  -e DB_PATH=/data/fairy-notes.db \
  -v fairynotes-data:/data \
  ghcr.io/famliyroy/fairy-notes:latest
```

镜像托管在 GitHub Container Registry，由 CI 自动构建（amd64 / arm64），无需本机构建。

可选环境变量：

| 变量 | 说明 |
|---|---|
| `GOOGLE_CLIENT_ID` | 谷歌 OAuth 客户端 ID（可选；不填可用开发模式登录） |
| `ALLOW_DEV_AUTH` | 开发模式登录，**生产环境必须保持 0 或不设置** |

> ⚠️ 合规提醒：谷歌服务接入请遵循谷歌官方开发文档，在中国境内使用涉及谷歌的服务需遵守中国相关法律法规。

### 方式二·补：宝塔 / 1Panel 面板（host 网络模式）

宝塔、1Panel 等面板的 Docker 管理支持直接粘贴 docker-compose 运行。这类场景推荐用 host 网络模式：端口由 `PORT` 环境变量决定，无需端口映射，也不会出现端口冲突。仓库内已附带 `docker-compose.host.yml`，内容如下，可直接复制到面板的 compose 编辑器运行：

```yaml
services:
  fairynotes:
    image: ghcr.io/famliyroy/fairy-notes:latest
    container_name: fairynotes
    restart: unless-stopped
    network_mode: host
    environment:
      - PORT=8080                        # 对外端口，host 模式下即容器监听端口
      - GOOGLE_CLIENT_ID=                # 谷歌 OAuth 客户端 ID（可选，不影响加密）
      - ALLOW_DEV_AUTH=0                 # 开发模式登录，生产环境【必须】为 0！
      - DB_PATH=/data/fairy-notes.db     # 数据库文件位置（数据卷内）
    volumes:
      - ./data:/data
    healthcheck:
      test: ["CMD-SHELL", "node -e \"const p=process.env.PORT||8080;fetch('http://localhost:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

注意：host 网络模式仅适用于 Linux 服务器；Mac/Windows 的 Docker Desktop 不支持。改端口只需改 `PORT` 的值。

### 数据与升级

数据持久化在 Docker 卷 `fairynotes-data`（compose/host 模式为 `./data` 目录），里面全是密文，可整卷/整目录备份。升级：

```bash
docker compose pull && docker compose up -d     # compose 方式
docker pull ghcr.io/famliyroy/fairy-notes:latest && docker restart fairynotes   # docker run 方式
```

### 本地开发（无 Docker）

```bash
cd server
npm install
ALLOW_DEV_AUTH=1 npm start      # 开发模式登录仅限本机测试！
# 打开 http://localhost:8080
```

## 快速上手流程

1. **登录**：谷歌账号（生产）或开发模式（测试）；
2. **设置主密码**：首次进入会提示创建，它用于本地派生加密密钥（PBKDF2-SHA256，310000 轮）；
3. **写笔记**：`Enter` 新建块、`[[标题]]` 建立双向链接、顶部标签栏打标签；
4. **备份**：设置页填入你的 WebDAV 地址与账号 →「立即加密备份」。

## ⚠️ 必读：主密码与数据安全

- **主密码不经过任何服务器**，也无法被找回。忘记主密码 = 所有数据永久无法解密。
- 换设备登录需要重新输入主密码，这是端到端加密的代价与意义。

## 📱 安卓 APP

**直接下载安装（推荐）**：到 [Releases 页面](https://github.com/famliyroy/fairy-notes/releases) 下载 APK，安装后在登录页填写你的服务器地址即可——密钥派生与解密全部在手机本地完成。每次打 `v*` 标签，CI 会自动构建新 APK 并发 Release。

**CI 手动构建**：仓库页 Actions → Build Android APK → Run workflow，产物在构建详情页下载。

**本地构建**（需 Android Studio + JDK 17）：

```bash
npm install
npx cap sync android
# 用 Android Studio 打开 android/ 目录 → Build APK
```

详见 [移动端构建指南](docs/MOBILE.md)。安装 APP 后在登录页填写你的服务器地址即可——密钥派生与解密全部在手机本地完成。

## 📄 文档索引

- [架构设计文档](docs/ARCHITECTURE.md) — 技术选型与设计思路
- [安全审计说明](docs/SECURITY.md) — 隐私保护优势与风险点
- [移动端构建指南](docs/MOBILE.md) — iOS / Android 打包
