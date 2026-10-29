'use strict';
// Chapter 1 play scene: draws a G.M3.Board, turns pointer input into swaps, animates each resolution step.
(function () {
  const G = window.G;
  const R = G.Render, K = G.Clay, UI = G.UI, U = G.U;
  const PAL = () => G.CONFIG.palette;

  function M3Scene(levelN, resume) {
    this.resumeData = resume || null;
    this.name = 'match3';
    this.opaque = true;
    this.n = levelN;
    this.level = G.Progress.level(levelN);
    this.t = 0;
  }
  G.M3Scene = M3Scene;
  const S = M3Scene.prototype;

  S.enter = function () { this.start(); };

  S.start = function () {
    const rec = G.Progress.rec(this.n);
    if (this.resumeData) {
      this.board = G.M3.Board.restore(this.level, this.resumeData);
      this.resumeData = null;
    } else {
      G.Progress.startAttempt(this.n);
      this.board = new G.M3.Board(this.level, (this.level.seed * 7919 + rec.attempts * 104729) >>> 0);
    }
    this.saveNow();
    this.views = new Map();
    this.dying = [];
    this.busy = false;
    this.ended = false;
    this.sel = null;
    this.drag = null;
    this.hammerMode = false;
    this.mood = 'idle';
    this.moodT = 0;
    this.hint = null;
    this.goalPulse = 0;
    this.combo = 0;
    this.layout();
    for (const t of this.board.cells) if (t) this.views.set(t.id, { x: t.x, y: t.y - this.board.h - 1 - (this.board.h - t.y) * 0.2, vy: 0, s: 1, a: 1 });
    this.makeButtons();
    this.intro = 0;
    if (this.board.isWon() || this.board.isLost()) { G.Tw.wait(0.3).then(() => this.checkEnd()); return; }
    if (this.level.tutorial) {
      this.busy = true;
      G.Tw.wait(0.5).then(() => (G.Scenes.top() === this ? G.Story.play('tut_' + this.level.tutorial) : null)).then(() => { this.busy = false; G.Input.lastInput = G.time; });
    }
  };

  S.layout = function () {
    const b = this.board;
    const maxW = G.W - 30, maxH = 560;
    this.cell = Math.floor(Math.min(maxW / b.w, maxH / b.h, 70));
    this.bw = this.cell * b.w;
    this.bh = this.cell * b.h;
    this.bx = Math.round((G.W - this.bw) / 2);
    this.by = Math.round(215 + (maxH - this.bh) / 2);
  };
  S.cellCenter = function (x, y) { return { x: this.bx + (x + 0.5) * this.cell, y: this.by + (y + 0.5) * this.cell }; };
  S.cellAt = function (px, py) {
    const x = Math.floor((px - this.bx) / this.cell), y = Math.floor((py - this.by) / this.cell);
    return this.board.ok(x, y) ? { x, y } : null;
  };

  S.makeButtons = function () {
    const st = G.state;
    this.btnBack = UI.button({ x: 18, y: 22, w: 64, h: 64, icon: 'pause', col: '#fff3df', onTap: () => this.pause() });
    this.btnHammer = UI.button({ x: 120, y: 860, w: 120, h: 76, icon: 'hammer', col: '#fff3df', iconSize: 58, count: st.boosters.hammer || 0,
      onTap: () => this.booster('hammer') });
    this.btnShuffle = UI.button({ x: 300, y: 860, w: 120, h: 76, icon: 'shuffle', col: '#fff3df', iconSize: 58, count: st.boosters.shuffle || 0,
      onTap: () => this.booster('shuffle') });
    this.ui = [this.btnBack, this.btnHammer, this.btnShuffle];
    if (this.level.hard) { this.btnHammer.enabled = false; this.btnShuffle.enabled = false; }
  };
  S.refreshCounts = function () {
    this.btnHammer.count = G.state.boosters.hammer || 0;
    this.btnShuffle.count = G.state.boosters.shuffle || 0;
  };

  S.pause = function () {
    if (this.ended) return;
    G.Scenes.push(new G.PauseScene({ onRetry: () => G.playLevel(this.n), onQuit: () => G.goHome() }));
  };

  S.booster = function (id) {
    if (this.busy || this.ended || this.level.hard) return;
    if (!(G.state.boosters[id] > 0)) { G.Scenes.push(new G.BuyScene(id, () => this.refreshCounts())); return; }
    if (id === 'hammer') { this.hammerMode = !this.hammerMode; this.sel = null; return; }
    if (id === 'shuffle') {
      G.Progress.useBooster('shuffle');
      this.refreshCounts();
      this.board.shuffle();
      this.animShuffle();
    }
  };

  S.animShuffle = function () {
    this.busy = true;
    G.Audio.play('swap');
    for (const v of this.views.values()) v.s = 0.2;
    G.Tw.wait(0.35).then(() => { this.busy = false; });
  };

  // ---- input ----
  S.input = function (ev) {
    if (UI.handle(this.ui, ev)) return;
    if (this.busy || this.ended || ev.type === 'key') return;
    const c = this.cellAt(ev.x, ev.y);
    if (ev.type === 'down') {
      if (!c) { this.sel = null; return; }
      if (this.hammerMode) { this.useHammer(c); return; }
      if (this.sel && G.M3.Board.prototype.adjacent(this.sel, c)) { const a = this.sel; this.sel = null; this.doSwap(a, c); return; }
      this.sel = c;
      this.drag = { x: ev.x, y: ev.y, c };
      G.Audio.play('tap');
    } else if (ev.type === 'move' && this.drag) {
      const dx = ev.x - this.drag.x, dy = ev.y - this.drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > this.cell * 0.35) {
        const a = this.drag.c;
        const b = Math.abs(dx) > Math.abs(dy) ? { x: a.x + Math.sign(dx), y: a.y } : { x: a.x, y: a.y + Math.sign(dy) };
        this.drag = null;
        if (this.board.ok(b.x, b.y)) { this.sel = null; this.doSwap(a, b); }
      }
    } else if (ev.type === 'up') {
      this.drag = null;
    }
  };

  S.useHammer = function (c) {
    const ev = this.board.hammer(c.x, c.y);
    if (!ev) { G.Audio.play('bad'); return; }
    G.Progress.useBooster('hammer');
    this.refreshCounts();
    this.hammerMode = false;
    G.Audio.play('crate');
    G.Haptics.buzz('special');
    R.addShake(0.3);
    this.busy = true;
    this.showClear(ev);
    G.Tw.wait(0.2).then(() => this.runSteps());
  };

  S.doSwap = async function (a, b) {
    const ta = this.board.at(a.x, a.y), tb = this.board.at(b.x, b.y);
    if (!ta || !tb) return;
    this.busy = true;
    this.hint = null;
    const va = this.views.get(ta.id), vb = this.views.get(tb.id);
    const valid = this.board.swapValid(a, b);
    await this.tweenSwap(va, vb, a, b);
    if (!valid) {
      G.Audio.play('bad');
      G.Haptics.buzz('bad');
      await this.tweenSwap(va, vb, b, a);
      this.busy = false;
      return;
    }
    G.Audio.play('swap');
    this.board.trySwap(a, b);
    await this.runSteps();
  };

  S.tweenSwap = function (va, vb, a, b) {
    if (!va || !vb) return Promise.resolve();
    va.lock = vb.lock = true;
    return G.Tw.add({ dur: 0.16, ease: U.ease.inOutSine, update: (k) => {
      va.x = U.lerp(a.x, b.x, k); va.y = U.lerp(a.y, b.y, k);
      vb.x = U.lerp(b.x, a.x, k); vb.y = U.lerp(b.y, a.y, k);
    } }).then(() => { va.lock = vb.lock = false; va.vy = vb.vy = 0; });
  };

  S.runSteps = async function () {
    this.combo = 0;
    let guard = 0;
    for (;;) {
      if (guard++ > 300) break;
      const ev = this.board.step();
      if (!ev) break;
      if (ev.type === 'clear') { this.combo++; this.showClear(ev); await G.Tw.wait(0.2); }
      else if (ev.type === 'fall') { this.applyFall(ev); await this.waitSettled(); }
      else if (ev.type === 'shuffle') { this.animShuffle(); FX('No moves — shuffling!'); await G.Tw.wait(0.45); }
    }
    if (this.combo >= 4) { G.FX.text(this.combo >= 6 ? 'Sweet!' : 'Nice!', G.W / 2, this.by + this.bh / 2, { size: 46, col: '#ffc85a' }); this.setMood('happy'); }
    this.busy = false;
    G.Input.lastInput = G.time;
    this.checkEnd();
    if (!this.ended) this.saveNow();
  };
  S.saveNow = function () { G.Progress.saveProgress(this.n, { mech: 'match3', board: this.board.serialize() }); };
  function FX(str) { G.FX.text(str, G.W / 2, 600, { size: 30, col: '#fff', life: 1.4, rise: 20 }); }

  S.showClear = function (ev) {
    const pitch = Math.min(7, this.combo);
    if (ev.cleared.length) { G.Audio.play('pop', pitch); G.Haptics.buzz('pop'); }
    for (const c of ev.cleared) {
      const v = this.views.get(c.id);
      if (v) { this.views.delete(c.id); this.dying.push({ v, c, t: 0 }); }
      const p = this.cellCenter(c.x, c.y);
      const col = c.c >= 0 ? K.CANDY[c.c].col : '#d9a441';
      G.FX.burst(p.x, p.y, [col, '#fff'], 6, { speed: 160, r: 5 });
    }
    for (const b of ev.blasts) {
      const p = this.cellCenter(b.x, b.y);
      if (b.kind === 'rainbow' || b.kind === 'all') { G.Audio.play('rainbow'); R.addFlash(0.4); }
      else { G.Audio.play('blast'); R.addShake(0.25); }
      G.Haptics.buzz('special');
      G.FX.burst(p.x, p.y, ['#fff6c8', '#ffc85a'], 14, { speed: 320, kind: 'star', r: 8 });
      this.beams = this.beams || [];
      this.beams.push({ kind: b.kind, x: b.x, y: b.y, t: 0 });
    }
    for (const c of ev.created) {
      this.views.set(c.id, { x: c.x, y: c.y, vy: 0, s: 0.1, a: 1 });
      G.Audio.play('special');
      const p = this.cellCenter(c.x, c.y);
      G.FX.burst(p.x, p.y, ['#fff', '#ffe08a'], 10, { speed: 140, kind: 'star', r: 6 });
    }
    for (const d of ev.dust) { const p = this.cellCenter(d.x, d.y); G.FX.burst(p.x, p.y, ['#cdbdad', '#e8dccd'], 8, { speed: 90, g: -40, up: 30, life: 0.8, r: 7 }); G.Audio.play('dust'); }
    for (const c of ev.crates) { const p = this.cellCenter(c.x, c.y); G.FX.burst(p.x, p.y, ['#c8945e', '#e1b88a'], 12, { speed: 220, kind: 'paper', r: 6 }); G.Audio.play('crate'); }
    for (const u of ev.unlocked) { const p = this.cellCenter(u.x, u.y); G.FX.burst(p.x, p.y, ['#b07a4f'], 8, { speed: 150, kind: 'paper' }); }
    for (const g of ev.gears) {
      const v = this.views.get(g.id); this.views.delete(g.id);
      const p = this.cellCenter(g.x, g.y);
      G.FX.burst(p.x, p.y, ['#ffc85a', '#fff'], 16, { speed: 220, kind: 'star', r: 7 });
      G.FX.text('Gear!', p.x, p.y - 20, { size: 30, col: '#ffc85a' });
      G.Audio.play('gear');
      if (v) this.dying.push({ v, c: { x: g.x, y: g.y, c: -1, gear: true }, t: 0 });
    }
    if (ev.points > 0 && ev.cleared.length) {
      const c0 = ev.cleared[Math.floor(ev.cleared.length / 2)];
      const p = this.cellCenter(c0.x, c0.y);
      G.FX.text('+' + ev.points, p.x, p.y, { size: 22, col: '#fff', life: 0.7, rise: 40 });
    }
    this.goalPulse = 1;
  };

  S.applyFall = function (ev) {
    for (const m of ev.moves) {
      let v = this.views.get(m.id);
      if (!v) {
        // spawned: start above the board, stacked by how many spawned in this column
        v = { x: m.x, y: m.fy - 0.2, vy: 0, s: 1, a: 1 };
        this.views.set(m.id, v);
      }
    }
    // spawned tiles in the same column should not overlap: offset them upward in order
    const byCol = {};
    for (const m of ev.moves) if (m.spawn) (byCol[m.x] = byCol[m.x] || []).push(m);
    for (const col of Object.keys(byCol)) {
      const list = byCol[col].sort((a, b) => b.y - a.y);
      list.forEach((m, i) => { const v = this.views.get(m.id); const top = -1 - i; if (v.y > top) v.y = top; });
    }
  };

  S.waitSettled = function () {
    return new Promise((res) => { this._settle = res; this._settleT = 0; });
  };

  S.setMood = function (m) { this.mood = m; this.moodT = 1.6; };

  S.checkEnd = function () {
    const b = this.board;
    if (this.ended) return;
    if (b.isWon()) { this.ended = true; this.win(); }
    else if (b.isLost()) { this.ended = true; this.lose(); }
  };

  S.win = async function () {
    G.Audio.play('win');
    G.Haptics.buzz('win');
    this.setMood('happy');
    this.banner = { text: G.CONFIG.text.win, t: 0 };
    await G.Tw.wait(0.9);
    // Bolt's tidy-up: each leftover move sparkles and adds points
    const left = this.board.movesLeft;
    for (let i = 0; i < left; i++) {
      const cells = this.board.cells.filter(Boolean);
      const t = cells[Math.floor(Math.random() * cells.length)];
      if (t) { const p = this.cellCenter(t.x, t.y); G.FX.burst(p.x, p.y, ['#fff6c8', '#ffc85a'], 6, { speed: 160, kind: 'star' }); G.FX.text('+300', p.x, p.y, { size: 20, life: 0.6 }); }
      G.Audio.play('coin');
      this.tidy = (this.tidy || 0) + 1;
      await G.Tw.wait(left > 10 ? 0.06 : 0.12);
    }
    const score = this.board.finalScore();
    const stars = this.board.starsFor(score);
    const res = G.Progress.recordWin(this.n, stars, score);
    G.Scenes.push(new G.ResultScene({ n: this.n, won: true, stars, score, coins: res.coins, newStars: res.newStars, streak: res.streak, reward: res.reward }));
  };

  S.lose = async function () {
    G.Audio.play('lose');
    this.setMood('sad');
    await G.Tw.wait(0.6);
    G.Scenes.push(new G.ResultScene({ n: this.n, won: false, reason: G.CONFIG.text.outOfMoves, onRetry: () => G.playLevel(this.n), onLose: () => G.Progress.recordLoss() }));
  };

  S.resume = function () { this.refreshCounts(); G.Input.lastInput = G.time; };

  // ---- update ----
  S.update = function (dt) {
    this.t += dt;
    UI.update(this.ui, dt);
    this.goalPulse = Math.max(0, this.goalPulse - dt * 3);
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = 'idle'; }
    if (this.banner) this.banner.t += dt;
    let moving = false;
    for (const t of this.board.cells) {
      if (!t) continue;
      const v = this.views.get(t.id);
      if (!v || v.lock) continue;
      if (v.y < t.y - 0.001) {
        v.vy += 38 * dt;
        v.y = Math.min(t.y, v.y + v.vy * dt);
        moving = true;
        if (v.y >= t.y) { v.y = t.y; v.vy = 0; v.land = 0.12; }
      } else if (v.y > t.y + 0.001) { v.y = Math.max(t.y, v.y - 10 * dt); moving = true; }
      if (Math.abs(v.x - t.x) > 0.001) { v.x += Math.sign(t.x - v.x) * Math.min(Math.abs(t.x - v.x), 9 * dt); moving = true; }
      v.s = Math.min(1, v.s + dt * 5);
      if (v.land > 0) v.land -= dt;
    }
    for (const d of this.dying) d.t += dt;
    this.dying = this.dying.filter((d) => d.t < 0.22);
    if (this.beams) { for (const b of this.beams) b.t += dt; this.beams = this.beams.filter((b) => b.t < 0.35); }
    if (this._settle) {
      this._settleT += dt;
      if (!moving || this._settleT > 1.5) { const r = this._settle; this._settle = null; r(); }
    }
    // idle hint
    if (!this.busy && !this.ended && G.Input.idleFor() > G.CONFIG.hintDelay) {
      if (!this.hint) { const ms = this.board.findMoves(1); this.hint = ms[0] || null; }
    } else if (G.Input.idleFor() < 0.2) this.hint = null;
  };

  // ---- draw ----
  S.draw = function (ctx) {
    const pal = PAL();
    // backdrop: the sweets counter
    const bg = ctx.createLinearGradient(0, 0, 0, G.H);
    bg.addColorStop(0, '#f8e3cc');
    bg.addColorStop(1, '#eccfae');
    R.fill(ctx, bg);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 9; i++) ctx.fillRect(i * 64 + 10, -R.padY, 28, G.H + 2 * R.padY);
    this.drawHud(ctx);
    this.drawBoard(ctx);
    // bottom shelf with Bolt
    R.panel(ctx, -20, 830, G.W + 40, 160 + R.padY, { fill: '#d9b48c', r: 0, lift: 0 });
    K.bolt(ctx, 480, 870, 96, { t: this.t, mood: this.mood });
    if (this.hammerMode) R.text(ctx, 'Tap a candy to smash it', G.W / 2, 812, { size: 22, color: pal.ink, weight: 900 });
    if (this.level.hard) R.text(ctx, 'Hard level: no boosters', 270, 812, { size: 20, color: '#c0392b', weight: 900 });
    UI.draw(ctx, this.ui);
    G.FX.draw(ctx);
    if (this.banner) {
      const k = Math.min(1, this.banner.t / 0.35);
      ctx.save();
      ctx.globalAlpha = Math.min(1, 3 - this.banner.t * 1.5 + 1);
      R.text(ctx, this.banner.text, G.W / 2, this.by + this.bh / 2, { size: 64 * U.ease.outBack(k), color: '#fff', stroke: pal.ink, weight: 900 });
      ctx.restore();
    }
  };

  S.drawHud = function (ctx) {
    const pal = PAL(), b = this.board;
    R.text(ctx, U.fmt(G.CONFIG.text.level, this.n), G.W / 2, 40, { size: 24, color: pal.inkSoft, weight: 900 });
    if (this.level.hard) G.UI.hardBadge(ctx, G.W / 2 + 108, 40);
    R.text(ctx, this.level.title, G.W / 2, 68, { size: 20, color: pal.inkSoft, weight: 700, maxW: 300 });
    // moves
    R.panel(ctx, G.W - 122, 18, 104, 92, { r: 24 });
    R.text(ctx, G.CONFIG.text.moves, G.W - 70, 40, { size: 16, color: pal.inkSoft, weight: 900 });
    R.text(ctx, String(b.movesLeft), G.W - 70, 78, { size: 40, color: b.movesLeft <= 3 ? '#e2574c' : pal.ink, weight: 900 });
    // goals
    const goals = this.level.goals;
    const gw = Math.min(150, 360 / goals.length);
    const gx0 = G.W / 2 - (gw * goals.length) / 2;
    R.panel(ctx, gx0 - 10, 92, gw * goals.length + 20, 70, { r: 22 });
    goals.forEach((g, i) => {
      const p = b.goalProgress(g);
      const cx = gx0 + gw * i + 34, cy = 127;
      const pulse = 1 + this.goalPulse * 0.08;
      if (g.type === 'collect') K.candy(ctx, g.color, null, cx, cy, 44 * pulse);
      else if (g.type === 'dust') K.dust(ctx, cx, cy, 40 * pulse, 2);
      else if (g.type === 'crate') K.crate(ctx, cx, cy, 40 * pulse, 1);
      else if (g.type === 'gear') K.gear(ctx, cx, cy, 44 * pulse, this.t);
      const left = p.need - p.have;
      if (left <= 0) K.icon(ctx, 'check', cx + 50, cy, 34);
      else R.text(ctx, String(left), cx + 52, cy + 1, { size: 28, weight: 900, color: pal.ink });
    });
    // score bar
    const sx = 100, sy = 176, sw = G.W - 200;
    const t3 = (this.level.stars || [1, 1])[1] * 1.08;
    const k = U.clamp(b.score / t3, 0, 1);
    ctx.fillStyle = 'rgba(122,92,74,0.2)';
    R.rr(ctx, sx, sy, sw, 16, 8); ctx.fill();
    ctx.fillStyle = '#ffc85a';
    R.rr(ctx, sx, sy, Math.max(16, sw * k), 16, 8); ctx.fill();
    for (const th of this.level.stars || []) {
      const mx = sx + sw * (th / t3);
      K.icon(ctx, b.score >= th ? 'star' : 'starOff', mx, sy + 8, 28);
    }
    R.text(ctx, String(b.score), sx - 14, sy + 8, { size: 18, align: 'right', color: pal.inkSoft, weight: 900 });
  };

  S.drawBoard = function (ctx) {
    const b = this.board, c = this.cell;
    // tray
    R.panel(ctx, this.bx - 10, this.by - 10, this.bw + 20, this.bh + 20, { fill: '#b98a6a', r: 26, lift: 8 });
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (!b.ok(x, y)) continue;
        const px = this.bx + x * c, py = this.by + y * c;
        ctx.fillStyle = (x + y) % 2 ? '#fff4e4' : '#fbe9d2';
        R.rr(ctx, px + 2, py + 2, c - 4, c - 4, c * 0.2);
        ctx.fill();
        const i = b.idx(x, y);
        if (b.dust[i]) K.dust(ctx, px + c / 2, py + c / 2, c, b.dust[i]);
      }
    }
    // holes: paint over with the tray colour so the outline reads
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (!b.ok(x, y)) { ctx.fillStyle = '#b98a6a'; ctx.fillRect(this.bx + x * c, this.by + y * c, c, c); }
    // selection + hint
    if (this.sel) {
      const p = this.cellCenter(this.sel.x, this.sel.y);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
      R.rr(ctx, p.x - c / 2 + 3, p.y - c / 2 + 3, c - 6, c - 6, c * 0.22); ctx.stroke();
    }
    let hintIds = null;
    if (this.hint) { const [h1, h2] = this.hint; const t1 = b.at(h1.x, h1.y), t2 = b.at(h2.x, h2.y); hintIds = [t1 && t1.id, t2 && t2.id]; }
    // tiles
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.bx - 10, this.by - 4, this.bw + 20, this.bh + 14);
    ctx.clip();
    for (const t of b.cells) {
      if (!t) continue;
      const v = this.views.get(t.id);
      if (!v) continue;
      let px = this.bx + (v.x + 0.5) * c, py = this.by + (v.y + 0.5) * c;
      let s = v.s;
      if (hintIds && hintIds.indexOf(t.id) >= 0) { s *= 1 + Math.sin(this.t * 10) * 0.08; }
      if (v.land > 0) s *= 1 + v.land * 0.6;
      if (t.kind === 'gear') K.gear(ctx, px, py, c * 0.95 * s, this.t * 0.8);
      else K.candy(ctx, t.c, t.sp, px, py, c * 0.95 * s);
      if (t.lock) K.twine(ctx, px, py, c);
      if (t.sp && t.sp !== 'rainbow') {
        ctx.save(); ctx.globalAlpha = 0.25 + Math.sin(this.t * 5 + t.id) * 0.15;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, c * 0.42 * s, 0, 7); ctx.fill(); ctx.restore();
      }
    }
    for (const d of this.dying) {
      const k = d.t / 0.22;
      const px = this.bx + (d.v.x + 0.5) * c, py = this.by + (d.v.y + 0.5) * c;
      const s = (1 + k * 0.4) * (1 - k);
      if (d.c.gear) K.gear(ctx, px, py, c * s, 0); else K.candy(ctx, d.c.c, d.c.sp, px, py, c * 0.95 * s, 1 - k * 0.5);
    }
    ctx.restore();
    // crates over cells
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = b.idx(x, y);
      if (b.ok(x, y) && b.crate[i]) K.crate(ctx, this.bx + (x + 0.5) * c, this.by + (y + 0.5) * c, c * 0.98, b.crate[i]);
    }
    // gear exits: little arrows under the bottom open cell of columns, when the level has gears
    if (this.level.gears) {
      for (let x = 0; x < b.w; x++) {
        let yb = -1; for (let y = b.h - 1; y >= 0; y--) if (b.open(x, y)) { yb = y; break; }
        if (yb < 0) continue;
        const p = this.cellCenter(x, yb);
        ctx.fillStyle = 'rgba(255,200,90,0.9)';
        ctx.beginPath(); ctx.moveTo(p.x - 8, p.y + c / 2 + 4); ctx.lineTo(p.x + 8, p.y + c / 2 + 4); ctx.lineTo(p.x, p.y + c / 2 + 13); ctx.fill();
      }
    }
    // beams
    if (this.beams) for (const bm of this.beams) {
      const k = bm.t / 0.35;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.fillStyle = '#fff6c8';
      const p = this.cellCenter(bm.x, bm.y);
      if (bm.kind === 'rh' || bm.kind === 'row') ctx.fillRect(this.bx, p.y - c * 0.25 * (1 - k), this.bw, c * 0.5 * (1 - k));
      if (bm.kind === 'rv' || bm.kind === 'col') ctx.fillRect(p.x - c * 0.25 * (1 - k), this.by, c * 0.5 * (1 - k), this.bh);
      if (bm.kind === 'bomb' || bm.kind === 'bomb2') { ctx.beginPath(); ctx.arc(p.x, p.y, c * (bm.kind === 'bomb2' ? 2.5 : 1.5) * (0.5 + k), 0, 7); ctx.fill(); }
      if (bm.kind === 'cross3') { ctx.fillRect(this.bx, p.y - c * 1.5, this.bw, c * 3); ctx.fillRect(p.x - c * 1.5, this.by, c * 3, this.bh); }
      ctx.restore();
    }
  };
})();
