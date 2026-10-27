// Offline music render + analysis in headless Chromium (one browser, one song per page load).
//
//   node tools/render_music.js [--ids title,love] [--loops 2] [--out DIR] [--wav] [--preview 30] [--json FILE]
//
// Without --ids every looping song is analysed. Per song it prints peak / RMS / K-weighted RMS (dBFS, measured
// after the master compressor at the default music volume 0.6), notes, peak polyphony, and the loop-seam checks
// (periodicity of the next loop, sample jump at the cut vs the signal's 99.9th-percentile step, RMS either side).
// --wav writes DIR/<id>.wav = one steady-state loop (seamlessly loopable); --preview N writes DIR/<id>_preview.wav
// (N s as heard in game from the song's start, or from --from id=sec; 2 s fade-out) and, when ffmpeg is on PATH, .mp3 and .ogg encodes of it.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require.resolve('playwright', { paths: ['/opt/node22/lib/node_modules'] }))); }

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const out = path.resolve(opt('out', path.join(__dirname, 'out_music')));
const loops = +opt('loops', 2);
const preview = +opt('preview', 0);
const wantWav = !!opt('wav', false);
// --from ending=46,title=10 : where each preview starts (seconds into the song)
const previewFrom = Object.fromEntries(String(opt('from', '')).split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, +v]; }));
const page_url = 'file://' + path.resolve(opt('page', path.join(__dirname, 'render_music.html')));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(page_url);
  await page.waitForFunction(() => window.__ready);
  let ids = opt('ids', null);
  ids = ids ? String(ids).split(',') : await page.evaluate(() => G.Music.ids().filter((id) => G.Music.songs[id].loop !== false));
  if (wantWav || preview) fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const id of ids) {
    await page.goto(page_url);
    await page.waitForFunction(() => window.__ready);
    const t = Date.now();
    const r = await page.evaluate(([id, loops, preview]) => renderSong(id, { loops, fade: 0, extra: Math.max(4, preview) }), [id, loops, preview]);
    r.renderMs = Date.now() - t;
    if (wantWav) {
      const b64 = await page.evaluate(() => wavB64(0, 0, 0, true));
      r.wav = path.join(out, id + '.wav');
      fs.writeFileSync(r.wav, Buffer.from(b64, 'base64'));
    }
    if (preview) {
      const from = previewFrom[id] || 0;
      const b64 = await page.evaluate(([a, n]) => wavB64(a, a + n, 2), [from, preview]);
      r.previewFrom = from;
      const pw = path.join(out, id + '_preview.wav');
      fs.writeFileSync(pw, Buffer.from(b64, 'base64'));
      r.preview = [pw];
      try {
        for (const [ext, args] of [['mp3', ['-c:a', 'libmp3lame', '-q:a', '2']], ['ogg', ['-c:a', 'libvorbis', '-q:a', '6']]]) {
          const f = path.join(out, id + '_preview.' + ext);
          execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', pw, ...args, f]);
          r.preview.push(f);
        }
      } catch (e) { r.previewErr = String(e.message || e).slice(0, 200); }
    }
    rows.push(r);
    const f = (v, n = 6) => String(v == null ? '-' : v).padStart(n);
    console.log(id.padEnd(12), 'loop', f(r.loopSec, 7), 's  peak', f(r.peakDb), ' rms', f(r.rmsDb), ' K', f(r.kDb), ' notes', f(r.notes, 5), ' poly', f(r.maxPoly, 4),
      ' seam', r.seamOk == null ? '-' : (r.seamOk ? 'ok ' : 'JUMP'), f(r.periodicErrDb), 'dB', f(r.seamBeforeDb), '→', f(r.seamAfterDb), '  ', r.renderMs + 'ms');
  }
  const json = opt('json', null);
  if (json) fs.writeFileSync(json, JSON.stringify(rows, null, 1));
  if (errs.length) console.log('page errors:\n' + errs.slice(0, 20).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
