'use strict';
// Particles, floating text and confetti. Reduce-effects setting thins them out.
(function () {
  const G = window.G;
  const FX = (G.FX = G.FX || { parts: [], texts: [] });
  const reduced = () => G.Settings && G.Settings.get('reduceFx');

  FX.burst = function (x, y, col, n, opts) {
    opts = opts || {};
    if (reduced()) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 180) * (0.4 + Math.random() * 0.8);
      FX.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 60), g: opts.g == null ? 520 : opts.g,
        life: 0, max: (opts.life || 0.55) * (0.6 + Math.random() * 0.6), r: (opts.r || 5) * (0.6 + Math.random() * 0.8),
        col: Array.isArray(col) ? col[i % col.length] : col, kind: opts.kind || 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    }
  };
  FX.confetti = function (n) {
    const cols = ['#ef6f6c', '#f6d55c', '#7cc6a4', '#6fa8dc', '#a98bd6', '#f4a259'];
    if (reduced()) n = Math.ceil(n / 4);
    for (let i = 0; i < n; i++) {
      FX.parts.push({ x: Math.random() * G.W, y: -20 - (G.Render.padY || 0) - Math.random() * 200, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 120, g: 40,
        life: 0, max: 3 + Math.random() * 1.5, r: 5 + Math.random() * 4, col: cols[i % cols.length], kind: 'paper', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
  };
  FX.text = function (str, x, y, opts) {
    opts = opts || {};
    FX.texts.push({ str, x, y, t: 0, max: opts.life || 0.9, size: opts.size || 28, col: opts.col || '#fff', stroke: opts.stroke || G.CONFIG.palette.ink, rise: opts.rise == null ? 60 : opts.rise });
  };
  FX.update = function (dt) {
    for (const p of FX.parts) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
    FX.parts = FX.parts.filter((p) => p.life < p.max);
    for (const t of FX.texts) t.t += dt;
    FX.texts = FX.texts.filter((t) => t.t < t.max);
  };
  FX.draw = function (ctx) {
    ctx.save();
    for (const p of FX.parts) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.col;
      if (p.kind === 'paper') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8); ctx.restore();
      } else if (p.kind === 'star') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? p.r * 0.45 : p.r, an = i * Math.PI / 5; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
        ctx.fill(); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    for (const t of FX.texts) {
      const k = t.t / t.max;
      const pop = k < 0.15 ? G.U.ease.outBack(k / 0.15) : 1;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      G.Render.text(ctx, t.str, t.x, t.y - k * t.rise, { size: t.size * pop, color: t.col, stroke: t.stroke, weight: 900 });
      ctx.restore();
    }
  };
  FX.clear = () => { FX.parts = []; FX.texts = []; };
})();
