// 彼岸燈 — party auto-battle AI (the F key in battle). BattleScene.autoCommand(u) asks G.AutoBattle.command(scene, u)
// for every party member's turn while auto is on; on any error it falls back to the scene's basic auto command.
//
// A port of the "sensible player" of tools/test/lib/battlebot.js (the policy the bosses were balanced against,
// docs/BALANCE.md), adapted to a real save file:
//   1. ultimate (in ordinary fights only when the party is in trouble, so the 劍意 gauge is saved for bosses)
//   2. revive — a revive skill, else a revive item when nobody else can revive
//   3. heal — the designated healer (白芷, else 雲歸, 星河, 紅纓) with skills; anyone heals with a skill in an emergency
//   4. play the battle's on-screen hint: a skill named in 「…」 (e.g. 「渡魂謠」, the combo 「千燈」)
//   5. heal items when a member is in danger and the healer cannot act before the enemies do
//   6. MP item for the healer (boss fights)            7. cure a stuck healer / stunned or sleeping ally
//   8. guard against a telegraphed blow (an enemy wind-up, a 「！」 charge flag, an on-screen 伏低/防禦/穩住 warning —
//      only the member a warning names, if it names one)          9. last stand: guard when no one can heal
//  10. boss openers that always land (迷魂扇, 天罡破法, 蓄勢, 月霧護身曲, 甘霖)
//  11. otherwise the best expected damage (克 cycle, weak/resist, hit, crit, AoE), MP spent by its worth; combos in boss
//      fights when they beat the members' separate actions.
// Deterministic (no random numbers) and cheap: a few passes over the party's skills × the enemies per turn.
//
// Player settings (G.settings, menu → 設定):
//   autoStyle  'safe' 保守 | 'normal' 標準 (default) | 'bold' 積極 — heal / item / guard thresholds and how freely MP
//              is spent (see STYLES)
//   autoItems  true (default) | false — 使用道具: restoratives only (heal, MP, revive, cure). Never key items, never
//              rare ones (story gifts with no shop price, items flagged `rare`), never attack items. In ordinary
//              fights only cheap items (price ≤ cheapCap(chapter)) and only in an emergency; boss fights use the kit.
// Boss fight = the troop or any living enemy is flagged boss: MP and item thresholds differ (STYLES …Boss / …Trash).
'use strict';
G.AutoBattle = (() => {
  const A = {};
  const SK = () => G.Data.skills;
  const IT = () => G.Data.items;

  // heal1: the healer single-heals the worst member below this HP share; healAll: group heal when 2+ are below it;
  // itemAt: heal item when a member is below it (boss; ordinary fights use itemAt × 0.75); guardHp: on a telegraphed
  // blow, a member below this HP share guards (the healer always does); kmp: damage one MP point must buy (× the plain
  // attack's damage / kmp) — boss / ordinary; reserve: share of max MP the healer keeps; mpItem: healer MP share that
  // calls for an MP item (boss fights only); ultTrash: ultimates in ordinary fights even when nobody is in trouble.
  A.STYLES = {
    safe: { heal1: 0.55, healAll: 0.65, itemAt: 0.4, guardHp: 0.95, kmpBoss: 22, kmpTrash: 5, reserveBoss: 0.4, reserveTrash: 0.5, mpItem: 0.3, ultTrash: false },
    normal: { heal1: 0.45, healAll: 0.6, itemAt: 0.32, guardHp: 0.8, kmpBoss: 30, kmpTrash: 8, reserveBoss: 0.3, reserveTrash: 0.4, mpItem: 0.2, ultTrash: false },
    bold: { heal1: 0.35, healAll: 0.5, itemAt: 0.25, guardHp: 0.5, kmpBoss: 45, kmpTrash: 12, reserveBoss: 0.2, reserveTrash: 0.25, mpItem: 0.12, ultTrash: true },
  };
  A.STYLE_IDS = ['safe', 'normal', 'bold'];
  A.style = () => (A.STYLES[G.settings && G.settings.autoStyle] ? G.settings.autoStyle : 'normal');
  A.itemsOn = () => !(G.settings && G.settings.autoItems === false);
  // the most an item may cost to be used in an ordinary fight (金創藥 30 / 草仔粿 40 in ch1 … 百草膏 220 in ch10)
  A.cheapCap = (ch) => 40 + 30 * Math.max(1, ch || 1);

  // ---------------------------------------------------------------- unit maths (battle.js formulas)
  const statMul = (u, k) => (u.st[k + 'Up'] ? 1.3 : 1) * (u.st[k + 'Down'] ? 0.7 : 1) * (k === 'mag' && u.st.trance ? 1.25 : 1);
  const eff = (u, k) => (u[k] || 0) * statMul(u, k);
  const hasSp = (u, id) => !!(u.specials && u.specials.includes(id));
  const pct = (u) => u.hp / Math.max(1, u.mhp);

  function oneHit(sc, u, s, tg, avg) {
    const power = s.power || 1;
    const atk = avg ? avg.atk : eff(u, 'atk'), mag = avg ? avg.mag : eff(u, 'mag');
    let d;
    if (s.type === 'phys') {
      d = power * atk * 2 * 50 / (50 + eff(tg, 'def'));
      const hit = Math.max(0.6, Math.min(0.99, 0.95 - (eff(tg, 'spd') - eff(u, 'spd')) / 400));
      const crit = Math.min(1, 0.05 + (u.luk || 0) / 500 + (u.st.trance ? 0.3 : 0) + (s.crit || 0) + (hasSp(u, 'critUp') ? 0.12 : 0));
      d *= hit * (1 + crit * 0.5);
      if (tg.diving) d = 0;
    } else d = power * mag * 2 * 50 / (50 + (eff(tg, 'def') * 0.3 + eff(tg, 'mag') * 0.7));
    d *= sc.elemFactor(s.elem || null, tg);
    if (tg.st.guard) d *= 0.5;
    return d;
  }
  // expected damage of skill s by u on target tg (or the whole side), capped by the HP left
  function expDmg(sc, u, s, tg, avg) {
    const foes = sc.alive('enemy');
    const hits = s.hits || 1;
    if (s.target === 'enemies') return foes.reduce((a, f) => a + Math.min(f.hp, oneHit(sc, u, s, f, avg) * hits), 0);
    if (s.target === 'random') return foes.reduce((a, f) => a + Math.min(f.hp, oneHit(sc, u, s, f, avg) * hits / foes.length), 0);
    return tg ? Math.min(tg.hp, oneHit(sc, u, s, tg, avg) * hits) : 0;
  }
  const isMain = (sc, e) => e.boss || e.mhp >= Math.max(...sc.enemies.map((x) => x.mhp));
  function pickTarget(sc, u, s, avg) {
    const foes = sc.alive('enemy');
    let best = null, bv = -1;
    for (const f of foes) {
      let v = expDmg(sc, u, s, f, avg);
      if (v <= 0) continue;
      // finish what can be finished; adds that die in ~2 hits come first, otherwise the main enemy
      if (f.hp <= v) v += f.mhp * 0.25 + 50;
      else if (!isMain(sc, f) && f.hp <= v * 2.2) v *= 1.4;
      else if (isMain(sc, f)) v *= 1.05;
      if (v > bv) { bv = v; best = f; }
    }
    return best || foes[0];
  }
  function cmdFor(sc, u, id, kind, tg) {
    const s = SK()[id];
    let targets;
    switch (s.target) {
      case 'enemies': case 'random': targets = sc.alive('enemy'); break;
      case 'allies': targets = s.revive ? sc.party.slice() : sc.alive('party'); break;
      case 'self': targets = [u]; break;
      case 'ally': targets = [tg || sc.alive('party').slice().sort((a, b) => pct(a) - pct(b))[0]]; break;
      case 'deadAlly': targets = [tg || sc.party.find((p) => p.dead) || u]; break;
      default: targets = [tg || pickTarget(sc, u, s)];
    }
    return { kind: kind || (s.ultimate ? 'ultimate' : 'skill'), skill: id, targets };
  }
  const healAmt = (u, s) => ((s.power || 1) * eff(u, 'mag') * 1.2 + (s.power || 1) * 10) * (hasSp(u, 'healUp') ? 1.25 : 1);
  const knownSkills = (u) => ((u.m && u.m.skills) || []).filter((id) => SK()[id] && !SK()[id].combo && !SK()[id].hidden && SK()[id].type !== 'passive');
  const canCast = (u, id) => !u.st.seal && (SK()[id].mp || 0) <= u.mp;
  const healerOf = (sc) => {
    for (const id of ['baizhi', 'yungui', 'xinghe', 'hongying']) {
      const p = sc.party.find((q) => q.id === id && !q.dead && !q.st.sleep && !q.st.stun && !q.st.seal);
      if (p && knownSkills(p).some((k) => SK()[k].type === 'heal' && canCast(p, k))) return p;
    }
    return null;
  };
  const nextEnemyWait = (sc) => Math.min(...sc.alive('enemy').map((e) => e.wait), 1e9);
  const turnLen = (u) => 100 * 40 / (eff(u, 'spd') + 40);
  const isBoss = (sc) => !!(sc.troop && sc.troop.boss) || sc.alive('enemy').some((e) => e.boss);

  // ---------------------------------------------------------------- items
  // restoratives the policy may spend: never key items, rare ones (no shop price / `rare`), attack or enemy items
  A.itemOk = (it, boss) => {
    if (!it || it.type !== 'use' || !it.use || it.use.battle === false || it.rare || it.key || !(it.price > 0)) return false;
    const x = it.use;
    if (x.damage || x.target === 'enemy' || x.target === 'enemies') return false;
    if (!(x.heal || x.healPct || x.revive || x.mp || x.mpPct || x.cure)) return false;
    return boss || it.price <= A.cheapCap(G.state && G.state.chapter);
  };
  const bag = (boss, f) => (A.itemsOn() ? G.Inv.list((it) => A.itemOk(it, boss) && f(it.use, it)) : []);
  const itemHeal = (id, tg) => { const x = IT()[id].use; return (x.heal || 0) + (x.healPct ? x.healPct * tg.mhp : 0); };
  const price = (id) => IT()[id].price || 0;
  function itemCmd(sc, id, tg) {
    const x = IT()[id].use;
    let targets;
    if (x.target === 'allies') targets = x.revive ? sc.party.slice() : sc.alive('party');
    else targets = [tg];
    return { kind: 'item', item: id, targets };
  }

  // ---------------------------------------------------------------- what the battle shows
  const GUARD_RE = /伏低|防禦|穩住|蓄力|要來了|快躲/;
  const NOT_GUARD_RE = /防禦(下降|降低|上升|提升)|在防禦上/g;
  const fresh = (sc) => sc.msg && (sc.acts || 0) - (sc.msgAt || 0) <= 2 ? String(sc.msg.text || '') : '';
  // a big enemy attack is telegraphed: an enemy whose wind-up / charge is up, or `true` for an on-screen warning, or a
  // list of the party members an on-screen warning names
  function telegraph(sc) {
    for (const e of sc.alive('enemy')) {
      for (const k in e) if (/charge|gather|windup|telegraph/i.test(k) && e[k] === true) return e;
      const c = sc.lastCmd && sc.lastCmd.get(e);
      const s = c && c.skill && SK()[c.skill];
      if (s && s.type === 'special' && s.target === 'self' && !s.summon && !s.outcomes) return e;
    }
    const t = fresh(sc).replace(NOT_GUARD_RE, '');
    if (t && GUARD_RE.test(t)) {
      const named = sc.party.filter((p) => !p.dead && p.name && t.includes(p.name));
      return named.length ? named : true;
    }
    return null;
  }
  // skills an on-screen hint names (「渡魂謠」, 『千燈』) — remembered for the rest of the battle
  let nameIdx = null, nameSrc = null;
  function skillByName(n) {
    if (nameSrc !== SK()) { nameSrc = SK(); nameIdx = new Map(); for (const [id, s] of Object.entries(nameSrc)) if (s && s.name && !nameIdx.has(s.name)) nameIdx.set(s.name, id); }
    return nameIdx.get(n);
  }
  function hints(sc) {
    if (!sc.autoHints) sc.autoHints = new Set();
    const t = sc.msg && sc.msg.text;
    if (t && t !== sc.autoHintSeen) {
      sc.autoHintSeen = t;
      for (const m of String(t).matchAll(/[「『]([^」』]{1,12})[」』]/g)) { const id = skillByName(m[1]); if (id) sc.autoHints.add(id); }
    }
    return sc.autoHints;
  }
  // a combo u can start now (the command menu's rules)
  function comboReady(sc, u, id) {
    const s = SK()[id];
    if (!s || !s.combo || !s.combo.includes(u.id) || u.st.seal) return false;
    if ((s.req && !G.state.flags[s.req]) || (s.flag && !G.state.flags[s.flag])) return false;
    return s.combo.every((pid) => {
      const p = sc.party.find((x) => x.id === pid);
      return p && !p.dead && !p.st.sleep && !p.st.stun && p.mp >= (s.mp || 0) && !(s.comboLv && p.lv < s.comboLv);
    });
  }

  // ---------------------------------------------------------------- the policy
  A.command = function (sc, u) {
    const ST = A.STYLES[A.style()];
    const party = sc.party, alive = sc.alive('party'), dead = party.filter((p) => p.dead), foes = sc.alive('enemy');
    if (!foes.length) return { kind: 'defend' };
    const boss = isBoss(sc);
    const skills = knownSkills(u);
    const usable = skills.filter((k) => !SK()[k].ultimate && canCast(u, k));
    const healer = healerOf(sc);
    const iAmHealer = healer === u;
    const hurt = alive.filter((p) => pct(p) < 0.55);
    const bossE = foes.filter((e) => isMain(sc, e))[0] || foes[0];
    const nearlyDone = foes.every((e) => e.hp < e.mhp * 0.08 || (e.endAt && e.hp < e.mhp * (e.endAt + 0.05)));
    const trouble = dead.length > 0 || alive.some((p) => pct(p) < 0.4);
    const hinted = hints(sc);

    // 1. ultimate
    if (u.gauge >= 100 && !u.st.seal && (boss || ST.ultTrash || trouble)) {
      const ults = [];
      const main = G.Data.chars[u.id] && G.Data.chars[u.id].ultimate;
      if (main && SK()[main]) ults.push(main);
      for (const k of skills) if (SK()[k].ultimate && !ults.includes(k)) ults.push(k);
      let best = null, bv = 0;
      for (const k of ults) {
        const s = SK()[k];
        const v = s.type === 'heal' ? ((dead.length || hurt.length >= 2) ? 1e9 : -1) : expDmg(sc, u, s, pickTarget(sc, u, s));
        if (v > bv) { bv = v; best = k; }
      }
      if (best) return cmdFor(sc, u, best, 'ultimate');
    }
    // 2. revive
    if (dead.length && !nearlyDone) {
      const rev = usable.filter((k) => SK()[k].type === 'revive' || (SK()[k].revive && SK()[k].type === 'heal')).sort((a, b) => (SK()[b].power || 0) - (SK()[a].power || 0))[0];
      if (rev) return cmdFor(sc, u, rev, null, dead[0]);
      const reviverAlive = alive.some((p) => p !== u && knownSkills(p).some((k) => SK()[k].type === 'revive' && canCast(p, k)) && !p.st.sleep && !p.st.stun);
      // ordinary fights: only when the fight is about to be lost
      if (!reviverAlive && (boss || alive.length <= 1)) {
        const ri = bag(boss, (x) => x.revive).sort((a, b) => price(a) - price(b));
        const all = ri.find((x) => IT()[x].use.target === 'allies');
        const id = dead.length > 1 && all ? all : ri.find((x) => IT()[x].use.target !== 'allies') || ri[0];
        if (id) return itemCmd(sc, id, dead[0]);
      }
    }
    // 3. heal with skills
    const healSk = usable.filter((k) => SK()[k].type === 'heal' && !SK()[k].ultimate);
    if (healSk.length && (iAmHealer || alive.some((p) => pct(p) < 0.3))) {
      const allH = healSk.filter((k) => SK()[k].target === 'allies').sort((a, b) => SK()[b].power - SK()[a].power);
      const oneH = healSk.filter((k) => SK()[k].target === 'ally').sort((a, b) => SK()[a].power - SK()[b].power);
      const worst = alive.slice().sort((a, b) => pct(a) - pct(b))[0];
      if (alive.filter((p) => pct(p) < ST.healAll).length >= 2 && allH.length) return cmdFor(sc, u, allH[0]);
      if (pct(worst) < ST.heal1) {
        const need = worst.mhp - worst.hp;
        const k = oneH.find((kk) => healAmt(u, SK()[kk]) >= need * 0.8) || oneH[oneH.length - 1] || allH[0];
        if (k) return cmdFor(sc, u, k, null, worst);
      }
    }
    // 4. the battle's on-screen hint names a skill (or combo) this member can use
    for (const id of hinted) {
      const s = SK()[id];
      if (!s) continue;
      if (s.combo ? comboReady(sc, u, id) : (skills.includes(id) && canCast(u, id))) {
        return cmdFor(sc, u, id, s.combo ? 'skill' : null, s.target === 'enemy' ? bossE : null);
      }
    }
    // 5. heal items: someone is in danger and the healer cannot cover it before the enemies act
    const itemAt = boss ? ST.itemAt : ST.itemAt * 0.75;
    const crit = alive.filter((p) => pct(p) < itemAt).sort((a, b) => pct(a) - pct(b));
    if (crit.length && (boss || !healer)) {
      const healerSoon = healer && healer !== u && healer.wait < nextEnemyWait(sc) && crit.length === 1;
      if (!healerSoon) {
        const hi = bag(boss, (x) => (x.heal || x.healPct) && !x.revive);
        const group = hi.filter((id) => IT()[id].use.target === 'allies');
        if (crit.length >= 2 && group.length) return itemCmd(sc, group.sort((a, b) => price(a) - price(b))[0]);
        const one = hi.filter((id) => IT()[id].use.target !== 'allies');
        if (one.length) {
          const t = crit[0], need = t.mhp - t.hp;
          const id = one.slice().sort((a, b) => itemHeal(a, t) - itemHeal(b, t) || price(a) - price(b)).find((x) => itemHeal(x, t) >= need * 0.6) || one[one.length - 1];
          return itemCmd(sc, id, t);
        }
        if (group.length) return itemCmd(sc, group[0]);
      }
    }
    // 6. MP for the healer (boss fights)
    if (boss && iAmHealer && u.mp < u.mmp * ST.mpItem) {
      const mi = bag(true, (x) => (x.mp || x.mpPct) && !x.heal && x.target !== 'allies').sort((a, b) => price(a) - price(b))[0]
        || bag(true, (x) => (x.mp || x.mpPct) && x.target !== 'allies')[0];
      if (mi) return itemCmd(sc, mi, u);
    }
    // 7. cure the healer / a sealed caster / a stunned or sleeping ally
    const stuck = alive.find((p) => p !== u && (p.st.sleep > 1 || p.st.stun > 1 || (p.st.seal && p === healer)));
    if (stuck) {
      const cureSk = usable.find((k) => SK()[k].type === 'cure' || (SK()[k].cure && SK()[k].type !== 'heal'));
      if (cureSk) return cmdFor(sc, u, cureSk, null, stuck);
      if (boss && !nearlyDone) {
        const bad = Object.keys(stuck.st).filter((k) => ['sleep', 'stun', 'seal'].includes(k));
        const ci = bag(true, (x) => x.cure && bad.some((b) => x.cure.includes(b)) && x.target !== 'allies').sort((a, b) => price(a) - price(b))[0];
        if (ci) return itemCmd(sc, ci, stuck);
      }
    }
    // 8. guard against a telegraphed blow
    const tel = telegraph(sc);
    if (tel) {
      if (Array.isArray(tel)) { if (tel.includes(u)) return { kind: 'defend' }; }
      else {
        const e = tel === true ? null : tel;
        const before = !e || e.wait < turnLen(u) * 1.05;
        if (before && (pct(u) < ST.guardHp || iAmHealer || tel === true)) return { kind: 'defend' };
      }
    }
    // 9. last stand: nobody can heal and this member would drop
    if (pct(u) < 0.2 && !healer && !bag(boss, (x) => x.heal || x.healPct).length && alive.length > 1) return { kind: 'defend' };

    // 10. boss openers: buffs / debuffs that are certain to land (data `buffs` skip the status roll)
    if (boss && !u.st.seal && !nearlyDone) {
      const tryS = (k, cond, tg) => (usable.includes(k) && cond ? cmdFor(sc, u, k, null, tg) : null);
      const anyBossNot = (st) => foes.filter((e) => isMain(sc, e)).some((e) => !e.st[st]);
      const r = tryS('yg_mihun', anyBossNot('atkDown') && bossE.hp > bossE.mhp * 0.25, bossE)
        || tryS('yg_tiangang', anyBossNot('defDown') && bossE.hp > bossE.mhp * 0.3, bossE)
        || tryS('hy_xushi', !u.st.atkUp && bossE.hp > bossE.mhp * 0.2)
        || tryS('bz_yuewu', alive.filter((p) => !p.st.defUp).length >= 2 && u.mp > u.mmp * 0.45)
        || tryS('bz_ganlin', alive.filter((p) => pct(p) < 0.8 && !p.st.regen).length >= 2 && u.mp > u.mmp * 0.4);
      if (r) return r;
    }
    // 11. damage: skills or a plain attack, MP spent by its worth; combos in boss fights
    const atkSk = { name: '攻擊', type: 'phys', power: 1, target: 'enemy', elem: u.elem || null };
    const atkT = pickTarget(sc, u, atkSk);
    const atkVal = expDmg(sc, u, atkSk, atkT);
    const kmp = atkVal / (boss ? ST.kmpBoss : ST.kmpTrash);
    const reserve = iAmHealer ? u.mmp * (boss ? ST.reserveBoss : ST.reserveTrash) : 0;
    let best = { kind: 'attack', targets: [atkT] }, bv = atkVal;
    for (const k of usable) {
      const s = SK()[k];
      if (s.type !== 'phys' && s.type !== 'mag') continue;
      if (u.mp - (s.mp || 0) < reserve) continue;
      const t = s.target === 'enemy' ? pickTarget(sc, u, s) : null;
      let v = expDmg(sc, u, s, t) * (s.delay ? 1 / s.delay : 1) - (s.mp || 0) * kmp;
      if (s.buffs && s.buffs.some((b) => b.amt < 0) && t && isMain(sc, t)) v *= 1.15;
      if (v > bv) { bv = v; best = cmdFor(sc, u, k, null, t); }
    }
    if (boss && !u.st.seal) {
      for (const [k, s] of Object.entries(SK())) {
        if (!s.combo || s.combo[0] !== u.id || !comboReady(sc, u, k)) continue;
        const mates = s.combo.map((pid) => party.find((p) => p.id === pid));
        const avg = { atk: mates.reduce((a, p) => a + eff(p, 'atk'), 0) / mates.length, mag: mates.reduce((a, p) => a + eff(p, 'mag'), 0) / mates.length };
        if (s.type === 'heal') { if (alive.filter((p) => pct(p) < 0.6).length >= 2) return cmdFor(sc, u, k, 'skill'); continue; }
        const t = s.target === 'enemy' ? pickTarget(sc, u, s, avg) : null;
        const v = expDmg(sc, u, s, t, avg) - bv * mates.length - (s.mp || 0) * kmp * mates.length;
        if (v > 0) return cmdFor(sc, u, k, 'skill', t);
      }
    }
    return best;
  };

  return A;
})();
