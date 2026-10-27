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
//        vars.ch11_face_hy / ch11_face_yg, vars.ch11_lit (五燈), vars.ch11_mirrors (曼陀羅), vars.tuanzi_mush (cross-chapter).
// Quests: q_ch11_main, q_penghu_weir, q_tangshan, q_baizhi_memory, q_ch11_treasure, q_tuanzi_mush (completed here).
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
    c11_ac_cosmic: { name: '宇宙糰子之鈴', desc: '七仙蕈全收集的證明。糰子說牠看見了世上所有的顏色——還是很餓。雲歸裝備。', type: 'acc', price: 0, ch: 11, icon: 'ring', who: ['yungui'], stats: { mag: 14, luk: 14 }, special: ['mpRegen'] },
    c11_pirate_coin: { name: '海賊金幣', desc: '三百年前的金幣。烏鬚的字條說：真正的寶，是一路的伙伴。', type: 'material', price: 6000, ch: 11, icon: 'bag' },
    c11_shell: { name: '貝殼', desc: '海賊寶箱裡的貝殼。很漂亮，不太值錢。', type: 'material', price: 10, ch: 11, icon: 'gem' },
  });

  // ---- skills (enemy skills e11_*, player skill c11_yg_cosmic) ----
  const SK = G.Data.skills;
  Object.assign(SK, {
    c11_yg_cosmic: {
      name: '宇宙糰子', desc: '「吾，看見了。世上所有的顏色。」七色的糰子從天而降——至於降下什麼，誰也不知道。', mp: 16, type: 'special', elem: null, target: 'self', power: 0,
      special: 'tuanzi', fx: 'summon', sfx: 'magic',
      outcomes: [
        { w: 2, skill: 'c11_tz_metal', text: '糰子的瞳孔變成六角形的漩渦——金色的雨落下來了！' },
        { w: 2, skill: 'c11_tz_wood', text: '糰子打了一個噴嚏，青色的雷從天而降！' },
        { w: 2, skill: 'c11_tz_water', text: '糰子說：「海，是一碗很大很大的湯。」湯從天上倒下來了！' },
        { w: 2, skill: 'c11_tz_fire', text: '糰子想起了烤魚乾。整片天空都燒紅了！' },
        { w: 2, skill: 'c11_tz_earth', text: '糰子跳起來，又落下來。地動了！' },
        { w: 2, skill: 'c11_tz_heal', text: '糰子打起七彩的呼嚕。大家覺得肚子飽飽的。' },
      ],
    },
    c11_tz_metal: { name: '金之糰', desc: '', mp: 0, type: 'mag', elem: 'metal', target: 'enemies', power: 2.3, hidden: true, fx: 'metal_big', sfx: 'metal' },
    c11_tz_wood: { name: '木之糰', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 2.3, hidden: true, fx: 'wood_big', sfx: 'thunder' },
    c11_tz_water: { name: '水之糰', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 2.3, hidden: true, fx: 'water_big', sfx: 'water' },
    c11_tz_fire: { name: '火之糰', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 2.3, hidden: true, fx: 'fire_big', sfx: 'fire' },
    c11_tz_earth: { name: '土之糰', desc: '', mp: 0, type: 'mag', elem: 'earth', target: 'enemies', power: 2.3, hidden: true, fx: 'earth_big', sfx: 'earth' },
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
    e11_kun_roll: { name: '翻身', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 1.2, status: { id: 'stun', chance: 0.15, turns: 1 }, fx: 'water_big', sfx: 'splash' },
    e11_kun_dive: { name: '北冥', desc: '鯤潛入深海……海面一片死寂。（防禦！）', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'water', sfx: 'splash' },
    e11_kun_breach: { name: '鯤破浪而出', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 2.2, fx: 'water_big', sfx: 'crit' },
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
    m: { hp: 6.5, atk: 2.2, mag: 2.0, def: 1.1, spd: 1.2, exp: 5, gold: 6 },
    skills: [['e11_cap_blade', 4], ['e11_cap_crew', 2, 'ally_dead'], ['e11_cap_keg', 2], ['e11_cap_rob', 1], ['e_pirate_cutlass', 2]],
    drops: [['c11_ac_captain_patch', 1]],
    desc: '三百年前在澎湖海面橫行的海盜頭子。錨鏈拴在一盞長明燈上，「守不住路，燈就燒老子。」' });
  mkEnemy('c11_powder_keg', { name: '火藥桶', art: 'pirate_ghost', variant: 1, scale: 0.6, lv: 39, elem: 'fire', m: { hp: 0.2, atk: 0.1, def: 0.5, spd: 0.6, exp: 0, gold: 0 },
    skills: [['e11_keg_hiss', 1]], desc: '冒著煙的火藥桶。先打爆它，就炸到他們自己人。' });
  mkEnemy('c11_jailer', { name: '鎖魂將', art: 'lantern_golem', variant: 2, scale: 1.7, lv: 40, elem: 'metal', weak: ['fire'], resist: ['water'], boss: true, immune: BIMM,
    m: { hp: 12, atk: 2.3, mag: 2.1, def: 1.25, spd: 0.95, exp: 7, gold: 8 },
    skills: [['e11_jl_sweep', 4], ['e11_jl_seal', 3], ['e11_jl_drain', 3], ['e11_jl_lock', 2], ['e11_jl_refill', 4, 'hp<50']],
    drops: [['c11_ac_iron_heart', 1]],
    desc: '用鎖鏈、魂罐與熄不掉的長明燈拼成的獄卒。沒有頭，胸口是一只空空的罐子。' });
  mkEnemy('c11_jar', { name: '魂罐', art: 'ghost_lantern', variant: 2, scale: 1.1, lv: 40, elem: 'water', m: { hp: 0.75, atk: 0.1, def: 0.8, spd: 0.5, exp: 0.3, gold: 0 },
    skills: [['e11_jar_hum', 1]], desc: '肩上與背上的魂罐。裡面的魂在替它擋刀。' });
  mkEnemy('c11_kun', { name: '鯤', art: 'kun', lv: 41, elem: 'water', weak: ['earth'], resist: ['water'], boss: true, immune: BIMM, endAt: 0.02,
    m: { hp: 10, atk: 2.4, mag: 2.3, def: 1.2, spd: 1.0, exp: 7, gold: 0 },
    skills: [['e11_kun_swallow', 3], ['e_kun_spout', 4], ['e11_kun_roll', 3]],
    drops: [], desc: '黑水溝的老守者。吞下迷路的魂，馱著游到彼岸再吐出來。燈暗了，牠找不到岸。' });
  mkEnemy('c11_kun_tumor', { name: '吞魂燈瘤', art: 'ghost_lantern', variant: 1, scale: 1.25, lv: 41, elem: 'water', weak: ['earth'],
    m: { hp: 1.1, atk: 0.8, mag: 0.9, def: 0.9, spd: 0.8, exp: 0.6, gold: 0 },
    skills: [['e11_tumor_light', 1]], desc: '鯤背上腫脹的燈瘤，塞滿了吐不出去的魂。每回合替鯤回復。' });
  mkEnemy('c11_warden_elder', { name: '千年燈塔守', art: 'tower_warden', variant: 2, scale: 1.5, lv: 42, elem: 'metal', weak: ['fire'], boss: true, immune: BIMM,
    m: { hp: 12, atk: 2.35, mag: 2.25, def: 1.3, spd: 1.0, exp: 7, gold: 7 },
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
  if (!Q.q_tuanzi_mush) Q.q_tuanzi_mush = { name: '糰子的蕈譜', desc: '台灣頭到台灣尾，七個所在各長一種「七仙蕈」。七種都吃過的人，會看見世上所有的顏色。',
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
    { place: 'farshore', ids: ['lantern_baizhi_memory'], text: '芋圓、天燈、紫色的粥、糰子的肚子、土地公廟、下雨的石階——六盞記憶的燈，從白芷自己的胸口浮起。', voice: ['baizhi:cry', '……原來，我自己也是一盞。'] },
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
        if (ln && ln.strike && G.T(text) === text) {
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
      const caps = [['hongying', '九份的芋圓……平溪的天燈……'], ['yungui', '艋舺的戲……竹塹的風……阿里山的雲……'], ['tuanzi', '……每一種，好吃的東西……'], ['xinghe', '……白芷。']];
      const n = this.phase === 'in' ? Math.floor(this.k * 4.2) : 4;
      for (let i = 0; i < Math.min(n, 4); i++) {
        const [id, line] = caps[i];
        const a = this.phase === 'in' ? U.clamp((this.k * 4.2 - i) * 2, 0, 1) : 1;
        R().text(ctx, G.ShortNames[id] || G.Names[id], cx - 250, 74 + i * 46, { size: 20, align: 'right', color: '#ffcf8a', alpha: a });
        R().text(ctx, line, cx - 230, 70 + i * 46, { size: 25, color: i === 3 ? '#ffe6a8' : '#e8dcc0', alpha: a });
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
        try { G.Sprites.drawBattle(ctx, f.sprite, f.pose || 'idle', t, f.x, f.y, { flip: !!f.flip, alpha: f.alpha, ghost: f.ghost, scale: f.scale }); } catch (e) { G.warnOnce && G.warnOnce('vignette ' + f.sprite, e); }
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
