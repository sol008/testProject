// 彼岸燈 Shorelight — character design pass v2
// Shared drawing kit for the 墨鴉 (moya) and 藤婆 (tengpo) turnaround sheets.
// Canvas-2D only, no external images. Exposes window.K.
(function (G) {
  'use strict';
  const K = (G.K = {});
  K.lineScale = 1; // multiplies outline widths (sheet uses 1; zoomed renders lower it)

  // ------------------------------------------------------------------ math / rng
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  K.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  // ------------------------------------------------------------------ colour
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
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
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  K.hex2rgb = hex2rgb;
  K.mix = (a, b, t) => {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  K.adj = (hex, dh, ds, dl) => {
    const [h, s, l] = rgb2hsl(...hex2rgb(hex));
    return rgb2hex(...hsl2rgb(h + (dh || 0), K.clamp(s + (ds || 0), 0, 1), K.clamp(l + (dl || 0), 0, 1)));
  };
  // line colour: a dark, slightly warmer/more saturated hue of the fill
  K.ink = (hex, k) => {
    const [h, s, l] = rgb2hsl(...hex2rgb(hex));
    k = k == null ? 0.42 : k;
    return rgb2hex(...hsl2rgb(h - 8, Math.min(1, s * 1.05 + 0.08), l * k));
  };
  K.rgba = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  K.lum = (hex) => { const [r, g, b] = hex2rgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

  // material helper: base + toon shadow (hue-shifted cool) + highlight + line
  K.mat = (base, o) => {
    o = o || {};
    const [h, s, l] = rgb2hsl(...hex2rgb(base));
    return {
      base,
      sh: o.sh || rgb2hex(...hsl2rgb(h + (h > 60 && h < 250 ? 10 : -14), Math.min(1, s * 1.05 + 0.04), l * 0.72)),
      sh2: o.sh2 || rgb2hex(...hsl2rgb(h + (h > 60 && h < 250 ? 16 : -20), Math.min(1, s * 1.1 + 0.06), l * 0.52)),
      hl: o.hl || rgb2hex(...hsl2rgb(h - 6, s * 0.9, Math.min(0.97, l + (1 - l) * 0.28))),
      rim: o.rim || null,
      line: o.line || K.ink(base),
    };
  };

  // ------------------------------------------------------------------ paths
  K.P = (fn) => { const p = new Path2D(); fn(p); return p; };
  // Catmull-Rom through points -> cubic beziers. point = [x,y] or [x,y,1] (1 = sharp corner)
  K.smooth = function (p, pts, closed, k) {
    k = k == null ? 1 : k;
    const n = pts.length; if (n < 2) return p;
    const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    p.moveTo(pts[0][0], pts[0][1]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = p1[2] ? [p1[0], p1[1]] : [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
      const c2 = p2[2] ? [p2[0], p2[1]] : [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
      p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  };
  K.S = (pts, closed, k) => K.P((p) => K.smooth(p, pts, closed == null ? true : closed, k));
  K.poly = (pts) => K.P((p) => { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); });
  // sample the same curve K.smooth draws
  K.sample = function (pts, closed, k, steps) {
    k = k == null ? 1 : k; steps = steps || 12;
    const n = pts.length, out = [];
    const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = p1[2] ? [p1[0], p1[1]] : [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
      const c2 = p2[2] ? [p2[0], p2[1]] : [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
      for (let j = 0; j < steps; j++) {
        const t = j / steps, mt = 1 - t;
        out.push([
          mt * mt * mt * p1[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p2[0],
          mt * mt * mt * p1[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p2[1],
        ]);
      }
    }
    if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
    return out;
  };
  K.mirror = (pts, cx) => pts.map((q) => [2 * (cx || 0) - q[0], q[1], q[2]]);
  // symmetric closed outline from the right half (top-centre -> bottom-centre)
  K.sym = (half, cx) => {
    cx = cx || 0;
    const left = half.slice(1, -1).reverse().map((q) => [2 * cx - q[0], q[1], q[2]]);
    return half.concat(left);
  };
  K.tr = (pts, dx, dy, sx, sy) => pts.map((q) => [q[0] * (sx || 1) + dx, q[1] * (sy || sx || 1) + dy, q[2]]);

  // ------------------------------------------------------------------ shaded part
  const BIG = 20000;
  function crescent(ctx, path, L, rule) {
    ctx.save();
    ctx.clip(path, rule);
    const q = new Path2D();
    q.rect(-BIG, -BIG, 2 * BIG, 2 * BIG);
    q.addPath(L.path || path, new DOMMatrix([1, 0, 0, 1, L.dx || 0, L.dy || 0]));
    ctx.globalAlpha = L.a == null ? 1 : L.a;
    if (L.op) ctx.globalCompositeOperation = L.op;
    if (L.blur) ctx.filter = `blur(${L.blur * (K.pxScale || 1)}px)`;
    ctx.fillStyle = L.c;
    ctx.fill(q, 'evenodd');
    ctx.restore();
  }
  K.crescent = crescent;
  // o: {fill, fx:[{dx,dy,c,a,op,blur}], inner(ctx), line, lw, rule}
  K.part = function (ctx, path, o) {
    const rule = o.rule || 'nonzero';
    ctx.save();
    ctx.fillStyle = o.fill;
    ctx.fill(path, rule);
    if (o.under) { ctx.save(); ctx.clip(path, rule); o.under(ctx); ctx.restore(); }
    if (o.fx) for (const L of o.fx) crescent(ctx, path, L, rule);
    if (o.inner) { ctx.save(); ctx.clip(path, rule); o.inner(ctx); ctx.restore(); }
    if (o.line !== false) {
      ctx.strokeStyle = o.line || K.ink(typeof o.fill === 'string' ? o.fill : '#666666');
      ctx.lineWidth = (o.lw || 2) * K.lineScale;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke(path);
    }
    ctx.restore();
  };
  // material-driven toon part: light from upper-left-front, rim from right-back
  // s = shadow band width, opts: {sd:[dx,dy] override, deep:true, hl:false, rim:color, rimW, inner, lw}
  K.toon = function (ctx, path, m, o) {
    o = o || {};
    const s = o.s == null ? 10 : o.s;
    const d = o.sd || [-s, -s * 0.45];
    const fx = [{ dx: d[0], dy: d[1], c: m.sh }];
    if (o.deep !== false && s > 3) fx.push({ dx: d[0] * 0.45, dy: d[1] * 0.45 - s * 0.25, c: m.sh2, a: o.deepA == null ? 0.55 : o.deepA });
    if (o.hl !== false && m.hl) fx.push({ dx: s * 0.5, dy: s * 0.55, c: m.hl, a: o.hlA == null ? 0.55 : o.hlA });
    const rim = o.rim || m.rim;
    if (rim) fx.push({ dx: -(o.rimW || 2.2), dy: 0, c: rim, a: o.rimA == null ? 0.9 : o.rimA });
    if (o.fx) fx.push(...o.fx);
    K.part(ctx, path, { fill: o.fill || m.base, fx, under: o.under, inner: o.inner, line: o.line || m.line, lw: o.lw, rule: o.rule });
  };
  // several overlapping paths drawn as one shape (outline only around the union)
  K.union = function (ctx, paths, o) {
    const all = new Path2D();
    for (const p of paths) all.addPath(p);
    ctx.save();
    if (o.line !== false) {
      ctx.strokeStyle = o.line; ctx.lineWidth = (o.lw || 2) * 2 * K.lineScale; ctx.lineJoin = 'round';
      for (const p of paths) ctx.stroke(p);
    }
    ctx.restore();
    K.part(ctx, all, Object.assign({}, o, { line: false }));
    return all;
  };
  // paint a shape cast by `src` onto `target` (clip)
  K.cast = function (ctx, target, src, dx, dy, color, a, blur, op) {
    ctx.save();
    ctx.clip(target);
    ctx.translate(dx, dy);
    ctx.globalAlpha = a == null ? 1 : a;
    if (op) ctx.globalCompositeOperation = op;
    if (blur) ctx.filter = `blur(${blur * (K.pxScale || 1)}px)`;
    ctx.fillStyle = color;
    ctx.fill(src);
    ctx.restore();
  };
  K.clipDo = function (ctx, path, fn) { ctx.save(); ctx.clip(path); fn(ctx); ctx.restore(); };

  // ------------------------------------------------------------------ strokes
  // tapered ink stroke through points. o: {w0,w1 (end width ratio), a,b (ramp length), k, closed}
  K.taper = function (ctx, pts, w, color, o) {
    o = o || {};
    const s = K.sample(pts, false, o.k, o.steps || 10);
    if (s.length < 2) return;
    const n = s.length, w0 = o.w0 == null ? 0.1 : o.w0, w1 = o.w1 == null ? 0.1 : o.w1;
    const ra = o.a == null ? 0.35 : o.a, rb = o.b == null ? 0.35 : o.b;
    const sm = (e0, e1, x) => { const t = K.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = s[i], pa = s[Math.max(0, i - 1)], pb = s[Math.min(n - 1, i + 1)];
      let tx = pb[0] - pa[0], ty = pb[1] - pa[1];
      const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const ww = (w / 2) * K.lerp(w0, 1, sm(0, ra, t)) * K.lerp(w1, 1, sm(0, rb, 1 - t)) * (o.noScale ? 1 : (K.taperScale || 1));
      L.push([p[0] - ty * ww, p[1] + tx * ww]);
      R.push([p[0] + ty * ww, p[1] - tx * ww]);
    }
    ctx.save();
    if (o.op) ctx.globalCompositeOperation = o.op;
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.blur) ctx.filter = `blur(${o.blur * (K.pxScale || 1)}px)`;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  K.line = function (ctx, pts, w, color, o) {
    o = o || {};
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = w * (o.noScale ? 1 : K.lineScale);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.dash) ctx.setLineDash(o.dash.map((v) => v * (o.noScale ? 1 : K.lineScale)));
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.op) ctx.globalCompositeOperation = o.op;
    ctx.stroke(K.P((p) => K.smooth(p, pts, !!o.closed, o.k)));
    ctx.restore();
  };
  K.circle = (x, y, r) => K.P((p) => p.arc(x, y, r, 0, Math.PI * 2));
  K.ell = (x, y, rx, ry, rot) => K.P((p) => p.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2));
  K.glow = function (ctx, x, y, r, color, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, K.rgba(color, a == null ? 0.8 : a));
    g.addColorStop(0.35, K.rgba(color, (a == null ? 0.8 : a) * 0.4));
    g.addColorStop(1, K.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  };
  // Chinese knot button (盤扣): loop + ball
  K.knot = function (ctx, x, y, s, col, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
    const ln = K.ink(col, 0.5);
    K.part(ctx, K.P((p) => { p.ellipse(-s * 0.9, 0, s * 0.95, s * 0.42, 0, 0, Math.PI * 2); }), { fill: col, line: ln, lw: 1.1 });
    K.part(ctx, K.P((p) => { p.ellipse(s * 0.9, 0, s * 0.95, s * 0.42, 0, 0, Math.PI * 2); }), { fill: col, line: ln, lw: 1.1 });
    K.part(ctx, K.circle(0, 0, s * 0.55), { fill: K.adj(col, 0, 0, 0.08), line: ln, lw: 1.1, fx: [{ dx: -s * 0.25, dy: -s * 0.2, c: K.adj(col, 0, 0, -0.15) }] });
    ctx.restore();
  };

  // ------------------------------------------------------------------ text
  K.FONT_ZH = '"WenQuanYi Zen Hei", "Noto Sans CJK TC", sans-serif';
  K.FONT_EN = 'Inter, "DejaVu Sans", sans-serif';
  K.FONT_SERIF = '"DejaVu Serif", Georgia, serif';
  K.tokens = function (s) {
    const out = []; let w = '';
    for (const ch of s) {
      if (/[⺀-鿿＀-￯　-〿]/.test(ch)) { if (w) { out.push(w); w = ''; } out.push(ch); }
      else if (ch === ' ') { if (w) out.push(w); out.push(' '); w = ''; }
      else w += ch;
    }
    if (w) out.push(w);
    return out;
  };
  // wraps text; returns final y. o: {font, color, lh, maxW, draw:true}
  K.wrap = function (ctx, text, x, y, maxW, lh, o) {
    o = o || {};
    ctx.save();
    if (o.font) ctx.font = o.font;
    if (o.color) ctx.fillStyle = o.color;
    ctx.textBaseline = 'alphabetic';
    const paras = String(text).split('\n');
    for (const para of paras) {
      const t = K.tokens(para);
      let line = '';
      for (let i = 0; i < t.length; i++) {
        const cand = line + t[i];
        if (ctx.measureText(cand).width > maxW && line.trim()) {
          if (o.draw !== false) ctx.fillText(line.replace(/\s+$/, ''), x, y);
          y += lh; line = t[i] === ' ' ? '' : t[i];
          // keep CJK closing punctuation off the start of a line
          if (/^[，。、；：」』）！？]$/.test(line) && i + 1 <= t.length) { /* acceptable */ }
        } else line = cand;
      }
      if (line.trim()) { if (o.draw !== false) ctx.fillText(line, x, y); y += lh; }
    }
    ctx.restore();
    return y;
  };
  K.rrect = (x, y, w, h, r) => K.P((p) => { p.roundRect(x, y, w, h, r); });

  // ------------------------------------------------------------------ offscreen views
  // render drawFn (figure coordinates) into an offscreen canvas covering `box` at `scale`
  K.renderView = function (drawFn, box, scale, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    c.width = Math.ceil((box[2] - box[0]) * scale);
    c.height = Math.ceil((box[3] - box[1]) * scale);
    const ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, -box[0] * scale, -box[1] * scale);
    const oldPx = K.pxScale, oldLs = K.lineScale, oldTs = K.taperScale;
    K.pxScale = scale; K.lineScale = opts.lineScale || 1; K.taperScale = opts.taperScale || 1;
    drawFn(ctx, opts);
    K.pxScale = oldPx; K.lineScale = oldLs; K.taperScale = oldTs;
    return c;
  };
  K.silhouette = function (src, color) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    // threshold alpha so soft glows / FX do not count as silhouette
    const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 150 ? 255 : 0;
    ctx.putImageData(id, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color || '#111';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  };

  // ------------------------------------------------------------------ the turnaround sheet
  // spec: {W,H, theme:{bg,paper,ink,accent,gold}, title, titleEn, role, concept, conceptEn,
  //   views:[{label,labelEn, draw, box:[x0,y0,x1,y1], at:[sheetX, groundY], marks:[{n,x,y,dx,dy}]}],
  //   heads:{u, n, ground}, bust:{draw, box, scale}, exprs:[{draw, box, label}], palette:[{c,zh,en,role}],
  //   callouts:[{zh,en,note}], cols:[{h,hEn,body}], spriteH }
  K.sheet = function (canvas, S) {
    const W = S.W || 2400, Hh = S.H || 1660;
    canvas.width = W; canvas.height = Hh;
    const ctx = canvas.getContext('2d');
    const T = S.theme;
    // page
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, Hh);
    // header
    ctx.fillStyle = T.title || '#f3ead8';
    ctx.font = `600 64px ${K.FONT_ZH}`; ctx.fillText(S.title, 44, 98);
    const tw = ctx.measureText(S.title).width;
    ctx.fillStyle = T.gold; ctx.font = `600 22px ${K.FONT_EN}`;
    ctx.fillText(S.titleEn, 44 + tw + 24, 70);
    ctx.fillStyle = T.sub || '#b9ad98'; ctx.font = `17px ${K.FONT_ZH}`;
    ctx.fillText(S.role, 44 + tw + 24, 100);
    // concept line (right side of header)
    ctx.fillStyle = T.title || '#f3ead8';
    K.wrap(ctx, S.concept, 1030, 62, 1320, 27, { font: `20px ${K.FONT_ZH}` });
    ctx.fillStyle = T.sub || '#b9ad98';
    K.wrap(ctx, S.conceptEn, 1030, 122, 1320, 22, { font: `italic 16px ${K.FONT_SERIF}` });
    // badge
    ctx.fillStyle = T.gold; ctx.font = `600 13px ${K.FONT_EN}`;
    ctx.fillText(S.badge || 'FINAL DESIGN · v2 · 3D TOON TURNAROUND', 46, 136);
    ctx.fillStyle = K.rgba(T.gold, 0.5); ctx.fillRect(44, 150, W - 88, 1.5);

    // ----- stage
    const st = S.stage; // [x,y,w,h]
    ctx.save();
    const sp = K.rrect(st[0], st[1], st[2], st[3], 14);
    const sg = ctx.createLinearGradient(0, st[1], 0, st[1] + st[3]);
    sg.addColorStop(0, T.paper0); sg.addColorStop(1, T.paper1);
    ctx.fillStyle = sg; ctx.fill(sp);
    ctx.clip(sp);
    // subtle paper grain
    const rg = K.rng(7);
    ctx.fillStyle = 'rgba(80,60,40,0.035)';
    for (let i = 0; i < 2600; i++) ctx.fillRect(st[0] + rg() * st[2], st[1] + rg() * st[3], 1.5, 1.5);
    // head-unit guides
    const gH = Object.assign({}, S.heads, { u: S.heads.u * (S.figScale || 1) });
    ctx.font = `12px ${K.FONT_EN}`; ctx.textAlign = 'left';
    for (let i = 0; i <= gH.n; i++) {
      const y = gH.ground - i * gH.u;
      ctx.fillStyle = K.rgba(T.guide, i === 0 ? 0.55 : 0.22);
      ctx.fillRect(st[0] + 46, Math.round(y), st[2] - 70, i === 0 ? 1.6 : 1);
      if (i > 0) {
        ctx.fillStyle = K.rgba(T.guide, 0.75);
        ctx.fillText(String(i), st[0] + 22, y + gH.u / 2 + 4);
      }
    }
    if (gH.extra) for (const e of gH.extra) {
      ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = K.rgba(T.guide, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(st[0] + 46, e.y); ctx.lineTo(st[0] + st[2] - 24, e.y); ctx.stroke(); ctx.restore();
      ctx.fillStyle = K.rgba(T.guide, 0.7); ctx.font = `11px ${K.FONT_EN}`; ctx.textAlign = 'right';
      ctx.fillText(e.label, st[0] + st[2] - 28, e.y - 5); ctx.textAlign = 'left';
    }
    ctx.fillStyle = K.rgba(T.guide, 0.8); ctx.font = `600 12px ${K.FONT_EN}`;
    ctx.fillText(gH.label, st[0] + 18, st[1] + 26);
    // views
    const rendered = [];
    for (const v of S.views) {
      const sc = 2;
      const img = K.renderView(v.draw, v.box, sc);
      rendered.push(img);
      // ground shadow
      ctx.save();
      const gs = ctx.createRadialGradient(v.at[0], v.at[1], 0, v.at[0], v.at[1], v.shadowR || 160);
      gs.addColorStop(0, 'rgba(40,30,30,0.28)'); gs.addColorStop(1, 'rgba(40,30,30,0)');
      ctx.fillStyle = gs; ctx.translate(v.at[0], v.at[1]); ctx.scale(1, 0.16); ctx.translate(-v.at[0], -v.at[1]);
      ctx.fillRect(v.at[0] - 300, v.at[1] - 300, 600, 600); ctx.restore();
      const fs = S.figScale || 1;
      ctx.drawImage(img, v.at[0] + v.box[0] * fs, v.at[1] + v.box[1] * fs, (img.width / sc) * fs, (img.height / sc) * fs);
      // label
      ctx.textAlign = 'center';
      ctx.fillStyle = T.ink; ctx.font = `600 22px ${K.FONT_ZH}`;
      ctx.fillText(v.label, v.at[0], v.at[1] + 40);
      ctx.fillStyle = K.rgba(T.ink, 0.6); ctx.font = `600 12px ${K.FONT_EN}`;
      ctx.fillText(v.labelEn, v.at[0], v.at[1] + 58);
      ctx.textAlign = 'left';
    }
    // callout markers
    for (const v of S.views) {
      for (const mk of v.marks || []) {
        const fs = S.figScale || 1;
        const px = v.at[0] + mk.x * fs, py = v.at[1] + mk.y * fs;
        const mx = px + (mk.dx || 0), my = py + (mk.dy || 0);
        ctx.strokeStyle = K.rgba(T.markLine || '#2a2230', 0.85); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = T.markLine || '#2a2230';
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = T.mark; ctx.strokeStyle = '#fff8ea'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff8ea'; ctx.font = `700 14px ${K.FONT_EN}`; ctx.textAlign = 'center';
        ctx.fillText(String(mk.n), mx, my + 5); ctx.textAlign = 'left';
      }
    }
    ctx.restore();

    // ----- right panel
    const rp = S.panel; // [x,y,w]
    let y = rp[1];
    // bust
    const bb = S.bust;
    const bustH = bb.h || 430;
    ctx.save();
    const bp = K.rrect(rp[0], y, rp[2], bustH, 14);
    const bg2 = ctx.createRadialGradient(rp[0] + rp[2] * 0.45, y + bustH * 0.4, 20, rp[0] + rp[2] * 0.5, y + bustH * 0.5, rp[2] * 0.75);
    bg2.addColorStop(0, T.bust0); bg2.addColorStop(1, T.bust1);
    ctx.fillStyle = bg2; ctx.fill(bp); ctx.clip(bp);
    const bimg = K.renderView(bb.draw, bb.box, bb.scale * 1.5, { lineScale: bb.lineScale || 0.55, bust: true });
    const bw = (bb.box[2] - bb.box[0]) * bb.scale, bh = (bb.box[3] - bb.box[1]) * bb.scale;
    ctx.drawImage(bimg, rp[0] + (bb.offX || 0), y + (bb.offY || 0), bw, bh);
    ctx.restore();
    ctx.fillStyle = T.title || '#f3ead8'; ctx.font = `600 18px ${K.FONT_ZH}`;
    ctx.fillText(bb.label, rp[0] + 18, y + 32);
    ctx.fillStyle = K.rgba(T.title || '#f3ead8', 0.7); ctx.font = `12px ${K.FONT_EN}`;
    ctx.fillText(bb.labelEn, rp[0] + 18, y + 50);
    y += bustH + 14;
    // expressions
    if (S.exprs && S.exprs.length) {
      const n = S.exprs.length, gap = 12, ew = (rp[2] - gap * (n - 1)) / n, eh = S.exprH || 200;
      S.exprs.forEach((e, i) => {
        const ex = rp[0] + i * (ew + gap);
        ctx.save();
        const ep = K.rrect(ex, y, ew, eh, 12);
        ctx.fillStyle = T.expr || T.bust1; ctx.fill(ep); ctx.clip(ep);
        const eimg = K.renderView(e.draw, e.box, e.scale * 1.5, { lineScale: e.lineScale || 0.5, bust: true });
        ctx.drawImage(eimg, ex + (e.offX || 0), y + (e.offY || 0), (e.box[2] - e.box[0]) * e.scale, (e.box[3] - e.box[1]) * e.scale);
        ctx.fillStyle = 'rgba(10,8,14,0.62)'; ctx.fillRect(ex, y + eh - 30, ew, 30);
        ctx.restore();
        ctx.fillStyle = T.title || '#f3ead8'; ctx.font = `600 15px ${K.FONT_ZH}`;
        ctx.fillText(e.label, ex + 12, y + eh - 10);
      });
      y += eh + 16;
    }
    // palette
    ctx.fillStyle = T.gold; ctx.font = `600 14px ${K.FONT_EN}`;
    ctx.fillText('色彩計畫  PALETTE', rp[0], y + 14);
    y += 26;
    const pn = S.palette.length, pw = (rp[2] - 8 * (pn - 1)) / pn;
    S.palette.forEach((c, i) => {
      const px = rp[0] + i * (pw + 8);
      ctx.fillStyle = c.c; ctx.fill(K.rrect(px, y, pw, 54, 8));
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke(K.rrect(px, y, pw, 54, 8));
      if (c.role) { ctx.fillStyle = K.lum(c.c) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)'; ctx.font = `600 10px ${K.FONT_EN}`; ctx.fillText(c.role, px + 6, y + 14); }
      ctx.fillStyle = T.title || '#f3ead8'; ctx.font = `13px ${K.FONT_ZH}`;
      ctx.fillText(c.zh, px, y + 72);
      ctx.fillStyle = K.rgba(T.title || '#f3ead8', 0.6); ctx.font = `10.5px ${K.FONT_EN}`;
      ctx.fillText(c.en, px, y + 86);
      ctx.fillText(c.c.toUpperCase(), px, y + 99);
    });
    y += 114;
    // callout legend
    ctx.fillStyle = T.gold; ctx.font = `600 14px ${K.FONT_EN}`;
    ctx.fillText('造型標註  CALLOUTS', rp[0], y + 14);
    y += 30;
    const colW = (rp[2] - 16) / 2;
    const half = Math.ceil(S.callouts.length / 2);
    let yA = y, yB = y;
    S.callouts.forEach((c, i) => {
      const col = i < half ? 0 : 1;
      const cx = rp[0] + col * (colW + 16);
      let cy = col ? yB : yA;
      ctx.fillStyle = T.mark; ctx.beginPath(); ctx.arc(cx + 11, cy + 4, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8ea'; ctx.font = `700 12px ${K.FONT_EN}`; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cx + 11, cy + 8.5); ctx.textAlign = 'left';
      ctx.fillStyle = T.title || '#f3ead8';
      cy = K.wrap(ctx, c.zh, cx + 30, cy + 9, colW - 32, 19, { font: `600 15px ${K.FONT_ZH}` });
      ctx.fillStyle = K.rgba(T.title || '#f3ead8', 0.66);
      cy = K.wrap(ctx, c.en, cx + 30, cy - 1, colW - 32, 16, { font: `12.5px ${K.FONT_EN}` });
      cy += 9;
      if (col) yB = cy; else yA = cy;
    });

    // ----- bottom columns (under the stage)
    const bt = S.bottom; // [x,y,w]
    const cols = S.cols;
    const cw = (bt[2] - 28 * (cols.length - 1)) / cols.length;
    cols.forEach((c, i) => {
      const cx = bt[0] + i * (cw + 28);
      ctx.fillStyle = T.gold; ctx.font = `600 18px ${K.FONT_ZH}`;
      ctx.fillText(c.h, cx, bt[1] + 22);
      ctx.fillStyle = K.rgba(T.gold, 0.75); ctx.font = `600 11.5px ${K.FONT_EN}`;
      ctx.fillText(c.hEn, cx, bt[1] + 40);
      let yy = bt[1] + 66;
      for (const para of c.body) {
        ctx.fillStyle = para.en ? K.rgba(T.title || '#f3ead8', 0.62) : (T.title || '#f3ead8');
        yy = K.wrap(ctx, para.t, cx, yy, cw, para.en ? 17 : 21, { font: para.en ? `12.5px ${K.FONT_EN}` : `14.5px ${K.FONT_ZH}` });
        yy += para.en ? 9 : 2;
      }
    });
    // ----- props & details strip (under the text columns)
    if (S.props) {
      const P = S.props, n = P.items.length, gap = 14;
      const gw = (bt[2] - gap * (n - 1)) / n;
      ctx.fillStyle = T.gold; ctx.font = `600 14px ${K.FONT_EN}`;
      ctx.fillText('道具與細節  PROPS & DETAILS (texture-paint reference)', bt[0], P.y - 10);
      P.items.forEach((it, i) => {
        const x = bt[0] + i * (gw + gap);
        ctx.save();
        const pp = K.rrect(x, P.y, gw, P.h, 10);
        ctx.fillStyle = T.propBg || T.paper0; ctx.fill(pp); ctx.clip(pp);
        const img = K.renderView(it.draw, it.box, it.scale * 2, { lineScale: it.lineScale || 0.8 });
        const w = (it.box[2] - it.box[0]) * it.scale, h = (it.box[3] - it.box[1]) * it.scale;
        ctx.drawImage(img, x + (gw - w) / 2, P.y + 6 + (P.h - 30 - h) / 2, w, h);
        ctx.fillStyle = 'rgba(20,16,24,0.08)'; ctx.fillRect(x, P.y + P.h - 26, gw, 26);
        ctx.fillStyle = T.ink; ctx.font = `600 13px ${K.FONT_ZH}`;
        ctx.fillText(it.label, x + 10, P.y + P.h - 8);
        ctx.restore();
      });
    }
    // ----- silhouettes (bottom of the right panel)
    const sy = Math.max(yA, yB) + 6, sx = rp[0], sw = rp[2], sh = Hh - 46 - sy;
    ctx.save();
    ctx.fillStyle = T.silBg || 'rgba(255,255,255,0.06)';
    ctx.fill(K.rrect(sx, sy, sw, sh, 12));
    ctx.fillStyle = T.silText || T.gold; ctx.font = `600 14px ${K.FONT_ZH}`;
    ctx.fillText('剪影檢查', sx + 16, sy + 24);
    ctx.fillStyle = K.rgba(T.silText || T.gold, 0.75); ctx.font = `600 11px ${K.FONT_EN}`;
    ctx.fillText('SILHOUETTE · front / side / back · right: 90 px sprite scale', sx + 86, sy + 24);
    const big = sh - 50;
    let ox = sx + 18;
    const ground = sy + 36 + big;
    S.views.forEach((v, i) => {
      const sil = K.silhouette(rendered[i], '#0d0b10');
      const k = big / (S.silRef || (v.box[3] - v.box[1]));
      const w = (v.box[2] - v.box[0]) * k;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.drawImage(sil, ox, ground + v.box[1] * k, w, (v.box[3] - v.box[1]) * k);
      ox += w + 4;
    });
    let ox2 = ox + 18;
    S.views.forEach((v, i) => {
      const sil = K.silhouette(rendered[i], '#0d0b10');
      const k = 90 / (S.silRef || (v.box[3] - v.box[1]));
      const w = (v.box[2] - v.box[0]) * k, h = (v.box[3] - v.box[1]) * k;
      ctx.fillStyle = 'rgba(241,235,224,0.95)'; ctx.fill(K.rrect(ox2 - 4, ground - h - 2, w + 8, h + 8, 6));
      ctx.drawImage(sil, ox2, ground - h + 2, w, h);
      ox2 += w + 12;
    });
    ctx.restore();
    // light backing behind big silhouettes is drawn first for contrast
    // footer
    ctx.fillStyle = K.rgba(T.title || '#f3ead8', 0.4); ctx.font = `12px ${K.FONT_EN}`;
    ctx.fillText(S.footer || '', 44, Hh - 18);
    return { ctx, rendered };
  };
})(typeof window !== 'undefined' ? window : globalThis);
