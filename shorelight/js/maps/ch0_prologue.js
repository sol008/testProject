// 《彼岸燈》 序章　夢 — chapter 0 (tutorial prologue). Screenplay: docs/story/ch0_prologue.md
//
// Map:     dream (夢境・燈橋, 21×46) — a lantern bridge over the black sea; three cloud platforms.
// Flow:    G.Story.ch0 (new game) → opening narration → title card → camera pan girl → 星河 → 0-2 wake
//          → 0-3 souls (talk) → 0-4 L1 + battle dream_1 → 0-5 broken bridge, L2 / L3 (+ dream_2) → bridge
//          → 0-6 mist rises (t_c0_dream_3, charge/guard tutorial) → 0-7 the girl → 0-8 fall → G.Story.next(S, 1)
// Flags:   ch0_start ch0_awake ch0_lamp1 ch0_lamp2 ch0_lamp3 ch0_bridge ch0_battle1 ch0_battle3 ch0_girl ch0_done
//          lyric_1 · souls: ch0_soul_a..d, ch0_soulc_follow · tutorials: tut_move tut_talk tut_battle tut_target
//          tut_guard_skill tut_guard_hint
// Data:    skills c0_gather / c0_e_mist_surge · enemy c0_sea_wisp_big · troop t_c0_dream_3 (+ existing dream_1, dream_2)
// Dream rules: no saving, no menu ("……夢裡好像打不開行囊。"), no Game Over (a wipe-out heals and retries).
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE;
  const auto = () => !!(G.Debug && G.Debug.autoplay);
  const dur = (sec) => (auto() ? Math.min(sec, 0.04) : sec);   // cinematic timings collapse in test autoplay
  const MS = () => G.mapScene;
  const SOUL_C = '#bfefff';
  const W = '漂流的燈';

  // =================================================================================================== data
  // The dream battles use the existing troops dream_1 / dream_2 (sea_wisp, js/data/enemies.js), forced
  // no-flee. 0-6 adds the optional 「大海霧魂」 (screenplay §5): it telegraphs 霧湧 so the guard tutorial has
  // something to guard against. Its exp completes 星河's first level-up (Lv2 by the end of the prologue).
  G.Data.skills.c0_gather = { name: '聚霧', desc: '大海霧魂正在聚集霧氣……', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'wind' };
  G.Data.skills.c0_e_mist_surge = { name: '霧湧', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.3, fx: 'water_big', sfx: 'water' };
  G.Data.enemies.c0_sea_wisp_big = {
    name: '大海霧魂', art: 'sea_wisp', variant: 1, scale: 1.25, lv: 2, hp: 90, mp: 10, atk: 8, def: 6, mag: 8, spd: 10, luk: 3,
    elem: 'water', weak: ['fire'], exp: 46, gold: 8, drops: [], skills: [{ id: 'e_ghost_touch', w: 6 }],
    desc: '霧越濃，它們想起的事就越多——大多是冷，和想家。',
  };
  G.Data.troops.t_c0_dream_3 = { enemies: ['c0_sea_wisp_big', 'sea_wisp', 'sea_wisp'], bg: 'dream', bgm: 'battle', flee: false };
  // the screenplay forbids fleeing in the dream: battle with a no-flee copy of a data troop
  const noFlee = (id) => Object.assign({}, G.Data.troops[id], { flee: false });

  // =================================================================================================== sound
  // The synth has no wave / chime samples: build them from noise and the shared instruments.
  const DUHUN = 'a4:4 c5:2 d5:2 e5:6 g5:2 | e5:4 d5:2 c5:2 d5:8 | a4:4 c5:2 d5:2 e5:4 g5:2 a5:2 | g5:4 e5:2 d5:2 e5:8 |' +
    ' a5:6 g5:2 e5:4 d5:4 | c5:2 d5:2 e5:2 g5:2 d5:8 | c5:4 d5:2 c5:2 a4:4 g4:2 c5:2 | a4:12 -:4';
  const DUHUN_CH = [['a3', 'c4', 'e4'], ['g3', 'b3', 'd4'], ['a3', 'c4', 'e4'], ['e3', 'g3', 'b3'],
    ['f3', 'a3', 'c4'], ['g3', 'b3', 'd4'], ['d3', 'f3', 'a3'], ['a3', 'c4', 'e4']];
  const Snd = {
    nb: null, lull: null,
    ac() { const a = G.Audio && G.Audio.ctx; return a && a.state === 'running' && G.Audio.musicBus() ? a : null; },
    // one swell of surf: lowpassed noise rising and falling
    wave(vol = 0.4, len = 5) {
      const ac = this.ac();
      if (!ac) return;
      if (!this.nb) {
        this.nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = this.nb.getChannelData(0);
        let b = 0;
        for (let i = 0; i < d.length; i++) { b = b * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = b * 2.2; }
      }
      const t = ac.currentTime + 0.02;
      const src = ac.createBufferSource(); src.buffer = this.nb; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(240, t);
      lp.frequency.linearRampToValueAtTime(1100, t + len * 0.45);
      lp.frequency.linearRampToValueAtTime(260, t + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * 0.5, t + len * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      src.connect(lp); lp.connect(g); g.connect(G.Audio.musicBus());
      const rv = ac.createGain(); rv.gain.value = 0.25; g.connect(rv); rv.connect(G.Audio.reverbInput());
      src.start(t, Math.random() * 1.5); src.stop(t + len + 0.1);
    },
    // ascending chime note i (0,1,2…)
    chime(i = 0, vol = 0.6) {
      const ac = this.ac();
      if (!ac) return;
      const notes = [76, 79, 84, 88, 91];
      G.Audio.playNote('bell', ac.currentTime + 0.02, notes[i % notes.length], 2.2, vol, 0.7);
    },
    // 白芷's 渡魂謠 on a lone dizi over a soft drone; returns its length in seconds
    lullaby(bpm = 80) {
      const ac = this.ac();
      if (!ac || !G.Music.parse) return 0;
      this.stopLullaby(0.1);
      const p = G.Music.parse(DUHUN);
      const step = 60 / bpm / 4, t0 = ac.currentTime + 0.2;
      const dry = ac.createGain(), wet = ac.createGain();
      dry.connect(G.Audio.musicBus()); wet.connect(G.Audio.reverbInput());
      this.lull = [dry, wet];
      const midi = (n) => G.Audio.noteToMidi(n);
      for (const e of p.ev) for (const m of e.m) G.Audio.playNote('dizi', t0 + e.s * step, m, e.l * step * 0.96, 0.55 * (e.a || 1), 0.8, dry, wet);
      DUHUN_CH.forEach((c, i) => { for (const n of c) G.Audio.playNote('pad', t0 + i * 16 * step, midi(n), 16 * step, 0.16, 0.8, dry, wet); });
      return p.len * step;
    },
    stopLullaby(fade = 2) {
      const ac = this.ac();
      if (!ac || !this.lull) return;
      for (const g of this.lull) { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setTargetAtTime(0.0001, ac.currentTime, fade / 3); }
      const l = this.lull;
      this.lull = null;
      setTimeout(() => { for (const g of l) { try { g.disconnect(); } catch (e) { /* already gone */ } } }, (fade + 1) * 1000);
    },
    // temporarily lower (k < 1) / restore (k = 1) the music bus
    duck(k, sec = 0.8) {
      const ac = this.ac();
      if (!ac) return;
      const p = G.Audio.musicBus().gain;
      p.cancelScheduledValues(ac.currentTime);
      p.setTargetAtTime(G.settings.music * k, ac.currentTime, Math.max(0.02, sec / 3));
    },
  };

  // =================================================================================================== tutorials
  const TUT = {
    tut_move: { title: '操作說明', pages: [[
      '{y}移動{/}：方向鍵 或 W A S D。',
      '{y}奔跑{/}：按住 Shift。（可在設定中改為預設奔跑）',
    ]] },
    tut_talk: { title: '操作說明', pages: [[
      '{y}對話／調查{/}：面向人物或物件，按 Enter、空白鍵 或 Z。',
      '{y}取消／返回{/}：Esc 或 X。',
      '{y}選單{/}：C、M 或 Tab。（夢中暫時無法開啟）',
    ]] },
    tut_battle: { title: '戰鬥說明', pages: [[
      '畫面上方的「行動順序」顯示誰先出手；速度越快，輪到得越頻繁。',
      '輪到你時選擇行動：{y}攻擊{/}（武器）、{y}仙術{/}（消耗真氣 MP）、{y}道具{/}、{y}防禦{/}、{y}逃跑{/}。',
    ], [
      '打倒所有敵人就勝利。全員倒下就……醒不過來了。',
      '先試試看「{y}攻擊{/}」吧！',
    ]] },
    tut_target: { title: '戰鬥說明', pages: [[
      '{y}上下鍵{/}選擇目標。先集中打倒一隻，可以減少受到的攻擊。',
    ]] },
    tut_guard_skill: { title: '戰鬥說明', pages: [[
      '{y}仙術{/}：星河會使用「螢火斬」——帶火屬性的劍招，消耗真氣（MP）。',
      '{y}防禦{/}：本回合受到的傷害減半。敵人蓄力時（頭上出現「！」）不妨防禦一次。',
    ]] },
    tut_guard_hint: { title: '提示', pages: [[
      '大海霧魂頭上出現了「{r}！{/}」——它正在蓄力。',
      '這一回合，試試選擇「{y}防禦{/}」吧。',
    ]] },
  };

  class TutorialScene {
    constructor(def, res) {
      this.def = def; this.res = res; this.page = 0; this.t = 0; this.a = 0; this.closing = false;
      G.Audio.sfx('item');
    }
    update(dt) {
      this.t += dt;
      if (this.closing) {
        this.a -= dt * 5;
        if (this.a <= 0) { G.Scenes.pop(this); G.Input.clear(); this.res(); }
        return;
      }
      this.a = Math.min(1, this.a + dt * 5);
      if (auto()) { this.closing = true; return; }
      if (this.t > 0.45 && (G.Input.pressed('ok') || G.Input.clicked())) {
        G.Audio.sfx('ok');
        if (this.page < this.def.pages.length - 1) { this.page++; this.t = 0.15; } else this.closing = true;
      }
    }
    draw(ctx) {
      const a = Math.max(0, this.a);
      ctx.save();
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = '#02040c'; ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = a;
      const page = this.def.pages[this.page];
      const w = 880, x = (G.W - w) / 2;
      ctx.font = G.font(25);
      const paras = page.map((l) => G.Render.wrap(ctx, l, w - 130));
      const nl = paras.reduce((s, l) => s + l.length, 0);
      const h = 96 + nl * 40 + (paras.length - 1) * 14 + 52;
      const y = (G.H - h) / 2 - 30 + (1 - a) * 14;
      G.UI.panel(ctx, x, y, w, h);
      G.UI.lanternIcon(ctx, x + 44, y + 40, 9, G.time);
      G.Render.text(ctx, this.def.title, x + 66, y + 22, { size: 28, color: G.UI.GOLD_L, glow: 'rgba(255,190,110,0.5)', glowBlur: 10 });
      if (this.def.pages.length > 1) G.Render.text(ctx, `${this.page + 1}／${this.def.pages.length}`, x + w - 34, y + 28, { size: 18, align: 'right', color: '#c9b893' });
      ctx.fillStyle = 'rgba(217,181,106,0.45)'; ctx.fillRect(x + 36, y + 70, w - 72, 1);
      let ly = y + 92;
      ctx.font = G.font(25); ctx.textBaseline = 'top';
      for (const lines of paras) {
        ctx.fillStyle = '#ffcf7a';
        ctx.beginPath(); ctx.arc(x + 56, ly + 15, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = G.font(25); ctx.textBaseline = 'top';
        G.Render.drawLines(ctx, lines, x + 76, ly, 40, '#f3ead2');
        ly += lines.length * 40 + 14;
      }
      const blink = 0.55 + 0.45 * Math.sin(G.time * 4);
      ctx.globalAlpha = a * blink;
      G.UI.hints(ctx, [['Z', this.page < this.def.pages.length - 1 ? '下一頁' : '知道了']], x + w - 30, y + h - 40);
      ctx.restore();
    }
  }
  // show a tutorial once (flag = its id); resolves when closed
  function tutorial(id) {
    if (G.state.flags[id] || !TUT[id]) return Promise.resolve();
    G.state.flags[id] = true;
    G.Dialog.close();
    return new Promise((res) => G.Scenes.push(new TutorialScene(TUT[id], res)));
  }

  // =================================================================================================== cinematic overlay
  // Letterbox bars + floating subtitles (the girl's song). Pushed over the map during cutscenes; the map keeps
  // animating underneath through its bgUpdate (see onEnter). Removes itself if no script is running.
  class CineOverlay {
    constructor() { this.k = 0; this.target = 1; this.lyr = null; }
    update(dt) {
      this.k += (this.target - this.k) * Math.min(1, dt * 3.2);
      if (this.lyr) this.updateLyrics(dt);
      if ((this.target === 0 && this.k < 0.02) || !G.Script.busy()) {
        G.Scenes.pop(this);
        if (this.lyr) { const r = this.lyr.res; this.lyr = null; r(); }
        if (this.onGone) this.onGone();
      }
    }
    lyrics(lines, per) {
      return new Promise((res) => { this.lyr = { lines, per, i: 0, t: 0, shown: [0], out: -1, res }; });
    }
    updateLyrics(dt) {
      const L = this.lyr;
      L.t += dt;
      if (L.out >= 0) {
        L.out += dt;
        if (L.out > 1.6) { this.lyr = null; L.res(); }
        return;
      }
      const skip = auto() || G.Input.held('skip') || (L.t > 1.4 && (G.Input.pressed('ok') || G.Input.clicked()));
      if (L.t > L.per || skip) {
        if (L.i < L.lines.length - 1) { L.i++; L.t = 0; L.shown.push(0); } else if (L.t > L.per * 0.6 || skip) L.out = 0;
      }
      for (let j = 0; j < L.shown.length; j++) L.shown[j] = Math.min(1, L.shown[j] + dt / 1.4);
    }
    draw(ctx) {
      const h = Math.round(70 * this.k);
      if (h > 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, G.W, h); ctx.fillRect(0, G.H - h, G.W, h);
      }
      const L = this.lyr;
      if (L) {
        const fade = L.out >= 0 ? Math.max(0, 1 - L.out / 1.4) : 1;
        L.shown.forEach((k, j) => {
          const y = 128 + j * 52 + (1 - k) * 10;
          G.Render.text(ctx, L.lines[j], G.W / 2, y, { size: 32, align: 'center', color: '#e8f6ff', alpha: k * fade, glow: 'rgba(140,210,255,0.8)', glowBlur: 18 });
        });
      }
    }
  }
  let cine = null;
  function cineOn(instant) {
    if (cine && G.Scenes.has(cine)) { cine.target = 1; return; }
    cine = new CineOverlay();
    if (instant) cine.k = 1;
    G.Scenes.push(cine);
  }
  function cineOff() {
    const c = cine;
    cine = null;
    if (!c || !G.Scenes.has(c)) return Promise.resolve();
    if (auto()) { G.Scenes.pop(c); return Promise.resolve(); }
    c.target = 0;
    return new Promise((res) => { c.onGone = res; });
  }

  // =================================================================================================== effects state
  // Everything the dream draws on top of the engine (souls, apparitions, beacon…). Reset on every map entry.
  const SOULS = {
    a: { x: 7, y: 38, ex: 7, ew: 2, flag: 'ch0_soul_a' },   // 唐山阿伯
    b: { x: 5, y: 25, ex: 5, ew: 1, flag: 'ch0_soul_b' },   // 婦人
    c: { x: 15, y: 27, ex: 15, ew: 1, flag: 'ch0_soul_c' }, // 孩子
    d: { x: 13, y: 13, ex: 12, ew: 2, flag: 'ch0_soul_d' }, // 漁夫
  };
  let FX = null;
  function resetFx() {
    FX = {
      lying: false, girlShown: 0, girlOrb: 1, beacon: null, mistK: 1, waves: false, waveT: 0,
      souls: { a: { ox: 0, oy: 0, glow: 1, a: 1 }, b: { ox: 0, oy: 0, glow: 1, a: 1 }, c: { ox: 0, oy: 0, glow: 1, a: 1 }, d: { ox: 0, oy: 0, glow: 1, a: 1 } },
      follow: null, swarm: [], apps: [], bursts: [], ripples: [], planks: [], blue: 0, red: 0, flare: 0, finger: 0,
      fall: 0,
    };
  }
  resetFx();

  // the dying far-shore light: bright → dim → nearly out → struggles back (≈4 s period)
  function beaconLevel(t) {
    if (FX.beacon != null) return FX.beacon;
    const p = (t % 4) / 4;
    if (p < 0.3) return 1;
    if (p < 0.55) return 1 - (p - 0.3) / 0.25 * 0.7;
    if (p < 0.75) return 0.3 - (p - 0.55) / 0.2 * 0.25;
    const k = (p - 0.75) / 0.25;
    return 0.05 + k * 0.95 * (0.72 + 0.28 * Math.sin(t * 37));
  }
  const LH = { x: 16.6, y: 0.55 };          // far lighthouse lamp (tile coords)
  const GL = { x: 10.5, y: 2.05 };          // giant water-lantern head centre

  function soulPos(k) {
    const s = SOULS[k], st = FX.souls[k];
    return [(s.x + 0.5) * T + st.ox, (s.y + 0.5) * T + st.oy];
  }

  // pale blue lotus lamp of a drowned soul (drawn on the sea, below actors)
  function drawSoulLamp(ctx, x, y, t, seed, a = 1, sc = 1) {
    if (a <= 0.01) return;
    const bob = Math.sin(t * 1.7 + seed) * 2.5;
    ctx.save();
    ctx.translate(x, y + bob); ctx.scale(sc, sc);
    ctx.globalAlpha *= a;
    // reflection streaks
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      const w = (15 - k * 2.5) * (0.8 + 0.2 * Math.sin(t * 3 + k + seed));
      ctx.fillStyle = `rgba(140,215,255,${0.3 - k * 0.055})`;
      ctx.fillRect(-w + Math.sin(t * 2 + k) * 2, 12 + k * 4, w * 2, 1.6);
    }
    ctx.globalCompositeOperation = 'source-over';
    // lotus petals
    const petal = (ang, len, col) => {
      ctx.save(); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(0, 6); ctx.quadraticCurveTo(-7, -len * 0.4, 0, -len); ctx.quadraticCurveTo(7, -len * 0.4, 0, 6);
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(70,130,170,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
    };
    ctx.fillStyle = 'rgba(30,60,90,0.6)';
    ctx.beginPath(); ctx.ellipse(0, 8, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    for (const [ang, col] of [[-1.25, '#a9d9ee'], [1.25, '#a9d9ee'], [-0.7, '#cdeefa'], [0.7, '#cdeefa'], [0, '#e9f8ff']]) petal(ang, 17, col);
    // flame
    const f = 1 + 0.12 * Math.sin(t * 9 + seed) * Math.sin(t * 5.3);
    ctx.save(); ctx.translate(0, -6); ctx.scale(1, f);
    const fg = ctx.createLinearGradient(0, -16, 0, 2);
    fg.addColorStop(0, 'rgba(230,252,255,0.2)'); fg.addColorStop(0.5, '#e8fbff'); fg.addColorStop(1, '#7fdcff');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(6, -4, 0, 2); ctx.quadraticCurveTo(-6, -4, 0, -16); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  function glow(ctx, x, y, r, col, a) {
    if (a <= 0.01 || r <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(G.FX.glowSprite(col), x - r, y - r, r * 2, r * 2);
  }
  // distant lighthouse silhouette on the horizon
  function drawLighthouse(ctx, t) {
    const x = (LH.x + 0.5) * T, base = 1.45 * T, top = LH.y * T + 26;
    ctx.save();
    ctx.fillStyle = '#0c1020';
    ctx.beginPath();
    ctx.moveTo(x - 15, base); ctx.lineTo(x - 8, top + 12); ctx.lineTo(x + 8, top + 12); ctx.lineTo(x + 15, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#151a2e';
    ctx.fillRect(x - 3, top + 22, 3, 6); ctx.fillRect(x - 1, top + 44, 3, 6);
    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(x - 11, top + 8, 22, 5);
    const b = beaconLevel(t);
    ctx.fillStyle = `rgba(${Math.round(80 + 175 * b)},${Math.round(70 + 160 * b)},${Math.round(60 + 110 * b)},1)`;
    ctx.fillRect(x - 6, top - 4, 12, 12);
    ctx.fillStyle = '#0c1020';
    ctx.beginPath(); ctx.moveTo(x - 9, top - 4); ctx.lineTo(x, top - 13); ctx.lineTo(x + 9, top - 4); ctx.closePath(); ctx.fill();
    // rock it stands on
    ctx.beginPath(); ctx.ellipse(x, base, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawGiantLantern(ctx, t) {
    const d = G.Objects.get('water_lantern');
    if (!d) return;
    ctx.save();
    ctx.translate(GL.x * T, GL.y * T);
    ctx.scale(2.2, 2.2);
    d.draw(ctx, -32, -50, { t: 'water_lantern', x: 10, y: 1, key: 'giant', color: '#ece6d6', text: '彼岸' }, t);
    ctx.restore();
  }

  // ------------------------------------------------------------------ the lantern bridge deck
  // The lantern_bridge tile is a single plank strip; the dream bridge is three cells wide, so a continuous
  // deck (boards, side beams, rope rails, lantern posts every other row) is painted over each run of cells.
  function bridgeRuns(ms, y) {
    const runs = [];
    let x0 = -1;
    for (let x = 0; x <= ms.w; x++) {
      const on = x < ms.w && ms.terrain[y * ms.w + x] === 'lantern_bridge';
      if (on && x0 < 0) x0 = x;
      if (!on && x0 >= 0) { runs.push([x0, x - 1]); x0 = -1; }
    }
    return runs;
  }
  const BOARD = ['#5e4734', '#54402f', '#664d38', '#4b3829', '#5a4230'];
  function postSpots(ms, y, x0, x1) {
    if (y % 2) return [];
    return [[x0 * T + 1, y * T + 22], [(x1 + 1) * T - 1, y * T + 22]];
  }
  function drawDeck(ctx, ms, t) {
    const y0 = Math.max(0, Math.floor(ms.cam.y / T) - 1), y1 = Math.min(ms.h - 1, Math.floor((ms.cam.y + G.H) / T) + 1);
    for (let y = y0; y <= y1; y++) {
      for (const [x0, x1] of bridgeRuns(ms, y)) {
        const bx0 = x0 * T + 5, bx1 = (x1 + 1) * T - 5, w = bx1 - bx0;
        // shadow on the water
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(bx0 + 4, y * T + 6, w, T);
        for (let i = 0; i < 8; i++) {
          const h = U.hash(x0, y * 8 + i, 501);
          const by = y * T + i * 8;
          ctx.fillStyle = BOARD[(h * BOARD.length) | 0];
          ctx.fillRect(bx0 + (h - 0.5) * 5, by + 1, w + (U.hash(x1, y * 8 + i, 502) - 0.5) * 5, 6.4);
          ctx.fillStyle = 'rgba(255,220,170,0.09)';
          ctx.fillRect(bx0 + (h - 0.5) * 5, by + 1, w, 1.2);
          ctx.fillStyle = 'rgba(20,10,4,0.55)';
          ctx.fillRect(bx0, by + 7.2, w, 0.9);
          if (h > 0.8) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx0 + w * h * 0.8, by + 2, 10, 4); }
        }
        // side beams
        ctx.fillStyle = '#2b1d14';
        ctx.fillRect(bx0 - 5, y * T, 6, T); ctx.fillRect(bx1 - 1, y * T, 6, T);
        ctx.fillStyle = 'rgba(255,210,150,0.12)';
        ctx.fillRect(bx0 - 5, y * T, 1.5, T); ctx.fillRect(bx1 - 1, y * T, 1.5, T);
        // rope rails
        ctx.strokeStyle = 'rgba(205,175,125,0.55)'; ctx.lineWidth = 1.4;
        for (const rx of [bx0 - 2, bx1 + 2]) {
          ctx.beginPath(); ctx.moveTo(rx, y * T); ctx.quadraticCurveTo(rx + (rx < bx1 ? -3 : 3), y * T + T / 2, rx, y * T + T); ctx.stroke();
        }
        // posts with hanging paper lanterns
        for (const [px, py] of postSpots(ms, y, x0, x1)) {
          ctx.fillStyle = '#1e140e'; ctx.fillRect(px - 3, py - 26, 6, 30);
          ctx.fillStyle = '#4a3424'; ctx.fillRect(px - 3, py - 26, 2, 30);
          const side = px < bx0 + 10 ? -1 : 1;
          ctx.fillStyle = '#1e140e'; ctx.fillRect(px + (side < 0 ? -12 : 0), py - 26, 12, 3);
          const lx = px + side * 11, ly = py - 12 + Math.sin(t * 1.6 + y) * 1.5;
          ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, py - 24); ctx.lineTo(lx, ly - 8); ctx.stroke();
          const g = ctx.createRadialGradient(lx - 2, ly - 2, 1, lx, ly, 9);
          g.addColorStop(0, '#fff0c0'); g.addColorStop(0.5, '#ff9a48'); g.addColorStop(1, '#c0381e');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(lx, ly, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2a1a10'; ctx.fillRect(lx - 4, ly - 10, 8, 2); ctx.fillRect(lx - 4, ly + 8, 8, 2);
        }
      }
    }
  }
  function drawDeckGlow(ctx, ms, t) {
    const y0 = Math.max(0, Math.floor(ms.cam.y / T) - 1), y1 = Math.min(ms.h - 1, Math.floor((ms.cam.y + G.H) / T) + 1);
    for (let y = y0; y <= y1; y++) for (const [x0, x1] of bridgeRuns(ms, y)) for (const [px, py] of postSpots(ms, y, x0, x1)) {
      const side = px < x0 * T + 15 ? -1 : 1;
      const lx = px + side * 11, ly = py - 12 + Math.sin(t * 1.6 + y) * 1.5;
      const f = 0.8 + 0.2 * Math.sin(t * 8 + y * 3) * Math.sin(t * 5.1 + x0);
      glow(ctx, lx, ly, 26, '#ffa050', 0.75 * f);
      // reflection on the black water
      ctx.globalAlpha = 0.35 * f;
      ctx.fillStyle = '#ff9a4a';
      for (let k = 0; k < 4; k++) ctx.fillRect(lx + side * 14 - 8 + Math.sin(t * 2 + k + y) * 3, ly + 30 + k * 6, 16 - k * 3, 1.5);
    }
  }

  // ------------------------------------------------------------------ world layer below actors
  function drawGround(ctx, t, ms) {
    drawDeck(ctx, ms, t);
    drawLighthouse(ctx, t);
    drawGiantLantern(ctx, t);
    for (const k in SOULS) {
      if (k === 'c' && (G.state.flags.ch0_soulc_follow)) continue;
      const [x, y] = soulPos(k);
      drawSoulLamp(ctx, x, y, t, k.charCodeAt(0), FX.souls[k].a, 1);
    }
    for (const r of FX.ripples) {
      const k = r.t / 1.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k) * 0.7;
      ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 10 + 46 * k, 4 + 16 * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const p of FX.planks) {
      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y + (1 - p.k) * 18);
      const g = ctx.createLinearGradient(0, -8, 0, 8);
      g.addColorStop(0, '#8a6a48'); g.addColorStop(1, '#4a3424');
      ctx.fillStyle = g;
      for (let i = -1; i <= 1; i++) ctx.fillRect(-90 + i * 0, -7 + i * 16, 180, 12);
      ctx.restore();
    }
    if (FX.lying) {
      const p = ms.player;
      if (G.Sprites) G.Sprites.drawBattle(ctx, 'xinghe', 'ko', 0, p.px + 6, p.py + 4, { scale: 0.62 });
    }
  }
  // ------------------------------------------------------------------ world layer above actors (still lit)
  function drawOver(ctx, t) {
    for (const ap of FX.apps) {
      if (ap.a <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = ap.a;
      ctx.translate(ap.x * T + T / 2, ap.y * T + T - 6 + (1 - ap.rise) * 40 + Math.sin(t * 2.2 + ap.x) * 3);
      if (ap.flip) ctx.scale(-1, 1);
      ctx.scale(ap.sc, ap.sc);
      G.Monsters.draw(ctx, 'sea_wisp', 0, 0, t + ap.x, { state: 'idle', variant: ap.v || 0 });
      ctx.restore();
    }
  }
  // ------------------------------------------------------------------ emissive layer, drawn after the lighting pass
  function drawLightLayer(ctx, t, ms) {
    const [sx, sy] = [0, 0];
    const camX = Math.round((ms.cam.x + sx) * 2) / 2, camY = Math.round((ms.cam.y + sy) * 2) / 2;
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.globalCompositeOperation = 'lighter';
    drawDeckGlow(ctx, ms, t);
    // stars over the far horizon
    for (let i = 0; i < 26; i++) {
      const x = U.hash(i, 3, 91) * ms.w * T, y = U.hash(i, 5, 92) * 0.9 * T;
      glow(ctx, x, y, 3 + U.hash(i, 7, 93) * 3, '#dfe8ff', 0.35 + 0.35 * Math.sin(t * (1 + U.hash(i, 1, 94)) + i));
    }
    // far-shore beacon
    const b = beaconLevel(t);
    const lx = (LH.x + 0.5) * T, ly = LH.y * T + 28;
    glow(ctx, lx, ly, 18 + 70 * b, '#fff0c0', 0.25 + 0.75 * b);
    if (b > 0.5) {
      ctx.globalAlpha = (b - 0.5) * 0.5;
      const g = ctx.createLinearGradient(lx, ly, lx - 420, ly + 60);
      g.addColorStop(0, 'rgba(255,240,200,0.6)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(lx, ly - 3); ctx.lineTo(lx - 420, ly + 30); ctx.lineTo(lx - 420, ly + 90); ctx.lineTo(lx, ly + 3); ctx.fill();
    }
    // giant lantern head: cold white aura
    glow(ctx, GL.x * T, GL.y * T, 150, '#cfe6ff', 0.22 + 0.05 * Math.sin(t * 1.3));
    // souls' flames
    for (const k in SOULS) {
      if (k === 'c' && G.state.flags.ch0_soulc_follow) continue;
      const [x, y] = soulPos(k), st = FX.souls[k];
      glow(ctx, x, y - 8 + Math.sin(t * 1.7 + k.charCodeAt(0)) * 2.5, 30 * st.glow, '#9fe6ff', 0.55 * st.a * (0.85 + 0.15 * Math.sin(t * 7 + x)));
    }
    if (FX.follow && FX.follow.a > 0) {
      const f = FX.follow;
      drawSoulLampFloating(ctx, f.x, f.y, t, f.a);
    }
    for (const s of FX.swarm) {
      const k = Math.min(1, s.t / s.dur);
      const e = U.ease.inOutQuad(k);
      const x = U.lerp(s.x0, s.x1, e) + Math.sin(s.t * 3 + s.ph) * 6, y = U.lerp(s.y0, s.y1, e) + Math.cos(s.t * 2 + s.ph) * 4;
      const a = Math.min(1, s.t * 2) * (s.t > s.dur ? Math.max(0, 1 - (s.t - s.dur) / s.fade) : 1);
      glow(ctx, x, y, 12, s.c, a * 0.9);
      glow(ctx, x, y, 4, '#ffffff', a);
    }
    // the girl: before she is revealed only a faint point of white light
    const girl = ms.actor('girl');
    if (girl) {
      const gx = girl.px, gy = girl.py - 44;
      glow(ctx, gx, gy, 26 + 6 * Math.sin(t * 2), '#eef8ff', 0.8 * FX.girlOrb);
      glow(ctx, gx, gy, 90, '#cfe8ff', 0.25 * Math.max(FX.girlOrb, FX.girlShown));
    }
    // blue soul-fire on the decorative lamps (0-6)
    if (FX.blue > 0.01) {
      for (const [x, y] of [[8, 16], [12, 16]]) {
        const fx = x * T + 32, fy = y * T - 70 + Math.sin(t * 9 + x) * 2;
        glow(ctx, fx, fy, 46, '#5ab8ff', FX.blue * 0.9);
        glow(ctx, fx, fy, 16, '#e0f6ff', FX.blue);
      }
    }
    // lamp flare (bridge forming)
    if (FX.flare > 0.01) for (const [x, y] of [[12, 36], [8, 33], [12, 33]]) glow(ctx, x * T + 32, y * T - 70, 120, '#ffb35c', FX.flare * 0.8);
    // fingertip spark
    if (FX.finger > 0.01) {
      const p = ms.player;
      const [dx, dy] = U.dirs[p.dir];
      glow(ctx, p.px + dx * 26, p.py - 46 + dy * 10, 22, '#ff9a4a', FX.finger);
      glow(ctx, p.px + dx * 26, p.py - 46 + dy * 10, 6, '#fff2d0', FX.finger);
    }
    // red string resonance: 星河's wrist ↔ the girl's hair cord
    if (FX.red > 0.01 && girl) {
      const p = ms.player;
      const wx = p.px + 12, wy = p.py - 40, hx = girl.px - 4, hy = girl.py - 74;
      glow(ctx, wx, wy, 24, '#ff3a3a', FX.red);
      glow(ctx, hx, hy, 24, '#ff3a3a', FX.red);
      ctx.globalAlpha = FX.red * 0.75;
      ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 1.6; ctx.shadowColor = '#ff3a3a'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(wx, wy);
      ctx.bezierCurveTo(wx + 40, wy + 30 + Math.sin(t * 3) * 8, hx - 40, hy + 40, hx, hy);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // apparitions' cold glow
    for (const ap of FX.apps) glow(ctx, ap.x * T + T / 2, ap.y * T + 10 + (1 - ap.rise) * 40, 60 * ap.sc * 1.6, '#8fc8e8', ap.a * 0.3);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const b2 of FX.bursts) b2.draw(ctx);
    ctx.restore();
  }
  function drawSoulLampFloating(ctx, x, y, t, a) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    drawSoulLamp(ctx, x, y, t, 99, a, 0.7);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - 6, 26, '#9fe6ff', 0.6 * a);
    ctx.restore();
  }

  // ------------------------------------------------------------------ lights
  let bridgeLights = [];
  function computeBridgeLights(ms) {
    bridgeLights = [];
    for (let y = 0; y < ms.h; y++) for (const [x0, x1] of bridgeRuns(ms, y)) for (const [px, py] of postSpots(ms, y, x0, x1)) {
      const side = px < x0 * T + 15 ? -1 : 1;
      bridgeLights.push({ x: (px + side * 11) / T - 0.5, y: (py - 12) / T - 0.5, r: 120, color: '#ffa050', flicker: 0.3 });
    }
  }
  function dreamLights() {
    const ms = MS();
    const t = ms ? ms.t : 0;
    const out = bridgeLights.slice();
    for (const k in SOULS) {
      if (k === 'c' && G.state.flags.ch0_soulc_follow) continue;
      const [x, y] = soulPos(k);
      out.push({ x: x / T - 0.5, y: y / T - 0.5, r: 120 * FX.souls[k].glow * FX.souls[k].a, color: '#9fe6ff', flicker: 0.2 });
    }
    if (FX.follow && FX.follow.a > 0) out.push({ x: FX.follow.x / T - 0.5, y: FX.follow.y / T - 0.5, r: 100 * FX.follow.a, color: '#9fe6ff', flicker: 0.2 });
    out.push({ x: GL.x - 0.5, y: GL.y - 0.3, r: 280, color: '#dcecff', flicker: 0.08 });
    out.push({ x: LH.x, y: LH.y, r: 30 + 160 * beaconLevel(t), color: '#fff0c0', flicker: 0 });
    if (FX.blue > 0.01) for (const x of [8, 12]) out.push({ x, y: 15, r: 150 * FX.blue, color: '#4aa8ff', flicker: 0.4 });
    if (FX.flare > 0.01) for (const [x, y] of [[12, 35], [8, 32], [12, 32]]) out.push({ x, y, r: 260 * FX.flare, color: '#ffb35c', flicker: 0.2 });
    for (const ap of FX.apps) if (ap.a > 0.05) out.push({ x: ap.x, y: ap.y - 0.4, r: 110 * ap.a, color: '#a8d8f0', flicker: 0.2 });
    for (const s of FX.swarm) {
      const k = U.ease.inOutQuad(Math.min(1, s.t / s.dur));
      out.push({ x: U.lerp(s.x0, s.x1, k) / T - 0.5, y: U.lerp(s.y0, s.y1, k) / T - 0.5, r: 60, color: s.c, flicker: 0.2 });
    }
    if (FX.red > 0.05 && ms) out.push({ x: ms.player.x, y: ms.player.y - 0.4, r: 120 * FX.red, color: '#ff4a3a', flicker: 0.1 });
    return out;
  }

  // ------------------------------------------------------------------ per-frame logic
  function updateFx(dt, ms, busy) {
    for (const s of FX.swarm) s.t += dt;
    FX.swarm = FX.swarm.filter((s) => s.t < s.dur + s.fade);
    for (const r of FX.ripples) r.t += dt;
    FX.ripples = FX.ripples.filter((r) => r.t < 1.4);
    FX.bursts = FX.bursts.filter((b) => b.update(dt));
    // ambient surf (0-7 onwards)
    if (FX.waves) {
      FX.waveT -= dt;
      if (FX.waveT <= 0) { FX.waveT = U.rand(3.2, 4.6); Snd.wave(U.rand(0.35, 0.55), U.rand(4.5, 6)); }
    }
    // mist thickens toward the north
    const mist = ms.particles && ms.particles.groups.find((g) => g.name === 'mist');
    if (mist) mist.opts.alpha = (0.07 + 0.16 * (1 - ms.player.y / ms.h)) * FX.mistK;
    // the child's soul trailing behind 星河
    const f = FX.follow;
    if (f) {
      if (f.flee) {
        f.x += 160 * dt; f.y -= 60 * dt; f.a = Math.max(0, f.a - dt * 0.8);
        if (f.a <= 0) FX.follow = null;
      } else {
        const p = ms.player;
        const [dx, dy] = U.dirs[p.dir];
        const tx = p.px - dx * 58 + 26, ty = p.py - 50 - dy * 40;
        const k = Math.min(1, dt * 2.2);
        f.x += (tx - f.x) * k; f.y += (ty - f.y) * k + Math.sin(ms.t * 2) * 0.3;
      }
    }
    if (!busy && !ms.player.moving) {
      // no menu in the dream
      const m = G.Input.pressed('menu'), c = G.Input.pressed('cancel');
      if (m || c) { G.Audio.sfx('buzz'); G.UI.toast('……夢裡好像打不開行囊。'); }
      // first time next to something interactive → 對話／調查 tutorial
      if (G.state.flags.tut_move && !G.state.flags.tut_talk && nearInteractive(ms.player)) G.Script.run(() => tutorial('tut_talk'));
    }
  }
  function nearInteractive(p) {
    const rects = Object.values(SOULS).map((s) => [s.ex, s.y, s.ew, 1]).concat([[12, 36, 1, 1]]);
    return rects.some(([x, y, w, h]) => {
      const dx = p.x < x ? x - p.x : p.x >= x + w ? p.x - (x + w - 1) : 0;
      const dy = p.y < y ? y - p.y : p.y >= y + h ? p.y - (y + h - 1) : 0;
      return dx + dy <= 1;
    });
  }

  // =================================================================================================== helpers
  const lerpTo = (obj, props, sec, ease = 'outQuad') => G.Tweens.to(obj, props, dur(sec), ease);
  const wait = (S, sec) => S.wait(dur(sec));
  function obj(key) { return MS().objects.find((o) => o.key === key); }
  // smooth camera move to a tile (clamped to the map so the motion has no dead time)
  function camTo(x, y, sec, ease = 'inOutQuad') {
    const m = MS();
    const [tx, ty] = m.clampCam(x * T + T / 2 - G.W / 2, y * T + T / 2 - G.H / 2);
    if (m.cam.tx == null) { m.cam.tx = m.cam.x; m.cam.ty = m.cam.y; }
    m.cam.speed = 14;
    return G.Tweens.to(m.cam, { tx, ty }, dur(sec), ease);
  }
  function camSnap(x, y) {
    const m = MS();
    const [tx, ty] = m.clampCam(x * T + T / 2 - G.W / 2, y * T + T / 2 - G.H / 2);
    m.cam.tx = tx; m.cam.ty = ty; m.cam.x = tx; m.cam.y = ty;
  }
  async function camBack(S, sec = 0.9) {
    const p = MS().player;
    await camTo(p.x, p.y - 0.4, sec);
    S.cameraFollow();
  }
  // under-sea soul lights drifting toward a point (tile coords)
  function swarm(tx, ty, n = 14, o = {}) {
    for (let i = 0; i < n; i++) {
      const ang = U.rand(0, Math.PI * 2), rad = U.rand(o.rMin || 3, o.rMax || 6) * T;
      FX.swarm.push({
        x0: (tx + 0.5) * T + Math.cos(ang) * rad, y0: (ty + 0.5) * T + Math.sin(ang) * rad * 0.7,
        x1: (tx + 0.5) * T + U.rand(-1, 1) * (o.spread || 1.2) * T, y1: (ty + 0.5) * T + U.rand(-0.6, 0.6) * (o.spread || 1.2) * T,
        t: -U.rand(0, o.stagger || 0.6), dur: dur(o.dur || 1.8), fade: dur(o.fade || 1.4), ph: U.rand(0, 7),
        c: U.pick(['#9fe6ff', '#c8f2ff', '#8fd0ff', '#d8c8ff']),
      });
    }
  }
  function sparks(x, y, color = ['#ffd080', '#ff9a4a', '#fff0c0']) {
    if (!G.FX.Burst) return;
    FX.bursts.push(new G.FX.Burst({ x, y, n: 26, color, speed: 170, speedMin: 30, gravity: -60, life: 1.1, r: 5 }));
  }
  // light a lamp post (key) with the 燈籠舖 apprentice's mysterious fingertip fire
  async function ignite(S, key) {
    const o = obj(key);
    FX.finger = 0;
    await lerpTo(FX, { finger: 1 }, 0.35);
    S.sfx('fire');
    S.flash('#ffb35c', 0.3, 0.5);
    if (o) { o.lit = true; sparks(o.x * T + 32, o.y * T - 76); }
    lerpTo(FX, { finger: 0 }, 0.5);
    await wait(S, 0.5);
  }
  function rise(app, sec = 1.2) {
    FX.apps.push(app);
    app.a = 0; app.rise = 0;
    return lerpTo(app, { a: 0.92, rise: 1 }, sec, 'outCubic');
  }
  async function vanishApps(sec = 0.8) {
    const list = FX.apps.slice();
    await Promise.all(list.map((a) => lerpTo(a, { a: 0, rise: 0.6 }, sec)));
    FX.apps = FX.apps.filter((a) => !list.includes(a));
  }
  function setRow(ms, y, x0, x1, id) {
    for (let x = x0; x <= x1; x++) ms.terrain[y * ms.w + x] = id;
  }
  const say = (S, who, text) => S.say(who, text);
  const soulSay = (S, text) => S.say(W, text, { color: SOUL_C });

  // ------------------------------------------------------------------ battles (the dream never ends in Game Over)
  function setupBattle(b, o) {
    // 大海霧魂: on its 2nd turn it always gathers mist (「！」), releasing 霧湧 on all next turn
    if (b.enemies.some((e) => e.id === 'c0_sea_wisp_big')) {
      const ai = b.aiCommand.bind(b);
      b.aiCommand = (e) => {
        if (e.id !== 'c0_sea_wisp_big') return ai(e);
        if (e.c0charge) { e.c0charge = false; return { kind: 'skill', skill: 'c0_e_mist_surge', targets: b.alive('party') }; }
        if (e.turns === 2 || (e.turns > 3 && Math.random() < 0.4)) {
          e.c0charge = true;
          if (!G.state.flags.tut_guard_hint) b.c0hint = true;
          return { kind: 'skill', skill: 'c0_gather', targets: [e] };
        }
        return ai(e);
      };
      const pc = b.playerCommand.bind(b);
      b.playerCommand = async (u) => {
        if (b.c0hint) { b.c0hint = false; await tutorial('tut_guard_hint'); }
        return pc(u);
      };
      b.fx.push({
        update: () => !b.result,
        draw: (ctx) => {
          for (const e of b.enemies) {
            if (!e.c0charge || e.dead) continue;
            const h = b.unitH(e), x = e.x + e.ox, y = e.y + e.oy;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 10; i++) {
              const a = b.t * 2.5 + i * 0.63, r = 70 + 14 * Math.sin(b.t * 3 + i);
              ctx.globalAlpha = 0.45;
              ctx.drawImage(G.FX.glowSprite('#9fd8f0'), x + Math.cos(a) * r - 18, y - h * 0.45 + Math.sin(a) * r * 0.5 - 18, 36, 36);
            }
            ctx.restore();
            G.Render.text(ctx, '！', x, y - h - 30 + Math.sin(b.t * 8) * 5, { size: 52, bold: true, align: 'center', color: '#ff5a4a', stroke: '#2a0808', strokeW: 6 });
          }
        },
      });
    }
    if (o.tut) return tutorial(o.tut);
    return null;
  }
  async function dreamBattle(S, troop, o = {}) {
    for (;;) {
      const p = MS().player;
      const pos = [p.x, p.y, p.dir];
      const r = await S.battle(noFlee(troop), { loseOk: true, intro: (b) => setupBattle(b, o) });
      if (r === 'win') return;
      // wiped out: 「……還不能在這裡倒下。」— full recovery, back to where the fight began, fight again
      await S.fadeOut(dur(0.6));
      G.Party.healAll();
      S.setPos('player', pos[0], pos[1], pos[2]);
      MS().snapCamera();
      await wait(S, 0.4);
      await S.fadeIn(dur(0.6));
      await say(S, 'xinghe:hurt', '……還不能在這裡倒下。');
    }
  }

  // =================================================================================================== the map
  const ROWS = [
    '~~~~~~~~~~~~~~~~~~~~~', // 0  sky / far horizon (drawGround + light layer)
    '~~~~~~~~~~~~~~~~~~~~~', // 1  giant water-lantern head (drawn)
    '~~~~~~~~~~~~~~~~~~~~~', // 2
    '~~~~~~~~~jjj~~~~~~~~~', // 3
    '~~~~~~ooooooooo~~~~~~', // 4  north platform (the girl at 10,4)
    '~~~~~~ooooooooo~~~~~~', // 5
    '~~~~~~ooooooooo~~~~~~', // 6
    '~~~~~~ooooooooo~~~~~~', // 7
    '~~~~~~ooooooooo~~~~~~', // 8
    '~~~~~~ooooooooo~~~~~~', // 9
    '~~~~~~~~~jjj~~~~~~~~~', // 10 0-7 trigger
    '~~~~~~~~~jjj~~~~~~~~~', // 11
    '~~~~~~~~~jjj~~~~~~~~~', // 12
    '~~~~~~~~~jjj~~~~~~~~~', // 13 soul D (13,13)
    '~~~~~~~~~jjj~~~~~~~~~', // 14
    '~~~~~~~~~jjj~~~~~~~~~', // 15
    '~~~~~~~~~jjj~~~~~~~~~', // 16 lamps (8,16) (12,16); 0-6 trigger
    '~~~~~~~~~jjj~~~~~~~~~', // 17
    '~~~~~~~~~jjj~~~~~~~~~', // 18
    '~~~~~~~~~jjj~~~~~~~~~', // 19
    '~~~~~~~~~jjj~~~~~~~~~', // 20
    '~~~~~~~~~jjj~~~~~~~~~', // 21
    '~~~~~~~~~jjj~~~~~~~~~', // 22
    '~~~~~~~~~jjj~~~~~~~~~', // 23
    '~~~~~~ooooooooo~~~~~~', // 24 middle platform
    '~~~~~~ooooooooo~~~~~~', // 25 soul B (5,25)
    '~~~~~~ooooooooo~~~~~~', // 26
    '~~~~~~ooooooooo~~~~~~', // 27 soul C (15,27)
    '~~~~~~ooooooooo~~~~~~', // 28
    '~~~~~~~~~jjj~~~~~~~~~', // 29
    '~~~~~~~~~jjj~~~~~~~~~', // 30 broken bridge (black sea until ch0_bridge)
    '~~~~~~~~~jjj~~~~~~~~~', // 31
    '~~~~~~~~~jjj~~~~~~~~~', // 32
    '~~~~~~~~~jjj~~~~~~~~~', // 33 L2 (8,33)  L3 (12,33)
    '~~~~~~~~~jjj~~~~~~~~~', // 34
    '~~~~~~~~~jjj~~~~~~~~~', // 35
    '~~~~~~~~~jjj~~~~~~~~~', // 36 L1 (12,36)
    '~~~~~~~~~jjj~~~~~~~~~', // 37
    '~~~~~~~~~jjj~~~~~~~~~', // 38 soul A (7,38)
    '~~~~~~~~~jjj~~~~~~~~~', // 39
    '~~~~~~ooooooooo~~~~~~', // 40 start platform
    '~~~~~~ooooooooo~~~~~~', // 41
    '~~~~~~ooooooooo~~~~~~', // 42 start (10,42)
    '~~~~~~ooooooooo~~~~~~', // 43
    '~~~~~~ooooooooo~~~~~~', // 44
    '~~~~~~~~~~~~~~~~~~~~~', // 45
  ];
  const SEA_ROW = '~~~~~~~~~~~~~~~~~~~~~';

  // little warm 水燈 drifting north on the black water (decoration)
  const DRIFT = [[2, 43], [17, 41], [3, 34], [16, 31], [1, 27], [18, 22], [3, 19], [16, 12], [2, 11], [18, 6], [4, 2], [14, 44], [6, 30], [19, 35]];

  G.Maps.define('dream', {
    name: '夢境・燈橋',
    bgm: 'dream',
    start: [10, 42],
    noSave: true,
    autosave: false,
    bg: '#04060c',
    light: { ambient: 0.82, color: '#03050f', playerR: 230, playerColor: '#ffd9a0' },
    particles: ['motes', { type: 'mist', alpha: 0.12, color: '#a8bede', density: 1.2 }, { type: 'lanterns', density: 0.45 }],
    legend: { '~': 'black_sea', j: 'lantern_bridge', o: 'cloud' },
    tiles: (st) => ROWS.map((r, y) => (y >= 30 && y <= 32 && !st.flags.ch0_bridge ? SEA_ROW : r)),
    objects: (st) => [
      { key: 'L1', t: 'lamp_post', x: 12, y: 36, lit: !!st.flags.ch0_lamp1, text: '燈' },
      { key: 'L2', t: 'lamp_post', x: 8, y: 33, lit: !!st.flags.ch0_lamp2, text: '燈' },
      { key: 'L3', t: 'lamp_post', x: 12, y: 33, lit: !!st.flags.ch0_lamp3, text: '燈' },
      { key: 'LW', t: 'lamp_post', x: 8, y: 16, lit: true, text: '燈' },
      { key: 'LE', t: 'lamp_post', x: 12, y: 16, lit: true, text: '燈' },
    ].concat(DRIFT.map(([x, y], i) => ({ t: 'water_lantern', x, y, text: i % 3 === 0 ? '平安' : i % 3 === 1 ? '回家' : '引路' }))),
    npcs: [
      { id: 'girl', sprite: 'baizhi', x: 10, y: 4, dir: 'up', fixedDir: true, light: { r: 90, color: '#dff6ff' } },
    ],
    lights: () => dreamLights(),
    drawGround: (ctx, t, ms) => drawGround(ctx, t, ms),
    drawOver: (ctx, t) => drawOver(ctx, t),
    onUpdate: (dt, ms, busy) => updateFx(dt, ms, busy),
    onEnter: (S) => {
      const ms = MS();
      resetFx();
      computeBridgeLights(ms);
      // keep the dream alive (sea, mist, souls) while dialogue / overlays are open during cutscenes
      ms.bgUpdate = function (dt) {
        if (!G.Script.busy()) return;
        const st = G.Scenes.stack;
        for (let i = st.indexOf(this) + 1; i < st.length; i++) if (st[i].opaque) return;
        this.update(dt);
      };
      // emissive glow layer after the lighting pass
      const hud = ms.drawHud;
      ms.drawHud = function (ctx, t) { drawLightLayer(ctx, t, this); hud.call(this, ctx, t); };
      const girl = ms.actor('girl');
      if (girl) { girl.alpha = 0; girl.light = { r: 70, color: '#dff6ff' }; }
      if (S.has('ch0_soulc_follow') && !S.has('ch0_battle3')) { const p = ms.player; FX.follow = { x: p.px, y: p.py - 50, a: 1 }; }
      if (S.has('ch0_battle3')) G.state.flags.ch0_soulc_follow = false;
    },
    events: [
      // 0-2 fallback (debug loads of the map); the new-game script runs the same scene itself
      { id: 'wake', trigger: 'auto', once: true, if: (st) => !st.flags.ch0_awake && !st.flags.ch0_lamp1, run: async (S) => { FX.lying = true; S.show('player', false); await wakeUp(S); } },
      // 0-3 drifting souls
      { id: 'soul_a', trigger: 'action', x: 7, y: 38, w: 2, h: 1, label: '對話', run: (S) => talkSoul(S, 'a') },
      { id: 'soul_b', trigger: 'action', x: 5, y: 25, w: 1, h: 1, label: '對話', run: (S) => talkSoul(S, 'b') },
      { id: 'soul_c', trigger: 'action', x: 15, y: 27, w: 1, h: 1, label: '對話', if: (st) => !st.flags.ch0_soulc_follow, run: (S) => talkSoul(S, 'c') },
      { id: 'soul_d', trigger: 'action', x: 12, y: 13, w: 2, h: 1, label: '對話', run: (S) => talkSoul(S, 'd') },
      // 0-4 / 0-5 lamp posts
      { id: 'lamp1', trigger: 'action', x: 12, y: 36, label: '調查', run: (S) => lamp1(S) },
      { id: 'lamp2', trigger: 'action', x: 8, y: 33, label: '調查', run: (S) => lamp2(S) },
      { id: 'lamp3', trigger: 'action', x: 12, y: 33, label: '調查', run: (S) => lamp3(S) },
      { id: 'lamp_w', trigger: 'action', x: 8, y: 16, label: '調查', run: (S) => decoLamp(S) },
      { id: 'lamp_e', trigger: 'action', x: 12, y: 16, label: '調查', run: (S) => decoLamp(S) },
      // the unlit L1 nags at the lantern-maker until it is lit (keeps the tutorial order)
      { id: 'gate_l1', trigger: 'touch', x: 9, y: 34, w: 3, h: 1, if: (st) => !st.flags.ch0_lamp1, run: async (S) => {
        S.face('player', 'down');
        await say(S, 'xinghe:think', '……剛剛那根燈柱還沒點。沒點的燈，看了就渾身不對勁。');
        await S.move('player', 'D');
      } },
      // 0-5 the broken bridge
      { id: 'bridge_end', trigger: 'touch', x: 9, y: 33, w: 3, h: 1, once: true, if: (st) => !!st.flags.ch0_lamp1 && !st.flags.ch0_bridge, run: (S) => brokenBridge(S) },
      // 0-6 the mist rises
      { id: 'mist_rise', trigger: 'touch', x: 9, y: 16, w: 3, h: 1, once: true, if: (st) => !!st.flags.ch0_bridge, run: (S) => mistRises(S) },
      // 0-7 / 0-8 the girl in white
      { id: 'girl', trigger: 'touch', x: 9, y: 10, w: 3, h: 1, once: true, if: (st) => !!st.flags.ch0_battle3, run: (S) => theGirl(S) },
    ],
  });

  // =================================================================================================== 0-2 wake
  async function wakeUp(S) {
    cineOn();
    S.face('player', 'up');
    await wait(S, 0.6);
    S.emote('player', '…', 2);
    await wait(S, 1.4);
    await say(S, 'xinghe:think', '……嗯？');
    await say(S, 'xinghe:surprise', '這、這裡是哪裡？我不是在舖子裡睡覺嗎？');
    FX.lying = false;
    S.show('player', true);
    S.face('player', 'down');
    await S.jump('player', 16);
    S.sfx('step');
    await wait(S, 0.4);
    S.face('player', 'left'); await wait(S, 0.55);
    S.face('player', 'right'); await wait(S, 0.55);
    S.face('player', 'up'); await wait(S, 0.4);
    await say(S, 'xinghe:normal', '橋……底下是海？黑成這樣的海……');
    await say(S, 'xinghe:smile', '好，冷靜。沈星河，你可是九份第一的燈籠舖學徒。');
    await say(S, 'xinghe:smile', '阿炳伯講的劍仙，遇到這種事會怎樣？——往前走！');
    S.flag('ch0_awake');
    await cineOff();
    MS().banner = 0.001;
    await tutorial('tut_move');
    S.objective('沿著燈橋往前走');
  }

  // =================================================================================================== 0-3 souls
  async function talkSoul(S, k) {
    const s = SOULS[k];
    const first = !S.has(s.flag);
    S.flag(s.flag);
    const st = FX.souls[k];
    lerpTo(st, { glow: 1.5 }, 0.4);
    if (k === 'a') {
      if (first) {
        await soulSay(S, '唐山……唐山在哪一邊？');
        await soulSay(S, '我答應過阿娘，賺了錢就回去的。');
        await soulSay(S, '六死三留一回頭……少年仔，你講，我是哪一個？');
        await say(S, 'xinghe:think', '……阿伯，我不知道。');
        await soulSay(S, '不知道好，不知道好……知道了，就回不去了。');
      } else await soulSay(S, '海水好鹹……鹹到心肝底去了。');
    } else if (k === 'b') {
      if (first) {
        await soulSay(S, '孩子，你怎麼一個人在橋上？');
        await soulSay(S, '……咦？你身上，怎麼沒有燈？');
        await say(S, 'xinghe:surprise', '燈？什麼燈？');
        await soulSay(S, '每個人都有一盞的。就像我這樣，小小的，暖暖的……');
        await soulSay(S, '你的……在哪裡呢？');
        // she drifts a little way off, then comes back
        await lerpTo(st, { ox: -0.9 * T, oy: -0.3 * T }, 1.2, 'inOutQuad');
        await lerpTo(st, { ox: 0, oy: 0 }, 1.2, 'inOutQuad');
      } else await soulSay(S, '快回去吧。這裡不是活人來的地方。');
    } else if (k === 'c') {
      if (first) {
        await soulSay(S, '大哥哥，前面好暗喔。');
        await soulSay(S, '以前一直往前漂，就會看到光。阿嬤說，那叫做『彼岸』。');
        await soulSay(S, '可是現在……燈好像累了。');
        await say(S, 'xinghe:sad', '……別怕，哥哥去前面看看。');
      } else {
        await soulSay(S, '大哥哥，你身上暖暖的。我可以跟著你一下嗎？');
        if (!S.has('ch0_battle3')) {
          const [x, y] = soulPos('c');
          FX.follow = { x, y, a: 1 };
          S.flag('ch0_soulc_follow');
          S.sfx('lantern');
        }
      }
    } else if (k === 'd') {
      if (first) {
        await soulSay(S, '浪越來越大了。');
        await soulSay(S, '我在海上討了一世人的生活，從來沒看過海這麼黑。');
        await soulSay(S, '從前一路有光，一路明。現在……前頭黑漆漆的。');
      } else await soulSay(S, '那個白衫的姑娘，在前頭站好久了。好像在等人，又好像……在跟誰告別。');
    }
    lerpTo(st, { glow: 1 }, 0.6);
  }

  // =================================================================================================== 0-4 the first lamp
  async function lamp1(S) {
    if (S.has('ch0_lamp1')) { await say(S, '', '燭火暖暖地燒著。橋板上映著一圈橘紅色的光。'); return; }
    await say(S, '', '一根燈柱。燈籠裡的燭芯是冷的。');
    await say(S, 'xinghe:think', '沒點的燈……看了就渾身不對勁。職業病。');
    const c = await S.choice(['點亮它', '不管它'], { cancel: 1 });
    if (c !== 0) { await say(S, 'xinghe:normal', '……還是很在意。'); return; }
    cineOn();
    S.face('player', 'right');
    await ignite(S, 'L1');
    await say(S, 'xinghe:surprise', '欸？我……我沒有火摺子啊？');
    // the souls under the sea drift closer and glow
    swarm(12, 36, 16, { rMin: 3, rMax: 7, dur: 2.2, fade: 2.4, spread: 2.2 });
    for (const k of ['a', 'b']) lerpTo(FX.souls[k], { glow: 1.6 }, 1.2);
    await wait(S, 1.6);
    await soulSay(S, '……好暖。');
    await soulSay(S, '好暖……');
    S.flag('ch0_lamp1');
    for (const k of ['a', 'b']) lerpTo(FX.souls[k], { glow: 1 }, 1.2);
    // mist surges over the bridge
    S.sfx('wind');
    S.shake(4, 0.3);
    lerpTo(FX, { mistK: 2.2 }, 0.8);
    await say(S, 'xinghe:surprise', '什麼東西！');
    camTo(10.5, 35, 0.8);
    S.sfx('ghost');
    await rise({ x: 10, y: 34, sc: 0.55, v: 0 }, 1.4);
    S.face('player', 'up');
    await say(S, '海霧魂', '……燈……給我……燈……');
    await cineOff();
    await dreamBattle(S, 'dream_1', { tut: 'tut_battle' });
    FX.apps = [];
    lerpTo(FX, { mistK: 1 }, 1.5);
    S.cameraFollow();
    G.Party.healAll();
    await say(S, 'xinghe:laugh', '哈……哈哈！我贏了？我贏了！阿炳伯，你看到沒有！');
    await say(S, 'xinghe:think', '……那東西一直說要燈。這裡的燈，到底是什麼？');
    S.flag('ch0_battle1');
    S.objective('沿著燈橋往前走');
  }

  // =================================================================================================== 0-5 the broken bridge
  async function brokenBridge(S) {
    cineOn();
    S.face('player', 'up');
    await camTo(10, 30, 1.2);
    await say(S, 'xinghe:surprise', '橋……斷了？');
    await say(S, 'xinghe:think', '兩邊還有兩根燈柱。剛剛那盞一點亮，海裡的燈就靠過來……');
    await say(S, 'xinghe:smile', '好，燈籠舖學徒的本事——全部點起來！');
    await camBack(S, 0.8);
    await cineOff();
    S.objective('點亮剩下的燈柱');
  }
  function litLine(S) { return say(S, '', '燭火靜靜地燒著，映得海面一片暖橘。'); }
  async function lamp2(S) {
    if (S.has('ch0_lamp2')) { await litLine(S); return; }
    S.face('player', 'left');
    await ignite(S, 'L2');
    S.flag('ch0_lamp2');
    await say(S, 'xinghe:normal', '第二盞。');
    // one glowing plank surfaces at the gap (just a promise — not walkable yet)
    if (!S.has('ch0_lamp3')) {
      const pl = { x: 10.5 * T, y: 32.5 * T, k: 0, a: 0 };
      FX.planks.push(pl);
      FX.ripples.push({ x: pl.x, y: pl.y, t: 0 });
      S.sfx('water');
      await lerpTo(pl, { k: 1, a: 0.55 }, 1.0);
    }
    await checkBridge(S);
  }
  async function lamp3(S) {
    if (S.has('ch0_lamp3')) { await litLine(S); return; }
    S.face('player', 'right');
    cineOn();
    // the mist boils up again as he reaches for the wick
    FX.finger = 0.6;
    S.sfx('wind');
    S.shake(3, 0.3);
    lerpTo(FX, { mistK: 2.2 }, 0.8);
    camTo(10.5, 32, 0.8);
    S.sfx('ghost');
    rise({ x: 9, y: 31, sc: 0.52, v: 0 }, 1.3);
    await rise({ x: 11.6, y: 31.4, sc: 0.52, v: 0, flip: true }, 1.3);
    FX.finger = 0;
    await say(S, '海霧魂', '……燈……是我們的……');
    await cineOff();
    await dreamBattle(S, 'dream_2', { tut: 'tut_target' });
    FX.apps = [];
    lerpTo(FX, { mistK: 1 }, 1.5);
    S.cameraFollow();
    S.face('player', 'right');
    await ignite(S, 'L3');
    S.flag('ch0_lamp3');
    await checkBridge(S);
  }
  // all three lit → the souls lift the planks out of the sea
  async function checkBridge(S) {
    if (!(S.has('ch0_lamp1') && S.has('ch0_lamp2') && S.has('ch0_lamp3')) || S.has('ch0_bridge')) return;
    const ms = MS();
    cineOn();
    await camTo(10, 31, 1.0);
    S.sfx('lantern');
    await lerpTo(FX, { flare: 1 }, 0.6);
    swarm(10, 31, 30, { rMin: 4, rMax: 9, dur: 2.0, fade: 3.5, spread: 1.6, stagger: 1.2 });
    await wait(S, 1.6);
    FX.planks = [];
    for (let i = 0; i < 3; i++) {
      const y = 32 - i;
      const pl = { x: 10.5 * T, y: (y + 0.5) * T, k: 0, a: 0 };
      FX.planks.push(pl);
      FX.ripples.push({ x: pl.x, y: pl.y, t: 0 });
      Snd.chime(i);
      await lerpTo(pl, { k: 1, a: 1 }, 0.55, 'outCubic');
      setRow(ms, y, 9, 11, 'lantern_bridge');
      FX.planks = FX.planks.filter((q) => q !== pl);
      ms.computeSolid();
      computeBridgeLights(ms);
      await wait(S, 0.2);
    }
    S.flag('ch0_bridge');
    lerpTo(FX, { flare: 0.25 }, 1.2);
    await soulSay(S, '……過去吧。');
    await soulSay(S, '過去吧……');
    await soulSay(S, '她在等你。');
    await say(S, 'xinghe:surprise', '……她？');
    lerpTo(FX, { flare: 0 }, 1.0);
    G.Party.healAll();
    S.toast('燈火的暖意流遍全身。', 'lantern');
    await camBack(S, 0.9);
    await cineOff();
    S.objective('往燈橋的盡頭走');
  }
  async function decoLamp(S) {
    if (FX.blue > 0.5) { await say(S, '', '燈籠裡的火變成了冰冷的藍色。'); return; }
    await say(S, '', '已經點亮的燈柱。是誰點的呢……');
  }

  // =================================================================================================== 0-6 the mist rises
  async function mistRises(S) {
    cineOn();
    // the two lit lamps turn to blue soul-fire; the music sinks
    for (const k of ['LW', 'LE']) { const o = obj(k); if (o) o.lit = false; }
    S.sfx('ghost');
    lerpTo(FX, { blue: 1, mistK: 2.4 }, 0.8);
    Snd.duck(0.35, 1.2);
    if (FX.follow) FX.follow.flee = true;   // the child's soul panics and drifts away
    S.flag('ch0_soulc_follow', false);
    S.face('player', 'up');
    await camTo(10, 14.5, 0.9);
    await say(S, 'xinghe:serious', '……又來了。這次比較多。');
    S.sfx('wind');
    S.shake(4, 0.4);
    rise({ x: 8, y: 15, sc: 0.52, v: 0 }, 1.3);
    rise({ x: 12, y: 15, sc: 0.52, v: 0, flip: true }, 1.3);
    await rise({ x: 10, y: 13.3, sc: 0.72, v: 1 }, 1.6);
    await say(S, '大海霧魂', '回去……活人……回去……');
    await say(S, 'xinghe:angry', '我也很想回去啊！可是前面有人在等——大概吧！');
    Snd.duck(1, 0.3);
    await cineOff();
    await dreamBattle(S, 't_c0_dream_3', { tut: 'tut_guard_skill' });
    await vanishApps(0.1);
    S.cameraFollow();
    await say(S, 'xinghe:hurt', '呼……呼……夢裡打架也會累，這太不公平了吧……');
    for (const k of ['LW', 'LE']) { const o = obj(k); if (o) o.lit = true; }
    await lerpTo(FX, { blue: 0, mistK: 1 }, 1.2);
    S.flag('ch0_battle3');
    S.objective('往燈橋的盡頭走');
  }

  // =================================================================================================== 0-7 the girl in white
  async function theGirl(S) {
    const ms = MS();
    const girl = ms.actor('girl');
    cineOn();
    S.objective(null);
    S.bgm(null, { fade: 3 });
    FX.waves = true; FX.waveT = 0.5;
    const p = ms.player;
    if (p.x !== 10) await S.walkTo('player', 10, p.y, { speed: 2.4 });
    S.face('player', 'up');
    // slow push in; the mist parts a little and she is there
    lerpTo(FX, { mistK: 0.55 }, 3.5);
    await camTo(10, 5.2, 3.2, 'inOutQuad');
    lerpTo(FX, { girlOrb: 0, girlShown: 1 }, 2.4);
    if (girl) { girl.light = { r: 220, color: '#dff6ff' }; await G.Tweens.to(girl, { alpha: 0.85 }, dur(2.4), 'linear'); }
    await wait(S, 0.8);
    // she hums 渡魂謠 — lone dizi, lyrics as floating subtitles
    const len = auto() ? 0 : Snd.lullaby(80);
    const per = len ? Math.min(6.4, len / 4.2) : 5.4;
    if (cine) await cine.lyrics(['燈一盞，渡一人，', '黑水茫茫莫回身；', '前塵如霧隨潮去，', '彼岸花開又一春。'], per);
    S.flag('lyric_1');
    await S.move('player', 'UUU', { speed: 1.6 });
    p.speed = 4.2;
    await say(S, 'xinghe:normal', '……喂。');
    await wait(S, 1.0);   // she does not turn around
    await say(S, 'xinghe:think', '那首歌……我好像在哪裡聽過。');
    await say(S, 'xinghe:normal', '妳是誰？這裡是哪裡？');
    await S.say('?', '你又來了。', { color: '#e6f4ff' });
    await say(S, 'xinghe:surprise', '又？我們……見過嗎？');
    await S.say('?', '每一次，你都走這座橋。', { color: '#e6f4ff' });
    await S.say('?', '每一次，橋都會斷。', { color: '#e6f4ff' });
    // the far light flickers, goes dark for a long time, then barely returns
    FX.beacon = beaconLevel(ms.t);
    await lerpTo(FX, { beacon: 1 }, 0.25);
    await lerpTo(FX, { beacon: 0.02 }, 0.5);
    await wait(S, 2.0);
    await lerpTo(FX, { beacon: 0.22 }, 1.4, 'linear');
    await say(S, 'xinghe:serious', '那邊那盞燈……快熄了。');
    await S.say('?', '嗯。', { color: '#e6f4ff' });
    await S.say('?', '所以，我要回去了。', { color: '#e6f4ff' });
    FX.beacon = null;
    await say(S, 'xinghe:angry', '回去？回去哪裡？等一下——');
    await S.move('player', 'U', { speed: 5 });
    p.speed = 4.2;
    // behind him the bridge sinks plank by plank into the black sea
    for (let y = 23; y >= 10; y--) {
      setRow(ms, y, 9, 11, 'black_sea');
      ms.computeSolid();
      FX.ripples.push({ x: 10.5 * T, y: (y + 0.5) * T, t: 0 });
      if (y % 3 === 0) S.sfx('splash');
      await wait(S, 0.15);
    }
    computeBridgeLights(ms);
    // he stops and looks down: the red cord on his wrist glows — and so does the one in her hair
    S.emote('player', '…', 1.4);
    await wait(S, 0.8);
    Snd.chime(4, 0.35);
    await lerpTo(FX, { red: 1 }, 0.5);
    await wait(S, 0.6);
    lerpTo(FX, { red: 0 }, 1.2);
    await wait(S, 0.5);
    if (girl) S.face('girl', 'left');   // she turns her face, just slightly
    await wait(S, 0.8);
    await S.say('?', '星河……這一次，別再來找我了。', { color: '#e6f4ff' });
    S.flag('ch0_girl');
    await wait(S, 1.0);
    await say(S, 'xinghe:surprise', '妳怎麼知道我的——');
    S.closeDialog();
    // the platform gives way
    if (girl) S.face('girl', 'up');
    S.shake(10, 1.2);
    S.sfx('earth'); S.sfx('shatter', 0.15);
    for (let y = 9; y >= 5; y--) {
      for (let x = 6; x <= 14; x++) if (!(y <= 5 && x >= 9 && x <= 11)) ms.terrain[y * ms.w + x] = 'black_sea';
      ms.computeSolid();
      for (let i = 0; i < 2; i++) FX.ripples.push({ x: U.rand(6.5, 14.5) * T, y: (y + 0.5) * T, t: 0 });
      await wait(S, 0.07);
    }
    S.sfx('splash');
    p.offsetY = 0;
    await Promise.all([
      G.Tweens.to(p, { offsetY: 70, alpha: 0 }, dur(0.7), 'inQuad'),
      S.flash('#ffffff', dur(0.8), 1),
    ]);
    await fallAndWake(S);
  }

  // =================================================================================================== 0-8 fall → wake
  class SinkScene {
    constructor() {
      this.opaque = true; this.t = 0; this.dark = 0;
      this.lamps = [];
      for (let i = 0; i < 70; i++) this.lamps.push(this.lamp(true));
      this.bub = [];
    }
    lamp(init) {
      return { x: U.rand(0, G.W), y: init ? U.rand(0, G.H + 200) : G.H + U.rand(20, 200), v: U.rand(20, 70), s: U.rand(0.35, 1.1), ph: U.rand(0, 7),
        c: Math.random() < 0.6 ? '#9fe6ff' : '#ffb060' };
    }
    bgUpdate(dt) { this.update(dt); }
    update(dt) {
      this.t += dt;
      for (const l of this.lamps) { l.y -= l.v * dt; l.ph += dt; if (l.y < -40) Object.assign(l, this.lamp(false)); }
      if (Math.random() < dt * 6) this.bub.push({ x: G.W / 2 + U.rand(-30, 30), y: this.bodyY() - 30, r: U.rand(2, 6), t: 0 });
      for (const b of this.bub) { b.t += dt; b.y -= (50 + b.r * 10) * dt; b.x += Math.sin(b.t * 4 + b.r) * 0.6; }
      this.bub = this.bub.filter((b) => b.t < 3);
    }
    bodyY() { return G.H * 0.22 + Math.min(1, this.t / 9) * G.H * 0.4; }
    draw(ctx) {
      const t = this.t;
      const g = ctx.createLinearGradient(0, 0, 0, G.H);
      g.addColorStop(0, '#0d2440'); g.addColorStop(0.45, '#071426'); g.addColorStop(1, '#020409');
      ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
      ctx.save();
      // god rays from the surface far above
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = G.W * (0.15 + i * 0.15) + Math.sin(t * 0.3 + i) * 40;
        const rg = ctx.createLinearGradient(x, 0, x + 140, G.H * 0.8);
        rg.addColorStop(0, 'rgba(120,180,230,0.13)'); rg.addColorStop(1, 'rgba(120,180,230,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 220, G.H * 0.8); ctx.lineTo(x + 60, G.H * 0.8); ctx.fill();
      }
      // countless little lamps rising past him
      for (const l of this.lamps) {
        const x = l.x + Math.sin(l.ph * 0.8) * 10;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(l.ph * 2);
        ctx.drawImage(G.FX.glowSprite(l.c), x - 22 * l.s, l.y - 22 * l.s, 44 * l.s, 44 * l.s);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(G.FX.glowSprite('#ffffff'), x - 4 * l.s, l.y - 4 * l.s, 8 * l.s, 8 * l.s);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // 星河 sinking, turning slowly
      const by = this.bodyY();
      ctx.save();
      ctx.translate(G.W / 2, by);
      ctx.rotate(-0.25 + Math.sin(t * 0.6) * 0.12);
      ctx.globalAlpha = 0.85;
      if (G.Sprites) G.Sprites.drawBattle(ctx, 'xinghe', 'ko', 0, 0, 0, { shadow: false, scale: 0.8 });
      ctx.restore();
      ctx.strokeStyle = 'rgba(200,230,255,0.5)'; ctx.lineWidth = 1;
      for (const b of this.bub) { ctx.globalAlpha = Math.max(0, 1 - b.t / 3); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      if (this.dark > 0) { ctx.fillStyle = `rgba(0,0,0,${this.dark})`; ctx.fillRect(0, 0, G.W, G.H); }
      G.FX.vignette(ctx, 0.6);
    }
  }
  async function fallAndWake(S) {
    if (cine && G.Scenes.has(cine)) G.Scenes.pop(cine);
    cine = null;
    await S.fadeOut(dur(0.6), '#05060a');
    const sink = new SinkScene();
    G.Scenes.push(sink);
    await S.fadeIn(dur(1.0));
    await wait(S, 3.2);
    await lerpTo(sink, { dark: 0.85 }, 2.0, 'linear');
    await S.narrate(['……好冷。'], { veil: 0.6, color: '#d8e6f4' });
    await S.narrate(['可是……那首歌，好暖。'], { veil: 0.6, color: '#f2e2c4' });
    await lerpTo(sink, { dark: 1 }, 1.0, 'linear');
    Snd.stopLullaby(1.5);
    FX.waves = false;
    await wait(S, 0.6);
    // THUD — he has fallen out of bed
    S.sfx('hit'); S.sfx('earth');
    S.shake(12, 0.25);
    S.flash('#e8dcc8', 0.25, 0.35);
    await wait(S, 0.8);
    S.flag('ch0_done');
    G.Party.healAll();
    G.state.vars.objective = null;
    S.bgm(null, { fade: 0.5 });
    // leave a plain black base scene for chapter 1 (it warps to its first map)
    G.Scenes.replace({ opaque: true, update() {}, draw(ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H); } });
    await G.Story.next(S, 1);
  }

  // =================================================================================================== chapter entry (new game)
  G.Story.ch0 = async (S) => {
    S.chapter(0);
    if (!G.state.members.xinghe) G.Party.join('xinghe', 1);
    S.flag('ch0_start');
    G.state.vars.objective = null;
    S.bgm(null, { fade: 0.5 });
    // 0-1 black screen, the sea comes closer
    await wait(S, 1.2);
    Snd.wave(0.25, 5);
    await wait(S, 1.4);
    Snd.wave(0.45, 6);
    await wait(S, 1.0);
    await S.narrate([
      '傳說，人死了以後，魂魄會化作一盞小小的燈。',
      '燈漂上黑水溝，一直漂，漂到海的盡頭。',
      '那裡有一座燈，叫做——彼岸燈。',
      '它的光，把每一個迷路的魂，渡到彼岸。',
    ], { veil: 1, color: '#e8ecf4' });
    Snd.wave(0.6, 6);
    await wait(S, 1.5);
    await S.narrate(['……可是，如果有一天，那盞燈熄了呢？'], { veil: 1, color: '#f0dcb8' });
    await wait(S, 0.6);
    await S.titleCard(G.Chapters[0], '夢境・燈橋');
    // fade into the dream: start on the faint white light where she stands, pan down the bridge to 星河
    await S.fadeOut(0.01);
    await S.warp('dream', 10, 42, 'up', { fade: 0, noAutosave: true });
    const ms = MS();
    ms.banner = 0;
    FX.lying = true;
    S.show('player', false);
    camSnap(10, 4);
    cineOn(true);
    await S.fadeIn(dur(2.4));
    await wait(S, 1.6);
    await camTo(10, 42, 7.5, 'inOutQuad');
    S.cameraFollow();
    await wakeUp(S);
  };
})();
