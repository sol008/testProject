// 彼岸燈 — items (G.Data.items): consumables, throwables, equipment, materials, key items.
//
// Contract fields (docs/CONTRACTS.md "Data"):
//   name, desc, type:'use'|'weapon'|'armor'|'head'|'feet'|'acc'|'key'|'material', price, icon,
//   use?:{ target, heal?, mp?, revive?, cure?:[status], status?, buffs?, damage?, elem?, field?, battle? },
//   stats?:{hp,mp,atk,def,mag,spd,luk}, elem? (weapon element), who?:[charIds]
// Also read by js/core/state.js (G.Party.stats): resist:[elems], immune:[statusIds], special:[ids].
// Conventions:
//   price      buy price (shops sell at price, buy back at price/2). price 0 = not sold in shops
//              (story / chest / gift only).
//   ch         chapter from which the item is meant to be available (shops / chests / drops). Data hint
//              for map writers and tools/sim_battle.js; the engine does not need it.
//   use.heal   fixed HP amount (9999 = full). use.mp fixed MP. use.revive = fraction of max HP on revive.
//   use.damage fixed damage per target (× element multiplier), ignores defence — throwables.
//   use.status {id, chance, turns} applied to the target(s). use.buffs like skills.
//   use.field / use.battle: where the item can be used (both true when omitted for heal items).
//   use.vision N — field only: grants 靈視 (Spirit Sight) for N steps (map engine reveals hidden things).
//   resist     elements the wearer takes ×0.5 damage from.  immune: status ids that never land.
//   special    'gaugeUp' 劍意 gain ×1.5 · 'autoRegen' starts every battle with regen · 'mpRegen' +4% max MP
//              per own turn · 'critUp' +10% crit · 'healUp' healing done ×1.25 · 'firstStrike' acts first
//              at battle start · 'expUp' wearer gains ×1.2 exp · 'goldUp' party gold ×1.2 (not stacking).
'use strict';
G.Data = G.Data || {};

G.Data.items = {
  // ===================================================================================== Consumables
  // ---- generic medicine ----
  jinchuang: { name: '金創藥', desc: '跌打損傷的老藥方。回復氣血 120。', type: 'use', price: 30, ch: 1, icon: 'potion', use: { target: 'ally', heal: 120 } },
  xumingsan: { name: '續命散', desc: '藥鋪的上等傷藥。回復氣血 400。', type: 'use', price: 120, ch: 4, icon: 'pill', use: { target: 'ally', heal: 400 } },
  jiuzhuan: { name: '九轉回生丹', desc: '九轉煉成的靈丹。氣血全滿。', type: 'use', price: 600, ch: 8, icon: 'pill', use: { target: 'ally', heal: 9999 } },
  huanhunxiang: { name: '還魂香', desc: '點燃後，香煙會把迷路的魂引回來。復活一人並回復三成氣血。', type: 'use', price: 150, ch: 2, icon: 'incense', use: { target: 'deadAlly', revive: 0.3 } },
  huanhundan: { name: '還魂丹', desc: '珍貴的回魂靈藥。復活一人並使氣血全滿。', type: 'use', price: 700, ch: 7, icon: 'pill', use: { target: 'deadAlly', revive: 1.0 } },
  jiedu: { name: '解毒草', desc: '山邊常見的青草，嚼起來很苦。解除中毒。', type: 'use', price: 12, ch: 1, icon: 'herb', use: { target: 'ally', cure: ['poison'] } },
  xiangbao: { name: '香包', desc: '縫著艾草與香料的小布包，聞了神清氣爽。解除睡眠、封印、暈眩、幻境。', type: 'use', price: 40, ch: 1, icon: 'bag', use: { target: 'ally', cure: ['sleep', 'seal', 'stun', 'trance'] } },
  pinganfu: { name: '平安符', desc: '廟裡求來的平安符，摺成小小一包。解除異常並護身三回合。', type: 'use', price: 80, ch: 1, icon: 'talisman', use: { target: 'ally', cure: ['poison', 'sleep', 'seal', 'stun'], status: { id: 'shield', chance: 1, turns: 3 }, battle: true } },

  // ---- regional food (picked up as you travel the island) ----
  yuyuan: { name: '芋圓湯', desc: '九份阿柑姨的招牌，Q彈香甜。白芷吃第一口時愣住了。回復氣血 80、真氣 10。', type: 'use', price: 20, ch: 1, icon: 'food', use: { target: 'ally', heal: 80, mp: 10 } },
  caozaiguo: { name: '草仔粿', desc: '艾草揉進糯米皮，包著菜脯米。回復氣血 150。', type: 'use', price: 40, ch: 1, icon: 'food', use: { target: 'ally', heal: 150 } },
  mijiu: { name: '米酒', desc: '雲歸的最愛。「這是藥引，不是酒。」回復真氣 40。', type: 'use', price: 50, ch: 3, icon: 'wine', use: { target: 'ally', mp: 40 } },
  mifentang: { name: '米粉湯', desc: '艋舺街邊的一碗熱湯，配上黑白切。全體回復氣血 120。', type: 'use', price: 90, ch: 3, icon: 'food', use: { target: 'allies', heal: 120 } },
  shibing: { name: '柿餅', desc: '新埔九降風吹出來的柿餅，甜得像蜜。回復真氣 50。', type: 'use', price: 60, ch: 4, icon: 'food', use: { target: 'ally', mp: 50 } },
  leicha: { name: '擂茶', desc: '客家伙房裡用擂缽慢慢磨出來的茶，香氣濃厚。回復真氣 80 並解除中毒。', type: 'use', price: 100, ch: 4, icon: 'drink', use: { target: 'ally', mp: 80, cure: ['poison'] } },
  bantiao: { name: '粄條', desc: '客家庄的米食，滑順有嚼勁。回復氣血 300。', type: 'use', price: 80, ch: 4, icon: 'food', use: { target: 'ally', heal: 300 } },
  xiancao: { name: '仙草', desc: '關西的仙草煮成黑亮的凍，退火又解熱。回復氣血 150 並解除一切異常。', type: 'use', price: 70, ch: 4, icon: 'drink', use: { target: 'ally', heal: 150, cure: ['poison', 'sleep', 'seal', 'stun', 'trance'] } },
  niushebing: { name: '牛舌餅', desc: '鹿港老餅舖的牛舌餅，薄脆酥香。回復氣血 250、真氣 20。', type: 'use', price: 90, ch: 5, icon: 'food', use: { target: 'ally', heal: 250, mp: 20 } },
  ezaijian: { name: '蚵仔煎', desc: '鹿港海口的鮮蚵，煎得外酥內嫩。回復氣血 350。', type: 'use', price: 110, ch: 5, icon: 'food', use: { target: 'ally', heal: 350 } },
  wanguo: { name: '碗粿', desc: '府城的碗粿，淋上醬油膏。回復氣血 500。', type: 'use', price: 150, ch: 6, icon: 'food', use: { target: 'ally', heal: 500 } },
  shimuyu: { name: '虱目魚粥', desc: '府城人的早餐，一碗熱粥暖到心裡。全體回復氣血 300。', type: 'use', price: 260, ch: 6, icon: 'food', use: { target: 'allies', heal: 300 } },
  fenglisu: { name: '鳳梨酥', desc: '「旺來」討個好彩頭。回復氣血 400、真氣 40。', type: 'use', price: 200, ch: 6, icon: 'food', use: { target: 'ally', heal: 400, mp: 40 } },
  aiyu: { name: '愛玉', desc: '嘉義山區的愛玉子搓洗成凍，加點檸檬。回復真氣 100。', type: 'use', price: 200, ch: 7, icon: 'drink', use: { target: 'ally', mp: 100 } },
  xiaomijiu: { name: '小米酒', desc: '主人家熱情遞來的小米酒。依禮輕抿一口，心意比酒更暖。回復真氣 150 並持續回復氣血。', type: 'use', price: 0, ch: 7, icon: 'wine', use: { target: 'ally', mp: 150, status: { id: 'regen', chance: 1, turns: 4 } } },
  wuyuzi: { name: '烏魚子', desc: '冬天烏魚洄游時做成的珍饈，打狗港的漁家送的。回復氣血 900。', type: 'use', price: 450, ch: 9, icon: 'food', use: { target: 'ally', heal: 900 } },
  yinghuaxia: { name: '櫻花蝦餅', desc: '東港的櫻花蝦炸成的餅，紅豔酥脆。全體回復氣血 600。', type: 'use', price: 600, ch: 9, icon: 'food', use: { target: 'allies', heal: 600 } },
  feiyugan: { name: '飛魚乾', desc: '蘭嶼的飛魚曬成魚乾，海風的味道。回復氣血 1200。', type: 'use', price: 400, ch: 10, icon: 'food', use: { target: 'ally', heal: 1200 } },
  shijia: { name: '釋迦', desc: '台東的釋迦，像佛頭一樣一顆顆的果實，綿密香甜。回復真氣 180。', type: 'use', price: 350, ch: 10, icon: 'food', use: { target: 'ally', mp: 180 } },
  mashu: { name: '花蓮麻糬', desc: '軟糯的麻糬，裹著花生粉。全體回復氣血 700。', type: 'use', price: 700, ch: 10, icon: 'food', use: { target: 'allies', heal: 700 } },
  heitanggao: { name: '黑糖糕', desc: '澎湖的黑糖糕，鬆軟Q彈。全體回復氣血 900。', type: 'use', price: 900, ch: 11, icon: 'food', use: { target: 'allies', heal: 900 } },
  xianrenzhang: { name: '仙人掌冰', desc: '澎湖海邊的紫紅色冰品，酸甜清涼。全體回復真氣 120。', type: 'use', price: 800, ch: 11, icon: 'drink', use: { target: 'allies', mp: 120 } },

  // ---- spirit items ----
  lingxun: { name: '七彩靈蕈', desc: '霧林深處發光的七色蕈。吃下後能得「靈視」，看見藏起來的路與魂；戰鬥中使一名同伴進入「幻境」（暴擊、術法提升，偶爾會恍神）。', type: 'use', price: 120, ch: 2, icon: 'mushroom', use: { target: 'ally', vision: 300, status: { id: 'trance', chance: 1, turns: 4 }, field: true, battle: true } },

  // ---- throwables ----
  bianpao: { name: '鞭炮', desc: '中元普渡剩下的鞭炮。劈哩啪啦，鬼也怕。對敵全體造成 40 點火屬性傷害。', type: 'use', price: 25, ch: 1, icon: 'bomb', use: { target: 'enemies', damage: 40, elem: 'fire', battle: true } },
  fu_lei: { name: '掌心雷符', desc: '太虛觀量產的雷符，誰都能丟。對敵一體造成 160 點木屬性傷害。', type: 'use', price: 60, ch: 2, icon: 'talisman', use: { target: 'enemy', damage: 160, elem: 'wood', battle: true } },
  fu_zhenxie: { name: '鎮邪符', desc: '對敵一體，高機率封印其術法三回合。', type: 'use', price: 80, ch: 3, icon: 'talisman', use: { target: 'enemy', status: { id: 'seal', chance: 0.8, turns: 3 }, battle: true } },
  fu_dingshen: { name: '定身符', desc: '對敵一體，可能使其暈眩一回合。', type: 'use', price: 90, ch: 3, icon: 'talisman', use: { target: 'enemy', status: { id: 'stun', chance: 0.7, turns: 1 }, battle: true } },
  fengpao: { name: '蜂炮', desc: '鹽水蜂炮的沖天炮，萬箭齊發。對敵全體造成 350 點火屬性傷害。', type: 'use', price: 220, ch: 6, icon: 'bomb', use: { target: 'enemies', damage: 350, elem: 'fire', battle: true } },
  fu_wulei: { name: '五雷符', desc: '一張就能招來五道雷。對敵全體造成 800 點木屬性傷害。', type: 'use', price: 600, ch: 8, icon: 'talisman', use: { target: 'enemies', damage: 800, elem: 'wood', battle: true } },
  fu_taiji: { name: '太極符', desc: '陰陽交融的符籙。對敵全體造成 1500 點無屬性傷害。', type: 'use', price: 1200, ch: 11, icon: 'talisman', use: { target: 'enemies', damage: 1500, elem: null, battle: true } },

  // ===================================================================================== Weapons
  // ---- 沈星河: swords ----
  sw_bamboo: { name: '竹劍', desc: '燈籠舖後院削的練習劍。', type: 'weapon', price: 20, ch: 0, icon: 'sword', who: ['xinghe'], stats: { atk: 5 } },
  sw_yinghuo: { name: '螢火', desc: '陳伯交給星河的劍，劍身裡像有螢光流動。火屬性。', type: 'weapon', price: 0, ch: 1, icon: 'sword', who: ['xinghe'], elem: 'fire', stats: { atk: 12, luk: 2 } },
  sw_bronze: { name: '青銅古劍', desc: '平溪老礦工家裡傳下來的古劍。', type: 'weapon', price: 180, ch: 2, icon: 'sword', who: ['xinghe'], stats: { atk: 18 } },
  sw_banka: { name: '艋舺精鋼劍', desc: '艋舺打鐵街的好貨，老闆說是「頂港有名聲」。', type: 'weapon', price: 330, ch: 3, icon: 'sword', who: ['xinghe'], stats: { atk: 25 } },
  sw_jiujiang: { name: '九降風劍', desc: '竹塹鐵匠在九降風中淬火，劍身輕快。', type: 'weapon', price: 520, ch: 4, icon: 'sword', who: ['xinghe'], stats: { atk: 32, spd: 3 } },
  sw_bailian: { name: '百煉鋼劍', desc: '鹿港老鐵舖百煉而成。', type: 'weapon', price: 730, ch: 5, icon: 'sword', who: ['xinghe'], stats: { atk: 40 } },
  sw_qixing: { name: '七星劍', desc: '劍身鑲著北斗七星，府城道壇的法劍。', type: 'weapon', price: 970, ch: 6, icon: 'sword', who: ['xinghe'], stats: { atk: 48, mag: 6 } },
  sw_hantie: { name: '寒鐵劍', desc: '山中寒鐵鑄成，劍氣森冷。', type: 'weapon', price: 1220, ch: 7, icon: 'sword', who: ['xinghe'], stats: { atk: 57 } },
  sw_jinggu: { name: '鯨骨劍', desc: '旗後老漁夫以鯨骨嵌鋼打造，入水不鏽。', type: 'weapon', price: 1800, ch: 9, icon: 'sword', who: ['xinghe'], stats: { atk: 72, def: 4 } },
  sw_dengxin: { name: '燈心・螢火', desc: '燈母之火重燃的螢火，劍身如一盞不滅的燈。火屬性，劍意累積加快。', type: 'weapon', price: 0, ch: 11, icon: 'sword', who: ['xinghe'], elem: 'fire', stats: { atk: 92, mag: 15, luk: 6 }, special: ['gaugeUp'] },

  // ---- 白芷: flutes ----
  fl_jade: { name: '玉笛', desc: '白芷醒來時握在手裡的玉笛，吹起來像潮聲。', type: 'weapon', price: 0, ch: 0, icon: 'flute', who: ['baizhi'], stats: { atk: 2, mag: 6 } },
  fl_bamboo: { name: '九份竹笛', desc: '燈籠舖隔壁的竹藝攤做的笛子。', type: 'weapon', price: 60, ch: 1, icon: 'flute', who: ['baizhi'], stats: { atk: 3, mag: 11 } },
  fl_qinglan: { name: '青嵐笛', desc: '平溪山中的老竹製成，吹出的音帶著山嵐。', type: 'weapon', price: 180, ch: 2, icon: 'flute', who: ['baizhi'], stats: { atk: 4, mag: 17 } },
  fl_zizhu: { name: '紫竹簫', desc: '艋舺樂器行的紫竹洞簫，聲音低沉溫潤。', type: 'weapon', price: 330, ch: 3, icon: 'flute', who: ['baizhi'], stats: { atk: 5, mag: 24, mp: 6 } },
  fl_shange: { name: '山歌竹笛', desc: '客家庄阿伯送的笛子，說山歌唱得好的人才配吹。', type: 'weapon', price: 520, ch: 4, icon: 'flute', who: ['baizhi'], stats: { atk: 6, mag: 31, mp: 10 } },
  fl_diaohua: { name: '鹿港雕花笛', desc: '鹿港木雕師傅刻滿了海浪紋。', type: 'weapon', price: 730, ch: 5, icon: 'flute', who: ['baizhi'], stats: { atk: 7, mag: 39, mp: 12 } },
  fl_baiyu: { name: '白玉簫', desc: '府城古董行的白玉簫，觸手生涼。', type: 'weapon', price: 970, ch: 6, icon: 'flute', who: ['baizhi'], stats: { atk: 8, mag: 47, mp: 15 } },
  fl_coral: { name: '珊瑚笛', desc: '南方海底的紅珊瑚做成，聽得見海的心跳。', type: 'weapon', price: 1800, ch: 9, icon: 'flute', who: ['baizhi'], stats: { atk: 10, mag: 68, mp: 20 } },
  fl_chaoyin: { name: '潮音笛', desc: '黑潮之上漂來的笛，吹響時浪會安靜下來。', type: 'weapon', price: 2150, ch: 10, icon: 'flute', who: ['baizhi'], stats: { atk: 11, mag: 76, mp: 25 } },
  fl_shorelight: { name: '彼岸燈笛', desc: '彼岸燈的光凝成的笛。治癒之力大增。', type: 'weapon', price: 0, ch: 11, icon: 'flute', who: ['baizhi'], elem: 'water', stats: { atk: 12, mag: 90, mp: 30 }, special: ['healUp'] },

  // ---- 洛紅纓: spears ----
  sp_hongying: { name: '紅纓槍', desc: '洛家的紅纓槍，紅纓是她娘親手綁的。', type: 'weapon', price: 0, ch: 2, icon: 'spear', who: ['hongying'], stats: { atk: 16 } },
  sp_bintie: { name: '鑌鐵槍', desc: '淡水碼頭洋行轉賣的好鐵打成。', type: 'weapon', price: 330, ch: 3, icon: 'spear', who: ['hongying'], stats: { atk: 24 } },
  sp_zhujie: { name: '竹節鋼槍', desc: '槍桿如竹節，剛中帶韌。', type: 'weapon', price: 520, ch: 4, icon: 'spear', who: ['hongying'], stats: { atk: 31, spd: 2 } },
  sp_hutou: { name: '洛家虎頭槍', desc: '洛家古厝祠堂裡供著的家傳寶槍。', type: 'weapon', price: 0, ch: 5, icon: 'spear', who: ['hongying'], stats: { atk: 41, def: 3 } },
  sp_qilin: { name: '麒麟槍', desc: '槍頭鑄成麒麟形，府城兵器鋪的鎮店之寶。', type: 'weapon', price: 970, ch: 6, icon: 'spear', who: ['hongying'], stats: { atk: 48 } },
  sp_hanyu: { name: '寒玉槍', desc: '槍尖嵌著寒玉，刺出時帶霜。', type: 'weapon', price: 1220, ch: 7, icon: 'spear', who: ['hongying'], stats: { atk: 56, spd: 3 } },
  sp_zhenchao: { name: '鎮潮槍', desc: '安平老砲台旁找到的長槍，槍身刻著潮紋。', type: 'weapon', price: 1500, ch: 8, icon: 'spear', who: ['hongying'], stats: { atk: 64 } },
  sp_shaya: { name: '旗後鯊牙槍', desc: '槍頭鑲著巨鯊的牙。', type: 'weapon', price: 1800, ch: 9, icon: 'spear', who: ['hongying'], stats: { atk: 72, luk: 4 } },
  sp_polang: { name: '破浪槍', desc: '迎著黑潮也不退的長槍。', type: 'weapon', price: 2150, ch: 10, icon: 'spear', who: ['hongying'], stats: { atk: 80, spd: 4 } },
  sp_qingfeng: { name: '紅纓・青鋒', desc: '哥哥的劍鍛進了槍頭。暴擊率提升。', type: 'weapon', price: 0, ch: 11, icon: 'spear', who: ['hongying'], stats: { atk: 93, spd: 6 }, special: ['critUp'] },

  // ---- 雲歸: fans & talisman sets ----
  fn_taixu: { name: '太虛符扇', desc: '太虛觀的符扇，扇骨夾著一疊符紙。扇面上的字是清虛真人寫的。', type: 'weapon', price: 0, ch: 3, icon: 'fan', who: ['yungui'], stats: { atk: 4, mag: 26 } },
  fn_zhugu: { name: '竹骨符扇', desc: '竹塹的竹子做的扇骨，風一吹符紙就自己飛出去。', type: 'weapon', price: 520, ch: 4, icon: 'fan', who: ['yungui'], stats: { atk: 5, mag: 34, mp: 8 } },
  fn_zhusha: { name: '硃砂符冊', desc: '用鹿港老硃砂畫的一整冊符。', type: 'weapon', price: 730, ch: 5, icon: 'talisman', who: ['yungui'], stats: { atk: 6, mag: 43, mp: 12 } },
  fn_qixing: { name: '七星符扇', desc: '扇面畫著北斗，府城道士的珍藏。', type: 'weapon', price: 970, ch: 6, icon: 'fan', who: ['yungui'], stats: { atk: 7, mag: 52, mp: 15 } },
  fn_yunhai: { name: '雲海扇', desc: '扇開如雲海翻湧。', type: 'weapon', price: 1220, ch: 7, icon: 'fan', who: ['yungui'], stats: { atk: 8, mag: 61, mp: 18 } },
  fn_leiting: { name: '雷霆符匣', desc: '一只裝滿雷符的木匣，打開時會劈啪作響。', type: 'weapon', price: 1500, ch: 8, icon: 'talisman', who: ['yungui'], elem: 'wood', stats: { atk: 9, mag: 70, mp: 20 } },
  fn_haifeng: { name: '海風符扇', desc: '恆春落山風吹不斷的扇子。', type: 'weapon', price: 1800, ch: 9, icon: 'fan', who: ['yungui'], stats: { atk: 10, mag: 79, mp: 24 } },
  fn_huanglong: { name: '黃龍符陣', desc: '一套能自行布陣的符籙。', type: 'weapon', price: 2150, ch: 10, icon: 'talisman', who: ['yungui'], stats: { atk: 11, mag: 88, mp: 28 } },
  fn_wanfa: { name: '萬法歸宗扇', desc: '清虛真人留下的扇子，扇面空白——「法無定法」。每回合回復真氣。', type: 'weapon', price: 0, ch: 11, icon: 'fan', who: ['yungui'], stats: { atk: 12, mag: 100, mp: 35 }, special: ['mpRegen'] },

  // ===================================================================================== Armor
  ar_cloth: { name: '粗布短衫', desc: '燈籠舖學徒的工作服，袖口沾著紙漿。', type: 'armor', price: 20, ch: 0, icon: 'armor', stats: { def: 3 } },
  ar_seafoam: { name: '海沫褙子', desc: '白芷身上那件繡著浪花的褙子，摸起來像潮濕的月光。', type: 'armor', price: 0, ch: 0, icon: 'armor', who: ['baizhi'], stats: { def: 4, mag: 2 }, resist: ['water'] },
  ar_padded: { name: '夾棉短襖', desc: '九份布莊的厚棉襖，山城夜裡風大。', type: 'armor', price: 50, ch: 1, icon: 'armor', stats: { def: 6 } },
  ar_leather: { name: '牛皮甲', desc: '平溪獵戶做的皮甲。', type: 'armor', price: 140, ch: 2, icon: 'armor', stats: { def: 9 } },
  ar_crimson: { name: '赤羅短袍', desc: '紅纓的戰袍，外罩黑皮背心。', type: 'armor', price: 0, ch: 2, icon: 'armor', who: ['hongying'], stats: { def: 10, spd: 2 } },
  ar_taoist: { name: '太虛道袍', desc: '洗得發白的道袍，腰間繫著太極帶。', type: 'armor', price: 0, ch: 3, icon: 'armor', who: ['yungui'], stats: { def: 12, mag: 4 } },
  ar_hakka: { name: '藍衫', desc: '客家庄阿姆親手縫的藍衫，樸素耐穿，袖口反摺。', type: 'armor', price: 400, ch: 4, icon: 'armor', stats: { def: 17, hp: 20 } },
  ar_brocade: { name: '鹿港錦袍', desc: '鹿港布行的上等錦緞，暗繡著雲紋。', type: 'armor', price: 560, ch: 5, icon: 'armor', stats: { def: 21, mag: 4 } },
  ar_chain: { name: '鎖子甲', desc: '府城武館的鎖子甲。', type: 'armor', price: 730, ch: 6, icon: 'armor', stats: { def: 26 } },
  ar_yunwen: { name: '雲紋衣', desc: '輕如山嵐的衣裳，能擋住林間的瘴氣與木靈之力。', type: 'armor', price: 920, ch: 7, icon: 'armor', stats: { def: 30, spd: 2 }, resist: ['wood'] },
  ar_bishui: { name: '避水衣', desc: '浸過桐油與符水，潮水不沾身。', type: 'armor', price: 1130, ch: 8, icon: 'armor', stats: { def: 34 }, resist: ['water'] },
  ar_heichao: { name: '黑潮鱗甲', desc: '用黑潮裡大魚的鱗片綴成，又輕又韌。', type: 'armor', price: 1600, ch: 10, icon: 'armor', stats: { def: 42, hp: 40 } },
  ar_dengyi: { name: '燈火羽衣', desc: '千盞心燈的光織成的衣裳。戰鬥開始時持續回復。', type: 'armor', price: 0, ch: 11, icon: 'armor', stats: { def: 48, mag: 8 }, special: ['autoRegen'] },

  // ===================================================================================== Head
  hd_lanternpin: { name: '燈籠髮簪', desc: '一支小小的燈籠形髮簪。誰給她的？她不記得了。', type: 'head', price: 0, ch: 0, icon: 'hairpin', who: ['baizhi'], stats: { def: 2, mag: 3 } },
  hd_douli: { name: '斗笠', desc: '遮雨又遮陽。', type: 'head', price: 30, ch: 1, icon: 'hat', stats: { def: 3 } },
  hd_ribbon: { name: '紅緞髮帶', desc: '紅纓束馬尾的長緞帶。', type: 'head', price: 0, ch: 2, icon: 'hairpin', who: ['hongying'], stats: { def: 4, spd: 1 } },
  hd_toujin: { name: '布頭巾', desc: '結實的粗布頭巾。', type: 'head', price: 90, ch: 2, icon: 'hat', stats: { def: 5 } },
  hd_woodcrown: { name: '木冠', desc: '雲歸半束髮用的木髮冠。', type: 'head', price: 0, ch: 3, icon: 'hat', who: ['yungui'], stats: { def: 6, mag: 3 } },
  hd_huabu: { name: '花布頭巾', desc: '客家花布縫的頭巾，大紅牡丹開得熱鬧。', type: 'head', price: 260, ch: 4, icon: 'hat', stats: { def: 9 } },
  hd_yuguan: { name: '玉冠', desc: '府城玉器行的白玉冠。', type: 'head', price: 480, ch: 6, icon: 'hat', stats: { def: 13, mag: 4 } },
  hd_yunjin: { name: '雲紋巾', desc: '山中雲霧般輕柔的頭巾，戴上後心神清明，不入幻境。', type: 'head', price: 600, ch: 7, icon: 'hat', stats: { def: 15 }, immune: ['trance'] },
  hd_shanhu: { name: '珊瑚簪', desc: '紅珊瑚雕的髮簪。', type: 'head', price: 900, ch: 9, icon: 'hairpin', who: ['baizhi', 'hongying'], stats: { def: 18, mag: 8 } },
  hd_kunlin: { name: '鯤鱗冠', desc: '鯤的鱗片打磨成的冠。', type: 'head', price: 1050, ch: 10, icon: 'hat', stats: { def: 21, hp: 30 } },
  hd_xingguan: { name: '星冠', desc: '彼岸的星光凝成的冠，戴上後不會被封住心念。', type: 'head', price: 0, ch: 11, icon: 'hat', stats: { def: 24, mag: 8 }, immune: ['seal'] },

  // ===================================================================================== Feet
  ft_straw: { name: '草鞋', desc: '踩過九份每一級石階的草鞋。', type: 'feet', price: 10, ch: 0, icon: 'shoes', stats: { def: 1, spd: 1 } },
  ft_cloth: { name: '布鞋', desc: '千層底布鞋。', type: 'feet', price: 40, ch: 1, icon: 'shoes', stats: { def: 2, spd: 2 } },
  ft_boots: { name: '皮靴', desc: '紅纓的短皮靴，鞋尖包鐵。', type: 'feet', price: 0, ch: 2, icon: 'shoes', who: ['hongying'], stats: { def: 4, spd: 2 } },
  ft_cloud: { name: '雲履', desc: '道士的布履，走起路來沒有聲音。', type: 'feet', price: 0, ch: 3, icon: 'shoes', who: ['yungui'], stats: { def: 4, spd: 3 } },
  ft_muji: { name: '木屐', desc: '艋舺街上喀啦喀啦響的木屐。', type: 'feet', price: 160, ch: 3, icon: 'shoes', stats: { def: 5, spd: 3 } },
  ft_lupi: { name: '鹿皮靴', desc: '鹿港皮匠的手工靴。', type: 'feet', price: 330, ch: 5, icon: 'shoes', stats: { def: 8, spd: 4 } },
  ft_bangtui: { name: '登山綁腿', desc: '山路走得再久也不會腿痠。', type: 'feet', price: 550, ch: 7, icon: 'shoes', stats: { def: 11, spd: 6 } },
  ft_talang: { name: '踏浪靴', desc: '在甲板上也站得穩。', type: 'feet', price: 820, ch: 9, icon: 'shoes', stats: { def: 14, spd: 7 } },
  ft_shunfeng: { name: '順風履', desc: '頭城搶孤後，鄉親送的一雙好鞋。', type: 'feet', price: 960, ch: 10, icon: 'shoes', stats: { def: 16, spd: 9 } },
  ft_bulian: { name: '步蓮履', desc: '每一步都像踏在燈火上。戰鬥開始時搶先行動。', type: 'feet', price: 0, ch: 11, icon: 'shoes', stats: { def: 19, spd: 11 }, special: ['firstStrike'] },

  // ===================================================================================== Accessories
  ac_redstring: { name: '紅線手環', desc: '陳伯在星河小時候綁上的紅線，說是保平安。', type: 'acc', price: 0, ch: 0, icon: 'charm', who: ['xinghe'], stats: { luk: 3, hp: 10 } },
  ac_armguard: { name: '黑皮護臂', desc: '紅纓的護臂，內側刻著一個「洛」字。', type: 'acc', price: 0, ch: 2, icon: 'charm', who: ['hongying'], stats: { atk: 3, def: 3 } },
  ac_gourd: { name: '酒葫蘆', desc: '雲歸腰間的葫蘆。「裡面是藥酒，真的。」每回合回復少許真氣。', type: 'acc', price: 0, ch: 3, icon: 'wine', who: ['yungui'], stats: { mp: 10 }, special: ['mpRegen'] },
  ac_xionghuang: { name: '雄黃香囊', desc: '裝著雄黃的香囊，蛇蟲毒物不近身。免疫中毒。', type: 'acc', price: 150, ch: 2, icon: 'bag', stats: { def: 2 }, immune: ['poison'] },
  ac_huzhao: { name: '虎爪項鍊', desc: '虎姑婆留下的一枚爪子。攻擊提升，暴擊率提升。', type: 'acc', price: 400, ch: 2, icon: 'charm', stats: { atk: 5 }, special: ['critUp'] },
  ac_tongling: { name: '銅鈴', desc: '道士的手搖銅鈴，叮噹聲能喚醒迷魂。免疫睡眠。', type: 'acc', price: 300, ch: 3, icon: 'charm', stats: { mag: 3 }, immune: ['sleep'] },
  ac_tuanzi: { name: '貓毛球', desc: '麻糬換毛季掉的長毛搓成的小球，軟綿綿。紅纓偷偷收了好幾顆。', type: 'acc', price: 0, ch: 3, icon: 'charm', stats: { luk: 8, spd: 2 } },
  ac_bagua: { name: '八卦鏡墜', desc: '小小的八卦鏡，邪術照了就彈回去。免疫封印。', type: 'acc', price: 600, ch: 4, icon: 'jade', stats: { def: 4 }, immune: ['seal'] },
  ac_yingshi: { name: '螢石墜', desc: '會在黑暗中微微發光的石頭。劍意累積加快。', type: 'acc', price: 800, ch: 4, icon: 'gem', stats: { luk: 4 }, special: ['gaugeUp'] },
  ac_maobi: { name: '秀才毛筆', desc: '竹塹老秀才送的毛筆。「讀萬卷書，行萬里路。」獲得經驗提升。', type: 'acc', price: 1000, ch: 4, icon: 'scroll', stats: { mag: 4 }, special: ['expUp'] },
  ac_rongye: { name: '榕葉結', desc: '老榕樹的葉子編成的結，生生不息。戰鬥開始時持續回復。', type: 'acc', price: 1200, ch: 5, icon: 'charm', stats: { hp: 30 }, special: ['autoRegen'] },
  ac_jinqian: { name: '古錢串', desc: '一串磨得發亮的古錢。戰鬥獲得的銀兩增加。', type: 'acc', price: 900, ch: 5, icon: 'charm', stats: { luk: 6 }, special: ['goldUp'] },
  ac_yeming: { name: '夜明珠', desc: '府城古董行的夜明珠，夜裡亮如小燈。', type: 'acc', price: 1100, ch: 6, icon: 'gem', stats: { mag: 12, mp: 20 } },
  ac_qingxin: { name: '清心玉珮', desc: '溫潤的玉珮，心神不亂。免疫幻境與暈眩。', type: 'acc', price: 1300, ch: 7, icon: 'jade', stats: { mag: 6, def: 4 }, immune: ['trance', 'stun'] },
  ac_haixing: { name: '海星墜', desc: '恆春海邊撿到的海星化石。', type: 'acc', price: 1400, ch: 9, icon: 'gem', stats: { def: 8, hp: 60, luk: 4 } },
  ac_lianhua: { name: '蓮花燈墜', desc: '一盞小小的蓮花燈，裡面亮著所有被渡過的人的光。', type: 'acc', price: 0, ch: 11, icon: 'lantern', stats: { atk: 6, def: 6, mag: 6, spd: 4, luk: 6 }, special: ['autoRegen', 'gaugeUp'] },

  // ===================================================================================== Materials (雲歸's mushroom quest etc.)
  mat_wuxun: { name: '霧林小蕈', desc: '霧林裡常見的小蕈。雲歸：「可以吃，但不建議。」', type: 'material', price: 20, ch: 2, icon: 'mushroom' },
  mat_yueguang: { name: '月光蕈', desc: '只在滿月夜發光的蕈。雲歸的蕈菇清單之一。', type: 'material', price: 80, ch: 3, icon: 'mushroom' },
  mat_fengxun: { name: '風穴石耳', desc: '五指山風穴岩壁上長的石耳。', type: 'material', price: 120, ch: 4, icon: 'mushroom' },
  mat_yunzhi: { name: '雲芝', desc: '雲霧林中的靈芝，紋路像雲。', type: 'material', price: 300, ch: 7, icon: 'mushroom' },
  mat_haixun: { name: '潮汐蕈', desc: '只長在退潮礁岩上的奇怪蕈類。', type: 'material', price: 400, ch: 9, icon: 'mushroom' },
  mat_huaxun: { name: '彼岸蕈', desc: '彼岸花原上唯一不是紅色的東西。', type: 'material', price: 800, ch: 11, icon: 'mushroom' },

  // ===================================================================================== Key items
  key_yinhunling: { name: '引魂令', desc: '陳伯交給星河的令牌，引魂人的信物。持有它的人，迷途的魂會願意聽他說話。', type: 'key', price: 0, ch: 1, icon: 'key' },
  key_watch: { name: '阿土伯的懷錶', desc: '舊金礦坑裡找到的懷錶，停在礦坑崩塌的那一刻。', type: 'key', price: 0, ch: 1, icon: 'watch' },
  key_jadetag: { name: '白芷的玉牌', desc: '刻著「白芷」二字的玉牌。背面有一道看不清的燈紋。', type: 'key', price: 0, ch: 1, icon: 'jade' },
  key_oar: { name: '引魂槳', desc: '陳伯的槳。槳面刻滿了被渡過的名字。', type: 'key', price: 0, ch: 9, icon: 'key' },
  key_skylantern: { name: '天燈', desc: '平溪的天燈，四面寫滿了願望。', type: 'key', price: 0, ch: 2, icon: 'lantern' },
  key_sonletter: { name: '兒子的家書', desc: '平溪老夫婦的兒子寫的信，一直沒有寄到。', type: 'key', price: 0, ch: 2, icon: 'letter' },
  key_mirror: { name: '照魂鏡', desc: '太虛觀的古鏡，能照出魂魄的本相。', type: 'key', price: 0, ch: 3, icon: 'gem' },
  key_letter: { name: '清虛的信', desc: '清虛真人留在太虛觀的信：「若我未歸，往南，沿海路，經竹塹。」', type: 'key', price: 0, ch: 3, icon: 'letter' },
  key_ledger: { name: '生死簿殘頁', desc: '竹塹城隍廟的生死簿缺了一頁，上面的名字被風吹散了。', type: 'key', price: 0, ch: 4, icon: 'scroll' },
  key_jianpu: { name: '洛家劍譜', desc: '青鋒最後交給紅纓的劍譜。邊角寫著小小的字：「給阿纓。」', type: 'key', price: 0, ch: 8, icon: 'scroll' },
  key_dreamvine: { name: '夢藤', desc: '藤婆的雲霧林裡才長的藤，入夢禮的藥引。只能在藤婆的指引下使用。', type: 'key', price: 0, ch: 7, icon: 'vine' },
  key_lighthouse: { name: '鵝鑾鼻燈火', desc: '燈塔守留下的火種，要用來點亮王船的燈。', type: 'key', price: 0, ch: 9, icon: 'lantern' },
  key_boateye: { name: '船眼', desc: '達悟族長者送的刻紋船眼，能指引船隻平安回家。', type: 'key', price: 0, ch: 10, icon: 'charm' },
  key_flag: { name: '順風旗', desc: '頭城搶孤奪下的順風旗，最後的航程需要它。', type: 'key', price: 0, ch: 10, icon: 'scroll' },
  key_homeletter: { name: '唐山客的家書', desc: '黑水溝上一個溺死的唐山客託付的信，寫著回不去的家鄉地址。', type: 'key', price: 0, ch: 11, icon: 'letter' },
};

// ===================================================================================== engine fixes to chapter items
// Chapter files (js/maps/chN_*.js) load after this file and Object.assign their own items into G.Data.items. A fix
// listed here is merged into that chapter definition the moment it is assigned (top-level fields replace; `use`
// merges), so the id keeps working everywhere without touching the chapter file. Keep the reason next to each fix.
G.Data.itemFixes = {
  // 回魂香 (ch6 藥鋪 / chest c6_12): the design (docs/story/ch6_tainan.md, item table) is a WHOLE-PARTY revive at
  // 30% for 1200 文; the chapter data had a single-target 60% revive. Battle + field menu handle target 'allies' +
  // revive (the fallen are included in the target pool).
  c6_revive_incense: {
    desc: '一整束的回魂香，煙會找到所有迷路的魂。倒下的同伴全體復活並回復三成氣血。', price: 1200,
    use: { target: 'allies', revive: 0.3 },
  },
  // 月老紅線 (ch6 3-8): LUK+20, and while 星河 (the wearer) and 白芷 are both in the active party they each get
  // SPD+5 (docs/story/ch6_tainan.md). `pair` is applied by G.Party.stats; the old flat spd:3 stood in for it.
  c6_red_thread: {
    stats: { luk: 20 },
    pair: { with: 'baizhi', both: true, stats: { spd: 5 }, label: '與白芷同在隊伍時，兩人速度＋5' },
  },
};
(function () {
  const items = G.Data.items;
  const merge = (v, fix) => {
    if (!v || typeof v !== 'object') return v;
    const out = Object.assign({}, v, fix);
    if (fix.use) out.use = Object.assign({}, v.use || {}, fix.use);
    return out;
  };
  for (const id of Object.keys(G.Data.itemFixes)) {
    const fix = G.Data.itemFixes[id];
    if (items[id]) { items[id] = merge(items[id], fix); continue; }
    // not defined yet: the first assignment (the chapter's Object.assign) stores the merged definition as a plain
    // data property; until then the id stays non-enumerable so loops over G.Data.items never see an empty entry
    Object.defineProperty(items, id, {
      configurable: true, enumerable: false,
      get() { return undefined; },
      set(v) { Object.defineProperty(items, id, { value: merge(v, fix), writable: true, enumerable: true, configurable: true }); },
    });
  }
  if (G.I18N && G.I18N.add) {
    G.I18N.add({
      '一整束的回魂香，煙會找到所有迷路的魂。倒下的同伴全體復活並回復三成氣血。': 'A whole bundle of soul-calling incense; its smoke finds every soul that has lost its way. Revives all fallen allies with 30% HP.',
      '與白芷同在隊伍時，兩人速度＋5': 'With Bai Zhi in the party: both SPD +5',
    });
  }
})();
