// 彼岸燈 — character design options (humans): 沈星河 / 白芷 / 洛紅纓 / 雲歸
// Each option = { name, en, desc, style, expr, bg:[top,bottom], accent, spec } where spec is a
// portrait spec for DZ.build (see engine.js / js/gfx/portraits.js for the spec contract).
'use strict';
(() => {
  const U = G.U;
  const { SKIN, ell, ribbonPath, TAU } = DZ.kit;
  const { HB, HF, OF, AC, glowDot, sparkle } = DL;
  const merge = (base, o) => {
    const r = Object.assign({}, base, o);
    for (const k of ['faceOpt', 'eye', 'brow', 'skin', 'hair']) if (base[k] || o[k]) r[k] = Object.assign({}, base[k] || {}, o[k] || {});
    return r;
  };
  // heterochromia helper: different iris per eye
  const hetero = (irisNear, irisFar) => (c, S, blink) => {
    S.drawEye(c, Object.assign({}, S.sp, { eye: Object.assign({}, S.sp.eye, { iris: irisNear }) }), S.F, S.E, true, blink);
    S.drawEye(c, Object.assign({}, S.sp, { eye: Object.assign({}, S.sp.eye, { iris: irisFar }) }), S.F, S.E, false, blink);
  };
  const OPT = window.DESIGN_OPTIONS = [];
  const IRIS = {
    brown: ['#4a2210', '#9a5422', '#e3a356', '#ffd59a'],
    amber: ['#5a1a08', '#d0581a', '#ffb040', '#fff0a0'],
    ember: ['#4a0c06', '#c0301a', '#ff8a3a', '#ffe08a'],
    gold: ['#7a4a12', '#c98b2c', '#ffd77a', '#fff1b8'],
    paleGold: ['#8a6a2a', '#d8b060', '#fff0b0', '#ffffff'],
    sea: ['#0e3a4a', '#2a8aa0', '#8ee0e8', '#e0ffff'],
    ghost: ['#2a4a7a', '#5a8ad0', '#bfe4ff', '#ffffff'],
    jade: ['#0e3a2a', '#2a8a62', '#8ee0b0', '#e0fff0'],
    red: ['#3e0c12', '#93262a', '#e2744c', '#ffc08a'],
    crimson: ['#2a0408', '#a01020', '#ff5a5a', '#ffd0c0'],
    dark: ['#140c10', '#3a2a2a', '#7a6058', '#c0a090'],
    grey: ['#1e1e26', '#4a4e5e', '#9aa0b4', '#e0e4f0'],
    green: ['#16302a', '#3f6f5e', '#8fc2a6', '#d4f0d8'],
    violet: ['#1a1030', '#5a3aa0', '#b090f0', '#efe0ff'],
    storm: ['#101c3a', '#3050a0', '#80b0ff', '#e0f0ff'],
    hazel: ['#2a2410', '#6a5a22', '#b8a050', '#f0e0a0'],
    rose: ['#3a0a1a', '#a0304a', '#f08aa0', '#ffe0e8'],
  };
  window.DO = { merge, hetero, IRIS };

  // ======================================================================= 沈星河
  const XH = {
    face: 'm', faceOpt: { jaw: 1.02, chinY: 82, eyeH: 28, browY: -22 },
    skin: SKIN.warm, eye: { iris: IRIS.brown, lash: '#2a1a1a' }, brow: { color: '#2d2026' },
    hair: { base: '#3a2c34', dark: '#1d1520', light: '#8a7488', line: '#160f16', hi: '#a98fa6' },
  };
  const xh = (o) => merge(XH, o);
  const XHC = { indigo: { col: '#34477a', colL: '#4a5f96', colD: '#232f55', line: '#16203e' } };
  const xhFrontCanon = (c, S, o = {}) => {
    HF.topknot(c, S);
    HF.cap(c, S, { mode: 'smooth', hl: -70 });
    c.fillStyle = o.cord || '#c8283a'; c.strokeStyle = U.shade(o.cord || '#c8283a', -0.5); c.lineWidth = 1.1;
    ell(c, -18, -106, 9, 4.5, -0.5); c.fill(); c.stroke();
    c.strokeStyle = o.cord || '#c8283a'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-24, -104); c.quadraticCurveTo(-38, -96, -40, -84); c.stroke();
    HF.bangs(c, S, 'messy', { p: 1.05 });
    S.K.lock(c, [-30, -100, -52, -110, -68, -96], 9, { p: 1, strands: false });
    S.K.lock(c, [30, -104, 52, -110, 64, -92], 8, { p: 1, strands: false });
    HF.sideburn(c, S);
  };
  OPT.push({
    id: 'xinghe', name: '沈星河', en: 'Shen Xinghe — protagonist, 18 · 火', accent: '#ffb060',
    brief: '九份「陳記燈籠舖」學徒。開朗、愛偷懶、嘴快心軟，說大話怕小事，關鍵時刻最勇敢。身上藏著白芷借給他的一點燈火（沒有自己的魂燈）。武器：劍「螢火」。原設：凌亂短髮小髻、暖棕眼、靛藍短衫、紅繩手環。',
    options: [
      {
        name: '燈火少年', en: 'Lantern-shop Boy (canon)', style: 'classic', expr: 'smile', bg: ['#1a2448', '#4a2a3a'],
        desc: '原設定忠實版：凌亂短髮＋紅繩小髻，靛藍大裪衫配盤扣，背上「螢火」劍柄。最安全、最「仙劍」的主角臉。',
        spec: xh({
          behind(c) { AC.swordBack(c); },
          back(c, S) { HB.nape(c, S); },
          body(c, S) {
            OF.daJin(c, S, Object.assign({ inner: '#f3efe6', trim: '#1f2b52', frog: '#e8dcc0', trimW: 8 }, XHC.indigo));
            OF.strap(c, { col: '#5a3a26' });
          },
          front(c, S) { xhFrontCanon(c, S); },
        }),
      },
      {
        name: '紙燈學徒', en: 'Workshop Apprentice', style: 'water', expr: 'laugh', bg: ['#f0b070', '#7aa0d0'], accent: '#e08a50',
        desc: '藍染點點頭巾、米白短衫外罩帆布圍裙，臉頰沾一抹朱紅顏料、耳後夾著毛筆——一看就是剛糊完燈籠溜出來玩。',
        spec: xh({
          faceOpt: { eyeH: 31, chinY: 80, round: 0.4 },
          back(c, S) { HB.nape(c, S, { len: 0.8 }); },
          body(c, S) {
            OF.daJin(c, S, { col: '#efe6d2', colL: '#fbf6ea', colD: '#cfc2a6', line: '#7a6a50', trim: '#3a5a8a', frog: '#3a5a8a', trimW: 5, inner: '#ffffff' });
            OF.apron(c, { col: '#a07a52', pocket: true, stains: '#d0402a' });
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            HF.bangs(c, S, 'messy', { len: 0.85 });
            HF.sideburn(c, S);
          },
          acc(c, S) {
            AC.wrap(c, { col: '#2f4f86', pattern: 'rgba(255,255,255,0.85)' });
            // brush behind the ear
            c.save(); c.translate(-70, -30); c.rotate(-0.9);
            c.fillStyle = '#c89a5a'; c.fillRect(-2, -26, 4, 40); c.fillStyle = '#2a1a14'; c.beginPath(); c.moveTo(-2.5, 14); c.lineTo(2.5, 14); c.lineTo(0, 24); c.closePath(); c.fill();
            c.restore();
          },
          facial(c, S) { AC.smudge(c, S.F.eyeX - 6, S.F.eyeY + 32, '#d0402a'); },
        }),
      },
      {
        name: '螢火劍客', en: 'Firefly Swordsman', style: 'donghua', expr: 'serious', bg: ['#0e0a1a', '#3a1010'], accent: '#ff7a2a',
        desc: '國漫主角路線：利落高馬尾、髮梢透出餘燼橘光，黑紅勁裝鑲金色火紋，琥珀色眼睛發亮、周身火星飛舞。',
        spec: xh({
          faceOpt: { eyeH: 25, chinY: 87, cheek: -2, browTh: 3.6 }, eye: { iris: IRIS.amber, slant: 0.12, h: 0.86, irisW: 1.05 }, brow: { color: '#1a1018', arch: 0.4 },
          hair: { base: '#2a2030', dark: '#0e0a14', light: '#ff9050', line: '#070509', hi: '#ffb070' },
          behind(c) { AC.swordBack(c, { glow: '#ff8a3a', guard: '#e8b04a', grip: '#2a1a1a', tassel: '#ff5a2a' }); },
          back(c, S) { HB.ponyHigh(c, S, { len: 0.62, vol: 0.75, tip: '#c8502a' }); },
          body(c, S) {
            OF.robe(c, S, {
              col: '#221c26', colL: '#342a38', colD: '#0e0a10', line: '#000', X: [4, 160],
              collar: [{ col: '#a8202a', line: '#3a0408', w: 9 }, { col: '#1a1418', line: '#000', w: 4 }],
              flapDeco(c, R0, ext, nx, ny, tw) {
                for (let k = 1; k < 6; k++) { const t = k / 6.5, x = U.lerp(R0[0], ext[0], t) + nx * tw / 2, y = U.lerp(R0[1], ext[1], t) + ny * tw / 2; c.fillStyle = '#ffc060'; c.beginPath(); c.moveTo(x, y - 4); c.quadraticCurveTo(x + 3, y, x, y + 3); c.quadraticCurveTo(x - 3, y, x, y - 4); c.fill(); }
              },
            });
            // gold flame embroidery
            c.strokeStyle = 'rgba(232,176,74,0.9)'; c.lineWidth = 1.4;
            for (const [x, y, s] of [[-92, 168, 1.2], [-70, 186, 0.9], [72, 170, 1]]) {
              c.save(); c.translate(x, y); c.scale(s, s);
              c.beginPath(); c.moveTo(0, 12); c.bezierCurveTo(-10, 4, -4, -8, 0, -16); c.bezierCurveTo(2, -6, 10, -4, 6, 6); c.quadraticCurveTo(4, 12, 0, 12); c.stroke();
              c.restore();
            }
            OF.strap(c, { col: '#3a1a14', studs: '#e8b04a' });
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            S.K.lock(c, [-30, -108, -44, -122, -58, -116], 22, { p: 0.6 });
            c.fillStyle = '#c8283a'; ell(c, -40, -112, 6, 4, -0.4); c.fill();
            HF.bangs(c, S, 'sharp', { p: 1.15 });
            S.K.lock(c, [-6, -96, 4, -60, -2, -10, 8, 20], 9, { p: 1, color: '#c8502a', rootCol: '#3a2030', tipCol: '#ff9a4a', strands: false });
            S.K.lock(c, [-58, -40, -74, 10, -62, 50, -68, 76], 16, { p: 0.9, tipCol: '#c8502a' });
          },
          over(c) { AC.motes(c, { kind: 'ember', col: '#ff7a2a', n: 14, seed: 4, x0: -140, x1: 140, y0: -120, y1: 190, s: 3.5 }); },
        }),
      },
      {
        name: '八斗子海風', en: 'Sea-breeze Kid of Badouzi', style: 'cel', expr: 'laugh', bg: ['#4ab0c8', '#f0d090'], accent: '#ffffff',
        desc: '在海邊撿到的孩子：曬得微黑、背後掛著斗笠，褪色海藍短衫敞著領口，脖子上用紅繩繫著一枚貝殼。陽光感最強。',
        spec: xh({
          skin: SKIN.tan, faceOpt: { eyeH: 31, chinY: 80, round: 0.5, cheek: 1 }, eye: { h: 1.05, irisH: 1.05 },
          hair: { base: '#3a2a22', dark: '#1a120c', light: '#9a7a5a', line: '#120a06', hi: '#c0a080' },
          behind(c) {
            AC.hatDisc(c, -40, 20, 118, { col: '#dcc080', band: '#c8283a', a: -0.25, squash: 0.86 });
          },
          back(c, S) { HB.nape(c, S, { flick: true }); },
          body(c, S) {
            OF.daJin(c, S, { col: '#6a9ab8', colL: '#8ab6d0', colD: '#46708e', line: '#22384a', trim: '#f0ebe0', frog: '#f0ebe0', trimW: 6, inner: '#f6f2ea', frogs: false });
            // hat cord
            c.strokeStyle = '#c8283a'; c.lineWidth = 1.6;
            c.beginPath(); c.moveTo(-26, 100); c.quadraticCurveTo(-60, 120, -90, 104); c.stroke();
            c.beginPath(); c.moveTo(30, 98); c.quadraticCurveTo(60, 116, 90, 102); c.stroke();
            // shell pendant
            c.strokeStyle = '#c8283a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-18, 102); c.quadraticCurveTo(2, 134, 24, 100); c.stroke();
            c.save(); c.translate(3, 132);
            c.beginPath(); c.moveTo(0, -6); c.bezierCurveTo(10, -6, 12, 8, 0, 10); c.bezierCurveTo(-12, 8, -10, -6, 0, -6); c.fillStyle = '#ffe8dc'; c.fill(); c.strokeStyle = '#a07060'; c.lineWidth = 1; c.stroke();
            for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, -4); c.lineTo(k * 3.5, 8); c.stroke(); }
            c.restore();
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            HF.bangs(c, S, 'messy', { len: 0.92, p: 1.1 });
            S.K.lock(c, [-30, -100, -50, -118, -72, -110], 10, { p: 1, strands: false });
            S.K.lock(c, [-10, -104, 0, -128, 20, -130], 9, { p: 1, strands: false });
            HF.sideburn(c, S);
          },
        }),
      },
      {
        name: '借火之子', en: 'Child of the Borrowed Flame', style: 'donghua', expr: 'normal', bg: ['#0a1428', '#1a2a4a'], accent: '#7fd0ff', rim: '#c8ecff',
        desc: '大膽詮釋，直接把「秘密」穿在身上：一眼暖棕、一眼映著白芷的海藍魂火；白衣靛領、衣襬繡火焰，身旁漂著藍色魂燈。',
        spec: xh({
          eyesDraw: hetero(IRIS.brown, IRIS.sea),
          hair: { base: '#2a2838', dark: '#100e18', light: '#7aa0d0', line: '#08070c', hi: '#a0d0ff' },
          aura(c) { AC.aura(c, '#7fd0ff', 0.25, 170); },
          back(c, S) { HB.nape(c, S, { flick: true }); },
          body(c, S) {
            OF.robe(c, S, {
              col: '#eef2f6', colL: '#ffffff', colD: '#b8c4d4', line: '#5a6a80', X: [4, 162],
              collar: [{ col: '#2a3a6a', line: '#101a36', w: 9 }, { col: '#7fd0ff', line: '#2a6a9a', w: 3 }, { col: '#f6f8fa', line: '#9aa8b8', w: 5 }],
            });
            c.strokeStyle = 'rgba(80,150,220,0.75)'; c.lineWidth = 1.3;
            for (const [x, y] of [[-100, 182], [-78, 190], [-56, 186], [62, 184], [84, 190]]) {
              c.beginPath(); c.moveTo(x, y + 12); c.bezierCurveTo(x - 8, y + 2, x - 2, y - 8, x, y - 14); c.bezierCurveTo(x + 3, y - 4, x + 8, y, x + 4, y + 8); c.stroke();
            }
          },
          front(c, S) { xhFrontCanon(c, S, { cord: '#3a8ad0' }); },
          over(c) {
            AC.wisp(c, -108, 40, 1.1, '#7fd0ff');
            AC.wisp(c, 104, -10, 0.8, '#7fd0ff');
            AC.wisp(c, 92, 150, 0.9, '#ffb060', '#fff4d0');
            AC.motes(c, { kind: 'spark', col: '#a0e0ff', n: 9, seed: 12, s: 3 });
          },
        }),
      },
      {
        name: '劍仙迷', en: 'Wannabe Sword-Immortal', style: 'cel', expr: 'smug', bg: ['#d0502a', '#3a2050'], accent: '#ffd060',
        desc: '茶館說書聽太多：額上綁著飄帶紅抹額、圍巾隨風亂飛，橘褐短褂，嘴角一抹「本大俠來也」的得意笑。喜劇感強。',
        spec: xh({
          faceOpt: { eyeH: 27 }, eye: { iris: ['#4a1a0a', '#a0481a', '#f0a050', '#ffe0a0'] },
          hair: { base: '#3a2420', dark: '#1a0e0c', light: '#a0705a', line: '#120806', hi: '#d0a080' },
          back(c, S) { HB.nape(c, S, { flick: true, len: 1.1 }); },
          body(c, S) {
            OF.daJin(c, S, { col: '#b8642a', colL: '#d88a48', colD: '#7a3a14', line: '#3a1806', trim: '#3a2a50', frog: '#f0e0b0', trimW: 7, inner: '#f3efe6' });
            OF.scarf(c, { col: '#e8d080', pattern: '#c04020' });
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            HF.bangs(c, S, 'messy', { p: 1.15, len: 1.05 });
            S.K.lock(c, [-20, -104, -10, -136, 14, -142], 12, { p: 1, strands: false });
            HF.sideburn(c, S);
          },
          acc(c) { AC.headband(c, { col: '#d0283a', y: -66, tails: true, trim: '#ffd060' }); },
        }),
      },
      {
        name: '墨染少年', en: 'Ink-wash Youth', style: 'ink', expr: 'normal', bg: ['#c03030', '#222'], inkAccent: true,
        desc: '水墨意境、偏憂鬱：留長的瀏海中分、低馬尾以紅繩繫住，灰藍長衫一身素淨，只有一縷紅是他記得的溫度。',
        spec: xh({
          faceOpt: { eyeH: 26, chinY: 86 }, eye: { iris: ['#2a1a14', '#5a3a2a', '#9a7a60', '#e0c8b0'], lid: 0.9 },
          hair: { base: '#2a2a30', dark: '#0a0a0e', light: '#6a6a78', line: '#050508', hi: '#9a9aa8' },
          back(c, S) { HB.ponyLow(c, S, { tie: '#c8283a' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#7a8494', colL: '#98a2b0', colD: '#4a5262', line: '#222830', X: [4, 168], collar: [{ col: '#2a3038', line: '#0a0c10', w: 9 }, { col: '#eeeeea', line: '#9a9a96', w: 5 }] });
          },
          front(c, S) {
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center', { len: 1.05 });
            HF.sideLocks(c, S, { near: 0.55, far: 0.5, w: 0.8 });
          },
          acc(c) { AC.cordWrap(c, -66, 40, '#c8283a', 0.4); },
        }),
      },
      {
        name: '長辮小哥', en: 'Qing-era Braid Boy', style: 'water', expr: 'smile', bg: ['#e0b050', '#6a7a90'], accent: '#e0a030',
        desc: '清代街坊味最濃的一版：黑緞瓜皮帽頂著紅結、腦後一條長辮垂到胸前，深褐對襟馬褂配金盤扣，手提一盞礦工提燈。',
        spec: xh({
          faceOpt: { eyeH: 29, chinY: 83 }, eye: { droop: 0.05 },
          hair: { base: '#2a2224', dark: '#100c0e', light: '#6a5a62', line: '#0a0607', hi: '#9a8a92' },
          back(c, S) { HB.nape(c, S, { len: 0.7 }); },
          body(c, S) {
            OF.duiJin(c, S, { col: '#4a3628', colL: '#6a4e3a', colD: '#2a1c14', line: '#140a06', trim: '#2a1c14', inner: '#efe6d2', frog: '#e0b85a' });
          },
          bodyAfter(c) {
            c.save(); c.translate(72, 160);
            c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -26); c.lineTo(0, -12); c.stroke();
            glowDot(c, 0, 6, 34, '#ffd070', 0.6);
            c.fillStyle = '#5a4a3a'; c.fillRect(-9, -12, 18, 5); c.fillRect(-9, 18, 18, 5);
            c.fillStyle = 'rgba(255,232,170,0.95)'; c.fillRect(-7, -7, 14, 25); c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.2; c.strokeRect(-7, -7, 14, 25);
            c.beginPath(); c.moveTo(0, -7); c.lineTo(0, 18); c.stroke();
            c.restore();
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            HF.bangs(c, S, 'soft', { len: 0.85 });
            HF.sideburn(c, S);
            // the queue, brought forward over the near shoulder
            DL.braid(c, S, [-60, 20, -80, 70, -66, 130, -74, 190], 22, { tie: '#c8283a', n: 9 });
          },
          acc(c) {
            // 瓜皮帽 skull-cap with a red knot
            c.save();
            c.beginPath(); c.moveTo(-66, -70); c.bezierCurveTo(-70, -116, -20, -126, 6, -124); c.bezierCurveTo(40, -122, 70, -104, 66, -66);
            c.quadraticCurveTo(0, -84, -66, -70); c.closePath();
            const g = c.createLinearGradient(0, -126, 0, -70); g.addColorStop(0, '#3a3440'); g.addColorStop(1, '#141018');
            c.fillStyle = g; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.2; c.stroke();
            c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1;
            for (const x of [-34, -6, 24, 48]) { c.beginPath(); c.moveTo(x * 0.2, -124); c.quadraticCurveTo(x, -110, x * 1.2, -76); c.stroke(); }
            c.fillStyle = '#7a1420'; c.beginPath(); c.moveTo(-66, -70); c.quadraticCurveTo(0, -84, 66, -66); c.lineTo(66, -60); c.quadraticCurveTo(0, -78, -66, -63); c.closePath(); c.fill();
            c.fillStyle = '#d8283a'; ell(c, 4, -127, 7, 6); c.fill(); c.strokeStyle = '#6a0814'; c.stroke();
            c.restore();
          },
        }),
      },
      {
        name: '劍仙之姿', en: 'The Sword-Immortal He Becomes', style: 'classic', expr: 'serious', bg: ['#202a50', '#6a3040'], accent: '#ffd080',
        desc: '「長大後」的終章形象：臉型更俐落、長髮半束銀冠，白衣紅襟外罩赤紅披風，螢火劍光透肩。適合後期換裝或宣傳圖。',
        spec: xh({
          faceOpt: { chinY: 88, eyeH: 25, jaw: 1, cheek: -1 }, eye: { iris: ['#3a1a0a', '#8a4a1a', '#e0a050', '#ffe0a0'], slant: 0.05 },
          hair: { base: '#2c2030', dark: '#120a16', light: '#7a6488', line: '#0a060c', hi: '#b09ac0' },
          behind(c) { OF.capeBack(c, { col: '#a82030', lining: '#f0d8a0' }); AC.swordBack(c, { glow: '#ffd080', guard: '#f0d080', grip: '#f4f0e8', sheath: '#f4f0e8' }); },
          back(c, S) { HB.long(c, S, { len: 210, w: 0.95 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#f2eee6', colL: '#ffffff', colD: '#c8c0b0', line: '#6a6050', X: [4, 168], collar: [{ col: '#a82030', line: '#4a0810', w: 10 }, { col: '#f8f4ea', line: '#a09a8a', w: 5 }] });
            OF.capeFront(c, { col: '#a82030', trim: '#f0d080', clasp: '#f0d080' });
          },
          front(c, S) {
            HF.bun(c, S, { x: -10, y: -122, r: 0.85 });
            HF.cap(c, S, { top: -112, wx: -4, hl: -100 });
            HF.bangs(c, S, 'side', { len: 1 });
            HF.sideLocks(c, S, { near: 0.85, far: 0.7, w: 0.85 });
          },
          acc(c) {
            c.fillStyle = '#e8e8f0'; c.strokeStyle = '#5a5a6a'; c.lineWidth = 1.1;
            c.beginPath(); c.moveTo(-28, -112); c.lineTo(-24, -128); c.quadraticCurveTo(-10, -136, 6, -128); c.lineTo(8, -112); c.closePath(); c.fill(); c.stroke();
            c.fillStyle = '#e04030'; ell(c, -10, -126, 3, 3); c.fill();
            c.strokeStyle = '#c8c8d0'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-40, -116); c.lineTo(18, -126); c.stroke();
          },
        }),
      },
      {
        name: '懶骨頭', en: 'Lazybones', style: 'cel', expr: 'smug', bg: ['#6ab070', '#f0e0a0'], accent: '#fff4c0',
        desc: '把「愛偷懶」放大：半睜的睡眼、嘴裡叼根草，頭頂翹著一撮呆毛，靛衫領口隨便敞開。輕鬆好笑的日常版本。',
        spec: xh({
          eye: { lid: 0.62, droop: 0.06 }, faceOpt: { eyeH: 28 },
          hair: { base: '#3a2c34', dark: '#1d1520', light: '#8a7488', line: '#160f16', hi: '#a98fa6' },
          back(c, S) { HB.nape(c, S, { flick: true }); },
          body(c, S) {
            OF.robe(c, S, Object.assign({ X: [-6, 180], collar: [{ col: '#232f55', line: '#101830', w: 8 }, { col: '#f3efe6', line: '#a7a095', w: 7 }], L: [-30, 94], R: [34, 92] }, XHC.indigo));
            OF.folds(c, 'rgba(20,28,60,0.5)');
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            HF.bangs(c, S, 'messy', { p: 1.1 });
            // ahoge
            S.K.lock(c, [-8, -104, 10, -150, 30, -140, 22, -122], 9, { p: 1, strands: false });
            HF.sideburn(c, S);
          },
          over(c, S) { AC.grass(c, S); },
        }),
      },
    ],
  });
})();
