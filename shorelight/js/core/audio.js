// WebAudio synthesiser: Chinese-flavoured instruments + sound effects, no audio files needed.
'use strict';
G.Audio = (() => {
  let ac = null, master, musicBus, sfxBus, reverb, reverbSend;
  const settings = { music: 0.6, sfx: 0.8 };
  const ksCache = {};
  let noiseBuf = null;

  function init() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.9;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = settings.music;
    sfxBus = ac.createGain(); sfxBus.gain.value = settings.sfx;
    musicBus.connect(master); sfxBus.connect(master);
    // simple convolution reverb (generated impulse) for that misty, spacious feel
    reverb = ac.createConvolver();
    const len = ac.sampleRate * 2.6;
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    reverbSend = ac.createGain(); reverbSend.gain.value = 0.32;
    reverbSend.connect(reverb); reverb.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function unlock() {
    init();
    if (ac && ac.state === 'suspended') ac.resume();
  }

  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function noteToMidi(n) {
    // e.g. "c4", "d#5", "bb3"
    const m = /^([a-g])([#b]?)(-?\d)$/.exec(n);
    if (!m) return null;
    let v = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return v + (parseInt(m[3], 10) + 1) * 12;
  }

  // Karplus-Strong plucked string buffer (guzheng / pipa timbre)
  function ksBuffer(midi, bright = 0.5, dur = 2.2) {
    const key = midi + ':' + bright + ':' + dur;
    if (ksCache[key]) return ksCache[key];
    const sr = ac.sampleRate;
    const f = freq(midi);
    const N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * dur);
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / N * Math.PI));
    let idx = 0;
    const decay = 0.996 - (midi > 72 ? 0.004 : 0) + (midi < 55 ? 0.002 : 0);
    const blend = 0.5 + bright * 0.45;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % N];
      const v = (cur * blend + nxt * (1 - blend)) * decay;
      ring[idx] = v;
      d[i] = cur;
      idx = (idx + 1) % N;
      prev = v;
    }
    // soft fade end
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    ksCache[key] = buf;
    return buf;
  }

  // attack / decay / sustain / release. A note that ends before its decay is over releases from wherever the
  // decay had got to (the old order of events let such a note swell back up to the sustain level after its
  // release and hold it until the oscillator stopped — an audible click on short bass/erhu notes).
  function env(g, t, a, peak, d, sus, r, end) {
    const p = g.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    end = Math.max(end, t + a);
    const s = Math.max(0.0001, peak * sus);
    if (end >= t + a + d) { p.exponentialRampToValueAtTime(s, t + a + d); p.setValueAtTime(s, end); }
    else if (end > t + a) p.exponentialRampToValueAtTime(Math.max(0.0001, peak * Math.pow(sus, (end - t - a) / d)), end);
    p.exponentialRampToValueAtTime(0.0001, end + r);
  }
  // per-pitch variation (vibrato rate etc.) without Math.random, so a loop renders the same every pass
  const vary = (midi, k) => ((midi * 7 + k * 3) % 11) / 10;
  // delayed vibrato on a detune param (cents, so every partial moves by the same ratio)
  function vibrato(t, dur, rate, cents, params, delay = 0.18) {
    const v = ac.createOscillator(); v.frequency.value = rate;
    const vg = ac.createGain();
    const on = t + Math.min(delay, dur * 0.35), full = t + Math.min(delay + 0.5, dur * 0.85);
    vg.gain.setValueAtTime(0, t); vg.gain.setValueAtTime(0, on); vg.gain.linearRampToValueAtTime(dur > 0.3 ? cents : cents * 0.25, full);
    v.connect(vg);
    for (const p of params) vg.connect(p);
    return v;
  }

  // ---- instruments --------------------------------------------------------
  const inst = {
    zheng(t, midi, dur, vol, out) {
      const src = ac.createBufferSource();
      src.buffer = ksBuffer(midi, 0.55, Math.min(3, dur + 1.6));
      // slight bend-in characteristic of guzheng
      src.playbackRate.setValueAtTime(0.985, t);
      src.playbackRate.linearRampToValueAtTime(1, t + 0.06);
      const g = ac.createGain(); g.gain.value = vol * 0.9;
      // nail-bright attack whose upper partials die away faster than the fundamental
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(6500, t);
      lp.frequency.setTargetAtTime(Math.min(5200, freq(midi) * 4 + 900), t + 0.02, 0.35);
      src.connect(lp); lp.connect(g); g.connect(out);
      src.start(t); src.stop(t + Math.min(3, dur + 1.6));
      return g;
    },
    pipa(t, midi, dur, vol, out) {
      const src = ac.createBufferSource();
      src.buffer = ksBuffer(midi, 0.85, Math.min(1.6, dur + 0.6));
      const g = ac.createGain(); g.gain.value = vol * 0.8;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(8000, t);
      lp.frequency.setTargetAtTime(Math.min(6000, freq(midi) * 5 + 1200), t + 0.01, 0.2);
      src.connect(lp); lp.connect(g); g.connect(out);
      src.start(t); src.stop(t + Math.min(1.6, dur + 0.6));
      return g;
    },
    // 笛子: sine body + octave triangle + a touch of 3rd harmonic (the 笛膜 buzz), a breathy chiff at the
    // onset that settles into a thin air stream, a small scoop up to pitch, and a delayed breath vibrato
    // (pitch + a little amplitude) that only blooms on held notes
    dizi(t, midi, dur, vol, out) {
      const f = freq(midi);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
      const o3 = ac.createOscillator(); o3.type = 'sine'; o3.frequency.value = f * 3;
      for (const x of [o, o2, o3]) { x.detune.setValueAtTime(-22, t); x.detune.linearRampToValueAtTime(0, t + 0.045); }
      const g = ac.createGain();
      const g2 = ac.createGain(); g2.gain.value = 0.12;
      const g3 = ac.createGain(); g3.gain.value = midi > 84 ? 0.02 : 0.05;
      o.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
      const vib = vibrato(t, dur, 5.0 + vary(midi, 1) * 0.6, 16, [o.detune, o2.detune, o3.detune]);
      const ag = ac.createGain();                  // breath pulse riding on the vibrato
      const pulse = dur > 0.4 ? vol * 0.5 * 0.05 : 0;
      ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(pulse, t + Math.min(0.7, dur * 0.7));
      ag.gain.linearRampToValueAtTime(0, t + dur);
      vib.connect(ag); ag.connect(g.gain);
      env(g, t, 0.06, vol * 0.5, 0.15, 0.8, 0.18, t + dur);
      g.connect(out);
      // breath: a chiff on the attack, then a faint air stream for the length of the note
      const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(5000, Math.max(1400, f * 2.2)); bp.Q.value = 1.1;
      const ng = ac.createGain();
      env(ng, t, 0.012, vol * 0.12, 0.09, 0.18, 0.15, t + dur);
      n.connect(bp); bp.connect(ng); ng.connect(out);
      const end = t + dur + 0.3;
      for (const x of [o, o2, o3, vib, n]) { x.start(t); x.stop(end); }
      return g;
    },
    // 二胡: bowed saw through a body filter. Slides (滑音) in from the previous note when the sequencer passes
    // x.from, otherwise scoops up a little; the bow bites (filter opens) on the attack with a breath of rosin
    // noise; vibrato starts after the note has settled.
    erhu(t, midi, dur, vol, out, x) {
      const f = freq(midi);
      const o = ac.createOscillator(); o.type = 'sawtooth';
      const from = x && x.from;
      if (from && from !== midi) {
        const st = Math.min(0.05 + 0.012 * Math.abs(from - midi), dur * 0.4);
        o.frequency.setValueAtTime(freq(from), t);
        o.frequency.exponentialRampToValueAtTime(f, t + st);
      } else {
        o.frequency.setValueAtTime(f * 0.97, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.08);
      }
      const vib = vibrato(t, dur, 5.4 + vary(midi, 2) * 0.5, 24, [o.detune], 0.15);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
      lp.frequency.setValueAtTime(f * 2.4, t); lp.frequency.exponentialRampToValueAtTime(f * 4, t + 0.12);
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1100; pk.gain.value = 6;
      const g = ac.createGain();
      o.connect(lp); lp.connect(pk); pk.connect(g);
      const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.9;
      const ng = ac.createGain();
      env(ng, t, 0.02, 0.14, 0.12, 0.2, 0.15, t + dur);
      n.connect(bp); bp.connect(ng); ng.connect(pk);
      env(g, t, 0.12, vol * 0.32, 0.2, 0.85, 0.25, t + dur);
      g.connect(out);
      const end = t + dur + 0.4;
      for (const s of [o, vib, n]) { s.start(t); s.stop(end); }
      return g;
    },
    // a hummed "oo" (白芷's voice in 渡魂謠): sine + saw through a soft vowel filter, sung portamento, late vibrato
    voice(t, midi, dur, vol, out, x) {
      const f = freq(midi);
      const o = ac.createOscillator(); o.type = 'sawtooth';
      const o2 = ac.createOscillator(); o2.type = 'sine';
      const from = x && x.from;
      for (const s of [o, o2]) {
        if (from && from !== midi) {
          s.frequency.setValueAtTime(freq(from), t);
          s.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.06 + 0.012 * Math.abs(from - midi), dur * 0.4));
        } else { s.frequency.value = f; s.detune.setValueAtTime(-30, t); s.detune.linearRampToValueAtTime(0, t + 0.09); }
      }
      const vib = vibrato(t, dur, 4.9 + vary(midi, 3) * 0.4, 18, [o.detune, o2.detune], 0.25);
      const gs = ac.createGain(); gs.gain.value = 0.45;
      const gn = ac.createGain(); gn.gain.value = 0.9;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(2200, Math.max(1000, f * 2.2)); lp.Q.value = 0.5;
      const f2 = ac.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 780; f2.Q.value = 1.4; f2.gain.value = 5;
      const f3 = ac.createBiquadFilter(); f3.type = 'peaking'; f3.frequency.value = 2900; f3.Q.value = 2.5; f3.gain.value = 4;
      const g = ac.createGain();
      o.connect(gs); o2.connect(gn); gs.connect(lp); gn.connect(lp); lp.connect(f2); f2.connect(f3); f3.connect(g);
      env(g, t, 0.16, vol * 0.3, 0.3, 0.85, 0.4, t + dur);
      g.connect(out);
      const end = t + dur + 0.5;
      for (const s of [o, o2, vib]) { s.start(t); s.stop(end); }
      return g;
    },
    pad(t, midi, dur, vol, out) {
      const g = ac.createGain();
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const f = freq(midi);
      const oscs = [-6, 0, 7].map((det) => {
        const o = ac.createOscillator(); o.type = 'triangle';
        o.frequency.value = f; o.detune.value = det;
        o.connect(lp); return o;
      });
      lp.connect(g);
      env(g, t, Math.min(1.2, dur * 0.4), vol * 0.22, 0.5, 0.8, 1.0, t + dur);
      g.connect(out);
      oscs.forEach((o) => { o.start(t); o.stop(t + dur + 1.2); });
      return g;
    },
    bass(t, midi, dur, vol, out) {
      const o = ac.createOscillator(); o.type = 'triangle';
      o.frequency.value = freq(midi);
      const g = ac.createGain();
      env(g, t, 0.01, vol * 0.5, 0.3, 0.5, 0.15, t + dur);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.3);
      return g;
    },
    bell(t, midi, dur, vol, out) {
      const f = freq(midi);
      const g = ac.createGain();
      [1, 2.76, 5.4, 8.93].forEach((r, i) => {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
        const og = ac.createGain();
        og.gain.setValueAtTime(vol * 0.25 / (i + 1), t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 / (i + 1));
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 2.6);
      });
      g.connect(out);
      return g;
    },
    // percussion (midi ignored)
    drum(t, midi, dur, vol, out) {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol * 0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.5);
      // skin noise
      const n = ac.createBufferSource(); n.buffer = noiseBuf;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const ng = ac.createGain(); ng.gain.setValueAtTime(vol * 0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(lp); lp.connect(ng); ng.connect(out);
      n.start(t); n.stop(t + 0.15);
    },
    wood(t, midi, dur, vol, out) {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(midi ? freq(midi) : 1250, t);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.1);
    },
    cymbal(t, midi, dur, vol, out) {
      const n = ac.createBufferSource(); n.buffer = noiseBuf;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.2, dur));
      n.connect(hp); hp.connect(g); g.connect(out);
      n.start(t); n.stop(t + Math.max(0.2, dur) + 0.05);
    },
    gong(t, midi, dur, vol, out) {
      const g = ac.createGain();
      [1, 1.47, 2.09, 2.56, 3.2].forEach((r, i) => {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 110 * r;
        o.frequency.setValueAtTime(110 * r * 1.02, t);
        o.frequency.linearRampToValueAtTime(110 * r, t + 0.6);
        const og = ac.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.linearRampToValueAtTime(vol * 0.2 / (1 + i * 0.5), t + 0.05);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + 3.6);
      });
      g.connect(out);
    },
  };

  // dryOut / wetOut: optional destination nodes (used by the music engine for per-song faders);
  // x: optional per-note extras from the sequencer ({ from: midi } = slide in from that pitch)
  function playNote(instName, t, midi, dur, vol, toReverb = 0.5, dryOut, wetOut, x) {
    if (!ac || !inst[instName]) return;
    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(dryOut || musicBus);
    if (toReverb > 0) {
      const s = ac.createGain(); s.gain.value = toReverb;
      out.connect(s); s.connect(wetOut || reverbSend);
    }
    inst[instName](t, midi, dur, vol, out, x);
  }

  // ---- sound effects -----------------------------------------------------------
  function sfxOut(rev = 0.2) {
    const out = ac.createGain();
    out.connect(sfxBus);
    if (rev) { const s = ac.createGain(); s.gain.value = rev; out.connect(s); s.connect(reverbSend); }
    return out;
  }
  function noise(t, dur, type, f0, f1, vol, out, q = 1) {
    const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(fl); fl.connect(g); g.connect(out);
    n.start(t); n.stop(t + dur + 0.05);
  }
  function tone(t, dur, type, f0, f1, vol, out, attack = 0.005) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  const SFX = {
    cursor(t, o) { tone(t, 0.05, 'sine', 1800, 1800, 0.08, o); },
    ok(t, o) { tone(t, 0.08, 'sine', 1200, 1200, 0.12, o); tone(t + 0.05, 0.12, 'sine', 1800, 1800, 0.1, o); },
    cancel(t, o) { tone(t, 0.1, 'sine', 900, 600, 0.12, o); },
    buzz(t, o) { tone(t, 0.15, 'square', 140, 120, 0.06, o); },
    text(t, o) { tone(t, 0.03, 'sine', 2400 + Math.random() * 300, 2400, 0.025, o); },
    step(t, o) { noise(t, 0.05, 'lowpass', 500, 300, 0.05, o); },
    // wooden clack (擲筊 blocks hitting the floor)
    wood(t, o) { noise(t, 0.06, 'bandpass', 1400, 900, 0.22, o); tone(t, 0.08, 'triangle', 420, 300, 0.12, o); tone(t + 0.11, 0.06, 'triangle', 380, 280, 0.08, o); },
    door(t, o) { noise(t, 0.3, 'lowpass', 800, 200, 0.25, o); tone(t, 0.25, 'triangle', 90, 60, 0.15, o); },
    chest(t, o) {
      [0, 4, 7, 12].forEach((s, i) => { const m = 72 + s; o && tone(t + i * 0.07, 0.4, 'triangle', freq(m), freq(m), 0.1, o); });
    },
    item(t, o) {
      [79, 84, 88, 91].forEach((m, i) => tone(t + i * 0.06, 0.5, 'sine', freq(m), freq(m), 0.1, o));
    },
    lantern(t, o) {
      [76, 81, 83, 88, 93].forEach((m, i) => { tone(t + i * 0.11, 1.2, 'sine', freq(m), freq(m), 0.09, o, 0.02); });
    },
    save(t, o) { [72, 79, 84].forEach((m, i) => tone(t + i * 0.1, 0.6, 'sine', freq(m), freq(m), 0.1, o)); },
    heal(t, o) {
      for (let i = 0; i < 6; i++) tone(t + i * 0.06, 0.5, 'sine', freq(72 + [0, 4, 7, 12, 16, 19][i]), freq(72 + [0, 4, 7, 12, 16, 19][i]), 0.07, o);
    },
    levelup(t, o) {
      [67, 72, 76, 79, 84].forEach((m, i) => tone(t + i * 0.09, 0.6, 'triangle', freq(m), freq(m), 0.12, o));
    },
    slash(t, o) { noise(t, 0.18, 'bandpass', 4000, 1200, 0.5, o, 1.2); tone(t, 0.12, 'sawtooth', 600, 200, 0.04, o); },
    slash2(t, o) { noise(t, 0.12, 'bandpass', 6000, 2000, 0.45, o, 1.5); noise(t + 0.08, 0.15, 'bandpass', 5000, 1500, 0.4, o, 1.5); },
    stab(t, o) { noise(t, 0.1, 'highpass', 2000, 5000, 0.35, o); tone(t, 0.1, 'square', 300, 150, 0.05, o); },
    hit(t, o) { noise(t, 0.16, 'lowpass', 2500, 300, 0.6, o); tone(t, 0.12, 'sine', 180, 60, 0.4, o); },
    crit(t, o) { noise(t, 0.3, 'lowpass', 5000, 200, 0.8, o); tone(t, 0.25, 'sine', 220, 40, 0.6, o); tone(t, 0.1, 'square', 1500, 800, 0.05, o); },
    guard(t, o) { tone(t, 0.2, 'triangle', 900, 880, 0.15, o); tone(t, 0.3, 'sine', 1350, 1340, 0.08, o); },
    miss(t, o) { noise(t, 0.2, 'bandpass', 1500, 3000, 0.15, o, 3); },
    fire(t, o) { noise(t, 0.7, 'lowpass', 800, 3000, 0.45, o); noise(t + 0.1, 0.6, 'bandpass', 400, 200, 0.4, o); },
    water(t, o) { for (let i = 0; i < 5; i++) tone(t + i * 0.05, 0.15, 'sine', 600 + Math.random() * 600, 300, 0.12, o); noise(t, 0.5, 'bandpass', 900, 400, 0.2, o, 2); },
    thunder(t, o) { noise(t, 0.08, 'highpass', 3000, 3000, 0.6, o); noise(t + 0.05, 1.2, 'lowpass', 1500, 80, 0.8, o); },
    wind(t, o) { noise(t, 0.6, 'bandpass', 600, 2400, 0.3, o, 4); },
    earth(t, o) { noise(t, 0.6, 'lowpass', 300, 60, 0.9, o); tone(t, 0.5, 'sine', 70, 30, 0.6, o); },
    metal(t, o) { [1, 2.4, 3.9].forEach((r) => tone(t, 0.6, 'sine', 900 * r, 900 * r, 0.1, o)); noise(t, 0.1, 'highpass', 4000, 6000, 0.3, o); },
    magic(t, o) { for (let i = 0; i < 8; i++) tone(t + i * 0.035, 0.4, 'sine', 900 + i * 180, 1400 + i * 200, 0.05, o); },
    dark(t, o) { tone(t, 0.9, 'sawtooth', 110, 55, 0.12, o, 0.1); noise(t, 0.9, 'lowpass', 400, 100, 0.3, o); },
    buff(t, o) { [72, 76, 79].forEach((m, i) => tone(t + i * 0.05, 0.5, 'triangle', freq(m), freq(m + 12), 0.07, o)); },
    debuff(t, o) { [79, 75, 72].forEach((m, i) => tone(t + i * 0.07, 0.4, 'triangle', freq(m), freq(m - 5), 0.07, o)); },
    poison(t, o) { for (let i = 0; i < 4; i++) tone(t + i * 0.07, 0.15, 'sine', 300 - i * 30, 200, 0.1, o); },
    death(t, o) { tone(t, 0.8, 'sawtooth', 300, 40, 0.12, o); noise(t, 0.8, 'lowpass', 1200, 100, 0.3, o); },
    flee(t, o) { noise(t, 0.4, 'bandpass', 800, 3000, 0.25, o, 2); },
    encounter(t, o) {
      noise(t, 0.6, 'bandpass', 300, 4000, 0.35, o, 2);
      tone(t, 0.6, 'sawtooth', 220, 880, 0.06, o);
      tone(t + 0.15, 0.5, 'square', 440, 1760, 0.03, o);
    },
    ultimate(t, o) {
      tone(t, 1.2, 'sawtooth', 110, 880, 0.08, o, 0.3);
      noise(t, 1.2, 'bandpass', 200, 6000, 0.3, o, 1);
      SFX.metal(t + 0.9, o);
    },
    sing(t, o) { [81, 84, 86, 88, 86, 84].forEach((m, i) => tone(t + i * 0.18, 0.5, 'sine', freq(m), freq(m), 0.08, o, 0.05)); },
    splash(t, o) { noise(t, 0.5, 'lowpass', 3000, 300, 0.5, o); },
    ghost(t, o) { tone(t, 1.4, 'sine', 520, 380, 0.06, o, 0.4); tone(t, 1.4, 'sine', 527, 386, 0.06, o, 0.4); },
    gong(t, o) { inst.gong(t, 0, 3, 0.8, o); },
    bell(t, o) { inst.bell(t, 84, 2, 0.6, o); },
    coin(t, o) { tone(t, 0.08, 'square', 1975, 1975, 0.04, o); tone(t + 0.07, 0.3, 'square', 2637, 2637, 0.04, o); },
    switch(t, o) { tone(t, 0.08, 'square', 300, 300, 0.08, o); noise(t, 0.1, 'lowpass', 2000, 500, 0.2, o); },
    push(t, o) { noise(t, 0.35, 'lowpass', 400, 150, 0.4, o); },
    shatter(t, o) { for (let i = 0; i < 10; i++) tone(t + Math.random() * 0.3, 0.3, 'sine', 2000 + Math.random() * 3000, 1500, 0.04, o); noise(t, 0.5, 'highpass', 3000, 6000, 0.3, o); },
  };

  return {
    unlock,
    get ctx() { return ac; },
    get now() { return ac ? ac.currentTime : 0; },
    settings,
    setMusicVol(v) { settings.music = v; if (musicBus) musicBus.gain.setTargetAtTime(v, ac.currentTime, 0.05); },
    setSfxVol(v) { settings.sfx = v; if (sfxBus) sfxBus.gain.setTargetAtTime(v, ac.currentTime, 0.05); },
    musicBus: () => musicBus,
    reverbInput: () => reverbSend,
    playNote,
    noteToMidi,
    sfx(name, delay = 0) {
      if (!ac || ac.state !== 'running' || !SFX[name]) return;
      const rev = /magic|heal|lantern|sing|bell|gong|ghost|levelup/.test(name) ? 0.5 : 0.15;
      SFX[name](ac.currentTime + 0.005 + delay, sfxOut(rev));
    },
  };
})();
