'use strict';
// Screw-sorting rules, pure logic (no drawing) plus the exact solver used by tests, hints and the level generator.
// Board units: the board is level.board.w × level.board.h; plates are rotated rounded rects or circles.
(function () {
  const G = window.G;
  const SC = (G.SC = G.SC || {});
  // A screw counts as covered only when a higher plate overlaps its head noticeably (not just touches its rim).
  // Drawn head radius ≈ 0.36 units; the plate must reach within 0.26 of the centre. Matches what the player sees.
  SC.SCREW_R = 0.26;

  // Distance from point to a plate's shape (0 inside).
  SC.distToPlate = function (p, x, y) {
    if (p.shape === 'circle') return Math.max(0, Math.hypot(x - p.x, y - p.y) - p.r);
    const a = -(p.rot || 0) * Math.PI / 180;
    const dx0 = x - p.x, dy0 = y - p.y;
    const lx = dx0 * Math.cos(a) - dy0 * Math.sin(a);
    const ly = dx0 * Math.sin(a) + dy0 * Math.cos(a);
    const dx = Math.max(Math.abs(lx) - p.w / 2, 0), dy = Math.max(Math.abs(ly) - p.h / 2, 0);
    return Math.hypot(dx, dy);
  };

  // A plate held by one screw swings around it and hangs straight down (its centre below the pivot).
  SC.hangPose = function (p, px, py) {
    const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
    if (d < 0.05) return { shape: p.shape, x: p.x, y: p.y, w: p.w, h: p.h, r: p.r, rot: p.rot || 0 };
    const turn = Math.atan2(dx, dy);   // angle from straight-down to the current centre offset
    return { shape: p.shape, x: px, y: py + d, w: p.w, h: p.h, r: p.r, rot: (p.rot || 0) + turn * 180 / Math.PI };
  };

  // Precompute coverage (static geometry): which plates cover each screw at rest, and — for each plate and each
  // of its screws acting as the last pivot — which screws the hanging plate covers.
  SC.prepare = function (level) {
    if (level._prep && level._prep.hang) return level._prep;   // ignore caches from older rule versions
    const plates = level.plates, screws = level.screws;
    const pIndex = {};
    plates.forEach((p, i) => { pIndex[p.id] = i; });
    const covers = (pose, s) => SC.distToPlate(pose, s.x, s.y) < SC.SCREW_R;
    const above = screws.map((s) => { const own = plates[pIndex[s.plate]]; return plates.map((q, qi) => (q.layer > own.layer ? qi : -1)).filter((qi) => qi >= 0); });
    const coveredBy = screws.map((s, i) => above[i].filter((qi) => covers(plates[qi], s)));
    // hang[qi][pivotScrew] = Set of screw indices covered by plate qi hanging from that screw
    const hang = plates.map((q, qi) => {
      const out = {};
      screws.forEach((sp, j) => {
        if (pIndex[sp.plate] !== qi) return;
        const pose = SC.hangPose(q, sp.x, sp.y);
        const set = new Set();
        screws.forEach((s, i) => { if (above[i].indexOf(qi) >= 0 && covers(pose, s)) set.add(i); });
        out[j] = { pose, set };
      });
      return out;
    });
    const plateScrews = plates.map((p) => screws.map((s, i) => (s.plate === p.id ? i : -1)).filter((i) => i >= 0));
    const tether = plates.map((p) => (p.tether ? pIndex[p.tether] : -1));
    const keyOf = {};
    screws.forEach((s, i) => { if (s.key) keyOf[s.key] = i; });
    const lockKey = screws.map((s) => (s.lock ? keyOf[s.lock] : -1));
    level._prep = { pIndex, coveredBy, above, hang, plateScrews, tether, lockKey, screwPlate: screws.map((s) => pIndex[s.plate]) };
    return level._prep;
  };

  function Game(level, opts) {
    opts = opts || {};
    this.level = level;
    this.prep = SC.prepare(level);
    const ns = level.screws.length, np = level.plates.length;
    this.removed = new Array(ns).fill(false);
    this.fallen = new Array(np).fill(false);
    this.seen = level.screws.map(() => false);   // mystery screws stay hidden until first uncovered
    this.trayCap = level.tray + (opts.extraSlots || 0);
    this.tray = [];             // [{c, s}]
    this.boxes = [];            // active slots: {c, n} | null
    this.qi = 0;
    this.peak = 0;
    this.taps = 0;
    for (let k = 0; k < level.open; k++) this.boxes.push(this.nextBox());
    this.updateSeen();
  }
  SC.Game = Game;
  const P = Game.prototype;

  P.nextBox = function () { return this.qi < this.level.boxes.length ? { c: this.level.boxes[this.qi++], n: 0 } : null; };
  // The single screw still holding plate q, or -1 if it has 0 or 2+ screws left.
  P.pivotOf = function (q) {
    let piv = -1;
    for (const j of this.prep.plateScrews[q]) if (!this.removed[j]) { if (piv >= 0) return -1; piv = j; }
    return piv;
  };
  P.pose = function (q) { const piv = this.pivotOf(q); return piv >= 0 ? this.prep.hang[q][piv].pose : this.level.plates[q]; };
  // Plates currently covering screw i (for feedback when a covered screw is tapped).
  P.coverers = function (i) {
    const out = [];
    for (const q of this.prep.above[i]) {
      if (this.fallen[q]) continue;
      const piv = this.pivotOf(q);
      if (piv >= 0 ? this.prep.hang[q][piv].set.has(i) : this.prep.coveredBy[i].indexOf(q) >= 0) out.push(q);
    }
    return out;
  };
  P.isCovered = function (i) {
    for (const q of this.prep.above[i]) {
      if (this.fallen[q]) continue;
      const piv = this.pivotOf(q);
      if (piv >= 0 ? this.prep.hang[q][piv].set.has(i) : this.prep.coveredBy[i].indexOf(q) >= 0) return true;
    }
    return false;
  };
  P.isLocked = function (i) { const k = this.prep.lockKey[i]; return k >= 0 && !this.removed[k]; };
  P.tappable = function (i) { return !this.removed[i] && !this.isCovered(i) && !this.isLocked(i); };
  P.updateSeen = function () { for (let i = 0; i < this.seen.length; i++) if (!this.seen[i] && !this.isCovered(i)) this.seen[i] = true; };
  P.colorShown = function (i) { const s = this.level.screws[i]; return s.hidden && !this.seen[i] ? -1 : s.c; };
  P.boxFor = function (c) { return this.boxes.findIndex((b) => b && b.c === c && b.n < 3); };
  P.destFor = function (i) {
    const c = this.level.screws[i].c;
    const b = this.boxFor(c);
    if (b >= 0) return { kind: 'box', slot: b };
    if (this.tray.length < this.trayCap) return { kind: 'tray', slot: this.tray.length };
    return null;
  };

  // Tap a screw. Returns an event; ev.ok false means nothing happened.
  P.tap = function (i, force) {
    if (this.removed[i]) return { ok: false, why: 'gone' };
    if (!force && this.isCovered(i)) return { ok: false, why: 'covered' };
    if (!force && this.isLocked(i)) return { ok: false, why: 'locked' };
    const d = this.destFor(i);
    if (!d) return { ok: false, why: 'full' };
    const s = this.level.screws[i];
    const ev = { ok: true, screw: i, c: s.c, dest: d, boxDone: [], arrivals: [], transfers: [], fallen: [], unlocked: [], revealed: [] };
    this.removed[i] = true;
    this.taps++;
    if (d.kind === 'box') this.boxes[d.slot].n++;
    else { this.tray.push({ c: s.c, s: i }); this.peak = Math.max(this.peak, this.tray.length); }
    this.settleBoxes(ev);
    // padlocks opened by this key
    if (s.key) this.prep.lockKey.forEach((k, j) => { if (k === i && !this.removed[j]) ev.unlocked.push(j); });
    this.dropPlates(ev);
    const before = this.seen.slice();
    this.updateSeen();
    this.seen.forEach((v, j) => { if (v && !before[j] && this.level.screws[j].hidden) ev.revealed.push(j); });
    return ev;
  };

  P.settleBoxes = function (ev) {
    let guard = 0;
    for (;;) {
      if (guard++ > 100) break;
      const done = this.boxes.findIndex((b) => b && b.n >= 3);
      if (done < 0) break;
      ev.boxDone.push({ slot: done, c: this.boxes[done].c });
      this.boxes[done] = this.nextBox();
      const nb = this.boxes[done];
      if (nb) {
        ev.arrivals.push({ slot: done, c: nb.c });
        for (let k = 0; k < this.tray.length && nb.n < 3;) {
          if (this.tray[k].c === nb.c) { ev.transfers.push({ s: this.tray[k].s, slot: done, from: k }); this.tray.splice(k, 1); nb.n++; }
          else k++;
        }
      }
    }
  };

  P.dropPlates = function (ev) {
    let changed = true;
    while (changed) {
      changed = false;
      this.level.plates.forEach((p, pi) => {
        if (this.fallen[pi]) return;
        if (!this.prep.plateScrews[pi].every((i) => this.removed[i])) return;
        const t = this.prep.tether[pi];
        if (t >= 0 && !this.fallen[t]) return;
        this.fallen[pi] = true;
        ev.fallen.push(pi);
        changed = true;
      });
    }
  };

  P.isWon = function () { return this.removed.every(Boolean); };
  P.moves = function () {
    const out = [];
    for (let i = 0; i < this.removed.length; i++) if (this.tappable(i) && this.destFor(i)) out.push(i);
    return out;
  };
  // Lost when the tray is completely full (v4 rule, as in Screwdom), or when nothing can move.
  P.trayFull = function () { return this.tray.length >= this.trayCap; };
  P.isStuck = function () { return !this.isWon() && (this.trayFull() || this.moves().length === 0); };
  P.starsFor = function (peak) {
    const opt = this.level.optPeak != null ? this.level.optPeak : 0;
    return peak <= opt ? 3 : peak <= opt + 2 ? 2 : 1;
  };

  // ---- compact state for search ----
  P.snapshot = function () {
    return { removed: this.removed.slice(), fallen: this.fallen.slice(), tray: this.tray.map((t) => ({ c: t.c, s: t.s })),
      boxes: this.boxes.map((b) => (b ? { c: b.c, n: b.n } : null)), qi: this.qi, peak: this.peak, taps: this.taps, seen: this.seen.slice(), trayCap: this.trayCap };
  };
  P.restore = function (s) {
    this.removed = s.removed.slice(); this.fallen = s.fallen.slice(); this.tray = s.tray.map((t) => ({ c: t.c, s: t.s }));
    this.boxes = s.boxes.map((b) => (b ? { c: b.c, n: b.n } : null)); this.qi = s.qi; this.peak = s.peak; this.taps = s.taps;
    this.seen = s.seen.slice(); this.trayCap = s.trayCap;
  };
  P.key = function () {
    let r = '';
    for (const v of this.removed) r += v ? '1' : '0';
    const tr = this.tray.map((t) => t.c).sort().join('');
    const bx = this.boxes.map((b) => (b ? b.c + ':' + b.n : '-')).sort().join(',');
    return r + '|' + tr + '|' + this.qi + '|' + bx;
  };

  // Exact search: is the level solvable with the tray never above `limit`? Returns the move list or null.
  SC.solveWithin = function (game, limit, budget) {
    const seen = new Set();
    const path = [];
    let nodes = 0;
    const order = (moves) => {
      // screws that go straight into a box first
      return moves.sort((a, b) => (game.destFor(a).kind === 'box' ? 0 : 1) - (game.destFor(b).kind === 'box' ? 0 : 1));
    };
    function dfs() {
      if (game.isWon()) return true;
      if (++nodes > budget) throw new Error('budget');
      const k = game.key();
      if (seen.has(k)) return false;
      seen.add(k);
      const snap = game.snapshot();
      for (const m of order(game.moves())) {
        const d = game.destFor(m);
        if (d.kind === 'tray' && game.tray.length + 1 > limit) continue;
        game.tap(m);
        if (game.isStuck()) { game.restore(snap); continue; }
        path.push(m);
        if (dfs()) return true;
        path.pop();
        game.restore(snap);
      }
      return false;
    }
    const snap0 = game.snapshot();
    try {
      const ok = dfs();
      game.restore(snap0);
      return { ok, path: ok ? path.slice() : null, nodes };
    } catch (e) {
      game.restore(snap0);
      return { ok: false, path: null, nodes, budgetHit: true };
    }
  };

  // Minimum achievable peak tray fill from the game's current state (and a solution reaching it).
  SC.solve = function (level, opts) {
    opts = opts || {};
    const budget = opts.budget || 400000;
    const game = opts.game || new Game(level, { extraSlots: opts.extraSlots || 0 });
    const lo = opts.game ? game.tray.length : 0;
    let totalNodes = 0;
    for (let limit = lo; limit < game.trayCap; limit++) {
      const r = SC.solveWithin(game, limit, budget);
      totalNodes += r.nodes;
      if (r.ok) return { solvable: true, peak: Math.max(limit, game.peak), path: r.path, nodes: totalNodes };
      if (r.budgetHit) return { solvable: null, peak: null, path: null, nodes: totalNodes, budgetHit: true };
    }
    return { solvable: false, peak: null, path: null, nodes: totalNodes };
  };

  // Hint for the current position: first move of a solution within the current tray capacity, else a sensible move.
  SC.hint = function (game) {
    const r = SC.solveWithin(game, game.trayCap - 1, 30000);
    if (r.ok && r.path.length) return r.path[0];
    const ms = game.moves();
    const toBox = ms.find((m) => game.destFor(m).kind === 'box');
    return toBox != null ? toBox : ms.length ? ms[0] : -1;
  };
})();
