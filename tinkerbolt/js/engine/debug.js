'use strict';
// Debug surface (only with ?debug in the URL). Tests use it to read state and to find screen positions,
// never to skip the real input path: taps are still real pointer events.
(function () {
  const G = window.G;
  G.debug = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
  const D = (G.Debug = G.Debug || {});
  D.param = (k) => { const m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; };
  // Is the game waiting for input? (no tweens, no flights, no resolution in progress)
  D.idle = function () {
    const t = G.Scenes.top();
    if (!t) return false;
    if (G.Tw.busy()) return false;
    if (t.name === 'match3' && (t.busy || t._settle)) return false;
    if (t.name === 'screws' && (t.flights.length || t.falling.length || t.leaving.length || t.blocked)) return false;
    if (t.name === 'screws' && t.vis && t.vis.some((v) => v && Math.abs(v.vel) > 0.5)) return false;   // a plate is still swinging
    if (t.name === 'dialog' && !t.full()) return false;
    return true;
  };
  // Terminal / waiting states a test may hit.
  D.state = function () {
    const t = G.Scenes.top();
    return { top: t && t.name, stack: G.Scenes.names(), idle: D.idle(), lastError: G.lastError ? String(G.lastError) : null,
      lives: G.Progress.lives(), coins: G.state.coins, stars: G.Progress.stars(), streak: G.state.streak, r3: !!(G.R3 && G.R3.visible), r3frames: G.R3 ? G.R3.frames : 0 };
  };
  D.toClient = (x, y) => G.Render.toClient(x, y);
  // Screen (client) position of a match-3 cell or a screw, for real pointer input.
  D.cellClient = function (x, y) { const s = G.Scenes.top(); const p = s.cellCenter(x, y); return G.Render.toClient(p.x, p.y); };
  D.screwClient = function (i) { const s = G.Scenes.top(); const p = s.screwPos(i); return G.Render.toClient(p.x, p.y); };
  D.buttonClient = function (label) {
    for (let i = G.Scenes.stack.length - 1; i >= 0; i--) {
      const sc = G.Scenes.stack[i];
      for (const b of sc.ui || []) if (b.visible && b.enabled && (b.label === label || b.icon === label)) return G.Render.toClient(b.x + b.w / 2, b.y + b.h / 2);
      if (sc.opaque) break;
    }
    return null;
  };
  // Test fixtures: start of a chapter (all earlier levels won with 2 stars, restorations bought as the story requires).
  D.chapterStart = function (ch) {
    G.Save.reset();
    G.state.story = { intro: 1 };
    G.state.lastLoginDay = G.U.today();
    for (const l of G.Data.levels) if (l.chapter < ch) G.state.levels[l.n] = { best: 2, attempts: 1, wins: 1, bestScore: 0 };
    for (const t of G.Data.restorations) if (t.chapter < ch) G.state.restored.push(t.id);
    G.Save.save();
  };
  // Fixture for a single level: chapter start, plus every earlier level of that chapter won (1 star each).
  D.levelStart = function (n) {
    D.chapterStart(G.Progress.level(n).chapter);
    for (const l of G.Data.levels) if (l.n < n && !G.state.levels[l.n]) G.state.levels[l.n] = { best: 1, attempts: 1, wins: 1, bestScore: 0 };
    G.Save.save();
  };
  D.solution = function () { const s = G.Scenes.top(); return s && s.level ? s.level.solution : null; };
})();
