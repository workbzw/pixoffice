# Marvis Seated Computer Pose V2

Scope: Marvis only. Replace the resting-arm basis of `work.quiet-back` with
a complete seated computer-work sprite, retaining the current head, feet,
furniture and rendering scale. V1 is preserved as a rejected resting-pose trial.

## Action Template

- View: straight back, existing elevated office camera.
- Support: seated, shoe-bottom anchor 377; body pivot (128, 344).
- Shoulders stay close to the body; bent elbows lead into forward forearms.
- Wrists meet the keyboard plane, above the elbows in screen projection.
- Large hair naturally occludes part of the hands; no dangling sleeves at hips.
- First validate the neutral pose against the actual trial workstation.
- Then use four complete frame phases: neutral, left press, neutral, right press.
- Keep the existing 3-second typing / 1-second pause cadence.
- No runtime arm rig, skeleton, furniture movement or per-pose scaling.
- Head identity, clothing and feet must remain stable across the cycle.

## Source And Integration

Generated using the built-in ImageGen tool. `pose-prompt.txt`,
`pose-correction-prompt.txt` and `contact-correction-prompt.txt` retain the exact
pose requests. `pose-attempt-1.png` still had low wrists; `pose-attempt-2.png`
reached only the desk edge. `pose-attempt-3.png` is the selected base.
`motion-prompt.txt` and `motion-generated.png` contain the finger edit source.
Output IDs, authored landmarks and local hand import rectangles are recorded
in `registration.json`; actual transforms are in `registered-frames.json`.

`scripts/characters/register-marvis-quiet-work-v2.mjs` stages the complete pack,
validates the existing size standard and builds it in memory. `--publish`
installs only Marvis's four `work/quiet-back-v2` frames and manifest entries.
The neutral phases are the new working pose, not the resting pose. Moving
phases copy only generated hand regions into that complete pose. There is no
new runtime renderer, per-frame image processing or independently moving arm.

`desk-candidate.png` compares the old resting pose (left) with the new work pose
(right) using the real trial furniture crops and rendering dimensions.
`desk-preview.gif` shows the four-phase cycle with that furniture.
`office-preview.png` and `office-detail.png` show the actual browser scene.

The project builder and dimension checks pass. The external Skill audit still
rejects the retained older `part.work-upper` rig clip because that checker
expects a head annotation for every non-mouth clip. No tolerance was weakened
and the global Skill was not changed to bypass that existing incompatibility.

This is a Marvis-only fixed-view trial, now published. It does not automatically
adapt these complete-frame hands to arbitrary future desk heights. The original
resting, walking, seated-turn and transition assets remain untouched.
