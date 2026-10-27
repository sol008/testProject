// 彼岸燈 Shorelight — design pass v2 — 糰子 (Tuanzi), the talking 石虎 spirit: 10 options
// Each option = one SDF toon model (modelable primary shapes; markings are paint) + card data.
// Options live in tuanzi_options_a.js / tuanzi_options_b.js; this file holds design 01, the card + sheet layout.
'use strict';
(function (G) {
  const E = G.SDF, K = G.TZK, L = G.LAY; const { hex, cmix, clamp, sstep, mix } = E;
  const sq = Math.sqrt, ab = Math.abs;
  const D = G.TZ_DESIGNS = G.TZ_DESIGNS || [];
  G.SCENE_OF = (key) => D.find((d) => d.no === key.no).scene(key.variant || {});

  // shared belly / chest white mask for quadrupeds & sitters (uses the normal: undersides go white)
  K.bellyMask = (o) => (x, y, z, nx, ny, nz) => {
    const under = sstep(-0.15, -0.5, ny) * sstep(o.yLo || 0.1, (o.yLo || 0.1) + 0.06, y) * sstep(o.uw || 0.2, (o.uw || 0.2) - 0.08, ab(x));
    const chest = o.chest ? o.chest(x, y, z, nx, ny, nz) : 0;
    return clamp(Math.max(under, chest), 0, 1);
  };

  // ================================================================== 01 山野本色 — Field Tuanzi
  D.push({
    no: 1, zh: '山野本色', en: 'Field-Guide Tuanzi', tag: '寫實向 naturalistic',
    idea: '最貼近真實石虎的版本：四足站姿、真實花紋，只把肚子吃圓；可愛來自圓肚與一臉心虛的表情。',
    ideaEn: 'The real Formosan leopard cat, honestly drawn — just overfed. The cute is in the belly and the guilty look.',
    culture: '花紋依台灣石虎實際特徵：額頭兩條白線夾黑紋、白頰線、圓耳背白斑、斑點毛色、環紋尾。頸上紅線繫一枚方孔銅錢——民間給孩子與家畜「壓驚、保平安」的習俗。靈性只在尾尖一點微光。',
    model3d: '橢球軀幹＋四柱腿＋球頭；花紋全走貼圖。尾 8 節骨骼。',
    palette: [
      { zh: '石虎黃褐', hex: '#C49A62', role: '主' }, { zh: '墨斑', hex: '#3B2A1E', role: '斑' }, { zh: '腹白', hex: '#F3ECDD', role: '副' },
      { zh: '耳背黑', hex: '#2B2320', role: '耳' }, { zh: '紅繩', hex: '#B3262B', role: '點' }, { zh: '古銅', hex: '#A8743A', role: '飾' }],
    callouts: [
      { a: 'fore', zh: '額白雙線', en: 'twin white forehead lines', side: 'l' },
      { a: 'cheek', zh: '白頰線', en: 'white cheek line', side: 'l' },
      { a: 'coin', zh: '紅繩方孔錢', en: 'red cord & cash coin', side: 'l' },
      { a: 'tail', zh: '環紋粗尾', en: 'thick ringed tail', side: 'r' },
      { a: 'belly', zh: '吃圓的肚子', en: 'the famous belly', side: 'r' }],
    hero: { yaw: 36, pitch: 9 },
    scene(vr = {}) {
      const S = E.Scene(); const c = K.cols(K.coat); K.mats(S, K.coat);
      S.mat('cord', { base: hex('#B3262B'), line: hex('#4A0E10'), grp: 3, hi: hex('#E0565A'), hiAt: 0.6 });
      S.mat('coin', { base: hex('#A8743A'), line: hex('#3E2610'), grp: 4, spec: 0.8, specAt: 0.96, hi: hex('#E2B86E'), hiAt: 0.55 });
      const H = K.head(S, { R: 0.235, pos: [0, 0.64, 0.4], rot: [-2, 18, 4], cheek: 0.8, mats: { face: 'face', ear: 'ear', nose: 'nose' }, eye: { bw: 0.25, bh: 0.24 } });
      const F = 'fur';
      const body = S.bound(S.su(0.08,
        S.ell(F, 0, 0.37, -0.05, 0.25, 0.225, 0.37), S.ell(F, 0, 0.3, 0.0, 0.275, 0.2, 0.29), S.ell(F, 0, 0.42, 0.19, 0.2, 0.21, 0.18),
        S.mx(S.ell(F, 0.13, 0.34, -0.27, 0.13, 0.16, 0.16)),
        S.cone(F, 0, 0.45, 0.24, 0, 0.56, 0.35, 0.16, 0.14)), 0, 0.35, -0.02, 0.55);
      const legs = S.bound(S.su(0.045,
        S.mx(S.cone(F, 0.12, 0.33, 0.22, 0.125, 0.07, 0.26, 0.08, 0.06)), S.mx(S.ell('paw', 0.125, 0.045, 0.29, 0.075, 0.05, 0.09)),
        S.mx(S.cone(F, 0.14, 0.27, -0.3, 0.13, 0.07, -0.25, 0.085, 0.06)), S.mx(S.ell('paw', 0.13, 0.045, -0.22, 0.075, 0.05, 0.09))), 0, 0.2, 0, 0.5);
      const tp = [[0, 0.44, -0.36, 0.078], [-0.03, 0.56, -0.5, 0.085], [-0.09, 0.73, -0.56, 0.083], [-0.17, 0.86, -0.5, 0.076], [-0.22, 0.92, -0.39, 0.066], [-0.22, 0.91, -0.3, 0.056]];
      const tail = vr.bust ? null : S.bound(S.tube('tail', tp, 0.025), -0.1, 0.7, -0.45, 0.4);
      const collar = S.r(S.torus('cord', 0, 0, 0, 0.152, 0.017), 0, 0, 0, 40, 0, 0);
      const coin = S.sub(S.r(S.cyl('coin', 0, 0, 0, 0.042, 0.007, 0.004), 0, 0, 0, 72, 0, 0), S.box('coin', 0, 0, 0, 0.012, 0.012, 0.05));
      S.root = S.u(S.su(0.05, body, legs, tail, H.node), S.t(collar, 0, 0.5, 0.3), S.t(coin, 0, 0.4, 0.43), S.cap('cord', 0, 0.45, 0.41, 0, 0.42, 0.43, 0.008));
      S.bounds = [-0.46, -0.01, -0.68, 0.46, 1.02, 0.72];
      S.params = { size: 1, rimColor: hex('#FFF1D6'), depthEdge: 0.03, aoScale: 0.025 };
      S.mats[S.names.face].tex = K.faceTex(H, c, { lid: 0.1, lower: 0.0, tilt: 0.05, look: [0.1, -0.04], pupil: 'slit', pw: 0.22, iris: [hex('#E9C752'), hex('#93A44C')] }, {});
      S.mats[S.names.ear].tex = K.earTex(H, c);
      const belly = K.bellyMask({ yLo: 0.12, uw: 0.2, chest: (x, y, z, nx, ny, nz) => sstep(0.32, 0.4, y) * sstep(0.62, 0.52, y) * sstep(0.15, 0.4, nz) * sstep(0.16, 0.06, ab(x)) });
      S.mats[S.names.fur].tex = K.spotTex(c, { white: belly, freq: [13, 12, 9.5], spotSize: 0.32, gap: 0.18, sizeAt: (x, y) => (y < 0.3 ? 0.7 : 1),
        nape: (x, y, z, sh) => { if (y > 0.5 && z > 0.12 && z < 0.36 && ab(x) < 0.13) { const a = ab(x); if (a < 0.02 || (a > 0.06 && a < 0.082)) { sh.base = c.spot; return true; } } return false; } });
      S.mats[S.names.paw].tex = (x, y, z, nx, ny, nz, sh) => { sh.base = cmix(c.base, c.white, 0.55); };
      S.mats[S.names.tail].tex = K.tailTex(c, tp, { rings: 6, from: 0.38, tip: 0.9 });
      S.anchors = { fore: [0.02, 0.8, 0.56], cheek: [-0.17, 0.57, 0.53], coin: [0, 0.4, 0.44], tail: [-0.12, 0.8, -0.55], belly: [0.2, 0.22, 0.02], head: [0, 0.64, 0.4, 0.235] };
      S.overlay = (g, R) => K.whiskers(g, R, H);
      S.H = H; return S;
    },
  });

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
    g.fillStyle = '#F1E7D2'; g.font = `${60 * k}px ${L.FT}`; g.fillText('糰子', 40 * k, 88 * k);
    g.fillStyle = '#E8C47A'; g.font = `italic ${18 * k}px ${L.FB}`; g.fillText('Tuanzi — Formosan leopard-cat (石虎) spirit · party member · 10 design options · v2', 40 * k, 122 * k);
    L.para(g, '雲歸的夥伴：貪吃、膽小、圓滾滾，吃了七彩靈蕈會一本正經講宇宙大道理。十款方案從寫實石虎到大膽幻想，全部保留石虎真實辨識特徵（額頭雙白線夾黑紋、白頰線、圓耳背白斑、斑點毛、環紋尾），以可直接 3D 建模的主形體呈現，花紋與細節皆為貼圖；每卡附正、側、背三視與面部特寫。',
      640 * k, 58 * k, 1720 * k, 27 * k, `${17 * k}px ${L.FB}`, '#CFC4AE', 3);
    L.allText.push('Tuanzi — Formosan leopard-cat (石虎) spirit · party member · 10 design options · v2');
    const cx0 = (W - 5 * cw - 4 * gap) / 2;
    cards.forEach((c, i) => { const col = i % 5, row = Math.floor(i / 5); g.drawImage(c, (cx0 + col * (cw + gap)) * k, (H0 + row * (ch + gap)) * k, cw * k, ch * k); });
    const sy = H0 + 2 * (ch + gap) + 4; g.fillStyle = 'rgba(255,255,255,0.04)'; L.rrect(g, cx0 * k, sy * k, (W - 2 * cx0) * k, (stripH - 14) * k, 12 * k); g.fill();
    const lab = '剪影檢查 Silhouette check — hero angle + side, solid black at map-sprite scale (~90 px tall)';
    g.fillStyle = '#B9AE98'; g.font = `${15 * k}px ${L.FB}`; g.fillText(lab, (cx0 + 18) * k, (sy + 26) * k); L.allText.push(lab);
    const ds = G.TZ_DESIGNS.slice().sort((a, b) => a.no - b.no);
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i]; const x = cx0 + 14 + i * 234; const a = await silhouette(d, 92 * k, d.hero.yaw, d.hero.pitch, 1.1), b = await silhouette(d, 70 * k, d.sideYaw || 90, 0, 1.3);
      g.fillStyle = 'rgba(232,220,196,0.92)'; L.rrect(g, x * k, (sy + 40) * k, 222 * k, 160 * k, 8 * k); g.fill();
      g.drawImage(a, (x + 4) * k, (sy + 46) * k); g.drawImage(b, (x + 220) * k - b.width, (sy + 46 + 22) * k);
      g.fillStyle = '#3A3226'; g.font = `${12.5 * k}px ${L.FT}`; g.fillText(String(d.no).padStart(2, '0') + ' ' + d.zh, (x + 8) * k, (sy + 192) * k);
    }
    return cv;
  }

  G.TZ = { renderCard, renderSheet, fitView, CW, CH };
})(window);
