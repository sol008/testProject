// 彼岸燈 — design options: 白芷 Bai Zhi
'use strict';
(() => {
  const U = G.U;
  const { SKIN, ell, ribbonPath, TAU } = DZ.kit;
  const { HB, HF, OF, AC, glowDot, sparkle } = DL;
  const { merge, IRIS } = DO;

  const BZ = {
    face: 'f', faceOpt: { blush: 0.22 },
    skin: Object.assign({}, SKIN.fair, { base: '#fff0e8', mid: '#fadcd0' }),
    eye: { iris: IRIS.gold, lash: '#4a3640', whiteShade: '#b9c4e6' },
    brow: { color: '#a7a3b8', th: 0.9 },
    hair: { base: '#e7edf6', dark: '#9fb0d2', light: '#ffffff', line: '#7f8db4', hi: '#ffffff' },
    rimCol: '#e8fbff',
  };
  const bz = (o) => merge(BZ, o);
  const motes = (c, col, seed, n) => AC.motes(c, { kind: 'glow', col: col || '#d8f4ff', n: n || 8, seed: seed || 2, s: 4 });

  DESIGN_OPTIONS.push({
    id: 'baizhi', name: '白芷', en: 'Bai Zhi — heroine, appears ~17 · 水', accent: '#a8e4ff',
    brief: '從海上「逆流」漂回的水燈頭上醒來的少女，只記得〈渡魂謠〉與一枚刻著「白芷」的玉牌。溫柔、好奇、說話詩意又常常字面理解得好笑；真身是彼岸燈的燈靈，每想起一段記憶，邊緣就更透明一分。原設：銀白長髮帶淡藍光、紅繩低綁＋燈籠髮簪、淡水綠褙子繡浪花、柔金色眼睛。',
    options: [
      {
        name: '燈靈初醒', en: 'Lamp Spirit Awakens (canon)', style: 'classic', expr: 'smile', bg: ['#14284a', '#2a4a5a'],
        desc: '原設定：及腰銀髮泛淡藍光，紅繩低綁、燈籠髮簪；水綠褙子滾浪花繡邊，周身一層微光。溫柔、乾淨、一眼就是女主角。',
        gloss: 'Canon: waist-long silver hair tied low with red string, lantern hairpin, aqua beizi with sea-foam embroidery, soft glow.',
        spec: bz({
          aura(c) { AC.aura(c, '#bef0ff', 0.32, 170); },
          back(c, S) { HB.long(c, S); },
          body(c, S) {
            OF.beizi(c, S, { col: '#e3f4f3', colL: '#f4fbfb', colD: '#b9d9dc', line: '#7fa5b0', inner: [{ col: '#cfe9ec', line: '#86aab4', w: 5 }, { col: '#fbfdff', line: '#9bb8c4', w: 5 }], band: '#a6d8da', bandLine: '#5f97a3', emb: 'rgba(255,255,255,0.9)' });
            OF.waves(c, 'rgba(110,180,195,0.55)');
          },
          front(c, S) { HF.cap(c, S, { mode: 'smooth' }); HF.sideLocks(c, S); HF.bangs(c, S, 'soft'); },
          acc(c) { AC.lanternPin(c, -70, -44, 1); AC.cordWrap(c, -68, 112, '#d0283a', 0.1); },
          over(c) { motes(c, '#e0f8ff', 3, 7); },
        }),
      },
      {
        name: '雲肩仙子', en: 'Cloud-collar Celestial', style: 'donghua', expr: 'smile', bg: ['#1a1a3a', '#4a4a7a'], accent: '#b8c8ff', rim: '#ffffff',
        desc: '國漫仙子路線：頭頂雙環髻纏珍珠步搖，月白雲肩四瓣如意紋綴紅流蘇，背後飄著半透明披帛。最華麗、最「仙」。',
        gloss: 'Celestial: twin hair loops with pearls and a buyao pin, four-lobed cloud collar with red tassels, floating shawl.',
        spec: bz({
          hair: { base: '#eceaf8', dark: '#a8a0d0', light: '#ffffff', line: '#8a80b4', hi: '#ffffff' },
          eye: { h: 1.04, irisH: 1.04 },
          aura(c) { AC.aura(c, '#c8d0ff', 0.3, 170); },
          behind(c) { AC.pibo(c, { col: '#b8c8ff', line: '#8a9ad8' }); },
          back(c, S) { HB.long(c, S, { len: 210, w: 0.95 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#c8d0f0', colL: '#e0e6ff', colD: '#9aa4d0', line: '#4a5488', X: [4, 150], collar: [{ col: '#ffffff', line: '#9aa4c8', w: 6 }, { col: '#e8c8d8', line: '#a07a90', w: 4 }] });
            OF.yunjian(c, S, { col: '#f4f6ff', colL: '#ffffff', trim: '#d8b25a', emb: '#7a8ad0', tassels: '#d0283a' });
          },
          front(c, S) {
            HF.loops(c, S);
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 0.9, far: 0.8 });
            HF.bangs(c, S, 'soft', { len: 0.95 });
          },
          acc(c) {
            AC.buyao(c, -50, -108, -0.5, { gold: '#e8c060', bead: '#f4f0ff', flower: '#ffffff', n: 3, len: 20 });
            // pearl strings looping between the hair loops
            c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(120,120,170,0.6)'; c.lineWidth = 0.6;
            for (let k = 0; k <= 10; k++) { const t = k / 10, x = U.lerp(-46, 14, t), y = -112 + Math.sin(t * Math.PI) * 10; ell(c, x, y, 2.2, 2.2); c.fill(); c.stroke(); }
          },
          over(c) { AC.motes(c, { kind: 'spark', col: '#d0d8ff', n: 10, seed: 8, s: 3 }); },
        }),
      },
      {
        name: '海霧幽光', en: 'Sea-mist Phantom', style: 'water', expr: 'normal', bg: ['#2a6a8a', '#6a6aa8'], bgA: 0.85, accent: '#9ad8f0',
        desc: '強調「燈靈」本質：長髮像在水中漂浮、髮尾化成光點，身形下緣半透明。眼神有點恍惚、像隨時會被海風吹散。',
        gloss: 'Ghostly lamp spirit: hair drifting as if underwater and dissolving into light, translucent lower edge, dreamy eyes.',
        spec: bz({
          eye: { iris: IRIS.paleGold, droop: 0.06, lid: 0.92 },
          hair: { base: '#eef4fa', dark: '#a8c0e0', light: '#ffffff', line: '#8aa0c8', hi: '#ffffff' },
          ghost: { tint: '#cfeeff', amt: 0.1, fade: 236, glow: '#bfe8ff' },
          aura(c) { AC.aura(c, '#bfeaff', 0.35, 180); },
          back(c, S) { HB.float(c, S, { tip: 'rgba(210,240,255,0.15)' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#f2f8fa', colL: '#ffffff', colD: '#c8dce6', line: '#7a98aa', X: [4, 150], collar: [{ col: '#bfe4ee', line: '#6a9aaa', w: 5 }, { col: '#ffffff', line: '#a0b8c4', w: 4 }] });
            OF.waves(c, 'rgba(120,180,210,0.5)', 160);
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 1.1, far: 1.1, tip: 'rgba(220,244,255,0.1)' });
            HF.bangs(c, S, 'soft', { len: 1.05 });
          },
          acc(c) { AC.cordWrap(c, -70, 110, '#d0283a', 0.1); },
          over(c) {
            AC.motes(c, { kind: 'glow', col: '#d0f4ff', n: 16, seed: 21, s: 4 });
            AC.wisp(c, 96, 120, 0.7, '#9ad8f0');
          },
        }),
      },
      {
        name: '水燈少女', en: 'Water-lantern Maiden', style: 'cel', expr: 'smile', bg: ['#f08aa0', '#ffd8a0'], accent: '#fff0f0',
        desc: '中元夏夜感：銀髮編成側辮垂在胸前、紅繩穿辮，頭上一盞小蓮花水燈；白衣配珊瑚紅領與腰帶，明亮可愛、色彩跳。',
        gloss: 'Summer festival: side braid threaded with red string, lotus water-lantern ornament, white dress with coral collar and sash.',
        spec: bz({
          hair: { base: '#e2eaf8', dark: '#8ca2d2', light: '#ffffff', line: '#6a80b0', hi: '#ffffff' },
          faceOpt: { eyeH: 39, round: 0.3 }, eye: { h: 1.05, irisH: 1.05, slant: -0.03 },
          back(c, S) { HB.bob(c, S, { len: 40 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#fbf6f2', colL: '#ffffff', colD: '#d8ccc8', line: '#8a7a78', X: [4, 154], collar: [{ col: '#f07a80', line: '#8a2a30', w: 7 }, { col: '#ffffff', line: '#b0a0a0', w: 4 }] });
            OF.sash(c, { col: '#f07a80', trim: '#ffd070' });
            c.strokeStyle = 'rgba(240,122,128,0.6)'; c.lineWidth = 1.2;
            for (const [x, y] of [[-92, 150], [-70, 168], [70, 158]]) DL.AC.flower(c, x, y, 5, 'rgba(255,190,200,0.9)', '#ffffff');
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 0, far: 0.7 });
            HF.bangs(c, S, 'soft', { len: 0.92 });
            DL.braid(c, S, [-58, 0, -78, 60, -60, 120, -66, 186], 26, { tie: '#d0283a', n: 10 });
          },
          acc(c) { AC.lotus(c, -56, -96, 1.15, { col: '#f8a8b8' }); AC.cordWrap(c, -66, 120, '#d0283a', 0.3); },
        }),
      },
      {
        name: '九份姑娘', en: 'Jiufen Girl', style: 'water', expr: 'laugh', bg: ['#c8a8e8', '#f0c890'], accent: '#c8a0e0',
        desc: '「變成人」之後的日常裝：銀髮挽成低髻插木簪，薰衣紫大裪衫配盤扣，捧著一碗熱騰騰的芋圓笑開——第一次嚐到人間味。',
        gloss: 'Becoming human: low bun with wooden pin, lavender side-fastened jacket, laughing over a steaming bowl of taro balls.',
        spec: bz({
          faceOpt: { blush: 0.32 },
          back(c, S) {
            HB.bob(c, S, { len: 30 });
            S.K.mass(c, (c) => { ell(c, -64, 6, 30, 24, 0.3); }, { y0: -20, y1: 30 });
            c.strokeStyle = U.rgba(S.hair.line, 0.5); c.lineWidth = 1; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-64, 8, 8 + k * 5, Math.PI * 0.9, Math.PI * 1.9); c.stroke(); }
          },
          body(c, S) {
            OF.daJin(c, S, { col: '#c4b4e0', colL: '#dcd0f0', colD: '#9484b8', line: '#4a3a6a', trim: '#5a4a8a', frog: '#f4f0ff', inner: '#ffffff', trimW: 6 });
          },
          bodyAfter(c) { AC.taroBowl(c, -6, 170); },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 0.45, far: 0.45, w: 0.8 });
            HF.bangs(c, S, 'soft', { len: 0.9 });
          },
          acc(c) {
            c.strokeStyle = '#8a5a2c'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-92, 14); c.lineTo(-40, -6); c.stroke();
            c.fillStyle = '#d8a860'; ell(c, -38, -7, 3.4, 3.4); c.fill();
            AC.knot(c, -78, 22, '#d0283a', 0.8);
          },
        }),
      },
      {
        name: '渡魂歌者', en: 'Soul-ferrying Singer', style: 'classic', expr: 'normal', bg: ['#0e2a30', '#1a4a48'], accent: '#90f0c8',
        desc: '強調「〈渡魂謠〉與玉笛」：銀髮編成一圈辮冠、鬢邊垂著翠玉流蘇，薄荷綠長衣繡浪紋，玉笛斜抱在胸前。安靜、神聖、帶一點哀傷。',
        gloss: 'The singer: braided crown, jade tassel, mint robe with wave embroidery, jade flute across the chest.',
        spec: bz({
          eye: { iris: ['#4a4a12', '#a09a3a', '#e8e490', '#fffbd8'], droop: 0.08 },
          hair: { base: '#e8f2f0', dark: '#98c0b8', light: '#ffffff', line: '#6a9890', hi: '#ffffff' },
          aura(c) { AC.aura(c, '#a0f0d0', 0.25, 170); },
          back(c, S) { HB.long(c, S, { len: 210 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#cfeee0', colL: '#e8fff4', colD: '#94c8b4', line: '#3a7a6a', X: [4, 156], collar: [{ col: '#3a8a7a', line: '#1a4a40', w: 7 }, { col: '#fbfffd', line: '#90b0a8', w: 5 }] });
            OF.waves(c, 'rgba(58,138,122,0.55)', 150);
            AC.flute(c, { x: -6, y: 172, a: -0.42, col: '#8fd8b8' });
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 1, far: 0.9 });
            HF.bangs(c, S, 'soft', { len: 0.95 });
            // braided crown circling the head
            DL.braid(c, S, [-70, -40, -60, -118, 34, -124, 70, -50], 17, { n: 14 });
          },
          acc(c) {
            AC.jadeTag(c, -74, -40, 0.9, '#5aae88', '#2a8a6a');
            c.strokeStyle = '#2a8a6a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-74, -58); c.lineTo(-74, -40); c.stroke();
            DL.AC.flower(c, -74, -60, 5, '#ffffff', '#90e0c0');
          },
          over(c) {
            // floating musical notes of light
            AC.motes(c, { kind: 'glow', col: '#b0ffe0', n: 9, seed: 41, s: 4 });
          },
        }),
      },
      {
        name: '彼岸花燈', en: 'Spider-lily Lamp of the Far Shore', style: 'donghua', expr: 'serious', bg: ['#1a060c', '#4a0a18'], accent: '#ff4a5a', rim: '#ffd0d0',
        desc: '大膽詮釋「彼岸」面：銀髮髮尾漸層成彼岸花紅，鬢邊一朵發光的曼珠沙華；黑底紅襟長衣、緋金眼眸、紅瓣飄落。神秘又危險的美。',
        gloss: 'Bold Far-Shore aspect: silver hair fading to spider-lily red, glowing lily, black robe with crimson collar, falling petals.',
        spec: bz({
          eye: { iris: ['#5a0a10', '#c03030', '#ffb060', '#fff0c0'], slant: 0.11, h: 0.9, lashMul: 1.2 },
          skin: { base: '#fff2ee', mid: '#f6dcd6' },
          hair: { base: '#f2eef4', dark: '#c86a7a', light: '#ffffff', line: '#8a5068', hi: '#ffffff' },
          aura(c) { AC.aura(c, '#ff5a6a', 0.18, 170); },
          back(c, S) { HB.long(c, S, { len: 210, w: 1.05 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#1e161e', colL: '#342834', colD: '#0a060a', line: '#000', X: [4, 154], collar: [{ col: '#c0202e', line: '#4a0408', w: 8 }, { col: '#f4eeee', line: '#a09090', w: 4 }] });
            for (const [x, y, s] of [[-86, 168, 1.1], [70, 172, 0.9]]) AC.lily(c, x, y, s, '#d0283a');
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 1, far: 0.9, tip: '#e0505e' });
            HF.bangs(c, S, 'soft');
          },
          acc(c) { AC.lily(c, -66, -62, 1.35, '#ff3a4a'); },
          over(c) { AC.motes(c, { kind: 'petal', col: '#ff4a5a', n: 12, seed: 6, s: 6 }); },
        }),
      },
      {
        name: '月白短髮', en: 'Moon-white Bob', style: 'cel', expr: 'surprise', bg: ['#6aa0e0', '#c8e8ff'], accent: '#ffffff',
        desc: '大膽詮釋：剪短的齊瀏海鮑伯頭＋一撮呆毛，大眼睛對什麼都「咦？」；寬大的淺藍外衣、耳下晃著小燈籠耳墜。最可愛、最好奇。',
        gloss: 'Bold: blunt-fringe bob with ahoge, huge curious eyes, oversized pale-blue jacket, little lantern earring.',
        spec: bz({
          faceOpt: { eyeH: 39, chinY: 76, round: 0.4 }, eye: { h: 1.08, irisH: 1.06, irisW: 1.04 },
          hair: { base: '#e6eefa', dark: '#98aedc', light: '#ffffff', line: '#7088bc', hi: '#ffffff' },
          back(c, S) { HB.bob(c, S, { len: 56 }); },
          body(c, S) {
            OF.daJin(c, S, { col: '#bcd8f0', colL: '#d8ecff', colD: '#8aaed0', line: '#3a5a80', trim: '#ffffff', frog: '#ffffff', inner: '#ffffff', trimW: 7, sw: 122, swf: 106 });
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 0.42, far: 0.36, w: 1.1 });
            HF.blunt(c, S, { y: -32 });
            S.K.lock(c, [-10, -100, 6, -140, 26, -136, 20, -118], 9, { p: 1, strands: false });
          },
          acc(c) {
            AC.lantern(c, -62, 34, 0.7, {});
            c.strokeStyle = '#d8b25a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-62, 24); c.lineTo(-62, 34); c.stroke();
            AC.bow(c, -56, -84, '#d0283a', 0.75);
          },
        }),
      },
      {
        name: '墨韻燈靈', en: 'Ink-wash Lamp Spirit', style: 'ink', expr: 'normal', bg: ['#a0c8d8', '#222'], inkAccent: true,
        desc: '水墨版：長髮在腦後鬆鬆一束、用紅繩繫住任它散開如一筆墨暈，素白衣只留紅繩與燈籠一點紅。留白多、意境重，適合章節插畫。',
        gloss: 'Ink-wash: hair gathered loosely at the nape with red string, plain white robe, only red accents.',
        spec: bz({
          eye: { droop: 0.05, lid: 0.86 },
          hair: { base: '#d8dce4', dark: '#6a7488', light: '#ffffff', line: '#4a5468', hi: '#ffffff' },
          back(c, S) {
            HB.nape(c, S, { len: 0.6 });
            S.K.lock(c, [-60, 30, -120, 80, -96, 150, -132, 210], 46, { p: 0.35, bulge: 0.3, strands: 4 });
            S.K.lock(c, [-56, 36, -92, 90, -80, 150, -100, 210], 26, { p: 0.4 });
            AC.cordWrap(c, -78, 66, '#d0283a', 0.9);
          },
          body(c, S) {
            OF.robe(c, S, { col: '#f4f2ee', colL: '#ffffff', colD: '#c8c4bc', line: '#6a6660', X: [4, 160], collar: [{ col: '#5a5a62', line: '#222', w: 6 }, { col: '#ffffff', line: '#a0a0a0', w: 4 }] });
            AC.bamboo(c, -110, 190, 1.1, -0.6, '#3a3a40');
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 1.15, far: 1 });
            HF.bangs(c, S, 'center', { len: 1, w: 0.9 });
          },
          acc(c) { AC.lanternPin(c, -72, -50, 1); AC.cordWrap(c, -70, 118, '#d0283a', 0.1); },
        }),
      },
      {
        name: '燈母遺珠', en: 'Heir of the Lantern Mother', style: 'classic', expr: 'normal', bg: ['#2a1a3a', '#6a4a2a'], accent: '#ffd070',
        desc: '神性最高的版本：高髻戴金蓮冠、兩側垂步搖，額間一點火焰花鈿，身後一圈燈籠光環；白金褙子層層疊疊。適合真結局或覺醒形態。',
        gloss: 'Divine / true-ending form: high bun with golden lotus crown and buyao, flame forehead mark, lantern halo, white-and-gold layers.',
        spec: bz({
          eye: { iris: ['#8a5a0a', '#e0a020', '#ffe070', '#ffffff'], lid: 0.9, irisW: 0.96 },
          hair: { base: '#f4f2f0', dark: '#c8b8a0', light: '#ffffff', line: '#9a8a70', hi: '#ffffff' },
          aura(c) { AC.halo(c, { r: 108, lanterns: 5, col: '#f2d27a' }); },
          back(c, S) { HB.long(c, S, { len: 210 }); },
          body(c, S) {
            OF.beizi(c, S, { col: '#fbf4e4', colL: '#ffffff', colD: '#e0d0b0', line: '#8a7a50', inner: [{ col: '#e8c870', line: '#8a6a20', w: 5 }, { col: '#ffffff', line: '#b0a080', w: 5 }], band: '#e8c870', bandLine: '#8a6a20', emb: 'rgba(255,255,240,0.95)' });
          },
          front(c, S) {
            HF.bun(c, S, { x: -12, y: -126, r: 1.15 });
            HF.cap(c, S, { mode: 'smooth' });
            HF.sideLocks(c, S, { near: 1, far: 0.9 });
            HF.bangs(c, S, 'center', { len: 0.95, w: 0.9 });
          },
          acc(c) {
            AC.crown(c, -12, -136, { lotus: true, col: '#f0d070', line: '#8a6a20', gem: '#ff7040' });
            AC.buyao(c, -44, -112, -0.3, { gold: '#f0c860', bead: '#ff6040', n: 3 });
            AC.buyao(c, 22, -116, 0.2, { gold: '#f0c860', bead: '#ff6040', n: 2 });
            AC.forehead(c, '#ff6a3a', 'flame');
          },
          over(c) { AC.motes(c, { kind: 'spark', col: '#ffe0a0', n: 10, seed: 15, s: 3 }); },
        }),
      },
    ],
  });
})();
