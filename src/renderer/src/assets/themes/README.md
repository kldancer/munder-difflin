# 内置主题地图资产清单

## 晶海星港

- 整图背景：`crystal-sea-starport/crystal-sea-starport-map-34x22.png`
- 导航投影：`../maps/crystal-sea-starport.tmj`
- 角色资产：`crystal-sea-starport/characters/`

## 星穹田园公社

- 整图背景：`starfield-farm/starfield-farm-map-34x22.png`
- 导航投影：`../maps/starfield-farm.tmj`
- 角色资产：`starfield-farm/characters/`

两张整图均为本项目使用 OpenAI 图像生成能力制作并按 34×22、每格 32 px 的视觉格网收敛的项目专用资产，未从第三方游戏复制地图、角色、UI 或品牌元素。`tools/build-theme-maps.cjs` 生成与画面匹配的 16 px 逻辑 Tile 导航投影；`tools/render-theme-collision-overlay.py` 用于逐格复核碰撞与操作点。

主题资产不包含脚本、业务状态、Provider 信息或用户数据。资产随本仓库分发；具体使用与再分发范围遵循本项目整体许可。
