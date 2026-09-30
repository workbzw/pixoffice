# Seated Head Turn

Asset: `seated-turn-right-v1.png`, 1536 x 1024 RGBA, six whole-character
poses in the same 3 x 2 roster order as `seated.png`.

The body remains seated and back-facing; the head looks over the shoulder
to screen right. Left uses a mirrored pose. These are complete sprite frames,
not a detached head overlay, a standing frame, or a new skeleton.
Normal back-facing seated poses still use the original atlas.

Created with the built-in OpenAI `image_gen` tool, not the CLI.
Output: `exec-76e1bdc3-421f-4ff4-a240-b1a14c4e870f.png`.
References: `seated.png` (edit target), `code-agent.png` and
`file-agent.png` (face identity references).
The generated alpha is preserved; no post-generation background removal.

## Exact Prompt

```text
Use case: precise-object-edit. Asset: transparent 2D game character sprite atlas. Edit image 1 (seated.png) into a matching seated head-turn atlas. Images 2 and 3 are facial identity references only for the ponytail woman and black-haired glasses man. Keep image 1's EXACT six identities, clothes, clean chibi anime drawing style, proportions, body size, seated body pose and grid order. Change ONLY head orientation: ALL SIX heads turn toward SCREEN RIGHT (their left), showing a clear right-facing face profile with eye, small nose and friendly mouth. Their TORSOS, HIPS, LEGS AND FEET REMAIN SEATED FACING AWAY, identical to image 1, so they look over one shoulder toward a visitor on the right, not turn their whole body. Upper back remains visible, hoodie hoods and apron straps stay on the back. No standing, no walking, no twisting legs, no floating cutout heads. Whole intact full-body sprites, smooth neck connections. Exact 3 columns by 2 rows, landscape 1536x1024, equal 512x512 cells. Top row: sandy-haired man ivory hoodie dark blue trousers; brown ponytail woman sage sweater ivory trousers; black tousled-haired man ROUND GLASSES black hoodie beige trousers. Bottom row: auburn wavy bob woman ivory knit sweater blue jeans; chestnut short-haired man ivory shirt gray apron with back ties dark trousers; navy-black bob woman dusty-blue cardigan ivory trousers. Keep heads around the same height as original, feet aligned to common baseline with 30px clear bottom margin in each cell, ample transparent gutters and all hair/shoes unclipped. No chair, no desk, no floor, no shadow, no glow, no background pixels, no text, no grid lines. Genuine alpha transparency outside the six figures.
```
