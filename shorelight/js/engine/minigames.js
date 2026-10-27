// Minigames, usable from scripts:  const r = await G.Mini.timing({...})
//   timing   — press Z when the marker is inside the zone (rounds). → hits
//   mash     — mash Z to fill a meter before the timer / rivals.  → true/false
//   song     — 山歌 call-and-response: memorise & repeat a direction-note phrase. → rounds won
//   jiaobei  — 擲筊 divination blocks (optionally scripted results). → ['sheng'|'xiao'|'yin', ...]
'use strict';
G.Mini = (() => {
  const U = G.U;
  const M = {};
  const push = (scene) => new Promise((res) => {
    G.Dialog.close();
    if ((G.Debug && G.Debug.autoplay)) {
      // test autoplay: resolve with a successful result immediately
      const o = scene.o || {};
      const v = scene instanceof Timing ? o.rounds : scene instanceof Mash ? true : scene instanceof Song ? o.rounds
        : scene instanceof Jiaobei ? (o.results || Array(o.throws || 1).fill('sheng')).slice(0, o.throws || 1) : true;
      G.Debug.log && G.Debug.log.push('minigame ' + (scene.constructor && scene.constructor.name) + ' -> ' + JSON.stringify(v));
      setTimeout(() => res(v), 30);
      return;
    }
    scene.res = res; G.Scenes.push(scene);
  });
  const finish = (scene, v) => { G.Scenes.pop(scene); scene.res(v); };

  function frame(ctx, title, sub) {
    ctx.fillStyle = 'rgba(4,6,14,0.7)';
    ctx.fillRect(0, 0, G.W, G.H);
    G.UI.panel(ctx, 240, 120, 800, 470, { title });
    if (sub) G.Render.text(ctx, sub, G.W / 2, 160, { size: 20, align: 'center', color: '#c9b893' });
  }

  // ------------------------------------------------------------------ timing bar
  class Timing {
    constructor(o) {
      this.o = Object.assign({ title: '時機', rounds: 3, need: 2, speed: 1.2, zone: 0.16, hint: '在燈火進入金色區域時按下 Z' }, o);
      this.round = 0; this.hits = 0; this.t = 0; this.pos = 0; this.dir = 1; this.flash = 0; this.res = null; this.result = null;
      this.newRound();
    }
    newRound() {
      this.zoneAt = U.rand(0.25, 0.75);
      this.zw = this.o.zone * (1 - this.round * 0.12);
      this.spd = this.o.speed * (1 + this.round * 0.25);
      this.locked = 0;
    }
    update(dt) {
      this.t += dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.done) { this.doneT += dt; if (this.doneT > 1.4 || (this.doneT > 0.4 && G.Input.pressed('ok'))) finish(this, this.hits); return; }
      if (this.locked > 0) { this.locked -= dt; if (this.locked <= 0) { if (this.round >= this.o.rounds) { this.done = true; this.doneT = 0; } else this.newRound(); } return; }
      this.pos += this.dir * this.spd * dt;
      if (this.pos > 1) { this.pos = 1; this.dir = -1; }
      if (this.pos < 0) { this.pos = 0; this.dir = 1; }
      if (G.Input.pressed('ok')) {
        const hit = Math.abs(this.pos - this.zoneAt) < this.zw / 2;
        this.round++;
        if (hit) { this.hits++; G.Audio.sfx('metal'); this.result = '漂亮！'; } else { G.Audio.sfx('buzz'); this.result = '可惜……'; }
        this.flash = 0.5; this.locked = 0.7;
      }
    }
    draw(ctx) {
      frame(ctx, this.o.title, this.o.hint);
      const x = 320, y = 330, w = 640, h = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 17); ctx.fill();
      const zx = x + (this.zoneAt - this.zw / 2) * w;
      const g = ctx.createLinearGradient(zx, 0, zx + this.zw * w, 0);
      g.addColorStop(0, 'rgba(255,200,90,0.3)'); g.addColorStop(0.5, 'rgba(255,220,120,0.9)'); g.addColorStop(1, 'rgba(255,200,90,0.3)');
      ctx.fillStyle = g; ctx.fillRect(zx, y + 3, this.zw * w, h - 6);
      G.UI.lanternIcon(ctx, x + this.pos * w, y + h / 2, 16, this.t);
      for (let i = 0; i < this.o.rounds; i++) {
        const done = i < this.round;
        ctx.fillStyle = done ? (i < this.hits ? '#ffd97a' : '#6a5a4a') : 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(G.W / 2 - (this.o.rounds - 1) * 24 + i * 48, 430, 12, 0, Math.PI * 2); ctx.fill();
      }
      if (this.flash > 0 && this.result) G.Render.text(ctx, this.result, G.W / 2, 250, { size: 40, align: 'center', color: '#fff0d0', alpha: Math.min(1, this.flash * 3) });
      if (this.done) G.Render.text(ctx, `成功 ${this.hits} / ${this.o.rounds}`, G.W / 2, 490, { size: 30, align: 'center', color: '#ffd97a' });
    }
  }
  M.timing = (o) => push(new Timing(o));

  // ------------------------------------------------------------------ mash race
  class Mash {
    constructor(o) {
      this.o = Object.assign({ title: '奮力向上', time: 8, need: 40, rivals: [{ name: '對手', rate: 4.2 }], hint: '連按 Z 往上爬！', label: '孤棚' }, o);
      this.t = 0; this.v = 0; this.rv = this.o.rivals.map(() => 0); this.started = false; this.cd = 1.5;
    }
    update(dt) {
      if (this.done) { this.doneT += dt; if (this.doneT > 1.6) finish(this, this.win); return; }
      if (this.cd > 0) { this.cd -= dt; G.Input.pressed('ok'); return; }
      this.t += dt;
      if (G.Input.pressed('ok')) { this.v += 1; if (this.v % 4 === 0) G.Audio.sfx('step'); }
      this.v = Math.max(0, this.v - dt * 0.8); // grease: you slide back a little
      this.o.rivals.forEach((r, i) => { this.rv[i] += r.rate * dt * U.rand(0.7, 1.3); });
      const top = Math.max(...this.rv);
      if (this.v >= this.o.need) { this.done = true; this.win = true; this.doneT = 0; G.Audio.sfx('levelup'); }
      else if (top >= this.o.need || this.t >= this.o.time) { this.done = true; this.win = false; this.doneT = 0; G.Audio.sfx('buzz'); }
    }
    draw(ctx) {
      frame(ctx, this.o.title, this.o.hint);
      const lanes = [{ name: '我方', v: this.v, c: '#ffd97a' }, ...this.o.rivals.map((r, i) => ({ name: r.name, v: this.rv[i], c: '#c8a0ff' }))];
      const lw = 90, gap = (640 - lanes.length * lw) / (lanes.length + 1);
      lanes.forEach((l, i) => {
        const x = 320 + gap + i * (lw + gap), y0 = 540, h = 330;
        ctx.fillStyle = 'rgba(90,60,30,0.8)'; ctx.fillRect(x + lw / 2 - 6, y0 - h, 12, h);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for (let k = 0; k < 10; k++) ctx.fillRect(x + lw / 2 - 6, y0 - h + k * 33, 12, 3);
        const p = U.clamp(l.v / this.o.need, 0, 1);
        G.UI.lanternIcon(ctx, x + lw / 2, y0 - p * h, 13, G.time + i);
        G.Render.text(ctx, l.name, x + lw / 2, y0 + 10, { size: 19, align: 'center', color: l.c });
      });
      // flag on top
      ctx.fillStyle = '#d8382a'; ctx.beginPath(); ctx.moveTo(G.W / 2, 196); ctx.lineTo(G.W / 2 + 40, 206); ctx.lineTo(G.W / 2, 216); ctx.fill();
      if (this.cd > 0) G.Render.text(ctx, String(Math.ceil(this.cd)), G.W / 2, 330, { size: 64, align: 'center', color: '#fff0d0' });
      else G.Render.text(ctx, Math.max(0, this.o.time - this.t).toFixed(1) + ' 秒', 980, 170, { size: 22, align: 'right', color: '#ffd97a' });
      if (this.done) G.Render.text(ctx, this.win ? '奪得順風旗！' : '慢了一步……', G.W / 2, 330, { size: 44, align: 'center', color: this.win ? '#ffd97a' : '#c8b8b0' });
    }
  }
  M.mash = (o) => push(new Mash(o));

  // ------------------------------------------------------------------ 山歌 call & response
  const NOTE_OF = { up: 'a4', right: 'g4', down: 'd4', left: 'e4' };
  const ARROW = { up: '↑', right: '→', down: '↓', left: '←' };
  class Song {
    constructor(o) {
      this.o = Object.assign({ title: '山歌對唱', rounds: 3, startLen: 3, hint: '聽對方唱一句，再用方向鍵唱回去', opponent: '對手' }, o);
      this.round = 0; this.won = 0; this.t = 0;
      this.next();
    }
    next() {
      this.phrase = [];
      const len = this.o.startLen + this.round;
      for (let i = 0; i < len; i++) this.phrase.push(U.pick(['up', 'right', 'down', 'left']));
      this.phase = 'listen'; this.pi = -1; this.pt = 0.8; this.input = [];
    }
    play(dir) {
      const m = G.Audio.noteToMidi(NOTE_OF[dir]);
      if (G.Audio.ctx) G.Audio.playNote('dizi', G.Audio.ctx.currentTime + 0.01, m, 0.35, 0.5, 0.4);
    }
    update(dt) {
      this.t += dt;
      if (this.phase === 'end') { this.pt -= dt; if (this.pt <= 0) finish(this, this.won); return; }
      if (this.phase === 'listen') {
        this.pt -= dt;
        if (this.pt <= 0) {
          this.pi++;
          if (this.pi >= this.phrase.length) { this.phase = 'answer'; this.pi = -1; return; }
          this.play(this.phrase[this.pi]);
          this.pt = 0.55;
        }
        return;
      }
      if (this.phase === 'feedback') {
        this.pt -= dt;
        if (this.pt <= 0) {
          this.round++;
          if (this.round >= this.o.rounds) { this.phase = 'end'; this.pt = 1.6; } else this.next();
        }
        return;
      }
      for (const d of ['up', 'right', 'down', 'left']) {
        if (G.Input.pressed(d)) {
          this.play(d);
          this.input.push(d);
          const i = this.input.length - 1;
          if (this.input[i] !== this.phrase[i]) { this.ok = false; this.phase = 'feedback'; this.pt = 1.2; G.Audio.sfx('buzz'); return; }
          if (this.input.length === this.phrase.length) { this.ok = true; this.won++; this.phase = 'feedback'; this.pt = 1.2; G.Audio.sfx('item'); return; }
        }
      }
    }
    draw(ctx) {
      frame(ctx, this.o.title, this.o.hint);
      const label = this.phase === 'listen' ? `${this.o.opponent} 唱：` : this.phase === 'answer' ? '換你唱：' : '';
      G.Render.text(ctx, label, 330, 220, { size: 26, color: '#fff0d0' });
      const n = this.phrase.length;
      for (let i = 0; i < n; i++) {
        const x = G.W / 2 - (n - 1) * 46 + i * 92, y = 320;
        const lit = this.phase === 'listen' ? i === this.pi : i < this.input.length;
        ctx.fillStyle = lit ? 'rgba(255,220,140,0.9)' : 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
        const show = this.phase === 'listen' ? i <= this.pi : i < this.input.length;
        if (show) G.Render.text(ctx, ARROW[this.phase === 'listen' ? this.phrase[i] : this.input[i]], x, y - 22, { size: 36, align: 'center', color: '#2a1a0a', shadow: false });
      }
      if (this.phase === 'feedback') G.Render.text(ctx, this.ok ? '唱得好！' : '走音了……', G.W / 2, 410, { size: 36, align: 'center', color: this.ok ? '#ffd97a' : '#c8b8b0' });
      G.Render.text(ctx, `第 ${Math.min(this.round + 1, this.o.rounds)} / ${this.o.rounds} 句　得分 ${this.won}`, G.W / 2, 520, { size: 22, align: 'center', color: '#c9b893' });
      if (this.phase === 'end') G.Render.text(ctx, `對唱結束：${this.won} / ${this.o.rounds}`, G.W / 2, 440, { size: 34, align: 'center', color: '#ffd97a' });
    }
  }
  M.song = (o) => push(new Song(o));

  // ------------------------------------------------------------------ 擲筊
  const JB_NAMES = { sheng: '聖筊', xiao: '笑筊', yin: '陰筊' };
  M.JB_NAMES = JB_NAMES;
  class Jiaobei {
    constructor(o) {
      this.o = Object.assign({ title: '擲筊', throws: 1, results: null, prompt: '誠心默禱，按 Z 擲筊' }, o);
      this.n = 0; this.out = []; this.state = 'ready'; this.t = 0;
    }
    roll() {
      if (this.o.results && this.o.results[this.n]) return this.o.results[this.n];
      const a = Math.random() < 0.5, b = Math.random() < 0.5;
      return a !== b ? 'sheng' : a ? 'xiao' : 'yin';
    }
    update(dt) {
      this.t += dt;
      if (this.state === 'ready') {
        if (G.Input.pressed('ok')) { this.state = 'air'; this.t = 0; this.cur = this.roll(); G.Audio.sfx('wind'); }
      } else if (this.state === 'air') {
        if (this.t > 1.0) { this.state = 'landed'; this.t = 0; G.Audio.sfx('wood'); G.Audio.sfx('push'); this.out.push(this.cur); this.n++; }
      } else if (this.state === 'landed') {
        if (this.t > 1.2 && (G.Input.pressed('ok') || this.t > 3)) {
          if (this.n >= this.o.throws || (this.o.stopOnFail && this.cur !== 'sheng')) finish(this, this.out);
          else { this.state = 'ready'; this.t = 0; }
        }
      }
    }
    drawBlock(ctx, x, y, rot, flat) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = flat ? '#d84a2a' : '#a8281a';
      ctx.strokeStyle = '#4a1008'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(0, flat ? -14 : -44, 50, 0); ctx.quadraticCurveTo(0, flat ? 14 : 8, -50, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (!flat) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-8, -18, 24, 6, -0.1, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    draw(ctx) {
      frame(ctx, this.o.title, this.o.prompt);
      const cx = G.W / 2;
      if (this.state === 'air') {
        const k = this.t / 1.0;
        const h = Math.sin(k * Math.PI) * 180;
        this.drawBlock(ctx, cx - 70, 440 - h, k * 14, (Math.floor(k * 8) % 2) === 0);
        this.drawBlock(ctx, cx + 70, 440 - h * 0.9, -k * 12, (Math.floor(k * 7) % 2) === 1);
      } else if (this.state === 'landed') {
        const c = this.cur;
        const fa = c === 'sheng' ? true : c === 'xiao';
        const fb = c === 'sheng' ? false : c === 'xiao';
        this.drawBlock(ctx, cx - 70, 440, -0.1, fa);
        this.drawBlock(ctx, cx + 70, 444, 0.15, fb);
        const col = c === 'sheng' ? '#ffd97a' : '#c8b8b0';
        G.Render.text(ctx, JB_NAMES[c], cx, 250, { size: 52, align: 'center', color: col, glow: c === 'sheng' ? 'rgba(255,190,80,0.8)' : null, glowBlur: 20 });
      } else {
        this.drawBlock(ctx, cx - 70, 440, 0.2, true);
        this.drawBlock(ctx, cx + 70, 440, -0.2, false);
      }
      if (this.o.throws > 1) {
        for (let i = 0; i < this.o.throws; i++) {
          const r = this.out[i];
          G.Render.text(ctx, r ? JB_NAMES[r] : '○', cx - (this.o.throws - 1) * 70 + i * 140, 520, { size: 22, align: 'center', color: r === 'sheng' ? '#ffd97a' : '#9c947f' });
        }
      }
    }
  }
  M.jiaobei = (o) => push(new Jiaobei(o));

  return M;
})();
