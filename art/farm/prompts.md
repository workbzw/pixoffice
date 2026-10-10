# ImageGen source record

Generated 2026-10-10 with the built-in ImageGen tool; no external commercial asset library.

## Background

Output: `exec-595e4659-ed69-4b27-9142-bf1d247d2895.png`, copied to `originals/background.png`.

Bright miniature farm, elevated straight-on camera, 4:3 landscape. Empty central pale-green lawn for dynamically placed beds and characters. White fence at borders, a small white tool shed at upper left, modest plants and trees only at edges, entrance at bottom centre. Clean miniature 3D materials, soft daylight. No people, crops, text, watermark or UI.

## Farming frames

Output: `exec-8f209d32-9354-4a2b-a9f8-3ef4dc30122b.png`, copied to `originals/work-sheet.png`.

Identity reference: `art/characters/packs/marvis/idle/back/001.png`, inspected before generation. Transparent sheet, four columns by three rows. Same full-body back-facing chibi character in off-white hoodie and navy trousers. Row 1: planting seeds, four ordered frames. Row 2: holding and tilting a blue watering can, four ordered frames. Row 3: reaching then lifting a carrot bunch, four ordered frames. Fixed proportions, visible shoes, no sitting/kneeling, no body-part assembly, no scenery or UI. Registration uses one common scale and per-row shared floor baseline.

## Crop beds

Output: `exec-5aeef69f-001c-42d1-89b7-74f73f5c94a4.png`, copied to `originals/plots.png`.

Transparent sprite atlas, three columns by four rows. Columns: carrot, tomato, cabbage. Rows: empty soil bed, seedlings, growing plants, harvest-ready plants. Same elevated front camera, white low wooden rectangular bed and dark soil in every cell. Six plants per bed, generous gutters. Bright clean miniature 3D style, no people, labels, UI or watermark.

## Ground and independent plants (replacement)

Built-in ImageGen outputs `exec-88bc049c-252c-4d66-9d41-4850003e5848.png` and `exec-308dfe59-9826-4960-bf5e-37edb17ca369.png`, saved as `originals/soil.png` and `originals/plants.png`.

Soil prompt: one flat, freshly tilled rectangular patch of dark earth, directly in the lawn, with three subtle furrows. Same elevated frontal camera and miniature 3D style as the farm background. No wood, raised bed, plants, scenery, text or watermark. Transparent background. Cleanup edit: preserve the earth and furrows, remove all diffuse haze/glow/shadow outside the solid soil silhouette, keep a clean natural alpha edge.

Plant prompt: transparent 3x3 atlas, columns carrot/tomato/cabbage, rows seedling/growing/mature. Exactly one isolated plant per cell, same camera and daylight; ground-contact stem base at the bottom-center. No soil, box, pot, roots below ground, cast shadow, labels, grid or watermark. Six instances are rendered at fixed planting points over separate soil.

## Plot sign

Built-in ImageGen outputs `exec-c7fbb7c4-f190-4faf-9b55-f116e3323dae.png` and cleanup `exec-b058980e-a86d-4e0d-9a7c-2acbefde9fc7.png`; the cleaned version is saved as `originals/plot-sign.png`.

Final prompt: One isolated blank wooden garden sign for a cozy vegetable farm game. Warm softly shaded hand-painted miniature illustration. Pale honey-colored rectangular plaque attached to one centered vertical wooden stake. Nearly straight-on face with a slight elevated front view so live text can lie flat on the plaque. Plaque width about three times its height, a clean pale central writing area, subtle rounded wood corners, grain only near the outer edges. Stake visible below and tapering at its bottom. No letters, numbers, symbols, plants, soil, grass, scenery, watermark or UI. Transparent background, no diffuse halo. Cleanup: preserve wood, stake, proportions, color and details; remove all glow, haze and background outside the solid wooden silhouette, retaining clean natural alpha edges.

## Decorative hens

Built-in ImageGen output `exec-5f178bcc-f0f4-4392-b6d3-e7ac4a63523d.png`, retained as `originals/chickens.png`. The farm background was a style reference, not an edit target.

Final prompt: Use case: stylized-concept. Game-ready transparent animation sprite sheet for a cozy illustrated vegetable farm. Match the reference background's warm hand-painted, softly shaded storybook game style. One small plump white hen, red comb and wattle, golden beak, orange feet, cream feathers. Transparent background; no ground, scenery, text, grid, watermark or shadow. Four columns and six rows, 24 complete sprites, equal cells, generous margins, same scale and foot baseline, elevated orthographic camera. Rows 1-3: four gentle walking poses facing left, away, and toward camera, alternating feet with subtle head bob. Rows 4-6: four pecking poses in the same views: upright, head half down, beak near ground, head half up. Planted feet during pecking, only head/neck and slight torso lean change. No missing parts, overlaps, labels, props or seeds. Readable at small size. Right-facing uses a horizontal mirror of left-facing artwork.

### Side-walk and rear-peck correction

Built-in ImageGen output `exec-0b775f2d-fb10-473e-b688-a330a7d03f8a.png`, saved as `originals/chickens-motion-v2.png`. The original hen sheet was inspected and used only as an identity/style reference. Output is 1280x1280 with real alpha, four columns by two rows. Only these two clips are replaced; the other four remain unchanged.

Final prompt: Use case: identity-preserve / precise-object-edit. Create a replacement game animation sprite sheet with exactly 4 columns and 2 rows, 8 complete full-body white hen sprites on genuinely transparent background. The input is identity and soft illustrated farm style reference ONLY, do NOT copy its incorrect poses. Same plump cream-white hen, red comb, orange feet, warm storybook painterly shading. Square 1024x1024 sheet, equal 256x512 cells. Each sprite centered in its cell, approximately 180 pixels tall, feet at the same local baseline about 370px, lots of transparent gutters. SAME body/head size in all 8 frames, no shadows, no text, no grid, no scenery. Row 1: SIDE VIEW FACING LEFT, a genuine 4-frame alternating two-leg walk cycle. Frame 1 nearest leg steps far forward LEFT, far leg planted back RIGHT. Frame 2 nearest foot planted, far leg lifts and crosses under body. Frame 3 FAR leg steps far forward LEFT, nearest leg planted back RIGHT, the OPPOSITE of frame 1. Frame 4 far foot planted, nearest leg lifts and crosses. Show BOTH orange legs clearly separated, with far leg slightly darker. Feet must visibly alternate, do not duplicate the same raised leg in every frame. Keep torso scale consistent. Row 2: STRICT REAR VIEW FACING AWAY FROM VIEWER the whole time, a pecking cycle: upright, head lowers forward on FAR SIDE behind torso, lowest peck on far side, halfway rise. Tail and rump ALWAYS face camera in every rear frame; wings are left and right of rump; beak and eyes MUST NEVER appear at the bottom/front of rump. When bending forward away from camera, head and beak become occluded by body, only comb partly visible ABOVE upper silhouette in halfway frame; lowest frame shows rounded rear rump, raised little tail and lowered shoulders, NOT a forward-facing face. Keep both feet planted unchanged on the same baseline, body can lean slightly, do not flip orientation or turn toward viewer. Complete coherent sprites only, no separate body parts. High quality crisp alpha edges.
