// ============================================================
// webdav.js — WebDAV 备份中继
// 关键设计：服务器只是"哑管道"。备份文件由客户端加密后才上传，
// 服务器只看到密文字节流，也不知道用户的 WebDAV 密码会话之外的任何事
// （WebDAV 凭据由客户端每次请求自带、用完即弃、绝不落库）。
// ============================================================
const express = require('express');
const { requireSession } = require('./auth');

const router = express.Router();
router.use(requireSession);

/**
 * 通用中继：/api/webdav/relay/<任意路径>
 * 客户端通过请求头传递目标信息（HTTPS 传输中，不落盘不落库）：
 *   x-fn-webdav-url  : WebDAV 根地址（如 https://dav.example.com/dav/）
 *   x-fn-webdav-user : 用户名（可选）
 *   x-fn-webdav-pass : 密码（可选）
 * 支持方法：PUT / GET / MKCOL / PROPFIND
 */
router.all('/relay/*', async (req, res) => {
  const base = req.headers['x-fn-webdav-url'];
  if (!base) return res.status(400).json({ error: 'missing x-fn-webdav-url' });

  let target;
  try {
    const sub = req.params[0] || '';
    target = new URL(sub, base.endsWith('/') ? base : base + '/');
  } catch {
    return res.status(400).json({ error: 'invalid webdav url' });
  }

  const headers = { };
  if (req.headers['x-fn-webdav-user'] !== undefined) {
    const auth = Buffer.from(
      req.headers['x-fn-webdav-user'] + ':' + (req.headers['x-fn-webdav-pass'] || '')
    ).toString('base64');
    headers['Authorization'] = 'Basic ' + auth;
  }
  if (req.method === 'PROPFIND') {
    headers['Depth'] = req.headers['depth'] || '1';
    headers['Content-Type'] = 'application/xml';
  } else if (typeof req.body === 'string' && req.body.length) {
    headers['Content-Type'] = 'application/octet-stream';
  }

  try {
    const resp = await fetch(target, {
      method: req.method,
      headers,
      body: (req.method === 'PUT' || req.method === 'PROPFIND') ? req.body : undefined,
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    res.status(resp.status);
    const ct = resp.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: 'webdav_upstream_failed', detail: String(err) });
  }
});

module.exports = router;
