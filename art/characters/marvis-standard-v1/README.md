# 王明尺寸标准试点

本轮使用内置 ImageGen 生成，透明背景。母版来自项目既有王明正、侧、背站立图，身份、服装与原画风保留。不使用 Spine 资源或参数。

- `master-reference.png`：三视图母版，各图以相同的 2 倍倍率组合，不按单帧内容重新适配大小。
- `actions.png`：第二次生成的原图（1448 × 1086），保留真实 alpha。实际接入第一行四个背面走路姿态。
- `registration.json`：手工确认的裁切区域与头部带。按头宽 147 px 等比注册到 256 × 384，而非按全身高度缩放。
- `comparison.png`：当前接入帧的等倍率对照图，由实际 PNG 生成。

第一版左右脚重复，修正后才接入。第二行的坐起草稿不采用：它的姿态不如项目现有已校准素材。正面、侧面、坐起、坐姿转头和独立嘴型保持原素材，只增加构建期验收。

旧的动作 PNG 未覆盖。生成图不能单靠提示词保证精确比例，最终以配准、像素验收和人工预览为准。完整规范见 `docs/character-art-standard.md`。

## 初次生成提示

Use case: identity-preserve.
Asset type: transparent 2D full-body character animation sprite sheet for the existing AI Office game, not an illustration.
Input image: exact three-view identity and proportions reference (front, right, back) for ONE man, Wang Ming. Match the existing drawing extremely closely: light-brown tousled hair with one cowlick, cream hoodie, navy trousers, white sneakers, warm thin outlines and soft painted shading. Keep the exact head shape, size, hair locks, hair highlights and outfit throughout.
Produce a clean 4-column by 2-row sheet, 2048 by 1536 preferred, 8 equal cells. One complete isolated character per cell. Transparent background, no furniture, no chair, no shadows, no labels, no lines. Plenty of empty space around each figure. All eight figures have the SAME physical head dimensions, roughly 280 pixels wide, and same camera/view scale; standing body is about 540 px tall. Never make the seated head smaller to fit a box; the seated figure must simply be shorter. Keep the exact same back-of-head drawing through frames 1-7, with only tiny natural pose tilt. Fixed orthographic camera, not changing perspective, no rotation of the body during walking.
TOP ROW, left to right: four sequential quiet indoor walking poses facing directly away from viewer, with low foot lift and relaxed nearly straight knees. Frame 1 left leg forward/right heel just lifted; frame 2 right leg gently passing left supporting leg; frame 3 right leg forward/left heel just lifted; frame 4 left leg gently passing right supporting leg. Alternate legs clearly, small opposite arm swing; no running, no bent-up shin, no soles facing viewer, no wide stance, no exaggerated bounce.
BOTTOM ROW, left to right: (1) same man seated upright facing away, thighs extending away on an invisible chair and lower legs down, hands relaxed near knees; (2) seated but slight forward torso lean preparing to stand, feet planted; (3) halfway raised from the invisible chair, legs nearly straight, torso gently leaning forward, same head size; (4) seated with legs/hips still oriented away, torso slightly turned right and head looking right in three-quarter/profile view toward a colleague, same head size as the standing side reference.
Visible face in bottom-right must have eyes, nose and blush but NO MOUTH, no lip, no smile line: the game supplies a separate mouth animation. Other figures show no face. Absolute priority: consistent head-to-body proportion, clean alpha edges, same person in every cell, no resized heads between actions.

## 修正提示

Use case: precise-object-edit. Edit the supplied transparent 4-column x 2-row animation sheet. Keep layout, alpha transparency, all identities, all head sizes, hair, palettes, linework, and all sprites except the three specified changes below EXACTLY unchanged.
1. TOP row column THREE: currently repeats the first sprite's stepping leg. Change ONLY the arms and legs below the head into the OPPOSITE walking phase of column one: the character's LEFT leg (on viewer LEFT in this back view) is lifting behind with its heel slightly raised, and the RIGHT foot (viewer RIGHT) is supporting/forward planted. Left hand swings forward away from camera, right hand swings back toward camera. Keep this sprite's head/hair entirely unchanged; do NOT mirror the head.
2. TOP row column FOUR: change ONLY arms and legs below the head to the OPPOSITE passing-step phase of column two. The LEFT leg (viewer LEFT) passes, RIGHT leg supports. No high knee lift, quiet indoor walk. Keep head exactly unchanged. First two top-row sprites must stay unchanged.
3. BOTTOM row column THREE: currently the torso and head twist toward the right. Replace this ONE pose with the SAME MAN facing STRAIGHT BACK, centered symmetrically, halfway rising from the seat, slight forward lean, knees gently bent, BOTH feet planted. Its head must match the straight-back heads in bottom columns one and two, with precisely the same width and height. Don't twist sideways.
Bottom row columns ONE, TWO and FOUR remain exactly as input. Bottom-right face stays mouthless. No chairs, props, shadows, text, labels, gridlines, or background.
