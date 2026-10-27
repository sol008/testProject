// Localisation: Traditional Chinese (source language) and American English.
// All game text is authored in Chinese. At display time (G.Render.text / G.Render.wrap) strings are looked up:
//   1. exact match in the English dictionary
//   2. template match: keys may contain %s (any text, itself translated) or %d (a number), e.g.
//        '獲得 {y}%s{/} ×%d'  →  'Obtained {y}%s{/} ×%d'
//   3. otherwise the original text is shown.
// Dictionaries live in js/i18n/en_*.js and call G.I18N.add({ '中文': 'English', ... }).
'use strict';
G.I18N = (() => {
  const I = {};
  const dict = new Map();
  const templates = [];      // { re, src, dst, kinds }
  const memo = new Map();
  const CJK = /[㐀-鿿豈-﫿　-〿＀-￯]/;
  I.missing = new Set();
  I.trackMissing = false;

  I.lang = () => (G.settings && G.settings.lang) || 'zh';
  I.isEn = () => I.lang() === 'en';

  // Chapter dictionaries (js/i18n/en_chN.js) are also kept per chapter: a short line such as 「誰？」 may be
  // translated differently in two chapters, and the current chapter's own entry wins over the shared table.
  const byChapter = new Map();   // chapter number -> Map
  let memoCh = null;
  function scriptChapter() {
    const cs = typeof document !== 'undefined' && document.currentScript;
    const m = cs && /en_ch(\d+)[a-z]?\.js/.exec(cs.src || '');
    return m ? +m[1] : null;
  }

  I.add = function (obj, chapter) {
    const ch = chapter != null ? chapter : scriptChapter();
    let cd = null;
    if (ch != null) { cd = byChapter.get(ch); if (!cd) byChapter.set(ch, cd = new Map()); }
    for (const k in obj) {
      const v = obj[k];
      if (v == null || v === '') continue;
      if (k.includes('%s') || k.includes('%d')) {
        const kinds = [];
        const pattern = k.split(/(%s|%d)/).map((part) => {
          if (part === '%s') { kinds.push('s'); return '(.+?)'; }
          if (part === '%d') { kinds.push('d'); return '(-?[\\d,.]+)'; }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('');
        templates.push({ re: new RegExp('^' + pattern + '$', 's'), src: k, dst: v, kinds });
      } else if (cd) {
        // a chapter's wording never replaces shared UI/data text; it only fills gaps in the shared table
        cd.set(k, v);
        if (!dict.has(k)) dict.set(k, v);
      } else dict.set(k, v);
    }
    memo.clear();
  };

  function translate(s) {
    const cd = byChapter.get(memoCh);
    const own = cd && cd.get(s);
    if (own != null) return own;
    const d = dict.get(s);
    if (d != null) return d;
    for (const tp of templates) {
      const m = tp.re.exec(s);
      if (!m) continue;
      let i = 0;
      return tp.dst.replace(/%s|%d/g, (ph) => {
        const v = m[++i];
        return v == null ? ph : (ph === '%s' ? I.t(v) : v);
      });
    }
    return null;
  }

  // translate a display string (returns the input unchanged in Chinese mode or when no translation exists)
  I.t = function (s) {
    if (typeof s !== 'string' || !s || I.lang() !== 'en' || !CJK.test(s)) return s;
    const ch = G.state ? G.state.chapter : null;
    if (ch !== memoCh) { memoCh = ch; memo.clear(); }
    let r = memo.get(s);
    if (r !== undefined) return r;
    r = translate(s);
    if (r == null) {
      // multi-line text: translate each line separately
      if (s.includes('\n')) {
        const parts = s.split('\n').map((p) => I.t(p));
        r = parts.join('\n');
      } else {
        if (I.trackMissing) I.missing.add(s);
        r = s;
      }
    }
    if (memo.size > 6000) memo.clear();
    memo.set(s, r);
    return r;
  };

  I.count = () => dict.size + templates.length;
  return I;
})();
G.T = G.I18N.t;

// language-aware font stack: English prefers a book serif, falling back to the CJK stack
G.FONT_FAMILY_EN = '"Palatino","Palatino Linotype","Book Antiqua","Georgia","Times New Roman",' + G.FONT_FAMILY;
G.font = (size, bold) => `${bold ? 'bold ' : ''}${size}px ${G.I18N.isEn() ? G.FONT_FAMILY_EN : G.FONT_FAMILY}`;
