// Story bootstrap. Chapter files (js/maps/chN_*.js) add chapter functions to G.Story.
'use strict';
G.Story = G.Story || {};
G.Story.newGame = function () {
  G.Party.join('xinghe', 1);
  G.state.chapter = 0;
  G.state.gold = 0;
  const def = G.Maps.get('dream');
  if (def) {
    const [x, y] = def.start || [10, 20];
    G.Mapx.goto('dream', x, y, 'up');
  } else {
    // prologue not yet implemented: fall back to the first defined map
    const id = Object.keys(G.Maps.defs).find((k) => k !== 'sandbox') || 'sandbox';
    const d = G.Maps.get(id);
    G.Mapx.goto(id, (d.start || [5, 5])[0], (d.start || [5, 5])[1], 'down');
  }
};
