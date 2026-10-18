# 王明独立嘴部试验

`mouthless-faces.png` 是内置 ImageGen 编辑的局部底图。只提取其中的嘴部修补区域，不替换整个人物。原动作图保留，新的无嘴人物帧位于 `../packs/office-lead/body/`，独立口型位于 `../packs/office-lead/mouth/`。

原图顺序：`idle/front/001.png`、`idle/right/001.png`、`walk/front/001.png`、`walk/front/003.png`、`walk/right/001.png`、`walk/right/003.png`、`talk/seated-right/001.png`。每个原始脸部裁切为 80 x 65，放大四倍排成 4 列 2 行，末格空白。裁切、修补区域、每帧挂点保存在本目录的 `registration.mjs`，用于来源记录和像素回归检查，不是可执行导入器。

最终生成提示词：

> Precise pixel sprite editing. This image has seven close-up face crops in a 4-column 2-row grid, cell size 320x260, last cell empty. Erase ALL SEVEN mouths ONLY. Front-view smiles (red U-shaped lines) and the open pink mouth must become plain skin, and the tiny red upward smile curves on ALL FOUR right-facing side-view faces must also become PLAIN SKIN. Do NOT mistake the little red smile on the lower-right cheek for the nose: erase that red smile too. Every face must look intentionally MOUTHLESS, as if no mouth was ever drawn. Preserve eye, eyebrow, nose, cheek blush, black chin/jaw outline, hair, clothing, transparency and exact grid placement. Do not add a closed mouth or small lip line. Do not repaint any other part. Keep 1280x520 aspect ratio and composition unchanged.

闭嘴贴图从原嘴线提取透明遮罩；三个开口复用 `../speech-mouths/mouths.png` 的生成素材，不重新画人物。导入时仅在已标注区域融合嘴部修补像素，原图 alpha 与区域外像素完全不变。

旧的直接导入器已删除。后续修改应准备独立候选包，按 [人物素材准入流程](../../../docs/character-admission.md) 审核和发布。日常构建不重复生成或修补素材。

覆盖王明正面/侧面站立、行走及坐姿转头，左侧显式镜像右侧。背面没有挂点，不显示嘴。挥手/思考/惊讶和历史行走保留原表情图，不叠加第二张嘴。其他五人的制作记录见 `../mouth-layers/README.md`。
