# Civic Character Artwork

This directory contains only the source images, import settings, generation
provenance and current QA tools for the `/civic/` preview. Retired candidates,
superseded source sheets and historical comparison renders are not retained.

## Current Inputs

- `sources/<id>.png`: six identity, gesture, seated-turn and work source sheets.
- `sources/*-frontback-v6.png` and the three selected `*-arms-v6.png` sheets:
  current front/back walking artwork.
- `sources/*-sidewalk-v8.png`: current four-phase lateral walking artwork.
- `sources/*-transition-v10.png`: current half-squat/rising artwork with downward
  calves and flat-planted feet, not kneeling.
- `sources/data-agent-work-v7.png`: four complete typing frames, without
  rectangular hair/sleeve patches.
- `sources/seated-pose-reference-v10.png`: the anatomy reference for that repair.
- `seating-v10.json`: selected sheets, authored head bands and registration.
- `provenance.json`: current source hashes, exact available prompts and output IDs.

There are 28 retained images. Historical reference names in the provenance
record describe generation-time inputs, not files required to build the scene.
The actual selected source images remain sufficient to reproduce the current
packs without any old staging or preview directories.

## Pose And Proportions

The desk-ready `sit.back` pose reuses the complete first `work.quiet-back`
frame, so starting work cannot move the head or hips. Intermediate rising
poses use the v10 artwork. App-agent uses a 0.94 master registration and
data-agent 0.97; the correction covers all views and mouth attachments.
Data-agent lateral walking has one additional clip-wide 0.99 registration.
Runtime display height, furniture, maps and protocol are unchanged.

## Build And Inspect

```sh
node art/characters/police-uniform-v1/import.mjs
node art/characters/police-uniform-v1/qa-seating.mjs
node art/characters/police-uniform-v1/qa-sidewalk.mjs
npm run assets:civic
node --test tests/policeArtwork.test.mjs
```

Default staging: `.character-staging/civic-seating-v10-final`. Import refuses
to overwrite a candidate; choose a fresh `POLICE_STAGING_ROOT` for a new import.
Both QA tools accept that variable. The public asset build always uses its own
fresh temporary staging directory.

The current QA directory contains the seating contact sheet, animated
sit/rise comparison, quality report and current walking comparisons only.
Generated public files are limited to `civic-assets/asset-pack.json` and the
files declared in that catalog; stale content hashes are pruned on rebuild.

## Admission Status

This is still an unapproved preview. Technical canvas/head/foot checks pass,
but the quality report flags mixed source registration scales and some sit/rise
silhouette transitions, plus the existing data-agent work-frame pixel drift.
No tolerances, legacy fingerprints or review approvals hide those findings.
The current QA report is retained even when it contains failures.
