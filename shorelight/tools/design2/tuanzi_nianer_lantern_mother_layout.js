// 彼岸燈 Shorelight — design pass v2, spirit cast: concept-card / sheet layout (Canvas 2D)
// Uses SDF (tuanzi_nianer_lantern_mother_engine.js) to render views and composes industry-style concept cards.
'use strict';
(function (G) {
  const E = G.SDF; const L = {};
  const FT = '"LXGW WenKai TC", "Noto Serif TC", "WenQuanYi Zen Hei", serif';
  const FB = '"Noto Serif TC", "LXGW WenKai TC", "WenQuanYi Zen Hei", serif';
  L.FT = FT; L.FB = FB;
  L.allText = [];
  const T = (s) => { L.allText.push(s); return s; };

  L.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  L.rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

  // word/CJK wrap. returns lines
  L.wrap = (g, text, maxW) => {
    const toks = []; let buf = '';
    for (const ch of text) {
      if (/[⺀-鿿豈-﫿　-〿＀-￯「」『』（）、，。：；！？]/.test(ch)) { if (buf) { toks.push(buf); buf = ''; } toks.push(ch); }
      else if (ch === ' ') { buf += ' '; toks.push(buf); buf = ''; }
      else buf += ch;
    }
    if (buf) toks.push(buf);
    const lines = []; let line = '';
    for (const t of toks) {
      const test = line + t;
      if (g.measureText(test.trimEnd()).width > maxW && line) {
        // keep closing punctuation on the line
        if (/^[，。、：；！？」』）]$/.test(t)) { lines.push(test); line = ''; continue; }
        lines.push(line.trimEnd()); line = t.trimStart();
      } else line = test;
    }
    if (line.trim()) lines.push(line.trimEnd());
    return lines;
  };
  L.para = (g, text, x, y, maxW, lh, font, color, maxLines = 99) => {
    T(text); g.font = font; g.fillStyle = color; const lines = L.wrap(g, text, maxW).slice(0, maxLines);
    lines.forEach((ln, i) => g.fillText(ln, x, y + i * lh)); return y + lines.length * lh;
  };

  // subtle paper grain
  L.grain = (g, x, y, w, h, alpha = 0.05, seed = 1) => {
    g.save(); g.globalAlpha = alpha; let s = seed * 9301 + 49297;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < w * h / 60; i++) { g.fillStyle = rnd() > 0.5 ? '#fff' : '#000'; g.fillRect(x + rnd() * w, y + rnd() * h, 1, 1); }
    g.restore();
  };

  // render a design view to a canvas (with glow composite); returns {cv, R, S}. key → worker scene key
  L.view = async (design, opts, key) => {
    const variant = opts.variant || {};
    const S = design.scene(variant);
    const v = Object.assign({ yaw: 0, pitch: 0, ss: 2 }, opts); delete v.variant;
    const R = await E.renderPar(S, v, key ? Object.assign({ variant }, key) : null);
    const cv = L.canvas(R.w, R.h); const g = cv.getContext('2d');
    if (S.underlay) { g.save(); S.underlay(g, R, v); g.restore(); }
    if (S.params.glow) { // emissive bloom under the figure
      const gc = E.glowCanvas(R, S.params.glowGain || 1.4);
      g.save(); g.filter = `blur(${Math.max(2, R.w * (S.params.glowBlur || 0.025))}px)`; g.globalCompositeOperation = 'lighter'; g.globalAlpha = S.params.glowAlpha || 0.9; g.drawImage(gc, 0, 0); g.restore();
    }
    g.drawImage(E.toCanvas(R), 0, 0);
    if (S.params.glow) { const gc = E.glowCanvas(R, S.params.glowGain || 1.4); g.save(); g.filter = `blur(${Math.max(1, R.w * 0.006)}px)`; g.globalCompositeOperation = 'lighter'; g.globalAlpha = S.params.glowTop != null ? S.params.glowTop : 0.45; g.drawImage(gc, 0, 0); g.restore(); }
    if (S.overlay) { g.save(); S.overlay(g, R, v); g.restore(); }
    return { cv, R, S };
  };

  // ground shadow ellipse
  L.groundShadow = (g, cx, cy, rx, ry, col = 'rgba(0,0,0,0.28)') => { g.save(); const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rx); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.translate(cx, cy); g.scale(1, ry / rx); g.translate(-cx, -cy); g.beginPath(); g.arc(cx, cy, rx, 0, Math.PI * 2); g.fill(); g.restore(); };

  // callout labels with leader lines. items: [{zh,en, p:[x,y] (canvas coords), side:'l'|'r'}]
  L.callouts = (g, items, box, k, theme) => {
    const left = items.filter((c) => c.side === 'l').sort((a, b) => a.p[1] - b.p[1]);
    const right = items.filter((c) => c.side !== 'l').sort((a, b) => a.p[1] - b.p[1]);
    const lh = 30 * k;
    const place = (arr, isL) => {
      let lastY = box.y + 6 * k;
      arr.forEach((c) => {
        g.font = `${12.5 * k}px ${FT}`; const w1 = g.measureText(T(c.zh)).width; g.font = `italic ${9.5 * k}px ${FB}`; const w2 = g.measureText(T(c.en)).width;
        const w = Math.max(w1, w2) + 12 * k;
        let y = Math.max(c.ly != null ? box.y + c.ly * k : c.p[1] - lh / 2, lastY); y = Math.min(y, box.y + box.h - lh - 2 * k); lastY = y + lh + 5 * k;
        const x = isL ? box.x + 4 * k : box.x + box.w - w - 4 * k;
        // leader
        const ax = isL ? x + w : x, ay = y + lh / 2;
        g.save(); g.strokeStyle = theme.lead; g.lineWidth = 1.1 * k; g.beginPath(); g.moveTo(ax, ay); const midx = ax + (c.p[0] - ax) * 0.35; g.lineTo(midx, ay); g.lineTo(c.p[0], c.p[1]); g.stroke();
        g.fillStyle = theme.lead; g.beginPath(); g.arc(c.p[0], c.p[1], 2.6 * k, 0, Math.PI * 2); g.fill(); g.strokeStyle = theme.pill; g.lineWidth = 1 * k; g.stroke();
        L.rrect(g, x, y, w, lh, 5 * k); g.fillStyle = theme.pill; g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1; g.strokeStyle = theme.lead; g.lineWidth = 0.8 * k; g.stroke();
        g.fillStyle = theme.ink; g.font = `${12.5 * k}px ${FT}`; g.fillText(c.zh, x + 6 * k, y + 13.5 * k);
        g.fillStyle = theme.sub; g.font = `italic ${9.5 * k}px ${FB}`; g.fillText(c.en, x + 6 * k, y + 25 * k);
        g.restore();
      });
    };
    place(left, true); place(right, false);
  };

  L.palette = (g, pal, x, y, w, k, theme, rows = 1) => {
    const n = pal.length, per = Math.ceil(n / rows), sw = w / per;
    pal.forEach((p, i) => {
      const r = Math.floor(i / per), c = i % per; const px = x + c * sw, py = y + r * 52 * k;
      L.rrect(g, px + 2 * k, py, sw - 4 * k, 22 * k, 4 * k); g.fillStyle = p.hex; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke();
      if (p.role) { g.font = `${8 * k}px ${FB}`; g.fillStyle = isLight(p.hex) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)'; g.fillText(T(p.role), px + 6 * k, py + 14.5 * k); }
      g.fillStyle = theme.ink; g.font = `${10.5 * k}px ${FT}`; g.fillText(T(p.zh), px + 3 * k, py + 34 * k);
      g.fillStyle = theme.sub; g.font = `${8.5 * k}px ${FB}`; g.fillText(p.hex.toUpperCase(), px + 3 * k, py + 45 * k);
    });
  };
  function isLight(h) { const c = E.hex(h); return c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15 > 0.6; }
  L.isLight = isLight;

  // fit a render into a box: returns view params so that the world box [x0,y0,x1,y1] (in view plane) fits
  L.fit = (box, bw, bh, k, pad = 0.06) => {
    const ww = box[2] - box[0], hh = box[3] - box[1];
    const scale = Math.min(bw * (1 - 2 * pad) / ww, bh * (1 - 2 * pad) / hh);
    return { scale, cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2, w: Math.round(bw), h: Math.round(bh) };
  };

  G.LAY = L;
})(window);
