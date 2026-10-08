// ============================================================
// crypto.js — 本地端到端加密模块（浏览器 WebCrypto）
// 设计：
//   主密码 --PBKDF2-SHA256(310000次, 随机盐)--> AES-GCM 256 密钥
//   * 密钥只在内存中（CryptoKey 不可导出），绝不发给服务器
//   * 每次加密使用全新随机 96-bit nonce
//   * 金库校验器：加密固定字符串存服务器，用于验证密码正确性
// ============================================================

const PBKDF2_ITERATIONS = 310000; // OWASP 2023 推荐量级
const VERIFIER_PLAINTEXT = 'fairy-notes-vault-verifier-v1';

/** 生成随机盐（base64） */
export function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToB64(salt);
}

/** 主密码 → AES-GCM CryptoKey（不可导出，仅存内存） */
export async function deriveKey(password, saltB64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBytes(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // 不允许导出 —— 密钥无法离开本设备内存
    ['encrypt', 'decrypt']
  );
}

/** 加密任意 JS 对象 → {nonce, cipher}（均 base64） */
export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { nonce: bytesToB64(iv), cipher: bytesToB64(new Uint8Array(ct)) };
}

/** 解密 {nonce, cipher} → JS 对象；密码错误会抛异常 */
export async function decryptJSON(key, blob) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(blob.nonce) },
    key,
    b64ToBytes(blob.cipher)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

/** 生成金库校验器 blob（用当前密码加密固定字符串） */
export async function makeVerifier(key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(VERIFIER_PLAINTEXT)
  );
  return { nonce: bytesToB64(iv), cipher: bytesToB64(new Uint8Array(ct)) };
}

export function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
