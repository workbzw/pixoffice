# Marvis refined walking prompts

Generated with the built-in OpenAI `image_gen` tool on 2026-09-25, not the CLI.
Original character identity reference: `marvis.png`. Front and back requests
also referenced the generated right-facing sheet for consistency. Output PNGs
were copied without bitmap editing; runtime texture registration is in
`src/scene/characters/apartmentFrames.ts`.

## Right

File: `marvis-walk-right.png`

Generation output: `exec-dab454cc-7ebc-49a9-bdda-7f8182332ca9`

```text
Use case: identity-preserve. Asset type: production 2D game animation sprite sheet.
The reference is the exact approved character identity, NOT the required output layout.
Create a refined eight-frame WALK CYCLE of ONLY the sandy-light-brown tousled-haired young adult man in an ivory hoodie, charcoal-blue trousers, white sneakers, matching the reference's exact soft chibi illustration style and proportions. Same neutral relaxed closed-mouth face and SAME head/hair shape, size, clothing and colors in EVERY frame. Keep the large head registered in place. No outfit, face, style or body-shape variations.
Output: ONE transparent-alpha landscape PNG sprite atlas, requested 1536x1024, exactly FOUR EQUAL COLUMNS by TWO EQUAL ROWS, 8 separate full-body figures in row-major chronological order. Every figure in STRICT RIGHT-FACING SIDE PROFILE, nose and feet toward screen RIGHT. Only right profile, NO front or back view.
Natural understated walking, NOT running, NOT marching: small comfortable steps, heel strike, weight transfer, toe push-off, knee bend, opposing relaxed arm swing. Arms hang mostly down, hands below waist; no pumping fists.
Frame sequence: 1 left heel forward contacting ground/right toe behind; 2 left leg accepting weight/right heel lifting; 3 right leg passes under hip, left leg supporting; 4 right knee advancing, left toe preparing push-off; 5 right heel forward contacting ground/left toe behind; 6 right leg accepting weight/left heel lifting; 7 left leg passes under hip, right leg supporting; 8 left knee advancing, right toe preparing push-off. Frame 8 loops smoothly to frame 1.
Very important: all 8 identical head silhouettes and sizes; pelvis stays at SAME cell-relative horizontal center; no travel across each cell. Natural body bob only 1-2 percent height. Same fixed scale, ground baseline and camera across frames. Figure height about 420 pixels in each 384x512 cell, baseline about y=468 within cell. Generous transparent margins and gutters. Preserve shoe contacts. Small, consistent stride width suitable for an office.
Background genuinely transparent alpha, no white background, checkerboard, shadows, labels, grid, furniture, extra people, props or text. Use fine clean warm dark outlines, soft shading exactly like reference. All hair and feet fully visible. These are registered sequential animation frames, NOT a collection of random poses.
```

## Front

File: `marvis-walk-front.png`

Generation output: `exec-e48d9fa5-97be-4907-a703-de2960ff4340`

```text
Use case: identity-preserve. Asset type: production 2D character WALK sprite atlas.
Reference 1 is the approved character design and directions. Reference 2 is the approved refined SIDE walk cycle, for consistent art, scale, clothing and 4x2 layout only.
Generate the matching FRONT-FACING eight-frame walk cycle for EXACTLY THIS SAME sandy-light-brown tousled-haired young man, ivory hoodie, dark charcoal-blue trousers, white sneakers. Soft chibi illustration, warm fine outlines, very large consistent head with identical hair shape, brown eyes, small relaxed closed mouth in ALL frames. Do not make him talk or change expression.
One landscape PNG with GENUINE TRANSPARENT ALPHA, exactly 4 EQUAL columns x 2 EQUAL rows, requested 1536x1024, eight full-body FRONT VIEW frames read left-to-right top-to-bottom. Every frame faces directly toward viewer, NO side view, NO rotation or perspective change.
A natural subtle WALK TOWARD CAMERA IN PLACE: 1 left foot forward contact and right arm slightly forward; 2 left foot supporting body and right heel lifting; 3 right foot passing beside left calf; 4 right leg swinging forward; 5 right foot forward contact and left arm forward; 6 right supporting and left heel lifting; 7 left foot passing beside right calf; 8 left leg swinging forward. Smooth cyclic continuity 8 to 1. Visible left/right alternating feet, understated walking not marching. Arms relaxed low at sides, no fists raised. Walk on a level floor; no jumping.
Keep head, torso and hip centers consistently registered at center of each cell; same facial features, same hoodie drawstrings and exact silhouette each time except natural arms/legs and tiny torso weight shift. Ground baseline consistent near y=468 per 512px cell, figure height roughly 420px, all hair and feet included. No independent pose resizing. Transparent gutters.
No background, colored glow, floor shadows, captions, grid lines, text, props or furniture. Preserve reference character. This is a registered animation sequence, not eight different stickers.
```

## Back

File: `marvis-walk-back.png`

Generation output: `exec-4e075e59-0ff9-4900-8227-83eef48cbe6d`

```text
Use case: identity-preserve. Asset type: production 2D character WALK sprite atlas.
Reference 1 shows the exact existing young man from front/side/BACK; its THIRD ROW defines the rear hair and hoodie. Reference 2 is his newly refined right-facing walk sheet, for matching quality and 4x2 layout ONLY.
Create matching BACK-VIEW eight-frame gentle walk cycle of this exact sandy-light-brown tousled short-haired chibi young adult man in an ivory hoodie WITH hood visible on upper back, charcoal-blue trousers and white sneakers. All eight frames face directly AWAY FROM VIEWER. NO facial features visible. Exact same head silhouette, clothing, proportions and colors across all frames.
Output ONE transparent-alpha landscape PNG, requested1536x1024, exactly 4 equal columns x 2 equal rows, 8 figures in chronological row-major order, EACH cell one full-body character. Natural walking away from camera IN PLACE, no translational movement within cell, no rotation, no running. Small relaxed steps and opposite arm swings, hands low near hips.
Frames1-4 one step: left leg forward away/right leg trailing toward viewer with sole partly visible; transfer weight left and lift right heel; right foot passes under hip; right leg advances away. Frames5-8 opposite step: right leg forward/left leg trailing with sole partly visible; transfer weight right/lift left heel; left foot passes under hip; left leg advances away. Frame8 loops seamlessly into frame1. Smooth incremental leg changes instead of random posing.
Keep every head identical size and shape and centered within its cell. Consistent ground baseline approximately y468 in each512px cell, figure height about420px. Tiny natural bob under2% height. Never resize independent frames. Clean fine warm dark outlines and soft shading matching reference. Large transparent margins, no clipping.
Genuinely transparent alpha background, NO floor, background color, shadows, labels, numbers, grid lines, furniture, props or extra characters. This is registered sprite animation art, not an illustration collage.
```

