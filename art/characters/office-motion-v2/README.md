# Office motion v2

Six front/back indoor gait sheets generated with the built-in ImageGen tool on 2026-09-27. Each `<id>-reference.png` uses the character's existing front/back standing art as its identity reference. No external character assets or skeletal motion data were used for these sheets.

## Source files

| Character | Generated output ID |
| --- | --- |
| marvis | exec-22be4910-5d31-47f8-b8a7-730c78fc532d |
| code-agent | exec-ce14ff4e-49e2-4508-a8cd-48b7fb466cbe |
| file-agent | exec-0f7f3ee7-0cdc-4098-8882-313123658c89 |
| app-agent | exec-bcb855bb-6956-4c0b-aee7-a58f5f30d0c0 |
| review-agent | exec-714ca25d-acd1-4fee-83bb-858c07b53741 |
| data-agent | exec-d82725c9-e3e8-488d-8b43-7138957c0a54 |
| opposite-contact | exec-f7ae3bd4-b036-43bf-ae74-4c8fd7f38ae7 |

The six main sheets are 1448 x 1086 RGBA, four front poses above four back poses. Columns are isolated by alpha spans rather than naive equal-width cuts. `opposite-contact.png` corrects the third front pose for file-agent (left figure) and app-agent (right figure), whose first outputs repeated the same contacting leg. Rejected intermediate generations are not imported.

`registration.json` contains manually reviewed head-bottom landmarks in source coordinates. Existing seated, leaning, rising and seated-turn art is reused and uniformly registered against each character's standing reference. Sharp performs only technical extraction, scaling, registration, atlas packing and QA montage composition; no body parts are drawn or stitched into the new gait.

`source-manifests/` freezes the pre-v2 input references. The import is reproducible without repeatedly resizing already-registered output. Run `node scripts/characters/register-office-motion.mjs`, then `npm run characters:build`. All six standards are validated before publishing source changes. The `comparison.png` contact sheet shows back standing, four front walking frames, four back walking frames, and back sitting at one common scale.

## Main generation prompt

```text
Use case: identity-preserve. Sprite art for an existing game. Use the attached TWO standing figures as exact front/back model sheet for ONE SAME character.
Make exactly EIGHT isolated FULL-BODY sprites in a strict 4-column 2-row sheet. Transparent RGBA background (zero alpha outside sprites). NO colored background, NO gradient, NO contact shadows, no floor. Same character size, head shape, hair locks, colors, costume and proportions as the reference. Keep relaxed hands DOWN beside hips, no punching or bent-up elbows. Intentional mouthless face, keep eyes/nose/cheeks but no mouth.
TOP ROW = straight FRONT view. Bottom row = straight BACK view. No side views or twisting.
In BOTH rows, the four cell poses from LEFT to RIGHT must be:
A: viewer-LEFT shoe in front and planted LOW, viewer-RIGHT shoe behind and HIGH by about 16 pixels, tiny heel lift.
B: viewer-LEFT leg supports, viewer-RIGHT knee/foot gently passes it, feet close and almost level, NOT idle stance.
C: viewer-RIGHT shoe in front and planted LOW, viewer-LEFT shoe behind and HIGH by about 16 pixels; the EXACT OPPOSITE legs from A.
D: viewer-RIGHT leg supports, viewer-LEFT knee/foot gently passes it, feet close and almost level; EXACT OPPOSITE legs from B.
Arm swing is low and subtle opposite the legs; shoulders steady. Small indoor steps with almost straight knees, never running or kicking, no big sole aimed at viewer. The head is IDENTICAL in size and silhouette in all four cells of its row. Preserve the asymmetric hair (do NOT mirror the entire sprite). Only the limb pose alternates. Fixed front/back orthographic camera. Very clean alpha edges, no stray pixels, ample gutters. 2048x1536 landscape preferred.
```

For the other five sheets, the character-specific reference supplies identity and the accepted marvis sheet supplies only pose/layout. Hair, face, outfit and colors must remain character-specific.

## Opposite-contact correction prompt

```text
Edit these TWO sprites. HORIZONTALLY FLIP ONLY THE TROUSERS AND SHOES BELOW EACH WAISTLINE around that figure's hip center. This is a localized horizontal flip of the lower-body limb pose, NOT a whole-body flip. The lower shoe is currently on the left of each figure; it must move to the RIGHT of each figure. The higher shoe is currently on the right; it must move to the LEFT. Black hoodie man's cream trousers and shoes: mirror them horizontally. Woman's blue jeans and shoes: mirror them horizontally. All pixels ABOVE the waistband (heads, hair, eyes, faces, sweaters, arms and hands) must stay unchanged. Both front faces remain mouthless. Keep canvas 1024x768 with 2 figures side by side, same position, same transparent alpha background, no shadows.
```

The generator returned 1448 x 1086 rather than the requested size; the importer uses actual returned dimensions. Four-frame gait remains stylized frame animation, not continuous skeletal motion. Prompt constraints alone do not establish anatomical or motion quality; inspect the actual previews and office playback after import.
