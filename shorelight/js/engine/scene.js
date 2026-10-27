// Scene stack. Scenes: { update(dt), draw(ctx), opaque?:bool, enter?(), exit?(), resume?() }
'use strict';
G.Scenes = (() => {
  const stack = [];
  const S = {
    stack,
    top: () => stack[stack.length - 1],
    push(s) { stack.push(s); if (s.enter) s.enter(); return s; },
    pop(s) {
      const i = s ? stack.lastIndexOf(s) : stack.length - 1;
      if (i < 0) return;
      const [r] = stack.splice(i, 1);
      if (r.exit) r.exit();
      const t = S.top();
      if (t && t.resume) t.resume();
      return r;
    },
    replace(s) {
      while (stack.length) { const r = stack.pop(); if (r.exit) r.exit(); }
      return S.push(s);
    },
    has: (s) => stack.includes(s),
    update(dt) {
      // only the top scene receives input/update; scenes below may request background updates
      const top = S.top();
      for (let i = 0; i < stack.length - 1; i++) if (stack[i].bgUpdate) stack[i].bgUpdate(dt);
      if (top) top.update(dt);
    },
    // the lowest scene that will be drawn this frame
    base() {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].opaque) return stack[i];
      return stack[0];
    },
    draw(ctx) {
      let start = 0;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].opaque) { start = i; break; }
      for (let i = start; i < stack.length; i++) stack[i].draw(ctx);
    },
  };
  // readable name of a scene for diagnostics (class name; plain-object scenes may set `sceneName`)
  S.nameOf = (s) => (s && (s.sceneName || (s.constructor && s.constructor !== Object && s.constructor.name))) || (s ? 'Object' : 'none');
  S.names = () => stack.map(S.nameOf);
  return S;
})();

// Placeholder base scene (black when opaque) used while a chapter / load sets up the real one. Named so stuck-test
// diagnostics that print constructor.name stay readable.
G.BlankScene = class BlankScene {
  constructor(opaque = true) { this.opaque = opaque; }
  update() {}
  draw(ctx) { if (this.opaque) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H); } }
};
