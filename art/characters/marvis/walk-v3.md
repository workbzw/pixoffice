# Wang Ming Walk Version 3

Generated on 2026-09-26 with the built-in OpenAI `image_gen` tool.
References: the matching direction's original complete-frame atlas
`public/assets/characters/apartment/marvis-walk-{front,right,back}.png`
and the original identity sheet `public/assets/characters/apartment/marvis.png`.
The front correction edits the initial generated front atlas.

## Construction

Each 3x2 source contains head, torso, complete arm, complete trouser leg,
flat shoe and pitched shoe. Front/back limbs are mirrored for the opposite side.
Whole limbs are deformed with a smooth cubic centerline using the existing Pixi
MeshPlane in the offline bake script. Continuous fabric replaces separate elbow
and knee pieces. The two front/back shoe poses crossfade at heel strike/toe-off;
side-view shoes rotate around their ankle attachment.

The bake produces 32 frames per direction with one registered 152x240 crop,
48 scene units per cycle. Side-view stance feet match world translation. Hip
height follows the supporting leg, and arms swing in opposition. Front/back
limbs use simplified depth projection, not a 3D model. These remain authored
cutout approximations of the original complete-frame walk, not hand-drawn frames.

The application loads only the baked PNGs and manifest. No new runtime library
or live mesh processing is required. Other characters, sitting and expressions
are unchanged. See [README.md](./README.md#reproduce) to reproduce the bake.

Asset provenance records generation, not exclusive rights to the output.

## Exact Prompts

### Right (selected)

Repository asset: `parts-v3-right.png`.
Output: `exec-42cddfa1-187d-4fe7-9619-ace6d96975e5.png`.

```text
Use case: identity-preserve. Asset type: transparent cutout animation source for an existing game.
Image 1 is the APPROVED FULL-BODY right-facing walk. Image 2 is the original identity sheet. Preserve exactly this sandy-haired chibi man's face, hairstyle, ivory hoodie, roomy charcoal-blue trousers, white sneakers, clean warm fine outlines and soft shading. Do not redesign him or change his age or head shape.
Create ONE 3-column x 2-row transparent parts atlas, requested 1536x1024, exactly SIX detached parts, generous transparent gutters:
TOP LEFT: his complete RIGHT-PROFILE head, face and tiny neck stub, nose pointing right. No hoodie, no torso.
TOP MIDDLE: RIGHT-PROFILE ivory hoodie torso only from collar to waist, back hood on left. No sleeves or arms or head. No internal arm outline. Fill hidden body areas in matching ivory fabric.
TOP RIGHT: ONE WHOLE relaxed arm from shoulder through elbow, ribbed wrist cuff and small hand. Arm pointing straight down. This is ONE continuous natural cloth sleeve, NOT separate upper/lower parts. Absolutely NO seam, ring, outline, cuff or dividing line at the elbow. Only the real wrist cuff. Rounded shoulder end will be hidden behind torso.
BOTTOM LEFT: ONE WHOLE trouser leg from hip through knee to ankle cuff, straight down. Roomy soft pants matching the full character. NO shoe. Absolutely NO ring, horizontal outline, artificial cuff, kneecap or dividing line at the knee. Continuous fabric throughout the knee. Hidden hip end rounded plain solid blue.
BOTTOM MIDDLE: ONE white sneaker in strict RIGHT PROFILE, flat sole, toe points right, small filled ankle attachment. Match the original walk shoes.
BOTTOM RIGHT: ONE matching white sneaker in RIGHT PROFILE with toe raised slightly for heel strike, same design.
Parts are for smooth mesh bending: arms and legs MUST be complete uninterrupted limbs with the original folds, NO visible artificial joint segmentation. Keep the original unarmored relaxed clothing proportions. Parts may be larger for inspection; the rig sets final scale.
Clean real transparent alpha background, no haze, brown glow, floor, shadows, outlines around cells, labels, extra parts, full assembled bodies or checkerboard pixels. Exactly six parts.
```

### Front (initial)

Repository asset: `not used`.
Output: `exec-067daaca-fe06-4ef3-b137-d5a8c25133f5.png`.

```text
Use case: identity-preserve. Asset type: transparent smooth-cutout animation source.
Image1 is the APPROVED FRONT-VIEW full-body walk. Image2 is the original character identity. Preserve exactly this sandy light-brown-haired chibi man, brown eyes, gentle closed-mouth smile, ivory hoodie, loose charcoal-blue pants, white sneakers. Match the original complete character's face proportions and fine warm outlines. This is his FRONT counterpart for a deformable puppet.
ONE 3-column x 2-row parts atlas, landscape requested1536x1024, exactly SIX separate parts:
1 TOP LEFT: whole FRONT head with hair, ears, face, tiny neck. No shoulders or clothing.
2 TOP MIDDLE: FRONT armless hoodie torso, collar, two drawstrings, kangaroo pocket and waist hem. NO sleeves, head or legs. Fill hidden underarm areas in plain ivory.
3 TOP RIGHT: ONE COMPLETE arm shoulder to relaxed hand, vertical, FRONT view. Continuous ivory sleeve through elbow, one wrist cuff only, small hand. NO elbow rings, joint seams or separate forearm.
4 BOTTOM LEFT: ONE COMPLETE roomy dark-blue trouser leg from hip through knee to ankle hem, vertical FRONT view, no shoe. Continuous smooth fabric through knee, NO horizontal kneecap outlines, NO artificial divisions or cuffs at knee.
5 BOTTOM MIDDLE: white sneaker viewed FRONT with slightly elevated camera, flat-foot walking pose; small filled ankle stub.
6 BOTTOM RIGHT: matching white sneaker for front-view forward heel strike, toe pitched UP toward camera, exposing a broad rounded beige rubber sole like the lifted shoe in the approved full-body walk. Not a side-profile shoe. Foot must have same identity and natural width.
Complete arms/legs will be gently mesh-deformed, so keep continuous outlines and coherent cloth folds instead of detached upper/lower limb pieces. Exactly one part per cell, substantial clear gutters and no overlapping. No assembled full person.
Real TRANSPARENT alpha outside parts, no background, glow, haze, brown vignette, shadows, floor, text, labels, checkerboard or props. No redesign of the approved character.
```

### Front correction (selected)

Repository asset: `parts-v3-front.png`.
Output: `exec-be9e2361-5417-4b00-92c0-d51182b64561.png`.

```text
Correct ONLY the following parts in this existing transparent 3x2 atlas. Keep the head and complete arm unchanged, keep layout, identity, colors and transparency.
TOP MIDDLE torso: remove the two short sleeve stubs/bulges at the sides. It must be a sleeveless hoodie torso with hood collar, drawstrings, pocket and waistband, no arms at all. Fill sides with plain ivory.
BOTTOM LEFT: replace the TWO-LEGGED pair of pants with exactly ONE SINGLE STRAIGHT TROUSER LEG. It is a narrow complete limb from ONE hip to ONE knee to ONE ankle, with one ankle opening. No second leg behind it, no waistband, no crotch seam or fly. Top connection is plain rounded solid charcoal-blue fabric, hidden beneath torso. Whole leg is soft roomy cloth, completely uninterrupted knee with no horizontal ring seam.
BOTTOM MIDDLE and BOTTOM RIGHT shoes: remove ALL blue trouser fabric above both sneakers. Only shoes plus a short skin-colored ankle stub remain. Preserve the flat front shoe and the toe-raised sole-facing shoe respectively, same size and orientation.
No other changes, no new parts, no shadows or colored background. GENUINELY transparent alpha.
```

### Back (selected)

Repository asset: `parts-v3-back.png`.
Output: `exec-bb81b7d3-6550-49be-b9f2-0558242fa459.png`.

```text
Use case: identity-preserve. Asset type: transparent cutout animation parts.
Image1 is the APPROVED BACK-VIEW full-body walk of the sandy-haired chibi man. Image2 is the original identity sheet. Match his haircut shape and proportions, ivory hoodie, roomy charcoal-blue trousers, white sneakers, fine warm outlines and soft shading exactly. Every part is BACK VIEW, facing away. No face/eyes.
Create one 3-column x 2-row PNG, requested1536x1024. Exactly SIX isolated parts:
TOP LEFT: complete back of head, sandy hair, ears and tiny neck stub. No clothing or shoulders.
TOP MIDDLE: sleeveless BACK hoodie torso only, collar, hood draped over upper back, plain ivory back and waist hem. NO arms, NO sleeve stubs or arm-outline inside body, NO head, NO legs. Armless vest-shaped silhouette with filled hidden side regions.
TOP RIGHT: ONE WHOLE arm from shoulder through elbow to relaxed hand, pointing straight down, back view. Continuous ivory sleeve, ribbed wrist cuff, small hand. No elbow ring, no joint outline or segmentation. Entire limb in ONE piece.
BOTTOM LEFT: ONE SINGLE WHOLE trouser LEG from hip through knee to ankle cuff, back view, straight down. NOT a pair of pants. No second leg, no waistband/crotch/fly, no shoe. Continuous roomy cloth and smooth knee, no knee seam/ring/artificial joint boundary.
BOTTOM MIDDLE: ONE white sneaker seen from BEHIND, resting flat, heel faces viewer, no laces. Short skin ankle stub, no blue pants.
BOTTOM RIGHT: same sneaker seen from BEHIND during lifted heel/toe-off, foot pitched so broad beige rubber SOLE is visible, like the raised back foot in approved full-body walk. Only shoe and short ankle stub, no pants.
All parts have consistent shading and line thickness. Arms/legs will be bent with a continuous mesh; no artificial division at knees/elbows. One part per cell, clear generous transparent gutters, no assembled character.
Genuine transparent alpha outside artwork, no brown glow, haze, shadows, floor, checkerboard, captions or grid lines. Keep original gentle casual style.
```
