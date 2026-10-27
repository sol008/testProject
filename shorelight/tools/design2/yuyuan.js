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
  const BASE = { coat: 'tabby', b: { R: 0.19, fat: 1.25 }, head: { cheek: 1.15, earSize: 1.12, earFlare: 18, skullW: 1.04 }, eye: { lid: 0.34, flatLid: true, pupil: 'slit', pw: 0.16, tilt: 0.04, w: 0.21, h: 0.2 }, face: { mouth: 'w' }, body: { fur: 0.006, furF: 40 } };
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
})(window);
