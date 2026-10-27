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

## Regional architecture (js/gfx/objects2.js)
hakka_house 6x4 (door [2], text 堂號), drying_rack 2x1 (v 0 米粉 / 1 柿餅), red_fort 5x4 (door 2), chikan_tower 5x4 (door 2),
city_god_temple / mazu_temple 6x4 (door 2 or 3 = centre doorway; 1/4 side doors; text = vertical plaque), palanquin 2x2 (anim; still),
kuba 4x3 (door 1 ladder), bunun_house 4x3 (door 1), millet_rack 2x1, tao_house 4x3 (door 1), tatala 2x1 (water:true bobs),
wang_boat 6x3 (water:true afloat, else on beach cradle), guzhao 4x3 (~470px tall), fort_gate 3x2 (door centre, text 南門),
stone_weir 5x3 resizable (v 0 arc / 1 double-heart; solid only along the wall), basalt 2x2, firecracker_tower 2x1 (lit:false to stop),
qixi_pavilion 2x2, pilgrim_flag 1x1 (text, color), rainbow_arch 6x2 (over, non-solid).
Deities are never depicted (temple interiors show only altar silhouettes; palanquin curtain closed).

## Buildings & street props (js/gfx/objects.js)
- Variants default to hash(x,y); set `v` to pin. `lit:false` = dark windows/unlit (abandoned). `door:false`/-1 removes the doorway.
- Roof overhang draws above the footprint (lighthouse ~280px). Characters just north of tall buildings get hidden — leave a walkway.
- house_jiufen 4x3 (door 1, w/h, v 0–3, text plaque), teahouse 5x4 fixed (door 2, text), house_minnan 5x3 (door mid, w/h, v 0–1),
  shophouse 4x3 (door 1, w, v 0–3, text), temple 7x5 fixed (door 3, text), shrine_small 2x2 solid (text), slate_house 4x3 (door 1, w),
  granary 2x2, pavilion 3x3 (front-middle (1,2) walkable), paifang 4x1 (only cols 0 & 3 solid; v 0 granite/1 red; text),
  lighthouse 3x3 (door 1, beam:false), mine_entrance 3x2 (door 1, text), city_wall 4x1 (w, v 0 stone/1 brick, tall px), gate_city 3x2 (door col 1 passable both rows, text).
- Props 1x1 unless noted: lantern_string 3x1 over/non-solid (w, v 0 red/1 festival/2 blue soul, lift), lamp_post, stone_lantern,
  red_lantern (text, hang:true = non-solid eave lantern), well, cart 2x1, barrel/crate/jar (v), basket (v 0–3), stall 2x1 (text, v),
  signboard (text, v:1 red), bench 2x1 (w), fence_wood/fence_bamboo 3x1 (w; w:1,h:N vertical), laundry 2x1 (ends solid),
  boat_small 2x1, boat_ferry 3x2, dock_post, water_lantern (non-solid, text), sky_lantern (over, non-solid, v, text, alt),
  statue_lion (v, flip), wind_lion, banner (color, edge, text), grave (v 0–2), coffin 2x1, bones (non-solid), firepit, totem, loom, drum_rack, bell_tower 2x2.
