// Summarise a sweep directory (tools/r3d/sweep/sweep.js output) as a markdown table + issue digest.
//   node tools/r3d/sweep/summary.js DIR [--md]
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || 'sweep3d');
const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const IGN = /PCFSoftShadowMap|requestfailed: .*(fontdata\.js|i18n\/en_ch)/;
const digest = { warned: {}, log: {}, fb: {}, odd: {} };
const add = (m, k, id) => { (m[k] = m[k] || new Set()).add(id); };
for (const r of rows) {
  for (const w of r.warned || []) add(digest.warned, w, r.id);
  for (const l of r.log || []) if (!IGN.test(l)) add(digest.log, l.replace(/\d+(\.\d+)?/g, 'N').slice(0, 200), r.id);
  for (const f of r.fallbacks || []) add(digest.fb, f.kind + ':' + f.id + (f.hasModel ? ' (model exists!)' : '') + (f.char3d ? ' (Char3D has!)' : '') + (f.mon3d ? ' (Mon3D has!)' : ''), r.id);
  for (const o of r.odd || []) if (!/: wide /.test(o)) add(digest.odd, o.replace(/@\d+,\d+/, '').replace(/[\d.]+/g, 'N'), r.id);
}
const list = (m) => Object.entries(m).sort((a, b) => b[1].size - a[1].size).map(([k, s]) => `- ${k} — ${s.size} map(s): ${[...s].slice(0, 8).join(', ')}${s.size > 8 ? ' …' : ''}`).join('\n');
console.log('## warnOnce\n' + list(digest.warned) + '\n\n## console\n' + list(digest.log) + '\n\n## fallbacks\n' + list(digest.fb) + '\n\n## placement outliers (non-"wide")\n' + list(digest.odd));
console.log('\n## table');
console.log('| map | size | kind | build ms | calls | tris | fb | log | notes |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const kind = r.noView ? 'NO VIEW' : r.cave ? 'cave' : r.interior ? 'interior' : 'outdoor' + (r.dark > 0.4 ? ' night' : '');
  const n = (r.log || []).filter((l) => !IGN.test(l)).length;
  console.log(`| ${r.id} | ${r.w}×${r.h} | ${kind} | ${r.buildMs} | ${r.calls} | ${r.tris} | ${(r.fallbacks || []).length} | ${n + (r.warned || []).length} | ${r.fatal || r.lastError ? 'ERR' : ''} ${r.top && /not map/.test(r.top) ? r.top : ''} |`);
}
