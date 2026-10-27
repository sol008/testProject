// Visual effects: weather/ambient particles, dynamic lighting, psychedelic vision overlay,
// vignette, chapter title cards, heart-lantern sequence, generic particle bursts.
'use strict';
G.FX = (() => {
  const FX = {};
  const U = G.U;

  // ---------------------------------------------------------------- particles
  const PRESETS = {
    fireflies: { n: 26, space: 'world', make: (m) => ({ x: U.rand(0, m.w * 64), y: U.rand(0, m.h * 64), vx: 0, vy: 0, ph: U.rand(0, 7), c: U.pick(['#d8ff7a', '#fff3a0', '#b8ffb0']) }) },
    motes: { n: 30, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: U.rand(0, G.H), vx: U.rand(-6, 6), vy: U.rand(-24, -8), ph: U.rand(0, 7), c: U.pick(['#a8e0ff', '#e0f4ff', '#c8b8ff']) }) },
    embers: { n: 30, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: G.H + U.rand(0, 200), vx: U.rand(-10, 10), vy: U.rand(-60, -25), ph: U.rand(0, 7), c: U.pick(['#ffb050', '#ff7a3a', '#ffd080']) }) },
    leaves: { n: 18, space: 'screen', make: () => ({ x: U.rand(-100, G.W), y: U.rand(-G.H, 0), vx: U.rand(20, 50), vy: U.rand(30, 60), ph: U.rand(0, 7), c: U.pick(['#7aa83a', '#a8b83a', '#c89a3a', '#5a8a2a']) }) },
    petals: { n: 28, space: 'screen', make: () => ({ x: U.rand(-100, G.W), y: U.rand(-G.H, 0), vx: U.rand(15, 45), vy: U.rand(25, 50), ph: U.rand(0, 7), c: U.pick(['#ffc8d8', '#ffb0c8', '#fff0f4']) }) },
    rain: { n: 120, space: 'screen', make: () => ({ x: U.rand(-100, G.W + 100), y: U.rand(-G.H, G.H), vx: -120, vy: U.rand(900, 1200), ph: 0, c: '#a8c0e0' }) },
    snow: { n: 70, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: U.rand(-G.H, G.H), vx: U.rand(-10, 10), vy: U.rand(30, 70), ph: U.rand(0, 7), c: '#ffffff' }) },
    wind: { n: 24, space: 'screen', make: () => ({ x: U.rand(-G.W, 0), y: U.rand(0, G.H), vx: U.rand(700, 1100), vy: U.rand(-20, 20), ph: U.rand(0, 7), c: '#e8f0ff' }) },
    dust: { n: 30, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: U.rand(0, G.H), vx: U.rand(-5, 5), vy: U.rand(-5, 5), ph: U.rand(0, 7), c: '#d8c8a8' }) },
    sparkles: { n: 40, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: U.rand(0, G.H), vx: U.rand(-15, 15), vy: U.rand(-15, 15), ph: U.rand(0, 7), c: '#ffffff', hue: U.rand(0, 360) }) },
    lanterns: { n: 14, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: G.H + U.rand(0, 400), vx: U.rand(-6, 6), vy: U.rand(-22, -10), ph: U.rand(0, 7), s: U.rand(0.5, 1.2), c: '#ffb050' }) },
    mist: { n: 9, space: 'screen', make: () => ({ x: U.rand(-300, G.W), y: U.rand(0, G.H), vx: U.rand(8, 22), vy: 0, ph: U.rand(0, 7), s: U.rand(180, 360), c: '#dce4f0' }) },
    ash: { n: 40, space: 'screen', make: () => ({ x: U.rand(0, G.W), y: U.rand(-G.H, G.H), vx: U.rand(-20, 10), vy: U.rand(20, 45), ph: U.rand(0, 7), c: '#8a8a8a' }) },
  };

  class Particles {
    constructor(spec, mapScene) {
      this.groups = [];
      const list = !spec ? [] : Array.isArray(spec) ? spec : [spec];
      for (const s of list) {
        const name = typeof s === 'string' ? s : s.type;
        const p = PRESETS[name];
        if (!p) continue;
        const n = Math.round(p.n * (typeof s === 'object' && s.density ? s.density : 1));
        const parts = [];
        for (let i = 0; i < n; i++) parts.push(p.make(mapScene || { w: 30, h: 20 }));
        this.groups.push({ name, p, parts, opts: typeof s === 'object' ? s : {} });
      }
      this.map = mapScene;
      this.t = 0;
    }
    update(dt) {
      this.t += dt;
      for (const g of this.groups) {
        for (const q of g.parts) {
          q.ph += dt;
          q.x += q.vx * dt; q.y += q.vy * dt;
          if (g.name === 'fireflies') {
            q.x += Math.sin(q.ph * 0.7) * 12 * dt;
            q.y += Math.cos(q.ph * 0.5) * 10 * dt;
          }
          if (g.name === 'leaves' || g.name === 'petals') q.x += Math.sin(q.ph * 2) * 30 * dt;
          if (g.p.space === 'screen') {
            if (q.y > G.H + 40 || q.x > G.W + 400 || q.y < -500 || q.x < -1300) {
              const nq = g.p.make(this.map);
              if (g.name === 'leaves' || g.name === 'petals' || g.name === 'snow' || g.name === 'rain' || g.name === 'ash') { nq.y = -20; }
              if (g.name === 'mist') nq.x = -400;
              if (g.name === 'wind') nq.x = -U.rand(50, 600);
              Object.assign(q, nq);
            }
          }
        }
      }
    }
    drawWorld(ctx) {
      for (const g of this.groups) if (g.p.space === 'world') this.drawGroup(ctx, g);
    }
    drawScreen(ctx) {
      for (const g of this.groups) if (g.p.space === 'screen') this.drawGroup(ctx, g);
    }
    drawGroup(ctx, g) {
      ctx.save();
      const t = this.t;
      switch (g.name) {
        case 'fireflies':
        case 'motes':
        case 'embers':
        case 'dust':
          ctx.globalCompositeOperation = 'lighter';
          for (const q of g.parts) {
            const a = g.name === 'dust' ? 0.25 : 0.5 + 0.5 * Math.sin(q.ph * 3);
            const r = g.name === 'dust' ? 1.5 : 3;
            ctx.globalAlpha = a;
            ctx.drawImage(FX.glowSprite(q.c), q.x - r * 4, q.y - r * 4, r * 8, r * 8);
          }
          break;
        case 'sparkles':
          ctx.globalCompositeOperation = 'lighter';
          for (const q of g.parts) {
            const a = Math.max(0, Math.sin(q.ph * 2));
            ctx.fillStyle = `hsla(${(q.hue + t * 60) % 360},100%,75%,${a * 0.8})`;
            const s = 2 + a * 3;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y - s * 2); ctx.lineTo(q.x + s * 0.5, q.y); ctx.lineTo(q.x, q.y + s * 2); ctx.lineTo(q.x - s * 0.5, q.y);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(q.x - s * 2, q.y); ctx.lineTo(q.x, q.y + s * 0.5); ctx.lineTo(q.x + s * 2, q.y); ctx.lineTo(q.x, q.y - s * 0.5);
            ctx.closePath(); ctx.fill();
          }
          break;
        case 'leaves':
        case 'petals':
          for (const q of g.parts) {
            ctx.save();
            ctx.translate(q.x, q.y); ctx.rotate(q.ph * 2);
            ctx.scale(1, Math.abs(Math.sin(q.ph * 3)) * 0.8 + 0.2);
            ctx.fillStyle = q.c;
            ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.ellipse(0, 0, g.name === 'petals' ? 5 : 7, g.name === 'petals' ? 3.5 : 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
          break;
        case 'rain':
          ctx.strokeStyle = 'rgba(180,200,230,0.45)'; ctx.lineWidth = 1.3;
          ctx.beginPath();
          for (const q of g.parts) { ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + q.vx * 0.02, q.y + q.vy * 0.02); }
          ctx.stroke();
          ctx.fillStyle = 'rgba(30,40,70,0.18)'; ctx.fillRect(0, 0, G.W, G.H);
          break;
        case 'snow':
        case 'ash':
          for (const q of g.parts) {
            ctx.fillStyle = U.rgba(q.c, 0.8);
            ctx.beginPath(); ctx.arc(q.x + Math.sin(q.ph) * 6, q.y, g.name === 'snow' ? 2.4 : 1.6, 0, Math.PI * 2); ctx.fill();
          }
          break;
        case 'wind':
          ctx.strokeStyle = 'rgba(230,240,255,0.25)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
          for (const q of g.parts) {
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            ctx.quadraticCurveTo(q.x + 60, q.y + Math.sin(q.ph * 3) * 10, q.x + 140, q.y);
            ctx.stroke();
          }
          break;
        case 'lanterns':
          for (const q of g.parts) {
            const s = q.s;
            const x = q.x + Math.sin(q.ph * 0.6) * 10, y = q.y;
            const gl = ctx.createRadialGradient(x, y, 0, x, y, 40 * s);
            gl.addColorStop(0, 'rgba(255,170,80,0.45)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
            ctx.fillStyle = gl; ctx.fillRect(x - 40 * s, y - 40 * s, 80 * s, 80 * s);
            const lg = ctx.createLinearGradient(x, y - 12 * s, x, y + 12 * s);
            lg.addColorStop(0, '#ffe6a8'); lg.addColorStop(1, '#ff8a3a');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.moveTo(x - 8 * s, y - 12 * s); ctx.lineTo(x + 8 * s, y - 12 * s); ctx.lineTo(x + 6 * s, y + 11 * s); ctx.lineTo(x - 6 * s, y + 11 * s);
            ctx.closePath(); ctx.fill();
          }
          break;
        case 'mist':
          for (const q of g.parts) {
            const gr = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.s);
            const a = (g.opts.alpha || 0.16) * (0.7 + 0.3 * Math.sin(q.ph * 0.3));
            gr.addColorStop(0, U.rgba(g.opts.color || q.c, a));
            gr.addColorStop(1, U.rgba(g.opts.color || q.c, 0));
            ctx.fillStyle = gr;
            ctx.fillRect(q.x - q.s, q.y - q.s, q.s * 2, q.s * 2);
          }
          break;
        default: break;
      }
      ctx.restore();
    }
  }
  FX.Particles = Particles;

  // ---------------------------------------------------------------- lighting
  let lightCanvas = null;
  const LS = 0.5; // light map resolution relative to logical
  FX.lighting = function (ctx, ms, camX, camY, t) {
    const lc = ms.lightCfg;
    if (!lightCanvas) {
      lightCanvas = document.createElement('canvas');
      lightCanvas.width = Math.ceil(G.W * LS); lightCanvas.height = Math.ceil(G.H * LS);
    }
    const l = lightCanvas.getContext('2d');
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
    l.fillStyle = U.rgba(lc.color || '#060a1e', lc.ambient);
    l.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    l.globalCompositeOperation = 'destination-out';
    l.setTransform(LS, 0, 0, LS, -camX * LS, -camY * LS);
    const lights = ms.collectLights();
    const vis = [];
    for (const L of lights) {
      if (L.x + L.r < camX || L.x - L.r > camX + G.W || L.y + L.r < camY || L.y - L.r > camY + G.H) continue;
      const fl = L.flicker ? 1 - L.flicker * 0.5 + L.flicker * 0.5 * Math.sin(t * 9 + L.x) * Math.sin(t * 5.7 + L.y) : 1;
      const r = L.r * fl;
      const g = l.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.45, 'rgba(0,0,0,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(L.x - r, L.y - r, r * 2, r * 2);
      vis.push([L, r]);
    }
    ctx.save();
    ctx.drawImage(lightCanvas, 0, 0, G.W, G.H);
    // additive colour glow (bloom-ish)
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(-camX, -camY);
    const glowK = (lc.glow == null ? 0.22 : lc.glow) * Math.min(1, lc.ambient * 1.4 + 0.2);
    for (const [L, r] of vis) {
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, r * 0.8);
      g.addColorStop(0, U.rgba(L.color || '#ffb060', glowK));
      g.addColorStop(1, U.rgba(L.color || '#ffb060', 0));
      ctx.fillStyle = g;
      ctx.fillRect(L.x - r, L.y - r, r * 2, r * 2);
    }
    ctx.restore();
    if (lc.tint) {
      ctx.save();
      ctx.globalCompositeOperation = lc.tintMode || 'soft-light';
      ctx.fillStyle = lc.tint;
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------- vignette
  let vigC = null;
  FX.vignette = function (ctx, strength = 0.35) {
    if (!vigC) {
      vigC = U.makeCanvas(G.W, G.H);
      const v = vigC.getContext('2d');
      const g = v.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.35, G.W / 2, G.H / 2, G.W * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      v.fillStyle = g; v.fillRect(0, 0, G.W, G.H);
    }
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.drawImage(vigC, 0, 0, G.W, G.H);
    ctx.restore();
  };

  // ---------------------------------------------------------------- psychedelic vision overlay
  let buf = null;
  FX.vision = function (ctx, t, k) {
    k *= G.settings.visualFx == null ? 1 : G.settings.visualFx;
    if (k <= 0.01) return;
    const cv = G.canvas;
    if (!buf || buf.width !== cv.width) {
      buf = document.createElement('canvas');
      buf.width = cv.width; buf.height = cv.height;
    }
    const b = buf.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.drawImage(cv, 0, 0);
    ctx.save();
    // 1) breathing ripple: redraw in horizontal strips with sine offsets
    const strips = 40;
    const sh = G.H / strips;
    const S = G.S;
    const amp = 5 * k;
    const breathe = 1 + 0.012 * k * Math.sin(t * 0.9);
    ctx.translate(G.W / 2, G.H / 2); ctx.scale(breathe, breathe); ctx.translate(-G.W / 2, -G.H / 2);
    for (let i = 0; i < strips; i++) {
      const y = i * sh;
      const off = Math.sin(t * 1.6 + i * 0.35) * amp + Math.sin(t * 0.7 + i * 0.13) * amp * 0.6;
      ctx.drawImage(buf, 0, y * S, buf.width, sh * S + 1, off, y, G.W, sh + 0.6);
    }
    ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
    // 2) colour breathing — rotating rainbow in overlay mode
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.32 * k;
    let grad;
    if (ctx.createConicGradient) {
      grad = ctx.createConicGradient(t * 0.25, G.W / 2, G.H / 2);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60},100%,55%)`);
    } else {
      grad = ctx.createLinearGradient(0, 0, G.W, G.H);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${(i * 60 + t * 40) % 360},100%,55%)`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, G.W, G.H);
    // 3) drifting soft colour blooms (screen)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22 * k;
    for (let i = 0; i < 5; i++) {
      const x = G.W / 2 + Math.cos(t * 0.23 + i * 1.3) * G.W * 0.38;
      const y = G.H / 2 + Math.sin(t * 0.31 + i * 2.1) * G.H * 0.38;
      const r = 260 + 80 * Math.sin(t * 0.5 + i);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${(i * 72 + t * 30) % 360},100%,65%,1)`);
      g.addColorStop(1, `hsla(${(i * 72 + t * 30) % 360},100%,65%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 4) sacred-geometry rings at the edges
    ctx.globalAlpha = 0.18 * k;
    ctx.lineWidth = 1.5;
    ctx.translate(G.W / 2, G.H / 2);
    for (let ring = 0; ring < 3; ring++) {
      const R = 420 + ring * 90 + Math.sin(t * 0.8 + ring) * 20;
      const n = 12 + ring * 6;
      ctx.strokeStyle = `hsl(${(t * 50 + ring * 120) % 360},100%,70%)`;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * (ring % 2 ? -0.1 : 0.12);
        const x = Math.cos(a) * R, y = Math.sin(a) * R * 0.62;
        ctx.moveTo(x + 26, y);
        ctx.arc(x, y, 26, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------- chapter title card scene
  class TitleCard {
    constructor(title, sub, res) { this.title = title; this.sub = sub; this.res = res; this.t = 0; }
    update(dt) {
      this.t += dt;
      if (((G.Input.pressed('ok') || G.Input.clicked()) && this.t > 1) || (G.Debug && G.Debug.autoplay)) this.t = Math.max(this.t, 4.3);
      if (this.t > 4.4) { G.Scenes.pop(this); this.res(); }
    }
    draw(ctx) {
      const t = this.t;
      const a = Math.min(1, t / 0.8, (4.4 - t) / 0.8);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t / 0.5, (4.4 - t) / 0.5);
      ctx.fillStyle = '#04050b';
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = Math.max(0, a);
      // ink wash stroke
      const w = Math.min(1, t / 1.2) * 820;
      const g = ctx.createLinearGradient(G.W / 2 - 410, 0, G.W / 2 - 410 + w, 0);
      g.addColorStop(0, 'rgba(140,40,30,0)'); g.addColorStop(0.2, 'rgba(140,40,30,0.55)'); g.addColorStop(1, 'rgba(140,40,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(G.W / 2, G.H / 2 + 6, 410, 52, -0.02, 0, Math.PI * 2);
      ctx.fill();
      G.Render.text(ctx, this.sub || '', G.W / 2, G.H / 2 - 92, { size: 24, align: 'center', color: '#c9b893' });
      G.Render.text(ctx, this.title, G.W / 2, G.H / 2 - 30, { size: 60, align: 'center', color: '#fff1d0', glow: 'rgba(255,170,90,0.7)', glowBlur: 24 });
      G.UI.lanternIcon(ctx, G.W / 2, G.H / 2 + 92, 10, G.time);
      ctx.restore();
    }
  }
  FX.TitleCard = TitleCard;

  // ---------------------------------------------------------------- heart lantern (心燈) acquisition
  class LanternGet {
    constructor(name, res) { this.name = name; this.res = res; this.t = 0; G.Audio.sfx('lantern'); }
    update(dt) {
      this.t += dt;
      if ((this.t > 1.5 && (G.Input.pressed('ok') || G.Input.clicked())) || (G.Debug && G.Debug.autoplay)) this.t = Math.max(this.t, 4.1);
      if (this.t > 4.2) { G.Scenes.pop(this); this.res(); }
    }
    draw(ctx) {
      const t = this.t;
      const a = Math.min(1, t / 0.5, (4.2 - t) / 0.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a) * 0.6;
      ctx.fillStyle = '#05060f';
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = Math.max(0, a);
      const rise = U.ease.outCubic(Math.min(1, t / 1.6));
      const x = G.W / 2, y = G.H * 0.78 - rise * G.H * 0.36;
      const pulse = 1 + 0.08 * Math.sin(t * 6);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const r = (60 + i * 50) * pulse * rise;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r + 1);
        g.addColorStop(0, `rgba(255,200,120,${0.5 - i * 0.12})`);
        g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // sparks
      for (let i = 0; i < 18; i++) {
        const ang = i / 18 * Math.PI * 2 + t * 0.5;
        const rr = 40 + ((t * 60 + i * 23) % 120);
        ctx.fillStyle = `rgba(255,220,150,${Math.max(0, 1 - rr / 160)})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7 - rr * 0.3, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      G.UI.lanternIcon(ctx, x, y, 18 * pulse, G.time);
      const ta = Math.min(1, Math.max(0, (t - 1.2) / 0.6));
      ctx.globalAlpha = Math.max(0, a) * ta;
      G.Render.text(ctx, '點亮心燈', x, y + 64, { size: 22, align: 'center', color: '#ffd9a0' });
      G.Render.text(ctx, this.name, x, y + 96, { size: 34, align: 'center', color: '#fff3d8', glow: 'rgba(255,170,90,0.7)', glowBlur: 16 });
      G.Render.text(ctx, `已點亮的心燈：${G.Lanterns.count()}`, x, y + 148, { size: 20, align: 'center', color: '#c9b893' });
      ctx.restore();
    }
  }
  FX.LanternGet = LanternGet;

  // cached radial glow sprites by colour (much cheaper than per-particle gradients)
  const glowCache = {};
  FX.glowSprite = function (c) {
    let g = glowCache[c];
    if (!g) {
      g = document.createElement('canvas');
      g.width = g.height = 32;
      const x = g.getContext('2d');
      const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, c); gr.addColorStop(0.35, U.rgba(c.length === 7 ? c : '#ffffff', 0.6)); gr.addColorStop(1, U.rgba(c.length === 7 ? c : '#ffffff', 0));
      x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      glowCache[c] = g;
    }
    return g;
  };

  // ---------------------------------------------------------------- generic particle burst (battle & field)
  class Burst {
    constructor(o) {
      this.parts = [];
      this.t = 0;
      this.life = o.life || 1;
      this.mode = o.mode || 'lighter';
      const n = o.n || 24;
      for (let i = 0; i < n; i++) {
        const a = o.angle != null ? o.angle + U.rand(-o.spread || 0, o.spread || 0) : U.rand(0, Math.PI * 2);
        const sp = U.rand(o.speedMin || 60, o.speed || 260);
        this.parts.push({
          x: o.x + U.rand(-(o.jitter || 0), o.jitter || 0), y: o.y + U.rand(-(o.jitter || 0), o.jitter || 0),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: U.rand(o.rMin || 2, o.r || 6),
          c: Array.isArray(o.color) ? U.pick(o.color) : (o.color || '#ffd080'),
          life: U.rand(0.5, 1) * this.life, g: o.gravity || 0, drag: o.drag == null ? 2 : o.drag,
          shape: o.shape || 'dot', rot: U.rand(0, 6),
        });
      }
    }
    update(dt) {
      this.t += dt;
      for (const p of this.parts) {
        p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += dt * 4;
      }
      return this.t < this.life;
    }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = this.mode;
      for (const p of this.parts) {
        const k = 1 - this.t / p.life;
        if (k <= 0) continue;
        ctx.globalAlpha = Math.min(1, k * 1.5);
        if (p.shape === 'dot') {
          ctx.drawImage(FX.glowSprite(p.c), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
        } else if (p.shape === 'shard') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.moveTo(0, -p.r * 1.6); ctx.lineTo(p.r * 0.6, 0); ctx.lineTo(0, p.r * 1.6); ctx.lineTo(-p.r * 0.6, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (p.shape === 'leaf') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (p.shape === 'ring') {
          ctx.strokeStyle = p.c; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - k) * 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  FX.Burst = Burst;

  return FX;
})();
