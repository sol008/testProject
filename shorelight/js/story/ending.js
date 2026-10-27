// Ending sequences & credits roll. Story text for the endings lives in the chapter-11 file, which calls
//   await S.ending('true' | 'normal')   after its final cutscene.
// G.Ending.credits is filled from docs/story/endings.md by the chapter implementer (array of lines;
// lines starting with '#' are section headings, '' is a spacer).
'use strict';
G.Ending = (() => {
  const E = {};
  const U = G.U;
  E.credits = [
    '#彼岸燈　Shorelight',
    '',
    '#劇本・世界觀',
    'Claude',
    '',
    '#美術・音樂・程式',
    'Claude 與 Shorelight Team',
    '',
    '#特別感謝',
    '福爾摩沙的每一座山、每一條河、每一片海',
    '以及記得它們的人',
    '',
    '',
    '謝謝你的遊玩',
  ];
  E.stinger = { true: null, normal: null }; // optional async (S) => {} post-credit scenes

  class CreditsScene {
    constructor(kind, res) {
      this.opaque = true;
      this.kind = kind; this.res = res;
      this.t = 0;
      this.scroll = 0;
      this.lanterns = [];
      const n = kind === 'true' ? Math.max(40, G.Lanterns.count() * 8) : 6;
      for (let i = 0; i < n; i++) this.lanterns.push({ x: U.rand(0, G.W), y: G.H + U.rand(0, 1400), s: U.rand(0.4, 1.3), ph: U.rand(0, 7), v: U.rand(14, 34) });
      this.lineH = 46;
      this.total = E.credits.length * this.lineH + G.H + 200;
      // lead-in: the last line of the ending is left to ring in silence while the first lanterns rise;
      // only then does the credits theme come in and the names start to scroll
      this.pre = 2.2;
      this.musicOn = false;
    }
    update(dt) {
      this.t += dt;
      const fast = G.Input.held('ok') || G.Input.held('skip');
      if (fast) this.pre = Math.min(this.pre, this.t);
      if (!this.musicOn && this.t >= this.pre) { this.musicOn = true; G.Music.play(this.kind === 'true' ? 'credits' : 'sad', { fade: 3 }); }
      if (this.t >= this.pre) this.scroll += dt * (fast ? 260 : 46);
      for (const l of this.lanterns) {
        l.y -= l.v * dt * (fast ? 4 : 1); l.ph += dt;
        if (l.y < -60) { l.y = G.H + U.rand(20, 300); l.x = U.rand(0, G.W); }
      }
      if (this.scroll > this.total) {
        if (!this.endT) this.endT = this.t;
        if (this.t - this.endT > 3 || (this.t - this.endT > 0.8 && G.Input.pressed('ok'))) { G.Scenes.pop(this); this.res(); }
      }
    }
    draw(ctx) {
      const t = this.t;
      const sky = ctx.createLinearGradient(0, 0, 0, G.H);
      if (this.kind === 'true') { sky.addColorStop(0, '#0a0c24'); sky.addColorStop(0.7, '#2a1a3a'); sky.addColorStop(1, '#5a2a2a'); }
      else { sky.addColorStop(0, '#04050c'); sky.addColorStop(1, '#141826'); }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, G.W, G.H);
      // sea
      ctx.fillStyle = 'rgba(5,6,16,0.85)'; ctx.fillRect(0, G.H * 0.72, G.W, G.H * 0.28);
      for (const l of this.lanterns) {
        const x = l.x + Math.sin(l.ph * 0.5) * 12, y = l.y, s = l.s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(G.FX.glowSprite('#ffb050'), x - 40 * s, y - 40 * s, 80 * s, 80 * s);
        ctx.globalCompositeOperation = 'source-over';
        const lg = ctx.createLinearGradient(x, y - 12 * s, x, y + 12 * s);
        lg.addColorStop(0, '#ffe6a8'); lg.addColorStop(1, '#ff8a3a');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(x - 8 * s, y - 12 * s); ctx.lineTo(x + 8 * s, y - 12 * s); ctx.lineTo(x + 6 * s, y + 11 * s); ctx.lineTo(x - 6 * s, y + 11 * s); ctx.closePath(); ctx.fill();
      }
      ctx.save();
      const y0 = G.H + 40 - this.scroll;
      E.credits.forEach((line, i) => {
        const y = y0 + i * this.lineH;
        if (y < -60 || y > G.H + 40) return;
        const a = U.clamp(Math.min((y + 20) / 140, (G.H - y) / 140), 0, 1);
        // (credit lines are fitted to the screen width: some English cast / lantern lines are very long)
        if (line.startsWith('#')) G.Render.textClip(ctx, G.T(line).replace(/^#/, ''), G.W / 2, y, G.W - 80, { size: i === 0 ? 52 : 24, align: 'center', color: i === 0 ? '#fff3dc' : '#e0c890', alpha: a, glow: i === 0 ? 'rgba(255,170,90,0.7)' : null, glowBlur: 20 });
        else if (line) G.Render.textClip(ctx, line, G.W / 2, y, G.W - 80, { size: 26, minSize: 16, align: 'center', color: '#f6ead0', alpha: a });
      });
      ctx.restore();
      if (this.endT) {
        const a = Math.min(1, (this.t - this.endT) / 1.5);
        G.Render.text(ctx, this.kind === 'true' ? '—— 完 ——' : '—— 彼岸 ——', G.W / 2, G.H / 2 - 30, { size: 56, align: 'center', color: '#fff3dc', alpha: a, glow: 'rgba(255,170,90,0.7)', glowBlur: 24 });
      }
      G.FX.vignette(ctx, 0.45);
    }
  }

  E.play = async function (kind = 'true') {
    const S = G.Script.S;
    G.Dialog.close();
    await new Promise((res) => G.Scenes.push(new CreditsScene(kind, res)));
    if (E.stinger[kind]) await E.stinger[kind](S);
    G.state.flags['cleared_' + kind] = true;
    G.state.flags.cleared = true;
    await G.Render.fadeTo(1, 1.5);
    G.Script.reset();
    G.Title.start();
    await G.Render.fadeTo(0, 1.5);
  };
  return E;
})();
