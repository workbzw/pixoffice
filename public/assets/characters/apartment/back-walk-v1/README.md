# Back walk, frame branch

Generated with the built-in image_gen tool, not the CLI, on 2026-09-26.
These atlases only override BACK walking for all six residents, including Wang
Ming. Original sprite sheets, other directions and idle/emote/seated poses are
untouched. Wang Ming no longer loads the V6 skeleton-derived walk on
`anim-frame`; his front and side walks use the original sheet like everyone
else. No mirroring, limb cutouts or skeleton motion is used in these back walks.

Each generated source is a 4x2 grid. Only four visually reviewed full-person
poses are played: right trailing, right raised, left trailing, left raised.
Some generated intermediate poses did not follow the requested foot order and
are intentionally excluded, rather than assumed correct from their cell index.
At 0.8 seconds per cycle, this is four distinct poses at five frame changes per
second, NOT a claim of smooth eight-frame animation. There is no inserted idle
pose and no procedural bounce added to this back cycle.

The loader registers a shared scale, head center and ground line across the
atlas; missing assets fall back per character to its original animation.

| Character | Selected zero-based cells | Generation output |
| --- | --- | --- |
| marvis | 0, 2, 4, 6 | exec-32f1d003-93c3-4350-b911-aa11debea0fb.png |
| code-agent | 0, 2, 4, 6 | exec-6e1b66af-a4aa-475a-8cd8-d278f2ac8b65.png |
| file-agent | 0, 2, 4, 6 | exec-2ce8f037-3895-4579-bd0b-6318fcfbfee4.png |
| app-agent | 3, 2, 7, 6 | exec-0703f298-a6df-4d65-832f-eb5ea9ef9d99.png |
| review-agent | 1, 2, 5, 6 | exec-7582fcde-6c50-4459-b2b9-c742cffaf318.png |
| data-agent | 0, 2, 4, 6 | exec-5f62dc81-117b-4edc-883d-dde3bb4418d0.png |

All originals are in the Codex generated_images task directory. These PNGs are
unmodified copies, preserving generated alpha. Input 1 for each resident was
its original `../<agent-id>.png`. Transfer generations also used the corrected
code-agent atlas as the pose/layout reference; Wang Ming used file-agent.
The original code-agent draft
was `exec-c322bdd5-9890-4903-bea7-d8d841afaf56.png` and is not shipped.

## Initial Code-Agent Prompt

```text
Use case: identity-preserve.
Asset type: production 2D game sprite atlas, complete character frames with real transparent alpha.
Input image 1 is the exact character identity and painting style to preserve. Use the BACK VIEW in its third row as the identity reference. Do not reproduce the input layout, front views, side views, emotes, floor or shadows.
Create an improved BACK-FACING WALK CYCLE for this same character: 8 full-body frames in a strict FOUR-COLUMN by TWO-ROW grid, equal cells, landscape 1536x1024 canvas. All eight figures face directly AWAY from the viewer, walking AWAY, never toward the viewer. Preserve exact haircut, outfit, colors, shoes, outline and head/body proportions. The figure must have the same size, head center, camera angle and baseline in all cells; allow only very small natural vertical bob. Full hair and feet must fit inside every cell with generous transparent gutters. No text, numbers, lines or background.

MOTION: quiet natural walking, not running, hopping or marching. Exactly one continuous 8-phase loop in row-major order. Opposite arms and legs alternate. BACK VIEW means the character's anatomical left is the image's LEFT, and right is the image's RIGHT. The two half-cycles MUST swap the supporting and swinging legs, not merely change foot angle on the same leg.
Row 1 is the LEFT-support half:
1 left heel has contacted farther away/up-screen; right leg trails toward viewer/down-screen, right heel beginning to lift.
2 weight settles over left leg; right toe pushes off, right heel rises.
3 left leg is the straight supporting leg; right knee flexed, RIGHT SHOE SOLE visibly lifted toward the viewer while swinging past left leg. NOT two straight legs or neutral standing.
4 right leg reaches ahead away from viewer/up-screen to prepare contact, left heel starts lifting.
Row 2 is the anatomically opposite RIGHT-support half:
5 right heel has contacted farther away/up-screen; left leg trails toward viewer/down-screen, left heel beginning to lift.
6 weight settles over right leg; left toe pushes off, left heel rises.
7 right leg is the straight supporting leg; left knee flexed, LEFT SHOE SOLE visibly lifted toward the viewer while swinging past right leg. This is the opposite of frame 3.
8 left leg reaches ahead away from viewer/up-screen, right heel starts lifting, smoothly leading back into frame 1.
At frames 3 and 7, the raised shoe and supporting leg must be on OPPOSITE sides. The lifted soles should be readable but not oversized. For away-facing walking show heels/soles, never front-facing shoelaces/toe caps pretending to be a back view.
No idle pose inserted. No facial features on the back of the head. Avoid changing hair silhouette, sleeve lengths, body size, or adding accessories. Keep the same complete-person illustration quality as the reference, no separated puppet pieces, no bone markers.
Character: the brown ponytail woman in the sage-green sweater, cream trousers and white sneakers from image 1.
```

## Code-Agent Correction

```text
Use case: precise-object-edit. Correct this transparent 4x2 back-walk sprite atlas. Preserve the EXACT same eight heads, hair, outfit, body size, grid positions, complete figures, fine outlines and transparent alpha. Do not add a background or shadow. Change ONLY the legs and opposite arm swing needed for a coherent alternating walk. CRITICAL: in the TOP ROW the IMAGE-RIGHT foot must be the moving/trailing foot throughout all four cells; IMAGE-LEFT leg carries weight. Top cell1: right heel low and slightly behind, left planted. Top cell2: right heel lifted halfway, left planted. Top cell3: keep current raised RIGHT sole pose. Top cell4: right foot swinging forward and down, almost alongside left, but not a static neutral standing pose. In the BOTTOM ROW use the EXACT OPPOSITE leg pattern, with IMAGE-LEFT foot moving/trailing throughout all four cells and IMAGE-RIGHT leg carrying weight. Bottom cell1: left heel low behind; bottom cell2: left heel lifted halfway; bottom cell3: keep current high raised LEFT sole pose; bottom cell4: left foot swinging forward and down. So top cell1 and top cell2 currently have the WRONG FOOT and must swap leg poses. Each column in row2 should be the left/right-swapped LEG AND ARM POSE of the corresponding column in row1, BUT do NOT flip or change the hair/head. Eight consistent full-body back-facing figures. Real transparent background, no labels.
```

## Transfer Prompt

```text
Use case: identity-preserve.
Create a transparent 4-column x 2-row 8-frame BACK-WALK sprite atlas.
Image 1 is the exact character identity, outfit, art style and proportions. Image 2 is the layout and back-walking motion reference ONLY. Replace the green-clothed ponytail woman in image 2 with the character from image 1 across all eight cells.
Keep the original character's exact hair shape/color, clothing color and details, shoes, outlines and proportions from image 1. Use only its BACK VIEW identity; no face visible.
Preserve the clear raised shoe pose in top-row cell3: RIGHT foot raised with sole facing viewer, left leg supporting; and bottom-row cell3: LEFT foot raised with sole facing viewer, right leg supporting.
IMPORTANT correct the motion layout: in the entire top row, RIGHT foot is trailing/moving while LEFT leg supports. In the entire bottom row, LEFT foot is trailing/moving while RIGHT leg supports. Column1 trailing heel low; column2 heel partly raised; column3 sole lifted high; column4 swinging foot passing forward/down. Opposite arm swing, no neutral idle frame. Row2 must be the opposite-leg half-cycle of row1. Ignore the wrong-foot poses in reference top cell2 and bottom cell2: fix them.
All eight characters exactly same scale, head center and ground baseline within equal cells. Keep head and hair design completely fixed across frames. Quiet walking away, not running or jumping. BACK VIEW only, show heels and soles not front toe caps. Full body with complete hair and feet, generous transparent margins and gutters. Landscape 1536x1024. GENUINELY TRANSPARENT alpha background with nothing outside the characters. No floor, cast shadow, backdrop, captions, numbers, grids or extra props.
```

Identity suffixes:

- file-agent: Character: black short tousled hair, black hooded sweatshirt with hood on back, beige trousers, white sneakers. No ponytail, no green sweater.
- app-agent: Character: woman with auburn shoulder-length wavy hair, ivory knit sweater, blue jeans, white sneakers. Her long hair covers her upper back, matching image 1 exactly. No ponytail.
- review-agent: Character: man with short chestnut tousled hair, ivory shirt, grey apron with shoulder straps and a tied bow on the back, charcoal trousers, white sneakers. Match image1 back view, preserve apron straps and bow, no ponytail.
- data-agent: Character: woman with dark blue-black bob haircut, dusty-blue cardigan, cream trousers, white sneakers. Match the back view in image1 exactly; no ponytail.

## Wang Ming Prompt

```text
Use case: identity-preserve.
Create a transparent 4-column x 2-row 8-frame BACK-WALK sprite atlas.
Image 1 is the exact character identity, outfit, art style and proportions. Image 2 is the layout and back-walking motion reference ONLY. Replace the dark-haired black-hoodie man in image 2 with the light brown-haired ivory-hoodie man from image 1 across all eight cells.
Keep the original character's exact tousled light brown hair with cowlick, ivory hoodie with hood visible on the back, dark charcoal-blue trousers, white sneakers, outlines and proportions from image 1. Use only its BACK VIEW identity; no face visible.
Preserve the clear raised shoe pose in top-row cell3: RIGHT foot raised with sole facing viewer, left leg supporting; and bottom-row cell3: LEFT foot raised with sole facing viewer, right leg supporting.
IMPORTANT correct the motion layout: in the entire top row, RIGHT foot is trailing/moving while LEFT leg supports. In the entire bottom row, LEFT foot is trailing/moving while RIGHT leg supports. Column1 trailing heel low; column2 heel partly raised; column3 sole lifted high; column4 swinging foot passing forward/down. Opposite arm swing, no neutral idle frame. Row2 must be the opposite-leg half-cycle of row1. Correct any wrong-foot poses in the motion reference rather than copying them.
All eight characters exactly same scale, head center and ground baseline within equal cells. Keep head and hair design completely fixed across frames. Quiet walking away, not running or jumping. BACK VIEW only, show heels and soles not front toe caps. Full body with complete hair and feet, generous transparent margins and gutters. Landscape 1536x1024. GENUINELY TRANSPARENT alpha background with nothing outside the characters. No floor, cast shadow, backdrop, captions, numbers, grids or extra props.
```
