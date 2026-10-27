// Font loading: prefer the bundled 霞鶩文楷 subset (js/core/fontdata.js, optional),
// fall back to system Kaiti/Song fonts available on macOS / other systems.
'use strict';
G.FONT_FAMILY = '"QDKai","LXGW WenKai TC","Kaiti TC","STKaiti","BiauKai","DFKai-SB","Songti TC","STSong","PingFang TC","Noto Serif TC","Noto Sans TC","Microsoft JhengHei","WenQuanYi Zen Hei",serif';
G.font = (size, bold) => `${bold ? 'bold ' : ''}${size}px ${G.FONT_FAMILY}`;

G.loadFonts = async function () {
  const tasks = [];
  if (window.QD_FONTDATA && window.FontFace) {
    for (const part of window.QD_FONTDATA) {
      try {
        const bin = atob(part.data);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const ff = new FontFace('QDKai', buf.buffer, part.range ? { unicodeRange: part.range } : {});
        tasks.push(ff.load().then((f) => document.fonts.add(f)).catch(() => {}));
      } catch (e) { /* ignore broken part */ }
    }
  }
  await Promise.race([Promise.all(tasks), G.U.sleepReal(4000)]);
  try {
    await Promise.race([document.fonts.load(G.font(20), '彼岸燈'), G.U.sleepReal(1500)]);
  } catch (e) { /* ignore */ }
};
