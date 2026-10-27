// 《彼岸燈 完全攻略》 page script — inlined into docs/guide/guide_zh.html by tools/guide/build_guide.js
(function () {
  'use strict';
  var root = document.documentElement;
  // theme toggle (remembered per viewer; the page works without storage)
  var KEY = 'shorelight_guide_theme';
  try { var saved = localStorage.getItem(KEY); if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved); } catch (e) { /* no storage */ }
  var btn = document.querySelector('.theme-toggle');
  if (btn) btn.addEventListener('click', function () {
    var cur = root.getAttribute('data-theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* no storage */ }
  });
  // small screens: the table of contents starts folded
  var tocBox = document.querySelector('.toc-box');
  if (tocBox && window.matchMedia && matchMedia('(max-width: 960px)').matches) tocBox.removeAttribute('open');
  // highlight the current section in the table of contents
  var links = {};
  Array.prototype.forEach.call(document.querySelectorAll('.toc a'), function (a) { links[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
  if ('IntersectionObserver' in window) {
    var cur = null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var a = links[e.target.id];
        if (!a) return;
        if (cur) cur.classList.remove('on');
        cur = a; a.classList.add('on');
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    Array.prototype.forEach.call(document.querySelectorAll('main h1[id], main h2[id]'), function (h) { io.observe(h); });
  }
  // opening a link into a folded spoiler opens it
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    for (var p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
  }
  window.addEventListener('hashchange', openTarget);
  openTarget();
  // print: unfold everything, then restore
  var reopened = [];
  window.addEventListener('beforeprint', function () {
    reopened = [];
    Array.prototype.forEach.call(document.querySelectorAll('details:not([open])'), function (d) { d.open = true; reopened.push(d); });
  });
  window.addEventListener('afterprint', function () { reopened.forEach(function (d) { d.open = false; }); reopened = []; });
})();
