# 《彼岸燈》 Shorelight — English Localization Glossary

Target: natural, literary **American English** (American spelling: *armor, color, gray, traveler*).
Tone follows the Story Bible: warm, funny day-to-day banter → mystery → heartbreak → hope.
This file is the single source of truth for names and terms. `js/i18n/en_ui.js` (engine/UI) and
`js/i18n/en_data.js` (characters, items, skills, enemies) already use everything below; chapter files
(`js/i18n/en_chN.js`) must match.

---

## 1. How the dictionaries work (read before translating)

- Lookup is by **exact source string** at display time (`G.T`). Copy the Chinese key byte-for-byte
  (full-width punctuation `，。！？「」（）・　…` included). Run `node tools/i18n/extract.js --missing`.
- Multi-line strings that have no exact match are translated **line by line**, so a dialogue line
  containing `\n` can be keyed either whole or per line.
- **Templates**: keys containing `%s` (any text — itself translated recursively) or `%d` (a number).
  The first template that matches wins, in load order: `en_ui.js` → `en_data.js` → `en_ch0.js` …
  Put longer/more specific templates first.
- `en_data.js` ends with a generic list template `'%s、%s' → '%s, %s'` (used for battle spoils). It is
  loaded before the chapter files, so **a chapter template whose key contains `、` will never be
  reached** — key such lines exactly instead.
- Inline colour markup `{y} {r} {b} {g} {p} {o} {w} {d}` … `{/}` must survive; keep the same spans
  around the same words (`獲得 {y}%s{/}` → `Obtained {y}%s{/}`).
- Speaker names are translated through the same dictionary (`G.Names`, `G.ShortNames`), so script
  calls like `S.say('xinghe', …)` need no extra keys.

## 2. Style rules

- **Quotes**: 「」 → “double quotes” (straight `"` in source files is fine); 『』 → single quotes.
- **Ellipses**: …… → `…` (one character); —— → em dash `—` without spaces.
- **No italics** (the canvas can't render them). First use of a culturally specific term: romanize
  and gloss once, e.g. *taro balls (yuyuan)*, *leicha (Hakka pounded tea)*, *mosina — a mountain imp*.
  After that use the English word.
- Taiwanese/Hokkien & Hakka flavor in NPC speech: keep it light and readable. Use the gloss or an
  English equivalent with the same warmth: 阿伯 → *Uncle*/*old man*, 阿嬤 → *Grandma*, 囝仔 → *kiddo*,
  歹勢 → *sorry, sorry*, 甲飽未 → *Eaten yet?*, 好佳哉 → *Thank goodness*, 夭壽 → *Good grief!* /
  *Heavens!* (mild), 𠊎 → *I* (keep a Hakka character's cadence, not dialect spelling).
- 爹 / 娘 → *Father / Mother* in formal or grief-laden lines, *Papa / Mama* when a child speaks
  (Ye Nian always says *Papa*).
- Numbers in UI text: digits. Currency: 文 → *coins* (`%d 文` → `%d coins`).
- Deities are always treated with reverence (capitalized titles, no jokes at their expense).
- Indigenous terms: use the people's own words where well known (**kuba, Gaya, pasibutbut,
  palakuan, tatala**) with a short gloss on first use. Never exoticize.

## 3. Characters

| Chinese | English | Notes |
|---|---|---|
| 沈星河 / 星河 | **Shen Xinghe** / **Xinghe** | Short form in dialogue and HUD. Battle chip "X". |
| 白芷 | **Bai Zhi** | Always both syllables. |
| 洛紅纓 / 紅纓 / 阿纓 | **Luo Hongying** / **Hongying** / **Ying** | 阿纓 (Qingfeng's pet name) → "Ying". |
| 雲歸 | **Yun Gui** | |
| 糰子 | **Tuanzi** | Formosan leopard-cat (石虎) spirit; "he". |
| 陳伯 / 陳渡 | **Uncle Chen** / **Chen Du** | |
| 夜玄 | **Ye Xuan** | Title 玄冥法師 → **the Abbot of the Dark Deep**. |
| 夜念 / 念兒 | **Ye Nian** / **Nian'er** | |
| 洛青鋒 / 青鋒 | **Luo Qingfeng** / **Qingfeng** | |
| 鬼面 | **Ghost Mask** | In-world epithet; quote it on first mention ("Ghost Mask"). |
| 清虛真人 / 清虛 | **Master Qingxu** / **Qingxu** | |
| 墨鴉 | **Mo Ya** | |
| 藤婆 | **Granny Teng** | Calls everyone 孩子 → "child". |
| 燈母 | **the Lantern Mother** | Nameplate: "The Lantern Mother". |
| 萬象童子 | **the Myriad-Form Children** | Singular enemy: "Myriad-Form Child". |
| 清虛's temple keeper etc. | — | Translate descriptive NPC labels plainly ("Temple Keeper"). |
| 阿炳伯 | **Uncle Bing** | Teahouse storyteller. |
| 阿柑姨 | **Auntie Gan** | Taro-ball shop. |
| 小金 / 阿黃 | **Little Jin** / **Huang** (the dog; "Yellow" in narration is fine once) | |
| 阿土伯 | **Old Tu** | Ghost of the old miner. |
| 林大夫 | **Dr. Lin** | |
| 阿蓮 | **A-Lian** | |
| 小梅 | **Xiao Mei** | |
| 福伯 | **Uncle Fu** | |
| 林投姐 | **Sister Lintou** | Gloss once: the woman of the screwpine (lintou) grove. |
| 椅仔姑 | **the Chair Maiden** | |
| 虎姑婆 | **Grandaunt Tiger** | |
| 唐山客 | **settler from the mainland** / "the Settler" | 唐山 → *the mainland* (Tangshan only in songs/quotes). |
| ？？？ | **???** | Unknown speaker. |

## 4. Core terms

| Chinese | English | Notes |
|---|---|---|
| 彼岸燈 | **Shorelight** | The great lamp & the game title. |
| 彼岸 | **the Far Shore** | Capitalized. |
| 黑水溝 | **the Black Tide** | Always this; never "Black Ditch". |
| 黑潮 (the real current) | **the Kuroshio** | World map label "Kuroshio". The living, generous current. |
| 黑潮 (corrupted / boss contexts) | **the dark tide** (lowercase) | e.g. 黑潮的氣息 → "the breath of the dark tide". |
| 黑潮・無相 | **the Formless Tide** | Final boss. 無相 → *formless*. |
| 逆潮 | **the Reverse Tide** | Ye Xuan's plan "Reversing the Tide"; chapter 8 "The Reverse Tide". |
| 潮病 | **tide-sickness** | Adj. "tide-sick". |
| 心燈 | **heart lantern(s)** | Menu label: **Lanterns**. |
| 魂燈 | **soul-lantern** | The light a soul becomes on death. |
| 燈靈 | **lamp spirit** | What Bai Zhi truly is. |
| 引魂人 | **Soul Guide(s)** | Secret order. |
| 引魂令 / 引魂槳 | **Soul Guide's Token** / **Soul Oar** | |
| 渡 / 渡魂 | **to ferry / ferrying souls across**; "crossing" | Theme word. |
| 渡魂謠 | **the Song of Crossing** | Bai Zhi's song (skill name too). |
| 水燈 / 水燈頭 | **water lantern** / **water-lantern float** (the big house-shaped one) | |
| 放水燈 | **floating the water lanterns** | |
| 長明宮 | **the Temple of Eternal Light** | |
| 長明燈 | **eternal lamp(s)** | |
| 萬燈閣 | **the Pavilion of Ten Thousand Lamps** | |
| 燈母祠 | **the Lantern Mother's Shrine** | |
| 太虛觀 | **Taixu Temple** | Taoist; 太虛 = the Great Void (gloss once). |
| 照魂鏡 | **Soul Mirror** | |
| 靈視 | **Spirit Sight** | HUD timer: "Sight 60s". |
| 七彩靈蕈 / 靈蕈 | **Seven-Hued Spirit Mushroom** / **spirit mushroom** | |
| 幻境 (status) | **Trance** | |
| 靈境 | **the Vision Realm** | |
| 一息界 | **the Realm of One Breath** | |
| 夢藤 / 夢藤湯 / 入夢禮 | **Dream Vine** / **Dream-Vine Brew** / **the dreaming rite** | Fictional; belongs to Granny Teng only. |
| 洗心 | **the cleansing** | (the purge in the rite) |
| 雲蛇 / 雲豹 | **cloud serpent** / **clouded leopard** | |
| 心火 | **heartfire** | Skill prefix "Heartfire:". |
| 劍意 | **Sword Will** | Battle HUD shorthand "Will". |
| 合擊 | **Combo Art(s)** | Battle menu "Combo Arts". |
| 仙術 / 術法 | **Arts** / **an Art** | "Fire Art on all foes". |
| 絕技 / 奧義 | **Ultimate** | Battle menu shows "★ name". Descriptions start "[Ultimate]". |
| 抓交替 | **catching a replacement** / "seek a substitute" | Water-ghost lore. |
| 魔神仔 | **mosina** (mountain imp) | Taiwanese *mô-sîn-á*. Enemy name "Mosina". |
| 中元 / 中元節 | **the Ghost Festival** (Zhongyuan) | 鬼月 → **Ghost Month**. |
| 中元普渡 / 普渡 | **the Pudu offerings** | |
| 開龕門 / 關鬼門 | **opening / closing of the ghost gate** | |
| 主普壇 | **the main offering altar** | |
| 搶孤 / 孤棚 | **Ghost Grappling** (qianggu) / **the grappling tower** | |
| 順風旗 | **the Fair-Wind Banner** | |
| 王船 / 王爺 / 千歲爺 | **the King Boat** / **the Royal Lords (Wangye)** / **the Lord Qiansui** | Never bosses. |
| 擲筊 / 聖筊 / 笑筊 / 陰筊 | **casting moon blocks** / **Holy Yes** / **Laughing** / **Angry No** | |
| 遶境 / 鑽轎腳 | **pilgrimage procession** / **crawling beneath the palanquin** (a blessing) | |
| 八家將 / 千里眼・順風耳 | **the Eight Generals** / **Thousand-Mile Eye and Wind-Following Ear** | |
| 北管 | **beiguan music** | |
| 城隍 / 都城隍 | **the City God** | 生死簿 → **the Ledger of Life and Death**. 范謝將軍 / 七爺八爺 → **Generals Fan and Xie** (Seventh and Eighth Lords). |
| 媽祖 | **Mazu** | Never portrayed as a character. 天后宮 → **Temple of the Heavenly Queen**. |
| 七娘媽 / 做十六歲 | **the Seven Ladies** / **the coming-of-age-at-sixteen rite** | |
| 關帝 | **Lord Guan** | |
| 觀音 | **Guanyin** | |
| 土地公 / 福德祠 | **the Earth God** / **Earth God Shrine** | |
| 五行 | **the Five Phases** | Elements: 金 **Metal**, 木 **Wood** (Yun Gui's "thunder"), 水 **Water**, 火 **Fire**, 土 **Earth**. 相生相剋 → creation and destruction. |
| 符 / 符籙 | **talisman(s)** | 「急急如律令」 → "Swift as the law commands!" |
| 道士 / 道袍 | **Taoist** / **Taoist robe** | |
| 米酒 / 小米酒 | **rice wine** / **millet wine** | |
| 九降風 | **the Jiujiang wind** | Gloss once: Zhuqian's fierce autumn monsoon. |
| 落山風 | **the fall wind** (luoshan wind) | Hengchun's downslope gale. |
| 六死三留一回頭 | "Six die, three stay, one turns back." | Settler proverb about the crossing. |
| 北冥有魚，其名為鯤 | "In the northern deep there is a fish, and its name is Kun." | Zhuangzi. |
| 笨蛋 | **idiot** | Hongying → Xinghe; affectionate-exasperated. |

### Status & stat names (UI)

| Chinese | Full | Badge |
|---|---|---|
| 中毒 / 毒 | Poison | PSN |
| 封印 / 封 | Seal | SEAL |
| 沉睡 / 睡 | Sleep | SLP |
| 定身 / 暈眩 / 定 | Stun | STUN |
| 幻境 / 幻 | Trance | TRC |
| 再生 / 持續回復 / 再 | Regen | RGN |
| 護盾 / 盾 | Shield | SHLD |
| 防禦 (guarding) / 守 | Guard | GRD |
| 攻 ↑↓ | Attack up/down | ATK |
| 防 ↑↓ | Guard up/down | DEF |
| 法 ↑↓ | Magic up/down | MAG |
| 速 ↑↓ | Speed up/down | SPD |
| 生命 / 氣血 / 命 | HP | HP |
| 真氣 / 氣 | MP | MP |
| 武力 / 武 | Attack | ATK |
| 防禦 (stat) | Guard | DEF |
| 法力 / 法 | Magic | MAG |
| 身法 / 速度 | Agility (stat) / Speed (buffs) | SPD |
| 運氣 / 運 | Luck | LCK |
| 經驗 | EXP | |

Note: `防禦` is one dictionary key used for the stat, the battle command and the guard pop-up, so all
three read **Guard**.

## 5. Places (world map labels in **bold**)

Hanyu Pinyin, with established Taiwanese/English forms where they exist. Qing-era flavor is fine in
prose but keep the labels below.

| Chinese | English | Notes |
|---|---|---|
| 福爾摩沙 / 台灣 | **Formosa** / Taiwan | Narration prefers Formosa. |
| 唐山 | the mainland | |
| 九份 | **Jiufen** | 豎崎路 → Shuqi Road (the stairs); 陳記燈籠舖 → the Chen Family Lantern Shop; 燈火茶樓 → Lamplight Teahouse. |
| 雞籠 | Keelung | Use **"Kelang (Keelung)"** once in lore text, Keelung elsewhere. 雞籠中元祭 → the Keelung Ghost Festival. |
| 八斗子 | **Badouzi** | |
| 舊金礦坑 | the Old Gold Mine | |
| 霧林 | the Misty Wood | |
| 平溪 / 十分 | **Pingxi** / Shifen (waterfall) | 天燈 → sky lantern. |
| 淡水 | **Tamsui** | 紅毛城 → Fort San Domingo ("the Red-Hair Fort" in Qing voices). |
| 觀音山 | **Mt. Guanyin** (Mount Guanyin in prose) | |
| 艋舺 | **Bangka** | 龍山寺 → Longshan Temple; 剝皮寮 → Bopiliao; 頂下郊拚 → the Upper-Lower Guild Feud. |
| 竹塹 / 竹塹城 | **Zhuqian** / Zhuqian City | Old Hsinchu; gloss "Zhuqian (old Hsinchu)" once. |
| 新埔 / 關西 | Xinpu / Guanxi | |
| 客家庄 / 伙房 | the Hakka Village / courtyard farmhouse | 藍衫 lanshan (Hakka blue shirt), 擂茶 leicha, 粄條 bantiao, 山歌 hill songs, 義民 the Yimin (Righteous Dead), 硬頸 "hard-necked" stubbornness. |
| 向天湖 | **Xiangtian Lake** | Saisiyat; 矮靈祭 → paSta'ay (Ritual of the Short People); 芒草 → silvergrass. |
| 五指山風穴 | Wuzhi Mountain Wind Cave | |
| 鹿港 | **Lukang** | 九曲巷 Nine-Turn Lane; 摸乳巷 Touch-Breast Lane (yes, really); 半邊井 Half-Well; 洛家古厝 the Old Luo Mansion; 一府二鹿三艋舺 "First the Prefecture, second Lukang, third Bangka". |
| 府城 | **Tainan Prefecture** / "the Prefecture City" | Chapter titles: "Tainan". 赤崁樓 Chihkan Tower; 大天后宮 Grand Mazu Temple; 孔廟 Confucius Temple. |
| 鹽水 | **Yanshui** | 蜂炮 → beehive rockets. |
| 林投林 | the Screwpine Grove | |
| 安平 / 觀潮台 | Anping / the Tide-Watching Terrace | |
| 北港 | **Beigang** | |
| 阿里山 | **Alishan** | Tsou; kuba (men's house); 塔山 → Mount Ta (where souls go). |
| 玉山 | **Jade Mountain** (Yushan) | Bunun; pasibutbut. |
| 雲霧林 | the cloud forest | |
| 日月潭 | **Sun Moon Lake** | Thao; 白鹿 the white deer; 杵音 pestle music; Lalu island (never visited). |
| 打狗 / 旗後 / 半屏山 | **Takao** / Qihou / Banping Mountain | |
| 東港 / 東隆宮 | **Donggang** / Donglong Temple | |
| 恆春 | **Hengchun** | 月琴 → yueqin (moon lute). |
| 鵝鑾鼻 | **Eluanbi** | lighthouse "the Light of East Asia". |
| 蘭嶼 | **Orchid Island** (Pongso no Tao) | Tao people; 拼板舟 → tatala plank boat; 飛魚季 flying-fish season; 船眼 boat eye. |
| 台東 | **Taitung** | Puyuma palakuan; Amis 海祭 sea ritual, age grades. |
| 花蓮 / 太魯閣 | Hualien / **Taroko** | Truku; Gaya; 紋面 facial tattoos; 彩虹橋 the Rainbow Bridge; 清水斷崖 the Qingshui Cliffs; 立霧溪 the Liwu River. |
| 宜蘭 / 頭城 / 龜山島 | Yilan / **Toucheng** / Turtle Island | |
| 澎湖 | **Penghu** | 石滬 stone fish weirs; 玄武岩 basalt. |
| 玄武嶼 | Xuanwu Isle | Fictional. |
| 彼岸花原 | the Spider Lily Fields | 彼岸花 = red spider lily. |
| 彼岸燈塔 | the Shorelight Tower | |
| 後山 | the Back Mountains | (the east coast) |

## 6. Chapters

| # | Chinese | English |
|---|---|---|
| 序 | 序章　夢 | Prologue: A Dream |
| 1 | 九份燈火 | Lights of Jiufen |
| 2 | 霧林天燈 | Sky Lanterns in the Mist |
| 3 | 觀音艋舺 | Guanyin and Bangka |
| 4 | 竹塹風起 | Winds over Zhuqian |
| 5 | 鹿港舊夢 | Old Dreams of Lukang |
| 6 | 府城長明 | Tainan's Eternal Light |
| 7 | 雲山入夢 | Dreaming in the Cloud Peaks |
| 8 | 逆潮 | The Reverse Tide |
| 9 | 王船南行 | The King Boat Sails South |
| 10 | 後山巡境 | Beyond the Back Mountains |
| 11 | 黑水溝・彼岸 | Black Tide, Far Shore |
| 終 | 終章 | Epilogue |

Full form: "Chapter 1: Lights of Jiufen". Endings: 真結局「千燈」 → True Ending: **A Thousand Lanterns**;
普通結局「彼岸」 → Ending: **The Far Shore**.

## 7. Canonical lines (keep identical wherever they recur)

| Chinese | English |
|---|---|
| 星河……這一次，別再來找我了。 | Xinghe… this time, don't come looking for me. |
| 星河，這一次，換我來找你了。 | Xinghe, this time it's my turn to find you. |
| ……我會找到妳的。 | …I'll find you. |
| 妳不是一個人在發光。 | You're not shining alone. |
| 爹，我好累……讓我走吧。 | Papa, I'm so tired… let me go. |
| 我想知道我是誰。 | I want to know who I am. |
| 希望她不要想起來就離開。 | I hope she doesn't remember… and leave. |
| 一盞燈由一人點亮，容易熄滅；由千人點亮，永不熄滅。 (Lantern Mother's idea) | A lamp lit by one is fragile; a lamp lit by a thousand never goes out. |
| 但只要還有人記得，就不算結束。 | But as long as someone remembers, it isn't over. |

## 8. Names of things (for consistency)

### Party skills
| Chinese | English | | Chinese | English |
|---|---|---|---|---|
| 螢火斬 | Firefly Slash | | 清心曲 | Heartsease Air |
| 護燈訣 | Lantern Ward | | 水月 | Moon on Water |
| 流螢亂舞 | Firefly Frenzy | | 渡魂謠 | Song of Crossing |
| 燎原 | Prairie Blaze | | 解厄 | Dispel Woe |
| 劍氣縱橫 | Sweeping Sword Qi | | 潮生曲 | Song of the Rising Tide |
| 星墜劍 | Starfall Sword | | 回魂 | Soul Recall |
| 九份燈火 | Lights of Jiufen | | 月霧護身曲 | Moonmist Aegis |
| 焚天劍氣 | Skyburner | | 海潮 | Night Tide |
| 照魂 | Soulshine | | 流風曲 | Mountain Breeze Air |
| 星河倒懸 | Inverted Star River | | 甘霖 | Sweet Rain |
| 赤焰龍吟 | Crimson Dragon's Roar | | 映月 | Moon Reflected |
| 劍落千星 | A Thousand Falling Stars | | 鎮魂曲 | Requiem |
| 心火・燃燈 / 照夜 / 不滅 | Heartfire: Kindling / Nightlight / Undying | | 燈海 | Sea of Lanterns |
| 萬燈・螢火燎天 (ult.) | Fireflies Ablaze | | 歸潮 | Returning Tide |
| 紅纓點 | Crimson Point | | 彼岸・渡魂 (ult.) | Far Shore Ferry |
| 橫掃千軍 | Sweep the Legions | | 雷/火/水/金/土符 | Thunder/Fire/Water/Metal/Earth Talisman |
| 蓄勢 | Coiled Strength | | 定身符 | Binding Talisman |
| 連環槍 | Chain Thrusts | | 召喚糰子 | Go, Tuanzi! |
| 破甲 | Armor Breaker | | 迷魂扇 | Bewitching Fan |
| 梨花槍 | Pear Blossom Spear | | 五雷正法 | Rite of Five Thunders |
| 回馬槍 | Turnabout Thrust | | 回春符 | Renewal Talisman |
| 怒焰紅纓 | Wrathfire Tassel | | 封印符 | Sealing Talisman |
| 鹿港怒潮 | Lukang Riptide | | 毒蕈粉 | Toadstool Powder |
| 鐵騎破陣 | Iron Cavalry Charge | | 五行大陣 | Grand Five Phases Array |
| 亂紅飛渡 | Crimson Petal Storm | | 天罡破法 | Dipper Spellbreak |
| 千軍辟易 | Rout of a Thousand | | 三昧真火符 | Samadhi Fire Talisman |
| 洛家劍譜・青鋒 (ult.) | Qingfeng's Legacy | | 九天雷罡 | Ninth Heaven Thunder |
| 紅纓破陣 (ult.) | Red Tassel Rout | | 萬法歸宗 | All Ways, One Source |
| | | | 太虛神雷 | Taixu Divine Thunder |
| | | | 太極・萬符朝宗 (ult.) | Taiji Talisman Storm |

Combo Arts: 星河渡燈 Lantern Ferry · 火樹銀花 Fireworks in Bloom · 雷霆槍陣 Thunderspear ·
雲水禪心 Zen of Cloud and Water · 符火燎原 Talisman Wildfire · 月下紅纓 Moonlit Tassel · 千燈 A Thousand Lanterns.

### Key items & story objects
引魂令 Soul Guide's Token · 引魂槳 Soul Oar · 螢火 (sword) Firefly · 玉笛 Jade Flute · 紅纓槍 Red-Tassel Spear ·
太虛符扇 Taixu Talisman Fan · 白芷的玉牌 Bai Zhi's Jade Tag · 阿土伯的懷錶 Old Tu's Pocket Watch ·
照魂鏡 Soul Mirror · 清虛的信 Qingxu's Letter · 生死簿殘頁 Torn Page of the Ledger · 洛家劍譜 Luo Family Sword
Manual · 夢藤 Dream Vine · 鵝鑾鼻燈火 Eluanbi Flame · 船眼 Boat Eye · 順風旗 Fair-Wind Banner ·
唐山客的家書 The Settler's Letter · 天燈 Sky Lantern · 兒子的家書 A Son's Letter Home.

### Food (evocative English, romanized gloss on first mention)
芋圓 Taro Balls (yuyuan) · 草仔粿 Mugwort Rice Cake (caozaiguo) · 米粉 rice noodles · 米粉湯 Rice Noodle Soup ·
黑白切 heibai qie (assorted cuts) · 柿餅 Dried Persimmons · 擂茶 Pounded Tea (leicha) · 粄條 Flat Rice Noodles
(bantiao) · 仙草 Grass Jelly (xiancao) · 牛舌餅 Ox-Tongue Pastry · 蚵仔煎 Oyster Omelet · 碗粿 Savory Rice
Pudding (wa-kue) · 虱目魚粥 Milkfish Congee · 鳳梨酥 Pineapple Cake ("prosperity comes") · 愛玉 Aiyu Jelly ·
小米酒 Millet Wine · 烏魚子 Mullet Roe (wuyuzi) · 櫻花蝦餅 Sakura Shrimp Cracker · 飛魚乾 Dried Flying Fish ·
釋迦 Sugar Apple · 花蓮麻糬 Hualien Mochi · 黑糖糕 Brown Sugar Cake · 仙人掌冰 Cactus Fruit Ice ·
湯圓 sweet rice dumplings (tangyuan) · 檳榔 betel nut · 便當 lunchbox.

### Enemies (selection — full list in `en_data.js`)
海霧魂 Sea-Mist Wisp · 水鬼 Water Ghost · 水鬼王 Water Ghost King · 鬼燈籠 Ghost Lantern · 礦工魂 Miner's Ghost ·
魔神仔 Mosina · 蕈精 Mushroom Imp · 青竹絲 Bamboo Viper · 虎姑婆 Grandaunt Tiger · 陰兵 Underworld Soldier ·
河伯怨靈 River Wraith · 紙紮人 Paper Effigy · 紙人 Paper Doll · 椅仔姑 Chair Maiden · 九降風精 Jiujiang Wind Sprite ·
山鬼 Mountain Ghost · 風魔 Wind Fiend · 殭屍 Jiangshi · 吊死鬼 Hanged Ghost · 骷髏將 Skeleton General ·
怨婢 Grieving Maid · 怨宴 The Grudge Banquet · 傀儡 Marionette · 瘟鬼 Plague Ghost · 長明宮衛 Temple Guard ·
長明燈傀 Lamp Golem · 冥燈護法 Nether Lamp Warden · 霧精 Fog Spirit · 黑熊精 Black Bear Spirit · 百眼 Hundred Eyes ·
蛇影 Serpent Shade · 心魔 Inner Demon · 蛟 Jiao Dragon · 石像衛 Stone Guardian · 燈蛾 Lamp Moth ·
溺屍兵 Drowned Soldier · 潮怨 Tide Grudge · 貪鬼 Greed Ghost · 海鰻精 Moray Spirit · 落山風靈 Fall-Wind Spirit ·
海妖 Sea Siren · 溺魂 Drowned Soul · 潮病海蛇 Tide-Sick Serpent · 斷崖石靈 Cliff Spirit · 峽谷巨像 Gorge Colossus ·
孤魂 Forsaken Soul · 孤棚餓鬼 Tower Hungry Ghost · 海盜鬼 Pirate Ghost · 玄武宮衛 Xuanwu Guard · 溺魂群 Drowned Throng ·
鯤 Kun · 彼岸花妖 Spider Lily Fiend · 無面鬼 Faceless · 燈塔守 Tower Warden · 回聲 Echo.

## 9. UI conventions

Main menu: 物品 Items · 仙術 Arts · 裝備 Equip · 狀態 Status · 隊伍 Party · 任務 Quests · 心燈 Lanterns · 地圖 Map ·
圖鑑 Bestiary · 存檔 Save · 讀檔 Load · 設定 Settings · 回標題 Title Screen.
Equipment slots: 武器 Weapon · 衣裝 Armor · 頭飾 Head · 鞋履 Feet · 佩飾 Charm.
Toasts: 獲得 X → "Obtained X"; X 加入了隊伍！ → "X joined the party!"; X 領悟了 Y → "X learned Y!";
新任務 → "New quest:"; 完成 → "Completed:"; 目標 → "Objective:".
Field prompts: 對話 Talk · 開啟 Open · 調查 Examine · 先制攻擊 Strike First.
Keep UI labels short (≈12 characters): many panels size themselves from the *Chinese* string length.
Skill and battle-item descriptions must fit **two lines in the battle help box (~95 characters)**;
combo descriptions have the participants appended, so keep them to ~75.
