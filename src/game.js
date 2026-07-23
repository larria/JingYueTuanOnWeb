/**
 * Rhythm Game Engine — 劲乐团风格
 * 含里程碑 Combo 系统 + 多难度选择
 */

import { analyze, TRACKS } from './analyzer.js';

/* ─── DOM ─── */
const screenStart  = document.getElementById('screen-start');
const screenGame   = document.getElementById('screen-game');
const screenResult = document.getElementById('screen-result');
const canvas       = document.getElementById('game-canvas');
const ctx          = canvas.getContext('2d');

const uploadArea      = document.getElementById('upload-area');
const fileInput       = document.getElementById('file-input');
const fileInfo        = document.getElementById('file-info');
const progressWrap    = document.getElementById('analyze-progress');
const progressFill    = document.getElementById('progress-fill');
const progressText    = document.getElementById('progress-text');
const diffPicker      = document.getElementById('difficulty-picker');
const diffBtns        = document.getElementById('difficulty-btns');
const diffHint        = document.getElementById('difficulty-hint');
const startBtn        = document.getElementById('start-btn');

const resultGrade  = document.getElementById('result-grade');
const resultScore  = document.getElementById('result-score');
const resultStats  = document.getElementById('result-stats');
const btnRetry     = document.getElementById('btn-retry');
const btnNew       = document.getElementById('btn-new');

/* ─── 游戏常量（响应式） ─── */
const TRACK_COUNT    = 7;
const CANVAS_W       = Math.min(window.innerWidth, 700);
const CANVAS_H       = window.innerHeight;
const TRACK_W        = CANVAS_W / TRACK_COUNT;
const HIT_Y          = CANVAS_H - 100;
const NOTE_RADIUS    = Math.min(22, TRACK_W * 0.38);
const NOTE_SPEED     = 320;
const LEAD_TIME      = CANVAS_H / NOTE_SPEED;
const PERFECT_WINDOW = 0.075;
const GOOD_WINDOW    = 0.15;
const MISS_WINDOW    = 0.28;

const KEY_MAP      = { 'a': 0, 's': 1, 'd': 2, ' ': 3, 'j': 4, 'k': 5, 'l': 6 };
const TRACK_COLORS = TRACKS.map(t => t.color);

/* ─── 连击里程碑 ─── */
const MILESTONES = [
  { at: 30,  bonus: 3000,  label: 'FEVER!',      color: '#ffcc00' },
  { at: 70,  bonus: 8000,  label: 'FEVER!!',     color: '#ff6600' },
  { at: 150, bonus: 20000, label: 'MAX FEVER!!', color: '#ff00cc' },
];

/* ─── 难度配置 ─── */
const DIFF_META = [
  { label: 'EASY',   cls: 'easy',   color: '#00ff88', keep: 0.35 },
  { label: 'NORMAL', cls: 'normal', color: '#00c8ff', keep: 0.60 },
  { label: 'HARD',   cls: 'hard',   color: '#ff3264', keep: 1.0  },
];

/* ─── 状态 ─── */
let gameState    = 'start';
let noteObjects  = [];
let audioCtx, audioSource, audioBuffer;
let songName     = '';
let startTime    = 0;
let songDuration = 0;

let score    = 0;
let combo    = 0;
let maxCombo = 0;
let counts   = { perfect: 0, good: 0, miss: 0 };

let milestonesHit  = new Set();
let milestoneFlash = { until: 0, color: '#fff' };

let particles  = [];
let hitFlashes = new Array(TRACK_COUNT).fill(0);
let judgeFX    = [];

let beatsByDifficulty = [];
let selectedDifficulty = 0;

/* ─── File upload ─── */
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  songName = file.name.replace(/\.[^.]+$/, '');
  fileInfo.textContent = `🎵 ${file.name}`;
  fileInfo.style.display = 'block';
  startBtn.style.display = 'none';
  diffPicker.style.display = 'none';

  progressWrap.style.display = 'flex';
  progressFill.style.width = '0%';

  const ab  = await file.arrayBuffer();
  const ab2 = ab.slice(0);

  try {
    const result = await analyze(ab, (pct, msg) => {
      progressFill.style.width = (pct * 100) + '%';
      progressText.textContent = msg;
    });

    songDuration = result.duration;
    audioBuffer  = await decodeAudio(ab2);

    beatsByDifficulty = buildDifficulties(result.rawOnsetsWithFlux, result.beats);
    selectedDifficulty = beatsByDifficulty.length - 1;

    progressWrap.style.display = 'none';
    buildDiffPicker();
    startBtn.style.display = 'block';
    startBtn.disabled = false;

  } catch(e) {
    progressText.textContent = '分析失败: ' + e.message;
    console.error(e);
  }
}

/* ─── 难度构建 ─── */
function filterBeatsByFlux(rawOnsetsWithFlux, fullBeats, keepFraction) {
  const sorted   = rawOnsetsWithFlux.slice().sort((a, b) => b.flux - a.flux);
  const keepN    = Math.ceil(sorted.length * keepFraction);
  const prominent = new Set(sorted.slice(0, keepN).map(o => Math.round(o.time * 100)));
  return fullBeats.filter(b => prominent.has(Math.round(b.time * 100)));
}

function buildDifficulties(rawOnsetsWithFlux, fullBeats) {
  const n = rawOnsetsWithFlux.length;
  let tierCount = n >= 200 ? 3 : n >= 80 ? 2 : 1;

  const available = DIFF_META.slice(DIFF_META.length - tierCount);
  return available.map(meta => ({
    label: meta.label,
    color: meta.color,
    cls:   meta.cls,
    beats: meta.keep >= 1.0
      ? fullBeats
      : filterBeatsByFlux(rawOnsetsWithFlux, fullBeats, meta.keep),
  }));
}

function buildDiffPicker() {
  diffBtns.innerHTML = '';
  beatsByDifficulty.forEach((tier, idx) => {
    const btn = document.createElement('button');
    btn.className = `diff-btn ${tier.cls}${idx === selectedDifficulty ? ' selected' : ''}`;
    btn.textContent = tier.label;
    btn.title = `${tier.beats.length} notes`;
    btn.addEventListener('click', () => {
      selectedDifficulty = idx;
      diffBtns.querySelectorAll('.diff-btn').forEach((b, i) =>
        b.classList.toggle('selected', i === idx)
      );
      diffHint.textContent = `${tier.beats.length} notes`;
    });
    diffBtns.appendChild(btn);
  });
  const cur = beatsByDifficulty[selectedDifficulty];
  diffHint.textContent = `${cur.beats.length} notes`;
  diffPicker.style.display = 'flex';
}

/* ─── Audio ─── */
async function decodeAudio(ab) {
  const c = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await c.decodeAudioData(ab.slice(0));
  c.close();
  return buf;
}

function stopAudio() {
  try {
    if (audioSource) { audioSource.stop(); audioSource.disconnect(); }
    if (audioCtx)    audioCtx.close();
  } catch(e) {}
  audioSource = null;
  audioCtx    = null;
}

/* ─── Listeners ─── */
startBtn.addEventListener('click', () => startGame(selectedDifficulty));
btnRetry.addEventListener('click', () => startGame(selectedDifficulty));
btnNew.addEventListener('click', () => {
  stopAudio();
  showScreen('start');
  gameState = 'start';
});

/* ─── Screen ─── */
function showScreen(name) {
  screenStart.style.display  = name === 'start'  ? 'flex' : 'none';
  screenGame.style.display   = name === 'game'   ? 'flex' : 'none';
  screenResult.style.display = name === 'result' ? 'flex' : 'none';
}

/* ─── Game start ─── */
function startGame(diffIdx) {
  const tier = beatsByDifficulty[diffIdx];
  if (!tier || !tier.beats.length || !audioBuffer) return;

  score    = 0; combo = 0; maxCombo = 0;
  counts   = { perfect: 0, good: 0, miss: 0 };
  milestonesHit.clear();
  milestoneFlash = { until: 0, color: '#fff' };
  particles = []; judgeFX = [];
  hitFlashes.fill(0);

  const offset = LEAD_TIME + 0.5;
  noteObjects = tier.beats.map((b, i) => ({
    id: i, time: b.time + offset, track: b.track,
    state: 'active', y: -NOTE_RADIUS,
  }));

  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.width  = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';

  showScreen('game');

  stopAudio();
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.connect(audioCtx.destination);
  audioSource.start(audioCtx.currentTime + offset);
  startTime = audioCtx.currentTime;

  audioSource.onended = () => {
    if (gameState === 'playing') setTimeout(endGame, 1000);
  };

  gameState = 'playing';
  requestAnimationFrame(gameLoop);
}

/* ─── Game loop ─── */
let lastTimestamp = 0;
function gameLoop(ts) {
  if (gameState !== 'playing') return;
  const dt = Math.min((ts - lastTimestamp) / 1000, 0.05);
  lastTimestamp = ts;
  const songTime = audioCtx ? (audioCtx.currentTime - startTime) : 0;
  update(songTime, dt);
  render(songTime);
  requestAnimationFrame(gameLoop);
}

function update(songTime, dt) {
  for (const note of noteObjects) {
    if (note.state !== 'active') continue;
    note.y = HIT_Y - (note.time - songTime) * NOTE_SPEED;
    if (songTime > note.time + MISS_WINDOW) {
      note.state = 'miss';
      combo = 0;
      counts.miss++;
      spawnJudge('MISS', note.track, '#ff4444');
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 400 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = judgeFX.length - 1; i >= 0; i--) {
    const j = judgeFX[i];
    j.y -= (j.type === 'milestone' ? 40 : 60) * dt;
    j.age += dt;
    const dur = j.type === 'milestone' ? 1.4 : 0.8;
    j.alpha = Math.max(0, 1 - j.age / dur);
    if (j.alpha <= 0) judgeFX.splice(i, 1);
  }

  const allDone  = noteObjects.every(n => n.state !== 'active');
  const overtime = audioCtx && (audioCtx.currentTime - startTime) > songDuration + LEAD_TIME + 2;
  if (allDone || overtime) endGame();
}

/* ─── Render ─── */
function render(songTime) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawBackground();

  if (performance.now() < milestoneFlash.until) {
    const alpha = ((milestoneFlash.until - performance.now()) / milestoneFlash.duration) * 0.22;
    ctx.fillStyle = milestoneFlash.color;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }

  drawTracks();
  drawHitLine();
  drawNotes();
  drawParticles();
  drawJudgeFX();
  drawProgressBar(songTime);
  drawHUD();
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, '#0a0020');
  grad.addColorStop(1, '#12002a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < CANVAS_H; y += 4) ctx.fillRect(0, y, CANVAS_W, 2);
}

function drawTracks() {
  for (let t = 0; t < TRACK_COUNT; t++) {
    const x     = t * TRACK_W;
    const color = TRACK_COLORS[t];

    ctx.fillStyle = `rgba(${hexToRgb(color)},0.04)`;
    ctx.fillRect(x, 0, TRACK_W, CANVAS_H);

    if (t > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }

    const age = (performance.now() - hitFlashes[t]) / 1000;
    if (age < 0.2) {
      ctx.fillStyle = `rgba(${hexToRgb(color)},${(1 - age / 0.2) * 0.25})`;
      ctx.fillRect(x, 0, TRACK_W, CANVAS_H);
    }

    const bx = x + TRACK_W / 2;
    const by = HIT_Y + 38;
    ctx.beginPath();
    ctx.arc(bx, by, 18, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (age < 0.15) {
      ctx.fillStyle = color; ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${hexToRgb(color)},0.1)`; ctx.fill();
    }
    ctx.stroke();
    ctx.fillStyle = age < 0.15 ? '#000' : color;
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(TRACKS[t].label, bx, by);
  }
}

function drawHitLine() {
  const grad = ctx.createLinearGradient(0, HIT_Y - 4, 0, HIT_Y + 4);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, HIT_Y - 4, CANVAS_W, 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, HIT_Y); ctx.lineTo(CANVAS_W, HIT_Y); ctx.stroke();
}

function drawNotes() {
  for (const note of noteObjects) {
    if (note.state === 'hit') continue;
    const y = note.y;
    if (y < -NOTE_RADIUS || y > CANVAS_H + NOTE_RADIUS) continue;

    const x     = note.track * TRACK_W + TRACK_W / 2;
    const color = TRACK_COLORS[note.track];

    const gg = ctx.createRadialGradient(x, y, 0, x, y, NOTE_RADIUS * 2);
    gg.addColorStop(0, `rgba(${hexToRgb(color)},0.4)`);
    gg.addColorStop(1, `rgba(${hexToRgb(color)},0)`);
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, y, NOTE_RADIUS * 2, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath(); ctx.arc(x, y, NOTE_RADIUS, 0, Math.PI * 2);
    const ng = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, NOTE_RADIUS);
    ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.4, color); ng.addColorStop(1, darken(color, 0.5));
    ctx.fillStyle = ng; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    if (note.state === 'miss') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.arc(x, y, NOTE_RADIUS, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawJudgeFX() {
  for (const j of judgeFX) {
    ctx.globalAlpha = j.alpha;
    ctx.fillStyle = j.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (j.type === 'milestone') {
      ctx.font = `bold ${j.size}px Arial`;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 4;
      ctx.strokeText(j.text, j.x, j.y);
      ctx.fillText(j.text, j.x, j.y);
    } else {
      ctx.font = `bold ${j.size}px Arial`;
      ctx.fillText(j.text, j.x, j.y);
    }
  }
  ctx.globalAlpha = 1;
}

function drawProgressBar(songTime) {
  const pct = Math.min(1, Math.max(0, (songTime - (LEAD_TIME + 0.5)) / songDuration));
  const h = 4, y = CANVAS_H - h;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, y, CANVAS_W, h);
  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  grad.addColorStop(0, '#cc00ff'); grad.addColorStop(1, '#ff6600');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, CANVAS_W * pct, h);
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, CANVAS_W, 54);

  const tier = beatsByDifficulty[selectedDifficulty];
  if (tier) {
    ctx.fillStyle = tier.color;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(tier.label, 8, 6);
  }

  ctx.fillStyle = 'rgba(150,100,200,0.9)';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const name = songName.length > 36 ? songName.slice(0, 36) + '…' : songName;
  ctx.fillText(name, CANVAS_W / 2, 6);

  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 26px Arial';
  ctx.fillText(score.toLocaleString(), CANVAS_W / 2, 22);

  if (combo >= 4) {
    const comboColor = combo >= 150 ? '#ff00cc' : combo >= 70 ? '#ff6600' : combo >= 30 ? '#ffcc00' : '#ff66cc';
    ctx.fillStyle = comboColor;
    ctx.font = `bold ${combo >= 30 ? 16 : 14}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(`${combo} COMBO`, CANVAS_W * 0.72, 24);
  }

  const total = counts.perfect + counts.good + counts.miss;
  if (total > 0) {
    const acc = (counts.perfect + counts.good * 0.5) / total * 100;
    ctx.fillStyle = 'rgba(180,140,220,0.8)';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`P:${counts.perfect} G:${counts.good} M:${counts.miss}  ${acc.toFixed(1)}%`, CANVAS_W - 8, 8);
  }

  ctx.restore();
}

/* ─── Input ─── */
document.addEventListener('keydown', e => {
  if (gameState !== 'playing') return;
  if (e.repeat) return;

  const key = e.key === ' ' ? ' ' : e.key.toLowerCase();
  if (!(key in KEY_MAP)) return;
  e.preventDefault();

  const track    = KEY_MAP[key];
  const songTime = audioCtx ? (audioCtx.currentTime - startTime) : 0;
  hitFlashes[track] = performance.now();

  let bestNote = null, bestDiff = Infinity;
  for (const note of noteObjects) {
    if (note.state !== 'active' || note.track !== track) continue;
    const d = Math.abs(note.time - songTime);
    if (d < bestDiff) { bestDiff = d; bestNote = note; }
  }

  if (!bestNote || bestDiff > GOOD_WINDOW) return;

  bestNote.state = 'hit';
  combo++;
  maxCombo = Math.max(maxCombo, combo);

  if (bestDiff <= PERFECT_WINDOW) {
    counts.perfect++;
    score += noteScore(true, combo);
    spawnJudge('PERFECT', track, '#ffcc00', 22);
  } else {
    counts.good++;
    score += noteScore(false, combo);
    spawnJudge('GOOD', track, '#00ff88', 18);
  }

  checkMilestone(combo);
  spawnParticles(bestNote.track * TRACK_W + TRACK_W / 2, HIT_Y, TRACK_COLORS[track]);
});

/* ─── 分数 & 里程碑 ─── */
function noteScore(isPerf, c) {
  if (c >= 150) return isPerf ? 420 + c * 15 : 150 + c * 5;
  if (c >= 70)  return isPerf ? 350 + c * 12 : 120 + c * 4;
  return               isPerf ? 300 + c * 10 : 100 + c * 3;
}

function checkMilestone(c) {
  for (const m of MILESTONES) {
    if (c === m.at && !milestonesHit.has(m.at)) {
      milestonesHit.add(m.at);
      score += m.bonus;
      spawnMilestoneFX(m.label, m.color);
      return;
    }
  }
}

function spawnMilestoneFX(label, color) {
  judgeFX.push({
    type: 'milestone', text: label, color,
    size: 38,
    x: CANVAS_W / 2,
    y: CANVAS_H * 0.35,
    alpha: 1, age: 0,
  });
  milestoneFlash = { until: performance.now() + 400, duration: 400, color };
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 400;
    particles.push({
      x: CANVAS_W / 2, y: CANVAS_H / 2,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 120,
      r: 3 + Math.random() * 5, color,
      life: 0.6 + Math.random() * 0.6, maxLife: 1.2,
    });
  }
}

/* ─── FX helpers ─── */
function spawnJudge(text, track, color, size = 20) {
  judgeFX.push({
    text, color, size,
    x: track * TRACK_W + TRACK_W / 2,
    y: HIT_Y - 40,
    alpha: 1, age: 0,
  });
}

function spawnParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 200;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80,
      r: 2 + Math.random() * 4, color,
      life: 0.4 + Math.random() * 0.4, maxLife: 0.8,
    });
  }
}

/* ─── End game ─── */
function endGame() {
  if (gameState !== 'playing') return;
  gameState = 'result';
  stopAudio();

  const total = counts.perfect + counts.good + counts.miss;
  const acc   = total > 0 ? (counts.perfect + counts.good * 0.5) / total : 0;

  let grade, gradeClass;
  if (acc >= 0.95)      { grade = 'S'; gradeClass = 'grade-s'; }
  else if (acc >= 0.85) { grade = 'A'; gradeClass = 'grade-a'; }
  else if (acc >= 0.70) { grade = 'B'; gradeClass = 'grade-b'; }
  else if (acc >= 0.55) { grade = 'C'; gradeClass = 'grade-c'; }
  else                  { grade = 'D'; gradeClass = 'grade-d'; }

  const tier = beatsByDifficulty[selectedDifficulty];
  resultGrade.textContent = grade;
  resultGrade.className   = `result-grade ${gradeClass}`;
  resultScore.textContent = score.toLocaleString();
  resultStats.innerHTML   =
    `难度: <b>${tier ? tier.label : '-'}</b> &nbsp; ` +
    `Perfect: <b>${counts.perfect}</b> &nbsp; Good: <b>${counts.good}</b> &nbsp; Miss: <b>${counts.miss}</b><br>` +
    `Max Combo: <b>${maxCombo}</b> &nbsp; Accuracy: <b>${(acc * 100).toFixed(1)}%</b>`;

  showScreen('result');
}

/* ─── Color utils ─── */
function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}
function darken(hex, f) {
  const r = Math.floor(parseInt(hex.slice(1,3),16)*f);
  const g = Math.floor(parseInt(hex.slice(3,5),16)*f);
  const b = Math.floor(parseInt(hex.slice(5,7),16)*f);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/* ─── Init ─── */
showScreen('start');
