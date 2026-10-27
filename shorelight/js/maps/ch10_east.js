// 第十章 後山巡境 (ch10_east) — 黑潮北上：蘭嶼（達悟）→ 台東（卑南巴拉冠・阿美海祭）→ 花蓮（洄瀾・太魯閣）→ 頭城搶孤 → 龜山島。
// Screenplay: docs/story/ch10_east.md.  Entry: G.Story.ch10(S).  Exit: G.Story.next(S, 11) (also sets ch10_end / ch10_done).
//
// Maps (all defined here):
//   wangboat_deck_east  王船甲板（第十章的航行樞紐；陳伯掌舵「出航」選單、艙口休息、神位存檔）
//   orchid_shore        蘭嶼・灘頭（界石線 y=8 以北不可進入）     orchid_reef      礁盤（潮汐謎題）
//   baosang             寶桑（台東）                               amis_village     阿美族部落（海祭）
//   taitung_coast       台東海岸（夜，三處溺魂）                   huilan           洄瀾（花蓮）
//   truku_village       太魯閣族部落                               qingshui_cliffs  清水斷崖（落石）
//   taroko_gorge        太魯閣峽谷（鹽壩謎題・石巨靈）             toucheng         頭城（普渡・搶孤）
//   c10_xuanwu_room     插敘：玄武嶼內室
// Cultural notes (STORY_BIBLE guide, binding): the Tao death taboo and the shore boundary are explained and
// enforced by the Tao family themselves; the party never enters the settlement. The Amis 海祭 is only watched
// from the viewing tree (fixed camera, no BGM, the player cannot move, no minigame, no prayer text). The Truku
// elder shares Gaya and the 彩虹橋 as her own people's belief and explicitly does not apply it to the Han boy.
// The rainbow can only be looked at. 搶孤 (Han festival) is the only minigame.
//
// Custom art registered here (small, chapter-specific): objects c10_fish_rack (飛魚曬架), c10_amis_house
// (阿美族茅草長屋), c10_denggao (燈篙); sprites c10_tao_child, c10_tao_elder, c10_amis_m, c10_truku_m,
// c10_puyuma_boy, c10_muntjac (山羌).
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE || 64;
  const F = (k) => !!G.state.flags[k];
  const V = () => G.state.vars;
  const autoplay = () => !!(G.Debug && G.Debug.autoplay);

  // =================================================================================================
  // map building helpers
  // =================================================================================================
  class Grid {
    constructor(w, h, ch) { this.w = w; this.h = h; this.c = []; for (let y = 0; y < h; y++) this.c.push(new Array(w).fill(ch)); }
    set(x, y, ch) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y][x] = ch; return this; }
    get(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.c[y][x] : null; }
    rect(x, y, w, h, ch) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch); return this; }
    // for every column x0..x1, fill rows [top(x), bottom(x))
    band(x0, x1, top, bottom, ch) {
      for (let x = x0; x <= x1; x++) { const a = Math.round(top(x)), b = Math.round(bottom(x)); for (let y = a; y < b; y++) this.set(x, y, ch); }
      return this;
    }
    // noisy ellipse
    blob(cx, cy, rx, ry, ch, seed = 1, jit = 0.22, only) {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1 + (U.hash(x, y, seed) - 0.5) * jit * 2 && (!only || only.includes(this.get(x, y)))) this.set(x, y, ch);
      }
      return this;
    }
    // orthogonal polyline
    line(pts, ch, wd = 1) {
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
        let x = x0, y = y0;
        for (;;) {
          this.rect(x, y, sx ? 1 : wd, sy ? 1 : wd, ch);
          if (sx && wd > 1) this.rect(x, y, 1, wd, ch);
          if (x === x1 && y === y1) break;
          x += sx; y += sy;
        }
      }
      return this;
    }
    // replace chars inside a rect
    swap(x, y, w, h, from, to) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (from.includes(this.get(xx, yy))) this.set(xx, yy, to); return this; }
    rows() { return this.c.map((r) => r.join('')); }
  }
  // scatter decorative objects on cells whose terrain char is in `on` (deterministic)
  function scatter(list, g, type, area, on, density, seed, extra) {
    const [x0, y0, w, h] = area;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!on.includes(g.get(x, y))) continue;
      if (U.hash(x, y, seed) < density) list.push(Object.assign({ t: type, x, y }, extra || {}));
    }
  }
  // remove objects that overlap any of the given cells (keeps paths, doors and warp cells clear)
  function clearCells(list, cells) {
    const key = new Set(cells.map(([x, y]) => x + ',' + y));
    return list.filter((o) => {
      const d = G.Objects.get(o.t);
      const w = o.w || (d ? d.w : 1), h = o.h || (d ? d.h : 1);
      for (let yy = o.y; yy < o.y + h; yy++) for (let xx = o.x; xx < o.x + w; xx++) if (key.has(xx + ',' + yy)) return false;
      return true;
    });
  }
  const cellsOf = (x, y, w, h) => { const out = []; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push([xx, yy]); return out; };

  // =================================================================================================
  // custom chapter art
  // =================================================================================================
  const mk = (w, h) => U.makeCanvas(w, h);
  const ART = {};
  function cached(key, w, h, paint) {
    const k = key + '@' + G.S;
    if (!ART[k]) { const c = mk(w, h); paint(c.getContext('2d'), w, h); ART[k] = c; }
    return ART[k];
  }
  function bamboo(g, x0, y0, x1, y1, w) {
    g.lineCap = 'round';
    g.strokeStyle = '#6e5a2c'; g.lineWidth = w + 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = '#b8a060'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = 'rgba(255,248,215,0.4)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x0 - 0.8, y0); g.lineTo(x1 - 0.8, y1); g.stroke();
  }
  // 飛魚曬架 — bamboo frame with split flying fish hanging in rows (2x1)
  G.Objects.define('c10_fish_rack', {
    w: 2, h: 1, solid: true,
    draw(ctx, px, py, o, t) {
      const c = cached('fishrack' + (o.v || 0), 152, 136, (g, W, H) => {
        g.translate(12, 70);
        g.fillStyle = 'rgba(40,30,20,0.28)'; g.beginPath(); g.ellipse(64, 54, 66, 10, 0, 0, Math.PI * 2); g.fill();
        bamboo(g, 6, -62, 6, 56, 4); bamboo(g, 122, -62, 122, 56, 4);
        bamboo(g, 0, -56, 128, -56, 3.4); bamboo(g, 0, -14, 128, -14, 3.4);
        for (let row = 0; row < 2; row++) {
          const by = row ? -14 : -56;
          for (let i = 0; i < 7; i++) {
            const x = 16 + i * 16 + (row ? 6 : 0);
            if (x > 118) continue;
            const L = 30 + U.hash(i, row, 3) * 6;
            g.strokeStyle = '#6a5a3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, by); g.lineTo(x, by + 4); g.stroke();
            // split flying fish: silver-blue body opened flat, dark back, long pectoral fins
            const grd = g.createLinearGradient(x - 6, 0, x + 6, 0);
            grd.addColorStop(0, '#5f7f9e'); grd.addColorStop(0.5, '#cfdce6'); grd.addColorStop(1, '#5f7f9e');
            g.fillStyle = grd; g.strokeStyle = '#3e5770'; g.lineWidth = 1.1;
            g.beginPath(); g.moveTo(x, by + 4); g.quadraticCurveTo(x + 7, by + 10, x + 4, by + L * 0.7); g.lineTo(x + 6, by + L);
            g.lineTo(x, by + L - 5); g.lineTo(x - 6, by + L); g.lineTo(x - 4, by + L * 0.7); g.quadraticCurveTo(x - 7, by + 10, x, by + 4); g.fill(); g.stroke();
            g.fillStyle = 'rgba(190,120,90,0.55)'; g.fillRect(x - 1, by + 7, 2, L * 0.5);
            g.fillStyle = 'rgba(150,185,215,0.75)';
            g.beginPath(); g.moveTo(x - 4, by + 10); g.lineTo(x - 11, by + 20); g.lineTo(x - 4, by + 16); g.fill();
            g.beginPath(); g.moveTo(x + 4, by + 10); g.lineTo(x + 11, by + 20); g.lineTo(x + 4, by + 16); g.fill();
          }
        }
      });
      ctx.drawImage(c, px - 12, py - 70 + 64 - 54, c.lw, c.lh);
    },
  });

  // 阿美族茅草長屋 — thatched roof, bamboo walls, front porch (w x 3, door column o.door)
  G.Objects.define('c10_amis_house', {
    w: 5, h: 3, solid: true,
    solidAt: (o, dx, dy) => !(dy === (o.h || 3) - 1 && dx === (o.door == null ? 2 : o.door)),
    draw(ctx, px, py, o, t) {
      const w = o.w || 5, h = o.h || 3, door = o.door == null ? 2 : o.door, big = !!o.big;
      const W = w * T, H = h * T, M = 70;
      const c = cached(`amis${w}x${h}d${door}${big ? 'b' : ''}`, W + 24, H + M + 10, (g) => {
        g.translate(12, M);
        g.fillStyle = 'rgba(35,25,15,0.3)'; g.beginPath(); g.ellipse(W / 2, H - 6, W * 0.55, 16, 0, 0, Math.PI * 2); g.fill();
        // raised wooden floor edge + bamboo wall
        const wallTop = H - 92, wallBot = H - 14;
        g.fillStyle = '#5a4026'; g.fillRect(8, wallBot - 2, W - 16, 12);
        for (let x = 14; x < W - 14; x += 7) {
          const k = U.hash(x, 1, 5);
          g.fillStyle = k > 0.5 ? '#b99a5c' : '#a8884c'; g.fillRect(x, wallTop, 6, wallBot - wallTop);
          g.fillStyle = 'rgba(80,55,25,0.55)'; g.fillRect(x + 5, wallTop, 1.2, wallBot - wallTop);
          g.fillStyle = 'rgba(80,55,25,0.35)'; g.fillRect(x, wallTop + 18 + k * 6, 6, 1.4); g.fillRect(x, wallTop + 48 + k * 8, 6, 1.4);
        }
        g.strokeStyle = '#4a3218'; g.lineWidth = 2; g.strokeRect(14, wallTop, W - 28, wallBot - wallTop);
        // rattan binding bands
        g.fillStyle = '#6a4a26'; g.fillRect(14, wallTop + 12, W - 28, 3); g.fillRect(14, wallBot - 18, W - 28, 3);
        // door / window openings
        const dx = door * T + 10, dw = T - 20;
        const lg = g.createLinearGradient(0, wallTop + 14, 0, wallBot);
        lg.addColorStop(0, '#2a1a10'); lg.addColorStop(1, '#5a3a1e');
        g.fillStyle = lg; g.fillRect(dx, wallTop + 16, dw, wallBot - wallTop - 16);
        g.fillStyle = 'rgba(255,170,80,0.25)'; g.fillRect(dx + 6, wallBot - 30, dw - 12, 26);
        g.strokeStyle = '#3a2412'; g.lineWidth = 2.5; g.strokeRect(dx, wallTop + 16, dw, wallBot - wallTop - 16);
        for (let i = 0; i < w; i++) {
          if (i === door || i === 0 || i === w - 1) continue;
          const wx = i * T + 18;
          g.fillStyle = '#2e2014'; g.fillRect(wx, wallTop + 26, 28, 20);
          g.strokeStyle = '#6a4a26'; g.lineWidth = 1.5; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(wx + k * 7, wallTop + 26); g.lineTo(wx + k * 7, wallTop + 46); g.stroke(); }
        }
        // porch posts
        for (let i = 0; i <= w; i++) {
          const x = Math.min(W - 10, Math.max(8, i * T));
          g.fillStyle = '#6a4a2a'; g.fillRect(x - 3, wallTop - 6, 6, wallBot - wallTop + 12);
          g.fillStyle = 'rgba(255,230,180,0.25)'; g.fillRect(x - 3, wallTop - 6, 2, wallBot - wallTop + 12);
        }
        // thatched roof (deep eaves)
        const ry0 = -M + (big ? 6 : 16), ry1 = wallTop + 8, over = 16;
        const rg = g.createLinearGradient(0, ry0, 0, ry1);
        rg.addColorStop(0, '#e2c47c'); rg.addColorStop(0.55, '#c9a45c'); rg.addColorStop(1, '#9a7838');
        g.fillStyle = rg; g.strokeStyle = '#6e5222'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(26, ry0); g.lineTo(W - 26, ry0); g.lineTo(W + over - 4, ry1); g.lineTo(-over + 4, ry1); g.closePath(); g.fill(); g.stroke();
        // straw strokes
        for (let i = 0; i < W * 1.4; i++) {
          const u = U.hash(i, 7, 11), v = U.hash(i, 9, 13);
          const x = -over + 6 + u * (W + over * 2 - 12), y = ry0 + 6 + v * (ry1 - ry0 - 10);
          g.strokeStyle = v > 0.5 ? 'rgba(255,240,190,0.35)' : 'rgba(110,80,30,0.35)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (u - 0.5) * 3, y + 9); g.stroke();
        }
        // ridge & fringe
        g.fillStyle = '#7a5a28'; g.fillRect(24, ry0 - 5, W - 48, 7);
        for (let x = -over + 4; x < W + over - 4; x += 4) { g.strokeStyle = '#8a6a30'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, ry1 - 2); g.lineTo(x + 1, ry1 + 5 + U.hash(x, 2, 3) * 4); g.stroke(); }
        // ridge bindings
        for (let x = 40; x < W - 40; x += 46) { g.fillStyle = '#5a3e1c'; g.fillRect(x, ry0 - 7, 5, 11); }
        if (big) { // age-grade house: carved front boards
          g.fillStyle = '#3a2614'; g.fillRect(W / 2 - 40, ry1 - 30, 80, 22);
          g.fillStyle = '#c8402a'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(W / 2 - 34 + k * 13, ry1 - 12); g.lineTo(W / 2 - 28 + k * 13, ry1 - 26); g.lineTo(W / 2 - 22 + k * 13, ry1 - 12); g.fill(); }
        }
      });
      ctx.drawImage(c, px - 12, py - M, c.lw, c.lh);
    },
    lights: (o) => [{ dx: ((o.door == null ? 2 : o.door) + 0.5) * T, dy: (o.h || 3) * T - 40, r: 110, color: '#ffae5a', flicker: 0.3 }],
  });

  // 燈篙 — tall bamboo pole with lanterns on top (o.blue: ghost-blue light)
  G.Objects.define('c10_denggao', {
    w: 1, h: 1, solid: true, anim: true,
    draw(ctx, px, py, o, t) {
      const base = cached('denggao', 96, 360, (g) => {
        g.translate(48, 340);
        g.fillStyle = 'rgba(30,20,10,0.35)'; g.beginPath(); g.ellipse(0, -8, 26, 8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#8a8478'; g.strokeStyle = '#4a463e'; g.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(-14 + i * 7, -12 + (i % 2) * 3, 7, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
        bamboo(g, 0, -10, 0, -320, 5);
        for (let y = -40; y > -320; y -= 34) { g.fillStyle = '#6e5a2c'; g.fillRect(-3.5, y, 7, 2); }
        bamboo(g, -26, -306, 26, -306, 3);
        // leafy top
        g.fillStyle = '#5a8a3a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(-4 + i * 2, -330 + i, 3, 12, -0.6 + i * 0.3, 0, Math.PI * 2); g.fill(); }
      });
      ctx.drawImage(base, px + 32 - 48, py + 56 - 340, base.lw, base.lh);
      const sw = Math.sin(t * 1.7 + o.x) * 3, col = o.blue ? '#9ac8ff' : '#ffcf7a';
      for (const [dx, k] of [[-22, 0], [22, 1]]) {
        const x = px + 32 + dx + sw, y = py + 56 - 294;
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 32 + dx, py + 56 - 306); ctx.lineTo(x, y); ctx.stroke();
        const lg = ctx.createRadialGradient(x, y + 10, 2, x, y + 10, 14);
        lg.addColorStop(0, o.blue ? '#e8f4ff' : '#fff2c8'); lg.addColorStop(1, o.blue ? '#4a7ad8' : (k ? '#d8402a' : '#e8e0d0'));
        ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(x, y + 10, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(60,20,10,0.6)'; ctx.stroke();
        ctx.fillStyle = '#2a1a10'; ctx.fillRect(x - 5, y - 3, 10, 3); ctx.fillRect(x - 5, y + 21, 10, 3);
      }
      if (o.name) { // the name lantern hanging below (阿義)
        const x = px + 32 + sw * 0.6, y = py + 56 - 240;
        const lg = ctx.createRadialGradient(x, y + 12, 2, x, y + 12, 16);
        lg.addColorStop(0, '#fff6d8'); lg.addColorStop(1, '#e05a2a');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(x, y + 12, 11, 15, 0, 0, Math.PI * 2); ctx.fill();
        G.Render.text(ctx, o.name, x, y + 2, { size: 10, align: 'center', color: '#3a1008', shadow: false });
      }
      void col;
    },
    lights: (o) => [{ dx: 32, dy: 56 - 284, r: 220, color: o.blue ? '#8ab8ff' : '#ffcf7a', flicker: 0.25 }],
  });

  // a monster drawn on the map as a y-sorted prop (cutscenes; never starts a battle)
  G.Objects.define('c10_monster_show', {
    w: 1, h: 1, solid: true, anim: true,
    draw(ctx, px, py, o, t) {
      const md = G.Monsters.get(o.art);
      const sc = o.scale || (md ? U.clamp(110 / md.h, 0.25, 0.7) : 0.5);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(px + 32, py + 54, 26 * sc / 0.5, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(px + 32, py + 56 + Math.sin(t * 3 + o.x) * 2);
      if (o.flip) ctx.scale(-1, 1);
      ctx.scale(sc, sc);
      G.Monsters.draw(ctx, o.art, 0, 0, t, { state: 'idle', variant: o.variant || 0 });
      ctx.restore();
    },
  });

  // chapter sprites (spec format documented in js/gfx/sprites.js)
  if (G.Sprites && G.Sprites.define) {
    G.Sprites.define('c10_tao_child', { base: 'tao_m', body: 'child', mouth: 'smile', hair: { style: 'tuft', color: '#1a1614', back: 'short' } });
    G.Sprites.define('c10_tao_elder', { base: 'tao_f', body: 'elderf', eyeStyle: 'line', mouth: 'flat', hair: { style: 'center', color: '#d8d4cc', back: 'long', len: 0.4 } });
    G.Sprites.define('c10_amis_m', { base: 'amis_elder', body: 'adult', eyeStyle: 'round', mouth: 'flat', hair: { style: 'messy', color: '#1a1614' } });
    G.Sprites.define('c10_truku_m', { base: 'hunter', skin: '#c8966e', mouth: 'flat', hat: { type: 'band', color: '#a8242a' },
      top: { color: '#efe8da', len: 0.26, closure: 'cross', inner: '#efe8da', trim: '#a8242a', sleeve: 'rolled', bands: [{ at: 0.6, h: 0.12, color: '#a8242a', acc: '#f4efe2', motif: 'diamond' }] } });
    G.Sprites.define('c10_puyuma_boy', { base: 'puyuma_m', size: 0.92, mouth: 'smile' });
    G.Sprites.define('c10_muntjac', { kind: 'quad', species: 'dog', size: 0.9, col: { base: '#9a6438', belly: '#d8b488', dark: '#4a2c16', nose: '#2a2020', eye: '#2a1a10', collar: '' } });
  }

  // =================================================================================================
  // data: items, skills, enemies, troops, quests
  // =================================================================================================
  const I = G.Data.items;
  Object.assign(I, {
    // key items
    c10_oar: { name: 'Syaman 的槳', desc: '漂在礁盤上的槳。槳柄上有一圈一圈的磨痕，是好幾代人的手握出來的。', type: 'key', price: 0, ch: 10, icon: 'key' },
    c10_figurehead: { name: '船首木雕', desc: '拼板舟高高翹起的船首，上面有細細的刻紋。Kaswal 抱著它不肯放。', type: 'key', price: 0, ch: 10, icon: 'misc' },
    c10_permit: { name: '入山許可（依旺的麻線）', desc: '依旺奶奶繫在星河手腕上的一段麻線。進峽谷獵場，要守太魯閣族的規矩。', type: 'key', price: 0, ch: 10, icon: 'vine' },
    c10_xinghe_lantern: { name: '星河的燈籠', desc: '九份陳記的式樣：紅紙、竹骨，一筆一筆寫著「沈星河」。不是魂燈，是陳伯做的燈籠。', type: 'key', price: 0, ch: 10, icon: 'lantern' },
    c10_ayi_lantern: { name: '阿義的燈籠', desc: '星河親手寫上「阿義」兩個字的燈籠。九份陳記的學徒，字沒有寫歪。', type: 'key', price: 0, ch: 10, icon: 'lantern' },
    c10_pudu_offering: { name: '普渡供品', desc: '阿坤和頭城鄉親塞來的供品。「拿去給好兄弟！」——對孤魂眾使用，讓它們少餓一點。', type: 'use', price: 0, ch: 10, icon: 'food', use: { target: 'enemy', battle: true, field: false, status: { id: 'atkDown', chance: 1, turns: 2 } } },
    // consumables
    c10_xiaomigao: { name: '小米糕', desc: '小米蒸成的糕，又香又黏。回復真氣 150。', type: 'use', price: 260, ch: 10, icon: 'food', use: { target: 'ally', mp: 150 } },
    c10_qiyuwan: { name: '旗魚丸湯', desc: '後山漁港的旗魚丸，一顆顆彈牙。回復氣血 900。', type: 'use', price: 300, ch: 10, icon: 'food', use: { target: 'ally', heal: 900 } },
    c10_fanshu: { name: '番薯籤粥', desc: '番薯籤煮的粥，討海人家的早餐。全體回復氣血 600。', type: 'use', price: 480, ch: 10, icon: 'food', use: { target: 'allies', heal: 600 } },
    c10_baicao: { name: '百草膏', desc: '後山草藥熬成的膏，敷上去涼涼的。回復氣血 800。', type: 'use', price: 220, ch: 10, icon: 'herb', use: { target: 'ally', heal: 800 } },
    c10_alifengfeng: { name: '阿里鳳鳳', desc: '葉子編成的小包，裡面是飯。出遠門的人帶著吃。氣血全滿並持續回復。', type: 'use', price: 0, ch: 10, icon: 'food', use: { target: 'ally', heal: 9999, status: { id: 'regen', chance: 1, turns: 3 } } },
    c10_gaozha: { name: '糕渣', desc: '外面酥、裡面燙，宜蘭辦桌一定有。小心燙嘴！回復氣血 1400。', type: 'use', price: 420, ch: 10, icon: 'food', use: { target: 'ally', heal: 1400 } },
    c10_mifengeng: { name: '米粉羹', desc: '頭城街上的米粉羹，稠稠的一碗。回復真氣 180。', type: 'use', price: 300, ch: 10, icon: 'food', use: { target: 'ally', mp: 180 } },
    c10_pudugao: { name: '普渡糕', desc: '普渡完分給大家的糕。好兄弟吃過了，人也吃一口。全體回復氣血 900。', type: 'use', price: 700, ch: 10, icon: 'food', use: { target: 'allies', heal: 900 } },
    c10_quxiefu: { name: '驅邪符', desc: '洄瀾小廟求來的符，專門對付不肯走的東西。對敵一體造成 600 點火屬性傷害。', type: 'use', price: 200, ch: 10, icon: 'talisman', use: { target: 'enemy', damage: 600, elem: 'fire', battle: true } },
    // equipment
    c10_sw_chaosheng: { name: '潮聲劍', desc: '寶桑打鐵舖的劍，揮起來有浪的聲音。', type: 'weapon', price: 2000, ch: 10, icon: 'sword', who: ['xinghe'], stats: { atk: 76 } },
    c10_sw_lanyang: { name: '蘭陽劍', desc: '蘭陽平原的鐵匠打的劍，劍脊直得像頭城的海岸線。', type: 'weapon', price: 2600, ch: 10, icon: 'sword', who: ['xinghe'], stats: { atk: 84, luk: 3 } },
    c10_sw_heichao: { name: '黑潮劍', desc: '被逆潮沖進峽谷的外來漂流物。劍身泛著深藍的光，像黑潮本身。', type: 'weapon', price: 0, ch: 10, icon: 'sword', who: ['xinghe'], stats: { atk: 87, spd: 3 } },
    c10_sp_huilang: { name: '洄浪槍', desc: '槍身刻著回捲的浪紋。', type: 'weapon', price: 2000, ch: 10, icon: 'spear', who: ['hongying'], stats: { atk: 78 } },
    c10_sp_huilan: { name: '洄瀾槍', desc: '洄瀾港的老師傅打的槍，「水在這裡打轉」。', type: 'weapon', price: 2400, ch: 10, icon: 'spear', who: ['hongying'], stats: { atk: 83, spd: 2 } },
    c10_sp_duanya: { name: '斷崖槍', desc: '卡在清水斷崖岩棚上的長槍，不知是哪艘沉船上的東西。', type: 'weapon', price: 0, ch: 10, icon: 'spear', who: ['hongying'], stats: { atk: 88, luk: 4 } },
    c10_fn_jingge: { name: '鯨歌符扇', desc: '被浪打上河口的符扇，扇骨是鯨骨。搧起來像遠處的鯨在唱歌。', type: 'weapon', price: 0, ch: 10, icon: 'fan', who: ['yungui'], stats: { atk: 10, mag: 82, mp: 24 } },
    c10_fn_yunjian: { name: '雲澗符扇', desc: '峽谷壺穴裡撿到的外來漂流物。扇面上的雲像峽谷裡的水氣。', type: 'weapon', price: 0, ch: 10, icon: 'fan', who: ['yungui'], stats: { atk: 11, mag: 90, mp: 28 } },
    c10_fn_haishen: { name: '海神符扇', desc: '頭城道壇流出來的老符扇。', type: 'weapon', price: 2800, ch: 10, icon: 'fan', who: ['yungui'], stats: { atk: 11, mag: 92, mp: 26 } },
    c10_ar_tengjia: { name: '藤甲', desc: '山藤編成的甲，輕又韌。', type: 'armor', price: 1500, ch: 10, icon: 'armor', stats: { def: 40 } },
    c10_ar_shiwen: { name: '石紋甲', desc: '甲片磨成大理石的紋路。', type: 'armor', price: 1800, ch: 10, icon: 'armor', stats: { def: 43, hp: 20 } },
    c10_ar_jiaosi: { name: '蕉絲衫', desc: '蕉絲阿姨用香蕉絲織的布做的衫，涼爽，不怕水。', type: 'armor', price: 2200, ch: 10, icon: 'armor', stats: { def: 45 }, resist: ['water'] },
    c10_hd_lupi: { name: '鹿皮帽', desc: '寶桑交易街換來的鹿皮帽。', type: 'head', price: 900, ch: 10, icon: 'hat', stats: { def: 19 } },
    c10_hd_zhubian: { name: '竹編笠', desc: '洄瀾的竹編斗笠，風再大也吹不跑。', type: 'head', price: 1000, ch: 10, icon: 'hat', stats: { def: 21 }, resist: ['wood'] },
    c10_hd_jiaosi: { name: '蕉絲頭巾', desc: '蕉絲織成的頭巾。', type: 'head', price: 1150, ch: 10, icon: 'hat', stats: { def: 22, mag: 6 } },
    c10_ft_lupi: { name: '鹿皮綁靴', desc: '寶桑的鹿皮做的綁靴，走礫石灘也不磨腳。', type: 'feet', price: 800, ch: 10, icon: 'shoes', stats: { def: 14, spd: 5 } },
    c10_ft_kuaitui: { name: '快腿綁腿', desc: '巴拉冠青年送的綁腿。「輸了要服氣。我服氣。」', type: 'feet', price: 0, ch: 10, icon: 'shoes', stats: { def: 14, spd: 9 } },
    c10_ft_jiaosi: { name: '蕉絲綁腿', desc: '蕉絲織的綁腿，輕巧耐走。', type: 'feet', price: 1000, ch: 10, icon: 'shoes', stats: { def: 16, spd: 7 } },
    c10_ac_coral: { name: '珊瑚護符', desc: '岬角崖邊撿到的紅珊瑚，被海水磨得圓潤。', type: 'acc', price: 0, ch: 10, icon: 'charm', stats: { def: 10 }, resist: ['water'] },
    c10_ac_snakescale: { name: '蛇鱗護腕', desc: '海蛇洗淨後留在灘上的一片鱗，深藍帶金紋。', type: 'acc', price: 0, ch: 10, icon: 'charm', stats: { def: 12, hp: 40 }, resist: ['water'] },
    c10_ac_shiwen: { name: '石紋護符', desc: '石巨靈崩落後，溪水裡一塊溫溫的大理石。', type: 'acc', price: 0, ch: 10, icon: 'gem', stats: { def: 16 }, resist: ['earth'] },
    c10_ac_yujia: { name: '漁家護腕', desc: '烏石港漁夫用的護腕，拉網拉出來的力氣。', type: 'acc', price: 1400, ch: 10, icon: 'charm', stats: { atk: 12 } },
    c10_ac_kolas: { name: 'Kolas 的魚鉤', desc: '「我年輕的時候也是這樣。」老漁夫用了幾十年的骨製魚鉤。', type: 'acc', price: 0, ch: 10, icon: 'charm', stats: { luk: 12, spd: 2 }, special: ['goldUp'] },
    c10_ac_touqi: { name: '頭旗綵帶', desc: '搶到頭旗的隊伍才有的綵帶。戰鬥開始時搶先行動。', type: 'acc', price: 0, ch: 10, icon: 'charm', stats: { spd: 10, luk: 8 }, special: ['firstStrike'] },
    c10_ac_iwan: { name: '依旺的織帶', desc: '依旺奶奶織的布帶。紅底白菱紋。「你綁著，記得今天。」', type: 'acc', price: 0, ch: 10, icon: 'charm', who: ['xinghe'], stats: { hp: 70, def: 6 }, immune: ['seal'], special: ['gaugeUp'] },
    // materials
    c10_seasalt: { name: '海鹽結晶', desc: '礁盤上曬出來的鹽，結成一顆顆方方的晶。', type: 'material', price: 120, ch: 10, icon: 'gem' },
    c10_beinanstone: { name: '卑南溪石', desc: '卑南溪口的石頭，圓圓的，帶著青色的紋。', type: 'material', price: 150, ch: 10, icon: 'gem' },
    c10_serpentscale: { name: '海蛇鱗', desc: '被黑潮洗淨的海蛇鱗片。', type: 'material', price: 400, ch: 10, icon: 'gem' },
    c10_marbleheart: { name: '大理石心', desc: '石巨靈胸口崩落的一塊石頭，摸起來是溫的。', type: 'material', price: 500, ch: 10, icon: 'gem' },
    c10_puduash: { name: '普渡香灰', desc: '普渡之夜爐裡的香灰，包在紅紙裡。', type: 'material', price: 200, ch: 10, icon: 'incense' },
  });

  const SK = G.Data.skills;
  Object.assign(SK, {
    yg_pudu: { name: '普渡咒', desc: '搖響法鈴，唸起普渡科儀。請無主的孤魂先吃飽再上路。對敵全體術法傷害。', mp: 60, type: 'mag', elem: null, target: 'enemies', power: 1.2, fx: 'lantern', sfx: 'bell' },
    c10_es_dive: { name: '潛水', desc: '海蛇沉進黑水裡……水面下，一道長長的影子在移動。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'water', sfx: 'splash' },
    c10_es_surge: { name: '破浪突襲', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.7, fx: 'bite', sfx: 'crit' },
    c10_es_ram: { name: '撲向拼板舟', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.6, fx: 'bite', sfx: 'crit' },
    c10_es_sweep: { name: '浪頭掃灘', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 1.2, fx: 'water', sfx: 'water' },
    c10_es_tailwhip: { name: '連環甩尾', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemies', power: 0.9, hits: 2, fx: 'slash_multi', sfx: 'slash2' },
    c10_es_pinch: { name: '巨螯', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.4, fx: 'claw', sfx: 'hit' },
    c10_es_undertow: { name: '暗流', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.5, buffs: [{ stat: 'def', amt: -0.3, turns: 3 }], fx: 'water', sfx: 'water' },
    c10_es_homesick: { name: '望鄉', desc: '「回……回唐山……」', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.2, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'ghost', sfx: 'ghost' },
    c10_es_pull: { name: '拖上岸', desc: '潮怨把海裡新的溺魂拖上了岸。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['drowned_soul'], fx: 'water', sfx: 'ghost' },
    c10_es_damburst: { name: '潰堤黑水', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.4, fx: 'water_big', sfx: 'water' },
    c10_es_snatch: { name: '搶供品', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.6, fx: 'claw', sfx: 'hit' },
    c10_es_callkin: { name: '呼喚同伴', desc: '更多瘦得只剩骨架的孤魂擠了過來。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['hungry_ghost'], fx: 'ghost', sfx: 'ghost' },
  });

  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  function enemy(id, d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(1, Math.round(c.exp * expM)), gold: Math.max(1, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, p.skills ? { skills: p.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })) } : {}));
    G.Data.enemies[id] = e;
  }
  enemy('c10_tide_crab', {
    name: '潮病蟹精', art: 'sand_crab', variant: 2, lv: 34, elem: 'earth', weak: ['wood'], resist: ['metal'],
    m: { hp: 1.15, atk: 1.05, def: 1.6, mag: 0.6, spd: 0.8 },
    skills: [['c10_es_pinch', 3], ['e_claw', 2], ['e_cliff_shell', 1]], drops: [['c10_seasalt', 0.2]],
    desc: '背上長滿黑色藤壺的大螃蟹精。潮病讓牠的殼變得像石頭一樣硬，也讓牠忘了自己原本只是一隻螃蟹。',
  });
  enemy('c10_sea_wisp', {
    name: '鹽霧魂', art: 'sea_wisp', variant: 1, lv: 34, elem: 'water', weak: ['fire', 'earth'],
    m: { hp: 0.8, atk: 0.8, mag: 1.25, spd: 1.2 },
    skills: [['e_ghost_touch', 3], ['e_mist_veil', 1]], drops: [['c10_xiaomigao', 0.12]],
    desc: '黑潮上被鹽霧裹住的小魂，一碰就冷到骨頭裡。',
  });
  enemy('c10_tide_wraith', {
    name: '潮怨', art: 'tide_grudge', variant: 2, lv: 35, elem: 'water', weak: ['earth'], resist: ['water'],
    m: { hp: 1.7, atk: 1.0, mag: 1.3, spd: 0.95 },
    skills: [['c10_es_undertow', 2], ['e_tg_wave', 2], ['e_tg_curse', 1]], drops: [['huanhunxiang', 0.15]],
    desc: '被逆潮從西邊的海推過來的怨念。它說的話沒有人聽得懂——那是唐山的鄉音。',
  });
  enemy('c10_tide_wraith_big', {
    name: '大潮怨', art: 'tide_grudge', variant: 2, scale: 1.45, lv: 36, elem: 'water', weak: ['earth'], resist: ['water'], boss: true, immune: BOSS_IMM,
    m: { hp: 4.4, atk: 1.95, mag: 1.9, def: 1.1, spd: 1.1, exp: 4, gold: 4 },
    skills: [['c10_es_undertow', 3], ['c10_es_homesick', 2], ['e_tg_wave', 1], ['c10_es_pull', 1, 'hp<70']],
    phases: [{ at: 0.5, text: '潮怨：「……回……回唐山……回不去……就在這裡……」', skills: [['c10_es_homesick', 3], ['c10_es_undertow', 2], ['c10_es_pull', 1]] }],
    drops: [['c10_baicao', 1]],
    desc: '把一個又一個溺魂從海裡拉上岬角的大潮怨。它面朝西方——那是它回不去的家鄉。',
  });
  enemy('c10_guhun_horde', {
    name: '孤魂眾', art: 'hungry_ghost', variant: 2, scale: 2.2, lv: 38, elem: 'water', weak: ['earth', 'fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 5.0, atk: 1.9, mag: 1.8, def: 1.1, spd: 1.15, exp: 6, gold: 0.01 },
    skills: [['e_hungry_grab', 3], ['e_hungry_wail', 2], ['c10_es_snatch', 1], ['c10_es_callkin', 1, 'hp<70']],
    drops: [['c10_puduash', 1]],
    desc: '數百個瘦削的孤魂糾纏成一團，伸出無數細長的手臂。它們不是恨——是餓，是沒有人叫它們的名字。',
  });

  const TR = G.Data.troops;
  const troop = (id, enemies, bg, bgm, extra) => { TR[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle2' }, extra || {}); };
  troop('t_c10_sea_a', ['sea_monster_v1', 'moray_v2'], 'wangboat');
  troop('t_c10_sea_b', ['drowned_soul', 'drowned_soul', 'c10_sea_wisp'], 'wangboat');
  troop('t_c10_reef_a', ['c10_tide_crab', 'moray_v2'], 'orchid');
  troop('t_c10_reef_b', ['c10_tide_crab', 'c10_tide_crab'], 'orchid');
  troop('t_c10_reef_kaswal', ['moray_v2', 'c10_tide_crab', 'c10_tide_crab'], 'orchid', 'battle2', { flee: false });
  troop('t_c10_coast_a', ['drowned_soul', 'drowned_soul', 'c10_sea_wisp'], 'eastcoast');
  troop('t_c10_coast_b', ['drowned_soul', 'c10_tide_wraith'], 'eastcoast');
  troop('t_c10_coast_fix_a', ['drowned_soul', 'drowned_soul', 'c10_tide_crab'], 'eastcoast', 'battle2', { flee: false });
  troop('t_c10_coast_fix_b', ['c10_tide_wraith', 'drowned_soul', 'drowned_soul'], 'eastcoast', 'battle2', { flee: false });
  troop('t_c10_coast_boss', ['c10_tide_wraith_big', 'drowned_soul', 'drowned_soul'], 'eastcoast', 'boss', { boss: true, flee: false });
  troop('t_c10_cliff_a', ['cliff_spirit', 'cliff_spirit'], 'taroko');
  troop('t_c10_cliff_b', ['cliff_spirit', 'sea_monster_v1'], 'taroko');
  troop('t_c10_guhun', ['c10_guhun_horde', 'hungry_ghost', 'hungry_ghost_v1'], 'toucheng', 'boss', { boss: true, flee: false });

  const Q = G.Data.quests = G.Data.quests || {};
  Object.assign(Q, {
    q_c10_main: { name: '後山巡境', main: true, desc: '王船乘著黑潮沿後山北上，繞島巡境。', stages: ['乘黑潮前往蘭嶼。', '北上到台東，幫阿美族部落清理海岸。', '到花蓮，峽谷的水黑了。', '前往頭城，參加搶孤。', '順風旗到手。王船轉向西方。'] },
    q_c10_tatala: { name: '達悟家族的拼板舟', lantern: true, desc: '在蘭嶼，Kaswal 一家的拼板舟被潮病的東西撞壞了。在別人的家裡，守別人的規矩。', stages: ['留在海邊，守達悟人的規矩。', '找回 Kaswal、槳和船首木雕。', '夜裡守住灘頭的船。', '看 Syaman 修船。'], doneText: '修好的拼板舟划向了黑潮。' },
    q_c10_haiji: { name: '阿美族海祭', lantern: true, desc: '海邊不乾淨，海不會聽部落的人說話。在海祭之前，把三處溺魂送走。', stages: ['夜裡清理河口、礁岸、岬角的溺魂。', '天亮了。回部落。'], doneText: '在觀禮樹下遠遠地看了海祭。' },
    q_c10_race: { name: '寶桑海灘賽跑', desc: '巴拉冠青年想和紅纓比一圈。', stages: ['在寶桑海灘和巴拉冠青年比一圈。'], doneText: '「輸了要服氣。我服氣。」' },
    q_c10_luohanjiao: { name: '羅漢腳阿義', lantern: true, desc: '頭城燈篙下，一個沒有人記得名字的孤魂。', stages: ['請陳伯做一盞燈籠。', '把阿義的燈籠掛上燈篙。', '等普渡之夜。'], doneText: '阿義吃飽了，順著燈篙往上，飛進夜空。' },
  });

  // =================================================================================================
  // shared story helpers
  // =================================================================================================
  const H = {};
  H.days = (n) => { V().days_to_gate = n; };
  H.trust = (n) => { V().ch10_tao_trust = (V().ch10_tao_trust || 0) + n; };
  H.objective = (S, text) => S.objective(text);

  // 巡境圖 overlay: six points on the island, the newest one lights up
  const XUN = ['donggang', 'eluanbi', 'orchid', 'taitung', 'taroko', 'toucheng'];
  class XunjingScene {
    constructor(n) { this.n = n; this.t = 0; this.opaque = true; }
    update(dt) {
      this.t += dt;
      const done = (autoplay() && this.t > 0.15) || (this.t > 1.4 && (G.Input.pressed('ok') || G.Input.clicked())) || this.t > 5;
      if (done) { G.Scenes.pop(this); if (this.onDone) this.onDone(); }
    }
    draw(ctx) {
      const t = this.t;
      const box = { x: 0, y: 0, w: G.W, h: G.H, ox: 300, oy: -10, s: 1 };
      G.World.drawMap(ctx, box, t, { current: null });
      const sub = { x: box.ox, y: box.oy, s: 1 };
      const pts = XUN.map((id) => G.World.proj(G.World.PLACES[id][0], G.World.PLACES[id][1], sub));
      if (this.n >= 6) {
        const k = U.clamp((t - 0.8) / 1.6, 0, 1);
        ctx.save();
        ctx.strokeStyle = `rgba(255,214,120,${0.85 * k})`; ctx.lineWidth = 4; ctx.shadowColor = '#ffcf6a'; ctx.shadowBlur = 24;
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      XUN.forEach((id, i) => {
        const [x, y] = pts[i];
        const lit = i < this.n, fresh = i === this.n - 1;
        const pulse = fresh ? U.clamp(t * 1.5, 0, 1) : 1;
        ctx.save();
        if (lit) {
          const r = 26 + (fresh ? 10 * Math.sin(t * 5) * (1 - U.clamp(t / 3, 0, 1)) : 0);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * pulse + 4);
          g.addColorStop(0, 'rgba(255,240,190,0.95)'); g.addColorStop(0.4, 'rgba(255,190,90,0.55)'); g.addColorStop(1, 'rgba(255,170,60,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * pulse + 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = lit ? '#ffe7a0' : 'rgba(180,180,180,0.5)'; ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, lit ? 8 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
        G.Render.text(ctx, ['①', '②', '③', '④', '⑤', '⑥'][i], x + 12, y - 30, { size: 18, color: lit ? '#ffe7a0' : '#8a8a8a', stroke: 'rgba(10,14,24,0.85)', strokeW: 3 });
      });
      G.Render.text(ctx, '巡境圖', 60, 40, { size: 36, color: '#fff0d0', glow: 'rgba(255,170,90,0.5)', glowBlur: 12 });
      const name = G.World.PLACES[XUN[this.n - 1]][2];
      G.Render.text(ctx, `「${name}」亮起來了。`, 62, 92, { size: 22, color: '#ffd98a' });
      G.Render.text(ctx, `巡境 ${this.n} / 6`, 62, 128, { size: 20, color: '#c9b893' });
      G.FX.vignette(ctx, 0.4);
    }
  }
  H.xunjing = async (S, n) => {
    V().xunjing = Math.max(V().xunjing || 0, n);
    S.sfx('lantern');
    await S.scene(new XunjingScene(n));
  };

  // put the party (leader + followers) on a cell
  H.place = (S, x, y, dir) => { S.setPos('player', x, y, dir); S.gather(); };

  // flying blue lights rising from the sea (drawn by maps' drawOver while V().c10_lights is set)
  const LIGHTS = [];
  H.lightsStart = (cx, cy, n = 40, spread = 6, o = {}) => {
    LIGHTS.length = 0;
    for (let i = 0; i < n; i++) {
      LIGHTS.push({ x: (cx + U.rand(-spread, spread)) * T, y: (cy + U.rand(-1, 1.5)) * T, vx: (o.vx || 0) + U.rand(-8, 8), vy: (o.vy || -22) + U.rand(-10, 8), d: U.rand(0, 1.5), ph: U.rand(0, 6), r: U.rand(3, 6) });
    }
    H.lightsT = 0;
  };
  H.lightsStop = () => { LIGHTS.length = 0; };
  H.drawLights = (ctx, t) => {
    if (!LIGHTS.length) return;
    const dt = 1 / 60;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of LIGHTS) {
      if (L.d > 0) { L.d -= dt; continue; }
      L.x += L.vx * dt; L.y += L.vy * dt; L.ph += dt;
      const a = U.clamp(L.ph * 0.8, 0, 1) * (0.6 + 0.4 * Math.sin(L.ph * 4));
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 4);
      g.addColorStop(0, `rgba(200,230,255,${0.95 * a})`); g.addColorStop(0.35, `rgba(110,170,255,${0.5 * a})`); g.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, L.r * 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  // =================================================================================================
  // boss special rules (installed through the battle `intro` hook — wraps the scene instance only)
  // =================================================================================================
  function hudPlate(ctx, x, y, w, h) {
    ctx.save(); ctx.fillStyle = 'rgba(8,10,20,0.72)'; ctx.strokeStyle = 'rgba(240,210,140,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  // 潮病海蛇 — dive / surge (guard to halve & stun), ramming the boats, 陳伯's oar, barnacles falling off
  function serpentRules(sc) {
    const boss = sc.enemies.find((e) => e.id === 'tide_serpent');
    if (!boss) return;
    const R = { n: 0, dive: null, p2: false, p3: false };
    // the dive turns (untargetable) lengthen the fight: compensate with a little less HP than the plain data boss
    boss.mhp = boss.hp = Math.round(boss.mhp * 0.8);
    const ai = sc.aiCommand.bind(sc), exec = sc.execute.bind(sc), apply = sc.applyEffect.bind(sc), phases = sc.checkPhases.bind(sc);
    sc.aiCommand = (e) => {
      if (e !== boss) return ai(e);
      R.n++;
      const foes = sc.alive('party');
      if (R.dive) {
        const tg = R.dive.dead ? U.pick(foes) : R.dive;
        R.dive = null;
        return { kind: 'skill', skill: 'c10_es_surge', targets: [tg] };
      }
      if (R.n % 3 === 0) { R.dive = U.pick(foes); return { kind: 'skill', skill: 'c10_es_dive', targets: [boss] }; }
      if (R.p2 && R.n % 4 === 2) {
        const xh = sc.party.find((p) => p.id === 'xinghe' && !p.dead);
        return xh ? { kind: 'skill', skill: 'c10_es_ram', targets: [xh], ram: true } : { kind: 'skill', skill: 'c10_es_sweep', targets: foes, ram: true };
      }
      if (R.p3 && Math.random() < 0.35) return { kind: 'skill', skill: 'c10_es_tailwhip', targets: foes };
      return ai(e);
    };
    sc.execute = async (u, cmd) => {
      if (u !== boss) return exec(u, cmd);
      if (cmd.skill === 'c10_es_dive') {
        sc.banner('潛水', '#ff9a8a');
        G.Audio.sfx('splash');
        await sc.tween(boss, { alpha: 0.25, oy: 40 }, 0.4);
        boss.submerged = true;
        const tg = R.dive;
        if (tg) { sc.popText(tg, '！', '#ffd84a', -20); sc.say(`王船的船頭燈照出水下的影子——牠朝${tg.name}游過去了！（防禦可以撐住）`, 2.6); }
        await sc.wait(1.0);
        return;
      }
      if (cmd.skill === 'c10_es_surge') {
        boss.submerged = false;
        await sc.tween(boss, { alpha: 1, oy: 0 }, 0.25);
        const tg = cmd.targets[0];
        const guarded = !!(tg && tg.st.guard);
        await exec(u, cmd);
        if (guarded) { sc.say('撞上了！海蛇一頭撞在防禦上，暈頭轉向。', 1.8); boss.st.stun = 1; sc.popText(boss, '定身！', '#ffd84a'); await sc.wait(0.6); }
        return;
      }
      if (cmd.ram) {
        if (cmd.skill === 'c10_es_ram') sc.say('海蛇撲向灘頭的拼板舟——星河擋在船前！', 1.8);
        else sc.say('浪頭掃過灘頭！', 1.4);
        await sc.wait(0.5);
      }
      return exec(u, cmd);
    };
    sc.applyEffect = (u, tg, s, hits) => {
      if (tg === boss && boss.submerged && u.side === 'party' && (s.type === 'phys' || s.type === 'mag')) { sc.popText(tg, '潛入水中', '#8ac8ff'); return; }
      return apply(u, tg, s, hits);
    };
    sc.checkPhases = async () => {
      await phases();
      if (boss.dead) return;
      if (!R.p2 && boss.hp < boss.mhp * 0.6) {
        R.p2 = true;
        await G.Dialog.say('chenbo:serious', '（遠遠地，王船上）……引魂槳・渡！');
        G.Dialog.close();
        G.Audio.sfx('water'); sc.shakeT = 0.5;
        boss.wait += 60;
        sc.say('一道浪把海蛇推回了深水，牠的下一次行動被拖慢了！', 1.8);
        await sc.wait(0.8);
      }
      if (!R.p3 && boss.hp < boss.mhp * 0.25) {
        R.p3 = true;
        boss.st.defDown = 99;
        sc.say('牠身上的藤壺一片一片剝落了！（防禦下降）', 1.8);
        G.Audio.sfx('shatter');
        await sc.wait(0.8);
      }
    };
  }

  // 太魯閣石巨靈 — stone armour (−50%), wood breaks armour, fire melts salt (def −15% ×2), exposed chest ×1.3,
  // dam burst every 5 turns (self-damage when exposed), Watan's arrow at P2, frenzy at P3.
  function colossusRules(sc) {
    const boss = sc.enemies.find((e) => e.id === 'gorge_colossus');
    if (!boss) return;
    const R = { armor: 3, melt: 0, exposed: 0, n: 0, p2: false, p3: false };
    sc.c10 = R;
    boss.mhp = boss.hp = Math.round(boss.mhp * 0.85); // the stone armour halves early damage: a little less HP
    const ai = sc.aiCommand.bind(sc), exec = sc.execute.bind(sc), dmgFn = sc.damage.bind(sc), phases = sc.checkPhases.bind(sc), hud = sc.drawHud.bind(sc);
    sc.damage = (tg, dmg, o = {}) => {
      if (tg !== boss) return dmgFn(tg, dmg, o);
      const fromParty = !o.attacker || o.attacker.side === 'party';
      if (fromParty && dmg > 0) {
        if (R.armor > 0) dmg = Math.max(1, Math.round(dmg * 0.6));
        else if (R.exposed > 0 || R.p3) dmg = Math.round(dmg * 1.3);
      }
      dmgFn(tg, dmg, o);
      if (!fromParty || boss.dead) return;
      if (o.elem === 'wood' && R.armor > 0 && !R.p3) {
        R.armor--;
        sc.popText(boss, '石甲碎裂！', '#c8ff8a', -60);
        G.Audio.sfx('shatter');
        if (R.armor === 0) { R.exposed = 3; sc.say('石甲全碎了——胸口的空洞露出來了！', 1.8); }
      }
      if (o.elem === 'fire' && R.melt < 2) {
        R.melt++;
        boss.def = Math.round(boss.def * 0.85);
        sc.popText(boss, '鹽殼融化', '#ffb070', -90);
      }
    };
    sc.aiCommand = (e) => {
      if (e !== boss) return ai(e);
      R.n++;
      if (R.armor === 0 && !R.p3 && R.exposed > 0) {
        R.exposed--;
        if (R.exposed === 0) { R.armor = 2; sc.say('山又把它包起來了——石甲回復了兩層。', 1.8); }
      }
      let cmd;
      if (R.n % 5 === 0) cmd = { kind: 'skill', skill: 'c10_es_damburst', targets: sc.alive('party'), burst: true };
      else cmd = ai(e);
      if (R.p3) cmd.delay = 0.55;
      return cmd;
    };
    sc.execute = async (u, cmd) => {
      await exec(u, cmd);
      if (u === boss && cmd.burst && R.armor === 0 && !boss.dead) {
        sc.say('黑水反過來沖垮了它自己的身體！', 1.8);
        await sc.wait(0.4);
        dmgFn(boss, Math.round(boss.mhp * 0.05), { color: '#8ac8ff' });
        if (!boss.dead) { boss.st.stun = 1; sc.popText(boss, '定身！', '#ffd84a'); }
        await sc.wait(0.6);
      }
    };
    sc.checkPhases = async () => {
      await phases();
      if (boss.dead) return;
      if (!R.p2 && boss.hp < boss.mhp * 0.6) {
        R.p2 = true;
        await G.Dialog.say('石巨靈', '……過不去……過不去……');
        await G.Dialog.say('xinghe:serious', '過得去！我們幫你開路！');
        await G.Dialog.say('Watan', '（崖上，拉滿了弓）這一箭，是替山射的。');
        G.Dialog.close();
        G.Audio.sfx('stab'); sc.shakeT = 0.4;
        boss.def = Math.round(boss.def * 0.8);
        for (const p of sc.alive('party')) sc.addStatus(p, 'magDown', 2, true);
        sc.say('綁著麻線的箭正中胸口的裂縫！石巨靈的防禦下降了。（胸口的哀號讓全隊術法暫時減弱）', 2.4);
        await sc.wait(1);
      }
      if (!R.p3 && boss.hp < boss.mhp * 0.25) {
        R.p3 = true; R.armor = 0;
        sc.addStatus(boss, 'atkUp', 99, true);
        sc.say('石甲再也包不住了——可是它開始瘋狂地動了起來！', 1.8);
        await sc.wait(0.6);
      }
    };
    sc.drawHud = (ctx, t) => {
      hud(ctx, t);
      if (boss.dead) return;
      const x = G.W / 2 - 150, y = 16;
      hudPlate(ctx, x, y, 300, 40);
      G.Render.text(ctx, '石甲', x + 16, y + 9, { size: 19, color: '#e8dcc0' });
      for (let i = 0; i < 3; i++) {
        const on = i < R.armor;
        ctx.save(); ctx.fillStyle = on ? '#d8d4c8' : 'rgba(120,110,100,0.3)'; ctx.strokeStyle = on ? '#6a6458' : 'rgba(120,110,100,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x + 74 + i * 34, y + 9, 26, 22, 4); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      const tag = R.p3 ? '崩落' : R.armor === 0 ? `胸口暴露 ${R.exposed}` : `鹽殼 ${2 - R.melt}`;
      G.Render.text(ctx, tag, x + 186, y + 10, { size: 17, color: R.armor === 0 ? '#ffb070' : '#c9b893' });
    };
  }

  // 孤魂眾 — hunger gauge: +5 per turn, ≥70 enraged; offerings −20, 普渡咒 −35; must be ≤30 to disperse
  function guhunRules(sc) {
    const boss = sc.enemies.find((e) => e.id === 'c10_guhun_horde');
    if (!boss) return;
    const R = { hunger: 100, reform: 0, p2: false, mad: false };
    sc.c10 = R;
    const ai = sc.aiCommand.bind(sc), exec = sc.execute.bind(sc), kill = sc.kill.bind(sc), useItem = sc.useItem.bind(sc), perform = sc.performSkill.bind(sc), phases = sc.checkPhases.bind(sc), hud = sc.drawHud.bind(sc);
    const setMad = () => {
      const mad = R.hunger >= 70;
      if (mad && !R.mad) { boss.st.atkUp = 99; sc.popText(boss, '餓瘋了！', '#ff8a7a', -60); }
      if (!mad && R.mad) { delete boss.st.atkUp; sc.popText(boss, '安靜了一點', '#c8e8ff', -60); }
      R.mad = mad;
    };
    const feed = (n) => { R.hunger = U.clamp(R.hunger - n, 0, 100); sc.popText(boss, `饑 −${n}`, '#ffe08a', -30); setMad(); };
    setMad();
    sc.aiCommand = (e) => {
      if (e !== boss) return ai(e);
      R.hunger = Math.min(100, R.hunger + 5); setMad();
      const cmd = ai(e);
      if (cmd.skill === 'c10_es_snatch') cmd.snatch = true;
      return cmd;
    };
    sc.execute = async (u, cmd) => {
      if (u === boss && cmd.snatch && G.Inv.count('c10_pudu_offering') > 0) {
        G.Inv.remove('c10_pudu_offering', 1);
        sc.banner('搶供品', '#ff9a8a');
        sc.say('孤魂眾伸長了手，搶走了一份普渡供品！', 1.8);
        G.Audio.sfx('ghost');
        await sc.wait(1.0);
        return;
      }
      return exec(u, cmd);
    };
    sc.useItem = async (u, itemId, targets) => {
      await useItem(u, itemId, targets);
      if (itemId === 'c10_pudu_offering' && targets.some((x) => x === boss || x.id === 'hungry_ghost' || x.id === 'hungry_ghost_v1')) feed(20);
    };
    sc.performSkill = async (u, s, targets, id) => {
      await perform(u, s, targets, id);
      if (id === 'yg_pudu' && !boss.dead) feed(35);
    };
    sc.kill = (u) => {
      if (u === boss && R.hunger > 30 && R.reform < 2) {
        R.reform++;
        u.hp = Math.round(u.mhp * 0.3);
        u.flash = 1;
        sc.say('雲歸：「打不散的！它們是餓，不是恨——要餵！」', 2.4);
        G.Audio.sfx('ghost');
        return;
      }
      return kill(u);
    };
    sc.checkPhases = async () => {
      await phases();
      if (boss.dead || R.p2 || boss.hp >= boss.mhp * 0.5) return;
      R.p2 = true;
      await G.Dialog.say('孤魂眾', '……沒有人……叫我們的名字……');
      if (F('ch10_ayi_lantern_ready')) {
        await G.Dialog.say('阿義', '……有喔。有人寫了。');
        G.Dialog.close();
        sc.say('燈篙上「阿義」的燈籠亮了一下。溫暖的光落在大家身上。', 2);
        for (const p of sc.alive('party')) sc.addStatus(p, 'regen', 3);
        await sc.wait(0.8);
      }
      G.Dialog.close();
    };
    sc.drawHud = (ctx, t) => {
      hud(ctx, t);
      if (boss.dead) return;
      const x = G.W / 2 - 170, y = 16, w = 340;
      hudPlate(ctx, x, y, w, 44);
      G.Render.text(ctx, '饑', x + 16, y + 10, { size: 21, color: '#ffe0a0' });
      const k = R.hunger / 100;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 50, y + 16, 200, 12);
      ctx.fillStyle = R.hunger >= 70 ? '#e8584a' : R.hunger > 30 ? '#e8b04a' : '#7ad08a';
      ctx.fillRect(x + 50, y + 16, 200 * k, 12);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + 50 + 200 * 0.3 - 1, y + 12, 2, 20);
      ctx.restore();
      G.Render.text(ctx, String(R.hunger), x + 262, y + 11, { size: 19, color: '#f0e4c4' });
      G.Render.text(ctx, `餵 ${G.Inv.count('c10_pudu_offering')}`, x + 296, y + 11, { size: 17, color: '#c9b893' });
    };
  }
  H.serpentRules = serpentRules; H.colossusRules = colossusRules; H.guhunRules = guhunRules;

  // =================================================================================================
  // 搶孤 minigame (three stages built on G.Mini.mash / G.Mini.timing; no game over)
  // =================================================================================================
  const QG_NAMES = { xinghe: '星河', hongying: '紅纓', yungui: '雲歸', yuyuan: '芋圓' };
  //            力 底座  穩 中段  輕 攀頂  眼 看風
  const QG_STAT = { xinghe: [2, 3, 3, 2], hongying: [3, 2, 2, 1], yungui: [1, 2, 1, 3], yuyuan: [1, 3, 0, 2] };
  const QG_ROLES = ['底座', '中段', '攀頂', '看風'];
  async function qgRoles(S) {
    await S.say('阿坤', '五個人，一條心。底座要力氣大，中段要穩，攀頂要輕，看風要眼睛利。');
    await S.say('yungui:think', '紅纓在底下，星河爬上去，我看風。芋圓……芋圓在中間當墊子。');
    S.emote('yuyuan', '💢');
    await S.say('', '（芋圓面無表情地盯著雲歸。）');
    const c = await S.choice(['照雲歸說的排（紅纓底座・芋圓中段・星河攀頂・雲歸看風）', '自己排站位'], { cancel: 0 });
    if (c === 0) return ['hongying', 'yuyuan', 'xinghe', 'yungui'];
    const left = ['xinghe', 'hongying', 'yungui', 'yuyuan'];
    const out = [];
    for (let r = 0; r < 4; r++) {
      if (left.length === 1) { out.push(left[0]); break; }
      await S.say('阿坤', ['底座，誰來？', '中段，誰來？', '攀頂，誰來？', '看風，誰來？'][r]);
      const i = await S.choice(left.map((id) => QG_NAMES[id]));
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  }
  // returns { first, roles }
  async function qianggu(S, o = {}) {
    const roles = o.roles || await qgRoles(S);
    const [base, mid, top, eye] = roles.map((id, r) => QG_STAT[id][r]);
    const climber = roles[2];
    const k = G.settings.difficulty === 'easy' ? 0.8 : G.settings.difficulty === 'hard' ? 1.15 : 1;
    let adv = 0;
    const rivals = (m) => [{ name: '烏石港隊', rate: 4.6 * k * m }, { name: '打馬煙隊', rate: 4.0 * k * m }];
    // ---- 1 上孤柱
    if (!o.skipTo) {
      await S.say('阿坤', '牛油很滑！爬三下就要抹一次！');
      if (roles[0] === 'hongying') await S.say('hongying:serious', '上來吧。這次換我在下面撐住你們。');
      const r1 = await G.Mini.mash({ title: '第一段・上孤柱', hint: '連按 Z 往上爬！底座撐得越穩，起點越高', time: 12, need: Math.round(46 - 3 * base - 2 * mid), rivals: rivals(0.95) });
      if (r1) { adv++; S.sfx('levelup'); await S.say('阿坤', '好！到孤棚底了！接繩——！'); }
      else {
        adv--; S.shake(6, 0.4);
        await S.say('', '群眾：「喔——！」');
        await S.say('阿坤', '滑下來了！不要緊——我甩繩，抓住！');
        await S.say('', '阿坤把繩子甩上去，全隊一個拉一個，翻到了孤棚底。');
      }
      // ---- 2 翻棚
      await S.say('阿坤', '孤棚邊比柱子寬，要倒吊著翻上去！別往下看！');
      if (roles[3] === 'yungui') await S.say('yungui:serious', '左邊！縮！');
      else await S.say(roles[3] + ':serious', '小心——孤魂從旁邊撲過來了！');
      let hits = await G.Mini.timing({ title: '第二段・翻棚', hint: '指針擺到金色區域時按 Z，倒吊翻上孤棚邊！', rounds: 3, zone: 0.17 + 0.03 * top, speed: 1.35 - 0.06 * eye });
      if (hits < 2) {
        S.shake(5, 0.4);
        await S.say('阿坤', '不要急！等它擺到中間！');
        await S.say('', `${QG_NAMES[climber]}鬆手了——底下的隊友穩穩接住。`);
        await G.Mini.mash({ title: '重新爬上去', hint: '連按 Z！', time: 8, need: 16, rivals: [{ name: '烏石港隊', rate: 1.2 }] });
        hits = Math.max(hits, await G.Mini.timing({ title: '第二段・翻棚（再一次）', hint: '等它擺到中間再按 Z！', rounds: 3, zone: 0.2 + 0.03 * top, speed: 1.2 }));
      }
      adv += hits >= 2 ? 1 : -1;
    }
    // ---- 3 攀孤棧・搶順風旗
    await S.say('阿坤', '供品割下來丟給下面的人！大家接到，就會替你們喊！');
    let crowd = 0;
    for (const opt of ['割下粽子，丟給群眾！', '割下米糕，丟給群眾！', '割下魚乾，丟給群眾！', '割下餅，丟給群眾！']) {
      const c = await S.choice([opt, '繼續往上爬'], { cancel: 1 });
      if (c === 0) { crowd++; S.sfx('coin'); await S.say('', '群眾：「割啦！割啦！」'); }
    }
    const first = await G.Mini.mash({ title: '第三段・攀孤棧', hint: '連按 Z！群眾在替你們喊！', time: 12, need: Math.round(44 - 3 * crowd - 2 * Math.max(0, adv)), rivals: rivals(1 - 0.07 * adv + 0.03 * crowd) });
    return { first, roles, climber };
  }
  H.qianggu = qianggu;

  // =================================================================================================
  // voyage (deck → ports)
  // =================================================================================================
  const DECK = 'wangboat_deck_east';
  const PORTS = [
    { id: 'orchid', name: '蘭嶼', place: 'orchid', map: 'orchid_shore', x: 8, y: 18, dir: 'up', ok: () => true },
    { id: 'baosang', name: '寶桑（台東）', place: 'taitung', map: 'baosang', x: 33, y: 23, dir: 'left', ok: () => F('ch10_chuanyan') },
    { id: 'amis', name: '阿美部落海岸', place: 'taitung', map: 'amis_village', x: 34, y: 27, dir: 'up', ok: () => F('ch10_amis_met') },
    { id: 'huilan', name: '洄瀾（花蓮）', place: 'taroko', map: 'huilan', x: 22, y: 17, dir: 'up', ok: () => F('ch10_haiji_witnessed') },
    { id: 'qingshui', name: '清水斷崖下', place: 'taroko', map: 'qingshui_cliffs', x: 24, y: 34, dir: 'up', ok: () => F('ch10_truku_permission') },
    { id: 'toucheng', name: '頭城（烏石港）', place: 'toucheng', map: 'toucheng', x: 47, y: 9, dir: 'left', ok: () => F('ch10_rainbow_seen') },
  ];
  H.PORTS = PORTS;
  H.port = (id) => PORTS.find((p) => p.id === id);
  // land the party at a port (from the deck)
  H.land = async (S, id) => {
    const p = H.port(id);
    V().c10_port = id;
    await S.warp(p.map, p.x, p.y, p.dir);
  };
  H.toDeck = async (S, x = 6, y = 7) => { await S.warp(DECK, x, y, 'right'); };
  H.sail = async (S, id) => {
    const p = H.port(id);
    const from = V().c10_place || 'eluanbi';
    const leg = (V().c10_legs = (V().c10_legs || 0) + 1);
    if (p.place !== from) {
      const c = await S.choice(['沿途巡海（迎擊海上的潮病）', '不停留，直接航行'], { cancel: 1 });
      if (c === 0) {
        await S.say('chenbo:serious', '前面的浪不對勁。抓穩了！');
        const r = await S.battle(leg % 2 ? 't_c10_sea_a' : 't_c10_sea_b', { loseOk: true });
        if (r === 'lose') await S.say('chenbo:normal', '……先退開。海不會跑，下次再來。');
      }
      const label = { orchid: '乘著黑潮，往東南的綠色高島……', taitung: '沿著後山的海岸北上……', taroko: '海岸山脈直直落進海裡……', toucheng: '繞過蘇澳，北上宜蘭……' }[p.place];
      await S.travel(from, p.place, { label });
      V().c10_place = p.place;
    }
    await H.land(S, id);
  };
  H.voyageMenu = async (S) => {
    const ports = PORTS.filter((p) => p.ok());
    const opts = ports.map((p) => p.name).concat(['回西岸', '先不出航']);
    const i = await S.choice(opts, { cancel: opts.length - 1 });
    if (i === opts.length - 1) return;
    if (i === opts.length - 2) { await S.say('chenbo:serious', '黑潮只往北流。回頭，就趕不上了。'); return; }
    const p = ports[i];
    // C10-15 / C10-16 happen on the way north to 頭城
    if (p.id === 'toucheng' && !F('ch10_zhongyuan')) { await H.zhongyuan(S); return; }
    if (p.id === 'baosang' && !F('ch10_taitung_arrive')) await H.montage(S);
    await H.sail(S, p.id);
  };
  G.C10 = H; // exposed for tests / debugging

  // =================================================================================================
  // small runtime helpers for scenes
  // =================================================================================================
  H.addObj = (o) => {
    const ms = G.mapScene;
    const inst = Object.assign({ key: o.t + '@' + o.x + ',' + o.y + ':' + U.randi(0, 1e6) }, o);
    if (inst.v == null) inst.v = 0;
    ms.objects.push(inst);
    ms.computeSolid();
    return inst;
  };
  // decorative (non-interactive) monsters shown during a cutscene: [[x, y, art, variant, scale], ...]; [] clears them
  H.monsters = (list) => {
    const ms = G.mapScene;
    ms.objects = ms.objects.filter((o) => o.tag !== 'c10show');
    for (const [x, y, art, variant, scale] of list) ms.objects.push({ t: 'c10_monster_show', x, y, art, variant: variant || 0, scale, tag: 'c10show', key: 'show' + x + ',' + y, v: 0 });
    ms.computeSolid();
  };
  // followers' queued steps never resolve S.move's promise (map.js only resolves player/NPC arrivals):
  // move them without waiting and wait for the walk time instead
  H.fmove = async (S, id, path, o = {}) => {
    S.move(id, path, Object.assign({}, o, { wait: false }));
    await S.wait(path.replace(/\s/g, '').length / (o.speed || 4.2) + 0.12);
  };
  H.fwalk = async (S, id, x, y, o = {}) => {
    const a = S.actor(id);
    if (!a) return;
    const dx = x - a.x, dy = y - a.y;
    const h = (dx > 0 ? 'R' : 'L').repeat(Math.abs(dx)), v = (dy > 0 ? 'D' : 'U').repeat(Math.abs(dy));
    const path = o.yFirst ? v + h : h + v;
    if (path) await H.fmove(S, id, path, o);
  };
  H.removeObj = (tag) => { const ms = G.mapScene; ms.objects = ms.objects.filter((o) => o.tag !== tag); ms.computeSolid(); };
  H.hurtParty = (frac) => {
    for (const m of G.Party.active()) { const st = G.Party.stats(m.id); m.hp = Math.max(1, m.hp - Math.round(st.mhp * frac)); }
  };
  // instance patch: run fn(ms, dt) every frame on this map scene (installed from onEnter)
  H.patch = (key, tick, hud) => {
    const ms = G.mapScene;
    if (!ms || ms[key]) return;
    ms[key] = true;
    const up = ms.update.bind(ms);
    ms.update = (dt) => { up(dt); if (G.mapScene === ms) tick(ms, dt); };
    if (hud) { const dh = ms.drawHud.bind(ms); ms.drawHud = (ctx, t) => { dh(ctx, t); hud(ctx, ms, t); }; }
  };
  // floating driftwood crate used as a chest (the gorge / reef only hold things the sea brought)
  H.crate = (id, x, y, items, o = {}) => ({
    t: 'crate', x, y, v: 1, label: '打開', tag: id,
    if: (st) => !st.flags['c10_crate_' + id],
    interact: async (S) => {
      S.flag('c10_crate_' + id);
      S.sfx('chest');
      if (o.line) await S.say(o.who || '', o.line);
      for (const [it, n] of items) { if (it === 'gold') S.gold(n); else await S.give(it, n); }
    },
  });

  // =================================================================================================
  // MAP: wangboat_deck_east 王船甲板
  // =================================================================================================
  (function deck() {
    const g = new Grid(28, 13, 'w');
    g.rect(0, 2, 28, 9, '~');
    g.rect(4, 4, 18, 5, 'd');
    g.rect(3, 5, 1, 3, 'd');
    g.rect(22, 5, 1, 3, 'd'); g.set(23, 6, 'd');
    const objs = [
      { t: 'crate', x: 5, y: 4 }, { t: 'jar', x: 6, y: 4 }, { t: 'barrel', x: 7, y: 4 }, { t: 'jar', x: 4, y: 8, v: 1 }, { t: 'crate', x: 5, y: 8, v: 2 },
      { t: 'basket', x: 8, y: 4 },
      { t: 'banner', x: 12, y: 4, text: '代天巡狩', color: '#c8302a' },
      { t: 'banner', x: 13, y: 4, text: '順風', color: '#f0c040', if: () => F('ch10_shunfeng_flag') },
      { t: 'stairs_down', x: 10, y: 7 },
      { t: 'altar', x: 19, y: 4, light: { r: 90, color: '#ffcf7a', flicker: 0.3 } },
      { t: 'herbs_rack', x: 18, y: 4, if: () => F('ch10_start') },
      { t: 'herbs_rack', x: 21, y: 4, if: () => F('ch10_start') },
      { t: 'signboard', x: 22, y: 5, text: '船眼', if: () => F('ch10_chuanyan'), light: { r: 70, color: '#ffe0a0', flicker: 0.15 } },
      { t: 'brazier', x: 23, y: 6, light: { r: 260, color: '#ffd98a', flicker: 0.25 } },
      { t: 'red_lantern', x: 9, y: 8, hang: true }, { t: 'red_lantern', x: 16, y: 8, hang: true }, { t: 'red_lantern', x: 16, y: 4, hang: true },
      { t: 'boat_small', x: 5, y: 9 },
      { t: 'water_lantern', x: 9, y: 10, text: '清虛', if: () => !!V().c10_wl },
      { t: 'water_lantern', x: 13, y: 11, text: '洛青鋒', if: () => !!V().c10_wl },
      { t: 'water_lantern', x: 17, y: 10, text: '念兒', if: () => !!V().c10_wl },
      { t: 'water_lantern', x: 21, y: 11, text: '等我', if: () => !!V().c10_wl },
    ];
    G.Maps.define(DECK, {
      name: '王船甲板', subtitle: '黑潮之上',
      bgm: (st) => (st.vars.c10_deck === 'night' ? 'sad' : 'voyage'),
      start: [8, 6],
      light: (st) => {
        const m = st.vars.c10_deck;
        if (m === 'night') return { ambient: 0.62, color: '#060a22', playerR: 200 };
        if (m === 'dawn') return { ambient: 0.22, color: '#3a1a14', tint: 'rgba(255,160,90,0.16)' };
        if (m === 'dusk') return { ambient: 0.2, color: '#2a1424', tint: 'rgba(255,170,90,0.2)' };
        return { ambient: 0 };
      },
      particles: (st) => (st.vars.c10_deck === 'night' ? ['wind', 'lanterns'] : st.vars.c10_deck === 'dawn' ? ['mist', 'wind'] : ['wind']),
      tiles: g.rows(),
      objects: objs,
      drawGround: (ctx) => deckRim(ctx),
      drawOver: (ctx, t) => H.drawLights(ctx, t),
      npcs: [
        { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', name: '陳伯', x: 4, y: 6, dir: 'right', fixedDir: true, talk: (S) => H.chenboDeck(S) },
      ],
      events: [
        { id: 'c10_01', trigger: 'auto', if: (st) => !st.flags.ch10_start, run: (S) => H.c10_01(S) },
        { id: 'c10_20', trigger: 'auto', if: (st) => st.flags.ch10_shunfeng_flag && !st.flags.ch10_end, run: (S) => H.c10_20(S) },
        { id: 'rest', trigger: 'action', x: 10, y: 7, label: '休息', run: async (S) => {
          await S.say('', '艙口下面是船艙。可以在這裡好好睡一覺。');
          const c = await S.choice(['休息（免費）', '不用了'], { cancel: 1 });
          if (c !== 0) return;
          await S.fadeOut(0.6); S.healParty(); await S.wait(0.8); await S.fadeIn(0.6);
          S.toast('在船艙裡睡了一覺，全員完全恢復。', 'lantern');
        } },
        { id: 'shrine', trigger: 'action', x: 19, y: 4, w: 2, label: '參拜', run: async (S) => {
          await S.say('', '船頭的神位，插著千歲爺的令旗。沒有神像，只有一爐香。');
          const c = await S.choice(['參拜後記錄旅程', '離開'], { cancel: 1 });
          if (c === 0) await S.saveMenu();
        } },
        { id: 'boat', trigger: 'action', x: 5, y: 9, w: 2, label: '舢舨', run: async (S) => {
          const p = V().c10_port && H.port(V().c10_port);
          if (!p) { await S.say('chenbo:normal', '還在海上。要靠岸，跟我說「出航」。'); return; }
          const c = await S.choice([`乘舢舨上岸（${p.name}）`, '留在船上'], { cancel: 1 });
          if (c === 0) await H.land(S, p.id);
        } },
        { id: 'eye', trigger: 'action', x: 22, y: 5, label: '調查', if: (st) => st.flags.ch10_chuanyan, run: async (S) => {
          await S.say('', '龍目下方，掛著達悟人給的船眼護符。木片上的同心圓，中間塗著紅。');
          await S.say('xinghe:normal', '（看不到路的時候，它幫你看。）');
        } },
        { id: 'lamp', trigger: 'action', x: 23, y: 6, label: '調查', run: async (S) => {
          await S.say('', '船頭燈。鵝鑾鼻燈塔的火，在黑潮的風裡穩穩地燒著。');
        } },
      ],
    });
  })();

  // painted hull side + red lacquered gunwale around the deck (world coords)
  function deckRim(ctx) {
    const c = cached('deckrim', 26 * T, 8 * T, (g) => {
      const P = [[3, 5], [4, 5], [4, 4], [22, 4], [22, 5], [23, 5], [23, 6], [24, 6], [24, 7], [23, 7], [23, 8], [22, 8], [22, 9], [4, 9], [4, 8], [3, 8]];
      const pts = P.map(([x, y]) => [(x - 2) * T, (y - 3) * T]);
      // hull side below the bottom edge
      const hy = (9 - 3) * T;
      const hg = g.createLinearGradient(0, hy, 0, hy + 46);
      hg.addColorStop(0, '#2f7a52'); hg.addColorStop(0.35, '#2f7a52'); hg.addColorStop(0.36, '#c8302a'); hg.addColorStop(0.7, '#c8302a'); hg.addColorStop(0.71, '#1e1a1c'); hg.addColorStop(1, '#141214');
      g.fillStyle = hg;
      g.beginPath(); g.moveTo(2 * T, hy - 2); g.lineTo(20 * T, hy - 2); g.lineTo(21.4 * T, hy - 2 - T); g.lineTo(21.6 * T, hy + 20 - T); g.lineTo(20.2 * T, hy + 40); g.lineTo(2.2 * T, hy + 40); g.lineTo(1.4 * T, hy + 10); g.closePath(); g.fill();
      g.strokeStyle = '#e8c060'; g.lineWidth = 2; g.beginPath(); g.moveTo(2 * T, hy + 15); g.lineTo(20 * T, hy + 15); g.stroke();
      for (let x = 2.3 * T; x < 20 * T; x += 40) { g.strokeStyle = 'rgba(240,220,160,0.75)'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, hy + 24, 6, Math.PI, 0); g.stroke(); }
      // 龍目 at the bow
      const ex = 20.6 * T, ey = hy - 18;
      g.fillStyle = '#f4efe2'; g.beginPath(); g.ellipse(ex, ey, 14, 9, -0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a1a10'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#c8302a'; g.beginPath(); g.arc(ex - 2, ey, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#141214'; g.beginPath(); g.arc(ex - 2, ey, 2.4, 0, Math.PI * 2); g.fill();
      // gunwale
      g.strokeStyle = '#5a1810'; g.lineWidth = 9; g.lineJoin = 'round';
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      g.strokeStyle = '#c8402e'; g.lineWidth = 5;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      g.strokeStyle = 'rgba(255,220,170,0.45)'; g.lineWidth = 1.2;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y - 2) : g.moveTo(x, y - 2))); g.closePath(); g.stroke();
      for (const [x, y] of pts) { g.fillStyle = '#e8c060'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
    });
    ctx.drawImage(c, 2 * T, 3 * T, c.lw, c.lh);
  }

  H.chenboDeck = async (S) => {
    const opts = ['出航', '聊天'];
    const ayiNeed = F('ch10_ayi_met') && !S.hasItem('c10_ayi_lantern') && !F('ch10_ayi_lantern_ready') && !F('ch10_pudu_defended');
    if (ayiNeed) opts.push('請陳伯做燈籠');
    opts.push('沒事');
    const i = await S.choice(opts, { cancel: opts.length - 1 });
    const k = opts[i];
    if (k === '出航') {
      if (F('ch10_qianggu_team') && !F('ch10_shunfeng_flag')) { await S.say('chenbo:serious', '搶孤還沒搶，走什麼走。順風旗要緊。'); return; }
      await S.say('chenbo:normal', '要去哪？');
      await H.voyageMenu(S);
    } else if (k === '聊天') {
      if (F('ch10_rainbow_seen')) await S.say('chenbo:normal', '……橋是走出來的。那個老奶奶，說得比我們引魂人還好。');
      else if (F('ch10_haiji_witnessed')) await S.say('chenbo:smile', '阿美族的小米酒，雲歸喝了一口就安靜了。難得。');
      else if (F('ch10_chuanyan')) await S.say('chenbo:normal', '船眼掛上去以後，這船好像比較認得路了。……別跟千歲爺說我這樣講。');
      else await S.say('chenbo:normal', '黑潮是活人吃的飯。跟著它走，就不會迷路。');
    } else if (k === '請陳伯做燈籠') {
      await S.say('chenbo:normal', '燈籠？……哼，總算問了一件我的本行。');
      await S.say('chenbo:normal', '紙我有，竹篾有。名字你自己寫。九份陳記的學徒，字別寫歪。');
      await S.fadeOut(0.4);
      await S.say('', '（星河用毛筆，在燈籠上一筆一筆寫下「阿義」兩個字。）');
      await S.fadeIn(0.4);
      await S.give('c10_ayi_lantern', 1);
      S.quest('q_c10_luohanjiao', 1);
    }
  };

  // ---------------------------------------------------------------- C10-01 端午・黑潮上
  H.c10_01 = async (S) => {
    S.flag('ch10_start');
    H.days(85);
    V().c10_place = V().c10_place || 'eluanbi';
    V().xunjing = Math.max(V().xunjing || 0, 2);
    S.quest('q_c10_main', 0);
    S.bgm('voyage');
    await S.fadeOut(0.01);
    H.place(S, 12, 6, 'right');
    S.setPos('hongying', 13, 7, 'up'); S.setPos('yungui', 17, 5, 'right'); S.setPos('yuyuan', 11, 7, 'right');
    S.hideFollowers(false);
    await S.narrate(['五月初五，端午。', '王船乘著黑潮，在南岬東邊的海上。'], { veil: 0.85 });
    await S.fadeIn(0.8);
    await H.fmove(S, 'yungui', 'R', { speed: 2.5 });
    S.face('yungui', 'up');
    await S.wait(0.4);
    S.sfx('push');
    H.addObj({ t: 'herbs_rack', x: 18, y: 4 });
    await H.fmove(S, 'yungui', 'RRR');
    S.face('yungui', 'up');
    await S.wait(0.3);
    H.addObj({ t: 'herbs_rack', x: 21, y: 4 });
    S.sfx('push');
    S.face('yungui', 'left');
    await S.say('yungui:normal', '端午，門口要掛艾草、菖蒲。船也是家。');
    await S.say('xinghe:think', '那王船的門在哪？');
    await S.say('yungui:think', '……船頭吧。');
    S.emote('yuyuan', '…');
    await S.say('', '（芋圓一屁股坐在艙口前面，看著大家。意思很清楚：門在廚房。）');
    S.setPos('chenbo', 10, 7, 'right');
    await S.move('chenbo', 'U');
    S.face('chenbo', 'right');
    S.emote('chenbo', '♪');
    await S.say('', '（陳伯從艙口探出頭來，手上拿著一顆蛋。）');
    await S.move('chenbo', 'R');
    await S.say('chenbo:normal', '午時到了。來，立蛋。');
    await S.say('hongying:surprise', '立蛋？');
    await S.say('chenbo:normal', '端午正午，蛋立得起來，這一年就順。九份的囝仔每年都玩。');
    const c = await S.choice(['我來！', '讓紅纓先。']);
    if (c === 0) {
      S.face('player', 'down');
      await S.say('', '（星河小心翼翼地把蛋立在甲板上——船一晃，蛋滾走了。一路滾到芋圓嘴邊。）');
      S.emote('yuyuan', '♥');
      await S.jump('yuyuan');
      await S.say('', '（芋圓一口吞掉。）');
      await S.say('xinghe:cry', '我的運氣！！');
      await S.say('', '（芋圓嚼了兩下，面無表情地看著星河。好像在說：運氣在我肚子裡，很安全。）');
      await S.say('yungui:smug', '從宇宙的角度來看，運氣只是換了一個容器。'); 
    } else {
      S.face('hongying', 'down');
      await S.say('', '（紅纓屏氣凝神。蛋穩穩地立在甲板上。船一晃——蛋還是立著。）');
      await S.say('hongying:smug', '哼。');
      await S.say('yungui:surprise', '……她連蛋都能鎮住。');
      S.emote('yuyuan', '!');
      await H.fmove(S, 'yuyuan', 'R', { speed: 6 });
      S.sfx('guard');
      await H.fmove(S, 'yuyuan', 'L', { speed: 6 });
      await S.say('', '（芋圓撲過去——紅纓一腳把芋圓擋開。）');
    }
    S.flag('ch10_egg');
    S.face('hongying', 'right'); S.face('player', 'left');
    await S.say('hongying:shy', '那個……我也有準備端午的東西。');
    await S.say('', '（紅纓端出一盤黑色的、還在冒煙的三角形物體。）');
    await S.say('xinghe:surprise', '……這是？');
    await S.say('hongying:normal', '粽子。');
    await S.say('yungui:think', '粽子要用水煮。這個……是烤的？');
    await S.say('hongying:shy', '用炭火比較快。');
    S.emote('yuyuan', '…');
    await S.say('', '（芋圓湊過去聞了聞，默默往後退了一步。）');
    S.emote('chenbo', '…');
    await S.say('', '（陳伯默默拿了一個，剝開，咬了一口。大家屏息。）');
    await S.say('chenbo:normal', '……有洛家的味道。');
    await S.say('hongying:angry', '什麼意思！');
    await S.say('chenbo:smile', '妳哥小時候，也吃過妳娘煮焦的東西。他說，焦的才是家裡的。');
    await S.say('hongying:surprise', '……');
    await S.say('', '（紅纓低頭，自己也拿了一個咬下去。）');
    await S.say('hongying:sad', '……好苦。');
    await S.say('hongying:smile', '……可是，嗯。是家裡的。');
    S.sfx('splash');
    await S.camera(14, 10, 0.8);
    S.particles(['wind', 'sparkles']);
    await S.say('', '（一群飛魚躍出海面，從船邊滑過。陽光在牠們的鰭上閃。）');
    S.cameraFollow();
    S.emote('yuyuan', '!');
    await S.say('', '（芋圓趴到船舷邊，尾巴一甩一甩，死盯著飛魚。）');
    await S.say('chenbo:normal', '別抓。這片海的飛魚有主人的。');
    await S.say('chenbo:normal', '黑潮從很南邊的海流上來，經過蘭嶼，一路沿著後山往北。');
    await S.say('chenbo:normal', '飛魚跟著黑潮來。蘭嶼的人等了一整年，就等這個季節。');
    await S.say('xinghe:normal', '陳伯，你們引魂人怎麼看黑潮？');
    await S.say('chenbo:think', '老師父說：黑水溝是死人走的路，黑潮是活人吃的飯。');
    await S.say('chenbo:normal', '一條把東西帶走，一條把東西送來。');
    await S.say('xinghe:think', '……那彼岸燈呢？是帶走，還是送來？');
    await S.say('chenbo:serious', '……都是。所以才難。');
    S.particles(['wind']);
    await S.camera(25, 6, 1.0);
    await S.say('', '（遠方，一座綠色的高島從海平面上浮出來。島邊有一艘艘小船，船首高高翹起。）');
    await S.say('chenbo:normal', '蘭嶼。');
    S.shake(3, 1.2); S.sfx('water');
    await S.camera(14, 10, 0.8);
    await S.say('', '（海面下，一道長長的黑影從王船底下游過，往島的方向去。）');
    S.cameraFollow();
    await S.say('yungui:serious', '……有東西。跟鵝鑾鼻那條鰻王一樣的味道。');
    S.setPos('chenbo', 4, 6, 'right');
    S.gather();
    H.objective(S, '前往蘭嶼（與舵旁的陳伯說話）');
  };

  // ---------------------------------------------------------------- C10-07 航行蒙太奇（往寶桑）
  H.montage = async (S) => {
    S.bgm('voyage');
    await S.fadeOut(0.6);
    await S.narrate(['五月、六月。王船沿著後山的海岸北上。'], { veil: 1 });
    await S.narrate(['小漁港外，隊伍和漁民一起，把溺魂趕回海裡。'], { veil: 1 });
    await S.narrate(['深夜，雲歸嚼著一朵發光的蕈「做研究」，對著兩隻貓講了一整晚的宇宙。芋圓和麻糬趴在他腳邊睡著了。'], { veil: 1 });
    await S.narrate(['船尾，紅纓一遍一遍地練洛家劍譜上的招式。槍尖不再發抖。'], { veil: 1 });
    await S.narrate(['船頭，星河看著船眼護符，和船頭燈。'], { veil: 1 });
    await S.narrate(['每到一處，船頭燈就更亮一點。'], { veil: 1 });
    H.days(50);
    await S.fadeIn(0.4);
  };

  // =================================================================================================
  // MAP: orchid_shore 蘭嶼・灘頭
  // =================================================================================================
  const ORC = { W: 44, H: 32, LINE_Y: 8, LINE_X0: 8, LINE_X1: 36 };
  (function orchidShore() {
    const { W, H: HH } = ORC;
    const g = new Grid(W, HH, 's');
    g.rect(0, 0, W, 8, '.');
    g.blob(14, 3, 5, 2, ',', 3); g.blob(30, 5, 6, 2, ',', 5);
    g.line([[22, 0], [22, 7]], ':');
    g.rect(0, 8, W, 1, ':');
    // volcanic slopes framing the beach
    g.rect(0, 0, 6, 10, 'X'); g.rect(38, 0, 6, 10, 'X'); g.rect(6, 0, 2, 9, 'X'); g.rect(37, 0, 1, 9, 'X');
    g.band(0, W - 1, (x) => 19 + Math.sin(x * 0.35) * 0.9 + (x > 30 ? 1 : 0), () => 22, '-');
    g.band(0, W - 1, (x) => 22 + Math.sin(x * 0.3 + 1) * 0.7, () => 27, '~');
    g.rect(0, 27, W, 5, 'w');
    // east reef rocks & coral path to the reef flat (low tide)
    g.rect(37, 10, 7, 12, '~'); g.blob(39, 13, 3, 2, 'y', 7); g.rect(36, 15, 8, 2, 'y'); g.rect(36, 14, 1, 4, 's');
    const objs = [
      { t: 'tao_house', x: 9, y: 2 }, { t: 'tao_house', x: 15, y: 4 }, { t: 'granary', x: 20, y: 2 }, { t: 'tao_house', x: 25, y: 1 }, { t: 'tao_house', x: 31, y: 4 },
      { t: 'tree_banana', x: 13, y: 1 }, { t: 'tree_fern', x: 24, y: 5 }, { t: 'bush', x: 19, y: 6 }, { t: 'tree_banana', x: 35, y: 2 }, { t: 'pandanus', x: 30, y: 1 },
      { t: 'coconut_palm', x: 8, y: 7 }, { t: 'pandanus', x: 36, y: 7 }, { t: 'bush', x: 28, y: 7 }, { t: 'tree_fern', x: 12, y: 6 },
      { t: 'c10_fish_rack', x: 2, y: 10, interact: (S) => H.rackLine(S) }, { t: 'c10_fish_rack', x: 5, y: 10, interact: (S) => H.rackLine(S) }, { t: 'c10_fish_rack', x: 8, y: 10, interact: (S) => H.rackLine(S) },
      { t: 'firepit', x: 9, y: 13 },
      { t: 'tatala', x: 3, y: 15 }, { t: 'tatala', x: 6, y: 15 }, { t: 'tatala', x: 9, y: 15 }, { t: 'tatala', x: 17, y: 14 }, { t: 'tatala', x: 20, y: 14 },
      { t: 'tatala', x: 13, y: 15, if: () => !F('ch10_chuanyan') || V().c10_orchid_time === 'dusk' },
      { t: 'driftwood', x: 15, y: 16, if: () => !F('ch10_serpent_defeated') },
      { t: 'rock_big', x: 33, y: 10 }, { t: 'rock_small', x: 35, y: 12 }, { t: 'rock_big', x: 34, y: 18 }, { t: 'rock_basalt', x: 31, y: 17 }, { t: 'rock_small', x: 28, y: 11 },
      { t: 'rock_big', x: 40, y: 18 }, { t: 'rock_big', x: 38, y: 10 }, { t: 'rock_basalt', x: 42, y: 13 }, { t: 'rock_small', x: 37, y: 17 },
      { t: 'boat_small', x: 7, y: 20 },
      { t: 'wang_boat', x: 16, y: 24, water: true },
      { t: 'driftwood', x: 24, y: 17 }, { t: 'seaweed', x: 26, y: 19 }, { t: 'seaweed', x: 12, y: 20 },
    ];
    for (let x = ORC.LINE_X0; x <= ORC.LINE_X1; x += 2) objs.push({ t: 'rock_small', x, y: ORC.LINE_Y, interact: ['低矮的界石，一顆一顆排成一線。', '界石以北，是達悟人的家。'] });
    const isNight = (st) => st.vars.c10_orchid_time === 'night';
    G.Maps.define('orchid_shore', {
      name: '蘭嶼・灘頭', subtitle: '黑潮送來飛魚的島', place: 'orchid',
      bgm: (st) => (isNight(st) ? 'night' : 'orchid'),
      start: [8, 18],
      light: (st) => {
        const m = st.vars.c10_orchid_time;
        if (m === 'night') return { ambient: 0.58, color: '#071030', playerR: 210 };
        if (m === 'morning') return { ambient: 0.08, color: '#202840' };
        if (m === 'dusk') return { ambient: 0.24, color: '#2a1424', tint: 'rgba(255,170,80,0.22)' };
        return { ambient: 0 };
      },
      particles: (st) => (isNight(st) ? ['wind', 'fireflies'] : ['wind']),
      tiles: g.rows(),
      objects: objs,
      pass: [{ x: 6, y: 7, w: 32, h: 1, solid: true }],
      lights: (st) => (isNight(st) ? [{ x: 9, y: 13, r: 240, color: '#ffae5a', flicker: 0.4 }] : []),
      drawOver: (ctx, t) => H.drawLights(ctx, t),
      npcs: [
        { id: 'tao_syapen', sprite: 'c10_tao_elder', name: 'Syapen', x: 12, y: 10, dir: 'down', talk: (S) => H.syapenTalk(S),
          if: () => V().c10_orchid_time !== 'night' },
        { id: 'tao_sinan', sprite: 'tao_f', name: 'Sinan', x: 8, y: 13, dir: 'right', talk: (S) => H.sinanTalk(S), if: () => V().c10_orchid_time !== 'night' },
        { id: 'tao_syaman', sprite: 'tao_m', name: 'Syaman', x: 14, y: 17, dir: 'up', talk: (S) => H.syamanTalk(S),
          if: () => V().c10_orchid_time !== 'night' && (!F('ch10_reef_open') || F('ch10_reef_done')) },
        { id: 'tao_kaswal', sprite: 'c10_tao_child', name: 'Kaswal', x: 11, y: 12, dir: 'down', wander: 1, talk: (S) => H.kaswalTalk(S),
          if: () => V().c10_orchid_time !== 'night' && (!F('ch10_orchid_rules') || F('ch10_reef_done')) },
        { id: 'tao_neighbor', sprite: 'tao_m', name: '鄰家男子', x: 24, y: 10, dir: 'down', talk: (S) => H.neighborTalk(S), if: () => V().c10_orchid_time !== 'night' },
      ],
      warps: [
        { x: 43, y: 15, h: 2, to: 'orchid_reef', tx: 17, ty: 1, tdir: 'down',
          run: async (S) => {
            if (F('ch10_reef_open')) return true;
            S.face('player', 'left');
            if (F('ch10_orchid_arrive')) await S.say('Syaman', '那邊是礁盤。潮水會漲，不要過去。');
            else await S.say('', '礁岩一路往南延伸，浪打得很急。');
            await S.move('player', 'L');
            return false;
          } },
      ],
      events: [
        { id: 'c10_02', trigger: 'auto', if: (st) => !st.flags.ch10_orchid_arrive, run: (S) => H.c10_02(S) },
        { id: 'c10_05', trigger: 'auto', if: (st) => st.vars.c10_orchid_time === 'night' && !st.flags.ch10_serpent_defeated, run: (S) => H.c10_05(S) },
        { id: 'c10_06', trigger: 'auto', if: (st) => st.flags.ch10_serpent_defeated && !st.flags.ch10_chuanyan, run: (S) => H.c10_06(S) },
        { id: 'line', trigger: 'touch', x: ORC.LINE_X0, y: ORC.LINE_Y, w: ORC.LINE_X1 - ORC.LINE_X0 + 1, h: 1, run: (S) => H.boundary(S) },
        { id: 'boat', trigger: 'action', x: 7, y: 20, w: 2, label: '舢舨', run: async (S) => {
          if (V().c10_orchid_time === 'night') return;
          const c = await S.choice(['划舢舨回王船', '留在灘頭'], { cancel: 1 });
          if (c === 0) await H.toDeck(S);
        } },
        { id: 'broken', trigger: 'action', x: 13, y: 15, w: 2, label: '調查', if: (st) => !st.flags.ch10_chuanyan, run: async (S) => {
          await S.say('', '一艘裂開的拼板舟。船板被撞出一道長長的縫，船首斷了一截。');
          await S.say('', '這是 Syaman 家的船。不要碰。');
        } },
      ],
    });
  })();

  H.rackLine = async (S) => {
    await S.say('', '飛魚一串一串掛著，鹹鹹的海風味。');
    await S.say('', '規矩第一條：曬架不能亂碰。');
  };

  // ---------------------------------------------------------------- 界石 (§5.1)
  H.boundary = async (S) => {
    const ms = G.mapScene;
    const px = ms.player.x;
    if (V().c10_orchid_time === 'night') { await S.move('player', 'D'); return; }
    if (!F('ch10_orchid_arrive')) { await S.move('player', 'D'); return; }
    const tries = (V().ch10_line_tries = (V().ch10_line_tries || 0) + 1);
    const nb = ms.actor('tao_neighbor');
    const home = nb ? [nb.x, nb.y] : null;
    if (nb) { S.setPos('tao_neighbor', px, ORC.LINE_Y - 1, 'down'); }
    S.emote('tao_neighbor', '!');
    await S.say('鄰家男子', '請留在海邊。');
    S.face('player', 'down');
    await S.move('player', 'D', { ghost: true });
    S.face('player', 'up');
    if (tries >= 2) H.trust(-1);
    if (tries === 2) await S.say('Syapen', '（遠遠地）……我說過的話，你們聽不懂？');
    else if (tries >= 3) await S.say('hongying:angry', '星河！你在幹嘛！');
    if (nb && home) S.setPos('tao_neighbor', home[0], home[1], 'down');
  };

  // ---------------------------------------------------------------- NPC talks
  H.syapenTalk = async (S) => {
    if (F('ch10_reef_done') && !F('ch10_serpent_defeated')) {
      await S.say('Syapen', '天黑以後，那東西會再來。今天晚上，你們守海邊。我們守家。');
      const c = await S.choice(['準備好了', '再等一下'], { cancel: 1 });
      if (c !== 0) return;
      await S.say('Syapen', '……去吧。');
      await S.fadeOut(1.0);
      V().c10_orchid_time = 'night';
      await S.warp('orchid_shore', 12, 16, 'down', { reload: true, fade: 0.01 });
      return;
    }
    const lines = F('ch10_chuanyan')
      ? ['你們要去的地方很遠。船眼會幫你們看。', '不要一直看我的臉。我知道我很好看。']
      : ['黑潮來的時候，飛魚就來。黑潮是好的海。你們西邊那條，不是。', '你們漢人什麼都拜。我們不一樣。我們分得很清楚：好的、不好的。', '不要一直看我的臉。我知道我很好看。'];
    const i = (V().c10_syapen_i = ((V().c10_syapen_i || 0) + 1)) % lines.length;
    await S.say('Syapen', lines[i]);
  };
  H.sinanTalk = async (S) => {
    if (F('ch10_orchid_arrive') && !F('ch10_orchid_rules')) { await H.c10_03(S); return; }
    if (F('ch10_orchid_rules')) {
      const lines = ['你們沒有亂碰曬架。很好。上一個來的漢人船員，我差點把他丟回海裡。', '我們吃的魚分得很細。有的只有男人吃，有的老人吃，女人吃的最好吃。'];
      await S.say('Sinan', lines[(V().c10_sinan_i = ((V().c10_sinan_i || 0) + 1)) % 2]);
      return;
    }
    await S.say('Sinan', '我們吃的魚分得很細。有的只有男人吃，有的老人吃，女人吃的最好吃。');
  };
  H.syamanTalk = async (S) => {
    if (F('ch10_chuanyan')) { await S.say('Syaman', '……木頭遞得不錯。你，紅頭髮的——不對，紅衣服的。手很穩。'); return; }
    const lines = ['船是我們自己造的。一塊一塊木頭，都是我挑的。外人不用碰。', '你們看那個船眼？那不是裝飾。船要看得到路，也要讓不好的東西知道有人在看。'];
    await S.say('Syaman', lines[(V().c10_syaman_i = ((V().c10_syaman_i || 0) + 1)) % 2]);
  };
  H.kaswalTalk = async (S) => {
    if (F('ch10_chuanyan')) { await S.say('Kaswal', '我長大要造自己的船。船眼要畫得比爸爸的更大。'); return; }
    await S.say('Kaswal', '那隻胖胖的灰色的是什麼？山豬的小孩？');
    await S.say('yungui:smug', '是貓。很重的貓。');
    await S.say('Kaswal', '貓是什麼？可以吃嗎？');
    S.emote('yuyuan', '💢');
    await S.say('', '（芋圓緩緩轉過頭，用「你再說一次」的眼神看著 Kaswal。Kaswal 笑得在沙上打滾。）');
  };
  H.neighborTalk = async (S) => {
    if (F('ch10_chuanyan')) await S.say('鄰家男子', 'Syapen 說你們守了規矩。……海邊，你們想走哪就走哪吧。');
    else await S.say('鄰家男子', '請留在海邊。');
  };

  // ---------------------------------------------------------------- C10-02 留在海邊的約定
  H.c10_02 = async (S) => {
    S.bgm('orchid');
    V().c10_place = 'orchid'; V().c10_port = 'orchid';
    S.quest('q_c10_main', 0);
    // the men standing beside their boats, watching
    const men = [[4, 14], [7, 14], [10, 14], [18, 13], [21, 13], [16, 12]];
    men.forEach(([x, y], i) => S.spawn({ id: 'c10_man' + i, sprite: 'tao_m', x, y, dir: 'down' }));
    S.remove('tao_syaman'); S.remove('tao_syapen'); S.remove('tao_kaswal');
    S.spawn({ id: 'syaman', sprite: 'tao_m', x: 12, y: 14, dir: 'down' });
    S.spawn({ id: 'syapen', sprite: 'c10_tao_elder', x: 6, y: 11, dir: 'down' });
    H.place(S, 8, 21, 'up');
    S.hideFollowers(true);
    await S.camera(16, 22, 0.01);
    await S.say('', '（王船在離岸很遠的地方下錨。陳伯放下舢舨。）');
    await S.say('chenbo:normal', '我留在船上。王船不能靠岸——你們看灘上。');
    await S.camera(12, 14, 1.0);
    await S.say('', '（灘上，十幾個男人站在拼板舟旁，靜靜望著王船。沒有人揮手。）');
    await S.say('chenbo:normal', '上岸的事，你們去。記住：這裡是人家的家。');
    S.cameraFollow();
    S.sfx('splash');
    await S.move('player', 'UUU');
    S.hideFollowers(false); S.gather();
    S.setPos('hongying', 7, 18, 'up'); S.setPos('yungui', 9, 18, 'up'); S.setPos('yuyuan', 8, 19, 'up');
    await S.say('', '（舢舨靠岸。隊伍踏上灘頭。一個右臂綁著布的男人走到水邊，擋在他們面前。）');
    await S.walkTo('syaman', 8, 16, { yFirst: true });
    S.face('syaman', 'down');
    await S.say('Syaman', '停在那裡。');
    await S.say('Syaman', '那艘大船，掛著別人的神的旗子。船上有不好的東西的味道。');
    await S.say('yungui:think', '（小聲）……他說得沒錯。艙底還關著一船瘟鬼。');
    await S.say('xinghe:normal', '我們不是來找麻煩的。我們只是——');
    await S.walkTo('syapen', 9, 15, { yFirst: true });
    S.face('syapen', 'down');
    await S.say('', '（一位老婦人從曬架那邊慢慢走過來。男人們讓開一條路。）');
    await S.say('Syapen', '讓他們說完。');
    await S.say('Syapen', '……你們，是從很遠的地方來的。身上帶著很重的東西。');
    await S.say('Syapen', '我們這裡，不好的東西叫 anito。死的事、跟死有關的東西，我們不帶進家裡。');
    await S.say('Syapen', '你們身上，有很多死的味道。不一定是你們的錯。可這是我們的規矩。');
    await S.say('Syapen', '你們可以留在海邊。不要往上走，不要靠近家，不要碰船。');
    await S.say('xinghe:serious', '好。我們答應。');
    await S.say('yungui:smile', '放心！我最懂了，像那種鬼，從宇宙的角度來看——');
    await H.fmove(S, 'hongying', 'R', { speed: 6 });
    S.emote('yungui', '💢');
    await S.say('', '（紅纓一把摀住雲歸的嘴。）');
    await S.say('yungui:surprise', '嗚嗚嗚嗚！');
    await S.say('', '（芋圓和麻糬並排坐在沙灘上，一動也不動，安安靜靜地看著老婦人。）');
    await S.say('Syapen', '……你們的貓，比你們懂規矩。');
    await S.say('hongying:shy', '牠、牠們才不是——');
    await S.say('xinghe:normal', '重點不是這個。'); 
    await S.say('Syapen', '你們為什麼來？');
    await S.say('xinghe:serious', '我們的船在繞島，幫被海害到的人。剛才海裡有一條大東西，往這裡游。');
    S.face('syapen', 'up');
    await S.say('', '（Syapen 的臉色沉下來。她看了一眼 Syaman 的手臂，和灘上一艘裂開的船。）');
    S.face('syapen', 'down');
    await S.say('Syapen', '三天前的晚上，海裡有東西撞壞了我兒子的船。也撞傷了他。');
    await S.say('Syaman', '船我自己會修。');
    S.face('syapen', 'left');
    await S.say('Syapen', '船你會修。你的手，不會自己好。');
    await S.say('Syaman', '……');
    S.face('syapen', 'down');
    await S.say('Syapen', '那東西還會再來。海邊的事，你們可以幫。');
    await S.say('Syapen', '船的事，是我兒子的事。他要你們幫什麼，你們才幫什麼。');
    await S.say('xinghe:serious', '明白。');
    await S.say('xinghe:think', '那個……請問怎麼稱呼？');
    await S.say('Syapen', '我是 Syapen Kaswal。他是 Syaman Kaswal。');
    await S.say('xinghe:surprise', '兩個都是 Kaswal？');
    S.spawn({ id: 'kaswal', sprite: 'c10_tao_child', x: 10, y: 11, dir: 'down' });
    S.emote('kaswal', '?');
    await S.say('', '（一個小男孩從曬架後面探出頭，盯著芋圓看。）');
    await S.say('Syaman', '那是 Kaswal。我的兒子。');
    await S.say('Syaman', '有了孩子，大家就用孩子的名字叫你——「Kaswal 的爸爸」。');
    await S.say('Syapen', '有了孫子，就用孫子的名字叫。我是「Kaswal 的奶奶」。');
    await S.say('Syapen', '名字，是會長大的。');
    await S.say('xinghe:think', '……名字會長大。');
    await S.say('yungui:normal', '（低聲）你的名字也是陳伯給的吧。');
    await S.say('xinghe:smile', '嗯。……說不定哪天也會長大。');
    S.flag('ch10_orchid_arrive');
    H.days(82);
    for (let i = 0; i < 6; i++) S.remove('c10_man' + i);
    S.remove('syaman'); S.remove('syapen'); S.remove('kaswal');
    S.quest('q_c10_tatala', 0);
    S.refresh();
    S.gather();
    H.objective(S, '在海邊聽 Sinan 說飛魚季的規矩（火堆旁）');
  };

  // ---------------------------------------------------------------- C10-03 飛魚季的規矩
  H.c10_03 = async (S) => {
    S.face('tao_sinan', 'player');
    await S.say('Sinan', '你們就是那群「不能往上走」的客人？坐。坐沙上，不要坐船上。');
    await S.say('Sinan', '我先說好。你們在這裡，要守飛魚的規矩。');
    await S.say('Sinan', '飛魚是黑潮帶來的客人。客人有客人的規矩，我們也有招待客人的規矩。');
    await S.say('Sinan', '很久以前，飛魚的頭目托夢給我們的祖先，教我們怎麼對待牠們。我們就照著做。');
    await S.say('Sinan', '第一，曬魚的架子不能亂碰。');
    await S.say('Sinan', '第二，飛魚用自己的鍋煮，不跟別的魚混在一起。');
    await S.say('Sinan', '第三，飛魚季裡，在海邊不大聲吵架，不說難聽的話。');
    await S.say('Sinan', '第四，抓多少吃多少，曬多少存多少。不浪費。');
    await S.say('Sinan', '其他的，你們不用知道。知道這些就夠了。');
    await S.say('hongying:serious', '記住了。');
    await S.say('Sinan', '你們餓了吧。我烤魚給你們。不是飛魚——是給客人吃的「女人魚」。');
    await S.say('xinghe:surprise', '女人魚？');
    await S.say('Sinan', '我們的魚分得很細。有的只有男人吃，有的老人吃，女人吃的最好吃。');
    await S.say('Sinan', '客人當然吃最好吃的。……你看我先生的臉，他不同意。');
    await S.say('Syaman', '（遠遠地）……我沒有不同意。');
    await S.say('Sinan', '你上次吃了三條。');
    await S.say('Syaman', '……');
    await S.say('hongying:smile', '那個……我可以幫忙烤嗎？');
    S.emote('tao_sinan', '…');
    await S.say('', '（Sinan 看了看紅纓的手。星河、雲歸同時開口——）'); 
    await S.say('xinghe:serious', '不行。');
    await S.say('yungui:serious', '不行。');
    S.emote('yuyuan', '💢');
    await S.say('', '（芋圓也搖了搖尾巴。不行。）');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '💢 你們！');
    await S.say('Sinan', '（大笑）好，好。我懂了。妳坐著。');
    await S.fadeOut(0.5);
    S.sfx('fire');
    await S.wait(0.4);
    await S.fadeIn(0.5);
    // 曬架 (§5.2) — the one trust check
    S.setPos('yuyuan', 9, 11, 'left');
    await H.fmove(S, 'yuyuan', 'L', { speed: 1.5 });
    S.emote('yuyuan', '♪');
    await S.say('', '（吃完飯，芋圓偷偷摸摸地爬向飛魚曬架……）');
    const c = await S.choice(['抓住芋圓', '假裝沒看到']);
    if (c === 0) {
      await S.say('xinghe:angry', '芋圓！規矩第一條！');
      await S.say('', '（芋圓停下來，回頭看了星河一眼……慢慢走回來，一屁股坐在星河腳上。只是想聞一下而已。）');
      S.emote('tao_sinan', '♪');
      await S.say('', '（Sinan 點了點頭。）');
      H.trust(1);
    } else {
      S.emote('tao_sinan', '💢');
      await S.say('', '（Sinan 一把拎起芋圓的後頸，丟回沙灘。）');
      S.sfx('push');
      await S.say('Sinan', '客人的貓，也是客人。客人不偷東西。');
      H.trust(-1);
    }
    S.flag('ch10_orchid_rules');
    S.refresh();
    S.spawn({ id: 'syaman2', sprite: 'tao_m', x: 12, y: 15, dir: 'up' });
    S.remove('tao_syaman');
    S.emote('syaman2', '!');
    await S.say('', '（Kaswal 不見了。Syaman 四處張望，臉色一變。）');
    await S.say('Syaman', 'Kaswal 呢？');
    await S.say('Sinan', '……他剛才說，要去找爸爸船上斷掉的那塊木頭。');
    await S.say('Syaman', '礁盤！要漲潮了——');
    await S.move('syaman2', 'R', { speed: 4 });
    S.shake(3, 0.3);
    await S.say('', '（Syaman 想跑，右臂一抽，跪倒在沙上。）');
    await S.say('xinghe:serious', '我們去！你在這裡等！');
    await S.say('Syaman', '（咬牙）……拜託。');
    S.remove('syaman2');
    S.flag('ch10_reef_open');
    S.quest('q_c10_tatala', 1);
    S.refresh();
    H.objective(S, '到南邊礁盤找 Kaswal（灘頭東側）');
  };

  // =================================================================================================
  // MAP: orchid_reef 礁盤（低潮）— tide cycle 24s: low 14s / high 10s (§5.3)
  // =================================================================================================
  const REEF = {
    channels: [
      { cells: cellsOf(17, 5, 1, 6), start: [17, 4, 'down'] },
      { cells: cellsOf(13, 14, 1, 8), start: [13, 13, 'down'] },
      { cells: cellsOf(17, 23, 7, 1), start: [16, 23, 'right'] },
    ],
    LOW: 14, CYCLE: 24,
  };
  (function orchidReef() {
    const g = new Grid(36, 30, '~');
    g.rect(0, 26, 36, 4, 'w');
    g.rect(14, 0, 8, 5, 'y');                  // P0 entrance flat
    g.rect(12, 11, 19, 3, 'y');                // P1
    g.rect(5, 22, 12, 3, 'y');                 // P2
    g.rect(24, 21, 6, 6, 'y');                 // P3 孤礁
    for (const ch of REEF.channels) for (const [x, y] of ch.cells) g.set(x, y, '-');
    // tide pools inside the flats (always walkable)
    g.set(19, 2, '-'); g.set(25, 12, '-'); g.set(8, 23, '-'); g.set(28, 25, '-'); g.set(15, 1, '-');
    const objs = [
      { t: 'rock_big', x: 20, y: 0 }, { t: 'rock_basalt', x: 14, y: 3 }, { t: 'rock_small', x: 21, y: 3 },
      { t: 'rock_big', x: 12, y: 11 }, { t: 'rock_basalt', x: 27, y: 11 }, { t: 'rock_small', x: 16, y: 13 }, { t: 'rock_big', x: 19, y: 11 },
      { t: 'rock_big', x: 5, y: 22 }, { t: 'rock_basalt', x: 11, y: 24 }, { t: 'rock_small', x: 15, y: 22 },
      { t: 'rock_big', x: 28, y: 21 }, { t: 'rock_basalt', x: 24, y: 26 }, { t: 'rock_small', x: 29, y: 24 },
      { t: 'seaweed', x: 19, y: 2 }, { t: 'seaweed', x: 25, y: 12 }, { t: 'seaweed', x: 8, y: 23 },
      { t: 'rock_big', x: 2, y: 6 }, { t: 'rock_big', x: 30, y: 4 }, { t: 'rock_basalt', x: 26, y: 17 }, { t: 'rock_big', x: 4, y: 15 }, { t: 'rock_basalt', x: 32, y: 15 },
      { t: 'driftwood', x: 22, y: 12, tag: 'oar1', label: '撿起', if: (st) => !st.flags.c10_oar1,
        interact: async (S) => { S.flag('c10_oar1'); H.removeObj('oar1'); await S.give('c10_oar', 1); await S.say('xinghe:normal', '一支槳，漂在礁盤上。……槳柄磨得好亮。'); } },
      { t: 'driftwood', x: 6, y: 24, tag: 'oar2', label: '撿起', if: (st) => !st.flags.c10_oar2,
        interact: async (S) => { S.flag('c10_oar2'); H.removeObj('oar2'); await S.give('c10_oar', 1); await S.say('hongying:normal', '又一支。應該是 Syaman 的。'); } },
      H.crate('reef', 29, 12, [['c10_seasalt', 2], ['huanhunxiang', 1]], { line: '被沖上礁盤的漂流木箱。不是這座島的東西。' }),
    ];
    G.Maps.define('orchid_reef', {
      name: '蘭嶼・礁盤', subtitle: '低潮時露出的珊瑚礁', place: 'orchid', bgm: 'orchid',
      start: [17, 1],
      light: { ambient: 0.05, color: '#203040' },
      particles: ['mist', 'wind'],
      tiles: g.rows(),
      objects: objs,
      npcs: [
        { id: 'reef_kaswal', sprite: 'c10_tao_child', name: 'Kaswal', x: 27, y: 23, dir: 'left', fixedDir: true, if: () => F('ch10_reef_open') && !F('ch10_reef_done'),
          talk: ['（Kaswal 緊緊抱著一塊彎彎的木頭。）'] },
      ],
      enemies: [
        { id: 'rf1', troop: 't_c10_reef_a', x: 24, y: 12, art: 'sand_crab', variant: 2, radius: 2, lv: 34 },
        { id: 'rf2', troop: 't_c10_reef_b', x: 10, y: 23, art: 'sand_crab', variant: 2, radius: 2, lv: 34 },
      ],
      warps: [{ x: 16, y: 0, w: 3, to: 'orchid_shore', tx: 41, ty: 15, tdir: 'left' }],
      events: [
        { id: 'kaswal', trigger: 'touch', x: 24, y: 21, w: 1, h: 6, if: (st) => st.flags.ch10_reef_open && !st.flags.ch10_reef_done, run: (S) => H.c10_04(S) },
        { id: 'pool', trigger: 'action', x: 28, y: 25, label: '調查', if: (st) => !st.flags.ch10_reef_done, run: async (S) => {
          await S.say('', '潮池裡有一截斷掉的木頭，上面有刻紋——是船首。');
        } },
      ],
      onEnter: async () => {
        H.patch('c10tide', reefTide, reefHud);
      },
    });
  })();
  function reefTide(ms, dt) {
    ms.c10t = (ms.c10t || 0) + dt;
    const high = (ms.c10t % REEF.CYCLE) >= REEF.LOW;
    if (high !== !!ms.c10high) {
      ms.c10high = high;
      for (const ch of REEF.channels) for (const [x, y] of ch.cells) ms.terrain[y * ms.w + x] = high ? 'water' : 'shallow';
      ms.computeSolid();
      if (high) { G.Audio.sfx('water'); G.UI.toast('漲潮了！', 'misc'); }
    }
    if (!high || G.Script.busy() || ms.player.moving || G.Scenes.top() !== ms) return;
    const p = ms.player;
    const k = REEF.channels.findIndex((ch) => ch.cells.some(([x, y]) => x === p.x && y === p.y));
    if (k < 0) return;
    const [sx, sy, sd] = REEF.channels[k].start;
    G.Script.run(async (S) => {
      S.shake(7, 0.5); S.sfx('splash');
      H.hurtParty(0.03);
      await S.say('', '浪打過來了！被沖回了礁台上。');
      await S.warp('orchid_reef', sx, sy, sd, { fade: 0.25 });
    });
  }
  function reefHud(ctx, ms) {
    if (G.Script.busy()) return;
    const ph = (ms.c10t || 0) % REEF.CYCLE;
    const high = ph >= REEF.LOW;
    const left = Math.ceil(high ? REEF.CYCLE - ph : REEF.LOW - ph);
    hudPlate(ctx, 24, G.H - 70, 230, 44);
    G.Render.text(ctx, high ? `漲潮　退潮還有 ${left} 秒` : `低潮　漲潮還有 ${left} 秒`, 40, G.H - 60, { size: 19, color: high ? '#8ac8ff' : '#f0e4c4' });
  }

  // ---------------------------------------------------------------- C10-04 礁盤：Kaswal
  H.c10_04 = async (S) => {
    S.face('player', 'right');
    await S.camera(26, 23, 0.6);
    H.monsters([[26, 22, 'sand_crab', 2], [29, 23, 'sand_crab', 2], [27, 25, 'moray', 2]]);
    await S.say('', '（孤立的礁石上，Kaswal 抱著一塊彎彎的木雕——船首高高翹起的那一段，上面還有刻紋。）');
    await S.say('', '（潮水已經漫到礁石腰部。礁石四周，三隻背上長滿黑色藤壺的大螃蟹精圍著他。）');
    await S.say('Kaswal', '（哭）不要過來！這是我爸爸的船！');
    await S.say('hongying:angry', '放開那孩子！');
    S.cameraFollow();
    await S.battle('t_c10_reef_kaswal', { mode: 'normal' });
    H.monsters([]);
    await S.say('', '（怪物退回海裡。紅纓涉水過去，把 Kaswal 連同木雕一起抱起來。）');
    await H.fwalk(S, 'hongying', 26, 23);
    S.face('hongying', 'right');
    await S.say('Kaswal', '……妳力氣好大。');
    await S.say('hongying:smile', '嗯。我是專門抱東西的。');
    await S.say('Kaswal', '（看著芋圓）牠也會抱嗎？');
    await S.say('', '（芋圓走過來，整隻壓在 Kaswal 的腳上。）');
    await S.say('hongying:smile', '……牠只會被抱。很重的那種。');
    await S.give('c10_figurehead', 1);
    if (!S.hasItem('c10_oar', 2)) {
      await S.say('yungui:normal', '回去的路上，順手把漂在礁上的槳撿回來吧。');
      if (!F('c10_oar1')) { S.flag('c10_oar1'); await S.give('c10_oar', 1); }
      if (!F('c10_oar2')) { S.flag('c10_oar2'); await S.give('c10_oar', 1); }
    }
    await S.fadeOut(0.6);
    S.flag('ch10_reef_done');
    await S.warp('orchid_shore', 12, 16, 'up', { fade: 0.01, stayDark: true });
    S.remove('tao_syaman'); S.remove('tao_kaswal');
    S.spawn({ id: 'syaman3', sprite: 'tao_m', x: 12, y: 13, dir: 'down' });
    S.spawn({ id: 'kaswal3', sprite: 'c10_tao_child', x: 13, y: 16, dir: 'up' });
    S.setPos('hongying', 13, 17, 'up'); S.setPos('yungui', 11, 17, 'up'); S.setPos('yuyuan', 12, 17, 'up');
    await S.fadeIn(0.6);
    await S.move('syaman3', 'DD', { speed: 5 });
    S.face('syaman3', 'right');
    await S.say('', '（Syaman 衝過來，一把抱住 Kaswal。他什麼話都沒說，只把額頭貼在兒子頭上。）');
    await S.wait(0.6);
    S.face('syaman3', 'down');
    await S.say('', '（他抬頭看隊伍，看到他們手上的槳和船首木雕。）');
    await S.say('Syaman', '……槳也撿回來了。');
    await S.say('xinghe:normal', '在礁盤上漂著。我們想說，應該是你的。');
    S.take('c10_oar', 2); S.take('c10_figurehead', 1);
    await S.say('Syaman', '（接過，摸了摸槳柄上的磨痕）……這支是我父親的。');
    await S.say('Syaman', '謝謝。');
    H.trust(1);
    S.spawn({ id: 'syapen3', sprite: 'c10_tao_elder', x: 10, y: 14, dir: 'down' });
    await S.say('Syapen', '天黑以後，那東西會再來。牠在找那艘破船。');
    await S.say('yungui:think', '破船上有牠撞的時候留下的潮病。牠聞得到。');
    await S.say('Syapen', '那今天晚上，你們守海邊。我們守家。');
    S.remove('syaman3'); S.remove('kaswal3'); S.remove('syapen3');
    S.quest('q_c10_tatala', 2);
    S.refresh(); S.gather();
    H.objective(S, '夜晚在灘頭守船（準備好了就告訴 Syapen）');
  };

  // ---------------------------------------------------------------- C10-05 夜灘・潮病海蛇
  H.c10_05 = async (S) => {
    S.bgm('night');
    const ms = G.mapScene;
    for (let i = 0; i < 9; i++) S.spawn({ id: 'torch' + i, sprite: 'tao_m', x: 10 + i * 3, y: ORC.LINE_Y - 1, dir: 'down', light: { r: 150, color: '#ffae5a' } });
    S.spawn({ id: 'n_kaswal', sprite: 'c10_tao_child', x: 22, y: ORC.LINE_Y - 1, dir: 'down' });
    H.place(S, 13, 17, 'down');
    S.setPos('hongying', 12, 17, 'down'); S.setPos('yungui', 14, 17, 'down'); S.setPos('yuyuan', 13, 16, 'down');
    void ms;
    await S.camera(16, 10, 0.01);
    await S.fadeIn(0.8);
    await S.say('', '（夜。灘頭的拼板舟被拖到高處，排成一排。部落的男人們站在界石那一線，手持火把，靜靜看著。）');
    await S.camera(16, 22, 1.2);
    await S.say('', '（遠方的王船船頭燈亮著。陳伯把王船橫過來，讓燈光正對灘頭。）');
    S.light({ ambient: 0.5 });
    S.shake(4, 1.0); S.sfx('water');
    await S.say('', '（海面下，一條長長的黑影游近。浪頭忽然隆起——一條粗如屋樑的海蛇昂起頭，身上爬滿黑色的藤壺，鱗片間滲著黑水。）');
    S.cameraFollow();
    S.emote('yuyuan', '!');
    await S.say('', '（芋圓全身的毛炸開，躲到星河身後。麻糬一動也不動，盯著海蛇的眼睛。）');
    await S.say('hongying:surprise', '比鰻王還長……！');
    await S.say('yungui:serious', '牠病了。黑水溝的死水滲進牠身體裡了。');
    await S.say('xinghe:serious', '那就把牠治好！守住船！');
    await S.battle('boss_tide_serpent', { intro: H.serpentRules, bgmAfter: 'night' });
    await S.say('', '（海蛇最後一次撲向灘頭的破船——星河擋在船前，螢火劍上燃起心火。火光照亮海蛇的眼睛。）');
    S.flash('#ffd890', 0.5, 0.6);
    await S.say('', '（海蛇停住了。王船船頭燈的光、星河的火，映在牠混濁的眼睛裡。牠身上的藤壺一片一片剝落，掉進海裡。）');
    S.sfx('water');
    await S.say('', '（黑潮的浪從外海捲來，溫暖地沖過海蛇的身體。黑水被洗掉，露出深藍帶金紋的鱗片。）');
    await S.say('', '（海蛇低頭看了一眼那艘破船，慢慢退回海裡。）');
    S.emote('n_kaswal', '!');
    await S.say('Kaswal', '（從界石那邊大喊）牠走了！！');
    await S.say('', '（界石後面，男人們放下了火把。）');
    await S.give('c10_serpentscale', 1);
    await S.give('c10_ac_snakescale', 1);
    H.trust(1);
    S.flag('ch10_serpent_defeated');
    await S.fadeOut(1.0);
    for (let i = 0; i < 9; i++) S.remove('torch' + i);
    S.remove('n_kaswal');
    V().c10_orchid_time = 'morning';
    await S.warp('orchid_shore', 12, 17, 'up', { reload: true, fade: 0.01, stayDark: true });
  };

  // ---------------------------------------------------------------- C10-06 修船・船眼・心燈
  H.c10_06 = async (S) => {
    S.bgm('orchid');
    S.remove('tao_syaman'); S.remove('tao_kaswal'); S.remove('tao_syapen'); S.remove('tao_sinan');
    S.spawn({ id: 'syaman', sprite: 'tao_m', x: 13, y: 16, dir: 'up' });
    S.spawn({ id: 'kaswal', sprite: 'c10_tao_child', x: 15, y: 16, dir: 'up' });
    S.spawn({ id: 'sinan', sprite: 'tao_f', x: 8, y: 13, dir: 'right' });
    H.place(S, 15, 19, 'up');
    S.setPos('hongying', 14, 19, 'up'); S.setPos('yungui', 16, 19, 'up'); S.setPos('yuyuan', 17, 19, 'up');
    await S.fadeIn(0.8);
    await S.say('', '（早晨。Syaman 坐在破船旁，用左手和膝蓋固定一塊木板。Kaswal 在一旁幫忙扶。）');
    await S.say('', '（隊伍站在幾步之外，沒有靠近。）');
    await S.say('Syaman', '……你。紅衣服的。');
    await S.say('hongying:surprise', '我？');
    await S.say('Syaman', '過來。扶這塊。不要動。我說放才放。');
    await H.fwalk(S, 'hongying', 14, 17, { yFirst: true });
    S.face('hongying', 'up');
    S.sfx('push');
    await S.say('', '（紅纓走過去，雙手扶住木板。Syaman 用木釘一根一根把船板接回去，縫隙用植物纖維塞緊。他的動作很慢，但每一下都很準。）');
    S.face('syaman', 'down');
    await S.say('Syaman', '（對星河）你。那個桶子，給我。');
    await S.move('player', 'U');
    await S.say('', '（星河遞過去。雲歸和兩隻貓在旁邊看。）');
    const c = await S.choice(['問他船是怎麼造的', '安靜地看']);
    if (c === 0) {
      await S.say('xinghe:normal', 'Syaman，這船是用幾塊木板拼的？');
      await S.say('Syaman', '很多塊。每一塊木頭，都有它要在的位置。');
      await S.say('Syaman', '……其他的，你不用知道。看就好。');
      await S.say('xinghe:smile', '好。');
    } else {
      S.emote('sinan', '♪');
      await S.say('', '（星河安靜地看著。遠處，Sinan 點了點頭。）');
      H.trust(1);
    }
    S.face('syaman', 'up');
    await S.say('', '（最後，Syaman 拿起一個小陶碗，裡面是紅色顏料。他用手指，沿著船首的同心圓，一圈一圈補上顏色。紅、白、黑。）');
    await S.say('xinghe:normal', '……船眼。');
    await S.say('Syaman', '嗯。船要看得到路。');
    await S.say('xinghe:think', '東港的王船也有眼睛。叫龍目，廟公用朱筆點的。');
    S.face('syaman', 'down');
    await S.say('Syaman', '（停了一下）……你們的船也有眼睛？');
    await S.say('xinghe:smile', '嗯。阿杉師說，有眼睛，船才認得路。');
    S.face('syaman', 'down');
    await S.camera(17, 24, 0.8);
    await S.say('Syaman', '（看向遠方的王船，很久）……它的眼睛畫得不錯。太兇了，可是不錯。');
    S.cameraFollow();
    S.spawn({ id: 'syapen', sprite: 'c10_tao_elder', x: 12, y: 13, dir: 'down' });
    await S.walkTo('syapen', 15, 17, { yFirst: false });
    S.face('syapen', 'down');
    await S.say('', '（Syapen 走過來，手上拿著一個用麻繩串著的小東西：一片手掌大的木片，刻著同心圓的船眼紋，中間塗紅。）');
    await S.say('Syapen', '給你們。');
    await S.say('xinghe:surprise', '這是……');
    await S.say('Syapen', '船眼。保佑船回家的。');
    await S.say('Syapen', '這是給你們幾個的。不是給你們那艘船上的神的。說清楚。');
    await S.say('yungui:smile', '（深深一揖）明白。');
    await S.say('Syapen', '你們守了規矩，沒往上走，沒碰船，沒亂說話。');
    S.face('syapen', 'yuyuan');
    await S.say('Syapen', '（看著芋圓）……大部分的時候。');
    await S.say('', '（芋圓別過頭去。）');
    S.face('syapen', 'down');
    await S.say('Syapen', '你們要去哪裡，要走多遠，我不問。可是一艘船，最重要的是回得了家。');
    await S.say('Syapen', '帶著它。看不到路的時候，它幫你看。');
    await S.give('key_boateye', 1);
    // trust settlement (§4.1): never crossed the stones → +1
    if (!(V().ch10_line_tries > 0)) H.trust(1);
    await S.fadeOut(0.8);
    V().c10_orchid_time = 'dusk';
    S.light({ ambient: 0.24, color: '#2a1424', tint: 'rgba(255,170,80,0.22)' });
    S.remove('syapen'); S.remove('kaswal');
    G.mapScene.objects = G.mapScene.objects.filter((o) => !(o.t === 'tatala' && o.x === 13 && o.y === 15));
    G.mapScene.computeSolid();
    S.setPos('syaman', 14, 20, 'down');
    H.addObj({ t: 'tatala', x: 13, y: 21, water: true, tag: 'newboat' });
    S.spawn({ id: 'kaswal_b', sprite: 'c10_tao_child', x: 13, y: 20, dir: 'down' });
    H.place(S, 13, 18, 'down');
    S.setPos('hongying', 12, 18, 'down'); S.setPos('yungui', 14, 18, 'down'); S.setPos('yuyuan', 15, 18, 'down');
    await S.camera(14, 21, 0.01);
    await S.fadeIn(0.8);
    await S.say('', '（傍晚。修好的拼板舟被推下海。Syaman 用沒受傷的左手撐槳，Kaswal 坐在船頭。）');
    S.remove('syaman'); S.remove('kaswal_b');
    const boat = G.mapScene.objects.find((o) => o.tag === 'newboat');
    for (let i = 0; i < 4; i++) { if (boat) { boat.y += 1; } await S.wait(0.35); }
    await S.say('', '（拼板舟在金色的海面上，划向黑潮。）');
    S.sfx('splash');
    S.particles(['wind', 'sparkles']);
    S.emote('player', '!');
    await S.say('', '（一群飛魚從船邊躍起。遠遠地，傳來 Kaswal 的歡呼。）');
    S.cameraFollow();
    if ((V().ch10_tao_trust || 0) >= 3) {
      S.setPos('sinan', 11, 16, 'down');
      await S.walkTo('sinan', 12, 17);
      S.face('sinan', 'right');
      await S.say('', '（Sinan 走到隊伍身邊，遞給每人一串飛魚乾。）');
      await S.say('Sinan', '今年最後一批曬好的。客人帶路上吃。');
      await S.give('feiyugan', 5);
      H.lightsStart(14, 25, 1, 0.5, { vy: -40 });
      await S.say('', '（海面上，夕陽裡，一點小小的光從黑潮中升起，越過拼板舟的船首，飄到星河手裡。）');
      await S.lantern('xd_tao_tatala', '達悟家族的拼板舟');
      H.lightsStop();
      await S.say('xinghe:smile', '（這盞燈……是那艘船找到回家的路時亮的。）');
      S.flag('ch10_tao_xindeng');
      S.quest('q_c10_tatala', 'done');
    } else {
      S.setPos('sinan', 11, 16, 'down');
      await S.say('Sinan', '……你們幫了忙。謝謝。路上小心。');
      await S.give('feiyugan', 2);
      S.quest('q_c10_tatala', 'done');
    }
    S.remove('sinan');
    S.flag('ch10_chuanyan');
    await S.fadeOut(0.8);
    V().c10_orchid_time = undefined;
    V().c10_deck = 'dusk';
    await S.warp(DECK, 20, 6, 'right', { fade: 0.01, stayDark: true });
    S.setPos('hongying', 19, 7, 'right'); S.setPos('yungui', 18, 6, 'right'); S.setPos('yuyuan', 19, 5, 'right');
    S.setPos('chenbo', 18, 7, 'right');
    await S.fadeIn(0.8);
    await S.say('', '（隊伍回到王船。星河把船眼護符掛在船頭龍目下方。木片碰到船身的瞬間，微微發光。）');
    S.flash('#ffe8b0', 0.4, 0.5);
    S.face('player', 'left');
    await S.say('chenbo:normal', '（看著護符）……達悟人給的？');
    await S.say('xinghe:normal', '嗯。她說，不是給船上的神，是給我們的。');
    await S.say('chenbo:smile', '那更貴重。');
    await H.xunjing(S, 3);
    H.days(76);
    S.quest('q_c10_main', 1);
    V().c10_deck = undefined;
    await S.fadeOut(0.5);
    await S.warp(DECK, 8, 6, 'right', { reload: true, fade: 0.01 });
    S.setPos('chenbo', 4, 6, 'right');
    H.objective(S, '乘黑潮北上，前往台東（與陳伯說話）');
  };

  // =================================================================================================
  // MAP: baosang 寶桑（台東）
  // =================================================================================================
  (function baosang() {
    const W = 40, HH = 30;
    const g = new Grid(W, HH, '.');
    g.blob(5, 6, 4, 4, 'f', 11); g.blob(4, 19, 4, 4, 'f', 12); g.rect(0, 0, 9, 3, 'f');
    g.blob(18, 22, 4, 2, ',', 4);
    g.line([[12, 0], [12, 28]], ':', 2);
    g.line([[12, 13], [27, 13]], ':', 2);
    g.line([[3, 12], [12, 12]], ':');
    g.band(26, W - 1, () => 0, () => 27, 's');
    g.band(0, W - 1, () => 0, () => 0, 's');
    for (let y = 0; y < HH; y++) {
      const e = 34 + Math.round(Math.sin(y * 0.45) * 0.8);
      for (let x = e; x < W; x++) g.set(x, y, x === e ? '-' : x > e + 2 ? 'w' : '~');
    }
    g.rect(14, 27, W - 14, 3, 'r'); g.rect(13, 27, 1, 3, 'm'); g.rect(15, 26, 10, 1, 'm');
    g.rect(31, 24, 7, 1, 'k');
    const objs = [
      { t: 'shophouse', x: 15, y: 2, door: 1, text: '雜貨' },
      { t: 'shophouse', x: 15, y: 8, door: 1, text: '武具', v: 2 },
      { t: 'house_minnan', x: 20, y: 8, text: '客棧', v: 1 },
      { t: 'signboard', x: 24, y: 11, text: '客棧' },
      { t: 'stall', x: 15, y: 16, text: '番薯' },
      { t: 'shrine_small', x: 19, y: 19, text: '福德祠' },
      { t: 'stone_lantern', x: 18, y: 20 }, { t: 'incense_burner', x: 21, y: 20 },
      { t: 'house_minnan', x: 2, y: 8, v: 0 },
      { t: 'tree_banyan', x: 8, y: 14 },
      { t: 'well', x: 7, y: 18 }, { t: 'bucket', x: 8, y: 18 },
      { t: 'bamboo', x: 0, y: 12 }, { t: 'bamboo', x: 1, y: 13 }, { t: 'bamboo', x: 0, y: 22 }, { t: 'bamboo', x: 2, y: 25 }, { t: 'bamboo', x: 10, y: 4 },
      { t: 'tree_banana', x: 10, y: 9 }, { t: 'tree_betel', x: 20, y: 3 }, { t: 'tree_betel', x: 22, y: 4 }, { t: 'tree_banana', x: 24, y: 15 },
      { t: 'cart', x: 14, y: 14 }, { t: 'basket', x: 17, y: 15 }, { t: 'jar', x: 19, y: 5 }, { t: 'barrel', x: 14, y: 6 }, { t: 'crate', x: 19, y: 11 },
      { t: 'fence_bamboo', x: 1, y: 3 }, { t: 'fence_bamboo', x: 4, y: 3 },
      { t: 'driftwood', x: 28, y: 6 }, { t: 'rock_small', x: 31, y: 3 }, { t: 'rock_small', x: 27, y: 20 }, { t: 'rock_big', x: 29, y: 1 },
      { t: 'boat_small', x: 28, y: 22 }, { t: 'fishing_net', x: 30, y: 19 }, { t: 'boat_small', x: 36, y: 25 }, { t: 'dock_post', x: 31, y: 25 },
    ];
    const deco = [];
    scatter(deco, g, 'silvergrass', [0, 0, 10, 26], ['f'], 0.18, 21);
    scatter(deco, g, 'tallgrass', [0, 0, 26, 26], ['.'], 0.04, 22);
    const occ = (list) => list.flatMap((o) => cellsOf(o.x, o.y, o.w || (G.Objects.get(o.t) || {}).w || 1, o.h || (G.Objects.get(o.t) || {}).h || 1));
    const clean2 = objs.concat(clearCells(deco, [...occ(objs), ...cellsOf(12, 0, 2, 29), ...cellsOf(12, 13, 16, 2), ...cellsOf(16, 5, 1, 1), ...cellsOf(16, 11, 1, 1), ...cellsOf(22, 11, 1, 1), ...cellsOf(4, 11, 1, 1), ...cellsOf(28, 4, 6, 20)]));
    G.Maps.define('baosang', {
      name: '寶桑', subtitle: '後山平原的交易小街', place: 'taitung', bgm: 'south',
      start: [13, 3],
      light: { ambient: 0.05, color: '#203048' },
      particles: ['wind', 'leaves'],
      tiles: g.rows(), objects: clean2,
      npcs: [
        { id: 'bs_runner', sprite: 'puyuma_m', name: '巴拉冠青年', x: 30, y: 16, dir: 'left', talk: (S) => H.runnerTalk(S) },
        { id: 'bs_runner2', sprite: 'c10_puyuma_boy', name: '巴拉冠青年', x: 29, y: 10, dir: 'down', wander: 2, talk: ['我是這一級最慢的。……可是我耐跑！跑到最後的一定是我！'] },
        { id: 'bs_run3', sprite: 'puyuma_m', name: '巴拉冠青年', x: 31, y: 7, dir: 'down', wander: 3, talk: ['（喘）……第、第十圈……'] },
        { id: 'bs_run4', sprite: 'puyuma_m', name: '巴拉冠青年', x: 32, y: 12, dir: 'up', wander: 3, talk: ['長輩說，跑步的時候不要講話。……我剛剛講話了嗎？'] },
        { id: 'bs_shop1', sprite: 'merchant', name: '阿旺伯', x: 16, y: 5, dir: 'down', talk: async (S) => {
          await S.say('阿旺伯', '寶桑這裡什麼都有：番薯、小米、鹿皮、鹽。漢人、卑南人、阿美人都在這裡換東西。');
          await S.shop(['shimuyu', 'c10_qiyuwan', 'c10_xiaomigao', 'huanhunxiang', 'c10_baicao', 'c10_fanshu', 'jiedu', 'xiangbao'], { title: '寶桑雜貨' });
        } },
        { id: 'bs_shop2', sprite: 'villager_m', name: '打鐵師傅', x: 16, y: 11, dir: 'down', talk: async (S) => {
          await S.say('打鐵師傅', '後山的鐵不好找。這幾把，是我用船運來的好鐵打的。');
          await S.shop(['c10_sw_chaosheng', 'c10_sp_huilang', 'c10_ar_tengjia', 'c10_hd_lupi', 'c10_ft_lupi'], { title: '寶桑武具' });
        } },
        { id: 'bs_inn', sprite: 'shopkeeper_f', name: '客棧娘', x: 22, y: 11, dir: 'down', talk: async (S) => {
          await S.say('客棧娘', '一晚一百文。晚上別去海邊，最近不平靜。');
          await S.inn(100, { who: '客棧娘' });
        } },
        { id: 'bs_stall', sprite: 'fisher_f', name: '番薯攤阿嬸', x: 17, y: 17, dir: 'left', talk: ['烤番薯、小米糕！熱的喔！', '寶桑的番薯，是卑南溪沖下來的土種出來的。甜！'] },
        { id: 'bs_old', sprite: 'old_m', name: '阿伯', x: 6, y: 13, dir: 'right', wander: 1, talk: ['這棵榕樹，比寶桑街還老。', '西邊那座山，高到雲都要繞路走。'] },
      ],
      warps: [{ x: 12, y: 0, w: 2, to: 'amis_village', tx: 8, ty: 31, tdir: 'up' }],
      events: [
        { id: 'c10_07', trigger: 'auto', if: (st) => !st.flags.ch10_taitung_arrive, run: (S) => H.c10_07(S) },
        { id: 'south', trigger: 'touch', x: 12, y: 28, w: 2, run: async (S) => {
          await S.say('', '卑南溪口。溪水夾著泥沙衝出來，溪口泥沙太深，走不過去。');
          await S.move('player', 'U');
        } },
        { id: 'dock', trigger: 'action', x: 36, y: 25, w: 2, label: '舢舨', run: async (S) => {
          const c = await S.choice(['划舢舨回王船', '留在寶桑'], { cancel: 1 });
          if (c === 0) await H.toDeck(S);
        } },
        { id: 'shrine', trigger: 'action', x: 19, y: 19, w: 2, h: 2, label: '參拜', run: async (S) => {
          await S.say('', '小小的土地公廟。香爐裡插著幾支新香。');
          await S.say('yungui:normal', '走到哪，土地公都在。……後山也一樣。');
        } },
      ],
    });
  })();

  H.c10_07 = async (S) => {
    V().c10_place = 'taitung'; V().c10_port = 'baosang';
    S.quest('q_c10_main', 1);
    H.place(S, 30, 14, 'right');
    S.setPos('hongying', 29, 14, 'right'); S.setPos('yungui', 29, 15, 'right'); S.setPos('yuyuan', 30, 15, 'right');
    const ms = G.mapScene;
    const runner = ms.actor('bs_runner');
    S.setPos('bs_runner', 32, 9, 'down');
    await S.camera(31, 12, 0.01);
    await S.say('', '（寶桑，早晨。礫石灘上，一群年輕人赤著腳在跑步，一圈又一圈。）');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '他們在逃命嗎？');
    await S.say('yungui:normal', '在練腳力。');
    if (runner) await S.move('bs_runner', 'DDDD', { speed: 5 });
    S.face('bs_runner', 'left');
    await S.say('', '（跑在最前面的青年停下來，喘著氣，打量著他們。）');
    await S.say('巴拉冠青年', '外地人？你們的船好怪，像一間廟在海上漂。');
    await S.say('xinghe:laugh', '差不多就是那樣。');
    await S.say('巴拉冠青年', '我們是巴拉冠的青年。巴拉冠是我們卑南族青年的會所。');
    await S.say('巴拉冠青年', '我們在那裡學跑、學打獵、學聽長輩的話。……裡面的事，外人不能看。');
    await S.say('巴拉冠青年', '你們在外面看我們跑，可以。');
    await S.say('hongying:smile', '（盯著他們的腿）跑得很快。');
    await S.say('巴拉冠青年', '妳看起來也很快。要不要比一圈？……等一下也行，我一直在這裡。');
    await S.say('巴拉冠青年', '不過說正經的——你們如果要往北，小心。');
    await S.say('巴拉冠青年', '北邊海岸有個阿美族的部落，他們的海祭快到了，可是海邊不乾淨。');
    await S.say('巴拉冠青年', '晚上，溺死的人在灘上走。不是他們的人，也不是我們的人。');
    await S.say('巴拉冠青年', '是從西邊的海，被推過來的陌生人。');
    await S.say('xinghe:serious', '……又是逆潮。');
    await S.say('巴拉冠青年', '他們部落年齡階層的人守了好幾晚，有人病倒了。你們如果能幫，就去幫。');
    await S.say('巴拉冠青年', '跟他們的長老說，是寶桑海邊跑步的人叫你們去的。');
    S.cameraFollow();
    S.setPos('bs_runner', 30, 16, 'left');
    S.flag('ch10_taitung_arrive');
    S.quest('q_c10_race', 0);
    H.objective(S, '往北，到阿美族部落（寶桑北口）');
  };

  H.runnerTalk = async (S) => {
    if (!F('ch10_race_won')) {
      await S.say('巴拉冠青年', '我們每天早上跑。跑得快，腳才夠力。巴拉冠的長輩說，一個青年最先要學的，是聽話跟耐累。');
      await S.say('巴拉冠青年', '那個紅衣服的，腳看起來很快。要不要比一圈？');
      const c = await S.choice(['比一圈（紅纓上場）', '下次吧'], { cancel: 1 });
      if (c !== 0) return;
      await S.say('hongying:smug', '比就比。輸了不要哭。');
      const tries = (V().c10_race_tries = (V().c10_race_tries || 0) + 1);
      const win = await G.Mini.mash({ title: '海灘賽跑', hint: '連按 Z 往前衝！跑一圈礫石灘', time: 11, need: 42, rivals: [{ name: '巴拉冠青年', rate: 4.1 * (tries > 1 ? 1.1 : 1) }] });
      if (win) {
        await S.say('巴拉冠青年', '（喘）……妳是第一個贏我的外地人。我們長輩說，輸了要服氣。我服氣。');
        await S.give('c10_beinanstone', 2);
        await S.give('c10_ft_kuaitui', 1);
        S.flag('ch10_race_won');
        S.quest('q_c10_race', 'done');
      } else {
        await S.say('巴拉冠青年', '不錯！妳要是在我們巴拉冠，會是很好的青年！……啊，妳是女的。那妳會是很好的……很好的妳。');
        await S.say('hongying:angry', '……再一次。');
      }
      return;
    }
    const lines = ['巴拉冠是我們青年的會所。裡面的事，外人不能看。你們在外面看我們跑，可以。', '北邊海岸的阿美族朋友，這幾天晚上不敢靠近海。聽說溺死的人在灘上走。', '那不是他們的人，也不是我們的人。是從西邊的海被推過來的陌生人。'];
    if (F('ch10_haiji_witnessed')) await S.say('巴拉冠青年', '聽說北邊的海祭順利辦完了。……你們跑得也不慢嘛。');
    else await S.say('巴拉冠青年', lines[(V().c10_runner_i = ((V().c10_runner_i || 0) + 1)) % lines.length]);
  };

  // =================================================================================================
  // MAP: amis_village 阿美族部落（海岸階地）
  // =================================================================================================
  (function amis() {
    const W = 44, HH = 34;
    const g = new Grid(W, HH, '.');
    g.blob(30, 4, 6, 3, ',', 31); g.blob(8, 26, 6, 4, ',', 32);
    g.rect(13, 8, 13, 6, ':');                         // plaza
    g.line([[8, 33], [8, 20], [12, 20], [12, 14]], ':', 2);
    g.line([[18, 14], [18, 19], [28, 19]], ':', 2);
    g.line([[25, 9], [36, 9], [36, 0]], ':', 2);
    g.line([[19, 7], [19, 8]], ':', 2);
    g.rect(2, 15, 7, 5, 'f');                          // wild-vegetable garden
    g.band(20, W - 1, (x) => 22 + Math.sin(x * 0.4) * 0.8, () => 30, 's');
    g.band(14, 19, () => 25, () => 30, 's');
    g.band(14, W - 1, (x) => 29 + Math.sin(x * 0.5 + 1) * 0.6, () => 31, '-');
    g.band(14, W - 1, () => 31, () => 34, '~');
    g.rect(40, 0, 4, 22, 'X');
    g.rect(0, 0, 2, 22, 'X');
    const objs = [
      { t: 'c10_amis_house', x: 3, y: 1, door: 2 }, { t: 'c10_amis_house', x: 26, y: 1, door: 2 },
      { t: 'c10_amis_house', x: 14, y: 1, w: 6, door: 3, big: true, tag: 'menhouse' },
      { t: 'c10_amis_house', x: 2, y: 9, door: 2 }, { t: 'c10_amis_house', x: 21, y: 15, door: 2 }, { t: 'c10_amis_house', x: 33, y: 11, door: 1, w: 4 },
      { t: 'millet_rack', x: 9, y: 5 }, { t: 'millet_rack', x: 22, y: 5 },
      { t: 'firepit', x: 19, y: 10 }, { t: 'bench', x: 15, y: 11 }, { t: 'bench', x: 22, y: 12 },
      { t: 'jar', x: 13, y: 13 }, { t: 'basket', x: 14, y: 13, v: 2 }, { t: 'jar', x: 25, y: 8 },
      { t: 'tree_banyan', x: 29, y: 13, tag: 'viewtree' },
      { t: 'tree_betel', x: 11, y: 2 }, { t: 'tree_betel', x: 12, y: 4 }, { t: 'tree_betel', x: 33, y: 5 }, { t: 'tree_betel', x: 38, y: 16 }, { t: 'tree_betel', x: 2, y: 13 },
      { t: 'bamboo', x: 9, y: 1 }, { t: 'bamboo', x: 23, y: 1 }, { t: 'bamboo', x: 38, y: 2 }, { t: 'tree_banana', x: 31, y: 8 },
      { t: 'fence_bamboo', x: 2, y: 20 }, { t: 'fence_bamboo', x: 5, y: 20 },
      { t: 'fishing_net', x: 24, y: 24 }, { t: 'boat_small', x: 28, y: 24 }, { t: 'driftwood', x: 39, y: 25 }, { t: 'rock_small', x: 18, y: 26 },
      { t: 'boat_small', x: 33, y: 29 },
    ];
    const deco = [];
    scatter(deco, g, 'tallgrass', [0, 21, 14, 13], ['.', ','], 0.12, 41);
    scatter(deco, g, 'flowers', [24, 0, 16, 8], ['.', ','], 0.06, 42);
    const clean = objs.concat(clearCells(deco, [...cellsOf(8, 20, 2, 14), ...cellsOf(36, 0, 2, 10), ...cellsOf(30, 16, 5, 4), ...cellsOf(34, 26, 2, 3), ...objs.flatMap((o) => cellsOf(o.x, o.y, o.w || (G.Objects.get(o.t) || {}).w || 1, o.h || (G.Objects.get(o.t) || {}).h || 1))]));
    const time = (st) => st.vars.c10_amis_time;
    G.Maps.define('amis_village', {
      name: '阿美族部落', subtitle: '海岸階地上的部落', place: 'taitung',
      bgm: (st) => (time(st) === 'dawn' ? null : 'tribe'),
      start: [8, 31],
      light: (st) => (time(st) === 'dawn' ? { ambient: 0.42, color: '#2a1626', tint: 'rgba(255,150,80,0.3)' } : { ambient: 0.05, color: '#203048' }),
      particles: (st) => (time(st) === 'dawn' ? ['wind', 'motes'] : ['wind']),
      tiles: g.rows(), objects: clean,
      pass: [{ x: 17, y: 3, solid: true }],
      drawOver: (ctx, t) => H.drawLights(ctx, t),
      npcs: [
        { id: 'am_kolas', sprite: 'amis_elder', name: 'Kolas', x: 21, y: 10, dir: 'down', talk: (S) => H.kolasTalk(S), if: () => !time(G.state) },
        { id: 'am_panay', sprite: 'amis_f', name: 'Panay', x: 5, y: 14, dir: 'down', wander: 1, talk: (S) => H.panayTalk(S), if: () => !time(G.state) },
        { id: 'am_youth', sprite: 'c10_amis_m', name: '年齡階層的青年', x: 16, y: 5, dir: 'down', talk: (S) => H.youthTalk(S), if: () => !time(G.state) },
        { id: 'am_youth2', sprite: 'c10_amis_m', name: '年齡階層的青年', x: 19, y: 5, dir: 'down', talk: ['……', '（他站得筆直，看了你一眼，沒有說話。）'], if: () => !time(G.state) },
        { id: 'am_kid', sprite: 'child_m', name: '部落孩子', x: 27, y: 18, dir: 'left', wander: 2, talk: ['長老年輕的時候，是部落最會抓魚的人！……他自己說的。'], if: () => !time(G.state) },
      ],
      warps: [
        { x: 8, y: 33, w: 2, to: 'baosang', tx: 12, ty: 1, tdir: 'down' },
        { x: 36, y: 0, w: 2, to: 'taitung_coast', tx: 23, ty: 37, tdir: 'up', run: async (S) => {
          if (F('ch10_amis_met')) return true;
          await S.say('', '往北是海岸。部落的人說，這幾天晚上不要靠近。');
          await S.move('player', 'D');
          return false;
        } },
      ],
      events: [
        { id: 'c10_08', trigger: 'auto', if: (st) => st.flags.ch10_taitung_arrive && !st.flags.ch10_amis_met, run: (S) => H.c10_08(S) },
        { id: 'c10_10', trigger: 'auto', if: (st) => st.flags.ch10_coast_clear && !st.flags.ch10_haiji_witnessed, run: (S) => H.c10_10(S) },
        { id: 'menhouse', trigger: 'action', x: 17, y: 3, label: '調查', run: async (S) => {
          await S.say('', '年齡階層的會所。門口有青年守著。');
          await S.say('yungui:normal', '那是他們年輕人的地方。外人不進去。');
        } },
        { id: 'boat', trigger: 'action', x: 33, y: 29, w: 2, label: '舢舨', run: async (S) => {
          const c = await S.choice(['划舢舨回王船', '留在部落'], { cancel: 1 });
          if (c === 0) await H.toDeck(S);
        } },
      ],
    });
  })();

  H.kolasTalk = async (S) => {
    if (F('ch10_haiji_witnessed')) {
      await S.say('Kolas', '你們這群外地人，還算懂事。下次來，帶好一點的酒。');
      return;
    }
    const lines = ['Nga\'ay ho。……坐。不要站著，站著的客人像要走。', '年輕人就是要給長輩使喚。我年輕的時候也一樣，被使喚到現在變成長輩，換我使喚。'];
    if (F('ch10_amis_met') && !F('ch10_coast_clear')) lines.push('河口、礁岸、岬角。天亮之前清乾淨。後天就是海祭。');
    await S.say('Kolas', lines[(V().c10_kolas_i = ((V().c10_kolas_i || 0) + 1)) % lines.length]);
  };
  H.panayTalk = async (S) => {
    const lines = ['我們阿美族有句話：牛吃的草，我們都能吃。你看這個，這個，這個，都是菜。', '海祭那天，男人去海邊，我們在家裡準備吃的。這是我們部落的規矩。你們？你們是客人，站遠一點看就好。', '那些年輕男人啊，平常很神氣，被長老罵一句就像小雞。'];
    const i = (V().c10_panay_i = ((V().c10_panay_i || 0) + 1)) % lines.length;
    await S.say('Panay', lines[i]);
    if (i === 0 && !F('c10_panay_veg')) {
      S.flag('c10_panay_veg');
      await S.say('Panay', '（遞給芋圓一片葉子）吃吃看。');
      await S.say('', '（芋圓聞了聞，嫌棄地別過頭。）');
      await S.say('Panay', '那你就是還沒吃過好吃的草。');
    }
  };
  H.youthTalk = async (S) => {
    if (F('ch10_haiji_witnessed')) { await S.say('年齡階層的青年', '謝謝你們。長老嘴巴不說，可是他今天多分了一條魚給你們。那是很大的意思。'); return; }
    const lines = ['我們這一級的，這幾天晚上輪流守海邊。可是那些溺死的……刀砍下去像砍水。', '長老說，海祭前，海邊要乾淨。不乾淨，海不會聽我們說話。'];
    await S.say('年齡階層的青年', lines[(V().c10_youth_i = ((V().c10_youth_i || 0) + 1)) % 2]);
  };

  // ---------------------------------------------------------------- C10-08 阿美族部落
  H.c10_08 = async (S) => {
    S.bgm('tribe');
    const youths = [[16, 12], [17, 12], [18, 12], [19, 12]];
    youths.forEach(([x, y], i) => S.spawn({ id: 'yo' + i, sprite: 'c10_amis_m', x, y, dir: 'up' }));
    S.setPos('am_kolas', 18, 10, 'down');
    H.place(S, 12, 16, 'up');
    S.setPos('hongying', 11, 17, 'up'); S.setPos('yungui', 13, 17, 'up'); S.setPos('yuyuan', 12, 17, 'up');
    await S.camera(17, 12, 0.01);
    await S.say('', '（部落廣場上，幾個年輕男人垂著頭站成一排，一位滿臉皺紋的老人正在罵他們。）');
    S.emote('am_kolas', '💢');
    await S.say('Kolas', '——守了三個晚上，一個都沒趕走！還病倒兩個！你們這一級，是吃什麼長大的？');
    await S.say('年輕人', '……吃野菜，長老。');
    await S.say('Kolas', '大聲一點！');
    S.shake(2, 0.3);
    await S.say('年輕人們', '吃野菜！長老！');
    S.face('am_kolas', 'left');
    S.cameraFollow();
    await S.walkTo('player', 15, 13);
    S.face('player', 'right');
    await S.say('', '（Kolas 轉身，看到隊伍。）');
    await S.say('Kolas', '……Nga\'ay ho。你們是誰？');
    await S.say('xinghe:normal', 'Nga\'ay ho！我們是寶桑海邊跑步的人叫來的。');
    await S.say('Kolas', '（哼）卑南的那些小子。腳快，嘴也快。');
    await S.say('Kolas', '外面來的人，帶來的東西都很麻煩。你們來做什麼？');
    await S.say('xinghe:serious', '聽說你們的海邊有溺魂。我們可以幫忙把它們送走。');
    await S.say('Kolas', '……你們會送？');
    await S.say('yungui:normal', '我是道士。他身上有引魂人的令。送迷路的魂，是我們的本事。');
    await S.say('Kolas', '（看著星河很久）……海祭，是我們跟海說話的日子。');
    await S.say('Kolas', '謝謝海這一年給我們的，請海今年也照顧出去討海的孩子。');
    await S.say('Kolas', '海邊不乾淨，海不會聽我們說話。');
    await S.say('Kolas', '那些溺死的，不是我們的人。我們不認識他們，他們也不認識我們。');
    await S.say('Kolas', '可是他們在我們的海邊哭。……我們也不忍心。');
    S.spawn({ id: 'panay_c', sprite: 'amis_f', x: 11, y: 14, dir: 'right' });
    await S.walkTo('panay_c', 14, 14);
    S.face('panay_c', 'right');
    await S.say('', '（一個年輕女子提著一籃野菜走過來。）');
    await S.say('Panay', '長老，客人來了，你就讓客人站著罵小孩？');
    await S.say('Kolas', '……Panay。');
    await S.say('Panay', '坐、坐。（塞給每人一把野菜）先吃。吃飽了，晚上才有力氣。');
    await S.say('xinghe:cry', '我、我比較喜歡吃肉……');
    await S.say('Panay', '那你就是還沒吃過好吃的草。（硬塞一片葉子進星河嘴裡）');
    await S.say('xinghe:surprise', '……（嚼）……咦？');
    await S.say('xinghe:shy', '……苦苦的，可是後面甜甜的。');
    await S.say('yungui:think', '（嚼）……這個苦味，跟我在山上研究的那種蕈很像。我好像看見了宇宙的——');
    await S.say('Panay', '那是野菜。坐好。'); 
    await S.say('Panay', '（得意）看吧。我們有句話：牛吃的草，我們都能吃。');
    await S.say('Kolas', '（揉額頭）……今晚，你們去海邊。三個地方：河口、礁岸、岬角。');
    await S.say('Kolas', '我們這一級的青年，在部落這一邊守。你們不要把那些東西趕到部落裡來。');
    await S.say('Kolas', '天亮之前清乾淨。後天就是海祭。');
    youths.forEach((c, i) => S.remove('yo' + i));
    S.remove('panay_c');
    S.setPos('am_kolas', 21, 10, 'down');
    S.flag('ch10_amis_met');
    H.days(47);
    S.quest('q_c10_haiji', 0);
    S.gather();
    H.objective(S, '夜晚清理台東海岸的三處溺魂（部落東北的海岸小路）');
  };

  // =================================================================================================
  // MAP: taitung_coast 台東海岸（夜，地城）
  // =================================================================================================
  const COAST = { A: [20, 25], B: [30, 13], C: [14, 5] };
  (function coast() {
    const W = 48, HH = 40;
    const g = new Grid(W, HH, '.');
    g.rect(0, 0, 4, HH, 'X'); g.rect(4, 0, 2, 22, 'X');
    // sea along the east, deeper outward
    for (let y = 0; y < HH; y++) {
      const e = 37 + Math.round(Math.sin(y * 0.3) * 1.2) - (y < 9 ? 3 : 0);
      for (let x = e; x < W; x++) g.set(x, y, x === e ? '-' : x > e + 3 ? 'w' : '~');
    }
    // C — headland (grass), cliff edge facing north & east
    g.rect(6, 0, 30, 1, 'X'); g.rect(30, 1, 4, 2, 'X');
    g.blob(18, 5, 8, 3, ',', 51);
    // B — reef shore
    g.rect(6, 10, 31, 11, 's');
    g.blob(21, 15, 3, 2, '-', 52); g.blob(32, 17, 2, 1.5, '-', 53); g.blob(12, 13, 2, 1.5, '-', 54);
    g.rect(6, 9, 18, 1, 'X'); g.rect(27, 9, 10, 1, 'X');      // low cliff between B and C; stairs at x 24..26
    g.rect(24, 9, 3, 1, 'H');
    // A — river mouth
    g.rect(6, 21, 31, 17, 's');
    g.blob(10, 25, 5, 3, 'm', 55); g.blob(9, 33, 4, 3, 'm', 56);
    g.rect(4, 29, 34, 2, 'r');
    g.rect(16, 29, 2, 2, '-');                                  // the ford (sand bar)
    g.rect(22, 38, 4, 2, ':'); g.rect(4, 38, 18, 2, 'X'); g.rect(26, 38, 12, 2, 'X');
    const objs = [
      { t: 'rock_big', x: 8, y: 11 }, { t: 'rock_big', x: 26, y: 12 }, { t: 'rock_basalt', x: 17, y: 12 }, { t: 'rock_big', x: 34, y: 11 }, { t: 'rock_small', x: 28, y: 16 },
      { t: 'rock_big', x: 14, y: 17 }, { t: 'rock_basalt', x: 24, y: 18 }, { t: 'rock_small', x: 9, y: 16 }, { t: 'rock_big', x: 29, y: 19 }, { t: 'rock_small', x: 35, y: 15 },
      { t: 'driftwood', x: 20, y: 20 }, { t: 'driftwood', x: 28, y: 23 }, { t: 'seaweed', x: 21, y: 15 }, { t: 'seaweed', x: 32, y: 17 },
      { t: 'rock_small', x: 31, y: 34 }, { t: 'driftwood', x: 30, y: 26 }, { t: 'rock_big', x: 33, y: 23 },
      { t: 'tree_pine', x: 8, y: 3 }, { t: 'tree_pine', x: 10, y: 1 }, { t: 'bush', x: 27, y: 6 }, { t: 'rock_big', x: 30, y: 5 }, { t: 'pandanus', x: 7, y: 7 },
    ];
    const deco = [];
    scatter(deco, g, 'reeds', [6, 21, 14, 17], ['m', 's'], 0.3, 61);
    scatter(deco, g, 'tallgrass', [6, 1, 28, 8], ['.', ','], 0.16, 62);
    scatter(deco, g, 'silvergrass', [6, 1, 28, 8], ['.', ','], 0.05, 63);
    const keep = [...cellsOf(15, 22, 4, 16), ...cellsOf(22, 31, 4, 8), ...cellsOf(19, 24, 3, 3), ...cellsOf(29, 12, 3, 3), ...cellsOf(13, 4, 3, 3), ...cellsOf(24, 8, 3, 3),
      ...cellsOf(18, 2, 8, 4), ...cellsOf(15, 10, 14, 2), ...cellsOf(6, 33, 2, 2), ...cellsOf(32, 4, 3, 3), ...cellsOf(35, 16, 2, 2)];
    const clean = objs.concat(clearCells(deco, keep.concat(objs.flatMap((o) => cellsOf(o.x, o.y, (G.Objects.get(o.t) || {}).w || 1, (G.Objects.get(o.t) || {}).h || 1)))));
    const pointLight = (st) => {
      const out = [];
      if (!st.flags.ch10_coast_a) out.push({ x: COAST.A[0], y: COAST.A[1], r: 150, color: '#6aa8ff', flicker: 0.3 });
      if (!st.flags.ch10_coast_b) out.push({ x: COAST.B[0], y: COAST.B[1], r: 150, color: '#6aa8ff', flicker: 0.3 });
      if (!st.flags.ch10_coast_c) out.push({ x: COAST.C[0], y: COAST.C[1], r: 150, color: '#6aa8ff', flicker: 0.3 });
      return out;
    };
    G.Maps.define('taitung_coast', {
      name: '台東海岸', subtitle: '溺魂徘徊的夜', place: 'taitung',
      bgm: (st) => (st.flags.ch10_coast_clear ? 'tribe' : 'night'),
      start: [23, 37],
      light: (st) => (st.flags.ch10_coast_clear ? { ambient: 0.18, color: '#2a2030', tint: 'rgba(255,170,110,0.14)' } : { ambient: 0.62, color: '#060c26', playerR: 210 }),
      particles: (st) => (st.flags.ch10_coast_clear ? ['wind'] : ['mist', 'motes']),
      tiles: g.rows(), objects: clean,
      lights: pointLight,
      drawOver: (ctx, t) => H.drawLights(ctx, t),
      chests: [
        { id: 'coastA', x: 6, y: 34, item: 'c10_fn_jingge', n: 1 },
        { id: 'coastB', x: 36, y: 16, item: 'c10_baicao', n: 2 },
        { id: 'coastC', x: 33, y: 5, item: 'huanhunxiang', n: 2, run: async (S) => { await S.give('c10_ac_coral', 1); } },
      ],
      npcs: [
        { id: 'ghost_a', sprite: 'ghost_m', ghost: true, name: '溺魂', x: 21, y: 26, dir: 'left', if: () => !F('c10_fix_a'), talk: ['……冷……好冷……'] },
        { id: 'ghost_b', sprite: 'ghost_f', ghost: true, name: '溺魂', x: 31, y: 14, dir: 'left', if: () => !F('c10_fix_b'), talk: ['……回……'] },
        { id: 'ghost_c', sprite: 'ghost_m', ghost: true, name: '溺魂', x: 22, y: 3, dir: 'left', if: () => !F('ch10_coast_c'), talk: ['（他面朝西方，一動也不動。）'] },
      ],
      enemies: [
        { id: 'ca1', troop: 'taitung_1', x: 26, y: 34, art: 'water_ghost', variant: 2, lv: 35, if: () => !F('ch10_coast_clear') },
        { id: 'ca2', troop: 't_c10_coast_a', x: 11, y: 23, art: 'water_ghost', variant: 2, lv: 35, if: () => !F('ch10_coast_clear') },
        { id: 'cb1', troop: 't_c10_coast_b', x: 19, y: 18, art: 'tide_grudge', variant: 2, lv: 35, if: () => !F('ch10_coast_clear') },
        { id: 'cb2', troop: 'taitung_3', x: 33, y: 20, art: 'cliff_spirit', lv: 36, if: () => !F('ch10_coast_clear') },
        { id: 'cc1', troop: 'taitung_2', x: 28, y: 4, art: 'sea_monster', variant: 1, lv: 35, if: () => !F('ch10_coast_clear') },
      ],
      warps: [{ x: 22, y: 39, w: 4, to: 'amis_village', tx: 36, ty: 2, tdir: 'down', run: async () => {
        if (!(F('ch10_coast_a') && F('ch10_coast_b') && F('ch10_coast_c'))) V().c10_coast_left = true;
        return true;
      } }],
      events: [
        { id: 'fixA', trigger: 'touch', x: 18, y: 23, w: 5, h: 5, if: (st) => !st.flags.c10_fix_a, run: async (S) => {
          await S.say('', '河口的沙洲上，溺魂從水裡一個一個爬上來。');
          await S.say('xinghe:serious', '來了！');
          await S.battle('t_c10_coast_fix_a');
          S.flag('c10_fix_a');
          await S.say('yungui:normal', '那邊的水漬裡有一點藍光。是招魂點。');
        } },
        { id: 'fixB', trigger: 'touch', x: 27, y: 11, w: 7, h: 5, if: (st) => !st.flags.c10_fix_b, run: async (S) => {
          await S.say('', '礁岸上，一個大型的潮怨守著水漬，四周的溺魂都朝它聚過來。');
          await S.battle('t_c10_coast_fix_b');
          S.flag('c10_fix_b');
        } },
        { id: 'fixC', trigger: 'touch', x: 17, y: 2, w: 9, h: 4, if: (st) => !st.flags.c10_fix_c, run: (S) => H.coastBoss(S) },
        { id: 'ptA', trigger: 'action', x: COAST.A[0], y: COAST.A[1], label: '招魂', if: (st) => st.flags.c10_fix_a && !st.flags.ch10_coast_a, run: async (S) => {
          await H.guide(S, COAST.A);
          await S.say('xinghe:normal', '往北走。黑潮會帶你們走。');
          S.flag('ch10_coast_a');
          await H.coastCheck(S);
        } },
        { id: 'ptB', trigger: 'action', x: COAST.B[0], y: COAST.B[1], label: '招魂', if: (st) => st.flags.c10_fix_b && !st.flags.ch10_coast_b, run: async (S) => {
          await H.guide(S, COAST.B);
          await S.say('', '（一個溺魂在消失前，回頭看了星河一眼，用很輕的聲音說了一句聽不懂的鄉音。）');
          await S.say('yungui:sad', '……漳州腔。是從唐山渡海的人。');
          S.flag('ch10_coast_b');
          await H.coastCheck(S);
        } },
        { id: 'ptC', trigger: 'action', x: COAST.C[0], y: COAST.C[1], label: '招魂', if: (st) => st.flags.c10_fix_c && !st.flags.ch10_coast_c, run: async (S) => {
          await H.guide(S, COAST.C, 40);
          await S.say('', '（所有溺魂的藍光升起，在岬角上空繞了一圈，往北方、往黑潮的方向，慢慢漂走。）');
          S.flag('ch10_coast_c');
          await H.coastCheck(S);
        } },
        { id: 'edge', trigger: 'action', x: 34, y: 2, label: '眺望', run: async (S) => {
          await S.say('', '岬角上，可以眺望整片海。黑潮在月光下，一路往北流。');
        } },
      ],
      onEnter: async () => { if (!V().c10_coast_night) V().c10_coast_night = 1; },
    });
  })();

  // 引魂令: blue lights rise from the water stain and drift north toward the Kuroshio
  H.guide = async (S, [x, y], n = 16) => {
    S.face('player', 'up');
    await S.say('', '（星河舉起引魂令。）');
    S.sfx('lantern');
    H.lightsStart(x, y, n, n > 20 ? 4 : 1.5, { vy: -30, vx: 10 });
    await S.say('', '（水漬裡的藍光一點一點浮起，排成一列，往海的方向漂去。）');
    await S.wait(1.2);
    H.lightsStop();
  };
  H.coastBoss = async (S) => {
    S.bgm('tension');
    await S.camera(21, 3, 0.8);
    await S.say('', '（岬角上，數十個溺魂圍成一圈，面朝西方——他們家鄉的方向。圈的中心，一個巨大的潮怨正把新的溺魂從海裡拉上岸。）');
    await S.say('潮怨', '……回……回唐山……回不去……就在這裡……');
    S.cameraFollow();
    await S.say('xinghe:serious', '這裡不是你們的家，也不是你們該停的地方。');
    await S.battle('t_c10_coast_boss');
    S.flag('c10_fix_c');
    S.bgm('night');
    await S.say('yungui:normal', '招魂點在那邊。送他們走吧。');
  };
  H.coastCheck = async (S) => {
    if (!(F('ch10_coast_a') && F('ch10_coast_b') && F('ch10_coast_c'))) return;
    await S.wait(0.4);
    S.light({ ambient: 0.32, color: '#2a2030', tint: 'rgba(255,170,110,0.14)' });
    S.particles(['wind']);
    await S.say('', '（天邊開始泛白。部落方向傳來一聲短短的呼喊——是青年們在報平安。）');
    await S.say('hongying:smile', '……天亮了。');
    S.flag('ch10_coast_clear');
    S.quest('q_c10_haiji', 1);
    S.refresh();
    H.objective(S, '回到阿美族部落');
  };

  // ---------------------------------------------------------------- C10-10 遠觀海祭・心燈 19
  // The 海祭 is performed by the village; the party only watches from the viewing tree.
  // Fixed camera, no BGM (waves and wind only), the player cannot move, no minigame, no prayer text.
  H.c10_10 = async (S) => {
    await S.fadeOut(0.8);
    S.bgm(null);
    V().c10_amis_time = 'dawn';
    await S.warp('amis_village', 31, 17, 'down', { reload: true, fade: 0.01, stayDark: true });
    S.bgm(null);
    S.setPos('hongying', 30, 17, 'down'); S.setPos('yungui', 32, 17, 'down'); S.setPos('yuyuan', 31, 18, 'down');
    S.spawn({ id: 'panay_h', sprite: 'amis_f', x: 29, y: 17, dir: 'down' });
    // age-grade rows on the beach, eldest in front (closest to the sea), 長老 Kolas at the very front
    S.spawn({ id: 'kolas_h', sprite: 'amis_elder', x: 27, y: 28, dir: 'down' });
    const rows = [[25, 27, 'amis_elder'], [29, 27, 'amis_elder'], [24, 26, 'c10_amis_m'], [26, 26, 'c10_amis_m'], [28, 26, 'c10_amis_m'], [30, 26, 'c10_amis_m'],
      [23, 25, 'c10_amis_m'], [25, 25, 'c10_amis_m'], [27, 25, 'c10_amis_m'], [29, 25, 'c10_amis_m'], [31, 25, 'c10_amis_m']];
    rows.forEach(([x, y, sp], i) => S.spawn({ id: 'hj' + i, sprite: sp, x, y, dir: 'down' }));
    S.particles(['wind', 'motes']);
    await S.camera(29, 20, 0.01);
    await S.fadeIn(1.2);
    S.sfx('wind');
    await S.say('', '（黎明。隊伍站在觀禮樹下。）');
    await S.say('Panay', '（小聲）就在這裡看。不要拍手、不要叫、不要走過去。');
    await S.say('Panay', '（對芋圓）也不要去偷祭品。');
    await S.say('', '（芋圓一臉無辜地眨了眨眼。紅纓默默把牠抱了起來。）');
    await S.camera(27, 25, 2.0);
    await S.say('', '（遠景：海灘上，部落的男人按年齡階層排成幾列，最年長的在最前面，Kolas 站在最前方。年輕人在後面，一動也不動。）');
    S.sfx('water');
    await S.say('', '（海邊擺著幾樣供品：酒、檳榔、糯米。Kolas 面向大海，說了很長的一段話。風把聲音帶走了，隊伍聽不清楚。）');
    await S.camera(31, 18, 1.4);
    await S.say('', '（鏡頭停在隊伍臉上。星河靜靜看著。紅纓不自覺地挺直了背。雲歸收起了扇子。）');
    await S.camera(27, 27, 1.6);
    for (let i = 6; i < rows.length; i++) S.move('hj' + i, 'DDDDD', { wait: false, speed: 1.6 });
    await S.wait(1.0);
    S.sfx('splash');
    await S.say('', '（Kolas 說完，年輕人們走進海裡，撒網。浪拍打著他們的腰。）');
    await S.camera(27, 30, 1.4);
    H.lightsStart(27, 33, 60, 14, { vy: -14, vx: 6 });
    await S.say('', '（這時，遠方海平線上，一點、兩點、十點、上百點微弱的藍光，從海面浮起——那是昨夜送走的溺魂。）');
    await S.say('', '（它們在晨光中閃了一下，像是點頭，然後順著黑潮，往北方漂去，消失在光裡。）');
    await S.say('', '（部落的人沒有看到藍光。只有隊伍看到了。）');
    await S.camera(31, 18, 1.4);
    await S.say('xinghe:normal', '（……他們跟海說話的時候，也順便替這些陌生人說了一句吧。）');
    H.lightsStart(27, 30, 1, 0.3, { vy: -40, vx: 14 });
    await S.say('', '（一點小小的光從海上飄回來，越過正在撒網的年輕人，落到星河手上。）');
    await S.lantern('xd_amis_haiji', '阿美族海祭');
    H.lightsStop();
    S.quest('q_c10_haiji', 'done');
    await S.fadeOut(1.0);
    // daytime plaza: sharing the catch
    V().c10_amis_time = undefined;
    for (let i = 0; i < rows.length; i++) S.remove('hj' + i);
    S.remove('kolas_h'); S.remove('panay_h');
    await S.warp('amis_village', 18, 12, 'up', { reload: true, fade: 0.01, stayDark: true });
    S.setPos('am_kolas', 19, 9, 'down');
    S.setPos('hongying', 17, 12, 'up'); S.setPos('yungui', 20, 12, 'up'); S.setPos('yuyuan', 21, 11, 'up');
    S.setPos('am_youth', 16, 10, 'right'); S.setPos('am_panay', 22, 10, 'left');
    S.bgm('tribe');
    await S.camera(19, 11, 0.01);
    await S.fadeIn(1.0);
    await S.say('', '（白天，部落廣場。大家圍坐，年輕人把魚分好，先送到長老面前。）');
    await S.say('Kolas', '（拿起一條魚，看了看，遞給星河）……拿去。');
    await S.say('年輕人', '（小聲對隊伍）長老分魚給你們，是很大的意思。');
    await S.say('Kolas', '問什麼問。吃。');
    await S.say('Panay', '（端來一個用葉子編成的小包）阿里鳳鳳。裡面是飯。出遠門的人帶著吃。');
    await S.give('c10_alifengfeng', 3);
    await S.say('Kolas', '（遞上一小杯小米酒）喝一口。一口就好，你們還要開船。');
    await S.say('', '（紅纓、星河各喝一小口。雲歸雙手接過，恭敬地喝了一口，眼睛一亮。）');
    await S.say('yungui:smile', '……好酒。');
    await S.say('Kolas', '（得意）當然。我老婆釀的。');
    await S.say('', '（Kolas 又遞來檳榔。星河接過，學著嚼——臉皺成一團。）');
    S.emote('player', '💧');
    await S.say('xinghe:cry', '……好、好澀……');
    await S.say('Kolas', '（大笑）哈哈哈哈！漢人小子！');
    await S.say('Kolas', '……你們這群外地人，還算懂事。');
    if (!V().c10_coast_left) {
      await S.say('Kolas', '一個晚上就清乾淨了？……我年輕的時候也是這樣。');
      await S.say('Kolas', '這個給你們。我用了幾十年的魚鉤。');
      await S.give('c10_ac_kolas', 1);
    }
    await S.say('Kolas', '海今年會聽我們說話了。你們也去吧。你們的船，海也會照顧。');
    S.cameraFollow();
    await H.xunjing(S, 4);
    S.flag('ch10_haiji_witnessed');
    H.days(44);
    S.quest('q_c10_main', 2);
    S.setPos('am_youth', 16, 5, 'down'); S.setPos('am_panay', 5, 14, 'down'); S.setPos('am_kolas', 21, 10, 'down');
    S.refresh();
    S.gather();
    V().c10_port = 'amis';
    H.objective(S, '繼續北上，前往花蓮（海灘的舢舨可回王船）');
  };

  // =================================================================================================
  // MAP: huilan 洄瀾（花蓮）— 七月初一，開鬼門
  // =================================================================================================
  (function huilan() {
    const W = 36, HH = 28;
    const g = new Grid(W, HH, '.');
    g.rect(0, 0, W, 2, 'X');
    g.blob(30, 4, 5, 2, ',', 71);
    g.line([[0, 3], [10, 3], [10, 17]], '=', 2);
    g.line([[0, 12], [31, 12]], '=', 2);
    g.line([[20, 13], [20, 17]], '=', 2);
    g.line([[26, 7], [26, 12]], '=', 2);
    g.band(0, W - 1, (x) => 17 + Math.sin(x * 0.5) * 0.6, () => 20, 's');
    g.band(0, W - 1, (x) => 20 + Math.sin(x * 0.4 + 2) * 0.6, () => 21, '-');
    g.rect(0, 21, W, 3, '~'); g.rect(0, 24, W, 4, 'w');
    g.rect(20, 18, 2, 5, 'k');
    const objs = [
      { t: 'shophouse', x: 12, y: 4, door: 1, text: '雜貨' },
      { t: 'shophouse', x: 12, y: 9, door: 1, text: '武具', v: 1, w: 4 },
      { t: 'house_minnan', x: 19, y: 7, text: '客棧', v: 1 },
      { t: 'signboard', x: 24, y: 10, text: '客棧' },
      { t: 'shrine_small', x: 28, y: 5, text: '福德廟' },
      { t: 'c10_denggao', x: 26, y: 5 },
      { t: 'incense_burner', x: 28, y: 7 }, { t: 'stone_lantern', x: 31, y: 7 },
      { t: 'house_minnan', x: 2, y: 6, v: 0 },
      { t: 'stall', x: 15, y: 14, text: '宵夜' }, { t: 'well', x: 24, y: 14 },
      { t: 'bamboo', x: 0, y: 4 }, { t: 'bamboo', x: 7, y: 5 }, { t: 'tree_banana', x: 8, y: 9 }, { t: 'tree_betel', x: 33, y: 9 }, { t: 'tree_banana', x: 33, y: 14 },
      { t: 'lantern_string', x: 12, y: 13, w: 6, lift: 0 },
      { t: 'barrel', x: 17, y: 6 }, { t: 'crate', x: 11, y: 7 }, { t: 'jar', x: 4, y: 10 }, { t: 'cart', x: 27, y: 13 },
      { t: 'boat_small', x: 22, y: 21 }, { t: 'boat_small', x: 12, y: 22 }, { t: 'dock_post', x: 19, y: 21 }, { t: 'fishing_net', x: 6, y: 17 },
      { t: 'red_lantern', x: 13, y: 7, hang: true }, { t: 'red_lantern', x: 22, y: 10, hang: true },
    ];
    const deco = [];
    scatter(deco, g, 'tallgrass', [0, 4, 36, 13], ['.', ','], 0.05, 72);
    const occ = objs.flatMap((o) => cellsOf(o.x, o.y, o.w || (G.Objects.get(o.t) || {}).w || 1, o.h || (G.Objects.get(o.t) || {}).h || 1));
    const clean = objs.concat(clearCells(deco, [...occ, ...cellsOf(13, 7, 1, 1), ...cellsOf(13, 12, 1, 1), ...cellsOf(21, 10, 3, 2), ...cellsOf(25, 6, 3, 2)]));
    G.Maps.define('huilan', {
      name: '洄瀾', subtitle: '水在這裡打轉的港', place: 'taroko',
      bgm: (st) => (st.flags.ch10_hualien_arrive ? 'south' : 'night'),
      start: [22, 16],
      light: { ambient: 0.42, color: '#1a1430', tint: 'rgba(255,150,90,0.12)', playerR: 180 },
      particles: ['lanterns', 'wind'],
      tiles: g.rows(), objects: clean,
      npcs: [
        { id: 'hl_shop', sprite: 'shopkeeper_f', name: '阿和嫂', x: 13, y: 7, dir: 'down', talk: async (S) => {
          const lines = ['洄瀾，就是水在這裡打轉的意思。溪水出海，海水又推回來，轉啊轉。', '七月初一開鬼門，我們豎燈篙。燈越高，好兄弟越看得到這裡有普渡。'];
          await S.say('阿和嫂', lines[(V().c10_ahe_i = ((V().c10_ahe_i || 0) + 1)) % 2]);
          await S.shop(['shimuyu', 'c10_qiyuwan', 'c10_xiaomigao', 'huanhunxiang', 'c10_baicao', 'c10_fanshu', 'c10_quxiefu', 'xiangbao', 'jiedu', 'mashu'], { title: '洄瀾雜貨' });
        } },
        { id: 'hl_arms', sprite: 'villager_m2', name: '武具舖老闆', x: 13, y: 12, dir: 'down', talk: async (S) => {
          await S.say('武具舖老闆', '這陣子海上不平靜，來買槍的人變多了。');
          await S.shop(['c10_sp_huilan', 'c10_ar_shiwen', 'c10_hd_zhubian', 'c10_ft_lupi'], { title: '洄瀾武具' });
        } },
        { id: 'hl_inn', sprite: 'maid', name: '客棧夥計', x: 22, y: 11, dir: 'down', talk: async (S) => {
          await S.say('客棧夥計', '住一晚一百一十文。開鬼門了，晚上早點睡比較好。');
          await S.inn(110, { who: '客棧夥計' });
        } },
        { id: 'hl_old', sprite: 'old_m', name: '豎燈篙的老人', x: 26, y: 7, dir: 'down', talk: ['燈篙要豎直、要高。不然好兄弟找不到路，在外面亂走。', '今年的好兄弟多啊……海上一直來。'] },
        { id: 'hl_fisher', sprite: 'fisherman', name: '漁夫', x: 17, y: 17, dir: 'down', wander: 2, talk: ['溪口的水，這幾天是黑的。魚都不見了。', '王船停在港外，那麼大一艘，大家都在看。'] },
        { id: 'hl_kid', sprite: 'child_f', name: '囝仔', x: 6, y: 13, dir: 'right', wander: 2, talk: ['阿嬤說，鬼門開了，晚上不要吹口哨。'] },
      ],
      warps: [{ x: 0, y: 3, h: 2, to: 'truku_village', tx: 37, ty: 10, tdir: 'left' }],
      events: [
        { id: 'c10_11', trigger: 'auto', if: (st) => !st.flags.ch10_hualien_arrive, run: (S) => H.c10_11(S) },
        { id: 'dock', trigger: 'action', x: 20, y: 23, w: 2, label: '舢舨', run: async (S) => {
          const c = await S.choice(['划舢舨回王船', '留在洄瀾'], { cancel: 1 });
          if (c === 0) await H.toDeck(S);
        } },
        { id: 'denggao', trigger: 'action', x: 26, y: 5, label: '調查', run: async (S) => {
          await S.say('', '高高的燈篙。竹竿頂上掛著燈，在暮色裡亮著。');
        } },
      ],
    });
  })();

  H.c10_11 = async (S) => {
    V().c10_place = 'taroko'; V().c10_port = 'huilan';
    S.quest('q_c10_main', 2);
    H.days(29);
    S.bgm('night');
    H.place(S, 24, 10, 'up');
    S.setPos('hongying', 23, 10, 'up'); S.setPos('yungui', 25, 10, 'up'); S.setPos('yuyuan', 24, 11, 'up');
    await S.narrate(['七月初一。開鬼門。'], { veil: 1 });
    await S.camera(26, 6, 0.01);
    const helpers = [[25, 8], [27, 8], [26, 9]];
    helpers.forEach(([x, y], i) => S.spawn({ id: 'hp' + i, sprite: i === 2 ? 'fisherman' : 'villager_m', x, y, dir: 'up' }));
    S.setPos('hl_old', 24, 7, 'right');
    await S.fadeIn(0.6);
    await S.say('', '（小港的廟前，幾個人合力豎起一根高高的竹竿，竿頂掛著燈。）');
    await S.say('豎燈篙的老人', '起——！');
    S.shake(2, 0.3); S.sfx('push');
    await S.say('', '（燈篙立直。燈在暮色中亮起。）');
    S.sfx('lantern');
    await S.say('豎燈篙的老人', '燈篙要高。好兄弟才看得到這裡有普渡，不會在外面亂走。');
    helpers.forEach((c, i) => S.remove('hp' + i));
    S.cameraFollow();
    await S.say('xinghe:think', '……一年了。');
    await S.say('hongying:normal', '嗯？');
    await S.say('xinghe:normal', '去年七月，在九份，白芷就是那時候出現的。');
    await S.say('hongying:sad', '……還有一個月。');
    S.setPos('hl_shop', 13, 8, 'right');
    await S.walkTo('hl_shop', 21, 9);
    S.face('hl_shop', 'right');
    await S.say('', '（阿和嫂從店裡出來，指著西邊的山。）');
    await S.say('阿和嫂', '你們是那艘王船的人？山上太魯閣族的人在找會處理「不乾淨東西」的人。');
    await S.say('阿和嫂', '說是溪水倒流，黑的，海水灌進峽谷裡去了。');
    S.setPos('hl_shop', 13, 7, 'down'); S.setPos('hl_old', 26, 7, 'down');
    S.flag('ch10_hualien_arrive');
    S.bgm('south');
    S.gather();
    H.objective(S, '到山上的太魯閣族部落（洄瀾西邊的山路）');
  };

  // =================================================================================================
  // MAP: truku_village 太魯閣族部落（立霧溪口上方的台地）
  // =================================================================================================
  (function truku() {
    const W = 40, HH = 32;
    const g = new Grid(W, HH, '.');
    g.rect(0, 0, W, 3, 'X');
    g.rect(0, 3, 2, 29, 'X');
    g.blob(8, 8, 5, 3, ',', 81); g.blob(28, 6, 6, 2, ',', 82);
    g.line([[3, 13], [37, 13]], ':', 2);
    g.line([[37, 10], [39, 10]], ':', 2);
    g.line([[37, 10], [37, 13]], ':', 2);
    g.line([[19, 13], [19, 9]], ':', 2);
    g.line([[24, 14], [24, 19]], ':', 2);
    g.line([[24, 19], [31, 19]], ':', 2);
    // the terrace edge: below it the river mouth and the sea
    g.rect(2, 21, W - 2, 1, 'X');
    g.band(2, W - 1, () => 22, () => 32, 'r');
    g.band(30, W - 1, (x) => 22 + (x - 30) * 0.4, () => 32, '~');
    g.rect(2, 22, 6, 10, 'X'); g.rect(8, 22, 3, 3, 'X');
    g.rect(39, 3, 1, 7, 'X'); g.rect(39, 12, 1, 9, 'X');
    const objs = [
      { t: 'slate_house', x: 4, y: 4, door: 1 }, { t: 'granary', x: 10, y: 4 }, { t: 'slate_house', x: 22, y: 3, door: 1 }, { t: 'slate_house', x: 30, y: 8, door: 1 },
      { t: 'slate_house', x: 13, y: 6, door: 1, tag: 'iwanhouse' },
      { t: 'loom', x: 16, y: 10 }, { t: 'firepit', x: 18, y: 11 },
      { t: 'millet_rack', x: 8, y: 10 }, { t: 'granary', x: 27, y: 15 }, { t: 'slate_house', x: 3, y: 15, door: 1 },
      { t: 'tree_pine', x: 2, y: 4 }, { t: 'tree_camphor', x: 35, y: 4 }, { t: 'tree_pine', x: 3, y: 19 }, { t: 'tree_pine', x: 33, y: 15 }, { t: 'tree_camphor', x: 12, y: 18 },
      { t: 'bamboo', x: 26, y: 10 }, { t: 'bamboo', x: 36, y: 15 }, { t: 'tree_maple', x: 20, y: 17 }, { t: 'tree_pine', x: 9, y: 16 },
      { t: 'fence_wood', x: 22, y: 7 }, { t: 'basket', x: 12, y: 10 }, { t: 'jar', x: 11, y: 7 }, { t: 'stump', x: 15, y: 16 },
      { t: 'rainbow_arch', x: 27, y: 23, w: 8, h: 3, if: (st) => !!st.vars.c10_rainbow },
    ];
    const deco = [];
    scatter(deco, g, 'tallgrass', [2, 3, 37, 18], ['.', ','], 0.05, 83);
    scatter(deco, g, 'flowers', [2, 3, 37, 18], ['.', ','], 0.025, 84);
    const occ = objs.flatMap((o) => cellsOf(o.x, o.y, o.w || (G.Objects.get(o.t) || {}).w || 1, o.h || (G.Objects.get(o.t) || {}).h || 1));
    const clean = objs.concat(clearCells(deco, [...occ, ...cellsOf(14, 9, 6, 6), ...cellsOf(28, 17, 6, 4)]));
    const time = (st) => st.vars.c10_truku_time;
    G.Maps.define('truku_village', {
      name: '太魯閣族部落', subtitle: '立霧溪口上方的台地', place: 'taroko',
      bgm: (st) => (time(st) === 'night' ? null : time(st) === 'dawn' ? 'mountain' : 'mountain'),
      start: [36, 12],
      light: (st) => (time(st) === 'night' ? { ambient: 0.62, color: '#060a1e', playerR: 170 } : time(st) === 'dawn' ? { ambient: 0.16, color: '#2a2440', tint: 'rgba(255,190,140,0.18)' } : { ambient: 0.05, color: '#203048' }),
      particles: (st) => (time(st) === 'night' ? ['embers'] : ['leaves', 'mist']),
      tiles: g.rows(), objects: clean,
      lights: (st) => (time(st) === 'night' ? [{ x: 18, y: 11, r: 300, color: '#ffa850', flicker: 0.45 }] : []),
      npcs: [
        { id: 'tk_iwan', sprite: 'truku_elder', name: 'Iwan', x: 15, y: 10, dir: 'down', fixedDir: true, talk: (S) => H.iwanTalk(S), if: (st) => !time(st) },
        { id: 'tk_watan', sprite: 'c10_truku_m', name: 'Watan', x: 17, y: 13, dir: 'down', talk: (S) => H.watanTalk(S), if: (st) => !time(st) && (!st.flags.ch10_truku_permission || st.flags.ch10_colossus_defeated) },
        { id: 'tk_child', sprite: 'child_f', name: '部落孩子', x: 8, y: 14, dir: 'right', wander: 2, talk: ['奶奶的布是部落最漂亮的！你們看那個花紋，那是菱形，像眼睛。'], if: (st) => !time(st) },
        { id: 'tk_man', sprite: 'c10_truku_m', name: '部落男子', x: 29, y: 12, dir: 'left', wander: 1, talk: ['峽谷是我們的獵場。外人進去，要有人帶。', '山上的事，問依旺奶奶。'], if: (st) => !time(st) },
      ],
      warps: [{ x: 39, y: 10, h: 2, to: 'huilan', tx: 1, ty: 3, tdir: 'right' }],
      events: [
        { id: 'c10_12', trigger: 'auto', if: (st) => st.flags.ch10_hualien_arrive && !st.flags.ch10_gaya_heard, run: (S) => H.c10_12(S) },
        { id: 'c10_14', trigger: 'auto', if: (st) => st.flags.ch10_colossus_defeated && !st.flags.ch10_rainbow_seen, run: (S) => H.c10_14(S) },
        { id: 'trail', trigger: 'touch', x: 31, y: 19, w: 1, h: 1, run: async (S) => {
          if (!F('ch10_truku_permission')) { await S.say('', '往下是通往峽谷的小徑。那是太魯閣族的獵場。'); await S.move('player', 'L'); return; }
          if (!F('ch10_colossus_defeated')) {
            await S.say('Watan', '從這裡下去是懸崖，溪口現在全是黑水。我們從海那邊繞，王船停在清水斷崖下面。');
            await S.move('player', 'L');
            return;
          }
          const c = await S.choice(['沿獵徑下到峽谷', '留在部落'], { cancel: 1 });
          if (c === 0) await S.warp('taroko_gorge', 25, 10, 'down');
          else await S.move('player', 'L');
        } },
        { id: 'lookout', trigger: 'action', x: 31, y: 20, w: 3, label: '眺望', run: async (S) => {
          await S.say('', '台地邊緣。往下看，立霧溪從峽谷裡流出來，注入大海。');
          if (!F('ch10_colossus_defeated')) await S.say('', '溪水是黑的，表面結著一層白白的鹽殼。');
          else await S.say('', '溪水是碧綠的。');
        } },
        { id: 'loomlook', trigger: 'action', x: 16, y: 10, label: '調查', run: async (S) => {
          await S.say('', '水平背帶織布機。紅色的底，白色的菱形紋，一梭一梭織出來。');
          await S.say('Iwan', '不要站在我的線上面。');
        } },
      ],
    });
  })();

  H.iwanTalk = async (S) => {
    if (F('ch10_xinghe_turn')) { await S.say('Iwan', 'Mhuway su。……這是謝謝的意思。我很少說，你們要記得。'); return; }
    const lines = ['我在織布。不要站在我的線上面。', '織布跟做人一樣，一條線錯了，後面全部都要拆。'];
    await S.say('Iwan', lines[(V().c10_iwan_i = ((V().c10_iwan_i || 0) + 1)) % 2]);
  };
  H.watanTalk = async (S) => {
    if (F('ch10_xinghe_turn')) { await S.say('Watan', '你講的那個九份……有很多燈籠的山？我想看看。'); return; }
    const lines = ['進獵場要守 Gaya。獵場是祖先傳下來的，不是隨便的山。', '打到的獵物要分。自己一個人吃的人，會被大家看不起。'];
    await S.say('Watan', lines[(V().c10_watan_i = ((V().c10_watan_i || 0) + 1)) % 2]);
  };

  // ---------------------------------------------------------------- C10-12 Gaya 與彩虹橋
  H.c10_12 = async (S) => {
    S.bgm('mountain');
    S.setPos('tk_watan', 16, 11, 'down');
    H.place(S, 20, 13, 'left');
    S.setPos('hongying', 21, 13, 'left'); S.setPos('yungui', 21, 14, 'left'); S.setPos('yuyuan', 20, 14, 'left');
    await S.camera(16, 11, 0.01);
    await S.say('', '（台地上，一位老婦人坐在家門前，腰上綁著織布機的背帶，一梭一梭地織布。她的臉頰上有深藍色的紋路，從耳邊延伸到嘴角。）');
    await S.say('', '（一個背著弓的年輕人站在她旁邊。）');
    S.cameraFollow();
    await S.say('Watan', '奶奶，海那邊的人來了。');
    await S.say('Iwan', '……我看到了。不要站在我的線上面。');
    S.emote('player', '!');
    await S.move('player', 'L');
    await S.jump('player');
    await S.say('', '（星河趕緊抬腳。他剛好踩在一條垂到地上的麻線上。）');
    await S.say('xinghe:shy', '對、對不起！');
    await S.say('Iwan', '（繼續織）你們從海上來。海上的東西，這陣子往河裡跑。');
    await S.say('Iwan', '峽谷的水黑了。山羌不敢下去喝水，鳥也不叫了。');
    await S.say('Iwan', '瓦旦說，峽谷裡站著一個大石頭的東西，把水堵住了。');
    await S.say('xinghe:serious', '我們可以去處理。');
    await S.say('Iwan', '峽谷是我們的獵場。外人進去，要守我們的規矩。');
    await S.say('Iwan', '瓦旦帶你們。不要拿山上的東西。不要殺不用殺的動物。不要大聲。');
    await S.say('xinghe:serious', '好。');
    await S.say('', '（星河盯著 Iwan 的臉看。紅纓用手肘頂了他一下。）');
    await S.say('hongying:angry', '（小聲）不要一直看人家的臉！');
    await S.say('Iwan', '（笑了一下）讓他看。這是要給人看的。');
    await S.say('Iwan', '這叫紋面。……你想問什麼就問吧。');
    await S.say('xinghe:normal', '那……是怎麼來的？');
    await S.say('Iwan', '我們女人，要會織布，織得好，才能有。');
    await S.say('Iwan', '我十五歲那年，織出第一匹讓我媽媽點頭的布，才得到它。');
    await S.say('Iwan', '男人要是能保護家人、能獨當一面的獵人，才能有。');
    await S.say('hongying:surprise', '要「做到」才有……');
    await S.say('Iwan', '我們有 Gaya。祖先留下來的規矩。');
    await S.say('Iwan', '怎麼打獵、怎麼分肉、怎麼對待別人、怎麼對待山。照著 Gaya 活，就是好好活。');
    await S.say('Iwan', '人死了以後，靈魂要走過一座彩虹橋，我們叫 Hakaw Utux。');
    await S.say('Iwan', '祖靈在橋的那一頭等。照著 Gaya 好好活過的人，祖靈認得他，讓他過去。');
    await S.say('Iwan', '紋面，就是讓祖靈認得的記號。');
    S.face('player', 'down');
    await S.say('', '（星河低頭看著自己的手。）');
    await S.say('xinghe:sad', '……那，沒有記號的人呢？');
    await S.say('Iwan', '（梭子停了）……你在擔心什麼？');
    await S.say('xinghe:sad', '我……生下來就少了一樣東西。別人都有的東西。');
    await S.say('', '（紅纓和雲歸對看一眼。）');
    S.face('player', 'left');
    await S.say('Iwan', '（看著星河很久）你先去峽谷。回來，再問我一次。');
    S.face('tk_watan', 'up');
    await S.say('', '（Watan 側耳聽著樹上一隻小鳥的叫聲。）');
    S.sfx('sing');
    await S.say('Watan', '……sisil 說，可以走。');
    await S.say('xinghe:surprise', '小鳥說的？');
    S.face('tk_watan', 'right');
    await S.say('Watan', '我們出門打獵前，會聽 sisil 的叫聲。今天的聲音是好的。');
    await S.say('Watan', '跟我走。王船停在清水斷崖下面，從海那邊繞進溪口。');
    await S.say('', '（Iwan 從織布機上剪下一段麻線，繫在星河的手腕上。）');
    await S.give('c10_permit', 1);
    S.flag('ch10_gaya_heard'); S.flag('ch10_truku_permission');
    S.refresh();
    S.gather();
    H.objective(S, '從清水斷崖進入峽谷（回王船，出航到「清水斷崖下」）');
  };

  // =================================================================================================
  // MAP: qingshui_cliffs 清水斷崖（地城）— rockfall ledge (§5.4)
  // =================================================================================================
  const QS = { zone: [18, 15, 12, 4], lines: [[19, 21], [23, 25], [27, 29]], alcoves: [[21, 14], [25, 14], [28, 14]], start: [17, 16, 'right'] };
  (function qingshui() {
    const W = 50, HH = 40;
    const g = new Grid(W, HH, 'C');
    // the sea to the west and south
    for (let y = 0; y < HH; y++) { const e = 13 + Math.round(Math.sin(y * 0.35) * 1.5); for (let x = 0; x < e; x++) g.set(x, y, x < e - 3 ? 'w' : '~'); }
    g.rect(0, 37, W, 3, 'w');
    g.band(14, 34, () => 32, () => 37, 's');                          // gravel beach (landing)
    g.band(14, 34, () => 36, () => 37, '-');
    g.rect(17, 21, 3, 11, 'M');                                      // ledge up from the beach
    g.rect(17, 19, 3, 2, 'M');                                       // ledge bend
    g.rect(17, 15, 1, 4, 'M');                                       // up into the rockfall zone (west end)
    g.rect(18, 15, 12, 4, 'M');                                      // rockfall zone 12x4
    for (const [x, y] of QS.alcoves) g.set(x, y, 'v');
    g.rect(30, 3, 3, 16, 'M');                                       // north ledge
    g.rect(31, 0, 2, 3, 'M');                                        // to the river mouth
    g.rect(22, 7, 8, 2, 'M');                                        // dead-end branch (chest)
    g.rect(14, 22, 3, 10, '~'); g.rect(14, 19, 3, 3, '~'); g.rect(20, 22, 2, 9, 'C');
    const objs = [
      { t: 'rock_big', x: 26, y: 33 }, { t: 'rock_small', x: 31, y: 34 }, { t: 'driftwood', x: 23, y: 35 }, { t: 'rock_basalt', x: 17, y: 34 }, { t: 'rock_small', x: 33, y: 33 },
      { t: 'boat_small', x: 22, y: 37 },
      { t: 'rock_marble', x: 19, y: 21 }, { t: 'rock_marble', x: 29, y: 20 }, { t: 'rock_marble', x: 32, y: 11 }, { t: 'rock_marble', x: 30, y: 5 },
      { t: 'cliff_waterfall', x: 34, y: 8 },
      H.crate('qs_beach', 28, 35, [['shimuyu', 3]], { line: '被浪打上礫灘的木箱。' }),
      H.crate('qs_ledge', 22, 7, [['c10_sp_duanya', 1]], { line: '卡在岩棚盡頭的木箱。不知道是哪艘沉船上的東西。' }),
    ];
    G.Maps.define('qingshui_cliffs', {
      name: '清水斷崖', subtitle: '大理石崖壁直落深海', place: 'taroko', bgm: 'taroko',
      start: [24, 34],
      light: { ambient: 0.12, color: '#1a2030' },
      particles: ['wind', 'mist'],
      tiles: g.rows(), objects: objs,
      drawGround: (ctx, t, ms) => rockfallDraw(ctx, t, ms),
      npcs: [
        { id: 'qs_watan', sprite: 'c10_truku_m', name: 'Watan', x: 18, y: 25, dir: 'up', pos: () => (F('ch10_saved_watan') ? [32, 4] : [18, 25]), if: () => !F('ch10_colossus_defeated'),
          talk: ['山在乎的。山只是不說。', '（Watan 抬頭看著崖壁。）石頭會掉。看地上的影子。'] },
      ],
      enemies: [
        { id: 'qs1', troop: 't_c10_cliff_b', x: 19, y: 28, art: 'cliff_spirit', lv: 36, radius: 1 },
        { id: 'qs2', troop: 't_c10_cliff_a', x: 31, y: 12, art: 'cliff_spirit', lv: 36, radius: 2 },
      ],
      warps: [{ x: 31, y: 0, w: 2, to: 'taroko_gorge', tx: 21, ty: 53, tdir: 'up' }],
      events: [
        { id: 'qs_intro', trigger: 'auto', once: true, if: (st) => st.flags.ch10_truku_permission, run: (S) => H.qsIntro(S) },
        { id: 'qs_fall', trigger: 'touch', x: 17, y: 15, w: 13, h: 4, if: (st) => !st.flags.ch10_saved_watan, run: (S) => H.qsSaveWatan(S) },
        { id: 'boat', trigger: 'action', x: 22, y: 37, w: 2, label: '舢舨', run: async (S) => {
          const c = await S.choice(['划舢舨回王船', '留在崖下'], { cancel: 1 });
          if (c === 0) await H.toDeck(S);
        } },
      ],
      onEnter: async () => { H.patch('c10rock', rockfallTick, rockfallHud); },
    });
  })();
  function onLine(ms, x, y, L) {
    const [zx, zy, zw, zh] = QS.zone;
    return x >= L[0] && x <= L[1] && y >= zy && y < zy + zh;
  }
  function rockfallTick(ms, dt) {
    if (G.Script.busy() || G.Scenes.top() !== ms) return;
    const prev = ms.c10rf || 0;
    ms.c10rf = prev + dt;
    if (Math.floor(prev / 3) === Math.floor(ms.c10rf / 3)) return;
    // impact on the line that was warned during the previous period
    const L = QS.lines[Math.floor(prev / 3) % 3];
    ms.c10hit = { L, t: 0 };
    G.Audio.sfx('earth');
    G.Render.doShake(4, 0.25);
    const p = ms.player;
    const safe = QS.alcoves.some(([ax, ay]) => ax === p.x && ay === p.y);
    if (!safe && onLine(ms, p.x, p.y, L)) {
      G.Script.run(async (S) => {
        H.hurtParty(0.08);
        S.shake(8, 0.5);
        await S.say('', '落石砸了下來！被逼回了岩棚的起點。');
        await S.warp('qingshui_cliffs', QS.start[0], QS.start[1], QS.start[2], { fade: 0.25 });
      });
    }
  }
  function rockfallDraw(ctx, t, ms) {
    if (!ms.c10rock) return;
    const [zx, zy, zw, zh] = QS.zone;
    const per = (ms.c10rf || 0) % 3;
    const L = QS.lines[Math.floor((ms.c10rf || 0) / 3) % 3];
    if (per >= 2) {
      const k = per - 2;
      ctx.save();
      for (let y = zy; y < zy + zh; y++) for (let x = L[0]; x <= L[1]; x++) {
        ctx.fillStyle = `rgba(20,10,10,${0.18 + 0.3 * k})`;
        ctx.beginPath(); ctx.ellipse(x * T + 32, y * T + 34, 18 + 10 * k, 8 + 4 * k, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // alcoves (safe) glow faintly
    ctx.save();
    for (const [ax, ay] of QS.alcoves) { ctx.strokeStyle = 'rgba(200,220,255,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(ax * T + 6, ay * T + 6, T - 12, T - 12); }
    ctx.restore();
    if (ms.c10hit) {
      ms.c10hit.t += 1 / 60;
      const h = ms.c10hit;
      if (h.t > 0.6) { ms.c10hit = null; return; }
      ctx.save();
      for (let y = zy; y < zy + zh; y++) for (let x = h.L[0]; x <= h.L[1]; x++) {
        if (U.hash(x, y, 77) < 0.35) continue;
        const fall = Math.min(1, h.t * 5);
        const yy = y * T + 30 - (1 - fall) * 260;
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, h.t - 0.3) * 3);
        ctx.fillStyle = '#d8d2c4'; ctx.strokeStyle = '#6a645a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x * T + 18, yy); ctx.lineTo(x * T + 34, yy - 16); ctx.lineTo(x * T + 48, yy - 4); ctx.lineTo(x * T + 42, yy + 12); ctx.lineTo(x * T + 22, yy + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function rockfallHud(ctx, ms) {
    if (G.Script.busy()) return;
    const p = ms.player;
    const [zx, zy, zw, zh] = QS.zone;
    if (p.x < zx - 2 || p.x > zx + zw + 1 || p.y < zy - 2 || p.y > zy + zh + 1) return;
    hudPlate(ctx, 24, G.H - 70, 330, 44);
    G.Render.text(ctx, '落石區：看地上的影子，躲進凹壁', 40, G.H - 60, { size: 18, color: '#f0e4c4' });
  }

  H.qsIntro = async (S) => {
    V().c10_place = 'taroko'; V().c10_port = 'qingshui';
    S.spawn({ id: 'qw', sprite: 'c10_truku_m', x: 25, y: 33, dir: 'up' });
    S.remove('qs_watan');
    await S.camera(25, 24, 1.2);
    await S.say('', '（巨大的大理石崖壁從海裡直直升起，高得看不到頂。海是深到發黑的藍。）');
    S.cameraFollow();
    await S.say('xinghe:surprise', '……我覺得自己好小。');
    await S.say('yungui:think', '我們每個人都很小。山不在乎。');
    await S.say('Watan', '山在乎的。山只是不說。');
    await S.say('Watan', '我走前面。上面的岩棚會落石，看地上的影子。');
    S.remove('qw');
    S.refresh();
    H.objective(S, '沿崖邊的岩棚，進入溪口（北方）');
  };
  H.qsSaveWatan = async (S) => {
    const p = G.mapScene.player;
    S.remove('qs_watan');
    S.spawn({ id: 'qw2', sprite: 'c10_truku_m', x: p.x + 1, y: p.y, dir: 'right' });
    S.face('player', 'right');
    S.shake(5, 0.6); S.sfx('earth');
    await S.say('', '（一塊石頭從上方落下——）');
    await S.move('player', 'R', { speed: 8 });
    await S.move('qw2', 'D', { speed: 6 });
    S.flash('#fff', 0.2, 0.5);
    S.sfx('hit');
    S.emote('player', '💢');
    await S.say('', '（星河一把把 Watan 推開，自己被擦傷手臂。）');
    S.face('qw2', 'up');
    await S.say('Watan', '……你為什麼推我？');
    await S.say('xinghe:laugh', '你在我前面啊。');
    await S.say('Watan', '（沉默）……謝謝。');
    H.hurtParty(0.03);
    S.flag('ch10_saved_watan');
    S.remove('qw2');
    S.refresh();
  };

  // =================================================================================================
  // MAP: taroko_gorge 太魯閣峽谷（地城）— salt dams (§5.5) and the 石巨靈
  // =================================================================================================
  const GZ = {
    pools: [[23, 25], [27, 29], [31, 33], [35, 37]],   // row ranges of P0..P3
    dams: [26, 30, 34],                                 // rows of dam ①②③
    riverX: [19, 23], ledgeX: [24, 25],
    entry: [17, 41, 'up'],
  };
  const gzState = () => (V().c10_gorge = V().c10_gorge || { d: [0, 0, 0], p: [1, 1, 1, 0] });
  function gzSettle(st) {
    for (let it = 0; it < 5; it++) {
      st.p[3] = 0;
      for (let k = 2; k >= 0; k--) if (st.d[k] && st.p[k] && !st.p[k + 1]) { st.p[k] = 0; st.p[k + 1] = 1; }
    }
    st.p[3] = 0;
  }
  function gzApply(ms) {
    if (!ms || ms.def.id !== 'taroko_gorge') return;
    const st = F('ch10_colossus_defeated') ? { d: [1, 1, 1], p: [0, 0, 0, 0] } : gzState();
    const set = (x, y, id) => { ms.terrain[y * ms.w + x] = id; };
    GZ.pools.forEach(([a, b], i) => {
      for (let y = a; y <= b; y++) {
        for (let x = GZ.riverX[0]; x <= GZ.riverX[1]; x++) set(x, y, st.p[i] ? 'river' : 'lake');
        for (let x = GZ.ledgeX[0]; x <= GZ.ledgeX[1]; x++) set(x, y, st.p[i] ? 'river' : 'sand');
      }
    });
    GZ.dams.forEach((y, k) => { for (let x = GZ.riverX[0]; x <= GZ.riverX[1]; x++) set(x, y, st.d[k] ? 'river' : 'snow_rock'); });
    ms.computeSolid();
  }
  H.gzApply = gzApply;
  H.melt = async (S, n) => {
    const st = gzState();
    if (st.d[n - 1]) { await S.say('', '這道鹽壩已經融開了。溪水從缺口流過去。'); return; }
    await S.say('', ['鹽壩①。上游的水潭水位很高，白色的鹽殼把溪水堵住了。', '鹽壩②。白色的鹽殼把溪水堵住了。', '鹽壩③。最下游的一道鹽壩，下面就是往溪口的水。'][n - 1]);
    const c = await S.choice(['用心火融開', '先不要'], { cancel: 1 });
    if (c !== 0) return;
    S.sfx('fire'); S.flash('#ffb060', 0.3, 0.5);
    await S.say('', '（星河把手按在鹽殼上，心火一點一點燒進去——鹽殼裂開了。）');
    if (st.p[n]) {
      S.shake(8, 0.8); S.sfx('water');
      await S.say('', '下游的水潭還滿著——上游的水衝下來，整片溪道都淹了！');
      H.hurtParty(0.05);
      V().c10_gorge = { d: [0, 0, 0], p: [1, 1, 1, 0] };
      await S.warp('taroko_gorge', GZ.entry[0], GZ.entry[1], GZ.entry[2], { fade: 0.35 });
      gzApply(G.mapScene);
      await S.say('yungui:think', '下面還滿著，水沒地方去。……鹽壩又結起來了。');
      await S.say('Watan', '水要往下走。先替它把下面的路開好。');
      return;
    }
    st.d[n - 1] = 1; st.p[n - 1] = 0; st.p[n] = 1;
    gzSettle(st);
    S.sfx('water');
    gzApply(G.mapScene);
    await S.say('', '鹽壩融開了。上游的水流進下一個水潭，水位慢慢退了下來。');
    if (st.d.every(Boolean)) await S.say('Watan', '水往下走了。東邊的岩棚露出來了。');
  };
  (function gorge() {
    const W = 44, HH = 56;
    const g = new Grid(W, HH, 'C');
    // D — upstream pool (y 1..11)
    g.rect(13, 1, 18, 10, 'M');
    g.rect(15, 2, 14, 6, 'l');
    g.rect(20, 8, 3, 2, 'r');
    // C — the old hunting trail (single cell wide) above the void
    g.rect(27, 12, 10, 10, ' ');
    g.rect(26, 11, 1, 11, 'M');
    g.rect(27, 15, 1, 1, 'M');
    // B — 燕子口 (y 22..43): cave walls, river channel, west walkway, east ledge
    g.rect(12, 22, 18, 22, 'C');
    g.rect(16, 23, 3, 21, 'M');
    g.rect(19, 22, 5, 22, 'r');
    g.rect(24, 22, 2, 22, 'M');
    g.rect(24, 21, 3, 1, 'M');
    g.rect(26, 27, 2, 3, 'C'); g.set(26, 28, 'v');
    g.rect(14, 35, 2, 5, 'M'); g.set(14, 37, 'q'); g.set(15, 38, 'q');
    // A — river mouth (y 44..55)
    g.rect(12, 44, 18, 12, 's');
    g.rect(19, 44, 5, 6, 'r');
    g.rect(18, 50, 7, 2, 'q');
    g.blob(15, 47, 2, 2, 'q', 91); g.blob(27, 52, 2, 1.5, 'q', 92);
    g.rect(20, 54, 3, 2, 'M');
    const objs = [
      { t: 'rock_marble', x: 14, y: 9 }, { t: 'rock_marble', x: 29, y: 3 }, { t: 'rock_big', x: 13, y: 2 }, { t: 'cliff_waterfall', x: 22, y: 0 },
      { t: 'rock_marble', x: 25, y: 41 }, { t: 'rock_marble', x: 17, y: 42 }, { t: 'rock_big', x: 13, y: 48 }, { t: 'rock_marble', x: 27, y: 46 }, { t: 'rock_small', x: 15, y: 53 },
      { t: 'driftwood', x: 25, y: 48 }, { t: 'rock_marble', x: 16, y: 30 },
      H.crate('gz_a', 14, 45, [['c10_baicao', 2]], { line: 'Watan：那不是山的東西，是海帶來的。你們拿走，山會比較乾淨。', who: '' }),
      H.crate('gz_b', 26, 28, [['c10_fn_yunjian', 1]], { line: '壺穴裡卡著一個被逆潮沖上來的木箱。' }),
      H.crate('gz_c', 27, 15, [['c10_sw_heichao', 1]], { line: '崖邊卡著一個外來的木箱。' }),
    ];
    G.Maps.define('taroko_gorge', {
      name: '太魯閣峽谷', subtitle: '被逆潮倒灌的峽谷', place: 'taroko',
      bgm: 'taroko',
      start: [21, 53],
      light: (st) => (st.flags.ch10_colossus_defeated ? { ambient: 0.08, color: '#203040' } : { ambient: 0.24, color: '#101828' }),
      particles: ['mist', 'motes'],
      tiles: g.rows(), objects: objs,
      pass: GZ.dams.map((y) => ({ x: GZ.riverX[0], y, w: 5, h: 1, solid: true })),
      npcs: [
        { id: 'gz_muntjac', sprite: 'c10_muntjac', name: '山羌', x: 14, y: 37, dir: 'right', fixedDir: true, if: () => !F('ch10_freed_muntjac') && !F('c10_muntjac_left'), talk: (S) => H.muntjac(S) },
        { id: 'gz_watan', sprite: 'c10_truku_m', name: 'Watan', x: 24, y: 44, dir: 'up', if: () => !F('ch10_colossus_defeated'), talk: ['水要往下走。先替它把下面的路開好。', '鹽壩從西邊的岩棚碰得到。'] },
      ],
      enemies: [
        { id: 'gz1', troop: 'taroko_1', x: 15, y: 50, art: 'cliff_spirit', variant: 1, lv: 37, radius: 2, if: () => !F('ch10_colossus_defeated') },
        { id: 'gz2', troop: 'taroko_3', x: 25, y: 40, art: 'cliff_spirit', variant: 1, lv: 37, radius: 1, if: () => !F('ch10_colossus_defeated') },
        { id: 'gz3', troop: 'taroko_4', x: 17, y: 32, art: 'fog_spirit', variant: 2, lv: 37, radius: 2, if: () => !F('ch10_colossus_defeated') },
      ],
      warps: [{ x: 20, y: 55, w: 3, to: 'qingshui_cliffs', tx: 31, ty: 1, tdir: 'down' }],
      events: [
        { id: 'gz_intro', trigger: 'auto', once: true, if: (st) => !st.flags.ch10_colossus_defeated, run: async (S) => {
          await S.say('', '峽谷的溪水本應是碧綠的，下半段卻被逆潮倒灌成黑色，表面結著白色的鹽殼。');
          await S.say('Watan', '那不是山的東西，是海帶來的。');
        } },
        { id: 'dam1', trigger: 'action', x: 19, y: GZ.dams[0], label: '鹽壩', run: (S) => H.melt(S, 1) },
        { id: 'dam2', trigger: 'action', x: 19, y: GZ.dams[1], label: '鹽壩', run: (S) => H.melt(S, 2) },
        { id: 'dam3', trigger: 'action', x: 19, y: GZ.dams[2], label: '鹽壩', run: (S) => H.melt(S, 3) },
        { id: 'potholes', trigger: 'action', x: 15, y: 25, label: '調查', run: async (S) => {
          await S.say('', '崖壁上布滿了圓形的壺穴，燕子在洞口進進出出。');
        } },
        { id: 'trail', trigger: 'touch', x: 26, y: 18, once: true, run: async (S) => {
          await S.say('', '（Watan 走在最前。單格寬的路，左邊是直立的崖壁，右邊是深谷。）');
          await S.say('Watan', '這條路，是我們祖先走出來的。');
          await S.say('Watan', '他們沒有記號的時候，也是一步一步走過來的。');
          await S.say('xinghe:think', '……');
        } },
        { id: 'boss', trigger: 'touch', x: 20, y: 10, w: 7, h: 1, if: (st) => !st.flags.ch10_colossus_defeated, run: (S) => H.colossus(S) },
      ],
      onEnter: async () => {
        gzApply(G.mapScene);
        if (!F('ch10_colossus_defeated')) H.monsters([[21, 7, 'gorge_colossus', 0, 0.42]]);
      },
    });
  })();

  H.muntjac = async (S) => {
    await S.say('', '一隻山羌被困在白色的鹽殼裡，後腿動不了。牠看著你們，一動也不敢動。');
    const c = await S.choice(['用心火融開鹽殼', '不管'], { cancel: 1 });
    if (c !== 0) return;
    S.sfx('fire');
    await S.say('', '（星河小心地把手放在鹽殼上。鹽殼一點一點化開。）');
    S.emote('gz_muntjac', '!');
    await S.move('gz_muntjac', 'UU', { speed: 6 });
    await S.say('', '（山羌掙脫了，看了隊伍一眼，跳上崖壁消失了。）');
    S.remove('gz_muntjac');
    await S.say('Watan', '……牠今天不是要被打的獵物。你做得對。');
    S.flag('ch10_freed_muntjac');
  };

  H.colossus = async (S) => {
    S.bgm('tension');
    S.spawn({ id: 'cw', sprite: 'c10_truku_m', x: 24, y: 11, dir: 'up' });
    await S.camera(21, 7, 0.8);
    await S.say('', '（峽谷最窄處，一個由大理石塊與黑色鹽殼堆成的巨人，把溪水整個堵住。）');
    await S.say('', '（它的胸口有一個空洞，洞裡塞滿了被推上來的溺魂的藍光。上游的水是碧綠的，下游是黑的。）');
    await S.say('石巨靈', '……過……不……去……過……不……去……');
    S.cameraFollow();
    await S.say('yungui:serious', '它也在喊。被逆潮推上山的魂，找不到出海的路，全卡在它身體裡。');
    await S.say('Watan', '它把山的水跟海的水分開了。下面的山羌、魚、鳥，都喝不到水。');
    await S.say('xinghe:serious', '那就讓水過去。讓那些魂也過去。');
    await S.battle('boss_colossus', { intro: H.colossusRules, bgmAfter: 'taroko' });
    H.monsters([]);
    S.shake(6, 1.2); S.sfx('earth');
    await S.say('', '（石巨靈的身體一塊一塊崩落，落進潭裡。碧綠的溪水衝過缺口，把黑水往下游推去。）');
    S.flag('ch10_colossus_defeated');
    gzApply(G.mapScene);
    H.lightsStart(21, 7, 30, 2, { vy: 30, vx: 0 });
    await S.say('', '（胸口的藍光被水流帶著，一路往溪口、往海、往黑潮漂去。）');
    S.particles(['motes', 'leaves']);
    S.sfx('sing');
    await S.say('', '（峽谷裡，鳥開始叫了。）');
    H.lightsStop();
    S.face('cw', 'up');
    await S.say('Watan', '（看著水）……水回來了。');
    await S.give('c10_marbleheart', 1);
    await S.give('c10_ac_shiwen', 1);
    H.days(25);
    await S.say('Watan', '從這裡沿著上面的獵徑，可以直接回部落。走吧。');
    S.remove('cw');
    H.objective(S, '回到部落');
    await S.fadeOut(1.0);
    V().c10_truku_time = 'night';
    await S.warp('truku_village', 20, 12, 'left', { fade: 0.01, stayDark: true });
  };

  // ---------------------------------------------------------------- C10-14 火堆旁・橋是走出來的
  H.c10_14 = async (S) => {
    if (V().c10_truku_time !== 'night') {
      V().c10_truku_time = 'night';
      await S.warp('truku_village', 20, 12, 'left', { reload: true, fade: 0.3, stayDark: true });
    }
    S.bgm(null);
    S.spawn({ id: 'iwan_n', sprite: 'truku_elder', x: 17, y: 10, dir: 'down' });
    S.spawn({ id: 'watan_n', sprite: 'c10_truku_m', x: 19, y: 10, dir: 'down' });
    S.spawn({ id: 'chenbo_n', sprite: 'chenbo', x: 19, y: 12, dir: 'left' });
    H.place(S, 17, 12, 'right');
    S.setPos('hongying', 18, 13, 'up'); S.setPos('yungui', 17, 13, 'up'); S.setPos('yuyuan', 16, 12, 'right');
    await S.camera(18, 11, 0.01);
    await S.fadeIn(1.0);
    await S.say('', '（火堆。Iwan 坐在火邊，Watan 在烤肉，分成一份一份。陳伯也上山來了，坐在一旁。）');
    S.face('watan_n', 'iwan_n');
    await S.say('', '（Watan 把最好的一份先給 Iwan，然後一份一份分給隊伍，最後才是自己。）');
    S.face('watan_n', 'down');
    await S.say('', '（Watan 又切了兩小塊，放在芋圓和麻糬面前。）');
    await S.say('xinghe:surprise', '牠們也有？');
    await S.say('Watan', '牠們也走了一樣的路。');
    await S.say('', '（芋圓把肉吃完，默默把頭靠在 Watan 的腳邊。）');
    await S.wait(1.0);
    await S.say('', '（安靜了一會。）');
    await S.say('Iwan', '孩子。你可以再問我一次了。');
    await S.say('', '（星河看著火。）');
    await S.say('xinghe:sad', '……我們那邊的說法是，每個人死了，都會變成一盞燈。');
    await S.say('xinghe:sad', '燈會漂過海，漂到彼岸去。');
    await S.say('xinghe:sad', '可是我沒有。我生下來的時候就死過一次了。是別人把她的火分了一點給我，我才活下來。');
    await S.say('xinghe:sad', '所以我沒有自己的燈。');
    await S.say('xinghe:cry', '如果我死了……是不是連橋都看不到？是不是哪裡都去不了？');
    S.face('hongying', 'down');
    await S.say('', '（紅纓轉過頭去。雲歸放下手上的肉。陳伯閉上眼睛。）');
    await S.say('Iwan', '（輕輕笑了）孩子。');
    S.bgm('love');
    await S.say('Iwan', '我生下來的時候，臉上也什麼都沒有。');
    await S.say('xinghe:surprise', '……');
    await S.say('Iwan', '沒有人是帶著紋面出生的。');
    await S.say('Iwan', '祖靈不看你生下來的時候有什麼。祂們看的是你這一輩子，怎麼走路。');
    if (F('ch10_saved_watan')) await S.say('Iwan', '瓦旦說，你今天替他擋了石頭。');
    if (F('ch10_freed_muntjac')) await S.say('Iwan', '你放了一隻山羌。不是你的獵物，你沒拿。');
    if (F('ch10_tao_xindeng')) await S.say('Iwan', '你們身上有海那邊的人給的東西。他們不會隨便給人。');
    await S.say('Iwan', '你守了我們的規矩。你沒有拿不是你的東西。');
    await S.say('Iwan', '橋，是走出來的。不是生出來的。');
    S.emote('player', '💧');
    await S.say('', '（星河的眼淚掉下來。他低下頭，肩膀在抖。）');
    S.face('hongying', 'up');
    await S.say('hongying:cry', '（伸手，用力揉亂星河的頭髮）……笨蛋。哭什麼。');
    await S.say('yungui:smile', '（遞上酒葫蘆）……喝一口。今天准你。');
    await S.say('Iwan', '不過——');
    await S.say('Iwan', '你們漢人過不過我們的彩虹橋，我就不知道了。');
    await S.say('Iwan', '說不定你們有你們自己的橋。我沒去過，不亂說。');
    await S.say('xinghe:laugh', '（一邊哭一邊笑）……依旺奶奶好誠實。');
    await S.say('Iwan', '我只知道一件事。好好活的人，不管走哪一條路，路都會認得他。');
    await S.say('chenbo:sad', '（低聲，自言自語）……我划了一輩子船，送別人過去。');
    await S.say('chenbo:sad', '自己過不過得去，從來沒想過。');
    S.face('iwan_n', 'chenbo_n');
    await S.say('Iwan', '（看陳伯一眼）你也一樣。老人家，你的路也走得不錯。');
    await S.say('chenbo:surprise', '……');
    S.face('iwan_n', 'down');
    await S.say('', '（Iwan 從織布機上剪下一段剛織好的布帶——紅色的底，織著白色的菱形紋。）');
    await S.say('Iwan', '給那個沒有記號的孩子。');
    await S.say('Iwan', '這不是紋面。這是我織的布。你綁著，記得今天。');
    await S.give('c10_ac_iwan', 1);
    await S.say('xinghe:serious', '（雙手接過）……Mhuway su。');
    await S.say('Iwan', '（一愣，然後笑了）你學得很快。');
    S.flag('ch10_xinghe_turn');
    // dawn: the rainbow over the gorge mouth (look only)
    await S.fadeOut(1.2);
    S.remove('iwan_n'); S.remove('watan_n'); S.remove('chenbo_n');
    V().c10_truku_time = 'dawn';
    V().c10_rainbow = 1;
    await S.warp('truku_village', 31, 19, 'down', { reload: true, fade: 0.01, stayDark: true });
    S.spawn({ id: 'watan_d', sprite: 'c10_truku_m', x: 30, y: 18, dir: 'down' });
    S.setPos('hongying', 32, 18, 'down'); S.setPos('yungui', 33, 19, 'down'); S.setPos('yuyuan', 30, 19, 'down');
    S.bgm('mountain');
    await S.camera(31, 23, 0.01);
    await S.fadeIn(1.4);
    await S.say('', '（峽谷口。昨夜下過一陣雨，溪水碧綠，水氣蒸騰。）');
    S.sfx('lantern');
    await S.say('', '（太陽一出來，一道彩虹從峽谷這一頭跨到那一頭。）');
    await S.say('Watan', '……祖靈今天心情好。');
    await S.say('xinghe:normal', '（看著彩虹，握著手腕上的織帶）');
    await S.say('xinghe:serious', '（我會好好走。走到我能過去為止。）');
    await S.say('xinghe:smile', '（……然後，把她也一起帶過去。）');
    S.cameraFollow();
    await H.xunjing(S, 5);
    S.remove('watan_d');
    S.flag('ch10_rainbow_seen');
    S.quest('q_c10_main', 3);
    V().c10_truku_time = undefined;
    V().c10_rainbow = 0;
    await S.fadeOut(0.6);
    await S.warp('truku_village', 31, 18, 'up', { reload: true, fade: 0.01 });
    S.gather();
    H.objective(S, '回王船，乘黑潮北上前往頭城');
  };

  // ---------------------------------------------------------------- C10-15 中元夜・水燈與生日麵線 / C10-16 插敘・玄武嶼
  H.zhongyuan = async (S) => {
    await S.say('chenbo:normal', '往北。……今晚先在蘇澳外面停一停。');
    await S.fadeOut(0.8);
    S.bgm('sad');
    V().c10_deck = 'night';
    H.days(15);
    await S.warp(DECK, 14, 6, 'down', { reload: true, fade: 0.01, stayDark: true });
    S.bgm('sad');
    S.setPos('chenbo', 15, 7, 'down'); S.setPos('hongying', 13, 7, 'down'); S.setPos('yungui', 16, 6, 'down'); S.setPos('yuyuan', 12, 6, 'down');
    const lanterns = [[11, 8], [13, 8], [15, 8], [17, 8]].map(([x, y]) => H.addObj({ t: 'water_lantern', x, y, tag: 'deckwl', solid: false }));
    await S.narrate(['七月十五。中元。'], { veil: 1 });
    await S.camera(14, 7, 0.01);
    await S.fadeIn(1.0);
    await S.say('', '（王船停在蘇澳外的海上。夜空沒有月亮，海面平得像鏡子。遠方的海岸上，一點一點的燈火——各地的普渡。）');
    await S.say('', '（甲板上擺著幾盞小小的水燈——紙糊的，竹篾骨架，是陳伯這幾天用船上的材料做的。）');
    await S.say('chenbo:normal', '去年今天，九份放水燈頭。');
    await S.say('xinghe:normal', '嗯。……然後白芷就漂回來了。');
    await S.say('chenbo:normal', '今年在海上，就在海上放。一人一盞。');
    const float = async (i) => {
      const o = lanterns[i];
      o.y += 2; o.x -= 2 - i; await S.wait(0.25); o.y += 1;
      G.mapScene.computeSolid();
    };
    await S.say('', '（雲歸拿起一盞，在燈上寫字：「清虛」。）');
    await S.say('yungui:normal', '……師父，你那麼愛面子，這盞小了點，將就吧。');
    S.sfx('splash');
    await float(0);
    await S.say('', '（雲歸把水燈放進海裡。燈漂走了。）');
    await S.say('', '（紅纓拿起一盞，寫了「洛青鋒」三個字。她寫得很慢。）');
    if (F('ch9_hongying_song')) {
      await S.say('hongying:sad', '阿順伯說……會叫他名字，就會唱。');
      await H.fmove(S, 'hongying', 'D');
      await S.say('', '（紅纓站到船舷邊，對著黑暗的海——）');
      await S.say('hongying:cry', '哥——！');
      await S.say('hongying:cry', '洛——青——鋒——！');
      await S.wait(0.8);
      await S.say('', '（海面很靜。過了一會，遠處好像有一點點光閃了一下。也許只是星星的倒影。）');
      await S.say('hongying:cry', '……他聽到了吧。');
      await S.say('xinghe:sad', '聽到了。');
    }
    S.sfx('splash');
    await float(1);
    await S.say('', '（紅纓把水燈放下。燈漂得很遠很遠。）');
    await S.say('', '（陳伯拿起最後一盞，寫了兩個字：「念兒」。）');
    await S.say('xinghe:surprise', '陳伯……那是……');
    await S.say('chenbo:sad', '夜玄的女兒。夜念。');
    await S.say('chenbo:sad', '她的燈被關在罐子裡二十年了。我替她放一盞。');
    await S.say('chenbo:sad', '不知道她看不看得到。……就當是告訴她，外面還有人記得她，不是只有她爹。');
    S.sfx('splash');
    await float(2);
    await S.say('', '（陳伯把燈放進海裡。）');
    await S.say('xinghe:normal', '那我——');
    await S.say('', '（星河拿著空白的燈，想了很久。最後寫了兩個字：「等我」。）');
    await S.say('yungui:smile', '寫給誰的？');
    await S.say('xinghe:shy', '……燈知道就好。');
    S.sfx('splash');
    await float(3);
    V().c10_wl = 1;
    await S.camera(15, 10, 1.4);
    await S.say('', '（四盞水燈漂在黑色的海上，越漂越遠，越漂越遠。）');
    S.emote('mochi', '…');
    await S.say('', '（麻糬坐在船舷上，一直望著水燈漂去的西邊。去年中元，牠是第一個看見白芷漂回來的。）');
    await S.fadeOut(0.8);
    H.removeObj('deckwl');
    // birthday 麵線
    H.addObj({ t: 'table', x: 14, y: 5, tag: 'bday' });
    H.place(S, 14, 6, 'up');
    S.setPos('hongying', 15, 6, 'left'); S.setPos('yungui', 13, 6, 'right'); S.setPos('yuyuan', 13, 5, 'right'); S.setPos('chenbo', 16, 5, 'left');
    S.cameraFollow();
    S.bgm('love');
    await S.fadeIn(0.8);
    await S.say('', '（甲板上，一張小桌子。）');
    await S.say('hongying:shy', '那個……今天也是你生日吧。');
    await S.say('xinghe:surprise', '欸？');
    await S.say('hongying:shy', '陳伯說，你是中元被撿到的。所以中元就是你的生日。');
    await S.say('', '（紅纓端出一碗麵線。上面有豬腳。麵線……是黑色的，結成一大塊。）');
    await S.say('hongying:normal', '豬腳麵線。');
    await S.say('yungui:think', '麵線怎麼會焦掉……我研究過那麼多奇怪的東西，這個我真的不懂……麵線是用煮的啊……');
    await S.say('hongying:shy', '……我用炒的。');
    await S.say('', '（星河拿起筷子，夾了一大口。）');
    await S.say('xinghe:normal', '（嚼）……');
    await S.say('', '（紅纓看著他。看著看著，眼淚突然掉下來。）');
    await S.say('hongying:cry', '……我以前，也給哥哥煮過生日麵。');
    await S.say('hongying:cry', '也是焦的。他吃了一口就說，紅纓，妳以後嫁不出去。');
    await S.say('hongying:cry', '我哭了一整天……他後來偷偷把整碗都吃完了。');
    await S.say('hongying:cry', '我現在才知道……他那時候是吃完的……');
    await S.say('', '（星河沒說話，低頭把麵線一口一口吃完。連湯都喝光了。）');
    await S.say('xinghe:smile', '好吃。比去年好吃。');
    await S.say('hongying:cry', '……去年你又沒吃過。');
    await S.say('xinghe:laugh', '那就是比沒吃過好吃。');
    await S.say('hongying:cry', '……笨蛋。');
    await S.say('', '（紅纓用袖子擦臉，笑了。）');
    await S.say('yungui:smug', '（遞上一個小布包）生日禮物。');
    await S.say('xinghe:surprise', '雲歸也有？');
    await S.say('', '（打開——一朵乾燥的靈芝。）');
    await S.say('yungui:smug', '太魯閣峽谷撿的。……騙你的，我守了 Gaya，沒拿。這是去年在觀音山採的，珍藏版。');
    S.emote('yuyuan', '♥');
    await S.say('', '（芋圓用頭把半條飛魚乾推到星河面前。另外半條，看起來已經被吃掉了。）');
    await S.say('', '（陳伯從艙裡拿出一盞燈籠。九份陳記燈籠舖的式樣：紅紙、竹骨，上面一筆一筆寫著三個字——「沈星河」。）');
    await S.say('chenbo:normal', '給你。');
    await S.say('xinghe:surprise', '……陳伯。');
    await S.say('chenbo:serious', '你沒有魂燈。我一直知道。從撿到你那天就知道。');
    await S.say('chenbo:serious', '這十八年，我最怕的，不是你過不了彼岸。');
    await S.say('chenbo:sad', '是哪天，你比我先走。');
    await S.say('chenbo:normal', '這不是魂燈。是燈籠。我做的。');
    await S.say('chenbo:smile', '可是上面有你的名字。……一個做燈籠的老頭子，只能給你這個。');
    await S.say('', '（星河抱著燈籠，說不出話。）');
    await S.say('xinghe:cry', '……陳伯，你這樣，我麵線都要吐出來了。');
    await S.say('chenbo:angry', '吐出來就給我吃回去！');
    await S.say('', '（大家笑了。燈籠的光，和船頭燈的光，照在甲板上。）');
    await S.give('c10_xinghe_lantern', 1);
    S.flag('ch10_zhongyuan'); S.flag('ch10_birthday');
    H.removeObj('bday');
    // C10-16 插敘・玄武嶼
    await S.fadeOut(1.0);
    await H.xuanwu(S);
    // back on the deck
    V().c10_deck = 'night';
    await S.warp(DECK, 14, 6, 'left', { reload: true, fade: 0.01, stayDark: true });
    S.setPos('hongying', 13, 6, 'right'); S.setPos('chenbo', 4, 6, 'right');
    S.bgm('sad');
    await S.fadeIn(0.8);
    S.emote('mochi', '♪');
    await S.say('', '（船舷上的麻糬忽然豎起耳朵，朝西邊輕輕叫了一聲。）');
    S.emote('player', '!');
    S.face('player', 'left');
    await S.say('xinghe:surprise', '……剛剛，是不是有人在唱歌？');
    await S.say('hongying:think', '沒有啊？');
    await S.say('xinghe:smile', '……嗯。大概是風。');
    V().c10_deck = undefined;
    V().c10_wl = 0;
    await S.fadeOut(0.6);
    await H.sail(S, 'toucheng');
  };

  // =================================================================================================
  // MAP: c10_xuanwu_room 插敘：玄武嶼內室
  // =================================================================================================
  (function xuanwuRoom() {
    const g = new Grid(14, 10, 'Y');
    g.rect(0, 0, 14, 2, 'U'); g.rect(0, 0, 1, 10, 'U'); g.rect(13, 0, 1, 10, 'U'); g.rect(0, 9, 14, 1, 'U');
    g.rect(6, 1, 2, 1, 'K');
    g.set(7, 9, 'Y');
    const objs = [
      { t: 'soul_jar', x: 1, y: 2 }, { t: 'soul_jar', x: 2, y: 2 }, { t: 'soul_jar', x: 3, y: 2 }, { t: 'soul_jar', x: 10, y: 2 }, { t: 'soul_jar', x: 11, y: 2 }, { t: 'soul_jar', x: 12, y: 2 },
      { t: 'soul_jar', x: 1, y: 6 }, { t: 'soul_jar', x: 1, y: 7 }, { t: 'soul_jar', x: 12, y: 6 }, { t: 'soul_jar', x: 12, y: 7 }, { t: 'soul_jar', x: 1, y: 4 }, { t: 'soul_jar', x: 12, y: 4 },
      { t: 'table', x: 6, y: 4 }, { t: 'chair', x: 7, y: 3, dir: 'down' }, { t: 'eternal_lamp', x: 4, y: 2 }, { t: 'eternal_lamp', x: 9, y: 2 },
      { t: 'rug', x: 5, y: 5, w: 4, h: 2 },
    ];
    G.Maps.define('c10_xuanwu_room', {
      name: '玄武嶼', subtitle: '點滿魂燈罐的石室', bgm: 'villain', noSave: true, autosave: false,
      start: [7, 7],
      light: { ambient: 0.6, color: '#04060e', playerR: 0, player: false },
      particles: ['motes'],
      tiles: g.rows(), objects: objs,
    });
  })();
  H.xuanwu = async (S) => {
    const party = G.state.party.slice();
    await S.warp('c10_xuanwu_room', 7, 8, 'up', { fade: 0.01, stayDark: true, noAutosave: true });
    S.hideFollowers(true);
    S.show('player', false);
    S.bgm('villain', { fade: 1.5 });
    S.spawn({ id: 'bz', sprite: 'baizhi', x: 6, y: 3, dir: 'up', ghost: false, alpha: 0.75 });
    const bz = G.mapScene.actor('bz'); if (bz) bz.alpha = 0.72;
    S.spawn({ id: 'yx', sprite: 'yexuan', x: 7, y: 8, dir: 'up' });
    await S.camera(7, 4, 0.01);
    await S.fadeIn(1.2);
    await S.say('', '（一間點滿藍色魂燈罐的石室。窗外是黑色的海。白芷坐在窗邊，比上次見到時更透明了一點。）');
    await S.move('yx', 'UUU', { speed: 1.6 });
    S.face('yx', 'left');
    S.face('bz', 'right');
    await S.say('', '（夜玄端著一個碗走進來，放在她面前。是芋圓。）');
    await S.say('yexuan:normal', '九份的芋圓。我讓人從北邊帶來的。……路遠，涼了，請見諒。');
    await S.say('baizhi:surprise', '……你怎麼知道我喜歡這個？');
    await S.say('yexuan:normal', '妳在睡夢裡說過。');
    await S.say('', '（白芷吃了一口。）');
    await S.say('baizhi:smile', '……好吃。');
    await S.say('baizhi:sad', '可是我想不起來，第一次吃的時候，是誰坐在我旁邊。');
    await S.say('yexuan:sad', '……');
    await S.say('baizhi:normal', '夜玄。你每天都想念兒嗎？');
    await S.say('yexuan:normal', '每一天。');
    await S.say('baizhi:sad', '我每想起一件事，就會變得更透明一點。');
    await S.say('baizhi:sad', '你每天想她……你自己，是不是也越來越透明了？');
    S.face('yx', 'up');
    await S.say('', '（夜玄沒有回答。他看著窗外的海。）');
    await S.say('', '（海的另一邊，遠到看不見的地方，有四點很小很小的光，正在漂。）');
    S.face('bz', 'up');
    await S.say('baizhi:think', '……今天是中元吧。');
    S.sfx('sing');
    await S.say('', '（白芷輕輕哼起渡魂謠。夜玄閉上眼睛，沒有阻止她。）');
    await S.fadeOut(1.4);
    S.remove('bz'); S.remove('yx');
    S.show('player', true);
    S.hideFollowers(false);
    void party;
  };

  // =================================================================================================
  // MAP: toucheng 頭城（含烏石港）
  // =================================================================================================
  const TC = { pole: [3, 12], ayiPole: [8, 18] };
  (function toucheng() {
    const W = 56, HH = 44;
    const g = new Grid(W, HH, '.');
    g.line([[0, 5], [44, 5]], '#', 2);
    g.line([[23, 0], [23, 16]], '#', 2);
    g.line([[3, 7], [3, 14]], ':', 1);
    g.rect(4, 16, 42, 22, ':');                          // 普渡場
    g.rect(8, 18, 22, 4, '%');                           // altar area paving
    g.rect(32, 21, 12, 9, '%');                          // around the 孤棚
    g.rect(44, 0, 1, 44, 's'); g.rect(45, 0, 3, 44, 's');
    g.rect(44, 3, 5, 10, 'k');                           // 烏石港 dock
    for (let y = 0; y < HH; y++) { const e = 48 + Math.round(Math.sin(y * 0.4) * 0.6) + (y >= 3 && y <= 12 ? 1 : 0); for (let x = e; x < W; x++) g.set(x, y, x === e ? '-' : x > e + 3 ? 'w' : '~'); }
    g.rect(44, 3, 5, 10, 'k');
    g.rect(0, 40, 46, 4, 'p');                           // rice fields (closed)
    g.rect(22, 38, 3, 2, ':');
    const objs = [
      // north of the main street
      { t: 'house_minnan', x: 0, y: 0, v: 1 }, { t: 'shophouse', x: 6, y: 1, door: 1, text: '雜貨' }, { t: 'shophouse', x: 11, y: 1, door: 1, text: '武具', v: 2 },
      { t: 'house_minnan', x: 16, y: 0, v: 0 }, { t: 'house_minnan', x: 26, y: 0, v: 1, text: '客棧' }, { t: 'signboard', x: 31, y: 3, text: '客棧' }, { t: 'shophouse', x: 33, y: 1, door: 1, v: 3 },
      { t: 'house_minnan', x: 38, y: 0, v: 0 },
      // south of the main street
      { t: 'stall', x: 6, y: 9, text: '蕉絲' }, { t: 'laundry', x: 9, y: 9 },
      { t: 'house_minnan', x: 12, y: 8, v: 1 }, { t: 'stall', x: 18, y: 11, text: '糕渣' }, { t: 'stall', x: 26, y: 11, text: '米粉羹' },
      { t: 'house_minnan', x: 30, y: 8, v: 0 }, { t: 'house_jiufen', x: 36, y: 8 },
      { t: 'pillar', x: TC.pole[0], y: TC.pole[1] }, { t: 'signboard', x: 4, y: 12, text: '練習' },
      { t: 'well', x: 20, y: 8 }, { t: 'bamboo', x: 0, y: 8 }, { t: 'bamboo', x: 0, y: 11 }, { t: 'tree_banyan', x: 0, y: 30 }, { t: 'bamboo', x: 1, y: 35 },
      { t: 'lantern_string', x: 6, y: 4, w: 6 }, { t: 'lantern_string', x: 25, y: 4, w: 6 }, { t: 'lantern_string', x: 34, y: 4, w: 6 },
      // 普渡場
      ...[10, 13, 16, 19, 22, 25].map((x) => ({ t: 'altar', x, y: 19 })),
      { t: 'c10_denggao', x: TC.ayiPole[0], y: TC.ayiPole[1], tag: 'ayipole', name: '', blueable: true },
      { t: 'c10_denggao', x: 30, y: 18, blueable: true },
      { t: 'incense_burner', x: 18, y: 22 }, { t: 'incense_burner', x: 21, y: 22 },
      { t: 'guzhao', x: 36, y: 23 },
      { t: 'brazier', x: 33, y: 22 }, { t: 'brazier', x: 42, y: 22 }, { t: 'brazier', x: 33, y: 28 }, { t: 'brazier', x: 42, y: 28 },
      { t: 'brazier', x: 6, y: 24 }, { t: 'brazier', x: 28, y: 24 }, { t: 'brazier', x: 6, y: 33 }, { t: 'brazier', x: 28, y: 33 },
      { t: 'bench', x: 10, y: 35 }, { t: 'bench', x: 15, y: 35 }, { t: 'crate', x: 30, y: 31 }, { t: 'barrel', x: 31, y: 31 },
      { t: 'banner', x: 34, y: 31, text: '烏石港', color: '#2f6ac0' }, { t: 'banner', x: 41, y: 31, text: '打馬煙', color: '#2f8a4a' }, { t: 'banner', x: 11, y: 31, text: '阿坤', color: '#c8302a' },
      // harbour
      { t: 'boat_small', x: 49, y: 8 }, { t: 'boat_small', x: 50, y: 4 }, { t: 'boat_small', x: 50, y: 16 }, { t: 'dock_post', x: 48, y: 3 }, { t: 'dock_post', x: 48, y: 12 },
      { t: 'fishing_net', x: 45, y: 15 }, { t: 'wang_boat', x: 49, y: 21, water: true },
      H.crate('tc_dock', 46, 12, [['gold', 3000]], { line: '碼頭邊的木箱，上面寫著：「搶孤隊用」……裡面是隊伍的盤纏。阿坤說：「拿去，你們是我們的隊員。」' }),
      Object.assign(H.crate('tc_basket', 4, 13, [['c10_gaozha', 2]], { line: '練習油柱旁的竹簍，裡面放著兩塊糕渣。' }), { t: 'basket', v: 2 }),
    ];
    const deco = [];
    scatter(deco, g, 'flowers', [0, 7, 44, 9], ['.'], 0.03, 101);
    scatter(deco, g, 'tallgrass', [0, 16, 4, 24], ['.'], 0.25, 102);
    const occ = objs.flatMap((o) => cellsOf(o.x, o.y, o.w || (G.Objects.get(o.t) || {}).w || 1, o.h || (G.Objects.get(o.t) || {}).h || 1));
    const clean = objs.concat(clearCells(deco, occ));
    const time = (st) => st.vars.c10_tc_time;
    const night = (st) => time(st) === 'eve' || time(st) === 'pudu';
    G.Maps.define('toucheng', {
      name: '頭城', subtitle: '蘭陽平原・烏石港', place: 'toucheng',
      bgm: (st) => (time(st) === 'pudu' ? 'toucheng' : time(st) === 'eve' ? 'night' : 'south'),
      start: [46, 9],
      light: (st) => (time(st) === 'pudu' ? { ambient: 0.6, color: '#0a0a24', playerR: 190 } : time(st) === 'eve' ? { ambient: 0.62, color: '#080c26', playerR: 190 } : { ambient: 0.1, color: '#283040', tint: 'rgba(255,190,120,0.1)' }),
      particles: (st) => (time(st) === 'pudu' ? ['lanterns', 'embers'] : time(st) === 'eve' ? ['lanterns'] : ['wind']),
      tiles: g.rows(), objects: clean,
      drawOver: (ctx, t) => H.drawLights(ctx, t),
      npcs: [
        { id: 'tc_akun', sprite: 'fisherman', name: '阿坤', x: 12, y: 30, dir: 'down', talk: (S) => H.akunTalk(S), if: (st) => time(st) !== 'pudu' },
        { id: 'tc_taoist', sprite: 'taoist', name: '黃道長', x: 17, y: 21, dir: 'up', talk: (S) => H.taoistTalk(S), if: (st) => time(st) !== 'pudu' },
        { id: 'tc_kavalan', sprite: 'kavalan_f', name: '蕉絲阿姨', x: 8, y: 10, dir: 'down', talk: (S) => H.kavalanTalk(S), if: (st) => time(st) !== 'pudu' },
        { id: 'tc_food', sprite: 'fisher_f', name: '糕渣攤阿嬸', x: 20, y: 11, dir: 'down', talk: (S) => H.foodTalk(S), if: (st) => !night(st) },
        { id: 'tc_food2', sprite: 'shopkeeper_f', name: '米粉羹攤', x: 28, y: 11, dir: 'down', talk: async (S) => {
          await S.say('米粉羹攤', '米粉羹！稠稠的，配一塊糕渣最好！');
          await S.shop(['c10_gaozha', 'c10_mifengeng', 'c10_pudugao'], { title: '頭城小吃' });
        }, if: (st) => !night(st) },
        { id: 'tc_shop', sprite: 'merchant', name: '雜貨店頭家', x: 7, y: 4, dir: 'down', talk: async (S) => {
          await S.say('雜貨店頭家', '普渡要用的、搶孤要吃的，這裡都有。');
          await S.shop(['c10_gaozha', 'c10_mifengeng', 'huanhunxiang', 'c10_baicao', 'c10_pudugao', 'c10_quxiefu', 'xiangbao'], { title: '頭城雜貨' });
        }, if: (st) => !night(st) },
        { id: 'tc_arms', sprite: 'villager_m', name: '武具舖頭家', x: 12, y: 4, dir: 'down', talk: async (S) => {
          await S.say('武具舖頭家', '蘭陽平原的鐵，打出來的劍最直。');
          await S.shop(['c10_sw_lanyang', 'c10_fn_haishen', 'c10_ac_yujia', 'c10_ar_jiaosi'], { title: '頭城武具' });
        }, if: (st) => !night(st) },
        { id: 'tc_inn', sprite: 'maid', name: '客棧夥計', x: 28, y: 3, dir: 'down', talk: (S) => H.tcInn(S), if: (st) => time(st) !== 'pudu' },
        { id: 'tc_rival1', sprite: 'sailor', name: '烏石港隊隊長', x: 35, y: 30, dir: 'left', talk: ['阿坤，你們隊只剩三個人，還帶一隻貓？今年頭旗是我們的啦！'], if: (st) => time(st) !== 'pudu' },
        { id: 'tc_rival2', sprite: 'villager_m2', name: '打馬煙隊隊長', x: 42, y: 30, dir: 'left', talk: ['打馬煙隊今年練了半年。誰先上棚，誰就是頭旗！'], if: (st) => time(st) !== 'pudu' },
        { id: 'tc_kids', sprite: 'child_m', name: '頭城囝仔', x: 22, y: 14, dir: 'down', wander: 2, talk: ['搶孤的時候，上面的人會把供品丟下來！搶到粽子的人一年都平安！', '我阿公說，那個龜山島是一隻大烏龜，在顧宜蘭。'], if: (st) => !night(st) },
        { id: 'tc_worker', sprite: 'villager_m2', name: '搭棚的工人', x: 40, y: 27, dir: 'up', wander: 1, talk: ['孤棚要搭得穩。十二根孤柱，一根都不能歪。'], if: (st) => !time(st) },
        { id: 'tc_old', sprite: 'old_f', name: '阿嬤', x: 15, y: 13, dir: 'down', wander: 1, talk: ['普渡要拜得澎湃，好兄弟吃飽了，才不會來鬧。'], if: (st) => !night(st) },
        { id: 'tc_ayi', sprite: 'ghost_m', ghost: true, name: '阿義', x: TC.ayiPole[0], y: TC.ayiPole[1] + 1, dir: 'up', talk: (S) => H.ayiTalk(S),
          if: (st) => time(st) === 'eve' && !st.flags.ch10_ayi_lantern_ready && !st.flags.ch10_pudu_defended },
      ],
      warps: [],
      events: [
        { id: 'c10_17', trigger: 'auto', if: (st) => !st.flags.ch10_toucheng_arrive, run: (S) => H.c10_17(S) },
        { id: 'c10_18', trigger: 'auto', if: (st) => st.vars.c10_tc_time === 'pudu' && !st.flags.ch10_shunfeng_flag, run: (S) => H.c10_18(S) },
        { id: 'boat', trigger: 'action', x: 49, y: 8, w: 2, label: '舢舨', run: async (S) => {
          if (F('ch10_qianggu_team') && V().c10_tc_time === 'pudu') return;
          const c = await S.choice(['划舢舨回王船', '留在頭城'], { cancel: 1 });
          if (c === 0) await H.toDeck(S);
        } },
        { id: 'south', trigger: 'touch', x: 22, y: 39, w: 3, h: 1, run: async (S) => {
          await S.say('', '南邊是一望無際的稻田。這條路今天不用走。');
          await S.move('player', 'U');
        } },
        { id: 'pole', trigger: 'action', x: TC.pole[0], y: TC.pole[1], label: '調查', run: async (S) => {
          await S.say('', '練習用的油柱，抹滿了牛油，摸起來滑溜溜的。');
          if (F('ch10_qianggu_team')) await S.say('', '（跟阿坤說一聲，就可以練習。）');
        } },
        { id: 'ayipole', trigger: 'action', x: TC.ayiPole[0], y: TC.ayiPole[1], label: '燈篙', run: async (S) => {
          if (F('ch10_ayi_met') && S.hasItem('c10_ayi_lantern') && !F('ch10_ayi_lantern_ready')) {
            const c = await S.choice(['把燈籠掛上燈篙', '先不要'], { cancel: 1 });
            if (c !== 0) return;
            S.take('c10_ayi_lantern', 1);
            const o = G.mapScene.objects.find((x) => x.tag === 'ayipole');
            if (o) o.name = '阿義';
            S.sfx('lantern');
            await S.say('', '（寫著「阿義」的燈籠，掛上了燈篙。在一排燈裡亮著。）');
            S.flag('ch10_ayi_lantern_ready');
            S.quest('q_c10_luohanjiao', 2);
            return;
          }
          await S.say('', '高高的燈篙。燈越高，好兄弟越看得到這裡有普渡。');
          if (F('ch10_ayi_lantern_ready')) await S.say('', '燈篙上，「阿義」的燈籠亮著。');
        } },
        { id: 'guzhao', trigger: 'action', x: 36, y: 25, w: 4, label: '孤棚', run: async (S) => {
          await S.say('', '孤棚。下面十二根孤柱，上面一座一座的孤棧，綁滿了供品。孤棧頂上，插著順風旗。');
        } },
        { id: 'altars', trigger: 'action', x: 10, y: 19, w: 17, label: '普渡壇', run: async (S) => {
          await S.say('', '普渡壇。雞、鴨、魚、粽子、米糕、糕渣、水果，一桌接一桌。');
          await S.say('yungui:normal', '先請好兄弟吃。人，等一下。');
        } },
      ],
      onEnter: async () => {
        const ms = G.mapScene;
        const o = ms.objects.find((x) => x.tag === 'ayipole');
        if (o && F('ch10_ayi_lantern_ready')) o.name = '阿義';
      },
    });
  })();

  H.akunTalk = async (S) => {
    if (!F('ch10_qianggu_team')) { await S.say('阿坤', '孤棚還在搭。搶孤，七月底！'); return; }
    const opts = ['練習（油柱）', '準備好了', '聊天', '還沒'];
    const c = await S.choice(opts, { cancel: 3 });
    if (c === 0) {
      await S.say('阿坤', '好！先練上孤柱。不計輸贏，抓手感！');
      const r = await G.Mini.mash({ title: '練習・油柱', hint: '連按 Z 往上爬！（練習，不計輸贏）', time: 12, need: 36, rivals: [{ name: '阿坤', rate: 3.4 }] });
      await S.say('阿坤', r ? '不錯喔！手很穩！' : '牛油很滑吧？爬三下就要抹一次！');
    } else if (c === 1) {
      await S.say('阿坤', '好！七月廿九夜，普渡完就搶孤！');
      await S.fadeOut(1.0);
      V().c10_tc_time = 'pudu';
      await S.warp('toucheng', 14, 27, 'up', { reload: true, fade: 0.01, stayDark: true });
    } else if (c === 2) {
      const lines = ['搶孤靠的是隊伍。一個人再強，爬到一半就沒力。五個人，一條心。', '以前有人摔死過，官府也禁過好幾次。所以我們拚的是隊伍，不是拚命。', '搶到順風旗的船，一整年出海都順風。漁夫最需要的就是這個。'];
      await S.say('阿坤', lines[(V().c10_akun_i = ((V().c10_akun_i || 0) + 1)) % 3]);
    }
  };
  H.taoistTalk = async (S) => {
    if (F('ch10_pudu_defended')) { await S.say('黃道長', '你唸得比我好。……不要跟別人說。'); return; }
    await S.say('黃道長', '普渡是請好兄弟吃飯。先讓他們吃飽，人才吃。搶孤，是送他們走前的最後一場熱鬧。');
    if (!F('c10_taoist_met')) {
      S.flag('c10_taoist_met');
      await S.say('黃道長', '（看著雲歸）太虛觀的？清虛真人的弟子？……你師父的普渡科儀，是全台灣最漂亮的。');
      await S.say('yungui:shy', '……他聽到會很得意。');
    }
  };
  H.kavalanTalk = async (S) => {
    const lines = ['這是香蕉絲織的布。把香蕉樹的莖剝開，抽絲，一條一條織起來。', '我們噶瑪蘭人在這片平原住了很久很久。現在很多親戚搬到南邊花蓮那邊去了。', '龜山島？從這片平原，哪裡都看得到它。我們出海的人，看到它就知道回家的方向。'];
    const i = (V().c10_kav_i = ((V().c10_kav_i || 0) + 1)) % 3;
    await S.say('蕉絲阿姨', lines[i]);
    if (!F('c10_kav_yungui')) { S.flag('c10_kav_yungui'); await S.say('蕉絲阿姨', '（對雲歸）你的衣服顏色很漂亮。可惜料子不好，下次來買我的布。'); }
    await S.shop(['c10_ar_jiaosi', 'c10_hd_jiaosi', 'c10_ft_jiaosi'], { title: '蕉絲阿姨的布攤' });
  };
  H.foodTalk = async (S) => {
    await S.say('糕渣攤阿嬸', '糕渣！外面酥、裡面燙，宜蘭辦桌一定有。小心燙嘴！');
    if (!F('c10_gaozha_burn')) {
      S.flag('c10_gaozha_burn');
      S.emote('yuyuan', '💢');
      await S.say('', '（芋圓趁人不注意叼走一塊糕渣——然後整隻貓跳了起來。）');
      await S.say('糕渣攤阿嬸', '就說小心燙嘴了嘛。');
    }
    await S.shop(['c10_gaozha', 'c10_mifengeng', 'c10_pudugao'], { title: '糕渣攤' });
  };
  H.tcInn = async (S) => {
    await S.say('客棧夥計', '住一晚一百二十文。這幾天普渡，房間不多喔。');
    const ok = await S.inn(120, { who: '客棧夥計' });
    if (!ok) return;
    const was = V().c10_tc_time;
    V().c10_tc_time = was === 'eve' ? undefined : 'eve';
    await S.fadeOut(0.4);
    await S.warp('toucheng', 28, 4, 'down', { reload: true, fade: 0.01 });
    S.toast(V().c10_tc_time === 'eve' ? '夜深了。燈篙上的燈亮著。' : '天亮了。', 'lantern');
  };
  H.ayiTalk = async (S) => {
    if (F('ch10_ayi_met')) {
      if (S.hasItem('c10_ayi_lantern')) await S.say('阿義', '……那就是我的名字？寫得真好。掛上去吧，掛在燈篙上。');
      else await S.say('阿義', '……真的會有一盞燈，寫我的名字？');
      return;
    }
    await S.say('阿義', '……好亮。這麼多年，第一次有燈照到我。');
    await S.say('xinghe:normal', '阿伯？');
    await S.say('阿義', '我叫阿義。……少年仔，你看得到我？');
    await S.say('阿義', '我是從唐山一個人過來的。羅漢腳，沒娶某，沒生囝。');
    await S.say('阿義', '來這裡開墾，砍樹、挖圳。有一年颱風，在烏石港落水，就沒了。');
    await S.say('阿義', '沒有人給我燒香。沒有人記得我叫什麼。每年普渡，我都擠在最後面。');
    await S.say('阿義', '今年海上推來好多跟我一樣的……我擠不進去了。');
    await S.say('xinghe:sad', '……我也不知道我爸媽是誰。');
    await S.say('阿義', '（看著他）……那你也是羅漢腳的囝仔？');
    await S.say('xinghe:smile', '大概吧。可是我有一個做燈籠的老頭子撿我回去。');
    await S.say('xinghe:serious', '阿伯，我幫你做一盞燈。上面寫你的名字。掛在燈篙上。');
    await S.say('xinghe:serious', '這樣每個來普渡的人，都會看到「阿義」。');
    await S.say('阿義', '……真的？');
    S.flag('ch10_ayi_met');
    S.quest('q_c10_luohanjiao', 0);
    H.objective(S, '（支線）請陳伯做一盞燈籠（王船甲板）');
  };

  // ---------------------------------------------------------------- C10-17 頭城
  H.c10_17 = async (S) => {
    V().c10_place = 'toucheng'; V().c10_port = 'toucheng';
    S.quest('q_c10_main', 3);
    H.days(4);
    S.bgm('south');
    await S.narrate(['七月廿六，頭城。'], { veil: 1 });
    H.place(S, 45, 9, 'right');
    S.setPos('hongying', 45, 8, 'right'); S.setPos('yungui', 45, 10, 'right'); S.setPos('yuyuan', 46, 10, 'right');
    S.setPos('tc_kids', 44, 7, 'right');
    S.spawn({ id: 'tc_chenbo', sprite: 'chenbo', x: 46, y: 8, dir: 'right' });
    await S.camera(50, 10, 0.01);
    await S.fadeIn(0.8);
    await S.say('', '（烏石港。港外，一座像烏龜一樣的島浮在海上。）');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '那座島……像一隻大烏龜！');
    await S.say('頭城囝仔', '那是龜山島！我阿公說牠在顧宜蘭！');
    await S.fadeOut(0.6);
    H.place(S, 30, 30, 'right');
    S.setPos('hongying', 29, 29, 'right'); S.setPos('yungui', 29, 31, 'right'); S.setPos('yuyuan', 30, 31, 'right');
    S.setPos('tc_chenbo', 29, 30, 'right');
    S.setPos('tc_kids', 22, 14, 'down');
    S.setPos('tc_akun', 34, 27, 'down');
    await S.camera(37, 25, 0.01);
    await S.fadeIn(0.6);
    await S.say('', '（普渡場上，工人們正在搭一座巨大的木架：十幾根粗大的木柱撐起高高的平台，平台上豎著一座座竹編的高塔，塔身綁滿供品。）');
    await S.say('xinghe:surprise', '好高……那是什麼？');
    S.cameraFollow();
    await S.walkTo('tc_akun', 32, 29);
    S.face('tc_akun', 'left');
    await S.say('阿坤', '（從工人中走出來，大嗓門）孤棚！沒看過吼？');
    await S.say('阿坤', '下面十二根是孤柱，上面那一座一座的是孤棧。孤棧頂上，插著順風旗。');
    await S.say('阿坤', '七月底，普渡完了，好兄弟吃飽了，就搶孤！');
    await S.say('阿坤', '五個人一隊，爬上抹滿牛油的孤柱，翻上孤棚，再爬上孤棧，把順風旗搶下來！');
    await S.say('阿坤', '搶到順風旗的船，一整年出海都順風。');
    await S.say('chenbo:normal', '……順風旗。');
    await S.say('yungui:think', '陳伯，你在想什麼？');
    await S.say('chenbo:serious', '從這裡到澎湖，要繞過北邊的雞籠，再沿著西邊南下。');
    await S.say('chenbo:serious', '七月廿九晚上搶孤，七月三十晚上關鬼門。');
    await S.say('chenbo:serious', '一天一夜，人的船是到不了的。……可是若有順風旗，王船也許可以。');
    await S.say('xinghe:serious', '阿坤大哥！我們要參加搶孤！');
    await S.say('阿坤', '（上下打量）……你們？外地人？');
    await S.say('阿坤', '……其實，我們隊本來五個人。前幾天晚上海邊有孤魂鬧，兩個被抓傷了，爬不了。');
    await S.say('阿坤', '我們隊只剩我一個能爬的，加上兩個在下面撐的也不行了。');
    await S.say('阿坤', '你們來剛好。不過我話說在前面——');
    await S.say('阿坤', '以前有人從上面摔死過，官府也禁過好幾次。搶孤靠的是隊伍，不是拚命。');
    await S.say('阿坤', '誰要是逞英雄不顧隊友，我第一個把他踢下去。');
    await S.say('hongying:smug', '放心。我們隊最會的，就是顧隊友。');
    await S.say('阿坤', '好！那你們三個，加我，四個。……還差一個。');
    await S.say('yungui:smug', '（指著芋圓）牠。牠坐下去的時候，比石獅子還穩。');
    S.emote('yuyuan', '…');
    await S.say('', '（芋圓抬起頭，嘴裡叼著牠的小繡球。）');
    await S.say('阿坤', '……貓算不算一個人？');
    await S.say('hongying:smile', '算。牠比我們任何一個都會顧星河。');
    await S.say('阿坤', '……算！'); 
    S.remove('tc_chenbo');
    S.setPos('tc_akun', 12, 30, 'down');
    S.flag('ch10_toucheng_arrive'); S.flag('ch10_qianggu_team');
    S.gather();
    H.objective(S, '搶孤前準備（阿坤在普渡場西南；可練習油柱）');
  };

  // ---------------------------------------------------------------- C10-18 普渡之夜・孤魂眾
  H.c10_18 = async (S) => {
    S.bgm('toucheng');
    const ms = G.mapScene;
    // crowds, torches, the priest
    const crowd = [[8, 24, 'villager_m'], [9, 25, 'villager_f'], [12, 24, 'old_m'], [14, 25, 'child_f'], [17, 25, 'villager_f2'], [20, 24, 'villager_m2'], [23, 25, 'old_f'], [26, 24, 'child_m'],
      [31, 26, 'fisherman'], [34, 32, 'sailor'], [37, 32, 'villager_m2'], [40, 32, 'fisherman'], [44, 26, 'villager_m'], [44, 24, 'villager_f'], [7, 30, 'villager_m2'], [10, 33, 'old_m']];
    crowd.forEach(([x, y, sp], i) => S.spawn({ id: 'cr' + i, sprite: sp, x, y, dir: 'up', light: i % 3 === 0 ? { r: 120, color: '#ffae5a' } : undefined }));
    S.spawn({ id: 'taoist', sprite: 'taoist', x: 18, y: 21, dir: 'up' });
    S.spawn({ id: 'akun', sprite: 'fisherman', x: 15, y: 27, dir: 'up' });
    S.spawn({ id: 'chenbo_t', sprite: 'chenbo', x: 12, y: 28, dir: 'up' });
    H.place(S, 14, 26, 'up');
    S.setPos('hongying', 13, 26, 'up'); S.setPos('yungui', 16, 26, 'up'); S.setPos('yuyuan', 15, 26, 'up');
    await S.narrate(['七月廿九，夜。'], { veil: 1 });
    await S.camera(18, 21, 0.01);
    await S.fadeIn(1.0);
    await S.say('', '（夜。普渡場上燈火通明，普渡壇上擺滿了供品：雞、鴨、魚、粽子、米糕、糕渣、水果，一桌接一桌。）');
    await S.say('', '（燈篙上的燈在風中搖。數百人舉著火把圍在孤棚四周。）');
    S.sfx('bell');
    await S.say('', '（黃道長站在壇前，搖著法鈴唸誦。）');
    await S.say('黃道長', '……普施無祀孤魂，各歸本位，飽餐一頓，莫再流連……');
    await S.say('yungui:normal', '（低聲）普渡科儀。請好兄弟先吃飽，人才吃。');
    await S.say('yungui:think', '師父以前每年都唸。我每年都在旁邊打瞌睡。');
    S.particles(['mist']);
    for (const o of ms.objects) if (o.blueable) o.blue = true;
    S.light({ ambient: 0.68, color: '#04081e' });
    S.sfx('ghost');
    await S.say('', '（風停了。燈篙上的燈忽然全部變成藍色。）');
    const ghosts = [];
    for (let i = 0; i < 14; i++) {
      const x = 32 + (i % 7) * 2, y = 18 + Math.floor(i / 7) * 13;
      ghosts.push('gh' + i);
      S.spawn({ id: 'gh' + i, sprite: ['ghost_m', 'ghost_f', 'ghost_child'][i % 3], ghost: true, x: Math.min(x, 46), y, dir: 'left' });
    }
    await S.camera(36, 24, 1.0);
    await S.say('', '（海的方向，傳來一陣嗚咽。灘頭、港口、田裡，一個、十個、幾百個灰白的影子湧進普渡場——比往年多得多，瘦得只剩骨架，眼睛是空的。）');
    await S.say('民眾', '好兄弟……好兄弟來了……怎麼這麼多……');
    ghosts.forEach((id, i) => S.move(id, i % 2 ? 'LL' : 'L', { wait: false, speed: 2 }));
    await S.say('', '（孤魂沒有走向普渡壇——它們直接撲向孤棚，要把孤棧上的供品扯下來。黃道長被撞倒在地。）');
    S.shake(5, 0.5);
    S.camera(18, 22, 0.6);
    S.setPos('taoist', 18, 22, 'down');
    await S.say('黃道長', '（摀著胸口）……它們……餓瘋了……逆潮把海上的無主孤魂全推過來了……');
    await S.say('阿坤', '孤棚！不能讓它們把孤棚拉倒！');
    S.cameraFollow();
    await S.say('xinghe:serious', '雲歸！');
    await S.say('yungui:serious', '……我知道。');
    await S.say('', '（雲歸撿起黃道長掉在地上的法鈴。）');
    S.sfx('bell');
    await S.say('yungui:serious', '我來唸。你們幫我擋住，讓它們聽得到。');
    S.learn('yungui', 'yg_pudu');
    await S.say('阿坤', '拿去給好兄弟！');
    await S.give('c10_pudu_offering', 6);
    if (F('ch10_ayi_met') && !F('ch10_ayi_lantern_ready')) await S.say('', '（燈篙下，那個瘦小的孤魂已經不見了。也許擠進了人群裡。）');
    await S.battle('t_c10_guhun', { intro: H.guhunRules, bgmAfter: 'toucheng' });
    const left = G.Inv.count('c10_pudu_offering');
    if (left) S.take('c10_pudu_offering', left);
    S.sfx('bell');
    await S.say('', '（雲歸搖著法鈴，唸完最後一句。孤魂們一個一個停下來，轉頭，看向普渡壇。）');
    await S.say('yungui:serious', '……吃吧。這是給你們的。吃飽了，就上路。');
    ghosts.forEach((id, i) => S.setPos(id, 10 + (i % 7) * 3, 18 + (i % 2 ? 2 : 3), 'up'));
    for (const o of ms.objects) if (o.blueable) o.blue = false;
    S.light({ ambient: 0.6, color: '#0a0a24' });
    S.particles(['lanterns', 'embers']);
    await S.say('', '（孤魂們走向普渡壇，在供品前坐下。燈篙的燈從藍色慢慢變回暖黃。）');
    S.setPos('taoist', 17, 22, 'right');
    await S.say('黃道長', '（被扶起來）……清虛真人的弟子。你唸得比我好。');
    await S.say('黃道長', '……不要跟別人說。');
    await S.say('yungui:smile', '（低頭看著法鈴）……師父，我總算有一次沒打瞌睡。');
    S.flag('ch10_pudu_defended');
    await S.give('c10_puduash', 1);
    // §4.4 ending
    if (F('ch10_ayi_lantern_ready')) {
      await S.camera(8, 18, 1.0);
      const o = ms.objects.find((x) => x.tag === 'ayipole'); if (o) o.name = '阿義';
      S.spawn({ id: 'ayi', sprite: 'ghost_m', ghost: true, x: 8, y: 19, dir: 'up' });
      await S.say('', '（燈篙上，一盞寫著「阿義」的燈，在一排燈裡亮著。）');
      ghosts.forEach((id) => S.remove(id));
      await S.say('', '（吃完普渡的孤魂們一個個起身離開。阿義站在燈篙下，抬頭看著自己的名字。）');
      await S.say('阿義', '……阿義。');
      await S.say('阿義', '（笑）幾十年了，第一次有人把我的名字寫這麼大。');
      await S.say('阿義', '少年仔，你的字寫得真好。');
      await S.say('xinghe:smile', '我是燈籠舖的學徒啊。');
      await S.say('阿義', '……多謝。我吃飽了。我要走了。');
      H.lightsStart(8, 18, 1, 0.2, { vy: -60, vx: 0 });
      await S.fadeActor('ayi', 0, 1.0);
      S.remove('ayi');
      await S.say('', '（阿義化成一點光，順著燈篙往上，飛進夜空。）');
      await S.lantern('xd_luohanjiao', '羅漢腳阿義');
      H.lightsStop();
      S.flag('ch10_luohanjiao_done');
      S.quest('q_c10_luohanjiao', 'done');
      S.cameraFollow();
    }
    ghosts.forEach((id) => S.remove(id));
    await S.say('阿坤', '（看著時辰香）……時辰到了。');
    S.sfx('gong');
    S.shake(3, 0.4);
    await S.say('', '（一聲大鑼。全場安靜。）');
    await S.say('阿坤', '搶——孤——！');
    await H.c10_19(S);
  };

  // ---------------------------------------------------------------- C10-19 搶孤
  H.c10_19 = async (S) => {
    await S.camera(37, 22, 0.8);
    const res = await H.qianggu(S);
    let first = res.first;
    const climberIsCat = res.climber === 'yuyuan';
    if (!first) {
      await S.say('烏石港隊隊長', '頭旗是我們的啦！');
      await S.say('阿坤', '不要緊！我們的孤棧也有旗！上去拿！');
      await S.say('', '（攀頂者抓住自家孤棧上的順風旗。）');
      await S.give('key_flag', 1);
      for (;;) {
        const c = await S.choice(['再挑戰頭旗（回想剛才那一段，重新再來）', '這樣就好'], { cancel: 1 });
        if (c !== 0) break;
        const again = await H.qianggu(S, { roles: res.roles, skipTo: 3 });
        if (again.first) { first = true; await S.give('c10_ac_touqi', 1); S.flag('ch10_qianggu_first'); await S.say('阿坤', '頭旗——！是我們的！'); break; }
        await S.say('阿坤', '差一點！');
      }
    } else {
      S.sfx('levelup');
      S.flash('#ffe8a0', 0.4, 0.6);
      await S.say('', '（攀頂者抓住順風旗，高高舉起。全場爆出歡呼，炮仗齊響。）');
      if (climberIsCat) {
        await S.say('', '（芋圓咬著順風旗的竿子，一屁股坐在孤棧頂端，怎麼叫都不肯下來。）');
        S.emote('yuyuan', '…');
        await S.say('', '（全場大笑。）');
      }
      await S.say('阿坤', '頭旗——！是我們的！');
      await S.say('烏石港隊隊長', climberIsCat ? '……可惡，被一隻貓搶先。' : '……被外地人搶先。');
      await S.give('key_flag', 1);
      await S.give('c10_ac_touqi', 1);
      S.flag('ch10_qianggu_first');
    }
    S.cameraFollow();
    await S.say('', '（隊伍和阿坤抱著順風旗回到地面。阿坤把旗子塞到星河懷裡。）');
    await S.say('阿坤', '順風旗是給要出海的人的。');
    await S.say('阿坤', '今年全頭城最需要順風的，是你們。');
    await S.say('xinghe:serious', '……阿坤大哥，謝謝。');
    await S.say('阿坤', '謝什麼！明年再來，跟我搶頭旗！');
    S.flag('ch10_shunfeng_flag');
    S.quest('q_c10_main', 4);
    await S.fadeOut(1.0);
    V().c10_tc_time = undefined;
    V().c10_deck = 'dawn';
    await S.warp(DECK, 14, 6, 'right', { reload: true, fade: 0.01, stayDark: true });
  };

  // ---------------------------------------------------------------- C10-20 龜山島黎明（章末）
  H.c10_20 = async (S) => {
    S.bgm('voyage');
    H.place(S, 18, 6, 'right');
    S.setPos('hongying', 17, 5, 'right'); S.setPos('yungui', 17, 7, 'right'); S.setPos('yuyuan', 16, 6, 'right'); S.setPos('chenbo', 4, 6, 'right');
    H.days(0);
    V().objective = '今夜　關鬼門';
    await S.camera(16, 6, 0.01);
    await S.fadeIn(1.2);
    await S.say('', '（七月三十，黎明。王船停在烏石港外。順風旗插上桅頂，在晨風中飄。）');
    S.toast('今夜　關鬼門', 'lantern');
    await S.say('', '（海上的霧慢慢散開。龜山島從霧裡浮出來，被朝陽染成金色。）');
    await S.say('蕉絲阿姨', '（在港邊，對著船揮手）看到龜山島，就是到家了——！');
    await S.say('xinghe:normal', '……到家了。');
    S.face('hongying', 'player');
    await S.say('hongying:normal', '星河，你的家在哪？九份？');
    await S.say('xinghe:think', '嗯……九份。');
    S.face('player', 'left');
    await S.say('xinghe:smile', '（看著紅纓、雲歸、芋圓、麻糬、陳伯）……可是，好像不只九份了。');
    await S.say('yungui:smug', '肉麻。');
    await S.say('', '（芋圓打了個呵欠，往艙口走去——廚房的方向。麻糬靠在星河腳邊，望著西邊的海。）');
    S.bgm('love');
    await S.say('', '（陳伯把手放在舵上。）');
    await S.say('chenbo:serious', '坐穩了。');
    S.face('player', 'right');
    await S.say('', '（星河把船眼護符、船頭燈、順風旗看了一遍。）');
    await H.xunjing(S, 6);
    S.sfx('wind');
    S.particles(['wind', 'wind']);
    await S.say('', '（風從東邊吹來——不是普通的風。帆鼓滿了，順風旗筆直地指向北方。）');
    await S.say('chenbo:serious', '千歲爺說，繞完一圈，才能渡。');
    await S.say('chenbo:serious', '……繞完了。');
    await S.say('', '（王船轉向。往北，再往西。速度快得像在海面上飛。）');
    await S.travel('toucheng', 'badouzi', { label: '掠過三貂角，掠過雞籠……', dur: 3.2 });
    await S.narrate(['正午，王船經過八斗子外海。', '去年中元，星河從水燈裡被撿起來的地方；白芷乘著水燈頭漂上岸的地方。'], { veil: 0.9 });
    await S.narrate(['山上，九份的屋頂與紅燈籠，小小的，在陽光下。'], { veil: 0.9 });
    await S.say('xinghe:normal', '……陳伯。九份。');
    await S.say('chenbo:normal', '嗯。');
    await S.say('', '（陳伯沒有轉頭。可是他的手在舵上，握得很緊。）');
    await S.say('xinghe:serious', '（九份，我出門一年了。）');
    await S.say('xinghe:serious', '（我繞了一整座島。每一個地方，都有人借了一點光給我。）');
    await S.say('xinghe:serious', '（白芷。我現在要去還了。）');
    await S.say('', '（王船向西，駛向黑水溝的方向。）');
    S.bgm('title');
    await S.fadeOut(1.2);
    await S.narrate(['第十章　後山巡境　完'], { veil: 1 });
    S.flag('ch10_end'); S.flag('ch10_done');
    S.quest('q_c10_main', 'done');
    V().c10_deck = undefined;
    V().objective = '';
    await G.Story.next(S, 11);
  };

  // =================================================================================================
  // chapter entry
  // =================================================================================================
  G.Story.ch10 = async (S) => {
    S.chapter(10);
    const st = G.state;
    // party: 星河・紅纓・雲歸 + the silent cats 芋圓 / 麻糬; 白芷 is away; 陳伯 is the helmsman (non-combat guest on the map)
    for (const id of ['xinghe', 'hongying', 'yungui']) if (!st.party.includes(id)) G.Party.join(id, 34);
    if (st.party.includes('baizhi')) G.Party.leave('baizhi');
    st.party = ['xinghe', 'hongying', 'yungui'].concat(st.party.filter((p) => !['xinghe', 'hongying', 'yungui'].includes(p)));
    for (const id of ['xinghe', 'hongying', 'yungui']) G.Story.ensureLevel(id, 34);
    // standalone start (?debug&startch=10): bring the party to the state a finished chapter 9 leaves them in
    if (!st.flags.ch9_end) {
      G.Party.learnSkill('xinghe', 'xh_xinhuo_ran'); G.Party.learnSkill('xinghe', 'xh_xinhuo_zhao'); G.Party.learnSkill('xinghe', 'xh_xinhuo_bumie');
      G.Party.learnSkill('hongying', 'hy_luojia'); G.Party.learnSkill('yungui', 'yg_taixu');
      const gear = { xinghe: { weapon: 'sw_jinggu', armor: 'ar_bishui', head: 'hd_yunjin', feet: 'ft_talang', acc: 'ac_redstring' },
        hongying: { weapon: 'sp_shaya', armor: 'ar_bishui', head: 'hd_shanhu', feet: 'ft_talang', acc: 'ac_armguard' },
        yungui: { weapon: 'fn_haifeng', armor: 'ar_bishui', head: 'hd_yunjin', feet: 'ft_talang', acc: 'ac_gourd' } };
      for (const id in gear) { const m = st.members[id]; if (m) { Object.assign(m.equip, gear[id]); const s = G.Party.stats(id); m.hp = s.mhp; m.mp = s.mmp; } }
      for (const [it, n] of [['key_yinhunling', 1], ['key_oar', 1], ['key_lighthouse', 1], ['wuyuzi', 5], ['yinghuaxia', 3], ['huanhunxiang', 5], ['jiuzhuan', 2], ['mijiu', 5], ['aiyu', 4]]) if (!G.Inv.count(it)) G.Inv.add(it, n);
      st.gold = Math.max(st.gold, 4000);
      st.flags.yuyuan_joined = true; st.flags.mochi_joined = true;
      st.vars.days_to_gate = 86;
      st.vars.xunjing = Math.max(st.vars.xunjing || 0, 2);
      for (const p of ['jiufen', 'tainan', 'takao', 'donggang', 'hengchun', 'eluanbi']) G.World.visit(p);
    }
    V().c10_deck = undefined;
    await S.titleCard(G.Chapters[10], '黑潮北上');
    await S.warp(DECK, 12, 6, 'right');
  };
})();
