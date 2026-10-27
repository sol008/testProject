// 彼岸燈 — skills (G.Data.skills): player skills, 合擊 combos, ultimates, 貓咪助陣 outcomes, enemy skills (e_*).
//
// Contract fields (docs/CONTRACTS.md "Data"):
//   name, desc, mp, type:'phys'|'mag'|'heal'|'buff'|'debuff'|'revive'|'cure'|'special', elem, target,
//   power, hits?, status?:{id, chance, turns}, buffs?:[{stat, amt, turns}], delay?, fx, sfx, combo?
// Conventions used by this file (engine notes — keep the engine side minimal):
//   phys/mag: damage formulas from CONTRACTS. `hits` = number of hits, each at `power`
//             (target 'random' = each hit picks a random living opponent). elem null = neutral
//             (normal attacks use the attacker's element; skills use the skill's element).
//   heal:     amount = power * mag * 1.2 + power * 10. Optional `status` (e.g. regen) is applied to the
//             healed targets; optional `cure:[...]` removes those statuses; `revive:true` also raises KO'd
//             allies in the target set (with the healed amount).
//   revive:   target 'deadAlly'; restores `power` × max HP.
//   cure:     removes the statuses in `cure`.
//   buff/debuff: `buffs` stat ∈ atk|def|mag|spd, amt = +0.3 / -0.3 (±30%), turns. `status` may add
//             regen / shield / guard / sleep / seal / stun / poison / trance with `chance` (0..1).
//   status on damage skills: applied after the hit with `chance`.
//   delay:    CTB delay multiplier (default 1.0) — heavy moves wait longer.
//   ultimate:true — costs the whole 劍意 gauge (needs 100), mp 0. Offered when the gauge is full.
//   combo:[ids] — 合擊: every listed member must be in the active party, alive and able to act;
//             each pays `mp`; all listed members spend their next turn. Uses the participants' average
//             atk (phys) / mag (mag/heal). `comboLv` = min level of each; `flag` = story gate (optional).
//   hidden:true — not shown in skill menus (used internally, e.g. 貓咪助陣 outcomes).
//   special:'cats' — 貓咪助陣: pick one entry of `outcomes` by weight `w`, show its `text`
//             (battle message), then resolve skill `skill` with the caster as user.
//   type 'special' with no `special`/`summon` = flavour action (message only, turn spent).
//   summon:[enemyIds] (enemy skills only) — adds those enemies to the battle if there is room (max 5).
//   Enemy skills use the same fields; `if` conditions live in the enemy's skill list (enemies.js).
'use strict';
G.Data = G.Data || {};

G.Data.skills = {
  // ===================================================================================== 沈星河 (火・劍)
  xh_yinghuo: { name: '螢火斬', desc: '劍走螢光，一斬帶火。火屬性單體攻擊。', mp: 4, type: 'phys', elem: 'fire', target: 'enemy', power: 1.5, fx: 'slash', sfx: 'slash' },
  xh_hudeng: { name: '護燈訣', desc: '像護著風中燈火一樣護住同伴。我方一人防禦提升。', mp: 5, type: 'buff', elem: null, target: 'ally', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 4 }], fx: 'buff', sfx: 'buff' },
  xh_liuying: { name: '流螢亂舞', desc: '劍光如夏夜流螢四散，隨機連擊四次。', mp: 8, type: 'phys', elem: 'fire', target: 'random', power: 0.6, hits: 4, fx: 'slash_multi', sfx: 'slash2' },
  xh_liaoyuan: { name: '燎原', desc: '星火燎原，以劍引火掃過敵陣。火屬性全體術法。', mp: 10, type: 'mag', elem: 'fire', target: 'enemies', power: 1.3, fx: 'fire', sfx: 'fire' },
  xh_jianqi: { name: '劍氣縱橫', desc: '劍氣橫掃全場。全體物理攻擊。', mp: 12, type: 'phys', elem: null, target: 'enemies', power: 0.95, fx: 'slash_multi', sfx: 'slash2' },
  xh_xingzhui: { name: '星墜劍', desc: '躍起如流星墜地，一劍貫入。火屬性單體重擊。', mp: 14, type: 'phys', elem: 'fire', target: 'enemy', power: 2.4, delay: 1.15, fx: 'fire_big', sfx: 'crit' },
  xh_dengguo: { name: '九份燈火', desc: '想起山城的萬家燈火，暖意流遍全隊。我方全體回復。', mp: 16, type: 'heal', elem: null, target: 'allies', power: 0.8, fx: 'lantern', sfx: 'lantern' },
  xh_fentian: { name: '焚天劍氣', desc: '劍氣化為烈焰捲向天際。火屬性全體物理攻擊。', mp: 20, type: 'phys', elem: 'fire', target: 'enemies', power: 1.35, fx: 'fire_big', sfx: 'fire' },
  xh_zhaohun: { name: '照魂', desc: '以心中之火照見妖邪本相。火屬性單體術法，可能封住敵人術法。', mp: 18, type: 'mag', elem: 'fire', target: 'enemy', power: 3.2, status: { id: 'seal', chance: 0.4, turns: 3 }, fx: 'lantern', sfx: 'magic' },
  xh_daoxuan: { name: '星河倒懸', desc: '劍光倒捲如天上銀河傾瀉。全體三連擊。', mp: 28, type: 'phys', elem: null, target: 'enemies', power: 0.7, hits: 3, fx: 'slash_multi', sfx: 'slash2' },
  xh_longyin: { name: '赤焰龍吟', desc: '火龍隨劍長吟而出。火屬性全體強力術法。', mp: 34, type: 'mag', elem: 'fire', target: 'enemies', power: 3.0, fx: 'fire_big', sfx: 'fire' },
  xh_qianxing: { name: '劍落千星', desc: '漫天星光化劍而落。隨機八連擊。', mp: 40, type: 'phys', elem: 'fire', target: 'random', power: 0.85, hits: 8, delay: 1.2, fx: 'slash_multi', sfx: 'slash2' },
  // 心火 (story, ch7)
  xh_xinhuo_ran: { name: '心火・燃燈', desc: '燃起自己的心火，分給每一個人。我方全體回復並持續回復。', mp: 30, type: 'heal', elem: 'fire', target: 'allies', power: 1.5, status: { id: 'regen', chance: 1, turns: 4 }, fx: 'lantern', sfx: 'lantern' },
  xh_xinhuo_zhao: { name: '心火・照夜', desc: '一盞心燈照亮長夜。火屬性全體強力攻擊。', mp: 36, type: 'mag', elem: 'fire', target: 'enemies', power: 3.4, fx: 'fire_big', sfx: 'fire' },
  xh_xinhuo_bumie: { name: '心火・不滅', desc: '只要燈還亮著，就不讓任何人倒下。復活同伴並回復大半氣血。', mp: 32, type: 'revive', elem: 'fire', target: 'deadAlly', power: 0.7, fx: 'revive', sfx: 'lantern' },
  u_xinghe: { name: '萬燈・螢火燎天', desc: '【奧義】劍意化作萬點螢火，燎盡眼前一切陰霾。火屬性全體大傷害。', mp: 0, type: 'phys', elem: 'fire', target: 'enemies', power: 3.2, ultimate: true, fx: 'ultimate_xinghe', sfx: 'ultimate' },

  // ===================================================================================== 白芷 (水・笛)
  bz_qingxin: { name: '清心曲', desc: '一段清亮的笛音撫平傷痛。我方一人回復。', mp: 5, type: 'heal', elem: 'water', target: 'ally', power: 1.6, fx: 'heal', sfx: 'heal' },
  bz_shuiyue: { name: '水月', desc: '月影落水，化作冷冽水刃。水屬性單體術法。', mp: 4, type: 'mag', elem: 'water', target: 'enemy', power: 1.8, fx: 'water', sfx: 'water' },
  bz_duhun: { name: '渡魂謠', desc: '那首只有她記得的歌。使敵方全體可能入睡。', mp: 8, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.55, turns: 3 }, fx: 'song', sfx: 'sing' },
  bz_jiee: { name: '解厄', desc: '笛聲如清泉，洗去身上的厄運。解除我方一人的異常狀態。', mp: 4, type: 'cure', elem: null, target: 'ally', power: 0, cure: ['poison', 'seal', 'sleep', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'], fx: 'heal', sfx: 'heal' },
  bz_chaosheng: { name: '潮生曲', desc: '如潮水漫過沙灘，溫柔地回復我方全體。', mp: 12, type: 'heal', elem: 'water', target: 'allies', power: 1.0, fx: 'heal_all', sfx: 'heal' },
  bz_huihun: { name: '回魂', desc: '在魂燈將熄之前，把它輕輕喚回。復活同伴並回復四成氣血。', mp: 18, type: 'revive', elem: null, target: 'deadAlly', power: 0.4, fx: 'revive', sfx: 'lantern' },
  bz_yuewu: { name: '月霧護身曲', desc: '月下輕霧籠罩同伴。我方全體防禦提升。', mp: 14, type: 'buff', elem: null, target: 'allies', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 4 }], fx: 'song', sfx: 'sing' },
  bz_haichao: { name: '海潮', desc: '喚來八斗子的夜潮。水屬性全體術法。', mp: 16, type: 'mag', elem: 'water', target: 'enemies', power: 1.6, fx: 'water_big', sfx: 'water' },
  bz_liufeng: { name: '流風曲', desc: '輕快如山風的曲子。我方全體速度提升。', mp: 16, type: 'buff', elem: null, target: 'allies', power: 0, buffs: [{ stat: 'spd', amt: 0.3, turns: 4 }], fx: 'song', sfx: 'sing' },
  bz_ganlin: { name: '甘霖', desc: '久旱逢甘霖。我方全體持續回復。', mp: 20, type: 'buff', elem: 'water', target: 'allies', power: 0, status: { id: 'regen', chance: 1, turns: 5 }, fx: 'heal_all', sfx: 'heal' },
  bz_yingyue: { name: '映月', desc: '把月光盛進傷口裡。我方一人大幅回復並解除異常。', mp: 18, type: 'heal', elem: 'water', target: 'ally', power: 3.4, cure: ['poison', 'seal', 'sleep', 'stun'], fx: 'heal', sfx: 'heal' },
  bz_zhenhun: { name: '鎮魂曲', desc: '安撫躁動的魂靈。敵方全體可能被封印，術法下降。', mp: 24, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'seal', chance: 0.6, turns: 3 }, buffs: [{ stat: 'mag', amt: -0.3, turns: 3 }], fx: 'song', sfx: 'sing' },
  bz_denghai: { name: '燈海', desc: '千萬水燈在曲聲中亮起。我方全體大幅回復並解除異常。', mp: 36, type: 'heal', elem: 'water', target: 'allies', power: 2.2, cure: ['poison', 'seal', 'sleep', 'stun'], fx: 'lantern', sfx: 'lantern' },
  bz_guichao: { name: '歸潮', desc: '讓迷途的潮水回到大海。水屬性全體強力術法。', mp: 40, type: 'mag', elem: 'water', target: 'enemies', power: 3.4, fx: 'water_big', sfx: 'water' },
  u_baizhi: { name: '彼岸・渡魂', desc: '【奧義】她唱出完整的渡魂謠。我方全體大幅回復、解除異常，並復活倒下的同伴。', mp: 0, type: 'heal', elem: 'water', target: 'allies', power: 4.5, revive: true, cure: ['poison', 'seal', 'sleep', 'stun', 'atkDown', 'defDown', 'magDown', 'spdDown'], ultimate: true, fx: 'ultimate_baizhi', sfx: 'ultimate' },

  // ===================================================================================== 洛紅纓 (金・槍)
  hy_dian: { name: '紅纓點', desc: '槍尖一點，紅纓翻飛。金屬性單體攻擊。', mp: 3, type: 'phys', elem: 'metal', target: 'enemy', power: 1.6, fx: 'thrust', sfx: 'stab' },
  hy_hengsao: { name: '橫掃千軍', desc: '長槍橫掃。全體物理攻擊。', mp: 6, type: 'phys', elem: null, target: 'enemies', power: 0.9, fx: 'slash_multi', sfx: 'slash2' },
  hy_xushi: { name: '蓄勢', desc: '「笨蛋，退後。」凝神蓄勢，自身攻擊大幅提升。', mp: 4, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 4 }], fx: 'buff', sfx: 'buff' },
  hy_lianhuan: { name: '連環槍', desc: '三槍連環，一氣呵成。單體三連擊。', mp: 8, type: 'phys', elem: 'metal', target: 'enemy', power: 0.75, hits: 3, fx: 'thrust', sfx: 'stab' },
  hy_pojia: { name: '破甲', desc: '專挑甲冑縫隙下手。單體攻擊並降低防禦。', mp: 9, type: 'phys', elem: 'metal', target: 'enemy', power: 1.3, buffs: [{ stat: 'def', amt: -0.3, turns: 4 }], fx: 'thrust', sfx: 'metal' },
  hy_lihua: { name: '梨花槍', desc: '槍影如梨花紛落。隨機五連擊。', mp: 12, type: 'phys', elem: 'metal', target: 'random', power: 0.7, hits: 5, fx: 'slash_multi', sfx: 'slash2' },
  hy_huima: { name: '回馬槍', desc: '佯退回身，一槍穿心。金屬性單體重擊。', mp: 14, type: 'phys', elem: 'metal', target: 'enemy', power: 2.6, fx: 'metal', sfx: 'crit' },
  hy_nuyan: { name: '怒焰紅纓', desc: '紅纓燃起怒火。火屬性全體物理攻擊。', mp: 18, type: 'phys', elem: 'fire', target: 'enemies', power: 1.4, fx: 'fire', sfx: 'fire' },
  hy_lukang: { name: '鹿港怒潮', desc: '如鹿港港口的大潮拍岸。水屬性全體兩連擊。', mp: 22, type: 'phys', elem: 'water', target: 'enemies', power: 0.9, hits: 2, fx: 'water_big', sfx: 'water' },
  hy_tieqi: { name: '鐵騎破陣', desc: '一人一槍，如千騎破陣。單體重擊，可能使敵暈眩。', mp: 26, type: 'phys', elem: 'metal', target: 'enemy', power: 3.6, delay: 1.15, status: { id: 'stun', chance: 0.4, turns: 1 }, fx: 'metal_big', sfx: 'crit' },
  hy_luanhong: { name: '亂紅飛渡', desc: '紅纓亂舞如落花飛渡。隨機七連擊。', mp: 32, type: 'phys', elem: 'metal', target: 'random', power: 0.9, hits: 7, fx: 'slash_multi', sfx: 'slash2' },
  hy_qianjun: { name: '千軍辟易', desc: '一槍之威，千軍退避。金屬性全體強力攻擊。', mp: 40, type: 'phys', elem: 'metal', target: 'enemies', power: 2.6, delay: 1.1, fx: 'metal_big', sfx: 'metal' },
  hy_luojia: { name: '洛家劍譜・青鋒', desc: '【奧義】以槍代劍，使出哥哥留下的洛家劍法。單體九連擊。', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 0.9, hits: 9, ultimate: true, fx: 'ultimate_hongying', sfx: 'ultimate' },
  u_hongying: { name: '紅纓破陣', desc: '【奧義】洛家槍法終式，槍影如紅浪席捲敵陣。全體大傷害。', mp: 0, type: 'phys', elem: 'metal', target: 'enemies', power: 3.3, ultimate: true, fx: 'ultimate_hongying', sfx: 'ultimate' },

  // ===================================================================================== 雲歸 (木・符扇)
  yg_leifu: { name: '雷符', desc: '「急急如律令。」木屬性（雷）單體術法。', mp: 4, type: 'mag', elem: 'wood', target: 'enemy', power: 1.8, fx: 'wood', sfx: 'thunder' },
  yg_huofu: { name: '火符', desc: '符紙自燃，化為火鴉。火屬性單體術法。', mp: 4, type: 'mag', elem: 'fire', target: 'enemy', power: 1.8, fx: 'fire', sfx: 'fire' },
  yg_shuifu: { name: '水符', desc: '扇一揮，憑空起浪。水屬性單體術法。', mp: 4, type: 'mag', elem: 'water', target: 'enemy', power: 1.8, fx: 'water', sfx: 'water' },
  yg_jinfu: { name: '金符', desc: '符化飛劍。金屬性單體術法。', mp: 4, type: 'mag', elem: 'metal', target: 'enemy', power: 1.8, fx: 'metal', sfx: 'metal' },
  yg_tufu: { name: '土符', desc: '地裂石起。土屬性單體術法。', mp: 4, type: 'mag', elem: 'earth', target: 'enemy', power: 1.8, fx: 'earth', sfx: 'earth' },
  yg_dingshen: { name: '定身符', desc: '貼上就不能動——理論上。可能使敵人暈眩。', mp: 6, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.65, turns: 1 }, fx: 'seal', sfx: 'magic' },
  // 貓咪助陣 (白芷): 芋圓 or 麻糬 answers the call and does… something. (Replaced the removed 糰子 summon.)
  bz_maomi: {
    name: '貓咪助陣', desc: '「芋圓、麻糬——拜託了！」至於來的是哪一隻、會做什麼，只有貓知道。', mp: 6, type: 'special', elem: null, target: 'self', power: 0,
    special: 'cats', fx: 'summon', sfx: 'magic',
    outcomes: [
      { w: 4, cat: 'yuyuan', skill: 'tz_scratch', text: '芋圓炸毛撲上去一陣亂抓！' },
      { w: 3, cat: 'yuyuan', skill: 'tz_roll', text: '芋圓整隻坐了上去——十二斤的壓制力！' },
      { w: 2, cat: 'yuyuan', skill: 'tz_guard', text: '芋圓擋在最虛弱的同伴前面，一臉「你敢？」。' },
      { w: 3, cat: 'mochi', skill: 'tz_purr', text: '麻糬閉上眼呼嚕，水色漣漪漾開——同伴的傷口慢慢合起來。' },
      { w: 2, cat: 'mochi', skill: 'tz_lantern', text: '麻糬身邊浮起一盞小水燈，燈光照得妖怪睜不開眼。' },
      { w: 2, cat: 'yuyuan', skill: 'tz_cute', text: '芋圓翻肚賣萌。敵人戰意全消，紅纓也差點放下槍。' },
      { w: 2, cat: 'mochi', skill: 'tz_stare', text: '麻糬盯著敵人，慢慢眨了一次眼。敵人不知為何心生慚愧。' },
      { w: 2, cat: 'yuyuan', skill: 'tz_nap', text: '芋圓打了個哈欠，原地睡著了。' },
      { w: 1, cat: 'both', skill: 'tz_jackpot', text: '芋圓與麻糬同時抬頭——水燈與石獅齊現！' },
    ],
  },
  yg_mihun: { name: '迷魂扇', desc: '扇面一開，香氣迷人。敵方全體攻擊下降。', mp: 10, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 4 }], fx: 'debuff', sfx: 'debuff' },
  yg_wulei: { name: '五雷正法', desc: '太虛觀正傳雷法。木屬性全體術法。', mp: 14, type: 'mag', elem: 'wood', target: 'enemies', power: 1.6, fx: 'wood_big', sfx: 'thunder' },
  yg_huichun: { name: '回春符', desc: '「我只是剛好會，不是想當大夫。」我方一人回復並持續回復。', mp: 10, type: 'heal', elem: 'wood', target: 'ally', power: 1.4, status: { id: 'regen', chance: 1, turns: 4 }, fx: 'heal', sfx: 'heal' },
  yg_fengyin: { name: '封印符', desc: '封住敵人的術法。', mp: 8, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.8, turns: 3 }, fx: 'seal', sfx: 'magic' },
  yg_duxun: { name: '毒蕈粉', desc: '「這是學術研究用的。」撒出蕈粉，敵方全體可能中毒。', mp: 14, type: 'debuff', elem: 'wood', target: 'enemies', power: 0, status: { id: 'poison', chance: 0.75, turns: 4 }, fx: 'poison', sfx: 'poison' },
  yg_wuxing: { name: '五行大陣', desc: '五色符籙布陣，相生相剋。無屬性全體術法。', mp: 26, type: 'mag', elem: null, target: 'enemies', power: 2.3, fx: 'kaleido', sfx: 'magic' },
  yg_tiangang: { name: '天罡破法', desc: '破盡護身之法。敵方全體防禦、術法下降。', mp: 22, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'def', amt: -0.3, turns: 4 }, { stat: 'mag', amt: -0.3, turns: 4 }], fx: 'debuff', sfx: 'debuff' },
  yg_sanmei: { name: '三昧真火符', desc: '燒不盡的真火。火屬性全體強力術法。', mp: 32, type: 'mag', elem: 'fire', target: 'enemies', power: 3.0, fx: 'fire_big', sfx: 'fire' },
  yg_jiutian: { name: '九天雷罡', desc: '九天雷罡應召而下。木屬性全體強力術法。', mp: 40, type: 'mag', elem: 'wood', target: 'enemies', power: 3.6, fx: 'wood_big', sfx: 'thunder' },
  yg_wanfa: { name: '萬法歸宗', desc: '所有符籙化為一道光。無屬性單體極大傷害。', mp: 48, type: 'mag', elem: null, target: 'enemy', power: 6.5, delay: 1.2, fx: 'beam', sfx: 'magic' },
  yg_taixu: { name: '太虛神雷', desc: '師父最後的傳授。雷落太虛，木屬性全體極大傷害，可能使敵暈眩。', mp: 45, type: 'mag', elem: 'wood', target: 'enemies', power: 4.0, status: { id: 'stun', chance: 0.3, turns: 1 }, fx: 'wood_big', sfx: 'thunder' },
  u_yungui: { name: '太極・萬符朝宗', desc: '【奧義】千張符籙如雪紛飛，五行輪轉。無屬性全體大傷害，並降低敵方防禦。', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 4.8, buffs: [{ stat: 'def', amt: -0.3, turns: 3 }], ultimate: true, fx: 'ultimate_yungui', sfx: 'ultimate' },

  // ---- 貓咪助陣 outcomes (hidden; resolved via bz_maomi) ----
  tz_scratch: { name: '芋圓亂抓', desc: '', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.9, hits: 3, hidden: true, fx: 'claw', sfx: 'slash2' },
  tz_roll: { name: '十二斤壓制', desc: '', mp: 0, type: 'mag', elem: 'earth', target: 'enemy', power: 2.2, hidden: true, fx: 'earth', sfx: 'push' },
  tz_guard: { name: '石獅擋招', desc: '', mp: 0, type: 'buff', elem: 'earth', target: 'allies', power: 0, buffs: [{ stat: 'def', amt: 0.35, turns: 3 }], hidden: true, fx: 'buff', sfx: 'buff' },
  tz_purr: { name: '療癒呼嚕', desc: '', mp: 0, type: 'heal', elem: 'water', target: 'allies', power: 1.1, status: { id: 'regen', chance: 1, turns: 3 }, hidden: true, fx: 'heal_all', sfx: 'sing' },
  tz_lantern: { name: '水燈照妖', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.5, hidden: true, fx: 'water', sfx: 'water' },
  tz_cute: { name: '翻肚賣萌', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 3 }], hidden: true, fx: 'debuff', sfx: 'debuff' },
  tz_stare: { name: '慢眨眼', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.5, turns: 2 }, hidden: true, fx: 'sleep', sfx: 'sing' },
  tz_nap: { name: '原地睡著', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, hidden: true, fx: 'sleep', sfx: 'miss' },
  tz_jackpot: { name: '水燈石獅', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 4.0, hidden: true, fx: 'water_big', sfx: 'water' },

  // ===================================================================================== 合擊
  c_xingbai: { name: '星河渡燈', desc: '【合擊・星河＋白芷】劍火點燈，笛聲送行，一河燈火渡盡陰霾。全體術法大傷害。', mp: 10, type: 'mag', elem: null, target: 'enemies', power: 3.0, combo: ['xinghe', 'baizhi'], comboLv: 3, fx: 'combo', sfx: 'lantern' },
  c_xinghong: { name: '火樹銀花', desc: '【合擊・星河＋紅纓】火劍銀槍交錯，如元宵煙火綻放。全體三連擊。', mp: 12, type: 'phys', elem: 'fire', target: 'enemies', power: 1.0, hits: 3, combo: ['xinghe', 'hongying'], comboLv: 8, fx: 'combo', sfx: 'fire' },
  c_hongyun: { name: '雷霆槍陣', desc: '【合擊・紅纓＋雲歸】雷符附槍，一槍引落九天之雷。木屬性單體極大傷害，可能暈眩。', mp: 14, type: 'phys', elem: 'wood', target: 'enemy', power: 5.5, status: { id: 'stun', chance: 0.5, turns: 1 }, combo: ['hongying', 'yungui'], comboLv: 12, fx: 'combo', sfx: 'thunder' },
  c_baiyun: { name: '雲水禪心', desc: '【合擊・白芷＋雲歸】笛聲與符光相和。我方全體大幅回復並持續回復。', mp: 14, type: 'heal', elem: 'water', target: 'allies', power: 2.4, status: { id: 'regen', chance: 1, turns: 4 }, combo: ['baizhi', 'yungui'], comboLv: 12, fx: 'combo', sfx: 'heal' },
  c_xingyun: { name: '符火燎原', desc: '【合擊・星河＋雲歸】劍引符火，燒遍山野。火屬性全體術法。', mp: 14, type: 'mag', elem: 'fire', target: 'enemies', power: 3.4, combo: ['xinghe', 'yungui'], comboLv: 12, fx: 'combo', sfx: 'fire' },
  c_baihong: { name: '月下紅纓', desc: '【合擊・白芷＋紅纓】月光凝在槍尖。水屬性單體重擊並降低敵人防禦。', mp: 12, type: 'phys', elem: 'water', target: 'enemy', power: 4.0, buffs: [{ stat: 'def', amt: -0.3, turns: 3 }], combo: ['baizhi', 'hongying'], comboLv: 8, fx: 'combo', sfx: 'water' },
  c_qiandeng: { name: '千燈', desc: '【合擊・四人】「妳不是一個人在發光。」一路上被渡過的每一盞心燈一同亮起。全體極大傷害。', mp: 30, type: 'mag', elem: null, target: 'enemies', power: 7.0, combo: ['xinghe', 'baizhi', 'hongying', 'yungui'], comboLv: 20, flag: 'qiandeng', fx: 'combo', sfx: 'ultimate' },

  // ===================================================================================== Enemy skills (e_*)
  // ---- generic ----
  e_hit: { name: '撞擊', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.0, fx: 'claw', sfx: 'hit' },
  e_claw: { name: '利爪', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.0, fx: 'claw', sfx: 'slash' },
  e_bite: { name: '噬咬', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.0, fx: 'bite', sfx: 'hit' },
  e_slash: { name: '斬擊', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.0, fx: 'slash', sfx: 'slash' },
  e_thrust: { name: '突刺', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.0, fx: 'thrust', sfx: 'stab' },
  e_ghost_touch: { name: '陰寒之觸', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.0, fx: 'ghost', sfx: 'ghost' },
  e_heavy: { name: '重擊', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.6, delay: 1.2, fx: 'claw', sfx: 'crit' },
  e_guard: { name: '防禦姿態', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'guard' },
  e_rage: { name: '狂怒', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' },
  e_mend: { name: '聚魂', desc: '', mp: 0, type: 'heal', elem: null, target: 'ally', power: 1.6, fx: 'heal', sfx: 'heal' },

  // ---- 夢境 / 九份 / 礦坑 / 八斗子 ----
  e_mist_veil: { name: '海霧', desc: '', mp: 0, type: 'debuff', elem: 'water', target: 'enemy', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'wind' },
  e_drown_pull: { name: '抓交替', desc: '冰冷的手抓住腳踝往下拖。', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.4, status: { id: 'stun', chance: 0.15, turns: 1 }, fx: 'water', sfx: 'splash' },
  e_ghost_flame: { name: '鬼火', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.3, fx: 'fire', sfx: 'fire' },
  e_lantern_glare: { name: '幽光', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'trance', chance: 0.25, turns: 2 }, fx: 'lantern', sfx: 'ghost' },
  e_bat_swarm: { name: '群蝠', desc: '', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.5, hits: 3, fx: 'bite', sfx: 'slash2' },
  e_bat_screech: { name: '尖嘯', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'def', amt: -0.3, turns: 2 }], fx: 'debuff', sfx: 'debuff' },
  e_pickaxe: { name: '十字鎬', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.35, fx: 'slash', sfx: 'hit' },
  e_miner_sigh: { name: '礦工的嘆息', desc: '「金仔……都挖去哪了……」', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'ghost' },
  e_crab_pinch: { name: '大螯夾', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.3, buffs: [{ stat: 'def', amt: -0.3, turns: 2 }], fx: 'claw', sfx: 'metal' },
  e_bubble: { name: '吐泡', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.7, fx: 'water', sfx: 'water' },
  e_crow_feathers: { name: '鴉羽紛飛', desc: '漆黑的羽毛像刀片一樣落下。', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.6, hits: 4, fx: 'dark', sfx: 'slash2' },
  e_crow_hex: { name: '長明咒印', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 1.5, status: { id: 'seal', chance: 0.35, turns: 2 }, fx: 'dark', sfx: 'dark' },
  e_crow_smug: { name: '本使者不陪你玩了', desc: '墨鴉優雅地整理羽毛。', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'spd', amt: 0.3, turns: 3 }, { stat: 'def', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' },
  e_crow_wind: { name: '黑羽旋風', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 1.0, fx: 'wind', sfx: 'wind' },
  e_ghostking_tide: { name: '黑水倒灌', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.1, fx: 'water_big', sfx: 'splash' },
  e_ghostking_call: { name: '呼喚替身', desc: '水裡又爬出了東西。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['water_ghost'], fx: 'summon', sfx: 'splash' },

  // ---- 霧林 / 虎姑婆 / 平溪 ----
  e_mosin_trick: { name: '牽路', desc: '紅衣小孩笑嘻嘻地牽起你的手……', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'trance', chance: 0.4, turns: 2 }, fx: 'kaleido', sfx: 'ghost' },
  e_mosin_feast: { name: '請吃大餐', desc: '一把泥巴和蚱蜢塞進嘴裡。', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.0, status: { id: 'poison', chance: 0.4, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_spore: { name: '孢子雲', desc: '', mp: 0, type: 'debuff', elem: 'wood', target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.25, turns: 2 }, fx: 'sleep', sfx: 'poison' },
  e_spore_poison: { name: '毒孢', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemy', power: 1.1, status: { id: 'poison', chance: 0.5, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_bamboo_spike: { name: '竹刺', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'enemy', power: 1.35, fx: 'wood', sfx: 'stab' },
  e_bamboo_rustle: { name: '竹林沙沙', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 0.75, fx: 'wind', sfx: 'wind' },
  e_snake_bite: { name: '毒牙', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'enemy', power: 1.0, status: { id: 'poison', chance: 0.55, turns: 3 }, fx: 'bite', sfx: 'poison' },
  e_boar_charge: { name: '橫衝直撞', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'random', power: 1.7, delay: 1.2, fx: 'claw', sfx: 'crit' },
  e_monkey_throw: { name: '亂丟果子', desc: '', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.55, hits: 2, fx: 'bite', sfx: 'hit' },
  e_monkey_taunt: { name: '扮鬼臉', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, buffs: [{ stat: 'def', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'debuff' },
  e_tiger_claw: { name: '虎爪', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.4, fx: 'claw', sfx: 'slash' },
  e_tiger_lullaby: { name: '阿婆唱歌給你聽', desc: '「乖囝仔，睏喔……」', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.35, turns: 2 }, fx: 'sleep', sfx: 'ghost' },
  e_tiger_snack: { name: '嚼花生', desc: '「阿婆在吃花生啦。」喀啦喀啦……她回復了氣血。', mp: 0, type: 'heal', elem: null, target: 'self', power: 2.5, fx: 'heal', sfx: 'hit' },
  e_tiger_pounce: { name: '猛虎撲', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemies', power: 0.9, delay: 1.2, fx: 'claw', sfx: 'crit' },
  e_hy_dian: { name: '紅纓點', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.3, fx: 'thrust', sfx: 'stab' },
  e_hy_sweep: { name: '橫掃', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemies', power: 0.7, fx: 'slash_multi', sfx: 'slash2' },
  e_hy_taunt: { name: '「就這點本事？」', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 2 }], fx: 'buff', sfx: 'buff' },

  // ---- 淡水 / 觀音山 / 艋舺 ----
  e_yin_spear: { name: '陰兵長矛', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.25, fx: 'thrust', sfx: 'stab' },
  e_yin_march: { name: '陰兵過境', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 0.8, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'ghost', sfx: 'ghost' },
  e_stone_fist: { name: '石拳', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.45, fx: 'earth', sfx: 'earth' },
  e_rat_gnaw: { name: '啃咬', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 0.9, status: { id: 'poison', chance: 0.35, turns: 3 }, fx: 'bite', sfx: 'hit' },
  e_rat_swarm: { name: '鼠群', desc: '', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.45, hits: 4, fx: 'bite', sfx: 'slash2' },
  e_river_wail: { name: '河底哀聲', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.95, fx: 'water_big', sfx: 'ghost' },
  e_river_drag: { name: '拖入河底', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.5, status: { id: 'spdDown', chance: 0.5, turns: 3 }, fx: 'water', sfx: 'splash' },
  e_paper_cut: { name: '紙刃', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 0.55, hits: 3, fx: 'slash_multi', sfx: 'slash2' },
  e_paper_stare: { name: '畫上的眼睛', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.3, turns: 1 }, fx: 'dark', sfx: 'ghost' },
  e_chair_sway: { name: '椅仔姑搖搖', desc: '「椅仔姑，椅仔姑，請你來坐……」', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'trance', chance: 0.35, turns: 2 }, fx: 'song', sfx: 'ghost' },
  e_chair_tears: { name: '無人記得的眼淚', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.0, fx: 'water', sfx: 'ghost' },
  e_qf_sword: { name: '鬼面劍', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.5, fx: 'slash', sfx: 'slash' },
  e_qf_luojia: { name: '洛家劍・連環', desc: '紅纓一怔——這是洛家的劍法。', mp: 0, type: 'phys', elem: 'metal', target: 'random', power: 0.6, hits: 4, fx: 'slash_multi', sfx: 'slash2' },
  e_qf_shadow: { name: '鬼影步', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'spd', amt: 0.3, turns: 3 }], fx: 'dark', sfx: 'wind' },
  e_qf_crescent: { name: '月牙劍氣', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemies', power: 0.9, fx: 'slash_multi', sfx: 'slash2' },

  // ---- 竹塹 / 客家庄 / 風穴 ----
  e_wind_blade: { name: '風刃', desc: '', mp: 0, type: 'mag', elem: 'metal', target: 'enemy', power: 1.3, fx: 'wind', sfx: 'wind' },
  e_wind_howl: { name: '九降哀風', desc: '風裡夾雜著溺死者的哭聲。', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 0.85, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'wind', sfx: 'wind' },
  e_mountain_rock: { name: '投石', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.45, fx: 'earth', sfx: 'earth' },
  e_mountain_mimic: { name: '學人聲', desc: '山鬼學著同伴的聲音喊你的名字。', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'trance', chance: 0.35, turns: 2 }, fx: 'ghost', sfx: 'ghost' },
  e_wd_vortex: { name: '風穴漩渦', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 1.2, status: { id: 'stun', chance: 0.15, turns: 1 }, fx: 'wind', sfx: 'wind' },
  e_wd_gust: { name: '裂風爪', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.9, fx: 'claw', sfx: 'crit' },
  e_wd_inhale: { name: '吞魂', desc: '風魔吸入了周圍的魂魄。', mp: 0, type: 'heal', elem: null, target: 'self', power: 3.0, buffs: [{ stat: 'mag', amt: 0.3, turns: 3 }], fx: 'ghost', sfx: 'wind' },
  e_wd_rot: { name: '腐風', desc: '', mp: 0, type: 'debuff', elem: 'wood', target: 'enemies', power: 0, status: { id: 'poison', chance: 0.45, turns: 3 }, fx: 'poison', sfx: 'wind' },

  // ---- 鹿港 / 洛家古厝 ----
  e_js_hop: { name: '跳撲', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.5, fx: 'claw', sfx: 'hit' },
  e_js_breath: { name: '屍氣', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 0.7, status: { id: 'poison', chance: 0.35, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_hang_rope: { name: '白綾纏頸', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.2, status: { id: 'stun', chance: 0.3, turns: 1 }, fx: 'dark', sfx: 'ghost' },
  e_hang_sigh: { name: '長舌嘆息', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'ghost' },
  e_skel_slash: { name: '斷刀連斬', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 0.75, hits: 2, fx: 'slash_multi', sfx: 'slash2' },
  e_maid_wail: { name: '怨婢哭聲', desc: '「小姐……小姐……」', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.9, buffs: [{ stat: 'def', amt: -0.3, turns: 2 }], fx: 'dark', sfx: 'ghost' },
  e_maid_tea: { name: '冷掉的茶', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 1.2, status: { id: 'sleep', chance: 0.3, turns: 2 }, fx: 'poison', sfx: 'poison' },
  e_feast_poison: { name: '怨宴・腐席', desc: '桌上的菜餚早已腐爛。', mp: 0, type: 'mag', elem: 'earth', target: 'enemies', power: 1.05, status: { id: 'poison', chance: 0.45, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_feast_toast: { name: '怨宴・敬酒', desc: '「中元夜，喝一杯吧——喝完就一起留下來。」', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.35, turns: 2 }, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'ghost' },
  e_feast_flip: { name: '怨宴・掀桌', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemies', power: 1.1, delay: 1.2, fx: 'earth', sfx: 'crit' },
  e_feast_serve: { name: '上菜', desc: '紙人捧著盤子走上來。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['paper_servant'], fx: 'summon', sfx: 'ghost' },

  // ---- 府城 / 鹽水 / 林投林 / 長明宮 ----
  e_plague_miasma: { name: '瘴氣', desc: '', mp: 0, type: 'mag', elem: 'earth', target: 'enemies', power: 0.75, status: { id: 'poison', chance: 0.45, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_plague_touch: { name: '病手', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.1, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }], fx: 'dark', sfx: 'hit' },
  e_guard_halberd: { name: '長明戟', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.35, fx: 'thrust', sfx: 'stab' },
  e_guard_lamp: { name: '長明燈照', desc: '燈光照得人頭暈目眩。', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.25, status: { id: 'seal', chance: 0.25, turns: 2 }, fx: 'lantern', sfx: 'magic' },
  e_puppet_string: { name: '牽絲', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.4, turns: 1 }, fx: 'seal', sfx: 'switch' },
  e_puppet_dance: { name: '傀儡亂舞', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'random', power: 0.6, hits: 3, fx: 'slash_multi', sfx: 'slash2' },
  e_golem_beam: { name: '燈芯光束', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 1.0, fx: 'beam', sfx: 'magic' },
  e_golem_smash: { name: '燈座重擊', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.7, delay: 1.2, fx: 'earth', sfx: 'crit' },
  e_linto_weep: { name: '林投哭夜', desc: '海風裡，一個女人在哭。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.05, status: { id: 'sleep', chance: 0.25, turns: 2 }, fx: 'water', sfx: 'ghost' },
  e_linto_thorns: { name: '林投葉刺', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'random', power: 0.6, hits: 4, fx: 'wood', sfx: 'slash2' },
  e_linto_grudge: { name: '負心之怨', desc: '「你們男人……都一樣。」', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 2.0, buffs: [{ stat: 'def', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'dark' },
  e_linto_coin: { name: '冥紙紛飛', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'seal', chance: 0.3, turns: 2 }, fx: 'ghost', sfx: 'wind' },
  e_ng_soul: { name: '萬燈噬魂', desc: '罐中的魂燈一齊亮起。', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 1.15, fx: 'ghost', sfx: 'ghost' },
  e_ng_chain: { name: '冥燈鎖鏈', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.8, status: { id: 'stun', chance: 0.3, turns: 1 }, fx: 'seal', sfx: 'metal' },
  e_ng_ward: { name: '長明結界', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }, { stat: 'mag', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'bell' },
  e_ng_hush: { name: '長明禁言', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'seal', chance: 0.35, turns: 2 }, fx: 'seal', sfx: 'bell' },

  // ---- 阿里山 / 玉山 / 靈境 / 日月潭 / 燈母祠 ----
  e_fog_veil: { name: '雲霧遮眼', desc: '', mp: 0, type: 'debuff', elem: 'water', target: 'enemies', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], status: { id: 'sleep', chance: 0.15, turns: 2 }, fx: 'wind', sfx: 'wind' },
  e_fog_chill: { name: '山嵐寒氣', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.3, fx: 'water', sfx: 'wind' },
  e_bear_swipe: { name: '熊掌', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.7, delay: 1.15, fx: 'claw', sfx: 'crit' },
  e_bear_roar: { name: '痛苦的咆哮', desc: '牠胸口纏著黑色的潮氣。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'earth' },
  e_eye_gaze: { name: '百目凝視', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'stun', chance: 0.2, turns: 1 }, fx: 'kaleido', sfx: 'magic' },
  e_eye_beam: { name: '瞳光', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.4, fx: 'beam', sfx: 'magic' },
  e_shade_coil: { name: '蛇影纏身', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'enemy', power: 1.15, status: { id: 'poison', chance: 0.5, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_shade_pattern: { name: '幻紋', desc: '蛇鱗上的紋路開始呼吸。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'trance', chance: 0.3, turns: 2 }, fx: 'kaleido', sfx: 'ghost' },
  e_mirror_strike: { name: '鏡像之擊', desc: '它用你的招式打你。', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.5, fx: 'slash', sfx: 'slash' },
  e_mirror_doubt: { name: '心魔低語', desc: '「你救不了任何人。」', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 3 }, { stat: 'mag', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'dark' },
  e_jiao_tide: { name: '蛟龍翻潭', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.1, fx: 'water_big', sfx: 'splash' },
  e_jiao_bite: { name: '蛟牙', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.45, fx: 'bite', sfx: 'hit' },
  e_statue_smash: { name: '石像鎮壓', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.6, delay: 1.2, fx: 'earth', sfx: 'earth' },
  e_moth_dust: { name: '燈蛾鱗粉', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.25, turns: 2 }, fx: 'sleep', sfx: 'wind' },
  e_moth_flare: { name: '撲火', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.3, fx: 'fire', sfx: 'fire' },
  e_qx_thunder: { name: '太虛雷（逆）', desc: '那是師父的雷法，卻是漆黑的。', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 1.25, fx: 'wood_big', sfx: 'thunder' },
  e_qx_seal: { name: '鎮魂敕令', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.6, turns: 3 }, fx: 'seal', sfx: 'bell' },
  e_qx_fire: { name: '五行・火', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.9, fx: 'fire_big', sfx: 'fire' },
  e_qx_water: { name: '五行・水', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.9, fx: 'water_big', sfx: 'water' },
  e_qx_metal: { name: '五行・金', desc: '', mp: 0, type: 'mag', elem: 'metal', target: 'enemy', power: 1.9, fx: 'metal_big', sfx: 'metal' },
  e_qx_puppet: { name: '被縛之手', desc: '清虛的手在顫抖，像在抵抗什麼。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'ghost' },
  e_qx_drain: { name: '奪魂', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 1.6, buffs: [{ stat: 'mag', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'dark' },

  // ---- 北港 / 安平 (逆潮) ----
  e_ds_spear: { name: '溺兵槍', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.3, fx: 'thrust', sfx: 'stab' },
  e_ds_volley: { name: '鏽箭齊發', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemies', power: 0.7, fx: 'thrust', sfx: 'slash2' },
  e_tg_wave: { name: '逆潮', desc: '潮水往岸上倒流。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.0, fx: 'water_big', sfx: 'splash' },
  e_tg_curse: { name: '潮怨', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 1.3, status: { id: 'spdDown', chance: 0.6, turns: 3 }, fx: 'dark', sfx: 'ghost' },
  e_qf2_sword: { name: '洛家劍・青鋒', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.75, fx: 'slash', sfx: 'slash' },
  e_qf2_storm: { name: '洛家劍・風雨', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'random', power: 0.62, hits: 5, fx: 'slash_multi', sfx: 'slash2' },
  e_qf2_tide: { name: '逆潮劍', desc: '劍上纏著黑色的潮水。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.1, fx: 'water_big', sfx: 'water' },
  e_qf2_resolve: { name: '「爹，娘……」', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }, { stat: 'spd', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' },

  // ---- 打狗 / 東港 / 恆春 / 鵝鑾鼻 ----
  e_greed_grab: { name: '再來一碗', desc: '「一碗一文錢，兩碗免錢——」', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.3, buffs: [{ stat: 'def', amt: -0.3, turns: 2 }], fx: 'claw', sfx: 'coin' },
  e_greed_coins: { name: '銅錢雨', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'random', power: 0.55, hits: 4, fx: 'metal', sfx: 'coin' },
  e_moray_bite: { name: '鰻牙', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.4, fx: 'bite', sfx: 'hit' },
  e_moray_coil: { name: '纏繞', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 0.9, status: { id: 'stun', chance: 0.35, turns: 1 }, fx: 'water', sfx: 'splash' },
  e_fw_gale: { name: '落山風', desc: '風從山上直直壓下來。', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 1.2, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'wind', sfx: 'wind' },
  e_fw_sand: { name: '飛沙', desc: '', mp: 0, type: 'debuff', elem: 'earth', target: 'enemies', power: 0, status: { id: 'stun', chance: 0.2, turns: 1 }, fx: 'earth', sfx: 'wind' },
  e_fw_crush: { name: '風壓', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 2.0, delay: 1.2, fx: 'wind', sfx: 'crit' },
  e_fw_calm: { name: '風眼', desc: '風忽然停了。', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'spd', amt: 0.3, turns: 3 }, { stat: 'atk', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'wind' },

  // ---- 蘭嶼 / 台東 / 太魯閣 / 頭城 ----
  e_sea_song: { name: '海妖之歌', desc: '', mp: 0, type: 'debuff', elem: 'water', target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.3, turns: 2 }, fx: 'song', sfx: 'sing' },
  e_sea_tentacle: { name: '觸手', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'random', power: 0.7, hits: 2, fx: 'water', sfx: 'splash' },
  e_cliff_slide: { name: '落石', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemies', power: 0.85, fx: 'earth_big', sfx: 'earth' },
  e_cliff_shell: { name: '大理石殼', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'earth' },
  e_hungry_grab: { name: '搶食', desc: '「餓……好餓……」', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.15, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }], fx: 'claw', sfx: 'hit' },
  e_hungry_wail: { name: '孤魂夜哭', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 0.85, fx: 'ghost', sfx: 'ghost' },
  e_ts_bite: { name: '潮蛇噬', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.8, fx: 'bite', sfx: 'crit' },
  e_ts_wave: { name: '黑潮翻湧', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.2, fx: 'water_big', sfx: 'splash' },
  e_ts_sick: { name: '潮病', desc: '牠鱗片下滲出黑色的潮水。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'poison', chance: 0.5, turns: 3 }, fx: 'poison', sfx: 'poison' },
  e_gc_smash: { name: '斷崖崩擊', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 2.1, delay: 1.25, fx: 'earth_big', sfx: 'earth' },
  e_gc_quake: { name: '峽谷震', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemies', power: 1.0, status: { id: 'stun', chance: 0.15, turns: 1 }, fx: 'earth_big', sfx: 'earth' },
  e_gc_river: { name: '濁流', desc: '碧綠的立霧溪被染成了黑色。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.1, fx: 'water_big', sfx: 'water' },

  // ---- 澎湖 / 玄武嶼 / 黑水溝 / 彼岸 / 一息界 ----
  e_pirate_cutlass: { name: '彎刀', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.3, fx: 'slash', sfx: 'slash' },
  e_pirate_cannon: { name: '鬼砲', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 0.95, delay: 1.2, fx: 'fire_big', sfx: 'earth' },
  e_swarm_drag: { name: '千手拖曳', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.0, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'ghost', sfx: 'splash' },
  e_kun_swallow: { name: '鯤吞', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 2.1, delay: 1.3, fx: 'bite', sfx: 'crit' },
  e_kun_spout: { name: '鯤噴潮', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.25, fx: 'water_big', sfx: 'splash' },
  e_kun_dive: { name: '潛淵', desc: '鯤沉入深處，海面一片死寂。', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 2 }], status: { id: 'regen', chance: 1, turns: 3 }, fx: 'water', sfx: 'splash' },
  e_lily_bloom: { name: '彼岸花開', desc: '', mp: 0, type: 'debuff', elem: 'fire', target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.3, turns: 2 }, fx: 'sleep', sfx: 'ghost' },
  e_lily_petal: { name: '紅蕊', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.35, status: { id: 'poison', chance: 0.3, turns: 3 }, fx: 'fire', sfx: 'fire' },
  e_faceless_steal: { name: '奪面', desc: '它想要一張臉，你的就很好。', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 1.3, status: { id: 'seal', chance: 0.4, turns: 2 }, fx: 'dark', sfx: 'dark' },
  e_warden_beam: { name: '塔燈', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 1.0, fx: 'beam', sfx: 'magic' },
  e_warden_key: { name: '守塔鐵鑰', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.5, fx: 'metal', sfx: 'metal' },
  e_child_riddle: { name: '萬象之謎', desc: '「你是光，還是看見光的眼睛？」', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'trance', chance: 0.5, turns: 2 }, fx: 'kaleido', sfx: 'magic' },
  e_child_play: { name: '捉迷藏', desc: '', mp: 0, type: 'mag', elem: null, target: 'random', power: 0.6, hits: 3, fx: 'kaleido', sfx: 'bell' },
  e_child_laugh: { name: '寶石笑聲', desc: '', mp: 0, type: 'heal', elem: null, target: 'allies', power: 1.0, fx: 'kaleido', sfx: 'bell' },
  e_yx_lamp: { name: '長明燈陣', desc: '「這些燈，每一盞都是一個不願被遺忘的人。」', mp: 0, type: 'mag', elem: 'fire', target: 'enemies', power: 1.2, fx: 'lantern', sfx: 'magic' },
  e_yx_oar: { name: '引魂槳・逆', desc: '那是引魂人的槳法，用來把人拉回來，而不是送走。', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.9, fx: 'water_big', sfx: 'crit' },
  e_yx_jar: { name: '封魂罐', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.6, turns: 3 }, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'seal', sfx: 'bell' },
  e_yx_reverse: { name: '逆潮', desc: '黑水溝倒流，死者的記憶湧上甲板。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.45, delay: 1.2, fx: 'water_big', sfx: 'splash' },
  e_yx_memory: { name: '念兒的燈', desc: '夜玄捧著那盞小小的魂燈，傷口在燈光下癒合。', mp: 0, type: 'heal', elem: null, target: 'self', power: 2.2, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }], fx: 'lantern', sfx: 'lantern' },
  e_yx_eternal: { name: '永不熄滅', desc: '「我不會讓任何人再被忘記。」', mp: 0, type: 'mag', elem: null, target: 'enemies', power: 1.9, delay: 1.3, status: { id: 'stun', chance: 0.2, turns: 1 }, fx: 'beam', sfx: 'dark' },
  e_wx_tide: { name: '無相之潮', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.35, fx: 'water_big', sfx: 'splash' },
  e_wx_forget: { name: '遺忘', desc: '你忘了自己為什麼握著劍。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'seal', chance: 0.4, turns: 2 }, buffs: [{ stat: 'atk', amt: -0.3, turns: 3 }], fx: 'dark', sfx: 'dark' },
  e_wx_maw: { name: '萬口', desc: '', mp: 0, type: 'phys', elem: null, target: 'random', power: 0.75, hits: 5, fx: 'bite', sfx: 'slash2' },
  e_wx_void: { name: '虛無', desc: '', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 2.6, delay: 1.3, fx: 'dark', sfx: 'dark' },
  e_wx_drown: { name: '溺斃萬魂', desc: '所有沉沒的記憶一起壓下來。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.8, delay: 1.4, status: { id: 'sleep', chance: 0.2, turns: 2 }, fx: 'water_big', sfx: 'ghost' },
};
// legacy id from the removed 糰子 summon (old saves): same skill as 白芷's 貓咪助陣, hidden from menus
G.Data.skills.yg_tuanzi = Object.assign({}, G.Data.skills.bz_maomi, { hidden: true });
