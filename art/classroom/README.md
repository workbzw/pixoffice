# Classroom Artwork

Created for PixOffice using the built-in image-generation tool on 2026-10-07.
No downloaded third-party furniture or room artwork is used.

## Prompt Set

- `room.png`: New bright modern classroom, centered elevated straight-on cutaway view, white walls and pale gray floor, clock and educational posters, side windows and bookshelf, empty floor and central back wall for programmatic furniture/blackboard. No people, desks, chairs, kitchen or text. Transparent outside the room. The existing PixOffice office background was a camera/rendering-style reference only.
- `desk.png`: One small classroom desk, elevated straight-on view from the student side, pale birch top, white metal legs, gray shelf, notebook and blue pencil. No chair or person, transparent background, soft miniature 3D style.
- `chair.png`: One dusty-blue classroom chair from behind and slightly above, white metal legs, no wheels or arms, isolated transparent background, miniature realistic 3D style.

Original generated PNGs are retained here. The asset build only resizes and encodes WebP copies.
The live blackboard is a native Pixi object so its text remains externally updatable.

The first classroom demo reuses existing project-owned character frames through a build-time selection recipe in `example/classroom/build-assets.mjs`. Published classroom IDs and atlases are independent; no office work clips or office runtime packages are loaded. These are demo appearances, not newly generated school-uniform characters. Future classroom character sources can replace this recipe without changing teaching logic.

## Furniture Alignment Revision

The live classroom uses `desk-v5.png` and `chair-solid-v2.png`: an elevated-view single-student desk and a continuous opaque rear chair shell. These are generated as complete images, not stretched or assembled from body parts. Exact prompts and output IDs are retained in `desk-leg-revision.json` and `chair-leg-revision.json`. The earlier v3 desk had excessive leg projection, while v4 over-shortened the legs. Neither is loaded.

`chair-solid-v2.png` is a restrained leg-only edit of v1. The request was to shorten the metal legs by about 15%, keeping the shell, seat, camera, canvas and foot-cap size unchanged. The resulting lower foot landmark is y=1080 instead of y=1188. Shell size and registration remain within eight source pixels (under half a displayed pixel). The image's seat landmark and uniform rendering scale are unchanged. Scene placement is calibrated separately below. The previous v1 image is retained for registration regression tests, not loaded by the classroom.

Earlier furniture below is retained only as provenance and is **not loaded by the classroom**. The flattened desk and openwork chair were rejected. Their prompts are in `furniture-generation-v2.json`.

- `chair-v2.png`, output `exec-add54aba-bbe6-4e9d-9f0b-60bfdf86d3ac`: original chair as color/material reference and `code-agent/standard-v2/sit/back/001.png` as proportions reference only. Request: low lumbar backrest, broad seat, short white legs, straight-on elevated view, transparent background, no character/shadow.
- `chair-v3.png`, output `exec-52473dda-e248-484b-b9e2-9d0b60da17b7`: edit v2 only by shortening the legs below the seat by half, keeping widths/materials/camera. One squat chair with true transparency, no added ground or people.
- `desk-v2.png`, output `exec-1113ca5a-5f30-481b-b988-36e836e1f56b`: edit original desk, preserve birch top/notebook/pencil, shorten the legs/tray, open knee space, compact chibi proportions, transparent outside furniture with no glow or shadow.

Calibration lives in `packages/scene-classroom/src/pixi/alignment.ts`. The student reference height is 112 at a 280-pixel source reference. `CLASSROOM_CONTENT_SCALE = 1.4` applies to all characters, furniture widths and local contact offsets together; it does not resize the room or alter source images. All poses retain one scale. Seated foot y=377 and standing pivot y=344 register the frame origins, but seated and standing floor contacts must not be conflated. The measurements below describe the base calibration before this common content scale.

- The desk and chair share a reserved 3x3-cell furniture footprint, including the enlarged chair's rear feet. The desk's nearest feet are ten base presentation pixels ahead of the standing contact, outside the student's eight-pixel base foot envelope. Placement is calibrated from feet and the source image's tabletop/hand landmarks, not forced to the edge of a whole grid cell. The v5 desk is 90 base pixels wide, compared with the 48-pixel chair, and its near tabletop edge is within eight base pixels of the seated hands. Its longer legs retain usable open knee space.
- The middle row contains a standing/side-entry lane at its centre; the rear row reserves space for chair feet. Seated foot contact is five base presentation pixels toward the camera. Runtime positions and footprints remain integer grid cells; these offsets belong only to artwork projection.
- The underside of the seated hips (source y=351.5), not the pelvis centre, meets the chair's seat contact. This registers the solid rear shell over the hips rather than exposing them below the backrest. During rising, the registered frame moves to the standing contact in the clear lane. Walking then stays horizontal at that contact's floor level. Returning uses the same lane before sitting back; the chair never slides.
- Desk feet, chair feet and an eight-pixel standing-foot envelope must not overlap. Projected silhouettes may overlap naturally; demanding an empty strip between the tabletop and chair back previously pushed the desk too far away. Tests enforce floor clearances for every student and both side approaches; near-view inspection verifies furniture height and apparent distance.

Rendering now has only two complete furniture sprites: the desk behind the occupant and the solid rear chair shell in front. There are no openwork cutout masks or duplicated chair layers. Characters remain complete frames and furniture does not move during docking. Runtime footprints and side-entry rules remain unchanged.

When replacing artwork, update its source dimensions, visible width, contact landmark and front-foot landmark together. Review all five students while seated and while entering/leaving from both sides. Tests check scale, contacts, opaque shell, layer order and projection continuity, plus actual hip-pixel occlusion for every student; they do not replace visual review.
