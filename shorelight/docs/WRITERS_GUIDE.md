# Writers' guide — 《彼岸燈》 Shorelight screenplays

Read docs/STORY_BIBLE.md first (canon), especially "The journey", "Chapter beats" and the binding
"Cultural accuracy & respect guide". Several writers work in parallel, one per chapter group; stay
consistent with the bible and with these conventions so implementers can turn every file into code.

## Output format (Markdown, one file per chapter)
1. **Maps** — for each map: id (ascii, e.g. `jiufen`, `jiufen_shop`), Chinese name, purpose, approx size in
   64px tiles (towns 40×30 to 60×45, interiors 12×9 to 20×14, dungeons 40×40+), a prose layout + rough ASCII
   sketch (landmarks, buildings, exits, NPCs, chests, monsters, events, puzzles), time of day & lighting
   (ambient darkness 0–1), particles (fireflies, mist, rain, leaves, petals, embers, motes, lanterns, wind,
   snow), BGM id (from docs/CONTRACTS.md music list), and connections (which edge/door leads where).
   Use art ids from docs/CONTRACTS.md (terrain, objects, objects2 regional types) where you can.
2. **NPCs** — id, sprite id (CONTRACTS sprite ids incl. regional ones), portrait id if any, position hint,
   ALL dialogue, and how it changes with story flags. Towns should feel alive and specific to their region:
   local food, trades, festivals, gossip, history, folklore, humour, foreshadowing.
3. **Cutscenes** as numbered beats: `角色(表情): 台詞` (expressions: normal, smile, laugh, sad, cry, angry,
   surprise, think, shy, hurt, serious, smug); stage directions in [brackets] (移動, 轉向, 情緒圖示 !?♪…💢,
   特效, 音效, BGM, 震動, 淡出淡入, 鏡頭); choices `選項：A / B` with branches; flags set (`flag: snake_case`);
   items given (Chinese name); party joins/leaves; battles: `戰鬥: [enemy, enemy] (boss?, 背景 bg id, BGM, 特殊規則)`.
   Character ids: xinghe 星河, baizhi 白芷, hongying 紅纓, yungui 雲歸, chenbo 陳伯, yexuan 夜玄,
   qingfeng 青鋒 (qingfeng_mask while masked), qingxu 清虛, moya 墨鴉, tengpo 藤婆, nianer 夜念.
4. **Side quests (心燈)** step by step with dialogue, conditions, rewards (`心燈 +1: <name>`).
5. **Shops / inns / chests / puzzles** — shop inventories (Chinese item names + rough price), inn price, chest
   locations + contents, puzzles with precise mechanics (state, inputs, solution, failure).
6. **Enemies** — which enemies appear on which map (from the bible roster / CONTRACTS monster ids), and boss
   designs (name, look, gimmick, phase changes, story beats mid-battle).

## Style
- Natural, literary-but-readable Traditional Chinese. Dialogue lines ≤ 60 characters (split long speeches).
- Distinct voices: 星河 cheeky, kind, brave when it counts; 白芷 gentle, curious, poetic, hilariously literal
  about human customs; 紅纓 blunt, proud, tsundere, terrible cook, loves cute things (esp. the cats); 雲歸
  sarcastic, lazy, secretly loyal, amateur mycologist and (after mushrooms) cosmic philosopher; pets 芋圓 (deadpan, greedy, protective of 星河) and
  麻糬 (serene, devoted to 白芷) never speak: write them as narration + emotes. **糰子 has been cut — do not use.**
  when high on spirit mushrooms; 陳伯 gruff with hidden tenderness; 夜玄 calm, courteous, tragic.
- Funny, warm, then heartbreaking where it matters. Foreshadow; pay off. Every region should leave the
  player knowing something true and specific about that place and its people.
- Light 閩南 (阿伯, 阿嬤, 囝仔, 歹勢, 甲飽未, 好佳哉, 夭壽), Hakka flavour in Hakka villages, and for
  Indigenous characters use a few words of their own language only where you are confident of them
  (otherwise write their speech in plain Chinese — never pidgin or broken speech).
- Party size: 星河 + 白芷 (ch1–6), + 紅纓 (from ch2), + 雲歸 (from ch3); pets 芋圓 & 麻糬 follow from ch1; 白芷 absent ch7–ch11 until the
  finale; 陳伯 travels with them from ch9 as the 王船's helmsman (guest).
