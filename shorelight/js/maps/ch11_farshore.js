// 第十一章　黑水溝・彼岸 (ch11_farshore) — 最後一夜：王船 → 澎湖媽宮（天后宮）→ 石滬灘・潮停之路 → 玄武嶼・長明宮
// （萬魂窟・長明殿・白芷的囚室・逆潮台）→ 黑水溝（漂燈之海・溺魂暗流・鯤之淵・無光之霧）→ 彼岸花原 → 彼岸燈塔五層
// → 燈心之門 → 一息界 → 燈心（夜玄・黑潮無相）→ 結局「千燈」／「彼岸」＋名單＋片尾彩蛋。
// Screenplays: docs/story/ch11_farshore.md, docs/story/endings.md.
// Entry: G.Story.ch11(S) (works standalone from ?debug&startch=11).  Exit: S.ending('true' | 'normal').
//
// Maps (all defined here):
//   wangboat_blacktide  王船・甲板（本章；四周依 vars.ch11_leg：海／退乾的海床／黑水溝／彼岸）  wangboat_cabin11 船艙
//   penghu_magong 媽宮   penghu_tianhou 天后宮正殿   penghu_atian 阿添伯的咾咕石厝   penghu_inn 海口客棧
//   penghu_flats 石滬灘・潮停之路   xuanwu_shore 玄武嶼・黑岸   xuanwu_b1 萬魂窟   xuanwu_1f 長明殿
//   xuanwu_cell 白芷的囚室   xuanwu_top 逆潮台   farshore_field 彼岸花原   farshore_tower_1..5 彼岸燈塔
//   farshore_tower_top 燈心之門   breath_realm 一息界   lamp_heart 燈心
//   ending maps: ending_badouzi 八斗子・中元   ending_jiufen 九份豎崎路   ending_jiufen_shop 陳記燈籠舖
//                ending_lukang 鹿港・洛家古厝   (太虛觀 = full-screen vignette)
// State: vars.ch11_moon (北斗斗柄 0–5), vars.ch11_leg (航段 0–5), vars.ch11_letters_read, vars.ch11_yx_song,
//        vars.ch11_face_hy / ch11_face_yg, vars.ch11_lit (五燈), vars.ch11_mirrors (曼陀羅), vars.tuanzi_mush (= 雲歸's 七仙蕈 counter, legacy id, cross-chapter).
// Quests: q_ch11_main, q_penghu_weir, q_tangshan, q_baizhi_memory, q_ch11_treasure, q_tuanzi_mush (雲歸的蕈譜, legacy id — completed here).
// Pets: 芋圓 (yuyuan) & 麻糬 (mochi) — silent; flags yuyuan_joined / mochi_joined (set here when missing).
// 心燈: lantern_penghu_weir, lantern_tangshan, lantern_baizhi_memory.
// Endings: G.Lanterns.count() >= G.Lanterns.THRESHOLD → 'true' (千燈) else 'normal' (彼岸).
'use strict';
(function () {
  const U = G.U;
  const T = G.TILE || 64;
  const V = () => G.state.vars;
  const F = (k) => !!G.state.flags[k];
  const autoplay = () => !!(G.Debug && G.Debug.autoplay);
  const inParty = (id) => G.state.party.includes(id);
  const avgLv = () => { const a = G.Party.active(); return a.length ? Math.round(a.reduce((s, m) => s + m.lv, 0) / a.length) : 38; };
  const fxK = () => (G.settings.visualFx == null ? 1 : G.settings.visualFx);
  const lowFx = () => G.settings.quality === 'low' || fxK() < 0.5;

  // ------------------------------------------------------------------ grid helpers (maps are built in code)
  function grid(w, h, ch) { const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill(ch)); return g; }
  function fill(g, x, y, w, h, ch) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy] && xx >= 0 && xx < g[yy].length) g[yy][xx] = ch; }
  function set(g, x, y, ch) { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch; }
  function get(g, x, y) { return g[y] && x >= 0 && x < g[y].length ? g[y][x] : null; }
  function rows(g) { return g.map((r) => r.join('')); }
  function disc(g, cx, cy, r, ch, ry) { ry = ry || r; for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = (x - cx) / r, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1.0001) set(g, x, y, ch); } }
  // thick polyline (for winding paths)
  function path(g, pts, ch, w = 1) {
    for (let i = 0; i < pts.length - 1; i++) {
      let [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
        fill(g, x, y, w, w, ch);
      }
    }
  }
  function room(w, h, floor, wall, doors) {
    const g = grid(w, h, floor);
    fill(g, 0, 0, w, 2, wall); fill(g, 0, 0, 1, h, wall); fill(g, w - 1, 0, 1, h, wall); fill(g, 0, h - 1, w, 1, wall);
    for (const dx of doors || []) g[h - 1][dx] = floor;
    return g;
  }
  // deterministic scatter of objects over cells whose terrain char is in `on`
  function scatterObjs(out, g, on, types, density, seed, avoid) {
    for (let y = 0; y < g.length; y++) for (let x = 0; x < g[y].length; x++) {
      if (!on.includes(g[y][x])) continue;
      if (avoid && avoid(x, y)) continue;
      if (U.hash(x, y, seed) < density) out.push({ t: types[Math.floor(U.hash(y, x, seed + 3) * types.length)], x, y });
    }
    return out;
  }

  // ------------------------------------------------------------------ small script helpers
  const L = (S, arr) => S.lines(arr);
  async function pause(S, sec) { await S.wait(autoplay() ? 0.05 : sec); }
  function bumpMoon(n) { V().ch11_moon = Math.max(V().ch11_moon || 0, n); }
  function giveSilent(id, n = 1) { if (G.Data.items[id]) G.Inv.add(id, n); }

  // =================================================================================================
  // custom sprite variants
  // =================================================================================================
  if (G.Sprites && G.Sprites.define) {
    const D = (id, spec) => { try { G.Sprites.define(id, spec); } catch (e) { G.warnOnce && G.warnOnce('sprite ' + id, e); } };
    D('c11_suwan', { base: 'ghost_f', body: 'female', mouth: 'smile', eyeStyle: 'soft', brows: 'soft',
      hair: { style: 'center', color: '#2a2630', back: 'lowtie', knot: 'bun' },
      top: { color: '#e8e4dc', len: 0.95, closure: 'cross', trim: '#b8b0a0', sleeve: 'wide' }, held: 'lantern', glow: '#ffe6b0' });
    D('c11_ayong', { base: 'ghost_child', body: 'child', mouth: 'smile', towel: { color: '#d8d0c0' },
      top: { color: '#9ab0c0', len: 0.2, closure: 'cross', sleeve: 'rolled' }, bottom: { type: 'shorts', color: '#5a6a7a' }, shoes: { type: 'bare' } });
    D('c11_amu_old', { base: 'ghost_m', body: 'elder', mouth: 'flat', eyeStyle: 'line',
      hair: { style: 'back', color: '#c8c8c0', back: 'lowtie', knot: 'bun' },
      top: { color: '#8a8270', len: 0.25, closure: 'side', sleeve: 'rolled' }, bottom: { type: 'cropped', color: '#5a5448' }, shoes: { type: 'sandal', color: '#6a5a40' }, bag: { color: '#b89a5a' } });
    D('c11_amu_young', { base: 'ghost_m', body: 'adult', size: 0.92, mouth: 'smile',
      hair: { style: 'back', color: '#1a1a20', back: 'lowtie' },
      top: { color: '#8a9aa8', len: 0.25, closure: 'side', sleeve: 'rolled' }, bottom: { type: 'cropped', color: '#4a5260' }, shoes: { type: 'sandal', color: '#5a4a30' } });
    D('c11_ts_mother', { base: 'ghost_f', body: 'elderf', mouth: 'flat', eyeStyle: 'line',
      hair: { style: 'center', color: '#e0dcd4', back: 'lowtie', knot: 'bun' },
      top: { color: '#7a8a96', len: 0.5, closure: 'side', sleeve: 'long' }, held: 'oillamp' });
    D('c11_atian', { base: 'fisherman', body: 'elder', mouth: 'flat', eyeStyle: 'line', face: { beard: 'whiskers', beardColor: '#d8d4c8' },
      hair: { style: 'bald', color: '#c8c4bc' }, hat: { type: 'douli', color: '#c8a868' }, held: 'cane' });
    D('c11_atian_wife', { base: 'old_f', apron: { color: '#6a7a8a', len: 0.6 } });
    D('c11_captain', { base: 'pirate_ghost', body: 'stout', size: 1.12, face: { beard: 'full', beardColor: '#16161c' }, brows: 'grumpy',
      top: { color: '#8a2a24', len: 0.6, closure: 'open', trim: '#d8b04a', sleeve: 'long' }, hat: { type: 'scarf', color: '#a8221c' } });
    D('c11_pirate_kid', { base: 'pirate_ghost', size: 0.82, mouth: 'frown', eyeStyle: 'round' });
    D('c11_echo_baizhi', { base: 'baizhi', ghost: true, glow: '#fff2c8', halo: '#ffe6a0' });
    D('c11_echo_qingfeng', { base: 'qingfeng', ghost: true, ghostTint: '#ffd8c8', size: 0.92 });
    D('c11_echo_hongying', { base: 'hongying', ghost: true, ghostTint: '#ffd8c8', size: 0.9 });
    D('c11_echo_father', { base: 'noble_m', ghost: true, ghostTint: '#ffe0c8', face: { beard: 'goatee', beardColor: '#3a3028' } });
    D('c11_echo_mother', { base: 'noble_f', ghost: true, ghostTint: '#ffe0c8' });
    D('c11_echo_qingxu', { base: 'qingxu', ghost: true, ghostTint: '#d8e8ff' });
    D('c11_echo_boy', { base: 'child_m', ghost: true, ghostTint: '#d8e8ff', mouth: 'smile', hair: { style: 'messy', color: '#2a2420', back: 'short' },
      top: { color: '#8a8270', len: 0.2, closure: 'cross', sleeve: 'short' }, shoes: { type: 'bare' } });
    D('c11_young_yexuan', { base: 'yexuan', ghost: true, ghostTint: '#c8d8ff', hair: { style: 'straight', color: '#1a1a22', back: 'long' } });
    D('c11_young_chendu', { base: 'boatman', ghost: true, ghostTint: '#c8d8ff', hair: { style: 'messy', color: '#1a1a20', back: 'short' }, held: 'oar' });
    D('c11_freed_soul', { base: 'ghost_m', body: 'elder', face: { beard: 'long', beardColor: '#c8d4e0' } });
    D('c11_tongzi', { base: 'ghost_child', ghost: true, ghostTint: '#ffe8ff', glow: '#c8f0ff', halo: '#ffe680' });
  }

  // =================================================================================================
  // DATA — items (prefix c11_), skills, enemies & troops (t11_*), quests
  // =================================================================================================
  const I = G.Data.items;
  Object.assign(I, {
    // ---- key items ----
    c11_mazu_pouch: { name: '媽祖香火袋', desc: '天后宮神前香爐的香灰，裝在小紅布袋裡，過過爐。掛在船頭，船仔媽就在身邊。航行中遇敵減少。', type: 'key', price: 0, ch: 11, icon: 'bag' },
    c11_blacktide_chart: { name: '黑水溝海圖', desc: '烏鬚船主畫了一輩子的海圖。黑水溝的暗流都在上面——包括一條有人在唱歌的暗流。', type: 'key', price: 0, ch: 11, icon: 'scroll' },
    c11_soul_key: { name: '鎖魂鑰', desc: '萬魂窟祭壇浮起的黑鐵鑰匙。能打開往長明殿的鐵柵。', type: 'key', price: 0, ch: 11, icon: 'key' },
    c11_old_portrait: { name: '舊畫像', desc: '兩個年輕的引魂人坐在船頭，扛著槳，笑得很開。其中一人肩上，騎著一個綁雙髻的小女孩。', type: 'key', price: 0, ch: 11, icon: 'scroll' },
    c11_yx_diary: { name: '夜玄的手記', desc: '字跡端正，一頁一行：「念兒今天沒有說話。」最後一頁，字第一次歪了。', type: 'key', price: 0, ch: 11, icon: 'scroll' },
    c11_bz_letters: { name: '白芷的信', desc: '六盞摺成小燈籠的紙，用陳記的摺法。每一盞都是一封信。', type: 'key', price: 0, ch: 11, icon: 'letter' },
    c11_bz_flute: { name: '白芷的玉笛', desc: '囚室窗台上的玉笛，發著一點點光。要親手還給她。', type: 'key', price: 0, ch: 11, icon: 'flute' },
    c11_pingan_letter: { name: '平安信', desc: '雲歸代筆、阿木伯一句一句說出來的信。「阿娘毋免閣等阮食飯矣。」', type: 'key', price: 0, ch: 11, icon: 'letter' },
    // ---- 媽宮 food ----
    c11_xianbing: { name: '鹹餅', desc: '澎湖的鹹餅，討海人放在懷裡，三天都不會壞。回復氣血 500。', type: 'use', price: 160, ch: 11, icon: 'food', use: { target: 'ally', heal: 500 } },
    c11_xiaoguan: { name: '小管麵線', desc: '小管熬的湯，配細細的麵線。回復氣血 700、真氣 60。', type: 'use', price: 380, ch: 11, icon: 'food', use: { target: 'ally', heal: 700, mp: 60 } },
    c11_dingxiang: { name: '丁香魚乾', desc: '風吹日曬的小魚乾。配飯、配酒、配鬼攏好。回復真氣 120。', type: 'use', price: 320, ch: 11, icon: 'food', use: { target: 'ally', mp: 120 } },
    c11_fengru: { name: '風茹茶', desc: '澎湖人用來退火的青草茶。解除所有異常，回復氣血 200。', type: 'use', price: 150, ch: 11, icon: 'drink', use: { target: 'ally', heal: 200, cure: ['poison', 'seal', 'sleep', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'] } },
    c11_jingua: { name: '金瓜米粉', desc: '添姆的金瓜炒米粉。澎湖的金瓜特別甜。全體回復氣血 1000。', type: 'use', price: 1200, ch: 11, icon: 'food', use: { target: 'allies', heal: 1000 } },
    c11_pirate_rum: { name: '烏鬚船主的酒', desc: '「省著喝。喝多了，會看見鯨魚在跳舞。」戰鬥中使一人攻擊上升，有時會進入幻境。', type: 'use', price: 0, ch: 11, icon: 'wine', use: { target: 'ally', buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }], status: { id: 'trance', chance: 0.2, turns: 2 }, battle: true, field: false } },
    // ---- 彼岸 tea stall ----
    c11_higan_tea: { name: '彼岸茶', desc: '茶婆的茶。「放心，這裡的茶，不會讓你忘記什麼。」回復氣血 1000、真氣 100。', type: 'use', price: 700, ch: 11, icon: 'drink', use: { target: 'ally', heal: 1000, mp: 100 } },
    c11_qingxin_tea: { name: '清心茶', desc: '一口下去，心裡清清的。解除所有異常。', type: 'use', price: 120, ch: 11, icon: 'drink', use: { target: 'ally', cure: ['poison', 'seal', 'sleep', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'] } },
    c11_lamp_oil: { name: '燈芯油', desc: '點長明燈用的燈油，溫溫的。回復真氣 200。', type: 'use', price: 600, ch: 11, icon: 'potion', use: { target: 'ally', mp: 200 } },
    c11_lamp_ash: { name: '千年燈灰', desc: '千年燈塔守化成的燈灰。使倒下的同伴復活並回復三成氣血。', type: 'use', price: 0, ch: 11, icon: 'incense', use: { target: 'deadAlly', revive: 0.3 } },
    // ---- 鐵舖 & equipment ----
    c11_sw_xuanwu: { name: '玄武劍', desc: '阿榮師用玄武岩磨的劍胚。「討海人的刀，愛砍會斷纜索。」土屬性。', type: 'weapon', price: 2600, ch: 11, icon: 'sword', who: ['xinghe'], elem: 'earth', stats: { atk: 86 } },
    c11_sp_jinggu: { name: '鯨骨槍', desc: '鯨骨做的槍桿，又輕又韌。', type: 'weapon', price: 2650, ch: 11, icon: 'spear', who: ['hongying'], stats: { atk: 88, spd: 4 } },
    c11_fl_haiyue: { name: '海月笛', desc: '「這枝，是予彼个姑娘的。」吹起來像海月貝在響。水屬性。', type: 'weapon', price: 2600, ch: 11, icon: 'flute', who: ['baizhi'], elem: 'water', stats: { atk: 12, mag: 84, mp: 26 } },
    c11_fn_leishan: { name: '雷霆符扇', desc: '扇骨裡封著一道海上的雷。木屬性。', type: 'weapon', price: 2650, ch: 11, icon: 'fan', who: ['yungui'], elem: 'wood', stats: { atk: 12, mag: 92, mp: 28 } },
    c11_ar_coral: { name: '咾咕石甲', desc: '珊瑚礁石片綴成的甲，灰白、滿是小孔，比看起來輕。', type: 'armor', price: 2200, ch: 11, icon: 'armor', who: ['xinghe', 'yungui'], stats: { def: 46, hp: 40 } },
    c11_ar_haiwen: { name: '海紋褙子', desc: '繡著海浪紋的褙子。', type: 'armor', price: 2250, ch: 11, icon: 'armor', who: ['baizhi', 'hongying'], stats: { def: 44, mag: 8 } },
    c11_hd_douli: { name: '漁夫斗笠', desc: '澎湖漁夫的斗笠，綁帶綁得很緊，風再大也吹不走。', type: 'head', price: 1200, ch: 11, icon: 'hat', stats: { def: 22 } },
    c11_ft_bu: { name: '澎湖布鞋', desc: '踩在咾咕石上也不痛的布鞋。', type: 'feet', price: 1300, ch: 11, icon: 'shoes', stats: { def: 15, spd: 10 } },
    c11_ac_juhua: { name: '天人菊香囊', desc: '紅黃相間的天人菊曬乾縫成的香囊。「風吹不倒的花」。免疫睡眠。', type: 'acc', price: 1500, ch: 11, icon: 'bag', stats: { mag: 10 }, immune: ['sleep'] },
    c11_ac_fisher: { name: '漁夫的護身符', desc: '石滬灘撿到的護身符，香火袋已經褪色。抵抗水屬性。', type: 'acc', price: 0, ch: 11, icon: 'jade', stats: { def: 10 }, resist: ['water'] },
    c11_ac_weir_stone: { name: '滬石護符', desc: '添家滬滬門頂那粒石頭，阿添伯的老爸疊的。抵抗水屬性，免疫定身。', type: 'acc', price: 0, ch: 11, icon: 'gem', stats: { def: 18 }, resist: ['water'], immune: ['stun'] },
    c11_ac_tangshan_coin: { name: '唐山銅錢', desc: '阿木伯四十年的積蓄裡的一枚。戰鬥後得到的錢增加。', type: 'acc', price: 0, ch: 11, icon: 'ring', stats: { luk: 20 }, special: ['goldUp'] },
    c11_ac_memory_lamp: { name: '憶燈', desc: '六盞記憶燈聚成的一盞小燈，溫暖得像剛煮好的芋圓。白芷專用。戰鬥開始時持續回復。', type: 'acc', price: 0, ch: 11, icon: 'lantern', who: ['baizhi'], stats: { mag: 25, mp: 30 }, special: ['autoRegen'] },
    c11_ac_captain_patch: { name: '船主的獨眼罩', desc: '烏鬚船主留下的眼罩。戴上以後，看什麼都像要打劫。暴擊率提升。', type: 'acc', price: 0, ch: 11, icon: 'misc', stats: { atk: 8, luk: 8 }, special: ['critUp'] },
    c11_ft_guard_boots: { name: '長明宮衛的鐵靴', desc: '黑鐵打的靴子，很重，走起來咚咚響。', type: 'feet', price: 0, ch: 11, icon: 'shoes', stats: { def: 20, hp: 30 } },
    c11_ac_jade_bracer: { name: '黑玉護腕', desc: '萬魂窟架子上找到的黑玉護腕。', type: 'acc', price: 0, ch: 11, icon: 'jade', stats: { def: 15, mag: 15 } },
    c11_ac_iron_heart: { name: '黑鐵護心', desc: '鎖魂將胸口的護心鏡。免疫定身。', type: 'acc', price: 0, ch: 11, icon: 'gem', stats: { def: 25 }, immune: ['stun'] },
    c11_ac_yx_talisman: { name: '夜玄的舊引魂符', desc: '二十年前的引魂符，字跡端正。戰鬥開始時持續回復。', type: 'acc', price: 0, ch: 11, icon: 'talisman', stats: { def: 8, mag: 12 }, special: ['autoRegen'] },
    c11_ar_kun_scale: { name: '鯤鱗甲', desc: '鯤吐出萬燈之後，留在甲板上的一片鱗。抵抗水屬性。', type: 'armor', price: 0, ch: 11, icon: 'armor', stats: { def: 52, mag: 10 }, resist: ['water'] },
    c11_sp_chixiao: { name: '赤霄槍', desc: '燈塔一樓的寶箱裡，靜靜躺著的一把紅槍。金屬性，暴擊率提升。', type: 'weapon', price: 0, ch: 11, icon: 'spear', who: ['hongying'], elem: 'metal', stats: { atk: 96, spd: 5 }, special: ['critUp'] },
    c11_fn_taixu_lei: { name: '太虛雷扇', desc: '扇面上是太虛觀的雲紋。木屬性，每回合回復真氣。', type: 'weapon', price: 0, ch: 11, icon: 'fan', who: ['yungui'], elem: 'wood', stats: { atk: 12, mag: 98, mp: 30 }, special: ['mpRegen'] },
    c11_sw_yinghuo_ming: { name: '螢火・明', desc: '回應了燈靈那點火的螢火。橘色的光，和水燈裡那點小光一模一樣。火屬性，劍意累積加快。', type: 'weapon', price: 0, ch: 11, icon: 'sword', who: ['xinghe'], elem: 'fire', stats: { atk: 98, mag: 22, luk: 6 }, special: ['gaugeUp'] },
    c11_fl_dengxin: { name: '燈心玉笛', desc: '火焰中落下的白玉笛——燈母留給她的。水屬性，回復量提升。', type: 'weapon', price: 0, ch: 11, icon: 'flute', who: ['baizhi'], elem: 'water', stats: { atk: 12, mag: 100, mp: 32 }, special: ['healUp'] },
    c11_hd_higan: { name: '彼岸花簪', desc: '彼岸花做的髮簪，紅得發亮。免疫睡眠。', type: 'head', price: 0, ch: 11, icon: 'hairpin', who: ['baizhi', 'hongying'], stats: { def: 22, mag: 12 }, immune: ['sleep'] },
    c11_ac_old_tassel: { name: '舊槳穗', desc: '二十年前陳渡落海時掉的槳穗。「槳穗，是讓槳不要忘記回家的路。」', type: 'acc', price: 0, ch: 11, icon: 'misc', stats: { spd: 15, luk: 10 } },
    c11_ac_wanxiang_bell: { name: '萬象鈴', desc: '萬象童子給的鈴。搖起來，每一聲都是不同的顏色。', type: 'acc', price: 0, ch: 11, icon: 'ring', stats: { atk: 8, def: 8, mag: 8, spd: 8, luk: 8 } },
    c11_mat_nameless: { name: '無名之色', desc: '「它不值錢，所以它很珍貴！」——一小片沒有名字的顏色。', type: 'material', price: 2, ch: 11, icon: 'gem' },
    c11_ac_cosmic: { name: '七色蕈鈴', desc: '七仙蕈全收集的證明。雲歸說他看見了世上所有的顏色——還是很想喝酒。雲歸裝備。', type: 'acc', price: 0, ch: 11, icon: 'ring', who: ['yungui'], stats: { mag: 14, luk: 14 }, special: ['mpRegen'] },
    c11_pirate_coin: { name: '海賊金幣', desc: '三百年前的金幣。烏鬚的字條說：真正的寶，是一路的伙伴。', type: 'material', price: 6000, ch: 11, icon: 'bag' },
    c11_shell: { name: '貝殼', desc: '海賊寶箱裡的貝殼。很漂亮，不太值錢。', type: 'material', price: 10, ch: 11, icon: 'gem' },
  });

  // ---- skills (enemy skills e11_*, player skill c11_yg_cosmic) ----
  const SK = G.Data.skills;
  Object.assign(SK, {
    c11_yg_cosmic: {
      name: '萬色符', desc: '「貧道，看見了。世上所有的顏色。」七色的符從天而降——至於降下什麼，連雲歸自己也不知道。', mp: 16, type: 'special', elem: null, target: 'self', power: 0,
      special: 'cats', fx: 'summon', sfx: 'magic',
      outcomes: [
        { w: 2, skill: 'c11_tz_metal', cat: 'yuyuan', text: '雲歸的瞳孔變成六角形的漩渦——金色的雨落下來了！' },
        { w: 2, skill: 'c11_tz_wood', cat: 'mochi', text: '雲歸打了一個噴嚏，青色的雷從天而降！' },
        { w: 2, skill: 'c11_tz_water', cat: 'mochi', text: '雲歸說：「海，是一碗很大很大的湯。」湯從天上倒下來了！' },
        { w: 2, skill: 'c11_tz_fire', cat: 'yuyuan', text: '芋圓想起了烤魚乾。整片天空都燒紅了！' },
        { w: 2, skill: 'c11_tz_earth', cat: 'yuyuan', text: '芋圓跳起來，又落下來。地動了！' },
        { w: 2, skill: 'c11_tz_heal', cat: 'mochi', text: '麻糬打起七彩的呼嚕。大家覺得肚子飽飽的。' },
      ],
    },
    c11_tz_metal: { name: '金之符', desc: '', mp: 0, type: 'mag', elem: 'metal', target: 'enemies', power: 2.3, hidden: true, fx: 'metal_big', sfx: 'metal' },
    c11_tz_wood: { name: '木之符', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 2.3, hidden: true, fx: 'wood_big', sfx: 'thunder' },
    c11_tz_water: { name: '水之符', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 2.3, hidden: true, fx: 'water_big', sfx: 'water' },
    c11_tz_fire: { name: '火之符', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 2.3, hidden: true, fx: 'fire_big', sfx: 'fire' },
    c11_tz_earth: { name: '土之符', desc: '', mp: 0, type: 'mag', elem: 'earth', target: 'enemies', power: 2.3, hidden: true, fx: 'earth_big', sfx: 'earth' },
    c11_tz_heal: { name: '七彩呼嚕', desc: '', mp: 0, type: 'heal', elem: null, target: 'allies', power: 2.4, hidden: true, fx: 'heal', sfx: 'heal' },
    // 烏鬚船主
    e11_cap_blade: { name: '船主刀', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.6, fx: 'slash', sfx: 'slash2' },
    e11_cap_crew: { name: '小的們！', desc: '「小的們！抄傢伙！」', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['pirate_ghost'], fx: 'summon', sfx: 'ghost' },
    e11_cap_keg: { name: '火藥桶', desc: '船主滾出一個冒煙的火藥桶！', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c11_powder_keg'], fx: 'summon', sfx: 'push' },
    e11_cap_rob: { name: '搶劫', desc: '「買路錢！」船主伸手摸了一把……又不好意思地放回去了。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'coin' },
    e11_cap_blast: { name: '火藥桶爆炸', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 1.6, fx: 'fire_big', sfx: 'fire' },
    e11_keg_hiss: { name: '嘶嘶', desc: '火藥桶冒著煙！', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'fire' },
    // 鎖魂將
    e11_jl_sweep: { name: '鎖鏈橫掃', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemies', power: 1.25, fx: 'slash', sfx: 'metal' },
    e11_jl_seal: { name: '長明鎮壓', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.5, turns: 3 }, fx: 'seal', sfx: 'bell' },
    e11_jl_drain: { name: '吸魂', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.4, drain: 0.5, fx: 'ghost', sfx: 'ghost' },
    e11_jl_lock: { name: '重鎖', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.0, status: { id: 'stun', chance: 0.4, turns: 1 }, fx: 'claw', sfx: 'crit' },
    e11_jl_refill: { name: '補罐', desc: '「……還……我……罐……」', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c11_jar'], fx: 'summon', sfx: 'ghost' },
    e11_jar_hum: { name: '嗡鳴', desc: '罐子裡傳來細細的聲音：冷……家……', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'ghost', sfx: 'ghost' },
    // 鯤
    e11_kun_swallow: { name: '吞', desc: '鯤張開了大口——', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'bite', sfx: 'splash' },
    e11_kun_roll: { name: '翻身', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 1.0, status: { id: 'stun', chance: 0.15, turns: 1 }, fx: 'water_big', sfx: 'splash' },
    e11_kun_dive: { name: '北冥', desc: '鯤潛入深海……海面一片死寂。（防禦！）', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'water', sfx: 'splash' },
    e11_kun_breach: { name: '鯤破浪而出', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 1.8, fx: 'water_big', sfx: 'crit' },
    e11_tumor_light: { name: '魂光', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 0.8, fx: 'ghost', sfx: 'ghost' },
    // 千年燈塔守
    e11_wd_staff: { name: '千年燈杖', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.7, fx: 'claw', sfx: 'crit' },
    e11_wd_black: { name: '黑燈', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 1.1, buffs: [{ stat: 'mag', amt: -0.3, turns: 2 }], fx: 'dark', sfx: 'dark' },
    e11_wd_ash: { name: '燈灰', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'debuff', sfx: 'debuff' },
    e11_wd_guard: { name: '守燈', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }], status: { id: 'regen', chance: 1, turns: 2 }, fx: 'buff', sfx: 'buff' },
    // 萬象遊戲
    e11_tz_tickle: { name: '搔癢', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.3, turns: 1 }, fx: 'kaleido', sfx: 'bell' },
    e11_tz_swap: { name: '變變變', desc: '「變變變！」', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'kaleido', sfx: 'magic' },
    e11_tz_bubble: { name: '彩色泡泡', desc: '「送你一個泡泡！」', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'kaleido', sfx: 'bell' },
    e11_tz_hide: { name: '躲貓貓', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'spd', amt: 0.3, turns: 2 }], fx: 'kaleido', sfx: 'bell' },
    // 夜玄
    e11_yx_soul: { name: '引魂・回首', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.2, status: { id: 'sleep', chance: 0.2, turns: 2 }, fx: 'water_big', sfx: 'ghost' },
    e11_yx_purge: { name: '渡厄逆流', desc: '「這些不屬於你們的光，還給潮吧。」', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'dark' },
    e11_yx_call: { name: '召燈', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['marionette_v2'], fx: 'summon', sfx: 'ghost' },
    e11_yx_tide: { name: '逆潮', desc: '潮倒流了！', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.6, invert: true, delay: 1.2, fx: 'water_big', sfx: 'splash' },
    e11_yx_souls: { name: '千魂回岸', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.2, fx: 'ghost', sfx: 'ghost' },
    e11_yx_raise: { name: '黑水溝', desc: '夜玄將罐子高高舉起……（防禦！）', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'dark' },
    e11_yx_crash: { name: '黑水溝', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 2.6, fx: 'water_big', sfx: 'crit' },
    // 黑潮・無相
    e11_wx_drown: { name: '溺', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.5, fx: 'water', sfx: 'splash' },
    e11_wx_back: { name: '回頭吧', desc: '「回頭吧……」', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }, { stat: 'mag', amt: -0.3, turns: 2 }], fx: 'debuff', sfx: 'debuff' },
    e11_wx_hands: { name: '無面之手', desc: '', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.6, hits: 4, fx: 'claw_multi', sfx: 'slash2' },
    e11_wx_faces: { name: '萬面', desc: '「我們有好多臉……你們想看誰的？」', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'ghost' },
    e11_wx_abyss: { name: '深淵', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.5, fx: 'water_big', sfx: 'dark' },
    e11_wx_devour: { name: '吞噬', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.8, drain: 0.3, fx: 'bite', sfx: 'crit' },
    e11_wx_cold: { name: '冷', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], status: { id: 'poison', chance: 0.3, turns: 3 }, fx: 'ghost', sfx: 'ghost' },
    e11_wx_voices: { name: '千聲', desc: '', mp: 0, type: 'mag', elem: null, target: 'random', power: 0.5, hits: 6, fx: 'ghost', sfx: 'ghost' },
    e11_wx_cold1: { name: '「冷……」', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 0.8, fx: 'water', sfx: 'water' },
    e11_wx_noname: { name: '「沒有人叫我們」', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'mag', amt: -0.3, turns: 1 }], fx: 'debuff', sfx: 'ghost' },
    e11_wx_cry: { name: '哭', desc: '無相之心在哭。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'ghost', sfx: 'ghost' },
  });

  // ---- enemies (same balancing curve as js/data/enemies.js) ----
  function mkEnemy(id, d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(0, Math.round(c.exp * expM)), gold: Math.max(0, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    G.Data.enemies[id] = e;
  }
  const BIMM = ['sleep', 'stun', 'trance'];
  mkEnemy('c11_captain', { name: '烏鬚船主', art: 'pirate_ghost', variant: 2, scale: 1.55, lv: 39, elem: 'water', weak: ['earth'], boss: true, immune: BIMM,
    m: { hp: 6.5, atk: 1.9, mag: 1.6, def: 1.1, spd: 1.2, exp: 5, gold: 6 },
    skills: [['e11_cap_blade', 4], ['e11_cap_crew', 2, 'ally_dead'], ['e11_cap_keg', 2], ['e11_cap_rob', 1], ['e_pirate_cutlass', 2]],
    drops: [['c11_ac_captain_patch', 1]],
    desc: '三百年前在澎湖海面橫行的海盜頭子。錨鏈拴在一盞長明燈上，「守不住路，燈就燒老子。」' });
  mkEnemy('c11_powder_keg', { name: '火藥桶', art: 'pirate_ghost', variant: 1, scale: 0.6, lv: 39, elem: 'fire', m: { hp: 0.2, atk: 0.1, def: 0.5, spd: 0.6, exp: 0, gold: 0 },
    skills: [['e11_keg_hiss', 1]], desc: '冒著煙的火藥桶。先打爆它，就炸到他們自己人。' });
  mkEnemy('c11_jailer', { name: '鎖魂將', art: 'lantern_golem', variant: 2, scale: 1.7, lv: 40, elem: 'metal', weak: ['fire'], resist: ['water'], boss: true, immune: BIMM,
    m: { hp: 8, atk: 1.85, mag: 1.75, def: 1.15, spd: 0.95, exp: 7, gold: 8 },
    skills: [['e11_jl_sweep', 4], ['e11_jl_seal', 3], ['e11_jl_drain', 3], ['e11_jl_lock', 2], ['e11_jl_refill', 4, 'hp<50']],
    drops: [['c11_ac_iron_heart', 1]],
    desc: '用鎖鏈、魂罐與熄不掉的長明燈拼成的獄卒。沒有頭，胸口是一只空空的罐子。' });
  mkEnemy('c11_jar', { name: '魂罐', art: 'ghost_lantern', variant: 2, scale: 1.1, lv: 40, elem: 'water', m: { hp: 0.75, atk: 0.1, def: 0.8, spd: 0.5, exp: 0.3, gold: 0 },
    skills: [['e11_jar_hum', 1]], desc: '肩上與背上的魂罐。裡面的魂在替它擋刀。' });
  mkEnemy('c11_kun', { name: '鯤', art: 'kun', lv: 41, elem: 'water', weak: ['earth'], resist: ['water'], boss: true, immune: BIMM, endAt: 0.025,
    m: { hp: 8.5, atk: 1.55, mag: 1.45, def: 1.15, spd: 0.9, exp: 7, gold: 0 },
    skills: [['e11_kun_swallow', 3], ['e_kun_spout', 4], ['e11_kun_roll', 3]],
    drops: [], desc: '黑水溝的老守者。吞下迷路的魂，馱著游到彼岸再吐出來。燈暗了，牠找不到岸。' });
  mkEnemy('c11_kun_tumor', { name: '吞魂燈瘤', art: 'ghost_lantern', variant: 1, scale: 1.25, lv: 41, elem: 'water', weak: ['earth'],
    m: { hp: 1.1, atk: 0.8, mag: 0.9, def: 0.9, spd: 0.8, exp: 0.6, gold: 0 },
    skills: [['e11_tumor_light', 1]], desc: '鯤背上腫脹的燈瘤，塞滿了吐不出去的魂。每回合替鯤回復。' });
  mkEnemy('c11_warden_elder', { name: '千年燈塔守', art: 'tower_warden', variant: 2, scale: 1.5, lv: 42, elem: 'metal', weak: ['fire'], boss: true, immune: BIMM,
    m: { hp: 9, atk: 2.0, mag: 1.9, def: 1.2, spd: 1.0, exp: 7, gold: 7 },
    skills: [['e11_wd_staff', 4], ['e11_wd_black', 3], ['e11_wd_ash', 2], ['e11_wd_guard', 2, 'hp<60']],
    drops: [['c11_lamp_ash', 1]], desc: '守了一千年的燈，自己的火卻黑了。燈罩臉裡的火，是黑的。' });
  for (const [id, v, nm] of [['c11_tongzi_a', 0, '赤金童'], ['c11_tongzi_b', 1, '青碧童'], ['c11_tongzi_c', 2, '紫玉童']]) {
    mkEnemy(id, { name: nm, art: 'jewel_child', variant: v, lv: 42, elem: 'fire', immune: ['poison', 'seal', 'sleep'],
      m: { hp: 1.35, atk: 0.05, mag: 0.05, def: 1.0, spd: 1.6, exp: 0, gold: 0 },
      skills: [['e11_tz_tickle', 3], ['e11_tz_swap', 2], ['e11_tz_bubble', 2], ['e11_tz_hide', 2]],
      desc: '一息界的萬象童子。身體一下子是孩子，一下子是轉動的萬花筒，一下子是一串笑聲。他們不是在戰鬥——是在玩。' });
  }
  mkEnemy('c11_yexuan_1', { name: '夜玄・玄冥法師', sprite: 'yexuan', lv: 43, elem: 'water', weak: ['earth'], resist: ['water'], boss: true, immune: BIMM,
    m: { hp: 11, atk: 2.15, mag: 2.3, def: 1.25, spd: 1.45, exp: 4, gold: 0 },
    skills: [['e_yx_oar', 4], ['e_yx_jar', 3], ['e11_yx_soul', 3], ['e11_yx_purge', 2], ['e11_yx_call', 2, 'ally_dead']],
    drops: [], desc: '長明宮之主。持黑玉之槳，背後浮著一只罐子。二十年前，他在黑水溝接住了女兒的魂燈。' });
  mkEnemy('c11_yexuan_2', { name: '夜玄・逆潮法身', sprite: 'yexuan', lv: 44, elem: 'water', weak: ['earth'], resist: ['water', 'fire'], boss: true, immune: BIMM, endAt: 0.2,
    m: { hp: 12, atk: 2.3, mag: 2.45, def: 1.15, spd: 1.5, exp: 9, gold: 8 },
    skills: [['e11_yx_souls', 3], ['e_yx_oar', 3], ['e_yx_reverse', 2]],
    drops: [], desc: '黑水纏身的夜玄。身後展開兩片由溺死者的臉組成的黑浪之翼，罐子在頭頂發光。' });
  mkEnemy('c11_wuxiang_1', { name: '黑潮・無相', art: 'wuxiang', lv: 44, elem: 'water', weak: ['earth'], resist: ['water'], boss: true, immune: BIMM.concat(['seal']),
    m: { hp: 14, atk: 2.3, mag: 2.35, def: 1.2, spd: 1.4, exp: 4, gold: 0 },
    skills: [['e_wx_tide', 4], ['e11_wx_drown', 3], ['e11_wx_back', 2], ['e11_wx_hands', 3]],
    drops: [], desc: '黑水溝裡，所有沒人哀悼、沒人渡、沒人記得名字的悲傷。表面浮動著千萬張模糊的臉。' });
  mkEnemy('c11_wuxiang_2', { name: '無相・深淵', art: 'wuxiang', lv: 45, elem: 'water', weak: ['earth'], resist: ['water'], boss: true, immune: BIMM.concat(['seal']),
    m: { hp: 11.5, atk: 2.35, mag: 2.35, def: 1.2, spd: 1.4, exp: 4, gold: 0 },
    skills: [['e11_wx_abyss', 3], ['e11_wx_devour', 3], ['e11_wx_cold', 2], ['e11_wx_voices', 3]],
    drops: [], desc: '巨影塌成一張巨口與漩渦。漩渦深處，有一點白光。' });
  mkEnemy('c11_wuxiang_3', { name: '無相之心', art: 'wuxiang', lv: 45, elem: 'water', boss: true, immune: BIMM.concat(['seal', 'poison']),
    m: { hp: 4.15, atk: 1.2, mag: 1.5, def: 0.9, spd: 0.85, exp: 30, gold: 0 },
    skills: [['e11_wx_cold1', 4], ['e11_wx_noname', 2], ['e11_wx_cry', 3]],
    drops: [], desc: '一個小小的、蜷著身子的黑水孩子。沒有臉，肩膀一抽一抽地在哭。' });

  const TR = G.Data.troops;
  Object.assign(TR, {
    t11_captain: { enemies: ['c11_captain', 'pirate_ghost', 'pirate_ghost'], bg: 'penghu', bgm: 'boss', boss: true, flee: false },
    t11_jailer: { enemies: ['c11_jailer', 'c11_jar', 'c11_jar', 'c11_jar'], bg: 'xuanwu', bgm: 'boss', boss: true, flee: false },
    t11_xw_drowned: { enemies: ['drowned_swarm', 'drowned_swarm'], bg: 'palace', bgm: 'battle2' },
    t11_xw_faceless: { enemies: ['faceless', 'marionette_v2', 'marionette_v2'], bg: 'palace', bgm: 'battle2' },
    t11_kun: { enemies: ['c11_kun', 'c11_kun_tumor', 'c11_kun_tumor'], bg: 'sea', bgm: 'boss', boss: true, flee: false },
    t11_warden: { enemies: ['c11_warden_elder', 'tower_warden', 'tower_warden'], bg: 'lighthouse', bgm: 'boss', boss: true, flee: false },
    t11_tongzi: { enemies: ['c11_tongzi_a', 'c11_tongzi_b', 'c11_tongzi_c'], bg: 'breath', bgm: 'breath', flee: false },
    t11_yexuan_1: { enemies: ['c11_yexuan_1', 'marionette_v2', 'marionette_v2'], bg: 'lighthouse', bgm: 'villain', boss: true, flee: false },
    t11_yexuan_2: { enemies: ['c11_yexuan_2'], bg: 'lighthouse', bgm: 'boss', boss: true, flee: false },
    t11_wuxiang_1: { enemies: ['c11_wuxiang_1'], bg: 'sea', bgm: 'final_boss', boss: true, flee: false },
    t11_wuxiang_2: { enemies: ['c11_wuxiang_2'], bg: 'sea', bgm: 'final_boss', boss: true, flee: false },
    t11_wuxiang_3: { enemies: ['c11_wuxiang_3'], bg: 'dream', bgm: 'dream', boss: true, flee: false },
  });

  // ---- quests ----
  const Q = G.Data.quests = G.Data.quests || {};
  Object.assign(Q, {
    q_ch11_main: { name: '黑水溝・彼岸', main: true, desc: '七月最後一夜，夜被釘住了。渡過黑水溝，到彼岸燈下，把白芷帶回家。',
      stages: ['前往媽宮。', '從媽宮南口，走潮停之路前往玄武嶼。', '解開長明宮大門的封印。', '登上長明殿，找到白芷留下的東西。', '拔掉逆潮台上的錨燈。',
        '回到王船，出航黑水溝。', '穿過彼岸花原，前往彼岸燈塔。', '登上彼岸燈塔。', '一呼一吸之間——燈心。'],
      doneText: '天亮了。鬼門關了。' },
    q_penghu_weir: { name: '石滬的缺口', lantern: true, desc: '堤岸上的阿添伯說：添家滬裡沒有魚，滿滬都是燈。其中一盞，叫他「阿兄」。',
      stages: ['去石滬灘的「添家滬」看看。', '滬牆要開口，得先問滬主。回去找阿添伯。', '帶阿添伯去添家滬。'], doneText: '滬仔愛留一个縫。魚仔才會當轉去。' },
    q_tangshan: { name: '唐山客的平安信', lantern: true, desc: '溺魂暗流裡，燈橋上的唐山阿伯——林阿木，抱著四十年的積蓄，想寄一張平安信回家。',
      stages: ['替阿木伯寫一張平安信。', '黑水溝兩邊的死人，最後都到同一個岸。在彼岸找找阿木伯的阿娘。'], doneText: '「阿娘只是……想欲聽你講。」' },
    q_baizhi_memory: { name: '她的記憶', lantern: true, desc: '燈塔五樓，六盞小小的、溫暖的燈——白芷正在失去的人間記憶。',
      stages: ['收集白芷的記憶（六盞）。'], doneText: '「我會全部還給妳。一盞都不少。」' },
    q_ch11_treasure: { name: '海賊的寶藏', desc: '阿珠說，古早的海賊把寶物埋在塔公塔婆腳底下。',
      stages: ['調查媽宮東北海口的塔公（較高的那座石塔）。'], doneText: '「真正的寶，是恁一路的伙伴。——烏鬚」' },
  });
  if (!Q.q_tuanzi_mush) Q.q_tuanzi_mush = { name: '雲歸的蕈譜', desc: '台灣頭到台灣尾，七個所在各長一種「七仙蕈」。七種都吃過的人，會看見世上所有的顏色。',
    stages: ['找到蕈譜上的蕈。', '等待下一種蕈。'] };

  // =================================================================================================
  // 心燈 cameo data — shared by 11-15 (無光之霧：一路上的心燈現身借光) and E-T1 (全島的燈).
  // Other chapters may register G.Data.lanternCameo[id] = { fog: '一句話', who: '名字', sprite, rise: '畫面', region: place }.
  // =================================================================================================
  const FOG = [
    { ids: ['xd_atu_watch'], sprite: 'miner', ghost: true, sfx: 'bell', lines: [['atu:smile', '少年仔，錶仔我有顧好！這段路，換阿伯共你照！']] },
    { ids: ['xd_ahuang', 'lantern_ahuang'], sprite: 'child_m', living: true, extra: 'dog', lines: [['xiaojin:smile', '星河哥哥——阿黃說要跟你講加油！'], ['阿黃', '汪！']] },
    { ids: ['xd_woodcutter'], sprite: 'woodcutter', living: true, lines: [['樵夫', '迷過路的人最知道——黑暗裡有一盞燈，有多重。']] },
    { ids: ['xd_letter', 'lantern_pingxi_letter'], sprite: 'old_f', living: true, lines: [['平溪的阿婆', '天燈會飛，是因為底下有人點火。孩子，飛吧。']] },
    { ids: ['lantern_tamsui_soldiers'], sprite: 'soldier', ghost: true, lines: [['年輕鼓手', '我們找到回家的海了。這一次，換我們替你們看海。']], emote: '✦' },
    { ids: ['lantern_alian'], sprite: 'boatman', ghost: true, lines: [['阿德', '多謝你們。……阿蓮的碗粿，今年有少放鹽喔。']] },
    { ids: ['lantern_xiaomei'], sprite: 'ghost_child', ghost: true, extra: 'ghost_f', lines: [['小梅', '大哥哥！我牽著阿母的手喔！你看——']] },
    { ids: ['lantern_yizigu'], sprite: 'actress', ghost: true, lines: [['椅仔姑', '這齣戲，我陪你們唱到落幕。']] },
    { ids: ['lantern_feud'], sprite: 'old_m', ghost: true, extra: 'old_m', lines: [['兩個老人', '……兩个人，一枝槳，同船過溝！']] },
    { ids: ['lantern_yimin'], sprite: 'hakka_m', ghost: true, lines: [['阿松', '𠊎有名咧！今暗晡，𠊎同你兜守這條路！']] },
    { ids: ['lantern_mifen_mother'], sprite: 'hakka_f', ghost: true, lines: [['阿順伯的阿母', '阿順仔……轉來食飯喔——'], ['阿順伯的阿母', '替我共阿順講，米粉，阿母有食著。']] },
    { ids: ['lantern_fubo'], sprite: 'servant_old', ghost: true, lines: [['福伯', '小姐……老奴來給小姐掌燈了。'], ['hongying:cry', '福伯……！']] },
    { ids: ['lantern_halfwell'], sprite: 'noble_m', ghost: true, lines: [['王老太爺', '一半給出去，不是少了一半。是同一口水。']] },
    { ids: ['lantern_linto'], sprite: 'linto', ghost: true, lines: [['linto:smile', '我已經不恨了。所以，我還剩一點光，可以借你們。']] },
    { ids: ['lantern_yanshui'], sprite: 'old_f', ghost: true, lines: [['阿義的阿母', '這次有說再見喔。……你們也要好好說再見。']] },
    { ids: ['ch7_heartlamp_tsou'], kind: 'mountain', lines: [['', '霧的東方極遠處，阿里山的方向，雲海之上有一點光亮了一下。'], ['yungui:think', '……那是塔山。他們有自己的山。山也在看著我們。']] },
    { ids: ['ch7_heartlamp_murals'], kind: 'murals', sprite: 'ghost_m', ghost: true, lines: [['', '壁畫上的人影，一個一個從霧中走過，都提著燈。其中有一個少年的背影，很像星河。']] },
    { ids: ['ch8_heartlamp_pilgrims'], sprite: 'pilgrim', living: true, lines: [['進香的阿姨', '阮有替恁跋桮問媽祖——三个聖桮！一路順風！']] },
    { ids: ['ch8_heartlamp_oyster'], sprite: 'fisherman', ghost: true, lines: [['阿嬤的尪', '阮某煮的虱目魚粥，我後來有食著喔。']] },
    { ids: ['xd_banpingshan'], sprite: 'merchant', living: true, lines: [['金萬', '白拿的，吃不飽。人家請的，才吃得飽。……這次，我請你們。']] },
    { ids: ['xd_yueqin_names'], sprite: 'yueqin_singer', ghost: true, extra: 'ghost_m', sfx: 'sing', lines: [['', '月琴聲，遠遠地傳來。'], ['七個聲音', '陳水生。黃阿九。林添福。阿財仔……'], ['七個聲音', '我們的名字，有人唱了。']] },
    { ids: ['xd_lighthouse_home'], sprite: 'lighthouse_keeper', ghost: true, lines: [['湯姆', 'Boy！告訴她——不用燒掉自己。分出去就好！']] },
    { ids: ['xd_tao_tatala'], kind: 'eye', lines: [['', '船頭的船眼護符亮了起來，像一隻睜開的眼睛，穩穩地看著前方。'], ['記憶中的聲音', '看不到路的時候，它幫你看。']] },
    { ids: ['xd_amis_haiji'], sprite: 'amis_elder', living: true, lines: [['長老', '海是大家的。願你們平安回到岸上。']] },
    { ids: ['xd_luohanjiao'], sprite: 'villager_m', ghost: true, lines: [['阿義', '少年仔！你寫的名字，我一路帶著！']] },
    { ids: ['lantern_penghu_weir'], sprite: 'c11_ayong', ghost: true, lines: [['阿湧', '阮阿兄叫我來的！滬仔有留縫，我才游會出來！']] },
    { ids: ['lantern_tangshan'], sprite: 'c11_amu_old', ghost: true, lines: [['阿木伯', '阮嘛來！少年仔，阮這世人頭一擺，照人的路！']] },
  ];
  const RISE = [
    { place: 'jiufen', always: true, text: '九份。陳記燈籠舖的屋簷下，一盞燈籠自己亮了。豎崎路上，阿柑姨推開窗，在門口多點了一盞燈。', voice: ['agan:think', '……奇怪，今暗哪會想欲點燈？'] },
    { place: 'jiufen', ids: ['xd_atu_watch'], text: '舊金礦坑口，一盞礦燈亮起。', voice: ['atu:smile', '少年仔，錶仔閣咧行喔！'] },
    { place: 'jiufen', ids: ['xd_ahuang', 'lantern_ahuang'], text: '小金抱著阿黃，把一盞小燈籠舉得高高的。', voice: ['xiaojin:laugh', '阿黃，你看！天上有好多燈！'] },
    { place: 'pingxi', ids: ['xd_woodcutter', 'xd_letter', 'lantern_pingxi_letter'], text: '平溪的山谷裡，一盞天燈緩緩升空。老夫婦相扶著，仰頭望著。', voice: ['平溪的阿公', '天燈，本來就是報平安的。……孩子們，平安了，回來吧。'] },
    { place: 'tamsui', ids: ['lantern_tamsui_soldiers'], text: '紅毛城的城牆上，亮起一盞外國式樣的提燈。遠遠的，一聲鼓。' },
    { place: 'bangka', ids: ['lantern_alian', 'lantern_xiaomei', 'lantern_yizigu', 'lantern_feud'], text: '龍山寺前的河邊，阿蓮捧著一盞燈。戲班的戲台上，所有的燈同時亮起。', voice: ['alian:smile', '阿德，你看。有人在替你們點燈。'] },
    { place: 'hsinchu', ids: ['lantern_yimin'], text: '伙房的門前，阿姆們點起燈籠；一段山歌遠遠地傳過山頭——這一次，有人回了歌。', voice: ['滿妹婆', '阿松，有人回你咧。'] },
    { place: 'hsinchu', ids: ['lantern_mifen_mother'], text: '竹塹的海邊，阿順伯在米粉架下點了一盞燈，面向西邊的海。', voice: ['阿順伯', '阿母，食飯喔。'] },
    { place: 'lukang', ids: ['lantern_fubo', 'lantern_halfwell'], text: '洛家古厝的門前，掛起了一盞寫著「洛」字的燈籠——是半邊井的鄰居們掛的。', voice: ['半邊井的鄰居', '洛家的燈，總要有人點。'] },
    { place: 'tainan', ids: ['lantern_linto'], text: '林投林的海邊，一盞燈在林投葉之間亮起。那是溫暖的顏色。', voice: ['linto:smile', '……我也還有光。'] },
    { place: 'yanshui', ids: ['lantern_yanshui'], text: '鹽水的武廟前，扛轎的阿義不知道為什麼，抬頭看著西邊的天空。', voice: ['阿義', '……阿母？'] },
    { place: 'alishan', ids: ['ch7_heartlamp_tsou'], text: '阿里山的方向，雲海之上，塔山也亮著。那不是為彼岸燈而亮的光——那是山自己的光。但它照到了海上。' },
    { place: 'sunmoon', ids: ['ch7_heartlamp_murals'], text: '日月潭的霧裡，燈母祠的壁畫一幅一幅亮起；畫中歷代渡海的人，都舉起了燈。', voice: ['yungui:think', '……那最後一幅空白的，畫上了。'] },
    { place: 'beigang', ids: ['ch8_heartlamp_pilgrims'], text: '北港的廟埕前，進香的人們舉起了手中的燈。', voice: ['進香的阿姨', '媽祖婆，保庇彼幾个囡仔！'] },
    { place: 'tainan', ids: ['ch8_heartlamp_oyster'], text: '安平的海邊，蚵殼阿嬤把一碗熱熱的虱目魚粥，放在那顆石頭上。', voice: ['蚵殼阿嬤', '……這碗，請你們。'] },
    { place: 'hengchun', ids: ['xd_banpingshan', 'xd_yueqin_names'], text: '恆春的城門下，老人撥起月琴。歌裡的每一個名字，都變成了一盞燈。' },
    { place: 'eluanbi', always: true, text: '鵝鑾鼻的燈塔，燈光掃過海面，在最西邊停了一瞬。', voiceIf: ['xd_lighthouse_home', ['阿目', '燈要擦乾淨，船才看得到！']] },
    { place: 'orchid', ids: ['xd_tao_tatala'], text: '蘭嶼的沙灘上，一艘新的拼板舟靜靜躺著。船頭的眼睛，在晨光前閃了一下。' },
    { place: 'taitung', ids: ['xd_amis_haiji'], text: '東海岸，一位阿美族的老人站在海邊，望著西方的天空，舉起手，像在向遠方的朋友打招呼。', voice: ['長老', '海是大家的。去吧，回到岸上來。'] },
    { place: 'toucheng', always: true, text: '頭城的孤棚上，搶孤的年輕人們不知道為什麼，全都抬頭看著西邊。王船的順風旗，發出了金色的光。', voice: ['阿坤', '……旗子在笑耶。'] },
    { place: 'toucheng', ids: ['xd_luohanjiao'], text: '燈篙上，那盞寫著「阿義」的燈籠，亮得比旁邊的燈都亮。' },
    { place: 'penghu', always: true, text: '媽宮的天后宮，神前的油燈亮得像一顆星。', voice: ['阿進伯', '媽祖婆，伊等欲轉來矣。'] },
    { place: 'penghu', ids: ['lantern_penghu_weir'], text: '添家滬的缺口，一條光的小溪，流向西方。', voice: ['阿添伯', '阿湧，去吧。'] },
    { place: 'farshore', ids: ['lantern_tangshan'], text: '小渡口旁，阿木和阿娘牽著手，各舉著一盞燈。', voice: ['少年阿木', '阿娘，燈欲光矣！'] },
    { place: 'farshore', always: true, text: '萬魂窟放出來的魂、烏鬚船主和海盜們，在海面上排成一條燈的路。', voice: ['烏鬚船主', '小的們！照路！'] },
    { place: 'farshore', ids: ['lantern_baizhi_memory'], text: '芋圓、天燈、紫色的粥、芋圓的肚子、土地公廟、下雨的石階——六盞記憶的燈，從白芷自己的胸口浮起。', voice: ['baizhi:cry', '……原來，我自己也是一盞。'] },
  ];
  // expose for other chapters (their own entries win)
  G.Data.lanternCameo = G.Data.lanternCameo || {};
  const knownIds = new Set([...FOG.flatMap((f) => f.ids), ...RISE.flatMap((r) => r.ids || [])]);
  const hasAny = (ids) => (ids || []).some((id) => G.Lanterns.has(id));
  // lanterns we have no scripted cameo for (other chapters' additions), in the order they were lit
  function extraLanterns() {
    const L0 = G.state.lanterns || {};
    return Object.keys(L0).filter((id) => !knownIds.has(id)).sort((a, b) => (L0[a].time || 0) - (L0[b].time || 0)).map((id) => ({ id, name: L0[id].name || id, c: G.Data.lanternCameo[id] }));
  }

  // =================================================================================================
  // custom full-screen scenes
  // =================================================================================================
  const R = () => G.Render;
  function waitScene(sc) { G.Dialog.close(); return new Promise((res) => { sc.res = res; G.Scenes.push(sc); }); }
  function wrapText(ctx, text, maxW, size) { ctx.save(); ctx.font = G.font(size); const l = G.Render.wrap(ctx, text, maxW); ctx.restore(); return l; }

  // ---- paper / letter / wall-writing card. pages: [[line|{text, strike:['別']}], ...]
  class PaperScene {
    constructor(o) {
      this.o = o; this.t = 0; this.page = 0; this.pt = 0; this.opaque = false;
      this.pages = o.pages || [o.lines || []];
    }
    update(dt) {
      this.t += dt; this.pt += dt;
      const I = G.Input;
      const go = autoplay() ? this.pt > 0.05 : (this.pt > 0.5 && (I.pressed('ok') || I.clicked())) || (I.held('skip') && this.pt > 0.15);
      if (go) {
        if (this.page < this.pages.length - 1) { this.page++; this.pt = 0; G.Audio.sfx('text'); }
        else { G.Scenes.pop(this); this.res(); }
      }
    }
    draw(ctx) {
      const o = this.o, t = this.t;
      const a = Math.min(1, this.t * 3);
      ctx.save();
      ctx.globalAlpha = a * 0.78; ctx.fillStyle = '#04050b'; ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = a;
      const wall = o.kind === 'wall';
      const w = o.w || 760, h = o.h || 500, x = (G.W - w) / 2, y = (G.H - h) / 2 - 10;
      if (wall) {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#d8d2c2'); g.addColorStop(1, '#a8a294');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(60,50,40,0.12)';
        for (let i = 0; i < 90; i++) { const px = x + U.hash(i, 3, 5) * w, py = y + U.hash(i, 9, 5) * h; ctx.fillRect(px, py, 2 + U.hash(i, 1, 2) * 5, 1.5); }
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30;
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, '#f6ecd2'); g.addColorStop(1, '#e2d2ac');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.strokeStyle = 'rgba(150,110,60,0.35)'; ctx.lineWidth = 1;
        for (let ly = y + 70; ly < y + h - 30; ly += 46) { ctx.beginPath(); ctx.moveTo(x + 40, ly + 32); ctx.lineTo(x + w - 40, ly + 32); ctx.stroke(); }
        if (o.lantern) G.UI.lanternIcon(ctx, x + w - 46, y + 44, 12, t);
      }
      if (o.portrait && G.Portraits.has(o.portrait)) {
        ctx.save(); ctx.globalAlpha = a * 0.92;
        G.Portraits.draw(ctx, o.portrait, o.expr || 'normal', x - 250, y + h - 330, 280, 320, t, {});
        ctx.restore();
      }
      if (o.title) R().text(ctx, o.title, x + 40, y + 24, { size: 22, color: wall ? '#3a3028' : '#7a4a20', shadow: false });
      const lines = this.pages[this.page] || [];
      let ly = y + (o.title ? 76 : 56);
      const size = o.size || (wall ? 34 : 27);
      for (const ln of lines) {
        const text = typeof ln === 'string' ? ln : ln.text;
        const col = wall ? '#1e1814' : '#2a2018';
        const wl = wrapText(ctx, text, w - 90, size);
        for (const gl of wl) {
          ctx.save(); ctx.font = G.font(size); ctx.textBaseline = 'top';
          G.Render.drawLines(ctx, [gl], x + 44, ly, size + 14, col, Infinity, false);
          ctx.restore();
          ly += size + 18;
        }
        // strike-through marks (zh only — positions are found by glyph)
        if (ln && typeof ln === 'object' && Array.isArray(ln.strike) && G.T(text) === text) {
          ctx.save(); ctx.font = G.font(size);
          const chars = [...text];
          let cx = x + 44;
          const yy = ly - (size + 18) + size * 0.55;
          for (let i = 0; i < chars.length; i++) {
            const cw = ctx.measureText(chars[i]).width;
            if (ln.strike.includes(chars[i])) {
              ctx.strokeStyle = 'rgba(20,14,10,0.9)'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
              for (let k = 0; k < 12; k++) {
                const jy = (U.hash(i, k, 7) - 0.5) * size * 0.7;
                ctx.beginPath(); ctx.moveTo(cx - 3, yy + jy); ctx.lineTo(cx + cw + 3, yy + jy + (U.hash(k, i, 2) - 0.5) * 8); ctx.stroke();
              }
            }
            cx += cw;
          }
          ctx.restore();
        }
      }
      if (this.pages.length > 1) R().text(ctx, `${this.page + 1} / ${this.pages.length}`, x + w - 40, y + h - 36, { size: 16, align: 'right', color: '#8a7050', shadow: false });
      if (this.pt > 0.5) G.UI.lanternIcon(ctx, x + w - 30, y + h - 18 + Math.sin(t * 5) * 3, 7, t);
      ctx.restore();
    }
  }
  const paper = (o) => waitScene(new PaperScene(o));

  // ---- postcards (E-T7): [{from, pic, text}]
  class CardsScene {
    constructor(cards) { this.cards = cards; this.i = 0; this.pt = 0; this.t = 0; this.opaque = true; }
    update(dt) {
      this.t += dt; this.pt += dt;
      const I = G.Input;
      const go = autoplay() ? this.pt > 0.05 : (this.pt > 0.6 && (I.pressed('ok') || I.clicked())) || (I.held('skip') && this.pt > 0.2);
      if (go) { this.i++; this.pt = 0; G.Audio.sfx('text'); if (this.i >= this.cards.length) { G.Scenes.pop(this); this.res(); } }
    }
    draw(ctx) {
      const c = this.cards[Math.min(this.i, this.cards.length - 1)];
      const t = this.t;
      ctx.fillStyle = '#2a1e16'; ctx.fillRect(0, 0, G.W, G.H);
      // wooden counter
      ctx.fillStyle = 'rgba(255,220,160,0.05)';
      for (let i = 0; i < 14; i++) ctx.fillRect(0, i * 52 + 10, G.W, 2);
      const k = U.ease.outCubic(Math.min(1, this.pt * 3));
      const x = 140, y = 110 + (1 - k) * 40, w = 1000, h = 470;
      ctx.save(); ctx.globalAlpha = k; ctx.translate(x + w / 2, y + h / 2); ctx.rotate((U.hash(this.i, 1, 3) - 0.5) * 0.04); ctx.translate(-x - w / 2, -y - h / 2);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#f4ead2'; ctx.fillRect(x, y, w, h);
      ctx.shadowBlur = 0;
      // illustration (mini backdrop)
      const pw = 420, ph = 380, px = x + 26, py = y + 45;
      ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
      ctx.translate(px, py); ctx.scale(pw / G.W * 1.5, ph / G.H); ctx.translate(-G.W * 0.16, 0);
      try { G.Backdrops.draw(ctx, c.pic, t * 0.3); } catch (e) { G.warnOnce && G.warnOnce('backdrop ' + c.pic, e); }
      ctx.restore();
      ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, ph);
      // stamp
      ctx.strokeStyle = 'rgba(180,40,30,0.7)'; ctx.lineWidth = 3; ctx.strokeRect(x + w - 110, y + 30, 70, 84);
      G.UI.lanternIcon(ctx, x + w - 75, y + 72, 12, t);
      R().text(ctx, c.from, px + pw + 40, y + 50, { size: 26, color: '#7a3a20', shadow: false });
      const lines = wrapText(ctx, c.text, w - pw - 110, 25);
      ctx.save(); ctx.font = G.font(25); ctx.textBaseline = 'top';
      G.Render.drawLines(ctx, lines, px + pw + 40, y + 110, 40, '#2a2018', Infinity, false);
      ctx.restore();
      ctx.restore();
      R().text(ctx, `${this.i + 1} / ${this.cards.length}`, G.W - 60, G.H - 50, { size: 18, align: 'right', color: '#c9b893' });
    }
  }

  // ---- 一口氣 (11-24): hold OK to breathe in, release to let go
  class BreathScene {
    constructor() { this.t = 0; this.k = 0; this.phase = 'in'; this.hint = 0; this.opaque = false; this.cap = -1; this.fails = 0; }
    update(dt) {
      this.t += dt;
      const held = G.Input.held('ok');
      if (autoplay()) { if (this.t > 0.1) { G.Scenes.pop(this); this.res(true); } return; }
      if (this.phase === 'in') {
        if (held) this.k = Math.min(1, this.k + dt / 3);
        else if (this.k > 0 && this.k < 1) { this.k = Math.max(0, this.k - dt * 1.4); if (this.k <= 0.02 && !this.hintT) { this.hintT = 2.5; this.fails++; } }
        if (this.hintT > 0) this.hintT -= dt;
        if (this.k >= 1) { this.phase = 'hold'; this.ht = 0; G.Audio.sfx('bell'); }
      } else if (this.phase === 'hold') {
        this.ht += dt;
        if (!held && this.ht > 0.2) { this.phase = 'out'; this.ot = 0; G.Audio.sfx('lantern'); }
      } else {
        this.ot += dt;
        if (this.ot > 1.6) { G.Scenes.pop(this); this.res(true); }
      }
    }
    draw(ctx) {
      const t = this.t;
      ctx.save();
      ctx.fillStyle = 'rgba(2,3,10,0.82)'; ctx.fillRect(0, 0, G.W, G.H);
      const cx = G.W / 2, cy = G.H / 2 - 20;
      const r = 40 + this.k * 170;
      const pulse = 1 + Math.sin(t * 2) * 0.02;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6 * pulse);
      g.addColorStop(0, `rgba(255,240,200,${0.25 + 0.4 * this.k})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,240,210,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,210,0.25)'; ctx.beginPath(); ctx.arc(cx, cy, 210, 0, Math.PI * 2); ctx.stroke();
      // captions while breathing in
      const caps = [['hongying', '九份的芋圓……平溪的天燈……'], ['yungui', '艋舺的戲……竹塹的風……阿里山的雲……'], ['xinghe', '……白芷。']];
      const n = this.phase === 'in' ? Math.floor(this.k * 3.2) : 3;
      for (let i = 0; i < Math.min(n, 3); i++) {
        const [id, line] = caps[i];
        const a = this.phase === 'in' ? U.clamp((this.k * 3.2 - i) * 2, 0, 1) : 1;
        R().text(ctx, G.ShortNames[id] || G.Names[id], cx - 250, 74 + i * 46, { size: 20, align: 'right', color: '#ffcf8a', alpha: a });
        R().text(ctx, line, cx - 230, 70 + i * 46, { size: 25, color: i === 2 ? '#ffe6a8' : '#e8dcc0', alpha: a });
      }
      if (this.phase === 'in') {
        R().text(ctx, '按住【確認】吸氣', cx, G.H - 140, { size: 28, align: 'center', color: '#fff0d0' });
        if (this.hintT > 0) R().text(ctx, '雲歸：「慢一點。不急。一路走來的東西，很多。」', cx, G.H - 96, { size: 22, align: 'center', color: '#c9e0c0' });
      } else if (this.phase === 'hold') {
        R().text(ctx, '雲歸：「——放手。」', cx, G.H - 180, { size: 26, align: 'center', color: '#c9e0c0' });
        R().text(ctx, '放開【確認】', cx, G.H - 140, { size: 28, align: 'center', color: '#fff0d0', alpha: 0.6 + 0.4 * Math.sin(t * 5) });
      } else {
        const k = Math.min(1, this.ot / 1.4);
        ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(0, 0, G.W, G.H);
      }
      ctx.restore();
    }
  }

  // ---- full-screen vignette (CG) with figures; dialogue is shown on top with S.say
  class Vignette {
    constructor(o) { this.o = o; this.t = 0; this.opaque = true; }
    update(dt) { this.t += dt; }
    draw(ctx) {
      const o = this.o, t = this.t;
      try { G.Backdrops.draw(ctx, o.bg, t); } catch (e) { G.warnOnce && G.warnOnce('backdrop ' + o.bg, e); }
      if (o.tint) { ctx.save(); ctx.globalCompositeOperation = o.tintMode || 'soft-light'; ctx.fillStyle = o.tint; ctx.fillRect(0, 0, G.W, G.H); ctx.restore(); }
      if (o.dark) { ctx.fillStyle = `rgba(0,0,10,${o.dark})`; ctx.fillRect(0, 0, G.W, G.H); }
      for (const f of o.figures || []) {
        if (f.hidden) continue;
        try {
          if (f.pet) G.Sprites.drawChar(ctx, f.sprite, f.flip ? 'right' : 'left', 0, f.x, f.y, { alpha: f.alpha, scale: f.scale || 3 });
          else G.Sprites.drawBattle(ctx, f.sprite, f.pose || 'idle', t, f.x, f.y, { flip: !!f.flip, alpha: f.alpha, ghost: f.ghost, scale: f.scale });
        } catch (e) { G.warnOnce && G.warnOnce('vignette ' + f.sprite, e); }
      }
      if (o.draw) o.draw(ctx, t);
      G.FX.vignette(ctx, 0.5);
      if (o.caption) R().text(ctx, o.caption, 44, 34, { size: 24, color: '#fbeec8', glow: 'rgba(255,190,100,0.5)', glowBlur: 12 });
    }
  }
  async function cg(S, o, fn) {
    const sc = new Vignette(o);
    await S.fadeOut(0.5);
    G.Scenes.push(sc);
    await S.fadeIn(0.6);
    await fn(sc);
    await S.fadeOut(0.6);
    G.Scenes.pop(sc);
    G.Dialog.close();
  }

  // ---- E-T1 全島的燈 / E-N1 遠遠的幾點光
  class IslandScene {
    constructor(o) {
      this.o = o; this.t = 0; this.opaque = true; this.i = -1; this.it = 0; this.parts = []; this.lit = [];
      this.box = { x: 0, y: 0, w: G.W, h: G.H, ox: 300, oy: -20, s: 0.95 };
      this.list = o.list;
      this.end = 0;
    }
    pt(place) { const p = G.World.PLACES[place] || G.World.PLACES.jiufen; return G.World.proj(p[0], p[1], { x: this.box.x + this.box.ox, y: this.box.y + this.box.oy, s: this.box.s }); }
    update(dt) {
      this.t += dt; this.it += dt;
      const I = G.Input;
      const step = this.o.normal ? 0.6 : 2.6;
      const fast = autoplay() || I.held('skip');
      if (this.i < this.list.length) {
        if (this.i < 0 ? this.it > 1.2 : (this.it > (fast ? 0.08 : step) || (this.it > 0.5 && (I.pressed('ok') || I.clicked())))) {
          this.i++; this.it = 0;
          if (this.i < this.list.length) { const r = this.list[this.i]; this.lit.push({ place: r.place, t: this.t }); if (!this.o.normal) G.Audio.sfx('lantern'); }
        }
      } else {
        this.end += dt;
        if (this.end > (fast ? 0.1 : this.o.normal ? 3.2 : 5.2)) { G.Scenes.pop(this); this.res(); return; }
      }
      // particles rising from lit places
      for (const l of this.lit) {
        const n = this.o.normal ? 0.6 : 2.2;
        if (Math.random() < n * dt * 6) {
          const [x, y] = this.pt(l.place);
          this.parts.push({ x: x + U.rand(-6, 6), y, vx: U.rand(-8, 8), vy: U.rand(-60, -25), life: U.rand(2.5, 4.5), t: 0, west: false });
        }
      }
      const [wx, wy] = this.pt('farshore');
      for (const p of this.parts) {
        p.t += dt;
        if (this.i >= this.list.length && !this.o.normal) { p.vx += ((wx - p.x) * 0.9 - p.vx) * dt * 1.2; p.vy += ((wy - 60 - p.y) * 0.9 - p.vy) * dt * 1.2; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      this.parts = this.parts.filter((p) => p.t < p.life);
    }
    draw(ctx) {
      const t = this.t;
      G.World.drawMap(ctx, this.box, t, {});
      const dawn = this.o.normal ? 0 : Math.min(1, Math.max(0, this.i) / Math.max(1, this.list.length));
      ctx.fillStyle = `rgba(2,4,14,${0.72 - dawn * 0.35})`; ctx.fillRect(0, 0, G.W, G.H);
      const sky = ctx.createLinearGradient(G.W, 0, G.W - 500, 0);
      sky.addColorStop(0, `rgba(255,200,150,${0.08 + dawn * 0.18})`); sky.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, G.W, G.H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lit) {
        const [x, y] = this.pt(l.place);
        const a = Math.min(1, (t - l.t) * 2);
        ctx.globalAlpha = a; ctx.drawImage(G.FX.glowSprite('#ffc070'), x - 26, y - 26, 52, 52);
      }
      for (const p of this.parts) {
        ctx.globalAlpha = Math.min(1, p.t * 2, (p.life - p.t)); ctx.drawImage(G.FX.glowSprite('#ffd890'), p.x - 7, p.y - 7, 14, 14);
      }
      // far shore light
      const [wx, wy] = this.pt('farshore');
      const fin = this.i >= this.list.length ? Math.min(1, this.end / 3) : 0;
      ctx.globalAlpha = 0.4 + fin * 0.6; const rr = 30 + fin * 140 * (this.o.normal ? 0.3 : 1);
      ctx.drawImage(G.FX.glowSprite('#fff4dc'), wx - rr, wy - 60 - rr, rr * 2, rr * 2);
      ctx.restore();
      // 鯤化為鵬 — a great bird sweeps east→west carrying the lights
      if (!this.o.normal && this.i >= this.list.length) {
        const k = Math.min(1, this.end / 3.6);
        const bx = G.W + 200 - k * (G.W + 600), by = 230 - Math.sin(k * Math.PI) * 120;
        ctx.save(); ctx.translate(bx, by); ctx.scale(1.6, 1.6);
        const flap = Math.sin(t * 5) * 0.35;
        ctx.fillStyle = 'rgba(16,20,40,0.85)';
        ctx.beginPath(); ctx.moveTo(-60, 0); ctx.quadraticCurveTo(0, -10, 70, 4); ctx.quadraticCurveTo(0, 14, -60, 0); ctx.fill();
        for (const sgn of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(10, sgn * (60 + flap * 60), 60, sgn * (120 + flap * 50)); ctx.quadraticCurveTo(40, sgn * 40, 30, 0); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; ctx.drawImage(G.FX.glowSprite('#ffd890'), Math.cos(a) * 50 - 6, Math.sin(a) * 30 - 6 - 20, 12, 12); }
        ctx.restore();
      }
      // caption
      const cur = this.list[this.i];
      if (cur && !this.o.normal) {
        const a = Math.min(1, this.it * 3);
        ctx.save(); ctx.globalAlpha = a;
        G.UI.plate(ctx, 80, G.H - 168, G.W - 160, 136, 0.72, 14);
        const tl = wrapText(ctx, cur.text, G.W - 220, 22);
        ctx.font = G.font(22); ctx.textBaseline = 'top';
        G.Render.drawLines(ctx, tl.slice(0, 2), 110, G.H - 152, 32, '#f6ead0');
        if (cur.voice) {
          const who = cur.voice[0].split(':')[0];
          const nm = G.Names[who] ? (G.ShortNames[who] || G.Names[who]) : who;
          if (nm) R().text(ctx, nm, 110, G.H - 82, { size: 20, color: '#ffcf8a' });
          R().text(ctx, cur.voice[1], 110 + (nm ? 130 : 0), G.H - 82, { size: 22, color: '#fff3d8' });
        }
        ctx.restore();
      } else if (this.o.normal && this.o.caption) {
        R().text(ctx, this.o.caption, G.W / 2, G.H - 110, { size: 24, align: 'center', color: '#e8dcc0' });
      }
      G.FX.vignette(ctx, 0.5);
    }
  }

  // =================================================================================================
  // battle hook helpers (all story rules are installed per battle through the documented hooks)
  // =================================================================================================
  function hookB(b, name, fn) { const orig = b[name].bind(b); b[name] = function (...a) { return fn(orig, ...a); }; }
  async function bLines(b, arr) { for (const l of arr) await G.Dialog.say(l[0], l[1]); G.Dialog.close(); }
  const foe = (b, id) => b.enemies.find((e) => e.id === id && !e.dead);
  const pal = (b, id) => b.party.find((p) => p.id === id);
  function healPct(b, u, k) { if (!u.dead) b.healUnit(u, Math.round(u.mhp * k)); }
  // one big swarm of lanterns for 千燈 (particles = 200 + 40 × 心燈)
  class QiandengFx {
    constructor(n) {
      this.t = 0; this.parts = [];
      n = Math.min(1400, n);
      for (let i = 0; i < n; i++) this.parts.push({ x: U.rand(700, 1250), y: U.rand(560, 760), tx: U.rand(80, 620), ty: U.rand(260, 560), d: U.rand(0, 0.8), s: U.rand(0.4, 1.1), c: U.pick(['#ffd890', '#ffb060', '#fff2c8', '#ff9a6a']) });
    }
    update(dt) { this.t += dt; return this.t < 2.6; }
    draw(ctx) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const p of this.parts) {
        const k = U.clamp((this.t - p.d) / 1.4, 0, 1);
        if (k <= 0) continue;
        const e = U.ease.inOutQuad ? U.ease.inOutQuad(k) : k;
        const x = U.lerp(p.x, p.tx, e), y = U.lerp(p.y, p.ty, e) - Math.sin(k * Math.PI) * 180;
        ctx.globalAlpha = Math.min(1, (2.6 - this.t) * 2);
        const r = 10 * p.s;
        ctx.drawImage(G.FX.glowSprite(p.c), x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  }

  // =================================================================================================
  // shared map visuals
  // =================================================================================================
  // 北斗 in the screen corner: frozen before 11-10, turning one notch per big beat after (vars.ch11_moon).
  function drawDipper(ctx, t) {
    if (!F('ch11_start') || F('ch11_done')) return;
    const moving = F('ch11_night_moves');
    const ang = (V().ch11_moon || 0) * 0.2;
    ctx.save();
    ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
    const cx = 64, cy = G.H - 112;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(8,12,30,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,230,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    const S7 = [[-26, 10], [-12, 14], [-2, 6], [10, 0], [16, -12], [30, -10], [34, 4]];
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(200,215,255,0.35)'; ctx.beginPath();
    S7.forEach(([x, y], i) => (i ? ctx.lineTo(x * 0.9, y * 0.9) : ctx.moveTo(x * 0.9, y * 0.9))); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    S7.forEach(([x, y], i) => { const tw = moving ? 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7) : 1; ctx.globalAlpha = tw; ctx.drawImage(G.FX.glowSprite('#e8f0ff'), x * 0.9 - 6, y * 0.9 - 6, 12, 12); });
    ctx.restore();
  }
  // drifting soul-lights on the sea (world space)
  function drawSeaLights(ctx, t, ms, n, col, frozen) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = U.hash(i, 1, 41) * ms.w * T, by = U.hash(i, 2, 41) * ms.h * T;
      const sp = frozen ? 0 : 6;
      const x = (bx + Math.sin(t * 0.5 + i) * 10 - t * sp + ms.w * T * 4) % (ms.w * T), y = by + Math.cos(t * 0.7 + i * 2) * 6;
      const c = Math.floor(y / T) * ms.w + Math.floor(x / T);
      const tt = ms.terrain[c];
      if (tt !== 'black_sea' && tt !== 'water' && tt !== 'deepwater') continue;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 2 + i);
      ctx.drawImage(G.FX.glowSprite(col), x - 10, y - 10, 20, 20);
    }
    ctx.restore();
  }

  // =================================================================================================
  // MAP: wangboat_blacktide 王船・甲板 (28×16)
  // =================================================================================================
  const DECK = 'wangboat_blacktide';
  const leg = (st) => (st || G.state).vars.ch11_leg || 0;
  const docked = (st) => (st.flags.ch11_start && !st.flags.ch11_sail) || leg(st) >= 5;
  function seaChar(st) {
    if (!st.flags.ch11_start) return '~';
    if (!st.flags.ch11_jailer) return 's';
    if (!st.flags.ch11_sail) return '~';
    return leg(st) >= 5 ? '~' : 'K';
  }
  function deckTiles(st) {
    const g = grid(28, 16, seaChar(st));
    if (seaChar(st) === 's') { for (let y = 0; y < 16; y++) for (let x = 0; x < 28; x++) if (U.hash(x, y, 77) < 0.12) g[y][x] = '-'; }
    fill(g, 7, 4, 17, 1, 'd'); fill(g, 5, 5, 20, 1, 'd'); fill(g, 3, 6, 22, 4, 'd'); fill(g, 5, 10, 20, 1, 'd'); fill(g, 7, 11, 17, 1, 'd');
    if (docked(st)) fill(g, 25, 8, 3, 1, 'k');
    return rows(g);
  }
  function deckLight(st) {
    const l = leg(st);
    if (F('ending_normal') && st.vars.c11_dawn) return { ambient: 0.12, color: '#2a2030', tint: 'rgba(255,200,160,0.18)' };
    if (!st.flags.ch11_sail) return { ambient: 0.6, color: '#060a1e', playerR: 220 };
    if (l >= 5) return { ambient: 0.4, color: '#20102a', tint: 'rgba(255,170,120,0.16)', playerR: 220 };
    if (l === 4) return st.flags.ch11_fog ? { ambient: 0.45, color: '#0a0c1a', playerR: 240 } : { ambient: 0.9, color: '#02030a', playerR: 120 };
    return { ambient: 0.72, color: '#04060f', playerR: 220 };
  }
  G.Maps.define(DECK, {
    name: '王船・甲板',
    subtitle: (st) => (st.flags.ch11_sail ? (leg(st) >= 5 ? '彼岸・渡口' : '黑水溝') : '最後一夜'),
    place: 'penghu',
    bgm: (st) => (!st.flags.ch11_start ? 'voyage' : !st.flags.ch11_sail ? 'penghu' : leg(st) >= 5 ? 'farshore' : leg(st) === 4 ? (st.flags.ch11_fog ? 'farshore' : null) : 'sea'),
    start: [15, 8],
    light: deckLight,
    particles: (st) => (!st.flags.ch11_sail ? ['motes'] : leg(st) >= 5 ? ['petals', 'motes'] : leg(st) === 4 && !st.flags.ch11_fog ? [{ type: 'mist', density: 3, alpha: 0.3 }] : ['lanterns', 'mist']),
    tiles: deckTiles,
    objects: [
      { t: 'fence_wood', x: 7, y: 4, w: 17 }, { t: 'fence_wood', x: 7, y: 11, w: 17 },
      { t: 'fence_wood', x: 5, y: 5, w: 2 }, { t: 'fence_wood', x: 5, y: 10, w: 2 },
      { t: 'lamp_post', x: 4, y: 6, lit: false, interact: ['鵝鑾鼻燈塔分來的火。火很小，但很穩，好像有人一直在旁邊顧著。'], label: '調查' },
      { t: 'totem', x: 3, y: 9, interact: ['蘭嶼帶來的護符，刻著拼板舟船頭的眼睛紋樣。', '「看不到路的時候，它幫你看。」'], label: '調查' },
      { t: 'banner', x: 13, y: 7, color: '#f0c040', edge: '#c0312b', text: '順風',
        interact: async (S) => { if (F('ch11_start') && !F('ch11_night_moves')) await S.say('', '旗子垂著。沒有風。'); else await S.say('', '頭城孤棚頂搶落來的旗。布被汗與油浸得發亮。風一吹，整面旗像在笑。'); }, label: '調查' },
      { t: 'banner', x: 19, y: 7, color: '#c0312b', edge: '#f0c040', text: '王' },
      { t: 'altar', x: 21, y: 5, if: (st) => !!st.flags.ch11_tianhou, interact: ['小小的神龕裡掛著媽祖香火袋。燭火很穩。'], label: '參拜' },
      { t: 'stairs_down', x: 17, y: 9 },
      { t: 'barrel', x: 22, y: 10 }, { t: 'barrel', x: 23, y: 10 }, { t: 'crate', x: 8, y: 10 }, { t: 'crate', x: 9, y: 10 }, { t: 'jar', x: 24, y: 6 },
      { t: 'red_lantern', x: 24, y: 9, text: '王' },
      // drifting lanterns on the black sea
      ...[[2, 2], [6, 13], [11, 1], [16, 14], [21, 2], [26, 12], [1, 11], [25, 1]].map(([x, y]) => ({ t: 'water_lantern', x, y, if: (st) => st.flags.ch11_sail && leg(st) >= 1 && leg(st) <= 3 })),
      { t: 'water_lantern', x: 5, y: 7, text: '木', if: (st) => st.flags.ch11_tangshan_letter && !st.flags.ch11_tangshan_done,
        interact: [['阿木伯', '阮佇遮坐，看會著前面。少年仔，免煩惱阮。']], label: '調查' },
    ],
    lights: (st) => {
      if (st.vars.ch11_dark) return [];
      const b = st.vars.ch11_bow == null ? 260 : st.vars.ch11_bow;
      const out = [];
      if (b > 0) out.push({ x: 4, y: 6, r: b, color: st.flags.ch11_fog ? '#fff2d0' : '#ffd98a', flicker: 0.25 });
      out.push({ x: 13, y: 6, r: 110, color: '#ffb060', flicker: 0.3 }, { x: 24, y: 8, r: 120, color: '#ff9050', flicker: 0.3 });
      if (st.flags.ch11_tianhou) out.push({ x: 21, y: 5, r: 90, color: '#ffcf7a', flicker: 0 });
      return out;
    },
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', x: 23, y: 8, dir: 'left', fixedDir: true, if: (st) => leg(st) < 5, talk: (S) => H.helm(S) },
      { id: 'deck_hy', sprite: 'hongying', x: 9, y: 6, dir: 'down', if: () => inParty('hongying'), talk: (S) => H.deckTalk(S, 'hongying') },
      { id: 'deck_yg', sprite: 'yungui', x: 7, y: 9, dir: 'right', if: () => inParty('yungui'), talk: (S) => H.deckTalk(S, 'yungui') },
      { id: 'deck_yy', sprite: 'yuyuan', x: 11, y: 9, dir: 'down', if: (st) => !!st.flags.yuyuan_joined, talk: (S) => H.deckTalk(S, 'yuyuan') },
      { id: 'deck_mc', sprite: 'mochi', x: 6, y: 7, dir: 'left', if: (st) => !!st.flags.mochi_joined, talk: (S) => H.deckTalk(S, 'mochi') },
    ],
    events: [
      { id: 'c11_01', trigger: 'auto', if: (st) => !st.flags.ch11_start && st.chapter === 11, run: (S) => H.c11_01(S) },
      { id: 'c11_12', trigger: 'auto', if: (st) => st.flags.ch11_sail && !st.flags.ch11_leg1, run: (S) => H.c11_12(S) },
      { id: 'save', trigger: 'action', x: 24, y: 9, label: '存檔', run: async (S) => { await S.saveMenu(); } },
    ],
    warps: [
      { x: 17, y: 9, to: 'wangboat_cabin11', tx: 7, ty: 6, tdir: 'up', door: true },
      { x: 27, y: 8, to: 'penghu_magong', tx: 11, ty: 7, tdir: 'right', if: (st) => st.flags.ch11_start && !st.flags.ch11_jailer && !st.flags.ch11_sail },
      { x: 27, y: 8, to: 'xuanwu_shore', tx: 28, ty: 36, tdir: 'left', if: (st) => st.flags.ch11_jailer && !st.flags.ch11_sail },
      { x: 27, y: 8, to: 'farshore_field', tx: 27, ty: 39, tdir: 'up', if: (st) => leg(st) >= 5 },
    ],
    onEnter: async (S) => { S.hideFollowers(true); },
    drawGround: (ctx, t, ms) => {
      const st = G.state;
      if (st.flags.ch11_sail && leg(st) <= 3) drawSeaLights(ctx, t, ms, 40, '#8fd8ff', !st.flags.ch11_night_moves);
      if (leg(st) >= 5) drawSeaLights(ctx, t, ms, 24, '#ff9a8a', false);
    },
    drawOver: (ctx, t) => drawDipper(ctx, t),
  });

  G.Maps.define('wangboat_cabin11', {
    name: '王船・船艙',
    bgm: (st) => (!st.flags.ch11_sail ? 'penghu' : leg(st) >= 5 ? 'farshore' : 'sea'),
    start: [7, 6],
    light: { ambient: 0.42, color: '#120a06', playerR: 180 },
    tiles: rows(room(14, 9, '_', 'W', [7])),
    objects: [
      { t: 'bed', x: 2, y: 2 }, { t: 'bed', x: 4, y: 2 },
      { t: 'jar', x: 11, y: 2, interact: [['chenbo:smug', '那罈是我的。不准偷喝。'], ['', '……陳伯的聲音從甲板上傳下來。']], label: '調查' },
      { t: 'workbench', x: 8, y: 2, interact: ['陳伯的燈籠工具：竹刀、糨糊、一疊紅紙。竹骨削得整整齊齊——七次。'], label: '調查' },
      { t: 'red_lantern', x: 7, y: 2, hang: true, text: '星', interact: ['九份陳記的式樣：紅紙、竹骨，一筆一筆寫著「沈星河」。', '陳伯說：沒有魂燈的人，由別人替他點一盞。'], label: '調查' },
      { t: 'lantern_rack', x: 10, y: 6 }, { t: 'rug', x: 5, y: 4, w: 3, h: 2 },
    ],
    lights: [{ x: 7, y: 3, r: 200, color: '#ffb060', flicker: 0.2 }],
    events: [
      { id: 'rest', trigger: 'action', x: 2, y: 2, w: 3, h: 2, label: '休息', run: async (S) => {
        const c = await S.choice(['休息一下（全員恢復）', '不用了'], { cancel: 1 });
        if (c !== 0) return;
        await S.fadeOut(0.8); G.Party.healAll(); S.sfx('heal'); await pause(S, 1.0); await S.fadeIn(0.8);
        S.toast('在搖晃的船艙裡睡了一會兒。全員完全恢復。', 'lantern');
        if (await S.choice(['存檔', '不用了'], { cancel: 1 }) === 0) await S.saveMenu();
      } },
    ],
    warps: [{ x: 7, y: 8, to: DECK, tx: 17, ty: 8, tdir: 'down', door: true }],
  });

  // =================================================================================================
  // MAP: penghu_magong 媽宮 (48×36)
  // =================================================================================================
  const stA = (st) => st.flags.ch11_magong && !st.flags.ch11_tianhou;
  const stC = (st) => !!st.flags.ch11_night_moves;
  const dawnPenghu = (st) => !!st.flags.ch11_done;
  function magongTiles(st) {
    const tide = dawnPenghu(st);
    const g = grid(48, 36, ':');
    // tidal flats (north & west). In the ending the tide is back.
    fill(g, 0, 0, 48, 3, 's'); fill(g, 0, 0, 11, 36, 's'); fill(g, 0, 34, 48, 2, 's');
    for (let y = 0; y < 36; y++) for (let x = 0; x < 48; x++) if (g[y][x] === 's' && U.hash(x, y, 31) < 0.14) g[y][x] = '-';
    if (tide) { for (let y = 0; y < 36; y++) for (let x = 0; x < 48; x++) if (g[y][x] === 's' || g[y][x] === '-') g[y][x] = (x < 11 && y > 2) || y < 2 ? '~' : '-'; }
    fill(g, 11, 3, 37, 1, '#');                   // seawall promenade
    fill(g, 3, 7, 9, 1, 'k');                     // pier
    fill(g, 15, 3, 2, 31, '#');                   // central street (中央街)
    fill(g, 11, 11, 34, 1, '#'); fill(g, 11, 20, 34, 1, '#'); fill(g, 11, 28, 34, 1, '#');
    fill(g, 20, 8, 12, 3, '%');                   // temple plaza (廟埕)
    fill(g, 24, 29, 3, 7, '#');                   // south road → 南口
    fill(g, 35, 5, 8, 4, 'f');                    // 菜宅 peanut field
    fill(g, 11, 4, 4, 7, ':');
    return rows(g);
  }
  const MG_OBJ = [
    { t: 'mazu_temple', x: 23, y: 4, door: 2, text: '天后宮' },
    { t: 'statue_lion', x: 21, y: 8 }, { t: 'statue_lion', x: 30, y: 8, flip: true },
    { t: 'wang_boat', x: 3, y: 4, if: (st) => !st.flags.ch11_jailer || (st.flags.ch11_done && !st.vars.c11_boat_gone) },
    { t: 'drying_rack', x: 18, y: 5, v: 0, interact: ['竹架上曬著丁香魚和小管。風停了，魚曬不乾。'], label: '調查' },
    { t: 'drying_rack', x: 18, y: 7, v: 0 },
    { t: 'signboard', x: 14, y: 10, text: '石敢當', interact: ['刻著「石敢當」三個字的石碑，立在路衝，擋煞。', '澎湖的風大，連煞都要有東西擋。'], label: '調查' },
    { t: 'signboard', x: 27, y: 32, text: '石敢當', interact: ['南口的石敢當。過了這裡，就是退乾的海床。'], label: '調查' },
    { t: 'shophouse', x: 17, y: 12, door: -1, text: '雜貨', v: 1 },
    { t: 'stall', x: 19, y: 16, text: '黑糖糕', counter: true },
    { t: 'shophouse', x: 25, y: 12, door: -1, text: '鐵舖', v: 2 },
    { t: 'house_minnan', x: 32, y: 12, text: '海口客棧', v: 1 },
    { t: 'stall', x: 13, y: 17, text: '代書', counter: true },
    { t: 'well', x: 22, y: 17, interact: ['一口井，四個井口。', '老人說，這樣四戶人家可以同時汲水，不用排隊，也不用吵架。'], label: '調查' },
    { t: 'house_minnan', x: 38, y: 22, v: 0 },
    { t: 'house_minnan', x: 18, y: 22, door: -1, v: 1 }, { t: 'house_minnan', x: 27, y: 22, door: -1, v: 0 },
    { t: 'house_minnan', x: 12, y: 24, door: -1, v: 0 }, { t: 'house_minnan', x: 31, y: 30, door: -1, v: 1 }, { t: 'house_minnan', x: 17, y: 30, door: -1, v: 0 },
    { t: 'house_minnan', x: 38, y: 13, door: -1, v: 1 },
    { t: 'shrine_small', x: 36, y: 30, text: '土地公' },
    // 菜宅: low 咾咕石 walls around the peanut field, 天人菊
    { t: 'fence_wood', x: 34, y: 4, w: 10, interact: ['用咾咕石疊成的矮牆，圍住一小塊菜田。', '澎湖的風會把土吹走，菜要躲在牆後面才長得大。'], label: '調查' },
    { t: 'fence_wood', x: 34, y: 9, w: 4 }, { t: 'fence_wood', x: 40, y: 9, w: 4 },
    { t: 'fence_wood', x: 34, y: 5, w: 1, h: 4 }, { t: 'fence_wood', x: 43, y: 5, w: 1, h: 4 },
    ...[[36, 10], [37, 10], [41, 10], [44, 6], [45, 8], [33, 7]].map(([x, y]) => ({ t: 'flowers', x, y, interact: ['紅黃相間的小花，風再大也開。澎湖人說它是「風吹不倒的花」。'], label: '調查' })),
    // stranded boats
    { t: 'boat_small', x: 1, y: 1, interact: ['船底朝天，躺在泥灘上。船頭還綁著一小束褪色的香火袋。'], label: '調查' },
    { t: 'boat_small', x: 6, y: 11 }, { t: 'boat_small', x: 2, y: 15 }, { t: 'boat_small', x: 5, y: 26 },
    { t: 'lamp_post', x: 14, y: 6 }, { t: 'lamp_post', x: 14, y: 15 }, { t: 'lamp_post', x: 17, y: 26 }, { t: 'lamp_post', x: 23, y: 21 },
    { t: 'lamp_post', x: 33, y: 21 }, { t: 'lamp_post', x: 27, y: 27 }, { t: 'lamp_post', x: 23, y: 33 }, { t: 'lamp_post', x: 27, y: 33 },
    { t: 'lantern_string', x: 20, y: 8, w: 12, v: 1 },
    { t: 'firepit', x: 13, y: 2, if: stA }, { t: 'firepit', x: 29, y: 2, if: stA },
    { t: 'barrel', x: 12, y: 8 }, { t: 'crate', x: 13, y: 8 }, { t: 'jar', x: 29, y: 15 }, { t: 'jar', x: 30, y: 15 },
    { t: 'bush', x: 12, y: 19 }, { t: 'bush', x: 44, y: 18 }, { t: 'bush', x: 21, y: 27 }, { t: 'bush', x: 45, y: 30 },
    { t: 'rock_basalt', x: 45, y: 13 }, { t: 'rock_small', x: 8, y: 20 }, { t: 'driftwood', x: 4, y: 31 },
  ];
  G.Maps.define('penghu_magong', {
    name: '媽宮',
    subtitle: (st) => (dawnPenghu(st) ? '澎湖・清晨' : '澎湖・潮停之夜'),
    place: 'penghu',
    bgm: (st) => (st.vars.c11_magong_bgm || 'penghu'),
    start: [11, 7],
    light: (st) => (dawnPenghu(st) ? { ambient: 0.05, color: '#3a2a3a', tint: 'rgba(255,210,170,0.14)' } : { ambient: 0.6, color: '#070b20', playerR: 220 }),
    particles: (st) => (dawnPenghu(st) ? ['wind', 'motes'] : stC(st) ? ['motes', 'wind'] : ['motes']),
    tiles: magongTiles,
    objects: MG_OBJ,
    pass: [{ x: 43, y: 1, w: 1, h: 1, solid: true }, { x: 46, y: 1, w: 1, h: 1, solid: true }],
    chests: [
      { id: 'c11_01', x: 20, y: 4, item: 'c11_dingxiang', n: 2 },
      { id: 'c11_02', x: 23, y: 18, item: 'huanhunxiang', n: 1 },
    ],
    lights: (st) => (dawnPenghu(st) ? [] : [
      { x: 13, y: 3, r: 150, color: '#ffa050', flicker: 0.4 }, { x: 29, y: 3, r: 150, color: '#ffa050', flicker: 0.4 },
      { x: 25, y: 9, r: 220, color: '#ffb060', flicker: 0.2 }, { x: 34, y: 15, r: 120, color: '#ffb060', flicker: 0.25 },
      { x: 20, y: 16, r: 110, color: '#ffc070', flicker: 0.25 }, { x: 14, y: 18, r: 90, color: '#ffc070', flicker: 0.25 },
      { x: 40, y: 25, r: 90, color: '#ffc070', flicker: 0.25 }, { x: 36, y: 31, r: 80, color: '#ffc070', flicker: 0.2 },
    ]),
    npcs: [
      { id: 'ph_ajin', sprite: 'temple_keeper', name: '阿進伯', x: 13, y: 6, dir: 'left', if: (st) => st.flags.ch11_start && !st.flags.ch11_tianhou, talk: [['阿進伯', '來廟裡坐。媽祖婆等恁足久矣。']] },
      { id: 'ph_atian', sprite: 'c11_atian', name: '阿添伯', x: 16, y: 2, dir: 'up', fixedDir: true, if: (st) => !st.flags.ch11_weir_3 && !dawnPenghu(st), talk: (S) => H.atian(S) },
      { id: 'ph_agui', sprite: 'fisher_f', name: '阿桂', pos: (st) => (stA(st) ? [20, 3] : [20, 6]), dir: 'left', if: (st) => !dawnPenghu(st), talk: (S) => H.agui(S) },
      { id: 'ph_cat', sprite: 'cat', name: '澎湖的貓', x: 18, y: 6, dir: 'down', if: (st) => !dawnPenghu(st), talk: (S) => H.cat(S) },
      { id: 'ph_xiuqin', sprite: 'shopkeeper_f', name: '秀琴', x: 19, y: 15, dir: 'down', fixedDir: true, if: (st) => !stA(st) && !dawnPenghu(st), talk: (S) => H.xiuqin(S) },
      { id: 'ph_smith', sprite: 'villager_m2', name: '阿榮師', x: 27, y: 15, dir: 'down', if: (st) => !stA(st) && !dawnPenghu(st), talk: (S) => H.smith(S) },
      { id: 'ph_xu', sprite: 'scholar', name: '許秀才', x: 13, y: 16, dir: 'down', fixedDir: true, if: (st) => !stA(st) && !dawnPenghu(st), talk: (S) => H.xu(S) },
      { id: 'ph_sailor', sprite: 'sailor', name: '老水手', x: 11, y: 8, dir: 'left', if: (st) => !stA(st) && !dawnPenghu(st), talk: (S) => H.sailor(S) },
      { id: 'ph_kid_yao', sprite: 'child_m', name: '阿耀', x: 8, y: 9, dir: 'down', wander: 1, if: (st) => !dawnPenghu(st), talk: (S) => H.yao(S) },
      { id: 'ph_kid_zhu', sprite: 'child_f', name: '阿珠', x: 9, y: 10, dir: 'left', if: (st) => !dawnPenghu(st), talk: (S) => H.zhu(S) },
      { id: 'ph_mother', sprite: 'villager_f', name: '等船的阿母', x: 22, y: 3, dir: 'up', fixedDir: true, if: (st) => !dawnPenghu(st), talk: (S) => H.mother(S) },
      { id: 'ph_oldman_a', sprite: 'old_m', name: '廟口避難的阿伯', x: 18, y: 3, dir: 'up', if: stA, talk: [['廟口避難的阿伯', '千歲爺來巡港矣……有救矣，有救矣……']] },
      { id: 'ph_crowd1', sprite: 'fisherman', name: '漁民', x: 24, y: 3, dir: 'up', if: stA, light: { r: 100, color: '#ffa050' }, talk: [['漁民', '彼……彼是啥物？']] },
      { id: 'ph_crowd2', sprite: 'villager_m', name: '漁民', x: 26, y: 3, dir: 'up', if: stA, light: { r: 100, color: '#ffa050' }, talk: [['漁民', '海哪會退甲遮爾遠……']] },
      { id: 'ph_crowd3', sprite: 'villager_f2', name: '婦人', x: 28, y: 3, dir: 'up', if: stA, talk: [['婦人', '媽祖婆保庇……']] },
      { id: 'ph_crowd4', sprite: 'child_f', name: '囡仔', x: 31, y: 3, dir: 'up', if: stA, talk: [['囡仔', '阿母，天星袂振動！']] },
      // townsfolk who make the town feel alive in B/C
      { id: 'ph_town1', sprite: 'villager_m', name: '補網的阿伯', x: 30, y: 19, dir: 'down', wander: 2, if: (st) => !stA(st) && !dawnPenghu(st),
        talk: (S) => (stC(G.state) ? L(S, [['補網的阿伯', '風轉來矣！明仔載透早，大家攏欲出海喔！']]) : L(S, [['補網的阿伯', '網補好矣，海煞無去。'], ['補網的阿伯', '我補網補四十冬，毋捌補過這款心肝。']])) },
      { id: 'ph_town2', sprite: 'villager_f', name: '曬衫的阿姨', x: 36, y: 27, dir: 'left', wander: 2, if: (st) => !stA(st) && !dawnPenghu(st),
        talk: (S) => (stC(G.state) ? L(S, [['曬衫的阿姨', '風一來，衫就焦矣。澎湖的風，是老天爺的手。']]) : L(S, [['曬衫的阿姨', '無風，衫曬袂焦。無風，連心肝都曬袂焦。']])) },
      { id: 'ph_town3', sprite: 'child_m', name: '囡仔', x: 22, y: 25, dir: 'down', wander: 3, if: (st) => !stA(st) && !dawnPenghu(st),
        talk: [['囡仔', '阿公講，天星若袂振動，就是有人咧等。'], ['囡仔', '等啥物？等天光啊！']] },
      // ending (E-T5 / stinger)
      { id: 'ph_mother_end', sprite: 'villager_f', name: '等船的阿母', x: 20, y: 3, dir: 'up', if: dawnPenghu, talk: [['等船的阿母', '轉來矣……阮後生轉來矣……']] },
    ],
    events: [
      { id: 'c11_02', trigger: 'auto', if: (st) => st.flags.ch11_start && !st.flags.ch11_magong, run: (S) => H.c11_02(S) },
      { id: 'board', trigger: 'action', x: 3, y: 6, w: 6, h: 1, label: '登船', if: (st) => !st.flags.ch11_jailer, run: async (S) => {
        if (!F('ch11_tianhou')) { await S.say('', '王船停在泥灘上，船底離地半尺。'); return; }
        await S.warp(DECK, 25, 8, 'left');
      } },
      { id: 'tower_gong', trigger: 'action', x: 43, y: 1, label: '調查', run: (S) => H.treasure(S, 'gong') },
      { id: 'tower_po', trigger: 'action', x: 46, y: 1, label: '調查', run: (S) => H.treasure(S, 'po') },
    ],
    warps: [
      { x: 25, y: 7, w: 2, to: 'penghu_tianhou', tx: 8, ty: 12, tdir: 'up', door: true },
      { x: 40, y: 24, to: 'penghu_atian', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 34, y: 14, to: 'penghu_inn', tx: 7, ty: 8, tdir: 'up', door: true },
      { x: 24, y: 35, w: 3, to: 'penghu_flats', tx: 28, ty: 1, tdir: 'down', run: async (S) => {
        if (!F('ch11_tianhou')) { await S.say('hongying:think', '……先去廟裡吧。大家都在等。'); S.setPos('player', 25, 33, 'up'); return false; }
        return true;
      } },
    ],
    drawGround: (ctx, t) => drawStoneTowers(ctx, t),
    drawOver: (ctx, t) => drawDipper(ctx, t),
  });
  // 塔公塔婆: two stacked-stone towers on the NE flats
  function drawStoneTowers(ctx) {
    for (const [cx, n] of [[43, 7], [46, 5]]) {
      const x = cx * T + T / 2, y = 1 * T + T - 6;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < n; i++) {
        const w = 30 - i * 3.2, yy = y - 6 - i * 15;
        const g = ctx.createLinearGradient(x - w, yy - 9, x + w, yy + 9);
        g.addColorStop(0, '#b8b2a4'); g.addColorStop(1, '#5a5650');
        ctx.fillStyle = g; ctx.strokeStyle = '#3a3630'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x + (U.hash(cx, i, 3) - 0.5) * 6, yy, w, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---- 天后宮・正殿 (18×14)
  function tianhouTiles() {
    const g = room(18, 14, 'T', 'E', [8, 9]);
    fill(g, 5, 5, 8, 4, '#');
    return rows(g);
  }
  G.Maps.define('penghu_tianhou', {
    name: '澎湖天后宮',
    subtitle: '台灣最古老的媽祖廟',
    place: 'penghu',
    bgm: 'temple',
    start: [8, 12],
    light: { ambient: 0.35, color: '#1a0c06', playerR: 180 },
    particles: ['motes'],
    tiles: tianhouTiles(),
    objects: [
      { t: 'altar', x: 8, y: 2, interact: async (S) => { await S.say('', '層層紅帳後，只見金色冠冕的一點微光，和不斷升起的香煙。'); await S.say('', '神前的那盞油燈，穩穩地亮著，一動也不動。'); }, label: '參拜' },
      { t: 'incense_burner', x: 8, y: 4 }, { t: 'incense_burner', x: 11, y: 6 },
      { t: 'pillar', x: 2, y: 2 }, { t: 'pillar', x: 15, y: 2 }, { t: 'pillar', x: 2, y: 10 }, { t: 'pillar', x: 15, y: 10 },
      { t: 'mural', x: 3, y: 1, v: 2 }, { t: 'mural', x: 13, y: 1, v: 3 },
      { t: 'shelf_lanterns', x: 14, y: 5, interact: ['一排光明燈，每一盞都寫著一個名字。'], label: '調查' }, { t: 'shelf_lanterns', x: 14, y: 7 },
      { t: 'stone_lantern', x: 11, y: 11, interact: async (S) => { await S.say('', '三川門內側的石燈。在這裡可以整理行囊。'); await S.saveMenu(); }, label: '存檔' },
      { t: 'rug', x: 7, y: 9, w: 4, h: 2 },
    ],
    lights: [{ x: 8.5, y: 2.6, r: 190, color: '#ffcf7a', flicker: 0 }, { x: 14.5, y: 6, r: 120, color: '#ffb060', flicker: 0.2 }, { x: 11, y: 6, r: 80, color: '#ff9a50', flicker: 0.3 }],
    npcs: [
      { id: 'ph_ajin', sprite: 'temple_keeper', name: '阿進伯', x: 10, y: 4, dir: 'down', talk: (S) => H.ajin(S) },
      { id: 'ph_oldman', sprite: 'old_m', name: '廟口避難的阿伯', x: 3, y: 6, dir: 'right', talk: (S) => H.oldman(S) },
      { id: 'ph_prayer', sprite: 'villager_f2', name: '廟裡祈禱的婦人', x: 6, y: 4, dir: 'up', fixedDir: true,
        talk: (S) => (F('ch11_tianhou') ? L(S, [['廟裡祈禱的婦人', '媽祖婆保庇……保庇阮翁，保庇阮囝……'], ['廟裡祈禱的婦人', '……嘛保庇這幾个少年仔。']]) : L(S, [['廟裡祈禱的婦人', '媽祖婆保庇……保庇阮翁，保庇阮囝，保庇……']])) },
      { id: 'ph_ref1', sprite: 'villager_f', name: '避難的阿姆', x: 3, y: 7, dir: 'right', talk: [['避難的阿姆', '囡仔睏去矣。天光進前，阮就佇遮等。']] },
      { id: 'ph_ref2', sprite: 'child_m', name: '避難的囡仔', x: 4, y: 8, dir: 'up', talk: [['避難的囡仔', '香煙攏咧彎……親像有人咧牽。']] },
      { id: 'ph_ref3', sprite: 'fisherman', name: '避難的漁夫', x: 3, y: 5, dir: 'right', talk: [['避難的漁夫', '船攏倒佇泥灘。潮若無轉來，阮就無飯通食。']] },
    ],
    events: [
      { id: 'c11_03', trigger: 'auto', if: (st) => st.flags.ch11_magong && !st.flags.ch11_tianhou && !(st.vars.ch11_incense >= 1), run: (S) => H.c11_03a(S) },
      { id: 'incense_sky', trigger: 'action', x: 11, y: 6, label: '拈香', run: (S) => H.incense(S, 'sky') },
      { id: 'incense_in', trigger: 'action', x: 8, y: 4, label: '拈香', run: (S) => H.incense(S, 'in') },
    ],
    warps: [{ x: 8, y: 13, w: 2, to: 'penghu_magong', tx: 25, ty: 8, tdir: 'down', door: true }],
    drawOver: (ctx, t) => {
      // 香煙向西彎: every thread of incense smoke bends west (left)
      for (const [cx, cy] of [[11, 6], [8, 4]]) {
        const x0 = cx * T + T / 2, y0 = cy * T + 6;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 24; i++) {
            const s = i / 24, yy = y0 - s * 150, xx = x0 - s * s * 160 + Math.sin(t * 1.3 + s * 6 + k * 2) * 6 * s;
            if (i === 0) ctx.moveTo(xx + k * 3, yy); else ctx.lineTo(xx + k * 3, yy);
          }
          ctx.strokeStyle = `rgba(230,225,215,${0.18 - k * 0.04})`; ctx.lineWidth = 3 - k * 0.6; ctx.stroke();
        }
        ctx.restore();
      }
    },
  });

  G.Maps.define('penghu_atian', {
    name: '阿添伯的咾咕石厝',
    place: 'penghu',
    bgm: 'penghu',
    start: [6, 7],
    light: { ambient: 0.4, color: '#140a04', playerR: 180 },
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'stove', x: 2, y: 2 }, { t: 'altar', x: 5, y: 2, interact: ['小小的神桌，供著添家的祖先牌位。'], label: '調查' },
      { t: 'mural', x: 8, y: 1, v: 3, interact: ['一張手繪的「添家滬」滬圖。弧形的石牆，像一個抱著海的手臂。'], label: '調查' },
      { t: 'bed', x: 10, y: 2 }, { t: 'table', x: 7, y: 5 }, { t: 'chair', x: 6, y: 5, dir: 'right' }, { t: 'chair', x: 8, y: 5, dir: 'left' },
      { t: 'fishing_net', x: 1, y: 6 }, { t: 'pot', x: 4, y: 2 },
    ],
    lights: [{ x: 3, y: 3, r: 160, color: '#ffa050', flicker: 0.3 }, { x: 7, y: 5, r: 120, color: '#ffc070', flicker: 0.2 }],
    npcs: [
      { id: 'ph_atian_wife', sprite: 'c11_atian_wife', name: '添姆', x: 3, y: 3, dir: 'down', talk: (S) => H.atianWife(S) },
      { id: 'ph_atian_home', sprite: 'c11_atian', name: '阿添伯', x: 9, y: 5, dir: 'left', if: (st) => !!st.flags.ch11_weir_done,
        talk: (S) => L(S, [['阿添伯', '滬仔愛留一个縫。魚仔才會當轉去。……人嘛是。'], ['阿添伯', '七美有一口雙心石滬，兩粒心疊做伙。'], ['阿添伯', '阮這口滬，以後嘛是兩粒心。一粒阮的，一粒阿湧的。']]) },
    ],
    warps: [{ x: 6, y: 8, to: 'penghu_magong', tx: 40, ty: 25, tdir: 'down', door: true }],
  });

  G.Maps.define('penghu_inn', {
    name: '海口客棧',
    place: 'penghu',
    bgm: 'penghu',
    start: [7, 8],
    light: { ambient: 0.38, color: '#140a04', playerR: 180 },
    tiles: rows(room(14, 10, '_', 'W', [7])),
    objects: [
      { t: 'counter', x: 5, y: 4, w: 3 }, { t: 'shelf_lanterns', x: 5, y: 2 }, { t: 'cabinet', x: 2, y: 2 },
      { t: 'table', x: 2, y: 6 }, { t: 'chair', x: 1, y: 6, dir: 'right' }, { t: 'chair', x: 3, y: 6, dir: 'left' },
      { t: 'table', x: 10, y: 6 }, { t: 'chair', x: 9, y: 6, dir: 'right' }, { t: 'chair', x: 11, y: 6, dir: 'left' },
      { t: 'stairs_up', x: 12, y: 2, interact: ['樓上是客房。'], label: '調查' }, { t: 'jar_row', x: 9, y: 2, w: 2 },
    ],
    lights: [{ x: 6, y: 4, r: 170, color: '#ffb060', flicker: 0.2 }, { x: 10, y: 6, r: 110, color: '#ffc070', flicker: 0.2 }],
    npcs: [
      { id: 'ph_innkeeper', sprite: 'villager_f2', name: '阿嬌', x: 6, y: 3, dir: 'down', talk: (S) => H.inn(S) },
      { id: 'ph_guest', sprite: 'merchant', name: '困在澎湖的商人', x: 10, y: 7, dir: 'up', talk: [['困在澎湖的商人', '我本來今仔日欲坐船去府城。'], ['困在澎湖的商人', '船倒佇泥裡，我嘛倒佇遮。……閣一杯。']] },
    ],
    warps: [{ x: 7, y: 9, to: 'penghu_magong', tx: 34, ty: 15, tdir: 'down', door: true }],
  });

  // random (暗雷) encounters on certain terrain; off during test autoplay so scripted runs stay deterministic
  function randomEnc(ms, busy, o) {
    const st = G.state;
    if (ms._encSteps == null) { ms._encSteps = st.steps; return; }
    if (busy || st.steps === ms._encSteps) return;
    ms._encSteps = st.steps;
    if (autoplay() || ms.invuln > 0 || (o.if && !o.if(st))) return;
    if (o.terr && !o.terr.includes(ms.terrainAt(ms.player.x, ms.player.y))) return;
    if (Math.random() < o.rate) G.Script.run(async (S) => { await S.battle(U.pick(o.troops)); if (G.mapScene) G.mapScene.invuln = 2; });
  }
  // blue light curtain (sealed doors / barriers), world space
  function drawCurtain(ctx, t, x0, y0, w, h, col) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const x = x0 * T, y = y0 * T, W = w * T, Hh = h * T;
    const g = ctx.createLinearGradient(x, y - 60, x, y + Hh);
    g.addColorStop(0, U.rgba(col, 0)); g.addColorStop(0.5, U.rgba(col, 0.35 + 0.1 * Math.sin(t * 3))); g.addColorStop(1, U.rgba(col, 0.1));
    ctx.fillStyle = g; ctx.fillRect(x, y - 60, W, Hh + 60);
    ctx.fillStyle = U.rgba('#ffffff', 0.5);
    for (let i = 0; i < 18; i++) { const px = x + U.hash(i, 2, x0) * W, py = y - 60 + ((t * 30 + U.hash(i, 5, y0) * 200) % (Hh + 60)); ctx.fillRect(px, py, 2, 6); }
    ctx.restore();
  }

  // =================================================================================================
  // MAP: penghu_flats 石滬灘・潮停之路 (56×44)
  // =================================================================================================
  function flatsTiles() {
    const g = grid(56, 44, 's');
    for (let y = 0; y < 44; y++) for (let x = 0; x < 56; x++) { const h = U.hash(x, y, 51); if (h < 0.1) g[y][x] = '-'; else if (h > 0.985) g[y][x] = '~'; }
    // weir interiors hold the last of the water
    fill(g, 6, 3, 4, 2, '-'); fill(g, 38, 3, 6, 3, '-'); fill(g, 46, 12, 3, 2, '-'); fill(g, 15, 27, 4, 2, '-');
    // deeper pools (solid)
    disc(g, 33, 8, 2.2, '~'); disc(g, 12, 18, 2, '~'); disc(g, 30, 28, 2.4, '~'); disc(g, 49, 37, 3, '~'); disc(g, 40, 40, 2, '~');
    // 潮停之路: a raised gravel bar winding SW (main) + the long way round (east)
    path(g, [[27, 0], [27, 4], [25, 8], [22, 13], [20, 18], [23, 24], [22, 30], [16, 34], [10, 37], [7, 40], [7, 43]], '=', 2);
    path(g, [[25, 9], [35, 14], [43, 20], [45, 28], [39, 33], [28, 35], [21, 34]], '=', 2);
    // SW: basalt shelf leading to the reef mouth
    for (let y = 33; y < 44; y++) for (let x = 0; x < 12; x++) if (g[y][x] !== '=' && U.hash(x, y, 9) < 0.35) g[y][x] = 'Y';
    fill(g, 5, 39, 5, 5, '=');
    return rows(g);
  }
  const FL_OBJ = (() => {
    const o = [
      { t: 'stone_weir', x: 5, y: 2, w: 6, h: 4, interact: ['用玄武岩與咾咕石疊成的弧形石牆。漲潮時魚游進來，退潮時被留在牆內。', '一口滬，常常是一整個家族的。'], label: '調查' },
      { t: 'stone_weir', x: 37, y: 2, w: 8, h: 5 },
      { t: 'stone_weir', x: 45, y: 11, w: 5, h: 4 },
      { t: 'stone_weir', x: 14, y: 26, w: 6, h: 4, v: 1, interact: ['兩個心疊在一起的石滬。阿添伯說，七美也有一口。'], label: '調查' },
      { t: 'basalt', x: 7, y: 7, interact: ['一根根六角形的黑色石柱，整齊得像有人排過。很久很久以前，這裡是火山流出的熔岩。'], label: '調查' },
      { t: 'boat_ferry', x: 40, y: 29, interact: ['擱淺的舊船，船腹破了一個大洞。'], label: '調查' },
      { t: 'boat_ferry', x: 19, y: 36 }, { t: 'boat_ferry', x: 23, y: 37 },
      { t: 'eternal_lamp', x: 22, y: 35, if: (st) => !st.flags.ch11_captain },
      { t: 'driftwood', x: 46, y: 5 }, { t: 'driftwood', x: 12, y: 30 }, { t: 'driftwood', x: 33, y: 39 }, { t: 'driftwood', x: 50, y: 24 },
      { t: 'boat_small', x: 30, y: 2 }, { t: 'boat_small', x: 2, y: 22 },
    ];
    for (const [x, y] of [[3, 12], [2, 29], [5, 32], [9, 30], [1, 35], [10, 34], [3, 38], [12, 40], [1, 41]]) o.push({ t: 'basalt', x, y });
    for (const [x, y] of [[15, 6], [36, 18], [8, 22], [27, 20], [48, 16], [44, 34], [17, 12], [33, 24], [5, 16], [52, 30]]) o.push({ t: 'rock_basalt', x, y });
    for (const [x, y] of [[13, 3], [31, 16], [39, 9], [18, 41], [52, 8], [26, 41]]) o.push({ t: 'rock_small', x, y });
    for (const [x, y] of [[20, 5], [40, 13], [11, 27], [35, 31], [48, 19], [28, 40]]) o.push({ t: 'seaweed', x, y });
    // blue soul-lights trapped in the weirs
    for (const [x, y] of [[39, 4], [41, 3], [43, 4], [7, 3], [9, 4], [47, 12]]) o.push({ t: 'water_lantern', x, y, light: { r: 70, color: '#8fd8ff' }, if: (st) => !st.flags.ch11_weir_done || x < 30 || x > 45 });
    return o;
  })();
  G.Maps.define('penghu_flats', {
    name: '石滬灘・潮停之路',
    subtitle: '退乾的海床',
    place: 'penghu',
    bgm: 'penghu',
    start: [28, 1],
    light: { ambient: 0.62, color: '#0a1028', playerR: 230 },
    particles: (st) => (stC(st) ? ['motes', 'wind', { type: 'mist', alpha: 0.12 }] : ['motes', { type: 'mist', alpha: 0.14 }]),
    tiles: flatsTiles(),
    objects: FL_OBJ,
    chests: [
      { id: 'c11_03', x: 49, y: 3, item: 'c11_xiaoguan', n: 3, run: async (S) => { S.gold(800); } },
      { id: 'c11_04', x: 7, y: 12, item: 'lingxun', n: 2 },
      { id: 'c11_05', x: 44, y: 23, item: 'c11_ac_fisher', n: 1 },
      { id: 'c11_06', x: 43, y: 31, item: 'huanhundan', n: 1 },
    ],
    npcs: [
      { id: 'fl_ghost_fisher', sprite: 'ghost_m', name: '迷路的漁夫魂', x: 24, y: 14, dir: 'down', ghost: true, if: (st) => !st.flags.ch11_fisher_gone, talk: (S) => H.ghostFisher(S) },
      { id: 'fl_pirate_kid', sprite: 'c11_pirate_kid', name: '被鎖住的小海盜鬼', x: 27, y: 33, dir: 'left', ghost: true, talk: (S) => H.pirateKid(S) },
      { id: 'fl_captain', sprite: 'c11_captain', name: '烏鬚船主', x: 21, y: 35, dir: 'down', ghost: true, if: (st) => !st.flags.ch11_captain, talk: (S) => H.c11_05(S) },
      { id: 'fl_ayong', sprite: 'c11_ayong', name: '阿湧', x: 41, y: 5, dir: 'down', ghost: true, if: (st) => st.flags.ch11_weir_2 && !st.flags.ch11_weir_done,
        talk: [['阿湧', '阮佇遮等。阿兄若講好，阮就出去。']] },
      { id: 'fl_atian', sprite: 'c11_atian', name: '阿添伯', x: 40, y: 8, dir: 'up', if: (st) => st.flags.ch11_weir_3 && !st.flags.ch11_weir_done, talk: (S) => H.weir4(S) },
    ],
    enemies: [
      { id: 'pg1', troop: 'penghu_1', x: 18, y: 4, art: 'pirate_ghost', lv: 39, radius: 3 },
      { id: 'pg2', troop: 'penghu_3', x: 14, y: 9, art: 'pirate_ghost', lv: 39, radius: 3 },
      { id: 'pg3', troop: 'penghu_1', x: 36, y: 12, art: 'pirate_ghost', lv: 39, radius: 3 },
      { id: 'pg4', troop: 'penghu_2', x: 10, y: 15, art: 'sea_monster', variant: 2, lv: 39, radius: 2 },
      { id: 'pg5', troop: 'penghu_3', x: 29, y: 22, art: 'pirate_ghost', lv: 39, radius: 3 },
      { id: 'pg6', troop: 'penghu_1', x: 13, y: 22, art: 'pirate_ghost', lv: 39, radius: 3 },
      { id: 'pg7', troop: 'penghu_3', x: 37, y: 26, art: 'pirate_ghost', lv: 39, radius: 3 },
      { id: 'pg8', troop: 'penghu_2', x: 47, y: 34, art: 'sea_monster', variant: 2, lv: 39, radius: 2 },
    ],
    events: [
      { id: 'c11_04', trigger: 'auto', if: (st) => !st.flags.ch11_flats, run: (S) => H.c11_04(S) },
      { id: 'weir2', trigger: 'touch', x: 39, y: 7, w: 5, h: 2, if: (st) => st.flags.ch11_weir_1 && !st.flags.ch11_weir_2, run: (S) => H.weir2(S) },
      { id: 'weir4', trigger: 'touch', x: 38, y: 7, w: 6, h: 3, if: (st) => st.flags.ch11_weir_3 && !st.flags.ch11_weir_done, run: (S) => H.weir4(S) },
      { id: 'captain', trigger: 'touch', x: 13, y: 31, w: 16, h: 2, if: (st) => !st.flags.ch11_captain, run: (S) => H.c11_05(S) },
      { id: 'barrier', trigger: 'touch', x: 5, y: 39, w: 5, h: 1, if: (st) => !st.flags.ch11_captain, run: async (S) => {
        S.sfx('buzz');
        await S.say('', '藍色的光幕擋住了礁口。光幕的另一頭，烏鬚船主的沉船上，一盞長明燈幽幽地亮著。');
        S.setPos('player', 7, 37, 'up');
      } },
      { id: 'mush7', trigger: 'action', x: 7, y: 7, w: 2, h: 2, spirit: true, label: '調查', if: (st) => !st.flags.mush_7, run: (S) => H.mush7(S) },
    ],
    warps: [
      { x: 27, y: 0, w: 2, to: 'penghu_magong', tx: 25, ty: 33, tdir: 'up' },
      { x: 5, y: 43, w: 5, to: 'xuanwu_shore', tx: 9, ty: 37, tdir: 'up' },
    ],
    onUpdate: (dt, ms, busy) => {
      if (!busy) G.Music.play(ms.player.x < 24 && ms.player.y > 14 ? 'night' : 'penghu', { fade: 1.5 });
      randomEnc(ms, busy, { terr: ['shallow'], rate: 0.07, troops: ['penghu_2'] });
    },
    drawOver: (ctx, t) => {
      if (!F('ch11_captain')) {
        drawCurtain(ctx, t, 5, 39, 5, 1, '#6ab8ff');
        // the anchor chain from the captain to his lamp
        ctx.save(); ctx.strokeStyle = 'rgba(160,170,190,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(21.5 * T, 35.5 * T); ctx.quadraticCurveTo(22 * T, 36.6 * T, 22.5 * T, 35.4 * T); ctx.stroke(); ctx.restore();
      }
      drawDipper(ctx, t);
    },
  });

  // =================================================================================================
  // MAP: xuanwu_shore 玄武嶼・黑岸 (40×40)
  // =================================================================================================
  function xwShoreTiles() {
    const g = grid(40, 40, 'U');
    fill(g, 0, 38, 40, 2, '~'); fill(g, 4, 33, 24, 5, 's'); fill(g, 28, 33, 12, 7, '~');
    fill(g, 8, 37, 3, 3, '=');                       // reef path from the flats
    fill(g, 28, 36, 2, 1, 'k');                       // little jetty to the 王船
    fill(g, 5, 13, 30, 15, 'Y');                      // lower terrace
    fill(g, 12, 4, 16, 6, 'Y');                       // upper terrace (gate plaza)
    fill(g, 19, 10, 2, 3, 'H'); fill(g, 19, 28, 2, 5, 'H');
    fill(g, 2, 18, 3, 1, 'v');                        // sea cave mouth (west)
    // basalt columns breaking up the terrace edges
    for (const [x, y] of [[5, 13], [6, 13], [33, 13], [34, 13], [5, 27], [34, 27], [12, 4], [27, 4]]) set(g, x, y, 'U');
    return rows(g);
  }
  G.Maps.define('xuanwu_shore', {
    name: '玄武嶼・黑岸',
    subtitle: '長明宮',
    place: 'penghu',
    bgm: 'palace',
    start: [9, 37],
    light: { ambient: 0.75, color: '#040818', playerR: 220 },
    particles: (st) => (stC(st) ? ['motes', 'wind', { type: 'mist', alpha: 0.12 }] : ['motes', { type: 'mist', alpha: 0.16 }]),
    tiles: xwShoreTiles(),
    objects: (() => {
      const o = [
        { t: 'city_god_temple', x: 17, y: 0, door: 2, text: '長明宮' },
        { t: 'wang_boat', x: 30, y: 35, water: true, if: (st) => st.flags.ch11_jailer && !st.flags.ch11_sail },
        { t: 'banner', x: 15, y: 5, color: '#14141c', edge: '#c8d0e0', text: '長明' }, { t: 'banner', x: 24, y: 5, color: '#14141c', edge: '#c8d0e0', text: '長明' },
      ];
      for (const y of [5, 9, 13, 17, 21, 25, 33]) { o.push({ t: 'eternal_lamp', x: 18, y, interact: ['燈罩裡的火是藍的，一點溫度也沒有。燈底刻著「長明宮・玄」。'], label: '調查' }); o.push({ t: 'eternal_lamp', x: 21, y }); }
      for (const [x, y] of [[7, 15], [9, 22], [26, 16], [30, 22], [13, 25], [24, 25], [14, 6], [25, 7]]) o.push({ t: 'basalt', x, y });
      for (const [x, y] of [[6, 34], [14, 36], [22, 34], [11, 19], [29, 18], [16, 15]]) o.push({ t: 'rock_basalt', x, y });
      for (const [x, y] of [[8, 17], [31, 25], [15, 20]]) o.push({ t: 'bones', x, y });
      for (const [x, y] of [[10, 14], [28, 14], [33, 20]]) o.push({ t: 'soul_jar', x, y, if: (st) => !st.flags.ch11_jars_freed });
      return o;
    })(),
    chests: [{ id: 'c11_07', x: 31, y: 24, item: 'c11_ft_guard_boots', n: 1 }],
    lights: [{ x: 3, y: 18, r: 120, color: '#6ab8ff', flicker: 0.3 }],
    enemies: [
      { id: 'xw1', troop: 'xuanwu_1', x: 10, y: 20, sprite: 'temple_guard', lv: 40, radius: 3 },
      { id: 'xw2', troop: 'xuanwu_2', x: 28, y: 19, art: 'lantern_golem', variant: 1, lv: 40, radius: 3 },
      { id: 'xw3', troop: 'xuanwu_3', x: 14, y: 24, art: 'marionette', variant: 2, lv: 40, radius: 3 },
      { id: 'xw4', troop: 'penghu_3', x: 25, y: 34, art: 'pirate_ghost', lv: 39, radius: 3 },
    ],
    events: [
      { id: 'c11_06', trigger: 'auto', if: (st) => !st.flags.ch11_xuanwu, run: (S) => H.c11_06(S) },
      { id: 'gate', trigger: 'touch', x: 19, y: 4, w: 2, h: 1, if: (st) => !st.flags.ch11_jars_freed, run: async (S) => {
        S.sfx('buzz');
        await S.say('', '藍色光幕上浮著密密麻麻的小字——都是名字。光幕冷得像冰。');
        if (F('ch11_xuanwu')) await S.say('yungui:serious', '要開門，得先讓這些名字的主人離開。西邊崖下的洞穴。');
        S.setPos('player', 19, 6, 'up');
      } },
      { id: 'board', trigger: 'action', x: 30, y: 35, w: 6, h: 3, label: '登船', if: (st) => st.flags.ch11_jailer && !st.flags.ch11_sail, run: async (S) => { await S.warp(DECK, 25, 8, 'left'); } },
    ],
    warps: [
      { x: 8, y: 39, w: 3, to: 'penghu_flats', tx: 7, ty: 41, tdir: 'up' },
      { x: 2, y: 18, to: 'xuanwu_b1', tx: 21, ty: 37, tdir: 'up' },
      { x: 19, y: 3, w: 2, to: 'xuanwu_1f', tx: 21, ty: 36, tdir: 'up', door: true, if: (st) => !!st.flags.ch11_jars_freed },
    ],
    drawOver: (ctx, t) => { if (!F('ch11_jars_freed')) drawCurtain(ctx, t, 19, 3, 2, 1, '#6ab8ff'); drawDipper(ctx, t); },
  });

  // =================================================================================================
  // MAP: xuanwu_b1 長明宮・萬魂窟 (44×40) — puzzle P1 五盞長明燈
  // =================================================================================================
  const LAMPS = [[20, 6], [27, 8], [25, 14], [15, 14], [13, 8]];
  const lit = () => { const v = V(); if (!v.ch11_lit) v.ch11_lit = [1, 1, 1, 1, 1]; return v.ch11_lit; };
  function b1Tiles() {
    const g = grid(44, 40, 'C');
    disc(g, 20, 10, 8.6, 'v', 7.6);                   // 五燈之間
    fill(g, 20, 2, 3, 2, 'v');                        // north passage → iron gate
    fill(g, 19, 30, 5, 9, 'v');                       // entrance foyer
    path(g, [[19, 32], [6, 32], [5, 22], [5, 19], [9, 16], [13, 15]], 'v', 2);   // west branch
    path(g, [[21, 30], [21, 17]], 'v', 3);                                       // middle branch (flooded)
    path(g, [[23, 32], [37, 32], [37, 21], [33, 16], [28, 14]], 'v', 2);        // east branch
    fill(g, 3, 19, 4, 3, 'v'); fill(g, 35, 19, 4, 3, 'v');                       // side alcoves
    for (let y = 17; y < 30; y++) for (let x = 20; x < 24; x++) if (U.hash(x, y, 13) < 0.45) g[y][x] = '-';
    fill(g, 16, 32, 3, 3, 'v');
    return rows(g);
  }
  G.Maps.define('xuanwu_b1', {
    name: '長明宮・萬魂窟',
    subtitle: '玄武嶼',
    place: 'penghu',
    bgm: 'palace',
    start: [21, 37],
    light: { ambient: 0.8, color: '#02050f', playerR: 200 },
    particles: [{ type: 'motes', density: 1.4 }],
    tiles: b1Tiles(),
    objects: (() => {
      const o = [];
      LAMPS.forEach(([x, y], i) => {
        o.push({ t: 'eternal_lamp', x, y, if: () => lit()[i] === 1 });
        o.push({ t: 'stone_lantern', x, y, lit: false, if: () => lit()[i] !== 1 });
      });
      o.push({ t: 'altar', x: 20, y: 10 });
      // rings of soul jars around the hall (and empty jars once freed)
      for (let k = 0; k < 34; k++) {
        const a = k / 34 * Math.PI * 2, x = Math.round(20 + Math.cos(a) * 7.9), y = Math.round(10 + Math.sin(a) * 6.9);
        if (y >= 16 || (x >= 19 && x <= 23 && y <= 4) || LAMPS.some(([lx, ly]) => Math.abs(lx - x) + Math.abs(ly - y) <= 1)) continue;
        o.push({ t: 'soul_jar', x, y, if: (st) => !st.flags.ch11_jars_freed }, { t: 'jar', x, y, if: (st) => !!st.flags.ch11_jars_freed });
      }
      for (const [x, y] of [[4, 20], [6, 20], [36, 20], [38, 20], [8, 32], [12, 32], [30, 32], [34, 32], [19, 36], [23, 36]]) o.push({ t: 'soul_jar', x, y, if: (st) => !st.flags.ch11_jars_freed, interact: ['罐子上貼著紅紙，寫著名字與地址：「艋舺　黃氏」「竹塹　劉某」「府城　無名」……'], label: '調查' });
      return o;
    })(),
    chests: [
      { id: 'c11_08', x: 4, y: 19, item: 'c11_lamp_oil', n: 2 },
      { id: 'c11_09', x: 38, y: 19, item: 'c11_ac_jade_bracer', n: 1 },
      { id: 'c11_10', x: 17, y: 33, item: 'huanhundan', n: 1 },
    ],
    npcs: [
      { id: 'xw_freed_soul', sprite: 'c11_freed_soul', name: '被放出的魂', x: 18, y: 12, dir: 'down', ghost: true, if: (st) => st.flags.ch11_jars_freed && !st.flags.ch11_freed_talk,
        talk: (S) => H.freedSoul(S) },
    ],
    enemies: [
      { id: 'b1a', troop: 'xuanwu_2', x: 5, y: 26, art: 'lantern_golem', variant: 1, lv: 40, radius: 3 },
      { id: 'b1b', troop: 't11_xw_drowned', x: 37, y: 26, art: 'drowned_swarm', lv: 41, radius: 3 },
      { id: 'b1c', troop: 'xuanwu_1', x: 21, y: 22, sprite: 'temple_guard', lv: 40, radius: 2 },
    ],
    events: [
      { id: 'c11_07', trigger: 'touch', x: 13, y: 15, w: 16, h: 3, once: true, if: (st) => !st.flags.ch11_jars_freed, run: (S) => H.c11_07a(S) },
      ...LAMPS.map(([x, y], i) => ({ id: 'lamp' + (i + 1), trigger: 'action', x, y, label: '調查', run: (S) => H.lampPillar(S, i) })),
      { id: 'altar', trigger: 'action', x: 20, y: 10, w: 2, h: 1, label: '調查', run: (S) => H.b1Altar(S) },
      { id: 'gate', trigger: 'touch', x: 20, y: 3, w: 3, h: 1, if: (st) => !st.flags.ch11_jars_freed, run: async (S) => {
        S.sfx('buzz'); await S.say('', '一道黑鐵柵擋住了往上的石梯。鎖孔是一個小小的罐子形狀。'); S.setPos('player', 21, 5, 'up');
      } },
    ],
    warps: [
      { x: 21, y: 38, to: 'xuanwu_shore', tx: 4, ty: 18, tdir: 'right' },
      { x: 20, y: 2, w: 3, to: 'xuanwu_1f', tx: 2, ty: 32, tdir: 'up', if: (st) => !!st.flags.ch11_jars_freed },
    ],
    onUpdate: (dt, ms, busy) => randomEnc(ms, busy, { terr: ['shallow'], rate: 0.06, troops: ['t11_xw_drowned'] }),
    drawGround: (ctx, t, ms) => {
      // the wall of a thousand jars: soft blue lights in the hall's rock
      if (F('ch11_jars_freed')) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 160; i++) {
        const a = U.hash(i, 1, 3) * Math.PI * 2, rr = 9.3 + U.hash(i, 2, 3) * 2.2;
        const x = (20.5 + Math.cos(a) * rr) * T, y = (10.5 + Math.sin(a) * rr * 0.9) * T;
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2 + i);
        ctx.drawImage(G.FX.glowSprite('#7ac8ff'), x - 7, y - 7, 14, 14);
      }
      ctx.restore();
    },
    drawOver: (ctx, t, ms) => {
      if (F('ch11_jars_freed') && ms._freedT == null) ms._freedT = t;
      if (ms._freedT != null && t - ms._freedT < 10) {
        // thousands of lights rising, blue → warm white
        const k = (t - ms._freedT) / 10;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 220; i++) {
          const x = (6 + U.hash(i, 1, 8) * 30) * T, y0 = (2 + U.hash(i, 2, 8) * 18) * T;
          const y = y0 - ((t - ms._freedT) * (60 + U.hash(i, 3, 8) * 80)) % (24 * T);
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.drawImage(G.FX.glowSprite(U.hash(i, 4, 8) < k ? '#fff2d8' : '#8fd0ff'), x - 6, y - 6, 12, 12);
        }
        ctx.restore();
      }
    },
  });

  // =================================================================================================
  // MAP: xuanwu_1f 長明宮・長明殿 (44×40)
  // =================================================================================================
  function xw1fTiles(st) {
    const g = grid(44, 40, 'E');
    fill(g, 6, 4, 30, 34, 'T');                       // great hall
    fill(g, 1, 5, 3, 30, 'T');                        // west corridor (to the cell)
    fill(g, 4, 31, 2, 2, 'T');                        // corridor ↔ hall
    fill(g, 38, 5, 5, 8, 'T'); fill(g, 36, 9, 2, 1, 'T');   // east wing: the study
    fill(g, 20, 20, 3, 18, 'c'); fill(g, 19, 14, 5, 6, 'c');  // dark carpet to the altar
    fill(g, 21, 38, 2, 1, 'T');                       // south gate
    if (st.flags.ch11_secret) fill(g, 21, 2, 2, 2, 'H');
    return rows(g);
  }
  G.Maps.define('xuanwu_1f', {
    name: '長明宮・長明殿',
    subtitle: '玄武嶼',
    place: 'penghu',
    bgm: 'palace',
    start: [21, 36],
    light: { ambient: 0.7, color: '#03060f', playerR: 210 },
    particles: [{ type: 'motes', density: 0.8 }],
    tiles: xw1fTiles,
    objects: (() => {
      const o = [
        { t: 'altar', x: 21, y: 15, interact: ['夜玄的祭壇。供桌上沒有神像，只有一盞小小的、熄了很久的燈。'], label: '調查' },
        { t: 'eternal_lamp', x: 21, y: 4, interact: async (S) => H.northLamp(S), label: '調查' },
        { t: 'table', x: 40, y: 6, w: 2 }, { t: 'chair', x: 40, y: 7, dir: 'up' }, { t: 'bed', x: 42, y: 9 },
        { t: 'mural', x: 39, y: 3, v: 4, interact: ['一幅褪色的畫，掛得很端正。'], label: '調查' },
        { t: 'bookshelf', x: 38, y: 5 },
        { t: 'stairs_down', x: 2, y: 33 },
        { t: 'door_frame', x: 2, y: 4 },
      ];
      for (const y of [8, 26]) for (const x of [9, 14, 28, 33]) o.push({ t: 'eternal_lamp', x, y });
      for (const y of [12, 20, 30]) for (const x of [8, 34]) o.push({ t: 'pillar', x, y });
      for (const [x, y] of [[12, 34], [30, 34], [7, 17], [35, 17]]) o.push({ t: 'soul_jar', x, y, if: (st) => !st.flags.ch11_jars_freed });
      return o;
    })(),
    chests: [
      { id: 'c11_11', x: 34, y: 21, item: 'c11_ac_yx_talisman', n: 1 },
      { id: 'c11_12', x: 33, y: 31, item: 'huanhunxiang', n: 2, run: async (S) => { S.gold(3000); } },
    ],
    lights: [{ x: 40, y: 6, r: 170, color: '#ffb060', flicker: 0.15 }],
    enemies: [
      { id: 'f1a', troop: 'xuanwu_1', x: 12, y: 23, sprite: 'temple_guard', lv: 40, radius: 3 },
      { id: 'f1b', troop: 't11_xw_faceless', x: 29, y: 24, art: 'faceless', lv: 42, radius: 3 },
      { id: 'f1c', troop: 'xuanwu_3', x: 15, y: 10, art: 'marionette', variant: 2, lv: 40, radius: 3 },
      { id: 'f1d', troop: 't11_xw_faceless', x: 29, y: 11, art: 'faceless', lv: 42, radius: 2 },
    ],
    events: [
      { id: 'study', trigger: 'action', x: 40, y: 6, w: 2, h: 1, label: '調查', run: (S) => H.c11_08(S) },
      { id: 'north', trigger: 'action', x: 21, y: 3, w: 2, h: 1, label: '調查', if: (st) => !st.flags.ch11_secret, run: (S) => H.northLamp(S) },
    ],
    warps: [
      { x: 21, y: 38, w: 2, to: 'xuanwu_shore', tx: 19, ty: 5, tdir: 'down', door: true },
      { x: 2, y: 33, to: 'xuanwu_b1', tx: 21, ty: 5, tdir: 'down' },
      { x: 2, y: 5, to: 'xuanwu_cell', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 21, y: 2, w: 2, to: 'xuanwu_top', tx: 12, ty: 17, tdir: 'up', if: (st) => !!st.flags.ch11_secret },
    ],
    drawOver: (ctx, t, ms) => {
      // the hanging forest of eternal lamps above the hall (half of them dark once the jars are free)
      const freed = F('ch11_jars_freed');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 90; i++) {
        if (freed && i % 2) continue;
        const x = (9 + U.hash(i, 1, 21) * 26) * T, y = (6 + U.hash(i, 2, 21) * 26) * T - 70 + Math.sin(t * 0.8 + i) * 3;
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 1.5 + i * 0.7);
        ctx.drawImage(G.FX.glowSprite('#6ab0ff'), x - 9, y - 9, 18, 18);
      }
      ctx.restore();
    },
  });

  // ---- 白芷的囚室 (12×9)
  const PAPER_LAMPS = [[3, 2], [6, 2], [9, 2], [3, 4], [6, 4], [9, 4]];
  G.Maps.define('xuanwu_cell', {
    name: '白芷的囚室',
    place: 'penghu',
    bgm: (st) => (st.vars.ch11_letters_read >= 6 || st.flags.ch11_letters ? 'love' : null),
    start: [6, 7],
    light: { ambient: 0.5, color: '#060a18', playerR: 150 },
    particles: [{ type: 'motes', density: 0.3 }],
    tiles: rows(room(12, 9, 't', 'P', [6])),
    objects: [
      { t: 'bed_mat', x: 1, y: 5 },
      { t: 'paper_stack', x: 10, y: 7, interact: ['牆角一小堆用剩的燈籠紙與竹炭。'], label: '調查' },
      ...PAPER_LAMPS.map(([x, y]) => ({ t: 'red_lantern', x, y, hang: true, color: '#f4efe4', text: '芷' })),
    ],
    lights: (st) => [{ x: 5.5, y: 2.5, r: 150, color: '#dfe9ff', flicker: 0 }].concat(st.flags.ch11_letters ? [] : [{ x: 5.5, y: 1.6, r: 46, color: '#bff3ff', flicker: 0.2 }]),
    events: [
      { id: 'c11_09', trigger: 'auto', if: (st) => !st.flags.ch11_cell_in, run: (S) => H.c11_09a(S) },
      ...PAPER_LAMPS.map(([x, y], i) => ({ id: 'letter' + (i + 1), trigger: 'action', x, y, label: '調查', run: (S) => H.letter(S, i) })),
      { id: 'wall', trigger: 'action', x: 11, y: 2, w: 1, h: 6, label: '調查', run: (S) => H.wallWriting(S) },
      { id: 'window', trigger: 'action', x: 5, y: 1, w: 2, h: 1, label: '調查', run: async (S) => {
        if (F('ch11_letters')) await S.say('', '小小的窗。看得見海。'); else await S.say('', '窗台上放著一支玉笛，發著一點點光。旁邊的紙燈，還沒有讀完。');
      } },
    ],
    warps: [{ x: 6, y: 8, to: 'xuanwu_1f', tx: 2, ty: 6, tdir: 'down', door: true }],
    drawGround: (ctx, t) => {
      // starlight patch from the window
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(6 * T, 4 * T, 10, 6 * T, 4 * T, 150);
      g.addColorStop(0, 'rgba(220,232,255,0.22)'); g.addColorStop(1, 'rgba(220,232,255,0)');
      ctx.fillStyle = g; ctx.fillRect(3 * T, 2 * T, 6 * T, 5 * T);
      ctx.restore();
      if (!F('ch11_letters')) { // the jade flute on the sill
        ctx.save(); ctx.strokeStyle = '#cfeedd'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(5.2 * T, 1.75 * T); ctx.lineTo(6.6 * T, 1.7 * T); ctx.stroke(); ctx.restore();
      }
    },
  });

  // ---- 逆潮台 (24×20)
  function topTiles() {
    const g = grid(24, 20, 'U');
    disc(g, 11.5, 9, 9.6, 'Y', 7.8);
    fill(g, 11, 16, 2, 4, 'H');
    return rows(g);
  }
  G.Maps.define('xuanwu_top', {
    name: '逆潮台',
    subtitle: '玄武嶼之巔',
    place: 'penghu',
    bgm: (st) => (st.flags.ch11_jailer ? 'villain' : 'palace'),
    start: [12, 17],
    light: (st) => (st.flags.ch11_jailer ? { ambient: 0.6, color: '#060a1e', playerR: 220 } : { ambient: 0.7, color: '#02060f', playerR: 200 }),
    particles: (st) => (st.flags.ch11_jailer ? ['motes', 'wind'] : [{ type: 'motes', density: 1.5 }]),
    tiles: topTiles(),
    objects: [{ t: 'lighthouse_lamp', x: 11, y: 7, interact: ['一盞三層樓高的巨燈。光筆直地刺向西方，像一根釘子，把整片夜空釘在原地。'], label: '調查' }],
    lights: (st) => (st.flags.ch11_jailer ? [] : [{ x: 11.5, y: 7.5, r: 420, color: '#7fc8ff', flicker: 0.1 }]),
    events: [
      { id: 'c11_10', trigger: 'auto', if: (st) => !st.flags.ch11_jailer, run: (S) => H.c11_10(S) },
    ],
    warps: [{ x: 11, y: 19, w: 2, to: 'xuanwu_1f', tx: 22, ty: 5, tdir: 'down' }],
    drawGround: (ctx, t) => {
      // 逆潮陣: concentric rune circles
      const x = 12 * T, y = 8.6 * T;
      ctx.save(); ctx.strokeStyle = F('ch11_jailer') ? 'rgba(120,140,170,0.25)' : `rgba(110,190,255,${0.35 + 0.15 * Math.sin(t * 2)})`; ctx.lineWidth = 2;
      for (const r of [150, 230, 310]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2 + (F('ch11_jailer') ? 0 : t * 0.1); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 160, y + Math.sin(a) * 99); ctx.lineTo(x + Math.cos(a) * 220, y + Math.sin(a) * 136); ctx.stroke(); }
      ctx.restore();
    },
    drawOver: (ctx, t, ms) => {
      if (!F('ch11_jailer')) {
        // the beam pinning the night: straight west across the sky
        const x = 12 * T, y = 6.4 * T;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x, 0, x - 1800, 0);
        g.addColorStop(0, 'rgba(160,220,255,0.75)'); g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 1800, y - 10 - Math.sin(t * 3) * 2, 1800, 20 + Math.sin(t * 3) * 4);
        ctx.globalAlpha = 0.5; ctx.drawImage(G.FX.glowSprite('#bfe6ff'), x - 60, y - 60, 120, 120);
        ctx.restore();
      } else if (ms._shatter != null) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const k = Math.min(1, (t - ms._shatter) / 1.5);
        for (let i = 0; i < 40; i++) { const a = U.hash(i, 1, 4) * Math.PI * 2, r = k * (80 + U.hash(i, 2, 4) * 260); ctx.globalAlpha = 1 - k; ctx.drawImage(G.FX.glowSprite('#9fd8ff'), 12 * T + Math.cos(a) * r - 6, 6.4 * T + Math.sin(a) * r - 6, 12, 12); }
        ctx.restore();
      }
      drawDipper(ctx, t);
    },
  });

  // =================================================================================================
  // MAP: farshore_field 彼岸花原 (56×44)
  // =================================================================================================
  const dawnShore = (st) => !!st.flags.ch11_done;
  function fieldTiles(st) {
    const g = grid(56, 44, 'L');
    fill(g, 0, 0, 56, 3, '~'); fill(g, 22, 0, 12, 4, 'L');
    fill(g, 0, 41, 56, 3, '~'); fill(g, 21, 40, 11, 1, 'k'); fill(g, 27, 41, 2, 2, 'k');
    fill(g, 26, 3, 4, 37, '*');                       // the glowing path
    fill(g, 31, 10, 7, 6, '~'); fill(g, 30, 12, 4, 1, 'k');   // 小渡口 pond & jetty
    path(g, [[26, 21], [12, 21], [10, 14]], '*', 1); path(g, [[29, 18], [44, 14]], '*', 1);
    for (let y = 3; y < 41; y++) for (let x = 0; x < 56; x++) if (g[y][x] === 'L' && U.hash(x, y, 61) < 0.05) g[y][x] = ',';
    return rows(g);
  }
  G.Maps.define('farshore_field', {
    name: '彼岸花原',
    subtitle: (st) => (dawnShore(st) ? '彼岸・黎明' : '花開不見葉'),
    place: 'farshore',
    bgm: (st) => (dawnShore(st) ? 'love' : 'farshore'),
    start: [27, 39],
    light: (st) => (dawnShore(st) ? { ambient: 0.12, color: '#3a2a3a', tint: 'rgba(255,220,180,0.18)' } : { ambient: 0.45, color: '#1a0a24', tint: 'rgba(255,150,120,0.1)', playerR: 220 }),
    particles: [{ type: 'petals', density: 1.2 }, 'motes'],
    tiles: fieldTiles,
    objects: (() => {
      const o = [
        { t: 'lighthouse', x: 26, y: 0, door: 1, beam: false },
        { t: 'wang_boat', x: 21, y: 41, water: true, if: (st) => leg(st) >= 5 && !st.vars.c11_boat_gone },
        { t: 'stall', x: 23, y: 30, text: '茶', counter: true },
        { t: 'grave', x: 10, y: 15, interact: ['無主的木牌，寫著被遺忘的名字。字跡已經模糊了。'], label: '調查' },
        { t: 'grave', x: 15, y: 18 }, { t: 'grave', x: 7, y: 26 }, { t: 'grave', x: 41, y: 22 },
      ];
      for (const [x, y] of [[25, 8], [30, 16], [25, 24], [30, 34], [25, 37]]) o.push({ t: 'stone_lantern', x, y, lit: false, interact: ['倒塌的古燈籠。燈裡沒有火。'], label: '調查' });
      for (const [x, y] of [[4, 8], [9, 6], [15, 9], [3, 13], [17, 13], [6, 19], [13, 22], [2, 24], [16, 26], [20, 11], [8, 33], [48, 30], [38, 27], [52, 20]]) o.push({ t: 'tree_dead', x, y });
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(U.hash(i, 1, 66) * 54) + 1, y = Math.floor(U.hash(i, 2, 66) * 36) + 4;
        if ((x >= 25 && x <= 30) || (x >= 30 && x <= 38 && y >= 9 && y <= 16) || (x >= 21 && x <= 25 && y >= 28 && y <= 32)) continue;
        o.push({ t: 'lily', x, y });
      }
      return o;
    })(),
    chests: [
      { id: 'c11_13', x: 13, y: 8, item: 'c11_hd_higan', n: 1 },
      { id: 'c11_14', x: 6, y: 14, item: 'c11_higan_tea', n: 3 },
      { id: 'c11_15', x: 11, y: 30, item: 'huanhundan', n: 2 },
      { id: 'c11_16', x: 43, y: 30, item: 'c11_lamp_oil', n: 3 },
    ],
    lights: (st) => [{ x: 27, y: 1, r: 260, color: dawnShore(st) ? '#fff4dc' : '#ffe0b0', flicker: dawnShore(st) ? 0.05 : 0.6 }, { x: 30, y: 12, r: 120, color: '#ffe6b0', flicker: 0.15 }],
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', x: 28, y: 40, dir: 'up', if: (st) => !st.flags.ch11_done, talk: (S) => H.chenboShore(S) },
      { id: 'fs_teawoman', sprite: 'old_f', name: '茶婆', x: 23, y: 29, dir: 'down', ghost: true, fixedDir: true, if: (st) => !dawnShore(st), talk: (S) => H.teawoman(S) },
      { id: 'fs_waiting_f', sprite: 'ghost_f', name: '等人的婦人', x: 44, y: 12, dir: 'left', ghost: true, talk: (S) => H.waitingWoman(S) },
      { id: 'fs_oldman', sprite: 'ghost_m', name: '看名牌的老人', x: 10, y: 16, dir: 'up', ghost: true, talk: (S) => H.nameplate(S) },
      { id: 'fs_child', sprite: 'ghost_child', name: '撿花瓣的孩子', x: 50, y: 12, dir: 'left', ghost: true, wander: 1, talk: (S) => H.petalChild(S) },
      { id: 'fs_suwan', sprite: 'c11_suwan', name: '蘇婉', x: 30, y: 13, dir: 'left', ghost: true, light: { r: 140, color: '#ffe6b0' }, if: (st) => !dawnShore(st), talk: (S) => H.suwan(S) },
      { id: 'fs_ts_mother', sprite: 'c11_ts_mother', name: '唐山阿婆', x: 30, y: 11, dir: 'right', ghost: true, light: { r: 70, color: '#ffd8a0' }, if: (st) => !st.flags.ch11_tangshan_done && !dawnShore(st), talk: (S) => H.tsMother(S) },
      { id: 'fs_amu_pair', sprite: 'c11_amu_young', name: '少年阿木', x: 31, y: 9, dir: 'down', ghost: true, if: (st) => st.flags.ch11_tangshan_done && !dawnShore(st),
        talk: [['少年阿木', '阮兩个，做伙等。燈若光，阮就欲行矣。']] },
      { id: 'fs_soul1', sprite: 'ghost_m', name: '繞著枯樹走的魂', x: 15, y: 10, dir: 'down', ghost: true, wander: 2, if: (st) => !dawnShore(st), talk: [['繞著枯樹走的魂', '這棵樹……我是不是已經繞過了？']] },
      { id: 'fs_soul2', sprite: 'ghost_f', name: '坐著的魂', x: 46, y: 24, dir: 'left', ghost: true, if: (st) => !dawnShore(st), talk: [['坐著的魂', '燈不亮，路就看不見。看不見，就只好坐著。']] },
      { id: 'fs_soul3', sprite: 'ghost_child', name: '小小的魂', x: 36, y: 33, dir: 'up', ghost: true, wander: 1, if: (st) => !dawnShore(st), talk: [['小小的魂', '大哥哥，你身上好暖。可以借我暖一下下嗎？']] },
      { id: 'fs_fisher_end', sprite: 'fisherman', name: '漁夫', x: 45, y: 12, dir: 'left', ghost: true, if: dawnShore, talk: [['漁夫', '阿秀！']] },
    ],
    enemies: [
      { id: 'fs1', troop: 'farshore_1', x: 10, y: 11, art: 'lily_demon', lv: 42, radius: 3, if: (st) => !dawnShore(st) },
      { id: 'fs2', troop: 'farshore_2', x: 18, y: 24, art: 'faceless', lv: 42, radius: 3, if: (st) => !dawnShore(st) },
      { id: 'fs3', troop: 'farshore_3', x: 40, y: 20, art: 'faceless', lv: 42, radius: 3, if: (st) => !dawnShore(st) },
      { id: 'fs4', troop: 'farshore_1', x: 46, y: 33, art: 'lily_demon', lv: 42, radius: 3, if: (st) => !dawnShore(st) },
      { id: 'fs5', troop: 'blacktide_1', x: 14, y: 38, art: 'drowned_swarm', lv: 41, radius: 2, if: (st) => !dawnShore(st) },
      { id: 'fs6', troop: 'farshore_2', x: 38, y: 6, art: 'faceless', lv: 42, radius: 3, if: (st) => !dawnShore(st) },
    ],
    events: [
      { id: 'c11_16', trigger: 'auto', if: (st) => leg(st) >= 5 && !st.flags.ch11_farshore, run: (S) => H.c11_16(S) },
      { id: 'c11_17a', trigger: 'touch', x: 26, y: 30, w: 4, h: 6, once: true, if: (st) => !st.flags.ch11_done, run: (S) => H.c11_17a(S) },
      { id: 'c11_17b', trigger: 'touch', x: 26, y: 11, w: 4, h: 4, if: (st) => !st.flags.ch11_wife_met, run: (S) => H.c11_17b(S) },
      { id: 'ts3', trigger: 'touch', x: 26, y: 9, w: 4, h: 6, if: (st) => st.flags.ch11_tangshan_letter && !st.flags.ch11_tangshan_done && st.flags.ch11_wife_met, run: (S) => H.tangshan3(S) },
      { id: 'board', trigger: 'action', x: 21, y: 41, w: 6, h: 2, label: '上船', if: (st) => leg(st) >= 5 && !st.flags.ch11_done, run: async (S) => { await S.warp(DECK, 25, 8, 'left'); } },
    ],
    warps: [{ x: 27, y: 2, to: 'farshore_tower_1', tx: 11, ty: 20, tdir: 'up', door: true }],
    drawOver: (ctx, t, ms) => {
      // 天空：紫、金、深藍融在一起 — and the far tower lamp breathing (screen space, gentle)
      ctx.save(); ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
      const g = ctx.createLinearGradient(0, 0, G.W, 0);
      const ph = Math.sin(t * 0.15) * 0.5 + 0.5;
      g.addColorStop(0, `rgba(120,60,160,${0.08 + 0.04 * ph})`); g.addColorStop(0.5, `rgba(255,190,90,${0.06 + 0.04 * (1 - ph)})`); g.addColorStop(1, `rgba(40,60,140,${0.08 + 0.04 * ph})`);
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
      ctx.restore();
      if (!dawnShore(G.state)) {
        const x = 27.5 * T, y = -1.6 * T, k = 0.5 + 0.5 * Math.sin(t * 1.3) * Math.sin(t * 0.47);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.5 * k;
        ctx.drawImage(G.FX.glowSprite('#fff0c8'), x - 70, y - 70, 140, 140); ctx.restore();
      }
      drawDipper(ctx, t);
    },
  });

  // =================================================================================================
  // 彼岸燈塔 1F–5F + 頂 (24×24 each, circular)
  // =================================================================================================
  const P3_PLANKS = [[12, 17], [12, 16], [13, 16], [13, 15], [14, 15], [14, 12], [13, 12], [12, 12], [11, 12], [11, 11], [11, 10], [11, 9], [12, 9], [12, 8], [12, 7], [12, 6]];
  const P3_WAVE = [8, 9, 10, 11];
  const p3Active = (st) => st.flags.ch11_tower_3 && !st.flags.ch11_p3_done;
  function towerTiles(n) {
    return (st) => {
      const g = grid(24, 24, ' ');
      disc(g, 11.5, 11.5, 11.6, 'P');
      disc(g, 11.5, 12, 9.4, 't', 9.0);
      fill(g, 10, 21, 3, 1, 't');
      if (n === 3 && p3Active(st)) {
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (g[y][x] === 't') g[y][x] = 'K';
        fill(g, 9, 18, 7, 4, 't'); fill(g, 14, 13, 2, 2, 'Y'); fill(g, 10, 3, 4, 3, 't');
        for (const [x, y] of P3_PLANKS) set(g, x, y, 'j');
      }
      return rows(g);
    };
  }
  function tower(n, o) {
    const id = 'farshore_tower_' + n;
    const flag = 'ch11_tower_' + n;
    const upOk = o.upOk || ((st) => !!st.flags[flag]);
    const lampX = o.lamp ? o.lamp[0] : 11, lampY = o.lamp ? o.lamp[1] : 11;
    G.Maps.define(id, {
      name: o.name, subtitle: '彼岸燈塔', place: 'farshore',
      bgm: o.bgm || 'lighthouse',
      start: [11, 20],
      light: o.light || { ambient: 0.5, color: '#14101c', playerR: 220 },
      particles: o.particles || ['motes'],
      tiles: towerTiles(n),
      objects: [
        { t: 'lighthouse_lamp', x: lampX, y: lampY },
        { t: 'stairs_up', x: 11, y: 3 },
        ...(n > 1 ? [{ t: 'stairs_down', x: 11, y: 21 }] : []),
        ...(o.objects || []),
      ],
      chests: o.chests || [],
      lights: (st) => [{ x: lampX + 0.5, y: lampY + 0.2, r: 260, color: '#fff4dc', flicker: 0.2 }].concat(o.lights ? o.lights(st) : []),
      npcs: o.npcs || [],
      enemies: o.enemies || [],
      events: [
        { id: 'echo', trigger: 'action', x: lampX, y: lampY, w: 2, h: 2, label: '回聲燈', run: (S) => (F(flag) ? S.say('', '回聲燈靜靜地燃著。白色的光，一點溫度也沒有——又好像有。') : o.echo(S)) },
        { id: 'up_block', trigger: 'touch', x: 11, y: 3, if: (st) => !upOk(st), run: async (S) => {
          S.sfx('buzz'); await S.say('', o.blocked || '往上的石階被一層白光封住了。回聲燈還在等著。'); S.setPos('player', 11, 4, 'down');
        } },
        ...(o.events || []),
      ],
      warps: [
        { x: 11, y: 3, to: o.up, tx: o.upX || 11, ty: o.upY || 20, tdir: 'up', if: upOk },
        n === 1 ? { x: 10, y: 21, w: 3, to: 'farshore_field', tx: 27, ty: 4, tdir: 'down', door: true }
          : { x: 11, y: 21, to: 'farshore_tower_' + (n - 1), tx: 11, ty: 5, tdir: 'down' },
      ],
      onUpdate: o.onUpdate,
      drawGround: o.drawGround,
      drawOver: (ctx, t, ms) => { if (!upOk(G.state)) drawCurtain(ctx, t, 11, 3, 1, 1, '#ffffff'); if (o.drawOver) o.drawOver(ctx, t, ms); },
    });
  }
  // 1F 紅之層
  tower(1, { name: '燈塔一樓・紅之層', up: 'farshore_tower_2', echo: (S) => H.c11_18(S),
    chests: [{ id: 'c11_t1', x: 16, y: 8, item: 'c11_sp_chixiao', n: 1, if: (st) => !!st.flags.ch11_tower_1 }],
    enemies: [{ id: 't1a', troop: 'tower_1', x: 7, y: 8, art: 'tower_warden', lv: 43, radius: 2 }],
    npcs: [] });
  // 2F 雲之層 + P2 五行生生
  const WX = [{ k: '水', x: 12, y: 5 }, { k: '火', x: 16, y: 7 }, { k: '金', x: 15, y: 15 }, { k: '木', x: 8, y: 15 }, { k: '土', x: 7, y: 7 }];
  const WX_ORDER = ['木', '火', '土', '金', '水'];
  tower(2, { name: '燈塔二樓・雲之層', up: 'farshore_tower_3', echo: (S) => H.c11_19(S),
    upOk: (st) => !!st.flags.ch11_wuxing_puzzle,
    blocked: '往上的門前，五根符柱靜靜地立著。門上的字：「始於春，生生不息。」',
    objects: WX.flatMap((p, i) => [
      { t: 'stone_lantern', x: p.x, y: p.y, lit: false, if: (st) => st.flags.ch11_tower_2 && !((st.vars.ch11_wx || 0) > WX_ORDER.indexOf(p.k)) },
      { t: 'stone_lantern', x: p.x, y: p.y, if: (st) => st.flags.ch11_tower_2 && (st.vars.ch11_wx || 0) > WX_ORDER.indexOf(p.k) },
    ]),
    events: WX.map((p) => ({ id: 'wx_' + p.x, trigger: 'action', x: p.x, y: p.y, label: '符柱', if: (st) => st.flags.ch11_tower_2 && !st.flags.ch11_wuxing_puzzle, run: (S) => H.wuxing(S, p.k) })),
    chests: [{ id: 'c11_t2', x: 17, y: 10, item: 'c11_fn_taixu_lei', n: 1, if: (st) => !!st.flags.ch11_wuxing_puzzle }],
    enemies: [{ id: 't2a', troop: 'tower_2', x: 6, y: 12, art: 'faceless', variant: 1, lv: 43, radius: 2, if: (st) => !!st.flags.ch11_tower_2 }],
    drawOver: (ctx, t) => {
      if (!F('ch11_tower_2')) return;
      for (const p of WX) R().text(ctx, p.k, p.x * T + T / 2, p.y * T - 70, { size: 26, bold: true, align: 'center', color: '#fff0c8', stroke: 'rgba(40,20,10,0.8)', strokeW: 4 });
    } });
  // 3F 舊潮之層 + P3 沉板
  tower(3, { name: '燈塔三樓・舊潮之層', up: 'farshore_tower_4', echo: (S) => H.c11_20(S), lamp: [14, 19],
    upOk: (st) => !!st.flags.ch11_p3_done,
    blocked: '往上的路，是浮在回聲海面上的一排木板。',
    bgm: (st) => (p3Active(st) ? 'sea' : 'lighthouse'),
    particles: (st) => (p3Active(st) ? [{ type: 'mist', alpha: 0.2 }, 'rain'] : ['motes']),
    light: (st) => (p3Active(st) ? { ambient: 0.62, color: '#040814', playerR: 230 } : { ambient: 0.5, color: '#14101c', playerR: 220 }),
    chests: [{ id: 'c11_t3', x: 15, y: 13, item: 'c11_ac_old_tassel', n: 1 }],
    events: [
      { id: 'p3_done', trigger: 'touch', x: 10, y: 3, w: 4, h: 3, if: p3Active, run: (S) => H.p3Done(S) },
    ],
    onUpdate: (dt, ms, busy) => H.p3Update(dt, ms, busy),
    drawGround: (ctx, t, ms) => H.p3Draw(ctx, t, ms) });
  // 4F 火之層
  tower(4, { name: '燈塔四樓・火之層', up: 'farshore_tower_5', echo: (S) => H.c11_21(S),
    enemies: [{ id: 't4a', troop: 'tower_3', x: 16, y: 14, art: 'inner_demon', variant: 1, lv: 43, radius: 2 }] });
  // 5F 燈之層 + 她的記憶 + 千年燈塔守
  const MEM = [
    { k: 1, a: [6, 12] }, { k: 2, a: [18, 6] }, { k: 3, a: [17, 16] }, { k: 4, a: [5, 8], b: [10, 5], shy: true }, { k: 5, a: [12, 17] }, { k: 6, a: [15, 5], b: [18, 10], shy: true },
  ];
  tower(5, { name: '燈塔五樓・燈之層', up: 'farshore_tower_top', upX: 7, upY: 11, echo: (S) => H.c11_22(S),
    upOk: (st) => !!st.flags.ch11_warden,
    blocked: '石階口，站著一具高大的青銅守燈人。',
    bgm: (st) => (st.flags.ch11_tower_5 && !st.flags.ch11_warden ? 'farshore' : 'lighthouse'),
    chests: [{ id: 'c11_t5', x: 14, y: 4, item: 'huanhundan', n: 2, run: async (S) => { await S.give('c11_lamp_oil', 2); } }],
    npcs: [{ id: 'warden', sprite: 'lighthouse_keeper', name: '千年燈塔守', x: 12, y: 4, dir: 'down', fixedDir: true, if: (st) => !st.flags.ch11_warden, talk: (S) => H.c11_23(S) }],
    events: [{ id: 'c11_23', trigger: 'touch', x: 9, y: 5, w: 6, h: 2, if: (st) => st.flags.ch11_tower_5 && !st.flags.ch11_warden, run: (S) => H.c11_23(S) }],
    onUpdate: (dt, ms, busy) => H.memUpdate(dt, ms, busy),
    drawOver: (ctx, t, ms) => H.memDraw(ctx, t, ms) });
  // 頂 燈心之門 (16×14)
  G.Maps.define('farshore_tower_top', {
    name: '燈心之門', subtitle: '彼岸燈塔・頂', place: 'farshore',
    bgm: null,
    start: [7, 11],
    light: { ambient: 0.55, color: '#0c0814', playerR: 200 },
    particles: [{ type: 'motes', density: 0.8 }],
    tiles: (() => { const g = grid(16, 14, ' '); disc(g, 7.5, 7, 7.6, 'P', 6.8); disc(g, 7.5, 7.6, 5.8, 't', 5.2); fill(g, 7, 2, 2, 1, 't'); return rows(g); })(),
    objects: [
      { t: 'stairs_down', x: 7, y: 12 },
      { t: 'water_lantern', x: 4, y: 9, interact: async (S) => { await S.say('', '一盞自己亮起來的小水燈。……這盞燈，是誰放在這裡的呢？'); if (await S.choice(['在這裡整理行囊（存檔）', '不用了'], { cancel: 1 }) === 0) await S.saveMenu(); }, label: '調查' },
    ],
    lights: [{ x: 7.5, y: 1.8, r: 260, color: '#fff4dc', flicker: 0.5 }, { x: 4, y: 9, r: 90, color: '#ffd890', flicker: 0.2 }],
    events: [{ id: 'c11_24', trigger: 'auto', if: (st) => !st.flags.ch11_breath, run: (S) => H.c11_24(S) }],
    warps: [{ x: 7, y: 12, to: 'farshore_tower_5', tx: 11, ty: 5, tdir: 'down' }],
    drawOver: (ctx, t) => {
      // the door of light wrapped in six black chains; the great white flame behind it, weak
      const x = 8 * T, y = 2.4 * T;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const k = 0.55 + 0.3 * Math.sin(t * 1.1) * Math.sin(t * 0.37);
      ctx.globalAlpha = k; ctx.drawImage(G.FX.glowSprite('#fff4dc'), x - 120, y - 170, 240, 240);
      ctx.globalAlpha = 0.9; ctx.fillStyle = 'rgba(255,246,220,0.55)';
      ctx.beginPath(); ctx.moveTo(x - 46, y + 10); ctx.lineTo(x - 46, y - 110); ctx.quadraticCurveTo(x, y - 160, x + 46, y - 110); ctx.lineTo(x + 46, y + 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (!F('ch11_breath')) {
        ctx.save(); ctx.strokeStyle = 'rgba(14,10,20,0.9)'; ctx.lineWidth = 6;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 60 + i * 24, y - 130 + (i % 2) * 30); ctx.quadraticCurveTo(x, y - 60 + i * 6, x + 60 - i * 20, y + 4 - (i % 3) * 30); ctx.stroke(); }
        ctx.restore();
      }
    },
  });

  // =================================================================================================
  // MAP: breath_realm 一息界 (40×40) — breath terrain, psychedelic overlay, 萬象童子, 光之曼陀羅 (P4)
  // =================================================================================================
  const MO = { x: 15, y: 2 };      // mandala origin; local (x,y) → (15+x, 2+y)
  const MIRRORS = [[4, 6], [1, 6], [1, 1], [7, 1], [7, 4]];
  const LOTUS = [{ x: 2, y: 6, c: '#ff5a6a' }, { x: 4, y: 1, c: '#6ab0ff' }, { x: 7, y: 3, c: '#ffd04a' }];
  const SRC = [4, 8], SEAT = [4, 4];
  const mirrors = () => { const v = V(); if (!v.ch11_mirrors) v.ch11_mirrors = ['/', '\\', '\\', '\\', '\\']; return v.ch11_mirrors; };
  // trace the light: returns {cells:[[x,y]...], lotus:Set(idx), seat:bool}
  function traceLight() {
    const m = mirrors();
    let [x, y] = SRC, dx = 0, dy = -1;
    const cells = [], lot = new Set();
    for (let n = 0; n < 60; n++) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x > 8 || y > 8) break;
      cells.push([x, y]);
      LOTUS.forEach((l, i) => { if (l.x === x && l.y === y) lot.add(i); });
      if (x === SEAT[0] && y === SEAT[1]) return { cells, lotus: lot, seat: true };
      const mi = MIRRORS.findIndex(([mx, my]) => mx === x && my === y);
      if (mi >= 0) {
        if (m[mi] === '/') [dx, dy] = [-dy, -dx];   // N→E, E→N, S→W, W→S
        else [dx, dy] = [dy, dx];                    // N→W, W→N, S→E, E→S
      }
    }
    return { cells, lotus: lot, seat: false };
  }
  function breathTiles() {
    const g = grid(40, 40, ' ');
    disc(g, 19.5, 34, 4.6, 'Z', 3.8);
    fill(g, 17, 26, 6, 5, 'Z');
    disc(g, 19.5, 19.5, 9.8, 'Z', 7.2);
    fill(g, 17, 11, 6, 3, 'Z');
    fill(g, 15, 2, 9, 9, 'Z');
    return rows(g);
  }
  G.Maps.define('breath_realm', {
    name: '一息界', subtitle: '呼與吸之間', place: 'farshore',
    bgm: 'breath',
    start: [19, 34],
    noSave: false,
    light: { ambient: 0 },
    psychedelic: 0.55,
    particles: ['sparkles', { type: 'motes', density: 1.5 }],
    tiles: breathTiles(),
    objects: (() => {
      const o = [];
      MIRRORS.forEach(([x, y], i) => o.push({ t: 'crystal', x: MO.x + x, y: MO.y + y, interact: async (S) => H.mirror(S, i), label: '轉動' }));
      LOTUS.forEach((l) => o.push({ t: 'jewel_flower', x: MO.x + l.x, y: MO.y + l.y }));
      o.push({ t: 'geometry_pillar', x: MO.x + SRC[0], y: MO.y + SRC[1] });
      for (const [x, y] of [[15, 32], [24, 32], [16, 36], [23, 36], [12, 17], [27, 17], [12, 22], [27, 22], [16, 27], [23, 29], [13, 19], [26, 20]]) o.push({ t: U.hash(x, y, 3) < 0.5 ? 'jewel_flower' : 'geometry_pillar', x, y });
      for (const [x, y] of [[18, 37], [21, 31], [15, 24], [24, 15], [17, 12], [22, 12]]) o.push({ t: 'crystal', x, y });
      return o;
    })(),
    npcs: [
      { id: 'tz1', sprite: 'c11_tongzi', name: '萬象童子', x: 16, y: 20, dir: 'right', wander: 1, talk: (S) => H.tongziTalk(S, 0) },
      { id: 'tz2', sprite: 'c11_tongzi', name: '萬象童子', x: 20, y: 18, dir: 'down', talk: (S) => H.tongziTalk(S, 1) },
      { id: 'tz3', sprite: 'c11_tongzi', name: '萬象童子', x: 24, y: 20, dir: 'left', wander: 1, talk: (S) => H.tongziTalk(S, 2) },
      { id: 'tz4', sprite: 'c11_tongzi', name: '萬象童子', x: 23, y: 10, dir: 'left', if: (st) => !!st.flags.ch11_tongzi_met, talk: (S) => H.mandalaHint(S) },
    ],
    events: [
      { id: 'c11_25', trigger: 'touch', x: 13, y: 22, w: 14, h: 5, if: (st) => !st.flags.ch11_tongzi_met, run: (S) => H.c11_25(S) },
      { id: 'c11_26a', trigger: 'touch', x: 15, y: 9, w: 9, h: 2, once: true, if: (st) => !!st.flags.ch11_tongzi_met, run: (S) => H.c11_26a(S) },
      { id: 'c11_25b', trigger: 'touch', x: 17, y: 11, w: 6, h: 3, if: (st) => !st.flags.ch11_tongzi_met, run: async (S) => { await S.say('', '寶石的牆輕輕地笑了一聲，把路摺了回去。'); S.setPos('player', 19, 22, 'down'); } },
    ],
    onEnter: async () => { const m = G.mapScene; if (m) for (const n of m.npcs) if (/^tz|^tzold/.test(n.id)) n.alpha = 0; },
    onUpdate: (dt, ms, busy) => H.breathUpdate(dt, ms, busy),
    drawGround: (ctx, t, ms) => H.breathGround(ctx, t, ms),
    drawOver: (ctx, t, ms) => H.breathOver(ctx, t, ms),
  });

  // =================================================================================================
  // MAP: lamp_heart 燈心 (24×20)
  // =================================================================================================
  G.Maps.define('lamp_heart', {
    name: '燈心', subtitle: '一息之內', place: 'farshore',
    bgm: (st) => (st.flags.ch11_done ? 'love' : null),
    start: [12, 18],
    light: (st) => ({ ambient: st.flags.ch11_done ? 0.1 : 0.2, color: '#06040c', playerR: 160 }),
    particles: [{ type: 'motes', density: 1.2 }, 'embers'],
    tiles: (() => { const g = grid(24, 20, ' '); disc(g, 11.5, 10, 11.2, '*', 9.4); return rows(g); })(),
    pass: [{ x: 10, y: 5, w: 4, h: 4, solid: true }],
    objects: [{ t: 'soul_jar', x: 14, y: 11, if: (st) => !st.flags.ch11_reunion }],
    lights: (st) => {
      const k = st.vars.ch11_flame == null ? 1 : st.vars.ch11_flame;
      return [{ x: 11.5, y: 6.5, r: 120 + 400 * k, color: k < 0.15 ? '#ff7a4a' : '#fff4dc', flicker: 0.35 }];
    },
    npcs: [
      { id: 'yexuan', sprite: 'yexuan', portrait: 'yexuan', x: 12, y: 11, dir: 'up', if: (st) => !st.flags.ch11_yx_taken, talk: [['yexuan:sad', '……']] },
    ],
    events: [
      { id: 'c11_27', trigger: 'auto', if: (st) => !st.flags.ch11_reunion, run: (S) => H.c11_27(S) },
      { id: 'c11_28', trigger: 'auto', if: (st) => st.flags.ch11_reunion && !st.flags.ch11_yexuan, run: (S) => H.c11_28(S) },
      { id: 'c11_29', trigger: 'auto', if: (st) => st.flags.ch11_yexuan && !st.flags.ch11_done, run: (S) => H.c11_29(S) },
    ],
    drawGround: (ctx, t, ms) => H.heartGround(ctx, t, ms),
    drawOver: (ctx, t, ms) => H.heartOver(ctx, t, ms),
  });

  // =================================================================================================
  // ENDING STAGES
  // =================================================================================================
  G.Maps.define('ending_badouzi', {
    name: '八斗子', subtitle: (st) => (st.vars.c11_badouzi === 'oar' ? '某一天' : '七月十五　中元'), place: 'badouzi', autosave: false, noSave: true,
    bgm: null,
    start: [11, 9],
    light: { ambient: 0.55, color: '#040818', playerR: 160 },
    particles: [{ type: 'lanterns', density: 0.6 }],
    tiles: (() => {
      const g = grid(24, 14, 's');
      fill(g, 0, 0, 24, 6, ',');
      fill(g, 3, 0, 2, 7, 'H');
      fill(g, 0, 10, 24, 4, '~');
      for (let x = 0; x < 24; x++) if (U.hash(x, 9, 4) < 0.3) set(g, x, 9, '-');
      return rows(g);
    })(),
    objects: (() => {
      const o = [{ t: 'rock_big', x: 11, y: 7 }, { t: 'rock_small', x: 18, y: 8 }, { t: 'driftwood', x: 6, y: 8 }, { t: 'tree_pine', x: 1, y: 2 }, { t: 'tree_pine', x: 21, y: 1 }, { t: 'bush', x: 8, y: 4 }, { t: 'stone_lantern', x: 5, y: 5 }];
      for (let i = 0; i < 16; i++) o.push({ t: 'water_lantern', x: Math.floor(U.hash(i, 1, 9) * 24), y: 10 + Math.floor(U.hash(i, 2, 9) * 4) });
      return o;
    })(),
    npcs: [],
  });
  G.Maps.define('ending_jiufen', {
    name: '九份', subtitle: '一年後　七月', place: 'jiufen', autosave: false, noSave: true,
    bgm: (st) => (st.flags.ending_true ? 'ending' : 'sad'),
    start: [10, 10],
    light: { ambient: 0.5, color: '#0a0818', playerR: 200 },
    particles: ['motes'],
    tiles: (() => { const g = grid(22, 12, '#'); fill(g, 9, 0, 4, 12, 'H'); fill(g, 0, 0, 22, 2, 'X'); return rows(g); })(),
    objects: [
      { t: 'house_jiufen', x: 1, y: 2, w: 4, h: 3, door: 1, text: '陳記' }, { t: 'teahouse', x: 14, y: 1, door: 2 },
      { t: 'house_jiufen', x: 1, y: 7, w: 4, h: 3, door: -1 }, { t: 'house_jiufen', x: 16, y: 7, w: 4, h: 3, door: -1 },
      { t: 'stall', x: 6, y: 5, text: '芋圓', counter: true }, { t: 'lantern_string', x: 5, y: 3, w: 12 }, { t: 'lantern_string', x: 5, y: 8, w: 12 },
      { t: 'red_lantern', x: 8, y: 4 }, { t: 'red_lantern', x: 13, y: 6 }, { t: 'table', x: 6, y: 7 }, { t: 'chair', x: 5, y: 7, dir: 'right' }, { t: 'chair', x: 7, y: 7, dir: 'left' },
    ],
    npcs: [{ id: 'agan', sprite: 'shopkeeper_f', portrait: 'agan', name: '阿柑姨', x: 6, y: 4, dir: 'down' }],
  });
  G.Maps.define('ending_jiufen_shop', {
    name: '陳記燈籠舖', subtitle: '九份', place: 'jiufen', autosave: false, noSave: true,
    bgm: (st) => (st.flags.ending_true ? 'ending' : 'sad'),
    start: [7, 7],
    light: { ambient: 0.4, color: '#120a06', playerR: 180 },
    tiles: rows(room(14, 9, '_', 'W', [7])),
    objects: [
      { t: 'shelf_lanterns', x: 2, y: 2, w: 3 }, { t: 'shelf_lanterns', x: 9, y: 2, w: 3 }, { t: 'workbench', x: 5, y: 4 }, { t: 'lantern_frame', x: 8, y: 4 },
      { t: 'counter', x: 2, y: 6, w: 3 }, { t: 'paper_stack', x: 11, y: 5 }, { t: 'lantern_rack', x: 10, y: 6 }, { t: 'red_lantern', x: 6, y: 2, hang: true, text: '星' },
    ],
    lights: [{ x: 6, y: 4, r: 200, color: '#ffb060', flicker: 0.2 }],
    npcs: [{ id: 'chenbo_e', sprite: 'chenbo', portrait: 'chenbo', x: 6, y: 5, dir: 'down' }],
  });
  G.Maps.define('ending_lukang', {
    name: '鹿港・洛家古厝', subtitle: '一年後　七月', place: 'lukang', autosave: false, noSave: true,
    bgm: 'ending',
    start: [9, 9],
    light: { ambient: 0.08, color: '#3a2a1a', tint: 'rgba(255,200,140,0.12)' },
    particles: ['leaves'],
    tiles: (() => { const g = grid(18, 12, '%'); fill(g, 0, 0, 18, 1, 'R'); return rows(g); })(),
    objects: [
      { t: 'house_minnan', x: 6, y: 0, w: 6, h: 3, text: '洛' }, { t: 'house_minnan', x: 0, y: 3, w: 4, h: 3, door: -1 }, { t: 'house_minnan', x: 14, y: 3, w: 4, h: 3, door: -1 },
      { t: 'red_lantern', x: 5, y: 3, text: '洛' }, { t: 'red_lantern', x: 12, y: 3, text: '洛' }, { t: 'well', x: 2, y: 8 }, { t: 'plant_pot', x: 15, y: 9 }, { t: 'bench', x: 13, y: 8 },
    ],
    npcs: [
      { id: 'kid1', sprite: 'child_m', x: 6, y: 6, dir: 'down' }, { id: 'kid2', sprite: 'child_f', x: 8, y: 6, dir: 'down' },
      { id: 'kid3', sprite: 'child_m', x: 10, y: 6, dir: 'down' }, { id: 'kid4', sprite: 'child_m', x: 12, y: 6, dir: 'down' },
      { id: 'hy_e', sprite: 'hongying', portrait: 'hongying', x: 9, y: 9, dir: 'up' },
    ],
  });

  // =================================================================================================
  // SCRIPTS — all cutscenes & NPC talks (H.*)
  // =================================================================================================
  const H = {};
  const hasPouch = () => G.Inv.has('c11_mazu_pouch');

  // ---------------------------------------------------------------- 11-01 最後一夜
  H.c11_01 = async (S) => {
    V().ch11_leg = 0; V().ch11_moon = 0;
    S.hideFollowers(true);
    S.setPos('player', 15, 8, 'left');
    await L(S, [
      ['', '王船繞過島的北端，一路南下。太陽落進了海裡。'],
      ['', '月底，沒有月亮——滿天的星亮得不像話，銀河斜斜地掛在桅頂上。'],
      ['yungui:laugh', '風好順。貧道的酒葫蘆都被吹得嗚嗚叫了。'],
      ['hongying:smile', '頭城那面旗，搶得值得。'],
      ['xinghe:smug', '那可是我爬上去搶的。'],
      ['hongying:angry', '你爬到一半滑下來三次，最後是我踩著你的頭上去的。'],
      ['xinghe:smile', '所以是「我們」搶的。'],
      ['chenbo:serious', '……不對。'],
      ['xinghe:surprise', '什麼不對？風很順啊。'],
      ['chenbo:serious', '你們看天上。'],
      ['xinghe:think', '星星……很多。很亮。很……呃，好看？'],
      ['chenbo:angry', '臭小子。北斗的斗柄，從天黑到現在，一寸都沒轉過。'],
    ]);
    for (const id of ['player', 'deck_hy', 'deck_yg', 'deck_yy']) S.face(id, 'up');
    S.bgm(null); S.sfx('wind');
    await pause(S, 0.8);
    await S.say('', '北斗、銀河、滿天的星辰，像被釘在天上，連閃都不閃。帆一下子垂了下來。');
    await L(S, [
      ['yungui:serious', '星不移，潮不走，風不吹。……他把夜晚「釘」住了。'],
      ['hongying:surprise', '釘住？夜晚要怎麼釘？'],
      ['yungui:think', '鬼門今夜要關。可是門要關，總得等天亮。'],
      ['yungui:serious', '只要天不亮，門就關不上——逆潮就還有時間。'],
      ['xinghe:angry', '所以夜玄把今晚，拖成一個不會結束的晚上？'],
      ['yungui:smug', '貧道很想說一聲「好手段」。但貧道現在比較想揍他。'],
      ['yungui:surprise', '不會天亮……那、那貧道的早飯呢？'],
      ['hongying:normal', '……我有準備。'],
    ]);
    S.bgm('tension');
    S.emote('deck_hy', '♪');
    await S.say('', '紅纓從背後拿出一個冒著黑煙的布包。眾人同時後退一步。');
    await L(S, [
      ['hongying:shy', '最後一夜嘛。我想說……做點吃的。是飯糰。'],
      ['xinghe:think', '飯糰……為什麼是黑色的？'],
      ['hongying:angry', '是、是海苔！'],
      ['yungui:smug', '海苔不會冒煙。'],
    ]);
    await S.move('deck_yy', 'U');
    await S.say('', '芋圓慢吞吞地走上前，嗅了嗅，叼起一個，閉上眼，一口吞下。');
    for (let i = 0; i < 3; i++) { S.emote('deck_yy', '…'); await pause(S, 0.6); }
    await L(S, [
      ['', '芋圓翻倒在甲板上，四腳朝天。很有決心的樣子。'],
      ['hongying:laugh', '你看！芋圓說好吃！'],
      ['xinghe:smile', '（小聲）芋圓，你是真英雄。'],
      ['yungui:smug', '貧道會替牠念往生咒的。'],
    ]);
    S.emote('deck_mc', '…');
    await S.move('deck_yy', 'D');
    // 星河 goes to the bow; 陳伯 follows
    await S.walkTo('player', 6, 8);
    S.face('player', 'left');
    await S.say('', '鵝鑾鼻的燈火在燈罩裡安靜地跳動。星河低頭，摸了摸手腕上的紅繩。');
    await S.walkTo('chenbo', 8, 8);
    S.face('chenbo', 'left');
    await L(S, [
      ['chenbo:normal', '想她？'],
      ['xinghe:shy', '沒有。……有一點。'],
      ['xinghe:sad', '陳伯，半年了。她會不會……已經不記得我們了？'],
      ['chenbo:serious', '那就讓她重新記得。燈籠破了，就再糊一次紙。'],
      ['chenbo:smile', '你糊了十年燈籠。這點事，不會不會吧？'],
      ['xinghe:smile', '……嗯。'],
      ['', '遠方的海平線上，浮現點點燈火。'],
      ['yungui:normal', '前面是澎湖。媽宮的燈。'],
      ['chenbo:serious', '過了澎湖，就是黑水溝。要補給、要問路，只剩這裡了。'],
    ]);
    S.shake(8, 0.8); S.sfx('earth');
    for (const id of ['player', 'chenbo', 'deck_hy', 'deck_yg', 'deck_yy', 'deck_mc']) S.emote(id, '!');
    await L(S, [['xinghe:surprise', '觸、觸礁了？！'], ['chenbo:think', '……不是礁。是海底。']]);
    S.flag('ch11_start');
    await S.fadeOut(0.8);
    await S.warp(DECK, 6, 8, 'right', { reload: true, fade: 0 });
    S.hideFollowers(true);
    await S.fadeIn(0.8);
    await S.camera(14, 7, 1.0);
    await L(S, [
      ['', '海水退得乾乾淨淨。王船停在星光下裸露的海床上。遠處的漁船，一艘艘橫倒在泥灘上。'],
      ['chenbo:serious', '潮也被釘住了。退到最低，回不來。'],
      ['hongying:surprise', '船、船擱淺在路上了！'],
      ['chenbo:smug', '怕什麼。王船走的是千歲爺的水路——有沒有水，不打緊。'],
    ]);
    S.cameraFollow();
    S.shake(3, 1.2);
    await S.say('', '王船微微浮起半尺，像在冰上滑行一般，緩緩「駛」向媽宮的燈火。');
    S.quest('q_ch11_main', 0);
    S.objective('前往媽宮');
    await S.fadeOut(1.0);
    await S.warp('penghu_magong', 11, 7, 'right', { fade: 0 });
    await S.fadeIn(0.8);
  };

  // ---------------------------------------------------------------- 王船・甲板 talks & helm
  function deckStage() {
    if (!F('ch11_sail')) return 0;
    if (F('ch11_fog')) return 4;
    if (F('ch11_kun')) return 3;
    if (F('ch11_tangshan_met')) return 2;
    return 1;
  }
  const DECK_TALK = {
    hongying: [
      [['hongying:think', '天后宮的煙往西彎。跟鹿港那時一樣……我好像被誰摸了摸頭。']],
      [['hongying:surprise', '這麼多燈……每一盞都是一個人？'], ['hongying:sad', '……我爹娘，也在這裡面嗎？']],
      [['hongying:think', '那首歌……是唐山的調子吧？']],
      [['hongying:surprise', '牠在前面游……是在幫我們帶路嗎？']],
      [['hongying:angry', '……我才沒哭。']],
    ],
    yungui: [
      [['yungui:smug', '貧道算過了，從這裡到彼岸……算了，沒有路可以算。']],
      [['yungui:serious', '師父說過，黑水溝底下的魂，比島上活著的人還多。我一直以為他在誇張。']],
      [['yungui:normal', '船上的貧道負責驅鬼。貧道今天不想驅。']],
      [['yungui:smile', '化而為鳥，其名為鵬。……說不定哪天，牠真的會飛。']],
      [['yungui:think', '一千個人點的燈……原來是這個意思。']],
    ],
    yuyuan: [
      [['', '芋圓蹲在一桶澎湖丁香魚乾旁邊，一動也不動。看起來像在守，其實是在等。']],
      [['', '芋圓不肯往船舷外看。牠把背貼著星河的腳，尾巴一直膨著。']],
      [['', '芋圓的耳朵朝著暗流的方向，聽那首老調子聽得很專心。']],
      [['', '芋圓盯著前方的鯤，盯了很久，然後舔了舔嘴。'], ['xinghe:surprise', '……你不准想。']],
      [['', '芋圓把頭埋在星河的外套裡。牠的鬍子是濕的。']],
    ],
    mochi: [
      [['', '麻糬坐在船頭的香火袋下面，看著西邊。她總是看著有光的地方。']],
      [['', '麻糬望著海面上的漂燈，眼睛裡映著一盞一盞的光。她輕輕叫了一聲，像在打招呼。']],
      [['', '麻糬把一隻前爪搭在船舷上，看著暗流。她不怕。']],
      [['', '麻糬一直望著前方，尾巴輕輕地擺。……像在數，還有多遠。']],
      [['', '麻糬望著那道紅色的岸。她站起來，又坐下，又站起來。'], ['hongying:sad', '……她知道。她一直都知道白芷在那邊。']],
    ],
  };
  H.deckTalk = async (S, who) => {
    if (!F('ch11_start')) return;
    await L(S, DECK_TALK[who][deckStage()]);
  };
  async function seaEncounter(S) {
    if (autoplay()) return;
    const rate = hasPouch() ? 0.25 : 0.5;
    if (Math.random() < rate) {
      S.sfx('encounter');
      await S.say('', '船舷邊，黑水裡爬上來了什麼——');
      await S.battle(U.pick(['blacktide_1', 'blacktide_2', 'blacktide_3', 'blacktide_4']));
    }
  }
  async function cabinRest(S) {
    await S.fadeOut(0.8); G.Party.healAll(); S.sfx('heal'); await pause(S, 1.0); await S.fadeIn(0.8);
    S.toast('在船艙裡睡了一會兒。全員完全恢復。', 'lantern');
  }
  H.helm = async (S) => {
    if (!F('ch11_start')) { await S.say('chenbo:normal', '坐穩了。'); return; }
    if (!F('ch11_tianhou')) { await S.say('chenbo:normal', '先去廟裡。阿進伯在等。'); return; }
    if (!F('ch11_jailer')) {
      await S.say('chenbo:normal', '要補給就快去。過了這裡，就沒有店了。');
      const c = await S.choice(['在船艙休息', '存檔', '沒事'], { cancel: 2 });
      if (c === 0) await cabinRest(S); else if (c === 1) await S.saveMenu();
      return;
    }
    if (!F('ch11_sail')) {
      await S.say('chenbo:serious', '要出航了？過了這裡，就回不了頭。');
      const c = await S.choice(['出航（出航後無法返回澎湖）', '在船艙休息', '再等一下'], { cancel: 2 });
      if (c === 1) { await cabinRest(S); return; }
      if (c !== 0) { await S.say('chenbo:normal', '想做什麼就去做。我在這裡等。'); return; }
      if (!F('ch11_weir_done') && F('ch11_tianhou')) {
        await S.say('', '麻糬望著媽宮的方向，輕輕叫了一聲。'); await S.say('yungui:think', '……石滬那邊，還有人在哭。');
        if (await S.choice(['還是出航', '等一下'], { cancel: 1 }) !== 0) return;
      }
      await H.c11_11(S);
      return;
    }
    if (leg() >= 5) { await S.say('chenbo:normal', '我在渡口顧槳。'); return; }
    const opts = [], acts = [];
    if (!F('ch11_kun')) { opts.push('繼續前進（鯤之淵）'); acts.push('kun'); }
    else { opts.push('繼續前進（無光之霧）'); acts.push('fog'); }
    if (G.Inv.has('c11_blacktide_chart') && !F('ch11_tangshan_met')) { opts.push('暗流裡有人在唱歌（溺魂暗流）'); acts.push('ts'); }
    opts.push('在船艙休息', '存檔', '沒事'); acts.push('rest', 'save', 'none');
    const line = F('ch11_kun') ? ['chenbo:serious', '鯤認得燈的火。臭小子，牠在認你。'] : F('ch11_tangshan_met') ? ['chenbo:normal', '別把手伸出船外。燈會跟著暖的東西走。'] : ['chenbo:normal', '暗流裡有人。要不要去看看，你決定。'];
    await S.say(line[0], line[1]);
    const a = acts[await S.choice(opts, { cancel: opts.length - 1 })];
    if (a === 'rest') await cabinRest(S);
    else if (a === 'save') await S.saveMenu();
    else if (a === 'kun') { await seaEncounter(S); await H.c11_14(S); }
    else if (a === 'ts') { await seaEncounter(S); await H.tangshan1(S); }
    else if (a === 'fog') await H.c11_15(S);
  };

  // ---------------------------------------------------------------- 11-02 媽宮・潮停
  H.c11_02 = async (S) => {
    S.setPos('player', 11, 7, 'right');
    await S.camera(20, 4, 1.0);
    await L(S, [
      ['', '媽宮港。數十支火把聚在堤岸上。漁民、婦人、孩子，望著消失的海。'],
      ['', '王船從泥灘上「滑」近堤岸，船底離地半尺，掀起一層薄薄的星光。'],
      ['漁民', '彼……彼是啥物？'],
      ['阿桂', '王船！是千歲爺的王船！'],
    ]);
    for (const id of ['ph_crowd1', 'ph_crowd2', 'ph_crowd3', 'ph_agui', 'ph_oldman_a']) { S.face(id, 'left'); S.emote(id, '!'); }
    await pause(S, 0.6);
    await L(S, [
      ['', '人群騷動。老人們合十拜了三拜，有人跪了下來。'],
      ['廟口避難的阿伯', '千歲爺來巡港矣……有救矣，有救矣……'],
    ]);
    S.cameraFollow();
    await L(S, [
      ['xinghe:shy', '呃……那個……我們只是跟千歲爺借船的……'],
      ['hongying:normal', '（小聲）別解釋了，越描越黑。'],
    ]);
    await S.say('', '廟公阿進伯拄著拐杖，從人群中走出。他看看王船，又看看船舵旁的陳伯，點點頭。');
    await S.move('ph_ajin', 'DL');
    S.face('ph_ajin', 'player'); S.face('player', 'ph_ajin');
    await L(S, [
      ['阿進伯', '恁是對東港來的？擲有三个聖桮？'],
      ['chenbo:normal', '三个。一个都沒少。'],
      ['阿進伯', '好，好。'],
      ['阿進伯', '潮停兩个時辰矣，風嘛停矣。澎湖人毋驚風，驚的是無風。'],
      ['阿進伯', '來廟裡坐。媽祖婆等恁足久矣。'],
      ['xinghe:surprise', '等……我們？'],
      ['阿進伯', '今暗所有的香，攏向西爿彎。來看就知。'],
    ]);
    S.flag('ch11_magong');
    await S.fadeOut(0.8);
    await S.warp('penghu_tianhou', 8, 12, 'up', { fade: 0 });
    await S.fadeIn(0.8);
  };

  // ---------------------------------------------------------------- 11-03 天后宮
  H.c11_03a = async (S) => {
    V().ch11_incense = 1;
    await S.walkTo('player', 8, 9);
    S.face('player', 'up');
    await L(S, [
      ['', '天后宮正殿。燭光溫暖。鎮殿媽祖隱在層層紅帳與香煙後，只見金色冠冕的一點微光。'],
      ['', '避難的鎮民坐在左廊，有人低聲唸著「媽祖婆保庇」。'],
    ]);
    await S.camera(11, 6, 0.9);
    await S.say('', '天井的天公爐。爐中的香煙一縷一縷——不往上升，全都向西彎去，像被一雙看不見的手輕輕牽著。');
    S.cameraFollow();
    await L(S, [
      ['yungui:surprise', '……煙在指路。'],
      ['阿進伯', '恁看這間廟。比媽宮城，閣較老。'],
      ['阿進伯', '先有媽祖宮，才有這个港。這个所在，才號做「媽宮」。'],
      ['阿進伯', '幾百年來，討海人出港進前，攏來遮拜。'],
      ['阿進伯', '船頂閣會請一尊「船仔媽」。船去佗位，媽祖就綴到佗位。'],
      ['hongying:normal', '鹿港天后宮的廟公也說過。媽祖看顧的，是要過海的人。'],
      ['阿進伯', '是啦。早年過黑水溝的人，「六死三留一回頭」。'],
      ['阿進伯', '會當平安到台灣的，攏是媽祖婆牽過來的。'],
      ['阿進伯', '來，先拈香。先拜天公爐，再入殿拜媽祖。'],
    ]);
    S.objective('拈香：先拜天井的天公爐，再入殿拜媽祖');
  };
  H.incense = async (S, which) => {
    const st = V().ch11_incense || 0;
    if (F('ch11_tianhou')) { await S.say('', which === 'sky' ? '天公爐裡的香煙，一縷一縷向西彎去。' : '殿內的香爐。香灰很暖。'); return; }
    if (st < 1) { await S.say('', '香爐裡的香煙，全都向西彎。'); return; }
    if (which === 'in' && st === 1) { await S.say('阿進伯', '囝仔，先拜天公，才拜媽祖。'); return; }
    if (which === 'sky' && st === 2) { await S.say('', '已經拜過天公了。接著入殿，拜媽祖。'); return; }
    if (which === 'sky') {
      S.face('player', 'down');
      await S.say('', '阿進伯遞上清香。眾人持香，面向廟外的天，三拜。');
      for (let i = 0; i < 3; i++) { S.sfx('bell'); await pause(S, 0.5); }
      await S.say('', '插香。');
      V().ch11_incense = 2;
      S.objective('入殿，拜媽祖');
      return;
    }
    // inner burner: bow to the altar, then 11-03 continues
    S.face('player', 'up');
    await S.say('', '面向神龕，三拜。');
    for (let i = 0; i < 3; i++) { S.sfx('bell'); await pause(S, 0.5); }
    await S.say('', '插香。');
    V().ch11_incense = 3;
    await H.c11_03b(S);
  };
  H.c11_03b = async (S) => {
    S.face('ph_ajin', 'player');
    await L(S, [
      ['', '插香後，星河沒有立刻起身。'],
      ['xinghe:serious', '阿伯，我想問……'],
      ['xinghe:sad', '媽祖……會保佑一個沒有魂燈的人嗎？'],
      ['', '紅纓與雲歸對看一眼。'],
      ['阿進伯', '……'],
      ['阿進伯', '少年仔。媽祖保庇討海人，毋捌問人身上有啥物。'],
      ['阿進伯', '伊只問你——欲去佗位。'],
      ['xinghe:surprise', '……'],
      ['xinghe:smile', '我要去找一個人。把她帶回家。'],
    ]);
    S.sfx('wind'); S.flash('#fff2d0', 0.6, 0.35); S.sfx('bell', 0.3);
    await L(S, [
      ['', '一陣海風穿過三川門。燭火同時一亮。遠處，王船上的順風旗獵獵揚起。'],
      ['', '整座城的燈都在晃——只有神前那盞油燈，穩穩地亮著，一動也不動。'],
      ['阿進伯', '……聽著矣。'],
      ['阿進伯', '來，香火袋提去。予恁的船「過爐」。'],
      ['', '阿進伯從香爐取香灰，裝入小紅布袋。眾人捧著香火袋與鵝鑾鼻的燈火，在香爐上方順時針繞三圈。'],
    ]);
    S.setPos('player', 8, 5, 'left');
    for (let i = 0; i < 3; i++) await S.move('player', 'LUURRDDL', { speed: 6 });
    S.face('player', 'up');
    await S.give('c11_mazu_pouch', 1);
    await L(S, [
      ['阿進伯', '香火袋掛佇船頭。船仔媽，就佇恁身邊。'],
      ['阿進伯', '閣共恁講一件代誌。半冬前，一隻烏色的船停過媽宮。'],
      ['阿進伯', '船頂有一个穿藍衫的姑娘，坐佇船頭唱歌。'],
      ['阿進伯', '唱甲規港的討海人攏咧流目屎，毋知為啥物。'],
      ['xinghe:surprise', '白芷……！'],
      ['阿進伯', '船後來去西南爿的玄武嶼。彼本來是無人的烏石島。'],
      ['阿進伯', '這半冬，島頂起了一間烏色的廟。暗時規島攏是藍色的燈。'],
      ['yungui:serious', '真正的長明宮。夜玄的老巢。'],
      ['阿進伯', '這馬潮退了。海底，有一條路通過去。'],
      ['阿進伯', '平常時，只有月底、月中的大退潮，奎壁山彼爿才會浮出一條海中的路。'],
      ['阿進伯', '今暗規个海攏退了了。毋過路頂，有人看著古早的海賊鬼咧行。'],
      ['阿進伯', '恁先歇睏。食飽，才有氣力。'],
    ]);
    S.flag('ch11_tianhou');
    S.quest('q_ch11_main', 1);
    S.objective('從媽宮南口，走潮停之路前往玄武嶼');
    S.toast('三川門內側的石燈可以存檔。', 'lantern');
  };

  // ---------------------------------------------------------------- 媽宮 NPCs
  H.ajin = async (S) => {
    if (stC(G.state)) return L(S, [['阿進伯', '天星咧行矣！風嘛轉來矣！'], ['阿進伯', '少年仔，恁做著好代誌。媽祖婆攏有看著。']]);
    if (!F('ch11_tianhou')) return L(S, [['阿進伯', '來，先拈香。先拜天公爐，再入殿拜媽祖。']]);
    if (!F('ch11_ajin_2')) { S.flag('ch11_ajin_2'); return L(S, [['阿進伯', '香火袋掛佇船頭，船仔媽才看會著。'], ['阿進伯', '澎湖人講：「天公上大，媽祖上親。」有啥物話，攏會使共伊講。']]); }
    return L(S, [
      ['阿進伯', '早年過黑水溝，浪若大，大家就跪落來喊。'],
      ['阿進伯', '毋通喊「天上聖母」——彼傷正式，媽祖婆會梳頭、換衫才出門。'],
      ['阿進伯', '愛喊「媽祖婆！」伊聽著，就赤跤走出來救人。'],
      ['xinghe:smile', '……原來神明也會急著出門。'],
      ['阿進伯', '是囝仔咧哭，做老母的哪有閒梳頭？'],
    ]);
  };
  H.oldman = (S) => (stC(G.state) ? L(S, [['廟口避難的阿伯', '振動矣、振動矣！']]) : L(S, [['廟口避難的阿伯', '我活七十冬，毋捌看過天星袂振動。'], ['廟口避難的阿伯', '……莫非是天公伯仔，嘛咧等啥物人？']]));
  H.agui = async (S) => {
    if (stC(G.state)) {
      await L(S, [['阿桂', '風來矣！魚有救矣！']]);
      if (!F('ch11_agui_gift')) { S.flag('ch11_agui_gift'); await L(S, [['阿桂', '來，丁香魚乾提去。配飯、配酒、配鬼攏好。']]); await S.give('c11_dingxiang', 3); }
      return;
    }
    await L(S, [['阿桂', '丁香魚曬一半，風停矣。魚曬袂焦，會臭去。'], ['阿桂', '恁毋知，澎湖無風，比風颱閣較恐怖。'], ['阿桂', '風是澎湖人的老伙仔。伊無來，親像厝內有人無轉來。']]);
  };
  H.cat = (S) => L(S, [['貓', '喵。'], ['', '芋圓和澎湖的貓對看了很久。誰也沒有眨眼。'], ['yungui:think', '……牠說，那些丁香魚是牠的。'], ['hongying:surprise', '你聽得懂貓話？'], ['yungui:smug', '吃的話題，全世界都聽得懂。']]);
  const SHOP_FOOD = ['heitanggao', 'c11_xianbing', 'c11_xiaoguan', 'c11_dingxiang', 'c11_fengru', 'xianrenzhang', 'c11_jingua', 'huanhunxiang', 'huanhundan', 'jiuzhuan', 'lingxun'];
  const SHOP_SMITH = ['c11_sw_xuanwu', 'c11_sp_jinggu', 'c11_fl_haiyue', 'c11_fn_leishan', 'c11_ar_coral', 'c11_ar_haiwen', 'c11_hd_douli', 'c11_ft_bu', 'c11_ac_juhua'];
  H.xiuqin = async (S) => {
    if (stC(G.state)) await L(S, [['秀琴', '欲出海？鹹餅帶咧！澎湖的鹹餅，討海人放佇懷內，三工都袂歹。']]);
    else await L(S, [['秀琴', '黑糖糕，拄炊好的！'], ['秀琴', '今暗無人有心情食。恁買一塊，予阮歡喜一下。']]);
    await S.shop(SHOP_FOOD, { title: '秀琴雜貨' });
  };
  H.smith = async (S) => {
    await L(S, [['阿榮師', '討海人的刀，愛砍會斷纜索。'], ['阿榮師', '恁的對手是鬼？……鬼嘛有纜索啦，砍就著。']]);
    await S.shop(SHOP_SMITH, { title: '阿榮師鐵舖' });
  };
  H.xu = async (S) => {
    if (!F('ch11_xu_1')) {
      S.flag('ch11_xu_1');
      return L(S, [
        ['許秀才', '代寫家書、平安信，一封五文。'],
        ['許秀才', '今暗生意特別好。大家攏驚，欲寫批予唐山的親人。'],
        ['xinghe:think', '平安信？'],
        ['許秀才', '早年過海的人，十个有九个袂曉字。'],
        ['許秀才', '到位頭一件代誌，就是揣人寫一張平安信轉去。'],
        ['許秀才', '「平安到了，免掛念。」……八个字，一个人一世人的重量。'],
      ]);
    }
    S.flag('ch11_xu_2');
    return L(S, [
      ['許秀才', '阮阿公講，有一个老阿伯寫了三十冬的平安信。'],
      ['許秀才', '寄去的所在，早就無人矣。伊猶原寫。'],
      ['許秀才', '平安信毋是寫予收批的人。'],
      ['許秀才', '是寫予寄批的人，予伊的心肝會當放落來。'],
    ]);
  };
  H.sailor = (S) => (stC(G.state) ? L(S, [['老水手', '風轉來矣。恁的船，會順。']]) : L(S, [
    ['老水手', '我少年時走過黑水溝。水是烏的，烏甲親像墨。'],
    ['老水手', '船過溝的時，大家攏愛擲金紙、跪落拜。'],
    ['老水手', '求水底的兄弟，莫來牽。'],
    ['老水手', '今暗恁欲過溝？……愛記得。'],
    ['老水手', '聽著有人叫你的名，莫應。'],
  ]));
  H.yao = (S) => (F('ch11_treasure') ? L(S, [['阿耀', '騙肖仔！寶藏是貝殼！']]) : L(S, [['阿耀', '海攏無水矣！阮抾著三尾章魚！'], ['阿耀', '阿母講毋通行傷遠。遠遠有海賊鬼咧行。']]));
  H.zhu = async (S) => {
    if (F('ch11_treasure')) return L(S, [['阿珠', '真的有寶藏？！……啥？貝殼？'], ['阿耀', '騙肖仔！']]);
    await L(S, [
      ['阿珠', '阿媽講，古早的海賊，把寶物埋佇塔公塔婆跤底。'],
      ['阿珠', '塔公塔婆是保庇海口的石塔。一个公的、一个母的。'],
      ['', '芋圓的耳朵豎了起來。'],
      ['阿珠', '這隻貓仔目睭金金……寶物毋是食的啦。'],
      ['', '芋圓的耳朵又倒了下去。'],
    ]);
    if (!F('ch11_zhu_talk')) { S.flag('ch11_zhu_talk'); S.quest('q_ch11_treasure', 0); }
  };
  H.mother = (S) => (stC(G.state) ? L(S, [['等船的阿母', '海……海咧漲矣！'], ['等船的阿母', '伊一定會轉來。阮佇遮等。']]) : L(S, [
    ['等船的阿母', '阮後生昨暗出海掠小管，到今猶未轉來……'],
    ['等船的阿母', '潮退甲遮爾遠，伊的船，會不會擱佇外海？'],
    ['xinghe:serious', '……阿姨，我們會讓潮回來的。'],
  ]));
  H.atianWife = async (S) => {
    if (F('ch11_pumpkin')) return L(S, [['添姆', '閣來食喔。鍋仔內攏有。']]);
    await L(S, [
      ['添姆', '食飽未？來來來，金瓜炒米粉。'],
      ['添姆', '澎湖的金瓜特別甜。風鹹、日頭毒，伊無拚命甜，活袂落去。'],
      ['hongying:think', '……拚命甜才活得下去。'],
      ['', '芋圓把整顆頭埋進了碗裡。'],
      ['yungui:normal', '……這隻是拚命吃。'],
    ]);
    G.Party.healAll(); S.sfx('heal');
    S.toast('全員完全恢復。', 'lantern');
    await S.give('c11_jingua', 2);
    S.flag('ch11_pumpkin');
  };
  H.inn = async (S) => {
    await S.say('阿嬌', '住一暝八十文。今暗……毋知會不會天光就是矣。');
    const c = await S.choice(['住宿（80 文）', '不用了'], { cancel: 1 });
    if (c !== 0) return;
    if (G.state.gold < 80) { await S.say('阿嬌', '客官，您的盤纏好像不太夠呢……'); return; }
    G.state.gold -= 80;
    await S.fadeOut(0.8); G.Party.healAll(); S.sfx('heal');
    if (!F('ch11_night_moves')) { await S.narrate(['窗外的星星，一動也不動。'], { veil: 1 }); }
    await pause(S, 0.6);
    await S.fadeIn(0.8);
    if (!F('ch11_night_moves')) await S.say('阿嬌', '……睏飽未？天，猶是暗的。');
    else await S.say('阿嬌', '睏飽未？天星咧行矣。天，就欲光矣。');
    S.toast('好好休息了一晚，全員完全恢復。', 'lantern');
  };
  // 4-5 海賊的寶藏
  H.treasure = async (S, which) => {
    if (which === 'po') { await S.say('', '兩座用石頭疊起來的塔，一高一矮，守著海口。據說能鎮住從海上來的不好的東西。'); if (F('ch11_zhu_talk') && !F('ch11_treasure')) await S.say('hongying:think', '這座比較矮……是塔婆吧。阿珠說的是塔公。'); return; }
    if (!F('ch11_zhu_talk') || F('ch11_treasure')) { await S.say('', '兩座用石頭疊起來的塔，一高一矮，守著海口。據說能鎮住從海上來的不好的東西。'); return; }
    await L(S, [['', '塔公底下的沙裡，埋著一個長滿藤壺的木箱。'], ['hongying:surprise', '寶藏！']]);
    S.sfx('chest');
    await L(S, [['', '打開。一堆貝殼。貝殼中間，一枚金幣，和一張發黃的紙。'], ['', '「留予後世的憨人：真正的寶，是恁一路的伙伴。——烏鬚」'], ['yungui:normal', '……被三百年前的海盜說教了。'], ['hongying:smile', '可是……說得沒錯吧。']]);
    await S.give('c11_pirate_coin', 1); await S.give('c11_shell', 10);
    if (F('ch11_captain')) await S.say('xinghe:smile', '……原來那個船主，以前是這種人。');
    S.flag('ch11_treasure'); S.quest('q_ch11_treasure', 'done');
  };

  // ---------------------------------------------------------------- 阿添伯 trailing the party (支線 4-1 Step 3→4)
  function trailNpc(ms, id) {
    const n = ms.npcs.find((x) => x.id === id);
    if (!n) return;
    const p = ms.player;
    ms._trail = ms._trail || [];
    const last = ms._trail[ms._trail.length - 1];
    if (!last || last[0] !== p.x || last[1] !== p.y) { ms._trail.push([p.x, p.y]); if (ms._trail.length > 12) ms._trail.shift(); }
    const k = Math.max(0, ms._trail.length - 1 - (ms.followers.length + 1));
    const [tx, ty] = ms._trail[k];
    if (n.moving || (n.x === tx && n.y === ty)) return;
    if (Math.abs(n.x - tx) + Math.abs(n.y - ty) === 1) { n.dir = tx > n.x ? 'right' : tx < n.x ? 'left' : ty > n.y ? 'down' : 'up'; n.speed = 4.2; n.startMove(tx, ty); }
    else if (Math.abs(n.x - tx) + Math.abs(n.y - ty) > 3) n.setCell(tx, ty);
  }
  const atianFollows = (st) => st.flags.ch11_weir_3 && !st.flags.ch11_weir_done;
  const ATIAN_F = { id: 'ph_atian_f', sprite: 'c11_atian', name: '阿添伯', through: true, if: atianFollows, talk: [['阿添伯', '帶阮去。添家滬佇石滬灘的東北爿。']] };
  G.Maps.get('penghu_magong').npcs.push(Object.assign({ x: 16, y: 4, dir: 'down' }, ATIAN_F));
  G.Maps.get('penghu_flats').npcs.push(Object.assign({ x: 28, y: 1, dir: 'down' }, ATIAN_F));
  for (const mid of ['penghu_magong', 'penghu_flats']) {
    const d = G.Maps.get(mid), prev = d.onUpdate;
    d.onUpdate = (dt, ms, busy) => { if (prev) prev(dt, ms, busy); if (atianFollows(G.state)) trailNpc(ms, 'ph_atian_f'); };
  }

  // ---------------------------------------------------------------- 4-1 石滬的缺口
  H.atian = async (S) => {
    if (!F('ch11_tianhou')) return L(S, [['阿添伯', '……']]);
    if (F('ch11_weir_done')) return L(S, [['阿添伯', '滬仔愛留一个縫。魚仔才會當轉去。……人嘛是。']]);
    if (!F('ch11_weir_1')) {
      await L(S, [
        ['阿添伯', '……'],
        ['阿添伯', '恁看彼口滬。阮老爸疊的。號做「添家滬」。'],
        ['阿添伯', '一口滬，是一家人的飯碗。阮兜三代人，靠伊食飯。'],
        ['阿添伯', '漲潮，魚游入來；退潮，魚就留佇滬內。輪著阮兜，阮就去抾。'],
        ['阿添伯', '今暗潮停。滬內底無魚——規滬攏是燈。'],
        ['阿添伯', '藍色的燈，佇內底轉圈，出袂去。'],
        ['阿添伯', '其中一葩，叫阮「阿兄」。'],
        ['xinghe:surprise', '……阿兄？'],
        ['阿添伯', '阮小弟阿湧，十二歲彼年，風颱天綴阮老爸去顧滬。'],
        ['阿添伯', '一陣浪捲過來，伊就無去矣。五十冬矣。'],
        ['阿添伯', '恁敢會當，去替阮看覓？阮的跤，行袂到遐矣。'],
      ]);
      S.flag('ch11_weir_1'); S.quest('q_penghu_weir', 0);
      return;
    }
    if (!F('ch11_weir_2')) return L(S, [['阿添伯', '添家滬佇石滬灘的東北爿。滬內底，攏是燈。']]);
    // Step 3
    await L(S, [['', '星河說完。阿添伯很久沒有說話。'], ['阿添伯', '拆滬？'], ['阿添伯', '滬，是阮老爸一粒石、一粒石疊起來的。'], ['阿添伯', '拆滬，是拆阮老爸的骨頭！']]);
    const c = await S.choice(['阿湧在等你。', '……那就算了。']);
    if (c === 1) { await S.say('hongying:angry', '笨蛋！那孩子等了五十年耶！'); return; }
    await L(S, [
      ['xinghe:serious', '阿伯。他不敢走。他怕你找不到他。'],
      ['阿添伯', '……'],
      ['阿添伯', '……憨囡仔。'],
      ['阿添伯', '阮逐工都去看彼口滬。阮以為，阮是咧顧滬。'],
      ['阿添伯', '原來……阮是咧顧伊。'],
      ['', '阿添伯拄著膝蓋站起來。'],
      ['阿添伯', '帶阮去。'],
      ['yungui:normal', '貧道給您一道符。路上的鬼，看不見您。'],
    ]);
    S.flag('ch11_weir_3'); S.quest('q_penghu_weir', 2);
    S.toast('阿添伯跟在隊伍後面。', 'lantern');
  };
  H.weir2 = async (S) => {
    await S.camera(40, 4, 0.8);
    await L(S, [['', '弧形的石滬圍著一窪殘水。十幾盞藍色的魂燈在水面上繞圈，撞到石牆就彈回來。'], ['', '其中一盞飄了過來，化成一個瘦小的男孩。赤腳，頭上綁著布巾。']]);
    S.spawn({ id: 'ayong_s', sprite: 'c11_ayong', x: 41, y: 6, dir: 'down', ghost: true });
    S.cameraFollow();
    await L(S, [
      ['阿湧', '恁是阮阿兄叫來的？'],
      ['xinghe:smile', '嗯。你是阿湧？'],
      ['阿湧', '阮出袂去。滬門關咧，潮又無來。'],
      ['阿湧', '平常時，潮一漲，阮就會當綴水出去。'],
      ['阿湧', '……毋過，阮嘛毋敢出去。'],
      ['阿湧', '阮驚，阿兄揣無阮。'],
      ['hongying:surprise', '所以你……在這裡等了五十年？'],
      ['阿湧', '阿兄逐工攏來看滬。阮看會著伊。伊看袂著阮。'],
      ['yungui:think', '其他的燈，是這五十年來溺死在附近的討海人。阿湧一直陪著他們。'],
      ['yungui:serious', '要讓他們出去，得在滬牆上開一個口。'],
      ['hongying:normal', '那就搬石頭啊。'],
      ['yungui:serious', '這是人家的滬。一口滬，是一家人的命。'],
      ['yungui:serious', '沒有滬主點頭，不能拆。'],
      ['xinghe:serious', '……回去問阿添伯。'],
    ]);
    S.remove('ayong_s');
    S.flag('ch11_weir_2'); S.quest('q_penghu_weir', 1);
  };
  H.weir4 = async (S) => {
    if (!F('ch11_weir_3') || F('ch11_weir_done')) return;
    S.spawn({ id: 'atian_s', sprite: 'c11_atian', x: 40, y: 8, dir: 'up' });
    S.setPos('player', 41, 8, 'up');
    await L(S, [['', '阿添伯望著滬內的水窪。他什麼也看不見。'], ['xinghe:serious', '阿伯，握著我的手。']]);
    S.flash('#ffd890', 0.6, 0.4);
    await S.say('', '阿添伯握住星河的手。星河胸口亮起一點火光。下一刻——阿添伯的眼睛睜大了。');
    S.spawn({ id: 'ayong_s', sprite: 'c11_ayong', x: 41, y: 6, dir: 'down', ghost: true });
    await L(S, [
      ['阿添伯', '……阿湧。'],
      ['阿湧', '阿兄！你哪會遮老？'],
      ['阿添伯', '憨囡仔，五十冬矣。你哪會猶十二歲？'],
      ['阿湧', '因為阮無食飯啊。'],
      ['阿添伯', '……'],
      ['', '阿添伯哭著，笑了出來。'],
      ['阿湧', '阿兄，阮出袂去。'],
      ['', '阿添伯跪在滬牆前。他把手放在滬門頂上的那塊石頭上，摸了很久。'],
      ['阿添伯', '阿爸……歹勢。'],
      ['', '他用顫抖的手，搬下了第一塊石頭。'],
      ['', '紅纓、雲歸、星河一起蹲下來幫忙。芋圓用頭頂。一塊、兩塊、三塊……滬牆開了一個缺口。'],
    ]);
    for (let i = 0; i < 3; i++) { S.sfx('push'); await pause(S, 0.35); }
    await L(S, [
      ['', '滬內的燈火像一條小溪，從缺口流了出去，往西，往黑水溝的方向漂去。'],
      ['阿湧', '阿兄，滬仔愛留一个縫。'],
      ['阿湧', '魚仔，才會當轉去。'],
      ['阿添伯', '……好。阮留。'],
      ['阿湧', '阿兄，你愛食飯喔。'],
      ['阿添伯', '你嘛是。'],
    ]);
    await S.fadeActor('ayong_s', 0, 1.2); S.remove('ayong_s');
    await S.say('', '阿湧化成一盞小燈，最後一個從缺口漂了出去。漂了一段，在星光下閃了兩下。');
    S.flag('ch11_weir_done');
    await S.lantern('lantern_penghu_weir', '石滬的缺口');
    await L(S, [['阿添伯', '這粒石，是滬門頂彼粒。阮老爸疊的。'], ['阿添伯', '帶咧。伊會保庇恁。']]);
    await S.give('c11_ac_weir_stone', 1);
    S.quest('q_penghu_weir', 'done');
    S.remove('atian_s');
  };

  // ---------------------------------------------------------------- 11-04 潮停之路
  H.c11_04 = async (S) => {
    await L(S, [
      ['', '媽宮南口外。星光下，海床一路延伸到看不見的地方。'],
      ['', '一條略高於四周的礫石沙洲，像一條細細的銀帶，蜿蜒向西南。'],
      ['hongying:surprise', '……我們真的要走在海底？'],
      ['yungui:think', '平時這裡有三丈深的水。現在，魚在我們腳邊喘氣。'],
      ['', '一條擱淺的小魚在水窪邊撲騰。芋圓湊過去，看了看，用鼻子把牠推回水窪裡。'],
      ['xinghe:smile', '芋圓，你居然沒吃牠。'],
      ['', '芋圓回頭瞪了他一眼。……今天，好像不是吃的日子。'],
      ['hongying:shy', '（小聲）好、好可愛……'],
    ]);
    await S.camera(20, 8, 0.9);
    await L(S, [
      ['', '遠方，水窪裡升起幾道藍光。有人影在沙洲上搖搖晃晃地走——頭纏紅巾、腰插彎刀，身體是半透明的。'],
      ['yungui:serious', '海盜鬼。……每一個腰上，都拴著一盞小長明燈。'],
      ['xinghe:angry', '又是夜玄的燈。'],
    ]);
    S.cameraFollow();
    S.flag('ch11_flats');
    S.objective('沿著潮停之路前往西南方的玄武嶼');
  };
  H.ghostFisher = async (S) => {
    await L(S, [['迷路的漁夫魂', '潮停矣……我的船咧？我欲轉去媽宮……'], ['xinghe:normal', '阿伯，媽宮在北邊。'], ['迷路的漁夫魂', '北爿……多謝。']]);
    await S.move('fl_ghost_fisher', 'UU');
    await S.fadeActor('fl_ghost_fisher', 0, 1.0);
    S.flag('ch11_fisher_gone');
  };
  H.pirateKid = (S) => (F('ch11_captain') ? L(S, [['被鎖住的小海盜鬼', '船主人說要謝謝你們。……他不好意思自己講。']]) : L(S, [
    ['被鎖住的小海盜鬼', '別打我、別打我！我是新來的！我才死了三十年！'],
    ['hongying:think', '……三十年叫新來的？'],
    ['被鎖住的小海盜鬼', '船主人其實很好。就是脾氣差、嘴巴臭、還欠我三百年薪水。'],
    ['yungui:smug', '你才死了三十年，他怎麼欠你三百年？'],
    ['被鎖住的小海盜鬼', '……預支的。'],
  ]));
  // ---- 11-05 烏鬚船主 (中頭目: 火藥桶)
  function magHit(b, att, tg, power, elem) {
    let d = power * att.mag * 2 * 50 / (50 + (tg.def * 0.3 + tg.mag * 0.7));
    d *= U.rand(0.9, 1.1) * b.elemFactor(elem, tg);
    if (tg.st.guard) d *= 0.5;
    if (tg.side === 'party' && tg.resist && elem && tg.resist.includes(elem)) d *= 0.6;
    return Math.max(1, Math.round(d * (b.diff === 'easy' ? 0.6 : b.diff === 'hard' ? 1.25 : 1)));
  }
  function captainHooks() {
    return {
      intro: async (b) => {
        hookB(b, 'kill', (orig, u) => {
          orig(u);
          if (u.id === 'c11_powder_keg' && !b._kegSelf) {
            b.say('火藥桶冒著煙！——轟！炸到自己人了！', 1.8);
            G.Audio.sfx('fire'); b.shakeT = 0.5;
            for (const e of b.alive('enemy')) b.damage(e, 600, { color: '#ffb050' });
            b._capHurt = true;
          }
        });
      },
      onTurn: async (b, u) => {
        if (u.id !== 'c11_captain') return;
        const keg = foe(b, 'c11_powder_keg');
        if (keg) {
          b.say('火藥桶冒著煙！', 1.0); await b.wait(0.6);
          b._kegSelf = true; keg.hp = 0; b.kill(keg); b._kegSelf = false;
          G.Audio.sfx('fire'); b.shakeT = 0.6; b.say('轟！', 1.0);
          for (const p of b.alive('party')) b.damage(p, magHit(b, u, p, 0.9, 'fire'), { elem: 'fire' });
          await b.wait(0.8);
        }
        if (b._capHurt && !u.dead) { b._capHurt = false; await bLines(b, [['烏鬚船主', '……老子的鬍子！！']]); }
        if (!b._cap30 && u.hp < u.mhp * 0.3) { b._cap30 = true; await bLines(b, [['烏鬚船主', '老子還沒輸！']]); b.addStatus(u, 'atkUp', 3); }
      },
    };
  }
  H.c11_05 = async (S) => {
    if (F('ch11_captain')) return;
    await S.walkTo('player', 21, 33);
    S.face('player', 'down');
    await L(S, [
      ['', '一艘傾斜的古老戰船殘骸。船頭坐著一個魁梧的海盜鬼：滿臉烏黑的鬍鬚、獨眼，錨鏈一圈一圈繞到一盞長明燈上。'],
      ['烏鬚船主', '站住！此路是我開——此樹……此礁是我栽！'],
      ['xinghe:think', '海底哪有樹。'],
      ['烏鬚船主', '……少囉嗦！要從此路過，留下買路錢！'],
      ['yungui:smug', '做鬼了，還在收過路費？'],
      ['烏鬚船主', '不收不行啊……那個姓夜的，把老子的錨鏈鎖在燈上。'],
      ['烏鬚船主', '守不住路，燈就燒老子。三百年了，老子連死都死得不安生！'],
      ['hongying:serious', '那我們把那盞燈打碎——'],
      ['烏鬚船主', '打碎之前，老子還是得打你們！燈在看！'],
      ['烏鬚船主', '小的們！抄傢伙！'],
    ]);
    const r = await S.battle('t11_captain', captainHooks());
    if (r !== 'win') return;
    S.sfx('shatter');
    await L(S, [
      ['', '錨鏈上的長明燈「喀」一聲裂開，藍火熄滅。鎖鏈一節一節碎成鐵鏽色的光。'],
      ['烏鬚船主', '……輕了。老子的身子，輕了。'],
      ['烏鬚船主', '老子年輕時，也是討海人。後來……唉，走歪了。'],
      ['烏鬚船主', '黑水溝底下，躺著的人比你們想的多。被老子害的，也有。'],
      ['烏鬚船主', '你們要是過得去……幫老子跟他們說聲，對不住。'],
      ['烏鬚船主', '拿去。老子畫了一輩子的海圖。黑水溝的暗流，都在上面。'],
    ]);
    await S.give('c11_blacktide_chart', 1);
    await S.give('c11_pirate_rum', 2);
    await S.say('烏鬚船主', '那酒，省著喝。喝多了，會看見鯨魚在跳舞。');
    S.flag('ch11_captain');
    await S.fadeActor('fl_captain', 0, 1.0);
    await S.say('', '海盜鬼們化作一串暗紅色的光，往西漂去。礁口的藍色光幕隨之消散。');
    S.objective('進入玄武嶼');
  };

  // ---------------------------------------------------------------- 4-4 七仙蕈之七「玄武蕈」
  H.mush7 = async (S) => {
    await L(S, [
      ['', '一根六角形的玄武岩柱側面，長著一排小小的蕈。蕈傘也是六角形的，像縮小的石柱，發著黑曜石般的微光。'],
      ['yungui:surprise', '……玄武蕈。'],
      ['', '是麻糬先找到的。她坐在石柱前，一動也不動，等大家走過來。'],
      ['', '雲歸飛快地掏出筆記本，開始畫。芋圓湊過去聞了聞，被雲歸用扇子擋開。'],
      ['yungui:smug', '貧道說過，這次要先畫，再試吃。為了學問。'],
      ['hongying:angry', '你每次都這樣說！'],
      ['', '雲歸畫完，把本子收起來，吃掉了一朵。他的瞳孔，變成六角形的漩渦。'],
      ['yungui:serious', '……貧道明白了。'],
      ['yungui:serious', '熔岩很燙，流得到處都是，亂七八糟的。'],
      ['yungui:serious', '冷了以後，它自己排成了六角形。沒有人教它。'],
      ['yungui:serious', '所以……再亂的東西，靜下來，也會變得整整齊齊的。'],
      ['hongying:think', '……好像在說我。'],
      ['yungui:serious', '紅纓是熔岩。很燙。'],
      ['hongying:shy', '……！'],
      ['', '芋圓趁大家不注意，偷吃了剩下的一朵，然後對著玄武岩柱瞪了很久很久。'],
    ]);
    V().tuanzi_mush = (V().tuanzi_mush || 0) + 1;
    S.flag('mush_7');
    S.toast('蕈譜第七格：玄武蕈', 'mushroom');
    if (V().tuanzi_mush >= 7) {
      S.flash('#ffffff', 0.8, 0.5);
      await L(S, [
        ['', '雲歸全身發出七色的光。他的道袍飄了起來。'],
        ['yungui:serious', '……貧道，看見了。世上所有的顏色。'],
        ['yungui:serious', '還有一種……沒有名字的。'],
        ['xinghe:surprise', '傳說是真的？七種都吃過的人，會看見所有的顏色——'],
        ['yungui:think', '……還有一說，從此不會再想喝酒。'],
        ['', '光散了。雲歸落回地上，第一件事就是摸腰間的葫蘆。'],
        ['yungui:normal', '……還是很想喝。'],
        ['hongying:laugh', '哈哈哈哈！'],
        ['yungui:smile', '傳說果然一半是假的。'],
      ]);
      await S.give('c11_ac_cosmic', 1);
      S.learn('yungui', 'c11_yg_cosmic');
      S.toast('雲歸的蕈譜改名為《臺灣七仙蕈譜》。', 'scroll');
      S.quest('q_tuanzi_mush', 'done');
    } else {
      S.quest('q_tuanzi_mush', 1);
      await L(S, [['yungui:sad', '還差幾種……'], ['', '麻糬用尾巴拍了拍他的手。'], ['yungui:normal', '……沒關係。蕈不會跑。']]);
    }
  };

  // ---------------------------------------------------------------- 11-06 玄武嶼・黑岸
  H.c11_06 = async (S) => {
    await L(S, [
      ['', '黑沙灘。眼前是一整座由六角形石柱構成的島，像一隻伏在海上的巨龜。'],
      ['', '石階兩側，冷藍色的長明燈一路排到島頂。'],
      ['hongying:serious', '……比府城那座更冷。'],
      ['yungui:think', '府城那座是店面。這裡，才是倉庫。'],
    ]);
    await S.camera(19, 5, 1.0);
    await L(S, [['', '島頂大殿的門前，一道藍色光幕。光幕上浮著密密麻麻的小字——都是名字。'], ['xinghe:surprise', '這些是……'], ['yungui:serious', '被關在燈裡的魂的名字。夜玄用他們的名字，替自己的門上鎖。'], ['yungui:serious', '要開門，得先讓這些名字的主人離開。']]);
    S.cameraFollow();
    await L(S, [['', '麻糬的耳朵忽然轉向西邊。'], ['yungui:think', '西邊崖下面，有風。……不對，今晚沒有風。是有東西在呼吸。']]);
    S.flag('ch11_xuanwu'); S.quest('q_ch11_main', 2);
    S.objective('找到解開大門封印的方法（西側崖下的洞穴）');
  };

  // ---------------------------------------------------------------- 11-07 萬魂窟 (P1 五盞長明燈)
  H.c11_07a = async (S) => {
    await L(S, [
      ['', '圓形大廳。四面八方的架子上，擺滿了發藍光的罐子——一層又一層，一直疊到看不見的洞頂。'],
      ['hongying:surprise', '……這、全部都是？'],
      ['yungui:serious', '全台灣的長明燈，燈芯裡都有一道符，連到這裡。'],
      ['yungui:serious', '燈一點，魂就被抽一絲過來。日子久了，整個魂都在罐子裡。'],
      ['xinghe:angry', '大家花錢買燈，是想讓死去的人「不被忘記」……'],
      ['xinghe:angry', '結果是把他們關起來？'],
      ['', '罐子們發出細細的聲音。冷……冷……家……'],
      ['yungui:think', '中間五盞燈柱，是鎖。五盞全熄，罐子就會開。'],
      ['yungui:serious', '可是燈柱是連在一起的。熄一盞，旁邊的會跟著動。'],
      ['xinghe:think', '……陳伯說過。熄燈跟點燈一樣，要有順序。'],
      ['hongying:normal', '祭壇上有字。'],
    ]);
    S.objective('熄滅五盞長明燈柱');
  };
  H.b1Altar = async (S) => {
    if (F('ch11_jars_freed')) { await S.say('', '祭壇空了。'); return; }
    await S.say('', '祭壇上刻著字：「萬魂一燈，一燈萬魂。一盞都不能漏。」');
    if (lit().some((v) => v !== 1)) {
      if (await S.choice(['重新點燃全部燈柱', '不用了'], { cancel: 1 }) === 0) { V().ch11_lit = [1, 1, 1, 1, 1]; S.sfx('fire'); S.toast('五盞燈柱重新亮了起來。'); }
    }
  };
  H.lampPillar = async (S, i) => {
    if (F('ch11_jars_freed')) { await S.say('', '熄滅的燈柱。燈座還有一點餘溫。'); return; }
    const l = lit();
    await S.say('', l[i] ? `第 ${i + 1} 盞長明燈柱。藍火靜靜地燒著。` : `第 ${i + 1} 盞長明燈柱。燈已經熄了。`);
    const c = await S.choice([l[i] ? '熄滅這盞燈' : '點亮這盞燈', '算了'], { cancel: 1 });
    if (c !== 0) return;
    for (const k of [i - 1, i, i + 1]) { const j = (k + 5) % 5; l[j] = l[j] ? 0 : 1; }
    S.sfx(l[i] ? 'fire' : 'dark'); S.shake(2, 0.3);
    V().ch11_lops = (V().ch11_lops || 0) + 1;
    if (l.every((v) => v === 0)) { S.flag('ch11_lamps_out'); await H.c11_07b(S); return; }
    if (V().ch11_lops === 4) await S.say('yungui:think', '「一盞都不能漏」……是說每一盞都要碰一次？');
    if (V().ch11_lops % 3 === 0 && !autoplay() && Math.random() < 0.3) {
      await S.say('', '燈一暗，水裡的東西就醒了——');
      await S.battle('t11_xw_drowned');
    }
  };
  H.c11_07b = async (S) => {
    await S.say('', '最後一盞燈柱熄滅。整個洞穴安靜了一瞬。');
    S.flag('ch11_jars_freed');
    S.refresh();
    for (let i = 0; i < 5; i++) { S.sfx('shatter'); await pause(S, 0.18); }
    S.shake(3, 2.0);
    await L(S, [
      ['', '然後——「喀」。一個罐子裂開。「喀、喀、喀……」裂聲像下雨一樣，從洞底一路響到洞頂。'],
      ['', '成千上萬點藍光從罐子裡升起，在洞穴中盤旋一圈，慢慢從藍色變成溫暖的白色，從洞口湧向夜空。'],
      ['', '數不清的細小聲音：「謝謝。」「謝謝……」「可以回家了。」「好暖。」'],
      ['xinghe:cry', '……'],
      ['hongying:sad', '笨蛋，你又哭了。'],
      ['xinghe:cry', '妳也是。'],
      ['hongying:angry', '我沒有！是……是洞裡在滴水！'],
    ]);
    await H.freedSoul(S);
    S.sfx('item');
    await S.say('', '祭壇中央浮起一把黑鐵鑰匙。');
    await S.give('c11_soul_key', 1);
    await S.say('', '遠處傳來沉重的聲響——島頂大門的光幕上，名字一個一個熄滅了。');
    S.quest('q_ch11_main', 3);
    S.objective('登上長明殿');
  };
  H.freedSoul = async (S) => {
    if (F('ch11_freed_talk')) return;
    S.flag('ch11_freed_talk');
    S.spawn({ id: 'freed_s', sprite: 'c11_freed_soul', x: 19, y: 12, dir: 'down', ghost: true });
    await L(S, [
      ['被放出的魂', '……我是鹿港人。阮後生花了十兩銀，替我請一盞長明燈。'],
      ['被放出的魂', '伊是孝順……毋過，燈內真冷。'],
      ['被放出的魂', '少年仔，若有機會，替我共伊講——阿爸無怪伊。'],
    ]);
    await S.fadeActor('freed_s', 0, 1.0);
    S.remove('freed_s');
    await S.say('', '他化作光，往西漂去。');
  };

  // ---------------------------------------------------------------- 11-08 夜玄的書房
  H.c11_08 = async (S) => {
    if (F('ch11_study')) { await S.say('', '桌上攤著那本手記的痕跡。一盞油燈，是整座殿裡唯一的暖色燈。'); return; }
    await L(S, [
      ['', '書房極簡。一張桌、一盞油燈——唯一的暖色燈——一張榻。沒有一件多餘的東西。'],
      ['', '牆上掛著一幅褪色的畫：兩個年輕的引魂人坐在船頭，扛著槳，笑得很開。其中一人肩上，騎著一個綁雙髻的小女孩。'],
      ['xinghe:surprise', '這是……夜玄？旁邊這個——是陳伯？！'],
      ['hongying:think', '陳伯年輕的時候……居然長得還不錯。'],
      ['yungui:normal', '重點錯了。'],
    ]);
    await S.give('c11_old_portrait', 1);
    await S.say('', '桌上攤著一本手記。夜玄的字跡端正，一頁一行。');
    await paper({ title: '夜玄的手記', pages: [
      ['念兒今天沒有說話。', '念兒今天沒有說話。', '念兒今天沒有說話。府城下雨了。', '念兒今天沒有說話。'],
      ['念兒今天沒有說話。', '念兒今天沒有說話。阿渡的燈籠舖，生意好像不錯。', '念兒今天沒有說話。', '……'],
      ['念兒今天說話了。她說，她累了。', '我假裝沒有聽見。'],
    ] });
    await L(S, [
      ['', '靜默。'],
      ['yungui:serious', '……二十年。每天一行。'],
      ['hongying:sad', '他每天都在等她開口。結果她開口了，他卻……'],
      ['xinghe:sad', '……'],
    ]);
    await S.give('c11_yx_diary', 1);
    S.flag('ch11_study');
  };
  H.northLamp = async (S) => {
    if (F('ch11_secret')) { await S.say('', '北牆的暗門開著。石梯一路往上，通往島頂。'); return; }
    await S.say('', F('ch11_letters') ? '北牆的燈。白芷的紙燈背面寫著：「北牆的燈，往左轉」。' : '北牆的長明燈。燈座和牆之間，有一道細細的縫。');
    const c = await S.choice(['把燈座往左轉', '算了'], { cancel: 1 });
    if (c !== 0) return;
    S.sfx('push'); S.shake(4, 0.6);
    S.flag('ch11_secret');
    await S.warp('xuanwu_1f', G.mapScene.player.x, G.mapScene.player.y, 'up', { reload: true, fade: 0.3 });
    await S.say('', '喀啦——北牆往兩邊滑開，露出一道往上的石梯。');
    S.quest('q_ch11_main', 4);
    S.objective('登上島頂的逆潮台');
  };

  // ---------------------------------------------------------------- 11-09 白芷的囚室
  H.c11_09a = async (S) => {
    S.flag('ch11_cell_in');
    await L(S, [
      ['', '星河推開門。小小的石室。一張草蓆，一扇看得見海的小窗。星光淡淡地落在地上。'],
      ['', '窗台上，放著一支玉笛。天花板下，吊著六盞用燈籠紙摺成的小燈。'],
      ['xinghe:surprise', '……這是陳記的摺法。'],
      ['xinghe:sad', '是我教她的。她第一次摺的時候，摺成了一隻青蛙。'],
      ['hongying:normal', '燈上有字。'],
    ]);
    S.objective('看看那些紙燈');
  };
  const LETTERS = [
    { expr: 'normal', text: ['我叫白芷。這是我的名字。', '星河說，名字是別人叫你的時候，你會回頭的那個聲音。', '九份的芋圓是甜的。熱的時候最甜。', '陳伯的燈籠，竹骨要削七次。他說六次也可以，可是他會不開心。'],
      after: [['xinghe:smile', '……陳伯真的會不開心。']] },
    { expr: 'smile', text: ['紅纓煮的東西，不可以吃。可是她問的時候，要說好吃。', '這叫做「朋友」。', '雲歸說蘑菇是大地的耳朵。我不太懂。', '芋圓聽了，就把蘑菇吃了。'],
      after: [['hongying:angry', '……她明明說很好吃的！那個笨蛋……！'], ['', '紅纓別過頭去，用袖子用力擦了一下眼睛。'], ['yungui:smile', '……蘑菇確實是大地的耳朵。她聽懂了。'], ['', '芋圓舔了舔嘴。']] },
    { expr: 'think', text: ['在平溪，我在天燈上寫：「我想知道我是誰。」', '現在我知道了。', '我好像，不想知道了。'], after: [] },
    { expr: 'sad', text: ['今天，我忘了阿柑姨的臉。', '我記得芋圓，可是忘了做芋圓的人。這樣不公平。', '所以我寫下來：她笑起來，眼睛會不見。', '夜玄先生帶了芋圓給我。很好吃。', '可是我想不起來，第一次吃的時候，是誰坐在我旁邊。'],
      after: [['xinghe:sad', '……對。阿柑姨笑起來，眼睛會不見。'], ['xinghe:sad', '第一次坐在妳旁邊的……是我。']] },
    { expr: 'smile', text: ['我每天都變得比較像燈一點。燈是不會怕的。', '可是我還會怕。所以，我還是我。', '星河怕黑。他不承認。', '他走夜路的時候會唱歌，唱得很難聽。'],
      after: [['xinghe:shy', '我、我唱得哪有很難聽！'], ['yungui:normal', '有。'], ['hongying:normal', '有。'], ['', '芋圓也看了他一眼。'], ['xinghe:cry', '……'], ['', '他笑了，然後笑不下去。']] },
    { expr: 'sad', text: ['夜玄先生每天晚上都來，跟罐子裡的小女孩說話。', '她不回答。', '我想，她累了。', '中元那天，我唱了歌。我覺得，有人聽到了。'],
      after: [['xinghe:sad', '……我聽到了。'], ['yungui:serious', '……罐子裡的小女孩。夜玄的女兒。']] },
  ];
  H.letter = async (S, i) => {
    const v = V();
    v.ch11_lread = v.ch11_lread || [];
    await paper({ title: `紙燈 ${i + 1}`, portrait: 'baizhi', expr: LETTERS[i].expr, lantern: true, pages: [LETTERS[i].text] });
    if (!v.ch11_lread.includes(i)) {
      v.ch11_lread.push(i);
      v.ch11_letters_read = v.ch11_lread.length;
      await L(S, LETTERS[i].after);
      if (v.ch11_letters_read >= 6 && !F('ch11_letters')) await H.wallWriting(S);
    }
  };
  H.wallWriting = async (S) => {
    if (F('ch11_letters')) {
      await paper({ kind: 'wall', pages: [['如果我忘了，請告訴我：我曾經很快樂。', { text: '星河，這一次，別再來找我了。', strike: ['別', '了'] }]] });
      return;
    }
    S.bgm('love');
    S.face('player', 'right');
    await S.say('', '東牆。一整面牆，用燒過的竹炭寫著大字。字很用力，有些地方把石灰都刮破了。');
    await paper({ kind: 'wall', portrait: 'baizhi', expr: 'sad', pages: [
      ['如果我忘了，請告訴我：我曾經很快樂。'],
      ['如果我忘了，請告訴我：我曾經很快樂。', { text: '星河，這一次，別再來找我了。', strike: ['別', '了'] }],
    ] });
    await L(S, [
      ['', '下面那一行，寫了又塗，塗了又寫。「別」字被劃了十幾道，劃到看不見。最後的「了」也被抹掉了。'],
      ['xinghe:surprise', '……'],
      ['xinghe:cry', '她……她把「別」劃掉了。'],
      ['hongying:sad', '……「星河，這一次，再來找我。」'],
      ['', '星河伸出手，按在那個被劃掉的字上。很久、很久。'],
      ['xinghe:cry', '笨蛋……妳才是笨蛋……'],
      ['xinghe:cry', '每次都跟我說「別來」……'],
      ['xinghe:serious', '……我知道了。我會去。'],
      ['xinghe:serious', '這一次，我一定到。'],
      ['', '星河拿起窗台上的玉笛，小心地收進懷裡。'],
    ]);
    await S.give('c11_bz_flute', 1);
    await S.give('c11_bz_letters', 1);
    await L(S, [
      ['yungui:normal', '……海風真大。眼睛進沙了。'],
      ['hongying:sad', '……今天沒有風喔。'],
      ['yungui:angry', '閉嘴。'],
      ['', '紅纓翻過其中一盞紙燈——紙的背面，畫著一個小小的箭頭，旁邊寫著「北牆的燈，往左轉」。'],
      ['hongying:surprise', '……她連出口都幫我們找好了。'],
      ['xinghe:smile', '……嗯。她就是這樣。'],
    ]);
    S.flag('ch11_letters');
    if (!F('ch11_secret')) S.objective('長明殿北牆——往上');
  };

  // ---------------------------------------------------------------- 11-10 逆潮台・鎖魂將
  function jailerHooks() {
    return {
      intro: async (b) => {
        b.say('魂罐裡的魂在替它擋刀……', 2.2);
        hookB(b, 'damage', (orig, tg, dmg, o) => {
          if (tg.id === 'c11_jailer' && b.enemies.some((e) => e.id === 'c11_jar' && !e.dead)) dmg = Math.max(1, Math.round(dmg * 0.5));
          return orig(tg, dmg, o);
        });
        hookB(b, 'kill', (orig, u) => {
          orig(u);
          if (u.id === 'c11_jar') { for (const p of b.alive('party')) healPct(b, p, 0.1); b.say('被放出的魂向你們道謝。', 1.6); }
        });
      },
      onTurn: async (b, u) => {
        if (u.id !== 'c11_jailer') return;
        const jars = b.enemies.filter((e) => e.id === 'c11_jar' && !e.dead).length;
        if (jars === 0 && !b._rage) { b._rage = true; await bLines(b, [['鎖魂將', '……還……我……罐……']]); b.addStatus(u, 'atkUp', 3); }
        const used = u.usedOnce && u.usedOnce.e11_jl_refill;
        u.d = Object.assign({}, u.d, { skills: G.Data.enemies.c11_jailer.skills.filter((s) => s.id !== 'e11_jl_refill' || (!used && jars < 3)) });
      },
    };
  }
  H.c11_10 = async (S) => {
    await L(S, [
      ['', '島頂的露天石台。中央是一盞三層樓高的巨燈。燈芯射出一道筆直的藍光，橫越天空，直指西方的海平線。'],
      ['yungui:serious', '錨燈。夜玄就是用它，把今晚釘在這裡。'],
      ['xinghe:angry', '那就拔掉它。'],
    ]);
    S.shake(5, 0.8); S.sfx('earth');
    await L(S, [
      ['', '燈座下的地面裂開。一具巨大的甲胄站了起來——由鎖鏈、魂罐、與熄不掉的長明燈拼成，沒有頭，胸口是一個空空的罐子。'],
      ['yungui:surprise', '……鎖魂將。用罐子跟鎖鏈拼出來的獄卒。'],
      ['hongying:serious', '它身上的罐子裡，還有人。'],
      ['xinghe:serious', '那就一起放出來！'],
    ]);
    const r = await S.battle('t11_jailer', jailerHooks());
    if (r !== 'win') return;
    S.flag('ch11_jailer');
    S.flag('ch11_night_moves');
    S.bgm('villain');
    S.sfx('shatter'); S.flash('#9fd8ff', 0.6, 0.6);
    await S.say('', '錨燈的燈罩出現一道裂痕。藍光劇烈閃爍。光中，浮現一個人影。');
    S.spawn({ id: 'yx_proj', sprite: 'yexuan', x: 12, y: 10, dir: 'down', ghost: true });
    await S.say('', '白衣黑袍，長髮以玉簪束起，面容溫和，眼神很疲倦。——夜玄的投影。');
    await L(S, [['yexuan:normal', '星河小友。紅纓姑娘。雲歸道長。'], ['yexuan:normal', '……還有。']]);
    S.spawn({ id: 'chenbo_t', sprite: 'chenbo', x: 12, y: 16, dir: 'up' });
    await S.camera(12, 15, 0.8);
    await L(S, [['', '石梯口。陳伯不知何時已站在那裡，拄著一支舊槳。'], ['chenbo:serious', '……阿玄。']]);
    S.cameraFollow();
    await L(S, [
      ['yexuan:smile', '阿渡。你老了。'],
      ['chenbo:angry', '你也沒年輕到哪去。'],
      ['yexuan:normal', '錨既然斷了，夜就會開始走。天亮之前，鬼門會關。'],
      ['yexuan:serious', '我在彼岸燈下等你們。等門關上的那一刻，潮會轉向。'],
      ['yexuan:serious', '所有的亡者，都會帶著記憶，回家。'],
      ['hongying:angry', '你在安平，已經讓我看過「回家」的人長什麼樣子了！'],
      ['yexuan:sad', '……青鋒的事，我很抱歉。'],
      ['yexuan:sad', '那一次，潮還不夠深。這一次，會夠。'],
      ['xinghe:angry', '白芷呢！'],
      ['yexuan:normal', '她在燈裡。很安靜。'],
      ['yexuan:sad', '她每天都忘記你一點點。我只是，讓那個過程溫柔一些。'],
      ['yexuan:sad', '這是燈的慈悲，星河小友。你該讓她忘記。'],
      ['xinghe:angry', '她在牆上寫了。她說——要我去找她！'],
      ['', '夜玄沉默了一瞬。'],
      ['yexuan:think', '……是嗎。'],
      ['yexuan:normal', '那就來吧。'],
      ['yexuan:smile', '阿渡，帶他們過來。就像從前一樣。'],
    ]);
    await S.fadeActor('yx_proj', 0, 0.8); S.remove('yx_proj');
    G.mapScene._shatter = G.mapScene.t;
    S.sfx('shatter'); S.shake(10, 1.0); S.flash('#bfe6ff', 0.8, 0.8);
    await pause(S, 1.0);
    S.light({ ambient: 0.6, color: '#060a1e' });
    S.particles(['motes', 'wind']);
    S.sfx('wind');
    bumpMoon(1);
    await L(S, [
      ['', '影像散去。錨燈「轟」地碎裂，藍光熄滅。'],
      ['', '靜。然後——天上的北斗，斗柄轉了一寸。星星開始閃爍。一陣風吹過石台，掀起紅纓的髮帶。'],
    ]);
    S.sfx('gong'); await pause(S, 0.8); S.sfx('gong');
    await L(S, [
      ['', '遠方，媽宮的方向，傳來天后宮的鐘聲。一聲，又一聲。'],
      ['yungui:serious', '夜在走了。……天亮以前，我們要到彼岸。'],
      ['hongying:surprise', '風！風回來了！澎湖的風！'],
      ['chenbo:serious', '……上船。'],
    ]);
    S.quest('q_ch11_main', 5);
    S.objective('回到王船，出航黑水溝（出航後無法返回澎湖）');
    S.toast('出航後將無法返回澎湖。請完成想做的事。', 'lantern');
    if (!F('ch11_weir_done')) { await S.say('', '麻糬望著媽宮的方向，輕輕叫了一聲。'); await S.say('yungui:think', '……媽宮那邊的石滬，還有人在哭。'); }
    S.remove('chenbo_t');
    await S.warp(DECK, 22, 8, 'right');
  };

  // ---------------------------------------------------------------- 11-11 陳伯的往事
  H.c11_11 = async (S) => {
    S.flag('ch11_sail'); V().ch11_leg = 1;
    await S.fadeOut(0.8);
    await S.warp(DECK, 22, 8, 'right', { reload: true, fade: 0 });
    S.hideFollowers(true);
    await S.fadeIn(0.8);
    S.bgm('sea');
    await S.say('', '王船離開玄武嶼。海水由墨綠，一寸一寸地，變成漆黑。');
    S.face('player', 'right');
    if (F('ch11_study')) {
      await S.say('', '星河走到舵旁，遞出那張舊畫像。');
      await S.say('xinghe:normal', '陳伯。我們在他房裡，找到這個。');
    } else {
      await S.say('xinghe:serious', '陳伯。他叫你「阿渡」。你們以前……是什麼關係？');
      await S.say('', '陳伯沉默了很久，從懷裡摸出一張折得很小、褪了色的畫——同一幅畫的小樣。');
      await S.say('chenbo:sad', '……這張，我也留著一張。');
    }
    await L(S, [
      ['', '陳伯看了很久。'],
      ['chenbo:sad', '……這是念丫頭五歲那年。安平的畫師畫的。'],
      ['chenbo:smile', '畫完收了三個錢。說兩個引魂人加一個小鬼頭，打個折。'],
      ['chenbo:normal', '我跟阿玄，十六歲就一起划槳了。'],
      ['chenbo:smile', '他划得比我好，燈也點得比我亮。死人都喜歡他。'],
      ['chenbo:sad', '二十年前，他回唐山接念丫頭。她娘病死了，只剩這個女兒。'],
      ['chenbo:sad', '回程的船，在黑水溝翻了。那一晚，我在海上當班。'],
      ['chenbo:serious', '我划過去的時候，船已經沒了。滿海都是燈。'],
      ['chenbo:sad', '他在水裡。一手抱著木板，一手抓著一盞小小的燈。'],
      ['chenbo:serious', '引魂人的規矩，第一條——引魂人不留魂。'],
      ['chenbo:sad', '我叫他放手。他不肯。我去搶……'],
      ['chenbo:sad', '……他用槳打了我。然後抱著那盞燈，消失在霧裡。'],
      ['chenbo:normal', '從那天起，我就不划槳了。回九份，糊燈籠。'],
      ['xinghe:sad', '……陳伯，你從來沒說過。'],
      ['chenbo:serious', '說了有什麼用。我沒攔住他。這二十年的債，有一半是我的。'],
      ['chenbo:normal', '兩年後的中元，我在八斗子撿到一盞水燈。'],
      ['chenbo:smile', '裡面躺著一個哭得震天響的小鬼。'],
      ['xinghe:surprise', '……！'],
      ['chenbo:serious', '那小鬼身上，有燈的火。我一看就知道。'],
      ['chenbo:normal', '我想——這一次，我一定要把這孩子顧好。'],
      ['chenbo:smug', '結果，顧成一個懶鬼。'],
      ['xinghe:cry', '陳伯……'],
      ['chenbo:angry', '哭什麼！眼淚收起來，留到見到那丫頭再用。'],
      ['hongying:smile', '……陳伯，你剛剛那句，跟星河平常講話一模一樣。'],
      ['chenbo:angry', '是他學我！'],
      ['chenbo:serious', '坐穩了。前面，就是黑水溝。'],
    ]);
    S.flag('ch11_chenbo_story');
    bumpMoon(2);
    S.quest('q_ch11_main', 5);
  };

  // ---------------------------------------------------------------- 11-12 漂燈之海
  H.c11_12 = async (S) => {
    await L(S, [
      ['', '海面上，無數小小的燈火漂浮。每一盞，都是一個魂。'],
      ['', '它們本該一齊往西漂——此刻卻停在原地打轉，有的甚至開始往回漂。'],
      ['hongying:surprise', '好多……這些全都是……'],
      ['chenbo:serious', '黑水溝幾百年來吞下的人。「六死三留一回頭」——死的那六個，都在這裡。'],
      ['yungui:serious', '燈在找不到岸。……逆潮的前兆。'],
      ['', '芋圓趴在船舷，伸出一隻前爪，想撥一盞燈。'],
      ['yungui:angry', '那是人。'],
      ['', '芋圓把爪子縮了回來，耳朵貼平，往星河身後躲。'],
      ['', '燈火輕輕碰觸船身，發出細細的聲音：冷……家……阿娘……'],
    ]);
    await S.walkTo('player', 12, 5, { yFirst: false });
    S.face('player', 'up');
    await S.say('', '星河伸手到船外。一盞燈立刻漂過來，貼在他的掌心——像一隻冷冷的小手。');
    S.emote('player', '…');
    await L(S, [
      ['chenbo:serious', '別把手伸出船外。燈會跟著暖的東西走。'],
      ['xinghe:sad', '……可是它好冷。'],
      ['chenbo:normal', '所以要快點，把燈點起來。'],
    ]);
    S.flag('ch11_leg1');
    S.objective('與陳伯說話，決定航向');
    S.toast('航向選單開放：與陳伯（舵）對話。', 'lantern');
  };

  // ---------------------------------------------------------------- 11-13 / 4-2 溺魂暗流：唐山阿伯
  H.tangshan1 = async (S) => {
    V().ch11_leg = 2;
    S.flag('ch11_tangshan_met');
    S.light({ ambient: 0.6 });
    await S.walkTo('player', 6, 7);
    S.face('player', 'left');
    await S.say('', '暗流。霧比較薄。一塊破船板上，坐著一個老人的魂。粗布短衫，辮子盤在頭上，手裡緊緊抓著一個油紙包。');
    const a = S.spawn({ id: 'amu', sprite: 'c11_amu_old', x: 3, y: 4, dir: 'right', ghost: true, light: { r: 90, color: '#bfe0ff' } });
    a.alpha = 0; await S.fadeActor('amu', 1, 0.6);
    await L(S, [
      ['', '他望著東方，用很老的調子哼著歌。'],
      ['唐山阿伯', '……少年仔？'],
      ['唐山阿伯', '咱……敢捌見過？'],
      ['xinghe:surprise', '……燈橋！夢裡那個阿伯！'],
      ['唐山阿伯', '橋頂彼个少年仔！你身軀頂，嘛有燈矣！'],
      ['唐山阿伯', '阮叫林阿木。同安人。十七歲過來台灣做穡。'],
      ['唐山阿伯', '做四十冬。錢，攏縫佇這个油紙包內底。'],
      ['唐山阿伯', '阮答應阿娘，賺著錢就轉去。'],
      ['唐山阿伯', '六十歲，阮總算坐船欲轉去矣……'],
      ['唐山阿伯', '船，佇黑水溝沉矣。'],
      ['唐山阿伯', '六死三留一回頭。阮是彼个「回頭」的——嘛是彼个「死」的。'],
      ['唐山阿伯', '阿娘一定咧怨阮。一去四十冬，一張批都無。'],
      ['唐山阿伯', '阮袂曉寫字。想欲寫，毋知按怎寫。'],
      ['唐山阿伯', '少年仔，恁敢會當替阮寫一張平安信？'],
    ]);
    S.quest('q_tangshan', 0);
    const c = await S.choice(['好。寫「平安到了」。', '可是……阿伯，你沒有到啊。']);
    if (c === 0) {
      await L(S, [
        ['', '雲歸提筆，在燈籠紙上寫了八個字。星河唸給他聽：「平安到了，免掛念。」'],
        ['唐山阿伯', '好，好……'],
        ['唐山阿伯', '……毋著。阮無到。阮知影。'],
        ['唐山阿伯', '阮只是……毋甘阿娘傷心。'],
      ]);
    } else await S.say('唐山阿伯', '……阮知影。阮知影……');
    if (F('ch11_xu_2')) await L(S, [['xinghe:serious', '媽宮的許秀才說：平安信不是寫給收信的人。'], ['xinghe:serious', '是寫給寄信的人。讓他的心，可以放下。']]);
    else await S.say('hongying:serious', '那我們寫真的。寫你最想跟她說的話。');
    await L(S, [['唐山阿伯', '……真的話。'], ['', '他想了很久。雲歸鋪開燈籠紙，提筆。唐山阿伯一句一句說，雲歸一句一句寫。']]);
    await paper({ title: '平安信', pages: [['阿娘：', '阮是阿木。', '阮有欲轉去。錢有儉夠，船嘛有坐。', '毋是阮袂記得阿娘，是海傷大。'], ['台灣的米真芳，山真懸，人真好。', '阮佇遐，有認真食飯。', '阿娘毋免閣等阮食飯矣。', '阮這馬，就來揣阿娘。', '　　　　　　　　不孝囝　阿木']] });
    await L(S, [
      ['唐山阿伯', '……著。就是這款。'],
      ['唐山阿伯', '毋過，批欲按怎寄？阿娘佇唐山……'],
      ['chenbo:normal', '黑水溝兩邊的死人，最後都到同一個岸。'],
      ['chenbo:normal', '你阿娘要是早就走了，她也在那邊。'],
      ['唐山阿伯', '……阿娘，會佇遐？'],
      ['chenbo:normal', '上船吧。信，自己帶去。'],
    ]);
    await S.give('c11_pingan_letter', 1);
    await S.fadeActor('amu', 0, 0.8); S.remove('amu');
    S.flag('ch11_tangshan_letter');
    S.refresh();
    await S.say('', '唐山阿伯化成一盞小燈，坐在船頭的鵝鑾鼻燈旁邊。');
    S.quest('q_tangshan', 1);
    S.light(deckLight(G.state));
  };

  // ---------------------------------------------------------------- 11-14 鯤之淵
  function kunHooks() {
    const base = () => G.Data.enemies.c11_kun.skills;
    return {
      hpFloor: { c11_kun: 0.02 }, rewards: true,
      intro: async (b) => {
        hookB(b, 'execute', async (orig, u, cmd) => {
          if (cmd.skill === 'e11_kun_swallow') {
            const c = b.alive('party');
            if (c.length <= 1 || b._swal) return orig(u, { kind: 'skill', skill: 'e_kun_spout', targets: c });
            const v = U.pick(c);
            b.banner('吞', '#ff9a8a'); G.Audio.sfx('splash'); b.shakeT = 0.6;
            b.say(`${v.name}被鯤吞了下去！`, 1.8);
            await b.wait(1.0);
            b._swal = { id: v.id, turns: 2 };
            b.removePartyMember(v.id);
            return;
          }
          if (cmd.skill === 'e11_kun_dive') { b.banner('北冥', '#ff9a8a'); b.say('鯤潛入深海……海面一片死寂。（防禦！）', 2.0); u.diving = true; b.tween(u, { alpha: 0.2 }, 0.6); await b.wait(1.0); return; }
          if (cmd.skill === 'e11_kun_breach') { u.diving = false; b.tween(u, { alpha: 1 }, 0.3); b.say('鯤破浪而出！', 1.4); }
          return orig(u, cmd);
        });
        hookB(b, 'damage', (orig, tg, dmg, o) => { if (tg.id === 'c11_kun' && tg.diving) { b.popText(tg, '潛入深海', '#a8c8ff'); return; } return orig(tg, dmg, o); });
      },
      onTurn: async (b, u) => {
        const kun = foe(b, 'c11_kun');
        if (u.id === 'c11_kun_tumor' && kun && !kun.diving) b.healUnit(kun, 300);
        if (b._swal && u === b.party[0]) {
          const s = b._swal, m = G.state.members[s.id];
          const st = G.Party.stats(s.id);
          m.hp = Math.max(1, m.hp - Math.round(st.mhp * 0.08));
          s.turns--;
          const tumors = b.enemies.some((e) => e.id === 'c11_kun_tumor' && !e.dead);
          if (s.turns <= 0 || !tumors) {
            b._swal = null;
            const nu = b.addPartyMember(s.id);
            if (nu) { b.say(`${nu.name}被吐了出來！`, 1.6); await b.wait(0.6); }
          }
        }
        if (u === kun) {
          kun.kt = (kun.kt || 0) + 1;
          let sk = base();
          if (kun.diving) sk = [{ id: 'e11_kun_breach', w: 1 }];
          else if (kun.hp < kun.mhp * 0.4 && kun.kt % 4 === 0) sk = [{ id: 'e11_kun_dive', w: 1 }];
          kun.d = Object.assign({}, kun.d, { skills: sk });
        }
      },
    };
  }
  H.c11_14 = async (S) => {
    V().ch11_leg = 3;
    await S.say('', '海面忽然平靜得像一面鏡子。燈火全都往兩邊散開。');
    S.shake(6, 3.0); S.sfx('dark');
    await L(S, [
      ['', '船底下，一道比王船長十倍的黑影，緩緩游過。'],
      ['yungui:surprise', '北冥有魚，其名為鯤。鯤之大，不知其幾千里也……'],
      ['xinghe:surprise', '不知道幾千里？那牠肚子裡，裝了幾千里的鬼嗎？！'],
      ['chenbo:serious', '鯤，是黑水溝的老守者。'],
      ['chenbo:serious', '牠吞下迷路的魂，馱著，游到彼岸，再吐出來。'],
      ['chenbo:sad', '可是燈暗了。牠找不到岸。只吞不吐，肚子裡塞滿了魂。'],
      ['', '鯤浮出海面。背上長滿了腫脹的、發藍光的燈瘤。牠的眼睛混濁，發出一聲長長的哀鳴——像整片海在哭。'],
      ['hongying:sad', '牠在痛。'],
      ['yungui:serious', '打破那些燈瘤，讓牠吐出來！'],
      ['xinghe:serious', '鯤！忍著點——我們幫你！'],
    ]);
    const r = await S.battle('t11_kun', kunHooks());
    if (r !== 'win') return;
    S.sfx('water'); S.flash('#d8f0ff', 0.8, 0.4);
    await L(S, [
      ['', '鯤仰起頭，噴出一道巨大的水柱——水柱裡是成千上萬的燈火，像煙火一樣在夜空中散開，再輕輕落在海面上，一齊往西漂去。'],
      ['', '鯤的眼睛變得清澈。牠緩緩轉過巨大的頭，看著船頭的星河。看了很久。'],
      ['chenbo:normal', '……鯤認得燈的火。臭小子，牠在認你。'],
      ['', '鯤潛入水中，又在船的前方浮起，慢慢地游。'],
      ['hongying:surprise', '牠在……帶路？'],
      ['yungui:smile', '化而為鳥，其名為鵬。……說不定哪天，牠真的會飛。'],
    ]);
    await S.give('c11_ar_kun_scale', 1);
    S.flag('ch11_kun');
    bumpMoon(3);
  };

  // ---------------------------------------------------------------- 11-15 無光之霧 ★★★
  const SLOTS = [[4, 3], [1, 4], [7, 2], [1, 11], [4, 13], [9, 13], [10, 2], [2, 2]];
  async function fogCameo(S, f, k) {
    const [x, y] = SLOTS[k % SLOTS.length];
    S.sfx(f.sfx || 'lantern');
    if (f.kind === 'mountain') { S.flash('#fff0c8', 0.9, 0.22); await L(S, f.lines); return; }
    if (f.kind === 'eye') {
      S.spawn({ id: 'cam_eye', sprite: 'ghost_child', x: 3, y: 9, light: { r: 220, color: '#ffe6a0' } });
      S.show('cam_eye', false);
      await L(S, f.lines); S.remove('cam_eye'); return;
    }
    if (f.kind === 'murals') {
      for (let i = 0; i < 4; i++) { const a = S.spawn({ id: 'cam_m' + i, sprite: i === 3 ? 'xinghe' : 'ghost_m', x: i * 2, y: 2, dir: 'right', ghost: true, light: { r: 80, color: '#ffd890' } }); a.alpha = 0.55; }
      for (let i = 0; i < 4; i++) S.move('cam_m' + i, 'RRR', { wait: false, speed: 1.5 });
      await L(S, f.lines);
      for (let i = 0; i < 4; i++) S.remove('cam_m' + i);
      return;
    }
    const a = S.spawn({ id: 'cam', sprite: f.sprite, x, y, dir: x < 5 ? 'right' : 'down', ghost: !!f.ghost, light: { r: 150, color: f.living ? '#ffd890' : '#cfe8ff' } });
    a.alpha = 0;
    let b = null;
    if (f.extra) { b = S.spawn({ id: 'cam2', sprite: f.extra, x: x + 1, y, dir: 'down', ghost: !!f.ghost }); b.alpha = 0; }
    await Promise.all([S.fadeActor('cam', f.living ? 0.7 : 1, 0.5), b ? S.fadeActor('cam2', f.living ? 0.7 : 1, 0.5) : null]);
    if (f.emote) S.emote('cam', f.emote);
    await L(S, f.lines);
    await Promise.all([S.fadeActor('cam', 0, 0.4), b ? S.fadeActor('cam2', 0, 0.4) : null]);
    S.remove('cam'); S.remove('cam2');
  }
  H.c11_15 = async (S) => {
    V().ch11_leg = 4; V().ch11_bow = 40;
    await S.fadeOut(0.8);
    await S.warp(DECK, 5, 8, 'left', { reload: true, fade: 0 });
    S.hideFollowers(true);
    await S.fadeIn(0.8);
    S.bgm(null); S.sfx('dark');
    await L(S, [
      ['', '霧。濃得連船頭都看不見。只剩低低的嗡鳴。'],
      ['', '船頭的鵝鑾鼻燈火，在燈罩裡縮成一粒豆子大小。前方的鯤也看不見了。'],
      ['chenbo:serious', '……無光之霧。黑水溝最深的地方。'],
    ]);
    const gray = { color: '#9aa2b4' };
    await S.say('', '霧中傳來聲音。很多、很多聲音。沒有臉的聲音。');
    await S.say('?', '回頭吧……', gray);
    await S.say('?', '六死、三留、一回頭……你們，就當那個回頭的吧……', gray);
    await S.say('?', '為什麼要忘記我們……為什麼……', gray);
    S.face('deck_hy', 'left');
    await S.say('', '紅纓猛然回頭。霧裡，站著一個戴鬼面具的身影。');
    const q = S.spawn({ id: 'fog_qf', sprite: 'qingfeng_mask', x: 6, y: 3, dir: 'down', ghost: true }); q.alpha = 0.5;
    await S.say('?', '紅纓。回家吧。爹娘在等妳。', gray);
    await S.say('hongying:hurt', '……哥？');
    S.remove('fog_qf');
    await S.say('', '雲歸身後，傳來一聲蒼老的嘆息。');
    await S.say('?', '雲歸。你又走錯路了。', gray);
    await S.say('yungui:hurt', '……師父？');
    await S.say('', '然後——星河的耳邊，一個他聽過千百次的聲音。');
    await S.say('?', '星河。回去吧。', gray);
    await S.say('?', '我已經不記得你了。', gray);
    await L(S, [['xinghe:hurt', '……'], ['xinghe:hurt', '白、白芷……？']]);
    await S.narrate(['老水手的話，在記憶中閃過：', '「聽著有人叫你的名，莫應。」'], { veil: 0.6 });
    await L(S, [['xinghe:serious', '……不對。'], ['xinghe:serious', '她寫的是「再來找我」。她才不會叫我回去。'], ['xinghe:angry', '你不是她！']]);
    S.shake(5, 0.8); S.sfx('dark');
    V().ch11_bow = 0; V().ch11_dark = 1;
    S.light({ ambient: 0.985, playerR: 1 });
    await L(S, [
      ['', '霧猛地一縮——然後撲了上來。船頭的燈火，熄了。'],
      ['xinghe:hurt', '燈……滅了……'],
      ['hongying:hurt', '好黑……我什麼都看不到……'],
      ['', '黑暗裡，一團又重又暖的毛擠到星河腳邊，緊緊貼著他。是芋圓。'],
    ]);
    S.light({ ambient: 0.95, playerR: 130, playerColor: '#ff9a5a' });
    S.sfx('lantern');
    await L(S, [
      ['', '黑暗中，星河懷裡，有一點光自己亮了起來。是陳伯在中元夜給他的那盞燈籠——紅紙、竹骨，寫著「沈星河」三個字。'],
      ['陳伯（黑暗中）', '……那是我做的。'],
      ['陳伯（黑暗中）', '沒有魂燈的人，由別人替他點一盞。'],
      ['陳伯（黑暗中）', '臭小子。你以為，替你點過燈的，只有我一個？'],
      ['陳伯（黑暗中）', '摸摸你的胸口。'],
      ['xinghe:think', '……？'],
    ]);
    // 二、心燈
    S.light({ ambient: 0.9, playerR: 200, playerColor: '#ffd890' });
    S.sfx('lantern');
    await L(S, [['', '黑暗中，星河的胸口，亮起一點小小的光。'], ['', '接著，又一點。又一點。'], ['', '那是這一年來，他收下的每一盞心燈。']]);
    S.bgm('ending', { fade: 2 });
    let k = 0;
    // (always) the woman & child from the lantern bridge
    {
      const c1 = S.spawn({ id: 'cam', sprite: 'ghost_child', x: 4, y: 3, dir: 'down', ghost: true, light: { r: 140, color: '#cfe8ff' } });
      const c2 = S.spawn({ id: 'cam2', sprite: 'ghost_f', x: 5, y: 3, dir: 'down', ghost: true }); c1.alpha = 0; c2.alpha = 0;
      await Promise.all([S.fadeActor('cam', 1, 0.5), S.fadeActor('cam2', 1, 0.5)]);
      await L(S, [['燈橋上的孩子', '大哥哥！你身上……有好多燈了！'], ['燈橋上的婦人', '孩子，你找到你的燈了。']]);
      S.remove('cam'); S.remove('cam2'); k++;
    }
    for (const f of FOG) if (hasAny(f.ids)) await fogCameo(S, f, k++);
    for (const e of extraLanterns()) {
      S.sfx('lantern');
      if (e.c && e.c.fog) { await fogCameo(S, { sprite: e.c.sprite || 'ghost_m', ghost: true, lines: [[e.c.who || '', e.c.fog]] }, k++); continue; }
      await S.say('', `一盞燈從星河的胸口飛出，燈上浮現「${e.name}」。`);
      await S.say('', '燈裡傳來一聲很輕的「多謝」。');
    }
    // always: the freed souls, the captain, 船仔媽
    await fogCameo(S, { sprite: 'ghost_m', ghost: true, extra: 'ghost_f', lines: [['萬魂窟的魂', '……謝謝你們打破罐子。']] }, k++);
    await fogCameo(S, { sprite: 'c11_captain', ghost: true, lines: [['烏鬚船主', '老子說過要幫忙說聲對不住——順便幫你們照個路！']] }, k++);
    S.flash('#ffd890', 0.8, 0.35); S.sfx('bell');
    await S.say('', '船仔媽神龕的燭火，亮成一道金線，指向前方。');
    // 三、霧散
    V().ch11_bow = 320; V().ch11_dark = 0;
    S.flag('ch11_fog');
    S.light(deckLight(G.state));
    S.particles(['lanterns', 'motes']);
    S.sfx('lantern');
    await L(S, [
      ['', '所有的光圍繞著王船，一圈、一圈。霧被推開了。'],
      ['', '熄滅的鵝鑾鼻燈火，被一盞小小的心燈碰了一下——「噗」，重新燃起。比之前更亮。'],
      ['', '前方，鯤浮出海面，背上停滿了光。'],
      ['chenbo:smile', '看到沒有，臭小子。這就是你這一年走過的路。'],
      ['chenbo:smile', '你以為你沒有魂燈。你錯了。'],
      ['chenbo:smile', '你身上，掛了這麼多盞。'],
      ['xinghe:cry', '……大家……'],
      ['hongying:cry', '笨蛋……哭什麼……'],
      ['', '紅纓自己哭得比誰都兇。'],
      ['yungui:smile', '「一個人點的燈，很脆弱。一千個人點的燈，永遠不會熄。」'],
      ['yungui:think', '……燈母祠裡聽到的話。原來是這個意思。'],
    ]);
    const n = G.Lanterns.count();
    if (n >= 14) await L(S, [['', '光多得像銀河落進了海裡。整片黑水溝都在發光。'], ['yungui:cry', '好多……比九份的中元還多……']]);
    else if (n >= 8) await L(S, [['', '光照出一條窄窄的、明亮的水路。'], ['hongying:smile', '夠走了！夠走了！'], ['yungui:think', '……還不算亮。到了彼岸，不知道夠不夠。']]);
    else await L(S, [['', '只有幾盞光。但足夠照亮船頭。'], ['chenbo:normal', '夠了。燈不在多，在有。'], ['yungui:serious', '……只怕，到了燈下，會不夠。']]);
    await L(S, [['', '前方的海平線，出現一道紅色的岸。岸的盡頭，一座白色的巨塔，頂端的光虛弱地明滅。'], ['chenbo:serious', '……彼岸。']]);
    bumpMoon(4);
    V().ch11_leg = 5;
    await S.fadeOut(1.0);
    await S.warp('farshore_field', 27, 39, 'up', { fade: 0 });
    await S.fadeIn(1.0);
  };

  // ---------------------------------------------------------------- 11-16 彼岸
  H.c11_16 = async (S) => {
    S.setPos('player', 27, 39, 'up');
    await L(S, [
      ['', '王船靠岸。岸上，是一望無際的紅色彼岸花。花瓣像小小的燈火，微微發光，從花上脫落，往天上飄。'],
      ['', '天空是溶化的紫與金——看不出是黃昏，還是黎明。'],
      ['xinghe:surprise', '……這就是彼岸。'],
      ['hongying:think', '比我想的……安靜。'],
      ['yungui:normal', '人走到這裡，就不需要說話了。'],
    ]);
    await S.move('player', 'U');
    S.face('player', 'down'); S.face('chenbo', 'up');
    await L(S, [
      ['', '眾人下船。陳伯沒有動。'],
      ['chenbo:normal', '我只能送到這裡。'],
      ['xinghe:surprise', '陳伯不一起去嗎？'],
      ['chenbo:serious', '活人上了彼岸，就要有人在岸邊顧槳。'],
      ['chenbo:serious', '沒人顧槳，就沒人回得去。'],
      ['chenbo:normal', '去吧。把那丫頭帶回來。我在這裡等。'],
      ['chenbo:smile', '……跟十八年前一樣。'],
      ['xinghe:smile', '嗯。等我們。'],
    ]);
    await S.move('player', 'UU');
    S.face('player', 'down');
    await L(S, [
      ['', '星河走了幾步，又回頭。'],
      ['xinghe:shy', '陳伯。'],
      ['chenbo:normal', '幹嘛。'],
      ['xinghe:smile', '……謝謝你把我撿回來。'],
      ['chenbo:angry', '快滾！'],
    ]);
    S.face('chenbo', 'down');
    await S.say('', '他轉過身去整理纜繩。纜繩其實不需要整理。');
    S.flag('ch11_farshore');
    S.quest('q_ch11_main', 6);
    S.objective('穿過彼岸花原，前往彼岸燈塔');
  };

  // ---------------------------------------------------------------- 彼岸花原 NPCs & 11-17
  H.chenboShore = async (S) => {
    if (G.Inv.has('c11_ac_old_tassel') && !F('ch11_tassel')) {
      S.flag('ch11_tassel');
      return L(S, [['chenbo:surprise', '……這是我的。二十年前，掉進海裡的。'], ['chenbo:smile', '你留著吧。槳穗，是讓槳不要忘記回家的路。']]);
    }
    if (F('ch11_tower_3') && !F('ch11_cb_tower3')) {
      S.flag('ch11_cb_tower3');
      await L(S, [['chenbo:think', '……你們在塔裡，看到阿玄了？'], ['chenbo:sad', '看到了，就好。省得我再講一次。']]);
    }
    await S.say('chenbo:normal', '我在這裡顧槳。累了就回來。');
    const c = await S.choice(['休息（全員恢復・存檔）', '不用'], { cancel: 1 });
    if (c !== 0) return;
    await S.fadeOut(0.8); G.Party.healAll(); S.sfx('heal'); await pause(S, 0.8); await S.fadeIn(0.8);
    S.toast('在渡口歇了一會兒。全員完全恢復。', 'lantern');
    await S.saveMenu();
  };
  H.teawoman = async (S) => {
    await L(S, [['茶婆', '喝茶嗎？放心，這裡的茶，不會讓你忘記什麼。'], ['茶婆', '我也不知道我為什麼開茶棚。大概是活著的時候開慣了。']]);
    await S.shop(['c11_higan_tea', 'c11_qingxin_tea', 'c11_lamp_oil', 'huanhunxiang', 'huanhundan'], { title: '茶婆的茶棚' });
    await S.say('茶婆', '活人的錢？……好暖。好久沒摸過了。');
  };
  H.waitingWoman = async (S) => {
    const v = V(); v.ch11_waitf = (v.ch11_waitf || 0) + 1;
    if (F('ch11_done')) return L(S, [['等人的婦人', '……我等的，是你。我想起來了。']]);
    if (v.ch11_waitf >= 3) return L(S, [['等人的婦人', '你們要是看到有人在找人……就跟他說，我在這裡。']]);
    return L(S, [['等人的婦人', '我在等人。'], ['等人的婦人', '等誰呢……我忘了。'], ['等人的婦人', '可是我還在等。等，好像已經變成我了。']]);
  };
  H.nameplate = (S) => (F('ch11_done') ? L(S, [['看名牌的老人', '蔡萬得。……是我。']]) : L(S, [
    ['看名牌的老人', '這上面寫的，是我的名字。'],
    ['看名牌的老人', '……我看不清楚了。'],
    ['yungui:think', '……字被花粉蓋住了。不，是字自己在淡掉。'],
    ['看名牌的老人', '名字淡了，人就輕了。輕了，就該走了。'],
    ['看名牌的老人', '可是燈不亮，我不知道往哪裡走。'],
  ]));
  H.petalChild = async (S) => {
    if (F('ch11_done')) return L(S, [['撿花瓣的孩子', '大哥哥！它們見面了！']]);
    await L(S, [
      ['撿花瓣的孩子', '大哥哥，你知道嗎？這種花，開花的時候沒有葉子。'],
      ['撿花瓣的孩子', '長葉子的時候，花就謝了。'],
      ['撿花瓣的孩子', '花跟葉，一輩子都見不到面喔。'],
      ['hongying:angry', '……好討厭的花。'],
      ['xinghe:serious', '那就讓它們見一次面。'],
      ['撿花瓣的孩子', '……可以嗎？'],
      ['xinghe:smile', '不知道。試試看。'],
    ]);
    S.flag('ch11_flower_talk');
  };
  H.c11_17a = async (S) => {
    await L(S, [
      ['', '花原上到處都是魂。有的坐著，有的站著，有的繞著同一棵枯樹一直走。沒有人在往前走。'],
      ['hongying:surprise', '他們……怎麼都停在這裡？'],
      ['yungui:serious', '燈太暗了。看不見燈，就不知道該往哪裡走。'],
      ['yungui:sad', '待得太久，連自己在等什麼都忘了。'],
    ]);
    const f = S.spawn({ id: 'fl_faceless', sprite: 'ghost_m', x: 24, y: 31, dir: 'right', ghost: true }); f.alpha = 0;
    await S.fadeActor('fl_faceless', 0.8, 0.6);
    await S.say('', '一個沒有五官的魂從花叢裡站起，朝他們伸出手——又縮了回去。');
    await S.fadeActor('fl_faceless', 0, 0.6); S.remove('fl_faceless');
    await L(S, [['xinghe:sad', '……無面鬼。'], ['yungui:serious', '忘了自己的臉的人。他們不是壞東西。只是……太久沒有人叫他們的名字了。']]);
  };
  H.c11_17b = async (S) => {
    S.face('player', 'right'); S.face('fs_suwan', 'left');
    await L(S, [
      ['', '花原中央，一座小小的木棧橋。橋頭坐著一位素衣婦人，挽著髻，膝上放著一盞白燈籠。整片花原，只有她的燈是暖的。'],
      ['蘇婉', '……你們從那邊來？'],
      ['xinghe:normal', '是的。阿姨，妳在這裡……等人？'],
      ['蘇婉', '嗯。等一個綁雙髻的小女孩。'],
      ['蘇婉', '還有一個……很固執的男人。'],
      ['蘇婉', '我等他們，二十年了。'],
      ['hongying:surprise', '二十年……'],
      ['蘇婉', '我家那口子，什麼都抓得太緊。抓燈、抓人、抓記憶。'],
      ['蘇婉', '可是他是個溫柔的人。等他想通了，就會放手的。'],
      ['yungui:think', '……夫人。您的夫君，姓夜？'],
      ['蘇婉', '我姓蘇。你們叫我念兒她娘就好。'],
      ['', '眾人一時說不出話。'],
      ['蘇婉', '去吧。燈塔會照出每個人心裡最重的那盞燈。'],
      ['蘇婉', '別怕看見。看見了，才放得下。'],
      ['蘇婉', '……要是見到他，替我說一句。'],
      ['蘇婉', '鬍子，記得刮。'],
    ]);
    S.flag('ch11_wife_met');
    S.objective('前往北端的彼岸燈塔');
  };
  H.suwan = (S) => (F('ch11_tower_3') ? L(S, [['蘇婉', '……你們看到他了吧。二十年前的他。'], ['蘇婉', '他是個溫柔的人。溫柔的人，最不會放手。']]) : L(S, [['蘇婉', '去吧。燈塔會照出每個人心裡最重的那盞燈。'], ['蘇婉', '別怕看見。看見了，才放得下。']]));
  H.tsMother = (S) => L(S, [['唐山阿婆', '我咧等阮後生。伊講賺著錢就轉來。'], ['唐山阿婆', '……伊會轉來。阮阿木，講話算話。']]);
  H.tangshan3 = async (S) => {
    S.face('player', 'right');
    await L(S, [['', '小渡口旁，一位極老的阿婆，提著一盞小燈，望著海。'], ['唐山阿婆', '我咧等阮後生。伊講，賺著錢就轉來。']]);
    S.sfx('lantern');
    const a = S.spawn({ id: 'amu', sprite: 'c11_amu_old', x: 29, y: 11, dir: 'right', ghost: true }); a.alpha = 0;
    await S.fadeActor('amu', 1, 0.6);
    await L(S, [
      ['', '星河身後，那盞小燈飄了出來，化成阿木伯。他看著阿婆，整個人僵住了。'],
      ['唐山阿伯', '……阿娘？'],
      ['唐山阿婆', '你是……？'],
      ['唐山阿伯', '阿娘，是阮啦。阿木。'],
      ['唐山阿婆', '阮阿木，才十七歲……'],
    ]);
    S.flash('#ffffff', 0.6, 0.3);
    S.remove('amu');
    S.spawn({ id: 'amu', sprite: 'c11_amu_young', x: 29, y: 11, dir: 'right', ghost: true });
    await L(S, [
      ['', '阿木伯的身影，慢慢地、慢慢地變年輕——白髮變黑，背挺直了——變回那個十七歲、要出門過海的少年。'],
      ['唐山阿婆', '……阿木。'],
      ['唐山阿婆', '憨囝……你哪會去遮久……'],
      ['少年阿木', '阮有寫批。'],
      ['唐山阿婆', '阿娘袂曉字……'],
      ['少年阿木', '阮嘛袂曉。'],
      ['', '母子兩人看著那張信，哭著笑了出來。'],
      ['少年阿木', '少年仔，你唸予阮阿娘聽。'],
      ['', '星河接過信，一句一句唸。阿婆一句一句點頭。唸到「阿娘毋免閣等阮食飯矣」，阿婆捂住了嘴。'],
      ['唐山阿婆', '……憨囝。阿娘早就知影矣。'],
      ['唐山阿婆', '阿娘只是……想欲聽你講。'],
      ['唐山阿婆', '燈若光，阮就欲行矣。阮已經毋驚等矣。'],
      ['少年阿木', '阮兩个，做伙等。'],
    ]);
    S.take('c11_pingan_letter', 1);
    S.flag('ch11_tangshan_done');
    await S.lantern('lantern_tangshan', '唐山客的平安信');
    await L(S, [['少年阿木', '這是阮四十冬的錢。阮用袂著矣。予恁。'], ['xinghe:shy', '這怎麼行……'], ['', '星河推回去；推不過，只從裡面拿出一枚銅錢。'], ['xinghe:smile', '一枚就好。剩下的，阿伯留著——那邊應該也有芋圓。']]);
    await S.give('c11_ac_tangshan_coin', 1);
    S.quest('q_tangshan', 'done');
    S.remove('amu');
  };

  // ---------------------------------------------------------------- 彼岸燈塔 echoes (full-screen 回聲)
  const fadeFig = (f, a, sec = 0.8) => G.Tweens.to(f, { alpha: a }, sec, 'linear');
  H.c11_18 = async (S) => {
    S.bgm('lighthouse');
    await L(S, [
      ['', '白色的螺旋石階沿著牆往上繞，看不見頂。中央一盞白燈靜靜燃著。'],
      ['yungui:think', '每一層都有一盞回聲燈。蘇夫人說，塔會照出每個人心裡最重的燈。'],
      ['', '紅纓走近回聲燈。燈光一閃——'],
    ]);
    S.flash('#ffffff', 0.6, 0.9);
    const figs = [
      { sprite: 'c11_echo_mother', x: 380, y: 560, flip: true, alpha: 0.85 },
      { sprite: 'c11_echo_father', x: 520, y: 520, flip: true, alpha: 0.85 },
      { sprite: 'c11_echo_qingfeng', x: 780, y: 560, alpha: 0.85 },
      { sprite: 'c11_echo_hongying', x: 920, y: 600, alpha: 0.85 },
    ];
    await cg(S, { bg: 'mansion', tint: 'rgba(255,170,90,0.45)', tintMode: 'soft-light', figures: figs, caption: '洛家・三年前的中元前夕' }, async () => {
      S.bgm('mansion');
      await L(S, [
        ['hongying:surprise', '……這裡是……洛家。'],
        ['hongying:sad', '三年前，中元的傍晚。'],
        ['', '中庭裡，幾個半透明的人影在擺普渡供品：一位端莊的婦人、一位嚴肅的中年男子、一個十八歲的少年、一個十六歲紅髮帶的少女。'],
        ['洛母（回聲）', '紅纓，普渡的供品，別偷吃。'],
        ['少女紅纓（回聲）', '我沒有！是、是老鼠！'],
        ['洛父（回聲）', '老鼠會拿筷子？'],
        ['少年青鋒（回聲）', '（笑）'],
        ['洛父（回聲）', '青鋒。明天起，你教妹妹洛家劍。'],
        ['少年青鋒（回聲）', '爹，她連槍都還握不穩。'],
        ['少女紅纓（回聲）', '哥！'],
        ['少年青鋒（回聲）', '好啦好啦。明年妳生日，我教妳第一式。'],
        ['', '紅纓站在回聲之中，一動也不動。'],
        ['hongying:cry', '……沒有明年了。那天晚上，就……'],
      ]);
      S.bgm('sad');
      figs[0].alpha = 0.35; figs[1].alpha = 0.35; figs[3].alpha = 0.35; figs[2].flip = true;
      await L(S, [
        ['', '少年青鋒的回聲停下手中的事。慢慢轉過頭——看著「現在」的紅纓。'],
        ['青鋒（回聲）', '紅纓。'],
        ['hongying:surprise', '……哥？你、你看得到我？'],
        ['青鋒（回聲）', '槍，握得太緊了。'],
        ['青鋒（回聲）', '槍是用來護人的。不是用來報仇。'],
        ['hongying:cry', '……我知道。我已經知道了。'],
        ['hongying:cry', '你欠我的第一式，我自己從劍譜裡學會了。'],
        ['青鋒（回聲）', '不愧是我妹妹。'],
        ['青鋒（回聲）', '那就好。……放鬆一點。'],
        ['青鋒（回聲）', '妳以後，要過得開心一點喔。'],
      ]);
      await Promise.all(figs.map((f) => fadeFig(f, 0, 1.0)));
    });
    S.bgm('lighthouse');
    await S.fadeIn(0.6);
    await L(S, [['', '回聲散去。中庭變回白色的石牆。'], ['', '紅纓背對著所有人站了很久。然後一把抱起芋圓，緊緊抱住。']]);
    S.emote('yuyuan', '!');
    await L(S, [['', '芋圓被抱得變了形，可是沒有掙扎。'], ['hongying:cry', '……不准說出去。'], ['', '芋圓一臉「我本來就不會說話」的表情。'], ['', '星河看著別處。雲歸看著別處。']]);
    S.flag('ch11_tower_1'); S.quest('q_ch11_main', 7); S.refresh();
    S.objective('往上，二樓');
  };
  H.c11_19 = async (S) => {
    S.flash('#ffffff', 0.6, 0.9);
    const figs = [{ sprite: 'c11_echo_boy', x: 520, y: 600, pose: 'ko', alpha: 0.85 }, { sprite: 'c11_echo_qingxu', x: 1000, y: 560, alpha: 0 }];
    await cg(S, { bg: 'mountain', tint: 'rgba(255,150,80,0.5)', tintMode: 'soft-light', figures: figs, caption: '觀音山・十七年前' }, async () => {
      S.bgm('temple');
      await L(S, [
        ['', '整層樓變成一片傍晚的山林——觀音山。雲正從海上，慢慢地回到山腰。'],
        ['yungui:surprise', '……喂喂。輪到貧道了？'],
        ['', '山路邊，倒著一個七歲左右的瘦小男孩，嘴邊還沾著蕈菇的碎屑，一邊抽搐一邊傻笑。'],
        ['xinghe:surprise', '那孩子……在笑？'],
        ['yungui:shy', '……別看。'],
      ]);
      fadeFig(figs[1], 0.85, 0.8); G.Tweens.to(figs[1], { x: 680 }, 1.0, 'outQuad');
      await pause(S, 1.0);
      figs[0].pose = 'idle';
      await L(S, [
        ['', '一位白鬚道人快步走來，把男孩抱起，餵了一顆藥丸。'],
        ['清虛（回聲）', '你這孩子，什麼都敢往嘴裡塞。'],
        ['男孩（回聲）', '……餓。'],
        ['清虛（回聲）', '餓，也不能吃這個。這叫「鬼笑蕈」。吃了會一直笑，笑到死。'],
        ['男孩（回聲）', '（嘿嘿嘿）'],
        ['hongying:think', '……所以你研究蘑菇，是因為——'],
        ['yungui:smug', '知己知彼。貧道不打算被同一種蘑菇打敗兩次。'],
        ['清虛（回聲）', '你叫什麼名字？'],
        ['男孩（回聲）', '……沒有。'],
        ['', '清虛抬頭，看著雲一朵一朵回到山上。'],
        ['清虛（回聲）', '雲飄得再遠，傍晚，也都會回到山上。'],
        ['清虛（回聲）', '雲歸。就叫雲歸吧。'],
        ['', '回聲中的清虛轉過頭，看著「現在」的雲歸。'],
        ['清虛（回聲）', '你回來了。'],
        ['yungui:sad', '……還沒。貧道還沒回去。'],
        ['清虛（回聲）', '你一直都在回來的路上。'],
        ['清虛（回聲）', '去吧。替為師，把那幾個孩子送回家。'],
        ['yungui:sad', '師父，我……'],
        ['清虛（回聲）', '還有。酒，少喝點。'],
      ]);
      await Promise.all(figs.map((f) => fadeFig(f, 0, 1.0)));
    });
    S.bgm('lighthouse');
    await S.fadeIn(0.6);
    await L(S, [
      ['', '回聲散去。雲歸低著頭，解下腰間的葫蘆，仰頭喝了一大口。'],
      ['xinghe:normal', '……雲歸，借我一口。'],
      ['', '星河接過葫蘆喝了一口。愣住。'],
      ['xinghe:surprise', '……裡面是水。'],
      ['yungui:normal', '最後一夜。要清醒。'],
    ]);
    S.flag('ch11_tower_2'); S.refresh();
    await S.say('', '上樓的門前，五根符柱亮起了字。門上寫著：「始於春，生生不息。」');
    S.objective('點亮符柱（始於春，生生不息）');
  };
  H.wuxing = async (S, k) => {
    const v = V(); v.ch11_wx = v.ch11_wx || 0;
    if (k === WX_ORDER[v.ch11_wx]) {
      v.ch11_wx++; S.sfx('magic'); S.refresh();
      await S.say('', `「${k}」字的符柱亮了起來。`);
      if (v.ch11_wx >= 5) {
        S.sfx('gong'); S.flash('#fff6d8', 0.6, 0.5);
        S.flag('ch11_wuxing_puzzle'); S.refresh();
        await L(S, [['', '五根符柱同時亮起，光在柱與柱之間流轉，生生不息。往上的門，開了。'], ['yungui:smug', '貧道小時候背的東西，總算有點用。']]);
        S.objective('往上，三樓');
      }
      return;
    }
    v.ch11_wx = 0; S.refresh();
    S.sfx('thunder'); S.flash('#e8f0ff', 0.5, 0.7); S.shake(5, 0.4);
    for (const m of G.Party.active()) { const st = G.Party.stats(m.id); m.hp = Math.max(1, m.hp - Math.round(st.mhp * 0.05)); }
    await S.say('', '五根符柱同時熄滅——一道雷落了下來！');
    if (!F('ch11_wx_hint')) { S.flag('ch11_wx_hint'); await S.say('yungui:think', '春屬木。木生火、火生土……五行相生，貧道小時候背到想吐。'); }
  };
  H.c11_20 = async (S) => {
    S.flash('#ffffff', 0.6, 0.9);
    const figs = [{ sprite: 'c11_young_yexuan', x: 480, y: 610, pose: 'hurt', alpha: 0.9 }, { sprite: 'c11_young_chendu', x: 1050, y: 560, alpha: 0 }];
    let storm = 0;
    await cg(S, { bg: 'sea', dark: 0.25, figures: figs, caption: '黑水溝・二十年前',
      draw: (ctx, t) => { if (Math.sin(t * 2.3) > 0.97) { ctx.fillStyle = `rgba(230,240,255,${0.25 * fxK()})`; ctx.fillRect(0, 0, G.W, G.H); } storm = t; } }, async () => {
      S.bgm('sea'); S.sfx('thunder'); S.shake(4, 0.6);
      await L(S, [
        ['', '整層樓灌滿了黑色的海水。暴雨。雷。一艘唐山來的戎克船，正在黑水溝裡翻覆。'],
        ['hongying:surprise', '這不是我們任何一個人的——'],
        ['yungui:serious', '是這座塔記得的事。……二十年前。'],
        ['', '海裡，一個年輕男人抱著一塊木板，滿臉是血與雨。——年輕的夜玄。'],
        ['年輕的夜玄（回聲）', '念兒——！念兒——！'],
        ['', '一盞小小的魂燈從浪底浮起，漂向黑暗。夜玄撲過去，用雙手捧住它。'],
        ['年輕的夜玄（回聲）', '抓到了……抓到了……爹在這裡……'],
      ]);
      fadeFig(figs[1], 0.85, 0.8); G.Tweens.to(figs[1], { x: 760 }, 1.2, 'outQuad');
      await pause(S, 1.0);
      await L(S, [
        ['', '一艘小小的引魂舟破浪而來。船尾，一個年輕的引魂人撐著槳。——年輕的陳渡。'],
        ['年輕的陳渡（回聲）', '阿玄！放手！那是念丫頭的魂燈——讓她走！'],
        ['年輕的夜玄（回聲）', '她才七歲！她連怕都還來不及怕！'],
        ['年輕的陳渡（回聲）', '引魂人不留魂！這是你教我的！'],
        ['年輕的夜玄（回聲）', '……那我不當引魂人了。'],
      ]);
      S.sfx('hit'); S.shake(6, 0.4); figs[1].pose = 'ko';
      await L(S, [
        ['', '夜玄揮起槳。陳渡跌進海裡。夜玄抱著那盞燈，退進霧中。'],
        ['年輕的夜玄（回聲）', '念兒，爹在。爹不會讓妳一個人。'],
        ['年輕的夜玄（回聲）', '爹不會讓任何人忘記妳。'],
        ['', '他身後的黑水裡，浮起許多沒有臉的影子，貼在他耳邊低語。'],
      ]);
      await S.say('?', '抓緊……別放……', { color: '#9aa2b4' });
      await S.say('?', '抓緊……別讓我們被忘記……', { color: '#9aa2b4' });
      await L(S, [['yungui:serious', '……那是什麼？'], ['xinghe:serious', '霧裡的那些聲音。……原來從那時候就在了。']]);
      await Promise.all(figs.map((f) => fadeFig(f, 0, 0.8)));
    });
    void storm;
    const room = [{ sprite: 'yexuan', x: 560, y: 600, alpha: 0.85 }];
    await cg(S, { bg: 'palace', dark: 0.35, figures: room, caption: '府城・很多年',
      draw: (ctx, t) => { const g = ctx.createRadialGradient(700, 520, 0, 700, 520, 90); g.addColorStop(0, 'rgba(120,200,255,0.7)'); g.addColorStop(1, 'rgba(120,200,255,0)'); ctx.fillStyle = g; ctx.fillRect(600, 420, 200, 200); } }, async () => {
      S.bgm('villain');
      await S.say('', '海水退去，場景變了：一間冷清的屋子。夜玄一個人坐在桌前，對著一只罐子說話。他的頭髮，一年一年地白了。');
      await L(S, [['夜玄（回聲）', '念兒，今天府城下雨了。'], ['夜玄（回聲）', '念兒，爹做了一盞新的燈。很亮。'], ['夜玄（回聲）', '念兒……妳說句話，好不好？']]);
      await fadeFig(room[0], 0, 1.0);
    });
    S.bgm('lighthouse');
    await S.fadeIn(0.6);
    await L(S, [
      ['', '回聲散去。'],
      ['hongying:sad', '……我恨他。他害死了哥。'],
      ['hongying:sad', '可是……'],
      ['yungui:normal', '恨他也沒關係。只是，別變成他。'],
      ['xinghe:sad', '陳伯從來沒說過，他被打的那一下。'],
      ['xinghe:serious', '……陳伯是想救他的。一直都是。'],
    ]);
    S.flag('ch11_tower_3');
    V().ch11_falls = 0;
    await S.warp('farshore_tower_3', 11, 20, 'up', { reload: true });
    await S.say('', '往上的路，是浮在回聲海面上的一排木板。木板一踩上去，就開始往下沉。');
    S.objective('踩著浮板，到北邊的石台');
  };
  // ---- P3 沉板
  H.p3Update = (dt, ms, busy) => {
    if (!p3Active(G.state)) return;
    const s = ms._p3 || (ms._p3 = { t: 0, planks: P3_PLANKS.map(() => ({ step: null, down: 0 })), safe: [11, 20] });
    s.t += dt;
    const falls = V().ch11_falls || 0;
    const noSink = falls >= 6, delay = falls >= 3 ? 3.0 : 1.5;
    for (const pl of s.planks) {
      if (pl.down > 0) { pl.down -= dt; if (pl.down <= 0) { pl.down = 0; pl.step = null; } }
      else if (pl.step != null && !noSink) { pl.step += dt; if (pl.step >= delay) { pl.down = 3; pl.step = null; } }
    }
    const ph = s.t % 6;
    s.wave = noSink ? null : ph >= 5 ? 'on' : ph >= 4 ? 'warn' : null;
    const p = ms.player;
    if (p.moving || busy || s.falling) return;
    const tr = ms.terrainAt(p.x, p.y);
    if (tr === 'tile_floor' || tr === 'basalt_floor') s.safe = [p.x, p.y];
    const i = P3_PLANKS.findIndex(([x, y]) => x === p.x && y === p.y);
    if (i < 0) return;
    const pl = s.planks[i];
    if (pl.step == null && pl.down <= 0) pl.step = 0;
    if (pl.down > 0 || (s.wave === 'on' && P3_WAVE.includes(i))) { s.falling = true; G.Script.run((S) => H.p3Fall(S, s)); }
  };
  const FALL_LINES = [['xinghe:hurt', '我不會游泳！我會游泳！我不確定！'], ['hongying:angry', '笨蛋，看路！'], ['yungui:normal', '……貧道袖子濕了。']];
  H.p3Fall = async (S, s) => {
    const v = V(); v.ch11_falls = (v.ch11_falls || 0) + 1;
    S.sfx('splash');
    await S.fadeOut(0.4);
    S.setPos('player', s.safe[0], s.safe[1], 'up'); S.gather();
    for (const pl of s.planks) { pl.step = null; pl.down = 0; }
    s.t = 0;
    await S.fadeIn(0.4);
    const l = FALL_LINES[(v.ch11_falls - 1) % 3];
    await S.say(l[0], l[1]);
    if (v.ch11_falls === 6) { await S.say('', '芋圓叼著一條繩子，一聲不響地游了過去，把繩子繞在木板上。'); await S.say('yungui:surprise', '……原來貓會游泳。'); }
    s.falling = false;
  };
  H.p3Draw = (ctx, t, ms) => {
    if (!p3Active(G.state) || !ms._p3) return;
    const s = ms._p3;
    P3_PLANKS.forEach(([x, y], i) => {
      const pl = s.planks[i], px = x * T, py = y * T;
      const wave = P3_WAVE.includes(i) ? s.wave : null;
      if (pl.down > 0 || wave === 'on') {
        ctx.fillStyle = 'rgba(6,10,22,0.86)'; ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = 'rgba(160,200,255,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(px + T / 2, py + T / 2, 18 + Math.sin(t * 4) * 4, 7, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (pl.step != null) {
        ctx.fillStyle = `rgba(6,10,22,${Math.min(0.5, pl.step / 3)})`; ctx.fillRect(px, py, T, T);
      }
      if (wave === 'warn') { ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 12)})`; ctx.lineWidth = 3; ctx.strokeRect(px + 3, py + 3, T - 6, T - 6); }
    });
  };
  H.p3Done = async (S) => {
    S.sfx('gong');
    S.flag('ch11_p3_done');
    await S.warp('farshore_tower_3', 11, 4, 'up', { reload: true });
    await S.say('', '回聲的海退去了。白色的石地板，重新出現在腳下。往上的石梯，開了。');
    S.objective('往上，四樓');
  };
  H.c11_21 = async (S) => {
    S.flash('#ffffff', 0.8, 1);
    const spirit = { sprite: 'c11_echo_baizhi', x: 640, y: 300, alpha: 0, pose: 'cast' };
    const st = { baby: 1, dark: 0, boat: 0 };
    await cg(S, { bg: 'lighthouse', figures: [spirit], caption: '彼岸燈・十八年前',
      draw: (ctx, t) => {
        ctx.fillStyle = 'rgba(255,252,240,0.82)'; ctx.fillRect(0, 0, G.W, G.H);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const lk = 1 - st.dark * 0.25;
        ctx.globalAlpha = lk; ctx.drawImage(G.FX.glowSprite('#fff4dc'), 640 - 330, 160 - 330, 660, 660);
        if (st.baby) { const bx = 640 + st.boat * 520, by = 470 + Math.sin(t * 3) * 4; ctx.globalAlpha = 1; ctx.drawImage(G.FX.glowSprite(st.baby > 1 ? '#ffb060' : '#d8e8ff'), bx - 22, by - 22, 44, 44); }
        ctx.restore();
        if (st.dark) { const g = ctx.createRadialGradient(640, 360, 200, 640, 360, 760); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(4,6,14,${0.85 * st.dark})`); ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H); }
      } }, async () => {
      S.bgm('love');
      await L(S, [
        ['', '四周變成一片無邊的白光。這裡沒有海，也沒有天。只有一盞極大、極亮的燈。'],
        ['yungui:surprise', '……這是彼岸燈。還亮著的時候的彼岸燈。'],
        ['', '一點極小極小的光，從遠方漂過來。它在哭——細細的、新生的哭聲。'],
        ['hongying:surprise', '那是……嬰兒的魂？'],
      ]);
      fadeFig(spirit, 0.85, 1.2); G.Tweens.to(spirit, { y: 560 }, 1.6, 'outQuad');
      await pause(S, 1.4);
      await L(S, [
        ['', '燈的光中，一個身影緩緩降下。黑色的長髮像光一樣散開，眼裡燃著金色的火——是白芷。但比現在更透明、更像火焰。'],
        ['xinghe:surprise', '白芷……！'],
        ['yungui:serious', '……十八年前的她。燈靈。'],
        ['', '燈靈伸出雙手，捧住那點小小的光。光停止了哭泣。'],
        ['燈靈（回聲）', '……又是你啊。'],
        ['xinghe:surprise', '……「又」？'],
        ['燈靈（回聲）', '每一次，你都走那座橋來找我。'],
        ['燈靈（回聲）', '每一次，橋都會斷。'],
        ['燈靈（回聲）', '這一次……你連一歲都還沒有呢。'],
      ]);
      st.baby = 2; G.Tweens.to(st, { dark: 0.3 }, 1.0, 'linear');
      await L(S, [
        ['', '燈靈低下頭，對著掌心的小光，輕輕吹了一口氣。她身上的一點火，流進了那點光裡。小光變成溫暖的橘色。'],
        ['', '與此同時，她身後那盞巨大的燈，暗了一點點。'],
        ['燈靈（回聲）', '去吧，小東西。去活。'],
      ]);
      G.Tweens.to(st, { boat: 1 }, 2.4, 'inQuad');
      await L(S, [
        ['', '她從燈旁取下一盞小小的水燈，把那點光放進去，放在潮水上——逆著潮，推向東方。'],
        ['燈靈（回聲）', '星河……這一次，別再來找我了。'],
      ]);
      await fadeFig(spirit, 0, 1.0);
      await L(S, [['', '回聲靜止。所有人看著星河。'], ['xinghe:surprise', '……那是我。'], ['xinghe:surprise', '那個嬰兒……是我。'], ['yungui:think', '看來你這傢伙，不只這輩子在找她。']]);
      G.Tweens.to(st, { dark: 1 }, 1.2, 'linear');
      S.bgm(null);
      await S.say('', '白光邊緣，滲出黑色的水。沒有臉的聲音貼著星河的耳朵。');
      await S.say('?', '你偷了她的光。', { color: '#9aa2b4' });
      await S.say('?', '燈會暗……是因為你。', { color: '#9aa2b4' });
      await S.say('xinghe:hurt', '……燈會暗……是因為我……？');
      S.sfx('hit');
      await L(S, [
        ['', '紅纓走過來，一巴掌拍在星河的後腦勺上。'],
        ['xinghe:hurt', '痛！'],
        ['hongying:angry', '笨蛋。她是「給」你的。'],
        ['hongying:angry', '給的，跟偷的，不一樣。'],
        ['xinghe:surprise', '……'],
        ['hongying:serious', '你要是真覺得欠她，就去還。'],
        ['hongying:serious', '用活著還。好好地、吵吵鬧鬧地活著還。'],
      ]);
      G.Tweens.to(st, { dark: 0 }, 1.2, 'linear');
      S.bgm('love');
      S.flash('#ffb060', 0.8, 0.5);
      await L(S, [
        ['', '黑水退去。星河背上的劍「螢火」，忽然亮了起來——橘色的光，和回聲中那點小光一模一樣。'],
        ['yungui:surprise', '劍在回應……她給你的那點火。'],
        ['xinghe:serious', '……我知道了。我去還。'],
        ['xinghe:smile', '紅纓。謝謝。'],
        ['hongying:shy', '……少、少噁心了。走啦。'],
      ]);
    });
    S.bgm('lighthouse');
    await S.fadeIn(0.6);
    G.Inv.add('c11_sw_yinghuo_ming', 1);
    if (G.state.members.xinghe) G.Party.equip('xinghe', 'weapon', 'c11_sw_yinghuo_ming');
    S.sfx('item');
    S.toast('螢火覺醒——獲得 {y}螢火・明{/}（已自動裝備）', 'sword');
    S.flag('ch11_tower_4');
    S.objective('往上，五樓');
  };
  H.c11_22 = async (S) => {
    S.flash('#ffffff', 0.6, 0.9);
    await cg(S, { bg: 'shrine', tint: 'rgba(255,210,120,0.4)', tintMode: 'soft-light', caption: '燈之層' }, async () => {
      S.bgm('farshore');
      await L(S, [
        ['', '整層樓的牆壁變成了燈罩的內側。牆上浮現一幅幅會動的畫。'],
        ['', '歷代燈暗時，燈靈被沖上人間的海岸；每一次，都有一個人，提著燈，渡海來找她。'],
        ['', '每一次，她都回到燈裡；每一次，那個人都忘了她。'],
        ['yungui:serious', '……燈母祠的壁畫，畫的就是這個。'],
        ['hongying:sad', '每一次……都是這樣結束的？'],
        ['', '牆上的最後一幅，是空白的。'],
        ['xinghe:serious', '這一次，還沒畫完。'],
      ]);
    });
    await S.fadeIn(0.6);
    await L(S, [
      ['', '樓層四周，漂浮著六盞小小的、溫暖的燈。它們像迷路的螢火蟲，在白色的燈罩裡亂飛。'],
      ['yungui:think', '那些是……她正在失去的東西。人間的記憶。'],
      ['xinghe:serious', '全部撿回來。一盞都不留在這裡。'],
    ]);
    S.flag('ch11_tower_5');
    S.quest('q_baizhi_memory', 0);
    S.objective('收集白芷的記憶（6）');
    S.bgm('love');
    await S.narrate(['牆上，浮現一段發光的字。白芷的聲音輕輕唱出：', '燈三盞，渡三人，', '三更潮落月無痕；', '一聲舊名輕輕喚，', '燈前燈後是故人。'], { veil: 0.75 });
    S.flag('lyric_ch11');
    S.bgm('farshore');
  };
  // ---- 4-3 她的記憶
  const MEM_TEXT = {
    1: { lines: [['baizhi:smile', '燙燙的、軟軟的、甜甜的。星河說要吹三下。我吹了十下，還是燙到舌頭。']], after: [['xinghe:smile', '……她那天舌頭腫了一整晚。']] },
    2: { lines: [['baizhi:think', '我寫「我想知道我是誰」。星河寫的那一面，他不讓我看。'], ['baizhi:smile', '後來風一吹，我看到了。']], after: [['xinghe:surprise', '她、她看到了？！'], ['hongying:smug', '你寫了什麼？'], ['xinghe:shy', '……秘密。']] },
    3: { lines: [['baizhi:smile', '紅纓煮的粥，是紫色的。我說好吃，她笑了。'], ['baizhi:shy', '那是我第一次說謊。原來說謊是暖的。']], after: [['hongying:cry', '……那個粥，本來應該是白的。']] },
    4: { lines: [['baizhi:smile', '芋圓的肚子，是世界上最軟的地方。比雲還軟。'], ['baizhi:think', '我問雲歸，雲是什麼做的。他說，是芋圓。']], after: [['yungui:smug', '貧道所言不虛。'], ['', '芋圓翻過身，露出肚子。']] },
    5: { lines: [['baizhi:smile', '雲歸說他不信神。可是他每次經過土地公廟，都會偷偷點頭。']], after: [['yungui:shy', '……禮貌而已。']] },
    6: { lines: [['baizhi:normal', '九份的樓梯好多。下雨的時候很滑。星河伸手給我。'], ['baizhi:shy', '他的手很燙。'], ['baizhi:smile', '那時候我想……如果我是燈，我想照著這隻手。']], after: [['xinghe:cry', '……'], ['', '紅纓拍拍星河的背，什麼也沒說。']] },
  };
  H.memCollect = async (S, k) => {
    if (F('ch11_mem_' + k)) return;
    S.flag('ch11_mem_' + k);
    S.sfx('lantern'); S.flash('#ffd890', 0.6, 0.35);
    await S.say('', '燈光包住了星河。白芷的聲音，從燈裡傳來——');
    await L(S, MEM_TEXT[k].lines);
    await L(S, MEM_TEXT[k].after);
    const n = MEM.filter((m) => F('ch11_mem_' + m.k)).length;
    S.toast(`收進小袋的記憶：${n} / 6`, 'lantern');
    if (n >= 6) {
      await L(S, [['', '六盞燈在星河手心聚成一盞，溫暖得像剛煮好的芋圓。'], ['xinghe:smile', '我會全部還給妳。一盞都不少。']]);
      S.flag('ch11_mem_all');
      await S.lantern('lantern_baizhi_memory', '她的記憶');
      await S.give('c11_ac_memory_lamp', 1);
      S.quest('q_baizhi_memory', 'done');
      S.objective('往上——石階口的守燈人');
    }
  };
  H.memTuanzi = async (S, m) => {
    await L(S, [['', '那盞燈又飄開了，像在跟他們玩。麻糬抬起頭，靜靜地看著它。']]);
    const c = await S.choice(['麻糬，去！', '我自己來'], { cancel: 1 });
    if (c === 0) {
      S.sfx('step');
      await S.say('', '麻糬輕輕一躍，用兩隻前爪把燈攏進懷裡。燈在她的毛裡發著光，像她一直守著的那盞水燈。');
      await S.say('hongying:smile', '……她認得白芷的光。');
      await H.memCollect(S, m.k);
    } else await S.say('', '麻糬又趴了下來，尾巴輕輕擺著。……它累了就會停下來的。');
  };
  H.memUpdate = (dt, ms, busy) => {
    if (!F('ch11_tower_5') || F('ch11_mem_all')) return;
    ms._mem = ms._mem || MEM.map((m) => Object.assign({ at: 'a', cd: 0, hops: 0 }, m));
    if (busy) return;
    const p = ms.player;
    for (const m of ms._mem) {
      if (F('ch11_mem_' + m.k)) continue;
      m.cd -= dt;
      const pos = m[m.at];
      const d = Math.abs(p.x - pos[0]) + Math.abs(p.y - pos[1]);
      if (d === 0 && !p.moving) { G.Script.run((S) => H.memCollect(S, m.k)); return; }
      if (m.shy && !m.tired && d <= 2 && d > 0 && m.cd <= 0) {
        m.at = m.at === 'a' ? 'b' : 'a'; m.cd = 0.9; m.hops++; G.Audio.sfx('bell');
        if (m.hops >= 2 && !m.offered) { m.offered = true; G.Script.run((S) => H.memTuanzi(S, m)); return; }
        if (m.hops >= 5) m.tired = true;
      }
    }
  };
  H.memDraw = (ctx, t, ms) => {
    if (!F('ch11_tower_5') || F('ch11_mem_all')) return;
    const list = ms._mem || MEM.map((m) => Object.assign({ at: 'a' }, m));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const m of list) {
      if (F('ch11_mem_' + m.k)) continue;
      const [x, y] = m[m.at];
      const px = x * T + T / 2 + Math.sin(t * 1.7 + m.k) * 6, py = y * T + T / 2 - 34 + Math.sin(t * 2.3 + m.k * 2) * 8;
      ctx.globalAlpha = 0.9; ctx.drawImage(G.FX.glowSprite('#ffd890'), px - 30, py - 30, 60, 60);
      ctx.globalAlpha = 1; ctx.drawImage(G.FX.glowSprite('#fff4dc'), px - 8, py - 8, 16, 16);
    }
    ctx.restore();
  };
  // ---- 11-23 千年燈塔守
  H.c11_23 = async (S) => {
    if (F('ch11_warden') || !F('ch11_tower_5')) { if (!F('ch11_tower_5')) await S.say('千年燈塔守', '……'); return; }
    S.face('player', 'up');
    await L(S, [
      ['', '一具高大的青銅守燈人。燈杖拄地，身上覆滿千年的燈灰。它的燈罩臉裡，火是黑的。'],
      ['千年燈塔守', '……來者……止步……'],
      ['千年燈塔守', '燈……不能……被打擾……燈靈大人……在睡……'],
      ['yungui:serious', '它也病了。潮病。守了一千年的燈，自己的火卻黑了。'],
      ['xinghe:serious', '對不起。我們一定要上去。'],
    ]);
    const r = await S.battle('t11_warden');
    if (r !== 'win') return;
    await L(S, [
      ['', '守燈人單膝跪下。燈罩臉裡的黑火，褪成了微弱的白。'],
      ['千年燈塔守', '……燈靈大人……一直……很寂寞……'],
      ['千年燈塔守', '每一次……她都……在這裡……等……'],
      ['千年燈塔守', '這一次……請你們……帶她……'],
    ]);
    await S.fadeActor('warden', 0, 1.2);
    await S.say('', '守燈人的身體化成燈灰，靜靜地落在石階上。');
    S.flag('ch11_warden');
    bumpMoon(5);
    S.objective('登上燈塔頂');
  };

  // ---------------------------------------------------------------- 11-24 燈心之門
  H.c11_24 = async (S) => {
    S.setPos('player', 7, 9, 'up');
    await L(S, [
      ['', '塔頂。一扇由光構成的門，被六條黑色的鎖鏈纏住。門後，隱約可見一團巨大的白色火焰——弱得像風中的燭火。'],
      ['', '只剩心跳般的低頻。'],
      ['xinghe:serious', '門……打不開。'],
      ['hongying:angry', '那就劈開！'],
    ]);
    await S.move('hongying', 'U', { speed: 6 });
    S.sfx('stab');
    await L(S, [['', '紅纓一槍刺去——槍尖穿過了門，像刺進一片光，什麼也沒碰到。'], ['hongying:surprise', '……什麼？']]);
    S.flash('#fff6e0', 0.8, 0.4);
    await L(S, [
      ['', '門上的光，輕輕一晃。一個溫柔、遙遠、像一千盞燈同時說話的聲音響起。'],
      ['lantern_mother:normal', '孩子們。'],
      ['yungui:surprise', '燈母……！'],
      ['lantern_mother:normal', '這扇門，不在這裡，也不在那裡。'],
      ['lantern_mother:normal', '它在一呼、一吸之間。'],
      ['lantern_mother:smile', '吸一口氣。把一路上帶著的，都吸進來。'],
      ['lantern_mother:smile', '然後——放手。'],
      ['', '聲音消失。'],
      ['yungui:think', '……內景經上說：「一息之間，有萬象。」'],
      ['yungui:think', '原來不是比喻。'],
      ['yungui:serious', '我教你們。手牽手。不要怕。'],
      ['xinghe:surprise', '手、手牽手？'],
      ['hongying:shy', '……只、只有這一次喔。'],
      ['', '三個人圍成一圈。紅纓牽著星河，星河牽著雲歸，雲歸的另一隻手……紅纓猶豫了一下，還是握住了。'],
      ['', '芋圓擠進圈子正中間，坐下。麻糬把尾巴繞在紅纓的手腕上。'],
      ['yungui:serious', '閉上眼睛。吸——'],
    ]);
    await waitScene(new BreathScene());
    S.sfx('bell'); S.sfx('lantern', 0.2); S.sfx('bell', 0.5);
    S.flag('ch11_breath');
    S.quest('q_ch11_main', 8);
    await S.warp('breath_realm', 19, 34, 'up', { color: '#ffffff', fade: 0.8 });
  };

  // ---------------------------------------------------------------- 11-25 一息界・萬象童子
  const TZC = { color: '#ffd8f4' };
  const tz = (S, text) => S.say('萬象童子', text, TZC);
  H.c11_25 = async (S) => {
    await L(S, [
      ['', '一呼。'],
      ['', '世界像蓮花一樣向內摺疊，再向外綻開。顏色有了聲音，聲音有了形狀。'],
      ['', '牆壁是由會笑的寶石砌成的。每一面都在旋轉，每一面都通往另一面。天上有一座廟，廟裡有一座廟，廟裡還有一座廟。'],
      ['', '有一種很強烈的感覺：這裡比九份、比任何地方，都更「真」。'],
      ['xinghe:surprise', '這……這裡是……'],
      ['', '一群小小的、寶石做成的孩子，從地面的花紋裡「翻」了出來。他們的身體一下子是孩子，一下子是轉動的萬花筒，一下子是一串笑聲。'],
    ]);
    for (const id of ['tz1', 'tz2', 'tz3']) S.face(id, 'player');
    await tz(S, '你來了！你來了！');
    await tz(S, '你又來了！');
    await tz(S, '上次你也是這樣張著嘴！');
    await tz(S, '上上次也是！嘻嘻嘻嘻！');
    await S.say('xinghe:surprise', '上次？我、我沒來過啊！');
    await tz(S, '{y}◆{/}　{g}◆{/}　{b}◆{/}');
    await S.say('yungui:think', '……我好像聽懂了。他說：「你來過，你忘了，那是好事情。」');
    await tz(S, '這個人聽得懂！這個人讀過書！');
    await tz(S, '書裡都是我們！可是畫得好醜！');
    await S.say('yungui:shy', '……抱歉。');
    await S.say('', '童子們發現了芋圓和麻糬。全部一起擠過來。');
    await tz(S, '是貓！是兩隻不說話的貓！');
    S.emote('yuyuan', '💢');
    await S.say('', '芋圓把背弓得像一座橋，擋在星河前面。');
    await tz(S, '貓是什麼顏色？');
    S.emote('mochi', '♪');
    await S.say('', '麻糬慢慢地眨了一下眼睛。');
    await S.say('yungui:think', '……她說，是燈的顏色。');
    await tz(S, '哈哈哈哈哈哈！');
    S.flash('#ffe6ff', 0.4, 0.25 * fxK());
    await S.say('', '整個空間跟著笑，牆上的寶石一起閃。一個童子繞著紅纓轉了一圈。');
    await tz(S, '紅色的姊姊！妳心裡有一把槍。');
    await tz(S, '槍尖朝內。轉過來吧，轉過來，就變成花了。');
    await S.say('hongying:surprise', '……');
    await S.say('', '童子們拉著星河的袖子，帶他看一面「顏色」——那不是任何他見過的顏色。');
    await tz(S, '這是什麼顏色？');
    await S.say('xinghe:think', '……不知道。我從來沒看過。');
    await tz(S, '是「想念」的顏色喔！');
    await tz(S, '你們那邊沒有這個顏色。所以你們只好用眼淚。');
    await S.say('xinghe:sad', '……');
    await tz(S, '你沒有魂燈？');
    await S.say('xinghe:normal', '……嗯。');
    await tz(S, '嘻嘻！那你就是燈芯呀！');
    await tz(S, '燈芯自己看不到自己發光！');
    await tz(S, '一輩子？你們那邊的人，把一輩子當成很長很長的東西。');
    await tz(S, '好好笑！一輩子就是——呼——一口氣呀！');
    await L(S, [['xinghe:serious', '……我想救她。救那盞燈。燈靈。白芷。'], ['xinghe:serious', '告訴我，要怎麼做？']]);
    const old = S.spawn({ id: 'tzold', sprite: 'c11_tongzi', x: 20, y: 17, dir: 'down', ghost: true }); old.alpha = 0; old.big = true;
    await S.say('', '所有的童子同時安靜下來。寶石不轉了。最古老的那個童子——由一千種光疊成——慢慢浮到星河面前。');
    await S.say('最老的萬象童子', '你以為燈是光嗎？', { color: '#fff4dc' });
    await S.say('最老的萬象童子', '燈是看見光的那個人。', { color: '#fff4dc' });
    S.remove('tzold');
    await S.say('', '寶石重新開始轉動。童子們又笑成一團。');
    await S.say('xinghe:think', '看見光的……人？');
    await tz(S, '門是一種很害羞的牆。你笑一下，它就打開了。');
    await tz(S, '北邊！北邊！光在北邊迷路了！');
    S.flag('ch11_tongzi_met');
    S.objective('前往北邊的「光之曼陀羅」');
    await H.tongziAsk(S);
  };
  H.tongziAsk = async (S) => {
    await tz(S, '要玩嗎？要玩嗎？我們變顏色，你們來猜！');
    const c = await S.choice(['好，來玩！', '下次吧。'], { cancel: 1 });
    if (c !== 0) { await tz(S, '下次！下次就是剛剛！嘻嘻！'); return; }
    await H.tongziGame(S);
  };
  H.tongziTalk = async (S, i) => {
    if (!F('ch11_tongzi_met')) return tz(S, '嘻嘻！');
    if (i === 1 && !F('ch11_tongzi_game')) return H.tongziAsk(S);
    const say = [['紅色的花最想要光！'], ['你們好會玩！再玩一次？下次就是剛剛！'], ['燈芯呀燈芯，北邊！北邊！']][i];
    return tz(S, say[0]);
  };
  // ---- 萬象遊戲 (optional battle, special rule 'tongzi')
  const BEATS = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
  const EL_NAME = { metal: '白金', wood: '翠綠', water: '深藍', fire: '赤紅', earth: '金黃' };
  const EL_COL = { metal: '#f4f0e0', wood: '#7af08a', water: '#6aa0ff', fire: '#ff6a5a', earth: '#ffd04a' };
  function tongziHooks() {
    const ELS = Object.keys(BEATS);
    return {
      loseOk: true, turnLimit: 15, turnLimitResult: 'flee',
      intro: async (b) => {
        for (const e of b.enemies) e.elem = U.pick(ELS);
        b.say('萬象遊戲：用剋住童子顏色的屬性打他們！', 2.4);
        hookB(b, 'damage', (orig, tg, dmg, o) => {
          if (tg.side === 'enemy' && /^c11_tongzi/.test(tg.id) && o && o.attacker) {
            const el = o.elem, em0 = b.elemFactor(el, tg) || 1;
            const f = el && BEATS[el] === tg.elem ? 2 : el && BEATS[tg.elem] === el ? 0 : 0.5;
            if (f === 0) { b.healUnit(tg, Math.round(tg.mhp * 0.1)); b.popText(tg, '嘻嘻，不對！', '#ffd8f4'); return; }
            dmg = Math.max(1, Math.round(dmg / em0 * f));
            if (f === 2) b.popText(tg, '咯咯咯！', '#fff0a0', -60);
          }
          return orig(tg, dmg, o);
        });
        hookB(b, 'execute', async (orig, u, cmd) => {
          if (cmd.skill === 'e11_tz_swap') {
            const tg = U.pick(b.alive('party'));
            b.banner('變變變', '#ffd8f4'); G.Audio.sfx('magic');
            const st = {};
            for (const k of Object.keys(tg.st)) { if (k.endsWith('Up')) st[k.replace('Up', 'Down')] = tg.st[k]; else if (k.endsWith('Down')) st[k.replace('Down', 'Up')] = tg.st[k]; else st[k] = tg.st[k]; }
            tg.st = st; b.popText(tg, '變變變！', '#ffd8f4');
            await b.wait(0.8); return;
          }
          if (cmd.skill === 'e11_tz_bubble') {
            const tg = U.pick(b.alive('party'));
            b.banner('彩色泡泡', '#ffd8f4'); G.Audio.sfx('bell');
            b.addStatus(tg, U.pick(['atkUp', 'defUp', 'magUp', 'spdUp', 'regen']), 2);
            await b.wait(0.8); return;
          }
          return orig(u, cmd);
        });
      },
      onTurn: async (b, u) => {
        if (!/^c11_tongzi/.test(u.id)) return;
        let e; do { e = U.pick(ELS); } while (e === u.elem);
        u.elem = e; b.popText(u, EL_NAME[e], EL_COL[e], -30);
      },
    };
  }
  H.tongziGame = async (S) => {
    const r = await S.battle('t11_tongzi', tongziHooks());
    if (r === 'win') {
      await S.say('', '童子們笑得在地上打滾，變成一陣彩色的紙屑。');
      await tz(S, '你們贏了！你們好會玩！');
      await tz(S, '給你們這個！它不值錢，所以它很珍貴！');
      if (!F('ch11_tongzi_game')) { await S.give('c11_ac_wanxiang_bell', 1); await S.give('c11_mat_nameless', 1); }
      S.flag('ch11_tongzi_game');
    } else if (r === 'lose') {
      G.Party.healAll();
      await S.say('', '全員倒下——下一秒被童子們笑嘻嘻地扶起來，氣血和真氣都滿了。');
      await tz(S, '再玩一次？這裡沒有人會輸喔！');
    } else await tz(S, '不玩了！下次！');
  };

  // ---------------------------------------------------------------- 11-26 光之曼陀羅
  H.c11_26a = async (S) => {
    await S.say('', '一片 9×9 的寶石地板，像一朵攤開的曼陀羅。南緣有一道白光射出，打在一朵寶石蓮花上，又折向一邊，消失在虛空裡。');
    await tz(S, '光迷路了！');
    await tz(S, '紅色的花、藍色的花、金色的花，都在等光。');
    await tz(S, '中間那個「座」，也在等！');
    await S.say('yungui:think', '轉動那些寶石蓮花，替光指路……是嗎。');
    S.objective('轉動寶石，替光指路');
  };
  H.mandalaHint = async (S) => {
    const n = V().ch11_mtog || 0;
    if (n >= 10) return tz(S, '最上面那排，光要往右走喔！');
    if (n >= 6) return tz(S, '紅色的花最想要光！先讓紅花笑！');
    return tz(S, '轉轉看！轉轉看！寶石會笑的！');
  };
  H.mirror = async (S, i) => {
    if (F('ch11_mandala')) return;
    const m = mirrors(); m[i] = m[i] === '/' ? '\\' : '/';
    V().ch11_mtog = (V().ch11_mtog || 0) + 1;
    S.sfx('bell');
    const tr = traceLight();
    if (V().ch11_mtog === 6 && !tr.seat) await tz(S, '紅色的花最想要光！先讓紅花笑！');
    if (V().ch11_mtog === 10 && !tr.seat) await tz(S, '最上面那排，光要往右走喔！');
    if (tr.seat && !F('ch11_seat_lit')) {
      S.flag('ch11_seat_lit');
      S.sfx('lantern');
      await S.say('', '三朵寶石花依序亮起：紅、藍、金。光流到中央的燈座上——燈座亮了一瞬，又暗了下來。');
      await tz(S, '光到了！可是——');
      await tz(S, '沒有人看見呀！');
      await S.say('xinghe:think', '……燈是看見光的那個人。');
      S.objective('……站上燈座？');
    }
  };
  H.breathUpdate = (dt, ms, busy) => {
    // jewel blooms under the player's feet
    ms._bloom = ms._bloom || [];
    const p = ms.player;
    if (p.moving && Math.random() < dt * 10) ms._bloom.push({ x: p.px + U.rand(-10, 10), y: p.py - 4, t: 0, h: U.rand(0, 360) });
    for (const b of ms._bloom) b.t += dt;
    ms._bloom = ms._bloom.filter((b) => b.t < 1.2);
    if (busy || F('ch11_mandala') || p.moving) return;
    const onSeat = p.x === MO.x + SEAT[0] && p.y === MO.y + SEAT[1];
    if (!onSeat) { ms._seatMsg = false; return; }
    if (G.state.party[0] !== 'xinghe') { if (!ms._seatMsg) { ms._seatMsg = true; G.Script.run((S) => tz(S, '不是你！是燈芯！燈芯呢？')); } return; }
    if (traceLight().seat) G.Script.run((S) => H.c11_26b(S));
  };
  H.c11_26b = async (S) => {
    if (F('ch11_mandala')) return;
    S.flag('ch11_mandala');
    S.sfx('lantern'); S.flash('#fff6e0', 1.0, 0.6);
    await L(S, [
      ['', '光穿過星河的身體。他的胸口——那裡本來沒有魂燈——亮了起來。'],
      ['', '不是一盞。是好多盞。九份、平溪、艋舺、竹塹、鹿港、府城、山、海……一路上收下的心燈，一盞一盞，從裡面亮起來。'],
      ['xinghe:surprise', '……'],
      ['xinghe:smile', '我看見了。'],
    ]);
    await tz(S, '他看見了！他看見了！');
    await S.say('最老的萬象童子', '燈芯呀，燈芯。這一次，別自己一個人燒喔。', { color: '#fff4dc' });
    await tz(S, '下次見！下次就是剛剛！嘻嘻嘻——');
    await S.say('', '曼陀羅向內一摺。全白。');
    await S.warp('lamp_heart', 12, 18, 'up', { color: '#ffffff', fade: 0.9 });
  };
  // jewel geometry on the void, the light path, the children (萬象童子 = jewel_child art)
  H.breathGround = (ctx, t, ms) => {
    const k = fxK();
    const x0 = Math.max(0, Math.floor(ms.cam.x / T) - 1), y0 = Math.max(0, Math.floor(ms.cam.y / T) - 1);
    const x1 = Math.min(ms.w - 1, x0 + 22), y1 = Math.min(ms.h - 1, y0 + 13);
    ctx.save();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (ms.terrain[y * ms.w + x] !== 'void') continue;
      const h = U.hash(x, y, 5), px = x * T + T / 2, py = y * T + T / 2;
      const hue = (h * 360 + t * 25 * k) % 360, br = 0.5 + 0.5 * Math.sin(t * 1.2 + h * 9);
      ctx.fillStyle = `hsla(${hue},70%,${18 + 14 * br * k}%,1)`;
      ctx.beginPath();
      const r = 30, rot = h * 6 + t * 0.2 * k;
      for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; if (i) ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); else ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `hsla(${(hue + 120) % 360},90%,70%,${0.25 + 0.2 * br})`; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // the seat
    const sx = (MO.x + SEAT[0]) * T + T / 2, sy = (MO.y + SEAT[1]) * T + T / 2;
    ctx.fillStyle = 'rgba(255,246,220,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    // light path
    if (!F('ch11_mandala')) {
      const tr = traceLight();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,250,230,0.85)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo((MO.x + SRC[0]) * T + T / 2, (MO.y + SRC[1]) * T + T / 2);
      for (const [x, y] of tr.cells) ctx.lineTo((MO.x + x) * T + T / 2, (MO.y + y) * T + T / 2);
      ctx.stroke();
      tr.lotus.forEach((i) => { const l = LOTUS[i]; ctx.drawImage(G.FX.glowSprite(l.c), (MO.x + l.x) * T - 40 + T / 2, (MO.y + l.y) * T - 40 + T / 2, 80, 80); });
      if (tr.seat) ctx.drawImage(G.FX.glowSprite('#fff6e0'), sx - 50, sy - 50, 100, 100);
    }
    ctx.restore();
    // footstep blooms
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of ms._bloom || []) { ctx.globalAlpha = 1 - b.t / 1.2; ctx.fillStyle = `hsl(${b.h},100%,70%)`; const r = 4 + b.t * 14; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + b.t; ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.5, 2.2, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  };
  H.breathOver = (ctx, t, ms) => {
    // 萬象童子 drawn with their jewel_child art on top of the (invisible) NPC actors
    for (const n of ms.npcs) {
      if (!/^tz/.test(n.id)) continue;
      ctx.save(); ctx.translate(n.px, n.py - 4 + Math.sin(t * 2 + n.x) * 4);
      const sc = n.big ? 0.75 : 0.48; ctx.scale(sc, sc);
      try { G.Monsters.draw(ctx, 'jewel_child', 0, 0, t + n.x, { state: 'idle', variant: (n.x + n.y) % 3 }); } catch (e) { G.warnOnce && G.warnOnce('jewel_child', e); }
      ctx.restore();
    }
    // mirror orientation marks
    const m = mirrors();
    MIRRORS.forEach(([x, y], i) => {
      const px = (MO.x + x) * T + T / 2, py = (MO.y + y) * T + T / 2 - 30;
      ctx.save(); ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.shadowColor = '#a0e8ff'; ctx.shadowBlur = 12;
      ctx.beginPath();
      if (m[i] === '/') { ctx.moveTo(px - 18, py + 18); ctx.lineTo(px + 18, py - 18); } else { ctx.moveTo(px - 18, py - 18); ctx.lineTo(px + 18, py + 18); }
      ctx.stroke(); ctx.restore();
    });
    // the edge of the screen folds inward every 4 s (off in low-intensity mode); scaled by visualFx
    if (!lowFx()) {
      const k = fxK(), ph = (t % 4) / 4, fold = Math.sin(Math.min(1, ph * 2.5) * Math.PI) * 0.5 * k;
      if (fold > 0.01) {
        ctx.save(); ctx.setTransform(G.S, 0, 0, G.S, 0, 0); ctx.globalCompositeOperation = 'lighter';
        const n = 8;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + t * 0.1 * k;
          const g = ctx.createRadialGradient(G.W / 2, G.H / 2, G.H * (0.9 - fold * 0.3), G.W / 2, G.H / 2, G.W * 0.75);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `hsla(${(i * 45 + t * 40) % 360},90%,60%,${0.06 * fold})`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(G.W / 2, G.H / 2); ctx.arc(G.W / 2, G.H / 2, G.W, a, a + Math.PI / n); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  // ---------------------------------------------------------------- 燈心 visuals
  H.heartGround = (ctx, t, ms) => {
    // glass floor: the black tide churning beneath, lights drifting in the deep
    ctx.save();
    ctx.beginPath(); ctx.ellipse(12 * T, 10.5 * T, 11 * T, 9.2 * T, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(4,8,22,0.62)'; ctx.fillRect(0, 0, ms.w * T, ms.h * T);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const x = (U.hash(i, 1, 2) * 24 * T + t * (8 + U.hash(i, 3, 2) * 14)) % (24 * T), y = U.hash(i, 2, 2) * 20 * T + Math.sin(t + i) * 8;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 1.5 + i); ctx.drawImage(G.FX.glowSprite('#8fd0ff'), x - 8, y - 8, 16, 16);
    }
    ctx.restore();
    // six black chains from the flame down through the floor
    if (!F('ch11_done')) {
      ctx.save(); ctx.strokeStyle = 'rgba(8,6,14,0.9)'; ctx.lineWidth = 7; ctx.setLineDash([10, 6]);
      const cx = 12 * T, cy = 7 * T;
      for (let i = 0; i < 6; i++) { const a = Math.PI * (0.15 + i * 0.14); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 9 * T * (i % 2 ? 1 : -1), cy + Math.sin(a) * 6 * T); ctx.stroke(); }
      ctx.restore();
    }
  };
  H.heartOver = (ctx, t, ms) => {
    const k = V().ch11_flame == null ? 1 : V().ch11_flame;
    const cx = 12 * T, cy = 8.6 * T;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const sz = 90 + 150 * Math.min(1.6, k);
    for (let i = 0; i < 4; i++) {
      const w = sz * (1 - i * 0.18), fl = Math.sin(t * (5 + i) + i) * 6;
      ctx.globalAlpha = 0.55 - i * 0.08;
      ctx.drawImage(G.FX.glowSprite(k < 0.15 ? '#ff7a4a' : i === 3 ? '#ffffff' : '#fff0c8'), cx - w / 2 + fl, cy - w * 1.1 - i * 20, w, w * 1.3);
    }
    ctx.restore();
    // 白芷 floating inside the flame, eyes closed
    if (!F('ch11_reunion')) {
      try { G.Sprites.drawChar(ctx, 'baizhi', 'down', 0, cx, cy - 26 + Math.sin(t * 1.4) * 6, { alpha: 0.85, shadow: false }); } catch (e) { G.warnOnce && G.warnOnce('baizhi', e); }
    }
    // a thin grey line of dawn in the upper right (frozen until the end)
    ctx.save(); ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
    const g = ctx.createLinearGradient(G.W, 0, G.W - 420, 220);
    g.addColorStop(0, F('ch11_done') ? 'rgba(255,220,180,0.35)' : 'rgba(220,220,230,0.18)'); g.addColorStop(1, 'rgba(220,220,230,0)');
    ctx.fillStyle = g; ctx.fillRect(G.W - 420, 0, 420, 220);
    ctx.restore();
  };

  // ---------------------------------------------------------------- 11-27 燈心 ★★★
  H.c11_27 = async (S) => {
    S.bgm(null);
    await S.walkTo('player', 12, 14);
    S.face('player', 'up');
    await L(S, [
      ['', '一間巨大的燈室。腳下是透明的地板，地板下，黑水溝翻湧著，無數燈火在深處漂。'],
      ['', '燈室中央，一團巨大的白色火焰。火焰裡，懸浮著一個少女。黑色的長髮像水一樣散開，藍衫被火光映成了金色，雙眼緊閉。——白芷。'],
      ['', '六條黑色的鎖鏈從火焰裡垂下，穿過地板，沒入海中。'],
      ['', '火焰前，一個人跪坐著，身旁放著一只罐子。他緩緩回過頭。——夜玄。'],
    ]);
    S.face('yexuan', 'player');
    await L(S, [
      ['yexuan:surprise', '……一息界。你們居然穿過來了。'],
      ['yexuan:smile', '阿渡教得好。……不，是你們自己走得好。'],
      ['xinghe:angry', '夜玄！放了她！'],
      ['yexuan:normal', '我沒有綁著她，星河小友。是她自己走進燈裡的。'],
      ['yexuan:sad', '燈要她。燈一直都要她。'],
      ['yexuan:normal', '去吧。叫她。讓她自己告訴你。'],
    ]);
    await S.move('player', 'LUUUU', { speed: 5 });
    S.face('player', 'up');
    await L(S, [['', '星河奔向火焰。火焰灼人，他的袖子冒起了煙。他毫不在意。'], ['xinghe:serious', '白芷！白芷，是我！'], ['', '火焰前，麻糬靜靜地坐了下來，抬頭看著火裡的人。'], ['', '白芷緩緩睜開眼。那雙眼睛裡映著金色的火光，平靜得像深海。']]);
    await L(S, [
      ['baizhi:normal', '……'],
      ['baizhi:think', '……你是……誰？'],
      ['', '靜默。'],
      ['xinghe:surprise', '……'],
      ['hongying:hurt', '白芷……？'],
      ['baizhi:normal', '你們身上，有很溫暖的光。是要過岸的魂嗎？'],
      ['baizhi:smile', '別怕。燈會帶你們過去。'],
      ['baizhi:smile', '過去以後，就不痛了。'],
      ['yexuan:sad', '你看。這就是燈的慈悲。'],
      ['', '星河低下頭。肩膀在抖。然後，他從懷裡拿出一疊摺成小燈籠的紙。'],
    ]);
    S.bgm('love');
    await L(S, [
      ['xinghe:serious', '……「我叫白芷。這是我的名字。」'],
      ['baizhi:surprise', '……？'],
      ['xinghe:serious', '「星河說，名字是別人叫你的時候，你會回頭的那個聲音。」'],
      ['xinghe:cry', '……白芷。'],
      ['', '白芷的指尖，微微動了一下。'],
      ['xinghe:serious', '「九份的芋圓是甜的。熱的時候最甜。」'],
      ['hongying:cry', '「紅纓煮的東西，不可以吃。可是她問的時候，要說好吃。」'],
      ['hongying:cry', '……「這叫做朋友。」妳自己寫的，笨蛋。'],
      ['yungui:smile', '「蘑菇是大地的耳朵。」……這句是貧道說的。版權費還沒付。'],
      ['', '芋圓走到火焰前，翻過身，露出肚子。——「芋圓的肚子，是世界上最軟的地方。」她寫過的。'],
    ]);
    if (F('ch11_mem_all')) {
      S.sfx('lantern'); S.flash('#ffd890', 0.8, 0.4);
      await L(S, [
        ['', '星河腰間的小袋子裡，六盞記憶燈飛了出來——芋圓、天燈、紫色的粥、芋圓的肚子、土地公廟、九份下雨的石階——一盞一盞，飛進火焰，飛進她的胸口。'],
        ['baizhi:surprise', '……燙燙的、軟軟的、甜甜的……'],
        ['baizhi:surprise', '……他的手……很燙……'],
      ]);
    }
    await L(S, [
      ['baizhi:hurt', '……我……'],
      ['xinghe:cry', '妳在牆上寫：「如果我忘了，請告訴我——」'],
      ['xinghe:cry', '「我曾經很快樂。」'],
      ['xinghe:cry', '白芷。妳曾經很快樂。'],
      ['xinghe:cry', '跟我們在一起的時候，妳很快樂。'],
      ['', '白芷映著火光的眼睛裡，第一次，泛起了水光。'],
      ['baizhi:cry', '……星……河……'],
      ['baizhi:cry', '星河。'],
      ['baizhi:cry', '……你唱歌，很難聽。'],
      ['xinghe:laugh', '……對。很難聽。'],
      ['', '白芷從火焰中伸出手。星河握住。火焰燒著他的手臂，他沒有放開。'],
    ]);
    S.flag('ch11_reunion');
    S.spawn({ id: 'bz_s', sprite: 'baizhi', x: 11, y: 8, dir: 'down' });
    S.flash('#ffffff', 0.6, 0.6);
    await L(S, [
      ['', '她跌出火焰，落進他懷裡。光從她的輪廓散去，又回來，像在呼吸。'],
      ['baizhi:cry', '我寫了「別再來」……可是，我把它劃掉了。'],
      ['xinghe:smile', '我看到了。所以我來了。'],
      ['baizhi:smile', '……嗯。你來了。'],
      ['', '星河把玉笛放到她手裡。'],
      ['xinghe:smile', '妳忘了帶這個。'],
      ['baizhi:laugh', '我還忘了很多東西。……可是不要緊。'],
      ['baizhi:smile', '你們會告訴我。'],
      ['', '紅纓衝上來，一把抱住白芷。芋圓跳到白芷頭上。雲歸在旁邊咳了一聲，然後也伸出手，拍了拍她的頭。'],
      ['hongying:cry', '笨蛋……笨蛋笨蛋笨蛋……'],
      ['baizhi:laugh', '紅纓，妳變成只會說一個詞的鳥了。'],
      ['', '只有麻糬沒有動。她坐在原地，從大家進來以後，就一直坐在火焰前面，像那年在八斗子，守著一盞水燈。'],
      ['baizhi:surprise', '……麻糬。'],
      ['', '麻糬站起來，慢慢走過去，把額頭抵在白芷的手心裡。很久、很久。沒有叫，也沒有呼嚕。'],
      ['', '她只是閉上眼睛，像在確認這隻手是暖的。'],
      ['baizhi:cry', '……妳一直在等我，對不對。'],
      ['baizhi:cry', '在海邊。在船上。在這裡。'],
      ['', '麻糬睜開眼睛，輕輕叫了一聲。那是半年來，她第一次出聲。'],
    ]);
    // 白芷歸隊: level = party average + 1, full HP/MP
    S.take('c11_bz_flute', 1);
    const lv = avgLv() + 1;
    if (!G.state.members.baizhi) G.Party.create('baizhi', lv);
    G.Story.ensureLevel('baizhi', lv);
    S.join('baizhi');
    const bm = G.state.members.baizhi;
    if (F('ch11_mem_all')) { bm.gauge = 100; if (G.Inv.has('c11_ac_memory_lamp')) G.Party.equip('baizhi', 'acc', 'c11_ac_memory_lamp'); }
    S.flash('#fff6e0', 0.5, 0.4);
    await S.say('', '火焰中，落下一支白玉笛——燈母留給她的。');
    await S.give('c11_fl_dengxin', 1);
    G.Party.equip('baizhi', 'weapon', 'c11_fl_dengxin');
    { const st = G.Party.stats('baizhi'); bm.hp = st.mhp; bm.mp = st.mmp; }
    S.remove('bz_s');
    S.gather();
    // 59–80
    S.bgm(null); S.shake(4, 0.8); S.sfx('dark');
    V().ch11_flame = 0.7;
    await S.say('', '背後，火焰劇烈搖晃。鎖鏈發出刺耳的嘎吱聲。夜玄站了起來。');
    await L(S, [
      ['yexuan:sad', '你知道你在做什麼嗎，星河小友。'],
      ['yexuan:serious', '燈靈離開燈，燈就會熄。燈熄了，所有的魂都會迷失。'],
      ['yexuan:serious', '你為了一個人，要讓千千萬萬的魂沉在黑水溝裡嗎？'],
      ['xinghe:angry', '那你呢？'],
      ['xinghe:angry', '你為了一個人，把千千萬萬的魂關在罐子裡！'],
      ['yexuan:hurt', '……'],
      ['yexuan:serious', '對。所以，我比誰都知道那是什麼滋味。'],
      ['yexuan:serious', '天快亮了。門一關，潮就會轉向。'],
      ['yexuan:serious', '誰都不必再忘記。誰都不必再失去。'],
      ['yexuan:sad', '念兒會回來。青鋒的爹娘會回來。清虛道長會回來。'],
      ['yexuan:normal', '你的白芷，也不必再當燈。……這樣，不好嗎？'],
      ['baizhi:serious', '不好。'],
      ['yexuan:surprise', '……'],
      ['baizhi:serious', '我在燈裡，看見了每一盞魂。他們很累。'],
      ['baizhi:sad', '被記住，很好。可是被抓住……很痛。'],
      ['baizhi:serious', '夜玄先生。你罐子裡的那個孩子，每天晚上都在哭。'],
      ['yexuan:angry', '……住口。'],
    ]);
    S.bgm('villain');
    await L(S, [['', '夜玄舉起一支黑玉之槳。罐子在他背後浮起，發出幽幽藍光。'], ['yexuan:serious', '阿渡沒能攔住我。'], ['yexuan:serious', '你們，也不能。']]);
  };

  // ---------------------------------------------------------------- 11-28 頭目戰：夜玄（兩階段）
  function yexuan1Hooks() {
    return {
      hpFloor: { c11_yexuan_1: 0.001 },
      onFloor: async (b) => { b.result = 'win'; b.scriptedEnd = true; },
      intro: async (b) => {
        hookB(b, 'execute', async (orig, u, cmd) => {
          if (cmd.skill !== 'e11_yx_purge') return orig(u, cmd);
          const buffed = b.alive('party').reduce((a, p) => a + Object.keys(p.st).filter((k) => k.endsWith('Up') || k === 'regen' || k === 'shield').length, 0);
          if (buffed < 2) return orig(u, { kind: 'skill', skill: 'e_yx_oar', targets: [U.pick(b.alive('party'))] });
          b.banner('渡厄逆流', '#ff9a8a'); G.Audio.sfx('dark');
          b.say('「這些不屬於你們的光，還給潮吧。」', 1.8);
          for (const p of b.alive('party')) for (const k of Object.keys(p.st)) if (k.endsWith('Up') || k === 'regen' || k === 'shield') delete p.st[k];
          healPct(b, u, 0.05);
          await b.wait(1.0);
        });
      },
      onTurn: async (b) => {
        const yx = foe(b, 'c11_yexuan_1');
        if (!yx) return;
        if (!b._p70 && yx.hp <= yx.mhp * 0.7) {
          b._p70 = true;
          await bLines(b, [['hongying:angry', '青鋒哥，是為了你的「回家」死的！'], ['yexuan:sad', '我知道。所以我更不能停下。'], ['yexuan:sad', '停下，他就白死了。'], ['hongying:serious', '不。停下，他才沒有白死。']]);
          const hy = pal(b, 'hongying'); if (hy && !hy.dead) b.addStatus(hy, 'atkUp', 3);
        }
        if (!b._p40 && yx.hp <= yx.mhp * 0.4) {
          b._p40 = true;
          await bLines(b, [['yexuan:serious', '星河小友。你身上那點火，本來就是燈的。'], ['yexuan:serious', '燈會暗，你也有份。'], ['xinghe:serious', '我知道。'], ['xinghe:serious', '所以我會用一輩子還。不是用你的方法。']]);
        }
      },
    };
  }
  function yexuan2Hooks() {
    const base = () => G.Data.enemies.c11_yexuan_2.skills;
    return {
      rewards: true,
      intro: async (b) => {
        hookB(b, 'performSkill', async (orig, u, s, targets, id) => {
          const r = await orig(u, s, targets, id);
          if (id === 'bz_duhun') {
            const yx = foe(b, 'c11_yexuan_2');
            if (yx) {
              const v = V(); v.ch11_yx_song = (v.ch11_yx_song || 0) + 1;
              if (v.ch11_yx_song === 1) { await bLines(b, [['yexuan:hurt', '……這首歌……念兒她娘……也會唱……']]); yx.st.stun = 1; b.popText(yx, '動搖', '#c8d8ff'); }
              else if (v.ch11_yx_song === 2) { await bLines(b, [['yexuan:hurt', '……不要唱了……求求妳……']]); yx.st.stun = 1; b.popText(yx, '動搖', '#c8d8ff'); }
              else b.say('夜玄摀住了耳朵。', 1.4);
            }
          }
          if (id === 'e11_yx_tide') for (const p of b.alive('party')) if (p.st.regen) { p.st.poison = p.st.regen; delete p.st.regen; }
          return r;
        });
        hookB(b, 'execute', async (orig, u, cmd) => {
          if (cmd.skill === 'e11_yx_raise') { b.banner('黑水溝', '#ff9a8a'); b.say('夜玄將罐子高高舉起……（防禦！）', 2.2); u.raised = true; G.Audio.sfx('dark'); await b.wait(1.0); return; }
          if (cmd.skill === 'e11_yx_crash') { u.raised = false; const tg = b.alive('party').slice().sort((a, c) => c.hp - a.hp)[0]; return orig(u, { kind: 'skill', skill: 'e11_yx_crash', targets: [tg] }); }
          return orig(u, cmd);
        });
      },
      onTurn: async (b, u) => {
        const yx = foe(b, 'c11_yexuan_2');
        if (!yx) return;
        if (!b._p50 && yx.hp <= yx.mhp * 0.5) {
          b._p50 = true;
          await bLines(b, [['', '遠方，從塔下、從海上，傳來一個沙啞的吼聲。'], ['陳伯（遠方的聲音）', '阿玄——！'], ['陳伯（遠方的聲音）', '引魂人不留魂！這是你教我的第一條規矩！'], ['yexuan:hurt', '……阿渡……']]);
          b.addStatus(yx, 'defDown', 3);
        }
        if (u === yx) {
          yx.kt = (yx.kt || 0) + 1;
          let sk = base();
          if (yx.raised) sk = [{ id: 'e11_yx_crash', w: 1 }];
          else if (yx.kt % 4 === 0) sk = [{ id: 'e11_yx_tide', w: 1 }];
          else if (yx.kt % 5 === 2) sk = [{ id: 'e11_yx_raise', w: 1 }];
          yx.d = Object.assign({}, yx.d, { skills: sk });
        }
      },
    };
  }
  H.c11_28 = async (S) => {
    if (!F('ch11_yexuan_p1')) {
      const r1 = await S.battle('t11_yexuan_1', yexuan1Hooks());
      if (r1 !== 'win') return;
      S.shake(4, 1.0); S.sfx('dark');
      await L(S, [
        ['', '夜玄單膝跪地。黑玉槳插進地板。'],
        ['yexuan:hurt', '……潮啊。'],
        ['', '黑水從地板的裂縫中湧起，纏住夜玄。無數溺死者的臉，在水裡浮浮沉沉。罐子浮到他頭頂。'],
        ['yexuan:serious', '二十年。我每一個晚上，都在這片海裡。'],
        ['yexuan:serious', '今晚，讓你們也看看。'],
      ]);
      S.flag('ch11_yexuan_p1');
      S.sfx('sing');
      await S.say('', '白芷吹起玉笛的一小段。笛聲很輕，像潮退時的沙。');
      for (const m of G.Party.active()) { const st = G.Party.stats(m.id); m.hp = Math.min(st.mhp, Math.max(1, m.hp) + Math.round(st.mhp * 0.3)); m.mp = Math.min(st.mmp, m.mp + Math.round(st.mmp * 0.3)); }
      S.toast('全員氣血、真氣回復三成。', 'lantern');
    }
    const r2 = await S.battle('t11_yexuan_2', yexuan2Hooks());
    if (r2 !== 'win') return;
    S.flag('ch11_yexuan');
  };

  // ---------------------------------------------------------------- 11-29 夜念 / 11-30 無相 / 11-31 最終戰
  H.c11_29 = async (S) => {
    if (!F('ch11_nianer')) await H.nianer(S);
    if (!F('ch11_wuxiang_intro')) await H.wuxiangIntro(S);
    await H.finalBattle(S);
  };
  H.nianer = async (S) => {
    S.bgm(null);
    S.setPos('player', 12, 14, 'up'); S.gather();
    S.face('yexuan', 'down');
    await S.say('', '夜玄跪在地上。黑水退去。他頭頂的罐子落下來，撞在透明的地板上——「叮」，一聲清響。');
    S.sfx('bell');
    await pause(S, 1.2);
    await L(S, [['', '一道裂痕，從罐底，慢慢爬到罐口。'], ['yexuan:surprise', '……不……念兒……！'], ['', '夜玄撲過去，用雙手捂住裂縫。藍光從他的指縫間漏出來。'], ['yexuan:cry', '不要……爹在這裡……爹把罐子補好……爹馬上……']]);
    S.sfx('shatter');
    await pause(S, 1.5);
    const n = S.spawn({ id: 'nianer', sprite: 'nianer', x: 13, y: 12, dir: 'left', ghost: true }); n.alpha = 0;
    await S.fadeActor('nianer', 1, 1.0);
    await S.say('', '藍光聚成一個七歲的小女孩。濕漉漉的雙髻，赤著腳，衣角還在滴水。她看著夜玄。');
    S.face('yexuan', 'nianer');
    const beats = [
      ['nianer:normal', '……爹。'],
      ['yexuan:cry', '念兒……念兒……妳說話了……'],
      ['yexuan:cry', '二十年……妳終於……'],
      ['nianer:sad', '爹，你的頭髮白了。'],
      ['yexuan:cry', '爹沒事。爹一點都沒事。'],
      ['yexuan:cry', '念兒，再等一下。等天一亮，潮就會——'],
      ['nianer:sad', '爹。'],
      ['nianer:sad', '每天晚上，我都在那個水裡。'],
      ['yexuan:hurt', '……'],
      ['nianer:sad', '好冷。好黑。船一直翻，一直翻。'],
      ['nianer:sad', '爹不讓我忘記……所以，我一直都在那天晚上。'],
      ['', '夜玄的手，垂了下來。'],
      ['nianer:cry', '爹，我好累……讓我走吧。'],
    ];
    for (const b of beats) { await S.say(b[0], b[1]); await pause(S, 0.5); }
    await pause(S, 1.4);
    S.bgm('sad', { fade: 3 });
    await L(S, [
      ['', '長長的靜默。只有海浪聲。'],
      ['yexuan:cry', '……'],
      ['yexuan:cry', '爹……爹只是……不想讓妳一個人……'],
      ['nianer:smile', '我不是一個人呀。'],
      ['nianer:smile', '娘在那邊等我。她一直在花田那裡，提著燈。'],
      ['nianer:smile', '我從罐子裡，每天都看得到她的燈。'],
      ['nianer:smile', '中元那天，還有一盞燈漂過窗外，上面寫著我的名字。'],
      ['nianer:smile', '外面，還有別人記得我。'],
      ['', '陳伯不在這裡。可是星河想起了中元夜，陳伯寫下「念兒」兩個字的手。'],
      ['yexuan:cry', '……婉……'],
      ['', '夜玄伸出手，想摸女兒的頭。手穿過了她。他看著自己的手，像第一次看見它。'],
      ['yexuan:cry', '爹……抓錯了……'],
      ['yexuan:cry', '爹抓了二十年……抓住的，是妳最冷的那一夜……'],
      ['', '他伏在地上，像一個孩子一樣，哭了起來。'],
      ['', '白芷走過去，在夜念面前蹲下，用雙手輕輕捧住她的光。'],
      ['baizhi:smile', '念兒。等一下下就好。姊姊幫妳顧著。'],
      ['nianer:smile', '……姊姊，妳就是唱歌的那個姊姊。'],
      ['baizhi:smile', '嗯。'],
      ['nianer:smile', '妳唱歌很好聽。比哥哥好聽。'],
      ['xinghe:shy', '……為什麼連她都知道。'],
    ]);
    S.flag('ch11_nianer');
  };
  H.wuxiangIntro = async (S) => {
    S.bgm(null);
    S.shake(4, 2.0); S.sfx('dark');
    await S.say('', '地板下，海的深處，傳來一陣低沉的、千萬人一起嘆氣的聲音。');
    const gray = { color: '#9aa2b4' };
    await S.say('?', '你不抓了……？', gray);
    await S.say('?', '你不抓，誰來抓？誰來記得我們？', gray);
    await S.say('?', '你不要她了……那你就——來我們這裡吧。', gray);
    await S.say('yungui:surprise', '底下有東西！夜玄，離開那裡！');
    await L(S, [['', '黑水從地板的裂縫中衝出。無數沒有臉的手，抓住了夜玄。'], ['yexuan:hurt', '……這聲音……二十年來，一直在我耳邊……'], ['yexuan:hurt', '原來……不是念兒……是你們……'], ['nianer:surprise', '爹——！'], ['yexuan:cry', '念兒，別過來！跟著……白芷姊姊……！']]);
    S.shake(12, 1.5); S.sfx('earth');
    await S.fadeActor('yexuan', 0, 0.8);
    S.flag('ch11_yx_taken'); S.refresh();
    V().ch11_flame = 0.35;
    await L(S, [
      ['', '黑水把夜玄吞了下去。'],
      ['', '透明的地板下，海面隆起。一個比彼岸燈塔還高的身影，從黑水溝中站了起來——沒有五官，表面浮動著千萬張模糊的臉。它的胸口，困著夜玄。'],
      ['yungui:serious', '……無相。'],
      ['yungui:serious', '黑水溝裡，所有沒人哀悼、沒人渡、沒人記得名字的悲傷……'],
      ['yungui:serious', '它一直在對夜玄說話。夜玄抓著念兒，它就抓著夜玄。'],
      ['無相', '燈……給我……把燈……熄掉……'],
      ['無相', '不要忘記……不要渡……留下來……全部……留下來……'],
      ['', '燈室中央的白色火焰，向下一縮。天邊那一線曙光——停住了。'],
      ['baizhi:serious', '它要吞掉燈。燈一熄，所有的魂，都會變成它。'],
      ['xinghe:serious', '那就不讓它吞。'],
      ['hongying:serious', '夜玄還在裡面。'],
      ['xinghe:serious', '那就連他一起救出來。'],
      ['yungui:smug', '貧道就喜歡你這種不自量力。'],
      ['', '芋圓蹲到星河腳邊，尾巴膨得像一把掃帚。'],
      ['', '夜念躲在白芷身後，抓著她的衣角。'],
      ['baizhi:serious', '麻糬，幫我顧好念兒。'],
      ['', '麻糬走到夜念面前，坐下，把尾巴輕輕圈住那雙赤著的小腳。夜念的手，第一次，不抖了。'],
      ['baizhi:serious', '星河。'],
      ['xinghe:normal', '嗯？'],
      ['baizhi:smile', '這一次，我們一起。'],
    ]);
    S.flag('ch11_wuxiang_intro');
  };
  // ---- 黑潮・無相 phase hooks
  const SONG = [['燈一盞，渡一人，', '黑水茫茫莫回身；'], ['燈兩盞，渡兩人，', '岸上有人喚你名；'], ['燈三盞，渡三人，', '三更潮落月無痕；'], ['一聲舊名輕輕喚，', '燈前燈後是故人。']];
  async function wxFaces(b) {
    const i = (b._face = (b._face || 0) + 1) - 1;
    const v = V();
    b.banner('萬面', '#ff9a8a'); G.Audio.sfx('ghost');
    const which = ['hy', 'yg', 'nian'][i % 3];
    if (which === 'hy') {
      const hy = pal(b, 'hongying');
      v.ch11_face_hy = (v.ch11_face_hy || 0) + 1;
      if (v.ch11_face_hy === 1) { await bLines(b, [['無相（青鋒的聲音）', '紅纓，別打了。是哥啊。'], ['hongying:hurt', '……哥……']]); if (hy && !hy.dead) b.addStatus(hy, 'atkDown', 2); }
      else { await bLines(b, [['無相（青鋒的聲音）', '紅纓，別打了——'], ['hongying:serious', '哥才不會叫我住手。'], ['hongying:angry', '哥會叫我——「護人」！']]); if (hy && !hy.dead) { delete hy.st.atkDown; b.addStatus(hy, 'atkUp', 2); } }
    } else if (which === 'yg') {
      const yg = pal(b, 'yungui');
      v.ch11_face_yg = (v.ch11_face_yg || 0) + 1;
      if (v.ch11_face_yg === 1) { await bLines(b, [['無相（清虛的聲音）', '雲歸。你錯了。']]); if (yg && !yg.dead) b.addStatus(yg, 'magDown', 2); }
      else { await bLines(b, [['無相（清虛的聲音）', '雲歸——'], ['yungui:smug', '師父從來不說「你錯了」。他只說「再試一次」。']]); if (yg && !yg.dead) { delete yg.st.magDown; b.addStatus(yg, 'magUp', 2); } }
    } else {
      await bLines(b, [['無相（夜念的聲音）', '哥哥姊姊，不要丟下我們……']]);
      for (const p of b.alive('party')) b.addStatus(p, 'spdDown', 1);
      await bLines(b, [['baizhi:serious', '我們不會丟下你們。我們會「送」你們。']]);
      const bz = pal(b, 'baizhi'); if (bz && !bz.dead) b.addStatus(bz, 'regen', 3);
    }
    await b.wait(0.6);
  }
  function wuxiang1Hooks() {
    const base = () => G.Data.enemies.c11_wuxiang_1.skills;
    return {
      hpFloor: { c11_wuxiang_1: 0.001 },
      onFloor: async (b) => { b.result = 'win'; b.scriptedEnd = true; },
      intro: async (b) => {
        await bLines(b, [['無相', '我們有好多臉……你們想看誰的？']]);
        hookB(b, 'execute', async (orig, u, cmd) => { if (cmd.skill === 'e11_wx_faces') { await wxFaces(b); return; } return orig(u, cmd); });
      },
      onTurn: async (b, u) => {
        const w = foe(b, 'c11_wuxiang_1');
        if (!w) return;
        if (!b._h50 && w.hp <= w.mhp * 0.5) {
          b._h50 = true;
          await bLines(b, [['', '無相的胸口，夜玄的臉浮了一下。'], ['夜玄（從無相裡面）', '……星河……小友……不要管我……'], ['夜玄（從無相裡面）', '……打碎它……'], ['xinghe:angry', '閉嘴！你女兒在等你！']]);
        }
        if (u === w) { w.kt = (w.kt || 0) + 1; w.d = Object.assign({}, w.d, { skills: w.kt % 3 === 0 ? [{ id: 'e11_wx_faces', w: 1 }] : base() }); }
      },
    };
  }
  function wuxiang2Hooks() {
    return {
      hpFloor: { c11_wuxiang_2: 0.001 },
      onFloor: async (b) => { b.result = 'win'; b.scriptedEnd = true; },
      intro: async (b) => { for (const e of b.enemies) e.phase = 2; },
      onTurn: async (b, u) => {
        const w = foe(b, 'c11_wuxiang_2');
        if (u === b.party[0] && b.rounds % 3 === 0 && b._songR !== b.rounds) {
          b._songR = b.rounds;
          const ln = SONG[Math.min(3, b._song || 0)]; b._song = (b._song || 0) + 1;
          G.Audio.sfx('sing');
          b.say(ln[0], 2.2); await b.wait(1.6); b.say(ln[1], 2.2); await b.wait(1.6);
          for (const p of b.alive('party')) { b.addStatus(p, 'regen', 3, true); delete p.st.seal; }
          b.say('白芷的歌聲，從潮的深處傳來……', 2.0); await b.wait(1.0);
        }
        if (!w) return;
        if (!b._h50 && w.hp <= w.mhp * 0.5) {
          b._h50 = true;
          await bLines(b, [['白芷（從無相裡面）', '星河——你聽得到嗎？'], ['xinghe:serious', '聽得到！'], ['白芷（從無相裡面）', '這裡……好多人。'], ['白芷（從無相裡面）', '他們不是壞東西。他們只是，想要有人叫他們的名字。'], ['yungui:think', '……原來如此。所以它「打不死」。']]);
        }
        if (!b._h25 && w.hp <= w.mhp * 0.25) {
          b._h25 = true;
          await bLines(b, [['白芷（從無相裡面）', '星河……如果我出不去……'], ['xinghe:angry', '妳出得去！'], ['xinghe:serious', '妳寫過的。「再來找我」。'], ['xinghe:serious', '所以我會一直來。一直、一直來。']]);
        }
      },
    };
  }
  function wuxiang3Hooks() {
    return {
      loseOk: true,
      hpFloor: { c11_wuxiang_3: 0.0001 },
      finishers: ['c_qiandeng'],
      onFloor: async (b) => {
        b._floored = true;
        await bLines(b, [['', '無相之心沒有倒下。它只是蜷得更緊了。'], ['yungui:think', '它不是敵人……它需要的不是被打倒。'], ['baizhi:serious', '是被「渡」。']]);
        b.say('使用「千燈」或白芷的「渡魂謠」', 3.0);
      },
      intro: async (b) => {
        for (const e of b.enemies) e.phase = 3;
        hookB(b, 'kill', (orig, u) => {
          if (u.side === 'party' && u.id === 'xinghe') { u.dead = false; u.hp = Math.max(1, Math.round(u.mhp * 0.5)); u.pose = 'idle'; b.say('星河……起來。', 1.6); b.popText(u, '起來', '#fff0c8'); return; }
          if (u.id === 'c11_wuxiang_3') b.scriptedEnd = true;
          return orig(u);
        });
        hookB(b, 'performSkill', async (orig, u, s, targets, id) => {
          if (id === 'c_qiandeng') {
            const n = G.Lanterns.count();
            s = Object.assign({}, s, { power: 3.0 + 0.15 * n });
            b.fx.push(new QiandengFx(200 + 40 * n));
            b.say('一千盞燈從四人手中升起，圍住那個小小的黑影。', 2.4);
          }
          const r = await orig(u, s, targets, id);
          if (id === 'bz_duhun' && b._floored && foe(b, 'c11_wuxiang_3')) { b._finisher = 'duhun'; b.say('白芷吹起玉笛。燈橋上的燈籠，跟著歌聲一盞一盞地亮。', 2.4); await b.wait(1.4); b.result = 'win'; b.scriptedEnd = true; }
          if (id === 'c_qiandeng' && !foe(b, 'c11_wuxiang_3')) { b._finisher = 'qiandeng'; b.result = 'win'; b.scriptedEnd = true; }
          return r;
        });
      },
      onTurn: async (b, u) => {
        if (u === b.party[0] && b._sr !== b.rounds) {
          b._sr = b.rounds;
          const r = b.rounds;
          if (r === 1) { b.say('星河……', 2.0); u.hp = u.mhp; b.addStatus(u, 'regen', 4); await b.wait(1.0); }
          if (r === 2) { await bLines(b, [['', '黑暗被一槍刺穿。'], ['hongying:angry', '笨蛋！一個人逞什麼強！']]); const p = b.addPartyMember('hongying'); if (p) p.hp = Math.max(1, Math.round(p.mhp * 0.5)); }
          if (r === 3) {
            await bLines(b, [['', '黑水裡傳來撕咬聲。芋圓咬著雲歸的袖子，一步一步，把他從黑水裡拖了出來。'], ['hongying:surprise', '芋圓！'], ['yungui:hurt', '……貧道，被一隻貓救了。這輩子不會說出去。']]);
            const p = b.addPartyMember('yungui'); if (p) p.hp = Math.max(1, Math.round(p.mhp * 0.5));
          }
          if (r === 4) {
            G.Music.play('love', { fade: 2 });
            await bLines(b, [['', '燈橋兩邊的燈籠，一盞一盞亮起來。黑色的海面下，有一點白光在往上升。'], ['白芷的聲音', '星河——'], ['', '白光衝破海面。白芷站在燈橋上，衣角還在滴著黑水，手裡握著玉笛。'], ['baizhi:smile', '我回來了。'], ['xinghe:smile', '……歡迎回來。']]);
            const p = b.addPartyMember('baizhi');
            if (p) { p.hp = p.mhp; p.mp = p.mmp; p.gauge = 100; }
            G.state.flags.ch8_qiandeng = true; G.state.flags.qiandeng = true;
            b.say('心燈在胸口發燙——四人合擊「千燈」可以使用了！', 3.0); await b.wait(1.2);
          }
        }
        // test autoplay cannot choose combos: let 白芷 sing once the heart is held at 1 HP
        if (autoplay() && b._floored && u.id === 'baizhi' && !b.result) {
          const h = foe(b, 'c11_wuxiang_3');
          if (h) await b.execute(u, { kind: 'skill', skill: 'bz_duhun', targets: [h] });
        }
      },
    };
  }
  H.finalBattle = async (S) => {
    // phase 1 無相・萬面
    if (!F('ch11_wuxiang_1')) {
      S.bgm('final_boss');
      const r = await S.battle('t11_wuxiang_1', wuxiang1Hooks());
      if (r !== 'win') return;
      S.shake(6, 1.0);
      await L(S, [['', '無相的身體裂開——然後，張開了一張巨大的嘴。'], ['無相', '燈靈……燈靈是燈的心……吃掉心……燈就熄……'], ['', '黑水捲住白芷。'], ['baizhi:surprise', '——！'], ['xinghe:surprise', '白芷——！']]);
      S.sfx('dark'); S.flash('#000000', 0.8, 0.8);
      V().ch11_flame = 0.12;
      S.leave('baizhi');
      await S.say('', '白芷被吞了下去。燈室的白焰，暗到只剩一點紅。');
      S.flag('ch11_wuxiang_1');
    }
    // phase 2 無相・深淵 (trio)
    if (!F('ch11_wuxiang_2')) {
      const r = await S.battle('t11_wuxiang_2', wuxiang2Hooks());
      if (r !== 'win') return;
      S.shake(10, 1.2); S.sfx('earth');
      await L(S, [['', '無相整個塌了下來，像一座崩落的浪。黑水捲起，吞沒了紅纓、雲歸。'], ['hongying:surprise', '星——']]);
      S.leave('hongying'); S.leave('yungui');
      await S.fadeOut(1.0);
      S.bgm('dream');
      await S.narrate(['黑暗。', '……燈。腳下是木板。兩邊是燈籠。底下是一片黑色的海。'], { veil: 1 });
      await S.fadeIn(0.8);
      await L(S, [['xinghe:surprise', '……這裡是……'], ['xinghe:surprise', '……我的夢。'], ['', '燈橋的盡頭，坐著一個小小的、蜷著身子的影子——由黑水構成，沒有臉，像一個在哭的孩子。'], ['無相之心', '……冷……'], ['無相之心', '沒有人……叫我們的名字……']]);
      S.flag('ch11_wuxiang_2');
    }
    // phase 3 無相之心 — 星河 alone on the lantern bridge; the others break back in one per turn
    for (const id of ['hongying', 'yungui', 'baizhi']) S.leave(id);
    const r3 = await S.battle('t11_wuxiang_3', wuxiang3Hooks());
    for (const id of ['hongying', 'yungui', 'baizhi']) { if (G.state.members[id] && !inParty(id)) { G.Party.join(id); } }
    S.refresh();
    if (r3 !== 'win') return; // loseOk: cannot actually lose (星河 keeps getting up), kept for safety
    // 60000 exp for the three phases, settled before the ending so the last level-up means something
    G.Party.gainExp(60000);
    G.Party.healAll();
    S.flag('qiandeng'); S.flag('ch8_qiandeng');
    S.flag('ch11_wuxiang'); S.flag('ch11_done');
    S.quest('q_ch11_main', 'done');
    await H.endingCommon(S);
  };

  // =================================================================================================
  // ENDINGS (docs/story/endings.md)
  // =================================================================================================
  function addObj(o) { const m = G.mapScene; if (!m) return; const inst = Object.assign({ key: o.t + '@' + o.x + ',' + o.y + ':e' }, o); m.objects.push(inst); m.computeSolid(); return inst; }
  async function card(S, lines) { await S.fadeOut(0.8); await S.narrate(lines, { veil: 1, size: 34 }); }
  function seenEnding(kind) {
    try { const s = G.settings.seenEndings || []; if (!s.includes(kind)) s.push(kind); G.settings.seenEndings = s; G.saveSettings(); } catch (e) { /* ignore */ }
  }

  // ---- E-00 渡（共通）
  H.endingCommon = async (S) => {
    S.bgm('love');
    S.setPos('player', 12, 14, 'up'); S.gather();
    S.flash('#fff6e0', 1.0, 0.6);
    await L(S, [
      ['', '光包住無相之心。黑水一層一層，從它身上剝落。'],
      ['', '剝落的黑水裡，浮出一張臉。然後又一張。又一張——千千萬萬張臉：漁夫、婦人、孩子、唐山來的少年、戴紅巾的海盜、穿著舊軍服的士兵……'],
      ['', '每一張臉都清清楚楚，每一張臉都化成一盞小小的、溫暖的燈。'],
      ['baizhi:serious', '……陳水生。'],
      ['baizhi:serious', '黃阿九。李順德。潘金水。'],
      ['baizhi:smile', '蔡萬得。阿秀。林阿木。黃氏。劉某……'],
      ['', '她一個一個地叫。每叫一個名字，就有一盞燈輕輕地亮一下，像在回答「在」。'],
      ['hongying:surprise', '妳……全部都知道？'],
      ['baizhi:smile', '每一個過岸的人，燈都記得。'],
      ['baizhi:smile', '你們沒有被忘記。'],
      ['baizhi:smile', '只是……該回家了。'],
      ['', '最後，那個小小的黑水孩子——無相之心——也有了臉。是一張很普通的、哭累了的孩子的臉。它看了看四周的燈，看了看白芷。'],
      ['無相之心', '……有人……叫我們了。'],
      ['', '它化成千萬點光，散開。'],
    ]);
    S.sfx('lantern');
    const yx = S.spawn({ id: 'yx_down', sprite: 'yexuan', x: 12, y: 11, dir: 'down' }); yx.alpha = 0.9;
    if (!G.mapScene.actor('nianer')) S.spawn({ id: 'nianer', sprite: 'nianer', x: 14, y: 12, dir: 'left', ghost: true });
    await S.walkTo('nianer', 13, 11);
    S.face('nianer', 'left');
    await L(S, [['', '燈橋淡去，燈心的透明地板回來了。夜玄倒在地上，昏迷不醒。夜念跑過去，用小小的手握住他的手。'], ['', '靜。']]);
    V().ch11_flame = 0.06;
    await L(S, [
      ['', '然後，所有人同時發現了：燈室中央的那團白焰，只剩下一點紅色的餘燼。'],
      ['', '被放出來的千萬盞魂燈，停在半空中，四處張望——沒有光，它們不知道往哪裡去。天邊的曙光，仍然停著。'],
      ['yungui:serious', '……燈，快熄了。'],
      ['yungui:serious', '無相吞了太多光。剩下的，不夠帶他們過去。'],
      ['baizhi:serious', '……要有燈靈，回到燈裡。'],
    ]);
    await S.move('baizhi', 'L');
    await S.say('', '白芷鬆開星河的手，朝那點餘燼走去。星河抓住她的手。');
    await L(S, [
      ['xinghe:serious', '不准。'],
      ['baizhi:sad', '星河，你看他們。'],
      ['', '千萬盞燈，懸在黑暗裡。'],
      ['baizhi:sad', '他們需要光。'],
      ['xinghe:hurt', '那我呢？我也需要——'],
      ['', '他說不下去。'],
    ]);
    const kind = G.Lanterns.count() >= G.Lanterns.THRESHOLD ? 'true' : 'normal';
    if (kind === 'true') await H.endingTrue(S); else await H.endingNormal(S);
  };

  // ---- 2A 真結局「千燈」
  function riseList() {
    const out = RISE.filter((r) => r.always || hasAny(r.ids)).map((r) => {
      const v = r.voice || (r.voiceIf && G.Lanterns.has(r.voiceIf[0]) ? r.voiceIf[1] : null);
      return { place: r.place, text: r.text, voice: v };
    });
    const places = Object.keys(G.World.PLACES);
    for (const e of extraLanterns()) {
      const place = e.c && e.c.region && G.World.PLACES[e.c.region] ? e.c.region : places[Math.floor(U.hash(e.id.length, e.name.length, 3) * (places.length - 1))];
      out.push({ place, text: e.c && e.c.rise ? e.c.rise : `島上的某個地方，又有一盞燈升了起來——「${e.name}」。` });
    }
    return out;
  }
  H.endingTrue = async (S) => {
    await L(S, [
      ['xinghe:serious', '白芷。'],
      ['baizhi:sad', '……放手，星河。'],
      ['xinghe:serious', '妳在信上寫過。'],
      ['xinghe:serious', '「燈是不會怕的。可是我還會怕，所以我還是我。」'],
      ['xinghe:serious', '妳現在怕不怕？'],
      ['baizhi:cry', '……怕。'],
      ['xinghe:smile', '那妳還是妳。'],
      ['xinghe:smile', '我不會讓妳一個人去當燈。'],
      ['baizhi:cry', '可是燈只有一盞，燈靈只有一個——'],
      ['xinghe:serious', '誰說的？'],
    ]);
    if (G.Lanterns.has('xd_lighthouse_home')) await L(S, [['xinghe:serious', '鵝鑾鼻的湯先生要我告訴妳——'], ['xinghe:serious', '「不用燒掉自己。分出去就好。」']]);
    await L(S, [
      ['', '星河握著她的手，貼在自己的胸口。'],
      ['xinghe:serious', '妳聽。'],
      ['', '靜。然後——他的胸口裡，傳出很多、很多微弱的聲音：滴答、滴答。狗叫。歌仔戲的鑼。山歌。月琴。浪打在拼板舟上的聲音。'],
      ['', '白芷睜大了眼睛。'],
      ['xinghe:smile', '妳不是一個人在發光。'],
    ]);
    S.bgm('ending', { fade: 2 });
    S.flag('ending_true');
    await L(S, [['', '星河胸口的心燈，一盞接一盞飛出來，飛向那點餘燼。'], ['', '然後——東方。海的那一頭。福爾摩沙的方向。']]);
    await S.fadeOut(0.8);
    await waitScene(new IslandScene({ list: riseList() }));
    await S.fadeIn(0.8);
    V().ch11_flame = 1.6;
    S.flash('#fff6e0', 1.2, 0.9); S.sfx('lantern');
    await L(S, [
      ['', '島上升起的光，越來越多。九份、平溪、艋舺、竹塹、鹿港、府城、山、海——成百、成千。它們飛過黑水溝。'],
      ['', '海面炸開一道巨浪。鯤從海裡躍起——躍得比燈塔還高。'],
      ['yungui:surprise', '北冥有魚，其名為鯤……'],
      ['yungui:smile', '……化而為鳥，其名為鵬。'],
      ['', '鯤在空中張開了巨大的鰭——那鰭變成了翅膀。一隻遮天蔽日的大鳥，背上載滿了全島的燈，振翅一揮，把千盞燈送進了彼岸燈。'],
      ['', '餘燼「轟」地燃起。'],
      ['', '光。白、金、橘、紅，一千種顏色的光。彼岸燈重新燃起來，比任何一次都亮。'],
      ['', '懸在半空的千萬盞魂燈，像終於聽見有人喊開飯的孩子，一齊往光的方向飄去。'],
      ['', '天邊停住的曙光，動了。'],
      ['yungui:cry', '……好亮……比九份的中元還亮……'],
      ['hongying:cry', '笨蛋……全部都是笨蛋……'],
      ['', '星河與白芷站在光裡。白芷看著自己的手——光從她身上褪去了，可是燈沒有熄。'],
      ['baizhi:surprise', '燈……沒有我，也亮著。'],
      ['xinghe:smile', '因為燈是看見光的那個人。'],
      ['xinghe:smile', '現在，看見它的人，有一千個。'],
    ]);
    // E-T2 燈母
    S.flash('#fff2d0', 1.0, 0.6);
    await L(S, [
      ['', '火焰之中，一個巨大而溫柔的身影緩緩浮現——由一千盞燈組成的女神。看不清臉，只覺得那是世界上最暖的地方。'],
      ['lantern_mother:smile', '孩子們。'],
      ['lantern_mother:normal', '一個人點的燈，很脆弱。'],
      ['lantern_mother:smile', '一千個人點的燈，永遠不會熄。'],
      ['lantern_mother:smile', '……你們把它點起來了。'],
      ['', '燈母低下頭，看著白芷。'],
      ['lantern_mother:smile', '我的孩子。這一千年，辛苦妳了。'],
      ['baizhi:cry', '……母親。'],
      ['lantern_mother:normal', '燈，已經不需要一個燈靈了。它有一千個。'],
      ['lantern_mother:smile', '去吧。去當一個會老、會忘記、也會被記得的人。'],
      ['baizhi:surprise', '……我，可以嗎？'],
      ['lantern_mother:smile', '可以。'],
      ['lantern_mother:normal', '不過——再顧一年。'],
      ['lantern_mother:normal', '這一千盞燈，要在燈裡生根。等到下一個中元，鬼門再開的時候。'],
      ['lantern_mother:smile', '然後，跟著水燈回去。就像妳第一次去的時候那樣。'],
      ['baizhi:think', '一年……'],
      ['', '燈母轉向星河。'],
      ['lantern_mother:normal', '你借了她的火。'],
      ['xinghe:serious', '……我知道。我會還。用一輩子還。'],
      ['lantern_mother:smile', '你已經還了。'],
      ['lantern_mother:smile', '還了一千次。'],
      ['lantern_mother:smile', '從今天起，那盞火，是你自己的了。'],
    ]);
    S.sfx('lantern'); S.flash('#ffb060', 0.8, 0.5);
    await L(S, [
      ['', '星河的胸口，亮起一盞小小的、橘色的燈。只屬於他一個人的燈。'],
      ['xinghe:surprise', '……我……有魂燈了？'],
      ['hongying:laugh', '恭喜！是什麼顏色的？'],
      ['xinghe:smile', '……橘色的。像地瓜圓。'],
      ['', '星河懷裡，那盞寫著「沈星河」的燈籠，也還亮著。他把它抱緊了一點。'],
      ['hongying:laugh', '為什麼是地瓜圓！'],
      ['xinghe:smile', '九份的芋圓有兩種顏色啊！'],
      ['', '燈母的身影，像笑了一樣，輕輕晃了一下，散成千萬點光。'],
      ['lantern_mother:smile', '渡人者，人亦渡之。……去吧。'],
      ['', '光從白芷的輪廓褪去。這一次，沒有再回來。她眼裡的金光褪去，又是那雙溫暖的深褐色眼睛。她的手，第一次，有了溫度。'],
      ['baizhi:surprise', '……星河。'],
      ['xinghe:normal', '嗯？'],
      ['baizhi:surprise', '我、我好冷！'],
      ['baizhi:laugh', '原來冷是這種感覺！好討厭！好棒！'],
      ['', '白芷打了一個噴嚏。麻糬也跟著打了一個噴嚏。'],
      ['yungui:smile', '恭喜。妳現在是人了。人會感冒。'],
    ]);
    await H.et3(S);
  };
  // ---- E-T3 渡口・黎明 / E-T4 一年之約
  H.et3 = async (S) => {
    await S.fadeOut(1.0);
    await S.warp('farshore_field', 27, 13, 'right', { fade: 0 });
    S.hideFollowers(true);
    const yx = S.spawn({ id: 'yx_e', sprite: 'yexuan', x: 31, y: 12, dir: 'up' }); yx.alpha = 0.95;
    S.spawn({ id: 'nian_e', sprite: 'nianer', x: 30, y: 12, dir: 'right', ghost: true });
    S.spawn({ id: 'bz_e', sprite: 'baizhi', x: 28, y: 14, dir: 'right', portrait: 'baizhi' });
    S.spawn({ id: 'hy_e', sprite: 'hongying', x: 26, y: 12, dir: 'right' });
    S.spawn({ id: 'yg_e', sprite: 'yungui', x: 26, y: 14, dir: 'right' });
    S.spawn({ id: 'yy_e', sprite: 'yuyuan', x: 27, y: 15, dir: 'right' });
    S.spawn({ id: 'mc_e', sprite: 'mochi', x: 29, y: 14, dir: 'up' });
    await S.fadeIn(1.2);
    await S.say('', '彼岸花原。天邊泛白。露水落在彼岸花上。');
    if (F('ch11_flower_talk')) await L(S, [['', '彼岸花的莖上，冒出了細細的綠葉。花和葉，第一次同時長在一起。'], ['撿花瓣的孩子', '大哥哥！它們見面了！']]);
    await L(S, [['', '花原上的魂，一個一個站起來，朝著燈的方向走去。等人的婦人站在原地——一盞燈從海上飄來，化成一個漁夫。'], ['漁夫', '阿秀！'], ['等人的婦人', '……'], ['等人的婦人', '……我等的，是你。我想起來了。'], ['看名牌的老人', '蔡萬得。……是我。']]);
    if (F('ch11_tangshan_done')) {
      S.spawn({ id: 'amu_e', sprite: 'c11_amu_young', x: 29, y: 10, dir: 'down', ghost: true }); S.spawn({ id: 'tsm_e', sprite: 'c11_ts_mother', x: 30, y: 10, dir: 'down', ghost: true });
      await L(S, [['', '阿木與阿娘牽著手，走上光的路。'], ['少年阿木', '少年仔，多謝！芋圓，阮會食！']]);
      await Promise.all([S.fadeActor('amu_e', 0, 1.0), S.fadeActor('tsm_e', 0, 1.0)]);
    }
    S.spawn({ id: 'cap_e', sprite: 'c11_captain', x: 23, y: 12, dir: 'right', ghost: true });
    S.spawn({ id: 'pir_e1', sprite: 'pirate_ghost', x: 22, y: 13, dir: 'right', ghost: true }); S.spawn({ id: 'pir_e2', sprite: 'c11_pirate_kid', x: 23, y: 14, dir: 'right', ghost: true });
    S.spawn({ id: 'cb_e', sprite: 'chenbo', portrait: 'chenbo', x: 26, y: 10, dir: 'down' });
    await L(S, [['', '烏鬚船主和海盜們，縮手縮腳地站在路邊。'], ['烏鬚船主', '……老子，也能過？'], ['chenbo:normal', '能。燈不挑人。'], ['烏鬚船主', '……小的們！走了！']]);
    await Promise.all(['cap_e', 'pir_e1', 'pir_e2'].map((id) => S.fadeActor(id, 0, 1.0)));
    S.remove('cb_e');
    await L(S, [['', '小渡口。夜玄躺在棧橋上，慢慢睜開眼睛。夜念蹲在他身邊，手托著下巴。'], ['nianer:smile', '爹，你睡好久。'], ['yexuan:surprise', '……念兒。']]);
    S.face('yx_e', 'left');
    const sw = S.spawn({ id: 'sw_e', sprite: 'c11_suwan', x: 32, y: 9, dir: 'down', ghost: true, light: { r: 140, color: '#ffe6b0' } }); sw.alpha = 0;
    await S.fadeActor('sw_e', 1, 1.0);
    await S.move('sw_e', 'D');
    await L(S, [['', '花田深處，一盞白燈籠走了過來。提燈的婦人，眉眼溫柔。'], ['蘇婉', '……你們父女，讓我等得好久。'], ['yexuan:cry', '……婉。'], ['蘇婉', '鬍子也不刮。']]);
    addObj({ t: 'boat_small', x: 34, y: 12 });
    S.spawn({ id: 'cb_boat', sprite: 'chenbo', portrait: 'chenbo', x: 34, y: 12, dir: 'left' });
    await L(S, [
      ['', '陳伯撐著一艘小小的引魂舟，從岸邊划了過來。船頭掛著一盞燈。'],
      ['chenbo:normal', '上船吧，阿玄。'],
      ['yexuan:surprise', '……阿渡。'],
      ['chenbo:serious', '引魂人不留魂。'],
      ['chenbo:serious', '……這一次，我來渡你。'],
      ['yexuan:sad', '我打了你。我關了那麼多魂。我害死了青鋒。'],
      ['yexuan:sad', '我不配上這條船。'],
      ['chenbo:angry', '配不配，不是你說了算。上船。'],
      ['hongying:serious', '……夜玄。'],
      ['yexuan:sad', '紅纓姑娘。'],
      ['hongying:serious', '我不原諒你。'],
      ['hongying:sad', '……可是哥會希望我讓你走。'],
      ['hongying:serious', '所以，走吧。好好地走。'],
      ['yexuan:cry', '……謝謝。'],
      ['yexuan:normal', '星河小友。'],
      ['xinghe:normal', '……'],
      ['yexuan:smile', '你說得對。燈不是用來抓的。'],
      ['yexuan:smile', '是用來……送的。'],
      ['yexuan:sad', '白芷姑娘。……對不起。'],
      ['baizhi:smile', '去吧。念兒在等你牽她。'],
      ['', '夜念一手牽起娘，一手牽起爹。夜玄低頭看著那隻小小的手，不敢用力。'],
      ['nianer:smile', '爹，牽著跟抓著，不一樣喔。'],
      ['yexuan:cry', '……'],
      ['yexuan:smile', '……嗯。爹學會了。'],
      ['', '三人上了船。陳伯撐槳。小舟離開棧橋，划向光。'],
      ['yexuan:smile', '阿渡，你划得還是比我差。'],
      ['chenbo:angry', '閉嘴，坐好。'],
    ]);
    await Promise.all(['yx_e', 'nian_e', 'sw_e', 'cb_boat'].map((id) => S.fadeActor(id, 0, 1.4)));
    await L(S, [['', '小舟越划越遠，融進光裡。光的邊緣，夜玄回過頭，對陳伯說了一句什麼。陳伯沒有回答，只是點了點頭。'], ['', '過了很久，陳伯一個人划了回來。']]);
    S.spawn({ id: 'cb_back', sprite: 'chenbo', portrait: 'chenbo', x: 30, y: 12, dir: 'left' });
    await L(S, [['xinghe:normal', '……陳伯，他最後說了什麼？'], ['chenbo:normal', '他說：「那孩子，你顧得很好。」'], ['xinghe:surprise', '……'], ['xinghe:smile', '陳伯，你在哭？'], ['chenbo:angry', '海水。']]);
    // E-T4 一年之約
    await S.fadeOut(1.0);
    await S.warp('farshore_field', 27, 38, 'down', { fade: 0 });
    S.hideFollowers(true);
    S.spawn({ id: 'bz_e', sprite: 'baizhi', x: 27, y: 39, dir: 'up' });
    S.spawn({ id: 'hy_e', sprite: 'hongying', x: 26, y: 38, dir: 'down' });
    S.spawn({ id: 'yg_e', sprite: 'yungui', x: 28, y: 37, dir: 'down' });
    S.spawn({ id: 'yy_e', sprite: 'yuyuan', x: 26, y: 37, dir: 'down' });
    S.spawn({ id: 'mc_e', sprite: 'mochi', x: 28, y: 39, dir: 'up' });
    await S.fadeIn(1.0);
    await L(S, [
      ['', '王船停在渡口。天邊越來越亮。'],
      ['yungui:serious', '天快亮了。鬼門一關，活人就不能留在這裡。'],
      ['', '白芷站在棧橋上。她不上船。'],
      ['baizhi:smile', '一年。'],
      ['baizhi:smile', '等下一個中元，鬼門開的時候，我就跟著水燈回去。'],
      ['xinghe:serious', '那我去八斗子等妳。每天晚上都去。'],
      ['baizhi:smile', '不用每天……'],
      ['xinghe:serious', '每天。'],
      ['baizhi:laugh', '……那你要記得帶外套。八斗子晚上很冷。'],
      ['baizhi:smile', '我現在知道冷是什麼了。'],
      ['', '紅纓衝上去抱住她。抱得太用力，白芷「咕」了一聲。'],
      ['hongying:cry', '一年後，我煮東西給妳吃。'],
      ['baizhi:smile', '……好。我會說好吃。'],
      ['hongying:angry', '要真的好吃！'],
      ['', '雲歸伸出手，拍了拍白芷的頭。'],
      ['yungui:smile', '一年後，貧道帶你去吃蘑菇。可以吃的那種。'],
      ['', '芋圓把繡球推到白芷腳邊。那是牠最寶貝的東西。'],
      ['baizhi:laugh', '……好。我替你顧著。'],
      ['', '最後，白芷看著星河。'],
      ['baizhi:smile', '星河。上一次，是你來找我。'],
      ['baizhi:smile', '每一次，都是你來找我。'],
      ['baizhi:smile', '下一次——'],
      ['xinghe:surprise', '下一次？'],
      ['baizhi:smile', '……秘密。'],
    ]);
    S.leave('baizhi');
    await L(S, [
      ['', '眾人上船。麻糬走到跳板前，停住了。'],
      ['', '牠回頭看了看船上的星河，又看了看棧橋上的白芷。然後轉過身，慢慢走回棧橋，在白芷腳邊坐下，尾巴繞住她的腳踝。'],
      ['baizhi:surprise', '……麻糬？'],
      ['', '麻糬沒有動。牠等過她一次了。這一次，牠要陪她一起等。'],
      ['baizhi:cry', '……傻貓。'],
      ['xinghe:smile', '那就，麻糬替我顧著妳。'],
    ]);
    S.emote('mc_e', '♥');
    await L(S, [['', '王船離岸。白芷抱著麻糬站在渡口，一直揮手，直到變成光裡的一個小點。'], ['', '太陽，從海的那一頭升了起來。']]);
    for (let i = 0; i < 4; i++) { S.sfx('gong', i * 0.4); S.sfx('bell', i * 0.4 + 0.2); }
    await L(S, [['', '遠方，傳來鐘聲——澎湖天后宮的鐘、北港的鐘、雞籠的鐘、全島的廟一起敲的鐘。鑼聲。鞭炮聲。'], ['', '鬼門，關了。'], ['', '大鵬在王船上方盤旋了一圈，長鳴一聲，往北冥飛去。']]);
    // E-T5 澎湖・送王
    await H.et5(S);
  };
  H.et5 = async (S, short) => {
    await S.fadeOut(1.0);
    V().c11_magong_bgm = 'penghu';
    await S.warp('penghu_magong', 12, 7, 'left', { fade: 0 });
    S.hideFollowers(true);
    S.spawn({ id: 'ajin_e', sprite: 'temple_keeper', x: 14, y: 6, dir: 'left' });
    S.spawn({ id: 'cb_e', sprite: 'chenbo', portrait: 'chenbo', x: 12, y: 8, dir: 'left' });
    S.spawn({ id: 'hy_e', sprite: 'hongying', x: 13, y: 8, dir: 'left' });
    S.spawn({ id: 'yg_e', sprite: 'yungui', x: 13, y: 6, dir: 'left' });
    for (const [i, x] of [[1, 16], [2, 18], [3, 24], [4, 26]]) S.spawn({ id: 'tw' + i, sprite: ['villager_m', 'villager_f', 'fisherman', 'child_f'][i - 1], x, y: 3, dir: 'up' });
    await S.fadeIn(1.0);
    if (!short) {
      await L(S, [
        ['', '王船回到媽宮。海水嘩啦啦地漲回來，漫過泥灘，灌進石滬，擱淺的漁船一艘一艘浮了起來。風從海上吹來——澎湖的風。'],
        ['', '堤岸上擠滿了人。等船的阿母忽然大叫一聲：遠方，一艘小漁船正搖搖晃晃地駛進港。'],
        ['等船的阿母', '轉來矣！阮後生轉來矣！'],
        ['', '眾人下船。踏上碼頭的一瞬間，王船的帆，自己鼓了起來。'],
        ['', '沒有人掌舵。王船緩緩離開碼頭，朝著日出駛去。順風旗在晨光中，一點一點，變成了金色。'],
        ['阿進伯', '……千歲爺，收船矣。'],
      ]);
    } else await L(S, [['', '王船回到澎湖。潮回來了。眾人上岸。'], ['', '沒有人掌舵。王船緩緩離開碼頭，朝著日出駛去。']]);
    V().c11_boat_gone = 1; S.refresh();
    S.flash('#ffe6b0', 0.8, 0.3);
    for (const id of ['player', 'ajin_e', 'cb_e', 'hy_e', 'yg_e']) S.face(id, 'left');
    if (!short) {
      await L(S, [['', '阿進伯合十。鎮民們合十。星河、紅纓、雲歸、陳伯——一起朝著王船深深一拜。芋圓也低下了頭。'], ['xinghe:serious', '多謝千歲爺。'], ['', '王船消失在海平線上，像一盞往外漂的燈。']]);
    }
  };
  // ---- E-T6 一年後 / E-T7 信 / E-T8 中元・八斗子
  H.et6 = async (S) => {
    await card(S, ['一年後　七月']);
    // 鹿港・紅纓
    await S.warp('ending_lukang', 9, 10, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true); S.show('player', false);
    await S.fadeIn(1.0);
    await L(S, [
      ['', '洛家古厝重新漆過了。門上的燈籠寫著「洛」。中庭裡，七八個鄰居的孩子拿著竹竿，排成一排。'],
      ['hongying:serious', '槍，不要握太緊！'],
      ['hongying:serious', '槍是用來護人的。不是用來打架的——阿明！不准打你弟弟！'],
      ['', '祖先神桌上，擺著一把舊劍，和一張裂成兩半又被仔細黏好的鬼面具。'],
      ['', '練完槍，紅纓端出一鍋麵線糊。孩子們一哄而散。'],
    ]);
    for (const k of ['kid1', 'kid2', 'kid3', 'kid4']) S.move(k, U.pick(['LLLL', 'RRRR', 'DDLL', 'DDRR']), { wait: false, speed: 5 });
    await L(S, [['hongying:angry', '……你們給我回來！'], ['', '她嘆了口氣，自己吃了一口。停頓。'], ['hongying:think', '……今年，好像有比較好吃。'], ['', '她把一盒牛舌餅（店裡買的）包好，背上紅纓槍，出門往北走。']]);
    // 觀音山・雲歸與芋圓
    await cg(S, { bg: 'temple', tint: 'rgba(255,190,120,0.35)', tintMode: 'soft-light', caption: '觀音山・太虛觀',
      figures: [{ sprite: 'yungui', x: 760, y: 470, pose: 'idle' }, { sprite: 'yuyuan', x: 560, y: 590, pose: 'idle', pet: true }] }, async () => {
      await L(S, [
        ['', '太虛觀的屋頂。雲歸躺在屋脊上，身邊是一疊寫得密密麻麻的手稿：《臺灣七仙蕈譜》。'],
        ['小道童', '觀主！香客來了！'],
        ['yungui:normal', '……貧道不在。'],
        ['小道童', '觀主，您明明在屋頂上。'],
        ['yungui:smug', '屋頂上的是雲。'],
        ['', '觀前的庭院裡，芋圓攤在曬得暖暖的石階上睡午覺，紅色的蝴蝶結歪到了耳朵邊。比一年前胖了一圈。'],
        ['小道童', '觀主，芋圓又把供桌上的發粿吃掉了。'],
        ['yungui:smile', '……那是供給貓的。'],
        ['', '芋圓翻了個身，露出圓滾滾的肚子，繼續睡。'],
        ['', '傍晚。雲歸在清虛真人的牌位前，倒了一杯米酒。自己的杯子裡，是茶。'],
        ['yungui:smile', '師父。今年的雲，回來得很準時。'],
        ['', '窗外，雲正一朵一朵，回到觀音山上。'],
      ]);
    });
    // 九份・陳伯
    await S.warp('ending_jiufen_shop', 7, 7, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true); S.show('player', false);
    await S.fadeIn(1.0);
    await L(S, [
      ['', '陳記燈籠舖。陳伯在糊一盞巨大的水燈頭——形狀是一艘王船。'],
      ['', '牆上，掛著那支舊槳。槳上綁著一條新的穗子。槳旁邊，掛著那盞寫著「沈星河」的燈籠——星河已經用不著了，陳伯也沒打算拿下來。'],
    ]);
    await cg(S, { bg: 'shore', dark: 0.2, caption: '八斗子・中元', figures: [{ sprite: 'chenbo', x: 640, y: 560, pose: 'idle' }] }, async () => {
      await L(S, [['', '中元的夜裡，八斗子的海邊。陳伯撐著一艘小船，提著燈，划進夜色裡。他又開始划槳了——給迷路的魂引路。'], ['chenbo:smile', '老骨頭，再划幾年。']]);
    });
    // 九份・星河
    await S.warp('ending_jiufen', 10, 9, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true);
    await S.fadeIn(1.0);
    await L(S, [['', '星河在舖子裡糊燈籠。竹骨削了七次。'], ['', '他的胸口，有一點只有鬼看得見的橘色微光。走在九份的夜路上，路邊的老鬼們會朝他點頭。'], ['路邊的老鬼', '少年仔，暗安。'], ['xinghe:smile', '暗安，阿伯。']]);
    await S.walkTo('player', 6, 6, { yFirst: true });
    S.face('player', 'up');
    await L(S, [['agan:smile', '兩碗？'], ['xinghe:surprise', '……一碗就好。'], ['agan:smile', '一碗你的。一碗，等人的。阿姨先替你記帳。'], ['xinghe:smile', '……謝謝阿姨。'], ['', '這一年的七月，每一個晚上，星河都會去八斗子。帶著外套。'], ['', '舖子的櫃台上，堆著一疊沒拆的信。']]);
  };
  const CARDS = [
    { from: '九份・阿炳伯', pic: 'jiufen_night', text: '老夫新編了一段書，叫《彼岸燈》，場場客滿。主角是個懶鬼燈籠學徒——放心，名字改過了，叫沈星湖。' },
    { ids: ['lantern_ahuang', 'xd_ahuang'], from: '九份・小金與阿黃', pic: 'jiufen_day', text: '阿黃生了五隻小狗！一隻叫星河、一隻叫白芷、一隻叫紅纓、一隻叫雲歸、一隻叫芋圓。芋圓最胖。' },
    { ids: ['lantern_pingxi_letter', 'xd_letter'], from: '平溪・老夫婦', pic: 'pingxi', text: '今年元宵，我們替你們放了一盞天燈。寫了什麼？秘密。' },
    { ids: ['lantern_alian'], from: '艋舺・阿蓮', pic: 'city', text: '碗粿少放了鹽，生意反而變好了。阿德說得對。龍山寺的香，每天替你們點一枝。' },
    { ids: ['lantern_yizigu'], from: '艋舺・戲班', pic: 'city', text: '新戲《燈籠緣》中秋首演。花旦說，結局一定要團圓，不團圓她不唱。' },
    { ids: ['lantern_yimin'], from: '竹塹・滿妹婆', pic: 'hakka', text: '九降風又欲吹了，米粉曬得頂好，寄一包分你們。紅纓那妹仔的山歌，還是恁難聽喔。' },
    { ids: ['lantern_halfwell'], from: '鹿港・半邊井', pic: 'mansion', text: '洛家的門，每天都開著。紅纓姑娘煮的東西，我們還是不太敢吃。' },
    { from: '府城・做十六歲的女孩', pic: 'tainan', text: '我今年十七歲了！七娘媽亭我留著，等白芷姊姊回來，給她「補做」十六歲。' },
    { ids: ['ch7_heartlamp_tsou'], from: '阿里山・Voyu', pic: 'alishan', text: '山上的霧很好。我媽說：記得，跟等，是不一樣的。下次來，記得先跟長老打招呼。' },
    { from: '玉山・布農族的一家', pic: 'yushan', text: '小米收成了。孩子長高了一個頭。山，還是那座不會淹的山。' },
    { from: '日月潭・邵族的長老', pic: 'sunmoon', text: '白鹿的故事，我又跟孩子們講了一遍。他們問，那幾個人後來呢？我說，回家了。' },
    { ids: ['ch8_heartlamp_pilgrims'], from: '北港・進香的阿姨', pic: 'procession', text: '今年遶境，阮閣鑽轎腳，替恁祈平安。阮跋著三个聖桮喔！' },
    { ids: ['xd_yueqin_names'], from: '恆春・月琴伯', pic: 'hengchun', text: '歌裡又多了幾個名字——這次是好名字。是新出世的孫仔的名字。' },
    { ids: ['xd_lighthouse_home'], from: '鵝鑾鼻・阿目', pic: 'cape', text: '燈罩我每天都擦。湯先生說，燈要留下來。我就留下來。' },
    { ids: ['xd_tao_tatala'], from: '蘭嶼・達悟族的少年', pic: 'orchid', text: '我和爸爸一起造了新的船。船的眼睛是我刻的。今年飛魚很多。' },
    { ids: ['xd_amis_haiji'], from: '台東・阿美族的長老', pic: 'eastcoast', text: '年輕人都回來了。海很好。' },
    { from: '花蓮・太魯閣族的長老', pic: 'taroko', text: '好好地活。路，是用活出來的。' },
    { from: '頭城・阿坤', pic: 'toucheng', text: '明年再來，跟我搶頭旗！……去年那面順風旗，記得還喔。（雲歸的旁白：「……被千歲爺收走了，怎麼還。」）' },
    { ids: ['lantern_mifen_mother'], from: '竹塹・阿順伯', pic: 'hakka', text: '阿玉嫁了。喜宴的炒米粉，長長的。阮阿母若有看著，一定足歡喜。' },
    { ids: ['lantern_yanshui'], from: '鹽水・阿義', pic: 'tainan', text: '今年元宵我又扛帝君的轎了！肩膀比去年寬。阿母一定有看到。' },
    { from: '澎湖・阿進伯', pic: 'penghu', text: '港內平安。媽祖婆的香，攏有替恁點。' },
  ];
  H.et7 = async (S) => {
    await S.fadeOut(0.6);
    await S.warp('ending_jiufen_shop', 7, 7, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true); S.show('player', false);
    await S.fadeIn(0.8);
    await S.say('chenbo:angry', '臭小子，信都堆成山了，你看都不看。');
    const cards = CARDS.filter((c) => !c.ids || hasAny(c.ids)).map((c) => ({ from: c.from, pic: c.pic, text: c.text }));
    if (G.Lanterns.has('lantern_penghu_weir')) cards.push({ from: '澎湖・阿添伯（許秀才代筆）', pic: 'penghu', text: '滬仔修好矣，毋過留一个縫。七月初一透早，滬仔的缺口，抾著一个穿藍衫的姑娘，手裡抱一隻三色貓。伊講，伊欲去鹿港揣朋友。' });
    else cards.push({ from: '澎湖・許秀才', pic: 'penghu', text: '七月初一，有一位穿藍衫的姑娘抱著一隻三色貓來代書攤，問去鹿港的船。她付錢的時候說：「活人的錢，好暖。」' });
    await waitScene(new CardsScene(cards));
  };
  H.et8 = async (S) => {
    await card(S, ['七月十五　中元']);
    V().c11_badouzi = 'true';
    await S.warp('ending_badouzi', 11, 9, 'down', { fade: 0, noAutosave: true });
    S.hideFollowers(true);
    S.spawn({ id: 'hy_e', sprite: 'hongying', x: 16, y: 3, dir: 'down' }); S.spawn({ id: 'yg_e', sprite: 'yungui', x: 17, y: 3, dir: 'down' });
    S.spawn({ id: 'yy_e', sprite: 'yuyuan', x: 16, y: 4, dir: 'down' }); S.spawn({ id: 'cb_e', sprite: 'chenbo', x: 18, y: 2, dir: 'left' });
    if (F('ch11_tassel')) addObj({ t: 'water_lantern', x: 12, y: 9, text: '槳' }); else addObj({ t: 'water_lantern', x: 12, y: 9 });
    await S.fadeIn(1.2);
    await L(S, [
      ['', '八斗子的海邊。放水燈頭的隊伍剛走過，海面上漂滿了水燈——一盞一盞，往外漂。這一次，全都往外漂。'],
      ['', '星河坐在礁石上，穿著外套。身邊放著一盞他自己做的小水燈。'],
    ]);
    if (F('ch11_tassel')) await S.say('', '燈上，綁著那條舊槳穗。');
    await L(S, [
      ['xinghe:normal', '……一年了喔。'],
      ['xinghe:normal', '妳說，會跟著水燈回來。'],
      ['xinghe:think', '可是水燈，全都是往外漂的耶。'],
      ['xinghe:smile', '……笨蛋。'],
      ['', '他身後的坡上，紅纓、雲歸、陳伯，遠遠地站著。紅纓緊張得一直揉芋圓的肚子。'],
      ['', '芋圓面無表情地忍耐著。'],
      ['yungui:smile', '（小聲）噓。'],
      ['', '陳伯咳了一聲，轉身看著別處。'],
    ]);
    await S.narrate(['今天傍晚，陳伯對星河說了一句奇怪的話：', '「今暗，你早點去海邊。」'], { veil: 0.6 });
    S.sfx('step');
    await S.say('', '石階上，傳來腳步聲。很輕、很快的腳步聲。');
    S.spawn({ id: 'mc_e', sprite: 'mochi', x: 3, y: 0, dir: 'down', speed: 6 });
    await S.move('mc_e', 'DDDDDD', { speed: 7 });
    await S.move('mc_e', 'RRRRRRRRRDD', { speed: 6 });
    S.face('player', 'mc_e');
    await L(S, [['', '一隻三色貓從石階上衝下來，在礁石上跳了兩下，一頭撞進星河懷裡。'], ['xinghe:surprise', '……麻糬？'], ['', '麻糬的頸上，綁著一盞小小的水燈。燈還亮著。']]);
    S.emote('mc_e', '♥');
    S.sfx('step');
    await S.say('', '然後，是另一個腳步聲。很急的腳步聲。');
    S.spawn({ id: 'bz_e', sprite: 'baizhi', x: 3, y: 0, dir: 'down', speed: 5 });
    await S.move('bz_e', 'DDDDDD', { speed: 6 });
    await S.move('bz_e', 'RRRRRRD', { speed: 4 });
    await L(S, [['', '一個人影沿著通往海邊的石階跑下來。藍色的大襟衫，黑色的長髮挽了一半，用一條紅繩鬆鬆地綁著；髮上，一枚小小的燈籠髮簪。'], ['', '她跑得太急，在最後三階差點摔倒，又站穩了。她在星河身後幾步停下來。喘著氣。'], ['baizhi:normal', '……星河。'], ['', '星河的背，僵住了。他慢慢地，轉過身。']]);
    S.face('player', 'bz_e'); S.face('bz_e', 'player');
    S.bgm('love');
    await L(S, [
      ['xinghe:surprise', '……白……芷……？'],
      ['baizhi:smile', '水燈都往外漂。'],
      ['baizhi:laugh', '所以，我用走的。'],
      ['baizhi:smile', '從澎湖上岸，坐船到鹿港。紅纓帶我走了好遠、好遠的路。'],
      ['', '星河看向坡上。紅纓用力地揮手，一邊揮一邊哭。雲歸舉起葫蘆（裡面是茶）。芋圓打了一個大哈欠。陳伯還在看別處。'],
    ]);
    S.emote('hy_e', '♥'); S.emote('yy_e', '…');
    await L(S, [
      ['xinghe:cry', '……你們……全部都知道……'],
      ['baizhi:smile', '我說，最後這一段，要我自己跑。'],
      ['baizhi:smile', '我記得芋圓。我記得天燈。我記得你唱歌很難聽。'],
      ['baizhi:cry', '我什麼都記得。'],
      ['', '冷風吹過海面。白芷打了一個噴嚏。'],
      ['xinghe:cry', '……我有帶外套。'],
      ['', '星河哭著笑，脫下外套，披在她肩上。'],
      ['baizhi:smile', '我知道。'],
      ['', '她退後半步。看著他。'],
      ['baizhi:smile', '每一次，都是你走那座橋來找我。'],
      ['baizhi:smile', '每一次，橋都會斷。'],
      ['baizhi:smile', '所以——'],
      ['baizhi:smile', '星河，這一次，換我來找你了。'],
      ['', '星河站起來。他想說什麼，說不出來。他只是張開手。她撲進他懷裡。'],
      ['', '海面上，一千盞水燈一起往外漂。遠方的海平線上，一點光——彼岸燈——亮了一下，像在笑。'],
    ]);
    await S.fadeOut(2.0, '#ffffff');
  };

  // ---- 2B 普通結局「彼岸」
  H.endingNormal = async (S) => {
    await S.say('xinghe:serious', '白芷。妳不是一個人——');
    S.flag('ending_normal');
    await S.say('', '星河胸口的心燈飛了出來。東方的島上，零零星星地升起了一些光。');
    await S.fadeOut(0.6);
    await waitScene(new IslandScene({ normal: true, list: riseList(), caption: '遠遠地，看見幾點光。' }));
    await S.fadeIn(0.6);
    V().ch11_flame = 0.25; S.sfx('lantern');
    await pause(S, 0.6);
    V().ch11_flame = 0.06;
    await L(S, [
      ['', '光飛過海，落進餘燼。餘燼亮了一下——又暗了下去。'],
      ['燈母（聲音）', '……還不夠。'],
      ['燈母（聲音）', '孩子們。還不夠。'],
      ['', '星河愣住了。'],
      ['baizhi:smile', '星河，謝謝你。這些光，好溫暖。'],
      ['baizhi:smile', '你看，大家都在幫我。'],
      ['baizhi:sad', '……可是燈，還是需要一個燈靈。'],
      ['xinghe:angry', '那我來！我身上有妳的火——我來當燈！'],
      ['baizhi:sad', '你那一點火，只夠讓你活著。'],
      ['baizhi:cry', '我好不容易，才讓你活下來的。'],
    ]);
    // E-N2 她帶走的東西
    await L(S, [
      ['baizhi:smile', '星河。'],
      ['baizhi:smile', '每一次，你都走那座橋來找我。'],
      ['baizhi:sad', '每一次，橋都會斷。每一次，你都差一點回不去。'],
      ['baizhi:sad', '所以這一次——'],
      ['', '她踮起腳，把額頭輕輕貼在他的額頭上。'],
      ['baizhi:cry', '我把「我」帶走。'],
      ['baizhi:cry', '你會記得九份，記得紅纓和雲歸，記得這一年。'],
      ['baizhi:cry', '只是不會記得，旁邊還有一個我。'],
      ['xinghe:surprise', '不要——白芷，不要——'],
      ['', '小小的光，一盞一盞，從星河的身上飄出來，飄進她的胸口。芋圓。天燈。九份下雨的石階。燈橋。紙燈上的字。'],
      ['xinghe:cry', '芋圓……要吹三下……'],
      ['xinghe:cry', '天燈上，我寫的是……我寫的是……'],
      ['xinghe:cry', '白芷，我一定會——我會……'],
      ['', '停頓。'],
      ['xinghe:think', '……我會……什麼？'],
      ['', '他看著眼前哭著的少女。'],
      ['xinghe:surprise', '……妳是……誰？'],
      ['', '白芷笑了。眼淚一顆一顆掉下來。'],
      ['baizhi:smile', '……我是燈。'],
      ['', '她把一塊小小的玉牌，輕輕放進他的口袋。他沒有發現。——玉牌上刻著「白芷」。'],
      ['', '紅纓衝過來，被雲歸拉住。紅纓拚命掙扎，然後不動了，只是哭。'],
      ['baizhi:smile', '紅纓、雲歸、芋圓。……拜託你們了。'],
      ['', '麻糬從紅纓的懷裡掙了出來，跑到白芷腳邊，抬頭看著她。'],
      ['', '白芷蹲下來，把額頭貼在牠的額頭上，貼了很久。'],
      ['baizhi:cry', '麻糬。這一次，不可以跟來。'],
      ['baizhi:cry', '……替我陪著他。他會忘記我。妳不要忘記。'],
      ['', '紅纓把麻糬抱了回來。麻糬沒有掙扎。牠只是一直看著，一眼都沒有眨。'],
    ]);
    await S.move('baizhi', 'U');
    await S.fadeActor('baizhi', 0, 1.6);
    S.leave('baizhi');
    V().ch11_flame = 1.2; S.flash('#ffffff', 1.0, 0.8); S.sfx('lantern');
    await L(S, [['', '她轉身，走進餘燼。'], ['', '光。'], ['', '彼岸燈重新燃起——很亮，很安靜，很孤單。懸在半空的千萬盞魂燈，一齊往光的方向飄去。天邊的曙光，動了。'], ['', '燈的最深處，隱約有一個少女的身影，閉著眼睛，在微笑。']]);
    // E-N3 守燈人・歸航
    await S.fadeOut(1.0);
    await S.warp('farshore_field', 27, 13, 'right', { fade: 0 });
    S.hideFollowers(true);
    S.spawn({ id: 'yx_e', sprite: 'yexuan', x: 31, y: 12, dir: 'left' });
    S.spawn({ id: 'nian_e', sprite: 'nianer', x: 30, y: 12, dir: 'right', ghost: true });
    const sw = S.spawn({ id: 'sw_e', sprite: 'c11_suwan', x: 32, y: 10, dir: 'down', ghost: true, light: { r: 140, color: '#ffe6b0' } }); sw.alpha = 0;
    S.spawn({ id: 'cb_e', sprite: 'chenbo', portrait: 'chenbo', x: 28, y: 12, dir: 'right' });
    await S.fadeIn(1.0);
    await S.say('', '小渡口。夜玄醒來，夜念蹲在他身邊。蘇婉提著白燈籠走來。');
    await S.fadeActor('sw_e', 1, 1.0);
    await L(S, [
      ['蘇婉', '……你們父女，讓我等得好久。'],
      ['yexuan:cry', '……婉。'],
      ['', '夜玄看著燈塔。看了很久。'],
      ['yexuan:sad', '念兒，跟娘去吧。'],
      ['nianer:surprise', '爹不來嗎？'],
      ['yexuan:sad', '那盞燈裡的姑娘，是我害她回去的。'],
      ['yexuan:serious', '總要有人，替她守著。'],
      ['nianer:sad', '爹會來嗎？'],
      ['yexuan:smile', '會。等燈不需要人守的那一天。'],
      ['', '夜念想了想，用力抱了他一下。然後牽起娘的手，走向光。走到一半，她回頭揮手。'],
      ['nianer:smile', '爹，這一次，換我等你喔！'],
    ]);
    await Promise.all([S.fadeActor('nian_e', 0, 1.2), S.fadeActor('sw_e', 0, 1.2)]);
    await L(S, [['', '夜玄朝燈塔走去。陳伯叫住他。'], ['chenbo:sad', '阿玄……'], ['yexuan:smile', '阿渡。這一次，換我顧燈了。']]);
    await S.fadeActor('yx_e', 0, 1.2);
    await S.fadeOut(1.0);
    V().c11_dawn = 1;
    await S.warp(DECK, 12, 6, 'up', { reload: true, fade: 0 });
    S.hideFollowers(true);
    await S.fadeIn(1.0);
    await L(S, [
      ['', '王船上。天亮了。星河靠著船舷睡著，醒來的時候，揉了揉眼睛。'],
      ['xinghe:think', '……我們……為什麼來這裡？'],
      ['', '紅纓轉過身去，肩膀在抖。'],
      ['yungui:normal', '……來送一個朋友。'],
      ['xinghe:think', '朋友？誰？'],
      ['yungui:smile', '……一個很會吹笛子的朋友。'],
      ['xinghe:think', '……奇怪。我怎麼不記得。'],
      ['', '他摸了摸臉。手是濕的。'],
      ['xinghe:surprise', '……我怎麼在哭？'],
    ]);
    for (let i = 0; i < 3; i++) S.sfx('gong', i * 0.5);
    await S.say('', '遠方，鐘聲。鬼門關了。');
    await H.et5(S, true);
    // E-N4 一年後・九份
    await card(S, ['一年後　七月']);
    await S.warp('ending_jiufen_shop', 7, 6, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true);
    await S.fadeIn(1.0);
    await L(S, [
      ['', '陳記燈籠舖。星河在糊燈籠。每一盞燈籠下面，都綁著一條藍色的穗子。'],
      ['chenbo:normal', '又是藍色的穗？'],
      ['xinghe:think', '不知道。手自己就綁了。'],
      ['xinghe:smile', '……好看嘛。'],
      ['chenbo:sad', '……嗯。好看。'],
      ['xinghe:think', '陳伯，麻糬又不見了。'],
      ['chenbo:sad', '……天暗了。伊去海邊矣。'],
      ['xinghe:think', '每天晚上都去。也不知道在等什麼。'],
      ['', '陳伯沒有回答。'],
    ]);
    await S.warp('ending_jiufen', 10, 9, 'up', { fade: 0.6, noAutosave: true });
    S.hideFollowers(true);
    await S.walkTo('player', 6, 6, { yFirst: true });
    S.face('player', 'up');
    await L(S, [
      ['agan:normal', '兩碗？'],
      ['xinghe:surprise', '……兩碗？'],
      ['agan:think', '你以前，不是都買兩碗？'],
      ['xinghe:think', '……有嗎？'],
      ['xinghe:smile', '那……兩碗。'],
      ['', '他吃完一碗。看著另一碗，看了很久。熱氣散了。'],
      ['', '舖子後面。紅纓和雲歸來了九份過中元。紅纓從懷裡拿出一盞摺得小小的紙燈——白芷留給他們的信。她又讀了一次。'],
    ]);
    await paper({ portrait: 'baizhi', expr: 'sad', lantern: true, pages: [['紅纓、雲歸、陳伯：（芋圓、麻糬也是）', '請讓他好好活。不要告訴他。', '他會難過的，他很笨，他會一直來。', '……可是，如果有一天，他自己想起來了——', '就不要攔他。', '　　　　　　　　白芷']] });
    await L(S, [['hongying:cry', '……笨蛋。兩個都是笨蛋。'], ['yungui:sad', '……走吧。去看放水燈。']]);
    // E-N5 中元・八斗子
    await card(S, ['七月十五　中元']);
    V().c11_badouzi = 'normal';
    await S.warp('ending_badouzi', 11, 9, 'down', { fade: 0, noAutosave: true });
    S.hideFollowers(true);
    await S.fadeIn(1.2);
    S.spawn({ id: 'mc_e', sprite: 'mochi', x: 13, y: 9, dir: 'down' });
    await L(S, [['', '八斗子的海邊。放水燈頭的隊伍剛走過，海面上漂滿了水燈。'], ['', '礁石最前面，坐著一隻三色貓。這一年，每一個晚上，麻糬都坐在同一個地方，看著同一個方向。'], ['', '星河蹲在水邊，把一盞小水燈放進海裡。水燈上，綁著一條藍色的穗子。']]);
    const wl = addObj({ t: 'water_lantern', x: 11, y: 10 });
    for (let i = 0; i < 3; i++) { await pause(S, 0.5); if (wl) wl.y++; }
    await L(S, [
      ['', '水燈漂走了。一直漂，漂向黑色的海。星河看著它。眼淚掉了下來。'],
      ['xinghe:surprise', '……奇怪。'],
      ['xinghe:cry', '我為什麼……在哭……'],
      ['', '他把手伸進口袋。摸到一個冰冰涼涼的東西。拿出來——一塊小小的玉牌。玉牌上刻著兩個字：「白芷」。'],
      ['xinghe:think', '……白……芷……'],
      ['', '這兩個字，他不認得。可是唸出來的時候，胸口很痛。'],
      ['', '海的盡頭，一點光，亮了一下。'],
      ['', '麻糬站了起來。'],
      ['', '牠往前走了一步，前腳碰到了水，又停住。牠就那樣站著，一直看著那點光，直到它暗下去。'],
      ['', '然後，牠又慢慢地坐了回去。繼續等。'],
      ['', '只有浪聲。'],
    ]);
    await S.say('?', '星河……這一次，別再來找我了。', { color: '#c8d0e0' });
    await S.say('xinghe:serious', '……我會找到妳的。');
    await S.fadeOut(2.0);
    S.flag('game_clear');
    seenEnding('normal');
    installEnding('normal');
    await S.ending('normal');
  };

  // ---- true-ending tail: E-T6..E-T8, then credits
  const _endingTrue = H.endingTrue;
  H.endingTrue = async (S) => {
    await _endingTrue(S);
    await H.et6(S);
    await H.et7(S);
    await H.et8(S);
    S.flag('game_clear');
    seenEnding('true');
    installEnding('true');
    await S.ending('true');
  };

  // =================================================================================================
  // CREDITS (§3), 致謝 (§4), post-credit scenes (§5)
  // =================================================================================================
  function buildCredits(kind) {
    const c = ['#彼岸燈　Shorelight', ''];
    if (kind === 'normal') c.push('#渡魂謠・第一段', '燈一盞，渡一人，', '黑水茫茫莫回身；', '前塵如霧隨潮去，', '彼岸花開又一春。', '');
    else c.push('#渡魂謠・千燈之段', '燈千盞，渡千人，', '千家燈火照歸程；', '此岸彼岸同一海，', '不忘來時不忘人。', '');
    c.push('', '#製作', 'Shorelight Team', '',
      '#劇本・對白・場景設計', 'Claude ／ Shorelight Team', '',
      '#故事設定・世界觀', 'Shorelight Team', '',
      '#角色・怪物・背景・地圖美術（程序繪製）', 'Claude ／ Shorelight Team', '',
      '#音樂・音效（WebAudio 即時合成）', 'Claude', '',
      '#主題曲「渡魂謠」', '作詞　Claude', '作曲　Claude', '',
      '#程式・引擎', 'Claude ／ Shorelight Team', '',
      '#戰鬥設計・數值平衡', 'Claude ／ Shorelight Team', '',
      '#文化考據・審閱', 'Shorelight Team', '',
      '#測試', 'Shorelight Team', '', '',
      '#登場人物', '沈星河　　白芷　　洛紅纓　　雲歸　　芋圓　　麻糬', '陳渡　　夜玄　　夜念　　蘇婉', '洛青鋒　　清虛真人　　墨鴉　　藤婆', '燈母　　萬象童子　　鯤',
      '阿炳伯　阿柑姨　小金　阿黃　阿土伯　林大夫　阿蓮　阿德　小梅', '阿進伯　阿添伯　阿湧　林阿木　烏鬚船主　……以及所有的你們', '', '',
      '#這一路上的心燈');
    const Ls = G.state.lanterns || {};
    const ids = Object.keys(Ls).sort((a, b) => (Ls[a].time || 0) - (Ls[b].time || 0));
    for (const id of ids) c.push(Ls[id].name || id);
    const n = ids.length;
    c.push('', kind === 'normal' ? `——一共 ${n} 盞。那些還沒點亮的燈，還在島上的某個地方，等著。` : `——一共 ${n} 盞。謝謝你，把它們一盞一盞點起來。`, '', '',
      '#特別感謝', '所有玩到這裡的你', '', '');
    return c;
  }
  const THANKS = [
    ['本作的世界，來自一座真實的島。'],
    ['感謝雞籠中元祭的水燈、平溪的天燈、淡水的夕陽與艋舺的龍山寺；', '竹塹的風與客家庄的山歌、擂茶、義民；鹿港的天后宮與老街；府城、鹽水的蜂炮；', '北港的媽祖遶境、東港的王船、恆春的月琴與落山風、鵝鑾鼻的燈塔；', '頭城的搶孤、澎湖的天后宮與石滬。', '謝謝那些把這些節日與手藝，一代一代傳下來的人。'],
    ['感謝賽夏族、鄒族、布農族、邵族、達悟族、卑南族、阿美族、太魯閣族、噶瑪蘭族，', '以及這座島上所有的原住民族。', '你們的山、海、語言與智慧，遠比這個故事所能承載的更深、更廣。', '本作只敢遠遠地、恭敬地，描繪其中小小的一角；若有疏漏與錯誤，責任全在我們。'],
    ['感謝客家、閩南，以及每一代渡過黑水溝、在這裡落地生根的人。'],
    ['本作是奇幻創作。夢藤、七彩靈蕈、一息界、彼岸燈與故事中所有神祕的儀式皆為虛構，', '不屬於任何真實的族群或信仰。故事中出現的真實祭典與信仰，只以見證與尊重的方式呈現。', '若你因為這個故事，想去看看這些地方——', '請帶著尊重，聽從在地人的指引；祭典之中，請守禮，勿擅入。'],
    ['謹向《仙劍奇俠傳》（1995）致敬。', '謝謝它讓我們知道，遊戲也可以讓人哭，也可以讓人在哭完之後，想要好好地活。'],
    ['獻給「六死三留一回頭」裡，所有沒能說出名字的人。', '也獻給每一個，還在等人回家的人。'],
  ];
  async function thanks(S) { for (const page of THANKS) await S.narrate(page, { veil: 1, size: 24, color: '#f4efe4' }); }
  const STINGER = {};
  STINGER.true = async (S) => {
    await thanks(S);
    await card(S, ['隔年　春']);
    G.state.flags.ch11_spring = true;
    V().c11_magong_bgm = 'penghu';
    await S.warp('penghu_magong', 25, 10, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true); S.show('player', false);
    S.spawn({ id: 'cb_s', sprite: 'chenbo', portrait: 'chenbo', x: 23, y: 10, dir: 'right' });
    S.spawn({ id: 'aj_s', sprite: 'temple_keeper', x: 26, y: 9, dir: 'left' });
    S.spawn({ id: 'mom_s', sprite: 'villager_f2', x: 28, y: 10, dir: 'left' });
    await S.fadeIn(1.2);
    await L(S, [
      ['', '媽宮。天后宮前的廟埕，掛滿了燈籠——媽祖生的熱鬧。'],
      ['', '陳伯扛著一大串新糊的燈籠，交給阿進伯。'],
      ['阿進伯', '九份的燈籠，就是無仝款！'],
      ['chenbo:smug', '竹骨削七次的。'],
      ['', '廟埕邊，一位年輕的漁家婦人抱著一個襁褓中的女嬰。女嬰盯著滿天的燈籠，咯咯地笑個不停。'],
      ['年輕的婦人', '這个囡仔真奇怪。看著燈，就笑。'],
    ]);
    await S.walkTo('cb_s', 27, 10);
    S.face('cb_s', 'right');
    await L(S, [
      ['', '陳伯停下腳步。他看著那個女嬰。女嬰也看著他——然後伸出小小的手，一把抓住了他的手指。抓得很緊。'],
      ['chenbo:surprise', '……'],
      ['', '女嬰咯咯笑著，鬆開了手。'],
      ['chenbo:smile', '……看著燈就笑。好。'],
      ['chenbo:smile', '看著燈就笑，最好。'],
    ]);
    await S.walkTo('cb_s', 22, 10);
    S.face('cb_s', 'left');
    await L(S, [['', '他轉身離開，走了幾步，背對著所有人，很小聲地說：'], ['chenbo:smile', '……歡迎回來。']]);
    await S.fadeOut(1.6, '#ffffff');
    await S.narrate(['完'], { veil: 1, size: 48 });
    await cg(S, { bg: 'temple', tint: 'rgba(255,190,120,0.3)', tintMode: 'soft-light', caption: '太虛觀・廚房', figures: [{ sprite: 'yuyuan', x: 640, y: 590, pose: 'idle', pet: true }] }, async () => {
      await S.say('', '芋圓叼著一塊發粿，從廚房裡慢吞吞地走出來，看了鏡頭一眼。');
      await S.say('yungui:think', '（遠處）……續集，有蘑菇嗎？');
    });
  };
  STINGER.normal = async (S) => {
    await thanks(S);
    await card(S, ['某一天']);
    await S.warp('ending_jiufen_shop', 7, 7, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true);
    await S.fadeIn(1.0);
    await L(S, [['', '陳記燈籠舖，深夜。陳伯在燈下削竹骨。門開了。'], ['', '星河站在門口，手裡握著那塊玉牌。'], ['xinghe:serious', '陳伯。'], ['xinghe:serious', '白芷……是誰？'], ['', '陳伯手上的刀，停住了。'], ['', '很久。']]);
    await S.narrate(['「……可是，如果有一天，他自己想起來了——就不要攔他。」'], { veil: 0.6 });
    await L(S, [['', '陳伯放下刀，站起來，從牆上取下那支舊槳。'], ['chenbo:serious', '……引魂人的槳。'], ['chenbo:serious', '要學嗎？'], ['xinghe:serious', '要。']]);
    await cg(S, { bg: 'shore', dark: 0.3, caption: '八斗子', figures: [{ sprite: 'xinghe', x: 640, y: 580, pose: 'ready', scale: 0.7 }],
      draw: (ctx, t) => { const k = Math.max(0, Math.sin(t * 2.2)) * (t > 2.5 && t < 6 ? 1 : 0); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.drawImage(G.FX.glowSprite('#fff4dc'), 120, 300, 40, 40); ctx.restore(); } }, async () => {
      await L(S, [['', '八斗子的海邊。夜。一艘小小的船，掛著一盞燈，划進黑色的海。船上的少年，划得還很笨拙。'], ['', '海的盡頭，很遠很遠的地方，一點光——亮了兩下。'], ['', '像是在回答。']]);
    });
    await S.narrate(['—— 渡 ——'], { veil: 1, size: 44 });
    await S.narrate(['完'], { veil: 1, size: 48 });
  };

  // js/story/ending.js loads after the chapter files: install credits & post-credit scenes once it exists
  function installEnding(kind) {
    if (!G.Ending) return false;
    G.Ending.credits = buildCredits(kind || 'true');
    G.Ending.stinger = G.Ending.stinger || {};
    G.Ending.stinger.true = STINGER.true;
    G.Ending.stinger.normal = STINGER.normal;
    return true;
  }
  if (typeof setTimeout === 'function') setTimeout(() => installEnding('true'), 0);

  // =================================================================================================
  // CHAPTER ENTRY
  // =================================================================================================
  G.Story.ch11 = async (S) => {
    S.chapter(11);
    installEnding('true');
    // party: 星河・紅纓・雲歸 (+芋圓/麻糬 as silent followers); 白芷 is away until the top of the tower; 陳伯 is the helmsman (not a member)
    const lv = avgLv();
    for (const id of ['xinghe', 'hongying', 'yungui']) {
      if (!G.state.members[id]) G.Party.create(id, lv);
      G.Story.ensureLevel(id, lv);
      if (!inParty(id)) G.Party.join(id);
    }
    if (inParty('baizhi')) G.Party.leave('baizhi');
    G.state.party = ['xinghe', 'hongying', 'yungui'].concat(G.state.party.filter((p) => !['xinghe', 'hongying', 'yungui', 'baizhi'].includes(p)));
    // hand-off from chapter 10 (standalone start: hand the voyage keepsakes over silently)
    for (const k of ['key_flag', 'key_lighthouse', 'key_boateye']) if (!G.Inv.has(k)) giveSilent(k);
    // the two cats travel with the party from earlier chapters; make sure they are here on a standalone start
    G.state.flags.yuyuan_joined = true; G.state.flags.mochi_joined = true;
    delete G.state.flags.yuyuan_hidden; delete G.state.flags.mochi_hidden;
    if (G.state.flags.ch8_jianpu && G.state.members.hongying) G.Party.learnSkill('hongying', 'hy_luojia');
    V().ch11_leg = 0; V().ch11_moon = 0;
    await S.titleCard(G.Chapters[11], '七月三十　最後一夜');
    await S.warp(DECK, 15, 8, 'left', { fade: 0.6 });
  };
})();
