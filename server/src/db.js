// ============================================================
// db.js — 数据库初始化与表结构
// 选型：node:sqlite（零原生依赖，随 Node 24 内置）
// 零知识设计：blobs 表只存密文(cipher)+随机nonce，
//            服务器没有任何密钥，无法解密任何内容。
// ============================================================
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/fairy-notes.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,          -- uuid
  email       TEXT UNIQUE NOT NULL,      -- 来自 OAuth 的邮箱（仅用于身份识别，非笔记数据）
  google_sub  TEXT UNIQUE,               -- Google 账号唯一标识
  kdf_salt    TEXT,                      -- KDF 盐（公开参数，非敏感；密钥本身不落服务器）
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,           -- 随机会话令牌
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blobs (
  user_id           TEXT NOT NULL REFERENCES users(id),
  id                TEXT NOT NULL,      -- 客户端生成的 blob uuid
  type              TEXT NOT NULL,      -- 'note' | 'verifier' | 'meta'（类型不含明文语义）
  nonce             TEXT NOT NULL,      -- AES-GCM 随机 IV（base64）
  cipher            TEXT NOT NULL,      -- AES-GCM 密文（base64）——服务器不可读
  deleted           INTEGER DEFAULT 0,  -- 软删除标记
  client_updated_at INTEGER NOT NULL,   -- 客户端时间戳
  rev               INTEGER NOT NULL,   -- 服务器端单调递增版本号（同步游标）
  received_at       INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  blob_id TEXT NOT NULL,
  action  TEXT NOT NULL,                  -- push | delete
  at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blobs_rev ON blobs(user_id, rev);
`);

/** 每用户单调递增版本号，用作同步游标 */
function nextRev(userId) {
  const row = db.prepare('SELECT MAX(rev) AS m FROM blobs WHERE user_id = ?').get(userId);
  return (row?.m || 0) + 1;
}

module.exports = { db, nextRev, DB_PATH };
