'use strict';
// Match-3 rules, pure logic (no drawing). The scene animates the events each step returns.
// Grid chars: '.' cell  ' ' hole  'd'/'D' dust 1/2  'c'/'C' crate 1/2  't' twined candy  'g' gear  'x' dust1+twine
(function () {
  const G = window.G;
  const M3 = (G.M3 = G.M3 || {});
  let NEXT_ID = 1;

  function Board(level, seed) {
    const rows = level.grid;
    this.h = rows.length;
    this.w = rows[0].length;
    this.level = level;
    this.ncolors = level.colors;
    this.rng = new G.U.Rng(seed >>> 0);
    this.valid = [];
    this.dust = [];
    this.crate = [];
    this.cells = [];
    this.gearsTotal = level.gears || 0;
    this.gearsSpawned = 0;
    this.gearsCollected = 0;
    this.collected = {};      // color → count
    this.cratesBroken = 0;
    this.score = 0;
    this.movesLeft = level.moves;
    this.cascade = 0;
    this.phase = 'idle';      // idle | match | fall
    const twine = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = rows[y][x];
        const i = y * this.w + x;
        this.valid[i] = ch !== ' ';
        this.dust[i] = ch === 'd' || ch === 'x' ? 1 : ch === 'D' ? 2 : 0;
        this.crate[i] = ch === 'c' ? 1 : ch === 'C' ? 2 : 0;
        this.cells[i] = null;
        if (ch === 't' || ch === 'x') twine.push(i);
        if (ch === 'g') { this.cells[i] = this.mkGear(x, y); this.gearsSpawned++; }
      }
    }
    this.fillInitial();
    for (const i of twine) if (this.cells[i]) this.cells[i].lock = 1;
    this.dustTotal = this.countDust();
    this.crateTotal = this.crate.filter((v) => v > 0).length;
  }
  M3.Board = Board;
  const B = Board.prototype;

  B.idx = function (x, y) { return y * this.w + x; };
  B.inb = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  B.ok = function (x, y) { return this.inb(x, y) && this.valid[this.idx(x, y)]; };
  B.at = function (x, y) { return this.ok(x, y) ? this.cells[this.idx(x, y)] : null; };
  B.mk = function (x, y, c) { return { id: NEXT_ID++, x, y, c, sp: null, lock: 0, kind: 'candy', born: 0 }; };
  B.mkGear = function (x, y) { return { id: NEXT_ID++, x, y, c: -1, sp: null, lock: 0, kind: 'gear' }; };
  B.countDust = function () { let n = 0; for (let i = 0; i < this.dust.length; i++) n += this.dust[i] > 0 ? 1 : 0; return n; };
  B.color = function () { return this.rng.int(this.ncolors); };
  // A cell that holds a tile slot (not a hole, not a crate).
  B.open = function (x, y) { return this.ok(x, y) && !this.crate[this.idx(x, y)]; };

  B.fillInitial = function () {
    for (let tries = 0; tries < 200; tries++) {
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const i = this.idx(x, y);
          if (!this.open(x, y) || (this.cells[i] && this.cells[i].kind === 'gear')) continue;
          let c, guard = 0;
          do { c = this.color(); guard++; } while (guard < 30 && this.makesRun(x, y, c));
          this.cells[i] = this.mk(x, y, c);
        }
      }
      if (this.findMoves(1).length) return;
      for (let i = 0; i < this.cells.length; i++) if (this.cells[i] && this.cells[i].kind === 'candy') this.cells[i] = null;
    }
  };
  B.makesRun = function (x, y, c) {
    const same = (xx, yy) => { const t = this.at(xx, yy); return t && t.kind === 'candy' && t.c === c; };
    if ((same(x - 1, y) && same(x - 2, y)) || (same(x, y - 1) && same(x, y - 2))) return true;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (same(x + dx, y) && same(x, y + dy) && same(x + dx, y + dy)) return true;
    return false;
  };

  B.movable = function (t) { return t && !t.lock; };
  B.adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

  // ---- matching ----
  // Returns groups: [{cells:[i...], color, h:maxH, v:maxV}]
  B.findGroups = function () {
    const w = this.w, h = this.h;
    const runs = [];
    const colorAt = (x, y) => { const t = this.at(x, y); return t && t.kind === 'candy' && t.sp !== 'rainbow' ? t.c : -1; };
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = colorAt(x, y);
        let e = x + 1;
        if (c >= 0) while (e < w && colorAt(e, y) === c) e++;
        if (c >= 0 && e - x >= 3) { const cells = []; for (let k = x; k < e; k++) cells.push(this.idx(k, y)); runs.push({ cells, dir: 'h', c }); }
        x = e;
      }
    }
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        const c = colorAt(x, y);
        let e = y + 1;
        if (c >= 0) while (e < h && colorAt(x, e) === c) e++;
        if (c >= 0 && e - y >= 3) { const cells = []; for (let k = y; k < e; k++) cells.push(this.idx(x, k)); runs.push({ cells, dir: 'v', c }); }
        y = e;
      }
    }
    // 2×2 squares of one colour (they make a fish)
    for (let y = 0; y + 1 < h; y++) {
      for (let x = 0; x + 1 < w; x++) {
        const c = colorAt(x, y);
        if (c >= 0 && colorAt(x + 1, y) === c && colorAt(x, y + 1) === c && colorAt(x + 1, y + 1) === c) {
          runs.push({ cells: [this.idx(x, y), this.idx(x + 1, y), this.idx(x, y + 1), this.idx(x + 1, y + 1)], dir: 'sq', c });
        }
      }
    }
    // union runs that share a cell
    const groups = [];
    const owner = new Map();
    for (const r of runs) {
      let g = null;
      for (const i of r.cells) if (owner.has(i)) { g = owner.get(i); break; }
      if (!g) { g = { cells: new Set(), c: r.c, h: 0, v: 0, sq: false }; groups.push(g); }
      for (const i of r.cells) { g.cells.add(i); owner.set(i, g); }
      if (r.dir === 'h') g.h = Math.max(g.h, r.cells.length);
      else if (r.dir === 'v') g.v = Math.max(g.v, r.cells.length);
      else g.sq = true;
    }
    return groups.map((g) => ({ cells: Array.from(g.cells), c: g.c, h: g.h, v: g.v, sq: g.sq }));
  };

  B.hasMatchAt = function (x, y) {
    const t = this.at(x, y);
    if (!t || t.kind !== 'candy' || t.sp === 'rainbow') return false;
    const c = t.c;
    const same = (xx, yy) => { const u = this.at(xx, yy); return u && u.kind === 'candy' && u.sp !== 'rainbow' && u.c === c; };
    let n = 1; for (let k = x - 1; same(k, y); k--) n++; for (let k = x + 1; same(k, y); k++) n++;
    if (n >= 3) return true;
    n = 1; for (let k = y - 1; same(x, k); k--) n++; for (let k = y + 1; same(x, k); k++) n++;
    if (n >= 3) return true;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (same(x + dx, y) && same(x, y + dy) && same(x + dx, y + dy)) return true;
    return false;
  };

  B.rawSwap = function (a, b) {
    const ia = this.idx(a.x, a.y), ib = this.idx(b.x, b.y);
    const ta = this.cells[ia], tb = this.cells[ib];
    this.cells[ia] = tb; this.cells[ib] = ta;
    if (tb) { tb.x = a.x; tb.y = a.y; }
    if (ta) { ta.x = b.x; ta.y = b.y; }
  };

  // Is swapping these two cells a legal move?
  B.swapValid = function (a, b) {
    if (!this.adjacent(a, b)) return false;
    const ta = this.at(a.x, a.y), tb = this.at(b.x, b.y);
    if (!this.movable(ta) || !this.movable(tb)) return false;
    if (ta.sp && tb.sp) return true;
    if ((ta.sp === 'rainbow' && tb.kind === 'candy') || (tb.sp === 'rainbow' && ta.kind === 'candy')) return true;
    this.rawSwap(a, b);
    const ok = this.hasMatchAt(a.x, a.y) || this.hasMatchAt(b.x, b.y);
    this.rawSwap(a, b);
    return ok;
  };

  B.findMoves = function (limit) {
    const out = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const a = { x, y }, b = { x: x + dx, y: y + dy };
          if (!this.ok(b.x, b.y)) continue;
          if (this.swapValid(a, b)) { out.push([a, b]); if (limit && out.length >= limit) return out; }
        }
      }
    }
    return out;
  };

  // ---- the move ----
  // Returns null if illegal; else the swap event. Then call step() until it returns null.
  B.trySwap = function (a, b) {
    if (this.phase !== 'idle' || this.movesLeft <= 0) return null;
    if (!this.swapValid(a, b)) return null;
    const ta = this.at(a.x, a.y), tb = this.at(b.x, b.y);
    this.rawSwap(a, b);
    this.movesLeft--;
    this.cascade = 0;
    this.lastSwap = [{ x: b.x, y: b.y }, { x: a.x, y: a.y }];   // where ta and tb now are
    this.pendingCombo = null;
    this.comboAt = { x: b.x, y: b.y };   // combos go off where the dragged candy landed
    if (ta.sp && tb.sp) this.pendingCombo = tb.sp === 'rainbow' ? { a: tb, b: ta } : { a: ta, b: tb };
    else if (ta.sp === 'rainbow') this.pendingCombo = { a: ta, b: tb };
    else if (tb.sp === 'rainbow') this.pendingCombo = { a: tb, b: ta };
    this.phase = 'match';
    return { type: 'swap', a, b };
  };

  // Hammer booster: clear one tile (or hit a crate) without using a move.
  B.hammer = function (x, y) {
    if (this.phase !== 'idle' || !this.ok(x, y)) return null;
    const i = this.idx(x, y);
    const t = this.cells[i];
    if (!t && !this.crate[i]) return null;
    if (t && t.kind === 'gear') return null;
    this.cascade = 0;
    const ev = this.newClearEvent();
    if (this.crate[i]) this.hitCrate(i, ev); else this.clearCell(i, ev, 'hammer');
    this.drainQueue(ev);
    this.phase = 'fall';
    return ev;
  };

  // Shuffle: rearrange the movable candies until there is a move and no ready-made match.
  B.shuffle = function () {
    const slots = [], tiles = [];
    for (let i = 0; i < this.cells.length; i++) {
      const t = this.cells[i];
      if (t && t.kind === 'candy' && !t.lock) { slots.push(i); tiles.push(t); }
    }
    for (let tries = 0; tries < 100; tries++) {
      this.rng.shuffle(tiles);
      slots.forEach((i, k) => { const t = tiles[k]; t.x = i % this.w; t.y = Math.floor(i / this.w); this.cells[i] = t; });
      if (!this.findGroups().length && this.findMoves(1).length) break;
    }
    return { type: 'shuffle' };
  };

  B.newClearEvent = function () { return { type: 'clear', cleared: [], created: [], blasts: [], dust: [], crates: [], gears: [], unlocked: [], points: 0 }; };

  B.addPoints = function (ev, p) { const v = p * Math.max(1, this.cascade); ev.points += v; this.score += v; };

  // Clear one cell's tile (and its dust); specials join the activation queue.
  B.clearCell = function (i, ev, why) {
    const t = this.cells[i];
    if (!t || t.kind === 'gear' || t._clearing) return;
    if (t.lock) {
      t.lock = 0;
      ev.unlocked.push({ x: t.x, y: t.y });
      this.addPoints(ev, 40);
      if (why === 'match') return;   // a match frees tied candy; it stays
    }
    t._clearing = true;
    this.cells[i] = null;
    ev.cleared.push({ id: t.id, x: t.x, y: t.y, c: t.c, sp: t.sp });
    this.collected[t.c] = (this.collected[t.c] || 0) + 1;
    this.addPoints(ev, 60);
    if (this.dust[i] > 0) { this.dust[i]--; ev.dust.push({ x: t.x, y: t.y, left: this.dust[i] }); this.addPoints(ev, 100); }
    if (t.sp) { this.queue = this.queue || []; this.queue.push(t); }
  };

  B.hitCrate = function (i, ev) {
    if (!this.crate[i] || ev._crateHit && ev._crateHit.has(i)) return;
    ev._crateHit = ev._crateHit || new Set();
    ev._crateHit.add(i);
    this.crate[i]--;
    const x = i % this.w, y = Math.floor(i / this.w);
    ev.crates.push({ x, y, left: this.crate[i] });
    this.addPoints(ev, 150);
    if (!this.crate[i]) this.cratesBroken++;
  };

  // Hit an area cell: tile → cleared, crate → damaged.
  B.hitCell = function (x, y, ev) {
    if (!this.ok(x, y)) return;
    const i = this.idx(x, y);
    if (this.crate[i]) { this.hitCrate(i, ev); return; }
    this.clearCell(i, ev, 'blast');
  };

  B.blast = function (t, ev, kind) {
    const k = kind || t.sp;
    const x = t.x, y = t.y;
    ev.blasts.push({ kind: k, x, y, c: t.c });
    if (k === 'rh' || k === 'row') for (let xx = 0; xx < this.w; xx++) this.hitCell(xx, y, ev);
    else if (k === 'rv' || k === 'col') for (let yy = 0; yy < this.h; yy++) this.hitCell(x, yy, ev);
    else if (k === 'bomb') { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.hitCell(x + dx, y + dy, ev); }
    else if (k === 'fish') {
      ev.blasts.pop();
      const tg = this.fishTarget();
      ev.blasts.push({ kind: 'fish', x, y, tx: tg.x, ty: tg.y, c: t.c });
      this.hitCell(tg.x, tg.y, ev);
    }
    else if (k === 'rainbow') {
      const c = t.target != null ? t.target : this.mostCommonColor();
      for (let i = 0; i < this.cells.length; i++) { const u = this.cells[i]; if (u && u.kind === 'candy' && u.c === c) this.hitCell(u.x, u.y, ev); }
    }
    this.addPoints(ev, 200);
  };

  // Where a fish swims: something the goals need (crate, dust, a goal-coloured candy, the candy under a gear),
  // else any candy. Ties broken by the board's own RNG so replays and resumes stay deterministic.
  B.fishTarget = function () {
    const goals = this.level.goals;
    const want = (g) => { const pr = this.goalProgress(g); return pr.have < pr.need; };
    const pick = (list) => list[this.rng.int(list.length)];
    const cells = [];
    for (let i = 0; i < this.cells.length; i++) if (this.valid[i]) cells.push(i);
    const xy = (i) => ({ x: i % this.w, y: Math.floor(i / this.w) });
    const live = (i) => this.cells[i] && !this.cells[i]._clearing;
    const tiers = [
      goals.some((g) => g.type === 'crate' && want(g)) ? cells.filter((i) => this.crate[i] > 0) : [],
      goals.some((g) => g.type === 'dust' && want(g)) ? cells.filter((i) => this.dust[i] > 0 && live(i) && this.cells[i].kind === 'candy') : [],
      cells.filter((i) => live(i) && this.cells[i].kind === 'candy' && goals.some((g) => g.type === 'collect' && g.color === this.cells[i].c && want(g))),
      goals.some((g) => g.type === 'gear' && want(g)) ? cells.filter((i) => { const above = i - this.w; return above >= 0 && this.cells[above] && this.cells[above].kind === 'gear' && live(i); }) : [],
      cells.filter((i) => live(i) && this.cells[i].kind === 'candy'),
    ];
    for (const t of tiers) if (t.length) return xy(pick(t));
    return xy(cells[0]);
  };

  B.mostCommonColor = function () {
    const n = [];
    for (const t of this.cells) if (t && t.kind === 'candy' && t.sp !== 'rainbow') n[t.c] = (n[t.c] || 0) + 1;
    let best = 0;
    for (let c = 1; c < n.length; c++) if ((n[c] || 0) > (n[best] || 0)) best = c;
    return best;
  };

  B.drainQueue = function (ev) {
    let guard = 0;
    while (this.queue && this.queue.length && guard++ < 500) {
      const t = this.queue.shift();
      this.blast(t, ev);
    }
    this.queue = [];
  };

  B.comboBlast = function (ev) {
    const { a, b } = this.pendingCombo;
    this.pendingCombo = null;
    const p = this.comboAt || { x: b.x, y: b.y };
    const at = (c) => ({ x: p.x, y: p.y, c });
    const take = (t) => { const i = this.idx(t.x, t.y); if (this.cells[i] === t) { t._clearing = true; this.cells[i] = null; ev.cleared.push({ id: t.id, x: t.x, y: t.y, c: t.c, sp: t.sp }); if (this.dust[i] > 0) { this.dust[i]--; ev.dust.push({ x: t.x, y: t.y, left: this.dust[i] }); } } };
    const sa = a.sp, sb = b.sp;
    take(a); take(b);
    if (sa === 'rainbow' && sb === 'rainbow') {
      ev.blasts.push({ kind: 'all', x: p.x, y: p.y });
      for (let i = 0; i < this.cells.length; i++) if (this.ok(i % this.w, Math.floor(i / this.w))) this.hitCell(i % this.w, Math.floor(i / this.w), ev);
    } else if (sa === 'rainbow') {
      const c = b.c;
      ev.blasts.push({ kind: 'rainbow', x: p.x, y: p.y, c });
      if (sb) {   // every candy of that colour becomes b's special, then goes off
        for (const t of this.cells) if (t && t.kind === 'candy' && t.c === c && !t.sp) t.sp = sb === 'bomb' || sb === 'fish' ? sb : (this.rng.next() < 0.5 ? 'rh' : 'rv');
      }
      for (let i = 0; i < this.cells.length; i++) { const u = this.cells[i]; if (u && u.kind === 'candy' && u.c === c) this.hitCell(u.x, u.y, ev); }
      if (sb) { this.queue = this.queue || []; this.queue.push(b); }
    } else {
      const rocket = (s) => s === 'rh' || s === 'rv';
      if (sa === 'fish' || sb === 'fish') {
        const other = sa === 'fish' ? sb : sa;
        if (other === 'fish') { for (let k = 0; k < 3; k++) this.blast(at(a.c), ev, 'fish'); }
        else {   // the fish carries the other special to its target and sets it off there
          const tg = this.fishTarget();
          ev.blasts.push({ kind: 'fish', x: p.x, y: p.y, tx: tg.x, ty: tg.y, c: a.c });
          this.blast({ x: tg.x, y: tg.y, c: b.c }, ev, other === 'bomb' ? 'bomb' : other);
        }
      } else if (rocket(sa) && rocket(sb)) { this.blast(at(b.c), ev, 'row'); this.blast(at(b.c), ev, 'col'); }
      else if (sa === 'bomb' && sb === 'bomb') {
        ev.blasts.push({ kind: 'bomb2', x: p.x, y: p.y });
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.hitCell(p.x + dx, p.y + dy, ev);
      } else {   // rocket + bomb
        ev.blasts.push({ kind: 'cross3', x: p.x, y: p.y });
        for (let d = -1; d <= 1; d++) {
          for (let xx = 0; xx < this.w; xx++) this.hitCell(xx, p.y + d, ev);
          for (let yy = 0; yy < this.h; yy++) this.hitCell(p.x + d, yy, ev);
        }
      }
    }
    this.addPoints(ev, 500);
  };

  // One resolution step. Returns an event, or null when the board is stable.
  B.step = function () {
    if (this.phase === 'match') {
      this.cascade++;
      const ev = this.newClearEvent();
      if (this.pendingCombo) this.comboBlast(ev);
      // gears that reached the bottom of their column
      for (let x = 0; x < this.w; x++) {
        let yb = -1;
        for (let y = this.h - 1; y >= 0; y--) if (this.open(x, y)) { yb = y; break; }
        if (yb < 0) continue;
        const t = this.at(x, yb);
        if (t && t.kind === 'gear') {
          this.cells[this.idx(x, yb)] = null;
          this.gearsCollected++;
          ev.gears.push({ id: t.id, x, y: yb });
          this.addPoints(ev, 1000);
        }
      }
      const groups = this.findGroups();
      const swapCells = this.cascade === 1 && this.lastSwap ? this.lastSwap.map((p) => this.idx(p.x, p.y)) : [];
      const toCreate = [];
      for (const g of groups) {
        let sp = null;
        const len = Math.max(g.h, g.v);
        if (len >= 5) sp = 'rainbow';
        else if (g.h >= 3 && g.v >= 3) sp = 'bomb';
        else if (len === 4) sp = g.h === 4 ? 'rv' : 'rh';
        else if (g.sq) sp = 'fish';
        let at = g.cells.find((i) => swapCells.indexOf(i) >= 0);
        if (at == null) at = g.cells[Math.floor(g.cells.length / 2)];
        if (sp) toCreate.push({ at, sp, c: g.c });
        // neighbours of matched cells: crates take a hit
        for (const i of g.cells) {
          const x = i % this.w, y = Math.floor(i / this.w);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (this.ok(x + dx, y + dy)) { const j = this.idx(x + dx, y + dy); if (this.crate[j]) this.hitCrate(j, ev); }
          }
        }
        for (const i of g.cells) this.clearCell(i, ev, 'match');
        this.addPoints(ev, g.cells.length > 3 ? 120 * (g.cells.length - 3) : 0);
      }
      this.drainQueue(ev);
      for (const s of toCreate) {
        if (this.cells[s.at]) continue;   // a blast already refilled? (cannot: no refill mid-step) — keep safe
        const x = s.at % this.w, y = Math.floor(s.at / this.w);
        const t = this.mk(x, y, s.c);
        t.sp = s.sp;
        this.cells[s.at] = t;
        ev.created.push({ id: t.id, x, y, c: t.c, sp: t.sp });
      }
      for (const t of this.cells) if (t) delete t._clearing;
      const any = ev.cleared.length || ev.gears.length || ev.created.length || ev.crates.length || ev.unlocked.length;
      if (!any) {
        this.phase = 'idle';
        this.lastSwap = null;
        if (!this.isWon() && this.movesLeft > 0 && !this.findMoves(1).length) return this.shuffle();
        return null;
      }
      this.phase = 'fall';
      return ev;
    }
    if (this.phase === 'fall') {
      const moves = this.gravity();
      this.phase = 'match';
      return { type: 'fall', moves };
    }
    return null;
  };

  // Gravity with diagonal slides around crates and tied candy; refills from the top of each column.
  B.gravity = function () {
    const moves = [];
    const canFall = (t) => !!t;   // tied candy still falls; twine only stops swaps
    for (let pass = 0; pass < 200; pass++) {
      let changed = false;
      for (let y = this.h - 1; y >= 0; y--) {
        for (let x = 0; x < this.w; x++) {
          if (!this.open(x, y) || this.cells[this.idx(x, y)]) continue;
          // nearest cell above in this column (holes are skipped; tiles fall through them)
          let ya = y - 1;
          while (ya >= 0 && !this.ok(x, ya)) ya--;
          if (ya < 0) { this.spawn(x, y, moves); changed = true; continue; }
          const ia = this.idx(x, ya);
          const ta = this.cells[ia];
          if (!this.crate[ia] && canFall(ta)) {
            this.cells[ia] = null; this.cells[this.idx(x, y)] = ta;
            moves.push({ id: ta.id, fx: x, fy: ya, x, y }); ta.x = x; ta.y = y; changed = true;
          }
        }
      }
      if (changed) continue;
      // diagonal pass: only when nothing can fall straight down
      for (let y = this.h - 1; y >= 0 && !changed; y--) {
        for (let x = 0; x < this.w && !changed; x++) {
          if (!this.open(x, y) || this.cells[this.idx(x, y)]) continue;
          for (const dx of [-1, 1]) {
            const sx = x + dx, sy = y - 1;
            if (!this.ok(sx, sy)) continue;
            const t = this.cells[this.idx(sx, sy)];
            if (!canFall(t)) continue;
            // only slide if the tile could not fall into its own column
            const below = this.ok(sx, sy + 1) && this.open(sx, sy + 1) && !this.cells[this.idx(sx, sy + 1)];
            if (below) continue;
            this.cells[this.idx(sx, sy)] = null; this.cells[this.idx(x, y)] = t;
            moves.push({ id: t.id, fx: sx, fy: sy, x, y }); t.x = x; t.y = y; changed = true;
            break;
          }
        }
      }
      if (!changed) break;
    }
    return moves;
  };

  B.spawn = function (x, y, moves) {
    let t;
    const onBoard = this.cells.filter((u) => u && u.kind === 'gear').length;
    const want = this.gearsSpawned < this.gearsTotal && onBoard < (this.level.gearsOnBoard || 1);
    if (want && this.rng.next() < 0.35) { t = this.mkGear(x, y); this.gearsSpawned++; }
    else t = this.mk(x, y, this.color());
    this.cells[this.idx(x, y)] = t;
    moves.push({ id: t.id, fx: x, fy: y - 1, x, y, spawn: true });
  };

  // ---- goals ----
  B.goalProgress = function (g) {
    if (g.type === 'collect') return { have: Math.min(g.n, this.collected[g.color] || 0), need: g.n };
    if (g.type === 'dust') return { have: this.dustTotal - this.countDust(), need: this.dustTotal };
    if (g.type === 'crate') return { have: this.cratesBroken, need: this.crateTotal };
    if (g.type === 'gear') return { have: Math.min(g.n, this.gearsCollected), need: g.n };
    if (g.type === 'score') return { have: Math.min(g.n, this.score), need: g.n };
    return { have: 0, need: 1 };
  };
  B.isWon = function () { return this.level.goals.every((g) => { const p = this.goalProgress(g); return p.have >= p.need; }); };
  B.isLost = function () { return this.phase === 'idle' && !this.isWon() && this.movesLeft <= 0; };
  B.finalScore = function () { return this.score + this.movesLeft * 300; };
  B.starsFor = function (score) {
    const t = this.level.stars || [0, 0];
    return score >= t[1] ? 3 : score >= t[0] ? 2 : 1;
  };

  // Deep-ish copy for the solver bot (tiles are re-created, ids kept).
  B.clone = function (seed) {
    const b = Object.create(Board.prototype);
    Object.assign(b, this);
    b.cells = this.cells.map((t) => (t ? Object.assign({}, t) : null));
    b.dust = this.dust.slice();
    b.crate = this.crate.slice();
    b.collected = Object.assign({}, this.collected);
    b.rng = seed == null ? this.rng.clone() : new G.U.Rng(seed);
    b.queue = [];
    return b;
  };
  // ---- save / resume (v3) ----
  B.serialize = function () {
    return { cells: this.cells.map((t) => (t ? [t.id, t.c, t.sp || 0, t.lock, t.kind === 'gear' ? 1 : 0] : 0)), dust: this.dust.slice(), crate: this.crate.slice(),
      rng: this.rng.s, movesLeft: this.movesLeft, score: this.score, collected: Object.assign({}, this.collected), gearsSpawned: this.gearsSpawned,
      gearsCollected: this.gearsCollected, cratesBroken: this.cratesBroken, dustTotal: this.dustTotal, crateTotal: this.crateTotal };
  };
  M3.Board.restore = function (level, d) {
    const b = new Board(level, 1);
    b.rng = new G.U.Rng(d.rng);
    b.dust = d.dust.slice(); b.crate = d.crate.slice();
    b.cells = d.cells.map((e, i) => {
      if (!e) return null;
      NEXT_ID = Math.max(NEXT_ID, e[0] + 1);
      return { id: e[0], x: i % b.w, y: Math.floor(i / b.w), c: e[1], sp: e[2] || null, lock: e[3], kind: e[4] ? 'gear' : 'candy' };
    });
    for (const k of ['movesLeft', 'score', 'gearsSpawned', 'gearsCollected', 'cratesBroken', 'dustTotal', 'crateTotal']) b[k] = d[k];
    b.collected = Object.assign({}, d.collected);
    b.phase = 'idle';
    return b;
  };
  B.resolve = function () { let guard = 0, ev; while ((ev = this.step()) && guard++ < 400) { /* run to stable */ } };
})();
