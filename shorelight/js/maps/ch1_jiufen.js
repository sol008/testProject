// 《彼岸燈》 第一章　九份燈火 — chapter 1. Screenplay: docs/story/ch1_jiufen.md
//
// Maps:    jiufen_shop_2f (閣樓), jiufen_shop (陳記燈籠舖), jiufen (九份 40×45), jiufen_teahouse (聽雨樓),
//          jiufen_yuyuan (阿柑芋圓), jiufen_store (阿財商行), jiufen_clinic (回春堂), jiufen_atu_house (阿土嬸家),
//          mine_1 / mine_2 (舊金礦坑), keelung_fest (雞籠街・主普壇), badouzi (八斗子・望海巷).
// Time of day in 九份 (phase()): P1 清晨 → P2 正午 (ch1_ahuang_lost) → P3 午後 (ch1_mine_done) → PX 黃昏不在
//          (ch1_depart_fest) → P4 子夜 (ch1_baizhi_found) → P5 翌晨 (ch1_morning_after). Light, particles, bgm,
//          lantern colours and every NPC's position & lines follow the phase; phaseRefresh() re-applies it in place.
// Flow:    G.Story.ch1 → 1-1 wake (2F) → 1-2 errands → 1-3a/b/c → 1-4 阿黃 → 1-5 mine → 1-6 cart puzzle → 1-7 工頭魂
//          → 1-8 back → 1-9 dusk → 1-10 雞籠 (墨鴉) → 1-11 procession → 1-12 八斗子 lanterns return → 1-13 白芷
//          → 1-14/15 she wakes (白芷 joins) → 1-16..1-18 night raid (鹽米, 渡魂謠) → 1-19 墨鴉 → 1-20 水鬼王 (陳伯 guest,
//          螢火 handed over mid-fight via onTurn) → 1-21 黑羽 → 1-22 引魂人 → 1-23 芋圓 → 1-24 出發 → G.Story.next(S, 2).
// Quests:  q_atu_watch (心燈 xd_atu_watch), q_ahuang (心燈 xd_ahuang), q_xingmu (fun, no lantern).
// Vars:    vars.swA ('S'|'E'), vars.swB ('N'|'E'), vars.windLit [], vars.ch1_lantern_text, vars.c1_talk {}.
// Data:    items c1_* · skills c1_* · enemies c1_foreman, c1_water_ghost_h, c1_wgk_hand, c1_ghost_king, c1_moya ·
//          troops t_c1_foreman, t_c1_shore_ghost, t_c1_moya, t_c1_ghost_king · G.Data.chars.chenbo (guest) · quests.
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE;
  const auto = () => !!(G.Debug && G.Debug.autoplay);
  const dur = (sec) => (auto() ? Math.min(sec, 0.04) : sec);   // cinematic timings collapse in test autoplay
  const MS = () => G.mapScene;
  const F = (k) => !!G.state.flags[k];
  const V = () => G.state.vars;
  const inParty = (id) => G.state.party.includes(id);
  const CH2_MAP = 'mistforest_n';   // first map of chapter 2 (written by another builder)

  // =================================================================================================== data
  const IT = G.Data.items;
  Object.assign(IT, {
    c1_salt: { name: '鹽米', desc: '粗鹽拌白米。撒出去，不乾淨的東西都要退三步。對敵一體造成 70 點土屬性傷害。', type: 'use', price: 20, ch: 1, icon: 'bag', use: { target: 'enemy', damage: 70, elem: 'earth', battle: true } },
    c1_sweetpotato: { name: '番薯', desc: '九份人從小吃到大的番薯。回復氣血 40。', type: 'use', price: 8, ch: 1, icon: 'food', use: { target: 'ally', heal: 40 } },
    c1_dried_fish: { name: '小魚乾', desc: '八斗子曬的小魚乾。貓很愛。回復氣血 20。', type: 'use', price: 10, ch: 1, icon: 'food', use: { target: 'ally', heal: 20 } },
    c1_oolong: { name: '烏龍茶', desc: '聽雨樓的烏龍茶，喝一口，眼睛都亮了。回復真氣 40。', type: 'use', price: 45, ch: 1, icon: 'drink', use: { target: 'ally', mp: 40 } },
    c1_tea_egg: { name: '茶葉蛋', desc: '茶湯裡滷了一整夜的蛋，殼上一圈圈裂紋。回復氣血 60。', type: 'use', price: 15, ch: 1, icon: 'food', use: { target: 'ally', heal: 60 } },
    c1_yuyuan_ice: { name: '芋圓冰', desc: '七月天，一碗芋圓冰。回復氣血 40、真氣 25。', type: 'use', price: 35, ch: 1, icon: 'drink', use: { target: 'ally', heal: 40, mp: 25 } },
    c1_honggui: { name: '紅龜粿', desc: '紅通通的龜形粿，印著龜甲紋，拜拜用的吉祥物。回復氣血 120。', type: 'use', price: 30, ch: 1, icon: 'food', use: { target: 'ally', heal: 120 } },
    c1_dingbian: { name: '鼎邊趖', desc: '米漿沿著大鼎邊一趖就熟。雞籠人的早頓。回復氣血 160。', type: 'use', price: 45, ch: 1, icon: 'food', use: { target: 'ally', heal: 160 } },
    c1_tempura: { name: '天婦羅', desc: '魚漿炸的天婦羅，甜甜辣辣。回復氣血 80、真氣 10。', type: 'use', price: 30, ch: 1, icon: 'food', use: { target: 'ally', heal: 80, mp: 10 } },
    c1_maltose: { name: '麥芽糖', desc: '阿土嬸的糖仔。黏牙，很甜。回復氣血 50、真氣 5。', type: 'use', price: 12, ch: 1, icon: 'food', use: { target: 'ally', heal: 50, mp: 5 } },
    c1_gold_dust: { name: '金砂', desc: '舊金礦坑裡的金砂。工頭魂抱了一輩子的東西。可以賣個好價錢。', type: 'material', price: 100, ch: 1, icon: 'gem' },
    c1_miner_cloth: { name: '礦工頭巾', desc: '礦工綁在頭上的粗布巾，吸過很多汗。', type: 'head', price: 0, ch: 1, icon: 'hat', stats: { def: 4, luk: 2 } },
    c1_shuideng: { name: '水燈吊飾', desc: '小小的紙水燈，綁在身上，一年平安。', type: 'acc', price: 60, ch: 1, icon: 'charm', stats: { luk: 3, def: 1 } },
    c1_xianghuo: { name: '香火袋', desc: '土地公爐上過過火的紅布袋。免疫封印。', type: 'acc', price: 90, ch: 1, icon: 'charm', stats: { mag: 2 }, immune: ['seal'] },
    c1_fan_story: { name: '說書折扇', desc: '阿炳伯說了四十年書的扇子。', type: 'acc', price: 0, ch: 1, icon: 'fan', stats: { mag: 2, luk: 3 } },
    c1_foolsgold: { name: '小金的金仔石', desc: '小金說這是金仔。其實是黃鐵礦。', type: 'acc', price: 0, ch: 1, icon: 'gem', stats: { luk: 5 } },
    c1_tea_lanterns: { name: '茶樓的燈籠', desc: '聽雨樓訂的四盞紅燈籠。', type: 'key', price: 0, ch: 1, icon: 'lantern' },
    c1_lamp_oil: { name: '燈油', desc: '一甕燈油，沉甸甸的。', type: 'key', price: 0, ch: 1, icon: 'misc' },
    c1_offering: { name: '供品籃', desc: '草仔粿、米酒、水果與一疊金紙。', type: 'key', price: 0, ch: 1, icon: 'bag' },
    c1_lantern: { name: '提燈', desc: '陳伯丟給你的手提燈籠。暗的地方，它會照亮你身邊。', type: 'key', price: 0, ch: 1, icon: 'lantern' },
    c1_xingmu: { name: '醒木', desc: '阿炳伯說書用的醒木，上面有貓的牙印。', type: 'key', price: 0, ch: 1, icon: 'misc' },
    c1_changming_fu: { name: '長明燈符', desc: '府城長明宮的符紙，畫著一盞燈。摸起來冰冰的，好像裡面關著什麼。', type: 'key', price: 0, ch: 1, icon: 'talisman' },
    c1_broken_sword: { name: '斷掉的竹劍', desc: '星河從小用到大的竹劍，斷成兩截了。捨不得丟。', type: 'key', price: 0, ch: 1, icon: 'sword' },
    c1_oar: { name: '引魂槳', desc: '陳伯的木槳。槳身刻滿細密的符文，在黑暗中發著溫暖的金光。', type: 'weapon', price: 0, ch: 1, icon: 'spear', who: ['chenbo'], elem: 'water', stats: { atk: 14, mag: 6 } },
  });

  const SK = G.Data.skills;
  Object.assign(SK, {
    // 工頭魂・金貴仔
    c1_e_raise: { name: '高舉鶴嘴鋤', desc: '工頭魂高高舉起鶴嘴鋤……', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'metal' },
    c1_e_big_pick: { name: '鶴嘴鋤重擊', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.7, fx: 'slash', sfx: 'crit' },
    c1_e_gold_dust: { name: '金砂迷眼', desc: '金砂撒得滿天都是。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'spdDown', chance: 0.5, turns: 2 }, fx: 'debuff', sfx: 'debuff' },
    // 遲疑的水鬼
    c1_e_hesitate: { name: '遲疑', desc: '水鬼盯著星河……遲疑了。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'ghost' },
    // 水鬼王
    c1_e_grab: { name: '抓', desc: '冰冷的手抓住了腳踝！', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 0.7, status: { id: 'stun', chance: 0.6, turns: 2 }, fx: 'water', sfx: 'splash' },
    c1_e_regrow: { name: '再生之手', desc: '黑水裡，又伸出了一隻手。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c1_wgk_hand'], fx: 'summon', sfx: 'splash' },
    c1_e_wail: { name: '百面哀嚎', desc: '牠身上的臉，一起張口哭號。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }], fx: 'dark', sfx: 'ghost' },
    // 陳伯 (guest)
    c1_cb_sweep: { name: '槳掃', desc: '引魂槳橫掃而過。敵全體物理攻擊。', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 0.9, fx: 'water', sfx: 'splash' },
    c1_cb_du: { name: '引魂・渡', desc: '「黑水茫茫，莫再回頭！」對靈體的單體重擊。', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 2.5, fx: 'lantern', sfx: 'lantern' },
    c1_u_chenbo: { name: '引魂・渡海', desc: '【奧義】槳身的符文全部亮起，一槳渡盡海上的冤魂。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 2.6, ultimate: true, fx: 'ultimate_chenbo', sfx: 'ultimate' },
  });

  // 陳伯 as a battle guest (1-20). Only created if no other file defined him.
  if (!G.Data.chars.chenbo) {
    G.Data.chars.chenbo = {
      name: '陳伯', title: '引魂人', elem: 'water', weapon: 'spear', sprite: 'chenbo', portrait: 'chenbo', joinLv: 10,
      desc: '九份陳記燈籠舖的老師傅，星河的養父。曾是划著船、提著燈，在水路上替迷路的魂找路的「引魂人」。',
      base: { hp: 150, mp: 30, atk: 19, def: 14, mag: 16, spd: 12, luk: 10 },
      growth: { hp: 19, mp: 3, atk: 2.7, def: 2, mag: 2.2, spd: 0.9, luk: 0.5 },
      learn: [{ lv: 1, skill: 'c1_cb_sweep' }, { lv: 1, skill: 'c1_cb_du' }],
      ultimate: 'c1_u_chenbo',
      equip: { weapon: 'c1_oar', armor: null, head: null, feet: null, acc: null },
    };
  }

  const EN = G.Data.enemies, TR = G.Data.troops;
  // a stat block built the same way as js/data/enemies.js def()
  function mkEnemy(d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const e = {
      name: d.name, lv: d.lv, hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(1, Math.round(c.exp * expM)), gold: Math.max(1, Math.round(c.gold * (m.gold != null ? m.gold : expM))),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([id, w, cond]) => (cond ? { id, w, if: cond } : { id, w })), desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt', 'phases']) if (d[k] != null) e[k] = d[k];
    return e;
  }
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  EN.c1_foreman = mkEnemy({
    name: '工頭魂・金貴仔', art: 'miner_ghost', variant: 2, scale: 1.5, lv: 3, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 4.1, atk: 1.4, def: 1.1, exp: 7, gold: 4 },
    skills: [['e_pickaxe', 5], ['c1_e_gold_dust', 2], ['c1_e_big_pick', 1]],
    phases: [{ at: 0.5, heal: 0.15, lines: [['工頭魂', '攏是我的！攏是我的！']], buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }] }],
    desc: '舊金礦坑的工頭「金貴仔」。死了也抱著金塊不放，腰上還掛著算盤。被金子附了身，是「金」性的魂——金驚火。',
  });
  EN.c1_water_ghost_h = Object.assign({}, EN.water_ghost, {
    name: '遲疑的水鬼', lv: 3, hp: Math.round(EN.water_ghost.hp * 0.85),
    skills: [{ id: 'e_drown_pull', w: 2 }, { id: 'e_ghost_touch', w: 2 }, { id: 'e_claw', w: 2 }],
    desc: '從礁岩邊爬上來的水鬼。抓住星河的腳踝時，不知為什麼，手鬆了一下。',
  });
  EN.c1_wgk_hand = mkEnemy({
    name: '水鬼之手', art: 'water_ghost', variant: 1, scale: 0.8, lv: 4, elem: 'water', weak: ['fire', 'earth'],
    m: { hp: 0.95, atk: 0.8, def: 0.8, exp: 0.5, gold: 0.3 },
    skills: [['c1_e_grab', 3], ['e_claw', 2]],
    desc: '水鬼王伸出來的手。手臂裡還有手臂。',
  });
  EN.c1_ghost_king = Object.assign({}, EN.ghost_king, {
    hp: Math.round(EN.ghost_king.hp * 0.9), endAt: 0.02,
    skills: [{ id: 'e_drown_pull', w: 3 }, { id: 'e_ghostking_tide', w: 2 }, { id: 'e_claw', w: 2 }, { id: 'c1_e_regrow', w: 2, if: 'ally_dead' }],
    phases: [{
      at: 0.5, phase: 2, msg: '水鬼王身上的臉，一起睜開了眼睛！',
      lines: [['baizhi:sad', '它身體裡……有好多人。他們都好冷。'], ['xinghe:serious', '那就——送他們回家！']],
      skills: [['e_drown_pull', 3], ['e_ghostking_tide', 2], ['c1_e_wail', 2], ['c1_e_regrow', 2, 'ally_dead']],
    }],
  });
  EN.c1_ghost_king.phases[0].skills = EN.c1_ghost_king.phases[0].skills.map(([id, w, cond]) => (cond ? { id, w, if: cond } : { id, w }));
  EN.c1_moya = Object.assign({}, EN.moya, {
    endAt: 0.02,
    phases: [
      { at: 0.5, lines: [['moya:angry', '你……你這個沒有燈的傢伙，到底是什麼東西？']] },
      { at: 0.25, lines: [['moya:angry', '嘎！我的羽毛！這件斗篷很貴的！']] },
    ],
  });
  TR.t_c1_foreman = { enemies: ['c1_foreman'], bg: 'mine', bgm: 'boss', boss: true, flee: false };
  TR.t_c1_shore_ghost = { enemies: ['c1_water_ghost_h'], bg: 'shore', bgm: 'battle', flee: false };
  TR.t_c1_moya = { enemies: ['c1_moya'], bg: 'jiufen_night', bgm: 'boss', boss: true, flee: false };
  TR.t_c1_ghost_king = { enemies: ['c1_ghost_king', 'c1_wgk_hand', 'c1_wgk_hand'], bg: 'jiufen_night', bgm: 'boss', boss: true, flee: false };

  const QD = G.Data.quests;
  QD.q_atu_watch = {
    name: '阿土伯的懷錶', lantern: true,
    desc: '阿土伯的懷錶，在三年前坍方那天掉在舊礦坑西邊的老坑道裡。他想讓錶回到阿土嬸身邊。',
    stages: ['懷錶掉在舊礦坑上層往東、風很大的老坑道裡。阿土伯做記號用「正」字。', '找到了阿土伯的懷錶。交給阿土嬸吧。'],
    doneText: '錶又走了。滴答、滴答。',
  };
  QD.q_ahuang = {
    name: '阿黃回家', lantern: true,
    desc: '阿旺要把老是往礦坑跑的阿黃送去雞籠。可是阿黃是在等牠真正的主人。',
    stages: ['阿旺說明天要把阿黃送走。跟阿旺談談。', '阿旺要有人作證，阿黃以前是阿土伯的狗。去找阿土嬸。', '阿土嬸答應去跟阿旺說。到小金家門口。'],
    doneText: '阿黃不走了。',
  };
  QD.q_xingmu = {
    name: '醒木失竊記',
    desc: '黑貓「黑糖」叼走了阿炳伯說書用的醒木。',
    stages: ['黑糖叼著醒木跑了。好像往雜貨店的屋頂那邊去了。', '黑糖往暗街仔晾衣竿那邊跑了。', '黑糖跑到福德祠的台階上睡午覺了。', '拿回醒木了。還給阿炳伯吧。'],
    doneText: '阿炳伯的醒木回來了。',
  };

  // =================================================================================================== tutorials
  const TUT = {
    tut_move: { title: '操作說明', pages: [['{y}移動{/}：方向鍵 或 W A S D。', '{y}奔跑{/}：按住 Shift。（可在設定中改為預設奔跑）']] },
    tut_talk: { title: '操作說明', pages: [['{y}對話／調查{/}：面向人物或物件，按 Enter、空白鍵 或 Z。', '{y}取消／返回{/}：Esc 或 X。']] },
    tut_save: { title: '記錄點', pages: [['發著微光的石燈籠是「{y}記錄點{/}」。面向它按確認鍵，就能記錄目前的旅程。', '此外，每次穿過地圖出入口時，遊戲也會自動記錄一次（自動存檔欄位）。']] },
    tut_shop: { title: '商店', pages: [['商店：選「{y}購買{/}」挑選商品，左右鍵調整數量；也可以「{y}販賣{/}」掉用不到的東西。', '裝備類商品會標示裝上之後能力的變化（↑↓）。']] },
    tut_menu: { title: '選單', pages: [['按 {y}C、M 或 Tab{/} 打開選單，可以查看道具、裝備、法術與隊伍狀態。', '{y}平安符{/}可以在戰鬥中使用：解除異常，還會護身三回合。先收好吧！']] },
    tut_equip: { title: '裝備', pages: [['打開選單 →「{y}裝備{/}」，把礦工頭巾戴上吧！', '裝備會改變能力值。']] },
    tut_field_enemy: { title: '地圖上的敵人', pages: [['地圖上看得到的就是敵人，碰到就會開戰。', '從背後或側面靠近，趁牠撞上你之前按確認鍵先砍一下，就能「{y}先制攻擊{/}」！', '等級遠高於敵人時，牠們會自己逃開。']] },
    tut_battle: { title: '戰鬥說明', pages: [['畫面上方的「行動順序」顯示誰先出手；速度越快，輪到得越頻繁。', '輪到你時選擇行動：{y}攻擊{/}、{y}仙術{/}（消耗真氣 MP）、{y}道具{/}、{y}防禦{/}、{y}逃跑{/}。']] },
    tut_element: { title: '五行', pages: [['五行：{y}金、木、水、火、土{/}。相剋時造成 1.5 倍傷害；反過來被剋，只剩 0.7 倍。', '金剋木、木剋土、土剋水、水剋火、火剋金。', '星河的「{y}螢火斬{/}」是火屬性——對金屬性的敵人特別有效！']] },
    tut_gauge: { title: '劍意', pages: [['{y}劍意{/}滿了！受到傷害、或每次行動，劍意都會累積。', '滿到 100 時，可以施展消耗全部劍意的「{y}絕招{/}」——就像阿炳伯故事裡的劍仙一樣。']] },
    tut_party: { title: '隊伍', pages: [['{y}白芷{/}加入了隊伍！她擅長「清心曲」療傷與水屬性的法術。', '她的身子比較單薄。選單的「隊伍」可以調整出場順序。']] },
    tut_combo: { title: '合擊', pages: [['{y}合擊{/}：特定的夥伴都在場、狀態良好時，可以一起施展「合擊」。', '星河與白芷的合擊——「{y}星河渡燈{/}」。在「仙術」選單的最下方。']] },
    tut_battle_item: { title: '戰鬥道具', pages: [['戰鬥中也可以使用{y}道具{/}。', '「{y}鹽米{/}」帶土屬性——土剋水，對水屬性的水鬼特別有效！']] },
    tut_guest: { title: '客人', pages: [['{y}陳伯{/}以「客人」身分暫時加入。他會自己判斷行動。']] },
    tut_xindeng: { title: '心燈', pages: [['{y}心燈{/}：當你真心幫助了一個人、或讓一個靈魂了卻心願，就會誕生一盞小小的「心燈」。', '心燈的數量記錄在選單裡。它們會一直跟著你——直到旅程的最後。']] },
  };
  class TutorialScene {
    constructor(def, res) { this.def = def; this.res = res; this.page = 0; this.t = 0; this.a = 0; this.closing = false; G.Audio.sfx('item'); }
    update(dt) {
      this.t += dt;
      if (this.closing) {
        this.a -= dt * 5;
        if (this.a <= 0) { G.Scenes.pop(this); G.Input.clear(); this.res(); }
        return;
      }
      this.a = Math.min(1, this.a + dt * 5);
      if (auto()) { this.closing = true; return; }
      if (this.t > 0.45 && (G.Input.pressed('ok') || G.Input.clicked())) {
        G.Audio.sfx('ok');
        if (this.page < this.def.pages.length - 1) { this.page++; this.t = 0.15; } else this.closing = true;
      }
    }
    draw(ctx) {
      const a = Math.max(0, this.a);
      ctx.save();
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = '#02040c'; ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = a;
      const page = this.def.pages[this.page];
      const w = 880, x = (G.W - w) / 2;
      ctx.font = G.font(25);
      const paras = page.map((l) => G.Render.wrap(ctx, l, w - 130));
      const nl = paras.reduce((s, l) => s + l.length, 0);
      const h = 96 + nl * 40 + (paras.length - 1) * 14 + 52;
      const y = (G.H - h) / 2 - 30 + (1 - a) * 14;
      G.UI.panel(ctx, x, y, w, h);
      G.UI.lanternIcon(ctx, x + 44, y + 40, 9, G.time);
      G.Render.text(ctx, this.def.title, x + 66, y + 22, { size: 28, color: G.UI.GOLD_L, glow: 'rgba(255,190,110,0.5)', glowBlur: 10 });
      if (this.def.pages.length > 1) G.Render.text(ctx, `${this.page + 1}／${this.def.pages.length}`, x + w - 34, y + 28, { size: 18, align: 'right', color: '#c9b893' });
      ctx.fillStyle = 'rgba(217,181,106,0.45)'; ctx.fillRect(x + 36, y + 70, w - 72, 1);
      let ly = y + 92;
      for (const lines of paras) {
        ctx.fillStyle = '#ffcf7a';
        ctx.beginPath(); ctx.arc(x + 56, ly + 15, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = G.font(25); ctx.textBaseline = 'top';
        G.Render.drawLines(ctx, lines, x + 76, ly, 40, '#f3ead2');
        ly += lines.length * 40 + 14;
      }
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(G.time * 4));
      G.UI.hints(ctx, [['Z', this.page < this.def.pages.length - 1 ? '下一頁' : '知道了']], x + w - 30, y + h - 40);
      ctx.restore();
    }
  }
  // show a tutorial once (flag = its id); resolves when closed
  function tutorial(id) {
    if (G.state.flags[id] || !TUT[id]) return Promise.resolve();
    G.state.flags[id] = true;
    G.Dialog.close();
    return new Promise((res) => G.Scenes.push(new TutorialScene(TUT[id], res)));
  }

  // =================================================================================================== sound
  // 渡魂謠 on a lone dizi over a soft drone (same melody as the prologue)
  const DUHUN = 'a4:4 c5:2 d5:2 e5:6 g5:2 | e5:4 d5:2 c5:2 d5:8 | a4:4 c5:2 d5:2 e5:4 g5:2 a5:2 | g5:4 e5:2 d5:2 e5:8 |' +
    ' a5:6 g5:2 e5:4 d5:4 | c5:2 d5:2 e5:2 g5:2 d5:8 | c5:4 d5:2 c5:2 a4:4 g4:2 c5:2 | a4:12 -:4';
  const DUHUN_CH = [['a3', 'c4', 'e4'], ['g3', 'b3', 'd4'], ['a3', 'c4', 'e4'], ['e3', 'g3', 'b3'],
    ['f3', 'a3', 'c4'], ['g3', 'b3', 'd4'], ['d3', 'f3', 'a3'], ['a3', 'c4', 'e4']];
  const Snd = {
    nb: null, lull: null,
    ac() { const a = G.Audio && G.Audio.ctx; return a && a.state === 'running' && G.Audio.musicBus && G.Audio.musicBus() ? a : null; },
    wave(vol = 0.4, len = 5) {
      const ac = this.ac();
      if (!ac) return;
      if (!this.nb) {
        this.nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = this.nb.getChannelData(0);
        let b = 0;
        for (let i = 0; i < d.length; i++) { b = b * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = b * 2.2; }
      }
      const t = ac.currentTime + 0.02;
      const src = ac.createBufferSource(); src.buffer = this.nb; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(240, t); lp.frequency.linearRampToValueAtTime(1100, t + len * 0.45); lp.frequency.linearRampToValueAtTime(260, t + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.5, t + len * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + len);
      src.connect(lp); lp.connect(g); g.connect(G.Audio.musicBus());
      src.start(t, Math.random() * 1.5); src.stop(t + len + 0.1);
    },
    // first `bars` bars of the melody (0 = all); returns its length in seconds
    lullaby(bpm = 80, bars = 0) {
      const ac = this.ac();
      if (!ac || !G.Music.parse) return 0;
      this.stopLullaby(0.1);
      const src = bars ? DUHUN.split('|').slice(0, bars).join('|') : DUHUN;
      const p = G.Music.parse(src);
      const step = 60 / bpm / 4, t0 = ac.currentTime + 0.2;
      const dry = ac.createGain(), wet = ac.createGain();
      dry.connect(G.Audio.musicBus()); wet.connect(G.Audio.reverbInput());
      this.lull = [dry, wet];
      const midi = (n) => G.Audio.noteToMidi(n);
      for (const e of p.ev) for (const m of e.m) G.Audio.playNote('dizi', t0 + e.s * step, m, e.l * step * 0.96, 0.55 * (e.a || 1), 0.8, dry, wet);
      DUHUN_CH.slice(0, bars || 8).forEach((c, i) => { for (const n of c) G.Audio.playNote('pad', t0 + i * 16 * step, midi(n), 16 * step, 0.16, 0.8, dry, wet); });
      return p.len * step;
    },
    stopLullaby(fade = 2) {
      const ac = this.ac();
      if (!ac || !this.lull) return;
      for (const g of this.lull) { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setTargetAtTime(0.0001, ac.currentTime, fade / 3); }
      const l = this.lull;
      this.lull = null;
      setTimeout(() => { for (const g of l) { try { g.disconnect(); } catch (e) { /* gone */ } } }, (fade + 1) * 1000);
    },
    // a crow's caw from two detuned saw blips
    caw() {
      const ac = this.ac();
      if (!ac) return;
      const t = ac.currentTime + 0.02;
      for (const [d, f] of [[0, 820], [0.22, 760]]) {
        const o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter();
        o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2;
        o.frequency.setValueAtTime(f, t + d); o.frequency.exponentialRampToValueAtTime(f * 0.62, t + d + 0.18);
        g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(0.18 * G.settings.sfx, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
        o.connect(bp); bp.connect(g); g.connect(ac.destination);
        o.start(t + d); o.stop(t + d + 0.25);
      }
    },
  };
  // 醒木 clap — a sharp wood knock
  const knock = () => { G.Audio.sfx('hit'); G.Audio.sfx('guard', 0.02); };

  // =================================================================================================== cinematic overlay
  // Letterbox bars + floating subtitles (lyrics). Removes itself when no script is running.
  class CineOverlay {
    constructor() { this.k = 0; this.target = 1; this.lyr = null; }
    update(dt) {
      this.k += (this.target - this.k) * Math.min(1, dt * 3.2);
      if (this.lyr) this.updateLyrics(dt);
      if ((this.target === 0 && this.k < 0.02) || !G.Script.busy()) {
        G.Scenes.pop(this);
        if (this.lyr) { const r = this.lyr.res; this.lyr = null; r(); }
        if (this.onGone) this.onGone();
      }
    }
    lyrics(lines, per) { return new Promise((res) => { this.lyr = { lines, per, i: 0, t: 0, shown: [0], out: -1, res }; }); }
    updateLyrics(dt) {
      const L = this.lyr;
      L.t += dt;
      if (L.out >= 0) { L.out += dt; if (L.out > 1.6) { this.lyr = null; L.res(); } return; }
      const skip = auto() || G.Input.held('skip') || (L.t > 1.4 && (G.Input.pressed('ok') || G.Input.clicked()));
      if (L.t > L.per || skip) {
        if (L.i < L.lines.length - 1) { L.i++; L.t = 0; L.shown.push(0); } else if (L.t > L.per * 0.6 || skip) L.out = 0;
      }
      for (let j = 0; j < L.shown.length; j++) L.shown[j] = Math.min(1, L.shown[j] + dt / 1.4);
    }
    draw(ctx) {
      const h = Math.round(70 * this.k);
      if (h > 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, h); ctx.fillRect(0, G.H - h, G.W, h); }
      const L = this.lyr;
      if (L) {
        const fade = L.out >= 0 ? Math.max(0, 1 - L.out / 1.4) : 1;
        L.shown.forEach((k, j) => {
          G.Render.text(ctx, L.lines[j], G.W / 2, 128 + j * 52 + (1 - k) * 10, { size: 32, align: 'center', color: '#e8f6ff', alpha: k * fade, glow: 'rgba(140,210,255,0.8)', glowBlur: 18 });
        });
      }
    }
  }
  let cine = null;
  function cineOn(instant) {
    if (cine && G.Scenes.has(cine)) { cine.target = 1; return; }
    cine = new CineOverlay();
    if (instant) cine.k = 1;
    G.Scenes.push(cine);
  }
  function cineOff() {
    const c = cine;
    cine = null;
    if (!c || !G.Scenes.has(c)) return Promise.resolve();
    if (auto()) { G.Scenes.pop(c); return Promise.resolve(); }
    c.target = 0;
    return new Promise((res) => { c.onGone = res; });
  }
  async function sing(S, lines, per) {
    if (!cine || !G.Scenes.has(cine)) cineOn();
    await cine.lyrics(lines, per || 4.6);
  }

  // =================================================================================================== shared helpers
  const lerpTo = (obj, props, sec, ease = 'outQuad') => G.Tweens.to(obj, props, dur(sec), ease);
  const wait = (S, sec) => S.wait(dur(sec));
  function camTo(x, y, sec, ease = 'inOutQuad') {
    const m = MS();
    const [tx, ty] = m.clampCam(x * T + T / 2 - G.W / 2, y * T + T / 2 - G.H / 2);
    if (m.cam.tx == null) { m.cam.tx = m.cam.x; m.cam.ty = m.cam.y; }
    m.cam.speed = 14;
    return G.Tweens.to(m.cam, { tx, ty }, dur(sec), ease);
  }
  async function camBack(S, sec = 0.8) {
    const p = MS().player;
    await camTo(p.x, p.y - 0.4, sec);
    S.cameraFollow();
  }
  function glow(ctx, x, y, r, col, a) {
    if (a <= 0.01 || r <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(G.FX.glowSprite(col), x - r, y - r, r * 2, r * 2);
  }
  // per-NPC talk counters: first lines once, then the "再次" lines
  function talked(key) {
    const t = V().c1_talk = V().c1_talk || {};
    t[key] = (t[key] || 0) + 1;
    return t[key];
  }
  function objAt(key) { return MS() && MS().objects.find((o) => o.key === key); }
  // keep the map alive (NPCs walking, particles) while dialogue / overlays are open during cutscenes
  function liveBg(ms) {
    ms.bgUpdate = function (dt) {
      if (!G.Script.busy()) return;
      const st = G.Scenes.stack;
      for (let i = st.indexOf(this) + 1; i < st.length; i++) if (st[i].opaque) return;
      this.update(dt);
    };
  }
  // re-apply a map's flag-driven light / particles / bgm / NPCs / enemies without reloading it
  function phaseRefresh(o = {}) {
    const ms = MS();
    if (!ms) return;
    const def = ms.def;
    ms.lightCfg = G.Mapx.val(def.light) || { ambient: 0 };
    ms.particles = new G.FX.Particles(G.Mapx.val(def.particles), ms);
    ms.npcs = ms.npcs.filter((n) => n.spawned || n.guard);
    ms.buildNpcs();
    ms.buildEnemies();
    ms.buildFollowers();
    ms.computeSolid();
    if (o.bgm !== false) { const b = G.Mapx.val(def.bgm); if (b) G.Music.play(b); }
  }
  // temporarily change shop prices (discounts) for the duration of one shop visit
  async function shopAt(S, goods, title, prices) {
    const old = {};
    for (const k in prices || {}) { old[k] = IT[k].price; IT[k].price = prices[k]; }
    try { await S.shop(goods, { title }); } finally { for (const k in old) IT[k].price = old[k]; }
  }
  // stone-lantern save point
  async function savePoint(S, text) {
    await S.say('', text || '石燈籠裡的燈芯微微亮著。點亮燈芯，記下旅程？');
    const c = await S.choice(['記錄旅程', '不用了'], { cancel: 1 });
    if (c === 0) { S.sfx('save'); await S.saveMenu(); }
  }
  // 竹劍 lost (1-19): remove it from the hand (or the bag) and keep the pieces
  function breakBamboo() {
    const m = G.state.members.xinghe;
    if (m && m.equip.weapon === 'sw_bamboo') m.equip.weapon = null;
    else if (G.Inv.has('sw_bamboo')) G.Inv.remove('sw_bamboo', 1);
  }
  function equipYinghuo() {
    G.Inv.add('sw_yinghuo', 1);
    const m = G.state.members.xinghe;
    if (m) {
      if (m.equip.weapon && m.equip.weapon !== 'sw_yinghuo') G.Inv.add(m.equip.weapon, 1);
      m.equip.weapon = null;
      G.Party.equip('xinghe', 'weapon', 'sw_yinghuo');
    }
  }

  // ------------------------------------------------------------------ time of day in 九份
  function phase(st) {
    const f = (st || G.state).flags;
    if (f.ch1_morning_after) return 'P5';
    if (f.ch1_baizhi_found) return 'P4';
    if (f.ch1_depart_fest) return 'PX';
    if (f.ch1_mine_done) return 'P3';
    if (f.ch1_ahuang_lost) return 'P2';
    return 'P1';
  }
  const isNight = (st) => phase(st) === 'P4';
  const PHASE_LIGHT = {
    P1: { ambient: 0.1, color: '#2a3550', tint: 'rgba(170,195,235,0.16)', glow: 0.1 },
    P2: { ambient: 0, tint: 'rgba(255,248,230,0.06)' },
    P3: { ambient: 0.18, color: '#3a1e08', tint: 'rgba(255,170,80,0.2)', glow: 0.3 },
    PX: { ambient: 0.32, color: '#2a1020', tint: 'rgba(255,120,60,0.25)', glow: 0.5 },
    P4: { ambient: 0.8, color: '#03081a', playerR: 230, playerColor: '#bfe0ff', glow: 0.45 },
    P5: { ambient: 0.08, color: '#202838', tint: 'rgba(120,135,160,0.28)' },
  };
  const PHASE_PARTICLES = {
    P1: ['leaves', { type: 'mist', alpha: 0.07, density: 0.7, color: '#e8eef8' }],
    P2: [],
    P3: ['motes'],
    PX: ['motes', 'lanterns'],
    P4: [{ type: 'mist', alpha: 0.2, density: 1.5, color: '#b8cce8' }, 'embers'],
    P5: ['rain', { type: 'mist', alpha: 0.1, density: 0.9, color: '#d0d8e4' }],
  };
  const PHASE_BGM = { P1: 'jiufen', P2: 'jiufen', P3: 'jiufen', PX: 'night', P4: 'tension', P5: 'jiufen' };
  const BLUE = '#6fb6ff';

  // =================================================================================================== battles
  // Chapter-wide battle hooks (only while chapter 1 is running): first-battle / 合擊 tutorials at the start,
  // the 劍意 tutorial the first time someone's gauge is full.
  async function commonIntro(b) {
    if (!F('tut_battle')) await tutorial('tut_battle');
    const xh = b.party.find((p) => p.id === 'xinghe'), bz = b.party.find((p) => p.id === 'baizhi');
    if (xh && bz && xh.lv >= 3 && bz.lv >= 3 && !F('tut_combo')) await tutorial('tut_combo');
  }
  async function commonTurn(b, u) {
    if (u.side === 'party' && u.gauge >= 100 && !F('tut_gauge')) await tutorial('tut_gauge');
  }
  if (!G.Battle.__c1hooks) {
    G.Battle.__c1hooks = true;
    const start0 = G.Battle.start;
    G.Battle.start = function (troop, o = {}) {
      if (G.state.chapter !== 1) return start0(troop, o);
      const o2 = Object.assign({}, o);
      o2.intro = async (b) => { if (o.intro) await o.intro(b); await commonIntro(b); };
      o2.onTurn = async (b, u) => { await commonTurn(b, u); if (o.onTurn) await o.onTurn(b, u); };
      return start0(troop, o2);
    };
  }
  // telegraphed big swing: a pulsing 「！」 over the enemy while it winds up
  function chargeFx(b, flagKey) {
    b.fx.push({
      update: () => !b.result,
      draw: (ctx) => {
        for (const e of b.enemies) {
          if (!e[flagKey] || e.dead) continue;
          const h = b.unitH(e), x = e.x + e.ox, y = e.y + e.oy;
          G.Render.text(ctx, '！', x, y - h - 30 + Math.sin(b.t * 8) * 5, { size: 52, bold: true, align: 'center', color: '#ff5a4a', stroke: '#2a0808', strokeW: 6 });
        }
      },
    });
  }
  // 1-7 工頭魂: raises the pickaxe on its 2nd turn (and now and then after), smashes on the next
  function foremanIntro(b) {
    const ai = b.aiCommand.bind(b);
    b.aiCommand = (e) => {
      if (e.id !== 'c1_foreman') return ai(e);
      if (e.c1charge) { e.c1charge = false; return { kind: 'skill', skill: 'c1_e_big_pick', targets: [U.pick(b.alive('party'))] }; }
      if (e.turns === 2 || (e.turns > 3 && Math.random() < 0.3)) { e.c1charge = true; return { kind: 'skill', skill: 'c1_e_raise', targets: [e] }; }
      const c = ai(e);
      if (c.skill === 'c1_e_big_pick') return { kind: 'skill', skill: 'e_pickaxe', targets: c.targets };
      return c;
    };
    chargeFx(b, 'c1charge');
    return (async () => {
      b.say('工頭魂：「金仔……是我的！」', 1.6);
      await b.wait(1.2);
      await b.say2('atu:serious', '少年仔！金貴仔是「金」性的魂——金驚火！用火！');
      await tutorial('tut_element');
    })();
  }
  // 1-13 遲疑的水鬼: does nothing for its first two turns
  function hesitateIntro(b) {
    const ai = b.aiCommand.bind(b);
    b.aiCommand = (e) => {
      if (e.id === 'c1_water_ghost_h' && (e.turns || 0) <= 2) return { kind: 'skill', skill: 'c1_e_hesitate', targets: [e] };
      return ai(e);
    };
    return null;
  }
  // 1-19 墨鴉: the 長明咒印 prefers 白芷
  function moyaIntro(b) {
    const ai = b.aiCommand.bind(b);
    b.aiCommand = (e) => {
      const c = ai(e);
      if (e.id === 'c1_moya' && c.skill === 'e_crow_hex') {
        const bz = b.alive('party').find((p) => p.id === 'baizhi');
        if (bz && Math.random() < 0.75) c.targets = [bz];
        b.say('墨鴉：「長明宮的燈，在等妳。」', 1.6);
      }
      return c;
    };
    return b.say2('moya:smug', '嘎——鄉下小子，讓開。');
  }
  // 1-20 水鬼王 + 陳伯 (guest). 螢火 is handed over on 星河's second turn.
  function ghostKingIntro(b) {
    const ai = b.aiCommand.bind(b);
    b.aiCommand = (e) => {
      if (e.id !== 'c1_ghost_king') return ai(e);
      const hands = b.alive('enemy').filter((x) => x.id === 'c1_wgk_hand').length;
      e.c1last = e.c1last || 0;
      if (hands < 2 && b.enemies.some((x) => x.id === 'c1_wgk_hand' && x.dead) && e.turns - e.c1last >= 2 && b.alive('enemy').length < 5) {
        e.c1last = e.turns;
        return { kind: 'skill', skill: 'c1_e_regrow', targets: [e] };
      }
      let c = ai(e);
      for (let i = 0; i < 4 && c.skill === 'c1_e_regrow'; i++) c = ai(e);
      if (c.skill === 'c1_e_regrow') c = { kind: 'attack', targets: [U.pick(b.alive('party'))] };
      return c;
    };
    // 陳伯 acts on his own and never falls
    const pc = b.playerCommand.bind(b);
    b.playerCommand = (u) => {
      if (u.id !== 'chenbo') return pc(u);
      u.c1n = (u.c1n || 0) + 1;
      const foes = b.alive('enemy');
      const king = foes.find((x) => x.id === 'c1_ghost_king') || foes[0];
      if (u.gauge >= 100) return Promise.resolve({ kind: 'ultimate', skill: 'c1_u_chenbo', targets: foes });
      if (u.hp < u.mhp * 0.25) return Promise.resolve({ kind: 'defend' });
      const grabbed = b.party.find((p) => !p.dead && p.st.stun && p.c1grabBy && !p.c1grabBy.dead);
      if (grabbed) { b.say('陳伯：「放開！」', 1.2); return Promise.resolve({ kind: 'skill', skill: 'c1_cb_du', targets: [grabbed.c1grabBy] }); }
      if (u.c1n % 3 === 0) { b.say('陳伯：「黑水茫茫，莫再回頭！」', 1.6); return Promise.resolve({ kind: 'skill', skill: 'c1_cb_du', targets: [king] }); }
      return Promise.resolve({ kind: 'skill', skill: 'c1_cb_sweep', targets: foes });
    };
    const dmg = b.damage.bind(b);
    b.damage = (tg, d, o) => {
      if (tg.side === 'party' && tg.id === 'chenbo' && d >= tg.hp) {
        d = tg.hp - 1;
        if (d <= 0) { b.popText(tg, '撐住', '#d8d0b0'); return; }
      }
      return dmg(tg, d, o);
    };
    const kill = b.kill.bind(b);
    b.kill = (u) => {
      kill(u);
      if (u.id === 'c1_wgk_hand') for (const p of b.party) if (p.c1grabBy === u) { delete p.st.stun; p.c1grabBy = null; b.popText(p, '掙脫了！', '#ffe8a0'); }
    };
    const ps = b.performSkill.bind(b);
    b.performSkill = async (u, s, targets, id) => {
      await ps(u, s, targets, id);
      if (id === 'c1_e_grab') for (const tg of targets) if (tg.st.stun) { tg.c1grabBy = u; b.say(`冰冷的手抓住了${tg.name}！`, 1.4); }
      if (id === 'bz_duhun') {
        const k = b.enemies.find((e) => e.id === 'c1_ghost_king' && !e.dead);
        if (k && (k.c1calm || 0) < 3) {
          k.c1calm = (k.c1calm || 0) + 1;
          k.atk = Math.round(k.d.atk * (1 - 0.15 * k.c1calm));
          b.popText(k, '怨氣消散', '#bfe8ff');
          b.say('一張溺死者的臉安靜下來，化作一點光，漂走了。', 2);
          await b.wait(1);
        }
      }
    };
    return (async () => {
      b.say('水鬼王從霧裡站了起來！', 1.4);
      await b.wait(1);
      await tutorial('tut_guest');
    })();
  }
  async function ghostKingTurn(b, u) {
    // 「抓」: 6% max HP each turn while held
    if (u.side === 'party' && u.st.stun && u.c1grabBy && !u.c1grabBy.dead) {
      b.damage(u, Math.max(1, Math.round(u.mhp * 0.06)), { color: '#8fd0ff' });
      await b.wait(0.3);
    }
    if (F('ch1_yinghuo') || u.side !== 'party' || b.rounds < 2) return;
    // 螢火
    S_flag('ch1_yinghuo');
    await b.say2('chenbo:serious', '星河！接著！');
    G.Audio.sfx('item');
    equipYinghuo();
    const xh = b.party.find((p) => p.id === 'xinghe');
    if (xh) {
      const st = G.Party.stats('xinghe');
      xh.atk = st.atk; xh.elem = st.elem; xh.luk = st.luk;
      b.fx.push(new G.FX.Burst({ x: xh.x, y: xh.y - 80, n: 40, color: ['#ffd080', '#ff9a4a', '#fff0c0'], speed: 220, life: 1.2, gravity: -40 }));
    }
    G.Render.doFlash('#ffcf8a', 0.5, 0.6);
    b.say('布包散開——裡面是一把劍。劍身映著暖暖的橘紅色光，像夏夜的螢火。', 2.4);
    await b.wait(1.4);
    await b.say2('chenbo:serious', '它叫「螢火」。本來要等你十八歲生日才給你。');
    await b.say2('xinghe:surprise', '我的生日……');
    await b.say2('chenbo:normal', '就是今暝。十八年前，放水燈那暝。');
    await b.say2('xinghe:think', '……');
    await b.say2('xinghe:smile', '……多謝，陳伯。');
    await b.say2('chenbo:serious', '謝什麼。用給我看。');
    b.say('星河裝備了螢火！', 1.6);
  }
  const S_flag = (k) => { G.state.flags[k] = true; };

  // =================================================================================================== shared art
  // A 水燈頭 (paper lantern house) drawn with the registered water_lantern art, scaled; `water:false` clips
  // away the water reflection so it can stand on a floor / palanquin. `dark` dims it (unlit skeleton).
  function drawHead(ctx, x, y, sc, o, t, opt = {}) {
    const d = G.Objects.get('water_lantern');
    if (!d) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    if (opt.water === false) { ctx.beginPath(); ctx.rect(-60, -140, 120, 140 + 46); ctx.clip(); }
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    d.draw(ctx, -32, -50, Object.assign({ t: 'water_lantern', x: 0, y: 0 }, o), t);
    ctx.restore();
    if (opt.dark) {
      ctx.save(); ctx.globalAlpha = opt.dark; ctx.fillStyle = '#1a1008';
      ctx.beginPath(); ctx.ellipse(x, y - 14 * sc, 26 * sc, 26 * sc, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  // a small floating 水燈 (lotus raft + paper box + flame), colour blends warm → blue with k
  function drawLamp(ctx, x, y, t, seed, k, a = 1, sc = 1) {
    if (a <= 0.01) return;
    const bob = Math.sin(t * 1.7 + seed) * 2;
    const warm = U.mix('#ffb050', BLUE, k), paper = U.mix('#e8a040', '#9fd0ff', k);
    ctx.save();
    ctx.translate(x, y + bob); ctx.scale(sc, sc);
    ctx.globalAlpha *= a;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const w = (12 - i * 2.5) * (0.8 + 0.2 * Math.sin(t * 3 + i + seed));
      ctx.fillStyle = U.rgba(warm, 0.3 - i * 0.06);
      ctx.fillRect(-w + Math.sin(t * 2 + i) * 2, 9 + i * 4, w * 2, 1.5);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(40,26,14,0.75)';
    ctx.beginPath(); ctx.ellipse(0, 6, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = paper;
    ctx.fillRect(-6, -9, 12, 13);
    ctx.fillStyle = U.shade(paper, -0.35); ctx.fillRect(2, -9, 4, 13);
    ctx.fillStyle = '#3a2414'; ctx.fillRect(-7, -11, 14, 2.5);
    const f = 1 + 0.15 * Math.sin(t * 9 + seed);
    ctx.fillStyle = U.mix('#fff2c0', '#e8f8ff', k);
    ctx.beginPath(); ctx.ellipse(0, -3, 3, 4.5 * f, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // apparitions (monster art drawn on the map during cutscenes)
  function drawApps(ctx, t, apps) {
    for (const ap of apps) {
      if (ap.a <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = ap.a;
      ctx.translate(ap.x * T + T / 2, ap.y * T + T - 6 + (1 - (ap.rise == null ? 1 : ap.rise)) * 40 + Math.sin(t * 2.2 + ap.x) * 3);
      if (ap.flip) ctx.scale(-1, 1);
      ctx.scale(ap.sc, ap.sc);
      G.Monsters.draw(ctx, ap.art || 'water_ghost', 0, 0, t + ap.x, { state: ap.state || 'idle', variant: ap.v || 0, phase: ap.phase || 1 });
      ctx.restore();
    }
  }
  function rise(list, app, sec = 1.2) {
    list.push(app);
    app.a = 0; app.rise = 0;
    return lerpTo(app, { a: app.alpha || 0.92, rise: 1 }, sec, 'outCubic');
  }
  // a figure lying down (battle 'ko' pose), e.g. 星河 on the floor or 白芷 on the bed / lantern
  function drawLying(ctx, id, x, y, sc = 0.62, alpha = 1) {
    if (!G.Sprites || !G.Sprites.drawBattle) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    G.Sprites.drawBattle(ctx, id, 'ko', 0, x, y, { scale: sc, shadow: false });
    ctx.restore();
  }

  // @@END@@
})();
