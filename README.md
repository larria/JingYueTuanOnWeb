# 劲乐团 2026

浏览器端节奏游戏，风格参照劲乐团（O2Jam）。拖入任意 MP3 文件，游戏自动分析音频、生成谱面，音符从屏幕顶部落下，在判定线处按对应按键得分。

**在线游玩：** https://larria.github.io/JingYueTuanOnWeb/

支持「添加到主屏幕」安装为 PWA，离线也可游玩（需先在线加载一次）。

> GitHub Pages 由 `gh-pages` 分支托管，源码在 `main` 分支。本地修改后执行 `npm run deploy` 即可重新构建并发布到线上。

---

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

## 构建与部署

```bash
npm run build      # 输出到 dist/
npm run preview    # 本地预览
npm run deploy     # 构建并推送到 GitHub Pages (gh-pages 分支)
```

首次部署后，在 GitHub 仓库 **Settings → Pages → Branch** 选 `gh-pages / (root)` 并保存，约 1 分钟后线上地址生效。

## 代码仓库

项目同步维护两个远端，每次推送需同时更新：

| 平台 | 地址 |
|------|------|
| GitHub | https://github.com/larria/JingYueTuanOnWeb.git |
| Gitee  | https://gitee.com/larria/jingyuetuan-web.git |

```bash
git push github main   # 推送到 GitHub
git push origin main   # 推送到 Gitee
```

---

## 游戏玩法

| 按键 | 轨道 |
|------|------|
| A | 左 1（红）|
| S | 左 2（橙）|
| D | 左 3（黄）|
| 空格 | 中央（绿）|
| J | 右 1（青）|
| K | 右 2（紫）|
| L | 右 3（粉）|

- **Perfect**（±75ms）/ **Good**（±150ms）命中得分，combo 越高单次分越多
- **MISS**（>280ms 未命中）combo 清零
- combo 达到 30 / 70 / 150 触发 FEVER 里程碑奖励（+3000 / +8000 / +20000 分）
- 支持 EASY / NORMAL / HARD 三档难度（根据音乐复杂度自动解锁）

> 可在开始界面点「设置」自定义 7 个轨道按键、调整音符下落速度（100 ~ 800 px/s），所有配置保存在浏览器本地（localStorage），刷新后仍生效。按键冲突时自动交换两轨。

## 支持格式

MP3、OGG、WAV（浏览器 Web Audio API 支持的格式均可）

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Vite 5 | 开发服务器 & 生产构建 |
| vite-plugin-pwa | Service Worker + Web App Manifest |
| workbox | SW 预缓存策略（离线支持）|
| gh-pages | 一键部署到 GitHub Pages |
| Web Audio API | 音频解码 & 节拍分析 |
| Canvas 2D API | 游戏渲染引擎 |

无 UI 框架，无运行时依赖。

## 项目结构

```
src/
  main.js         # Vite 入口
  analyzer.js     # 音频分析（onset 检测、BPM 估算、轨道分配）
  game.js         # 游戏引擎（渲染、输入、计分）
public/
  icon-192.png    # PWA 图标
  icon-512.png
  apple-touch-icon.png
index.html        # HTML 结构 + 样式
vite.config.js    # Vite + PWA 配置
```

详细技术文档见 [DEV.md](./DEV.md)。
