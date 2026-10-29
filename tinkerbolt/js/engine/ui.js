'use strict';
// UI toolkit: clay buttons, toggles, sliders. Each scene keeps a list and routes pointer events through UI.handle.
(function () {
  const G = window.G;
  const R = G.Render;
  const UI = (G.UI = G.UI || {});

  UI.button = function (o) {
    return Object.assign({ kind: 'button', w: 200, h: 64, col: G.CONFIG.palette.accent, text: '#fff', size: 26, press: 0, enabled: true, visible: true }, o);
  };
  UI.toggle = function (o) { return Object.assign({ kind: 'toggle', w: 86, h: 46, press: 0, enabled: true, visible: true }, o); };
  UI.slider = function (o) { return Object.assign({ kind: 'slider', w: 240, h: 46, press: 0, enabled: true, visible: true }, o); };

  UI.hit = (b, x, y) => b.visible && x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h;

  // Returns true if a control consumed the event.
  UI.handle = function (list, ev) {
    if (ev.type === 'down') {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (b.enabled && UI.hit(b, ev.x, ev.y)) {
          UI.active = b;
          b.press = 1;
          if (b.kind === 'slider') UI.slide(b, ev.x);
          return true;
        }
      }
      return false;
    }
    const a = UI.active;
    if (!a || list.indexOf(a) < 0) return false;
    if (ev.type === 'move' && a.kind === 'slider') { UI.slide(a, ev.x); return true; }
    if (ev.type === 'up' || ev.type === 'cancel') {
      UI.active = null;
      const inside = UI.hit(a, ev.x, ev.y);
      if (ev.type === 'up' && inside && a.kind !== 'slider') {
        G.Audio.play('click');
        G.Haptics.buzz('tap');
        if (a.kind === 'toggle') { a.value = !a.value; if (a.onChange) a.onChange(a.value); }
        else if (a.onTap) a.onTap();
      }
      if (a.kind === 'slider' && a.onDone) a.onDone(a.value);
      return true;
    }
    return a.kind === 'slider';
  };
  UI.slide = function (b, x) {
    b.value = G.U.clamp((x - b.x - 18) / (b.w - 36), 0, 1);
    if (b.onChange) b.onChange(b.value);
  };

  UI.update = function (list, dt) { for (const b of list) b.press = Math.max(0, b.press - dt * 6); };

  UI.draw = function (ctx, list) {
    for (const b of list) {
      if (!b.visible) continue;
      ctx.save();
      if (b.kind === 'button') UI.drawButton(ctx, b);
      else if (b.kind === 'toggle') UI.drawToggle(ctx, b);
      else if (b.kind === 'slider') UI.drawSlider(ctx, b);
      ctx.restore();
    }
  };

  UI.drawButton = function (ctx, b) {
    const down = (UI.active === b ? 1 : b.press) * 4;
    ctx.globalAlpha = b.enabled ? 1 : 0.45;
    const col = b.col;
    ctx.fillStyle = R.shade(col, -0.32);
    R.rr(ctx, b.x, b.y + 6, b.w, b.h, b.r || Math.min(26, b.h / 2));
    ctx.fill();
    R.panel(ctx, b.x, b.y + down, b.w, b.h, { fill: col, r: b.r || Math.min(26, b.h / 2), lift: 0, shadow: 'rgba(0,0,0,0)' });
    let tx = b.x + b.w / 2;
    if (b.icon) {
      const isz = b.iconSize || b.h * 0.62;
      const ix = b.label ? b.x + b.h * 0.55 : b.x + b.w / 2;
      G.Clay.icon(ctx, b.icon, ix, b.y + b.h / 2 + down, isz);
      if (b.label) tx = b.x + b.h * 0.55 + (b.w - b.h * 0.55) / 2;
    }
    if (b.label) R.text(ctx, b.label, tx, b.y + b.h / 2 + down + 1, { size: b.size, color: b.text, maxW: b.w - (b.icon ? b.h : 20), weight: 900 });
    if (b.badge) {
      const bx = b.x + b.w - 8, by = b.y + 4;
      ctx.fillStyle = '#ef4f4f';
      ctx.beginPath(); ctx.arc(bx, by, 15, 0, 7); ctx.fill();
      R.text(ctx, String(b.badge), bx, by + 1, { size: 17, color: '#fff', weight: 900 });
    }
    if (b.count != null) {
      const bx = b.x + b.w - 6, by = b.y + b.h - 6;
      ctx.fillStyle = b.count > 0 ? '#4f9d69' : G.CONFIG.palette.inkSoft;
      ctx.beginPath(); ctx.arc(bx, by, 15, 0, 7); ctx.fill();
      R.text(ctx, b.count > 0 ? String(b.count) : '+', bx, by + 1, { size: 17, color: '#fff', weight: 900 });
    }
  };
  UI.drawToggle = function (ctx, b) {
    const on = !!b.value;
    ctx.fillStyle = on ? '#7cc6a4' : '#d8c8b6';
    R.rr(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fill();
    const kx = on ? b.x + b.w - b.h / 2 : b.x + b.h / 2;
    R.panel(ctx, kx - b.h / 2 + 5, b.y + 5, b.h - 10, b.h - 10, { r: (b.h - 10) / 2, lift: 3 });
    R.text(ctx, on ? 'ON' : 'OFF', on ? b.x + 24 : b.x + b.w - 26, b.y + b.h / 2 + 1, { size: 13, color: on ? '#fff' : G.CONFIG.palette.inkSoft, weight: 900 });
  };
  UI.drawSlider = function (ctx, b) {
    ctx.globalAlpha = b.enabled ? 1 : 0.4;
    const y = b.y + b.h / 2;
    ctx.fillStyle = '#d8c8b6';
    R.rr(ctx, b.x + 18, y - 7, b.w - 36, 14, 7); ctx.fill();
    ctx.fillStyle = '#f4a259';
    R.rr(ctx, b.x + 18, y - 7, (b.w - 36) * b.value, 14, 7); ctx.fill();
    const kx = b.x + 18 + (b.w - 36) * b.value;
    R.panel(ctx, kx - 17, y - 17, 34, 34, { r: 17, lift: 3 });
  };

  UI.hardBadge = function (ctx, x, y) {
    R.panel(ctx, x - 34, y - 15, 68, 30, { r: 15, fill: '#e2574c', lift: 3 });
    R.text(ctx, 'HARD', x, y + 1, { size: 16, color: '#fff', weight: 900 });
  };

  // Modal helper drawing: dim + centred panel. Returns the panel rect.
  UI.modal = function (ctx, w, h, opts) {
    opts = opts || {};
    R.fill(ctx, 'rgba(60,40,30,' + (opts.dim == null ? 0.45 : opts.dim) + ')');
    const x = (G.W - w) / 2, y = opts.y != null ? opts.y : (G.H - h) / 2;
    R.panel(ctx, x, y, w, h, { r: 30, lift: 8 });
    if (opts.title) R.text(ctx, opts.title, G.W / 2, y + 48, { size: opts.titleSize || 34, weight: 900, maxW: w - 40 });
    return { x, y, w, h };
  };
})();
