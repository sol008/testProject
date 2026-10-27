// 彼岸燈 — character design tool: sheet renderer
// Renders one sheet per character: a grid of numbered option cards, each with the bust drawn in the
// option's art direction (classic 仙劍 / donghua / watercolour / cel / ink-wash).
'use strict';
(() => {
  const U = G.U;
  const { ell, TAU } = DZ.kit;
  const CW = 296, CH = 334;           // card art size (css px)
  const BOX = { x: 18, y: 26, w: 260, h: 308 };
  const DPR = Math.max(1, window.devicePixelRatio || 1);

  const STYLE_NAMES = {
    classic: '經典仙劍', donghua: '國漫光影', water: '水彩柔繪', cel: '賽璐璐', ink: '水墨',
  };

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
    const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0);
    return c;
  }
  // tinted copy of a canvas (alpha silhouette)
  function tint(src, col) {
    const t = document.createElement('canvas'); t.width = src.width; t.height = src.height;
    const c = t.getContext('2d'); c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, t.width, t.height);
    return t;
  }
  function filtered(src, filter) {
    const t = document.createElement('canvas'); t.width = src.width; t.height = src.height;
    const c = t.getContext('2d'); c.filter = filter; c.drawImage(src, 0, 0);
    return t;
  }
  function grain(c, w, h, amt, seed, col) {
    const r = U.seeded(seed || 9);
    c.save(); c.fillStyle = col || 'rgba(80,60,40,1)';
    for (let i = 0; i < w * h * 0.02; i++) { c.globalAlpha = r() * amt; c.fillRect(r() * w, r() * h, 1 + r(), 1 + r()); }
    c.restore();
  }
  function blotch(c, x, y, r, col, a, seed) {
    const rr = U.seeded(seed || 3);
    for (let k = 0; k < 7; k++) {
      const px = x + (rr() - 0.5) * r, py = y + (rr() - 0.5) * r * 0.8, pr = r * (0.35 + rr() * 0.5);
      const g = c.createRadialGradient(px, py, pr * 0.2, px, py, pr);
      g.addColorStop(0, U.rgba(col, a)); g.addColorStop(0.75, U.rgba(col, a * 0.6)); g.addColorStop(1, U.rgba(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
    }
  }

  // ------------------------------------------------------------------ backgrounds
  function background(c, opt, accent) {
    const st = opt.style, w = CW, h = CH;
    const bg = opt.bg || ['#1c2340', '#3a2a40'];
    const r = U.seeded(opt.seed || 5);
    if (st === 'water') {
      c.fillStyle = '#f4ecdc'; c.fillRect(0, 0, w, h);
      blotch(c, w * 0.5, h * 0.42, 220, bg[0], 0.35, opt.seed);
      blotch(c, w * 0.3, h * 0.75, 140, bg[1], 0.28, (opt.seed || 1) + 7);
      grain(c, w, h, 0.25, opt.seed);
      return;
    }
    if (st === 'ink') {
      c.fillStyle = '#efe8d8'; c.fillRect(0, 0, w, h);
      // ink-wash mountains + splash
      c.save(); c.filter = 'blur(6px)';
      c.fillStyle = 'rgba(40,40,46,0.22)';
      c.beginPath(); c.moveTo(0, h * 0.62); c.quadraticCurveTo(w * 0.2, h * 0.38, w * 0.38, h * 0.55); c.quadraticCurveTo(w * 0.55, h * 0.3, w * 0.75, h * 0.5); c.quadraticCurveTo(w * 0.9, h * 0.42, w, h * 0.52); c.lineTo(w, h); c.lineTo(0, h); c.fill();
      c.fillStyle = 'rgba(20,20,26,0.18)';
      ell(c, w * 0.55, h * 0.36, 110, 90, 0.4); c.fill();
      c.restore();
      if (bg[0]) { c.save(); c.filter = 'blur(10px)'; c.fillStyle = U.rgba(bg[0], 0.22); ell(c, w * 0.62, h * 0.3, 60, 50); c.fill(); c.restore(); }
      grain(c, w, h, 0.18, opt.seed, 'rgba(60,50,40,1)');
      return;
    }
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (st === 'cel') {
      // bold flat backdrop: halftone circle + diagonal speed lines
      c.save();
      c.fillStyle = U.rgba(accent, 0.28); ell(c, w * 0.56, h * 0.36, 112, 112); c.fill();
      c.fillStyle = U.rgba('#ffffff', 0.13);
      for (let y = 8; y < h; y += 12) for (let x = 8; x < w; x += 12) { const d = Math.hypot(x - w * 0.56, y - h * 0.36); const rr = Math.max(0, 3.2 - d / 60); if (rr > 0.2) { ell(c, x + (y / 12 % 2) * 6, y, rr, rr); c.fill(); } }
      c.strokeStyle = U.rgba('#ffffff', 0.12); c.lineWidth = 2;
      for (let k = 0; k < 9; k++) { const y0 = r() * h; c.beginPath(); c.moveTo(0, y0); c.lineTo(w, y0 - 60); c.stroke(); }
      c.restore();
      return;
    }
    if (st === 'donghua') {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) {
        const a = -1.2 + k * 0.28;
        c.fillStyle = U.rgba(accent, 0.06 + r() * 0.05);
        c.beginPath(); c.moveTo(w * 0.85, -10); c.lineTo(w * 0.85 + Math.cos(a + Math.PI) * 600, -10 + Math.sin(a + Math.PI) * -600); c.lineTo(w * 0.85 + Math.cos(a + Math.PI + 0.08) * 600, -10 + Math.sin(a + Math.PI + 0.08) * -600); c.fill();
      }
      const gg = c.createRadialGradient(w * 0.55, h * 0.35, 10, w * 0.55, h * 0.35, 190);
      gg.addColorStop(0, U.rgba(accent, 0.35)); gg.addColorStop(1, U.rgba(accent, 0));
      c.fillStyle = gg; c.fillRect(0, 0, w, h);
      c.restore();
      for (let k = 0; k < 18; k++) { const x = r() * w, y = r() * h, s = 1 + r() * 2.5; const g2 = c.createRadialGradient(x, y, 0, x, y, s * 3); g2.addColorStop(0, U.rgba(accent, 0.6)); g2.addColorStop(1, U.rgba(accent, 0)); c.fillStyle = g2; c.fillRect(x - s * 3, y - s * 3, s * 6, s * 6); }
      return;
    }
    // classic: night sky, bokeh lanterns & clouds
    c.save();
    for (let k = 0; k < 14; k++) {
      const x = r() * w, y = r() * h * 0.8, s = 4 + r() * 12;
      const g2 = c.createRadialGradient(x, y, 0, x, y, s);
      g2.addColorStop(0, U.rgba(accent, 0.35 * r() + 0.1)); g2.addColorStop(1, U.rgba(accent, 0));
      c.fillStyle = g2; c.fillRect(x - s, y - s, s * 2, s * 2);
    }
    c.globalAlpha = 0.16;
    DL.AC.cloud(c, w * 0.18, h * 0.82, 1.6, '#ffffff');
    DL.AC.cloud(c, w * 0.86, h * 0.7, 1.2, '#ffffff');
    c.restore();
  }

  // ------------------------------------------------------------------ figure compositing
  function figure(c, opt, accent) {
    const fc = mk(CW, CH);
    const fx = fc.getContext('2d');
    DZ.paint(fx, opt.spec, opt.expr || 'normal', BOX.x + (opt.dx || 0), BOX.y + (opt.dy || 0), BOX.w * (opt.zoom || 1), BOX.h * (opt.zoom || 1), Math.max(2, DPR * 1.5));
    const st = opt.style;
    const put = (img, op, a) => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = op || 'source-over'; c.globalAlpha = a == null ? 1 : a; c.drawImage(img, 0, 0); c.restore(); };
    if (st === 'cel') {
      const ol = tint(fc, '#120c18');
      const d = 2.6 * DPR;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; c.drawImage(ol, Math.cos(a) * d, Math.sin(a) * d); }
      c.restore();
      put(filtered(fc, 'contrast(1.12) saturate(1.18)'));
      // hard cel highlight band
      return;
    }
    if (st === 'donghua') {
      const gl = tint(fc, accent);
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${8 * DPR}px)`; c.globalAlpha = 0.85; c.drawImage(gl, 0, 0); c.restore();
      put(filtered(fc, 'contrast(1.08) saturate(1.12)'));
      put(filtered(fc, `blur(${5 * DPR}px) brightness(1.3)`), 'screen', 0.28);
      // rim light from the upper-left
      const rimc = document.createElement('canvas'); rimc.width = fc.width; rimc.height = fc.height;
      const rx = rimc.getContext('2d'); rx.drawImage(fc, 0, 0); rx.globalCompositeOperation = 'destination-out'; rx.drawImage(fc, 3 * DPR, 3 * DPR);
      rx.globalCompositeOperation = 'source-in'; rx.fillStyle = opt.rim || '#fff6e0'; rx.fillRect(0, 0, rimc.width, rimc.height);
      put(rimc, 'source-over', 0.7);
      return;
    }
    if (st === 'water') {
      const soft = filtered(fc, 'saturate(0.82) brightness(1.06) contrast(0.94)');
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${4 * DPR}px)`; c.globalAlpha = 0.5; c.drawImage(tint(fc, accent), 2 * DPR, 3 * DPR); c.restore();
      put(soft);
      put(filtered(fc, `blur(${2 * DPR}px)`), 'soft-light', 0.5);
      // paper grain on top of the figure only
      const gr = mk(CW, CH); const gx = gr.getContext('2d'); grain(gx, CW, CH, 0.12, 21, 'rgba(120,100,80,1)');
      gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = 'destination-in'; gx.drawImage(fc, 0, 0);
      put(gr, 'multiply', 0.35);
      return;
    }
    if (st === 'ink') {
      const gray = filtered(fc, 'grayscale(1) contrast(1.25) brightness(1.04)');
      put(gray, 'source-over', 0.92);
      put(fc, 'source-over', 0.28);
      if (opt.inkAccent) put(filtered(fc, 'saturate(1.6)'), 'color', 0.22);
      return;
    }
    // classic: soft drop glow
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.filter = `blur(${10 * DPR}px)`; c.globalAlpha = 0.45; c.drawImage(tint(fc, accent), 0, 0); c.restore();
    put(fc);
  }

  function seal(c, txt, x, y) {
    c.save(); c.translate(x, y); c.rotate(-0.04);
    c.fillStyle = 'rgba(190,30,40,0.88)'; c.fillRect(-15, -15, 30, 30);
    c.fillStyle = '#f6eadc'; c.font = 'bold 13px "LXGW WenKai TC","Kaiti TC","STKaiti","Noto Serif TC","WenQuanYi Zen Hei",serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const t = txt.slice(0, 4);
    if (t.length <= 2) { c.font = 'bold 16px "LXGW WenKai TC","Kaiti TC","STKaiti","Noto Serif TC","WenQuanYi Zen Hei",serif'; c.fillText(t, 0, 1); }
    else { c.fillText(t.slice(0, 2), 0, -6); c.fillText(t.slice(2, 4), 0, 8); }
    c.restore();
  }

  function renderCard(opt, accent) {
    const cv = mk(CW, CH);
    cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
    const c = cv.getContext('2d');
    background(c, opt, accent);
    figure(c, opt, accent);
    // bottom vignette for text-free lower edge
    if (opt.style !== 'water' && opt.style !== 'ink') {
      const g = c.createLinearGradient(0, CH - 60, 0, CH); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = g; c.fillRect(0, CH - 60, CW, 60);
    }
    if (opt.style === 'ink') seal(c, opt.name.replace(/[「」]/g, ''), CW - 26, 30);
    return cv;
  }

  // ------------------------------------------------------------------ page
  function build() {
    const q = new URLSearchParams(location.search);
    const only = q.get('char');
    const root = document.getElementById('root');
    const chars = window.DESIGN_OPTIONS;
    for (const ch of chars) {
      if (only && ch.id !== only) continue;
      const sec = document.createElement('section'); sec.className = 'sheet'; sec.id = ch.id;
      sec.innerHTML = `<header><div class="ttl"><span class="zh">${ch.name}</span><span class="en">${ch.en}</span></div>
        <p class="brief">${ch.brief}</p></header>`;
      const grid = document.createElement('div'); grid.className = 'grid';
      ch.options.forEach((opt, i) => {
        opt.seed = opt.seed || (i + 1) * 17 + ch.id.length;
        if (opt.spec && !opt.spec.seed) opt.spec.seed = opt.seed;
        if (opt.spec && opt.spec.ring === undefined) opt.spec.ring = { a: opt.style === 'water' ? 0.3 : opt.style === 'cel' ? 0.75 : 0.5 };
        const card = document.createElement('div'); card.className = 'card s-' + opt.style;
        const art = renderCard(opt, opt.accent || ch.accent);
        const num = String(i + 1).padStart(2, '0');
        card.innerHTML = `<div class="art"></div><div class="meta"><div class="row"><span class="num">${num}</span><span class="name">${opt.name}</span><span class="tag">${STYLE_NAMES[opt.style] || ''}</span></div>
          <div class="enname">${opt.en}</div><div class="desc">${opt.desc}</div></div>`;
        card.querySelector('.art').appendChild(art);
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      if (window.DESIGN_STRIP) sec.appendChild(window.DESIGN_STRIP(ch));
      root.appendChild(sec);
    }
    document.body.dataset.ready = '1';
  }
  window.addEventListener('load', () => {
    try { build(); } catch (e) { console.error(e); document.body.dataset.ready = 'err'; throw e; }
  });
})();
