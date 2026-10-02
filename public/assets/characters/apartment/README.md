# Apartment character prototype

These files are now retained as migration sources and provenance. Active characters
use independent source packs in `art/characters/packs/`, built into `public/characters/`.
See [the character-pack guide](../../../../docs/character-packs.md). The historical
pipeline descriptions below describe the pre-migration implementation.

Six original AI-generated sprite sheets, created with the built-in OpenAI
`image_gen` tool (not the CLI) on 2026-09-25, based on the apartment concept
image from this project's design discussion. No external character pack was used.

## Files and identities

| File | Identity / clothing | Generation output ID |
| --- | --- | --- |
| marvis.png | Sandy tousled hair, ivory hoodie, charcoal-blue trousers | exec-b548fa66-b266-4627-8e74-51787eebf965 |
| code-agent.png | Brown ponytail, sage sweater, ivory trousers | exec-412fdbe1-5b8c-4c80-92b5-e333820eef1b |
| file-agent.png | Black tousled hair, round glasses, black hoodie, beige trousers | exec-8fd73ab9-465d-4874-8500-f72afc34794e |
| app-agent.png | Auburn wavy hair, ivory knit sweater, blue jeans | exec-e2bce98f-0db5-4ff1-b003-288834a04f45 |
| review-agent.png | Chestnut hair, ivory shirt, gray apron, charcoal trousers | exec-670c2047-473e-4a5c-8987-5fe6235cea16 |
| data-agent.png | Dark bob, dusty-blue cardigan, ivory trousers | exec-f93498f8-0ca4-4402-a5e8-698baa5be938 |

## Frame contract

3 columns x 4 rows on a transparent background:

1. Front: idle, walk A, walk B.
2. Right: idle, walk A, walk B. Left is mirrored at runtime.
3. Back: idle, walk A, walk B.
4. Front: waving, thinking, surprised.

The renderer detects transparent row/column gutters and trims each pose at load time.
These are prototype sequence frames. Emotes are distinct static poses;
walk cycles use the two steps and idle.
AI-generated details may vary slightly between poses.

## Active Frame Animation

All six residents, including Wang Ming (`marvis`), use the same whole-character
frame pipeline. Indoor back walking uses
[indoor-back-walk-v1.png](./indoor-back-walk-v1.png): four low-step/passing
poses per one-second loop, shared in a single six-resident atlas. Front and side walking use the
original complete-character sheets. Expressions and seated poses are unchanged.
The former high-lift [back-walk-v1](./back-walk-v1/README.md) poses are retained
unchanged as running, with their original 0.8-second cycle. They load only when
selected in Character Preview. Wang Ming's back-view comparison shows indoor
walking beside the former running gait; other directions retain the historical
eight-frame comparison. Missing walking assets fall back to the original sheets.
Exact prompts and provenance: [indoor-back-walk-v1.md](./indoor-back-walk-v1.md).

## Previous eight-frame trial

Retained for the side-by-side preview. Three transparent
4-column x 2-row atlases each contain eight walking phases:

- `marvis-walk-front.png`
- `marvis-walk-right.png` (mirrored for left)
- `marvis-walk-back.png`

The loader registers each direction to a common frame size and the head center,
with feet on a shared baseline. It does not rescale each pose independently or
crossfade overlapping silhouettes. The comparison preview plays one eight-frame
cycle per second. These are generated frame
sequences, not bones or optical-flow interpolation, and small drawing differences
can remain. The active seat transitions use the separate atlas documented below.

Generated with the built-in `image_gen` tool. Exact prompts, references and
output IDs are recorded in [marvis-walk-prompts.md](./marvis-walk-prompts.md).

`seated.png` adds a 3-column x 2-row atlas in roster order, with one back-facing
seated pose for each resident. A character uses it only while idle, working or
thinking at their own desk without a pending movement target or expression.
Chairs and desks remain separate fixed assets. The active seat transition now
plays seated, forward-lean, half-rise and standing poses over 0.52 seconds.

`seated-turn-right-v1.png` adds six complete seated head-turn poses, mirrored
for left-facing visitors. Hosts stay seated while listening and replying, then
face the computer again. See [seated-turn-v1.md](./seated-turn-v1.md) for the
exact generation prompt and provenance.

`seat-transition-v1.png` adds two complete rear-view transition poses for each
resident: forward lean and half-rise. The chair stays fixed during side entry
and exit. See [seat-transition-v1.md](./seat-transition-v1.md) for atlas order,
the exact generation prompt, and provenance.

Seated atlas: built-in `image_gen`, output
`exec-9a3a1ffd-fe3d-4ec7-8a95-39a79a1fc8b4.png`. The inputs were front/back
screenshots of the approved six-character preview and the original `marvis.png`.

### Seated atlas prompt

```text
Use case: stylized-concept. Asset type: transparent 2D game sprite atlas.
Create SIX SEATED BACK-VIEW character sprites for the six existing characters in the reference images. Image 1 is the approved exact six back-view identities and clothing in reading order; image 2 shows their faces and clothing to help preserve identity; image 3 is the original high-resolution male character sheet for line quality/proportion reference. The screenshots are references ONLY, do not reproduce any interface, card, text or background.
ONE LANDSCAPE SPRITE SHEET, exactly 3 columns by 2 rows, equal cells, requested 1536x1024. Each cell contains exactly one full-body seated character on genuinely transparent alpha. All six face directly AWAY from the viewer toward the top of the image. Modestly elevated camera, centered rear view, no perspective rotation. Consistent chibi proportions, large head and small adult casual-clothed body, clean fine warm outlines and soft shading, closely matching the reference art.
POSE: sitting upright at an office desk on an INVISIBLE chair, hips resting on an invisible seat, thighs forward horizontal and knees bent 90 degrees, feet hanging naturally down in front, elbows slightly bent with forearms extending forward as if resting on a keyboard. Seated silhouette must be shorter than standing with compact folded legs, not a standing figure, not kneeling or squatting. Keep original head and torso proportions, do not squash the head. Render the character only; chair and desk are separate existing game assets and MUST NOT be drawn. Some calves/shoes can be partially occluded by their own thighs from this rear view.
EXACT IDENTITIES and grid order:
Top left: sandy light-brown tousled short-haired man, ivory hoodie with visible hood on back, dark charcoal-blue trousers, white sneakers.
Top middle: brown-haired woman with high ponytail, sage-green sweater, ivory trousers, white sneakers.
Top right: black tousled short-haired man with round glasses (mostly hidden from behind), black hoodie with back hood, beige trousers, white sneakers.
Bottom left: auburn shoulder-length wavy-haired woman, ivory knit sweater, blue jeans, white sneakers.
Bottom middle: chestnut tousled short-haired man, ivory shirt, medium-gray apron visible as gray straps and tie knot on back, dark charcoal trousers, white sneakers.
Bottom right: dark blue-black shoulder-length bob-haired woman, muted dusty-blue cardigan, ivory trousers, white sneakers.
Each pose centered in its cell with generous transparent margins and clear transparent gutters between rows and columns. Full hair and shoes included, no clipping. No furniture, no chairs, no computers, no props, no floor, no shadows, no labels, no checkerboard pixels. All backgrounds fully transparent. Preserve the distinct six hair and outfit colors.
```

## Shared generation prompt

```text
Create a production sprite sheet for a 2D Pixi game using the supplied apartment image ONLY as CHARACTER STYLE REFERENCE. Not an apartment picture. Exactly ONE adult roommate, repeated in 12 full-body poses. Clean soft anime chibi style, very large expressive head, adult casual fashion, subtle painterly shading, dark warm fine outlines, matching the roommates in the reference. No floor, no ground shadow, no objects, no labels or lettering. REAL fully transparent alpha background, not a white sheet and not a checkerboard painted into the pixels.
LAYOUT CRITICAL: portrait 3:4 canvas, requested 1536x2048; exactly 3 equal columns and 4 equal rows, each character entirely inside its own cell with large transparent margins. No grid lines. All feet on same baseline within each row. Same head size, height, outfit, identity, lighting and proportions across ALL 12 frames. Keep every sprite away from cell borders.
ROW 1, columns 1/2/3: front facing neutral standing; front facing WALK STEP A with left leg forward and right arm forward; front facing WALK STEP B with right leg forward and left arm forward.
ROW 2: STRICT RIGHT-FACING profile neutral standing; same right-facing profile WALK STEP A; same right-facing profile WALK STEP B. All three face screen RIGHT, full nose profile, left profile must NOT be used.
ROW 3: full BACK VIEW neutral standing, no facial features visible; BACK VIEW walk step A; BACK VIEW walk step B. All three face fully away from viewer, same haircut and clothes from behind.
ROW 4: front-facing friendly smiling WAVE with raised hand; front-facing thoughtful pose hand near chin; front-facing surprised pose with wide eyes and small open mouth.
These are registered animation frames, NOT 12 different outfits or decorative sticker compositions. The walk poses must actually change arms and legs. Avoid weapons, hats, armor, bags, props, coffee cups, bubbles, background decoration, captions or shadows. Use transparent negative space between every sprite.
```

Each request appended the identity/clothing listed above. Later requests used
the approved `marvis.png` as the frame layout/proportion reference in addition
to the apartment concept, requiring the same outfit across every frame.

## Reference provenance

Apartment style reference: `exec-0aef5b7a-701c-427e-8ce4-c2d52cacde83.png`,
generated earlier in the same design discussion. Original outputs are retained
in the user's Codex generated_images directory; the runtime only uses the six
PNG files in this repository.
