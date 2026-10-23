# Office Crafting Frames v1

The office work effect uses six low-resolution keyframes at about 6 FPS.
Its twelve-frame authoring source is retained for editing only, not loaded by the
browser. This is a scene effect, not a character pack or a new backend action.
It replaces the procedural floating-icon prototype.

## Soft White Clouds (Current)

- Active source: `spritesheet-white-cloud-soft.png`, 1448 x 1086 RGBA,
  twelve frames in a 4 x 3 grid of 362-pixel cells.
- Reused from PawOffice without repainting or regenerating pixels.
- Original ImageGen edits: `exec-57348979-600f-4b73-a8e5-f8eadaf867c0`
  and `exec-b28c0db7-91f3-419a-90ee-4be548532463` (2026-10-23).
- Compact connected white puffs, no black outline, stationery or detached plumes.
- Runtime display envelope: 160 world pixels, visible on both sides of a worker.
  Steady opacity is 100%; entry/exit fades and behind-worker sorting are retained.
- Six 160-pixel frames share one 480 x 320 atlas at about 6 FPS. No runtime
  filter, extra particle system or new backend command is required.

## White Cloud Core (Previous)

- Active authoring source: `spritesheet-white-cloud-core.png`, 1448 x 1086 RGBA,
  twelve frames in a 4 x 3 grid of 362-pixel cells.
- Edited with the built-in ImageGen tool on 2026-10-22.
- Cloud-core output ID: `exec-d8d33ee5-f6f0-44bd-9365-42e4c6dd262f`.
- Final output ID: `exec-a9a26bb3-79bf-403e-8132-8aff911221a5`.
- Only the compact inner cluster of rounded white puffs is retained, matching
  the user-provided detail. Tall outer gray plumes and curling ribbons are
  removed, along with all stationery and colored sparkles. Subtle pale-gray
  volume shading and neutral outlines still separate the white puffs.
- The generated 1446 x 1088 sheet was mechanically registered without painting
  or removing cloud pixels. Row crops are y=60..421, 450..743, 770..1074;
  transparent top padding is 0, 68, 57 pixels respectively. Horizontal crop
  intervals (left inclusive, right exclusive, row-major) are [39,331],
  [437,705], [773,1072], [1128,1429], [20,363], [384,735], [752,1095],
  [1137,1443], [30,368], [371,714], [756,1085], [1147,1435]. Each intact
  cluster is horizontally centered with transparent padding, without scaling.
  All frames share a 330-pixel cloud baseline and transparent footer.
- The six runtime keyframes, 480 x 320 atlas, playback, 80% opacity, seat offset
  and behind-character ordering remain unchanged. No filter or render layer is
  added. Older sheets below are retained as authoring history only.

Cloud-core edit prompt:

Use case: precise-object-edit. Image 1 is the full edit-target sprite sheet (1447 x 1087 RGBA, exactly 4 columns x 3 rows, twelve equal cells). Image 2 is the USER-APPROVED DETAIL: the compact inner cluster of fluffy rounded WHITE CLOUD PUFFS. Retain exactly that kind of inner white cloud cluster in each frame. DELETE all the OUTER GRAY UPRIGHT SMOKE: every tall hook-shaped gray plume, every large upward gray curling lobe, every long gray swirl/ribbon behind or beside the central white puff cluster. Those are explicitly rejected. Where an outer plume is deleted, leave clean alpha transparency, not a white replacement plume. The only remaining subject in every frame should be the little inner pile of overlapping bright-white rounded puffs, as shown by Image 2. Preserve that approved cloud's soft subtle pale-gray internal shading and thin neutral-gray outlines for separating the small white puffs; do NOT change it into blurry mist, realistic smoke, an oval blur, or a flat white blob. No big gray region behind the cluster. Preserve the twelve existing distinct white-core shapes and mild expansion/contraction phases, their lower-center positions, grid registration and approximate original core sizes. Keep the upper half of every cell empty. Remove any detached puff that belongs to the rejected tall plumes; a few small puffs immediately attached to the compact white core may remain. No tools, colored accents, stars, stationery, text, characters or furniture. Retain genuine transparent background, all cells separate with at least 8 pixels of clear gutter, EXACT 4 by 3 grid and 4:3 overall canvas aspect. Return the complete sprite sheet. The key instruction is: ONLY THE APPROVED INNER WHITE PUFF CLUSTER, NO OUTER GRAY CURLING SMOKE.

Registration follow-up prompt:

Use case: precise-object-edit. This is an approved twelve-frame WHITE CLOUD CORE sheet, 4 columns x 3 rows. Do not redesign, redraw, resize or recolor any cloud. Do not add tall gray plumes or blur the rounded white puffs. Make ONLY a sprite-grid registration cleanup: in EACH cell, translate the EXISTING compact white cloud cluster vertically so its lowest solid cloud outline sits on the SAME local y=320 baseline in an approximately 362 x 362 cell. Leave at least 30 pixels of completely transparent footer below each cloud; the cloud must NOT touch or cross a row boundary. This means moving the first-row clouds UP about 40 pixels and the second-row clouds UP about 30 pixels; bottom-row clouds need only a tiny adjustment. Do not replace a removed area with a different puff. Erase any stray ghost pixels right at a cell's top edge that leaked from the cell above; leave top 40 pixels fully transparent. Preserve all 12 cloud-core shapes, thin neutral gray separating outlines, pure white interiors, subtle pale-gray volume shading and small adjacent white puffs. Every frame must have at least 10 pixels of transparent left/right gutter and 30 pixels of footer, with no opaque mark in any cell edge. Keep the entire 4x3 sheet and its same 4:3 aspect ratio, true RGBA transparency, no extra clouds, no gray swirling extensions, no text, no labels, no visible grid or background. Output the full registered sprite sheet.

## Source And Registration

- Generated with the built-in ImageGen tool on 2026-10-19.
- Output ID: `exec-b748fe44-243e-4cb9-8191-bbea1e31972b`.
- Original output, unchanged: `spritesheet.png`, 1448 x 1086 RGBA.
- Original grid: 4 columns x 3 rows, 362 x 362 pixels per frame, row-major order.
- Scene attachment: own workstation, seated/back view only. The effect sits
  above the desk depth but behind the seated worker and chair, never in the UI
  overlay layer. Its flight envelope stays below the name label.
- All six workers share one atlas and six frame textures, with independent clocks
  and staggered playback phases. Demo and connected offices use the same rules;
  only running work emits the effect, not idle, blocked or queued tasks.
- Current phases: compact white puffs, gentle swelling and outward puffs,
  followed by contraction back to the compact cloud. The historical sources
  contain stationery and tall curls; the active sheet contains white cores only.
- Runtime selection: source frames 1, 3, 5, 7, 9, 12, downscaled to 160 x 160.
- Runtime atlas: 3 columns x 2 rows, 480 x 320 RGBA, about 0.59 MiB decoded.
- Timing: 170, 170, 170, 170, 170, 200 milliseconds, about 5.7 FPS.
- Pivot: frame center horizontally, 90% down vertically. All frames share one
  scale and anchor. No per-frame bounds fitting or tool transform animation.
- Scene offset: 32 world pixels above the seat anchor, while depth sorting stays
  tied to the seat so smoke remains behind the worker.
- Render opacity: 80% for the smoke sprite, multiplied by its
  existing fade-in, interruption and completion envelope. No filter or extra layer
  is required; frame count and playback timing are unchanged.
- Office render cadence: 20 FPS while idle or working seated, 60 FPS while
  walking or transitioning into/out of a seat. Simulation speed is unchanged.
- Characters: each appearance's existing `work.typing-back` whole-image frames, with
  their original identity, seat anchor and durations. No new character pixels
  were generated, registered, or published.
- Reduced motion: hold frame 1. Speaking, movement and seat transitions hide
  the effect. A completed task plays the short contracting tail and fades.

`scripts/build-office-assets.mjs` selects and downsizes the keyframes from
`spritesheet-white-cloud-core.png`, then builds
`effects/work-crafting-lite-v1.png` and its lossless WebP in the generated public
directory. Both public copies are ignored. The original and this prompt record
remain tracked. The browser never requests the original high-resolution sheet.

## Smaller Tools

- Half-size authoring variant: `spritesheet-small-tools.png`, 1448 x 1086 RGBA,
  with the same 4 x 3 grid, 362-pixel cells and ground registration.
- Edited with the built-in ImageGen tool on 2026-10-19.
- Initial resize output ID: `exec-d2e0fdea-8f61-4f8e-b8c7-a12f4cea474a`.
- Final placement output ID: `exec-efdbee39-45b6-4c2a-8f72-5fc95e4bc0c5`.
- Pencil, notebook and ruler target 50% of the original width and height.
  Matching notebook-colored bounds measure 60 x 54 -> 30 x 25 pixels in frame 1,
  86 x 104 -> 47 x 44 in frame 3, and 42 x 36 -> 20 x 19 in frame 12.
- Airborne tools are shifted toward the outer shoulders so the smaller objects
  remain visible behind the character instead of disappearing behind the head.
- Smoke keeps its original scene scale. Playback, frame count, runtime atlas
  dimensions and layering are unchanged. Current render cadence is listed above.
- The original `spritesheet.png` remains untouched as the source reference.

Edit prompt:

Use case: precise-object-edit. Edit target: the attached transparent 12-frame office work-effect spritesheet. Make exactly ONE change: in EVERY frame, reduce each yellow pencil, teal spiral notebook, and wooden ruler to 50% of its current width and 50% of its current height. This means one quarter of the original tool area, visibly much smaller, not a subtle reduction. Preserve the individual tool orientations, keep their flight-path centers and frame-specific poses at the same locations, and leave their newly freed space transparent. Keep the creamy smoke clouds at exactly the original sizes, positions, colors, silhouettes, and animation phases; do not shrink or enlarge smoke. Keep existing little sparkles and motion curls restrained and otherwise unchanged. Preserve the SAME 4 columns x 3 rows of equal square cells, same 12 chronological frames, same per-cell ground baseline and shared anchor. Preserve the complete original canvas composition and aspect ratio (1448 x 1086 reference canvas, 362 x 362 reference cells), all transparent gutters, and transparent alpha background. Only smoke and the three much smaller tools: do not add any person, furniture, labels, grid, background, watermark, or new object. Match the original soft shaded hand-painted chibi game style exactly. Do not merge, add, drop, or reorder frames. Return the complete edited transparent sprite sheet, not a preview scene.

Placement follow-up prompt:

Use case: precise-object-edit. Edit target: this transparent 1448 x 1086 spritesheet with 4 columns and 3 rows, 362 x 362 square cells. The pencil, notebook and ruler have ALREADY been reduced to the correct small size. Do NOT enlarge them or shrink them further. Keep exactly these small tool proportions and the original creamy smoke cloud silhouettes, sizes, cell registration and ground baseline. Make only a flight-placement correction so the small tools remain readable behind a character: in the middle airborne frames (frames 2 through 10, read row-major), move the small tools toward the OUTER LEFT and OUTER RIGHT shoulders of each cell, outside the central character silhouette. In 362-pixel cell coordinates, use tool centers around x=55 when on the left and x=307 when on the right, with airborne centers around y=70 to 150. Let each existing tool keep its existing left/right side, orientation and animation phase; no duplicates. Avoid the central rectangle x=90..272, y=90..280 for airborne tools, because a character's head will occlude this region in the game. Keep all small tools entirely inside each cell with at least 12 pixels of transparent edge gutter. Preserve the first and last compressed/contracting phases, where tool tips may naturally tuck into the smoke. Keep smoke, colors, soft hand-painted chibi shading, sparkles, alpha transparency, 12 distinct frames and the same exact 4x3 grid otherwise unchanged. No person, furniture, background, border, text, labels, extra objects or watermark. Return the complete transparent spritesheet at the same aspect ratio and canvas framing.

## White Smoke

- Historical white-smoke variant: `spritesheet-small-tools-white-smoke.png`,
  1448 x 1086 RGBA with the original 4 x 3 grid and 362-pixel cells.
- Edited with built-in ImageGen on 2026-10-19.
- Initial recolor output ID: `exec-6e88757b-1757-4b70-abd7-d616da2ee451`.
- Final gutter repair output ID: `exec-845f281c-944a-427e-8e7d-f4ad2ce736c5`.
- Smoke puffs, outlines and motion curls use neutral white and light gray.
  Small colored tools and golden sparkles retain their original palettes.
- The half-size tools, runtime atlas dimensions, six-frame timing, layering and
  fade behavior are unchanged. Current render cadence, opacity and vertical
  offset are listed under Source And Registration.
- Earlier source variants are retained for authoring history, not loaded by the
  browser or included in the runtime asset catalog.

Edit prompt:

Use case: precise-object-edit. Asset type: production transparent office work-effect sprite sheet. Edit target: the provided 1448 x 1086 RGBA sprite sheet, 4 columns x 3 rows of 362 x 362 equal cells. Change ONLY the smoke color: recolor every creamy yellow/tan cloud puff, beige/brown cloud outline, and warm yellow/tan smoky motion curl to NEUTRAL WHITE smoke with soft LIGHT NEUTRAL GRAY shading and neutral gray outlines. The smoke should look clean white, not yellow, ivory, beige, blue, or brown. Keep the same soft hand-painted chibi game style, exact puff shapes, silhouettes, sizes, positions, smoke densities, alpha coverage and animation phases. This is a pure smoke palette change, not a new composition. PRESERVE the already small yellow pencils with pink erasers, teal notebooks, wooden rulers, their precise sizes, colors, orientations and current outer-shoulder flight placements. Preserve small golden star sparkles as accents; do not turn tools white. Preserve exactly 12 chronological distinct frames in exactly the same 4x3 grid, same complete canvas aspect ratio and ideally exactly 1448 x 1086 output, same shared ground registration in every cell, same transparent gutters. Keep all art inside its own cell. Background must be genuinely transparent RGBA with clean alpha, no opaque rectangle, no checkerboard, no colored fringe or new background. No person, furniture, text, labels, borders, watermark, new object, added frame, merged frame or dropped frame. Return the complete edited sprite sheet.

Gutter repair prompt:

Use case: precise-object-edit. One tiny erasure only in this transparent 4x3 sprite sheet. Target: TOP ROW, SECOND FRAME. Erase the small DETACHED smoke puff at the far right of that one frame (approximately local x=325..362, y=245..310, global x=687..724, y=245..310). Replace that detached little puff with clean full transparency. Remove the whole small detached far-right puff, not just a sliver. Keep the main large white cloud and the rest of frame 2 exactly unchanged. Absolutely preserve all other 11 frames, including the small colored pencils, teal notebooks, wooden rulers, white/neutral-gray smoke and gold sparks. DO NOT resize, enlarge, move, redraw, recolor or change any tool. Preserve the EXACT 1448 x 1086 canvas, exact four equal 362-pixel-wide columns and three equal 362-pixel-high rows, original transparent gutters and alpha. The complete second cell right boundary must be fully transparent. No additions. Return the full spritesheet, with only that one detached puff removed.

## Prompt

Use case: stylized-concept. Asset type: a production 12-frame 2D game sprite sheet for an office crafting / repairing work-effect overlay, inspired by the energetic crafting dust-puff animation language of cozy life-simulation games. Create a SINGLE transparent RGBA sprite sheet, 2048 by 1536 pixels, EXACTLY 4 columns by 3 rows of equal 512 by 512 cells, 12 chronological animation frames read left-to-right then top-to-bottom. No grid lines or labels. The attached character image is STYLE REFERENCE ONLY: match its softly shaded chibi game illustration, warm clean outlines and hand-painted colors. DO NOT DRAW any person, body, head, desk, computer, chair or background. Only animated cloud puffs and three physical stationery tools: a long yellow wooden pencil with pink eraser, a small teal spiral notebook with cream pages, and a wooden ruler with dark tick marks. They must look like shaded tangible game props, NOT flat UI icons. In each cell, all activity stays within x=45..467 and y=65..440 with ample transparent gutters. Keep the center and ground baseline consistent across all 12 cells. The main cloud is a compact rotating cluster of creamy-white rounded dust puffs, subtly shaded warm pale gray, centered at (256,330), roughly 330 wide and 140 tall. Short curved motion strokes and tiny spark flashes are allowed. The tools burst upward out of the cloud in different diagonal directions, turn through clearly different angles, arc and fall back into it. The action must evolve dramatically across the sheet, not twelve static copies. Frame 1: small compressed puff and tool tips peeking out. 2: first impact expands the puff, pencil shoots diagonally up-left and ruler up-right. 3: notebook flips out at upper right, pencil ascends. 4: pencil and ruler tumble at top of their arcs, cloud curls sideways. 5: notebook wide open at the apex on the left, ruler vertical on the right. 6: tools begin descending, puff squashes. 7: second stronger impact, puff swells, pencil emerges on the right. 8: all three tools fly at strongly changed angles, notebook on the left. 9: pencil and ruler exchange height, notebook tumbles. 10: tools fall inward and cloud rolls. 11: tools mostly disappear into contracting cloud. 12: return nearly to the first compact puff for a smooth looping cycle. Do NOT include a hammer, wrench, keyboard, loose document icon, gear, logo, text, panel or watermark. True transparent background, no fake checkerboard, no shadows outside the cloud, no opaque rectangular background. Consistent tool size and brush style in all frames. Each frame is a single connected effect cluster suitable for equal-grid atlas slicing.

Style reference: `art/characters/packs/app-agent/work/typing-back-v2/001.png`.
The output size differs from the requested size; the measured 362-pixel grid is
used without resizing or reslicing the original art.
