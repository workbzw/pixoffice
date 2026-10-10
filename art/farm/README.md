# Farm Artwork v1

Background, soil, individual vegetables and farming whole-body poses were generated with the built-in ImageGen tool for PixOffice on 2026-10-10. Original outputs are retained in `originals/`; prompts are retained in `prompts.md`. No third-party game artwork is included. The old `plots.png` boxed-bed atlas is retained only as a source reference and is no longer built or loaded.

The farmer identity and walking/standing frames reuse the project's existing original Marvis character. Selected source frames are copied into this independent farm asset tree; the runtime never loads the office asset pack. Farming uses complete character images, not assembled limbs. `registration.json` records the common 256x384 canvas, (128,344) ground pivot and uniform .735 import scale. Each work frame is registered by its own planted shoe contact: the hips and upper body may lean, but the feet do not slide. A reviewed shoe-only region excludes seeds and the water stream from the contact measurement. The previous frames and registration are retained in `motion-v1/`. The two farmers currently share this appearance, with distinct names and independent animation clocks.

`scripts/assets/import-farm-art.mjs` is a one-time import command, not part of normal builds. `example/farm/build-assets.mjs` deterministically packages the retained sources. This farm profile is separate from the office's seated-animation admission profile. Crop, tool and whole-body pose readability should continue to receive visual review; numerical registration does not guarantee anatomy or identical head silhouettes.

These project-owned assets are distributed under the repository's MIT license. Generated artwork may not be exclusive.

`chicken-logo.webp` is a standalone 128x128 transparent export of the first front-facing chicken frame, with an 8px clear margin. The farm title card uses this small image instead of loading the full animation atlas.

`pixoffice-logo.png` is a copy of the selected PixOffice mascot icon in `public/site/icon.png`, used only for the page's top-left product branding.

Chicken navigation is restricted to the inner lawn (columns 2-21, rows 4-14), intersected with the current scene bounds. Placement, routes and steps all exclude foreground fence row 15 without changing the farmers' navigation area.

The soil is a fixed sprite, separate from crops. `example/farm/build-crops.mjs` packages nine plant stages onto common 256x256 canvases with a (128,240) ground pivot and one shared scale. Each plot uses six fixed planting points. Stage changes never replace or resize the ground sprite; generated `crop-registration.json` records the source regions and registration.

`originals/plot-sign.png` is an original built-in ImageGen wooden plaque and stake. Its blank face receives live plot names, crop status and growth progress; no text is baked into the image. The sign is planted at the plot center between the two crop rows, with rear plants behind it and front plants in front. It is a visual part of the existing plot, not an additional floor obstacle or interaction target.

`originals/chickens.png` is an original built-in ImageGen sprite sheet for this farm: three walking views and three pecking views, four whole-body frames each. `originals/chickens-motion-v2.png` replaces only the side walk and rear peck: alternating legs and a rear-facing head that stays occluded while bending forward. `example/farm/build-chickens.mjs` registers all 24 complete images on a 192x160 canvas with a (96,146) foot pivot, preserving alpha. Original frames use .55 scale; the larger replacement sheet uses .28 scale at its 1280px source size. Per-frame registration records the source. The second hen uses a subtle warm runtime tint. These decorative animals share the scene ticker and floor navigation rules, not worker tasks, and do not add a separate office asset dependency. Each hen continuously loops lowered-head feeding frames for 16-28 seconds, then walks at most three cells to another spot and resumes feeding. There is no standing-idle phase; the two hens have staggered clocks.
