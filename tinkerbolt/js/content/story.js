'use strict';
// Cast display names and every story beat (intro, tutorials, one beat per restoration, chapter end, ending).
// Speakers must be in docs/canon/speakers.json; Bolt is silent (emotes only).
(function () {
  const G = window.G;
  const D = (G.Data = G.Data || {});
  D.cast = {
    bolt: { name: 'Bolt' }, tinker: { name: 'Mr. Tinker' }, mina: { name: 'Mina' }, narrator: { name: '' },
  };
  const T = (text) => ({ who: 'tinker', text });
  const M = (text) => ({ who: 'mina', text });
  const N = (text) => ({ who: 'narrator', text });
  const B = (emote) => ({ who: 'bolt', emote });

  D.story = {
    intro: [
      N('Rain taps on the window of an old toy-repair shop. On the dusty workbench, something blinks.'),
      B('wow'),
      T('Well, I never! Bolt? You still work, after all these years?'),
      T('I closed the shop, you know. My hands got too shaky for the little screws.'),
      B('happy'),
      T('You want to fix it up? Ha! All right, little helper. One job at a time: loose screws, spilled candy, the lot.'),
    ],
    // tutorials (shown once, on the level that introduces each element)
    tut_swap: [T('Swap two neighbouring candies to line up three of a kind. Clear the candies the goal at the top asks for before you run out of moves.')],
    tut_specials: [T('Line up four for a rocket, an L or T shape for a bomb, and five in a row for a rainbow ball. Swap a rainbow ball with any candy!')],
    tut_dust: [T('See that grey dust under the candies? Clear the candy on top of a dusty square to sweep it away. Thick dust needs two.')],
    tut_crate: [T('Old crates! Make a match right next to one, or blast it, to break it open. Some take two hits.')],
    tut_twine: [T('Candies tied with twine can\'t be swapped. Match them where they are to snip the twine.')],
    tut_gear: [T('My lost gears! Clear the candies under a gear so it drops. Bring every gear down to the bottom row — look for the little arrows.')],
    tut_screws: [
      T('Everything in here is screwed shut, and rusty to boot.'),
      T('Tap a screw to take it out. It flies into the toolbox of its colour; a full toolbox of three is packed away.'),
      T('A plate drops once all its screws are out. A screw under another plate can\'t be reached yet.'),
      T('When a plate hangs from just one screw it swings. Drag it round to see what\'s behind it — it won\'t get in your way.'),
      T('Careful: if the tray fills right up, Bolt is stuck!'),
    ],
    tut_tray: [T('No toolbox for that colour yet? The screw waits in the tray below the boxes. If the tray fills up, you\'re stuck — so watch the "Next" boxes!')],
    tut_lock: [T('A padlocked screw won\'t budge until you take out the gold key screw. The key has a little gold ring.')],
    tut_hidden: [T('These old screws are so dusty I can\'t tell their colour. You\'ll see it once nothing covers them.')],
    tut_tether: [T('A plate tied with string stays up, even when it\'s empty, until the plate at the other end of the string falls.')],

    // one beat per restoration
    r_sweep_floor: [T('A clean floor! I can see the old planks again. My, they were pretty.')],
    r_fix_counter: [T('The candy counter, good as new. Mina\'s grandmother used to buy lemon drops here.')],
    r_wash_window: [T('Look at that sunshine come in. The whole street can see inside now.')],
    r_fix_shelves: [T('Shelves for the toys. Steady as a rock — you have a good eye, Bolt.')],
    r_light_lamps: [T('The lamps! I haven\'t seen this place glow in years.'), B('happy')],
    r_hang_sign: [T('"Tinker\'s." There it is. Straight, too!')],
    ch1_end: [
      N('Someone knocks on the clean window.'),
      M('Hello? Is the toy shop open again?'),
      T('Not quite yet, Mina. But soon, I think.'),
      M('Grandma left my music box here when I was little. Is it still here somewhere?'),
      T('Oh dear... It must be with the broken toys on the workbench. Bolt, shall we?'),
      B('happy'),
    ],
    ch2_intro: [T('Pip, Biscuit, Puff, Dottie and Gallop. All left here for repair, all those years ago. Let\'s open them up one by one.')],
    r_fix_pip: [N('Pip the wind-up duck waddles in a little circle.'), T('Quack quack! He still remembers how.')],
    r_fix_biscuit: [T('Biscuit, with a fresh green patch. Every bear needs a hug and a patch.')],
    r_fix_puff: [N('Puff the tin train toots and rolls along the floor.'), T('Toot toot! Mind the counter, Puff!')],
    r_fix_dottie: [T('A new dress for Dottie. Purple, like she always wanted.')],
    r_fix_gallop: [
      N('Inside Gallop\'s saddle bag, something jingles.'),
      T('Well, would you look at that. A little music box. Mina\'s music box!'),
      B('wow'),
    ],
    r_parade: [],
    ending: [
      N('Reopening day. The bell over the door rings and rings.'),
      N('Pip, Biscuit, Puff, Dottie and Gallop parade around the shop.'),
      M('My music box! It plays the same little tune Grandma used to hum!'),
      T('Everything here can be fixed, Mina. Toys, shops... even old toymakers.'),
      T('I\'ll need a new sign, I think. One that says "Tinker & Bolt."'),
      B('happy'),
      N('Thank you for playing Tinker & Bolt.'),
    ],
  };
})();
