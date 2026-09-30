# Fixed-chair seat transitions

Generated on 2026-09-27 with the built-in OpenAI `image_gen` tool, not the CLI.

- Asset: `seat-transition-v1.png`.
- Output ID: `exec-e4d81700-fc2c-4db6-9a2c-56eeb0d79385.png`.
- References: existing `seated.png` for all six identities and seated bodies;
  existing `marvis.png` for line quality and standing proportions.
- Returned size: 1086 x 1448, RGBA with transparent background.
- Grid: 3 columns x 4 rows. No furniture, shadows, or separate body parts.
- Cells 0-5: forward-lean seated poses in roster order (marvis, code-agent,
  file-agent, app-agent, review-agent, data-agent).
- Cells 6-11: half-rise poses in the same order.

The runtime detects transparent gutters and trims complete character poses.
Seat transitions select these keyframes between the original seated and standing
frames. Sitting reverses the posture sequence. Entry and exit always face their
actual movement direction and play the existing whole-body walk sheet forward.
Chairs and their occupied markers never move during the interaction.
This is a compact frame-animation transition, not a skeletal or physics simulation.

## Exact Prompt

```text
Use case: precise-object-edit. Asset: transparent sprite animation atlas for the existing six office characters. Image 1 (seated.png) is the exact six-character identity/body/clothing/back-view reference. Image 2 (marvis.png) is the exact line-art and standing proportion reference. Create TWELVE whole-body sprites: TWO new intermediate sit-to-stand poses for EACH of those same six people. Genuine transparent alpha, no shadow, no glow, no floor, NO chairs or furniture. Requested portrait 1536x2048, EXACTLY 3 equal columns and 4 equal rows, one full intact character per cell, generous clear transparent gutters, 32px margins, feet at a consistent baseline within each row. Clean soft chibi anime, matching head sizes, clothing, outline and shading of the references. Bodies always FACE AWAY FROM VIEWER, rear view, head facing forward away, no face. Do not turn the whole person to camera. Every sprite is complete, no separate cutout body parts. ROWS 1 AND 2 = POSE A, all six characters in reference reading order: still SEATED on an invisible office chair, feet planted, torso leaning forward about 15 degrees, hands near thighs ready to rise, knees bent, clearly seated compact bent legs. ROWS 3 AND 4 = POSE B, the SAME SIX in same reading order: HALFWAY STANDING UP from the invisible chair, hips lifted, knees still bent, leaning slightly forward, arms lowering naturally beside body, legs half extended. Intermediate bent-leg pose visibly taller than POSE A, shorter than full standing. Keep heads the same size between poses, do not stretch/scale the whole character to imply movement. Grid identities: row1 and row3 = sandy tousled short-haired man ivory hoodie dark charcoal-blue trousers white shoes; brown high ponytail woman sage green sweater ivory trousers white shoes; black tousled short-haired man black hoodie beige trousers white shoes. Row2 and row4 = auburn shoulder-length wavy hair woman ivory knit sweater blue jeans white shoes; chestnut short-haired man ivory shirt gray apron with straps and bow on BACK dark trousers white shoes; navy-black bob hair woman muted dusty blue cardigan ivory trousers white shoes. Keep exactly these outfits with back hoods and apron ties visible. No props, objects, labels, lettering, borders or checkerboard. Do not draw a standing idle pose as Pose A. Clear seated forward-lean and half-rise keyframes are essential.
```
