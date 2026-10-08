// ============================================================
// auth.js — 身份验证
// 1) 谷歌 OAuth 2.0：客户端拿到 ID token 后交给服务器校验
//    （通过谷歌官方 tokeninfo 端点，不引入额外依赖）
//    ⚠️ 合规提醒：仅使用谷歌官方公开开发文档的合规接入方式，
//    在中国境内部署/使用涉及谷歌的服务时，请遵守中国相关法律法规。
// 2) 开发模式登录（ALLOW_DEV_AUTH=1 时可用，生产环境必须关闭）
// 会话令牌：服务端签发随机 token，仅标识"这是谁"，与数据加解密无关。
// ============================================================
const crypto = require('node:crypto');
const { db } = require('./db');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 天

/** 调用谷歌官方 tokeninfo 端点校验 ID token，返回 payload 或 null */
async function verifyGoogleIdToken(credential) {
  try {
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' +
      encodeURIComponent(credential);
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const payload = await resp.json();
    // 校验 audience 必须是我们自己的客户端 ID，防止令牌移植攻击
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && payload.aud !== expectedAud) return null;
    // 校验过期时间（秒级）
    if (payload.exp && Number(payload.exp) * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, userId, now, now + SESSION_TTL_MS);
  return { token, expiresAt: now + SESSION_TTL_MS };
}

/** Express 中间件：校验 Bearer 会话令牌，挂载 req.userId */
function requireSession(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const row = db.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?'
  ).get(token);
  if (!row || row.expires_at < Date.now()) {
    return res.status(401).json({ error: 'session_expired' });
  }
  req.userId = row.user_id;
  next();
}

function findOrCreateUser({ email, googleSub, kdfSalt }) {
  let user = googleSub
    ? db.prepare('SELECT * FROM users WHERE google_sub = ?').get(googleSub)
    : db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const now = Date.now();
  if (!user) {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO users (id, email, google_sub, kdf_salt, created_at) VALUES (?,?,?,?,?)')
      .run(id, email, googleSub || null, kdfSalt || null, now);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  } else if (kdfSalt && !user.kdf_salt) {
    db.prepare('UPDATE users SET kdf_salt = ? WHERE id = ?').run(kdfSalt, user.id);
    user.kdf_salt = kdfSalt;
  }
  return user;
}

module.exports = { verifyGoogleIdToken, createSession, requireSession, findOrCreateUser };
