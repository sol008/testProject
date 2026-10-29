'use strict';
// Chapter 1 levels (match-3). Grid legend in js/engine/match3.js. Colours: 0 cherry 1 caramel 2 lemon 3 mint 4 berry 5 grape.
// `stars` = [2-star score, 3-star score], tuned by tools/sim/solver.js (docs/BALANCE.md).
(function () {
  const G = window.G;
  const D = (G.Data = G.Data || {});
  D.levels = D.levels || [];
  const L = (o) => { o.chapter = 1; o.mechanic = 'match3'; o.n = D.levels.length + 1; o.hard = o.n % G.CONFIG.hardEvery === 0; D.levels.push(o); };

  L({ id: 'c1_l01', title: 'Spilled cherries', colors: 4, moves: 8, seed: 101, stars: [19500, 28200],
    goals: [{ type: 'collect', color: 0, n: 20 }],
    tutorial: 'swap',
    grid: ['.......', '.......', '.......', '.......', '.......', '.......', '.......'] });

  L({ id: 'c1_l02', title: 'Two jars', colors: 5, moves: 11, seed: 102, stars: [17900, 22900],
    goals: [{ type: 'collect', color: 1, n: 18 }, { type: 'collect', color: 4, n: 18 }],
    grid: ['.......', '.......', '.......', '.......', '.......', '.......', '.......', '.......'] });

  L({ id: 'c1_l03', title: 'Lemon rockets', colors: 5, moves: 11, seed: 103, stars: [18900, 27000],
    goals: [{ type: 'collect', color: 2, n: 22 }],
    tutorial: 'specials',
    grid: [' ...... ', '........', '........', '........', '........', '........', '........', ' ...... '] });

  L({ id: 'c1_l04', title: 'Dusty counter', colors: 5, moves: 11, seed: 104, stars: [16100, 28300],
    goals: [{ type: 'dust' }],
    tutorial: 'dust',
    grid: ['.......', '.ddddd.', '.d...d.', '.d.d.d.', '.d...d.', '.ddddd.', '.......'] });

  L({ id: 'c1_l05', title: 'Heart of the shop', colors: 5, moves: 14, seed: 105, stars: [32600, 48200],
    goals: [{ type: 'dust' }],
    grid: ['........', '.dd..dd.', 'dddddddd', 'dddddddd', '.dddddd.', '..dddd..', '...dd...', '........'] });

  L({ id: 'c1_l06', title: 'Thick dust', colors: 5, moves: 13, seed: 106, stars: [30000, 40100],
    goals: [{ type: 'dust' }, { type: 'collect', color: 3, n: 12 }],
    grid: ['........', '........', '..dDDd..', '..DDDD..', '..DDDD..', '..dDDd..', '........', '........'] });

  L({ id: 'c1_l07', title: 'Old crates', colors: 5, moves: 11, seed: 107, stars: [12200, 18500],
    goals: [{ type: 'crate' }],
    tutorial: 'crate',
    grid: ['.......', '.......', 'c.c.c.c', '.......', 'C.C.C.C', '.......', '.......'] });

  L({ id: 'c1_l08', title: 'Stacked boxes', colors: 5, moves: 17, seed: 108, stars: [30500, 43300],
    goals: [{ type: 'crate' }, { type: 'dust' }],
    grid: ['........', '........', '........', '.cC..Cc.', '.cC..Cc.', 'dddddddd', 'dddddddd', '........'] });

  L({ id: 'c1_l09', title: 'Window frame', colors: 5, moves: 19, seed: 109, stars: [19400, 22800],
    goals: [{ type: 'crate' }, { type: 'collect', color: 4, n: 18 }],
    grid: ['........', '.cccccc.', '.c....c.', '.c.  .c.', '.c.  .c.', '.c....c.', '.cccccc.', '........'] });

  L({ id: 'c1_l10', title: 'Tied with twine', colors: 5, moves: 10, seed: 110, stars: [16800, 25500],
    goals: [{ type: 'dust' }],
    tutorial: 'twine',
    grid: ['.......', '.......', '.xx.xx.', '.......', '.xx.xx.', '.......', '.......'] });

  L({ id: 'c1_l11', title: 'Parcel day', colors: 5, moves: 16, seed: 111, stars: [30400, 43200],
    goals: [{ type: 'crate' }, { type: 'dust' }],
    grid: ['........', '..t..t..', '.cxxxxc.', '.cxxxxc.', '..t..t..', '........', 'cc....cc', '........'] });

  L({ id: 'c1_l12', title: 'Six sweet jars', colors: 6, moves: 28, seed: 112, stars: [29900, 39200],
    goals: [{ type: 'dust' }],
    grid: ['........', '.DDDDDD.', '.D....D.', '.D.tt.D.', '.D.tt.D.', '.D....D.', '.DDDDDD.', '........'] });

  L({ id: 'c1_l13', title: 'A gear in the jar', colors: 5, moves: 21, seed: 113, gears: 2, gearsOnBoard: 1, stars: [31700, 46200],
    goals: [{ type: 'gear', n: 2 }],
    tutorial: 'gear',
    grid: ['...g...', '.......', '.......', '.......', '.......', '.......', '.......', '.......'] });

  L({ id: 'c1_l14', title: 'Gears and dust', colors: 5, moves: 26, seed: 114, gears: 3, gearsOnBoard: 2, stars: [52000, 66600],
    goals: [{ type: 'gear', n: 3 }, { type: 'dust' }],
    grid: ['..g..g..', '........', '........', '........', 'dddddddd', 'dddddddd', 'dddddddd', 'dddddddd'] });

  L({ id: 'c1_l15', title: 'Grand tidy-up', colors: 5, moves: 25, seed: 115, gears: 3, gearsOnBoard: 2, stars: [54300, 69400],
    goals: [{ type: 'gear', n: 3 }, { type: 'crate' }, { type: 'dust' }],
    grid: ['...g....', '........', 'c......c', 'cc....cc', 'dddddddd', 'dDdxxdDd', 'dddddddd', 'dddddddd'] });
})();
