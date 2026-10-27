// Cutscene / event scripting API. Event scripts are async functions receiving `S`.
//   await S.say('xinghe:smile', '台詞');   await S.choice(['好','不要'])
//   await S.move('baizhi', 'UULL');        await S.battle('troop_id')
'use strict';
G.Mapx = G.Mapx || {};
G.Script = (() => {
  let running = 0;
  const U = G.U;
  const Sc = {};
  Sc.busy = () => running > 0;
  // abandon all in-flight scripts (used when loading a save / returning to title)
  Sc.reset = () => { running = 0; G.Timers.clear(); G.Tweens.clear(); G.Dialog.close(); };

  const map = () => G.mapScene;
  const DIRS = { U: 'up', D: 'down', L: 'left', R: 'right' };

  const S = {
    // ---------------- dialogue ----------------
    say(who, text, o) { return G.Dialog.say(who, text, o); },
    // say several lines; each entry: 'text' (spoken by defaultWho) or ['who:expr', 'text'] or {who, text}
    async lines(list, npc) {
      if (!list) return;
      if (typeof list === 'string') list = [list];
      const defWho = npc ? (npc.portrait ? npc.portrait : (npc.name || '')) : '';
      for (const l of list) {
        if (typeof l === 'string') await G.Dialog.say(defWho, l);
        else if (Array.isArray(l)) await G.Dialog.say(l[0], l[1]);
        else if (l && l.text) await G.Dialog.say(l.who != null ? l.who : defWho, l.text, l);
      }
    },
    async choice(options, o) {
      const r = await G.Dialog.choice(options, o);
      return r;
    },
    narrate(lines, o) { return G.Dialog.narrate(lines, o); },
    closeDialog() { G.Dialog.close(); },

    // ---------------- timing & screen ----------------
    wait(sec) { return G.Timers.wait(sec); },
    async fadeOut(sec = 0.5, color = '#000') { G.Dialog.close(); await G.Render.fadeTo(1, sec, color); },
    async fadeIn(sec = 0.5) { await G.Render.fadeTo(0, sec); },
    flash(color = '#fff', sec = 0.4, a = 0.85) { return G.Render.doFlash(color, sec, a); },
    shake(mag = 8, sec = 0.4) { G.Render.doShake(mag, sec); },
    sfx(name, delay) { G.Audio.sfx(name, delay); },
    bgm(id, o) { if (id) G.Music.play(id, o); else G.Music.stop((o && o.fade) || 1); },
    async titleCard(title, sub) {
      G.Dialog.close();
      await new Promise((res) => G.Scenes.push(new G.FX.TitleCard(title, sub, res)));
    },
    toast(text, icon) { G.UI.toast(text, { icon }); },
    objective(text) { G.state.vars.objective = text; if (text) G.UI.toast('目標：' + text, { icon: 'lantern' }); },
    chapter(n) { G.state.chapter = n; },
    fx(name, on = true, o) { const m = map(); if (m) { m.fxOverride = m.fxOverride || {}; m.fxOverride[name] = on ? (o || true) : null; } },
    light(cfg) { const m = map(); if (m) m.lightCfg = Object.assign({}, m.lightCfg, cfg); },
    particles(preset) { const m = map(); if (m) m.particles = new G.FX.Particles(preset, m); },

    // ---------------- actors ----------------
    actor(id) { return map().actor(id); },
    // path: 'UULLD' or [['up',3],['left',2]] ; o: {speed, wait=true, ghost}
    move(id, path, o = {}) {
      const m = map();
      const a = m.actor(id);
      if (!a) { console.warn('no actor', id); return Promise.resolve(); }
      let steps = [];
      if (typeof path === 'string') {
        for (const ch of path.replace(/\s/g, '')) if (DIRS[ch]) steps.push(DIRS[ch]);
      } else for (const [d, n] of path) for (let i = 0; i < n; i++) steps.push(d);
      if (o.speed) a.speed = o.speed;
      a.scripted = true;
      const promises = steps.map((d) => new Promise((res) => a.queue.push({ dir: d, res, ghost: o.ghost })));
      const all = Promise.all(promises).then(() => {
        if (a === m.player) { G.state.x = a.x; G.state.y = a.y; G.state.dir = a.dir; }
      });
      if (!steps.length) return Promise.resolve();
      return o.wait === false ? Promise.resolve() : all;
    },
    // walk to a tile using simple greedy path (x first then y, or y-first with yFirst)
    walkTo(id, x, y, o = {}) {
      const a = map().actor(id);
      if (!a) return Promise.resolve();
      const dx = x - a.x, dy = y - a.y;
      const h = (dx > 0 ? 'R' : 'L').repeat(Math.abs(dx));
      const v = (dy > 0 ? 'D' : 'U').repeat(Math.abs(dy));
      return S.move(id, o.yFirst ? v + h : h + v, o);
    },
    face(id, dir) {
      const m = map();
      const a = m.actor(id);
      if (!a) return;
      if (typeof dir === 'string' && U.dirs[dir]) { a.dir = dir; return; }
      const b = m.actor(dir);
      if (b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
    },
    setPos(id, x, y, dir) {
      const a = map().actor(id);
      if (!a) return;
      a.setCell(x, y);
      if (dir) a.dir = dir;
      if (a === map().player) { G.state.x = x; G.state.y = y; }
    },
    emote(id, k, life) { const a = map().actor(id); if (a) a.emote = { k, t: 0, life }; },
    show(id, v = true) { const a = map().actor(id); if (a) a.visible = v; },
    async jump(id, h = 24) {
      const a = map().actor(id);
      if (!a) return;
      a.jumpY = 0;
      await G.Tweens.to(a, { jumpY: h }, 0.14, 'outQuad');
      await G.Tweens.to(a, { jumpY: 0 }, 0.14, 'inQuad');
    },
    async fadeActor(id, alpha, sec = 0.6) { const a = map().actor(id); if (a) await G.Tweens.to(a, { alpha }, sec, 'linear'); },
    // spawn a temporary scripted NPC: {id, sprite, x, y, dir, portrait, ghost}
    spawn(def) {
      const m = map();
      const a = new G.Mapx.Actor(Object.assign({ speed: 2.6 }, def, { def, scripted: true, spawned: true }));
      m.npcs.push(a);
      return a;
    },
    remove(id) { const m = map(); m.npcs = m.npcs.filter((n) => n.id !== id); },
    release(id) { const a = map().actor(id); if (a) a.scripted = false; },
    // followers: gather behind player (stacked on player), hide/show
    gather() {
      const m = map();
      for (const f of m.followers) { f.setCell(m.player.x, m.player.y); f.scripted = false; f.visible = true; f.dir = m.player.dir; }
    },
    hideFollowers(v = true) { map().hideFollowers = v; },
    async camera(x, y, sec = 0.8) {
      const m = map();
      m.cam.tx = x * G.TILE + G.TILE / 2 - G.W / 2; m.cam.ty = y * G.TILE + G.TILE / 2 - G.H / 2;
      m.cam.speed = 3.5;
      await S.wait(sec);
    },
    cameraFollow(id = 'player') { const m = map(); m.cam.tx = null; m.cam.ty = null; m.cam.follow = id; m.cam.speed = 7; },

    // ---------------- state ----------------
    flag(k, v = true) { G.state.flags[k] = v; },
    has(k) { return !!G.state.flags[k]; },
    vars: () => G.state.vars,
    async give(item, n = 1, o = {}) {
      G.Inv.add(item, n);
      const it = G.Data.items[item];
      const name = it ? it.name : item;
      if (!o.silent) {
        G.Audio.sfx(it && it.type === 'key' ? 'item' : 'item');
        G.UI.toast(`獲得 {y}${name}{/}${n > 1 ? ' ×' + n : ''}`, { icon: G.UI.itemIcon(it) });
      }
    },
    take(item, n = 1) { G.Inv.remove(item, n); },
    hasItem(item, n = 1) { return G.Inv.count(item) >= n; },
    gold(n) {
      G.state.gold = Math.max(0, G.state.gold + n);
      if (n > 0) { G.Audio.sfx('coin'); G.UI.toast(`獲得 {y}${n}{/} 文錢`, { icon: 'bag' }); }
    },
    join(id, lv) {
      G.Party.join(id, lv);
      map() && map().refresh();
      const nm = G.Names[id] || id;
      G.Audio.sfx('levelup');
      G.UI.toast(`{y}${nm}{/} 加入了隊伍！`, { icon: 'lantern' });
    },
    leave(id) { G.Party.leave(id); map() && map().refresh(); },
    learn(id, skill) {
      G.Party.learnSkill(id, skill);
      const sk = G.Data.skills[skill];
      G.Audio.sfx('levelup');
      G.UI.toast(`${G.ShortNames[id] || G.Names[id]} 領悟了 {y}${sk ? sk.name : skill}{/}`, { icon: 'scroll' });
    },
    healParty() { G.Party.healAll(); G.Audio.sfx('heal'); },
    async lantern(id, name) {
      if (!G.Lanterns.add(id, name)) return;
      await new Promise((res) => G.Scenes.push(new G.FX.LanternGet(name, res)));
    },
    quest(id, stage) {
      const was = G.state.quests[id];
      if (stage === 'done') {
        G.Quests.done(id);
        const q = G.Data.quests && G.Data.quests[id];
        G.UI.toast(`完成：{y}${q ? q.name : id}{/}`, { icon: 'scroll' });
      } else {
        G.Quests.set(id, stage || 0);
        if (!was) { const q = G.Data.quests && G.Data.quests[id]; G.UI.toast(`新任務：{y}${q ? q.name : id}{/}`, { icon: 'scroll' }); }
      }
    },
    vision(sec = 60) {
      G.state.vars.vision = sec;
      map() && map().computeSolid();
    },

    // ---------------- flow ----------------
    async warp(mapId, x, y, dir, o = {}) {
      const fade = o.fade == null ? 0.35 : o.fade;
      G.Dialog.close();
      if (fade) await G.Render.fadeTo(1, fade, o.color || '#000');
      G.Tweens.clear && 0;
      const m = map();
      if (m && m.def.id === mapId && !o.reload) {
        m.player.setCell(x, y); m.player.dir = dir || m.player.dir;
        G.state.x = x; G.state.y = y;
        for (const f of m.followers) { f.setCell(x, y); f.dir = m.player.dir; f.queue = []; }
        m.snapCamera();
      } else {
        G.Mapx.goto(mapId, x, y, dir);
      }
      if (fade && !o.stayDark) await G.Render.fadeTo(0, fade);
      if (G.settings.autosave !== false && !o.noAutosave && G.mapScene && G.mapScene.def.autosave !== false) G.Save.auto();
    },
    async battle(troop, o = {}) {
      const r = await G.Battle.start(troop, o);
      return r;
    },
    shop(goods, o) { return new Promise((res) => G.Scenes.push(new G.ShopScene(goods, res, o))); },
    async inn(price, o = {}) {
      const c = await S.choice([`住宿（${price} 文）`, '不用了'], { cancel: 1 });
      if (c !== 0) return false;
      if (G.state.gold < price) { await S.say(o.who || '', '客官，您的盤纏好像不太夠呢……'); return false; }
      G.state.gold -= price;
      await S.fadeOut(0.8);
      G.Music.stop(0.8);
      G.Party.healAll();
      G.Audio.sfx('heal');
      await S.wait(1.2);
      await S.fadeIn(0.8);
      G.Music.play(G.Mapx.val(map().def.bgm));
      G.UI.toast('好好休息了一晚，全員完全恢復。', { icon: 'lantern' });
      return true;
    },
    travel(from, to, o) { G.Dialog.close(); return G.World.travel(from, to, o); },
    visit(place) { G.World.visit(place); },
    saveMenu() { return new Promise((res) => G.Scenes.push(new G.SaveScene('save', res))); },
    menu() { return new Promise((res) => { const m = new G.MenuScene(); m.onClose = res; G.Scenes.push(m); }); },
    refresh() { map() && map().refresh(); },
    gameOver() { G.Scenes.push(new G.GameOverScene()); return new Promise(() => {}); },
    ending(kind) { return G.Ending ? G.Ending.play(kind) : Promise.resolve(); },
    // run a minigame scene; resolves with its result
    scene(sceneObj) { return new Promise((res) => { sceneObj.onDone = res; G.Scenes.push(sceneObj); }); },
  };
  Sc.S = S;

  Sc.run = async function (fn, ctx) {
    if (!fn) return;
    running++;
    try {
      await fn(S, ctx);
    } catch (e) {
      console.error('Script error', e);
    } finally {
      running = Math.max(0, running - 1);
      G.Dialog.close();
      const m = map();
      if (m) {
        m.player.scripted = false;
        for (const f of m.followers) f.scripted = false;
        for (const n of m.npcs) if (!n.spawned) n.scripted = false;
        if (running === 0) m.refresh();
      }
      G.Input.clear();
    }
  };
  return Sc;
})();

// Go to a map (creating a fresh MapScene as the base scene)
G.Mapx.goto = function (mapId, x, y, dir) {
  const ms = new G.MapScene(mapId, x, y, dir);
  // keep any non-map overlays? we replace the stack base
  const stack = G.Scenes.stack;
  const oldIdx = stack.indexOf(G.mapScene);
  if (oldIdx >= 0) {
    stack[oldIdx] = ms;
    if (G.mapScene.exit) G.mapScene.exit();
    G.mapScene = ms;
    ms.enter();
  } else {
    G.mapScene = ms;
    G.Scenes.replace(ms);
  }
  if (G.mapScene.def.onEnter) G.Script.run(G.mapScene.def.onEnter);
  return ms;
};
