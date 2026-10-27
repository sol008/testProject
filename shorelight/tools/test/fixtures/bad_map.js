// Deliberately broken map + script used by unit.js to prove validate.js catches problems.
// Never loaded by the game (not in index.html).
'use strict';
G.Maps.define('qa_bad', {
  name: 'QA',
  bgm: 'no_such_song',
  start: [0, 0],
  tiles: [
    'XXXXXX',
    'X....X',
    'X..@.X',
    'X....',
    'XXXXXX',
  ],
  objects: [{ t: 'no_such_object', x: 2, y: 1 }],
  chests: [{ id: 'c1', x: 1, y: 1, item: 'no_such_item' }],
  npcs: [
    { id: 'n1', sprite: 'old_m', x: 2, y: 2, talk: ['hi'] },
    { id: 'n1', sprite: 'old_m', x: 3, y: 3, portrait: 'no_such_portrait', talk: ['dup'] },
  ],
  enemies: [{ id: 'e1', troop: 'no_such_troop', x: 4, y: 2 }],
  warps: [
    { x: 4, y: 3, to: 'no_such_map', tx: 1, ty: 1 },
    { x: 1, y: 3, to: 'qa_bad', tx: 0, ty: 0 },
  ],
  events: [
    {
      trigger: 'action', x: 4, y: 1, run: async (S) => {
        await S.say('nobody_id', 'unknown speaker');
        await S.say('baizhi:grumpy', 'bad expression');
        await S.battle('no_such_troop2');
        await S.give('no_such_item2');
        S.quest('no_such_quest');
        if (S.has('qa_never_set_flag')) S.flag('qa_set_flag');
        G.Music.play('no_such_song2');
        S.sfx('no_such_sfx');
        await S.warp('qa_bad', 99, 99);
        await S.shop(['jinchuang', 'no_such_item3']);
      },
    },
  ],
});
