// shared page bootstrap for moya.html / tengpo.html
// ?view=front|side|back|bust  renders one view at 2x for close inspection
window.SHEET_PAGE = function (CH) {
  const q = new URLSearchParams(location.search);
  const cv = document.getElementById('c');
  const view = q.get('view');
  document.fonts.load('20px "WenQuanYi Zen Hei"').then(() => { try {
    if (!view) {
      K.sheet(cv, CH.SPEC);
    } else {
      const S = CH.SPEC;
      let v, sc = Number(q.get('scale') || 2), opts = {};
      if (view === 'bust') { v = S.bust; sc = Number(q.get('scale') || 4); opts = { lineScale: 0.55 }; }
      else if (view.startsWith('expr')) { v = S.exprs[Number(view.slice(4))]; sc = 4; opts = { lineScale: 0.5 }; }
      else v = S.views.find((x) => x.labelEn.toLowerCase().startsWith(view));
      const img = K.renderView(v.draw, v.box, sc, opts);
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = S.theme.paper0; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0);
    }
    } catch (e) { console.error(e.stack); }
    document.body.dataset.ready = '1';
  });
};
