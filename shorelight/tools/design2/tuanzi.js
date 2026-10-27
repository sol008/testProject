// 彼岸燈 Shorelight — design pass v2 — 糰子 Tuanzi: chubby talking 石虎 (Formosan leopard-cat) spirit, 雲歸's companion (10 options)
// Built on the shared cat kit (coat 'leopard': spots, white forehead lines & cheek stripes, round ears with white back-spots,
// ringed tail). He talks, eats everything, panics, and after spirit mushrooms delivers absurd cosmic wisdom.
'use strict';
(function (G) {
  const E = G.SDF, C = G.CATKIT; const { hex } = E;
  const D = G.DESIGNS = [];
  G.SCENE_OF = (key) => D.find((d) => d.no === key.no).scene(key.variant || {});
  G.SHEET = {
    title: '糰子', sub: 'Tuanzi — Formosan leopard-cat (石虎) spirit · 雲歸’s companion · talks, eats, panics · 10 design options · v2',
    blurb: '觀音山太虛觀的石虎精靈：會說人話、什麼都吃、動不動就驚慌，吃了靈蕈之後還會一本正經地發表宇宙真理。花紋依真實台灣石虎：額頭白線、白頰線、圓耳背白斑、斑點毛、環紋尾——只是肚子被雲歸餵得特別圓。',
  };
  const BASE = {
    coat: 'leopard', b: { R: 0.2, fat: 1.36 },
    head: { cheek: 1.0, earSize: 1.05, skullW: 1.03 },
    eye: { lid: 0.08, pupil: 'round', pw: 0.3, tilt: 0.06, w: 0.23, h: 0.24 },
    face: { mouth: 'w' },
  };
  const merge = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && typeof b[k] !== 'function') ? Object.assign({}, a[k] || {}, b[k]) : b[k]; return o; };
  const COL = {
    red: ['#B3262B', '#4A0E10', '#E0565A'], brass: ['#C9A043', '#4A3510', '#F2D78A'], straw: ['#C9A86A', '#4A3A1A', '#EED8A0'],
    paper: ['#F2E6C2', '#6A5A30', '#FFFFFF'], gourd: ['#C48A3C', '#4A2E10', '#F0C070'], wood: ['#8A5A34', '#3A2414', '#B88456'],
    ink: ['#2A2A31', '#0E0E12', '#55555F'], blue: ['#3d4a63', '#121828', '#6A7AA0'], fan: ['#EFE7D3', '#5A4A30', '#FFFFFF'],
  };
  function mats(S, names) {
    names.forEach((n, i) => { const [b, l, h] = COL[n]; S.mat(n, { base: hex(b), line: hex(l), grp: 3 + i, hi: hex(h), hiAt: 0.6, spec: ['brass', 'gourd'].includes(n) ? 0.8 : 0, specAt: 0.95 }); });
  }
  function glowMat(S, name, base, emit, grp = 9, add = 0.9) { S.mat(name, { base: hex(base), line: hex('#2A2410'), grp, hi: hex('#FFFFFF'), hiAt: 0.5, emit: hex(emit), emitAdd: add }); }
  function collar(S, cat, m, r = 0.014, grow = 1.1) {
    const [n0, n1] = cat.pose.neck; const d = [n1[1] - n0[1], n1[2] - n0[2]];
    const tilt = 40 + (Math.atan2(d[1], d[0]) * 180 / Math.PI - 18);
    return { node: C.LIB.cord(S, m, n1[0], n1[1] - 0.05, n1[2] - 0.015, 0.125 * grow, r, tilt), front: [n1[0], n1[1] - 0.11, n1[2] + 0.12] };
  }
  function base(S, vr, root) {
    const H = root.cat.H, hp = root.cat.pose.head;
    S.root = S.u(root.cat.node, ...(root.extra || []));
    S.bounds = root.bounds || root.cat.pose.bounds;
    S.params = { size: root.size || 1, rimColor: hex(root.rim || '#FFF1D6'), depthEdge: 0.03, aoScale: 0.025 };
    S.anchors = Object.assign({ fore: H.toW(0, 0.55 * H.R, 0.7 * H.R), eye: H.toW(0.36 * H.R, 0.06 * H.R, 0.75 * H.R), ear: H.toW(0.56 * H.R, 0.8 * H.R, -0.1 * H.R), head: [hp[0], hp[1], hp[2], H.R] }, root.anchors || {});
    S.overlay = (g, R) => C.whiskers(g, R, H);
    return S;
  }
  const grow = (bb, p) => [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.min(bb[2], p[2]), Math.max(bb[3], p[3]), Math.max(bb[4], p[4]), Math.max(bb[5], p[5])];
  const P6 = (arr) => arr.map(([zh, h, role]) => ({ zh, hex: h, role }));
  const CORE = [['石虎黃褐', '#C49A62', '主'], ['墨斑', '#3B2A1E', '斑'], ['腹白', '#F3ECDD', '副'], ['耳背黑', '#2B2320', '耳']];
  const tailTip = (cat) => { const t = cat.pose.tail; const p = t[t.length - 1]; return [p[0], p[1], p[2]]; };
  const belly = (cat) => { const n = cat.pose.neck[0]; return [n[0] + 0.18, n[1] - 0.22, n[2] - 0.08]; };

  // ================================================================== 01 山野本色 — Field-guide Tuanzi
  D.push({
    no: 1, zh: '山野本色', en: 'Field-guide Tuanzi', tag: '寫實向 naturalistic',
    idea: '最貼近真實石虎的版本：四足站姿、真實花紋，只把肚子吃圓；可愛來自圓肚與一臉心虛的表情。',
    ideaEn: 'The real Formosan leopard cat, honestly drawn — just overfed. The cute is in the belly and the guilty look.',
    culture: '花紋依台灣石虎實際特徵：額頭兩條白線、白頰線、圓耳背白斑、斑點毛色、環紋尾。頸上紅線繫一枚方孔銅錢——民間給孩子與家畜壓煞保平安。',
    model3d: '四足站姿骨架；花紋全走貼圖；尾 8 節骨骼。',
    palette: P6([...CORE, ['紅繩', '#B3262B', '點'], ['古銅', '#A8743A', '飾']]),
    callouts: [{ a: 'fore', zh: '額白雙線', en: 'twin white forehead lines', side: 'l' }, { a: 'ear', zh: '耳背白斑', en: 'white ear-back spots', side: 'r' }, { a: 'coin', zh: '紅繩方孔錢', en: 'red cord & cash coin', side: 'l' }, { a: 'tail', zh: '環紋粗尾', en: 'thick ringed tail', side: 'r' }, { a: 'belly', zh: '吃圓的肚子', en: 'the famous belly', side: 'r' }],
    hero: { yaw: 36, pitch: 9 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'brass']);
      const cat = C.cat(S, merge(BASE, { pose: 'stand', eye: { lid: 0.18, look: [0.25, -0.05] }, headRot: [0, 18, 4] }), vr);
      const col = collar(S, cat, 'red'); const f = col.front;
      const coin = C.LIB.coin(S, 'brass', f[0], f[1], f[2], 0.04, 72);
      return base(S, vr, { cat, extra: [col.node, coin], anchors: { coin: f, tail: tailTip(cat), belly: belly(cat) } });
    },
  });

  // ================================================================== 02 符貼額頭 — Talisman on the Forehead
  D.push({
    no: 2, zh: '符貼額頭', en: 'Talisman on the Forehead', tag: '太虛觀 comedy',
    idea: '他一緊張就到處亂竄，雲歸乾脆在他額頭貼一張鎮定符——他就這樣頂著符紙，一臉「我很冷靜」地坐著。',
    ideaEn: 'Whenever he panics he bolts, so 雲歸 slapped a calming talisman on his forehead — and there he sits, paper and all, insisting he is perfectly calm.',
    culture: '道教黃紙朱砂符；「額頭貼符」是台灣與港片殭屍片的經典畫面，這裡反用為喜劇——只是安神符，不涉任何神祇。',
    model3d: '坐姿；符紙為貼在頭部骨骼上的薄片網格（可隨頭擺動），符文為貼圖。',
    palette: P6([...CORE, ['符黃', '#F2E6C2', '符'], ['朱砂', '#C8282A', '字']]),
    callouts: [{ a: 'talisman', zh: '鎮定符', en: 'calming talisman', side: 'r' }, { a: 'eye', zh: '「我很冷靜」', en: '“I am perfectly calm”', side: 'l' }, { a: 'belly', zh: '圓肚', en: 'round belly', side: 'r' }],
    hero: { yaw: 22, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene();
      const tal = C.textDecal('安神鎮驚', '#C8282A', 64, 180, { bg: '#F2E6C2', border: '#C8282A', bw: 3, fs: 34 });
      S.mat('tal', { base: hex('#F2E6C2'), line: hex('#6A5A30'), grp: 3, hi: hex('#FFFFFF'), hiAt: 0.6 });
      const cat = C.cat(S, merge(BASE, { eye: { lid: 0.42, flatLid: true }, headRot: [-4, 6, 0] }), vr);
      const H = cat.H; const hp = cat.pose.head; const R = H.R;
      const tx = hp[0], ty = hp[1] + 0.3 * R, tz = hp[2] + 0.86 * R;
      const paper = S.t(S.r(S.box('tal', 0, 0, 0, 0.055, 0.14, 0.004, 0.002), 0, 0, 0, -18, 0, 0), tx, ty - 0.05, tz);
      const uv = C.planeUV(tx, ty - 0.05, tz, [-18, 0, 0], 0.055, 0.14);
      S.mats[S.names.tal].tex = (x, y, z, nx, ny, nz, sh) => { const q = uv(x, y, z); C.applyDecal(sh, tal, q[0], q[1]); };
      return base(S, vr, { cat, extra: [paper], anchors: { talisman: [tx + 0.04, ty - 0.03, tz + 0.01], belly: belly(cat) } });
    },
  });

  // ================================================================== 03 紅龜粿 — Red Turtle Cake
  D.push({
    no: 3, zh: '紅龜粿小偷', en: 'Red-turtle-cake Thief', tag: '貪吃 glutton',
    idea: '拜拜桌上的紅龜粿少了一個——他趴在旁邊，嘴角還有紅色，抱著另一個說：「這個是我替你們試吃的。」',
    ideaEn: 'A red turtle cake is missing from the offering table — he lies beside it, red crumbs on his chin, hugging another: “I was taste-testing it for you.”',
    culture: '紅龜粿：台灣祭祀與壽誕常見的紅色龜印米食，象徵長壽吉祥；拜拜後分食供品是民間習俗（他只是提早了）。',
    model3d: '人面獅身趴姿、前腳抱物；紅龜粿為獨立道具，龜殼紋路為法線＋貼圖。',
    palette: P6([...CORE, ['紅龜紅', '#D2343A', '粿'], ['米白', '#F6EEDC', '粿']]),
    callouts: [{ a: 'cake', zh: '紅龜粿', en: 'red turtle cake', side: 'r' }, { a: 'eye', zh: '「我是試吃」', en: '“just taste-testing”', side: 'l' }, { a: 'belly', zh: '又圓了一圈', en: 'even rounder', side: 'r' }],
    hero: { yaw: 28, pitch: 12 },
    scene(vr = {}) {
      const S = E.Scene();
      S.mat('kue', { base: hex('#D2343A'), line: hex('#4A0E10'), grp: 3, hi: hex('#FF8A7A'), hiAt: 0.55, tex: (x, y, z, nx, ny, nz, sh) => { if (ny > 0.55) { const r = Math.hypot(x - KX, z - KZ); const a = Math.atan2(z - KZ, x - KX); if (Math.abs(Math.sin(r * 90)) < 0.25 || (r < 0.05 && Math.abs(Math.sin(a * 3)) < 0.2)) sh.base = hex('#A8202A'); } } });
      const cat = C.cat(S, merge(BASE, { pose: 'sphinx', b: { R: 0.2, fat: 1.5 }, eye: { lid: 0.3 }, headRot: [-6, -14, -6], face: { mouth: 'chew' } }), vr);
      const fl = cat.pose.legs.FL; const pw = fl[fl.length - 1];
      var KX = pw[0] + 0.03, KZ = pw[2] + 0.13;
      const kue = S.ell('kue', KX, 0.045, KZ, 0.1, 0.045, 0.08);
      const kue2 = S.ell('kue', -0.42, 0.04, 0.36, 0.09, 0.04, 0.07);
      return base(S, vr, { cat, extra: [kue, kue2], anchors: { cake: [KX + 0.06, 0.07, KZ], belly: [0.3, 0.2, -0.1] }, bounds: grow(cat.pose.bounds, [-0.55, -0.01, -0.62, 0.42, 0.86, 0.6]) });
    },
  });

  // ================================================================== 04 驚慌失措 — Full Panic
  D.push({
    no: 4, zh: '驚慌失措', en: 'Full Panic', tag: '招牌表情 signature',
    idea: '他的招牌表情：耳朵平貼、眼睛瞪成兩顆銅錢、毛炸開一圈、尾巴蓬成雞毛撢子——通常只是因為看到一隻蟑螂。',
    ideaEn: 'His signature look: ears pinned, eyes like two copper coins, fur puffed out, tail a feather duster — usually because of a cockroach.',
    culture: '台灣石虎個性機警怕人；把「炸毛」與「瞪眼」誇張成喜劇節拍，是他與雲歸的固定笑點。',
    model3d: '站姿＋炸毛（毛團位移加大）；耳朵骨骼後壓；瞳孔縮成點（眼睛貼圖切換）。',
    palette: P6([...CORE, ['驚嚇白', '#FFFFFF', '光'], ['紅繩', '#B3262B', '點']]),
    callouts: [{ a: 'eye', zh: '銅錢眼', en: 'eyes like copper coins', side: 'l' }, { a: 'ear', zh: '飛機耳', en: 'ears pinned back', side: 'r' }, { a: 'tail', zh: '雞毛撢子尾', en: 'feather-duster tail', side: 'r' }],
    hero: { yaw: 30, pitch: 6 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red']);
      const cat = C.cat(S, merge(BASE, { pose: 'stand', eye: { lid: 0, pupil: 'dot', pw: 0.12, w: 0.27, h: 0.29 }, head: { earTilt: 62 }, headRot: [-6, 26, 0], face: { mouth: 'o' }, body: { fur: 0.03, furF: 14, furSharp: 2.0, tailFur: 0.07, tailFurF: 12 } }), vr);
      const col = collar(S, cat, 'red');
      return base(S, vr, { cat, extra: [col.node], anchors: { tail: tailTip(cat) } });
    },
  });

  // ================================================================== 05 靈菇開示 — Mushroom Enlightenment
  D.push({
    no: 5, zh: '靈菇開示', en: 'Mushroom Enlightenment', tag: '迷幻 psychedelic',
    idea: '偷吃了雲歸的靈菇之後，他盤腿浮在半空，瞳孔變成兩個漩渦，頭上冒出一朵發光小菇，一本正經地說：「萬物……都是糰子。」',
    ideaEn: 'After stealing 雲歸’s spirit mushrooms he floats cross-legged, spiral-eyed, a glowing mushroom sprouting on his head, solemnly declaring: “All things… are Tuanzi.”',
    culture: '本作「靈視」主題的喜劇版：道家打坐、內景圖的幽默挪用；發光菌取材台灣山林螢光菇。不描繪任何神祇。',
    model3d: '蓮花坐姿＋整體上浮；漩渦瞳為眼睛貼圖；靈菇與周身幾何光環為 emissive 道具。',
    palette: P6([...CORE, ['靈菇青', '#7FFFD0', '光'], ['迷幻紫', '#B68CFF', '光']]),
    callouts: [{ a: 'eye', zh: '漩渦眼', en: 'spiral eyes', side: 'l' }, { a: 'shroom', zh: '頭頂靈菇', en: 'mushroom sprouting on his head', side: 'r' }, { a: 'halo', zh: '幾何光環', en: 'sacred-geometry halo', side: 'r' }],
    hero: { yaw: 16, pitch: 6 },
    stage: ['#3A2A5A', '#140F24'],
    scene(vr = {}) {
      const S = E.Scene(); glowMat(S, 'cap', '#E6D0FF', '#8A4AF0', 4, 1.0); glowMat(S, 'stem', '#EFFFF8', '#3AC9A0', 5, 0.7); glowMat(S, 'halo', '#D6FFF0', '#40E0B0', 6, 1.0);
      const lift = 0.16;
      const cat = C.cat(S, merge(BASE, { pose: 'lotus', eye: { pupil: 'spiral', pw: 0.5, lid: 0.05 }, headRot: [-4, 0, 0], face: { mouth: 'smile' } }), vr);
      cat.node = S.t(cat.node, 0, lift, 0);
      const hp = cat.pose.head; const R = cat.H.R; const top = [hp[0] + 0.05, hp[1] + lift + R * 0.92, hp[2] - 0.02];
      const shroom = S.u(S.cap('stem', top[0], top[1] - 0.02, top[2], top[0], top[1] + 0.07, top[2], 0.016), S.sub(S.ell('cap', top[0], top[1] + 0.08, top[2], 0.07, 0.05, 0.07), S.box('cap', top[0], top[1] + 0.03, top[2], 0.09, 0.05, 0.09)));
      const halo = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; halo.push(S.t(S.r(S.torus('halo', 0, 0, 0, 0.12, 0.006), 0, 0, 0, 90, 0, i * 30), Math.cos(a) * 0.12, hp[1] + lift + 0.05 + Math.sin(a) * 0.12, hp[2] - 0.32)); }
      return base(S, vr, { cat, extra: [shroom, ...halo], anchors: { shroom: [top[0] + 0.05, top[1] + 0.08, top[2]], halo: [0.24, hp[1] + lift + 0.05, hp[2] - 0.32] }, bounds: grow(cat.pose.bounds, [-0.46, -0.01, -0.5, 0.46, 1.4, 0.4]), rim: '#D6FFF0' });
    },
  });

  // ================================================================== 06 酒葫蘆 — Gourd Hideout
  D.push({
    no: 6, zh: '酒葫蘆', en: 'Gourd Hideout', tag: '雲歸 Yun Gui',
    idea: '雲歸的大酒葫蘆是他最愛的靠枕：抱著葫蘆打瞌睡，偶爾舔一口塞子——然後臉紅一整個下午。',
    ideaEn: '雲歸’s big wine gourd is his favourite pillow: he dozes hugging it, licks the stopper now and then — and stays pink-cheeked all afternoon.',
    culture: '葫蘆：道士與遊方者裝酒、裝藥的容器，諧音「福祿」；與雲歸定稿造型（v2 #01）的酒葫蘆同款。',
    model3d: '麵包趴姿靠著葫蘆道具；臉頰紅暈為貼圖疊加。',
    palette: P6([...CORE, ['葫蘆褐', '#C48A3C', '葫'], ['紅繩', '#B3262B', '點']]),
    callouts: [{ a: 'gourd', zh: '雲歸的酒葫蘆', en: '雲歸’s wine gourd', side: 'r' }, { a: 'eye', zh: '微醺', en: 'tipsy and pink', side: 'l' }, { a: 'tail', zh: '環紋尾', en: 'ringed tail', side: 'l' }],
    hero: { yaw: 30, pitch: 12 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['gourd', 'red', 'wood']);
      const cat = C.cat(S, merge(BASE, { pose: 'loaf', eye: { lid: 0.62 }, headRot: [6, 12, -8], face: { mouth: 'smile' } }), vr);
      const gx = 0.42, gz = 0.12;
      const gourd = S.su(0.03, S.sphere('gourd', gx, 0.17, gz, 0.17), S.sphere('gourd', gx, 0.4, gz, 0.11), S.cap('wood', gx, 0.5, gz, gx, 0.56, gz, 0.025));
      const cord = S.t(S.r(S.torus('red', 0, 0, 0, 0.07, 0.01), 0, 0, 0, 10, 0, 0), gx, 0.31, gz);
      return base(S, vr, { cat, extra: [gourd, cord], anchors: { gourd: [gx + 0.12, 0.3, gz], tail: tailTip(cat) }, bounds: grow(cat.pose.bounds, [-0.42, -0.01, -0.52, 0.62, 0.72, 0.54]) });
    },
  });

  // ================================================================== 07 斗笠雲遊 — Wandering with a Rain Hat
  D.push({
    no: 7, zh: '斗笠雲遊', en: 'Little Wanderer', tag: '旅途 travel',
    idea: '環島旅途上他自己背著一個小包袱、戴著小斗笠走在雲歸前面——包袱裡全是零食。',
    ideaEn: 'On the round-the-island journey he trots ahead of 雲歸 with his own little bundle and bamboo hat — the bundle is entirely snacks.',
    culture: '斗笠與包袱：清代台灣行旅的標準行頭；「雲遊」是道士四處行走修行之意。',
    model3d: '行走循環；斗笠為頭部附件、包袱為背部附件（布料擺動）。',
    palette: P6([...CORE, ['竹篾黃', '#C9A86A', '帽'], ['包袱藍', '#3d4a63', '布']]),
    callouts: [{ a: 'hat', zh: '小斗笠', en: 'tiny bamboo hat', side: 'r' }, { a: 'bundle', zh: '零食包袱', en: 'snack bundle', side: 'l' }, { a: 'tail', zh: '環紋尾', en: 'ringed tail', side: 'r' }],
    hero: { yaw: 52, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['straw', 'blue', 'red']);
      const cat = C.cat(S, merge(BASE, { pose: 'walk', eye: { lid: 0.12 }, headRot: [0, 12, 0], face: { mouth: 'smile' } }), vr);
      const hp = cat.pose.head, R = cat.H.R;
      const hat = C.LIB.douli(S, 'straw', hp[0], hp[1] + R * 0.8, hp[2] - R * 0.05, 0.26, 0.12, [-8, 0, 6]);
      const n = cat.pose.neck[0];
      const bundle = S.su(0.02, S.ell('blue', n[0], n[1] + 0.2, n[2] - 0.22, 0.12, 0.09, 0.11), S.sphere('blue', n[0], n[1] + 0.3, n[2] - 0.16, 0.035));
      const strap = S.t(S.r(S.torus('red', 0, 0, 0, 0.17, 0.008), 0, 0, 0, 70, 0, 0), n[0], n[1] + 0.12, n[2] - 0.12);
      return base(S, vr, { cat, extra: [hat, bundle, strap], anchors: { hat: [hp[0] + 0.12, hp[1] + R * 0.85, hp[2]], bundle: [n[0] - 0.1, n[1] + 0.22, n[2] - 0.22], tail: tailTip(cat) } });
    },
  });

  // ================================================================== 08 八卦護身 — Bagua Guardian (battle summon)
  D.push({
    no: 8, zh: '八卦護身', en: 'Bagua Guardian', tag: '戰鬥召喚 battle summon',
    idea: '被雲歸召喚上場時，他胸前的八卦牌亮起，腳下浮出一圈雷紋——他會很帥地站好三秒，然後躲到雲歸身後。',
    ideaEn: 'Summoned into battle, his bagua pendant lights up and a ring of thunder-script spreads at his feet — he poses heroically for three seconds, then hides behind 雲歸.',
    culture: '八卦牌與雷紋：取材正一派法器與雷法意象（對應雲歸的木／雷屬性），僅作護身器物，不描繪神祇。',
    model3d: '站姿；八卦牌 emissive；腳下光環為地面貼花特效（旋轉動畫）。',
    palette: P6([...CORE, ['雷青', '#9BE36A', '光'], ['古銅', '#C9A043', '飾']]),
    callouts: [{ a: 'bagua', zh: '發光八卦牌', en: 'glowing bagua pendant', side: 'l' }, { a: 'ring', zh: '雷紋光環', en: 'thunder-script ring', side: 'r' }, { a: 'eye', zh: '帥三秒', en: 'heroic (for 3 seconds)', side: 'l' }],
    hero: { yaw: 26, pitch: 14 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red']); glowMat(S, 'thunder', '#E6FFD0', '#7AD040', 4, 1.0); glowMat(S, 'bg', '#F2D78A', '#C99A30', 5, 0.8);
      const cat = C.cat(S, merge(BASE, { pose: 'stand', eye: { lid: 0.3, flatLid: true }, headRot: [-6, 8, 0], face: { mouth: 'flat' } }), vr);
      const col = collar(S, cat, 'red'); const f = col.front;
      const bagua = C.LIB.bagua(S, 'bg', f[0], f[1] - 0.01, f[2] + 0.01, 0.05, 78);
      const rings = [0.5, 0.58].map((r) => S.torus('thunder', 0, 0.01, 0.0, r, 0.007));
      const ticks = []; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; ticks.push(S.box('thunder', Math.cos(a) * 0.54, 0.01, Math.sin(a) * 0.54, 0.02, 0.004, 0.006)); }
      return base(S, vr, { cat, extra: [col.node, bagua, ...rings, ...ticks], anchors: { bagua: f, ring: [0.55, 0.02, 0.1] }, bounds: grow(cat.pose.bounds, [-0.62, -0.02, -0.62, 0.62, 1.06, 0.66]) });
    },
  });

  // ================================================================== 09 石虎真身 — True Spirit-beast Form
  D.push({
    no: 9, zh: '石虎真身', en: 'Spirit-beast True Form', tag: '覺醒形態 awakened / fantasy',
    idea: '真正危險的時候，他會變回山神坐騎般的石虎真身：身形拉長、斑紋燃起金色光點、尾巴拖著靈火——但肚子還是圓的。',
    ideaEn: 'In real danger he takes his true spirit-beast form: longer and leaner, rosettes burning with gold sparks, a trail of spirit-fire on his tail — though the belly stays round.',
    culture: '台灣原生石虎是瀕危的山林精靈象徵；「靈獸真身」為奇幻處理，金色斑點呼應他的燈火與五行之金。',
    model3d: '站姿（加長軀幹）；斑紋 emissive 遮罩；尾端靈火為粒子＋發光球。',
    palette: P6([...CORE, ['靈金', '#FFD27A', '光'], ['靈火', '#FF9A3C', '火']]),
    callouts: [{ a: 'spots', zh: '燃光斑紋', en: 'glowing rosettes', side: 'l' }, { a: 'fire', zh: '尾端靈火', en: 'spirit-fire tail', side: 'r' }, { a: 'belly', zh: '肚子還是圓的', en: 'still round', side: 'r' }],
    hero: { yaw: 40, pitch: 8 },
    stage: ['#4A3420', '#140E08'],
    scene(vr = {}) {
      const S = E.Scene(); glowMat(S, 'fire', '#FFE6B0', '#FF8A20', 4, 1.0);
      const cat = C.cat(S, merge(BASE, { pose: 'stand', b: { R: 0.19, fat: 1.15 }, colours: { spot: '#E8A030', base: '#B88A52' }, eye: { lid: 0.24, pupil: 'slit', pw: 0.14 }, headRot: [-4, 20, 0] }), vr);
      const tp = tailTip(cat);
      const flames = [[0, 0, 0, 0.05], [0.03, 0.08, -0.02, 0.035], [-0.02, 0.15, 0.01, 0.022], [0.04, 0.2, -0.03, 0.014]].map(([dx, dy, dz, r]) => S.sphere('fire', tp[0] + dx, tp[1] + dy, tp[2] + dz, r));
      const sparks = [[-0.3, 0.7, 0.2, 0.014], [0.32, 0.86, -0.1, 0.012], [-0.24, 0.42, -0.4, 0.012], [0.28, 0.5, 0.4, 0.01]].map(([x, y, z, r]) => S.sphere('fire', x, y, z, r));
      return base(S, vr, { cat, extra: [...flames, ...sparks], anchors: { spots: [-0.12, 0.55, 0.0], fire: [tp[0], tp[1] + 0.08, tp[2]], belly: belly(cat) }, bounds: grow(cat.pose.bounds, [-0.4, -0.01, -0.62, 0.4, 1.3, 0.62]), rim: '#FFD27A' });
    },
  });

  // ================================================================== 10 符扇午睡 — Nap on the Talisman Fan
  D.push({
    no: 10, zh: '符扇午睡', en: 'Nap on the Fan', tag: '日常 everyday',
    idea: '雲歸的符扇一攤開，就成了他的床：肚子朝天、四腳亂伸，睡到打呼——這把扇子從此只能拿來搧他。',
    ideaEn: 'Once 雲歸 opens his talisman fan, it becomes a bed: belly up, paws everywhere, snoring — and from then on the fan is only good for fanning him.',
    culture: '摺扇與符：道士以扇作法器的意象（雲歸武器「符扇」）；扇面寫「太虛」二字，呼應太虛觀。',
    model3d: '人面獅身側躺變體（腹部朝上的 idle 動畫）；摺扇為場景道具，扇面字為貼圖。',
    palette: P6([...CORE, ['扇面', '#EFE7D3', '扇'], ['扇骨', '#8A5A34', '骨']]),
    callouts: [{ a: 'fan', zh: '雲歸的符扇', en: '雲歸’s talisman fan', side: 'l' }, { a: 'eye', zh: '睡到打呼', en: 'snoring', side: 'r' }, { a: 'belly', zh: '肚子朝天', en: 'belly to the sky', side: 'r' }],
    hero: { yaw: 24, pitch: 22 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['fan', 'wood', 'red']);
      const cat = C.cat(S, merge(BASE, { pose: 'sphinx', eye: { shape: 'closed', lid: 1 }, headRot: [10, -18, -16], face: { mouth: 'smile' } }), vr);
      const fanParts = []; const n = 13;
      for (let i = 0; i < n; i++) { const a = (-70 + i * (140 / (n - 1))); fanParts.push(S.t(S.r(S.box(i % 2 ? 'fan' : 'wood', 0, 0, 0.36, 0.035, 0.006, 0.36, 0.003), 0, 0, 0, 0, a, 0), 0, 0.006, -0.32)); }
      return base(S, vr, { cat, extra: fanParts, anchors: { fan: [-0.5, 0.01, 0.1], belly: [0.25, 0.25, -0.05] }, bounds: grow(cat.pose.bounds, [-0.75, -0.01, -0.68, 0.75, 0.86, 0.6]) });
    },
  });
})(window);
