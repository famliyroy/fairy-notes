// ============================================================
// api.js — 与后端通信的薄封装（全部走 HTTPS + Bearer 会话）
// 服务器地址可配置：网页端默认同源；移动 APP 内填写私有服务器地址
// ============================================================

/** 服务器基地址：默认同源（''），APP 内保存到 localStorage */
export function getServerBase() {
  return (localStorage.getItem('fn_server') || '').trim().replace(/\/+$/, '');
}
export function setServerBase(url) {
  localStorage.setItem('fn_server', (url || '').trim());
}

let token = localStorage.getItem('fn_session_token') || '';

export function setToken(t) {
  token = t || '';
  if (t) localStorage.setItem('fn_session_token', t);
  else localStorage.removeItem('fn_session_token');
}
export function getToken() { return token; }

async function request(method, url, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(getServerBase() + url, {
    method,
    headers,
    body: body === undefined ? undefined
      : typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (resp.status === 401) {
    setToken('');
    throw new Error('会话已过期，请重新登录');
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
  return data;
}

export const api = {
  getConfig: () => request('GET', '/api/config'),
  loginDev: (email, kdf_salt) => request('POST', '/api/auth/dev', { email, kdf_salt }),
  loginGoogle: (credential, kdf_salt) => request('POST', '/api/auth/google', { credential, kdf_salt }),
  me: () => request('GET', '/api/me'),
  getSalt: () => request('GET', '/api/vault/salt'),
  setSalt: (kdf_salt) => request('POST', '/api/vault/salt', { kdf_salt }),
  push: (blobs) => request('POST', '/api/sync/push', { blobs }),
  pull: (since, limit) => request('GET', `/api/sync/pull?since=${since}&limit=${limit}`),
};
