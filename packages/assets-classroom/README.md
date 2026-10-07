# @pixoffice/assets-classroom

Classroom frame capabilities and bindings, independent of office rules.

`bindClassroomFrames(manifest, uri)` requires standing/walking in four directions, seated listening, side-facing conversation and sit/stand transitions. Speaking uses the existing separate mouth layer only where supported. No office typing animation is included.

This code package contains no images. `example/classroom/build-assets.mjs` selects the required project-owned source frames and publishes independent classroom atlases and manifests. Room, desk and chair sources are in `art/classroom/`; generated public files include provenance and license notices.

To adopt a skeletal player later, publish compatible semantic capabilities and sockets with a different `adapterId`; change the example assembly, not classroom teaching logic.
