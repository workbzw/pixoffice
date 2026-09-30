# Indoor back walking, version 1

Generated on 2026-09-27 with the built-in image_gen tool, not the CLI.
Final asset: indoor-back-walk-v1.png (1024 x 1536, RGBA).
Final output: exec-91a4dd1e-aaae-4414-a34c-05478508200f.png.

The four columns are low left-foot step, passing, low right-foot step,
passing. The six rows are marvis, code-agent, file-agent, app-agent,
review-agent, data-agent. The runtime locates transparent gutters and registers
each resident's four whole-body frames to a common head anchor and ground line.
Playback is one second per full cycle. No limb warping, optical-flow
interpolation, Spine data, or added vertical bounce is used.

The earlier back-walk-v1 assets are retained unchanged as the running gait and
loaded only on demand in Character Preview. Front/side walking, expressions,
seat transitions, navigation, collision geometry and movement speed are unchanged.
Generated drawing details can still differ slightly between frames.

## Original generation prompt

Reference inputs: marvis.png, code-agent.png, file-agent.png, app-agent.png,
seated-turn-right-v1.png. Output: exec-cee53c17-e428-4e9e-9588-07a84778847c.png.

```text
Use case: identity-preserve. Production game sprite atlas, transparent PNG.
Create ONE sprite atlas with EXACTLY 4 columns and 6 rows, 24 whole-body characters total, one character identity per row. Portrait 2:3 canvas, ideally 1536 x 2304. Every cell equal size, clear fully transparent gutters. No labels, lines, numbers, shadows, floor, background, checkerboard, or props.
The first FOUR input images are identity/style references for rows 1 through 4 respectively. The FIFTH reference shows all six identities seated, arranged three columns by two rows: its bottom-middle character is output row 5, its bottom-right character is output row 6. Use these only for identity/style, never copy the sitting pose or background. Match their existing clean hand-painted chibi lineart, hair silhouettes, outfit details, body proportions and white shoes. Only BACK VIEW, facing straight away, no face visible.
Row 1: sandy brown short hair with cowlick, ivory hoodie, dark blue charcoal pants.
Row 2: brown high ponytail, sage green sweater, ivory pants.
Row 3: black tousled short hair, black hoodie, beige pants.
Row 4: long auburn wavy hair, ivory knit sweater, blue jeans.
Row 5: chestnut short hair, ivory shirt, gray apron straps and bow on back, dark charcoal pants.
Row 6: blue-black bob hair, muted blue cardigan, ivory pants.
Primary request: a calm INDOOR WALK cycle, NOT jogging/running, NOT marching. This is crucial: nearly straight legs, low foot clearance, feet near the ground, small stride, relaxed arms hanging low with subtle opposing swing. No knees bent sharply up, no raised rear foot at calf height, no big sole facing the viewer. At least one foot always supports the body. Upright body, head centered and level, no head bob, no lean forward. Both arms stay below waist.
Each row has these FOUR successive distinct walk poses:
column 1: left foot supporting and slightly forward (away from camera), right foot trailing just slightly behind with its heel only barely raised;
column 2: left foot supporting, right foot passing beside left with toes just above ground, near-straight knee;
column 3: right foot supporting and slightly forward, left foot trailing just slightly behind with heel only barely raised;
column 4: right foot supporting, left foot passing beside right with toes just above ground, near-straight knee.
The feet alternate sides visibly but gently. Keep shoes almost horizontal; only a thin heel rim visible, NOT a large full sole. The overall top-to-bottom distance must be the same across all four poses in a row. Keep head/hair/clothes identical across the row. Full silhouettes including entire hair and shoes, good margins in each cell. No detached limbs. This is an animation atlas, not a contact sheet with descriptions.
```

## Four-phase correction prompt

Input: the preceding generated atlas.
Output: exec-5d515828-d501-4ac1-85f2-6ec52ef80ab5.png.

```text
Edit this transparent sprite atlas, preserving the EXACT six character identities, outfits, art style, row order, four-column/six-row grid, and whole-body proportions. This is a production walking animation.
Target correction only: the four columns currently repeat left/right step extremes instead of a proper four-phase gentle walking loop. Make EVERY row have these four genuinely different consecutive poses:
1. LEFT foot trailing a tiny distance behind, RIGHT foot planted.
2. LEFT foot passing just beside the planted RIGHT foot; both ankles almost aligned, almost straight knees, a narrow stance.
3. RIGHT foot trailing a tiny distance behind, LEFT foot planted. The opposite leg to column 1.
4. RIGHT foot passing just beside the planted LEFT foot; both ankles almost aligned, almost straight knees, a narrow stance. Opposite arm swing to column 2.
Backs facing directly away. For the ponytail woman especially, no cheek visible, shoulders straight symmetrical, no three-quarter turn.
A quiet indoor WALK, never run or march: feet stay near ground, only subtle heel lift, almost horizontal shoes, no large sole facing viewer, no raised calf, arms loosely down below the waist with a very subtle alternating swing. No high knees or running lean.
Keep the head and upper torso absolutely stable across all four frames in each row, same size, same position in each equal-size cell. Clear transparent gutters between all characters, fully contained hair/shoes. Entire backdrop must remain truly alpha transparent, no shadow or glow or gradient pixels. No text, grid, labels, floor. Exactly24 complete figures, 4columns by6rows.
```

## Final alternating-leg correction prompt

Input: the preceding corrected atlas.

```text
Precise animation correction to this existing transparent 4-column by 6-row sprite atlas. Keep all characters, all faces hidden, exact hair, clothes, layout, style, scale, and transparency unchanged.
ONLY change the LEGS and FEET in columns 3 and 4. Leave columns 1 and 2 exactly unchanged. Leave all heads and torsos unchanged.
For EVERY row: in column 3, the RIGHT shoe on the RIGHT side of the image must be the rear / lifted shoe and have its heel just above the ground. The LEFT shoe must be flat planted on the ground. In column 4 the RIGHT foot passes very close beside the planted LEFT foot, both knees nearly straight. They are the opposite lower-body poses to columns 1 and 2.
Most important row3 (black hoodie beige pants), row4 (auburn long hair blue jeans), row6 (blue cardigan ivory pants): they currently repeat the LEFT lifted foot in column3; fix this to the RIGHT lifted foot. Do not mirror the entire character or hair. Only swap the lower-body leg poses across the midline within the same frame.
Keep this a quiet small indoor walk with very low foot clearance, no jogging, almost straight legs, no high soles, no high knees, minimal heel lift. At least one foot flat on the same ground line. 24 whole-body figures. Maintain actual transparent alpha everywhere else. No background, text, floor or shadows.
```

