// Map mechanics plugged into MapScene: stealth guards with vision cones, wind gust zones, pushable objects.
//
// Map def fields:
//   guards: [{ id, sprite, path: [[x,y], ...], speed: 1.8, view: 4, pause: 1.2, troop, if }]
//   hides:  [{ x, y, w, h }]       cells where the player cannot be seen (shadows, behind crates)
//   checkpoint: [x, y, dir]        where the player is returned after being caught
//   onCaught: async (S, guard) => {}   custom handler (default: battle guard.troop, then back to checkpoint)
//   winds:  [{ x, y, w, h, dir: 'left', period: 3, dur: 1.2, phase: 0 }]
//   objects with { push: true } can be shoved one tile by walking into them;
//   def.onPush(S, obj) is called after each push (check puzzle solutions there).
'use strict';
(function () {
  const T = G.TILE;
  const U = G.U;
  const P = G.MapScene.prototype;

  P.initMech = function () {
    const def = this.def;
    this.windT = 0;
    this.windPushT = 0;
    for (const gd of def.guards || []) {
      if (gd.if && !gd.if(G.state)) continue;
      const a = new G.Mapx.Actor(Object.assign({ sprite: 'temple_guard', speed: gd.speed || 1.8 }, gd, {
        x: gd.path[0][0], y: gd.path[0][1], def: gd, guard: true, wp: 1, pauseT: 0, dir: gd.dir || 'down',
      }));
      this.npcs.push(a);
    }
  };

  // --------------------------------------------------------------- guards
  P.guardSees = function (g, px, py) {
    const view = g.def.view || 4;
    const [dx, dy] = U.dirs[g.dir];
    const rx = px - g.x, ry = py - g.y;
    const fwd = rx * dx + ry * dy;            // distance along facing
    const side = Math.abs(rx * dy - ry * dx);  // lateral distance
    if (fwd < 1 || fwd > view) return false;
    if (side > Math.floor((fwd + 1) / 2)) return false;
    // hiding spots
    for (const h of this.def.hides || []) if (px >= h.x && px < h.x + (h.w || 1) && py >= h.y && py < h.y + (h.h || 1)) return false;
    // line of sight (sample along the line)
    const steps = Math.max(Math.abs(rx), Math.abs(ry)) * 2;
    for (let i = 1; i < steps; i++) {
      const cx = Math.round(g.x + rx * i / steps), cy = Math.round(g.y + ry * i / steps);
      if ((cx !== px || cy !== py) && this.solid[cy * this.w + cx]) return false;
    }
    return true;
  };

  P.updateGuard = function (g, dt, busy) {
    if (g.moving) { g.updateMove(dt); }
    if (!busy && !g.moving && this.invuln <= 0 && !this.caught) {
      const p = this.player;
      if (this.guardSees(g, p.x, p.y) || (Math.abs(p.x - g.x) + Math.abs(p.y - g.y) <= 1)) {
        this.caught = true;
        this.onCaught(g);
        return;
      }
    }
    if (busy || g.moving || g.scripted) return;
    if (g.pauseT > 0) { g.pauseT -= dt; return; }
    const path = g.def.path;
    if (path.length < 2) { if (g.def.turn) { g.turnT = (g.turnT || 0) + dt; if (g.turnT > g.def.turn) { g.turnT = 0; g.dir = { up: 'right', right: 'down', down: 'left', left: 'up' }[g.dir]; } } return; }
    const [tx, ty] = path[g.wp];
    if (g.x === tx && g.y === ty) {
      g.wp = (g.wp + 1) % path.length;
      g.pauseT = g.def.pause == null ? 1.2 : g.def.pause;
      // look toward next waypoint while pausing
      const [nx, ny] = path[g.wp];
      g.dir = nx > g.x ? 'right' : nx < g.x ? 'left' : ny > g.y ? 'down' : 'up';
      return;
    }
    const sx = Math.sign(tx - g.x), sy = sx ? 0 : Math.sign(ty - g.y);
    const nx = g.x + sx, ny = g.y + sy;
    g.dir = sx > 0 ? 'right' : sx < 0 ? 'left' : sy > 0 ? 'down' : 'up';
    if (this.player.x === nx && this.player.y === ny) return;
    if (this.solid[ny * this.w + nx]) { g.wp = (g.wp + 1) % path.length; return; }
    g.startMove(nx, ny);
  };

  P.onCaught = function (g) {
    const def = this.def;
    G.Script.run(async (S) => {
      g.emote = { k: '!', t: 0, life: 1.2 };
      G.Audio.sfx('encounter');
      await S.wait(0.8);
      if (def.onCaught) await def.onCaught(S, g);
      else {
        if (g.def.troop) {
          const r = await S.battle(g.def.troop, { mode: 'ambush' });
          if (r === 'lose') return;
        } else await S.say(g.def.name || '守衛', '什麼人！站住！');
        if (def.checkpoint) await S.warp(def.id, def.checkpoint[0], def.checkpoint[1], def.checkpoint[2] || 'up');
      }
      const m = G.mapScene;
      if (m) { m.caught = false; m.invuln = 1.5; }
    });
  };

  // --------------------------------------------------------------- pushables
  P.tryPush = function (nx, ny, dx, dy) {
    const o = this.objects.find((ob) => ob.push && this.objActive(ob) && ob.x === nx && ob.y === ny);
    if (!o) return false;
    const tx = nx + dx, ty = ny + dy;
    if (this.blocked(tx, ty, null) || this.enemies.some((e) => e.x === tx && e.y === ty)) { G.Audio.sfx('buzz'); return false; }
    if (this.followers.some((f) => f.x === tx && f.y === ty)) return false;
    o.x = tx; o.y = ty;
    o.key = o.t + '@' + o.x + ',' + o.y;
    G.Audio.sfx('push');
    this.computeSolid();
    if (this.def.onPush) G.Script.run((S) => this.def.onPush(S, o));
    return true;
  };

  // --------------------------------------------------------------- winds
  P.windActive = function (w) {
    const per = w.period || 3, dur = w.dur == null ? 1.2 : w.dur;
    return ((this.windT + (w.phase || 0)) % per) < dur;
  };
  P.updateMech = function (dt, busy) {
    this.windT += dt;
    const winds = this.def.winds;
    if (!winds || busy) return;
    const p = this.player;
    this.windPushT -= dt;
    for (const w of winds) {
      if (w.if && !w.if(G.state)) continue;
      if (!this.windActive(w)) continue;
      if (p.x >= w.x && p.x < w.x + (w.w || 1) && p.y >= w.y && p.y < w.y + (w.h || 1) && !p.moving && this.windPushT <= 0) {
        const [dx, dy] = U.dirs[w.dir];
        const nx = p.x + dx, ny = p.y + dy;
        if (!this.blocked(nx, ny, p)) {
          this.shiftFollowers(p.x, p.y);
          p.startMove(nx, ny);
          this.windPushT = 0.05;
          if (Math.random() < 0.3) G.Audio.sfx('wind');
        }
      }
    }
  };

  // --------------------------------------------------------------- drawing (floor layer)
  P.drawMechFloor = function (ctx, t) {
    // wind zones
    for (const w of this.def.winds || []) {
      if (w.if && !w.if(G.state)) continue;
      const on = this.windActive(w);
      const per = w.period || 3;
      const phase = (this.windT + (w.phase || 0)) % per;
      const warn = !on && phase > per - 0.6;
      const x = w.x * T, y = w.y * T, ww = (w.w || 1) * T, hh = (w.h || 1) * T;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip();
      ctx.strokeStyle = on ? 'rgba(220,240,255,0.55)' : warn ? 'rgba(220,240,255,0.25)' : 'rgba(220,240,255,0.08)';
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      const [dx, dy] = U.dirs[w.dir];
      const n = Math.ceil((ww * hh) / 2600);
      for (let i = 0; i < n; i++) {
        const fx = x + U.hash(i, 1, w.x) * ww, fy = y + U.hash(i, 2, w.y) * hh;
        const off = ((t * (on ? 420 : 60)) + i * 37) % (Math.max(ww, hh) + 80) - 40;
        const sx = dx ? x + (dx > 0 ? off : ww - off) : fx;
        const sy = dy ? y + (dy > 0 ? off : hh - off) : fy;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - dx * 40, sy - dy * 40); ctx.stroke();
      }
      ctx.restore();
    }
    // guard vision cones
    for (const g of this.npcs) {
      if (!g.guard || !g.visible) continue;
      const view = g.def.view || 4;
      const [dx, dy] = U.dirs[g.dir];
      ctx.save();
      ctx.fillStyle = this.caught ? 'rgba(255,60,40,0.28)' : 'rgba(255,210,90,0.16)';
      for (let f = 1; f <= view; f++) {
        const half = Math.floor((f + 1) / 2);
        for (let s = -half; s <= half; s++) {
          const cx = g.x + dx * f + (dy !== 0 ? s : 0), cy = g.y + dy * f + (dx !== 0 ? s : 0);
          if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) continue;
          if (!this.guardSeesCell(g, cx, cy)) continue;
          ctx.fillRect(cx * T + 2, cy * T + 2, T - 4, T - 4);
        }
      }
      ctx.restore();
    }
  };
  P.guardSeesCell = function (g, cx, cy) {
    const rx = cx - g.x, ry = cy - g.y;
    const steps = Math.max(Math.abs(rx), Math.abs(ry)) * 2;
    for (let i = 1; i <= steps; i++) {
      const sx = Math.round(g.x + rx * i / steps), sy = Math.round(g.y + ry * i / steps);
      if (this.solid[sy * this.w + sx]) return false;
    }
    return true;
  };
})();
