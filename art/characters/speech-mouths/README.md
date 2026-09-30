# 说话口型

`mouths.png` 使用内置 ImageGen 生成，参考王明的正面与侧面素材；只使用独立的口型，不替换整个人物。两行分别是正面和右侧面，三列是小、中、大三个开口。

生成提示词：

> Create one production sprite atlas for subtle talking mouth overlays in a chibi office character animation. Use the two supplied character pictures ONLY as style reference, do not redraw any character, head, face, body or skin. The output is ONLY six isolated small illustrated open mouths on a genuinely transparent background. Grid exactly 3 columns x 2 rows with very large even transparent gutters. Top row: front-view mouth shapes in three stages: tiny slightly open, medium open speaking, relaxed wider open speaking. Bottom row: the same three stages seen in right-facing three-quarter profile. Mouths are soft compact rounded shapes with a fine dark warm-brown outline, muted dark reddish interior and a tiny muted pink tongue, matching the gentle hand-painted chibi reference. Keep outer mouth shapes modest, not shouting, no teeth, no lips, no noses, no faces, no surrounding skin patches, no shadows, no text, no labels, no checkerboard. Flat isolated 2D animation artwork. Each sprite centered in its grid cell, consistent line thickness, ready to be downscaled to roughly 8-14 pixels wide in a 256px character source frame.

`placement.json` 是现有六人的口型局部校准区域 `[x, y, width, height]`，坐标基于各自资源包的完整画布。脚本 `node scripts/characters/create-speech-frames.mjs` 从原闭嘴帧制作说话帧，区域外像素不变；日常构建直接使用人物包内的帧，不运行此脚本。

现有坐着转头 `talk.seated-*` 仍为聆听姿态，`speak.*` 才是发言动作。背面看不到嘴巴，不伪造嘴部动画。此次只提供视觉口型，不包含语音合成或音频口型同步。
