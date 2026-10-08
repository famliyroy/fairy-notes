// ============================================================
// app.js — 主应用：登录 → 金库解锁 → 笔记工作台
// ============================================================
import { api, setToken, getToken, setServerBase } from './api.js';
import { generateSalt, deriveKey, makeVerifier, decryptJSON } from './crypto.js';
import {
  initStore, setVaultKey, newNote, saveNote, getNote,
  pullAndDecrypt, allNotes, searchNotes, setupVault, verifyVault,
} from './store.js';
import { renderGraph } from './graph.js';
import {
  getWebdavCfg, setWebdavCfg, backupToWebdav, restoreFromWebdav, listBackups,
} from './webdav.js';

const $ = (sel) => document.querySelector(sel);
let currentNote = null;
let saveTimer = null;
let appConfig = { googleClientId: '', devAuth: false };

// ---------- 画面切换 ----------
function show(screen) {
  for (const s of ['screen-auth', 'screen-unlock', 'screen-app']) {
    $('#' + s).classList.toggle('hidden', s !== screen);
  }
}

// ---------- 登录阶段 ----------
async function initAuth() {
  // 服务器地址（APP 内必填，网页同源可留空）
  $('#server-url').value = localStorage.getItem('fn_server') || '';
  const applyServer = () => setServerBase($('#server-url').value);
  appConfig = await api.getConfig();
  if (appConfig.googleClientId) {
    // 谷歌 GIS 官方合规接入方式加载
    await loadScript('https://accounts.google.com/gsi/client');
    google.accounts.id.initialize({
      client_id: appConfig.googleClientId,
      callback: async (resp) => {
        try {
          applyServer();
          const salt = localStorage.getItem('fn_kdf_salt') || generateSalt();
          localStorage.setItem('fn_kdf_salt', salt);
          const r = await api.loginGoogle(resp.credential, salt);
          afterLogin(r);
        } catch (e) { alert('登录失败: ' + e.message); }
      },
    });
    google.accounts.id.renderButton($('#google-btn'), { theme: 'outline', size: 'large', width: 320 });
    $('#google-section').classList.remove('hidden');
  }
  if (appConfig.devAuth) {
    $('#dev-section').classList.remove('hidden');
    $('#dev-login-btn').onclick = async () => {
      try {
        applyServer();
        const email = $('#dev-email').value.trim() || 'dev@local.test';
        const salt = localStorage.getItem('fn_kdf_salt') || generateSalt();
        localStorage.setItem('fn_kdf_salt', salt);
        const r = await api.loginDev(email, salt);
        afterLogin(r);
      } catch (e) { alert('登录失败: ' + e.message); }
    };
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function afterLogin(r) {
  setToken(r.token);
  $('#user-email').textContent = (await api.me()).email;
  show('screen-unlock');
  const saltRes = await api.getSalt();
  if (saltRes.kdf_salt) localStorage.setItem('fn_kdf_salt', saltRes.kdf_salt);
}

// ---------- 金库解锁 ----------
$('#unlock-btn').onclick = async () => {
  const password = $('#master-password').value;
  if (!password) return alert('请输入主密码');
  $('#unlock-status').textContent = '正在派生密钥…（PBKDF2 310000 轮，稍等）';
  try {
    const salt = localStorage.getItem('fn_kdf_salt');
    const key = await deriveKey(password, salt);
    const status = await verifyVault(key);
    if (status === 'wrong_password') {
      $('#unlock-status').textContent = '❌ 主密码错误';
      return;
    }
    setVaultKey(key);
    await initStore();
    if (status === 'missing') {
      await setupVault(password, key); // 首次：写入金库校验器
    }
    await pullAndDecrypt();
    enterApp();
  } catch (e) {
    $('#unlock-status').textContent = '解锁失败: ' + e.message;
  }
};
$('#master-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#unlock-btn').click(); });

// ---------- 工作台 ----------
function enterApp() {
  show('screen-app');
  renderSidebar();
  bindEditor();
}

function renderSidebar() {
  const q = $('#search-input').value;
  const list = $('#note-list');
  list.innerHTML = '';
  for (const n of searchNotes(q)) {
    const item = document.createElement('div');
    item.className = 'note-item' + (currentNote?.id === n.id ? ' active' : '');
    item.innerHTML = `<div class="note-item-title"></div>
      <div class="note-item-meta">${(n.tags || []).map(t => '#' + t).join(' ')}</div>`;
    item.querySelector('.note-item-title').textContent = n.title || '无标题';
    item.onclick = () => openNote(n.id);
    list.appendChild(item);
  }
  if (!list.children.length) {
    list.innerHTML = '<p class="empty-hint">无笔记。点击「新建笔记」开始。</p>';
  }
}

function openNote(id) {
  currentNote = getNote(id);
  if (!currentNote) return;
  $('#note-title').value = currentNote.title;
  $('#tags-input').value = (currentNote.tags || []).join(', ');
  renderBlocks();
  renderSidebar();
}
window.appOpenNote = openNote; // 供图谱点击跳转

function renderBlocks() {
  const wrap = $('#blocks');
  wrap.innerHTML = '';
  (currentNote?.blocks || []).forEach((bl, idx) => {
    const div = document.createElement('div');
    div.className = 'block';
    div.contentEditable = 'true';
    div.dataset.blockId = bl.id;
    div.innerHTML = bl.html || '';
    div.addEventListener('input', () => {
      bl.html = div.innerHTML;
      scheduleSave();
    });
    div.addEventListener('keydown', (e) => {
      // 回车=新建块；Shift+回车=块内换行
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const nb = { id: crypto.randomUUID(), type: 'text', html: '' };
        currentNote.blocks.splice(idx + 1, 0, nb);
        renderBlocks();
        const next = $('#blocks').children[idx + 1];
        next?.focus();
      }
    });
    wrap.appendChild(div);
  });
}

function bindEditor() {
  $('#new-note-btn').onclick = () => {
    currentNote = newNote();
    saveNote(currentNote).then(() => { openNote(currentNote.id); });
  };
  $('#note-title').addEventListener('input', () => {
    if (currentNote) { currentNote.title = $('#note-title').value; scheduleSave(); }
  });
  $('#tags-input').addEventListener('input', () => {
    if (currentNote) {
      currentNote.tags = $('#tags-input').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      scheduleSave();
    }
  });
  $('#search-input').addEventListener('input', renderSidebar);
  $('#tab-editor').onclick = () => switchTab('editor');
  $('#tab-graph').onclick = () => switchTab('graph');
  $('#tab-settings').onclick = () => switchTab('settings');
  bindSettings();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  $('#save-status').textContent = '…';
  saveTimer = setTimeout(async () => {
    try {
      await saveNote(currentNote);
      $('#save-status').textContent = '已加密并同步 ✓';
      renderSidebar();
    } catch (e) {
      $('#save-status').textContent = '同步失败: ' + e.message;
    }
  }, 600);
}

function switchTab(tab) {
  $('#view-editor').classList.toggle('hidden', tab !== 'editor');
  $('#view-graph').classList.toggle('hidden', tab !== 'graph');
  $('#view-settings').classList.toggle('hidden', tab !== 'settings');
  for (const t of ['editor', 'graph', 'settings']) {
    $('#tab-' + t).classList.toggle('active', t === tab);
  }
  if (tab === 'graph') renderGraph($('#graph-container'));
}

// ---------- 设置 / WebDAV 备份 ----------
function bindSettings() {
  const cfg = getWebdavCfg();
  $('#wd-url').value = cfg.url || '';
  $('#wd-user').value = cfg.user || '';
  $('#wd-pass').value = cfg.pass || '';
  $('#wd-save').onclick = () => {
    setWebdavCfg({
      url: $('#wd-url').value.trim().replace(/\/+$/, ''),
      user: $('#wd-user').value,
      pass: $('#wd-pass').value,
    });
    $('#wd-status').textContent = 'WebDAV 配置已保存到本机（不会上传）';
  };
  $('#wd-backup').onclick = async () => {
    try {
      const name = await backupToWebdav();
      $('#wd-status').textContent = `✅ 已加密备份到 WebDAV: ${name}`;
    } catch (e) { $('#wd-status').textContent = '❌ ' + e.message; }
  };
  $('#wd-list').onclick = async () => {
    try {
      const files = await listBackups();
      $('#wd-files').innerHTML = files.map(f =>
        `<div class="wd-file" data-name="${f}">${f}</div>`).join('') || '<p class="empty-hint">没有找到备份文件</p>';
      for (const el of document.querySelectorAll('.wd-file')) {
        el.onclick = () => { $('#wd-restore-name').value = el.dataset.name; };
      }
    } catch (e) { $('#wd-status').textContent = '❌ ' + e.message; }
  };
  $('#wd-restore').onclick = async () => {
    try {
      const name = $('#wd-restore-name').value.trim();
      const incoming = await restoreFromWebdav(name);
      let merged = 0;
      for (const n of incoming) {
        const local = getNote(n.id);
        if (!local || n.updatedAt > local.updatedAt) {
          await saveNote(n); merged++;
        }
      }
      renderSidebar();
      $('#wd-status').textContent = `✅ 恢复完成，合并了 ${merged} 篇笔记`;
    } catch (e) { $('#wd-status').textContent = '❌ ' + e.message; }
  };
  $('#lock-btn').onclick = () => location.reload(); // 锁定=刷新（密钥随内存释放）
}

// ---------- 启动 ----------
(async function main() {
  if (getToken()) {
    try {
      const me = await api.me();
      $('#user-email').textContent = me.email;
      show('screen-unlock');
      const saltRes = await api.getSalt();
      if (saltRes.kdf_salt) localStorage.setItem('fn_kdf_salt', saltRes.kdf_salt);
      return;
    } catch { setToken(''); }
  }
  show('screen-auth');
  await initAuth();
})();
