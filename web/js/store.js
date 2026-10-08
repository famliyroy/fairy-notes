// ============================================================
// store.js — 本地金库 + 同步引擎
// 数据流：明文笔记 --本地AES-GCM加密--> 密文blob --> 服务器
// 本地明文缓存存 IndexedDB（设备本身是用户可信设备的前提见安全文档）
// 同步策略：last-write-wins（按 client_updated_at），软删除
// ============================================================
import { api } from './api.js';
import { encryptJSON, decryptJSON } from './crypto.js';

const DB_NAME = 'fairy-notes-local';
let localDb = null;
let vaultKey = null;       // CryptoKey，仅内存
let syncCursor = Number(localStorage.getItem('fn_sync_cursor') || 0);
const notes = new Map();   // id -> 明文笔记对象（内存工作区）

function openLocal() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('notes')) {
        d.createObjectStore('notes', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function initStore() {
  localDb = await openLocal();
}

export function setVaultKey(key) { vaultKey = key; }
export function getVaultKey() { return vaultKey; }
export function allNotes() { return [...notes.values()]; }
export function getNote(id) { return notes.get(id) || null; }

export function newNote() {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: '无标题笔记',
    blocks: [{ id: crypto.randomUUID(), type: 'text', html: '' }],
    tags: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
  };
}

/** 保存笔记：写本地缓存 + 加密推送（防抖由编辑器层负责） */
export async function saveNote(note) {
  note.updatedAt = Date.now();
  notes.set(note.id, note);
  await persistLocal(note);
  await pushBlob({
    id: note.id,
    type: 'note',
    ...(await encryptJSON(vaultKey, note)),
    client_updated_at: note.updatedAt,
    deleted: !!note.deleted,
  });
}

async function persistLocal(note) {
  await new Promise((resolve, reject) => {
    const tx = localDb.transaction('notes', 'readwrite');
    tx.objectStore('notes').put(JSON.parse(JSON.stringify(note)));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function pushBlob(blob) {
  const res = await api.push([blob]);
  if (res.revs?.length) {
    syncCursor = Math.max(syncCursor, ...res.revs.map(r => r.rev));
    localStorage.setItem('fn_sync_cursor', String(syncCursor));
  }
}

/** 首次同步：拉取全部密文 → 本地解密 → 建立内存索引 */
export async function pullAndDecrypt() {
  let hasMore = true;
  while (hasMore) {
    const res = await api.pull(syncCursor);
    for (const b of res.blobs) {
      if (b.type !== 'note') continue;
      if (b.deleted) { notes.delete(b.id); continue; }
      try {
        const note = await decryptJSON(vaultKey, b);
        // last-write-wins
        const existing = notes.get(b.id);
        if (!existing || note.updatedAt >= existing.updatedAt) {
          notes.set(b.id, note);
          await persistLocal(note);
        }
      } catch (e) {
        console.error('解密失败（可能密钥不匹配）:', b.id, e);
      }
      syncCursor = Math.max(syncCursor, b.rev);
    }
    localStorage.setItem('fn_sync_cursor', String(syncCursor));
    hasMore = res.hasMore;
  }
}

/** 金库初始化（首次设置主密码）：生成盐 → 派生密钥 → 上传盐+校验器 */
export async function setupVault(password, key) {
  vaultKey = key;
  await pushBlob({ id: 'vault-verifier', type: 'verifier', ...(await encryptJSON(key, { ok: true })), client_updated_at: Date.now() });
}

/** 验证主密码：尝试解密服务器上的校验器 */
export async function verifyVault(key) {
  try {
    const res = await api.pull(0, 1000);
    const verifier = res.blobs.find(b => b.type === 'verifier' && b.id === 'vault-verifier');
    if (!verifier) return 'missing'; // 金库还不存在（首次使用）
    await decryptJSON(key, verifier);
    return 'ok';
  } catch {
    return 'wrong_password';
  }
}

// ---- 本地全文搜索（明文仅在内存中索引）----
export function searchNotes(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allNotes().sort((a, b) => b.updatedAt - a.updatedAt);
  return allNotes()
    .filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (n.blocks || []).some(bl => (bl.html || '').toLowerCase().includes(q)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 解析 [[双向链接]] → 目标笔记标题数组 */
export function extractLinks(html) {
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(html || '')) !== null) out.push(m[1].trim());
  return out;
}
