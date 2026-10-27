// Game state, party/inventory logic, saving & settings.
'use strict';
G.Data = G.Data || {};

G.settings = (() => {
  const navLang = (navigator.language || 'en').toLowerCase();
  const def = { music: 0.6, sfx: 0.8, textSpeed: 2, battleSpeed: 1, difficulty: 'normal', quality: 'high', runDefault: false, autoAdvance: false,
    lang: navLang.startsWith('zh') ? 'zh' : 'en' };
  try {
    const s = JSON.parse(localStorage.getItem('shorelight_settings') || '{}');
    return Object.assign(def, s);
  } catch (e) { return def; }
})();
G.saveSettings = function () {
  try { localStorage.setItem('shorelight_settings', JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
  if (G.Audio) { G.Audio.setMusicVol(G.settings.music); G.Audio.setSfxVol(G.settings.sfx); }
};
G.Audio.settings.music = G.settings.music;
G.Audio.settings.sfx = G.settings.sfx;

G.newState = function () {
  return {
    version: 1,
    map: 'dream', x: 10, y: 20, dir: 'up',
    party: [],
    members: {},
    inv: {},
    gold: 0,
    flags: {},
    vars: {},
    lanterns: {},
    quests: {},
    opened: {},
    bestiary: {},
    playtime: 0,
    chapter: 0,
    steps: 0,
    battles: 0,
    stats: G.newStats(),
  };
};

// Play statistics (G.state.stats). The clock itself lives in js/engine/playstats.js; this is only the saved shape.
// `playtime` stays the single source for the total: chapters[n].time sums to playtime - legacy.
//   legacy    seconds carried over from a save made before stats existed (not broken down)
//   chapters  { [chapter]: { time, act: {dialogue,battle,explore,menu,minigame}, battles, wins, losses, gameOvers, flees, retries } }
//   bosses    { [troopKey]: { enemy, ch, attempts, wins, losses, retries, time, firstWin } }  (firstWin = attempt # of the first win)
//   afk       { count, lost }  AFK episodes and the seconds subtracted for them
G.STAT_ACTS = ['dialogue', 'battle', 'explore', 'menu', 'minigame'];
G.newStats = function () {
  return { v: 1, runId: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), legacy: 0, chapters: {}, bosses: {}, afk: { count: 0, lost: 0 } };
};
G.statChapter = function (stats, ch) {
  const k = String(ch | 0);
  let c = stats.chapters[k];
  if (!c) c = stats.chapters[k] = { time: 0, act: {}, battles: 0, wins: 0, losses: 0, gameOvers: 0, flees: 0, retries: 0 };
  for (const a of G.STAT_ACTS) if (typeof c.act[a] !== 'number') c.act[a] = 0;
  return c;
};
// fill in stats for a state loaded from an older save (no stats → the whole playtime becomes `legacy`)
G.migrateStats = function (st) {
  if (!st.stats || typeof st.stats !== 'object') {
    st.stats = G.newStats();
    st.stats.legacy = st.playtime || 0;
    return st;
  }
  const s = st.stats, d = G.newStats();
  for (const k in d) if (s[k] == null || typeof s[k] !== typeof d[k]) s[k] = d[k];
  for (const k in s.chapters) G.statChapter(s, k);
  for (const k in s.bosses) s.bosses[k] = Object.assign({ enemy: null, ch: 0, attempts: 0, wins: 0, losses: 0, retries: 0, time: 0, firstWin: 0 }, s.bosses[k]);
  if (s.afk.count == null) s.afk.count = 0;
  if (s.afk.lost == null) s.afk.lost = 0;
  return st;
};
G.state = G.newState();

// ---------------------------------------------------------------------------------
G.Party = (() => {
  const P = {};
  const STATS = ['hp', 'mp', 'atk', 'def', 'mag', 'spd', 'luk'];
  P.expToNext = (lv) => Math.round(20 * Math.pow(lv, 1.8) + 30);

  P.data = (id) => G.Data.chars[id];
  P.member = (id) => G.state.members[id];

  P.create = function (id, lv = 1) {
    const d = G.Data.chars[id];
    const m = {
      id, lv: 1, exp: 0, hp: 1, mp: 1, gauge: 0,
      equip: Object.assign({ weapon: null, armor: null, head: null, feet: null, acc: null }, d.equip || {}),
      skills: [],
    };
    G.state.members[id] = m;
    P.learnUpTo(m);
    while (m.lv < lv) { m.lv++; P.learnUpTo(m); }
    const st = P.stats(id);
    m.hp = st.mhp; m.mp = st.mmp;
    return m;
  };

  P.learnUpTo = function (m) {
    const d = G.Data.chars[m.id];
    const learned = [];
    for (const l of d.learn || []) {
      if (l.lv <= m.lv && !l.story && !m.skills.includes(l.skill)) { m.skills.push(l.skill); learned.push(l.skill); }
    }
    return learned;
  };

  P.join = function (id, lv) {
    if (!G.state.members[id]) P.create(id, lv || 1);
    if (!G.state.party.includes(id)) G.state.party.push(id);
  };
  P.leave = function (id) {
    G.state.party = G.state.party.filter((p) => p !== id);
  };
  P.active = () => G.state.party.slice(0, 4).map((id) => G.state.members[id]).filter(Boolean);
  P.leader = () => G.state.party[0];

  P.stats = function (id) {
    const m = G.state.members[id];
    const d = G.Data.chars[id];
    const s = {};
    for (const k of STATS) {
      const base = (d.base[k] || 0) + (d.growth[k] || 0) * (m.lv - 1);
      s[k] = base;
    }
    const resist = [], immune = [], specials = [];
    let elem = d.elem;
    for (const slot in m.equip) {
      const it = m.equip[slot] && G.Data.items[m.equip[slot]];
      if (!it) continue;
      if (it.stats) for (const k in it.stats) if (s[k] != null) s[k] += it.stats[k];
      if (it.resist) resist.push(...it.resist);
      if (it.immune) immune.push(...it.immune);
      if (it.special) specials.push(...[].concat(it.special));
      if (it.elem && slot === 'weapon') elem = it.elem;
    }
    // pair bonuses — item.pair = { with: charId, stats, both? }: while the wearer and `with` are both in the active
    // party (first four), the wearer gets `stats`; with both:true the partner gets them too (月老紅線)
    const act = G.state.party.slice(0, 4);
    if (act.includes(id)) {
      for (const pid of act) {
        const pm = G.state.members[pid];
        if (!pm) continue;
        for (const slot in pm.equip) {
          const it = pm.equip[slot] && G.Data.items[pm.equip[slot]];
          const pr = it && it.pair;
          if (!pr || !pr.stats || !act.includes(pr.with) || pr.with === pid) continue;
          if (pid === id || (pr.both && pr.with === id)) for (const k in pr.stats) if (s[k] != null) s[k] += pr.stats[k];
        }
      }
    }
    // difficulty scaling for player side
    return {
      mhp: Math.round(s.hp), mmp: Math.round(s.mp), atk: Math.round(s.atk), def: Math.round(s.def),
      mag: Math.round(s.mag), spd: Math.round(s.spd), luk: Math.round(s.luk), elem, resist, immune, specials,
    };
  };

  // returns [{id, lv, learned:[skill], gains:{...}}]
  P.gainExp = function (amount) {
    const ups = [];
    for (const m of P.active()) {
      if (m.hp <= 0) continue;
      P.addExpTo(m, amount, ups);
    }
    // benched members get half
    for (const id of G.state.party.slice(4)) P.addExpTo(G.state.members[id], Math.floor(amount / 2), []);
    return ups;
  };
  P.addExpTo = function (m, amount, ups) {
    m.exp += amount;
    let up = null;
    while (m.exp >= P.expToNext(m.lv) && m.lv < 50) {
      const before = P.stats(m.id);
      m.exp -= P.expToNext(m.lv);
      m.lv++;
      const learned = P.learnUpTo(m);
      const after = P.stats(m.id);
      if (!up) { up = { id: m.id, from: m.lv - 1, lv: m.lv, learned: [], before }; ups.push(up); }
      up.lv = m.lv; up.learned.push(...learned); up.after = after;
      m.hp += after.mhp - before.mhp;
      m.mp += after.mmp - before.mmp;
    }
  };

  P.healAll = function () {
    for (const id in G.state.members) {
      const m = G.state.members[id];
      const st = P.stats(id);
      m.hp = st.mhp; m.mp = st.mmp;
      m.status = {};
    }
  };

  P.learnSkill = function (id, skill) {
    const m = G.state.members[id];
    if (m && !m.skills.includes(skill)) m.skills.push(skill);
  };

  P.equip = function (id, slot, itemId) {
    const m = G.state.members[id];
    const old = m.equip[slot];
    if (old) G.Inv.add(old, 1);
    if (itemId) G.Inv.remove(itemId, 1);
    m.equip[slot] = itemId || null;
    const st = P.stats(id);
    m.hp = Math.min(m.hp, st.mhp); m.mp = Math.min(m.mp, st.mmp);
  };

  P.canEquip = function (id, itemId) {
    const it = G.Data.items[itemId];
    if (!it) return false;
    if (it.who && !it.who.includes(id)) return false;
    return ['weapon', 'armor', 'head', 'feet', 'acc'].includes(it.type);
  };
  return P;
})();

// ---------------------------------------------------------------------------------
G.Inv = {
  add(id, n = 1) {
    if (!G.Data.items[id]) { console.warn('unknown item', id); }
    G.state.inv[id] = (G.state.inv[id] || 0) + n;
    if (G.state.inv[id] > 99 && G.Data.items[id] && G.Data.items[id].type !== 'key') G.state.inv[id] = 99;
  },
  remove(id, n = 1) {
    G.state.inv[id] = (G.state.inv[id] || 0) - n;
    if (G.state.inv[id] <= 0) delete G.state.inv[id];
  },
  count: (id) => G.state.inv[id] || 0,
  has: (id) => (G.state.inv[id] || 0) > 0,
  list(filter) {
    return Object.keys(G.state.inv)
      .filter((id) => G.Data.items[id] && (!filter || filter(G.Data.items[id], id)))
      .sort((a, b) => {
        const order = ['use', 'weapon', 'armor', 'head', 'feet', 'acc', 'material', 'key'];
        const ia = G.Data.items[a], ib = G.Data.items[b];
        return order.indexOf(ia.type) - order.indexOf(ib.type) || (ia.price || 0) - (ib.price || 0);
      });
  },
};

// ---------------------------------------------------------------------------------
G.Flags = {
  get: (k) => G.state.flags[k],
  set: (k, v = true) => { G.state.flags[k] = v; },
  has: (k) => !!G.state.flags[k],
};

G.Lanterns = {
  count: () => Object.keys(G.state.lanterns).length,
  has: (id) => !!G.state.lanterns[id],
  add(id, name) {
    if (G.state.lanterns[id]) return false;
    G.state.lanterns[id] = { name, time: G.state.playtime };
    return true;
  },
  THRESHOLD: 14,
};

G.Quests = {
  start(id) { if (!G.state.quests[id]) G.state.quests[id] = { stage: 0, done: false }; },
  stage: (id) => (G.state.quests[id] ? G.state.quests[id].stage : -1),
  set(id, stage) { G.Quests.start(id); G.state.quests[id].stage = stage; },
  done(id) { G.Quests.start(id); G.state.quests[id].done = true; },
  isDone: (id) => !!(G.state.quests[id] && G.state.quests[id].done),
  active: () => Object.keys(G.state.quests).filter((q) => !G.state.quests[q].done),
};

// ---------------------------------------------------------------------------------
G.Save = {
  SLOTS: 8,
  key: (slot) => 'shorelight_save_' + slot,
  write(slot, thumb) {
    // fold the play-time still pending since the last input into the total before it is written
    if (G.PlayStats) G.PlayStats.commit();
    const data = {
      state: G.state,
      meta: {
        time: Date.now(),
        place: G.mapScene && G.mapScene.map ? G.mapScene.map.name : '',
        chapter: G.state.chapter,
        playtime: G.state.playtime,
        party: G.state.party.slice(0, 4).map((id) => ({ id, lv: G.state.members[id].lv })),
        lanterns: G.Lanterns.count(),
        thumb: thumb || null,
      },
    };
    try {
      localStorage.setItem(G.Save.key(slot), JSON.stringify(data));
      return true;
    } catch (e) {
      // quota: retry without thumbnail
      try { data.meta.thumb = null; localStorage.setItem(G.Save.key(slot), JSON.stringify(data)); return true; } catch (e2) { return false; }
    }
  },
  meta(slot) {
    try {
      const d = JSON.parse(localStorage.getItem(G.Save.key(slot)));
      return d ? d.meta : null;
    } catch (e) { return null; }
  },
  read(slot) {
    try {
      const d = JSON.parse(localStorage.getItem(G.Save.key(slot)));
      if (!d) return false;
      const st = G.migrateStats(Object.assign(G.newState(), d.state));
      // play statistics are a record of real play, not of the save: loading an older save of the same
      // playthrough (after a game over, or after quitting without saving) keeps the time/battles played since
      if (G.PlayStats) G.PlayStats.adoptLoaded(st);
      G.state = st;
      return true;
    } catch (e) { return false; }
  },
  exists(slot) { return !!localStorage.getItem(G.Save.key(slot)); },
  any() { for (let i = 0; i <= G.Save.SLOTS; i++) if (G.Save.exists(i)) return true; return false; },
  latest() {
    let best = -1, bt = 0;
    for (let i = 0; i <= G.Save.SLOTS; i++) {
      const m = G.Save.meta(i);
      if (m && m.time > bt) { bt = m.time; best = i; }
    }
    return best;
  },
  thumbnail() {
    try {
      const c = document.createElement('canvas');
      c.width = 192; c.height = 108;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 192, 108);
      if (G.R3 && G.R3.active) { G.R3.render(0); g.drawImage(G.R3.canvas, 0, 0, 192, 108); }
      g.drawImage(G.canvas, 0, 0, 192, 108);
      return c.toDataURL('image/jpeg', 0.6);
    } catch (e) { return null; }
  },
  // slot 0 = autosave
  auto() { G.Save.write(0, G.Save.thumbnail()); },
};
