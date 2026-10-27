// Sandbox map for engine testing (reachable via ?debug&map=sandbox)
'use strict';
G.Maps.define('sandbox', {
  name: '測試之地',
  subtitle: '引擎測試',
  bgm: 'jiufen',
  start: [8, 9],
  light: { ambient: 0 },
  particles: ['petals'],
  tiles: [
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    '...........##.................',
    '...........##.......sssss~~~~~',
    '....,,,,...##......sssss~~~~~~',
    '....,,,,...HH.....ssss~~~~~~~~',
    '....,,,,...HH.....sss~~~~~~~~~',
    '...........##......ss~~~~~~~~~',
    '===========##=======s~~~~~~~~~',
    '===========##========~~~~~~~~~',
    '...........##......s~~~~~~~~~~',
    '....""""...##.....ss~~~~~~~~~~',
    '....""""...##.....sss~~~~~~~~~',
    '...........##......ssss~~~~~~~',
    '...........##.......sssss~~~~~',
    '..........................ss~~',
    '..............................',
    '..............................',
  ],
  deco: [
    '',
    '',
    't  b                c         ',
    '',
    '                              ',
    ' u                            ',
    '',
    '',
    '',
    '',
    '',
    '',
    '                              ',
    '  B             a             ',
    '',
    '      m    M                  ',
  ],
  objects: [
    { t: 'house_jiufen', x: 2, y: 9, w: 4, h: 3, door: 1 },
    { t: 'lantern_string', x: 13, y: 7, w: 5 },
    { t: 'stall', x: 14, y: 11 },
    { t: 'well', x: 7, y: 13 },
    { t: 'water_lantern', x: 24, y: 9 },
    { t: 'water_lantern', x: 26, y: 12 },
  ],
  chests: [{ id: 'c1', x: 9, y: 3, gold: 100 }],
  npcs: [
    { id: 'old', sprite: 'old_m', x: 6, y: 8, dir: 'down', name: '阿伯', wander: 2, talk: ['少年仔，這裡是測試用的地方啦。', '要不要去海邊看看水燈？'] },
    {
      id: 'bz', sprite: 'baizhi', x: 16, y: 9, dir: 'left', portrait: 'baizhi', talk: async (S) => {
        await S.say('baizhi:smile', '星河，你看，那些燈在海上漂。');
        const c = await S.choice(['好美', '有點可怕']);
        if (c === 0) await S.say('baizhi:smile', '嗯。好像每一盞，都在找回家的路。');
        else { S.emote('bz', '?'); await S.say('baizhi:think', '可怕？為什麼？它們只是……很想被記住而已。'); }
        await S.lantern('test_lantern', '測試之燈');
      },
    },
  ],
  enemies: [
    { id: 'e1', troop: 'test_troop', x: 18, y: 15, art: 'mosina' },
  ],
  events: [
    { trigger: 'action', x: 11, y: 2, w: 2, h: 1, run: async (S) => { await S.say('', '石階通往山上的金礦。'); } },
  ],
});
