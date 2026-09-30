# Workstation Artwork Trial V1

Generated with the built-in image generation tool on 2026-09-29. The original
office assets remain unchanged. These three PNGs preserve the generated alpha.

- `desk.png`: white tabletop, open light-gray frame, no cabinet.
- `chair.png`: compact gray low-back chair, rear view.
- `computer.png`: separate monitor, keyboard and mouse.

Only the workstation bound to `marvis` uses this trial. The chair button in the
scene toolbar switches back to the original artwork immediately. This is a
renderer-only preview; it does not modify saved maps, grid geometry or movement.

The texture frames in `DeskEntity.mountTrialSprites()` exclude empty padding.
The desk is split at the apron for depth sorting; every piece uses uniform scale.

## Generation Prompts

### Desk

Use case: stylized-concept. Asset type: production transparent PNG furniture sprite for a calm, softly rendered 3D miniature office viewed from a fixed elevated front camera. Generate ONE modern compact office desk ONLY, fully isolated on true transparency, centered, entire object visible with 8% empty padding. Camera is centered straight in front, looking down about 25 degrees, NO rotation around vertical axis: desk front edge exactly horizontal, left and right symmetrical. Show the pale white top surface, a very thin rounded white tabletop with gently softened small corners, four slim light cool-gray square metal legs, clean open space under the desk. Desk proportions approximately 120 cm wide, 65 cm deep, 72 cm high. A small inset light gray structural frame underneath only, no lower front crossbar. Soft realistic 3D render with subtly stylized clean miniature forms, diffuse bright neutral daylight from upper left, gentle material shading, crisp clean anti-aliased alpha edges, not flat vector or pixel art. No cabinet, no drawers, no modesty panel, no chair, no monitor, no keyboard, no mouse, no objects on top, no people, no scenery, no floor, no ground shadow, no text or logo. Tabletop pure soft white, legs pale gray, restrained cool neutral palette to fit an existing white contemporary office. The object must look like an actual usable desk, not a decorative console.

### Chair

Use case: stylized-concept. Asset type: production furniture sprite, transparent PNG for a clean white miniature 3D office. ONE compact low-back swivel task chair, viewed directly FROM BEHIND the chair, the sitter would face away from the viewer. Fixed front-centered elevated camera looking down 25 degrees; no horizontal rotation, perfectly symmetrical straight rear view. Entire chair visible centered with 10 percent transparent padding. Short light cool-gray upholstered curved lumbar backrest, top of backrest only reaches the lower torso of a seated person; two small understated pale-gray arms, slim central silver support and five compact caster feet. Backrest should be visibly lower and wider than a typical tall office chair, soft rectangular shape with subtle rounded corners; quietly modern, not gamer, no mesh detailing, no high headrest. Softly stylized realistic 3D render, clean simplified miniature shapes, diffuse bright daylight from upper left, matches a white matte desk in a bright contemporary office. GENUINELY TRANSPARENT EMPTY BACKGROUND, clean hard anti-aliased silhouette edge, NO halo, NO glow, NO gray or black vignette, NO cast shadow and NO floor plane. No desk, no people, no text, no logos, no other objects. Neutral light gray upholstery with slightly darker gray casters; restrained materials, keep the opening above backrest completely clear.

### Computer

Use case: stylized-concept. Asset type: transparent PNG computer equipment sprite for a miniature 3D office game. A single small modern slim monitor, with a matching compact white keyboard and tiny white mouse in front, all as one isolated sprite; no desk underneath. View straight from the front, camera centered and elevated about 25 degrees, horizontal edges perfectly level, no side rotation, left-right symmetric monitor. Matte light gray thin bezel and pale silver pedestal, screen is a simple dark muted blue-green with a few subtle small window shapes, no legible writing, no brands. Keyboard and mouse rest on the same imaginary horizontal surface as the monitor stand. Comfortable separation, keyboard in foreground, mouse to the right. Soft miniature 3D render, bright diffuse neutral lighting from upper left, restrained white/lightgray materials, clean simplified forms matching a contemporary white office. Entire equipment centered and fully visible with transparent padding, all external background and gaps truly transparent. Clean anti-aliased alpha edges, no halo, no glow, no backdrop, no shadows on a floor, no floor, no table, no furniture, no person. No text and no logo.
