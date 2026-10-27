# 麻糬 Mochi: Pet Design Pass v2

九份茶樓的大長毛淡三花，感應到燈靈的光，第一眼就認定了白芷。造型身份固定依客戶照片：白色胸前大毛領與白襪「手套」、灰藍與奶油杏色的頭背色塊、黃綠大眼、粉紅鼻、耳尖簇毛、蓬鬆大尾巴；恬靜高雅、從不說話。十款只變化姿勢、配飾與奇幻處理。

- Sheet: `docs/design/v2/mochi_sheet.png`. Cards: `docs/design/v2/mochi/opt01.png` … `opt10.png`
- Source: `tools/design2/mochi.js` (SDF toon renderer + shared cat kit). Build: `node tools/design2/tuanzi_nianer_lantern_mother_build.js mochi`
- Identity is fixed by the client reference (docs/design/REFERENCES.md); the options vary pose, charms and the fantasy treatment.

| # | Name | Direction |
|---|---|---|
| 01 | 茶樓麻糬 *Teahouse Floof* | 原型 canon |
| 02 | 窗邊雲團 *Windowsill Cloud* | 日常 everyday |
| 03 | 玉牌成對 *Matching Jade Tag* | 白芷 Bai Zhi |
| 04 | 水燈守望 *Water-lantern Watch* | 中元 Ghost Month |
| 05 | 藍衫雲肩 *Little Hakka Cape* | 搭檔 partner look |
| 06 | 療癒呼嚕 *Healing Purr* | 戰鬥支援 battle support |
| 07 | 尋靈之鼻 *Spirit-sniffer* | 探索 exploration |
| 08 | 笛聲伴唱 *Flute Duet* | 山歌 folk song |
| 09 | 月下靈貓 *Moonlit Spirit Form* | 靈體 spirit / fantasy |
| 10 | 美濃紙傘 *Oil-paper Umbrella* | 客家 Hakka craft |

## 01 茶樓麻糬: Teahouse Floof

**Idea:** 最忠於照片的原型：坐得端莊、胸前大毛領蓬成一朵雲，黃綠大眼安靜地望著白芷——像是早就在等她。

Closest to the photo: a stately sit, a white ruff like a cloud, big chartreuse eyes quietly on 白芷 — as if she had been waiting for her.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 粉鼻 `#EC9FA8` · 紅繩玉 `#9FD3BD`

**Callouts:** 耳尖簇毛 (lynx ear tips); 黃綠大眼 (big chartreuse eyes); 白毛領 (white cloud ruff); 紅繩玉珠 (red cord & jade bead); 蓬鬆大尾巴 (plume tail)

**Cultural basis:** 頸上紅繩繫一顆小玉珠——與白芷的紅繩玉牌成對；台灣人以紅繩、玉飾護身祈平安。

**3D:** 長毛：軀幹/尾巴用毛團位移（shell/fin 毛髮），耳尖簇毛；三花色塊全為貼圖。

## 02 窗邊雲團: Windowsill Cloud

**Idea:** 茶樓二樓窗邊的一朵雲：趴成麵包，對著白芷慢慢眨眼——貓的「我愛你」。

A cloud on the teahouse’s upstairs sill: loafed, giving 白芷 a long slow blink — the cat way of saying “I love you”.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 袖口淺藍 `#A9C9E6` · 粉鼻 `#EC9FA8`

**Callouts:** 慢眨眼 (slow blink of affection); 淺藍絲帶 (pale-blue silk bow); 長毛麵包 (long-haired loaf)

**Cultural basis:** 淺藍絲帶取自白芷藍衫的袖口色；茶樓窗台曬太陽的貓是九份山城的日常風景。

**3D:** 麵包趴姿；慢眨眼為眼皮混合動畫（idle 隨機觸發）；絲帶蝴蝶結為兩個扁橢球＋結。

## 03 玉牌成對: Matching Jade Tag

**Idea:** 白芷把紅繩上的玉牌分她一半——兩塊「白芷」玉牌一大一小；她抬頭望向遠處，和白芷一樣像在聽什麼聲音。

白芷 shares her red-string jade tag — a big one and a small one. Mochi gazes up and away, just like 白芷, as if listening for something far off.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 玉白綠 `#9FD3BD` · 紅繩 `#B3262B`

**Callouts:** 小玉牌 (little jade tag); 望向遠方 (faraway gaze, like 白芷); 白毛領 (white cloud ruff)

**Cultural basis:** 玉牌與紅繩：台灣人佩玉保平安、紅線結緣；與女主角定稿造型（v2 #02）的紅繩玉牌成對。

**3D:** 坐姿、頭部上揚 15°（向上的視線）；玉牌為擺錘骨骼，刻字為法線貼圖。

## 04 水燈守望: Water-lantern Watch

**Idea:** 中元夜，她趴在一盞水燈頭旁守著；燈光映在眼裡，像兩顆小月亮——她是第一個發現白芷從海上漂回來的。

On Ghost-Month night she keeps watch beside a water lantern; its light sits in her eyes like two small moons. She was the first to see 白芷 drift back from the sea.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 燈紅 `#C8332E` · 燈火 `#FFC870`

**Callouts:** 水燈頭 (house-shaped water lantern); 眼中燈火 (lantern light in her eyes); 盤起的大尾巴 (plume tail curled round)

**Cultural basis:** 中元普渡「放水燈」：紙紮水燈頭（屋形）順水漂流，為水中孤魂照路；為本作開場的核心意象。

**3D:** 人面獅身趴姿；水燈頭為發光道具（可作場景光源）；眼睛高光加入燈色反射。

## 05 藍衫雲肩: Little Hakka Cape

**Idea:** 白芷用藍衫剩下的布，替她縫了一件小雲肩——靛藍底、淺藍滾邊；她穿上之後坐得更挺了。

白芷 sewed her a tiny cloud collar from the leftover 藍衫 cloth — indigo with pale-blue piping. Mochi sits even taller in it.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 藍衫靛 `#36598A` · 袖口淺藍 `#A9C9E6`

**Callouts:** 小雲肩 (tiny cloud collar); 淺藍滾邊 (pale-blue piping); 端莊 (composed and proud)

**Cultural basis:** 雲肩：傳統婦女禮服的披肩飾；配色取自客家藍衫（女主角定稿 v2 #02），成為一對「客家伴侶裝」。

**3D:** 坐姿；雲肩為肩頸部一片布料網格（4 片雲頭），隨身體骨骼變形。

## 06 療癒呼嚕: Healing Purr

**Idea:** 戰鬥中她閉上眼開始呼嚕，一圈圈水色光環從身上漾開，像水面的漣漪——同伴的傷口跟著慢慢合起來。

In battle she closes her eyes and purrs; rings of water-light ripple out from her like a pond surface — and her allies’ wounds close with them.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 水光 `#7FD3FF` · 玉白綠 `#9FD3BD`

**Callouts:** 水色光環 (water-light ripples); 閉眼呼嚕 (eyes closed, purring); 水珠 (floating droplets)

**Cultural basis:** 水屬性治療：取「水能潤物」的五行意象；漣漪造型呼應她與白芷共有的「海／水燈」母題。

**3D:** 坐姿閉眼＋呼嚕震動（細微縮放）；漣漪光環為 3 個擴散的 emissive 圓環特效，水珠為粒子。

## 07 尋靈之鼻: Spirit-sniffer

**Idea:** 她總能比人早一步找到藏起來的靈物：伸長脖子、鬍鬚往前，嗅著一朵在草叢裡發光的靈菇。

She always finds hidden spirit-things first: neck stretched, whiskers forward, sniffing a glowing spirit mushroom in the grass.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 靈菇青 `#7FFFD0` · 靈菇紫 `#B68CFF`

**Callouts:** 前伸的鼻子 (nose forward, whiskers up); 發光靈菇 (glowing spirit mushroom); 高翹大尾 (plume tail held high)

**Cultural basis:** 台灣山林常見的發光菌（螢光小菇）結合本作「靈視」主題；田野中貓狗嗅出異物的日常觀察。

**3D:** 行走姿勢頭部前伸；靈菇為發光道具，作為「可調查」提示的場景物件。

## 08 笛聲伴唱: Flute Duet

**Idea:** 白芷吹〈渡魂謠〉的時候，她會坐在玉笛旁邊，仰頭「喵」一聲接上——全隊公認她只會唱這一首。

When 白芷 plays “渡魂謠” she sits by the jade flute, lifts her chin and chirps along — the party agrees it is the only song she knows.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 玉笛 `#9FD3BD` · 紅繩 `#B3262B`

**Callouts:** 「喵～」 (chirping along); 白芷的玉笛 (白芷’s jade flute); 白毛領 (white cloud ruff)

**Cultural basis:** 客家山歌對唱的「接歌」傳統；玉笛（竹笛形制）為女主角的武器與樂器。

**3D:** 坐姿仰頭、張嘴（chirp 口型）；玉笛為場景道具；音符為 2D 特效。

## 09 月下靈貓: Moonlit Spirit Form

**Idea:** 白芷想起自己是燈靈的那一夜，她身上的白毛也泛起月光，三花色塊變成淡淡的水墨——她一直都不只是貓。

The night 白芷 remembers she is the lamp spirit, Mochi’s white coat glows with moonlight and her patches fade to ink-wash — she was never only a cat.

**Palette:** 月白 `#EAF4FF` · 淡墨 `#AEB8C6` · 淡杏 `#F2DCC0` · 黃綠眼 `#C9D84A` · 月光 `#BFE8FF` · 玉白綠 `#9FD3BD`

**Callouts:** 月光白毛 (moonlit coat); 燈靈光點 (lamp-spirit motes); 更沉靜的眼 (even stiller eyes)

**Cultural basis:** 民間「貓有九命、通靈」之說；造型以水墨暈染與月光為主，不援引任何特定神祇。

**3D:** 行走姿勢＋全身 emissive 遮罩（白毛區）；周身飄浮光球為粒子；色塊改用淡化版貼圖。

## 10 美濃紙傘: Oil-paper Umbrella

**Idea:** 九份下雨的時候，白芷替她撐開一把小油紙傘插在身邊；她坐在傘下，像一幅客家花布上的畫。

When it rains in 九份, 白芷 plants a little oil-paper umbrella beside her; sitting under it she looks like a picture on Hakka floral cloth.

**Palette:** 雪白 `#F5F2EC` · 灰藍 `#9BA3AE` · 奶油杏 `#EBC79D` · 黃綠眼 `#C9D84A` · 傘面朱 `#C8432B` · 竹骨 `#B89A5A`

**Callouts:** 美濃油紙傘 (Meinong oil-paper umbrella); 雨中的安靜 (quiet in the rain); 圍住腳的大尾巴 (tail wrapped round her paws)

**Cultural basis:** 美濃油紙傘：客家傳統工藝，竹骨、棉紙、桐油，傘面繪花；「紙」與「子」諧音，有早生貴子、遮風避雨之意。

**3D:** 坐姿；油紙傘為場景道具（竹骨傘面＝細分圓錐＋肋條），傘面花紋為貼圖。
