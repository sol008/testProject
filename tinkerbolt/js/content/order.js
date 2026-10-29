'use strict';
// Level order (change order v5): the two mechanics are interleaved instead of 15 + 15.
// Each mechanic keeps its own element order; hard levels (every 5th) alternate between them and never fall on a
// level that introduces a new element. Positions 1–15 are story chapter 1 (storefront), 16–30 chapter 2 (toys).
// Used by the game at load time and by tools/levelgen/screws_gen.js and tools/sim/solver.js.
(function () {
  const G = window.G;
  const D = (G.Data = G.Data || {});
  D.ORDER = [
    'c2_l01', 'c1_l01', 'c2_l02', 'c1_l02', 'c2_l03',   //  1– 5 (5: screws, hard)
    'c1_l03', 'c2_l04', 'c1_l04', 'c2_l05', 'c1_l05',   //  6–10 (10: candy, hard)
    'c2_l06', 'c1_l06', 'c2_l07', 'c1_l07', 'c2_l08',   // 11–15 (15: screws, hard)
    'c1_l08', 'c2_l09', 'c1_l10', 'c2_l10', 'c1_l09',   // 16–20 (20: candy, hard)
    'c2_l11', 'c1_l11', 'c2_l13', 'c1_l12', 'c2_l12',   // 21–25 (25: screws, hard)
    'c1_l13', 'c2_l14', 'c1_l14', 'c2_l15', 'c1_l15',   // 26–30 (30: candy, hard)
  ];
  D.positionOf = (id) => D.ORDER.indexOf(id) + 1;
  // Old saves (v1) numbered levels 1–15 candy then 16–30 screws.
  D.LEGACY_ORDER = [];
  for (let k = 1; k <= 15; k++) D.LEGACY_ORDER.push('c1_l' + String(k).padStart(2, '0'));
  for (let k = 1; k <= 15; k++) D.LEGACY_ORDER.push('c2_l' + String(k).padStart(2, '0'));
  if (D.levels && D.levels.length === D.ORDER.length) {
    const byId = {};
    for (const l of D.levels) byId[l.id] = l;
    D.levels = D.ORDER.map((id, i) => {
      const l = byId[id];
      l.n = i + 1;
      l.chapter = l.n <= 15 ? 1 : 2;
      l.hard = l.n % G.CONFIG.hardEvery === 0;
      return l;
    });
  }
})();
