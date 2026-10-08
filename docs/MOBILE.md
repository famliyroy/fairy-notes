# 移动端构建指南（iOS + Android）

移动端使用 **Capacitor** 封装同一套 Web 前端：端内内置完整加解密能力（与网页端共享 `web/js/crypto.js`），数据同样在本机加密/解密，任意端可正常访问加密笔记。APP 与网页端代码同仓（`android/` 目录），登录页可填写私有服务器地址（保存在手机本地）。

> **两种获取 APK 的方式**
> 1. **GitHub Actions 云构建**（推荐，无需本地环境）：推送代码后自动构建，Actions 页下载 APK 产物；打 `v*` tag 自动发 Release；
> 2. **本地构建**：`npm install && npx cap sync android`，再用 Android Studio 打开 `android/` 构建（需 JDK 17）。

## 准备

```bash
cd fairy-notes
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init FairyNotes com.fairynotes.app --web-dir=web
```

创建 `capacitor.config.json`（本目录已提供），把 `server.url` 指向你的私有服务器地址：

```json
{
  "appId": "com.fairynotes.app",
  "appName": "FairyNotes",
  "webDir": "web",
  "server": { "url": "https://你的服务器地址" }
}
```

## Android

```bash
npx cap add android
npx cap sync
npx cap open android     # 打开 Android Studio → Build APK / 上架 AAB
```

要求：Android Studio + JDK 17。已在 `AndroidManifest.xml` 开启 `usesCleartextTraffic` 以兼容局域网 HTTP 服务器；**强烈建议**生产使用 HTTPS（传输层加密是安全模型的一部分，见安全文档）。

## iOS

```bash
npx cap add ios
npx cap sync
npx cap open ios         # Xcode 中签名后 Build / 上架 TestFlight
```

要求：macOS + Xcode 15+。上架 App Store 需 Apple 开发者账号（$99/年）。

## 移动端专属建议

1. **自动锁定**：在 `app.js` 的 `visibilitychange` 事件中，后台超过 5 分钟自动 `location.reload()` 锁定金库；
2. **生物识别存主密码**：用 Capacitor 插件 `capacitor-native-biometric` 把主密码存入系统钥匙串（Keychain/Keystore），实现指纹解锁金库——主密码仍不出设备；
3. **本地通知与后台同步**：可选用 `@capacitor/background-sync` 在前台恢复时自动 `pullAndDecrypt()`。

## 合规提醒

iOS/Android 应用如需接入谷歌登录，请使用平台官方 SDK 的合规接入方式；在中国境内分发和使用的应用，涉及谷歌服务的部分请遵守中国相关法律法规。
