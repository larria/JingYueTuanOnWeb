# 劲乐团节奏游戏 — 开发文档

## 目录

1. [项目概述](#1-项目概述)
2. [目录结构](#2-目录结构)
3. [运行方式](#3-运行方式)
4. [整体架构](#4-整体架构)

5. [音频分析模块（analyzer.js）](#5-音频分析模块-analyzerjs)
6. [游戏引擎（game.js）](#6-游戏引擎-gamejs)
7. [界面与样式（index.html）](#7-界面与样式-indexhtml)
8. [核心系统详解](#8-核心系统详解)
   - 8.1 音符生成管线
   - 8.2 多难度系统
   - 8.3 连击与里程碑计分
   - 8.4 渲染管线
   - 8.5 输入判定
9. [数据结构](#9-数据结构)
10. [关键常量参考](#10-关键常量参考)
11. [已知问题与改进方向](#11-已知问题与改进方向)

---

## 1. 项目概述

本项目是一款运行在浏览器中的单页节奏游戏，风格参照劲乐团（O2Jam）。玩家将任意 MP3 文件拖入页面后，游戏自动分析音频、生成谱面，音符从屏幕顶部落下，玩家在判定线处按对应按键得分。

**技术栈：** 原生 HTML5 + JavaScript ES Modules（无 UI 框架），使用 Web Audio API 解码音频，Canvas 2D API 渲染，Vite 负责构建打包。

**按键映射：**

| 按键 | 轨道 | 颜色 |
|------|------|------|
| A | 0（最左） | 红 `#ff3264` |
| S | 1 | 橙 `#ff9900` |
| D | 2 | 黄 `#ffff00` |
| 空格 | 3（中央） | 绿 `#00ff88` |
| J | 4 | 青 `#00c8ff` |
| K | 5 | 紫 `#6432ff` |
| L | 6（最右）| 粉 `#ff00c8` |

---

## 2. 目录结构

```
jyt2026/
├── index.html          # 页面入口（HTML 结构 + CSS）
├── src/
│   ├── main.js         # Vite 入口（仅 import game.js）
│   ├── analyzer.js     # 音频分析模块（ES Module export）
│   └── game.js         # 游戏引擎（ES Module，import analyzer）
├── assets/
│   └── music/
│       ├── The Sims 4 Theme.mp3   # 测试用 MP3
│       └── Stage00001.mid         # 测试用 MIDI（当前不支持）
├── public/
│   ├── icon-192.png         # PWA 图标
│   ├── icon-512.png         # PWA 图标（大）
│   └── apple-touch-icon.png # iOS 主屏图标
├── js/                 # 旧版文件（已废弃，保留作参考）
│   ├── analyzer.js
│   └── game.js
├── dist/               # vite build 输出目录（gitignore）
├── package.json
├── vite.config.js
└── DEV.md              # 本文档
```

`index.html` 通过 `<script type="module" src="/src/main.js">` 引入入口，由 Vite 处理模块依赖与打包。

---

## 3. 运行方式

### 开发模式（推荐）

```bash
npm install      # 首次安装依赖
npm run dev      # 启动 Vite 开发服务器（默认 http://localhost:5173）
```

Vite 提供 HMR 热更新，修改 `src/` 下的文件后浏览器自动刷新。

### 生产构建

```bash
npm run build    # 输出到 dist/
npm run preview  # 本地预览构建产物
```

`dist/` 目录可直接部署到任意静态托管服务（Nginx、GitHub Pages、Vercel 等）。

### 部署到 GitHub Pages

```bash
npm run deploy
```

脚本执行 `vite build`，然后用 `gh-pages` 将 `dist/` 推送到 `gh-pages` 分支。  
仓库 Settings → Pages → Branch 选 `gh-pages / (root)` 后保存，约 1 分钟生效。

线上地址：`https://larria.github.io/JingYueTuanOnWeb/`

### 旧版方式（不推荐）

如需不依赖 Node.js 直接运行旧版文件（`js/` 目录），仍可使用静态 HTTP 服务：

```bash
python3 -m http.server 8080
```

但这套旧版代码不再随主分支更新，建议使用 `src/` 目录下的 ES Module 版本。

---

## 4. 整体架构

```
┌──────────────────────────────────────────────┐
│                  index.html                  │
│   start screen │ game screen │ result screen │
└───────┬──────────────────────────────────────┘
        │ File API (arrayBuffer)
        ▼
┌──────────────────┐       ┌──────────────────────────┐
│  analyzer.js     │──────▶│  game.js                 │
│  AudioAnalyzer   │ beats │  handleFile()            │
│  .analyze()      │       │  buildDifficulties()     │
│                  │       │  startGame(diffIdx)      │
│  Web Audio API   │       │  gameLoop → update/render│
│  (OfflineAudio   │       │  keydown → judge         │
│   Context)       │       │  Canvas 2D rendering     │
└──────────────────┘       └──────────────────────────┘
```

**数据流：**
1. 用户选择文件 → `handleFile()` 读取 `ArrayBuffer`
2. `AudioAnalyzer.analyze()` 解码、提取包络、检测 onset、估算 BPM、分配轨道，返回 `beats` 数组
3. `buildDifficulties()` 用 flux 强度过滤，生成 1~3 个难度的 beats 列表
4. 玩家选择难度，点 PLAY → `startGame(diffIdx)` 初始化 `noteObjects`，启动音频与 rAF 循环
5. 每帧 `update()` 更新音符位置、检测 MISS；`render()` 绘制画面
6. `keydown` 事件 → 判定命中 → 计分 → 特效

---

## 5. 音频分析模块（analyzer.js）

### 模块结构

```js
// src/analyzer.js — ES Module
export const TRACKS = [ ... ];         // 7 条轨道元数据
export async function analyze(...) {}  // 主入口
function assignTracks(...) {}          // onset → 轨道分配（内部）
function estimateBPM(...) {}           // BPM 自相关估算（内部）
```

`game.js` 通过 `import { analyze, TRACKS } from './analyzer.js'` 引入，不再依赖全局变量 `AudioAnalyzer`。

### `analyze(arrayBuffer, onProgress)` — 主流程

**参数：**
- `arrayBuffer`：音频文件的 `ArrayBuffer`（会被 `decodeAudioData` 消耗/detach，调用方需提前 `slice(0)` 保留备份）
- `onProgress(pct, msg)`：进度回调，`pct` 为 0~1 浮点数，`msg` 为中文描述字符串

**返回值（Promise）：**
```js
{
  beats:              Array<{ time: number, track: number }>,
  duration:           number,          // 总时长（秒）
  sampleRate:         number,
  tracks:             Array<TrackMeta>,
  rawOnsetsWithFlux:  Array<{ time: number, flux: number }>
}
```

**处理步骤：**

#### 步骤 1：解码（0~15%）
用 `AudioContext.decodeAudioData()` 将 MP3/OGG/WAV 解码为 `AudioBuffer`，多声道混合为单声道 `Float32Array mono`。

#### 步骤 2：提取 RMS 包络（15~30%）
将 `mono` 降采样至 `envSr = 100 Hz`（每 `hop = sr/100` 个采样取 RMS），得到描述音量随时间变化的包络数组 `env`。

```
hop = floor(sampleRate / 100)
env[i] = sqrt( mean( mono[i*hop .. (i+1)*hop]^2 ) )
```

#### 步骤 3：Onset 检测（30~55%）

**Spectral Flux（正向能量变化率）：**
```
flux[i] = max(0, env[i] - env[i-1])
```

**自适应阈值峰值检测：**
- 局部均值窗口 `W = 30`（±300ms）
- 阈值倍率 `mult = 1.4`
- 最小间隔 `minGap = 8`（80ms）
- 条件：`flux[i] > localMean * 1.4` 且为局部极大值且距上一 onset ≥ 80ms

同时记录 `rawOnsetsWithFlux`（含 flux 强度值，供难度系统使用）。

#### 步骤 4：BPM 填充（55~70%）
若检测到的 onset 密度低于 `1.5 notes/s`，在 BPM 节拍网格（半拍间隔）上补充合成点。**合成点不进入 `rawOnsetsWithFlux`**，因此不会出现在低难度谱面中。

BPM 通过 `estimateBPM()` 自相关法估算（60~200 BPM 范围）。

#### 步骤 5：轨道分配（`assignTracks`，70~90%）

对每个 onset 时间点，综合两个特征决定落在哪条轨道：

- **节奏位置**：onset 在 BPM 网格中处于第几个 1/8 拍（subdivision 0~7），正拍（0、4）趋向中央轨道（空格键），其余分散至两侧
- **能量强弱**：局部 RMS 超过全局均值 1.3 倍为"强拍"，强拍更倾向中央轨道

**防重复机制：**
- 连续 2 次同一轨道：向右偏移 `(base + 1 + idx%2) % 7`
- 连续 3 次同一轨道：选取 `trackCounts` 最少的其他轨道，保证 7 轨分布均匀

#### 步骤 6：同槽过滤（90~100%）
同一 60ms 时间槽内最多保留 2 个音符（防止极端密集谱面）。

---

### `estimateBPM(env, envSr)`

对 100Hz 包络做自相关，搜索 lag 对应 60~200 BPM 的范围，返回相关性最强的 BPM 整数值。最多使用前 60 秒数据。

---

## 6. 游戏引擎（game.js）

整个引擎为一个立即执行函数（IIFE），不向外暴露任何变量。

### 常量（响应式，页面加载时计算一次）

```js
CANVAS_W       = min(window.innerWidth, 700)   // 最大 700px 宽
CANVAS_H       = window.innerHeight             // 铺满全屏高
TRACK_W        = CANVAS_W / 7                  // 单轨宽度
HIT_Y          = CANVAS_H - 100                // 判定线 Y 坐标
NOTE_RADIUS    = min(22, TRACK_W * 0.38)       // 音符半径（自适应）
NOTE_SPEED     = 320                           // px/s，音符下落速度
LEAD_TIME      = CANVAS_H / NOTE_SPEED         // 音符从顶到判定线的时间（秒）
PERFECT_WINDOW = 0.075                         // 完美判定 ±75ms
GOOD_WINDOW    = 0.15                          // Good 判定 ±150ms
MISS_WINDOW    = 0.28                          // 超时 MISS 窗口 280ms
```

### 设置系统（自定义按键 + 下落速度）

按键映射和下落速度均从 `localStorage` 读取，缺省回退默认值：

```js
const STORAGE_KEY  = 'jyt2026.settings';
const DEFAULT_KEYS = ['a','s','d',' ','j','k','l'];   // track 0~6 对应按键
const DEFAULT_SPEED = 320;   // px/s
const MIN_SPEED = 100, MAX_SPEED = 800;
let settings = loadSettings();   // { keys: string[7], speed: number }
```

| 辅助函数 | 作用 |
|---------|------|
| `loadSettings()` / `saveSettings(s)` | 读写 localStorage，带结构校验与 try/catch；兼容旧版存档（自动补 `speed` 字段）|
| `keyForTrack(t)` | track 索引 → 按键字符 |
| `trackForKey(key)` | 按键字符 → track 索引（未绑定返回 -1，输入判定用）|
| `labelForTrack(t)` | 展示标签（空格显示 `SPC`，其余大写）|
| `noteSpeed()` | 返回 `settings.speed`，代替原硬编码常量 `NOTE_SPEED` |
| `leadTime()` | 返回 `CANVAS_H / noteSpeed()`，代替原硬编码常量 `LEAD_TIME` |

**生效范围（按键）：** 轨道圆圈字母标签（`drawTracks`）、开始界面 key-guide 图示（`refreshKeyGuide`）、输入判定（`keydown` → `trackForKey`）三处均派生自 `settings.keys`。

**生效范围（速度）：** `update()` 中的 `note.y` 计算、`startGame()` 的 `offset`、`drawProgressBar()` 的进度计算，均调用 `noteSpeed()` / `leadTime()`，每局开始时取当前值，游戏中途修改不影响本局。

**冲突处理（按键）：** 改键时若新按键已被其他轨道占用，自动交换两轨按键，保证 7 个互不相同。

详细交互见第 8.6 节。

### 游戏状态机

```
'start' ──(PLAY)──▶ 'playing' ──(endGame)──▶ 'result'
   ▲                                              │
   └──────────────(btnNew)──────────────────────┘
```

`gameState` 取值：`'start'` | `'playing'` | `'result'`

### 主要函数

#### `handleFile(file)`
异步处理上传文件：
1. 读取 `ArrayBuffer`，`slice(0)` 备份一份供播放
2. 调用 `AudioAnalyzer.analyze()` 分析，进度更新进度条
3. `decodeAudio()` 解码播放用 AudioBuffer
4. `buildDifficulties()` 生成难度列表
5. 动态生成难度选择按钮，显示 PLAY 按钮

#### `buildDifficulties(rawOnsetsWithFlux, fullBeats)`
根据 `rawOnsetsWithFlux.length` 决定档位数：
- `≥ 200` → 3 档（EASY / NORMAL / HARD）
- `≥ 80`  → 2 档（NORMAL / HARD）
- `< 80`  → 1 档（HARD）

调用 `filterBeatsByFlux()` 生成各档 beats。

#### `filterBeatsByFlux(rawOnsetsWithFlux, fullBeats, keepFraction)`
按 flux 值降序排列 rawOnsets，保留前 `keepFraction` 比例；将对应时间点（10ms 精度桶匹配）映射到 fullBeats，过滤出这部分 beats。

EASY=35%，NORMAL=60%，HARD=100%（不过滤）。

#### `startGame(diffIdx)`
初始化一局游戏：
1. 重置所有状态变量（score、combo、counts、milestonesHit 等）
2. 将选定难度的 beats 转换为 `noteObjects`，每个 note 时间加上 `offset = LEAD_TIME + 0.5` 秒缓冲
3. 启动 `AudioContext`，音频延迟同样的 `offset` 秒后开始播放（`audioSource.start(ctx.currentTime + offset)`）
4. `startTime = audioCtx.currentTime`，游戏时间 `songTime = ctx.currentTime - startTime`（包含 offset 段的倒计时）

**时间同步原理：** noteObjects 的 `note.time = beatTime + offset`，音频在 `t = offset` 时开始；当 `songTime = beatTime + offset` 时音符到达判定线，此时音频恰好播放到 `beatTime` 处，两者同步。

#### `gameLoop(timestamp)`
rAF 回调，每帧：
1. 计算 `dt`（帧时间，上限 50ms 防止页面隐藏恢复时跳帧）
2. `update(songTime, dt)`
3. `render(songTime)`

#### `update(songTime, dt)`
- 更新所有 active 音符的 `y = HIT_Y - (note.time - songTime) * NOTE_SPEED`
- 超时（`songTime > note.time + MISS_WINDOW`）的音符标记为 'miss'，combo 归零
- 推进粒子物理（重力加速度 400 px/s²）
- 推进 judgeFX 动画（alpha 衰减）
- 检测游戏结束条件（全部音符非 active 或歌曲超时 2s）

---

## 7. 界面与样式（index.html）

### 三个屏幕

```
#screen-start   — 开始界面（上传文件 + 难度选择）
#screen-game    — 游戏界面（仅 canvas）
#screen-result  — 结算界面（等级 + 分数 + 统计）
```

三个 div 均 `position: fixed; inset: 0`，通过 `display: flex/none` 切换。

### 开始界面 DOM 层级

```
#screen-start
├── .title            "劲乐团"
├── .subtitle         "RHYTHM MASTER"
├── #upload-area      拖拽区域（点击触发 #file-input）
├── #file-info        文件名显示（分析前隐藏）
├── #analyze-progress 进度条容器（分析中显示）
│   ├── .progress-bar > .progress-fill
│   └── .progress-text
├── #difficulty-picker 难度选择（分析完成后显示）
│   ├── .label         "SELECT DIFFICULTY"
│   ├── #difficulty-btns  动态生成按钮
│   └── #difficulty-hint  "N notes"
├── .start-btn#start-btn  "PLAY"
└── .key-guide        按键说明图示
```

### 难度按钮样式

`.diff-btn` 基类 + `.easy` / `.normal` / `.hard` 颜色变体 + `.selected` 选中态（实心背景）。

```css
.diff-btn.easy.selected   { background: #00ff88; color: #000; }
.diff-btn.normal.selected { background: #00c8ff; color: #000; }
.diff-btn.hard.selected   { background: #ff3264; color: #000; }
```

---

## 8. 核心系统详解

### 8.1 音符生成管线

```
MP3 文件
  └─▶ decodeAudioData → AudioBuffer
  └─▶ 单声道混合 → mono Float32Array
      └─▶ 100Hz RMS 包络 env[]
          └─▶ Spectral Flux flux[]
              └─▶ 自适应峰值检测 → rawOnsets[]
                                  rawOnsetsWithFlux[]
              └─▶ BPM 估算 → 密度补充 → onsets[]
                  └─▶ assignTracks() → beats[{time,track}]
                      └─▶ 60ms 槽过滤 → finalBeats[]
```

### 8.2 多难度系统

**档位判定：** 以 `rawOnsetsWithFlux.length` 为标准（真实检测到的能量变化点数量，不含 BPM 合成填充）。

**EASY/NORMAL 筛选原理：**
```
rawOnsetsWithFlux 按 flux 降序排列
EASY:   取 top 35% → 找出这些时间点对应的 fullBeats 条目
NORMAL: 取 top 60%
HARD:   全量 fullBeats
```

时间匹配使用 10ms 精度桶（`Math.round(time * 100)`），安全边际远大于 analyzer 保证的 80ms 最小间隔。

BPM 填充的合成音符不在 `rawOnsetsWithFlux` 中，因此自动被 EASY/NORMAL 过滤掉，这是符合预期的行为（合成音符没有真实能量依据，不适合作为"突出"音节保留）。

### 8.3 连击与里程碑计分

#### 单音符得分（`noteScore(isPerf, combo)`）

| Combo 阶段 | Perfect | Good |
|-----------|---------|------|
| 0 ~ 69    | 300 + combo × 10 | 100 + combo × 3 |
| 70 ~ 149  | 350 + combo × 12 | 120 + combo × 4 |
| 150+      | 420 + combo × 15 | 150 + combo × 5 |

#### 里程碑（`checkMilestone(combo)`）

| Combo 值 | 名称 | 一次性奖励 | 视觉效果颜色 |
|---------|------|----------|------------|
| 30      | FEVER! | +3,000 | 金黄 `#ffcc00` |
| 70      | FEVER!! | +8,000 | 橙 `#ff6600` |
| 150     | MAX FEVER!! | +20,000 | 粉紫 `#ff00cc` |

里程碑触发条件：`combo === milestone.at && !milestonesHit.has(at)`，触发后将 `at` 加入 `milestonesHit` Set，同一局不重复触发。MISS 导致 combo 归零时不清空 `milestonesHit`（断连后重新爬升不会再次获得奖励）。

**视觉效果（`spawnMilestoneFX`）：**
- `judgeFX` 推入 `type:'milestone'` 条目：38px 字体，居中显示于 `CANVAS_H * 0.35`，1.4s 渐隐
- `milestoneFlash`：400ms 全屏色彩叠加（alpha 最大 0.22，随时间线性衰减）
- 30 颗彩色粒子从画面中央爆发

#### Combo 颜色变化（HUD）
```
combo <  30: #ff66cc（粉）
combo >= 30: #ffcc00（金）
combo >= 70: #ff6600（橙）
combo >= 150: #ff00cc（紫）
```

#### MISS 处理
`update()` 中检测超时音符（`songTime > note.time + MISS_WINDOW`），标记为 'miss' 并 `combo = 0`。空按（按错时机或轨道）不破坏 combo，不计任何结果。

### 8.4 渲染管线

每帧 `render()` 按序调用：

```
clearRect
  ▶ drawBackground     深紫渐变背景 + scanline 阴影
  ▶ milestoneFlash     全屏色彩叠加（有里程碑时）
  ▶ drawTracks         7 轨道背景色 + 分隔线 + 按键圆圈 + 命中闪光
  ▶ drawHitLine        判定线（白色 + 发光渐变）
  ▶ drawNotes          音符（外发光 + 球体渐变 + miss 半透明遮罩）
  ▶ drawParticles      粒子（物理运动 + alpha 衰减）
  ▶ drawJudgeFX        判定文字（普通 / 里程碑两种样式）
  ▶ drawProgressBar    底部进度条（紫→橙渐变）
  ▶ drawHUD            顶部信息栏（难度/歌名/分数/combo/统计）
```

**音符渲染细节：**
- 外发光：径向渐变，半径 `NOTE_RADIUS * 2`，alpha 0.4→0
- 球体：径向渐变，高光白→主色→暗色（`darken(color, 0.5)`）
- MISS 状态：额外绘制 `rgba(0,0,0,0.5)` 半透明遮罩
- 已命中（state='hit'）的音符直接跳过绘制

### 8.5 输入判定

```
keydown 事件
  ├─ 过滤：游戏未 playing / 长按（e.repeat）→ 忽略
  ├─ track = trackForKey(key)；track < 0（未绑定键）→ 忽略
  ├─ 记录 hitFlashes[track]（触发按键圆圈亮起动画）
  ├─ 搜索该轨道上 bestDiff 最小的 active note
  ├─ bestDiff > GOOD_WINDOW (0.15s) → 空按，仅闪光，无惩罚
  └─ 命中：
       note.state = 'hit'
       combo++
       ├─ bestDiff ≤ PERFECT_WINDOW (0.075s) → Perfect
       └─ 否则 → Good
       score += noteScore(isPerf, combo)
       checkMilestone(combo)
       spawnParticles(...)
```

**判定窗口示意：**
```
note.time
    │
────┤←── 0.075s ──▶│◀── 0.075s ──▶│
    │    PERFECT    │   PERFECT    │
────┤←────── 0.15s ──────▶│        │
    │         GOOD         │       │
────┤←──────── 0.28s ────────▶│    │
    │              MISS 截止     │  │
```

### 8.6 设置系统

**入口：** 开始界面 PLAY 按钮下方的「设置」按钮，点击弹出 `#settings-modal`。

**DOM 结构（index.html）：**
```
#settings-modal > .modal-card
  ├── .modal-title        "按键设置"
  ├── #key-bindings       7 行绑定（JS 动态生成）
  │     └── .binding-row  色块 + "轨道 N" + .binding-key[data-track]
  └── .modal-actions      恢复默认 / 完成
```

**改键流程：**
```
点击 .binding-key
  └─ startRebind(track)
       rebindingTrack = track
       按钮加 .listening 类，文字变 "按下按键..."
       ↓
下一次 keydown（capture 阶段监听器）
  ├─ rebindingTrack < 0 → 忽略（正常游戏输入）
  ├─ e.preventDefault() + stopPropagation()  ← 拦截，不触发游戏判定
  ├─ key.length !== 1 → 忽略（排除 Shift/Ctrl/方向键等功能键）
  ├─ 冲突检测：existing = settings.keys.indexOf(key)
  │    existing >= 0 且 !== rebindingTrack → 交换两轨按键
  ├─ settings.keys[rebindingTrack] = key
  ├─ saveSettings() → localStorage
  └─ renderKeyBindings() + refreshKeyGuide()  ← 同步图示与圆圈标签
```

**capture 阶段监听**：`addEventListener('keydown', fn, true)`，确保改键监听器先于游戏 keydown 执行。虽然设置面板只在 `start` 界面打开（`gameState !== 'playing'`，游戏 keydown 本就 return），capture 是双重保险。

**恢复默认**：`settings.keys = DEFAULT_KEYS.slice()` → `saveSettings` → 重新渲染。

**localStorage 结构：**
```json
{ "keys": ["a","s","d"," ","j","k","l"] }
```
读取时做结构校验（必须是长度 7 的数组），损坏数据回退默认值。

---

## 9. 数据结构

### `TrackMeta`（定义于 analyzer.js）
```ts
{
  key:   string,   // 'a'|'s'|'d'|' '|'j'|'k'|'l'
  label: string,   // 'A'|'S'|'D'|'SPC'|'J'|'K'|'L'
  color: string,   // CSS 颜色值
}
```

### `Beat`
```ts
{ time: number, track: number }
// time: 从歌曲 0:00 起的秒数（浮点数）
// track: 0~6，对应 7 条轨道
```

### `RawOnsetWithFlux`
```ts
{ time: number, flux: number }
// flux: Spectral Flux 峰值，越大表示该时刻能量突变越强
```

### `NoteObject`（game.js 内部）
```ts
{
  id:    number,   // beats 数组的原始索引
  time:  number,   // 游戏时间轴上的命中时刻（beat.time + offset）
  track: number,   // 0~6
  state: 'active' | 'hit' | 'miss',
  y:     number,   // 当前屏幕 Y 坐标，每帧由 update() 计算
}
```

### `JudgeFX`（game.js 内部）
```ts
{
  type?:  'milestone',  // 缺省为普通判定文字
  text:   string,
  color:  string,
  size:   number,   // 字号（px）
  x:      number,
  y:      number,
  alpha:  number,   // 0~1，渐变动画
  age:    number,   // 已存活秒数
}
```

### `Particle`（game.js 内部）
```ts
{
  x, y:        number,  // 位置
  vx, vy:      number,  // 速度（px/s）
  r:           number,  // 半径
  color:       string,
  life:        number,  // 剩余寿命（秒）
  maxLife:     number,  // 初始寿命
}
// 物理：vy += 400 * dt（重力），life -= dt
// 渲染 alpha = life / maxLife
```

### `DifficultyTier`（game.js 内部）
```ts
{
  label: 'EASY' | 'NORMAL' | 'HARD',
  color: string,
  cls:   string,    // CSS class name
  beats: Beat[],
}
```

### `AnalyzeResult`（analyze() 返回值）
```ts
{
  beats:             Beat[],
  duration:          number,
  sampleRate:        number,
  tracks:            TrackMeta[],
  rawOnsetsWithFlux: RawOnsetWithFlux[],
}
```

---

## 10. 关键常量参考

### analyzer.js

| 常量 | 值 | 含义 |
|------|-----|------|
| `envSr` | 100 | 包络降采样率（Hz） |
| `W` | 30 | 自适应阈值窗口半径（帧，= ±300ms） |
| `mult` | 1.4 | 阈值倍率（局部均值的 1.4 倍） |
| `minGap` | 8 | 最小 onset 间隔（帧，= 80ms） |
| `minDensity` | 1.5 | 触发 BPM 填充的密度阈值（notes/s） |

### game.js — 设置

| 常量 | 值 | 含义 |
|------|-----|------|
| `STORAGE_KEY` | `'jyt2026.settings'` | localStorage 键名 |
| `DEFAULT_KEYS` | `['a','s','d',' ','j','k','l']` | 7 轨默认按键（track 0~6）|
| `DEFAULT_SPEED` | `320` px/s | 音符下落速度默认值 |
| `MIN_SPEED` | `100` px/s | 速度下限 |
| `MAX_SPEED` | `800` px/s | 速度上限 |

### game.js — 判定

| 常量 | 值 | 含义 |
|------|-----|------|
| `PERFECT_WINDOW` | 0.075s | Perfect 判定半窗口 |
| `GOOD_WINDOW` | 0.15s | Good 判定半窗口（同时是空按截止） |
| `MISS_WINDOW` | 0.28s | 超时 MISS 窗口 |

### game.js — 渲染

| 常量/函数 | 值 | 含义 |
|---------|-----|------|
| `noteSpeed()` | `settings.speed`（默认 320 px/s）| 音符下落速度，从设置动态读取 |
| `leadTime()` | `CANVAS_H / noteSpeed()`（约 2.4s @ 320）| 音符从顶部到判定线的时间 |
| `HIT_Y` | CANVAS_H - 100 | 判定线 Y 坐标（距底 100px） |

### game.js — 难度阈值

| rawOnsetsWithFlux.length | 可用档位 |
|--------------------------|---------|
| ≥ 200 | EASY + NORMAL + HARD |
| ≥ 80  | NORMAL + HARD |
| < 80  | HARD 仅 |

### game.js — 里程碑

| Combo | 名称 | 奖励分数 | 颜色 |
|-------|------|---------|------|
| 30    | FEVER! | 3,000 | `#ffcc00` |
| 70    | FEVER!! | 8,000 | `#ff6600` |
| 150   | MAX FEVER!! | 20,000 | `#ff00cc` |

---

## 11. PWA 架构

### 技术选型

| 包 | 用途 |
|----|------|
| `vite-plugin-pwa` | 自动生成 Service Worker + Web App Manifest |
| `workbox-window` | SW 注册与生命周期管理（autoUpdate 模式） |
| `gh-pages` | 将 `dist/` 推送到 `gh-pages` 分支 |

### Service Worker 策略

`vite-plugin-pwa` 使用 Workbox `generateSW` 模式：

- **预缓存**：所有 JS / CSS / HTML / PNG 在安装时预缓存（约 82 KiB），离线可玩
- **运行时缓存**：MP3/OGG/WAV 使用 `NetworkOnly`——用户上传的音频不缓存，避免 Cache Storage 无限膨胀
- **更新策略**：`registerType: 'autoUpdate'`，新版本 SW 激活后自动接管，无需用户手动刷新

### Manifest 配置

```json
{
  "name": "劲乐团 2026",
  "short_name": "劲乐团",
  "display": "fullscreen",
  "orientation": "portrait",
  "theme_color": "#0a0010",
  "background_color": "#0a0010"
}
```

`display: fullscreen` 确保安装到主屏后隐藏浏览器 UI，接近原生游戏体验。

### 图标

`public/` 目录下放置三个图标，由 Python/Pillow 程序化生成（深紫背景 + 渐变圆 + "劲"字）：

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `icon-192.png` | 192×192 | Android 主屏 |
| `icon-512.png` | 512×512 | 高分辨率 / maskable |
| `apple-touch-icon.png` | 180×180 | iOS 主屏 |

如需更换图标，替换以上三个文件后重新 `npm run build`。

### 部署流程

```
npm run deploy
  └─ vite build        → dist/（含 sw.js、manifest.webmanifest）
  └─ gh-pages -d dist  → 推送到 github:gh-pages 分支
```

GitHub Actions（可选）：可在 `.github/workflows/deploy.yml` 中加入 `push` 触发，实现自动 CI/CD。

---

## 12. 已知问题与改进方向

### 已知限制

1. **MIDI 不支持**：`assets/music/Stage00001.mid` 无法被 `decodeAudioData` 解码，目前仅支持 MP3/OGG/WAV。如需支持 MIDI，需引入 MIDI 解析库（如 Tone.js 或 midi-player-js）单独处理。

2. **轨道分配不感知旋律**：当前 `assignTracks` 仅依据能量强弱和节拍位置决定轨道，无法区分旋律音和伴奏音。音符在各轨的分布对玩家而言是随机感的，不像人工制作的谱面那样有旋律感。

3. **响应式仅在初始化时计算**：`CANVAS_W/CANVAS_H` 等常量在页面加载时计算，不响应窗口 resize。

4. **长歌性能**：对于超过 10 分钟的音频，`noteObjects` 数组可能超过 5000 个对象，`update()` 每帧遍历全量可能有轻微性能压力（可通过二分查找优化）。

### 可能的改进方向

- **真实音调映射**：用 FFT 分析每个 onset 前后的主频，映射到 7 个频率区间决定轨道，使谱面有旋律感
- **长按音符**：检测持续时间较长的音符段，生成 hold note
- **多文件/歌单**：支持导入多首歌并切换
- **背景视频/可视化**：在 canvas 背景层绘制音频频谱波形
- **谱面保存与加载**：将分析结果序列化为 JSON，下次加载同一首歌可直接读取，跳过分析步骤
- **移动端支持**：触摸事件支持，屏幕虚拟按键
- **音效**：每次命中播放短促的打击音效（可用 Web Audio API 合成）
