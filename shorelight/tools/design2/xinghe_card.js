// 彼岸燈 — design pass v2 — 沈星河 concept-sheet card renderer
// Card = title block · full-body front view with callouts · palette strip · bust close-up · silhouette check
// (colour @ sprite scale, solid front, solid back) · concept / cultural basis / 3D-model notes.
'use strict';
(function (global) {
  const XL = global.XL;
  const CW = 480, STAGE_H = 470, GROUND = 452;
  const FONT = '"WenQuanYi Zen Hei", "Noto Sans CJK TC", sans-serif';

  function mkCanvas(w, h, dpr) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    return [c, ctx];
  }
  function setRender(dpr, zoom) { XL.dpr = dpr; XL.zoom = zoom; XL.lineZoom = zoom > 1 ? Math.pow(zoom, 0.55) : zoom; }

  function stageBg(ctx, D, w, h) {
    const bg = D.bg || {};
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg.top || '#f3eee3'); g.addColorStop(1, bg.bottom || '#e6dccb');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // aura disc in the option's accent
    const cx = w / 2 + (D.auraX || 0), cy = h * 0.42;
    const r = ctx.createRadialGradient(cx, cy, 10, cx, cy, 230);
    r.addColorStop(0, XL.rgba(D.accent, 0.22)); r.addColorStop(0.6, XL.rgba(D.accent, 0.08)); r.addColorStop(1, XL.rgba(D.accent, 0));
    ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.strokeStyle = XL.rgba(D.accent, 0.25); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 178, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(cx, cy, 196, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    if (bg.motif) bg.motif(ctx, w, h);
    // height ruler (head units)
    ctx.save(); ctx.strokeStyle = 'rgba(60,50,40,0.28)'; ctx.fillStyle = 'rgba(60,50,40,0.45)'; ctx.font = `8px ${FONT}`; ctx.lineWidth = 1;
    const hu = 420 / D.heads; ctx.beginPath(); ctx.moveTo(12.5, GROUND); ctx.lineTo(12.5, GROUND - 420); ctx.stroke();
    for (let i = 0; i <= Math.floor(D.heads); i++) { const y = GROUND - 420 + i * hu; ctx.beginPath(); ctx.moveTo(9, y + 0.5); ctx.lineTo(16, y + 0.5); ctx.stroke(); if (i) ctx.fillText(String(i), 18, y + 3); }
    ctx.restore();
    // ground
    ctx.save(); ctx.fillStyle = 'rgba(40,30,25,0.18)'; ctx.beginPath(); ctx.ellipse(w / 2 + (D.figX || 0), GROUND + 2, 70, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,40,0.25)'; ctx.beginPath(); ctx.moveTo(30, GROUND + 0.5); ctx.lineTo(w - 30, GROUND + 0.5); ctx.stroke(); ctx.restore();
  }

  // Figure render with post-process passes on an offscreen layer:
  // ambient gradient (top-lit, bottom falls off), silhouette rim light from the right, bold outer contour.
  function drawFigure(ctx, D, ox, oy, scale, dpr, opts = {}) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const lay = document.createElement('canvas'); lay.width = W; lay.height = H;
    const l = lay.getContext('2d'); l.scale(dpr, dpr);
    const fx = document.createElement('canvas'); fx.width = W; fx.height = H;
    XL.fx = opts.flat ? null : fx.getContext('2d');
    setRender(dpr, scale);
    l.save(); l.translate(ox, oy); l.scale(scale, scale);
    D.draw(l, opts);
    l.restore();
    setRender(dpr, 1);
    XL.fx = null;
    if (opts.flat) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lay, 0, 0); ctx.restore(); return; }
    const k = dpr * Math.max(0.6, Math.pow(scale, 0.5));
    l.setTransform(1, 0, 0, 1, 0, 0);
    // ambient: darken toward the feet
    l.globalCompositeOperation = 'source-atop';
    const g = l.createLinearGradient(0, (oy - 420 * scale) * dpr, 0, oy * dpr);
    g.addColorStop(0, 'rgba(255,240,220,0)'); g.addColorStop(0.55, 'rgba(60,40,80,0)'); g.addColorStop(1, 'rgba(50,30,70,0.2)');
    l.fillStyle = g; l.fillRect(0, 0, W, H);
    // rim light: right-hand edge band of the silhouette
    const rim = document.createElement('canvas'); rim.width = W; rim.height = H; const r = rim.getContext('2d');
    r.drawImage(lay, 0, 0); r.globalCompositeOperation = 'destination-out'; r.drawImage(lay, -2.2 * k, 0.6 * k);
    r.globalCompositeOperation = 'source-in'; r.fillStyle = D.rimCol || 'rgba(255,190,120,0.9)'; r.fillRect(0, 0, W, H);
    l.globalCompositeOperation = 'source-atop'; l.globalAlpha = 0.85; l.drawImage(rim, 0, 0); l.globalAlpha = 1;
    // outer contour: dilate the silhouette in ink behind the figure
    const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
    const d = 1.15 * k;
    for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; o.drawImage(lay, Math.cos(an) * d, Math.sin(an) * d); }
    o.globalCompositeOperation = 'source-in'; o.fillStyle = D.contour || '#1f1820'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'source-over'; o.drawImage(lay, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(out, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(fx, 0, 0); ctx.restore();
  }

  function callouts(ctx, D) {
    const fx = CW / 2 + (D.figX || 0);
    const items = D.callouts.map((c) => Object.assign({}, c, { ax: fx + c.x, ay: GROUND + c.y }));
    ['L', 'R'].forEach((side) => {
      const list = items.filter((c) => c.side === side).sort((a, b) => a.ay - b.ay);
      let lastY = -1e3;
      list.forEach((c) => {
        let ly = c.ly !== undefined ? c.ly : c.ay;
        ly = Math.max(ly, lastY + 34); lastY = ly;
        const lx = side === 'L' ? 8 : CW - 8;
        ctx.save(); ctx.font = `bold 11px ${FONT}`;
        const w1 = ctx.measureText(c.zh).width; ctx.font = `9px ${FONT}`; const w2 = ctx.measureText(c.en).width;
        const bw = Math.max(w1, w2) + 10;
        const bx = side === 'L' ? lx : lx - bw;
        const ex = side === 'L' ? bx + bw : bx;
        ctx.strokeStyle = 'rgba(40,30,30,0.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ex, ly); ctx.lineTo(ex + (side === 'L' ? 8 : -8), ly); ctx.lineTo(c.ax, c.ay); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c.ax, c.ay, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,252,246,0.9)'; ctx.fillRect(bx, ly - 14, bw, 27); ctx.strokeRect(bx + 0.5, ly - 13.5, bw - 1, 26);
        ctx.fillStyle = D.accentInk || '#3a2a26'; ctx.fillRect(side === 'L' ? bx : bx + bw - 2, ly - 14, 2, 27);
        ctx.fillStyle = '#231c1a'; ctx.font = `bold 11px ${FONT}`; ctx.fillText(c.zh, bx + 5, ly - 1);
        ctx.fillStyle = '#5a4c44'; ctx.font = `9px ${FONT}`; ctx.fillText(c.en, bx + 5, ly + 10);
        ctx.restore();
      });
    });
  }

  function silhouettePanel(D, dpr) {
    const W = 264, H = 200; const [c, ctx] = mkCanvas(W, H, dpr);
    ctx.fillStyle = '#ece5d7'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5a4c44'; ctx.font = `bold 10px ${FONT}`; ctx.fillText('剪影檢查 SILHOUETTE @ 90 px', 8, 15);
    const s = 90 / 420, base = 150;
    const cols = [[44, '彩色 colour'], [132, '正面 front'], [220, '背面 back']];
    // colour mini
    drawFigure(ctx, D, cols[0][0] + (D.figX || 0) * s, base, s, dpr);
    // solid front / back
    [['front', cols[1][0]], ['back', cols[2][0]]].forEach(([mode, x]) => {
      const [oc, octx] = mkCanvas(W, H, dpr);
      if (mode === 'front') drawFigure(octx, D, x + (D.figX || 0) * s, base, s, dpr, { flat: true });
      else {
        setRender(dpr, s); octx.save(); octx.translate(x - (D.figX || 0) * s, base); octx.scale(-s, s);
        D.draw(octx, { back: true }); octx.restore();
        octx.save(); octx.translate(x - (D.figX || 0) * s, base); octx.scale(s, s); if (D.back) D.back(octx); octx.restore(); setRender(dpr, 1);
      }
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-in'; octx.fillStyle = '#17141a'; octx.fillRect(0, 0, oc.width, oc.height);
      ctx.drawImage(oc, 0, 0, W, H);
    });
    ctx.fillStyle = 'rgba(60,50,40,0.3)'; ctx.fillRect(10, base + 1, W - 20, 1);
    ctx.font = `9px ${FONT}`; ctx.fillStyle = '#6a5c52'; ctx.textAlign = 'center';
    cols.forEach(([x, t]) => ctx.fillText(t, x, base + 16));
    ctx.textAlign = 'left'; ctx.fillStyle = '#7a6a5e'; ctx.font = `9px ${FONT}`;
    ctx.fillText(D.silNote || '', 8, H - 10);
    return c;
  }

  function bust(D, dpr) {
    const S = 200; const [c, ctx] = mkCanvas(S, S, dpr);
    const g = ctx.createLinearGradient(0, 0, 0, S); g.addColorStop(0, XL.mix(D.accent, '#f6f0e4', 0.82)); g.addColorStop(1, XL.mix(D.accent, '#e8dccb', 0.7));
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    const hu = 420 / D.heads, z = (D.bustZoom || 1.38) * 60 / hu;
    const hx = D.headX || 0, hy = -420 + hu * 0.62 + (D.bustDy || 0);
    drawFigure(ctx, D, S / 2 - hx * z, 96 - hy * z, z, dpr, { bust: true });
    ctx.fillStyle = 'rgba(30,22,20,0.65)'; ctx.fillRect(0, S - 18, S, 18);
    ctx.fillStyle = '#f6efe2'; ctx.font = `10px ${FONT}`; ctx.fillText('臉部特寫 ' + (D.faceNote || ''), 6, S - 5);
    return c;
  }

  global.renderCard = function (D, dpr = 1) {
    const card = document.createElement('div'); card.className = 'card'; card.id = 'opt' + D.id;
    card.innerHTML = `<header><span class="num">${D.id}</span><div class="names"><h2>${D.zh}</h2><h3>${D.en}</h3></div>
      <div class="tag" style="background:${D.accentInk}">${D.tag}<small>${D.tagEn}</small></div></header>`;
    const [st, sctx] = mkCanvas(CW, STAGE_H, dpr); st.className = 'stage';
    stageBg(sctx, D, CW, STAGE_H);
    drawFigure(sctx, D, CW / 2 + (D.figX || 0), GROUND, 1, dpr);
    if (D.fx) { setRender(dpr, 1); sctx.save(); sctx.translate(CW / 2 + (D.figX || 0), GROUND); D.fx(sctx); sctx.restore(); }
    callouts(sctx, D);
    sctx.fillStyle = 'rgba(60,50,40,0.55)'; sctx.font = `9px ${FONT}`; sctx.textAlign = 'right';
    sctx.fillText(`${D.heads} 頭身 · ${D.hairNote}`, CW - 10, STAGE_H - 4); sctx.textAlign = 'left';
    card.appendChild(st);
    const pal = document.createElement('div'); pal.className = 'pal';
    pal.innerHTML = D.palette.map(([hex, zh, en]) => `<div class="sw"><i style="background:${hex}"></i><b>${zh}</b><span>${en} ${hex}</span></div>`).join('');
    card.appendChild(pal);
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(bust(D, dpr)); row.appendChild(silhouettePanel(D, dpr));
    card.appendChild(row);
    const tx = document.createElement('div'); tx.className = 'txt';
    tx.innerHTML = `<p class="idea"><b>設計概念</b>${D.idea}</p><p><b>文化依據</b>${D.culture}</p><p class="m3d"><b>3D 註記</b>${D.model3d}</p>`;
    card.appendChild(tx);
    return card;
  };
  global.lineupSil = function (D, dpr) {
    const W = 220, H = 112; const [c, ctx] = mkCanvas(W, H, dpr);
    const s = 90 / 420;
    const [oc, octx] = mkCanvas(W, H, dpr);
    drawFigure(octx, D, W / 2 + (D.figX || 0) * s, 100, s, dpr, { flat: true });
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-in'; octx.fillStyle = '#17141a'; octx.fillRect(0, 0, oc.width, oc.height);
    ctx.drawImage(oc, 0, 0, W, H);
    ctx.fillStyle = 'rgba(60,50,40,0.35)'; ctx.fillRect(8, 100, W - 16, 1);
    ctx.fillStyle = '#5a4c44'; ctx.font = `bold 11px ${FONT}`; ctx.fillText(D.id + ' ' + D.zh, 6, 13);
    return c;
  };
  global.renderStageOnly =function (D, dpr, zoom, region) {
    // debug: big render of a region of the full-body figure
    const [w, h] = [region[2] * zoom, region[3] * zoom];
    const [c, ctx] = mkCanvas(w, h, dpr);
    ctx.fillStyle = '#efe8da'; ctx.fillRect(0, 0, w, h);
    drawFigure(ctx, D, -region[0] * zoom, -region[1] * zoom, zoom, dpr);
    return c;
  };
})(window);
