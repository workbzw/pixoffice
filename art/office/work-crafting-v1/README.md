# Office Work Clouds

The work effect uses six low-resolution white-cloud keyframes at about 6 FPS.
It is a local scene effect, not a character pack or an external backend action.

## Current Source

- `spritesheet-white-cloud-soft.png`: 1448 x 1086 RGBA, twelve frames in a
  4 x 3 grid of 362-pixel cells.
- Original ImageGen edits: `exec-57348979-600f-4b73-a8e5-f8eadaf867c0` and
  `exec-b28c0db7-91f3-419a-90ee-4be548532463` (2026-10-23).
- Compact connected white puffs, without black outlines, stationery or detached
  plumes. Superseded tool and outlined-cloud sheets have been removed.
- This authoring source is a build input, not a browser download.

## Build And Playback

`scripts/build-office-assets.mjs` selects source frames 1, 3, 5, 7, 9 and 12,
downscales each to 160 x 160, and builds the 480 x 320 runtime atlas at
`public/assets/office/effects/work-crafting-lite-v1.png` with a lossless WebP copy.
Both generated copies are ignored by Git.

- Frame durations: 170, 170, 170, 170, 170 and 200 milliseconds.
- Display envelope: 160 world pixels, with a shared center/90%-height pivot.
- Position: 32 world pixels above the seat anchor, scaled with the character.
- Steady opacity: 100%, with entry, interruption and completion fades.
- Layering: above the desk but behind the seated worker and chair.
- All workers share the same atlas and textures, with staggered playback clocks.
- Only seated/back-view workers with a running task emit clouds. Movement,
  speech, seat transitions, idle and blocked work hide the effect.
- A completed task plays a short contracting tail. Reduced motion holds frame 1.
- No runtime blur filter, particle system or new external command is required.

Character action frames, identities, seat anchors and animation durations remain
in their existing character packs and are not modified by this effect build.
