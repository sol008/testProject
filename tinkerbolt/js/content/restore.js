'use strict';
// Restoration steps, in story order. `look` keys are read by the shop view (3D and 2D) to change the scene.
(function () {
  const G = window.G;
  const D = (G.Data = G.Data || {});
  D.restorations = [
    { id: 'sweep_floor', chapter: 1, cost: 2, name: 'Sweep up the dust', look: 'floor' },
    { id: 'fix_counter', chapter: 1, cost: 3, name: 'Mend the candy counter', look: 'counter' },
    { id: 'wash_window', chapter: 1, cost: 3, name: 'Wash the shop window', look: 'window' },
    { id: 'fix_shelves', chapter: 1, cost: 3, name: 'Rebuild the toy shelves', look: 'shelves' },
    { id: 'light_lamps', chapter: 1, cost: 3, name: 'Light the lamps', look: 'lamps' },
    { id: 'hang_sign', chapter: 1, cost: 4, name: 'Hang the shop sign', look: 'sign' },
    { id: 'fix_pip', chapter: 2, cost: 3, name: 'Wind up Pip the duck', look: 'pip' },
    { id: 'fix_biscuit', chapter: 2, cost: 3, name: 'Patch up Biscuit the bear', look: 'biscuit' },
    { id: 'fix_puff', chapter: 2, cost: 3, name: 'Get Puff the train puffing', look: 'puff' },
    { id: 'fix_dottie', chapter: 2, cost: 3, name: 'Sew Dottie a new dress', look: 'dottie' },
    { id: 'fix_gallop', chapter: 2, cost: 4, name: 'Fix Gallop the rocking horse', look: 'gallop' },
    { id: 'parade', chapter: 2, cost: 4, name: 'Build the parade float', look: 'parade' },
  ];
})();
