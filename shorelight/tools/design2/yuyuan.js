// 彼岸燈 Shorelight — design pass v2 — 芋圓 Yuyuan: chubby blue-grey tabby who adopts 星河 (10 options)
// Identity (coat, olive eyes, heavy build, deadpan look) is fixed by the client reference; options vary pose, charms,
// accessories and the fantasy treatment.
'use strict';
(function (G) {
  const E = G.SDF, C = G.CATKIT; const { hex, cmix, clamp, sstep, mix } = E; const ab = Math.abs;
  const D = G.DESIGNS = [];
  G.SCENE_OF = (key) => D.find((d) => d.no === key.no).scene(key.variant || {});
  G.SHEET = {
    title: '芋圓', sub: 'Yuyuan — chubby blue-grey tabby · adopts 星河 · earth-element body-block assist · 10 design options · v2',
    blurb: '一隻什麼都不怕、什麼都不屑的胖灰虎斑貓，已經決定星河歸他管。造型身份固定依客戶照片：藍灰虎斑短毛、銀色毛尖、額頭 M 字紋、圓臉腮幫、大立耳、橄欖綠圓眼、長白鬍鬚、厚重麵包體型。十款只變化姿勢、護身符與配件（平安符、紅繩、銅鈴、虎頭繡…）與奇幻處理。',
  };
  const BASE = { coat: 'tabby', b: { R: 0.19, fat: 1.42 }, head: { cheek: 1.15, earSize: 1.25, earFlare: 16, skullW: 1.04 }, eye: { lid: 0.34, flatLid: true, pupil: 'slit', pw: 0.16, tilt: 0.04, w: 0.21, h: 0.2 }, face: { mouth: 'w' }, body: {} };
  const merge = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && typeof b[k] !== 'function') ? Object.assign({}, a[k] || {}, b[k]) : b[k]; return o; };

  D.push({
    no: 1, zh: '灶腳胖虎', en: 'Kitchen Tabby', tag: '原型 canon',
    idea: '最忠於照片的原型：坐得像一袋米，腮幫鼓、半閉的橄欖綠眼睛寫滿「你又怎樣」。',
    ideaEn: 'Closest to the photo: sits like a sack of rice, full cheeks, half-lidded olive eyes that say “and you are…?”',
    culture: '頸繫紅繩與一顆銅鈴——台灣民間給貓狗繫鈴、紅繩避邪的老習慣；銅鈴響聲也讓星河知道他又溜進灶腳。',
    model3d: '標準坐姿骨架；虎斑、毛尖與 M 字全為貼圖。',
    palette: [{ zh: '藍灰', hex: '#8E97A3', role: '主' }, { zh: '虎斑墨', hex: '#545C69', role: '紋' }, { zh: '銀尖', hex: '#C3CAD3', role: '副' }, { zh: '口鼻白', hex: '#E3E5E8', role: '白' }, { zh: '橄欖綠', hex: '#9EA246', role: '眼' }, { zh: '紅繩', hex: '#B3262B', role: '點' }],
    callouts: [{ a: 'fore', zh: '額頭 M 字', en: 'classic “M” forehead', side: 'l' }, { a: 'eye', zh: '半垂橄欖眼', en: 'deadpan olive eyes', side: 'l' }, { a: 'bell', zh: '紅繩銅鈴', en: 'red cord & brass bell', side: 'r' }, { a: 'body', zh: '米袋身形', en: 'rice-sack bulk', side: 'r' }],
    hero: { yaw: 28, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); const spec = merge(BASE, {});
      const cat = C.cat(S, spec, vr);
      S.mat('cord', { base: hex('#B3262B'), line: hex('#4A0E10'), grp: 3, hi: hex('#E0565A'), hiAt: 0.6 });
      S.mat('brass', { base: hex('#C9A043'), line: hex('#4A3510'), grp: 4, spec: 0.9, specAt: 0.95, hi: hex('#F2D78A'), hiAt: 0.55 });
      const collar = C.LIB.cord(S, 'cord', 0, 0.55, 0.075, 0.118, 0.014, 18);
      const bell = C.LIB.bell(S, 'brass', 0, 0.49, 0.2, 0.03);
      S.root = S.u(cat.node, collar, bell);
      S.bounds = cat.pose.bounds;
      S.params = { size: 1, rimColor: hex('#F2F6FF'), depthEdge: 0.03, aoScale: 0.022 };
      const H = cat.H; const hp = cat.pose.head;
      S.anchors = { fore: H.toW(0, 0.55 * H.R, 0.7 * H.R), eye: H.toW(-0.36 * H.R, 0.06 * H.R, 0.75 * H.R), bell: [0, 0.49, 0.22], body: [0.24, 0.25, 0.0], head: [hp[0], hp[1], hp[2], H.R] };
      S.overlay = (g, R) => C.whiskers(g, R, H);
      return S;
    },
  });

  // ------------------------------------------------------------------ shared helpers for options 02–10
  const COL = {
    red: ['#B3262B', '#4A0E10', '#E0565A'], brass: ['#C9A043', '#4A3510', '#F2D78A'], gold: ['#D9B04A', '#4A3510', '#FFE7A0'],
    orange: ['#D9622A', '#5A2410', '#F2925A'], stone: ['#9C9384', '#3E3A33', '#C9C1B2'], wood: ['#8A5A34', '#3A2414', '#B88456'],
    paper: ['#F1E6CF', '#6A5A40', '#FFFFFF'], jade: ['#7FBF9F', '#24503E', '#C8F0DC'], ink: ['#2A2A31', '#0E0E12', '#55555F'],
  };
  function mats(S, names) {
    for (const n of names) {
      const [b, l, h] = COL[n];
      S.mat(n, { base: hex(b), line: hex(l), grp: 3 + names.indexOf(n), hi: hex(h), hiAt: 0.6, spec: n === 'brass' || n === 'gold' || n === 'jade' ? 0.85 : 0, specAt: 0.95 });
    }
  }
  // collar torus around the pose's neck (tilted to follow the neck direction)
  function collar(S, cat, m, r = 0.014, grow = 1) {
    const [n0, n1] = cat.pose.neck; const d = [n1[1] - n0[1], n1[2] - n0[2]];
    const tilt = 40 + (Math.atan2(d[1], d[0]) * 180 / Math.PI - 18);
    return { node: C.LIB.cord(S, m, n1[0], n1[1] - 0.05, n1[2] - 0.015, 0.118 * grow, r, tilt), front: [n1[0], n1[1] - 0.11, n1[2] + 0.11] };
  }
  function base(S, spec, vr, root, opts = {}) {
    opts = Object.assign({ bounds: root.bounds, rim: root.rim, size: root.size }, opts);
    const H = root.cat.H, hp = root.cat.pose.head;
    S.root = S.u(root.cat.node, ...root.extra);
    S.bounds = opts.bounds || root.cat.pose.bounds;
    S.params = { size: opts.size || 1, rimColor: hex(opts.rim || '#F2F6FF'), depthEdge: 0.03, aoScale: 0.022 };
    S.anchors = Object.assign({ fore: H.toW(0, 0.55 * H.R, 0.7 * H.R), eye: H.toW(-0.36 * H.R, 0.06 * H.R, 0.75 * H.R), head: [hp[0], hp[1], hp[2], H.R] }, root.anchors || {});
    S.overlay = (g, R) => C.whiskers(g, R, H);
    return S;
  }
  const P6 = (arr) => arr.map(([zh, h, role]) => ({ zh, hex: h, role }));
  const CORE = [['藍灰', '#8E97A3', '主'], ['虎斑墨', '#545C69', '紋'], ['銀尖', '#C3CAD3', '副'], ['橄欖綠', '#9EA246', '眼']];

  // ================================================================== 02 米袋麵包 — Loaf
  D.push({
    no: 2, zh: '米袋麵包', en: 'The Loaf', tag: '日常 everyday',
    idea: '把四隻腳收進肚子底下，變成一條灰色麵包；眼睛幾乎闔上，只留一條縫監視星河有沒有偷吃。',
    ideaEn: 'Paws tucked under, a grey bread loaf with a slit of olive eye still watching whether 星河 sneaks a snack.',
    culture: '頸繫紅繩小平安符袋——台灣人為家中孩子與牲口向廟裡求來平安符、裝進紅布小袋隨身佩戴的習慣。',
    model3d: '「麵包」趴姿骨架：四肢收進軀幹（不需腿部變形）；平安符袋為獨立道具，掛在頸部骨骼。',
    palette: P6([...CORE, ['口鼻白', '#E3E5E8', '白'], ['平安紅', '#B3262B', '點']]),
    callouts: [{ a: 'eye', zh: '一條縫的監視', en: 'slit-eyed surveillance', side: 'l' }, { a: 'pouch', zh: '平安符袋', en: 'red amulet pouch', side: 'r' }, { a: 'body', zh: '麵包體型', en: 'the loaf', side: 'r' }],
    hero: { yaw: 32, pitch: 12 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'gold']);
      const cat = C.cat(S, merge(BASE, { pose: 'loaf', eye: { lid: 0.62 }, headRot: [4, 0, -6] }), vr);
      const col = collar(S, cat, 'red');
      const pouch = C.LIB.pouch(S, 'red', col.front[0], col.front[1] - 0.02, col.front[2] + 0.02, 0.055, 0.07, 0.016, 8, 0);
      const knot = S.sphere('gold', col.front[0], col.front[1] + 0.025, col.front[2] + 0.02, 0.012);
      return base(S, null, vr, { cat, extra: [col.node, pouch, knot], anchors: { pouch: [col.front[0], col.front[1] - 0.02, col.front[2] + 0.03], body: [0.24, 0.22, -0.1] } });
    },
  });

  // ================================================================== 03 斗笠巡邏 — Rain-hat Patrol
  D.push({
    no: 3, zh: '斗笠巡邏', en: 'Rain-hat Patrol', tag: '跟班 sidekick',
    idea: '星河去哪他就跟去哪，下雨天戴著小斗笠慢吞吞地巡邏——一臉「我只是剛好也要往這邊走」。',
    ideaEn: 'Wherever 星河 goes, he “happens” to be walking that way too — in the rain, under a tiny bamboo hat.',
    culture: '斗笠是台灣農漁民的竹編遮陽擋雨帽；九份山城多雨，礦工與挑夫幾乎人手一頂。',
    model3d: '行走循環（貓的同側步）；斗笠為頭部骨骼附件，帶子用兩條細管。',
    palette: P6([...CORE, ['竹篾黃', '#C9A86A', '帽'], ['紅帶', '#B3262B', '點']]),
    callouts: [{ a: 'hat', zh: '小斗笠', en: 'tiny bamboo hat', side: 'r' }, { a: 'eye', zh: '剛好順路', en: '“just passing by”', side: 'l' }, { a: 'tail', zh: '高翹的尾巴', en: 'tail up = content', side: 'r' }],
    hero: { yaw: 50, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red']);
      S.mat('straw', { base: hex('#C9A86A'), line: hex('#4A3A1A'), grp: 5, hi: hex('#EED8A0'), hiAt: 0.6, tex: (x, y, z, nx, ny, nz, sh) => { const a = Math.atan2(z, x); if ((Math.sin(a * 36) + Math.sin(Math.hypot(x, z) * 140)) > 1.2) sh.base = hex('#B08E52'); } });
      const cat = C.cat(S, merge(BASE, { pose: 'walk', eye: { lid: 0.4 }, headRot: [0, 14, 0] }), vr);
      const hp = cat.pose.head, R = cat.H.R;
      const hat = C.LIB.douli(S, 'straw', hp[0], hp[1] + R * 0.78, hp[2] - R * 0.05, 0.26, 0.12, [-8, 0, 6]);
      const strapL = S.cap('red', hp[0] - R * 0.62, hp[1] + R * 0.55, hp[2], hp[0] - R * 0.55, hp[1] - R * 0.35, hp[2] + R * 0.3, 0.006);
      const strapR = S.cap('red', hp[0] + R * 0.62, hp[1] + R * 0.55, hp[2], hp[0] + R * 0.55, hp[1] - R * 0.35, hp[2] + R * 0.3, 0.006);
      const tl = cat.pose.tail; const tip = tl[tl.length - 1];
      return base(S, null, vr, { cat, extra: [hat, strapL, strapR], anchors: { hat: [hp[0] + 0.12, hp[1] + R * 0.85, hp[2]], tail: [tip[0], tip[1], tip[2]] } });
    },
  });

  // ================================================================== 04 平安銅錢 — Cash-coin Guardian
  D.push({
    no: 4, zh: '平安銅錢', en: 'Cash-coin Guardian', tag: '民俗 folk charm',
    idea: '坐得端正，胸前掛一串紅繩方孔錢與小八卦——不是為了好看，是星河的阿嬤硬給他戴的。他忍了。',
    ideaEn: 'Sitting very upright with a string of square-holed coins and a tiny bagua — 星河’s grandma insisted. He tolerates it.',
    culture: '紅繩串古銅錢（「壓煞錢」）與八卦牌是台灣民間常見的避邪護身物，常掛在孩童與家畜身上、門楣上。',
    model3d: '標準坐姿；銅錢串為沿頸部的實體環狀道具（5 枚），八卦牌為擺錘骨骼。',
    palette: P6([...CORE, ['古銅', '#A8743A', '飾'], ['紅繩', '#B3262B', '點']]),
    callouts: [{ a: 'coins', zh: '紅繩銅錢串', en: 'string of cash coins', side: 'r' }, { a: 'bagua', zh: '小八卦牌', en: 'tiny bagua pendant', side: 'r' }, { a: 'fore', zh: '額頭 M 字', en: 'classic “M” forehead', side: 'l' }],
    hero: { yaw: 22, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'brass']);
      const cat = C.cat(S, merge(BASE, { eye: { lid: 0.28 }, headRot: [-4, -6, 0] }), vr);
      const col = collar(S, cat, 'red', 0.011);
      const [n0, n1] = cat.pose.neck; const coins = [];
      for (let i = -2; i <= 2; i++) { const a = i * 0.42; coins.push(C.LIB.coin(S, 'brass', n1[0] + Math.sin(a) * 0.12, n1[1] - 0.07 - Math.abs(i) * 0.012, n1[2] + Math.cos(a) * 0.1 + 0.02, 0.026, 70, i * 22)); }
      const bagua = C.LIB.bagua(S, 'brass', col.front[0], col.front[1] - 0.05, col.front[2] + 0.03, 0.04, 78);
      return base(S, null, vr, { cat, extra: [col.node, ...coins, bagua], anchors: { coins: [n1[0] + 0.1, n1[1] - 0.08, n1[2] + 0.1], bagua: [col.front[0], col.front[1] - 0.05, col.front[2] + 0.05] } });
    },
  });

  // ================================================================== 05 燈籠舖看板 — Shop Mascot
  D.push({
    no: 5, zh: '燈籠舖看板', en: 'Lantern-shop Mascot', tag: '九份 Jiufen',
    idea: '陳記燈籠舖門口最有名的「招牌」：守著一盞剛糊好的小燈籠，客人想摸他，他就抬起一隻腳——不是打招呼，是警告。',
    ideaEn: 'The real sign of 陳記燈籠舖: guarding a freshly pasted lantern. He lifts a paw when customers reach out — not a wave, a warning.',
    culture: '九份老街的手糊紙燈籠：竹篾骨架、糊棉紙、上紅漆寫字；店家養貓防鼠護紙料是老行業的日常。',
    model3d: '抬手坐姿（右前腳抬起）；燈籠為發光材質（emissive）獨立道具，可作為場景光源。',
    palette: P6([...CORE, ['燈紅', '#C8332E', '燈'], ['燈火', '#FFC870', '光']]),
    callouts: [{ a: 'paw', zh: '抬腳警告', en: 'raised paw: “don’t.”', side: 'l' }, { a: 'lantern', zh: '手糊紙燈籠', en: 'hand-pasted lantern', side: 'r' }, { a: 'eye', zh: '冷眼', en: 'flat stare', side: 'l' }],
    hero: { yaw: 18, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'ink']);
      S.mat('lamp', { base: hex('#C8332E'), line: hex('#4A0E10'), grp: 6, hi: hex('#FF8A6A'), hiAt: 0.5, emit: hex('#7A2A10'), emitAdd: 0.6 });
      const cat = C.cat(S, merge(BASE, { pose: 'sitPaw', eye: { lid: 0.42 }, headRot: [0, 10, 0] }), vr);
      const lan = C.LIB.lantern(S, 'lamp', 'ink', 0.33, 0.13, 0.18, 0.1, 0.12, 14);
      const handle = S.cap('ink', 0.33, 0.25, 0.18, 0.33, 0.31, 0.18, 0.006);
      const fr = cat.pose.legs.FR; const pw = fr[fr.length - 1];
      return base(S, null, vr, { cat, extra: [lan, handle], anchors: { paw: [pw[0], pw[1], pw[2]], lantern: [0.38, 0.15, 0.24] }, bounds: [-0.42, -0.01, -0.45, 0.48, 1.02, 0.36] });
    },
  });

  // ================================================================== 06 茶樓帳房 — Teahouse Accountant
  D.push({
    no: 6, zh: '茶樓帳房', en: 'Teahouse Accountant', tag: '茶樓 teahouse',
    idea: '茶樓掌櫃說他是「帳房先生」：每天趴在帳本和算盤上，誰來結帳都得先等他起身——他通常不起身。',
    ideaEn: 'The teahouse calls him the bookkeeper: he naps on the ledger and abacus, and settling a bill means waiting for him to move. He rarely does.',
    culture: '清代台灣商號與茶樓用算盤記帳、線裝帳簿；「帳房」是掌管銀錢的職位。',
    model3d: '麵包趴姿＋帳本（方塊）與算盤（框＋桿＋珠）為場景道具，非角色骨骼的一部分。',
    palette: P6([...CORE, ['帳本藍', '#3B4A6B', '書'], ['算盤木', '#8A5A34', '木']]),
    callouts: [{ a: 'abacus', zh: '算盤', en: 'abacus', side: 'r' }, { a: 'ledger', zh: '線裝帳本', en: 'thread-bound ledger', side: 'l' }, { a: 'eye', zh: '「結帳？等等。」', en: '“the bill? wait.”', side: 'l' }],
    hero: { yaw: 30, pitch: 18 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['wood', 'ink', 'red']);
      S.mat('ledger', { base: hex('#3B4A6B'), line: hex('#121828'), grp: 7, hi: hex('#6A7AA0'), hiAt: 0.6 });
      S.mat('page', { base: hex('#EFE3C8'), line: hex('#6A5A40'), grp: 8, hi: hex('#FFFFFF'), hiAt: 0.6 });
      const lift = 0.07;
      const cat = C.cat(S, merge(BASE, { pose: 'loaf', eye: { lid: 0.7 }, headRot: [6, -10, -4] }), vr);
      const catN = S.t(cat.node, 0, lift, 0); cat.node = catN;
      const book = S.u(S.box('ledger', 0, lift * 0.5, -0.02, 0.36, lift * 0.5, 0.42, 0.01), S.box('page', 0.005, lift * 0.5, -0.02, 0.35, lift * 0.42, 0.425, 0.004));
      const ax = -0.3, az = 0.44, ay = 0.035;
      const parts = [S.box('wood', ax, ay, az, 0.2, 0.012, 0.06, 0.004), S.box('wood', ax, ay + 0.012, az - 0.055, 0.2, 0.012, 0.008, 0.004), S.box('wood', ax, ay + 0.012, az + 0.055, 0.2, 0.012, 0.008, 0.004), S.box('wood', ax, ay + 0.012, az + 0.015, 0.2, 0.012, 0.004, 0.002)];
      for (let i = 0; i < 9; i++) { const x = ax - 0.18 + i * 0.045; parts.push(S.cap('ink', x, ay + 0.024, az - 0.05, x, ay + 0.024, az + 0.05, 0.003)); for (const zz of [-0.03, -0.012, 0.035]) parts.push(S.ell('ink', x, ay + 0.024, az + zz, 0.016, 0.012, 0.009)); }
      const S2 = base(S, null, vr, { cat, extra: [book, ...parts], anchors: { abacus: [ax + 0.1, ay + 0.03, az], ledger: [-0.3, lift, -0.3] }, bounds: [-0.52, -0.01, -0.52, 0.42, 0.8, 0.56] });
      return S2;
    },
  });

  // ================================================================== 07 石獅繡球 — Stone-lion Homage
  D.push({
    no: 7, zh: '石獅繡球', en: 'Little Stone Lion', tag: '廟口 temple gate',
    idea: '廟口石獅踩著繡球，他就踩著一顆小繡球擺出同樣的姿勢——莊嚴、威武、而且明顯在等人誇他。',
    ideaEn: 'The temple-gate lions guard an embroidered ball; so does he — solemn, imposing, and very obviously waiting for praise.',
    culture: '台灣廟口一對石獅（雄獅踩繡球、雌獅護幼獅）與「舞獅戲球」的繡球；紅色綢緞結為吉慶裝飾。',
    model3d: '人面獅身趴姿；繡球為球體＋金色環帶貼圖，頸部紅綢大蝴蝶結用兩個扁橢球。',
    palette: P6([...CORE, ['繡球紅', '#C8332E', '球'], ['金線', '#D9B04A', '金']]),
    callouts: [{ a: 'ball', zh: '小繡球', en: 'embroidered ball', side: 'r' }, { a: 'bow', zh: '紅綢結', en: 'red silk bow', side: 'l' }, { a: 'eye', zh: '等人誇', en: 'awaiting praise', side: 'l' }],
    hero: { yaw: 26, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'gold']);
      S.mat('ball', { base: hex('#C8332E'), line: hex('#4A0E10'), grp: 6, hi: hex('#FF8A6A'), hiAt: 0.6, tex: (x, y, z, nx, ny, nz, sh) => { if (Math.abs(Math.sin(Math.atan2(nz, nx) * 4)) < 0.18 || Math.abs(ny) < 0.12) sh.base = hex('#D9B04A'); } });
      const cat = C.cat(S, merge(BASE, { pose: 'sphinx', eye: { lid: 0.18 }, headRot: [-8, 0, 0] }), vr);
      const fl = cat.pose.legs.FL; const pw = fl[fl.length - 1];
      const ball = S.sphere('ball', pw[0] + 0.02, 0.075, pw[2] + 0.1, 0.075);
      const col = collar(S, cat, 'red', 0.016);
      const f = col.front; const bow = S.u(S.rell('red', f[0] - 0.045, f[1] + 0.02, f[2] + 0.01, 0.05, 0.03, 0.015, 0, 0, 20), S.rell('red', f[0] + 0.045, f[1] + 0.02, f[2] + 0.01, 0.05, 0.03, 0.015, 0, 0, -20), S.sphere('red', f[0], f[1] + 0.02, f[2] + 0.02, 0.02));
      return base(S, null, vr, { cat, extra: [ball, col.node, bow], anchors: { ball: [pw[0] + 0.02, 0.1, pw[2] + 0.15], bow: [f[0], f[1] + 0.02, f[2] + 0.03] }, bounds: [-0.42, -0.01, -0.62, 0.42, 0.86, 0.72] });
    },
  });

  // ================================================================== 08 打坐胖子 — Meditation Master
  D.push({
    no: 8, zh: '打坐胖子', en: 'Meditation Master', tag: '太虛觀 Taoist temple',
    idea: '跟雲歸在太虛觀住了幾天，就學會了「打坐」：其實只是坐著睡覺，但姿勢比雲歸還標準。',
    ideaEn: 'After a few days at 太虛觀 he learned to “meditate” — he is just sleeping upright, but his posture beats 雲歸’s.',
    culture: '道教「打坐」靜坐修行；頸上八卦牌與小葫蘆是道觀常見法器的縮小版（幽默挪用，不描繪神像）。',
    model3d: '蓮花坐姿骨架（後腿盤起）；雙眼闔上用眼皮貼圖；八卦牌、葫蘆為頸部掛件。',
    palette: P6([...CORE, ['八卦銅', '#C9A043', '飾'], ['葫蘆', '#C48A3C', '葫']]),
    callouts: [{ a: 'eye', zh: '閉眼（睡著）', en: 'eyes shut (asleep)', side: 'l' }, { a: 'bagua', zh: '八卦牌', en: 'bagua pendant', side: 'r' }, { a: 'gourd', zh: '小葫蘆', en: 'tiny gourd', side: 'r' }],
    hero: { yaw: 14, pitch: 6 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'brass']);
      S.mat('gourd', { base: hex('#C48A3C'), line: hex('#4A2E10'), grp: 7, hi: hex('#F0C070'), hiAt: 0.55, spec: 0.6, specAt: 0.95 });
      const cat = C.cat(S, merge(BASE, { pose: 'lotus', eye: { lid: 0.96 }, headRot: [8, 0, 0] }), vr);
      const col = collar(S, cat, 'red', 0.011);
      const bagua = C.LIB.bagua(S, 'brass', col.front[0], col.front[1] - 0.04, col.front[2] + 0.03, 0.042, 80);
      const gx = 0.24, gy = 0.2, gz = 0.18;
      const gourd = S.su(0.012, S.sphere('gourd', gx, gy, gz, 0.045), S.sphere('gourd', gx, gy + 0.065, gz, 0.03), S.cap('red', gx, gy + 0.1, gz, gx, gy + 0.115, gz, 0.008));
      return base(S, null, vr, { cat, extra: [col.node, bagua, gourd], anchors: { bagua: [col.front[0], col.front[1] - 0.04, col.front[2] + 0.05], gourd: [gx + 0.04, gy, gz] } });
    },
  });

  // ================================================================== 09 坤土化身 — Earth Spirit Form
  D.push({
    no: 9, zh: '坤土化身', en: 'Earth-trigram Form', tag: '戰鬥形態 battle / fantasy',
    idea: '星河遇險時他會擋在前面：身旁升起一面刻著坤卦的石屏，背上的虎斑亮起琥珀色光——然後若無其事地舔腳。',
    ideaEn: 'When 星河 is in danger he plants himself in front: a stone slab carved with the 坤 trigram rises beside him, his stripes glow amber — then he licks a paw like nothing happened.',
    culture: '「坤」為八卦中的地，象徵承載與守護，對應他的土屬性「擋招」能力；石屏造型取材台灣石雕與石敢當的厚重感。',
    model3d: '站姿＋自地面升起的石屏（獨立道具，升起動畫）；虎斑發光用 emissive 遮罩貼圖。',
    palette: P6([...CORE, ['石灰', '#9C9384', '盾'], ['琥珀光', '#F0B24A', '光']]),
    callouts: [{ a: 'shield', zh: '坤卦石屏', en: 'stone slab, 坤 trigram', side: 'r' }, { a: 'stripes', zh: '琥珀虎斑', en: 'amber-glowing stripes', side: 'l' }, { a: 'eye', zh: '依然不屑', en: 'still unimpressed', side: 'l' }],
    hero: { yaw: 40, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['stone']);
      S.mat('rune', { base: hex('#F0B24A'), line: hex('#5A3A10'), grp: 6, hi: hex('#FFE0A0'), hiAt: 0.5, emit: hex('#F0A030'), emitAdd: 0.9 });
      const cat = C.cat(S, merge(BASE, { pose: 'stand', eye: { lid: 0.3 }, headRot: [0, -18, 0], colours: { spot: '#6A5A3C' } }), vr);
      // upright stone slab (石屏) rising beside him on the viewer side, 坤 ☷ trigram (three broken bars) glowing on its face
      const slabX = -0.42, slabY = 0.42, slabZ = 0.34;
      const shield = S.u(S.box('stone', slabX, slabY, slabZ, 0.03, 0.3, 0.2, 0.02), S.box('stone', slabX, slabY - 0.33, slabZ, 0.05, 0.035, 0.24, 0.015));
      const bars = []; for (let row = 0; row < 3; row++) for (const side of [-1, 1]) bars.push(S.box('rune', slabX - 0.032, slabY + 0.12 - row * 0.1, slabZ + side * 0.075, 0.006, 0.022, 0.06, 0.004));
      const pebbles = [[-0.3, 0.55, 0.5, 0.03], [0.28, 0.62, 0.42, 0.024], [-0.22, 0.2, 0.62, 0.02]].map(([x, y, z, r]) => S.sphere('stone', x, y, z, r));
      return base(S, null, vr, { cat, extra: [shield, ...bars, ...pebbles], anchors: { shield: [-0.46, 0.55, 0.34], stripes: [0.12, 0.55, 0.0] }, bounds: [-0.52, -0.01, -0.6, 0.42, 1.06, 0.66], rim: '#FFE0A0' });
    },
  });

  // ================================================================== 10 同款圍巾 — Partner Scarf
  D.push({
    no: 10, zh: '同款圍巾', en: 'Matching Scarf', tag: '搭檔 partner look',
    idea: '星河說他們是「搭檔」，硬是給他圍上同款的螢橙圍巾；他嘴上不屑，但從此再也不肯拿下來。',
    ideaEn: '星河 declared them partners and tied a matching ember-orange scarf on him. He scoffed — and has refused to take it off ever since.',
    culture: '與主角 v2 #07 螢火劍客的螢橙圍巾成對設計；長巾一端飄動的剪影呼應武俠片裡的俠客形象。',
    model3d: '坐姿；圍巾為頸部環＋一條 4 節飄帶骨骼（風力擺動）。',
    palette: P6([...CORE, ['螢橙', '#D9622A', '巾'], ['口鼻白', '#E3E5E8', '白']]),
    callouts: [{ a: 'scarf', zh: '螢橙同款圍巾', en: 'ember scarf, matches 星河', side: 'r' }, { a: 'tail2', zh: '飄動的巾尾', en: 'streaming scarf tail', side: 'r' }, { a: 'eye', zh: '嘴上不屑', en: 'pretends not to care', side: 'l' }],
    hero: { yaw: 34, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['orange']);
      const cat = C.cat(S, merge(BASE, { eye: { lid: 0.36 }, headRot: [-2, 16, 3] }), vr);
      const col = collar(S, cat, 'orange', 0.032, 1.05);
      const [n0, n1] = cat.pose.neck;
      const tailPts = [[n1[0] + 0.1, n1[1] - 0.06, n1[2] - 0.05, 0.03], [n1[0] + 0.22, n1[1] - 0.04, n1[2] - 0.12, 0.028], [n1[0] + 0.34, n1[1] - 0.09, n1[2] - 0.18, 0.024], [n1[0] + 0.44, n1[1] - 0.06, n1[2] - 0.26, 0.016]];
      const streamer = S.tube('orange', tailPts, 0.01);
      const front = S.cap('orange', n1[0] - 0.05, n1[1] - 0.08, n1[2] + 0.1, n1[0] - 0.07, n1[1] - 0.2, n1[2] + 0.13, 0.026);
      return base(S, null, vr, { cat, extra: [col.node, streamer, front], anchors: { scarf: [n1[0] - 0.06, n1[1] - 0.1, n1[2] + 0.14], tail2: [n1[0] + 0.4, n1[1] - 0.07, n1[2] - 0.22] }, bounds: [-0.4, -0.01, -0.45, 0.62, 1.02, 0.36] });
    },
  });
})(window);
