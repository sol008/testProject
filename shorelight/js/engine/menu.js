// Pause menu: items, skills, equipment, status, party, quests, heart lanterns, bestiary, save/load, settings.
'use strict';
(function () {
  const U = G.U;
  const UI = () => G.UI;
  const R = () => G.Render;
  const SLOT_NAMES = { weapon: '武器', armor: '衣裝', head: '頭飾', feet: '鞋履', acc: '佩飾' };
  const STAT_NAMES = { mhp: '生命', mmp: '真氣', atk: '武力', def: '防禦力', mag: '法力', spd: '身法', luk: '運氣' };
  const ELEM_CN = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };

  function charName(id) { return G.ShortNames[id] || G.Names[id] || (G.Data.chars[id] && G.Data.chars[id].name) || id; }

  function memberCard(ctx, m, x, y, w, h, t, sel) {
    const st = G.Party.stats(m.id);
    UI().plate(ctx, x, y, w, h, sel ? 0.75 : 0.5, 10);
    if (sel) UI().cursor(ctx, x + 2, y + 2, w - 4, h - 4, t, true);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x + 8, y + 8, 120, h - 16, 8); ctx.clip();
    G.Portraits.draw(ctx, m.id, m.hp <= 0 ? 'hurt' : 'normal', x - 30, y - 6, 200, 230, t, {});
    ctx.restore();
    const tx = x + 144;
    R().text(ctx, G.Names[m.id] || charName(m.id), tx, y + 12, { size: 26, color: '#fff0d0' });
    R().text(ctx, 'Lv ' + m.lv, x + w - 20, y + 16, { size: 20, align: 'right', color: '#ffd97a' });
    ctx.font = G.font(26);
    if (st.elem) UI().elemBadge(ctx, st.elem, tx + Math.min(300, G.Render.measure(ctx, G.Names[m.id] || charName(m.id)) + 22), y + 28, 11);
    const bw = w - 170;
    R().text(ctx, '生命', tx, y + 52, { size: 16, color: '#c9b893' });
    UI().bar(ctx, tx + 44, y + 56, bw - 44, 12, m.hp / st.mhp, '#7ae08a', '#2a9a4a');
    R().text(ctx, `${m.hp} / ${st.mhp}`, x + w - 22, y + 70, { size: 15, align: 'right', color: '#e8e8e8' });
    R().text(ctx, '真氣', tx, y + 92, { size: 16, color: '#c9b893' });
    UI().bar(ctx, tx + 44, y + 96, bw - 44, 10, m.mp / Math.max(1, st.mmp), '#8ac8ff', '#3a6ad8');
    R().text(ctx, `${m.mp} / ${st.mmp}`, x + w - 22, y + 108, { size: 15, align: 'right', color: '#cfe0ff' });
    const need = G.Party.expToNext(m.lv);
    R().text(ctx, '經驗', tx, y + h - 34, { size: 15, color: '#9c947f' });
    UI().bar(ctx, tx + 44, y + h - 30, bw - 44, 6, m.exp / need, '#f0d070', '#b08a2a');
  }

  // ------------------------------------------------------------------ main menu
  class MenuScene {
    constructor() {
      this.t = 0;
      this.alpha = 0;
      this.items = [
        { label: '物品', k: 'items', icon: 'bag' },
        { label: '仙術', k: 'skills', icon: 'scroll' },
        { label: '裝備', k: 'equip', icon: 'sword' },
        { label: '狀態', k: 'status', icon: 'jade' },
        { label: '隊伍', k: 'party', icon: 'charm' },
        { label: '任務', k: 'quests', icon: 'letter' },
        { label: '心燈', k: 'lanterns', icon: 'lantern' },
        { label: '地圖', k: 'world', icon: 'scroll' },
        { label: '圖鑑', k: 'bestiary', icon: 'mushroom' },
        { label: '存檔', k: 'save', icon: 'ring', disabled: !!(G.mapScene && G.Mapx.val(G.mapScene.def.noSave)) },
        { label: '讀檔', k: 'load', icon: 'key' },
        { label: '設定', k: 'settings', icon: 'fan' },
        { label: '回標題', k: 'title', icon: 'hat' },
      ];
      this.list = new G.UI.List(this.items, { rows: this.items.length, rowH: 42 });
      this.sub = null;
    }
    update(dt) {
      this.t += dt;
      this.alpha = Math.min(1, this.alpha + dt * 6);
      if (this.sub) { this.sub.update(dt); return; }
      if (G.Input.pressed('menu')) { this.close(); return; }
      const r = this.list.update();
      if (r === 'cancel') this.close();
      if (r === 'ok') this.open(this.list.cur.k);
    }
    close() { G.Scenes.pop(this); if (this.onClose) this.onClose(); }
    open(k) {
      const back = () => { this.sub = null; };
      switch (k) {
        case 'items': this.sub = new ItemsPanel(back); break;
        case 'skills': this.sub = new MemberPicker((id) => { this.sub = new SkillsPanel(id, back); }, back); break;
        case 'equip': this.sub = new MemberPicker((id) => { this.sub = new EquipPanel(id, back); }, back); break;
        case 'status': this.sub = new MemberPicker((id) => { this.sub = new StatusPanel(id, back); }, back); break;
        case 'party': this.sub = new PartyPanel(back); break;
        case 'quests': this.sub = new QuestPanel(back); break;
        case 'lanterns': this.sub = new LanternPanel(back); break;
        case 'bestiary': this.sub = new BestiaryPanel(back); break;
        case 'world': G.Scenes.push(new G.WorldMapScene()); break;
        case 'save': G.Scenes.push(new SaveScene('save', () => {})); break;
        case 'load': G.Scenes.push(new SaveScene('load', () => {})); break;
        case 'settings': G.Scenes.push(new SettingsScene()); break;
        case 'title':
          G.Dialog.choice(['回到標題畫面', '取消'], { center: true, cancel: 1 }).then((i) => { if (i === 0) { G.Script.reset(); G.Title.start(); } });
          break;
        default: break;
      }
    }
    draw(ctx) {
      const t = this.t;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = 'rgba(4,6,14,0.62)';
      ctx.fillRect(0, 0, G.W, G.H);
      // left menu
      UI().panel(ctx, 30, 20, 230, this.items.length * 42 + 24);
      this.list.draw(ctx, 40, 32, 214, t, { size: 22, focus: !this.sub });
      // info plate
      UI().panel(ctx, 30, G.H - 106, 230, 96, { ornament: false });
      R().textClip(ctx, (G.mapScene && G.mapScene.map.name) || '', 48, G.H - 96, 200, { size: 20, minSize: 13, color: '#fff0d0' });
      R().text(ctx, '時間 ' + U.fmtTime(G.state.playtime), 48, G.H - 68, { size: 17, color: '#c9b893' });
      R().text(ctx, '錢財 ' + G.state.gold + ' 文', 48, G.H - 44, { size: 17, color: '#ffe08a' });
      UI().lanternIcon(ctx, 220, G.H - 56, 9, t);
      R().text(ctx, String(G.Lanterns.count()), 236, G.H - 68, { size: 20, color: '#ffd9a0' });
      if (this.sub) this.sub.draw(ctx, t);
      else {
        // party overview
        const ms = G.state.party.map((id) => G.state.members[id]).filter(Boolean);
        ms.slice(0, 4).forEach((m, i) => memberCard(ctx, m, 290, 30 + i * 166, 620, 152, t, false));
        if (G.state.vars.objective) {
          ctx.font = G.font(20);
          const lines = R().wrap(ctx, G.state.vars.objective, 270);
          UI().panel(ctx, 940, 30, 310, Math.max(130, lines.length * 30 + 40), { title: '目標' });
          ctx.font = G.font(20);
          R().drawLines(ctx, lines, 960, 62, 30, '#f0e4c4');
        }
        const ch = G.Chapters && G.Chapters[G.state.chapter];
        if (ch) R().text(ctx, ch, 1240, G.H - 60, { size: 20, align: 'right', color: '#c9b893' });
        UI().hints(ctx, [['Z', '決定'], ['X', '關閉']]);
      }
      ctx.restore();
    }
  }
  G.MenuScene = MenuScene;

  // ------------------------------------------------------------------ member picker
  class MemberPicker {
    constructor(onPick, back, o = {}) {
      this.onPick = onPick; this.back = back; this.o = o;
      this.ids = G.state.party.filter((id) => G.state.members[id]);
      this.idx = 0;
    }
    update() {
      const I = G.Input;
      if (I.repeat('down')) { this.idx = (this.idx + 1) % this.ids.length; G.Audio.sfx('cursor'); }
      if (I.repeat('up')) { this.idx = (this.idx - 1 + this.ids.length) % this.ids.length; G.Audio.sfx('cursor'); }
      if (I.pressed('ok')) { G.Audio.sfx('ok'); this.onPick(this.ids[this.idx]); }
      if (I.pressed('cancel')) { G.Audio.sfx('cancel'); this.back(); }
    }
    draw(ctx, t) {
      this.ids.slice(0, 4).forEach((id, i) => memberCard(ctx, G.state.members[id], 290, 30 + i * 166, 620, 152, t, i === this.idx));
      R().text(ctx, this.o.prompt || '選擇角色', 940, 40, { size: 24, color: '#ffd97a' });
      UI().hints(ctx, [['Z', '決定'], ['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ items
  class ItemsPanel {
    constructor(back) {
      this.back = back;
      this.tabs = [{ k: 'use', label: '消耗' }, { k: 'equip', label: '裝備品' }, { k: 'key', label: '貴重' }];
      this.tab = 0;
      this.mode = 'list';
      this.rebuild();
    }
    rebuild() {
      const k = this.tabs[this.tab].k;
      const f = k === 'use' ? (it) => it.type === 'use' || it.type === 'material' : k === 'key' ? (it) => it.type === 'key' : (it) => ['weapon', 'armor', 'head', 'feet', 'acc'].includes(it.type);
      const ids = G.Inv.list(f);
      const idx = this.list ? this.list.idx : 0;
      this.list = new G.UI.List(ids.map((id) => {
        const it = G.Data.items[id];
        const usable = it.type === 'use' && it.use && it.use.field !== false && (it.use.heal || it.use.healPct || it.use.mp || it.use.mpPct || it.use.cure || it.use.revive || it.use.vision || it.use.fieldRun);
        return { label: it.name, right: '×' + G.Inv.count(id), icon: UI().itemIcon(it), id, usable };
      }), { rows: 11, rowH: 44, idx });
    }
    update() {
      const I = G.Input;
      if (this.mode === 'target') { this.picker.update(); return; }
      if (I.pressed('left') || I.pressed('pgup')) { this.tab = (this.tab + 2) % 3; this.list = null; this.rebuild(); G.Audio.sfx('cursor'); return; }
      if (I.pressed('right') || I.pressed('pgdn')) { this.tab = (this.tab + 1) % 3; this.list = null; this.rebuild(); G.Audio.sfx('cursor'); return; }
      const r = this.list.update();
      if (r === 'cancel') this.back();
      if (r === 'ok') {
        const cur = this.list.cur;
        if (!cur || !cur.usable) { G.Audio.sfx('buzz'); return; }
        const it = G.Data.items[cur.id];
        if (it.use.vision) {
          G.Inv.remove(cur.id, 1);
          G.Script.S.vision(Math.round(it.use.vision * 0.25)); // data is in steps (~4 steps/sec)
          G.Audio.sfx('magic');
          G.UI.toast('靈視開啟了——萬物開始呼吸。', { icon: 'mushroom' });
          this.rebuild();
          return;
        }
        if (it.use.fieldRun) { G.Scenes.pop(G.Scenes.top()); G.Script.run(it.use.fieldRun); return; }
        const all = it.use.target === 'allies';
        this.mode = 'target';
        this.picker = new MemberPicker((id) => {
          const ok = useItemField(cur.id, all ? G.state.party : [id]);
          if (ok) G.Audio.sfx('heal'); else G.Audio.sfx('buzz');
          this.rebuild();
          if (!G.Inv.has(cur.id)) this.mode = 'list';
        }, () => { this.mode = 'list'; }, { prompt: all ? '全體使用' : '對誰使用？' });
      }
    }
    draw(ctx, t) {
      if (this.mode === 'target') { this.picker.draw(ctx, t); return; }
      const x = 290, y = 30, w = 620;
      UI().panel(ctx, x, y + 24, w, 11 * 44 + 40);
      this.tabs.forEach((tb, i) => {
        const tx = x + 30 + i * 120;
        ctx.save();
        ctx.fillStyle = i === this.tab ? '#7a2a22' : 'rgba(30,30,40,0.9)';
        ctx.strokeStyle = UI().GOLD; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(tx, y, 106, 36, 6); ctx.fill(); ctx.stroke();
        ctx.restore();
        R().text(ctx, tb.label, tx + 53, y + 5, { size: 21, align: 'center', color: i === this.tab ? '#fff0d0' : '#9c947f' });
      });
      this.list.draw(ctx, x + 12, y + 50, w - 24, t, { size: 22 });
      if (!this.list.items.length) R().text(ctx, '（空）', x + w / 2, y + 140, { size: 22, align: 'center', color: '#8a8270' });
      const cur = this.list.cur;
      if (cur) {
        const it = G.Data.items[cur.id];
        UI().panel(ctx, 930, 54, 320, 380, { title: it.name });
        UI().icon(ctx, UI().itemIcon(it), 1060, 80, 64);
        // the description, stat lines and "equips" line must end above the sell price (y 400): long English
        // descriptions step down to a smaller size rather than overlap it
        const extraH = (it.stats ? Object.keys(it.stats).length * 26 : 0) + (it.pair && it.pair.label ? 26 : 0) + (it.who ? 32 : 0);
        let lines, dlh = 28;
        for (const [fs, lh] of [[19, 28], [17, 25], [16, 22]]) {
          ctx.font = G.font(fs); lines = R().wrap(ctx, it.desc || '', 280); dlh = lh;
          if (170 + lines.length * lh + extraH <= 396) break;
        }
        R().drawLines(ctx, lines, 950, 160, dlh, '#e8dcc0');
        let yy = 170 + lines.length * dlh;
        if (it.stats) {
          for (const k in it.stats) { R().text(ctx, `${STAT_NAMES[k === 'hp' ? 'mhp' : k === 'mp' ? 'mmp' : k] || k} ${it.stats[k] > 0 ? '+' : ''}${it.stats[k]}`, 950, yy, { size: 18, color: '#c9e8c0' }); yy += 26; }
        }
        if (it.pair && it.pair.label) { R().text(ctx, it.pair.label, 950, yy, { size: 17, color: '#f4c8d0' }); yy += 26; }
        if (it.who) R().textClip(ctx, '可裝備：' + it.who.map(charName).join('、'), 950, yy + 6, 284, { size: 17, color: '#c9b893' });
        R().text(ctx, '售價 ' + Math.floor((it.price || 0) / 2) + ' 文', 950, 400, { size: 16, color: '#9c947f' });
      }
      UI().hints(ctx, [['←→', '分類'], ['Z', '使用'], ['X', '返回']]);
    }
  }

  function useItemField(itemId, ids) {
    const it = G.Data.items[itemId];
    if (!it || !it.use || !G.Inv.has(itemId)) return false;
    const u = it.use;
    let did = false;
    for (const id of ids) {
      const m = G.state.members[id];
      if (!m) continue;
      const st = G.Party.stats(id);
      if (m.hp <= 0) {
        if (u.revive) { m.hp = Math.max(1, Math.round(st.mhp * u.revive)); did = true; }
        continue;
      }
      if (u.heal && m.hp < st.mhp) { m.hp = Math.min(st.mhp, m.hp + u.heal); did = true; }
      if (u.healPct && m.hp < st.mhp) { m.hp = Math.min(st.mhp, m.hp + Math.round(st.mhp * u.healPct)); did = true; }
      if (u.mp && m.mp < st.mmp) { m.mp = Math.min(st.mmp, m.mp + u.mp); did = true; }
      if (u.mpPct && m.mp < st.mmp) { m.mp = Math.min(st.mmp, m.mp + Math.round(st.mmp * u.mpPct)); did = true; }
      if (u.cure) did = true;
    }
    if (did) G.Inv.remove(itemId, 1);
    return did;
  }

  // ------------------------------------------------------------------ skills
  class SkillsPanel {
    constructor(id, back) {
      this.id = id; this.back = back;
      const m = G.state.members[id];
      this.list = new G.UI.List(m.skills.map((sid) => {
        const s = G.Data.skills[sid];
        if (!s || s.hidden) return null;
        const field = ['heal', 'revive', 'cure'].includes(s.type);
        return { label: s.name, right: s.mp, elem: s.elem, sid, field };
      }).filter(Boolean), { rows: 11, rowH: 44 });
      this.mode = 'list';
    }
    update() {
      if (this.mode === 'target') { this.picker.update(); return; }
      const r = this.list.update();
      if (r === 'cancel') this.back();
      if (r === 'ok') {
        const cur = this.list.cur;
        if (!cur || !cur.field) { G.Audio.sfx('buzz'); return; }
        const s = G.Data.skills[cur.sid];
        const caster = G.state.members[this.id];
        const all = s.target === 'allies';
        this.mode = 'target';
        this.picker = new MemberPicker((tid) => {
          if (caster.mp < s.mp || caster.hp <= 0) { G.Audio.sfx('buzz'); return; }
          const st = G.Party.stats(this.id);
          const amt = Math.round((s.power || 1) * st.mag * 1.2 + (s.power || 1) * 10);
          let did = false;
          for (const id of all ? G.state.party : [tid]) {
            const m = G.state.members[id];
            const ms = G.Party.stats(id);
            if (s.type === 'revive' && m.hp <= 0) { m.hp = Math.round(ms.mhp * (s.power || 0.5)); did = true; }
            else if (s.type === 'heal' && m.hp > 0 && m.hp < ms.mhp) { m.hp = Math.min(ms.mhp, m.hp + amt); did = true; }
            else if (s.type === 'cure') did = true;
          }
          if (did) { caster.mp -= s.mp; G.Audio.sfx('heal'); } else G.Audio.sfx('buzz');
        }, () => { this.mode = 'list'; }, { prompt: all ? '全體施展' : '對誰施展？' });
      }
    }
    draw(ctx, t) {
      if (this.mode === 'target') { this.picker.draw(ctx, t); return; }
      const m = G.state.members[this.id];
      const st = G.Party.stats(this.id);
      UI().panel(ctx, 290, 54, 620, 11 * 44 + 40, { title: charName(this.id) + '・仙術' });
      this.list.draw(ctx, 302, 74, 596, t, { size: 22 });
      R().text(ctx, `真氣 ${m.mp} / ${st.mmp}`, 890, 20, { size: 19, align: 'right', color: '#bcd8ff' });
      const cur = this.list.cur;
      if (cur) {
        const s = G.Data.skills[cur.sid];
        UI().panel(ctx, 930, 54, 320, 300, { title: s.name });
        ctx.font = G.font(19);
        const lines = R().wrap(ctx, s.desc || '', 280);
        R().drawLines(ctx, lines, 950, 100, 28, '#e8dcc0');
        const tnames = { enemy: '敵方單體', enemies: '敵方全體', ally: '我方單體', allies: '我方全體', self: '自身', deadAlly: '倒下的同伴', random: '隨機敵人' };
        R().text(ctx, '對象：' + (tnames[s.target] || ''), 950, 300, { size: 17, color: '#c9b893' });
        if (s.elem) R().text(ctx, '屬性：' + ELEM_CN[s.elem], 1120, 300, { size: 17, color: '#c9b893' });
      }
      const d = G.Data.chars[this.id];
      if (d.ultimate && G.Data.skills[d.ultimate]) {
        UI().panel(ctx, 930, 380, 320, 140, { title: '絕技' });
        R().text(ctx, G.Data.skills[d.ultimate].name, 950, 418, { size: 24, color: '#ffd97a' });
        R().text(ctx, `劍意 ${Math.round(m.gauge || 0)} / 100`, 950, 456, { size: 18, color: '#c9b893' });
      }
      UI().hints(ctx, [['Z', '施展（治療類）'], ['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ equipment
  class EquipPanel {
    constructor(id, back) {
      this.id = id; this.back = back;
      this.slots = ['weapon', 'armor', 'head', 'feet', 'acc'];
      this.slotIdx = 0;
      this.mode = 'slots';
    }
    itemsFor(slot) {
      const ids = G.Inv.list((it) => it.type === slot);
      return ids.filter((iid) => G.Party.canEquip(this.id, iid));
    }
    update() {
      const I = G.Input;
      if (this.mode === 'slots') {
        if (I.repeat('down')) { this.slotIdx = (this.slotIdx + 1) % 5; G.Audio.sfx('cursor'); }
        if (I.repeat('up')) { this.slotIdx = (this.slotIdx + 4) % 5; G.Audio.sfx('cursor'); }
        if (I.pressed('cancel')) { G.Audio.sfx('cancel'); this.back(); }
        if (I.pressed('ok')) {
          G.Audio.sfx('ok');
          const slot = this.slots[this.slotIdx];
          const items = this.itemsFor(slot).map((iid) => ({ label: G.Data.items[iid].name, right: '×' + G.Inv.count(iid), icon: UI().itemIcon(G.Data.items[iid]), iid }));
          items.unshift({ label: '（卸下）', iid: null });
          this.list = new G.UI.List(items, { rows: 9, rowH: 44 });
          this.mode = 'items';
        }
      } else {
        const r = this.list.update();
        if (r === 'cancel') this.mode = 'slots';
        if (r === 'ok') {
          const slot = this.slots[this.slotIdx];
          if (slot === 'weapon' && !this.list.cur.iid) { G.Audio.sfx('buzz'); return; }
          G.Party.equip(this.id, slot, this.list.cur.iid);
          G.Audio.sfx('item');
          this.mode = 'slots';
        }
      }
    }
    previewStats() {
      if (this.mode !== 'items' || !this.list.cur) return null;
      const m = G.state.members[this.id];
      const slot = this.slots[this.slotIdx];
      const old = m.equip[slot];
      m.equip[slot] = this.list.cur.iid;
      const st = G.Party.stats(this.id);
      m.equip[slot] = old;
      return st;
    }
    draw(ctx, t) {
      const m = G.state.members[this.id];
      const st = G.Party.stats(this.id);
      const pv = this.previewStats();
      UI().panel(ctx, 290, 54, 620, 300, { title: charName(this.id) + '・裝備' });
      this.slots.forEach((s, i) => {
        const y = 84 + i * 52;
        if (i === this.slotIdx) UI().cursor(ctx, 304, y, 590, 46, t, this.mode === 'slots');
        R().textClip(ctx, SLOT_NAMES[s], 330, y + 10, 82, { size: 21, color: '#c9b893' });
        const it = m.equip[s] && G.Data.items[m.equip[s]];
        if (it) UI().icon(ctx, UI().itemIcon(it), 420, y + 7, 32);
        R().textClip(ctx, it ? it.name : '—', 462, y + 10, 420, { size: 22, color: '#fff0d0' });
      });
      // stats
      UI().panel(ctx, 290, 370, 620, 300, { title: '能力' });
      const keys = ['mhp', 'mmp', 'atk', 'def', 'mag', 'spd', 'luk'];
      keys.forEach((k, i) => {
        const y = 404 + i * 36;
        R().text(ctx, STAT_NAMES[k], 330, y, { size: 21, color: '#c9b893' });
        R().text(ctx, String(st[k]), 520, y, { size: 22, align: 'right', color: '#fff0d0' });
        if (pv && pv[k] !== st[k]) {
          const up = pv[k] > st[k];
          R().text(ctx, '→ ' + pv[k], 560, y, { size: 22, color: up ? '#8af08a' : '#ff8a7a' });
        }
      });
      if (this.mode === 'items') {
        UI().panel(ctx, 930, 54, 320, 9 * 44 + 40, { title: SLOT_NAMES[this.slots[this.slotIdx]] });
        this.list.draw(ctx, 940, 74, 300, t, { size: 20 });
        const cur = this.list.cur && this.list.cur.iid && G.Data.items[this.list.cur.iid];
        if (cur) {
          UI().panel(ctx, 930, 9 * 44 + 110, 320, 150, { ornament: false });
          ctx.font = G.font(17);
          const lines = R().wrap(ctx, cur.desc || '', 290);
          R().drawLines(ctx, lines.slice(0, 4), 946, 9 * 44 + 124, 26, '#e8dcc0');
        }
      }
      UI().hints(ctx, [['Z', '更換'], ['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ status
  class StatusPanel {
    constructor(id, back) {
      this.id = id; this.back = back;
      this.ids = G.state.party.filter((x) => G.state.members[x]);
    }
    update() {
      const I = G.Input;
      if (I.pressed('cancel') || I.pressed('ok')) { G.Audio.sfx('cancel'); this.back(); }
      if (I.pressed('right') || I.pressed('down')) { const i = this.ids.indexOf(this.id); this.id = this.ids[(i + 1) % this.ids.length]; G.Audio.sfx('cursor'); }
      if (I.pressed('left') || I.pressed('up')) { const i = this.ids.indexOf(this.id); this.id = this.ids[(i - 1 + this.ids.length) % this.ids.length]; G.Audio.sfx('cursor'); }
    }
    draw(ctx, t) {
      const m = G.state.members[this.id];
      const d = G.Data.chars[this.id];
      const st = G.Party.stats(this.id);
      UI().panel(ctx, 290, 30, 960, 660);
      G.Portraits.draw(ctx, this.id, 'normal', 300, 60, 420, 520, t, {});
      R().textClip(ctx, d.name, 760, 60, 340, { size: 40, minSize: 28, color: '#fff0d0' });
      R().textClip(ctx, d.title || '', 760, 110, 470, { size: 20, color: '#c9b893' });
      R().text(ctx, 'Lv ' + m.lv, 1220, 70, { size: 26, align: 'right', color: '#ffd97a' });
      if (st.elem) { UI().elemBadge(ctx, st.elem, 774, 158, 14); R().text(ctx, ELEM_CN[st.elem] + '行', 796, 146, { size: 20, color: '#e8dcc0' }); }
      const keys = ['mhp', 'mmp', 'atk', 'def', 'mag', 'spd', 'luk'];
      keys.forEach((k, i) => {
        const y = 196 + i * 40;
        R().text(ctx, STAT_NAMES[k], 770, y, { size: 21, color: '#c9b893' });
        const v = k === 'mhp' ? `${m.hp} / ${st.mhp}` : k === 'mmp' ? `${m.mp} / ${st.mmp}` : String(st[k]);
        R().text(ctx, v, 1010, y, { size: 22, align: 'right', color: '#fff0d0' });
      });
      R().text(ctx, `經驗 ${m.exp} / ${G.Party.expToNext(m.lv)}`, 770, 488, { size: 19, color: '#c9b893' });
      R().text(ctx, `劍意 ${Math.round(m.gauge || 0)}`, 770, 518, { size: 19, color: '#ffd97a' });
      ['weapon', 'armor', 'head', 'feet', 'acc'].forEach((s, i) => {
        const it = m.equip[s] && G.Data.items[m.equip[s]];
        R().textFit(ctx, G.T(SLOT_NAMES[s]) + (G.I18N.isEn() ? ': ' : '：') + G.T(it ? it.name : '—'), 1040, 196 + i * 34, 196, { size: 17, color: '#e8dcc0' });
      });
      if (d.bio) {
        ctx.font = G.font(18);
        const lines = R().wrap(ctx, d.bio, 460);
        R().drawLines(ctx, lines.slice(0, 4), 770, 560, 28, '#d8ccb0');
      }
      UI().hints(ctx, [['←→', '切換'], ['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ party order
  class PartyPanel {
    constructor(back) { this.back = back; this.idx = 0; this.sel = -1; }
    update() {
      const I = G.Input;
      const n = G.state.party.length;
      if (I.repeat('down')) { this.idx = (this.idx + 1) % n; G.Audio.sfx('cursor'); }
      if (I.repeat('up')) { this.idx = (this.idx - 1 + n) % n; G.Audio.sfx('cursor'); }
      if (I.pressed('cancel')) { if (this.sel >= 0) this.sel = -1; else this.back(); G.Audio.sfx('cancel'); }
      if (I.pressed('ok')) {
        G.Audio.sfx('ok');
        if (this.sel < 0) this.sel = this.idx;
        else {
          const p = G.state.party;
          [p[this.sel], p[this.idx]] = [p[this.idx], p[this.sel]];
          this.sel = -1;
          if (G.mapScene) G.mapScene.refresh();
        }
      }
    }
    draw(ctx, t) {
      UI().panel(ctx, 290, 54, 620, G.state.party.length * 64 + 40, { title: '隊伍順序' });
      G.state.party.forEach((id, i) => {
        const y = 80 + i * 64;
        if (i === this.idx) UI().cursor(ctx, 304, y, 590, 56, t, true);
        if (i === this.sel) { ctx.strokeStyle = '#ffd97a'; ctx.lineWidth = 2; ctx.strokeRect(306, y + 2, 586, 52); }
        R().text(ctx, (i < 4 ? '出戰' : '後備') + '　' + (G.Names[id] || id), 340, y + 14, { size: 23, color: i < 4 ? '#fff0d0' : '#9c947f' });
        R().text(ctx, 'Lv ' + G.state.members[id].lv, 870, y + 16, { size: 19, align: 'right', color: '#ffd97a' });
      });
      R().text(ctx, '第一位為帶隊者。選擇兩人以交換位置。', 300, G.state.party.length * 64 + 110, { size: 18, color: '#c9b893' });
      UI().hints(ctx, [['Z', '選擇'], ['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ quests
  class QuestPanel {
    constructor(back) {
      this.back = back;
      const q = G.state.quests;
      const ids = Object.keys(q).sort((a, b) => (q[a].done ? 1 : 0) - (q[b].done ? 1 : 0));
      this.list = new G.UI.List(ids.map((id) => {
        const d = G.Data.quests && G.Data.quests[id];
        return { label: (q[id].done ? '✓ ' : '') + (d ? d.name : id), id, color: q[id].done ? '#8a8270' : (d && d.main ? '#ffd97a' : null) };
      }), { rows: 12, rowH: 44 });
    }
    update() { const r = this.list.update(); if (r === 'cancel' || r === 'ok') this.back(); }
    draw(ctx, t) {
      UI().panel(ctx, 290, 54, 460, 12 * 44 + 40, { title: '任務' });
      this.list.draw(ctx, 302, 74, 436, t, { size: 21 });
      if (!this.list.items.length) R().text(ctx, '目前沒有任務。', 320, 100, { size: 20, color: '#8a8270' });
      const cur = this.list.cur;
      if (cur) {
        const d = G.Data.quests && G.Data.quests[cur.id];
        const qs = G.state.quests[cur.id];
        UI().panel(ctx, 770, 54, 480, 420, { title: d ? d.name : cur.id });
        ctx.font = G.font(19);
        let text = d ? d.desc : '';
        if (d && d.stages && !qs.done) text += '\n\n' + (d.stages[qs.stage] || '');
        if (qs.done && d && d.doneText) text += '\n\n' + d.doneText;
        const lines = R().wrap(ctx, text, 440);
        R().drawLines(ctx, lines, 790, 96, 30, '#e8dcc0');
        if (d && d.lantern) { UI().lanternIcon(ctx, 1220, 450, 9, t); }
      }
      UI().hints(ctx, [['↑↓', '瀏覽'], ['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ heart lanterns
  class LanternPanel {
    constructor(back) {
      this.back = back;
      this.ids = Object.keys(G.state.lanterns);
      this.list = new G.UI.List(this.ids.map((id) => ({ label: G.state.lanterns[id].name, id })), { rows: 11, rowH: 44 });
    }
    update() { const r = this.list.update(); if (r === 'cancel') this.back(); }
    draw(ctx, t) {
      UI().panel(ctx, 290, 54, 960, 620, { title: '心燈' });
      // floating lanterns visual
      const n = this.ids.length;
      for (let i = 0; i < n; i++) {
        const x = 820 + (i % 5) * 84 + Math.sin(t * 0.8 + i) * 8;
        const y = 160 + Math.floor(i / 5) * 110 + Math.cos(t * 0.6 + i * 1.7) * 10;
        UI().lanternIcon(ctx, x, y, 16, t + i);
      }
      this.list.draw(ctx, 302, 86, 460, t, { size: 21 });
      R().text(ctx, `已點亮 ${n} 盞`, 320, 620, { size: 22, color: '#ffd9a0' });
      R().text(ctx, '每一次真心的幫助，都會在世間留下一盞記憶之燈。', 320, 646, { size: 17, color: '#9c947f' });
      if (!n) R().text(ctx, '尚未點亮任何心燈。', 330, 110, { size: 20, color: '#8a8270' });
      UI().hints(ctx, [['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ bestiary
  class BestiaryPanel {
    constructor(back) {
      this.back = back;
      const ids = Object.keys(G.Data.enemies || {}).filter((id) => G.state.bestiary[id]);
      this.list = new G.UI.List(ids.map((id) => ({ label: G.Data.enemies[id].name, right: '×' + G.state.bestiary[id], id })), { rows: 12, rowH: 44 });
      this.total = Object.keys(G.Data.enemies || {}).length;
    }
    update() { const r = this.list.update(); if (r === 'cancel') this.back(); }
    draw(ctx, t) {
      UI().panel(ctx, 290, 54, 380, 12 * 44 + 40, { title: '妖怪圖鑑' });
      this.list.draw(ctx, 302, 74, 356, t, { size: 20 });
      R().text(ctx, `收錄 ${this.list.items.length} / ${this.total}`, 300, 650, { size: 18, color: '#c9b893' });
      const cur = this.list.cur;
      if (cur) {
        const d = G.Data.enemies[cur.id];
        UI().panel(ctx, 690, 54, 560, 620, { title: d.name });
        ctx.save();
        ctx.beginPath(); ctx.rect(700, 70, 540, 300); ctx.clip();
        if (d.art) {
          const md = G.Monsters.get(d.art);
          const sc = md ? Math.min(1.2, 270 / md.h, 480 / md.w) : 1;
          ctx.translate(970, 360); ctx.scale(sc, sc);
          G.Monsters.draw(ctx, d.art, 0, 0, t, { state: 'idle', variant: d.variant || 0 });
        } else if (d.sprite && G.Sprites) G.Sprites.drawBattle(ctx, d.sprite, 'idle', t, 970, 350, { flip: true });
        ctx.restore();
        ctx.font = G.font(18);
        const lines = R().wrap(ctx, d.desc || '', 510);
        R().drawLines(ctx, lines, 714, 390, 28, '#e8dcc0');
        const y2 = 400 + lines.length * 28 + 12;
        R().text(ctx, `生命 ${d.hp}　等級 ${d.lv || '?'}`, 714, y2, { size: 18, color: '#c9b893' });
        if (d.elem) { R().text(ctx, '屬性', 714, y2 + 32, { size: 18, color: '#c9b893' }); UI().elemBadge(ctx, d.elem, 770, y2 + 44, 11); }
        if (d.weak && d.weak.length) R().text(ctx, '弱點：' + d.weak.map((e) => ELEM_CN[e]).join('、'), 800, y2 + 32, { size: 18, color: '#ffd84a' });
      }
      UI().hints(ctx, [['X', '返回']]);
    }
  }

  // ------------------------------------------------------------------ save / load
  class SaveScene {
    constructor(mode, done) {
      this.mode = mode; this.done = done; this.t = 0;
      this.slots = [];
      const start = mode === 'load' ? 0 : 1;
      for (let i = start; i <= G.Save.SLOTS; i++) this.slots.push(i);
      this.idx = 0;
      if (mode === 'load') { const l = G.Save.latest(); const j = this.slots.indexOf(l); if (j >= 0) this.idx = j; }
      this.thumbs = {};
      this.top = 0;
    }
    thumb(slot, meta) {
      if (!meta || !meta.thumb) return null;
      if (!this.thumbs[slot]) { const img = new Image(); img.src = meta.thumb; this.thumbs[slot] = img; }
      return this.thumbs[slot];
    }
    update(dt) {
      this.t += dt;
      const I = G.Input;
      const n = this.slots.length;
      if (I.repeat('down')) { this.idx = (this.idx + 1) % n; G.Audio.sfx('cursor'); }
      if (I.repeat('up')) { this.idx = (this.idx - 1 + n) % n; G.Audio.sfx('cursor'); }
      if (this.idx < this.top) this.top = this.idx;
      if (this.idx >= this.top + 5) this.top = this.idx - 4;
      if (I.pressed('cancel')) { G.Audio.sfx('cancel'); G.Scenes.pop(this); this.done(false); return; }
      if (I.pressed('ok')) {
        const slot = this.slots[this.idx];
        if (this.mode === 'save') {
          // take thumbnail without menus: draw the map scene alone
          let thumb = null;
          if (G.mapScene) {
            try {
              const c = document.createElement('canvas');
              c.width = 192; c.height = 108;
              const cx = c.getContext('2d');
              const saved = G.ctx;
              const big = document.createElement('canvas'); big.width = G.W; big.height = G.H;
              const bctx = big.getContext('2d');
              G.ctx = bctx; try { G.mapScene.draw(bctx); } finally { G.ctx = saved; }
              if (G.mapScene.view3d && G.R3.enabled()) cx.drawImage(G.R3.canvas, 0, 0, 192, 108);
              cx.drawImage(big, 0, 0, 192, 108);
              thumb = c.toDataURL('image/jpeg', 0.6);
            } catch (e) { thumb = null; }
          }
          if (G.Save.write(slot, thumb)) { G.Audio.sfx('save'); G.UI.toast(`已儲存至 第${slot}格`); delete this.thumbs[slot]; }
          else G.Audio.sfx('buzz');
        } else {
          if (!G.Save.exists(slot)) { G.Audio.sfx('buzz'); return; }
          G.Audio.sfx('ok');
          B_load(slot);
        }
      }
    }
    draw(ctx) {
      const t = this.t;
      ctx.save();
      ctx.fillStyle = 'rgba(4,6,14,0.85)'; ctx.fillRect(0, 0, G.W, G.H);
      R().text(ctx, this.mode === 'save' ? '儲存進度' : '讀取進度', 60, 34, { size: 34, color: '#fff0d0' });
      for (let r = 0; r < 5; r++) {
        const i = this.top + r;
        if (i >= this.slots.length) break;
        const slot = this.slots[i];
        const meta = G.Save.meta(slot);
        const x = 60, y = 96 + r * 118, w = G.W - 120, h = 108;
        UI().panel(ctx, x, y, w, h, { ornament: false, alpha: i === this.idx ? 1 : 0.75 });
        if (i === this.idx) UI().cursor(ctx, x + 4, y + 4, w - 8, h - 8, t, true);
        R().text(ctx, slot === 0 ? '自動' : '第' + slot + '格', x + 30, y + 38, { size: 24, color: '#ffd97a' });
        if (meta) {
          const img = this.thumb(slot, meta);
          if (img && img.complete) { ctx.drawImage(img, x + 130, y + 10, 157, 88); ctx.strokeStyle = 'rgba(240,210,140,0.5)'; ctx.strokeRect(x + 130, y + 10, 157, 88); }
          R().textClip(ctx, meta.place || '', x + 310, y + 16, 310, { size: 24, minSize: 17, color: '#fff0d0' });
          R().textClip(ctx, (G.Chapters && G.Chapters[meta.chapter]) || '', x + 310, y + 54, 310, { size: 18, color: '#c9b893' });
          R().textClip(ctx, (meta.party || []).map((p) => `${G.T(G.ShortNames[p.id] || G.Names[p.id] || p.id)} Lv${p.lv}`).join('　'), x + 640, y + 18, w - 664, { size: 18, color: '#e8dcc0' });
          R().text(ctx, '時間 ' + U.fmtTime(meta.playtime || 0) + '　心燈 ' + (meta.lanterns || 0), x + 640, y + 54, { size: 18, color: '#c9b893' });
          const d = new Date(meta.time);
          R().text(ctx, `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, x + w - 24, y + 72, { size: 15, align: 'right', color: '#8a8270' });
        } else R().text(ctx, '— 空 —', x + 310, y + 38, { size: 22, color: '#6a6458' });
      }
      UI().hints(ctx, [['Z', this.mode === 'save' ? '儲存' : '讀取'], ['X', '返回']]);
      ctx.restore();
    }
  }
  G.SaveScene = SaveScene;

  function B_load(slot) {
    if (!G.Save.read(slot)) return;
    G.Script.reset();
    G.Render.fade.a = 0;
    G.inGame = true;
    const st = G.state;
    G.mapScene = null;
    G.Scenes.replace(new G.BlankScene(false));
    G.Mapx.goto(st.map, st.x, st.y, st.dir);
    G.Render.fade.a = 1;
    G.Render.fadeTo(0, 0.6);
    G.UI.toast('讀取完成');
  }
  G.loadGame = B_load;

  // ------------------------------------------------------------------ settings
  class SettingsScene {
    constructor() {
      this.t = 0;
      this.rows = [
        { k: 'lang', label: '語言 Language', type: 'enum', opts: ['zh', 'en'], names: ['繁體中文', 'English'] },
        { k: 'music', label: '音樂音量', type: 'vol' },
        { k: 'sfx', label: '音效音量', type: 'vol' },
        { k: 'textSpeed', label: '文字速度', type: 'enum', opts: [0, 1, 2, 3, 4], names: ['很慢', '慢', '普通', '快', '瞬間'] },
        { k: 'battleSpeed', label: '戰鬥速度', type: 'enum', opts: [1, 1.5, 2, 3], names: ['×1', '×1.5', '×2', '×3'] },
        { k: 'difficulty', label: '難度', type: 'enum', opts: ['easy', 'normal', 'hard'], names: ['劇情', '普通', '困難'] },
        { k: 'runDefault', label: '預設奔跑', type: 'enum', opts: [false, true], names: ['關', '開'] },
        { k: 'autosave', label: '自動存檔', type: 'enum', opts: [true, false], names: ['開', '關'] },
        { k: 'autoAdvance', label: '對話自動播放', type: 'enum', opts: [false, true], names: ['關', '開'] },
        { k: 'visualFx', label: '迷幻視覺強度（光敏保護）', type: 'enum', opts: [1, 0.5, 0.2], names: ['完整', '柔和', '最低'] },
        { k: 'quality', label: '畫質（重新啟動後生效）', type: 'enum', opts: ['ultra', 'high', 'low'], names: ['超高', '高', '省電'] },
        { k: 'render3d', label: '3D 畫面（重新啟動後生效）', type: 'enum', opts: [true, false], names: ['開', '關'] },
        { k: 'camRotate', label: '鏡頭旋轉（Q/E）', type: 'enum', opts: [true, false], names: ['開', '關'] },
        { k: 'fullscreen', label: '全螢幕', type: 'action' },
      ];
      if (G.settings.autosave == null) G.settings.autosave = true;
      this.idx = 0;
    }
    update(dt) {
      this.t += dt;
      const I = G.Input;
      const n = this.rows.length;
      if (I.repeat('down')) { this.idx = (this.idx + 1) % n; G.Audio.sfx('cursor'); }
      if (I.repeat('up')) { this.idx = (this.idx - 1 + n) % n; G.Audio.sfx('cursor'); }
      const row = this.rows[this.idx];
      const dir = I.repeat('right') ? 1 : I.repeat('left') ? -1 : 0;
      if (row.type === 'action' && I.pressed('ok')) { G.Render.toggleFullscreen(); }
      if (dir) {
        if (row.type === 'vol') G.settings[row.k] = Math.round(U.clamp(G.settings[row.k] + dir * 0.1, 0, 1) * 10) / 10;
        if (row.type === 'enum') {
          let i = row.opts.indexOf(G.settings[row.k]);
          if (i < 0) i = 0;
          i = (i + dir + row.opts.length) % row.opts.length;
          G.settings[row.k] = row.opts[i];
        }
        G.saveSettings();
        G.Audio.sfx('cursor');
      }
      if (I.pressed('cancel')) { G.Audio.sfx('cancel'); G.saveSettings(); G.Scenes.pop(this); }
    }
    draw(ctx) {
      const t = this.t;
      ctx.save();
      ctx.fillStyle = 'rgba(4,6,14,0.85)'; ctx.fillRect(0, 0, G.W, G.H);
      // 14 rows: 42px each so the panel ends above the two key-help lines (at 46px the last row sat on top of them)
      const RH = 42;
      UI().panel(ctx, 240, 30, 800, this.rows.length * RH + 44, { title: '設定' });
      this.rows.forEach((row, i) => {
        const y = 58 + i * RH;
        if (i === this.idx) UI().cursor(ctx, 256, y, 768, RH - 4, t, true);
        R().textFit(ctx, row.label, 290, y + 8, 330, { size: 22, color: '#fff0d0' });
        let v = '';
        if (row.type === 'vol') {
          UI().bar(ctx, 640, y + 12, 260, 14, G.settings[row.k], '#ffd97a', '#c8902a');
          v = Math.round(G.settings[row.k] * 100) + '%';
        } else if (row.type === 'enum') {
          const j = row.opts.indexOf(G.settings[row.k]);
          v = '◀ ' + (row.names[j < 0 ? 0 : j]) + ' ▶';
        } else v = 'Z 切換';
        R().text(ctx, v, 1000, y + 8, { size: 21, align: 'right', color: '#ffd97a' });
      });
      R().textFit(ctx, '鍵位：方向鍵/WASD 移動　Z/空白/Enter 決定　X/Esc 返回・選單　Shift 奔跑', 640, G.H - 50, 1180, { size: 16, align: 'center', color: '#9c947f' });
      R().textFit(ctx, 'F 自動（戰鬥/對話）　L 對話紀錄　按住 Ctrl 快進　E 戰鬥速度　F11 全螢幕', 640, G.H - 27, 1180, { size: 16, align: 'center', color: '#9c947f' });
      ctx.restore();
    }
  }
  G.SettingsScene = SettingsScene;
})();
