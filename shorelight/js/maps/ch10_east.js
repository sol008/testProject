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
    c10_es_surge: { name: '破浪突襲', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 2.0, fx: 'bite', sfx: 'crit' },
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
    m: { hp: 5.6, atk: 2.2, mag: 2.1, def: 1.1, spd: 1.2, exp: 6, gold: 0.01 },
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
    const ai = sc.aiCommand.bind(sc), exec = sc.execute.bind(sc), dmgFn = sc.damage.bind(sc), phases = sc.checkPhases.bind(sc), hud = sc.drawHud.bind(sc);
    sc.damage = (tg, dmg, o = {}) => {
      if (tg !== boss) return dmgFn(tg, dmg, o);
      const fromParty = !o.attacker || o.attacker.side === 'party';
      if (fromParty && dmg > 0) {
        if (R.armor > 0) dmg = Math.max(1, Math.round(dmg * 0.5));
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
      if (mad && !R.mad) { boss.st.atkUp = 99; boss.st.magUp = 99; sc.popText(boss, '餓瘋了！', '#ff8a7a', -60); }
      if (!mad && R.mad) { delete boss.st.atkUp; delete boss.st.magUp; sc.popText(boss, '安靜了一點', '#c8e8ff', -60); }
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
  const QG_NAMES = { xinghe: '星河', hongying: '紅纓', yungui: '雲歸', tuanzi: '糰子' };
  //            力 底座  穩 中段  輕 攀頂  眼 看風
  const QG_STAT = { xinghe: [2, 3, 3, 2], hongying: [3, 2, 2, 1], yungui: [1, 2, 1, 3], tuanzi: [0, 1, 3, 2] };
  const QG_ROLES = ['底座', '中段', '攀頂', '看風'];
  async function qgRoles(S) {
    await S.say('阿坤', '五個人，一條心。底座要力氣大，中段要穩，攀頂要輕，看風要眼睛利。');
    await S.say('yungui:think', '紅纓在底下，星河爬上去，我看風。糰子……糰子在中間當墊子。');
    await S.say('tuanzi:angry', '💢');
    const c = await S.choice(['照雲歸說的排（紅纓底座・糰子中段・星河攀頂・雲歸看風）', '自己排站位'], { cancel: 0 });
    if (c === 0) return ['hongying', 'tuanzi', 'xinghe', 'yungui'];
    const left = ['xinghe', 'hongying', 'yungui', 'tuanzi'];
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
  // decorative (non-interactive) monsters shown during a cutscene: [[x, y, art, variant], ...]; [] clears them
  H.monsters = (list) => {
    const ms = G.mapScene;
    ms.enemies = ms.enemies.filter((e) => !e.c10show);
    for (const [x, y, art, variant] of list) {
      const a = new G.Mapx.Actor({ id: 'show_' + x + '_' + y, x, y, dir: 'left', def: { art, variant, chase: 0, radius: 0, troop: 't_c10_reef_a' }, c10show: true, stun: 0, homeX: x, homeY: y });
      a.wanderT = 999; a.stun = 0;
      ms.enemies.push(a);
    }
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
    S.setPos('hongying', 13, 7, 'up'); S.setPos('yungui', 17, 5, 'right'); S.setPos('tuanzi', 11, 7, 'right');
    S.hideFollowers(false);
    await S.narrate(['五月初五，端午。', '王船乘著黑潮，在南岬東邊的海上。'], { veil: 0.85 });
    await S.fadeIn(0.8);
    await S.move('yungui', 'R', { speed: 2.5 });
    S.face('yungui', 'up');
    await S.wait(0.4);
    S.sfx('push');
    H.addObj({ t: 'herbs_rack', x: 18, y: 4 });
    await S.move('yungui', 'RRR');
    S.face('yungui', 'up');
    await S.wait(0.3);
    H.addObj({ t: 'herbs_rack', x: 21, y: 4 });
    S.sfx('push');
    S.face('yungui', 'left');
    await S.say('yungui:normal', '端午，門口要掛艾草、菖蒲。船也是家。');
    await S.say('xinghe:think', '那王船的門在哪？');
    await S.say('yungui:think', '……船頭吧。');
    await S.say('tuanzi:smile', '本大爺覺得，門應該在廚房。');
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
      await S.say('', '（星河小心翼翼地把蛋立在甲板上——船一晃，蛋滾走了。一路滾到糰子嘴邊。）');
      S.emote('tuanzi', '♥');
      await S.jump('tuanzi');
      await S.say('', '（糰子一口吞掉。）');
      await S.say('xinghe:cry', '我的運氣！！');
      await S.say('tuanzi:smug', '（嚼）……本大爺幫你吃掉了。運氣在本大爺肚子裡，很安全。');
    } else {
      S.face('hongying', 'down');
      await S.say('', '（紅纓屏氣凝神。蛋穩穩地立在甲板上。船一晃——蛋還是立著。）');
      await S.say('hongying:smug', '哼。');
      await S.say('yungui:surprise', '……她連蛋都能鎮住。');
      S.emote('tuanzi', '!');
      await S.move('tuanzi', 'R', { speed: 6 });
      S.sfx('guard');
      await S.move('tuanzi', 'L', { speed: 6 });
      await S.say('', '（糰子撲過去——紅纓一腳把糰子擋開。）');
    }
    S.flag('ch10_egg');
    S.face('hongying', 'right'); S.face('player', 'left');
    await S.say('hongying:shy', '那個……我也有準備端午的東西。');
    await S.say('', '（紅纓端出一盤黑色的、還在冒煙的三角形物體。）');
    await S.say('xinghe:surprise', '……這是？');
    await S.say('hongying:normal', '粽子。');
    await S.say('yungui:think', '粽子要用水煮。這個……是烤的？');
    await S.say('hongying:shy', '用炭火比較快。');
    await S.say('tuanzi:sad', '本大爺第一次看到粽子焦掉。粽子怎麼會焦掉。');
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
    S.emote('tuanzi', '!');
    await S.say('tuanzi:surprise', '又是會飛的魚！本大爺今天一定要抓到一條！');
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
    await S.narrate(['深夜，雲歸在甲板上畫符。糰子趴在他腳邊睡著了。'], { veil: 1 });
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
    await S.say('Kaswal', '那隻胖胖的是什麼？山豬的小孩？');
    await S.say('tuanzi:angry', '本大爺是石虎！');
    await S.say('Kaswal', '石虎是什麼？可以吃嗎？');
    await S.say('tuanzi:cry', '為什麼大家都想吃本大爺！');
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
    S.setPos('hongying', 7, 18, 'up'); S.setPos('yungui', 9, 18, 'up'); S.setPos('tuanzi', 8, 19, 'up');
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
    await S.say('tuanzi:smile', '放心！本大爺最懂了，像那種鬼——');
    await S.move('hongying', 'R', { speed: 6 });
    S.emote('tuanzi', '💢');
    await S.say('', '（紅纓一把摀住糰子的嘴。）');
    await S.say('tuanzi:cry', '嗚嗚嗚嗚！');
    await S.say('Syapen', '……你的貓，比你們誠實。');
    await S.say('hongying:shy', '他、他不是貓——');
    await S.say('yungui:normal', '重點不是這個。');
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
    await S.say('', '（一個小男孩從曬架後面探出頭，盯著糰子看。）');
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
    await S.say('', '（Sinan 看了看紅纓的手。星河、雲歸、糰子同時開口——）');
    await S.say('xinghe:serious', '不行。');
    await S.say('yungui:serious', '不行。');
    await S.say('tuanzi:serious', '不行。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '💢 你們！');
    await S.say('Sinan', '（大笑）好，好。我懂了。妳坐著。');
    await S.fadeOut(0.5);
    S.sfx('fire');
    await S.wait(0.4);
    await S.fadeIn(0.5);
    // 曬架 (§5.2) — the one trust check
    S.setPos('tuanzi', 9, 11, 'left');
    await S.move('tuanzi', 'L', { speed: 1.5 });
    S.emote('tuanzi', '♪');
    await S.say('', '（吃完飯，糰子偷偷摸摸地爬向飛魚曬架……）');
    const c = await S.choice(['抓住糰子', '假裝沒看到']);
    if (c === 0) {
      await S.say('xinghe:angry', '糰子！規矩第一條！');
      await S.say('tuanzi:sad', '……本大爺只是想聞一下。');
      S.emote('tao_sinan', '♪');
      await S.say('', '（Sinan 點了點頭。）');
      H.trust(1);
    } else {
      S.emote('tao_sinan', '💢');
      await S.say('', '（Sinan 一把拎起糰子的後頸，丟回沙灘。）');
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
    await S.walkTo('hongying', 26, 23);
    S.face('hongying', 'right');
    await S.say('Kaswal', '……妳力氣好大。');
    await S.say('hongying:smile', '嗯。我是專門抱東西的。');
    await S.say('Kaswal', '（看著糰子）牠也會抱嗎？');
    await S.say('tuanzi:smug', '本大爺只會被抱。');
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
    S.setPos('hongying', 13, 17, 'up'); S.setPos('yungui', 11, 17, 'up'); S.setPos('tuanzi', 12, 17, 'up');
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
    S.setPos('hongying', 12, 17, 'down'); S.setPos('yungui', 14, 17, 'down'); S.setPos('tuanzi', 13, 16, 'down');
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
    await S.say('tuanzi:cry', '比鰻王還長！本大爺不要吃了！本大爺要回船上！');
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
    S.setPos('hongying', 14, 19, 'up'); S.setPos('yungui', 16, 19, 'up'); S.setPos('tuanzi', 17, 19, 'up');
    await S.fadeIn(0.8);
    await S.say('', '（早晨。Syaman 坐在破船旁，用左手和膝蓋固定一塊木板。Kaswal 在一旁幫忙扶。）');
    await S.say('', '（隊伍站在幾步之外，沒有靠近。）');
    await S.say('Syaman', '……你。紅衣服的。');
    await S.say('hongying:surprise', '我？');
    await S.say('Syaman', '過來。扶這塊。不要動。我說放才放。');
    await S.walkTo('hongying', 14, 17, { yFirst: true });
    S.face('hongying', 'up');
    S.sfx('push');
    await S.say('', '（紅纓走過去，雙手扶住木板。Syaman 用木釘一根一根把船板接回去，縫隙用植物纖維塞緊。他的動作很慢，但每一下都很準。）');
    S.face('syaman', 'down');
    await S.say('Syaman', '（對星河）你。那個桶子，給我。');
    await S.move('player', 'U');
    await S.say('', '（星河遞過去。雲歸和糰子在旁邊看。）');
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
    S.face('syapen', 'tuanzi');
    await S.say('Syapen', '（看著糰子）……大部分的時候。');
    await S.say('tuanzi:shy', '……');
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
    S.setPos('hongying', 12, 18, 'down'); S.setPos('yungui', 14, 18, 'down'); S.setPos('tuanzi', 15, 18, 'down');
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
    S.setPos('hongying', 19, 7, 'right'); S.setPos('yungui', 18, 6, 'right'); S.setPos('tuanzi', 19, 5, 'right');
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
