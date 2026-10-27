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
      // he guards when badly hurt, but never while he is the last one standing (he cannot fall, so that would stall)
      if (u.hp < u.mhp * 0.25 && b.alive('party').length > 1 && Math.random() < 0.5) return Promise.resolve({ kind: 'defend' });
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
    if (!d || is3d()) return;
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
    if (is3d()) return;
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
    if (!G.Sprites || !G.Sprites.drawBattle || is3d()) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    G.Sprites.drawBattle(ctx, id, 'ko', 0, x, y, { scale: sc, shadow: false });
    ctx.restore();
  }

  // ------------------------------------------------------------------ 3D field view (G.Map3D)
  // The 3D view paints drawGround/drawOver onto a flat ground decal, which is right for glows on water and
  // chalk marks but not for upright things. With the 3D view on, those are skipped in the decal and mirrored
  // here instead: apparitions → monster billboards, lantern heads → water_lantern models, lying figures → Char3D.
  const is3d = () => { const m = MS(); return !!(m && m.view3d && G.R3 && G.R3.enabled && G.R3.enabled()); };
  function sync3d(view, dt, specs) {
    const R = view._c1 = view._c1 || {};
    const seen = new Set();
    for (const sp of specs) {
      seen.add(sp.key);
      let r = R[sp.key];
      if (!r) {
        try {
          if (sp.mon && G.Models && G.Models.monsterBillboard) { const b = G.Models.monsterBillboard(sp.mon, { height: sp.height || 1.6, variant: sp.v || 0 }); r = { b, root: b.root }; }
          else if (sp.model && G.Models) { const n = G.Models.create(sp.model, sp.o || {}); r = n ? { root: n } : { dead: true }; }
          else if (sp.char && G.Char3D && G.Char3D.has(sp.char)) {
            const c = G.Char3D.create(sp.char, { context: 'cutscene' });
            r = { c, root: c.root };
            if (sp.anim) { try { c.play(sp.anim, { loop: true }); } catch (e) { /* clip missing */ } }
          } else r = { dead: true };
        } catch (e) { G.warnOnce('c1 3d ' + sp.key, e); r = { dead: true }; }
        R[sp.key] = r;
        if (r.root) view.scene.add(r.root);
      }
      if (r.dead) continue;
      r.root.visible = sp.a > 0.01;
      r.root.position.set(sp.x, sp.y3 || 0, sp.z);
      if (sp.scale) r.root.scale.setScalar(sp.scale);
      if (r.b) { if (r.b.setOpacity) r.b.setOpacity(Math.min(1, sp.a)); if (r.b.update) r.b.update(dt, view.yaw || 0, view.camera); }
      if (r.c) { try { if (sp.ghost || sp.a < 0.99) r.c.setOpacity(Math.min(1, sp.a), !!sp.ghost); if (sp.yaw != null) r.c.setFacing(sp.yaw); r.c.update(dt, view.yaw || 0, view.camera); } catch (e) { /* optional API */ } }
    }
    for (const k in R) if (!seen.has(k) && R[k].root) R[k].root.visible = false;
  }
  const appSpecs = (list, tag) => list.map((ap, i) => ({ key: tag + i + (ap.art || ''), mon: ap.art || 'water_ghost', v: ap.v || 0, height: ap.sc * 3.4, a: ap.a == null ? 1 : ap.a, x: ap.x + 0.5, z: ap.y + 0.9, y3: (1 - (ap.rise == null ? 1 : ap.rise)) * -0.6 }));
  const headSpec = (key, x, z, sc, a = 1) => ({ key, model: 'water_lantern', x, z, scale: sc, a });

  // =================================================================================================== grid helpers
  function grid(w, h, ch) { const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill(ch)); return g; }
  function fill(g, x, y, w, h, ch) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy] && xx >= 0 && xx < g[yy].length) g[yy][xx] = ch; }
  function put(g, x, y, ch) { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch; }
  const rows = (g) => g.map((r) => r.join(''));
  // interior: 2-thick top wall, 1-thick sides / bottom, door gaps in the bottom wall
  function room(w, h, doors) {
    const g = grid(w, h, '_');
    fill(g, 0, 0, w, 2, 'W'); fill(g, 0, 0, 1, h, 'W'); fill(g, w - 1, 0, 1, h, 'W'); fill(g, 0, h - 1, w, 1, 'W');
    for (const dx of doors || []) g[h - 1][dx] = '_';
    return g;
  }
  // a window painted on a wall face (x0..x0+n-1 on row y): sky / sea depending on the time of day
  function drawWindows(ctx, cells, t) {
    if (is3d()) return;
    const p = phase();
    const sky = { P1: ['#b8d4ec', '#f4e2c0'], P2: ['#8ec4ec', '#d8ecf6'], P3: ['#f0a860', '#ffd890'], PX: ['#5a3a6a', '#e08050'], P4: ['#050a1e', '#0e1838'], P5: ['#8a96a6', '#b8c0c8'] }[p];
    const sea = { P1: '#5a86a8', P2: '#3a7ab0', P3: '#d89040', PX: '#6a3a50', P4: '#060c1e', P5: '#5a6a7a' }[p];
    for (const [cx, cy] of cells) {
      const x = cx * T + 8, y = cy * T + 18, w = T - 16, h = 38;
      ctx.save();
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, sky[0]); g.addColorStop(0.62, sky[1]); g.addColorStop(0.63, sea); g.addColorStop(1, U.shade(sea, -0.3));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      // 基隆山 silhouette
      ctx.fillStyle = U.rgba(U.shade(sea, -0.45), 0.8);
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.63); ctx.quadraticCurveTo(x + w * 0.35, y + h * 0.25, x + w * 0.7, y + h * 0.63); ctx.fill();
      if (p === 'P4') for (let i = 0; i < 4; i++) glow(ctx, x + U.hash(cx, i, 3) * w, y + h * 0.75, 3, BLUE, 0.7);
      if (p === 'P5') { ctx.strokeStyle = 'rgba(220,230,240,0.5)'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const rx = x + ((t * 40 + i * 9) % w); ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx - 3, y + h); ctx.stroke(); } }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 4, y + h, w + 8, 4);
      ctx.restore();
    }
  }
  const interiorLight = (day, night) => (st) => (isNight(st) || phase(st) === 'PX' ? night : day);
  const notNight = (st) => !['P4', 'PX'].includes(phase(st));

  // =================================================================================================== 1.1 閣樓
  const FX2F = { lying: false };
  G.Maps.define('jiufen_shop_2f', {
    name: '陳記燈籠舖・閣樓',
    place: 'jiufen',
    bgm: (st) => (st.flags.ch1_start ? (isNight(st) ? 'night' : 'jiufen') : null),
    start: [5, 5],
    light: (st) => (isNight(st) ? { ambient: 0.75, color: '#05081a', playerR: 170 } : { ambient: 0.12, color: '#30283a', tint: 'rgba(255,220,170,0.1)' }),
    particles: (st) => (isNight(st) ? [] : ['motes']),
    tiles: rows(room(12, 9, [])),
    objects: (st) => [
      { t: 'bed', x: 2, y: 2 },
      { t: 'shelf_lanterns', x: 8, y: 2, w: 3, v: 1 },
      { t: 'table', x: 6, y: 3 },
      { t: 'lantern_rack', x: 2, y: 6 },
      { t: 'lantern_frame', x: 5, y: 6 },
      { t: 'paper_stack', x: 6, y: 6 },
      { t: 'chair', x: 7, y: 3, dir: 'left' },
      { t: 'broom', x: 10, y: 6 },
      { t: 'stairs_down', x: 9, y: 7 },
      { t: 'plant_pot', x: 1, y: 7, v: 1 },
    ],
    chests: [{ id: 'ch1_c_2f', x: 10, y: 4, item: 'caozaiguo', n: 2 }],
    lights: (st) => (isNight(st) ? [{ x: 9, y: 2, r: 140, color: '#ffb060', flicker: 0.3 }] : [{ x: 6, y: 2, r: 260, color: '#ffe9b0', flicker: 0.05 }]),
    warps: [{ x: 9, y: 7, to: 'jiufen_shop', tx: 13, ty: 3, tdir: 'down' }],
    onEnter: (S) => { liveBg(MS()); FX2F.lying = false; },
    drawGround: (ctx, t) => {
      drawWindows(ctx, [[4, 1], [5, 1]], t);
      if (FX2F.lying) { const p = MS().player; drawLying(ctx, 'xinghe', p.px + 6, p.py + 6); }
    },
    drawOver: (ctx, t) => drawHead(ctx, 6.5 * T, 3.35 * T, 0.62, { color: '#d8c8a0', text: '平安' }, t, { water: false }),
    update3d: (view, dt) => { const p = MS().player; sync3d(view, dt, [headSpec('lamp', 6.5, 3.5, 0.55), { key: 'lying', char: 'xinghe', anim: 'ko', x: p.px / T, z: p.py / T, a: FX2F.lying ? 1 : 0 }]); },
    events: [
      { id: 'wake', trigger: 'auto', if: (st) => !st.flags.ch1_start, run: (S) => wakeUp(S, false) },
      { id: 'bed', trigger: 'action', x: 2, y: 2, h: 2, label: '調查', run: async (S) => {
        if (F('ch1_start')) await S.say('', '星河的床。被子捲成一團，竹劍也在被窩裡。');
        if (isNight() || phase() === 'PX') { await S.say('xinghe:serious', '……現在不是睡覺的時候。'); return; }
        const c = await S.choice(['睡一下（完全恢復）', '不用了'], { cancel: 1 });
        if (c !== 0) return;
        await S.fadeOut(0.6); S.healParty(); await wait(S, 0.6); await S.fadeIn(0.6);
        S.toast('睡了一下，精神飽滿。', 'lantern');
      } },
      { id: 'window', trigger: 'action', x: 4, y: 1, w: 2, label: '窗外', run: async (S) => {
        const p = phase();
        if (p === 'P3' || p === 'PX') await S.say('', '斜陽把整片海染成金色。今晚，那片海上會漂滿水燈。');
        else if (p === 'P5') await S.say('', '下著細雨。海是灰色的。');
        else if (p === 'P4') await S.say('', '外面的霧好濃。豎崎路上的燈籠，一盞一盞，變成了藍色。');
        else await S.say('', '九份的早晨。霧從山坳裡慢慢退下去，遠遠看得到雞籠的海。');
      } },
      { id: 'small_lantern', trigger: 'action', x: 6, y: 3, label: '調查', run: async (S) => {
        await S.say('', '一盞舊得發黃的小水燈。紙已經補過好幾次了。');
        if (!F('ch1_seen_lantern')) {
          S.flag('ch1_seen_lantern');
          await S.say('xinghe:smile', '我小時候就躺在這裡面漂上岸的。');
          await S.say('xinghe:laugh', '陳伯說撿到我的時候，我睡得跟豬一樣，還流口水。');
        }
      } },
      { id: 'shelf', trigger: 'action', x: 8, y: 2, w: 3, label: '調查', run: (S) => S.say('', '各式各樣做到一半的燈籠。有幾盞的竹骨是星河紮的——歪的那幾盞。') },
    ],
  });

  // 1-1 跌下床
  async function wakeUp(S, fromChapter) {
    const ms = MS();
    S.flag('ch1_start');
    G.state.vars.objective = null;
    FX2F.lying = true;
    S.show('player', false);
    S.setPos('player', 5, 4, 'down');
    ms.snapCamera();
    S.bgm(null, { fade: 0.3 });
    if (fromChapter) await S.fadeIn(dur(1.4));
    await wait(S, 0.6);
    await S.say('xinghe:hurt', '……痛痛痛。');
    S.shake(3, 0.2);
    await S.say('chenbo:angry', '星河！日頭曬尻川了！', { noPortrait: true });
    await S.say('chenbo:angry', '今仔日七月十四，你是要睏到普渡喔！', { noPortrait: true });
    await S.say('xinghe:normal', '來了來了——');
    FX2F.lying = false;
    S.show('player', true);
    await S.jump('player', 14);
    S.face('player', 'down');
    await wait(S, 0.5);
    S.emote('player', '…', 1.6);
    await wait(S, 1.2);
    await S.say('xinghe:think', '……又是那個夢。');
    await S.say('xinghe:think', '黑色的海、燈做的橋，還有那個女生……');
    await S.say('xinghe:think', '「別再來找我了」……我根本不認識她啊。');
    await S.say('xinghe:sad', '為什麼每次醒來，都這麼難過。');
    S.shake(4, 0.25);
    await S.say('chenbo:angry', '沈・星・河！', { noPortrait: true });
    S.emote('player', '!');
    await S.say('xinghe:surprise', '來了啦！');
    await S.titleCard(G.Chapters[1], '七月十四・放水燈');
    S.bgm('jiufen');
    MS().banner = 0.001;
    await tutorial('tut_move');
    await tutorial('tut_talk');
    S.objective('下樓找陳伯');
  }

  // =================================================================================================== 1.2 陳記燈籠舖
  const FXS = { blue: [], bzLying: false, cbLying: false, apps: [] };
  const shopTiles = (() => { const g = room(16, 12, [7]); fill(g, 12, 2, 1, 4, 'W'); return rows(g); })();
  G.Maps.define('jiufen_shop', {
    name: '陳記燈籠舖',
    place: 'jiufen',
    bgm: (st) => (st.flags.ch1_chenbo_hurt && !st.flags.ch1_morning_after ? 'sad' : isNight(st) || phase(st) === 'PX' ? 'night' : 'jiufen'),
    start: [7, 9],
    light: interiorLight({ ambient: 0.06, color: '#30283a', tint: 'rgba(255,210,160,0.08)' }, { ambient: 0.62, color: '#05081a', playerR: 160 }),
    particles: (st) => (isNight(st) ? [] : ['motes']),
    tiles: shopTiles,
    objects: (st) => [
      { t: 'shelf_lanterns', x: 1, y: 2, w: 3, v: 0 },
      { t: 'shelf_lanterns', x: 8, y: 2, w: 3, v: 2 },
      { t: 'mural', x: 5, y: 1, v: 2 },
      { t: 'workbench', x: 4, y: 4 },
      { t: 'paper_stack', x: 3, y: 4 },
      { t: 'lantern_frame', x: 6, y: 4 },
      // the 陳 clan 水燈頭 skeleton (drawn in drawGround; this keeps it solid) — gone to 雞籠 from P3
      { key: 'skeleton', t: 'paper_stack', x: 8, y: 5, w: 3, h: 2, solid: true, alpha: 0, if: (s) => !s.flags.ch1_mine_done },
      { t: 'lantern_rack', x: 1, y: 7 },
      { t: 'counter', x: 3, y: 8, w: 4 },
      { t: 'jar', x: 1, y: 9 }, { t: 'barrel', x: 1, y: 10 }, { t: 'broom', x: 14, y: 10 },
      { t: 'red_lantern', x: 10, y: 9, hang: true, color: isNight(st) ? '#4d7ab8' : '#d42f25', text: '陳' },
      { t: 'stairs_up', x: 13, y: 2 },
      { t: 'bed', x: 14, y: 3 },
      { t: 'cabinet', x: 14, y: 7 },
      { t: 'brazier', x: 13, y: 8, if: (s) => isNight(s) },
      { t: 'plant_pot', x: 11, y: 10, v: 0 },
    ],
    lights: (st) => {
      const out = [];
      if (isNight(st)) out.push({ x: 13, y: 5, r: 140, color: '#ffb060', flicker: 0.3 });
      for (const b of FXS.blue) out.push({ x: b.x, y: b.y, r: 90 * b.a, color: '#bfe6ff', flicker: 0.2 });
      return out;
    },
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', x: 5, y: 3, dir: 'down', fixedDir: false,
        if: (st) => ['P1', 'P2', 'P3'].includes(phase(st)), talk: (S) => chenboTalk(S) },
    ],
    warps: [
      { x: 7, y: 11, to: 'jiufen', tx: 23, ty: 30, tdir: 'down', door: true, run: async (S) => {
        if (F('ch1_start') && !F('ch1_errands')) return false;
        if (F('ch1_chenbo_hurt') && !F('ch1_morning_after')) { await S.say('xinghe:sad', '……天還沒亮。先陪著陳伯吧。'); return false; }
        return true;
      } },
      { x: 13, y: 2, to: 'jiufen_shop_2f', tx: 9, ty: 6, tdir: 'up' },
    ],
    onEnter: (S) => {
      liveBg(MS());
      FXS.blue = []; FXS.apps = [];
      FXS.bzLying = F('ch1_baizhi_found') && !F('ch1_baizhi_wake');
      FXS.cbLying = F('ch1_chenbo_hurt');
    },
    drawGround: (ctx, t) => {
      if (!F('ch1_mine_done')) drawHead(ctx, 9.5 * T, 6.85 * T, 1.45, { color: '#c9302a', text: '陳姓' }, t, { water: false, dark: 0.25 });
      if (FXS.bzLying) drawLying(ctx, 'baizhi', 14.5 * T, 4.2 * T, 0.55);
      if (FXS.cbLying) drawLying(ctx, 'chenbo', 14.5 * T, 4.2 * T, 0.55);
    },
    update3d: (view, dt) => sync3d(view, dt, [
      headSpec('skeleton', 9.5, 6.2, 1.5, F('ch1_mine_done') ? 0 : 1),
      { key: 'bz', char: 'baizhi', anim: 'sleep', x: 14.5, z: 4, y3: 0.55, a: FXS.bzLying ? 1 : 0 },
      { key: 'cb', char: 'chenbo', anim: 'sleep', x: 14.5, z: 4, y3: 0.55, a: FXS.cbLying ? 1 : 0 },
    ].concat(appSpecs(FXS.apps, 'a'))),
    drawOver: (ctx, t) => {
      drawApps(ctx, t, FXS.apps);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of FXS.blue) { glow(ctx, b.x * T + 32, b.y * T + 10, 34, '#9fd8ff', b.a * 0.9); glow(ctx, b.x * T + 32, b.y * T + 10, 10, '#ffffff', b.a); }
      ctx.restore(); ctx.globalAlpha = 1;
    },
    events: [
      { id: 'errands', trigger: 'auto', if: (st) => st.flags.ch1_start && !st.flags.ch1_errands, run: (S) => scene12(S) },
      { id: 'home_night', trigger: 'auto', if: (st) => st.flags.ch1_baizhi_found && !st.flags.ch1_home_night, run: (S) => scene14(S) },
      { id: 'wake_night', trigger: 'auto', if: (st) => st.flags.ch1_home_night && !st.flags.ch1_baizhi_wake, run: (S) => scene15(S) },
      { id: 'reveal', trigger: 'auto', if: (st) => st.flags.ch1_chenbo_hurt && !st.flags.ch1_reveal, run: (S) => scene22(S) },
      { id: 'morning', trigger: 'auto', if: (st) => st.flags.ch1_reveal && !st.flags.ch1_morning_after, run: (S) => scene23a(S) },
      { id: 'workbench', trigger: 'action', x: 4, y: 4, w: 2, label: '調查', run: (S) => S.say('', '紙、竹篾、漿糊、毛筆。陳伯的手藝，九份沒人比得上。') },
      { id: 'skeleton', trigger: 'action', x: 8, y: 5, w: 3, h: 2, label: '調查', if: (st) => !st.flags.ch1_mine_done, run: (S) => S.say('', '三層樓高的紙厝，飛簷、窗櫺、門神都畫好了，只差最後一層紙。') },
      { id: 'drawer', trigger: 'action', x: 3, y: 8, w: 4, label: '抽屜', run: async (S) => {
        if (F('ch1_reveal')) await S.say('', '陳伯藏酒的地方。……還是別動。');
        else await S.say('', '櫃檯後的抽屜。鎖著。');
      } },
      { id: 'back_bed', trigger: 'action', x: 14, y: 3, h: 2, label: '調查', run: async (S) => {
        if (phase() === 'P5') { await chenboBed(S); return; }
        if (phase() === 'P4') {
          await S.say('', '陳伯的床。陳伯不在。');
          const c = await S.choice(['躺一下（完全恢復）', '不用了'], { cancel: 1 });
          if (c !== 0) return;
          await S.fadeOut(0.5); S.healParty(); await wait(S, 0.5); await S.fadeIn(0.5);
          S.toast('稍微喘了一口氣。全員完全恢復。', 'lantern');
          return;
        }
        await S.say('', '陳伯的床。疊得整整齊齊，跟星河的完全相反。');
      } },
      { id: 'shelves', trigger: 'action', x: 1, y: 2, w: 3, label: '調查', run: (S) => S.say('', '一排排做好的燈籠。紅的、白的、繪著花鳥的……陳記燈籠，九份第一。') },
    ],
  });

  async function chenboTalk(S) {
    const p = phase();
    if (p === 'P1') {
      const left = [['ch1_err_tea', '茶樓的燈籠'], ['ch1_err_oil', '雜貨店的燈油'], ['ch1_err_fude', '福德祠的供品']].filter(([f]) => !F(f));
      if (!left.length) { await scene14noon(S); return; }
      if (left.length === 3) {
        await S.say('chenbo:angry', '茶樓的燈籠、雜貨店的燈油、福德祠的供品——');
        await S.say('chenbo:angry', '三項。你是要我用唱的，你才記得？');
      } else if (left.length === 2) {
        await S.say('chenbo:normal', `還差兩項：${left[0][1]}、${left[1][1]}。`);
        await S.say('chenbo:angry', '莫在這摸魚。');
      } else await S.say('chenbo:normal', `還差一項：${left[0][1]}。莫拖。`);
    } else if (p === 'P2') {
      await S.say('chenbo:serious', '還站在這？阿黃在礦坑內底！提燈顧好，莫走太深。');
    } else if (p === 'P3') {
      if (talked('chenbo_P3') === 1) {
        await S.say('chenbo:normal', '轉來啦？……沒受傷就好。');
        await S.say('chenbo:think', '傍晚出發去雞籠。要準備什麼，趕緊。');
        return;
      }
      const c = await S.choice(['出發去雞籠', '再等一下'], { cancel: 1 });
      if (c !== 0) { await S.say('chenbo:normal', '日頭落山前，攏要到雞籠。'); return; }
      await S.say('chenbo:serious', '出了九份，今暝就攏在外口了。該帶的帶，該講的講。');
      const c2 = await S.choice(['真的要出發了（九份的支線會暫停到明天早上）', '再準備一下'], { cancel: 1 });
      if (c2 !== 0) return;
      await scene19(S);
    }
  }
  async function chenboBed(S) {
    if (talked('chenbo_P5') === 1) {
      await S.say('chenbo:hurt', '免看了，死不去。');
      await S.say('chenbo:normal', '林大夫的藥苦得要命，我寧可給墨鴉再插一支毛。');
      await S.say('chenbo:serious', '要走就趁早。霧林……趁日頭還在的時候過。');
    } else await S.say('chenbo:sad', '……星河。記得，轉來食飯。');
  }

  // 1-2 陳伯的三件差事
  async function scene12(S) {
    const ms = MS();
    S.setPos('player', 13, 3, 'down');
    const cb = ms.actor('chenbo');
    if (cb) { cb.setCell(5, 3); cb.dir = 'down'; }
    ms.snapCamera();
    await S.move('player', 'DDDLL');
    S.face('player', 'left');
    await S.say('chenbo:angry', '終於醒了。我以為你要跟好兄弟一起出來吃普渡。');
    S.face('chenbo', 'player');
    await S.say('xinghe:smile', '早，陳伯。……哇，水燈頭做好了？');
    await camTo(9, 5.5, 0.9);
    await wait(S, 0.4);
    await S.say('chenbo:smug', '還差最後一層紙。今年主普是咱陳姓，這盞要扛去雞籠打頭陣。');
    await S.say('xinghe:smile', '讓我扛！我力氣很大！');
    await S.say('chenbo:normal', '你？你會把它扛去撞牆。');
    await S.say('xinghe:laugh', '上次那是牆自己跑出來的。');
    S.emote('chenbo', '💢');
    await S.say('chenbo:angry', '……');
    await camBack(S, 0.6);
    await S.say('chenbo:normal', '做事。三項。');
    await S.say('chenbo:normal', '一，茶樓訂的四盞燈籠，送去給鄭頭家。');
    await S.say('chenbo:normal', '二，去阿財那邊買一甕燈油。今暝要點的燈多。');
    await S.say('chenbo:normal', '三，供品籃提去福德祠，跟添丁伯一起拜土地公。');
    await S.say('chenbo:serious', '先拜土地公，暗時才拜好兄弟。順序莫亂。');
    S.sfx('coin');
    S.gold(100);
    await S.give('c1_tea_lanterns', 1);
    await S.give('c1_offering', 1);
    await S.say('chenbo:normal', '燈油四十文。剩的你自己留著，買個早頓。');
    await S.say('xinghe:laugh', '陳伯最好了！');
    await S.say('chenbo:angry', '去！');
    await S.move('player', 'DDD');
    await wait(S, 0.3);
    S.face('player', 'up');
    await S.say('xinghe:think', '……陳伯。我又做那個夢了。');
    await S.say('chenbo:normal', '什麼夢。');
    await S.say('xinghe:think', '黑色的海，燈做的橋。還有一個白衫的女生，叫我的名字。');
    S.emote('chenbo', '…', 2);
    await wait(S, 1.0);
    await S.say('', '陳伯手上的毛筆停住了。一滴墨，落在紙上。');
    await S.say('chenbo:think', '……');
    await S.say('chenbo:normal', '夢就是夢。去做事。');
    await S.say('xinghe:normal', '喔……');
    S.face('player', 'down');
    await camTo(5, 3, 0.6);
    await wait(S, 1.5);
    await camBack(S, 0.5);
    S.flag('ch1_errands');
    S.objective('完成陳伯交代的三件差事');
  }
  function errandsCheck(S) {
    if (F('ch1_err_tea') && F('ch1_err_oil') && F('ch1_err_fude')) S.objective('回燈籠舖向陳伯報告');
  }

  // 1-4 食飽未？——阿黃不見了
  async function scene14noon(S) {
    const ms = MS();
    await S.say('chenbo:normal', '三項都做好了？');
    if (S.hasItem('c1_lamp_oil')) S.take('c1_lamp_oil', 1);
    await S.say('xinghe:smug', '當然！還有，福德祠的香煙往海邊飄，添丁伯說今暝要小心。');
    await S.say('chenbo:think', '……');
    await S.say('chenbo:normal', '知道了。');
    await S.say('chenbo:normal', '食飽未？');
    await S.say('xinghe:laugh', '還沒！');
    await S.say('chenbo:normal', '灶腳有番薯糜。吃完幫我糊最後一層紙。');
    await S.fadeOut(dur(0.8));
    S.setPos('player', 6, 5, 'left');
    const cb = ms.actor('chenbo');
    if (cb) { cb.setCell(5, 5); cb.dir = 'right'; }
    ms.snapCamera();
    S.toast('正午', 'lantern');
    await wait(S, 0.8);
    await S.fadeIn(dur(0.8));
    await wait(S, 0.8);
    S.sfx('door'); S.shake(4, 0.25);
    const xj = S.spawn({ id: 'xiaojin_run', sprite: 'child_m', x: 7, y: 10, dir: 'up', speed: 4.4 });
    void xj;
    await S.say('小金', '星河哥！星河哥！');
    await S.move('xiaojin_run', 'UUU');
    S.face('player', 'down'); S.face('chenbo', 'down');
    await S.say('xinghe:surprise', '小金？怎麼了？');
    await S.say('xiaojin:cry', '阿黃……阿黃跑進舊礦坑了！');
    await S.say('xiaojin:cry', '木板被牠撞破一個洞，我叫牠，牠都不出來……');
    await S.say('xiaojin:cry', '裡面好黑，我不敢進去……阿爸去上工了……');
    await S.say('chenbo:serious', '舊坑？三年前坍方那個？');
    await S.say('xinghe:serious', '我去。');
    S.face('player', 'left');
    await S.say('chenbo:angry', '你——');
    await wait(S, 0.8);
    await S.say('', '陳伯瞪著星河。星河看著他，沒有退。');
    await S.say('chenbo:serious', '……');
    S.sfx('item');
    await S.say('', '陳伯從櫃檯後拿出一盞手提燈籠，丟給星河。');
    await S.give('c1_lantern', 1);
    await S.say('chenbo:serious', '提燈帶著。坑裡烏趖趖，燈熄了就摸著牆走出來。');
    await S.say('chenbo:serious', '看到阿黃就出來。不准往深的地方走。聽到沒？');
    await S.say('xinghe:smile', '聽到了！');
    await S.say('chenbo:serious', '還有，你那支竹劍——');
    await S.say('xinghe:smug', '帶著呢！');
    await S.say('chenbo:sad', '……我是要叫你，莫拿竹劍去跟人家拚。');
    await S.say('', '小金拉著星河的袖子衝出門。');
    S.move('xiaojin_run', 'DDD', { wait: false });
    await S.move('player', 'RDDDD');
    S.remove('xiaojin_run');
    S.flag('ch1_ahuang_lost');
    S.objective('到九份東邊的舊礦坑口');
    await S.warp('jiufen', 23, 30, 'down');
  }

  // =================================================================================================== 1.4 茶樓「聽雨樓」
  const teaTiles = rows(room(20, 14, [10]));
  G.Maps.define('jiufen_teahouse', {
    name: '茶樓「聽雨樓」',
    place: 'jiufen',
    bgm: 'jiufen',
    start: [10, 12],
    light: { ambient: 0.1, color: '#2a1c18', tint: 'rgba(255,200,140,0.1)', glow: 0.35 },
    particles: ['dust'],
    tiles: teaTiles,
    objects: [
      { t: 'rug', x: 9, y: 2, w: 3, h: 2 },
      { t: 'table', x: 10, y: 3, counter: true },
      { t: 'mural', x: 8, y: 1, v: 3 }, { t: 'mural', x: 11, y: 1, v: 1 },
      { t: 'table', x: 3, y: 6, w: 2 }, { t: 'chair', x: 2, y: 6, dir: 'right' }, { t: 'chair', x: 5, y: 6, dir: 'left' },
      { t: 'table', x: 8, y: 7, w: 2 }, { t: 'chair', x: 7, y: 7, dir: 'right' }, { t: 'chair', x: 10, y: 7, dir: 'left' },
      { t: 'table', x: 13, y: 6, w: 2 }, { t: 'chair', x: 12, y: 6, dir: 'right' },
      { t: 'table', x: 3, y: 10, w: 2 }, { t: 'chair', x: 2, y: 10, dir: 'right' }, { t: 'chair', x: 5, y: 10, dir: 'left' },
      { t: 'table', x: 8, y: 10, w: 2 }, { t: 'chair', x: 7, y: 10, dir: 'right' },
      { t: 'table', x: 14, y: 10, w: 2 }, { t: 'chair', x: 16, y: 10, dir: 'left' },
      { t: 'tea_set', x: 1, y: 3 }, { t: 'tea_set', x: 17, y: 8 },
      { t: 'counter', x: 15, y: 4, w: 4 },
      { t: 'jar_row', x: 15, y: 2, w: 2 }, { t: 'cabinet', x: 18, y: 2 },
      { t: 'plant_pot', x: 1, y: 12, v: 2 }, { t: 'plant_pot', x: 18, y: 12, v: 0 },
      { t: 'lantern_string', x: 2, y: 5, w: 16, lift: 70 },
      { t: 'red_lantern', x: 6, y: 2, hang: true, text: '茶' }, { t: 'red_lantern', x: 13, y: 2, hang: true, text: '雨' },
    ],
    npcs: [
      { id: 'abing', sprite: 'storyteller', portrait: 'abing', x: 10, y: 2, dir: 'down', fixedDir: true, talk: (S) => abingTalk(S) },
      { id: 'zheng', sprite: 'merchant', name: '鄭頭家', x: 17, y: 3, dir: 'down', talk: (S) => zhengTalk(S) },
      { id: 'chuntao', sprite: 'tea_girl', name: '春桃', x: 11, y: 8, dir: 'down', wander: 3, talk: (S) => chuntaoTalk(S) },
      { id: 'xiucai', sprite: 'scholar', name: '王秀才', x: 4, y: 5, dir: 'down', talk: (S) => xiucaiTalk(S) },
      { id: 'ahai', sprite: 'old_m', name: '阿海伯', x: 13, y: 10, dir: 'right', talk: (S) => ahaiTalk(S) },
      { id: 'awang_t', sprite: 'miner', name: '阿旺', x: 12, y: 7, dir: 'down', if: (st) => phase(st) === 'P1', talk: (S) => awangTalk(S) },
      { id: 'guest1', sprite: 'villager_m2', name: '茶客', x: 9, y: 8, dir: 'up', if: (st) => ['P1', 'P2'].includes(phase(st)),
        talk: ['列位看官、列位看官……我也想說一次看看。'] },
      { id: 'mochi', sprite: 'mochi', name: '三花貓', x: 18, y: 8, dir: 'left', if: (st) => !st.flags.mochi_joined,
        talk: (S) => S.say('', '一隻蓬鬆的大三花貓，窩在窗邊的光裡，尾巴像一支雞毛撢子。牠懶懶地瞇著眼。') },
      { id: 'yuyuan_cat', sprite: 'yuyuan', name: '灰虎斑貓', x: 18, y: 9, dir: 'left', if: (st) => !st.flags.yuyuan_joined,
        talk: async (S) => { S.emote('yuyuan_cat', '…'); await S.say('', '一隻胖得像米袋的灰虎斑貓。牠面無表情地盯著你，好像你欠牠一條魚。'); } },
      { id: 'guest2', sprite: 'villager_f', name: '茶客', x: 4, y: 11, dir: 'up', if: (st) => phase(st) !== 'P3',
        talk: ['阿炳伯講的故事，我聽了三十年，還是愛聽。'] },
    ],
    warps: [{ x: 10, y: 13, to: 'jiufen', tx: 15, ty: 24, tdir: 'down', door: true }],
    onEnter: () => {
      liveBg(MS());
      if (F('ch1_err_tea')) V().c1_tea_entries = (V().c1_tea_entries || 0) + 1;
    },
    drawGround: (ctx, t) => drawWindows(ctx, [[2, 1], [3, 1], [15, 1]], t),
    events: [
      { id: 'tea_errand', trigger: 'auto', if: (st) => st.inv.c1_tea_lanterns > 0 && !st.flags.ch1_err_tea, run: (S) => scene13a(S) },
      { id: 'xingmu_start', trigger: 'auto', once: true,
        if: (st) => st.flags.ch1_err_tea && (st.vars.c1_tea_entries || 0) >= 1 && !st.quests.q_xingmu && ['P1', 'P2', 'P3'].includes(phase(st)),
        run: (S) => xingmuStart(S) },
      { id: 'cats', trigger: 'auto', if: (st) => st.flags.ch1_yuyuan && !st.flags.mochi_joined && st.party.includes('baizhi'), run: (S) => sceneCats(S) },
      { id: 'windows_w', trigger: 'action', x: 0, y: 3, h: 7, label: '窗外', run: teaWindow },
      { id: 'windows_n', trigger: 'action', x: 2, y: 1, w: 2, label: '窗外', run: teaWindow },
    ],
  });
  // 1-23d 麻糬與芋圓 — the teahouse's bonded pair of cats adopt 白芷 and 星河
  async function sceneCats(S) {
    const ms = MS();
    S.setPos('player', 10, 11, 'up');
    const bz = ms.actor('baizhi');
    if (bz) { bz.setCell(11, 11); bz.dir = 'up'; bz.scripted = true; }
    ms.snapCamera();
    cineOn();
    await S.say('', '茶樓角落，兩隻大貓窩在一起。一隻蓬鬆的三花，一隻胖得像米袋的灰虎斑。');
    await S.say('鄭頭家', '星河！姑娘！聽講你們今仔日要出門？');
    S.face('mochi', 'baizhi');
    S.emote('mochi', '…', 1.6);
    await S.say('', '三花貓抬起頭，盯著白芷看了很久。牠的眼睛裡，映著她身上那一點淡淡的光。');
    await S.walkTo('mochi', 11, 10);
    S.face('mochi', 'down');
    S.emote('mochi', '♥');
    await S.say('', '牠走過來，用頭頂了頂白芷的手。一下，又一下。');
    await S.say('baizhi:surprise', '……牠在推我。');
    await S.say('xinghe:laugh', '是在討摸啦。');
    await S.say('baizhi:smile', '白白的、軟軟的、圓圓的……像阿柑姨說的那個——麻糬。');
    await S.say('baizhi:smile', '妳叫麻糬，好不好？');
    await S.say('麻糬', '喵。');
    await S.walkTo('yuyuan_cat', 10, 10);
    S.face('yuyuan_cat', 'down');
    S.emote('yuyuan_cat', '…', 1.8);
    S.sfx('push');
    await S.say('', '灰虎斑貓慢吞吞地走過來，看了星河一眼——然後一屁股坐上他的腳。');
    S.emote('player', '💢');
    await S.say('xinghe:surprise', '喂！好重！你壓到我的腳了！');
    await S.say('', '灰貓面無表情地看著他。一動也不動。');
    await S.say('鄭頭家', '奇怪……這兩隻在茶樓三年，誰抱都不給抱，連我都會被抓。');
    await S.say('鄭頭家', '三花的選了姑娘，胖的……好像選了你。');
    await S.say('xinghe:angry', '我不要！我們要去很遠的地方，帶兩隻貓怎麼走！');
    await S.say('鄭頭家', '牠們兩隻從來沒分開過。要帶，就攏帶去。');
    await S.say('baizhi:think', '這隻灰灰的、圓圓的，有一點紫……像早上吃的芋圓。');
    await S.say('baizhi:smile', '那牠叫芋圓。');
    await S.say('xinghe:sad', '不要幫牠取名字啊！取了名字就要帶走了啦！');
    S.emote('yuyuan_cat', '…');
    await S.say('', '芋圓打了個呵欠，把下巴擱在星河的鞋子上。');
    await S.say('baizhi:smile', '星河。');
    await S.say('xinghe:think', '……');
    await S.say('xinghe:hurt', '……好啦好啦！路上的魚乾，我出！');
    S.emote('mochi', '♥');
    await S.say('麻糬', '喵。');
    S.remove('mochi'); S.remove('yuyuan_cat');
    S.flag('mochi_joined'); S.flag('yuyuan_joined');
    if (bz) bz.scripted = false;
    S.gather();
    ms.refresh();
    S.sfx('levelup');
    S.toast('{y}麻糬{/}和{y}芋圓{/}跟上了旅程！', 'lantern');
    await cineOff();
    S.objective('跟九份的大家道別，從南邊的山路出發');
  }
  function teaWindow(S) { return S.say('', '從這裡看得到整片海。說書的阿炳伯說，晴天的時候，看得到唐山的方向。……這當然是吹牛。'); }

  // 1-3a 差事：茶樓的燈籠
  async function scene13a(S) {
    const ms = MS();
    S.setPos('player', 10, 12, 'up');
    ms.snapCamera();
    cineOn();
    await camTo(10, 4, 0.8);
    await S.say('abing:serious', '……話說那劍仙，被三十六個山賊團團圍住！');
    await S.say('abing:serious', '刀光劍影，他卻不慌——一劍、一劍，穩穩地接。');
    await S.say('abing:smile', '列位看官，可知這是為什麼？');
    await S.say('abing:serious', '因為他挨的打越多、出的招越多，胸中那口「劍意」就越滿！');
    await S.say('abing:laugh', '滿到頂的那一刻——');
    knock(); S.shake(3, 0.15);
    await wait(S, 0.4);
    await S.say('abing:laugh', '一劍開山！三十六個山賊，攏飛去對面山頂曬日頭啦！');
    S.sfx('coin');
    for (const id of ['guest1', 'guest2', 'xiucai', 'ahai']) S.emote(id, '♪', 1.4);
    await S.say('', '茶客們哄堂大笑、拍手叫好。');
    await camBack(S, 0.6);
    const ct = ms.actor('chuntao');
    if (ct) { ct.setCell(10, 10); ct.dir = 'down'; }
    await S.say('春桃', '上禮拜還是三十個。');
    await S.say('xinghe:laugh', '山賊也是會生的嘛。');
    await S.say('鄭頭家', '星河！燈籠是不是？來來來，拿過來。');
    await cineOff();
    await S.walkTo('player', 14, 10, { yFirst: true });
    await S.walkTo('player', 17, 5, { yFirst: false });
    S.face('player', 'up');
    S.take('c1_tea_lanterns', 1);
    S.sfx('item');
    S.toast('交出了 {y}茶樓的燈籠{/}', 'lantern');
    await S.say('鄭頭家', '陳伯的手藝就是不一樣。你看這竹骨，紮得多勻。');
    await S.say('xinghe:smug', '那盞是我紮的。');
    await S.say('鄭頭家', '……喔，難怪有一盞歪歪的。');
    await S.say('鄭頭家', '哈哈，開玩笑的！拿去，跑腿錢。');
    S.gold(30);
    S.flag('ch1_err_tea');
    errandsCheck(S);
  }

  async function abingTalk(S) {
    const p = phase();
    const c = await S.choice(['聽故事', '閒聊', '不了'], { cancel: 2 });
    if (c === 0) {
      const list = [['九份的由來', storyA], ['劍仙與劍意', storyB]];
      if (['P3', 'P5'].includes(p) || F('ch1_mine_done')) list.push(['雞籠中元祭', storyC]);
      if (G.Quests.isDone('q_xingmu')) list.push(['國姓爺與鶯歌石', storyD]);
      const i = await S.choice(list.map((l) => l[0]).concat(['算了']), { cancel: list.length });
      if (i < list.length) await list[i][1](S);
    } else if (c === 1) {
      if (p === 'P5') {
        await S.say('abing:serious', '昨暝的事，我聽講了。水燈倒轉來、水鬼上山……');
        await S.say('abing:serious', '我講了一世人的故事，第一次聽到這款的。');
        await S.say('abing:smile', '少年仔，你要出去闖了？');
        await S.say('abing:smile', '去吧。等你轉來，換你講故事給我聽。');
      } else if (p === 'P3') {
        await S.say('abing:think', '今年的海，聞起來怪怪的。');
        await S.say('abing:normal', '我講了五十年的鬼故事，鼻子比狗還靈。');
      } else if (G.Quests.stage('q_xingmu') >= 0 && !G.Quests.isDone('q_xingmu')) {
        await S.say('abing:sad', '我的醒木……沒醒木，我講話就沒精神。');
        if (S.hasItem('c1_xingmu')) await xingmuReturn(S);
      } else {
        await S.say('abing:smile', '少年仔，今仔日十四，暗時要去雞籠看放水燈某？');
        await S.say('abing:laugh', '我老啦，腳走不到海邊，就在這說給人聽。');
      }
    }
    if (c !== 1 && S.hasItem('c1_xingmu') && !G.Quests.isDone('q_xingmu')) await xingmuReturn(S);
  }
  async function storyA(S) {
    knock();
    await S.say('abing:smile', '話說——咱九份，早年是什麼款？');
    await S.say('abing:normal', '荒山一座。只有九戶人家，種番薯、砍柴，過日子。');
    await S.say('abing:normal', '山路遠，每次有人下山買東西，大家就喊：「順便幫我帶一份！」');
    await S.say('abing:laugh', '一戶一份，九戶就是九份。這座山，就叫「九份」啦！');
    await S.say('abing:serious', '後來呢？十幾年前，修鐵路的工人在基隆河邊洗飯碗——');
    await S.say('abing:surprise', '欸！碗底金金亮亮。是什麼？是金沙！');
    await S.say('abing:serious', '消息一傳，全島的人揹著鋤頭、提著淘金盤，沿著溪一路往上找。');
    await S.say('abing:laugh', '找到哪裡？找到咱這座山！金脈就在腳底下！');
    await S.say('abing:smile', '九戶人家，一下子變成幾千戶。茶樓、戲館、酒家，攏開起來了。');
    await S.say('abing:smile', '那時陣的人講：九份的暝，比雞籠還要光。');
    await S.say('xinghe:think', '阿炳伯，那最早的九戶人家，後來呢？');
    await S.say('abing:laugh', '後來？後來就是你們這些囝仔的阿公阿祖啦！');
  }
  async function storyB(S) {
    knock();
    await S.say('abing:serious', '從前有一個劍仙，沒名沒姓，只有一把劍、一口氣。');
    await S.say('abing:serious', '有一天他過山，被三十六個山賊團團圍住。');
    await S.say('abing:normal', '山賊問：「錢留下，命也留下！」');
    await S.say('abing:smile', '劍仙說：「錢沒有。命，自己來拿。」');
    await S.say('abing:serious', '刀砍過來，他擋；槍刺過來，他閃。挨了打，他也不倒。');
    await S.say('abing:serious', '挨的打越多、出的招越多，胸中那口「劍意」就越滿……');
    await S.say('abing:laugh', '滿到頂的那一刻——');
    knock(); S.shake(3, 0.15);
    await S.say('abing:laugh', '一劍開山！');
    await S.say('abing:smile', '列位，劍意不是生氣，不是不怕。是心裡有一樣東西，捨不得放。');
    await S.say('xinghe:think', '……那劍仙捨不得放的是什麼？');
    await S.say('abing:smile', '我也不知道。等你遇到了，你再來講給我聽。');
  }
  async function storyC(S) {
    knock();
    await S.say('abing:serious', '今仔日七月十四，阿炳伯來講雞籠的中元。');
    await S.say('abing:serious', '四十幾年前，雞籠這邊，漳州人跟泉州人為了地盤，拿刀拿槍相拚。');
    await S.say('abing:sad', '死了好多人。屍骨收不完，就合葬在一起，蓋了一間廟——老大公廟。');
    await S.say('abing:normal', '後來大家想：再這樣拚下去，雞籠就沒人了。');
    await S.say('abing:normal', '長輩們坐下來講好：以後不分漳泉，用「姓」來輪流辦中元普度。');
    await S.say('abing:smile', '十一個姓，一姓一年。輪到的那一姓，就叫「主普」。');
    await S.say('abing:laugh', '要拚，就拚誰的陣頭較鬧熱、誰的水燈頭較漂亮——莫再拚誰的刀較利！');
    await S.say('abing:serious', '每年七月初一，老大公廟「開龕門」，鬼門開，好兄弟出來作客。');
    await S.say('abing:normal', '十二日，主普壇開燈放彩；十四日，就是今暝——放水燈！');
    await S.say('abing:normal', '各姓扛著水燈頭，從雞籠街遊到望海巷的海邊，點火，放落海。');
    await S.say('abing:think', '水燈漂得越遠，那一姓今年就越旺。為什麼？');
    await S.say('abing:smile', '因為燈越遠，照到的水路越長，海裡的好兄弟，就越多人看得到路。');
    await S.say('abing:normal', '十五普度，請好兄弟吃飽；八月初一，關龕門，再送他們回去。');
    await S.say('xinghe:smile', '今年陳姓做主普，陳伯做的水燈頭，一定漂最遠。');
    await S.say('abing:laugh', '哈哈，你這囝仔，自己家的燈就是較會吹！');
  }
  async function storyD(S) {
    knock();
    await S.say('abing:serious', '從前，北邊的山頭有一隻鶯哥精，會吐毒霧。');
    await S.say('abing:serious', '過路的人一吸進那個霧，就昏昏沉沉，走不出去。');
    await S.say('abing:normal', '國姓爺帶兵來到這，霧罩罩，兵仔一個一個倒落去。');
    await S.say('abing:angry', '國姓爺大怒，叫人架起大砲——轟！把鶯哥的頸打斷！');
    await S.say('abing:normal', '鶯哥精化作一塊大石頭，就是今仔日的鶯歌石。');
    await S.say('abing:normal', '對面的鳶山，也是一隻鳶精，一樣被國姓爺打落去。');
    await S.say('abing:smile', '國姓爺還在劍潭，把寶劍丟落潭底，鎮住興風作浪的魚精。');
    await S.say('xinghe:think', '阿炳伯，國姓爺為什麼這麼厲害？');
    await S.say('abing:smile', '因為他心內有一盞燈——想要給百姓過好日子的燈。');
    await S.say('abing:serious', '人哪，心內有燈，就不驚霧。');
  }
  async function zhengTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('鄭頭家', '昨暝茶樓的燈籠，一盞一盞變成藍色的……');
      await S.say('鄭頭家', '我把它們全拆下來了。陳伯好起來，我再訂新的。');
    } else if (p === 'P3') await S.say('鄭頭家', '今暝茶樓早收，大家攏去雞籠了。');
    else await S.say('鄭頭家', '陳伯的燈籠一掛，客人就多三成。來，喝杯茶再走。');
    await S.shop(['c1_oolong', 'c1_tea_egg'], { title: '聽雨樓' });
  }
  async function chuntaoTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('春桃', '欸！星河，這位姑娘是誰？');
      if (inParty('baizhi')) {
        await S.say('baizhi:normal', '我是白芷。妳的頭髮上有花。');
        await S.say('春桃', '……這、這是茉莉啦。');
        await S.say('baizhi:smile', '很香。像早上的味道。');
        await S.say('春桃', '星河，你從哪裡撿到這麼會講話的姑娘？');
        await S.say('xinghe:think', '……海邊。');
      }
    } else if (p === 'P3') {
      await S.say('春桃', '放水燈的時候，要在水燈上寫字喔。');
      await S.say('春桃', '我……我今年要寫一個人的名字。不告訴你！');
    } else {
      await S.say('春桃', '唷，燈籠舖的小學徒，今天這麼早？');
      await S.say('春桃', '阿炳伯那個劍仙故事，你都聽十遍了吧？');
      await S.say('xinghe:smug', '第十一遍了。每次的山賊數量都不一樣。');
      await S.say('春桃', '上禮拜是三十個，今天三十六個。下禮拜大概一百個。');
    }
  }
  async function xiucaiTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('王秀才', '昨暝之事，在下要寫成一篇〈九份夜譚〉，流傳後世。');
      if (inParty('baizhi')) {
        await S.say('王秀才', '姑娘，可否請問芳名？');
        await S.say('baizhi:smile', '白芷。白色的白，芷是……一種香草。');
        await S.say('王秀才', '「岸芷汀蘭，郁郁青青」……好名字。');
      }
    } else if (p === 'P3') {
      await S.say('王秀才', '想到了！「燈照水路通彼岸，香傳人間慰歸魂」！');
      await S.say('王秀才', '……「彼岸」這兩字，是我夢裡聽來的。奇怪，最近好多人夢到海。');
    } else if (talked('xiucai_P1') === 1) {
      await S.say('王秀才', '慶讚中元……慶讚中元……這四字誰都會寫，要有新意。');
      await S.say('王秀才', '在下替雞籠三家宗親寫水燈頭的對聯，一聯三十文。');
      await S.say('王秀才', '考了三次秀才，倒是寫對聯寫出名聲了。');
    } else await S.say('王秀才', '上聯「燈照水路通彼岸」，下聯……下聯在下還在想。');
  }
  async function ahaiTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('阿海伯', '少年仔，出去外面，記得：什麼東西都是借的。');
      await S.say('阿海伯', '金仔是，時間也是。');
    } else if (p === 'P3') {
      await S.say('阿海伯', '你在坑底……看到阿土？');
      await S.say('阿海伯', '……也是。那個人，死了也不會放心。');
      if (G.Quests.stage('q_atu_watch') === 0 && !S.hasItem('key_watch')) {
        await S.say('阿海伯', '他那支懷錶，從來不離身。挖出他的時候，錶不見了。');
        await S.say('阿海伯', '坍方那天，他是從西邊的老坑道進去的。風很大的那條。');
      }
    } else if (p === 'P2') {
      await S.say('阿海伯', '舊坑？那是阿土跟我以前挖的坑。三年前那次坍方……');
      await S.say('阿海伯', '阿土就沒出來。你進去，要小心。');
    } else {
      await S.say('阿海伯', '我是九份最早一批挖金的。那時候，九份才九戶人。');
      await S.say('阿海伯', '金仔滿山，用手撥一撥就有。現在？要挖到地底才有。');
      await S.say('阿海伯', '金仔是山借給咱的，不是咱的。借太多，山會討回去。');
    }
  }

  // =================================================================================================== 1.5 阿柑芋圓
  G.Maps.define('jiufen_yuyuan', {
    name: '阿柑芋圓',
    place: 'jiufen',
    bgm: 'jiufen',
    start: [7, 8],
    light: (st) => (phase(st) === 'P5' ? { ambient: 0.1, color: '#283040', tint: 'rgba(150,160,180,0.12)' } : { ambient: 0.05, color: '#30241a', tint: 'rgba(255,210,150,0.1)' }),
    particles: ['dust'],
    tiles: rows(room(14, 10, [7])),
    objects: [
      { t: 'stove', x: 2, y: 2 }, { t: 'pot', x: 4, y: 2 }, { t: 'jar_row', x: 8, y: 2, w: 2 },
      { t: 'signboard', x: 11, y: 2, text: '芋圓' },
      { t: 'counter', x: 4, y: 4, w: 6 },
      { t: 'table', x: 3, y: 7 }, { t: 'chair', x: 2, y: 7, dir: 'right' }, { t: 'chair', x: 4, y: 7, dir: 'left' },
      { t: 'table', x: 10, y: 7 }, { t: 'chair', x: 9, y: 7, dir: 'right' }, { t: 'chair', x: 11, y: 7, dir: 'left' },
      { t: 'plant_pot', x: 12, y: 8, v: 1 }, { t: 'red_lantern', x: 6, y: 2, hang: true, text: '甜' },
    ],
    npcs: [{ id: 'agan', sprite: 'shopkeeper_f', portrait: 'agan', x: 7, y: 3, dir: 'down', talk: (S) => aganTalk(S) }],
    warps: [{ x: 7, y: 9, to: 'jiufen', tx: 13, ty: 12, tdir: 'down', door: true }],
    onEnter: () => liveBg(MS()),
    drawOver: (ctx, t) => {
      // steam from the big pot
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const k = ((t * 0.35 + i / 6) % 1);
        ctx.globalAlpha = 0.28 * Math.sin(k * Math.PI);
        ctx.drawImage(G.FX.glowSprite('#ffffff'), 4.5 * T - 16 + Math.sin(t + i) * 8, 2 * T - 10 - k * 70 - 16, 32 + k * 30, 32 + k * 30);
      }
      ctx.restore();
    },
    events: [
      { id: 'yuyuan', trigger: 'auto', if: (st) => st.flags.ch1_morning_after && !st.flags.ch1_yuyuan, run: (S) => scene23b(S) },
      { id: 'menu', trigger: 'action', x: 11, y: 2, label: '菜單', run: (S) => S.say('', '芋圓：芋頭蒸熟、搗爛，拌上地瓜粉，搓成條，切成一顆一顆。阿柑姨說，祕訣是「手要有溫度」。') },
    ],
  });
  async function aganTalk(S) {
    const p = phase();
    if (p === 'P5') {
      if (inParty('baizhi')) await S.say('agan:smile', '白芷姑娘，下次來，阿柑姨教妳搓芋圓！');
      else await S.say('agan:smile', '要吃什麼自己講，免客氣！');
    } else if (p === 'P3') {
      await S.say('agan:smile', '回來了！來來來，坐！');
      await S.say('agan:normal', '今暝我也要去雞籠，給陳姓的水燈頭鬥鬧熱。');
    } else if (p === 'P2') {
      await S.say('agan:surprise', '阿黃跑去礦坑？夭壽喔！你小心點，回來阿柑姨請你吃芋圓！');
    } else if (talked('agan_P1') === 1) {
      await S.say('agan:smile', '星河！甲飽未？阿柑姨的芋圓今仔日特別Q喔！');
      await S.say('agan:laugh', '七月嘛，好兄弟也愛吃甜的。我煮了一大鍋，拜完大家分。');
      return;
    } else await S.say('agan:smile', '要吃什麼自己講，免客氣！');
    await S.shop(['yuyuan', 'c1_yuyuan_ice'], { title: '阿柑芋圓' });
  }

  // =================================================================================================== 1.6 雜貨店「阿財商行」
  G.Maps.define('jiufen_store', {
    name: '雜貨店「阿財商行」',
    place: 'jiufen',
    bgm: 'jiufen',
    start: [7, 8],
    light: { ambient: 0.06, color: '#2a2418', tint: 'rgba(255,220,170,0.08)' },
    particles: ['dust'],
    tiles: rows(room(14, 10, [7])),
    objects: [
      { t: 'jar_row', x: 1, y: 2, w: 3 }, { t: 'weapon_rack', x: 9, y: 2 }, { t: 'cabinet', x: 11, y: 2 }, { t: 'herbs_rack', x: 12, y: 2 },
      { t: 'counter', x: 4, y: 4, w: 6 },
      { t: 'barrel', x: 1, y: 6 }, { t: 'barrel', x: 1, y: 7 }, { t: 'basket', x: 2, y: 8, v: 1 },
      { t: 'crate', x: 12, y: 6 }, { t: 'crate', x: 12, y: 7 }, { t: 'jar', x: 11, y: 8 }, { t: 'basket', x: 10, y: 8, v: 2 },
      { t: 'red_lantern', x: 6, y: 2, hang: true, text: '財' },
    ],
    npcs: [{ id: 'acai', sprite: 'merchant', name: '阿財', x: 7, y: 3, dir: 'down', talk: (S) => acaiTalk(S) }],
    warps: [{ x: 7, y: 9, to: 'jiufen', tx: 7, ty: 12, tdir: 'down', door: true }],
    onEnter: () => liveBg(MS()),
    events: [
      { id: 'pickaxe', trigger: 'action', x: 9, y: 2, w: 2, label: '調查', run: (S) => S.say('', '礦工的十字鎬。刃口磨得發亮。') },
      { id: 'oil', trigger: 'action', x: 1, y: 2, w: 3, label: '調查', run: (S) => S.say('', '一甕一甕的燈油。九份的夜裡少不了它——礦坑裡更少不了。') },
    ],
  });
  const storeGoods = () => ['caozaiguo', 'jinchuang', 'jiedu', 'bianpao', 'c1_salt', 'c1_sweetpotato', 'c1_dried_fish', 'c1_oolong', 'ar_padded', 'hd_douli', 'ft_cloth']
    .concat(phase() === 'P5' ? ['fl_bamboo'] : []);
  async function acaiTalk(S) {
    const p = phase();
    if (!F('ch1_err_oil') && F('ch1_errands')) {
      await S.say('阿財', '星河！陳伯叫你來買燈油喔？');
      await S.say('xinghe:smile', '一甕。四十文對吧？');
      await S.say('阿財', '七月燈油漲價，五十文。');
      await S.say('xinghe:surprise', '陳伯說四十！');
      await S.say('阿財', '哈哈，騙你的啦！你們陳伯年年跟我買，算你三十八。');
      S.gold(-38);
      S.sfx('coin');
      await S.give('c1_lamp_oil', 1);
      await S.say('阿財', '順便看看別的？出門在外，鹽米、草仔粿，攏要有。');
      await tutorial('tut_shop');
      S.flag('ch1_err_oil');
      errandsCheck(S);
      await S.shop(storeGoods(), { title: '阿財商行' });
      return;
    }
    if (p === 'P5') {
      await S.say('阿財', '昨暝那幾包鹽米撒得好吧？阿財的鹽，品質掛保證！');
      await S.say('阿財', '出門在外，鹽米帶在身上，比什麼都卡有效。');
      if (inParty('baizhi')) await S.say('阿財', '隔壁竹藝攤寄賣的竹笛，姑娘吹吹看？');
      await shopAt(S, storeGoods(), '阿財商行', { c1_salt: 18 });
      return;
    }
    if (p === 'P3') {
      await S.say('阿財', '今暝放水燈，鹽米賣到快沒了。大家攏驚七月。');
      await S.say('阿財', '我是驚七月沒生意啦。');
    } else if (p === 'P2') await S.say('阿財', '入礦坑？帶幾包鹽米去。坑裡的東西，驚鹽。');
    else await S.say('阿財', '燈油、鹽米、番薯、草仔粿，九份要活下去的東西，阿財這攏有。');
    await S.shop(storeGoods(), { title: '阿財商行' });
  }

  // =================================================================================================== 1.7 回春堂
  G.Maps.define('jiufen_clinic', {
    name: '林大夫醫館「回春堂」',
    place: 'jiufen',
    bgm: 'jiufen',
    start: [7, 8],
    light: { ambient: 0.06, color: '#24281e', tint: 'rgba(230,240,200,0.08)' },
    particles: ['dust'],
    tiles: rows(room(14, 10, [7])),
    objects: [
      { t: 'cabinet', x: 2, y: 2 }, { t: 'cabinet', x: 3, y: 2 }, { t: 'cabinet', x: 4, y: 2 }, { t: 'cabinet', x: 5, y: 2 },
      { t: 'herbs_rack', x: 7, y: 2 }, { t: 'bookshelf', x: 8, y: 2 },
      { t: 'table', x: 3, y: 5, w: 2 }, { t: 'chair', x: 5, y: 5, dir: 'left' },
      { t: 'bed', x: 11, y: 3 }, { t: 'screen', x: 9, y: 4 },
      { t: 'cauldron', x: 11, y: 7 }, { t: 'mill_stone', x: 1, y: 7 }, { t: 'plant_pot', x: 1, y: 8, v: 2 },
      { t: 'red_lantern', x: 6, y: 2, hang: true, text: '春' },
    ],
    npcs: [{ id: 'lin', sprite: 'doctor', name: '林大夫', x: 4, y: 4, dir: 'down', talk: (S) => linTalk(S) }],
    warps: [{ x: 7, y: 9, to: 'jiufen', tx: 29, ty: 12, tdir: 'down', door: true }],
    onEnter: () => liveBg(MS()),
    events: [
      { id: 'cabinet', trigger: 'action', x: 2, y: 2, w: 4, label: '調查', run: (S) => S.say('', '上百個小抽屜，每一格都貼著藥名：當歸、黃耆、甘草、艾葉……一股苦苦甜甜的味道。') },
    ],
  });
  async function linTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('林大夫', '陳伯的傷，是陰寒入骨。那根黑羽毛……我行醫三十年沒看過。');
      await S.say('林大夫', '他要躺一陣子。你們路上，藥帶足。');
    } else if (p === 'P3') await S.say('林大夫', '今暝雞籠人山人海，我要去主普壇那邊顧著，每年都有人擠到昏倒。');
    else if (p === 'P2') await S.say('林大夫', '礦坑？那裡面空氣不好，頭暈就趕快出來。');
    else if (talked('lin_P1') === 1) {
      await S.say('林大夫', '七月的生意最好——不是病，是「著驚」。');
      await S.say('林大夫', '半夜聽到人叫名就嚇到睡不著，脈都亂了。');
      await S.say('林大夫', '我開藥安神，再叫他們去廟裡收驚。藥醫身，廟醫心，攏要。');
      return;
    } else await S.say('林大夫', '要帶什麼藥？出門在外，金創藥一定要有。');
    const goods = ['jinchuang', 'jiedu', 'xiangbao'];
    if (p === 'P3' || p === 'P5') goods.push('huanhunxiang');
    await S.shop(goods, { title: '回春堂' });
  }

  // =================================================================================================== 1.8 阿土嬸家
  const FXA = { atu: 0, glow: 0 };
  G.Maps.define('jiufen_atu_house', {
    name: '阿土嬸家',
    place: 'jiufen',
    bgm: 'jiufen',
    start: [6, 7],
    light: { ambient: 0.14, color: '#2a2018', tint: 'rgba(255,200,150,0.1)' },
    tiles: rows(room(12, 9, [6])),
    objects: [
      { t: 'altar', x: 5, y: 2 }, { t: 'stove', x: 9, y: 2 }, { t: 'jar', x: 1, y: 2 }, { t: 'basket', x: 2, y: 2, v: 0 },
      { t: 'table', x: 3, y: 5, w: 2 }, { t: 'chair', x: 2, y: 5, dir: 'right' },
      { t: 'bed_mat', x: 9, y: 5 }, { t: 'broom', x: 10, y: 7 }, { t: 'plant_pot', x: 1, y: 7, v: 0 },
    ],
    lights: () => (FXA.glow > 0.01 ? [{ x: 3.5, y: 5, r: 160 * FXA.glow, color: '#ffd08a', flicker: 0.1 }] : []),
    npcs: [{ id: 'atusim_in', sprite: 'old_f', name: '阿土嬸', x: 5, y: 5, dir: 'left', if: (st) => phase(st) === 'P3', talk: (S) => atusimTalk(S) }],
    warps: [{ x: 6, y: 8, to: 'jiufen', tx: 6, ty: 7, tdir: 'down', door: true }],
    onEnter: () => { liveBg(MS()); FXA.atu = 0; FXA.glow = G.Quests.isDone('q_atu_watch') ? 0.6 : 0; },
    drawGround: (ctx, t) => drawWindows(ctx, [[8, 1]], t),
    update3d: (view, dt) => sync3d(view, dt, [{ key: 'atu', char: 'miner', x: 8.5, z: 2.9, a: FXA.atu, ghost: true }]),
    drawOver: (ctx, t) => {
      if (FXA.atu > 0.01 && G.Sprites && !is3d()) G.Sprites.drawChar(ctx, 'miner', 'down', 0, 8.5 * T, 3 * T - 8, { alpha: FXA.atu, ghost: true });
      if (FXA.glow > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 4 * T, 5.3 * T, 26, '#ffd08a', FXA.glow); ctx.restore(); ctx.globalAlpha = 1; }
    },
    events: [
      { id: 'table', trigger: 'action', x: 3, y: 5, w: 2, label: '調查', run: async (S) => {
        if (G.Quests.isDone('q_atu_watch')) await S.say('', '兩副碗筷。其中一副的碗裡，盛了半碗飯。');
        else await S.say('', '桌上擺著兩副碗筷。另一副，看起來很久沒人用了，卻擦得很乾淨。');
      } },
      { id: 'altar', trigger: 'action', x: 5, y: 2, w: 2, label: '調查', run: (S) => S.say('', '祖先牌位旁，有一塊新一點的神主牌。旁邊的油燈很小，卻一直亮著。') },
    ],
  });

  // =================================================================================================== 1.3 九份
  // North = downhill (sea, 雞籠); south = uphill (霧林); east = 舊金礦坑. 豎崎路 runs x 18–20 top to bottom.
  const JF_TILES = (() => {
    const g = grid(40, 45, '.');
    fill(g, 0, 0, 40, 1, 'X'); fill(g, 0, 44, 40, 1, 'X'); fill(g, 0, 0, 1, 45, 'X'); fill(g, 39, 0, 1, 45, 'X');
    fill(g, 1, 1, 38, 2, ',');                         // hillside above town
    fill(g, 18, 0, 3, 44, 'H');                        // 豎崎路
    fill(g, 18, 44, 3, 1, '=');                        // south exit (霧林)
    fill(g, 32, 1, 5, 2, '#');                         // 望海平台
    fill(g, 5, 7, 13, 1, '='); fill(g, 21, 7, 8, 1, '=');
    fill(g, 1, 12, 38, 3, '#');                        // 暗街仔
    fill(g, 13, 24, 14, 3, '#');                       // 半山平台
    fill(g, 21, 30, 5, 1, '#');                        // in front of the shop
    fill(g, 21, 33, 15, 1, '='); fill(g, 35, 31, 1, 2, '=');
    fill(g, 15, 37, 16, 3, '#');                       // 上平台
    // little paths & yards
    fill(g, 8, 15, 1, 2, '='); fill(g, 26, 15, 1, 2, '='); fill(g, 5, 20, 8, 1, '=');
    fill(g, 21, 16, 6, 1, '='); fill(g, 4, 29, 14, 1, '='); fill(g, 8, 36, 7, 1, '=');
    fill(g, 31, 3, 7, 1, ':'); fill(g, 29, 25, 9, 1, '=');
    // flower beds and dirt patches
    for (const [x, y, w, h] of [[2, 4, 2, 2], [10, 4, 3, 1], [24, 4, 2, 2], [33, 8, 4, 2], [2, 21, 3, 2], [33, 18, 3, 2], [9, 26, 3, 2], [31, 36, 4, 2], [3, 40, 4, 2], [24, 41, 4, 2]]) fill(g, x, y, w, h, '"');
    for (const [x, y, w, h] of [[1, 16, 2, 4], [36, 23, 2, 3], [11, 32, 3, 2], [33, 41, 3, 2]]) fill(g, x, y, w, h, ':');
    return rows(g);
  })();
  // trees: betel / tree fern alternate (screenplay `p`) + extra greenery around the edges
  const JF_TREES = [[3, 3], [11, 5], [25, 2], [36, 6], [10, 18], [35, 19], [2, 21], [26, 22], [32, 26], [12, 30], [2, 38], [35, 40], [8, 41], [28, 42],
    [1, 6], [1, 10], [38, 4], [38, 10], [38, 16], [1, 25], [38, 28], [1, 33], [38, 34], [1, 42], [12, 42], [24, 43], [33, 44 - 1], [15, 1], [6, 1], [28, 1],
    [11, 23], [29, 19], [37, 37], [5, 37], [30, 30], [14, 16], [16, 31]];
  const jfNight = (st) => phase(st) === 'P4';
  // hanging eave lanterns (red by day, cold blue during the raid)
  const JF_EAVES = [[13, 23], [17, 23], [22, 29], [25, 29], [12, 11], [15, 11], [6, 11], [9, 11], [28, 11], [31, 11], [5, 6], [8, 6]];
  function blueLit(s, i) {
    if (phase(s) !== 'P4') return false;
    if (!s.flags.ch1_wgk_beaten) return true;
    return FXJ.red != null && FXJ.red <= i;
  }
  function jiufenObjects(st) {
    const p = phase(st);
    const o = [
      { t: 'house_jiufen', x: 5, y: 4, door: 1, v: 0 },
      { t: 'house_jiufen', x: 27, y: 4, door: 1, v: 2 },
      { t: 'shophouse', x: 6, y: 9, door: 1, v: 0, text: '阿財商行' },
      { t: 'house_jiufen', x: 12, y: 9, door: 1, v: 1, text: '阿柑芋圓' },
      { t: 'house_jiufen', x: 22, y: 9, door: -1, v: 3 },
      { t: 'shophouse', x: 28, y: 9, door: 1, v: 2, text: '回春堂' },
      { t: 'house_jiufen', x: 3, y: 17, door: -1, v: 2 },
      { t: 'house_jiufen', x: 27, y: 17, door: -1, v: 0 },
      { t: 'teahouse', x: 13, y: 20, text: '聽雨樓' },
      { t: 'house_jiufen', x: 30, y: 22, door: -1, v: 1 },
      { t: 'house_jiufen', x: 3, y: 26, door: -1, v: 3 },
      { t: 'shophouse', x: 22, y: 27, door: 1, v: 1, text: '陳記燈籠' },
      { t: 'mine_entrance', x: 34, y: 29, door: 1, text: '舊坑' },
      { t: 'house_jiufen', x: 6, y: 33, door: -1, v: 0 },
      { t: 'shrine_small', x: 24, y: 35, text: '福德祠' },
      { t: 'tree_banyan', x: 15, y: 34 },
      // street life
      { t: 'stall', x: 4, y: 14, text: '菜脯', counter: true },
      { t: 'stall', x: 24, y: 14, text: '草仔粿', counter: true },
      { t: 'stall', x: 31, y: 14, text: '雜細', counter: true },
      { t: 'barrel', x: 3, y: 13 }, { t: 'crate', x: 34, y: 13 }, { t: 'jar', x: 26, y: 13 }, { t: 'basket', x: 6, y: 14, v: 2 },
      { t: 'bench', x: 33, y: 1, w: 2 },
      { t: 'well', x: 34, y: 21 },
      { t: 'signboard', x: 12, y: 23, text: '聽雨樓', v: 1 },
      { t: 'signboard', x: 37, y: 31, text: '舊坑・危險' },
      { t: 'signboard', x: 21, y: 43, text: '霧林' },
      { t: 'stone_lantern', x: 21, y: 31, lit: true },
      { t: 'incense_burner', x: 26, y: 37 },
      { t: 'bench', x: 15, y: 38, w: 2 },
      { t: 'banner', x: 14, y: 37, text: '鐵口直斷', color: '#e8dcc0' },
      { t: 'rock_small', x: 25, y: 32 }, { t: 'log', x: 37, y: 33 },
      { t: 'barrel', x: 26, y: 30 }, { t: 'lantern_rack', x: 26, y: 28 },
      { t: 'crate', x: 11, y: 11 }, { t: 'jar', x: 27, y: 11 }, { t: 'plant_pot', x: 5, y: 11, v: 1 }, { t: 'plant_pot', x: 21, y: 29, v: 2 },
      { t: 'fence_bamboo', x: 9, y: 25, w: 3 }, { t: 'fence_bamboo', x: 31, y: 35, w: 4 },
      { t: 'laundry', x: 10, y: 17, if: (s) => phase(s) !== 'P4' },
      // 拜門口 offering tables (P1–P3)
      ...[[8, 15], [26, 15], [5, 20]].flatMap(([x, y]) => [
        { t: 'table', x, y, if: (s) => ['P1', 'P2', 'P3'].includes(phase(s)) },
        { t: 'jar', x: x - 1, y, if: (s) => ['P1', 'P2', 'P3'].includes(phase(s)) },
      ]),
      { key: 'jar_coin', t: 'jar', x: 12, y: 16, v: 2 },
      // 黃居士's little stand
      { t: 'banner', x: 25, y: 25, text: '長明燈', color: '#2a4a7a', if: (s) => !['P4', 'P5'].includes(phase(s)) },
      { t: 'driftwood', x: 24, y: 25, if: (s) => phase(s) === 'P5' },
      // the boarded-up mine (P1) / the broken boards (P2 on)
      { t: 'fence_wood', x: 34, y: 31, w: 3, if: (s) => !s.flags.ch1_ahuang_lost },
      { t: 'crate', x: 34, y: 31, if: (s) => !!s.flags.ch1_ahuang_lost },
      { t: 'barrel', x: 36, y: 31, if: (s) => !!s.flags.ch1_ahuang_lost },
      // lamp posts along the stairs
      ...[[17, 9], [21, 18], [17, 27], [21, 36], [17, 42], [21, 5]].map(([x, y]) => ({ t: 'lamp_post', x, y, lit: p !== 'P2', text: '燈' })),
    ];
    for (const [x, y] of JF_TREES) o.push({ t: (x + y) % 2 ? 'tree_betel' : 'tree_fern', x, y });
    for (const [x, y] of [[2, 8], [36, 12], [13, 31], [30, 40], [9, 22], [37, 21], [6, 43], [23, 21]]) o.push({ t: 'bush', x, y });
    for (const [x, y] of [[4, 5], [35, 3], [24, 6], [10, 27], [32, 37], [26, 42]]) o.push({ t: 'flowers', x, y });
    // lantern strings over 暗街仔 and across the stairs; every lantern has a cold-blue twin for the raid
    // (the twins switch back one by one after 1-20 via FXJ.red)
    let li = 0;
    const lanternPair = (red, blue) => {
      const i = li++;
      o.push(Object.assign(red, { if: (s) => !blueLit(s, i) }));
      o.push(Object.assign(blue, { if: (s) => blueLit(s, i) }));
    };
    for (const x of [2, 8, 14, 21, 27, 33]) lanternPair({ t: 'lantern_string', x, y: 12, w: 5, v: x % 2 ? 0 : 1, lift: 52 }, { t: 'lantern_string', x, y: 12, w: 5, v: 2, lift: 52 });
    for (const y of [8, 19, 33, 41]) lanternPair({ t: 'lantern_string', x: 17, y, w: 5, v: 0, lift: 60 }, { t: 'lantern_string', x: 17, y, w: 5, v: 2, lift: 60 });
    lanternPair({ t: 'lantern_string', x: 13, y: 24, w: 14, v: 1, lift: 74 }, { t: 'lantern_string', x: 13, y: 24, w: 14, v: 2, lift: 74 });
    for (const [x, y] of JF_EAVES) lanternPair({ t: 'red_lantern', x, y, hang: true, text: '福' },
      { t: 'red_lantern', x, y, hang: true, color: '#3c6aa8', lit: false, light: { r: 110, color: BLUE, flicker: 0.4 } });
    return o;
  }

  // ------------------------------------------------------------------ 九份 NPCs (positions per phase)
  // spec: [id, sprite, name|null, portrait|null, {P1:[x,y,dir,wander], …}, talkFn]
  function jnpc(id, sprite, name, portrait, pos, talk, extra) {
    return Object.assign({
      id, sprite, name: name || undefined, portrait: portrait || undefined,
      x: 0, y: 0,
      if: (st) => !!pos[phase(st)] && (!extra || !extra.cond || extra.cond(st)),
      pos: (st) => { const q = pos[phase(st)] || [1, 1]; return [q[0], q[1]]; },
      talk,
    }, extra || {});
  }
  const P123 = (x, y, d, w) => ({ P1: [x, y, d, w], P2: [x, y, d, w], P3: [x, y, d, w] });
  const PALL = (x, y, d, w) => Object.assign(P123(x, y, d, w), { P5: [x, y, d, w] });
  function jiufenNpcs() {
    const list = [
      jnpc('xiaojin', 'child_m', null, 'xiaojin', { P1: [19, 19, 'left'], P2: [34, 32, 'up'], P3: [28, 8, 'down'], P5: [28, 8, 'down'] }, (S) => xiaojinTalk(S)),
      jnpc('ahuang', 'dog', '阿黃', null, { P1: [20, 19, 'left'], P3: [27, 8, 'right'], P5: [27, 8, 'right'] }, (S) => ahuangTalk(S)),
      jnpc('atusim', 'old_f', '阿土嬸', null, { P1: [7, 8, 'down', 1], P2: [7, 8, 'down', 1], P5: [7, 7, 'down'] }, (S) => atusimTalk(S)),
      jnpc('awang', 'miner', '阿旺', null, { P3: [29, 8, 'left'], P5: [29, 8, 'left'] }, (S) => awangTalk(S)),
      jnpc('guopo', 'old_f', '粿婆', null, PALL(24, 13, 'down'), (S) => guopoTalk(S), { fixedDir: true }),
      jnpc('azhu', 'child_f', '阿珠', null, PALL(10, 13, 'down', 1), (S) => azhuTalk(S)),
      jnpc('jinxia', 'villager_f', '錦霞嬸', null, Object.assign(P123(9, 15, 'left'), { P5: [9, 16, 'down'] }), (S) => jinxiaTalk(S)),
      jnpc('qiuyue', 'villager_f2', '秋月嫂', null, PALL(27, 15, 'left'), (S) => qiuyueTalk(S)),
      jnpc('afa', 'miner', '阿發', null, PALL(30, 13, 'down', 1), (S) => afaTalk(S)),
      jnpc('tiekou', 'old_m', '鐵口仙', null, PALL(16, 37, 'down'), (S) => tiekouTalk(S), { fixedDir: true }),
      jnpc('tianding', 'temple_keeper', '添丁伯', null, PALL(26, 38, 'left', 1), (S) => tiandingTalk(S)),
      jnpc('ashui', 'fisherman', '阿水', null, { P1: [19, 9, 'up', 1], P2: [19, 9, 'up', 1], P3: [21, 8, 'down'], P5: [21, 8, 'down'] }, (S) => ashuiTalk(S)),
      jnpc('heitang', 'cat', '黑糖', null, PALL(9, 8, 'down'), (S) => heitangTalk(S)),
      jnpc('ajiu', 'villager_m2', '阿九', null, { P1: [24, 32, 'down'], P3: [24, 32, 'down'], P5: [24, 32, 'down'] }, (S) => ajiuTalk(S)),
      jnpc('huang', 'villager_m', '黃居士', null, P123(24, 26, 'down'), (S) => huangTalk(S)),
      jnpc('ade', 'villager_m', '阿德', null, { P1: [33, 2, 'up'], P2: [33, 2, 'up'], P3: [33, 2, 'up'], P5: [33, 2, 'up'] }, (S) => adeTalk(S)),
      jnpc('meiyu', 'villager_f2', '美玉', null, { P1: [34, 2, 'up'], P2: [34, 2, 'up'], P3: [34, 2, 'up'], P5: [34, 2, 'up'] }, (S) => adeTalk(S)),
      // passers-by
      jnpc('walker1', 'villager_m', '挑夫', null, { P1: [16, 14, 'right', 3], P3: [22, 13, 'left', 3] }, (S) => S.say('挑夫', '借過借過！供品要送去雞籠的宗親會！')),
      jnpc('walker2', 'villager_f', '阿婆', null, { P1: [30, 26, 'left', 2], P2: [30, 26, 'left', 2], P5: [30, 26, 'left', 2] }, async (S) => {
        if (phase() === 'P5') await S.say('阿婆', '雨落落來，昨暝的事，攏洗去了。');
        else await S.say('阿婆', '七月半，鴨仔毋知死活。少年仔，晚上莫四界走。');
      }),
    ];
    // heitang moves around during 醒木失竊記
    const cat = list.find((n) => n.id === 'heitang');
    cat.pos = (st) => {
      const q = st.quests.q_xingmu;
      if (q && !q.done && q.stage === 1) return [10, 16];
      if (q && !q.done && q.stage === 2) return [23, 37];
      return [9, 8];
    };
    cat.if = (st) => !['P4', 'PX'].includes(phase(st));
    // facing & wander per phase are applied by applyNpcDirs (onEnter / onUpdate)
    return list;
  }
  const JF_NPCS = jiufenNpcs();
  // phase-specific facing / wander radius
  const JF_POSSPEC = {};
  (function () {
    const add = (id, spec) => { JF_POSSPEC[id] = spec; };
    add('xiaojin', { P1: ['left', 0], P2: ['up', 0], P3: ['down', 0], P5: ['down', 0] });
    add('atusim', { P1: ['down', 1], P2: ['down', 1], P5: ['down', 0] });
    add('azhu', { P1: ['down', 1], P2: ['down', 1], P3: ['down', 1], P5: ['down', 1] });
    add('afa', { P1: ['down', 1], P2: ['down', 1], P3: ['down', 1], P5: ['down', 1] });
    add('tianding', { P1: ['left', 1], P2: ['left', 1], P3: ['left', 1], P5: ['left', 1] });
    add('ashui', { P1: ['up', 1], P2: ['up', 1], P3: ['down', 0], P5: ['down', 0] });
    add('walker1', { P1: ['right', 3], P3: ['left', 3] });
    add('walker2', { P1: ['left', 2], P2: ['left', 2], P5: ['left', 2] });
  })();
  function applyNpcDirs(ms) {
    const p = phase();
    for (const n of ms.npcs) {
      const s = JF_POSSPEC[n.id];
      if (s && s[p]) { if (!n.c1dirSet) { n.dir = s[p][0]; n.c1dirSet = true; } n.wander = s[p][1]; }
    }
  }

  // P4 roaming 水鬼 / 鬼燈籠 (no respawn)
  const JF_ENEMIES = [[19, 18, 'jiufen_4'], [8, 13, 'jiufen_2'], [31, 13, 'jiufen_4'], [19, 7, 'jiufen_2'], [25, 5, 'jiufen_4']].map(([x, y, troop], i) => ({
    id: 'raid' + i, troop, x, y, lv: 4, radius: 3, chase: 4, speed: 2.2, respawn: false,
    if: (st) => phase(st) === 'P4' && !st.flags.ch1_moya_beaten,
  }));

  // world-space FX for 九份 (cutscenes)
  const FXJ = { apps: [], fog: 0, feathers: [], king: null, blue: 0, souls: [], oar: 0 };
  function jfLights(st) {
    const out = [];
    if (phase(st) === 'P4') out.push({ x: 19, y: 1, r: 260, color: '#5a8ad0', flicker: 0.1 });
    for (const ap of FXJ.apps) if (ap.a > 0.05) out.push({ x: ap.x, y: ap.y - 0.5, r: 120 * ap.a, color: '#9fd0ff', flicker: 0.2 });
    for (const s of FXJ.souls) out.push({ x: s.x / T - 0.5, y: s.y / T - 0.5, r: 60, color: '#9fe6ff', flicker: 0.2 });
    if (FXJ.oar > 0.01) out.push({ x: FXJ.oarX || 19, y: (FXJ.oarY || 6) - 0.5, r: 300 * FXJ.oar, color: '#ffe6a0', flicker: 0.1 });
    return out;
  }

  G.Maps.define('jiufen', {
    name: '九份',
    subtitle: (st) => ({ P1: '七月十四・清晨', P2: '七月十四・正午', P3: '七月十四・午後', PX: '七月十四・黃昏', P4: '七月十四・子夜', P5: '七月十五・清晨' })[phase(st)],
    place: 'jiufen',
    bgm: (st) => PHASE_BGM[phase(st)],
    start: [23, 30],
    bg: '#1a2418',
    light: (st) => PHASE_LIGHT[phase(st)],
    particles: (st) => PHASE_PARTICLES[phase(st)],
    tiles: JF_TILES,
    objects: (st) => jiufenObjects(st),
    npcs: JF_NPCS,
    enemies: JF_ENEMIES,
    chests: [
      { id: 'ch1_c_jf1', x: 37, y: 2, item: 'c1_sweetpotato', n: 3 },
      { id: 'ch1_c_jf2', x: 2, y: 30, item: 'c1_salt', n: 2 },
      { id: 'ch1_c_jf3', x: 36, y: 39, item: 'c1_oolong', n: 1 },
    ],
    lights: (st) => jfLights(st),
    warps: [
      { x: 6, y: 6, to: 'jiufen_atu_house', tx: 6, ty: 7, tdir: 'up', door: true, run: (S) => lockedAtNight(S) },
      { x: 7, y: 11, to: 'jiufen_store', tx: 7, ty: 8, tdir: 'up', door: true, run: (S) => lockedAtNight(S) },
      { x: 13, y: 11, to: 'jiufen_yuyuan', tx: 7, ty: 8, tdir: 'up', door: true, run: (S) => lockedAtNight(S) },
      { x: 29, y: 11, to: 'jiufen_clinic', tx: 7, ty: 8, tdir: 'up', door: true, run: (S) => lockedAtNight(S) },
      { x: 15, y: 23, to: 'jiufen_teahouse', tx: 10, ty: 12, tdir: 'up', door: true, run: (S) => lockedAtNight(S) },
      { x: 23, y: 29, to: 'jiufen_shop', tx: 7, ty: 10, tdir: 'up', door: true },
      { x: 35, y: 30, to: 'mine_1', tx: 19, ty: 38, tdir: 'up', door: false, run: async (S) => {
        if (phase() === 'P4') { await S.say('', '坑口黑漆漆的，冷風一陣一陣吹出來。現在不是進去的時候。'); await S.move('player', 'D'); return false; }
        return true;
      } },
    ],
    onEnter: (S) => {
      const ms = MS();
      liveBg(ms);
      FXJ.apps = []; FXJ.feathers = []; FXJ.king = null; FXJ.souls = []; FXJ.oar = 0;
      applyNpcDirs(ms);
    },
    update3d: (view, dt) => {
      const k = FXJ.king;
      sync3d(view, dt, appSpecs(FXJ.apps, 'j').concat([{ key: 'king', mon: 'water_ghost_king', height: 5.5, x: k ? k.x : 0, z: k ? k.y + 0.5 : 0, a: k ? k.a : 0, y3: k ? (1 - k.rise) * -2 : 0 }]));
    },
    onUpdate: (dt, ms) => {
      for (const f of FXJ.feathers) { f.t += dt; f.y += f.vy * dt; f.x += Math.sin(f.t * 2 + f.ph) * 20 * dt; }
      FXJ.feathers = FXJ.feathers.filter((f) => f.t < f.life);
      for (const s of FXJ.souls) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
      FXJ.souls = FXJ.souls.filter((s) => s.t < s.life);
      if (!G.Script.busy()) applyNpcDirs(ms);
      // the raid fog thickens toward the north (the sea)
      const mist = ms.particles && ms.particles.groups.find((g) => g.name === 'mist');
      if (mist && phase() === 'P4') mist.opts.alpha = 0.12 + 0.2 * (1 - ms.player.y / ms.h) + FXJ.fog * 0.15;
    },
    drawOver: (ctx, t, ms) => {
      if (FXJ.king && !is3d()) {
        const k = FXJ.king;
        ctx.save();
        ctx.globalAlpha = k.a;
        ctx.translate(k.x * T, k.y * T + (1 - k.rise) * 120);
        ctx.scale(k.sc, k.sc);
        G.Monsters.draw(ctx, 'water_ghost_king', 0, 0, t, { state: k.state || 'idle', phase: 1 });
        ctx.restore();
      }
      drawApps(ctx, t, FXJ.apps);
      for (const f of FXJ.feathers) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (f.life - f.t) * 2);
        ctx.translate(f.x, f.y); ctx.rotate(Math.sin(f.t * 3 + f.ph) * 0.8);
        ctx.fillStyle = '#141826';
        ctx.beginPath(); ctx.ellipse(0, 0, 3, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(90,120,200,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
        ctx.restore();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of FXJ.souls) { const a = Math.min(1, s.t * 2) * Math.max(0, 1 - s.t / s.life); glow(ctx, s.x, s.y, 14, s.c || '#9fe6ff', a); glow(ctx, s.x, s.y, 4, s.c ? '#f4f0e8' : '#ffffff', a); }
      if (phase() === 'P4') JF_EAVES.forEach(([x, y], k) => { if (blueLit(G.state, 11 + k)) glow(ctx, x * T + 32, y * T - 28, 22, BLUE, 0.55 + 0.15 * Math.sin(t * 5 + x)); });
      if (FXJ.oar > 0.01) glow(ctx, (FXJ.oarX || 19) * T + 32, (FXJ.oarY || 6) * T - 30, 220 * FXJ.oar, '#ffe6a0', FXJ.oar * 0.8);
      ctx.restore(); ctx.globalAlpha = 1;
      // north fog bank during the raid
      if (phase() === 'P4') {
        const g = ctx.createLinearGradient(0, 0, 0, 12 * T);
        g.addColorStop(0, `rgba(170,190,220,${0.35 + FXJ.fog * 0.3})`); g.addColorStop(1, 'rgba(170,190,220,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, ms.w * T, 12 * T);
      }
    },
    events: [
      // exits
      { id: 'north_exit', trigger: 'touch', x: 18, y: 0, w: 3, run: async (S) => {
        const p = phase();
        if (p === 'P4') await S.say('xinghe:serious', '霧從海那邊一直湧上來……小金不會在那個方向。');
        else if (p === 'P5') await S.say('xinghe:think', '下山的路。陳伯說海路不能走，要從南邊上山。');
        else await S.say('xinghe:normal', '下山的路。傍晚才要去雞籠。');
        await S.move('player', 'D');
      } },
      { id: 'south_exit', trigger: 'touch', x: 18, y: 43, w: 3, run: async (S) => {
        if (F('ch1_done') && G.Maps.get(CH2_MAP)) { await S.warp(CH2_MAP, 19, 1, 'down'); return; }
        if (F('ch1_done')) { await S.say('xinghe:serious', '霧林就在前面。'); await S.move('player', 'U'); return; }
        if (F('ch1_yuyuan')) { await S.say('xinghe:think', '……先跟大家道別吧。'); await S.move('player', 'U'); return; }
        await S.say('xinghe:think', '往山裡的路，霧好濃。沒事進去幹嘛……');
        await S.move('player', 'U');
      } },
      // save
      { id: 'tut_save', trigger: 'touch', x: 21, y: 30, w: 3, h: 2, once: true, if: (st) => !st.flags.tut_save, run: () => tutorial('tut_save') },
      { id: 'save', trigger: 'action', x: 21, y: 31, label: '記錄', run: (S) => savePoint(S) },
      // 1-3c 福德祠
      { id: 'fude', trigger: 'action', x: 24, y: 36, w: 2, label: '參拜', run: (S) => fudeShrine(S) },
      // mine
      { id: 'fence', trigger: 'action', x: 34, y: 31, w: 3, label: '調查', if: (st) => !st.flags.ch1_ahuang_lost, run: (S) => S.say('', '木板釘死了。三年前坍方之後，這個坑就封起來了。') },
      { id: 'mine_mouth', trigger: 'touch', x: 34, y: 32, w: 3, h: 2, if: (st) => st.flags.ch1_ahuang_lost && !st.flags.ch1_mine_open, run: (S) => scene15mine(S) },
      { id: 'back_from_mine', trigger: 'auto', if: (st) => st.flags.ch1_foreman && !st.flags.ch1_mine_done, run: (S) => scene18(S) },
      // side stuff
      { id: 'jar_coin', trigger: 'action', x: 12, y: 16, label: '調查', run: async (S) => {
        if (F('ch1_c_jar')) { await S.say('', '空空的甕。'); return; }
        S.flag('ch1_c_jar');
        await S.say('', '甕底壓著幾枚銅錢。大概是誰藏的私房錢……拜拜剩下的？');
        S.gold(20);
      } },
      { id: 'xiaojin_house', trigger: 'action', x: 28, y: 6, label: '調查', run: async (S) => {
        if (phase() === 'P4') await S.say('', '門閂住了。裡面傳來壓低的聲音：「莫開門……」');
        else await S.say('', '小金家。門口掛著一串曬乾的魚，裡面傳來炒菜的香味。');
      } },
      { id: 'huang_flag', trigger: 'action', x: 24, y: 25, w: 2, label: '調查', if: (st) => phase(st) === 'P5', run: (S) => S.say('', '「府城長明宮」的旗子倒在泥水裡。黃居士不見了。') },
      { id: 'ahuang_final', trigger: 'touch', x: 24, y: 7, w: 3, h: 2, if: (st) => G.Quests.stage('q_ahuang') === 2 && !G.Quests.isDone('q_ahuang') && ['P3', 'P5'].includes(phase(st)), run: (S) => ahuangFinal(S) },
      // night raid
      { id: 'raid_lanterns', trigger: 'touch', x: 18, y: 24, w: 3, once: true, if: (st) => phase(st) === 'P4' && st.flags.ch1_night_raid, run: (S) => raidLanterns(S) },
      { id: 'raid_salt', trigger: 'touch', x: 18, y: 15, w: 3, once: true, if: (st) => phase(st) === 'P4' && st.flags.ch1_night_raid, run: (S) => raidSalt(S) },
      { id: 'raid_finale', trigger: 'touch', x: 18, y: 4, w: 3, once: true, if: (st) => phase(st) === 'P4' && st.flags.ch1_night_raid, run: (S) => raidFinale(S) },
      // 1-24
      { id: 'depart', trigger: 'touch', x: 18, y: 40, w: 3, once: true, if: (st) => st.flags.ch1_yuyuan && st.flags.mochi_joined && !st.flags.ch1_done, run: (S) => scene24(S) },
      { id: 'depart_gate', trigger: 'touch', x: 18, y: 40, w: 3, if: (st) => st.flags.ch1_yuyuan && !st.flags.mochi_joined, run: async (S) => {
        await S.say('xinghe:think', '……出發之前，先去聽雨樓跟鄭頭家說一聲吧。他早上好像在找我們。');
        await S.move('player', 'U');
      } },
    ],
  });
  async function lockedAtNight(S) {
    if (phase() !== 'P4') return true;
    await S.say('', '門閂住了。裡面傳來壓低的聲音：「莫開門……」');
    await S.move('player', 'D');
    return false;
  }

  // ------------------------------------------------------------------ 九份 townsfolk
  async function xiaojinTalk(S) {
    const p = phase();
    if (p === 'P1') {
      if (talked('xiaojin_P1') === 1) {
        await S.say('xiaojin:smile', '嘿！呀！看劍！我是劍仙沈星河！');
        await S.say('xinghe:laugh', '劍仙本人在這裡。');
        await S.say('xiaojin:surprise', '啊！星河哥！教我一招啦，一招就好！');
        await S.say('xinghe:smug', '等你長到阿黃那麼高再說。');
        await S.say('xiaojin:angry', '阿黃比我矮！');
        await S.say('xinghe:smile', '對啊。');
      } else await S.say('xiaojin:normal', '阿黃最近一直往礦坑那邊跑，阿爸很生氣。');
    } else if (p === 'P2') await S.say('xiaojin:cry', '星河哥……拜託你……');
    else if (p === 'P3') {
      if (G.Quests.isDone('q_ahuang')) { await S.say('xiaojin:laugh', '阿黃不跑了！牠一整個下午都黏著我！'); return; }
      if (G.Quests.stage('q_ahuang') < 0) {
        await S.say('xiaojin:sad', '阿爸說，明天要把阿黃送去雞籠的阿叔那邊……');
        await S.say('xiaojin:cry', '阿黃不是壞狗……牠只是……只是一直想去礦坑……');
        S.quest('q_ahuang', 0);
        S.objective('跟阿旺談談阿黃的事');
      } else await S.say('xiaojin:sad', '星河哥，你一定有辦法對不對？');
    } else if (p === 'P5') {
      if (!F('ch1_xj_farewell') && G.Quests.isDone('q_ahuang')) {
        S.flag('ch1_xj_farewell');
        await S.say('xiaojin:smile', '星河哥！你要去很遠的地方嗎？');
        await S.say('xinghe:smile', '嗯。去觀音山。');
        await S.say('xiaojin:think', '觀音山在哪？');
        await S.say('xinghe:think', '……很遠的地方。');
        await S.say('xiaojin:smile', '那你一定要變成真正的劍仙回來喔！');
      } else if (!G.Quests.isDone('q_ahuang') && G.Quests.stage('q_ahuang') < 0) {
        await S.say('xiaojin:sad', '阿爸說，阿黃還是要送走……昨暝是阿黃救了我耶。');
        S.quest('q_ahuang', 0);
      } else await S.say('xiaojin:smile', '星河哥，你要變成真正的劍仙回來喔！');
    }
  }
  async function ahuangTalk(S) {
    const p = phase();
    if (p === 'P1') await S.say('', '「汪！」（尾巴搖成風車）');
    else if (p === 'P5') {
      await S.say('', '「汪。」');
      if (inParty('baizhi')) {
        await S.say('', '阿黃舔了舔白芷的手。');
        await S.say('baizhi:surprise', '牠……在吃我？');
        await S.say('xinghe:laugh', '是在說喜歡妳啦。');
      }
    } else if (G.Quests.isDone('q_ahuang')) await S.say('', '「汪汪！」（在小金腳邊打滾）');
    else await S.say('', '「嗚……」（趴著，望向礦坑的方向）');
  }
  async function atusimTalk(S) {
    const p = phase();
    // 心燈① delivery
    if (S.hasItem('key_watch') && ['P3', 'P5'].includes(p)) { await watchDeliver(S); return; }
    // 阿黃回家: ask her to vouch
    if (G.Quests.stage('q_ahuang') === 1 && !G.Quests.isDone('q_ahuang') && ['P3', 'P5'].includes(p)) {
      await S.say('xinghe:normal', '阿土嬸，小金家那隻黃狗……');
      await S.say('阿土嬸', '阿黃？牠還活著？');
      await S.say('阿土嬸', '那是我們阿土養的狗。阿土走了以後，我一個老人家顧不了，牠就……');
      await S.say('阿土嬸', '牠每天都去坑口等。等一個不會回來的人。');
      await S.say('阿土嬸', '我跟你去。我去跟阿旺講。');
      S.quest('q_ahuang', 2);
      S.objective('到小金家門口');
      return;
    }
    if (p === 'P5') {
      await S.say('阿土嬸', '昨暝那麼大的事……你們都沒事吧？');
      if (inParty('baizhi')) await S.say('阿土嬸', '這位姑娘，生得真水。星河，你要顧好人家。');
      if (G.Quests.isDone('q_atu_watch')) await S.say('阿土嬸', '錶我每天都有轉。你回來的時候，阿嬸告訴你現在幾點。');
    } else if (p === 'P3') {
      if (G.Quests.isDone('q_atu_watch')) { await S.say('阿土嬸', '錶在走。滴答、滴答，像他在旁邊打呼。'); return; }
      await S.say('阿土嬸', '坐，坐。要喝茶嗎？');
      await S.say('阿土嬸', '阿土那支錶啊，是他第一次挖到金仔，跑去淡水跟紅毛人買的。');
      await S.say('阿土嬸', '他說，有錶就知道什麼時候該回家。結果咧……');
    } else if (talked('atusim_P1') === 1) {
      await S.say('阿土嬸', '星河喔，又被陳伯叫去做事？');
      await S.say('阿土嬸', '乖，做完來阿嬸這，有糖仔給你。');
    } else {
      await S.say('阿土嬸', '我們阿土啊，以前每天都說酉時一定回來吃飯。');
      await S.say('阿土嬸', '從來沒準時過。飯熱了又熱……');
      await S.say('阿土嬸', '現在不用熱了。我還是擺兩副碗筷，習慣了。');
    }
  }
  async function awangTalk(S) {
    const p = phase();
    if (p === 'P1') {
      await S.say('阿旺', '吃飽要去金瓜石那邊上工。這碗稀飯就是我一天的本錢。');
      await S.say('阿旺', '我家那隻黃狗，三天兩頭往封掉的舊坑跑，叫都叫不回來！');
      await S.say('阿旺', '坑裡坍過方，死過人。我是驚囝仔跟著進去……');
      return;
    }
    if (p === 'P5' && !F('ch1_awang_gift')) {
      await S.say('阿旺', '昨暝要不是你們……小金他……');
      await S.say('阿旺', '我一個做粗工的，沒什麼能報答。這些你帶著。');
      S.flag('ch1_awang_gift');
      await S.give('jinchuang', 2);
      if (G.Quests.isDone('q_ahuang') || G.Quests.stage('q_ahuang') >= 0) return;
    }
    if (G.Quests.isDone('q_ahuang')) { await S.say('阿旺', p === 'P5' ? '出外要平安。' : '阿土兄的狗，就是咱的狗。'); return; }
    const st = G.Quests.stage('q_ahuang');
    if (st <= 0) {
      if (st < 0) {
        await S.say('阿旺', '星河，多謝你把狗帶出來。不過……');
        await S.say('阿旺', '牠再跑一次，小金也會跟著跑。我不能拿囝仔的命去賭。');
        await S.say('阿旺', '明天送去雞籠阿弟那邊。我也捨不得，可是……');
        S.quest('q_ahuang', 0);
      }
      const c = await S.choice(['「阿黃是阿土伯的狗！」', '「……我再想想。」'], { cancel: 1 });
      if (c !== 0) return;
      await S.say('xinghe:serious', '阿旺叔，阿黃以前是阿土伯的狗。牠跑去坑裡，是在找主人。');
      await S.say('阿旺', '阿土兄的狗？你怎麼知道？');
      await S.say('xinghe:think', '……說了你也不信。');
      await S.say('阿旺', '我是不信鬼話。除非有人作證。');
      S.quest('q_ahuang', 1);
      S.objective('找阿土嬸問問看');
    } else if (st === 1) await S.say('阿旺', '有人作證，我就信。');
    else await S.say('阿旺', '阿土嬸？她怎麼也來了……');
  }
  async function guopoTalk(S) {
    const p = phase();
    if (p === 'P5') {
      if (!F('ch1_guopo_gift') && inParty('baizhi')) {
        await S.say('粿婆', '姑娘，吃過草仔粿無？來，送妳一塊，阿婆請的。');
        await S.say('baizhi:surprise', '綠色的……是用草做的嗎？');
        await S.say('粿婆', '是艾草！吃了平安！');
        S.flag('ch1_guopo_gift');
        await S.give('caozaiguo', 1);
      } else await S.say('粿婆', '草仔粿喔——燒燒的草仔粿——');
    } else if (p === 'P3') await S.say('粿婆', '今暝我不去雞籠，老啦，擠不動。在家拜好兄弟就好。');
    else if (p === 'P2') {
      await S.say('粿婆', '你這囝仔，七月半鴨仔——毋知死活！礦坑也敢去！');
      await S.say('粿婆', '……帶兩塊粿去，餓了吃。');
    } else {
      await S.say('粿婆', '草仔粿喔——燒燒的草仔粿——');
      await S.say('粿婆', '艾草是我自己去山腳採的，別人家的沒這麼香。');
      if (!F('ch1_err_fude')) await S.say('粿婆', '陳伯拜土地公的粿，攏是跟我訂的。拿去，供品籃裡有了。');
    }
    await shopAt(S, ['caozaiguo', 'c1_honggui'], '粿婆的攤子', { caozaiguo: 36 });
  }
  async function azhuTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('阿珠', '昨暝我在窗戶縫偷看喔。那個長頭髮的姊姊在唱歌。');
      await S.say('阿珠', '好好聽。水鬼都哭了。');
    } else if (p === 'P3') {
      await S.say('阿珠', '阿母說今暝不帶我去雞籠，說小孩子去海邊會被抓交替。');
      await S.say('阿珠', '我又不會被抓！我會游泳！');
      await S.say('xinghe:serious', '……那更不能去。');
    } else if (talked('azhu_P1') === 1) {
      await S.say('阿珠', '七月不可以吹口哨！不可以撿路上的錢！不可以去玩水！');
      await S.say('阿珠', '還有，不可以拍別人的肩膀！');
      await S.say('xinghe:think', '為什麼？');
      await S.say('阿珠', '阿嬤說，人的頭頂跟兩邊肩膀，各有一把火。');
      await S.say('阿珠', '拍一下，火就熄一把，好兄弟就看得到你了！');
      await S.say('', '阿珠踮起腳尖，啪地拍了一下星河的肩膀。');
      S.emote('player', '!');
      S.sfx('hit');
      await S.say('阿珠', '啊！你的火熄了！');
      await S.say('xinghe:smug', '哥哥的火很旺的，拍不熄。');
    } else await S.say('阿珠', '你身上的火，一定是三把裡面最大的。');
  }
  async function jinxiaTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('錦霞嬸', '昨暝門口的供品，一夜之間全部變冷、變濕了，像泡過海水。');
      await S.say('錦霞嬸', '好兄弟……是不是吃不飽，才會上山來？');
    } else if (p === 'P3') {
      await S.say('錦霞嬸', '秋月講長明宮的燈很靈，說點一盞，好兄弟就不敢靠近。');
      await S.say('錦霞嬸', '我是覺得……人家好兄弟也是可憐人，幹嘛趕人家。');
    } else {
      await S.say('錦霞嬸', '拜門口，拜門口……三牲、米酒、粿，香插好——');
      await S.say('錦霞嬸', '金紙是敬神明，銀紙是給好兄弟。少年人，千萬莫燒毋著。');
      await S.say('錦霞嬸', '還有，不要叫「鬼」，要叫「好兄弟」。人家聽了會歡喜。');
    }
  }
  async function qiuyueTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('秋月嫂', '昨暝……我門口的長明燈符，自己燒起來了。藍色的火。');
      await S.say('秋月嫂', '這是保佑，還是……？');
    } else if (p === 'P3') {
      await S.say('秋月嫂', '我跟府城來的黃居士請了一張長明燈符，貼在門口。');
      await S.say('秋月嫂', '長明宮的夜玄法師，聽講是活菩薩呢。');
    } else {
      await S.say('秋月嫂', '星河！你們陳伯啊，一個男人家把你養這麼大，不簡單。');
      await S.say('秋月嫂', '十八年前那暝，整個九份都在講——陳師傅從海邊抱一個紅嬰仔回來。');
      await S.say('秋月嫂', '他抱孩子的樣子，像在抱一盞會漏油的燈。哈哈！');
    }
  }
  async function afaTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('阿發', '美玉跟阿德的事，我知道了。');
      await S.say('阿發', '也好，金仔留著給我阿母買一對金耳鉤。');
    } else if (p === 'P3') {
      await S.say('阿發', '舊坑裡有工頭的鬼？那個金貴仔？');
      await S.say('阿發', '……我好像，也該早點收工回家吃飯。');
    } else {
      await S.say('阿發', '看！金仔！拳頭這麼大……好啦，指甲這麼大。');
      await S.say('阿發', '再挖半年，我就要去跟美玉她阿爸提親！');
      await S.say('xinghe:think', '美玉？美玉不是跟阿德……');
      await S.say('阿發', '什麼？阿德？哪個阿德？');
      await S.say('xinghe:smile', '……沒事。祝你挖到拳頭那麼大的。');
    }
  }
  async function tiekouTalk(S) {
    const p = phase();
    if (p === 'P5') {
      if (inParty('baizhi') && talked('tiekou_P5') === 1) {
        await S.say('鐵口仙', '這位姑娘的腳步聲……很輕，像水。');
        await S.say('鐵口仙', '姑娘，伸手給老夫。');
        await S.say('', '白芷伸出手。鐵口仙摸了很久。');
        await S.say('鐵口仙', '……我看不到妳的命。');
        await S.say('鐵口仙', '不是沒有。是太大了，像海一樣，一眼看不完。');
        await S.say('baizhi:think', '太大的命……很重嗎？');
        await S.say('鐵口仙', '很重。所以，要有人幫妳一起扛。');
      } else await S.say('鐵口仙', '去吧。老夫在這棵榕樹下，等你們的故事。');
    } else if (p === 'P3') await S.say('鐵口仙', '今暝的海，有很多人要回來。不是好兄弟……是更遠的東西。');
    else if (talked('tiekou_P1') === 1) {
      await S.say('鐵口仙', '少年仔，你的腳步聲，我記得。陳師傅家的。');
      await S.say('鐵口仙', '來，八字報給我，免錢。');
      await S.say('xinghe:sad', '我不知道我的八字。我是被撿到的。');
      await S.say('鐵口仙', '那就伸手。……嗯？');
      await S.say('鐵口仙', '奇怪……奇怪。');
      await S.say('鐵口仙', '你這個命，缺了一盞燈。');
      await S.say('xinghe:surprise', '燈？我家就是賣燈的耶。');
      await S.say('鐵口仙', '……也許，就是因為缺，才被送到賣燈的人家。');
    } else await S.say('鐵口仙', '天機不可洩漏——其實是我也看不懂。');
  }
  async function tiandingTalk(S) {
    const p = phase();
    if (p === 'P5') {
      if (!F('ch1_xianghuo_gift') && inParty('baizhi')) {
        S.flag('ch1_xianghuo_gift');
        await S.say('添丁伯', '姑娘，過來。');
        await S.say('', '添丁伯把一個小小的紅布袋放在白芷手心。');
        await S.give('c1_xianghuo', 1);
        await S.say('添丁伯', '土地公爐的香火袋。出門在外，帶著保平安。');
        await S.say('baizhi:think', '土地公……是誰？');
        await S.say('添丁伯', '是照顧這片土地、照顧這裡每一個人的神明。');
        await S.say('baizhi:think', '……那祂也會照顧我嗎？我不是這裡的人。');
        await S.say('添丁伯', '妳現在站在九份的土地上，就是九份的人。');
        await S.say('baizhi:shy', '……');
        await S.say('', '香火袋，暖暖的。');
      } else await S.say('添丁伯', '土地公會保庇你們。路上遇到土地公廟，記得拜一下。');
    } else if (p === 'P3') await S.say('添丁伯', '早上那陣香煙，攏往海那邊飄……我掃了四十年的廟埕，沒見過。');
    else if (!F('ch1_err_fude')) {
      await S.say('添丁伯', '星河啊，陳師傅叫你來的？供品籃帶來了就來福德祠前面拜。');
    } else {
      await S.say('添丁伯', '土地公——福德正神，是咱九份的大家長。');
      await S.say('添丁伯', '礦工落坑前，攏會來這裡拜一下，求平安出坑。');
      await S.say('添丁伯', '七月，好兄弟來作客，土地公也在看顧，叫大家守規矩。');
    }
  }
  async function ashuiTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('阿水', '昨暝所有的燈，攏漂回岸邊了。整片沙灘，一層燈殼。');
      await S.say('阿水', '討海人看了，今天沒人敢出船。');
    } else if (p === 'P3') {
      await S.say('阿水', '今暝望海巷那邊的水燈頭要下水，我們漁船要幫忙推出去。');
      await S.say('阿水', '燈漂得越遠，今年就越好討海！');
    } else {
      if (G.Quests.stage('q_xingmu') >= 0 && !G.Quests.isDone('q_xingmu') && !F('ch1_ashui_fish') && !S.hasItem('c1_xingmu')) {
        await S.say('xinghe:think', '阿水叔，你有沒有小魚乾？要給貓的。');
        await S.say('阿水', '要給貓的？來，一尾小魚乾，送你啦！');
        S.flag('ch1_ashui_fish');
        await S.give('c1_dried_fish', 1);
        return;
      }
      await S.say('阿水', '早起的魚最鮮！八斗子剛上岸的！');
      await S.say('阿水', '七月莫去溪邊海邊。水鬼要抓交替，抓一個人替他死，他才能去投胎。');
      await S.say('阿水', '我阿兄就是……算了，不講了。七月講這個不好。');
    }
  }
  async function ajiuTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('阿九', '昨暝我躲在牆角，看到那個姑娘唱歌。');
      await S.say('阿九', '水鬼一個一個變成光，往海那邊飄走……');
      await S.say('阿九', '我活到四十歲，第一次覺得——死了，也許會有人唱歌給我聽。');
    } else if (p === 'P3') {
      await S.say('阿九', '今暝我也要放一盞水燈。寫我阿娘的名字。');
      await S.say('阿九', '她在唐山，不知道還在不在。燈漂過黑水溝……也許她看得到。');
    } else {
      await S.say('阿九', '我？我叫阿九。從唐山過來，揹土、挑擔、挖坑，什麼都做。');
      await S.say('阿九', '沒娶某，沒厝，一個人。人家叫我們「羅漢腳仔」。');
      await S.say('阿九', '羅漢腳死了，沒人拜。所以七月，我攏準備一份——給自己。');
      await S.say('xinghe:sad', '……阿九叔。');
      await S.say('阿九', '哈哈，莫用那款眼神看我！我還活跳跳的！');
    }
  }
  async function huangTalk(S) {
    if (phase() === 'P3') {
      await S.say('黃居士', '今暝長明宮的墨鴉使者會到雞籠主普壇，親自發長明燈符！');
      await S.say('黃居士', '一定要去領一張！');
      return;
    }
    await S.say('黃居士', '鄉親！府城長明宮的長明燈，點一盞，全家平安！');
    await S.say('黃居士', '夜玄法師慈悲為懷，燈一點就永不熄滅，好兄弟不敢近身。');
    await S.say('xinghe:think', '永遠不熄的燈？那燈油錢很貴吧。');
    await S.say('黃居士', '哈哈，法師分文不取！只要誠心。');
    await S.say('黃居士', '聽說啊，長明燈照著的人，連死了都不會被忘記——');
    await S.say('黃居士', '……好啦，講太多了。少年仔，有興趣再來找我。');
  }
  async function adeTalk(S) {
    const p = phase();
    if (p === 'P5') {
      await S.say('阿德', '昨暝……我們的水燈，也漂回來了。');
      await S.say('美玉', '我才不管什麼兆頭。');
      await S.say('美玉', '燈漂回來，就再放一次。放到它漂走為止。');
      if (inParty('baizhi')) {
        await S.say('baizhi:smile', '……好厲害。');
        await S.say('美玉', '什麼？');
        await S.say('baizhi:smile', '人，好厲害。');
      }
    } else if (p === 'P3') {
      await S.say('美玉', '阿爸說，挖金的阿發要來提親……');
      await S.say('阿德', '我今暝在水燈上寫我們的名字。燈漂得遠，就是天公伯答應了。');
    } else {
      await S.say('美玉', '阿德，今暝的水燈……我們要寫什麼？');
      await S.say('阿德', '寫「阿德美玉，年年有餘」。');
      await S.say('美玉', '那是過年的春聯啦！');
      S.face('ade', 'player'); S.face('meiyu', 'player');
      S.emote('ade', '!'); S.emote('meiyu', '!');
      await S.say('阿德', '星、星河！你什麼都沒聽到！');
      await S.say('xinghe:smug', '我什麼都沒聽到——「年年有餘」。');
    }
  }
  async function heitangTalk(S) {
    const q = G.state.quests.q_xingmu;
    if (!q || q.done || q.stage >= 3) { await S.say('', '一隻黑貓。瞇著眼睛看你，好像你欠牠錢。'); return; }
    if (q.stage === 0) {
      await S.say('', '黑糖叼著醒木，瞪著你。');
      const c = await S.choice(['抓住牠！', '算了'], { cancel: 1 });
      if (c !== 0) return;
      S.emote('heitang', '!');
      S.sfx('miss');
      await S.say('', '黑糖一溜煙跳走。');
      await S.say('xinghe:angry', '給我站住！');
      S.quest('q_xingmu', 1);
      S.objective('追上黑糖（暗街仔的晾衣竿那邊）');
      phaseRefresh({ bgm: false });
    } else if (q.stage === 1) {
      await S.say('', '黑糖從晾著的衫褲中間鑽過去，一件內衫掛在星河頭上。');
      S.emote('player', '💧');
      await S.say('錦霞嬸', '哎喲！我的衫！');
      await S.say('xinghe:hurt', '不是我！是貓！');
      S.quest('q_xingmu', 2);
      S.objective('追上黑糖（福德祠那邊）');
      phaseRefresh({ bgm: false });
    } else if (q.stage === 2) {
      if (!S.hasItem('c1_dried_fish')) {
        await S.say('', '黑糖睡得正香，肚子底下壓著醒木。硬搶的話，牠一定會醒來逃走。');
        await S.say('xinghe:think', '……要是有什麼好吃的可以跟牠換就好了。');
        return;
      }
      const c = await S.choice(['用小魚乾換', '算了'], { cancel: 1 });
      if (c !== 0) return;
      S.take('c1_dried_fish', 1);
      await S.say('', '黑糖睜開一隻眼，聞了聞，叼起小魚乾，懶洋洋地讓出醒木。');
      await S.give('c1_xingmu', 1);
      await S.say('添丁伯', '哈哈，這隻貓每天都來土地公這裡睡午覺。土地公也拿牠沒法度。');
      S.quest('q_xingmu', 3);
      S.objective('把醒木還給阿炳伯');
      phaseRefresh({ bgm: false });
    }
  }

  // =================================================================================================== 1.9 舊金礦坑・上層
  const MINE1 = [
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 0
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 1
    'CCvvvvvvvvvvvCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 2  bat cave
    'CCvvcvvvvvvvvCCCCCCCCCCCCCvLvCCCCCCCCCCC', // 3  L ladder (27,3)
    'CCvvvvvvvvvvvCCCCCCCCCCCCCvvvCCCCCCCCCCC', // 4
    'CCvvvvvvvvvvvCCCCCCCCCCCCCvvvCCCCCCCCCCC', // 5
    'CCvvvvvvvvvvvCCCCCCCCCCCCCvvvCCCCCCCCCCC', // 6
    'CCvvvvvvvvvvvCCCCCCCCCCCCCvRvCCCCCCCCCCC', // 7  rubble ① (main)
    'CCvvvvvvvvvvvCCCCCCCCCCCCCC+CCCCCCCCCCCC', // 8
    'CCCCCvvCCCCCCCCCCCCCCCCCCCC+CCCCCCCCCCCC', // 9
    'CCCCCvvCCCCCCCCCCCCCCCCCCCC+CCCCCCCCCCCC', // 10
    'CCCCCvvCCCCCCCCCCCCCCCCCCCC+CCCCCCCCCCCC', // 11
    'CCCvvvvvvvCCCCCCCCCCCCCCCCC+CCCCCCCvvvvC', // 12 east room
    'CCCvvvvvvvCCCCCCCCCCCCCCCCC+CCCCCCCvvlvC', // 13 l ladder (37,13)
    'CCCvvvvvvvvvvvvvvvvvvvvvvvv+vvCCCCCvvvvC', // 14
    'CCCvvvvvvvvvvvavvvvvvvvvvvv+bvCCCCCvvvvC', // 15 switches a (14,15) b (28,15)
    'CCCvvvD++++++++1+++++++++++2++++++rvvvvC', // 16 cart (6,16); junctions (15,16) (27,16); rubble ② (34,16)
    'CCCvvvvvvvvvvvv+vvvvvvvvvvvvvvCCCCCvvvvC', // 17
    'CCCvvvvvvvvvvvv+vvvvvvvvvvvvvvCCCCCvvvvC', // 18 central pit
    'CCCvvvvvvvvvvvv+vvvvvvvvvvvvvvCCCCCvvcvC', // 19
    'CCCCCCCCCCCCCCC+CCvvvvCCCCCCvvCCCCCvvvvC', // 20
    'CCCCCCCCCCCCCCC+CCvvvvCCCCCCvvCCCCCCCCCC', // 21
    'CCCCCCCCCCCCCCC+CCvvvvCCCCCCvvCCCCCCCCCC', // 22
    'CCCCCCCCCCCCCCC+CCvvvvCCCCCCvvCCCCCCCCCC', // 23
    'CCCCCCCCCCCCCCCxCCvvvvCCCCCCCvvvvvvvvvCC', // 24 buffer (15,24)
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvvvCC', // 25
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvvvCC', // 26
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvvvCC', // 27
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvvvCC', // 28
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvvvCC', // 29
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvvvCC', // 30
    'CCCCCCCCCCCCCCCCCCvvvvCCCCCCCvvvvvvvcvCC', // 31
    'CCCCCCCCCCCCCCCvvvvvvvvvvCCCCvvvvvvvvvCC', // 32
    'CCCCCCCCCCCCCCCvvvvvvvvvvCCCCvvvvvvvvvCC', // 33
    'CCCCCCCCCCCCCCCvv$vvvvvvvCCCCCCCCCCCCCCC', // 34 save (17,34)
    'CCCCCCCCCCCCCCCvvvvvvvvvvCCCCCCCCCCCCCCC', // 35 entrance hall
    'CCCCCCCCCCCCCCCvvvvvvvvvvCCCCCCCCCCCCCCC', // 36
    'CCCCCCCCCCCCCCCvvvvvvvvcvCCCCCCCCCCCCCCC', // 37
    'CCCCCCCCCCCCCCCvvvvvvvvvvCCCCCCCCCCCCCCC', // 38
    'CCCCCCCCCCCCCCCCCCCvvCCCCCCCCCCCCCCCCCCC', // 39 exit → 九份
  ];
  const MINE_LEGEND = { C: 'cave_wall', v: 'cave', '+': 'rail', D: 'rail', 1: 'rail', 2: 'rail', x: 'rail', L: 'cave', l: 'cave', R: 'cave', r: 'cave', a: 'cave', b: 'cave', c: 'cave', $: 'cave' };
  const mineLight = (st) => ({ ambient: 0.88, color: '#020308', playerR: st.inv.c1_lantern ? 220 : 120, playerColor: '#ffc070', glow: 0.4 });
  const FXM = { cart: null, dust: [] };
  G.Maps.define('mine_1', {
    name: '舊金礦坑・上層',
    subtitle: '三年前坍方後封閉的金坑',
    place: 'jiufen',
    bgm: 'mine',
    start: [19, 38],
    bg: '#030305',
    light: mineLight,
    particles: ['dust'],
    legend: MINE_LEGEND,
    tiles: MINE1,
    objects: (st) => [
      { key: 'cart', t: 'cart', x: 6, y: 16 },
      { key: 'swA', t: 'switch', x: 14, y: 15, on: (st.vars.swA || 'S') === 'E', solid: true },
      { key: 'swB', t: 'switch', x: 28, y: 15, on: (st.vars.swB || 'E') === 'N', solid: true },
      ...[26, 27, 28].map((x) => ({ t: 'rock_small', x, y: 7, if: (s) => !s.flags.ch1_cart_main })),
      { t: 'rock_big', x: 34, y: 15, if: (s) => !s.flags.ch1_cart_side },
      { t: 'fence_wood', x: 15, y: 24, w: 1 },
      { t: 'stairs_down', x: 27, y: 3 }, { t: 'stairs_down', x: 37, y: 13 },
      { t: 'signboard', x: 7, y: 15, text: '阿土' }, { t: 'signboard', x: 16, y: 17, text: '廢坑勿入' }, { t: 'signboard', x: 29, y: 17, text: '北大坑東老坑' },
      ...[[17, 33], [22, 33], [19, 21], [11, 15], [28, 17]].map(([x, y]) => ({ t: 'lamp_post', x, y, lit: true, text: '礦' })),
      { t: 'stone_lantern', x: 17, y: 34, lit: true },
      { t: 'log', x: 15, y: 32 }, { t: 'crate', x: 24, y: 35 }, { t: 'barrel', x: 15, y: 36 }, { t: 'basket', x: 24, y: 32, v: 3 },
      { t: 'log', x: 3, y: 18 }, { t: 'crate', x: 29, y: 14 }, { t: 'barrel', x: 3, y: 12 }, { t: 'crate', x: 9, y: 12 },
      { t: 'log', x: 30, y: 24 }, { t: 'barrel', x: 37, y: 25 }, { t: 'crate', x: 2, y: 8 }, { t: 'crystal', x: 12, y: 2 }, { t: 'crystal', x: 38, y: 20 - 3 },
      { t: 'rock_small', x: 20, y: 25 }, { t: 'rock_small', x: 33, y: 33 }, { t: 'rock_small', x: 6, y: 6 },
    ],
    chests: [
      { id: 'ch1_c_m1a', x: 4, y: 3, item: 'jinchuang', n: 2 },
      { id: 'ch1_c_m1b', x: 37, y: 19, item: 'c1_miner_cloth', n: 1, run: () => tutorial('tut_equip') },
      { id: 'ch1_c_m1c', x: 36, y: 31, item: 'c1_gold_dust', n: 2 },
      { id: 'ch1_c_m1d', x: 23, y: 37, item: 'caozaiguo', n: 1 },
    ],
    enemies: [
      { id: 'm1a', troop: 'mine_1', x: 21, y: 36, lv: 2, radius: 2 },
      { id: 'm1b', troop: 'mine_2', x: 19, y: 26, lv: 2 },
      { id: 'm1c', troop: 'mine_3', x: 22, y: 18, lv: 3 },
      { id: 'm1d', troop: 'mine_5', x: 12, y: 18, lv: 2 },
      { id: 'm1e', troop: 'mine_5', x: 7, y: 5, lv: 2 },
      { id: 'm1f', troop: 'mine_4', x: 10, y: 3, lv: 3 },
      { id: 'm1g', troop: 'mine_4', x: 33, y: 28, lv: 3 },
      { id: 'm1h', troop: 'mine_4', x: 35, y: 31, lv: 3, radius: 2 },
      { id: 'm1i', troop: 'mine_3', x: 36, y: 17, lv: 3, radius: 2 },
    ],
    warps: [
      { x: 19, y: 39, w: 2, to: 'jiufen', tx: 35, ty: 32, tdir: 'down' },
      { x: 27, y: 3, to: 'mine_2', tx: 25, ty: 4, tdir: 'down' },
      { x: 37, y: 13, to: 'mine_2', tx: 3, ty: 4, tdir: 'down' },
    ],
    onEnter: () => { liveBg(MS()); FXM.dust = []; },
    drawGround: (ctx, t) => {
      // chalk arrows on the two junctions show where the switches point
      const arrow = (x, y, dir) => {
        const cx = x * T + 32, cy = y * T + 32;
        const [dx, dy] = U.dirs[dir];
        ctx.save(); ctx.strokeStyle = 'rgba(240,236,220,0.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - dx * 14, cy - dy * 14); ctx.lineTo(cx + dx * 14, cy + dy * 14);
        ctx.moveTo(cx + dx * 14, cy + dy * 14); ctx.lineTo(cx + dx * 6 - dy * 7, cy + dy * 6 + dx * 7);
        ctx.moveTo(cx + dx * 14, cy + dy * 14); ctx.lineTo(cx + dx * 6 + dy * 7, cy + dy * 6 - dx * 7);
        ctx.stroke(); ctx.restore();
      };
      arrow(15, 16, (V().swA || 'S') === 'S' ? 'down' : 'right');
      arrow(27, 16, (V().swB || 'E') === 'N' ? 'up' : 'right');
    },
    drawOver: (ctx, t) => {
      for (const d of FXM.dust) { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - d.t / 1.2) * 0.5; ctx.fillStyle = '#a89a80'; ctx.beginPath(); ctx.arc(d.x, d.y - d.t * 30, 18 + d.t * 40, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    },
    onUpdate: (dt) => { for (const d of FXM.dust) d.t += dt; FXM.dust = FXM.dust.filter((d) => d.t < 1.2); },
    events: [
      { id: 'enter', trigger: 'auto', once: true, run: (S) => mineEnter(S) },
      { id: 'cart', trigger: 'action', x: 6, y: 16, w: 2, label: '推礦車', run: (S) => pushCart(S) },
      { id: 'swA', trigger: 'action', x: 14, y: 15, label: '轉轍器', run: (S) => flipSwitch(S, 'A') },
      { id: 'swB', trigger: 'action', x: 28, y: 15, label: '轉轍器', run: (S) => flipSwitch(S, 'B') },
      { id: 'sign1', trigger: 'action', x: 7, y: 15, label: '告示', run: async (S) => {
        await S.say('', '粉筆字寫著：「礦車推一下會自己溜。轉轍器先扳好，莫撞去廢坑。——阿土」');
        if (!F('ch1_sign_atu')) { S.flag('ch1_sign_atu'); await S.say('xinghe:think', '阿土……？阿土嬸家的阿土伯？'); }
      } },
      { id: 'sign2', trigger: 'action', x: 16, y: 17, label: '告示', run: (S) => S.say('', '「廢坑・勿入」') },
      { id: 'sign3', trigger: 'action', x: 29, y: 17, label: '告示', run: (S) => S.say('', '「往北：大坑（金脈）　往東：老坑道（風大，莫去）」') },
      { id: 'rubble', trigger: 'touch', x: 27, y: 8, once: true, if: (st) => !st.flags.ch1_cart_main, run: async (S) => {
        S.face('player', 'up');
        await S.say('', '石堆把通道堵得死死的。石縫深處傳來狗叫聲。');
        await S.say('xinghe:think', '堵住了……阿黃是從哪裡鑽過去的？狗洞嗎？');
        await S.say('xinghe:think', '這麼大的石頭，我用竹劍敲到明年也敲不開。');
        S.objective('想辦法清開坍方的石堆');
      } },
      { id: 'rubble2', trigger: 'action', x: 34, y: 16, label: '調查', if: (st) => !st.flags.ch1_cart_side, run: (S) => S.say('', '坍下來的大石頭。石縫裡灌出冷冷的風。') },
      { id: 'save', trigger: 'action', x: 17, y: 34, label: '燈龕', run: (S) => savePoint(S, '岩壁上鑿出的小龕，裡面供著一盞油燈。礦工們落坑前，會在這裡點燈。記下旅程？') },
    ],
  });
  async function mineEnter(S) {
    S.bgm('mine');
    await S.say('', '漆黑。提燈的光圈照出潮濕的岩壁和生鏽的鐵軌。');
    await S.say('xinghe:think', '好冷……外面明明是七月。');
    await S.say('xinghe:serious', '阿黃！阿黃——！');
    await S.say('', '遠方：「汪……」黑暗中，兩隻蝙蝠撲騰著掠過光圈。');
    await tutorial('tut_field_enemy');
  }
  async function flipSwitch(S, which) {
    const key = which === 'A' ? 'swA' : 'swB';
    const cur = V()[key] || (which === 'A' ? 'S' : 'E');
    const names = which === 'A' ? { S: '南（廢坑）', E: '東' } : { N: '北（大坑）', E: '東（老坑道）' };
    await S.say('', `轉轍器。現在指向：${names[cur]}。`);
    const c = await S.choice(['扳動', '不動'], { cancel: 1 });
    if (c !== 0) return;
    const next = which === 'A' ? (cur === 'S' ? 'E' : 'S') : (cur === 'N' ? 'E' : 'N');
    V()[key] = next;
    S.sfx('switch');
    const o = objAt(key);
    if (o) o.on = which === 'A' ? next === 'E' : next === 'N';
    S.toast(`轉轍器指向：${names[next]}`, 'key');
  }
  function cartRoute() {
    const A = V().swA || 'S', B = V().swB || 'E';
    const pts = [];
    for (let x = 8; x <= 15; x++) pts.push([x, 16, 'h']);
    if (A === 'S') { for (let y = 17; y <= 23; y++) pts.push([15, y, 'v']); return { pts, end: 'fence' }; }
    for (let x = 16; x <= 27; x++) pts.push([x, 16, 'h']);
    if ((V().swB || 'E') === 'N' && B === 'N') { for (let y = 15; y >= 8; y--) pts.push([27, y, 'v']); return { pts, end: F('ch1_cart_main') ? 'stop' : 'R' }; }
    for (let x = 28; x <= 33; x++) pts.push([x, 16, 'h']);
    return { pts, end: F('ch1_cart_side') ? 'stop' : 'r' };
  }
  const cartXY = ([fx, fy, kind]) => (kind === 'h' ? [fx - 1, fy] : [fx - 0.5, fy - 0.2]);
  async function rollCart(S, cart, pts, speed0, accel) {
    const ms = MS();
    let sp = speed0;
    for (const p of pts) {
      const [x, y] = cartXY(p);
      const [tx, ty] = ms.clampCam((x + 1) * T - G.W / 2, y * T + T / 2 - G.H / 2);
      ms.cam.tx = tx; ms.cam.ty = ty; ms.cam.speed = 10;
      await G.Tweens.to(cart, { x, y }, dur(sp), 'linear');
      if (Math.random() < 0.35) S.sfx('step');
      sp = Math.max(0.05, sp * accel);
    }
  }
  async function pushCart(S) {
    if (F('ch1_cart_main') && F('ch1_cart_side')) { await S.say('', '礦車的輪子歪了。辛苦你了。'); return; }
    const c = await S.choice(['推礦車', '不推'], { cancel: 1 });
    if (c !== 0) return;
    const ms = MS();
    const cart = objAt('cart');
    if (!cart) return;
    S.setPos('player', 5, 16, 'right');
    await wait(S, 0.2);
    S.sfx('push');
    S.flag('ch1_cart_pushed');
    const { pts, end } = cartRoute();
    await rollCart(S, cart, pts, 0.16, 0.9);
    const last = pts[pts.length - 1];
    if (end === 'fence') {
      S.sfx('hit'); S.sfx('guard', 0.05); S.shake(4, 0.25);
      await S.say('', '礦車撞上擋車木，「咚」一聲，又慢慢溜回原處。');
      await rollCart(S, cart, pts.slice(0, -1).reverse().concat([[7, 16, 'h']]), 0.08, 1);
      await S.say('xinghe:think', '……方向不對。');
    } else if (end === 'R' || end === 'r') {
      S.sfx('shatter'); S.sfx('earth', 0.05); S.shake(8, 0.5);
      const [lx, ly] = end === 'R' ? [27, 7] : [34, 16];
      for (let i = 0; i < 4; i++) FXM.dust.push({ x: (lx + U.rand(-0.5, 1.5)) * T, y: (ly + U.rand(0, 1)) * T, t: -i * 0.08 });
      S.flag(end === 'R' ? 'ch1_cart_main' : 'ch1_cart_side');
      ms.computeSolid();
      await wait(S, 0.8);
      if (end === 'R') {
        await S.say('', '礦車沿著鐵軌一路加速，轟隆一聲撞進石堆。碎石四濺。');
        await S.say('xinghe:laugh', '開了！');
        S.objective('往礦坑深處找阿黃');
      } else {
        await S.say('', '礦車撞進東邊的石堆。石堆崩開，一陣冰冷的風從裡面灌出來，提燈的火苗猛地一歪。');
        await S.say('xinghe:think', '這邊也開了……風好大。');
      }
      await rollCart(S, cart, pts.slice(0, -1).reverse().concat([[7, 16, 'h']]), 0.05, 1);
    } else {
      await S.say('', `礦車滑到盡頭，停了下來。${last[2] === 'v' ? '北邊' : '東邊'}已經通了。`);
      await rollCart(S, cart, pts.slice(0, -1).reverse().concat([[7, 16, 'h']]), 0.05, 1);
    }
    cart.x = 6; cart.y = 16;
    ms.computeSolid();
    await camBack(S, 0.5);
  }

  // =================================================================================================== 1.10 舊金礦坑・下層（金脈大廳）
  const MINE2 = [
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 0
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 1
    'CCvvvvvCCCCCCCCCCCCCCCvvvvvCCC', // 2
    'CCvlvvvCCCCCCCCCCCCCCCvvvLvCCC', // 3  l (3,3) → mine_1 (37,14); L (25,3) → mine_1 (27,4)
    'CCvvvvcCCCCCCCCCCCCCCCvvvvvCCC', // 4  west branch
    'CCvvvvvCCCCCCCCCCCCCCCvvvvvCCC', // 5  east ramp
    'CCvvvvvCCCCCCCCCCCCCCCvv$vvCCC', // 6  save (24,6)
    'CCvvvvvCCCCCCCCCCCCCCCvvvvvCCC', // 7
    'CCvvvvvCCCCCCCCCCCCCCCvvvvvCCC', // 8
    'CCvvvvvCCCCCCCCCCCCCCCvvvvvCCC', // 9
    'CCvvvCCCCCCCCCCCCCCCCCvvcvvCCC', // 10 wind tunnel (2–4, 10–18)
    'CCvvv3CCCCCCCCCCCCCCCCvvvvvCCC', // 11 lamp 下 (5,11)
    'CCvvvCCCCCCCCCCCCCCCCCvvvvvCCC', // 12
    'CCvvvCCCCCwwwwwwwwwwwwwwowwCCC', // 13 underground stream; stepping stones (24,13–15)
    'CCvvv1CCCCwwwwwwwwwwwwwwowwCCC', // 14 lamp 一 (5,14)
    'CCvvvCCCCCwwwwwwwwwwwwwwowwCCC', // 15
    'CCvvvCCCCvvvvvvvvvvvvvvvvvCCCC', // 16
    'CCvvv2CCCvvvvvvvvvvvvvvvvvCCCC', // 17 lamp 丅 (5,17)
    'CCvvvCCCCvvvvvvvvvvvvvvvvvCCCC', // 18 gold-vein hall (9–25, 16–27)
    'CCvvvvvCCvvvvvvvvvvvvvvvvvCCCC', // 19 cave-in room (2–6, 19–24)
    'CCvvvvvCCvvvvvvvFvvvvvvvvvCCCC', // 20 foreman (17,20)
    'CCvvvvvCCvvvvvvvvvvvvvvvvvCCCC', // 21
    'CCvvvvvCCvvAdvvvvvvvvvvvvvCCCC', // 22 阿土伯 (11,22) 阿黃 (12,22)
    'CCvWvvvCCvvvvvvvvvvvvvvvvvCCCC', // 23 watch (3,23)
    'CCvvvvvCCvvvvvvvvvvvvvvvvvCCCC', // 24
    'CCCCCCCCCvvvvvvvvvvvvvvvvvCCCC', // 25
    'CCCCCCCCCvcvvvvvvvvvvvQvvvCCCC', // 26 cage (22,26)
    'CCCCCCCCCvvvvvvvvvvvvvvvvvCCCC', // 27
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 28
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', // 29
  ];
  const MINE2_LEGEND = Object.assign({}, MINE_LEGEND, { w: 'deepwater', o: 'shallow', 1: 'cave_wall', 2: 'cave_wall', 3: 'cave_wall', F: 'cave', A: 'cave', d: 'cave', W: 'cave', Q: 'cave' });
  const WIND_LAMPS = { w1: [5, 14, '一'], w2: [5, 17, '丅'], w3: [5, 11, '下'] };
  const FXM2 = { apps: [], lit: 0 };
  G.Maps.define('mine_2', {
    name: '舊金礦坑・下層',
    subtitle: '金脈大廳',
    place: 'jiufen',
    bgm: 'mine',
    start: [25, 4],
    bg: '#030305',
    light: (st) => Object.assign(mineLight(st), { ambient: 0.84 }),
    particles: ['dust'],
    legend: MINE2_LEGEND,
    tiles: MINE2,
    objects: (st) => {
      const lit = st.vars.windLit || [];
      return [
        { t: 'stairs_down', x: 3, y: 3 }, { t: 'stairs_down', x: 25, y: 3 },
        ...Object.entries(WIND_LAMPS).map(([k, [x, y, txt]]) => ({ key: k, t: 'lamp_post', x, y, text: txt, lit: !!st.flags.ch1_wind_done || lit.includes(k) })),
        ...[24].flatMap((x) => [13, 14, 15].map((y) => ({ t: 'rock_small', x, y, solid: false, alpha: 0.85 }))),
        ...[[9, 18], [25, 17], [9, 24], [25, 21], [13, 27], [20, 27]].map(([x, y]) => ({ t: 'crystal', x, y })),
        { t: 'stairs_up', x: 22, y: 26 }, { t: 'signboard', x: 23, y: 25, text: '吊籠' },
        { t: 'stone_lantern', x: 24, y: 6, lit: true },
        { t: 'log', x: 10, y: 16 }, { t: 'log', x: 18, y: 26 }, { t: 'crate', x: 24, y: 23 }, { t: 'barrel', x: 22, y: 2 },
        { t: 'basket', x: 5, y: 21, v: 3 }, { t: 'rock_big', x: 5, y: 23 }, { t: 'rock_small', x: 2, y: 19 }, { t: 'rock_small', x: 6, y: 9 },
        { t: 'bones', x: 4, y: 20 },
      ];
    },
    lights: () => {
      const out = [{ x: 17, y: 21, r: 360, color: '#ffd070', flicker: 0.15 }];
      for (const [x, y] of [[9, 18], [25, 17], [9, 24], [25, 21], [13, 27], [20, 27]]) out.push({ x, y, r: 120, color: '#ffcf60', flicker: 0.3 });
      for (const ap of FXM2.apps) if (ap.a > 0.05) out.push({ x: ap.x, y: ap.y - 0.6, r: 140 * ap.a, color: ap.art === 'miner_ghost' ? '#ffd070' : '#bfe0ff', flicker: 0.2 });
      return out;
    },
    chests: [
      { id: 'ch1_c_m2a', x: 6, y: 4, item: 'c1_salt', n: 3 },
      { id: 'ch1_c_m2b', x: 10, y: 26, item: 'c1_oolong', n: 2 },
      { id: 'ch1_c_m2c', x: 24, y: 10, item: 'jinchuang', n: 1 },
    ],
    npcs: [
      { id: 'atu', sprite: 'miner', portrait: 'atu', x: 11, y: 22, dir: 'down', ghost: true,
        if: (st) => st.flags.ch1_atu_met && !(G.Quests.isDone('q_atu_watch') && G.Quests.isDone('q_ahuang')), talk: (S) => atuTalk(S) },
    ],
    enemies: [
      { id: 'm2a', troop: 'mine_3', x: 24, y: 9, lv: 3, radius: 2 },
      { id: 'm2b', troop: 'mine_4', x: 20, y: 24, lv: 3, if: (st) => !!st.flags.ch1_foreman },
      { id: 'm2c', troop: 'mine_4', x: 4, y: 6, lv: 3, radius: 2 },
      { id: 'm2d', troop: 'mine_5', x: 3, y: 16, lv: 3, radius: 1, if: (st) => !!st.flags.ch1_wind_done },
    ],
    warps: [
      { x: 25, y: 3, to: 'mine_1', tx: 27, ty: 4, tdir: 'down' },
      { x: 3, y: 3, to: 'mine_1', tx: 37, ty: 14, tdir: 'down' },
    ],
    onEnter: () => { liveBg(MS()); FXM2.apps = []; },
    drawGround: (ctx, t) => {
      // gold veins glinting in the hall walls
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const x = (9 + U.hash(i, 1, 41) * 17) * T, y = (15.6 + (U.hash(i, 2, 42) < 0.5 ? 0 : 12)) * T + U.hash(i, 3, 43) * 20;
        glow(ctx, x, y, 5 + 4 * Math.sin(t * 2 + i), '#ffd870', 0.5 + 0.4 * Math.sin(t * 1.3 + i * 1.7));
      }
      ctx.restore(); ctx.globalAlpha = 1;
      // the wind tunnel: streaks blowing north until the lamps are lit
      if (!F('ch1_wind_done')) {
        ctx.save(); ctx.beginPath(); ctx.rect(2 * T, 10 * T, 3 * T, 9 * T); ctx.clip();
        ctx.strokeStyle = 'rgba(220,235,255,0.35)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 16; i++) {
          const x = 2 * T + U.hash(i, 1, 9) * 3 * T, off = ((t * 380 + i * 61) % (9 * T + 80));
          const y = 19 * T - off;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t * 3 + i) * 4, y + 40); ctx.stroke();
        }
        ctx.restore();
      }
      // the cage's ropes disappearing into the dark above
      ctx.save(); ctx.strokeStyle = '#6a5034'; ctx.lineWidth = 3;
      for (const dx of [14, 50]) { ctx.beginPath(); ctx.moveTo(22 * T + dx, 23 * T); ctx.lineTo(22 * T + dx, 26 * T + 8); ctx.stroke(); }
      ctx.restore();
    },
    drawOver: (ctx, t) => drawApps(ctx, t, FXM2.apps),
    update3d: (view, dt) => sync3d(view, dt, appSpecs(FXM2.apps, 'm')),
    events: [
      { id: 'foreman', trigger: 'touch', x: 9, y: 16, w: 17, if: (st) => !st.flags.ch1_foreman, run: (S) => scene17(S) },
      { id: 'wind_block', trigger: 'touch', x: 2, y: 18, w: 3, if: (st) => !st.flags.ch1_wind_done, run: async (S) => {
        S.shake(3, 0.3); S.sfx('wind');
        S.setPos('player', 3, 16, 'up');
        MS().snapCamera();
        if (!F('ch1_wind_told')) { S.flag('ch1_wind_told'); await S.say('xinghe:hurt', '風太大了，提燈快被吹熄……得先把牆上的燈點起來。'); }
        else S.toast('風太大了！', 'misc');
      } },
      ...Object.entries(WIND_LAMPS).map(([k, [x, y, txt]]) => ({ id: 'lamp_' + k, trigger: 'action', x, y, label: '壁燈', run: (S) => windLamp(S, k, txt) })),
      { id: 'lunchbox', trigger: 'action', x: 5, y: 21, label: '調查', run: async (S) => {
        await S.say('', '一個壓扁的鐵便當盒，蓋子上刻著「阿土」。裡面空空的。');
        await S.say('xinghe:sad', '……他那天，有吃到午飯嗎？');
      } },
      { id: 'watch', trigger: 'action', x: 3, y: 23, label: '調查', run: (S) => findWatch(S) },
      { id: 'cage', trigger: 'action', x: 22, y: 26, self: true, label: '吊籠', run: (S) => rideCage(S) },
      { id: 'save', trigger: 'action', x: 24, y: 6, label: '記錄', run: (S) => savePoint(S) },
    ],
  });
  async function windLamp(S, k, txt) {
    if (F('ch1_wind_done') || (V().windLit || []).includes(k)) { await S.say('', '壁燈靜靜地燒著。'); return; }
    await S.say('', `熄滅的壁燈。旁邊有粉筆畫的記號：「${txt}」。點燈？`);
    const c = await S.choice(['點燈', '不點'], { cancel: 1 });
    if (c !== 0) return;
    const order = ['w1', 'w2', 'w3'];
    const lit = (V().windLit = V().windLit || []);
    const o = objAt(k);
    if (order[lit.length] === k) {
      lit.push(k);
      S.sfx('fire');
      if (o) o.lit = true;
      if (lit.length === 3) {
        S.flag('ch1_wind_done');
        await wait(S, 0.4);
        S.sfx('wind');
        await S.say('', '三盞壁燈同時亮起。呼嘯的風，慢慢平息了。');
        phaseRefresh({ bgm: false });
      }
      return;
    }
    // wrong order: a cold gust blows every lamp out
    S.sfx('wind'); S.shake(3, 0.3);
    for (const kk of order) { const ob = objAt(kk); if (ob) ob.lit = false; }
    V().windLit = [];
    V().c1_wind_fail = (V().c1_wind_fail || 0) + 1;
    await S.say('', '一陣冷風灌進來，所有壁燈同時熄滅。');
    await S.say('xinghe:think', '……順序不對嗎？');
    if (V().c1_wind_fail >= 2) await S.say('xinghe:think', '阿土伯說過，他做記號都用「正」字……一劃、兩劃、三劃。');
  }
  async function findWatch(S) {
    if (S.hasItem('key_watch') || G.Quests.isDone('q_atu_watch')) { await S.say('', '石縫裡什麼都沒有了。'); return; }
    await S.say('', '石縫裡有東西在閃。');
    await S.give('key_watch', 1);
    await S.say('', '一支銀殼懷錶。玻璃裂了，指針停在未時三刻。背面刻著兩個字：「阿土」。');
    if (!F('ch1_atu_met')) await S.say('xinghe:think', '阿土……又是阿土。阿土嬸的阿土伯？');
    S.quest('q_atu_watch', 1);
  }
  async function atuTalk(S) {
    if (G.Quests.isDone('q_atu_watch')) { await S.say('atu:smile', '阿嬸收到錶了……少年仔，多謝你。'); return; }
    if (S.hasItem('key_watch')) {
      if (!F('ch1_atu_cry')) { S.flag('ch1_atu_cry'); await S.say('atu:cry', '就是這支……交給阿嬸，拜託你了。'); }
      else await S.say('atu:smile', '交給阿嬸。拜託你了。');
      return;
    }
    await S.say('atu:normal', '老坑道在上面那層往東。「正」字記號，一、二、三。');
  }
  async function rideCage(S) {
    if (!F('ch1_foreman')) { await S.say('', '生鏽的吊籠，用粗繩吊著。'); return; }
    await S.say('', '生鏽的吊籠，用粗繩吊著。拉一下鈴，上面好像還有人在顧？');
    const c = await S.choice(['坐上去', '不了'], { cancel: 1 });
    if (c !== 0) return;
    S.sfx('bell');
    V().c1_cage = true;
    await S.warp('jiufen', 35, 32, 'down');
  }

  // 1-7 金脈大廳：工頭魂・阿土伯
  async function scene17(S) {
    const ms = MS();
    S.bgm(null, { fade: 0.8 });
    cineOn();
    S.face('player', 'down');
    await S.say('', '大廳。岩壁裡的金脈在燈光下一閃一閃。');
    const atu = S.spawn({ id: 'atu_s', sprite: 'miner', portrait: 'atu', x: 13, y: 22, dir: 'right', ghost: true });
    atu.alpha = 0.85;
    S.spawn({ id: 'dog_s', sprite: 'dog', x: 12, y: 22, dir: 'right' });
    const fm = { art: 'miner_ghost', v: 2, x: 17, y: 21, sc: 0.78 };
    await camTo(14.5, 21, 1.2);
    rise(FXM2.apps, fm, 1.2);
    S.sfx('ghost');
    S.emote('dog_s', '💢');
    S.sfx('buzz');
    await S.say('', '阿黃壓低身子，對著某個東西狂吠。一個半透明的老礦工張開雙手，擋在狗的前面。');
    await S.say('', '老礦工面前，是一團扭曲的影子：穿著工頭短褂，懷裡抱滿金塊，兩眼是兩點金光。');
    await S.say('工頭魂', '金仔……是我的……攏是我的……');
    await S.say('工頭魂', '臭狗！你也是來偷我的金仔！');
    await S.say('atu:normal', '金貴仔！那是狗！狗不會偷金仔！');
    await S.say('xinghe:surprise', '阿黃！還有……那是……人？');
    await camBack(S, 0.5);
    await S.walkTo('player', 14, ms.player.y);
    await S.walkTo('player', 14, 21);
    S.face('player', 'right');
    S.face('atu_s', 'player');
    await S.say('atu:surprise', '少年仔，你……你看得到我？');
    await S.say('xinghe:serious', '看得到！雖然有點透明！');
    await S.say('atu:serious', '那就好！幫我顧住這隻憨狗！');
    await S.say('工頭魂', '又一個……又一個來偷金仔的！');
    S.shake(5, 0.6); S.sfx('metal');
    await lerpTo(fm, { sc: 0.95 }, 0.6);
    await cineOff();
    await S.battle('t_c1_foreman', { intro: (b) => foremanIntro(b) });
    // after the fight
    cineOn();
    fm.state = 'hurt';
    await S.say('', '工頭魂縮小，懷裡的金塊一塊塊掉落，在地上變成普通的石頭。');
    await S.say('工頭魂', '我的……金仔……');
    await S.say('工頭魂', '我的金仔……我……');
    await S.say('工頭魂', '我只是……想給阮某子……過好日子……');
    await S.say('atu:sad', '金貴仔。你某子早就搬回唐山了。放下吧。');
    await S.say('工頭魂', '……放下……');
    S.sfx('lantern');
    await lerpTo(fm, { a: 0, rise: 0.4, y: 19 }, 1.6, 'inQuad');
    FXM2.apps = [];
    await S.give('c1_gold_dust', 3);
    await S.say('xinghe:sad', '……他也只是想回家吃飯而已吧。');
    await S.move('dog_s', 'R', { speed: 5 });
    await S.jump('dog_s');
    S.emote('player', '💧');
    await S.say('', '阿黃衝過來，撲在星河身上舔他的臉。');
    await S.say('xinghe:laugh', '好啦好啦！阿黃，你這隻憨狗！');
    await S.move('dog_s', 'L');
    S.face('dog_s', 'atu_s');
    S.emote('dog_s', '♥');
    await S.say('atu:smile', '……阿黃啊。');
    await S.say('atu:sad', '我已經沒法度摸你了……你還一直來。');
    await S.say('xinghe:think', '阿伯，你是……阿土伯？阿土嬸家的阿土伯？');
    await S.say('atu:smile', '是我啦。死了三年的阿土。');
    await S.say('atu:normal', '這隻狗，以前是我的。我每天下坑，牠就在坑口等我。');
    await S.say('atu:sad', '坍方那天，牠等到半夜。後來，就變成沒人要的野狗了。');
    await S.say('atu:smile', '好佳哉，小金那個囝仔收留牠。');
    await S.say('atu:sad', '可是牠還是一直跑來。我叫牠回去，牠聽不到。');
    await S.say('xinghe:sad', '……');
    await S.say('atu:think', '少年仔，你看得到我，算有緣。可以拜託你一件事嗎？');
    const c = await S.choice(['你說', '我……只是來找狗的']);
    if (c === 1) await S.say('atu:laugh', '哈哈，老實的囝仔。我還是講，你聽聽就好。');
    if (!S.hasItem('key_watch')) {
      await S.say('atu:normal', '我有一支懷錶。第一次挖到金仔，跑去淡水跟紅毛人買的。');
      await S.say('atu:normal', '我跟阿嬸講：有錶，就知道什麼時候該回家吃飯。');
      await S.say('atu:sad', '坍方那天，錶從我口袋掉出來，掉在西邊的老坑道裡。');
      await S.say('atu:sad', '我想……把它還給她。這三年，她每天都擺兩副碗筷。');
      await S.say('atu:sad', '我沒準時回去過一次。至少，讓錶回去。');
      await S.say('atu:normal', '老坑道在上面那層，往東走，風很大的那條。');
      await S.say('atu:normal', '我做記號，攏用「正」字——一劃、兩劃、三劃。記住了。');
      await S.say('xinghe:serious', '……我記住了。');
      S.quest('q_atu_watch', 0);
    } else {
      await S.say('xinghe:think', '阿伯……你說的，是這個嗎？');
      await S.say('', '星河拿出懷錶。');
      await S.say('atu:surprise', '……！');
      await S.say('atu:cry', '就是這支……就是這支……');
      await S.say('atu:sad', '少年仔，拜託你。把它交給我們阿嬸。');
      S.flag('ch1_atu_cry');
      S.quest('q_atu_watch', 1);
    }
    await S.say('atu:smile', '好了，先帶這隻憨狗出去。小金在等。');
    await S.say('atu:normal', '那邊有吊籠，還會動。坐上去，直通坑口。');
    S.remove('atu_s'); S.remove('dog_s');
    S.flag('ch1_foreman'); S.flag('ch1_atu_met'); S.flag('ch1_ahuang_follow');
    phaseRefresh();
    S.bgm('mine');
    await cineOff();
    S.objective('坐吊籠帶阿黃出去');
  }

  // 阿黃 trails behind 星河 (a temporary follower) between 1-7 and 1-8
  function dogFollower(ms) {
    if (!F('ch1_ahuang_follow') || F('ch1_mine_done')) return;
    if (!ms.followers.some((f) => f.id === 'ahuang_f')) {
      const d = new G.Mapx.Actor({ id: 'ahuang_f', sprite: 'dog', x: ms.player.x, y: ms.player.y, dir: ms.player.dir, speed: 4.2 });
      ms.followers.push(d);
    }
  }
  for (const id of ['mine_1', 'mine_2', 'jiufen']) {
    const def = G.Maps.get(id);
    const upd = def.onUpdate;
    def.onUpdate = (dt, ms, busy) => { if (upd) upd(dt, ms, busy); dogFollower(ms); };
  }

  // 1-5 舊金礦坑口
  async function scene15mine(S) {
    S.face('player', 'right');
    await S.say('', '封坑的木板被撞開一個缺口。洞裡吹出一陣冷風。');
    S.sfx('wind');
    await S.say('xiaojin:cry', '就是這裡……阿黃——！');
    await wait(S, 0.6);
    await S.say('', '洞裡，很遠很遠的地方：「汪……汪……」');
    await S.say('xinghe:serious', '牠在裡面。小金，你在這裡等。');
    await S.say('xiaojin:sad', '星河哥……裡面有鬼嗎？');
    await S.say('xinghe:think', '……有也沒關係。');
    await S.say('xinghe:smile', '今天七月十四。好兄弟都去雞籠吃普渡了，沒空理我們。');
    await S.say('xiaojin:smile', '……嗯！');
    await S.say('', '星河把缺口的木板再拆大一點，彎身鑽了進去。');
    S.flag('ch1_mine_open');
    await S.warp('mine_1', 19, 38, 'up');
  }

  // 1-8 阿黃回來了
  async function scene18(S) {
    const ms = MS();
    const byCage = !!V().c1_cage;
    S.setPos('player', 35, 32, 'down');
    ms.snapCamera();
    S.flag('ch1_ahuang_follow', false);
    ms.followers = ms.followers.filter((f) => f.id !== 'ahuang_f');
    const dog = S.spawn({ id: 'dog_r', sprite: 'dog', x: 35, y: 33, dir: 'down', speed: 5 });
    void dog;
    S.remove('xiaojin');
    S.spawn({ id: 'xj_r', sprite: 'child_m', x: 33, y: 33, dir: 'right' });
    if (byCage) S.spawn({ id: 'ajiu_r', sprite: 'villager_m2', x: 37, y: 31, dir: 'left' });
    await S.say('', '陽光刺眼。星河瞇起眼睛。');
    if (byCage) await S.say('阿九', '哈！我就說這老絞盤還會動！');
    await S.move('dog_r', 'DL');
    await S.say('xiaojin:cry', '阿黃——！');
    S.emote('xj_r', '!');
    await S.jump('xj_r');
    await S.say('', '阿黃撲進小金懷裡。');
    await S.say('xiaojin:cry', '笨狗！笨狗笨狗笨狗！');
    await S.say('xiaojin:laugh', '……星河哥，謝謝你！你是真正的劍仙！');
    await S.say('xinghe:smug', '當然。');
    S.spawn({ id: 'awang_r', sprite: 'miner', x: 27, y: 33, dir: 'right', speed: 4.2 });
    await S.move('awang_r', 'RRRR');
    await S.say('阿旺', '小金！你是不是又跑來礦坑！');
    S.face('xj_r', 'awang_r');
    await S.say('xiaojin:surprise', '阿爸！是阿黃……');
    await S.say('阿旺', '又是這隻狗！');
    await S.say('阿旺', '……星河，多謝你。回去再講。小金，走。');
    S.move('awang_r', 'LLLLLL', { wait: false });
    S.move('xj_r', 'LLLLL', { wait: false });
    await S.move('dog_r', 'LLL');
    S.face('dog_r', 'right');
    await S.say('', '阿黃回頭，望了礦坑口一眼。');
    await S.move('dog_r', 'LLLL');
    await S.say('xinghe:think', '阿黃……');
    for (const id of ['dog_r', 'xj_r', 'awang_r', 'ajiu_r']) S.remove(id);
    S.flag('ch1_mine_done');
    V().c1_cage = false;
    phaseRefresh();
    S.toast('午後', 'lantern');
    S.objective('傍晚前回燈籠舖找陳伯（出發去雞籠）');
  }

  // 1-3c 福德祠拜土地公
  async function fudeShrine(S) {
    if (F('ch1_err_fude') || !S.hasItem('c1_offering')) {
      await S.say('', '小小的福德祠。土地公——福德正神，守著九份的大家長。');
      if (phase() !== 'P4' && F('ch1_err_fude')) await S.say('', '香爐裡的香，還冒著細細的煙。');
      return;
    }
    const ms = MS();
    S.face('player', 'up');
    S.spawn({ id: 'td_s', sprite: 'temple_keeper', x: 26, y: 38, dir: 'left' });
    S.remove('tianding');
    await S.say('', '添丁伯正在掃廟埕，看見星河，放下掃把。');
    await S.say('添丁伯', '星河啊，陳師傅叫你來的？供品給我。');
    S.take('c1_offering', 1);
    await S.say('', '添丁伯在供桌上擺好草仔粿、米酒、水果，旁邊放一疊金紙。');
    await S.say('添丁伯', '拜土地公，用金紙。暗時拜好兄弟，才用銀紙。');
    await S.say('添丁伯', '來，三支香。');
    const L0 = ms.lightCfg;
    S.light({ ambient: 0.45, color: '#120a08', tint: null });
    FXJ.souls = [];
    await S.say('xinghe:serious', '土地公伯仔，我是陳記燈籠舖的星河。');
    await S.say('xinghe:serious', '保佑九份今年平安，保佑陳伯身體健康……');
    await S.say('xinghe:smile', '……還有，保佑我今年變很厲害。');
    await S.say('添丁伯', '最後那項，要自己努力啦。');
    // the smoke drifts north toward the sea
    for (let i = 0; i < 14; i++) FXJ.souls.push({ x: 26 * T + 32 + U.rand(-6, 6), y: 37 * T - 30, vx: U.rand(-8, 8), vy: -U.rand(140, 200), t: -i * 0.15, life: 3.2, c: '#d8d4cc' });
    await wait(S, 1.2);
    await camTo(19, 30, 1.4);
    await S.say('', '香插進香爐。煙裊裊升起——然後，像被誰牽著一樣，一縷一縷飄向北方的海。');
    await camBack(S, 0.8);
    ms.lightCfg = L0;
    await S.say('添丁伯', '……咦？');
    await S.say('xinghe:think', '今天有風嗎？');
    await S.say('添丁伯', '沒有。');
    await S.say('添丁伯', '香煙往海那邊飄……土地公是在講，今暝海邊要較細膩。');
    await wait(S, 0.8);
    await S.say('', '短暫的沉默。遠處傳來海鳥的叫聲。');
    await S.say('添丁伯', '來，這個你帶著。');
    await S.give('pinganfu', 1);
    await S.say('添丁伯', '在土地公爐上過過火的。危急的時候拿出來，土地公會保庇你。');
    S.flag('ch1_err_fude');
    S.remove('td_s');
    await tutorial('tut_menu');
    errandsCheck(S);
  }

  // ------------------------------------------------------------------ 4.1 心燈①「阿土伯的懷錶」 delivery
  async function watchDeliver(S) {
    const inHouse = MS().def.id === 'jiufen_atu_house';
    cineOn();
    await S.say('xinghe:serious', '阿土嬸。這個……是阿土伯的。');
    S.take('key_watch', 1);
    await S.say('', '阿土嬸接過懷錶，雙手發抖。');
    await S.say('阿土嬸', '……這、這是……');
    await S.say('阿土嬸', '你在哪裡找到的？他們挖了三天都沒找到……');
    await S.say('xinghe:sad', '在西邊的老坑道。阿土伯……拜託我拿回來給妳。');
    await S.say('阿土嬸', '他拜託你……？');
    await S.say('', '阿土嬸用衣角擦去錶面的泥，打開錶蓋。指針停在未時三刻。');
    await S.say('阿土嬸', '未時三刻。那天……他是未時三刻出事的。');
    await S.say('阿土嬸', '這個人，從來不準時。就這一次，錶停得那麼準。');
    await S.say('', '她慢慢轉動發條。一圈，兩圈。');
    await wait(S, 0.6);
    S.sfx('cursor'); await wait(S, 0.5); S.sfx('cursor');
    await S.say('', '滴答。滴答。錶又走了。');
    await S.say('阿土嬸', '……走了。它又走了。');
    // 阿土伯 by the window
    let ghost = null;
    if (inHouse) await lerpTo(FXA, { atu: 0.8 }, 1.0);
    else { ghost = S.spawn({ id: 'atu_g', sprite: 'miner', portrait: 'atu', x: 5, y: 7, dir: 'right', ghost: true }); ghost.alpha = 0; await lerpTo(ghost, { alpha: 0.8 }, 1.0); }
    await S.say('', '星河的眼角，看到窗邊有一個半透明的身影。阿土伯站在那裡，對著阿土嬸笑。');
    await S.say('atu:smile', '阿嬸。我回來吃飯了。');
    await S.say('atu:laugh', '這次……準時吧？');
    await S.say('', '阿土嬸像是聽到了什麼，轉頭看向窗邊。那裡什麼都沒有，只有一點點光。');
    await S.say('阿土嬸', '……嗯。這次準時。');
    if (G.Quests.isDone('q_ahuang')) {
      await S.say('', '阿土伯的身影化作一點溫暖的光，輕輕落在餐桌那副空碗筷上，然後慢慢亮了起來。');
    } else {
      await S.say('atu:normal', '……還有那隻憨狗，我還要去看牠一眼。');
      await S.say('', '阿土伯對阿土嬸深深一鞠躬，身影淡去。餐桌那副空碗筷上，亮起一點溫暖的光。');
    }
    if (inHouse) { lerpTo(FXA, { atu: 0 }, 1.0); await lerpTo(FXA, { glow: 0.8 }, 1.0); }
    else if (ghost) { await lerpTo(ghost, { alpha: 0 }, 1.0); S.remove('atu_g'); }
    if (inParty('baizhi')) await S.say('baizhi:smile', '……他很高興。');
    await cineOff();
    await S.lantern('xd_atu_watch', '阿土伯的懷錶');
    await tutorial('tut_xindeng');
    await S.say('阿土嬸', '星河，坐。阿嬸去盛飯。');
    await S.say('阿土嬸', '今天，擺三副碗筷。');
    await S.give('c1_maltose', 5);
    S.quest('q_atu_watch', 'done');
  }

  // ------------------------------------------------------------------ 4.2 心燈②「阿黃回家」 finale
  async function ahuangFinal(S) {
    const ms = MS();
    cineOn();
    S.remove('atusim');
    S.spawn({ id: 'atusim_s', sprite: 'old_f', x: 23, y: 7, dir: 'right' });
    await S.move('atusim_s', 'R');
    await S.say('阿土嬸', '阿旺。那隻狗，是阿土的。');
    await S.say('阿旺', '阿土兄的……？');
    await S.say('阿土嬸', '牠跑去坑裡，不是貪玩。牠是去找牠的主人。');
    await S.say('阿旺', '……');
    await S.say('阿旺', '阿土兄當年，在坑裡把我拉出來過一次。要不是他，我早就……');
    await S.say('阿旺', '我竟然要把他的狗送走。');
    await S.say('xiaojin:sad', '阿爸……');
    await S.say('阿旺', '……可是，牠要是再跑——');
    await S.say('xinghe:serious', '阿旺叔，讓我帶牠去坑口一次。最後一次。');
    await S.say('阿旺', '……好。小金，你也跟去。');
    await cineOff();
    S.remove('atusim_s');
    await S.warp('jiufen', 35, 32, 'up');
    const m2 = MS();
    S.remove('xiaojin'); S.remove('ahuang');
    S.spawn({ id: 'xj_m', sprite: 'child_m', portrait: 'xiaojin', x: 34, y: 32, dir: 'up' });
    S.spawn({ id: 'dog_m', sprite: 'dog', x: 35, y: 31, dir: 'up' });
    S.setPos('player', 36, 32, 'up');
    m2.snapCamera();
    cineOn();
    await wait(S, 0.6);
    await S.say('', '阿黃跑到坑口坐下，對著黑漆漆的洞口，輕輕嗚了一聲。');
    await S.say('xiaojin:sad', '牠每次都這樣……');
    const atu = S.spawn({ id: 'atu_m', sprite: 'miner', portrait: 'atu', x: 35, y: 30, dir: 'down', ghost: true });
    atu.alpha = 0;
    await lerpTo(atu, { alpha: 0.8 }, 1.4);
    await S.say('', '洞口慢慢走出一個半透明的身影。只有星河看得見。');
    await S.say('atu:smile', '憨狗。');
    S.emote('dog_m', '!');
    await S.jump('dog_m', 12);
    await S.say('', '阿黃的耳朵豎起來，尾巴瘋狂地搖。');
    await S.say('atu:sad', '我知道你在等我。等了三年。');
    await S.say('atu:smile', '不用等了。我現在很好。');
    await S.say('', '阿土伯彎下腰，把手放在阿黃頭上。手穿過去了，可是阿黃閉上眼睛，好像真的被摸到了一樣。');
    await S.say('atu:smile', '去。跟那個囝仔去。');
    await S.say('atu:smile', '他會給你飯吃，陪你玩，帶你去海邊看水燈。');
    await S.say('atu:smile', '……比我準時多了。');
    if (G.Quests.isDone('q_atu_watch')) {
      await S.say('atu:smile', '少年仔，多謝你。我可以走了。');
      S.sfx('lantern');
      await lerpTo(atu, { alpha: 0, offsetY: -60 }, 1.6);
      await S.say('', '他化作一點光，往天上升，轉向海的方向。');
    } else {
      await S.say('atu:normal', '我還欠阿嬸一支錶。少年仔……拜託你了。');
      await lerpTo(atu, { alpha: 0 }, 1.2);
      await S.say('', '他退回洞口的黑暗裡。');
    }
    S.remove('atu_m');
    await wait(S, 0.8);
    await S.say('', '阿黃望著空空的洞口，很久。');
    await S.move('dog_m', 'L');
    S.face('dog_m', 'xj_m');
    await S.say('', '然後，牠轉身跑回小金身邊，把頭埋進他懷裡。');
    await S.say('xiaojin:surprise', '阿黃……？');
    await S.say('xiaojin:cry', '……你不走了？');
    S.emote('dog_m', '♥');
    await S.say('', '「汪」。');
    await S.say('xinghe:smile', '……牠說，牠不走了。');
    await cineOff();
    await S.lantern('xd_ahuang', '阿黃回家');
    await tutorial('tut_xindeng');
    S.remove('xj_m'); S.remove('dog_m');
    await S.warp('jiufen', 26, 8, 'right');
    phaseRefresh({ bgm: false });
    await S.say('阿旺', '……好。阿黃，以後你就是我們家的狗。');
    await S.say('xiaojin:smile', '星河哥，這個給你！我的寶貝！');
    await S.give('c1_foolsgold', 1);
    await S.say('xinghe:think', '……這是黃鐵礦吧。');
    await S.say('xiaojin:angry', '是金仔！');
    await S.say('xinghe:laugh', '是金仔，是金仔。我會好好收著。');
    S.quest('q_ahuang', 'done');
    void ms;
    S.objective(phase() === 'P5' ? '跟九份的大家道別，從南邊的山路出發' : '傍晚前回燈籠舖找陳伯（出發去雞籠）');
  }

  // ------------------------------------------------------------------ 4.3 醒木失竊記
  async function xingmuStart(S) {
    const ms = MS();
    S.setPos('player', 10, 11, 'up');
    ms.snapCamera();
    cineOn();
    await camTo(10, 4, 0.6);
    await S.say('', '阿炳伯正要開講，舉起醒木——');
    const cat = S.spawn({ id: 'cat_s', sprite: 'cat', x: 8, y: 3, dir: 'right', speed: 7 });
    void cat;
    S.sfx('miss');
    await S.move('cat_s', 'RR');
    S.emote('abing', '!');
    await S.move('cat_s', 'LLLLLLLL');
    S.remove('cat_s');
    await S.say('', '一道黑影竄上說書台，叼走醒木，從窗口跳了出去。');
    await S.say('abing:surprise', '啊！我的醒木！黑糖！你這隻夭壽貓！');
    await S.say('abing:sad', '沒醒木，我說書就沒魂……少年仔，幫我追回來好不好？');
    await camBack(S, 0.5);
    await cineOff();
    S.quest('q_xingmu', 0);
    S.objective('追上黑糖（雜貨店的屋頂邊）');
  }
  async function xingmuReturn(S) {
    await S.say('abing:laugh', '我的醒木！好！好囝仔！');
    S.take('c1_xingmu', 1);
    knock(); S.shake(3, 0.15);
    await S.say('abing:smile', '來，這段故事，阿炳伯只講給你一個人聽。');
    await storyD(S);
    await S.say('abing:smile', '這把扇子，跟了我四十年。送你。說故事的人，總要有一把扇。');
    await S.give('c1_fan_story', 1);
    await S.give('c1_oolong', 2);
    S.quest('q_xingmu', 'done');
    G.state.vars.objective = phase() === 'P1' ? (F('ch1_err_tea') && F('ch1_err_oil') && F('ch1_err_fude') ? '回燈籠舖向陳伯報告' : '完成陳伯交代的三件差事')
      : phase() === 'P2' ? '到九份東邊的舊礦坑口' : phase() === 'P3' ? '傍晚前回燈籠舖找陳伯（出發去雞籠）' : G.state.vars.objective;
  }

  // ------------------------------------------------------------------ 1-9 黃昏，下山去雞籠
  async function scene19(S) {
    await S.fadeOut(dur(0.8));
    S.toast('黃昏', 'lantern');
    S.flag('ch1_depart_fest');
    S.objective(null);
    await S.warp('jiufen', 19, 32, 'up', { fade: 0 });
    const ms = MS();
    S.spawn({ id: 'cb_d', sprite: 'chenbo', portrait: 'chenbo', x: 20, y: 33, dir: 'up' });
    // townsfolk heading down to the festival, lanterns in hand
    const walkers = [[18, 26, 'villager_m'], [20, 24, 'villager_f'], [19, 21, 'old_m'], [18, 18, 'villager_f2'], [20, 16, 'child_f']];
    walkers.forEach(([x, y, sp], i) => { const a = S.spawn({ id: 'wk' + i, sprite: sp, x, y, dir: 'up', speed: 1.6 }); a.light = { r: 110, color: '#ffb060' }; });
    ms.snapCamera();
    await S.fadeIn(dur(1.0));
    walkers.forEach((w, i) => S.move('wk' + i, 'UUUUUUUUUUUU', { wait: false }));
    S.move('cb_d', 'UUU', { wait: false });
    await S.move('player', 'UUU', { speed: 2.2 });
    await S.say('', '豎崎路，夕陽把石階染成橘紅。九份人提著燈籠，三三兩兩往山下走。');
    await S.say('xinghe:smile', '陳伯，你今天話好少。');
    await S.say('chenbo:normal', '我每天話都很少。');
    await S.say('xinghe:laugh', '今天特別少。');
    await S.say('chenbo:think', '……');
    S.move('cb_d', 'UU', { wait: false });
    await S.move('player', 'UU', { speed: 2.2 });
    await S.say('chenbo:normal', '早上你說的夢。');
    S.face('player', 'right');
    await S.say('xinghe:surprise', '欸？');
    S.face('cb_d', 'left');
    await S.say('chenbo:serious', '那個姑娘，有沒有說她是誰？');
    await S.say('xinghe:think', '沒有。她只叫我……別再去找她。');
    await S.say('chenbo:think', '……');
    await S.say('chenbo:normal', '走吧。陳主委在等。');
    S.move('cb_d', 'UUUU', { wait: false });
    await S.move('player', 'UUUU', { speed: 2.2 });
    for (let i = 0; i < walkers.length; i++) S.remove('wk' + i);
    S.remove('cb_d');
    await S.warp('keelung_fest', 38, 7, 'left', { fade: 0.8 });
  }

  // =================================================================================================== 1.11 雞籠街・主普壇
  // harbour (north) · 港邊大路 (procession route, rows 6–8) · lantern heads on palanquins (rows 9–10) ·
  // shophouses (rows 11–13) · 市街 with stalls (rows 14–16) · slope + stairs · 主普壇 terrace (rows 22–28)
  const KL_TILES = (() => {
    const g = grid(40, 30, '.');
    fill(g, 0, 0, 40, 2, 'w'); fill(g, 0, 2, 40, 3, '~');
    fill(g, 1, 5, 37, 1, 'k');
    fill(g, 0, 6, 40, 3, '#');
    fill(g, 1, 9, 38, 2, '#');
    fill(g, 1, 14, 38, 3, '#');
    fill(g, 18, 17, 4, 5, 'H');
    fill(g, 10, 22, 20, 7, '#');
    fill(g, 0, 29, 40, 1, 'X'); fill(g, 0, 9, 1, 21, 'X'); fill(g, 39, 9, 1, 21, 'X');
    fill(g, 2, 17, 4, 3, '"'); fill(g, 33, 18, 4, 2, '"'); fill(g, 3, 24, 4, 3, ':'); fill(g, 33, 23, 3, 3, ':');
    return rows(g);
  })();
  const KL_HEADS = [[5, 9, '#c9302a', '陳姓'], [10, 9, '#d8a020', '林姓'], [15, 9, '#2a7a5a', '黃姓'], [20, 9, '#3a5aa8', '張姓'], [25, 9, '#9a3a8a', '李姓'], [30, 9, '#c86a2a', '吳姓']];
  const FXK = { heads: KL_HEADS.map(([x, y, c, t]) => ({ x, y, c, t, dx: 0 })), fire: 0 };
  const klNpc = (st) => st.flags.ch1_depart_fest && !st.flags.ch1_procession;
  G.Maps.define('keelung_fest', {
    name: '雞籠街・主普壇',
    subtitle: '七月十四・中元夜',
    bgm: 'festival',
    start: [38, 7],
    bg: '#081020',
    light: { ambient: 0.55, color: '#0a0c20', playerR: 200, glow: 0.4 },
    particles: ['lanterns', 'embers'],
    tiles: KL_TILES,
    objects: (st) => [
      // boats in the harbour
      { t: 'boat_small', x: 6, y: 3 }, { t: 'boat_small', x: 14, y: 2 }, { t: 'boat_small', x: 30, y: 3 }, { t: 'boat_ferry', x: 22, y: 2 },
      { t: 'dock_post', x: 2, y: 5 }, { t: 'dock_post', x: 12, y: 5 }, { t: 'dock_post', x: 25, y: 5 }, { t: 'dock_post', x: 36, y: 5 },
      // lantern heads on their carrying frames (drawn in drawGround; these invisible blockers keep them solid)
      ...FXK.heads.map((h, i) => ({ key: 'pal' + i, t: 'paper_stack', x: h.x, y: h.y, w: 2, h: 2, solid: true, alpha: 0, interact: headLine, label: '水燈頭' })),
      { t: 'signboard', x: 3, y: 8, text: '往老大公廟' },
      // shophouses (fronts face the market street)
      { t: 'shophouse', x: 1, y: 11, door: -1, v: 0, text: '金泉號' }, { t: 'shophouse', x: 6, y: 11, door: -1, v: 1, text: '海產' },
      { t: 'shophouse', x: 29, y: 11, door: -1, v: 2, text: '源發' }, { t: 'shophouse', x: 34, y: 11, door: -1, v: 3, text: '布莊' },
      // market stalls
      { t: 'stall', x: 3, y: 15, text: '鼎邊趖', counter: true }, { t: 'stall', x: 13, y: 15, text: '天婦羅', counter: true },
      { t: 'stall', x: 23, y: 15, text: '平安符', counter: true }, { t: 'stall', x: 34, y: 15, text: '長明宮', counter: true },
      { t: 'banner', x: 36, y: 14, text: '長明宮', color: '#1a2a4a' }, { t: 'banner', x: 8, y: 14, text: '北管', color: '#c9302a' },
      { t: 'drum_rack', x: 7, y: 13 },
      { t: 'lantern_string', x: 1, y: 7, w: 12, v: 1, lift: 60 }, { t: 'lantern_string', x: 14, y: 7, w: 12, v: 0, lift: 60 }, { t: 'lantern_string', x: 27, y: 7, w: 12, v: 1, lift: 60 },
      { t: 'lantern_string', x: 1, y: 15, w: 12, v: 0, lift: 56 }, { t: 'lantern_string', x: 14, y: 15, w: 12, v: 1, lift: 56 }, { t: 'lantern_string', x: 27, y: 15, w: 12, v: 0, lift: 56 },
      // 主普壇 (temple as the base + towers of lantern strings) and the 普度 offering tables
      { t: 'temple', x: 16, y: 22, text: '慶讚中元' },
      { t: 'lantern_string', x: 15, y: 25, w: 9, v: 1, lift: 120 }, { t: 'lantern_string', x: 15, y: 25, w: 9, v: 0, lift: 190 }, { t: 'lantern_string', x: 16, y: 25, w: 7, v: 1, lift: 260 },
      { t: 'banner', x: 15, y: 21, text: '陳', color: '#c9302a' }, { t: 'banner', x: 23, y: 21, text: '主普', color: '#c9302a' },
      ...[11, 12, 13, 14, 24, 25, 26, 27].flatMap((x) => [{ t: 'table', x, y: 26 }, { t: 'table', x, y: 27, if: () => x !== 14 }]),
      { t: 'incense_burner', x: 19, y: 28 }, { t: 'incense_burner', x: 10, y: 24 }, { t: 'incense_burner', x: 29, y: 24 },
      { t: 'stone_lantern', x: 15, y: 27, lit: true },
      { t: 'red_lantern', x: 10, y: 22 }, { t: 'red_lantern', x: 29, y: 22 },
      // slope
      { t: 'tree_betel', x: 12, y: 19 }, { t: 'tree_betel', x: 26, y: 19 }, { t: 'tree_fern', x: 1, y: 20 }, { t: 'tree_fern', x: 37, y: 21 },
      { t: 'tree_banyan', x: 4, y: 21 }, { t: 'bush', x: 8, y: 24 }, { t: 'bush', x: 31, y: 24 }, { t: 'tree_fern', x: 2, y: 27 },
      { t: 'barrel', x: 11, y: 13 }, { t: 'crate', x: 27, y: 13 }, { t: 'jar', x: 12, y: 13 }, { t: 'basket', x: 28, y: 13, v: 2 },
      { t: 'laundry', x: 16, y: 12 }, { t: 'well', x: 22, y: 12 },
    ],
    lights: () => {
      const out = [[19, 23], [17, 22], [21, 22], [16, 25], [22, 25], [19, 20]].map(([x, y]) => ({ x, y, r: 260, color: '#ffc870', flicker: 0.15 }));
      for (const h of FXK.heads) out.push({ x: h.x + 0.5 + h.dx, y: h.y - 0.2, r: 150, color: '#fff0d0', flicker: 0.2 });
      out.push({ x: 19, y: 28, r: 140, color: '#ff8a3a', flicker: 0.4 });
      return out;
    },
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', x: 7, y: 8, dir: 'down', if: klNpc,
        pos: (st) => (st.flags.ch1_keelung ? [7, 8] : [37, 8]), talk: (S) => klChenbo(S) },
      { id: 'chen_chair', sprite: 'old_m', name: '陳主委', x: 7, y: 10, dir: 'down', if: klNpc, talk: (S) => S.lines([
        '哈哈！陳師傅的徒弟！你看，咱陳姓的水燈頭，雞籠第一！',
        '今年輪到咱陳姓做主普，是幾十年才一次的大事。',
        '十一個姓輪流，一姓一年。輪到的人，出錢出力，辦得越大越有面子。',
        '以前漳泉相拚，拚刀拚命；現在各姓相拚，拚陣頭拚水燈頭。',
        '這款拚法，死不了人，大家還吃得飽飽。好啦！',
      ], { name: '陳主委' }) },
      { id: 'fashi', sprite: 'taoist', name: '法師', x: 16, y: 27, dir: 'down', if: klNpc, talk: (S) => S.lines([
        '七月初一，老大公廟開龕門，好兄弟從龕裡出來，到人間作客。',
        '十五普度，請他們吃飽；八月初一，關龕門，再請他們回去。',
        '放水燈，是要照亮水路，請海裡的孤魂上岸來吃普度。',
        '燈漂得越遠，照到的水路越長……',
        '只是今年，貧道點香的時候，煙一直往下沉。',
      ], { name: '法師' }) },
      { id: 'adiao', sprite: 'shopkeeper_f', name: '阿綢', x: 3, y: 14, dir: 'down', fixedDir: true, if: klNpc, talk: async (S) => {
        await S.say('阿綢', '鼎邊趖喔——米漿沿著大鼎邊一趖，就熟啦！');
        await S.say('阿綢', '雞籠人的早頓、宵夜，攏靠這碗！');
        await S.shop(['c1_dingbian'], { title: '鼎邊趖' });
      } },
      { id: 'asong', sprite: 'merchant', name: '阿松', x: 13, y: 14, dir: 'down', fixedDir: true, if: klNpc, talk: async (S) => {
        await S.say('阿松', '天婦羅！魚漿炸的，甜甜辣辣，一支一支吃！');
        await S.shop(['c1_tempura'], { title: '天婦羅' });
      } },
      { id: 'ajiao', sprite: 'villager_f2', name: '阿嬌', x: 23, y: 14, dir: 'down', fixedDir: true, if: klNpc, talk: async (S) => {
        await S.say('阿嬌', '水燈小吊飾，綁在身上，一年平安！');
        await S.say('阿嬌', '香火袋是從廟裡過過爐的，很靈喔。');
        await S.shop(['c1_shuideng', 'c1_xianghuo', 'pinganfu'], { title: '吊飾攤' });
      } },
      { id: 'moya', sprite: 'moya', portrait: 'moya', x: 34, y: 14, dir: 'down', fixedDir: true, if: klNpc, talk: (S) => klMoya(S) },
      { id: 'beiguan', sprite: 'villager_m', name: '阿鼓', x: 7, y: 14, dir: 'down', if: klNpc, talk: (S) => S.lines([
        '咚咚鏘！等一下遊行，北管開路，全雞籠都聽得到！',
        '鑼鼓越響，好兄弟越知道——這條路，是給他們走的。',
      ], { name: '阿鼓' }) },
      { id: 'zhangzhou', sprite: 'old_m', name: '林伯', x: 20, y: 7, dir: 'right', if: klNpc, talk: (S) => klFeud(S) },
      { id: 'quanzhou', sprite: 'old_m', name: '黃伯', x: 21, y: 7, dir: 'left', if: klNpc, talk: (S) => klFeud(S) },
      { id: 'xiaoyu', sprite: 'child_f', name: '小雨', x: 28, y: 6, dir: 'up', if: klNpc, talk: (S) => klXiaoyu(S) },
      { id: 'sailor_kl', sprite: 'sailor', name: '老水手', x: 12, y: 6, dir: 'up', if: klNpc, talk: (S) => S.lines([
        '黑水溝，你聽過嗎？唐山過來台灣，要過那條水。',
        '「六死三留一回頭」——十個人過海，六個死在海裡，三個留下來，一個逃回去。',
        '中元的水燈，就是點給那六個人看的。',
      ], { name: '老水手' }) },
      { id: 'pudu_aunt', sprite: 'villager_f', name: '普度阿桑', x: 25, y: 28, dir: 'up', if: klNpc, talk: (S) => S.lines([
        '我們這區的供桌，每一樣都要插一支香，好兄弟才知道「這是給我的」。',
        '拜完要燒銀紙。好兄弟拿去用，在那邊才不會餓肚子。',
      ], { name: '普度阿桑' }) },
      { id: 'lin_kl', sprite: 'doctor', name: '林大夫', x: 15, y: 8, dir: 'down', if: klNpc, talk: ['我來顧主普壇。每年擠到昏倒的，起碼五、六個。'] },
      { id: 'agan_kl', sprite: 'shopkeeper_f', portrait: 'agan', x: 24, y: 8, dir: 'down', if: klNpc, talk: (S) => S.say('agan:laugh', '星河！這邊這邊！阿柑姨幫陳姓的水燈頭準備了芋圓，等一下拜完分！') },
      { id: 'ajiu_kl', sprite: 'villager_m2', name: '阿九', x: 36, y: 7, dir: 'up', if: klNpc, talk: ['這盞燈，寫我阿娘的名字。……字很醜，她不會怪我。'] },
      // crowd
      ...[[9, 16, 'villager_m2'], [18, 15, 'villager_f'], [27, 16, 'villager_m'], [31, 7, 'fisherman'], [33, 9, 'villager_f2'], [21, 27, 'old_f'], [13, 21, 'pilgrim']].map(([x, y, sp], i) => ({
        id: 'crowd' + i, sprite: sp, x, y, dir: 'down', wander: 2, if: klNpc,
        talk: [['今年陳姓主普，好鬧熱！', '你看那個主普壇，亮得像燈塔一樣！', '等一下水燈頭遊行，要跟緊喔！', '七月莫亂叫人名，叫「好兄弟」！', '鼎邊趖還有沒有？我要兩碗！', '求土地公保庇……也求好兄弟莫來找我。', '從艋舺走了兩天來拜，值得。'][i]],
        name: '雞籠人' })),
    ],
    onEnter: () => { liveBg(MS()); },
    update3d: (view, dt) => sync3d(view, dt, FXK.heads.map((h, i) => headSpec('h' + i, h.x + 1 + h.dx, h.y + 1.2, 1.4))),
    drawGround: (ctx, t) => {
      for (const h of FXK.heads) {
        const cx = (h.x + 1 + h.dx) * T, cy = (h.y + 1.3) * T;
        drawFrame(ctx, cx, cy);
        drawHead(ctx, cx, cy - 6, 1.3, { color: h.c, text: h.t }, t, { water: false });
      }
    },
    events: [
      { id: 'arrive', trigger: 'auto', if: (st) => st.flags.ch1_depart_fest && !st.flags.ch1_keelung, run: (S) => scene110a(S) },
      { id: 'east_exit', trigger: 'touch', x: 39, y: 6, h: 3, if: (st) => !st.flags.ch1_procession, run: async (S) => {
        await S.say('chenbo:normal', '遊行還沒開始，莫亂走。', { noPortrait: true });
        await S.move('player', 'L');
      } },
      { id: 'altar', trigger: 'action', x: 16, y: 22, w: 7, h: 5, label: '主普壇', run: (S) => S.say('', '主普壇。七月十二日「開燈放彩」之後，每晚都亮到天光。主普今年輪到陳姓。') },
      { id: 'offerings', trigger: 'action', x: 11, y: 26, w: 4, h: 2, label: '調查', run: offeringsLine },
      { id: 'offerings2', trigger: 'action', x: 24, y: 26, w: 4, h: 2, label: '調查', run: offeringsLine },
      { id: 'save', trigger: 'action', x: 15, y: 27, label: '記錄', run: (S) => savePoint(S) },
    ],
  });
  function headLine(S) { return S.say('', '各姓宗親的水燈頭。紙紮的三層樓房，飛簷、窗櫺、門神樣樣有，等一下要扛去海邊。'); }
  // the bamboo carrying frame under a 水燈頭 (two poles and a red-draped base)
  function drawFrame(ctx, cx, cy) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 34, 62, 12, 0, 0, Math.PI * 2); ctx.fill();
    for (const dy of [14, 34]) {
      ctx.fillStyle = '#b89a52'; ctx.fillRect(cx - 64, cy + dy, 128, 6);
      ctx.fillStyle = '#7a6230'; ctx.fillRect(cx - 64, cy + dy + 4, 128, 2);
    }
    const g = ctx.createLinearGradient(0, cy - 4, 0, cy + 30);
    g.addColorStop(0, '#d8402e'); g.addColorStop(1, '#8a1e16');
    ctx.fillStyle = g; ctx.fillRect(cx - 40, cy - 4, 80, 34);
    ctx.fillStyle = '#e8b53a'; ctx.fillRect(cx - 40, cy - 4, 80, 4); ctx.fillRect(cx - 40, cy + 26, 80, 3);
    for (let i = 0; i < 7; i++) { ctx.fillStyle = '#f0c850'; ctx.beginPath(); ctx.arc(cx - 36 + i * 12, cy + 31, 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function offeringsLine(S) { return S.say('', '供桌上擺滿了三牲、糕粿、米酒，還有疊得高高的糕餅塔。每一樣都插著一支香——那是給「好兄弟」的。'); }
  // the procession palanquins are drawn on top of the lantern heads only where they overlap actors north of them
  async function klFeud(S) {
    await S.say('林伯', '我們林姓的水燈頭，紙紮得較細！');
    await S.say('黃伯', '黃姓的燈較亮！你目睭花了！');
    await S.say('林伯', '你阿公以前跟我阿公——');
    await S.say('黃伯', '——相拚過，我知道！');
    S.emote('zhangzhou', '💢'); S.emote('quanzhou', '💢');
    await wait(S, 1.0);
    S.emote('zhangzhou', '♪'); S.emote('quanzhou', '♪');
    await S.say('', '兩人瞪了半天，忽然一起大笑。');
    await S.say('林伯', '……走啦，去吃鼎邊趖，我請。');
    await S.say('黃伯', '上次也是你請。這次換我。');
  }
  async function klXiaoyu(S) {
    await S.say('小雨', '我要在燈上寫阿公的名字。阿公去年討海，沒有回來。');
    await S.say('小雨', '阿母說，燈漂得越遠，阿公越看得到。');
    await S.say('小雨', '大哥哥，你要寫誰的名字？');
    const c = await S.choice(['我的爸爸媽媽', '還不知道']);
    if (c === 0) {
      await S.say('xinghe:sad', '……我不知道他們叫什麼。');
      await S.say('小雨', '那就寫「爸爸媽媽」就好啦！');
      await S.say('xinghe:smile', '……嗯。也對。');
    } else await S.say('小雨', '那要快點想喔！');
  }

  // 1-10a 進入雞籠
  async function scene110a(S) {
    const ms = MS();
    S.setPos('player', 38, 7, 'left');
    ms.snapCamera();
    cineOn();
    await S.say('', '雞籠港，入夜。鑼鼓、人聲、香煙。山坡上的主普壇亮得像一座燈塔。');
    S.sfx('gong');
    await camTo(19, 22, 1.6);
    await wait(S, 0.8);
    await camBack(S, 1.0);
    await S.say('xinghe:surprise', '哇……');
    await S.say('xinghe:laugh', '每年看，還是好壯觀！');
    S.face('chenbo', 'player');
    await S.say('chenbo:normal', '我去陳主委那裡。你自己逛，莫走遠。');
    await S.say('chenbo:serious', '遊行開始之前回來。');
    await S.move('chenbo', 'LLLL');
    await lerpTo(ms.actor('chenbo') || {}, { alpha: 0 }, 0.4);
    S.flag('ch1_keelung');
    phaseRefresh({ bgm: false });
    await cineOff();
    S.objective('逛逛中元祭（準備好了就去找陳伯）');
  }
  // 1-10b 長明宮的攤子
  async function klMoya(S) {
    if (F('ch1_moya_seen')) { await S.say('moya:smug', '嘎。鄉下小子，還不走？長明宮的燈符，一人只限一張。'); return; }
    cineOn();
    await S.say('', '布施攤前排著長長的隊。一個披黑鴉羽斗篷的男人，把黃色符紙一張張發給排隊的人。羽毛在燈光下泛著藍黑色的光。');
    await S.say('moya:smug', '來來來，府城長明宮，夜玄法師慈悲布施——');
    await S.say('moya:smug', '長明燈符一張，保你七月平安，好兄弟不敢近身。嘎嘎。');
    await S.say('', '排隊的人領了符，連聲道謝。輪到星河。');
    await S.say('moya:smug', '下一位——');
    S.emote('moya', '?');
    await wait(S, 0.8);
    await S.say('', '墨鴉低頭看了星河一眼，忽然頓住。鼻子動了動，像鳥一樣歪著頭。');
    await S.say('moya:think', '……奇怪。');
    await S.say('xinghe:think', '什麼奇怪？');
    await S.say('moya:think', '你身上……怎麼沒有燈味？');
    await S.say('xinghe:surprise', '燈味？我家開燈籠舖的，全身都是燈油味耶。');
    await S.say('moya:smug', '嘎，不是那個燈。');
    await S.say('moya:smug', '……算了，鄉下小子。拿一張吧，不收錢。');
    const c = await S.choice(['收下', '不用了']);
    if (c === 0) {
      await S.give('c1_changming_fu', 1);
      S.flag('ch1_fu_taken');
      await S.say('xinghe:smile', '多謝！');
      await S.say('', '符紙摸起來冰冰的。');
      await S.say('xinghe:think', '……好冰。');
    } else await S.say('moya:smug', '嘎嘎，有骨氣。七月夜長，你可別後悔。');
    await cineOff();
    S.face('player', 'down');
    await wait(S, 0.6);
    Snd.caw(); S.sfx('ghost');
    await S.say('', '星河離開。墨鴉看著他的背影。旗竿上的一隻烏鴉「嘎」地叫了一聲。');
    S.flag('ch1_moya_seen');
  }
  async function klChenbo(S) {
    await S.say('chenbo:normal', '逛一逛，莫走遠。遊行開始之前，來這裡找我。');
    const c = await S.choice(['可以出發了', '再逛一下'], { cancel: 1 });
    if (c !== 0) return;
    await scene111(S);
  }
  // 1-11 放水燈頭遊行
  async function scene111(S) {
    const ms = MS();
    cineOn();
    await S.say('chenbo:normal', '時辰到了。');
    for (let i = 0; i < 3; i++) { S.sfx('gong'); await wait(S, 0.5); }
    S.spawn({ id: 'fashi_p', sprite: 'taoist', x: 19, y: 9 + 2, dir: 'up' });
    S.sfx('bell');
    await S.say('法師', '水燈頭——起！');
    await S.say('', '各姓的年輕人扛起水燈頭。北管開路，鑼鼓喧天，鞭炮劈啪作響。');
    S.sfx('gong'); S.sfx('fire', 0.1); S.sfx('hit', 0.2); S.sfx('fire', 0.35);
    S.setPos('player', 8, 8, 'right');
    const cb = ms.actor('chenbo');
    if (cb) { cb.setCell(7, 8); cb.dir = 'right'; }
    await camTo(12, 8, 0.6);
    // the heads move east along the harbour road
    for (let i = 0; i < FXK.heads.length; i++) { const o = objAt('pal' + i); if (o) o.solid = false; }
    ms.computeSolid();
    S.move('chenbo', 'RRRRR', { wait: false, speed: 1.4 });
    S.move('player', 'RRRRR', { wait: false, speed: 1.4 });
    for (const h of FXK.heads) lerpTo(h, { dx: 5 }, 3.6, 'linear');
    await S.say('陳主委', '陳姓的——走頭前！');
    await S.say('群眾', '好啊——！');
    await S.say('xinghe:laugh', '陳伯！大家都在看我們的燈！');
    await S.say('chenbo:smile', '……嗯。');
    await wait(S, 1.0);
    await S.fadeOut(dur(1.0));
    await S.narrate(['放水燈頭的隊伍，從雞籠街一路遊行到望海巷的海邊。'], { veil: 1 });
    S.remove('fashi_p');
    FXK.heads.forEach((h) => { h.dx = 0; });
    S.flag('ch1_procession');
    S.objective(null);
    await S.warp('badouzi', 23, 30, 'up', { fade: 0 });
    await S.fadeIn(dur(0.8));
  }

  // =================================================================================================== 1.12 八斗子海岸・望海巷
  const BD_TILES = (() => {
    const g = grid(48, 36, '.');
    fill(g, 0, 0, 48, 4, 'w'); fill(g, 0, 4, 48, 6, '~'); fill(g, 0, 10, 48, 4, '-');
    fill(g, 2, 14, 44, 7, 's');
    fill(g, 33, 4, 8, 3, 'Y'); fill(g, 35, 7, 3, 8, 'Y');      // 礁台 + 礁岩小徑
    fill(g, 22, 21, 3, 15, '=');
    fill(g, 2, 21, 20, 1, ':'); fill(g, 26, 21, 18, 1, ':');
    fill(g, 6, 30, 16, 1, '='); fill(g, 25, 29, 14, 1, '=');
    for (const [x, y, w, h] of [[30, 31, 6, 3], [5, 32, 8, 3], [38, 22, 6, 4]]) fill(g, x, y, w, h, 'f');
    fill(g, 0, 35, 48, 1, 'X'); fill(g, 22, 35, 3, 1, '=');
    return rows(g);
  })();
  const FXB = { lamps: [], heads: [], white: null, girl: 0, girlBeach: false, apps: [], fog: 0 };
  function bdReset() {
    FXB.lamps = []; FXB.apps = []; FXB.girl = 0; FXB.girlBeach = false; FXB.fog = 0;
    const back = F('ch1_lanterns_back');
    // lanterns already on the water (warm), or washed back to the shore (blue) after 1-12
    for (let i = 0; i < (back ? 70 : 18); i++) {
      FXB.lamps.push({ x: U.rand(3, 45) * T, y: (back ? U.rand(10.2, 13.6) : U.rand(9.5, 12.8)) * T, k: back ? 1 : 0, a: 1, seed: i * 1.7 });
    }
    FXB.heads = back || F('ch1_release') ? [] : [[19, '#c9302a', '陳姓'], [24, '#d8a020', '林姓'], [29, '#2a7a5a', '黃姓']].map(([x, c, t]) => ({ x: x * T, y: 14.6 * T, c, t, a: 1, burn: 0, frame: true }));
    FXB.white = back && !F('ch1_baizhi_found') ? { x: 37.5 * T, y: 3.3 * T, a: 1, sc: 1.7 } : null;
  }
  const bdBefore = (st) => st.flags.ch1_procession && !st.flags.ch1_lanterns_back;
  const bdAfter = (st) => st.flags.ch1_lanterns_back && !st.flags.ch1_baizhi_found;
  G.Maps.define('badouzi', {
    name: '八斗子海岸・望海巷',
    subtitle: '七月十四・放水燈',
    place: 'badouzi',
    bgm: (st) => (st.flags.ch1_lanterns_back ? 'tension' : 'festival'),
    start: [23, 30],
    bg: '#030612',
    light: (st) => ({ ambient: st.flags.ch1_lanterns_back ? 0.8 : 0.72, color: '#030818', playerR: 210, glow: 0.45 }),
    particles: (st) => (st.flags.ch1_lanterns_back
      ? [{ type: 'mist', alpha: 0.24, density: 1.6, color: '#c0d0e8' }, 'embers']
      : ['embers', { type: 'mist', alpha: 0.08, density: 0.8, color: '#c8d4e8' }, 'lanterns']),
    tiles: BD_TILES,
    objects: (st) => [
      { t: 'boat_small', x: 8, y: 12 }, { t: 'boat_small', x: 13, y: 11 }, { t: 'boat_small', x: 28, y: 12 }, { t: 'boat_small', x: 42, y: 11 },
      { t: 'dock_post', x: 6, y: 13 }, { t: 'dock_post', x: 32, y: 13 },
      { t: 'firepit', x: 24, y: 19 },
      { t: 'banner', x: 13, y: 14, text: '林', color: '#d8a020' }, { t: 'banner', x: 19, y: 14, text: '陳', color: '#c9302a' }, { t: 'banner', x: 29, y: 14, text: '黃', color: '#2a7a5a' },
      { t: 'drying_rack', x: 5, y: 21, v: 0 }, { t: 'drying_rack', x: 15, y: 22, v: 0 }, { t: 'fishing_net', x: 28, y: 22 },
      { t: 'house_minnan', x: 4, y: 23 }, { t: 'house_minnan', x: 11, y: 25 }, { t: 'house_minnan', x: 32, y: 24 }, { t: 'house_minnan', x: 39, y: 27, w: 5 },
      { t: 'pandanus', x: 3, y: 20 }, { t: 'pandanus', x: 9, y: 20 }, { t: 'pandanus', x: 29, y: 20 }, { t: 'pandanus', x: 44, y: 19 }, { t: 'pandanus', x: 45, y: 15 },
      { t: 'pandanus', x: 2, y: 15 }, { t: 'tree_betel', x: 18, y: 27 }, { t: 'tree_betel', x: 27, y: 33 }, { t: 'tree_fern', x: 45, y: 23 }, { t: 'tree_fern', x: 1, y: 27 },
      { t: 'rock_big', x: 40, y: 14 }, { t: 'rock_small', x: 34, y: 14 }, { t: 'rock_small', x: 38, y: 14 }, { t: 'rock_small', x: 39, y: 6 }, { t: 'rock_small', x: 33, y: 4 },
      { t: 'driftwood', x: 6, y: 17 }, { t: 'basket', x: 20, y: 19, v: 1 }, { t: 'jar', x: 26, y: 21 }, { t: 'well', x: 19, y: 30 },
      { t: 'stone_lantern', x: 27, y: 22, lit: true },
      ...[19, 24, 29].map((x) => ({ t: 'paper_stack', x: x - 1, y: 14, w: 2, h: 1, solid: true, alpha: 0, if: (s) => !s.flags.ch1_release })),
    ],
    lights: () => {
      const out = [{ x: 24, y: 19, r: 240, color: '#ff9a40', flicker: 0.4 }];
      FXB.lamps.forEach((l, i) => { if (i % 3 === 0 && l.a > 0.3) out.push({ x: l.x / T - 0.5, y: l.y / T - 0.6, r: 90, color: U.mix('#ffb060', BLUE, l.k), flicker: 0.25 }); });
      for (const h of FXB.heads) if (h.a > 0.05) out.push({ x: h.x / T - 0.5, y: h.y / T - 1, r: 160 + h.burn * 140, color: '#ffb060', flicker: 0.3 });
      if (FXB.white && FXB.white.a > 0.05) out.push({ x: FXB.white.x / T - 0.5, y: FXB.white.y / T - 1, r: 300 * FXB.white.a, color: '#e8f4ff', flicker: 0.05 });
      return out;
    },
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', x: 20, y: 16, dir: 'up',
        if: (st) => st.flags.ch1_bd_in && !st.flags.ch1_baizhi_found, pos: (st) => (st.flags.ch1_lanterns_back ? [24, 20] : [20, 16]), talk: (S) => bdChenbo(S) },
      { id: 'chen_chair', sprite: 'old_m', name: '陳主委', x: 22, y: 15, dir: 'up', if: bdBefore, talk: ['等法師念完經，就點火下水。少年人，退後一點。'] },
      { id: 'fashi', sprite: 'taoist', name: '法師', x: 25, y: 17, dir: 'up', fixedDir: true, if: bdBefore, talk: ['南無……'] },
      { id: 'fisher1', sprite: 'fisherman', name: '漁夫', x: 14, y: 13, dir: 'up', if: bdBefore, talk: ['等一下推水燈頭，大家用力喔！'] },
      { id: 'fisher2', sprite: 'fisherman', name: '漁夫', x: 30, y: 13, dir: 'up', if: bdBefore, talk: ['浪很平，今年會漂很遠！'] },
      { id: 'xiaojin_b', sprite: 'child_m', portrait: 'xiaojin', x: 10, y: 18, dir: 'up', if: bdBefore, talk: async (S) => {
        await S.say('xiaojin:smile', '星河哥！我也要放水燈！我寫了阿黃的名字！');
        await S.say('阿旺', '狗也寫？');
      } },
      { id: 'ahuang_b', sprite: 'dog', name: '阿黃', x: 11, y: 18, dir: 'up', if: bdBefore, talk: ['「汪！」'] },
      { id: 'awang_b', sprite: 'miner', name: '阿旺', x: 9, y: 18, dir: 'up', if: bdBefore, talk: ['小金，莫靠水邊太近。'] },
      { id: 'ade_b', sprite: 'villager_m', name: '阿德', x: 12, y: 15, dir: 'up', if: bdBefore, talk: ['……漂遠一點。拜託。'] },
      { id: 'meiyu_b', sprite: 'villager_f2', name: '美玉', x: 13, y: 15, dir: 'up', if: bdBefore, talk: ['我們……放好了。'] },
      { id: 'agan_b', sprite: 'shopkeeper_f', portrait: 'agan', x: 27, y: 18, dir: 'up', if: bdBefore, talk: (S) => S.say('agan:smile', '這麼多燈，好像天頂的星星掉落海。') },
      ...[[7, 16], [16, 17], [18, 18], [28, 16], [31, 17], [33, 18], [35, 16], [5, 18], [21, 18]].map(([x, y], i) => ({
        id: 'crowd' + i, sprite: ['villager_m', 'villager_f', 'villager_m2', 'villager_f2', 'old_m', 'old_f', 'fisher_f', 'child_f', 'pilgrim'][i], x, y, dir: 'up',
        if: bdBefore, light: i % 3 === 0 ? { r: 100, color: '#ffb060' } : undefined })),
      ...[[18, 23], [20, 24], [26, 23], [27, 25], [16, 25], [29, 24]].map(([x, y], i) => ({
        id: 'back' + i, sprite: ['villager_m', 'villager_f', 'old_m', 'villager_f2', 'fisherman', 'old_f'][i], x, y, dir: 'up', if: bdAfter,
        name: '鄉親', talk: [['燈……燈倒轉來了……', '歹兆頭啊……', '莫靠近水邊！', '那盞白色的燈是誰的？', '海裡的好兄弟不肯收……', '阿彌陀佛，阿彌陀佛……'][i]] })),
    ],
    enemies: [
      { id: 'crab1', troop: 'shore_1', x: 35, y: 10, lv: 4, radius: 1, chase: 3, respawn: false, if: bdAfter },
      { id: 'crab2', troop: 'shore_1', x: 37, y: 12, lv: 4, radius: 1, chase: 3, respawn: false, if: bdAfter },
    ],
    onEnter: () => { liveBg(MS()); bdReset(); },
    update3d: (view, dt) => {
      const sp = FXB.heads.map((h, i) => headSpec('h' + i, h.x / T, h.y / T, 1.4, h.a));
      const w = FXB.white;
      sp.push(headSpec('white', w ? w.x / T : 0, w ? w.y / T : 0, 2, w ? w.a : 0));
      sp.push({ key: 'girl', char: 'baizhi', anim: 'sleep', x: w ? w.x / T : 0, z: w ? w.y / T - 0.2 : 0, y3: 0.6, a: w ? FXB.girl * w.a : 0 });
      sp.push({ key: 'girlB', char: 'baizhi', anim: 'sleep', x: 25.5, z: 19.6, a: FXB.girlBeach ? 1 : 0 });
      sync3d(view, dt, sp.concat(appSpecs(FXB.apps, 'b')));
    },
    onUpdate: (dt) => {
      for (const l of FXB.lamps) if (l.drift) l.y -= l.drift * dt;
    },
    drawGround: (ctx, t) => {
      for (const l of FXB.lamps) drawLamp(ctx, l.x, l.y, t, l.seed, l.k, l.a, 1);
      for (const h of FXB.heads) {
        if (h.a <= 0.01) continue;
        if (h.frame) drawFrame(ctx, h.x, h.y);
        drawHead(ctx, h.x, h.y - 6, 1.3, { color: h.c, text: h.t }, t, { water: !h.frame, alpha: h.a });
        if (h.burn > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) glow(ctx, h.x + Math.sin(t * 7 + i * 2) * 14, h.y - 60 - ((t * 60 + i * 13) % 50), 18 * h.burn, '#ff8a3a', h.a * h.burn * 0.8); ctx.restore(); ctx.globalAlpha = 1; }
      }
      const w = FXB.white;
      if (w && w.a > 0.01) {
        drawHead(ctx, w.x, w.y, w.sc, { color: '#ece6d6', text: '彼岸' }, t, { alpha: w.a });
        if (FXB.girl > 0.01) drawLying(ctx, 'baizhi', w.x + 4, w.y - 34 * w.sc + 30, 0.42, FXB.girl * w.a);
      }
      if (FXB.girlBeach) drawLying(ctx, 'baizhi', 25.5 * T, 19.9 * T, 0.5);
    },
    drawOver: (ctx, t) => {
      drawApps(ctx, t, FXB.apps);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const l of FXB.lamps) if (l.a > 0.05) glow(ctx, l.x, l.y - 6, 18, U.mix('#ffb060', BLUE, l.k), 0.5 * l.a);
      if (FXB.white && FXB.white.a > 0.01) glow(ctx, FXB.white.x, FXB.white.y - 40, 140, '#dceeff', 0.4 * FXB.white.a);
      ctx.restore(); ctx.globalAlpha = 1;
    },
    events: [
      { id: 'arrive', trigger: 'auto', if: (st) => st.flags.ch1_procession && !st.flags.ch1_bd_in, run: (S) => scene112a(S) },
      { id: 'reef_block', trigger: 'touch', x: 35, y: 10, w: 3, h: 4, if: (st) => !st.flags.ch1_lanterns_back, run: async (S) => {
        await S.say('xinghe:normal', '礁岩那邊浪大。今暝大家都在沙灘上等放水燈，還是別過去。');
        S.setPos('player', 36, 15, 'down');
        MS().snapCamera();
      } },
      { id: 'south_exit', trigger: 'touch', x: 22, y: 35, w: 3, run: async (S) => {
        await S.say('xinghe:normal', F('ch1_lanterns_back') ? '……燈上有人。不能走。' : '今暝要跟陳伯一起放水燈。');
        await S.move('player', 'U');
      } },
      { id: 'hesitant', trigger: 'touch', x: 35, y: 9, w: 3, once: true, if: (st) => st.flags.ch1_lanterns_back, run: (S) => scene113ghost(S) },
      { id: 'reef_end', trigger: 'touch', x: 34, y: 6, w: 5, once: true, if: (st) => st.flags.ch1_lanterns_back && !st.flags.ch1_baizhi_found, run: (S) => scene113(S) },
      { id: 'save', trigger: 'action', x: 27, y: 22, label: '記錄', run: (S) => savePoint(S) },
    ],
  });
  async function bdChenbo(S) {
    if (F('ch1_lanterns_back')) { await S.say('chenbo:angry', '……你這個憨囝仔。要去就去，給我活著回來！'); return; }
    await scene112b(S);
  }
  // 1-12a 進入八斗子
  async function scene112a(S) {
    const ms = MS();
    S.setPos('player', 23, 30, 'up');
    ms.snapCamera();
    S.spawn({ id: 'cb_a', sprite: 'chenbo', portrait: 'chenbo', x: 24, y: 31, dir: 'up' });
    cineOn();
    await S.move('cb_a', 'U');
    await S.say('', '夜裡的海邊。篝火、火把、法師的鈴聲。幾座水燈頭排在沙灘上，人群圍成半圓。');
    S.sfx('bell');
    await camTo(23, 15, 1.4);
    await wait(S, 0.6);
    await camBack(S, 0.8);
    S.face('cb_a', 'player');
    await S.say('chenbo:normal', '去吧。跟大家一起等。等一下過來找我。');
    await S.move('cb_a', 'UUUU');
    S.remove('cb_a');
    S.flag('ch1_bd_in');
    phaseRefresh({ bgm: false });
    await cineOff();
    S.objective('跟陳伯一起放水燈');
  }
  // 1-12b 星河的水燈；燈倒轉來
  async function scene112b(S) {
    const ms = MS();
    cineOn();
    await S.say('chenbo:normal', '拿去。');
    await S.say('', '陳伯遞出一盞小小的水燈。');
    await S.say('xinghe:surprise', '我的？');
    await S.say('chenbo:normal', '每年都放，今年忘了？');
    await S.say('xinghe:smile', '沒忘！只是以為你今年太忙……');
    // to the water's edge
    const cb = ms.actor('chenbo');
    await S.walkTo('player', 16, 14, { yFirst: false });
    if (cb) { cb.scripted = true; await S.walkTo('chenbo', 17, 14, { yFirst: false }); }
    S.face('player', 'up'); S.face('chenbo', 'up');
    await S.say('', '星河蹲下，提起毛筆。');
    await S.say('xinghe:think', '……寫什麼好呢。');
    const c = await S.choice(['「爸爸媽媽」', '「沈」', '「陳伯長命百歲」']);
    V().ch1_lantern_text = c;
    if (c === 0) {
      await S.say('xinghe:sad', '雖然不知道名字，寫這樣，他們應該看得懂吧。');
      await S.say('chenbo:sad', '……看得懂的。');
    } else if (c === 1) {
      await S.say('xinghe:smile', '寫我的姓。他們如果在海裡，就知道是我。');
      await S.say('chenbo:think', '……');
    } else {
      await S.say('chenbo:angry', '水燈是給海裡的人，你寫我做什麼！');
      await S.say('xinghe:laugh', '讓海裡的人知道，你還要活很久，別來找你！');
      await S.say('chenbo:smile', '……憨囝仔。');
    }
    // his little lantern goes out on the water; hundreds more are already drifting
    const mine = { x: 16.5 * T, y: 12.6 * T, k: 0, a: 0, seed: 99, mine: true };
    FXB.lamps.push(mine);
    S.sfx('splash');
    await lerpTo(mine, { a: 1 }, 0.4);
    lerpTo(mine, { y: 6 * T, x: 18 * T }, 9, 'linear');
    for (let i = 0; i < 60; i++) {
      const l = { x: U.rand(2, 46) * T, y: U.rand(10.5, 13) * T, k: 0, a: 0, seed: i * 2.3 + 5 };
      FXB.lamps.push(l);
      lerpTo(l, { a: 1 }, 0.8);
      lerpTo(l, { y: U.rand(1.5, 8) * T, x: l.x + U.rand(-1, 1) * T }, U.rand(7, 11), 'linear');
    }
    for (const l of FXB.lamps) if (!l.mine && l.y > 9 * T && l.k === 0) lerpTo(l, { y: l.y - U.rand(3, 6) * T }, U.rand(8, 11), 'linear');
    await S.say('', '星河把水燈放上水面。燈晃了晃，慢慢漂出去。');
    await S.say('xinghe:think', '陳伯。我的名字，是你取的吧？');
    await S.say('chenbo:normal', '嗯。');
    await S.say('xinghe:think', '為什麼叫「沈星河」？');
    await S.say('chenbo:normal', '……「沈」，是因為你是從水裡撈起來的。');
    await S.say('xinghe:laugh', '好隨便！');
    await S.say('chenbo:think', '「星河」……');
    await camTo(18, 7, 1.6);
    await S.say('', '陳伯望著海。遠遠近近，幾百盞小水燈已經漂在海面上。');
    await S.say('chenbo:smile', '那一暝，海上的水燈，就跟今暝一樣多。');
    await S.say('chenbo:smile', '一盞一盞排到天邊去，看起來，就像天頂的星河掉落海。');
    await S.say('chenbo:normal', '你躺在其中一盞裡面，睡得跟豬一樣。');
    await camBack(S, 0.8);
    await S.say('xinghe:laugh', '最後那句可以不用講！');
    S.emote('player', '♪'); S.emote('chenbo', '♪');
    await wait(S, 1.0);
    // the release
    S.sfx('bell'); await wait(S, 0.3); S.sfx('bell');
    await S.say('陳主委', '時辰到——點火！');
    S.sfx('fire');
    for (const h of FXB.heads) lerpTo(h, { burn: 1 }, 1.0);
    await S.say('', '法師念咒。陳主委點燃陳姓水燈頭的底座，紙厝亮了起來。');
    await camTo(24, 11, 0.8);
    for (const h of FXB.heads) { h.frame = false; lerpTo(h, { y: 12.2 * T }, 1.2); }
    S.sfx('splash');
    await S.say('', '漁夫們吆喝著，把水燈頭推進海裡。其他各姓的水燈頭，也一座一座下水。');
    await S.say('群眾', '漂喔——漂遠一點——！');
    for (const h of FXB.heads) { lerpTo(h, { y: U.rand(2.5, 4.5) * T, x: h.x + U.rand(-2, 2) * T }, 9, 'linear'); }
    await camTo(24, 6, 2.4);
    await S.say('', '水燈頭燃燒著，緩緩漂向外海。幾百盞小燈跟在後面，一起往外漂。');
    await S.say('xinghe:laugh', '漂得好遠！陳伯，我們的最遠！');
    await S.say('chenbo:smile', '……');
    S.flag('ch1_release');
    await wait(S, 1.0);
    // ---- the music stops; the lanterns turn blue and come back
    S.bgm(null, { fade: 0.4 });
    Snd.wave(0.5, 6);
    await wait(S, 1.2);
    const order = FXB.lamps.slice().sort((a, b) => a.y - b.y);
    for (const l of FXB.lamps) l.drift = 0;
    for (const [i, l] of order.entries()) { setTimeout(() => { l.k = 1; }, auto() ? 0 : i * 80); }
    for (const h of FXB.heads) lerpTo(h, { burn: 0, a: 0.35 }, 3);
    await wait(S, Math.min(4.5, order.length * 0.08));
    await S.say('xinghe:surprise', '……燈的顏色，怎麼……');
    await wait(S, 1.0);
    await S.say('', '燈全部停住了。整片海面靜止，連浪聲都沒了。');
    await wait(S, 0.8);
    for (const l of FXB.lamps) lerpTo(l, { y: U.rand(10.2, 13.6) * T, x: l.x + U.rand(-0.6, 0.6) * T }, U.rand(6, 9), 'inOutQuad');
    for (const h of FXB.heads) lerpTo(h, { y: 11.5 * T, a: 0 }, 8, 'inOutQuad');
    await S.say('', '然後，所有的燈，開始往岸邊漂回來。');
    await S.say('群眾', '燈……燈倒轉來了！');
    await S.say('群眾', '歹兆頭啊！水燈倒漂，是好兄弟不肯收！');
    await S.say('陳主委', '怎麼會……幾十年來，從來沒有……');
    await S.say('法師', '大家退後！離開水邊！');
    S.particles([{ type: 'mist', alpha: 0.26, density: 1.7, color: '#c0d0e8' }, 'embers']);
    S.sfx('wind');
    await S.say('', '霧從海上湧起。人群尖叫著往後退。');
    S.face('player', 'right');
    await S.say('chenbo:serious', '……');
    await S.say('chenbo:serious', '……燈在衰了。', { size: 20 });
    await S.say('xinghe:surprise', '陳伯？');
    // the white lantern head
    FXB.white = { x: 46 * T, y: 0.5 * T, a: 0, sc: 1.7 };
    FXB.girl = 0;
    await camTo(38, 5, 1.2);
    S.sfx('ghost');
    lerpTo(FXB.white, { a: 1 }, 1.5);
    await lerpTo(FXB.white, { x: 37.5 * T, y: 3.3 * T }, 4.5, 'inOutQuad');
    await S.say('', '海霧之中，有一盞燈，比所有的燈都大、都白——一座古老的白色水燈頭，逆著所有燈的方向，從外海緩緩漂來。');
    await S.say('xinghe:serious', '那是什麼……那盞不是我們的！');
    S.shake(3, 0.3); S.sfx('hit');
    await lerpTo(FXB, { girl: 0.6 }, 1.0);
    await S.say('', '白色水燈頭撞上礁岩的盡頭，卡住了。燈上隱約有一個白色的人影，倒在那裡。');
    await S.say('xinghe:surprise', '有人！燈上有人！');
    await camBack(S, 0.8);
    await S.say('chenbo:angry', '星河！莫去！水邊——');
    S.flag('ch1_lanterns_back');
    phaseRefresh();
    await cineOff();
    await S.walkTo('player', 20, 15, { yFirst: true });
    await S.walkTo('player', 34, 15);
    S.bgm('tension');
    S.objective('到礁岩的盡頭去');
  }
  // 1-13 遲疑的水鬼
  async function scene113ghost(S) {
    const ghost = { art: 'water_ghost', x: 36, y: 8, sc: 0.5, v: 0 };
    cineOn();
    S.sfx('splash');
    await rise(FXB.apps, ghost, 1.0);
    await S.say('', '一個水鬼從礁岩邊爬上來，全身滴著海水，伸手抓住星河的腳踝。');
    S.shake(3, 0.2);
    await S.say('水鬼', '……替……替我……');
    await S.say('xinghe:surprise', '放、放手！');
    await wait(S, 0.6);
    await S.say('', '水鬼抬起頭，看著星河的臉。手，忽然鬆了一下。');
    await S.say('水鬼', '……你……？');
    await cineOff();
    await S.battle('t_c1_shore_ghost', { intro: (b) => hesitateIntro(b) });
    ghost.state = 'hurt';
    await S.say('', '水鬼沉回海裡前，回頭看了星河一眼。');
    await lerpTo(ghost, { a: 0, rise: 0.3 }, 1.0);
    FXB.apps = [];
    await S.say('xinghe:think', '牠剛剛……為什麼不抓我？');
  }
  // 1-13 礁岩上・水燈頭裡的少女
  async function scene113(S) {
    const ms = MS();
    cineOn();
    S.bgm(null, { fade: 0.6 });
    await S.walkTo('player', 37, ms.player.y);
    await S.walkTo('player', 37, 4);
    S.face('player', 'up');
    await camTo(37.5, 3.5, 0.8);
    await S.say('', '礁台。白色的水燈頭卡在礁岩之間。紙厝的屋簷樣式很古老，看不出是哪一姓的。燈裡的火是冷冷的白光。');
    await lerpTo(FXB, { girl: 1 }, 0.8);
    await S.say('', '燈上，一個少女側躺著。烏黑的長髮散在水面上，髮梢泛著一點銀白的微光，用一條紅繩鬆鬆地綁著。');
    await S.say('xinghe:surprise', '……！');
    await S.say('xinghe:surprise', '是她……夢裡的……');
    if (!auto()) { Snd.lullaby(80, 1); await wait(S, 3.2); Snd.stopLullaby(1.5); }
    await S.say('', '星河涉水靠近，把她從燈上抱下來。她很輕，全身冰冷，卻發著淡淡的光。');
    await S.say('xinghe:serious', '喂！醒醒！……還有呼吸。');
    await S.say('', '她手裡緊緊握著一塊玉牌。星河輕輕翻過來——上面刻著兩個字：「白芷」。');
    await S.say('xinghe:think', '……白芷？');
    S.sfx('water');
    await S.say('', '白色水燈頭的光熄滅了。整座紙厝像霧一樣散開，沉進海裡。');
    await lerpTo(FXB.white, { a: 0, y: FXB.white.y + 30 }, 1.6);
    FXB.white = null;
    S.flag('ch1_baizhi_found');
    await S.fadeOut(dur(0.8));
    // the beach
    S.setPos('player', 24, 18, 'down');
    FXB.girlBeach = true;
    const cb = S.spawn({ id: 'cb_b', sprite: 'chenbo', portrait: 'chenbo', x: 24, y: 21, dir: 'up' });
    void cb;
    ms.snapCamera();
    await S.fadeIn(dur(0.8));
    await S.move('cb_b', 'U');
    await S.say('chenbo:angry', '你這個——');
    await wait(S, 0.6);
    await S.say('', '陳伯看到少女的臉、她的頭髮，還有她髮上那枚燈籠形的小髮簪。陳伯整個人僵住了。');
    S.emote('cb_b', '!');
    await S.say('chenbo:surprise', '……');
    await S.say('xinghe:serious', '陳伯，她還活著，可是身體好冰。');
    await S.say('chenbo:serious', '……揹回去。快。');
    await S.say('chenbo:serious', '莫給人看到。');
    await S.say('xinghe:surprise', '為什麼——');
    await S.say('chenbo:angry', '揹回去！');
    await camTo(40, 5, 1.0);
    const crow = S.spawn({ id: 'crow_b', sprite: 'crow', x: 40, y: 5, dir: 'left' });
    void crow;
    await wait(S, 0.6);
    Snd.caw(); S.sfx('ghost');
    await S.say('', '遠處的礁石上，一隻烏鴉靜靜地看著他們。牠叫了一聲，振翅飛進黑暗。');
    await lerpTo(ms.actor('crow_b') || {}, { alpha: 0 }, 0.5);
    S.remove('crow_b'); S.remove('cb_b');
    await cineOff();
    S.objective(null);
    await S.warp('jiufen_shop', 13, 6, 'up', { fade: 1.0 });
  }

  // =================================================================================================== 1-14 帶她回家 / 1-15 她醒了
  async function scene14(S) {
    const ms = MS();
    FXS.bzLying = true;
    S.setPos('player', 14, 6, 'up');
    ms.snapCamera();
    S.spawn({ id: 'lin_n', sprite: 'doctor', x: 13, y: 4, dir: 'right' });
    S.spawn({ id: 'cb_n', sprite: 'chenbo', portrait: 'chenbo', x: 12, y: 7, dir: 'up' });
    cineOn(true);
    await S.fadeIn(dur(0.8));
    await S.say('', '燈籠舖的後房。少女躺在陳伯的床上。林大夫在把脈。');
    await S.say('林大夫', '……奇怪。');
    await S.say('林大夫', '這個脈，一陣有、一陣無。像潮水，一漲一退。');
    await S.say('林大夫', '身子冷得像剛從海底撈上來，可是一口水也沒喝到。');
    await S.say('林大夫', '我開點溫補的藥。讓她睡，醒了再說。');
    await S.say('chenbo:normal', '麻煩你了，林大夫。這件事……');
    await S.say('林大夫', '我知道。我什麼都沒看到。');
    await S.move('lin_n', 'DDDLLLLLLDDD');
    S.sfx('door');
    S.remove('lin_n');
    S.face('player', 'left'); S.face('cb_n', 'player');
    await S.say('xinghe:think', '陳伯，你認識她嗎？');
    await S.say('chenbo:normal', '不認識。');
    await S.say('xinghe:serious', '那你剛剛的表情——');
    await S.say('chenbo:serious', '星河。');
    await S.say('chenbo:serious', '今暝你顧著她。門閂好，不管誰叫門，攏莫開。');
    await S.say('xinghe:surprise', '你要去哪？');
    await S.say('chenbo:normal', '去海邊看看。天光前回來。');
    await S.move('cb_n', 'DLLLLL');
    S.face('cb_n', 'up');
    await S.say('', '陳伯從櫃檯底下拿出一個長長的布包，揹在背上。布包的形狀，像一支船槳。另外還有一個短一點的布包，也一起揹上。');
    await S.say('xinghe:think', '那是什麼？');
    await S.say('chenbo:normal', '舊東西。');
    await S.move('cb_n', 'DDD');
    S.sfx('door');
    S.remove('cb_n');
    S.flag('ch1_home_night');
    await S.move('player', 'U');
    S.face('player', 'up');
    await S.say('', '星河坐在床邊的板凳上，看著少女的臉。');
    await S.say('xinghe:think', '白芷……');
    await S.say('xinghe:think', '夢裡的人，怎麼會漂到八斗子來……');
    S.emote('player', '…', 1.6);
    await S.say('', '星河打了一個大呵欠。');
    await S.say('xinghe:normal', '……我只閉一下眼睛……');
    await cineOff();
    await S.fadeOut(dur(1.2));
    await scene15(S, true);
  }
  async function scene15(S, dark) {
    const ms = MS();
    if (!dark) await S.fadeOut(dur(0.4));
    S.setPos('player', 13, 5, 'right');
    ms.snapCamera();
    S.light({ ambient: 0.82 });
    FXS.bzLying = true;
    cineOn(true);
    await wait(S, 0.6);
    await S.fadeIn(dur(1.2));
    S.toast('子夜', 'lantern');
    S.emote('player', '…', 2);
    await S.say('', '子夜。燈籠舖裡很暗，只有一盞小油燈。星河趴在床邊睡著了。');
    await wait(S, 0.8);
    await S.say('', '床上的少女睜開眼睛。深褐色的眼睛——有那麼一瞬間，瞳底像映著一點金色的燈火。');
    FXS.bzLying = false;
    const bz = S.spawn({ id: 'bz_n', sprite: 'baizhi', portrait: 'baizhi', x: 14, y: 5, dir: 'down', speed: 1.8 });
    bz.light = { r: 90, color: '#dff6ff' };
    await S.say('', '她坐起來，看著自己的手。翻過來，又翻過去。');
    await S.say('baizhi:think', '……');
    await S.move('bz_n', 'DDLLLLL');
    await S.move('bz_n', 'UUUU');
    S.face('bz_n', 'up');
    await S.say('', '她下床，赤著腳走到店面。燈籠架上掛著幾十盞還沒點的燈籠。');
    const light = (x, y) => { const b = { x, y, a: 0 }; FXS.blue.push(b); S.sfx('lantern'); return lerpTo(b, { a: 1 }, 0.5); };
    await light(8.4, 1.3);
    await S.say('', '她伸手碰了碰其中一盞——燈籠「噗」地亮了。是很淡、很冷的藍白色火光。');
    await S.say('baizhi:surprise', '……');
    await light(9.3, 1.1);
    await wait(S, 0.4);
    await light(10.2, 1.4);
    await wait(S, 0.3);
    light(1.4, 1.3); light(2.5, 1.1);
    await light(3.3, 1.4);
    await S.say('', '她又碰了一盞，又亮了。她歪著頭，碰第三盞、第四盞……');
    S.sfx('hit'); S.shake(4, 0.2);
    S.setPos('player', 13, 6, 'left');
    await S.jump('player', 10);
    await S.say('', '身後「砰」的一聲——星河從板凳上摔下來。');
    await S.say('xinghe:surprise', '哇啊！誰！');
    S.face('bz_n', 'player');
    await S.move('player', 'LLL');
    S.face('player', 'left');
    await S.say('', '兩人四目相對。滿屋子藍白色的燈籠。');
    await S.say('baizhi:normal', '……你好。');
    await S.say('xinghe:surprise', '妳、妳醒了！不對，妳怎麼……燈怎麼……');
    await S.say('baizhi:think', '它們很暗。我覺得它們想亮。');
    await S.say('xinghe:surprise', '燈不會「想」什麼啦！');
    await S.say('baizhi:think', '會的。');
    await S.say('baizhi:smile', '你看，它們現在很高興。');
    await S.say('xinghe:think', '……我看不出來。');
    await S.say('', '星河深吸一口氣。');
    await S.say('xinghe:normal', '我叫沈星河。這裡是九份，陳記燈籠舖。');
    await S.say('xinghe:normal', '妳躺在一盞水燈頭上，從海裡漂過來。我把妳揹回來的。');
    await S.say('baizhi:think', '九份……燈籠舖……沈星河。');
    await S.say('', '她念那三個字的時候很慢，像在舌尖上嚐它們的味道。');
    await S.say('baizhi:smile', '星河。');
    await S.say('xinghe:shy', '……嗯。');
    await S.say('xinghe:normal', '那妳呢？妳叫什麼名字？從哪裡來的？');
    await S.say('baizhi:think', '我……');
    await S.say('', '她低頭看著手裡的玉牌。');
    await S.say('baizhi:think', '這上面寫著「白芷」。');
    await S.say('baizhi:sad', '可是我不記得了。不記得我是誰，也不記得從哪裡來。');
    await S.say('baizhi:think', '我只記得……一首歌。');
    await S.say('xinghe:think', '歌？');
    await S.say('baizhi:normal', '嗯。……還有，好冷。很長很長的冷。');
    await S.say('xinghe:serious', '……');
    await S.say('xinghe:smile', '那就先叫妳白芷吧。');
    await S.say('baizhi:smile', '好。');
    await S.say('xinghe:normal', '妳肚子餓不餓？灶腳還有番薯糜。');
    await S.say('baizhi:think', '餓……是什麼感覺？');
    await S.say('xinghe:surprise', '欸？就是……肚子裡空空的、會叫的那種感覺？');
    await S.say('', '白芷把手放在肚子上，認真地等了一會兒。');
    await wait(S, 1.0);
    await S.say('baizhi:think', '……它沒有叫。');
    await S.say('xinghe:laugh', '那就是不餓！');
    await S.say('baizhi:smile', '原來如此。那它叫的時候，我再告訴你。');
    S.emote('player', '♪'); S.emote('bz_n', '♪');
    await S.say('', '星河忍不住笑出來。白芷不懂他在笑什麼，也跟著笑了。');
    S.flag('ch1_baizhi_wake');
    await wait(S, 0.8);
    S.sfx('buzz');
    await S.say('', '外面，遠遠地，阿黃開始狂吠。');
    S.sfx('ghost');
    await S.say('', '接著是一個女人的尖叫。');
    await S.say('阿旺嫂', '阿金——！阿金你要去哪裡！');
    await S.say('xinghe:surprise', '小金？');
    await S.walkTo('player', 7, 10);
    S.face('player', 'down');
    await S.say('', '星河衝到窗邊。外面的霧好濃。豎崎路上的紅燈籠，一盞一盞，變成了藍色。');
    await S.say('', '霧裡，一個小小的身影，穿著睡衣，光著腳，一步一步往山下走。');
    await S.say('xinghe:serious', '是小金……他在夢遊？');
    await S.walkTo('bz_n', 8, 9);
    await S.say('baizhi:serious', '不是夢遊。');
    await S.say('baizhi:serious', '是海……在叫他。');
    await S.say('xinghe:serious', '陳伯叫我不要開門……');
    await S.say('xinghe:serious', '……可是那是小金。');
    S.sfx('item');
    await S.say('', '星河抓起竹劍。');
    S.face('player', 'right');
    await S.say('xinghe:serious', '妳在這裡等我！');
    await S.say('baizhi:serious', '不要。');
    await S.say('xinghe:surprise', '欸？');
    await S.say('baizhi:serious', '它們很冷，很痛。我想……我知道怎麼讓它們不痛。');
    await S.say('baizhi:think', '我跟你去。');
    await S.say('xinghe:think', '……');
    await S.say('xinghe:smile', '好。跟緊我。');
    S.remove('bz_n');
    S.join('baizhi');
    if (!S.hasItem('key_jadetag')) G.Inv.add('key_jadetag', 1);
    S.flag('ch1_baizhi_join'); S.flag('ch1_night_raid');
    await cineOff();
    await tutorial('tut_party');
    S.objective('追上小金（沿豎崎路往下）');
    await S.warp('jiufen', 23, 30, 'down');
  }

  // =================================================================================================== 1-16 / 1-17 豎崎路夜戰
  async function raidLanterns(S) {
    cineOn();
    S.face('player', 'down');
    await camTo(15, 22, 0.8);
    S.sfx('ghost');
    const apps = [[13, 22], [15, 21], [17, 22]].map(([x, y], i) => ({ art: 'ghost_lantern', x, y, sc: 0.42, v: 0, flip: i === 2 }));
    await Promise.all(apps.map((a, i) => S.wait(i * 0.2).then(() => rise(FXJ.apps, a, 1.0))));
    await S.say('', '茶樓屋簷下的燈籠，一盞一盞脫鉤飛起來。燈籠紙裂開，變成一張張嘴。');
    await S.say('xinghe:surprise', '那是我們家的燈籠！早上才掛上去的！');
    await S.say('baizhi:think', '它們被冷到了。');
    await S.say('baizhi:normal', '它們是火。我的水，可以讓它們安靜。');
    await camBack(S, 0.4);
    await cineOff();
    await S.battle('jiufen_3');
    FXJ.apps = [];
  }
  async function raidSalt(S) {
    cineOn();
    S.face('player', 'up');
    S.sfx('door');
    await camTo(9, 12, 0.6);
    await S.say('', '雜貨店二樓的窗戶「砰」地打開。');
    await S.say('阿財', '星河！接著！');
    await camBack(S, 0.4);
    S.sfx('hit'); S.shake(3, 0.15);
    S.emote('player', '💢');
    await S.say('', '一個布袋從窗口丟下來，正好砸在星河頭上。');
    await S.say('xinghe:hurt', '痛！');
    await S.say('阿財', '鹽米！看到不乾淨的東西，撒落去！');
    await S.say('阿財', '水鬼驚鹽，這是阿公的阿公傳下來的！');
    await S.give('c1_salt', 5);
    S.flag('ch1_salt');
    await S.say('xinghe:smile', '多謝阿財伯！');
    await S.say('阿財', '謝什麼！趕緊去追小金！我、我要關窗了！');
    S.sfx('door');
    await tutorial('tut_battle_item');
    S.sfx('splash');
    const apps = [{ art: 'water_ghost', x: 15, y: 13, sc: 0.45 }, { art: 'water_ghost', x: 23, y: 13, sc: 0.45, flip: true }];
    rise(FXJ.apps, apps[0], 0.9);
    await rise(FXJ.apps, apps[1], 0.9);
    await S.say('', '霧裡，兩個水鬼從暗街仔兩側爬出來。');
    await cineOff();
    await S.battle('jiufen_4');
    FXJ.apps = [];
  }

  // =================================================================================================== 1-18 … 1-21
  const noFlee = (id) => Object.assign({}, G.Data.troops[id], { flee: false });
  async function raidFinale(S) {
    const ms = MS();
    cineOn();
    S.face('player', 'up');
    await camTo(19, 2.5, 0.8);
    // ---------------------------------------------------------- 1-18 救小金・渡魂謠
    S.spawn({ id: 'xj_n', sprite: 'child_m', portrait: 'xiaojin', x: 19, y: 2, dir: 'up' });
    const ghosts = [{ art: 'water_ghost', x: 18, y: 1.6, sc: 0.42 }, { art: 'water_ghost', x: 20, y: 1.6, sc: 0.42, flip: true }, { art: 'water_ghost', x: 19, y: 0.9, sc: 0.4 }];
    for (const g of ghosts) rise(FXJ.apps, g, 0.6);
    lerpTo(FXJ, { fog: 1 }, 1.5);
    await S.say('', '石階的盡頭，霧最濃的地方。小金站在那裡，一動也不動。三個水鬼圍著他，其中一個牽著他的手。');
    await S.say('水鬼', '……來……來海邊……');
    await S.say('水鬼', '……海裡……好涼……');
    await S.say('小金', '……好……');
    await S.say('xinghe:angry', '放開他！');
    await cineOff();
    await S.battle(noFlee('jiufen_1'));
    cineOn();
    for (const g of ghosts) g.a = 0.7;
    await S.say('', '水鬼們退開了，卻沒有消失。它們圍成一圈，低低地嗚咽。');
    await S.say('xinghe:hurt', '呼……打不完……它們一直站起來……');
    S.emote('xj_n', '…');
    S.spawn({ id: 'dog_n', sprite: 'dog', x: 22, y: 5, dir: 'left', speed: 5 });
    await S.move('dog_n', 'LLUU');
    S.face('dog_n', 'xj_n');
    await S.say('', '小金軟倒。阿黃從霧裡衝出來，咬住小金的衣角，拼命往後拖。');
    await S.say('xinghe:surprise', '阿黃！');
    await S.say('baizhi:sad', '星河。');
    await S.say('baizhi:sad', '它們不是壞人。只是太冷了，冷到想拉一個人陪。');
    await S.say('baizhi:serious', '讓我試試看。');
    // (followers' S.move promises never resolve in the engine, so 白芷 is a stand-in actor for this scene)
    S.hideFollowers(true);
    const bzx = ms.player.x === 19 ? 20 : 19;
    S.spawn({ id: 'bz_r', sprite: 'baizhi', portrait: 'baizhi', x: bzx, y: ms.player.y, dir: 'up' }).light = { r: 90, color: '#dff6ff' };
    await S.move('bz_r', 'U');
    S.face('bz_r', 'up');
    await S.say('', '白芷往前走。水鬼們轉向她。星河伸手想拉住她，又停住了。');
    S.bgm('love');
    await sing(S, ['燈一盞，渡一人，', '黑水茫茫莫回身；', '前塵如霧隨潮去，', '彼岸花開又一春。'], 4.4);
    await S.say('', '水鬼們停住了。');
    await sing(S, ['燈兩盞，渡兩人，', '岸上有人喚你名；', '莫怕夜長風浪急，', '一路有光一路明。'], 4.4);
    await S.say('', '水鬼身上的海水一滴一滴落下。浮腫慘白的臉，慢慢變回人的臉——一個年輕的漁夫、一個老婦人、一個少年。');
    await S.say('水鬼（年輕漁夫）', '……阿娘……');
    await S.say('水鬼（老婦人）', '……好暖……');
    await S.say('水鬼（少年）', '……謝謝。');
    for (const g of ghosts) {
      lerpTo(g, { a: 0 }, 1.6);
      for (let i = 0; i < 6; i++) FXJ.souls.push({ x: (g.x + 0.5) * T + U.rand(-10, 10), y: g.y * T + 20, vx: U.rand(-10, 10), vy: -U.rand(40, 80), t: -i * 0.1, life: 3 });
    }
    S.sfx('lantern');
    await S.say('', '他們化作三點小小的光，往上升，轉向海的方向，慢慢飄走了。');
    FXJ.apps = [];
    lerpTo(FXJ, { fog: 0.4 }, 1.5);
    await S.say('', '霧散開了一些。');
    await S.say('xinghe:surprise', '……妳……做了什麼？');
    await S.say('baizhi:think', '我不知道。');
    await S.say('baizhi:smile', '可是，他們不冷了。');
    await S.say('', '星河看著她。在殘霧裡，她的輪廓好像有一點點透明——他眨了眨眼，又什麼都沒有了。');
    S.flag('ch1_xiaojin_saved'); S.flag('lyric_2');
    S.spawn({ id: 'aw_n', sprite: 'miner', x: 21, y: 8, dir: 'up', speed: 4.6 });
    S.spawn({ id: 'aws_n', sprite: 'villager_f', x: 20, y: 9, dir: 'up', speed: 4.6 });
    await S.move('aw_n', 'UUUUL');
    S.move('aws_n', 'UUUUU', { wait: false });
    await S.say('阿旺嫂', '阿金！阿金！');
    await S.say('xiaojin:think', '……阿母？我怎麼在這裡……阿黃？');
    S.emote('dog_n', '♥');
    await S.say('', '阿黃舔著小金的臉。');
    await S.say('阿旺', '星河……你……');
    await S.say('xinghe:serious', '阿旺叔，快帶小金回家，門關好！');
    S.move('aw_n', 'DDDD', { wait: false }); S.move('aws_n', 'DDDDD', { wait: false }); S.move('dog_n', 'DDDDD', { wait: false });
    await S.move('xj_n', 'RDDDD', { speed: 4 });
    for (const id of ['aw_n', 'aws_n', 'dog_n', 'xj_n']) S.remove(id);
    S.bgm(null, { fade: 1 });
    // ---------------------------------------------------------- 1-19 頭目：墨鴉
    Snd.caw(); S.sfx('ghost');
    await S.say('', '「嘎——」');
    for (let i = 0; i < 26; i++) FXJ.feathers.push({ x: (15 + U.rand(0, 9)) * T, y: (U.rand(-2, 2)) * T, vy: U.rand(40, 90), t: 0, life: U.rand(3, 5), ph: U.rand(0, 6) });
    await S.say('', '黑色的羽毛從天上飄落。石階兩側的藍色燈籠一起搖晃。');
    const moya = S.spawn({ id: 'moya_n', sprite: 'moya', portrait: 'moya', x: 19, y: 3, dir: 'down' });
    moya.offsetY = -220; moya.alpha = 0;
    await Promise.all([lerpTo(moya, { offsetY: 0 }, 1.2, 'outCubic'), lerpTo(moya, { alpha: 1 }, 0.6)]);
    await S.say('', '一個披著鴉羽斗篷的身影，從茶樓屋頂輕飄飄地落下，站在石階上。');
    await S.say('moya:smug', '嘎嘎嘎……好歌，好歌。');
    await S.say('moya:smug', '幾十年沒聽過了。渡魂謠——果然是妳。');
    await S.say('xinghe:surprise', '你是……雞籠那個發符的！');
    await S.say('moya:smug', '府城長明宮，墨鴉。記住這個名字，鄉下小子。');
    await S.say('moya:smug', '雖然，你很快就什麼都不用記了。');
    S.emote('moya_n', '♪');
    await S.say('', '墨鴉看向白芷，深深一鞠躬。斗篷的羽毛像扇子一樣張開。');
    await S.say('moya:smug', '燈靈大人。夜玄法師，請您到府城作客。');
    await S.say('baizhi:think', '……燈靈？');
    await S.say('xinghe:angry', '她叫白芷！什麼燈靈，聽不懂！');
    await S.say('moya:smug', '嘎，你不需要懂。');
    await S.say('moya:think', '……又是你。那個沒有燈的傢伙。');
    await S.say('moya:smug', '正好。順便把你也帶回去，給法師看看。');
    await S.say('xinghe:serious', '白芷，退後！');
    await S.say('baizhi:serious', '不要。');
    await S.say('baizhi:serious', '你剛剛說「跟緊我」。我要跟緊。');
    await S.say('xinghe:think', '……');
    await S.say('xinghe:smile', '……好！那就一起上！');
    await cineOff();
    await S.battle('t_c1_moya', { intro: (b) => moyaIntro(b), rewards: true });
    cineOn();
    await S.say('', '墨鴉單膝跪地，斗篷破了好幾個洞。');
    await S.say('moya:angry', '嘎……！我的斗篷！這是用三百隻烏鴉的毛——');
    await S.say('moya:angry', '……不對，重點不是這個！');
    await S.say('xinghe:hurt', '呼……呼……投降吧！');
    S.sfx('slash'); S.sfx('shatter', 0.1);
    S.flash('#c0d8ff', 0.25, 0.5);
    await S.say('', '星河舉起竹劍。墨鴉抬手一揮，一根黑羽像刀一樣飛出——喀。竹劍斷成兩截。');
    breakBamboo();
    await S.say('xinghe:surprise', '啊！我的劍！');
    await S.give('c1_broken_sword', 1);
    await S.say('moya:smug', '嘎嘎嘎，竹子做的劍？鄉下小子，你在跟我玩家家酒？');
    await S.say('moya:smug', '今暝，我本來只想安安靜靜地接人。');
    await S.say('moya:angry', '是你們逼我的。');
    S.sfx('fire'); S.flash('#5ab8ff', 0.4, 0.6);
    await S.say('', '墨鴉從懷裡抽出一張長明燈符，朝北邊的海霧擲出去。符紙在半空中燒成一團藍火。');
    await S.say('moya:smug', '起來吧。海裡最冷、最餓、最想上岸的那一位——');
    S.shake(6, 1.5); S.sfx('earth');
    lerpTo(FXJ, { fog: 1.2 }, 1.2);
    await S.say('', '地面震動。北邊的霧裡，傳來幾十、幾百個人一起嗚咽的聲音。');
    FXJ.king = { x: 19.5, y: 1.2, sc: 0.62, a: 0, rise: 0 };
    S.sfx('ghost');
    await lerpTo(FXJ.king, { a: 0.95, rise: 1 }, 2.0, 'outCubic');
    await S.say('', '一個巨大的身影從霧裡站起來。比房子還高，身體是許多溺死的人糾纏在一起；頭上歪戴著一座燒焦的水燈頭，像一頂破碎的王冠。');
    await S.say('xinghe:surprise', '那、那是什麼……');
    await S.say('baizhi:sad', '……好多人。它身體裡，有好多人。');
    await S.say('moya:smug', '水鬼王。在黑水溝裡抓交替抓了幾百年的老傢伙。');
    await S.say('moya:smug', '那個沒有燈的小子，就給你當替身吧。嘎嘎！');
    S.flag('ch1_moya_beaten');
    await lerpTo(moya, { alpha: 0, offsetY: -120 }, 0.6);
    S.remove('moya_n');
    FXJ.king.state = 'attack';
    await camTo(19, 3.5, 0.4);
    await S.say('', '水鬼王伸出一隻巨大的手，朝星河抓來——');
    // ---------------------------------------------------------- 1-20 頭目：水鬼王（陳伯・螢火）
    S.sfx('metal'); S.shake(5, 0.3); S.flash('#ffe6a0', 0.3, 0.6);
    const cb = S.spawn({ id: 'cb_r', sprite: 'chenbo', portrait: 'chenbo', x: ms.player.x, y: ms.player.y - 1, dir: 'up' });
    void cb;
    FXJ.oarX = ms.player.x; FXJ.oarY = ms.player.y - 1;
    lerpTo(FXJ, { oar: 0.6 }, 0.4);
    FXJ.king.state = 'idle';
    await S.say('', '「鏘」的一聲。一支長長的木槳橫在星河面前，擋住了那隻手。');
    await S.say('', '槳身刻滿細密的符文，在黑暗中發著溫暖的金光。');
    await S.say('chenbo:angry', '——莫碰我的囝仔。');
    await S.say('xinghe:surprise', '陳伯！');
    S.face('cb_r', 'player');
    await S.say('chenbo:angry', '叫你門閂好！叫你莫出來！');
    await S.say('xinghe:sad', '小金被抓走了啊！');
    await S.say('chenbo:angry', '……');
    await S.say('chenbo:normal', '……做得好。');
    lerpTo(FXJ, { oar: 0.2 }, 0.8);
    await S.say('moya:surprise', '引魂槳……？你是引魂人！', { noPortrait: false });
    await S.say('moya:think', '不可能，引魂人早就……嘎，有意思。法師一定很想見你。');
    S.face('cb_r', 'up');
    await S.say('chenbo:serious', '回去跟夜玄講——陳渡，還沒死。');
    await S.say('moya:surprise', '陳渡……？');
    await S.say('', '陳伯沒有理他，擋在星河前面，握緊了木槳。');
    await cineOff();
    // 陳伯 fights as a guest, a good deal stronger than the youngsters
    const avg = Math.round(G.Party.active().reduce((a, m) => a + m.lv, 0) / Math.max(1, G.Party.active().length));
    if (!G.state.members.chenbo) G.Party.create('chenbo', Math.max(8, avg + 6));
    else { G.Story.ensureLevel('chenbo', Math.max(8, avg + 6)); }
    const cm = G.state.members.chenbo; const cst = G.Party.stats('chenbo'); cm.hp = cst.mhp; cm.mp = cst.mmp; cm.gauge = 0;
    S.remove('cb_r');
    await S.battle('t_c1_ghost_king', { guests: ['chenbo'], intro: (b) => ghostKingIntro(b), onTurn: (b, u) => ghostKingTurn(b, u), rewards: true });
    S.spawn({ id: 'cb_r', sprite: 'chenbo', portrait: 'chenbo', x: ms.player.x, y: ms.player.y - 1, dir: 'up' });
    cineOn();
    if (!F('ch1_yinghuo')) {
      // (fallback if the fight ended before the hand-over)
      S.flag('ch1_yinghuo');
      await S.say('chenbo:serious', '星河！接著！');
      equipYinghuo();
      S.toast('獲得 {y}螢火{/}', 'sword');
      await S.say('chenbo:serious', '它叫「螢火」。本來要等你十八歲生日才給你。');
      await S.say('chenbo:normal', '就是今暝。十八年前，放水燈那暝。');
    }
    FXJ.king.state = 'hurt';
    await lerpTo(FXJ.king, { rise: 0.75 }, 0.8);
    await S.say('', '水鬼王跪倒。它身上的臉，一張一張停止了哭號。');
    await S.say('chenbo:serious', '白芷姑娘，唱吧。我來渡。');
    await S.say('baizhi:surprise', '……你知道我的名字？');
    await S.say('chenbo:normal', '星河一路叫得那麼大聲，聾子都聽到了。');
    S.bgm('love');
    await S.say('', '白芷唱起渡魂謠。陳伯把引魂槳插進石階的縫裡，雙手握住。');
    await S.say('chenbo:serious', '黑水茫茫，莫再回頭。');
    await S.say('chenbo:serious', '引魂人陳渡，在此——渡！');
    S.flash('#ffe6a0', 0.6, 0.85); S.sfx('lantern');
    await lerpTo(FXJ, { oar: 1 }, 0.4);
    for (let i = 0; i < 120; i++) FXJ.souls.push({ x: (19.5 + U.rand(-2.5, 2.5)) * T, y: (1.5 + U.rand(-1, 1.5)) * T, vx: U.rand(-25, 25), vy: -U.rand(30, 90), t: -U.rand(0, 1.5), life: U.rand(3, 5) });
    await lerpTo(FXJ.king, { a: 0 }, 1.6);
    FXJ.king = null;
    await S.say('', '槳身的符文大亮。水鬼王的身體裂開，成百上千盞小小的藍色魂燈從裡面飄出來，像一條倒過來的星河，緩緩飄向海的方向。');
    const p = ms.player;
    for (let i = 0; i < 8; i++) FXJ.souls.push({ x: p.px + Math.cos(i * 0.8) * 30, y: p.py - 60 + Math.sin(i * 0.8) * 16, vx: -Math.sin(i * 0.8) * 30, vy: Math.cos(i * 0.8) * 16 - 10, t: -i * 0.12, life: 2.2 });
    await S.say('', '其中一盞小燈在星河面前停了一下，輕輕繞著他轉了一圈，才飄走。');
    await S.say('xinghe:surprise', '……');
    S.flag('ch1_wgk_beaten');
    lerpTo(FXJ, { oar: 0, fog: 0 }, 1.5);
    S.bgm(null, { fade: 2 });
    // ---------------------------------------------------------- 1-21 黑羽
    FXJ.red = 0;
    for (let i = 0; i <= JF_EAVES.length + 12; i++) { FXJ.red = i; await wait(S, 0.08); }
    FXJ.red = 99;
    S.light({ ambient: 0.62, color: '#0a0818' });
    S.particles(['embers']);
    await S.say('', '霧散了。九份的燈籠，一盞一盞變回紅色。');
    await S.say('xinghe:laugh', '贏、贏了……我們贏了！');
    const m2 = S.spawn({ id: 'moya_r', sprite: 'moya', portrait: 'moya', x: 23, y: 6, dir: 'left' });
    m2.offsetY = -110;
    Snd.caw();
    await camTo(21, 4, 0.5);
    await S.say('', '屋頂上，墨鴉冷冷地看著他們。');
    await S.say('moya:angry', '嘎……引魂人。算你厲害。');
    await S.say('moya:smug', '可是——');
    for (let i = 0; i < 30; i++) FXJ.feathers.push({ x: (22 + U.rand(-1, 1)) * T, y: (3 + U.rand(-1, 1)) * T, vy: U.rand(60, 160), t: 0, life: 1.6, ph: U.rand(0, 6) });
    S.sfx('slash2'); S.sfx('slash2', 0.1);
    await S.say('', '墨鴉振翅。一陣黑羽像暴雨一樣射向白芷。');
    await S.say('xinghe:surprise', '白芷！');
    S.sfx('hit'); S.sfx('crit', 0.15); S.shake(5, 0.4); S.flash('#a02020', 0.3, 0.4);
    await S.move('cb_r', 'L', { speed: 8 });
    await S.say('', '陳伯撲過去，把白芷護在身後。黑羽一根一根插進他的背。');
    await S.say('chenbo:hurt', '……唔！');
    await S.say('xinghe:surprise', '陳伯——！');
    await S.say('moya:smug', '嘎嘎嘎！今暝就到這裡。長明宮的燈，會一直等著燈靈大人。');
    await S.say('moya:smug', '沒有燈的小子，下次見面，我會好好研究你。');
    Snd.caw();
    for (let i = 0; i < 20; i++) FXJ.feathers.push({ x: (23 + U.rand(-1, 1)) * T, y: (5 + U.rand(-1, 1)) * T, vy: -U.rand(60, 140), t: 0, life: 2, ph: U.rand(0, 6) });
    await lerpTo(m2, { alpha: 0 }, 0.5);
    S.remove('moya_r');
    await S.say('', '墨鴉化作一群烏鴉，四散飛進夜空。');
    await camBack(S, 0.4);
    S.emote('cb_r', '💧');
    await S.say('', '陳伯跪倒在石階上。');
    await S.say('xinghe:cry', '陳伯！陳伯你撐著！');
    await S.say('chenbo:hurt', '……吵死了……死不去……');
    await S.say('chenbo:hurt', '去叫林大夫……');
    S.flag('ch1_chenbo_hurt');
    delete G.state.members.chenbo;
    S.remove('bz_r'); S.hideFollowers(false);
    await cineOff();
    await S.fadeOut(dur(1.0));
    S.remove('cb_r');
    S.objective(null);
    await S.warp('jiufen_shop', 13, 6, 'up', { fade: 0 });
    await S.fadeIn(dur(0.8));
  }

  // =================================================================================================== 1-22 引魂人
  async function scene22(S) {
    const ms = MS();
    FXS.cbLying = true;
    S.setPos('player', 13, 6, 'up');
    ms.snapCamera();
    S.spawn({ id: 'lin_r', sprite: 'doctor', x: 13, y: 4, dir: 'right' });
    cineOn(true);
    S.bgm('sad');
    await S.say('', '燈籠舖後房。陳伯趴在床上。林大夫把最後一根黑羽拔出來，丟進火盆。羽毛燒起來，是藍色的火。');
    S.sfx('fire'); S.flash('#5ab8ff', 0.3, 0.4);
    await S.say('林大夫', '陰寒入骨。我能做的都做了，接下來要看他自己。');
    await S.say('林大夫', '至少躺半個月。……我明天早上再來。');
    await S.move('lin_r', 'DDDLLLLLLDDD');
    S.sfx('door'); S.remove('lin_r');
    await S.move('player', 'U');
    S.face('player', 'right');
    await S.say('', '林大夫離開。燈籠舖裡只剩三個人。');
    await S.say('chenbo:hurt', '……星河。');
    await S.say('xinghe:sad', '我在。');
    await S.say('chenbo:serious', '有些事，本來想帶進棺材的。');
    await S.say('chenbo:serious', '現在不講不行了。');
    await S.say('', '陳伯慢慢撐起身子，靠在牆上。');
    await S.say('chenbo:normal', '你聽過「黑水溝」吧。');
    await S.say('xinghe:normal', '唐山跟台灣中間的那條海流。很多人過海死在那裡。');
    await S.say('chenbo:serious', '人死了，魂會變成一盞小燈，漂上黑水溝。');
    await S.say('chenbo:serious', '黑水溝的盡頭叫「彼岸」。彼岸有一盞燈，叫「彼岸燈」。');
    await S.say('chenbo:serious', '它的光，引著海上所有的魂渡到對岸，洗去前世，重新投胎。');
    await S.say('xinghe:think', '……那是阿炳伯講的故事吧？');
    await S.say('chenbo:serious', '不是故事。');
    await S.say('chenbo:serious', '有一群人，幫那些迷路的魂找路。划著船，提著燈，走在水路上。');
    await S.say('chenbo:serious', '叫做「引魂人」。');
    await S.say('chenbo:normal', '……我以前，就是。');
    await S.say('', '陳伯看了一眼靠在牆邊的木槳。');
    await S.say('xinghe:surprise', '……');
    await S.say('baizhi:think', '引魂人……');
    await S.say('chenbo:serious', '今暝水燈倒轉來，是因為彼岸燈的光變弱了。');
    await S.say('chenbo:serious', '燈一弱，魂就找不到路；找不到路，就在海上越積越多。');
    await S.say('chenbo:serious', '水鬼抓交替、上山抓人……攏是這個原因。');
    await S.say('xinghe:serious', '那墨鴉呢？長明宮不是在趕鬼的嗎？');
    await S.say('chenbo:angry', '長明宮。');
    if (F('ch1_fu_taken') && S.hasItem('c1_changming_fu')) {
      await S.say('chenbo:serious', '星河，雞籠那隻烏鴉給你的符，還在嗎？');
      await S.say('xinghe:think', '在這……');
      await S.say('', '星河拿出長明燈符。');
      await S.say('chenbo:serious', '丟進火裡。');
      S.take('c1_changming_fu', 1);
      S.sfx('fire'); S.sfx('ghost', 0.1); S.flash('#5ab8ff', 0.3, 0.5);
      await S.say('', '星河把符紙丟進火盆。符紙一碰到火，發出一聲很細、很細的尖叫——像一個小孩子。藍火一閃，熄了。');
      await S.say('xinghe:surprise', '剛、剛剛那是……');
      await S.say('chenbo:serious', '長明燈，不是趕鬼的燈。');
      await S.say('chenbo:serious', '是關鬼的燈。');
      S.flag('ch1_fu_burned');
    } else {
      await S.say('chenbo:serious', '雞籠那隻烏鴉發的符，你有拿嗎？');
      await S.say('xinghe:normal', '沒拿。');
      await S.say('chenbo:smile', '……好。你這次總算有聽話。');
      await S.say('xinghe:laugh', '我每次都有聽啊！');
      await S.say('chenbo:angry', '……');
      await S.say('chenbo:serious', '記住。長明燈，不是趕鬼的燈。是關鬼的燈。');
    }
    await S.say('chenbo:serious', '夜玄——長明宮的主人。我認識他。');
    await S.say('chenbo:sad', '很久以前，我們一起划過船。');
    await S.say('xinghe:surprise', '你認識他？那——');
    await S.say('chenbo:serious', '以後再講。');
    await S.say('chenbo:normal', '姑娘。');
    await S.say('baizhi:normal', '嗯。');
    await S.say('chenbo:think', '墨鴉叫妳「燈靈」。妳自己，有想起什麼嗎？');
    await S.say('baizhi:think', '……沒有。');
    await S.say('baizhi:sad', '我只記得那首歌。還有，很冷。');
    await S.say('chenbo:think', '……');
    await S.say('chenbo:normal', '我也不清楚燈靈是什麼。');
    await S.say('', '陳伯說這句話的時候，沒有看她的眼睛。');
    await S.say('chenbo:serious', '可是長明宮想要妳。這一點，再清楚不過。');
    await S.say('chenbo:serious', '星河。你帶她走。');
    await S.say('xinghe:surprise', '去哪裡？');
    await S.say('chenbo:serious', '觀音山，太虛觀。找一個叫「清虛真人」的道士。');
    await S.say('chenbo:normal', '他是我的老朋友。讀的書比我多。燈的事，他懂。');
    await S.say('chenbo:serious', '海路不能走——雞籠港一定有長明宮的眼線。');
    await S.say('chenbo:serious', '從南邊上山，穿過霧林，到平溪。');
    await S.say('chenbo:serious', '平溪的基隆河一路流到淡水。觀音山，就在淡水的對岸。');
    await S.say('xinghe:think', '霧林……那裡不是有魔神仔嗎？');
    await S.say('chenbo:normal', '有。');
    await S.say('xinghe:surprise', '你倒是否認一下啊！');
    await S.say('chenbo:normal', '……還有這個。');
    await S.say('', '陳伯從枕頭下拿出一塊黑檀木令牌，上面刻著一盞燈和一支槳。');
    await S.give('key_yinhunling', 1);
    await S.say('chenbo:serious', '引魂令。引魂人的令牌。');
    await S.say('chenbo:serious', '鬼魂看到它，就知道你是來渡他們的，不是來抓他們的。');
    await S.say('chenbo:normal', '帶在身上。迷路的魂，比較肯跟你講話。');
    await S.say('xinghe:think', '……陳伯，那你呢？');
    await S.say('chenbo:normal', '我留下來。');
    await S.say('chenbo:serious', '燈在衰，九份靠海。今年七月，還會有更多東西上岸。');
    await S.say('chenbo:hurt', '……而且我現在走兩步就要喘。跟去也是拖累。');
    await wait(S, 1.0);
    const c = await S.choice(['「我去。」', '「我……我怕。」']);
    if (c === 0) {
      await S.say('xinghe:serious', '我去。我會把她平安帶到觀音山。');
      await S.say('chenbo:smile', '……講話有出息了。');
    } else {
      await S.say('xinghe:sad', '我……我怕。我連竹劍都被打斷了。');
      await S.say('chenbo:normal', '怕就對了。不怕的人，死得最快。');
      await S.say('chenbo:serious', '怕，還是要去。這就是勇敢。');
      await S.say('xinghe:serious', '……嗯。我去。');
    }
    await S.say('chenbo:serious', '還有一件事。');
    await S.say('chenbo:think', '十八年前，我在八斗子撿到你的時候……');
    await S.say('chenbo:serious', '你躺的那盞水燈，也是倒漂回來的。');
    await S.say('xinghe:surprise', '……！');
    await S.say('chenbo:serious', '跟今暝一樣。所有的燈都往外漂，只有你那一盞，往岸上漂。');
    await S.say('chenbo:think', '我一直不知道為什麼。');
    await S.say('chenbo:serious', '……也許到了觀音山，你會知道。');
    await S.say('', '星河說不出話。白芷看著他，輕輕握住他的袖子。');
    await S.say('chenbo:normal', '好了。睡吧。天光再走。');
    S.flag('ch1_reveal');
    await cineOff();
    await S.fadeOut(dur(1.2));
    await scene23a(S, true);
  }

  // =================================================================================================== 1-23 翌晨
  async function scene23a(S, dark) {
    if (!dark) await S.fadeOut(dur(0.5));
    S.flag('ch1_morning_after');
    G.Party.healAll();
    await S.warp('jiufen_shop', 13, 5, 'right', { fade: 0, reload: true });
    FXS.cbLying = true;
    S.bgm('jiufen');
    await wait(S, 0.4);
    await S.fadeIn(dur(1.0));
    S.toast('七月十五・中元', 'lantern');
    await S.say('', '七月十五，清晨。細雨。');
    await S.say('', '後房裡，陳伯睡著了，鼾聲如雷。');
    await S.say('xinghe:smile', '……打鼾那麼大聲，應該沒事了。');
    await S.say('baizhi:think', '星河。');
    await S.say('baizhi:think', '我的肚子……叫了。');
    await S.say('xinghe:laugh', '哈哈！那就是「餓」了！');
    await S.say('baizhi:surprise', '原來這就是餓。');
    await S.say('baizhi:think', '……有點難過。可是，也有點期待。');
    await S.say('xinghe:smile', '走，帶妳去吃九份最好吃的東西。');
    S.objective('去阿柑芋圓');
  }
  async function scene23b(S) {
    const ms = MS();
    S.setPos('player', 7, 7, 'up');
    ms.snapCamera();
    cineOn();
    await S.say('agan:surprise', '星河！昨暝的事我攏聽講了！你沒事吧？陳伯呢？');
    await S.say('xinghe:smile', '陳伯在睡，打鼾打得整條街都聽得到。');
    await S.say('agan:laugh', '那就是沒事啦！');
    await S.say('agan:surprise', '……這位是？');
    await S.say('baizhi:smile', '我是白芷。我的肚子叫了。');
    await S.say('agan:laugh', '哈哈哈！好！叫得好！坐，阿柑姨請客！');
    await S.fadeOut(dur(0.5));
    S.setPos('player', 9, 6, 'down');
    if (ms.actor('baizhi')) { const b = ms.actor('baizhi'); b.setCell(11, 6); b.dir = 'down'; b.scripted = true; }
    await S.fadeIn(dur(0.5));
    await S.say('', '阿柑姨端來兩碗芋圓。紫色的芋圓、黃色的地瓜圓，泡在甜甜的薑汁糖水裡，冒著熱氣。');
    await S.say('baizhi:think', '……這是什麼？');
    await S.say('xinghe:smile', '芋圓。九份的。用芋頭跟地瓜粉做的。');
    await S.say('baizhi:think', '芋頭……是什麼？');
    await S.say('xinghe:think', '芋頭就是……呃，一種長在土裡的……紫紫的……');
    await S.say('agan:laugh', '吃就對了！');
    await S.say('', '白芷學星河的樣子，用湯匙舀起一顆，放進嘴裡。');
    await wait(S, 0.8);
    await S.say('', '她停住了。');
    await S.say('baizhi:surprise', '……');
    await S.say('baizhi:surprise', '它……在我嘴裡跳。');
    await S.say('agan:laugh', '這就是咱講的「khiū」——Q啦！咬下去會彈！');
    await S.say('baizhi:think', 'Q……');
    await S.say('', '她又吃了一顆。再一顆。湯匙越來越快。');
    await S.say('baizhi:smile', '甜的。熱的。軟的。可是裡面又不軟……');
    await S.say('baizhi:smile', '還有一點點薑，辣辣的，跑進肚子裡，肚子就暖了。');
    await wait(S, 0.6);
    S.emote('baizhi', '💧');
    await S.say('', '她忽然停下來。一滴眼淚掉進碗裡。');
    await S.say('xinghe:surprise', '白、白芷？太燙了嗎？');
    await S.say('baizhi:cry', '不是。');
    await S.say('baizhi:cry', '我好像……第一次知道，「好吃」是什麼。');
    await S.say('baizhi:cry', '原來，人每天都可以吃到這種東西。');
    await S.say('baizhi:smile', '人……好好喔。');
    S.face('agan', 'up');
    await S.say('', '阿柑姨背過身去，用圍裙擦了擦眼角。');
    await S.say('agan:cry', '……這個姑娘喔，說這種話，阿柑姨受不了啦。');
    S.face('agan', 'down');
    await S.say('agan:smile', '再一碗！阿柑姨再請一碗！');
    await S.say('baizhi:smile', '好！');
    await S.say('xinghe:laugh', '妳的肚子不叫了吧？');
    await S.say('baizhi:think', '它現在在唱歌。');
    await S.say('agan:smile', '這些帶著，路上吃！');
    await S.give('yuyuan', 3);
    await S.say('agan:smile', '還有隔壁攤的麻糬，也幫妳包兩個。白白、軟軟、圓圓的！');
    await S.say('baizhi:think', '麻……糬。');
    S.flag('ch1_yuyuan');
    S.gather();
    await cineOff();
    S.objective(F('mochi_joined') ? '跟九份的大家道別，從南邊的山路出發' : '去聽雨樓跟鄭頭家道別');
  }

  // =================================================================================================== 1-24 出發
  async function scene24(S) {
    const ms = MS();
    cineOn();
    S.face('player', 'down');
    const cb = S.spawn({ id: 'cb_f', sprite: 'chenbo', portrait: 'chenbo', x: 17, y: 41, dir: 'up' });
    void cb;
    await S.say('', '上平台。細雨。老榕樹下，陳伯拄著引魂槳站在那裡。');
    await S.say('xinghe:surprise', '陳伯！你怎麼下床了！林大夫說——');
    await S.move('cb_f', 'R');
    S.face('cb_f', 'player');
    await S.say('chenbo:normal', '林大夫說的話，你比我還聽。');
    await S.say('', '陳伯從懷裡拿出一個油紙包，塞給星河。');
    S.gold(300);
    await S.say('chenbo:normal', '盤纏。省著用。');
    await S.say('chenbo:serious', '霧林裡，聽到有人叫你的名字，莫隨便回頭。');
    await S.say('chenbo:serious', '魔神仔最愛這招。');
    await S.say('xinghe:smile', '知道了。');
    await S.say('chenbo:normal', '白芷姑娘。');
    await S.say('baizhi:normal', '嗯。');
    await S.say('chenbo:think', '……這個憨囝仔，交給妳了。');
    await S.say('xinghe:surprise', '欸！不是應該反過來嗎！');
    await S.say('baizhi:smile', '好。我會顧好他。');
    await S.say('xinghe:shy', '白芷妳也不要答應啊！');
    S.sfx('cursor');
    await S.say('', '陳伯笑了一聲，咳了兩下。');
    await S.say('chenbo:normal', '去吧。');
    await S.move('cb_f', 'L');
    S.face('cb_f', 'down');
    await S.move('player', 'DD', { speed: 2.4 });
    await S.say('chenbo:sad', '……星河。');
    S.face('player', 'up');
    await S.say('', '星河回頭。');
    await S.say('chenbo:sad', '記得，轉來食飯。');
    await S.say('xinghe:smile', '——嗯！');
    S.face('player', 'down');
    await S.move('player', 'D', { speed: 2.4 });
    await S.say('', '兩人走進山路的霧裡。陳伯站在雨中，看著他們的背影，很久很久。');
    await camTo(19, 20, 3.0);
    await S.narrate(['那一年七月，九份的燈籠舖，少了一個學徒。', '沒有人知道，這一去，要走過整座島。'], { veil: 0.85 });
    S.flag('ch1_done');
    S.remove('cb_f');
    await cineOff();
    await S.titleCard('第一章　完', '九份燈火');
    S.cameraFollow();
    G.state.vars.objective = null;
    await G.Story.next(S, 2);
  }

  // =================================================================================================== chapter entry
  G.Story.ch1 = async (S) => {
    S.chapter(1);
    if (!G.state.members.xinghe) G.Party.join('xinghe', 2);
    if (!G.state.party.includes('xinghe')) G.Party.join('xinghe');
    G.Story.ensureLevel('xinghe', 2);
    // 白芷 has not met 星河 yet (debug starts put her in the party): she joins in 1-15 at the party's level
    if (!G.state.flags.ch1_baizhi_join) { if (G.state.party.includes('baizhi')) G.Party.leave('baizhi'); delete G.state.members.baizhi; }
    G.Party.healAll();
    G.state.vars.objective = null;
    await S.fadeOut(0.01);
    await S.warp('jiufen_shop_2f', 5, 4, 'down', { fade: 0, noAutosave: true });
    await wakeUp(S, true);
  };
})();
