// ============================================================
// index.js — 服务入口
// 职责清单（零知识边界）：
//   ✅ 账号管理（谷歌 OAuth / 开发模式登录）
//   ✅ 密文同步（pull/push）
//   ✅ WebDAV 哑管道中继
//   ✅ 托管网页前端静态文件
//   ❌ 绝不接触任何明文笔记数据，绝不出现在任何密钥
// ============================================================
const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const { db } = require('./db');
const { verifyGoogleIdToken, createSession, findOrCreateUser } = require('./auth');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '20mb' }));       // 备份密文可能较大
app.use(express.text({ type: 'application/octet-stream', limit: '50mb' }));

// ---- CORS：允许移动 APP（Capacitor origin: https://localhost）跨域调用 ----
// 注意：只放行 API 方法与自定义头，零知识边界不受影响（数据本身已是密文）
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers',
    'Authorization, Content-Type, x-fn-webdav-url, x-fn-webdav-user, x-fn-webdav-pass, Depth');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PROPFIND, MKCOL, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- 公开配置（告知前端谷歌客户端 ID 与开发模式开关）----
app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    devAuth: process.env.ALLOW_DEV_AUTH === '1',
  });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// ---- 登录：谷歌 OAuth 2.0 ----
app.post('/api/auth/google', async (req, res) => {
  const { credential, kdf_salt } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'credential required' });
  const payload = await verifyGoogleIdToken(credential);
  if (!payload || !payload.email) {
    return res.status(401).json({ error: 'invalid_google_token' });
  }
  const user = findOrCreateUser({
    email: payload.email,
    googleSub: payload.sub,
    kdfSalt: kdf_salt,
  });
  const session = createSession(user.id);
  res.json({ token: session.token, expiresAt: session.expiresAt, userId: user.id });
});

// ---- 登录：开发模式（仅测试用！生产环境必须 ALLOW_DEV_AUTH=0）----
app.post('/api/auth/dev', (req, res) => {
  if (process.env.ALLOW_DEV_AUTH !== '1') {
    return res.status(403).json({ error: 'dev auth disabled' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = findOrCreateUser({ email, kdfSalt: req.body?.kdf_salt });
  const session = createSession(user.id);
  res.json({ token: session.token, expiresAt: session.expiresAt, userId: user.id });
});

app.get('/api/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const row = db.prepare(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).get(token, Date.now());
  if (!row) return res.status(401).json({ error: 'unauthorized' });
  res.json({ userId: row.id, email: row.email });
});

// ---- 业务路由 ----
app.use('/api', require('./sync'));
app.use('/api/webdav', require('./webdav'));

// ---- 静态托管网页前端 ----
const WEB_DIR = path.join(__dirname, '../../web');
app.use(express.static(WEB_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`[FairyNotes] 零知识同步服务已启动: http://localhost:${PORT}`);
  console.log(`[FairyNotes] 数据库: ${process.env.DB_PATH || '(默认 ./data)'}`);
  console.log(`[FairyNotes] 谷歌OAuth: ${process.env.GOOGLE_CLIENT_ID ? '已配置' : '未配置(可用开发模式登录)'}`);
  console.log(`[FairyNotes] 开发模式登录: ${process.env.ALLOW_DEV_AUTH === '1' ? '开启(仅限测试!)' : '关闭'}`);
});
