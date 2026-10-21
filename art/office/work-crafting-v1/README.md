# Office Crafting Frames v1

The office work effect uses six low-resolution keyframes at about 6 FPS.
Its twelve-frame authoring source is retained for editing only, not loaded by the
browser. This is a scene effect, not a character pack or a new backend action.
It replaces the procedural floating-icon prototype.

## Source And Registration

- Generated with the built-in ImageGen tool on 2026-10-19.
- Output ID: `exec-b748fe44-243e-4cb9-8191-bbea1e31972b`.
- Original output, unchanged: `spritesheet.png`, 1448 x 1086 RGBA.
- Grid: 4 columns x 3 rows, 362 x 362 pixels per frame, row-major order.
- Scene attachment: own workstation, seated/back view only. The effect sits
  above the desk depth but behind the seated worker and chair, never in the UI
  overlay layer. Its flight envelope stays below the name label.
- All six workers share one atlas and six frame textures, with independent clocks
  and staggered playback phases. Demo and connected offices use the same rules;
  only running work emits the effect, not idle, blocked or queued tasks.
- Ordered phases: compact cloud; first impact; upward tool arc; tumble; open
  notebook at apex; descent; second impact; outward burst; turnover; inward
  descent; contraction; compact cloud.
- Tools: yellow pencil, teal spiral notebook, wooden ruler. No keyboard or
  document UI icon.
- Runtime selection: source frames 1, 3, 5, 7, 9, 12, downscaled to 160 x 160.
- Runtime atlas: 3 columns x 2 rows, 480 x 320 RGBA, about 0.59 MiB decoded.
- Timing: 170, 170, 170, 170, 170, 200 milliseconds, about 5.7 FPS.
- Pivot: frame center horizontally, 90% down vertically. All frames share one
  scale and anchor. No per-frame bounds fitting or tool transform animation.
- Scene offset: 32 world pixels above the seat anchor, while depth sorting stays
  tied to the seat so smoke remains behind the worker.
- Render opacity: 80% for the combined smoke/tool sprite, multiplied by its
  existing fade-in, interruption and completion envelope. No filter, extra layer
  or bitmap change is required; frame count and playback timing are unchanged.
- Office render cadence: 20 FPS while idle or working seated, 60 FPS while
  walking or transitioning into/out of a seat. Simulation speed is unchanged.
- Characters: each appearance's existing `work.typing-back` whole-image frames, with
  their original identity, seat anchor and durations. No new character pixels
  were generated, registered, or published.
- Reduced motion: hold frame 1. Speaking, movement and seat transitions hide
  the effect. A completed task plays the short contracting tail and fades.

`scripts/build-office-assets.mjs` selects and downsizes the keyframes from
`spritesheet-small-tools-white-smoke.png`, then builds
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

- Active authoring variant: `spritesheet-small-tools-white-smoke.png`,
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
