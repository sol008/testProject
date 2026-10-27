// UI drawing toolkit: ornate panels, cursors, gauges, icons, list widget, toasts.
'use strict';
G.UI = (() => {
  const UI = {};
  const U = G.U;
  UI.GOLD = '#d9b56a';
  UI.GOLD_L = '#f5dfa4';
  UI.INK = '#0d1424';
  UI.TEXT = '#f3ead2';
  UI.DIM = '#9c947f';

  // Ornate translucent panel with gold double border and cloud-corner ornaments
  UI.panel = function (ctx, x, y, w, h, o = {}) {
    const a = o.alpha == null ? 1 : o.alpha;
    ctx.save();
    ctx.globalAlpha *= a;
    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(x + 4, y + 6, w, h, 10); ctx.fill();
    // body gradient
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, o.top || 'rgba(28,38,62,0.94)');
    g.addColorStop(1, o.bottom || 'rgba(10,14,28,0.94)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
    // faint pattern: diagonal waves
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.clip();
    ctx.globalAlpha *= 0.06;
    ctx.strokeStyle = UI.GOLD_L; ctx.lineWidth = 1;
    for (let i = -h; i < w; i += 26) {
      ctx.beginPath();
      for (let k = 0; k <= h; k += 6) {
        const xx = x + i + k + Math.sin(k * 0.12) * 4;
        if (k === 0) ctx.moveTo(xx, y + k); else ctx.lineTo(xx, y + k);
      }
      ctx.stroke();
    }
    ctx.restore();
    // inner glow at top
    const gl = ctx.createLinearGradient(x, y, x, y + 40);
    gl.addColorStop(0, 'rgba(255,220,150,0.10)');
    gl.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.roundRect(x, y, w, Math.min(40, h), 10); ctx.fill();
    // borders
    ctx.strokeStyle = U.rgba(UI.GOLD, 0.9); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 9); ctx.stroke();
    ctx.strokeStyle = U.rgba(UI.GOLD, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 6); ctx.stroke();
    // corner ornaments (cloud scrolls)
    if (o.ornament !== false && w > 60 && h > 50) {
      ctx.strokeStyle = UI.GOLD_L; ctx.lineWidth = 1.6; ctx.fillStyle = UI.GOLD;
      const corner = (cx, cy, sx, sy) => {
        ctx.beginPath();
        ctx.moveTo(cx + sx * 4, cy + sy * 18);
        ctx.quadraticCurveTo(cx + sx * 4, cy + sy * 4, cx + sx * 18, cy + sy * 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + sx * 11, cy + sy * 11, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + sx * 11, cy + sy * 11, 6, sx > 0 ? Math.PI : 0, sx > 0 ? Math.PI * 1.6 : Math.PI * 0.6);
        ctx.stroke();
      };
      corner(x, y, 1, 1); corner(x + w, y, -1, 1); corner(x, y + h, 1, -1); corner(x + w, y + h, -1, -1);
    }
    if (o.title) {
      const tw = Math.max(120, o.title.length * 26 + 50);
      const tx = x + 24, ty = y - 16;
      const tg = ctx.createLinearGradient(tx, ty, tx, ty + 32);
      tg.addColorStop(0, '#7a2a22'); tg.addColorStop(1, '#4a1612');
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.roundRect(tx, ty, tw, 32, 6); ctx.fill();
      ctx.strokeStyle = UI.GOLD; ctx.lineWidth = 1.5; ctx.stroke();
      G.Render.text(ctx, o.title, tx + tw / 2, ty + 5, { size: 20, align: 'center', color: UI.GOLD_L });
    }
    ctx.restore();
  };

  // Simple flat panel (lighter weight, e.g. HUD)
  UI.plate = function (ctx, x, y, w, h, alpha = 0.7, r = 8) {
    ctx.save();
    ctx.fillStyle = `rgba(8,12,24,${alpha})`;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = U.rgba(UI.GOLD, 0.45); ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  UI.cursor = function (ctx, x, y, w, h, t, active = true) {
    ctx.save();
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, `rgba(240,200,110,${0.42 * pulse})`);
    g.addColorStop(0.7, `rgba(240,200,110,${0.16 * pulse})`);
    g.addColorStop(1, 'rgba(240,200,110,0)');
    ctx.fillStyle = active ? g : 'rgba(200,200,200,0.12)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
    if (active) {
      // glint sweep
      const gx = x + ((t * 220) % (w + 200)) - 100;
      const sg = ctx.createLinearGradient(gx - 40, 0, gx + 40, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,250,220,0.18)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.clip();
      ctx.fillStyle = sg; ctx.fillRect(gx - 40, y, 80, h);
      ctx.restore();
      // lantern marker
      UI.lanternIcon(ctx, x - 4, y + h / 2, 9, t);
    }
    ctx.restore();
  };

  UI.lanternIcon = function (ctx, x, y, r, t = 0) {
    ctx.save();
    const fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    glow.addColorStop(0, `rgba(255,170,80,${0.5 * fl})`);
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, '#ffe0a0'); g.addColorStop(0.5, '#ff7a3a'); g.addColorStop(1, '#b8281e');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a1a10';
    ctx.fillRect(x - r * 0.45, y - r - 2, r * 0.9, 3);
    ctx.fillRect(x - r * 0.45, y + r - 1, r * 0.9, 3);
    ctx.restore();
  };

  UI.bar = function (ctx, x, y, w, h, ratio, c1, c2, o = {}) {
    ratio = U.clamp(ratio, 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    if (o.ghost != null && o.ghost > ratio) {
      ctx.fillStyle = 'rgba(255,240,200,0.5)';
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, (w - 2) * Math.min(1, o.ghost), h - 2, (h - 2) / 2); ctx.fill();
    }
    if (ratio > 0) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, Math.max(h - 2, (w - 2) * ratio), h - 2, (h - 2) / 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + h / 2, y + 2, Math.max(0, (w - 2) * ratio - h), Math.max(1, h * 0.22));
    }
    ctx.strokeStyle = 'rgba(255,230,180,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.restore();
  };

  UI.ELEM = {
    metal: { ch: '金', c: '#e8e2c8', bg: '#8a8060' },
    wood: { ch: '木', c: '#bff59a', bg: '#3f7a2a' },
    water: { ch: '水', c: '#b8e4ff', bg: '#2a5f98' },
    fire: { ch: '火', c: '#ffd0a0', bg: '#b8401e' },
    earth: { ch: '土', c: '#f0d8a8', bg: '#8a5a24' },
  };
  UI.elemBadge = function (ctx, elem, x, y, r = 11) {
    const e = UI.ELEM[elem];
    if (!e) return;
    ctx.save();
    ctx.fillStyle = e.bg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = e.c; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = G.font(r * 1.3, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = e.c; ctx.fillText(e.ch, x, y + 1);
    ctx.restore();
  };

  // ---------- item icons (procedural, cached) ----------
  const iconCache = {};
  const ICON_DRAW = {
    potion(c) { // gourd bottle
      c.fillStyle = '#c33a2c'; c.beginPath(); c.ellipse(16, 21, 9, 8, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(16, 11, 5.5, 5, 0, 0, 7); c.fill();
      c.fillStyle = '#7a4a22'; c.fillRect(14, 3, 4, 4);
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(12.5, 18, 2, 3.5, 0.4, 0, 7); c.fill();
      c.fillStyle = '#f5d78a'; c.fillRect(11, 15.5, 10, 2);
    },
    herb(c) {
      c.strokeStyle = '#3f7a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(16, 28); c.quadraticCurveTo(15, 18, 18, 8); c.stroke();
      c.fillStyle = '#6cc04a';
      [[10, 14, -0.6], [22, 12, 0.6], [11, 21, -0.4], [21, 20, 0.5], [17, 7, 0]].forEach(([x, y, r]) => { c.beginPath(); c.ellipse(x, y, 6, 3, r, 0, 7); c.fill(); });
    },
    food(c) { // bowl of 芋圓
      c.fillStyle = '#e8d9b8'; c.beginPath(); c.ellipse(16, 18, 12, 4, 0, 0, 7); c.fill();
      ['#c9a2e0', '#f0c070', '#e8e0d0', '#b08ad0'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(9 + i * 5, 16 - (i % 2) * 2, 3, 0, 7); c.fill(); });
      c.fillStyle = '#4a6a9a'; c.beginPath(); c.moveTo(4, 18); c.quadraticCurveTo(16, 34, 28, 18); c.closePath(); c.fill();
      c.strokeStyle = '#d9e4f0'; c.lineWidth = 1; c.beginPath(); c.moveTo(7, 22); c.lineTo(25, 22); c.stroke();
    },
    drink(c) {
      c.fillStyle = '#8a6a3a'; c.beginPath(); c.moveTo(9, 10); c.lineTo(23, 10); c.lineTo(21, 27); c.lineTo(11, 27); c.closePath(); c.fill();
      c.fillStyle = '#2a1a0e'; c.beginPath(); c.ellipse(16, 10, 7, 2.5, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(12, 13, 2, 11);
    },
    wine(c) {
      c.fillStyle = '#d8c8a0'; c.beginPath(); c.ellipse(16, 21, 10, 8, 0, 0, 7); c.fill();
      c.fillRect(12, 6, 8, 9);
      c.fillStyle = '#c33a2c'; c.fillRect(11, 17, 10, 8);
      c.fillStyle = '#f5d78a'; c.font = 'bold 8px serif'; c.fillText('酒', 12, 24);
      c.fillStyle = '#7a4a22'; c.fillRect(12, 3, 8, 4);
    },
    pill(c) {
      const g = c.createRadialGradient(13, 13, 1, 16, 16, 10); g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#d9a020');
      c.fillStyle = g; c.beginPath(); c.arc(16, 16, 9, 0, 7); c.fill();
    },
    incense(c) {
      c.fillStyle = '#9a6a3a'; c.fillRect(15, 8, 2, 20);
      c.fillStyle = '#ff6a2a'; c.beginPath(); c.arc(16, 8, 2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(220,220,240,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(16, 6); c.bezierCurveTo(12, 2, 20, 0, 15, -4); c.stroke();
      c.fillStyle = '#7a3a1a'; c.fillRect(9, 26, 14, 4);
    },
    talisman(c) {
      c.fillStyle = '#f2d24a'; c.fillRect(10, 3, 12, 26);
      c.strokeStyle = '#c0281e'; c.lineWidth = 1.6; c.beginPath();
      c.moveTo(16, 6); c.lineTo(16, 26); c.moveTo(12, 10); c.lineTo(20, 10); c.moveTo(12, 16); c.quadraticCurveTo(20, 18, 13, 22); c.stroke();
    },
    bomb(c) {
      c.fillStyle = '#3a3a44'; c.beginPath(); c.arc(16, 19, 9, 0, 7); c.fill();
      c.fillStyle = '#c0281e'; c.fillRect(11, 16, 10, 5);
      c.strokeStyle = '#d9b56a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(16, 10); c.quadraticCurveTo(20, 5, 24, 6); c.stroke();
      c.fillStyle = '#ffd040'; c.beginPath(); c.arc(24, 6, 2, 0, 7); c.fill();
    },
    mushroom(c, t) {
      c.fillStyle = '#f0ead8'; c.fillRect(13, 15, 6, 13);
      const g = c.createLinearGradient(4, 4, 28, 16);
      g.addColorStop(0, '#ff6ad5'); g.addColorStop(0.35, '#7af0ff'); g.addColorStop(0.7, '#b6ff6a'); g.addColorStop(1, '#ffd06a');
      c.fillStyle = g; c.beginPath(); c.ellipse(16, 15, 12, 9, 0, Math.PI, 0); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.8)'; [[10, 11], [17, 8], [22, 12]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); });
    },
    sword(c) {
      c.save(); c.translate(16, 16); c.rotate(-Math.PI / 4);
      const g = c.createLinearGradient(-2, 0, 2, 0); g.addColorStop(0, '#9aa6b8'); g.addColorStop(0.5, '#f4f8ff'); g.addColorStop(1, '#8a94a8');
      c.fillStyle = g; c.beginPath(); c.moveTo(-2, 6); c.lineTo(-2, -12); c.lineTo(0, -15); c.lineTo(2, -12); c.lineTo(2, 6); c.fill();
      c.fillStyle = '#d9b56a'; c.fillRect(-6, 6, 12, 3);
      c.fillStyle = '#6a2a1a'; c.fillRect(-1.5, 9, 3, 6);
      c.fillStyle = '#c0281e'; c.beginPath(); c.arc(0, 16, 2, 0, 7); c.fill();
      c.restore();
    },
    spear(c) {
      c.save(); c.translate(16, 16); c.rotate(-Math.PI / 4);
      c.fillStyle = '#7a4a22'; c.fillRect(-1.2, -6, 2.4, 22);
      c.fillStyle = '#e8eef8'; c.beginPath(); c.moveTo(0, -16); c.lineTo(3, -8); c.lineTo(0, -6); c.lineTo(-3, -8); c.closePath(); c.fill();
      c.fillStyle = '#d82a22'; c.beginPath(); c.moveTo(-3, -6); c.quadraticCurveTo(0, 2, 4, 2); c.quadraticCurveTo(1, -2, 3, -6); c.fill();
      c.restore();
    },
    flute(c) {
      c.save(); c.translate(16, 16); c.rotate(-Math.PI / 4);
      const g = c.createLinearGradient(-3, 0, 3, 0); g.addColorStop(0, '#5fa88a'); g.addColorStop(0.5, '#bff0d8'); g.addColorStop(1, '#4a8a70');
      c.fillStyle = g; c.beginPath(); c.roundRect(-2.5, -15, 5, 30, 2); c.fill();
      c.fillStyle = '#1a3a2a'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(0, -10 + i * 5, 1, 0, 7); c.fill(); }
      c.fillStyle = '#c0281e'; c.fillRect(-1, 13, 2, 5);
      c.restore();
    },
    fan(c) {
      c.fillStyle = '#efe6cc';
      c.beginPath(); c.moveTo(16, 27); c.arc(16, 27, 20, -Math.PI * 0.85, -Math.PI * 0.15); c.closePath(); c.fill();
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 0.8;
      for (let i = 0; i <= 6; i++) { const a = -Math.PI * 0.85 + i * Math.PI * 0.7 / 6; c.beginPath(); c.moveTo(16, 27); c.lineTo(16 + Math.cos(a) * 20, 27 + Math.sin(a) * 20); c.stroke(); }
      c.strokeStyle = '#2a2a3a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(10, 14); c.quadraticCurveTo(16, 10, 22, 15); c.stroke();
    },
    armor(c) {
      c.fillStyle = '#3a4a7a'; c.beginPath(); c.moveTo(8, 6); c.lineTo(24, 6); c.lineTo(27, 12); c.lineTo(23, 14); c.lineTo(23, 28); c.lineTo(9, 28); c.lineTo(9, 14); c.lineTo(5, 12); c.closePath(); c.fill();
      c.fillStyle = '#e8e0c8'; c.beginPath(); c.moveTo(13, 6); c.lineTo(16, 13); c.lineTo(19, 6); c.fill();
      c.fillStyle = '#d9b56a'; c.fillRect(9, 18, 14, 2.5);
    },
    hat(c) {
      c.fillStyle = '#c9a868'; c.beginPath(); c.moveTo(2, 22); c.lineTo(16, 8); c.lineTo(30, 22); c.quadraticCurveTo(16, 26, 2, 22); c.fill();
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(16, 8); c.lineTo(5 + i * 7.5, 22); c.stroke(); }
    },
    hairpin(c) {
      c.strokeStyle = '#d9b56a'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, 26); c.lineTo(24, 8); c.stroke();
      c.fillStyle = '#ff9a6a'; c.beginPath(); c.arc(24, 8, 4, 0, 7); c.fill();
      c.fillStyle = '#7ad0ff'; c.beginPath(); c.arc(20, 14, 2, 0, 7); c.fill();
    },
    shoes(c) {
      c.fillStyle = '#2a2a34'; c.beginPath(); c.moveTo(4, 22); c.quadraticCurveTo(4, 14, 12, 14); c.lineTo(16, 14); c.lineTo(17, 20); c.lineTo(28, 22); c.quadraticCurveTo(29, 27, 24, 27); c.lineTo(5, 27); c.closePath(); c.fill();
      c.fillStyle = '#c0281e'; c.fillRect(9, 15, 6, 2);
    },
    ring(c) {
      c.strokeStyle = '#d9b56a'; c.lineWidth = 3; c.beginPath(); c.arc(16, 18, 8, 0, 7); c.stroke();
      c.fillStyle = '#5ad0a0'; c.beginPath(); c.arc(16, 9, 4, 0, 7); c.fill();
    },
    charm(c) { // 香包 / 平安符
      c.fillStyle = '#c0281e'; c.beginPath(); c.moveTo(16, 8); c.lineTo(25, 18); c.lineTo(16, 28); c.lineTo(7, 18); c.closePath(); c.fill();
      c.fillStyle = '#f2d24a'; c.font = 'bold 9px serif'; c.textAlign = 'center'; c.fillText('福', 16, 21);
      c.strokeStyle = '#f2d24a'; c.lineWidth = 1; c.beginPath(); c.moveTo(16, 8); c.lineTo(16, 2); c.stroke();
    },
    jade(c) {
      const g = c.createRadialGradient(13, 12, 1, 16, 16, 11); g.addColorStop(0, '#e8fff4'); g.addColorStop(1, '#4aa882');
      c.fillStyle = g; c.beginPath(); c.roundRect(9, 6, 14, 20, 4); c.fill();
      c.strokeStyle = '#2a6a50'; c.lineWidth = 1; c.stroke();
      c.strokeStyle = '#c0281e'; c.beginPath(); c.moveTo(16, 6); c.lineTo(16, 1); c.stroke();
    },
    watch(c) {
      c.fillStyle = '#c9a050'; c.beginPath(); c.arc(16, 18, 10, 0, 7); c.fill();
      c.fillStyle = '#f8f0dc'; c.beginPath(); c.arc(16, 18, 7.5, 0, 7); c.fill();
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(16, 18); c.lineTo(16, 13); c.moveTo(16, 18); c.lineTo(20, 19); c.stroke();
      c.fillStyle = '#c9a050'; c.fillRect(14, 5, 4, 4);
    },
    letter(c) {
      c.fillStyle = '#efe4c8'; c.fillRect(6, 9, 20, 15);
      c.strokeStyle = '#9a8a6a'; c.lineWidth = 1; c.beginPath(); c.moveTo(6, 9); c.lineTo(16, 18); c.lineTo(26, 9); c.stroke();
      c.fillStyle = '#c0281e'; c.beginPath(); c.arc(16, 18, 2.5, 0, 7); c.fill();
    },
    scroll(c) {
      c.fillStyle = '#efe4c8'; c.fillRect(7, 8, 18, 16);
      c.fillStyle = '#7a4a22'; c.fillRect(5, 6, 22, 3); c.fillRect(5, 23, 22, 3);
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 0.8; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(10 + i * 4, 11); c.lineTo(10 + i * 4, 21); c.stroke(); }
    },
    key(c) {
      c.strokeStyle = '#d9b56a'; c.lineWidth = 2.5; c.beginPath(); c.arc(11, 11, 5, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(15, 15); c.lineTo(26, 26); c.moveTo(22, 22); c.lineTo(25, 19); c.moveTo(25, 25); c.lineTo(28, 22); c.stroke();
    },
    lantern(c) {
      const g = c.createRadialGradient(14, 14, 1, 16, 17, 11); g.addColorStop(0, '#ffe8a8'); g.addColorStop(0.6, '#ff7a3a'); g.addColorStop(1, '#a8241a');
      c.fillStyle = g; c.beginPath(); c.ellipse(16, 17, 9, 10, 0, 0, 7); c.fill();
      c.fillStyle = '#2a1a10'; c.fillRect(11, 5, 10, 3); c.fillRect(11, 26, 10, 3);
      c.fillStyle = '#f2d24a'; c.fillRect(15, 29, 2, 3);
    },
    vine(c) {
      c.strokeStyle = '#5a3a1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(6, 28); c.bezierCurveTo(26, 22, 4, 12, 24, 4); c.stroke();
      c.fillStyle = '#4a9a3a'; [[10, 22], [20, 14], [14, 9]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 4, 2.2, 0.6, 0, 7); c.fill(); });
    },
    gem(c) {
      const g = c.createLinearGradient(8, 6, 24, 26); g.addColorStop(0, '#d0f0ff'); g.addColorStop(1, '#6a5aff');
      c.fillStyle = g; c.beginPath(); c.moveTo(16, 5); c.lineTo(25, 13); c.lineTo(16, 28); c.lineTo(7, 13); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(7, 13); c.lineTo(25, 13); c.moveTo(16, 5); c.lineTo(16, 28); c.stroke();
    },
    bag(c) {
      c.fillStyle = '#8a5a2a'; c.beginPath(); c.moveTo(10, 10); c.quadraticCurveTo(4, 28, 16, 28); c.quadraticCurveTo(28, 28, 22, 10); c.closePath(); c.fill();
      c.fillStyle = '#c0281e'; c.fillRect(10, 9, 12, 3);
    },
    misc(c) {
      c.fillStyle = '#9a8a6a'; c.beginPath(); c.arc(16, 16, 9, 0, 7); c.fill();
    },
  };
  UI.icon = function (ctx, name, x, y, size = 32) {
    const key = name;
    let c = iconCache[key];
    if (!c) {
      c = U.makeCanvas(32, 32);
      const cx = c.getContext('2d');
      (ICON_DRAW[name] || ICON_DRAW.misc)(cx, 0);
      iconCache[key] = c;
    }
    ctx.drawImage(c, x, y, size, size);
  };
  UI.itemIcon = function (it) {
    if (!it) return 'misc';
    if (it.icon && ICON_DRAW[it.icon]) return it.icon;
    const map = { weapon: 'sword', armor: 'armor', head: 'hat', feet: 'shoes', acc: 'ring', key: 'key', material: 'gem', use: 'potion' };
    return map[it.type] || 'misc';
  };

  // ---------- list widget ----------
  // items: [{label, right, disabled, icon, color, sub}]
  UI.List = class {
    constructor(items, o = {}) {
      this.items = items;
      this.idx = o.idx || 0;
      this.rows = o.rows || 8;
      this.top = 0;
      this.rowH = o.rowH || 44;
      this.cols = o.cols || 1;
      this.wrap = o.wrap !== false;
      this.clamp();
    }
    setItems(items) { this.items = items; this.clamp(); }
    clamp() {
      if (this.idx >= this.items.length) this.idx = Math.max(0, this.items.length - 1);
      const perPage = this.rows * this.cols;
      const row = Math.floor(this.idx / this.cols);
      if (row < this.top) this.top = row;
      if (row >= this.top + this.rows) this.top = row - this.rows + 1;
      void perPage;
    }
    get cur() { return this.items[this.idx]; }
    // returns 'ok' | 'cancel' | 'move' | null
    update() {
      const I = G.Input;
      const n = this.items.length;
      if (!n) { if (I.pressed('cancel')) return 'cancel'; I.pressed('ok'); return null; }
      let moved = false;
      if (I.repeat('down')) {
        this.idx += this.cols;
        if (this.idx >= n) this.idx = this.wrap ? this.idx % this.cols : n - 1;
        if (this.idx >= n) this.idx = n - 1;
        moved = true;
      }
      if (I.repeat('up')) {
        this.idx -= this.cols;
        if (this.idx < 0) this.idx = this.wrap ? Math.max(0, n - 1 - ((n - 1) % this.cols) + ((this.idx + this.cols) % this.cols)) : 0;
        if (this.idx >= n) this.idx = n - 1;
        moved = true;
      }
      if (this.cols > 1) {
        if (I.repeat('right')) { this.idx = Math.min(n - 1, this.idx + 1); moved = true; }
        if (I.repeat('left')) { this.idx = Math.max(0, this.idx - 1); moved = true; }
      }
      if (I.repeat('pgdn')) { this.idx = Math.min(n - 1, this.idx + this.rows * this.cols); moved = true; }
      if (I.repeat('pgup')) { this.idx = Math.max(0, this.idx - this.rows * this.cols); moved = true; }
      if (moved) { this.clamp(); G.Audio.sfx('cursor'); return 'move'; }
      if (I.pressed('ok')) {
        const it = this.cur;
        if (it && it.disabled) { G.Audio.sfx('buzz'); return null; }
        G.Audio.sfx('ok');
        return 'ok';
      }
      if (I.pressed('cancel')) { G.Audio.sfx('cancel'); return 'cancel'; }
      return null;
    }
    draw(ctx, x, y, w, t, o = {}) {
      const colW = w / this.cols;
      const size = o.size || 22;
      ctx.save();
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = (this.top + r) * this.cols + c;
          if (i >= this.items.length) break;
          const it = this.items[i];
          const rx = x + c * colW, ry = y + r * this.rowH;
          if (i === this.idx && o.focus !== false) UI.cursor(ctx, rx, ry + 2, colW - 8, this.rowH - 4, t, true);
          let tx = rx + 18;
          if (it.icon) { UI.icon(ctx, it.icon, tx, ry + (this.rowH - 30) / 2, 30); tx += 38; }
          if (it.elem) { UI.elemBadge(ctx, it.elem, tx + 10, ry + this.rowH / 2, 11); tx += 28; }
          G.Render.text(ctx, it.label, tx, ry + (this.rowH - size) / 2 - 1, {
            size, color: it.disabled ? UI.DIM : (it.color || UI.TEXT),
          });
          if (it.right != null) {
            G.Render.text(ctx, String(it.right), rx + colW - 22, ry + (this.rowH - size) / 2 - 1, {
              size: size - 2, align: 'right', color: it.disabled ? UI.DIM : (it.rightColor || UI.GOLD_L),
            });
          }
        }
      }
      // scroll indicators
      const totalRows = Math.ceil(this.items.length / this.cols);
      if (this.top > 0) UI.arrow(ctx, x + w / 2, y - 8, -1, t);
      if (this.top + this.rows < totalRows) UI.arrow(ctx, x + w / 2, y + this.rows * this.rowH + 6, 1, t);
      ctx.restore();
    }
  };

  UI.arrow = function (ctx, x, y, dir, t) {
    ctx.save();
    ctx.fillStyle = UI.GOLD_L;
    const o = Math.sin(t * 6) * 3 * dir;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + o - dir * 4);
    ctx.lineTo(x + 8, y + o - dir * 4);
    ctx.lineTo(x, y + o + dir * 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  // ---------- toasts ----------
  const toasts = [];
  UI.toast = function (text, o = {}) {
    toasts.push({ text, t: 0, life: o.life || 2.6, icon: o.icon, color: o.color });
    if (toasts.length > 5) toasts.shift();
  };
  UI.updateToasts = function (dt) {
    for (let i = toasts.length - 1; i >= 0; i--) {
      toasts[i].t += dt;
      if (toasts[i].t > toasts[i].life) toasts.splice(i, 1);
    }
  };
  UI.drawToasts = function (ctx) {
    toasts.forEach((ts, i) => {
      const a = Math.min(1, ts.t * 5, (ts.life - ts.t) * 3);
      const y = 84 + i * 54 - (1 - Math.min(1, ts.t * 6)) * 20;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = G.font(22);
      const w = ctx.measureText(ts.text.replace(/\{.\}|\{\/\}/g, '')).width + (ts.icon ? 54 : 30) + 20;
      const x = G.W / 2 - w / 2;
      UI.panel(ctx, x, y, w, 44, { ornament: false });
      let tx = x + 20;
      if (ts.icon) { UI.icon(ctx, ts.icon, tx, y + 7, 30); tx += 38; }
      const lines = G.Render.wrap(ctx, ts.text, 2000);
      G.Render.drawLines(ctx, lines, tx, y + 10, 26, ts.color || UI.TEXT);
      ctx.restore();
    });
  };

  // key hint bar: [['Z','確認'],['X','返回']]
  UI.hints = function (ctx, list, x = G.W - 24, y = G.H - 34) {
    ctx.save();
    ctx.font = G.font(17);
    let cx = x;
    for (let i = list.length - 1; i >= 0; i--) {
      const [k, label] = list[i];
      const lw = ctx.measureText(label).width;
      cx -= lw;
      G.Render.text(ctx, label, cx, y, { size: 17, color: '#d8ceb0' });
      ctx.font = G.font(15, true);
      const kw = Math.max(22, ctx.measureText(k).width + 12);
      cx -= kw + 6;
      ctx.fillStyle = 'rgba(255,240,210,0.15)';
      ctx.strokeStyle = 'rgba(255,240,210,0.6)';
      ctx.beginPath(); ctx.roundRect(cx, y - 2, kw, 24, 5); ctx.fill(); ctx.stroke();
      G.Render.text(ctx, k, cx + kw / 2, y + 1, { size: 15, bold: true, align: 'center', color: '#fff4dc', shadow: false });
      cx -= 22;
      ctx.font = G.font(17);
    }
    ctx.restore();
  };

  return UI;
})();
