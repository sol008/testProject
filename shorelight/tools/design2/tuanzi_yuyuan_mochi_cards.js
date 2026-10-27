// 彼岸燈 Shorelight — design pass v2 — pets (糰子 / 芋圓 / 麻糬): concept card + sheet layout and page bootstrap
// Card: hero 3-4 view with callouts, face / side / back views, palette, idea, cultural basis, 3D notes.
'use strict';
(function (G) {
  const E = G.SDF, L = G.LAY;
  // ================================================================== card renderer
  const THEME = { bg1: '#1E2230', bg2: '#141722', ink: '#F1E7D2', sub: '#B9AE98', lead: '#E8C47A', pill: '#1B1F2B', panel: 'rgba(255,255,255,0.04)' };

  function projBox(S, yaw, pitch) {
    const b = S.bounds; const v = { yaw, pitch, cx: 0, cy: 0, cz: 0, scale: 1, w: 0, h: 0 }; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) { const p = E.project(v, x, y, z); u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, -p[1]); v1 = Math.max(v1, -p[1]); }
    return [u0, v0, u1, v1];
  }
  function fitView(S, yaw, pitch, w, h, pad, fixedScale) {
    const pb = projBox(S, yaw, pitch); const cam = E.camera({ yaw, pitch });
    const scale = fixedScale || Math.min(w * (1 - 2 * pad) / (pb[2] - pb[0]), h * (1 - 2 * pad) / (pb[3] - pb[1]));
    const cu = (pb[0] + pb[2]) / 2, cv = (pb[1] + pb[3]) / 2;
    const c = [cam.r[0] * cu + cam.u[0] * cv, cam.r[1] * cu + cam.u[1] * cv, cam.r[2] * cu + cam.u[2] * cv];
    return { yaw, pitch, cx: c[0], cy: c[1], cz: c[2], scale, w: Math.round(w), h: Math.round(h) };
  }

  const CW = 460, CH = 880;
  async function renderCard(d, k, q = 2) {
    const cv = L.canvas(CW * k, CH * k); const g = cv.getContext('2d');
    const th = Object.assign({}, THEME, d.theme || {});
    L.rrect(g, 0, 0, CW * k, CH * k, 14 * k); const bg = g.createLinearGradient(0, 0, 0, CH * k); bg.addColorStop(0, th.bg1); bg.addColorStop(1, th.bg2); g.fillStyle = bg; g.fill();
    g.save(); L.rrect(g, 0, 0, CW * k, CH * k, 14 * k); g.clip(); L.grain(g, 0, 0, CW * k, CH * k, 0.035, d.no);
    // ---- main stage
    const st = { x: 10 * k, y: 68 * k, w: 440 * k, h: 404 * k };
    const sg = g.createRadialGradient(st.x + st.w / 2, st.y + st.h * 0.42, 10 * k, st.x + st.w / 2, st.y + st.h * 0.5, st.w * 0.7);
    sg.addColorStop(0, (d.stage || [])[0] || '#454B60'); sg.addColorStop(1, (d.stage || [])[1] || '#1C2030');
    L.rrect(g, st.x, st.y, st.w, st.h, 10 * k); g.fillStyle = sg; g.fill();
    if (d.stageFx) { g.save(); L.rrect(g, st.x, st.y, st.w, st.h, 10 * k); g.clip(); d.stageFx(g, st, k); g.restore(); }
    const S0 = d.scene({}); d._S = S0;
    const mL = (d.heroMargin || 112) * k; // leave room for callout labels at both sides
    const hv = fitView(S0, d.hero.yaw, d.hero.pitch, st.w - 2 * mL, st.h - 10 * k, 0.03); hv.w = Math.round(st.w); hv.ss = q;
    const gp = E.project(Object.assign({}, hv), (S0.bounds[0] + S0.bounds[3]) / 2, d.groundY || 0, (S0.bounds[2] + S0.bounds[5]) / 2);
    g.save(); L.rrect(g, st.x, st.y, st.w, st.h, 10 * k); g.clip();
    if (!d.noGround) L.groundShadow(g, st.x + gp[0], st.y + gp[1] + 3 * k, st.w * 0.26, st.w * 0.05, 'rgba(0,0,0,0.42)');
    const hero = await L.view(d, hv, { no: d.no }); g.drawImage(hero.cv, st.x, st.y); d._hero = hero;
    g.restore();
    // ---- header
    g.fillStyle = th.lead; g.beginPath(); g.arc(31 * k, 35 * k, 19 * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = th.bg2; g.font = `bold ${17 * k}px ${L.FB}`; g.textAlign = 'center'; g.fillText(String(d.no).padStart(2, '0'), 31 * k, 41 * k); g.textAlign = 'left';
    g.fillStyle = th.ink; g.font = `${26 * k}px ${L.FT}`; g.fillText(d.zh, 60 * k, 37 * k); L.allText.push(d.zh, d.en, d.tag);
    g.fillStyle = th.sub; g.font = `italic ${12.5 * k}px ${L.FB}`; g.fillText(d.en, 60 * k, 57 * k);
    g.font = `${10 * k}px ${L.FB}`; const tw = g.measureText(d.tag).width + 14 * k; L.rrect(g, CW * k - tw - 12 * k, 22 * k, tw, 20 * k, 10 * k); g.strokeStyle = th.lead; g.lineWidth = 1 * k; g.stroke(); g.fillStyle = th.lead; g.fillText(d.tag, CW * k - tw - 5 * k, 36 * k);
    // ---- callouts
    const items = d.callouts.map((c) => { const a = S0.anchors[c.a]; const p = E.project(hero.R.view, a[0], a[1], a[2]); return { zh: c.zh, en: c.en, side: c.side, ly: c.ly, p: [st.x + p[0], st.y + p[1]] }; });
    L.callouts(g, items, st, k, th);
    // ---- face / side / back row
    const rowY = 480 * k, bw = 142 * k, bh = 150 * k;
    const labs = ['面部 Face', '側面 Side', '背面 Back'];
    for (let i = 0; i < 3; i++) {
      const bx = (10 + i * 149) * k, by = rowY;
      L.rrect(g, bx, by, bw, bh, 8 * k); g.fillStyle = th.panel; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.stroke();
      let v;
      if (i === 0) { const a = S0.anchors.head; const fr = d.bust || {}; const sc = (bh * 0.9) / ((fr.span || 2.75) * a[3]); v = { yaw: fr.yaw || 0, pitch: fr.pitch != null ? fr.pitch : 4, cx: a[0] + (fr.dx || 0), cy: a[1] + (fr.dy || -0.06) * a[3], cz: a[2], scale: sc, w: Math.round(bw), h: Math.round(bh - 12 * k), ss: q, variant: { bust: true } }; }
      else { v = fitView(S0, i === 1 ? (d.sideYaw || 90) : 180, i === 1 ? 0 : 6, bw, bh - 18 * k, 0.06); v.ss = q; }
      g.save(); L.rrect(g, bx, by, bw, bh, 8 * k); g.clip();
      if (i > 0 && !d.noGround) { const p0 = E.project(Object.assign({}, v), (S0.bounds[0] + S0.bounds[3]) / 2, d.groundY || 0, (S0.bounds[2] + S0.bounds[5]) / 2); L.groundShadow(g, bx + p0[0], by + 16 * k + p0[1], bw * 0.36, bw * 0.06); }
      const r = await L.view(d, v, { no: d.no }); g.drawImage(r.cv, bx, by + (i === 0 ? 12 : 16) * k); g.restore();
      g.fillStyle = th.sub; g.font = `${9.5 * k}px ${L.FB}`; g.fillText(labs[i], bx + 7 * k, by + 13 * k); L.allText.push(labs[i]);
    }
    // ---- palette
    g.fillStyle = th.sub; g.font = `${9.5 * k}px ${L.FB}`; g.fillText('配色 Palette', 12 * k, 648 * k); L.allText.push('配色 Palette');
    L.palette(g, d.palette, 10 * k, 654 * k, 440 * k, k, th);
    // ---- text
    let y = 724 * k; const tx = 14 * k, tw2 = 432 * k;
    g.fillStyle = th.lead; g.fillRect(tx, y - 12 * k, 3 * k, 15 * k);
    y = L.para(g, d.idea, tx + 9 * k, y, tw2 - 9 * k, 17 * k, `${12.5 * k}px ${L.FT}`, th.ink, 3);
    y = L.para(g, d.ideaEn, tx + 9 * k, y + 1 * k, tw2 - 9 * k, 13 * k, `italic ${9.5 * k}px ${L.FB}`, th.sub, 2);
    y += 7 * k; g.fillStyle = th.lead; g.font = `${10.5 * k}px ${L.FT}`; g.fillText('文化依據 Cultural basis', tx, y); L.allText.push('文化依據 Cultural basis');
    y = L.para(g, d.culture, tx, y + 14.5 * k, tw2, 14 * k, `${10 * k}px ${L.FB}`, th.ink, 5);
    y += 4 * k; g.fillStyle = th.lead; g.font = `${10.5 * k}px ${L.FT}`; g.fillText('3D 製作', tx, y); L.allText.push('3D 製作');
    L.para(g, d.model3d, tx + 52 * k, y, tw2 - 52 * k, 13.5 * k, `${9.8 * k}px ${L.FB}`, th.sub, 2);
    g.restore();
    return cv;
  }

  async function silhouette(d, hpx, yaw, pitch, wmul, q = 2) {
    const S = d._S || d.scene({}); const v = fitView(S, yaw, pitch, hpx * wmul, hpx, 0.02); v.ss = q;
    const R = await E.renderPar(S, v, { no: d.no, variant: {} }); return E.silCanvas(R, '#0b0b0f');
  }

  async function renderSheet(cards, k = 1) {
    const W = 2400, H0 = 150, gap = 18; const cw = CW, ch = CH; const stripH = 236;
    const Hh = H0 + 2 * ch + gap * 2 + stripH + 10;
    const cv = L.canvas(W * k, Hh * k); const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, Hh * k); bg.addColorStop(0, '#11131B'); bg.addColorStop(1, '#0B0D13'); g.fillStyle = bg; g.fillRect(0, 0, W * k, Hh * k);
    L.grain(g, 0, 0, W * k, Hh * k, 0.03, 7);
    const SH = G.SHEET;
    g.fillStyle = '#F1E7D2'; g.font = `${60 * k}px ${L.FT}`; g.fillText(SH.title, 40 * k, 88 * k);
    g.fillStyle = '#E8C47A'; g.font = `italic ${18 * k}px ${L.FB}`; g.fillText(SH.sub, 40 * k, 122 * k);
    L.para(g, SH.blurb, 640 * k, 58 * k, 1720 * k, 27 * k, `${17 * k}px ${L.FB}`, '#CFC4AE', 3);
    const cx0 = (W - 5 * cw - 4 * gap) / 2;
    cards.forEach((c, i) => { const col = i % 5, row = Math.floor(i / 5); g.drawImage(c, (cx0 + col * (cw + gap)) * k, (H0 + row * (ch + gap)) * k, cw * k, ch * k); });
    const sy = H0 + 2 * (ch + gap) + 4; g.fillStyle = 'rgba(255,255,255,0.04)'; L.rrect(g, cx0 * k, sy * k, (W - 2 * cx0) * k, (stripH - 14) * k, 12 * k); g.fill();
    const lab = '剪影檢查 Silhouette check — hero angle + side, solid black at map-sprite scale (~90 px tall)';
    g.fillStyle = '#B9AE98'; g.font = `${15 * k}px ${L.FB}`; g.fillText(lab, (cx0 + 18) * k, (sy + 26) * k); L.allText.push(lab);
    const ds = G.DESIGNS.slice().sort((a, b) => a.no - b.no);
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i]; const x = cx0 + 14 + i * 234; const a = await silhouette(d, 92 * k, d.hero.yaw, d.hero.pitch, 1.1), b = await silhouette(d, 70 * k, d.sideYaw || 90, 0, 1.3);
      g.fillStyle = 'rgba(232,220,196,0.92)'; L.rrect(g, x * k, (sy + 40) * k, 222 * k, 160 * k, 8 * k); g.fill();
      g.drawImage(a, (x + 4) * k, (sy + 46) * k); g.drawImage(b, (x + 220) * k - b.width, (sy + 46 + 22) * k);
      g.fillStyle = '#3A3226'; g.font = `${12.5 * k}px ${L.FT}`; g.fillText(String(d.no).padStart(2, '0') + ' ' + d.zh, (x + 8) * k, (sy + 192) * k);
    }
    return cv;
  }

  G.CARDS = { renderCard, renderSheet, fitView, CW, CH };

  // page bootstrap: G.DESIGNS + G.SHEET defined by the design file
  G.bootPets = function (libs) {
    const P = new URLSearchParams(location.search);
    if (+P.get('workers')) E.initWorkers(+P.get('workers'), { worker: 'tuanzi_nianer_lantern_mother_worker.js', libs });
    G.buildCards = async function (only, k, q) { const out = []; for (const d of G.DESIGNS) { if (only && d.no !== only) continue; out.push({ no: d.no, cv: await renderCard(d, k, q) }); } return out; };
    G.debugViews = async function (spec, q) {
      const cvs = [];
      for (const [no, yaw, pitch, px, focus] of spec.split(';').map((s) => s.split(','))) {
        const d = G.DESIGNS.find((x) => x.no === +no); const S = d.scene({}); let v;
        if (focus === 'head') { const a = S.anchors.head; v = { yaw: +yaw, pitch: +pitch, cx: a[0], cy: a[1] - 0.05 * a[3], cz: a[2], scale: +px / (2.8 * a[3]), w: +px, h: +px, variant: { bust: true } }; }
        else v = fitView(S, +yaw, +pitch, +px, +px, 0.04);
        v.ss = q; cvs.push((await L.view(d, v, { no: d.no })).cv);
      }
      const W = cvs.reduce((a, c) => a + c.width + 10, 0), H = Math.max(...cvs.map((c) => c.height));
      const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d'); g.fillStyle = '#556'; g.fillRect(0, 0, W, H);
      let x = 0; for (const c of cvs) { g.drawImage(c, x, 0); x += c.width + 10; } return out;
    };
    window.addEventListener('load', async () => {
      if (P.get('auto') === '0') { document.body.dataset.ready = 1; return; }
      await document.fonts.ready;
      const cards = await G.buildCards(+P.get('only') || 0, +P.get('k') || 1, +P.get('q') || 2);
      if (P.get('only')) cards.forEach((c) => document.body.appendChild(c.cv));
      else document.body.appendChild(await renderSheet(cards.map((c) => c.cv), 1));
      document.body.dataset.ready = 1;
    });
  };
})(window);
