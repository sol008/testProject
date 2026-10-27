// 彼岸燈 — design options: 洛紅纓 Luo Hongying
'use strict';
(() => {
  const U = G.U;
  const { SKIN, ell, ribbonPath, TAU } = DZ.kit;
  const { HB, HF, OF, AC, glowDot, sparkle } = DL;
  const { merge, IRIS } = DO;

  const HY = {
    face: 'f', faceOpt: { chinY: 78, blush: 0.12, browTh: 3.1, browY: -24 },
    skin: SKIN.fair,
    eye: { iris: IRIS.red, lash: '#1e1016', slant: 0.12, h: 0.88, lashMul: 1.1 },
    brow: { color: '#1e1418', arch: 0.6 },
    hair: { base: '#2c2333', dark: '#120c16', light: '#6c5c7c', line: '#0b070d', hi: '#9a8ab2' },
    mouths: { normal: 'flat' },
  };
  const hy = (o) => merge(HY, o);
  // ponytail tie + bow on the crown
  const tie = (c, S, col) => {
    S.K.lock(c, [-30, -108, -44, -122, -58, -116], 22, { p: 0.6 });
    AC.bow(c, -38, -112, col || '#d42638', 1);
  };
  const chinLocks = (c, S, k) => {
    S.K.lock(c, DL.scl([-58, -40, -74, 10, -62, 50, -68, 76], k || 1), 18, { p: 0.9 });
    S.K.lock(c, DL.scl([60, -40, 72, 0, 66, 40, 70, 64], k || 1), 14, { p: 0.9 });
  };
  const redRobe = { col: '#b3202c', colL: '#d23a40', colD: '#7c1220', line: '#4a0810' };

  DESIGN_OPTIONS.push({
    id: 'hongying', name: '洛紅纓', en: 'Luo Hongying — 19 · 金', accent: '#ff6a5a',
    brief: '鹿港洛家槍的繼承人，三年前中元夜滿門被滅，追查面具劍客「鬼面」。火爆、驕傲、直來直往、超級講義氣；偷偷喜歡可愛的東西（糰子！），廚藝是災難。叫星河「笨蛋」。原設：黑色高馬尾綁長紅緞帶、銳利眼神、赤紅短袍＋黑皮背心與護腕、紅纓槍。',
    options: [
      {
        name: '紅纓槍', en: 'Red-tassel Spear (canon)', style: 'classic', expr: 'smug', bg: ['#2a1420', '#5a1a20'],
        desc: '原設定：高馬尾＋長紅緞帶，赤紅交領短袍外罩黑皮背心、銅釘點綴，紅纓槍從肩後探出。俐落、好認、配色最強烈。',
        gloss: 'Canon: high ponytail with long red ribbon, crimson robe, black studded leather vest, red-tassel spear.',
        spec: hy({
          behind(c) { AC.spearBack(c); },
          back(c, S) { HB.ponyHigh(c, S, { ribbon: '#d42638' }); },
          body(c, S) {
            OF.robe(c, S, Object.assign({ sw: 108, swf: 96, y: 118, X: [6, 158], L: [-20, 94], R: [24, 94], collar: [{ col: '#1e1a1e', line: '#000', w: 7 }, { col: '#f2ede6', line: '#a49c94', w: 5 }] }, redRobe));
            OF.vest(c, S, { col: '#17121a', colL: '#3e3438', studs: '#d8b25a' });
          },
          front(c, S) { HF.cap(c, S); tie(c, S); HF.bangs(c, S, 'sharp', { p: 1.1 }); chinLocks(c, S); },
        }),
      },
      {
        name: '鹿港千金', en: 'Lukang Heiress', style: 'donghua', expr: 'smug', bg: ['#2a0a10', '#6a3010'], accent: '#ffb040', rim: '#ffe0b0',
        desc: '「一府二鹿」的大小姐氣場：高髻插金步搖、垂紅流蘇，緋紅織錦大裪衫滾金邊、金盤扣，槍纓也換成金紅。驕傲寫在下巴上。',
        gloss: 'Lukang heiress: high bun with gold buyao and red tassels, crimson brocade jacket with gold trim, gold-tassel spear.',
        spec: hy({
          eye: { iris: ['#3e0c12', '#a0302a', '#f09050', '#ffd0a0'] },
          hair: { base: '#2a1e28', dark: '#0e080e', light: '#7a5a6a', line: '#080406', hi: '#c0a0a8' },
          behind(c) { AC.spearBack(c, { tassel: '#e0a030', collar: '#e8c060', blade: '#e8e8f0' }); },
          back(c, S) { HB.nape(c, S, { len: 0.5 }); },
          body(c, S) {
            OF.daJin(c, S, { col: '#a8182a', colL: '#d03040', colD: '#6a0814', line: '#3a0408', trim: '#e0b040', trim2: '#7a0a14', frog: '#f4d070', inner: '#fff4e0', trimW: 8, collarCol: '#e0b040' });
            // brocade roundels
            c.strokeStyle = 'rgba(240,190,90,0.6)'; c.lineWidth = 1.1;
            for (const [x, y] of [[-96, 150], [-84, 182], [-30, 176], [52, 150], [72, 182]]) { ell(c, x, y, 8, 8); c.stroke(); ell(c, x, y, 4, 4); c.stroke(); }
          },
          front(c, S) {
            HF.bun(c, S, { x: -14, y: -124, r: 1.1 });
            HF.cap(c, S);
            HF.bangs(c, S, 'side', { len: 0.95 });
            chinLocks(c, S, 0.9);
          },
          acc(c) {
            AC.buyao(c, -40, -126, -0.5, { gold: '#f0c860', bead: '#d0283a', n: 3, len: 24, flower: '#d0283a' });
            AC.buyao(c, 16, -130, 0.4, { gold: '#f0c860', bead: '#d0283a', n: 2, len: 18 });
            AC.earring(c, -60, 30, '#d0283a', '#f0d070');
          },
          over(c) { AC.motes(c, { kind: 'spark', col: '#ffd070', n: 8, seed: 3, s: 3 }); },
        }),
      },
      {
        name: '鐵甲紅纓', en: 'Armoured Spear-maiden', style: 'classic', expr: 'serious', bg: ['#202838', '#5a2020'], accent: '#ff7060',
        desc: '武將感最強：額繫紅抹額嵌赤玉，肩上層疊鱗甲、胸前護心鏡，赤紅披風。像要上陣的少將軍——適合中後期「復仇」篇章。',
        gloss: 'Armoured: red headband with a jewel, lamellar pauldron, chest mirror, crimson cape.',
        spec: hy({
          behind(c) { OF.capeBack(c, { col: '#9a1824', lining: '#2a1a1a' }); AC.spearBack(c, { x: 78 }); },
          back(c, S) { HB.ponyHigh(c, S, { ribbon: '#d42638', len: 1.05 }); },
          body(c, S) {
            OF.robe(c, S, Object.assign({ X: [6, 158], collar: [{ col: '#2a2228', line: '#000', w: 7 }, { col: '#f2ede6', line: '#a49c94', w: 5 }] }, redRobe));
            OF.capeFront(c, { col: '#9a1824', clasp: '#d8b25a' });
            OF.armor(c, S, { metal: '#8a94a4', edge: '#d8b25a', mirror: true, mx: -12, my: 168, strap: '#3a2a22' });
          },
          front(c, S) { HF.cap(c, S); tie(c, S); HF.bangs(c, S, 'sharp', { p: 1.1, len: 0.95 }); chinLocks(c, S); },
          acc(c) { AC.headband(c, { col: '#c8202e', y: -66, jewel: '#ff3a3a', trim: '#d8b25a' }); },
        }),
      },
      {
        name: '素縞尋仇', en: 'Mourning Avenger', style: 'ink', expr: 'serious', bg: ['#888', '#222'],
        desc: '大膽詮釋：為滅門守孝——紅緞帶換成白色孝帶纏額、長辮束起，一身墨黑夜行衣，臉頰一道舊傷。只剩槍纓還是紅的。冷、狠、心碎。',
        gloss: 'Bold mourning version: white mourning headband, tight braid, black night-raid clothes, cheek scar; only the tassel stays red.',
        inkAccent: true,
        spec: hy({
          eye: { iris: ['#2a0a0a', '#6a1a1a', '#b85a4a', '#e0b0a0'], lid: 0.86, slant: 0.14 },
          behind(c) { AC.spearBack(c, { tassel: '#d8283a' }); },
          back(c, S) { HB.braid(c, S, { spine: [-48, -60, -96, 0, -84, 100, -100, 200], w: 24, tie: '#f4f4f0' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#1e1c22', colL: '#34303a', colD: '#0a0a0e', line: '#000', X: [6, 156], collar: [{ col: '#3a3640', line: '#000', w: 7 }, { col: '#e8e6e2', line: '#888', w: 4 }] });
            OF.strap(c, { col: '#2a2a2e', dir: 'near' });
          },
          front(c, S) { HF.cap(c, S); HF.bangs(c, S, 'sharp', { p: 1.15, len: 1.05 }); chinLocks(c, S, 1.1); },
          acc(c) { AC.headband(c, { col: '#f2f0ea', y: -66, tails: true }); },
          facial(c, S) { AC.scar(c, S.F.eyeX - 14, S.F.eyeY + 22); },
        }),
      },
      {
        name: '斷髮明志', en: 'The Girl Who Cut Her Hair', style: 'cel', expr: 'angry', bg: ['#e04030', '#301018'], accent: '#ffd040',
        desc: '大膽詮釋：滅門那夜一刀剪去長髮——參差短髮、額上綁著隨風狂飛的紅布條，赤紅勁裝配黑背心。最有爆發力、最「火爆」。',
        gloss: 'Bold: hair hacked short the night of the massacre, wild red headband tails, crimson and black - maximum fire.',
        spec: hy({
          faceOpt: { browTh: 3.6 }, eye: { slant: 0.15, h: 0.85, lashMul: 1.15 },
          behind(c) { AC.spearBack(c, { a: 0.45, x: 60 }); },
          back(c, S) {
            HB.bob(c, S, { len: 30 });
            const r = DL.rng(4);
            for (let x = -96; x <= 70; x += 18) S.K.lock(c, [x, 10, x - 4, 30, x + (r() - 0.5) * 16, 52 + r() * 14], 22, { p: 1, strands: 1 });
          },
          body(c, S) {
            OF.robe(c, S, Object.assign({ X: [6, 158], collar: [{ col: '#1e1a1e', line: '#000', w: 7 }, { col: '#f2ede6', line: '#a49c94', w: 5 }] }, redRobe));
            OF.vest(c, S, { col: '#17121a', colL: '#3e3438', studs: '#e8c060' });
          },
          front(c, S) {
            HF.cap(c, S);
            HF.bangs(c, S, 'messy', { p: 1.2, len: 0.95 });
            S.K.lock(c, [-58, -40, -76, 0, -64, 30, -72, 50], 18, { p: 1 });
            S.K.lock(c, [60, -40, 74, 0, 66, 24, 74, 40], 14, { p: 1 });
          },
          acc(c) { AC.headband(c, { col: '#e02838', y: -68, tails: true }); },
        }),
      },
      {
        name: '雙尾甜心', en: 'Twin-tail Softie', style: 'water', expr: 'shy', bg: ['#f0a0b0', '#f8e0b0'], accent: '#f08aa0',
        desc: '把「偷偷喜歡可愛東西」做成整套造型：雙馬尾綁紅蝴蝶結、櫻桃紅短衫，胸前掛著一隻自己縫的石虎小吊飾——被看到會臉紅大叫「才不是！」',
        gloss: 'Her secret soft side: twin tails with red bows, cherry-red jacket, a handmade leopard-cat charm, blushing.',
        spec: hy({
          faceOpt: { chinY: 76, eyeH: 39, blush: 0.3 }, eye: { iris: ['#4a0c1a', '#b0304a', '#f08a90', '#ffd8d8'], slant: 0.04, h: 0.98, lashMul: 1.15 },
          hair: { base: '#2e2430', dark: '#120c14', light: '#8a6a7a', line: '#0b070d', hi: '#c8a8b8' },
          back(c, S) { HB.twinTails(c, S); },
          body(c, S) {
            OF.daJin(c, S, { col: '#e05a6a', colL: '#f0808a', colD: '#a83040', line: '#5a1420', trim: '#ffffff', frog: '#ffffff', inner: '#fff', trimW: 6 });
          },
          bodyAfter(c) { AC.catCharm(c, 20, 140, 1.15); },
          front(c, S) {
            HF.cap(c, S);
            HF.bangs(c, S, 'soft', { len: 0.95 });
            chinLocks(c, S, 0.9);
          },
          acc(c) { AC.bow(c, -56, -96, '#e02838', 1.15, true); AC.bow(c, 48, -102, '#e02838', 1, false); },
        }),
      },
      {
        name: '江湖鏢師', en: 'Caravan Escort', style: 'classic', expr: 'laugh', bg: ['#3a2a1a', '#8a5a2a'], accent: '#ffc070',
        desc: '走鏢押貨的江湖兒女：紅頭巾包住髮髻、馬尾從後垂下，土黃粗布衫外罩皮背心、斜背麻繩，笑起來豪邁爽朗。更接地氣、更「俠」。',
        gloss: 'Caravan escort: red headscarf, low ponytail, ochre robe, leather vest, rope over the shoulder, hearty laugh.',
        spec: hy({
          skin: SKIN.warm, eye: { iris: ['#3a1a0a', '#8a4a1a', '#d89050', '#ffe0b0'], h: 0.92 },
          hair: { base: '#2a2020', dark: '#100a0a', light: '#6a5a50', line: '#080404', hi: '#a09080' },
          behind(c) { AC.spearBack(c, { tassel: '#c8283a', shaft: '#6a4a2a' }); },
          back(c, S) { HB.ponyLow(c, S, { tie: '#c8283a', vol: 1.1 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#c8a060', colL: '#e0c080', colD: '#8a6a30', line: '#3a2a10', X: [6, 160], collar: [{ col: '#6a3a1a', line: '#2a1408', w: 8 }, { col: '#f2ead8', line: '#a09070', w: 5 }] });
            OF.vest(c, S, { col: '#4a2a18', colL: '#7a4a28', line: '#1a0a04', studs: '#c8a050' });
            // coiled rope over the near shoulder
            c.strokeStyle = '#b89a60'; c.lineWidth = 4;
            c.beginPath(); c.moveTo(-60, 112); c.lineTo(30, 200); c.stroke();
            c.strokeStyle = 'rgba(90,60,20,0.6)'; c.lineWidth = 1;
            for (let k = 0; k < 12; k++) { const t = k / 12, x = U.lerp(-60, 30, t), y = U.lerp(112, 200, t); c.beginPath(); c.moveTo(x - 2, y + 2); c.lineTo(x + 2, y - 2); c.stroke(); }
          },
          front(c, S) { HF.cap(c, S); HF.bangs(c, S, 'sharp', { p: 1.1, len: 0.9 }); chinLocks(c, S, 0.85); },
          acc(c) { AC.wrap(c, { col: '#c0283a', pattern: 'rgba(255,220,180,0.7)' }); },
        }),
      },
      {
        name: '赤焰鋒芒', en: 'Crimson Edge', style: 'donghua', expr: 'serious', bg: ['#0e060a', '#3a0810'], accent: '#ff3a3a', rim: '#ffb0a0',
        desc: '國漫女武神：超長高馬尾、髮梢染成焰紅，黑底赤紋不對稱勁裝鑲金，眼神凌厲泛紅光，火星與槍纓一起翻飛。氣勢最大。',
        gloss: 'Donghua warrior: extra-long ponytail with flame-red tips, black-and-crimson with gold, glowing red eyes, embers.',
        spec: hy({
          faceOpt: { browTh: 3.4 }, eye: { iris: IRIS.crimson, slant: 0.17, h: 0.82, lashMul: 1.25 },
          hair: { base: '#221820', dark: '#0a0608', light: '#a04050', line: '#050304', hi: '#ff8080' },
          aura(c) { AC.aura(c, '#ff3a3a', 0.15, 170); },
          behind(c) { AC.spearBack(c, { tassel: '#ff2a3a', blade: '#f0f0ff' }); },
          back(c, S) { HB.ponyHigh(c, S, { len: 1.25, vol: 1.1, tip: '#e0283a', ribbon: '#ff2a3a' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#1a141a', colL: '#2e262e', colD: '#060406', line: '#000', X: [10, 150], collar: [{ col: '#d0202e', line: '#4a0408', w: 9 }, { col: '#e8c060', line: '#7a5a10', w: 3 }] });
            OF.armor(c, S, { metal: '#3a3038', edge: '#e8c060', line: '#000' });
            c.strokeStyle = 'rgba(232,192,96,0.85)'; c.lineWidth = 1.3;
            for (const [x, y] of [[50, 160], [62, 178], [36, 186]]) { c.beginPath(); c.moveTo(x, y + 10); c.quadraticCurveTo(x - 8, y, x + 2, y - 12); c.stroke(); }
          },
          front(c, S) {
            HF.cap(c, S); tie(c, S, '#ff2a3a');
            HF.bangs(c, S, 'sharp', { p: 1.15, tip: '#b0202e' });
            chinLocks(c, S, 1.15);
          },
          over(c) { AC.motes(c, { kind: 'ember', col: '#ff3a2a', n: 14, seed: 9, s: 3.2 }); },
        }),
      },
      {
        name: '白銀金鋒', en: 'Silver Edge of Metal', style: 'cel', expr: 'normal', bg: ['#8ab0d0', '#e8eef4'], accent: '#ffffff',
        desc: '五行屬「金」的另解：白銀色調——白衣銀甲、銀冠束高馬尾，只留紅緞帶與槍纓一點紅。乾淨鋒利，和星河的暖色形成強對比。',
        gloss: '\'Metal\' element reread: white robe, silver armour and crown, only ribbon and tassel red - a cool contrast to Xinghe.',
        spec: hy({
          eye: { iris: ['#2a1418', '#7a3a3a', '#d08a7a', '#ffe0d0'] },
          hair: { base: '#22202e', dark: '#0a0a12', light: '#6a6a8a', line: '#050508', hi: '#b0b0d0' },
          behind(c) { AC.spearBack(c, { blade: '#ffffff', shaft: '#d8dce4', collar: '#c0c8d4' }); },
          back(c, S) { HB.ponyHigh(c, S, { ribbon: '#d42638' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#eef0f4', colL: '#ffffff', colD: '#b8c0cc', line: '#4a5260', X: [6, 158], collar: [{ col: '#9aa4b4', line: '#3a4250', w: 7 }, { col: '#d42638', line: '#5a0810', w: 3 }] });
            OF.armor(c, S, { metal: '#c8d0dc', edge: '#ffffff', line: '#3a4250', mirror: true, mx: -14, my: 170, strap: '#6a7480' });
          },
          front(c, S) {
            HF.cap(c, S);
            S.K.lock(c, [-30, -108, -44, -122, -58, -116], 22, { p: 0.6 });
            HF.bangs(c, S, 'sharp', { p: 1.1 });
            chinLocks(c, S);
          },
          acc(c) {
            c.save(); c.translate(-40, -116); c.rotate(-0.5);
            c.fillStyle = '#e8ecf4'; c.strokeStyle = '#4a5260'; c.lineWidth = 1.1;
            c.beginPath(); c.moveTo(-14, 6); c.lineTo(-10, -10); c.quadraticCurveTo(0, -16, 12, -10); c.lineTo(14, 6); c.closePath(); c.fill(); c.stroke();
            c.restore();
            c.strokeStyle = '#c0c8d4'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-60, -104); c.lineTo(-20, -130); c.stroke();
          },
        }),
      },
      {
        name: '洛家閨秀', en: 'Daughter of House Luo', style: 'water', expr: 'smile', bg: ['#e09080', '#a0b8a0'], accent: '#d06050',
        desc: '回到鹿港古厝時的家常模樣：髮盤成髻簪一朵紅山茶，清代紅色大裪衫滾黑邊、斜襟盤扣。難得溫柔的笑，讓人想起滅門前的她。',
        gloss: 'At home in Lukang: bun with a red camellia, Qing-era red jacket with black piping, a rare gentle smile.',
        spec: hy({
          eye: { slant: 0.08, h: 0.94 }, faceOpt: { blush: 0.2 },
          hair: { base: '#2a2228', dark: '#100a0e', light: '#7a6a72', line: '#080406', hi: '#b0a0a8' },
          behind(c) { AC.spearBack(c, { a: 0.18 }); },
          back(c, S) {
            HB.nape(c, S, { len: 0.5 });
            S.K.mass(c, (c) => { ell(c, -86, -56, 30, 28, 0.2); }, { y0: -86, y1: -26 });
            c.strokeStyle = U.rgba(S.hair.line, 0.5); c.lineWidth = 1; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-86, -54, 8 + k * 6, Math.PI * 0.7, Math.PI * 1.6); c.stroke(); }
          },
          body(c, S) {
            OF.daJin(c, S, { col: '#c8303a', colL: '#e05058', colD: '#8a1820', line: '#3a0408', trim: '#1a1418', frog: '#1a1418', inner: '#f8f0e4', trimW: 9, trim2: '#e8c060' });
          },
          front(c, S) { HF.cap(c, S); HF.bangs(c, S, 'side', { len: 0.95 }); chinLocks(c, S, 0.8); },
          acc(c) {
            c.strokeStyle = '#d8b25a'; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(-112, -40); c.lineTo(-62, -76); c.stroke();
            AC.flower(c, -80, -76, 10, '#d8283a', '#ffd070');
            c.fillStyle = '#3a6a3a'; c.beginPath(); c.moveTo(-88, -68); c.quadraticCurveTo(-100, -64, -102, -54); c.quadraticCurveTo(-92, -58, -88, -68); c.fill();
          },
        }),
      },
    ],
  });
})();
