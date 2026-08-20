# 主题角色资产合同

两套正式主题角色均由项目专用视觉母版编译为确定性运行资产；
`scene/office/themeCharacterArt.ts` 仅作为加载失败时的同身份回退，不再是正式主题的主视觉。

- 视觉方向：`docs/diy/ui/04-晶海星港-角色视觉系统.png`、`05-星穹田园公社-角色视觉系统.png`。
- 项目母版：各主题 `characters/character-master-v1.png` 与 `character-turnarounds-v1.png`。
- 运行产物：各主题 `portrait-atlas.png`、`cast-atlas.png`、`cast-atlas.json`。
- 编译入口：`tools/build-theme-character-assets.py`。
- 固定合同：15 个既有外观 ID；头像 18×28；场景帧 18×32；向下、向上、向右三行；每行七帧；向左在运行时镜像。
- 完整身体保护：母版单元格允许不等宽，但边界必须显式版本化；编译器按透明连通区域提取完整三视图，禁止机械三等分。

母版为本项目使用 OpenAI 图像生成能力制作的项目专用资产，未从第三方游戏复制角色、地图或 Sprite。资产随本仓库分发；具体使用与再分发范围遵循本项目整体许可。生成提示词和一次性过程不进入运行资产或长期合同。
