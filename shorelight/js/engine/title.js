// Title screen
'use strict';
G.Chapters = ['序章　夢', '第一章　九份燈火', '第二章　霧林天燈', '第三章　觀音艋舺', '第四章　竹塹風起', '第五章　鹿港舊夢',
  '第六章　府城長明', '第七章　雲山入夢', '第八章　逆潮', '第九章　王船南行', '第十章　後山巡境', '第十一章　黑水溝・彼岸', '終章'];

G.Title = (() => {
  const U = G.U;
  let bg = null;

  function buildBg() {
    const c = U.makeCanvas(G.W, G.H);
    const x = c.getContext('2d');
    // sky
    const sky = x.createLinearGradient(0, 0, 0, G.H * 0.62);
    sky.addColorStop(0, '#05071a'); sky.addColorStop(0.55, '#141a3e'); sky.addColorStop(1, '#3a2a4a');
    x.fillStyle = sky; x.fillRect(0, 0, G.W, G.H);
    // stars
    const rnd = U.seeded(42);
    for (let i = 0; i < 260; i++) {
      const sx = rnd() * G.W, sy = rnd() * G.H * 0.55, r = rnd() * 1.3 + 0.2;
      x.fillStyle = `rgba(255,250,235,${0.3 + rnd() * 0.6})`;
      x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
    }
    // moon
    const mx = 960, my = 150;
    const mg = x.createRadialGradient(mx, my, 10, mx, my, 220);
    mg.addColorStop(0, 'rgba(255,240,210,0.45)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
    x.fillStyle = mg; x.fillRect(mx - 220, my - 220, 440, 440);
    x.fillStyle = '#fbf0d4';
    x.beginPath(); x.arc(mx, my, 54, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(200,180,150,0.25)';
    x.beginPath(); x.arc(mx - 14, my - 10, 12, 0, Math.PI * 2); x.arc(mx + 18, my + 14, 8, 0, Math.PI * 2); x.fill();
    // far mountains
    const hz = G.H * 0.6;
    const layer = (col, base, amp, seed, freq) => {
      x.fillStyle = col;
      x.beginPath(); x.moveTo(0, G.H);
      for (let i = 0; i <= G.W; i += 8) {
        const h = base - (U.vnoise(i * freq, 0, seed) * amp + U.vnoise(i * freq * 3, 1, seed) * amp * 0.3);
        x.lineTo(i, h);
      }
      x.lineTo(G.W, G.H); x.fill();
    };
    layer('#1e2244', hz - 40, 160, 3, 0.004);
    layer('#161a34', hz - 10, 120, 7, 0.006);
    // Jiufen hillside town (left) with lit windows
    x.fillStyle = '#0d1022';
    x.beginPath(); x.moveTo(0, hz + 10);
    x.bezierCurveTo(120, hz - 260, 300, hz - 220, 470, hz - 60);
    x.lineTo(560, hz + 10); x.lineTo(0, hz + 10); x.fill();
    for (let i = 0; i < 46; i++) {
      const bx = rnd() * 460, slope = hz - 40 - Math.sin(Math.min(1, bx / 470) * Math.PI) * 190 * (0.6 + rnd() * 0.4);
      const bw = 18 + rnd() * 26, bh = 12 + rnd() * 16;
      x.fillStyle = '#121528';
      x.fillRect(bx, slope, bw, bh + 40);
      x.fillStyle = '#0a0c18';
      x.beginPath(); x.moveTo(bx - 4, slope); x.lineTo(bx + bw / 2, slope - 8); x.lineTo(bx + bw + 4, slope); x.fill();
      if (rnd() < 0.7) {
        x.fillStyle = rnd() < 0.5 ? 'rgba(255,170,90,0.85)' : 'rgba(255,90,60,0.85)';
        x.fillRect(bx + 4 + rnd() * (bw - 10), slope + 5, 4, 5);
      }
    }
    // sea
    const sea = x.createLinearGradient(0, hz, 0, G.H);
    sea.addColorStop(0, '#1a1a38'); sea.addColorStop(1, '#04050c');
    x.fillStyle = sea; x.fillRect(0, hz + 8, G.W, G.H - hz);
    // moon reflection
    for (let i = 0; i < 40; i++) {
      const yy = hz + 14 + i * 7;
      const w = 30 + i * 3 + rnd() * 20;
      x.fillStyle = `rgba(255,236,200,${0.22 - i * 0.005})`;
      x.fillRect(mx - w / 2 + (rnd() - 0.5) * 30, yy, w, 2);
    }
    return c;
  }

  class TitleScene {
    constructor() {
      this.opaque = true;
      this.t = 0;
      this.stage = 'press';
      this.lanterns = [];
      for (let i = 0; i < 26; i++) this.spawnLantern(true);
      this.buildMenu();
    }
    buildMenu() {
      const has = G.Save.any();
      this.items = [
        { label: '新的旅程', k: 'new' },
        { label: '繼續旅程', k: 'continue', disabled: !has },
        { label: '讀取進度', k: 'load', disabled: !has },
        { label: '設定', k: 'settings' },
        { label: G.I18N.isEn() ? '繁體中文' : 'English', k: 'lang' },
      ];
      this.list = new G.UI.List(this.items, { rows: this.items.length, rowH: 50, idx: has ? 1 : 0 });
    }
    spawnLantern(init) {
      const hz = G.H * 0.6;
      // lanterns drift from the foreground out toward the horizon
      const p = init ? Math.random() : 0;
      this.lanterns.push({ p, x0: U.rand(200, G.W - 100), spd: U.rand(0.018, 0.035), ph: U.rand(0, 7), hz, drift: U.rand(-60, 60) });
    }
    resume() { this.buildMenu(); }
    update(dt) {
      this.t += dt;
      for (const l of this.lanterns) { l.p += l.spd * dt; l.ph += dt; }
      this.lanterns = this.lanterns.filter((l) => l.p < 1);
      while (this.lanterns.length < 26) this.spawnLantern(false);
      const I = G.Input;
      if (this.stage === 'press') {
        if (I.anyKey() || I.clicked()) {
          G.Audio.unlock();
          this.stage = 'menu';
          G.Music.play('title', { fade: 2 });
          G.Audio.sfx('bell');
          I.clear();
        }
        return;
      }
      if (this.busy) return;
      const r = this.list.update();
      if (r === 'ok') {
        const k = this.list.cur.k;
        if (k === 'new') this.newGame();
        else if (k === 'continue') { const s = G.Save.latest(); if (s >= 0) G.loadGame(s); }
        else if (k === 'load') G.Scenes.push(new G.SaveScene('load', () => {}));
        else if (k === 'settings') G.Scenes.push(new G.SettingsScene());
        else if (k === 'lang') { G.settings.lang = G.I18N.isEn() ? 'zh' : 'en'; G.saveSettings(); const i = this.list.idx; this.buildMenu(); this.list.idx = i; }
      }
    }
    async newGame() {
      this.busy = true;
      G.Music.stop(1.5);
      await G.Render.fadeTo(1, 1.2);
      G.state = G.newState();
      G.inGame = true;
      G.Script.reset();
      G.Dialog.log.length = 0;
      if (G.Story && G.Story.newGame) G.Story.newGame();
      else {
        G.Party.join('xinghe', 1);
        G.Mapx.goto(Object.keys(G.Maps.defs)[0], 5, 5, 'down');
      }
      await G.Render.fadeTo(0, 1.0);
    }
    draw(ctx) {
      const t = this.t;
      if (!bg) bg = buildBg();
      ctx.drawImage(bg, 0, 0, G.W, G.H);
      const hz = G.H * 0.6;
      // shimmering water lines
      ctx.save();
      for (let i = 0; i < 26; i++) {
        const yy = hz + 20 + i * i * 0.45;
        const off = Math.sin(t * 0.8 + i) * 30;
        ctx.strokeStyle = `rgba(160,170,230,${0.05 + i * 0.002})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.bezierCurveTo(G.W * 0.3 + off, yy + 3, G.W * 0.6 - off, yy - 3, G.W, yy); ctx.stroke();
      }
      // drifting lanterns (perspective: big near bottom, tiny near horizon)
      const sorted = this.lanterns.slice().sort((a, b) => a.p - b.p).reverse();
      for (const l of sorted) {
        const k = 1 - l.p;
        const persp = Math.pow(k, 1.6);
        const y = hz + 6 + persp * (G.H - hz + 60);
        const x = G.W / 2 + (l.x0 - G.W / 2) * (0.15 + persp * 0.85) + l.drift * l.p + Math.sin(l.ph * 0.7) * 6 * persp;
        const s = 0.15 + persp * 1.1;
        const fl = 0.85 + 0.15 * Math.sin(l.ph * 8) * Math.sin(l.ph * 3.3);
        const a = Math.min(1, l.p * 8) * Math.min(1, (1 - l.p) * 3);
        ctx.globalAlpha = a;
        // reflection
        const rg = ctx.createRadialGradient(x, y + 18 * s, 0, x, y + 18 * s, 50 * s);
        rg.addColorStop(0, `rgba(255,150,60,${0.35 * fl})`); rg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = rg; ctx.fillRect(x - 50 * s, y - 30 * s, 100 * s, 100 * s);
        ctx.fillStyle = `rgba(255,170,80,${0.4 * fl})`;
        ctx.fillRect(x - 6 * s, y + 14 * s, 12 * s, 26 * s * fl);
        // boat base
        ctx.fillStyle = '#3a2418';
        ctx.beginPath(); ctx.ellipse(x, y + 8 * s, 16 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
        // lantern body
        const lg = ctx.createLinearGradient(x, y - 24 * s, x, y + 6 * s);
        lg.addColorStop(0, '#ffe8b0'); lg.addColorStop(1, '#ff8a3a');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(x - 10 * s, y + 6 * s); ctx.lineTo(x - 8 * s, y - 20 * s); ctx.lineTo(x + 8 * s, y - 20 * s); ctx.lineTo(x + 10 * s, y + 6 * s);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7a1a14';
        ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 20 * s); ctx.lineTo(x, y - 30 * s); ctx.lineTo(x + 12 * s, y - 20 * s); ctx.closePath(); ctx.fill();
        const gg = ctx.createRadialGradient(x, y - 8 * s, 0, x, y - 8 * s, 46 * s);
        gg.addColorStop(0, `rgba(255,190,100,${0.35 * fl})`); gg.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gg; ctx.fillRect(x - 46 * s, y - 54 * s, 92 * s, 92 * s);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      G.FX.vignette(ctx, 0.5);
      // title
      const ta = Math.min(1, t / 2.5);
      ctx.save();
      ctx.globalAlpha = ta;
      G.Render.text(ctx, '彼岸燈', G.W / 2, 118, { size: 120, align: 'center', color: '#fff3dc', glow: 'rgba(255,170,90,0.85)', glowBlur: 34 });
      ctx.font = G.font(26);
      const sub = 'S H O R E L I G H T';
      G.Render.text(ctx, sub, G.W / 2, 262, { size: 24, align: 'center', color: '#e8cfa0' });
      ctx.strokeStyle = 'rgba(232,207,160,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(G.W / 2 - 300, 300); ctx.lineTo(G.W / 2 - 40, 300); ctx.moveTo(G.W / 2 + 40, 300); ctx.lineTo(G.W / 2 + 300, 300); ctx.stroke();
      G.UI.lanternIcon(ctx, G.W / 2, 300, 7, t);
      ctx.restore();
      if (this.stage === 'press') {
        const a = 0.5 + 0.5 * Math.sin(t * 2.5);
        G.Render.text(ctx, '按任意鍵開始', G.W / 2, 520, { size: 26, align: 'center', color: '#f6ead0', alpha: a * ta });
      } else {
        const mx = G.W / 2 - 130, my = 430;
        const g = ctx.createRadialGradient(G.W / 2, my + 100, 20, G.W / 2, my + 100, 260);
        g.addColorStop(0, 'rgba(4,6,16,0.72)'); g.addColorStop(1, 'rgba(4,6,16,0)');
        ctx.fillStyle = g; ctx.fillRect(G.W / 2 - 300, my - 120, 600, 440);
        this.list.draw(ctx, mx, my, 260, t, { size: 26 });
      }
      G.Render.text(ctx, 'v1.0　© Shorelight Team', G.W - 20, G.H - 30, { size: 14, align: 'right', color: 'rgba(220,210,190,0.45)' });
    }
  }

  return {
    start() {
      G.inGame = false;
      G.Script && G.Script.reset && G.Script.reset();
      G.mapScene = null;
      G.Render.fade.a = 0;
      const s = new TitleScene();
      if (G.Audio.ctx && G.Audio.ctx.state === 'running') { s.stage = 'menu'; G.Music.play('title', { fade: 1.5 }); }
      G.Scenes.replace(s);
    },
  };
})();
