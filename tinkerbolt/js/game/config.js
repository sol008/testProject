'use strict';
// The only file holding game vocabulary. Engine code reads names, prices and keys from here.
(function () {
  const G = (window.G = window.G || {});
  G.CONFIG = {
    id: 'tinkerbolt',
    version: '0.3.0',
    title: { en: 'Tinker & Bolt' },
    subtitle: 'a cozy toy-shop puzzle',
    sourceLang: 'en',
    langs: ['en'],
    currency: { id: 'coins', name: 'coins', fmt: (n) => n + '' },
    collectible: { id: 'star', name: 'stars' },
    startCoins: 50,
    startBoosters: { hammer: 1, shuffle: 1, slot: 1 },
    coinsPerNewStar: 10,
    coinsPerReplayWin: 5,
    // Win-streak gift boxes (replaces the daily gift, change order v2). A streak counts first wins and star improvements.
    streak: { small: 3, bigEvery: 5, smallCoins: [20, 40], bigCoins: [50, 80], boosterChance: 0.5 },
    // Lives (change order v3).
    lives: { max: 5, regenMin: 20, refillPrice: 60 },
    // Daily login reward, 7-day cycle; `inf` = minutes of unlimited lives (v3).
    daily: [
      { inf: 15, coins: 20 }, { inf: 30, booster: 'hammer' }, { inf: 30, coins: 30 }, { inf: 45, booster: 'shuffle' },
      { inf: 45, booster: 'slot' }, { inf: 45, coins: 40 }, { inf: 60, coins: 60, booster: 'hammer' },
    ],
    // Continue after losing (v4): out of moves → +5 moves; stuck on screws → +1 tray slot. Paid in coins, allowed on hard levels too.
    continueOffer: { moves: 5, price: 50 },
    hardEvery: 5,
    hardCoinMul: 2,
    boosters: {
      hammer: { name: 'Hammer', price: 40, chapters: [1, 2], desc: { 1: 'Smash one candy', 2: 'Pull out any screw, even a covered one' } },
      shuffle: { name: 'Shuffle', price: 30, chapters: [1], desc: { 1: 'Mix up the candies' } },
      slot: { name: 'Extra slot', price: 40, chapters: [2], desc: { 2: '+1 tray slot for this level' } },
    },
    // Chapter → mechanic id (scene registry) and the restoration that unlocks it.
    chapters: {
      1: { title: 'Dust and Sweets', mechanic: 'match3', unlockedBy: null },
      2: { title: 'Good as New', mechanic: 'screws', unlockedBy: 'hang_sign' },
    },
    hintDelay: 6,
    boltVariant: 0,   // G2 design pick (index into G.Clay.BOLT_VARIANTS); default = recommended option
    font: { stack: '"Nunito", "Trebuchet MS", "Segoe UI", system-ui, sans-serif' },
    palette: {
      bg: '#f6e7d4', bgDeep: '#e8cfb3', ink: '#4a3428', inkSoft: '#7a5c4a',
      cream: '#fff8ee', accent: '#ff8c6b', mint: '#8fd8c4', gold: '#ffc85a', shadow: 'rgba(74,52,40,0.25)',
    },
    text: {
      win: 'All tidy!', stuck: 'Bolt is stuck', outOfMoves: 'Out of moves', retry: 'Try again', next: 'Next',
      home: 'Shop', play: 'Play', restore: 'Restore', level: 'Level %d', moves: 'Moves', goal: 'Goal',
    },
  };
})();
