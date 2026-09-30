# Shared Keyboard Work Pose V3

The accepted Marvis `work.quiet-back` clip is the motion reference. The other
five characters keep their existing body and sleeve artwork, with both hands
registered beside the head at the same keyboard height. Long-haired characters
use the explicit horizontal offsets in `pose.json` to keep fingers visible.

The four hand images are extracted from Marvis's accepted full frames inside
annotated hand regions. Existing skin pixels and adjacent outline pixels are
retained. Sleeves and the torso remain character-specific. Every output is a
complete 256 x 384 transparent PNG; no hand rig is evaluated during playback.

`bake-quiet-work.mjs` reads the leader's actual frame ordering, duration and pause
instead of maintaining a second animation clock. The arms and wrists are fixed;
only the left or right hand region changes in its corresponding press frame.

Run `node scripts/characters/bake-quiet-work.mjs` to stage and validate all five
packs. Add `--publish` to install the `work/quiet-back-v3` frames and references.
The previous V2 frames are retained. This registration targets the current
office workstation artwork and does not resize a character at runtime.

`pose-comparison.png` and `work-preview.gif` show, from left to right: Wang Ming,
Li Yan, Zhou Li, Chen Shu, Liu Shi and Zhao Shen. Sources are the existing
character pack artwork; this version does not introduce newly generated art.
