// ============================================================
// sync.js — 密文同步 API
// 服务器在这里的角色：一个"不识字的邮局"。
// 收到的每一个 blob 都是 {nonce, cipher}，服务器既不能也不被允许解密。
// ============================================================
const express = require('express');
const { db, nextRev } = require('./db');
const { requireSession } = require('./auth');

const router = express.Router();
router.use(requireSession);

/** 获取/设置 KDF 盐（盐是公开参数，不含任何机密） */
router.get('/vault/salt', (req, res) => {
  const row = db.prepare('SELECT kdf_salt FROM users WHERE id = ?').get(req.userId);
  res.json({ kdf_salt: row?.kdf_salt || null });
});

router.post('/vault/salt', (req, res) => {
  const { kdf_salt } = req.body || {};
  if (!kdf_salt || typeof kdf_salt !== 'string') {
    return res.status(400).json({ error: 'kdf_salt required' });
  }
  const row = db.prepare('SELECT kdf_salt FROM users WHERE id = ?').get(req.userId);
  if (row?.kdf_salt && row.kdf_salt !== kdf_salt) {
    return res.status(409).json({ error: 'salt_already_set' }); // 防止覆盖已有金库参数
  }
  db.prepare('UPDATE users SET kdf_salt = ? WHERE id = ?').run(kdf_salt, req.userId);
  res.json({ ok: true });
});

/** 推送密文 blob（新建/更新/删除），服务器分配单调 rev */
router.post('/sync/push', (req, res) => {
  const items = Array.isArray(req.body?.blobs) ? req.body.blobs : [];
  if (items.length === 0) return res.json({ ok: true, revs: [] });
  if (items.length > 500) return res.status(413).json({ error: 'too_many_blobs' });

  const now = Date.now();
  const revs = [];
  const insert = db.prepare(`
    INSERT INTO blobs (user_id, id, type, nonce, cipher, deleted, client_updated_at, rev, received_at)
    VALUES (@user_id, @id, @type, @nonce, @cipher, @deleted, @client_updated_at, @rev, @received_at)
    ON CONFLICT(user_id, id) DO UPDATE SET
      type = excluded.type,
      nonce = excluded.nonce,
      cipher = excluded.cipher,
      deleted = excluded.deleted,
      client_updated_at = excluded.client_updated_at,
      rev = excluded.rev,
      received_at = excluded.received_at
  `);
  const logStmt = db.prepare(
    'INSERT INTO sync_log (user_id, blob_id, action, at) VALUES (?,?,?,?)'
  );

  // 逐条写入（每条都分配新的全局递增 rev）
  for (const b of items) {
    if (!b.id || !b.nonce || !b.cipher || !b.type) {
      return res.status(400).json({ error: 'blob fields required: id,type,nonce,cipher' });
    }
    const rev = nextRev(req.userId);
    insert.run({
      user_id: req.userId,
      id: String(b.id),
      type: String(b.type),
      nonce: String(b.nonce),
      cipher: String(b.cipher),
      deleted: b.deleted ? 1 : 0,
      client_updated_at: Number(b.client_updated_at) || now,
      rev,
      received_at: now,
    });
    logStmt.run(req.userId, String(b.id), b.deleted ? 'delete' : 'push', now);
    revs.push({ id: b.id, rev });
  }
  res.json({ ok: true, revs });
});

/** 拉取自某 rev 之后的密文 blob */
router.get('/sync/pull', (req, res) => {
  const since = Number(req.query.since) || 0;
  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  const rows = db.prepare(`
    SELECT id, type, nonce, cipher, deleted, client_updated_at, rev
    FROM blobs WHERE user_id = ? AND rev > ? ORDER BY rev ASC LIMIT ?
  `).all(req.userId, since, limit);
  const maxRev = rows.length ? rows[rows.length - 1].rev : since;
  res.json({ blobs: rows, maxRev, hasMore: rows.length === limit });
});

module.exports = router;
