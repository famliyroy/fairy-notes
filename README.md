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

## 🚀 一键懒人部署（推荐）

在任意 Linux 服务器（amd64/arm64 均可）上执行一条命令，脚本会自动完成：安装 Docker → 克隆配置 → 从 GHCR 拉取官方镜像 → 启动 → 健康检查：

```bash
curl -fsSL https://raw.githubusercontent.com/famliyroy/fairy-notes/main/install.sh | bash
```

支持环境变量微调：`APP_DIR=/opt/fairy-notes PORT=9000` 加在同一命令前即可。

也可以手动网络拉取部署（无需克隆源码）：

```bash
mkdir fairy-notes && cd fairy-notes
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/famliyroy/fairy-notes/main/docker-compose.yml
curl -fsSL -o .env.example https://raw.githubusercontent.com/famliyroy/fairy-notes/main/.env.example
cp .env.example .env   # 按需编辑
docker compose pull && docker compose up -d
```

## 一键部署（本地构建方式）

环境要求：任意能跑 Docker 的 Linux x86_64/ARM64 服务器，1 核 512MB 起步。

```bash
# 1. 克隆/上传本目录到服务器
cd fairy-notes
cp .env.example .env

# 2. （可选）编辑 .env 填入谷歌 OAuth 客户端 ID
#    ⚠️ 合规提醒：谷歌服务接入请遵循谷歌官方开发文档，
#    在中国境内使用涉及谷歌的服务需遵守中国相关法律法规。
vi .env

# 3. 构建并启动
docker compose up -d --build

# 4. 打开 http://<服务器IP>:8080
```

数据持久化在 Docker 卷 `fairynotes-data` 中（SQLite 数据库文件）。升级：`git pull && docker compose up -d --build`（数据不受影响）。备份服务器：直接备份该卷即可（里面全是密文）。

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

**方式一（推荐）：GitHub Actions 云构建，零本地依赖**

推送代码后 CI 自动打包 APK：
- 手动触发：仓库页 Actions → Build Android APK → Run workflow
- 正式发布：推送 `v1.0.0` 这样的 tag，自动创建 Release 并附上 APK

**方式二：本地构建**（需 Android Studio + JDK 17）

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
