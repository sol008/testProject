# Art notes for map builders (collected from the art agents' reports)

## Interior props (js/gfx/interior.js)
- `mural` and `door_frame` are WALL-MOUNTED: place them on the wall-face row itself (the second wall row), not on the floor row below.
- Tall props (bookshelf, cabinet, shelf_lanterns, bed headboard, pillar ~176px) rise above their footprint; place them in the floor row directly below a wall so they stand against the wall face.
- Walkable (non-solid): rug (3x2, o.w/o.h), door_frame, stairs_up, stairs_down, switch (o.on), bed_mat (1x2). Everything else blocks its full footprint.
- Footprints: table 1x1 (o.w for long tables), chair 1x1 (o.dir), bed 1x2, cabinet 1x1, bookshelf 2x1, shelf_lanterns 2x1 (o.w, o.v), counter 2x1 (o.w),
  stove 2x1, altar 2x1, incense_burner 1x1, screen 2x1, chest 1x1 (o.open), brazier 1x1, pillar 1x1, soul_jar 1x1, eternal_lamp 1x1,
  mural 2x1 (o.v 0–4), tea_set 1x1, lantern_rack 2x1, pot 1x1, lantern_frame 1x1, workbench 2x1, paper_stack 1x1, jar_row 2x1 (o.w),
  drum 1x1, bell 1x1, weapon_rack 2x1, mirror_stand 1x1 (照魂鏡), cauldron 1x1, herbs_rack 1x1, bucket 1x1, broom 1x1, plant_pot 1x1 (o.v 0–2),
  divination_blocks 1x1, fortune_sticks 1x1, mill_stone 1x1 (擂茶), loom_small 1x1, fishing_net 2x1, lighthouse_lamp 2x2.
- Light emitters: shelf_lanterns, counter, stove, altar, switch (on), brazier, soul_jar (blue), eternal_lamp, mirror_stand (cyan), lighthouse_lamp.
