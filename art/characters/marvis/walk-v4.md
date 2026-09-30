# Wang Ming Walk Version 4

Version 4 changes motion, not character artwork. It uses our six-part transparent
source atlases recorded in [walk-v3.md](./walk-v3.md). No additional artwork was
generated and no third-party character texture was incorporated.

## Reference And Boundaries

At the user's request, the existing project's classic walk was viewed and its
timing/angle ranges inspected as a reference. No bones, constraints, keyframe
tables, interpolation curves or rendered reference pixels are embedded in the
new character or bake pipeline. The authoring module imports Pixi only; playback
uses ordinary sprites. The existing classic character option is unchanged.

The legacy trot has a 1-second two-step loop, low poses at contact and a rise
roughly one sixth of a cycle later. Its local upper-arm rotations span roughly
130 degrees and its hip translation is deliberately very exaggerated. Those
values are not directly applicable to this character's proportions or axes.

## Reauthored Motion

- A 72-scene-unit cycle takes 0.8 seconds at the existing 90-unit movement speed,
  compared with 0.53 seconds in version 3. Frame count remains 32 per view.
- Each foot has a 40-percent planted phase followed by a 60-percent recovery.
  Hermite endpoint tangents preserve ground-relative contact velocity.
- Hip height ranges from 180 at contact to 164 near one sixth of the cycle,
  in the independently authored 192x256 canvas coordinate system. This is a
  small, damped bounce, not the source animation's large aerial hop.
- Heels recover through a 24-pixel lift. Knee positions are solved for this
  character's own 36-pixel upper/lower segments, not imported bone positions.
- Opposing upper arms swing about 36 degrees; elbow flex is about 24-34 degrees.
  The torso leans forward approximately 2.6 degrees and the head settles slightly
  later. Front/back views project these motions with bounded foreshortening.
- The continuous cloth mesh compresses on the inside of tight bends while
  retaining the outside contour, preventing inverted triangles at the knee.
- All frames share one 156x240 crop; scale does not change from frame to frame.

The previous complete-frame sheet remains the preview comparison. Source images
and version 3 baked frames remain available in the art directory. Sitting,
expressions, navigation and the other five residents are unchanged.

## Verification

Tests cover timing, cycle closure, opposing arms, planted foot/world velocity,
ground contact, all three directions and mesh winding throughout each stride.
Visual checks use enlarged pose samples and desktop/mobile browser previews.
The technique remains 2D cutout deformation, not full 3D limb perspective.
