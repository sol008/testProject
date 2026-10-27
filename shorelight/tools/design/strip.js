// 彼岸燈 — design tool: map-scale chibi + silhouette strip for each character sheet.
// Each option gets a tiny full-body figure (~96 px tall, roughly in-game walking-sprite scale)
// and its solid black silhouette, to judge readability at map size.
'use strict';
(() => {
  const U = G.U;
  const { ell, TAU } = DZ.kit;
  const SK = { warm: '#f9dcc7', fair: '#fde7da', pale: '#fff0e8', tan: '#efc9a6' };

  // ------------------------------------------------------------------ mini data (one per option, same order)
  const MINI = {
    xinghe: [
      { st: 'topknot', hair: '#3a2c34', cord: '#c8283a', top: '#34477a', trim: '#f3efe6', bottom: '#2a2a36', prop: 'sword' },
      { st: 'short', hair: '#3a2c34', hat: 'wrap', hatCol: '#2f4f86', top: '#efe6d2', trim: '#3a5a8a', apron: '#a07a52', bottom: '#3a3a44' },
      { st: 'pony', hair: '#2a2030', tip: '#c8502a', top: '#221c26', trim: '#a8202a', bottom: '#1a141a', prop: 'sword', glow: '#ff7a2a' },
      { st: 'short', hair: '#3a2a22', skin: SK.tan, top: '#6a9ab8', trim: '#f0ebe0', bottom: '#e8e0cc', hat: 'strawBack' },
      { st: 'topknot', hair: '#2a2838', cord: '#3a8ad0', top: '#eef2f6', trim: '#2a3a6a', bottom: '#2a3a6a', glow: '#7fd0ff' },
      { st: 'short', hair: '#3a2420', band: '#d0283a', top: '#b8642a', trim: '#3a2a50', scarf: '#e8d080', bottom: '#3a2a50' },
      { st: 'ponyLow', hair: '#2a2a30', cord: '#c8283a', top: '#7a8494', trim: '#2a3038', bottom: '#4a5262', long: true },
      { st: 'braid', hair: '#2a2224', hat: 'skull', top: '#4a3628', trim: '#e0b85a', bottom: '#2a2a2a', prop: 'lantern' },
      { st: 'bunLong', hair: '#2c2030', top: '#f2eee6', trim: '#a82030', bottom: '#f2eee6', cape: '#a82030', prop: 'sword', long: true },
      { st: 'short', hair: '#3a2c34', ahoge: true, top: '#34477a', trim: '#f3efe6', bottom: '#2a2a36' },
    ],
    baizhi: [
      { st: 'long', hair: '#e7edf6', skin: SK.pale, top: '#e3f4f3', trim: '#a6d8da', long: true, glow: '#bef0ff', pin: 'lantern' },
      { st: 'loops', hair: '#eceaf8', skin: SK.pale, top: '#c8d0f0', collar: '#f4f6ff', long: true, glow: '#c8d0ff' },
      { st: 'float', hair: '#eef4fa', skin: SK.pale, top: '#f2f8fa', trim: '#bfe4ee', long: true, ghost: true, glow: '#bfeaff' },
      { st: 'braid', hair: '#e2eaf8', skin: SK.pale, top: '#fbf6f2', trim: '#f07a80', sash: '#f07a80', long: true, pin: 'lotus' },
      { st: 'bunLow', hair: '#e7edf6', skin: SK.pale, top: '#c4b4e0', trim: '#5a4a8a', bottom: '#5a4a8a', prop: 'bowl' },
      { st: 'long', hair: '#e8f2f0', skin: SK.pale, top: '#cfeee0', trim: '#3a8a7a', long: true, prop: 'flute', crown: true },
      { st: 'long', hair: '#f2eef4', tip: '#e0505e', skin: SK.pale, top: '#1e161e', trim: '#c0202e', long: true, pin: 'lily' },
      { st: 'bob', hair: '#e6eefa', skin: SK.pale, top: '#bcd8f0', trim: '#ffffff', bottom: '#8aaed0' },
      { st: 'ponyLow', hair: '#d8dce4', cord: '#d0283a', skin: SK.pale, top: '#f4f2ee', trim: '#5a5a62', long: true },
      { st: 'bunLong', hair: '#f4f2f0', skin: SK.pale, top: '#fbf4e4', trim: '#e8c870', long: true, halo: true },
    ],
    hongying: [
      { st: 'pony', hair: '#2c2333', ribbon: '#d42638', top: '#b3202c', vest: '#17121a', bottom: '#f2ede6', boots: '#2a1a1a', prop: 'spear' },
      { st: 'bun', hair: '#2a1e28', top: '#a8182a', trim: '#e0b040', bottom: '#f2ede6', prop: 'spear', spearTassel: '#e0a030' },
      { st: 'pony', hair: '#2c2333', ribbon: '#d42638', band: '#c8202e', top: '#b3202c', armor: '#8a94a4', cape: '#9a1824', bottom: '#f2ede6', boots: '#2a1a1a', prop: 'spear' },
      { st: 'braidBack', hair: '#2c2333', band: '#f2f0ea', top: '#1e1c22', trim: '#3a3640', bottom: '#1e1c22', boots: '#111', prop: 'spear' },
      { st: 'crop', hair: '#2c2333', band: '#e02838', top: '#b3202c', vest: '#17121a', bottom: '#f2ede6', boots: '#2a1a1a', prop: 'spear' },
      { st: 'twin', hair: '#2e2430', ribbon: '#e02838', top: '#e05a6a', trim: '#ffffff', bottom: '#fff4f4', boots: '#7a2a3a' },
      { st: 'ponyLow', hair: '#2a2020', hat: 'wrap', hatCol: '#c0283a', top: '#c8a060', vest: '#4a2a18', bottom: '#6a4a2a', boots: '#2a1a0a', prop: 'spear' },
      { st: 'pony', hair: '#221820', tip: '#e0283a', ribbon: '#ff2a3a', top: '#1a141a', trim: '#d0202e', armor: '#3a3038', bottom: '#1a141a', boots: '#000', prop: 'spear', glow: '#ff3a3a' },
      { st: 'pony', hair: '#22202e', ribbon: '#d42638', top: '#eef0f4', trim: '#9aa4b4', armor: '#c8d0dc', bottom: '#ffffff', boots: '#8a94a4', prop: 'spear' },
      { st: 'bunBack', hair: '#2a2228', flower: '#d8283a', top: '#c8303a', trim: '#1a1418', bottom: '#1a1418', prop: 'spear' },
    ],
    yungui: [
      { st: 'bunLong', hair: '#2a2533', top: '#7d8ea2', trim: '#2c3646', long: true, prop: 'fan', gourd: true },
      { st: 'long', hair: '#2a2533', top: '#8a9cb0', trim: '#3a4656', long: true, gourd: true, bigGourd: true },
      { st: 'long', hair: '#2a2533', hat: 'guan', top: '#1c1a22', trim: '#d6ae52', long: true, glow: '#ffcc50', talis: true },
      { st: 'bunLong', hair: '#2e2a26', top: '#7a8a5a', trim: '#4a3a24', long: true, glasses: true, shrooms: true },
      { st: 'float', hair: '#24203a', top: '#3a2e6a', trim: '#14102a', long: true, glow: '#8090ff' },
      { st: 'ponyLow', hair: '#2a2533', top: '#4a8a7e', trim: '#f1efe8', long: true, prop: 'fanOpen' },
      { st: 'bunLong', hair: '#2a2533', top: '#e8e6e0', trim: '#4a4a50', long: true },
      { st: 'ponyLow', hair: '#2a2533', hat: 'strawHat', top: '#7d8ea2', trim: '#2c3646', cape: '#8a7a60', long: true, gourd: true },
      { st: 'short', hair: '#2a2533', top: '#1e1c22', vest: '#7d8ea2', bottom: '#1e1c22', boots: '#000' },
      { st: 'bunLong', hair: '#c8ccd8', top: '#f0f2f6', trim: '#a0c0d8', long: true, glow: '#c0e8ff' },
    ],
  };
  const CAT = [
    { fur: '#d0a066', belly: '#f4e4c6', spot: '#4e2f1a', w: 1, prop: '#c070f0' },
    { fur: '#d0a066', belly: '#f4e4c6', spot: '#4e2f1a', w: 1.4, prop: '#d8202a' },
    { fur: '#d0a066', belly: '#f4e4c6', spot: '#40d8f0', w: 0.85, glow: '#60f0ff', tallTail: true },
    { fur: '#d0a066', belly: '#f4e4c6', spot: '#4e2f1a', w: 1, collar: '#c8283a', hat: true },
    { fur: '#d0a066', belly: '#f4e4c6', spot: '#4e2f1a', w: 0.75, head: 1.25 },
    { fur: '#a89070', belly: '#e8dcc4', spot: '#2e2214', w: 0.85 },
    { fur: '#c8a070', belly: '#f8e8d0', spot: '#ff80d0', w: 1, glow: '#c080ff', shroom: true },
    { fur: '#d8dce8', belly: '#ffffff', spot: '#5a6488', w: 1, glow: '#c0d8ff' },
    { fur: '#e08a48', belly: '#ffe4c8', spot: '#5a2010', w: 1, flame: true, collar: '#d0283a' },
    { fur: '#e8b450', belly: '#fff0c8', spot: '#6a3a14', w: 1.15, bib: '#d8283a' },
  ];

  // ------------------------------------------------------------------ chibi (feet at 0,0; ~100 units tall)
  function hairBack(c, m) {
    const H = m.hair;
    c.fillStyle = H;
    const st = m.st;
    if (st === 'long' || st === 'bunLong' || st === 'loops') { c.beginPath(); c.moveTo(-18, -84); c.quadraticCurveTo(-24, -50, -20, -34); c.lineTo(20, -34); c.quadraticCurveTo(24, -50, 18, -84); c.fill(); }
    if (st === 'float') { c.beginPath(); c.moveTo(-18, -86); c.quadraticCurveTo(-36, -60, -32, -30); c.quadraticCurveTo(0, -40, 32, -32); c.quadraticCurveTo(36, -62, 18, -86); c.fill(); }
    if (st === 'pony') { c.beginPath(); c.moveTo(-6, -98); c.quadraticCurveTo(-30, -96, -26, -56); c.quadraticCurveTo(-22, -44, -14, -42); c.quadraticCurveTo(-16, -70, -2, -92); c.fill(); if (m.tip) { c.fillStyle = m.tip; ell(c, -20, -46, 5, 5); c.fill(); } }
    if (st === 'ponyLow') { c.beginPath(); c.moveTo(-8, -66); c.quadraticCurveTo(-20, -50, -16, -38); c.lineTo(-8, -38); c.quadraticCurveTo(-10, -52, -2, -66); c.fill(); }
    if (st === 'twin') { for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 14, -94); c.quadraticCurveTo(d * 32, -84, d * 26, -54); c.quadraticCurveTo(d * 22, -48, d * 18, -50); c.quadraticCurveTo(d * 22, -74, d * 10, -90); c.fill(); } }
    if (st === 'braidBack') { for (let k = 0; k < 6; k++) { ell(c, -16 - k * 0.5, -70 + k * 6, 4, 3.4); c.fill(); } }
    if (st === 'bob') { c.beginPath(); c.moveTo(-19, -86); c.quadraticCurveTo(-24, -66, -18, -62); c.lineTo(18, -62); c.quadraticCurveTo(24, -66, 19, -86); c.fill(); }
  }
  function hairFront(c, m) {
    const H = m.hair; c.fillStyle = H;
    const st = m.st;
    // crown cap
    c.beginPath(); c.arc(0, -82, 17.5, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill();
    // fringe
    c.beginPath(); c.moveTo(-17, -84);
    const n = st === 'bob' ? 7 : 6;
    for (let k = 0; k <= n; k++) { const x = -17 + k * 34 / n; c.lineTo(x, -84 + (k % 2 ? 0 : (st === 'crop' || st === 'short' || st === 'topknot' ? 7 : 6))); }
    c.lineTo(17, -86); c.closePath(); c.fill();
    if (st === 'bob') { c.fillRect(-19, -86, 38, 3); }
    // side locks
    if (st === 'long' || st === 'bunLong' || st === 'loops' || st === 'float' || st === 'bunLow' || st === 'braid' || st === 'twin' || st === 'pony' || st === 'bun' || st === 'bunBack' || st === 'ponyLow') {
      c.beginPath(); c.moveTo(-17, -84); c.quadraticCurveTo(-20, -72, -16, st === 'pony' || st === 'twin' || st === 'bun' || st === 'bunBack' ? -68 : -60); c.lineTo(-13, -76); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(17, -84); c.quadraticCurveTo(20, -72, 16, st === 'pony' || st === 'twin' || st === 'bun' || st === 'bunBack' ? -68 : -60); c.lineTo(13, -76); c.closePath(); c.fill();
      if (m.tip && st === 'long') { c.fillStyle = m.tip; ell(c, -16, -61, 2.5, 3); c.fill(); ell(c, 16, -61, 2.5, 3); c.fill(); c.fillStyle = H; }
    }
    if (st === 'topknot') { ell(c, 0, -101, 6, 5); c.fill(); if (m.cord) { c.fillStyle = m.cord; c.fillRect(-4, -98, 8, 2.4); } }
    if (st === 'bun' || st === 'bunLong') { ell(c, 0, -102, 7.5, 6.5); c.fill(); }
    if (st === 'bunLow' || st === 'bunBack') { ell(c, st === 'bunBack' ? -12 : 0, st === 'bunBack' ? -94 : -70, 7, 6); c.fill(); }
    if (st === 'loops') { c.strokeStyle = H; c.lineWidth = 3; for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 9, -104, 6, 7, d * 0.4, 0, TAU); c.stroke(); } }
    if (st === 'braid') { for (let k = 0; k < 6; k++) { ell(c, -15 + k * 0.4, -70 + k * 6, 3.6, 3); c.fill(); } }
    if (st === 'crop') { for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 17, -84); c.lineTo(d * 21, -70); c.lineTo(d * 14, -76); c.closePath(); c.fill(); } }
    if (m.ahoge) { c.strokeStyle = H; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -99); c.quadraticCurveTo(4, -110, 9, -106); c.stroke(); }
    if (m.ribbon && (st === 'pony' || st === 'twin')) { c.fillStyle = m.ribbon; if (st === 'twin') { ell(c, -15, -94, 4, 3); c.fill(); ell(c, 15, -94, 4, 3); c.fill(); } else { ell(c, -6, -98, 4, 3); c.fill(); } }
  }
  function chibi(c, m) {
    const skin = m.skin || SK.fair;
    c.save();
    if (!m.sil) { c.fillStyle = 'rgba(0,0,0,0.3)'; ell(c, 0, 0, 18, 4); c.fill(); }
    if (m.glow) { const g = c.createRadialGradient(0, -50, 4, 0, -50, 52); g.addColorStop(0, U.rgba(m.glow, 0.45)); g.addColorStop(1, U.rgba(m.glow, 0)); c.fillStyle = g; c.fillRect(-60, -110, 120, 130); }
    if (m.halo) { c.strokeStyle = '#f2d27a'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -86, 25, 0, TAU); c.stroke(); for (let k = -2; k <= 2; k++) { c.fillStyle = '#ffb050'; ell(c, Math.sin(k * 0.45) * 25, -86 - Math.cos(k * 0.45) * 25, 2.4, 3); c.fill(); } }
    if (m.hat === 'strawBack') { c.fillStyle = '#dcc080'; ell(c, 0, -64, 22, 18); c.fill(); c.strokeStyle = '#8a7040'; c.lineWidth = 1; c.stroke(); }
    if (m.cape) { c.fillStyle = m.cape; c.beginPath(); c.moveTo(-12, -62); c.lineTo(-22, -10); c.lineTo(22, -10); c.lineTo(12, -62); c.closePath(); c.fill(); }
    if (m.prop === 'spear') {
      c.strokeStyle = '#5a3420'; c.lineWidth = 2; c.beginPath(); c.moveTo(16, -4); c.lineTo(26, -118); c.stroke();
      c.fillStyle = '#d8dce4'; c.beginPath(); c.moveTo(26.5, -128); c.lineTo(29, -116); c.lineTo(24, -116); c.closePath(); c.fill();
      c.fillStyle = m.spearTassel || '#d8283a'; c.beginPath(); c.moveTo(24, -116); c.lineTo(30, -116); c.lineTo(28, -104); c.lineTo(22, -106); c.closePath(); c.fill();
    }
    if (m.prop === 'sword') { c.strokeStyle = '#3a2a24'; c.lineWidth = 3; c.beginPath(); c.moveTo(-14, -30); c.lineTo(14, -70); c.stroke(); c.fillStyle = '#d6ae52'; ell(c, 12, -67, 4, 1.6, -0.9); c.fill(); }
    hairBack(c, m);
    // legs / hem
    if (!m.long) {
      c.fillStyle = m.bottom || '#333';
      c.fillRect(-9, -26, 7, 22); c.fillRect(2, -26, 7, 22);
      c.fillStyle = m.boots || '#3a2a20'; ell(c, -5.5, -3, 5, 3); c.fill(); ell(c, 5.5, -3, 5, 3); c.fill();
    } else { c.fillStyle = m.boots || '#2a2228'; ell(c, -5, -3, 5, 3); c.fill(); ell(c, 5, -3, 5, 3); c.fill(); }
    // body
    const hem = m.long ? -5 : -24;
    c.fillStyle = m.top;
    c.beginPath(); c.moveTo(-10, -64); c.quadraticCurveTo(-16, -60, -16, -50); c.lineTo(m.long ? -18 : -15, hem); c.lineTo(m.long ? 18 : 15, hem); c.lineTo(16, -50); c.quadraticCurveTo(16, -60, 10, -64); c.closePath(); c.fill();
    if (m.ghost) { const g = c.createLinearGradient(0, -40, 0, -4); g.addColorStop(0, 'rgba(18,19,28,0)'); g.addColorStop(1, 'rgba(18,19,28,0.7)'); c.fillStyle = g; c.fillRect(-20, -40, 40, 40); }
    // sleeves
    c.fillStyle = U.shade(m.top, -0.12);
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 13, -62); c.quadraticCurveTo(d * 24, -52, d * 22, -38); c.lineTo(d * 15, -36); c.closePath(); c.fill(); c.fillStyle = skin; ell(c, d * 19, -36, 3, 3); c.fill(); c.fillStyle = U.shade(m.top, -0.12); }
    if (m.vest) { c.fillStyle = m.vest; c.fillRect(-14, -60, 9, m.long ? 40 : 34); c.fillRect(5, -60, 9, m.long ? 40 : 34); }
    if (m.armor) { c.fillStyle = m.armor; for (const d of [-1, 1]) { ell(c, d * 15, -60, 7, 4, d * 0.4); c.fill(); } }
    if (m.apron) { c.fillStyle = m.apron; c.fillRect(-9, -50, 18, 28); }
    if (m.trim) { c.strokeStyle = m.trim; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -64); c.lineTo(2, -48); c.lineTo(8, -64); c.stroke(); }
    if (m.collar) { c.fillStyle = m.collar; c.beginPath(); c.ellipse(0, -60, 15, 7, 0, 0, Math.PI); c.fill(); }
    if (m.sash) { c.fillStyle = m.sash; c.fillRect(-16, -40, 32, 5); }
    if (m.scarf) { c.fillStyle = m.scarf; c.fillRect(-10, -66, 20, 5); c.fillRect(-8, -62, 4, 12); }
    if (m.gourd) { c.fillStyle = '#c88a3a'; const s = m.bigGourd ? 1.5 : 1; ell(c, 14, -30 * (m.bigGourd ? 1.4 : 1), 4 * s, 5 * s); c.fill(); ell(c, 14, -37 * (m.bigGourd ? 1.3 : 1), 2.6 * s, 2.8 * s); c.fill(); }
    if (m.prop === 'lantern') { c.strokeStyle = '#3a2a1a'; c.lineWidth = 1; c.beginPath(); c.moveTo(20, -36); c.lineTo(20, -30); c.stroke(); c.fillStyle = '#ffd070'; c.fillRect(17, -30, 6, 9); }
    if (m.prop === 'bowl') { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, -40, 7, 0, Math.PI); c.fill(); c.fillStyle = '#b890d0'; ell(c, 0, -40, 6, 1.6); c.fill(); }
    if (m.prop === 'flute') { c.strokeStyle = '#8fd8b8'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-18, -34); c.lineTo(16, -52); c.stroke(); }
    if (m.prop === 'fan') { c.fillStyle = '#e8dcc0'; c.beginPath(); c.moveTo(-19, -36); c.arc(-19, -36, 9, -2.2, -1.1); c.closePath(); c.fill(); }
    if (m.prop === 'fanOpen') { c.fillStyle = '#e8e0c8'; c.beginPath(); c.moveTo(4, -64); c.arc(4, -60, 13, -2.4, -0.7); c.closePath(); c.fill(); }
    if (m.talis) { c.fillStyle = '#f2d36a'; c.fillRect(-30, -78, 5, 12); c.fillRect(25, -60, 5, 12); }
    // head
    c.fillStyle = skin; ell(c, 0, -80, 16, 17); c.fill();
    c.fillStyle = '#2a1a20'; ell(c, -5.5, -78, 2, 2.6); c.fill(); ell(c, 5.5, -78, 2, 2.6); c.fill();
    c.fillStyle = 'rgba(255,140,150,0.45)'; ell(c, -9, -73, 3, 1.6); c.fill(); ell(c, 9, -73, 3, 1.6); c.fill();
    hairFront(c, m);
    if (m.glasses) { c.strokeStyle = '#5a3a1a'; c.lineWidth = 1; c.beginPath(); c.arc(-5.5, -78, 3.6, 0, TAU); c.stroke(); c.beginPath(); c.arc(5.5, -78, 3.6, 0, TAU); c.stroke(); }
    if (m.band) { c.fillStyle = m.band; c.fillRect(-17, -89, 34, 3.4); }
    if (m.hat === 'wrap') { c.fillStyle = m.hatCol; c.beginPath(); c.arc(0, -84, 18, Math.PI, TAU); c.closePath(); c.fill(); }
    if (m.hat === 'skull') { c.fillStyle = '#1a1418'; c.beginPath(); c.arc(0, -86, 17, Math.PI, TAU); c.closePath(); c.fill(); c.fillStyle = '#d8283a'; ell(c, 0, -103, 2.6, 2.4); c.fill(); }
    if (m.hat === 'guan') { c.fillStyle = '#1a1a22'; c.fillRect(-6, -112, 12, 14); c.fillStyle = '#d6ae52'; c.fillRect(-6, -104, 12, 1.6); }
    if (m.hat === 'strawHat') { c.fillStyle = '#c8a868'; c.beginPath(); c.moveTo(-28, -88); c.quadraticCurveTo(0, -112, 28, -88); c.quadraticCurveTo(0, -92, -28, -88); c.fill(); }
    if (m.pin === 'lantern') { c.fillStyle = '#f05a3c'; ell(c, -15, -90, 2.6, 3.2); c.fill(); }
    if (m.pin === 'lotus') { c.fillStyle = '#f8a8b8'; ell(c, -12, -97, 4, 3); c.fill(); }
    if (m.pin === 'lily') { c.fillStyle = '#ff3a4a'; ell(c, -14, -90, 4, 4); c.fill(); }
    if (m.flower) { c.fillStyle = m.flower; ell(c, -15, -94, 3.4, 3.4); c.fill(); }
    if (m.crown) { c.strokeStyle = U.shade(m.hair, -0.25); c.lineWidth = 2.2; c.beginPath(); c.arc(0, -84, 16, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); }
    if (m.shrooms) { c.fillStyle = '#e04a8a'; ell(c, -5, -108, 4, 2.6); c.fill(); c.fillStyle = '#40a0e0'; ell(c, 6, -109, 3.6, 2.4); c.fill(); }
    c.restore();
  }
  function cat(c, m) {
    c.save();
    if (!m.sil) { c.fillStyle = 'rgba(0,0,0,0.3)'; ell(c, 0, 0, 22 * m.w, 4); c.fill(); }
    if (m.glow) { const g = c.createRadialGradient(0, -30, 4, 0, -30, 46); g.addColorStop(0, U.rgba(m.glow, 0.5)); g.addColorStop(1, U.rgba(m.glow, 0)); c.fillStyle = g; c.fillRect(-60, -90, 120, 110); }
    // tail
    c.strokeStyle = m.fur; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(12 * m.w, -6); c.quadraticCurveTo(30 * m.w, -10, 26 * m.w, m.tallTail ? -50 : -34); c.stroke();
    c.strokeStyle = m.spot; c.lineWidth = 6;
    for (let k = 0; k < 3; k++) { const t = 0.45 + k * 0.2; const x = U.lerp(12 * m.w, 26 * m.w, t), y = U.lerp(-6, m.tallTail ? -50 : -34, t); c.beginPath(); c.moveTo(x - 0.5, y); c.lineTo(x + 0.5, y - 1.6); c.stroke(); }
    if (m.flame) { c.fillStyle = '#ffb040'; ell(c, 26 * m.w, -40, 4, 6); c.fill(); c.fillStyle = '#fff2b0'; ell(c, 26 * m.w, -38, 2, 3); c.fill(); }
    // body
    const hs = m.head || 1;
    c.fillStyle = m.fur; ell(c, 0, -16, 18 * m.w, 16); c.fill();
    c.fillStyle = m.belly; ell(c, 0, -13, 10 * m.w, 12); c.fill();
    c.fillStyle = m.spot; for (const [x, y] of [[-13, -18], [-10, -10], [13, -16], [11, -8]]) { ell(c, x * m.w, y, 1.8, 1.5); c.fill(); }
    if (m.bib) { c.fillStyle = m.bib; c.beginPath(); c.moveTo(-8, -26); c.lineTo(8, -26); c.lineTo(0, -12); c.closePath(); c.fill(); }
    if (m.prop) { c.fillStyle = m.prop; ell(c, 0, -10, 6, 4); c.fill(); }
    if (m.collar) { c.fillStyle = m.collar; c.fillRect(-9, -30, 18, 3); c.fillStyle = '#f0c040'; ell(c, 0, -26, 2, 2); c.fill(); }
    // head
    c.save(); c.translate(0, -38); c.scale(hs, hs);
    c.fillStyle = m.fur;
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 13, -6); c.lineTo(d * 11, -20); c.lineTo(d * 3, -12); c.closePath(); c.fill(); }
    ell(c, 0, 0, 15, 13); c.fill();
    c.fillStyle = m.belly; ell(c, 0, 5, 8, 5); c.fill();
    c.strokeStyle = m.spot; c.lineWidth = 1.4; for (const x of [-3, 0, 3]) { c.beginPath(); c.moveTo(x, -12); c.lineTo(x, -6); c.stroke(); }
    c.fillStyle = '#2a1a10'; ell(c, -5, -1, 1.8, 2.2); c.fill(); ell(c, 5, -1, 1.8, 2.2); c.fill();
    c.fillStyle = '#e88a90'; ell(c, 0, 3, 1.4, 1); c.fill();
    if (m.hat) { c.fillStyle = '#1a1a22'; c.fillRect(-4, -20, 8, 7); }
    if (m.shroom) { c.fillStyle = '#e04aa8'; ell(c, 0, -20, 6, 3.4); c.fill(); }
    c.restore();
    c.restore();
  }

  window.DESIGN_STRIP = (ch) => {
    const list = ch.id === 'tuanzi' ? CAT : MINI[ch.id];
    const div = document.createElement('div'); div.className = 'strip';
    div.innerHTML = '<h3>地圖比例／剪影檢查 Map-scale chibi &amp; silhouette (≈ in-game sprite size) — 左：上色　右：純黑剪影</h3>';
    if (!list) return div;
    const W = 1536, H = 176, DPR = Math.max(1, window.devicePixelRatio || 1);
    const cv = document.createElement('canvas'); cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const c = cv.getContext('2d'); c.scale(DPR, DPR);
    const slot = W / list.length;
    list.forEach((m, i) => {
      const x0 = i * slot;
      // little ground tile
      c.fillStyle = i % 2 ? '#22263a' : '#1e2234'; c.fillRect(x0 + 2, 0, slot - 4, H);
      const draw = (ctx, sil) => { const mm = sil ? Object.assign({}, m, { glow: null, sil: true, ghost: false }) : m; return ch.id === 'tuanzi' ? cat(ctx, mm) : chibi(ctx, mm); };
      c.save(); c.translate(x0 + slot * 0.36, H - 16); c.scale(1.1, 1.1); draw(c); c.restore();
      // silhouette
      const off = document.createElement('canvas'); off.width = 120 * DPR; off.height = 140 * DPR;
      const o = off.getContext('2d'); o.scale(DPR, DPR); o.translate(60, 128); o.scale(0.62, 0.62); draw(o, true);
      o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-in'; o.fillStyle = '#05060a'; o.fillRect(0, 0, off.width, off.height);
      c.drawImage(off, x0 + slot * 0.74 - 60, H - 16 - 128, 120, 140);
      c.fillStyle = '#d8b25a'; c.font = 'bold 13px Georgia, serif'; c.textAlign = 'left';
      c.fillText(String(i + 1).padStart(2, '0'), x0 + 8, 16);
    });
    div.appendChild(cv);
    return div;
  };
})();
