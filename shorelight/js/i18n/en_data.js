// English (American) data dictionary for 《彼岸燈》 Shorelight: characters, enemies (names, bestiary
// entries, boss phase lines), encounter areas, items, skills (player, combo, ultimate, 糰子 outcomes, enemy).
// Terminology is documented in tools/i18n/GLOSSARY.md. Keys shared with en_ui.js (speaker names, place
// names) are defined only once, in en_ui.js.
'use strict';
G.I18N.add({
  // ================================================================================ characters.js
  '燈籠舖學徒': 'Lantern-Shop Apprentice',
  '九份陳記燈籠舖的學徒。嘴上逞強、遇事先慌，關鍵時刻卻比誰都勇敢。劍法均衡，攻守皆宜。':
    'Apprentice at the Chen Family Lantern Shop in Jiufen. Talks big, panics first, and turns out braver than anyone when it counts. A balanced swordsman, as good on defense as on offense.',
  '海上來的少女': 'The Girl from the Sea',
  '乘著水燈頭從海上漂來的少女。只記得一首「渡魂謠」，和一塊刻著名字的玉牌。以笛聲療傷、安魂。':
    'A girl who drifted in from the sea aboard a great water-lantern float. All she remembers is one song, the "Song of Crossing," and a jade tag carved with her name. Her flute mends wounds and soothes restless souls.',
  '鹿港洛家槍': 'Spear of the Luo Clan',
  '鹿港洛家的繼承人，追查滅門仇人「鬼面」。嘴硬心軟，偷偷喜歡可愛的東西，廚藝是場災難。槍快力沉，不擅術法。':
    'Heir of the Luo clan of Lukang, hunting "Ghost Mask," the swordsman blamed for her family\'s massacre. Sharp tongue, soft heart, a secret weakness for cute things, and a cook of catastrophic talent. Fast, heavy spearwork; little gift for the Arts.',
  '太虛觀道士': 'Taoist of Taixu Temple',
  '觀音山太虛觀的道士，愛喝米酒、愛讀禁書、更愛研究蘑菇。身邊總跟著一隻胖石虎「糰子」。符籙五行俱全，專攻弱點。':
    'A Taoist of Taixu Temple on Mount Guanyin who loves rice wine, forbidden books, and—above all—mushrooms. Always trailed by Tuanzi, a chubby leopard-cat spirit. His talismans span all Five Phases, so he hunts for weak spots.',

  // ================================================================================ enemies.js
  // ---- progression (chapter names as written in the data table) ----
  '序章 夢': 'Prologue: A Dream',
  '九份燈火': 'Lights of Jiufen',
  '霧林天燈': 'Sky Lanterns in the Mist',
  '觀音艋舺': 'Guanyin and Bangka',
  '竹塹風起': 'Winds over Zhuqian',
  '鹿港舊夢': 'Old Dreams of Lukang',
  '府城長明': "Tainan's Eternal Light",
  '雲山入夢': 'Dreaming in the Cloud Peaks',
  '逆潮': 'Reverse Tide',
  '王船南行': 'The King Boat Sails South',
  '後山巡境': 'Beyond the Back Mountains',
  '黑水溝・彼岸': 'Black Tide, Far Shore',

  // ---- prologue: dream ----
  '海霧魂': 'Sea-Mist Wisp',
  '黑色海面上升起的霧，隱約有一張臉。據說是還沒想起自己名字的魂，在燈橋邊徘徊。':
    'Mist rising off a black sea, with the faint suggestion of a face. They say it is a soul that has not yet remembered its own name, lingering by the bridge of lanterns.',
  '夢境・燈橋': 'Dreamscape · Lantern Bridge',

  // ---- ch1 Jiufen ----
  '礦坑蝙蝠': 'Mine Bat',
  '舊金礦坑深處成群倒掛的蝙蝠。礦工說，牠們吃了太多黃金的灰，連眼睛都是金色的。':
    'Bats that hang in clusters deep in the old gold mine. The miners swear they have swallowed so much gold dust that even their eyes have turned golden.',
  '礦工魂': "Miner's Ghost",
  '礦坑崩塌時沒能出來的礦工。還在黑暗裡一下一下地敲著岩壁，以為天就快亮了。':
    'A miner who never made it out when the tunnel collapsed. He is still tapping at the rock in the dark, one blow at a time, sure that dawn is almost here.',
  '舊金礦坑': 'The Old Gold Mine',
  '沙蟹精': 'Sand Crab Spirit',
  '八斗子礁岩間的大沙蟹，殼上長滿了藤壺。中元夜會爬上岸，偷吃普渡桌上的供品。':
    'A huge sand crab from the reefs of Badouzi, its shell crusted with barnacles. On Ghost Festival night it scuttles ashore to steal from the offering tables.',
  '水鬼': 'Water Ghost',
  '溺死在海裡的人，要找到一個替身才能離開——這叫「抓交替」。燈火不明的年頭，牠們會沿著石階爬上山城。':
    'Those who drowned at sea can only move on by dragging down a substitute to take their place—"catching a replacement." In years when the lights grow dim, they climb the stone stairs into the hill town.',
  '鬼燈籠': 'Ghost Lantern',
  '被人遺忘在屋簷下的舊燈籠，紙破了、骨架還在，裡面點著一團不知道是誰的藍火。':
    'An old lantern forgotten under the eaves. The paper is torn but the frame holds, and inside burns a blue flame that belongs to no one knows whom.',
  '八斗子海岸': 'Badouzi Shore',
  '長明宮的使者，披著烏鴉羽毛的黑斗篷。說話慢條斯理、自命不凡，非常在意自己的髮型。':
    'Envoy of the Temple of Eternal Light, wrapped in a black cloak of crow feathers. Speaks slowly, thinks highly of himself, and cares very, very much about his hair.',
  '水鬼王': 'Water Ghost King',
  '在黑水溝底下等了最久的那一個。牠身後拖著的，是所有被牠抓去當替身的人。':
    'The one who has waited longest at the bottom of the Black Tide. Trailing behind it are everyone it ever dragged down as a substitute.',
  '九份・中元夜': 'Jiufen · Ghost Festival Night',

  // ---- ch2 Misty Wood ----
  '魔神仔': 'Mosina',
  '穿紅衣、個子矮小的山精，喜歡牽著旅人在山裡繞圈子，還會請你吃「大餐」——其實是泥巴和蚱蜢。':
    'A mosina—a tiny mountain imp in red who loves leading travelers around in circles, then treating them to a "feast" that turns out to be mud and grasshoppers.',
  '蕈精': 'Mushroom Imp',
  '霧林裡吸飽了月光的大蕈，會搖搖擺擺地走路。雲歸堅持牠們「只是有點害羞」。':
    'A great mushroom of the Misty Wood, so full of moonlight it waddles about on its own. Yun Gui insists they are "just a little shy."',
  '竹精': 'Bamboo Spirit',
  '百年的老竹成了精，風吹過時沙沙作響，像是在說悄悄話。':
    'A century-old bamboo grown into a spirit. When the wind blows through it, it rustles as if whispering secrets.',
  '青竹絲': 'Bamboo Viper',
  '藏在竹葉間的翠綠毒蛇，尾巴尖是紅色的。山裡人說：看到竹子在動，先別伸手。':
    'A jade-green viper hidden among bamboo leaves, the tip of its tail red. Mountain folk say: if the bamboo moves, keep your hands to yourself.',
  '獼猴精': 'Macaque Spirit',
  '成群結隊的台灣獼猴，修出了一點道行，也修出了更多壞心眼。專搶旅人的便當。':
    'Formosan macaques that cultivated a little spiritual power—and a lot more mischief. They specialize in stealing travelers\' lunchboxes.',
  '山豬精': 'Wild Boar Spirit',
  '獠牙比柴刀還長的大山豬。一旦衝起來，連牠自己也停不下。':
    'A great wild boar with tusks longer than a machete. Once it starts charging, not even it can stop.',
  '鹿港洛家槍的傳人。以為星河就是「鬼面」的同夥。她出手時其實留了三分力——只是嘴上不承認。':
    'Heir to the Luo clan spear of Lukang, convinced Xinghe is in league with "Ghost Mask." She is actually holding back a little—not that she would ever admit it.',
  '霧林': 'The Misty Wood',
  '虎姑婆': 'Grandaunt Tiger',
  '專挑大人不在家的夜晚，扮成阿婆來敲門的老虎精。半夜在被窩裡喀啦喀啦嚼的，她說是「花生」。':
    'A tiger spirit who comes knocking disguised as a kindly granny on nights when the grown-ups are away. That crunch-crunch under the covers at midnight? "Just peanuts," she says.',
  '虎姑婆洞': "Grandaunt Tiger's Lair",
  '平溪・十分': 'Pingxi · Shifen',

  // ---- ch3 Tamsui / Guanyin / Bangka ----
  '陰兵': 'Underworld Soldier',
  '陰間的兵，本該隨著城隍出巡。燈火搖晃之後，有一隊走錯了路，一直在河口來回行軍。':
    'Soldiers of the underworld who should be marching in the City God\'s procession. When the light began to waver, one squad took a wrong turn and has been marching back and forth at the river mouth ever since.',
  '河伯怨靈': 'River Wraith',
  '淡水河口沉船的怨氣聚成的靈。水退的時候，河底會傳來敲船板的聲音。':
    'A wraith formed from the grief of ships sunk at the mouth of the Tamsui River. When the tide goes out, you can hear knocking on hull planks from the riverbed.',
  '鼠精': 'Rat Spirit',
  '港口倉庫裡偷吃米糧長大的老鼠，越吃越胖、越活越精。子鼠屬水。':
    'A rat raised on stolen rice in the harbor warehouses—the more it eats, the fatter and craftier it gets. The Rat of the zodiac belongs to Water.',
  '石猴': 'Stone Monkey',
  '觀音山石頭裡蹦出來的猴子，皮膚是安山岩。喜歡蹲在廟埕的石獅子旁邊假裝自己也是石雕。':
    'A monkey that sprang from the rocks of Mount Guanyin, with skin of andesite. It likes to squat beside the stone lions in temple courtyards, pretending to be a statue too.',
  '戴著鬼面具的劍客，夜襲太虛觀。他的劍路——紅纓一眼就認得出來。':
    'A swordsman in a ghost mask who raided Taixu Temple by night. His swordplay is something Hongying recognizes at a glance.',
  '觀音山・太虛觀': 'Mount Guanyin · Taixu Temple',
  '紙紮人': 'Paper Effigy',
  '燒給往生者的紙紮童僕。畫上眼睛的那一刻就該燒掉——這一批，沒有燒。':
    'Paper servants made to be burned as offerings for the dead. The moment the eyes are painted on, they must go into the fire. This batch never did.',
  '椅仔姑': 'Chair Maiden',
  '附在竹椅上的小女孩的魂。從前被虐待、早早死去，只想有人陪她玩。不是惡靈——只是太寂寞了。':
    'The soul of a little girl bound to a bamboo chair. Mistreated in life and taken too young, all she wants is someone to play with. She isn\'t evil—just terribly lonely.',

  // ---- ch4 Zhuqian ----
  '九降風精': 'Jiujiang Wind Sprite',
  '秋冬從北方吹來的九降風，本該把米粉和柿餅吹得又乾又甜。今年的風，夾著溺死者的哭聲。':
    'The Jiujiang wind blows down from the north each autumn, drying rice noodles and persimmons sweet. This year, the wind carries the weeping of the drowned.',
  '竹塹城': 'Zhuqian City',
  '山鬼': 'Mountain Ghost',
  '獨腳的山中精怪，會學人說話。在山路上聽見同伴喊你的名字時，先確認他是不是真的在你身後。':
    'A one-legged mountain goblin that mimics human voices. If you hear a friend call your name on a mountain path, make sure they are really behind you first.',
  '客家庄': 'The Hakka Village',
  '風魔': 'Wind Fiend',
  '五指山風穴裡一盞裂開的長明燈，吸進了太多迷路的魂，和九降風纏在一起，成了風魔。':
    'A cracked eternal lamp in the Wind Cave of Wuzhi Mountain. It swallowed too many lost souls, tangled itself in the Jiujiang wind, and became a fiend.',
  '五指山風穴': 'Wuzhi Mountain Wind Cave',

  // ---- ch5 Lukang ----
  '殭屍': 'Jiangshi',
  '屍身不腐、一跳一跳走路的殭屍。怕桃木、怕糯米、怕雞叫——更怕有人記得牠生前的名字。':
    'A hopping corpse that refuses to rot. It fears peachwood, sticky rice, and the rooster\'s crow—and fears even more that someone might remember its name from life.',
  '吊死鬼': 'Hanged Ghost',
  '懸在樑上、吐著長舌的鬼。會在你耳邊嘆氣，勸你也把繩子套上——千萬別聽。':
    'A ghost dangling from the rafters, its long tongue lolling. It sighs in your ear and urges you to slip the noose on too. Do not listen.',
  '紙人': 'Paper Doll',
  '剪紙剪出來的小人，蓋著一枚紅印。風一吹就飄，飄進誰家，誰家就少一個人。':
    'A little figure cut from paper and stamped with a red seal. It drifts wherever the wind blows—and whichever house it drifts into loses someone.',
  '鹿港・九曲巷': 'Lukang · Nine-Turn Lane',
  '骷髏將': 'Skeleton General',
  '穿著鏽甲的骷髏武將，還在守一扇早就沒人進出的門。他守的是誰？他自己也忘了。':
    'A skeletal general in rusted armor, still guarding a door no one has used in years. Whom is he guarding? He has forgotten too.',
  '怨婢': 'Grieving Maid',
  '大宅裡的婢女，那一夜也沒能逃出去。她還端著茶在走廊上走，一聲聲喊著「小姐」。':
    'A maid of the great house who did not escape that night either. She still walks the halls carrying tea, calling "Miss… Miss…"',
  '怨宴': 'The Grudge Banquet',
  '洛家中元夜那一桌沒吃完的宴席。滿桌的怨氣成了形，還在等主人回來入座。':
    'The banquet the Luo family never finished on that Ghost Festival night. A whole table of resentment has taken shape, still waiting for its hosts to sit down.',
  '洛家古厝': 'The Old Luo Mansion',

  // ---- ch6 Tainan ----
  '傀儡': 'Marionette',
  '長明宮用來辦事的提線傀儡。線的另一頭不知道連到哪裡，有時候線斷了，它還在動。':
    'A string puppet that does the Temple of Eternal Light\'s errands. No one knows where the strings lead. Sometimes they snap, and it keeps moving anyway.',
  '瘟鬼': 'Plague Ghost',
  '瘟疫留下的陰影。鹽水人放蜂炮、迎關帝，就是為了把它們驅散；今年的炮聲裡，它們又回來了。':
    'Shadows left behind by the plague. Yanshui fires its beehive rockets and welcomes Lord Guan to drive them away—yet amid this year\'s fireworks, they have returned.',
  '林投姐': 'Sister Lintou',
  '被負心人騙光家產、在林投樹下自盡的女人。她要的不是報仇——是有人聽她把話說完。':
    'A woman swindled of everything by a faithless lover, who took her own life beneath the screwpine trees. She doesn\'t want revenge—she wants someone to hear her out.',
  '林投林': 'The Screwpine Grove',
  '長明宮衛': 'Temple Guard',
  '長明宮的守衛，手持長戟和長明燈。他們真心相信自己在守護亡者——這正是最可怕的地方。':
    'Guards of the Temple of Eternal Light, bearing halberds and eternal lamps. They truly believe they are protecting the dead—and that is the most frightening part.',
  '長明燈傀': 'Lamp Golem',
  '用長明燈座拼成的巨大傀儡，胸口的燈芯是一個被封住的魂。打碎它，那個魂就能走了。':
    'A giant golem pieced together from eternal-lamp stands. The wick in its chest is a sealed soul. Break it, and that soul can finally go.',
  '冥燈護法': 'Nether Lamp Warden',
  '萬燈閣的守護者，身上掛滿了封著魂魄的燈罐。每一盞燈裡，都有人在敲著玻璃。':
    'Guardian of the Pavilion of Ten Thousand Lamps, hung all over with lantern jars holding sealed souls. In every one of them, someone is tapping on the glass.',

  // ---- ch7 mountains ----
  '霧精': 'Fog Spirit',
  '阿里山雲海裡走散的霧，本該在清晨散去。如今黑潮的氣息爬上了山，它們散不掉了。':
    'Mist that strayed from Alishan\'s sea of clouds and should have melted away at dawn. Now the breath of the dark tide has climbed the mountain, and it cannot fade.',
  '黑熊精': 'Black Bear Spirit',
  '胸前一道白色月牙的台灣黑熊，被潮病纏身而發狂。打倒牠不是為了殺牠——是把纏在牠身上的黑潮打散。':
    'A Formosan black bear with a white crescent moon on its chest, driven mad by tide-sickness. You fight it not to kill it, but to break the dark tide coiled around it.',
  '玉山山徑・雲霧林': 'Jade Mountain Trail · Cloud Forest',
  '百眼': 'Hundred Eyes',
  '靈境裡長滿眼睛的東西。每一隻眼睛都在看你，每一隻看到的你都不太一樣。':
    'A thing of the Vision Realm covered in eyes. Every eye is watching you, and each one sees a slightly different you.',
  '蛇影': 'Serpent Shade',
  '雲蛇遊過之後留下的影子，鱗片上的紋路會呼吸。它不是敵人，只是你還沒準備好看懂它。':
    'The shadow the cloud serpent leaves in its wake; the patterns on its scales breathe. It is not your enemy—you just aren\'t ready to understand it yet.',
  '心魔': 'Inner Demon',
  '長著你的臉，說著你最怕聽到的話。打倒它的方法，是承認它說的有一部分是真的。':
    'It wears your face and says the things you most fear to hear. The way to defeat it is to admit that some of what it says is true.',
  '靈境': 'The Vision Realm',
  '蛟': 'Jiao Dragon',
  '潭底修行未成的蛟，被湖霧下的異光驚醒。牠只是想回到深處繼續睡。':
    'A jiao—a river dragon whose cultivation is unfinished—startled awake in the lake depths by a strange light beneath the mist. It only wants to sink back down and sleep.',
  '石像衛': 'Stone Guardian',
  '燈母祠的石像守衛，守了不知幾百年。它不認得你——但它記得上一個來的人，也有一點像你。':
    'A stone sentinel of the Lantern Mother\'s Shrine, on watch for who knows how many centuries. It doesn\'t know you—but it remembers that the last visitor looked a little like you.',
  '燈蛾': 'Lamp Moth',
  '繞著燈母祠殘火飛舞的大蛾，翅膀上的粉是熄滅的燈灰。':
    'A great moth circling the dying flames of the Lantern Mother\'s Shrine. The dust on its wings is the ash of lamps gone out.',
  '雲歸的師父，被封在燈母祠、身體被長明之力操縱。他的手偶爾會停下——那是他還在裡面抵抗。':
    'Yun Gui\'s master, sealed in the Lantern Mother\'s Shrine, his body puppeted by the power of the Eternal Light. Now and then his hands falter—he is still fighting from within.',
  '日月潭・燈母祠': "Sun Moon Lake · Lantern Mother's Shrine",

  // ---- ch8 Reverse Tide ----
  '溺屍兵': 'Drowned Soldier',
  '逆潮把沉在海底的兵丁送回了岸上。他們排著隊往前走，像是終於接到了回家的命令。':
    'The reverse tide has carried soldiers from the seabed back to shore. They march on in ranks, as if they have finally received orders to go home.',
  '潮怨': 'Tide Grudge',
  '倒流的潮水裡糾纏不散的怨念。它記得所有被大海拿走的東西，一樣都不肯放下。':
    'Resentment tangled in the backward-flowing tide. It remembers everything the sea ever took, and will not let go of a single thing.',
  '北港・遶境夜': 'Beigang · Procession Night',
  '紅纓的哥哥，摘下面具的「鬼面」。他相信逆潮能讓爹娘回來——直到他看見回來的是什麼。':
    'Hongying\'s older brother—"Ghost Mask," unmasked. He believed the reverse tide could bring their parents back, until he saw what actually came back.',
  '安平・觀潮台': 'Anping · Tide-Watching Terrace',

  // ---- ch9 the south ----
  '貪鬼': 'Greed Ghost',
  '半屏山傳說裡那些「兩碗免錢」就吃了兩碗的人。貪心把山挖走了一半，也把他們的魂留在了山腳。':
    'The people in the legend of Banping Mountain who heard "two bowls are free" and ate two. Greed carved away half the mountain, and left their souls stuck at its foot.',
  '海鰻精': 'Moray Spirit',
  '旗後外海礁石洞裡的大海鰻，一口利牙能咬斷船槳。':
    'A giant moray from the reef caves off Qihou. Its fangs can bite an oar clean in two.',
  '打狗・旗後': 'Takao · Qihou',
  '落山風靈': 'Fall-Wind Spirit',
  '每年秋冬從中央山脈直撲恆春半島的落山風。風本無惡意——是潮病讓它忘了什麼時候該停。':
    'The luoshan wind that hurls itself down from the Central Range onto the Hengchun Peninsula every autumn and winter. The wind means no harm—tide-sickness has made it forget when to stop.',
  '海妖': 'Sea Siren',
  '從黑潮深處被潮病逼上來的怪物。牠的歌聲很美，因為那是牠從溺水者那裡學來的。':
    'A monster driven up from the depths of the Kuroshio by tide-sickness. Its song is beautiful, because it learned it from the drowned.',

  // ---- ch10 the east ----
  '溺魂': 'Drowned Soul',
  '黑潮沿岸被潮病喚醒的溺死者。他們的燈早該漂遠了，卻一次又一次被浪打回岸邊。':
    'The drowned of the Kuroshio coast, awakened by tide-sickness. Their lanterns should have drifted far away long ago, yet the waves keep throwing them back ashore.',
  '潮病海蛇': 'Tide-Sick Serpent',
  '隨黑潮洄游的巨大海蛇，鱗片下滲著黑色的潮病。牠撞壞了拼板舟，不是因為兇猛，是因為痛。':
    'A giant sea serpent that migrates with the Kuroshio, black tide-sickness seeping from beneath its scales. It smashed the plank boats not out of savagery, but out of pain.',
  '斷崖石靈': 'Cliff Spirit',
  '清水斷崖的大理石有了靈。它們聽了幾萬年的海浪，最近浪的聲音變了，它們很不安。':
    'The marble of the Qingshui Cliffs has come alive. It has listened to the waves for tens of thousands of years; lately they sound different, and it is uneasy.',
  '台東海岸': 'Taitung Coast',
  '峽谷巨像': 'Gorge Colossus',
  '被潮病侵蝕的大理石巨像，立霧溪的碧水在它腳下變得混濁。它守著峽谷，卻已經不記得在守什麼。':
    'A marble colossus eaten away by tide-sickness; the jade waters of the Liwu River turn murky at its feet. It still guards the gorge, but no longer remembers what it is guarding.',
  '太魯閣峽谷': 'Taroko Gorge',
  '孤魂': 'Forsaken Soul',
  '沒有人祭拜的孤魂，鬼月最後幾夜餓得最兇。頭城人搶孤，搶的不只是供品——也是把它們送走的福氣。':
    'A lonely soul with no one to make offerings for it, hungriest in the last nights of Ghost Month. When Toucheng holds its Ghost Grappling, the prize is not just the offerings—it is the blessing of sending these souls on their way.',
  '孤棚餓鬼': 'Tower Hungry Ghost',
  '盤踞在孤棚頂上、搶光所有供品也吃不飽的大餓鬼。它餓的其實是被人記得。':
    'A great hungry ghost squatting atop the grappling tower, never full no matter how many offerings it grabs. What it truly hungers for is to be remembered.',
  '宜蘭・頭城': 'Yilan · Toucheng',

  // ---- ch11 Black Tide / Far Shore ----
  '海盜鬼': 'Pirate Ghost',
  '在澎湖海域翻覆的海盜船上的亡魂，還在找當年埋在玄武岩縫裡的寶藏。':
    'The dead of a pirate ship that capsized off Penghu, still searching for the treasure they buried in the basalt cracks long ago.',
  '玄武宮衛': 'Xuanwu Guard',
  '玄武嶼長明宮的精銳守衛。他們手中的長明燈，燈芯是黑色的。':
    'Elite guards of the Temple of Eternal Light on Xuanwu Isle. The wicks of the eternal lamps they carry burn black.',
  '又是他。這次他沒整理髮型——他是真的怕了，但還是擋在夜玄的門前。':
    'Him again. This time he hasn\'t fixed his hair—he is truly afraid. And still he stands before Ye Xuan\'s door.',
  '玄武嶼・長明宮': 'Xuanwu Isle · Temple of Eternal Light',
  '溺魂群': 'Drowned Throng',
  '黑水溝裡糾纏成一團的溺魂。「六死三留一回頭」——那六成，都在這裡。':
    'Drowned souls tangled into one mass in the Black Tide. "Six die, three stay, one turns back," the old settlers said of the crossing. The six are all here.',
  '鯤': 'Kun',
  '北冥有魚，其名為鯤。牠游過黑水溝的時候，整片海的燈火都會跟著傾斜。':
    '"In the northern deep there is a fish, and its name is Kun." When it swims through the Black Tide, every light on the sea tilts in its wake.',
  '彼岸花妖': 'Spider Lily Fiend',
  '花開不見葉，葉生不見花。彼岸花原上長出了腳的花，想把過路的魂留下來當葉子。':
    'The spider lily\'s flowers never see its leaves, and its leaves never see its flowers. These blooms of the Far Shore have grown legs, and want to keep passing souls as their leaves.',
  '無面鬼': 'Faceless',
  '被洗去了所有記憶、卻沒能投胎的魂，連臉都忘了。它想要一張臉，你的就很好。':
    'A soul washed clean of every memory that was never reborn; it has even forgotten its face. It wants a face. Yours will do nicely.',
  '彼岸花原': 'The Spider Lily Fields',
  '燈塔守': 'Tower Warden',
  '彼岸燈塔每一層的守門人。歷代燈靈留下的影子，靜靜地問每一個上樓的人：你為什麼而來？':
    'The gatekeeper of each floor of the Shorelight Tower—a shadow left by the lamp spirits of ages past. It quietly asks everyone who climbs: why have you come?',
  '回聲': 'Echo',
  '燈塔裡你自己的回聲。它記得你走過的每一步，也記得你差一點放棄的每一次。':
    'Your own echo within the lighthouse. It remembers every step you have taken—and every time you almost gave up.',
  '彼岸燈塔': 'The Shorelight Tower',
  '萬象童子': 'Myriad-Form Child',
  '一息界裡用光和笑聲做成的孩子，每一秒都在變成別的東西。他們不是在戰鬥——是在玩。':
    'A child of the Realm of One Breath, made of light and laughter, becoming something new every second. They aren\'t fighting—they\'re playing.',
  '夜玄打開了懷中的罐子。「念兒……再等爹一下。」':
    'Ye Xuan opens the jar he holds to his chest. "Nian\'er… wait for Papa just a little longer."',
  '長明宮之主，玄冥法師。二十年前，他在黑水溝接住了女兒的魂燈，從此再也沒有放手。':
    'Master of the Temple of Eternal Light, the Abbot of the Dark Deep. Twenty years ago he caught his daughter\'s soul-lantern on the Black Tide, and he has never let go of it since.',
  '黑潮・無相': 'The Formless Tide',
  '黑潮張開了千萬張嘴——每一張都在喊著一個被遺忘的名字。':
    'The dark tide opens ten million mouths—each one crying out a forgotten name.',
  '沒有形狀的東西，開始變成你們每一個人最害怕失去的樣子。':
    'The shapeless thing begins to take the form of whatever each of you most fears to lose.',
  '逆潮喚醒的、所有被遺忘之物的集合。它沒有臉，因為它是所有人不願記得的那一面。':
    'Everything ever forgotten, gathered and woken by the reverse tide. It has no face, because it is the side of everyone that no one wishes to remember.',
  '一息界': 'The Realm of One Breath',

  // ================================================================================ items.js
  // ---- medicine ----
  '金創藥': 'Wound Salve',
  '跌打損傷的老藥方。回復氣血 120。': 'An old remedy for cuts and bruises. Restores 120 HP.',
  '續命散': 'Life-Mending Powder',
  '藥鋪的上等傷藥。回復氣血 400。': 'The apothecary\'s finest wound powder. Restores 400 HP.',
  '九轉回生丹': 'Ninefold Revival Pill',
  '九轉煉成的靈丹。氣血全滿。': 'An elixir refined through nine cycles of the furnace. Fully restores HP.',
  '還魂香': 'Soul-Return Incense',
  '點燃後，香煙會把迷路的魂引回來。復活一人並回復三成氣血。':
    'Once lit, its smoke guides a wandering soul back home. Revives one ally with 30% HP.',
  '還魂丹': 'Soul-Return Elixir',
  '珍貴的回魂靈藥。復活一人並使氣血全滿。': 'A precious elixir that calls the soul back. Revives one ally with full HP.',
  '解毒草': 'Antidote Herb',
  '山邊常見的青草，嚼起來很苦。解除中毒。': 'A common hillside herb, bitter to chew. Cures Poison.',
  '香包': 'Herbal Sachet',
  '縫著艾草與香料的小布包，聞了神清氣爽。解除睡眠、封印、暈眩、幻境。':
    'Mugwort and spice in a cloth pouch; one sniff clears the head. Cures Sleep, Seal, Stun, Trance.',
  '平安符': 'Peace Charm',
  '廟裡求來的平安符，摺成小小一包。解除異常並護身三回合。':
    'A blessing charm from the temple, folded into a tiny packet. Cures ailments and grants a Shield for 3 turns.',

  // ---- regional food ----
  '芋圓': 'Taro', '芋圓湯': 'Taro Ball Soup',
  '九份阿柑姨的招牌，Q彈香甜。白芷吃第一口時愣住了。回復氣血 80、真氣 10。':
    "Auntie Gan's chewy, sweet taro balls (yuyuan). Bai Zhi froze at the first bite. Restores 80 HP, 10 MP.",
  '草仔粿': 'Mugwort Rice Cake',
  '艾草揉進糯米皮，包著菜脯米。回復氣血 150。':
    'Caozaiguo: mugwort rice dough wrapped around savory dried radish. Restores 150 HP.',
  '米酒': 'Rice Wine',
  '雲歸的最愛。「這是藥引，不是酒。」回復真氣 40。':
    'Yun Gui\'s favorite. "It\'s a medicinal catalyst, not booze." Restores 40 MP.',
  '米粉湯': 'Rice Noodle Soup',
  '艋舺街邊的一碗熱湯，配上黑白切。全體回復氣血 120。':
    'Bangka street-side soup with a plate of heibai qie (assorted cuts). Restores 120 HP to the party.',
  '柿餅': 'Dried Persimmons',
  '新埔九降風吹出來的柿餅，甜得像蜜。回復真氣 50。':
    'Persimmons dried by the Jiujiang wind of Xinpu, sweet as honey. Restores 50 MP.',
  '擂茶': 'Pounded Tea',
  '客家伙房裡用擂缽慢慢磨出來的茶，香氣濃厚。回復真氣 80 並解除中毒。':
    'Leicha: Hakka tea slowly ground in a mortar, rich and nutty. Restores 80 MP and cures Poison.',
  '粄條': 'Flat Rice Noodles',
  '客家庄的米食，滑順有嚼勁。回復氣血 300。':
    'Bantiao from the Hakka village—silky, wide, and pleasantly chewy. Restores 300 HP.',
  '仙草': 'Grass Jelly',
  '關西的仙草煮成黑亮的凍，退火又解熱。回復氣血 150 並解除一切異常。':
    'Guanxi grass jelly (xiancao), glossy black and cooling. Restores 150 HP and cures all ailments.',
  '牛舌餅': 'Ox-Tongue Pastry',
  '鹿港老餅舖的牛舌餅，薄脆酥香。回復氣血 250、真氣 20。':
    'A long, flaky "ox-tongue" pastry from an old Lukang bakery, thin and crisp. Restores 250 HP and 20 MP.',
  '蚵仔煎': 'Oyster Omelet',
  '鹿港海口的鮮蚵，煎得外酥內嫩。回復氣血 350。':
    'Fresh oysters from the Lukang shore, fried crisp outside and tender within. Restores 350 HP.',
  '碗粿': 'Savory Rice Pudding',
  '府城的碗粿，淋上醬油膏。回復氣血 500。':
    'Wa-kue from Tainan: a steamed bowl of savory rice pudding drizzled with thick soy sauce. Restores 500 HP.',
  '虱目魚粥': 'Milkfish Congee',
  '府城人的早餐，一碗熱粥暖到心裡。全體回復氣血 300。':
    'Tainan\'s breakfast of choice—a hot bowl of congee that warms you to the heart. Restores 300 HP to the party.',
  '鳳梨酥': 'Pineapple Cake',
  '「旺來」討個好彩頭。回復氣血 400、真氣 40。':
    'In Taiwanese, "pineapple" sounds like "prosperity comes." Restores 400 HP and 40 MP.',
  '愛玉': 'Aiyu Jelly',
  '嘉義山區的愛玉子搓洗成凍，加點檸檬。回復真氣 100。':
    'Aiyu seeds from the Chiayi hills, washed into a trembling jelly with lemon. Restores 100 MP.',
  '小米酒': 'Millet Wine',
  '主人家熱情遞來的小米酒。依禮輕抿一口，心意比酒更暖。回復真氣 150 並持續回復氣血。':
    "Your hosts' millet wine. A polite sip—the welcome is warmer than the wine. Restores 150 MP; Regen.",
  '烏魚子': 'Mullet Roe',
  '冬天烏魚洄游時做成的珍饈，打狗港的漁家送的。回復氣血 900。':
    'Wuyuzi: cured mullet roe, a winter delicacy from a Takao fishing family. Restores 900 HP.',
  '櫻花蝦餅': 'Sakura Shrimp Cracker',
  '東港的櫻花蝦炸成的餅，紅豔酥脆。全體回復氣血 600。':
    'Donggang\'s tiny sakura shrimp fried into a cracker, ruby-red and crunchy. Restores 600 HP to the party.',
  '飛魚乾': 'Dried Flying Fish',
  '蘭嶼的飛魚曬成魚乾，海風的味道。回復氣血 1200。':
    'Flying fish from Orchid Island, sun-dried until they taste of sea wind. Restores 1200 HP.',
  '釋迦': 'Sugar Apple',
  '台東的釋迦，像佛頭一樣一顆顆的果實，綿密香甜。回復真氣 180。':
    "A Taitung sugar apple, knobbly as a Buddha's curls and creamy inside. Restores 180 MP.",
  '花蓮麻糬': 'Hualien Mochi',
  '軟糯的麻糬，裹著花生粉。全體回復氣血 700。':
    'Soft, pillowy mochi rolled in crushed peanuts. Restores 700 HP to the party.',
  '黑糖糕': 'Brown Sugar Cake',
  '澎湖的黑糖糕，鬆軟Q彈。全體回復氣血 900。':
    'Penghu\'s brown sugar cake, fluffy and bouncy. Restores 900 HP to the party.',
  '仙人掌冰': 'Cactus Fruit Ice',
  '澎湖海邊的紫紅色冰品，酸甜清涼。全體回復真氣 120。':
    'A magenta shaved ice from the Penghu seaside, tangy, sweet, and cool. Restores 120 MP to the party.',

  // ---- spirit items & throwables ----
  '七彩靈蕈': 'Seven-Hued Spirit Mushroom',
  '霧林深處發光的七色蕈。吃下後能得「靈視」，看見藏起來的路與魂；戰鬥中使一名同伴進入「幻境」（暴擊、術法提升，偶爾會恍神）。':
    'Eat for Spirit Sight: see hidden paths and souls. In battle, an ally enters Trance (crit & magic up).',
  '鞭炮': 'Firecrackers',
  '中元普渡剩下的鞭炮。劈哩啪啦，鬼也怕。對敵全體造成 40 點火屬性傷害。':
    'Ghost Festival leftovers—crackle, bang, and even ghosts flinch. 40 Fire damage to all foes.',
  '掌心雷符': 'Palm Thunder Talisman',
  '太虛觀量產的雷符，誰都能丟。對敵一體造成 160 點木屬性傷害。':
    'Mass-produced at Taixu Temple; anyone can throw one. 160 Wood damage to one foe.',
  '鎮邪符': 'Evil-Warding Talisman',
  '對敵一體，高機率封印其術法三回合。': 'High chance to Seal one foe\'s arts for 3 turns.',
  '定身符': 'Binding Talisman',
  '對敵一體，可能使其暈眩一回合。': 'May Stun one foe for 1 turn.',
  '蜂炮': 'Beehive Rockets',
  '鹽水蜂炮的沖天炮，萬箭齊發。對敵全體造成 350 點火屬性傷害。':
    'Bottle rockets from Yanshui\'s beehive festival—ten thousand at once. Deals 350 Fire damage to all foes.',
  '五雷符': 'Five Thunders Talisman',
  '一張就能招來五道雷。對敵全體造成 800 點木屬性傷害。':
    'One sheet calls down five bolts of thunder. Deals 800 Wood damage to all foes.',
  '太極符': 'Taiji Talisman',
  '陰陽交融的符籙。對敵全體造成 1500 點無屬性傷害。':
    'A talisman where yin and yang flow together. Deals 1500 non-elemental damage to all foes.',

  // ---- swords (Xinghe) ----
  '竹劍': 'Bamboo Sword',
  '燈籠舖後院削的練習劍。': 'A practice sword whittled in the lantern shop\'s backyard.',
  '螢火': 'Firefly',
  '陳伯交給星河的劍，劍身裡像有螢光流動。火屬性。':
    'The sword Uncle Chen entrusted to Xinghe; light seems to flow inside the blade like fireflies. Fire element.',
  '青銅古劍': 'Ancient Bronze Sword',
  '平溪老礦工家裡傳下來的古劍。': 'An old sword handed down in a Pingxi miner\'s family.',
  '艋舺精鋼劍': 'Bangka Steel Sword',
  '艋舺打鐵街的好貨，老闆說是「頂港有名聲」。':
    'Quality goods from Bangka\'s smithing street. The owner swears it\'s "famous all up the coast."',
  '九降風劍': 'Jiujiang Wind Sword',
  '竹塹鐵匠在九降風中淬火，劍身輕快。': 'Quenched in the Jiujiang wind by a Zhuqian smith. Light and quick.',
  '百煉鋼劍': 'Hundred-Forged Sword',
  '鹿港老鐵舖百煉而成。': 'Folded a hundred times at an old Lukang forge.',
  '七星劍': 'Seven Star Sword',
  '劍身鑲著北斗七星，府城道壇的法劍。':
    'A ritual sword from a Tainan Taoist altar, its blade inlaid with the seven stars of the Dipper.',
  '寒鐵劍': 'Cold Iron Sword',
  '山中寒鐵鑄成，劍氣森冷。': 'Cast from mountain cold iron; its edge breathes a chill.',
  '鯨骨劍': 'Whalebone Sword',
  '旗後老漁夫以鯨骨嵌鋼打造，入水不鏽。':
    'Steel set in whalebone by an old Qihou fisherman. Never rusts, even in the sea.',
  '燈心・螢火': 'Firefly: Lampheart',
  '燈母之火重燃的螢火，劍身如一盞不滅的燈。火屬性，劍意累積加快。':
    'Firefly, rekindled by the Lantern Mother\'s flame; the blade is a lamp that will never go out. Fire element. Sword Will builds faster.',

  // ---- flutes (Bai Zhi) ----
  '玉笛': 'Jade Flute',
  '白芷醒來時握在手裡的玉笛，吹起來像潮聲。':
    'The jade flute Bai Zhi was holding when she woke. It sounds like the tide.',
  '九份竹笛': 'Jiufen Bamboo Flute',
  '燈籠舖隔壁的竹藝攤做的笛子。': 'Made at the bamboo-craft stall next to the lantern shop.',
  '青嵐笛': 'Blue Mist Flute',
  '平溪山中的老竹製成，吹出的音帶著山嵐。': 'Carved from old Pingxi bamboo; its notes carry mountain mist.',
  '紫竹簫': 'Purple Bamboo Xiao',
  '艋舺樂器行的紫竹洞簫，聲音低沉溫潤。':
    'A purple-bamboo end-blown flute (xiao) from a Bangka music shop, deep and mellow.',
  '山歌竹笛': 'Hill Song Flute',
  '客家庄阿伯送的笛子，說山歌唱得好的人才配吹。':
    'A gift from an old man of the Hakka village, who said only a fine hill-song singer deserves to play it.',
  '鹿港雕花笛': 'Lukang Carved Flute',
  '鹿港木雕師傅刻滿了海浪紋。': 'A Lukang woodcarver covered it in rolling waves.',
  '白玉簫': 'White Jade Xiao',
  '府城古董行的白玉簫，觸手生涼。': 'A white jade xiao from a Tainan antique shop, cool to the touch.',
  '珊瑚笛': 'Coral Flute',
  '南方海底的紅珊瑚做成，聽得見海的心跳。':
    'Made of red coral from the southern seabed. You can hear the sea\'s heartbeat in it.',
  '潮音笛': 'Tidevoice Flute',
  '黑潮之上漂來的笛，吹響時浪會安靜下來。':
    'A flute that drifted in on the Kuroshio. When it plays, the waves fall quiet.',
  '彼岸燈笛': 'Shorelight Flute',
  '彼岸燈的光凝成的笛。治癒之力大增。': 'A flute condensed from the Shorelight\'s glow. Greatly boosts healing.',

  // ---- spears (Hongying) ----
  '紅纓槍': 'Red-Tassel Spear',
  '洛家的紅纓槍，紅纓是她娘親手綁的。': 'The Luo family spear. Her mother tied the red tassel herself.',
  '鑌鐵槍': 'Wootz Steel Spear',
  '淡水碼頭洋行轉賣的好鐵打成。': 'Forged from fine steel resold by a foreign trading house on the Tamsui docks.',
  '竹節鋼槍': 'Bamboo-Joint Spear',
  '槍桿如竹節，剛中帶韌。': 'Its shaft is jointed like bamboo—hard, yet supple.',
  '洛家虎頭槍': 'Luo Tiger-Head Spear',
  '洛家古厝祠堂裡供著的家傳寶槍。': 'The heirloom spear enshrined in the ancestral hall of the old Luo mansion.',
  '麒麟槍': 'Qilin Spear',
  '槍頭鑄成麒麟形，府城兵器鋪的鎮店之寶。':
    'Its head is cast in the shape of a qilin—the prize of a Tainan armory.',
  '寒玉槍': 'Cold Jade Spear',
  '槍尖嵌著寒玉，刺出時帶霜。': 'Its tip is set with cold jade; every thrust leaves frost.',
  '鎮潮槍': 'Tide-Queller Spear',
  '安平老砲台旁找到的長槍，槍身刻著潮紋。': 'Found beside the old Anping battery, its shaft engraved with waves.',
  '旗後鯊牙槍': 'Qihou Sharktooth Spear',
  '槍頭鑲著巨鯊的牙。': 'Tipped with a great shark\'s tooth.',
  '破浪槍': 'Wavebreaker',
  '迎著黑潮也不退的長槍。': 'A spear that will not yield, even to the Kuroshio.',
  '紅纓・青鋒': 'Red Tassel: Qingfeng',
  '哥哥的劍鍛進了槍頭。暴擊率提升。': 'Her brother\'s sword, forged into the spearhead. Raises critical rate.',

  // ---- fans & talismans (Yun Gui) ----
  '太虛符扇': 'Taixu Talisman Fan',
  '太虛觀的符扇，扇骨夾著一疊符紙。扇面上的字是清虛真人寫的。':
    'Taixu Temple\'s talisman fan, a sheaf of talismans tucked between its ribs. The calligraphy on its face is Master Qingxu\'s.',
  '竹骨符扇': 'Bamboo-Rib Fan',
  '竹塹的竹子做的扇骨，風一吹符紙就自己飛出去。':
    'Ribs of Zhuqian bamboo. One breath of wind and the talismans fly out on their own.',
  '硃砂符冊': 'Cinnabar Talisman Book',
  '用鹿港老硃砂畫的一整冊符。': 'A whole book of talismans drawn in aged Lukang cinnabar.',
  '七星符扇': 'Seven Star Fan',
  '扇面畫著北斗，府城道士的珍藏。': 'Painted with the Northern Dipper—a Tainan Taoist\'s treasure.',
  '雲海扇': 'Sea of Clouds Fan',
  '扇開如雲海翻湧。': 'Open it, and a sea of clouds rolls out.',
  '雷霆符匣': 'Thunder Talisman Case',
  '一只裝滿雷符的木匣，打開時會劈啪作響。': 'A wooden case packed with thunder talismans. It crackles when opened.',
  '海風符扇': 'Sea Wind Fan',
  '恆春落山風吹不斷的扇子。': 'A fan not even Hengchun\'s fall wind can break.',
  '黃龍符陣': 'Yellow Dragon Array',
  '一套能自行布陣的符籙。': 'A set of talismans that arrange themselves into formation.',
  '萬法歸宗扇': 'Fan of the One Source',
  '清虛真人留下的扇子，扇面空白——「法無定法」。每回合回復真氣。':
    'The fan Master Qingxu left behind. Its face is blank—"the true way has no fixed form." Restores MP every turn.',

  // ---- armor ----
  '粗布短衫': 'Coarse Cotton Shirt',
  '燈籠舖學徒的工作服，袖口沾著紙漿。': 'A lantern-shop apprentice\'s work shirt, its cuffs stiff with paper paste.',
  '海沫褙子': 'Seafoam Jacket',
  '白芷身上那件繡著浪花的褙子，摸起來像潮濕的月光。':
    'Bai Zhi\'s long open jacket (beizi), embroidered with sea-foam. It feels like damp moonlight.',
  '夾棉短襖': 'Quilted Jacket',
  '九份布莊的厚棉襖，山城夜裡風大。': 'A thick cotton jacket from a Jiufen draper. Hill-town nights are windy.',
  '牛皮甲': 'Oxhide Armor',
  '平溪獵戶做的皮甲。': 'Leather armor made by a Pingxi hunter.',
  '赤羅短袍': 'Crimson Gauze Robe',
  '紅纓的戰袍，外罩黑皮背心。': 'Hongying\'s battle robe, worn under a black leather vest.',
  '太虛道袍': 'Taixu Robe',
  '洗得發白的道袍，腰間繫著太極帶。': 'A Taoist robe washed pale, with a yin-yang sash at the waist.',
  '藍衫': 'Hakka Blue Shirt',
  '客家庄阿姆親手縫的藍衫，樸素耐穿，袖口反摺。':
    'A lanshan sewn by a Hakka village matron—plain, sturdy, with folded-back cuffs.',
  '鹿港錦袍': 'Lukang Brocade Robe',
  '鹿港布行的上等錦緞，暗繡著雲紋。': 'Fine brocade from a Lukang cloth merchant, subtly embroidered with clouds.',
  '鎖子甲': 'Chainmail',
  '府城武館的鎖子甲。': 'Chainmail from a Tainan martial arts school.',
  '雲紋衣': 'Cloud-Pattern Robe',
  '輕如山嵐的衣裳，能擋住林間的瘴氣與木靈之力。':
    'Light as mountain mist; wards off forest miasma and the power of Wood.',
  '避水衣': 'Waterward Coat',
  '浸過桐油與符水，潮水不沾身。': 'Soaked in tung oil and talisman water. The tide won\'t cling to it.',
  '黑潮鱗甲': 'Kuroshio Scale Mail',
  '用黑潮裡大魚的鱗片綴成，又輕又韌。': 'Stitched from the scales of great Kuroshio fish. Light and tough.',
  '燈火羽衣': 'Lantern Feather Robe',
  '千盞心燈的光織成的衣裳。戰鬥開始時持續回復。':
    'A robe woven from the light of a thousand heart lanterns. Starts each battle with Regen.',

  // ---- head ----
  '燈籠髮簪': 'Lantern Hairpin',
  '一支小小的燈籠形髮簪。誰給她的？她不記得了。':
    'A tiny lantern-shaped hairpin. Who gave it to her? She doesn\'t remember.',
  '斗笠': 'Bamboo Hat',
  '遮雨又遮陽。': 'Keeps off the rain and the sun alike.',
  '紅緞髮帶': 'Red Satin Ribbon',
  '紅纓束馬尾的長緞帶。': 'The long satin ribbon that ties back Hongying\'s ponytail.',
  '布頭巾': 'Cloth Headscarf',
  '結實的粗布頭巾。': 'A sturdy headscarf of coarse cloth.',
  '木冠': 'Wooden Crown',
  '雲歸半束髮用的木髮冠。': 'The wooden hair crown Yun Gui uses to tie up half his hair.',
  '花布頭巾': 'Floral Headscarf',
  '客家花布縫的頭巾，大紅牡丹開得熱鬧。':
    'A headscarf of Hakka floral cloth, bursting with big red peonies.',
  '玉冠': 'Jade Crown',
  '府城玉器行的白玉冠。': 'A white jade crown from a Tainan jade shop.',
  '雲紋巾': 'Cloud-Pattern Scarf',
  '山中雲霧般輕柔的頭巾，戴上後心神清明，不入幻境。':
    'A scarf soft as mountain cloud. Keeps the mind clear—prevents Trance.',
  '珊瑚簪': 'Coral Hairpin',
  '紅珊瑚雕的髮簪。': 'A hairpin carved from red coral.',
  '鯤鱗冠': 'Kun-Scale Crown',
  '鯤的鱗片打磨成的冠。': 'A crown polished from a scale of the Kun.',
  '星冠': 'Star Crown',
  '彼岸的星光凝成的冠，戴上後不會被封住心念。':
    'A crown condensed from Far Shore starlight. Its wearer\'s will cannot be Sealed.',

  // ---- feet ----
  '草鞋': 'Straw Sandals',
  '踩過九份每一級石階的草鞋。': 'Straw sandals that have trodden every stone step in Jiufen.',
  '布鞋': 'Cloth Shoes',
  '千層底布鞋。': 'Cloth shoes with thousand-layer soles.',
  '皮靴': 'Leather Boots',
  '紅纓的短皮靴，鞋尖包鐵。': 'Hongying\'s short leather boots, iron-capped at the toe.',
  '雲履': 'Cloud Slippers',
  '道士的布履，走起路來沒有聲音。': 'A Taoist\'s cloth slippers. They make no sound at all.',
  '木屐': 'Wooden Clogs',
  '艋舺街上喀啦喀啦響的木屐。': 'Wooden clogs that clip-clop through the streets of Bangka.',
  '鹿皮靴': 'Deerskin Boots',
  '鹿港皮匠的手工靴。': 'Handmade by a Lukang leatherworker.',
  '登山綁腿': 'Mountain Leg Wraps',
  '山路走得再久也不會腿痠。': 'No matter how long the mountain road, your legs won\'t ache.',
  '踏浪靴': 'Wave-Walker Boots',
  '在甲板上也站得穩。': 'Sure-footed even on a rolling deck.',
  '順風履': 'Fair-Wind Shoes',
  '頭城搶孤後，鄉親送的一雙好鞋。': 'A fine pair of shoes from the people of Toucheng after the Ghost Grappling.',
  '步蓮履': 'Lotus-Step Shoes',
  '每一步都像踏在燈火上。戰鬥開始時搶先行動。':
    'Every step feels like walking on lamplight. Act first at the start of battle.',

  // ---- accessories ----
  '紅線手環': 'Red String Bracelet',
  '陳伯在星河小時候綁上的紅線，說是保平安。':
    'The red string Uncle Chen tied around Xinghe\'s wrist when he was little. For safekeeping, he said.',
  '黑皮護臂': 'Black Leather Bracers',
  '紅纓的護臂，內側刻著一個「洛」字。': 'Hongying\'s bracers, the character "Luo" carved on the inside.',
  '酒葫蘆': 'Wine Gourd',
  '雲歸腰間的葫蘆。「裡面是藥酒，真的。」每回合回復少許真氣。':
    'The gourd at Yun Gui\'s hip. "It\'s medicinal wine. Honestly." Restores a little MP each turn.',
  '雄黃香囊': 'Realgar Sachet',
  '裝著雄黃的香囊，蛇蟲毒物不近身。免疫中毒。':
    'A sachet of realgar that keeps snakes and venomous critters at bay. Immune to Poison.',
  '虎爪項鍊': 'Tiger Claw Necklace',
  '虎姑婆留下的一枚爪子。攻擊提升，暴擊率提升。':
    'A claw left behind by Grandaunt Tiger. Raises Attack and critical rate.',
  '銅鈴': 'Bronze Bell',
  '道士的手搖銅鈴，叮噹聲能喚醒迷魂。免疫睡眠。':
    'A Taoist\'s hand bell; its ring wakes bewitched souls. Immune to Sleep.',
  '糰子毛球': 'Tuanzi Fluffball',
  '糰子掉的毛搓成的小球，軟綿綿。紅纓偷偷收了好幾顆。':
    'A soft little ball rolled from Tuanzi\'s shed fur. Hongying has secretly collected several.',
  '八卦鏡墜': 'Bagua Mirror Pendant',
  '小小的八卦鏡，邪術照了就彈回去。免疫封印。':
    'A tiny bagua mirror that bounces dark arts right back. Immune to Seal.',
  '螢石墜': 'Glowstone Pendant',
  '會在黑暗中微微發光的石頭。劍意累積加快。': 'A stone that glows faintly in the dark. Sword Will builds faster.',
  '秀才毛筆': "Scholar's Brush",
  '竹塹老秀才送的毛筆。「讀萬卷書，行萬里路。」獲得經驗提升。':
    'A gift from an old Zhuqian scholar. "Read ten thousand books; walk ten thousand miles." Increases EXP gained.',
  '榕葉結': 'Banyan Leaf Knot',
  '老榕樹的葉子編成的結，生生不息。戰鬥開始時持續回復。':
    'A knot woven from old banyan leaves—life without end. Starts each battle with Regen.',
  '古錢串': 'String of Old Coins',
  '一串磨得發亮的古錢。戰鬥獲得的銀兩增加。': 'A string of old coins rubbed shiny. Increases coins won in battle.',
  '夜明珠': 'Night-Shining Pearl',
  '府城古董行的夜明珠，夜裡亮如小燈。': 'A pearl from a Tainan antique shop that shines like a small lamp at night.',
  '清心玉珮': 'Clear Heart Jade',
  '溫潤的玉珮，心神不亂。免疫幻境與暈眩。': 'A smooth, warm jade pendant that steadies the mind. Immune to Trance and Stun.',
  '海星墜': 'Starfish Pendant',
  '恆春海邊撿到的海星化石。': 'A fossil starfish found on the Hengchun shore.',
  '蓮花燈墜': 'Lotus Lantern Pendant',
  '一盞小小的蓮花燈，裡面亮著所有被渡過的人的光。':
    'A tiny lotus lantern, glowing with the light of everyone you helped across.',

  // ---- materials ----
  '霧林小蕈': 'Misty Wood Mushroom',
  '霧林裡常見的小蕈。雲歸：「可以吃，但不建議。」':
    'A common little mushroom of the Misty Wood. Yun Gui: "Edible. Not recommended."',
  '月光蕈': 'Moonlight Mushroom',
  '只在滿月夜發光的蕈。糰子的蕈菇清單之一。': 'A mushroom that glows only under a full moon. One of Tuanzi\'s mushroom list.',
  '風穴石耳': 'Wind Cave Rock Tripe',
  '五指山風穴岩壁上長的石耳。': 'A lichen that grows on the rock walls of the Wuzhi Mountain Wind Cave.',
  '雲芝': 'Cloud Lingzhi',
  '雲霧林中的靈芝，紋路像雲。': 'A lingzhi from the cloud forest, its rings shaped like clouds.',
  '潮汐蕈': 'Tidal Mushroom',
  '只長在退潮礁岩上的奇怪蕈類。': 'An odd mushroom that grows only on reef rock at low tide.',
  '彼岸蕈': 'Far Shore Mushroom',
  '彼岸花原上唯一不是紅色的東西。': 'The only thing in the Spider Lily Fields that isn\'t red.',

  // ---- key items ----
  '引魂令': "Soul Guide's Token",
  '陳伯交給星河的令牌，引魂人的信物。持有它的人，迷途的魂會願意聽他說話。':
    'A token Uncle Chen gave to Xinghe—the badge of a Soul Guide. Lost souls will listen to whoever carries it.',
  '阿土伯的懷錶': "Old Tu's Pocket Watch",
  '舊金礦坑裡找到的懷錶，停在礦坑崩塌的那一刻。':
    'A pocket watch found in the old gold mine, stopped at the moment the tunnel collapsed.',
  '白芷的玉牌': "Bai Zhi's Jade Tag",
  '刻著「白芷」二字的玉牌。背面有一道看不清的燈紋。':
    'A jade tag carved with the name "Bai Zhi." On the back is a faint lantern pattern you can\'t quite make out.',
  '引魂槳': 'Soul Oar',
  '陳伯的槳。槳面刻滿了被渡過的名字。': 'Uncle Chen\'s oar. Its blade is carved with the names of everyone he ferried across.',
  '天燈': 'Sky Lantern',
  '平溪的天燈，四面寫滿了願望。': 'A Pingxi sky lantern, all four sides covered in wishes.',
  '兒子的家書': "A Son's Letter Home",
  '平溪老夫婦的兒子寫的信，一直沒有寄到。': 'A letter from the old Pingxi couple\'s son. It never arrived.',
  '照魂鏡': 'Soul Mirror',
  '太虛觀的古鏡，能照出魂魄的本相。': 'An ancient mirror of Taixu Temple that shows a soul\'s true form.',
  '清虛的信': "Qingxu's Letter",
  '清虛真人留在太虛觀的信：「若我未歸，往南，沿海路，經竹塹。」':
    'A letter Master Qingxu left at Taixu Temple: "If I do not return, go south by the coast road, through Zhuqian."',
  '生死簿殘頁': 'Torn Page of the Ledger',
  '竹塹城隍廟的生死簿缺了一頁，上面的名字被風吹散了。':
    'A page missing from the Ledger of Life and Death at Zhuqian\'s City God Temple. The names on it were scattered by the wind.',
  '洛家劍譜': 'Luo Family Sword Manual',
  '青鋒最後交給紅纓的劍譜。邊角寫著小小的字：「給阿纓。」':
    'The sword manual Qingfeng gave Hongying at the very end. In the corner, in small writing: "For Ying."',
  '夢藤': 'Dream Vine',
  '藤婆的雲霧林裡才長的藤，入夢禮的藥引。只能在藤婆的指引下使用。':
    'A vine that grows only in Granny Teng\'s cloud forest—the heart of the dreaming rite. To be used only under her guidance.',
  '鵝鑾鼻燈火': 'Eluanbi Flame',
  '燈塔守留下的火種，要用來點亮王船的燈。': 'An ember left by the lighthouse keeper, to light the lamps of the King Boat.',
  '船眼': 'Boat Eye',
  '達悟族長者送的刻紋船眼，能指引船隻平安回家。':
    'A carved boat-eye charm given by a Tao elder. It guides boats safely home.',
  '順風旗': 'Fair-Wind Banner',
  '頭城搶孤奪下的順風旗，最後的航程需要它。':
    'The Fair-Wind Banner seized at Toucheng\'s Ghost Grappling. The final voyage will need it.',
  '唐山客的家書': "The Settler's Letter",
  '黑水溝上一個溺死的唐山客託付的信，寫著回不去的家鄉地址。':
    'A letter entrusted to you on the Black Tide by a drowned settler from the mainland, addressed to a home he can never return to.',

  // ================================================================================ skills.js
  // ---- Shen Xinghe (Fire · sword) ----
  '螢火斬': 'Firefly Slash',
  '劍走螢光，一斬帶火。火屬性單體攻擊。': 'The blade trails firefly light, and the cut catches fire. Fire attack on one foe.',
  '護燈訣': 'Lantern Ward',
  '像護著風中燈火一樣護住同伴。我方一人防禦提升。':
    'Shield a friend the way you\'d cup a flame against the wind. Raises one ally\'s Guard.',
  '流螢亂舞': 'Firefly Frenzy',
  '劍光如夏夜流螢四散，隨機連擊四次。': 'Sword-light scatters like fireflies on a summer night. 4 hits on random foes.',
  '燎原': 'Prairie Blaze',
  '星火燎原，以劍引火掃過敵陣。火屬性全體術法。':
    'A single spark sets the prairie ablaze—the sword drags fire across the enemy line. Fire Art on all foes.',
  '劍氣縱橫': 'Sweeping Sword Qi',
  '劍氣橫掃全場。全體物理攻擊。': 'Sword qi sweeps the whole field. Physical attack on all foes.',
  '星墜劍': 'Starfall Sword',
  '躍起如流星墜地，一劍貫入。火屬性單體重擊。':
    'Leap, then fall like a meteor, driving the blade home. Heavy Fire strike on one foe.',
  '九份燈火': 'Lights of Jiufen',
  '想起山城的萬家燈火，暖意流遍全隊。我方全體回復。':
    'The memory of the hill town\'s countless lit windows warms the whole party. Heals all allies.',
  '焚天劍氣': 'Skyburner',
  '劍氣化為烈焰捲向天際。火屬性全體物理攻擊。':
    'Sword qi turns to flame and roars toward the sky. Physical Fire attack on all foes.',
  '照魂': 'Soulshine',
  '以心中之火照見妖邪本相。火屬性單體術法，可能封住敵人術法。':
    'The fire in his heart reveals a demon\'s true face. Fire Art on one foe; may Seal its arts.',
  '星河倒懸': 'Inverted Star River',
  '劍光倒捲如天上銀河傾瀉。全體三連擊。': 'Sword-light pours down like the Milky Way upended. 3 hits on all foes.',
  '赤焰龍吟': "Crimson Dragon's Roar",
  '火龍隨劍長吟而出。火屬性全體強力術法。': 'A fire dragon bursts forth with a roar at the sword\'s call. Powerful Fire Art on all foes.',
  '劍落千星': 'A Thousand Falling Stars',
  '漫天星光化劍而落。隨機八連擊。': 'The starlit sky falls as swords. 8 hits on random foes.',
  '心火・燃燈': 'Heartfire: Kindling',
  '燃起自己的心火，分給每一個人。我方全體回復並持續回復。':
    'He lights his own heartfire and shares it with everyone. Heals all allies and grants Regen.',
  '心火・照夜': 'Heartfire: Nightlight',
  '一盞心燈照亮長夜。火屬性全體強力攻擊。': 'One heart lantern lights the long night. Powerful Fire attack on all foes.',
  '心火・不滅': 'Heartfire: Undying',
  '只要燈還亮著，就不讓任何人倒下。復活同伴並回復大半氣血。':
    'As long as the lamp still burns, no one falls. Revives an ally with most of their HP.',
  '萬燈・螢火燎天': 'Fireflies Ablaze',
  '【奧義】劍意化作萬點螢火，燎盡眼前一切陰霾。火屬性全體大傷害。':
    '[Ultimate] Sword Will becomes ten thousand fireflies that burn away every shadow before him. Massive Fire damage to all foes.',

  // ---- Bai Zhi (Water · flute) ----
  '清心曲': 'Heartsease Air',
  '一段清亮的笛音撫平傷痛。我方一人回復。': 'A clear, bright melody that soothes pain. Heals one ally.',
  '水月': 'Moon on Water',
  '月影落水，化作冷冽水刃。水屬性單體術法。':
    'The moon\'s reflection falls into the water and becomes a cold blade. Water Art on one foe.',
  '渡魂謠': 'Song of Crossing',
  '那首只有她記得的歌。使敵方全體可能入睡。': 'The one song only she remembers. May put all foes to Sleep.',
  '解厄': 'Dispel Woe',
  '笛聲如清泉，洗去身上的厄運。解除我方一人的異常狀態。':
    'Flute notes like spring water wash away misfortune. Cures one ally\'s ailments.',
  '潮生曲': 'Song of the Rising Tide',
  '如潮水漫過沙灘，溫柔地回復我方全體。': 'Like the tide washing over sand, gently heals all allies.',
  '回魂': 'Soul Recall',
  '在魂燈將熄之前，把它輕輕喚回。復活同伴並回復四成氣血。':
    'Before a soul-lantern gutters out, softly call it back. Revives an ally with 40% HP.',
  '月霧護身曲': 'Moonmist Aegis',
  '月下輕霧籠罩同伴。我方全體防禦提升。': 'Light moonlit mist wraps around your friends. Raises all allies\' Guard.',
  '海潮': 'Night Tide',
  '喚來八斗子的夜潮。水屬性全體術法。': 'Calls in the night tide of Badouzi. Water Art on all foes.',
  '流風曲': 'Mountain Breeze Air',
  '輕快如山風的曲子。我方全體速度提升。': 'A tune as light and quick as a mountain breeze. Raises all allies\' Speed.',
  '甘霖': 'Sweet Rain',
  '久旱逢甘霖。我方全體持續回復。': 'Sweet rain after a long drought. Grants Regen to all allies.',
  '映月': 'Moon Reflected',
  '把月光盛進傷口裡。我方一人大幅回復並解除異常。':
    'She pours moonlight into the wound. Greatly heals one ally and cures ailments.',
  '鎮魂曲': 'Requiem',
  '安撫躁動的魂靈。敵方全體可能被封印，術法下降。':
    'Quiets restless spirits. May Seal all foes and lowers their Magic.',
  '燈海': 'Sea of Lanterns',
  '千萬水燈在曲聲中亮起。我方全體大幅回復並解除異常。':
    'Ten thousand water lanterns light up to her song. Greatly heals all allies and cures ailments.',
  '歸潮': 'Returning Tide',
  '讓迷途的潮水回到大海。水屬性全體強力術法。': 'Sends the lost tide home to the sea. Powerful Water Art on all foes.',
  '彼岸・渡魂': 'Far Shore Ferry',
  '【奧義】她唱出完整的渡魂謠。我方全體大幅回復、解除異常，並復活倒下的同伴。':
    '[Ultimate] She sings the Song of Crossing in full. Greatly heals all allies, cures ailments, and revives the fallen.',

  // ---- Luo Hongying (Metal · spear) ----
  '紅纓點': 'Crimson Point',
  '槍尖一點，紅纓翻飛。金屬性單體攻擊。': 'One flick of the spear tip, and the red tassel flies. Metal attack on one foe.',
  '橫掃千軍': 'Sweep the Legions',
  '長槍橫掃。全體物理攻擊。': 'A wide sweep of the spear. Physical attack on all foes.',
  '蓄勢': 'Coiled Strength',
  '「笨蛋，退後。」凝神蓄勢，自身攻擊大幅提升。':
    '"Get back, idiot." She focuses and gathers her strength. Greatly raises her own Attack.',
  '連環槍': 'Chain Thrusts',
  '三槍連環，一氣呵成。單體三連擊。': 'Three thrusts in one unbroken breath. 3 hits on one foe.',
  '破甲': 'Armor Breaker',
  '專挑甲冑縫隙下手。單體攻擊並降低防禦。': 'Aims for the gaps in the armor. Attacks one foe and lowers its Guard.',
  '梨花槍': 'Pear Blossom Spear',
  '槍影如梨花紛落。隨機五連擊。': 'Spear-shadows fall like pear blossoms. 5 hits on random foes.',
  '回馬槍': 'Turnabout Thrust',
  '佯退回身，一槍穿心。金屬性單體重擊。':
    'Feint a retreat, then whirl back and strike for the heart. Heavy Metal strike on one foe.',
  '怒焰紅纓': 'Wrathfire Tassel',
  '紅纓燃起怒火。火屬性全體物理攻擊。': 'The red tassel catches fire with her fury. Physical Fire attack on all foes.',
  '鹿港怒潮': 'Lukang Riptide',
  '如鹿港港口的大潮拍岸。水屬性全體兩連擊。':
    'Like the great tide pounding Lukang harbor. 2 Water hits on all foes.',
  '鐵騎破陣': 'Iron Cavalry Charge',
  '一人一槍，如千騎破陣。單體重擊，可能使敵暈眩。':
    'One woman, one spear, like a thousand horsemen breaking the line. Heavy strike on one foe; may Stun.',
  '亂紅飛渡': 'Crimson Petal Storm',
  '紅纓亂舞如落花飛渡。隨機七連擊。': 'The tassel whirls like falling petals on the wind. 7 hits on random foes.',
  '千軍辟易': 'Rout of a Thousand',
  '一槍之威，千軍退避。金屬性全體強力攻擊。':
    'A single spear, and a thousand soldiers fall back. Powerful Metal attack on all foes.',
  '洛家劍譜・青鋒': "Qingfeng's Legacy",
  '【奧義】以槍代劍，使出哥哥留下的洛家劍法。單體九連擊。':
    '[Ultimate] Her spear becomes a sword for the Luo swordplay her brother left her. 9 hits on one foe.',
  '紅纓破陣': 'Red Tassel Rout',
  '【奧義】洛家槍法終式，槍影如紅浪席捲敵陣。全體大傷害。':
    '[Ultimate] The final form of the Luo spear: a crimson wave of spear-shadows sweeps the enemy line. Massive damage to all foes.',

  // ---- Yun Gui (Wood · talisman fan) ----
  '雷符': 'Thunder Talisman',
  '「急急如律令。」木屬性（雷）單體術法。': '"Swift as the law commands!" Wood (thunder) Art on one foe.',
  '火符': 'Fire Talisman',
  '符紙自燃，化為火鴉。火屬性單體術法。': 'The paper bursts into flame and becomes a fire crow. Fire Art on one foe.',
  '水符': 'Water Talisman',
  '扇一揮，憑空起浪。水屬性單體術法。': 'One sweep of the fan raises a wave from thin air. Water Art on one foe.',
  '金符': 'Metal Talisman',
  '符化飛劍。金屬性單體術法。': 'The talisman turns into a flying sword. Metal Art on one foe.',
  '土符': 'Earth Talisman',
  '地裂石起。土屬性單體術法。': 'The ground splits and stones rise. Earth Art on one foe.',
  '貼上就不能動——理論上。可能使敵人暈眩。': 'Slap it on and they can\'t move—in theory. May Stun one foe.',
  '召喚糰子': 'Go, Tuanzi!',
  '「糰子，上！」……至於牠會做什麼，連雲歸自己也不知道。':
    '"Tuanzi, go!" …As for what he\'ll actually do, not even Yun Gui knows.',
  '糰子炸毛撲上去一陣亂抓！': 'Tuanzi puffs up and pounces in a frenzy of claws!',
  '糰子縮成一顆毛球滾了過去！': 'Tuanzi curls into a furball and rolls right over them!',
  '糰子從懷裡掏出私藏的芋圓分給大家……雖然有點黏。':
    'Tuanzi produces a secret stash of taro balls and shares them around… a little sticky, though.',
  '糰子打起呼嚕，聲音療癒得連妖怪都睏了。': 'Tuanzi starts purring—so soothing that even the monsters get drowsy.',
  '糰子翻肚賣萌。敵人戰意全消，紅纓也差點放下槍。':
    'Tuanzi rolls over and shows his belly. The enemy loses all will to fight, and Hongying nearly drops her spear.',
  '糰子吃了一朵靈蕈，開始講解「宇宙是一顆會呼吸的芋圓」。敵人聽得頭昏腦脹。':
    'Tuanzi eats a spirit mushroom and begins a lecture: "The universe is a taro ball that breathes." The enemy\'s heads are spinning.',
  '糰子放了一個……帶著蕈味的屁。': 'Tuanzi lets one rip… with a distinct mushroomy bouquet.',
  '糰子打了個哈欠，原地睡著了。': 'Tuanzi yawns and falls asleep right where he stands.',
  '糰子雙眼放光——石虎神威！天雷滾滾！': 'Tuanzi\'s eyes blaze—behold the might of the leopard cat! Thunder rolls!',
  '迷魂扇': 'Bewitching Fan',
  '扇面一開，香氣迷人。敵方全體攻擊下降。': 'The fan opens in a cloud of intoxicating scent. Lowers all foes\' Attack.',
  '五雷正法': 'Rite of Five Thunders',
  '太虛觀正傳雷法。木屬性全體術法。': 'The orthodox thunder rite of Taixu Temple. Wood Art on all foes.',
  '回春符': 'Renewal Talisman',
  '「我只是剛好會，不是想當大夫。」我方一人回復並持續回復。':
    '"I just happen to know how. I\'m not trying to be a doctor." Heals one ally and grants Regen.',
  '封印符': 'Sealing Talisman',
  '封住敵人的術法。': 'Seals a foe\'s arts.',
  '毒蕈粉': 'Toadstool Powder',
  '「這是學術研究用的。」撒出蕈粉，敵方全體可能中毒。':
    '"This is for academic research." Scatters mushroom powder; may Poison all foes.',
  '五行大陣': 'Grand Five Phases Array',
  '五色符籙布陣，相生相剋。無屬性全體術法。':
    'Talismans of five colors form an array of creation and destruction. Non-elemental Art on all foes.',
  '天罡破法': 'Dipper Spellbreak',
  '破盡護身之法。敵方全體防禦、術法下降。': 'Shatters every protective ward. Lowers all foes\' Guard and Magic.',
  '三昧真火符': 'Samadhi Fire Talisman',
  '燒不盡的真火。火屬性全體強力術法。': 'True fire that never burns out. Powerful Fire Art on all foes.',
  '九天雷罡': 'Ninth Heaven Thunder',
  '九天雷罡應召而下。木屬性全體強力術法。':
    'The thunder of the ninth heaven answers the summons. Powerful Wood Art on all foes.',
  '萬法歸宗': 'All Ways, One Source',
  '所有符籙化為一道光。無屬性單體極大傷害。':
    'Every talisman becomes a single beam of light. Enormous non-elemental damage to one foe.',
  '太虛神雷': 'Taixu Divine Thunder',
  '師父最後的傳授。雷落太虛，木屬性全體極大傷害，可能使敵暈眩。':
    'His master\'s final lesson. Thunder falls from the Great Void: enormous Wood damage to all foes; may Stun.',
  '太極・萬符朝宗': 'Taiji Talisman Storm',
  '【奧義】千張符籙如雪紛飛，五行輪轉。無屬性全體大傷害，並降低敵方防禦。':
    '[Ultimate] A thousand talismans whirl like snow as the Five Phases turn. Massive non-elemental damage to all foes and lowers their Guard.',

  // ---- Tuanzi outcomes ----
  '糰子亂抓': 'Flurry of Claws',
  '毛球滾滾': 'Rolling Furball',
  '私藏芋圓': 'Secret Taro Balls',
  '療癒呼嚕': 'Soothing Purr',
  '翻肚賣萌': 'Belly-Up Cuteness',
  '宇宙芋圓論': 'Cosmic Taro Ball Theory',
  '蕈味之屁': 'Mushroom Toot',
  '原地睡著': 'Instant Nap',
  '石虎神威': 'Leopard Cat Majesty',

  // ---- Combo Arts ----
  '星河渡燈': 'Lantern Ferry',
  '【合擊・星河＋白芷】劍火點燈，笛聲送行，一河燈火渡盡陰霾。全體術法大傷害。':
    'A river of lanterns, lit by the sword and sent off by the flute. Massive Art damage to all foes.',
  '火樹銀花': 'Fireworks in Bloom',
  '【合擊・星河＋紅纓】火劍銀槍交錯，如元宵煙火綻放。全體三連擊。':
    'Fire sword and silver spear burst like Lantern Festival fireworks. 3 hits on all foes.',
  '雷霆槍陣': 'Thunderspear',
  '【合擊・紅纓＋雲歸】雷符附槍，一槍引落九天之雷。木屬性單體極大傷害，可能暈眩。':
    'Talisman meets spear, and heaven strikes. Huge Wood damage to one foe; may Stun.',
  '雲水禪心': 'Zen of Cloud and Water',
  '【合擊・白芷＋雲歸】笛聲與符光相和。我方全體大幅回復並持續回復。':
    'Flute song and talisman light in harmony. Greatly heals all allies and grants Regen.',
  '符火燎原': 'Talisman Wildfire',
  '【合擊・星河＋雲歸】劍引符火，燒遍山野。火屬性全體術法。':
    'The sword leads talisman-fire across hill and field. Fire Art on all foes.',
  '月下紅纓': 'Moonlit Tassel',
  '【合擊・白芷＋紅纓】月光凝在槍尖。水屬性單體重擊並降低敵人防禦。':
    'Moonlight gathers on the spear tip. Heavy Water strike on one foe; lowers its Guard.',
  '千燈': 'A Thousand Lanterns',
  '【合擊・四人】「妳不是一個人在發光。」一路上被渡過的每一盞心燈一同亮起。全體極大傷害。':
    '"You\'re not shining alone." Every lantern blazes. Huge damage.',

  // ---- enemy skills: generic ----
  '撞擊': 'Ram',
  '利爪': 'Claw',
  '噬咬': 'Bite',
  '斬擊': 'Slash',
  '突刺': 'Thrust',
  '陰寒之觸': 'Grave-Cold Touch',
  '重擊': 'Heavy Blow',
  '防禦姿態': 'Defensive Stance',
  '狂怒': 'Rage',
  '聚魂': 'Gather Souls',

  // ---- enemy skills: dream / Jiufen / mine / Badouzi ----
  '海霧': 'Sea Mist',
  '抓交替': 'Seek a Substitute',
  '冰冷的手抓住腳踝往下拖。': 'Ice-cold hands seize your ankles and drag you down.',
  '鬼火': 'Will-o\'-Wisp',
  '幽光': 'Eerie Glow',
  '群蝠': 'Bat Swarm',
  '尖嘯': 'Shriek',
  '十字鎬': 'Pickaxe',
  '礦工的嘆息': "Miner's Sigh",
  '「金仔……都挖去哪了……」': '"The gold… where did it all go…"',
  '大螯夾': 'Big Pincer',
  '吐泡': 'Bubble Spit',
  '鴉羽紛飛': 'Crow-Feather Flurry',
  '漆黑的羽毛像刀片一樣落下。': 'Jet-black feathers rain down like razors.',
  '長明咒印': 'Eternal Light Hex',
  '本使者不陪你玩了': "I Shan't Play With You",
  '墨鴉優雅地整理羽毛。': 'Mo Ya preens his feathers elegantly.',
  '黑羽旋風': 'Black-Feather Whirlwind',
  '黑水倒灌': 'Black Water Surge',
  '呼喚替身': 'Call the Substitutes',
  '水裡又爬出了東西。': 'Something else crawls out of the water.',

  // ---- enemy skills: Misty Wood / Grandaunt Tiger / Pingxi ----
  '牽路': 'Lead Astray',
  '紅衣小孩笑嘻嘻地牽起你的手……': 'A giggling child in red takes you by the hand…',
  '請吃大餐': 'Treat You to a Feast',
  '一把泥巴和蚱蜢塞進嘴裡。': 'A fistful of mud and grasshoppers, straight into your mouth.',
  '孢子雲': 'Spore Cloud',
  '毒孢': 'Toxic Spores',
  '竹刺': 'Bamboo Spike',
  '竹林沙沙': 'Rustling Grove',
  '毒牙': 'Venom Fang',
  '橫衝直撞': 'Reckless Charge',
  '亂丟果子': 'Fruit Barrage',
  '扮鬼臉': 'Make Faces',
  '虎爪': 'Tiger Claw',
  '阿婆唱歌給你聽': 'Granny Sings You a Song',
  '「乖囝仔，睏喔……」': '"Hush, little one, go to sleep…"',
  '嚼花生': 'Crunching Peanuts',
  '「阿婆在吃花生啦。」喀啦喀啦……她回復了氣血。': '"Granny\'s just eating peanuts, dear." Crunch, crunch… She recovers HP.',
  '猛虎撲': 'Tiger Pounce',
  '橫掃': 'Sweep',
  '「就這點本事？」': '"Is That All You\'ve Got?"',

  // ---- enemy skills: Tamsui / Guanyin / Bangka ----
  '陰兵長矛': 'Underworld Spear',
  '陰兵過境': 'Ghost March',
  '石拳': 'Stone Fist',
  '啃咬': 'Gnaw',
  '鼠群': 'Rat Swarm',
  '河底哀聲': 'Riverbed Lament',
  '拖入河底': 'Drag Under',
  '紙刃': 'Paper Blade',
  '畫上的眼睛': 'Painted Eyes',
  '椅仔姑搖搖': 'Rocking Chair Maiden',
  '「椅仔姑，椅仔姑，請你來坐……」': '"Chair Maiden, Chair Maiden, come and sit with me…"',
  '無人記得的眼淚': 'Tears No One Remembers',
  '鬼面劍': 'Ghost Mask Blade',
  '洛家劍・連環': 'Luo Sword: Chain',
  '紅纓一怔——這是洛家的劍法。': 'Hongying freezes—that is Luo family swordplay.',
  '鬼影步': 'Ghost Step',
  '月牙劍氣': 'Crescent Sword Qi',

  // ---- enemy skills: Zhuqian / Hakka village / Wind Cave ----
  '風刃': 'Wind Blade',
  '九降哀風': 'Mournful Gale',
  '風裡夾雜著溺死者的哭聲。': 'The wind carries the weeping of the drowned.',
  '投石': 'Stone Throw',
  '學人聲': 'Mimic Voice',
  '山鬼學著同伴的聲音喊你的名字。': 'The mountain ghost calls your name in a friend\'s voice.',
  '風穴漩渦': 'Cave Vortex',
  '裂風爪': 'Gale Claw',
  '吞魂': 'Devour Souls',
  '風魔吸入了周圍的魂魄。': 'The Wind Fiend inhales the souls around it.',
  '腐風': 'Rotting Wind',

  // ---- enemy skills: Lukang / Luo mansion ----
  '跳撲': 'Hopping Lunge',
  '屍氣': 'Corpse Breath',
  '白綾纏頸': 'Silk Noose',
  '長舌嘆息': 'Long-Tongued Sigh',
  '斷刀連斬': 'Broken Blade Combo',
  '怨婢哭聲': "Maid's Wail",
  '「小姐……小姐……」': '"Miss… Miss…"',
  '冷掉的茶': 'Cold Tea',
  '怨宴・腐席': 'Banquet: Rotten Feast',
  '桌上的菜餚早已腐爛。': 'The dishes on the table rotted long ago.',
  '怨宴・敬酒': 'Banquet: A Toast',
  '「中元夜，喝一杯吧——喝完就一起留下來。」': '"It\'s Ghost Festival night, have a drink—and then stay with us forever."',
  '怨宴・掀桌': 'Banquet: Table Flip',
  '上菜': 'Next Course',
  '紙人捧著盤子走上來。': 'A paper doll steps forward bearing a dish.',

  // ---- enemy skills: Tainan / Yanshui / Screwpine Grove / Temple of Eternal Light ----
  '瘴氣': 'Miasma',
  '病手': 'Sickly Touch',
  '長明戟': 'Eternal Halberd',
  '長明燈照': 'Eternal Lamplight',
  '燈光照得人頭暈目眩。': 'The lamplight leaves you dizzy and dazzled.',
  '牽絲': 'Pull the Strings',
  '傀儡亂舞': 'Puppet Frenzy',
  '燈芯光束': 'Wick Beam',
  '燈座重擊': 'Lampstand Smash',
  '林投哭夜': 'Weeping in the Screwpines',
  '海風裡，一個女人在哭。': 'On the sea wind, a woman is weeping.',
  '林投葉刺': 'Screwpine Thorns',
  '負心之怨': 'Betrayed Heart',
  '「你們男人……都一樣。」': '"You men… you\'re all the same."',
  '冥紙紛飛': 'Spirit Money Storm',
  '萬燈噬魂': 'Lamps Devour Souls',
  '罐中的魂燈一齊亮起。': 'The soul-lanterns in the jars all light up at once.',
  '冥燈鎖鏈': 'Nether Lamp Chain',
  '長明結界': 'Eternal Barrier',
  '長明禁言': 'Eternal Silence',

  // ---- enemy skills: Alishan / Yushan / Vision Realm / Sun Moon Lake / shrine ----
  '雲霧遮眼': 'Blinding Fog',
  '山嵐寒氣': 'Mountain Chill',
  '熊掌': 'Bear Paw',
  '痛苦的咆哮': 'Anguished Roar',
  '牠胸口纏著黑色的潮氣。': 'Black tide-vapor is coiled around its chest.',
  '百目凝視': 'Hundredfold Gaze',
  '瞳光': 'Pupil Beam',
  '蛇影纏身': 'Coiling Shade',
  '幻紋': 'Phantom Pattern',
  '蛇鱗上的紋路開始呼吸。': 'The patterns on the serpent\'s scales begin to breathe.',
  '鏡像之擊': 'Mirror Strike',
  '它用你的招式打你。': 'It hits you with your own moves.',
  '心魔低語': 'Whispered Doubt',
  '「你救不了任何人。」': '"You can\'t save anyone."',
  '蛟龍翻潭': 'Churning Depths',
  '蛟牙': 'Jiao Fang',
  '石像鎮壓': 'Statue Crush',
  '燈蛾鱗粉': 'Moth Dust',
  '撲火': 'Into the Flame',
  '太虛雷（逆）': 'Taixu Thunder (Reversed)',
  '那是師父的雷法，卻是漆黑的。': 'It is his master\'s thunder rite—but pitch-black.',
  '鎮魂敕令': 'Soul-Binding Edict',
  '五行・火': 'Five Phases: Fire',
  '五行・水': 'Five Phases: Water',
  '五行・金': 'Five Phases: Metal',
  '被縛之手': 'Bound Hands',
  '清虛的手在顫抖，像在抵抗什麼。': 'Qingxu\'s hands tremble, as if resisting something.',
  '奪魂': 'Soul Theft',

  // ---- enemy skills: Beigang / Anping (Reverse Tide) ----
  '溺兵槍': 'Drowned Spear',
  '鏽箭齊發': 'Rusted Volley',
  '潮水往岸上倒流。': 'The tide flows backward onto the shore.',
  '洛家劍・青鋒': 'Luo Sword: Qingfeng',
  '洛家劍・風雨': 'Luo Sword: Wind and Rain',
  '逆潮劍': 'Reverse Tide Blade',
  '劍上纏著黑色的潮水。': 'Black tidewater coils around the blade.',
  '「爹，娘……」': '"Father… Mother…"',

  // ---- enemy skills: Takao / Donggang / Hengchun / Eluanbi ----
  '再來一碗': 'Another Bowl!',
  '「一碗一文錢，兩碗免錢——」': '"One bowl, one coin—two bowls, free!"',
  '銅錢雨': 'Coin Shower',
  '鰻牙': 'Moray Fang',
  '纏繞': 'Constrict',
  '落山風': 'Fall Wind',
  '風從山上直直壓下來。': 'The wind comes crashing straight down off the mountains.',
  '飛沙': 'Flying Sand',
  '風壓': 'Wind Crush',
  '風眼': 'Eye of the Wind',
  '風忽然停了。': 'Suddenly, the wind stops.',

  // ---- enemy skills: Orchid Island / Taitung / Taroko / Toucheng ----
  '海妖之歌': "Siren's Song",
  '觸手': 'Tentacle',
  '落石': 'Rockfall',
  '大理石殼': 'Marble Shell',
  '搶食': 'Snatch Food',
  '「餓……好餓……」': '"Hungry… so hungry…"',
  '孤魂夜哭': 'Night Wail of the Forsaken',
  '潮蛇噬': 'Serpent Bite',
  '黑潮翻湧': 'Kuroshio Surge',
  '潮病': 'Tide-Sickness',
  '牠鱗片下滲出黑色的潮水。': 'Black tidewater oozes from beneath its scales.',
  '斷崖崩擊': 'Cliff Collapse',
  '峽谷震': 'Gorge Quake',
  '濁流': 'Muddy Torrent',
  '碧綠的立霧溪被染成了黑色。': 'The jade-green Liwu River runs black.',

  // ---- enemy skills: Penghu / Xuanwu Isle / Black Tide / Far Shore / One Breath ----
  '彎刀': 'Cutlass',
  '鬼砲': 'Ghost Cannon',
  '千手拖曳': 'Thousand Hands',
  '鯤吞': 'Kun Swallow',
  '鯤噴潮': 'Kun Spout',
  '潛淵': 'Dive to the Abyss',
  '鯤沉入深處，海面一片死寂。': 'The Kun sinks into the deep. The sea goes deathly still.',
  '彼岸花開': 'Spider Lilies Bloom',
  '紅蕊': 'Crimson Stamen',
  '奪面': 'Face Theft',
  '它想要一張臉，你的就很好。': 'It wants a face. Yours will do nicely.',
  '塔燈': 'Tower Lamp',
  '守塔鐵鑰': "Warden's Iron Key",
  '萬象之謎': 'Riddle of Myriad Forms',
  '「你是光，還是看見光的眼睛？」': '"Are you the light, or the eye that sees it?"',
  '捉迷藏': 'Hide and Seek',
  '寶石笑聲': 'Jewel Laughter',
  '長明燈陣': 'Eternal Lamp Array',
  '「這些燈，每一盞都是一個不願被遺忘的人。」': '"Every one of these lamps is someone who refused to be forgotten."',
  '引魂槳・逆': 'Soul Oar: Reversed',
  '那是引魂人的槳法，用來把人拉回來，而不是送走。':
    'It is a Soul Guide\'s oar technique—used to pull people back instead of sending them on.',
  '封魂罐': 'Soul Jar',
  '黑水溝倒流，死者的記憶湧上甲板。': 'The Black Tide flows backward, and the memories of the dead surge onto the deck.',
  '念兒的燈': "Nian'er's Lantern",
  '夜玄捧著那盞小小的魂燈，傷口在燈光下癒合。': 'Ye Xuan cradles the tiny soul-lantern, and his wounds close in its light.',
  '永不熄滅': 'Never Extinguished',
  '「我不會讓任何人再被忘記。」': '"I will never let anyone be forgotten again."',
  '無相之潮': 'Formless Tide',
  '遺忘': 'Oblivion',
  '你忘了自己為什麼握著劍。': 'You forget why you are holding a sword.',
  '萬口': 'Ten Thousand Mouths',
  '虛無': 'Void',
  '溺斃萬魂': 'Drown Ten Thousand Souls',
  '所有沉沒的記憶一起壓下來。': 'Every memory that ever sank comes crashing down at once.',
});

// Generic list joiner, used for battle spoils ('金創藥、香包') and any other '、'-joined list of names.
// Kept last (and in this file, after the specific templates in en_ui.js) so it never shadows them.
G.I18N.add({
  '%s、%s': '%s, %s',
});
// 貓咪助陣 (replaces the removed 糰子 summon)
G.I18N.add({
  '貓咪助陣': 'Cat Assist',
  '「芋圓、麻糬——拜託了！」至於來的是哪一隻、會做什麼，只有貓知道。': '"Taro, Mochi — please!" Which cat answers, and what it does, only the cat knows.',
  '芋圓炸毛撲上去一陣亂抓！': 'Taro Ball puffs up and pounces in a flurry of claws!',
  '芋圓整隻坐了上去——十二斤的壓制力！': 'Taro Ball sits on it. Twelve pounds of pure suppression!',
  '芋圓擋在最虛弱的同伴前面，一臉「你敢？」。': 'Taro Ball plants himself in front of the weakest ally. "Try it."',
  '麻糬閉上眼呼嚕，水色漣漪漾開——同伴的傷口慢慢合起來。': 'Mochi closes her eyes and purrs; ripples of water-light spread and wounds begin to close.',
  '麻糬身邊浮起一盞小水燈，燈光照得妖怪睜不開眼。': 'A little water lantern rises beside Mochi, its glow too bright for the demons to bear.',
  '芋圓翻肚賣萌。敵人戰意全消，紅纓也差點放下槍。': 'Taro Ball rolls over, belly up. The enemy loses all will to fight, and Hongying almost drops her spear.',
  '麻糬盯著敵人，慢慢眨了一次眼。敵人不知為何心生慚愧。': 'Mochi gives the enemy one long, slow blink. For some reason, it feels ashamed.',
  '芋圓打了個哈欠，原地睡著了。': 'Taro Ball yawns and falls asleep on the spot.',
  '芋圓與麻糬同時抬頭——水燈與石獅齊現！': 'Taro Ball and Mochi look up together — the water lantern and the stone lion appear as one!',
  '芋圓亂抓': 'Taro’s Scratch', '十二斤壓制': 'Twelve-Pound Press', '石獅擋招': 'Stone-Lion Guard', '水燈照妖': 'Lantern Glare',
  '慢眨眼': 'Slow Blink', '水燈石獅': 'Lantern & Lion', '貓毛球': 'Fur Ball',
  '麻糬換毛季掉的長毛搓成的小球，軟綿綿。紅纓偷偷收了好幾顆。': 'A soft little ball rolled from Mochi’s shed winter coat. Hongying has secretly kept several.',
  '雲歸的蕈菇清單之一。': 'One of the mushrooms on Yun Gui’s list.',
  '觀音山太虛觀的道士，愛喝米酒、愛讀禁書、更愛研究蘑菇。符籙五行俱全，專攻弱點。':
    'A Taoist of Taixu Temple on Mount Guanyin who loves rice wine, forbidden books, and—above all—mushrooms. His talismans span all Five Phases, so he hunts for weak spots.',
  '只在滿月夜發光的蕈。雲歸的蕈菇清單之一。': 'A mushroom that glows only under a full moon. One of the mushrooms on Yun Gui’s list.',
  '一整束的回魂香，煙會找到所有迷路的魂。倒下的同伴全體復活並回復三成氣血。':
    'A whole bundle of soul-recall incense; its smoke finds every lost soul. Revives all fallen allies with 30% HP.',
  '與白芷同在隊伍時，兩人速度＋5': 'While Bai Zhi is in the party, both gain +5 Speed',
});
