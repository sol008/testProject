# 糰子 Tuanzi: Pet Design Pass v2

觀音山太虛觀的石虎精靈：會說人話、什麼都吃、動不動就驚慌，吃了靈蕈之後還會一本正經地發表宇宙真理。花紋依真實台灣石虎：額頭白線、白頰線、圓耳背白斑、斑點毛、環紋尾——只是肚子被雲歸餵得特別圓。

- Sheet: `docs/design/v2/tuanzi_sheet.png`. Cards: `docs/design/v2/tuanzi/opt01.png` … `opt10.png`
- Source: `tools/design2/tuanzi.js` (SDF toon renderer + shared cat kit, leopard coat). Build: `node tools/design2/tuanzi_nianer_lantern_mother_build.js tuanzi`

| # | Name | Direction |
|---|---|---|
| 01 | 山野本色 *Field-guide Tuanzi* | 寫實向 naturalistic |
| 02 | 符貼額頭 *Talisman on the Forehead* | 太虛觀 comedy |
| 03 | 紅龜粿小偷 *Red-turtle-cake Thief* | 貪吃 glutton |
| 04 | 驚慌失措 *Full Panic* | 招牌表情 signature |
| 05 | 靈菇開示 *Mushroom Enlightenment* | 迷幻 psychedelic |
| 06 | 酒葫蘆 *Gourd Hideout* | 雲歸 Yun Gui |
| 07 | 斗笠雲遊 *Little Wanderer* | 旅途 travel |
| 08 | 八卦護身 *Bagua Guardian* | 戰鬥召喚 battle summon |
| 09 | 石虎真身 *Spirit-beast True Form* | 覺醒形態 awakened / fantasy |
| 10 | 符扇午睡 *Nap on the Fan* | 日常 everyday |

## 01 山野本色: Field-guide Tuanzi

**Idea:** 最貼近真實石虎的版本：四足站姿、真實花紋，只把肚子吃圓；可愛來自圓肚與一臉心虛的表情。

The real Formosan leopard cat, honestly drawn — just overfed. The cute is in the belly and the guilty look.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 紅繩 `#B3262B` · 古銅 `#A8743A`

**Callouts:** 額白雙線 (twin white forehead lines); 耳背白斑 (white ear-back spots); 紅繩方孔錢 (red cord & cash coin); 環紋粗尾 (thick ringed tail); 吃圓的肚子 (the famous belly)

**Cultural basis:** 花紋依台灣石虎實際特徵：額頭兩條白線、白頰線、圓耳背白斑、斑點毛色、環紋尾。頸上紅線繫一枚方孔銅錢——民間給孩子與家畜壓煞保平安。

**3D:** 四足站姿骨架；花紋全走貼圖；尾 8 節骨骼。

## 02 符貼額頭: Talisman on the Forehead

**Idea:** 他一緊張就到處亂竄，雲歸乾脆在他額頭貼一張鎮定符——他就這樣頂著符紙，一臉「我很冷靜」地坐著。

Whenever he panics he bolts, so 雲歸 slapped a calming talisman on his forehead — and there he sits, paper and all, insisting he is perfectly calm.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 符黃 `#F2E6C2` · 朱砂 `#C8282A`

**Callouts:** 鎮定符 (calming talisman); 「我很冷靜」 (“I am perfectly calm”); 圓肚 (round belly)

**Cultural basis:** 道教黃紙朱砂符；「額頭貼符」是台灣與港片殭屍片的經典畫面，這裡反用為喜劇——只是安神符，不涉任何神祇。

**3D:** 坐姿；符紙為貼在頭部骨骼上的薄片網格（可隨頭擺動），符文為貼圖。

## 03 紅龜粿小偷: Red-turtle-cake Thief

**Idea:** 拜拜桌上的紅龜粿少了一個——他趴在旁邊，嘴角還有紅色，抱著另一個說：「這個是我替你們試吃的。」

A red turtle cake is missing from the offering table — he lies beside it, red crumbs on his chin, hugging another: “I was taste-testing it for you.”

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 紅龜紅 `#D2343A` · 米白 `#F6EEDC`

**Callouts:** 紅龜粿 (red turtle cake); 「我是試吃」 (“just taste-testing”); 又圓了一圈 (even rounder)

**Cultural basis:** 紅龜粿：台灣祭祀與壽誕常見的紅色龜印米食，象徵長壽吉祥；拜拜後分食供品是民間習俗（他只是提早了）。

**3D:** 人面獅身趴姿、前腳抱物；紅龜粿為獨立道具，龜殼紋路為法線＋貼圖。

## 04 驚慌失措: Full Panic

**Idea:** 他的招牌表情：耳朵平貼、眼睛瞪成兩顆銅錢、毛炸開一圈、尾巴蓬成雞毛撢子——通常只是因為看到一隻蟑螂。

His signature look: ears pinned, eyes like two copper coins, fur puffed out, tail a feather duster — usually because of a cockroach.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 驚嚇白 `#FFFFFF` · 紅繩 `#B3262B`

**Callouts:** 銅錢眼 (eyes like copper coins); 飛機耳 (ears pinned back); 雞毛撢子尾 (feather-duster tail)

**Cultural basis:** 台灣石虎個性機警怕人；把「炸毛」與「瞪眼」誇張成喜劇節拍，是他與雲歸的固定笑點。

**3D:** 站姿＋炸毛（毛團位移加大）；耳朵骨骼後壓；瞳孔縮成點（眼睛貼圖切換）。

## 05 靈菇開示: Mushroom Enlightenment

**Idea:** 偷吃了雲歸的靈菇之後，他盤腿浮在半空，瞳孔變成兩個漩渦，頭上冒出一朵發光小菇，一本正經地說：「萬物……都是糰子。」

After stealing 雲歸’s spirit mushrooms he floats cross-legged, spiral-eyed, a glowing mushroom sprouting on his head, solemnly declaring: “All things… are Tuanzi.”

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 靈菇青 `#7FFFD0` · 迷幻紫 `#B68CFF`

**Callouts:** 漩渦眼 (spiral eyes); 頭頂靈菇 (mushroom sprouting on his head); 幾何光環 (sacred-geometry halo)

**Cultural basis:** 本作「靈視」主題的喜劇版：道家打坐、內景圖的幽默挪用；發光菌取材台灣山林螢光菇。不描繪任何神祇。

**3D:** 蓮花坐姿＋整體上浮；漩渦瞳為眼睛貼圖；靈菇與周身幾何光環為 emissive 道具。

## 06 酒葫蘆: Gourd Hideout

**Idea:** 雲歸的大酒葫蘆是他最愛的靠枕：抱著葫蘆打瞌睡，偶爾舔一口塞子——然後臉紅一整個下午。

雲歸’s big wine gourd is his favourite pillow: he dozes hugging it, licks the stopper now and then — and stays pink-cheeked all afternoon.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 葫蘆褐 `#C48A3C` · 紅繩 `#B3262B`

**Callouts:** 雲歸的酒葫蘆 (雲歸’s wine gourd); 微醺 (tipsy and pink); 環紋尾 (ringed tail)

**Cultural basis:** 葫蘆：道士與遊方者裝酒、裝藥的容器，諧音「福祿」；與雲歸定稿造型（v2 #01）的酒葫蘆同款。

**3D:** 麵包趴姿靠著葫蘆道具；臉頰紅暈為貼圖疊加。

## 07 斗笠雲遊: Little Wanderer

**Idea:** 環島旅途上他自己背著一個小包袱、戴著小斗笠走在雲歸前面——包袱裡全是零食。

On the round-the-island journey he trots ahead of 雲歸 with his own little bundle and bamboo hat — the bundle is entirely snacks.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 竹篾黃 `#C9A86A` · 包袱藍 `#3d4a63`

**Callouts:** 小斗笠 (tiny bamboo hat); 零食包袱 (snack bundle); 環紋尾 (ringed tail)

**Cultural basis:** 斗笠與包袱：清代台灣行旅的標準行頭；「雲遊」是道士四處行走修行之意。

**3D:** 行走循環；斗笠為頭部附件、包袱為背部附件（布料擺動）。

## 08 八卦護身: Bagua Guardian

**Idea:** 被雲歸召喚上場時，他胸前的八卦牌亮起，腳下浮出一圈雷紋——他會很帥地站好三秒，然後躲到雲歸身後。

Summoned into battle, his bagua pendant lights up and a ring of thunder-script spreads at his feet — he poses heroically for three seconds, then hides behind 雲歸.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 雷青 `#9BE36A` · 古銅 `#C9A043`

**Callouts:** 發光八卦牌 (glowing bagua pendant); 雷紋光環 (thunder-script ring); 帥三秒 (heroic (for 3 seconds))

**Cultural basis:** 八卦牌與雷紋：取材正一派法器與雷法意象（對應雲歸的木／雷屬性），僅作護身器物，不描繪神祇。

**3D:** 站姿；八卦牌 emissive；腳下光環為地面貼花特效（旋轉動畫）。

## 09 石虎真身: Spirit-beast True Form

**Idea:** 真正危險的時候，他會變回山神坐騎般的石虎真身：身形拉長、斑紋燃起金色光點、尾巴拖著靈火——但肚子還是圓的。

In real danger he takes his true spirit-beast form: longer and leaner, rosettes burning with gold sparks, a trail of spirit-fire on his tail — though the belly stays round.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 靈金 `#FFD27A` · 靈火 `#FF9A3C`

**Callouts:** 燃光斑紋 (glowing rosettes); 尾端靈火 (spirit-fire tail); 肚子還是圓的 (still round)

**Cultural basis:** 台灣原生石虎是瀕危的山林精靈象徵；「靈獸真身」為奇幻處理，金色斑點呼應他的燈火與五行之金。

**3D:** 站姿（加長軀幹）；斑紋 emissive 遮罩；尾端靈火為粒子＋發光球。

## 10 符扇午睡: Nap on the Fan

**Idea:** 雲歸的符扇一攤開，就成了他的床：肚子朝天、四腳亂伸，睡到打呼——這把扇子從此只能拿來搧他。

Once 雲歸 opens his talisman fan, it becomes a bed: belly up, paws everywhere, snoring — and from then on the fan is only good for fanning him.

**Palette:** 石虎黃褐 `#C49A62` · 墨斑 `#3B2A1E` · 腹白 `#F3ECDD` · 耳背黑 `#2B2320` · 扇面 `#EFE7D3` · 扇骨 `#8A5A34`

**Callouts:** 雲歸的符扇 (雲歸’s talisman fan); 睡到打呼 (snoring); 肚子朝天 (belly to the sky)

**Cultural basis:** 摺扇與符：道士以扇作法器的意象（雲歸武器「符扇」）；扇面寫「太虛」二字，呼應太虛觀。

**3D:** 人面獅身側躺變體（腹部朝上的 idle 動畫）；摺扇為場景道具，扇面字為貼圖。
