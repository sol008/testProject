// Shop scene: buy / sell with quantity and party equipment comparison.
'use strict';
G.ShopScene = class ShopScene {
  constructor(goods, resolve, o = {}) {
    this.goods = goods.filter((id) => G.Data.items[id]);
    this.resolve = resolve;
    this.o = o;
    this.t = 0;
    this.mode = 'menu';
    this.menu = new G.UI.List([{ label: '購買' }, { label: '販賣' }, { label: '離開' }], { rows: 3, rowH: 48 });
    this.qty = 1;
  }
  buildBuy() {
    this.list = new G.UI.List(this.goods.map((id) => {
      const it = G.Data.items[id];
      return { label: it.name, right: it.price + ' 文', icon: G.UI.itemIcon(it), id, disabled: it.price > G.state.gold };
    }), { rows: 9, rowH: 46, idx: this.list && this.mode === 'buy' ? this.list.idx : 0 });
  }
  buildSell() {
    const ids = G.Inv.list((it) => it.type !== 'key' && (it.price || 0) > 0);
    this.list = new G.UI.List(ids.map((id) => {
      const it = G.Data.items[id];
      return { label: it.name, right: Math.floor(it.price / 2) + ' 文', icon: G.UI.itemIcon(it), id, sub: '×' + G.Inv.count(id) };
    }), { rows: 9, rowH: 46, idx: this.list && this.mode === 'sell' ? this.list.idx : 0 });
  }
  update(dt) {
    this.t += dt;
    const I = G.Input;
    if (this.mode === 'menu') {
      const r = this.menu.update();
      if (r === 'cancel' || (r === 'ok' && this.menu.idx === 2)) { G.Scenes.pop(this); this.resolve(); return; }
      if (r === 'ok') { this.mode = this.menu.idx === 0 ? 'buy' : 'sell'; this.list = null; this.mode === 'buy' ? this.buildBuy() : this.buildSell(); }
      return;
    }
    if (this.mode === 'qty') {
      const it = G.Data.items[this.cur];
      const price = this.selling ? Math.floor(it.price / 2) : it.price;
      const max = this.selling ? G.Inv.count(this.cur) : Math.max(1, Math.min(99 - G.Inv.count(this.cur), Math.floor(G.state.gold / price)));
      if (I.repeat('right') || I.repeat('up')) { this.qty = Math.min(max, this.qty + 1); G.Audio.sfx('cursor'); }
      if (I.repeat('left') || I.repeat('down')) { this.qty = Math.max(1, this.qty - 1); G.Audio.sfx('cursor'); }
      if (I.repeat('pgdn')) this.qty = Math.min(max, this.qty + 10);
      if (I.repeat('pgup')) this.qty = Math.max(1, this.qty - 10);
      if (I.pressed('cancel')) { this.mode = this.selling ? 'sell' : 'buy'; G.Audio.sfx('cancel'); }
      if (I.pressed('ok')) {
        if (this.selling) {
          G.Inv.remove(this.cur, this.qty);
          G.state.gold += price * this.qty;
          this.mode = 'sell'; this.buildSell();
        } else {
          if (G.state.gold < price * this.qty) { G.Audio.sfx('buzz'); return; }
          G.state.gold -= price * this.qty;
          G.Inv.add(this.cur, this.qty);
          this.mode = 'buy'; this.buildBuy();
        }
        G.Audio.sfx('coin');
      }
      return;
    }
    const r = this.list.update();
    if (r === 'cancel') { this.mode = 'menu'; return; }
    if (r === 'ok' && this.list.cur) {
      this.cur = this.list.cur.id;
      this.selling = this.mode === 'sell';
      this.qty = 1;
      this.mode = 'qty';
    }
  }
  draw(ctx) {
    const t = this.t;
    const R = G.Render, UI = G.UI;
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,0.55)'; ctx.fillRect(0, 0, G.W, G.H);
    UI.panel(ctx, 40, 40, 240, 180, { title: this.o.title || '商店' });
    this.menu.draw(ctx, 52, 68, 216, t, { size: 23, focus: this.mode === 'menu' });
    UI.panel(ctx, 40, 240, 240, 70, { ornament: false });
    R.text(ctx, '錢財', 60, 262, { size: 19, color: '#c9b893' });
    R.text(ctx, G.state.gold + ' 文', 262, 260, { size: 22, align: 'right', color: '#ffe08a' });
    if (this.list && this.mode !== 'menu') {
      UI.panel(ctx, 300, 40, 560, 9 * 46 + 40, { title: this.selling || this.mode === 'sell' ? '販賣' : '購買' });
      this.list.draw(ctx, 312, 60, 536, t, { size: 21, focus: this.mode !== 'qty' });
      const id = this.mode === 'qty' ? this.cur : this.list.cur && this.list.cur.id;
      const it = id && G.Data.items[id];
      if (it) {
        UI.panel(ctx, 880, 40, 360, 220, { title: it.name });
        // five lines fit above "Owned"; a longer (English) description drops to a smaller size instead of being cut
        let fs = 18, flh = 27;
        ctx.font = G.font(fs);
        let lines = R.wrap(ctx, it.desc || '', 320);
        if (lines.length > 5) { fs = 16; flh = 23; ctx.font = G.font(fs); lines = R.wrap(ctx, it.desc || '', 320); }
        R.drawLines(ctx, lines.slice(0, fs === 18 ? 5 : 6), 900, 80, flh, '#e8dcc0');
        R.text(ctx, '持有 ' + G.Inv.count(id), 900, 226, { size: 17, color: '#c9b893' });
        // equipment comparison for party
        if (['weapon', 'armor', 'head', 'feet', 'acc'].includes(it.type)) {
          UI.panel(ctx, 880, 276, 360, 300, { title: '比較', ornament: false });
          G.state.party.slice(0, 4).forEach((pid, i) => {
            const y = 312 + i * 64;
            const name = G.ShortNames[pid] || G.Names[pid];
            if (!G.Party.canEquip(pid, id)) { R.textClip(ctx, name + '　無法裝備', 900, y, 320, { size: 18, color: '#6a6458' }); return; }
            const m = G.state.members[pid];
            const before = G.Party.stats(pid);
            const old = m.equip[it.type];
            m.equip[it.type] = id;
            const after = G.Party.stats(pid);
            m.equip[it.type] = old;
            R.textClip(ctx, name + (old === id ? '（已裝備）' : ''), 900, y, 320, { size: 18, color: '#fff0d0' });
            const diffs = [];
            for (const k of ['atk', 'def', 'mag', 'spd', 'mhp', 'mmp', 'luk']) {
              const d = after[k] - before[k];
              if (d) diffs.push({ k, d });
            }
            const names = { atk: '武', def: '防', mag: '法', spd: '速', mhp: '命', mmp: '氣', luk: '運' };
            let x = 900;
            for (const { k, d } of diffs.slice(0, 5)) {
              const s = `${names[k]}${d > 0 ? '+' : ''}${d}`;
              R.text(ctx, s, x, y + 26, { size: 16, color: d > 0 ? '#8af08a' : '#ff8a7a' });
              x += 62;
            }
          });
        }
      }
      if (this.mode === 'qty') {
        const it2 = G.Data.items[this.cur];
        const price = this.selling ? Math.floor(it2.price / 2) : it2.price;
        UI.panel(ctx, 420, 300, 380, 140, { title: this.selling ? '販賣數量' : '購買數量' });
        R.text(ctx, '◀ ' + this.qty + ' ▶', 610, 340, { size: 32, align: 'center', color: '#fff0d0' });
        R.text(ctx, '合計 ' + price * this.qty + ' 文', 610, 392, { size: 21, align: 'center', color: '#ffe08a' });
      }
    }
    UI.hints(ctx, [['Z', '決定'], ['X', '返回']]);
    ctx.restore();
  }
};
