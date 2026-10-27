# Points of no return — audit of chapters 0–11

A **point of no return** is a transition after which some content can never be reached again: a chapter end,
one-way travel (boats, the 王船, story warps), a boss whose victory moves the story on, an NPC who leaves after a
flag, or a choice that permanently loses an item or a 心燈. Missing a 心燈 can cost the true ending (「千燈」 needs
`G.Lanterns.THRESHOLD` = 14), so every such point that could abandon open side content now asks first.

For guide writers: the **table** lists every point found, what it closes and what the game now says. The
**choice hints** section lists the choices that lose something for good. They get a hint in an NPC's line instead of a
pop-up.

## The shared warning

`S.pointOfNoReturn({...})` / `G.Story.pointOfNoReturn(S, {...})` in [`js/story/story.js`](../../js/story/story.js).
It is called right before the transition, after the scene's own "出發？" choice if it has one.

- **Only shown when something is open.** With nothing open it returns `true` at once, without a prompt.
- **What counts as open** is computed from quest state, not hard-coded text:
  - each side quest the caller passes that is *started and not done* is **named** (quest name from
    `G.Data.quests`, plus 「（心燈）」 when it is a 心燈 quest);
  - each 心燈 the caller passes that is *not lit* and whose quest was *never started* is **counted, not named**:
    「這一帶還有 N 盞心燈未點亮」. That gives a nudge without spoilers. A lantern already out of reach (its
    `can()` is false, e.g. 阿義 has left) is not counted. A lantern whose quest ended without it was lost to an
    earlier choice, so it is not counted either.
- **Text:** 「前方將無法回頭。尚有未完成的事：半邊井（心燈）、這一帶還有 1 盞心燈未點亮。確定要繼續嗎？」, then
  「繼續」 / 「再等等」 (cancel = 再等等). English: *"There's no turning back past this point. Still unfinished:
  Half Well (heart lantern); heart lanterns still unlit around here: 1. Go on anyway?"* — **Go on** / **Not yet**
  (strings in `js/i18n/en_ui.js`).
- **再等等** returns `false`. The caller backs off: the player steps back off the trigger (`back`), a `once` event
  is re-armed (`event`), and the inn's auto event stays quiet until the map is re-entered (ch5).
- **Tests:** 「繼續」 is the first option, so `G.Debug.autoplay` (choices default to 0) carries on. A test that wants
  to wait queues `G.Debug.choices = ['再等等']` (see ch5.test.js `[inn] can postpone resting`). Each prompt is logged
  in `G.Debug.log` as `pointOfNoReturn chN: …`. Unit test: `story: S.pointOfNoReturn …` in `tools/test/unit.js`.

## Table

"Prompt" = the shared warning (only when something is open). Quest / 心燈 ids are the ones passed to the helper.

| Ch | Point of no return | Trigger (code) | What it closes | What the game does now |
|---|---|---|---|---|
| 0 | 序章 → 第一章 (the fall) | `ch0_prologue.js` 0-8 → `G.Story.next(S, 1)` | nothing: the dream souls are flavor (no items, quests or 心燈) | nothing needed |
| 1 | 出發去雞籠 (afternoon P3 → evening) | 陳伯, `chenboTalk` P3 | **pauses** 九份 side quests until the next morning (P5); 醒木失竊記 can only be *started* P1–P3 (no 心燈) | already had two-step confirm 「真的要出發了（九份的支線會暫停到明天早上）」; unchanged |
| 1 | Leaving 九份 (1-24, south exit 18–20,40) | `jiufen` event `depart` → `scene24` → `G.Story.next(S, 2)` | 阿土伯的懷錶 (心燈), 阿黃回家 (心燈), 醒木失竊記 | **prompt** (`q_atu_watch`, `q_ahuang`, `q_xingmu`; lanterns `xd_atu_watch`, `xd_ahuang`); 再等等 re-arms the event and steps back north |
| 2 | Fighting 虎姑婆 (2-15) | `tiger_den` event `boss` → `boss215` | 紅纓的廚房: after the boss the story runs through 天燈之夜 to 七月十七, and **溪蝦 can only be caught on 七月十六 (day)** | **prompt** when 紅纓的廚房 is open and no 溪蝦 is in the bag; 再等等 re-arms the event and steps back. 紅纓 also says 「溪蝦要趁今天白天抓」 when the quest starts ([sidequests_ch0-2.md](sidequests_ch0-2.md)) |
| 2 | Boat to 淡水 (2-19) | 船伕阿河 `depart219` → `G.Story.next(S, 3)` | 山中的呼喚 (心燈), 寄到了的信 (心燈), 紅纓的廚房 | **prompt** after 「出發」 (`q_woodcutter`, `q_letter`, `q_hy_kitchen`; lanterns `xd_woodcutter`, `xd_letter`) |
| 3 | First night in 淡水 | 淡水客棧 `tsInnNight` choice 「去紅毛城看看 / 先睡覺」 | 紅毛城的異鄉兵 (心燈) only starts if the party goes **that night** | **choice hint** (see below) |
| 3 | 椅仔姑 in the theatre | `yizigu` choice | 椅仔姑與花旦 (心燈) | **choice hint** (see below) |
| 3 | South gate of 艋舺 → 竹塹 | `bangka` event `bk_south` → `bkDepart` → `G.Story.next(S, 4)` | 紅毛城的異鄉兵, 阿蓮與阿德, 小梅與母親, 頂下郊的兩個老人 (all 心燈; 淡水 stays reachable by ferry until here) | kept the generic line + 「出發，往竹塹」 choice; added **prompt** (`q_tamsui_soldiers`, `q_alian`, `q_xiaomei`, `q_feud`; lanterns `lantern_alian`, `lantern_xiaomei`, `lantern_feud`. The soldiers' lantern is never counted when its quest never started, because it is out of reach after the first night) |
| 4 | 溫先生's 長明燈 stall disappears | `zhuqian` NPC `wen`, `if: !ch4_lamp_broken` (gone once 風魔 is beaten) | **nothing of value**: not a 心燈 source and gives no item. It is one dialogue (`scene403`, sets `ch4_changming_stall_seen`, which nothing else reads) | nothing needed; guide can call it lore-only |
| 4 | 山歌 duel, 「認輸」 | `scene407` | **山歌竹笛** (`fl_shange`, 白芷's flute): given by 德興伯 only after a win, sold nowhere | **choice hint** (see below) |
| 4 | 祭典之夜 (矮靈祭) | `xiangtian_festival` | no side content closes; no saving inside (the guide already says to save first) | nothing needed |
| 4 | South gate 歌薰門 → 鹿港 (4-18) | `zhuqian` south warp → `scene418` → `G.Story.next(S, 5)` | 嶺上松 (心燈), 九降風裡的阿母 (心燈), 柿柿如意, 擂茶課, 山歌擂台・道士篇 | kept 「前往鹿港」 choice; added **prompt** (`q_yimin`, `q_mifen`, `q_persimmon`, `q_leicha`, `q_shange_yungui`; lanterns `lantern_yimin`, `lantern_mifen_mother`) |
| 5 | Resting at the inn after the boss | `lukang_inn` auto event `c5_inn_auto` / 蔡頭家 → `innScene` → 冬至 → 除夕 → `G.Story.next(S, 6)` | 顧門的福伯 (心燈), 半邊井 (心燈), this chapter's 七仙蕈 (憶蕈, 雲歸的蕈譜) | old warning only fired when 半邊井 was *started*. It is now the shared **prompt** (`q_fubo`, `q_halfwell`, `q_tuanzi_mush` while `mush_ch5` is unset; lanterns `lantern_fubo`, `lantern_halfwell`), so a never-started 半邊井 is counted as an unlit 心燈. 再等等 keeps the inn quiet until the map is re-entered |
| 6 | 「開始吧。（蜂炮夜）」 | 林伯 `keeperTalk` → `Sc.beehive` | 阿義 leaves the main street when the 蜂炮夜 starts: 轎夫與母親 (心燈) can no longer be **started** | **prompt** when the quest was never started (lantern `lantern_yanshui` counted) |
| 6 | 「休息到天亮（前往府城）」 | 鹽水客棧 `Sc.yanshuiInn` → `Sc.toFucheng` | 鹽水 is a one-time map: 轎夫與母親 (心燈) if started but unfinished | kept 雲歸's hint line; added **prompt** (`q_yanshui_mother`) |
| 6 | 長明宮 infiltration → 萬燈閣 → forced loss (3-12 → 3-15) | `linto` 水門 `Sc.waterGate` → palace → `palace_lanterns` auto `Sc.lanterns` | 府城's optional extras: 赤崁樓燈謎 (燈謎紙扇 for ≥3, 文昌筆 for 5/5), 大天后宮月老. These are not quests or 心燈. 白芷 leaves the party here | not prompted (no quest or 心燈 is open at this point); guide should say "finish 府城 before the 水門" |
| 7 | 玉山山徑 「繼續往上走」 | `yushan` event `upper_gate` | 阿里山古道 / 鄒族大社 / 神木林: 霧中的獵刀 (心燈), 老吳的鹽, 霧谷 chests | kept its line 「進入後將無法折返。」 and 星河's reminder; added **prompt** (`q_ch7_pasuya`, `q_ch7_salt`; lantern `lantern_tsou_hunter`) |
| 7 | 下殿巨門 → 祠心 | `lamp_shrine_lower` warp → `lamp_shrine_core` | 燈母祠的壁畫 (心燈) | kept 雲歸's one-time hint and 「推開巨門」 choice; added **prompt** (`q_ch7_murals`; lantern `lantern_lamp_murals`, counted when no mural has been read) |
| 8 | 逆潮之夜 (tide) | `beigang_river` tide counter | 北港的香客 (心燈) is a timed challenge (8 battles), not a transition | nothing needed (the tide gauge is on screen) |
| 8 | 北港 → 安平 (`S.travel('beigang','tainan')`) | after dawn | nothing: 北港的香客 resolves at dawn by itself | nothing needed |
| 8 | 蚵殼阿嬤's question | `talkOyster` choice | 蚵殼阿嬤 (心燈) only with 「阿嬤，您不傻。」 | **choice hint** (see below) |
| 8 | 熱蘭遮舊城 → 觀潮台 | `anping_fort` warp (19–21,1) → `anping_tower` (boss runs on to dawn) | 蚵殼阿嬤 (心燈) can only be **started** before dawn | **prompt** when 阿嬤's quest was never started and 安平 has been reached (lantern `lantern_oyster_grandma`); 再等等 steps back |
| 8 | Leaving 安平 with 陳伯 | `departAnping` → `G.Story.next(S, 9)` | 蚵殼阿嬤: her 心燈 is handed over **at dawn back on the beach** | kept 「出發，往南」 choice; added **prompt** (`q_ch8_oyster`; tagged 心燈 only if the honest answer was given) |
| 9 | 「出航・往東」 | 王船 helm `helmTalk` → `chapterEnd` → `G.Story.next(S, 10)` | 半屏山湯圓, 月琴伯的名字 (被風偷走的七個名字), 燈塔守的家書 (all 心燈) | kept 「出航（之後將無法再回到南部海域）」; added **prompt** (`q_ch9_banping`, `q_ch9_names`, `q_ch9_lighthouse`; lanterns `xd_banpingshan`, `xd_yueqin_names`, `xd_lighthouse_home`) |
| 10 | 蘭嶼: 芋圓 and the fish rack | `H` 曬架 choice | one of the trust checks behind 達悟家族的拼板舟 (心燈) | **choice hint** (see below) |
| 10 | 阿坤 「準備好了」 (頭城) | `H.akunTalk` → 普渡 → 搶孤 → 關鬼門 → `G.Story.next(S, 11)` | every port of chapter 10: 達悟家族的拼板舟 (心燈), 羅漢腳阿義 (心燈), 寶桑海灘賽跑 | **prompt** (`q_c10_tatala`, `q_c10_race`, `q_c10_luohanjiao`; lanterns `xd_tao_tatala`, `xd_luohanjiao`) |
| 11 | 出航 from 澎湖 | 王船 helm `H.helm` → `H.c11_11` | 石滬的缺口 (心燈), 海賊的寶藏 | kept 「出航（出航後無法返回澎湖）」 and the 麻糬/雲歸 lines; the old weir-only 「還是出航」 choice is now the shared **prompt** (`q_penghu_weir`, `q_ch11_treasure`; lantern `lantern_penghu_weir`) |
| 11 | 「繼續前進（無光之霧）」 | `H.helm` → `H.c11_15` | the 溺魂暗流 detour, so 唐山客的平安信 (心燈) can no longer be **started**. Its second half is on the far shore | **prompt** when the 黑水溝海圖 is in the bag and the 唐山阿伯 was never met (lantern `lantern_tangshan`) |
| 11 | 燈塔五樓 stairs → 燈心之門 | `farshore_tower_5` up-warp (`upRun`) → `farshore_tower_top` auto `H.c11_24` | 她的記憶 (心燈): the six memory lamps stay on 5F (still collectible after the 千年燈塔守) | **prompt** (`q_baizhi_memory`; lantern `lantern_baizhi_memory`); 再等等 puts the player back on 5F |
| 11 | 燈心 → ending | `lamp_heart` | the ending is chosen by the 心燈 count (≥ 14 → 「千燈」); nothing reachable is left open | nothing needed |

### Choice hints (no pop-up)

These choices lose something for good. An NPC line just before the choice now hints at it. The choice labels are
unchanged, so tests that pick by text still work.

| Ch | Choice | Loses | Hint line added (English) |
|---|---|---|---|
| 3 | 「去紅毛城看看」 / 「先睡覺」 (淡水客棧, first night) | 紅毛城的異鄉兵 (心燈): the soldiers only appear tonight | 白芷：「……那個鼓聲，好像只有今晚會響。」 (*"…I think that drum only sounds tonight."*) |
| 3 | 「讓雲歸貼符，請她走」 / 「問問秀蘭姑娘自己怎麼想」 | 椅仔姑與花旦 (心燈) with the talisman | 白芷：「……貼了符，她就永遠看不到這齣戲了。」 (*"…If the talisman goes on, she'll never get to see the show."*) |
| 4 | 「再唱一遍」 / 「認輸」 (山歌 duel, after a lost round) | 山歌竹笛 (only a win earns it) | 庄民：「細妹，莫放棄！唱贏阿福个人，德興伯有好東西相送喔！」 (*"Don't give up, lass! Whoever out-sings A-Fu gets something special from Uncle Dexing!"*) |
| 8 | 「阿嬤，您不傻。」 / 「他會想起來的。」 | 蚵殼阿嬤 (心燈) with the second answer | 紅纓：「（小聲）……阿嬤要的不是安慰，是一句實話吧。」 (*"…She isn't asking to be comforted. She wants the truth."*) |
| 10 | 「抓住芋圓」 / 「假裝沒看到」 | −1 trust (達悟家族的拼板舟 needs ≥ 3) | 雲歸：「（小聲）……在別人的家裡，規矩是大家一起守的。他們都看著呢。」 (*"…In someone else's home, everyone keeps the rules together. They're watching."*) |

### Already warned before this pass (kept)

- ch1 雞籠 trip: 「真的要出發了（九份的支線會暫停到明天早上）」.
- ch3 / ch4 departures: 「離開艋舺／竹塹後，本地未完成的委託將無法再接。」 (the generic line is kept; the shared
  prompt now names what is actually open).
- ch6 inn: 雲歸's 「……大疫塚那邊，好像還有放不下的人。」.
- ch7: 「進入後將無法折返。」 + 星河's 「……Voyu 拜託的事，還沒有給他答覆。」; 雲歸's one-time mural reminder.
- ch9: 「出航（之後將無法再回到南部海域）」. ch11: 「出航（出航後無法返回澎湖）」 and the toast 「出航後將無法返回澎湖。」.

## Adding a new point of no return

```js
if (!(await S.pointOfNoReturn({
  chapter: 5,
  quests: ['q_side_a', { id: 'q_side_b', open: (st) => !G.Inv.has('needed_item') }],
  lanterns: { lantern_a: 'q_side_a', lantern_c: { quest: 'q_side_c', can: (st) => !!st.flags.npc_still_here } },
  back: 'D',          // step off the trigger on 再等等
  event: e,           // (S, e) => …: re-arm a `once` touch event on 再等等
}))) return;
```

Pass only content **this** transition closes. Content that is still reachable afterwards (a quest whose second half
happens later) belongs in neither list. Add new Chinese text to the right `js/i18n/en_chN.js`. The helper's own
strings are in `en_ui.js`.
