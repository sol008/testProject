// dev helper: report text overflow per card
'use strict';
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2480, height: 1000 } });
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto('file://' + path.join(__dirname, 'xinghe.html'));
  await p.waitForFunction(() => document.body.dataset.ready, null, { timeout: 120000 });
  const r = await p.evaluate(() => [...document.querySelectorAll('.card')].map((c) => { const t = c.querySelector('.txt'); return [c.id, t.scrollHeight, t.clientHeight, [...t.querySelectorAll('p')].map((q) => Math.round(q.getBoundingClientRect().height / 15.1))]; }));
  r.forEach((x) => console.log(x[0], x[1] > x[2] ? 'OVERFLOW ' + x[1] + '/' + x[2] : 'ok', 'lines', x[3].join(',')));
  await b.close();
})();
