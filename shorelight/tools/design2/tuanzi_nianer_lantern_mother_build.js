// 彼岸燈 Shorelight — design pass v2, spirit cast build script (糰子 / 夜念 / 燈母)
//   node tools/design2/tuanzi_nianer_lantern_mother_build.js tuanzi|nianer|lantern_mother [--only N] [--k 1.25] [--q 2] [--preview DIR]
// Renders with Playwright/Chromium. Fonts (LXGW WenKai TC + Noto Serif TC, SIL OFL) are fetched from Google Fonts as
// text-subsets of the characters used in these sources and cached in $FONT_CACHE (default: os tmpdir).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'design', 'v2');
const args = process.argv.slice(2);
const who = args[0] || 'tuanzi';
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const only = +opt('only', 0); const K = +opt('k', 1.25); const Q = +opt('q', 2); const preview = opt('preview', null);

function fontCSS() {
  const cacheDir = process.env.FONT_CACHE || path.join(os.tmpdir(), 'shorelight_fonts');
  fs.mkdirSync(cacheDir, { recursive: true });
  let chars = new Set();
  for (const f of fs.readdirSync(__dirname)) if (/^(tuanzi|nianer|lantern_mother)/.test(f) && /\.(js|html)$/.test(f)) for (const ch of fs.readFileSync(path.join(__dirname, f), 'utf8')) if (ch.codePointAt(0) > 32) chars.add(ch);
  for (let c = 33; c < 127; c++) chars.add(String.fromCharCode(c));
  chars = [...chars].sort();
  const key = require('crypto').createHash('md5').update(chars.join('')).digest('hex').slice(0, 10);
  const cssFile = path.join(cacheDir, `fonts_${key}.css`);
  if (fs.existsSync(cssFile)) return fs.readFileSync(cssFile, 'utf8');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
  let out = '';
  const chunk = 250;
  for (let i = 0; i < chars.length; i += chunk) {
    const text = encodeURIComponent(chars.slice(i, i + chunk).join(''));
    for (const fam of ['LXGW+WenKai+TC', 'Noto+Serif+TC:wght@400;700']) {
      const css = execFileSync('curl', ['-sS', '-m', '60', '-A', UA, `https://fonts.googleapis.com/css2?family=${fam}&text=${text}`]).toString();
      out += css.replace(/url\((https:[^)]+)\)/g, (m, u) => {
        const buf = execFileSync('curl', ['-sS', '-m', '60', '-A', UA, u], { maxBuffer: 64 << 20 });
        return `url(data:font/woff2;base64,${buf.toString('base64')})`;
      });
    }
  }
  fs.writeFileSync(cssFile, out);
  return out;
}

(async () => {
  const css = fontCSS();
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.join(__dirname, who + '.html') + '?auto=0');
  await page.addStyleTag({ content: css });
  await page.evaluate(async () => { await document.fonts.load('20px "LXGW WenKai TC"', '糰子'); await document.fonts.load('20px "Noto Serif TC"', '糰子'); await document.fonts.load('bold 20px "Noto Serif TC"', '01'); await document.fonts.ready; });
  const t0 = Date.now();
  const outDir = preview || OUT;
  fs.mkdirSync(path.join(outDir, who), { recursive: true });
  const save = (file, dataUrl) => { fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log('wrote', path.relative(ROOT, file) || file); };
  const dbg = opt('debug', null);
  if (dbg) { // --debug "no,yaw,pitch,px[,head]" (several separated by ;) → one strip PNG
    const url = await page.evaluate(async ({ dbg, Q }) => (await window.debugViews(dbg, Q)).toDataURL('image/png'), { dbg, Q });
    save(path.join(outDir, `${who}_debug.png`), url);
  } else if (who === 'tuanzi') {
    const res = await page.evaluate(async ({ only, K, Q }) => {
      const cards = await window.buildCards(only, K, Q); window._cards = cards;
      return cards.map((c) => ({ no: c.no, url: c.cv.toDataURL('image/png') }));
    }, { only, K, Q });
    for (const r of res) save(path.join(outDir, who, `opt${String(r.no).padStart(2, '0')}.png`), r.url);
    if (!only) { const url = await page.evaluate(async () => (await TZ.renderSheet(window._cards.map((c) => c.cv), 1)).toDataURL('image/png')); save(path.join(outDir, `${who}_sheet.png`), url); }
  } else {
    const url = await page.evaluate(async ({ K, Q }) => (await window.buildSheet(K, Q)).toDataURL('image/png'), { K, Q });
    save(path.join(outDir, `${who}_sheet.png`), url);
  }
  console.log('time', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  await browser.close();
})();
