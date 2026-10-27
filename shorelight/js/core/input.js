// Keyboard / gamepad / mouse input
'use strict';
G.Input = (() => {
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Enter: 'ok', Space: 'ok', KeyZ: 'ok', KeyJ: 'ok', NumpadEnter: 'ok',
    Escape: 'cancel', KeyX: 'cancel', Backspace: 'cancel', KeyK: 'cancel',
    ShiftLeft: 'run', ShiftRight: 'run',
    KeyC: 'menu', KeyM: 'menu', Tab: 'menu',
    KeyQ: 'pgup', KeyE: 'pgdn', PageUp: 'pgup', PageDown: 'pgdn',
    KeyF: 'auto', KeyL: 'log', ControlLeft: 'skip', ControlRight: 'skip', MetaLeft: 'skip',
    F2: 'debug',
  };
  const held = {};
  const pressedNow = {};
  const repeatT = {};
  let anyKey = false;
  let mouse = { x: 0, y: 0, clicked: false, moved: false };
  let gpPrev = {};

  window.addEventListener('keydown', (e) => {
    if (e.metaKey && e.code !== 'MetaLeft') return; // ⌘-shortcuts (e.g. ⌘F fullscreen) are not game input
    const a = KEYMAP[e.code];
    if (a) {
      e.preventDefault();
      if (!held[a]) { pressedNow[a] = true; repeatT[a] = 0; }
      held[a] = true;
    }
    anyKey = true;
    if (G.Audio) G.Audio.unlock();
  });
  window.addEventListener('keyup', (e) => {
    const a = KEYMAP[e.code];
    if (a) { held[a] = false; e.preventDefault(); }
  });
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  function canvasPos(e) {
    const r = G.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * G.W, y: (e.clientY - r.top) / r.height * G.H };
  }
  window.addEventListener('mousedown', (e) => {
    if (!G.canvas) return;
    const p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y;
    if (e.button === 0) { mouse.clicked = true; anyKey = true; }
    if (e.button === 2) { pressedNow.cancel = true; }
    if (G.Audio) G.Audio.unlock();
  });
  window.addEventListener('mousemove', (e) => {
    if (!G.canvas) return;
    const p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y; mouse.moved = true;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('touchstart', () => { anyKey = true; mouse.clicked = true; if (G.Audio) G.Audio.unlock(); }, { passive: true });

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (!gp) return;
    const st = {
      up: gp.buttons[12]?.pressed || gp.axes[1] < -0.5,
      down: gp.buttons[13]?.pressed || gp.axes[1] > 0.5,
      left: gp.buttons[14]?.pressed || gp.axes[0] < -0.5,
      right: gp.buttons[15]?.pressed || gp.axes[0] > 0.5,
      ok: gp.buttons[0]?.pressed,
      cancel: gp.buttons[1]?.pressed,
      menu: gp.buttons[3]?.pressed || gp.buttons[9]?.pressed,
      run: gp.buttons[2]?.pressed || gp.buttons[5]?.pressed,
      pgup: gp.buttons[4]?.pressed,
      pgdn: gp.buttons[5]?.pressed,
      auto: gp.buttons[8]?.pressed,
    };
    for (const k in st) {
      if (st[k] && !gpPrev[k]) { pressedNow[k] = true; repeatT[k] = 0; anyKey = true; }
      if (st[k]) held[k] = true;
      else if (gpPrev[k]) held[k] = false;
    }
    gpPrev = st;
  }

  const I = {
    held: (a) => !!held[a],
    // consumed pressed check
    pressed(a) {
      if (pressedNow[a]) { pressedNow[a] = false; return true; }
      return false;
    },
    peek: (a) => !!pressedNow[a],
    // pressed with auto-repeat (for menus)
    repeat(a) {
      if (pressedNow[a]) { pressedNow[a] = false; return true; }
      if (held[a] && repeatT[a] > 0.32) { repeatT[a] -= 0.075; return true; }
      return false;
    },
    clicked() {
      if (mouse.clicked) { mouse.clicked = false; return true; }
      return false;
    },
    mouse,
    anyKey() { const r = anyKey; anyKey = false; return r; },
    dir() {
      if (held.up) return 'up';
      if (held.down) return 'down';
      if (held.left) return 'left';
      if (held.right) return 'right';
      return null;
    },
    lastDir: null,
    update(dt) {
      pollGamepad();
      for (const k in held) if (held[k]) repeatT[k] = (repeatT[k] || 0) + dt;
    },
    endFrame() {
      for (const k in pressedNow) pressedNow[k] = false;
      mouse.clicked = false;
    },
    clear() {
      for (const k in pressedNow) pressedNow[k] = false;
      mouse.clicked = false;
      anyKey = false;
    },
    // test hook
    _press(a) { pressedNow[a] = true; held[a] = true; setTimeout(() => (held[a] = false), 60); },
    _hold(a, v) { held[a] = v; if (v) pressedNow[a] = true; },
  };
  return I;
})();
