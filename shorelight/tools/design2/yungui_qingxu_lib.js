// 彼岸燈 Shorelight — design pass v2 — shared drawing kit for 雲歸 (yungui) & 清虛真人 (qingxu)
// Canvas-2D procedural character drawing: colour maths, smooth paths, cel shading with rim light,
// tapered ink strokes, a parametric FRONT-VIEW head (every design supplies its own face structure),
// hands in several poses and Taoist props (fan, gourd, talisman, whisk, bagua, taiji, seals…).
'use strict';
(() => {
  const DZ = (window.DZ = {});
  DZ.k = 1; // stroke multiplier (bust zoom compensation)
  DZ.rim = '#dff0ff'; // rim light colour (scene)
  DZ.rimA = 0.75;
  DZ.sil = false; // silhouette mode: skip FX/glows

  // ------------------------------------------------------------ colour
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const hsl = (c) => rgb2hsl(...hex2rgb(c));
  const fromHsl = (h, s, l) => rgb2hex(...hsl2rgb(h, clamp(s), clamp(l)));
  function hueToward(h, target, t) {
    let d = ((target - h + 540) % 360) - 180;
    return h + d * t;
  }
  DZ.mix = (a, b, t) => {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  // shadow tone: darker, hue nudged toward blue-violet, slightly more saturated
  DZ.dk = (c, t = 0.3) => {
    const [h, s, l] = hsl(c);
    return fromHsl(hueToward(h, 250, t * 0.35), s + t * 0.12 * (1 - s), l * (1 - t));
  };
  // light tone: lighter, warmer
  DZ.lt = (c, t = 0.2) => {
    const [h, s, l] = hsl(c);
    return fromHsl(hueToward(h, 45, t * 0.25), s * (1 - t * 0.2), l + (1 - l) * t);
  };
  // line colour: a dark hue of the fill
  DZ.ln = (c) => {
    const [h, s, l] = hsl(c);
    return fromHsl(hueToward(h, 300, 0.1), clamp(s * 0.8 + 0.15), l * 0.32 + 0.03);
  };
  DZ.rgba = (c, a) => { const [r, g, b] = hex2rgb(c); return `rgba(${r},${g},${b},${a})`; };
  DZ.sat = (c, f) => { const [h, s, l] = hsl(c); return fromHsl(h, s * f, l); };

  // ------------------------------------------------------------ paths
  // smooth closed/open path through points (Catmull-Rom). A point [x,y,1] is a sharp corner.
  function sp(pts, closed = true, tension = 1, path) {
    const p = path || new Path2D();
    const n = pts.length;
    const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    p.moveTo(pts[0][0], pts[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const t1 = p1[2] ? 0 : tension / 6, t2 = p2[2] ? 0 : tension / 6;
      p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * t1, p1[1] + (p2[1] - p0[1]) * t1,
        p2[0] - (p3[0] - p1[0]) * t2, p2[1] - (p3[1] - p1[1]) * t2, p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  DZ.sp = sp;
  // symmetric closed shape: half = right-half points (x = offset from cx) listed top→bottom
  DZ.sym = (cx, half, opts = {}) => {
    const R = half.map((q) => [cx + q[0], q[1], q[2]]);
    const L = half.slice().reverse().filter((q) => Math.abs(q[0]) > 1e-6).map((q) => [cx - q[0], q[1], q[2]]);
    const pts = R.concat(L.filter((q, i) => !(i === 0 && Math.abs(half[half.length - 1][0]) < 1e-6)));
    return opts.pts ? pts : sp(pts, true, opts.t || 1);
  };
  DZ.symPts = (cx, half) => DZ.sym(cx, half, { pts: true });
  DZ.poly = (pts, closed = true) => {
    const p = new Path2D();
    pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
    if (closed) p.closePath();
    return p;
  };
  DZ.ell = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); return p; };
  DZ.shift = (path, dx, dy) => { const p = new Path2D(); p.addPath(path, new DOMMatrix([1, 0, 0, 1, dx, dy])); return p; };
  DZ.xf = (path, m) => { const p = new Path2D(); p.addPath(path, m); return p; };

  // sample a Catmull-Rom curve through pts → dense polyline
  function dense(pts, per = 8) {
    if (pts.length === 2) {
      const out = [];
      for (let i = 0; i <= per; i++) out.push([pts[0][0] + (pts[1][0] - pts[0][0]) * i / per, pts[0][1] + (pts[1][1] - pts[0][1]) * i / per]);
      return out;
    }
    const n = pts.length, out = [];
    const P = (i) => pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let s = i ? 1 : 0; s <= per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    return out;
  }
  DZ.dense = dense;
  // tapered ribbon along a smooth curve through pts; width profile w0 → wm (middle) → w1
  function ribbon(pts, w0, w1, wm) {
    const d = dense(pts, 10), n = d.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = d[Math.max(0, i - 1)], b = d[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const t = i / (n - 1);
      const w = wm === undefined ? w0 + (w1 - w0) * t : (t < 0.5 ? w0 + (wm - w0) * Math.sin(t * Math.PI) : w1 + (wm - w1) * Math.sin(t * Math.PI));
      L.push([d[i][0] - dy * w / 2, d[i][1] + dx * w / 2]);
      R.push([d[i][0] + dy * w / 2, d[i][1] - dx * w / 2]);
    }
    return DZ.poly(L.concat(R.reverse()));
  }
  DZ.ribbon = ribbon;
  DZ.tp = (ctx, pts, w0, w1, col, wm) => { ctx.fillStyle = col; ctx.fill(ribbon(pts, w0, w1, wm)); };
  // fold / crease: spindle-shaped tapered stroke
  DZ.fold = (ctx, pts, w, col) => DZ.tp(ctx, pts, w * 0.1, w * 0.1, col, w);
  // hanging drape fold: narrow at y0, widening to wBot at y1 (cel cloth shadow wedge)
  DZ.drape = (ctx, x, y0, y1, wBot, sway, col) => {
    const m = (y0 + y1) / 2;
    ctx.fillStyle = col;
    ctx.fill(sp([[x, y0], [x + wBot * 0.12 + sway * 0.4, m], [x + wBot * 0.5 + sway, y1, 1], [x + sway + wBot * 0.1, y1 - wBot * 0.25], [x - wBot * 0.5 + sway, y1, 1], [x - wBot * 0.12 + sway * 0.4, m]]));
  };
  // ink line (tapered at both ends, stroke-weight compensated)
  DZ.inkl = (ctx, pts, w, col) => DZ.tp(ctx, pts, w * 0.35 * DZ.k, w * 0.25 * DZ.k, col, w * DZ.k);
  DZ.stroke = (ctx, path, w, col, dash) => {
    ctx.save(); ctx.lineWidth = w * DZ.k; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash.map((v) => v * DZ.k));
    ctx.stroke(path); ctx.restore();
  };
  DZ.line = (ctx, pts, w, col, dash) => DZ.stroke(ctx, sp(pts, false), w, col, dash);

  // ------------------------------------------------------------ cel shading
  // region of `path` not covered by path shifted by -d → a crescent on the +d side
  function crescent(ctx, path, d, col) {
    const p = new Path2D(); p.addPath(path); p.addPath(path, new DOMMatrix([1, 0, 0, 1, -d[0], -d[1]]));
    ctx.fillStyle = col; ctx.fill(p, 'evenodd');
  }
  DZ.crescent = crescent;
  // o: c base, s shadow size (px), sd [dx,dy] dir, sh shadow col, hi highlight col, h highlight size,
  //    rim width, fx(ctx) clipped detail callback, lw line width, ln line col, grad [x0,y0,x1,y1,alpha]
  DZ.cel = (ctx, path, o) => {
    const c = o.c;
    ctx.save();
    ctx.fillStyle = c; ctx.fill(path);
    if (DZ.sil) { ctx.restore(); return; }
    ctx.save(); ctx.clip(path);
    if (o.grad) {
      const g = ctx.createLinearGradient(o.grad[0], o.grad[1], o.grad[2], o.grad[3]);
      g.addColorStop(0, DZ.rgba(DZ.lt(c, 0.15), 0));
      g.addColorStop(1, DZ.rgba(DZ.dk(c, 0.55), o.grad[4] === undefined ? 0.45 : o.grad[4]));
      ctx.fillStyle = g; ctx.fill(path);
    }
    if (o.pre) o.pre(ctx);
    const s = o.s === undefined ? 5 : o.s;
    if (s) { const dir = o.sd || [1, 0.55]; crescent(ctx, path, [dir[0] * s, dir[1] * s], o.sh || DZ.dk(c, 0.28)); }
    if (o.fx) o.fx(ctx);
    const h = o.h === undefined ? 2.2 : o.h;
    if (h) crescent(ctx, path, [-h, -h * 0.9], o.hi || DZ.lt(c, 0.2));
    const r = o.rim === undefined ? 1.6 : o.rim;
    if (r) crescent(ctx, path, [r, -r * 0.15], DZ.rgba(DZ.mix(c, o.rimC || DZ.rim, 0.65), DZ.rimA));
    if (o.post) o.post(ctx);
    ctx.restore();
    if (o.lw !== 0) {
      ctx.lineWidth = (o.lw || 1.8) * DZ.k; ctx.strokeStyle = o.ln || DZ.ln(c); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke(path);
    }
    ctx.restore();
  };
  // fill clipped to a path
  DZ.clipDo = (ctx, path, fn) => { ctx.save(); ctx.clip(path); fn(ctx); ctx.restore(); };
  DZ.glow = (ctx, x, y, r, col, a = 0.6) => {
    if (DZ.sil) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, DZ.rgba(col, a)); g.addColorStop(1, DZ.rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  // ------------------------------------------------------------ body frame
  // canonical landmarks for a 7.5-head figure, remapped to `heads`. B.Y(h) → y for canonical head-unit h.
  DZ.frame = (cx, gy, H, heads, o = {}) => {
    const u = H / heads, top = gy - H;
    const bodyK = (heads - 1) / 6.5;
    const B = { cx, gy, H, u, top, heads };
    B.Y = (h) => top + (h <= 1 ? h * u : u + (h - 1) * bodyK * u);
    B.X = (f) => cx + f * u;
    B.chin = B.Y(1); B.shY = B.Y(1.42); B.chestY = B.Y(2.05); B.waistY = B.Y(2.95); B.hipY = B.Y(3.5);
    B.crotchY = B.Y(3.8); B.kneeY = B.Y(5.4); B.ankleY = gy - 0.32 * u;
    B.shW = (o.sh || 0.98) * u; B.waistW = (o.waist || 0.58) * u; B.hipW = (o.hip || 0.72) * u;
    B.headW = o.headW || 1; // head scale tweak
    return B;
  };

  // ------------------------------------------------------------ text
  DZ.font = (px, w = 400, fam = 'sans') => {
    const f = fam === 'serif' ? `"Noto Serif TC","WenQuanYi Zen Hei",serif` : `Inter,"WenQuanYi Zen Hei",sans-serif`;
    return `${w} ${px}px ${f}`;
  };
  // wrap mixed CJK / latin text; returns final y
  DZ.wrap = (ctx, text, x, y, maxW, lh, draw = true) => {
    const tokens = text.match(/[⺀-鿿豈-﫿　-〿＀-￯][」』）》，。、；：！？]?|[^\s⺀-鿿豈-﫿　-〿＀-￯]+\s*|\s+/g) || [];
    let line = '';
    const lines = [];
    for (const tk of tokens) {
      const test = line + tk;
      if (ctx.measureText(test.trimEnd()).width > maxW && line) { lines.push(line.trimEnd()); line = tk.trimStart(); } else line = test;
    }
    if (line.trim()) lines.push(line.trimEnd());
    lines.forEach((l, i) => draw && ctx.fillText(l, x, y + i * lh));
    return y + lines.length * lh;
  };

  // ------------------------------------------------------------ head (front view)
  // F: face spec in head-local units (head height = 1, x=0 centre, y=0 skull top, y=1 chin)
  // F = { skin, shape:{t,c,j,ch,cb}, ear:{y,h,w}, eye:{...}, eyeL/eyeR overrides, brow:{...}, nose:{...},
  //       mouth:{...}, age:{naso,crow,fore,jowl,spots,hollow}, stub, blush, extra(ctx, px, line) }
  DZ.skinSh = (skin) => DZ.mix(skin, '#b5686a', 0.34);
  DZ.skinLn = (skin) => DZ.mix(DZ.ln(skin), '#4a1f22', 0.45);
  DZ.head = (ctx, F, x, y, L) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(L, L);
    const px = (v) => (v * DZ.k) / L; // screen px → local units
    const skin = F.skin, sh = F.skinSh || DZ.skinSh(skin), line = F.skinLn || DZ.skinLn(skin);
    const S = Object.assign({ t: [0.39, 0.4], c: [0.38, 0.58], j: [0.29, 0.82], ch: [0.1, 0.965] }, F.shape || {});
    const cb = S.cb || 0;
    // ears
    const E = Object.assign({ y: 0.49, h: 0.2, w: 0.07 }, F.ear || {});
    if (!F.noEars) for (const sx of [-1, 1]) {
      const ex = S.t[0] * 0.97;
      const ear = sp([[sx * (ex - 0.03), E.y + 0.01], [sx * (ex + E.w * 0.8), E.y - 0.012], [sx * (ex + E.w * 1.05), E.y + E.h * 0.35], [sx * (ex + E.w * 0.6), E.y + E.h * 0.85], [sx * (ex + E.w * 0.05), E.y + E.h], [sx * (ex - 0.03), E.y + E.h * 0.9]]);
      DZ.cel(ctx, ear, { c: skin, s: 0.015, sd: [sx, 0.3], sh, h: 0, rim: 0, lw: 1.3 / L, ln: line });
      ctx.lineWidth = px(1); ctx.strokeStyle = DZ.rgba(line, 0.6); ctx.lineCap = 'round';
      ctx.stroke(sp([[sx * (ex + E.w * 0.45), E.y + E.h * 0.12], [sx * (ex + E.w * 0.65), E.y + E.h * 0.42], [sx * (ex + E.w * 0.3), E.y + E.h * 0.72]], false));
      if (F.earring) F.earring(ctx, sx * (ex + E.w * 0.35), E.y + E.h * 0.98, sx);
    }
    // face outline
    const half = [[0, -0.005], [0.22, 0.03], [0.36, 0.17], [S.t[0], S.t[1]], [S.c[0] + cb, S.c[1]], [S.j[0], S.j[1]], [S.ch[0], S.ch[1]], [S.ch[0] * 0.45, (S.chY || 0.995)], [0, S.chY || 1]];
    if (S.mid) half.splice(5, 0, S.mid);
    const facePath = DZ.sym(0, half);
    DZ.face = facePath;
    DZ.cel(ctx, facePath, {
      c: skin, s: 0.032, sd: [1, 0.1], sh, h: 0, rim: 0.012, rimC: '#fff1e6', lw: 1.7 / L, ln: line,
      fx: (c) => {
        // chin / jaw underside shadow
        c.fillStyle = DZ.rgba(sh, 0.6);
        c.fill(sp([[S.j[0] * 0.55, S.j[1] + 0.07], [S.ch[0] * 0.9, 0.975], [S.ch[0] * 0.2, 1.02], [S.j[0] * 1.05, 1.05], [S.j[0] * 1.05, S.j[1] - 0.02]]));
        // cheek plane on shaded side
        c.fillStyle = DZ.rgba(sh, 0.45);
        c.fill(sp([[S.c[0] + cb + 0.01, S.c[1] - 0.06], [S.c[0] - 0.06, S.c[1] + 0.04], [S.j[0] - 0.03, S.j[1] - 0.02], [S.j[0] + 0.03, S.j[1] + 0.02], [S.c[0] + cb + 0.03, S.c[1] + 0.05]]));
        if (F.age && F.age.hollow) {
          c.fillStyle = DZ.rgba(sh, 0.5 * F.age.hollow);
          for (const sx of [-1, 1]) c.fill(sp([[sx * (S.c[0] - 0.03), 0.6], [sx * (S.c[0] - 0.12), 0.67], [sx * (S.j[0] - 0.05), 0.82], [sx * (S.c[0] - 0.015), 0.76]]));
        }
        const bl = F.blush || DZ.mix(skin, '#e07a70', 0.6), ba = F.blushA === undefined ? 0.22 : F.blushA;
        for (const sx of [-1, 1]) { const g = c.createRadialGradient(sx * 0.2, 0.67, 0, sx * 0.2, 0.67, 0.1); g.addColorStop(0, DZ.rgba(bl, ba)); g.addColorStop(1, DZ.rgba(bl, 0)); c.fillStyle = g; c.fillRect(-0.5, 0.4, 1, 0.5); }
        if (F.stub) { c.fillStyle = DZ.rgba(F.stubC || '#3a3a48', F.stub); c.fill(sp([[-S.j[0] * 0.98, S.j[1] - 0.08], [-0.14, 0.82], [-0.06, 0.79], [0, 0.8], [0.06, 0.79], [0.14, 0.82], [S.j[0] * 0.98, S.j[1] - 0.08], [S.j[0] * 0.8, S.j[1] + 0.06], [S.ch[0] + 0.02, 0.99], [0, 1.0], [-S.ch[0] - 0.02, 0.99], [-S.j[0] * 0.8, S.j[1] + 0.06]])); }
        if (F.paint) F.paint(c, px, line, sh);
      },
    });
    // features
    const eye = Object.assign({ x: 0.165, y: 0.54, w: 0.165, h: 0.062, tilt: 0.04, iris: '#3b2618', ir: 0.04, open: 1, crease: 0.5, creaseH: 1.25, lash: 1, peak: 0.45, low: 0.5, gaze: 0, bag: 0, lidW: 0.024 }, F.eye || {});
    const brow = Object.assign({ x: 0.17, y: 0.44, w: 0.18, th: 0.024, tilt: 0.04, arch: 0.012, col: '#1c1820', type: 'std' }, F.brow || {});
    for (const sx of [-1, 1]) {
      const e = Object.assign({}, eye, sx < 0 ? F.eyeL || {} : F.eyeR || {});
      const b = Object.assign({}, brow, sx < 0 ? F.browL || {} : F.browR || {});
      drawEye(ctx, sx, e, F, px, line, sh);
      drawBrow(ctx, sx, b, px);
    }
    drawNose(ctx, Object.assign({ y: 0.72, w: 0.05, type: 'soft' }, F.nose || {}), F, px, line, sh);
    drawMouth(ctx, Object.assign({ y: 0.84, w: 0.13, type: 'neutral' }, F.mouth || {}), F, px, line, sh);
    if (F.age) drawAge(ctx, F.age, eye, S, px, line);
    if (F.extra) F.extra(ctx, px, line, sh);
    ctx.restore();
  };

  function drawEye(ctx, sx, e, F, px, line, sh) {
    ctx.save(); ctx.scale(sx, 1);
    const cx = e.x, cy = e.y, w = e.w, h = e.h, tl = e.tilt;
    const I = [cx - w / 2, cy + h * 0.15], O = [cx + w / 2, cy - tl * w + h * 0.02];
    const op = e.open;
    if (e.closed) { // closed lids: blink / happy arc / pained
      const Ic = [cx - w / 2, cy + h * 0.15], Oc = [cx + w / 2, cy - tl * w + h * 0.02];
      const my = e.closed === 'happy' ? cy - h * 0.55 : cy + h * 0.35;
      ctx.lineWidth = px(2.4); ctx.lineCap = 'round'; ctx.strokeStyle = line;
      ctx.stroke(sp([Ic, [cx - w * 0.05, my], [cx + w * 0.25, my + (e.closed === 'happy' ? 0 : -h * 0.08)], Oc], false));
      ctx.restore(); return;
    }
    const peakX = cx - w / 2 + w * e.peak;
    const upTop = cy - h * op;
    const up = [I, [cx - w * 0.3, cy - h * 0.6 * op], [peakX, upTop], [cx + w * 0.3, cy - h * 0.8 * op - tl * w * 0.45], O];
    const lowY = cy + h * e.low;
    const lo = [O, [cx + w * 0.22, lowY - tl * w * 0.25], [cx - w * 0.1, lowY + h * 0.02], [cx - w * 0.36, cy + h * 0.42], I];
    const white = sp(up.concat(lo.slice(1, -1)), true, 0.9);
    if (e.possessed) {
      ctx.fillStyle = e.voidC || '#0a1216'; ctx.fill(white);
      ctx.save(); ctx.clip(white);
      DZ.glow(ctx, cx, cy, w * 0.8, e.possessed, 1);
      ctx.fillStyle = DZ.lt(e.possessed, 0.75); ctx.beginPath(); ctx.ellipse(cx + e.gaze * w, cy + h * 0.05, w * 0.12, h * 0.55, 0, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = e.white || '#f7f2ec'; ctx.fill(white);
      ctx.save(); ctx.clip(white);
      const ix = cx + e.gaze * w, iy = cy + h * (e.irisY !== undefined ? e.irisY : 0.1), r = e.ir;
      const g = ctx.createLinearGradient(0, iy - r, 0, iy + r);
      g.addColorStop(0, DZ.dk(e.iris, 0.6)); g.addColorStop(0.5, e.iris); g.addColorStop(1, DZ.lt(e.iris, 0.45));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ix, iy, r, r * 1.08, 0, 0, 7); ctx.fill();
      ctx.lineWidth = px(1); ctx.strokeStyle = DZ.dk(e.iris, 0.65); ctx.stroke();
      ctx.fillStyle = e.pupil || '#0d0a0c'; ctx.beginPath(); ctx.ellipse(ix, iy + r * 0.05, r * (e.pupilR || 0.42), r * (e.pupilR || 0.42) * 1.12, 0, 0, 7); ctx.fill();
      // upper-lid cast shadow on the eyeball
      ctx.fillStyle = 'rgba(60,30,50,0.32)';
      ctx.fill(sp([[I[0] - 0.02, I[1] - 0.01], [cx - w * 0.3, cy - h * 0.6 * op - 0.01], [peakX, upTop - 0.01], [O[0] + 0.02, O[1] - 0.01], [O[0], O[1] + h * 0.3], [cx, upTop + h * 0.45], [I[0], I[1] + h * 0.1]]));
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(ix + r * 0.38, iy - r * 0.3, r * 0.26, r * 0.22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(ix - r * 0.38, iy + r * 0.5, r * 0.13, 0, 7); ctx.fill();
      ctx.restore();
    }
    // upper lash mass: filled, thin at inner corner, heavy at the outer third, small wing
    const lw = e.lidW * (e.lash ? 1 : 0.75), lc = e.lashC || '#17111a';
    const wing = e.lash ? [O[0] + w * 0.1, O[1] - h * 0.25 - tl * w * 0.2] : [O[0] + w * 0.02, O[1]];
    const topEdge = [[I[0] - 0.004, I[1] - lw * 0.2], [up[1][0], up[1][1] - lw * 0.55], [up[2][0], up[2][1] - lw * 0.95], [up[3][0], up[3][1] - lw * 1.15], [wing[0], wing[1] - lw * 0.15]];
    const botEdge = [[O[0] + w * 0.01, O[1] + lw * 0.25], up[3], up[2], up[1], [I[0] + 0.004, I[1] + lw * 0.15]];
    ctx.fillStyle = lc; ctx.fill(sp(topEdge.concat([[wing[0], wing[1], 1]]).concat(botEdge), true, 0.8));
    // lower lid line (outer 2/3) + inner corner
    ctx.lineWidth = px(1.05); ctx.strokeStyle = DZ.rgba(line, 0.8); ctx.lineCap = 'round';
    ctx.stroke(sp([[O[0] - w * 0.03, O[1] + h * 0.22], lo[1], lo[2]], false));
    ctx.fillStyle = DZ.rgba(DZ.mix(F.skin, '#c86a6a', 0.5), 0.8); ctx.beginPath(); ctx.ellipse(I[0] + 0.006, I[1] + 0.002, 0.008, 0.006, 0, 0, 7); ctx.fill();
    if (e.crease) {
      const cy2 = cy - h * e.creaseH * Math.max(0.75, op);
      ctx.lineWidth = px(1); ctx.strokeStyle = DZ.rgba(line, e.crease);
      ctx.stroke(sp([[cx - w * 0.22, cy2 + h * 0.4], [cx + w * 0.08, cy2], [cx + w * 0.46, cy2 + h * 0.2 - tl * w * 0.4]], false));
    }
    if (e.bag) {
      ctx.lineWidth = px(1); ctx.strokeStyle = DZ.rgba(line, 0.4 * e.bag);
      ctx.stroke(sp([[cx - w * 0.3, cy + h * 1.0], [cx + w * 0.05, cy + h * 1.25], [cx + w * 0.38, cy + h * 0.95]], false));
    }
    ctx.restore();
  }

  function drawBrow(ctx, sx, b, px) {
    ctx.save(); ctx.scale(sx, 1);
    const x0 = b.x - b.w * 0.48, x1 = b.x + b.w * 0.52;
    const y0 = b.y + b.tilt * b.w * 0.5, y1 = b.y - b.tilt * b.w * 0.5;
    if (b.type === 'long') {
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        DZ.tp(ctx, [[x0 + t * (x1 - x0) * 0.6, y0 + t * (y1 - y0) * 0.6 + 0.004], [x0 + t * (x1 - x0) * 0.75 + 0.05, y0 - b.arch + t * (y1 - y0)], [x1 + 0.03 + t * 0.04 + (b.reach || 0), y1 + (b.droop || 0) + t * 0.025]], b.th * 0.6, 0.002, i % 3 === 1 ? DZ.lt(b.col, 0.25) : b.col);
      }
    } else if (b.type === 'bushy') {
      DZ.tp(ctx, [[x0, y0 + 0.008], [(x0 + x1) / 2, (y0 + y1) / 2 - b.arch], [x1, y1]], b.th * 1.1, b.th * 0.5, b.col, b.th * 1.35);
      for (let i = 0; i < 7; i++) { const t = i / 6; DZ.tp(ctx, [[x0 + t * (x1 - x0), y0 + t * (y1 - y0) + 0.01], [x0 + t * (x1 - x0) + 0.025, y0 + t * (y1 - y0) - b.arch - 0.014]], 0.007, 0.001, b.col); }
    } else {
      const sharp = b.type === 'sharp';
      DZ.tp(ctx, [[x0, y0 + (sharp ? 0.006 : 0)], [(x0 + x1) / 2 - 0.01, (y0 + y1) / 2 - b.arch], [x1, y1 + (sharp ? -0.004 : 0.006)]], b.th * 1.1, b.th * (sharp ? 0.1 : 0.3), b.col, b.th);
    }
    ctx.restore();
  }

  function drawNose(ctx, n, F, px, line, sh) {
    const y = n.y, w = n.w;
    const st = n.type === 'strong' || n.type === 'broad';
    // bridge (shaded side)
    if (n.type !== 'soft') {
      ctx.fillStyle = DZ.rgba(sh, st ? 0.55 : 0.35);
      ctx.fill(sp([[0.03, 0.56], [0.045, 0.62], [0.05, y - 0.05], [0.03, y - 0.03], [0.022, 0.62]]));
      ctx.lineWidth = px(1); ctx.strokeStyle = DZ.rgba(line, st ? 0.55 : 0.35); ctx.lineCap = 'round';
      ctx.stroke(sp([[0.032, 0.58], [0.04, y - 0.07], [0.042, y - 0.035]], false));
    }
    // drop shadow under the tip (light from upper-left)
    ctx.fillStyle = DZ.rgba(sh, 0.8);
    ctx.fill(sp([[-w * 0.2, y + 0.016], [w * 0.6, y + 0.006], [w * 1.0, y - 0.03], [w * 0.75, y + 0.024], [w * 0.1, y + 0.03]]));
    ctx.lineWidth = px(1.1); ctx.strokeStyle = DZ.rgba(line, 0.75); ctx.lineCap = 'round';
    for (const s2 of [-1, 1]) ctx.stroke(sp([[s2 * w * (st ? 1.05 : 0.85), y - 0.012], [s2 * w * (st ? 0.9 : 0.7), y + 0.008], [s2 * w * 0.35, y + 0.013]], false));
    ctx.fillStyle = DZ.rgba(DZ.lt(F.skin, 0.7), 0.85); ctx.beginPath(); ctx.ellipse(-0.008, y - 0.022, 0.011, 0.007, 0, 0, 7); ctx.fill();
  }

  function drawMouth(ctx, m, F, px, line, sh) {
    const y = m.y, w = m.w;
    const col = m.lc || DZ.mix(line, '#7a2f35', 0.35);
    let pts;
    switch (m.type) {
      case 'smirk': pts = [[-w / 2, y + 0.004], [-w * 0.1, y + 0.009], [w * 0.25, y + 0.002], [w / 2 + 0.008, y - 0.02]]; break;
      case 'smile': pts = [[-w / 2, y - 0.014], [-w * 0.2, y + 0.008], [w * 0.2, y + 0.008], [w / 2, y - 0.014]]; break;
      case 'frown': pts = [[-w / 2, y + 0.012], [0, y - 0.004], [w / 2, y + 0.012]]; break;
      case 'grim': pts = [[-w / 2, y + 0.006], [-w * 0.2, y], [w * 0.2, y], [w / 2, y + 0.006]]; break;
      default: pts = [[-w / 2, y + 0.002], [-w * 0.15, y + 0.006], [w * 0.15, y + 0.006], [w / 2, y + 0.002]];
    }
    if (m.type === 'open' || m.type === 'grin' || m.type === 'shout') {
      const oh = m.oh || 0.05;
      const mp = sp([[-w / 2, y - 0.008], [0, y - 0.002], [w / 2, y - 0.008], [w * 0.3, y + oh * 0.8], [0, y + oh], [-w * 0.3, y + oh * 0.8]]);
      ctx.fillStyle = '#4a1e24'; ctx.fill(mp);
      ctx.save(); ctx.clip(mp);
      if (m.type !== 'shout') { ctx.fillStyle = '#f4ece6'; ctx.fillRect(-w / 2, y - 0.012, w, oh * (m.type === 'grin' ? 0.5 : 0.3)); }
      ctx.fillStyle = '#b85a5e'; ctx.beginPath(); ctx.ellipse(0, y + oh, w * 0.28, oh * 0.4, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.lineWidth = px(1.2); ctx.strokeStyle = col; ctx.stroke(mp);
    } else {
      DZ.tp(ctx, pts, 0.004, 0.005, col, 0.011);
      if (m.type === 'smirk') { ctx.lineWidth = px(1); ctx.strokeStyle = DZ.rgba(col, 0.6); ctx.stroke(sp([[w / 2 + 0.01, y - 0.034], [w / 2 + 0.02, y - 0.018], [w / 2 + 0.012, y - 0.004]], false)); }
      ctx.fillStyle = DZ.rgba(sh, 0.7); ctx.beginPath(); ctx.ellipse(0.004, y + 0.034, w * 0.2, 0.009, 0, 0, 7); ctx.fill();
      if (m.lip) { ctx.fillStyle = DZ.rgba(m.lip, 0.45); ctx.beginPath(); ctx.ellipse(0, y + 0.016, w * 0.3, 0.012, 0, 0, 7); ctx.fill(); }
    }
  }

  function drawAge(ctx, a, eye, S, px, line) {
    ctx.lineCap = 'round';
    const al = (v) => DZ.rgba(line, v);
    if (a.naso) for (const sx of [-1, 1]) { ctx.lineWidth = px(1.15); ctx.strokeStyle = al(0.5 * a.naso); ctx.stroke(sp([[sx * 0.07, 0.69], [sx * 0.125, 0.77], [sx * 0.125, 0.87]], false)); }
    if (a.crow) for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.lineWidth = px(0.95); ctx.strokeStyle = al(0.4 * a.crow); const x0 = sx * (eye.x + eye.w * 0.58); ctx.stroke(sp([[x0, eye.y - 0.012 + i * 0.022], [x0 + sx * 0.045, eye.y - 0.03 + i * 0.032]], false)); }
    if (a.fore) for (let i = 0; i < 3; i++) { ctx.lineWidth = px(0.95); ctx.strokeStyle = al(0.35 * a.fore); ctx.stroke(sp([[-0.14 + i * 0.012, 0.3 + i * 0.032], [0, 0.29 + i * 0.032 - 0.006], [0.14 - i * 0.012, 0.3 + i * 0.032]], false)); }
    if (a.jowl) for (const sx of [-1, 1]) { ctx.lineWidth = px(1); ctx.strokeStyle = al(0.4 * a.jowl); ctx.stroke(sp([[sx * 0.15, 0.89], [sx * 0.2, 0.9], [sx * 0.245, 0.86]], false)); }
    if (a.spots) { ctx.fillStyle = DZ.rgba('#8a6048', 0.3); [[-0.25, 0.36], [0.22, 0.33], [0.27, 0.62]].forEach((q) => { ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.014, 0.01, 0, 0, 7); ctx.fill(); }); }
  }

  // ------------------------------------------------------------ hands
  // (x,y) wrist centre, ang: direction wrist→fingertips (rad, 0 = straight down), s: hand length (px),
  // mir: ±1 (thumb on local +x when 1), pose: relax | fist | mudra | open | pinch
  function capsule(pts, w0, w1) {
    const d = dense(pts, 6), n = d.length, Lp = [], Rp = [];
    for (let i = 0; i < n; i++) {
      const a = d[Math.max(0, i - 1)], b = d[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const w = (w0 + (w1 - w0) * i / (n - 1)) / 2;
      Lp.push([d[i][0] - dy * w, d[i][1] + dx * w]); Rp.push([d[i][0] + dy * w, d[i][1] - dx * w]);
    }
    const t = d[n - 1], a = d[n - 2]; const ang = Math.atan2(t[1] - a[1], t[0] - a[0]);
    const cap = []; for (let k = 1; k < 8; k++) { const th = ang + Math.PI / 2 - (k / 8) * Math.PI; cap.push([t[0] + Math.cos(th) * w1 / 2, t[1] + Math.sin(th) * w1 / 2]); }
    return DZ.poly(Lp.concat(cap, Rp.reverse()));
  }
  DZ.capsule = capsule;
  DZ.hand = (ctx, x, y, ang, s, pose, mir, skin, o = {}) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s * mir, s);
    const sh = DZ.skinSh(skin), line = DZ.skinLn(skin);
    const lw = 1.35 / s;
    const C = (path, ex = {}) => DZ.cel(ctx, path, Object.assign({ c: skin, s: 0.045, sd: [-0.7, 0.7], sh, h: 0, rim: 0, lw, ln: line }, ex));
    const F = (pts, w0, w1, ex) => C(capsule(pts, w0, w1 || w0 * 0.85), ex);
    const fl = (pts, a = 0.55) => { if (DZ.sil) return; ctx.lineWidth = lw * 0.8 * DZ.k; ctx.strokeStyle = DZ.rgba(line, a); ctx.lineCap = 'round'; ctx.stroke(sp(pts, false)); };
    if (pose === 'relax') {
      F([[-0.115, 0.4], [-0.13, 0.57], [-0.115, 0.69]], 0.07);
      F([[-0.045, 0.42], [-0.055, 0.63], [-0.035, 0.79]], 0.076);
      F([[0.025, 0.43], [0.03, 0.66], [0.055, 0.84]], 0.08);
      F([[0.09, 0.41], [0.11, 0.6], [0.115, 0.76]], 0.078);
      C(sp([[-0.12, -0.02], [0.11, -0.02], [0.13, 0.2], [0.125, 0.42], [0.05, 0.47], [-0.05, 0.47], [-0.145, 0.42], [-0.15, 0.2]]));
      fl([[-0.12, 0.36], [-0.02, 0.4], [0.1, 0.37]], 0.35);
      F([[0.08, 0.08], [0.16, 0.24], [0.18, 0.4], [0.155, 0.52]], 0.095, 0.075);
    } else if (pose === 'fist') {
      C(sp([[-0.14, -0.02], [0.12, -0.02], [0.16, 0.2], [0.165, 0.42], [-0.16, 0.44], [-0.17, 0.2]]));
      F([[-0.125, 0.4], [-0.13, 0.52], [-0.09, 0.57]], 0.088, 0.08);
      F([[-0.045, 0.41], [-0.045, 0.55], [-0.0, 0.6]], 0.092, 0.084);
      F([[0.035, 0.41], [0.04, 0.55], [0.08, 0.6]], 0.092, 0.084);
      F([[0.115, 0.4], [0.125, 0.52], [0.15, 0.56]], 0.088, 0.08);
      F([[0.12, 0.12], [0.2, 0.3], [0.16, 0.48], [0.05, 0.55]], 0.1, 0.085);
    } else if (pose === 'mudra' || pose === 'pinch') {
      const sp2 = pose === 'pinch' ? 0.025 : 0;
      F([[0.02 - sp2, 0.42], [0.025 - sp2 * 2, 0.72], [0.025 - sp2 * 3, 1.0]], 0.082, 0.072);
      F([[0.1 + sp2, 0.41], [0.11 + sp2 * 2, 0.7], [0.11 + sp2 * 3, 0.95]], 0.08, 0.07);
      C(sp([[-0.14, -0.02], [0.12, -0.02], [0.15, 0.2], [0.15, 0.43], [-0.15, 0.45], [-0.17, 0.2]]));
      F([[-0.12, 0.4], [-0.13, 0.54], [-0.08, 0.6]], 0.08);
      F([[-0.05, 0.42], [-0.05, 0.57], [-0.0, 0.63]], 0.082);
      F([[0.12, 0.12], [0.18, 0.3], [0.08, 0.5], [-0.04, 0.55]], 0.1, 0.085);
    } else if (pose === 'open') {
      F([[-0.12, 0.42], [-0.16, 0.6], [-0.18, 0.73]], 0.07);
      F([[-0.045, 0.44], [-0.06, 0.7], [-0.065, 0.88]], 0.077);
      F([[0.03, 0.45], [0.035, 0.73], [0.04, 0.93]], 0.08);
      F([[0.1, 0.43], [0.125, 0.67], [0.135, 0.85]], 0.078);
      C(sp([[-0.13, -0.02], [0.11, -0.02], [0.14, 0.2], [0.14, 0.44], [0.05, 0.49], [-0.06, 0.49], [-0.15, 0.44], [-0.16, 0.2]]));
      fl([[-0.08, 0.15], [-0.02, 0.3], [0.08, 0.38]], 0.35);
      F([[0.09, 0.08], [0.2, 0.22], [0.27, 0.35], [0.3, 0.46]], 0.1, 0.075);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------ motifs & props
  DZ.taiji = (ctx, x, y, r, a = '#f3efe4', b = '#1d1b22', rot = 0) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = a; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); ctx.arc(0, r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); ctx.arc(0, -r / 2, r / 2, Math.PI / 2, -Math.PI / 2); ctx.fill();
    ctx.fillStyle = a; ctx.beginPath(); ctx.arc(0, -r / 2, r / 7, 0, 7); ctx.fill();
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(0, r / 2, r / 7, 0, 7); ctx.fill();
    ctx.lineWidth = Math.max(0.8, r * 0.08) * DZ.k; ctx.strokeStyle = DZ.ln(b === '#1d1b22' ? '#888888' : b); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.restore();
  };
  // 八卦 ring of trigrams (先天 order) around radius r
  DZ.bagua = (ctx, x, y, r, col, lw = 2, rot = 0) => {
    const tri = ['111', '011', '101', '001', '110', '010', '100', '000']; // 乾兌離震巽坎艮坤 (bottom line first)
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'butt';
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 4);
      for (let j = 0; j < 3; j++) {
        const rr = r + j * lw * 1.8, half = rr * 0.33;
        ctx.beginPath();
        if (tri[i][j] === '1') { ctx.moveTo(-half, -rr); ctx.lineTo(half, -rr); }
        else { ctx.moveTo(-half, -rr); ctx.lineTo(-half * 0.2, -rr); ctx.moveTo(half * 0.2, -rr); ctx.lineTo(half, -rr); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  };
  // 雲紋 cloud scroll
  DZ.cloud = (ctx, x, y, s, col, lw = 1.2, flip = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s); ctx.strokeStyle = col; ctx.lineWidth = (lw * DZ.k) / s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, 0.5, Math.PI * 0.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.05, 0.08, 0.22, Math.PI * 1.2, Math.PI * 0.6, true); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.48, 0.15); ctx.bezierCurveTo(0.9, 0.5, 1.3, 0.1, 1.6, 0.35); ctx.stroke();
    ctx.beginPath(); ctx.arc(1.2, -0.05, 0.32, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    ctx.restore();
  };
  // 雷紋 thunder meander band (square spirals) along x from x0 to x1 at y, unit s
  DZ.meander = (ctx, x0, x1, y, s, col, lw = 1.2) => {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw * DZ.k; ctx.lineJoin = 'miter'; ctx.lineCap = 'square';
    for (let x = x0; x + s <= x1 + 0.01; x += s) {
      const a = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(x + a, y + s / 2 - a); ctx.lineTo(x + a, y - s / 2 + a); ctx.lineTo(x + s - a, y - s / 2 + a); ctx.lineTo(x + s - a, y + s / 2 - a);
      ctx.lineTo(x + s * 0.32, y + s / 2 - a); ctx.lineTo(x + s * 0.32, y - s * 0.12); ctx.lineTo(x + s * 0.62, y - s * 0.12); ctx.lineTo(x + s * 0.62, y + s * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  };
  // talisman 符: yellow paper with vermilion script, w×h, rotated
  DZ.fu = (ctx, x, y, w, h, ang = 0, o = {}) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const paper = o.paper || '#e8c65a', ink = o.ink || '#b3261e';
    const p = DZ.poly([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
    DZ.cel(ctx, p, { c: paper, s: Math.min(w, h) * 0.12, h: 0, rim: 0, lw: 1.1, ln: DZ.dk(paper, 0.55) });
    if (!DZ.sil) {
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(0.7, w * 0.07) * DZ.k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-w * 0.25, -h * 0.36); ctx.lineTo(w * 0.25, -h * 0.36); ctx.stroke(); // 敕
      ctx.beginPath(); ctx.moveTo(0, -h * 0.3);
      for (let i = 0; i < 5; i++) ctx.quadraticCurveTo((i % 2 ? -1 : 1) * w * 0.3, -h * 0.22 + i * h * 0.12, 0, -h * 0.16 + i * h * 0.12);
      ctx.stroke();
      ctx.fillStyle = DZ.rgba(ink, 0.85); ctx.fillRect(-w * 0.17, h * 0.3, w * 0.34, h * 0.12); // seal
    }
    ctx.restore();
  };
  // gourd 葫蘆 hanging, top at (x,y), height h
  DZ.gourd = (ctx, x, y, h, c = '#c98f3e', cord = '#b0302a', ang = 0) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const p = sp([[0, 0.06 * h], [0.1 * h, 0.12 * h], [0.15 * h, 0.27 * h], [0.09 * h, 0.4 * h], [0.24 * h, 0.58 * h], [0.25 * h, 0.82 * h], [0, h], [-0.25 * h, 0.82 * h], [-0.24 * h, 0.58 * h], [-0.09 * h, 0.4 * h], [-0.15 * h, 0.27 * h], [-0.1 * h, 0.12 * h]]);
    DZ.cel(ctx, p, { c, s: h * 0.09, h: h * 0.03, rim: h * 0.025, lw: 1.6 });
    DZ.cel(ctx, DZ.poly([[-0.05 * h, -0.04 * h], [0.05 * h, -0.04 * h], [0.06 * h, 0.08 * h], [-0.06 * h, 0.08 * h]]), { c: '#6e4a2c', s: 1, h: 0, rim: 0, lw: 1.2 });
    if (!DZ.sil) { ctx.fillStyle = cord; ctx.fillRect(-0.11 * h, 0.37 * h, 0.22 * h, 0.05 * h); }
    ctx.restore();
  };
  // folding fan 摺扇. mode 'open' (centre pivot at (x,y), opening toward ang, radius r) or 'closed'
  DZ.fan = (ctx, x, y, r, ang, o = {}) => {
    const leaf = o.leaf || '#efe6cf', rib = o.rib || '#5a3a24', spread = o.spread || 1.9;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (o.closed) {
      const p = DZ.poly([[-r * 0.05, 0], [r * 0.05, 0], [r * 0.09, -r], [-r * 0.09, -r]]);
      DZ.cel(ctx, p, { c: rib, s: r * 0.04, h: 0, rim: 1, lw: 1.5 });
      if (!DZ.sil) { ctx.strokeStyle = DZ.lt(rib, 0.3); ctx.lineWidth = 0.8 * DZ.k; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, -r * 0.1); ctx.lineTo((i - 2) * r * 0.04, -r * 0.98); ctx.stroke(); } }
      ctx.restore(); return;
    }
    const a0 = -Math.PI / 2 - spread / 2, a1 = -Math.PI / 2 + spread / 2, ri = r * 0.38;
    const p = new Path2D(); p.arc(0, 0, r, a0, a1); p.arc(0, 0, ri, a1, a0, true); p.closePath();
    const n = o.folds || 14;
    DZ.cel(ctx, p, {
      c: leaf, s: 0, h: 0, rim: 0, lw: 1.6, ln: o.ln || DZ.dk(rib, 0.1),
      fx: (c) => {
        for (let i = 0; i < n; i++) { // alternating pleat shading
          if (i % 2) continue;
          const b0 = a0 + (a1 - a0) * i / n, b1 = a0 + (a1 - a0) * (i + 1) / n;
          c.fillStyle = DZ.rgba(DZ.dk(leaf, 0.3), 0.35); c.beginPath(); c.moveTo(Math.cos(b0) * ri, Math.sin(b0) * ri); c.lineTo(Math.cos(b0) * r, Math.sin(b0) * r); c.lineTo(Math.cos(b1) * r, Math.sin(b1) * r); c.lineTo(Math.cos(b1) * ri, Math.sin(b1) * ri); c.fill();
        }
        if (o.paint) o.paint(c, r, ri, a0, a1);
      },
    });
    if (!DZ.sil) {
      ctx.strokeStyle = DZ.rgba(rib, 0.9); ctx.lineWidth = 1 * DZ.k;
      for (let i = 0; i <= n; i++) { const b = a0 + (a1 - a0) * i / n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(b) * ri, Math.sin(b) * ri); ctx.stroke(); }
    }
    for (const b of [a0, a1]) { // guard sticks
      const g = DZ.poly([[0, 0], [Math.cos(b - 0.03) * r * 1.02, Math.sin(b - 0.03) * r * 1.02], [Math.cos(b + 0.03) * r * 1.02, Math.sin(b + 0.03) * r * 1.02]]);
      DZ.cel(ctx, g, { c: rib, s: 0, h: 0, rim: 0, lw: 1.2 });
    }
    ctx.fillStyle = '#c9a54a'; ctx.beginPath(); ctx.arc(0, 0, Math.max(1.5, r * 0.05), 0, 7); ctx.fill();
    ctx.restore();
  };
  // 拂塵 horsetail whisk: handle from (x,y) along ang (rad, 0 = down), handle length hl, hair length tl, sway
  DZ.whisk = (ctx, x, y, ang, hl, tl, o = {}) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const wood = o.wood || '#7a4a26', hair = o.hair || '#efeae0';
    const sw = o.sway || 0.25;
    // hair tail (from end of handle downward)
    const top = hl, w = tl * 0.16;
    const tail = sp([[-w * 0.35, top], [-w * 0.9, top + tl * 0.3], [-w * 0.6 + sw * tl * 0.3, top + tl * 0.7], [sw * tl * 0.6, top + tl], [w * 0.5 + sw * tl * 0.4, top + tl * 0.7], [w * 0.9, top + tl * 0.3], [w * 0.35, top]]);
    DZ.cel(ctx, tail, {
      c: hair, s: w * 0.35, h: 0, rim: 1.5, lw: 1.4, ln: o.hairLn || DZ.dk(hair, 0.5),
      fx: (c) => { if (DZ.sil) return; for (let i = 0; i < 9; i++) { const t = i / 8 - 0.5; DZ.tp(c, [[t * w * 0.6, top + 2], [t * w * 1.2 + sw * tl * 0.2, top + tl * 0.5], [t * w * 0.5 + sw * tl * 0.55, top + tl * 0.95]], 0.9, 0.3, DZ.rgba(DZ.dk(hair, 0.35), 0.5)); } },
    });
    // handle
    const h = DZ.poly([[-hl * 0.045, 0], [hl * 0.045, 0], [hl * 0.06, hl], [-hl * 0.06, hl]]);
    DZ.cel(ctx, h, { c: wood, s: hl * 0.03, h: 0, rim: 1, lw: 1.4 });
    DZ.cel(ctx, DZ.ell(0, 0, hl * 0.07, hl * 0.04), { c: '#c9a54a', s: 1, h: 0, rim: 0, lw: 1 });
    DZ.cel(ctx, DZ.poly([[-hl * 0.08, hl - 2], [hl * 0.08, hl - 2], [hl * 0.07, hl + hl * 0.08], [-hl * 0.07, hl + hl * 0.08]]), { c: '#c9a54a', s: 1, h: 0, rim: 0, lw: 1 });
    if (o.tassel) { ctx.strokeStyle = o.tassel; ctx.lineWidth = 1.4 * DZ.k; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-hl * 0.15, -hl * 0.15, -hl * 0.05, -hl * 0.3); ctx.stroke(); }
    ctx.restore();
  };
  // square seal stamp
  DZ.seal = (ctx, x, y, s, txt, col = '#b3261e') => {
    ctx.save(); ctx.fillStyle = col; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#f3e9d6'; ctx.font = DZ.font(s * 0.42, 700, 'serif'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (txt.length === 4) { ctx.fillText(txt[0], x + s * 0.72, y + s * 0.28); ctx.fillText(txt[1], x + s * 0.72, y + s * 0.72); ctx.fillText(txt[2], x + s * 0.28, y + s * 0.28); ctx.fillText(txt[3], x + s * 0.28, y + s * 0.72); }
    else { ctx.font = DZ.font(s * 0.6, 700, 'serif'); ctx.fillText(txt, x + s / 2, y + s / 2 + 1); }
    ctx.restore();
  };

  // ------------------------------------------------------------ figure → silhouette
  // render fn(ctx) into an offscreen canvas and return a solid-colour silhouette canvas
  DZ.silhouette = (w, h, fn, col = '#15131a', mirror = false) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    if (mirror) { c.translate(w, 0); c.scale(-1, 1); }
    const prev = DZ.sil; DZ.sil = true; fn(c); DZ.sil = prev;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, w, h);
    return cv;
  };
})();
