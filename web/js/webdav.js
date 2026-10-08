// ============================================================
// webdav.js — WebDAV 加密备份（客户端加密后经服务器哑管道中继）
// 备份文件 = 整个金库的密文 JSON（服务器与 WebDAV 服务商都读不懂）
// WebDAV 账号密码只存在浏览器 localStorage，不发给除中继外的任何地方
// ============================================================
import { api, getServerBase } from './api.js';
import { encryptJSON, decryptJSON } from './crypto.js';
import { allNotes, getVaultKey } from './store.js';

const CFG_KEY = 'fn_webdav_cfg';
export function getWebdavCfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch { return {}; }
}
export function setWebdavCfg(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

function headers(extra = {}) {
  const cfg = getWebdavCfg();
  return {
    'x-fn-webdav-url': cfg.url || '',
    'x-fn-webdav-user': cfg.user || '',
    'x-fn-webdav-pass': cfg.pass || '',
    ...extra,
  };
}

async function relay(method, path, body) {
  const resp = await fetch(getServerBase() + '/api/webdav/relay/' + path.replace(/^\/+/, ''), {
    method,
    headers: headers(body ? { 'Content-Type': 'application/octet-stream' } : {}),
    body,
  });
  return resp;
}

/** 导出整个金库（客户端加密）并 PUT 到 WebDAV */
export async function backupToWebdav() {
  const key = getVaultKey();
  if (!key) throw new Error('金库未解锁');
  const payload = {
    format: 'fairy-notes-backup',
    version: 1,
    exportedAt: Date.now(),
    notes: allNotes().map(n => ({ ...n })),
  };
  const enc = await encryptJSON(key, payload);          // ← 加密发生在这里，本地
  const body = new TextEncoder().encode(JSON.stringify(enc));
  const filename = `fairy-notes-backup-${new Date().toISOString().slice(0, 10)}.json.enc`;
  const resp = await relay('PUT', filename, body);
  if (!resp.ok) throw new Error('WebDAV 上传失败: HTTP ' + resp.status);
  return filename;
}

/** 从 WebDAV 拉取指定备份文件并解密恢复（合并策略：新覆盖旧） */
export async function restoreFromWebdav(filename) {
  const key = getVaultKey();
  if (!key) throw new Error('金库未解锁');
  const resp = await relay('GET', filename);
  if (!resp.ok) throw new Error('WebDAV 下载失败: HTTP ' + resp.status);
  const enc = JSON.parse(await resp.text());
  const payload = await decryptJSON(key, enc);          // ← 解密也只在这里
  if (payload.format !== 'fairy-notes-backup') throw new Error('备份文件格式不正确');
  return payload.notes;
}

/** 列出备份目录（PROPFIND 简化处理：按已知文件名规则逐个探测太慢，此处返回目录 XML 原文由前端解析） */
export async function listBackups() {
  const xml = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getlastmodified/></d:prop></d:propfind>`;
  const resp = await relay('PROPFIND', '', xml);
  if (!resp.ok && resp.status !== 207) throw new Error('WebDAV 列目录失败: HTTP ' + resp.status);
  const text = await resp.text();
  const names = [];
  const re = /<d:href>([^<]*fairy-notes-backup[^<]*\.json\.enc)<\/d:href>/gi;
  let m;
  while ((m = re.exec(text)) !== null) names.push(decodeURIComponent(m[1].split('/').pop()));
  return [...new Set(names)].sort().reverse();
}
