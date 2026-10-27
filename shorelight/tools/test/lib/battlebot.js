// 彼岸燈 — a "sensible player" battle policy, shared by tools/sim_story.js (balance simulator) and the chapter
// playthrough tests (tools/test/chapters/chN.test.js).
//
// The in-game auto-battle (G.Battle.Scene.prototype.autoCommand) never uses items, never guards and heals late, so it
// cannot beat bosses tuned for a real player (docs/BALANCE.md). The playthrough tests check the story flow, not the
// balance, so they load this file into the page (context/page.addInitScript({ path })) and fight with it instead:
//   · revive (skill, else item), heal with skills (designated healer) or items when someone is in danger, MP items for
//     the healer, cure a stuck healer / stunned ally;
//   · guard when a big blow is telegraphed (an enemy wind-up skill — type 'special' on itself —, a `…charge` flag on the
//     enemy, or an on-screen warning that says to 伏低 / 防禦 / 穩住);
//   · open boss fights with the debuffs/buffs that always land (迷魂扇, 天罡破法, 蓄勢, 月霧護身曲, 甘霖);
//   · ultimates, combos, otherwise the best expected damage (克 cycle, weak/resist, hit/crit) with a light MP cost.
// In a browser it installs itself on DOMContentLoaded: prototype.autoCommand → this policy (per-battle hooks that wrap
// autoCommand still apply on top), and — unless window.__battleBot = { difficulty: null } — G.settings.difficulty = 'easy'
// so the tests keep a wide safety margin whatever the boss numbers are.
'use strict';
(function (root) {
  // execute/say wrappers the policy reads: the last command of every enemy (wind-ups) and when the last on-screen message
  // was shown (warnings are only fresh for a couple of actions)
  function instrument(P) {
    if (P.__bbInstrumented) return;
    P.__bbInstrumented = true;
    const exec = P.execute;
    P.execute = function (u, cmd) {
      this.__acts = (this.__acts || 0) + 1;
      if (u.side === 'enemy') { this.__last = this.__last || new Map(); this.__last.set(u, cmd); }
      return exec.call(this, u, cmd);
    };
    const say = P.say;
    P.say = function (text, sec) { this.__msgAt = this.__acts || 0; return say.call(this, text, sec); };
  }

  function makeAI(G, mode) {
    const SK = () => G.Data.skills;
    const IT = () => G.Data.items;
    const statMul = (u, k) => (u.st[k + 'Up'] ? 1.3 : 1) * (u.st[k + 'Down'] ? 0.7 : 1) * (k === 'mag' && u.st.trance ? 1.25 : 1);
    const eff = (u, k) => u[k] * statMul(u, k);
    const hasSp = (u, id) => !!(u.specials && u.specials.includes(id));
    const pct = (u) => u.hp / u.mhp;

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
    // expected damage of skill s by u on target tg (or the whole side), capped by remaining HP
    function expDmg(sc, u, s, tg, avg) {
      const foes = sc.alive('enemy');
      const hits = s.hits || 1;
      if (s.target === 'enemies') return foes.reduce((a, f) => a + Math.min(f.hp, oneHit(sc, u, s, f, avg) * hits), 0);
      if (s.target === 'random') return foes.reduce((a, f) => a + Math.min(f.hp, oneHit(sc, u, s, f, avg) * hits / foes.length), 0);
      return Math.min(tg.hp, oneHit(sc, u, s, tg, avg) * hits);
    }
    const isMain = (sc, e) => e.boss || e.mhp >= Math.max(...sc.enemies.map((x) => x.mhp));
    function pickTarget(sc, u, s, avg) {
      const foes = sc.alive('enemy');
      const F = sc.__fight || {};
      let best = null, bv = -1;
      for (const f of foes) {
        let v = expDmg(sc, u, s, f, avg);
        if (v <= 0) continue;
        if (F.focus && F.focus.includes(f.id)) v *= 3;
        if (F.avoid && F.avoid.includes(f.id)) v *= 0.2;
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
    const healAmt = (u, s, avg) => ((s.power || 1) * (avg ? avg.mag : eff(u, 'mag')) * 1.2 + (s.power || 1) * 10) * (hasSp(u, 'healUp') ? 1.25 : 1);
    const knownSkills = (u) => ((u.m && u.m.skills) || []).filter((id) => SK()[id] && !SK()[id].combo && !SK()[id].hidden && SK()[id].type !== 'passive');
    const canCast = (u, id) => !u.st.seal && (SK()[id].mp || 0) <= u.mp;
    const invList = (f) => G.Inv.list((it) => it.type === 'use' && it.use && it.use.battle !== false && f(it.use, it));
    const healItems = () => invList((x) => (x.heal || x.healPct) && !x.revive && (x.target || 'ally') !== 'enemy');
    const itemHeal = (id, tg) => { const x = IT()[id].use; return (x.heal || 0) + (x.healPct ? x.healPct * tg.mhp : 0); };
    const healerOf = (sc) => {
      for (const id of ['baizhi', 'yungui', 'xinghe', 'hongying']) {
        const p = sc.party.find((q) => q.id === id && !q.dead && !q.st.sleep && !q.st.stun && !q.st.seal);
        if (p && knownSkills(p).some((k) => SK()[k].type === 'heal' && canCast(p, k))) return p;
      }
      return null;
    };
    const nextEnemyWait = (sc) => Math.min(...sc.alive('enemy').map((e) => e.wait), 1e9);
    const turnLen = (u) => 100 * 40 / (eff(u, 'spd') + 40);
    // a big enemy attack is telegraphed (wind-up skill, a 「！」 charge flag, or an on-screen warning)
    function telegraph(sc) {
      for (const e of sc.alive('enemy')) {
        for (const k in e) if (/charge|gather|windup|telegraph/i.test(k) && e[k] === true) return e;
        const c = sc.__last && sc.__last.get(e);
        const s = c && c.skill && SK()[c.skill];
        if (s && s.type === 'special' && s.target === 'self' && !s.summon && !s.outcomes) return e;
      }
      if (sc.msg && (sc.__acts || 0) - (sc.__msgAt || 0) <= 2 && /伏低|防禦|穩住|蓄力|要來了|快躲/.test(sc.msg.text || '')) return true;
      return null;
    }

    function useItem(sc, u, id, tg) { return { kind: 'item', item: id, targets: [tg] }; }

    return function smart(sc, u) {
      if (mode === 'auto') return sc.autoCommand(u);
      const F = sc.__fight || {};
      const party = sc.party, alive = sc.alive('party'), dead = party.filter((p) => p.dead), foes = sc.alive('enemy');
      if (!foes.length) return { kind: 'defend' };
      const skills = knownSkills(u);
      const usable = skills.filter((k) => !SK()[k].ultimate && canCast(u, k));
      const healer = healerOf(sc);
      const iAmHealer = healer === u;
      const hurt = alive.filter((p) => pct(p) < 0.55);
      const boss = !!sc.troop.boss || foes.some((e) => e.boss);
      const bossE = foes.filter((e) => isMain(sc, e))[0] || foes[0];
      const nearlyDone = foes.every((e) => e.hp < e.mhp * 0.08 || (e.endAt && e.hp < e.mhp * (e.endAt + 0.05)));

      // 1. ultimate
      if (u.gauge >= 100 && !u.st.seal) {
        const ults = [];
        const main = G.Data.chars[u.id] && G.Data.chars[u.id].ultimate;
        if (main && SK()[main]) ults.push(main);
        for (const k of skills) if (SK()[k].ultimate && !ults.includes(k)) ults.push(k);
        let best = null, bv = 0;
        for (const k of ults) {
          const s = SK()[k];
          let v;
          if (s.type === 'heal') v = (dead.length || hurt.length >= 2) ? 1e9 : -1;
          else v = expDmg(sc, u, s, pickTarget(sc, u, s));
          if (v > bv) { bv = v; best = k; }
        }
        if (best) return cmdFor(sc, u, best, 'ultimate');
      }
      // 2. revive
      if (dead.length && !nearlyDone) {
        const rev = usable.filter((k) => SK()[k].type === 'revive' || (SK()[k].revive && SK()[k].type === 'heal')).sort((a, b) => (SK()[b].power || 0) - (SK()[a].power || 0))[0];
        if (rev) return cmdFor(sc, u, rev, null, dead[0]);
        const reviverAlive = alive.some((p) => p !== u && knownSkills(p).some((k) => SK()[k].type === 'revive' && canCast(p, k)) && !p.st.sleep && !p.st.stun);
        const ri = invList((x) => x.revive)[0];
        if (ri && !reviverAlive) return useItem(sc, u, ri, dead[0]);
      }
      // 3. heal
      const healSk = usable.filter((k) => SK()[k].type === 'heal' && !SK()[k].ultimate);
      if (healSk.length && (iAmHealer || alive.some((p) => pct(p) < 0.3))) {
        const allH = healSk.filter((k) => SK()[k].target === 'allies').sort((a, b) => SK()[b].power - SK()[a].power);
        const oneH = healSk.filter((k) => SK()[k].target === 'ally').sort((a, b) => SK()[a].power - SK()[b].power);
        const worst = alive.slice().sort((a, b) => pct(a) - pct(b))[0];
        if (alive.filter((p) => pct(p) < 0.6).length >= 2 && allH.length) return cmdFor(sc, u, allH[0]);
        if (pct(worst) < 0.45) {
          const need = worst.mhp - worst.hp;
          const k = oneH.find((kk) => healAmt(u, SK()[kk]) >= need * 0.8) || oneH[oneH.length - 1] || allH[0];
          if (k) return cmdFor(sc, u, k, null, worst);
        }
      }
      // 4. heal items: someone in danger and the healer cannot cover it before the enemies act
      const crit = alive.filter((p) => pct(p) < 0.32).sort((a, b) => pct(a) - pct(b));
      if (crit.length) {
        const healerSoon = healer && healer !== u && healer.wait < nextEnemyWait(sc) && crit.length === 1;
        if (!healerSoon) {
          const hi = healItems();
          if (hi.length) {
            const t = crit[0], need = t.mhp - t.hp;
            const id = hi.slice().sort((a, b) => itemHeal(a, t) - itemHeal(b, t)).find((x) => itemHeal(x, t) >= need * 0.6) || hi[hi.length - 1];
            return useItem(sc, u, id, t);
          }
        }
      }
      // 5. MP for the healer
      if (iAmHealer && u.mp < u.mmp * 0.2) {
        const mi = invList((x) => (x.mp || x.mpPct) && !x.heal)[0] || invList((x) => x.mp || x.mpPct)[0];
        if (mi) return useItem(sc, u, mi, u);
      }
      // 6. cure the healer / a sealed caster / a stunned ally
      const cureSk = usable.find((k) => SK()[k].type === 'cure' || (SK()[k].cure && SK()[k].type !== 'heal'));
      const stuck = alive.find((p) => p !== u && (p.st.sleep > 1 || p.st.stun > 1 || (p.st.seal && p === healer)));
      if (cureSk && stuck) return cmdFor(sc, u, cureSk, null, stuck);
      // 6b. fight-specific play that the battle itself tells the player to do (on-screen hints)
      if (F.tactics) { const c = F.tactics(sc, u, { G, cmdFor: (id, tg) => cmdFor(sc, u, id, null, tg), item: (id, tg) => useItem(sc, u, id, tg), usable, healer, iAmHealer }); if (c) return c; }
      // 7. guard against a telegraphed blow
      const tel = telegraph(sc);
      if (tel && !F.noGuard) {
        const e = tel === true ? null : tel;
        const before = !e || e.wait < turnLen(u) * 1.05;
        if (before && (pct(u) < 0.8 || iAmHealer || tel === true)) return { kind: 'defend' };
      }
      // 8. last stand: nobody can heal and this member would drop
      if (pct(u) < 0.2 && !healer && !healItems().length && alive.length > 1 && !F.noGuard) return { kind: 'defend' };

      // 9. boss openers: buffs / debuffs that are certain to land (data `buffs` skip the status roll)
      if (boss && !u.st.seal && !nearlyDone && !G.__plain) {
        const tryS = (k, cond, tg) => (usable.includes(k) && cond ? cmdFor(sc, u, k, null, tg) : null);
        const anyBossNot = (st) => foes.filter((e) => isMain(sc, e)).some((e) => !e.st[st]);
        const r = tryS('yg_mihun', anyBossNot('atkDown') && bossE.hp > bossE.mhp * 0.25, bossE)
          || tryS('yg_tiangang', anyBossNot('defDown') && bossE.hp > bossE.mhp * 0.3, bossE)
          || tryS('hy_xushi', !u.st.atkUp && bossE.hp > bossE.mhp * 0.2)
          || tryS('bz_yuewu', alive.filter((p) => !p.st.defUp).length >= 2 && u.mp > u.mmp * 0.45)
          || tryS('bz_ganlin', alive.filter((p) => pct(p) < 0.8 && !p.st.regen).length >= 2 && u.mp > u.mmp * 0.4);
        if (r) return r;
      }
      // 10. damage (skills, attack) vs combos
      const atkSk = { name: '攻擊', type: 'phys', power: 1, target: 'enemy', elem: u.elem || null };
      const atkT = pickTarget(sc, u, atkSk);
      const atkVal = expDmg(sc, u, atkSk, atkT);
      const kmp = boss ? atkVal / 30 : atkVal / 8;
      const reserve = iAmHealer ? u.mmp * 0.3 : 0;
      let best = { kind: 'attack', targets: [atkT] }, bv = F.valueMod ? F.valueMod(sc, u, atkSk, atkT, atkVal) : atkVal;
      for (const k of usable) {
        const s = SK()[k];
        if (s.type !== 'phys' && s.type !== 'mag') continue;
        if (u.mp - (s.mp || 0) < reserve) continue;
        const t = s.target === 'enemy' ? pickTarget(sc, u, s) : null;
        let v = expDmg(sc, u, s, t) * (s.delay ? 1 / s.delay : 1) - (s.mp || 0) * kmp;
        if (F.valueMod) v = F.valueMod(sc, u, s, t, v);
        if (s.buffs && s.buffs.some((b) => b.amt < 0) && t && isMain(sc, t)) v *= 1.15;
        if (v > bv) { bv = v; best = cmdFor(sc, u, k, null, t); }
      }
      // cats: roughly an attack, keep for non-boss filler only when nothing better
      if (boss && !u.st.seal) {
        for (const [k, s] of Object.entries(SK())) {
          if (!s.combo || s.combo[0] !== u.id) continue;
          if ((s.req && !G.state.flags[s.req]) || (s.flag && !G.state.flags[s.flag])) continue;
          const mates = s.combo.map((pid) => party.find((p) => p.id === pid));
          if (mates.some((p) => !p || p.dead || p.st.sleep || p.st.stun || p.st.seal || p.mp < (s.mp || 0) || (s.comboLv && p.lv < s.comboLv))) continue;
          const avg = { atk: mates.reduce((a, p) => a + eff(p, 'atk'), 0) / mates.length, mag: mates.reduce((a, p) => a + eff(p, 'mag'), 0) / mates.length };
          let v;
          if (s.type === 'heal') { if (alive.filter((p) => pct(p) < 0.6).length < 2) continue; v = 1e8; }
          else {
            const t = s.target === 'enemy' ? pickTarget(sc, u, s, avg) : null;
            v = expDmg(sc, u, s, t, avg) - bv * mates.length - (s.mp || 0) * kmp * mates.length;
            if (v <= 0) continue;
            return cmdFor(sc, u, k, 'skill', t);
          }
          return cmdFor(sc, u, k, 'skill');
        }
      }
      return best;
    };
  }


  function install(G, opts) {
    const o = Object.assign({ difficulty: 'easy' }, opts || {});
    const P = G.Battle.Scene.prototype;
    if (P.__bbInstalled) return;
    P.__bbInstalled = true;
    instrument(P);
    const ai = makeAI(G, 'smart');
    const orig = P.autoCommand;
    P.autoCommand = function (u) {
      try { return ai(this, u) || orig.call(this, u); } catch (e) { return orig.call(this, u); }
    };
    if (o.difficulty) G.settings.difficulty = o.difficulty;
  }

  const api = { makeAI, instrument, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.ShorelightBattleBot = api;
    const go = () => { if (root.G && root.G.Battle && root.G.Battle.Scene) install(root.G, root.__battleBot); };
    if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go);
    else go();
  }
})(typeof window !== 'undefined' ? window : this);
