# Wang Ming cutout walk source

Created with the built-in OpenAI `image_gen` tool, not the API/CLI. Selected
transparent source PNGs are stored here, outside the public runtime assets.
The reference is the project's approved `public/assets/characters/apartment/marvis.png`;
front/back requests also used the preceding parts atlas for layout consistency.
No external character artwork or additional animation runtime is used by this trial.
Version 6 motion uses numeric references from the project's existing animation;
its separate provenance is recorded below.
This provenance is not a guarantee of exclusive rights to AI-generated artwork.

## Current Version

Version 6 uses `parts-v3-front.png`, `parts-v3-right.png` and `parts-v3-back.png`.
Each contains six parts, including one continuous arm and one continuous trouser
leg. See [walk-v3.md](./walk-v3.md) for the selected outputs, references and exact
generation prompts. The current bake script produces version 6 atlases. See
[walk-v6.md](./walk-v6.md) for exact sampling and the removed V5 adjustments.
Earlier baked results are preserved in `archive-v2/`, `archive-v3/` and
`archive-v4/` and `archive-v5/`, outside public runtime assets.

## Legacy Version 2 Source Layout

Each atlas contains twelve detached parts, in reading order: head, torso,
left/far upper arm, right/near upper arm, left/far forearm with hand,
right/near forearm with hand, two thighs, two calves, two shoes.

Generated layouts are not a mathematically uniform grid. The current rig records
explicit complete-part bounds for version 3, excluding transparent gaps instead
of clipping parts at an imagined grid edge. Version 2 baked atlases are retained
under `archive-v2/`, outside the public runtime assets.

## Reproduce

Run from the project root with Playwright available as an authoring tool:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/character-walk/export-reference-motion.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/bake-marvis-walk.mjs
```

The optional `CHROME_CHANNEL` selects the installed browser (default: chrome).
The script starts and closes its own local Vite server and browser. It uses the
existing PixiJS renderer to bake four 10x6 atlases, 256x352 pixels per cell, plus
the shared-frame JSON manifest under `public/assets/characters/apartment/`.
Set `WALK_AUDIT_PATH=/tmp/marvis-walk-audit` to export joint samples for inspection.
Playwright is not a production dependency. The app loads only baked sprites,
not these source parts or the authoring rig.

## Version 2 Generation History

### Right parts

Output: `exec-4de78248-5b63-490b-af7d-e3dd176bd793.png`

```text
Use case: identity-preserve. Asset type: transparent CUTOUT PUPPET PARTS atlas for an existing 2D game character.
Input is the approved character design. Match the sandy light-brown tousled hair, ivory hoodie, charcoal-blue trousers, white sneakers, fine warm outlines and soft shaded chibi style EXACTLY. This is NOT a pose sheet. Do NOT draw any assembled full person. Create 12 SEPARATE BODY PARTS, one isolated part per cell, for the RIGHT-FACING PROFILE view. All parts consistently seen from the character's same right-facing side, at neutral rest.
Canvas landscape 4 columns x 3 rows, 1536x1152 requested. GENUINE TRANSPARENT alpha everywhere outside parts, no colored background or shadow. Each part centered in its own cell, generous transparent padding. Each part may be large enough to inspect; relative scale will be configured by the rig. No grid or labels.
EXACT row-major cells:
1 head ONLY: entire sandy haircut, ear, brown eye, face with neutral closed mouth, STRICT RIGHT PROFILE nose to screen right, tiny neck stub, NO hoodie/body.
2 torso ONLY: ivory hooded sweatshirt side view, from neck collar through ribbed waist hem, hood protruding on back (screen left), no head, no sleeves, no arms, no legs; entire body silhouette filled, including areas previously hidden by arms.
3 far upper arm ONLY: ivory sleeve shoulder to elbow, pointing straight down; rounded filled ends for overlapping joints, no hand.
4 near upper arm ONLY: matching ivory sleeve shoulder to elbow, pointing straight down, no hand.
5 far forearm WITH hand: ivory sleeve elbow to ribbed wrist cuff and small relaxed skin-colored hand hanging down.
6 near forearm WITH hand: same matching elbow-to-hand segment, wrist not bent.
7 far thigh ONLY: dark charcoal-blue trouser upper leg from hip to knee, straight down, rounded filled connection ends, NO calf or shoe.
8 near thigh ONLY: matching dark trouser hip-to-knee segment.
9 far calf ONLY: charcoal-blue trouser knee-to-ankle cuff, straight down, no shoe.
10 near calf ONLY: matching trouser knee-to-ankle cuff, no shoe.
11 far shoe ONLY: white sneaker RIGHT PROFILE, toe points right, top has filled ankle connection, no trouser leg.
12 near shoe ONLY: matching white sneaker right profile toe points right.
All body parts are fully painted solid with invisible overlap areas completed; no hollow clothing openings and no exposed cross-sections. Keep joint connection ends plain and softly rounded, avoid dark cut lines at elbows/knees/shoulders. Exactly one item per cell, NO duplicated full bodies, no assembled limbs, no weapons, symbols, captions or background. Maintain approved adult-casual chibi identity.
```

### Right correction (selected)

Output: `exec-42ce52b5-7d2f-4311-800d-4f3930fa884e.png`

```text
Precise correction of the supplied transparent 4-column x3-row right-profile puppet-parts atlas. Preserve all twelve parts, their positions, identity, colors, full alpha transparency and layout.
Change ONLY:
- Top row cell2 torso: make it a completely ARM-FREE side-view hoodie torso. Keep back hood protruding screen left, collar and waistband, but erase the sleeve/arm outline drawn inside its body and replace with plain matching ivory body fabric, no hand. Torso silhouette is sleeveless and solid.
- Top row cells3 and4 upper arm parts: remove wrist cuffs from bottom. They are shoulder-to-elbow pieces, with plain rounded ivory overlap ends, NOT full sleeves.
Do NOT change head, face, other parts or shoes. Do NOT draw an assembled character, new poses, text or backgrounds.
```

### Front parts

Output: `exec-adccaaa6-f942-46ef-ba35-8f37ec6e9606.png`

```text
Use case: identity-preserve. Asset type: transparent CUTOUT PUPPET PARTS atlas.
Reference 1 is the exact approved sandy-haired chibi man in ivory hoodie, charcoal-blue trousers, white sneakers. Reference 2 is his side-view cutout sheet, showing the REQUIRED 4-column x 3-row layout and separated-part concept. Create the FRONT-VIEW counterpart, not side view.
One landscape PNG with GENUINE transparent alpha, requested1536x1152, exactly 12 detached parts in FOUR columns and THREE rows. Every part strictly FRONT VIEW, straight upright neutral rest. Same fine warm dark outline, soft shading, brown eyes, neutral closed smile, sandy tousled haircut as reference. Preserve hairstyle and face identity.
EXACT 12 cells row-major:
1 head ONLY: full hair, ears, front face and tiny neck stub, no hoodie or body.
2 torso ONLY: front ivory hoodie from neck collar to ribbed waist hem, two drawstrings, small plain kangaroo pocket if consistent, NO head, NO sleeves or arms, NO legs. Fill entire torso including hidden underarm areas.
3 screen-left UPPER sleeve: shoulder-to-elbow ivory segment pointing down. Rounded overlap ends, NO wrist cuff, NO hand, NO forearm.
4 screen-right UPPER sleeve: matching shoulder-to-elbow segment, no cuff or hand.
5 screen-left FOREARM+hand: elbow-to-wrist ivory sleeve, ribbed cuff, small relaxed skin-colored hand at bottom pointing down.
6 screen-right FOREARM+hand: matching part.
7 screen-left THIGH: charcoal-blue trouser hip-to-knee segment only, filled rounded joint ends, NO calf or shoe.
8 screen-right THIGH: matching hip-to-knee segment only.
9 screen-left CALF: charcoal-blue trouser knee-to-ankle segment, trouser ankle hem, NO shoe.
10 screen-right CALF: matching part.
11 screen-left FOOT ONLY: white sneaker viewed from FRONT and slightly above as in original reference, toe toward viewer, short filled ankle stub.
12 screen-right FOOT ONLY: matching front-facing white sneaker.
Exactly one part per cell, centered with generous transparent gutters. NO assembled full person. All parts painted opaque solid, NO hollow joints, flesh cross sections or cut lines. Plain softly rounded filled connections allow overlapping at elbows/knees/shoulders. Pieces may be independently sized for inspection, rig sets their final proportions.
No floor, shadows, backgrounds, labels, text, grid or props. Do not rotate any part to side view. This is production puppet assembly material, not an illustration collage.
```

### Front correction (selected)

Output: `exec-c15b6784-805c-4423-80b7-675e26bf81fe.png`

```text
Edit this existing transparent parts atlas, preserving its 4x3 layout and all other parts. ONE REQUIRED CHANGE: top row, second cell, the hoodie torso still has sleeves attached. Remove BOTH sleeves from this torso so it is ONLY a sleeveless hoodie vest/body with collar, two drawstrings, front pocket and waistband. Fully paint hidden side areas with matching ivory fabric; clean armless outer contour with shoulder/underarm connection edges. No empty arm holes, no cut-surface lines. Keep the torso centered in the same cell.
Also on top row cells3 and4 (upper-arm pieces), remove the ribbed wrist cuffs at their bottom ends: these are shoulder-to-ELBOW pieces, not full sleeves. End in plain rounded ivory fabric for overlap. Keep forearm pieces in row2 unchanged; their wrist cuffs and hands must remain.
All remaining parts, head/face/hair identity, clothing colors, transparency, positions, scale and artwork stay unchanged. This is a precise asset correction, NOT redesign. Preserve real alpha background, no shadows or labels.
```

### Back parts (selected)

Output: `exec-f3feec03-1536-43b7-b6f8-524bf93193ad.png`

```text
Use case: identity-preserve. Transparent cutout animation PARTS sheet, NOT a full character pose sheet.
Image1 is the exact approved sandy light-brown-haired young chibi man with ivory hoodie and charcoal-blue pants. Its third row shows his BACK VIEW. Image2 shows the front parts atlas layout. Make the corresponding BACK-VIEW parts atlas, twelve isolated parts in a 4-column x 3-row grid, landscape PNG requested1536x1152, real transparent alpha background.
Every part faces fully AWAY from viewer, no face or eyes. Same soft shading, fine warm outlines, haircut, hoodie and sneakers. Exactly ONE isolated part per cell, generous clear gutters and no cropping at cell boundaries. Painted filled overlap areas at joints.
Cells left to right, top to bottom:
1 entire back of head with sandy tousled hair, ears and short neck. NO face, no hoodie or shoulders.
2 BACK TORSO ONLY, a SLEEVELESS ivory hoodie body from collar to ribbed waist, hood draped over upper back. The torso MUST HAVE NO ARMS OR SLEEVES, no head, no legs, no drawstrings on back, no front pocket. Narrow armless vest-shaped body, filled beneath joints.
3 left upper-arm sleeve segment shoulder to elbow, vertical. NO hand or cuff, no complete arm.
4 right upper-arm sleeve segment shoulder to elbow, vertical, same.
5 left forearm sleeve with ivory wrist cuff and relaxed hand, rear view, hanging down.
6 right forearm sleeve with cuff and relaxed hand.
7 left upper-leg dark trouser segment hip to knee, rear view, rounded filled ends.
8 right upper-leg trouser hip to knee, rear view.
9 left lower-leg trouser knee to ankle cuff, rear view, no shoe.
10 right lower-leg trouser knee to ankle cuff, rear view.
11 left white sneaker seen from BEHIND, heel facing viewer and toe pointing away, short filled ankle stub, no trouser leg, no shoelaces visible.
12 right matching white sneaker rear view.
Keep knee and elbow connection ends plain, softly rounded, without black horizontal cut lines or exposed cut surfaces. Parts may be individually sized for inspection; rig controls final scale.
No assembled person, weapons, props, labels, grid lines, checkerboard or shadows. Background entirely transparent.
```
