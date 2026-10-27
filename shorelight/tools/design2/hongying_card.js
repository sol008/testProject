/* 洛紅纓 — concept-sheet card + sheet layout (uses LQ from hongying_qingfeng_common.js) */
(function () {
  'use strict';
  const { txt, wrap, FONT_CN, FONT_EN } = LQ;
  const CW = 468, CH = 868;
  LQ.CARD = { CW, CH };

  LQ.renderCard = function (canvas, D, idx, scale = 1) {
    canvas.width = Math.round(CW * scale); canvas.height = Math.round(CH * scale);
    canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px';
    const c = canvas.getContext('2d'); c.setTransform(scale, 0, 0, scale, 0, 0);
    LQ.begin(c, {});
    LQ.paper(c, 0, 0, CW, CH, '#f2ece1', idx + 3);
    // ---------------- header
    c.fillStyle = '#211a1e'; c.fillRect(0, 0, CW, 60);
    c.fillStyle = D.accent; c.fillRect(0, 60, CW, 3);
    txt(c, String(idx + 1).padStart(2, '0'), 14, 42, `800 32px ${FONT_EN}`, D.accent);
    txt(c, D.cn, 66, 31, `24px ${FONT_CN}`, '#f6efe4');
    c.font = `24px ${FONT_CN}`; const cnw = c.measureText(D.cn).width;
    txt(c, D.en, 66, 50, `italic 600 11.5px ${FONT_EN}`, '#c9b9b0');
    // historical ↔ fantasy scale
    const fx = CW - 112; txt(c, '史實', fx - 4, 24, `9.5px ${FONT_CN}`, '#a89890', 'right'); txt(c, '奇幻', fx + 92, 24, `9.5px ${FONT_CN}`, '#a89890');
    for (let i = 0; i < 5; i++) { c.fillStyle = i < D.fantasy ? D.accent : '#4a3c40'; c.beginPath(); c.moveTo(fx + 8 + i * 16, 15); c.lineTo(fx + 14 + i * 16, 20); c.lineTo(fx + 8 + i * 16, 25); c.lineTo(fx + 2 + i * 16, 20); c.fill(); }
    txt(c, D.tag || '', CW - 14, 46, `9px ${FONT_EN}`, '#a89890', 'right');
    // ---------------- figure panel
    const px = 10, py = 70, pw = 284, ph = 590;
    c.save(); c.beginPath(); c.roundRect(px, py, pw, ph, 6); c.clip();
    const g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, D.bg[0]); g.addColorStop(1, D.bg[1]); c.fillStyle = g; c.fillRect(px, py, pw, ph);
    // big faint motif disc behind the figure
    const gr = c.createRadialGradient(px + pw / 2, py + 250, 10, px + pw / 2, py + 250, 230); gr.addColorStop(0, LQ.col.rgba(D.bg[2] || '#ffffff', 0.55)); gr.addColorStop(1, LQ.col.rgba(D.bg[2] || '#ffffff', 0)); c.fillStyle = gr; c.fillRect(px, py, pw, ph);
    if (D.backdrop) D.backdrop(c, px, py, pw, ph);
    const gy = py + ph - 22; // ground line
    c.fillStyle = 'rgba(30,20,24,0.18)'; c.beginPath(); c.ellipse(px + pw / 2 + (D.fx || 0), gy, 92, 11, 0, 0, 7); c.fill();
    const ox = px + pw / 2 + (D.fx || 0), oy = gy - 420;
    const F = LQ.drawFigure(D, ox, oy, 1);
    c.restore();
    c.strokeStyle = 'rgba(40,26,30,0.25)'; c.lineWidth = 1; c.beginPath(); c.roundRect(px, py, pw, ph, 6); c.stroke();
    txt(c, `正面 FRONT · ${D.body.heads} 頭身 heads`, px + 8, py + ph - 7, `8.5px ${FONT_CN}`, 'rgba(40,26,30,0.6)');
    LQ.callouts(c, D.callouts, F, ox, oy, 1, { x: px, y: py + 6, w: pw, h: ph });
    // ---------------- bust panel
    const bx = 302, by = 70, bw = 156, bh = 200;
    c.save(); c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.clip();
    const g2 = c.createLinearGradient(0, by, 0, by + bh); g2.addColorStop(0, D.bustBg ? D.bustBg[0] : D.bg[0]); g2.addColorStop(1, D.bustBg ? D.bustBg[1] : D.bg[2] || D.bg[1]); c.fillStyle = g2; c.fillRect(bx, by, bw, bh);
    const hz = D.bustZoom || 2.05; const f0 = LQ.fig(D.body); const bcx = bx + bw / 2 + (D.bustDx || 0) * hz, bcy = by + 22 - (D.bustDy || 0) * hz;
    LQ.drawFigure(D, bcx, bcy, hz, { bust: true });
    c.restore();
    c.strokeStyle = 'rgba(40,26,30,0.25)'; c.beginPath(); c.roundRect(bx, by, bw, bh, 6); c.stroke();
    c.fillStyle = 'rgba(33,26,30,0.72)'; c.beginPath(); c.roundRect(bx + 4, by + bh - 19, bw - 8, 15, 3); c.fill();
    txt(c, D.bustNote || '面部 FACE', bx + bw / 2, by + bh - 8, `9px ${FONT_CN}`, '#f3ebe0', 'center');
    // ---------------- palette
    LQ.palette(c, D.palette, bx + 2, by + bh + 10, bw);
    // ---------------- silhouettes
    const sy = by + bh + 10 + 15 + D.palette.length * 21 + 8; const sh = py + ph - sy;
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.roundRect(bx, sy, bw, sh, 6); c.fill(); c.strokeStyle = 'rgba(40,26,30,0.2)'; c.stroke();
    txt(c, '剪影 SILHOUETTE', bx + 6, sy + 12, `bold 8.5px ${FONT_CN}`, '#6a585c');
    const ss = Math.min(0.3, (sh - 30) / 560); const sgy = sy + sh - 16;
    LQ.silhouette(D, bx + bw * 0.27, sgy - 420 * ss, ss, {});
    LQ.silhouette(D, bx + bw * 0.73, sgy - 420 * ss, ss, { back: true, mirror: true });
    txt(c, '正 front', bx + bw * 0.27, sy + sh - 4, `8px ${FONT_CN}`, '#6a585c', 'center'); txt(c, '背 back', bx + bw * 0.73, sy + sh - 4, `8px ${FONT_CN}`, '#6a585c', 'center');
    // ---------------- text
    let ty = py + ph + 20;
    c.font = `bold 13px ${FONT_CN}`; wrap(c, D.idea, CW - 28).forEach((s) => { txt(c, s, 14, ty, `bold 13px ${FONT_CN}`, '#2a1a1f'); ty += 18; });
    c.font = `italic 11px ${FONT_EN}`; wrap(c, D.ideaEn, CW - 28).forEach((s) => { txt(c, s, 14, ty, `italic 11px ${FONT_EN}`, '#4a3a3e'); ty += 14; });
    ty += 5; c.fillStyle = D.accent; c.fillRect(14, ty - 9, 3, 10);
    txt(c, '文化依據 CULTURAL BASIS', 21, ty, `bold 9px ${FONT_CN}`, '#6a585c'); ty += 14;
    c.font = `10.5px ${FONT_EN}`; wrap(c, D.culture, CW - 28).forEach((s) => { txt(c, s, 14, ty, `10.5px ${FONT_EN}`, '#3a2c30'); ty += 13.5; });
    return F;
  };
})();
