'use strict';
// Chapter 1 levels (match-3). Grid legend in js/engine/match3.js. Colours: 0 cherry 1 caramel 2 lemon 3 mint 4 berry 5 grape.
// `stars` = [2-star score, 3-star score], tuned by tools/sim/solver.js (docs/BALANCE.md).
(function () {
  const G = window.G;
  const D = (G.Data = G.Data || {});
  D.levels = D.levels || [];
  const L = (o) => { o.chapter = 1; o.mechanic = 'match3'; o.n = D.levels.length + 1; D.levels.push(o); };

  L({ id: 'c1_l01', title: 'Spilled cherries', colors: 4, moves: 15, seed: 101, stars: [60700, 96000],
    goals: [{ type: 'collect', color: 0, n: 56 }],
    tutorial: 'swap',
    grid: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'] });

  L({ id: 'c1_l02', title: 'Two jars', colors: 5, moves: 15, seed: 102, stars: [23500, 30100],
    goals: [{ type: 'collect', color: 1, n: 21 }, { type: 'collect', color: 4, n: 21 }],
    grid: ['.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......'] });

  L({ id: 'c1_l03', title: 'Lemon rockets', colors: 5, moves: 16, seed: 103, stars: [36700, 45500],
    goals: [{ type: 'collect', color: 2, n: 40 }],
    tutorial: 'specials',
    grid: [' ...... ', '........', '........', '........', '........', '........', '........', ' ...... '] });

  L({ id: 'c1_l04', title: 'Dusty counter', colors: 5, moves: 16, seed: 104, stars: [29200, 38400],
    goals: [{ type: 'dust' }, { type: 'collect', color: 0, n: 29 }],
    tutorial: 'dust',
    grid: ['.......', '.ddddd.', '.d...d.', '.d.d.d.', '.d...d.', '.ddddd.', '.......'] });

  L({ id: 'c1_l05', title: 'Heart of the shop', colors: 5, moves: 14, seed: 105, stars: [52100, 61200],
    goals: [{ type: 'dust' }, { type: 'collect', color: 0, n: 44 }],
    grid: ['........', '.dd..dd.', 'dddddddd', 'dddddddd', '.dddddd.', '..dddd..', '...dd...', '........'] });

  L({ id: 'c1_l06', title: 'Thick dust', colors: 5, moves: 16, seed: 106, stars: [45400, 54300],
    goals: [{ type: 'dust' }, { type: 'collect', color: 3, n: 42 }],
    grid: ['........', '........', '..dDDd..', '..DDDD..', '..DDDD..', '..dDDd..', '........', '........'] });

  L({ id: 'c1_l07', title: 'Old crates', colors: 5, moves: 16, seed: 107, stars: [29900, 36400],
    goals: [{ type: 'crate' }, { type: 'collect', color: 0, n: 29 }],
    tutorial: 'crate',
    grid: ['.......', '.......', 'c.c.c.c', '.......', 'C.C.C.C', '.......', '.......'] });

  L({ id: 'c1_l08', title: 'Stacked boxes', colors: 5, moves: 16, seed: 108, stars: [40000, 51200],
    goals: [{ type: 'crate' }, { type: 'dust' }, { type: 'collect', color: 0, n: 32 }],
    grid: ['........', '........', '........', '.cC..Cc.', '.cC..Cc.', 'dddddddd', 'dddddddd', '........'] });

  L({ id: 'c1_l09', title: 'Window frame', colors: 5, moves: 17, seed: 109, stars: [29000, 40100],
    goals: [{ type: 'crate' }, { type: 'collect', color: 4, n: 33 }],
    grid: ['........', '.cccccc.', '.c....c.', '.c.  .c.', '.c.  .c.', '.c....c.', '.cccccc.', '........'] });

  L({ id: 'c1_l10', title: 'Tied with twine', colors: 5, moves: 16, seed: 110, stars: [25800, 35000],
    goals: [{ type: 'dust' }, { type: 'collect', color: 0, n: 29 }],
    tutorial: 'twine',
    grid: ['.......', '.......', '.xx.xx.', '.......', '.xx.xx.', '.......', '.......'] });

  L({ id: 'c1_l11', title: 'Parcel day', colors: 5, moves: 16, seed: 111, stars: [26000, 37400],
    goals: [{ type: 'crate' }, { type: 'dust' }, { type: 'collect', color: 0, n: 23 }],
    grid: ['........', '..t..t..', '.cxxxxc.', '.cxxxxc.', '..t..t..', '........', 'cc....cc', '........'] });

  L({ id: 'c1_l12', title: 'Six sweet jars', colors: 6, moves: 28, seed: 112, stars: [33000, 41200],
    goals: [{ type: 'dust' }],
    grid: ['........', '.DDDDDD.', '.D....D.', '.D.tt.D.', '.D.tt.D.', '.D....D.', '.DDDDDD.', '........'] });

  L({ id: 'c1_l13', title: 'A gear in the jar', colors: 5, moves: 16, seed: 113, gears: 2, gearsOnBoard: 1, stars: [30800, 44200],
    goals: [{ type: 'gear', n: 2 }, { type: 'collect', color: 0, n: 14 }],
    tutorial: 'gear',
    grid: ['...g...', '.......', '.......', '.......', '.......', '.......', '.......', '.......'] });

  L({ id: 'c1_l14', title: 'Gears and dust', colors: 5, moves: 21, seed: 114, gears: 3, gearsOnBoard: 2, stars: [51300, 68400],
    goals: [{ type: 'gear', n: 3 }, { type: 'dust' }],
    grid: ['..g..g..', '........', '........', '........', 'dddddddd', 'dddddddd', 'dddddddd', 'dddddddd'] });

  L({ id: 'c1_l15', title: 'Grand tidy-up', colors: 5, moves: 17, seed: 115, gears: 3, gearsOnBoard: 2, stars: [51000, 69900],
    goals: [{ type: 'gear', n: 3 }, { type: 'crate' }, { type: 'dust' }],
    grid: ['...g....', '........', 'c......c', 'cc....cc', 'dddddddd', 'dDdxxdDd', 'dddddddd', 'dddddddd'] });
})();
