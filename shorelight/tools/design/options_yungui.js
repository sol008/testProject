// 彼岸燈 — design options: 雲歸 Yun Gui
'use strict';
(() => {
  const U = G.U;
  const { SKIN, ell, ribbonPath, TAU } = DZ.kit;
  const { HB, HF, OF, AC, glowDot, sparkle } = DL;
  const { merge, IRIS } = DO;

  const YG = {
    face: 'm', faceOpt: { jaw: 1.02, chinY: 84, browY: -21 },
    skin: SKIN.fair,
    eye: { iris: IRIS.green, lash: '#1a1418', lid: 0.74, slant: 0.04 },
    brow: { color: '#211a22', arch: 0.5 },
    hair: { base: '#2a2533', dark: '#100c16', light: '#6a6280', line: '#09070c', hi: '#a19ac0' },
    mouths: { normal: 'smirk', smile: 'smile' },
  };
  const yg = (o) => merge(YG, o);
  const strays = (c, S) => {
    S.K.lock(c, [0, -100, 4, -70, -4, -40, 2, -12], 8, { p: 1, strands: false });
    S.K.lock(c, [-6, -98, -12, -70, -10, -46, -16, -24], 7, { p: 1, strands: false });
  };
  const sideLong = (c, S, k) => {
    S.K.lock(c, DL.scl([-62, -30, -80, 30, -62, 110, -74, 170], k || 1), 24, { p: 0.6, strands: 3 });
    S.K.lock(c, DL.scl([62, -30, 76, 30, 66, 100, 72, 150], k || 1), 18, { p: 0.6 });
  };
  const woodCrown = (c) => {
    c.save();
    c.fillStyle = '#7a4f2c'; c.strokeStyle = '#3a2210'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-26, -118); c.lineTo(-22, -136); c.quadraticCurveTo(-10, -146, 2, -136); c.lineTo(6, -118); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#b07a46'; c.beginPath(); c.moveTo(-22, -128); c.lineTo(2, -128); c.stroke();
    c.fillStyle = '#d8b46a'; ell(c, -10, -130, 2.4, 2.4); c.fill();
    c.strokeStyle = '#5a361a'; c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-40, -120); c.lineTo(20, -134); c.stroke();
    c.fillStyle = '#c99550'; ell(c, 22, -134.5, 3, 3); c.fill();
    c.restore();
  };
  const greyRobe = { col: '#7d8ea2', colL: '#98a8ba', colD: '#56657a', line: '#2e3846' };
  const canonFront = (c, S, o = {}) => {
    HF.bun(c, S, { x: -10, y: -120 });
    HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
    HF.bangs(c, S, 'center', o);
    strays(c, S);
    sideLong(c, S);
  };

  DESIGN_OPTIONS.push({
    id: 'yungui', name: '雲歸', en: 'Yun Gui — 24 · 木（雷）', accent: '#a0e0c0',
    brief: '觀音山太虛觀的道士。毒舌、慵懶眼、愛喝米酒，偷讀「內景」禁書，還是熱情過頭的業餘蕈菇學家。其實極重情義，一直在找失蹤的師父清虛真人。符籙＋符扇，五行通吃的「弱點剋星」。原設：黑長髮半束木冠、似笑非笑的細長眼、褪色藍灰道袍配太極腰帶、寬袖、腰間葫蘆、摺扇。',
    options: [
      {
        name: '太虛道長', en: 'Taoist of Taixu Temple (canon)', style: 'classic', expr: 'smug', bg: ['#1a2a3a', '#3a4a5a'], accent: '#c0e0ff',
        desc: '原設定：長髮半束、木冠橫簪，中分瀏海落幾縷碎髮；褪色藍灰道袍配深色寬領，領口塞著黃符，摺扇與酒葫蘆隨身。似笑非笑。',
        spec: yg({
          back(c, S) { HB.long(c, S, { len: 210 }); },
          body(c, S) {
            OF.robe(c, S, Object.assign({ X: [4, 172], collar: [{ col: '#2c3646', line: '#121820', w: 10 }, { col: '#f1efe8', line: '#a9a59a', w: 6 }] }, greyRobe));
            AC.talisman(c, -30, 150, -0.25, 0.85);
            OF.folds(c, 'rgba(40,50,64,0.5)');
          },
          bodyAfter(c) {
            AC.gourd(c, 82, 172, 0.9, { col: '#c88a3a' });
            AC.fan(c, -70, 196, 46, -1.95, -1.05, { ribs: 9 });
          },
          front(c, S) { canonFront(c, S); },
          acc(c) { woodCrown(c); },
        }),
      },
      {
        name: '醉臥米酒', en: 'Tipsy Immortal', style: 'water', expr: 'laugh', bg: ['#e8b080', '#a0b8d0'], accent: '#f0a070',
        desc: '屋頂上喝醉的那一幕：長髮全散、領口鬆垮滑開，臉頰泛紅、眼睛瞇成一條線，抱著大葫蘆米酒。最慵懶、最有「酒仙」味。',
        spec: yg({
          faceOpt: { blush: 0.55 }, eye: { lid: 0.55, droop: 0.08 },
          back(c, S) { HB.long(c, S, { len: 210, w: 1.08 }); },
          body(c, S) {
            OF.robe(c, S, Object.assign({ X: [-12, 196], L: [-40, 98], R: [36, 92], collar: [{ col: '#3a4656', line: '#121820', w: 9 }, { col: '#f1efe8', line: '#a9a59a', w: 6 }] }, { col: '#8a9cb0', colL: '#a8b8c8', colD: '#5a6a80', line: '#2e3846' }));
            OF.folds(c, 'rgba(40,50,64,0.45)');
          },
          bodyAfter(c) {
            c.save(); c.translate(56, 150); c.rotate(-0.35); AC.gourd(c, 0, 0, 1.45, { col: '#d0903a', label: '酒' }); c.restore();
          },
          front(c, S) {
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center', { len: 1.08 });
            strays(c, S);
            S.K.lock(c, [-30, -100, -56, -108, -72, -96], 10, { p: 1, strands: false });
            S.K.lock(c, [-62, -40, -92, -20, -96, 10], 9, { p: 1, strands: false });
            sideLong(c, S, 1.05);
          },
        }),
      },
      {
        name: '符籙天師', en: 'Talisman Master', style: 'donghua', expr: 'serious', bg: ['#0a0a14', '#2a1a0a'], accent: '#ffcc50', rim: '#fff0c0',
        desc: '認真起來的樣子：高聳黑道冠嵌太極、玄黑道袍滾金八卦紋，身邊環繞發光黃符，眼底一層金光。最帥、最「天師」。',
        spec: yg({
          eye: { lid: 0.9, slant: 0.1, irisW: 0.92, iris: ['#2a2008', '#8a6a1a', '#ffd060', '#fff4c0'] }, faceOpt: { browTh: 4.4 }, brow: { arch: 0.3 },
          aura(c) {
            AC.aura(c, '#ffcc50', 0.18, 170);
            AC.talisman(c, -118, -60, -0.3, 0.9, { glow: '#ffd060' });
            AC.talisman(c, 112, -90, 0.35, 0.8, { glow: '#ffd060' });
          },
          back(c, S) { HB.long(c, S, { len: 210 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#1c1a22', colL: '#2e2a36', colD: '#0a0a10', line: '#000', X: [4, 172], collar: [{ col: '#d6ae52', line: '#6a5010', w: 5 }, { col: '#1c1a22', line: '#000', w: 6 }, { col: '#f1efe8', line: '#a9a59a', w: 5 }] });
            DL.trigrams(c, -112, 168, 'rgba(214,174,82,0.85)', 0.9);
            DL.trigrams(c, 46, 172, 'rgba(214,174,82,0.85)', 0.8);
            DL.taiji(c, -78, 140, 10, '#f3f1ea', '#1c1a22', '#d6ae52');
          },
          front(c, S) {
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center');
            strays(c, S);
            sideLong(c, S);
          },
          acc(c) { AC.daoGuan(c, { col: '#1a1a22', taiji: true, pin: '#d6ae52' }); },
          over(c) {
            AC.talisman(c, -112, 120, 0.4, 0.9, { glow: '#ffd060' });
            AC.talisman(c, 116, 90, -0.25, 0.95, { glow: '#ffd060' });
            AC.motes(c, { kind: 'spark', col: '#ffd060', n: 8, seed: 5, s: 3 });
          },
        }),
      },
      {
        name: '蕈癡學者', en: 'Mushroom Nerd', style: 'cel', expr: 'laugh', bg: ['#7ab060', '#f0e8b0'], accent: '#fff4d0',
        desc: '把「業餘蕈菇學家」演滿：圓框眼鏡、髮冠上插著兩朵七彩靈蕈，苔綠道袍斜背採集袋、帶子上別滿香菇徽章。一聊蘑菇就停不下來。',
        spec: yg({
          eye: { lid: 1, h: 1.12, irisH: 1.05, slant: 0, iris: ['#2a2a10', '#5a6a2a', '#a8c060', '#e8f4b0'] }, faceOpt: { eyeH: 28 },
          hair: { base: '#2e2a26', dark: '#120e0c', light: '#7a6e60', line: '#0a0806', hi: '#b0a490' },
          back(c, S) { HB.long(c, S, { len: 150, w: 0.95 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#7a8a5a', colL: '#98a878', colD: '#56643c', line: '#2a3218', X: [4, 168], collar: [{ col: '#4a3a24', line: '#1a1208', w: 9 }, { col: '#f1efe0', line: '#a0a088', w: 6 }] });
            OF.strap(c, { col: '#a07a48', dir: 'near' });
          },
          bodyAfter(c) {
            AC.mushroom(c, -36, 140, 0.8, '#c04040');
            AC.mushroom(c, -14, 162, 0.7, '#e0a030');
            AC.mushroom(c, 6, 184, 0.75, '#8a50c0', '#d0a0ff');
          },
          front(c, S) {
            HF.bun(c, S, { x: -10, y: -120, r: 0.9 });
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center', { len: 0.95 });
            sideLong(c, S, 0.8);
          },
          acc(c) {
            woodCrown(c);
            AC.mushroom(c, -34, -128, 1.6, '#e04a8a', '#ff90d0');
            AC.mushroom(c, 12, -134, 1.3, '#40a0e0', '#90e0ff');
          },
          over(c, S) { AC.glasses(c, S, { col: '#5a3a1a', chain: '#d8b25a' }); },
        }),
      },
      {
        name: '雷法真人', en: 'Thunder-rite Adept', style: 'donghua', expr: 'smug', bg: ['#0a0c24', '#2a1a4a'], accent: '#90a0ff', rim: '#e0e8ff',
        desc: '「木（雷）」屬性拉滿：長髮被雷氣吹起、鬢邊一縷霜白，靛紫道袍繡雲雷紋，瞳孔泛電光，身側劈啪閃著雷符。最強戰鬥形態。',
        spec: yg({
          eye: { iris: IRIS.storm, lid: 0.8, slant: 0.08 },
          hair: { base: '#24203a', dark: '#0c0a18', light: '#7a80d0', line: '#06050c', hi: '#c0c8ff' },
          aura(c) { AC.aura(c, '#8090ff', 0.22, 170); },
          back(c, S) { HB.float(c, S, { tip: 'rgba(120,130,255,0.25)' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#3a2e6a', colL: '#54468a', colD: '#1e1640', line: '#0a0620', X: [4, 168], collar: [{ col: '#14102a', line: '#000', w: 10 }, { col: '#c8d0ff', line: '#6a70b0', w: 3 }, { col: '#f1efe8', line: '#a9a59a', w: 5 }] });
            c.strokeStyle = 'rgba(180,190,255,0.7)'; c.lineWidth = 1.3;
            for (const [x, y] of [[-96, 150], [-70, 176], [60, 160], [80, 184]]) {
              c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x - 4, y - 6); c.lineTo(x, y); c.lineTo(x + 6, y - 6); c.lineTo(x + 10, y); c.stroke();
              c.beginPath(); c.arc(x, y + 6, 4, Math.PI, TAU * 0.98); c.stroke();
            }
          },
          front(c, S) {
            HF.bun(c, S, { x: -10, y: -120 });
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center');
            S.K.lock(c, [-4, -98, -40, -84, -60, -30, -66, 30], 12, { p: 0.9, color: '#e8ecff', rootCol: '#a0a8d0', tipCol: '#ffffff' });
            sideLong(c, S);
          },
          acc(c) { woodCrown(c); },
          over(c) {
            AC.bolt(c, -118, -40, 1.2, '#a0b0ff', 0.2);
            AC.bolt(c, 108, 60, 1, '#a0b0ff', -0.3);
            AC.talisman(c, 104, -70, 0.3, 0.8, { glow: '#a0b0ff', paper: '#e8ecff', ink: '#3a40c0', edge: '#6a70b0' });
            AC.motes(c, { kind: 'spark', col: '#b0c0ff', n: 10, seed: 13, s: 3 });
          },
        }),
      },
      {
        name: '青衫摺扇', en: 'Scholar Behind the Fan', style: 'classic', expr: 'smug', bg: ['#1a3a3a', '#3a5a4a'], accent: '#c0f0d0',
        desc: '書生扮相：長髮低束一條青緞帶，青碧儒衫，摺扇半掩著嘴只露出一雙笑眼——「在下只是路過的閒散道人。」最有心機感。',
        spec: yg({
          eye: { lid: 0.58, droop: 0.1, slant: 0 },
          back(c, S) { HB.ponyLow(c, S, { vol: 1.15, tie: '#3a8a7a' }); },
          body(c, S) {
            OF.robe(c, S, { col: '#4a8a7e', colL: '#68aa9c', colD: '#2a5a50', line: '#123a32', X: [4, 172], collar: [{ col: '#f1efe8', line: '#a9a59a', w: 10 }, { col: '#2a5a50', line: '#123a32', w: 3 }] });
            OF.folds(c, 'rgba(18,58,50,0.45)');
          },
          front(c, S) {
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center', { len: 1.02 });
            strays(c, S);
            S.K.lock(c, [62, -30, 76, 30, 66, 100, 72, 150], 18, { p: 0.6 });
          },
          acc(c) { AC.cordWrap(c, -66, 40, '#3a8a7a', 0.4); },
          over(c) {
            AC.fan(c, 20, 132, 86, -2.2, -0.92, {
              ribs: 14, paper: '#e8e0c8', paper2: '#fbf6e8', tassel: '#3a8a7a',
              art(c, r) { // ink mountains on the fan
                c.save(); c.fillStyle = 'rgba(40,60,60,0.45)';
                c.beginPath(); c.moveTo(-50, -52); c.quadraticCurveTo(-30, -78, -12, -60); c.quadraticCurveTo(4, -84, 22, -62); c.quadraticCurveTo(38, -74, 50, -54); c.quadraticCurveTo(0, -46, -50, -52); c.fill();
                c.fillStyle = 'rgba(200,40,40,0.8)'; c.fillRect(30, -50, 6, 6);
                c.restore();
              },
            });
          },
        }),
      },
      {
        name: '墨竹道人', en: 'Ink-bamboo Hermit', style: 'ink', expr: 'normal', bg: ['#6a8a6a', '#222'],
        desc: '水墨隱士：長髮只用一根竹簪鬆鬆挽住，素袍、竹影橫斜，眼神淡然。這是他獨處、想念師父時的樣子——安靜的那一面。',
        spec: yg({
          eye: { lid: 0.84, droop: 0.12, slant: -0.02 }, mouths: { normal: 'flat' },
          back(c, S) { HB.long(c, S, { len: 210, w: 1.05 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#e8e6e0', colL: '#f8f6f2', colD: '#b8b4ac', line: '#5a5650', X: [4, 172], collar: [{ col: '#4a4a50', line: '#1a1a1e', w: 10 }, { col: '#ffffff', line: '#a0a0a0', w: 5 }] });
            AC.bamboo(c, 30, 196, 1.3, -1.2, '#2a3a2a');
          },
          front(c, S) {
            HF.bun(c, S, { x: -16, y: -116, r: 0.8 });
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center', { len: 1.05 });
            strays(c, S);
            sideLong(c, S, 1.05);
          },
          acc(c) {
            c.strokeStyle = '#4a6a3a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-50, -112); c.lineTo(20, -128); c.stroke();
            c.strokeStyle = '#2a3a1a'; c.lineWidth = 1; for (const x of [-30, -6]) { c.beginPath(); c.moveTo(x, -119 + (x + 30) * -0.2); c.lineTo(x, -114 + (x + 30) * -0.2); c.stroke(); }
          },
          over(c) { AC.bamboo(c, -150, -100, 1.4, 0.3, '#2a3a2a'); },
        }),
      },
      {
        name: '雲遊散人', en: 'Wandering Recluse', style: 'water', expr: 'smile', bg: ['#a0c0d0', '#d8c8a0'], accent: '#a0b8c8',
        desc: '下山尋師的旅裝：頭戴寬邊斗笠、肩披灰褐斗篷，胸前掛一串木念珠，腰邊酒葫蘆。風塵僕僕、笑容依舊，像隨時會吟一句歪詩。',
        spec: yg({
          eye: { lid: 0.72 },
          back(c, S) { HB.ponyLow(c, S, { vol: 1.1 }); },
          body(c, S) {
            OF.robe(c, S, Object.assign({ X: [4, 172], collar: [{ col: '#2c3646', line: '#121820', w: 10 }, { col: '#f1efe8', line: '#a9a59a', w: 6 }] }, greyRobe));
            OF.capeFront(c, { col: '#8a7a60', clasp: '#5a3a1a' });
          },
          behind(c) { OF.capeBack(c, { col: '#8a7a60' }); },
          bodyAfter(c) {
            AC.beads(c, { col: '#8a5a30', spine: [-40, 104, -26, 176, 34, 178, 46, 102], r: 3.8, big: 6.5 });
            AC.gourd(c, 86, 178, 0.85);
          },
          front(c, S) {
            HF.cap(c, S, { top: -112, wx: -2, hl: -104 });
            HF.bangs(c, S, 'center');
            strays(c, S);
            S.K.lock(c, [62, -30, 76, 30, 66, 100, 72, 150], 18, { p: 0.6 });
          },
          acc(c) {
            c.strokeStyle = '#5a3a1a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-58, -70); c.quadraticCurveTo(-70, 20, -20, 84); c.stroke();
            AC.strawHat(c, -6, -70, 132, 42, -0.08, { col: '#c8a868', band: '#5a3a1a' });
          },
        }),
      },
      {
        name: '不羈野道', en: 'Rogue Taoist', style: 'cel', expr: 'smug', bg: ['#3a3a5a', '#d06a40'], accent: '#ffd080',
        desc: '大膽現代詮釋：頭髮剪短、後腦只紮一小撮，耳上掛兩枚符咒耳墜，頸側畫著朱砂符紋；黑內襯外披敞開的藍灰無袖道袍。浪子氣十足。',
        spec: yg({
          faceOpt: { chinY: 86, browTh: 4.4 }, eye: { lid: 0.72, slant: 0.15, h: 0.9 }, brow: { arch: 0.2 },
          back(c, S) { HB.nape(c, S, { len: 0.8 }); S.K.lock(c, [-56, -70, -84, -84, -96, -64], 16, { p: 0.6 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#1e1c22', colL: '#2e2a32', colD: '#0a0a0e', line: '#000', X: [6, 150], collar: [{ col: '#16141a', line: '#000', w: 5 }] });
            // open sleeveless over-robe
            for (const side of [-1, 1]) {
              c.beginPath();
              if (side < 0) { c.moveTo(-34, 98); c.bezierCurveTo(-60, 104, -100, 114, -104, 140); c.lineTo(-100, 200); c.lineTo(-40, 200); c.bezierCurveTo(-44, 160, -40, 130, -30, 104); }
              else { c.moveTo(40, 96); c.bezierCurveTo(70, 102, 90, 116, 92, 140); c.lineTo(90, 200); c.lineTo(46, 200); c.bezierCurveTo(42, 160, 44, 130, 46, 102); }
              c.closePath(); c.fillStyle = '#7d8ea2'; c.fill(); c.strokeStyle = '#2e3846'; c.lineWidth = 1.4; c.stroke();
              c.strokeStyle = '#c8283a'; c.lineWidth = 2; c.beginPath();
              if (side < 0) { c.moveTo(-40, 200); c.bezierCurveTo(-44, 160, -40, 130, -30, 104); } else { c.moveTo(46, 200); c.bezierCurveTo(42, 160, 44, 130, 46, 102); }
              c.stroke();
            }
            DL.taiji(c, -70, 156, 9, '#f3f1ea', '#1e1c22', '#c8283a');
          },
          front(c, S) {
            HF.cap(c, S, { mode: 'smooth', hl: -70 });
            HF.bangs(c, S, 'messy', { len: 0.95, p: 1.1 });
            HF.sideburn(c, S);
          },
          facial(c, S) {
            // vermilion talisman marks down the neck
            c.save(); c.strokeStyle = 'rgba(200,40,50,0.85)'; c.lineWidth = 1.6; c.lineCap = 'round';
            c.beginPath(); c.moveTo(-14, 70); c.lineTo(-16, 98); c.moveTo(-20, 78); c.lineTo(-10, 80); c.moveTo(-21, 88); c.quadraticCurveTo(-15, 92, -10, 88); c.stroke();
            c.restore();
          },
          acc(c) {
            AC.talisman(c, -66, 46, 0.1, 0.42);
            c.strokeStyle = '#d8b25a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-66, 28); c.lineTo(-66, 36); c.stroke();
            AC.earring(c, -60, 26, '#c8283a', '#d8b25a');
          },
        }),
      },
      {
        name: '霜髮道者', en: 'Frost-haired Sage', style: 'classic', expr: 'normal', bg: ['#1a2a40', '#4a5a7a'], accent: '#d0f0ff',
        desc: '大膽詮釋：讀太多「內景」禁書而早生華髮——一頭灰白長髮戴蓮花冠，白衣淡藍衿，冰藍眼眸。清冷出塵，像已經半隻腳踏進仙界。',
        spec: yg({
          eye: { iris: ['#1a3a4a', '#4a8aa0', '#a8e0f0', '#ffffff'], lid: 0.8 },
          hair: { base: '#c8ccd8', dark: '#7a8094', light: '#ffffff', line: '#4a5064', hi: '#ffffff' },
          brow: { color: '#8a8ea0' },
          aura(c) { AC.aura(c, '#c0e8ff', 0.22, 170); },
          back(c, S) { HB.long(c, S, { len: 210 }); },
          body(c, S) {
            OF.robe(c, S, { col: '#f0f2f6', colL: '#ffffff', colD: '#c0c8d4', line: '#5a6474', X: [4, 172], collar: [{ col: '#a0c0d8', line: '#4a6a80', w: 10 }, { col: '#ffffff', line: '#a0a8b4', w: 5 }] });
            OF.folds(c, 'rgba(90,100,120,0.35)');
            DL.taiji(c, -80, 160, 10, '#ffffff', '#4a6a80', '#a0c0d8');
          },
          front(c, S) { canonFront(c, S); },
          acc(c) { AC.crown(c, -10, -132, { lotus: true, col: '#e8f0f8', line: '#6a7a90', gem: '#80c0e0' }); c.strokeStyle = '#e0e4ec'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-40, -120); c.lineTo(20, -134); c.stroke(); },
          over(c) { AC.motes(c, { kind: 'glow', col: '#e0f4ff', n: 8, seed: 19, s: 3.5 }); },
        }),
      },
    ],
  });
})();
