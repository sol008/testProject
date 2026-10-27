// Stylised map of Formosa: journey route, visited places, travel animation.
//   await S.travel('jiufen', 'pingxi')           -> animated lantern travels between places
//   G.Scenes.push(new G.WorldMapScene())         -> viewer (from the menu)
'use strict';
G.World = (() => {
  const W = {};
  // [lon, lat] coastline (approximate, clockwise from the northern tip)
  const COAST = [
    [121.53, 25.30], [121.62, 25.24], [121.74, 25.16], [121.86, 25.13], [121.92, 25.12], [122.00, 25.01], [121.93, 24.95],
    [121.83, 24.86], [121.80, 24.73], [121.86, 24.59], [121.80, 24.45], [121.70, 24.30], [121.65, 24.19], [121.62, 24.00],
    [121.58, 23.80], [121.52, 23.50], [121.45, 23.30], [121.38, 23.10], [121.25, 22.92], [121.15, 22.75], [121.02, 22.55],
    [120.92, 22.38], [120.88, 22.22], [120.85, 22.05], [120.85, 21.90], [120.78, 21.93], [120.73, 21.95], [120.70, 22.08],
    [120.62, 22.25], [120.55, 22.40], [120.45, 22.46], [120.33, 22.55], [120.27, 22.62], [120.22, 22.80], [120.15, 23.00],
    [120.08, 23.15], [120.12, 23.30], [120.15, 23.42], [120.18, 23.60], [120.22, 23.78], [120.30, 23.98], [120.38, 24.10],
    [120.50, 24.28], [120.60, 24.42], [120.72, 24.58], [120.85, 24.72], [120.92, 24.84], [121.02, 24.96], [121.12, 25.05],
    [121.25, 25.10], [121.40, 25.17], [121.47, 25.26],
  ];
  const ISLANDS = {
    penghu: [[119.52, 23.50], [119.62, 23.52], [119.68, 23.60], [119.62, 23.68], [119.54, 23.66], [119.50, 23.58]],
    orchid: [[121.50, 22.02], [121.58, 22.02], [121.60, 22.07], [121.54, 22.09], [121.49, 22.06]],
    green: [[121.47, 22.64], [121.51, 22.64], [121.51, 22.68], [121.47, 22.68]],
    turtle: [[121.94, 24.83], [121.97, 24.84], [121.96, 24.85]],
  };
  // place id -> [lon, lat, name, region]
  W.PLACES = {
    jiufen: [121.84, 25.11, '九份', '北'], badouzi: [121.80, 25.15, '八斗子', '北'], pingxi: [121.74, 25.03, '平溪', '北'],
    tamsui: [121.44, 25.17, '淡水', '北'], guanyin: [121.42, 25.12, '觀音山', '北'], bangka: [121.50, 25.04, '艋舺', '北'],
    hsinchu: [120.97, 24.80, '竹塹', '北'], xiangtian: [121.00, 24.57, '向天湖', '北'], lukang: [120.43, 24.06, '鹿港', '中'],
    tainan: [120.20, 23.00, '府城', '南'], yanshui: [120.27, 23.32, '鹽水', '南'], alishan: [120.80, 23.51, '阿里山', '中'],
    yushan: [120.96, 23.47, '玉山', '中'], sunmoon: [120.91, 23.86, '日月潭', '中'], beigang: [120.30, 23.57, '北港', '中'],
    takao: [120.28, 22.62, '打狗', '南'], donggang: [120.45, 22.47, '東港', '南'], hengchun: [120.74, 22.01, '恆春', '南'],
    eluanbi: [120.85, 21.90, '鵝鑾鼻', '南'], orchid: [121.55, 22.05, '蘭嶼', '東'], taitung: [121.15, 22.76, '台東', '東'],
    taroko: [121.60, 24.16, '太魯閣', '東'], toucheng: [121.82, 24.86, '頭城', '東'], penghu: [119.58, 23.58, '澎湖', '海'],
    farshore: [119.0, 23.2, '彼岸', '海'],
  };
  // default journey order (used for drawing the route line through visited places)
  W.ROUTE = ['jiufen', 'pingxi', 'tamsui', 'guanyin', 'bangka', 'hsinchu', 'xiangtian', 'lukang', 'tainan', 'yanshui',
    'alishan', 'yushan', 'sunmoon', 'beigang', 'tainan', 'takao', 'donggang', 'hengchun', 'eluanbi', 'orchid', 'taitung',
    'taroko', 'toucheng', 'penghu', 'farshore'];

  const LON0 = 118.7, LAT0 = 25.45, KX = 196, KY = 208;
  // label nudges (px at scale 1) so crowded northern names don't overlap
  const LABEL_OFF = { tamsui: [-70, -14], guanyin: [-78, 8], bangka: [-62, 22], pingxi: [-56, 18], jiufen: [6, -14], badouzi: [10, -30], hsinchu: [-62, 0], xiangtian: [-70, 14] };
  W.proj = (lon, lat, box) => {
    const x = (lon - LON0) * KX, y = (LAT0 - lat) * KY;
    return [box.x + x * box.s, box.y + y * box.s];
  };

  W.visit = (id) => { G.state.vars.visited = G.state.vars.visited || {}; G.state.vars.visited[id] = true; };
  W.visited = (id) => !!(G.state.vars.visited && G.state.vars.visited[id]);

  let paperCache = null;
  W.drawMap = function (ctx, box, t, o = {}) {
    // parchment background
    if (!paperCache || paperCache.lw !== box.w) {
      paperCache = G.U.makeCanvas(box.w, box.h);
      const p = paperCache.getContext('2d');
      const g = p.createLinearGradient(0, 0, 0, box.h);
      g.addColorStop(0, '#0e1a2e'); g.addColorStop(1, '#070d1a');
      p.fillStyle = g; p.fillRect(0, 0, box.w, box.h);
      // sea waves pattern
      p.strokeStyle = 'rgba(160,190,230,0.07)'; p.lineWidth = 1.2;
      for (let y = 10; y < box.h; y += 22) for (let x = (y / 22) % 2 * 20; x < box.w; x += 40) {
        p.beginPath(); p.arc(x, y, 9, Math.PI * 1.1, Math.PI * 1.9); p.stroke();
      }
    }
    ctx.save();
    ctx.drawImage(paperCache, box.x, box.y, box.w, box.h);
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    const sub = { x: box.x + box.ox, y: box.y + box.oy, s: box.s };
    const poly = (pts, fill, stroke) => {
      ctx.beginPath();
      pts.forEach(([lo, la], i) => { const [x, y] = W.proj(lo, la, sub); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    // glow around island
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,120,0.35)'; ctx.shadowBlur = 30;
    poly(COAST, '#2a3a2e', null);
    ctx.restore();
    const lg = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    lg.addColorStop(0, '#4a6a48'); lg.addColorStop(1, '#2e4a3a');
    poly(COAST, lg, '#d9b56a');
    // central mountain range
    ctx.save();
    poly(COAST, null, null); ctx.clip();
    ctx.strokeStyle = 'rgba(30,40,30,0.5)'; ctx.lineWidth = 3;
    const ridge = [[121.62, 24.95], [121.35, 24.45], [121.20, 24.10], [121.05, 23.70], [120.95, 23.40], [120.90, 23.0], [120.85, 22.5], [120.82, 22.15]];
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ridge.forEach(([lo, la], i) => { const [x, y] = W.proj(lo + k * 0.12, la, sub); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    for (const [lo, la] of ridge) {
      const [x, y] = W.proj(lo, la, sub);
      ctx.fillStyle = 'rgba(200,210,190,0.35)';
      ctx.beginPath(); ctx.moveTo(x - 10, y + 6); ctx.lineTo(x, y - 10); ctx.lineTo(x + 10, y + 6); ctx.fill();
    }
    ctx.restore();
    for (const k in ISLANDS) poly(ISLANDS[k], '#3a5a40', '#d9b56a');
    // black tide label
    const [bx, by] = W.proj(119.4, 24.4, sub);
    G.Render.text(ctx, '黑水溝', bx, by, { size: 18 * box.s, align: 'center', color: 'rgba(200,210,240,0.35)' });
    const [kx, ky] = W.proj(122.2, 23.2, sub);
    G.Render.text(ctx, '黑潮', kx, ky, { size: 16 * box.s, align: 'center', color: 'rgba(200,230,255,0.3)' });
    // route through visited places
    const visited = W.ROUTE.filter((id) => W.visited(id) || (o.extra && o.extra.includes(id)));
    if (visited.length > 1) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -t * 20;
      ctx.strokeStyle = 'rgba(255,200,120,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath();
      visited.forEach((id, i) => { const p = W.PLACES[id]; const [x, y] = W.proj(p[0], p[1], sub); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.restore();
    }
    // places
    for (const id in W.PLACES) {
      const p = W.PLACES[id];
      const known = W.visited(id) || (o.extra && o.extra.includes(id));
      if (!known && !o.showAll) continue;
      const [x, y] = W.proj(p[0], p[1], sub);
      const cur = o.current === id;
      ctx.fillStyle = cur ? '#ffd97a' : known ? '#ff8a5a' : 'rgba(200,200,200,0.4)';
      ctx.beginPath(); ctx.arc(x, y, cur ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 1.5; ctx.stroke();
      if (cur) G.UI.lanternIcon(ctx, x, y - 22, 8, t);
      const right = p[0] > 121.3 || id === 'farshore';
      const off = LABEL_OFF[id] || [0, 0];
      G.Render.text(ctx, p[2], x + (right ? -10 : 10) + off[0] * box.s, y - 10 + off[1] * box.s, { size: Math.min(26, 15 * Math.max(1, box.s * 0.75)), align: right ? 'right' : 'left', color: known ? '#fff0d0' : '#8a8a8a', stroke: 'rgba(10,14,24,0.85)', strokeW: 3 });
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- travel animation scene
  class TravelScene {
    constructor(from, to, o, res) {
      this.opaque = true;
      this.from = from; this.to = to; this.o = o || {}; this.res = res;
      this.t = 0;
      this.dur = this.o.dur || 3.6;
      W.visit(from);
    }
    update(dt) {
      this.t += dt;
      if ((this.t > 0.8 && (G.Input.pressed('ok') || G.Input.clicked())) || (G.Debug && G.Debug.autoplay)) this.t = Math.max(this.t, this.dur + 0.6);
      if (this.t > this.dur + 0.6) { W.visit(this.to); G.Scenes.pop(this); this.res(); }
    }
    draw(ctx) {
      const t = this.t;
      // zoom to fit the two places (short hops zoom in, long voyages show the whole island)
      if (!this.box) {
        const pa = W.PLACES[this.from], pb = W.PLACES[this.to];
        const unit = { x: 0, y: 0, s: 1 };
        const [ax, ay] = W.proj(pa[0], pa[1], unit), [bx2, by2] = W.proj(pb[0], pb[1], unit);
        const span = Math.max(Math.abs(ax - bx2) / (G.W * 0.55), Math.abs(ay - by2) / (G.H * 0.55), 0.0001);
        const s = G.U.clamp(1 / span, 1, 3.2);
        const cx = (ax + bx2) / 2, cy = (ay + by2) / 2;
        this.box = { x: 0, y: 0, w: G.W, h: G.H, ox: G.W * 0.58 - cx * s, oy: G.H * 0.45 - cy * s, s };
        if (s <= 1.05) { this.box.ox = 330; this.box.oy = 14; this.box.s = 0.92; }
      }
      const box = this.box;
      W.drawMap(ctx, box, t, { current: null, extra: [this.from, this.to] });
      const sub = { x: box.x + box.ox, y: box.y + box.oy, s: box.s };
      const p0 = W.PLACES[this.from], p1 = W.PLACES[this.to];
      const [x0, y0] = W.proj(p0[0], p0[1], sub), [x1, y1] = W.proj(p1[0], p1[1], sub);
      const k = G.U.ease.inOutQuad(G.U.clamp((t - 0.5) / (this.dur - 0.8), 0, 1));
      // curved path
      const mx = (x0 + x1) / 2 + (y1 - y0) * 0.25, my = (y0 + y1) / 2 - (x1 - x0) * 0.25;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,220,150,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([2, 8]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
      ctx.restore();
      const bx = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * x1;
      const by = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * y1;
      G.UI.lanternIcon(ctx, bx, by - 6, 12, t);
      // caption
      const capA = Math.min(1, t * 2, (this.dur + 0.6 - t) * 3);
      ctx.save(); ctx.globalAlpha = Math.max(0, capA);
      G.UI.panel(ctx, 60, G.H - 170, 520, 120, { ornament: true });
      G.Render.text(ctx, `${p0[2]}　→　${p1[2]}`, 90, G.H - 150, { size: 34, color: '#fff0d0' });
      if (this.o.label) G.Render.text(ctx, this.o.label, 92, G.H - 100, { size: 20, color: '#c9b893' });
      ctx.restore();
      G.FX.vignette(ctx, 0.4);
    }
  }
  W.travel = (from, to, o) => new Promise((res) => G.Scenes.push(new TravelScene(from, to, o, res)));

  // ---------------------------------------------------------------- viewer (menu)
  class WorldMapScene {
    constructor() { this.t = 0; }
    update(dt) {
      this.t += dt;
      if (G.Input.pressed('cancel') || G.Input.pressed('ok') || G.Input.pressed('menu')) { G.Audio.sfx('cancel'); G.Scenes.pop(this); }
    }
    draw(ctx) {
      const cur = G.mapScene && G.mapScene.def.place;
      W.drawMap(ctx, { x: 0, y: 0, w: G.W, h: G.H, ox: 330, oy: 14, s: 0.92 }, this.t, { current: cur });
      G.Render.text(ctx, '福爾摩沙・旅途', 60, 40, { size: 36, color: '#fff0d0', glow: 'rgba(255,170,90,0.5)', glowBlur: 12 });
      const n = Object.keys(G.state.vars.visited || {}).length;
      G.Render.text(ctx, `已到訪 ${n} 處`, 62, 92, { size: 20, color: '#c9b893' });
      G.UI.hints(ctx, [['X', '返回']]);
    }
  }
  G.WorldMapScene = WorldMapScene;
  return W;
})();
