// 彼岸燈 Shorelight — design pass v2, spirit cast: render worker (traces row blocks of an SDF view)
'use strict';
self.window = self;
const cache = {};
self.onmessage = (ev) => {
  const m = ev.data;
  if (m.init) { importScripts(...m.init); return; }
  try {
    const k = JSON.stringify(m.key);
    if (!cache[k]) cache[k] = self.SCENE_OF(m.key);
    const part = self.SDF.trace(cache[k], m.view, m.j0, m.j1);
    self.postMessage({ id: m.id, part }, [part.hit.buffer, part.dep.buffer, part.nrm.buffer, part.col.buffer, part.emi.buffer, part.lin.buffer]);
  } catch (e) { self.postMessage({ id: m.id, error: String(e && e.stack || e) }); }
};
