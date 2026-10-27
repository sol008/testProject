// 第七章 雲山入夢 — 阿里山・玉山・藤婆的雲霧林・靈境・日月潭・燈母祠
// Screenplay: docs/story/ch7_mountains.md   (party: 星河 紅纓 雲歸 + the silent cats 芋圓 & 麻糬; 白芷 absent)
//
// Maps: sugar_shrine, alishan_trail, tsou_hosa, tsou_house, alishan_forest, yushan_trail, bunun_home,
//       bunun_house_in, cloud_forest, tengpo_hut, tengpo_hut_in, vision_hub, vision_hongying, vision_yungui,
//       vision_xinghe, vision_heart, sunmoon, sunmoon_mist, lamp_shrine, lamp_shrine_lower, lamp_shrine_core.
//
// 燈芯將盡 (flag ch7_flame 30..100): 星河's max HP is scaled through a hidden equipment slot (`equip.c7flame`
// holds the key item c7_flame_wick whose stats.hp getter subtracts the missing part). The value drops by 2 after
// every battle (win/flee — G.Battle.start is wrapped while the flame is active) and by 4 at story beats, rises by 8
// when resting with the Tsou / Bunun families. Awakening 心火 (ch7_xinhuo) deletes ch7_flame, removes the slot and
// adds `equip.c7heart` (c7_heart_fire: +8% max HP, fire damage +10%).
//
// Cultural notes (STORY_BIBLE guide): the kuba is never entered (no door, solid); the Bunun pasibutbut is only heard
// from inside the house (BGM silent, no singing synthesis, no minigame, no save); 塔山 and Lalu are unreachable
// (cliff / deep water, boats refuse with text). The 夢藤 rite belongs to the fictional hermit 藤婆 only.
'use strict';
(function () {
  const U = G.U;
  const T = G.TILE;
  const C7 = (G.C7 = G.C7 || {});
  const D = G.Data;

  // ================================================================================================ grid builder
  // Maps are authored with a small builder so layouts can be carved with paths / blobs and decorated procedurally
  // (deterministic: every random choice uses a seeded rng). The result is plain `tiles` rows + `objects`.
  class Grid {
    constructor(w, h, fill, seed) {
      this.w = w; this.h = h;
      this.a = [];
      for (let y = 0; y < h; y++) this.a.push(new Array(w).fill(fill));
      this.occ = new Uint8Array(w * h);
      this.objs = [];
      this.rng = U.seeded(seed || 7);
    }
    in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { return this.in(x, y) ? this.a[y][x] : null; }
    set(x, y, c) { if (this.in(x, y)) this.a[y][x] = c; return this; }
    rect(x, y, w, h, c, only) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!only || only.includes(this.get(xx, yy))) this.set(xx, yy, c);
      return this;
    }
    // filled ellipse with a little deterministic edge noise
    blob(cx, cy, rx, ry, c, noise = 0.18, only) {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1 + (U.hash(x, y, 91) - 0.5) * noise * 2 && (!only || only.includes(this.get(x, y)))) this.set(x, y, c);
      }
      return this;
    }
    // poly-line brush (square brush of radius r)
    path(pts, c, r = 1, only) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
        for (let k = 0; k <= n; k++) {
          const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
          for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) if (!only || only.includes(this.get(x + dx, y + dy))) this.set(x + dx, y + dy, c);
        }
      }
      return this;
    }
    rows() { return this.a.map((r) => r.join('')); }
    fp(t, o) { const d = G.Objects.get(t); return [o.w || (d ? d.w : 1), o.h || (d ? d.h : 1)]; }
    reserve(x, y, w = 1, h = 1) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (this.in(xx, yy)) this.occ[yy * this.w + xx] = 1; return this; }
    isFree(x, y, w = 1, h = 1) {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!this.in(xx, yy) || this.occ[yy * this.w + xx]) return false;
      return true;
    }
    obj(t, x, y, extra) {
      const o = Object.assign({ t, x, y }, extra || {});
      const [w, h] = this.fp(t, o);
      this.reserve(x, y, w, h);
      this.objs.push(o);
      return o;
    }
    // scatter `n` objects of the given types on cells whose terrain char is in `on`
    scatter(types, n, o = {}) {
      const area = o.area || [0, 0, this.w, this.h];
      const on = o.on || '.,';
      let placed = 0, tries = 0;
      while (placed < n && tries++ < n * 40) {
        const t = types[Math.floor(this.rng() * types.length)];
        const x = area[0] + Math.floor(this.rng() * area[2]), y = area[1] + Math.floor(this.rng() * area[3]);
        const [w, h] = this.fp(t, o.extra || {});
        const gap = o.gap || 0;
        let ok = this.isFree(x - gap, y - gap, w + 2 * gap, h + 2 * gap) || (gap && this.isFree(x, y, w, h) && false);
        for (let yy = y; ok && yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!on.includes(this.get(xx, yy))) { ok = false; break; }
        if (ok && o.test && !o.test(x, y)) ok = false;
        if (!ok) continue;
        this.obj(t, x, y, o.extra);
        placed++;
      }
      return this;
    }
  }
  C7.Grid = Grid;

  // ================================================================================================ data: items
  const I = D.items;
  const item = (id, d) => { I[id] = d; };
  // consumables (scaled to the existing economy: L23–27 party HP ≈ 550–700)
  item('c7_zhixue', { name: '止血草', desc: '山路邊常見的草藥，搗爛敷上就能止血。回復氣血 250。', type: 'use', price: 60, ch: 7, icon: 'herb', use: { target: 'ally', heal: 250 } });
  item('c7_huiqi', { name: '回氣散', desc: '山產商老吳配的藥粉，含在舌下，一口氣就回來了。回復真氣 60。', type: 'use', price: 120, ch: 7, icon: 'pill', use: { target: 'ally', mp: 60 } });
  item('c7_xingshen', { name: '醒神香', desc: '點上一炷，迷糊的腦袋就清醒了。解除睡眠與幻境。', type: 'use', price: 50, ch: 7, icon: 'incense', use: { target: 'ally', cure: ['sleep', 'trance'] } });
  item('c7_salt', { name: '粗鹽', desc: '老吳寮裡的粗鹽，一包一包用竹葉包好。山上的人家用得著。', type: 'material', price: 10, ch: 7, icon: 'bag' });
  item('c7_ganzhe', { name: '甘蔗', desc: '糖廍阿伯給的甘蔗。咬兩口，甜的會讓人有力。回復氣血 150。', type: 'use', price: 0, ch: 7, icon: 'food', use: { target: 'ally', heal: 150 } });
  item('c7_xiaomigao', { name: '小米糕', desc: 'Abus 用今年的小米做的糕，紮實又香。回復氣血 350。', type: 'use', price: 0, ch: 7, icon: 'food', use: { target: 'ally', heal: 350 } });
  item('c7_yanrou', { name: '醃山肉', desc: '布農人家醃的山肉，鹹香耐放。回復氣血 450，戰鬥中攻擊提升。', type: 'use', price: 0, ch: 7, icon: 'food', use: { target: 'ally', heal: 450, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }] } });
  item('c7_kaorou', { name: '烤山肉', desc: 'Voyu 的母親烤的山肉，最大的那塊總是給客人。回復氣血 400。', type: 'use', price: 0, ch: 7, icon: 'food', use: { target: 'ally', heal: 400 } });
  item('c7_aiyudong', { name: '愛玉凍', desc: '用山上的愛玉子洗出來的凍，平地人愛加糖水。回復氣血 200、真氣 30。', type: 'use', price: 0, ch: 7, icon: 'drink', use: { target: 'ally', heal: 200, mp: 30 } });
  item('c7_hulu', { name: '小米酒（小葫蘆）', desc: 'Voyu 的母親裝給客人的一小葫蘆小米酒。依禮各抿一口。全隊回復真氣 80（戰鬥外）。', type: 'use', price: 0, ch: 7, icon: 'wine', use: { target: 'allies', mp: 80, battle: false } });
  item('c7_yunwu', { name: '雲霧藥草包', desc: '藤婆用雲霧林的藥草包成的小包，煮水喝。全體回復氣血 400。', type: 'use', price: 300, ch: 7, icon: 'herb', use: { target: 'allies', heal: 400 } });
  item('c7_shanshen', { name: '山參', desc: '長在雲霧裡的老山參。回復氣血 700、真氣 40。', type: 'use', price: 420, ch: 7, icon: 'herb', use: { target: 'ally', heal: 700, mp: 40 } });
  item('c7_qingxintai', { name: '清心苔', desc: '雲霧林石頭上的青苔，嚼起來像雨後的空氣。解除所有異常狀態。', type: 'use', price: 150, ch: 7, icon: 'herb', use: { target: 'ally', cure: ['poison', 'seal', 'sleep', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'] } });
  item('c7_tobacco', { name: '藤婆的菸草', desc: '「別抽，拿去燒。」點燃後的煙會讓妖怪看見不存在的東西。敵方全體可能陷入幻境。', type: 'use', price: 250, ch: 7, icon: 'incense', use: { target: 'enemies', status: { id: 'trance', chance: 0.4, turns: 3 }, battle: true } });
  item('c7_qiliyu', { name: '奇力魚乾', desc: '日月潭的奇力魚曬成的魚乾，小小一尾，很下飯。全體回復氣血 300。', type: 'use', price: 220, ch: 7, icon: 'food', use: { target: 'allies', heal: 300 } });
  item('c7_taiyi', { name: '太乙符', desc: '燈母祠裡留下的古符。對敵全體造成 500 點無屬性傷害。', type: 'use', price: 0, ch: 7, icon: 'talisman', use: { target: 'enemies', damage: 500, battle: true } });
  // equipment
  item('c7_sw_chitong', { name: '赤銅劍', desc: '老吳從平地帶上山的赤銅劍，劍身泛著紅光。', type: 'weapon', price: 1350, ch: 7, icon: 'sword', who: ['xinghe'], stats: { atk: 60 } });
  item('c7_sw_chixia', { name: '赤霞劍', desc: '劍身像玉山頂上的晚霞。火屬性。', type: 'weapon', price: 1600, ch: 7, icon: 'sword', who: ['xinghe'], elem: 'fire', stats: { atk: 64, mag: 4 } });
  item('c7_fn_qinglan', { name: '青嵐扇', desc: '扇面畫著雲霧林的青嵐，搧一下，霧就聽話。', type: 'weapon', price: 1600, ch: 7, icon: 'fan', who: ['yungui'], elem: 'wood', stats: { atk: 8, mag: 66, mp: 18 } });
  item('c7_fn_qingxu', { name: '清虛古符', desc: '清虛真人留下的古符扇。扇骨上刻著一行小字：「看得見，就好。」', type: 'weapon', price: 0, ch: 7, icon: 'fan', who: ['yungui'], elem: 'wood', stats: { atk: 9, mag: 74, mp: 22 } });
  item('c7_ar_lieren', { name: '獵人皮衣', desc: '山上獵人穿的皮衣，擋風也擋荊棘。', type: 'armor', price: 950, ch: 7, icon: 'armor', stats: { def: 30, hp: 30 } });
  item('c7_ar_taiyi', { name: '苔衣', desc: '藤婆用苔蘚與麻線縫的衣裳，摸起來濕濕涼涼的。', type: 'armor', price: 1200, ch: 7, icon: 'armor', stats: { def: 32, mag: 8 } });
  item('c7_ar_dengmu', { name: '燈母織衣', desc: '燈母祠深處的織衣，輕得像水上的月光。也許有一天，有人會穿上它。', type: 'armor', price: 0, ch: 7, icon: 'armor', who: ['baizhi'], stats: { def: 40, mag: 18 }, resist: ['water'] });
  item('c7_ft_shanxing', { name: '山行草鞋', desc: '山上人家編的草鞋，走碎石坡也不打滑。', type: 'feet', price: 600, ch: 7, icon: 'shoes', stats: { def: 10, spd: 6 } });
  item('c7_ac_tiegu', { name: '鐵骨護腕', desc: '山徑上撿到的舊護腕，鐵骨還很結實。', type: 'acc', price: 0, ch: 7, icon: 'ring', stats: { atk: 6, def: 6 } });
  item('c7_ac_huyue', { name: '湖月石', desc: '湖霧裡撿到的石頭，裡面像關著一輪月亮。抵抗水屬性。', type: 'acc', price: 0, ch: 7, icon: 'gem', stats: { mag: 8 }, resist: ['water'] });
  item('c7_ac_huyuepei', { name: '湖月珮', desc: '阿財從水沙連帶來的玉珮。抵抗水屬性。', type: 'acc', price: 1400, ch: 7, icon: 'jade', stats: { mag: 10 }, resist: ['water'] });
  item('c7_ac_jingang', { name: '金剛護符', desc: '燈母祠前庭的石像衛守著的護符。免疫暈眩。', type: 'acc', price: 0, ch: 7, icon: 'charm', stats: { def: 14 }, immune: ['stun'] });
  item('c7_ac_hongyu', { name: '黑鵯紅羽', desc: '布農祖母給的紅色小羽毛。「冷的時候，想想那隻鳥。」火屬性傷害提升，抵抗水屬性。', type: 'acc', price: 0, ch: 7, icon: 'charm', who: ['xinghe'], stats: { mag: 10 }, resist: ['water'] });
  item('c7_ac_tengxin', {
    name: '藤心結', desc: '藤婆用夢藤細枝編的小結。「你走進去過，也走出來了。」最大氣血提升一成，戰鬥開始時持續回復。', type: 'acc', price: 0, ch: 7, icon: 'vine', who: ['xinghe'],
    stats: { get hp() { return C7.pctHp(0.1); } },
  });
  item('c7_ac_xinghuo', { name: '星火石', desc: '無光之影散去時留下的一顆小石頭，裡面有一點不滅的火。火屬性傷害提升。', type: 'acc', price: 0, ch: 7, icon: 'gem', stats: { mag: 6 } });
  // hidden slot items (never in the inventory)
  item('c7_flame_wick', {
    name: '燈芯將盡', desc: '借來的燈火日漸黯淡。最大氣血隨燈芯降低。', type: 'key', price: 0, ch: 7, icon: 'lantern',
    stats: { get hp() { return C7.flamePenalty(); } },
  });
  item('c7_heart_fire', {
    name: '心火', desc: '用十八年的每一個人點起來的火。最大氣血提升，火屬性傷害提升。', type: 'key', price: 0, ch: 7, icon: 'lantern',
    stats: { get hp() { return C7.pctHp(0.08); } },
  });
  // key items & materials
  item('c7_key_cap', { name: '褪色的皮帽', desc: '一頂鄒族獵人的皮帽，帽上的羽毛已經褪色。', type: 'key', price: 0, ch: 7, icon: 'hat' });
  item('c7_key_knife', { name: '獵刀', desc: '卡在斷崖樹根間的一把獵刀。', type: 'key', price: 0, ch: 7, icon: 'sword' });
  item('c7_key_leopard', { name: '雲豹之紋', desc: '星河掌心浮現的霧狀斑紋。在霧中，雲豹的路會為你顯現。', type: 'key', price: 0, ch: 7, icon: 'misc' });
  item('c7_key_taixu_book', { name: '太虛古籍', desc: '冥燈印碎裂後留下的一冊古籍，邊角有清虛真人的批注。雲歸一直帶在身邊。', type: 'key', price: 0, ch: 7, icon: 'scroll' });
  item('c7_mat_bear', { name: '熊膽', desc: '黑熊精被淨化時落下的東西……其實只是一塊沾著黑水的石頭。', type: 'material', price: 60, ch: 7, icon: 'misc' });
  item('c7_mat_jiao', { name: '蛟鱗', desc: '蛟沉回潭底前掉下的一片鱗，像一面小鏡子。', type: 'material', price: 120, ch: 7, icon: 'gem' });
  item('c7_mat_jingang', { name: '金剛石屑', desc: '石像衛身上剝落的石屑，硬得刮不動。', type: 'material', price: 80, ch: 7, icon: 'gem' });

  // ================================================================================================ data: skills
  const SK = D.skills;
  const sk = (id, d) => { SK[id] = d; };
  sk('hy_fangshou', { name: '放手', desc: '【被動】握太緊，鳥會死。氣血低於三成時，防禦提升。', mp: 0, type: 'passive', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'buff' });
  sk('yg_mankan', { name: '慢看', desc: '【被動】別人走過去看不見的東西，他會蹲下來看。戰鬥中看穿敵人的弱點屬性。', mp: 0, type: 'passive', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'buff' });
  sk('xh_xinhuo_passive', { name: '心火', desc: '【被動】自己的火。最大氣血提升，火屬性傷害提升。', mp: 0, type: 'passive', elem: 'fire', target: 'self', power: 0, fx: 'lantern', sfx: 'lantern' });
  // enemy skills
  sk('c7_e_qf_slash', { name: '鬼面斬', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.2, fx: 'slash', sfx: 'slash' });
  sk('c7_e_qf_sneer', { name: '冷笑', desc: '面具下傳來冷冷的笑聲。', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, buffs: [{ stat: 'def', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'debuff' });
  for (const [el, nm, fx, sfx] of [['metal', '五行符・金', 'metal', 'metal'], ['wood', '五行符・木', 'wood', 'thunder'], ['water', '五行符・水', 'water', 'water'], ['fire', '五行符・火', 'fire', 'fire'], ['earth', '五行符・土', 'earth', 'earth']]) {
    sk('c7_e_yg_fu_' + el, { name: nm, desc: '', mp: 0, type: 'mag', elem: el, target: 'enemy', power: 1.1, fx, sfx });
    sk('c7_e_qx_' + el, { name: nm, desc: '', mp: 0, type: 'mag', elem: el, target: 'enemy', power: 1.2, fx: fx + '_big', sfx });
  }
  sk('c7_e_yg_wulei', { name: '五雷', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 0.8, fx: 'wood_big', sfx: 'thunder' });
  sk('c7_e_yg_ding', { name: '定身', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.3, turns: 1 }, fx: 'seal', sfx: 'magic' });
  sk('c7_e_fu_fire', { name: '符火', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 0.8, fx: 'fire', sfx: 'fire' });
  sk('c7_e_fu_guard', { name: '護主', desc: '', mp: 0, type: 'buff', elem: null, target: 'ally', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' });
  sk('c7_e_drag', { name: '拖拽', desc: '黑色的手抓住腳踝。', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 0.9, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'water', sfx: 'splash' });
  sk('c7_e_xideng', { name: '熄燈', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.4, fx: 'dark', sfx: 'dark' });
  sk('c7_e_heichao', { name: '黑潮', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.9, fx: 'water_big', sfx: 'water' });
  sk('c7_e_jieguang', { name: '借光', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 0.8, drain: 0.5, buffs: [{ stat: 'mag', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'dark' });
  sk('c7_e_tunhuo', { name: '吞火', desc: '黑水吞掉了身上的光。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, cure: ['atkUp', 'defUp', 'magUp', 'spdUp', 'regen', 'shield'], fx: 'dark', sfx: 'dark' });
  sk('c7_e_jiao_tail', { name: '甩尾', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 0.8, fx: 'slash_multi', sfx: 'slash2' });
  sk('c7_e_jiao_dive', { name: '潛水', desc: '蛟沉入水中——刀槍碰不到牠了！', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'water', sfx: 'splash' });
  sk('c7_e_jiao_wave', { name: '翻浪', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.1, fx: 'water_big', sfx: 'splash' });
  sk('c7_e_qx_sword', { name: '太虛劍氣', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemies', power: 0.7, fx: 'slash_multi', sfx: 'slash2' });
  sk('c7_e_qx_ding', { name: '定身咒', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.35, turns: 1 }, fx: 'seal', sfx: 'bell' });
  sk('c7_e_qx_struggle', { name: '掙扎', desc: '清虛的手停在半空中——冥燈印的光暗了一瞬！', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'ghost' });
  sk('c7_e_seal_fire', { name: '冥火', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.7, fx: 'dark', sfx: 'dark' });
  sk('c7_e_seal_gather', { name: '雷雲聚集', desc: '殿頂的天空，雷雲正在聚集……', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'thunder' });
  sk('c7_e_qx_wulei', { name: '五雷轟頂', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 1.4, fx: 'wood_big', sfx: 'thunder' });

  // ================================================================================================ data: enemies & troops
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  function enemy(id, d) {
    const c = D.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(0, Math.round(c.exp * expM)), gold: Math.max(0, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([it, rate]) => ({ item: it, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, p.skills ? { skills: p.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })) } : {}));
    D.enemies[id] = e;
  }
  enemy('c7_bear_boss', {
    name: '黑熊精（潮病）', art: 'bear_spirit', lv: 24, elem: 'earth', boss: true, immune: BOSS_IMM, endAt: 0.3,
    m: { hp: 16.2, atk: 3.6, mag: 2.05, def: 1.2, spd: 2.05, exp: 5, gold: 4 }, // sim_story: was hp 9 atk 1.75 mag 1 spd 1
    skills: [['e_bear_swipe', 3], ['e_bear_roar', 1], ['e_claw', 2]], drops: [['c7_mat_bear', 1]],
    phases: [{ at: 0.5, text: '黑熊精胸前的黑水沸騰起來——黑潮狂怒！', buffs: [{ stat: 'atk', amt: 0.3, turns: 8 }] }],
    desc: '胸前的白色 V 字斑紋被黑水染污，眼角淌著黑色的水。牠不是獵物——牠是病了。',
  });
  enemy('c7_heart_qf', {
    name: '心魔・鬼面', sprite: 'qingfeng_mask', lv: 24, elem: 'metal', boss: true, immune: BOSS_IMM.concat(['poison', 'seal']),
    resist: ['metal', 'wood', 'water', 'fire', 'earth'],
    m: { hp: 14, atk: 1.0, mag: 0.8, def: 1.6, spd: 1.1, exp: 0, gold: 0 },
    skills: [['c7_e_qf_slash', 3], ['c7_e_qf_sneer', 1], ['attack', 2]],
    desc: '妳追了三年的那張面具。它站在祖先牌位前，一動不動。',
  });
  enemy('c7_heart_yg', {
    name: '心魔・雲歸', sprite: 'yungui', lv: 25, elem: 'wood', weak: ['metal'], boss: true, immune: BOSS_IMM,
    m: { hp: 8.1, atk: 1.45, mag: 3.4, def: 1.0, spd: 2.05, exp: 4, gold: 0 }, // sim_story: was hp 5.2 atk 0.8 mag 1.9 spd 1.15
    skills: [['c7_e_yg_wulei', 2], ['c7_e_yg_ding', 1], ['c7_e_yg_fu_wood', 2]], drops: [['c7_huiqi', 1]],
    phases: [{ at: 0.5, lines: [['心魔・雲歸', '你連我都打不贏，還想找他？']] }],
    desc: '不喝酒、不偷懶、不玩物喪志。他是雲歸以為師父想要的那個弟子。',
  });
  enemy('c7_fu_spirit', {
    name: '符靈', art: 'sea_wisp', variant: 2, lv: 24, elem: null, m: { hp: 0.75, atk: 0.7, mag: 1.0, spd: 1.1 },
    skills: [['c7_e_fu_fire', 3], ['c7_e_fu_guard', 1]], drops: [],
    desc: '心魔・雲歸身邊飄著的符紙，自己會燒起來。',
  });
  enemy('c7_drown_shadow', {
    name: '溺影', art: 'water_ghost', variant: 2, lv: 24, elem: 'water', weak: ['earth'], resist: ['water'], m: { hp: 0.9, atk: 1.0, mag: 0.9, spd: 1.0 },
    skills: [['c7_e_drag', 3], ['attack', 1]], drops: [],
    desc: '黑海裡伸出來的手。它們不記得自己是誰，只記得往下拉。',
  });
  enemy('c7_lightless', {
    name: '無光之影', sprite: 'xinghe', scale: 1.3, lv: 26, elem: 'water', weak: ['fire'], resist: ['water'], boss: true, immune: BOSS_IMM,
    m: { hp: 13.3, atk: 2.75, mag: 3.25, def: 1.1, spd: 2.05, exp: 6, gold: 0 }, // sim_story: was hp 9 atk 1.6 mag 1.9 spd 1.2
    skills: [['c7_e_xideng', 3], ['c7_e_heichao', 2], ['c7_e_jieguang', 1], ['attack', 1]], drops: [['c7_ac_xinghuo', 1]],
    phases: [{
      at: 0.5, lines: [['無光之影', '你明明……只是一個燈籠舖的學徒……'], ['xinghe:smile', '對啊。所以我最會點燈了！']],
      skills: [['c7_e_tunhuo', 6, 'once'], ['c7_e_xideng', 3], ['c7_e_heichao', 2], ['attack', 1]],
    }],
    desc: '和星河一模一樣的影子，沒有臉，只有兩個空洞。周身有逆流的黑水。',
  });
  enemy('c7_jiao_boss', {
    name: '蛟', art: 'jiao', lv: 26, elem: 'water', weak: ['earth'], resist: ['water', 'fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 8.5, atk: 3.6, mag: 3.4, def: 1.15, spd: 2.0, exp: 5, gold: 5 }, // sim_story: was atk 1.8 mag 1.7 spd 1
    skills: [['e_jiao_bite', 3], ['c7_e_jiao_tail', 2], ['attack', 1]], drops: [['c7_mat_jiao', 1]],
    desc: '長著角的巨大水蛇，鱗片上纏著黑色的水草，眼中淌著黑水。湖底的老東西也被潮病染了。',
  });
  enemy('c7_qingxu_boss', {
    name: '清虛真人（被附身）', sprite: 'qingxu', lv: 27, elem: 'wood', boss: true, immune: BOSS_IMM,
    m: { hp: 9, atk: 2.65, mag: 3.1, def: 1.2, spd: 1.95, exp: 0, gold: 0 }, // sim_story: was atk 1.7 mag 2.0 spd 1.25
    skills: [['c7_e_qx_sword', 2], ['c7_e_qx_ding', 1]],
    phases: [{ at: 0.6, lines: [['qingxu:hurt', '雲歸……燈在我背上……打它……']], summon: ['c7_dark_seal'] }],
    desc: '雲歸的師父。背上嵌著一盞藍黑色的長明燈，黑色的絲線扎進他的四肢。',
  });
  enemy('c7_dark_seal', {
    name: '冥燈印', art: 'ghost_lantern', variant: 2, lv: 27, elem: 'water', weak: ['fire'], resist: ['water'], immune: BOSS_IMM,
    m: { hp: 5.5, atk: 0.95, mag: 2.5, def: 1.1, spd: 1.65, exp: 12, gold: 10 }, // sim_story: was atk 0.6 mag 1.6 spd 1.05
    skills: [['c7_e_seal_fire', 1]], drops: [['c7_key_taixu_book', 1]],
    phases: [
      { at: 0.5, lines: [['qingxu:serious', '五雷——轟頂！']] },
      { at: 0.2, lines: [['yungui:cry', '師父，再撐一下！']] },
    ],
    desc: '藍黑火焰的長明燈，懸在清虛背後。它一直在吸師父的命。',
  });

  const TR = D.troops;
  const troop = (id, enemies, bg, bgm, extra) => { TR[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle2' }, extra || {}); };
  const bossT = (id, enemies, bg, bgm) => { TR[id] = { enemies, bg, bgm: bgm || 'boss', boss: true, flee: false }; };
  troop('t_c7_mist', ['fog_spirit', 'fog_spirit'], 'alishan');
  troop('t_c7_mist_snake', ['fog_spirit', 'green_snake_v2', 'green_snake_v2'], 'alishan');
  troop('t_c7_eyes', ['hundred_eye', 'fog_spirit', 'fog_spirit'], 'alishan');
  bossT('t_c7_bear', ['c7_bear_boss'], 'alishan');
  troop('t_c7_peak', ['mountain_ghost_v2', 'hundred_eye'], 'yushan');
  troop('t_c7_peak2', ['fog_spirit_v1', 'fog_spirit_v1', 'serpent_shade'], 'yushan');
  troop('t_c7_cloud', ['serpent_shade', 'serpent_shade', 'mushroom_spirit_v2'], 'forest');
  troop('t_c7_cloud2', ['mushroom_spirit_v2', 'mushroom_spirit_v2', 'fog_spirit_v1'], 'forest');
  troop('t_c7_vision', ['serpent_shade', 'hundred_eye', 'hundred_eye'], 'vision');
  bossT('t_c7_mirror_qf', ['c7_heart_qf'], 'vision');
  bossT('t_c7_mirror_yg', ['c7_heart_yg', 'c7_fu_spirit', 'c7_fu_spirit'], 'vision');
  troop('t_c7_drown_shadow', ['c7_drown_shadow', 'c7_drown_shadow', 'c7_drown_shadow'], 'vision', 'battle2', { flee: false });
  bossT('t_c7_shadow', ['c7_lightless'], 'vision');
  bossT('t_c7_jiao', ['c7_jiao_boss'], 'lake');
  troop('t_c7_lake', ['lamp_moth', 'lamp_moth', 'lamp_moth'], 'lake');
  troop('t_c7_lake2', ['tide_grudge', 'lamp_moth', 'lamp_moth'], 'lake');
  troop('t_c7_shrine', ['stone_guardian', 'lamp_moth', 'lamp_moth'], 'shrine');
  troop('t_c7_shrine2', ['stone_guardian', 'stone_guardian'], 'shrine');
  troop('t_c7_shrine3', ['jiao', 'lamp_moth'], 'shrine');
  troop('t_c7_moths', ['lamp_moth', 'lamp_moth', 'lamp_moth'], 'shrine', 'battle2', { flee: false });
  bossT('t_c7_qingxu', ['c7_qingxu_boss'], 'shrine');

  // ================================================================================================ quests
  const Q = (D.quests = D.quests || {});
  Q.q_ch7_main = {
    name: '借來的光', main: true,
    desc: '星河身上的火是借來的，正一天天黯淡。陳伯說，能重新點燃它的只有燈母，而去見燈母的路在夢裡。',
    stages: ['搭阿伯的牛車到阿里山腳。', '穿過阿里山古道，前往鄒族大社。', '從神木林前往玉山山徑。', '在玉山的雲霧林裡找到藤婆。', '在藤婆的火邊，走進夢裡。', '跟著雲豹，前往有白鹿的湖。', '在湖霧中找到燈母祠。'],
    doneText: '星河的火，是他自己的了。',
  };
  Q.q_ch7_pasuya = {
    name: '霧中的獵刀', lantern: true,
    desc: 'Voyu 的弟弟 Pasuya 去年冬天在霧谷追山羌，再也沒有回來。母親一直把他的位置留著。',
    stages: ['在神木林西南的霧谷裡，替 Voyu 看一看。', '把找到的東西帶回 Voyu 的家。'],
    doneText: '塔山的山稜上，有一點小小的光往深處走去了。',
  };
  Q.q_ch7_murals = {
    name: '燈母祠的壁畫', lantern: true,
    desc: '燈母祠的牆上畫著很久很久以前的事。也許，還有沒發生的事。',
    stages: ['看完燈母祠上殿與下殿的六幅壁畫。'],
    doneText: '一盞燈，等了那麼多代，都是一個人發光。',
  };
  Q.q_ch7_salt = {
    name: '老吳的鹽', desc: '山上的人家用得著鹽。在山腳交易寮買一包粗鹽，帶給鄒族大社的婦人。',
    stages: ['把粗鹽帶給鄒族大社小米架旁的婦人。'], doneText: '換到了三碗愛玉凍。',
  };

  // ================================================================================================ 燈芯將盡 (draining flame)
  const FLAME_MIN = 30;
  C7.flameOn = () => !!(G.state && G.state.flags && typeof G.state.flags.ch7_flame === 'number' && !G.state.flags.ch7_xinhuo);
  C7.flameVal = () => (C7.flameOn() ? G.state.flags.ch7_flame : 100);
  const PCT_ITEMS = { c7_flame_wick: 1, c7_heart_fire: 1, c7_ac_tengxin: 1 };
  // 星河's max HP before percentage modifiers (level + flat equipment)
  C7.flatHp = (id = 'xinghe') => {
    const m = G.state && G.state.members && G.state.members[id];
    const d = D.chars[id];
    if (!m || !d) return 0;
    let hp = d.base.hp + d.growth.hp * (m.lv - 1);
    for (const slot in m.equip) {
      const iid = m.equip[slot];
      if (!iid || PCT_ITEMS[iid]) continue;
      const it = I[iid];
      if (it && it.stats && typeof it.stats.hp === 'number') hp += it.stats.hp;
    }
    return Math.round(hp);
  };
  C7.pctHp = (k) => Math.floor(C7.flatHp('xinghe') * k);
  C7.flamePenalty = () => {
    if (!C7.flameOn()) return 0;
    const n = C7.flatHp('xinghe');
    return Math.floor(n * C7.flameVal() / 100) - n;
  };
  // keep the hidden slots in sync with the flags and clamp HP to the new max
  C7.applyFlame = () => {
    const m = G.state && G.state.members && G.state.members.xinghe;
    if (!m) return;
    if (C7.flameOn()) m.equip.c7flame = 'c7_flame_wick'; else delete m.equip.c7flame;
    if (G.state.flags.ch7_xinhuo) m.equip.c7heart = 'c7_heart_fire';
    const st = G.Party.stats('xinghe');
    if (m.hp > st.mhp) m.hp = st.mhp;
    if (m.mp > st.mmp) m.mp = st.mmp;
  };
  // change the flame (story beats −4 / +8, battles −2)
  C7.flame = async (S, delta, o = {}) => {
    if (!C7.flameOn()) return;
    const f = G.state.flags;
    const before = f.ch7_flame;
    f.ch7_flame = U.clamp(Math.round(before + delta), FLAME_MIN, 100);
    const gain = f.ch7_flame - before;
    C7.applyFlame();
    if (gain > 0) {
      const m = G.state.members.xinghe;
      const mhp = G.Party.stats('xinghe').mhp;
      if (m) m.hp = Math.min(mhp, m.hp + Math.round(mhp * gain / 100));
    }
    if (S && !o.silent) {
      if (delta < 0) { S.sfx('wind'); S.toast('星河的燈芯又黯淡了一些……', 'lantern'); } else { S.sfx('heal'); S.toast('人的溫暖讓燈多亮一刻。', 'lantern'); }
    }
  };
  C7.awaken = () => {
    const f = G.state.flags;
    delete f.ch7_flame;
    f.ch7_xinhuo = true;
    C7.applyFlame();
    const m = G.state.members.xinghe;
    if (m) { const st = G.Party.stats('xinghe'); m.hp = st.mhp; m.mp = st.mmp; }
  };

  // small flame glyph (used on the map HUD and next to 星河's HP bar in battle)
  function drawFlame(ctx, x, y, size, t, v) {
    const low = v < 50;
    let fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
    if (low) fl *= 0.7 + 0.3 * Math.abs(Math.sin(t * 13.7) * Math.sin(t * 3.1 + Math.sin(t * 7.9)));
    const s = size * (0.55 + 0.45 * v / 100) * fl;
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, -s * 0.2, 0, 0, -s * 0.2, s * 2.2);
    g.addColorStop(0, `rgba(255,190,90,${0.35 * fl * v / 100 + 0.1})`); g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g; ctx.fillRect(-s * 2.4, -s * 2.6, s * 4.8, s * 4.8);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.5);
    ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.75, s * 0.6, 0, s * 0.75);
    ctx.bezierCurveTo(-s * 0.75, s * 0.6, -s * 0.9, -s * 0.5, 0, -s * 1.5);
    const fg = ctx.createLinearGradient(0, -s * 1.5, 0, s * 0.75);
    fg.addColorStop(0, '#fff2c0'); fg.addColorStop(0.45, low ? '#ff9a4a' : '#ffc060'); fg.addColorStop(1, low ? '#b8401a' : '#e8601a');
    ctx.fillStyle = fg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.28, s * 0.45, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,250,230,0.85)'; ctx.fill();
    ctx.restore();
  }
  C7.drawFlame = drawFlame;
  function drawFlameHud(ctx, t) {
    if (!C7.flameOn() || G.Script.busy()) return;
    const v = C7.flameVal();
    const x = 24, y = G.H - 70, w = 196;
    G.UI.plate(ctx, x, y, w, 46, 0.6, 20);
    drawFlame(ctx, x + 26, y + 26, 13, t, v);
    G.Render.text(ctx, '燈芯', x + 46, y + 10, { size: 19, color: '#f6e2b8' });
    G.UI.bar(ctx, x + 96, y + 19, 84, 9, v / 100, v < 50 ? '#ffb07a' : '#ffd070', v < 50 ? '#c8502a' : '#d8902a');
  }
  // per map-scene HUD hook (instance only; installed from each ch7 map's onEnter)
  C7.hookMap = (m) => {
    if (!m || m._c7hud) return;
    m._c7hud = true;
    const od = m.drawHud;
    m.drawHud = function (ctx, t) { od.call(this, ctx, t); try { drawFlameHud(ctx, t); } catch (e) { /* HUD is cosmetic */ } };
  };
  // the dwindling light in 星河's chest (map light source following the player)
  C7.chestLight = () => {
    const m = G.mapScene;
    if (!m || !m.player || !C7.flameOn()) return [];
    const v = C7.flameVal();
    return [{ x: (m.player.px - T / 2) / T, y: (m.player.py - 70 - T / 2) / T, r: 30 + v * 0.9, color: '#ffb060', flicker: v < 50 ? 0.6 : 0.25 }];
  };

  // ================================================================================================ battle hooks
  // G.Battle.start is wrapped (once) to: drain the flame after battles, draw the flame next to 星河's HP, record who
  // fell last (game-over text), run 紅纓 / 雲歸 / 星河 passives and the special boss rules below (keyed by troop id).
  const BEATS = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
  const hasSkill = (id, s) => { const m = G.state.members[id]; return !!(m && m.skills && m.skills.includes(s)); };
  function fireBonus(u) {
    if (!u || !u.m) return 0;
    let b = 0;
    if (u.id === 'xinghe' && G.state.flags.ch7_xinhuo) b += 0.1;
    const eq = u.m.equip || {};
    for (const s in eq) { if (eq[s] === 'c7_ac_hongyu') b += 0.1; if (eq[s] === 'c7_ac_xinghuo') b += 0.15; }
    return b;
  }
  function weakOf(e) {
    const out = [];
    for (const el of Object.keys(BEATS)) {
      if ((e.resist || []).includes(el)) continue;
      if ((e.weak || []).includes(el) || (e.elem && BEATS[el] === e.elem)) out.push(el);
    }
    return out;
  }
  // custom body drawing for ghost / silhouette sprite enemies
  let silCanvas = null;
  function drawSpecialUnit(sc, ctx, u, t, mode) {
    if (u.alpha <= 0.01) return;
    const x = u.x + u.ox, y = u.y + u.oy, sc2 = u.scale || 1;
    ctx.save();
    ctx.globalAlpha = u.alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(x, y, 46 * sc2, 13 * sc2, 0, 0, Math.PI * 2); ctx.fill();
    if (mode === 'ghost') {
      G.Sprites.drawBattle(ctx, u.sprite, u.pose, t + (u.hx || 0), x, y, { flip: true, ghost: true, scale: sc2 });
    } else {
      // black silhouette with hollow eyes and back-flowing black water
      const W = 320, H = 340;
      if (!silCanvas) silCanvas = U.makeCanvas(W, H);
      const c = silCanvas.getContext('2d');
      c.setTransform(G.S, 0, 0, G.S, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, W, H);
      G.Sprites.drawBattle(c, u.sprite, u.pose, t + (u.hx || 0), W / 2, H - 20, { flip: true, scale: sc2, shadow: false });
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(6,6,14,0.94)'; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      ctx.drawImage(silCanvas, 0, 0, silCanvas.width, silCanvas.height, x - W / 2, y - H + 20, W, H);
      for (let i = 0; i < 14; i++) {
        const ph = (t * 0.5 + i / 14) % 1;
        ctx.globalAlpha = u.alpha * (1 - ph) * 0.6;
        ctx.fillStyle = '#1a2440';
        ctx.beginPath(); ctx.arc(x + Math.sin(i * 2.7 + t) * 40 * sc2, y - ph * 200 * sc2, (5 + (i % 3) * 3) * (1 - ph * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = u.alpha;
      const ey = y - 128 * sc2;
      for (const dx of [-9, 9]) {
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x + dx * sc2 * 0.9, ey, 5 * sc2, 7 * sc2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(120,150,220,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    if (u.flash > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - 100, 0, x, y - 100, 120);
      g.addColorStop(0, `rgba(255,255,255,${u.flash * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 120, y - 220, 240, 240);
    }
    ctx.restore();
  }

  const RULES = {};
  C7.RULES = RULES;
  // 心魔・鬼面: 紅纓 alone. Turns 1–3 the mask cannot be hurt and her blows rebound ×0.5 (「恨」);
  // from her 4th turn the command 「喚他的名字」 is offered — choosing it ends the battle.
  RULES.t_c7_mirror_qf = (sc) => {
    const hy = () => sc.party.find((p) => p.id === 'hongying');
    sc.c7.ghost = { c7_heart_qf: 'ghost' };
    sc.c7.onDamage = (tg, dmg, op) => {
      const h = hy();
      if (tg.id === 'c7_heart_qf' && h && (h.turns || 0) <= 3) {
        sc.popText(tg, '——', '#c8c8d8');
        if (op.attacker === h && !h.dead) {
          const back = Math.max(1, Math.round(dmg * 0.5));
          h.hp = Math.max(0, h.hp - back);
          h.flash = 1;
          sc.pops.push({ x: h.x, y: h.y - 110, text: String(back), t: 0, color: '#ff4a4a', size: 34 });
          sc.popText(h, '恨', '#ff5a5a', -40);
          if (h.hp <= 0) sc.kill(h);
        }
        return false;
      }
      return dmg;
    };
    const oPC = sc.playerCommand.bind(sc);
    sc.playerCommand = async (u) => {
      if (u.id === 'hongying' && (u.turns || 0) >= 4) {
        const c = await G.Dialog.choice(['喚他的名字', '繼續攻擊']);
        G.Dialog.close();
        if (c === 0) {
          sc.banner('喚他的名字', '#ffe6a8');
          G.Audio.sfx('bell');
          await sc.wait(1.4);
          sc.c7.called = true;
          sc.result = 'win';
          sc.scriptedEnd = true;
          return null;
        }
      }
      return oPC(u);
    };
  };
  // 心魔・雲歸: casts the 五行符 that 克s a random party member's element; 雲歸 fights in his child form.
  RULES.t_c7_mirror_yg = (sc) => {
    sc.c7.ghost = { c7_heart_yg: 'ghost' };
    const oAI = sc.aiCommand.bind(sc);
    sc.aiCommand = (e) => {
      if (e.id === 'c7_heart_yg' && Math.random() < 0.55) {
        const tg = U.pick(sc.alive('party'));
        const el = Object.keys(BEATS).find((k) => BEATS[k] === tg.elem) || 'metal';
        return { kind: 'skill', skill: 'c7_e_yg_fu_' + el, targets: [tg] };
      }
      return oAI(e);
    };
    sc.c7.childYungui = true;
  };
  // 無光之影: black silhouette; extra line if 心火・燃燈 is used after it drops below half.
  RULES.t_c7_shadow = (sc) => {
    sc.c7.ghost = { c7_lightless: 'silhouette' };
    const oPS = sc.performSkill.bind(sc);
    sc.performSkill = async (u, s, targets, id) => {
      if (id === 'xh_xinhuo_ran' && !sc.c7.said) {
        const b = sc.enemies.find((e) => e.id === 'c7_lightless');
        if (b && b.hp < b.mhp * 0.5) { sc.c7.said = true; await G.Dialog.say('xinghe:serious', '熄不掉的。這不是借來的火。'); G.Dialog.close(); }
      }
      return oPS(u, s, targets, id);
    };
  };
  // 蛟: every 3rd turn it dives (physical attacks miss), then surfaces with 翻浪 on everyone.
  RULES.t_c7_jiao = (sc) => {
    const oAI = sc.aiCommand.bind(sc);
    sc.aiCommand = (e) => {
      if (e.id === 'c7_jiao_boss') {
        e.c7n = (e.c7n || 0) + 1;
        if (e.diving) { e.diving = false; sc.tween(e, { alpha: 1 }, 0.4); return { kind: 'skill', skill: 'c7_e_jiao_wave', targets: sc.alive('party') }; }
        if (e.c7n % 3 === 0) { e.diving = true; sc.tween(e, { alpha: 0.35 }, 0.5); return { kind: 'skill', skill: 'c7_e_jiao_dive', targets: [e] }; }
      }
      return oAI(e);
    };
    const oAE = sc.applyEffect.bind(sc);
    sc.applyEffect = (u, tg, s, hits) => {
      if (tg.diving && s.type === 'phys') { sc.popText(tg, '無效', '#a8c8e8'); G.Audio.sfx('miss'); return; }
      return oAE(u, tg, s, hits);
    };
  };
  // 清虛真人 + 冥燈印 (see screenplay 6.2)
  RULES.t_c7_qingxu = (sc) => {
    const QX = 'c7_qingxu_boss', SEAL = 'c7_dark_seal';
    const ELEMS = ['wood', 'fire', 'earth', 'metal', 'water'];
    const LINES = ['……別哭。修道之人，哭什麼……', '你的符……畫得比以前好了……', '我的菇……後山那朵……你有沒有去看……'];
    const qx = () => sc.enemies.find((e) => e.id === QX);
    const seal = () => sc.enemies.find((e) => e.id === SEAL);
    const sealUp = () => { const s = seal(); return s && !s.dead; };
    const setElem = (e, el) => { e.elem = el; e.d = Object.assign({}, e.d, { elem: el }); };
    if (qx()) setElem(qx(), 'wood');
    const oAI = sc.aiCommand.bind(sc);
    sc.aiCommand = (e) => {
      const foes = sc.alive('party');
      if (e.id === QX) {
        e.c7n = (e.c7n || 0) + 1;
        const el = ELEMS[e.c7n % 5];
        setElem(e, el);
        if (sealUp() && e.c7n % 3 === 0) {
          sc.c7.struggle = (sc.c7.struggle || 0) + 1;
          sc.addStatus(seal(), 'defDown', 2);
          return { kind: 'skill', skill: 'c7_e_qx_struggle', targets: [e], c7line: ['qingxu:hurt', LINES[(sc.c7.struggle - 1) % 3]] };
        }
        const r = Math.random();
        if (r < 0.6) return { kind: 'skill', skill: 'c7_e_qx_' + el, targets: [U.pick(foes)] };
        if (r < 0.85) return { kind: 'skill', skill: 'c7_e_qx_sword', targets: foes };
        return { kind: 'skill', skill: 'c7_e_qx_ding', targets: [U.pick(foes)] };
      }
      if (e.id === SEAL) {
        const q = qx();
        if (q && !q.dead) {
          const amt = Math.max(0, Math.min(q.hp - 1, Math.round(q.mhp * 0.02)));
          if (amt > 0) { q.hp -= amt; e.hp = Math.min(e.mhp, e.hp + amt); sc.popText(e, '吸命', '#8a9aff'); }
        }
        if (!sc.c7.p3 && e.hp <= e.mhp * 0.5) sc.c7.p3 = true;
        if (sc.c7.p3) {
          sc.c7.thunder = (sc.c7.thunder || 0) + 1;
          if (sc.c7.thunder % 2 === 1) return { kind: 'skill', skill: 'c7_e_seal_gather', targets: [e] };
          return { kind: 'skill', skill: 'c7_e_qx_wulei', targets: foes };
        }
        return { kind: 'skill', skill: 'c7_e_seal_fire', targets: foes };
      }
      return oAI(e);
    };
    sc.c7.onDamage = (tg, dmg) => {
      if (tg.id !== QX) return dmg;
      if (!sealUp() && sc.enemies.some((e) => e.id === SEAL)) return dmg;
      const d2 = Math.max(0, Math.min(dmg, tg.hp - 1));
      if (tg.hp - d2 <= 1 && !tg.st.stun && sealUp()) { tg.st.stun = 2; sc.c7.pendingLine = true; }
      return d2;
    };
    const oEx = sc.execute.bind(sc);
    sc.execute = async (u, cmd) => {
      if (cmd && cmd.c7line) { await G.Dialog.say(cmd.c7line[0], cmd.c7line[1]); G.Dialog.close(); }
      await oEx(u, cmd);
      if (sc.c7.pendingLine) { sc.c7.pendingLine = false; await G.Dialog.say('yungui:cry', '別再打他了——打燈！'); G.Dialog.close(); }
    };
    // the party's auto-battle should aim at the lamp once it is visible
    const oAuto = sc.autoCommand.bind(sc);
    sc.autoCommand = (u) => {
      const cmd = oAuto(u);
      if (cmd && cmd.targets && cmd.targets.length === 1 && cmd.targets[0] && cmd.targets[0].id === QX && sealUp()) cmd.targets = [seal()];
      return cmd;
    };
    const oCP = sc.checkPhases.bind(sc);
    sc.checkPhases = async () => {
      await oCP();
      const s = seal();
      if (s && !s.c7pos) { s.c7pos = true; s.x = s.hx = 175; s.y = s.hy = 455; }
    };
    const oCE = sc.checkEnd.bind(sc);
    sc.checkEnd = () => {
      if (!sc.result) { const s = seal(); if (s && s.dead) sc.result = 'win'; }
      return oCE();
    };
  };

  function decorate(sc, troopId) {
    sc.c7 = { tid: typeof troopId === 'string' ? troopId : null };
    C7.lastFell = null;
    // last party member to fall (game-over text)
    const oKill = sc.kill.bind(sc);
    sc.kill = (u) => { if (u.side === 'party') C7.lastFell = u.id; return oKill(u); };
    // damage: fire bonus, rule hooks, 紅纓「放手」
    const oDmg = sc.damage.bind(sc);
    sc.damage = (tg, dmg, op = {}) => {
      const a = op.attacker;
      if (a && a.side === 'party' && op.elem === 'fire') { const b = fireBonus(a); if (b) dmg = Math.round(dmg * (1 + b)); }
      if (sc.c7.onDamage) { const r = sc.c7.onDamage(tg, dmg, op); if (r === false) return; if (typeof r === 'number') dmg = r; }
      oDmg(tg, dmg, op);
      if (tg.side === 'party' && tg.id === 'hongying' && !tg.dead && !tg.c7fs && hasSkill('hongying', 'hy_fangshou') && tg.hp < tg.mhp * 0.3) {
        tg.c7fs = true;
        tg.def = Math.round(tg.def * 1.2);
        sc.popText(tg, '放手', '#ffd8a8', -70);
      }
    };
    // 藤心結: regen for the first two turns
    for (const p of sc.party) {
      const eq = (p.m && p.m.equip) || {};
      if (Object.values(eq).includes('c7_ac_tengxin') && !p.dead) p.st.regen = 2;
    }
    // drawing: ghost / silhouette enemies, child 雲歸
    const oDU = sc.drawUnit.bind(sc);
    sc.drawUnit = (ctx, u, t) => {
      const mode = sc.c7.ghost && sc.c7.ghost[u.id];
      if (mode && u.side === 'enemy') return drawSpecialUnit(sc, ctx, u, t, mode);
      if (sc.c7.childYungui && u.id === 'yungui') {
        const x = u.x + u.ox, y = u.y + u.oy;
        ctx.save(); ctx.translate(x, y); ctx.scale(0.74, 0.74); ctx.translate(-x, -y);
        oDU(ctx, u, t);
        ctx.restore();
        return;
      }
      return oDU(ctx, u, t);
    };
    // HUD: flame next to 星河, 雲歸「慢看」 weakness badges
    const oHud = sc.drawHud.bind(sc);
    sc.drawHud = (ctx, t) => {
      oHud(ctx, t);
      try {
        if (C7.flameOn()) {
          const i = sc.party.findIndex((p) => p.id === 'xinghe');
          if (i >= 0) {
            const pw = G.W - 380, cw = pw / Math.max(sc.party.length, 1);
            drawFlame(ctx, 360 + 12 + i * cw + 76, G.H - 112 + 26, 10, t, C7.flameVal());
          }
        }
        const yg = sc.party.find((p) => p.id === 'yungui');
        if (yg && !yg.dead && hasSkill('yungui', 'yg_mankan') && !sc.result) {
          for (const e of sc.alive('enemy')) {
            const ws = weakOf(e);
            const hy = e.y - sc.unitH(e) - 34;
            ws.slice(0, 2).forEach((el, k) => G.UI.elemBadge(ctx, el, e.x - (Math.min(ws.length, 2) - 1) * 13 + k * 26, hy, 11));
          }
        }
      } catch (e) { /* cosmetic */ }
    };
    if (sc.c7.tid && RULES[sc.c7.tid]) RULES[sc.c7.tid](sc);
  }

  function afterBattle(r) {
    if (!C7.flameOn()) return;
    if (C7._drainAt === G.state.battles) return;   // GameOver retries resolve the original promise too
    C7._drainAt = G.state.battles;
    if (r === 'win' || r === 'flee') {
      const before = G.state.flags.ch7_flame;
      G.state.flags.ch7_flame = Math.max(FLAME_MIN, before - 2);
      if (before >= 50 && G.state.flags.ch7_flame < 50) G.UI.toast('星河的燈芯開始不穩地跳動……', { icon: 'lantern' });
    }
    C7.applyFlame();
  }

  if (!G.Battle.__c7) {
    const origStart = G.Battle.start;
    G.Battle.start = function (troopId, o) {
      const p = origStart.apply(this, arguments);
      let sc = null;
      try {
        const top = G.Scenes.top();
        if (top instanceof G.Battle.Scene && !top.c7) { sc = top; decorate(sc, troopId); }
      } catch (e) { C7.err = e; }
      if (!sc) return p;
      return p.then((r) => { try { afterBattle(r); } catch (e) { C7.err = e; } return r; });
    };
    G.Battle.__c7 = true;
  }
  // 「燈，熄了。」— game over text when 星河 was the last to fall while the flame is guttering
  if (G.GameOverScene && !G.GameOverScene.__c7) {
    const Base = G.GameOverScene;
    const C7GameOver = class extends Base {
      draw(ctx) {
        if (!(C7.flameOn() && C7.lastFell === 'xinghe')) return super.draw(ctx);
        const t = this.t;
        ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, G.W, G.H);
        const a = Math.min(1, t / 1.2);
        ctx.save(); ctx.globalAlpha = a;
        const fl = Math.max(0, 0.5 - t * 0.12) * (0.6 + 0.4 * Math.sin(t * 11) * Math.sin(t * 4.3));
        if (fl > 0) drawFlame(ctx, G.W / 2, 250, 18, t, 30 * fl + 10);
        G.Render.text(ctx, '燈，熄了。', G.W / 2, 330, { size: 56, align: 'center', color: '#e8d8c0', glow: 'rgba(255,120,60,0.4)', glowBlur: 20 });
        G.Render.text(ctx, '但只要還有人記得，就不算結束。', G.W / 2, 404, { size: 22, align: 'center', color: '#a89880' });
        G.UI.panel(ctx, G.W / 2 - 150, 460, 300, this.list.items.length * 50 + 24, { ornament: false });
        this.list.draw(ctx, G.W / 2 - 136, 472, 280, t, { size: 24 });
        ctx.restore();
      }
    };
    C7GameOver.__c7 = true;
    G.GameOverScene = C7GameOver;
  }

  // ================================================================================================ map helpers
  // every ch7 map: keep the flame slots in sync, install the flame HUD, then the map's own onEnter
  function M(def) {
    const oe = def.onEnter;
    def.onEnter = async (S) => {
      C7.applyFlame();
      C7.hookMap(G.mapScene);
      if (oe) await oe(S);
    };
    return def;
  }
  C7.M = M;
  const F = () => G.state.flags;
  const lightsWith = (list) => () => (typeof list === 'function' ? list() : list).concat(C7.chestLight());
  // fade, full heal, fade back (story rests; the BGM of the map resumes)
  async function rest(S, o = {}) {
    await S.fadeOut(0.8);
    G.Music.stop(0.8);
    if (o.before) await o.before();
    G.Party.healAll();
    C7.applyFlame();
    G.Audio.sfx('heal');
    await S.wait(1.0);
    if (o.after) await o.after();
    await S.fadeIn(0.8);
    if (!o.noBgm && G.mapScene) G.Music.play(G.Mapx.val(G.mapScene.def.bgm));
  }
  C7.rest = rest;
  // place the party for a cutscene: leader + followers on given cells
  // (followers not listed — usually the cats — sit right behind the leader)
  function stage(S, spots) {
    for (const [id, x, y, dir] of spots) S.setPos(id, x, y, dir);
    const m = G.mapScene;
    if (!m) return;
    const listed = spots.map((s) => s[0]);
    for (const f of m.followers) if (!listed.includes(f.id)) { f.setCell(m.player.x, m.player.y); f.dir = m.player.dir; f.queue = []; }
  }
  // NOTE: S.move on a *follower* never resolves (MapScene.updateFollowers ignores onArrive) — always use { wait: false }.
  // spawn helper that is idempotent (re-running a scene never doubles an actor)
  function spawn(S, d) { S.remove(d.id); return S.spawn(d); }
  // simple mesmerising aura under the party in the vision realm
  function partyAura(ctx, m, t) {
    const list = [m.player].concat(m.hideFollowers ? [] : m.followers.filter((f) => f.visible));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of list) {
      const r = 34 + 4 * Math.sin(t * 2.2 + a.px * 0.01);
      const g = ctx.createRadialGradient(a.px, a.py - 30, 4, a.px, a.py - 30, r * 1.8);
      g.addColorStop(0, 'rgba(255,214,120,0.28)'); g.addColorStop(0.6, 'rgba(255,190,90,0.12)'); g.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = g; ctx.fillRect(a.px - r * 2, a.py - 30 - r * 2, r * 4, r * 4);
      ctx.strokeStyle = `rgba(255,220,140,${0.35 + 0.15 * Math.sin(t * 3 + a.px)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(a.px, a.py - 4, 24, 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  C7.partyAura = partyAura;

  // ================================================================================================ chapter entry
  G.Story.ch7 = async (S) => {
    S.chapter(7);
    const st = G.state;
    // party: 星河 紅纓 雲歸 (+ the cats 芋圓 & 麻糬 follow). 白芷 is away (taken across the strait).
    if (st.party.includes('baizhi')) G.Party.leave('baizhi');
    const avg = G.Party.active().length ? Math.round(G.Party.active().reduce((a, m) => a + m.lv, 0) / G.Party.active().length) : 23;
    for (const id of ['xinghe', 'hongying', 'yungui']) {
      if (!st.members[id]) G.Party.join(id, Math.max(23, avg));
      else if (!st.party.includes(id)) G.Party.join(id);
    }
    st.party = ['xinghe', 'hongying', 'yungui'].concat(st.party.filter((p) => !['xinghe', 'hongying', 'yungui', 'baizhi'].includes(p)));
    for (const id of ['xinghe', 'hongying', 'yungui']) G.Story.ensureLevel(id, 23);
    delete st.flags.yuyuan_hidden; delete st.flags.mochi_hidden;
    // started standalone (debug ?startch=7): bring starting gear up to the end of chapter 6
    const xm = st.members.xinghe;
    if (xm && xm.equip.weapon === 'sw_bamboo') {
      const kit = { xinghe: { weapon: 'sw_qixing', armor: 'ar_chain', head: 'hd_yuguan', feet: 'ft_lupi' }, hongying: { weapon: 'sp_qilin', armor: 'ar_chain', feet: 'ft_lupi' }, yungui: { weapon: 'fn_qixing', armor: 'ar_brocade', feet: 'ft_lupi' } };
      for (const id in kit) for (const slot in kit[id]) st.members[id].equip[slot] = kit[id][slot];
      for (const [it, n] of [['xumingsan', 6], ['wanguo', 3], ['fenglisu', 3], ['huanhunxiang', 3], ['xiangbao', 3]]) G.Inv.add(it, n);
      st.flags.yuyuan_joined = true;   // the cats joined in earlier chapters
      st.flags.mochi_joined = true;
    }
    st.flags.ch7_start = true;
    st.flags.ch7_flame = 80;
    C7.applyFlame();
    G.Party.healAll();
    C7.applyFlame();
    S.quest('q_ch7_main', 0);
    await S.titleCard(G.Chapters[7], '正月底・往雲裡去的路');
    await S.warp('sugar_shrine', 10, 8, 'down', { fade: 0.6 });
  };

  // ================================================================================================ 1.1 sugar_shrine 甘蔗田・土地公廟
  (function () {
    const g = new Grid(24, 18, 'f', 701);
    g.blob(11, 8.5, 6.5, 4.6, '.', 0.25);
    g.rect(8, 4, 5, 5, ':');
    g.path([[12, 9], [12, 0]], '=');
    g.path([[11, 9], [17, 9], [17, 6]], '=');
    g.path([[11, 9], [11, 17]], '=');
    g.blob(18, 7.5, 4, 2.6, ':', 0.2);
    g.rect(15, 3, 5, 3, ':');
    g.reserve(8, 7, 6, 4); g.reserve(12, 0, 1, 18); g.reserve(11, 9, 1, 9); g.reserve(11, 9, 7, 1);
    g.obj('shrine_small', 9, 5, { text: '福德' });
    g.obj('incense_burner', 9, 7);
    g.obj('house_minnan', 15, 3, { w: 5, h: 3, door: 2, v: 1 });
    g.obj('cart', 14, 8);
    g.obj('well', 14, 12);
    g.obj('crate', 20, 6, { label: '調查' });
    g.obj('basket', 21, 7);
    g.obj('jar', 20, 4);
    g.obj('pot', 8, 9, { label: '調查' });
    g.obj('tree_banana', 21, 11); g.obj('tree_betel', 22, 14); g.obj('tree_betel', 1, 2); g.obj('bamboo', 0, 0); g.obj('bamboo', 23, 0);
    g.obj('tree_banana', 5, 13); g.obj('bush', 7, 3); g.obj('flowers', 13, 6);
    g.reserve(6, 4, 1, 1); g.reserve(6, 5, 2, 1); g.reserve(18, 8, 4, 3);
    g.scatter(['tallgrass'], 230, { on: 'f' });
    const crateObj = g.objs.find((o) => o.t === 'crate');
    crateObj.interact = async (S) => {
      if (!S.has('ch7_crate')) {
        S.flag('ch7_crate');
        await S.say('', '工寮外堆著一捆捆剛砍下的甘蔗，捆繩上寫著「送山腳」。最上面兩枝掉了出來。');
        await S.give('c7_ganzhe', 2);
      } else await S.say('', '一捆捆甘蔗，甜甜的汁液從切口滲出來，引來幾隻螞蟻。');
    };
    const potObj = g.objs.find((o) => o.t === 'pot');
    potObj.interact = async (S) => {
      if (!S.has('ch7_intro')) return;
      if (S.has('ch7_porridge')) { await S.say('', '鍋底還黏著一點顏色不明的粥。它好像在冒泡。'); return; }
      S.flag('ch7_porridge');
      await S.lines([
        ['hongying:normal', '我煮了粥。喝。'],
        ['', '一碗顏色不明的粥正在冒泡。'],
        ['xinghe:hurt', '紅纓……我是快死了，但我還沒有想死。'],
      ]);
      S.emote('hongying', '💢');
      await S.lines([
        ['hongying:angry', '你給我喝！'],
        ['yungui:think', '粥裡為什麼會有……鱗片？'],
        ['hongying:shy', '……那是甘蔗皮。大概。'],
      ]);
    };

    G.Maps.define('sugar_shrine', M({
      name: '甘蔗田・土地公廟', subtitle: '府城北郊，往諸羅山的路上', place: 'tainan',
      bgm: (st) => (st.flags.ch7_intro ? 'night' : 'sad'),
      start: [12, 10],
      light: (st) => (st.flags.ch7_dawn ? { ambient: 0.25, color: '#2a2040', playerR: 200 } : { ambient: 0.55, color: '#0a1030', playerR: 180 }),
      lights: lightsWith([{ x: 9.5, y: 6, r: 120, color: '#ffb060', flicker: 0.4 }]),
      particles: [{ type: 'mist', density: 0.5 }, { type: 'motes', density: 0.5 }],
      tiles: g.rows(),
      objects: g.objs,
      chests: [{ id: 'c7_ss_a', x: 6, y: 4, item: 'jinchuang', n: 2 }],
      npcs: [
        { id: 'ss_buffalo', sprite: 'buffalo', x: 18, y: 9, dir: 'left', wander: 1, name: '水牛', talk: async (S) => {
          await S.say('', '水牛慢慢嚼著草，對逃亡、燈火、命運都毫無興趣。');
          S.emote('yuyuan', '…');
          await S.say('', '芋圓蹲到水牛旁邊，跟牠一起面無表情地嚼著空氣。兩個都活得很有道理。');
        } },
        { id: 'ss_abo', sprite: 'old_m', x: 20, y: 9, dir: 'left', name: '阿伯', if: (st) => !!st.flags.ch7_cart, talk: async (S) => {
          if (!S.has('ch7_ganzhe')) {
            await S.lines([['阿伯', '囝仔，你們躲在土地公廟睡了一暝喔？好佳哉土地公有保庇。'], ['阿伯', '這個少年家面色白得像紙，是破病了？'], ['阿伯', '甘蔗拿去，路上咬兩枝，甜的會讓人有力。']]);
            S.flag('ch7_ganzhe');
            await S.give('c7_ganzhe', 3);
          } else await S.say('阿伯', '上山要有禮貌喔。那邊是鄒族的獵場，不是無人的山。');
          await S.say('阿伯', '我等一下要載糖去山腳交易寮，順路，上車啦。');
          if (await S.choice(['上車', '再等一下'], { cancel: 1 }) === 0) await C7.rideCart(S);
        } },
      ],
      events: [
        { id: 'intro', trigger: 'auto', if: (st) => !st.flags.ch7_intro, run: async (S) => { await C7.scene71(S); } },
        { id: 'north', trigger: 'touch', x: 11, y: 0, w: 3, h: 1, run: async (S) => {
          if (!S.has('ch7_cart')) { await S.say('hongying:serious', '天還沒亮，外面都是追兵。先在廟這邊躲一下。'); await S.move('player', 'D'); return; }
          if (!S.has('ch7_rode')) { await S.say('yungui:normal', '用走的太慢了。去找阿伯，搭他的牛車吧。'); await S.move('player', 'D'); return; }
          await S.warp('alishan_trail', 23, 41, 'up');
        } },
        { id: 'south', trigger: 'touch', x: 10, y: 17, w: 3, h: 1, run: async (S) => {
          await S.say('yungui:serious', '往南是府城。長明宮的人還在那邊找我們——不能回去。');
          await S.move('player', 'U');
        } },
        { id: 'cart', trigger: 'action', x: 14, y: 8, w: 2, h: 1, label: '牛車', run: async (S) => {
          if (!S.has('ch7_cart')) { await S.say('', '一輛載滿糖包的牛車。'); return; }
          if (await S.choice(['搭牛車去山腳', '再等一下'], { cancel: 1 }) === 0) await C7.rideCart(S);
        } },
        { id: 'shrine', trigger: 'action', x: 9, y: 5, w: 2, h: 2, label: '參拜', run: async (S) => {
          await S.say('', '小小的土地公廟，香爐裡只剩一截香。');
          if (S.has('ch7_intro')) await S.say('yungui:normal', '土地公爺爺，借住了一夜。……謝謝。');
        } },
      ],
    }));
  })();

  C7.rideCart = async (S) => {
    S.flag('ch7_rode');
    S.quest('q_ch7_main', 1);
    await S.fadeOut(0.6);
    await S.travel('tainan', 'alishan', { label: '搭著阿伯的牛車，往山腳去……' });
    S.objective('穿過阿里山古道，往山上的部落去');
    await S.warp('alishan_trail', 23, 41, 'up', { fade: 0.4 });
  };

  // 7-1 燈芯
  C7.scene71 = async (S) => {
    S.flag('ch7_intro');
    S.bgm('sad');
    S.light({ ambient: 0.55 });
    stage(S, [['player', 10, 8, 'down'], ['hongying', 9, 8, 'right'], ['yungui', 11, 7, 'left'], ['yuyuan', 10, 9, 'up'], ['mochi', 8, 7, 'left']]);
    await S.camera(10, 7, 0.4);
    await S.fadeIn(1.0);
    await S.wait(0.6);
    await S.lines([
      ['', '甘蔗田中的小土地公廟。香爐裡只剩一截香。廟前，星河躺在稻草上，臉色死白。'],
      ['yungui:serious', '遁符……只剩這一張了。我們離府城大概三十里。'],
      ['yungui:serious', '長明宮的人要追，天亮前就會追到。'],
      ['hongying:angry', '那就讓他們來。'],
      ['hongying:sad', '……是我太慢了。我要是再快一步，白芷就不會——'],
      ['yungui:normal', '洛姑娘。他倒下的時候，妳是第一個衝過去的。'],
      ['yungui:normal', '我們都慢了。慢的不只妳一個。'],
      ['', '廟前的石階上，麻糬一動不動地坐著，望著海的方向。牠脖子上還繫著白芷綁的那條紅繩。'],
      ['', '芋圓一聲不吭地爬上星河的肚子，把自己攤成一片灰色的毛毯。'],
    ]);
    S.move('yuyuan', 'U', { wait: false });
    await S.wait(0.4);
    S.emote('yuyuan', '♥');
    await S.lines([
      ['xinghe:hurt', '……芋圓……你好重……'],
      ['hongying:surprise', '星河！'],
      ['xinghe:hurt', '我……做了一個夢。夢到我在一盞燈裡……燈油快沒了。'],
    ]);
    S.sfx('fire');
    S.flash('#ffb060', 0.3, 0.35);
    await S.wait(0.4);
    S.flash('#ffb060', 0.2, 0.2);
    await S.say('yungui:think', '這是……他身體裡的火在熄？');
    S.sfx('bell');
    S.flash('#bfe0ff', 0.5, 0.6);
    S.emote('hongying', '!'); S.emote('yungui', '!'); S.emote('mochi', '!');
    await S.lines([
      ['hongying:surprise', '這是陳伯給的令牌——它在發光！'],
      ['chenbo:normal', '……聽得到嗎？喂，臭小子們，聽得到就吭一聲。'],
      ['yungui:surprise', '陳伯？這令牌能傳聲？'],
      ['chenbo:normal', '引魂人的令牌，本來是給在海上走散的人互相找的。'],
      ['chenbo:normal', '我在九份，腳還不能走。……白芷呢？'],
      ['', '沉默。紅纓握緊令牌。'],
      ['hongying:sad', '被夜玄帶走了。星河……星河也快不行了。'],
      ['chenbo:sad', '…………我就知道。'],
      ['chenbo:serious', '聽好，我只說一次。星河身上的火，不是他自己的。'],
      ['chenbo:serious', '十八年前那一夜，他在八斗子外海已經淹死了。'],
      ['chenbo:serious', '是燈靈——是白芷——把她自己的一點火借給了他。'],
      ['xinghe:surprise', '……什麼？'],
      ['chenbo:serious', '她離得越遠，那點火就越弱。她被帶過海，火就要熄了。'],
      ['xinghe:hurt', '所以……我本來早就……'],
      ['xinghe:hurt', '哈……難怪我從小就特別怕冷。'],
      ['hongying:angry', '笨蛋，這種時候還說笑！'],
      ['chenbo:normal', '能重新點燃那盞火的，只有燈母。'],
      ['chenbo:normal', '去見燈母的路不在地上，在夢裡。'],
      ['yungui:think', '夢裡……您是說「內景」？入定？'],
      ['chenbo:normal', '比那個更深。玉山底下的雲霧林，住著一個老太婆。'],
      ['chenbo:normal', '叫藤婆。她欠我一個人情——不，是我欠她。總之去找她。'],
      ['chenbo:normal', '往東上阿里山，再往玉山走。那一路是鄒族、布農族的山。'],
      ['chenbo:serious', '上山要有禮貌。那是人家的山，不是你們的。'],
      ['chenbo:normal', '還有，臭小子……'],
      ['chenbo:sad', '…………給我活著回來。燈籠舖還欠你三個月的工錢。'],
    ]);
    S.sfx('switch');
    await S.wait(0.5);
    await S.lines([
      ['xinghe:smile', '……老頭子還是一樣，說好聽的話會死。'],
      ['hongying:serious', '我揹你。'],
      ['xinghe:surprise', '欸？不用不用，我可以自己走——'],
    ]);
    await S.move('player', 'U');
    S.shake(3, 0.2);
    S.emote('player', '💧');
    await S.move('hongying', 'R', { wait: false });
    await S.lines([
      ['hongying:angry', '你站都站不穩還逞強！'],
      ['yungui:smug', '洛姑娘力氣大，就讓她揹。我負責在旁邊說風涼話，分工明確。'],
      ['', '芋圓又爬回星河肚子上攤平，顯然認為自己負責暖肚子。麻糬走過來，在星河手邊坐下，尾巴繞住他的手腕。'],
    ]);
    await S.fadeOut(1.0);
    S.flag('ch7_dawn');
    S.light({ ambient: 0.25, color: '#2a2040' });
    S.particles([{ type: 'mist', density: 0.4 }, { type: 'motes', density: 0.6 }]);
    stage(S, [['player', 12, 8, 'right'], ['hongying', 11, 8, 'right'], ['yungui', 12, 9, 'right'], ['yuyuan', 11, 9, 'right']]);
    spawn(S, { id: 'abo_cs', sprite: 'old_m', x: 17, y: 6, dir: 'down', name: '阿伯' });
    await S.fadeIn(1.0);
    await S.move('abo_cs', 'DDL');
    S.emote('abo_cs', '!');
    await S.lines([
      ['阿伯', '哎唷，土地公廟前面躺一排人，嚇死我！你們是乞食還是逃犯？'],
      ['yungui:smile', '阿伯，我們是……迷路的香客。這位少年家發燒。'],
      ['阿伯', '發燒就要去山上吸好空氣。我正好要載糖去山腳，上車啦。'],
      ['hongying:shy', '……謝謝阿伯。'],
      ['阿伯', '謝什麼。土地公看到了，會記在我的帳上。'],
    ]);
    S.remove('abo_cs');
    S.flag('ch7_cart');
    S.refresh();
    await S.narrate(['星河的燈芯正在變弱。', '戰鬥與時間會耗損燈芯，最大氣血會隨之降低。', '在願意收留你們的人家過夜，可以讓燈芯多亮一些。'], { veil: 0.7 });
    S.objective('和糖廍的阿伯說話，搭牛車去山腳');
    S.bgm('night');
    S.cameraFollow();
  };

  // ================================================================================================ 1.2 alishan_trail 阿里山古道
  C7.bear = { alpha: 1, x: 22.5, y: 6.9 };
  (function () {
    const g = new Grid(48, 44, ',', 702);
    g.rect(0, 0, 2, 44, 'X'); g.rect(46, 0, 2, 44, 'X'); g.rect(0, 0, 48, 2, 'X'); g.rect(0, 42, 48, 2, 'X');
    for (const [x, y, rx, ry] of [[8, 30, 5, 3], [36, 33, 6, 4], [34, 8, 6, 3], [12, 12, 5, 3], [38, 26, 4, 2]]) g.blob(x, y, rx, ry, '.', 0.3);
    const P = [[23, 43], [23, 39], [16, 36], [13, 31], [18, 27], [23, 25], [23, 19], [29, 16], [30, 13], [24, 11], [23, 6], [23, 0]];
    g.path(P, '='); g.path(P.map(([x, y]) => [x + 1, y]), '=');
    g.path([[16, 37], [11, 40]], ':');
    g.path([[13, 30], [5, 27]], ':');
    g.path([[31, 12], [40, 10]], ':');
    g.blob(9, 39.5, 5, 2.6, ':', 0.2);
    g.blob(22.5, 8.5, 5, 2.6, '.', 0.2);
    g.path([[2, 22], [10, 23], [20, 22], [30, 21], [40, 22], [45, 22]], 'r', 2);
    g.rect(23, 19, 2, 6, 'B', ['r']);
    g.rect(22, 0, 4, 2, '='); g.rect(22, 42, 4, 2, '=');
    // landmarks
    g.obj('shophouse', 5, 36, { w: 4, door: 1, v: 2, text: '山產' });
    g.obj('stall', 10, 39, { counter: true, v: 1, text: '鹽鐵' });
    g.obj('barrel', 4, 39); g.obj('basket', 13, 38); g.obj('crate', 13, 39); g.obj('basket', 12, 41);
    g.obj('log', 18, 8);
    g.obj('signboard', 26, 40, { text: '阿里山' });
    g.reserve(9, 40, 4, 2); g.reserve(10, 38, 1, 1); g.reserve(4, 27, 1, 1); g.reserve(5, 26, 2, 3); g.reserve(41, 10, 1, 1); g.reserve(39, 9, 3, 3);
    g.reserve(18, 6, 10, 6); g.reserve(20, 9, 3, 2);
    const enemies = [[14, 30], [32, 30], [34, 15], [11, 14], [37, 6], [38, 36]];
    for (const [x, y] of enemies) g.reserve(x - 1, y - 1, 3, 3);
    // forest: camphor / fern / bamboo below the river, cypress & fern in the misty north
    g.scatter(['tree_camphor', 'tree_fern', 'bamboo', 'tree_camphor', 'bush'], 150, { area: [2, 24, 44, 18], gap: 0 });
    g.scatter(['rock_big', 'rock_small', 'tallgrass', 'flowers'], 26, { area: [2, 24, 44, 18] });
    g.scatter(['tree_cypress', 'tree_fern', 'tree_cypress', 'tree_pine'], 95, { area: [2, 2, 44, 19], gap: 0 });
    g.scatter(['rock_small', 'rock_big', 'stump', 'tallgrass', 'reeds'], 30, { area: [2, 2, 44, 19] });
    g.scatter(['reeds'], 18, { on: ',.', test: (x, y) => Math.abs(y - 22) <= 3 });

    G.Maps.define('alishan_trail', M({
      name: '阿里山古道', subtitle: '山腳交易寮・往鄒族大社', place: 'alishan',
      bgm: 'mountain', start: [23, 40],
      light: { ambient: 0.22, color: '#0e2018', playerR: 220 },
      lights: lightsWith([]),
      particles: [{ type: 'mist', density: 1.2 }, { type: 'leaves', density: 0.6 }],
      tiles: g.rows(), objects: g.objs,
      chests: [
        { id: 'c7_at_a', x: 9, y: 40, item: 'c7_zhixue', n: 3 },
        { id: 'c7_at_b', x: 4, y: 27, item: 'ar_yunwen' },
        { id: 'c7_at_c', x: 41, y: 10, item: 'c7_huiqi', n: 2 },
      ],
      npcs: [
        { id: 'laowu', sprite: 'merchant', name: '老吳', x: 10, y: 38, dir: 'down', talk: async (S) => {
          if (S.has('ch7_tsou_welcome')) await S.say('老吳', 'Voyu 跟你們一起下山？那你們算是被當成客人了，好佳哉。');
          else {
            await S.lines([
              ['老吳', '來來來，鹽巴、鐵鍋、針線、布匹，山上的人都用得著。'],
              ['老吳', '我跟部落的人做生意二十年了。鹿皮、苧麻、愛玉子跟我換鹽和鐵。'],
              ['老吳', '欸，上山之前聽我一句：獵場是有主人的，一家一家分得清清楚楚。'],
              ['老吳', '別亂砍樹、別亂設陷阱，看到獵人就打招呼。人家才是這座山的主人。'],
              ['老吳', '這少年家……要不要先在我寮裡歇一下？臉色真歹看。'],
            ]);
          }
          const c = await S.choice(['看看貨', '不用了'], { cancel: 1 });
          if (c === 0) {
            await S.shop(['c7_zhixue', 'jinchuang', 'xumingsan', 'c7_huiqi', 'jiedu', 'c7_xingshen', 'c7_salt', 'c7_sw_chitong', 'sp_hanyu', 'fn_yunhai', 'c7_ar_lieren', 'c7_ft_shanxing'], { title: '山腳交易寮' });
            if (S.hasItem('c7_salt') && G.Quests.stage('q_ch7_salt') < 0) {
              await S.say('老吳', '粗鹽啊？山上的人家都缺這個。帶上去，到了部落，送給煮飯的阿姨，她們會很高興。');
              S.quest('q_ch7_salt', 0);
            }
          }
        } },
        { id: 'voyu_t', sprite: 'tsou_m', name: 'Voyu', x: 21, y: 9, dir: 'up',
          pos: (st) => (st.flags.ch7_bear_freed ? [24, 3] : [21, 9]),
          talk: async (S) => {
            if (!S.has('ch7_bear_freed')) return;
            await S.say('Voyu', '部落就在上面。霧要濃了，跟緊一點。');
          } },
      ],
      enemies: [
        { id: 'at1', troop: 't_c7_mist', x: 14, y: 30, art: 'fog_spirit', lv: 23, radius: 3 },
        { id: 'at2', troop: 't_c7_mist_snake', x: 32, y: 30, art: 'fog_spirit', lv: 23, radius: 3 },
        { id: 'at3', troop: 't_c7_mist', x: 34, y: 15, art: 'fog_spirit', lv: 23, radius: 2 },
        { id: 'at4', troop: 't_c7_mist_snake', x: 11, y: 14, art: 'fog_spirit', lv: 23, radius: 3 },
        { id: 'at5', troop: 't_c7_mist', x: 37, y: 6, art: 'fog_spirit', lv: 23, radius: 3 },
        { id: 'at6', troop: 't_c7_mist_snake', x: 38, y: 36, art: 'fog_spirit', lv: 23, radius: 3 },
      ],
      events: [
        { id: 'trader', trigger: 'auto', if: (st) => !st.flags.ch7_trader, run: async (S) => {
          S.flag('ch7_trader');
          S.face('laowu', 'player');
          await S.camera(16, 38, 0.6);
          await S.lines([
            ['老吳', '喲，平地人？這時節上山的平地人可不多。'],
            ['yungui:normal', '我們要去阿里山，再往玉山走。'],
            ['老吳', '往玉山？那得經過鄒族的大社。你們有人帶路嗎？'],
            ['xinghe:smile', '有……兩隻貓。'],
            ['', '芋圓抬頭看了老吳一眼，又低頭舔起爪子。麻糬望著來時的路。'],
            ['老吳', '哈哈哈！好吧，那記得我的話：獵場是有主人的。'],
            ['老吳', '一家一家的獵場，界線清清楚楚。看到獵人，先打招呼，說明來意。'],
            ['老吳', '人家讓你過，你才過。這是山上的禮。'],
          ]);
          S.cameraFollow();
        } },
        { id: 'bear', trigger: 'touch', x: 18, y: 11, w: 14, h: 3, if: (st) => !st.flags.ch7_bear_freed, run: async (S) => { await C7.scene72b(S); } },
        { id: 'south', trigger: 'touch', x: 22, y: 43, w: 4, h: 1, run: async (S) => { await S.warp('sugar_shrine', 12, 1, 'down'); } },
      ],
      warps: [
        { x: 22, y: 0, w: 4, h: 1, to: 'tsou_hosa', tx: 24, ty: 33, tdir: 'up', run: async (S) => {
          if (!S.has('ch7_bear_freed')) { await S.say('yungui:think', '霧裡好像有什麼……先別急著往上走。'); await S.move('player', 'D'); return false; }
          return true;
        } },
      ],
      drawGround: (ctx, t) => {
        const b = C7.bear;
        if (F().ch7_bear_freed && b.alpha <= 0.01) return;
        const md = G.Monsters.get('bear_spirit');
        const sc = md ? 170 / md.h : 0.6;
        ctx.save();
        ctx.globalAlpha = F().ch7_bear_freed ? b.alpha : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(b.x * T + 32, b.y * T + 58, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(b.x * T + 32, b.y * T + 60);
        ctx.scale(-sc, sc);
        G.Monsters.draw(ctx, 'bear_spirit', 0, 0, t, { state: b.state || 'idle', st: t % 2, variant: 0 });
        ctx.restore();
      },
    }));
  })();

  // 7-2b 山腳與黑熊
  C7.scene72b = async (S) => {
    S.bgm(null);
    S.shake(5, 0.7);
    S.sfx('earth');
    await S.say('', '霧中傳來低沉的咆哮。');
    await S.camera(22, 8, 0.9);
    await S.lines([
      ['', '倒木旁，一頭巨大的台灣黑熊人立而起。胸前的白色 V 字斑紋被黑水染污，眼角淌著黑色的水。'],
      ['', '熊的前方，一名鄒族獵人背靠倒木，右臂受傷，弓掉在地上。'],
      ['Voyu', '別過來！牠病了，會傷人！'],
      ['xinghe:surprise', '牠的眼睛……在流黑水。跟八斗子海上那些水鬼一樣。'],
      ['yungui:serious', '是黑水溝的「潮病」。海的毒，居然漫到這麼高的山上了。'],
      ['hongying:serious', '先把牠逼開！別讓牠碰到那個人！'],
      ['Voyu', '不要殺牠！牠不是獵物——牠是病了！'],
      ['hongying:surprise', '……！'],
      ['yungui:normal', '聽到了。打到牠站不起來就停手，剩下的交給我的淨化符。'],
    ]);
    const r = await S.battle('t_c7_bear', { bgmAfter: null });
    if (r !== 'win') return;
    S.flag('ch7_bear_freed');
    stage(S, [['player', 23, 10, 'up'], ['hongying', 22, 10, 'up'], ['yungui', 24, 10, 'up'], ['yuyuan', 23, 11, 'up']]);
    await S.camera(22, 8, 0.3);
    await S.say('', '黑熊精跪倒。雲歸擲出淨化符，符紙燃起青色火焰，貼在熊額上。');
    S.sfx('fire');
    S.flash('#8af0e0', 0.6, 0.6);
    await S.wait(0.5);
    S.sfx('wind');
    await S.say('', '黑水從熊的眼角、口鼻蒸發成煙，飄向西方——海的方向。');
    await S.say('', '熊搖搖頭，眼神恢復清澈，看了眾人一眼，慢慢轉身走進霧裡。');
    await G.Tweens.to(C7.bear, { alpha: 0, y: C7.bear.y - 2 }, 1.6, 'linear');
    S.bgm('mountain');
    await S.lines([
      ['Voyu', '……牠走了。'],
      ['Voyu', '謝謝你們沒有殺牠。'],
      ['xinghe:smile', '是你先說不要殺的。我們只是聽話。'],
      ['Voyu', '這一季不是打熊的時候，而且牠也不是因為我們需要才該死的。'],
      ['Voyu', '獵人取需要的，不取多的。生病的、帶著小的，都不碰。'],
      ['Voyu', '我叫 Voyu，是山上那個大社的人。你們是誰？為什麼在我們的獵場裡？'],
      ['yungui:serious', '打擾了。我們是從府城來的，要往玉山去找一位叫藤婆的人。'],
      ['yungui:normal', '我這位朋友生了怪病，只有她能救。'],
    ]);
    S.emote('player', '✦');
    await S.lines([
      ['', 'Voyu 打量星河。星河勉強站直，胸口的微光閃了一下。'],
      ['Voyu', '……他身上有很淡的光。像快熄的火塘。'],
      ['Voyu', '天快黑了，霧會更濃。先到部落去，讓長老見你們。'],
      ['Voyu', '長老說可以，你們就是客人。客人在山上不會餓肚子。'],
      ['hongying:smile', '謝謝你。……你的手臂，我幫你包紮。'],
      ['Voyu', '妳拿槍的手很穩，包紮的手倒是有點抖。'],
      ['hongying:shy', '囉、囉嗦！'],
    ]);
    await C7.flame(S, -4);
    S.flag('ch7_voyu');
    S.refresh();
    S.objective('跟著 Voyu，前往鄒族大社');
    S.cameraFollow();
  };

  // ================================================================================================ 1.3 tsou_hosa 鄒族大社
  (function () {
    const g = new Grid(48, 36, '.', 703);
    g.rect(0, 0, 48, 2, 'X'); g.rect(0, 0, 2, 36, 'X'); g.rect(43, 0, 5, 36, 'X'); g.rect(0, 34, 48, 2, 'X');
    g.rect(11, 0, 3, 2, ':'); g.rect(23, 34, 3, 2, ':');
    for (const [x, y, rx, ry] of [[8, 26, 5, 4], [38, 14, 4, 3], [30, 30, 5, 3]]) g.blob(x, y, rx, ry, ',', 0.3);
    g.rect(16, 6, 17, 7, 'S');
    const two = (pts, ch) => { g.path(pts, ch); g.path(pts.map(([x, y]) => [x + 1, y]), ch); };
    two([[23, 35], [23, 13]], ':');
    two([[16, 8], [12, 5], [12, 0]], ':');
    g.path([[24, 21], [31, 21]], ':'); g.path([[23, 16], [18, 21]], ':'); g.path([[25, 24], [35, 30]], ':');
    g.path([[16, 10], [7, 11]], ':'); g.path([[20, 14], [7, 19]], ':'); g.path([[32, 9], [39, 9]], ':');
    g.rect(39, 7, 4, 6, '#');
    g.obj('kuba', 22, 2, { door: false, solid: true });
    g.obj('tree_banyan', 28, 3);
    g.obj('firepit', 25, 9);
    g.obj('slate_house', 4, 8, { door: false });
    g.obj('slate_house', 4, 16, { door: false });
    g.obj('slate_house', 30, 18, { door: 1 });
    g.obj('slate_house', 17, 18, { door: false });
    g.obj('slate_house', 34, 27, { door: false });
    g.obj('granary', 5, 3); g.obj('granary', 40, 21);
    g.obj('millet_rack', 8, 13); g.obj('millet_rack', 19, 25);
    g.obj('fence_bamboo', 2, 22, { w: 3 }); g.obj('fence_bamboo', 38, 31, { w: 3 }); g.obj('fence_bamboo', 12, 24, { w: 3 });
    g.obj('basket', 9, 12); g.obj('jar', 3, 11); g.obj('jar', 29, 21); g.obj('basket', 34, 21); g.obj('totem', 15, 6);
    for (const [x, y] of [[43, 5], [43, 9], [44, 13], [43, 17]]) g.objs.push({ t: 'sea_of_clouds', x, y });
    g.reserve(15, 5, 19, 9); g.reserve(31, 21, 4, 3); g.reserve(18, 13, 8, 4); g.reserve(9, 12, 3, 3); g.reserve(20, 24, 4, 4);
    g.scatter(['tree_cypress', 'tree_camphor', 'bamboo', 'tree_fern', 'tree_camphor'], 70, { gap: 0, test: (x, y) => x < 5 || x > 38 || y < 5 || y > 29 });
    g.scatter(['flowers', 'tallgrass', 'bush', 'rock_small', 'millet'], 40, {});

    G.Maps.define('tsou_hosa', M({
      name: '鄒族大社', subtitle: 'hosa・阿里山的稜線上', place: 'alishan',
      bgm: (st) => (st.flags.ch7_tsou_welcome && !st.flags.ch7_morning ? 'mountain' : 'tribe'),
      start: [24, 30],
      light: (st) => (st.flags.ch7_morning ? { ambient: 0.1, color: '#2a2030' } : st.flags.ch7_tsou_welcome ? { ambient: 0.6, color: '#0a1030', playerR: 200 } : { ambient: 0.22, color: '#402818' }),
      lights: lightsWith([]),
      particles: (st) => (st.flags.ch7_tsou_welcome && !st.flags.ch7_morning ? [{ type: 'mist', density: 0.5 }, { type: 'embers', density: 0.4 }, { type: 'fireflies', density: 0.4 }] : [{ type: 'mist', density: 0.5 }, { type: 'embers', density: 0.25 }]),
      tiles: g.rows(), objects: g.objs,
      npcs: [
        { id: 'elder', sprite: 'tsou_elder', name: '長老', x: 24, y: 9, dir: 'right', talk: async (S) => {
          if (S.has('ch7_heartlamp_tsou')) await S.lines([['長老', '這幾天晚上，塔山那邊安靜了一點。雖然只有一點。'], ['長老', '你們下山以後，記得把在這裡看到的事，好好說給別人聽。']]);
          else if (S.has('ch7_tsou_welcome')) await S.lines([['長老', '客人要好好吃飯。在山上，餓肚子的人才會做錯判斷。'], ['長老', '我年輕時也是個很會說大話的人，跟那個生病的孩子一樣。']]);
          else await S.say('長老', '平地來的客人。先等 Voyu 回來吧。');
        } },
        { id: 'voyu', sprite: 'tsou_m', name: 'Voyu', x: 33, y: 22, dir: 'down', if: (st) => !!st.flags.ch7_tsou_welcome, talk: async (S) => { await C7.talkVoyu(S); } },
        { id: 'tw1', sprite: 'villager_f', name: '婦人', x: 10, y: 14, dir: 'left', wander: 1, talk: async (S) => {
          if (S.hasItem('c7_salt') && !S.has('ch7_salt_given')) {
            S.take('c7_salt', 1);
            S.flag('ch7_salt_given');
            await S.say('婦人', '客人還帶禮物來？那這個給你們。');
            await S.give('c7_aiyudong', 3);
            if (G.Quests.stage('q_ch7_salt') >= 0) S.quest('q_ch7_salt', 'done');
            return;
          }
          await S.say('婦人', '今年的小米要好好種，Hamo 看著呢。');
          await S.say('婦人', '愛玉子？那是山上的東西，平地人拿去洗出凍來，加糖水。我們笑他們：真會變花樣。');
        } },
        { id: 'tw2', sprite: 'villager_f2', name: '婦人', x: 21, y: 26, dir: 'left', wander: 1, talk: async (S) => {
          if (S.hasItem('c7_salt') && !S.has('ch7_salt_given')) {
            S.take('c7_salt', 1);
            S.flag('ch7_salt_given');
            await S.say('婦人', '客人還帶禮物來？那這個給你們。');
            await S.give('c7_aiyudong', 3);
            if (G.Quests.stage('q_ch7_salt') >= 0) S.quest('q_ch7_salt', 'done');
            return;
          }
          await S.say('婦人', '你們那個拿槍的姑娘，剛才在 kuba 前面自己停下腳步。有人教過她？');
          await S.say('hongying:shy', '……我只是覺得，那不是我該踏進去的地方。');
        } },
        { id: 'kid_m', sprite: 'child_m', name: '孩子', x: 19, y: 15, dir: 'down', wander: 2, talk: async (S) => {
          if (S.has('ch7_tsou_welcome')) { await S.say('孩子', '我長大要像 Voyu 哥哥一樣，在 kuba 裡被老人罵、被老人誇。'); return; }
          await S.say('孩子', '你們是從海那邊來的嗎？海是什麼味道？');
          await S.say('xinghe:smile', '鹹的。像……哭過以後的嘴巴。');
          await S.say('孩子', '好奇怪喔！');
        } },
        { id: 'kid_f', sprite: 'child_f', name: '孩子', x: 21, y: 15, dir: 'down', wander: 2, talk: async (S) => {
          await S.say('孩子', '那隻胖貓是什麼？牠可以吃嗎？');
          S.emote('yuyuan', '!');
          await S.say('', '芋圓僵住了。');
          await S.say('yungui:smug', '不行，牠太肥了，會膩。');
          S.emote('yuyuan', '💢');
          await S.say('', '芋圓轉過身，用屁股對著雲歸。');
          await S.say('孩子', '那隻花花的呢？');
          await S.say('hongying:normal', '那隻在等人。……不可以吃，也不可以吵她。');
        } },
      ],
      events: [
        { id: 'welcome', trigger: 'auto', if: (st) => !!st.flags.ch7_voyu && !st.flags.ch7_tsou_welcome, run: async (S) => { await C7.scene73(S); } },
        { id: 'kuba', trigger: 'action', x: 22, y: 2, w: 4, h: 3, label: '調查', run: async (S) => {
          await S.lines([
            ['', '鄒族的會所 kuba。高腳的木構，屋頂覆著茅草，屋頂上種著神花。'],
            ['', '這裡是部落男子議事、受訓的地方，部落最重要的祭儀也在這裡舉行。'],
            ['', '依照規矩，女性不進入 kuba；客人也不該隨意靠近。'],
          ]);
          if (!S.has('ch7_kuba_hy')) { S.flag('ch7_kuba_hy'); await S.say('hongying:normal', '……我們在廣場這邊說話就好。'); }
        } },
        { id: 'view', trigger: 'action', x: 43, y: 7, w: 1, h: 6, label: '眺望', run: async (S) => {
          await S.say('', '遠方的山稜在雲裡浮沉。鄒族的人說，人死後，靈魂會回到塔山。');
          if (S.has('ch7_tsou_welcome') && !S.has('ch7_morning')) {
            await S.say('', '塔山的方向，有許多極淡的光點擠在山稜上，像等著進門的人群。');
            await S.say('xinghe:think', '……它們在等。跟八斗子海上的那些燈一樣。');
          }
        } },
        { id: 'tasan_edge', trigger: 'touch', x: 42, y: 7, w: 1, h: 6, once: true, run: async (S) => {
          await S.say('hongying:serious', '再過去就是懸崖了。……那邊不是活人該去的方向。');
        } },
      ],
      warps: [
        { x: 31, y: 20, to: 'tsou_house', tx: 6, ty: 8, tdir: 'up', door: true },
        { x: 23, y: 35, w: 3, h: 1, to: 'alishan_trail', tx: 23, ty: 2, tdir: 'down' },
        { x: 11, y: 0, w: 3, h: 1, to: 'alishan_forest', tx: 21, ty: 37, tdir: 'up', run: async (S) => {
          if (!S.has('ch7_morning')) { await S.say('yungui:normal', '天快黑了。先聽長老的，今晚在部落過夜吧。'); await S.move('player', 'D'); return false; }
          return true;
        } },
      ],
      drawGround: (ctx, t) => {
        // the far ridge of 塔山 beyond the cliff (background only — unreachable)
        const night = F().ch7_tsou_welcome && !F().ch7_morning;
        const x0 = 44 * T, w = 4 * T;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, 0, w, 36 * T); ctx.clip();
        const sky = ctx.createLinearGradient(0, 0, 0, 36 * T);
        sky.addColorStop(0, night ? '#0c1028' : '#9fb4cc'); sky.addColorStop(0.5, night ? '#1a1838' : '#d8c8b0'); sky.addColorStop(1, night ? '#0a0a1a' : '#8a9aa8');
        ctx.fillStyle = sky; ctx.fillRect(x0, 0, w, 36 * T);
        ctx.fillStyle = night ? '#141628' : '#5a6a7a';
        ctx.beginPath(); ctx.moveTo(x0, 14 * T);
        for (let k = 0; k <= 20; k++) ctx.lineTo(x0 + k * w / 20, 11.5 * T - Math.sin(k * 0.7) * 50 - (k > 8 && k < 14 ? 60 : 0));
        ctx.lineTo(x0 + w, 36 * T); ctx.lineTo(x0, 36 * T); ctx.fill();
        if (night) {
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 26; i++) {
            const k = 8 + (i % 7) * 0.9 + U.hash(i, 3, 5) * 0.8;
            const px = x0 + k * w / 20, py = 11.5 * T - Math.sin(k * 0.7) * 50 - (k > 8 && k < 14 ? 60 : 0) - 6 - U.hash(i, 9, 2) * 16;
            const a = 0.25 + 0.2 * Math.sin(t * 1.3 + i);
            ctx.fillStyle = `rgba(200,220,255,${a})`;
            ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
          }
          if (C7.tasanSoul != null) {
            const k = 11 + C7.tasanSoul * 6;
            ctx.fillStyle = `rgba(255,236,190,${0.8 * (1 - C7.tasanSoul)})`;
            ctx.beginPath(); ctx.arc(x0 + k * w / 20, 11.5 * T - 110 - C7.tasanSoul * 40, 3.5, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      },
    }));
  })();

  C7.talkVoyu = async (S) => {
    const sq = F().ch7_sq_pasuya || 0;
    if (S.has('ch7_heartlamp_tsou')) { await S.say('Voyu', '謝謝你們。我媽今天第一次把弟弟的位置收起來了。'); return; }
    if (sq === 2) { await S.say('Voyu', '……你們找到了什麼嗎？到我家裡來，跟我媽說。'); return; }
    if (sq === 1) { await S.say('Voyu', '霧谷就在神木林西南邊。我一個人下去過三次……都沒找到。'); return; }
    if (S.has('ch7_pasuya_told') && S.has('ch7_morning')) {
      await S.lines([
        ['Voyu', '你們要去神木林？……我能拜託一件事嗎？'],
        ['Voyu', '霧谷就在神木林西南邊。我弟弟應該是在那附近不見的。'],
        ['Voyu', '我下去過三次，霧太濃，什麼都沒看見。'],
        ['Voyu', '你昨天說，你看得見塔山上的光。……你能不能，幫我看看？'],
        ['xinghe:serious', '我不知道我能看見多少。但我去看。'],
        ['Voyu', '謝謝。……不管找到什麼，或什麼都找不到，都告訴我。'],
      ]);
      S.flag('ch7_sq_pasuya', 1);
      S.quest('q_ch7_pasuya', 0);
      return;
    }
    if (S.has('ch7_morning')) { await S.say('Voyu', '神木林在北邊。我們從小就被帶去看那棵樹。'); return; }
    await S.lines([
      ['Voyu', '明天一早我帶你們去看神木。那是我們從小就被帶去看的樹。'],
      ['Voyu', '打獵最重要的不是箭射得多準，是知道什麼時候不該射。'],
      ['Voyu', '年輕人要在 kuba 裡聽老人講話，學山、學獵場、學規矩，學怎麼當個男人。'],
      ['Voyu', '今晚就睡我家吧。我媽已經在火塘邊鋪好了。'],
    ]);
  };

  // 7-3 kuba 前的火
  C7.scene73 = async (S) => {
    S.bgm('tribe');
    await S.fadeOut(0.4);
    stage(S, [['player', 24, 14, 'up'], ['hongying', 23, 14, 'up'], ['yungui', 25, 14, 'up'], ['yuyuan', 24, 15, 'up']]);
    spawn(S, { id: 'voyu_cs', sprite: 'tsou_m', x: 24, y: 13, dir: 'up', name: 'Voyu' });
    spawn(S, { id: 'kid_cs1', sprite: 'child_m', x: 20, y: 13, dir: 'right', name: '孩子' });
    spawn(S, { id: 'kid_cs2', sprite: 'child_f', x: 28, y: 13, dir: 'left', name: '孩子' });
    await S.camera(24, 11, 0.1);
    await S.fadeIn(0.8);
    await S.say('', '黃昏。部落的孩子們跑來圍觀，婦人們從小米架後探頭。');
    S.face('voyu_cs', 'down');
    await S.say('', 'Voyu 帶眾人走到 kuba 前廣場的邊緣，停下。紅纓也在廣場邊緣停下腳步，看了 kuba 一眼，沒有再往前。');
    await S.lines([
      ['Voyu', '在這裡等。我去請長老。'],
      ['xinghe:think', '那棟高高的房子是……？'],
      ['Voyu', 'kuba，男人的會所。男孩長大到一個年紀，就要進 kuba 學。'],
      ['Voyu', '學山、學獵、學部落的歷史，也學挨罵。'],
      ['Voyu', '我們的祭典也在那裡舉行。那是我們的，不是給外人看熱鬧的。'],
      ['Voyu', '還有，女人不進 kuba。這是我們的規矩。'],
      ['hongying:normal', '我知道。……我是說，我剛才就覺得，那不是我該靠近的地方。'],
      ['Voyu', '妳的眼睛很好。'],
    ]);
    await S.move('voyu_cs', 'RRRRUU');
    S.face('elder', 'down');
    await S.move('elder', 'DDD');
    await S.lines([
      ['長老', '平地來的客人。Voyu 說你們放走了那頭熊。'],
      ['yungui:serious', '是。牠被海上來的毒傷了，不是牠的錯。'],
      ['長老', '海上來的毒……'],
      ['長老', '坐吧。火邊坐。晚上的山會吃掉不靠火的人。'],
    ]);
    await S.fadeOut(1.0);
    S.flag('ch7_tsou_welcome');
    S.light({ ambient: 0.6, color: '#0a1030', playerR: 200 });
    S.particles([{ type: 'mist', density: 0.5 }, { type: 'embers', density: 0.5 }, { type: 'fireflies', density: 0.4 }]);
    S.bgm('mountain');
    S.remove('voyu_cs');
    stage(S, [['player', 24, 10, 'right'], ['hongying', 25, 11, 'up'], ['yungui', 26, 10, 'left'], ['yuyuan', 24, 11, 'right']]);
    S.setPos('elder', 25, 8, 'down');
    S.setPos('kid_cs1', 22, 12, 'right'); S.setPos('kid_cs2', 23, 12, 'up');
    await S.camera(25, 9, 0.1);
    await S.fadeIn(1.0);
    await S.say('', '夜，火堆旁。孩子們擠在後面偷看芋圓和麻糬。');
    await S.lines([
      ['長老', '你們要去找住在雲霧林的那個老婆婆。'],
      ['長老', '我小時候，我的祖父就說過她。說她從來不老，也從來不年輕。'],
      ['長老', '她不是我們的人，也不是平地的人。她只是一直在那裡。'],
      ['長老', '我們不去打擾她，她也不來打擾我們。這是山上的禮貌。'],
      ['xinghe:think', '長老……我想問一件事。'],
      ['xinghe:think', '我在山路上，看到東邊的山稜上有好多小小的光。'],
      ['', '長老停下撥火的手。火光照著他的臉。'],
      ['長老', '你看得到？'],
      ['xinghe:normal', '很淡。像一大群人站在門口，等著進去。'],
      ['長老', '……那是塔山。我們鄒族的人，死了以後，靈魂會回到塔山。'],
      ['長老', '這幾個月，晚上的塔山不安靜。獵人在山上過夜，聽見那邊在嘆氣。'],
      ['長老', '好像回去的人到了門口，卻走不進去。'],
      ['長老', '擠在那裡，回頭看部落，又不能回來。'],
      ['yungui:serious', '……跟平地一樣。海上的燈不往外漂，城隍的帳也對不上。'],
      ['yungui:serious', '不管是哪一族的人、往哪裡去，「渡」的路都卡住了。'],
      ['hongying:serious', '是夜玄。是長明宮把那些光攔住了。'],
      ['長老', '我不知道什麼長明宮。我只知道，路卡住了，總有人要去把它打通。'],
      ['長老', '但是記住：塔山不是活人去的地方。不要去那裡，不要靠近。'],
      ['xinghe:serious', '我們不會去的。我們要找的路，在別的地方。'],
      ['長老', '好。你這個孩子說大話的樣子，跟我年輕的時候很像。'],
    ]);
    spawn(S, { id: 'mother_cs', sprite: 'villager_f2', x: 28, y: 10, dir: 'left', name: 'Voyu 的母親' });
    spawn(S, { id: 'voyu_cs', sprite: 'tsou_m', x: 28, y: 9, dir: 'left', name: 'Voyu' });
    await S.move('mother_cs', 'L');
    await S.lines([
      ['Voyu 的母親', '吃吧。這是今年第一批的小米。'],
      ['Voyu', '這是小米酒。客人來了，要分一口。'],
      ['yungui:smile', '恭敬不如從命——'],
    ]);
    S.emote('hongying', '💢');
    S.sfx('hit');
    await S.lines([
      ['hongying:angry', '一小口！人家說一小口！'],
      ['yungui:hurt', '……我喝的就是一小口。我的一小口比較大。'],
      ['長老', '哈哈哈哈！'],
      ['', '眾人笑。星河也笑，然後低頭咳了兩聲。芋圓默默把頭靠在他腿上。'],
      ['xinghe:smile', '很好吃。……真的，很好吃。'],
      ['', '火光中，Voyu 的母親看了一眼火塘旁那個空著的位置。星河注意到了。'],
    ]);
    S.emote('player', '…');
    await S.wait(1.0);
    S.flag('ch7_tasan_told');
    for (const id of ['mother_cs', 'voyu_cs', 'kid_cs1', 'kid_cs2']) S.remove(id);
    S.setPos('elder', 24, 9, 'right');
    S.refresh();
    S.objective('到 Voyu 的家（廣場東南）過夜');
    S.cameraFollow();
  };

  // ================================================================================================ 1.4 tsou_house Voyu 家
  (function () {
    const rows = [
      'WWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWW',
      'W____________W',
      'W__nnnnnnnn__W',
      'W__nnnnnnnn__W',
      'W__nnnnnnnn__W',
      'W__nnnnnnnn__W',
      'W____________W',
      'W____________W',
      'WWWWWW_WWWWWWW',
    ];
    G.Maps.define('tsou_house', M({
      name: 'Voyu 的家', subtitle: '火塘邊', place: 'alishan',
      bgm: 'mountain', start: [6, 7], autosave: true,
      light: { ambient: 0.5, color: '#180c08', playerR: 160 },
      lights: lightsWith([{ x: 6, y: 5, r: 260, color: '#ff9a40', flicker: 0.35 }]),
      particles: [{ type: 'embers', density: 0.3 }],
      tiles: rows,
      objects: [
        { t: 'firepit', x: 6, y: 5 },
        { t: 'cabinet', x: 2, y: 2 }, { t: 'shelf_lanterns', x: 9, y: 2, v: 3 },
        { t: 'jar', x: 12, y: 2 }, { t: 'basket', x: 12, y: 3 }, { t: 'jar', x: 1, y: 7 }, { t: 'pot', x: 4, y: 2 },
        { t: 'rug', x: 8, y: 5, w: 1, h: 1, if: (st) => !st.flags.ch7_heartlamp_tsou },
        { t: 'bed_mat', x: 10, y: 6 }, { t: 'bed_mat', x: 2, y: 4 },
      ],
      npcs: [
        { id: 'mother', sprite: 'villager_f2', name: 'Voyu 的母親', x: 4, y: 5, dir: 'right', talk: async (S) => { await C7.talkMother(S); } },
      ],
      events: [
        { id: 'seat', trigger: 'action', x: 8, y: 5, label: '調查', run: async (S) => {
          if (S.has('ch7_heartlamp_tsou')) { await S.say('', '火塘邊的獸皮捲好了，靠在牆角。那個位置，現在只是火塘邊的一塊地。'); return; }
          await S.say('', '火塘旁一個空的位置，鋪著獸皮。');
          if (S.has('ch7_tsou_welcome')) await S.say('Voyu 的母親', '那是我小兒子的位置。……先別坐那裡，好嗎？');
        } },
      ],
      warps: [{ x: 6, y: 9, to: 'tsou_hosa', tx: 31, ty: 21, tdir: 'down', door: true }],
    }));
  })();

  C7.talkMother = async (S) => {
    if (F().ch7_sq_pasuya === 2 && !S.has('ch7_heartlamp_tsou')) { await C7.pasuyaDeliver(S); return; }
    if (S.has('ch7_heartlamp_tsou')) await S.say('Voyu 的母親', '我會好好記得他。記得，跟等，是不一樣的。');
    else {
      await S.say('Voyu 的母親', '客人來了。坐，坐近一點，山上的夜很冷。');
      await S.say('Voyu 的母親', '這是烤山肉，那是竹筒飯。你們從平地來，一定沒吃過這麼香的小米。');
    }
    if (!S.has('ch7_tsou_welcome')) return;
    const c = await S.choice(['在火塘邊休息', '不用了'], { cancel: 1 });
    if (c !== 0) return;
    if (!S.has('ch7_pasuya_told')) { await C7.tsouNight(S); return; }
    await rest(S, { after: async () => { if (!S.has('ch7_rest_tsou')) { S.flag('ch7_rest_tsou'); await C7.flame(S, 8, { silent: true }); } } });
    S.toast('在火塘邊好好休息了一晚。', 'lantern');
  };
  // first night at Voyu's house: [燈芯 +8] and the empty seat
  C7.tsouNight = async (S) => {
    await S.fadeOut(1.0);
    G.Music.stop(1);
    G.Party.healAll();
    S.flag('ch7_rest_tsou');
    await C7.flame(S, 8, { silent: true });
    S.light({ ambient: 0.75, color: '#100608', playerR: 120 });
    stage(S, [['player', 7, 7, 'up'], ['hongying', 3, 7, 'up'], ['yungui', 10, 7, 'left'], ['yuyuan', 6, 7, 'up']]);
    spawn(S, { id: 'voyu_n', sprite: 'tsou_m', x: 9, y: 4, dir: 'down', name: 'Voyu' });
    S.show('mother', false);
    await S.fadeIn(1.2);
    await S.say('', '夜。火塘的餘燼。星河睡不著，看著那個空位。');
    await S.lines([
      ['Voyu', '那是我弟弟 Pasuya 的位置。'],
      ['Voyu', '冬天的時候，他進霧谷追一頭山羌，再也沒有回來。'],
      ['Voyu', '我們找了很多天，什麼都沒找到。我媽一直把他的位置留著。'],
    ]);
    S.emote('player', '…');
    await S.wait(1.0);
    await S.say('Voyu', '睡吧。明天帶你們看神木。');
    await S.fadeOut(1.2);
    S.remove('voyu_n');
    S.show('mother', true);
    S.flag('ch7_pasuya_told');
    S.flag('ch7_morning');
    S.light({ ambient: 0.4, color: '#180c08', playerR: 160 });
    await S.wait(0.6);
    await S.fadeIn(1.0);
    S.bgm('mountain');
    S.toast('人的溫暖讓燈多亮一刻。', 'lantern');
    S.objective('天亮了。和 Voyu 說話，再往北邊的神木林');
  };
  // 心燈 13 delivery (tsou_house) → night at the viewpoint (tsou_hosa)
  C7.pasuyaDeliver = async (S) => {
    spawn(S, { id: 'voyu_d', sprite: 'tsou_m', x: 9, y: 4, dir: 'down', name: 'Voyu' });
    await S.say('', '母親看見皮帽，手停在半空中。');
    await S.lines([
      ['Voyu 的母親', '……這是……我親手縫的。羽毛是他自己去找的……'],
      ['xinghe:sad', '在神木林西南的霧谷，斷崖邊的樹根上。'],
      ['xinghe:sad', '對不起。我們只找到這些。'],
    ]);
    S.take('c7_key_cap', 1); S.take('c7_key_knife', 1);
    await S.wait(1.4);
    await S.lines([
      ['Voyu 的母親', '……他是自己掉下去的。不是誰害的，不是他做錯了什麼。'],
      ['Voyu 的母親', '他只是……追山羌追得太遠了。這孩子從小就這樣。'],
      ['Voyu', '媽……'],
      ['Voyu 的母親', '我一直把他的位置留著。我以為，只要位置還在，他就會回來。'],
      ['Voyu 的母親', '可是位置留著，他就不知道該走了。'],
    ]);
    await S.wait(1.2);
    await S.lines([
      ['', '她看向火塘邊那個鋪著獸皮的空位。很久。'],
      ['Voyu 的母親', 'Voyu，去請長老。我們家，要好好送他。'],
      ['Voyu', '……嗯。'],
      ['Voyu', '接下來是我們家和部落的事了。你們是客人，在外面等就好。'],
      ['hongying:serious', '我們明白。'],
    ]);
    S.remove('voyu_d');
    await S.fadeOut(1.0);
    await S.narrate(['那一夜，Voyu 的家裡很晚才熄火。', '眾人在廣場邊，遠遠地坐著。'], { veil: 1 });
    await S.warp('tsou_hosa', 42, 10, 'right', { fade: 0, stayDark: true, noAutosave: true });
    S.light({ ambient: 0.62, color: '#0a1030', playerR: 180 });
    S.bgm('mountain');
    stage(S, [['player', 42, 10, 'right'], ['hongying', 40, 9, 'right'], ['yungui', 40, 11, 'right'], ['yuyuan', 41, 11, 'right']]);
    C7.tasanSoul = 0;
    await S.camera(43, 9, 0.1);
    await S.fadeIn(1.2);
    await S.say('', '夜，廣場東側的觀景點。星河望向塔山。');
    await G.Tweens.to(C7, { tasanSoul: 1 }, 3.0, 'linear');
    await S.say('', '塔山的山稜上，擠在一起的光點中，有一點小小的光，慢慢地、慢慢地往山的深處移動，然後不見了。');
    C7.tasanSoul = null;
    spawn(S, { id: 'elder_v', sprite: 'tsou_elder', x: 41, y: 9, dir: 'right', name: '長老' });
    await S.lines([
      ['長老', '……你看見了？'],
      ['xinghe:smile', '嗯。他找到路了。'],
      ['長老', '塔山的門還是擠的。路卡住的事，還沒有解決。'],
      ['長老', '但是今晚，至少有一個孩子回家了。'],
      ['長老', '你們要去打通的那條路……就拜託了。'],
    ]);
    S.remove('elder_v');
    S.flag('ch7_heartlamp_tsou');
    S.quest('q_ch7_pasuya', 'done');
    await S.lantern('lantern_tsou_hunter', '霧中的獵刀');
    await S.fadeOut(1.0);
    S.light({ ambient: 0.1, color: '#2a2030' });
    await S.wait(0.5);
    await S.fadeIn(1.0);
    await S.say('', '翌日清晨，Voyu 的母親把一個小葫蘆和一包烤山肉塞進紅纓手裡。');
    await S.give('c7_hulu', 1);
    await S.give('c7_kaorou', 3);
    await S.say('Voyu 的母親', '我會好好記得他。記得，跟等，是不一樣的。');
    S.bgm('tribe');
    S.cameraFollow();
  };

  // ================================================================================================ 1.5 alishan_forest 神木林・雲海
  C7.valley = [[10, 29], [4, 32], [10, 35]];
  (function () {
    const g = new Grid(44, 40, ',', 705);
    g.rect(0, 0, 2, 40, 'X'); g.rect(42, 0, 2, 40, 'X'); g.rect(0, 0, 44, 2, 'X'); g.rect(0, 38, 44, 2, 'X');
    g.rect(20, 0, 3, 2, '='); g.rect(20, 38, 3, 2, '=');
    g.rect(0, 23, 15, 17, 'X');
    g.blob(7, 31.5, 5.6, 4.6, 'g', 0.25);
    g.rect(2, 27, 11, 10, 'g', ['X']);
    g.rect(2, 36, 11, 1, ',');
    g.rect(6, 23, 2, 4, ',');
    g.blob(16, 9.5, 6.5, 4.8, 'g', 0.2);
    g.rect(36, 9, 6, 6, '#');
    for (const [x, y] of [[30, 30], [9, 16], [33, 5], [27, 13]]) g.blob(x, y, 3, 2, '.', 0.3);
    const two = (pts, ch) => { g.path(pts, ch); g.path(pts.map(([x, y]) => [x + 1, y]), ch); };
    two([[21, 39], [21, 31], [18, 24], [16, 14]], '=');
    two([[16, 14], [19, 12], [20, 6], [20, 0]], '=');
    two([[20, 26], [28, 20], [36, 12]], '=');
    g.path([[19, 26], [12, 22], [8, 22], [6, 22]], ':');
    g.obj('tree_cypress', 14, 8); g.obj('tree_cypress', 16, 8); g.obj('tree_cypress', 14, 10); g.obj('tree_cypress', 16, 10);
    g.reserve(12, 6, 8, 8);
    g.obj('log', 6, 23, { if: (st) => !st.flags.ch7_log_moved });
    g.obj('tree_dead', 11, 35);
    g.obj('vine_curtain', 3, 30); g.obj('vine_curtain', 12, 29); g.obj('vine_curtain', 2, 34);
    g.obj('rock_small', 4, 28); g.obj('rock_small', 12, 33); g.obj('stump', 8, 33);
    for (const [x, y] of [[42, 6], [42, 10], [42, 14], [42, 18], [42, 2]]) g.objs.push({ t: 'sea_of_clouds', x, y });
    g.obj('stone_lantern', 37, 9, { lit: false });
    g.reserve(5, 22, 4, 6); g.reserve(2, 27, 11, 10); g.reserve(24, 20, 1, 1); g.reserve(23, 19, 3, 3); g.reserve(36, 9, 6, 6);
    for (const [x, y] of [[30, 30], [10, 17], [32, 5]]) g.reserve(x - 1, y - 1, 3, 3);
    g.scatter(['tree_cypress', 'tree_cypress', 'tree_fern', 'tree_pine'], 85, { area: [2, 2, 40, 36], gap: 0 });
    g.scatter(['tree_fern', 'rock_small', 'stump', 'mushroom_glow', 'tallgrass'], 45, { area: [2, 2, 40, 36] });
    g.scatter(['mushroom_glow', 'tree_fern', 'rock_small'], 10, { on: 'g', area: [12, 5, 10, 10] });

    G.Maps.define('alishan_forest', M({
      name: '神木林', subtitle: '紅檜神木・東邊的雲海', place: 'alishan',
      bgm: 'mountain', start: [21, 36],
      light: (st) => (st.flags.ch7_seaofclouds ? { ambient: 0.1, color: '#203048' } : { ambient: 0.42, color: '#18284a', playerR: 220 }),
      lights: lightsWith(() => {
        const sq = F().ch7_sq_pasuya || 0;
        if (sq !== 1) return [];
        return C7.valley.map(([x, y]) => ({ x, y, r: 70, color: '#cfe8ff', flicker: 0.5 }));
      }),
      particles: (st) => (st.flags.ch7_seaofclouds ? [{ type: 'mist', density: 0.8 }, { type: 'leaves', density: 0.5 }, { type: 'motes', density: 0.5 }] : [{ type: 'mist', density: 1.6 }, { type: 'motes', density: 0.6 }]),
      tiles: g.rows(), objects: g.objs,
      chests: [{ id: 'c7_af_d', x: 24, y: 20, item: 'c7_shanshen', n: 2 }, { id: 'c7_af_e', x: 5, y: 36, item: 'huanhunxiang', n: 1 }],
      enemies: [
        { id: 'af1', troop: 't_c7_mist', x: 30, y: 30, art: 'fog_spirit', lv: 23, radius: 3 },
        { id: 'af2', troop: 't_c7_eyes', x: 10, y: 17, art: 'hundred_eye', lv: 24, radius: 3 },
        { id: 'af3', troop: 't_c7_mist', x: 32, y: 5, art: 'fog_spirit', lv: 23, radius: 3 },
        { id: 'af4', troop: 't_c7_eyes', x: 9, y: 31, art: 'hundred_eye', lv: 24, radius: 2, if: (st) => !!st.flags.ch7_log_moved },
        { id: 'af5', troop: 't_c7_mist', x: 5, y: 34, art: 'fog_spirit', lv: 24, radius: 2, if: (st) => !!st.flags.ch7_log_moved },
      ],
      events: [
        { id: 'shenmu', trigger: 'touch', x: 13, y: 12, w: 7, h: 3, if: (st) => !st.flags.ch7_shenmu, run: async (S) => { await C7.scene74a(S); } },
        { id: 'shenmu_look', trigger: 'action', x: 14, y: 8, w: 4, h: 4, label: '仰望', run: async (S) => {
          await S.say('', '紅檜神木的樹幹像一面牆，樹皮的紋路如流水。它在這裡站了三千年。');
        } },
        { id: 'clouds', trigger: 'touch', x: 38, y: 10, w: 3, h: 4, if: (st) => !st.flags.ch7_seaofclouds, run: async (S) => { await C7.scene74b(S); } },
        { id: 'log', trigger: 'action', x: 6, y: 23, w: 2, h: 1, label: '調查', if: (st) => !st.flags.ch7_log_moved, run: async (S) => {
          if ((F().ch7_sq_pasuya || 0) >= 1 && !S.has('ch7_upper')) {
            await S.say('', '一根橫倒的大木頭擋住了往下的陡坡。坡下是一片濃得化不開的霧。');
            await S.say('hongying:serious', '讓開，這種事我來。');
            S.sfx('push'); S.shake(4, 0.3);
            S.flag('ch7_log_moved');
            const m = G.mapScene;
            m.objects = m.objects.filter((o) => o.t !== 'log');
            m.computeSolid();
            await S.say('', '紅纓把倒木推到一邊。往霧谷的陡坡露了出來。');
            m.buildEnemies();
          } else await S.say('', '一根橫倒的大木頭擋住了往下的陡坡。坡下是一片濃得化不開的霧。');
        } },
        { id: 'mark1', trigger: 'action', x: 10, y: 29, label: '微光', if: (st) => st.flags.ch7_sq_pasuya === 1, run: async (S) => {
          await S.say('xinghe:think', '……有人在這裡停過。踩斷的蕨葉，很舊了。');
        } },
        { id: 'mark2', trigger: 'action', x: 4, y: 32, label: '微光', if: (st) => st.flags.ch7_sq_pasuya === 1, run: async (S) => {
          await S.say('xinghe:think', '這裡的霧特別冷。……它好像，一直在往同一個地方看。');
        } },
        { id: 'mark3', trigger: 'action', x: 10, y: 35, w: 2, h: 1, label: '微光', if: (st) => st.flags.ch7_sq_pasuya === 1, run: async (S) => { await C7.pasuyaFound(S); } },
      ],
      warps: [
        { x: 20, y: 39, w: 3, h: 1, to: 'tsou_hosa', tx: 12, ty: 2, tdir: 'down' },
        { x: 20, y: 0, w: 3, h: 1, to: 'yushan_trail', tx: 22, ty: 50, tdir: 'up', run: async (S) => {
          if (!S.has('ch7_seaofclouds')) { await S.say('yungui:normal', 'Voyu 說東邊崖上能看見雲海。……天快亮了，去看一眼再走吧。'); await S.move('player', 'D'); return false; }
          return true;
        } },
      ],
      drawGround: (ctx, t) => {
        if (F().ch7_sq_pasuya !== 1) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        C7.valley.forEach(([x, y], i) => {
          const a = 0.35 + 0.25 * Math.sin(t * 1.7 + i * 2);
          const cx = x * T + 32, cy = y * T + 20 - 6 * Math.sin(t + i);
          const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
          gr.addColorStop(0, `rgba(230,244,255,${a})`); gr.addColorStop(1, 'rgba(200,220,255,0)');
          ctx.fillStyle = gr; ctx.fillRect(cx - 26, cy - 26, 52, 52);
        });
        ctx.restore();
      },
    }));
  })();

  C7.pasuyaFound = async (S) => {
    await S.lines([
      ['', '斷崖邊一棵老樹的樹根上，掛著一頂鄒族獵人的皮帽，帽上的羽毛已經褪色。旁邊卡著一把獵刀。'],
      ['hongying:sad', '……是他的吧。'],
      ['yungui:serious', '從這裡掉下去……'],
      ['yungui:sad', '崖下是急流。不會找到了。'],
      ['', '星河看向崖下的霧。霧中有一點非常淡的光，一動不動地浮著，像是在看崖上的皮帽。'],
      ['xinghe:think', '……它在這裡很久了。它好像……不知道該往哪裡走。'],
      ['xinghe:think', '就像一個人在霧裡迷了路，又不知道家裡的人知不知道他迷路了。'],
      ['yungui:serious', '我們不要碰它。那不是我們該送的路，是他們家、他們族裡的事。'],
      ['xinghe:serious', '嗯。我們把東西帶回去就好。'],
    ]);
    await S.give('c7_key_cap', 1);
    await S.give('c7_key_knife', 1);
    S.flag('ch7_sq_pasuya', 2);
    S.quest('q_ch7_pasuya', 1);
    S.objective('把皮帽和獵刀帶回 Voyu 的家');
  };

  // 7-4a 神木
  C7.scene74a = async (S) => {
    S.flag('ch7_shenmu');
    spawn(S, { id: 'voyu_f', sprite: 'tsou_m', x: G.mapScene.player.x + 1, y: G.mapScene.player.y + 1, dir: 'up', name: 'Voyu' });
    await S.camera(16, 9, 1.2);
    await S.say('', '鏡頭緩緩上搖：紅檜神木的樹幹像一面牆，樹皮的紋路如流水。');
    await S.lines([
      ['xinghe:surprise', '好大……這比九份的整條豎崎路還要高吧？'],
      ['Voyu', '它在這裡站了三千年。我們的祖先來之前，它就在這裡了。'],
      ['yungui:think', '三千年。它看過的朝代，大概比藤婆還多。'],
      ['yungui:think', '……喔，我還沒見過藤婆。先別這樣說她。'],
      ['hongying:normal', '芋圓，不准在神木上磨爪子。'],
      ['', '芋圓停下爪子，假裝什麼都沒發生。然後牠抱住樹根，把臉貼在樹皮上。'],
      ['yungui:think', '它好慢。它的心跳大概要很久很久才跳一下。……我要是吃一朵林下的蕈，說不定聽得見。'],
      ['xinghe:smile', '那它一定很不怕時間。'],
      ['Voyu', '往東邊的崖上走，天亮的時候能看見雲海。我在北邊的山徑口等你們。'],
    ]);
    S.remove('voyu_f');
    S.cameraFollow();
    S.objective('到神木林東邊的崖上看雲海');
  };
  // 7-4b 雲海
  C7.scene74b = async (S) => {
    S.flag('ch7_seaofclouds');
    stage(S, [['player', 40, 12, 'right'], ['hongying', 40, 11, 'right'], ['yungui', 37, 13, 'right'], ['yuyuan', 38, 13, 'right']]);
    await S.camera(41, 12, 1.0);
    await S.say('', '天光未亮。眾人站在崖邊，腳下是一片純白的雲海，遠方山頭如島。');
    S.bgm('mountain');
    for (const a of [0.34, 0.27, 0.2, 0.14, 0.1]) { S.light({ ambient: a, color: '#3a2a40' }); await S.wait(0.35); }
    S.flash('#ffd890', 0.9, 0.55);
    S.sfx('bell');
    await S.say('', '太陽從雲海盡頭升起，金光一層層鋪過雲面。');
    await S.lines([
      ['hongying:surprise', '……像海。'],
      ['xinghe:smile', '對啊。像八斗子的海，只是是白色的，而且……不會淹死人。'],
      ['hongying:sad', '星河。'],
      ['xinghe:normal', '嗯？'],
      ['hongying:sad', '你從小就知道自己……是那樣被撿到的？'],
      ['xinghe:normal', '知道啊。陳伯說，我是從水燈裡撿回來的。九份的人都知道。'],
      ['xinghe:smile', '我一直以為那是一個很浪漫的故事。現在才知道，是個鬼故事。'],
      ['hongying:angry', '不准這樣說。'],
      ['xinghe:surprise', '……'],
      ['hongying:serious', '你不是鬼。你是那個在霧林裡跟我打架、輸了還嘴硬的笨蛋。'],
      ['hongying:serious', '你是那個會偷吃芋圓、會跟陳伯頂嘴、會把白芷逗笑的笨蛋。'],
      ['hongying:cry', '……所以你不准死。我已經沒有很多人了。'],
    ]);
    S.emote('player', '♥');
    await S.say('', '星河愣住。然後笑了，把手放在紅纓頭上，被她一掌拍開。');
    S.sfx('hit');
    await S.lines([
      ['xinghe:smile', '遵命，洛大小姐。'],
      ['', '雲歸站在幾步之外，背對他們看雲海，假裝什麼都沒聽到。芋圓和麻糬坐在他腳邊。'],
      ['yungui:normal', '（小聲，對芋圓）別回頭。這種時候回頭的人沒有好下場。'],
      ['', '芋圓的鬍子垂了下來。麻糬沒有回頭，牠一直望著雲海的盡頭——海的方向。'],
    ]);
    S.sfx('wind');
    S.shake(2, 0.3);
    await S.say('', '星河忽然身子一晃，單膝跪地。胸口的火光暗了一大截。');
    await S.lines([
      ['hongying:surprise', '星河！'],
      ['xinghe:hurt', '……沒事。只是太陽太亮了。'],
      ['yungui:serious', '走吧。不能再停了。'],
    ]);
    await C7.flame(S, -4);
    S.quest('q_ch7_main', 2);
    S.objective('從神木林北邊，往玉山山徑去');
    S.cameraFollow();
  };

  // ================================================================================================ 1.6 yushan_trail 玉山山徑
  (function () {
    const g = new Grid(44, 52, ',', 706);
    g.rect(2, 2, 40, 24, '#');
    for (const [x, y, rx, ry] of [[10, 8, 4, 3], [33, 6, 5, 3], [28, 14, 3, 2], [8, 18, 4, 3], [36, 24, 3, 1.5]]) g.blob(x, y, rx, ry, ':', 0.3);
    for (const [x, y, rx, ry] of [[16, 5, 2, 1.5], [35, 12, 2.5, 1.5], [6, 12, 2, 2], [26, 21, 2, 1.2], [14, 20, 2.5, 1.5], [38, 17, 2, 2]]) g.blob(x, y, rx, ry, 'X', 0.3);
    for (const [x, y, rx, ry] of [[30, 40, 5, 3], [10, 36, 4, 3], [34, 30, 4, 2]]) g.blob(x, y, rx, ry, '.', 0.3);
    g.rect(0, 0, 2, 52, 'X'); g.rect(42, 0, 2, 52, 'X'); g.rect(0, 0, 44, 2, 'X'); g.rect(0, 50, 44, 2, 'X');
    g.rect(2, 26, 40, 1, 'X');
    const two = (pts, ch) => { g.path(pts, ch); g.path(pts.map(([x, y]) => [x + 1, y]), ch); };
    two([[21, 51], [21, 46], [12, 42], [30, 36], [14, 31], [21, 28], [21, 22]], '=');
    two([[21, 22], [30, 19], [16, 15], [24, 11], [12, 7], [6, 3], [6, 0]], '=');
    two([[22, 22], [43, 22]], '=');
    g.path([[30, 19], [39, 8], [40, 5]], ':');
    g.path([[30, 36], [36, 32]], ':');
    g.rect(41, 21, 3, 3, '=', ['X']);
    g.obj('rock_big', 6, 2, { if: (st) => !st.flags.ch7_bunun_farewell });
    g.obj('rock_big', 38, 22, { if: (st) => !st.flags.ch7_biung });
    g.reserve(5, 1, 4, 4); g.reserve(37, 21, 4, 3); g.reserve(18, 22, 6, 4); g.reserve(36, 32, 1, 1); g.reserve(35, 31, 3, 3); g.reserve(39, 3, 3, 3);
    for (const [x, y] of [[28, 42], [12, 34], [33, 14], [10, 10], [26, 5]]) g.reserve(x - 1, y - 1, 3, 3);
    g.scatter(['tree_pine', 'tree_pine', 'tree_cedar_snow', 'bush'], 120, { area: [2, 27, 40, 23], gap: 0 });
    g.scatter(['rock_small', 'tallgrass', 'silvergrass', 'flowers'], 30, { area: [2, 27, 40, 23] });
    g.scatter(['rock_big', 'rock_small', 'rock_small', 'silvergrass', 'tree_cedar_snow'], 70, { area: [2, 2, 40, 24], on: '#:' });

    G.Maps.define('yushan_trail', M({
      name: '玉山山徑', subtitle: '冷杉林・碎石坡・星空', place: 'yushan',
      bgm: 'mountain', start: [22, 49],
      light: (st) => (st.flags.ch7_upper && !st.flags.ch7_bunun_farewell ? { ambient: 0.45, color: '#2a1840', playerR: 220 } : { ambient: 0.2, color: '#1a2438' }),
      lights: lightsWith([]),
      particles: [{ type: 'wind', density: 0.5 }, { type: 'snow', density: 0.12 }, { type: 'mist', density: 0.6 }],
      tiles: g.rows(), objects: g.objs,
      chests: [{ id: 'c7_ys_e', x: 36, y: 32, item: 'c7_ac_tiegu' }, { id: 'c7_ys_f', x: 40, y: 4, item: 'c7_sw_chixia' }],
      npcs: [],
      enemies: [
        { id: 'ys1', troop: 't_c7_peak2', x: 28, y: 42, art: 'fog_spirit', variant: 1, lv: 24, radius: 3 },
        { id: 'ys2', troop: 't_c7_peak', x: 12, y: 34, art: 'mountain_ghost', variant: 2, lv: 24, radius: 3 },
        { id: 'ys3', troop: 't_c7_peak', x: 33, y: 14, art: 'mountain_ghost', variant: 2, lv: 25, radius: 3 },
        { id: 'ys4', troop: 't_c7_peak2', x: 10, y: 10, art: 'fog_spirit', variant: 1, lv: 25, radius: 3 },
        { id: 'ys5', troop: 't_c7_peak', x: 26, y: 5, art: 'mountain_ghost', variant: 2, lv: 25, radius: 2 },
      ],
      events: [
        { id: 'enter', trigger: 'auto', if: (st) => !st.flags.ch7_yushan_enter, run: async (S) => {
          S.flag('ch7_yushan_enter');
          const p = G.mapScene.player;
          spawn(S, { id: 'voyu_y', sprite: 'tsou_m', x: p.x + 1, y: p.y - 1, dir: 'left', name: 'Voyu' });
          S.face('player', 'voyu_y');
          await S.lines([
            ['yungui:normal', '從這裡開始就是玉山的山腰了。再往上，連樹都會變矮。'],
            ['Voyu', '我只能送到這裡。往上是布農的獵場，我不該再往前。'],
            ['Voyu', '遇到布農的獵人，就說是從鄒族大社來的客人，說明來意。'],
            ['xinghe:smile', '謝謝你，Voyu。等我好了，再回來吃你媽媽的竹筒飯。'],
            ['Voyu', '你說的喔。我媽會記得的。'],
          ]);
          await S.move('voyu_y', 'DDDD');
          S.remove('voyu_y');
          S.quest('q_ch7_main', 3);
          S.objective('往玉山上段走，找到雲霧林');
        } },
        { id: 'upper_gate', trigger: 'touch', x: 21, y: 27, w: 2, h: 1, if: (st) => !st.flags.ch7_upper, run: async (S) => {
          await S.say('', '前方地勢險峻，碎石坡一路往上。進入後將無法折返。');
          if ((F().ch7_sq_pasuya || 0) >= 1 && !S.has('ch7_heartlamp_tsou')) await S.say('xinghe:think', '……Voyu 拜託的事，還沒有給他答覆。');
          if (await S.choice(['繼續往上走', '先回頭'], { cancel: 1 }) !== 0) { await S.move('player', 'D'); return; }
          S.flag('ch7_upper');
          S.light({ ambient: 0.45, color: '#2a1840', playerR: 220 });
          S.bgm('mountain');
        } },
        { id: 'no_return', trigger: 'touch', x: 21, y: 26, w: 2, h: 1, if: (st) => !!st.flags.ch7_upper, run: async (S) => {
          if (G.mapScene.player.dir !== 'down') return;
          await S.say('hongying:serious', '背後的碎石坡已經崩落了。回不去了，只能往上。');
          await S.move('player', 'U');
        } },
        { id: 'fall', trigger: 'touch', x: 19, y: 22, w: 5, h: 3, if: (st) => !!st.flags.ch7_upper && !st.flags.ch7_biung, run: async (S) => { await C7.scene75b(S); } },
      ],
      warps: [
        { x: 21, y: 51, w: 2, h: 1, to: 'alishan_forest', tx: 21, ty: 2, tdir: 'down' },
        { x: 43, y: 21, w: 1, h: 3, to: 'bunun_home', tx: 2, ty: 12, tdir: 'right', if: (st) => !!st.flags.ch7_biung },
        { x: 6, y: 0, w: 2, h: 1, to: 'cloud_forest', tx: 20, ty: 41, tdir: 'up', if: (st) => !!st.flags.ch7_bunun_farewell },
      ],
    }));
  })();

  // 7-5b 倒下
  C7.scene75b = async (S) => {
    G.Music.stop(2);
    S.sfx('wind');
    S.light({ ambient: 0.55, color: '#1a1030', playerR: 160 });
    await S.say('', '風聲。天色轉為暗紫，星星一顆顆亮起。');
    await S.say('', '星河走著走著，腳步越來越慢，忽然整個人向前倒下。');
    S.shake(3, 0.3);
    S.sfx('hit');
    await S.lines([
      ['hongying:surprise', '星河——！'],
      ['', '星河胸口的火光縮成米粒大小。'],
      ['yungui:serious', '燈芯……掉得太快了。高山的冷在吃他的火。'],
      ['yungui:serious', '得找地方過夜。生火。現在。'],
      ['hongying:sad', '這裡都是石頭……沒有樹，沒有屋子……'],
      ['', '芋圓緊緊貼著星河，喵也不喵一聲。麻糬繞著他走了一圈，又一圈。'],
    ]);
    S.sfx('ok');
    await S.say('', '遠處傳來一聲短促的口哨。眾人回頭。');
    const p = G.mapScene.player;
    spawn(S, { id: 'biung_y', sprite: 'bunun_m', x: p.x + 4, y: p.y, dir: 'left', name: 'Biung', light: { r: 200, color: '#ffa850' } });
    await S.move('biung_y', 'LL');
    await S.lines([
      ['Biung', '誰在我們的獵場裡？'],
      ['hongying:serious', '我們是從鄒族大社來的客人。要往雲霧林去找藤婆。'],
      ['hongying:sad', '我的同伴病了，走不動了。'],
    ]);
    await S.move('biung_y', 'L');
    await S.lines([
      ['', 'Biung 走近，火把照在星河臉上。他沉默一下。'],
      ['Biung', '這個人身上冷得像死人，可是心口在發光。'],
      ['Biung', '我家就在東邊那個山坳。揹得動他嗎？'],
      ['hongying:serious', '揹得動。'],
      ['Biung', '那就跟我來。山上的夜，不能讓人一個人過。'],
    ]);
    await C7.flame(S, -4);
    S.flag('ch7_biung');
    S.remove('biung_y');
    await S.fadeOut(1.0);
    await S.warp('bunun_house_in', 6, 7, 'up', { fade: 0, stayDark: true });
  };

  // ================================================================================================ 1.7 bunun_home 布農獵人之家
  (function () {
    const g = new Grid(30, 24, ',', 707);
    g.rect(0, 0, 30, 3, 'X'); g.rect(27, 0, 3, 24, 'X'); g.rect(0, 22, 30, 2, 'X'); g.rect(0, 0, 2, 24, 'X');
    g.rect(0, 11, 2, 3, ':');
    g.blob(14, 12, 9, 6, ':', 0.25);
    g.rect(17, 14, 6, 4, 'f');
    g.path([[2, 12], [10, 12]], ':'); g.path([[14, 9], [14, 3]], '='); g.rect(13, 2, 3, 1, 'H');
    g.obj('bunun_house', 11, 6, { door: 1 });
    g.obj('granary', 19, 6);
    g.obj('millet_rack', 5, 15); g.obj('millet_rack', 22, 9);
    g.obj('firepit', 9, 12);
    g.obj('fence_wood', 16, 13, { w: 8 }); g.obj('fence_wood', 16, 18, { w: 8 }); g.obj('fence_wood', 23, 14, { w: 1, h: 4 });
    g.obj('basket', 8, 9); g.obj('jar', 16, 8); g.obj('jar', 17, 9); g.obj('stump', 7, 12); g.obj('stump', 11, 13);
    g.reserve(12, 8, 4, 6); g.reserve(2, 11, 9, 3); g.reserve(13, 2, 3, 7); g.reserve(16, 13, 8, 6); g.reserve(8, 11, 5, 4);
    g.scatter(['tree_pine', 'tree_cedar_snow', 'tree_pine', 'rock_big', 'bush'], 40, { gap: 0, test: (x, y) => x < 6 || x > 23 || y < 6 || y > 18 });
    g.scatter(['rock_small', 'silvergrass', 'tallgrass', 'millet'], 22, {});
    const ridge = [[22, 1], [24, 1], [25, 2], [27, 1]];

    G.Maps.define('bunun_home', M({
      name: 'Biung 的家', subtitle: '玉山東側的山坳', place: 'yushan',
      bgm: (st) => (st.flags.ch7_flood_legend ? 'tribe' : 'tribe'),
      start: [13, 11],
      light: (st) => (st.flags.ch7_flood_legend ? { ambient: 0.15, color: '#2a2440' } : { ambient: 0.65, color: '#0a0c24', playerR: 180 }),
      lights: lightsWith(() => (F().ch7_flood_legend ? [] : ridge.map(([x, y]) => ({ x, y, r: 60, color: '#ff9a40', flicker: 0.5 })))),
      particles: (st) => (st.flags.ch7_flood_legend ? [{ type: 'mist', density: 0.5 }] : [{ type: 'embers', density: 0.4 }, { type: 'fireflies', density: 0.2 }]),
      tiles: g.rows(), objects: g.objs,
      npcs: [
        { id: 'biung', sprite: 'bunun_m', name: 'Biung', x: 15, y: 11, dir: 'down', if: (st) => !!st.flags.ch7_flood_legend, talk: [
          ['Biung', '今天天氣好，霧往下走了。你們運氣不錯，山讓路。'],
          ['Biung', '布農的獵人不會一個人吃完獵物。肉要分，分給鄰居，分給親戚。'],
          ['Biung', '射到的不是你的，是山借給你的。'],
        ] },
        { id: 'ibu_o', sprite: 'child_f', name: 'Ibu', x: 10, y: 14, dir: 'up', wander: 2, if: (st) => !!st.flags.ch7_flood_legend, talk: [['Ibu', '哥哥，你要回來喔。回來的時候，小米會長很高。']] },
      ],
      events: [
        { id: 'field', trigger: 'action', x: 17, y: 14, w: 6, h: 4, label: '調查', run: async (S) => {
          await S.say('', '新整好的田，土翻得很鬆，還沒有任何綠色。');
          if (S.has('ch7_pasibutbut_heard')) await S.say('xinghe:smile', '等小米長出來的時候……我想再來看一次。');
        } },
        { id: 'ridge', trigger: 'action', x: 13, y: 2, w: 3, h: 1, label: '眺望', run: async (S) => {
          await S.say('', '東北遠處的稜線上，隱約有另一處家屋群的火光。');
          await S.say('yungui:normal', '那是別人家的地方。我們就在這裡看就好。');
        } },
        { id: 'north', trigger: 'touch', x: 13, y: 3, w: 3, h: 1, run: async (S) => {
          if (!S.has('ch7_bunun_farewell')) { await S.say('hongying:normal', '這條小路往山的更深處。……先別亂走。'); await S.move('player', 'D'); return; }
          await S.say('', 'Biung 說過：往西北的雲霧林，從玉山山徑的落石那邊上去。');
          await S.move('player', 'D');
        } },
      ],
      warps: [
        { x: 12, y: 8, to: 'bunun_house_in', tx: 6, ty: 8, tdir: 'up', door: true },
        { x: 0, y: 11, w: 1, h: 3, to: 'yushan_trail', tx: 41, ty: 22, tdir: 'left' },
      ],
      drawGround: (ctx, t) => {
        if (F().ch7_flood_legend) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const [x, y] of ridge) {
          for (let k = 0; k < 3; k++) {
            const a = 0.25 + 0.15 * Math.sin(t * 2 + x + k);
            ctx.fillStyle = `rgba(255,170,80,${a})`;
            ctx.fillRect(x * T + 10 + k * 14, y * T + 30 + (k % 2) * 6, 5, 4);
          }
        }
        ctx.restore();
      },
    }));
  })();

  // ------------------------------------------------------------------ bunun_house_in
  (function () {
    const rows = [
      'QQQQQQQQQQQQQQ',
      'QQQQQQQQQQQQQQ',
      'QSSSSSSSSSSSSQ',
      'QSSnnnnnnnnSSQ',
      'QSSnnnnnnnnSSQ',
      'QSSnnnnnnnnSSQ',
      'QSSnnnnnnnnSSQ',
      'QSSSSSSSSSSSSQ',
      'QSSSSSSSSSSSSQ',
      'QQQQQQSQQQQQQQ',
    ];
    G.Maps.define('bunun_house_in', M({
      name: 'Biung 的家', subtitle: '石板屋裡的火塘', place: 'yushan',
      bgm: (st) => (st.flags.ch7_bunun_shelter && !st.flags.ch7_pasibutbut_heard ? null : 'mountain'),
      start: [6, 7],
      light: { ambient: 0.5, color: '#180c08', playerR: 150 },
      lights: lightsWith(() => [{ x: 6, y: 5, r: C7.pasiFire ? 150 : 260, color: '#ff9a40', flicker: 0.35 }]),
      particles: [{ type: 'embers', density: 0.3 }],
      tiles: rows,
      objects: [
        { t: 'firepit', x: 6, y: 5 },
        { t: 'mural', x: 9, y: 1, v: 3 },
        { t: 'bed_mat', x: 2, y: 3 }, { t: 'bed_mat', x: 2, y: 6 }, { t: 'bed_mat', x: 11, y: 5 },
        { t: 'pot', x: 4, y: 2 }, { t: 'basket', x: 12, y: 2 }, { t: 'jar', x: 1, y: 2 }, { t: 'jar', x: 12, y: 8 }, { t: 'cabinet', x: 7, y: 2 },
      ],
      npcs: [
        { id: 'abus', sprite: 'bunun_f', name: 'Abus', x: 4, y: 5, dir: 'right', talk: async (S) => {
          if (S.has('ch7_bunun_farewell')) { await S.say('Abus', '記得就回來。小米收成的時候，會有很多小米酒。'); return; }
          await S.say('Abus', 'Mihumisang。進來，把濕衣服脫下來烤一烤。');
          await S.say('Abus', '孩子們，別一直盯著客人的貓看。');
        } },
        { id: 'grandma', sprite: 'old_f', name: '祖母', x: 7, y: 6, dir: 'up', talk: async (S) => {
          if (S.has('ch7_flood_legend')) await S.say('祖母', '那個發燒的孩子，今天眼睛亮一點了。是火救了他，還是故事？');
          else await S.say('祖母', '坐近一點。老人的話要坐近才聽得清楚。');
        } },
        { id: 'ibu', sprite: 'child_f', name: 'Ibu', x: 9, y: 4, dir: 'down', talk: async (S) => {
          if (S.has('ch7_flood_legend')) { await S.say('Ibu', '我阿嬤說，火是一隻小鳥帶來的。所以我們不可以欺負那種鳥。'); return; }
          await S.say('Ibu', '你的劍為什麼叫螢火？螢火蟲那麼小。');
          await S.say('xinghe:smile', '小的才厲害啊。大家都在睡覺的時候，只有牠們在發光。');
        } },
      ],
      events: [
        { id: 'shelter', trigger: 'auto', if: (st) => !!st.flags.ch7_biung && !st.flags.ch7_bunun_shelter, run: async (S) => { await C7.scene76(S); } },
        { id: 'calendar', trigger: 'action', x: 9, y: 1, w: 2, h: 1, label: '調查', run: async (S) => {
          await S.lines([
            ['', '一片長木板上刻滿了小小的圖形：月亮、人形、小米穗、弓……'],
            ['Abus', '那是我們的曆。一年什麼時候整地、播種、除草、收成、祭祀，都刻在上面。'],
            ['Abus', '不是寫字，是畫給會看的人看的。我們家的老人都看得懂。'],
            ['yungui:think', '……比我讀過的大部分曆書都誠實。至少它不騙人說哪天宜嫁娶。'],
          ]);
        } },
      ],
      warps: [{ x: 6, y: 9, to: 'bunun_home', tx: 12, ty: 9, tdir: 'down', door: true, if: (st) => !!st.flags.ch7_flood_legend }],
      drawOver: (ctx, t) => {
        // the carved wooden calendar board on the wall (drawn over the mural frame)
        ctx.save();
        const bx = 9 * T + 4, by = 1 * T - 30, bw = 2 * T - 8, bh = 58;
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, bh);
        ctx.strokeStyle = '#d8b880'; ctx.lineWidth = 1.4;
        for (let i = 0; i < 9; i++) {
          const x = bx + 8 + i * 13, y = by + 12 + (i % 3) * 16;
          ctx.beginPath();
          if (i % 3 === 0) { ctx.arc(x, y, 4, 0.6, Math.PI * 1.6); } else if (i % 3 === 1) { ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 4, y - 1); ctx.moveTo(x, y + 5); ctx.lineTo(x - 3, y + 8); ctx.moveTo(x, y + 5); ctx.lineTo(x + 3, y + 8); } else { ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x + 5, y, x, y - 6); }
          ctx.stroke();
        }
        ctx.restore();
        // pasibutbut night: smoke trembling between the roof slates, light seeping in from above
        const k = C7.pasi || 0;
        if (k <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const x = (2.2 + i * 1.6) * T, w = 18 + 6 * Math.sin(t * 0.7 + i);
          const a = k * (0.06 + 0.05 * Math.sin(t * (0.9 + i * 0.13) + i * 1.7));
          const gr = ctx.createLinearGradient(0, 0, 0, 7 * T);
          gr.addColorStop(0, `rgba(255,236,190,${a * 1.6})`); gr.addColorStop(1, 'rgba(255,220,160,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.moveTo(x - w * 0.3, 1.6 * T); ctx.lineTo(x + w * 0.3, 1.6 * T); ctx.lineTo(x + w * 2, 7 * T); ctx.lineTo(x - w, 7 * T); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 9; i++) {
          const ph = (t * 0.12 + i / 9) % 1;
          const x = 6 * T + 32 + Math.sin(t * 0.8 + i * 1.9) * (14 + ph * 40) + Math.sin(t * 6 + i) * 2 * ph;
          const y = 5 * T + 20 - ph * 3.4 * T;
          ctx.fillStyle = `rgba(200,190,180,${k * 0.22 * (1 - ph)})`;
          ctx.beginPath(); ctx.arc(x, y, 10 + ph * 26, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      },
    }));
  })();

  // 7-6 洪水與小鳥
  C7.scene76 = async (S) => {
    const m = G.mapScene;
    G.Music.stop(0.5);
    stage(S, [['player', 6, 6, 'up'], ['hongying', 5, 7, 'up'], ['yungui', 8, 7, 'left'], ['yuyuan', 7, 7, 'up']]);
    spawn(S, { id: 'biung_h', sprite: 'bunun_m', x: 10, y: 6, dir: 'left', name: 'Biung' });
    await S.camera(6, 5, 0.1);
    S.bgm('tribe');
    await S.fadeIn(1.2);
    await S.say('', '石板屋內，火塘燒得正旺。星河被安置在火邊，身上蓋著獸皮。');
    await S.lines([
      ['Abus', 'Mihumisang。……他還在發抖。再添柴。'],
      ['Ibu', '阿嬤，那隻貓好胖！'],
      ['祖母', '那隻是吃得很好的貓。旁邊那隻花的，是在等人的貓。'],
      ['yungui:surprise', '阿、阿嬤看得出來？'],
      ['祖母', '活到我這個年紀，什麼東西在等人、什麼東西只是在發呆，都看得出來。'],
      ['yungui:normal', '打擾了。……Uninang。謝謝你們。'],
      ['Biung', '你會說我們的話？'],
      ['yungui:shy', '只會這一句。剛才在路上問 Voyu 的。我想至少該用主人的話道謝。'],
      ['Biung', '那就夠了。'],
      ['Abus', '先吃東西。客人到了家裡，不吃飯是不行的。'],
    ]);
    S.flag('ch7_bunun_shelter');
    // 7-6b 祈求小米的歌 — heard only, from inside the house. No music, no singing synthesis.
    await S.fadeOut(0.8);
    await S.wait(0.4);
    await S.fadeIn(0.8);
    await S.say('', '夜深。Biung 起身，披上外衣。');
    await S.lines([
      ['Biung', '今晚，部落的男人要在那邊的家屋聚在一起。'],
      ['Biung', '那是 pasibutbut，在播種之前，向天祈求小米豐收的歌。'],
      ['yungui:think', '祈求小米……'],
      ['Biung', '唱得越和諧，天聽得越清楚，小米就長得越好。'],
      ['Biung', '你們待在屋裡。可以聽，但是不要出聲，不要出去看。'],
      ['Biung', '這不是給客人看的，但山會把聲音帶過來。聽到了，就是山讓你們聽的。'],
      ['hongying:serious', '我們明白。'],
    ]);
    await S.move('biung_h', 'DDD');
    S.sfx('door');
    S.remove('biung_h');
    await S.say('', 'Biung 出門。門關上。Abus 將火塘的火撥小，只留下暗紅的光。');
    S.bgm(null);
    C7.pasiFire = true;
    S.light({ ambient: 0.72, color: '#120806', playerR: 110 });
    S.particles([{ type: 'embers', density: 0.12 }]);
    S.sfx('wind');
    await S.wait(1.5);
    await S.camera(6, 5, 1.5);
    await S.wait(1.5);
    await G.Tweens.to(C7, { pasi: 0.5 }, 1.5, 'linear');
    await S.say('', '遠方，極輕的人聲浮起。不是旋律，像是好幾個低音在找彼此。');
    await G.Tweens.to(C7, { pasi: 1 }, 1.5, 'linear');
    await S.say('', '聲音一層一層地往上疊，越來越高、越來越亮，彷彿屋頂的石板之間有光滲進來。');
    await S.say('', '那聲音不像是一群人在唱。像是山本身，在很深的地方，輕輕地共鳴。');
    await S.say('', '沒有人說話。芋圓嘴邊的小米糕，停在半空中，一直沒有咬下去。');
    await S.say('', '紅纓閉上眼睛。雲歸靠著石牆，手裡的扇子慢慢合起。');
    for (let i = 0; i < 3; i++) { S.flash('#ffcf80', 0.8, 0.12); await S.wait(1.0); }
    await S.say('', '星河在獸皮下，微微睜開眼。胸口的光，輕輕地，跟著那聲音的起伏一明一滅。');
    await S.say('', '那一夜，星河的火沒有再變小。');
    await G.Tweens.to(C7, { pasi: 0 }, 1.5, 'linear');
    await S.wait(1.5);
    S.sfx('fire');
    await S.wait(0.8);
    await S.say('Abus', '（很小聲）……今年的小米，會長得很好。');
    S.flag('ch7_pasibutbut_heard');
    await S.fadeOut(1.4);
    C7.pasiFire = false;
    // 7-6c 不會淹沒的山
    S.light({ ambient: 0.5, color: '#180c08', playerR: 150 });
    S.particles([{ type: 'embers', density: 0.3 }]);
    spawn(S, { id: 'biung_h', sprite: 'bunun_m', x: 10, y: 6, dir: 'left', name: 'Biung' });
    await S.wait(0.6);
    await S.fadeIn(1.0);
    S.bgm('mountain', { fade: 2 });
    await S.lines([
      ['Ibu', '阿嬤，講故事。講大水的那個。'],
      ['祖母', '又是那個？好吧，客人也聽。'],
      ['祖母', '很久很久以前，大水來了。河被堵住，水一直漲、一直漲。'],
      ['祖母', '平地淹了，小山淹了，人只好一直往高的地方逃。'],
      ['祖母', '最後，大家都逃到了玉山上。只有玉山，大水淹不到。'],
      ['xinghe:think', '不會淹沒的山……'],
      ['祖母', '傳說有很多種說法，我們家是這樣講的。'],
      ['祖母', '人是活下來了，可是逃得太急，沒有人帶到火。'],
      ['祖母', '山上那麼冷，沒有火，人會一個一個凍死。'],
      ['祖母', '大家看見對面的山頭有火光，可是中間隔著大水。'],
      ['祖母', '先是派烏鴉去。烏鴉飛過去，叼著火回來，可是飛得太慢，'],
      ['祖母', '火把牠的羽毛燒黑了，火也掉進水裡了。'],
      ['hongying:surprise', '所以烏鴉才是黑的？'],
      ['祖母', '我們家是這樣說的。'],
      ['祖母', '後來，一隻很小的鳥說：我去。'],
      ['祖母', '那是紅嘴黑鵯。牠那麼小，大家都不相信牠。'],
      ['祖母', '可是牠飛過去，叼著火，一路飛、一路飛，火燒著牠的嘴、燒著牠的腳——'],
      ['祖母', '牠還是把火帶回來了。所以到今天，牠的嘴和腳還是紅的。'],
      ['Ibu', '所以我們不可以欺負那種鳥！'],
      ['祖母', '對。人能活下來，是因為一隻小鳥願意燙傷自己的嘴。'],
      ['', '沉默。星河看著自己胸口那一點火光。'],
      ['xinghe:think', '……一隻小鳥，帶著火，飛過大水。'],
      ['xinghe:sad', '阿嬤，那隻小鳥……後來怎麼了？'],
      ['祖母', '故事沒有說。'],
      ['祖母', '故事只說，火很小，可是大家都活下來了。'],
      ['祖母', '有時候，故事不說的部分，要聽故事的人自己去活出來。'],
      ['yungui:think', '（小聲）……這句話，我師父也說過類似的。'],
    ]);
    G.Party.healAll();
    await C7.flame(S, 8);
    S.flag('ch7_flood_legend');
    S.remove('biung_h');
    // 翌晨（屋外）
    await S.fadeOut(1.2);
    await S.warp('bunun_home', 13, 10, 'down', { fade: 0, stayDark: true });
    S.light({ ambient: 0.15, color: '#2a2440' });
    S.particles([{ type: 'mist', density: 0.5 }]);
    stage(S, [['player', 13, 10, 'down'], ['hongying', 12, 10, 'down'], ['yungui', 14, 10, 'down'], ['yuyuan', 13, 9, 'down']]);
    spawn(S, { id: 'grandma_o', sprite: 'old_f', x: 13, y: 12, dir: 'up', name: '祖母' });
    spawn(S, { id: 'abus_o', sprite: 'bunun_f', x: 11, y: 12, dir: 'up', name: 'Abus' });
    S.setPos('biung', 15, 12, 'up');
    await S.camera(13, 11, 0.1);
    await S.fadeIn(1.2);
    S.bgm('tribe');
    await S.lines([
      ['祖母', '孩子，過來。'],
      ['', '祖母把一根紅色的小羽毛放進星河手心。'],
      ['祖母', '那種鳥掉在我們田邊的。牠自己掉的，不是我們拔的。'],
      ['祖母', '帶著。冷的時候，想想那隻鳥。'],
      ['xinghe:smile', '……Uninang，阿嬤。'],
      ['祖母', '哈哈，學得真快！'],
    ]);
    await S.give('c7_ac_hongyu', 1);
    await S.say('Abus', '這是醃肉跟小米糕，路上吃。不要拒絕，在山上拒絕食物是不吉利的。');
    await S.give('c7_xiaomigao', 3);
    await S.give('c7_yanrou', 2);
    await S.lines([
      ['Biung', '往西北的雲霧林，我帶你們到林子邊緣。'],
      ['Biung', '那個老婆婆……我爺爺小時候她就是那個樣子。我們獵人不太往那裡走。'],
      ['Biung', '她不是壞人。只是那片林子是她的，就像這片獵場是我們的。'],
      ['hongying:smile', '謝謝你們。我們會記得這個家的火。'],
      ['Abus', '記得就回來。小米收成的時候，會有很多小米酒。'],
      ['yungui:smile', '這是我這輩子聽過最有說服力的邀請。'],
    ]);
    S.flag('ch7_bunun_farewell');
    S.remove('grandma_o'); S.remove('abus_o');
    S.refresh();
    S.objective('往西北的雲霧林，去找藤婆');
    S.cameraFollow();
    if (await S.choice(['跟著 Biung 去雲霧林', '先在這附近整理行囊'], { cancel: 1 }) === 0) await C7.toCloudForest(S);
    else await S.say('Biung', '準備好了就從西邊下山徑，往西北的落石那邊走。石頭我已經推開了。');
  };
  C7.toCloudForest = async (S) => {
    await S.fadeOut(0.8);
    await S.narrate(['Biung 帶著眾人沿著稜線走，一直走到雲霧林的邊緣。', '「從這裡開始，是她的林子了。」'], { veil: 1 });
    await S.warp('cloud_forest', 20, 41, 'up', { fade: 0.4 });
  };

  // ================================================================================================ 1.8 cloud_forest 雲霧林（霧迴路）
  (function () {
    const g = new Grid(40, 44, 'X', 708);
    const corr = (pts) => { g.path(pts, ',', 2); };
    corr([[20, 43], [20, 34]]);
    corr([[20, 38], [25, 38]]);
    corr([[20, 34], [5, 34], [5, 15]]);
    corr([[5, 20], [8, 20]]);
    corr([[20, 34], [20, 24]]);
    corr([[20, 34], [30, 34], [30, 28], [21, 28]]);
    corr([[20, 24], [33, 24], [33, 12]]);
    corr([[20, 24], [13, 24], [13, 10], [20, 10], [20, 1]]);
    corr([[20, 4], [35, 4]]);
    g.rect(19, 0, 3, 1, ',');
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) === ',' && U.hash(x, y, 33) < 0.4) g.set(x, y, 'g');
    // keep corridor centres clear
    const centres = [[[20, 43], [20, 34]], [[20, 34], [5, 34], [5, 15]], [[20, 34], [20, 24]], [[20, 34], [30, 34], [30, 28], [21, 28]], [[20, 24], [33, 24], [33, 12]], [[20, 24], [13, 24], [13, 10], [20, 10], [20, 0]], [[20, 4], [35, 4]], [[20, 38], [25, 38]], [[5, 20], [8, 20]]];
    for (const pts of centres) for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      for (let k = 0; k <= Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); k++) g.reserve(x0 + Math.sign(x1 - x0) * k, y0 + Math.sign(y1 - y0) * k);
    }
    g.obj('signboard', 18, 35, { text: '藤' });
    g.obj('signboard', 19, 26, { text: '藤' });
    g.obj('signboard', 12, 11, { text: '藤' });
    g.obj('signboard', 5, 14, { text: '藤' });
    g.obj('signboard', 33, 11, { text: '藤' });
    g.obj('mushroom_glow', 8, 20);
    g.obj('mushroom_glow', 9, 19); g.obj('mushroom_glow', 9, 21);
    g.reserve(7, 19, 3, 3); g.reserve(26, 38, 1, 1); g.reserve(36, 4, 1, 1);
    for (const [x, y] of [[25, 34], [13, 18], [33, 18], [20, 7]]) g.reserve(x - 1, y - 1, 3, 3);
    g.scatter(['mushroom_glow', 'tallgrass', 'flowers', 'vine_curtain', 'mushroom_glow'], 70, { on: ',g' });
    g.scatter(['tree_fern', 'stump', 'rock_small', 'log'], 22, { on: ',g' });
    g.scatter(['tree_fern', 'tree_cypress', 'tree_fern', 'tree_pine', 'vine_curtain'], 170, { on: 'X' });

    const signText = {
      s1: (st) => (st.flags.ch7_sign1 ? '還不回去？好吧。中間那條。——藤' : '回去。——藤'),
      s2: () => '右邊的霧是我養的，會咬人。走左上。——藤',
      s3: () => '快到了。進門前把鞋上的泥刮乾淨。——藤',
      sa: () => '我說了中間。孩子，你們識字嗎？——藤',
      sb: () => '我說了左上。你們是不是以為我在說反話？我沒有。——藤',
    };
    const readSign = (k) => async (S) => {
      await S.say('', `木牌上歪歪斜斜地寫著：「${signText[k](G.state)}」`);
      if (k === 's1') S.flag('ch7_sign1');
    };
    const loopBack = (k) => async (S) => {
      await S.say('', `霧裡立著一塊新的木牌：「${signText[k](G.state)}」`);
      S.flag(k === 'sa' ? 'ch7_loopA' : 'ch7_loopB');
      await S.say('', '霧忽然濃得什麼都看不見——');
      await S.warp('cloud_forest', 20, 36, 'up', { fade: 0.6, color: '#e8f0f0', noAutosave: true });
      if (k === 'sa') await S.say('hongying:angry', '……又回到岔路口了！');
      else await S.say('yungui:think', '……這霧，真的會咬人。');
    };

    G.Maps.define('cloud_forest', M({
      name: '雲霧林', subtitle: '藤婆的林子', place: 'yushan',
      bgm: 'forest', start: [20, 41],
      light: { ambient: 0.35, color: '#10281e', playerR: 220 },
      lights: lightsWith([]),
      particles: [{ type: 'mist', density: 2.0 }, { type: 'motes', density: 0.8 }, { type: 'rain', density: 0.06 }],
      tiles: g.rows(), objects: g.objs,
      chests: [{ id: 'c7_cf_g', x: 26, y: 38, item: 'c7_yunwu', n: 2 }, { id: 'c7_cf_h', x: 36, y: 4, item: 'c7_fn_qinglan' }],
      enemies: [
        { id: 'cf1', troop: 't_c7_cloud', x: 25, y: 34, art: 'serpent_shade', lv: 25, radius: 2 },
        { id: 'cf2', troop: 't_c7_cloud2', x: 13, y: 18, art: 'mushroom_imp', variant: 2, lv: 25, radius: 2 },
        { id: 'cf3', troop: 't_c7_cloud', x: 33, y: 18, art: 'serpent_shade', lv: 25, radius: 2 },
        { id: 'cf4', troop: 't_c7_cloud2', x: 20, y: 7, art: 'mushroom_imp', variant: 2, lv: 25, radius: 2 },
      ],
      events: [
        { id: 'enter', trigger: 'auto', once: true, run: async (S) => {
          await S.lines([
            ['yungui:think', '這片霧不太對。它在動，但不是被風吹的。'],
            ['xinghe:surprise', '這裡好多菇……雲歸，你的眼睛在發光。'],
            ['yungui:serious', '這一區的菇我一朵都不認識。這是我人生第一次。'],
            ['yungui:smile', '……真興奮。'],
            ['hongying:angry', '不准吃！給我專心！'],
          ]);
          S.quest('q_ch7_main', 3);
          S.objective('跟著藤婆的木牌，穿過雲霧林');
        } },
        { id: 's1', trigger: 'action', x: 18, y: 35, label: '木牌', run: readSign('s1') },
        { id: 's2', trigger: 'action', x: 19, y: 26, label: '木牌', run: readSign('s2') },
        { id: 's3', trigger: 'action', x: 12, y: 11, label: '木牌', run: readSign('s3') },
        { id: 'sa', trigger: 'action', x: 5, y: 14, label: '木牌', run: readSign('sa') },
        { id: 'sb', trigger: 'action', x: 33, y: 11, label: '木牌', run: readSign('sb') },
        { id: 'loopA', trigger: 'touch', x: 4, y: 15, w: 3, h: 1, run: loopBack('sa') },
        { id: 'loopB', trigger: 'touch', x: 32, y: 12, w: 3, h: 1, run: loopBack('sb') },
        { id: 'yunzhi', trigger: 'action', x: 8, y: 20, label: '調查', if: (st) => !st.flags.mush_ch7, run: async (S) => {
          S.emote('yuyuan', '?');
          await S.lines([
            ['', '芋圓湊過去聞了聞發光的菇叢，打了一個噴嚏。菇叢裡有一朵，形狀像一朵小小的雲。'],
            ['yungui:think', '……雲芝。手札上沒有。'],
            ['yungui:smile', '為了研究，我必須親自嚐一口。只是研究。'],
            ['hongying:angry', '雲歸！'],
            ['', '雲歸已經嚼完了。他的瞳孔慢慢放大。'],
            ['yungui:think', '……星河。雲為什麼是白的？因為它把所有的顏色都還回去了。'],
            ['yungui:think', '它什麼都不留，所以它很輕。所以它飄得起來。'],
            ['xinghe:think', '……這段我好像聽懂了，又好像沒有。'],
            ['', '芋圓面無表情地看著雲歸。麻糬打了個哈欠。'],
          ]);
          S.flag('mush_ch7');
          G.state.vars.tuanzi_mush = (G.state.vars.tuanzi_mush || 0) + 1;
          await S.give('mat_yunzhi', 1);
        } },
      ],
      warps: [
        { x: 19, y: 43, w: 3, h: 1, to: 'yushan_trail', tx: 6, ty: 4, tdir: 'down' },
        { x: 19, y: 0, w: 3, h: 1, to: 'tengpo_hut', tx: 8, ty: 12, tdir: 'up' },
      ],
    }));
  })();

  // ================================================================================================ 1.9 tengpo_hut 藤婆小屋
  (function () {
    const g = new Grid(16, 14, ',', 709);
    g.rect(0, 0, 16, 1, 'X'); g.rect(0, 0, 1, 14, 'X'); g.rect(15, 0, 1, 14, 'X'); g.rect(0, 13, 16, 1, 'X');
    g.rect(7, 13, 2, 1, ':'); g.rect(15, 7, 1, 2, ':');
    g.blob(8, 8.5, 6, 3.6, ':', 0.2);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === ',' && U.hash(x, y, 4) < 0.35) g.set(x, y, 'g');
    g.obj('house_jiufen', 5, 2, { w: 4, h: 3, door: 1, v: 2, text: '藤' });
    g.obj('firepit', 8, 8);
    g.obj('log', 4, 10); g.obj('log', 10, 10);
    g.obj('drying_rack', 1, 6, { v: 0 });
    g.obj('jar', 12, 4); g.obj('jar', 13, 5); g.obj('jar', 12, 5); g.obj('pot', 11, 4);
    g.obj('vine_curtain', 10, 2); g.obj('vine_curtain', 11, 2); g.obj('vine_curtain', 10, 3);
    g.obj('bed_mat', 6, 7, { if: (st) => !!st.flags.ch7_dieta && !st.flags.ch7_dawn_after });
    g.obj('bed_mat', 10, 7, { if: (st) => !!st.flags.ch7_dieta && !st.flags.ch7_dawn_after });
    g.obj('bed_mat', 7, 10, { if: (st) => !!st.flags.ch7_dieta && !st.flags.ch7_dawn_after, solid: false });
    g.reserve(1, 5, 14, 8);
    g.scatter(['tree_fern', 'mushroom_glow', 'vine_curtain', 'tree_fern'], 18, { on: ',g', test: (x, y) => x < 3 || x > 12 || y < 3 });
    g.scatter(['tree_fern', 'tree_cypress', 'vine_curtain'], 26, { on: 'X' });

    G.Maps.define('tengpo_hut', M({
      name: '藤婆小屋', subtitle: '雲霧林深處', place: 'yushan',
      bgm: (st) => (st.flags.ch7_rite && !st.flags.ch7_dawn_after ? null : 'forest'),
      start: [8, 11],
      light: (st) => (st.flags.ch7_dawn_after ? { ambient: 0.1, color: '#20302a' } : { ambient: 0.42, color: '#1a1a2e', playerR: 200 }),
      lights: lightsWith([{ x: 10.5, y: 2.5, r: 140, color: '#e8d870', flicker: 0.2 }]),
      particles: [{ type: 'fireflies', density: 0.8 }, { type: 'embers', density: 0.4 }, { type: 'mist', density: 0.8 }],
      psychedelic: () => (C7.riteK || 0) * 0.55,
      tiles: g.rows(), objects: g.objs,
      onEnter: async (S) => {
        if (F().yuyuan_hidden || F().mochi_hidden) { delete F().yuyuan_hidden; delete F().mochi_hidden; S.refresh(); }
        C7.leo = { x: 14, y: 8, a: F().ch7_dawn_after && !F().ch7_thao_met ? 0.7 : 0, dir: 'left' };
      },
      drawOver: (ctx, t, m) => {
        if (C7.leo && C7.leo.a > 0.01 && F().ch7_xinhuo && !F().ch7_thao_met) drawLeopard(ctx, t);
        const k = C7.riteK || 0;
        if (k <= 0) return;
        // the ritual fire turns gold, then blue-green; sparks weave into geometric flowers; the trees breathe
        const fx = 8 * T + 32, fy = 8 * T + 10;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const col = U.mix('#ffb040', k < 0.5 ? '#ffe070' : '#40f0c0', Math.min(1, k * 1.2));
        const g2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, 180 + 30 * Math.sin(t * 2));
        g2.addColorStop(0, U.rgba(col, 0.75 * k)); g2.addColorStop(1, U.rgba(col, 0));
        ctx.fillStyle = g2; ctx.fillRect(fx - 220, fy - 220, 440, 440);
        for (let ring = 0; ring < 3; ring++) {
          const n = 6 + ring * 4, R = (60 + ring * 55) * (0.6 + 0.4 * k) + Math.sin(t * 1.3 + ring) * 10;
          ctx.strokeStyle = `hsla(${(t * 40 + ring * 110) % 360},90%,70%,${0.45 * k})`; ctx.lineWidth = 1.6;
          for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2 + t * (ring % 2 ? -0.3 : 0.25);
            const px = fx + Math.cos(a) * R, py = fy - 60 + Math.sin(a) * R * 0.6;
            ctx.beginPath();
            for (let p = 0; p < 6; p++) { const b = p / 6 * Math.PI * 2 + t; const rr = 9 + ring * 3; if (p) ctx.lineTo(px + Math.cos(b) * rr, py + Math.sin(b) * rr); else ctx.moveTo(px + Math.cos(b) * rr, py + Math.sin(b) * rr); }
            ctx.closePath(); ctx.stroke();
          }
        }
        ctx.restore();
        // breathing darkness at the edges (the trees swell and shrink)
        ctx.save();
        const br = 0.25 * k * (0.6 + 0.4 * Math.sin(t * 1.2));
        const gv = ctx.createRadialGradient(m.cam.x + G.W / 2, m.cam.y + G.H / 2, G.H * (0.35 - br * 0.3), m.cam.x + G.W / 2, m.cam.y + G.H / 2, G.W * 0.75);
        gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, `rgba(4,16,10,${0.5 * k})`);
        ctx.fillStyle = gv; ctx.fillRect(m.cam.x, m.cam.y, G.W, G.H);
        ctx.restore();
        const s = C7.riteSerpent || 0;
        if (s > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 60; i++) {
            const u = i / 59;
            const px = fx + Math.sin(u * 9 + t * 0.8) * (120 - u * 60) * s, py = fy - 60 - u * 260 * s;
            const r = (34 - u * 18) * s;
            ctx.fillStyle = `hsla(${(i * 7 + t * 30) % 360},70%,80%,${0.12 * s})`;
            ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          }
          const hx = fx + Math.sin(9 + t * 0.8) * 60 * s, hy = fy - 60 - 260 * s;
          for (const dx of [-12, 12]) {
            const ge = ctx.createRadialGradient(hx + dx, hy, 0, hx + dx, hy, 10);
            ge.addColorStop(0, `rgba(220,230,255,${0.9 * s})`); ge.addColorStop(1, 'rgba(160,180,255,0)');
            ctx.fillStyle = ge; ctx.fillRect(hx + dx - 10, hy - 10, 20, 20);
          }
          ctx.restore();
        }
      },
      npcs: [
        { id: 'tengpo', sprite: 'tengpo', portrait: 'tengpo', x: 8, y: 7, dir: 'down', if: (st) => !!st.flags.ch7_tengpo_met, talk: async (S) => { await C7.talkTengpo(S); } },
      ],
      events: [
        { id: 'meet', trigger: 'auto', if: (st) => !st.flags.ch7_tengpo_met, run: async (S) => { await C7.scene78(S); } },
        { id: 'dawn', trigger: 'auto', if: (st) => !!st.flags.ch7_xinhuo && !st.flags.ch7_dawn_after, run: async (S) => { await C7.scene711(S); } },
        { id: 'vine', trigger: 'action', x: 10, y: 2, w: 2, h: 2, label: '調查', run: async (S) => {
          await S.lines([
            ['', '粗如手臂的藤蔓從屋後的大樹上垂下，表皮有螺旋的紋路，在霧中泛著淡金色。'],
            ['tengpo:normal', '它只長在這片雲霧裡。離開這座山，它就只是一根普通的藤。'],
            ['tengpo:serious', '這不是給人玩的東西，孩子。是門。有些門，一輩子開一次就夠了。'],
          ]);
        } },
      ],
      warps: [
        { x: 6, y: 4, to: 'tengpo_hut_in', tx: 5, ty: 8, tdir: 'up', door: true },
        { x: 7, y: 13, w: 2, h: 1, to: 'cloud_forest', tx: 20, ty: 2, tdir: 'down', run: async (S) => {
          if (S.has('ch7_dieta') && !S.has('ch7_xinhuo')) { await S.say('tengpo:normal', '三天還沒過完，孩子。哪裡都別去。'); await S.move('player', 'U'); return false; }
          return true;
        } },
        { x: 15, y: 7, w: 1, h: 2, to: 'sunmoon', tx: 47, ty: 33, tdir: 'left', if: (st) => !!st.flags.ch7_dawn_after, run: async (S) => {
          if (S.has('ch7_thao_met')) return true;
          await S.fadeOut(0.8);
          await S.narrate(['跟著雲豹，兩天的山路。', '霧一路為他們讓開。'], { veil: 1 });
          await S.travel('yushan', 'sunmoon', { label: '跟著雲豹，往有白鹿的湖……' });
          return true;
        } },
      ],
    }));
    G.Maps.define('tengpo_hut_in', M({
      name: '藤婆小屋', subtitle: '藥罐與乾草藥', place: 'yushan',
      bgm: 'forest', start: [5, 7],
      light: { ambient: 0.4, color: '#141a10', playerR: 170 },
      lights: lightsWith([{ x: 8, y: 2, r: 160, color: '#ffa850', flicker: 0.3 }]),
      tiles: [
        'WWWWWWWWWWWW',
        'WWWWWWWWWWWW',
        'WnnnnnnnnnnW',
        'WnnnnnnnnnnW',
        'WnnnnnnnnnnW',
        'WnnnnnnnnnnW',
        'WnnnnnnnnnnW',
        'WnnnnnnnnnnW',
        'WnnnnnnnnnnW',
        'WWWWWnWWWWWW',
      ],
      objects: [
        { t: 'shelf_lanterns', x: 1, y: 2, v: 1 }, { t: 'pot', x: 4, y: 2 }, { t: 'stove', x: 7, y: 2 }, { t: 'herbs_rack', x: 10, y: 2 },
        { t: 'bed_mat', x: 2, y: 5 }, { t: 'bed_mat', x: 4, y: 5 }, { t: 'bed_mat', x: 7, y: 5 }, { t: 'bed_mat', x: 9, y: 5 },
        { t: 'jar', x: 10, y: 8 }, { t: 'basket', x: 1, y: 8 }, { t: 'cauldron', x: 5, y: 3 },
      ],
      events: [
        { id: 'bed', trigger: 'action', x: 2, y: 5, w: 9, h: 2, label: '休息', run: async (S) => {
          if (!S.has('ch7_dawn_after')) { await S.say('', '四張蓆子整整齊齊地鋪著。屋頂懸掛的乾燥藥草微微晃動。'); return; }
          if (await S.choice(['休息一下', '不用了'], { cancel: 1 }) !== 0) return;
          await rest(S);
          S.toast('好好休息了一下，全員完全恢復。', 'lantern');
        } },
      ],
      warps: [{ x: 5, y: 9, to: 'tengpo_hut', tx: 6, ty: 5, tdir: 'down', door: true }],
    }));
  })();

  C7.talkTengpo = async (S) => {
    if (S.has('ch7_dawn_after')) {
      await S.say('tengpo:normal', U.pick(['夢裡看見的東西要醒著去做。不然就只是做了個好看的夢。', '睡不好的話來找我。不是給你更多藥，是給你一杯熱水，跟一個老太婆。', '孩子，要買藥就說，要聊天就坐，要哭就去外面，別把我的菸草弄濕。']));
      if (U.hash(G.state.steps, 1, 3) < 0.3) await S.say('tengpo:smile', '你這隻胖貓，一半住在夢裡，一半住在別人的碗裡。');
    } else if (S.has('ch7_dieta')) {
      await S.say('tengpo:serious', '三天，不吃鹽、不吃糖、不吃肉、不喝酒。尤其是你，戴髮冠的。');
    } else await S.say('tengpo:normal', '錢？好吧，拿來。這座山上錢沒什麼用，但可以拿來墊桌腳。');
    const opts = ['看看藥草', '聊聊', '離開'];
    if (S.has('ch7_dieta') && !S.has('ch7_rite')) opts.unshift('我準備好了（入夢禮）');
    const c = await S.choice(opts, { cancel: opts.length - 1 });
    const k = opts[c];
    if (k === '我準備好了（入夢禮）') { await C7.scene79(S); return; }
    if (k === '看看藥草') {
      await S.say('tengpo:normal', '看吧。別摸，摸了就要買。');
      await S.shop(['c7_yunwu', 'c7_shanshen', 'huanhunxiang', 'c7_qingxintai', 'c7_tobacco', 'c7_ar_taiyi'], { title: '藤婆的藥草' });
      await S.say('tengpo:normal', '拿去。藥是藥，不是神仙。好好睡覺比什麼都有用。');
      await S.say('tengpo:normal', '孩子，路上小心。霧會咬人。');
    } else if (k === '聊聊') {
      await S.say('tengpo:normal', '孩子，要買藥就說，要聊天就坐，要哭就去外面，別把我的菸草弄濕。');
    }
  };

  // 7-8 藤婆 + 7-8b 三天
  C7.scene78 = async (S) => {
    S.flag('ch7_tengpo_met');
    S.quest('q_ch7_main', 4);
    stage(S, [['player', 8, 11, 'up'], ['hongying', 7, 11, 'up'], ['yungui', 9, 11, 'up'], ['yuyuan', 8, 12, 'up']]);
    spawn(S, { id: 'tp', sprite: 'tengpo', x: 8, y: 7, dir: 'down', portrait: 'tengpo' });
    await S.camera(8, 8, 0.6);
    await S.lines([
      ['', '屋前的火堆邊，一個瘦小的老婦人坐在木頭上，叼著長長的菸桿。白髮挽成髻，插著一根木簪。'],
      ['', '她吐出一口煙。煙在空中盤成一條小蛇的形狀，然後散掉。'],
      ['tengpo:normal', '刮了泥沒有？'],
      ['xinghe:surprise', '刮、刮了！'],
      ['tengpo:think', '嗯。孩子們，坐。不，那根木頭有螞蟻，坐另外那根。'],
      ['yungui:serious', '前輩就是藤婆？我們是陳渡——陳伯讓我們來的。'],
      ['tengpo:think', '陳渡……那個愛哭的小船夫。'],
      ['hongying:surprise', '愛哭？陳伯？'],
      ['tengpo:smile', '五十年前，他第一次在海上送走一個孩子的魂，哭得像隻落水的狗。'],
      ['tengpo:smile', '坐在我這裡哭了三天。後來他就再也沒哭過了。我倒覺得可惜。'],
    ]);
    await S.move('tp', 'DDD');
    await S.lines([
      ['', '藤婆站起身，走到星河面前，用菸桿輕輕抬起他的下巴。'],
      ['tengpo:serious', '……嗯。這燈芯是借來的。'],
      ['tengpo:serious', '借了十八年，借主走遠了，火就認不得路了。'],
      ['xinghe:serious', '婆婆，有辦法嗎？'],
      ['tengpo:think', '有。也沒有。'],
      ['yungui:smug', '這種回答，我師父也很愛用。'],
      ['tengpo:smug', '那你師父是個聰明人。'],
      ['tengpo:serious', '孩子，我沒辦法幫你點火。這世上能點燃那種火的，只有燈母。'],
      ['tengpo:serious', '但我可以替你開一扇門。走進去之後，能不能見到她、會看見什麼，'],
      ['tengpo:serious', '我都不知道。那是你的路，不是我的。'],
      ['', '藤婆指向屋後垂下的金綠色粗藤。'],
      ['tengpo:normal', '那是夢藤。只長在這片雲裡。我用它熬一碗湯，叫做夢藤湯。'],
      ['tengpo:normal', '喝下去，人會往自己的裡面走。走得很深，深到平常走不到的地方。'],
      ['tengpo:serious', '那不是好玩的地方，孩子。有人在裡面笑，也有人在裡面哭到天亮。'],
      ['tengpo:serious', '它會給你看你一直不肯看的東西。'],
      ['yungui:think', '這就是「入夢禮」……典籍裡只寫了三個字：「慎之，慎之。」'],
      ['tengpo:smug', '寫書的人大概沒喝過。喝過的人通常不寫書。'],
      ['yungui:surprise', '……！'],
      ['', '雲歸懷裡掉出一本破破爛爛的手札。藤婆撿起來翻了翻。'],
      ['tengpo:think', '「蕈類圖說，雲歸手錄」……嗯。'],
      ['tengpo:think', '這頁畫錯了。這朵不是能吃的雞肉菇，這朵會讓你拉三天肚子。'],
      ['yungui:surprise', '怎麼可能！我還吃過——'],
      ['yungui:hurt', '……原來那三天是因為這個。'],
      ['hongying:laugh', '噗。'],
      ['tengpo:normal', '好了。規矩是這樣的，聽清楚。'],
      ['tengpo:serious', '第一，三天之內，不吃鹽、不吃糖、不吃肉、不喝酒。'],
      ['yungui:surprise', '不喝——'],
      ['tengpo:serious', '尤其是你。戴髮冠的。'],
      ['tengpo:serious', '第二，每個人都要自己想清楚：為什麼走進去。不是為了好奇，不是為了逞強。'],
      ['tengpo:serious', '第三，我會整夜坐在火邊。你們在裡面迷路了，就聽我的聲音。'],
      ['tengpo:normal', '不想去的人，就留在外面幫我顧火。這也很重要，一點都不丟臉。'],
      ['', '芋圓湊到陶壺邊，聞了聞。'],
      ['tengpo:think', '你也想喝？'],
      ['tengpo:smile', '小東西，貓本來就一半住在夢裡。你不用喝，到時候自然會在裡面等他們。'],
      ['yungui:smug', '難怪牠吃飽就睡，睡飽就吃。原來是在通勤。'],
      ['tengpo:normal', '花的那隻，就留在火邊陪我。她在等的人，不在夢裡。'],
      ['', '麻糬在藤婆身邊坐下，尾巴繞著前腳，望著火。'],
    ]);
    S.emote('yuyuan', '💢');
    await S.wait(0.6);
    await S.lines([
      ['hongying:serious', '我去。'],
      ['tengpo:think', '為什麼？'],
      ['hongying:serious', '因為……他一個人進去，我會在外面一直想著要衝進去。'],
      ['hongying:shy', '還有……我自己也有一些，一直不肯看的東西。'],
      ['tengpo:normal', '這個理由可以。'],
      ['yungui:normal', '我也去。'],
      ['tengpo:think', '你是為了好奇？'],
      ['yungui:think', '……一半一半。'],
      ['yungui:serious', '另一半是，我師父失蹤之前，最後在讀的就是「內景」。'],
      ['yungui:serious', '我想知道他看到了什麼。我想知道……他去了哪裡。'],
      ['tengpo:smile', '嗯。誠實。進去的人最需要的就是這個。'],
    ]);
    // 7-8b 三天（蒙太奇）
    await S.fadeOut(0.8);
    S.flag('ch7_dieta');
    await S.narrate(['第一天。'], { veil: 1 });
    stage(S, [['player', 9, 10, 'up'], ['hongying', 6, 9, 'right'], ['yungui', 7, 10, 'up'], ['yuyuan', 10, 10, 'left']]);
    S.setPos('tp', 8, 7, 'down');
    await S.fadeIn(0.6);
    await S.say('', '雲歸對著一鍋清水煮山菜發呆。');
    await S.say('yungui:cry', '沒有鹽……沒有酒……人生還有什麼意義……');
    await S.say('tengpo:smug', '有啊。意義就是第二天。');
    await S.fadeOut(0.6);
    await S.narrate(['第二天。'], { veil: 1 });
    await S.fadeIn(0.6);
    await S.say('', '紅纓自告奮勇下廚。眾人臉色發白。');
    await S.lines([
      ['hongying:serious', '今天我來。'],
      ['xinghe:hurt', '我可以拒絕嗎？'],
      ['', '紅纓端出一碗清煮地瓜葉與白粥。眾人戰戰兢兢地吃了一口。'],
      ['xinghe:surprise', '……能吃。'],
      ['yungui:surprise', '……能吃！'],
      ['', '芋圓把自己那一小碗舔得乾乾淨淨。'],
      ['hongying:surprise', '真的？！'],
      ['tengpo:think', '嗯。孩子，妳的問題從來不是手藝。是調味。'],
      ['tengpo:smug', '不准放鹽、不准放糖，妳就沒機會毀掉它。'],
    ]);
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '這算誇獎嗎！');
    await S.fadeOut(0.6);
    await S.narrate(['第三天。黃昏。'], { veil: 1 });
    S.light({ ambient: 0.5, color: '#2a1a30', playerR: 200 });
    stage(S, [['player', 10, 5, 'up'], ['hongying', 3, 9, 'right'], ['yungui', 4, 11, 'up'], ['yuyuan', 5, 11, 'up']]);
    S.setPos('tp', 11, 5, 'left');
    await S.camera(10, 4, 0.1);
    await S.fadeIn(0.8);
    await S.say('', '星河坐在屋外，看著夢藤。藤婆坐到他旁邊抽菸。');
    await S.lines([
      ['tengpo:normal', '怕嗎？'],
      ['xinghe:smile', '怕啊。我這個人一向很怕，只是怕過頭就會不小心變勇敢。'],
      ['tengpo:smile', '這是個好毛病。'],
      ['xinghe:think', '婆婆，妳見過她嗎？借我火的那個人。'],
      ['tengpo:think', '……見過。不只一次。'],
      ['xinghe:surprise', '不只一次？'],
      ['tengpo:normal', '進去了，你就知道了。孩子，天要黑了。去洗把臉。'],
    ]);
    S.remove('tp');
    S.refresh();
    S.objective('準備好了，就和藤婆說話（入夢禮）');
    S.cameraFollow();
  };

  // 7-9 入夢禮
  C7.scene79 = async (S) => {
    S.bgm(null);
    await S.fadeOut(0.8);
    S.light({ ambient: 0.8, color: '#06060e', playerR: 90 });
    S.particles([{ type: 'embers', density: 0.9 }, { type: 'fireflies', density: 0.6 }]);
    stage(S, [['player', 8, 10, 'up'], ['hongying', 6, 8, 'right'], ['yungui', 10, 8, 'left'], ['yuyuan', 9, 10, 'up']]);
    S.setPos('tengpo', 8, 7, 'down');
    await S.camera(8, 8, 0.1);
    await S.fadeIn(1.2);
    await S.lines([
      ['', '夜。屋前的火堆燒得很高。蓆子圍著火排開。'],
      ['', '藤婆換上一件深色的長衫，頸上掛著一串木珠。她的眼神變了：不再是那個抽菸開玩笑的老太婆。'],
      ['tengpo:serious', '坐下。背挺直。看著火。'],
      ['tengpo:serious', '在喝之前，每個人說一次：你為什麼要走進去。'],
      ['tengpo:serious', '說給火聽，也說給自己聽。說了，就不要改。'],
      ['tengpo:normal', '先說的，從最年輕的開始。'],
    ]);
    const c = await S.choice(['「我想活下去。」', '「我想救回白芷。」', '「我想知道，我借來的光該怎麼還。」']);
    S.flag('ch7_intent', c + 1);
    if (c === 0) await S.say('tengpo:think', '很誠實。活下去的人，才能做其他所有事。');
    else if (c === 1) await S.say('tengpo:think', '很勇敢。但是孩子，救人的人要先站得住。記住這句話。');
    else await S.say('tengpo:smile', '……嗯。這是個好問題。答案可能不是你想的那個。');
    await S.lines([
      ['hongying:serious', '我想知道……我能不能不再恨他。'],
      ['hongying:sad', '不，不對。我想知道，我恨他，是不是因為我很怕再失去他一次。'],
      ['tengpo:normal', '好。'],
      ['yungui:normal', '我想找到我師父。'],
      ['tengpo:serious', '那是你的目的，不是你的意圖。再說一次。'],
      ['yungui:think', '…………'],
      ['yungui:sad', '我想知道，我是不是讓他失望了。'],
      ['tengpo:normal', '好。'],
      ['', '藤婆從火邊的陶壺裡倒出三小碗濃稠的深褐色湯汁。蒸氣帶著泥土、樹皮和某種苦澀的甜味。'],
      ['tengpo:serious', '夢藤湯。一口喝完，不要停。'],
      ['', '星河接過碗。手在抖。'],
      ['xinghe:think', '……這個顏色，跟紅纓煮的粥好像。'],
      ['hongying:angry', '你給我閉嘴喝。'],
    ]);
    S.flash('#000', 0.5, 0.9);
    S.sfx('gong');
    await S.wait(0.8);
    await S.lines([
      ['xinghe:hurt', '苦……好苦……這是我這輩子喝過最苦的——'],
      ['yungui:hurt', '……我收回我說過的所有關於苦茶的抱怨。'],
      ['tengpo:normal', '躺下。閉眼也可以，睜眼也可以。不要抓，不要逃。'],
      ['tengpo:normal', '等它來。'],
      ['', '藤婆坐回火邊，閉上眼，開始低聲吟唱。那是一種沒有人聽過的語言，比任何一種話都更老，音節像水滴落在石頭上。'],
    ]);
    S.bgm('vision', { fade: 4 });
    G.Audio.setMusicVol && G.Audio.setMusicVol(Math.min(G.settings.music, 0.25));
    await S.wait(1.5);
    await S.say('', '起初什麼都沒有發生。然後，火的顏色開始改變。');
    C7.riteK = 0;
    await G.Tweens.to(C7, { riteK: 0.5 }, 2.0, 'linear');
    await S.lines([
      ['hongying:surprise', '……星河，你有看到嗎？樹……在呼吸。'],
      ['xinghe:surprise', '有……火裡面……有花紋。一直在長出新的花紋。'],
    ]);
    await G.Tweens.to(C7, { riteK: 1 }, 2.0, 'linear');
    await S.say('', '火星飛上天，在空中連成一條一條細線，線又交織成網格，網格又開出一朵朵幾何的花，然後花一層一層向內折疊。');
    S.move('hongying', 'L', { wait: false });
    await S.wait(0.4);
    await S.lines([
      ['', '紅纓忽然翻身，抓過身邊的木桶，劇烈地吐了起來。'],
      ['tengpo:normal', '（不中斷吟唱的語氣）吐吧，孩子。'],
      ['tengpo:normal', '吐出來的不是湯，是妳這三年一直吞下去的東西。'],
      ['', '紅纓一邊吐一邊哭。藤婆的一隻手輕輕放在她的背上，另一隻手繼續打著拍子。'],
      ['hongying:cry', '對不起……對不起……我不知道我在跟誰說對不起……'],
      ['tengpo:normal', '沒關係。說就好。這叫洗心。'],
      ['', '雲歸側躺著，緩慢地深呼吸，手指在空中無意識地描著符文。'],
      ['yungui:think', '好多字……空氣裡全是字……全是我沒讀過的經……'],
      ['tengpo:smug', '別讀了，戴髮冠的。這次用看的。'],
      ['', '星河坐起來，捂著胸口。他吐出的東西在火光中是黑色的，像一小灘海水，冒著細細的泡。'],
      ['', '那灘黑水在地上微微蠕動，向西——海的方向——爬了幾寸，然後蒸發。'],
      ['tengpo:serious', '……把不是你的東西，還給海。'],
      ['xinghe:hurt', '婆婆……我好冷……'],
      ['tengpo:normal', '我知道。往裡面走，孩子。裡面有火。'],
      ['', '藤婆吐出一口長長的煙。煙在火的上方盤旋，越盤越大，鱗片一片一片浮現，每一片都是一個不斷變幻的紋樣——'],
      ['', '那是一條雲做的、巨大的蛇。'],
    ]);
    C7.riteSerpent = 0;
    await G.Tweens.to(C7, { riteSerpent: 1 }, 2.0, 'linear');
    await S.lines([
      ['', '雲蛇低下頭，看著星河。牠的眼睛裡是整片星空。'],
      ['雲蛇', '……'],
      ['', '它沒有開口。但星河聽見了。'],
      ['雲蛇', '「點燈的孩子。進來。」'],
      ['tengpo:normal', '（聲音變得很遠）去吧。我在這裡。迷路的時候，跟著我的聲音。'],
    ]);
    S.flag('ch7_rite');
    G.Audio.setMusicVol && G.Audio.setMusicVol(G.settings.music);
    S.flash('#ffffff', 1.2, 1);
    await S.fadeOut(1.2, '#fff');
    C7.riteK = 0; C7.riteSerpent = 0;
    S.quest('q_ch7_main', 4);
    await S.warp('vision_hub', 20, 22, 'up', { fade: 0, stayDark: true, noAutosave: true });
  };

  // ================================================================================================ 1.10 靈境 (shared)
  const BREATH_COLS = ['#ffcf6a', '#6ae8e0', '#c08aff'];
  C7.big = { x: 0, y: 0, ok: false, dir: 'down' };
  C7.leo = { x: 20, y: 20, a: 1, sit: true };
  function hue8(t) {
    // gold → cyan → purple → gold every 8 seconds
    const p = (t / 8) % 1 * 3, i = Math.floor(p), f = p - i;
    return U.mix(BREATH_COLS[i % 3], BREATH_COLS[(i + 1) % 3], f);
  }
  function drawBigTuanzi(ctx, m, t) {
    if (C7.bigHide) return;
    const p = m.player;
    if (!m._trail) { m._trail = []; m._trailKey = null; }
    const key = p.x + ',' + p.y;
    if (m._trailKey !== key) { m._trail.push([p.px, p.py, p.dir]); m._trailKey = key; if (m._trail.length > 10) m._trail.shift(); }
    let tx, ty, dir;
    if (C7.bigFixed) { tx = C7.bigFixed[0] * T + 32; ty = C7.bigFixed[1] * T + T - 8; dir = C7.bigFixed[2] || 'down'; }
    else { const tr = m._trail[Math.max(0, m._trail.length - 4)] || [p.px, p.py + T, p.dir]; tx = tr[0]; ty = tr[1]; dir = tr[2]; }
    if (!C7.big.ok || Math.hypot(C7.big.x - tx, C7.big.y - ty) > 8 * T) { C7.big.x = tx; C7.big.y = ty; C7.big.ok = true; }
    const mv = Math.hypot(tx - C7.big.x, ty - C7.big.y);
    C7.big.x += (tx - C7.big.x) * 0.08; C7.big.y += (ty - C7.big.y) * 0.08;
    if (mv > 6) C7.big.dir = Math.abs(tx - C7.big.x) > Math.abs(ty - C7.big.y) ? (tx > C7.big.x ? 'right' : 'left') : (ty > C7.big.y ? 'down' : 'up');
    else C7.big.dir = dir || C7.big.dir;
    const x = C7.big.x, y = C7.big.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - 50, 4, x, y - 50, 110);
    g.addColorStop(0, 'rgba(255,220,150,0.25)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 110, y - 160, 220, 220);
    ctx.restore();
    G.Sprites.drawChar(ctx, 'yuyuan', C7.big.dir, mv > 6 ? Math.floor(t * 6) % 4 : 0, Math.round(x), Math.round(y), { scale: 2.2 });
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
      const sx = x + Math.sin(i * 2.1) * 34, sy = y - 30 - (i % 3) * 18 - Math.cos(i * 1.3) * 10;
      ctx.fillStyle = `rgba(255,248,210,${0.6 * a})`;
      ctx.beginPath(); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx + 1.2, sy - 1.2); ctx.lineTo(sx + 4, sy); ctx.lineTo(sx + 1.2, sy + 1.2); ctx.lineTo(sx, sy + 4); ctx.lineTo(sx - 1.2, sy + 1.2); ctx.lineTo(sx - 4, sy); ctx.lineTo(sx - 1.2, sy - 1.2); ctx.fill();
    }
    ctx.restore();
  }
  function drawLeopard(ctx, t) {
    const L = C7.leo;
    if (!L || L.a <= 0.01) return;
    const x = L.x * T + 32, y = L.y * T + T - 8;
    ctx.save();
    ctx.globalAlpha = L.a;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - 40, 4, x, y - 40, 120);
    g.addColorStop(0, 'rgba(180,200,255,0.28)'); g.addColorStop(1, 'rgba(140,160,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 120, y - 160, 240, 240);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = L.a * 0.92;
    G.Sprites.drawChar(ctx, 'cat', L.dir || 'down', L.walk ? Math.floor(t * 6) % 4 : 0, x, y, { scale: 2.4, ghost: true });
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = 0.4 + 0.4 * Math.sin(t * 1.5 + i * 2.2);
      ctx.strokeStyle = `rgba(210,220,255,${0.5 * a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x - 30 + (i % 4) * 18, y - 34 - Math.floor(i / 4) * 18, 7, 5, i, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  C7.drawLeopard = drawLeopard;
  // the cloud serpent coiling around the realm (background band on the void)
  function drawSerpent(ctx, m, t, cx, cy, R, k = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const N = 90;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + t * 0.05;
      const wob = Math.sin(a * 5 + t * 0.6) * 0.8;
      const x = (cx + Math.cos(a) * (R + wob)) * T, y = (cy + Math.sin(a) * (R + wob) * 0.92) * T;
      const w = 44 + 14 * Math.sin(a * 3 - t);
      const col = hue8(t + i * 0.09);
      ctx.fillStyle = U.rgba(col, 0.07 * k);
      ctx.beginPath(); ctx.arc(x, y, w, 0, Math.PI * 2); ctx.fill();
      if (i % 2 === 0) {
        ctx.strokeStyle = U.rgba(col, 0.22 * k); ctx.lineWidth = 2;
        ctx.beginPath();
        for (let s = 0; s < 6; s++) { const aa = s / 6 * Math.PI * 2 + t * 0.4 + i; const rr = w * 0.45; if (s === 0) ctx.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); else ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function breathOverlay(ctx, m, t, alpha = 0.12) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = U.rgba(hue8(t), alpha);
    ctx.fillRect(m.cam.x - 40, m.cam.y - 40, G.W + 80, G.H + 80);
    ctx.restore();
  }
  // 藤婆's distant voice when idle in the realm
  const VOICE = ['藤婆的聲音：「孩子，呼吸。」', '藤婆的聲音：「別抓，看就好。」', '藤婆的聲音：「我在這裡。」', '藤婆的聲音：「你們做得很好。」'];
  function idleVoice(m, t) {
    const last = m._c7t == null ? t : m._c7t;
    const dt = Math.min(0.1, t - last);
    m._c7t = t;
    if (G.Script.busy() || m.player.moving || G.Scenes.top() !== m) { m._c7idle = 0; return; }
    m._c7idle = (m._c7idle || 0) + dt;
    if (m._c7idle > 30) { m._c7idle = 0; G.UI.toast(U.pick(VOICE), { icon: 'vine' }); }
  }
  function enterVision(S) {
    if (!F().yuyuan_hidden || !F().mochi_hidden) { F().yuyuan_hidden = true; F().mochi_hidden = true; S.refresh(); }
    C7.big.ok = false;
  }
  function visionMap(d) {
    const base = {
      place: 'yushan', bgm: 'vision', noSave: true, autosave: false,
      light: { ambient: 0.2, color: '#140828', playerR: 240 },
      psychedelic: 0.32,
      particles: [{ type: 'motes', density: 2.2 }, { type: 'petals', density: 0.4 }, { type: 'sparkles', density: 0.6 }],
      bg: '#04020c',
    };
    const out = Object.assign(base, d);
    const og = d.drawGround, oo = d.drawOver, oe = d.onEnter;
    out.drawGround = (ctx, t, m) => { if (og) og(ctx, t, m); partyAura(ctx, m, t); };
    out.drawOver = (ctx, t, m) => { if (oo) oo(ctx, t, m); if (!d.noBig) drawBigTuanzi(ctx, m, t); breathOverlay(ctx, m, t); idleVoice(m, t); };
    out.onEnter = async (S) => { enterVision(S); if (oe) await oe(S); };
    return M(out);
  }

  // ================================================================================================ vision_hub 呼吸之庭 (P7-4)
  C7.bridges = [];
  (function () {
    const g = new Grid(40, 40, ' ', 710);
    g.blob(20, 20, 5.6, 5.6, 'V', 0.05);
    for (const [x, y] of [[5, 20], [20, 5], [35, 20], [20, 35]]) g.blob(x, y, 3.2, 3.2, 'V', 0.1);
    g.rect(18, 18, 5, 5, '*');
    const B = [];
    const bridge = (cells) => { for (const [x, y] of cells) { g.set(x, y, 'o'); B.push([x, y]); } };
    const petal = (cells) => { for (const [x, y] of cells) g.set(x, y, 'V'); };
    for (const y of [19, 20, 21]) { bridge([[9, y], [10, y], [13, y], [14, y], [26, y], [27, y], [30, y], [31, y]]); petal([[11, y], [12, y], [28, y], [29, y]]); }
    for (const x of [19, 20, 21]) { bridge([[x, 9], [x, 10], [x, 13], [x, 14], [x, 26], [x, 27], [x, 30], [x, 31]]); petal([[x, 11], [x, 12], [x, 28], [x, 29]]); }
    C7.bridges = B;
    const pillarPairs = [[3, 18], [3, 22], [18, 3], [22, 3], [37, 18], [37, 22], [18, 37], [22, 37]];
    for (const [x, y] of pillarPairs) g.obj('geometry_pillar', x, y);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + 0.26;
      const x = Math.round(20 + Math.cos(a) * 5), y = Math.round(20 + Math.sin(a) * 5);
      if (g.get(x, y) === 'V' && Math.abs(x - 20) > 1 && Math.abs(y - 20) > 1 && g.isFree(x, y)) g.obj(i % 3 === 0 ? 'geometry_pillar' : 'jewel_flower', x, y);
    }
    g.obj('crystal', 23, 23, { label: '調查' });
    g.reserve(18, 18, 5, 5); g.reserve(2, 19, 4, 3); g.reserve(19, 2, 3, 4); g.reserve(35, 19, 4, 3); g.reserve(19, 35, 3, 4);
    g.scatter(['jewel_flower', 'mushroom_glow', 'crystal', 'jewel_flower'], 22, { on: 'V' });
    const crystal = g.objs.find((o) => o.t === 'crystal' && o.x === 23);
    crystal.interact = async (S) => {
      await S.say('', '一顆會發光的水晶，裡面有火在慢慢地呼吸。');
      const c = await S.choice(['記錄此刻（存檔）', F().ch7_breath_slow ? '讓呼吸恢復原本的速度' : '讓呼吸慢一點（6 秒一次）', '離開'], { cancel: 2 });
      if (c === 0) await S.saveMenu();
      else if (c === 1) { S.flag('ch7_breath_slow', !F().ch7_breath_slow); S.toast(F().ch7_breath_slow ? '呼吸變慢了。' : '呼吸恢復了原本的速度。', 'vine'); }
    };
    const onBridge = (x, y) => B.some(([bx, by]) => bx === x && by === y);
    const breath = (m) => { const P = F().ch7_breath_slow ? 6 : 4; return (m.t % P) / P < 0.5 ? 'in' : 'out'; };
    C7.breath = breath;

    G.Maps.define('vision_hub', visionMap({
      name: '呼吸之庭', subtitle: '靈境', noSave: false, autosave: true,
      start: [20, 22],
      tiles: g.rows(), objects: g.objs,
      npcs: [
        { id: 'leopard', sprite: 'cat', name: '雲豹', x: 20, y: 20, dir: 'down', if: (st) => !st.flags.ch7_east_open, talk: async (S) => {
          await S.say('', '雲豹靜靜地坐著。牠的身體像霧，又像夜空。');
          if (!S.has('ch7_trial_hongying') || !S.has('ch7_trial_yungui')) await S.say('雲蛇', '「三個人。三道傷。先去看別人的，再看自己的。」');
        } },
      ],
      enemies: [
        { id: 'vh1', troop: 't_c7_vision', x: 33, y: 22, art: 'serpent_shade', lv: 25, radius: 1, chase: 2 },
        { id: 'vh2', troop: 't_c7_vision', x: 6, y: 18, art: 'hundred_eye', lv: 25, radius: 1, chase: 2 },
      ],
      events: [
        { id: 'arrive', trigger: 'auto', if: (st) => !st.flags.ch7_vision_enter, run: async (S) => { await C7.scene710a(S); } },
        { id: 'east_open', trigger: 'auto', if: (st) => !!st.flags.ch7_trial_hongying && !!st.flags.ch7_trial_yungui && !st.flags.ch7_east_open, run: async (S) => { await C7.scene710d(S); } },
        { id: 'south', trigger: 'touch', x: 18, y: 34, w: 5, h: 4, run: async (S) => {
          await S.say('', '南邊什麼都沒有。只有很遠很遠的地方，傳來一個老婦人的吟唱。');
          await S.say('tengpo:normal', '……還不是回來的時候，孩子。往裡面走。');
          await S.warp('vision_hub', 20, 28, 'up', { fade: 0.3, noAutosave: true });
        } },
        { id: 'east_shut', trigger: 'touch', x: 34, y: 18, w: 4, h: 5, if: (st) => !st.flags.ch7_east_open, run: async (S) => {
          await S.say('', '東門被濃霧封住了。霧裡有海浪的聲音。');
          await S.say('雲蛇', '「先去看別人的，再看自己的。」');
          await S.warp('vision_hub', 25, 20, 'left', { fade: 0.3, noAutosave: true });
        } },
        { id: 'west_done', trigger: 'touch', x: 2, y: 19, w: 2, h: 3, if: (st) => !!st.flags.ch7_trial_hongying, run: async (S) => {
          await S.say('', '西門的光已經安靜下來了。洛家的院子，不需要再回去了。');
          await S.move('player', 'R');
        } },
        { id: 'north_done', trigger: 'touch', x: 19, y: 2, w: 3, h: 2, if: (st) => !!st.flags.ch7_trial_yungui, run: async (S) => {
          await S.say('', '北門的雲已經散了。太虛觀的門檻，又變回了原本的高度。');
          await S.move('player', 'D');
        } },
      ],
      warps: [
        { x: 2, y: 19, w: 2, h: 3, to: 'vision_hongying', tx: 18, ty: 26, tdir: 'up', if: (st) => !st.flags.ch7_trial_hongying },
        { x: 19, y: 2, w: 3, h: 2, to: 'vision_yungui', tx: 16, ty: 28, tdir: 'up', if: (st) => !st.flags.ch7_trial_yungui },
        { x: 36, y: 19, w: 2, h: 3, to: 'vision_xinghe', tx: 20, ty: 27, tdir: 'up', if: (st) => !!st.flags.ch7_east_open },
      ],
      onEnter: async (S) => {
        const lv = G.mapScene.actor('leopard');
        if (lv) lv.alpha = 0;
        C7.leo = { x: 20, y: 20, a: F().ch7_east_open ? 0 : 1, dir: 'down' };
      },
      drawGround: (ctx, t, m) => {
        drawSerpent(ctx, m, t, 20, 20, 15.5);
        const inhale = breath(m) === 'in';
        // bridge passability follows the breath (only while the player is free to move)
        if (!G.Script.busy()) {
          for (const [x, y] of B) m.solid[y * m.w + x] = inhale ? 1 : 0;
          const p = m.player;
          if (inhale && !p.moving && onBridge(p.x, p.y) && G.Scenes.top() === m) {
            G.Script.run(async (S) => {
              const cands = [];
              for (let r = 1; r < 4 && !cands.length; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
                const nx = p.x + dx, ny = p.y + dy;
                if (!onBridge(nx, ny) && m.terrain[ny * m.w + nx] && m.terrain[ny * m.w + nx] !== 'void') cands.push([nx, ny]);
              }
              const tgt = cands.sort((a, b) => Math.hypot(a[0] - 20, a[1] - 20) - Math.hypot(b[0] - 20, b[1] - 20))[0] || [20, 22];
              await S.warp('vision_hub', tgt[0], tgt[1], p.dir, { fade: 0.2, color: '#ffe0a0', noAutosave: true });
              if (!m._c7pushed || U.rand(0, 1) < 0.4) { m._c7pushed = true; await S.say('tengpo:normal', '別急，孩子。跟著呼吸走。'); }
            });
          }
        }
        // breathing floor: rings on the platform, bridges glow gold (inhale, ghostly) or cyan (exhale, solid)
        const P = F().ch7_breath_slow ? 6 : 4, ph = (m.t % P) / P;
        const swell = Math.sin(ph * Math.PI * 2);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < 5; r++) {
          const rr = (1.5 + r * 1.1 + swell * 0.35) * T;
          ctx.strokeStyle = U.rgba(inhale ? '#ffcf6a' : '#6ae8e0', 0.18 - r * 0.025);
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(20.5 * T, 20.5 * T, rr, rr, 0, 0, Math.PI * 2); ctx.stroke();
        }
        for (const [x, y] of B) {
          const a = inhale ? 0.1 + 0.08 * Math.sin(t * 6 + x + y) : 0.32 + 0.1 * Math.sin(t * 3 + x * 0.7);
          ctx.fillStyle = U.rgba(inhale ? '#ffcf6a' : '#6ae8e0', a);
          ctx.fillRect(x * T + 4, y * T + 4, T - 8, T - 8);
          if (!inhale) { ctx.strokeStyle = U.rgba('#c8fff8', 0.35); ctx.lineWidth = 1.5; ctx.strokeRect(x * T + 6, y * T + 6, T - 12, T - 12); }
        }
        ctx.restore();
        if (!F().ch7_east_open) {
          ctx.save();
          const g2 = ctx.createRadialGradient(35.5 * T, 20.5 * T, 10, 35.5 * T, 20.5 * T, 6 * T);
          g2.addColorStop(0, 'rgba(220,226,240,0.85)'); g2.addColorStop(1, 'rgba(200,210,230,0)');
          ctx.fillStyle = g2; ctx.fillRect(28 * T, 13 * T, 15 * T, 15 * T);
          ctx.restore();
        }
      },
      drawOver: (ctx, t) => { drawLeopard(ctx, t); },
    }));
  })();

  // 7-10a 呼吸之庭（進入）
  C7.scene710a = async (S) => {
    S.flag('ch7_vision_enter');
    stage(S, [['player', 20, 22, 'up'], ['hongying', 17, 22, 'right'], ['yungui', 23, 22, 'left']]);
    S.show('hongying', false); S.show('yungui', false);
    C7.bigHide = true;
    await S.camera(20, 21, 0.1);
    S.bgm('vision');
    await S.fadeIn(1.4);
    await S.lines([
      ['', '星河站在一片會呼吸的地面上：地上的花紋慢慢地向外推開，又慢慢地收回。'],
      ['', '天空是一條雲蛇的腹部，鱗片上的紋路一刻不停地重組成新的圖形。'],
      ['xinghe:surprise', '這裡是……'],
    ]);
    S.show('hongying', true);
    S.sfx('magic');
    await S.lines([
      ['hongying:surprise', '（從光中走出）星河！你——你沒事？你身上……好亮。'],
      ['xinghe:surprise', '妳也是。妳的頭髮在發光。'],
    ]);
    S.show('yungui', true);
    S.sfx('magic');
    await S.lines([
      ['yungui:think', '（從另一邊走出）顏色……有聲音。我聽得見紅色。紅色是低音。'],
      ['yungui:smile', '我要寫下來。我的手札——'],
      ['', '雲歸摸遍全身，沒有手札。'],
      ['yungui:sad', '……藤婆說得對。這次用看的。'],
    ]);
    C7.bigFixed = [24, 24, 'up'];
    C7.bigHide = false;
    C7.big.ok = false;
    S.sfx('push');
    await S.wait(0.8);
    C7.bigFixed = [20, 23, 'up'];
    await S.wait(1.0);
    await S.lines([
      ['', '地面上一團光滾過來，越滾越大，最後停在眾人面前——是芋圓，但有一頭水牛那麼大，身上的灰毛裡閃著一顆顆星星。'],
      ['xinghe:surprise', '芋圓？你……變好大！'],
      ['', '巨大的芋圓面無表情地看著他，緩緩眨了一下眼睛。'],
      ['yungui:think', '在這裡，牠就是這麼大。在外面，牠只是假裝很小，方便被抱。'],
      ['hongying:surprise', '……你怎麼知道？'],
      ['yungui:smile', '我不知道。但是在這裡，我聽得見牠在想什麼。牠在想晚餐。'],
      ['', '平台中央，一隻有著雲狀大斑紋的豹子靜靜坐著。牠的身體像霧，又像夜空。'],
      ['yungui:surprise', '雲豹……這座島上的雲豹，早就……'],
      ['yungui:think', '早就沒有了。外面的人已經很久沒有看見牠們了。'],
      ['yungui:think', '但是沒有被看見，不等於沒有。被忘記的東西，會到這裡來。'],
      ['hongying:think', '……麻糬呢？'],
      ['yungui:normal', '她留在藤婆的火邊。她在等的人不在這裡。'],
    ]);
    C7.leo.dir = 'left';
    await S.wait(0.6);
    C7.leo.dir = 'up';
    await S.wait(0.6);
    C7.leo.dir = 'right';
    await S.say('', '雲豹站起來，看了眾人一眼，轉身望向西、北兩扇門。東門被濃霧封住。');
    C7.leo.dir = 'down';
    await S.lines([
      ['雲蛇', '「三個人。三道傷。先去看別人的，再看自己的。」'],
      ['xinghe:think', '先去看別人的……'],
      ['hongying:serious', '那就從我的開始。'],
    ]);
    C7.bigFixed = null;
    await S.narrate(['呼吸之庭：地上的「呼吸橋」只在吐氣（青色）時存在。', '吸氣（金色）時，橋會消失。', '中間的花瓣平台可以停下來等待下一次吐氣。'], { veil: 0.6 });
    S.objective('西門：紅纓之境・北門：雲歸之境');
    S.quest('q_ch7_main', 4);
    G.Save.auto();
    S.cameraFollow();
  };

  // 7-10d 東門開啟
  C7.scene710d = async (S) => {
    S.flag('ch7_east_open');
    stage(S, [['player', 22, 20, 'right'], ['hongying', 21, 21, 'right'], ['yungui', 21, 19, 'right']]);
    await S.camera(26, 20, 0.6);
    S.sfx('wind');
    await S.say('', '東門的霧散開。雲豹站起身，第一次朝星河低吼了一聲，然後轉身走進門裡。');
    C7.leo.dir = 'right'; C7.leo.walk = true;
    await G.Tweens.to(C7.leo, { x: 35, a: 0 }, 2.0, 'linear');
    C7.leo.walk = false;
    await S.lines([
      ['雲蛇', '「現在，看你自己的。」'],
      ['hongying:serious', '我們陪你。'],
      ['xinghe:smile', '嗯。……其實我很怕，你們走前面好不好？'],
      ['hongying:angry', '笨蛋。'],
    ]);
    S.refresh();
    S.objective('東門：星河之境');
    S.cameraFollow();
  };

  // ================================================================================================ vision_hongying 紅纓之境 (P7-1 回馬照)
  const HY = { ox: 11, oy: 10, E: [0, 3], T: [8, 5], statue: [3, 6], mirrors: { A: [3, 3], B: [3, 0], C: [6, 0], D: [6, 5] }, init: { A: '\\', B: '\\', C: '/', D: '/' } };
  C7.HY = HY;
  C7.mirrors = () => { const v = G.state.vars; if (!v.c7_mirrors) v.c7_mirrors = Object.assign({}, HY.init); return v.c7_mirrors; };
  // trace the moonbeam through the 9×7 grid; returns { cells:[[x,y]...], hit:'T'|'statue'|null }
  C7.beam = () => {
    const mir = C7.mirrors();
    const at = {};
    for (const k in HY.mirrors) at[HY.mirrors[k].join(',')] = k;
    let [x, y] = HY.E, dx = 1, dy = 0;
    const cells = [[x, y]];
    for (let n = 0; n < 60; n++) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x > 8 || y > 6) return { cells, hit: null };
      cells.push([x, y]);
      if (x === HY.statue[0] && y === HY.statue[1]) return { cells, hit: 'statue' };
      if (x === HY.T[0] && y === HY.T[1]) return { cells, hit: dx === 1 ? 'T' : null };
      const k = at[x + ',' + y];
      if (k) {
        // '/': E→N, N→E, W→S, S→W ; '\': E→S, S→E, W→N, N→W  (y grows downward)
        if (mir[k] === '/') { const ndx = -dy, ndy = -dx; dx = ndx; dy = ndy; } else { const ndx = dy, ndy = dx; dx = ndx; dy = ndy; }
      }
    }
    return { cells, hit: null };
  };
  (function () {
    const g = new Grid(36, 30, ' ', 711);
    g.rect(3, 2, 30, 26, '%');
    for (let y = 2; y < 28; y++) for (let x = 3; x < 33; x++) if (U.hash(x, y, 12) < 0.18) g.set(x, y, 'V');
    g.rect(HY.ox, HY.oy, 9, 7, '%');
    g.rect(16, 27, 4, 3, '%');
    g.obj('house_minnan', 21, 12, { w: 5, h: 3, door: 0, v: 0, lit: false });
    g.obj('house_minnan', 4, 2, { w: 5, h: 3, v: 1, lit: false, door: false });
    g.obj('house_minnan', 26, 2, { w: 5, h: 3, v: 1, lit: false, door: false });
    g.obj('altar', 20, 15);
    for (const k in HY.mirrors) { const [mx, my] = HY.mirrors[k]; g.obj('mirror_stand', HY.ox + mx, HY.oy + my, { label: '轉動' }); }
    g.obj('statue_lion', HY.ox + HY.statue[0], HY.oy + HY.statue[1], { v: 1 });
    g.obj('lantern_string', 6, 6, { w: 6, v: 2 }); g.obj('lantern_string', 23, 6, { w: 6, v: 2 }); g.obj('lantern_string', 12, 20, { w: 8, v: 2 });
    g.obj('weapon_rack', 5, 9); g.obj('weapon_rack', 29, 9); g.obj('weapon_rack', 5, 17);
    g.obj('pillar', 10, 7); g.obj('pillar', 25, 7); g.obj('pillar', 10, 22); g.obj('pillar', 25, 22);
    for (const [x, y] of [[3, 2], [32, 2], [3, 27], [32, 27]]) g.obj('geometry_pillar', x, y);
    g.reserve(HY.ox - 1, HY.oy - 1, 11, 9); g.reserve(16, 22, 5, 8); g.reserve(19, 14, 7, 4);
    g.scatter(['jewel_flower', 'flowers', 'jewel_flower', 'crystal'], 16, { on: '%V' });
    const mirrorEvents = Object.keys(HY.mirrors).map((k) => ({
      id: 'mir_' + k, trigger: 'action', x: HY.ox + HY.mirrors[k][0], y: HY.oy + HY.mirrors[k][1], label: '轉動',
      if: (st) => !st.flags.ch7_hy_solved,
      run: async (S) => {
        const mir = C7.mirrors();
        mir[k] = mir[k] === '/' ? '\\' : '/';
        S.sfx('switch');
        const b = C7.beam();
        if (b.hit === 'statue') { S.sfx('ghost'); await S.say('？？？', '……妳還在恨我嗎？'); }
        if (b.hit === 'T') await C7.hySolved(S);
      },
    }));

    G.Maps.define('vision_hongying', visionMap({
      name: '紅纓之境', subtitle: '洛家古厝・中元夜',
      start: [18, 26], light: { ambient: 0.28, color: '#0a0620', playerR: 220 },
      psychedelic: (st) => (st.flags.ch7_trial_hongying ? 0.15 : 0.22),
      tiles: g.rows(), objects: g.objs,
      npcs: [
        { id: 'mask', sprite: 'qingfeng_mask', ghost: true, name: '鬼面', x: 22, y: 16, dir: 'left', if: (st) => !st.flags.ch7_trial_hongying, talk: async (S) => {
          if (!S.has('ch7_hy_solved')) await S.say('yungui:think', '先別過去。這裡的光是歪的。要先把月光送到正廳。');
        } },
      ],
      events: [
        { id: 'enter', trigger: 'auto', once: true, run: async (S) => {
          await S.camera(18, 18, 0.6);
          await S.lines([
            ['', '洛家古厝的院子，中元夜。但一切顏色反轉：紅燈籠是藍的，月亮是黑的，影子是白的。'],
            ['hongying:sad', '……是家。三年前的那一夜。'],
            ['xinghe:serious', '紅纓……'],
            ['hongying:serious', '沒事。我早就知道會是這裡。'],
            ['', '院子北側，正廳的祖先牌位前，站著一個戴鬼面的身影。他一動不動。'],
            ['hongying:angry', '鬼面……！'],
            ['yungui:think', '先別過去。這裡的光是歪的。要先把月光送到正廳。'],
          ]);
          S.objective('轉動四座刀鏡槍架，把月光送進正廳');
          S.cameraFollow();
        } },
        ...mirrorEvents,
        { id: 'back', trigger: 'touch', x: 16, y: 29, w: 4, h: 1, run: async (S) => { await S.warp('vision_hub', 6, 20, 'right', { noAutosave: true }); } },
      ],
      drawGround: (ctx, t) => {
        // the black moon (source) on the west side of the yard
        const ex = (HY.ox + HY.E[0]) * T + 32, ey = (HY.oy + HY.E[1]) * T + 32;
        ctx.save();
        const gm = ctx.createRadialGradient(ex - 40, ey, 4, ex - 40, ey, 70);
        gm.addColorStop(0, 'rgba(230,240,255,0.55)'); gm.addColorStop(1, 'rgba(180,200,255,0)');
        ctx.fillStyle = gm; ctx.fillRect(ex - 120, ey - 80, 160, 160);
        // target marker at the hall door
        const tx = (HY.ox + HY.T[0]) * T, ty = (HY.oy + HY.T[1]) * T;
        ctx.strokeStyle = `rgba(255,230,160,${0.4 + 0.2 * Math.sin(t * 3)})`; ctx.lineWidth = 2;
        ctx.strokeRect(tx + 6, ty + 6, T - 12, T - 12);
        ctx.restore();
      },
      drawOver: (ctx, t, m) => {
        const solved = F().ch7_hy_solved;
        const b = solved ? { cells: [[0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [7, 5], [8, 5]] } : C7.beam();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, a] of [[16, 0.14], [7, 0.4], [2.5, 0.9]]) {
          ctx.strokeStyle = `rgba(200,236,255,${a * (0.8 + 0.2 * Math.sin(t * 5))})`;
          ctx.lineWidth = w;
          ctx.beginPath();
          b.cells.forEach(([x, y], i) => { const px = (HY.ox + x) * T + 32, py = (HY.oy + y) * T + 20; if (i) ctx.lineTo(px, py); else ctx.moveTo(px - 50, py); });
          ctx.stroke();
        }
        // mirror orientation bars
        if (!solved) {
          const mir = C7.mirrors();
          for (const k in HY.mirrors) {
            const [mx, my] = HY.mirrors[k];
            const cx = (HY.ox + mx) * T + 32, cy = (HY.oy + my) * T + 4;
            ctx.strokeStyle = 'rgba(255,240,190,0.9)'; ctx.lineWidth = 4;
            ctx.beginPath();
            if (mir[k] === '/') { ctx.moveTo(cx - 16, cy + 16); ctx.lineTo(cx + 16, cy - 16); } else { ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy + 16); }
            ctx.stroke();
            G.Render.text(ctx, k, cx, cy - 48, { size: 16, align: 'center', color: '#fff2c8' });
          }
        }
        ctx.restore();
        // colour inversion of this realm until 紅纓 calls his name
        if (!F().ch7_trial_hongying && !C7.hyNormal) {
          ctx.save();
          ctx.globalCompositeOperation = 'difference';
          ctx.fillStyle = 'rgba(255,255,255,0.78)';
          ctx.fillRect(m.cam.x - 40, m.cam.y - 40, G.W + 80, G.H + 80);
          ctx.restore();
        }
      },
    }));
  })();

  C7.hySolved = async (S) => {
    S.flag('ch7_hy_solved');
    S.sfx('bell');
    S.flash('#dff4ff', 0.6, 0.6);
    await S.camera(20, 15, 0.8);
    await S.say('', '月光經由四面槍架上的刀鏡，曲折地照進正廳。祖先牌位亮起。鬼面轉過身。');
    S.face('mask', 'player');
    await S.lines([
      ['qingfeng_mask:normal', '洛家的女兒。妳終於來了。'],
      ['qingfeng_mask:smug', '妳追了我三年。妳恨我。妳每天晚上都夢見我。'],
      ['hongying:angry', '閉嘴！'],
      ['qingfeng_mask:smug', '來啊。殺了我。妳不是一直都想這麼做嗎？'],
      ['xinghe:serious', '紅纓，等等，這不是——'],
      ['hongying:angry', '讓開！這是我的！'],
    ]);
    const keep = G.state.party.slice();
    G.state.party = ['hongying'];
    let r;
    try { r = await S.battle('t_c7_mirror_qf', { loseOk: true, bgmAfter: 'vision' }); } finally { G.state.party = keep; }
    G.Party.healAll();
    C7.applyFlame();
    S.refresh();
    stage(S, [['player', 18, 17, 'right'], ['hongying', 20, 17, 'right'], ['yungui', 18, 18, 'right']]);
    S.setPos('mask', 22, 16, 'left');
    await S.camera(20, 16, 0.3);
    if (r === 'lose') await S.say('hongying:hurt', '……我打不贏。我從來就打不贏。');
    await S.lines([
      ['', '紅纓拄著槍喘氣。鬼面毫髮無傷。'],
      ['hongying:hurt', '為什麼……為什麼打不到你……'],
      ['yungui:serious', '（場外）洛姑娘。妳打的不是他。妳打的是妳自己的恨。'],
      ['yungui:serious', '恨是打不死的。它只會跟著妳的槍尖一起變長。'],
    ]);
    await S.say('', '紅纓垂下槍尖。很久。');
    await S.say('hongying:sad', '……哥。');
    S.sfx('shatter');
    S.shake(2, 0.3);
    await S.say('', '鬼面裂開一道縫。');
    await S.say('hongying:cry', '哥哥。青鋒。');
    S.sfx('shatter');
    S.flash('#8ab8ff', 0.5, 0.6);
    S.remove('mask');
    spawn(S, { id: 'young_qf', sprite: 'qingfeng', x: 22, y: 16, dir: 'left', portrait: 'qingfeng', ghost: true });
    await S.say('', '鬼面碎裂，片片化為藍色的光蝶飛散。面具下是一個十六歲的少年，穿著練功服，額頭有汗。');
    await S.lines([
      ['qingfeng:smile', '紅纓，槍尖又低了。手腕不要僵，要像握著一隻鳥。'],
      ['hongying:surprise', '……'],
      ['qingfeng:laugh', '握太緊，鳥會死；握太鬆，鳥會飛走。'],
      ['hongying:cry', '……你以前都這樣說。每一次都這樣說。'],
      ['qingfeng:smile', '因為妳每一次都握太緊啊。'],
      ['hongying:cry', '我恨你……我恨你騙我，恨你戴那個面具，恨你丟下我一個人……'],
      ['hongying:cry', '可是我更怕的是……如果我不恨你了，我就只剩下想你了。'],
      ['hongying:cry', '想你，比恨你痛太多了……'],
    ]);
    await S.move('young_qf', 'L');
    await S.say('', '少年青鋒走過來，用額頭輕輕碰了碰她的額頭——那是小時候的習慣。');
    await S.say('qingfeng:smile', '那就想吧。想人又不會死。');
    await S.move('young_qf', 'R');
    S.sfx('thunder');
    S.flash('#ffffff', 0.2, 1);
    await S.say('', '一瞬的幻象：黑色的海、一道黑色的雷光、一個背影張開雙臂擋在她面前。');
    await S.say('hongying:surprise', '……！哥——');
    await S.fadeActor('young_qf', 0, 0.8);
    S.remove('young_qf');
    C7.hyNormal = true;
    S.flag('ch7_trial_hongying');
    S.sfx('bell');
    await S.say('', '幻象消失。院子的顏色恢復正常：燈籠是紅的，月亮是白的。');
    await S.lines([
      ['hongying:sad', '…………'],
      ['xinghe:serious', '紅纓，妳剛才看到什麼了？'],
      ['hongying:normal', '……沒什麼。'],
      ['hongying:smile', '我好像……輕了一點。走吧。'],
    ]);
    S.learn('hongying', 'hy_fangshou');
    await S.wait(0.6);
    C7.hyNormal = false;
    await S.warp('vision_hub', 6, 20, 'right', { noAutosave: true });
  };

  // ================================================================================================ vision_yungui 雲歸之境 (P7-2 師父的燈)
  const LAMPS = [[13, 10], [15, 10], [17, 10], [13, 12], [15, 12], [17, 12], [13, 14], [15, 14], [17, 14]];
  C7.LAMPS = LAMPS;
  C7.lamps = () => { const v = G.state.vars; if (!v.c7_lamps) v.c7_lamps = [0, 1, 1, 1, 0, 1, 1, 1, 0]; return v.c7_lamps; };
  (function () {
    const g = new Grid(32, 32, ' ', 712);
    g.blob(16, 16, 13.5, 13.5, 'o', 0.12);
    g.rect(10, 1, 13, 18, 'T');
    g.rect(14, 18, 5, 14, 'o');
    g.blob(5, 22, 3, 2.5, 'T', 0.1); g.blob(26, 22, 3, 2.5, 'T', 0.1);
    g.obj('temple', 13, 2, { text: '太虛觀', door: 3 });
    LAMPS.forEach(([x, y]) => g.obj('stone_lantern', x, y, { lit: false }));
    g.obj('signboard', 11, 12, { text: '清虛', v: 1 });
    g.obj('incense_burner', 21, 8); g.obj('incense_burner', 11, 8);
    g.obj('bookshelf', 3, 21); g.obj('bookshelf', 25, 21); g.obj('bookshelf', 6, 23); g.obj('bookshelf', 27, 23);
    g.obj('stone_lantern', 10, 17, { lit: false }); g.obj('stone_lantern', 22, 17, { lit: false });
    g.obj('mushroom_glow', 4, 24); g.obj('mushroom_glow', 7, 21); g.obj('crystal', 28, 21);
    g.reserve(10, 7, 13, 12); g.reserve(14, 18, 5, 14);
    g.scatter(['jewel_flower', 'geometry_pillar', 'crystal', 'jewel_flower'], 18, { on: 'o' });
    const lampEvents = LAMPS.map(([x, y], i) => ({
      id: 'lamp' + i, trigger: 'action', x, y, label: '觸碰', if: (st) => !st.flags.ch7_yg_solved,
      run: async (S) => { await C7.touchLamp(S, i); },
    }));
    G.Maps.define('vision_yungui', visionMap({
      name: '雲歸之境', subtitle: '雲上的太虛觀',
      start: [16, 28],
      tiles: g.rows(), objects: g.objs,
      lights: () => C7.lamps().map((on, i) => (on ? { x: LAMPS[i][0], y: LAMPS[i][1] - 0.4, r: 120, color: '#ffd080', flicker: 0.2 } : null)).filter(Boolean),
      events: [
        { id: 'enter', trigger: 'auto', once: true, run: async (S) => {
          C7.ygChild = true;
          await S.camera(16, 14, 0.6);
          await S.lines([
            ['', '雲上浮著一座太虛觀，但一切都大得不合比例：門檻高到膝蓋，香爐像一座小山。'],
            ['', '雲歸低頭看自己：他變成了八九歲的小道童，道袍拖地。'],
            ['yungui:surprise', '……喂。這也太過分了吧。'],
            ['hongying:laugh', '噗——好可愛！'],
            ['yungui:angry', '洛姑娘，妳現在不准說話。'],
            ['', '巨大的芋圓低頭看著小小的雲歸，鬍子動了一下。看起來非常滿意。'],
            ['', '大殿深處傳來一個嚴厲的聲音。是清虛真人的聲音，但冰冷得不像他。'],
            ['幻聲・清虛', '雲歸。功課做完了嗎？'],
            ['幻聲・清虛', '又在看那些菇？不務正業。'],
            ['幻聲・清虛', '你資質不差，可惜懶散。這輩子大概也就是個半吊子。'],
            ['yungui:sad', '…………'],
            ['xinghe:surprise', '這是……你師父？他好兇。'],
            ['yungui:sad', '不。我師父從來沒有這樣說過我。'],
            ['yungui:sad', '這是我一直以為……他心裡在這樣想的聲音。'],
            ['', '大殿前是一片三乘三的燈陣，九盞燈有亮有暗。'],
            ['hongying:think', '九盞燈全亮，門才會開……每碰一盞，它和它旁邊的燈都會變。'],
          ]);
          S.objective('讓九盞燈全部亮起');
          S.cameraFollow();
        } },
        ...lampEvents,
        { id: 'stele', trigger: 'action', x: 11, y: 12, label: '石碑', run: async (S) => {
          await S.say('', '石碑上刻著一行字：「直路不一定最近。——清虛」');
          if (S.has('ch7_yg_solved')) return;
          if (await S.choice(['讓燈陣回到最初', '不用了'], { cancel: 1 }) === 0) {
            G.state.vars.c7_lamps = [0, 1, 1, 1, 0, 1, 1, 1, 0];
            S.sfx('switch');
          }
        } },
        { id: 'back', trigger: 'touch', x: 14, y: 31, w: 5, h: 1, run: async (S) => { await S.warp('vision_hub', 20, 6, 'down', { noAutosave: true }); } },
      ],
      onEnter: async (S) => {
        C7.ygChild = !F().ch7_trial_yungui;
        const m = G.mapScene;
        if (!m._c7child) {
          m._c7child = true;
          const od = m.drawActor;
          m.drawActor = function (ctx, a, t, isPlayer) {
            if (C7.ygChild && a.id === 'yungui') {
              ctx.save(); ctx.translate(a.px, a.py); ctx.scale(0.72, 0.72); ctx.translate(-a.px, -a.py);
              od.call(this, ctx, a, t, isPlayer); ctx.restore(); return;
            }
            od.call(this, ctx, a, t, isPlayer);
          };
        }
      },
      drawOver: (ctx, t) => {
        const L = C7.lamps();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        L.forEach((on, i) => {
          const [x, y] = LAMPS[i];
          const cx = x * T + 32, cy = y * T - 10;
          if (on) {
            const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
            g2.addColorStop(0, 'rgba(255,236,170,0.85)'); g2.addColorStop(0.3, 'rgba(255,190,90,0.35)'); g2.addColorStop(1, 'rgba(255,160,60,0)');
            ctx.fillStyle = g2; ctx.fillRect(cx - 46, cy - 46, 92, 92);
          } else {
            ctx.fillStyle = 'rgba(120,140,200,0.15)';
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
          }
        });
        if (F().ch7_yg_hint && !F().ch7_yg_solved) {
          ctx.strokeStyle = `rgba(200,240,255,${0.45 + 0.25 * Math.sin(t * 4)})`; ctx.lineWidth = 5; ctx.setLineDash([12, 10]);
          ctx.beginPath(); ctx.moveTo(LAMPS[0][0] * T + 32, LAMPS[0][1] * T + 20); ctx.lineTo(LAMPS[8][0] * T + 32, LAMPS[8][1] * T + 20); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      },
    }));
  })();

  const QX_SCOLD = ['又錯了。', '心浮氣躁。', '這也不會？'];
  C7.touchLamp = async (S, i) => {
    const L = C7.lamps();
    const before = L.reduce((a, b) => a + b, 0);
    const r = Math.floor(i / 3), c = i % 3;
    for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr > 2 || cc < 0 || cc > 2) continue;
      L[rr * 3 + cc] = L[rr * 3 + cc] ? 0 : 1;
    }
    S.sfx('switch');
    const v = G.state.vars;
    v.c7_lamp_touches = (v.c7_lamp_touches || 0) + 1;
    const after = L.reduce((a, b) => a + b, 0);
    if (after === 9) { await C7.ygSolved(S); return; }
    if (after < before) { v.c7_scold = (v.c7_scold || 0) + 1; await S.say('幻聲・清虛', QX_SCOLD[(v.c7_scold - 1) % 3]); }
    if (v.c7_lamp_touches >= 15 && !S.has('ch7_yg_hint')) {
      S.flag('ch7_yg_hint');
      await S.say('hongying:normal', '雲歸，你師父不是說直路不一定最近嗎？試試斜的。');
    }
  };
  C7.ygSolved = async (S) => {
    S.flag('ch7_yg_solved');
    S.sfx('bell');
    S.flash('#ffe8a0', 0.6, 0.5);
    await S.camera(16, 9, 0.8);
    await S.say('', '九盞燈全部亮起。大殿門打開。');
    spawn(S, { id: 'yg_mirror', sprite: 'yungui', x: 16, y: 7, dir: 'down', ghost: true });
    await S.move('yg_mirror', 'DD');
    await S.lines([
      ['', '門後站著另一個雲歸——成年、端正、目光銳利、道袍一塵不染。'],
      ['心魔・雲歸', '我是你該成為的樣子。'],
      ['心魔・雲歸', '不喝酒、不偷懶、不玩物喪志。師父想要的弟子，是我。'],
      ['心魔・雲歸', '師父會失蹤，是因為你不夠好。如果是我在他身邊——'],
      ['yungui:angry', '…………閉嘴。'],
    ]);
    const r = await S.battle('t_c7_mirror_yg', { bgmAfter: 'vision' });
    if (r !== 'win') return;
    stage(S, [['player', 15, 11, 'up'], ['hongying', 17, 11, 'up'], ['yungui', 16, 11, 'up']]);
    S.setPos('yg_mirror', 16, 9, 'down');
    await S.camera(16, 10, 0.3);
    await S.lines([
      ['', '心魔・雲歸單膝跪地，身影開始崩解。'],
      ['心魔・雲歸', '為什麼……我明明……比你更好……'],
      ['yungui:think', '因為你是我想像出來的。你只有我的害怕，沒有我的記憶。'],
    ]);
    await S.fadeActor('yg_mirror', 0, 0.8);
    S.remove('yg_mirror');
    S.flash('#ffffff', 0.5, 0.7);
    spawn(S, { id: 'qx_mem', sprite: 'qingxu', x: 19, y: 15, dir: 'left', ghost: true });
    spawn(S, { id: 'yg_young', sprite: 'child_m', x: 18, y: 15, dir: 'down', ghost: true });
    await S.camera(18, 14, 0.6);
    await S.say('', '一段真正的記憶浮現：少年雲歸蹲在後山採菇，清虛真人站在他身後。');
    await S.lines([
      ['清虛（記憶）', '又在看菇？'],
      ['少年雲歸', '師父……我、我只是覺得它長得很奇怪……'],
      ['清虛（記憶）', '哈哈。好。很好。'],
      ['清虛（記憶）', '別人走過去看不見的東西，你會蹲下來看。這是修道人最難得的。'],
      ['清虛（記憶）', '雲歸，你慢一點沒關係。你看得見，就夠了。'],
    ]);
    await S.fadeActor('qx_mem', 0, 0.8); await S.fadeActor('yg_young', 0, 0.4);
    S.remove('qx_mem'); S.remove('yg_young');
    C7.ygChild = false;
    S.sfx('magic');
    await S.lines([
      ['', '記憶淡去。雲歸變回成年的樣子，站在原地，很久沒說話。'],
      ['yungui:sad', '……他說過的。我怎麼會忘了。'],
      ['yungui:smile', '我不是讓他失望。我只是……一直很怕讓他失望。'],
      ['xinghe:smile', '雲歸。你從來不是一個人在找他。'],
      ['yungui:smug', '……星河，你在這裡講話真的很討厭。'],
      ['', '巨大的芋圓把頭靠到雲歸肩上。雲歸伸手揉牠的頭，得踮起腳。'],
    ]);
    S.sfx('water');
    S.flash('#101830', 0.6, 0.8);
    await S.say('', '忽然，雲歸身後的雲層裂開，露出一片黑色的湖水。湖底，一個人影盤坐著，背上燃著一盞藍黑色的燈。');
    await S.say('yungui:surprise', '師父——！');
    await S.say('', '湖水合上。');
    await S.lines([
      ['yungui:serious', '……一座湖。他被封在湖底。背上有長明宮的燈。'],
      ['xinghe:serious', '我們會找到那座湖的。'],
      ['yungui:normal', '嗯。'],
    ]);
    S.flag('ch7_trial_yungui');
    S.learn('yungui', 'yg_mankan');
    await S.warp('vision_hub', 20, 7, 'down', { noAutosave: true });
  };

  // ================================================================================================ vision_xinghe 星河之境 (P7-3 渡魂五音)
  const NOTES = {
    gong: { name: '宮', x: 14, y: 19, color: '#ffd860', midi: 72 },
    shang: { name: '商', x: 26, y: 19, color: '#f4f4ff', midi: 74 },
    jue: { name: '角', x: 8, y: 20, color: '#6ae8d8', midi: 76 },
    zhi: { name: '徵', x: 32, y: 20, color: '#ff6a5a', midi: 79 },
    yu: { name: '羽', x: 21, y: 21, color: '#6a8aff', midi: 81 },
  };
  const MELODY = ['jue', 'zhi', 'yu', 'zhi', 'gong'];
  C7.NOTES = NOTES; C7.MELODY = MELODY;
  C7.noteFlash = {};
  const XH_STEPS = [[16, 18], [13, 15], [10, 12], [7, 9], [4, 6]];
  function xhTiles(st) {
    const n = st.flags.ch7_xh_solved ? 5 : (st.vars.c7_notes || 0);
    const rows = [];
    for (let y = 0; y < 30; y++) {
      let r = '';
      for (let x = 0; x < 40; x++) {
        let c = y < 19 ? 'K' : y < 22 ? '-' : 's';
        for (let k = 0; k < n; k++) if (y >= XH_STEPS[k][0] && y <= XH_STEPS[k][1] && (x === 20 || x === 21)) c = '*';
        if (n >= 5 && y >= 1 && y <= 3 && x >= 16 && x <= 25) c = '*';
        r += c;
      }
      rows.push(r);
    }
    return rows;
  }
  C7.xhReveal = (m, n) => {
    for (let k = 0; k < 5; k++) for (let y = XH_STEPS[k][0]; y <= XH_STEPS[k][1]; y++) for (const x of [20, 21]) m.terrain[y * m.w + x] = k < n ? 'spirit_floor' : 'black_sea';
    for (let y = 1; y <= 3; y++) for (let x = 16; x <= 25; x++) m.terrain[y * m.w + x] = n >= 5 ? 'spirit_floor' : 'black_sea';
    m.computeSolid();
  };
  C7.playNote = (key, delay = 0) => {
    const a = G.Audio;
    C7.noteFlash[key] = (G.time || 0) + delay;
    try { if (a && a.ctx && a.playNote) a.playNote('dizi', a.ctx.currentTime + delay, NOTES[key].midi, 0.7, 0.5, 0.6); } catch (e) { /* audio optional */ }
  };
  C7.playMelody = async (S) => {
    MELODY.forEach((k, i) => C7.playNote(k, i * 0.75));
    await S.say('', '♪ 角……徵……羽……徵……宮……');
  };
  (function () {
    G.Maps.define('vision_xinghe', visionMap({
      name: '星河之境', subtitle: '十八年前的八斗子・中元夜',
      start: [20, 27], psychedelic: 0.2,
      light: { ambient: 0.35, color: '#060a20', playerR: 240 },
      particles: [{ type: 'motes', density: 1.6 }, { type: 'lanterns', density: 1.2 }, { type: 'sparkles', density: 0.4 }],
      bgm: 'love',
      tiles: xhTiles,
      objects: [
        ...Object.keys(NOTES).map((k) => ({ t: 'water_lantern', x: NOTES[k].x, y: NOTES[k].y, color: NOTES[k].color, text: NOTES[k].name, key: 'wl_' + k })),
        { t: 'water_lantern', x: 4, y: 12, alpha: 0.6 }, { t: 'water_lantern', x: 11, y: 7, alpha: 0.5 }, { t: 'water_lantern', x: 30, y: 9, alpha: 0.6 },
        { t: 'water_lantern', x: 35, y: 4, alpha: 0.5 }, { t: 'water_lantern', x: 26, y: 14, alpha: 0.55 }, { t: 'water_lantern', x: 6, y: 3, alpha: 0.45 },
        { t: 'driftwood', x: 30, y: 25 }, { t: 'rock_small', x: 5, y: 26 }, { t: 'reeds', x: 36, y: 22 }, { t: 'reeds', x: 2, y: 23 },
      ],
      events: [
        { id: 'enter', trigger: 'auto', once: true, run: async (S) => {
          await S.camera(20, 22, 0.6);
          await S.lines([
            ['', '八斗子的海灘。中元夜。遠處的海上漂著無數的水燈。'],
            ['xinghe:think', '……八斗子。我被撿到的地方。'],
            ['', '海浪聲。遠處傳來一個女孩的哼唱聲。是渡魂謠的旋律。'],
            ['xinghe:surprise', '這首歌——白芷？！'],
            ['', '海面上五盞水燈靜靜漂著，各自發出不同顏色的微光。'],
            ['yungui:think', '星河。她在唱的時候，燈會回答。照她唱的順序，把燈點亮。'],
          ]);
          await C7.playMelody(S);
          S.objective('照著哼唱的順序，點亮海上的五盞水燈');
          S.cameraFollow();
        } },
        ...Object.keys(NOTES).map((k) => ({ id: 'note_' + k, trigger: 'action', x: NOTES[k].x, y: NOTES[k].y, label: '點亮', if: (st) => !st.flags.ch7_xh_solved, run: async (S) => { await C7.touchNote(S, k); } })),
        { id: 'shell', trigger: 'action', x: 12, y: 25, label: '貝殼', run: async (S) => {
          await S.say('', '一枚貝殼。貼在耳邊，聽得見那首歌。');
          if (!S.has('ch7_xh_solved')) await C7.playMelody(S);
        } },
        { id: 'back', trigger: 'touch', x: 18, y: 29, w: 5, h: 1, if: (st) => !st.flags.ch7_xh_solved, run: async (S) => { await S.warp('vision_hub', 34, 20, 'left', { noAutosave: true }); } },
      ],
      drawGround: (ctx, t) => {
        // the shell
        ctx.save();
        ctx.fillStyle = '#f4e4d0'; ctx.strokeStyle = '#a8907a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(12 * T + 32, 25 * T + 40, 13, 9, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(12 * T + 26, 25 * T + 46); ctx.lineTo(12 * T + 32 + i * 5, 25 * T + 32); ctx.stroke(); }
        ctx.restore();
      },
      drawOver: (ctx, t, m) => {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const k in NOTES) {
          const n = NOTES[k];
          const f = C7.noteFlash[k] != null ? (G.time || 0) - C7.noteFlash[k] : 99;
          const lit = f >= 0 && f < 0.9;
          const a = lit ? 0.75 * (1 - f / 0.9) + 0.2 : 0.14 + 0.06 * Math.sin(t * 2 + n.x);
          const cx = n.x * T + 32, cy = n.y * T + 24;
          const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, lit ? 90 : 46);
          g2.addColorStop(0, U.rgba(n.color, a)); g2.addColorStop(1, U.rgba(n.color, 0));
          ctx.fillStyle = g2; ctx.fillRect(cx - 90, cy - 90, 180, 180);
        }
        ctx.restore();
        // the black tide creeping in from the edges after each mistake
        const k = Math.min(3, G.state.vars.c7_wrong || 0);
        if (k > 0) {
          ctx.save();
          const x0 = m.cam.x, y0 = m.cam.y, w = G.W, h = G.H, d = 60 + k * 70;
          const grd = (x1, y1, x2, y2) => { const g3 = ctx.createLinearGradient(x1, y1, x2, y2); g3.addColorStop(0, 'rgba(2,4,10,0.92)'); g3.addColorStop(1, 'rgba(2,4,10,0)'); return g3; };
          ctx.fillStyle = grd(x0, y0, x0 + d, y0); ctx.fillRect(x0, y0, d, h);
          ctx.fillStyle = grd(x0 + w, y0, x0 + w - d, y0); ctx.fillRect(x0 + w - d, y0, d, h);
          ctx.fillStyle = grd(x0, y0 + h, x0, y0 + h - d); ctx.fillRect(x0, y0 + h - d, w, d);
          ctx.restore();
        }
        if (C7.xhGirl) {
          const gx = C7.xhGirl.x * T + 32, gy = C7.xhGirl.y * T + 30;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g4 = ctx.createRadialGradient(gx, gy - 50, 0, gx, gy - 50, 160);
          g4.addColorStop(0, `rgba(255,236,190,${0.5 * C7.xhGirl.a})`); g4.addColorStop(1, 'rgba(255,220,160,0)');
          ctx.fillStyle = g4; ctx.fillRect(gx - 160, gy - 210, 320, 320);
          ctx.restore();
        }
      },
    }));
  })();

  C7.touchNote = async (S, k) => {
    const v = G.state.vars;
    const n = v.c7_notes || 0;
    C7.playNote(k);
    if (MELODY[n] === k) {
      v.c7_notes = n + 1;
      S.sfx('magic');
      C7.xhReveal(G.mapScene, v.c7_notes);
      if (v.c7_notes >= 5) { S.flag('ch7_xh_solved'); await C7.scene710e(S); }
      return;
    }
    v.c7_notes = 0;
    v.c7_wrong = (v.c7_wrong || 0) + 1;
    C7.xhReveal(G.mapScene, 0);
    S.sfx('water');
    S.shake(3, 0.3);
    await S.say('', '所有的燈同時熄滅。光之步石沉回黑海，黑水往岸邊漲了一格。');
    if (v.c7_wrong >= 3) {
      await S.say('', '黑水裡伸出了手——');
      await S.battle('t_c7_drown_shadow', { loseOk: true, bgmAfter: 'love' });
      v.c7_wrong = 0;
      await S.say('', '黑水退回去了。遠處的哼唱，又從頭響起。');
      await C7.playMelody(S);
    }
  };

  // 7-10e 星河之境 + 7-10f 往昔的輪迴
  C7.scene710e = async (S) => {
    S.flash('#ffe8b0', 0.6, 0.6);
    await S.say('', '五盞水燈連成一條光的步道，延伸到黑海深處。星河踏上去。');
    await S.warp('vision_xinghe', 20, 19, 'up', { fade: 0.4, noAutosave: true });
    await S.move('player', 'UUUUUUUUUUUUUUU');
    S.gather();
    await S.camera(21, 2, 0.6);
    const m = G.mapScene;
    m.objects.push({ t: 'basket', x: 23, y: 1, key: 'baby_basket', v: 1 });
    await S.lines([
      ['', '步道盡頭，海面上漂著一個破舊的竹籃。籃子在下沉。'],
      ['', '籃子裡是一個嬰兒。'],
      ['', '嬰兒沒有哭。海水已經漫過了他的臉。'],
      ['xinghe:surprise', '……那是……我？'],
    ]);
    await S.move('player', 'URR');
    S.shake(2, 0.2);
    await S.lines([
      ['', '星河衝過去，伸手——手穿過了籃子。這是記憶，碰不到。'],
      ['xinghe:cry', '不……不要……誰來……誰來救他！'],
    ]);
    S.sfx('bell');
    spawn(S, { id: 'lgirl', sprite: 'baizhi', x: 24, y: 2, dir: 'left', ghost: true });
    S.actor('lgirl').alpha = 0;
    C7.xhGirl = { x: 24, y: 2, a: 0 };
    await Promise.all([S.fadeActor('lgirl', 1, 1.2), G.Tweens.to(C7.xhGirl, { a: 1 }, 1.2, 'linear')]);
    await S.lines([
      ['', '光。從海底深處升起一道光。一個少女游上來——銀白的長髮在水中散開，赤足，身上的光像一盞燈。'],
      ['', '她的臉是白芷的臉，但更透明、更遙遠，眼睛是純金的。'],
      ['', '燈靈少女將嬰兒從水中抱起。嬰兒已經不動了。'],
      ['燈靈少女', '……來晚了。'],
      ['燈靈少女', '對不起。這片海太大了，我一個人，照不到每一個地方。'],
      ['', '她低下頭，把額頭貼在嬰兒的額頭上。她的胸口浮出一點小小的火光，從她的身體裡飄出來，慢慢地，落進嬰兒的胸口。'],
    ]);
    S.flash('#ffd890', 0.5, 0.5);
    await G.Tweens.to(C7.xhGirl, { a: 0.55 }, 0.6, 'linear');
    S.sfx('heal');
    await S.lines([
      ['', '她的身體立刻黯淡了一分。嬰兒咳了一聲，哭了出來。'],
      ['燈靈少女', '……好。哭吧。會哭就好。'],
      ['燈靈少女', '這點光借你。不用還。'],
      ['', '她將嬰兒放進一盞漂過的水燈裡，輕輕一推。水燈逆著所有燈的方向，朝岸邊漂去。'],
      ['燈靈少女', '去吧。去找一個會撿燈的人。'],
    ]);
    m.objects = m.objects.filter((o) => o.key !== 'baby_basket');
    await S.lines([
      ['', '星河站在原地，淚流滿面。'],
      ['xinghe:cry', '是妳……一直都是妳……'],
      ['xinghe:cry', '妳把自己的光分給我……然後自己一個人回到那片海上……'],
      ['', '燈靈少女轉過頭。有那麼一瞬間，她好像看見了他。'],
      ['燈靈少女', '……？'],
    ]);
    await Promise.all([S.fadeActor('lgirl', 0, 1.2), G.Tweens.to(C7.xhGirl, { a: 0 }, 1.2, 'linear')]);
    S.remove('lgirl');
    C7.xhGirl = null;
    await S.say('', '她的身影化作光點散去。');
    // 7-10f 往昔的輪迴
    S.sfx('water');
    await S.say('', '海面翻轉。星河腳下的光之步道向下延伸，像樓梯一樣通往更深、更舊的記憶。');
    await S.say('雲蛇', '「不只這一次。看。」');
    await S.narrate(['很古老的星空。一艘竹筏在黑色的海上。', '筏上是一個膚色黝黑的漁家少年，筏頭坐著一個銀髮的少女，她在唱歌。'], { veil: 0.85 });
    await S.lines([
      ['漁家少年', '等妳回去了，我每年都會在岸邊點一盞燈。妳看到燈，就知道我在等妳。'],
      ['提燈少女', '……這一次，別再來找我了。'],
    ]);
    await S.narrate(['少年在岸邊點燈。少年長成青年，點燈。', '青年長成老人，點燈。', '老人坐在岸邊，燈還亮著，他閉上了眼睛。'], { veil: 0.85 });
    S.sfx('thunder');
    await S.narrate(['風暴。一艘從唐山來的大帆船在黑水溝裡斷成兩截。', '一個書生打扮的年輕人抓著木板。', '提燈少女提著燈，從浪頭上走來，牽起他的手。'], { veil: 0.85 });
    await S.lines([
      ['唐山書生', '妳是……仙女？'],
      ['提燈少女', '不是。我只是一盞燈。'],
      ['提燈少女', '上岸以後，你會忘了我。這一次，別再來找我了。'],
    ]);
    await S.narrate(['書生在沙灘上醒來。他環顧四周，困惑地揉了揉眼睛，站起來，往陸地走去。他沒有回頭。', '提燈少女站在海上，看著他的背影，直到他走遠。她沒有哭。她提著燈，轉身走回黑海。'], { veil: 0.85 });
    await S.narrate(['剛才那個嬰兒的水燈，漂向八斗子。', '三幅畫面並排浮在空中：竹筏、帆船、水燈。'], { veil: 0.85 });
    await S.lines([
      ['xinghe:think', '……每一次。'],
      ['xinghe:sad', '每一次都是她。每一次都是那個人。'],
      ['xinghe:sad', '有時候我記得她，等了一輩子也沒等到；有時候我忘了她，連等都沒有。'],
      ['xinghe:cry', '而她……每一次都是一個人。一個人提著燈，一個人回到海上。'],
      ['xinghe:cry', '每一次……都是她一個人在發光。'],
      ['hongying:cry', '（在他身後）星河……'],
      ['yungui:serious', '……原來如此。燈靈每隔幾代就會回來一次，而每一次，都有一個人……'],
      ['yungui:sad', '……愛上她。'],
    ]);
    S.flag('ch7_cycles_seen');
    S.flag('lyric_ch7');
    G.state.vars.lyric_ch7 = '燈過黑水莫回頭，有人等你在岸頭';
    S.toast('白芷的歌詞殘片：「燈過黑水莫回頭，有人等你在岸頭」', 'scroll');
    S.sfx('fire');
    S.flash('#ff9a40', 0.3, 0.6);
    await S.wait(0.4);
    S.bgm(null);
    await S.fadeOut(0.3);
    await S.wait(1.0);
    await S.warp('vision_heart', 12, 12, 'up', { fade: 0, stayDark: true, noAutosave: true });
  };

  // ================================================================================================ vision_heart 心火之核
  const ORBS = [[5, 5], [18, 4], [3, 13], [20, 12], [6, 20], [17, 20], [12, 2], [12, 21]];
  C7.orbsShown = 0;
  function heartTiles(st) {
    const stage2 = st.vars.c7_heart || 0;
    const rows = [];
    for (let y = 0; y < 24; y++) {
      let r = '';
      for (let x = 0; x < 24; x++) {
        const d = Math.hypot(x - 12, y - 12);
        r += stage2 >= 2 ? (d < 11.5 ? '*' : ' ') : stage2 >= 1 ? (d < 11.5 ? 'V' : ' ') : (d <= 2.3 ? 'V' : ' ');
      }
      rows.push(r);
    }
    return rows;
  }
  C7.heartRing = async (S, ch, id) => {
    const m = G.mapScene;
    for (let r = 0; r <= 12; r++) {
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const d = Math.hypot(x - 12, y - 12);
        if (d < 11.5 && d <= r) m.terrain[y * m.w + x] = id;
      }
      m.computeSolid();
      await S.wait(0.06);
    }
    G.state.vars.c7_heart = ch;
  };
  let heartSil = null;
  (function () {
    G.Maps.define('vision_heart', visionMap({
      name: '心火之核', subtitle: '靈境的最深處', noBig: true,
      start: [12, 12], psychedelic: 0.12,
      light: { ambient: 0.95, color: '#000000', playerR: 150 },
      particles: [{ type: 'motes', density: 0.5 }],
      bgm: null,
      tiles: heartTiles,
      objects: [],
      events: [{ id: 'heart', trigger: 'auto', if: (st) => !st.flags.ch7_xinhuo, run: async (S) => { await C7.scene710g(S); } }],
      drawOver: (ctx, t) => {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ORBS.slice(0, C7.orbsShown).forEach(([x, y], i) => {
          const cx = x * T + 32, cy = y * T + 20 + Math.sin(t * 1.4 + i) * 8;
          const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
          g2.addColorStop(0, 'rgba(255,240,200,0.95)'); g2.addColorStop(0.2, 'rgba(255,200,120,0.55)'); g2.addColorStop(1, 'rgba(255,170,80,0)');
          ctx.fillStyle = g2; ctx.fillRect(cx - 70, cy - 70, 140, 140);
        });
        if (C7.orbFly != null) {
          const k = C7.orbFly, px = G.mapScene.player.px, py = G.mapScene.player.py - 50;
          ORBS.forEach(([x, y]) => {
            const cx = U.lerp(x * T + 32, px, k), cy = U.lerp(y * T + 20, py, k);
            ctx.fillStyle = `rgba(255,230,170,${1 - k * 0.7})`;
            ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
          });
        }
        ctx.restore();
        if (C7.shadowAt) {
          // the lightless shadow: 星河's own silhouette with hollow eyes
          const { x, y, a } = C7.shadowAt;
          const W = 120, H = 140;
          if (!heartSil) heartSil = U.makeCanvas(W, H);
          const c = heartSil.getContext('2d');
          c.setTransform(G.S, 0, 0, G.S, 0, 0);
          c.globalCompositeOperation = 'source-over';
          c.clearRect(0, 0, W, H);
          G.Sprites.drawChar(c, 'xinghe', 'down', 0, W / 2, H - 10, { shadow: false });
          c.globalCompositeOperation = 'source-atop';
          c.fillStyle = 'rgba(4,4,10,0.96)'; c.fillRect(0, 0, W, H);
          c.globalCompositeOperation = 'source-over';
          const px = x * T + 32, py = y * T + T - 8;
          ctx.save();
          ctx.globalAlpha = a;
          ctx.drawImage(heartSil, 0, 0, heartSil.width, heartSil.height, px - W / 2, py - H + 10, W, H);
          ctx.fillStyle = '#000';
          for (const dx of [-6, 6]) { ctx.beginPath(); ctx.ellipse(px + dx, py - 68, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(120,140,220,0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
          ctx.restore();
        }
      },
    }));
  })();

  // 7-10g 心火
  C7.scene710g = async (S) => {
    S.hideFollowers(true);
    C7.orbsShown = 0;
    await S.camera(12, 11, 0.1);
    await S.fadeIn(1.4);
    await S.say('', '全黑。只有星河自己，身上的光只照得亮腳下一小圈。');
    C7.shadowAt = { x: 12, y: 9, a: 0 };
    await G.Tweens.to(C7.shadowAt, { a: 1 }, 1.4, 'linear');
    await S.lines([
      ['', '黑暗中，有東西在動。一個和星河一模一樣的影子從黑暗中站起來，它沒有臉，只有兩個空洞。'],
      ['無光之影', '你本來就該死在那片海裡。'],
      ['無光之影', '你活著的每一天，都是偷來的。偷她的光，偷她的時間。'],
      ['無光之影', '她現在在海的那一邊，一個人。因為你拿走了她的一部分。'],
      ['xinghe:hurt', '……'],
      ['無光之影', '還給她吧。熄掉，就還給她了。'],
    ]);
    S.light({ playerR: 90 });
    await S.say('', '星河的光又暗了一圈。他跪下。');
    await S.lines([
      ['tengpo:normal', '（遙遠的聲音）……孩子。呼吸。'],
      ['tengpo:normal', '你借來的光是她的。但是這十八年……是誰的？'],
      ['', '星河抬起頭。'],
      ['xinghe:think', '……這十八年……'],
    ]);
    const MEM = [
      '黑暗中，遠遠地亮起一個小光點。九份燈籠舖，陳伯在糊燈籠，叼著菸，罵他：「竹篾削那麼厚，燈要怎麼透光！」',
      '第二個光點：阿柑姨偷偷在他的芋圓裡多加了兩顆，眨眼。',
      '第三個：茶樓裡阿炳伯拍醒木：「國姓爺一劍劈開黑水溝——」，小星河聽得張大嘴。',
      '第四個：霧林裡，紅纓一槍把他挑翻在地：「笨蛋。」然後向他伸出手。',
      '第五個：太虛觀屋頂上，雲歸丟給他一壺米酒，芋圓搶走了下酒菜。',
      '第六個：鄒族的火邊，Voyu 的母親把最大塊的烤肉放進他碗裡。',
      '第七個：布農的火塘，祖母說：「火很小，可是大家都活下來了。」',
      '第八個：白芷第一次吃芋圓，眼睛亮起來：「我好像……第一次知道，『好吃』是什麼。」',
    ];
    for (let i = 0; i < MEM.length; i++) {
      C7.orbsShown = i + 1;
      S.sfx('lantern');
      await S.say('', MEM[i]);
    }
    S.light({ playerR: 220 });
    await S.lines([
      ['', '光點一個接一個亮起，越來越多，像夜空中的星星，又像海上的水燈。'],
      ['xinghe:cry', '……這十八年，是大家給我的。'],
      ['xinghe:serious', '陳伯給了我一個家。阿柑姨給了我芋圓。紅纓給了我一個不准死的理由。'],
      ['xinghe:serious', '雲歸給了我很多風涼話。芋圓給了我很多毛，麻糬陪我等。'],
      ['xinghe:smile', '山上的人給了我火塘、小米，還有一隻帶著火飛過大水的小鳥。'],
      ['xinghe:serious', '我借來的光，是她的。'],
      ['xinghe:serious', '但是我自己的火——是用這十八年的每一個人點起來的！'],
    ]);
    const intent = F().ch7_intent || 3;
    if (intent === 1) await S.say('xinghe:serious', '我要活下去。不是為了偷她的時間——是為了把這些光帶到她面前！');
    else if (intent === 2) await S.say('xinghe:serious', '我要去救她。但我會先站穩。用我自己的腳，用我自己的火！');
    else await S.say('xinghe:serious', '我知道怎麼還了。不是把光還給她——是讓她再也不用一個人發光！');
    C7.orbFly = 0;
    await G.Tweens.to(C7, { orbFly: 1 }, 0.8, 'inQuad');
    C7.orbFly = null; C7.orbsShown = 0;
    S.sfx('fire');
    S.flash('#fff2c0', 0.8, 1);
    S.shake(6, 0.6);
    S.light({ ambient: 0.4, color: '#100818', playerR: 260 });
    await C7.heartRing(S, 1, 'vision');
    S.light({ ambient: 0.18, color: '#180c20', playerR: 260 });
    await C7.heartRing(S, 2, 'spirit_floor');
    S.bgm('boss');
    stage(S, [['player', 12, 12, 'up'], ['hongying', 11, 13, 'up'], ['yungui', 13, 13, 'up']]);
    S.hideFollowers(false);
    C7.big.ok = false;
    S.sfx('magic');
    await S.lines([
      ['', '黑暗如潮水退去。紅纓與雲歸從光中衝出，站在他兩側；巨大的芋圓躍到他身後。'],
      ['hongying:smile', '喂，笨蛋。打架怎麼可以不叫我？'],
      ['yungui:smug', '我們在外面看了很久。台詞說得不錯，就是長了點。'],
      ['xinghe:laugh', '哈！……那就速戰速決！'],
    ]);
    // 心火 awakens before the battle: skills, full HP/MP, 劍意 +50
    C7.awaken();
    for (const s of ['xh_xinhuo_ran', 'xh_xinhuo_zhao', 'xh_xinhuo_bumie', 'xh_xinhuo_passive']) G.Party.learnSkill('xinghe', s);
    const xm = G.state.members.xinghe;
    xm.gauge = Math.min(100, (xm.gauge || 0) + 50);
    S.toast('星河覺醒了心火！', 'lantern');
    const r = await S.battle('t_c7_shadow', { bgmAfter: 'vision' });
    if (r !== 'win') return;
    C7.shadowAt = null;
    await S.lines([
      ['', '無光之影被火光穿透，化作一縷黑煙，向西飄散。'],
      ['', '星河站在光裡。胸口的火不再是一點星光，而是一團穩定、溫暖的金紅色火焰。'],
    ]);
    await S.narrate(['星河覺醒了「心火」！燈芯將盡的狀態解除了。', '習得 心火・燃燈、心火・照夜、心火・不滅。'], { veil: 0.6 });
    S.learn('xinghe', 'xh_xinhuo_ran');
    spawn(S, { id: 'mother_l', sprite: 'lantern_mother', x: 12, y: 4, dir: 'down', ghost: true });
    S.actor('mother_l').alpha = 0;
    await S.fadeActor('mother_l', 0.85, 1.4);
    S.bgm('love');
    await S.lines([
      ['', '空間的盡頭，一道比太陽還柔和的光亮起。光中隱約有一個人影，像一位穿著長袍的女人，看不清臉。'],
      ['lantern_mother:normal', '……點燈的孩子。'],
      ['xinghe:surprise', '……！'],
      ['lantern_mother:normal', '你的燈，是你自己點的。我只是看著。'],
      ['lantern_mother:normal', '到湖上來。有白鹿的湖。霧會為你們讓路。'],
      ['lantern_mother:normal', '那裡有一個人，等了很久。'],
      ['yungui:surprise', '……湖。師父！'],
    ]);
    C7.leo = { x: 8, y: 12, a: 0, dir: 'right' };
    await G.Tweens.to(C7.leo, { a: 1 }, 0.8, 'linear');
    C7.leo.walk = true;
    await S.say('', '雲豹從光中走出，在眾人面前停下，回頭看了一眼——然後向東方躍去。');
    await G.Tweens.to(C7.leo, { x: 22, a: 0 }, 1.4, 'linear');
    C7.leo.walk = false;
    await S.lines([
      ['雲蛇', '「醒來吧。天亮了。」'],
      ['tengpo:normal', '（聲音）回來吧，孩子們。天亮了。'],
    ]);
    S.flash('#ffffff', 1.0, 1);
    await S.fadeOut(1.2, '#fff');
    S.remove('mother_l');
    S.quest('q_ch7_main', 5);
    await S.warp('tengpo_hut', 8, 10, 'up', { fade: 0, stayDark: true });
    await C7.scene711(S);
  };

  // 7-11 天亮
  C7.scene711 = async (S) => {
    delete F().yuyuan_hidden; delete F().mochi_hidden;
    S.refresh();
    C7.leo = { x: 14, y: 8, a: 0, dir: 'left' };
    S.light({ ambient: 0.1, color: '#20302a' });
    S.particles([{ type: 'mist', density: 0.8 }, { type: 'fireflies', density: 0.3 }]);
    stage(S, [['player', 8, 10, 'up'], ['hongying', 6, 9, 'right'], ['yungui', 10, 9, 'left'], ['yuyuan', 9, 11, 'up']]);
    S.setPos('tengpo', 8, 7, 'down');
    await S.camera(8, 8, 0.1);
    S.bgm('forest');
    await S.fadeIn(1.4);
    await S.lines([
      ['', '清晨，火堆只剩白灰。三人躺在蓆子上，身上蓋著藤婆的毯子。'],
      ['', '藤婆坐在原處，整夜沒動過的樣子，菸桿裡的菸早就熄了。'],
      ['tengpo:smile', '早，孩子們。'],
      ['hongying:normal', '……婆婆，妳整夜都沒睡？'],
      ['tengpo:smug', '老人本來就睡得少。何況要顧著三個在夢裡吵架的小鬼。'],
      ['', '星河坐起來。他攤開手掌，掌心浮起一小團金紅色的火焰，很穩，不再閃爍。'],
      ['xinghe:smile', '婆婆……我的火，是我自己的了。'],
      ['tengpo:smile', '嗯。我看到了。'],
      ['tengpo:normal', '但是孩子，記住：夢裡看見的，要醒著去做。'],
      ['tengpo:normal', '不然，它就只是一個好看的夢。'],
      ['xinghe:serious', '……我記住了。'],
      ['yungui:think', '婆婆，妳說妳見過她。不只一次。'],
      ['tengpo:think', '…………'],
      ['tengpo:sad', '我在這座山上抽菸抽了很久了。紅毛的、國姓的、留辮子的，'],
      ['tengpo:smug', '每一批來的人都說自己會待到永遠。我送走了他們每一批。'],
      ['tengpo:sad', '那盞燈的姑娘，每隔幾代會上岸一次。我見過她三次。'],
      ['tengpo:sad', '每一次，都有一個傻孩子跟在她後面。每一次，她都一個人回去。'],
      ['tengpo:normal', '……這一次，我倒是想看看會不會不一樣。'],
      ['xinghe:serious', '會不一樣的。'],
      ['tengpo:smug', '每個傻孩子都這樣說。'],
      ['xinghe:smile', '但是這次的傻孩子，有幫手。'],
      ['', '紅纓、雲歸、芋圓和麻糬一起看向他。'],
      ['tengpo:laugh', '哈哈哈！好，好。這個回答我沒聽過。'],
      ['', '藤婆起身，從屋裡拿出一個用夢藤細枝編成的小結，放到星河手裡。'],
      ['tengpo:normal', '帶著。這不是護身符，只是一個提醒：你走進去過，也走出來了。'],
      ['tengpo:normal', '以後再怕的時候，摸摸它。'],
    ]);
    await S.give('c7_ac_tengxin', 1);
    await S.give('c7_yunwu', 3);
    await S.lines([
      ['', '芋圓蹭著藤婆的腳。在夢裡牠有水牛那麼大，現在又變回一顆胖胖的毛球。'],
      ['tengpo:smile', '小東西，你在夢裡很大，在外面也不小。只是比較愛吃。'],
      ['', '麻糬陪藤婆顧了一整夜的火。現在牠走過來，用頭頂了頂星河的手掌，又回頭望向西邊。'],
      ['tengpo:smile', '花的那隻很會等。等人的貓，比誰都知道路怎麼走回去。'],
    ]);
    await G.Tweens.to(C7.leo, { a: 0.7 }, 1.2, 'linear');
    S.face('player', 'right');
    await S.lines([
      ['', '林子邊緣，霧中，一雙發光的眼睛。雲豹——但比夢裡淡，半透明，像一陣霧做成的影子。'],
      ['hongying:surprise', '……牠跟出來了。'],
      ['tengpo:sad', '牠很久沒有到夢外面來了。這座山上，牠的族類，已經很久沒有人見過了。'],
      ['tengpo:normal', '被忘記的東西，不一定不在。只是要有人願意跟著牠走。'],
      ['yungui:serious', '燈母說：有白鹿的湖。'],
      ['tengpo:think', '往東北，下山，就是那座大湖。湖邊住的是邵族的人。'],
      ['tengpo:serious', '到了人家的湖邊，要比在山上更客氣。湖裡有他們祖先住的地方。'],
      ['xinghe:serious', '我們知道。不該去的地方，我們不會去。'],
      ['tengpo:smile', '嗯。那就去吧。'],
      ['tengpo:normal', '……替我跟陳渡那個愛哭鬼說，菸草他還欠我一包。五十年了。'],
    ]);
    S.flag('ch7_dawn_after');
    S.flag('ch7_leopard');
    S.flag('ch7_intent_done');
    await S.give('c7_key_leopard', 1);
    G.state.vars.c7_mirrors = null; G.state.vars.c7_lamps = null;
    S.refresh();
    S.objective('跟著雲豹，往東邊的林子外去（有白鹿的湖）');
    S.cameraFollow();
  };

  // ================================================================================================ 1.11 sunmoon 日月潭・湖畔
  C7.lakeFire = [8, 27];
  (function () {
    const g = new Grid(50, 38, '.', 720);
    g.rect(0, 0, 50, 18, 'l');
    g.blob(25, 6, 10, 6, 'w', 0.2);
    g.blob(25, 6, 2.6, 1.6, ',', 0.1);
    for (let x = 0; x < 50; x++) { const y = 18 + Math.round(Math.sin(x * 0.4) * 0.7 + U.hash(x, 1, 5)); g.rect(x, 18, 1, Math.max(2, y - 16), 's'); }
    g.rect(0, 36, 50, 2, 'X'); g.rect(0, 18, 1, 20, 'X'); g.rect(49, 18, 1, 20, 'X');
    g.rect(24, 36, 3, 2, ':');
    g.rect(8, 15, 2, 4, 'k'); g.rect(41, 15, 4, 4, 'k');
    g.path([[24, 37], [24, 28], [12, 26], [6, 26]], ':'); g.path([[24, 28], [40, 29], [48, 33]], ':'); g.path([[24, 28], [20, 21]], ':');
    g.path([[48, 33], [49, 33]], ':');
    g.obj('house_jiufen', 3, 22, { w: 4, h: 3, door: 1, v: 3, text: '袁' });
    g.obj('house_jiufen', 15, 23, { w: 4, h: 3, door: false, v: 3 });
    g.obj('house_jiufen', 29, 24, { w: 4, h: 3, door: false, v: 3 });
    g.obj('house_jiufen', 38, 30, { w: 4, h: 3, door: false, v: 3 });
    g.obj('granary', 10, 30); g.obj('granary', 34, 31);
    g.obj('fence_bamboo', 2, 28, { w: 3 }); g.obj('fence_bamboo', 13, 29, { w: 4 }); g.obj('fence_bamboo', 27, 32, { w: 3 });
    g.obj('firepit', 8, 27);
    g.obj('rock_big', 12, 20);
    g.obj('boat_small', 6, 14); g.obj('boat_small', 10, 13); g.obj('boat_small', 39, 16);
    g.obj('boat_ferry', 44, 13);
    g.obj('crate', 44, 22, { label: '調查' });
    g.obj('dock_post', 8, 14); g.obj('dock_post', 41, 14);
    g.obj('fishing_net', 18, 20);
    for (const [x, y] of [[14, 10], [15, 10], [14, 11], [33, 10], [34, 10], [34, 11], [16, 11]]) g.obj('lotus', x, y);
    g.obj('fence_bamboo', 13, 9, { w: 4 }); g.obj('fence_bamboo', 32, 9, { w: 4 });
    g.obj('tree_camphor', 24, 5); g.obj('tree_camphor', 26, 6); g.obj('bamboo', 25, 5);
    g.reserve(6, 25, 5, 4); g.reserve(11, 19, 6, 4); g.reserve(41, 19, 5, 4); g.reserve(44, 21, 2, 3); g.reserve(46, 32, 4, 3); g.reserve(19, 19, 4, 3);
    g.scatter(['reeds', 'reeds', 'tallgrass'], 26, { on: 's' });
    g.scatter(['bamboo', 'tree_camphor', 'tree_banana', 'bush', 'bamboo'], 46, { gap: 0, test: (x, y) => x < 3 || x > 45 || y > 32 });
    g.scatter(['flowers', 'tallgrass', 'bush', 'millet'], 20, {});
    g.reserve(1, 18, 3, 3);

    const night = (st) => !!st.flags.ch7_chuyin && !st.flags.ch7_mother_voice;
    G.Maps.define('sunmoon', M({
      name: '日月潭', subtitle: '有白鹿的湖', place: 'sunmoon',
      bgm: 'lake', start: [24, 30],
      light: (st) => (st.flags.ch7_mother_voice ? { ambient: 0.15, color: '#3a2a40' } : night(st) ? { ambient: 0.65, color: '#0a1030', playerR: 200 } : st.flags.ch7_thao_met ? { ambient: 0.45, color: '#3a1a30' } : { ambient: 0.35, color: '#3a2030' }),
      lights: lightsWith([]),
      particles: (st) => (night(st) ? [{ type: 'mist', density: 1.2 }, { type: 'fireflies', density: 0.8 }, { type: 'motes', density: 0.4 }] : [{ type: 'mist', density: 1.0 }, { type: 'fireflies', density: 0.4 }]),
      tiles: g.rows(), objects: g.objs,
      npcs: [
        { id: 'thao_elder', sprite: 'thao_elder', name: '邵族長老', x: 9, y: 26, dir: 'right', if: (st) => !!st.flags.ch7_thao_met, talk: async (S) => {
          if (S.has('ch7_mother_voice')) { await S.say('邵族長老', '霧散了。昨晚的湖很亮，連老人都說沒見過。'); return; }
          await S.lines([
            ['邵族長老', '湖裡的奇力魚，春天特別多。你們運氣好，晚上有魚吃。'],
            ['邵族長老', '浮嶼是我們做的，竹子框著草，魚會躲在下面產卵。我們只撈需要的。'],
            ['邵族長老', '你們這些年輕人跟著一隻豹子走，我們的祖先跟著一頭鹿走。人總要跟著點什麼。'],
          ]);
        } },
        { id: 'thao_w1', sprite: 'villager_f', name: '婦人', x: 15, y: 21, dir: 'left', wander: 1, talk: [['婦人', '客人要聽杵音？等太陽落到那座山後面，我們就開始。']] },
        { id: 'thao_w2', sprite: 'villager_f2', name: '婦人', x: 10, y: 22, dir: 'right', wander: 1, talk: [['婦人', '以前是在石頭上舂小米，舂著舂著，聲音就變成歌了。']] },
        { id: 'thao_kid', sprite: 'child_m', name: '邵族的孩子', x: 21, y: 20, dir: 'up', wander: 2, talk: async (S) => {
          await S.say('邵族的孩子', '我阿公說，Lalu 上面住著祖先。我們不能隨便去吵他們。');
          await S.say('邵族的孩子', '你們的貓會游泳嗎？');
          S.emote('yuyuan', '!');
          await S.say('', '芋圓往後退了三步。');
          if (S.has('ch7_white_deer')) await S.say('xinghe:smile', '牠不會往那個島游的。我們都不會。');
        } },
        { id: 'acai', sprite: 'boatman', name: '阿財', x: 43, y: 18, dir: 'down', talk: async (S) => {
          if (S.has('ch7_mother_voice')) await S.say('阿財', '聽說你們從霧裡走回來？夭壽喔……要不要買點壓驚的？');
          else {
            await S.say('阿財', '我從水沙連那邊划過來，鹽、布、鐵鍋、藥材，什麼都有一點。');
            await S.say('阿財', '這幾天晚上南岸的霧怪怪的，像有一條路。老人都叫我們別去。');
          }
          if (await S.choice(['看看貨', '不用了'], { cancel: 1 }) === 0) await S.shop(['jinchuang', 'xumingsan', 'c7_huiqi', 'huanhundan', 'c7_qiliyu', 'c7_ac_huyuepei', 'c7_sw_chixia', 'sp_zhenchao', 'c7_fn_qinglan'], { title: '湖畔雜貨船' });
        } },
      ],
      events: [
        { id: 'arrive', trigger: 'auto', if: (st) => !!st.flags.ch7_dawn_after && !st.flags.ch7_thao_met, run: async (S) => { await C7.scene712(S); } },
        { id: 'rest', trigger: 'action', x: 4, y: 24, label: '休息', if: (st) => !!st.flags.ch7_chuyin && !st.flags.ch7_mist_path, run: async (S) => { await C7.scene712d(S); } },
        { id: 'rest2', trigger: 'action', x: 4, y: 24, label: '休息', if: (st) => !!st.flags.ch7_mother_voice, run: async (S) => {
          if (await S.choice(['在長老家休息', '不用了'], { cancel: 1 }) !== 0) return;
          await rest(S);
          S.toast('好好休息了一下，全員完全恢復。', 'lantern');
        } },
        { id: 'box', trigger: 'action', x: 44, y: 22, label: '調查', run: async (S) => {
          if (S.has('ch7_lake_box')) { await S.say('', '一個被沖上岸的破木箱，已經空了。'); return; }
          S.flag('ch7_lake_box');
          await S.say('', '蘆葦間卡著一個被沖上岸的破木箱。裡面有一小包用油紙包好的香。');
          await S.give('huanhunxiang', 1);
        } },
        { id: 'boats', trigger: 'action', x: 6, y: 14, w: 6, h: 2, label: '獨木舟', run: async (S) => { await C7.boatRefuse(S); } },
        { id: 'boats2', trigger: 'action', x: 39, y: 16, w: 2, h: 1, label: '獨木舟', run: async (S) => { await C7.boatRefuse(S); } },
        { id: 'stone', trigger: 'action', x: 12, y: 20, w: 2, h: 2, label: '調查', run: async (S) => {
          await S.say('', '岸邊一塊平坦的大石，石面被舂得光滑發亮。');
        } },
        { id: 'mist', trigger: 'touch', x: 1, y: 18, w: 2, h: 3, run: async (S) => {
          if (S.has('ch7_mist_path') && !S.has('ch7_mother_voice')) { await S.warp('sunmoon_mist', 15, 42, 'up'); return; }
          if (S.has('ch7_mother_voice')) await S.say('', '湖霧已經散了。水面上什麼路也沒有。');
          else await S.say('', '湖的西南邊，霧濃得像牛奶。……現在還看不見路。');
          await S.move('player', 'R');
        } },
        { id: 'south', trigger: 'touch', x: 24, y: 37, w: 3, h: 1, run: async (S) => {
          await S.say('yungui:normal', '還不是下山的時候。……燈母說的那個人，還在等。');
          await S.move('player', 'U');
        } },
      ],
      warps: [
        { x: 49, y: 33, to: 'tengpo_hut', tx: 13, ty: 8, tdir: 'left', if: (st) => !st.flags.ch7_mist_path },
      ],
      drawGround: (ctx, t) => {
        // distant mountains over the lake and a soft halo on Lalu
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createRadialGradient(25.5 * T, 6.5 * T, 10, 25.5 * T, 6.5 * T, 5 * T);
        g2.addColorStop(0, 'rgba(255,240,210,0.10)'); g2.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = g2; ctx.fillRect(19 * T, 1 * T, 13 * T, 11 * T);
        if (C7.mistPath) {
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < 14; i++) {
            const k = i / 13 * C7.mistPath;
            const x = (2.5 - k * 1.5) * T, y = (18 - k * 10) * T;
            ctx.fillStyle = `rgba(236,240,248,${0.5 * C7.mistPath})`;
            ctx.beginPath(); ctx.ellipse(x + Math.sin(i) * 20, y, 50, 18, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      },
      drawOver: (ctx, t) => { if (C7.leoLake) drawLeopard(ctx, t); },
    }));
  })();

  C7.boatRefuse = async (S) => {
    await S.say('', '一艘獨木舟靜靜地靠在岸邊。槳就放在船底。');
    await S.say('xinghe:serious', '……不。湖心那座島是人家祖先住的地方。我們不划過去。');
  };
  // gentle wooden knocks for the 杵音 (pestles on stone) — rhythm only, no melody, no voices
  C7.pestle = (sec) => {
    const a = G.Audio;
    try {
      if (!a || !a.ctx || !a.playNote) return;
      const t0 = a.ctx.currentTime + 0.1;
      const pitches = [55, 60, 62, 57, 64, 59];
      let t = 0, i = 0;
      while (t < sec) {
        a.playNote('wood', t0 + t, pitches[i % pitches.length], 0.25, 0.55, 0.5);
        t += i % 3 === 2 ? 0.55 : 0.32; i++;
      }
    } catch (e) { /* audio optional */ }
  };

  // 7-12 有白鹿的湖
  C7.scene712 = async (S) => {
    S.flag('ch7_thao_met');
    S.quest('q_ch7_main', 6);
    C7.leoLake = true;
    C7.leo = { x: 46, y: 31, a: 0.8, dir: 'left' };
    stage(S, [['player', 45, 33, 'left'], ['hongying', 46, 33, 'left'], ['yungui', 46, 32, 'left'], ['yuyuan', 47, 33, 'left']]);
    await S.camera(36, 22, 1.0);
    S.bgm('lake');
    await S.lines([
      ['', '山徑盡頭，視野豁然開朗：一座大湖靜靜躺在群山之間，水面如鏡，湖中央一座小島。'],
      ['hongying:surprise', '……好美。'],
      ['yungui:normal', '日月潭。湖的一邊圓如日，一邊彎如月——平地的文人是這樣寫的。'],
    ]);
    await S.say('', '雲豹在湖岸的林邊停下，伏低身體，像在等待。然後消失在霧中。');
    await G.Tweens.to(C7.leo, { a: 0 }, 1.2, 'linear');
    C7.leoLake = false;
    await S.say('xinghe:think', '牠要我們在這裡等？');
    spawn(S, { id: 'elder_cs', sprite: 'thao_elder', x: 40, y: 29, dir: 'right', name: '邵族長老' });
    await S.camera(43, 31, 0.6);
    await S.lines([
      ['', '湖岸邊，一位邵族的老人正在收拾漁網，抬頭看見他們。'],
      ['邵族長老', '外地人？從山上下來的？'],
      ['邵族長老', '你們後面……剛才是不是有一隻很大的貓？'],
      ['', '芋圓挺起胸膛。'],
      ['邵族長老', '不是你，胖的。是一隻有花紋的、很大的。'],
      ['xinghe:serious', '牠帶我們來的。我們在找一座……在霧裡的祠堂。'],
      ['邵族長老', '…………'],
      ['邵族長老', '先坐下吧。天要黑了，奇力魚剛撈上來，烤給你們吃。'],
    ]);
    // 7-12b 白鹿
    await S.fadeOut(0.8);
    S.remove('elder_cs');
    S.refresh();
    S.light({ ambient: 0.45, color: '#3a1a30' });
    stage(S, [['player', 8, 28, 'up'], ['hongying', 7, 28, 'right'], ['yungui', 9, 28, 'left'], ['yuyuan', 7, 27, 'right']]);
    S.setPos('thao_elder', 9, 26, 'down');
    await S.camera(8, 26, 0.1);
    await S.fadeIn(0.8);
    await S.lines([
      ['邵族長老', '你們跟著一隻豹子走。我們的祖先，是跟著一頭鹿走的。'],
      ['xinghe:think', '鹿？'],
      ['邵族長老', '很久以前，我們的祖先住在山的另一邊。有一天，獵人們看見一頭白色的鹿。'],
      ['邵族長老', '那頭鹿很美，獵人們追著牠，翻過一座山，又一座山，追了很多天。'],
      ['邵族長老', '最後，白鹿跳進了一座大湖裡，不見了。'],
      ['邵族長老', '獵人們站在湖邊，看見湖裡全是魚，湖邊的土地又好。'],
      ['邵族長老', '他們回去，帶著家人搬過來。從那以後，我們就住在這座湖邊。'],
      ['hongying:smile', '所以白鹿是……帶你們回家的嚮導。'],
      ['邵族長老', '我們家是這樣說的。各家說法有一點不一樣，但都有那頭鹿。'],
      ['yungui:think', '追逐一個東西，最後追到的卻不是它，而是一個家。'],
      ['邵族長老', '你這個道士很會講話。可惜不太會吃魚，刺都沒挑乾淨。'],
      ['yungui:hurt', '……咳咳咳。'],
      ['', '眾人笑。長老望向湖心的小島。'],
      ['邵族長老', '那座島，叫 Lalu。那是我們祖靈在的地方。'],
      ['邵族長老', '我們自己，也不隨便上去。'],
      ['', '芋圓盯著湖心的島。島邊有好多魚在跳，牠的尾巴開始左右甩動。'],
      ['', '紅纓一把把芋圓抱起來。'],
      ['hongying:serious', '不行。那是人家祖先住的地方。'],
      ['', '芋圓在她懷裡發出一聲很小的「喵」。'],
      ['xinghe:serious', '長老，您放心。我們不會去 Lalu。'],
      ['邵族長老', '…………謝謝。'],
      ['邵族長老', '很多外地人來，看到島就想划過去。你們是第一批自己說不去的。'],
      ['邵族長老', '我們家裡也有祖先的位置。每一家都有，祖先就在家裡跟我們一起過日子。'],
      ['邵族長老', '祖先在家裡、在島上、在湖裡。所以我們對這座湖說話，要很小聲。'],
    ]);
    S.flag('ch7_white_deer');
    S.flag('ch7_lalu_respect');
    // 7-12c 杵音
    await S.fadeOut(0.8);
    S.light({ ambient: 0.62, color: '#0a1030', playerR: 200 });
    S.particles([{ type: 'mist', density: 1.2 }, { type: 'fireflies', density: 0.8 }, { type: 'motes', density: 0.4 }]);
    stage(S, [['player', 12, 24, 'up'], ['hongying', 11, 24, 'up'], ['yungui', 14, 24, 'up'], ['yuyuan', 13, 24, 'up']]);
    S.setPos('thao_elder', 15, 23, 'left');
    S.show('thao_w1', false); S.show('thao_w2', false);
    const W = [['pw1', 11, 21, 'right'], ['pw2', 14, 21, 'left'], ['pw3', 12, 22, 'up'], ['pw4', 13, 19, 'down']];
    W.forEach(([id, x, y, d], i) => spawn(S, { id, sprite: i % 2 ? 'villager_f2' : 'villager_f', x, y, dir: d, name: '婦人' }));
    await S.camera(12, 21, 0.1);
    await S.fadeIn(0.8);
    await S.lines([
      ['', '月亮升起。幾位邵族婦人圍著岸邊的大石，手持長長的木杵。'],
      ['邵族長老', '你們運氣好。今晚她們要舂杵。'],
      ['邵族長老', '以前是在石頭上舂小米。舂著舂著，每根杵的聲音不一樣，'],
      ['邵族長老', '高的、低的，碰在一起，就變成歌了。'],
    ]);
    S.bgm(null, { fade: 1.5 });
    await S.wait(1.0);
    C7.pestle(9);
    for (let k = 0; k < 4; k++) { for (const [id] of W) S.jump(id, 10); await S.wait(0.6); }
    await S.say('', '木杵的聲音在湖面上傳開，月光在水面上碎成一片。湖霧緩緩從水面升起。');
    for (let k = 0; k < 3; k++) { for (const [id] of W) S.jump(id, 10); await S.wait(0.6); }
    await S.say('', '那聲音很樸素，就像是誰家在準備明天的飯。可是在湖上聽起來，就像湖自己的心跳。');
    await S.say('', '眾人安靜地聽。芋圓把下巴擱在前爪上，耳朵跟著節奏一動一動。麻糬望著湖面，一動也不動。');
    await S.lines([
      ['xinghe:think', '（小聲）……跟布農的那一晚不一樣，可是又有點像。'],
      ['yungui:normal', '（小聲）嗯。都是過日子的聲音。過了很久很久的日子。'],
      ['', '杵音停止。婦人們笑著收起木杵，互相說了些什麼。'],
      ['邵族長老', '好了，聽完了就去睡。明天一早有魚粥。'],
    ]);
    for (const [id] of W) S.remove(id);
    S.show('thao_w1', true); S.show('thao_w2', true);
    S.setPos('thao_elder', 9, 26, 'right');
    S.flag('ch7_chuyin');
    S.bgm('lake');
    S.refresh();
    S.objective('到長老家（西邊的屋子）休息');
    S.cameraFollow();
  };
  // 7-12d 霧中之路
  C7.scene712d = async (S) => {
    if (await S.choice(['在長老家休息', '再等一下'], { cancel: 1 }) !== 0) return;
    await rest(S, { noBgm: true });
    S.light({ ambient: 0.7, color: '#060a20', playerR: 180 });
    stage(S, [['player', 4, 26, 'down']]);
    S.hideFollowers(true);
    await S.camera(4, 24, 0.1);
    await S.fadeIn(1.0);
    S.bgm('lake');
    await S.lines([
      ['', '深夜。星河醒來，掌心的雲豹之紋在發光。'],
      ['', '他走出屋外。湖面上的霧濃得像牛奶。湖的西南邊，遠離 Lalu 的方向，霧裡站著那隻雲豹。'],
    ]);
    await S.move('player', 'DRRU');
    C7.leoLake = true;
    C7.leo = { x: 2, y: 19, a: 0, dir: 'up' };
    await G.Tweens.to(C7.leo, { a: 0.85 }, 1.0, 'linear');
    await S.camera(3, 19, 0.8);
    await S.say('', '雲豹往前走——踩在霧上。牠走過的地方，霧凝成了一條白色的小路，浮在水面上。');
    C7.leo.walk = true;
    C7.mistPath = 0;
    await Promise.all([G.Tweens.to(C7, { mistPath: 1 }, 2.0, 'linear'), G.Tweens.to(C7.leo, { x: 1.2, y: 12 }, 2.0, 'linear')]);
    C7.leo.walk = false;
    S.hideFollowers(false);
    S.gather();
    stage(S, [['hongying', 5, 24, 'up'], ['yungui', 6, 24, 'up'], ['yuyuan', 5, 23, 'up'], ['mochi', 6, 23, 'up']]);
    await S.say('', '紅纓、雲歸、芋圓和麻糬也跟出來了。');
    await S.say('hongying:surprise', '……路。霧變成路了。');
    spawn(S, { id: 'elder_n', sprite: 'thao_elder', x: 5, y: 25, dir: 'up', name: '邵族長老' });
    await S.lines([
      ['', '身後，邵族長老披著外衣走出來，看著霧中的路。'],
      ['邵族長老', '…………'],
      ['邵族長老', '那邊的霧，不是我們的東西。'],
      ['邵族長老', '很老很老的時候就在了。祖先只說過：霧變成路的時候，不要跟著走。'],
      ['yungui:serious', '那我們——'],
      ['邵族長老', '祖先說的是「我們」不要跟著走。沒有說別人。'],
      ['邵族長老', '你們有你們的白鹿。去吧。'],
      ['邵族長老', '不要往 Lalu 那邊偏。走直，走那隻豹子走的路。'],
      ['xinghe:serious', '是。謝謝您。'],
      ['邵族長老', '天亮之前回來。魚粥不等人。'],
    ]);
    S.remove('elder_n');
    S.flag('ch7_mist_path');
    C7.leoLake = false; C7.mistPath = 0;
    S.objective('跟著雲豹，走進湖霧之徑');
    await S.warp('sunmoon_mist', 15, 42, 'up');
  };

  // ================================================================================================ 1.12 sunmoon_mist 湖霧之徑
  const LEO_WP = [[15, 37], [9, 31], [13, 25], [15, 16], [22, 12], [15, 6]];
  C7.leoWp = 0;
  (function () {
    const g = new Grid(30, 44, 'l', 721);
    const P = [[15, 43], [15, 38], [9, 34], [8, 30], [12, 26], [15, 22], [15, 18], [21, 15], [23, 12], [18, 8], [15, 5], [15, 0]];
    g.path(P, 'o', 2);
    g.blob(15, 20, 4.2, 2.6, 'o', 0.1);
    g.path([[8, 30], [6, 30]], 'o', 2);
    g.path([[23, 12], [25, 12]], 'o', 2);
    g.rect(12, 0, 6, 4, 'o');
    g.obj('paifang', 13, 2, { v: 0, text: '燈母' });
    g.obj('stone_lantern', 12, 3); g.obj('stone_lantern', 17, 3);
    g.scatter(['lotus', 'reeds'], 14, { on: 'l', test: (x, y) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.get(x + dx, y + dy) === 'o') return true; return false; } });
    G.Maps.define('sunmoon_mist', M({
      name: '湖霧之徑', subtitle: '雲豹在霧上踏出的路', place: 'sunmoon',
      bgm: 'lake', start: [15, 42],
      light: { ambient: 0.7, color: '#060a1c', playerR: 170 },
      lights: lightsWith(() => [{ x: C7.leo.x, y: C7.leo.y - 0.5, r: 230, color: '#cfd8ff', flicker: 0.15 }]),
      particles: [{ type: 'mist', density: 2.4 }, { type: 'motes', density: 0.8 }],
      tiles: g.rows(), objects: g.objs,
      chests: [{ id: 'c7_sm_i', x: 6, y: 30, item: 'c7_ac_huyue' }, { id: 'c7_sm_j', x: 25, y: 12, item: 'huanhundan' }],
      enemies: [
        { id: 'sm1', troop: 't_c7_lake', x: 9, y: 33, art: 'lamp_moth', lv: 26, radius: 1 },
        { id: 'sm2', troop: 't_c7_lake2', x: 15, y: 18, art: 'tide_grudge', lv: 26, radius: 1 },
        { id: 'sm3', troop: 't_c7_lake', x: 19, y: 9, art: 'lamp_moth', lv: 26, radius: 1 },
      ],
      events: [
        { id: 'jiao', trigger: 'touch', x: 11, y: 20, w: 9, h: 3, if: (st) => !st.flags.ch7_jiao, run: async (S) => { await C7.scene713a(S); } },
        { id: 'shrine', trigger: 'touch', x: 12, y: 4, w: 6, h: 2, if: (st) => !st.flags.ch7_shrine_revealed, run: async (S) => { await C7.scene713b(S); } },
        { id: 'back', trigger: 'touch', x: 14, y: 43, w: 3, h: 1, run: async (S) => {
          await S.say('yungui:serious', '雲豹在前面等我們。……不能回頭。');
          await S.move('player', 'U');
        } },
      ],
      warps: [{ x: 14, y: 0, w: 3, h: 1, to: 'lamp_shrine', tx: 19, ty: 27, tdir: 'up', if: (st) => !!st.flags.ch7_shrine_revealed }],
      onEnter: async (S) => {
        C7.leoWp = F().ch7_shrine_revealed ? LEO_WP.length - 1 : 0;
        const [x, y] = LEO_WP[C7.leoWp];
        C7.leo = { x, y, a: F().ch7_shrine_revealed ? 0 : 0.9, dir: 'up' };
      },
      drawGround: (ctx, t, m) => {
        // the leopard walks ahead and waits, looking back
        if (F().ch7_shrine_revealed || G.Script.busy() || C7.leo.moving) return;
        const p = m.player;
        if (C7.leoWp < LEO_WP.length - 1 && Math.hypot(p.x - C7.leo.x, p.y - C7.leo.y) < 3.2) {
          C7.leoWp++;
          const [nx, ny] = LEO_WP[C7.leoWp];
          C7.leo.moving = true; C7.leo.walk = true;
          C7.leo.dir = Math.abs(nx - C7.leo.x) > Math.abs(ny - C7.leo.y) ? (nx > C7.leo.x ? 'right' : 'left') : (ny > C7.leo.y ? 'down' : 'up');
          G.Tweens.to(C7.leo, { x: nx, y: ny }, Math.hypot(nx - C7.leo.x, ny - C7.leo.y) * 0.28, 'inOutQuad').then(() => { C7.leo.moving = false; C7.leo.walk = false; C7.leo.dir = 'down'; });
        }
      },
      drawOver: (ctx, t) => { drawLeopard(ctx, t); },
    }));
  })();

  // 7-13a 蛟
  C7.scene713a = async (S) => {
    S.bgm('tension');
    S.shake(6, 0.8);
    S.sfx('splash');
    await S.say('', '霧中的湖水翻湧。一條長著角的巨大水蛇——蛟——破水而出，鱗片上纏著黑色的水草，眼中淌著黑水。');
    await S.lines([
      ['yungui:serious', '蛟。湖底的老東西……也被潮病染了。'],
      ['xinghe:serious', '雲豹在等我們。打過去！'],
      ['xinghe:smile', '……第一次用自己的火打架。有點興奮。'],
    ]);
    const r = await S.battle('t_c7_jiao', { bgmAfter: 'lake' });
    if (r !== 'win') return;
    S.flag('ch7_jiao');
    S.sfx('water');
    await S.lines([
      ['', '蛟沉入水中。黑水從水底浮起、散去。湖面恢復平靜。'],
      ['hongying:smile', '心火，很好用嘛。'],
      ['xinghe:smug', '是吧？我就說我天生是主角。'],
      ['hongying:angry', '收回。'],
    ]);
  };
  // 7-13b 燈母祠
  C7.scene713b = async (S) => {
    S.flag('ch7_shrine_revealed');
    await S.camera(15, 2, 1.0);
    S.sfx('gong');
    await S.say('', '霧中浮現一座半沉在水中的牌坊。牌坊後，一座古老的祠堂從霧中升起，屋簷上掛著無數熄滅的燈籠。');
    await S.say('', '雲豹站在牌坊下，回頭看了一眼，然後化作霧散去。');
    await G.Tweens.to(C7.leo, { a: 0 }, 1.2, 'linear');
    await S.lines([
      ['yungui:think', '燈母祠……典籍裡說，這是古代的引魂人建的。只在燈需要的時候才會出現。'],
      ['xinghe:serious', '師父在裡面嗎？'],
      ['yungui:serious', '……在。我感覺得到。'],
    ]);
    S.quest('q_ch7_main', 6);
    S.objective('進入燈母祠，找到清虛真人');
    S.cameraFollow();
  };

  // ================================================================================================ 1.13 lamp_shrine 燈母祠（上殿／下殿）
  const MURALS = {
    1: { title: '壁畫一「燈母點燈」', text: '遠古的黑海上，一位女子將自己的心放進一盞燈裡。燈亮了，海上第一次有了方向。', who: 'xinghe:think', line: '燈母……把自己的心點成了燈。', v: 0 },
    2: { title: '壁畫二「燈靈上岸」', text: '燈光衰弱的年代，一個少女從燈中走出，赤足踏上沙灘。岸上有人提著燈籠迎她。', who: 'hongying:think', line: '提燈籠的人……是引魂人？', v: 1 },
    3: { title: '壁畫三「竹筏與老人」', text: '一個老人坐在岸邊，身旁點著一盞燈。海上很遠很遠的地方，有一點光在回應他。', who: 'xinghe:sad', line: '……他等到了。只是太遠了，他看不見。', v: 2 },
    4: { title: '壁畫四「斷船與書生」', text: '一個書生走在陸地上，背後的海上，少女提著燈目送他。書生的腳印很深，像背負著什麼他不記得的東西。', who: 'yungui:think', line: '忘了，但腳印還是重的。……記憶這種東西，大概不只住在腦子裡。', v: 1 },
    5: { title: '壁畫五「千手」', text: '無數的人，各自舉著一盞小小的燈，站在海岸上。他們的燈光匯成一條路，一直延伸到海的盡頭。', who: 'xinghe:surprise', line: '這是……一千個人？一千盞燈？', who2: 'yungui:think', line2: '這幅畫……跟其他的不一樣。其他的都畫著「發生過的事」。這一幅……沒有發生過。', v: 3 },
    6: { title: '壁畫六「空白」', text: '牆上只有一個畫框。框裡是空的，只有一層淡淡的水痕。', who: 'hongying:think', line: '沒畫完？', who2: 'xinghe:serious', line2: '……不。是還沒有發生。', v: 2, blank: true },
  };
  C7.MURALS = MURALS;
  const muralCount = () => { const b = F().ch7_murals || 0; let n = 0; for (let i = 1; i <= 6; i++) if (b & (1 << i)) n++; return n; };
  C7.muralCount = muralCount;
  C7.readMural = async (S, i) => {
    const mu = MURALS[i];
    await S.say('', mu.title);
    await S.say('', mu.text);
    await S.say(mu.who, mu.line);
    if (mu.who2) await S.say(mu.who2, mu.line2);
    const before = F().ch7_murals || 0;
    if (!(before & (1 << i))) {
      S.flag('ch7_murals', before | (1 << i));
      if (G.Quests.stage('q_ch7_murals') < 0) S.quest('q_ch7_murals', 0);
      if (muralCount() >= 6 && !S.has('ch7_heartlamp_murals')) {
        S.sfx('lantern');
        await S.lines([
          ['', '六幅壁畫同時亮起微光，光從畫中飄出，在空中匯成一盞小小的燈。'],
          ['xinghe:serious', '一盞燈，等了那麼多代，都是一個人發光。'],
          ['xinghe:serious', '可是第五幅畫……是可以發生的。對吧？'],
          ['yungui:smile', '至少，沒有人說不可以。'],
        ]);
        S.flag('ch7_heartlamp_murals');
        S.quest('q_ch7_murals', 'done');
        await S.lantern('lantern_lamp_murals', '燈母祠的壁畫');
      }
    }
  };
  function blankMuralOverlay(ctx, x, y) {
    ctx.save();
    const px = x * T + 6, py = y * T - 26, w = 2 * T - 12, h = 56;
    ctx.fillStyle = '#d8cfbc'; ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = '#6a5a40'; ctx.lineWidth = 4; ctx.strokeRect(px, py, w, h);
    ctx.fillStyle = 'rgba(120,140,170,0.18)';
    ctx.beginPath(); ctx.ellipse(px + w * 0.55, py + h * 0.6, w * 0.3, h * 0.25, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // P7-5 五行燈
  const WX = { water: { x: 20, y: 3, name: '水' }, fire: { x: 29, y: 6, name: '火' }, wood: { x: 29, y: 13, name: '木' }, metal: { x: 10, y: 13, name: '金' }, earth: { x: 10, y: 6, name: '土' } };
  const WX_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];
  const WX_COL = { water: '#6aa8ff', fire: '#ff7a4a', wood: '#7ae07a', metal: '#f0e0a0', earth: '#c89a5a' };
  C7.WX = WX; C7.WX_ORDER = WX_ORDER;
  C7.wxLit = () => G.state.vars.c7_wx || [];
  C7.touchWx = async (S, el) => {
    const v = G.state.vars;
    const lit = (v.c7_wx = v.c7_wx || []);
    if (lit.includes(el)) { await S.say('', '這盞燈已經點著了。'); return; }
    S.sfx('fire');
    S.flash(WX_COL[el], 0.3, 0.3);
    S.toast({ wood: '雲歸擲出了木符。', fire: '雲歸擲出了火符。', earth: '雲歸擲出了土符。', metal: '雲歸擲出了金符。', water: '雲歸擲出了水符。' }[el], 'talisman');
    const last = v.c7_wx_last;
    v.c7_wx_last = el;
    if (WX_ORDER[lit.length] === el) {
      lit.push(el);
      if (lit.length >= 5) { await C7.wxSolved(S); return; }
      return;
    }
    v.c7_wx = [];
    v.c7_wx_fail = (v.c7_wx_fail || 0) + 1;
    S.sfx('buzz');
    await S.say('', '五盞燈同時熄滅了。');
    if (last && BEATS[last] === el && !S.has('ch7_wx_ke')) {
      S.flag('ch7_wx_ke');
      await S.say('yungui:think', '……不對。師父說過，燈要用「生」的方式點，不是用「克」的。');
    }
    if (v.c7_wx_fail % 2 === 0) {
      await S.say('', '熄滅的燈芯裡，飛出了一群燈蛾！');
      await S.battle('t_c7_moths', { bgmAfter: 'shrine' });
    }
  };
  C7.wxSolved = async (S) => {
    S.flag('ch7_lamp_puzzle');
    S.sfx('bell');
    S.flash('#fff6d0', 0.8, 0.6);
    await S.say('', '五盞燈依序亮起，五色光芒在水池上方交會。池水退去，露出往下的石階。');
    await S.lines([
      ['yungui:smile', '木生火，火生土，土生金，金生水……水再生木。'],
      ['yungui:smile', '師父教我的第一課。原來他早就在等我來考。'],
    ]);
    const p = G.mapScene.player;
    await S.warp('lamp_shrine', p.x, p.y, p.dir, { fade: 0.4, reload: true });
  };
  (function () {
    const rows = [];
    for (let y = 0; y < 30; y++) {
      let r = '';
      for (let x = 0; x < 40; x++) {
        let c = 'T';
        if (y < 2 || x < 2 || x > 37 || y > 27) c = 'E';
        if ((y === 16 || y === 17) && !(x >= 18 && x <= 21)) c = 'E';
        if (y > 27 && (x === 19 || x === 20)) c = 'T';
        r += c;
      }
      rows.push(r);
    }
    const tiles = (st) => rows.map((r, y) => (y >= 7 && y <= 11 && !st.flags.ch7_lamp_puzzle ? r.slice(0, 17) + '~~~~~~' + r.slice(23) : r));
    const objs = [
      { t: 'mural', x: 4, y: 17, v: MURALS[1].v }, { t: 'mural', x: 11, y: 17, v: MURALS[2].v }, { t: 'mural', x: 26, y: 17, v: MURALS[3].v },
      { t: 'signboard', x: 4, y: 3, text: '戰' }, { t: 'signboard', x: 35, y: 3, text: '春' },
      { t: 'stairs_down', x: 20, y: 9, if: (st) => !!st.flags.ch7_lamp_puzzle },
      { t: 'eternal_lamp', x: 15, y: 20 }, { t: 'eternal_lamp', x: 24, y: 20 },
      { t: 'pillar', x: 3, y: 18 }, { t: 'pillar', x: 36, y: 18 }, { t: 'pillar', x: 3, y: 2 }, { t: 'pillar', x: 36, y: 2 },
      { t: 'brazier', x: 17, y: 26 }, { t: 'brazier', x: 22, y: 26 },
      { t: 'lantern_string', x: 6, y: 19, w: 6, v: 0, lit: false }, { t: 'lantern_string', x: 28, y: 19, w: 6, v: 0, lit: false },
      { t: 'lantern_string', x: 8, y: 4, w: 8, v: 0, lit: false }, { t: 'lantern_string', x: 24, y: 4, w: 8, v: 0, lit: false },
      { t: 'jar_row', x: 31, y: 26 }, { t: 'soul_jar', x: 6, y: 26 },
    ];
    for (const el in WX) objs.push({ t: 'stone_lantern', x: WX[el].x, y: WX[el].y, lit: false, key: 'wx_' + el });
    G.Maps.define('lamp_shrine', M({
      name: '燈母祠・上殿', subtitle: '沉在湖霧之下的祠堂', place: 'sunmoon',
      bgm: 'shrine', start: [19, 26],
      light: { ambient: 0.6, color: '#0a1428', playerR: 200 },
      lights: lightsWith(() => C7.wxLit().map((el) => ({ x: WX[el].x, y: WX[el].y - 0.4, r: 140, color: WX_COL[el], flicker: 0.2 })).concat(F().ch7_lamp_puzzle ? WX_ORDER.map((el) => ({ x: WX[el].x, y: WX[el].y - 0.4, r: 150, color: WX_COL[el], flicker: 0.2 })) : [])),
      particles: [{ type: 'motes', density: 1.2 }, { type: 'dust', density: 0.4 }],
      tiles, objects: objs,
      chests: [
        { id: 'c7_ls_k', x: 35, y: 23, item: 'c7_ar_dengmu' },
        { id: 'c7_ls_l', x: 3, y: 4, item: 'c7_taiyi', n: 3 },
      ],
      enemies: [
        { id: 'ls1', troop: 't_c7_shrine3', x: 16, y: 13, art: 'jiao', variant: 1, lv: 26, radius: 2, if: (st) => !st.flags.ch7_lamp_puzzle },
        { id: 'ls2', troop: 't_c7_shrine', x: 30, y: 23, art: 'stone_guardian', lv: 26, radius: 2 },
        { id: 'ls3', troop: 't_c7_lake', x: 8, y: 9, art: 'lamp_moth', lv: 26, radius: 2 },
      ],
      events: [
        { id: 'enter', trigger: 'auto', once: true, run: async (S) => {
          await S.lines([
            ['', '祠內的空氣像是水，聲音傳得很慢。上千盞燈籠掛在樑上，全都是暗的。'],
            ['hongying:think', '這麼多燈……全熄了。'],
            ['xinghe:think', '我好像……來過這裡。'],
            ['yungui:surprise', '你？'],
            ['xinghe:think', '不是我。是我胸口的火。它認得這裡。'],
          ]);
        } },
        { id: 'm1', trigger: 'action', x: 4, y: 17, w: 2, h: 1, label: '壁畫', run: (S) => C7.readMural(S, 1) },
        { id: 'm2', trigger: 'action', x: 11, y: 17, w: 2, h: 1, label: '壁畫', run: (S) => C7.readMural(S, 2) },
        { id: 'm3', trigger: 'action', x: 26, y: 17, w: 2, h: 1, label: '壁畫', run: (S) => C7.readMural(S, 3) },
        { id: 'hint_war', trigger: 'action', x: 4, y: 3, label: '石刻', run: async (S) => { await S.say('', '西牆的石刻「戰」：「金克木，木克土，土克水，水克火，火克金。」'); } },
        { id: 'hint_spring', trigger: 'action', x: 35, y: 3, label: '石刻', run: async (S) => { await S.say('', '東牆的石刻「春」：「春生於木。木生火，火生土，土生金，金生水，水歸於木。」'); } },
        ...Object.keys(WX).map((el) => ({ id: 'wx_' + el, trigger: 'action', x: WX[el].x, y: WX[el].y, label: '點燈', if: (st) => !st.flags.ch7_lamp_puzzle, run: (S) => C7.touchWx(S, el) })),
        { id: 'pool', trigger: 'action', x: 17, y: 7, w: 6, h: 5, label: '調查', if: (st) => !st.flags.ch7_lamp_puzzle, run: async (S) => {
          await S.say('', '廳中央是一池靜止的水。水底隱約有往下的石階。四周立著五座石燈座。');
        } },
      ],
      warps: [
        { x: 19, y: 28, w: 2, h: 2, to: 'sunmoon_mist', tx: 15, ty: 2, tdir: 'down' },
        { x: 20, y: 9, to: 'lamp_shrine_lower', tx: 20, ty: 25, tdir: 'up', if: (st) => !!st.flags.ch7_lamp_puzzle },
      ],
      drawOver: (ctx, t) => {
        const lit = F().ch7_lamp_puzzle ? WX_ORDER : C7.wxLit();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const el in WX) {
          const on = lit.includes(el);
          const cx = WX[el].x * T + 32, cy = WX[el].y * T - 10;
          const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, on ? 54 : 18);
          g2.addColorStop(0, U.rgba(WX_COL[el], on ? 0.9 : 0.25)); g2.addColorStop(1, U.rgba(WX_COL[el], 0));
          ctx.fillStyle = g2; ctx.fillRect(cx - 54, cy - 54, 108, 108);
          G.Render.text(ctx, WX[el].name, cx, cy - 64, { size: 18, align: 'center', color: on ? '#fff6d8' : 'rgba(230,220,200,0.55)' });
        }
        ctx.restore();
      },
    }));

    // ---- 下殿
    const rows2 = [];
    for (let y = 0; y < 30; y++) {
      let r = '';
      for (let x = 0; x < 40; x++) {
        let c = 'T';
        if (y < 2 || x < 2 || x > 37 || y > 27) c = 'E';
        if ((y === 16 || y === 17) && !(x >= 18 && x <= 21)) c = 'E';
        r += c;
      }
      rows2.push(r);
    }
    G.Maps.define('lamp_shrine_lower', M({
      name: '燈母祠・下殿', subtitle: '石像衛守著的前庭', place: 'sunmoon',
      bgm: 'shrine', start: [20, 25],
      light: { ambient: 0.6, color: '#0a1428', playerR: 200 },
      lights: lightsWith([]),
      particles: [{ type: 'motes', density: 1.2 }, { type: 'dust', density: 0.4 }],
      tiles: rows2,
      objects: [
        { t: 'gate_city', x: 18, y: 2, text: '祠心' },
        { t: 'mural', x: 4, y: 17, v: MURALS[4].v }, { t: 'mural', x: 11, y: 17, v: MURALS[5].v }, { t: 'mural', x: 26, y: 17, v: MURALS[6].v },
        { t: 'stairs_up', x: 20, y: 26 },
        { t: 'eternal_lamp', x: 15, y: 4 }, { t: 'eternal_lamp', x: 24, y: 4 },
        { t: 'statue_lion', x: 16, y: 3 }, { t: 'statue_lion', x: 22, y: 3, flip: true },
        { t: 'pillar', x: 6, y: 5 }, { t: 'pillar', x: 33, y: 5 }, { t: 'pillar', x: 6, y: 12 }, { t: 'pillar', x: 33, y: 12 },
        { t: 'brazier', x: 10, y: 8 }, { t: 'brazier', x: 29, y: 8 },
        { t: 'lantern_string', x: 6, y: 19, w: 6, v: 0, lit: false }, { t: 'lantern_string', x: 28, y: 19, w: 6, v: 0, lit: false },
        { t: 'soul_jar', x: 3, y: 26 }, { t: 'jar_row', x: 33, y: 26 },
      ],
      chests: [{ id: 'c7_ls_m', x: 4, y: 10, item: 'c7_ac_jingang' }, { id: 'c7_ls_n', x: 35, y: 23, item: 'huanhundan' }],
      enemies: [
        { id: 'll1', troop: 't_c7_shrine2', x: 12, y: 10, art: 'stone_guardian', lv: 26, radius: 3, chase: 3 },
        { id: 'll2', troop: 't_c7_shrine', x: 28, y: 10, art: 'stone_guardian', lv: 26, radius: 3, chase: 3 },
        { id: 'll3', troop: 't_c7_lake', x: 8, y: 22, art: 'lamp_moth', lv: 26, radius: 2 },
      ],
      events: [
        { id: 'm4', trigger: 'action', x: 4, y: 17, w: 2, h: 1, label: '壁畫', run: (S) => C7.readMural(S, 4) },
        { id: 'm5', trigger: 'action', x: 11, y: 17, w: 2, h: 1, label: '壁畫', run: (S) => C7.readMural(S, 5) },
        { id: 'm6', trigger: 'action', x: 26, y: 17, w: 2, h: 1, label: '壁畫', run: (S) => C7.readMural(S, 6) },
      ],
      warps: [
        { x: 20, y: 26, to: 'lamp_shrine', tx: 20, ty: 12, tdir: 'down' },
        { x: 19, y: 3, to: 'lamp_shrine_core', tx: 11, ty: 18, tdir: 'up', run: async (S) => {
          if (muralCount() < 6 && !S.has('ch7_mural_hint')) {
            S.flag('ch7_mural_hint');
            await S.say('yungui:think', '……這裡的牆上還有畫沒看完。看完再進去吧，我需要一點時間準備。');
            await S.move('player', 'D');
            return false;
          }
          if (await S.choice(['推開巨門', '再準備一下'], { cancel: 1 }) !== 0) { await S.move('player', 'D'); return false; }
          return true;
        } },
      ],
      drawOver: () => {},
      drawGround: () => {},
    }));
    // blank sixth mural drawn over the frame
    const lowerDef = G.Maps.get('lamp_shrine_lower');
    lowerDef.drawOver = (ctx) => blankMuralOverlay(ctx, 26, 17);
  })();

  // ================================================================================================ 1.14 lamp_shrine_core 祠心
  (function () {
    const rows = [];
    for (let y = 0; y < 22; y++) {
      let r = '';
      for (let x = 0; x < 24; x++) {
        const d = Math.hypot((x - 11.5) / 10.2, (y - 11) / 9.2);
        let c = d < 1 && y >= 2 ? 'T' : 'E';
        if (y >= 19 && (x === 11 || x === 12)) c = 'T';
        r += c;
      }
      rows.push(r);
    }
    G.Maps.define('lamp_shrine_core', M({
      name: '祠心', subtitle: '熄滅的燈座', place: 'sunmoon',
      bgm: (st) => (st.flags.ch7_qingxu_freed ? 'love' : 'tension'), start: [11, 18], noSave: true,
      light: (st) => (st.flags.ch7_qingxu_freed ? { ambient: 0.2, color: '#2a2010' } : { ambient: 0.75, color: '#04081a', playerR: 150 }),
      lights: lightsWith(() => (F().ch7_qingxu_freed ? [{ x: 11.5, y: 7, r: 360, color: '#ffd890', flicker: 0.1 }] : [{ x: 11.5, y: 9, r: 180, color: '#3a5aff', flicker: 0.5 }])),
      particles: [{ type: 'motes', density: 1.4 }],
      tiles: rows,
      objects: [
        { t: 'eternal_lamp', x: 11, y: 7, key: 'mother_lamp' },
        { t: 'mural', x: 10, y: 1, v: 0, if: (st) => !!st.flags.ch7_qingxu_freed },
        { t: 'brazier', x: 5, y: 6 }, { t: 'brazier', x: 18, y: 6 }, { t: 'brazier', x: 4, y: 13 }, { t: 'brazier', x: 19, y: 13 },
        { t: 'lantern_string', x: 5, y: 4, w: 5, v: 0, lit: false }, { t: 'lantern_string', x: 14, y: 4, w: 5, v: 0, lit: false },
        { t: 'pillar', x: 7, y: 3 }, { t: 'pillar', x: 16, y: 3 },
      ],
      npcs: [
        { id: 'qingxu', sprite: 'qingxu', portrait: 'qingxu', x: 11, y: 9, dir: 'down', if: (st) => !st.flags.ch7_qingxu_freed },
      ],
      events: [{ id: 'core', trigger: 'auto', if: (st) => !st.flags.ch7_qingxu_freed, run: async (S) => { await C7.scene715(S); } }],
      drawOver: (ctx, t) => {
        if (F().ch7_qingxu_freed) {
          // a single small flame in the great lamp — 清虛's light
          const cx = 11 * T + 32, cy = 7 * T - 40;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 + 6 * Math.sin(t * 3));
          g2.addColorStop(0, 'rgba(255,240,200,0.95)'); g2.addColorStop(0.3, 'rgba(255,200,120,0.5)'); g2.addColorStop(1, 'rgba(255,180,90,0)');
          ctx.fillStyle = g2; ctx.fillRect(cx - 70, cy - 70, 140, 140);
          if (C7.coreGlow) {
            for (let i = 0; i < 40; i++) {
              const a = i / 40 * Math.PI * 2, R = 7.5 * T;
              ctx.fillStyle = `rgba(255,214,140,${0.5 * C7.coreGlow * (0.6 + 0.4 * Math.sin(t * 2 + i))})`;
              ctx.beginPath(); ctx.arc(11.5 * T + Math.cos(a) * R, 10 * T + Math.sin(a) * R * 0.8, 5, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.restore();
          return;
        }
        // the blue-black 冥燈 on 清虛's back and its threads
        const q = G.mapScene && G.mapScene.actor('qingxu');
        if (!q) return;
        const cx = q.px, cy = q.py - 120;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
        g2.addColorStop(0, 'rgba(120,160,255,0.85)'); g2.addColorStop(0.4, 'rgba(40,60,200,0.4)'); g2.addColorStop(1, 'rgba(20,20,80,0)');
        ctx.fillStyle = g2; ctx.fillRect(cx - 70, cy - 70, 140, 140);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(10,10,30,0.8)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(cx + Math.sin(i * 1.7 + t) * 50, cy + 40, q.px + (i - 2.5) * 12, q.py - 20 - (i % 3) * 20);
          ctx.stroke();
        }
        ctx.restore();
      },
    }));
  })();

  // 7-15 師父 + 7-16 燈母之聲 + 7-17 魚粥（章末）
  C7.scene715 = async (S) => {
    stage(S, [['player', 11, 15, 'up'], ['hongying', 10, 16, 'up'], ['yungui', 12, 15, 'up'], ['yuyuan', 11, 16, 'up']]);
    await S.camera(11, 10, 0.8);
    await S.lines([
      ['', '巨門開啟。圓形大殿中央，一座巨大的燈座，是熄的。燈座前，一個道人盤膝而坐，低著頭，鬚髮皆白。'],
      ['', '他的背上，嵌著一盞藍黑色的長明燈，燈火冰冷地燃燒，細細的黑色絲線從燈上延伸出來，扎進他的四肢。'],
      ['yungui:surprise', '……師父！'],
    ]);
    S.move('yungui', 'UUU', { wait: false });
    await S.wait(1.0);
    await S.lines([
      ['', '雲歸衝上前。清虛真人緩緩抬起頭。他的雙眼全是藍黑色的火。'],
      ['qingxu:serious', '…………雲歸。'],
      ['yungui:surprise', '師父，是我！我來帶你回去——'],
      ['qingxu:serious', '你……又沒做功課……'],
      ['yungui:surprise', '……！'],
      ['qingxu:angry', '不……不對……走……快走……'],
    ]);
    S.sfx('dark');
    S.shake(5, 0.6);
    S.flash('#2a3aff', 0.5, 0.6);
    await S.lines([
      ['', '他背上的長明燈火焰暴漲。他的聲音變成兩層：一層是他自己的，一層是冰冷、空洞的。'],
      ['qingxu:serious', '擅入燈母祠者，皆為燈油。'],
      ['xinghe:serious', '是長明宮的燈！它在操縱他！'],
      ['yungui:serious', '…………'],
      ['yungui:serious', '星河，洛姑娘。聽好。'],
      ['yungui:serious', '打那盞燈。不要打我師父。'],
      ['yungui:serious', '……如果非打不可，打我師父的時候，讓我來。'],
      ['hongying:serious', '知道了。'],
    ]);
    const r = await S.battle('t_c7_qingxu', {
      bgmAfter: null,
      intro: async () => { await G.Dialog.say('qingxu:serious', '五行輪轉，生生不息——皆為我燃。'); G.Dialog.close(); },
    });
    if (r !== 'win') return;
    S.sfx('shatter');
    S.flash('#ffffff', 0.6, 0.8);
    await S.say('', '冥燈印碎裂。藍黑色的火焰尖叫著熄滅，黑色的絲線一根根斷開，化為黑水，滲入地面。');
    S.flag('ch7_qingxu_freed');
    stage(S, [['player', 10, 11, 'up'], ['hongying', 13, 12, 'left'], ['yungui', 11, 10, 'up'], ['yuyuan', 9, 12, 'up']]);
    S.setPos('qingxu', 11, 9, 'down');
    S.light({ ambient: 0.6, color: '#0a0c1a', playerR: 200 });
    S.bgm('sad');
    await S.lines([
      ['', '清虛向前倒下。雲歸接住他。'],
      ['yungui:cry', '師父！師父……'],
      ['qingxu:smile', '……雲歸。'],
      ['qingxu:smile', '你長高了。'],
      ['yungui:cry', '我沒有。我二十四了，早就沒長了……'],
      ['qingxu:laugh', '那就是……我變矮了。哈哈……咳咳……'],
      ['yungui:cry', '不要笑了……你一笑就咳……'],
      ['qingxu:normal', '雲歸。聽我說。我的時間……不多。'],
      ['qingxu:serious', '夜玄……他要用燈靈，讓黑水倒流。他要讓所有死去的人帶著記憶回來。'],
      ['qingxu:serious', '我追到這裡，想求燈母指路……結果被他的燈先封住了。'],
      ['qingxu:sad', '被封住的這段時間……那盞燈一直在吸我的命。'],
      ['qingxu:sad', '燈油……燒得差不多了。'],
      ['yungui:cry', '不要。我找了你那麼久。我才剛找到你。'],
      ['qingxu:smile', '傻孩子。你找到了啊。'],
      ['qingxu:smile', '我一直很怕，我會死在一個沒有人知道的地方。'],
      ['qingxu:smile', '結果，來的是你。'],
      ['qingxu:smile', '這已經……是我這輩子，最好的運氣了。'],
      ['', '清虛抬起顫抖的手，點在雲歸的眉心。一道紫白色的雷光從他的指尖流入雲歸體內。'],
    ]);
    S.sfx('thunder');
    S.flash('#d8c8ff', 0.6, 0.7);
    await S.lines([
      ['qingxu:serious', '太虛觀……最後一道雷。我本來想等你不再偷懶的時候……再教你。'],
      ['qingxu:smile', '不等了。你一直都比你以為的……好。'],
      ['yungui:cry', '師父……我……我在靈境裡，夢到你罵我……'],
      ['qingxu:smile', '我罵過你嗎？'],
      ['yungui:cry', '……沒有。一次都沒有。'],
      ['qingxu:smile', '那就對了。'],
      ['qingxu:think', '啊……還有……後山那朵菇……'],
      ['yungui:cry', '……我知道。紅傘白點的那朵。我每年都去看。'],
      ['qingxu:smile', '……好。……看得見，就好……'],
      ['', '清虛的手垂下。他的臉很安詳，像是睡著了。'],
      ['', '他的身體化作無數細小的光點，緩緩升起。光點在大殿上方盤旋了一圈，飄向大殿中央熄滅的燈座。'],
    ]);
    await S.fadeActor('qingxu', 0, 1.5);
    S.remove('qingxu');
    await S.wait(1.5);
    S.move('yuyuan', 'RU', { wait: false });
    await S.wait(0.6);
    await S.lines([
      ['', '芋圓走過去，用頭輕輕頂了頂雲歸的手。雲歸一把抱住芋圓，把臉埋進牠的毛裡。'],
      ['yungui:cry', '……………………'],
      ['', '紅纓轉過身，背對他們，站得筆直。星河走過去，站在雲歸旁邊，什麼也沒說。'],
      ['', '麻糬走過來，在雲歸腳邊坐下，把尾巴輕輕搭在他的鞋上。'],
      ['yungui:cry', '……全是貓毛。笨蛋。'],
    ]);
    S.flag('ch7_taixu');
    S.learn('yungui', 'yg_taixu');
    await S.give('c7_fn_qingxu', 1);
    // 7-16 燈母之聲
    S.sfx('lantern');
    S.light({ ambient: 0.2, color: '#2a2010' });
    S.bgm('love');
    S.refresh();
    C7.coreGlow = 0;
    await S.say('', '清虛化作的光點落進中央的燈座。燈座深處，亮起一點極小的光。');
    await G.Tweens.to(C7, { coreGlow: 1 }, 2.0, 'linear');
    await S.say('', '那點光慢慢擴大。殿內環繞的上千盞燈籠，一盞接一盞地亮起。牆上出現第七幅壁畫：一位穿長袍的女子，手捧著一盞燈。');
    await S.lines([
      ['lantern_mother:normal', '……點燈的孩子們。'],
      ['xinghe:surprise', '……燈母？'],
      ['lantern_mother:normal', '你們走過了山。山上的人，給了你們火。'],
      ['lantern_mother:normal', '你們走過了夢。夢裡，你們看見了自己的傷。'],
      ['lantern_mother:normal', '現在，聽我說。'],
      ['lantern_mother:normal', '很久以前，我把自己的心點成了一盞燈。我以為，那樣就夠了。'],
      ['lantern_mother:normal', '可是一個人點的燈，很容易熄。風一吹，就熄。'],
      ['lantern_mother:normal', '所以每隔幾代，我的女兒就要上岸，把自己的光再添進去。'],
      ['lantern_mother:sad', '每一次添進去，她就少一點。每一次，她都一個人回去。'],
      ['hongying:sad', '……白芷。'],
      ['lantern_mother:normal', '孩子們，記住——'],
      ['lantern_mother:normal', '一個人點的燈，很脆弱。'],
      ['lantern_mother:smile', '一千個人點的燈，永遠不會熄。'],
      ['', '第五幅壁畫「千手」的光，在大殿中與第七幅壁畫連成一線。'],
      ['xinghe:think', '一千個人……'],
      ['xinghe:serious', '……就是那幅還沒發生的畫。'],
      ['lantern_mother:serious', '黑水已經開始倒流了。那個失去女兒的人，正在把海往回拉。'],
      ['lantern_mother:serious', '當海第一次倒流的時候，死去的人會走上岸。'],
      ['lantern_mother:sad', '不要恨他們。他們只是迷路了。'],
      ['lantern_mother:normal', '去吧。到海邊去。把你們遇到的每一點光，都記住。'],
    ]);
    await G.Tweens.to(C7, { coreGlow: 0 }, 1.5, 'linear');
    await S.lines([
      ['', '光芒收斂。燈籠一盞盞熄滅，只剩中央燈座那一點小小的火，安靜地燃燒——清虛的光。'],
      ['yungui:sad', '……師父，你變成燈了啊。'],
      ['yungui:smile', '也好。你這輩子最愛罵我不點燈讀書。'],
    ]);
    S.shake(8, 1.5);
    S.sfx('earth');
    await S.lines([
      ['hongying:surprise', '祠堂在沉！'],
      ['xinghe:serious', '走！'],
    ]);
    S.flag('ch7_mother_voice');
    await S.fadeOut(1.0);
    await S.warp('sunmoon', 9, 28, 'up', { fade: 0, stayDark: true });
    await C7.scene717(S);
  };

  C7.scene717 = async (S) => {
    S.light({ ambient: 0.15, color: '#3a2a40' });
    S.particles([{ type: 'mist', density: 0.6 }, { type: 'motes', density: 0.4 }]);
    stage(S, [['player', 9, 21, 'down'], ['hongying', 8, 21, 'down'], ['yungui', 10, 21, 'down'], ['yuyuan', 9, 20, 'down']]);
    S.setPos('thao_elder', 9, 23, 'up');
    await S.camera(9, 22, 0.1);
    S.bgm('lake');
    await S.fadeIn(1.4);
    await S.lines([
      ['', '黎明。眾人渾身濕透地站在湖岸上。身後，霧正在散去，什麼祠堂也看不見了。'],
      ['', '邵族長老坐在岸邊，身旁放著一鍋魚粥，還在冒煙。'],
      ['邵族長老', '天亮了。剛好。'],
      ['xinghe:surprise', '長老……您一直在等？'],
      ['邵族長老', '老人睡得少。而且我說過，魚粥不等人。所以我等。'],
      ['', '長老看了一眼雲歸。雲歸的眼睛是紅的。長老什麼都沒問，盛了一碗最滿的遞給他。'],
      ['邵族長老', '吃。哭過的人，要吃熱的。'],
      ['yungui:sad', '…………謝謝。'],
    ]);
    await S.fadeOut(0.8);
    stage(S, [['player', 9, 21, 'down'], ['hongying', 8, 22, 'right'], ['yungui', 10, 22, 'left'], ['yuyuan', 9, 22, 'up']]);
    await S.fadeIn(0.8);
    await S.lines([
      ['', '眾人圍坐吃粥。'],
      ['hongying:serious', '接下來呢？燈母說，到海邊去。'],
      ['yungui:think', '白芷被帶去澎湖了。要過海，得先找到港口跟船。'],
      ['yungui:normal', '從這裡往西走出山，最近的大港是北港。'],
      ['yungui:think', '而且……下個月是三月。媽祖生。北港會擠滿進香的人。'],
      ['xinghe:think', '香客多，船也多。……燈母說，海第一次倒流的時候——'],
      ['hongying:serious', '死去的人會走上岸。'],
      ['hongying:serious', '如果那時候岸邊擠滿了人……'],
      ['xinghe:serious', '那我們更要去。'],
    ]);
    await S.move('player', 'U');
    S.face('player', 'up');
    S.sfx('fire');
    await S.lines([
      ['', '麻糬走到水邊，望著西邊。那是海的方向。脖子上的紅繩在晨風裡輕輕晃。'],
      ['', '星河站起身，攤開手掌。一團穩定的心火在掌心燃燒。'],
      ['xinghe:smile', '白芷。妳再等一下。'],
      ['xinghe:smile', '這一次，妳不會一個人發光了。'],
      ['', '湖面上，一點小小的光從水底浮起——像是燈母祠中央那一點火的倒影——然後沉了回去。'],
    ]);
    S.flag('ch7_end');
    S.quest('q_ch7_main', 'done');
    S.objective('');
    await S.fadeOut(1.6);
    await S.titleCard('第七章　雲山入夢　完', '');
    await S.narrate(['十數日後。三月，北港。'], { veil: 1 });
    await G.Story.next(S, 8);
  };

})();
