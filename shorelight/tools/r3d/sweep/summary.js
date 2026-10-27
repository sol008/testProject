// Summarise a sweep directory (tools/r3d/sweep/sweep.js output): issue digest + markdown table.
//   node tools/r3d/sweep/summary.js DIR [notes.json]
// notes.json: { "<map id>": ["status", "note"] } — status overrides the computed one (OK / WARN / FAIL).
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || 'sweep3d');
const notes = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : {};
const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
// known noise: requests for optional files, the debug-only monster normal-sanitiser report, Chrome's readback hint
const IGN = /PCFSoftShadowMap|requestfailed: .*(fontdata\.js|i18n\/en_ch)|mon3d-b .* degenerate verts/;
const ODD_IGN = /: wide |^mural|^lantern_string|^red_lantern|^c2_redcloth/; // wide canopies are by design; wall-mounted / hanging / tied-on props float
const digest = { warned: {}, log: {}, fb: {}, odd: {} };
const add = (m, k, id) => { (m[k] = m[k] || new Set()).add(id); };
for (const r of rows) {
  for (const w of r.warned || []) add(digest.warned, w, r.id);
  for (const l of r.log || []) add(digest.log, l.replace(/\d+(\.\d+)?/g, 'N').slice(0, 200), r.id);
  for (const f of r.fallbacks || []) add(digest.fb, f.kind + ':' + f.id + (f.hasModel ? ' (model exists!)' : '') + (f.char3d ? ' (Char3D has!)' : '') + (f.mon3d ? ' (Mon3D has!)' : ''), r.id);
  for (const o of r.odd || []) if (!ODD_IGN.test(o)) add(digest.odd, o.replace(/@\d+,\d+/, '').replace(/[\d.]+/g, 'N'), r.id);
}
const list = (m) => Object.entries(m).sort((a, b) => b[1].size - a[1].size).map(([k, s]) => `- ${k} — ${s.size} map(s): ${[...s].slice(0, 8).join(', ')}${s.size > 8 ? ' …' : ''}`).join('\n') || '- none';
console.log('## warnOnce\n' + list(digest.warned) + '\n\n## console / page errors\n' + list(digest.log) + '\n\n## fallbacks\n' + list(digest.fb) + '\n\n## placement outliers\n' + list(digest.odd));
const ok = rows.filter((r) => r.calls);
const med = (k) => { const v = ok.map((r) => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
console.log(`\n${rows.length} maps; median build ${med('buildMs')} ms, draw calls ${med('calls')}, triangles ${med('tris')}`);
console.log('\n| map | size | kind | status | build ms | draw calls | triangles | notes |');
console.log('|---|---|---|---|---:|---:|---:|---|');
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  const kind = r.noView ? 'NO VIEW' : r.cave ? 'cave' : r.interior ? 'interior' : 'outdoor' + (r.dark > 0.4 ? ' (night)' : '');
  const errs = (r.log || []).filter((l) => !IGN.test(l)).length + (r.warned || []).length + (r.fatal || r.lastError ? 1 : 0);
  const fb = (r.fallbacks || []).length;
  let status = errs ? 'FAIL' : fb ? 'WARN' : 'OK';
  const n = notes[r.id] || [];
  if (n[0]) status = n[0];
  const auto = [];
  if (fb) auto.push(fb + ' fallback(s)');
  if (errs) auto.push(errs + ' error(s)');
  if (r.calls > 300) auto.push('draw-call outlier');
  if (r.tris > 400000) auto.push('triangle outlier');
  console.log(`| ${r.id} | ${r.w}×${r.h} | ${kind} | ${status} | ${r.buildMs} | ${r.calls} | ${r.tris} | ${[n[1], ...auto].filter(Boolean).join('; ')} |`);
}
