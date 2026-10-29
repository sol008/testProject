'use strict';
// Dialogue overlay for story beats. A tap finishes the typewriter, or (when the page is complete) advances exactly one page.
// Line format: {who, text} | {who, emote}. Speakers' display names come from G.Data.cast.
(function () {
  const G = window.G;
  const R = G.Render;

  function DialogScene(lines, resolve) {
    this.name = 'dialog';
    this.opaque = false;
    this.lines = lines;
    this.i = 0;
    this.chars = 0;
    this.t = 0;
    this.resolve = resolve;
    this.appear = 0;
  }
  DialogScene.prototype.cur = function () { return this.lines[this.i]; };
  DialogScene.prototype.full = function () { const l = this.cur(); return !l.text || this.chars >= l.text.length; };
  DialogScene.prototype.input = function (ev) {
    if (ev.type !== 'up' && !(ev.type === 'key' && (ev.key === ' ' || ev.key === 'Enter'))) return;
    if (!this.full()) { this.chars = this.cur().text.length; return; }
    this.i++;
    this.chars = 0;
    G.Audio.play('tap');
    if (this.i >= this.lines.length) { G.Scenes.pop(); this.resolve(); return; }
    if (this.cur().who === 'bolt') G.Audio.play('beep');
  };
  DialogScene.prototype.update = function (dt) {
    this.t += dt;
    this.appear = Math.min(1, this.appear + dt * 5);
    const l = this.cur();
    if (l && l.text) this.chars = Math.min(l.text.length, this.chars + dt * 55);
  };
  DialogScene.prototype.draw = function (ctx) {
    const l = this.cur();
    if (!l) return;
    const a = G.U.ease.outCubic(this.appear);
    R.fill(ctx, 'rgba(60,40,30,' + (0.3 * a) + ')');
    const y0 = G.H + Math.min(R.padY, 60) - 300 + (1 - a) * 80;
    const who = l.who;
    const cast = (G.Data.cast || {})[who] || {};
    if (who !== 'narrator') {
      R.panel(ctx, 26, y0 - 120, 150, 150, { r: 75, fill: '#fff3df', lift: 6 });
      G.Clay.portrait(ctx, who, 101, y0 - 45, 120, this.t);
    }
    R.panel(ctx, 20, y0, G.W - 40, 250, { r: 28, lift: 8 });
    if (who !== 'narrator') {
      R.panel(ctx, 40, y0 - 22, 190, 44, { r: 22, fill: G.CONFIG.palette.accent, lift: 4 });
      R.text(ctx, cast.name || who, 135, y0, { size: 22, color: '#fff', weight: 900, maxW: 170 });
    }
    if (l.text) {
      R.wrap(ctx, l.text.slice(0, Math.floor(this.chars)), 48, y0 + 40, G.W - 96, { size: 25, lh: 34, color: G.CONFIG.palette.ink, weight: who === 'narrator' ? 600 : 700 });
    } else if (l.emote) {
      G.Clay.bolt(ctx, G.W / 2, y0 + 125, 150, { t: this.t, mood: l.emote });
    }
    if (this.full() && Math.sin(this.t * 6) > -0.3) {
      R.text(ctx, '▼', G.W - 60, y0 + 222, { size: 20, color: G.CONFIG.palette.inkSoft });
    }
  };

  const D = (G.Dialog = G.Dialog || {});
  D.play = function (lines) {
    if (!lines || !lines.length) return Promise.resolve();
    return new Promise((res) => G.Scenes.push(new DialogScene(lines, res)));
  };
  D.Scene = DialogScene;

  // Story beats: played once each, remembered in the save.
  const St = (G.Story = G.Story || {});
  St.seen = (id) => !!(G.state.story && G.state.story[id]);
  St.play = async function (id, force) {
    const beat = (G.Data.story || {})[id];
    if (!beat) { G.warnOnce('story ' + id); return; }
    if (St.seen(id) && !force) return;
    G.state.story[id] = 1;
    G.Save.save();
    await D.play(beat);
  };
})();
