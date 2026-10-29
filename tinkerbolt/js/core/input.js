'use strict';
// Pointer input (touch, mouse, pen) → logical-space events. Real DOM events are the only source;
// tests drive them with real mouse/touch input too.
(function () {
  const G = window.G;
  const I = (G.Input = G.Input || {});
  I.queue = [];
  I.down = null;          // {id, x, y, sx, sy, t}
  I.x = -1;
  I.y = -1;
  I.lastInput = 0;        // G.time of the last input (idle hints, play-stats clock)

  function push(type, e) {
    const p = G.Render.toLogical(e.clientX, e.clientY);
    I.x = p.x; I.y = p.y;
    I.lastInput = G.time;
    I.queue.push({ type, x: p.x, y: p.y, id: e.pointerId });
    return p;
  }

  I.init = function () {
    const el = document.getElementById('stage');
    el.addEventListener('pointerdown', (e) => {
      if (I.down) return;                 // single-pointer game
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events in tests */ }
      const p = push('down', e);
      I.down = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: G.time };
      if (G.Audio) G.Audio.unlock();
    });
    el.addEventListener('pointermove', (e) => {
      if (I.down && e.pointerId !== I.down.id) return;
      const p = push('move', e);
      if (I.down) { I.down.x = p.x; I.down.y = p.y; }
    });
    const up = (e) => {
      if (!I.down || e.pointerId !== I.down.id) return;
      push(e.type === 'pointercancel' ? 'cancel' : 'up', e);
      I.down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      I.lastInput = G.time;
      I.queue.push({ type: 'key', key: e.key });
      if (G.Audio) G.Audio.unlock();
    });
  };

  I.take = function () { const q = I.queue; I.queue = []; return q; };
  I.idleFor = () => G.time - I.lastInput;
})();
