# 五人独立嘴部素材

李研（code-agent）、周理（file-agent）、陈书（app-agent）、刘市（review-agent）、赵审（data-agent）沿用王明的局部修补方式。每个子目录的 `mouthless-faces.png` 由内置 ImageGen 编辑，仅用于提取嘴部皮肤补片；不替换整张脸或身体。原始动作图片保留。

最终运行素材在 `art/characters/packs/<id>/body/` 与 `mouth/`；挂点写入各自的 `character.json`。统一导入逻辑位于 `scripts/characters/mouth-layer-tools.mjs`，五人的裁切、补片范围、挂点位于 `scripts/characters/create-office-mouth-layers.mjs`。

## 编辑输入

每张参考图为 4 列 3 行，单格 320 x 260，原图脸部裁切 80 x 65 后放大四倍。最后三格为空，前九格顺序：

1. idle/front/001.png
2. idle/right/001.png
3. walk/front/001.png
4. walk/front/002.png
5. walk/front/003.png
6. walk/right/001.png
7. walk/right/002.png
8. walk/right/003.png
9. talk/seated-right/001.png

每人单独编辑一张参考图。最终提示词相同：

> Precise pixel sprite editing. This supplied image has NINE close-up face crops in a 4-column 3-row grid, cell size 320x260, last three cells empty. Erase ALL NINE mouths ONLY, replacing with smooth matching skin. Front-view red U-shaped smiles and open pink mouths must become plain skin, and the tiny red smile curves on ALL right-facing side-view faces including the bottom-left seated face must also become PLAIN SKIN. Do not mistake the little red smile on the lower-right cheek for the nose: erase that red smile too. Every face must look intentionally MOUTHLESS. Preserve eyes, eyebrows, noses, cheek blush, glasses if present, black chin/jaw outlines, hair, clothing, transparency and exact grid placement. No closed mouth, lips, text or marks may remain at the mouth position. Do not repaint any other part. Keep 1280x780 aspect ratio and composition unchanged. Only mouthless skin patches will be extracted for use as an animation underlay.

## 导入与约束

```bash
node scripts/characters/create-office-mouth-layers.mjs
npm run characters:build
```

只融合已标注嘴部范围内的 RGB，alpha 及范围外所有像素保持原值。闭嘴轮廓提取自各自原图；开口复用 `art/characters/speech-mouths/mouths.png` 的生成口型。坐着转头使用单独挂点与 0.85 倍口型，左侧显式镜像右侧。

行走第 2 帧不以站立图代替，避免身体比例或姿态变化。第 4 帧与第 2 帧逐像素相同才允许复用，导入时会验证。

覆盖正面/侧面站立、室内行走、坐着转头。背面不显示嘴；入座/起身、显式表情和历史行走仍保留原素材。没有语音合成或音素同步。运行时复用同一播放器与图集，每人最多增加一个嘴部 Sprite。
