// 彼岸燈 — music: a small lookahead sequencer + the full original soundtrack, played on G.Audio's synth.
//
//   G.Music.play(id, { fade = 1.0, loop = true })  crossfade to song (no-op if `id` is already playing)
//   G.Music.stop(fade = 1.0)
//   G.Music.current                                 id or null
//   G.Music.ids()                                   all song ids
//
// If play() is called before the AudioContext exists / is running (no user gesture yet), the request is
// remembered and starts as soon as the context runs. Songs whose definition says loop:false (victory,
// gameover) are one-shot cues unless the caller passes loop explicitly; when such a cue ends, current = null.
//
// ---- notation --------------------------------------------------------------------------------------
// Time unit = one 16th note ("step"). Song: { bpm (quarter notes), bar (steps per bar, 16 = 4/4,
// 12 = 3/4 or 6/8), bars, swing? (lilt: delays 8th off-beats by this fraction of a 16th), gain?, loop?, tracks:[{ i: instrument, v: volume, r: reverb send,
// tr?: semitones, leg?: legato factor, n: notation }] }. Every track must total bars*bar steps.
// Notation tokens (whitespace separated, '|' bar lines are ignored):
//   e5:2      note e5 lasting 2 steps (length is sticky: "e5:2 d5 c5" = three 2-step notes)
//   c4+e4+g4:16  chord      -:4  rest      x  unpitched hit (percussion)      a5:0.5 grace-length ok
//   suffix !  accent (×1.35)   suffix ?  ghost note (×0.55)        [ ... ]*3  repeat group (nestable)
// Helpers below build accompaniment from chord lists (ch), drum grids (grid), repeats (rep).
'use strict';
G.Music = (() => {
  // ---------------------------------------------------------------------------------- parsing
  const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  function pitch(n) {
    const m = /^([a-g])([#b]?)(-?\d)$/.exec(n);
    if (!m) return null;
    return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  }
  const midiName = (v) => NAMES[((v % 12) + 12) % 12] + (Math.floor(v / 12) - 1);

  function expand(str) {
    let s = str, m, guard = 0;
    const re = /\[([^[\]]*)\]\*(\d+)/;
    while ((m = re.exec(s))) {
      s = s.slice(0, m.index) + ' ' + Array(+m[2]).fill(m[1]).join(' ') + ' ' + s.slice(m.index + m[0].length);
      if (++guard > 5000) throw new Error('repeat expansion runaway');
    }
    if (/[[\]]/.test(s)) throw new Error('unbalanced [ ] in notation');
    return s;
  }

  // -> { ev: [{ s (start step), l (length), m: [midi...], a (accent mult) }], len }
  function parse(str) {
    const toks = expand(str).replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
    const ev = [];
    let pos = 0, len = 1;
    for (const tk of toks) {
      const m = /^([^:!?]+)(?::(\d+(?:\.\d+)?))?([!?]?)$/.exec(tk);
      if (!m) throw new Error('bad token "' + tk + '"');
      if (m[2]) len = +m[2];
      if (!(len > 0)) throw new Error('bad length in "' + tk + '"');
      const p = m[1];
      if (p !== '-') {
        const midis = p === 'x' ? [0] : p.split('+').map((q) => {
          const v = pitch(q);
          if (v == null) throw new Error('bad pitch "' + q + '" in token "' + tk + '"');
          return v;
        });
        ev.push({ s: pos, l: len, m: midis, a: m[3] === '!' ? 1.35 : m[3] === '?' ? 0.55 : 1 });
      }
      pos += len;
    }
    return { ev, len: pos };
  }

  // ---------------------------------------------------------------------------------- composing helpers
  const rep = (s, n) => Array(n).fill(s).join(' | ');
  const cat = (...a) => a.join(' | ');
  // transpose every pitch in a notation string
  const tr = (s, k) => s.replace(/\b([a-g][#b]?-?\d)\b/g, (p) => midiName(pitch(p) + k));
  // drum grid: one char per step. x hit, X accent, o ghost, . rest  ('|' and spaces ignored)
  function grid(s, note = 'x') {
    const c = s.replace(/[\s|]/g, '');
    const out = [];
    let i = 0;
    while (i < c.length) {
      let j = i + 1;
      while (j < c.length && c[j] === '.') j++;
      const ch0 = c[i];
      if (ch0 === '.') out.push('-:' + (j - i));
      else out.push(note + ':' + (j - i) + (ch0 === 'X' ? '!' : ch0 === 'o' ? '?' : ''));
      i = j;
    }
    return out.join(' ');
  }
  // chord-driven pattern. chords: "a2.e3.a3 g2.d3.g3*2 ..." (one bar each, *n = n bars).
  // pat: tokens "IDX:len" where IDX = chord-tone index (indices past the end wrap up an octave),
  // "0+2" = several tones, "*" = whole chord, "-" = rest. Modifiers ! ? pass through.
  function ch(chords, pat) {
    const ptoks = pat.trim().split(/\s+/);
    const bars = [];
    for (const c of chords.trim().split(/\s+/)) {
      const [notes, times] = c.split('*');
      const ns = notes.split('.');
      const L = ns.length;
      const tone = (i) => (i < L ? ns[i] : midiName(pitch(ns[i % L]) + 12 * Math.floor(i / L)));
      const bar = ptoks.map((tk) => {
        const m = /^([^:!?]+)(.*)$/.exec(tk);
        const k = m[1], rest = m[2];
        if (k === '-') return '-' + rest;
        if (k === '*') return ns.join('+') + rest;
        return k.split('+').map((i) => tone(+i)).join('+') + rest;
      }).join(' ');
      for (let r = 0; r < (+times || 1); r++) bars.push(bar);
    }
    return bars.join(' | ');
  }

  // ---------------------------------------------------------------------------------- the songs
  const SONGS = {};
  const T = (i, v, r, n, o) => Object.assign({ i, v, r, n }, o || {});
  // Chord voicings in the A-minor / C-major family; other keys use tr(). Names are space-separated
  // progressions, one chord per bar ("Am*2" = two bars).
  const VZ = {   // 5-note spread for zheng / pipa arpeggios
    Am: 'a2.e3.a3.c4.e4', Am9: 'a2.e3.b3.c4.e4', C: 'c3.g3.c4.d4.e4', Dm: 'd2.a2.d3.f3.a3', D: 'd2.a2.d3.f#3.a3',
    Em: 'e2.b2.e3.g3.b3', E: 'e2.b2.e3.g#3.b3', Esus: 'e2.b2.e3.a3.b3', F: 'f2.c3.a3.c4.e4', G: 'g2.d3.g3.a3.d4',
    G7: 'g2.d3.f3.b3.d4', Bb: 'bb2.f3.bb3.d4.f4', Dsus: 'd2.a2.d3.e3.a3', Gm: 'g2.d3.g3.bb3.d4', Bm: 'b2.f#3.b3.d4.f#4',
    Fm: 'f2.c3.ab3.c4.f4', Asus: 'a2.e3.a3.d4.e4',
  };
  const VP = {   // close triads around a3-e4 for pads
    Am: 'a3.c4.e4', Am9: 'b3.c4.e4', C: 'g3.c4.e4', Dm: 'a3.d4.f4', D: 'a3.d4.f#4', Em: 'g3.b3.e4', E: 'g#3.b3.e4',
    Esus: 'a3.b3.e4', F: 'a3.c4.f4', G: 'g3.b3.d4', G7: 'g3.b3.f4', Bb: 'bb3.d4.f4', Dsus: 'a3.d4.e4', Gm: 'g3.bb3.d4', Bm: 'f#3.b3.d4',
    Fm: 'ab3.c4.f4', Asus: 'a3.d4.e4',
  };
  const VB = {   // bass: root, fifth, octave
    Am: 'a2.e3.a3', Am9: 'a2.e3.a3', C: 'c3.g3.c4', Dm: 'd2.a2.d3', D: 'd2.a2.d3', Em: 'e2.b2.e3', E: 'e2.b2.e3',
    Esus: 'e2.b2.e3', F: 'f2.c3.f3', G: 'g2.d3.g3', G7: 'g2.d3.g3', Bb: 'bb2.f3.bb3', Dsus: 'd2.a2.d3', Gm: 'g2.d3.g3', Bm: 'b2.f#3.b3',
    Fm: 'f2.c3.f3', Asus: 'a2.e3.a3',
  };
  const voice = (tbl) => (prog, k = 0) => {
    const s = prog.trim().split(/\s+/).map((c) => {
      const [n, x] = c.split('*');
      if (!tbl[n]) throw new Error('unknown chord ' + n);
      return tbl[n] + (x ? '*' + x : '');
    }).join(' ');
    return k ? tr(s, k) : s;
  };
  const vz = voice(VZ), vp = voice(VP), vb = voice(VB);

  // ===== the 燈 motif (leitmotif of the whole score, docs/MUSIC.md) — A 羽 mode (a c d e g, 1 = C):
  //   6̣ 3 6 — | 5·3 2 3 —    a lantern lifted in two open leaps (fifth, fourth), then set drifting on the water.
  // Its 宮 form 1 5 1̇ — | 6·5 3 5 — is the same shape a pentatonic step higher: the hopeful / 千燈 face.
  const MOTIF = 'a4:4 e5:4 a5:8 | g5:3 e5:1 d5:4 e5:8';
  // ===== 「渡魂謠」 — 白芷's song, one verse = 4 lines × 2 bars, set to the lyric (起承轉合):
  //   燈一盞，渡一人，| 黑水茫茫莫回身；| 前塵如霧隨潮去，| 彼岸花開又一春。
  // Harmony: Am Em F Am F G Am Dm (the plagal Dm → Am across the loop / into the next verse)
  const DUHUN = MOTIF + ' | c5:4 d5:2 c5:2 a4:4 g4:4 | a4:4 c5:2 d5:2 e5:8 |' +
    ' a5:6 c6:2 a5:4 g5:4 | e5:4 g5:2 e5:2 d5:8 | a4:4 e5:4 a5:4 g5:2 e5:2 | d5:3 e5:1 c5:2 d5:2 a4:8';
  const DUHUN_PROG = 'Am Em F Am F G Am Dm';
  // shared harmony line under 「渡魂謠」 (erhu)
  const DUHUN_COUNTER = 'c5:8 e5:8 | b4:8 g4:8 | a4:8 f4:8 | e4:8 a4:8 | c5:16 | b4:8 g4:8 | c5:8 e5:8 | f4:8 e4:8';
  // the same song turned to its 宮 form (every note one pentatonic degree up: 6̣→1, 1→2, 2→3, 3→5, 5→6) —
  // the love / hope / 千燈之段 face, C major. Harmony: C Am Dm F Am Em F C
  const LOVEM = 'c5:4 g5:4 c6:8 | a5:3 g5:1 e5:4 g5:8 | d5:4 e5:2 d5:2 c5:4 a4:4 | c5:4 d5:2 e5:2 g5:8 |' +
    ' c6:6 d6:2 c6:4 a5:4 | g5:4 a5:2 g5:2 e5:8 | c5:4 g5:4 c6:4 a5:2 g5:2 | e5:3 g5:1 d5:2 e5:2 c5:8';
  const LOVE_PROG = 'C Am Dm F Am Em F C';
  const LOVE_COUNTER = 'e4:8 g4:8 | c5:8 a4:8 | f4:8 a4:8 | a4:8 c5:8 | e5:8 c5:8 | b4:8 g4:8 | a4:8 c5:8 | g4:8 e4:8';
  // chords for the lone-flute 渡魂謠 in the prologue / ch1 (one triad per bar; the last is an open A-sus so the
  // unaccompanied verse ends at rest)
  const DUHUN_CH = [['a3', 'c4', 'e4'], ['g3', 'b3', 'e4'], ['f3', 'a3', 'c4'], ['a3', 'c4', 'e4'],
    ['f3', 'a3', 'c4'], ['g3', 'b3', 'd4'], ['a3', 'c4', 'e4'], ['a3', 'd4', 'e4']];
  // 「彼岸燈」 main-title melody: the motif climbs in sequence (6̣ 3 6 → 1 5 1̇ → 2 6 2̇), lanterns rising one
  // after another, crests on 3̇ and settles back onto the motif's tail. Harmony: F G Am C Dm F Am Em
  const TITLE_A = MOTIF + ' | c5:4 g5:4 c6:8 | a5:3 g5:1 e5:4 g5:8 |' +
    ' d5:4 a5:4 e6:0.5 d6:7.5 | c6:3 a5:1 g5:4 a5:8 | e6:6 d6:2 c6:4 a5:4 | g5:3 a5:1 g5:2 e5:2 d5:2 e5:6';
  const TITLE_PROG = 'F G Am C Dm F Am Em';
  // 九份 town tune (G 徵 / major pentatonic) shared by jiufen and credits. Harmony: G Em C D C Em Am G
  const JIUFEN_A = 'd5:2 e5:2 g5:4 e5:2 d5:2 b4:4 | d5:2 e5:2 d5:2 b4:2 a4:8 | g4:2 a4:2 b4:4 d5:2 e5:2 g5:2 e5:2 | d5:12 -:4 |' +
    ' e5:2 g5:2 a5:4 g5:2 e5:2 d5:4 | e5:2 d5:2 b4:2 a4:2 b4:8 | a4:2 b4:2 d5:4 b4:2 a4:2 e4:4 | g4:12 -:4';
  const JIUFEN_PROG = 'C Am F G F Am Dm C'; // written in C-family, transposed +7 to G

  // 「彼岸燈」 main title: lanterns on the night sea — wistful, then hopeful. A 羽 ↔ C 宮.
  //   intro (4)  bells ring the motif over the sea pad, the zheng rises
  //   A (8)      dizi alone: the title melody (the motif climbing in sequence)
  //   B (8)      the hopeful turn to C 宮: dizi high over an erhu counter-line, a soft pulse
  //   A' (8)     the title melody again with the erhu beneath and bells doubling each rising lantern;
  //              cadences like 渡魂謠 (2·3 1 2 6̣) and falls back into the intro
  SONGS.title = (() => {
    const intro = 'Am9 F G Esus', progB = 'F G Em Am Dm G C G';
    const progA2 = TITLE_PROG.replace(/Em$/, 'Dm');
    const prog = intro + ' ' + TITLE_PROG + ' ' + progB + ' ' + progA2;
    const B = 'c6:8 a5:4 g5:4 | d6:8 c6:2 a5:2 g5:4 | e5:6 g5:2 a5:4 g5:4 | e5:8 c5:4 d5:4 |' +
      ' d5:4 e5:4 a5:4 c6:4 | d6:6 e6:2 d6:4 c6:2 a5:2 | e6:12 d6:2 c6:2 | a5:4 g5:4 e5:4 d5:4';
    const A2 = TITLE_A.replace(/g5:3 a5:1 g5:2 e5:2 d5:2 e5:6$/, 'd5:3 e5:1 c5:2 d5:2 a4:8');
    const erhuB = 'a4:8 c5:8 | b4:8 d5:8 | g4:8 b4:8 | c5:8 a4:8 | f4:8 a4:8 | b4:8 g4:8 | g4:8 c5:4 e5:4 | d5:8 b4:8';
    const erhuA2 = 'c5:8 a4:8 | b4:8 d5:8 | e4:8 a4:8 | g4:8 e4:8 | f4:8 a4:8 | a4:8 c5:8 | c5:8 e5:8 | f4:8 e4:8';
    return {
      bpm: 72, bars: 28, tracks: [
        T('dizi', 0.5, 0.55, cat('-:64', TITLE_A, B, A2)),
        T('erhu', 0.4, 0.45, cat('-:192', erhuB, erhuA2)),
        T('zheng', 0.36, 0.55, cat(ch(vz(intro), '0:4 2:4 4:4 7:4'), ch(vz(TITLE_PROG), '0:4 2:2 3:2 4:4 3:2 2:2'),
          ch(vz(progB + ' ' + progA2), '0:2 1 2 3 4 3 2 1'))),
        T('pad', 0.3, 0.65, ch(vp(prog), '*:16')),
        T('bass', 0.42, 0.25, cat(ch(vb(intro), '0:16'), ch(vb(TITLE_PROG), '0:12 1:4'), ch(vb(progB + ' ' + progA2), '0:8 1:4 2:4'))),
        T('bell', 0.24, 0.8, cat('a5:4 e6:4 a6:8 | g6:3 e6:1 d6:4 e6:8 | -:16 | -:8 b5:8',
          '-:16 | -:8 e6:8 | -:32 | -:16 | -:8 a6:8 | -:32', '-:96 | e6:16 | -:16',
          'a5:4 e6:4 a6:8 | -:16 | c6:4 g6:4 c7:8 | -:16 | d6:4 a6:4 d7:8 | -:16 | -:32')),
        T('drum', 0.22, 0.35, cat('-:192', rep(grid('x.......x.......'), 7), grid('x.......x...x.x.'), rep(grid('x...............'), 8))),
        T('cymbal', 0.07, 0.8, cat('-:48 -:8 x:8', '-:128', 'x:16 -:112', 'x:16 -:112')),
        T('gong', 0.1, 0.8, 'x:448'),
      ],
    };
  })();

  SONGS.dream = (() => {
    const prog = 'Am9*2 F*2 C*2 G*2 Am9*2 F*2 Dm*2 Esus*2';
    // the lantern-bridge dream: bells ring the 燈 motif, then the flute half-remembers it
    const bells = 'a5:4 e6:4 a6:8 | -:16 | g6:3 e6:1 d6:4 e6:8 | -:16 | e6:4 g6:4 e6:8 | -:16 | d6:8 a5:8 | -:16 | -:128';
    const dizi = '-:128 | ' + MOTIF + ' | c6:6 a5:2 g5:4 e5:4 | g5:16 | f5:4 e5:2 d5:2 a4:8 | -:16 | b4:8 a4:8 | -:16';
    return {
      bpm: 60, bars: 16, tracks: [
        T('pad', 0.4, 0.8, ch(vp(prog), '*:16')),
        T('pad', 0.25, 0.8, ch(vb(prog), '0:16')),
        T('zheng', 0.22, 0.8, ch(vz(prog), '2:3 3 4:2 3:3 2 1:2')),
        T('bell', 0.35, 0.9, bells),
        T('dizi', 0.4, 0.9, dizi),
        T('gong', 0.12, 0.8, rep('x:128', 2)),
      ],
    };
  })();

  // 白芷's theme (id `love`, her theme is also the love theme): a dreamy 3/4 on the jade 笛子, D 宮.
  //   A (8)    the motif in its 宮 form opens her melody (1 5 1̇ — 6·5 3 5), harp-like zheng ripples
  //   A' (8)   higher, closes on 1
  //   B (8)    the far shore: the motif turned upside down (3̇ 6 3 — its reflection on the water), a hummed
  //            inner voice sinking c → b → a → a♭ → g over Am F C G F Fm C G (the minor iv is the otherworldly turn)
  //   A'' (8)  A' as a duet: the erhu follows the flute a bar behind, an octave down
  SONGS.love = (() => {
    const pA = 'C Am F G C Em F G', pA2 = 'C Am F Am Dm G C C', pB = 'Am F C G F Fm C G';
    const prog = pA + ' ' + pA2 + ' ' + pB + ' ' + pA2;
    const A = 'c5:4 g5:4 c6:4 | a5:3 g5:1 e5:2 g5:6 | a5:6 c6:2 a5:4 | g5:8 e5:2 d5:2 |' +
      ' e5:4 g5:4 a5:4 | g5:6 e5:2 d5:4 | c5:4 d5:2 e5:2 g5:4 | d5:12';
    const A2 = 'c5:4 g5:4 c6:4 | a5:3 g5:1 e5:2 g5:6 | d6:0.5 c6:5.5 d6:2 c6:4 | a5:4 g5:4 e5:4 |' +
      ' d5:4 e5:4 a5:4 | g5:6 a5:2 g5:2 e5:2 | c5:12 | -:12';
    const B = 'e6:4 a5:4 e5:4 | g5:3 a5:1 c6:2 a5:6 | d6:4 g5:4 d5:4 | e5:3 g5:1 a5:2 g5:6 |' +
      ' a5:8 c6:2 d6:2 | c6:6 ab5:2 g5:4 | e5:6 d5:2 c5:2 d5:2 | g5:12';
    const echo = '-:12 | ' + A2.split('|').slice(0, 7).join('|');
    return {
      bpm: 66, bar: 12, bars: 32, tracks: [
        T('dizi', 0.5, 0.7, cat(A, A2, B, A2), { tr: 2 }),
        T('erhu', 0.34, 0.55, cat('-:288', echo), { tr: -10 }),
        T('voice', 0.34, 0.75, cat('-:192', 'c5:12 | c5:12 | c5:12 | b4:12 | a4:12 | ab4:12 | g4:12 | b4:12', '-:96'), { tr: 2 }),
        T('zheng', 0.3, 0.7, cat(ch(vz(pA + ' ' + pA2, 2), '0:2 2 4 7 4 2'), ch(vz(pB, 2), '0:4 4:4 7:4'), ch(vz(pA2, 2), '0:2 2 4 7 4 2'))),
        T('pad', 0.28, 0.75, ch(vp(prog, 2), '*:12')),
        T('bass', 0.3, 0.35, ch(vb(prog, 2), '0:12')),
        T('bell', 0.2, 0.9, cat('-:84 | -:6 e6:6', '-:84 | c6:4 g6:4 c7:4', '-:96', '-:84 | c6:4 g6:4 c7:4'), { tr: 2 }),
        T('cymbal', 0.05, 0.9, cat('-:192', 'x:24 -:72', '-:96')),
      ],
    };
  })();

  SONGS.sad = (() => {
    const prog = DUHUN_PROG + ' ' + DUHUN_PROG;
    const counter = 'f4:8 a4:8 | e4:8 a4:8 | d4:8 f4:8 | a4:8 f4:8 | d4:8 f4:8 | e4:8 g4:8 | f4:8 a4:8 | bb4:8 a4:8';
    return {
      bpm: 54, bars: 16, tracks: [
        T('erhu', 0.6, 0.5, cat(tr(DUHUN, -7), counter)),
        T('dizi', 0.38, 0.65, cat('-:128', tr(DUHUN, 5))),
        T('zheng', 0.32, 0.6, ch(vz(prog, 5), '0:4 1:4 3:8')),
        T('pad', 0.32, 0.7, ch(vp(prog, -7), '*:16')),
        T('bass', 0.35, 0.3, ch(vb(prog, -7), '0:16')),
      ],
    };
  })();

  // 「千燈」 true-ending theme — the payoff of the title (fades in under 11-15's 心燈 and plays through the epilogue):
  //   P (8)  prelude: 渡魂謠 on lone zheng notes over its bass roots (the fog / heart-lantern scene)
  //   T (8)  the title melody on dizi, bells doubling every rising lantern, erhu joins halfway
  //   Q (8)  千燈之段: 渡魂謠 in its 宮 form, lifted to D — dizi and erhu in octaves, gong, a heartbeat drum, bell cascades
  //   C (4)  coda: the motif in 宮 (1 5 1̇ — 6·5 3 5 — 6·1̇ 2̇ — 1̇), a plagal F → C (G → D) "amen", back to the prelude
  SONGS.ending = (() => {
    const pT = TITLE_PROG, pQ = LOVE_PROG, pC = 'C Am F C';
    const coda = 'c5:4 g5:4 c6:8 | a5:3 g5:1 e5:4 g5:8 | a5:6 c6:2 d6:8 | c6:16';
    const erhuT = '-:64 | f4:8 a4:8 | a4:8 c5:8 | c5:8 e5:8 | b4:8 g4:8';
    const erhuC = 'e4:8 g4:8 | e4:8 c5:8 | c5:8 a4:8 | g4:16';
    const bellsT = 'a5:4 e6:4 a6:8 | -:16 | c6:4 g6:4 c7:8 | -:16 | d6:4 a6:4 d7:8 | -:16 | -:32';
    const cascade = 'g6:2 e6 c6 g5 e5 g5 c6 e6 | -:16 | -:16 | a6:2 f6 c6 a5 f5 a5 c6 f6 | e6:2 c6 a5 e5 c5 e5 a5 c6 | -:16 | -:16 | c6:2 e6 g6 c7 -:8';
    const bellsC = 'c6:4 g6:4 c7:8 | -:16 | a5:4 c6:4 f6:8 | c6:4 g6:4 c7:8';
    return {
      bpm: 76, bars: 28, tracks: [
        T('zheng', 0.46, 0.6, cat(DUHUN, '-:320')),
        T('zheng', 0.3, 0.55, cat(ch(vz(DUHUN_PROG), '0:16'), ch(vz(pT), '0:4 2:2 3:2 4:4 3:2 2:2'),
          ch(vz(pQ, 2), '0:1 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1'), ch(vz(pC, 2), '0:2 1 2 3 4 3 2 1'))),
        T('pad', 0.28, 0.65, cat('-:64', ch(vp('F G Am Dm'), '*:16'), ch(vp(pT), '*:16'), ch(vp(pQ + ' ' + pC, 2), '*:16'))),
        T('bass', 0.42, 0.25, cat('-:128', ch(vb(pT), '0:12 1:4'), ch(vb(pQ + ' ' + pC, 2), '0:8 1:4 2:4'))),
        T('dizi', 0.5, 0.55, cat('-:128', TITLE_A, tr(LOVEM, 2), tr(coda, 2))),
        T('erhu', 0.42, 0.45, cat('-:128', erhuT, tr(LOVEM, -10), tr(erhuC, 2))),
        T('bell', 0.22, 0.85, cat('-:128', bellsT, tr(cascade, 2), tr(bellsC, 2))),
        T('drum', 0.3, 0.3, cat('-:256', rep(grid('X.......x.....x.'), 7), grid('X.......x.x.x.x.'), grid('X...............'), '-:48')),
        T('cymbal', 0.16, 0.6, cat('-:256', 'x:16 -:112', 'x:16 -:48')),
        T('gong', 0.2, 0.7, cat('-:256', 'x:128', 'x:64')),
      ],
    };
  })();

  // 「渡魂謠」 as a song (id `duhun`) — for the scenes where 白芷 sings or plays it. It starts on the first word,
  // so even a short scene hears 「燈一盞，渡一人」.
  //   verse 1 (8): voice and jade flute in octaves over zheng and pad · verse 2 (8): the flute leads, erhu
  //   counter-line, zheng ripples, the voice holding long notes · interlude (2): bells ring the motif, Esus → verse 1
  SONGS.duhun = (() => {
    const prog = DUHUN_PROG + ' ' + DUHUN_PROG + ' F Esus';
    const hum = 'e4:16 | e4:16 | f4:16 | e4:16 | f4:16 | d4:16 | e4:16 | d4:16';
    return {
      bpm: 60, bars: 18, tracks: [
        T('voice', 0.42, 0.7, cat(tr(DUHUN, -12), hum, '-:32')),
        T('dizi', 0.34, 0.8, cat(DUHUN, '-:160')),
        T('dizi', 0.46, 0.65, cat('-:128', DUHUN, '-:32')),
        T('erhu', 0.34, 0.55, cat('-:128', DUHUN_COUNTER, '-:32')),
        T('zheng', 0.3, 0.7, cat(ch(vz(DUHUN_PROG), '0:4 2:4 4:8'), ch(vz(DUHUN_PROG), '0:2 1 2 3 4 3 2 1'), ch(vz('F Esus'), '0:4 2:4 4:8'))),
        T('pad', 0.24, 0.75, ch(vp(prog), '*:16')),
        T('bass', 0.3, 0.35, cat('-:128', ch(vb(DUHUN_PROG), '0:16'), '-:32')),
        T('bell', 0.2, 0.9, cat('-:128', '-:16 | -:8 e6:8 | -:64 | -:16 | -:8 a6:8', tr(MOTIF, 12))),
      ],
    };
  })();

  SONGS.credits = (() => {
    const lp = 'F G Am C ' + LOVE_PROG + ' ' + JIUFEN_PROG + ' ' + LOVE_PROG + ' F G C C';
    const zc = vz(lp, -5).split(' ');
    zc.splice(12, 8, ...vz(JIUFEN_PROG, 7).split(' '));   // 九份 section in G as well
    const chords = zc.join(' ');
    const pc = vp(lp, -5).split(' '); pc.splice(12, 8, ...vp(JIUFEN_PROG, 7).split(' '));
    const bc = vb(lp, -5).split(' '); bc.splice(12, 8, ...vb(JIUFEN_PROG, 7).split(' '));
    const tail = 'b4:4 d5:2 e5:2 d5:8 | a4:4 b4:2 a4:2 e4:8 | g4:16 | -:8 d5:2 e5:2 g5:4';
    return {
      bpm: 96, bars: 32, swing: 0.24, tracks: [
        T('zheng', 0.32, 0.4, ch(chords, '0:2 1 2 3 4 3 2 1')),
        T('pipa', 0.3, 0.25, ch(chords, '-:2 1+2+3:2 -:2 1+2+3:2 -:2 1+2+3:2 -:2 1+2+3:2')),
        T('pad', 0.22, 0.5, ch(pc.join(' '), '*:16')),
        T('bass', 0.5, 0.15, ch(bc.join(' '), '0:6 0:2 1:4 2:4')),
        T('dizi', 0.5, 0.45, cat('-:64', tr(LOVEM, -5), JIUFEN_A, tr(LOVEM, -5), tail)),
        T('erhu', 0.42, 0.4, cat('-:192', tr(JIUFEN_A, -12), tr(LOVE_COUNTER, 7), '-:64')),
        T('drum', 0.4, 0.2, cat(rep(grid('x.......x.......'), 4), rep(grid('X.......x.x.....'), 28))),
        T('wood', 0.22, 0.2, cat('-:64', rep(grid('x...x...x...x.x.'), 28))),
        T('cymbal', 0.2, 0.4, cat('-:64', rep('x:8 -:56', 6), 'x:16 -:48')),
      ],
    };
  })();

  SONGS.jiufen = (() => {
    const progA = JIUFEN_PROG, progB = 'F C Dm G F Am Dm G';
    const prog = progA + ' ' + progB + ' ' + progA;
    const B = 'e5:1 e5:1 e5:2 d5:2 e5:2 g5:4 e5:4 | d5:1 d5:1 d5:2 b4:2 d5:2 e5:8 | a5:2 g5:2 e5:2 g5:2 d5:2 e5:2 b4:4 | a4:2 b4:2 d5:2 e5:2 d5:8 |' +
      ' e5:1 e5:1 e5:2 d5:2 e5:2 g5:4 a5:4 | b5:2 a5:2 g5:2 e5:2 g5:8 | e5:2 d5:2 b4:2 d5:2 a4:2 b4:2 g4:4 | e4:2 g4:2 a4:2 b4:2 a4:8';
    return {
      bpm: 100, bars: 24, swing: 0.3, tracks: [
        T('dizi', 0.5, 0.35, cat(JIUFEN_A, '-:128', JIUFEN_A)),
        T('pipa', 0.42, 0.25, cat('-:128', B, tr(JIUFEN_A, -12))),
        T('zheng', 0.3, 0.35, ch(vz(prog, 7), '0:2 2 1 3 2 4 3 2')),
        T('bass', 0.5, 0.12, ch(vb(prog, 7), '0:4 -:2 1:2 0:4 2:2 1:2')),
        T('wood', 0.22, 0.15, rep(grid('x..x..x.x...x.x.'), 24)),
        T('drum', 0.22, 0.15, rep(grid('x.......x.......'), 24)),
      ],
    };
  })();

  // 中元 night fair: lively, temple drums, shrill doubled lead (D major pentatonic, 徵 cadences)
  SONGS.festival = (() => {
    const prog = 'C Am C G C F C G F C G Am C Am G C';  // → D Bm D A D G D A | G D A Bm D Bm A D
    const mel = 'a5:2 a5:1 b5:1 a5:2 f#5:2 e5:2 f#5:2 a5:4 | d6:2 b5:2 a5:2 f#5:2 b5:4 -:4 | f#5:2 e5:2 d5:2 e5:2 f#5:2 a5:2 b5:4 | a5:2 f#5:2 e5:2 d5:2 e5:8 |' +
      ' a5:2 a5:1 b5:1 a5:2 f#5:2 e5:2 f#5:2 a5:4 | d6:2 d6:2 b5:2 d6:2 e6:4 d6:4 | b5:2 a5:2 f#5:2 a5:2 e5:2 f#5:2 d5:4 | e5:2 f#5:2 a5:2 b5:2 a5:8 |' +
      ' d6:4 b5:4 a5:8 | b5:2 a5:2 f#5:2 e5:2 f#5:8 | a5:4 f#5:4 e5:8 | f#5:2 e5:2 d5:2 b4:2 d5:8 |' +
      ' e5:2 e5:2 f#5:2 a5:2 b5:2 a5:2 f#5:2 a5:2 | b5:2 b5:2 d6:2 b5:2 a5:4 f#5:4 | e5:2 f#5:2 e5:2 d5:2 b4:2 d5:2 e5:4 | a4:2 b4:2 d5:2 e5:2 d5:4 -:4';
    return {
      bpm: 116, bars: 16, swing: 0.16, tracks: [
        T('erhu', 0.5, 0.25, mel, { leg: 0.8 }),
        T('dizi', 0.42, 0.3, mel, { leg: 0.75 }),
        T('pipa', 0.32, 0.2, ch(vz(prog, 2), '2:2 3 4 3 2 3 4 3')),
        T('bass', 0.5, 0.1, ch(vb(prog, 2), '0:3 0:1 1:2 0:2 0:3 0:1 1:2 2:2')),
        T('drum', 0.5, 0.15, rep(grid('X...x.x.X...x.x.'), 16)),
        T('wood', 0.28, 0.1, rep(grid('X.x.x.x.X.x.x.x.'), 16)),
        T('cymbal', 0.25, 0.2, rep(grid('....x.......x...'), 16)),
        T('gong', 0.32, 0.4, rep('x:128', 2)),
      ],
    };
  })();

  // eerie calm night: sparse zheng, distant dizi then erhu, the night-watchman's clapper (打更)
  SONGS.night = (() => {
    const prog = 'Em Em C D Em F G Em Em Em C Am Em F G Em';
    const dizi = '-:16 | -:8 b4:4 d5:4 | e5:12 d5:2 b4:2 | a4:16 | -:8 g4:2 a4:2 b4:4 | f5:8 e5:8 | d5:4 b4:4 a4:8 | b4:16 | -:128';
    const erhu = '-:128 | -:16 | -:4 e4:4 g4:4 a4:4 | b4:8 a4:4 g4:4 | e4:16 | -:8 d5:4 e5:4 | g5:8 f5:4 e5:4 | d5:4 b4:4 a4:4 g4:4 | e4:16';
    return {
      bpm: 60, bars: 16, tracks: [
        T('zheng', 0.3, 0.6, ch(vz(prog), '0:3 1 2:4 1:6')),
        T('pad', 0.22, 0.7, ch(vp(prog, -12), '*:16')),
        T('bass', 0.3, 0.3, ch(vb(prog, -12), '0:16')),
        T('dizi', 0.42, 0.75, dizi),
        T('erhu', 0.42, 0.6, erhu),
        T('wood', 0.16, 0.5, rep('x:3 x:13 | -:48', 4)),
        T('gong', 0.08, 0.7, rep('-:48 x:80', 2)),
        T('bell', 0.15, 0.9, rep('-:8 b5:8 | -:112', 2)),
      ],
    };
  })();

  // old gold mine: drips, distant picks, a low B-minor erhu lament, pipa tremolo
  SONGS.mine = (() => {
    const prog = 'Am G Am G Am G Am F Am G Am E F G E Am';    // +2 → Bm A Bm A Bm A Bm G Bm A Bm F# G A F# Bm
    const erhu = '-:64 | b3:4 d4:4 e4:6 f#4:2 | e4:4 d4:2 b3:2 a3:8 | b3:4 d4:4 f#4:4 a4:4 | g4:8 f#4:8 |' +
      ' b4:6 a4:2 f#4:4 e4:4 | d4:4 e4:2 d4:2 b3:8 | f#4:4 e4:4 c#4:4 a#3:4 | b3:16 | -:64';
    const trem = '-:192 | g4:1 g4 g4 g4 f#4:4 e4:4 d4:4 | e4:1 e4 e4 e4 c#4:4 e4:4 a4:4 | a#4:1 a#4 a#4 a#4 c#5:4 a#4:4 f#4:4 | b4:1 b4 b4 b4 f#4:4 d4:4 b3:4';
    return {
      bpm: 84, bars: 16, tracks: [
        T('pipa', 0.26, 0.35, ch(vz(prog, 2), '0:2 2 3 2 4 2 3 2')),
        T('pipa', 0.4, 0.35, trem),
        T('erhu', 0.55, 0.45, erhu),
        T('bass', 0.5, 0.2, ch(vb(prog, 2), '0:4 -:2 0:2 1:4 0:4')),
        T('pad', 0.2, 0.6, ch(vb(prog, 2), '0+1:16')),
        T('wood', 0.16, 0.6, rep(grid('x.......x.....x.'), 16)),
        T('bell', 0.16, 0.95, rep('-:6 f#6:4 -:6 | -:12 b6:4 | -:16 | -:3 d6:5 -:8', 4)),
      ],
    };
  })();

  // 魔神仔 misty forest (6/8, D minor): looping zheng, an erhu line followed by its own ghostly echo
  SONGS.forest = (() => {
    const prog = 'Dm Dm C C Bb Bb Am Am Dm F C Gm Dm Bb Am Am Gm Gm Dm Dm Bb C Dm Dm';
    const A = '-:12 | -:6 a4:2 c5:2 d5:2 | e5:6 d5:2 c5:2 a4:2 | g4:12 | f4:2 g4:2 a4:2 d5:4 c5:2 | d5:4 f5:2 e5:6 | d5:6 c5:2 a4:4 | a4:12';
    const B = 'd5:2 f5:2 g5:2 a5:6 | g5:2 f5:2 d5:2 c5:6 | e5:2 g5:2 c6:2 a5:4 g5:2 | g5:6 d5:6 | f5:2 e5:2 d5:2 a4:6 | bb4:2 c5:2 d5:2 f5:6 | e5:2 d5:2 c5:2 a4:6 | e4:6 -:6';
    const C = 'bb4:6 a4:6 | g4:12 | a4:6 d5:6 | f5:12 | f5:6 d5:6 | e5:6 g5:6 | a5:12 | d5:12';
    const echo = '-:6 ' + B.replace(/\|\s*e4:6 -:6$/, '| e4:6');
    return {
      bpm: 92, bar: 12, bars: 24, tracks: [
        T('zheng', 0.32, 0.55, ch(vz(prog), '0:2 2 3 4 3 2')),
        T('pad', 0.24, 0.7, ch(vp(prog), '*:12')),
        T('bass', 0.36, 0.25, ch(vb(prog), '0:6 1:6')),
        T('dizi', 0.45, 0.6, cat(A, '-:96', C)),
        T('erhu', 0.48, 0.5, cat('-:96', B, '-:96')),
        T('dizi', 0.16, 0.95, cat('-:96', echo, '-:96'), { tr: 12 }),
        T('wood', 0.12, 0.5, rep(grid('x.....x..x..'), 24)),
        T('drum', 0.22, 0.4, cat('-:96', rep(grid('x...........'), 16))),
      ],
    };
  })();

  // 七彩靈蕈 grove: lydian shimmer, a 3-against-4 bell ostinato, cymbal breaths, floating dizi
  SONGS.mushroom = (() => {
    const C7 = 'c3.g3.b3.e4', DC = 'c3.f#3.a3.d4', E7 = 'e3.g3.b3.d4', A9 = 'a2.e3.b3.c4', FL = 'f2.a3.b3.e4';
    const pads = [C7, DC, C7, DC, E7, A9, E7, A9, FL, DC, FL, DC].map((c) => c + '*2').join(' ');
    const dizi = '-:128 | b5:8 a5:4 g5:4 | e5:16 | g5:4 a5:4 b5:4 d6:4 | c6:8 b5:8 | e6:12 d6:4 | b5:16 | a5:4 g5:4 e5:4 d5:4 | e5:16 |' +
      ' a5:4 b5:4 c6:4 e6:4 | b5:16 | a5:8 f#5:8 | d5:16 | c6:6 b5:2 a5:8 | e5:16 | f#5:8 e5:8 | d5:8 -:8';
    return {
      bpm: 88, bars: 24, tracks: [
        T('pad', 0.34, 0.8, ch(pads, '*:16')),
        T('bell', 0.2, 0.85, rep('g6:3 d6 e6 b5', 32)),
        T('zheng', 0.22, 0.7, rep('e4:2 b4 d5', 64)),
        T('dizi', 0.42, 0.8, dizi),
        T('cymbal', 0.09, 0.9, rep('x:16 | -:48', 6)),
        T('bass', 0.3, 0.4, ch(pads, '0:16')),
      ],
    };
  })();

  // 平溪 sky lanterns: hopeful, rising (D major pentatonic)
  SONGS.pingxi = (() => {
    const progA = 'C G Am Em F C Dm G', progB = 'F G Em Am F G C C', progA2 = 'C G Am Em F C G C';
    const A = 'e5:4 g5:2 a5:2 g5:6 e5:2 | d5:4 e5:2 g5:2 d5:8 | c5:4 e5:2 a5:2 g5:4 e5:4 | g5:4 e5:2 d5:2 e5:8 |' +
      ' a5:4 c6:2 a5:2 g5:4 e5:4 | g5:4 e5:2 d5:2 c5:8 | d5:4 e5:2 g5:2 a5:4 c6:4';
    const B = 'c6:6 d6:2 c6:4 a5:4 | g5:6 a5:2 g5:4 d5:4 | e5:4 g5:2 e5:2 d5:4 b4:4 | c5:6 d5:2 e5:8 |' +
      ' a5:4 g5:2 a5:2 c6:4 d6:4 | e6:6 d6:2 b5:4 d6:4 | e6:4 d6:2 c6:2 a5:4 g5:4 | c6:12 -:4';
    const counter = 'c5:8 e5:8 | b4:8 d5:8 | c5:8 e5:8 | b4:16 | a4:8 c5:8 | g4:8 c5:8 | b4:8 d5:8 | e5:16';
    const prog = progA + ' ' + progB + ' ' + progA2;
    return {
      bpm: 76, bars: 24, tracks: [
        T('dizi', 0.52, 0.55, cat(A, 'd6:12 -:4', B, A.replace(/a5:4 c6:4$/, 'b5:4 d6:4'), 'c6:12 -:4'), { tr: 2 }),
        T('erhu', 0.4, 0.45, cat('-:256', counter), { tr: 2 }),
        T('zheng', 0.36, 0.5, ch(vz(prog, 2), '0:2 1 2 3 4 3 2 1')),
        T('pad', 0.28, 0.6, ch(vp(prog, 2), '*:16')),
        T('bass', 0.45, 0.2, ch(vb(prog, 2), '0:8 1:4 2:4')),
        T('bell', 0.2, 0.85, rep('-:4 a6:4 -:8 | -:16 | -:12 e6:4 | -:16', 6), { tr: 2 }),
        T('drum', 0.26, 0.3, cat('-:128', rep(grid('x.......x.x.....'), 16))),
      ],
    };
  })();

  // temple courtyard: 木魚 pulse, 磬 bell, open-fifth drone, meditative dizi (F 宮)
  SONGS.temple = (() => {
    const drone = 'f2.c3.f3*2 d2.a2.d3*2 bb1.f2.bb2*2 c2.g2.c3*2 f2.c3.f3*2 d2.a2.d3*2 bb1.f2.bb2 c2.g2.c3 f2.c3.f3*2';
    const mel = '-:16 | c5:4 d5:4 f5:8 | g5:6 f5:2 d5:8 | c5:4 d5:2 c5:2 a4:8 | f4:4 g4:4 a4:4 c5:4 | d5:16 | c5:6 d5:2 c5:4 a4:4 | g4:16 |' +
      ' a4:4 c5:4 d5:4 f5:4 | g5:8 a5:8 | f5:6 d5:2 c5:4 d5:4 | a4:16 | g4:4 a4:2 c5:2 d5:4 f5:4 | g5:6 f5:2 d5:8 | c5:4 d5:2 c5:2 a4:4 g4:4 | f4:16';
    return {
      bpm: 66, bars: 16, tracks: [
        T('pad', 0.34, 0.7, ch(drone, '*:16')),
        T('bass', 0.3, 0.3, ch(drone, '0:16')),
        T('dizi', 0.48, 0.65, mel),
        T('zheng', 0.22, 0.6, ch(drone, '-:8 1:4 2:4')),
        T('wood', 0.22, 0.3, rep(grid('x...x...x...x...', 'd4'), 16)),
        T('bell', 0.3, 0.85, rep('a5:64', 4)),
      ],
    };
  })();

  // 艋舺 bustle: 歌仔戲-flavoured erhu lead (G 徵 mode), pipa runs, clappers & small cymbals
  SONGS.city = (() => {
    const prog = 'C G Am G F C Dm G C G Am Em F G C C';    // +7 → G D Em D C G Am D G D Em Bm C D G G
    const mel = 'd5:2 d5:1 e5:1 g5:2 e5:2 d5:2 b4:2 d5:4 | e5:2 d5:2 a4:2 b4:2 a4:8 | b4:2 d5:2 e5:2 g5:2 e5:2 d5:2 b4:4 | a4:2 b4:2 a4:2 g4:2 a4:4 -:4 |' +
      ' e5:4 g5:2 e5:2 d5:2 e5:2 g5:4 | d5:4 b4:2 a4:2 g4:8 | e4:2 g4:2 a4:2 b4:2 a4:2 g4:2 e4:4 | d4:2 e4:2 g4:2 a4:2 d5:8 |' +
      ' g5:3 e5:1 d5:2 e5:2 g5:4 a5:4 | a5:2 g5:2 e5:2 d5:2 e5:4 -:4 | e5:2 g5:2 b5:2 a5:2 g5:2 e5:2 d5:4 | d5:2 e5:2 d5:2 b4:2 d5:8 |' +
      ' e5:4 e5:2 g5:2 a5:4 g5:4 | a5:2 g5:2 e5:2 d5:2 b4:4 a4:4 | b4:2 d5:2 e5:2 g5:2 d5:2 b4:2 a4:4 | g4:8 d5:2 e5:2 g5:4';
    return {
      bpm: 120, bars: 16, swing: 0.2, tracks: [
        T('erhu', 0.52, 0.25, mel, { leg: 0.85 }),
        T('dizi', 0.28, 0.3, cat('-:128', mel.split('|').slice(8).join('|')), { tr: 12, leg: 0.7 }),
        T('pipa', 0.32, 0.2, ch(vz(prog, 7), '0:2 2:1 2:1 3:2 2:2 1:2 2:1 2:1 3:2 4:2')),
        T('bass', 0.5, 0.1, ch(vb(prog, 7), '0:4 1:4 0:4 1:2 2:2')),
        T('wood', 0.26, 0.1, rep(grid('X..x..x.X.x.x...'), 16)),
        T('drum', 0.36, 0.15, rep(grid('X.......X...x...'), 16)),
        T('cymbal', 0.16, 0.15, rep(grid('....x.......x...'), 16)),
      ],
    };
  })();

  // 洛家古厝 haunted mansion: drone with a phrygian rub, sparse erhu, a far-away ghost dizi, gong
  SONGS.mansion = (() => {
    const K = { D: 'd2.a2.d3.f3', Bb: 'bb1.f2.d3.f3', Gm: 'g1.d2.bb2.d3', Eb: 'eb2.bb2.d3.g3', A: 'a1.e2.c#3.g3' };
    const prog = 'D D Bb D D D Gm Eb D Bb Gm A D D Gm D'.split(' ').map((c) => K[c]).join(' ');
    const erhu = '-:16 | -:8 a4:8 | bb4:12 a4:4 | f4:8 e4:8 | d4:16 | -:16 | -:4 d5:4 c5:4 a4:4 | eb5:12 d5:4 |' +
      ' -:16 | a4:6 bb4:2 a4:8 | f4:4 g4:4 a4:8 | g4:8 e4:8 | d4:16 | -:48';
    const ghost = '-:80 | a5:16 | -:112 | a5:16 | f5:8 e5:8 | d5:16';
    return {
      bpm: 54, bars: 16, tracks: [
        T('pad', 0.32, 0.7, ch(prog, '*:16')),
        T('bass', 0.3, 0.3, ch(prog, '0:16')),
        T('erhu', 0.52, 0.6, erhu),
        T('dizi', 0.26, 0.95, ghost),
        T('zheng', 0.26, 0.7, rep('d4:8 -:8 | -:16 | a3:4 -:12 | -:16', 3) + ' | d4:8 -:8 | -:16 | eb4:4 -:12 | -:16'),
        T('gong', 0.2, 0.7, rep('x:64', 4)),
        T('drum', 0.2, 0.5, rep(grid('x..x............ ................'), 8)),
        T('bell', 0.12, 0.95, '-:128 bb5:16 -:112'),
      ],
    };
  })();

  // 府城 old capital: stately and elegant (G 宮), 南管-like pipa, dizi then erhu, ceremonial drum
  SONGS.tainan = (() => {
    const progA = 'C F C G Am F G C', progB = 'Am Em F C Dm Am G G';
    const prog = progA + ' ' + progB + ' ' + progA;
    const A = 'c5:6 d5:2 e5:4 g5:4 | a5:6 g5:2 e5:4 c5:4 | d5:4 e5:4 g5:4 e5:2 d5:2 | d5:12 -:4 |' +
      ' e5:6 g5:2 a5:4 c6:4 | c6:6 a5:2 g5:8 | d5:4 g5:4 a5:2 g5:2 e5:2 d5:2 | c5:12 -:4';
    const B = 'a4:6 c5:2 e5:4 a5:4 | g5:6 e5:2 d5:4 b4:4 | c5:6 d5:2 f5:4 a5:4 | g5:12 -:4 |' +
      ' a5:6 g5:2 f5:4 d5:4 | e5:6 d5:2 c5:4 a4:4 | b4:4 d5:4 g5:4 a5:4 | g5:12 -:4';
    return {
      bpm: 80, bars: 24, tracks: [
        T('dizi', 0.5, 0.45, cat(A, '-:128', A), { tr: 7 }),
        T('erhu', 0.5, 0.4, cat('-:128', B, A), { tr: -5 }),
        T('zheng', 0.32, 0.45, ch(vz(prog, 7), '0:4 2:2 4:2 3:4 2:4')),
        T('pipa', 0.28, 0.3, ch(vz(prog, 7), '1:2 2 3 2 1 2 3 2')),
        T('pad', 0.22, 0.55, ch(vp(prog, 7), '*:16')),
        T('bass', 0.45, 0.2, ch(vb(prog, 7), '0:8 1:8')),
        T('drum', 0.32, 0.3, rep(grid('X...........x...'), 24)),
        T('wood', 0.18, 0.3, rep(grid('........x.......'), 24)),
        T('gong', 0.2, 0.6, rep('x:128', 3)),
      ],
    };
  })();

  // 長明宮: cold & solemn (C# phrygian) — frozen lantern bells, gong, a slow erhu
  SONGS.palace = (() => {
    const prog = 'Am Bb Am Gm Am Bb Dm Am F Bb Gm Am Dm Bb E Am';
    const erhu = '-:16 | -:8 a4:4 bb4:4 | c5:8 bb4:4 a4:4 | g4:12 -:4 | a4:4 c5:4 e5:8 | f5:8 d5:4 bb4:4 | a4:8 d5:4 c5:4 | e5:16 |' +
      ' f5:6 e5:2 c5:8 | d5:6 c5:2 bb4:8 | g4:4 a4:4 bb4:4 d5:4 | c5:8 a4:8 | f5:6 e5:2 d5:4 a4:4 | bb4:8 d5:8 | e5:6 d5:2 b4:4 g#4:4 | a4:16';
    return {
      bpm: 58, bars: 16, tracks: [
        T('erhu', 0.55, 0.55, erhu, { tr: 4 }),
        T('bell', 0.18, 0.9, ch(vz(prog, 4), '12:8 13:8')),
        T('pad', 0.32, 0.7, ch(vp(prog, -8), '*:16')),
        T('bass', 0.36, 0.3, ch(vb(prog, -8), '0:16')),
        T('gong', 0.3, 0.7, rep('x:128', 2)),
        T('drum', 0.26, 0.5, rep(grid('x............... ........x.......'), 8)),
      ],
    };
  })();

  // stealth: creeping chromatic bass, pizzicato pipa, ticking blocks
  SONGS.stealth = (() => {
    const bE = 'e2:2 -:2 e2:2 g2:2 -:2 a2:2 bb2:2 b2:2', bC = tr(bE, -4), bB = tr(bE, -5);
    const pE = 'e4:1 -:3 b3:1 -:3 e4:1 -:1 g4:1 -:1 f#4:1 -:3', pC = tr(pE, -4), pB = tr(pE, -5);
    const erhu = 'b4:8 c5:8 | b4:16 | g4:8 a4:4 bb4:4 | b4:16 | e5:6 d5:2 b4:8 | c5:8 g4:8 | a4:4 bb4:4 b4:4 c5:4 | b4:16';
    return {
      bpm: 100, bars: 16, tracks: [
        T('bass', 0.55, 0.1, rep(cat(bE, bE, bC, bB), 4)),
        T('pipa', 0.34, 0.2, rep(cat(pE, pE, pC, pB), 4)),
        T('erhu', 0.4, 0.4, cat('-:128', erhu)),
        T('wood', 0.2, 0.1, rep(grid('..x...x...x...x.'), 16)),
        T('drum', 0.26, 0.2, rep(grid('x..x............'), 16)),
        T('bell', 0.1, 0.9, rep('-:112 | b6:16', 2)),
      ],
    };
  })();

  // mountain village: hand drums, bamboo sticks, flute call & voice-like erhu response (G pentatonic, 羽 cadence)
  SONGS.tribe = (() => {
    const K = { E: 'e2.b2.e3', D: 'd2.a2.d3', G: 'g2.d3.g3' };
    const prog = 'E E E D E E G E E E E D E E G E'.split(' ').map((c) => K[c]).join(' ');
    const call = 'e5:4 g5:4 a5:6 g5:2 | e5:4 d5:4 e5:8 | -:32 | a5:4 b5:4 d6:6 b5:2 | a5:4 g5:4 a5:8 | -:32';
    const resp = '-:32 | b4:4 d5:4 e5:4 d5:4 | b4:4 a4:2 g4:2 e4:8 | -:32 | e5:4 d5:4 b4:6 a4:2 | g4:4 a4:4 e4:8';
    const tutti = 'e5:2 e5:2 g5:4 a5:2 a5:2 g5:4 | e5:2 d5:2 b4:4 d5:4 e5:4 | a5:2 a5:2 b5:4 d6:2 b5:2 a5:4 | g5:2 e5:2 d5:4 e5:8 |' +
      ' e5:2 e5:2 g5:4 a5:2 a5:2 g5:4 | e5:2 d5:2 b4:4 d5:4 e5:4 | g5:2 a5:2 b5:4 a5:2 g5:2 e5:4 | d5:2 b4:2 d5:4 e5:8';
    return {
      bpm: 100, bars: 16, tracks: [
        T('dizi', 0.5, 0.45, cat(call, tutti)),
        T('erhu', 0.48, 0.4, cat(resp, tr(tutti, -12))),
        T('pad', 0.22, 0.5, ch(prog, '*:16')),
        T('bass', 0.5, 0.15, ch(prog, '0:6 0:2 1:4 0:4')),
        T('drum', 0.5, 0.2, rep(grid('X..x..x.X..x.x..'), 16)),
        T('wood', 0.2, 0.15, rep(grid('x.xx.x.xx.x.x.x.'), 16)),
      ],
    };
  })();

  // 靈境 vision realm: heartbeat, 3-against-4 zheng ostinato, 6-step bells, layers that arrive and dissolve
  SONGS.vision = (() => {
    const Dm = 'd3.a3.c4.f4', C = 'c3.g3.d4.g4', Bb = 'bb2.f3.c4.d4';
    const pads = `${Dm}*6 ${Dm}*3 ${C}*3 ${Bb}*3 ${Bb}*3 ${C}*3 ${Dm}*6 ${Dm}*3 ${C}*3 ${Dm}*3`;
    const zheng = cat(rep('d4:3 a4 c5 a4', 8), rep('d4:3 a4 c5 e5', 12), rep('f4:3 c5 d5 a4', 16), rep('d4:3 a4 c5 a4', 12));
    const bell = cat('-:96', rep('a5:6 d6 e6 c6', 14), rep('a5:6? e6? d6? c6?', 6));
    const dizi = cat('-:240', 'd5:8 e5:4 f5:4 | e5:8 d5:8 | a4:16 | -:16 | f5:8 g5:4 a5:4 | c6:8 a5:8 | g5:16 | -:16 | a5:6 g5:2 f5:4 e5:4 | d5:8 c5:8 | d5:16 | -:16',
      'a5:16 | -:16 | g5:16 | -:16 | e5:16 | -:16 | d5:16 | -:32');
    const erhu = cat('-:96', 'd4:16 | f4:16 | e4:16 | d4:16 | c4:16 | e4:16 | d4:16 | f4:8 g4:8 | a4:16',
      '-:48 | a4:4 g4:4 f4:4 e4:4 | -:48 | c5:4 a4:4 g4:4 f4:4 | -:48 | e4:4 f4:4 e4:4 d4:4', '-:144');
    return {
      bpm: 84, bars: 36, tracks: [
        T('pad', 0.34, 0.8, ch(pads, '*:16')),
        T('pad', 0.3, 0.6, ch(pads, '0:16'), { tr: -12 }),
        T('zheng', 0.26, 0.6, zheng),
        T('bell', 0.16, 0.85, bell),
        T('dizi', 0.44, 0.75, dizi),
        T('erhu', 0.42, 0.6, erhu),
        T('drum', 0.42, 0.3, rep(grid('X..x............'), 36)),
        T('cymbal', 0.07, 0.6, cat('-:96', rep(grid('..o...o...o...o.'), 21), '-:144')),
      ],
    };
  })();

  // 日月潭: serene lake (F major pentatonic) — rippling zheng, dizi, erhu; soft pitched pestle taps
  SONGS.lake = (() => {
    const progA = 'C Em F C Am Em F G', progB = 'F G C Am Dm Em F G', progA2 = 'C Em F C Am Em F C';
    const prog = progA + ' ' + progB + ' ' + progA2;
    const A6 = 'g5:6 e5:2 d5:4 c5:4 | d5:4 e5:4 g5:8 | a5:6 c6:2 a5:4 g5:4 | e5:12 -:4 | c5:4 e5:2 g5:2 a5:4 g5:4 | g5:6 e5:2 d5:8 | c5:4 d5:2 e5:2 a5:4 g5:4';
    const B = 'a5:6 g5:2 a5:4 c6:4 | d6:8 b5:4 g5:4 | e6:6 d6:2 c6:4 g5:4 | a5:12 -:4 | d5:4 f5:2 a5:2 c6:4 a5:4 | g5:6 e5:2 d5:4 b4:4 | c5:4 d5:2 e5:2 g5:4 a5:4 | g5:12 -:4';
    return {
      bpm: 70, bars: 24, tracks: [
        T('dizi', 0.48, 0.6, cat(A6, 'd5:12 -:4', '-:128', A6, 'c5:12 -:4'), { tr: 5 }),
        T('erhu', 0.46, 0.5, cat('-:128', B, '-:128'), { tr: 5 }),
        T('zheng', 0.24, 0.55, ch(vz(prog, 5), '0:1 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1')),
        T('pad', 0.28, 0.65, ch(vp(prog, 5), '*:16')),
        T('bass', 0.38, 0.25, ch(vb(prog, 5), '0:16')),
        T('wood', 0.2, 0.4, cat('-:128', rep(grid('x..x..x.x..x..x.', 'f4'), 4), rep(grid('x..x..x.x..x..x.', 'c4'), 4), '-:128')),
        T('bell', 0.16, 0.9, rep('-:8 a6:8 | -:48', 6)),
      ],
    };
  })();

  // 燈母祠 drowned shrine: sacred hush; bells remember the 燈 motif and a line of 「渡魂謠」 (E 羽)
  SONGS.shrine = (() => {
    const prog = 'Em C Em D Em C Am Bm Em C Em D C Am Bm Em';
    const bells = cat(tr(MOTIF, 7), '-:32 | -:64 | e6:6 g6:2 e6:4 d6:4 | b5:4 d6:2 b5:2 a5:8 | -:32 | -:64');
    const dizi = '-:64 | b4:8 d5:4 e5:4 | g5:12 e5:4 | e5:8 d5:4 c5:4 | b4:16 | -:64 | g4:8 a4:4 b4:4 | e5:8 d5:4 c5:4 | b4:4 a4:4 f#4:8 | e4:16';
    return {
      bpm: 60, bars: 16, tracks: [
        T('bell', 0.3, 0.9, bells),
        T('dizi', 0.42, 0.75, dizi),
        T('erhu', 0.36, 0.6, cat('-:128', 'e4:16 | g4:16 | b4:16 | a4:16', '-:64')),
        T('pad', 0.34, 0.8, ch(vp(prog), '*:16')),
        T('bass', 0.26, 0.4, ch(vb(prog, -12), '0:16')),
        T('zheng', 0.18, 0.75, ch(vz(prog), '2:4 3:4 4:8')),
        T('gong', 0.14, 0.8, rep('x:128', 2)),
      ],
    };
  })();

  // 逆潮: the tide runs backwards — pounding 16ths, tritone wails, crashing metal (C minor / phrygian)
  SONGS.chaos = (() => {
    const roots = 'c2.c3 c2.c3 db2.db3 c2.c3 ab1.ab2 ab1.ab2 g1.g2 g1.g2';
    const K = { Cm: 'c3.eb3.g3', Db: 'db3.f3.ab3', Ab: 'ab2.c3.eb3', G: 'g2.b2.d3' };
    const pads = 'Cm Cm Db Cm Ab Ab G G'.split(' ').map((c) => K[c]).join(' ');
    const m1 = 'c5:2 eb5:2 f#5:4 g5:8 | ab5:2 g5:2 f#5:2 eb5:2 c5:8 | db5:2 f5:2 ab5:4 c6:4 db6:4 | c6:4 b5:4 g5:8 |' +
      ' ab5:4 g5:2 eb5:2 c5:4 eb5:4 | f5:4 eb5:2 c5:2 ab4:8 | g4:2 ab4:2 b4:2 d5:2 f5:4 ab5:4 | b5:8 g5:8';
    const m2 = m1.replace(/\| b5:8 g5:8$/, '| g5:4 b5:4 d6:4 f6:4');
    return {
      bpm: 132, bars: 16, tracks: [
        T('erhu', 0.5, 0.3, cat(m1, m2), { leg: 0.85 }),
        T('dizi', 0.36, 0.3, cat('-:128', m2), { leg: 0.8 }),
        T('bass', 0.55, 0.1, ch(roots + ' ' + roots, '0:2 0:1 0:1 0:2 1:2 0:2 0:1 0:1 0:2 1:2')),
        T('pad', 0.26, 0.4, ch(pads + ' ' + pads, '*:16')),
        T('pipa', 0.22, 0.2, ch(pads + ' ' + pads, '0:1 1 2 1 0 1 2 1 0 1 2 1 0 1 2 1'), { tr: 12 }),
        T('drum', 0.55, 0.15, rep(grid('X.x.X.x.X.xxX.x.'), 16)),
        T('wood', 0.16, 0.1, rep(grid('x.xxx.xxx.xxx.xx'), 16)),
        T('cymbal', 0.28, 0.25, rep(grid('X.......x.......'), 16)),
        T('gong', 0.34, 0.5, rep('x:64', 4)),
      ],
    };
  })();

  // 黑水溝: the black tide — vast and melancholy (D minor); surf washes, drifting soul-lights
  SONGS.sea = (() => {
    const prog = 'Dm Dm Bb C Dm Dm Gm Gm Bb C Dm Dm Bb F Gm E Dm Bb E Dm Dm Bb C Dm'.replace(/\bE\b/g, 'A');
    const K = Object.assign({}, VZ, { A: 'a2.e3.a3.c#4.e4' }), KP = Object.assign({}, VP, { A: 'a3.c#4.e4' }), KB = Object.assign({}, VB, { A: 'a2.e3.a3' });
    const z = voice(K)(prog), p = voice(KP)(prog), b = voice(KB)(prog);
    const erhu = '-:64 | d5:6 f5:2 g5:4 a5:4 | a5:12 g5:2 f5:2 | g5:8 f5:4 d5:4 | d5:16 |' +
      ' f5:6 d5:2 c5:4 d5:4 | g5:6 e5:2 c5:8 | d5:4 f5:4 a5:4 c6:4 | a5:16 |' +
      ' d6:6 c6:2 a5:4 f5:4 | g5:6 f5:2 c5:8 | d5:4 f5:4 g5:4 bb5:4 | a5:8 e5:8 |' +
      ' f5:6 e5:2 d5:8 | d5:4 c5:4 bb4:4 a4:4 | e5:8 c#5:4 a4:4 | d5:16 | -:64';
    return {
      bpm: 56, bars: 24, tracks: [
        T('erhu', 0.55, 0.55, erhu),
        T('dizi', 0.38, 0.75, cat('-:320', 'a5:8 g5:4 f5:4 | d5:16 | e5:8 c5:8 | d5:16')),
        T('zheng', 0.26, 0.6, ch(z, '0:6 2:6 4:4')),
        T('pad', 0.36, 0.75, ch(p, '*:16')),
        T('pad', 0.3, 0.5, ch(b, '0:16'), { tr: -12 }),
        T('bell', 0.14, 0.95, rep('-:6 a6:2 -:24 d6:2 -:30', 6)),
        T('cymbal', 0.07, 0.8, rep('x:32', 12)),
        T('gong', 0.14, 0.8, rep('x:128', 3)),
      ],
    };
  })();

  // 彼岸花原: the far shore's flower field — a bittersweet waltz (E major pentatonic); erhu recalls the 燈 motif, 羽 then 宮
  SONGS.farshore = (() => {
    const prog = 'C*2 Am*2 F*2 G*2 C*2 Em*2 F*2 G*2 Am*2 F*2 C*2 G*2';
    const dizi = 'e5:8 g5:4 | c6:12 | b5:4 a5:4 g5:4 | e5:12 | f5:4 a5:4 c6:4 | e6:8 d6:4 | b5:8 a5:4 | g5:12 |' +
      ' e5:8 g5:4 | c6:8 d6:4 | e6:8 d6:4 | b5:12 | a5:4 g5:4 f5:4 | e5:4 f5:4 a5:4 | d5:12 | -:12 | -:96';
    const erhu = '-:192 | a4:4 e5:4 a5:4 | g5:3 e5:1 d5:2 e5:6 | c5:4 d5:2 c5:2 a4:4 | c5:12 | c5:4 g5:4 c6:4 | a5:3 g5:1 e5:2 g5:6 | d5:4 e5:2 g5:2 d5:4 | d5:12';
    return {
      bpm: 72, bar: 12, bars: 24, tracks: [
        T('dizi', 0.48, 0.65, dizi, { tr: 4 }),
        T('erhu', 0.46, 0.55, erhu, { tr: 4 }),
        T('zheng', 0.32, 0.6, ch(vz(prog, 4), '0:4 2:2 3:2 4:2 3:2')),
        T('pad', 0.28, 0.7, ch(vp(prog, 4), '*:12')),
        T('bass', 0.36, 0.3, ch(vb(prog, 4), '0:12')),
        T('bell', 0.2, 0.9, rep('g6:12 | -:36', 6), { tr: 4 }),
      ],
    };
  })();


  // 彼岸燈塔: climbing the tower — rising arpeggios, a resolute erhu theme, then 白芷's song at its heart (B minor)
  SONGS.lighthouse = (() => {
    const progA = 'Am F C G Am F G E';
    const prog = progA + ' ' + DUHUN_PROG + ' ' + progA;
    const A = 'a4:4 c5:4 e5:4 a5:4 | g5:6 f5:2 e5:4 c5:4 | e5:4 g5:4 c6:4 e6:4 | d6:6 c6:2 b5:4 g5:4 |' +
      ' c6:4 b5:2 a5:2 e5:4 a5:4 | a5:6 g5:2 f5:4 c5:4 | d5:4 g5:4 b5:4 d6:4 | e6:12 -:4';
    return {
      bpm: 84, bars: 24, tracks: [
        T('erhu', 0.5, 0.4, cat(A, DUHUN_COUNTER, A), { tr: 2 }),
        T('dizi', 0.48, 0.5, cat('-:128', DUHUN, A), { tr: 2 }),
        T('zheng', 0.26, 0.45, ch(vz(prog, 2), '0:1 1 2 3 4 5 6 7 8 9 8 7 6 5 4 3')),
        T('bell', 0.12, 0.85, ch(vz(prog, 2), '10:4 12:4 13:4 14:4')),
        T('pad', 0.26, 0.6, ch(vp(prog, 2), '*:16')),
        T('bass', 0.45, 0.2, ch(vb(prog, 2), '0:4 0:4 1:4 0:4')),
        T('drum', 0.32, 0.3, rep(grid('X...x...X...x...'), 24)),
        T('gong', 0.2, 0.6, rep('x:128', 3)),
      ],
    };
  })();

  // 一息界: the realm of one breath — lydian chords drifting by major thirds, interlocking 3/6/16-step
  // ostinati (kaleidoscope), jewel bells, a gliding dizi
  SONGS.breath = (() => {
    const roots = [0, 4, -4, 0, 2, 6, -2, 2];
    const block = (s, i) => tr(s, roots[i]);
    const each = (s) => roots.map((_, i) => block(s, i)).join(' | ');
    const dizi = ['-:48', 'b5:16 | a#5:8 g#5:8 | f#5:16', 'c6:16 | d6:8 eb6:8 | c6:16', 'e6:16 | f#6:8 g6:8 | b5:16',
      'a5:16 | g#5:8 f#5:8 | e5:16', 'a#5:16 | g#5:8 c#6:8 | f#5:16', 'd6:16 | e6:8 f6:8 | a5:16', 'f#5:16 | e5:8 g#5:8 | a5:16'].join(' | ');
    const erhu = cat('-:192', 'd4:16 | e4:16 | f#4:16', 'f#4:16 | g#4:16 | a#4:16', 'f4:16 | e4:16 | d4:16', 'a4:16 | g#4:16 | f#4:16');
    return {
      bpm: 100, bars: 24, tracks: [
        T('pad', 0.3, 0.85, each('c3+g3+b3+e4+f#4:48')),
        T('pad', 0.26, 0.6, each('c2:48')),
        T('bell', 0.15, 0.85, each(rep('g5:3 b5 d6 f#6', 4))),
        T('zheng', 0.2, 0.6, each(rep('c4:1 g4 d5 e5 f#5 b5 f#5 e5 d5 g4 d5 e5 f#5 b5 f#5 e5', 3))),
        T('pipa', 0.16, 0.6, each(rep('e5:2 g5 c6', 8))),
        T('dizi', 0.42, 0.85, dizi),
        T('erhu', 0.36, 0.6, erhu),
        T('cymbal', 0.08, 0.9, rep('x:48', 8)),
        T('gong', 0.12, 0.85, rep('x:192', 2)),
        T('drum', 0.22, 0.4, cat('-:192', rep(grid('x.......x.......'), 12))),
      ],
    };
  })();

  // tension: a low pulse that will not settle, ticking blocks, a held erhu line, bell stabs
  SONGS.tension = (() => {
    const pulse = 'e2:2 e2 e2 e2 e2 e2 f2 e2', pulseC = 'c2:2 c2 c2 c2 c2 c2 db2 c2';
    return {
      bpm: 92, bars: 16, tracks: [
        T('bass', 0.5, 0.15, rep(cat(pulse, pulse, pulse, pulseC), 4)),
        T('erhu', 0.42, 0.45, rep('b4:32 | c5:32 | b4:32 | bb4:16 a4:16', 2)),
        T('pad', 0.26, 0.6, rep('e3+b3+f4:64', 4)),
        T('pipa', 0.18, 0.3, rep(grid('x.x.x.x.x.x.x.x.', 'e3'), 16)),
        T('wood', 0.16, 0.1, rep(grid('..x...x...x...xx'), 16)),
        T('drum', 0.32, 0.2, rep(grid('X.......X.......'), 16)),
        T('bell', 0.18, 0.8, rep('-:48 | -:12 f6:4', 4)),
        T('gong', 0.18, 0.7, rep('x:128', 2)),
      ],
    };
  })();

  // 夜玄's theme: a lullaby for a drowned daughter, gone wrong — tender, tragic (3/4, C minor)
  SONGS.villain = (() => {
    const progA = 'Am Am F F Dm E Am Am', progB = 'F C Dm Am F Dm E E';
    const prog = progA + ' ' + progB + ' ' + progA;
    const A = 'e5:6 d5:2 c5:4 | b4:4 c5:4 a4:4 | a4:6 c5:2 f5:4 | e5:12 | d5:6 e5:2 f5:4 | e5:6 d5:2 b4:4 | c5:4 b4:4 a4:4 | a4:12';
    const B = 'c6:6 b5:2 a5:4 | g5:6 e5:2 c5:4 | f5:6 e5:2 d5:4 | e5:8 c5:4 | a5:6 g5:2 f5:4 | f5:4 e5:4 d5:4 | e5:4 g#5:4 b5:4 | d6:6 c6:2 b5:4';
    const counter = 'a4:12 | e4:12 | f4:12 | g4:12 | a4:12 | g#4:12 | a4:12 | e4:12';
    return {
      bpm: 72, bar: 12, bars: 24, tracks: [
        T('erhu', 0.56, 0.5, cat(A, B, counter), { tr: 3 }),
        T('bell', 0.22, 0.8, cat('-:192', A), { tr: 15 }),
        T('zheng', 0.32, 0.55, ch(vz(prog, 3), '0:2 2 3 4 3 2')),
        T('pad', 0.28, 0.65, ch(vp(prog, 3), '*:12')),
        T('bass', 0.4, 0.25, ch(vb(prog, 3), '0:12')),
        T('gong', 0.16, 0.8, rep('x:144', 2)),
      ],
    };
  })();

  // victory: short fanfare (one-shot)
  SONGS.victory = {
    bpm: 132, bars: 3, loop: false, tracks: [
      T('dizi', 0.5, 0.35, 'a4:2 d5:2 f#5:2 a5:2 b5:2 a5:2 d6:4 | b5:2 a5:1 b5:1 d6:2 e6:2 d6:8 | d6:16'),
      T('erhu', 0.45, 0.35, 'a4:2 d5:2 f#5:2 a5:2 b5:2 a5:2 d6:4 | b5:2 a5:1 b5:1 d6:2 e6:2 d6:8 | d6:16', { tr: -12 }),
      T('zheng', 0.36, 0.45, 'd4:1 f#4 a4 d5 f#5 a5 d6 -:9 | a3:1 c#4 e4 a4 c#5 e5 a5 -:9 | d3+a3+d4+f#4+a4+d5:16'),
      T('bass', 0.5, 0.2, 'd2:4 d2:4 a2:4 d2:4 | a2:8 a2:8 | d2:16'),
      T('drum', 0.5, 0.2, grid('X.x.X.x.X.x.X.X. X.x.X.x.X.X.X.X. X...............')),
      T('cymbal', 0.3, 0.4, '-:32 x:16!'),
      T('gong', 0.34, 0.6, '-:32 x:16'),
    ],
  };

  // game over: the last lines of 「渡魂謠」 (前塵如霧隨潮去…又一春), in D minor on the erhu, falling (one-shot)
  SONGS.gameover = {
    bpm: 60, bars: 4, loop: false, tracks: [
      T('erhu', 0.55, 0.6, 'a5:6 c6:2 a5:4 g5:4 | e5:4 g5:2 e5:2 d5:8 | d5:3 e5:1 c5:2 d5:2 a4:8 | -:16', { tr: -7 }),
      T('pad', 0.3, 0.75, 'a3+c4+f4:16 | g3+b3+d4:16 | a3+d4+f4:8 a3+c4+e4:8 | a2+e3+a3:16', { tr: -7 }),
      T('zheng', 0.26, 0.7, 'f3:8 c4:8 | g3:8 d4:8 | d3:8 a3:8 | a2:16', { tr: -7 }),
      T('gong', 0.3, 0.8, 'x:32 | x:32'),
    ],
  };

  // battle: driving drums & blocks, pipa ostinato, doubled erhu/dizi lead (E minor pentatonic)
  SONGS.battle = (() => {
    const prog = 'Am Am F G Am Am F E Dm Dm Am Am F G E E';   // -5 → Em Em C D Em Em C B | Am Am Em Em C D B B
    const A = 'e5:3 e5:1 g5:2 a5:2 b5:4 a5:2 g5:2 | e5:2 d5:2 e5:4 -:4 b4:2 d5:2 | e5:3 e5:1 g5:2 a5:2 b5:2 d6:2 b5:2 a5:2 | a5:6 g5:2 f#5:4 d5:4 |' +
      ' e6:4 d6:2 b5:2 d6:4 b5:2 a5:2 | g5:2 a5:2 b5:4 e5:8 | g5:3 g5:1 e5:2 g5:2 a5:4 c6:4 | b5:4 a5:2 g5:2 f#5:4 d#5:4';
    const B = 'a5:4 c6:4 b5:2 a5:2 e5:4 | a5:2 g5:2 e5:2 d5:2 e5:8 | b5:4 d6:4 b5:2 a5:2 g5:4 | e5:2 d5:2 b4:2 d5:2 e5:8 |' +
      ' g5:2 a5:2 c6:2 e6:2 d6:4 c6:4 | d6:4 c6:2 a5:2 f#5:4 a5:4 | b5:6 a5:2 f#5:4 d#5:4 | b4:2 d#5:2 f#5:2 a5:2 b5:8';
    const B2 = B.split('|').slice(4).join('|');
    return {
      bpm: 152, bars: 16, tracks: [
        T('erhu', 0.48, 0.25, cat(A, B), { leg: 0.85 }),
        T('dizi', 0.4, 0.25, cat(A, '-:64', B2), { leg: 0.8 }),
        T('pipa', 0.3, 0.15, ch(vz(prog, 7), '0:1 0 2 0 1 0 2 0 3 0 2 0 1 0 2 0')),
        T('bass', 0.55, 0.08, ch(vb(prog, -5), '0:2 0:2 1:2 0:2 2:2 0:2 1:2 0:2')),
        T('drum', 0.55, 0.12, rep(grid('X..xX.x.X..xX.xx'), 16)),
        T('wood', 0.2, 0.1, rep(grid('..x...x...x..xx.'), 16)),
        T('cymbal', 0.26, 0.2, rep(cat(grid('X...x.......x...'), grid('....x.......x...'), grid('....x.......x...'), grid('....x.......x.x.')), 4)),
        T('gong', 0.3, 0.4, rep('x:128', 2)),
        T('pad', 0.18, 0.3, ch(vp(prog, -5), '*:16')),
      ],
    };
  })();

  // later-chapter battle: faster, darker (D minor, harmonic), 3+3+2 drive
  SONGS.battle2 = (() => {
    const prog = 'Am F Am G Am F E E F G Am Am F G E E';   // +5 → Dm Bb Dm C Dm Bb A A | Bb C Dm Dm Bb C A A
    const A = 'a4:2 a4:1 a4:1 c5:2 e5:2 d5:3 c5:3 a4:2 | f4:2 a4:2 c5:3 e5:3 d5:2 c5:2 a4:2 | a4:2 a4:1 a4:1 c5:2 e5:2 a5:3 g5:3 e5:2 | g5:4 f5:2 d5:2 b4:4 d5:4 |' +
      ' e5:3 a5:3 e5:2 c5:3 e5:3 a4:2 | f5:3 e5:3 c5:2 a4:3 c5:3 f5:2 | e5:3 g#5:3 b5:2 e5:3 g#5:3 b5:2 | d6:4 c6:2 b5:2 g#5:4 e5:4';
    const B = 'c6:6 b5:2 a5:4 f5:4 | g5:6 f5:2 d5:4 b4:4 | c5:3 e5:3 a5:2 b5:3 c6:3 e6:2 | e6:4 d6:2 c6:2 b5:4 a5:4 |' +
      ' a5:2 g5:2 f5:2 e5:2 f5:4 a5:4 | b5:2 a5:2 g5:2 f5:2 g5:4 b5:4 | g#5:3 b5:3 e6:2 d6:3 b5:3 g#5:2 | e5:8 -:4 b4:4';
    return {
      bpm: 160, bars: 16, tracks: [
        T('erhu', 0.5, 0.25, cat(A, B), { tr: -7, leg: 0.85 }),
        T('dizi', 0.4, 0.25, cat('-:128', B), { tr: 5, leg: 0.8 }),
        T('pipa', 0.3, 0.15, ch(vz(prog, 5), '0:1! 0 1 0! 0 1 0! 1 0! 0 1 0! 0 1 0! 1')),
        T('bass', 0.56, 0.08, ch(vb(prog, -7), '0:3 0:3 1:2 0:3 0:3 2:2')),
        T('drum', 0.55, 0.12, rep(grid('X..x..x.X..x..x.'), 16)),
        T('wood', 0.18, 0.08, rep(grid('x.x.xx.xx.x.xx.x'), 16)),
        T('cymbal', 0.26, 0.2, rep(cat(grid('X.......x.......'), grid('........x.......')), 8)),
        T('gong', 0.3, 0.4, rep('x:128', 2)),
        T('pad', 0.2, 0.3, ch(vp(prog, 5), '*:16'), { tr: -12 }),
      ],
    };
  })();

  // boss: heavy tritone riff, gong strikes, a wide-leaping erhu (F minor)
  SONGS.boss = (() => {
    const R = {
      Am: 'a2:3 a2:3 c3:2 a2:3 eb3:3 d3:2', F: 'f2:3 f2:3 a2:2 f2:3 b2:3 c3:2',
      E: 'e2:3 e2:3 g#2:2 e2:3 f2:3 g#2:2', Dm: 'd2:3 d2:3 f2:2 d2:3 ab2:3 g2:2',
    };
    const progL = 'Am Am F E Am Am F E Dm Dm Am Am F F E E'.split(' ');
    const mel = 'a5:6 g#5:2 a5:4 e5:4 | c6:4 b5:2 a5:2 g#5:4 e5:4 | f5:6 e5:2 f5:4 a5:4 | g#5:4 b5:4 e6:8 |' +
      ' a5:6 g#5:2 a5:4 e5:4 | c6:4 d6:2 e6:2 d6:4 c6:4 | b5:4 a5:2 f5:2 d5:4 b4:4 | e5:12 -:4 |' +
      ' d5:2 f5:2 a5:4 g#5:2 a5:2 f5:4 | d6:6 c6:2 a5:4 f5:4 | e5:2 a5:2 c6:4 b5:2 c6:2 a5:4 | e6:8 c6:4 a5:4 |' +
      ' a5:4 c6:4 f6:4 e6:4 | d6:4 c6:4 b5:4 a5:4 | g#5:4 e5:4 f5:4 g#5:4 | b5:8 g#5:4 e5:4';
    const prog = progL.join(' ');
    return {
      bpm: 138, bars: 16, tracks: [
        T('erhu', 0.52, 0.3, mel, { tr: -4, leg: 0.88 }),
        T('bass', 0.6, 0.08, progL.map((c) => R[c]).join(' | '), { tr: -4 }),
        T('pipa', 0.26, 0.15, progL.map((c) => R[c]).join(' | '), { tr: 8 }),
        T('pad', 0.26, 0.4, ch(vp(prog, -4), '*:16')),
        T('dizi', 0.3, 0.3, cat('-:128', mel.split('|').slice(8).join('|')), { tr: -4 }),
        T('drum', 0.6, 0.12, rep(grid('X..X..X.X..X..X.'), 16)),
        T('wood', 0.18, 0.08, rep(grid('....x.......x.x.'), 16)),
        T('cymbal', 0.28, 0.2, rep(grid('X...............'), 16)),
        T('gong', 0.32, 0.45, rep('x:32', 8)),
      ],
    };
  })();

  // final boss: 夜玄's lullaby turned to storm → a new battle theme → 「渡魂謠」 as a war-cry → its major,
  // hopeful form over the drums (A minor → C major)
  SONGS.final_boss = (() => {
    const p1 = 'Am Am F F Dm E Am Am', p2 = 'F G Am Am F G E E';
    const prog = p1 + ' ' + p2 + ' ' + DUHUN_PROG + ' ' + LOVE_PROG;
    const I = 'e5:6 d5:2 c5:4 b4:2 c5:2 | a4:8 e5:4 a5:4 | a4:6 c5:2 f5:8 | e5:8 -:4 e5:2 f5:2 |' +
      ' d5:6 e5:2 f5:4 a5:4 | e5:6 d5:2 b4:4 g#4:4 | c5:4 b4:4 a4:4 e5:4 | a5:12 -:4';
    const II = 'c6:3 c6:1 a5:2 c6:2 d6:4 c6:4 | b5:3 b5:1 g5:2 b5:2 d6:4 b5:4 | a5:2 c6:2 e6:4 d6:2 c6:2 b5:2 c6:2 | a5:12 -:4 |' +
      ' f5:2 a5:2 c6:2 f6:2 e6:4 c6:4 | d6:2 b5:2 g5:2 b5:2 d6:4 g6:4 | e6:4 d6:2 b5:2 g#5:4 b5:4 | e6:8 g#5:4 b5:4';
    return {
      bpm: 144, bars: 32, tracks: [
        T('erhu', 0.52, 0.3, cat(I, tr(II, -12), DUHUN_COUNTER, tr(LOVE_COUNTER, 12)), { leg: 0.88 }),
        T('dizi', 0.46, 0.3, cat(I.replace(/^.*?\|.*?\|.*?\|.*?\|/, '-:64 |'), II, DUHUN, LOVEM), { leg: 0.85 }),
        T('pipa', 0.26, 0.15, ch(vz(prog), '0:1 0 1 0 2 0 1 0 3 0 1 0 2 0 1 0')),
        T('zheng', 0.26, 0.35, cat('-:256', ch(vz(DUHUN_PROG + ' ' + LOVE_PROG), '0:2 1 2 3 4 3 2 1'))),
        T('bass', 0.56, 0.08, ch(vb(prog), '0:2 0 0 1 0 0 2 1')),
        T('pad', 0.22, 0.4, ch(vp(prog), '*:16')),
        T('drum', 0.56, 0.12, cat(rep(grid('X.x.X.x.X.x.X.xx'), 16), rep(grid('X..xX.x.X..xX.x.'), 16))),
        T('wood', 0.18, 0.08, rep(grid('..x...x...x...xx'), 32)),
        T('cymbal', 0.28, 0.25, cat(rep('x:64', 4), rep('x:32', 8))),
        T('gong', 0.32, 0.45, rep('x:128', 4)),
      ],
    };
  })();

  // ---- regional -------------------------------------------------------------------------------------
  // 客家庄: hill breeze, 山歌-style call (dizi) & answer (erhu) in lilting dotted rhythms (B 羽 / D pentatonic)
  SONGS.hakka = (() => {
    const progA = 'Am G Dm Am Am Em G Am', progB = 'F Am C G F Am C Am';
    const prog = progA + ' ' + progB + ' ' + progA;
    const c1 = 'e5:3 g5:1 a5:2 g5:2 e5:4 d5:2 e5:2 | g5:3 e5:1 d5:2 c5:2 d5:8';
    const r1 = 'a4:3 c5:1 d5:2 e5:2 d5:4 c5:2 a4:2 | c5:3 a4:1 g4:2 e4:2 a4:8';
    const c2 = 'a5:3 a5:1 g5:2 e5:2 g5:4 a5:2 c6:2 | a5:3 g5:1 e5:2 d5:2 e5:8';
    const r2 = 'd5:3 e5:1 g5:2 e5:2 d5:4 c5:2 d5:2 | e5:3 d5:1 c5:2 a4:2 a4:8';
    const dA = cat(c1, '-:32', c2, '-:32'), eA = cat('-:32', r1, '-:32', r2);
    const dB = 'a5:2 c6:2 a5:2 g5:2 e5:8 | -:16 | g5:2 a5:2 g5:2 e5:2 d5:8 | -:16';
    const eB = '-:16 | d5:2 e5:2 d5:2 c5:2 a4:8 | -:16 | c5:2 d5:2 c5:2 a4:2 g4:8';
    const tutti = 'a4:3 c5:1 d5:2 e5:2 g5:4 e5:4 | d5:3 e5:1 d5:2 c5:2 a4:8 | c5:3 d5:1 e5:2 g5:2 a5:4 g5:2 e5:2 | d5:4 c5:2 a4:2 a4:8';
    return {
      bpm: 84, bars: 24, swing: 0.3, tracks: [
        T('dizi', 0.5, 0.45, cat(dA, dB, tr(tutti, 12), dA), { tr: 2 }),
        T('erhu', 0.48, 0.4, cat(eA, eB, tutti, eA), { tr: 2 }),
        T('zheng', 0.3, 0.4, ch(vz(prog, 2), '0:2 2 3 2 4 2 3 2')),
        T('pipa', 0.2, 0.25, ch(vz(prog, 2), '-:4 2+3:2 -:2 -:4 2+3:2 3:2')),
        T('bass', 0.4, 0.2, ch(vb(prog, 2), '0:6 1:2 0:8')),
        T('wood', 0.2, 0.2, rep(grid('x.......x...x...'), 24)),
        T('cymbal', 0.05, 0.9, rep('x:64', 6)),
      ],
    };
  })();

  // 五指山風穴: ghost-wind cave — overlapping howling flutes, groaning erhu, drone with a phrygian rub
  SONGS.wind = (() => {
    const K = { A: 'a2.e3.a3', Bb: 'bb2.f3.bb3', F: 'f2.c3.f3', E: 'e2.b2.e3' };
    const prog = 'A A A Bb A A F E A A Bb A A F E A'.split(' ').map((c) => K[c]).join(' ');
    const d1 = 'e5:16 | f5:8 e5:8 | -:16 | a5:12 bb5:4 | a5:16 | -:16 | g5:8 f5:4 e5:4 | e5:16 |' +
      ' -:16 | c6:16 | b5:8 bb5:8 | a5:16 | -:16 | e5:8 f5:8 | e5:16 | -:16';
    const d2 = '-:32 | ' + d1.split('|').slice(0, 14).join('|');
    return {
      bpm: 76, bars: 16, tracks: [
        T('dizi', 0.42, 0.85, d1),
        T('dizi', 0.3, 0.9, d2, { tr: -5 }),
        T('erhu', 0.4, 0.6, 'a3:16 | bb3:16 | a3:32 | e4:16 | f4:16 | e4:32 | a3:16 | bb3:16 | a3:32 | f4:16 | e4:16 | a3:32'),
        T('pad', 0.32, 0.75, ch(prog, '*:16')),
        T('zheng', 0.2, 0.7, rep('a2:8 -:8 | -:16 | e3:4 bb2:4 -:8 | -:16', 4)),
        T('cymbal', 0.09, 0.9, rep('x:24 -:8', 8)),
        T('drum', 0.26, 0.5, rep(grid('x.........x..... ................'), 8)),
        T('gong', 0.16, 0.8, rep('x:128', 2)),
      ],
    };
  })();

  // 阿里山・玉山: vast, hushed, high — open-fifth pads, mountain-call flute with its own valley echo
  SONGS.mountain = (() => {
    const K = {
      D: 'd3.a3.e4.a4', G: 'g2.d3.a3.d4', Bm: 'b2.f#3.a3.d4', A: 'a2.e3.b3.e4', Em: 'e3.b3.d4.f#4',
    };
    const prog = 'D D G G Bm Bm A A D D G G Em Em A A D D G G A A D D'.split(' ').map((c) => K[c]).join(' ');
    const call = '-:64 | a4:4 d5:4 e5:8 | f#5:12 e5:4 | d5:16 | -:16 | a5:4 b5:4 a5:8 | f#5:8 e5:8 | d5:8 e5:4 f#5:4 | e5:16 |' +
      ' -:16 | b5:6 a5:2 f#5:8 | e5:8 d5:8 | b4:16 | a4:4 d5:4 e5:8 | a5:16 | f#5:8 e5:4 d5:4 | d5:16 | -:64';
    const echo = '-:6 ' + call.replace(/-:64$/, '-:58');
    return {
      bpm: 56, bars: 24, tracks: [
        T('pad', 0.34, 0.85, ch(prog, '*:16')),
        T('pad', 0.26, 0.6, ch(prog, '0:16'), { tr: -12 }),
        T('dizi', 0.44, 0.8, call),
        T('dizi', 0.14, 0.95, echo),
        T('zheng', 0.14, 0.8, ch(prog, '-:8 6:4 7:4')),
        T('bell', 0.1, 0.95, rep('-:16 e6:16 | -:32', 6)),
        T('cymbal', 0.05, 0.9, rep('x:64', 6)),
      ],
    };
  })();

  // 媽祖遶境: 北管-style procession — nasal doubled reed lead with grace notes, 通鼓, 鈔, 大鑼/小鑼, 叩子 (G 徵)
  SONGS.procession = (() => {
    const progA = 'C C F G C Am G C', progB = 'F G Am G F C Dm G';   // +7
    const prog = progA + ' ' + progB + ' ' + progA;
    const A = 'd5:2 g5:2 a5:0.5 g5:1.5 e5:2 d5:4 b4:2 d5:2 | e5:2 d5:2 b4:2 a4:2 g4:4 a4:2 b4:2 | e5:0.5 d5:3.5 e5:2 g5:2 a5:4 g5:2 e5:2 | d5:2 e5:2 d5:2 b4:2 a4:8 |' +
      ' b4:2 d5:2 e5:2 g5:2 a5:0.5 b5:3.5 a5:2 g5:2 | e5:2 g5:2 e5:2 d5:2 b4:4 d5:4 | a4:2 b4:2 d5:2 e5:2 d5:2 b4:2 a4:2 b4:2 | g4:12 d5:2 e5:2';
    const B = 'g5:4 a5:2 g5:2 e5:4 g5:4 | a5:0.5 b5:3.5 a5:2 g5:2 a5:8 | b5:2 a5:2 g5:2 e5:2 d5:2 e5:2 g5:4 | a5:12 -:4 |' +
      ' e5:2 g5:2 a5:2 g5:2 e5:2 d5:2 e5:4 | d5:2 b4:2 d5:2 e5:2 g5:8 | a5:2 g5:2 e5:2 g5:2 a5:4 b5:2 a5:2 | a5:2 g5:2 e5:2 d5:2 d5:8';
    const mel = cat(A, B, A);
    const drums = cat(rep(grid('X.x.X.xxX.x.X.x.'), 7), grid('X.x.X.x.xxxxXXXX'));
    return {
      bpm: 126, bars: 24, tracks: [
        T('erhu', 0.56, 0.2, mel, { leg: 0.9 }),
        T('dizi', 0.4, 0.2, mel, { leg: 0.85 }),
        T('erhu', 0.26, 0.2, mel, { tr: -12, leg: 0.9 }),
        T('bass', 0.36, 0.1, ch(vb(prog, 7), '0:4 1:4 0:4 1:4')),
        T('drum', 0.58, 0.15, rep(drums, 3)),
        T('cymbal', 0.3, 0.2, rep(grid('X...x...X...x...'), 24)),
        T('wood', 0.22, 0.1, rep(grid('x.x.x.x.x.x.x.x.'), 24)),
        T('bell', 0.12, 0.4, rep(grid('....x.......x...', 'e6'), 24)),
        T('gong', 0.34, 0.45, rep('x:32', 12)),
      ],
    };
  })();

  // 恆春: 月琴 (pipa) folk feel — tremolo licks, a singing erhu, the 落山風 brushing past (G 徵)
  SONGS.south = (() => {
    const pi = 'C G Am G', pA = 'C G Am G F C Dm G';
    const prog = pi + ' ' + pA + ' ' + pi + ' ' + pA;
    const lick = 'd5:1 d5 d5 d5 b4:2 d5:2 e5:2 g5:2 e5:2 d5:2 | e5:1 e5 e5 e5 d5:2 b4:2 a4:4 -:4 |' +
      ' g4:2 a4:2 b4:2 d5:2 e5:1 e5 e5 e5 d5:2 b4:2 | a4:1 a4 a4 a4 a4 a4 a4 a4 -:8';
    const sing = 'd5:6 e5:2 g5:4 e5:4 | d5:4 b4:2 a4:2 b4:8 | b4:4 d5:2 e5:2 g5:6 e5:2 | d5:12 -:4 |' +
      ' e5:6 g5:2 a5:4 g5:4 | g5:4 e5:2 d5:2 b4:8 | a4:4 b4:2 d5:2 e5:4 g5:2 e5:2 | d5:12 -:4';
    return {
      bpm: 84, bars: 24, swing: 0.36, tracks: [
        T('pipa', 0.5, 0.3, cat(lick, '-:128', lick, '-:128')),
        T('erhu', 0.52, 0.45, cat('-:64', sing, '-:64', sing)),
        T('pipa', 0.26, 0.3, cat('-:320', sing.split('|').slice(4).join('|'))),
        T('zheng', 0.22, 0.35, ch(vz(prog, 7), '0:4 2+3+4:2 -:2 0:4 2+3+4:2 -:2')),
        T('bass', 0.38, 0.2, ch(vb(prog, 7), '0:6 1:2 0:8')),
        T('wood', 0.14, 0.2, rep(grid('x.......x.......'), 24)),
        T('cymbal', 0.06, 0.9, rep('x:48 -:16', 6)),
      ],
    };
  })();

  // 王船 at sea: hopeful 6/8 with wind in the sails (A major pentatonic)
  SONGS.voyage = (() => {
    const progA = 'C C F G C Am F G', progB = 'Am Em F C Am Em F G', progA2 = 'C C F G C Am G C';
    const prog = progA + ' ' + progB + ' ' + progA2;
    const A6 = 'g4:2 c5:2 d5:2 e5:4 g5:2 | g5:6 e5:6 | a5:4 g5:2 e5:4 d5:2 | d5:6 b4:4 d5:2 | e5:4 g5:2 c6:4 a5:2 | a5:6 g5:4 e5:2';
    const A = cat(A6, 'c6:4 a5:2 g5:4 e5:2 | d5:12');
    const A2 = cat(A6, 'b5:4 a5:2 g5:4 d5:2 | c5:12');
    const B = 'e5:6 a5:6 | g5:4 e5:2 b4:6 | a4:4 c5:2 f5:6 | e5:12 | c5:4 e5:2 a5:4 c6:2 | b5:6 g5:6 | a5:4 g5:2 f5:4 e5:2 | d5:8 g4:4';
    return {
      bpm: 100, bar: 12, bars: 24, tracks: [
        T('dizi', 0.5, 0.45, cat(A, '-:96', A2), { tr: -3 }),
        T('erhu', 0.48, 0.4, cat('-:96', B, A2), { tr: -3 }),
        T('zheng', 0.3, 0.45, ch(vz(prog, -3), '0:2 1 2 3 2 1')),
        T('pad', 0.24, 0.6, ch(vp(prog, -3), '*:12')),
        T('bass', 0.42, 0.2, ch(vb(prog, -3), '0:6 1:6')),
        T('drum', 0.34, 0.25, rep(grid('X.....x.....'), 24)),
        T('wood', 0.14, 0.2, rep(grid('...x.....x..'), 24)),
        T('cymbal', 0.06, 0.9, rep('x:24', 12)),
      ],
    };
  })();

  // 蘭嶼: open ocean, bright and wide (E major pentatonic) — rippling zheng, sea-bird dizi, wave swells
  SONGS.orchid = (() => {
    const progA = 'C F C G Am G F C', progB = 'F G Em Am F G C C';
    const prog = progA + ' ' + progB + ' ' + progA;
    const A = 'c5:2 g5:2 c6:6 d6:2 c6:2 g5:2 | a5:8 c6:4 a5:4 | g5:4 e5:4 g5:4 c6:4 | d6:12 -:4 |' +
      ' e6:4 d6:2 c6:2 a5:8 | g5:4 a5:2 g5:2 d5:8 | c5:2 d5:2 e5:2 g5:2 a5:4 g5:4 | g5:12 -:4';
    const B = 'a5:6 g5:2 a5:4 c6:4 | d6:6 c6:2 d6:4 g6:4 | e6:8 d6:4 b5:4 | c6:12 -:4 |' +
      ' a5:4 c6:2 d6:2 e6:4 d6:4 | d6:4 c6:2 a5:2 g5:8 | e5:4 g5:2 a5:2 c6:4 d6:4 | c6:12 -:4';
    return {
      bpm: 104, bars: 24, tracks: [
        T('dizi', 0.5, 0.5, cat(A, B, A), { tr: -8 }),
        T('erhu', 0.36, 0.4, cat('-:128', B, '-:128'), { tr: -8 }),
        T('zheng', 0.26, 0.45, ch(vz(prog, 4), '0:1 2 4 2 1 3 4 3 0 2 4 2 1 3 4 3')),
        T('pad', 0.3, 0.7, ch(vp(prog, 4), '*:16')),
        T('bass', 0.42, 0.2, ch(vb(prog, 4), '0:4 1:4 2:4 1:4')),
        T('bell', 0.14, 0.85, ch(vz(prog, 4), '-:4 12:4 -:4 14:4')),
        T('drum', 0.26, 0.25, rep(grid('x.......x..x....'), 24)),
        T('cymbal', 0.07, 0.85, rep('x:32', 12)),
      ],
    };
  })();

  // 太魯閣: the great marble gorge — broad octave theme, big drums and gong (D minor)
  SONGS.taroko = (() => {
    const progA = 'Am Am F G Am Em F G', progB = 'C G Am Em F C Dm E', progA2 = 'Am Am F G Am Em F Am';
    const prog = progA + ' ' + progB + ' ' + progA2;
    const A7 = 'a4:8 e5:8 | g5:6 e5:2 d5:4 e5:4 | c5:8 a4:4 c5:4 | d5:12 g4:4 | a4:4 c5:4 e5:4 a5:4 | g5:8 e5:4 d5:4 | c5:4 d5:4 e5:4 g5:4';
    const B = 'e5:6 g5:2 c6:8 | b5:6 a5:2 g5:8 | a5:6 g5:2 e5:4 c5:4 | b4:8 e5:8 | a5:6 c6:2 a5:4 f5:4 | g5:6 e5:2 c5:8 | d5:4 f5:4 a5:4 d6:4 | e6:8 b5:4 g#5:4';
    const mel = cat(A7, 'g5:8 d5:8', B, A7, 'a5:12 -:4');
    return {
      bpm: 80, bars: 24, tracks: [
        T('dizi', 0.48, 0.5, mel, { tr: 5 }),
        T('erhu', 0.52, 0.45, mel, { tr: -7 }),
        T('zheng', 0.3, 0.5, ch(vz(prog, 5), '0:2 1 2 3 4 5 6 7')),
        T('pad', 0.3, 0.6, ch(vp(prog, 5), '*:16'), { tr: -12 }),
        T('bass', 0.5, 0.2, ch(vb(prog, 5), '0:8 1:8'), { tr: -12 }),
        T('drum', 0.56, 0.35, cat(rep(grid('X.......x...x...'), 8), rep(grid('X...x...X...x.x.'), 8), rep(grid('X.......x...x...'), 8))),
        T('gong', 0.32, 0.6, rep('x:64', 6)),
        T('cymbal', 0.16, 0.6, cat('-:128', 'x:32 -:96', '-:128')),
      ],
    };
  })();

  // 頭城搶孤: ghost-month climax — tense minor, a blazing major chorus, then the pole-climb (E minor ↔ G)
  SONGS.toucheng = (() => {
    const K = {
      Em: 'e2.b2.e3.g3.b3', D: 'd2.a2.d3.f#3.a3', C: 'c3.g3.c4.e4.g4', B: 'b1.f#2.b2.d#3.f#3', G: 'g2.d3.g3.b3.d4',
      F: 'f2.c3.f3.a3.c4', A: 'a2.e3.a3.c#4.e4',
    };
    const prog = 'Em Em D D C C B B G G C D G Em C D Em Em F F G G A B'.split(' ').map((c) => K[c]).join(' ');
    const A = 'e5:2 e5:1 g5:1 b5:4 a5:0.5 g5:1.5 e5:2 g5:4 | a5:2 g5:2 e5:2 d5:2 e5:8 | d5:2 d5:1 f#5:1 a5:4 g5:0.5 f#5:1.5 d5:2 f#5:4 | g5:2 f#5:2 d5:2 a4:2 d5:8 |' +
      ' c5:2 e5:2 g5:2 c6:2 b5:2 g5:2 e5:4 | e5:0.5 g5:3.5 e5:2 c5:2 e5:8 | b4:2 d#5:2 f#5:2 b5:2 a5:2 f#5:2 d#5:4 | b5:4 a5:4 f#5:4 d#5:4';
    const B = 'g5:2 g5:2 a5:2 b5:2 d6:4 b5:4 | a5:2 g5:2 e5:2 g5:2 d5:8 | e5:2 g5:2 a5:2 g5:2 e5:2 d5:2 e5:4 | a5:0.5 b5:3.5 a5:4 d5:8 |' +
      ' g5:2 b5:2 d6:4 e6:2 d6:2 b5:4 | e6:4 d6:2 b5:2 g5:4 e5:4 | e5:2 g5:2 a5:2 b5:2 a5:2 g5:2 e5:4 | d5:2 e5:2 g5:2 a5:2 d6:8';
    const C = 'e5:2 g5:2 a5:2 b5:2 a5:2 g5:2 e5:4 | e5:2 g5:2 a5:2 b5:2 d6:4 b5:4 | f5:2 g#5:2 a#5:2 c6:2 a#5:2 g#5:2 f5:4 | f5:2 g#5:2 a#5:2 c6:2 d#6:4 c6:4 |' +
      ' g5:2 b5:2 d6:2 e6:2 d6:2 b5:2 g5:4 | g5:2 b5:2 d6:2 e6:2 g6:4 e6:4 | e6:4 c#6:4 a5:4 e5:4 | f#5:2 b5:2 d#6:2 f#6:2 b5:8';
    const mel = cat(A, B, C);
    return {
      bpm: 138, bars: 24, tracks: [
        T('erhu', 0.54, 0.2, mel, { leg: 0.88 }),
        T('dizi', 0.4, 0.2, mel, { leg: 0.82 }),
        T('pipa', 0.26, 0.15, ch(prog, '0:2 2 3 4 3 2 3 4')),
        T('bass', 0.52, 0.08, ch(prog, '0:2 0 1 0 2 0 1 0')),
        T('drum', 0.56, 0.12, cat(rep(grid('X.x.X.xxX.x.X.x.'), 8), rep(grid('X.xxX.x.X.xxX.x.'), 8), rep(grid('X.x.X.x.X.x.X.x.'), 6), grid('XxxxXxxxXxXxXXXX'), grid('XXXXXXXXXXXXXXXX'))),
        T('wood', 0.2, 0.08, rep(grid('x.xxx.xxx.xxx.xx'), 24)),
        T('cymbal', 0.28, 0.2, cat(rep(grid('X...x.......x...'), 8), rep(grid('X.......X.......'), 8), rep(grid('X...X...X...X...'), 8))),
        T('gong', 0.34, 0.45, cat(rep('x:32', 8), rep('x:16', 8))),
      ],
    };
  })();

  // 澎湖: windswept basalt islands — open fifths, long dizi tones, a pipa folk line, salt wind (E 羽)
  SONGS.penghu = (() => {
    const K = {
      E: 'e2.b2.e3.b3', D: 'd2.a2.d3.a3', C: 'c2.g2.c3.g3', G: 'g2.d3.g3.d4', A: 'a2.e3.a3.e4',
    };
    const prog = 'E E D D C C D D E G A A C D E E E E D D C D E E'.split(' ').map((c) => K[c]).join(' ');
    const A = 'b4:8 e5:8 | d5:4 e5:4 g5:8 | a5:12 g5:4 | e5:8 d5:8 | e5:8 g5:4 e5:4 | d5:4 b4:4 g4:8 | a4:8 b4:4 d5:4 | e5:16';
    const pB = 'e5:2 g5:2 a5:2 b5:2 a5:4 g5:2 e5:2 | d5:2 e5:2 g5:4 b4:4 d5:4 | e5:2 a5:2 b5:2 a5:2 e5:4 d5:4 | b4:2 d5:2 e5:4 a4:8 |' +
      ' g4:2 a4:2 b4:2 d5:2 e5:4 g5:4 | a5:4 g5:2 e5:2 d5:8 | e5:2 d5:2 b4:2 a4:2 b4:4 d5:4 | e5:12 -:4';
    return {
      bpm: 72, bars: 24, tracks: [
        T('dizi', 0.48, 0.65, cat(A, 'b5:16 | d6:16 | e6:16 | a5:16 | g5:16 | a5:16 | b5:16 | e5:16', A)),
        T('pipa', 0.42, 0.35, cat('-:128', pB, '-:128')),
        T('erhu', 0.36, 0.5, cat('-:256', 'e4:16 | b4:16 | d5:16 | a4:16 | g4:16 | e4:16 | d4:16 | b4:16')),
        T('pad', 0.3, 0.7, ch(prog, '*:16')),
        T('zheng', 0.22, 0.5, ch(prog, '0:4 1:4 2:4 3:4')),
        T('drum', 0.24, 0.35, rep(grid('x.......x.......'), 24)),
        T('cymbal', 0.07, 0.9, rep('x:32', 12)),
      ],
    };
  })();

  // loudness trims (measured RMS on the music bus; keeps exploration ≈ battle − 3 dB, cues under the master compressor)
  const TRIM = {
    battle: 0.7, battle2: 0.74, boss: 0.8, final_boss: 0.78, chaos: 0.78, toucheng: 0.74, victory: 0.78,
    festival: 0.85, procession: 0.85, taroko: 0.88, tension: 0.9, tribe: 0.9,
    night: 1.25, mine: 1.2, south: 1.3, mansion: 1.15, palace: 1.15, temple: 1.1, shrine: 1.1,
  };
  for (const k in TRIM) SONGS[k].gain = TRIM[k];

  // ---------------------------------------------------------------------------------- compile
  const PERC = { drum: 1, wood: 1, cymbal: 1, gong: 1 };
  const LEG = { dizi: 0.9, erhu: 0.94, voice: 0.97, pad: 1.0, bass: 0.85, bell: 1, zheng: 1, pipa: 1 };
  // 滑音: a bowed / sung note slides in from the previous one when the line is connected and the interval is a
  // leap (erhu: up a minor third or more, down a fourth or more; voice: any leap up to a sixth) — not on short notes
  const SLIDE = { erhu: (iv) => iv >= 3 ? iv <= 7 : iv <= -5 && iv >= -7, voice: (iv) => Math.abs(iv) >= 2 && Math.abs(iv) <= 9 };
  const compiled = {};
  function compile(id) {
    if (compiled[id]) return compiled[id];
    const s = SONGS[id];
    const bar = s.bar || 16;
    const total = s.bars * bar;
    const step = 60 / s.bpm / 4;
    const ev = [];
    s.tracks.forEach((t, ti) => {
      const p = parse(t.n);
      if (Math.abs(p.len - total) > 1e-6) throw new Error('song ' + id + ' track ' + ti + ' (' + t.i + ') is ' + p.len + ' steps, expected ' + total);
      const leg = t.leg || LEG[t.i] || 0.92;
      let prev = null;
      for (const e of p.ev) {
        let d = e.l * step;
        if (t.i === 'zheng') d = d < 0.5 ? 0.6 : 1.4;          // keeps G.Audio's string-buffer cache small
        else if (t.i === 'pipa') d = d < 0.35 ? 0.4 : 1.0;
        else if (!PERC[t.i]) d *= leg;
        let x;
        if (SLIDE[t.i] && prev && e.m.length === 1 && prev.m.length === 1 && e.s - (prev.s + prev.l) <= 0.5 && d >= 0.25 &&
          SLIDE[t.i](e.m[0] - prev.m[0])) x = { from: prev.m[0] + (t.tr || 0) };
        prev = e;
        ev.push({
          s: e.s, d, inst: t.i, vol: (t.v == null ? 0.5 : t.v) * e.a, rev: t.r == null ? 0.4 : t.r,
          m: e.m.map((v) => (v ? v + (t.tr || 0) : 0)), perc: !!PERC[t.i], x,
        });
      }
    });
    ev.sort((a, b) => a.s - b.s);
    // swing (fraction of a 16th): delays 8th off-beats by swing, 16th off-beats by half of it
    return (compiled[id] = { id, ev, len: total, step, swing: (s.swing || 0) * step, gain: s.gain || 1, loop: s.loop !== false });
  }

  // ---------------------------------------------------------------------------------- playback
  // Each song instance has its own dry/wet GainNodes (faders for crossfades); notes are routed into them
  // through G.Audio.playNote's optional output-node arguments.
  let revSend = null, probed = false;
  function probe() { probed = true; revSend = G.Audio.reverbInput ? G.Audio.reverbInput() : null; }

  const stats = { scheduled: 0, songs: 0 };
  let live = [];        // playing / fading song instances
  let current = null, pending = null, timer = null;

  function ctxReady() {
    const ac = G.Audio && G.Audio.ctx;
    return ac && ac.state === 'running' && G.Audio.musicBus() ? ac : null;
  }

  function start(id, opts) {
    const ac = ctxReady();
    const c = compile(id);
    if (!probed) probe();
    const bus = G.Audio.musicBus();
    const fade = opts.fade == null ? 1.0 : Math.max(0, opts.fade);
    const now = ac.currentTime;
    const dry = ac.createGain(), wet = ac.createGain();
    dry.connect(bus);
    if (revSend) wet.connect(revSend);
    for (const g of [dry, wet]) {
      if (fade > 0.01) { g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(c.gain, now + fade); }
      else g.gain.value = c.gain;
    }
    const inst = {
      id, c, dry, wet, idx: 0, t0: now + 0.08, loop: opts.loop == null ? c.loop : !!opts.loop,
      end: Infinity, done: false, kill: Infinity,
    };
    live.push(inst);
    stats.songs++;
    return inst;
  }

  function fadeOut(inst, fade) {
    const ac = G.Audio.ctx, now = ac.currentTime;
    fade = Math.max(0.02, fade);
    for (const g of [inst.dry, inst.wet]) {
      const p = g.gain;
      const v = p.value;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else p.cancelScheduledValues(now);
      p.setValueAtTime(Math.max(0.0001, v), now);
      p.linearRampToValueAtTime(0.0001, now + fade);
    }
    inst.fading = true;
    inst.end = Math.min(inst.end, now + fade);
    inst.kill = Math.min(inst.kill, now + fade + 4.5);
  }

  function note(ac, inst, e, t) {
    const humanT = e.perc ? 0.003 : 0.008;
    const tt = Math.max(ac.currentTime, t + (Math.random() - 0.5) * humanT);
    const vol = e.vol * (0.94 + Math.random() * 0.12);
    const bus = G.Audio.musicBus();
    for (const midi of e.m) {
      G.Audio.playNote(e.inst, tt, midi, e.d, vol, e.rev, inst.dry, revSend ? inst.wet : undefined, e.x);
      stats.scheduled++;
    }
  }

  function pump(ac, inst, horizon) {
    const { c } = inst;
    const loopDur = c.len * c.step;
    if (!c.ev.length) return;
    // fell far behind (tab throttled / context hiccup): skip forward instead of bursting notes
    const now = ac.currentTime;
    if (inst.loop && inst.t0 + loopDur < now - 0.1) {
      const k = Math.floor((now - inst.t0) / loopDur);
      inst.t0 += k * loopDur; inst.idx = 0;
    }
    let guard = 0;
    while (!inst.done && guard++ < 512) {
      const e = c.ev[inst.idx];
      let t = inst.t0 + e.s * c.step;
      if (c.swing) { const q = e.s % 4; if (q === 2) t += c.swing; else if (q === 1 || q === 3) t += c.swing * 0.5; }
      if (t > horizon || t >= inst.end) break;
      if (t >= now - 0.03) note(ac, inst, e, t);
      if (++inst.idx >= c.ev.length) {
        inst.idx = 0;
        if (inst.loop) inst.t0 += loopDur;
        else {
          inst.done = true;
          const tailEnd = inst.t0 + loopDur;
          inst.end = Math.min(inst.end, tailEnd);
          inst.kill = Math.min(inst.kill, tailEnd + 4.5);
          inst.finishAt = tailEnd;
        }
      }
    }
  }

  function tick() {
    const ac = ctxReady();
    if (!ac) return;
    if (pending) { const p = pending; pending = null; doPlay(p.id, p.opts); }
    const now = ac.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const horizon = now + (hidden ? 1.5 : 0.18);
    live = live.filter((inst) => {
      if (now > inst.kill) {
        try { inst.dry.disconnect(); inst.wet.disconnect(); } catch (e) { /* ignore */ }
        return false;
      }
      if (inst.finishAt && now > inst.finishAt + 0.5 && current === inst.id && live.indexOf(inst) === live.length - 1) current = null;
      pump(ac, inst, horizon);
      return true;
    });
  }

  function ensureTimer() {
    if (!timer) timer = setInterval(tick, 25);
  }

  function doPlay(id, opts) {
    for (const inst of live) if (!inst.fading) fadeOut(inst, opts.fade == null ? 1.0 : opts.fade);
    start(id, opts);
    current = id;
    tick();
  }

  function play(id, opts = {}) {
    if (!SONGS[id]) { console.warn('[Music] unknown song id', id); return; }
    ensureTimer();
    const top = live[live.length - 1];
    if (current === id && top && top.id === id && !top.fading && !top.done) { pending = null; return; }
    if (!ctxReady()) { pending = { id, opts }; current = id; return; }
    doPlay(id, opts);
  }

  function stop(fade = 1.0) {
    pending = null;
    current = null;
    if (!G.Audio || !G.Audio.ctx) return;
    for (const inst of live) if (!inst.fading) fadeOut(inst, fade);
  }

  return {
    play, stop,
    get current() { return current; },
    ids: () => Object.keys(SONGS),
    // for tools / tests
    songs: SONGS, parse, compile, stats, debugLive: () => live.map((i) => i.id + (i.fading ? '(fading)' : '')),
    // the shared melodic material (chapter scripts play 渡魂謠 on a lone flute from these)
    themes: { motif: MOTIF, duhun: DUHUN, duhunChords: DUHUN_CH, duhunProg: DUHUN_PROG, title: TITLE_A, lovem: LOVEM },
    helpers: { rep, cat, tr, grid, ch },
  };
})();
