# Surface-aligned Computer Work

`work.computer-back` is a seated back-view work loop: typing, reaching for the
mouse, using the mouse, reviewing the screen, and returning to the keyboard.
The feet and head scale stay fixed. The resting body and arm artwork are separate.

The workstation view supplies keyboard, mouse and tabletop landmarks transformed
from the same artwork coordinates used to draw the furniture. These are render
coordinates; the runtime still moves and collides on integer floor cells.

Each arm uses a shoulder anchor, fixed upper/lower lengths and generated upper
sleeve, forearm and hand artwork. A two-segment geometric constraint places the
wrist at its requested contact point without stretching the character or arm.
The hand contact point stays on the tabletop during presses and mouse use;
typing releases lift only slightly. Unreachable surfaces use the ordinary seated
pose. The head/body occludes arms naturally in back view. Contact points must be
inside the tabletop bounds; forearms can extend over its near edge from the body.

The original body identity reference is `../office-typing-v1/references.png`.
New images are generated with built-in ImageGen. Exact prompts, source images,
output IDs and manually reviewed landmarks live in this folder. Registered
images use the existing 256 x 384 transparent canvas and pivot (128,344).
All earlier walking, seating and typing art is retained.

Acceptance: visible arm joints remain connected; wrist targets have zero contact
error; no arm stretching or head-scale change; correct back-view hand anatomy;
safe state changes during walking, seating, conversation and cancellation;
both workstation artworks and all six characters are checked in the real app.

The accepted registration uses a short upper-arm projection (30 source-canvas
pixels) and a 50-pixel forearm projection. Both stay fixed during playback; this
keeps elbows close to the torso rather than raised beside the head. The review
phase holds the hands still; it does not add a new head-lift pose.

Reproduce staging with `node scripts/characters/register-computer-work.mjs`;
publish with `--publish`, then run `npm run characters:build`. The importer checks
all bodies and both work surfaces before writing any character pack. The new
part clips are validated as single-frame assets with nonzero joint lengths.
Full-body head-area checks remain unchanged. Current technical verification is
the project builder, standard checker and `tests/computerWork.test.mjs` (the
older external Skill auditor does not yet classify separate arm parts).

In-app review captures: `scene-classic.png` (six simultaneous workers) and
`scene-trial.png` (leader's alternate workstation). All six characters were also
reviewed in the shared React preview. Back-view hair naturally hides some fingers.
