// ============================================================
// graph.js — 知识图谱（基于 [[双向链接]] 的简单力导向图）
// 参考 Obsidian 的图谱视图思路，纯 SVG 实现，无第三方依赖
// ============================================================
import { allNotes, extractLinks } from './store.js';

export function renderGraph(container) {
  const notes = allNotes().filter(n => !n.deleted);
  const byTitle = new Map(notes.map(n => [n.title.trim(), n]));

  // 构建节点与边
  const nodes = notes.map(n => ({
    id: n.id, label: n.title || '无标题',
    degree: 0, x: 0, y: 0, vx: 0, vy: 0,
  }));
  const idIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = [];
  for (const n of notes) {
    for (const bl of n.blocks || []) {
      for (const target of extractLinks(bl.html)) {
        const t = byTitle.get(target);
        if (t && t.id !== n.id && idIdx.has(t.id)) {
          edges.push([idIdx.get(n.id), idIdx.get(t.id)]);
          nodes[idIdx.get(n.id)].degree++;
          nodes[idIdx.get(t.id)].degree++;
        }
      }
    }
  }

  // 力导向模拟（简版：斥力 + 弹簧 + 中心引力，150 轮）
  const W = container.clientWidth || 800, H = 520;
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    n.x = W / 2 + Math.cos(a) * (W / 4) + Math.random() * 20;
    n.y = H / 2 + Math.sin(a) * (H / 4) + Math.random() * 20;
  });
  for (let iter = 0; iter < 150; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 1;
        const f = 2000 / d2;                       // 库仑斥力
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }
    for (const [i, j] of edges) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 110) * 0.02;                  // 胡克弹簧
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.003;               // 中心引力
      n.vy += (H / 2 - n.y) * 0.003;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x = Math.max(30, Math.min(W - 30, n.x + n.vx));
      n.y = Math.max(30, Math.min(H - 30, n.y + n.vy));
    }
  }

  // 渲染 SVG
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('graph-svg');
  for (const [i, j] of edges) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', nodes[i].x); line.setAttribute('y1', nodes[i].y);
    line.setAttribute('x2', nodes[j].x); line.setAttribute('y2', nodes[j].y);
    line.setAttribute('class', 'graph-edge');
    svg.appendChild(line);
  }
  for (const n of nodes) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', 5 + Math.min(n.degree, 8) * 1.5);
    c.setAttribute('class', 'graph-node');
    const t = document.createElementNS(ns, 'text');
    t.textContent = n.label.length > 12 ? n.label.slice(0, 12) + '…' : n.label;
    t.setAttribute('class', 'graph-label');
    g.appendChild(c); g.appendChild(t);
    g.style.cursor = 'pointer';
    g.addEventListener('click', () => window.appOpenNote(n.id));
    svg.appendChild(g);
  }
  container.innerHTML = '';
  container.appendChild(svg);
  if (!nodes.length) container.innerHTML = '<p class="empty-hint">还没有笔记，先写一篇再来生成图谱吧。</p>';
}
