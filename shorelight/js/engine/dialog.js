// Dialogue system: portrait dialogue box with typewriter, choices, narration, backlog, auto & skip.
'use strict';
G.Names = {
  xinghe: '沈星河', baizhi: '白芷', hongying: '洛紅纓', yungui: '雲歸', tuanzi: '糰子',
  chenbo: '陳伯', yexuan: '夜玄', qingfeng: '洛青鋒', qingfeng_mask: '鬼面', qingxu: '清虛真人',
  moya: '墨鴉', tengpo: '藤婆', nianer: '夜念', abing: '阿炳伯', agan: '阿柑姨', xiaojin: '小金',
  atu: '阿土伯', alian: '阿蓮', linto: '林投姐', lantern_mother: '燈母',
};
// short display names used in dialogue (players know them)
G.ShortNames = { xinghe: '星河', hongying: '紅纓', qingfeng: '青鋒' };

G.Dialog = (() => {
  const D = {};
  const log = [];
  D.log = log;
  const BOX = { x: 36, y: G.H - 222, w: G.W - 72, h: 196 };

  function parseWho(who) {
    if (!who) return { id: null, expr: 'normal', name: '' };
    let [id, expr] = String(who).split(':');
    expr = expr || 'normal';
    const known = G.Names[id];
    let name = known ? (G.ShortNames[id] || known) : id;
    if (id === '?') name = '？？？';
    return { id: known ? id : null, expr, name };
  }

  class DialogScene {
    constructor() {
      this.opaque = false;
      this.lines = null;
      this.shown = 0;
      this.done = false;
      this.resolve = null;
      this.idle = 0;
      this.alpha = 0;
      this.closing = false;
      this.portraitX = 0;
      this.autoT = 0;
      this.mode = 'say';
    }
    setLine(who, text, o, resolve) {
      const w = parseWho(who);
      const prevId = this.who && this.who.id;
      this.who = w;
      this.text = text;
      this.opts = o || {};
      this.resolve = resolve;
      this.shown = 0;
      this.done = false;
      this.idle = 0;
      this.autoT = 0;
      this.closing = false;
      if (w.id !== prevId) this.portraitX = w.id ? -60 : 0;
      this.hasPortrait = !!(w.id && G.Portraits && G.Portraits.has(w.id) && !this.opts.noPortrait);
      const ctx = G.ctx;
      ctx.save();
      const en = G.I18N.isEn();
      this.fontSize = this.opts.size || (en ? 25 : 27);
      this.lineH = en ? 36 : 40;
      ctx.font = G.font(this.fontSize);
      const tx = this.hasPortrait ? 300 : 40;
      this.textX = BOX.x + tx;
      const all = G.Render.wrap(ctx, text, BOX.w - tx - 40);
      ctx.restore();
      // long (usually translated) lines are split into pages of `maxLines`
      const maxLines = en ? 4 : 3;
      this.pages = [];
      for (let i = 0; i < all.length; i += maxLines) this.pages.push(all.slice(i, i + maxLines));
      if (!this.pages.length) this.pages.push([]);
      this.page = 0;
      this.lines = this.pages[0];
      this.total = G.Render.countGlyphs(this.lines);
      log.push({ name: w.name, text });
      if (log.length > 200) log.shift();
    }
    update(dt) {
      const I = G.Input;
      if (this.alpha < 1 && !this.closing) this.alpha = Math.min(1, this.alpha + dt * 6);
      this.portraitX += (0 - this.portraitX) * Math.min(1, dt * 12);
      if (I.pressed('log')) { G.Scenes.push(new BacklogScene()); return; }
      if (I.pressed('auto')) { G.settings.autoAdvance = !G.settings.autoAdvance; G.UI.toast(G.settings.autoAdvance ? '自動播放：開' : '自動播放：關'); }
      if (!this.resolve) {
        // waiting for next line from the script; close if none arrives
        this.idle += dt;
        if (this.idle > 0.05) {
          this.alpha -= dt * 8;
          if (this.alpha <= 0) G.Scenes.pop(this);
        }
        I.pressed('ok'); I.clicked();
        return;
      }
      const speeds = [25, 40, 65, 140, 9999];
      const cps = speeds[G.U.clamp(G.settings.textSpeed, 0, 4)];
      const skipping = I.held('skip') || (G.Debug && G.Debug.autoplay);
      if (!this.done) {
        const before = Math.floor(this.shown);
        this.shown += dt * (skipping ? 9999 : cps);
        if (Math.floor(this.shown) > before && Math.floor(this.shown) % 3 === 0 && cps < 999) G.Audio.sfx('text');
        if (this.shown >= this.total) { this.shown = this.total; this.done = true; }
        if (I.pressed('ok') || I.clicked()) { this.shown = this.total; this.done = true; }
      } else {
        this.autoT += dt;
        const autoGo = G.settings.autoAdvance && this.autoT > 1.2 + this.total * 0.04;
        // evaluate once: pressed()/clicked() consume the input
        const adv = I.pressed('ok') || I.clicked() || autoGo || (skipping && this.autoT > 0.06);
        if (adv && this.page < this.pages.length - 1) {
          this.page++;
          this.lines = this.pages[this.page];
          this.total = G.Render.countGlyphs(this.lines);
          this.shown = 0; this.done = false; this.autoT = 0;
          return;
        }
        if (adv) {
          const r = this.resolve;
          this.resolve = null;
          this.idle = 0;
          r();
        }
      }
    }
    draw(ctx) {
      if (this.alpha <= 0 || !this.lines) return;
      const t = G.time;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      // portrait
      if (this.hasPortrait) {
        const pw = 330, ph = 380;
        G.Portraits.draw(ctx, this.who.id, this.who.expr, BOX.x - 10 + this.portraitX, BOX.y + BOX.h - ph - 4, pw, ph, t, {});
      }
      UI_box(ctx, this.hasPortrait);
      // name plate
      if (this.who.name) {
        const nx = this.hasPortrait ? BOX.x + 290 : BOX.x + 30;
        ctx.font = G.font(24, true);
        const nw = G.Render.measure(ctx, this.who.name) + 44;
        const g = ctx.createLinearGradient(nx, BOX.y - 22, nx, BOX.y + 14);
        g.addColorStop(0, '#8a2f24'); g.addColorStop(1, '#561a14');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(nx, BOX.y - 22, nw, 40, 6); ctx.fill();
        ctx.strokeStyle = G.UI.GOLD; ctx.lineWidth = 1.5; ctx.stroke();
        G.Render.text(ctx, this.who.name, nx + nw / 2, BOX.y - 15, { size: 24, bold: true, align: 'center', color: '#fbe7b8' });
      }
      ctx.font = G.font(this.fontSize);
      ctx.textBaseline = 'top';
      G.Render.drawLines(ctx, this.lines, this.textX, BOX.y + (this.lineH < 40 ? 30 : 36), this.lineH, this.opts.color || '#f6efdc', Math.floor(this.shown));
      if (this.done && this.resolve) {
        // advance indicator: little bobbing lantern
        G.UI.lanternIcon(ctx, BOX.x + BOX.w - 40, BOX.y + BOX.h - 32 + Math.sin(t * 5) * 3, 8, t);
      }
      if (G.settings.autoAdvance) G.Render.text(ctx, 'AUTO', BOX.x + BOX.w - 90, BOX.y + 12, { size: 15, color: '#ffd97a' });
      ctx.restore();
    }
  }

  function UI_box(ctx, withPortrait) {
    G.UI.panel(ctx, BOX.x + (withPortrait ? 250 : 0), BOX.y, BOX.w - (withPortrait ? 250 : 0), BOX.h, {
      top: 'rgba(20,26,46,0.92)', bottom: 'rgba(8,10,22,0.95)',
    });
  }

  class ChoiceScene {
    constructor(options, resolve, o = {}) {
      this.opts = o;
      this.list = new G.UI.List(options.map((l) => ({ label: l })), { rows: Math.min(6, options.length), rowH: 50 });
      this.resolve = resolve;
      this.alpha = 0;
      this.options = options;
      const ctx = G.ctx;
      ctx.font = G.font(25);
      // capped to the screen; a longer (translated) option is shrunk to fit by the list (no ellipsis for choices)
      this.w = Math.min(G.W - 120, Math.max(280, ...options.map((s) => G.Render.measure(ctx, s) + 90)));
      this.h = this.list.rows * 50 + 36;
      this.x = G.W - this.w - 60;
      this.y = BOX.y - this.h - 24;
      if (o.center) { this.x = (G.W - this.w) / 2; this.y = (G.H - this.h) / 2; }
    }
    update(dt) {
      this.alpha = Math.min(1, this.alpha + dt * 6);
      if ((G.Debug && G.Debug.autoplay)) {
        const q = G.Debug.choices;
        let pick = q && q.length ? q.shift() : 0;
        if (typeof pick === 'string') { const j = this.options.findIndex((o) => o.includes(pick)); pick = j < 0 ? 0 : j; }
        G.Debug.log && G.Debug.log.push('choice: ' + this.options.join(' / ') + ' -> ' + this.options[pick]);
        G.Scenes.pop(this); this.resolve(Math.min(pick, this.options.length - 1)); return;
      }
      const r = this.list.update();
      if (r === 'ok') { G.Scenes.pop(this); this.resolve(this.list.idx); }
      else if (r === 'cancel' && this.opts.cancel != null) { G.Scenes.pop(this); this.resolve(this.opts.cancel); }
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      G.UI.panel(ctx, this.x, this.y, this.w, this.h);
      this.list.draw(ctx, this.x + 20, this.y + 18, this.w - 30, G.time, { size: 25, minSize: 15, ellipsis: false });
      ctx.restore();
    }
  }

  class BacklogScene {
    constructor() { this.scroll = 0; }
    update() {
      const I = G.Input;
      if (I.pressed('cancel') || I.pressed('log') || I.pressed('ok')) { G.Scenes.pop(this); return; }
      if (I.repeat('up')) this.scroll = Math.min(log.length - 1, this.scroll + 1);
      if (I.repeat('down')) this.scroll = Math.max(0, this.scroll - 1);
    }
    draw(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,6,14,0.88)';
      ctx.fillRect(0, 0, G.W, G.H);
      G.Render.text(ctx, '對話紀錄', 60, 36, { size: 30, color: G.UI.GOLD_L });
      let y = G.H - 80;
      ctx.font = G.font(22);
      for (let i = log.length - 1 - this.scroll; i >= 0 && y > 90; i--) {
        const e = log[i];
        const lines = G.Render.wrap(ctx, e.text, G.W - 360);
        // long (English) speaker names wrap inside the 160px name column instead of running into the text
        const nameLines = e.name ? G.Render.wrap(ctx, e.name, 160) : [];
        y -= Math.max(lines.length * 32, nameLines.length * 28) + 18;
        if (nameLines.length === 1) G.Render.text(ctx, e.name, 80, y, { size: 22, color: '#ffcf8a' });
        else if (nameLines.length) G.Render.drawLines(ctx, nameLines, 80, y, 28, '#ffcf8a');
        ctx.font = G.font(22); ctx.textBaseline = 'top';
        G.Render.drawLines(ctx, lines, 250, y, 32, '#e8e0cc');
      }
      G.UI.hints(ctx, [['↑↓', '捲動'], ['L', '關閉']]);
      ctx.restore();
    }
  }

  // Full-screen narration: lines fade in one by one over a dark veil
  class NarrateScene {
    constructor(lines, resolve, o) {
      this.lines = lines; this.resolve = resolve; this.o = o || {};
      this.t = 0; this.idx = 0; this.lineT = 0; this.alpha = 0; this.closing = false;
    }
    update(dt) {
      this.t += dt; this.lineT += dt;
      if (!this.closing) this.alpha = Math.min(1, this.alpha + dt * 2);
      else { this.alpha -= dt * 2; if (this.alpha <= 0) { G.Scenes.pop(this); this.resolve(); } return; }
      const I = G.Input;
      const adv = I.pressed('ok') || I.clicked() || ((I.held('skip') || (G.Debug && G.Debug.autoplay)) && this.lineT > 0.1) || (G.settings.autoAdvance && this.lineT > 2.5);
      if (adv) {
        if (this.lineT < 0.9) this.lineT = 0.9;
        else if (this.idx < this.lines.length - 1) { this.idx++; this.lineT = 0; }
        else this.closing = true;
      }
    }
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = this.alpha * (this.o.veil == null ? 0.82 : this.o.veil);
      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = this.alpha;
      const n = this.idx + 1;
      const lh = 50;
      // Lines too wide for the screen (most English narration) wrap onto extra rows at full size instead of being
      // shrunk; the block stays vertically centred. A line that fits keeps the original one-row layout.
      if (!this.layout || this.layout.lang !== G.I18N.lang()) {
        const size0 = this.o.size || 30;
        const build = (size) => {
          ctx.font = G.font(size);
          const rows = this.lines.map((l) => G.Render.wrap(ctx, l, G.W - 160).map((r) => r.map((g) => g.ch).join('')));
          const rowH = Math.round(size * 1.3);
          const height = rows.reduce((h, r) => h + lh + Math.max(0, r.length - 1) * rowH, 0);
          return { rows, rowH, size, height, lang: G.I18N.lang() };
        };
        let L = build(size0);
        while (L.height > G.H - 60 && L.size > 18) L = build(L.size - 2);
        this.layout = L;
      }
      const L = this.layout;
      let y = G.H / 2 - L.height / 2;
      for (let i = 0; i < n; i++) {
        const a = i === this.idx ? Math.min(1, this.lineT / 0.9) : 1;
        const rows = L.rows[i].length ? L.rows[i] : [''];
        rows.forEach((row, k) => {
          G.Render.text(ctx, row, G.W / 2, y + k * L.rowH + (1 - a) * 8, {
            size: L.size, align: 'center', color: this.o.color || '#efe3c2', alpha: a,
          });
        });
        y += lh + (rows.length - 1) * L.rowH;
      }
      ctx.restore();
    }
  }

  let scene = null;
  D.say = function (who, text, o) {
    return new Promise((res) => {
      if (!scene || !G.Scenes.has(scene)) {
        scene = new DialogScene();
        G.Scenes.push(scene);
      } else if (G.Scenes.top() !== scene) {
        // something else is on top; bring dialog to top
        G.Scenes.pop(scene);
        G.Scenes.push(scene);
      }
      scene.setLine(who, text, o, res);
    });
  };
  D.choice = function (options, o = {}) {
    return new Promise((res) => {
      G.Scenes.push(new ChoiceScene(options, res, o));
    });
  };
  D.narrate = function (lines, o) {
    return new Promise((res) => {
      if (scene && G.Scenes.has(scene)) { G.Scenes.pop(scene); scene = null; }
      G.Scenes.push(new NarrateScene([].concat(lines), res, o));
    });
  };
  D.close = function () {
    if (scene && G.Scenes.has(scene)) G.Scenes.pop(scene);
    scene = null;
  };
  D.isOpen = () => !!(scene && G.Scenes.has(scene));
  return D;
})();
