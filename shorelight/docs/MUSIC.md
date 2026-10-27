# 彼岸燈 Shorelight: music notes

The score is sequenced Web Audio. `js/core/music.js` holds the `SONGS` table and the sequencer (`G.Music`), and
`js/core/audio.js` holds the instruments (`G.Audio`). Each song is a small text score that the browser plays live,
so the game has no audio files. This document covers the four signature themes and the motif that ties them
together, plus how to audition and measure them.

Song ids and the `G.Music.play(id, { fade, loop })` API are unchanged. One song was added (`duhun`), and four scene
calls were switched to it (see [Where each theme plays](#where-each-theme-plays)).

## Jianpu conventions

Pitches are written in 簡譜 with **1 = C** unless a section says otherwise (A 羽 = 6 1 2 3 5 with 6 as the tonic).

| mark | meaning |
|---|---|
| `6̣` / `1̇` | dot below = octave down, dot above = octave up |
| `6` | one beat (a quarter note) |
| `—` | hold one more beat |
| `6·` | dotted |
| `2̲1̲` | underlined = eighth notes |
| `3̳` | double underline = sixteenth note |
| `|` | bar line |

The engine notation, for example `a4:4 e5:4 a5:8` (pitch:length in 16ths), is the source of truth. It is quoted
next to each phrase.

---

## The 燈 motif (the leitmotif)

```
A 羽 form (wistful)          6̣  3  6  —  |  5̲·3̳  2  3  —
                             a4:4 e5:4 a5:8 | g5:3 e5:1 d5:4 e5:8          (MOTIF in music.js)

宮 form (hopeful / 千燈)      1  5  1̇  —  |  6̲·5̳  3  5  —
                             c5:4 g5:4 c6:8 | a5:3 g5:1 e5:4 g5:8
```

* **Bar 1** lifts a lantern in two open leaps, a fifth and then a fourth (6̣→3→6). Together they climb an octave
  of open, quartal sound that reads as Chinese and Taiwanese at once.
* **Bar 2** sets the lantern drifting. It is a dotted fall (5·3) with one wave back up (2→3).
* The **宮 form** is the same contour one pentatonic degree higher (6̣→1, 3→5, 6→1̇). The same gesture becomes
  bright, so the ending pays off the title by changing mode rather than changing tune.
* **Inversion**: in 白芷's theme the motif appears upside down (3̇ 6 3, falling a fifth and then a fourth), like
  its reflection on the water.

Where the motif appears:

| song | how |
|---|---|
| `title` | opens the melody, then climbs in sequence (6̣3 6 → 1 5 1̇ → 2 6 2̇); bells ring it in the intro |
| `duhun` (渡魂謠) | the first line, 「燈一盞，渡一人」; the interlude bells |
| `love` (白芷) | opens in the 宮 form; inverted in B; bells ring the 宮 form at phrase ends |
| `ending` (千燈) | prelude (渡魂謠 on zheng), title melody, 渡魂謠 in 宮 form, and a coda that is the 宮 motif itself |
| `dream` | bells (bars 1–4), then the flute half-remembers it (bars 9–10) |
| `sad`, `lighthouse`, `final_boss`, `credits`, `gameover` | through the shared 渡魂謠 / 宮-form constants |
| `shrine` | bells in E 羽 |
| `farshore` | the erhu recalls it in 3/4, first in 羽 and then in 宮 |
| prologue / ch1 lone-flute lullaby | `G.Music.themes.duhun`; ch1's one-bar quote is just bar 1 (6̣ 3 6) |

---

## 1. Title theme「彼岸燈」(`title`)

*Lanterns on the night sea: wistful, then hopeful.* A 羽 ↔ C 宮, ♩ = 72, 4/4, 28 bars (93.3 s loop).

| section | bars | harmony | what happens |
|---|---|---|---|
| intro | 4 | Am9 F G Esus | sea pad; **bells ring the motif** (a5 e6 a6 / g6 e6 d6 e6); zheng rises in slow quarters; a soft gong marks the loop point |
| A | 8 | F G Am C Dm F Am Em | **dizi alone**: the title melody; harp-like zheng (quarter-eighth pattern); bass on roots |
| B | 8 | F G Em Am Dm G C G | **hopeful turn to C 宮**: dizi high, erhu counter-line in long notes, a soft heartbeat drum, cymbal wash |
| A' | 8 | F G Am C Dm F Am Dm | melody returns over the erhu; **bells double each rising lantern** (a5→a6, c6→c7, d6→d7); cadence borrowed from 渡魂謠, falling into the intro |

**A melody (dizi):**

```
| 6̣  3  6  —  | 5̲·3̳  2  3  —  | 1  5  1̇  —  | 6̲·5̳  3  5  —  |
| 2  6  2̇  —  | 1̲̇·6̳  5  6  —  | 3̇·  2̲̇  1̇  6 | 5̲·6̳  5̲3̲  2̲  3· |
  (bar 5: a quick 3̇ grace into 2̇)
```

The motif climbs in sequence, one lantern after another, 6̣3 6 → 1 5 1̇ → 2 6 2̇. It crests on 3̇ and settles on
the motif's tail. In A', bar 8 becomes `2̲·3̳ 1̲2̲ 6̣ —`, the closing cadence of 渡魂謠.

**B melody (dizi), with the erhu below in long notes:**

```
| 1̇  —  6  5  | 2̇  —  1̲̇6̲  5 | 3·  5̲  6  5 | 3  —  1  2 |
| 2  3  6  1̇  | 2̇·  3̲̇  2̇  1̲̇6̲ | 3̇  —  —  2̲̇1̲̇ | 6  5  3  2 |
```

**Instrumentation:** dizi lead; erhu counter-line (B, A'); zheng arpeggios; pad; triangle bass; bells; light drum
from B on; cymbal washes; one gong at the loop point.

---

## 2. 白芷's theme (`love`)

*Dreamy, gentle, a little otherworldly; her jade 笛子.* Her theme is also the love theme, so it keeps the id
`love`. D 宮, ♩ = 66, **3/4**, 32 bars (87.3 s loop). The score is written in C and transposed +2.

| section | bars | harmony (in C) | what happens |
|---|---|---|---|
| A | 8 | C Am F G C Em F G | the motif's 宮 form opens her melody; zheng ripples in rolling eighths (0 2 4 8va 4 2) |
| A' | 8 | C Am F Am Dm G C C | higher (a grace into 1̇ 2̇ 1̇), closes on 1; bells ring 1 5 1̇ in the breath bar |
| B | 8 | **Am F C G F Fm C G** | the far shore: **motif inverted** (3̇ 6 3); a **hummed voice** sinks c → b → a → **a♭** → g; the minor iv (Fm, a♭ in the flute) is the otherworldly turn; the zheng thins out; one cymbal shimmer |
| A'' | 8 | C Am F Am Dm G C C | A' as a **duet**: the erhu follows the flute **one bar behind, an octave down** (a pentatonic canon) |

**A (dizi, 1 = D):**

```
| 1  5  1̇ | 6̲·5̳  3̲  5· | 6·  1̲̇  6 | 5  —  3̲2̲ | 3  5  6 | 5·  3̲  2 | 1  2̲3̲  5 | 2  —  — |
```

**B (dizi):**

```
| 3̇  6  3 | 5̲·6̳  1̲̇  6· | 2̇  5  2 | 3̲·5̳  6̲  5· | 6  —  1̲̇2̲̇ | 1̇·  ♭6̲  5 | 3·  2̲  1̲2̲ | 5  —  — |
```

**Instrumentation:** dizi lead (reverb send 0.7); erhu canon in A''; voice ("oo") inner line in B; zheng; pad; soft
bass; bells; no drums.

---

## 3. 渡魂謠 Song of Crossing (`duhun`, plus the shared `DUHUN` melody)

*The lullaby 白芷 sings.* A 羽, ♩ = 60, 4/4. One verse is 8 bars, two bars per lyric line in 起承轉合 form. The
melody sets the verse from the prologue (docs/story/ch0_prologue.md §6). The later verses, 「燈兩盞，渡兩人…」
(ch1), 「燈三盞，渡三人…」 (ch11 tower 5F) and the 千燈之段 (credits), use the same tune.

```
燈 一 盞，      渡 一 人，        | 6̣  3  6  —  | 5̲·3̳  2  3  —  |   起  the motif
黑 水 茫 茫     莫 回 身；        | 1  2̲1̲  6̣  5̣ | 6̣  1̲2̲  3  —  |   承  sinks into the black water, rises to 3
前 塵 如 霧     隨 潮 去，        | 6·  1̲̇  6  5 | 3  5̲3̲  2  —  |   轉  the high line (1̇ is the top note)
彼 岸 花 開     又 一 春。        | 6̣  3  6  5̲3̲ | 2̲·3̳  1̲2̲  6̣  — |   合  motif returns, 2 1 2 6̣ cadence
```

Engine notation (`DUHUN`):
`a4:4 e5:4 a5:8 | g5:3 e5:1 d5:4 e5:8 | c5:4 d5:2 c5:2 a4:4 g4:4 | a4:4 c5:2 d5:2 e5:8 | a5:6 c6:2 a5:4 g5:4 | e5:4 g5:2 e5:2 d5:8 | a4:4 e5:4 a5:4 g5:2 e5:2 | d5:3 e5:1 c5:2 d5:2 a4:8`

Harmony: Am Em F Am | F G Am Dm. The plagal Dm → Am closes each verse; the prologue's lone-flute version ends on
an open A-sus instead.

**宮 form** (`LOVEM`; the hope / 千燈 verse, used in `ending`, `credits`, `final_boss`). Every note moves up one
pentatonic degree, over C Am Dm F Am Em F C:

```
| 1  5  1̇  — | 6̲·5̳  3  5  — | 2  3̲2̲  1  6̣ | 1  2̲3̲  5  — | 1̇·  2̲̇  1̇  6 | 5  6̲5̲  3  — | 1  5  1̇  6̲5̲ | 3̲·5̳  2̲3̲  1  — |
```

**The `duhun` song** (18 bars, 72 s loop) starts on the first word, so even a short scene hears 「燈一盞」.

| section | bars | what happens |
|---|---|---|
| verse 1 | 8 | **voice** (hummed "oo", a3–c5) and **jade flute** an octave above, in unison; zheng quarter-half pattern; pad |
| verse 2 | 8 | the flute leads; **erhu counter-line**; zheng eighth-note ripples; soft bass; the voice holds long chord tones |
| interlude | 2 | F → Esus; **bells ring the motif**; Esus → Am leads back into verse 1 |

Other songs that carry the melody: `sad` (erhu in D minor, then dizi with an erhu counter), `lighthouse` (dizi,
B minor), `final_boss` (war-cry, then 宮 form), `gameover` (its last two lines, D minor, one-shot), and the
prologue / ch1 lone-flute lullaby (`G.Music.themes.duhun` + `duhunChords`).

---

## 4. 千燈 true-ending theme (`ending`)

*The payoff.* ♩ = 76, 4/4, 28 bars (88.4 s loop). It moves from A 羽 to **D 宮**. It is called with fade 2 when the
heart lanterns rise (ch11 11-15 and the E-00 千燈 moment), and it loops through the true-ending epilogue maps.

| section | bars | key / harmony | what happens |
|---|---|---|---|
| P prelude | 8 | A 羽, 渡魂謠 chords | **渡魂謠 on lone zheng notes** over single bass plucks (as the screenplay asks: 「只有 zheng 單音」); a pad creeps in at bar 5 |
| T | 8 | F G Am C Dm F Am Em | **the title melody** on dizi; bells double each rising lantern; the erhu joins halfway |
| Q 千燈之段 | 8 | **D 宮**: D Bm Em G Bm F#m G D | **渡魂謠 in 宮 form**, dizi and erhu **in octaves**; zheng sixteenth-note ripples; gong; a heartbeat drum; bell cascades. The modulation (Em = ii of D) is the lift |
| C coda | 4 | D Bm G D | **the motif itself in 宮**, closing on a plagal G → D "amen"; then back to the quiet prelude |

**Coda (dizi, 1 = D):**

```
| 1  5  1̇  — | 6̲·5̳  3  5  — | 6·  1̲̇  2̇  — | 1̇  —  —  — |
```

The 3/4 credits (`credits`, G 宮) carry the 宮 verse of 渡魂謠 around the 九份 tune. The final battle
(`final_boss`) quotes 渡魂謠 as a war-cry, then its 宮 form over the drums. Both pick up the new melody through the
shared constants.

---

## Instruments (js/core/audio.js)

The changes stay cheap: about 3–10 Web Audio nodes per note, with no samples and no worklets.

* **dizi (笛子)**: sine body, octave triangle, and a little 3rd harmonic (the 笛膜 buzz). A breath **chiff** on the
  attack settles into a faint air stream. A 22-cent **scoop** up to pitch. **Delayed vibrato** (rate varies
  5.0–5.6 Hz by pitch) applied to detune, so all partials move together, plus a small breath-pulse amplitude
  wobble on held notes.
* **erhu (二胡)**: a bowed saw through the body filter. The bow **bites** on the attack (filter opens) with a
  breath of rosin noise. **滑音 slides** in from the previous note on connected leaps (up a minor third or more,
  down a fourth or more, notes ≥ 0.25 s). The sequencer computes these per track and passes them as
  `playNote(…, x = { from })`. Vibrato is delayed (about 0.15 s) and 24 cents deep.
* **voice (new)**: a hummed "oo" (sine + saw through a soft vowel filter at 780 Hz / 2.9 kHz) with sung
  portamento and late vibrato. Used only in `duhun` and the B section of `love`.
* **zheng / pipa**: **pluck decay**. The low-pass starts nail-bright and closes toward about 4× the fundamental,
  so the upper partials die before the fundamental, as on a real string.
* **envelope fix**: a note shorter than its attack + decay used to swell back to sustain after its release and
  hold until the oscillator stopped. That caused clicks on short bass and erhu notes, and it affected every song.
  Such notes now release from wherever their decay had got to.
* Per-note variation uses `vary(midi)` rather than `Math.random`, so loops stay deterministic.

## Mix and loops

Measured with `tools/render_music.js`: offline render through the real graph (music bus 0.6 → master 0.9 →
compressor), second-pass steady-state loop, 44.1 kHz.

| song | loop | peak dBFS | RMS dBFS | K-wtd | Δ RMS vs median BGM | seam jump ≤ p99.9 step | RMS across seam |
|---|---|---|---|---|---|---|---|
| (median of 40 exploration / theme BGM, before) | | −6.0 | **−20.1** | −19.5 | | | |
| title | 93.3 s | −4.8 | −19.0 | −18.3 | +1.1 | ok (463 ≤ 3196 LSB) | −19.5 → −21.5 |
| love | 87.3 s | −6.8 | −19.7 | −19.2 | +0.4 | ok (95 ≤ 2426) | −23.4 → −19.2 |
| duhun | 72.0 s | −6.3 | −20.0 | −19.6 | +0.1 | ok (26 ≤ 2340) | −27.9 → −20.3 |
| ending | 88.4 s | −4.9 | −19.8 | −19.1 | +0.3 | ok (90 ≤ 2789) | −22.5 → −24.0 |

* **No clipping.** Every theme peaks below −4 dBFS.
* **Loudness matched.** All four are within ±1 dB of the median exploration song. The title sits slightly above
  it, as a showcase.
* **Seamless loops.** `G.Music` schedules the next pass back-to-back (lookahead pump), so the in-game loop has no
  gap by design. The rendered loop WAVs were cut at exactly one loop length from the second pass, so they include
  the first pass's tails. The jump from the last sample back to the first is no larger than the music's own 99.9th
  percentile sample-to-sample step, and RMS on each side of the seam stays within a few dB. Each seam lands on a
  musical join: an Am9 intro after a Dm cadence, an Esus → Am verse, and so on.
* **Fades.** Every theme opens softly (bells/pad, zheng prelude, or the voice's slow attack). The `fade: 2` /
  `1.5` calls on `title` and `ending` reveal an intro rather than cutting into a downbeat. `duhun` starts on the
  first word so that a `fade: 1.5` scene (ch8) still hears it.
* **The rest of the soundtrack** was re-measured after the instrument changes. Every song is within 1 dB of its
  old level except `stealth` (−1.5 dB) and `tension` (−1.0 dB), which lost the droning short-bass bug; their trims
  were raised to put them back. Songs that use the shared 渡魂謠 material (`sad`, `lighthouse`, `final_boss`,
  `credits`, `dream`, `shrine`, `farshore`) moved by less than 0.5 dB.
* **CPU.** Peak polyphony (notes sounding, including about 1 s of release) is title 22, love 17, duhun 16 and
  ending 30, against 50+ for the battle themes.

## Where each theme plays

| id | called from |
|---|---|
| `title` | title screen (`js/engine/title.js`, fade 2 / 1.5) |
| `love` | 26 tender / 白芷 scenes (ch1–ch11, E-00 共通結局) |
| `duhun` **(new)** | ch1 1-20 「白芷唱起渡魂謠」 (was `love`), ch4 風穴 「舉起玉笛。渡魂謠的旋律在風中響起」 (was `sad`), ch8 「傳來一段微弱的歌聲。渡魂謠」 (was `love`, fade 1.5) |
| `ending` | ch11 11-15 心燈, E-00 千燈, true-ending epilogue maps |
| `final_boss` | 無相 phases 1–2 |
| prologue / ch1 lullaby | `Snd.lullaby()` now reads `G.Music.themes.duhun` / `duhunChords` instead of private copies |

## Audition and render

* `tools/preview_music.html`: click a song to play it live.
* `node tools/render_music.js --ids title,love,duhun,ending --wav --preview 30 --from ending=46 --out DIR` renders
  in headless Chromium. Each song gets a seamless one-loop WAV, a 30 s preview WAV, and MP3/OGG previews when
  ffmpeg is installed, and the peak / RMS / seam numbers above are printed. Run it without `--ids` to measure every
  song. Only one browser runs at a time.

Rendered files from this pass, in `/tmp/claude-0/-home-user-testProject/511cac14-eae9-5d9a-b67b-d9b2d9063f9b/scratchpad/music/`:

| theme | loop WAV | 30 s preview |
|---|---|---|
| title | `title.wav` | `title_preview.mp3` / `.ogg` / `.wav` (from 0 s) |
| 白芷 (love) | `love.wav` | `love_preview.mp3` / `.ogg` / `.wav` (from 0 s) |
| 渡魂謠 (duhun) | `duhun.wav` | `duhun_preview.mp3` / `.ogg` / `.wav` (from 0 s) |
| 千燈 (ending) | `ending.wav` | `ending_preview.mp3` / `.ogg` / `.wav` (from 46 s: the end of the title melody into the 千燈之段) |
