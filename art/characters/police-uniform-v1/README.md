# Civic Character Artwork

This directory contains only the source images, import settings, generation
provenance and current QA tools for the `/civic/` preview. Retired candidates,
superseded source sheets and historical comparison renders are not retained.

## Current Inputs

- `sources/<id>.png`: six identity, gesture, seated-turn and work source sheets.
- `sources/*-frontback-v6.png` and the three selected `*-arms-v6.png` sheets:
  current front/back walking artwork.
- `sources/office-lead-sidewalk-v8.png` and `sources/code-agent-sidewalk-v8.png`:
  the two approved guides' lateral A/B/C.
- `sources/*-side-repair-v11.png`: matching neutral side standing (top-right cell)
  and repaired passing D (bottom-right cell). The other generated cells are not
  imported. D remains active only for office-lead/code-agent.
- `sources/*-sidewalk-v13.png`: all four lateral frames for file/app/review/data-agent.
- `sources/*-gait-reference-v13.png`: exact six input sheets for the v13 pose
  and identity references, assembled from complete pre-repair frames.
- `sidewalk-v13.json`: pose-reference mapping, reviewed head bands and whole-frame
  registration offsets for the rebuilt cycles.
- `sources/*-transition-v10.png`: current half-squat/rising artwork with downward
  calves and flat-planted feet, not kneeling.
- `sources/data-agent-work-v7.png`: four complete typing frames, without
  rectangular hair/sleeve patches.
- `sources/seated-pose-reference-v10.png`: the anatomy reference for that repair.
- `seating-v10.json`: selected sheets, authored head bands and registration.
- `provenance.json`: current source hashes, exact prompts and output IDs.
  Retired v8/v12 parent-image metadata is preserved without keeping their PNGs.

There are 40 retained images, including the exact v13 generation references.
Historical reference names describe generation-time inputs, not files required to build the scene.
The actual selected source images remain sufficient to reproduce the current
packs without any old staging or preview directories.

## Pose And Proportions

The desk-ready `sit.back` pose reuses the complete first `work.quiet-back`
frame, so starting work cannot move the head or hips. Intermediate rising
poses use the v10 artwork. App-agent uses a 0.94 master registration and
data-agent 0.97; the correction covers all views and mouth attachments.
Data-agent lateral walking has one additional clip-wide 0.99 registration.
Runtime display height, furniture, maps and protocol are unchanged.

## Lateral Walking Repair v11

The right-facing cycle remains four distinct frames at 200 ms per frame in
preview, driven by travelled distance in the office. A places the near leg
forward, B passes the far leg, C brings the near leg backward, and D passes the
near leg with the far leg supporting the body. D closes the feet under the hips
without the original large forward kick. Subsequent visual inspection found
incorrect arm transitions in four characters; their current v13 replacement is below.
Left-facing walking uses the existing explicit mirrored alias.

The neutral standing sprite is separate from every walking frame. It matches
the lateral hair/face silhouette and linework, reducing the old soft-to-sharp
switch at walking start/stop. Full-body source frames are cropped and registered
at one shared walking scale; no frame-specific scaling or body-part compositing
is used. Head landmarks are reviewed against the generated source, including
the glasses character's chin/collar boundary. Mouth anchors retain their
standing-head-relative offset. All existing size tolerances remain unchanged.

Exact ImageGen edit prompts, intermediate output IDs and selected file hashes
are saved in `provenance.json`. The lateral regression additionally requires D's
foot span to be less than 65% of its preceding contact pose. That pixel check
does not replace inspecting the support leg, loop and walk/stop transitions.

## Template-Matched Lateral Walking v13

All four lateral frames of file-agent/review-agent now follow office-lead's
approved body poses. App-agent/data-agent follow code-agent. The guide supplies
limb positions only; each character retains its own face, hair and accessories.
Office-lead and code-agent are unchanged in every frame.

The A/C near arm swings backward/forward respectively. In B/D it passes close
to vertical beside the thigh, following the guide rather than forcing a second
large swing. The far hand may be naturally occluded in passing poses.

Only complete ImageGen-authored frames are imported, without cutting, scaling
or repainting individual body parts. Every new four-frame clip has one shared
whole-body scale against its own standing reference. Head bands are reviewed
per row: long-hair ends must not be confused with sleeves or hands. Whole-frame
registration stays within the existing foot tolerance. Renderer, walking speed,
four-frame timing and other actions are unchanged.

Regression hashes protect all unaffected frame pixels, including every frame
of the two guides. Palette guards compare hand visibility and near-hand phase
against the selected guide; they are not anatomy certification. The retained
QA animation `walking-template-comparison.webp` places Wang Ming/Zhou Li/Liu Shi
in the top row, and Li Yan/Chen Shu/Zhao Shen in the bottom row. Inspect it and
the shared `walking-contact.png` for loop and walk/stop continuity. Exact
prompts, selected outputs, rejected edits and input hashes are in `provenance.json`.

## Build And Inspect

```sh
node art/characters/police-uniform-v1/import.mjs
node art/characters/police-uniform-v1/qa-seating.mjs
node art/characters/police-uniform-v1/qa-sidewalk.mjs
npm run assets:civic
node --test tests/policeArtwork.test.mjs
```

Default staging: `.character-staging/civic-sidewalk-v13`. Import refuses
to overwrite a candidate; choose a fresh `POLICE_STAGING_ROOT` for a new import.
Both QA tools accept that variable. The public asset build always uses its own
fresh temporary staging directory.

The current QA directory contains six outputs: seating and lateral contact
sheets, sit/rise animation, four-direction animation, template comparison
animation and the quality report. Separate per-character PNGs and duplicate
walking/leg previews are no longer generated. Temporary registered packs under
`.character-staging/` are disposable and are not required to build public assets.
Generated public files are limited to `civic-assets/asset-pack.json` and the
files declared in that catalog; stale content hashes are pruned on rebuild.

## Admission Status

This is still an unapproved preview. Technical canvas/head/foot checks pass,
but the quality report flags mixed source registration scales and some sit/rise
silhouette transitions, plus the existing data-agent work-frame pixel drift.
No tolerances, legacy fingerprints or review approvals hide those findings.
The current QA report is retained even when it contains failures.
