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
      const b = st.vars.ch11_bow == null ? 260 : st.vars.ch11_bow;
      const out = [];
      if (b > 0) out.push({ x: 4, y: 6, r: b, color: st.flags.ch11_fog ? '#fff2d0' : '#ffd98a', flicker: 0.25 });
      out.push({ x: 13, y: 6, r: 110, color: '#ffb060', flicker: 0.3 }, { x: 24, y: 8, r: 120, color: '#ff9050', flicker: 0.3 });
      if (st.flags.ch11_tianhou) out.push({ x: 21, y: 5, r: 90, color: '#ffcf7a', flicker: 0 });
      return out;
    },
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', x: 23, y: 8, dir: 'left', fixedDir: true, talk: (S) => H.helm(S) },
      { id: 'deck_hy', sprite: 'hongying', x: 9, y: 6, dir: 'down', if: () => inParty('hongying'), talk: (S) => H.deckTalk(S, 'hongying') },
      { id: 'deck_yg', sprite: 'yungui', x: 7, y: 9, dir: 'right', if: () => inParty('yungui'), talk: (S) => H.deckTalk(S, 'yungui') },
      { id: 'deck_tz', sprite: 'tuanzi', x: 11, y: 9, dir: 'down', if: () => inParty('yungui'), talk: (S) => H.deckTalk(S, 'tuanzi') },
    ],
    events: [
      { id: 'c11_01', trigger: 'auto', if: (st) => !st.flags.ch11_start && st.chapter === 11, run: (S) => H.c11_01(S) },
      { id: 'c11_12', trigger: 'auto', if: (st) => st.flags.ch11_sail && !st.flags.ch11_leg1, run: (S) => H.c11_12(S) },
      { id: 'save', trigger: 'action', x: 24, y: 9, label: '存檔', run: async (S) => { await S.saveMenu(); } },
    ],
    warps: [
      { x: 17, y: 9, to: 'wangboat_cabin11', tx: 7, ty: 6, tdir: 'up', door: true },
      { x: 27, y: 8, to: 'penghu_magong', tx: 11, ty: 7, tdir: 'right', if: (st) => st.flags.ch11_start && !st.flags.ch11_jailer && !st.flags.ch11_sail },
      { x: 27, y: 8, to: 'xuanwu_shore', tx: 32, ty: 35, tdir: 'up', if: (st) => st.flags.ch11_jailer && !st.flags.ch11_sail },
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
    { t: 'signboard', x: 25, y: 33, text: '石敢當', interact: ['南口的石敢當。過了這裡，就是退乾的海床。'], label: '調查' },
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
      { id: 'ph_ajin', sprite: 'temple_keeper', name: '阿進伯', x: 13, y: 6, dir: 'left', if: stA, talk: [['阿進伯', '來廟裡坐。媽祖婆等恁足久矣。']] },
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
      { id: 'ph_crowd4', sprite: 'child_f', name: '囡仔', x: 25, y: 4, dir: 'up', if: stA, talk: [['囡仔', '阿母，天星袂振動！']] },
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
      { id: 'pg3', troop: 'penghu_1', x: 33, y: 10, art: 'pirate_ghost', lv: 39, radius: 3 },
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
      { id: 'b1a', troop: 'xuanwu_2', x: 7, y: 26, art: 'lantern_golem', variant: 1, lv: 40, radius: 3 },
      { id: 'b1b', troop: 't11_xw_drowned', x: 35, y: 26, art: 'drowned_swarm', lv: 41, radius: 3 },
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
    warps: [{ x: 11, y: 19, w: 2, to: 'xuanwu_1f', tx: 21, ty: 4, tdir: 'down' }],
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
