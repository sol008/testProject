// 彼岸燈 Shorelight — design pass v2 — 麻糬 Mochi: big fluffy long-haired dilute calico, 白芷's silent companion (10 options)
// Identity (dilute-calico patches, white ruff/legs/mittens, chartreuse eyes, pink nose, lynx tips, plume tail, serene look)
// is fixed by the client reference (docs/design/REFERENCES.md); options vary pose, charms and the fantasy treatment.
'use strict';
(function (G) {
  const E = G.SDF, C = G.CATKIT; const { hex } = E;
  const D = G.DESIGNS = [];
  G.SCENE_OF = (key) => D.find((d) => d.no === key.no).scene(key.variant || {});
  G.SHEET = {
    title: '麻糬', sub: 'Mochi — fluffy long-haired dilute calico · 白芷’s companion · water-element healing purr · 10 design options · v2',
    blurb: '九份茶樓的大長毛淡三花，感應到燈靈的光，第一眼就認定了白芷。造型身份固定依客戶照片：白色胸前大毛領與白襪「手套」、灰藍與奶油杏色的頭背色塊、黃綠大眼、粉紅鼻、耳尖簇毛、蓬鬆大尾巴；恬靜高雅、從不說話。十款只變化姿勢、配飾與奇幻處理。',
  };
  const BASE = {
    coat: 'calico', b: { R: 0.2, fat: 1.32 },
    head: { cheek: 0.9, earSize: 1.15, earFlare: 18, lynx: 1, skullW: 1.02, tuftW: 1.5, tuftList: [[-0.02, 0.26, 18], [-0.22, 0.32, -6], [-0.44, 0.28, -30], [-0.62, 0.22, -52]] },
    eye: { lid: 0.1, pupil: 'round', pw: 0.34, tilt: 0.08, w: 0.24, h: 0.25, yaw: 26 },
    face: { mouth: 'w' },
    // reference: white chest bib, belly, legs; patches only on head/back/upper flanks
    white: (x, y, z, nx, ny, nz) => Math.max(E.sstep(-0.05, 0.4, nz) * E.sstep(0.66, 0.5, y), E.sstep(-0.1, -0.45, ny), E.sstep(0.26, 0.14, y)),
    body: { fur: 0.02, furF: 11, furSharp: 1.5, legFur: 0.006, tailFur: 0.04, tailFurF: 9 },
  };
  const merge = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && typeof b[k] !== 'function') ? Object.assign({}, a[k] || {}, b[k]) : b[k]; return o; };

  const COL = {
    red: ['#B3262B', '#4A0E10', '#E0565A'], jade: ['#9FD3BD', '#24503E', '#D8F5E6'], silver: ['#D7DBE2', '#4A505A', '#FFFFFF'],
    indigo: ['#36598A', '#14223A', '#6A8AC0'], sky: ['#A9C9E6', '#3A5A7A', '#E6F2FF'], gold: ['#D9B04A', '#4A3510', '#FFE7A0'],
    bamboo: ['#B89A5A', '#4A3A1A', '#E8D29A'], paper: ['#F1E6CF', '#6A5A40', '#FFFFFF'], ink: ['#2A2A31', '#0E0E12', '#55555F'],
  };
  function mats(S, names) {
    names.forEach((n, i) => { const [b, l, h] = COL[n]; S.mat(n, { base: hex(b), line: hex(l), grp: 3 + i, hi: hex(h), hiAt: 0.6, spec: ['jade', 'gold', 'silver'].includes(n) ? 0.85 : 0, specAt: 0.95 }); });
  }
  function glowMat(S, name, base, emit, grp = 9, add = 0.9) { S.mat(name, { base: hex(base), line: hex('#1E3A4A'), grp, hi: hex('#FFFFFF'), hiAt: 0.5, emit: hex(emit), emitAdd: add }); }
  function collar(S, cat, m, r = 0.013, grow = 1.08) {
    const [n0, n1] = cat.pose.neck; const d = [n1[1] - n0[1], n1[2] - n0[2]];
    const tilt = 40 + (Math.atan2(d[1], d[0]) * 180 / Math.PI - 18);
    return { node: C.LIB.cord(S, m, n1[0], n1[1] - 0.05, n1[2] - 0.01, 0.13 * grow, r, tilt), front: [n1[0], n1[1] - 0.12, n1[2] + 0.13] };
  }
  function base(S, vr, root) {
    const H = root.cat.H, hp = root.cat.pose.head;
    S.root = S.u(root.cat.node, ...(root.extra || []));
    S.bounds = root.bounds || root.cat.pose.bounds;
    S.params = { size: root.size || 1, rimColor: hex(root.rim || '#FFF6EC'), depthEdge: 0.03, aoScale: 0.022 };
    S.anchors = Object.assign({ eye: H.toW(0.36 * H.R, 0.06 * H.R, 0.75 * H.R), ear: H.toW(0.5 * H.R, 0.95 * H.R, -0.05 * H.R), head: [hp[0], hp[1], hp[2], H.R] }, root.anchors || {});
    S.overlay = (g, R) => C.whiskers(g, R, H, { len: 1.6 });
    return S;
  }
  const grow = (bb, p) => [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.min(bb[2], p[2]), Math.max(bb[3], p[3]), Math.max(bb[4], p[4]), Math.max(bb[5], p[5])];
  const P6 = (arr) => arr.map(([zh, h, role]) => ({ zh, hex: h, role }));
  const CORE = [['雪白', '#F5F2EC', '主'], ['灰藍', '#9BA3AE', '斑'], ['奶油杏', '#EBC79D', '斑'], ['黃綠眼', '#C9D84A', '眼']];

  // ================================================================== 01 茶樓麻糬 — Teahouse Floof (canon)
  D.push({
    no: 1, zh: '茶樓麻糬', en: 'Teahouse Floof', tag: '原型 canon',
    idea: '最忠於照片的原型：坐得端莊、胸前大毛領蓬成一朵雲，黃綠大眼安靜地望著白芷——像是早就在等她。',
    ideaEn: 'Closest to the photo: a stately sit, a white ruff like a cloud, big chartreuse eyes quietly on 白芷 — as if she had been waiting for her.',
    culture: '頸上紅繩繫一顆小玉珠——與白芷的紅繩玉牌成對；台灣人以紅繩、玉飾護身祈平安。',
    model3d: '長毛：軀幹/尾巴用毛團位移（shell/fin 毛髮），耳尖簇毛；三花色塊全為貼圖。',
    palette: P6([...CORE, ['粉鼻', '#EC9FA8', '鼻'], ['紅繩玉', '#9FD3BD', '點']]),
    callouts: [{ a: 'ear', zh: '耳尖簇毛', en: 'lynx ear tips', side: 'r' }, { a: 'eye', zh: '黃綠大眼', en: 'big chartreuse eyes', side: 'r' }, { a: 'ruff', zh: '白毛領', en: 'white cloud ruff', side: 'l' }, { a: 'bead', zh: '紅繩玉珠', en: 'red cord & jade bead', side: 'l' }, { a: 'tail', zh: '蓬鬆大尾巴', en: 'plume tail', side: 'r' }],
    hero: { yaw: -26, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'jade']);
      const cat = C.cat(S, merge(BASE, { headRot: [-4, -8, 0] }), vr);
      const col = collar(S, cat, 'red');
      const bead = S.sphere('jade', col.front[0], col.front[1], col.front[2] - 0.01, 0.024);
      const tl = cat.pose.tail; const tip = tl[tl.length - 1];
      return base(S, vr, { cat, extra: [col.node, bead], anchors: { ruff: [0.0, 0.42, 0.25], bead: col.front, tail: [tip[0], tip[1], tip[2]] } });
    },
  });

  // ================================================================== 02 窗邊雲團 — Windowsill Cloud
  D.push({
    no: 2, zh: '窗邊雲團', en: 'Windowsill Cloud', tag: '日常 everyday',
    idea: '茶樓二樓窗邊的一朵雲：趴成麵包，對著白芷慢慢眨眼——貓的「我愛你」。',
    ideaEn: 'A cloud on the teahouse’s upstairs sill: loafed, giving 白芷 a long slow blink — the cat way of saying “I love you”.',
    culture: '淺藍絲帶取自白芷藍衫的袖口色；茶樓窗台曬太陽的貓是九份山城的日常風景。',
    model3d: '麵包趴姿；慢眨眼為眼皮混合動畫（idle 隨機觸發）；絲帶蝴蝶結為兩個扁橢球＋結。',
    palette: P6([...CORE, ['袖口淺藍', '#A9C9E6', '帶'], ['粉鼻', '#EC9FA8', '鼻']]),
    callouts: [{ a: 'eye', zh: '慢眨眼', en: 'slow blink of affection', side: 'r' }, { a: 'bow', zh: '淺藍絲帶', en: 'pale-blue silk bow', side: 'l' }, { a: 'body', zh: '長毛麵包', en: 'long-haired loaf', side: 'r' }],
    hero: { yaw: -30, pitch: 14 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['sky']);
      const cat = C.cat(S, merge(BASE, { pose: 'loaf', eye: { lid: 0.62 }, headRot: [4, -6, 4] }), vr);
      const col = collar(S, cat, 'sky', 0.012); const f = col.front;
      const bow = S.u(S.rell('sky', f[0] - 0.05, f[1] + 0.02, f[2], 0.055, 0.032, 0.014, 0, 0, 22), S.rell('sky', f[0] + 0.05, f[1] + 0.02, f[2], 0.055, 0.032, 0.014, 0, 0, -22), S.sphere('sky', f[0], f[1] + 0.02, f[2] + 0.01, 0.02));
      return base(S, vr, { cat, extra: [col.node, bow], anchors: { bow: [f[0], f[1] + 0.02, f[2] + 0.02], body: [-0.24, 0.22, -0.1] } });
    },
  });

  // ================================================================== 03 玉牌成對 — Matching Jade Tag
  D.push({
    no: 3, zh: '玉牌成對', en: 'Matching Jade Tag', tag: '白芷 Bai Zhi',
    idea: '白芷把紅繩上的玉牌分她一半——兩塊「白芷」玉牌一大一小；她抬頭望向遠處，和白芷一樣像在聽什麼聲音。',
    ideaEn: '白芷 shares her red-string jade tag — a big one and a small one. Mochi gazes up and away, just like 白芷, as if listening for something far off.',
    culture: '玉牌與紅繩：台灣人佩玉保平安、紅線結緣；與女主角定稿造型（v2 #02）的紅繩玉牌成對。',
    model3d: '坐姿、頭部上揚 15°（向上的視線）；玉牌為擺錘骨骼，刻字為法線貼圖。',
    palette: P6([...CORE, ['玉白綠', '#9FD3BD', '玉'], ['紅繩', '#B3262B', '點']]),
    callouts: [{ a: 'tag', zh: '小玉牌', en: 'little jade tag', side: 'l' }, { a: 'eye', zh: '望向遠方', en: 'faraway gaze, like 白芷', side: 'r' }, { a: 'ruff', zh: '白毛領', en: 'white cloud ruff', side: 'l' }],
    hero: { yaw: -20, pitch: 6 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'jade', 'gold']);
      const cat = C.cat(S, merge(BASE, { headRot: [-16, 14, 0], eye: { look: [0.2, 0.35], lid: 0.16 } }), vr);
      const col = collar(S, cat, 'red', 0.011); const f = col.front;
      const tag = S.u(S.box('jade', f[0], f[1] - 0.045, f[2] - 0.005, 0.03, 0.045, 0.008, 0.006), S.sphere('gold', f[0], f[1] + 0.005, f[2], 0.01));
      return base(S, vr, { cat, extra: [col.node, tag], anchors: { tag: [f[0], f[1] - 0.045, f[2]], ruff: [0.0, 0.42, 0.25] } });
    },
  });

  // ================================================================== 04 水燈守望 — Water-lantern Watch
  D.push({
    no: 4, zh: '水燈守望', en: 'Water-lantern Watch', tag: '中元 Ghost Month',
    idea: '中元夜，她趴在一盞水燈頭旁守著；燈光映在眼裡，像兩顆小月亮——她是第一個發現白芷從海上漂回來的。',
    ideaEn: 'On Ghost-Month night she keeps watch beside a water lantern; its light sits in her eyes like two small moons. She was the first to see 白芷 drift back from the sea.',
    culture: '中元普渡「放水燈」：紙紮水燈頭（屋形）順水漂流，為水中孤魂照路；為本作開場的核心意象。',
    model3d: '人面獅身趴姿；水燈頭為發光道具（可作場景光源）；眼睛高光加入燈色反射。',
    palette: P6([...CORE, ['燈紅', '#C8332E', '燈'], ['燈火', '#FFC870', '光']]),
    callouts: [{ a: 'lantern', zh: '水燈頭', en: 'house-shaped water lantern', side: 'l' }, { a: 'eye', zh: '眼中燈火', en: 'lantern light in her eyes', side: 'r' }, { a: 'tail', zh: '盤起的大尾巴', en: 'plume tail curled round', side: 'r' }],
    hero: { yaw: -34, pitch: 12 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['red', 'ink', 'paper']);
      S.mat('lamp', { base: hex('#F1E6CF'), line: hex('#6A3A20'), grp: 8, hi: hex('#FFFFFF'), hiAt: 0.5, emit: hex('#C86A20'), emitAdd: 0.8 });
      const cat = C.cat(S, merge(BASE, { pose: 'sphinx', headRot: [0, -12, 0], eye: { lid: 0.08 } }), vr);
      const lx = -0.42, lz = 0.36;
      const house = S.u(S.box('lamp', lx, 0.11, lz, 0.1, 0.08, 0.09, 0.008), S.box('red', lx, 0.025, lz, 0.13, 0.025, 0.12, 0.008));
      const roof = S.t(S.r(S.box('red', 0, 0, 0, 0.13, 0.012, 0.12, 0.004), 0, 0, 0, 0, 0, 28), lx - 0.055, 0.215, lz);
      const roof2 = S.t(S.r(S.box('red', 0, 0, 0, 0.13, 0.012, 0.12, 0.004), 0, 0, 0, 0, 0, -28), lx + 0.055, 0.215, lz);
      return base(S, vr, { cat, extra: [house, roof, roof2], anchors: { lantern: [lx - 0.1, 0.15, lz], tail: [0.3, 0.12, -0.45] }, bounds: grow(cat.pose.bounds, [-0.6, -0.01, -0.62, 0.42, 0.86, 0.56]) });
    },
  });

  // ================================================================== 05 藍衫雲肩 — Little Hakka Cape
  D.push({
    no: 5, zh: '藍衫雲肩', en: 'Little Hakka Cape', tag: '搭檔 partner look',
    idea: '白芷用藍衫剩下的布，替她縫了一件小雲肩——靛藍底、淺藍滾邊；她穿上之後坐得更挺了。',
    ideaEn: '白芷 sewed her a tiny cloud collar from the leftover 藍衫 cloth — indigo with pale-blue piping. Mochi sits even taller in it.',
    culture: '雲肩：傳統婦女禮服的披肩飾；配色取自客家藍衫（女主角定稿 v2 #02），成為一對「客家伴侶裝」。',
    model3d: '坐姿；雲肩為肩頸部一片布料網格（4 片雲頭），隨身體骨骼變形。',
    palette: P6([...CORE, ['藍衫靛', '#36598A', '衣'], ['袖口淺藍', '#A9C9E6', '邊']]),
    callouts: [{ a: 'cape', zh: '小雲肩', en: 'tiny cloud collar', side: 'l' }, { a: 'pipe', zh: '淺藍滾邊', en: 'pale-blue piping', side: 'r' }, { a: 'eye', zh: '端莊', en: 'composed and proud', side: 'r' }],
    hero: { yaw: -22, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['indigo', 'sky']);
      const cat = C.cat(S, merge(BASE, { headRot: [-6, -4, 0] }), vr);
      const [n0, n1] = cat.pose.neck; const cx = n1[0], cy = n1[1] - 0.09, cz = n1[2] - 0.02;
      const lobes = []; const pipes = [];
      for (let i = 0; i < 4; i++) {
        const a = (-0.75 + i * 0.5) * Math.PI / 2; const x = cx + Math.sin(a) * 0.17, z = cz + Math.cos(a) * 0.15;
        lobes.push(S.rell('indigo', x, cy - 0.02, z, 0.085, 0.03, 0.07, 0, a * 180 / Math.PI, 0));
        pipes.push(S.t(S.r(S.torus('sky', 0, 0, 0, 0.068, 0.008), 0, 0, 0, 0, a * 180 / Math.PI, 0), x, cy - 0.04, z));
      }
      const cape = S.su(0.03, S.ell('indigo', cx, cy + 0.02, cz, 0.16, 0.04, 0.14), ...lobes);
      return base(S, vr, { cat, extra: [cape, ...pipes], anchors: { cape: [cx - 0.12, cy, cz + 0.12], pipe: [cx + 0.15, cy - 0.04, cz + 0.08] } });
    },
  });

  // ================================================================== 06 療癒呼嚕 — Healing Purr
  D.push({
    no: 6, zh: '療癒呼嚕', en: 'Healing Purr', tag: '戰鬥支援 battle support',
    idea: '戰鬥中她閉上眼開始呼嚕，一圈圈水色光環從身上漾開，像水面的漣漪——同伴的傷口跟著慢慢合起來。',
    ideaEn: 'In battle she closes her eyes and purrs; rings of water-light ripple out from her like a pond surface — and her allies’ wounds close with them.',
    culture: '水屬性治療：取「水能潤物」的五行意象；漣漪造型呼應她與白芷共有的「海／水燈」母題。',
    model3d: '坐姿閉眼＋呼嚕震動（細微縮放）；漣漪光環為 3 個擴散的 emissive 圓環特效，水珠為粒子。',
    palette: P6([...CORE, ['水光', '#7FD3FF', '光'], ['玉白綠', '#9FD3BD', '點']]),
    callouts: [{ a: 'ring', zh: '水色光環', en: 'water-light ripples', side: 'l' }, { a: 'eye', zh: '閉眼呼嚕', en: 'eyes closed, purring', side: 'r' }, { a: 'drop', zh: '水珠', en: 'floating droplets', side: 'r' }],
    hero: { yaw: -18, pitch: 16 },
    scene(vr = {}) {
      const S = E.Scene(); glowMat(S, 'aqua', '#BFEFFF', '#3AA8E0', 6, 1.0);
      const cat = C.cat(S, merge(BASE, { eye: { shape: 'closed', lid: 1 }, headRot: [6, 0, 0] }), vr);
      const rings = [0.42, 0.56, 0.7].map((r, i) => S.t(S.torus('aqua', 0, 0, 0, r, 0.008 - i * 0.0015), 0, 0.02 + i * 0.004, 0));
      const drops = [[-0.34, 0.62, 0.22, 0.02], [0.36, 0.5, 0.18, 0.016], [-0.24, 0.86, -0.1, 0.014], [0.28, 0.8, -0.04, 0.018]].map(([x, y, z, r]) => S.sphere('aqua', x, y, z, r));
      return base(S, vr, { cat, extra: [...rings, ...drops], anchors: { ring: [-0.5, 0.03, 0.3], drop: [0.36, 0.5, 0.18] }, bounds: grow(cat.pose.bounds, [-0.74, -0.02, -0.74, 0.74, 1.05, 0.74]), rim: '#DFF6FF' });
    },
  });

  // ================================================================== 07 尋靈之鼻 — Spirit-sniffer
  D.push({
    no: 7, zh: '尋靈之鼻', en: 'Spirit-sniffer', tag: '探索 exploration',
    idea: '她總能比人早一步找到藏起來的靈物：伸長脖子、鬍鬚往前，嗅著一朵在草叢裡發光的靈菇。',
    ideaEn: 'She always finds hidden spirit-things first: neck stretched, whiskers forward, sniffing a glowing spirit mushroom in the grass.',
    culture: '台灣山林常見的發光菌（螢光小菇）結合本作「靈視」主題；田野中貓狗嗅出異物的日常觀察。',
    model3d: '行走姿勢頭部前伸；靈菇為發光道具，作為「可調查」提示的場景物件。',
    palette: P6([...CORE, ['靈菇青', '#7FFFD0', '光'], ['靈菇紫', '#B68CFF', '光']]),
    callouts: [{ a: 'nose', zh: '前伸的鼻子', en: 'nose forward, whiskers up', side: 'r' }, { a: 'shroom', zh: '發光靈菇', en: 'glowing spirit mushroom', side: 'r' }, { a: 'tail', zh: '高翹大尾', en: 'plume tail held high', side: 'l' }],
    hero: { yaw: -48, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); glowMat(S, 'cap', '#C9F5FF', '#7A4AE0', 6, 1.0); glowMat(S, 'stem', '#EFFFF8', '#3AC9A0', 7, 0.7);
      const cat = C.cat(S, merge(BASE, { pose: 'walk', headRot: [14, 0, 0], eye: { lid: 0.2 } }), vr);
      const hp = cat.pose.head; const mx = hp[0] + 0.02, mz = hp[2] + 0.36;
      const shroom = S.u(S.cap('stem', mx, 0.0, mz, mx, 0.1, mz, 0.018), S.sub(S.ell('cap', mx, 0.11, mz, 0.08, 0.06, 0.08), S.box('cap', mx, 0.05, mz, 0.1, 0.05, 0.1)), S.cap('stem', mx + 0.09, 0, mz + 0.05, mx + 0.09, 0.05, mz + 0.05, 0.01), S.sub(S.ell('cap', mx + 0.09, 0.055, mz + 0.05, 0.04, 0.03, 0.04), S.box('cap', mx + 0.09, 0.025, mz + 0.05, 0.05, 0.025, 0.05)));
      const tl = cat.pose.tail; const tip = tl[tl.length - 1];
      return base(S, vr, { cat, extra: [shroom], anchors: { nose: [hp[0], hp[1] - 0.02, hp[2] + 0.2], shroom: [mx, 0.13, mz], tail: [tip[0], tip[1], tip[2]] }, bounds: grow(cat.pose.bounds, [-0.4, -0.01, -0.62, 0.4, 1.06, 0.95]) });
    },
  });

  // ================================================================== 08 笛聲伴唱 — Flute Duet
  D.push({
    no: 8, zh: '笛聲伴唱', en: 'Flute Duet', tag: '山歌 folk song',
    idea: '白芷吹〈渡魂謠〉的時候，她會坐在玉笛旁邊，仰頭「喵」一聲接上——全隊公認她只會唱這一首。',
    ideaEn: 'When 白芷 plays “渡魂謠” she sits by the jade flute, lifts her chin and chirps along — the party agrees it is the only song she knows.',
    culture: '客家山歌對唱的「接歌」傳統；玉笛（竹笛形制）為女主角的武器與樂器。',
    model3d: '坐姿仰頭、張嘴（chirp 口型）；玉笛為場景道具；音符為 2D 特效。',
    palette: P6([...CORE, ['玉笛', '#9FD3BD', '笛'], ['紅繩', '#B3262B', '點']]),
    callouts: [{ a: 'mouth', zh: '「喵～」', en: 'chirping along', side: 'r' }, { a: 'flute', zh: '白芷的玉笛', en: '白芷’s jade flute', side: 'l' }, { a: 'ruff', zh: '白毛領', en: 'white cloud ruff', side: 'l' }],
    hero: { yaw: -24, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['jade', 'red', 'gold']);
      const cat = C.cat(S, merge(BASE, { headRot: [-24, -8, 0], face: { mouth: 'o' }, eye: { lid: 0.3, look: [0, 0.4] } }), vr);
      const fl = S.u(S.cap('jade', -0.5, 0.02, 0.38, -0.08, 0.02, 0.46, 0.017), S.cyl('gold', -0.48, 0.02, 0.384, 0.02, 0.006));
      const cord = S.cap('red', -0.5, 0.02, 0.38, -0.56, 0.01, 0.33, 0.004);
      const tag = S.box('jade', -0.58, 0.012, 0.32, 0.02, 0.012, 0.028, 0.004);
      const H = cat.H;
      return base(S, vr, { cat, extra: [fl, cord, tag], anchors: { mouth: H.toW(0, -0.48 * H.R, 0.85 * H.R), flute: [-0.3, 0.03, 0.42], ruff: [0.0, 0.42, 0.25] }, bounds: grow(cat.pose.bounds, [-0.62, -0.01, -0.45, 0.4, 1.05, 0.5]) });
    },
  });

  // ================================================================== 09 月下靈貓 — Moonlit Spirit Form
  D.push({
    no: 9, zh: '月下靈貓', en: 'Moonlit Spirit Form', tag: '靈體 spirit / fantasy',
    idea: '白芷想起自己是燈靈的那一夜，她身上的白毛也泛起月光，三花色塊變成淡淡的水墨——她一直都不只是貓。',
    ideaEn: 'The night 白芷 remembers she is the lamp spirit, Mochi’s white coat glows with moonlight and her patches fade to ink-wash — she was never only a cat.',
    culture: '民間「貓有九命、通靈」之說；造型以水墨暈染與月光為主，不援引任何特定神祇。',
    model3d: '行走姿勢＋全身 emissive 遮罩（白毛區）；周身飄浮光球為粒子；色塊改用淡化版貼圖。',
    palette: P6([['月白', '#EAF4FF', '主'], ['淡墨', '#AEB8C6', '斑'], ['淡杏', '#F2DCC0', '斑'], ['黃綠眼', '#C9D84A', '眼'], ['月光', '#BFE8FF', '光'], ['玉白綠', '#9FD3BD', '點']]),
    callouts: [{ a: 'body', zh: '月光白毛', en: 'moonlit coat', side: 'l' }, { a: 'orb', zh: '燈靈光點', en: 'lamp-spirit motes', side: 'r' }, { a: 'eye', zh: '更沉靜的眼', en: 'even stiller eyes', side: 'r' }],
    hero: { yaw: -40, pitch: 8 },
    scene(vr = {}) {
      const S = E.Scene(); glowMat(S, 'moon', '#E6F6FF', '#6AB8FF', 6, 1.0);
      const cat = C.cat(S, merge(BASE, { pose: 'walk', colours: { grey: '#AEB8C6', greyDark: '#97A2B2', cream: '#F2DCC0', creamDark: '#E6C8A6', white: '#EEF6FF', rim: '#BFE8FF' }, eye: { lid: 0.2 } }), vr);
      const orbs = [[-0.36, 0.9, 0.2, 0.03], [0.34, 0.74, 0.1, 0.024], [-0.2, 0.5, 0.6, 0.02], [0.3, 1.0, -0.3, 0.022], [-0.4, 0.4, -0.4, 0.018]].map(([x, y, z, r]) => S.sphere('moon', x, y, z, r));
      return base(S, vr, { cat, extra: orbs, anchors: { body: [-0.2, 0.5, -0.1], orb: [0.34, 0.74, 0.1] }, rim: '#BFE8FF', bounds: grow(cat.pose.bounds, [-0.45, -0.01, -0.6, 0.42, 1.08, 0.66]) });
    },
  });

  // ================================================================== 10 美濃紙傘 — Paper Umbrella
  D.push({
    no: 10, zh: '美濃紙傘', en: 'Oil-paper Umbrella', tag: '客家 Hakka craft',
    idea: '九份下雨的時候，白芷替她撐開一把小油紙傘插在身邊；她坐在傘下，像一幅客家花布上的畫。',
    ideaEn: 'When it rains in 九份, 白芷 plants a little oil-paper umbrella beside her; sitting under it she looks like a picture on Hakka floral cloth.',
    culture: '美濃油紙傘：客家傳統工藝，竹骨、棉紙、桐油，傘面繪花；「紙」與「子」諧音，有早生貴子、遮風避雨之意。',
    model3d: '坐姿；油紙傘為場景道具（竹骨傘面＝細分圓錐＋肋條），傘面花紋為貼圖。',
    palette: P6([...CORE, ['傘面朱', '#C8432B', '傘'], ['竹骨', '#B89A5A', '骨']]),
    callouts: [{ a: 'umb', zh: '美濃油紙傘', en: 'Meinong oil-paper umbrella', side: 'l' }, { a: 'eye', zh: '雨中的安靜', en: 'quiet in the rain', side: 'r' }, { a: 'tail', zh: '圍住腳的大尾巴', en: 'tail wrapped round her paws', side: 'r' }],
    hero: { yaw: -24, pitch: 10 },
    scene(vr = {}) {
      const S = E.Scene(); mats(S, ['bamboo', 'ink']);
      S.mat('umb', { base: hex('#C8432B'), line: hex('#4A140C'), grp: 7, hi: hex('#F28A60'), hiAt: 0.6, tex: (x, y, z, nx, ny, nz, sh) => { const a = Math.atan2(z - 0.0, x + 0.12); const r = Math.hypot(x + 0.12, z); if (Math.abs(Math.sin(a * 12)) < 0.08) sh.base = hex('#8A2A1A'); else if (r > 0.25 && r < 0.33 && Math.sin(a * 6) > 0.4) sh.base = hex('#F2D06A'); } });
      const cat = C.cat(S, merge(BASE, { headRot: [-8, -10, 0], eye: { lid: 0.22 } }), vr);
      const ux = -0.12, uy = 1.16, uz = 0.0;
      const prof = E.bez([0, 0.16, 0.08, 0.16, 0.3, 0.09, 0.46, 0.0], 8).concat([0.45, -0.012, 0, 0.145]); // flat [r,y,...] list
      const canopy = S.t(S.r(S.lathe('umb', 0, 0, 0, prof, 0.004, 24, 0.008), 0, 0, 0, -6, 0, 10), ux, uy - 0.16, uz);
      const shaft = S.cap('bamboo', ux + 0.03, 0.0, uz + 0.02, ux, uy, uz, 0.012);
      const tip = S.sphere('ink', ux, uy + 0.005, uz, 0.018);
      return base(S, vr, { cat, extra: [canopy, shaft, tip], anchors: { umb: [ux - 0.32, uy - 0.1, uz], tail: [0.25, 0.08, 0.2] }, bounds: grow(cat.pose.bounds, [-0.62, -0.01, -0.5, 0.42, 1.22, 0.5]) });
    },
  });
})(window);
