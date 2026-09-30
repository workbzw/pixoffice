# Marvis Quiet Work Trial

Scope: Marvis only. Four complete back-view seated frames: neutral, a small
viewer-left sleeve movement, neutral, a small viewer-right sleeve movement.
No arm rig, mouse reach, head movement or runtime deformation is used.

The accepted sitting frame `../packs/marvis/standard-v2/sit/back/001.png` is the
identity and posture master. ImageGen edits the sleeves. Registered local edit
regions are composited into complete frames at authoring time; every pixel
outside those regions comes from the original seated master. The runtime only
switches complete PNG frames. Neutral phases reuse the original pixels.

Action `work.quiet-back` plays three 1-second left/right cycles followed by a
1-second neutral hold. Only a real working state plays it. Seated conversation,
walking and sit/rise transitions retain priority. Head area, body scale and foot
anchor stay unchanged. This is a restrained indication of input, not a detailed
finger-to-keyboard animation or arbitrary furniture-height adaptation.

Keep original sources, prompt, registration recipe and comparisons here. Publish
only Marvis after technical checks and in-app inspection. Other characters and
their current actions must remain unchanged pending visual approval.

Built-in ImageGen produced `generated.png`; the exact prompt is `prompt.txt`,
and its output ID and reviewed edit rectangles are in `registration.json`.
`register-marvis-quiet-work.mjs` imports the two generated sleeve edits, blends
their patch boundaries, and writes four complete source PNGs. Frames 1 and 3
are exact copies of the accepted master. The left/right edits are independent,
not mirrored body parts. No code draws the sleeve artwork.

The output sequence contains 13 timed entries referencing four frame files:
three repetitions of the four 250ms phases, then a 1000ms neutral hold. The
head/body/foot pixels outside the active sleeve region are tested byte-for-byte.
Staging passes the project's schema, transparency, atlas and proportion checks.
The old external Skill audit still rejects the pre-existing `part.work-*` clips
from the previous rig experiment; this trial does not remove those unrelated
retained assets or weaken body tolerances to silence that incompatibility.

Reproduce with `node scripts/characters/register-marvis-quiet-work.mjs`, add
`--publish` to install Marvis only, then run `npm run characters:build`.
`comparison.png` shows the master followed by four phases. `comparison.gif`
shows the static master on the left and the 4-second work loop on the right.
