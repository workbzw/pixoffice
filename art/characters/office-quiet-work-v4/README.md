# Complete Generated Work Frames v4

Five independent characters, using Wang Ming's accepted work pose and timing as reference.
The rejected v3 arm/hand composition is not used in these images.

## Sources

- Generated with the built-in ImageGen tool, with true transparent backgrounds.
- Each character directory contains the original `neutral.png`, exact `neutral-prompt.txt`,
  two-column whole-character `motion-input.png`, generated `motion.png`, and exact `motion-prompt.txt`.
- Neutral generation references: the character's own `standard-v2/sit/back/001.png` for identity,
  and `../marvis-quiet-work-v2/pose-attempt-3.png` for the working pose.
- Motion generation edits only that character's two-column complete neutral sheet.
- `registration.json` records output IDs, complete-frame crops and authored head bands.
- `registered-frames.json` records whole-image uniform scale and translation.

## Import

```sh
node scripts/characters/register-generated-work.mjs
node scripts/characters/register-generated-work.mjs --publish
npm run characters:build
```

Only complete generated images are cropped, uniformly scaled and translated. No body parts,
Wang Ming hand pixels, local motion patches or skeleton transforms are used by this importer.
The one-pixel canvas perimeter is transparent; the character artwork is not cut there.

Each character publishes `work/quiet-back-v4/001.png` through `004.png`:
neutral, left press, neutral, right press. The two neutral frames are intentionally identical.
Timing is read from Wang Ming's clip: 250 ms per phase, three rounds, then a 1000 ms neutral pause.
All four files are included in the character's mandatory proportion validation.

`pose-comparison.png` compares all six characters; `frame-comparison.png` shows the five new
four-frame sets; `work-preview.gif` plays the shared cycle. Generated whole-image edits can
have small linework differences, so numerical validation does not replace motion inspection.

## Verification

- Project character build, lint, production build and all 261 tests passed.
- The live office and all-character work preview load the new frames without console errors.
- The separate Skill audit stops at the retained legacy `part.work-upper` clip, which has no
  whole-character art-standard entry. This is not a passing full-pack audit; the new work clip
  itself is covered by the project proportion validator. Legacy rig materials were not removed.
