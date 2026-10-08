# 更新日志

本项目的所有重要变更将记录在本文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [1.0.0] - 2026-10-08

### 新增
- 零知识同步后端：账号（谷歌 OAuth / 开发模式）、密文同步 API（rev 游标 + last-write-wins）、WebDAV 哑管道中继
- 端到端加密网页前端：PBKDF2-SHA256(310000 轮) → AES-256-GCM，密钥不可导出、不出设备
- 块级编辑器（Enter 分块 / Shift+Enter 换行）
- 双向链接 `[[标题]]` 与知识图谱（纯 SVG 力导向图）
- 标签与本地全文搜索（明文索引不出设备）
- WebDAV 客户端加密备份与恢复
- Docker 一键部署（docker-compose.yml + 数据卷持久化 + 健康检查）
- Android APP（Capacitor 6，包名 com.fairynotes.app，端内解密，可配置私有服务器地址）
- GitHub Actions 安卓 APK 自动构建（push main 构建产物，打 tag 自动发 Release）
- 文档：架构设计、安全审计、移动端构建指南

### 安全设计
- 后端零知识：无解密逻辑、无密钥材料，数据库仅存密文
- 金库校验器机制：新设备验证主密码正确性而不泄露内容
- 谷歌 OAuth 仅用于身份验证，与数据加解密完全解耦
