// Shared art registries. Art modules register into these; the engine only calls the public draw APIs.
// See docs/CONTRACTS.md for the full specification.
'use strict';

// ---- Terrain tiles -------------------------------------------------------------
G.Tiles = {
  defs: {},
  define(id, def) { this.defs[id] = Object.assign({ solid: false, wall: false, water: false, anim: false }, def); },
  get(id) { return this.defs[id] || this.defs.void; },
  // nb(dx, dy) -> terrain id of neighbour (out-of-bounds returns the same id as the centre cell)
  draw(ctx, id, px, py, nb, cx, cy, t) {
    const d = this.get(id);
    if (d && d.draw) d.draw(ctx, px, py, nb, cx, cy, t);
  },
};

// ---- Map objects (nature, buildings, props) -----------------------------------
G.Objects = {
  defs: {},
  define(type, def) { this.defs[type] = Object.assign({ w: 1, h: 1, solid: true }, def); },
  get(type) { return this.defs[type]; },
  draw(ctx, o, px, py, t) {
    const d = this.defs[o.t];
    if (d && d.draw) d.draw(ctx, px, py, o, t);
  },
};

// ---- Battle monsters ----------------------------------------------------------------
G.Monsters = {
  defs: {},
  define(id, def) { this.defs[id] = Object.assign({ w: 140, h: 160 }, def); },
  get(id) { return this.defs[id]; },
  has(id) { return !!this.defs[id]; },
  draw(ctx, id, x, y, t, o = {}) {
    const d = this.defs[id];
    if (d && d.draw) d.draw(ctx, x, y, t, o);
    else {
      // placeholder blob
      ctx.save();
      ctx.fillStyle = '#7a5cff';
      ctx.beginPath(); ctx.ellipse(x, y - 50, 45, 50, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  },
};
