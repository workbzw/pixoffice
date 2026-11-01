# Aligned Boxed Office Walls V4

Generated on 2026-11-01 with the built-in OpenAI image-generation tool.

- Historical edit target: the previous boxed-room V3 image, removed after replacement.
- Final output: `exec-4998cef5-fcc2-42f7-b715-c8eabb910f27.png`.
- Active source: `room-whiteboard-v4.png`, native 1424 x 1105 pixels.
- Restored after V5 overshot the requested wall height.
- The generated PNG is copied without offline image alteration.
- This version is included in release; the rejected V5 is excluded.
- Measured front cap-to-face boundaries are near y=743 on both sides of the source.
- V5 moved the left boundary to about y=615 while leaving the right at y=743;
  that 128-pixel height discrepancy is rejected.
- The camera, floor footprint, door, plants, furniture and blank board retain their registration.
- The 1100 x 850 world and live whiteboard placement are unchanged.
- Panorama collaboration artwork and layout sizing are unchanged.

## Whiteboard Registration

The blank hanging whiteboard, aluminum frame, tray and contact shadow are baked
into the room. Only live structured task content is overlaid at runtime.
Relative to the whiteboard prop at (250, 200), content starts at (48, -160),
with width 435; the hit rectangle is (30, -165, 472, 181). The 778 x 314
content surface is uniformly scaled, without a replacement frame or wall patch.
Camera fitting preserves the background aspect ratio. Superseded V3/V5 and
open-room comparison files are not required to build this asset.

## Edit Prompt

```text
Use case: precise-object-edit.
Asset type: production background plate for an interactive office, precise architectural revision of the supplied image.
Input image: exact edit target, 1424 x 1105 boxed-office background. Keep this exact canvas size, framing, elevated frontal camera, perspective, room footprint, floor and wall-floor boundaries.
Primary request: the LEFT SIDE WALL is currently a low cutaway wall, whereas the RIGHT SIDE WALL has a much taller full-height section. Raise the LEFT SIDE WALL so both side walls have the SAME PHYSICAL HEIGHT at corresponding depths of the room. Match the right wall's visible height, top-cap thickness, architectural proportions and perspective on the left. In particular, the nearer/front section of the left wall must no longer taper down almost to the floor: it should rise to the corresponding height of the right wall, forming a balanced symmetrical-height room enclosure. Extend the existing plain white wall material upward; do NOT stretch or enlarge the door or objects. This is a wall-height correction, not a camera or room-scale change.
Keep the left door in the same location and at its existing size. Keep all left plants and planters in their current floor positions and visible on the interior side of the wall. Preserve the back-left bookcase, the back-right pantry and refrigerator, the right windows, the floor sunlight, and the complete empty central floor. Preserve the entire blank rear-wall whiteboard EXACTLY at its existing pixel location, size, shape and frame, because runtime text is calibrated to it. Keep the rear wall, right wall, room base, floor perspective and all existing objects unchanged as closely as possible. Retain natural wall thickness and coherent contact shadows.
Do NOT add a ceiling, window or new furniture to the left wall. Do NOT lower the right wall to match the left. Do NOT crop or zoom the room. Do NOT add people, desks, chairs, meeting furniture, UI, text, logos or watermarks. No new decorations or changes of style. Return the complete edited background only, sharp and clear, with the single requested left-wall height change.
```
