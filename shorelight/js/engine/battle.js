// Turn-based battle (CTB timeline), five elements, 劍意 gauge, combos, statuses, boss phases, FX.
'use strict';
G.Battle = (() => {
  const B = {};
  const U = G.U;
  const ELEM_NAMES = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
  const BEATS = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
  const STATUS_INFO = {
    poison: { ch: '毒', c: '#7ad04a' }, seal: { ch: '封', c: '#c06ad8' }, sleep: { ch: '睡', c: '#6a9ad8' },
    stun: { ch: '定', c: '#d8c04a' }, trance: { ch: '幻', c: '#ff6ad5' }, atkUp: { ch: '攻', c: '#ff8a5a', up: 1 },
    atkDown: { ch: '攻', c: '#8a8a8a', up: -1 }, defUp: { ch: '防', c: '#5ab0ff', up: 1 }, defDown: { ch: '防', c: '#8a8a8a', up: -1 },
    magUp: { ch: '法', c: '#c08aff', up: 1 }, magDown: { ch: '法', c: '#8a8a8a', up: -1 }, spdUp: { ch: '速', c: '#5ad8a0', up: 1 },
    spdDown: { ch: '速', c: '#8a8a8a', up: -1 }, regen: { ch: '再', c: '#5ad87a' }, shield: { ch: '盾', c: '#f0d070' },
    guard: { ch: '守', c: '#d8d0b0' },
  };
  B.STATUS_INFO = STATUS_INFO;
  B.elemMult = (atkElem, defElem) => {
    if (!atkElem || !defElem) return 1;
    if (BEATS[atkElem] === defElem) return 1.5;
    if (BEATS[defElem] === atkElem) return 0.7;
    return 1;
  };

  const PARTY_POS = [[930, 395], [1010, 450], [1090, 505], [1170, 560]];
  const ENEMY_POS = {
    1: [[330, 540]],
    2: [[250, 480], [430, 560]],
    3: [[200, 450], [400, 520], [250, 600]],
    4: [[170, 440], [370, 480], [220, 590], [440, 600]],
    5: [[150, 430], [340, 450], [520, 500], [230, 590], [430, 610]],
    6: [[140, 430], [320, 440], [500, 480], [200, 580], [380, 600], [560, 600]],
  };

  // ------------------------------------------------------------------ units
  function partyUnit(m, i) {
    const st = G.Party.stats(m.id);
    const d = G.Data.chars[m.id];
    const [x, y] = PARTY_POS[i];
    return {
      side: 'party', id: m.id, m, name: G.ShortNames[m.id] || d.name, lv: m.lv,
      hp: m.hp, mhp: st.mhp, mp: m.mp, mmp: st.mmp, atk: st.atk, def: st.def, mag: st.mag, spd: st.spd, luk: st.luk,
      elem: st.elem, resist: st.resist, immune: st.immune, specials: st.specials,
      gauge: m.gauge || 0, st: {}, x, y, hx: x, hy: y, ox: 0, oy: 0, alpha: 1, flash: 0, pose: m.hp > 0 ? 'idle' : 'ko', poseT: 0,
      dead: m.hp <= 0, sprite: d.sprite || m.id, wait: 0,
    };
  }
  function enemyUnit(eid, i, n, diff) {
    const d = G.Data.enemies[eid];
    if (!d) throw new Error('Unknown enemy ' + eid);
    const pos = (ENEMY_POS[n] || ENEMY_POS[6])[i] || [300, 520];
    const hpMul = diff === 'easy' ? 0.8 : diff === 'hard' ? 1.3 : 1;
    const big = d.boss && n === 1;
    return {
      side: 'enemy', id: eid, d, name: d.name, lv: d.lv || 1,
      hp: Math.round(d.hp * hpMul), mhp: Math.round(d.hp * hpMul), mp: d.mp || 999, mmp: d.mp || 999,
      atk: d.atk, def: d.def, mag: d.mag, spd: d.spd, luk: d.luk || 5, elem: d.elem, weak: d.weak || [], resist: d.resist || [],
      immune: d.immune || [], st: {}, x: pos[0] + (big ? 20 : 0), y: pos[1], hx: pos[0], hy: pos[1], ox: 0, oy: 0,
      alpha: 1, flash: 0, pose: 'idle', poseT: 0, dead: false, art: d.art, sprite: d.sprite, boss: !!d.boss,
      scale: d.scale || 1, phase: 1, phasesDone: {}, variant: d.variant || 0, wait: 0, endAt: d.endAt,
    };
  }

  function statMul(u, stat) {
    let m = 1;
    if (u.st[stat + 'Up']) m *= 1.3;
    if (u.st[stat + 'Down']) m *= 0.7;
    if (stat === 'mag' && u.st.trance) m *= 1.25;
    return m;
  }
  const eff = (u, k) => u[k] * statMul(u, k);
  const hasSp = (u, id) => !!(u.specials && u.specials.includes(id));

  // ------------------------------------------------------------------ scene
  class BattleScene {
    constructor(troopId, o, resolve) {
      this.opaque = true;
      this.o = o || {};
      this.resolve = resolve;
      this.troop = typeof troopId === 'object' ? troopId : G.Data.troops[troopId];
      if (!this.troop) throw new Error('Unknown troop ' + troopId);
      this.troopId = troopId;
      this.t = 0;
      this.fx = [];
      this.pops = [];
      this.msg = null;
      this.ui = null;
      this.auto = !!G.state.vars.autoBattle || !!(G.Debug && G.Debug.autoplay);
      this.snapshot = G.Render.snapshot();
      this.introT = 0;
      this.diff = G.settings.difficulty;
      const members = G.Party.active().slice();
      // guests: characters who fight in this battle only (o.guests: [charId]); created at the party's average level if new
      for (const gid of this.o.guests || []) {
        if (members.length >= 4 || members.some((m) => m.id === gid)) continue;
        if (!G.state.members[gid]) {
          const avg = members.length ? Math.round(members.reduce((a, m) => a + m.lv, 0) / members.length) : 1;
          G.Party.create(gid, avg);
        }
        members.push(G.state.members[gid]);
      }
      this.party = members.map((m, i) => partyUnit(m, i));
      this.rounds = 0;
      const ens = this.troop.enemies;
      this.enemies = ens.map((e, i) => enemyUnit(e, i, ens.length, this.diff));
      this.bg = this.troop.bg || 'forest';
      if (G.Backdrops.preload) { try { G.Backdrops.preload(this.bg); } catch (e) { G.warnOnce('backdrop ' + this.bg, e); } }
      this.fleeTries = 0;
      this.result = null;
      this.cutin = null;
      this.overlayK = 0;
      this.shakeT = 0;
      this.dim = 0;
      // initial waits
      const mode = this.o.mode;
      for (const u of this.all()) {
        u.wait = 100 * 40 / (eff(u, 'spd') + 40) * U.rand(0.3, 0.9);
        if (mode === 'advantage' && u.side === 'enemy') u.wait += 60;
        if (mode === 'ambush' && u.side === 'party') u.wait += 60;
        if (hasSp(u, 'firstStrike')) u.wait *= 0.3;
      }
      const bgm = this.troop.bgm || (this.troop.boss ? 'boss' : (G.state.chapter >= 7 ? 'battle2' : 'battle'));
      this.prevBgm = G.Music.current;
      G.Music.play(bgm, { fade: 0.3 });
      G.Audio.sfx('encounter');
      this.run();
    }
    all() { return [...this.party, ...this.enemies]; }
    alive(side) { return (side === 'party' ? this.party : this.enemies).filter((u) => !u.dead); }

    wait(sec) { return G.Timers.wait(sec / (G.settings.battleSpeed || 1)); }
    tween(o, p, sec, e) { return G.Tweens.to(o, p, sec / (G.settings.battleSpeed || 1), e); }

    say(text, sec = 1.1) { this.msg = { text, t: 0, life: sec }; }
    banner(text, color) { this.skillBanner = { text, t: 0, color }; }

    // ---------------------------------------------------------------- main loop
    async run() {
      await this.wait(0.9);
      const mode = this.o.mode;
      if (mode === 'advantage') this.say('先制攻擊！', 1.4);
      else if (mode === 'ambush') this.say('遭到偷襲！', 1.4);
      else if (this.troop.boss) this.say(this.enemies[0].name + ' 擋住了去路！', 1.4);
      if (this.o.intro) await this.o.intro(this);
      await this.wait(0.6);
      let turnGuard = 0;
      while (!this.result && turnGuard++ < 5000) {
        const u = this.nextActor();
        if (!u) break;
        if (u === this.party[0]) {
          this.rounds++;
          if (this.o.turnLimit && this.rounds > this.o.turnLimit) { this.result = this.o.turnLimitResult || 'win'; this.scriptedEnd = true; break; }
        }
        this.active = u;
        if (this.o.onTurn) { await this.o.onTurn(this, u); if (this.checkEnd()) break; if (u.dead) continue; }
        const skip = await this.startTurn(u);
        if (this.checkEnd()) break;
        let cmd = null;
        if (!skip && !u.dead) {
          if (u.side === 'party') cmd = await this.playerCommand(u);
          else cmd = this.aiCommand(u);
          if (cmd) await this.execute(u, cmd);
        }
        this.active = null;
        u.wait = 100 * ((cmd && cmd.delay) || 1) * 40 / (eff(u, 'spd') + 40);
        if (cmd && cmd.kind === 'defend') u.wait *= 0.75;
        if (u.side === 'party') u.gauge = Math.min(100, u.gauge + 8 * (hasSp(u, 'gaugeUp') ? 1.5 : 1));
        if (this.checkEnd()) break;
        if (this.floorEvent && this.o.onFloor) { const fe = this.floorEvent; this.floorEvent = null; await this.o.onFloor(this, fe); if (this.checkEnd()) break; }
        await this.checkPhases();
        if (this.checkEnd()) break;
      }
      await this.finish();
    }

    nextActor() {
      const list = this.all().filter((u) => !u.dead);
      if (!list.length) return null;
      let best = list[0];
      for (const u of list) if (u.wait < best.wait) best = u;
      const w = best.wait;
      for (const u of list) u.wait -= w;
      return best;
    }
    // predicted order (for the timeline UI)
    timeline(n = 8) {
      const list = this.all().filter((u) => !u.dead).map((u) => ({ u, w: u.wait }));
      const out = [];
      if (!list.length) return out;
      for (let i = 0; i < n; i++) {
        list.sort((a, b) => a.w - b.w);
        const f = list[0];
        out.push(f.u);
        f.w += 100 * 40 / (eff(f.u, 'spd') + 40);
      }
      return out;
    }

    async startTurn(u) {
      // statuses tick
      const st = u.st;
      let skip = false;
      if (st.guard) delete st.guard;
      if (st.poison) {
        const d = Math.max(1, Math.round(u.mhp * 0.06));
        this.damage(u, d, { color: '#9be86a', noGauge: false });
        await this.wait(0.35);
        if (u.dead) return true;
      }
      if (st.regen || (hasSp(u, 'autoRegen') && u.hp < u.mhp)) {
        const h = Math.round(u.mhp * (st.regen ? 0.08 : 0.05));
        this.healUnit(u, h);
        await this.wait(0.3);
      }
      if (hasSp(u, 'mpRegen') && u.mp < u.mmp) u.mp = Math.min(u.mmp, u.mp + Math.max(1, Math.round(u.mmp * 0.03)));
      u.turns = (u.turns || 0) + 1;
      if (st.sleep) { this.popText(u, '沉睡中…', '#8ab0ff'); skip = true; }
      if (st.stun) { this.popText(u, '定身！', '#ffd84a'); skip = true; }
      for (const k in st) {
        if (k === 'shield') { st.shield.turns--; if (st.shield.turns <= 0) delete st.shield; continue; }
        st[k]--;
        if (st[k] <= 0) delete st[k];
      }
      if (skip) await this.wait(0.6);
      return skip;
    }

    checkEnd() {
      if (this.result) return true;
      if (!this.alive('enemy').length) { this.result = 'win'; return true; }
      for (const e of this.enemies) if (e.endAt && !e.dead && e.hp <= e.mhp * e.endAt) { this.result = 'win'; this.scriptedEnd = true; return true; }
      if (!this.alive('party').length) { this.result = 'lose'; return true; }
      return false;
    }

    async checkPhases() {
      for (const e of this.alive('enemy')) {
        const phases = e.d.phases || [];
        for (let i = 0; i < phases.length; i++) {
          const p = phases[i];
          if (e.phasesDone[i] || e.hp > e.mhp * p.at) continue;
          e.phasesDone[i] = true;
          if (p.lines || p.text) {
            for (const l of p.lines || [['', p.text]]) await G.Dialog.say(l[0], l[1]);
            G.Dialog.close();
          }
          if (p.phase) {
            G.Audio.sfx('dark');
            G.Render.doFlash('#fff', 0.6, 0.9);
            this.shakeT = 0.6;
            e.phase = p.phase;
            if (p.name) e.name = p.name;
            this.say(p.msg || `${e.name} 的力量改變了！`, 1.5);
            await this.wait(1);
          }
          if (p.heal) { e.hp = Math.min(e.mhp, e.hp + Math.round(e.mhp * p.heal)); }
          if (p.buffs) for (const b of p.buffs) this.addStatus(e, b.stat ? b.stat + ((b.amt || 0.3) < 0 ? 'Down' : 'Up') : b.id, b.turns || 4, true);
          if (p.skills) e.d = Object.assign({}, e.d, { skills: p.skills });
          if (p.summon) {
            for (const sid of p.summon) {
              if (this.enemies.filter((x) => !x.dead).length >= 6) break;
              const nu = enemyUnit(sid, this.enemies.length, 6, this.diff);
              nu.alpha = 0; nu.wait = 50;
              this.enemies.push(nu);
              this.tween(nu, { alpha: 1 }, 0.5);
            }
          }
        }
      }
    }

    // ---------------------------------------------------------------- commands
    playerCommand(u) {
      if (this.auto) return Promise.resolve(this.autoCommand(u));
      return new Promise((res) => {
        this.ui = new CommandUI(this, u, (cmd) => { this.ui = null; res(cmd); });
      });
    }

    usableSkills(u) {
      return (u.m.skills || []).map((id) => G.Data.skills[id]).filter((s) => s && !s.combo && !s.ultimate && !s.hidden && s.type !== 'passive')
        .map((s) => s);
    }

    autoCommand(u) {
      const d = G.Data.skills;
      const skills = (u.m.skills || []).filter((id) => d[id] && !d[id].combo && !d[id].ultimate && !d[id].hidden && d[id].type !== 'special' && d[id].mp <= u.mp && !u.st.seal);
      const hurt = this.alive('party').filter((p) => p.hp < p.mhp * 0.4);
      const deadAllies = this.party.filter((p) => p.dead);
      if (u.gauge >= 100 && G.Data.chars[u.id].ultimate) {
        const ult = G.Data.chars[u.id].ultimate;
        if (d[ult]) return this.cmdForSkill(u, ult, null);
      }
      if (deadAllies.length) {
        const rv = skills.find((id) => d[id].type === 'revive');
        if (rv) return { kind: 'skill', skill: rv, targets: [deadAllies[0]] };
      }
      if (hurt.length) {
        const healAll = skills.find((id) => d[id].type === 'heal' && d[id].target === 'allies');
        const heal = skills.find((id) => d[id].type === 'heal');
        if (hurt.length > 1 && healAll) return { kind: 'skill', skill: healAll, targets: this.alive('party') };
        if (heal) return { kind: 'skill', skill: heal, targets: d[heal].target === 'allies' ? this.alive('party') : [hurt.sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0]] };
      }
      const foes = this.alive('enemy');
      // best damaging skill by expected element
      let best = null, bestScore = 1.15;
      if (u.mp > u.mmp * 0.25) {
        for (const id of skills) {
          const s = d[id];
          if (!['phys', 'mag'].includes(s.type)) continue;
          for (const f of foes) {
            const m = this.elemFactor(s.elem, f) * (s.power || 1) * (s.target === 'enemies' ? Math.min(foes.length, 3) * 0.7 : 1) * (s.hits || 1);
            if (m > bestScore) { bestScore = m; best = { id, f }; }
          }
        }
      }
      if (best) {
        const s = d[best.id];
        return { kind: 'skill', skill: best.id, targets: s.target === 'enemies' ? foes : [best.f] };
      }
      const target = foes.sort((a, b) => a.hp - b.hp)[0];
      return { kind: 'attack', targets: [target] };
    }
    cmdForSkill(u, id, target) {
      const s = G.Data.skills[id];
      let targets;
      if (s.target === 'enemies' || s.target === 'random') targets = this.alive('enemy');
      else if (s.target === 'allies') targets = s.revive ? this.party.slice() : this.alive('party'); // revive:true also lifts the fallen
      else if (s.target === 'self') targets = [u];
      else targets = [target || this.alive('enemy')[0]];
      return { kind: s.ultimate ? 'ultimate' : 'skill', skill: id, targets };
    }

    aiCommand(e) {
      const d = e.d;
      const list = (d.skills || []).filter((s) => {
        const sk = G.Data.skills[s.id];
        if (!sk) return s.id === 'attack';
        if (e.st.seal && sk.type !== 'phys') return false;
        if (s.if) {
          const c = String(s.if);
          let m;
          if ((m = /^hp<(\d+)$/.exec(c)) && e.hp > e.mhp * m[1] / 100) return false;
          if ((m = /^hp>(\d+)$/.exec(c)) && e.hp < e.mhp * m[1] / 100) return false;
          if ((m = /^turn>(\d+)$/.exec(c)) && (e.turns || 0) <= +m[1]) return false;
          if (c === 'once' && e.usedOnce && e.usedOnce[s.id]) return false;
          if (c === 'ally_hurt' && !this.alive('enemy').some((x) => x.hp < x.mhp * 0.5)) return false;
          if (c === 'ally_dead' && !this.enemies.some((x) => x.dead)) return false;
          if ((m = /^phase(\d+)$/.exec(c)) && e.phase < +m[1]) return false;
        }
        return true;
      });
      let pickId = 'attack';
      const total = list.reduce((a, s) => a + (s.w || 1), 0);
      if (total > 0 && list.length) {
        let r = Math.random() * total;
        for (const s of list) { r -= (s.w || 1); if (r <= 0) { pickId = s.id; break; } }
      }
      const foes = this.alive('party');
      const pickFoe = () => {
        if (d.smart && Math.random() < 0.6) return foes.slice().sort((a, b) => a.hp - b.hp)[0];
        return U.pick(foes);
      };
      if (pickId === 'attack' || !G.Data.skills[pickId]) return { kind: 'attack', targets: [pickFoe()] };
      e.usedOnce = e.usedOnce || {};
      e.usedOnce[pickId] = true;
      const s = G.Data.skills[pickId];
      let targets;
      switch (s.target) {
        case 'enemies': targets = foes; break;
        case 'random': targets = [pickFoe()]; break;
        case 'allies': targets = this.alive('enemy'); break;
        case 'ally': targets = [this.alive('enemy').sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0]]; break;
        case 'self': targets = [e]; break;
        default: targets = [pickFoe()];
      }
      return { kind: 'skill', skill: pickId, targets };
    }

    // mid-battle roster changes (for story scripts in o.onTurn / o.onFloor)
    addPartyMember(id, lv) {
      if (this.party.some((p) => p.id === id) || this.party.length >= 4) return null;
      if (!G.state.members[id]) G.Party.create(id, lv || 1);
      const u = partyUnit(G.state.members[id], this.party.length);
      if (u.dead) { u.dead = false; u.hp = Math.max(1, Math.round(u.mhp * 0.5)); u.pose = 'idle'; }
      u.alpha = 0; u.wait = 20;
      this.party.push(u);
      this.tween(u, { alpha: 1 }, 0.5);
      G.Audio.sfx('buff');
      return u;
    }
    removePartyMember(id) {
      const u = this.party.find((p) => p.id === id);
      if (!u) return;
      u.m.hp = u.hp; u.m.mp = u.mp; u.m.gauge = Math.round(u.gauge);
      this.party = this.party.filter((p) => p !== u);
      this.party.forEach((p, i) => { [p.hx, p.hy] = PARTY_POS[i]; p.x = p.hx; p.y = p.hy; });
    }
    say2(who, text) { return G.Dialog.say(who, text).then(() => G.Dialog.close()); }

    defaultTargets(u, s) {
      const foes = u.side === 'party' ? this.alive('enemy') : this.alive('party');
      const friends = u.side === 'party' ? this.alive('party') : this.alive('enemy');
      switch (s.target) {
        case 'enemies': case 'random': return foes;
        case 'allies': return s.revive && u.side === 'party' ? this.party.slice() : friends;
        case 'ally': return [friends.slice().sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0]];
        case 'self': return [u];
        case 'deadAlly': { const d = (u.side === 'party' ? this.party : this.enemies).filter((x) => x.dead); return d.length ? [d[0]] : [u]; }
        default: return [U.pick(foes)];
      }
    }
    freeEnemySlot() {
      const slots = ENEMY_POS[6].concat(ENEMY_POS[5]);
      let best = slots[0], bd = -1;
      for (const sl of slots) {
        const d = Math.min(...this.enemies.filter((e) => !e.dead).map((e) => Math.hypot(e.x - sl[0], e.y - sl[1])), 9999);
        if (d > bd) { bd = d; best = sl; }
      }
      return best;
    }

    elemFactor(elem, target) {
      if (!elem) return 1;
      if (target.weak && target.weak.includes(elem)) return 1.5;
      if (target.resist && target.resist.includes(elem)) return 0.5;
      return B.elemMult(elem, target.elem);
    }

    // ---------------------------------------------------------------- execution
    async execute(u, cmd) {
      if (cmd.kind === 'defend') {
        u.st.guard = 1;
        u.pose = 'guard'; u.poseT = 0;
        u.gauge = Math.min(100, (u.gauge || 0) + 10);
        G.Audio.sfx('guard');
        this.popText(u, '防禦', '#d8d0b0');
        await this.wait(0.5);
        return;
      }
      if (cmd.kind === 'flee') { await this.tryFlee(u); return; }
      if (cmd.kind === 'item') { await this.useItem(u, cmd.item, cmd.targets); return; }
      if (cmd.kind === 'attack') {
        const weapon = u.side === 'party' ? (G.Data.chars[u.id].weapon || 'sword') : null;
        const sk = { name: '攻擊', type: 'phys', power: 1, target: 'enemy', fx: weapon === 'spear' ? 'thrust' : 'slash', sfx: weapon === 'spear' ? 'stab' : 'slash', elem: u.elem || null, melee: true, attack: true };
        if (u.side === 'enemy') { sk.fx = u.d.attackFx || 'claw'; sk.sfx = u.d.attackSfx || 'hit'; }
        await this.performSkill(u, sk, cmd.targets, 'attack');
        return;
      }
      const s = G.Data.skills[cmd.skill];
      if (!s) return;
      // costs
      if (cmd.kind === 'ultimate') u.gauge = 0;
      else if (u.side === 'party') u.mp = Math.max(0, u.mp - (s.mp || 0));
      if (s.combo) {
        const ps = s.combo.map((pid) => this.party.find((x) => x.id === pid)).filter(Boolean);
        for (const p of ps) if (p !== u) { p.mp = Math.max(0, p.mp - (s.mp || 0)); p.wait += 100 * 40 / (eff(p, 'spd') + 40); }
        this.comboAvg = { atk: ps.reduce((a, p) => a + eff(p, 'atk'), 0) / ps.length, mag: ps.reduce((a, p) => a + eff(p, 'mag'), 0) / ps.length };
      }
      if ((s.special === 'cats' || s.special === 'tuanzi') && s.outcomes) {
        const tot = s.outcomes.reduce((a, o) => a + (o.w || 1), 0);
        let r = Math.random() * tot, pick = s.outcomes[0];
        for (const o of s.outcomes) { r -= (o.w || 1); if (r <= 0) { pick = o; break; } }
        this.banner(s.name, '#ffe6a8');
        this.fx.push(summonFxIntro(u, pick.cat === 'mochi' ? 'mochi' : 'yuyuan'));
        G.Audio.sfx('magic');
        await this.wait(0.7);
        this.say(pick.text, 2.2);
        await this.wait(1.2);
        const sub = G.Data.skills[pick.skill];
        if (sub) await this.performSkill(u, sub, this.defaultTargets(u, sub), pick.skill);
        return;
      }
      if (s.summon) {
        this.banner(s.name, '#ff9a8a');
        G.Audio.sfx(s.sfx || 'ghost');
        let added = 0;
        for (const sid of s.summon) {
          if (this.enemies.filter((x) => !x.dead).length >= 5 || !G.Data.enemies[sid]) break;
          const nu = enemyUnit(sid, 0, 1, this.diff);
          const slot = this.freeEnemySlot();
          nu.x = nu.hx = slot[0]; nu.y = nu.hy = slot[1];
          nu.alpha = 0; nu.wait = 40;
          this.enemies.push(nu);
          this.tween(nu, { alpha: 1 }, 0.5);
          added++;
        }
        if (!added) this.say('什麼也沒有出現……', 1.2);
        await this.wait(0.8);
        return;
      }
      if (s.type === 'special') {
        this.banner(s.name, u.side === 'enemy' ? '#ff9a8a' : '#ffe6a8');
        if (s.desc && u.side === 'enemy') this.say(s.desc, 1.6);
        if (s.sfx) G.Audio.sfx(s.sfx);
        await this.wait(1.0);
        return;
      }
      await this.performSkill(u, s, cmd.targets, cmd.skill);
      this.comboAvg = null;
      if (s.delay) cmd.delay = s.delay;
    }

    async performSkill(u, s, targets, id) {
      this.curSkillId = id;
      targets = targets.filter(Boolean);
      const isUlt = s.ultimate || (id && id.startsWith('ult'));
      if (!s.attack) this.banner(s.name, u.side === 'enemy' ? '#ff9a8a' : '#ffe6a8');
      if (isUlt || s.combo) await this.cutIn(u, s);
      const type = s.type;
      // retarget dead single targets
      if (targets.length === 1 && targets[0].dead && type !== 'revive') {
        const pool = targets[0].side === 'enemy' ? this.alive('enemy') : this.alive('party');
        if (!pool.length) return;
        targets = [U.pick(pool)];
      }
      if (u.st.trance && Math.random() < 0.15 && targets.length === 1 && targets[0].side !== u.side) {
        targets = [U.pick(this.all().filter((x) => !x.dead))];
        this.popText(u, '幻覺！', '#ff8ae0');
      }
      const melee = (type === 'phys' && (s.melee || s.target === 'enemy') && !s.ranged && targets.length === 1);
      if (melee) {
        const tg = targets[0];
        u.pose = 'ready';
        const dir = u.side === 'party' ? 1 : -1;
        const tx = tg.x + (u.side === 'party' ? 110 : -110) * (tg.side === u.side ? -1 : 1) - u.x;
        await this.tween(u, { ox: tx, oy: tg.y - u.y + 4 }, 0.22, 'outQuad');
        void dir;
      } else {
        u.pose = type === 'phys' ? 'attack' : 'cast'; u.poseT = 0;
        if (type !== 'phys') {
          this.fx.push(castGlow(u, s));
          G.Audio.sfx(s.castSfx || 'magic');
          await this.wait(0.4);
        }
      }
      const hits = s.hits || 1;
      for (let h = 0; h < hits; h++) {
        u.pose = type === 'phys' ? 'attack' : 'cast'; u.poseT = 0;
        const tgs = s.target === 'random' ? [U.pick(this.alive(targets[0] ? targets[0].side : 'enemy'))].filter(Boolean) : targets;
        await this.playFx(s.fx || (type === 'phys' ? 'slash' : 'magic'), u, tgs, s);
        if (s.sfx) G.Audio.sfx(s.sfx);
        for (const tg of tgs) this.applyEffect(u, tg, s, hits);
        await this.wait(hits > 1 ? 0.18 : 0.42);
      }
      if (melee) {
        u.pose = 'idle';
        await this.tween(u, { ox: 0, oy: 0 }, 0.22, 'inOutQuad');
      }
      u.pose = u.dead ? 'ko' : 'idle';
      await this.wait(0.2);
    }

    applyEffect(u, tg, s, hits) {
      const type = s.type;
      if (type === 'phys' || type === 'mag') {
        if (tg.dead) return;
        // hit check (physical)
        if (type === 'phys') {
          const hit = 0.95 - (eff(tg, 'spd') - eff(u, 'spd')) / 400;
          if (Math.random() > U.clamp(hit, 0.6, 0.99)) { this.popText(tg, '閃避', '#c8d8ff'); G.Audio.sfx('miss'); return; }
        }
        let dmg;
        const power = s.power || 1;
        const uAtk = this.comboAvg ? this.comboAvg.atk : eff(u, 'atk');
        const uMag = this.comboAvg ? this.comboAvg.mag : eff(u, 'mag');
        if (type === 'phys') dmg = power * uAtk * 2 * 50 / (50 + eff(tg, 'def'));
        else dmg = power * uMag * 2 * 50 / (50 + (eff(tg, 'def') * 0.3 + eff(tg, 'mag') * 0.7));
        dmg *= U.rand(0.9, 1.1);
        const elem = s.elem || (s.attack && u.side === 'party' ? null : null);
        const em = this.elemFactor(elem, tg);
        dmg *= em;
        let crit = false;
        const critChance = 0.05 + (u.luk || 0) / 500 + (u.st.trance ? 0.3 : 0) + (s.crit || 0) + (hasSp(u, 'critUp') ? 0.12 : 0);
        if (type === 'phys' && Math.random() < critChance) { crit = true; dmg *= 1.5; }
        if (tg.st.guard) dmg *= 0.5;
        if (u.side === 'enemy') dmg *= this.diff === 'easy' ? 0.6 : this.diff === 'hard' ? 1.25 : 1;
        if (tg.side === 'party' && tg.resist && elem && tg.resist.includes(elem)) dmg *= 0.6;
        dmg = Math.max(1, Math.round(dmg));
        this.damage(tg, dmg, { crit, weak: em > 1.2, resist: em < 0.9, elem, attacker: u, skillId: s.id || this.curSkillId });
        if (s.drain) this.healUnit(u, Math.round(dmg * s.drain));
        if (u.side === 'party') u.gauge = Math.min(100, u.gauge + 2);
      }
      if (type === 'heal' || s.heal) {
        const mg = this.comboAvg ? this.comboAvg.mag : eff(u, 'mag');
        const amt = Math.round(((s.power || 1) * mg * 1.2 + (s.power || 1) * 10) * (hasSp(u, 'healUp') ? 1.25 : 1));
        if (tg.dead && s.revive) { this.revive(tg, 0); tg.hp = Math.min(tg.mhp, amt); }
        else if (!tg.dead) this.healUnit(tg, amt);
      }
      if (type === 'revive') {
        if (tg.dead) this.revive(tg, s.power || 0.5);
        else this.healUnit(tg, Math.round(tg.mhp * 0.3));
      }
      if (s.cure) for (const c of s.cure) delete tg.st[c];
      if (type === 'cure' && !s.cure) for (const c of ['poison', 'seal', 'sleep', 'stun', 'atkDown', 'defDown', 'magDown', 'spdDown']) delete tg.st[c];
      if (s.status && !tg.dead) {
        const ch = s.status.chance == null ? 1 : s.status.chance;
        const resistK = tg.boss ? 0.35 : 1;
        if (!(tg.immune || []).includes(s.status.id) && Math.random() < ch * resistK) {
          this.addStatus(tg, s.status.id, s.status.turns || 3);
        } else if (type !== 'phys' && type !== 'mag') this.popText(tg, '無效', '#aaaaaa');
      }
      if (s.buffs && !tg.dead) for (const b of s.buffs) {
        const id = b.stat ? b.stat + (b.amt < 0 ? 'Down' : 'Up') : b.id;
        this.addStatus(tg, id, b.turns || 4);
      }
      if (s.shield && !tg.dead) {
        tg.st.shield = { turns: 4, amt: Math.round((s.shield || 1) * eff(u, 'mag') * 2 + 20) };
        this.popText(tg, '護盾', '#f0d070');
      }
      if (s.invert && !tg.dead) {
        // turn every positive buff on the target into its negative counterpart
        for (const k of Object.keys(tg.st)) if (k.endsWith('Up')) { const t2 = tg.st[k]; delete tg.st[k]; tg.st[k.replace('Up', 'Down')] = t2; }
        this.popText(tg, '反轉！', '#c08aff');
      }
      if (s.mpHeal && !tg.dead) { tg.mp = Math.min(tg.mmp, tg.mp + s.mpHeal); this.popText(tg, '+' + s.mpHeal + ' MP', '#8ac8ff'); }
      if (s.gaugeUp && tg.side === 'party') tg.gauge = Math.min(100, tg.gauge + s.gaugeUp);
    }

    addStatus(tg, id, turns, silent) {
      if (!STATUS_INFO[id]) return;
      // opposite buffs cancel
      const opp = id.endsWith('Up') ? id.replace('Up', 'Down') : id.endsWith('Down') ? id.replace('Down', 'Up') : null;
      if (opp && tg.st[opp]) { delete tg.st[opp]; }
      else tg.st[id] = Math.max(tg.st[id] || 0, turns);
      if (!silent) {
        const info = STATUS_INFO[id];
        const names = { poison: '中毒', seal: '封印', sleep: '沉睡', stun: '定身', trance: '幻境', regen: '再生', shield: '護盾', guard: '防禦' };
        const label = names[id] || (info.ch + (info.up > 0 ? '↑' : '↓'));
        this.popText(tg, label, info.c);
        G.Audio.sfx(info.up > 0 || id === 'regen' ? 'buff' : id === 'poison' ? 'poison' : 'debuff');
      }
    }

    damage(tg, dmg, o = {}) {
      if (tg.st.shield) {
        const ab = Math.min(dmg, tg.st.shield.amt);
        tg.st.shield.amt -= ab; dmg -= ab;
        if (tg.st.shield.amt <= 0) delete tg.st.shield;
        if (ab > 0) this.popText(tg, '吸收 ' + ab, '#f0d070');
        if (dmg <= 0) return;
      }
      tg.hp = Math.max(0, tg.hp - dmg);
      // HP floor: some story bosses cannot fall until a finisher skill lands (o.hpFloor: {enemyId: fraction}, o.finishers: [skillIds])
      const floorK = tg.side === 'enemy' && this.o.hpFloor && this.o.hpFloor[tg.id];
      if (floorK != null && !(o.skillId && (this.o.finishers || []).includes(o.skillId))) {
        tg.hp = Math.max(tg.hp, Math.ceil(tg.mhp * floorK));
        if (tg.hp <= Math.ceil(tg.mhp * floorK) && !tg.floorHit) { tg.floorHit = true; if (this.o.onFloor) this.floorEvent = tg; }
      }
      tg.flash = 1;
      tg.pose = 'hurt'; tg.poseT = 0;
      if (tg.st.sleep) delete tg.st.sleep;
      const n = { x: tg.x + U.rand(-14, 14), y: tg.y - this.unitH(tg) * 0.6, text: String(dmg), t: 0, color: o.color || (tg.side === 'party' ? '#ff9a8a' : '#fff4dc'), size: o.crit ? 46 : 36, crit: o.crit };
      this.pops.push(n);
      if (o.weak) this.popText(tg, '弱點！', '#ffd84a', -40);
      if (o.resist) this.popText(tg, '抵抗', '#a8b8c8', -40);
      if (o.crit) { this.popText(tg, '暴擊！', '#ffcf4a', -70); this.shakeT = 0.25; G.Audio.sfx('crit'); }
      else G.Audio.sfx('hit');
      if (tg.side === 'party' && !o.noGauge) tg.gauge = Math.min(100, tg.gauge + dmg / tg.mhp * 80 * (hasSp(tg, 'gaugeUp') ? 1.5 : 1));
      if (tg.hp <= 0) this.kill(tg);
      else setTimeout(() => { if (!tg.dead && tg.pose === 'hurt') tg.pose = 'idle'; }, 400);
    }
    healUnit(tg, amt) {
      if (tg.dead) return;
      tg.hp = Math.min(tg.mhp, tg.hp + amt);
      this.pops.push({ x: tg.x, y: tg.y - this.unitH(tg) * 0.6, text: '+' + amt, t: 0, color: '#8af08a', size: 34 });
    }
    revive(tg, frac) {
      tg.dead = false;
      tg.hp = Math.max(1, Math.round(tg.mhp * frac));
      tg.pose = 'idle'; tg.alpha = 1;
      tg.wait = 40;
      G.Audio.sfx('heal');
      this.popText(tg, '復活！', '#ffe8a0');
    }
    kill(u) {
      u.dead = true;
      u.st = {};
      if (u.side === 'enemy') {
        G.Audio.sfx('death');
        G.state.bestiary[u.id] = (G.state.bestiary[u.id] || 0) + 1;
        this.fx.push(new G.FX.Burst({ x: u.x, y: u.y - this.unitH(u) * 0.5, n: 30, color: ['#c8d8ff', '#ffffff', '#a0b0ff'], speed: 180, life: 1.1, jitter: 30 }));
        this.tween(u, { alpha: 0 }, 0.8, 'linear');
      } else {
        u.pose = 'ko';
        u.gauge = 0;
        this.popText(u, '倒下了', '#ff8a7a', -40);
      }
    }
    unitH(u) {
      if (u.side === 'party') return 150;
      const md = u.art && G.Monsters.get(u.art);
      return ((md && md.h) || 160) * (u.scale || 1);
    }
    popText(u, text, color, dy = 0) {
      this.pops.push({ x: u.x, y: u.y - this.unitH(u) - 10 + dy, text, t: 0, color, size: 24, label: true });
    }

    async useItem(u, itemId, targets) {
      const it = G.Data.items[itemId];
      if (!it || !it.use) return;
      G.Inv.remove(itemId, 1);
      this.banner(it.name, '#c8ffd8');
      u.pose = 'item'; u.poseT = 0;
      await this.wait(0.3);
      const use = it.use;
      for (const tg of targets) {
        if (use.revive) { if (tg.dead) this.revive(tg, use.revive); }
        if (tg.dead) continue;
        if (use.heal) this.healUnit(tg, use.heal);
        if (use.healPct) this.healUnit(tg, Math.round(tg.mhp * use.healPct));
        if (use.mp) { tg.mp = Math.min(tg.mmp, tg.mp + use.mp); this.popText(tg, '+' + use.mp + ' MP', '#8ac8ff', 20); }
        if (use.mpPct) { const v = Math.round(tg.mmp * use.mpPct); tg.mp = Math.min(tg.mmp, tg.mp + v); this.popText(tg, '+' + v + ' MP', '#8ac8ff', 20); }
        if (use.cure) for (const c of use.cure) delete tg.st[c];
        if (use.gauge) tg.gauge = Math.min(100, (tg.gauge || 0) + use.gauge);
        if (use.status) this.addStatus(tg, use.status.id || use.status, use.status.turns || 4);
        if (use.buffs) for (const b of use.buffs) this.addStatus(tg, b.stat ? b.stat + (b.amt < 0 ? 'Down' : 'Up') : b.id, b.turns || 4);
        if (use.damage) {
          const em = this.elemFactor(use.elem, tg);
          this.damage(tg, Math.round(use.damage * em * U.rand(0.9, 1.1)), { elem: use.elem, weak: em > 1.2 });
        }
      }
      const fxId = use.damage ? (use.elem || 'fire') : (use.revive ? 'revive' : 'heal');
      await this.playFx(fxId, u, targets.filter((x) => !x.dead || use.revive), { elem: use.elem });
      G.Audio.sfx(use.damage ? 'fire' : 'heal');
      await this.wait(0.4);
      u.pose = 'idle';
    }

    async tryFlee(u) {
      if (this.troop.flee === false || this.troop.boss) {
        this.say('無法逃跑！', 1.2);
        G.Audio.sfx('buzz');
        await this.wait(0.8);
        return;
      }
      this.fleeTries++;
      const ps = this.alive('party').reduce((a, x) => a + eff(x, 'spd'), 0) / Math.max(1, this.alive('party').length);
      const es = this.alive('enemy').reduce((a, x) => a + eff(x, 'spd'), 0) / Math.max(1, this.alive('enemy').length);
      const chance = U.clamp(0.55 + (ps - es) / 100 + this.fleeTries * 0.15, 0.2, 0.95);
      G.Audio.sfx('flee');
      if (Math.random() < chance) {
        this.say('順利逃脫了！', 1);
        for (const p of this.alive('party')) this.tween(p, { ox: 300 }, 0.5, 'inQuad');
        await this.wait(0.8);
        this.result = 'flee';
      } else {
        this.say('沒能逃掉！', 1);
        await this.wait(0.8);
      }
    }

    // ---------------------------------------------------------------- FX
    async cutIn(u, s) {
      if (u.side !== 'party') return;
      this.cutin = { u, s, t: 0, partner: s.combo ? s.combo.find((x) => x !== u.id) : null };
      G.Audio.sfx('ultimate');
      await this.wait(1.25);
      this.cutin = null;
    }

    playFx(id, u, targets, s) {
      const add = (f) => this.fx.push(f);
      const center = (tg) => [tg.x, tg.y - this.unitH(tg) * 0.5];
      const elemColor = {
        fire: ['#ffd27a', '#ff8a3a', '#ff4a2a'], water: ['#c8ecff', '#6ab8ff', '#3a7ad8'], wood: ['#f0ffb0', '#b0ff6a', '#ffffff'],
        metal: ['#fff6c8', '#f0d070', '#ffffff'], earth: ['#e8c890', '#b08048', '#7a5a30'], wind: ['#e8fff4', '#a8f0d8', '#ffffff'],
        dark: ['#c08aff', '#6a3ab8', '#2a1a4a'], ghost: ['#c8e8ff', '#8ab0ff', '#ffffff'], heal: ['#c8ffc8', '#7af08a', '#fff8c0'],
        lantern: ['#ffe0a0', '#ffb050', '#ff7a3a'],
      };
      const base = id.replace(/_big|_multi/, '');
      const big = id.includes('_big') || id.startsWith('ultimate') || id === 'combo';
      const colors = elemColor[base] || elemColor[(s && s.elem)] || ['#ffffff', '#ffe0a0', '#ffd080'];
      switch (base) {
        case 'slash': case 'claw': case 'bite': case 'thrust': {
          for (const tg of targets) {
            const [x, y] = center(tg);
            add(slashFx(x, y, base, u.side === 'party' ? -1 : 1, s && s.elem ? elemColor[s.elem] : null, id.includes('multi')));
            add(new G.FX.Burst({ x, y, n: 16, color: (s && s.elem && elemColor[s.elem]) || ['#fff4d0', '#ffd080'], speed: 320, life: 0.5, r: 4, shape: 'shard' }));
          }
          break;
        }
        case 'heal': case 'revive': case 'buff': case 'cure': {
          for (const tg of targets) {
            const [x, y] = center(tg);
            add(riseFx(x, y + 50, base === 'buff' ? ['#ffe6a0', '#ffd080', '#ffffff'] : elemColor.heal, base === 'revive'));
          }
          break;
        }
        case 'debuff': case 'poison': case 'sleep': case 'seal': case 'stun': {
          const cc = { debuff: ['#a08aff', '#6a5ab8'], poison: ['#9be86a', '#4a8a2a'], sleep: ['#a8c8ff', '#ffffff'], seal: ['#d8a0ff', '#8a4ab8'], stun: ['#ffe86a', '#ffffff'] }[base];
          for (const tg of targets) { const [x, y] = center(tg); add(new G.FX.Burst({ x, y, n: 20, color: cc, speed: 90, life: 0.9, r: 5, gravity: base === 'debuff' ? 120 : -60, drag: 1 })); }
          break;
        }
        case 'song': {
          for (const tg of targets) { const [x, y] = center(tg); add(noteFx(x, y)); }
          add(new G.FX.Burst({ x: u.x, y: u.y - 80, n: 20, color: ['#c8f0ff', '#fff'], speed: 100, life: 1.2, gravity: -40 }));
          break;
        }
        case 'kaleido': {
          this.overlayK = 1.4;
          for (const tg of targets) { const [x, y] = center(tg); add(new G.FX.Burst({ x, y, n: 40, color: ['#ff6ad5', '#7af0ff', '#b6ff6a', '#ffd06a'], speed: 300, life: 1, shape: 'shard' })); }
          break;
        }
        case 'summon': {
          add(summonFx(this, u, targets));
          break;
        }
        case 'beam': {
          for (const tg of targets) add(beamFx(u.x, u.y - 80, ...center(tg), colors));
          break;
        }
        default: {
          // elemental magic (fire, water, wood, metal, earth, wind, dark, ghost, lantern, magic, ultimate*, combo)
          const ult = id.startsWith('ultimate') || id === 'combo';
          if (ult) { this.dim = 1; this.shakeT = 0.8; G.Render.doFlash('#fff8e0', 0.5, 0.7); }
          for (const tg of targets) {
            const [x, y] = center(tg);
            add(elementFx(base.startsWith('ultimate') ? (u.side === 'party' ? (G.Data.chars[u.id] && G.Data.chars[u.id].elem) || 'fire' : 'dark') : base, x, y, big, colors));
          }
          if (big) this.shakeT = Math.max(this.shakeT, 0.4);
          if (base === 'wood' || base === 'earth') this.shakeT = Math.max(this.shakeT, 0.3);
        }
      }
      return this.wait(big ? 0.55 : 0.32);
    }

    // ---------------------------------------------------------------- finish
    async finish() {
      this.ui = null;
      const r = this.result || 'lose';
      // write back party state
      const writeBack = () => {
        for (const p of this.party) {
          p.m.hp = p.dead ? 0 : p.hp;
          p.m.mp = p.mp;
          p.m.gauge = Math.round(p.gauge);
        }
      };
      if (r === 'win') {
        writeBack();
        for (const p of this.party) if (p.dead) { p.m.hp = 1; }
        if (!this.scriptedEnd || this.o.rewards) await this.victory();
        else await this.wait(0.8);
      } else if (r === 'flee') {
        writeBack();
        for (const p of this.party) if (p.dead) p.m.hp = 1;
      } else {
        if (this.o.loseOk) {
          writeBack();
          for (const p of this.party) p.m.hp = Math.max(1, p.m.hp);
        }
      }
      G.state.battles++;
      if (r === 'lose' && !this.o.loseOk) {
        G.Music.play('gameover', { loop: false });
        await G.Render.fadeTo(1, 1.2, '#000');
        G.Scenes.pop(this);
        G.Scenes.push(new G.GameOverScene(this.troopId, this.o, this.stateBefore, this.resolve));
        await G.Render.fadeTo(0, 0.8);
        return;
      }
      await G.Render.fadeTo(1, 0.45, '#000');
      G.Scenes.pop(this);
      // bgmAfter: null = silence after the fight (scripted beat follows)
      if (this.o.bgmAfter === null) G.Music.stop(0.6);
      else if (this.o.bgmAfter !== undefined) G.Music.play(this.o.bgmAfter);
      else if (this.prevBgm && this.prevBgm !== 'victory') G.Music.play(this.prevBgm, { fade: 0.6 });
      else if (G.mapScene) { const b = G.Mapx.val(G.mapScene.def.bgm); if (b) G.Music.play(b); else G.Music.stop(0.6); }
      await G.Render.fadeTo(0, 0.45);
      this.resolve(r);
    }

    async victory() {
      G.Music.play('victory', { loop: false });
      for (const p of this.alive('party')) { p.pose = 'victory'; p.poseT = 0; }
      const diffK = this.diff === 'easy' ? 1.2 : this.diff === 'hard' ? 0.9 : 1;
      let exp = 0, gold = 0;
      const drops = [];
      for (const e of this.enemies) {
        exp += e.d.exp || 0;
        gold += e.d.gold || 0;
        for (const dr of e.d.drops || []) if (Math.random() < dr.rate) drops.push(dr.item);
      }
      exp = Math.round(exp * diffK * (this.party.some((p) => !p.dead && hasSp(p, 'expUp')) ? 1.2 : 1));
      gold = Math.round(gold * (this.party.some((p) => !p.dead && hasSp(p, 'goldUp')) ? 1.3 : 1));
      G.state.gold += gold;
      for (const d of drops) G.Inv.add(d, 1);
      const ups = G.Party.gainExp(exp);
      this.vic = { exp, gold, drops, ups, t: 0, page: 0 };
      await this.waitKey(0.8);
      if (ups.length) {
        G.Audio.sfx('levelup');
        this.vic.page = 1;
        // refresh unit stats after level up
        for (const p of this.party) {
          const st = G.Party.stats(p.id);
          p.mhp = st.mhp; p.mmp = st.mmp; p.hp = p.m.hp; p.mp = p.m.mp;
        }
        await this.waitKey(0.6);
      }
    }
    waitKey(minT) {
      return new Promise((res) => { this.keyWait = { res, t: 0, min: minT }; });
    }

    // ---------------------------------------------------------------- update/draw
    update(dt) {
      const sp = G.settings.battleSpeed || 1;
      this.t += dt;
      this.introT += dt;
      if (this.msg) { this.msg.t += dt; if (this.msg.t > this.msg.life) this.msg = null; }
      if (this.skillBanner) { this.skillBanner.t += dt * sp; if (this.skillBanner.t > 1.4) this.skillBanner = null; }
      if (this.cutin) this.cutin.t += dt * sp;
      if (this.overlayK > 0) this.overlayK -= dt * 1.2;
      if (this.dim > 0) this.dim -= dt * 0.9;
      if (this.shakeT > 0) this.shakeT -= dt;
      for (const u of this.all()) {
        u.poseT += dt; u.flash = Math.max(0, u.flash - dt * 4);
        if (u.pose === 'hurt' && u.poseT > 0.45 && !u.dead) u.pose = 'idle';
      }
      this.fx = this.fx.filter((f) => f.update(dt * sp));
      for (const p of this.pops) p.t += dt;
      this.pops = this.pops.filter((p) => p.t < (p.label ? 1.1 : 1.0));
      if (G.Input.pressed('auto')) {
        this.auto = !this.auto;
        G.state.vars.autoBattle = this.auto;
        G.UI.toast(this.auto ? '自動戰鬥：開' : '自動戰鬥：關');
      }
      if (G.Input.pressed('pgdn') && !this.ui) {
        const speeds = [1, 1.5, 2, 3];
        const i = (speeds.indexOf(G.settings.battleSpeed) + 1) % speeds.length;
        G.settings.battleSpeed = speeds[i]; G.saveSettings();
        G.UI.toast('戰鬥速度 ×' + speeds[i]);
      }
      if (this.keyWait) {
        this.keyWait.t += dt;
        if (this.vic) this.vic.t += dt;
        if (this.keyWait.t > this.keyWait.min && (G.Input.pressed('ok') || G.Input.clicked() || G.Input.held('skip') || (G.Debug && G.Debug.autoplay))) {
          const r = this.keyWait.res; this.keyWait = null; r();
        }
      }
      if (this.ui) this.ui.update(dt);
    }

    draw(ctx) {
      const t = this.t;
      ctx.save();
      if (this.shakeT > 0) ctx.translate(U.rand(-6, 6) * Math.min(1, this.shakeT * 3), U.rand(-4, 4) * Math.min(1, this.shakeT * 3));
      G.Backdrops.draw(ctx, this.bg, t);
      if (this.dim > 0) { ctx.fillStyle = `rgba(0,0,8,${Math.min(0.6, this.dim * 0.6)})`; ctx.fillRect(-20, -20, G.W + 40, G.H + 40); }
      // units sorted by y
      const units = this.all().slice().sort((a, b) => (a.y + a.oy) - (b.y + b.oy));
      for (const u of units) this.drawUnit(ctx, u, t);
      for (const f of this.fx) f.draw(ctx);
      // target cursor
      if (this.ui) this.ui.drawWorld(ctx, t);
      // popups
      for (const p of this.pops) {
        const k = p.t / (p.label ? 1.1 : 1.0);
        const y = p.y - (p.label ? 30 * k : 50 * U.ease.outCubic(Math.min(1, k * 2)) - (k > 0.6 ? 0 : 0));
        const sc = p.crit ? 1 + 0.4 * Math.max(0, 1 - p.t * 6) : 1 + 0.25 * Math.max(0, 1 - p.t * 8);
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - k) * 3);
        ctx.translate(p.x, y); ctx.scale(sc, sc);
        G.Render.text(ctx, p.text, 0, 0, { size: p.size, bold: true, align: 'center', baseline: 'middle', color: p.color, stroke: 'rgba(20,10,10,0.85)', strokeW: p.label ? 4 : 6 });
        ctx.restore();
      }
      ctx.restore();
      if (this.overlayK > 0) G.FX.vision(ctx, t, Math.min(1, this.overlayK));
      G.FX.vignette(ctx, 0.35);
      this.drawHud(ctx, t);
      if (this.cutin) this.drawCutin(ctx, t);
      if (this.msg) {
        const a = Math.min(1, this.msg.t * 6, (this.msg.life - this.msg.t) * 5);
        ctx.save(); ctx.globalAlpha = Math.max(0, a);
        const mt = G.Render.fit(ctx, this.msg.text, G.W - 160, { size: 30 });
        const w = Math.max(520, mt.w + 200);
        const g = ctx.createLinearGradient(G.W / 2 - w / 2, 0, G.W / 2 + w / 2, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(G.W / 2 - w / 2, 236, w, 56);
        G.Render.text(ctx, mt.str, G.W / 2, 248 + (30 - mt.size) / 2, { size: mt.size, align: 'center', color: '#fff0d0' });
        ctx.restore();
      }
      if (this.vic) this.drawVictory(ctx, t);
      // intro transition: shattered snapshot
      if (this.introT < 0.9) this.drawIntro(ctx, this.introT);
    }

    drawUnit(ctx, u, t) {
      if (u.alpha <= 0.01) return;
      const x = u.x + u.ox, y = u.y + u.oy;
      ctx.save();
      ctx.globalAlpha = u.alpha;
      // shadow
      const sw = u.side === 'party' ? 40 : Math.min(140, (this.unitH(u) * 0.35));
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(x, y, sw, sw * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      // active highlight ring
      if (this.active === u && !this.result) {
        ctx.strokeStyle = `rgba(255,220,140,${0.5 + 0.3 * Math.sin(t * 6)})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(x, y, sw + 10, (sw + 10) * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      }
      const drawBody = (c) => {
        if (u.side === 'party' || u.sprite) {
          let ok = false;
          if (G.Sprites && G.Sprites.has(u.sprite)) {
            try { G.Sprites.drawBattle(c, u.sprite, u.dead && u.side === 'party' ? 'ko' : u.pose, t + (u.hx || 0), x, y, { flip: u.side === 'enemy', shadow: false }); ok = true; } catch (e) { G.warnOnce('sprite ' + u.sprite, e); }
          }
          if (!ok) { c.fillStyle = '#4a6ab8'; c.fillRect(x - 25, y - 140, 50, 140); }
        } else {
          c.save();
          c.translate(x, y);
          c.scale(u.scale, u.scale);
          try { G.Monsters.draw(c, u.art, 0, 0, t + u.hx * 0.01, { state: u.pose === 'ready' ? 'attack' : u.pose, st: u.poseT, variant: u.variant, phase: u.phase }); } catch (e) { G.warnOnce('monster ' + u.art, e); }
          c.restore();
        }
      };
      if (u.flash > 0.05) {
        // white hit flash via offscreen
        const h = this.unitH(u) + 80, w = Math.max(200, h * 1.4);
        const off = getFlashCanvas(w, h);
        const oc = off.getContext('2d');
        oc.setTransform(G.S, 0, 0, G.S, 0, 0);
        oc.clearRect(0, 0, w, h);
        oc.save(); oc.translate(-(x - w / 2), -(y - h + 20));
        drawBody(oc);
        oc.restore();
        oc.globalCompositeOperation = 'source-atop';
        oc.fillStyle = `rgba(255,255,255,${u.flash * 0.85})`;
        oc.fillRect(0, 0, w, h);
        oc.globalCompositeOperation = 'source-over';
        ctx.drawImage(off, 0, 0, off.width, off.height, x - w / 2, y - h + 20, off.width / G.S, off.height / G.S);
      } else drawBody(ctx);
      // enemy HP bar
      if (u.side === 'enemy' && !u.dead && !u.boss) {
        const bw = 90;
        G.UI.bar(ctx, x - bw / 2, y + 12, bw, 8, u.hp / u.mhp, '#ff8a6a', '#c8382a');
      }
      // statuses
      const sts = Object.keys(u.st);
      if (sts.length && !u.dead) {
        ctx.font = G.font(13, true);
        const widths = sts.map((k) => (STATUS_INFO[k] ? Math.max(20, G.Render.measure(ctx, STATUS_INFO[k].ch) + 8) : 0));
        let sx = x - (widths.reduce((a, b) => a + b + 2, 0)) / 2;
        const sy = u.side === 'enemy' ? y + 26 : y - 168;
        sts.forEach((k, i) => {
          const info = STATUS_INFO[k];
          if (!info) return;
          const bw = widths[i];
          ctx.fillStyle = info.c; ctx.beginPath(); ctx.roundRect(sx, sy, bw, 20, 5); ctx.fill();
          G.Render.text(ctx, info.ch, sx + bw / 2, sy + 3, { size: 13, bold: true, align: 'center', color: '#101010', shadow: false });
          if (info.up) G.Render.text(ctx, info.up > 0 ? '▲' : '▼', sx + bw - 3, sy - 6, { size: 10, color: info.up > 0 ? '#8aff8a' : '#ff8a8a', shadow: false });
          sx += bw + 2;
        });
      }
      ctx.restore();
    }

    drawHud(ctx, t) {
      // party panel
      const px = 360, py = G.H - 112, pw = G.W - 380;
      G.UI.panel(ctx, px, py, pw, 100, { ornament: false });
      const n = this.party.length;
      const cw = pw / Math.max(n, 1);
      this.party.forEach((p, i) => {
        const x = px + 12 + i * cw, y = py + 12;
        if (this.active === p) G.UI.cursor(ctx, x - 4, y - 4, cw - 12, 84, t, true);
        G.Render.textClip(ctx, p.name, x + 14, y + 2, cw - 90, { size: 22, color: p.dead ? '#8a7a7a' : '#fff0d0' });
        G.Render.text(ctx, 'Lv' + p.lv, x + cw - 30, y + 6, { size: 15, align: 'right', color: '#c9b893' });
        const lowHp = p.hp > 0 && p.hp < p.mhp * 0.3;
        G.UI.bar(ctx, x + 14, y + 34, cw - 120, 12, p.hp / p.mhp, lowHp ? '#ffb07a' : '#7ae08a', lowHp ? '#c8502a' : '#2a9a4a');
        G.Render.text(ctx, String(p.hp), x + cw - 34, y + 30, { size: 17, bold: true, align: 'right', color: lowHp ? '#ffb07a' : '#f0f0f0' });
        G.UI.bar(ctx, x + 14, y + 52, cw - 120, 9, p.mp / Math.max(1, p.mmp), '#8ac8ff', '#3a6ad8');
        G.Render.text(ctx, String(p.mp), x + cw - 34, y + 48, { size: 15, align: 'right', color: '#bcd8ff' });
        // 劍意 gauge
        const full = p.gauge >= 100;
        G.UI.bar(ctx, x + 14, y + 68, cw - 120, 6, p.gauge / 100, full ? '#fff0a0' : '#ffd060', full ? '#ff9a2a' : '#c8902a');
        if (full) G.Render.text(ctx, '劍意', x + cw - 34, y + 58, { size: 13, align: 'right', color: `rgba(255,230,140,${0.6 + 0.4 * Math.sin(t * 8)})` });
      });
      // timeline
      const tl = this.timeline(8);
      const tag = (u) => {
        if (u.side !== 'enemy') return '';
        const same = this.enemies.filter((e) => e.name === u.name);
        return same.length > 1 ? 'ABCDEF'[same.indexOf(u)] : '';
      };
      const tx = G.W / 2 - (tl.length * 54) / 2, ty = 14;
      G.UI.plate(ctx, tx - 14, ty - 4, tl.length * 54 + 22, 58, 0.55, 12);
      tl.forEach((u, i) => {
        const x = tx + i * 54, y = ty;
        const isP = u.side === 'party';
        ctx.save();
        ctx.fillStyle = isP ? 'rgba(40,70,120,0.9)' : 'rgba(110,30,30,0.9)';
        ctx.strokeStyle = i === 0 ? '#ffe08a' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = i === 0 ? 2.5 : 1;
        ctx.beginPath(); ctx.roundRect(x, y + (i === 0 ? 0 : 6), 46, i === 0 ? 50 : 40, 8); ctx.fill(); ctx.stroke();
        let chip = u.name.slice(0, 1);
        if (G.I18N.isEn()) {
          const nm = G.T(u.name);
          chip = /[A-Za-z]/.test(nm) ? nm.split(/[\s・-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : nm.slice(0, 1);
        }
        G.Render.text(ctx, chip, x + 23, y + (i === 0 ? 10 : 12), { size: i === 0 ? 26 : 22, align: 'center', color: '#fff4dc' });
        const tg = tag(u);
        if (tg) G.Render.text(ctx, tg, x + 40, y + (i === 0 ? 30 : 32), { size: 13, bold: true, align: 'center', color: '#ffd97a' });
        ctx.restore();
      });
      // boss bar
      const boss = this.enemies.find((e) => e.boss && !e.dead);
      if (boss) {
        const bw = 520, bx = 40, by = 86;
        G.Render.textFit(ctx, boss.name, bx, by - 30, bw, { size: 24, color: '#ffd8c8', glow: 'rgba(255,80,60,0.6)', glowBlur: 10 });
        G.UI.bar(ctx, bx, by, bw, 16, boss.hp / boss.mhp, '#ff7a5a', '#a8201a');
        if (boss.d.elem) G.UI.elemBadge(ctx, boss.d.elem, bx + bw + 20, by + 8, 12);
      }
      // skill banner
      if (this.skillBanner) {
        const b = this.skillBanner;
        const a = Math.min(1, b.t * 8, (1.4 - b.t) * 4);
        ctx.save(); ctx.globalAlpha = Math.max(0, a);
        const bt = G.Render.fit(ctx, b.text, G.W - 200, { size: 30 });
        const w = Math.max(420, bt.w + 200), x = G.W / 2 - w / 2, y = 96;
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, 'rgba(10,8,20,0)'); g.addColorStop(0.5, 'rgba(10,8,20,0.8)'); g.addColorStop(1, 'rgba(10,8,20,0)');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, 50);
        G.Render.text(ctx, bt.str, G.W / 2, y + 9 + (30 - bt.size) / 2, { size: bt.size, align: 'center', color: b.color, glow: 'rgba(255,180,90,0.5)', glowBlur: 10 });
        ctx.restore();
      }
      if (this.auto) G.Render.text(ctx, '自動戰鬥中（F 關閉）', 24, G.H - 34, { size: 17, color: '#ffd97a' });
      if (this.ui) this.ui.draw(ctx, t);
      else if (!this.vic) G.UI.hints(ctx, [['F', this.auto ? '手動' : '自動'], ['E', '速度×' + (G.settings.battleSpeed || 1)]], G.W - 24, 70);
    }

    drawCutin(ctx, t) {
      const c = this.cutin;
      const k = c.t;
      const a = Math.min(1, k * 6, (1.25 - k) * 5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      // diagonal band
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, G.W, G.H);
      ctx.save();
      ctx.translate(G.W / 2, G.H / 2); ctx.rotate(-0.12);
      const g = ctx.createLinearGradient(-G.W, 0, G.W, 0);
      g.addColorStop(0, 'rgba(120,30,20,0.0)'); g.addColorStop(0.3, 'rgba(160,50,30,0.9)'); g.addColorStop(0.7, 'rgba(90,20,20,0.9)'); g.addColorStop(1, 'rgba(120,30,20,0)');
      ctx.fillStyle = g; ctx.fillRect(-G.W, -120, G.W * 2, 240);
      // speed lines
      ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        const yy = -110 + (i * 37) % 220;
        const xx = ((k * 2400 + i * 300) % (G.W * 2)) - G.W;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 180, yy); ctx.stroke();
      }
      ctx.restore();
      const slide = U.ease.outCubic(Math.min(1, k * 3));
      const ids = c.partner ? [c.u.id, c.partner] : [c.u.id];
      ids.forEach((id, i) => {
        const px = -380 + slide * (ids.length > 1 ? 160 + i * 300 : 300) + k * 30;
        G.Portraits.draw(ctx, id, i === 0 ? 'serious' : 'angry', px, G.H / 2 - 230, 360, 400, t, {});
      });
      const cn = G.Render.fit(ctx, c.s.name, G.W - 520, { size: 64, minSize: 40 });
      G.Render.text(ctx, cn.str, G.W - 120 - (1 - slide) * 200, G.H / 2 - 36 + (64 - cn.size) / 2, { size: cn.size, align: 'right', color: '#fff4dc', glow: 'rgba(255,170,80,0.9)', glowBlur: 26 });
      ctx.restore();
    }

    drawIntro(ctx, k) {
      // shattering snapshot
      const snap = this.snapshot;
      const cols = 8, rows = 5;
      const cw = G.W / cols, ch = G.H / rows;
      ctx.save();
      const p = U.ease.inCubic(Math.min(1, k / 0.9));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = c * cw + cw / 2, cy = r * ch + ch / 2;
        const dx = (cx - G.W / 2) * p * 1.4 + U.hash(c, r, 3) * 80 * p;
        const dy = (cy - G.H / 2) * p * 1.4 + p * p * 400;
        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.translate(cx + dx, cy + dy);
        ctx.rotate((U.hash(c, r, 9) - 0.5) * p * 2);
        ctx.drawImage(snap, c * cw * G.S, r * ch * G.S, cw * G.S, ch * G.S, -cw / 2, -ch / 2, cw + 1, ch + 1);
        ctx.restore();
      }
      if (k < 0.15) { ctx.fillStyle = `rgba(255,255,255,${(0.15 - k) * 5})`; ctx.fillRect(0, 0, G.W, G.H); }
      ctx.restore();
    }

    drawVictory(ctx, t) {
      const v = this.vic;
      const a = Math.min(1, v.t * 3);
      ctx.save(); ctx.globalAlpha = a;
      // spoils wrap (four long English item names do not fit one 500px line); the panel grows to hold them
      let spoils = null;
      if (v.page === 0) {
        ctx.font = G.font(22);
        const names = v.drops.map((d) => G.T(G.Data.items[d] ? G.Data.items[d].name : d));
        spoils = G.Render.wrap(ctx, names.length ? names.join(G.I18N.isEn() ? ', ' : '、') : '—', 500);
      }
      const w = 620, h = v.page === 0 ? 300 + Math.max(0, spoils.length - 2) * 30 : 120 + v.ups.length * 92, x = G.W / 2 - w / 2, y = 140;
      G.UI.panel(ctx, x, y, w, h, { title: v.page === 0 ? '戰鬥勝利' : '等級提升' });
      if (v.page === 0) {
        G.Render.text(ctx, '獲得經驗', x + 60, y + 50, { size: 24, color: '#c9b893' });
        G.Render.text(ctx, String(v.exp), x + w - 60, y + 50, { size: 26, align: 'right', color: '#fff0d0' });
        G.Render.text(ctx, '獲得錢財', x + 60, y + 92, { size: 24, color: '#c9b893' });
        G.Render.text(ctx, v.gold + ' 文', x + w - 60, y + 92, { size: 26, align: 'right', color: '#ffe08a' });
        G.Render.text(ctx, '戰利品', x + 60, y + 134, { size: 24, color: '#c9b893' });
        ctx.font = G.font(22);
        G.Render.drawLines(ctx, spoils, x + 60, y + 172, 30, '#fff0d0');
      } else {
        v.ups.forEach((up, i) => {
          const yy = y + 50 + i * 92;
          const nm = G.ShortNames[up.id] || G.Names[up.id];
          G.Render.textClip(ctx, `${nm}  Lv ${up.from} → {y}${up.lv}{/}`.replace(/\{.\}|\{\/\}/g, ''), x + 50, yy, w - 100, { size: 26, color: '#fff0d0' });
          const b = up.before, af = up.after;
          if (b && af) {
            const s = `生命 ${b.mhp}→${af.mhp}　真氣 ${b.mmp}→${af.mmp}　武 ${b.atk}→${af.atk}　法 ${b.mag}→${af.mag}`;
            G.Render.textClip(ctx, s, x + 50, yy + 34, w - 100, { size: 18, color: '#c9e8c0' });
          }
          if (up.learned.length) {
            const sk = up.learned.map((id) => (G.Data.skills[id] ? G.Data.skills[id].name : id)).join('、');
            G.Render.textClip(ctx, '習得：' + sk, x + 50, yy + 58, w - 100, { size: 18, color: '#ffd97a' });
          }
        });
      }
      if (this.keyWait && this.keyWait.t > this.keyWait.min) G.UI.lanternIcon(ctx, x + w - 36, y + h - 30 + Math.sin(t * 5) * 3, 8, t);
      ctx.restore();
    }
  }

  let flashCanvas = null;
  function getFlashCanvas(w, h) {
    const W = Math.ceil(w * G.S), H = Math.ceil(h * G.S);
    if (!flashCanvas || flashCanvas.width < W || flashCanvas.height < H) {
      flashCanvas = document.createElement('canvas');
      flashCanvas.width = Math.max(W, 400); flashCanvas.height = Math.max(H, 600);
    }
    return flashCanvas;
  }

  // ---------------------------------------------------------------- effect primitives
  function slashFx(x, y, kind, dir, colors, multi) {
    let t = 0;
    const n = multi ? 3 : kind === 'claw' ? 3 : 1;
    return {
      update(dt) { t += dt; return t < 0.35; },
      draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const k = t / 0.35;
        for (let i = 0; i < n; i++) {
          ctx.save();
          ctx.translate(x + (i - (n - 1) / 2) * 18, y + (i - (n - 1) / 2) * 6);
          ctx.globalAlpha = 1 - k;
          const c = colors ? colors[0] : '#fff6dc';
          ctx.strokeStyle = c; ctx.lineCap = 'round';
          ctx.shadowColor = colors ? colors[1] : '#ffb860'; ctx.shadowBlur = 16;
          if (kind === 'thrust') {
            ctx.lineWidth = 10 * (1 - k) + 2;
            ctx.beginPath(); ctx.moveTo(-dir * -120 * (1 - k), 0); ctx.lineTo(dir * 90, 0); ctx.stroke();
          } else if (kind === 'bite') {
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0, -10, 40, 0.2, Math.PI - 0.2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 10, 40, Math.PI + 0.2, -0.2); ctx.stroke();
          } else {
            ctx.lineWidth = 9 * (1 - k) + 2;
            const a0 = -2.4 + k * 1.2;
            ctx.beginPath(); ctx.arc(0, 0, 70, a0, a0 + 1.9); ctx.stroke();
          }
          ctx.restore();
        }
        ctx.restore();
      },
    };
  }
  function riseFx(x, y, colors, big) {
    const b = new G.FX.Burst({ x, y, n: big ? 50 : 28, color: colors, speed: 70, speedMin: 10, life: 1.2, gravity: -160, drag: 1.5, jitter: 40, r: 5 });
    let t = 0;
    return {
      update(dt) { t += dt; b.update(dt); return t < 1.2; },
      draw(ctx) {
        b.draw(ctx);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.max(0, 1 - t / 1.0);
        ctx.strokeStyle = colors[1]; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y - 10, 40 + t * 60, (40 + t * 60) * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      },
    };
  }
  function noteFx(x, y) {
    const notes = [];
    for (let i = 0; i < 8; i++) notes.push({ x: x + U.rand(-60, 60), y: y + U.rand(-20, 40), vy: U.rand(-60, -30), ph: U.rand(0, 6), ch: U.pick(['♪', '♫', '♩']) });
    let t = 0;
    return {
      update(dt) { t += dt; for (const n of notes) { n.y += n.vy * dt; n.ph += dt * 4; } return t < 1.3; },
      draw(ctx) {
        for (const n of notes) G.Render.text(ctx, n.ch, n.x + Math.sin(n.ph) * 8, n.y, { size: 30, align: 'center', color: '#c8f0ff', alpha: Math.max(0, 1 - t / 1.3), glow: '#6ab8ff', glowBlur: 12 });
      },
    };
  }
  function castGlow(u, s) {
    let t = 0;
    const ec = { fire: '#ff8a3a', water: '#6ab8ff', wood: '#b0ff6a', metal: '#f0d070', earth: '#c89a5a' }[s.elem] || '#ffe0a0';
    return {
      update(dt) { t += dt; return t < 0.6; },
      draw(ctx) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const x = u.x + u.ox, y = u.y + u.oy;
        ctx.globalAlpha = Math.sin(Math.min(1, t / 0.6) * Math.PI);
        const g = ctx.createRadialGradient(x, y - 70, 0, x, y - 70, 110);
        g.addColorStop(0, U.rgba(ec, 0.7)); g.addColorStop(1, U.rgba(ec, 0));
        ctx.fillStyle = g; ctx.fillRect(x - 110, y - 180, 220, 220);
        ctx.strokeStyle = ec; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * Math.PI * 2 + t * 3;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * 60, y + Math.sin(a) * 18, 3, 0, Math.PI * 2); ctx.fillStyle = ec; ctx.fill();
        }
        ctx.restore();
      },
    };
  }
  function beamFx(x0, y0, x1, y1, colors) {
    let t = 0;
    return {
      update(dt) { t += dt; return t < 0.5; },
      draw(ctx) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const k = t / 0.5;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = colors[1]; ctx.lineWidth = 18 * (1 - k) + 2; ctx.lineCap = 'round';
        ctx.shadowColor = colors[0]; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * (1 - k);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.restore();
      },
    };
  }
  function elementFx(kind, x, y, big, colors) {
    let t = 0;
    const life = big ? 1.0 : 0.75;
    const sc = big ? 1.6 : 1;
    const burst = new G.FX.Burst({
      x, y, n: big ? 50 : 26, color: colors, speed: kind === 'earth' ? 380 : 260, life,
      gravity: kind === 'fire' || kind === 'lantern' ? -200 : kind === 'earth' ? 600 : kind === 'water' ? 300 : 0,
      shape: kind === 'metal' ? 'shard' : kind === 'earth' ? 'shard' : kind === 'wood' ? 'dot' : kind === 'wind' ? 'leaf' : 'dot', r: big ? 8 : 5, jitter: 20,
    });
    return {
      update(dt) { t += dt; burst.update(dt); return t < life; },
      draw(ctx) {
        const k = t / life;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (kind === 'wood') {
          // lightning bolt
          if (k < 0.5) {
            ctx.strokeStyle = '#f0ffd0'; ctx.lineWidth = 5 * sc; ctx.shadowColor = '#b0ff6a'; ctx.shadowBlur = 24;
            ctx.beginPath();
            let lx = x + U.rand(-10, 10), ly = y - 400;
            ctx.moveTo(lx, ly);
            while (ly < y) { lx += U.rand(-30, 30); ly += U.rand(30, 60); ctx.lineTo(lx, Math.min(ly, y)); }
            ctx.stroke();
          }
        }
        if (kind === 'fire' || kind === 'lantern' || kind === 'magic') {
          const r = (50 + k * 60) * sc;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, U.rgba(colors[0], 0.9 * (1 - k))); g.addColorStop(0.5, U.rgba(colors[1], 0.6 * (1 - k))); g.addColorStop(1, U.rgba(colors[2], 0));
          ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        if (kind === 'water' || kind === 'ghost' || kind === 'dark' || kind === 'wind') {
          ctx.strokeStyle = U.rgba(colors[1], 1 - k); ctx.lineWidth = 4 * sc;
          for (let i = 0; i < 3; i++) {
            const rr = (20 + k * 110 + i * 20) * sc;
            ctx.beginPath(); ctx.ellipse(x, y + 20, rr, rr * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
          }
          if (kind === 'dark' || kind === 'ghost') {
            const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * sc);
            g.addColorStop(0, U.rgba(colors[1], 0.6 * (1 - k))); g.addColorStop(1, U.rgba(colors[2], 0));
            ctx.fillStyle = g; ctx.fillRect(x - 90 * sc, y - 90 * sc, 180 * sc, 180 * sc);
          }
        }
        if (kind === 'metal') {
          ctx.strokeStyle = U.rgba('#fff6c8', 1 - k); ctx.lineWidth = 3;
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2 + k * 2;
            const r1 = 120 * (1 - k) * sc;
            ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * (r1 + 40), y + Math.sin(a) * (r1 + 40)); ctx.stroke();
          }
        }
        if (kind === 'earth') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = U.rgba('#7a5a30', 0.8 * (1 - k));
          for (let i = 0; i < 5; i++) {
            const sx = x + (i - 2) * 30 * sc;
            const hh = Math.sin(Math.min(1, k * 2) * Math.PI) * 70 * sc;
            ctx.beginPath(); ctx.moveTo(sx - 16, y + 30); ctx.lineTo(sx, y + 30 - hh); ctx.lineTo(sx + 16, y + 30); ctx.fill();
          }
        }
        ctx.restore();
        burst.draw(ctx);
      },
    };
  }
  function summonFxIntro(u, cat = 'yuyuan') {
    let t = 0;
    return {
      update(dt) { t += dt; return t < 0.9; },
      draw(ctx) {
        if (!G.Sprites) return;
        const k = Math.min(1, t / 0.5);
        ctx.save();
        ctx.globalAlpha = Math.min(1, (0.9 - t) * 4);
        G.Sprites.drawChar(ctx, cat, 'left', Math.floor(t * 10) % 4, u.x - 70 * k, u.y - Math.sin(k * Math.PI) * 60, {});
        ctx.restore();
      },
    };
  }
  function summonFx(scene, u, targets) {
    let t = 0;
    const tg = targets[0];
    return {
      update(dt) { t += dt; return t < 1.0; },
      draw(ctx) {
        if (!tg) return;
        const k = t;
        const x = U.lerp(u.x, tg.x, Math.min(1, k * 1.4));
        const y = U.lerp(u.y, tg.y, Math.min(1, k * 1.4)) - Math.sin(Math.min(1, k * 1.4) * Math.PI) * 140;
        if (G.Sprites) {
          ctx.save();
          ctx.translate(x, y); ctx.scale(1.4, 1.4); ctx.rotate(k * 8);
          G.Sprites.drawChar(ctx, 'yuyuan', 'left', Math.floor(k * 12) % 4, 0, 30, { shadow: false });
          ctx.restore();
        }
      },
    };
  }

  // ------------------------------------------------------------------ command UI
  class CommandUI {
    constructor(scene, u, done) {
      this.scene = scene; this.u = u; this.done = done;
      this.stack = [];
      this.mode = 'main';
      this.buildMain();
    }
    buildMain() {
      const u = this.u;
      const items = [
        { label: '攻擊', k: 'attack' },
        { label: '仙術', k: 'skill', disabled: !!u.st.seal || !this.scene.usableSkills(u).length },
        { label: '道具', k: 'item', disabled: !G.Inv.list((it) => it.use && it.use.battle !== false && it.type === 'use').length },
        { label: '防禦', k: 'defend' },
      ];
      const combos = this.availableCombos();
      if (combos.length) items.splice(3, 0, { label: '合擊', k: 'combo' });
      if (u.gauge >= 100) {
        const ults = [];
        const main = G.Data.chars[u.id] && G.Data.chars[u.id].ultimate;
        if (main && G.Data.skills[main]) ults.push(main);
        for (const sid of u.m.skills || []) if (G.Data.skills[sid] && G.Data.skills[sid].ultimate && !ults.includes(sid)) ults.push(sid);
        ults.reverse().forEach((sid) => items.unshift({ label: '絕技・' + G.Data.skills[sid].name, k: 'ultimate', skill: sid, color: '#ffd97a' }));
      }
      items.push({ label: '逃跑', k: 'flee' });
      this.main = new G.UI.List(items, { rows: items.length, rowH: 44, idx: this.lastMain || 0 });
    }
    availableCombos() {
      const u = this.u;
      const out = [];
      for (const id in G.Data.skills) {
        const s = G.Data.skills[id];
        if (!s.combo || !s.combo.includes(u.id)) continue;
        if (s.req && !G.state.flags[s.req]) continue;
        if (s.flag && !G.state.flags[s.flag]) continue;
        if (s.comboLv && s.combo.some((pid) => { const p = this.scene.party.find((x) => x.id === pid); return !p || p.lv < s.comboLv; })) continue;
        const ok = s.combo.every((pid) => {
          const p = this.scene.party.find((x) => x.id === pid);
          return p && !p.dead && !p.st.sleep && !p.st.stun && p.mp >= (s.mp || 0);
        });
        if (ok) out.push(id);
      }
      return out;
    }
    update() {
      const I = G.Input;
      if (this.mode === 'main') {
        const r = this.main.update();
        if (r === 'ok') {
          const k = this.main.cur.k;
          this.lastMain = this.main.idx;
          if (k === 'attack') this.target({ kind: 'attack' }, 'enemy');
          else if (k === 'defend') this.done({ kind: 'defend' });
          else if (k === 'flee') this.done({ kind: 'flee' });
          else if (k === 'skill') this.openSkills();
          else if (k === 'item') this.openItems();
          else if (k === 'combo') this.openCombos();
          else if (k === 'ultimate') this.chooseSkill(this.main.cur.skill, true);
        }
      } else if (this.mode === 'list') {
        const r = this.list.update();
        if (r === 'ok') this.list.onOk(this.list.cur);
        else if (r === 'cancel') this.mode = 'main';
      } else if (this.mode === 'target') {
        const tg = this.tg;
        const n = tg.pool.length;
        if (!tg.all) {
          if (I.repeat('left') || I.repeat('up')) { tg.i = (tg.i - 1 + n) % n; G.Audio.sfx('cursor'); }
          if (I.repeat('right') || I.repeat('down')) { tg.i = (tg.i + 1) % n; G.Audio.sfx('cursor'); }
        }
        if (I.pressed('ok')) {
          G.Audio.sfx('ok');
          const cmd = Object.assign({}, tg.cmd, { targets: tg.all ? tg.pool : [tg.pool[tg.i]] });
          this.done(cmd);
        } else if (I.pressed('cancel')) { G.Audio.sfx('cancel'); this.mode = tg.back || 'main'; }
      }
    }
    target(cmd, kind, back) {
      const sc = this.scene;
      let pool, all = false;
      switch (kind) {
        case 'enemy': pool = sc.alive('enemy'); break;
        case 'enemies': pool = sc.alive('enemy'); all = true; break;
        case 'random': pool = sc.alive('enemy'); all = true; break;
        case 'ally': pool = sc.alive('party'); break;
        case 'allies': { // whole-party revives (skills with revive:true, items with use.revive) include the fallen
          const sk = cmd.skill && G.Data.skills[cmd.skill], it = cmd.item && G.Data.items[cmd.item];
          pool = (sk && sk.revive) || (it && it.use && it.use.revive) ? sc.party.slice() : sc.alive('party'); all = true; break;
        }
        case 'deadAlly': pool = sc.party.filter((p) => p.dead); if (!pool.length) pool = sc.alive('party'); break;
        case 'self': pool = [this.u]; break;
        default: pool = sc.alive('enemy');
      }
      if (!pool.length) { G.Audio.sfx('buzz'); return; }
      let i = 0;
      if (kind === 'ally') i = pool.reduce((bi, p, j) => (p.hp / p.mhp < pool[bi].hp / pool[bi].mhp ? j : bi), 0);
      this.tg = { cmd, pool, all, i, back };
      this.mode = 'target';
    }
    openSkills() {
      const u = this.u;
      const ids = (u.m.skills || []).filter((id) => G.Data.skills[id] && !G.Data.skills[id].combo && !G.Data.skills[id].ultimate && !G.Data.skills[id].hidden && G.Data.skills[id].type !== 'passive');
      const items = ids.map((id) => {
        const s = G.Data.skills[id];
        return { label: s.name, right: s.mp, elem: s.elem, disabled: s.mp > u.mp, id, desc: s.desc };
      });
      this.list = new G.UI.List(items, { rows: 7, rowH: 44 });
      this.list.onOk = (it) => this.chooseSkill(it.id);
      this.list.title = '仙術';
      this.mode = 'list';
    }
    openCombos() {
      const items = this.availableCombos().map((id) => {
        const s = G.Data.skills[id];
        return { label: s.name, right: s.mp, id, desc: s.desc + '（' + s.combo.map((c) => G.ShortNames[c] || G.Names[c]).join('＋') + '）' };
      });
      this.list = new G.UI.List(items, { rows: 6, rowH: 44 });
      this.list.onOk = (it) => this.chooseSkill(it.id);
      this.list.title = '合擊';
      this.mode = 'list';
    }
    chooseSkill(id, ultimate) {
      const s = G.Data.skills[id];
      const kind = ultimate ? 'ultimate' : 'skill';
      this.target({ kind, skill: id }, s.target || 'enemy', this.mode === 'list' ? 'list' : 'main');
    }
    openItems() {
      const ids = G.Inv.list((it) => it.type === 'use' && it.use && it.use.battle !== false);
      const items = ids.map((id) => {
        const it = G.Data.items[id];
        return { label: it.name, right: '×' + G.Inv.count(id), icon: G.UI.itemIcon(it), id, desc: it.desc };
      });
      this.list = new G.UI.List(items, { rows: 7, rowH: 44 });
      this.list.onOk = (it) => {
        const item = G.Data.items[it.id];
        this.target({ kind: 'item', item: it.id }, item.use.target || 'ally', 'list');
      };
      this.list.title = '道具';
      this.mode = 'list';
    }
    draw(ctx, t) {
      const x = 24, y = G.H - 112 - this.main.items.length * 44 - 30;
      G.UI.panel(ctx, x, y, 300, this.main.items.length * 44 + 24, { ornament: false });
      this.main.draw(ctx, x + 14, y + 12, 280, t, { size: 23, focus: this.mode === 'main' });
      if (this.mode === 'list' || (this.mode === 'target' && this.tg.back === 'list')) {
        const lw = 460, lh = this.list.rows * 44 + 30;
        const cur = this.list.cur;
        // descriptions longer than two lines (common in English) get a taller box; the list moves up to make room
        ctx.font = G.font(18);
        const lines = cur && cur.desc ? G.Render.wrap(ctx, cur.desc, lw - 40).slice(0, 4) : [];
        const extra = Math.max(0, lines.length - 2) * 26;
        const lx = 340, ly = 170 - extra;
        G.UI.panel(ctx, lx, ly, lw, lh, { title: this.list.title });
        this.list.draw(ctx, lx + 14, ly + 18, lw - 24, t, { size: 22, focus: this.mode === 'list' });
        if (lines.length) {
          G.UI.panel(ctx, lx, ly + lh + 10, lw, 70 + extra, { ornament: false });
          ctx.font = G.font(18);
          G.Render.drawLines(ctx, lines, lx + 20, ly + lh + 22, 26, '#e8dcc0');
        }
      }
      G.UI.hints(ctx, [['Z', '決定'], ['X', '返回'], ['F', '自動']], G.W - 24, 70);
    }
    drawWorld(ctx, t) {
      if (this.mode !== 'target') return;
      const tg = this.tg;
      const list = tg.all ? tg.pool : [tg.pool[tg.i]];
      for (const u of list) {
        const h = this.scene.unitH(u);
        const x = u.x + u.ox, y = u.y - h - 26 + Math.sin(t * 6) * 5;
        ctx.save();
        ctx.fillStyle = '#ffd97a'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 14, y - 16); ctx.lineTo(x + 14, y - 16); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (!tg.all || list.length === 1) {
          // target info
          const info = `${u.name}${u.side === 'enemy' && u.d && u.d.elem ? '' : ''}`;
          const iy = Math.max(76, y);
          G.Render.textClip(ctx, info, x, iy - 74, 420, { size: 22, align: 'center', color: '#fff0d0', stroke: '#1a0e08', strokeW: 4 });
          if (u.side === 'enemy' && u.d) {
            const known = (G.state.bestiary[u.id] || 0) > 0;
            const weakTxt = known && u.weak && u.weak.length ? G.T('弱：' + u.weak.map((e) => ELEM_NAMES[e]).join('')) : '';
            ctx.font = G.font(15);
            const ww = weakTxt ? ctx.measureText(weakTxt).width : 0;
            const total = (u.d.elem ? 26 : 0) + ww;
            let lx = x - total / 2;
            if (u.d.elem) { G.UI.elemBadge(ctx, u.d.elem, lx + 10, iy - 32, 10); lx += 26; }
            if (weakTxt) G.Render.text(ctx, weakTxt, lx, iy - 41, { size: 15, color: '#ffd84a' });
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ API
  B.start = function (troopId, o = {}) {
    if (typeof troopId !== 'object' && !(G.Data.troops && G.Data.troops[troopId])) {
      console.warn('Battle: unknown troop', troopId);
      return Promise.resolve('error');
    }
    return new Promise((res) => {
      const stateBefore = JSON.stringify(G.state);
      G.Dialog.close();
      const sc = new BattleScene(troopId, o, res);
      sc.stateBefore = stateBefore;
      G.Scenes.push(sc);
    });
  };
  B.Scene = BattleScene;
  return B;
})();

// ------------------------------------------------------------------ Game over
G.GameOverScene = class GameOverScene {
  constructor(troopId, o, stateBefore, resolve) {
    this.opaque = true;
    this.t = 0;
    this.troopId = troopId; this.o = o; this.stateBefore = stateBefore; this.resolve = resolve;
    const items = [];
    if (troopId != null && stateBefore) items.push({ label: '重新挑戰', k: 'retry' });
    items.push({ label: '讀取進度', k: 'load', disabled: !G.Save.any() });
    items.push({ label: '回到標題', k: 'title' });
    this.list = new G.UI.List(items, { rows: items.length, rowH: 50 });
  }
  update(dt) {
    this.t += dt;
    if (this.t < 1.2) return;
    const r = this.list.update();
    if (r === 'ok') {
      const k = this.list.cur.k;
      if (k === 'retry') {
        G.state = Object.assign(G.newState(), JSON.parse(this.stateBefore));
        G.Scenes.pop(this);
        G.Battle.start(this.troopId, this.o).then(this.resolve);
      } else if (k === 'load') {
        G.Scenes.push(new G.SaveScene('load', () => {}));
      } else {
        G.Title.start();
      }
    }
  }
  draw(ctx) {
    const t = this.t;
    ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, G.W, G.H);
    const a = Math.min(1, t / 1.2);
    ctx.save(); ctx.globalAlpha = a;
    // a guttering lantern
    const fl = 0.6 + 0.4 * Math.sin(t * 7) * Math.sin(t * 3.1);
    const g = ctx.createRadialGradient(G.W / 2, 250, 0, G.W / 2, 250, 200);
    g.addColorStop(0, `rgba(255,140,60,${0.25 * fl})`); g.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
    G.UI.lanternIcon(ctx, G.W / 2, 250, 22 * (0.9 + fl * 0.1), t);
    G.Render.text(ctx, '燈火將熄', G.W / 2, 330, { size: 56, align: 'center', color: '#e8d8c0', glow: 'rgba(255,120,60,0.5)', glowBlur: 20 });
    G.Render.textClip(ctx, '但只要還有人記得，就不算結束。', G.W / 2, 404, G.W - 120, { size: 22, align: 'center', color: '#a89880' });
    G.UI.panel(ctx, G.W / 2 - 150, 460, 300, this.list.items.length * 50 + 24, { ornament: false });
    this.list.draw(ctx, G.W / 2 - 136, 472, 280, t, { size: 24 });
    ctx.restore();
  }
};
