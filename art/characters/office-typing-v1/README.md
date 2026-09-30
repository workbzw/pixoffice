# 坐姿敲键盘动作 v1

## 动作模板

- 动作名：`work.typing-back`，背面、坐姿、循环。
- 四帧顺序：左手按键、双手回到键盘上方、右手按键、双手回到键盘上方。
- 每帧 160 ms，一轮 640 ms。主要变化是手指、前臂和肘部，不移动整个人物或家具。
- 沿用对应人物的背面坐姿、服装、发型与镜头。图片不含桌椅、键盘、地面、阴影或文字。
- 最终单帧 256 x 384，pivot (128,344)，referenceHeight 280，displayHeight 84，坐姿脚底 y=377。
- 头部以各自背面站姿为尺寸母版，按现有 v2 标准校准；不把坐姿放大到站姿高度。
- 工作状态自动播放；待命、思考、移动、坐起、转头交谈保持各自动作。

## 制作与验收

原图由内置 ImageGen 生成，输入是六人当前背面坐姿，按资源 ID `marvis`、`code-agent`、`file-agent`、`app-agent`、`review-agent`、`data-agent` 排列。完整提示词见 `prompt.txt`，生成输出 ID 见 `registration.json`。人物外观 ID 与场景姓名独立。

生成原图、裁切与头部标注保存在本目录；经标准检查后导入各人物包的 `work/typing-back/`。检查一整轮的手臂变化与循环接缝，确保头部、衣服、身体和脚底没有跳动。旧坐姿保留。

```sh
node scripts/characters/register-office-typing.mjs
# 先在 .character-staging/typing-v1/ 审查六个资源包，再发布：
node scripts/characters/register-office-typing.mjs --publish
npm run characters:build
npm run characters:check
npm test
```

导入只裁切和等比配准完整人物，不分拆身体或重画像素。原图透明通道保留。`comparison.png` 每行第一张为原坐姿，后四张为打字循环；六个暂存包已通过只读资源审查，实际办公室和人物预览也已检查。
