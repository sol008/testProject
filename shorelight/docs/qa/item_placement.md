# Item placement — every item can be obtained

The strategy-guide build listed items that are defined in data (`js/data/items.js`, plus chapter items in
`js/maps/chN_*.js`) that nothing hands out: no shop, chest, drop, quest reward or script give. This pass puts each
one into the game, or marks it as not obtainable on purpose.

## How the list was made

`node tools/guide/build_guide.js --check-items` lists every item that has no source and exits 1 if there are any.
It uses the guide's own source detection (`SOURCES` + `STORY_ITEMS` in `tools/guide/build_guide.js`), which is now
strict:

| Source | Detected from |
|---|---|
| Shops | `S.shop(…)`, `shopkeeperTalk(…)`, `shopAt(…)` item lists, including their `push`/`splice` additions (unchanged) |
| Chests | `G.Maps.defs[id].chests[].item`, loaded per chapter (unchanged) |
| Drops | `G.Data.enemies[id].drops`, only for enemies that some chapter's troop actually uses |
| Script gives | `S.give('id'…)`, `G.Inv.add('id'…)`, `giveSilent('id')`, loot tables `item: 'id'`, ch10 driftwood crates `H.crate('key', x, y, [['id', n] …])` |
| Starting equipment | `G.Data.chars[].equip` |

- **Not a source:** a bare mention of an id. Before, any quoted id in a chapter script counted, including
  `S.hasItem`, `S.take` and the debug start kits.
- **Debug blocks:** the ch7 / ch9 / ch10 "standalone start" kits (`?debug&startch=N`) are excluded. A debug block is
  an `if (…) {` block with a comment that says "standalone" in the three lines above it.
- **取得 labels:** a script give can name its source for the guide's 取得 column with a trailing comment:
  `await S.give('id', 1); // 取得：第N章・…`.
- **Crates:** they now show as `第N章・<map>漂流木箱`. This also fixes the existing 黑潮劍, 斷崖槍 and 雲澗符扇,
  which used to read 劇情／事件.

With that detection, **37 items** had no source. The brief counted 39. The old, loose detection reported 30: it
counted the debug kits and conditions as sources, and it missed three items whose only drop came from enemies no
troop uses (`grudge_feast`, `fallwind`, `moya2` in `js/data/enemies.js`).

## Placement table

The power check compares each item with **shop tier**: the best item in the same slot that the chapter's shops
sell (and the chests already give), the gear `docs/BALANCE.md` assumes. Chest ids follow each chapter's own
convention.

| Item | Type · stats / effect · price | Fits | Where | How | Power check |
|---|---|---|---|---|---|
| 掌心雷符 `fu_lei` | use · 敵一體 160 木 · 60 | ch2–3 | ch3 太虛觀 NE corner (26,2) | chest `c3_14` ×3 | Throwable, sold-tier price |
| 月光蕈 `mat_yueguang` | material · 80 | ch3 | ch3 觀音山道 lower slope NE (36,46) | chest `c3_15` ×2 | — |
| 貓毛球 `ac_tuanzi` | acc · 運+8 速+2 · — | ch3 | ch3 淡水客棧, bed corner (12,7) | chest `c3_16` (紅纓: 「那是我收的！」) | Side-grade to 天燈吊飾 (法+3 運+2) |
| 照魂鏡 `key_mirror` | key | ch3 | ch3 太虛觀正殿 | Inspect the mirror after 雲歸 joins: he takes it along (`ch3_mirror_taken`) | — |
| 榕葉結 `ac_rongye` | acc · 命+30, regen at battle start · 1,200 | ch5 | ch5 洛家古厝 後院, under the banyan (7,2) | chest `c5_12` | Optional yard (the 憶蕈 corner); ch5 tier price |
| 寒鐵劍 `sw_hantie` | 星河 · 武+57 · 1,220 | ch7 | ch7 阿里山古道, west nook (2,14) | chest `c7_at_o` | Below the shop's 赤銅劍 60 and 赤霞劍 64 |
| 登山綁腿 `ft_bangtui` | feet · 防+11 速+6 · 550 | ch7 | ch7 玉山山徑, NW nook (2,3) | chest `c7_ys_p` | Shop 山行草鞋 is 10/6 |
| 雲紋巾 `hd_yunjin` | head · 防+15, immune 幻境 · 600 | ch7 | ch7 雲霧林, west wrong-way branch (4,30) | chest `c7_cf_q` | Shop 玉冠 is 13 + 法4; optional detour |
| 清心玉珮 `ac_qingxin` | acc · 法+6 防+4, immune 幻境/暈眩 · 1,300 | ch7 | ch7 雲霧林, east wrong-way branch (32,21) | chest `c7_cf_r` | Optional detour; the 金剛護符 chest already gives stun immunity |
| 小米酒 `xiaomijiu` | use · 氣+150 + regen | ch7 | ch7 Biung 的家 | Abus's send-off gift ×2 | Consumable |
| 夢藤 `key_dreamvine` | key | ch7 | ch7 藤婆小屋 | 藤婆 hands it over after the three days; given back at the 入夢禮 (`S.take`) | — |
| 金剛石屑 `c7_mat_jingang` | material · 80 | ch7 | ch7 燈母祠 | `stone_guardian` drop 30% | — |
| 避水衣 `ar_bishui` | armour · 防+34, resist 水 · 1,130 | ch8 | ch8 安平, SW tide line (4,33) | chest `c8_ap_tide` | Under the 北港 chest's 進香布衫 (防36, resist 水) |
| 雷霆符匣 `fn_leiting` | 雲歸 · 法+70 木 · 1,500 | ch8 | ch8 安平, NE corner (43,0) | chest `c8_ap_ne` | Shop/chest 雷音扇 is 72 |
| **鯨骨劍** `sw_jinggu` | 星河 · 武+72 防+4 · 1,800 | ch9 | ch9 旗後 beach | Gift from the old fisherman 海龍伯 the day after the night beach (`ch9_whalebone`): the sword he forged from a beached whale's bone | Shop 鐵骨劍 is 70; the 王船廠 chest's 巡海劍 is 78 |
| 旗後鯊牙槍 `sp_shaya` | 紅纓 · 武+72 運+4 · 1,800 | ch9 | ch9 旗後, behind the beached boats (4,1) | chest `qh_boats` | Below the shop's 破浪槍 80 / 月牙槍 79 |
| 踏浪靴 `ft_talang` | feet · 防+14 速+7 · 820 | ch9 | ch9 王船廠 工寮, west corner (1,22) | chest `wy_hall` | Shop 包鐵綁腿 is 13/5 |
| 珊瑚笛 `fl_coral` | 白芷 · 法+68 · 1,800 | ch9 | ch9 龍坑, NE side cave (40,21) | chest `lk_flute` | 白芷 is away from ch8 to the 燈心 (a keepsake, like 燈母織衣) |
| 潮汐蕈 `mat_haixun` | material · 400 | ch9 | ch9 龍坑 七仙蕈 spot | Given at the end of the 潮汐蕈 scene (like ch4 風穴石耳 and ch7 雲芝) | — |
| 珊瑚碎 `c9_mat_shanhusui` | material · 200 | ch9 | ch9 龍坑 (also the ch10/11 variants) | `sea_monster` drop 30% | — |
| 錢袋 `c9_mat_qiandai` | material · 600 | ch9 | ch9 半屏山腹 | `greed_ghost` drop 25% | — |
| 釋迦 `shijia` | use · 氣+180 · 350 | ch10 | ch10 寶桑 (台東), NW corner of the north field (0,0) | chest `baosangA` ×3 | Consumable |
| 潮音笛 `fl_chaoyin` | 白芷 · 法+76 · 2,150 | ch10 | ch10 蘭嶼・灘頭, west end (0,22) | Driftwood crate `shore_w` ("the Kuroshio washed it up") | Keepsake for 白芷 |
| 黑潮鱗甲 `ar_heichao` | armour · 防+42 命+40 · 1,600 | ch10 | ch10 蘭嶼・礁盤, west pocket (7,22) | Driftwood crate `reef_w` | Shop 藤甲 40 / 牛皮護心 39+30; 頭城 蕉絲衫 45 |
| 黃龍符陣 `fn_huanglong` | 雲歸 · 法+88 · 2,150 | ch10 | ch10 洄瀾, beside the 福德廟 (30,5) | chest `huilanA` | Below the 雲澗符扇 crate (90) and the shop's 海神符扇 (92) |
| 星冠 `hd_xingguan` | head · 防+24 法+8, immune 封印 | ch11 | ch11 彼岸花原, far NE corner (55,3) | chest `c11_17` | Shop 蕉絲頭巾 is 22 + 法6 |
| 步蓮履 `ft_bulian` | feet · 防+19 速+11, acts first | ch11 | ch11 燈塔四樓 (4,7), after the echo | chest `c11_t4` (like 1F's 赤霄槍) | The 黑岸 chest's 長明宮衛的鐵靴 is 防20 命30 |
| 唐山客的家書 `key_homeletter` | key | ch11 | ch11 石滬灘, beside the holed wreck (39,29) | chest `c11_18` (flavour line) | — |
| 燈火羽衣 `ar_dengyi` | armour · 防+48 法+8, regen | ch11 | ch11 彼岸花原 渡口 | 陳伯, with ≥ `G.Lanterns.THRESHOLD` (14) 心燈: the lit lanterns come back woven into a robe and a lamp (`ch11_lantern_gift`) | Under 鯤鱗甲 (防52 法10, resist 水); true-ending players only |
| 蓮花燈墜 `ac_lianhua` | acc · 武/防/法/運 +6, 速+4, regen + 劍意 | ch11 | same | same gift | 萬象鈴 is +8 to five stats |
| 紅纓・青鋒 `sp_qingfeng` | 紅纓 · 武+93 速+6, crit | ch11 | ch11 一息界 | 萬象遊戲, 2nd win (the middle child offers rematches) | Under the 1F chest's 赤霄槍 (96) |
| 萬法歸宗扇 `fn_wanfa` | 雲歸 · 法+100, MP regen | ch11 | same | 萬象遊戲, 2nd win | 2F chest 太虛雷扇 is 98 + MP regen; optional fight |
| 燈心・螢火 `sw_dengxin` | 星河 · 武+92 法+15, 劍意 | ch11 | same | 萬象遊戲, 3rd win | Under the story's 螢火・明 (98 / 22) |
| 彼岸燈笛 `fl_shorelight` | 白芷 · 法+90, heal up | ch11 | same | 萬象遊戲, 3rd win | Under the story's 燈心玉笛 (100) |

The four 萬象遊戲 weapons are earlier designs of the ch11 story weapons. The children of 萬象 ("myriad forms") hand
them over as "things from another story" (「別的故事裡的東西」), so they don't clash with 螢火・明 and 燈心玉笛.

### Not obtainable on purpose (`noSource` in data)

| Item | Why |
|---|---|
| 引魂槳 `key_oar` (items.js) | 陳伯 keeps his oar to the end: 引魂槳・渡 in ch10, the 王船 in ch11. Only the ch9 / ch10 debug standalone kits give it. |
| 燈芯將盡 `c7_flame_wick`, 心火 `c7_heart_fire` (ch7) | Hidden equipment slots (`equip.c7flame` / `equip.c7heart`, `C7.applyFlame`), never in the inventory. |

`noSource: '<reason>'` is documented in the `js/data/items.js` header and whitelisted in `tools/test/validate.js`
(fields the engine never reads).

### Missable

Everything follows its chapter's usual points of no return (`docs/qa/points_of_no_return.md`):

- ch9 items: until 「出航・往東」.
- 萬象遊戲 rematches: until the party steps onto the 燈座 in the 一息界.
- 陳伯's gift: until the 彼岸花原 dawn (`ch11_done`). It only needs the lantern count, not a quest.

## Balance

- No main-path chest or gift gives more than about +2 over the chapter's shop tier: 鯨骨劍 72 + 防4 against 鐵骨劍 70,
  and the ch9 chests already hold 巡海劍 78.
- Items above shop tier sit behind optional content:
  - ch5: 榕葉結 in the back yard.
  - ch7: 雲紋巾 and 清心玉珮 on the two wrong-way branches of the 雲霧林.
  - ch11: the 萬象遊戲 rematches, and 陳伯's gift at 14 心燈.
- In ch11, every placed item is at or below gear the chapter already hands out (赤霄槍, 太虛雷扇, 螢火・明, 燈心玉笛,
  鯤鱗甲, 萬象鈴).
- `node tools/sim_economy.js` prints exactly the same tables before and after (HEAD vs working tree). The new chest
  gear never beats what the model's players already wear, and no gold was added. The BALANCE.md economy tables stand.

## Verification

- `node tools/guide/build_guide.js --check-items`: **498 items · 0 unobtainable · 3 marked noSource**.
- An independent scan written for this pass gives the same three: it reuses the guide's shop / chest lists and adds
  its own give regexes and debug-block exclusion.
- `node tools/test/validate.js`: **0 errors**. The 15 warnings are the same as before; none are about the new chests.
- A separate placement check of all 20 new chests and crates, using the real `G.MapScene` collision:
  - every one is on walkable land, not on water;
  - every one can be opened from a reachable cell;
  - blocking the cell cuts off **0** other cells;
  - the ch7 procedural maps (`Grid.scatter`) keep identical decor.
- `node tools/test/unit.js`: **64 passed, 0 failed**.
- `node tools/i18n/extract.js`: every new line has English (`en_ch3/7/9/10/11.js`). The few untranslated strings
  left in those buckets were there before. All item names and descriptions already had English in `en_data.js`.
- `node tools/test/chapters/ch7.test.js`: 63/63. `node tools/test/chapters/ch3.test.js`: 4/4 sessions.
- A browser check of each new script: 海龍伯, the 照魂鏡, the chest `run` lines, both crates, 陳伯's gift and the
  three 萬象遊戲 wins (battle stubbed). Each gives its item exactly once, with no page errors.
- The guide is rebuilt (`node tools/guide/build_guide.js`). The 取得 column shows every new source.
- The hand-written chest tables in `docs/guide/chapters/ch03/05/07/08/09/10/11.md` list the new spots.
- Eight map images are re-shot so the chest numbers match (`tools/guide/shoot_maps.js … --force`): 觀音山道, 洛家古厝,
  雲霧林, 旗後, 王船廠, 龍坑, 蘭嶼・灘頭, 彼岸花原.
