# 劲乐团 2026

浏览器端节奏游戏，风格参照劲乐团（O2Jam）。拖入任意 MP3 文件，游戏自动分析音频、生成谱面，音符从屏幕顶部落下，在判定线处按对应按键得分。

## 快速开始

```bash
npm install
npm run dev
```

浏览器访问 `http://localhost:5173`，拖入 MP3 文件即可开始游戏。

## 构建

```bash
npm run build    # 输出到 dist/
npm run preview  # 预览构建产物
```

## 游戏玩法

| 按键 | 轨道 |
|------|------|
| A | 左 1 |
| S | 左 2 |
| D | 左 3 |
| 空格 | 中央 |
| J | 右 1 |
| K | 右 2 |
| L | 右 3 |

- **Perfect**（±75ms）/ **Good**（±150ms）命中得分，combo 越高分越多
- **MISS**（>280ms 未命中）combo 归零
- 达到 combo 30 / 70 / 150 触发 FEVER 里程碑奖励
- 支持 EASY / NORMAL / HARD 三档难度（根据音乐复杂度自动解锁）

## 支持格式

MP3、OGG、WAV（浏览器 Web Audio API 支持的格式均可）

## 技术栈

- **Vite 5** — 构建工具
- **Web Audio API** — 音频解码与分析
- **Canvas 2D API** — 渲染引擎
- 无 UI 框架，无运行时依赖

## 项目结构

```
src/
  main.js       # 入口
  analyzer.js   # 音频分析（onset 检测、BPM 估算、轨道分配）
  game.js       # 游戏引擎（渲染、输入、计分）
index.html      # HTML 结构 + 样式
```

详细技术文档见 [DEV.md](./DEV.md)。
