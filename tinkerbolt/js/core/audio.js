'use strict';
// Chiptune sound effects, synthesized (no files, no music). Volume and on/off come from settings.
// Haptics live here too, as a separate channel with its own settings.
(function () {
  const G = window.G;
  const A = (G.Audio = G.Audio || {});
  let ac = null, master = null, noise = null;
  A.played = [];            // last SFX ids, for tests
  A.ok = false;

  A.unlock = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.ok = true;
      A.applySettings();
    } catch (e) { G.warnOnce('audio init', e); }
  };

  A.applySettings = function () {
    if (!master) return;
    const S = G.Settings;
    const on = S ? S.get('sfxOn') : true;
    const vol = S ? S.get('sfxVol') : 0.7;
    master.gain.value = on ? vol * 0.5 : 0;
  };

  function tone(type, f0, f1, dur, vol, when) {
    const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(dur, vol, freq, when) {
    const t = ac.currentTime + (when || 0);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noise;
    f.type = 'bandpass'; f.frequency.value = freq || 3000; f.Q.value = 1.2;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319];

  const SFX = {
    tap: () => tone('square', 880, 1100, 0.05, 0.15),
    swap: () => { tone('triangle', 440, 660, 0.09, 0.3); },
    bad: () => { tone('square', 220, 160, 0.12, 0.18); tone('square', 200, 140, 0.12, 0.14, 0.09); },
    pop: (n) => { const f = NOTES[Math.min(NOTES.length - 1, n || 0)]; tone('square', f, f * 1.5, 0.08, 0.16); hiss(0.05, 0.08, 4000); },
    special: () => { tone('square', 660, 1320, 0.18, 0.18); tone('triangle', 330, 990, 0.2, 0.25, 0.03); },
    blast: () => { hiss(0.28, 0.3, 1200); tone('triangle', 180, 60, 0.3, 0.35); },
    rainbow: () => { [0, 2, 4, 5, 7].forEach((k, i) => tone('square', NOTES[k], NOTES[k] * 1.01, 0.09, 0.14, i * 0.05)); },
    crate: () => { hiss(0.12, 0.25, 700); tone('square', 150, 90, 0.1, 0.18); },
    dust: () => hiss(0.15, 0.12, 2500),
    gear: () => { tone('square', 784, 784, 0.06, 0.15); tone('square', 1047, 1047, 0.1, 0.15, 0.07); },
    unscrew: () => { for (let i = 0; i < 4; i++) tone('square', 900 + i * 120, 950 + i * 120, 0.025, 0.1, i * 0.03); },
    drop: () => tone('triangle', 520, 380, 0.08, 0.25),
    box: () => { tone('square', 659, 659, 0.07, 0.16); tone('square', 988, 988, 0.12, 0.16, 0.08); },
    plate: () => { tone('triangle', 300, 120, 0.35, 0.3); hiss(0.2, 0.1, 900); },
    full: () => tone('square', 160, 150, 0.2, 0.16),
    win: () => { [0, 2, 4, 7].forEach((k, i) => tone('square', NOTES[k], NOTES[k], 0.14, 0.16, i * 0.11)); tone('triangle', NOTES[7], NOTES[7], 0.4, 0.2, 0.45); },
    lose: () => { [4, 2, 0].forEach((k, i) => tone('triangle', NOTES[k] / 2, NOTES[k] / 2, 0.2, 0.25, i * 0.16)); },
    star: (n) => { const f = NOTES[2 + 2 * (n || 0)]; tone('square', f, f * 2, 0.15, 0.16); },
    coin: () => { tone('square', 988, 988, 0.05, 0.12); tone('square', 1319, 1319, 0.12, 0.12, 0.05); },
    click: () => tone('square', 660, 660, 0.04, 0.12),
    restore: () => { [0, 4, 7, 4, 7].forEach((k, i) => tone('triangle', NOTES[k], NOTES[k], 0.12, 0.25, i * 0.08)); },
    beep: () => { tone('square', 1200, 1500, 0.06, 0.1); tone('square', 1500, 1100, 0.07, 0.1, 0.08); },
  };
  A.ids = Object.keys(SFX);

  A.play = function (id, arg) {
    A.played.push(id);
    if (A.played.length > 50) A.played.shift();
    if (!ac || !A.ok) return;
    if (G.Settings && !G.Settings.get('sfxOn')) return;
    const f = SFX[id];
    if (!f) { G.warnOnce('sfx ' + id); return; }
    try { f(arg); } catch (e) { G.warnOnce('sfx ' + id, e); }
  };

  // ---- haptics (separate channel) ----
  const H = (G.Haptics = G.Haptics || {});
  H.log = [];
  const PATTERNS = { tap: 8, pop: 12, special: [18, 30, 18], win: [20, 40, 20, 40, 40], bad: [10, 30, 10], plate: 25 };
  H.buzz = function (kind) {
    if (!G.Settings || !G.Settings.get('vibeOn')) return;
    let p = PATTERNS[kind] || 10;
    const k = G.Settings.get('vibeStrong') ? 2 : 1;
    p = Array.isArray(p) ? p.map((v, i) => (i % 2 === 0 ? v * k : v)) : p * k;
    H.log.push(kind);
    if (H.log.length > 50) H.log.shift();
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not supported */ }
  };
})();
