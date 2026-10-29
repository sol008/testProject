'use strict';
// Scene stack. Only the top scene gets input and update; drawing starts at the highest opaque scene.
// A scene: {name, opaque, view3d, enter(), exit(), resume(), update(dt), draw(ctx), input(ev)}.
(function () {
  const G = window.G;
  const S = (G.Scenes = G.Scenes || { stack: [] });
  S.top = () => S.stack[S.stack.length - 1] || null;
  S.push = function (sc) {
    S.stack.push(sc);
    try { if (sc.enter) sc.enter(); } catch (e) { console.error(e); G.lastError = e; }
    G.Input.queue = [];
    return sc;
  };
  S.pop = function () {
    const sc = S.stack.pop();
    try { if (sc && sc.exit) sc.exit(); } catch (e) { console.error(e); G.lastError = e; }
    const t = S.top();
    try { if (t && t.resume) t.resume(); } catch (e) { console.error(e); G.lastError = e; }
    G.Input.queue = [];
    return sc;
  };
  // Replace the whole stack with one scene.
  S.reset = function (sc) {
    while (S.stack.length) S.pop();
    G.FX.clear();
    return S.push(sc);
  };
  S.update = function (dt) {
    const t = S.top();
    if (!t) return;
    for (const ev of G.Input.take()) { try { if (t.input) t.input(ev); } catch (e) { console.error(e); G.lastError = e; } }
    try { if (t.update) t.update(dt); } catch (e) { console.error(e); G.lastError = e; }
    for (const sc of S.stack) if (sc !== t && sc.bgUpdate) sc.bgUpdate(dt);
  };
  S.base = function () {
    for (let i = S.stack.length - 1; i >= 0; i--) if (S.stack[i].opaque) return S.stack[i];
    return S.stack[0] || null;
  };
  S.draw = function (ctx) {
    let start = 0;
    for (let i = S.stack.length - 1; i >= 0; i--) if (S.stack[i].opaque) { start = i; break; }
    for (let i = start; i < S.stack.length; i++) {
      ctx.save();
      try { if (S.stack[i].draw) S.stack[i].draw(ctx); } catch (e) { console.error(e); G.lastError = e; }
      ctx.restore();
    }
  };
  S.names = () => S.stack.map((s) => s.name);
})();
