# 第二章　霧林天燈

> 檔案：docs/story/ch2_mistforest.md　｜　`chapter 2`　｜　預估遊玩時間 3–4 小時
> 依據：docs/STORY_BIBLE.md（Ch2 beats、文化準確性指南、迷幻元素原則）、docs/WRITERS_GUIDE.md、docs/CONTRACTS.md。
> 前情：見 docs/story/ch1_jiufen.md。隊伍：星河（螢火）＋白芷。持有引魂令。
> 時間：**七月十五（中元）白天** 入霧林 → 當晚抵達平溪 → **七月十六** 虎姑婆 → 當晚放天燈 → **七月十七清晨** 十分瀑布，乘船沿基隆河往淡水。

**本章的心**：迷路與回家。魔神仔讓人迷路；靈視讓人看見真正的路；虎姑婆把孩子帶離家；天燈——平溪人最早的「平安燈」——把躲在山裡的人叫回家。而白芷寫下「我想知道我是誰」，星河卻偷偷希望她永遠不要想起來就離開。

---

## 0. 本章流程總覽

| # | 事件 | 地圖 | 主要旗標 |
|---|---|---|---|
| 2-1 | 霧林入口・有人在叫你的名字 | `mistforest_n` | `ch2_start` |
| 2-2 | 樵夫的兒子阿竹（心燈③開始） | `mistforest_n` | `q_woodcutter` |
| 2-3 | 魔神仔的迷陣（無解的循環 ×3） | `mist_loop` | `vars.loopCount` |
| 2-4 | 七彩的光在唱歌 | `mist_loop` | `ch2_grove_open` |
| 2-5 | **七彩靈蕈・第一次靈視**（迷幻演出） | `mist_grove` | `ch2_lingshi` |
| 2-6 | 銀色的腳印（解開迷陣） | `mist_loop` | `ch2_maze_solved` |
| 2-7 | 魔神仔的雞腿（救樵夫，可選） | `mistforest_s` | `ch2_woodcutter_found` |
| 2-8 | 紅纓：妖女，接招！（決鬥） | `mistforest_s` | `ch2_duel` |
| 2-9 | 背靠背（紅纓加入） | `mistforest_s` | `ch2_hongying_join` |
| 2-10 | 平溪之夜：敲鑼喊名字的山 | `pingxi` | `ch2_pingxi_arrive` |
| 2-11 | 客棧之夜：紅色的帶子 | `pingxi_inn` | `ch2_morning` |
| — | 平溪白天：支線、天燈舖、樵夫重逢、老夫婦 | `pingxi` 等 | 見第 4 節 |
| 2-12 | 竹林裡的樹上女孩（阿蘭的考驗） | `tiger_lair` | `ch2_alan_trust` |
| 2-13 | 山中老厝的阿婆 | `tiger_house` | `ch2_granny_house` |
| 2-14 | 虎姑婆的洞窟（籠中的孩子） | `tiger_den` | `ch2_cage1`, `ch2_cage2` |
| 2-15 | 頭目：虎姑婆 | `tiger_den` | `ch2_tiger_beaten` |
| 2-16 | **平安燈**（天燈由來・許願・放天燈） | `pingxi` | `ch2_tiandeng_night` |
| 2-17 | 翌晨：庄頭的謝禮 | `pingxi` | `ch2_dawn` |
| 2-18 | 十分瀑布・水跟光 | `shifen_falls` | — |
| 2-19 | 順著基隆河，往淡水 | `shifen_falls` | `ch2_done` |

**等級曲線目標**：入霧林 Lv5 → 紅纓決鬥 Lv6–7（紅纓以平均等級加入，最低 Lv6）→ 虎姑婆 Lv9–10 → 本章結束 Lv10（雲歸於第三章以 Lv11 加入）。

---

## 1. 地圖

> 地圖素描的圖例：`T` 密林（`tree_camphor`／`tree_fern`／`bamboo`／`tree_pine` 混合，實心）、`,` 林間空地 `grass_dark`、`=` 山徑 `path`、`~` 溪 `river`、`b` 原木橋 `bridge_h`、`$` 記錄點、`c` 寶箱、`s` 靈視才看得見的寶箱、`e` 遊蕩敵人、`I` 幻象物件（`illusion:true`，靈視時消失）。

### 1.1 `mistforest_n` — 霧林・北
- **用途**：本章第一個迷宮。九份南方的山林，樟樹、筆筒樹、蕨類與藤蔓，終年濃霧。
- **尺寸**：40 × 44。北口 (19–20, 0) ← `jiufen` 南口；南口 (19–20, 43) → `mist_loop` (11,1) 朝下。
- **光線**：ambient 0.35（白天，但霧很濃，偏青綠）；`fxOverride` 霧。**粒子**：`mist`（濃）、`leaves`、少量 `fireflies`（越往南越多）。**BGM**：`forest`。
- **時間**：七月十五，上午到午後。

```
     0         1         2         3
     0123456789012345678901234567890123456789
  0  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT   ← 北口：回九份
  1  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT
  2  TTTTTTTTTTTTTTTT,,,,,,,,,,TTTTTTTTTTTTTT   ← 登山口空地
  3  TTTTTTTTTTTTTTTT,,,,,,,F,,TTTTTTTTTTTTTT      F 山口的小土地公廟 shrine_small (23,3)
  4  TTTTTTTTTTTTTTTT,,,,,,$,,,TTTTTTTTTTTTTT      $ 記錄點 (22,4)
  5  TT,,,,,TTTTTTTTT,,,,,===============TTTT
  6  TT,,,,,TTTTTTTTT,,,,,===============TTTT
  7  TT,,,s,TTTTTTTTT,,,,,,,,,,TTTTTTTT==TTTT      s 靈視寶箱 (5,7)
  8  TT,,,,,TTT===========TTTTTTTTTT,,,,,,TTT
  9  TTTT==TTTT==========TTTTTTTTTTT,,,c,,TTT      c 寶箱 (34,9)
 10  TTTT========TTTTTTTTTTTTTTTTTTT,,,,,,TTT
 11  TTTT========TTTTTTTTTTTTTTTTTTT,,,,,,TTT
 12  TTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTT
 13  TTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTT
 14  TTTTTTTTTT==TTeTTTTTTTTTTTTTTTTTTTTTTTTT
 15  TTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTT
 16  TTTTTTeTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTT
 17  TTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTTTTTT
 18  TTTTTTTT,,,,,,,,TTTTTTTTTTTTeTTTTTTTTTTT   ← 阿竹的空地 (8–15, 18–23)
 19  TTTTTTTT,,,,,,,,TTTTTTTTTTTTTTTTTTTTTTTT
 20  TTTTTTTT,,,,A,,,TTTTTTTTTTTTTTTTTTTTTTTT      A 阿竹 (12,20)
 21  TTTTTTTT,,,,,,,,TTTTTTTTTTTTTTTTTTTTTTTT
 22  TTTTTTTT,,,,,,,,============TTTTTTTTTTTT
 23  TTTTTTTT,,,,,,,,============TTTTTTTTTTTT
 24  ~~~~~~~~~~bb~~~~~~~~~~~~~~bb~~~~~~~~~~~~   ← 山溪；兩座原木橋 (10–11) (26–27)
 25  ~~~~~~~~~~bb~~~~~~~~~~~~~~bb~~~~~~~~~~~~
 26  TTTTTTTTTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTT
 27  TTTTTTTTTTTTTTTTTTTTTTTTTT==TTT,,,,,,,TT   ← 東側空地 (31–37, 27–32)
 28  TTTTTTTTTTTTTTTTTTTTTTTTeT==TTT,,,,,,,TT
 29  TTTTTTTTTTTTTTTTTTTTTTTTTT==TTT,,,,,,,TT
 30  TTTTTTTTTTeTTTTTTTTTTTTTTT=====,,,g,,,TT      g 老獵人的魂（靈視才可見）(34,30)
 31  TTTTTTTTTTTTTTTTTTTTTTTTTT=====,,,,,,,TT
 32  TTTTTTTTTTTTTTTTTTT=========TTT,,,,,,,TT
 33  TTTTTTTTTTTTTTTTTTT========TTTTTTTTTTTTT
 34  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT
 ..  （x=19–20 的山徑一路向南）
 38  TTTTTTTTTTTTTTTTTTT=eTTTTTTTTTTTTTTTTTTT
 ..
 43  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT   ← 南口：魔神仔的迷陣
```
- **物件**：山口土地公廟 `shrine_small` (23,3)（調查：「山路口的小小土地公廟。供桌上有人放了一顆橘子，還很新鮮。」→ 星河(serious)：「土地公伯仔，借過。保佑我們平安過山。」——只有第一次）；`stone_lantern` 記錄點 (22,4)；溪上 `log` 橋；倒木 `log`、`stump`、`rock_big` 若干；樹上綁著的紅布條 `banner`（小，紅色）散在路旁（魔神仔的記號，調查：「樹枝上綁著一條褪色的紅布。打的結很奇怪，看了頭有點暈。」）。
- **遊蕩敵人**：(14,14) `t_mf_moshen2`；(6,16) `t_mf_snake`；(28,18) `t_mf_monkey`；(24,28) `t_mf_mush`；(10,30) `t_mf_boar`；(20,38) `t_mf_mix`。
- **靈視限定**：寶箱 (5,7)；老獵人的魂 (34,30)（見 2.1）。

### 1.2 `mist_loop` — 魔神仔的迷陣
- **用途**：循環迷陣。林中的圓形空地，正中央一棵老樟樹，樹枝上綁著一條紅布條（迷陣的「記號」）。四個出口通往四方，但走出去之後都會回到這片空地。
- **尺寸**：24 × 20。光線 ambient 0.45（霧更濃，光線像傍晚）。粒子 `mist`（濃）。BGM `forest`（迷陣中音高漸漸偏移——若無法實作，改為逐次降低音量）。

```
     0         1         2
     012345678901234567890123
  0  TTTTTTTTTTT==TTTTTTTTTTT   ← 北口（從 mistforest_n 進來）
  1  TTTTTTTTTTT==TTTTTTTTTTT
  2  TTTTTTTTTTT==TTTTTTTTTTT
  3  TTTTTTTTTTT==TTTTTTTTTTT
  4  TTTTT,,,,,,,,,,,,,,TTTTT
  5  TTTTT,,,,,,,,,,,,,,TTTTT
  6  TTTTT,,,,,,,,,,,,,,TTTTT
  7  TTTTT,,,,,,,,,,,,,,TTTTT
  8  TTTTT,,,,,,R,,,,,,,TTTTT   R 綁紅布的老樟樹 tree_camphor (11,8)
  9  =====,,,,,,,,,,,,,,=====   ← 西口 / 東口
 10  =====,,,,,,,,,,,,,,=====
 11  TTTTT,,,,,,,,,,,,,,TTTTT
 12  TTTTT,,,,,,,,,,,,,,TTTTT
 13  TTTTT,,,,,,,,,,,,,,TTTTT
 14  TTTTT,,,,,,,,,,,,,,TTTTT
 15  T????,,,,,,,,,,,,,,TTTTT   ? 西南的蕨叢 (1–4, 15–17)：2-4 後打開 → mist_grove
 16  T????TTTTTT==TTTTTTTTTTT
 17  T????TTTTTT==TTTTTTTTTTT
 18  TTTTTTTTTTT==TTTTTTTTTTT
 19  TTTTTTTTTTT==TTTTTTTTTTT   ← 南口
```
- **出口觸發**（touch 邊緣格）：北 (11–12, 0)、南 (11–12, 19)、西 (0, 9–10)、東 (23, 9–10)。迷陣機制見 5.3。
- 西南蕨叢 (1–4, 15–17)：`bush` ×3（`if: !ch2_grove_open` 時實心）；打開後 touch (1, 15–17) → `mist_grove` (28,14) 朝左。
- **靈視限定**：銀色腳印（`spirit:true` 的地面貼花物件，見 5.3）；紅布條在靈視中會看起來像一條吐信的紅舌頭（純視覺，`spirit` 物件疊在樹上）。
- 地圖敵人：無（迷陣本身就是敵人）。

### 1.3 `mist_grove` — 七彩靈蕈林
- **用途**：本章的視覺高潮與「靈視」的取得地。霧在林子邊緣像一堵牆一樣停住，牆內是發光的世界：苔蘚、蕈菇、小池塘、正中央一株撐在水上的巨蕈。安靜、溫柔、神聖。
- **尺寸**：30 × 24。地面 `moss_glow`；池塘 `lake`。
- **光線**：ambient 0.7（林冠很密，只有蕈菇與苔蘚的光）；大量 `mushroom_glow` 光源（七色輪替：紅、橙、黃、綠、藍、靛、紫）；`mushroom_giant` (14,10) 為主光源 r 300。
- **粒子**：`fireflies`（多）、`motes`（七彩，緩慢）、`spores`（若無則 `motes`）。
- **BGM**：`mushroom`。`psychedelic`：2-5 演出期間由腳本控制（0 → 1 → 0.35）；平常 0.15（一點點呼吸感，讓再訪也有味道）。

```
     0         1         2
     012345678901234567890123456789
  0  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  1  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  2  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  3  TTTggggggggggggggggggggggggTTT
  4  TTTgmggggmggggggggggmggggggTTT   m 發光蕈叢 mushroom_glow
  5  TTTggggggggggggggggggggggmgTTT
  6  TTTggghggggggggggggggggggggTTT   h 可採集的靈蕈 (6,6)
  7  TTTggggggggggggSgggggggggggTTT   S 清虛真人的石碑 (15,7)
  8  TTTgggggggggggggggggggghgggTTT   h (23,8)
  9  TTTgggggggggllllllgggggggggTTT
 10  TTTgggggggmgllMlllgggggggggTTT   M 巨蕈 mushroom_giant (14,10)，撐在池上
 11  TTTgggggggggllllllggmggggggTTT
 12  TTTgmgggggggllllllgggggggmgTTT
 13  TTTgggggggggllllllgggggggggTTT
 14  TTTggggggggggggggggggggggggggg   ← 東口 (29, 14–15) → mist_loop (3,15) 朝右
 15  TTTggggggggggggggggggggggggggg
 16  TTTggggggggggggggggggggggggTTT
 17  TTTggggggggggggggggggggggggTTT
 18  TTTggggghggggggggggmggggmggTTT   h (8,18)
 19  TTTggmggggggmggggggggggggggTTT
 20  TTTggggggggggggggggggggggggTTT
 21  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
 ..
```
- **物件**：石碑（新物件需求 `stele`，或 `signboard` 改繪成長青苔的石碑）(15,7)；`mushroom_glow` ×12；`mushroom_giant`；倒木 `log` 兩根（2-5 兩人坐的地方 (13,8)–(14,8)）；`vine_curtain` 掛在林緣。
- **採集點 h**（調查）：「一叢七彩靈蕈，一明一暗地呼吸著。」→ 獲得 **七彩靈蕈 ×1**。每次進入地圖，每個採集點可採 1 次（共 3）。
- **靈視限定 NPC**（`spirit:true`，純裝飾、會緩慢遊走）：光做的石虎 `cat`（改繪：淡金色半透明、帶斑點）、山羌、台灣藍鵲（`crow` 改繪：寶藍色、長尾）。調查它們：「光做的石虎。牠看了你一眼，鑽進苔蘚裡不見了。」／「光做的山羌，豎著耳朵聽你的呼吸。」／「一隻藍鵲拖著寶藍色的長尾巴，從你頭頂滑過去。」
- 地圖敵人：無（這裡是安全的地方）。

### 1.4 `mistforest_s` — 霧林・南
- **用途**：解開迷陣後的南段山林，往平溪。決鬥的空地、樵夫的幻林、山蘇採集點。
- **尺寸**：40 × 44。北口 (19–20, 0) ← `mist_loop`；南口 (19–20, 43) → `pingxi` (23,1) 朝下。
- **光線**：2-8 前 ambient 0.4（午後）；2-8 起 0.5（黃昏，暖色斜光）；粒子 `mist`、`fireflies`、`leaves`。BGM `forest`。

```
     0         1         2         3
     0123456789012345678901234567890123456789
  0  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT   ← 北口
  1  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT
  2  TTTTTTTTTTTTTTTTTT$==TTTTTTTTTTTTTTTTTTT   $ 記錄點 (18,2)
  3  TTTTTTTTTTTTTTTTTTT==TTTTTTTTT,,,,,,,,TT   ← 樵夫的幻林 (30–37, 3–9)
  4  TTTTTTTTTTTTTTTTTTT==TTTTTTTTT,,,,,,,,TT
  5  TTTTTTTTTTTTTTTTTTT==TTTTTTTII,,,,,W,,TT   W 阿山（樵夫）(35,5)，坐在大樟樹的樹枝上
  6  TTTTTTTTTTTTTTTTTTT=========II,,,,,,,,TT   II 幻象樹 (28–29, 5–7)（illusion:true）
  7  TTTTTTTTTTTTTTTTTTT=========II,,,,,,,,TT
  8  TTTTTTTTTTTTTTTTTTT==TTTTTTTTT,,,,,,,,TT
  9  TTTTTTTTTTTTTTTTTTT==TTTTTTTTT,,,,,,,,TT
 10  TTTTTTTTTTTTTT=======TTTTTTTTTTTTTTTTTTT
 11  TTTTTTTTTTTTTT======TTTTTTTTTTTTTTTTTTTT
 12  TTTTTTTTTcTTTT==TTTTTTTTTTTTTTTTTTTTTTTT   c 寶箱 (9,12)（從 (14,12) 鑽進樹叢的小縫）
 13  TTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTTTTTTT
 14  TTTTTTTTTTTTTT==TTTeTTTTTTTTTTTTTTTTTTTT
 ..
 19  TTTTTTTTTTTTTT,,,,,,,,,,,,TTTTTTTTTTTTTT   ← 決鬥的空地 (14–25, 19–27)
 20  TTTTTTTTTTTTTT,,,,,,,,,,,,TTTTTTTTTTTTTT
 21  TTTTTTTTTTTTTT,,,,,,,,,,,,TTTTTTTTTTTTTT
 22  TTTTTTTTTTTTTT,,,,,,,,,,,,TTTTTTTTTTTTTT
 23  TTTTTTTTTTTTTT,,,,,,H,,,,,TTTTTTTTTTTTTT   H 紅纓 (20,23)
 24  TTTTTTTTTTTTTT,,,,,,,,,,========TTTTTTTT
 25  TTTTTTTTTTTTTT,,,,,,,,,,========TTTTTTTT
 26  TTTTT===e======,,,,,,,,,,,TTTT==TTTTTTTT
 27  TTTTT==========,,,,,,,,,,,TTTT==TTTTTTTT
 ..
 30  TT,,,,,,TTTTTTTTTTTTTTTTTTTeTT==TTTTTTTT   ← 山蘇坡 (2–7, 30–33)
 31  TT,,,,,,TTTTTTTTTTTTTTTTTTTTTT==TTTTTTTT
 32  TT,,h,,,TTTTTTTTeTTTTTTTTTTTTT==TTTTTTTT   h 山蘇採集點 (4,32)
 33  TT,,,,,,TTTTTTTTTTTTTTTTTTTTTT==TTTTTTTT
 34  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT=======TTT
 35  TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT=======TTT
 36  TTTTTTTTTTTTTTTTTTT=============TTT==TTT
 37  TTTTTTTTTTTTTTTTTTT============TTTT==TTT
 38  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTs=TTT   s 靈視寶箱 (35,38)
 39  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT
 40  TTTTTTTTTTTTTTTTTTT==TTTeTcTTTTTTTTTTTTT   c 寶箱 (26,40)
 ..
 43  TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT   ← 南口：往平溪
```
- **幻象樹**：(28,5)(28,6)(28,7)(29,5)(29,6)(29,7) 各一棵 `tree_camphor`，`illusion:true`。沒有靈視時看起來就是密林（調查：「樹長得好密……可是有一點奇怪，這幾棵樹的影子，方向跟別的樹不一樣。」）。
- **遊蕩敵人**：(19,14) `t_mf_moshen3`；(30,18) `t_mf_boar`；(8,26) `t_mf_snake`；(27,30) `t_mf_mush`；(16,32) `t_mf_monkey`；(24,40) `t_mf_mix`。2-9 後追加 (20,22) `t_mf_moshen2`。
- **山蘇採集點** (4,32)：調查「一叢山蘇，葉子像鳥巢一樣捲在一起。嫩芽可以吃。」→ `q_hy_kitchen` 進行中才可採：獲得 **山蘇**。

### 1.5 `pingxi` — 平溪
- **用途**：本章的城鎮。基隆河上游的山谷小庄：木造與石砌的房子沿著河岸，後山是竹林與梯田，田裡種著稻子與大菁（染布的藍草）。人人都會紮天燈。
- **尺寸**：48 × 40。基隆河由西向東橫過 y=26–28。
- **出口**：北口 (22–24, 0) ← `mistforest_s`；東北竹林小徑 (47, 12–13) → `tiger_lair` (1,30) 朝右（`ch2_morning` 前擋住：搜山的人「夜裡山上看不到路，天光再去！」）；東南田間小路 (47, 33–34) → `shifen_falls` (1,13) 朝右（`ch2_tiandeng_night` 前擋住：星河「十分瀑布……等孩子們找到再說。」）。
- **時段**：

| 代號 | 條件 | ambient | 粒子 | BGM |
|---|---|---|---|---|
| **Q1 抵達之夜** | `ch2_pingxi_arrive && !ch2_morning` | 0.75（山上有移動的火把光點，`drawOver`） | `mist` | `night` |
| **Q2 白天** | `ch2_morning && !ch2_tiger_beaten` | 0.05 | `mist`（薄）、`leaves` | `pingxi`（音量 0.8） |
| **Q3 天燈之夜** | 2-16 腳本中 | 0.65 | `sky_lantern` 大量、`embers` | `pingxi` → `love` |
| **Q4 翌晨** | `ch2_tiandeng_night` | 0.0（晴，清晨的金光） | `motes` | `pingxi` |

```
     0         1         2         3         4
     012345678901234567890123456789012345678901234567
  0  ......................===.......................   ← 北口：霧林
  1  ......................===...............bbbbbbb.   b 竹林（bamboo）
  2  ......................===...............bbbbbbb.
  3  ................hhhhh.===.FF............bbbbbbb.   h 庄頭厝 house_minnan (16,3)；F 土地公廟 shrine_small (26,3)
  4  ................hhhhh.===.FF............bbbbbbb.
  5  ................hhhhh.===...............bbbxbbb.   x 竹筍採集點 (43,5)
  6  ......................===...............bbbbbbb.
  7  ......................===...............bbbbbbb.
  8  ......................===...............bbbbbbb.
  9  ........KKKKK.........===.....QQQQ..ZZZZ........   K 吳家天燈舖 house_minnan (8,9) 門 k(10,11)
 10  ........KKKKK.........===.....QQQQ..ZZZZ........   Q 十分客棧 shophouse (30,9) 門 q(31,11)
 11  ........KKkKK.........===.....QqQQ..ZzZZ........   Z 阿貴商號 shophouse (36,9) 門 z(37,11)
 12  ......................===...................====   ← 東北口：往虎姑婆的竹林
 13  ......................===...................====
 14  ..############################################..   ← 庄仔街 (2–45, 14–15)
 15  ..############################################..
 16  ......................##$.......................   $ 記錄點 (24,16)
 17  ...OOOO...........###########...........WWWW....   O 周家（老夫婦）house_jiufen (3,17) 門 o(4,19)
 18  ...OOOO...........###########...........WWWW....   W 樵夫阿山家 house_jiufen (40,17)（不可進入）
 19  ...OoOO...........###########...........WwWW....   ← 廟埕廣場 (18–28, 17–23)
 20  ...........IIIII..#####L#####...................   L 天燈架 (23,20)；I 阿藍姐的染坊 (11–15, 20–22)
 21  ...........IIIII..###########...................
 22  ...........IIIII..###########...................
 23  ..................###########...................
 24  ....................==................==........
 25  ........v...........==................==........   v 抓溪蝦的地方 (8,25)
 26  rrrrrrrrrrrrrrrrrrrrBBrrrrrrrrrrrrrrrrBBrrrrrrrr   ← 基隆河；兩座木橋 (20–21)(38–39)
 27  rrrrrrrrrrrrrrrrrrrrBBrrrrrrrrrrrrrrrrBBrrrrrrrr
 28  rrrrrrrrrrrrrrrrrrrrBBrrrrrrrrrrrrrrrrBBrrrrrrrr
 29  ffffffffffffffffffff==ffffffffffffffffffffffffff   ← 南岸：梯田（farmland）與大菁田
 30  ffffffffffffffffffff==ffffffffffffffffffffffffff
 31  ffffffhhhhffffffffff==ffffffffffffffffffffffffff
 32  ffffffhhhhffffffffff==ffffffffffffffffffffffffff
 33  ffffffhhhhffffffffff============================   ← 往十分的田間小路 → 東南口 (47,33–34)
 34  ffffffffffffffffffff============================
 35  ffffffffffffffffffff==ffffffffffffffffffffffffff
 36  ffffffffffffffffffff==ffffffhhhhffffffffffffffff
 37  ffffffffffffffffffff==ffffffhhhhffffffffffffffff
 38  ffffffffffffffffffff==ffffffhhhhffffffffffffffff
 39  ffffffffffffffffffff==ffffffffffffffffffffffffff
```
- **物件**：
  - 天燈架 (23,20)：竹架上掛滿未點的天燈（`lantern_rack` 改繪成白色天燈；Q3 時移除）。調查（Q2）：「竹架上掛著幾十盞天燈，白白的棉紙，竹篾紮的圓口。燈上還沒寫字。」
  - 周家門口的燈 `red_lantern` (6,19)：Q1、Q2 夜晚點亮。調查：「門口掛著一盞小燈籠。燈籠上寫著一個字：『興』。」
  - 染坊：`drying_rack` ×3（掛著深藍色的布，用 `laundry` 改色亦可）、大染缸 `jar` ×4（調查：「缸裡是深得發黑的藍色染液，聞起來有一點酸。」）
  - 河邊 `reeds`、`rock_small`；竹林 `bamboo`；田裡 `tallgrass`（大菁）；`tree_banana`、`tree_betel` 點綴。
  - 土地公廟 (26,3)：調查（Q2）「平溪的土地公廟。香爐裡插滿了香——這三天，全庄的人都來這裡求過。」
- **遊蕩敵人**：無。
- **室內**：見 1.6–1.9。

### 1.6 `pingxi_inn` — 十分客棧
- 16 × 12；`wood`。櫃檯 `counter` (3,3) w4，月娘在 (5,2)；灶腳（`stove` (12,2)、`pot` (13,2)）在東北角（紅纓的廚房支線用）；客房以 `screen` 隔出兩間：西南 (1–6, 7–10)（星河）、東南 (9–14, 7–10)（白芷與紅纓），各有 `bed` ×1–2。門 (8,11) → `pingxi` (31,12)。
- 休息：與月娘對話 → 住宿 30 文（2-10 當晚免費）。

### 1.7 `pingxi_tiandeng` — 吳家天燈舖
- 14 × 10；`wood`。到處掛著做到一半的天燈與竹篾；工作檯 `table` (5,4) w3，吳阿公坐在 (6,3)；一疊疊棉紙、金紙、一甕油（`jar`）。門 (7,9) → `pingxi` (10,12)。
- 調查棉紙：「很薄的棉紙，對著光看，可以看到裡面的纖維。」調查金紙：「一疊金紙。吳阿公說，天燈底下的燃料，就是沾了油的金紙。」

### 1.8 `pingxi_oldhouse` — 周家
- 12 × 9。北牆神桌 `altar`；餐桌 (4,4)；窗邊一張竹椅，周老伯常坐在那裡看著山路；牆上掛一頂舊斗笠。門 (6,8) → `pingxi` (4,20)。
- 調查斗笠：「一頂舊得發黑的斗笠，邊緣都破了。」

### 1.9 `pingxi_store` — 阿貴商號
- 14 × 10。櫃檯 (4,3) w6，阿貴在 (7,2)；左半邊雜貨（`barrel`、`basket`、`jar`），右半邊掛著竹甲、柴刀、獵叉（`shelf`）。門 (7,9) → `pingxi` (37,12)。

### 1.10 `tiger_lair` — 虎姑婆的竹林
- **用途**：通往虎姑婆巢穴的山坡竹林。中段是阿蘭躲藏的大樟樹，山坡頂上是一間荒廢的老厝。
- **尺寸**：40 × 40。`b` = 密竹林（`bamboo`，實心）；`:` 老厝前的泥土埕 `dirt`。
- **光線**：ambient 0.3（竹林遮天，綠色的光）；到老厝時 0.45。粒子 `leaves`（竹葉）、`mist`（薄）。BGM `forest`；靠近老厝改 `tension`。
- **時間**：七月十六，午後 → 黃昏。

```
     0         1         2         3
     0123456789012345678901234567890123456789
  0  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  1  bbbbbbbbbbbbbbbbbbbbbbbbIIIbbbbbbbbbbbbb   III 遮住洞口的竹叢 (24–26, 1–3)（2-13 後消失）→ 洞口 (25,1) → tiger_den (15,30)
  2  bbbbbbbbbbbbbbbbbbbbbbbbIIIbbbbbbbbbbbbb
  3  bbbbbbbbbbbbbbbbbbbbbbbbIIIbbbbbbbbbbbbb
  4  bbbbbbbbbbbbbbbbbb::::::::::::bbbbbbbbbb   ← 老厝的埕 (18–29, 4–11)
  5  bbbbbbbbbbbbbbbbbb::::HHHHH:::bbbbbbbbbb   H 山中老厝 house_minnan (22,5)，門 d (24,7) → tiger_house (6,8)
  6  bbbbbbbbbbbbbbbbbb::::HHHHH:::bbbbbbbbbb
  7  bbbbbbbbbbbbbbbbbb::::HHdHH:::bbbbbbbbbb
  8  bbbbbbbbbbbbbbbbbb::::::::::::bbbbbbbbbb
  9  bbbbbbbbbbbbbbbbbb::::::::::::bbbbbbbbbb
 10  bbbbbbbbbbbbbbbbeb::::::::::::bbbbbbbbbb
 11  bbbbbbbbbbbbbbbbbb::::::::::::bbbbbbbbbb
 12  bbbbbbbbbbbbbbbbbbbbbb==bbbbbbbbbbbbbbbb
 13  bbbbbbbbbbbbbbbbbbbbbb==bbbbbbbbbbbbbbbb
 14  bbbbbbbbbbbb======e=====bbbbbbbbbbbbbbbb
 15  bbbbbbbbb,,,,,,========bbbbbbbbbbbbbbbbb   ← 大樟樹空地 (9–14, 15–19)
 16  bbbbbbbbb,,A,,,bbbbbbbbbbbbbbbbbbbbbbbbb   A 阿蘭躲的大樟樹 tree_camphor (11,16)
 17  bbbbbbbbb,,,,,,bbbbbbbbbbbbbbbbbbbbbbbbb
 18  bbbbbbbbb,,,,,,bbbbbbbbbbbbbbbbbbbbbbbbb
 19  bbbbbbbbb,,,,,,bbbbbbbbbbbbbbbbbbbbbbbbb
 20  bbbbbbbbbbbb==bbbbbbbbbbbbbbbbbbbbbbbbbb
 ..
 24  bbbbbbbbbbbb========e===========bbbbbbbb
 25  bbbbbbbbbbbb====================bbbbbbbb
 ..
 30  ======e=======bbbbbbbbbbbbbbbb==bbbbbbbb   ← 西口 (0,30–31) ← pingxi
 31  ========$====bbbbbbbbbbbbbbbbb==bbbbbbbb   $ 記錄點 (8,31)
 32  bbbb==bbbbbbbbbbbbbbbbbbbbb,,,,,,,,bbbbb   ← 竹筍坡 (27–34, 32–36)
 33  bbbb==bbbbbbbbbbbbbbbbbbbbb,,,,,,c,bbbbb   c 寶箱 (33,33)
 34  bbbb==bbbbbbbbbbbbbbbbbbbbb,,,,,,,,bbbbb
 35  bbbb==bbbbbbbbbbbbbbbbbbbbb,,,,x,,,bbbbb   x 竹筍採集點 (31,35)
 36  bbbb==bbbbbbbbbbbbbbbbbbbbb,,,,,,,,bbbbb
 37  bbbbcbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb   c 寶箱 (4,37)
 ..
```
- **遊蕩敵人**：(6,30) `t_lair_bamboo`；(12,22) `t_lair_mix`；(18,14) `t_lair_monkey`；(20,24) `t_lair_bamboo`；(30,28) `t_lair_mix`；(16,10) `t_lair_boar`。
- **物件**：老虎腳印（地面貼花，沿 y=24–30 的路，調查：「好大的腳印……比人的手掌還大。」）；散落的小鞋子一隻（(13,24)，調查：「一隻小孩的布鞋，鞋面繡著一朵小花。」→ 星河(serious)：「……是被拖過去的。」）；老厝前的埕上有一口井 `well` (20,9) 與曬衣竿。

### 1.11 `tiger_house` — 山中老厝（內）
- 14 × 10；`wood`。灶 `stove` (2,1)、上面一口大鍋 `pot` (3,1)（在冒煙：一鍋熱油）；老婦人（虎姑婆偽裝，sprite `old_f`，`fixedDir`）坐在 (6,3) 的竹椅上，膝上蓋花布；桌 (8,4)；後門 (12,1)（2-13 後打破）。角落一堆小鞋子 `basket`。門 (6,9) → `tiger_lair` (24,8)。
- 光線：ambient 0.6，只有灶火。BGM：無音樂，只有柴火聲與「咔滋咔滋」的咀嚼聲。

### 1.12 `tiger_den` — 虎姑婆的洞窟
- **用途**：本章最後的迷宮。山腹裡的洞窟，堆滿虎姑婆搶來的東西。兩個竹籠關著孩子；最深處是頭目間，最小的阿弟仔被關在那裡。
- **尺寸**：32 × 32；`cave`／`cave_wall`。光線 ambient 0.85；洞裡有幾處虎姑婆點的油燈（`brazier`）。粒子 `motes`、`mist`（低）。BGM `mine`（低沉）→ 頭目間 `tension`。

```
     0         1         2         3
     01234567890123456789012345678901
  0  CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC
  1  CCCCCCCCCCvvvvvvvvvvvvvCCCCCCCCC   ← 頭目間 (10–22, 1–10)
  2  CCCCCCCCCCvvvvvv3vvvvvvCCCCCCCCC   3 阿弟仔的竹籠 (16,2)
  3  CCvvvvvvCCvvvvvvvvvvvvvCCCCCCCCC   ← 挑夫擔子的小室 (2–7, 3–6)
  4  CCvPvvcvCCvvvvvvvvvvvvvCCCCCCCCC   P 挑夫的擔子 (3,4)；c 寶箱 (6,4)
  5  CCvvvvvvCCvvvvvvvvvvvvvCCCCCCCCC
  6  CCvvvvvvCCvvvvvvTvvvvvvCCCCCCCCC   T 虎姑婆 (16,6)
  7  CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC
  8  CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC
  9  CCCCCevCCCvvvvvvvvvvvvvCCCCCCCCC
 10  CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC
 11  CCCCCvvCCCCCCCGGGGCCCCCCCCCCCCCC   GGGG 竹柵門 (14–17, 11)（兩個竹籠都打開後才開）
 12  CCCCCvvCCCCCCCvvvvCCCCCCCCCCCCCC
 13  CCCCCvvCCCCCCCvvvvCCCCCCCCCCCCCC
 14  CCvvvvvvCCCCCCvevvCCCCCCCCCCCCCC
 15  CCvvvvvvCCCCCCvvvvCCCCvvvvvvvvCC   ← 東室 (22–29, 15–22)
 16  CCvvvvvvvvvvvvvvvvCCCCvvvvvvvvCC
 17  CCvvvvvvvvvvvvvvvvCCCCvvvvvvvvCC
 18  CCvvvvvvvvvvvvvvvvIIIIvvvvv2vvCC   IIII 幻牆 (18–21, 18–19)（illusion:true）；2 石頭的竹籠 (27,18)
 19  CCvv1vvvCCCCCCvvvvIIIIvvvvvvvvCC   1 小春的竹籠 (4,19)
 20  CCvvvevvCCCCCCvevvCCCCvvvevvvvCC
 21  CCvvvvvvCCCCCCvvvvCCCCvvvvvvcvCC   c 寶箱 (28,21)
 22  CCvvvvvvCCCCCCvvvvCCCCvvvvvvvvCC   ← 西室 (2–7, 14–22)
 23  CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC
 ..
 27  CCCCCCCCCCCCCCvv$vCCCCCCCCCCCCCC   $ 記錄點 (16,27)
 ..
 31  CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC   ← 入口 (14–17, 31) → tiger_lair (25,2)
```
- **幻牆**：(18–21, 18–19) 放 4 個 `rock_big`（2x2）＝ `illusion:true`。沒有靈視時是死路（調查：「岩壁。……可是摸起來，有一點溫溫的，好像在呼吸。」→ 白芷(think)：「這面牆在呼吸。牆，應該不會呼吸吧？」——第一次）。
- **遊蕩敵人**：(15,20) `t_den_boar`；(5,20) `t_den_monkey`；(25,20) `t_den_mix`；(5,9) `t_den_monkey`；(15,14) `t_den_boar`。
- **物件**：堆積的贓物（`crate`、`basket`、`bones`——只放雞骨、豬骨）；竹籠 `crate` 改繪（或 `fence_bamboo` 圍成）；`brazier` ×4 在主通道兩側；`vine_curtain` 擋在頭目間前（=竹柵門）。

### 1.13 `shifen_falls` — 十分瀑布
- **用途**：本章最後的告別風景。基隆河在這裡從岩壁上一躍而下，像一片白色的簾子；水霧裡掛著彩虹。瀑布下游有一座小碼頭，船伕阿河在那裡等。
- **尺寸**：32 × 28。北側懸崖 `cliff` 上有一排 `cliff_waterfall`（x=11–20，2x3 一組，共 5 組）；潭 `lake`；河 `river` 往南再往東。
- **光線**：ambient 0（清晨的陽光）；`lights` 彩虹（`drawOver` 在 (10–20, 4–9) 的水霧上畫一道淡彩虹，隨時間微微閃爍）。粒子 `mist`（水霧，靠近瀑布最濃）、`motes`。BGM `pingxi`（水聲作為環境音）。

```
     0         1         2         3
     01234567890123456789012345678901
  0  XXXXXXXXXXXWWWWWWWWWWXXXXXXXXXXX   W 十分瀑布（cliff_waterfall ×5）
  1  XXXXXXXXXXXWWWWWWWWWWXXXXXXXXXXX
  2  XXXXXXXXXXXWWWWWWWWWWXXXXXXXXXXX
  3  .........llllllllllllll.........   ← 瀑布潭
  4  .........llllllllllllll.........
  5  ........Rllllllllllllll.........   R 大石頭 rock_big
  6  .........llllllllllllll.R.......
  7  .........llllllllllllll.........
  8  .....R...llllllllllllll.........
  9  .........llllllllllllll....R....
 10  ..............rrrr..............
 11  ............*.rrrr..............   * 看瀑布的大石頭 (12,11)（2-18 星河與白芷坐的地方）
 12  ..............rrrr..............
 13  ======$=======BBBB======........   ← 西口 (0,13–14) ← pingxi；$ 記錄點 (6,13)；BBBB 木橋
 14  ==============BBBB======........
 15  ..............rrrr.....==.......
 16  ..............rrrr.....==.......
 17  ..............rrrr.....==.......
 18  ..............rrrrrrrrrrkkkkrrrr   ← 碼頭 kkkk（dock）(24–27, 18–22)
 19  ..............rrrrrrrrrrkkkkrrrr      阿河的船 boat_ferry (28,19)（在水上）
 20  ..............rrrrrrrrrrkkkkrrrr
 21  ..............rrrrrrrrrrkkkkrrrr
 22  .......................kkkkkk...
 ..
```
- **出口**：西口 (0, 13–14) → `pingxi` (46,33) 朝左；搭船 → 第三章（`ch2_done`）。

---

## 2. NPC

### 2.1 霧林

#### `azhu_wood` — 阿竹（`child_m`）— 樵夫阿山的兒子，十四歲
- 位置：`mistforest_n` (12,20)，手上提著一面銅鑼。2-2 為腳本。之後：
  - `q_woodcutter` 進行中：阿竹(sad)：「阿爸的柴刀，柄上綁著一條藍布。看到了，就是他。」
  - 2-2 之後他就回平溪了（`mistforest_n` 不再出現；見 2.2）。

#### `hunter_ghost` — 老獵人的魂（`ghost_m`，`spirit:true`）
- 位置：`mistforest_n` (34,30)，靠著一棵大樟樹坐著，膝上橫著一把老舊的獵叉。只有靈視時看得見。
- 初次：
  1. 老獵人的魂(normal)：「……喔？看得到我？」
  2. [他看到星河腰間的引魂令，眼神變了。]
  3. 老獵人的魂(surprise)：「引魂令……好幾十年沒見過了。你是引魂人的徒弟？」
  4. 星河(think)：「呃……算是吧？」
  5. 老獵人的魂(serious)：「那你聽好。這片山，以前沒有這麼吵。」
  6. 老獵人的魂(serious)：「魔神仔變多了，山豬變兇了，連老虎精都跑出來擄囝仔。」
  7. 老獵人的魂(think)：「我在這座山走了六十年。山會吵，是因為……」
  8. 老獵人的魂(serious)：「海那邊的光，變弱了。死掉的東西走不了，就只好留在山裡。」
  9. 白芷(sad)：「……」
  10. 老獵人的魂(smile)：「我也是走不了的那一個。不過沒關係，我習慣了。」
  11. 老獵人的魂(normal)：「那邊那棵倒下的老樹下面，我藏了一些東西。拿去用吧。」
  12. → 東側空地 (36,32) 出現靈視寶箱（見 5.2）。`flag: ch2_hunter_ghost`
- 再次：老獵人的魂(smile)：「等海那邊亮起來，我就走。你們……要讓它亮起來啊。」

#### `ashan` — 阿山（`woodcutter`）— 被魔神仔牽走的樵夫
見 2-7（`mistforest_s` (35,5)）。救出後成為臨時隨從，直到平溪北口（自動消失，回家）。

### 2.2 平溪 `pingxi`
時段代號 Q1–Q4 見 1.5。

#### `lizhuang` — 李庄頭（`old_m`）
位置：Q1 北口附近 (23,6)（2-10 腳本）→ 之後廟埕 (22,18)。
- **Q1**：李庄頭(normal)：「先去客棧歇著。天光了，我們再上山。」
- **Q2**：
  - 李庄頭(serious)：「搜山的人說，東北邊的竹林裡，老虎腳印最多。」
  - 李庄頭(serious)：「那片竹林頂上，有一間荒廢幾十年的老厝。以前住過一個老阿婆……」
  - 李庄頭(think)：「她死了以後，就沒人住了。……應該是沒人住了。」
- **Q4**：見 2-17；之後：李庄頭(smile)：「平溪人不會忘記你們的。以後元宵，我們多放三盞燈。」

#### `wu` — 吳阿公（`old_m`）— 吳家天燈舖
位置：`pingxi_tiandeng` (6,3)；Q3 在廟埕天燈架旁 (23,21)。
- **Q1**（天燈舖燈亮著）：吳阿公(serious)：「囝仔還沒回來。我一盞一盞紮，紮到他們回來為止。」
- **Q2** 初次：
  1. 吳阿公(normal)：「囝仔還沒找到，我先紮燈。找到了，馬上就放。」
  2. 吳阿公(think)：「少年仔，你這雙手……做過燈？」
  3. 星河(smile)：「九份陳記燈籠舖的學徒！」
  4. 吳阿公(laugh)：「陳記！陳渡那個老古板的店？好，來幫我紮一盞！」
  5. → 小遊戲「紮天燈」（見 5.4）。
  6. 白芷(think)：「天燈為什麼會飛？」
  7. 吳阿公(normal)：「燈底下的火一燒，燈裡的空氣就變熱、變輕，燈就浮起來了。」
  8. 白芷(think)：「……就像人心裡有了火，也會變輕嗎？」
  9. 吳阿公(surprise)：「……」
  10. 吳阿公(laugh)：「這個姑娘，講話比我還像說書的！」
  11. 星河(think)：「阿公，天燈是怎麼來的？」
  12. 吳阿公(serious)：「等找到囝仔，我放燈的時候再講。現在講，不吉利。」
- **Q2** 再次：吳阿公(normal)：「天燈的紙要選棉紙，薄、韌，火烤不會一下就破。」
- **Q4**：吳阿公(smile)：「你們要去淡水？那邊的人也放燈嗎？……不管放不放，記得平溪的燈。」→ 商店 `shop_pingxi_tiandeng`

#### `zhou_bo` & `zhou_shen` — 周老伯（`old_m`）、周老嬸（`old_f`）
- **Q1** — 自家門口 (5,20)(6,20)。周老嬸踮著腳，把門口的小燈籠點亮。
  - 周老嬸(normal)：「……阿興，燈點好了。」
  - 星河(think)：「阿嬸，這盞燈是……？」
  - 周老伯(normal)：「給我們兒子的。天黑了，怕他回家看不到路。」
  - 周老伯(smile)：「少年仔，夜深了，快去歇吧。」
- **Q2** — `pingxi_oldhouse` 內。支線「寄到了的信」開始（見 4.2）。
- **Q4** — 心燈④完成後：
  - 周老嬸(smile)：「昨暝，我夢到阿興了。他在船上，笑得跟小時候一樣。」
  - 周老伯(smile)：「今暝開始，門口那盞燈……我們就不點了。」
  - 周老伯(sad)：「不是忘了他。是讓他，不用再惦記著回家的路。」
- **Q4** — 未完成：周老嬸(sad)：「阿興的信，不知道寄到哪裡去了……」

#### `ashan_sao` — 阿山嫂（`villager_f`）
位置：樵夫家門口 (42,20)。
- **Q1**：阿山嫂(cry)：「我尪……三天了……庄裡的人都去找囝仔，沒人能找他……」
- **Q2**（`q_woodcutter` 未完成）：
  - 阿山嫂(sad)：「阿竹說在霧林碰到你們。」
  - 阿山嫂(serious)：「老人講，被魔神仔牽去的人，要敲鑼、大聲叫他的名字，才叫得回來。」
  - 阿山嫂(cry)：「拜託……我尪叫阿山。」
- **Q2/Q4**（完成後）：阿山嫂(smile)：「他回來到現在，睡了一天一夜，起來就喊肚子餓。」→ 阿山嫂(laugh)：「說再也不要吃雞腿了。」

#### `azhu_home` — 阿竹（`child_m`）
位置：樵夫家門口 (43,20)（2-2 之後）。
- **Q1/Q2**（未完成）：阿竹(serious)：「天亮我還要再進去找。阿爸一定還在林子裡。」
- 完成後：阿竹(smile)：「那面銅鑼你們留著！就當作……謝禮。雖然很吵。」

#### `achun` — 阿春嬸（`villager_f2`）— 阿蘭與阿弟仔的阿母
位置：廟埕 (20,22)。
- **Q1**：阿春嬸(cry)：「阿蘭……阿弟仔……兩個都被帶走了……」→ 阿春嬸(cry)：「那天半夜，我聽到有人敲門，說是姑婆……我、我還以為是夢……」
- **Q2**：阿春嬸(sad)：「阿蘭最勇敢了，從小聽阿嬤講虎姑婆的故事，一點都不怕。」→ 阿春嬸(cry)：「可是阿弟仔才五歲……」
- **Q4**：阿春嬸(smile)：「阿蘭說，她是用阿嬤故事裡的辦法打虎姑婆的。」→ 阿春嬸(laugh)：「這個囝仔，以後誰娶得起喔！」

#### `ashi` — 阿石伯（`hunter`）— 石頭的阿爸
位置：東北口 (44,13)，揹著獵叉。
- **Q1**：阿石伯(angry)：「天一亮我就上去！就算是虎王，我也要把我兒子搶回來！」
- **Q2**：阿石伯(serious)：「洛姑娘說你們跟她一起去？……好。」→ 阿石伯(serious)：「竹林裡的路，順著老虎腳印走。看到青竹絲，莫踩。」
- **Q4**：阿石伯(cry)：「石頭……石頭跟我說，是你們打開竹籠的。」→ 阿石伯(serious)：「我是粗人，不會講話。這些拿去。」→ 獲得 **金創藥 ×3**（`ch2_ashi_gift`，一次）

#### `xiaochun_ama` — 小春的阿嬤（`old_f`）
位置：廟埕 (26,22)，手持三支香，朝著山的方向拜。
- **Q1/Q2**：小春的阿嬤(sad)：「山神、土地公、天公伯……保佑我們小春……」
- **Q4**：小春的阿嬤(smile)：「我昨暝去土地公廟還願了。」→ 小春的阿嬤(smile)：「這些紅龜粿，本來是要拜拜的，你們帶著路上吃。」→ 獲得 **紅龜粿 ×3**（`ch2_ama_gift`，一次）

#### `yueniang` — 月娘（`shopkeeper_f`）— 十分客棧老闆娘
位置：`pingxi_inn` (5,2)。→ 住宿 30 文；商店 `shop_pingxi_inn`。
- **Q1**：見 2-10（免費住一晚）。
- **Q2**：月娘(smile)：「三位恩人，今天也要上山嗎？吃飽再去，空肚子打不贏老虎。」→ 住宿／商店
- **Q4**：月娘(smile)：「昨暝的天燈，是我活到現在看過最多的一次。」→（若 `ch2_bundle_returned`）月娘(cry)：「阿全幫我帶來一封信……我妹妹生了！是個胖小子！」→ 住宿／商店

#### `agui` — 阿貴（`merchant`）— 阿貴商號
位置：`pingxi_store` (7,2)。→ 商店 `shop_pingxi_store`、`shop_pingxi_arms`（選項：「雜貨」/「武具」）
- **Q2**：阿貴(smile)：「上山打老虎？要帶什麼？竹甲、綁腿、金創藥，攏有！」→ 阿貴(serious)：「青竹絲咬到要趕快吃解毒草，不然腳會腫得像芋頭。」
- **Q4**：阿貴(smile)：「虎姑婆死了，庄裡又可以安心買東西了！」→（若 `ch2_bundle_returned`）阿貴(sad)：「阿全帶來我阿兄的信……他說去年借我的錢，要我還。」→ 阿貴(cry)：「這封信，寄丟了比較好……」

#### `alan_jie` — 阿藍姐（`villager_f`）— 染坊
位置：染坊 (13,21)。→ 商店 `shop_pingxi_indigo`
- **Q2**：
  - 阿藍姐(smile)：「這片藍，是用大菁染的。田裡那些綠綠的草，就是大菁。」
  - 阿藍姐(normal)：「葉子泡在缸裡，泡出藍色的泥，再拿來染布。越染越深。」
  - 阿藍姐(smile)：「上游那個小庄叫『菁桐坑』——因為那裡滿山的大菁跟油桐。」
  - 阿藍姐(think)：「小兄弟，你身上那件藍衫，看起來也是大菁染的喔？」
  - 星河(smile)：「九份買的！」
  - 阿藍姐(laugh)：「那一定是從我們這邊挑過去賣的布！」
- **Q4**：阿藍姐(smile)：「白頭髮的姑娘，妳穿藍色一定好看。下次來，阿姐染一條給妳。」

#### `axi` — 阿溪（`child_m`）
位置：河邊 (8,25)，褲管捲到膝蓋，拿著竹簍。
- **Q2**：
  - 阿溪(smile)：「抓溪蝦喔！石頭翻起來，牠們就會跳！」
  - 阿溪(serious)：「可是不要去深的地方，基隆河看起來淺，底下會吸人。」
  - （`q_hy_kitchen` 進行中）→ 見 4.3。
- **Q4**：阿溪(laugh)：「石頭說他在竹籠裡一直哭！我要笑他一年！」

#### `aquan` — 挑夫阿全（`villager_m2`）
位置：庄仔街 (30,15)，坐在扁擔旁邊休息。
- **Q2**：
  - 阿全(normal)：「我是挑夫，走淡蘭古道的。從淡水挑貨，經過平溪，一路挑到宜蘭。」
  - 阿全(normal)：「信啦、布啦、鹽啦、藥材啦，什麼都挑。一個擔子幾十斤。」
  - 阿全(sad)：「上個月，我的夥伴阿福在霧林被一隻大老虎追。」
  - 阿全(serious)：「他把擔子丟了才逃回來。人沒事，可是嚇破膽，再也不敢走山路。」
  - 阿全(sad)：「那個擔子裡，有好多人的信……」→ `flag: ch2_bundle_hint`
- **Q2**（持有挑夫的擔子）：見 4.2 步驟 3。
- **Q4**：阿全(smile)：「信，我會一封一封送到。這是挑夫的面子！」

#### `searcher1` / `searcher2` — 搜山的人（`villager_m` ×2）
位置：東北口 (45,12)(45,13)，手上拿著銅鑼、火把。
- **Q1**：（喊山）「阿蘭——！」「石頭——！」（對話）搜山的人(serious)：「夜裡山上看不到路，天光再去！你們先歇！」
- **Q2**：搜山的人(serious)：「洛姑娘說要帶你們上去？我們在這裡守著，有消息就敲鑼！」
- **Q4**：搜山的人(laugh)：「昨暝看到天燈，我們在山上哭得像囝仔一樣！」

#### 四個孩子（Q4，廟埕）
- `alan` 阿蘭（`child_f`）(19,19)：阿蘭(smug)：「我就說熱油有用吧！阿嬤的故事不會騙人！」→ 阿蘭(smile)：「白頭髮姊姊，妳的手冰冰的。下次我請妳吃熱熱的湯圓。」
- `adi` 阿弟仔（`child_m`）(20,19)：阿弟仔(shy)：「……紅色姊姊好兇。」→ 紅纓(angry)：「誰兇了！」→ 阿弟仔(cry)：「嗚哇——」→ 紅纓(surprise)：「欸、欸！不要哭！……給、給你糖！」
- `xiaochun` 小春（`child_f`）(26,20)：小春(smile)：「我在籠子裡的時候，有一隻小火飛進來陪我。」→ 白芷(surprise)：「小火？」→ 小春(smile)：「藍色的、暖暖的。跟姊姊身上的光一樣。」
- `shitou` 石頭（`child_m`）(27,20)：石頭(angry)：「我才沒有哭！是籠子裡灰塵太多！」

#### `ahe` — 船伕阿河（`boatman`）
位置：`shifen_falls` 碼頭 (25,21)。2-18／2-19 為腳本。在那之前（Q4 先到瀑布）：阿河(smile)：「要去淡水？上船吧——等你們準備好再叫我。」→ 選項「出發」→ 2-19。

---

## 3. 過場與事件

### 2-1　霧林入口・有人在叫你的名字
**觸發**：進入 `mistforest_n`，`ch1_done && !ch2_start`（auto）。

1. `S.chapter(2)`、`S.titleCard('第二章　霧林天燈', '七月十五・中元')`、`bgm: forest`
2. [山路口。霧從樹林裡一團一團湧出來，把陽光濾成青綠色。]
3. 白芷(think)：「星河。陳伯說的『魔神仔』，是什麼？」
4. 星河(think)：「嗯……阿炳伯說，是住在山裡的小東西。矮矮的，紅臉，很愛惡作劇。」
5. 星河(serious)：「牠們會學人說話，學你認識的人叫你的名字。」
6. 星河(serious)：「你一回頭、一答應，就被牽走了。」
7. 白芷(think)：「牽去哪裡？」
8. 星河(think)：「哪裡都有。有人在樹頂上被找到，有人在溪谷裡，有人在很遠很遠的山頭。」
9. 星河(serious)：「找到的時候，嘴巴裡塞滿了草跟泥巴。」
10. 星河(serious)：「可是他們會說：魔神仔請他們吃雞腿，好好吃。」
11. 白芷(surprise)：「……雞腿是什麼？」
12. 星河(laugh)：「重點不是那個啦！」
13. [兩人往前走了幾步。身後的霧裡，傳來一個沙啞的聲音。]
14. ？？？（陳伯的聲音）：「……星河。」
15. 星河(surprise)：「陳伯？」
16. [星河的腳一頓，身體開始往後轉——]
17. 白芷(normal)：「星河，有人叫你。」
18. [白芷已經轉過頭去了。]
19. 星河(surprise)：「——不要回頭！」
20. [星河一把拉住白芷的手腕，把她轉回來。]
21. [身後的霧裡，傳來一陣細細的、嘻嘻嘻的笑聲。然後，什麼都沒有了。]
22. 白芷(surprise)：「……那不是陳伯。」
23. 星河(serious)：「陳伯躺在床上，走兩步就喘。不可能追上來。」
24. 星河(think)：「……好險。」
25. 白芷(think)：「星河。」
26. 星河(think)：「嗯？」
27. 白芷(think)：「你的手，很熱。」
28. [星河低頭，發現自己還緊緊握著她的手腕。]
29. 星河(shy)：「啊、啊！抱歉！」
30. [星河放開手。白芷看著自己的手腕，歪了歪頭，好像不太明白他為什麼要道歉。]
31. `flag: ch2_start`、`objective('穿過霧林，前往平溪')`

**首次在霧林戰鬥時**，[教學 `tut_flee`]：
> 逃跑：成功率取決於我方與敵方的速度。頭目戰無法逃跑。
> 遇到打不過的敵人，不妨先繞路——地圖上的敵人都看得見。

### 2-2　樵夫的兒子
**觸發**：touch 阿竹空地 (8–15, 18)，once。

1. [「噹——噹——噹——」空地中央，一個少年用力敲著一面銅鑼。]
2. 阿竹(serious)：「阿爸——！阿山——！你聽到沒有——！」
3. [少年轉過身，看到星河他們，嚇了一跳，舉起鑼槌當武器。]
4. 阿竹(surprise)：「你、你們是人還是魔神仔！」
5. 星河(normal)：「人啦！九份來的！」
6. 阿竹(think)：「……魔神仔也會這麼說。」
7. 白芷(smile)：「我們不會請你吃雞腿。」
8. 阿竹(surprise)：「……」
9. 阿竹(think)：「……好，你們是人。魔神仔不會講這麼奇怪的話。」
10. 星河(think)：「你在找人？」
11. 阿竹(sad)：「我阿爸。平溪的樵夫，叫阿山。三天前來這裡砍柴，就沒回來了。」
12. 阿竹(sad)：「庄裡的人都說，是被魔神仔牽走了。」
13. 阿竹(serious)：「老人說，要敲鑼、大聲喊名字，才能把人叫回來。」
14. 阿竹(cry)：「可是我喊了三天，喉嚨都啞了……」
15. 阿竹(sad)：「庄裡的大人都去找被虎姑婆擄走的囝仔了。沒人能來幫我。」
16. 星河(surprise)：「虎姑婆？」
17. 阿竹(serious)：「平溪這半個月，不見了四個囝仔。大家說是虎姑婆。」
18. 星河(serious)：「……」
19. 選項：**「我們幫你找。」** / 「我們趕路……」
    - 幫你找 → 阿竹(surprise)：「真的？」
    - 趕路 → 白芷(sad)：「星河。他的聲音，啞掉了。」→ 星河(sad)：「……我知道。好啦，我們會注意的。」→ 阿竹(surprise)：「真的？」
20. 阿竹(serious)：「這個給你們。」→ 獲得 **銅鑼**
21. 阿竹(serious)：「看到我阿爸，就敲鑼，喊他的名字。『阿山』。」
22. 阿竹(sad)：「我……我要回平溪看我阿母了。她一個人在家，一直哭。」
23. 阿竹(serious)：「拜託你們了！」
24. [阿竹跑向北邊的山路。（離開地圖。）]
25. `quest: q_woodcutter (0)`

### 2-3　魔神仔的迷陣（無解的循環）
**觸發**：進入 `mist_loop`。機制見 5.3。
**首次進入**（auto，once）：
1. [林中的空地。霧在四周圍成一圈白牆。正中央一棵老樟樹，樹枝上綁著一條紅布。]
2. 星河(think)：「四個方向都有路……陳伯說平溪在南邊。」
3. 白芷(think)：「那棵樹，在看我們。」
4. 星河(surprise)：「樹不會看人啦。」
5. 白芷(think)：「……那條紅布，在看我們。」
6. 星河(think)：「……好，這個我沒辦法反駁。」

**第 1 次回到空地**（任一出口）：
1. [淡出、淡入。兩人又站在空地的入口。正中央，那棵綁紅布的老樟樹。]
2. 星河(think)：「……這棵綁紅布的樟樹，剛剛是不是看過？」
3. 白芷(think)：「看過。它的紅布，打的是同一個結。」

**第 2 次**：
1. 星河(angry)：「又是你！」（對樹）
2. 白芷(smile)：「你好。」（對樹）
3. 星河(angry)：「不要跟它打招呼啦！」

**第 3 次** → 2-4。

### 2-4　七彩的光在唱歌
**觸發**：`vars.loopCount >= 3 && !ch2_grove_open`，回到空地時。

1. 星河(hurt)：「……我們被魔神仔牽著走了。」
2. 星河(hurt)：「陳伯說得對。早知道就不要嘴硬說『有也沒關係』……」
3. [四周的霧裡，傳來嘻嘻嘻嘻的笑聲。很多個。忽遠忽近。]
4. [白芷忽然轉向西南。]
5. 白芷(think)：「……那邊。」
6. 星河(think)：「什麼？」
7. 白芷(think)：「那邊有東西在唱歌。」
8. [西南的蕨叢後面，霧裡透出一點光——紅的、綠的、藍的，一明一暗，像在呼吸。]
9. [笑聲停了。好像連魔神仔都不敢靠近那道光。]
10. 星河(surprise)：「……那是什麼光？」
11. 白芷(smile)：「不知道。可是，它不壞。」
12. [白芷撥開蕨葉，走了進去。]
13. 星河(surprise)：「欸！等我！」
14. `flag: ch2_grove_open`（西南蕨叢不再實心）→ 自動走進 → `warp('mist_grove', 28, 14, 'left')`

### 2-5　七彩靈蕈・第一次靈視
**觸發**：進入 `mist_grove`，`!ch2_lingshi`（auto）。
這是本章的核心演出：溫柔、驚奇、安全、有意義。不要急——每一步都留 1–2 秒讓畫面呼吸。
**演出基調**：迷幻在這裡是「看見」而不是「失控」——石碑的叮嚀（心靜）、兩人先坐下來調息、只吃半朵；看見的東西都指向真實（真正的路、彼此心口的燈）。

1. [`bgm: mushroom`（fade 3.0）。霧在林緣停住，像一堵看不見的牆。牆內，是另一個世界。]
2. [地上的苔蘚發著青綠色的微光。一叢叢蕈菇從樹根、倒木、石縫裡長出來——紅、橙、黃、綠、藍、靛、紫，一明，一暗，像在呼吸。]
3. [正中央，一株巨大的蕈傘撐在小池塘上。池水倒映著所有的光。]
4. 星河(surprise)：「……哇。」
5. 白芷(surprise)：「……」
6. 白芷(smile)：「它們在呼吸。你聽。」
7. 星河(think)：「蘑菇不會呼吸……吧？」
8. [光，一明，一暗。]
9. 星河(think)：「……好吧。也許會。」
10. [鏡頭移向池邊一塊長滿青苔的石碑。星河走過去，撥開苔蘚。]
11. [石碑文字（`S.narrate`，以碑文字體顯示）：]
    - 「此地有蕈，七色而光，名曰七彩靈蕈。」
    - 「非毒非藥。食半朵，可見陰陽之隔。」
    - 「心靜者見真，心亂者見魔。慎之。」
    - 「　　　　　　　　　太虛觀　清虛　題」
12. 星河(surprise)：「太虛觀……清虛！是陳伯要我們找的人！」
13. 白芷(think)：「他來過這裡。」
14. 星河(think)：「『可見陰陽之隔』……意思是吃了，就看得到平常看不到的東西？」
15. 星河(think)：「說不定……就看得穿魔神仔的迷陣？」
16. 白芷(think)：「『心靜者見真』。」
17. [白芷蹲下，看著一朵藍紫色的小蕈。蕈傘下的光，一明一暗地照在她臉上。]
18. 白芷(smile)：「我想，我可以心靜。」
19. 星河(surprise)：「欸，等等，妳不要隨便吃路邊的——」
20. 白芷(think)：「你要吃嗎？」
21. 星河(think)：「我……我現在心很亂。」
22. 白芷(think)：「為什麼？」
23. 星河(shy)：「……沒、沒事。」
24. 白芷(smile)：「那我們先坐下來。等你的心靜下來。」
25. [兩人在池邊的倒木上坐下。只有蟲鳴，和蕈菇呼吸的光。]
26. [星河閉上眼睛，深深吸一口氣，慢慢吐出來。一次。兩次。三次。（畫面亮度跟著他的呼吸，一明、一暗；`psychedelic` 0.15 → 0.25。）]
27. 星河(normal)：「……好了。」
28. 白芷(smile)：「半朵。石碑說的。」
29. [白芷把那朵小蕈輕輕分成兩半，一半遞給星河。]
30. 星河(think)：「……要是我們變成蘑菇怎麼辦？」
31. 白芷(think)：「那我們就一起呼吸。」
32. 星河(laugh)：「……妳講話真的很奇怪。」
33. [兩人吃下靈蕈。味道像雨後的泥土，又有一點點甜。]
34. [一開始，什麼都沒有發生。]
35. 星河(think)：「……好像沒感覺耶。是不是——」
36. [池水的倒影，先動了。（`psychedelic` 0.25 → 1.0，歷時 6 秒。）]
37. [蕈菇的光開始跟著兩人的心跳一起呼吸。樹幹上的紋路像水波一樣緩緩流動。每一片葉子的邊緣，都鑲上了一圈虹彩。]
38. [霧不再是霧了。它變成一條一條透明的河，在樹與樹之間，慢慢地流著光。]
39. 星河(surprise)：「白芷……樹……樹在流動……」
40. 白芷(smile)：「嗯。它們一直都在流。只是平常太慢，我們看不到。」
41. [地上的苔蘚亮起無數細細的光脈，像葉脈、像河流、像一張地圖——全部朝著同一個方向流去：森林的南方。]
42. [光脈之中，浮現小小的、光做的動物。一隻石虎從倒木後探出頭；一隻山羌豎著耳朵；一隻台灣藍鵲拖著寶藍色的長尾巴，從他們頭頂滑過去。]
43. 星河(laugh)：「是藍鵲！好漂亮……牠的尾巴好長……」
44. 白芷(smile)：「它們是這座山的記憶。」
45. 白芷(think)：「每一隻走過這裡的動物，都在這裡留下一點點光。」
46. [星河伸出手。一隻螢火蟲停在他的指尖——接著是兩隻、十隻、一百隻。牠們排成一條發光的線，從他的指尖一路延伸進森林深處。]
47. 星河(surprise)：「牠們在……指路？」
48. [星河轉頭看白芷——]
49. [在靈視裡，白芷的輪廓是半透明的。她的身體裡，有一團安靜的、白色的火焰，正緩緩地燃燒。像一盞燈。]
50. 星河(surprise)：「……」
51. [他眨了眨眼。火焰還在。]
52. 白芷(think)：「星河？」
53. [白芷也看向他。她的眼睛慢慢睜大。]
54. 白芷(surprise)：「……星河，你的心口。」
55. 星河(think)：「我的心口？」
56. 白芷(surprise)：「有一盞燈。小小的，在你的胸口裡面亮著。」
57. 白芷(think)：「跟我的……顏色一樣。」
58. [星河低頭。他看不見自己胸口裡有什麼。他只看見——白芷的火焰，和他胸口那一點微光之間，有一條細細的、紅色的線，輕輕地連在一起。]
59. [紅線一閃，不見了。]
60. 星河(think)：「……我們，是不是吃太多了。」
61. 白芷(laugh)：「我們只吃了半朵。」
62. [兩人一起笑出來。笑聲在林子裡變成彩色的漣漪，一圈一圈散開，撞到樹幹，又彈回來。]
63. [他們躺在苔蘚上，看著頭頂的林冠。林冠的縫隙裡，天空變成了一面萬花筒——葉子的影子不停地分裂、旋轉、重組，像一朵開了又開的花。]
64. 星河(smile)：「阿炳伯要是看到這個，可以講一百年。」
65. 白芷(smile)：「那你就講給他聽。」
66. 星河(smile)：「他不會信的。」
67. 白芷(think)：「信不信，不重要。」
68. 白芷(smile)：「重要的是，有人願意講。」
69. [旁邊一朵大蕈菇的光，忽然閃了一下。]
70. 蕈菇（阿炳伯的聲音）：「話說——」
71. 星河(surprise)：「阿炳伯！？」
72. 白芷(think)：「那是蘑菇。」
73. 星河(think)：「……我知道。」
74. [慢慢地，光的呼吸變慢了。顏色一層一層沉回原處。（`psychedelic` 1.0 → 0.35，歷時 5 秒。）]
75. [螢火蟲的線還在。它從池邊延伸出去，穿過蕨叢，指向迷陣的方向。]
76. 星河(normal)：「……我好像，回來了一點。」
77. 白芷(smile)：「可是你的眼睛，還看得到。」
78. 星河(think)：「嗯。那條螢火蟲的路……還在。」
79. 星河(serious)：「白芷，我知道怎麼走出去了。迷陣的地上——一定有真正的腳印。」
80. [星河蹲下，小心地採了幾朵靈蕈，用手帕包起來。]→ 獲得 **七彩靈蕈 ×3**
81. 星河(smile)：「多帶幾朵。……我是說，以防萬一。」
82. 白芷(think)：「以防萬一，再迷路一次？」
83. 星河(laugh)：「對對對，就是這樣！」
84. `S.vision(120)`、`flag: ch2_lingshi`、`objective('用靈視找出迷陣的出口')`
85. [教學 `tut_lingshi`（兩頁）]
    > 靈視：吃下七彩靈蕈，會在一段時間內看見平常看不見的東西——隱藏的路、寶箱、迷路的魂，以及魔神仔幻術的真面目。
    > 在選單「道具」使用七彩靈蕈即可進入靈視。畫面四周呼吸的光暈，就是剩下的時間。
    
    > 戰鬥中使用七彩靈蕈，能讓一名夥伴進入「幻境」：爆擊與法術威力提升，但偶爾會恍神。
    > 靈蕈林的蕈菇會慢慢長回來。每次來，都能再採一些。

**石碑（之後調查）**：重讀碑文 →（`ch3` 以後若雲歸在隊伍中，可由第三章作者加一句雲歸的反應。）

### 2-6　銀色的腳印
**觸發**：靈視中回到 `mist_loop`（auto，once）。
1. [空地上，在靈視的光裡，地面浮現出一串銀色的小腳印——光做的，一個一個，朝著東邊的出口走去。]
2. 星河(surprise)：「有了！腳印！」
3. 白芷(think)：「這些腳印……很小。像孩子的。」
4. 星河(think)：「……也許是以前，從這裡走出去的人留下的。」
5. 星河(serious)：「跟著走！」
6. [靈視中，樟樹上的紅布條像一條紅舌頭一樣，不甘心地扭了扭。]

**解開時**（第 4 個正確出口，見 5.3）：
1. [走出西口——這一次，眼前不是那片空地。霧散開了。前方是一條往下延伸的山徑，遠遠地，看得到黃昏的天空。]
2. 星河(laugh)：「出來了！哈哈！魔神仔，你們輸了！」
3. [身後的林子裡，傳來一聲不甘心的「嘖」。]
4. 白芷(smile)：「牠們好像很不高興。」
5. 星河(smug)：「哼哼，誰叫牠們惹到九份第一的燈籠舖學徒。」
6. `flag: ch2_maze_solved` → `warp('mistforest_s', 19, 1, 'down')`

**沒有靈視時進入 `mist_loop`（迷陣未解）**：
- 星河(think)：「沒有靈視，我看不到那些腳印……」（第一次；之後不顯示）
- 迷陣維持無限循環（見 5.3）。

### 2-7　魔神仔的雞腿（救樵夫，可選）
**觸發**：靈視中穿過幻象樹，touch 樵夫幻林 (30–37, 6)，`q_woodcutter` 進行中，once。

1. [林中的小空地。一棵大樟樹的高處枝椏上，坐著一個中年男人。他衣衫破爛，滿臉泥巴，正開心地啃著什麼。]
2. [樹下，三個紅臉的矮小影子圍成一圈，拍手、跳舞、嘻嘻嘻地笑。]
3. 阿山(smile)：「好吃……好吃……雞腿……」
4. 阿山(laugh)：「這麼好吃的雞腿，我一世人沒吃過……」
5. [在靈視裡，看得一清二楚：他手上抓的，是一把蚱蜢和一團爛泥巴。]
6. 白芷(think)：「星河。那不是雞腿。」
7. 星河(serious)：「……我知道。」
8. 白芷(think)：「雞腿……原來是長那樣的嗎？」
9. 星河(angry)：「不是啦！真正的雞腿不是那樣啦！」
10. [魔神仔們同時轉過頭來。三張紅臉，三排尖尖的小牙。]
11. 魔神仔（三重聲音）：「……看到了？」「看到了！」「看到了看到了看到了！」
12. 星河(serious)：「阿竹說的——敲鑼！喊名字！」
13. [星河舉起銅鑼。]
14. 星河(angry)：「阿——山——！」
15. [「噹——！」鑼聲在林子裡炸開。魔神仔們抱著頭尖叫。樹上的阿山渾身一抖。]
16. 魔神仔：「吵死了吵死了！搶我們的客人！」
17. **戰鬥**：`t_mf_woodcutter`（背景 `forest`，BGM `battle`；若進入戰鬥時靈視仍有效，改用 `t_mf_woodcutter_v`：無幻影）
18. [勝利後。魔神仔們尖叫著四散，鑽進霧裡不見了。]
19. [星河再敲一次鑼。]
20. 星河(serious)：「阿山伯！你兒子阿竹在等你回家！」
21. [樹上的阿山愣住了。他低頭看著手上——蚱蜢跳走了，泥巴從指縫間滑下去。]
22. 阿山(surprise)：「……噗！呸！呸呸！」
23. 阿山(surprise)：「這、這是什麼！我在吃什麼！」
24. 阿山(surprise)：「我……我怎麼在樹上？」
25. [阿山手忙腳亂地爬下樹，一屁股坐在地上。]
26. 阿山(hurt)：「我只記得……在砍柴，聽到我阿母在叫我……」
27. 阿山(think)：「可是我阿母，死了十年了啊……」
28. 白芷(sad)：「……」
29. 阿山(sad)：「我在這裡多久了？」
30. 星河(normal)：「三天。」
31. 阿山(surprise)：「三天！？」
32. 阿山(cry)：「阿竹……我某……」
33. 星河(smile)：「走吧，阿山伯。我們送你回平溪。」
34. 阿山(smile)：「……少年仔，多謝。真的多謝。」
35. 阿山(normal)：「我現在看得到路了。這條山徑，我走了二十年。」
36. `flag: ch2_woodcutter_found`、`quest: q_woodcutter (1)`；阿山成為臨時隨從（spawn，跟隨），至 `pingxi` 北口時自動回家。

### 2-8　紅纓：妖女，接招！
**觸發**：touch 決鬥空地 (14–25, 20)，`ch2_maze_solved && !ch2_duel`。時間轉為黃昏（`light ambient 0.5`，暖色）。

1. [林間空地。夕陽從樹縫斜照進來。地上散落著幾截斷掉的紅布條。]
2. [一個紅衣少女背對著他們，槍尖拄地，大口喘氣。她腳邊，最後一隻魔神仔尖叫著化成一縷煙。]
3. 紅纓(angry)：「……哼。還敢來？」
4. [她轉過身。高高的馬尾，長長的紅髮帶，手上一桿紅纓槍。]
5. [這時，林子深處，一點、兩點、十點……淡藍色的鬼火飄了出來。]
6. [它們沒有攻擊任何人，只是靜靜地，飄向白芷，繞著她打轉——像飛蛾圍著燈。]
7. 白芷(surprise)：「……你們好。」
8. 星河(surprise)：「白芷，妳、妳身邊……」
9. 紅纓(surprise)：「……」
10. 紅纓(angry)：「鬼火繞身……銀髮金瞳……」
11. 紅纓(angry)：「妖女！」
12. 白芷(think)：「妖女……是在說我嗎？」
13. 紅纓(angry)：「還裝傻！這片林子的魔神仔，就是妳在養的吧！」
14. 星河(surprise)：「欸欸欸！等一下！誤會！」
15. 紅纓(serious)：「你——」
16. [紅纓打量了星河一眼：一臉傻氣，衣服被樹枝勾破，頭髮上還黏著一片蕈菇碎屑。]
17. 紅纓(serious)：「……被迷住了。看那張傻臉就知道。」
18. 星河(angry)：「誰的臉傻啊！」
19. 紅纓(serious)：「別怕。我這就斬了她，救你出來。」
20. 星河(angry)：「我不需要被救！」
21. 紅纓(smug)：「被迷住的人，都這麼說。」
22. [紅纓一抖長槍。槍頭的紅纓在晚風裡甩開。]
23. 紅纓(serious)：「鹿港洛家槍，洛紅纓。」
24. 紅纓(serious)：「妖女，接招！」
25. 星河(serious)：「……講不聽是不是。」
26. [星河拔出螢火，擋在白芷前面。]
27. 星河(serious)：「白芷，退後——」
28. 白芷(serious)：「我要跟緊。」
29. 星河(smile)：「……我就知道。」
30. **戰鬥**：`t_hongying_duel`（頭目，背景 `forest`，BGM `boss`，不可逃跑，**不會 Game Over**；紅纓 HP ≤ 35% 時戰鬥結束）— 設計見 6.4。
31. **結果 A（紅纓 HP ≤ 35%）**：
    1. [紅纓單膝著地，槍尖抵著地面。她的左臂上有一道血痕——是剛才跟魔神仔打的時候留下的，現在又裂開了。]
    2. 紅纓(hurt)：「……可惡……我還沒……」
32. **結果 B（我方全滅）**：
    1. [星河倒在地上。紅纓的槍尖，停在他眼前一寸。]
    2. [白芷撐起身子，張開雙手，擋在星河前面。]
    3. 白芷(serious)：「不可以。」
    4. 紅纓(surprise)：「……」
    5. [紅纓的槍尖晃了一下。她左臂上的傷口裂開，血順著手腕滴下來。]
    6. 紅纓(hurt)：「……嘖。」
    7. （我方 HP 恢復至 1／4，繼續下面的共通劇情。）
33. **共通**：
    1. [白芷走向紅纓。]
    2. 紅纓(angry)：「不准過來！」
    3. [白芷沒有停。她跪在紅纓身邊，把手輕輕放在那道傷口上，輕聲哼起一段旋律。淡淡的水光，從她指尖流進傷口。血止住了。]
    4. 紅纓(surprise)：「……」
    5. 白芷(smile)：「好了。」
    6. 白芷(think)：「妳的手在流血。流血會痛。」
    7. 白芷(think)：「我不喜歡別人痛。」
    8. 紅纓(surprise)：「……妳……」
    9. 紅纓(think)：「妖物……會幫敵人療傷？」
    10. 星河(smug)：「我就說了吧。誤會。」
    11. 紅纓(angry)：「閉嘴，傻臉。」
    12. `flag: ch2_duel` → 接 2-9

### 2-9　背靠背
1. [林子四周響起尖笑。紅布條在樹梢間亂飛——十幾隻魔神仔，從四面八方圍了過來。]
2. 紅纓(angry)：「……還有？剛剛明明打完了！」
3. 魔神仔：「打架打架！打累了！好吃！」
4. 星河(serious)：「先別管誤會了——背靠背！」
5. 紅纓(serious)：「……哼。只此一次。」
6. `S.join('hongying')`、`flag: ch2_hongying_join`
7. [教學 `tut_hongying`]
   > 洛紅纓加入了隊伍！擅長槍術，攻擊高、速度快。
   > 霧林的妖物多是「木」屬性——金剋木，紅纓的槍正好剋它們。
8. **戰鬥**：`t_mf_ambush`（背景 `forest`，BGM `battle`）
9. [勝利後。魔神仔們一鬨而散。]
10. 紅纓(normal)：「……」
11. 紅纓(shy)：「……那個。」
12. 紅纓(shy)：「剛剛……是我看錯了。」
13. 星河(smug)：「什麼？聽不到——」
14. 紅纓(angry)：「我說我看錯了！笨蛋！」
15. [紅纓轉向白芷，聲音小得像蚊子叫。]
16. 紅纓(shy)：「……對不起。」
17. 白芷(smile)：「沒關係。」
18. 白芷(think)：「『笨蛋』，是星河的另一個名字嗎？」
19. 紅纓(laugh)：「噗——對。從今天起就是。」
20. 星河(angry)：「才不是！」
21. 星河(normal)：「妳說妳是鹿港洛家的？跑這麼遠來霧林做什麼？」
22. 紅纓(serious)：「平溪的庄頭出了賞金。有東西在擄小孩——一隻會變成老太婆的老虎。」
23. 白芷(think)：「會變成老太婆的老虎……」
24. 星河(surprise)：「虎姑婆！？阿竹也說了……那不是阿嬤嚇小孩的故事嗎！」
25. 紅纓(serious)：「已經不見四個小孩了。故事會擄人嗎？」
26. 星河(serious)：「……」
27. 紅纓(serious)：「我追著牠的腳印進來，結果被魔神仔纏了一整天。」
28. 紅纓(think)：「……而且，我在找一個人。」
29. 星河(think)：「誰？」
30. 紅纓(serious)：「戴鬼面具的劍客。人稱『鬼面』。」
31. 紅纓(serious)：「三年前的中元夜，鹿港洛家……一夜之間，全死了。」
32. 紅纓(serious)：「只有我活下來。我最後看到的人，就是戴著鬼面的他。」
33. 星河(sad)：「……」
34. 白芷(sad)：「……」
35. 紅纓(normal)：「有人說，最近在北邊，觀音山一帶，看過他。」
36. 星河(surprise)：「觀音山？我們也要去觀音山！」
37. 紅纓(think)：「……你們？去觀音山做什麼？」
38. 星河(think)：「呃……說來話長。」
39. 白芷(smile)：「去找一個叫清虛真人的道士，問他我是誰。」
40. 紅纓(think)：「……說得真短。」
41. 紅纓(serious)：「虎姑婆的事還沒完。先去平溪。」
42. 紅纓(think)：「之後……要是順路，跟你們走一段也不是不行。」
43. 紅纓(angry)：「別誤會！只是怕你這笨蛋又被什麼東西迷住！」
44. 星河(think)：「……我到底什麼時候被迷住了。」
45. [白芷身邊還繞著一兩點鬼火。紅纓偷偷瞄了一眼，小聲說——]
46. 紅纓(shy)：「……其實，那些小火……有點可愛。」
47. 星河(surprise)：「妳說什麼？」
48. 紅纓(angry)：「什麼都沒說！走了！」
49. `objective('前往平溪')`

**教學 `tut_combo2`**（星河、紅纓都 ≥ Lv8 的第一場戰鬥）：
> 新的合擊：星河＋紅纓「火樹銀花」。火與金的連擊，打在單一敵人身上特別痛。

### 2-10　平溪之夜：敲鑼喊名字的山
**觸發**：進入 `pingxi`，`ch2_hongying_join && !ch2_pingxi_arrive`（auto）。若阿山跟隨中，先播「樵夫重逢」（4.1 步驟 3），再播本段。

1. [平溪，入夜。山谷裡零零星星的燈火。遠處的山上，傳來一聲一聲的鑼響，還有人在喊名字。`bgm: night`]
2. 山上的聲音：「阿蘭——！」
3. 山上的聲音：「石頭——！」「小春——！」
4. 白芷(think)：「他們在……叫名字。」
5. 紅纓(serious)：「搜山的人。已經找了三天。」
6. [一個拄著拐杖的老人迎上來。]
7. 李庄頭(serious)：「洛姑娘！妳回來了……有找到嗎？」
8. 紅纓(sad)：「……還沒。被魔神仔絆住了。」
9. 李庄頭(sad)：「唉……」
10. 李庄頭(think)：「這兩位是？」
11. 星河(normal)：「九份來的，沈星河。這位是白芷。」
12. 李庄頭(serious)：「九份……路上辛苦了。我是平溪的庄頭，姓李。」
13. 李庄頭(serious)：「平溪這半個月，不見了四個囝仔。」
14. 李庄頭(serious)：「都是半夜。有人聽到敲門聲，一個老婦人的聲音說——」
15. 李庄頭(sad)：「『乖孫，開門，姑婆來看你了。』」
16. 白芷(sad)：「……」
17. 李庄頭(serious)：「隔天早上，囝仔就不見了。門口有老虎的腳印。」
18. 星河(serious)：「虎姑婆……真的有。」
19. 李庄頭(serious)：「庄裡的男人都上山去找了。敲鑼、喊名字，找了三天三夜。」
20. 李庄頭(sad)：「找不到。山太大，霧太濃。」
21. 李庄頭(normal)：「天燈舖的吳阿公，已經在紮天燈了。」
22. 李庄頭(serious)：「我們平溪的規矩：囝仔找到了，就放天燈，叫山上的人回家。」
23. 紅纓(serious)：「明天天一亮，我就上山。這次一定找到牠的窩。」
24. 星河(serious)：「我們也去。」
25. 李庄頭(cry)：「……多謝。多謝你們。」
26. 李庄頭(normal)：「今暝先去客棧歇著。月娘會照顧你們。」
27. `flag: ch2_pingxi_arrive`、`objective('去十分客棧休息')`

### 2-11　客棧之夜：紅色的帶子
**觸發**：進入 `pingxi_inn`，`ch2_pingxi_arrive && !ch2_morning`（auto）。

1. 月娘(smile)：「三位就是庄頭說的恩人吧？房間準備好了。」
2. 月娘(normal)：「今暝不收錢。庄頭交代的。」
3. 紅纓(normal)：「……那我去灶腳借一下，煮點東西給大家——」
4. 月娘(surprise)：「不、不用了！洛姑娘！灶腳……灶腳今暝在修！」
5. 紅纓(think)：「……？」
6. 星河(think)：「（小聲）月娘，她……」
7. 月娘(sad)：「（小聲）前天她煮了一鍋粥，我的鍋子到現在還是黑的。」
8. [淡出。]
9. [淡入。東南的客房。白芷坐在窗邊，看著山上一點一點移動的火把。紅纓坐在床邊擦槍。]
10. 白芷(think)：「紅纓。」
11. 紅纓(normal)：「……幹嘛。」
12. 白芷(think)：「妳頭髮上那條紅色的帶子，很長。」
13. 紅纓(normal)：「……是我娘的。」
14. 紅纓(sad)：「她說，紅纓要綁高，人才會抬頭走路。」
15. 白芷(smile)：「我也有紅色的繩子。」
16. [她摸了摸自己髮上的紅繩。]
17. 白芷(think)：「可是我不記得，是誰幫我綁的。」
18. 紅纓(think)：「……」
19. 紅纓(normal)：「那妳就當作，是一個很重要的人綁的。」
20. 白芷(smile)：「……嗯。」
21. [門外傳來星河的聲音。]
22. 星河（門外）(normal)：「喂——明天要早起喔——」
23. 紅纓(angry)：「知道啦，笨蛋！」
24. 白芷(smile)：「知道啦，笨蛋。」
25. 星河（門外）(surprise)：「白芷！？」
26. [紅纓噗哧一聲笑出來，趕緊用被子摀住嘴。]
27. [淡出。全員完全恢復。]
28. `flag: ch2_morning`（時段轉 Q2）、`S.titleCard('', '七月十六')`、`objective('準備好後，從東北邊的竹林上山')`

### 2-12　竹林裡的樹上女孩（阿蘭的考驗）
**觸發**：`tiger_lair` touch (9–14, 19)，once。
（對話謎題機制見 5.5。）

1. [大樟樹下。地上有一圈被踩亂的竹葉和一隻小布鞋。]
2. ？？？（樹上）：「不准過來！」
3. 星河(surprise)：「樹上有人！」
4. [鏡頭往上：大樟樹的高處，一個十歲左右的女孩緊緊抱著樹幹，手上抓著一把毬果。]
5. 阿蘭(angry)：「你們是不是虎姑婆變的！」
6. 星河(normal)：「不是啦！我們是來救你們的！」
7. 阿蘭(angry)：「虎姑婆也是這樣講的！」
8. 紅纓(think)：「……很有道理。」
9. 星河(angry)：「妳站哪邊的啊！」
10. 阿蘭(serious)：「我要考你們！答錯了，就是虎姑婆！」
11. → 「阿蘭的三個問題」（見 5.5）
12. **通過後**：
    1. [阿蘭從樹上滑下來，腳一軟，坐在地上，哇地哭了出來。]
    2. 阿蘭(cry)：「我、我好怕……我在樹上待了兩天……」
    3. [白芷蹲下來，把她抱進懷裡。]
    4. 白芷(smile)：「已經不用怕了。」
    5. 阿蘭(cry)：「姊姊……妳的手好冰喔……」
    6. 白芷(think)：「……對不起。」
    7. 阿蘭(cry)：「……可是好舒服。」
    8. 紅纓(serious)：「其他孩子呢？」
    9. 阿蘭(serious)：「上面有一間老厝。裡面有一個阿婆，她……她就是虎姑婆。」
    10. 阿蘭(serious)：「半夜她在吃東西，咔滋咔滋。我問她吃什麼，她說是花生。」
    11. 阿蘭(serious)：「我就想到阿嬤講的故事。我說我要去尿尿，就跑出來，爬到樹上。」
    12. 星河(surprise)：「……跟故事裡一模一樣。」
    13. 阿蘭(cry)：「可是阿弟仔還在裡面！小春跟石頭也是！」
    14. 阿蘭(serious)：「厝的後面有一個山洞。她把大家關在那裡。」
    15. 阿蘭(serious)：「還有……灶腳有一大鍋油，一直在燒。」
    16. 紅纓(serious)：「……妳在這裡等著。我們去把他們帶回來。」
    17. 阿蘭(serious)：「我也要去！阿弟仔是我弟弟！」
    18. 紅纓(angry)：「不行！」
    19. 阿蘭(angry)：「……」
    20. 星河(normal)：「阿蘭，妳在這裡幫我們看著退路。很重要的任務。」
    21. 阿蘭(think)：「……好。」
    22. [阿蘭的眼睛，悄悄地瞄向山坡上的老厝。]
    23. `flag: ch2_alan_trust`、`objective('前往山坡上的老厝')`

### 2-13　山中老厝的阿婆
**觸發**：進入 `tiger_house`，`ch2_alan_trust && !ch2_granny_house`（auto）。BGM 停；只有柴火與咀嚼聲。

1. [昏暗的老厝。灶裡燒著火，大鍋裡的油冒著煙。一個瘦小的老婦人背對門口坐著，膝上蓋著花布，正「咔滋、咔滋」地嚼著什麼。]
2. 老婦人：「……唉喲，有人客。」
3. 老婦人：「來，乖孫，進來坐。外口冷。」
4. 星河(think)：「阿……阿婆，妳一個人住在山裡？」
5. 老婦人：「是啊。姑婆一個人，好寂寞喔。」
6. 老婦人：「你們要不要吃花生？咔滋咔滋，很香喔。」
7. 白芷(think)：「……好啊。」
8. 紅纓(surprise)：「喂！」
9. [白芷接過一顆「花生」，放進嘴裡。]
10. 白芷(think)：「……」
11. 白芷(think)：「這個花生，是石頭。」
12. 老婦人：「……」
13. [老婦人慢慢轉過頭。皺紋深處的眼睛，是兩點黃色的光。]
14. 老婦人：「……真是沒禮貌的孩子。」
15. 選項：**「阿婆，妳的手好多毛。」** / **「阿婆，妳的眼睛好大。」** /（靈視中才出現）**「阿婆，妳裙子下面……有尾巴。」**
    - 手 → 老婦人：「……那是因為姑婆老了，怕冷。」→ 紅纓(serious)：「那牙齒呢？怎麼那麼尖？」→ 老婦人：「……那是為了……」
    - 眼睛 → 老婦人：「……那是為了，看清楚你們呀，乖孫。」
    - 尾巴 → 老婦人：「……！」
16. [花布底下，一條粗大的、黃黑相間的尾巴，「啪」地甩在地上。]
17. 虎姑婆：「嘻嘻嘻嘻……被看到了。」
18. 虎姑婆：「今暝吃不到乖孫……那就——先吃最小的那個！」
19. [虎姑婆一腳踢翻桌子，撞破後門，消失在竹林裡。`shake(6,0.4)`]
20. 紅纓(angry)：「別想逃！」
21. `flag: ch2_granny_house`；`tiger_lair` 洞口的竹叢消失；`objective('追進虎姑婆的洞窟')`
22. （灶上那鍋熱油留在原處。調查：「一大鍋熱油，還在冒煙。」）

### 2-14　虎姑婆的洞窟
**首次進入 `tiger_den`**（auto，once）：
1. [洞窟。腥臭的風。岩壁上掛著幾盞油燈，照出一堆堆搶來的東西：雞籠、鍋子、小鞋子。]
2. [深處，傳來小孩的哭聲。]
3. 紅纓(serious)：「……分頭找。不對，不能分頭。一起走。」
4. 星河(serious)：「聲音從兩邊都有。」

**小春的竹籠** (4,19)：調查。
1. [竹籠裡，一個小女孩縮成一團。]
2. 小春(cry)：「……不要吃我……」
3. 白芷(smile)：「我們不吃人。我們來帶妳回家。」
4. [紅纓一槍挑斷綁住籠門的藤條。]
5. 小春(cry)：「……阿嬤……我要阿嬤……」
6. 紅纓(normal)：「沿著來的路往外走，阿蘭在外面的大樹下等。」
7. 小春(cry)：「……嗯。」[小春跑向出口。]
8. `flag: ch2_cage1`

**石頭的竹籠** (27,18)（需穿過幻牆）：調查。
1. [竹籠裡，一個男孩用手背猛擦眼睛。]
2. 石頭(angry)：「我、我沒有哭！」
3. 星河(smile)：「好，你沒有哭。」
4. [紅纓挑斷藤條。]
5. 石頭(serious)：「阿弟仔被帶到最裡面了！虎姑婆說……要先吃他的手指頭……」
6. 紅纓(angry)：「……！」
7. 石頭(cry)：「快去救他！」[石頭跑向出口。]
8. `flag: ch2_cage2`

**兩個竹籠都打開時**：
1. [洞窟深處傳來「喀啦」一聲。頭目間前的竹柵門，被一陣腥風吹開了。]
2. 虎姑婆（深處）：「嘻嘻嘻……來吧，乖孫……姑婆等你們好久了……」
3. `objective('救出阿弟仔')`

**幻牆提示**：靈視未啟動時，第一次調查幻牆 → 白芷(think)：「這面牆在呼吸。牆，應該不會呼吸吧？」→ 星河(think)：「……是魔神仔那種把戲。用靈視看看！」

### 2-15　頭目：虎姑婆
**觸發**：touch 頭目間 (14–17, 10)，`ch2_cage1 && ch2_cage2`，once。

1. [頭目間。正中央，虎姑婆仍是老婦人的模樣，坐在一張竹椅上。她身後的竹籠裡，一個五、六歲的小男孩哭得滿臉鼻涕。]
2. 阿弟仔(cry)：「阿姊……阿姊……」
3. 虎姑婆：「乖孫，莫哭。姑婆只吃一根手指頭就好——」
4. 虎姑婆：「咔滋、咔滋……」
5. 紅纓(angry)：「住手！」
6. 虎姑婆：「嘻嘻……又是你們。」
7. 虎姑婆：「你們知道嗎？這座山……越來越吵了。」
8. 虎姑婆：「海那邊的光，越來越冷。死掉的東西，攏擠在山裡。」
9. 虎姑婆：「姑婆好餓……好餓好餓好餓……」
10. 白芷(sad)：「……妳也是，迷路了嗎？」
11. 虎姑婆：「……」
12. 虎姑婆：「閉嘴！」
13. [虎姑婆站起來。佝僂的身體一節一節拉長，花布衫撐破了。]
14. 星河(serious)：「白芷、紅纓——上！」
15. **戰鬥**：`t_tiger_granny`（頭目，背景 `forest`（洞窟版若有則用 `mine`），BGM `boss`，不可逃跑）— 設計見 6.5。戰鬥中的劇情插入（阿蘭的熱油）見 6.5。
16. [勝利後。虎姑婆倒在地上。她的身體一點一點縮小，變回一隻瘦得只剩皮包骨的老虎。]
17. 虎姑婆：「……好冷……」
18. 虎姑婆：「以前……山裡很安靜……」
19. 虎姑婆：「我只是……好餓……」
20. [老虎的眼睛慢慢閉上。牠的身體化作一陣腥風，散進洞窟的黑暗裡。原地留下一枚發黃的虎牙。] → 獲得 **虎牙墜**
21. 白芷(sad)：「……」
22. 紅纓(serious)：「……可憐，也不能吃小孩。」
23. 白芷(sad)：「嗯。……可是，還是可憐。」
24. [紅纓挑開最後一個竹籠。阿弟仔撲進最近的人懷裡——是紅纓。]
25. 阿弟仔(cry)：「嗚哇——！」
26. 紅纓(surprise)：「欸、欸！不要哭！不要擦鼻涕在我身上！」
27. 紅纓(shy)：「……好啦，好啦。不怕了。」
28. [紅纓僵硬地拍著阿弟仔的背。星河和白芷相視一笑。]
29. 阿蘭（洞口方向）：「阿弟仔——！」
30. [阿蘭衝進來，抱住弟弟。兩姊弟哭成一團。]
31. 星河(smile)：「……好。回家吧。」
32. `flag: ch2_tiger_beaten` → 淡出 → 2-16

### 2-16　平安燈
**觸發**：緊接 2-15。`warp('pingxi', 23, 12, 'down')`，時段 Q3（夜）。

1. [平溪，夜。山路口。星河他們帶著四個孩子走下山。]
2. [廟埕上，守夜的人看到他們，愣了一下——然後大叫起來。]
3. 搜山的人：「回來了！囝仔回來了——！」
4. [家家戶戶的門打開。阿春嬸、阿石伯、小春的阿嬤衝出來，把孩子緊緊抱住。哭聲、笑聲。]
5. 阿春嬸(cry)：「阿蘭！阿弟仔！」
6. 阿石伯(cry)：「石頭……你這個……你這個……」
7. 石頭(cry)：「我、我沒有哭……阿爸你才哭……」
8. 小春的阿嬤(cry)：「小春啊……阿嬤的心肝……」
9. 李庄頭(cry)：「……好。好。好。」
   - **若持有「阿興的信」**：在這裡插入 4.2 的「念信」場景（周老伯、周老嬸也在人群中）。
10. 李庄頭(serious)：「吳阿公！天燈！」
11. 吳阿公(laugh)：「早就準備好了！」
12. [吳阿公捧出一盞大天燈。白色的棉紙上，四面寫著：「平安」、「歸來」、「合境平安」、「平溪」。]
13. 吳阿公(serious)：「山上的人，還不知道囝仔回來了。」
14. 吳阿公(serious)：「平溪的老規矩——放天燈，給山上的人報平安。」
15. [吳阿公看向星河。]
16. 吳阿公(smile)：「少年仔，你問過我天燈是怎麼來的。現在可以講了。」
17. 吳阿公(normal)：「很久很久以前，這座山谷常常有土匪來搶。」
18. 吳阿公(normal)：「土匪一來，庄裡的人就揹著囝仔、扶著老人，逃進深山裡躲。」
19. 吳阿公(serious)：「山裡沒有路，也沒有消息。躲的人不知道土匪走了沒，不敢回家。」
20. 吳阿公(serious)：「留在庄裡顧家的人，等土匪走了，就紮一盞燈，點火，放上天。」
21. 吳阿公(smile)：「山上的人一看到天上的燈，就知道——『平安了，可以回家了。』」
22. 吳阿公(smile)：「所以天燈，我們平溪人也叫它『平安燈』。」
23. 吳阿公(laugh)：「也有人說是孔明發明的，叫孔明燈。孔明是孔明，我們是我們！」
24. 吳阿公(normal)：「後來，大家就在元宵放天燈，在上面寫願望，求一年平安。」
25. 吳阿公(serious)：「可是今暝不是元宵。今暝放的，是最早的那一種天燈。」
26. 吳阿公(smile)：「叫山上的人——回家。」
27. [吳阿公點燃燈底那團沾了油的金紙。火光一亮，燈身慢慢鼓起來、變輕，從他的手裡浮起，升上夜空。]
28. [山上的鑼聲，停了。]
29. [然後，遠遠地，傳來一陣歡呼。鑼聲再度響起——這一次，敲得又快又急。是在回答。]
30. 白芷(surprise)：「……他們看到了。」
31. 紅纓(smile)：「……嗯。」
32. 李庄頭(laugh)：「好！大家，放天燈！感謝山神、感謝土地公、感謝三位恩人！」
33. [村民們捧出一盞盞天燈。吳阿公分給三人各一盞，還有毛筆和墨。]→ 獲得 **天燈**（重要物品，本段結束時消耗）
34. 吳阿公(smile)：「來，你們也寫。四面都可以寫，願望寫越多，天公伯越知道。」
35. **若 `ch2_letter_read`**（4.2）：[周老伯和周老嬸也捧著一盞燈。周老伯一筆一筆、很慢地寫著——是吳阿公握著他的手教的——「阿興」。]
36. [紅纓寫得很快，寫完就把那一面轉過去。]
37. 星河(think)：「寫什麼？」
38. 紅纓(angry)：「不關你的事！」
39. [燈轉動時，露出一角：「爹、娘、哥哥……」]
40. 星河(sad)：「……」
41. [另一面，寫著四個字：「找到鬼面」。再另一面，字寫得特別小——]
42. 星河(think)：「……『想養一隻胖胖的貓』？」
43. 紅纓(shy)：「看什麼看！」
44. [白芷拿著筆，看著空白的燈紙，很久。]
45. 白芷(think)：「我不知道要寫什麼。」
46. 星河(smile)：「寫妳最想要的。」
47. 白芷(think)：「最想要的……」
48. [白芷一筆一筆寫得很慢，很認真。]
49. [燈紙上：「我想知道我是誰。」]
50. 星河(think)：「……」
51. [星河背過身，用身體擋住，很快地在自己的燈上寫了一行字。]
52. [（只給玩家看的特寫）燈紙上：「希望她不要想起來就離開。」]
53. [星河看著那行字，愣住了。]
54. 星河(think)：「……我在寫什麼啊。」
55. [他伸手想把它塗掉。墨已經乾了。]
56. [他嘆了口氣，在其他三面寫上：「陳伯長命百歲」、「變成劍仙」、「大家平安」。]
57. 吳阿公(serious)：「點火——！」
58. [`bgm: pingxi`（漸強）。數百盞天燈，一盞接一盞，從平溪的山谷裡升起。燈光照亮了山壁、竹林、溪水。它們越飛越高，越飛越小，最後混進星星裡，分不清哪些是燈，哪些是星。]
59. **若 `ch2_letter_read`**：
    1. [周家的那盞燈，飛得特別慢，特別穩。它在半空中停了一下，好像在等誰。]
    2. [白芷忽然抬起頭。]
    3. ？？？（年輕男人的聲音，很遠）：「……阿爸，阿母。我收到了。」
    4. ？？？：「要好好吃飯喔。」
    5. 白芷(surprise)：「……」
    6. [那盞燈，輕輕地，往海的方向飄去了。]
    7. → **心燈 +1：寄到了的信**（`S.lantern('xd_letter', '寄到了的信')`）
    8. 白芷(cry)：「……星河。他說，他收到了。」
    9. 星河(surprise)：「誰？」
    10. 白芷(smile)：「……阿興。」
60. [`bgm: love`（crossfade）]
61. 白芷(smile)：「……好像倒過來的海。」
62. 星河(think)：「倒過來的海？」
63. 白芷(think)：「八斗子那天晚上，海上全都是燈。」
64. 白芷(smile)：「現在，天上全都是燈。」
65. 白芷(think)：「海上的燈，是送人走的。天上的燈……是叫人回家的。」
66. 星河(smile)：「……嗯。」
67. 白芷(think)：「星河，你寫了什麼？」
68. 星河(surprise)：「……秘、秘密。」
69. 白芷(smile)：「我寫的是『我想知道我是誰』。」
70. 星河(think)：「……我知道。我看到了。」
71. 白芷(think)：「你覺得，我會想起來嗎？」
72. 星河(think)：「……」
73. 星河(smile)：「會吧。一定會的。」
74. [他笑著說。可是他沒有看她，而是一直看著天上——那盞寫著秘密的燈，越飛越遠。]
75. 紅纓(normal)：「……喂，你們兩個。」
76. 紅纓(smug)：「看天燈可以，不要看到忘記吃飯。月娘說今暝有雞湯。」
77. 白芷(surprise)：「雞湯！」
78. 星河(laugh)：「走走走！」
79. 失去 **天燈**、`flag: ch2_tiandeng_night`、淡出（全員完全恢復）→ 2-17

### 2-17　翌晨：庄頭的謝禮
**觸發**：緊接 2-16（`pingxi_inn` → 廟埕）。時段 Q4。`S.titleCard('', '七月十七')`

1. [清晨。廟埕上還留著昨夜的金紙灰。李庄頭帶著幾個庄民站在那裡。]
2. 李庄頭(smile)：「洛姑娘、星河、白芷姑娘。這是庄裡說好的賞金。」
3. 紅纓(normal)：「……我不要。」
4. 李庄頭(surprise)：「欸？」
5. 紅纓(serious)：「庄裡這幾天，為了找孩子，大家田也沒種，活也沒做。」
6. 紅纓(normal)：「一半留給孩子們。另一半……給這兩個笨蛋當盤纏。他們窮。」
7. 星河(angry)：「我們哪裡窮了！」
8. 白芷(think)：「我們很窮嗎？」
9. 星河(sad)：「……有一點。」
10. → `gold +400`
11. 李庄頭(smile)：「……這個姑娘喔。」
12. 李庄頭(normal)：「你們要去淡水？那就從十分瀑布下面坐船，順著基隆河一路下去。」
13. 李庄頭(smile)：「船伕阿河，我已經叫人去跟他講了。」
14. `flag: ch2_dawn`、`objective('跟平溪的大家道別，到十分瀑布搭船')`

### 2-18　十分瀑布・水跟光
**觸發**：進入 `shifen_falls`，`ch2_dawn`（auto，once）。

1. [十分瀑布。整條溪水在這裡往下一跳，摔成一片白色的簾子。轟隆隆的水聲。水霧裡，掛著一道彩虹。]
2. 星河(surprise)：「哇……好大！」
3. 紅纓(smug)：「……水聲這麼大，連你的聲音都聽不到。很好。」
4. 星河(angry)：「喂！」
5. [紅纓自己走去碼頭找船伕。星河和白芷在大石頭上坐下，看著瀑布。]
6. 白芷(think)：「星河。彩虹是什麼做的？」
7. 星河(think)：「水……跟光吧。」
8. 白芷(smile)：「水，跟光。」
9. 白芷(smile)：「……就像你跟我。」
10. 星河(surprise)：「欸？」
11. 白芷(think)：「我是水。你是火——」
12. 紅纓（遠處）(serious)：「火跟光不一樣吧。」
13. 星河(surprise)：「妳不是去碼頭了嗎！」
14. 白芷(think)：「……那就是，很像的東西。」
15. 星河(shy)：「……」
16. 紅纓（遠處）(smug)：「笨蛋，臉紅了。」
17. 星河(angry)：「是瀑布的水噴到臉上啦！」
18. [白芷笑了。水霧裡的彩虹，好像也跟著亮了一點。]
19. `objective('到碼頭找船伕阿河')`

### 2-19　順著基隆河，往淡水
**觸發**：與阿河對話並選「出發」。

1. 阿河(smile)：「三位，坐穩囉！這條是基隆河！」
2. 阿河(normal)：「從平溪的山裡出發，彎彎曲曲，經過錫口、經過士林——」
3. 阿河(normal)：「到關渡，跟淡水河碰頭，再一路流到淡水，出海。」
4. 白芷(smile)：「水也在旅行。」
5. 阿河(laugh)：「是啊！水最會旅行了！」
6. 紅纓(serious)：「……觀音山，就在淡水的對岸。」
7. 星河(serious)：「清虛真人。還有……鬼面。」
8. [紅纓沒有說話，只是握緊了槍。]
9. [船離開碼頭。瀑布的聲音，慢慢遠了。]
10. [鏡頭拉高：基隆河在山谷間彎彎曲曲，像一條銀色的線，往西方延伸。]
11. `S.narrate`：
    - 「基隆河從平溪的山裡出發，一路往西，流向淡水。」
    - 「河的盡頭，是海。海的對面，是觀音山。」
12. `flag: ch2_done`、`S.titleCard('第二章　完')` → 第三章（淡水）

---

## 4. 支線

### 4.1　心燈③「山中的呼喚」 `q_woodcutter`
- **條件**：2-2 起；`ch2_done` 前。
- **階段**：0 = 拿到銅鑼；1 = 救出阿山（臨時隨從）；done = 父子重逢。
- **步驟**：
  1. 2-2：在 `mistforest_n` 遇見阿竹 → 獲得 **銅鑼**。
  2. 2-7：靈視中穿過 `mistforest_s` 的幻象樹 → 魔神仔戰 → 敲鑼喊名字，救出阿山。
     - 沒有靈視時調查幻象樹的提示：星河(think)：「阿竹說他阿爸是在霧林不見的……這幾棵樹的影子怪怪的。用靈視看看？」
  3. **重逢**（阿山跟隨中進入 `pingxi`：Q1 在北口；Q2 以後在樵夫家門口）：
     1. [路邊，一個少年提著燈籠坐著打瞌睡。（Q1：北口 (23,3)；Q2：家門口 (43,20)）]
     2. 阿山(surprise)：「……阿竹？」
     3. [少年驚醒。燈籠掉在地上。]
     4. 阿竹(surprise)：「……阿爸？」
     5. 阿竹(cry)：「阿爸——！」
     6. [阿竹撲進阿山懷裡。聽到聲音，阿山嫂從家裡跑了出來。]
     7. 阿山嫂(cry)：「你這個死人！三天！三天去哪裡了！」
     8. 阿山(cry)：「……去吃雞腿了。」
     9. 阿山嫂(angry)：「啥！？」
     10. 阿山(laugh)：「哈……哈哈……我回來了。我回來了。」
     11. 阿竹(cry)：「哥哥、姊姊，謝謝你們！」
     12. 星河(smile)：「阿竹的鑼，很有用喔。」
     13. 白芷(smile)：「他聽到了。你的鑼，還有他的名字。」
     14. → **心燈 +1：山中的呼喚**（`S.lantern('xd_woodcutter', '山中的呼喚')`）
     15. 阿山(smile)：「恩人，這些是我在山裡採的。不是雞腿，是真的。」→ 獲得 **山蘇 ×2**、**金創藥 ×2**
     16. `quest q_woodcutter done`
- **銅鑼的額外用途**（可選實作）：在霧林地圖從選單使用「銅鑼」→ 30 秒內魔神仔系遊蕩敵人會逃離玩家（訊息：「噹——！魔神仔們摀著耳朵逃走了。」）。

### 4.2　心燈④「寄到了的信」 `q_letter`
- **條件**：Q2 起；`ch2_done` 前（虎姑婆洞窟在 `ch2_tiger_beaten` 後仍可進入）。
- **階段**：0 = 聽周家說阿興的事；1 = 持有阿興的信；2 = 念信完成（`ch2_letter_read`）；done = 心燈。
- **步驟**：
  1. 在 `pingxi_oldhouse` 與周家兩老對話（Q2）：
     1. 周老嬸(smile)：「坐，坐。家裡沒什麼好招待的。」
     2. 星河(think)：「阿嬸，門口那盞『興』字的燈……」
     3. 周老伯(normal)：「我們的兒子，阿興。兩年前去雞籠，在船上做事。」
     4. 周老伯(smile)：「每個月都會託淡蘭古道的挑夫，帶一封信回來。」
     5. 周老嬸(sad)：「我們不識字，都是請吳阿公念給我們聽。」
     6. 周老伯(sad)：「上個月……信沒來。」
     7. 周老伯(sad)：「然後雞籠的人帶話來，說阿興那艘船，過黑水溝的時候……沉了。」
     8. 周老嬸(cry)：「可是，沒看到人，就不算……」
     9. 周老嬸(cry)：「所以我每天暗時都點燈。怕他回來，看不到路。」
     10. 白芷(sad)：「……」
     11. 周老伯(sad)：「最後那封信，到底寫了什麼……我們到現在都不知道。」
     12. → `quest q_letter (0)`
     - 若先聽過挑夫阿全的話（`ch2_bundle_hint`）：星河(think)：「……阿全說，上個月有一個挑夫的擔子丟在山裡。難道……」
  2. `tiger_den` 西北小室 (3,4)：調查挑夫的擔子。
     1. 「一副挑夫的擔子。扁擔斷了，兩個竹簍裡塞滿布包、藥材，和一疊用油紙包好的信。」
     2. [星河翻了翻。其中一封，信封上寫著歪歪斜斜的字：「平溪　周家　阿爸阿母　親啟」。]
     3. 星河(surprise)：「……這是周阿伯家的信！」
     4. → 獲得 **阿興的信**、**挑夫的擔子**、`quest q_letter (1)`
  3. （可選）把擔子還給挑夫阿全：
     1. 阿全(surprise)：「這、這是阿福的擔子！你們在哪裡找到的？」
     2. 星河(normal)：「虎姑婆的洞裡。」
     3. 阿全(laugh)：「哈！老虎也想看信嗎！」
     4. 阿全(serious)：「多謝！這些信，我會一封一封送到。這是挑夫的面子！」
     5. → 失去 **挑夫的擔子**、獲得 **挑夫草鞋**、`gold +150`、`flag: ch2_bundle_returned`
  4. **念信**（持有阿興的信時：2-16 第 9 步後自動插入；或 Q4 在周家對話）：
     1. 星河(serious)：「周阿伯、周阿嬸。這個……是在虎姑婆的洞裡找到的。」
     2. 周老伯(surprise)：「……這是……」
     3. 周老嬸(surprise)：「阿興的字！是阿興的字！」
     4. 周老伯(sad)：「……少年仔。我們兩個老的，不識字。」
     5. 周老伯(sad)：「你……可以念給我們聽嗎？」
     6. 星河(serious)：「……好。」
     7. [星河打開信。字歪歪斜斜的，像是在搖晃的船上寫的。]
     8. [信的內容（`S.narrate`，手寫字體，星河的聲音）：]
        - 「阿爸、阿母：」
        - 「我在雞籠一切都好。頭家人很好，船上的飯也吃得飽。」
        - 「下個月船要開去唐山，來回要半年。」
        - 「等我回來，要給阿母買一對金耳鉤，給阿爸買一頂新斗笠。」
        - 「阿爸的腰，記得貼膏藥。阿母的眼睛，暗時莫做針線。」
        - 「人家說，黑水溝很兇。六個去，三個留，一個回頭。」
        - 「……若是我沒有回來，你們莫一直等我。」
        - 「要好好吃飯。」
        - 「　　　　　　　　　　不孝子　阿興」
     9. [星河念完了。很久，沒有人說話。]
     10. 周老嬸(cry)：「……這個憨囝仔……」
     11. 周老嬸(cry)：「自己都不知道漂到哪裡去了，還叫我們好好吃飯……」
     12. 周老伯(cry)：「……新斗笠。我那頂斗笠，破了好幾年，一直捨不得換……」
     13. 周老伯(sad)：「……原來，他在等著買給我。」
     14. 白芷(sad)：「……」
     15. 周老伯(serious)：「老伴。我們也放一盞燈。」
     16. 周老伯(serious)：「寫阿興的名字。告訴他——信，我們收到了。」
     17. 周老嬸(cry)：「……嗯。」
     18. → 失去 **阿興的信**、`flag: ch2_letter_read`、`quest q_letter (2)`
  5. **心燈**：
     - 在 2-16 天燈之夜念信 → 第 59 步（周家的燈、阿興的聲音）→ **心燈 +1：寄到了的信**（`xd_letter`）、`quest q_letter done`
     - 若在 Q4 才念信 → 念完之後，[周家兩老在門口點起一盞天燈。晨光裡，那盞燈慢慢升起，往海的方向飄去。] → 白芷聽到同樣的聲音（2-16 第 59 步的 3–4、8–10）→ **心燈 +1：寄到了的信**

### 4.3　趣味支線「紅纓的廚房」 `q_hy_kitchen`
- **條件**：Q2 起首次進入 `pingxi_inn`（auto，once）；`ch2_done` 前。不給心燈。
- **開場**：
  1. 紅纓(serious)：「月娘。灶腳修好了沒？」
  2. 月娘(surprise)：「……修、修好了。」
  3. 紅纓(normal)：「那今天換我煮。庄裡的人這麼照顧我，我要報答。」
  4. 月娘(sad)：「……」
  5. 星河(think)：「（小聲）月娘，妳的鍋子……」
  6. 月娘(sad)：「（小聲）……我再買新的就是了。」
  7. 紅纓(serious)：「我要做『山產炒』。缺三樣：竹筍、溪蝦、山蘇。」
  8. 紅纓(serious)：「你們兩個，幫我找來。」
  9. 星河(think)：「為什麼是我們……」
  10. 紅纓(angry)：「因為你們吃最多！」
  11. → `quest q_hy_kitchen (0)`
- **食材**：
  - **竹筍**：`pingxi` 竹林 (43,5)、`tiger_lair` 竹筍坡 (31,35) 採集，或打倒竹精（20%）。採集文字：「地上冒出一支筍尖。」→ 星河(smile)：「……陳伯要是知道我拿螢火挖竹筍，一定罵死我。」（第一次）
  - **溪蝦**：與阿溪對話 → 阿溪(smile)：「翻石頭！蝦子會跳出來！」→ 河邊 (8,25) 調查：選項「左邊的石頭／中間的石頭／右邊的石頭」（隨機一顆有蝦，最多三次；三次都沒中，阿溪(laugh)：「哈哈，分你一點啦！」）→ 獲得 **溪蝦**
  - **山蘇**：`mistforest_s` 山蘇坡 (4,32) 採集，或樵夫阿山的謝禮。
- **料理**（三樣都有時，與月娘對話）：
  1. [灶腳。紅纓捲起袖子，把竹筍、溪蝦、山蘇一股腦丟進鍋裡。]
  2. 紅纓(serious)：「火要大！洛家的規矩：做什麼都要全力！」
  3. [轟——！灶口噴出一團火。黑煙滾滾。`shake(4,0.3)`]
  4. 月娘(surprise)：「我的灶——！」
  5. [淡出。淡入：桌上擺著一盤……黑色的東西。]
  6. 紅纓(smug)：「好了！洛家特製『山產炒』！」
  7. 星河(think)：「……這是炭吧。」
  8. 紅纓(angry)：「是焦香！」
  9. 白芷(think)：「我吃吃看。」
  10. 星河(surprise)：「白芷！不要勉強！」
  11. [白芷夾起一塊，放進嘴裡，慢慢地嚼。嚼了很久。]
  12. 白芷(think)：「……」
  13. 白芷(think)：「……原來，人間的食物，也可以是一種……修行。」
  14. 紅纓(cry)：「……妳們不用勉強啦！」
  15. [月娘噗哧一聲笑了出來。]
  16. 月娘(laugh)：「好啦，竹筍跟蝦子還有剩，我來煮一鍋湯。洛姑娘，妳幫我顧火。」
  17. 月娘(smile)：「……小火就好。」
  18. 紅纓(shy)：「……嗯。」
  19. [淡出。淡入：一鍋清甜的竹筍溪蝦湯。三人吃得乾乾淨淨。]
  20. 紅纓(shy)：「……這個湯，也有我顧的火。」
  21. 白芷(smile)：「嗯。很好喝。」
  22. 星河(smile)：「火顧得很好。」
  23. 紅纓(angry)：「……少、少囉嗦！」
  24. → 失去三樣食材；獲得 **紅纓特製山產炒（焦）×3**、**竹筍溪蝦湯 ×2**；`quest q_hy_kitchen done`
- 「紅纓特製山產炒（焦）」的說明文字：「洛紅纓的心血結晶。外觀與口感都像炭。據說丟出去比吃下去有用。」

---

## 5. 商店・寶箱・謎題

### 5.1 商店（文）
| 商店 id | 地點 | 商品 |
|---|---|---|
| `shop_pingxi_store` 阿貴商號・雜貨 | `pingxi_store` | 草仔粿 20、龍眼乾 15、金創藥 60、青草茶 40、解毒草 15、醒神香 25、艾草束 30、鹽米 20、還魂香 150 |
| `shop_pingxi_arms` 阿貴商號・武具 | `pingxi_store` | 竹甲 280、山豬皮背心 360、綁腿 160、護腕 120、竹笠 80 |
| `shop_pingxi_indigo` 阿藍姐染坊 | `pingxi` 染坊 | 菁布頭巾 180、藍染短衫 150、菁染長衫 260 |
| `shop_pingxi_inn` 十分客棧 | `pingxi_inn` | 山產便當 50、雞湯 70；住宿 30 |
| `shop_pingxi_tiandeng` 吳家天燈舖（Q4） | `pingxi_tiandeng` | 天燈吊飾 80 |

### 5.2 寶箱
| 地圖 | 座標 | 內容 | 備註 |
|---|---|---|---|
| `mistforest_n` | (34,9) | 金創藥 ×2 | |
| `mistforest_n` | (5,7) | 七彩靈蕈 ×1、青草茶 ×1 | 靈視限定 |
| `mistforest_n` | (36,32) | 獵人的護符 | 靈視限定；老獵人的魂對話後出現 |
| `mistforest_s` | (9,12) | 解毒草 ×3 | |
| `mistforest_s` | (26,40) | 綁腿 | |
| `mistforest_s` | (35,38) | 還魂香 ×1 | 靈視限定 |
| `pingxi` | (46,2) 竹林深處 | 龍眼乾 ×3 | |
| `tiger_lair` | (33,33) | 醒神香 ×2 | |
| `tiger_lair` | (4,37) | 300 文 | |
| `tiger_den` | (6,4) | 金創藥 ×2 | 挑夫小室 |
| `tiger_den` | (28,21) | 山豬皮背心 | 幻牆後的東室 |

### 5.3 謎題：魔神仔的迷陣（`mist_loop`）
- **狀態**：`vars.loopCount`（無解階段的循環次數）、`vars.loopStep`（0–4）、`ch2_grove_open`、`ch2_lingshi`、`ch2_maze_solved`。
- **北口**（11–12, 0）：任何時候都回到 `mistforest_n` (19,42) 朝上（讓玩家可以回頭）。
- **無解階段**（`!ch2_lingshi`）：走出南、東、西任一出口 → 淡出淡入，回到空地（出東口 → 出現在西口 (1,9) 朝右；出西口 → 東口 (22,9) 朝左；出南口 → 北側 (11,3) 朝下）；`loopCount++`；觸發 2-3 對應台詞；第 3 次 → 2-4。
- **解謎階段**（`ch2_lingshi && !ch2_maze_solved`）：
  - 正確順序：**東 → 南 → 南 → 西**。
  - 每走對一步：`loopStep++`，同樣淡出淡入回到空地（位置同上）；靈視中，空地上會出現通往下一個正確出口的**銀色腳印**（`spirit:true` 的地面物件，`if: s => s.vars.loopStep === k`，k = 0..3）。
  - 走錯：`loopStep = 0`，星河(think)：「……又回來了。腳印不是往這邊。」
  - 第 4 步（西口）走對 → 2-6 解開 → `mistforest_s`。
  - 沒有靈視也能照順序走出去（腳印只是看不見）。
- **解開之後**：南口 → `mistforest_s` (19,1)；東、西口 → 回到空地（無害）；北口 → `mistforest_n`。
- **視覺提示**：靈視中樟樹上的紅布條像一條紅舌頭；每走對一步，紅舌頭就縮短一截（4 段，`spirit` 物件依 `loopStep` 切換）。

### 5.4 小遊戲：紮天燈（吳阿公，Q2）
- 三個選擇題，依序回答；答錯時吳阿公糾正，重新回答同一題（沒有懲罰）。
  1. 「先做什麼？」**竹篾紮成圓口**／先寫願望／先點火
     - 錯（寫願望）→ 吳阿公(laugh)：「燈都還沒有，你要寫在空氣上喔？」
     - 錯（點火）→ 吳阿公(angry)：「你要燒我的店喔！」
  2. 「然後？」**糊上棉紙，做成燈身**／塗上桐油／綁上鞭炮
     - 錯（桐油）→ 吳阿公(think)：「塗桐油是做雨傘啦。燈要透氣。」
     - 錯（鞭炮）→ 吳阿公(surprise)：「那是鹽水在玩的！」
  3. 「燈底下放什麼當燃料？」**沾了油的金紙**／木炭／蠟燭
     - 錯（木炭）→ 吳阿公(laugh)：「木炭那麼重，燈飛得起來才怪。」
     - 錯（蠟燭）→ 吳阿公(normal)：「蠟燭火太小，燈鼓不起來。」
- 全部答對：吳阿公(laugh)：「好手！陳渡教得不錯！」→ 獲得 **天燈吊飾**、`flag: ch2_tiandeng_quiz`

### 5.5 對話謎題：阿蘭的三個問題（`tiger_lair`，2-12）
- **第一題**：阿蘭(serious)：「伸手出來！虎姑婆的手有毛！」選項：**星河伸手**／**紅纓伸手**／**白芷伸手**（皆過關，台詞不同）
  - 星河 → 阿蘭(think)：「……手好髒。可是沒有毛。」→ 星河(sad)：「剛剛挖過竹筍啦……」
  - 紅纓 → 阿蘭(think)：「好多繭……像我阿爸砍柴的手。」→ 紅纓(smug)：「練槍練的。」
  - 白芷 → 阿蘭(think)：「好白、好冰……虎姑婆的手是熱的。好，沒有毛。」
- **第二題**：阿蘭(serious)：「阿嬤的故事裡，姊姊最後是怎麼打敗虎姑婆的？」
  - **用熱油** → 阿蘭(smile)：「對！你們聽過阿嬤的故事！虎姑婆不會聽故事！」
  - 用劍 → ✗
  - **用芋圓**（白芷回答）→ 阿蘭(think)：「……芋圓？」→ 白芷(smile)：「芋圓很好吃。老虎吃了，會變好。」→ 阿蘭(laugh)：「哈哈……虎姑婆才不會講這麼笨的話！」→ 過關
- **第三題**：阿蘭(serious)：「最後一題！你們要帶我去哪裡？」
  - **回家** → 通過
  - 去姑婆家 → ✗
  - 去吃好吃的 → 阿蘭(angry)：「虎姑婆也說要帶我去吃好吃的！」→ ✗
- **答錯（✗）**：[啪！一顆毬果打在星河頭上。] 星河(hurt)：「好痛！」（HP −1）→ 阿蘭(angry)：「錯了！重來！」→ 重答同一題。
- 第三次答錯時，紅纓(think)：「……笨蛋，你是故意的吧。」

### 5.6 幻象規則（本章通用）
- `illusion:true` 的物件（`mistforest_s` 幻象樹、`tiger_den` 幻牆）：靈視中消失且不阻擋。
- `spirit:true` 的物件／NPC／寶箱：只在靈視中顯示與互動。
- 靈視時間：七彩靈蕈 120 秒（選單使用）；2-5 演出結束時給 120 秒。
- 靈視結束時（`vars.vision` 歸零）若玩家正站在幻象物件的格子上：把玩家推回最近的可行走格（`computeSolid` 之後檢查）。

---

## 6. 敵人與頭目

### 6.1 各地圖敵人
| 地圖 | 遊蕩敵人（部隊） |
|---|---|
| `mistforest_n` | `t_mf_moshen2`、`t_mf_snake`、`t_mf_monkey`、`t_mf_mush`、`t_mf_boar`、`t_mf_mix` |
| `mistforest_s` | `t_mf_moshen3`、`t_mf_boar`、`t_mf_snake`、`t_mf_mush`、`t_mf_monkey`、`t_mf_mix`（2-9 後 +`t_mf_moshen2`）；固定戰 `t_mf_woodcutter(_v)`、`t_hongying_duel`、`t_mf_ambush` |
| `tiger_lair` | `t_lair_bamboo` ×2、`t_lair_mix` ×2、`t_lair_monkey`、`t_lair_boar` |
| `tiger_den` | `t_den_boar` ×2、`t_den_monkey` ×2、`t_den_mix`；固定戰 `t_tiger_granny` |

### 6.2 一般敵人數值（建議值）
| id | 名稱 | art | lv | hp | mp | atk | def | mag | spd | luk | 屬性 | 弱 | 抗 | exp | 文 | 掉落 | 技能 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `moshenzi` | 魔神仔 | `moshenzi`（新） | 5 | 110 | 20 | 18 | 12 | 16 | 20 | 12 | 木 | 金 | 土 | 40 | 18 | 草仔粿 15%、七彩靈蕈 3% | 搔抓（phys 0.9, w5）；牽走（敵單 stun 1 回合 30%，訊息「XX 被牽著鼻子走……」, w2）；嘻笑（敵全 spdDown 2 回合 40%, w3） |
| `moshenzi_ph` | 魔神仔（幻影） | `moshenzi`（alpha 0.55） | 5 | 1 | 0 | 18 | 0 | 16 | 20 | 0 | 木 | — | — | 0 | 0 | — | 搔抓；**特殊**：受到任何攻擊即消散 |
| `mushroom_sprite` | 蕈精 | `mushroom_sprite`（新） | 6 | 130 | 30 | 14 | 14 | 22 | 12 | 6 | 木 | 金 | 土 | 46 | 16 | 七彩靈蕈 8%、解毒草 15% | 孢子（敵全 poison 30%, w4）；幻孢（敵單 trance 2 回合 40%, w2）；蕈光（mag 木 1.0, w4） |
| `bamboo_spirit` | 竹精 | `bamboo_spirit`（新） | 7 | 160 | 10 | 22 | 22 | 10 | 14 | 5 | 木 | 金 | 土 | 55 | 20 | **竹筍 20%** | 竹刺（phys 1.1, w5）；節節高（隨機 phys 0.6 ×2, w3）；竹陣（我方全 defUp 2 回合, w2） |
| `green_snake` | 青竹絲 | `green_snake`（新） | 6 | 90 | 0 | 24 | 10 | 8 | 26 | 8 | 木 | 金 | 土 | 42 | 14 | 解毒草 20% | 毒牙（phys 1.0＋poison 50%, w7）；盤身（自身 defUp, w3） |
| `boar_spirit` | 山豬精 | `boar_spirit`（新） | 7 | 240 | 0 | 30 | 18 | 5 | 12 | 4 | 土 | 木 | 水 | 70 | 30 | 山豬皮 30%、山豬皮背心 3% | 獠牙（phys 1.0, w6）；衝撞（phys 1.5，前一回合預告「山豬精刨著地……」, w4） |
| `macaque` | 獼猴精 | `macaque`（新） | 6 | 120 | 0 | 22 | 12 | 6 | 28 | 20 | 金 | 火 | 木 | 48 | 26 | 龍眼乾 20% | 丟果子（phys 0.9, w5）；偷（偷走隨機一個消耗品；打倒牠就拿回來, w3）；開溜（偷到東西後 40% 逃走, w2） |

部隊（bg `forest`，bgm `battle`）：
- `t_mf_moshen2` [moshenzi ×2]；`t_mf_moshen3` [moshenzi ×3]；`t_mf_snake` [green_snake ×2]；`t_mf_mush` [mushroom_sprite ×2]；`t_mf_boar` [boar_spirit]；`t_mf_monkey` [macaque ×2]；`t_mf_mix` [moshenzi, mushroom_sprite, green_snake]
- `t_mf_ambush` [moshenzi ×4]（flee:false）
- `t_lair_bamboo` [bamboo_spirit ×2]；`t_lair_mix` [bamboo_spirit, green_snake, green_snake]；`t_lair_monkey` [macaque ×3]；`t_lair_boar` [boar_spirit ×2]
- `t_den_boar` [boar_spirit ×2]；`t_den_monkey` [macaque ×3]；`t_den_mix` [boar_spirit, macaque, macaque] — bg `mine`（洞窟）

### 6.3 小頭目：魔神仔頭 `moshenzi_lead`（救樵夫）
- **外觀**：art `moshenzi` variant 1、scale 1.4。比其他魔神仔高一個頭，紅臉皺成一團笑，頭上綁滿紅布條，手上拎著一隻「雞腿」（靈視中看得出是一把草）。
- **部隊**：`t_mf_woodcutter` [moshenzi_lead, moshenzi_ph, moshenzi_ph]；`t_mf_woodcutter_v`（進入戰鬥時靈視有效）[moshenzi_lead]。bg `forest`、bgm `battle`、flee:false。
- **數值**：lv 7、hp 420、mp 40、atk 22、def 14、mag 18、spd 22、luk 14；木、弱金、抗土；exp 160、文 60；掉落 七彩靈蕈 ×1（必定）。
- **技能**：迷魂笑（敵全 stun 1 回合 25%, w3）；餵雞腿（敵單 poison＋stun 1 回合 30%，訊息「魔神仔往 XX 嘴裡塞了一把草……」, w3）；分身（場上沒有幻影時，每 3 回合召回 2 個 `moshenzi_ph`, w—）；搔抓（w4）。
- **提示**：戰鬥中使用七彩靈蕈（幻境）的角色，攻擊會自動避開幻影、打中本體。

### 6.4 頭目（決鬥）：洛紅纓 `hongying_duel`
- **外觀**：sprite `hongying` 的戰鬥姿態（作為敵人時 `flip` 面向右）。
- **部隊**：`t_hongying_duel` [hongying_duel]；bg `forest`（黃昏色調若可）；bgm `boss`；boss:true；flee:false；**noGameOver**（全滅 → 結果 B）；**endAt: HP ≤ 35%**（→ 結果 A）。
- **數值**：lv 7、hp 950、mp 30、atk 30、def 16、mag 8、spd 22、luk 10；**金**、弱 火、抗 木；exp 250、文 0。
- **技能**：
  - 紅纓點（phys 1.2 單體, w5）
  - 橫掃千軍（phys 0.8 全體, w3）
  - 蓄勢（自身 atkUp 2 回合；下一擊 ×1.5，頭上「！」預告「紅纓壓低了槍身……」, w2）
  - 回馬槍（HP<60% 起：受到物理攻擊時 30% 反擊 phys 0.6）
- **AI**：優先攻擊白芷（她以為白芷是妖女）；星河使用「防禦」時，紅纓下一回合必定改打星河（「讓開，笨蛋！」）。
- **戰鬥台詞**：開場「妖女，受死！」；首次攻擊星河「笨蛋！你被她迷住了！」；星河替白芷擋刀（星河處於防禦且白芷被指定為目標時）「……你這笨蛋，竟然護著她？」；HP<60%「……有兩下子。」
- **設計意圖**：教玩家「火剋金」——星河的螢火斬特別有效；紅纓速度快、傷害高，白芷要專心補血。戰鬥短（約 5 回合）。

### 6.5 頭目：虎姑婆 `tiger_granny`
- **外觀**（art 已存在：`tiger_granny`）：phase 1 是佝僂的老婦人——花布衫、髮髻、拐杖，皺紋裡的眼睛發著黃光，衣襬下露出一截尾巴；phase 2 撐破衣衫，變成一隻巨大、瘦骨嶙峋的老虎精，脖子上還掛著斷掉的念珠，嘴角掛著口水；phase 3 毛髮豎起、眼睛轉紅。
- **部隊**：`t_tiger_granny` [tiger_granny]；bg `forest`（若有洞窟背景則用 `mine`）；bgm `boss`；boss:true；flee:false。
- **數值**：lv 10、hp 2600、mp 80、atk 34、def 20、mag 22、spd 19（phase 2 起 24）、luk 8；**金**（白虎屬金）、弱 火、抗 木；exp 650、文 300；掉落 **虎牙墜**（必定）。
- **Phase 1（HP 100–60%）姑婆的樣子**：
  - 拐杖（phys 0.9, w4）
  - 「乖孫，來」（敵單 stun 1 回合 50%，訊息「XX 被姑婆溫柔的聲音迷住了……」, w3）
  - 搖囝仔歌（敵全 sleep 30%, w2）
  - 咔滋咔滋（phys 1.2 單體，回復造成傷害的 30%, w3）
- **Phase 2（HP<60%）**：劇情訊息「虎姑婆的衣衫撐破了——」；切換 art phase 2。
  - 爪擊（隨機 phys 1.0 ×2, w4）
  - 虎撲（phys 1.8 單體，前一回合預告「虎姑婆伏低了身子……」, w3）
  - 虎嘯（敵全 atkDown 2 回合＋stun 20%, w2）
- **劇情插入：阿蘭的熱油**（第一次 HP<45%，該回合結束時）：
  1. 阿蘭（洞口方向）：「虎姑婆——！嘴巴張開！我丟雀仔給妳吃！」
  2. 虎姑婆：「……雀仔？」（訊息：「虎姑婆忍不住張大了嘴——」）
  3. [阿蘭把一整鍋熱油潑了過去！]（特效：火焰＋煙，`shake`）
  4. → 虎姑婆受到 **火屬性固定傷害 220**、**defDown 3 回合**、**stun 1 回合**
  5. 阿蘭：「阿嬤的故事裡，就是這樣打虎姑婆的！」
  6. 紅纓(surprise)：「……那孩子是怎麼把一整鍋油搬上來的！」
  7. 星河(laugh)：「別管了，上！」
- **Phase 3（HP<20%）**：山君之怒（自身 atkUp 3 回合，一次）；之後每回合 50% 使用虎撲。
- **設計意圖**：phase 1 考驗異常狀態處理（醒神香／白芷的解厄）；phase 2 的預告大招要防禦；阿蘭的熱油是民間故事的回報，也讓戰鬥在中段鬆一口氣。

---

## 7. 實作摘要

### 7.1 旗標
`ch2_start`, `ch2_grove_open`, `ch2_lingshi`, `ch2_maze_solved`, `ch2_hunter_ghost`, `ch2_woodcutter_found`, `ch2_duel`, `ch2_hongying_join`, `ch2_pingxi_arrive`, `ch2_morning`, `ch2_tiandeng_quiz`, `ch2_bundle_hint`, `ch2_bundle_returned`, `ch2_letter_read`, `ch2_alan_trust`, `ch2_granny_house`, `ch2_cage1`, `ch2_cage2`, `ch2_tiger_beaten`, `ch2_tiandeng_night`, `ch2_dawn`, `ch2_ashi_gift`, `ch2_ama_gift`, `ch2_done`
教學：`tut_flee`, `tut_lingshi`, `tut_hongying`, `tut_combo2`
變數：`vars.loopCount`, `vars.loopStep`, `vars.vision`（引擎既有）
任務：`q_woodcutter`（山中的呼喚）、`q_letter`（寄到了的信）、`q_hy_kitchen`（紅纓的廚房）
心燈：`xd_woodcutter`「山中的呼喚」、`xd_letter`「寄到了的信」

### 7.2 道具（建議 id／數值／價格）
**消耗品**
| id | 名稱 | 效果 | 價格 |
|---|---|---|---|
| `it_lingxun` | 七彩靈蕈 | 地圖：靈視 120 秒；戰鬥：我方一人「幻境」3 回合（爆擊／法術↑、偶爾恍神） | 非賣品（賣 40） |
| `it_longan` | 龍眼乾 | MP +15 | 15 |
| `it_bento` | 山產便當 | HP +150 | 50 |
| `it_chicken_soup` | 雞湯 | HP +120、MP +20 | 70 |
| `it_hy_charcoal` | 紅纓特製山產炒（焦） | 戰鬥：丟向敵人，火屬性傷害（固定 90＋）＋中毒 30%；對我方使用：HP +1（「……吃下去了。勇氣可嘉。」） | 非賣品 |
| `it_shoot_soup` | 竹筍溪蝦湯 | HP +150、MP +20 | 非賣品 |
| `it_bamboo_shoot` | 竹筍 | 素材（支線） | 賣 10 |
| `it_shrimp` | 溪蝦 | 素材（支線） | — |
| `it_shansu` | 山蘇 | 素材（支線）；也可直接吃：HP +20 | 賣 10 |
| `it_boar_hide` | 山豬皮 | 素材（賣 60） | 120 |

**裝備**
| id | 名稱 | 類別 | 數值 | 價格 | 誰 |
|---|---|---|---|---|---|
| `ar_bamboo` | 竹甲 | 防具 | def +10 | 280 | 星河、紅纓 |
| `ar_boarhide` | 山豬皮背心 | 防具 | def +12、atk +2 | 360 | 星河、紅纓 |
| `ar_indigo_robe` | 菁染長衫 | 防具 | def +8、mag +3 | 260 | 全員 |
| `hd_indigo` | 菁布頭巾 | 頭 | def +4、mag +1 | 180 | 全員 |
| `ft_leggings` | 綁腿 | 腳 | def +2、spd +2 | 160 | 全員 |
| `ft_porter` | 挑夫草鞋 | 腳 | def +2、spd +3 | — | 全員 |
| `ac_wristguard` | 護腕 | 飾品 | atk +3 | 120 | 全員 |
| `ac_tiandeng_charm` | 天燈吊飾 | 飾品 | mag +3、luk +2 | 80 | 全員 |
| `ac_hunter_charm` | 獵人的護符 | 飾品 | spd +3、luk +2 | — | 全員 |
| `ac_tigerfang` | 虎牙墜 | 飾品 | atk +5、luk +2、抗暈眩 | — | 全員 |

**重要物品**：`key_gong` 銅鑼（「阿竹的銅鑼。敲下去，連魔神仔都要摀耳朵。」）、`key_letter` 阿興的信、`key_porter_bundle` 挑夫的擔子、`key_tiandeng` 天燈（2-16 用）

### 7.3 部隊與敵人
敵人：`moshenzi`, `moshenzi_ph`, `moshenzi_lead`, `mushroom_sprite`, `bamboo_spirit`, `green_snake`, `boar_spirit`, `macaque`, `hongying_duel`, `tiger_granny`
部隊：`t_mf_moshen2`, `t_mf_moshen3`, `t_mf_snake`, `t_mf_mush`, `t_mf_boar`, `t_mf_monkey`, `t_mf_mix`, `t_mf_ambush`, `t_mf_woodcutter`, `t_mf_woodcutter_v`, `t_hongying_duel`, `t_lair_bamboo`, `t_lair_mix`, `t_lair_monkey`, `t_lair_boar`, `t_den_boar`, `t_den_monkey`, `t_den_mix`, `t_tiger_granny`

### 7.4 給實作者的備註
- **新美術需求**：monster `moshenzi`（紅臉矮小、長手、紅布條）、`mushroom_sprite`、`bamboo_spirit`、`green_snake`（台灣的青竹絲：翠綠、紅尾）、`boar_spirit`、`macaque`（台灣獼猴：灰褐、短尾）。物件 `stele`（長青苔的石碑）。2-5 的靈視動物（石虎、山羌、台灣藍鵲）可用 `cat`/`crow` 加 `ghost` 樣式改色，或新增 `spirit_cat`、`spirit_muntjac`、`spirit_magpie`（僅 drawChar）。
- **引擎功能需求**：
  1. 2-5 的 `psychedelic` 數值由腳本控制（漸變），以及「心口的燈」「紅線」特效（兩個小光點＋一條紅色細線，持續 1.5 秒）。
  2. 迷陣的出口邏輯（5.3），`spirit` 物件依 `vars.loopStep` 切換。
  3. 戰鬥的 `endAt`（HP 百分比結束）、`noGameOver`、戰鬥中劇情插入（虎姑婆的熱油、紅纓決鬥的台詞）。
  4. 敵人「偷東西」（獼猴精）與幻影（受擊即消散、不給經驗）。
  5. 臨時隨從（阿山、礦坑的阿黃）：spawn 一個跟隨玩家的 NPC，不加入隊伍。
- **紅纓加入**：`S.join('hongying')`（`joinLv: 6`，引擎取隊伍平均）。裝備使用 characters.js 的起始裝備。
- **合擊**：本章可能解鎖「火樹銀花」（星河＋紅纓 Lv8）與「月下紅纓」（白芷＋紅纓 Lv10）。

### 7.5 給第三章作者的備註
- **抵達方式**：三人搭船伕阿河的船，順基隆河而下（經錫口、士林，在關渡與淡水河會合），抵達**淡水**。時間約**七月十七**傍晚（或十八日）。第三章可從船靠岸的淡水碼頭開始；阿河可以客串一兩句。
- **隊伍**：星河（Lv≈10，螢火）、白芷（Lv≈10）、紅纓（Lv≈10）。雲歸以 Lv11 加入。
- **白芷**：持有玉牌「白芷」；已唱過「渡魂謠」前兩段（歌詞見 ch0 第 6 節：`lyric_1`、`lyric_2`）。她已經知道「餓」「好吃」（九份芋圓）、「雞湯」；把「笨蛋」當成星河的別名（跟紅纓學的）。在靈視中，她看到星河心口有一盞「跟她同色的燈」，星河看到她體內有一團白色火焰——兩人都沒說破，也不知道意義。**照魂鏡**（第三章）可以呼應這一幕。
- **星河**：持有**引魂令**（鬼魂比較肯跟他說話）、**斷掉的竹劍**（紀念品）、銅鑼。他在天燈上偷偷寫了「希望她不要想起來就離開」——白芷不知道；紅纓沒看到。
- **紅纓**：在天燈上寫了「爹、娘、哥哥……」「找到鬼面」「想養一隻胖胖的貓」（＝糰子出場的伏筆，請讓她第一次見到糰子時破功）。她知道「鬼面最近在觀音山一帶出沒」。廚藝災難已在平溪確立（月娘的鍋子）。她目前**不知道**長明宮的事，也不知道白芷被叫做「燈靈」——星河可以在船上或淡水跟她說。
- **清虛真人的石碑**：霧林靈蕈林的石碑由「太虛觀　清虛」題字（「心靜者見真，心亂者見魔」）。雲歸看到隊伍帶著七彩靈蕈時，可以認出師父的教導（並展現他的蘑菇狂熱）。星河身上帶著幾朵七彩靈蕈——可作為**糰子第一次吃蘑菇**的笑點與糰子蘑菇支線的開頭。
- **墨鴉**：九份一戰後撤退，揚言「下次會好好研究那個沒有燈的小子」。長明宮知道燈靈在星河身邊。
- **陳伯（陳渡）**：在九份養傷，向墨鴉報上了名字（「回去跟夜玄講，陳渡還沒死」）。他與夜玄曾一起划船（引魂人搭檔）——尚未對星河細說。
- **主題線索**：老獵人的魂與虎姑婆都說出同一件事——「海那邊的光變弱了，死掉的東西走不了，擠在山裡」。第三章可以讓淡水的外國士兵亡魂延續這條線（找不到回家的海）。
- **心燈**：第一、二章共 4 盞（`xd_atu_watch`、`xd_ahuang`、`xd_woodcutter`、`xd_letter`）。
