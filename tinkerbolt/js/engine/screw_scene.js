'use strict';
// Chapter 2 play scene: draws a G.SC.Game (plates, screws, toolboxes, tray), handles taps, animates flights.
(function () {
  const G = window.G;
  const R = G.Render, K = G.Clay, UI = G.UI, U = G.U;
  const PAL = () => G.CONFIG.palette;
  const FLY = 0.32;

  function ScrewScene(levelN, resume) {
    this.resumeData = resume || null;
    this.name = 'screws';
    this.opaque = true;
    this.n = levelN;
    this.level = G.Progress.level(levelN);
    this.t = 0;
  }
  G.ScrewScene = ScrewScene;
  const S = ScrewScene.prototype;

  S.enter = function () { this.start(); };
  S.start = function () {
    this.game = new G.SC.Game(this.level);
    if (this.resumeData) { this.game.restore(this.resumeData.snap); this.usedSlotSaved = !!this.resumeData.usedSlot; this.resumeData = null; }
    else { G.Progress.startAttempt(this.n); this.usedSlotSaved = false; }
    this.flights = [];
    this.falling = [];
    this.leaving = [];
    this.arrive = this.game.boxes.map(() => ({ t: 1, c: null }));
    this.trayPos = {};
    this.shakes = {};
    this.ended = false;
    this.hammerMode = false;
    this.hint = -1;
    this.mood = 'idle';
    this.moodT = 0;
    this.trayFlash = 0;
    this.banner = null;
    this.usedSlot = this.usedSlotSaved;
    this.layout();
    this.relayoutTray();
    this.saveNow();
    this.makeButtons();
    this.syncArrivals(true);
    if (this.game.isWon()) { this.ended = true; G.Tw.wait(0.3).then(() => this.win()); return; }
    if (this.game.isStuck()) { this.ended = true; G.Tw.wait(0.3).then(() => this.stuck()); return; }
    if (this.level.tutorial) {
      this.blocked = true;
      G.Tw.wait(0.4).then(() => (G.Scenes.top() === this ? G.Story.play('tut_' + this.level.tutorial) : null)).then(() => { this.blocked = false; G.Input.lastInput = G.time; });
    } else this.blocked = false;
  };

  S.layout = function () {
    const bw = this.level.board.w, bh = this.level.board.h;
    this.u = Math.floor(Math.min((G.W - 40) / bw, 530 / bh));
    this.bx = Math.round((G.W - this.u * bw) / 2);
    this.by = 318 + Math.round((530 - this.u * bh) / 2);
    this.boxW = 150;
    this.boxH = 88;
  };
  S.boxPos = function (slot) {
    const n = this.game.boxes.length;
    const gap = 190;
    return { x: G.W / 2 + (slot - (n - 1) / 2) * gap - 30, y: 168 };
  };
  S.boxSub = function (slot, k) { const p = this.boxPos(slot); return { x: p.x + (k - 1) * this.boxW * 0.29, y: p.y + 4 }; };
  S.traySlot = function (k) {
    const cap = this.game.trayCap;
    const w = 62;
    return { x: G.W / 2 + (k - (cap - 1) / 2) * w, y: 272 };
  };
  S.screwPos = function (i) { const s = this.level.screws[i]; return { x: this.bx + s.x * this.u, y: this.by + s.y * this.u }; };

  S.makeButtons = function () {
    const st = G.state;
    this.btnBack = UI.button({ x: 18, y: 22, w: 64, h: 64, icon: 'pause', col: '#fff3df', onTap: () => this.pause() });
    this.btnHammer = UI.button({ x: 120, y: 868, w: 120, h: 76, icon: 'hammer', col: '#fff3df', iconSize: 58, count: st.boosters.hammer || 0, onTap: () => this.booster('hammer') });
    this.btnSlot = UI.button({ x: 300, y: 868, w: 120, h: 76, icon: 'slot', col: '#fff3df', iconSize: 58, count: st.boosters.slot || 0, onTap: () => this.booster('slot') });
    this.ui = [this.btnBack, this.btnHammer, this.btnSlot];
    if (this.level.hard) { this.btnHammer.enabled = false; this.btnSlot.enabled = false; }
  };
  S.refreshCounts = function () { this.btnHammer.count = G.state.boosters.hammer || 0; this.btnSlot.count = G.state.boosters.slot || 0; };
  S.resume = function () { this.refreshCounts(); G.Input.lastInput = G.time; };

  S.pause = function () {
    if (this.ended) return;
    G.Scenes.push(new G.PauseScene({ onRetry: () => G.playLevel(this.n), onQuit: () => G.goHome() }));
  };

  S.booster = function (id) {
    if (this.ended || this.blocked || this.level.hard) return;
    if (!(G.state.boosters[id] > 0)) { G.Scenes.push(new G.BuyScene(id, () => this.refreshCounts())); return; }
    if (id === 'hammer') { this.hammerMode = !this.hammerMode; return; }
    if (id === 'slot') this.addSlot();
  };
  S.addSlot = function () {
    if (!G.Progress.useBooster('slot')) return false;
    this.refreshCounts();
    this.game.trayCap++;
    this.usedSlot = true;
    this.saveNow();
    G.Audio.play('special');
    const p = this.traySlot(this.game.trayCap - 1);
    G.FX.burst(p.x, p.y, ['#fff6c8', '#ffc85a'], 12, { speed: 160, kind: 'star' });
    return true;
  };

  // Which screw is under the pointer? Prefer the topmost one (highest plate layer).
  S.screwAt = function (x, y) {
    let best = -1, bestLayer = -1;
    this.level.screws.forEach((s, i) => {
      if (this.game.removed[i]) return;
      const p = this.screwPos(i);
      if (U.dist(p.x, p.y, x, y) > this.u * 0.62) return;
      const layer = this.level.plates[this.game.prep.screwPlate[i]].layer + (this.game.isCovered(i) ? 0 : 100);
      if (layer > bestLayer) { bestLayer = layer; best = i; }
    });
    return best;
  };

  S.input = function (ev) {
    if (UI.handle(this.ui, ev)) return;
    if (this.ended || this.blocked || ev.type !== 'down') return;
    const i = this.screwAt(ev.x, ev.y);
    if (i < 0) return;
    this.hint = -1;
    const ok = this.hammerMode ? this.tap(i, true) : this.tap(i, false);
    if (ok && this.hammerMode) { G.Progress.useBooster('hammer'); this.refreshCounts(); this.hammerMode = false; }
  };

  S.tap = function (i, force) {
    const g = this.game;
    const fromPos = this.screwPos(i);
    const ev = g.tap(i, force);
    if (!ev.ok) {
      this.shakes[i] = 0.35;
      if (ev.why === 'full') { G.Audio.play('full'); this.trayFlash = 1; G.FX.text('Tray full!', G.W / 2, 320, { size: 26, col: '#fff', life: 0.8, rise: 20 }); }
      else G.Audio.play('bad');
      G.Haptics.buzz('bad');
      return false;
    }
    G.Audio.play('unscrew');
    G.Haptics.buzz('tap');
    // flight of the tapped screw
    let to, landSlot = null;
    if (ev.dest.kind === 'box') {
      const done = ev.boxDone.find((d) => d.slot === ev.dest.slot);
      const sub = done ? 2 : g.boxes[ev.dest.slot].n - 1 - ev.transfers.filter((tr) => tr.slot === ev.dest.slot).length;
      to = this.boxSub(ev.dest.slot, Math.max(0, sub));
      landSlot = { box: ev.dest.slot };
    } else {
      to = this.traySlot(ev.dest.slot);
      this.trayPos[i] = { x: to.x, y: to.y };
      landSlot = { tray: true };
    }
    this.flights.push({ s: i, c: ev.c, from: fromPos, to, t: 0, dur: FLY, delay: 0, land: landSlot, spin: true });
    // completed boxes leave after the flight lands; the next box slides in; tray screws jump over
    let delay = FLY;
    for (const d of ev.boxDone) {
      this.leaving.push({ slot: d.slot, c: d.c, t: -delay });
      G.Tw.wait(delay).then(() => { G.Audio.play('box'); G.Haptics.buzz('special'); const p = this.boxPos(d.slot); G.FX.burst(p.x, p.y, [K.SCREW[d.c], '#fff'], 14, { speed: 220, kind: 'star' }); });
    }
    if (ev.boxDone.length) {
      for (const a of ev.arrivals) this.arrive[a.slot] = { t: -(delay + 0.35), c: a.c };
      const subs = {};
      ev.transfers.forEach((tr, k) => {
        const from = this.trayPos[tr.s] || this.traySlot(tr.from);
        subs[tr.slot] = (subs[tr.slot] || 0) + 1;
        const to2 = this.boxSub(tr.slot, subs[tr.slot] - 1);
        this.flights.push({ s: tr.s, c: this.level.screws[tr.s].c, from, to: to2, t: 0, dur: FLY, delay: delay + 0.6 + k * 0.08, land: { box: tr.slot } });
        delete this.trayPos[tr.s];
      });
    }
    for (const pi of ev.fallen) {
      this.falling.push({ pi, t: -0.08, dir: Math.random() < 0.5 ? -1 : 1 });
      G.Tw.wait(0.1).then(() => { G.Audio.play('plate'); G.Haptics.buzz('plate'); });
    }
    for (const j of ev.unlocked) { const p = this.screwPos(j); G.FX.burst(p.x, p.y, ['#e3b04b', '#fff3c4'], 10, { speed: 160, kind: 'star' }); G.Audio.play('special'); }
    for (const j of ev.revealed) { const p = this.screwPos(j); G.FX.burst(p.x, p.y, ['#fff'], 6, { speed: 100 }); }
    this.relayoutTray();
    G.Input.lastInput = G.time;
    this.saveNow();
    // end checks after the animations
    const wait = FLY + (ev.boxDone.length ? 1.0 : 0.05);
    if (g.isWon()) { this.ended = true; G.Tw.wait(wait + 0.4).then(() => this.win()); }
    else if (g.isStuck()) { this.ended = true; G.Tw.wait(wait + 0.2).then(() => this.stuck()); }
    return true;
  };

  S.saveNow = function () { if (!this.game.isWon()) G.Progress.saveProgress(this.n, { mech: 'screws', snap: this.game.snapshot(), usedSlot: this.usedSlot }); };
  S.relayoutTray = function () {
    this.game.tray.forEach((t, k) => {
      const p = this.traySlot(k);
      if (!this.trayPos[t.s]) this.trayPos[t.s] = { x: p.x, y: p.y };
      this.trayPos[t.s].tx = p.x;
      this.trayPos[t.s].ty = p.y;
    });
  };
  S.syncArrivals = function () { this.game.boxes.forEach((b, k) => { this.arrive[k] = { t: 1, c: b ? b.c : null }; }); };

  S.win = function () {
    G.Audio.play('win');
    G.Haptics.buzz('win');
    this.mood = 'happy'; this.moodT = 3;
    this.banner = { text: G.CONFIG.text.win, t: 0 };
    G.FX.confetti(60);
    G.Tw.wait(1.2).then(() => {
      const peak = this.game.peak + (this.usedSlot ? 1 : 0);
      const stars = this.game.starsFor(peak);
      const res = G.Progress.recordWin(this.n, stars, 0);
      G.Scenes.push(new G.ResultScene({ n: this.n, won: true, stars, peak: this.game.peak, coins: res.coins, newStars: res.newStars, streak: res.streak, reward: res.reward }));
    });
  };

  S.stuck = function () {
    G.Audio.play('lose');
    this.mood = 'sad'; this.moodT = 3;
    const offer = !this.level.hard ? { id: 'slot', label: 'Extra slot', onUse: () => { if (this.addSlot()) { this.ended = false; return true; } return false; } } : null;
    G.Scenes.push(new G.ResultScene({ n: this.n, won: false, reason: G.CONFIG.text.stuck, offer,
      onRetry: () => G.playLevel(this.n), onLose: () => G.Progress.recordLoss() }));
  };

  S.update = function (dt) {
    this.t += dt;
    UI.update(this.ui, dt);
    this.trayFlash = Math.max(0, this.trayFlash - dt * 2);
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = 'idle'; }
    if (this.banner) this.banner.t += dt;
    for (const f of this.flights) { if (f.delay > 0) f.delay -= dt; else f.t += dt; }
    for (const f of this.flights) if (f.t >= f.dur && !f.landed) { f.landed = true; G.Audio.play('drop'); }
    this.flights = this.flights.filter((f) => f.t < f.dur);
    for (const p of this.falling) p.t += dt;
    this.falling = this.falling.filter((p) => p.t < 1.1);
    for (const l of this.leaving) l.t += dt;
    this.leaving = this.leaving.filter((l) => l.t < 0.45);
    for (const a of this.arrive) a.t += dt;
    for (const k of Object.keys(this.shakes)) { this.shakes[k] -= dt; if (this.shakes[k] <= 0) delete this.shakes[k]; }
    for (const p of Object.values(this.trayPos)) { if (p.tx != null) { p.x = U.lerp(p.x, p.tx, Math.min(1, dt * 12)); p.y = U.lerp(p.y, p.ty, Math.min(1, dt * 12)); } }
    if (!this.ended && !this.blocked && G.Input.idleFor() > G.CONFIG.hintDelay && this.hint < 0) this.hint = G.SC.hint(this.game);
  };

  S.inFlight = function (s) { return this.flights.some((f) => f.s === s); };

  S.draw = function (ctx) {
    const pal = PAL(), g = this.game;
    const bg = ctx.createLinearGradient(0, 0, 0, G.H);
    bg.addColorStop(0, '#e9dccb');
    bg.addColorStop(1, '#d6bfa4');
    R.fill(ctx, bg);
    // HUD
    R.text(ctx, U.fmt(G.CONFIG.text.level, this.n), G.W / 2, 40, { size: 24, color: pal.inkSoft, weight: 900 });
    R.text(ctx, this.level.title, G.W / 2, 68, { size: 20, color: pal.inkSoft, weight: 700, maxW: 300 });
    if (this.level.hard) UI.hardBadge(ctx, G.W / 2 + 108, 40);
    // queue preview (right)
    const remaining = this.level.boxes.length - g.qi;
    R.panel(ctx, G.W - 92, 122, 76, 92, { r: 18, fill: '#f3e6d4' });
    R.text(ctx, 'Next', G.W - 54, 140, { size: 15, color: pal.inkSoft, weight: 900 });
    for (let k = 0; k < Math.min(3, remaining); k++) {
      const c = this.level.boxes[g.qi + k];
      ctx.fillStyle = K.SCREW[c];
      R.rr(ctx, G.W - 80 + k * 18, 158 + k * 8, 26, 18, 6);
      ctx.fill();
    }
    R.text(ctx, remaining + ' left', G.W - 54, 202, { size: 14, color: pal.inkSoft, weight: 800 });
    // boxes
    g.boxes.forEach((b, k) => {
      const a = this.arrive[k];
      if (!b) { const p = this.boxPos(k); ctx.globalAlpha = 0.3; R.rr(ctx, p.x - this.boxW / 2, p.y - this.boxH / 2, this.boxW, this.boxH, 16); ctx.fillStyle = '#c9b39a'; ctx.fill(); ctx.globalAlpha = 1; return; }
      if (a.t < 0) return;
      const p = this.boxPos(k);
      const k2 = U.clamp(a.t / 0.35, 0, 1);
      const inflight = this.flights.filter((f) => f.land.box === k && !f.landedVisual && f.t < f.dur).length;
      const filled = Math.max(0, b.n - inflight);
      K.toolbox(ctx, b.c, p.x, p.y - (1 - U.ease.outBack(k2)) * 160, this.boxW, this.boxH, filled, k2);
    });
    for (const l of this.leaving) {
      if (l.t < 0) {   // still waiting for the final screw: draw it in place with 2 filled
        const p = this.boxPos(l.slot);
        K.toolbox(ctx, l.c, p.x, p.y, this.boxW, this.boxH, 2);
        continue;
      }
      const p = this.boxPos(l.slot);
      const k = l.t / 0.45;
      K.toolbox(ctx, l.c, p.x, p.y - U.ease.inCubic(k) * 220, this.boxW * (1 + k * 0.1), this.boxH, 3, 1 - k);
    }
    // tray
    const cap = g.trayCap;
    const t0 = this.traySlot(0), t1 = this.traySlot(cap - 1);
    R.panel(ctx, t0.x - 40, t0.y - 30, t1.x - t0.x + 80, 60, { r: 30, fill: this.trayFlash > 0 ? '#f7b3a8' : '#b98a6a', lift: 5 });
    for (let k = 0; k < cap; k++) {
      const p = this.traySlot(k);
      ctx.fillStyle = 'rgba(60,35,20,0.3)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, 7); ctx.fill();
      if (k >= this.level.tray) { ctx.strokeStyle = '#ffc85a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 25, 0, 7); ctx.stroke(); }
    }
    for (const t of g.tray) {
      if (this.inFlight(t.s)) continue;
      const p = this.trayPos[t.s] || this.traySlot(0);
      K.screw(ctx, t.c, p.x, p.y, 44);
    }
    if (g.tray.length >= cap - 1 && !this.ended) R.text(ctx, g.tray.length >= cap ? 'Tray full' : 'Almost full', G.W / 2, 312, { size: 16, color: '#c0392b', weight: 900 });
    // board backdrop
    R.panel(ctx, this.bx - 14, this.by - 14, this.level.board.w * this.u + 28, this.level.board.h * this.u + 28, { fill: '#cfa77f', r: 28, lift: 8 });
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let k = 0; k < this.level.board.h; k += 2) ctx.fillRect(this.bx - 14, this.by + k * this.u, this.level.board.w * this.u + 28, this.u);
    // plates and their screws, bottom layer first
    ctx.save();
    ctx.translate(this.bx, this.by);
    const order = this.level.plates.map((p, i) => i).sort((a, b) => this.level.plates[a].layer - this.level.plates[b].layer);
    for (const pi of order) {
      if (g.fallen[pi]) continue;
      const p = this.level.plates[pi];
      const holes = g.prep.plateScrews[pi].map((i) => this.level.screws[i]);
      K.plate(ctx, p, this.u, holes, 0.9);
      if (p.tether) this.drawTether(ctx, p, this.level.plates[g.prep.pIndex[p.tether]], g.fallen[g.prep.pIndex[p.tether]]);
      for (const i of g.prep.plateScrews[pi]) {
        if (g.removed[i]) continue;
        const s = this.level.screws[i];
        let x = s.x * this.u, y = s.y * this.u;
        if (this.shakes[i]) x += Math.sin(this.shakes[i] * 60) * 4;
        const covered = g.isCovered(i);
        const glow = this.hint === i ? 0.5 + Math.sin(this.t * 8) * 0.5 : 0;
        if (glow) { ctx.fillStyle = 'rgba(255,240,150,' + (0.6 * glow) + ')'; ctx.beginPath(); ctx.arc(x, y, this.u * 0.62, 0, 7); ctx.fill(); }
        if (this.hammerMode && !covered) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, this.u * 0.55, 0, 7); ctx.stroke(); }
        K.screw(ctx, g.colorShown(i), x, y, this.u * 0.86, { lock: g.isLocked(i), key: !!s.key });
      }
    }
    // falling plates
    for (const f of this.falling) {
      if (f.t < 0) continue;
      const p = this.level.plates[f.pi];
      const k = f.t / 1.1;
      ctx.save();
      ctx.translate(0, U.ease.inCubic(k) * 700);
      ctx.translate(p.x * this.u, p.y * this.u);
      ctx.rotate(f.dir * k * 1.2);
      ctx.translate(-p.x * this.u, -p.y * this.u);
      K.plate(ctx, p, this.u, g.prep.plateScrews[f.pi].map((i) => this.level.screws[i]), 1 - k);
      ctx.restore();
    }
    ctx.restore();
    // flights
    for (const f of this.flights) {
      if (f.delay > 0) continue;
      const k = U.ease.inOutSine(Math.min(1, f.t / f.dur));
      const x = U.lerp(f.from.x, f.to.x, k), y = U.lerp(f.from.y, f.to.y, k) - Math.sin(k * Math.PI) * 60;
      ctx.save();
      ctx.translate(x, y);
      if (f.spin) ctx.rotate(k * 6);
      K.screw(ctx, f.c, 0, 0, 44 + Math.sin(k * Math.PI) * 10);
      ctx.restore();
    }
    // bottom bar
    R.panel(ctx, -20, 856, G.W + 40, 140 + R.padY, { fill: '#c49a73', r: 0, lift: 0 });
    K.bolt(ctx, 480, 878, 92, { t: this.t, mood: this.mood });
    if (this.hammerMode) R.text(ctx, 'Tap any screw to pull it out', G.W / 2, 845, { size: 20, color: pal.ink, weight: 900 });
    if (this.level.hard) R.text(ctx, 'Hard level: no boosters', 270, 845, { size: 20, color: '#c0392b', weight: 900 });
    UI.draw(ctx, this.ui);
    G.FX.draw(ctx);
    if (this.banner) {
      const k = Math.min(1, this.banner.t / 0.35);
      R.text(ctx, this.banner.text, G.W / 2, 560, { size: 64 * U.ease.outBack(k), color: '#fff', stroke: pal.ink, weight: 900 });
    }
  };

  S.drawTether = function (ctx, a, b, gone) {
    if (gone) return;
    ctx.save();
    ctx.strokeStyle = '#8a6a3a';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(a.x * this.u, a.y * this.u);
    ctx.lineTo(b.x * this.u, b.y * this.u);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8a6a3a';
    for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x * this.u, p.y * this.u, 7, 0, 7); ctx.fill(); }
    ctx.restore();
  };
})();
