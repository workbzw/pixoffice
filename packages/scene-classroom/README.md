# @pixoffice/scene-classroom

Independent education scene. No dependency on either office package or an animation player.

- Root export: headless `classroomScenePack`, `createClassroomWorld`, `classroomRoster`, object and teaching plugins.
- `/pixi`: `createClassroomPresentation(assetBaseUrl)` for room, furniture, live blackboard and semantic actor presentation.
- Capabilities: `classroom.lecture`, `classroom.answer`, `classroom.settle`, plus shared `scene.move` / `scene.say`.
- Blackboard state: `object.state.set` with `{ title, text }` and optimistic revision checks.
- Teacher/student roles belong to this scene's roster, not the frame/skeletal appearance IDs.
- Desks occupy 3x3 integer cells: desk row, owner-only docking row and rear chair-foot row. Left/right approaches are selected by the shared pathfinder. The tabletop and chair-foot rows block walking.
- Teaching reserves the blackboard and participant bodies/speech, supports queuing, cancellation and recovery.
- Classroom furniture uses uniform scaling and separate floor contacts within the reserved footprint: desk feet ahead of the standing/side-entry lane, and a static recessed chair behind it. The single-student desk's elevated perspective keeps the tabletop at seated hand level without moving its feet into that lane. Seated and standing contacts are distinct. The solid chair shell is one foreground sprite without cutout masks. Calibration is local to `src/pixi/alignment.ts` and does not change runtime grid coordinates or office artwork.
- `CLASSROOM_CONTENT_SCALE` enlarges characters, desk/chair sprites and all local seating/contact offsets together by 40%. The room and wall-mounted blackboard retain their scale. Source landmarks and animation resources remain unchanged. The teacher stands one cell farther from the board so the larger character does not obscure its content.

The first demo is one teacher and five students. No grading, student records, remote model or audio service is bundled. New learning activities belong in this package, not the shared runtime.

See [classroom example](../../example/classroom/README.md) for assembly and protocol examples. Code packages are not yet published to npm.
