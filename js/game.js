/**
 * Rhythm Game Engine — 劲乐团风格
 * Canvas 渲染，7 轨下落音符，按键判定得分
 */

(function () {
  /* ─── DOM ─── */
  const screenStart  = document.getElementById('screen-start');
  const screenGame   = document.getElementById('screen-game');
  const screenResult = document.getElementById('screen-result');
  const hud          = document.getElementById('hud');
  const hudScore     = document.getElementById('hud-score');
  const hudCombo     = document.getElementById('hud-combo');
  const hudSong      = document.getElementById('hud-song');
  const canvas       = document.getElementById('game-canvas');
  const ctx          = canvas.getContext('2d');

  const uploadArea   = document.getElementById('upload-area');
  const fileInput    = document.getElementById('file-input');
  const fileInfo     = document.getElementById('file-info');
  const progressWrap = document.getElementById('analyze-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const startBtn     = document.getElementById('start-btn');

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
  const NOTE_SPEED     = 320;  // px/s
  const LEAD_TIME      = CANVAS_H / NOTE_SPEED;
  const PERFECT_WINDOW = 0.075;
  const GOOD_WINDOW    = 0.15;
  const MISS_WINDOW    = 0.28;

  const KEY_MAP = { 'a': 0, 's': 1, 'd': 2, ' ': 3, 'j': 4, 'k': 5, 'l': 6 };

  const TRACK_COLORS = AudioAnalyzer.TRACKS.map(t => t.color);

  /* ─── 状态 ─── */
  let gameState   = 'start';  // start | playing | paused | result
  let beats       = [];
  let noteObjects = [];
  let audioCtx, audioSource, audioBuffer;
  let songName    = '';
  let startTime   = 0;        // AudioContext.currentTime when song began
  let songDuration = 0;

  let score    = 0;
  let combo    = 0;
  let maxCombo = 0;
  let counts   = { perfect: 0, good: 0, miss: 0 };

  let particles  = [];
  let hitFlashes = new Array(TRACK_COUNT).fill(0); // timestamp of last hit per track
  let judgeFX    = [];   // { text, x, y, alpha, color }

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
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  async function handleFile(file) {
    songName = file.name.replace(/\.[^.]+$/, '');
    fileInfo.textContent = `🎵 ${file.name}`;
    fileInfo.style.display = 'block';
    startBtn.style.display = 'none';

    progressWrap.style.display = 'flex';
    progressFill.style.width = '0%';

    const ab = await file.arrayBuffer();
    const ab2 = ab.slice(0); // 保留一份供播放用

    try {
      const result = await AudioAnalyzer.analyze(ab, (pct, msg) => {
        progressFill.style.width = (pct * 100) + '%';
        progressText.textContent = msg;
      });

      beats        = result.beats;
      songDuration = result.duration;
      audioBuffer  = await decodeAudio(ab2);

      progressWrap.style.display = 'none';
      startBtn.style.display = 'block';
      startBtn.disabled = false;

    } catch(e) {
      progressText.textContent = '分析失败: ' + e.message;
      console.error(e);
    }
  }

  async function decodeAudio(ab) {
    const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx2.decodeAudioData(ab.slice(0));
    ctx2.close();
    return buf;
  }

  startBtn.addEventListener('click', startGame);
  btnRetry.addEventListener('click', startGame);
  btnNew.addEventListener('click', () => {
    stopAudio();
    showScreen('start');
    gameState = 'start';
  });

  /* ─── Screen helpers ─── */
  function showScreen(name) {
    screenStart.style.display  = name === 'start'  ? 'flex' : 'none';
    screenGame.style.display   = name === 'game'   ? 'flex' : 'none';
    screenResult.style.display = name === 'result' ? 'flex' : 'none';
  }

  /* ─── Game start ─── */
  function startGame() {
    if (!beats.length || !audioBuffer) return;

    score    = 0; combo  = 0; maxCombo = 0;
    counts   = { perfect: 0, good: 0, miss: 0 };
    particles = []; judgeFX = [];
    hitFlashes.fill(0);

    // 开头加 LEAD_TIME 缓冲，让第一个音符有时间落到判定线
    const offset = LEAD_TIME + 0.5;
    noteObjects = beats.map((b, idx) => ({
      id: idx, time: b.time + offset, track: b.track,
      state: 'active',
      y: -NOTE_RADIUS,
    }));

    // Resize canvas to fill screen
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.width  = CANVAS_W + 'px';
    canvas.style.height = CANVAS_H + 'px';

    showScreen('game');

    // Start audio — delayed by offset so notes have time to fall before music begins
    stopAudio();
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioCtx.destination);
    const startDelay = LEAD_TIME + 0.5;
    audioSource.start(audioCtx.currentTime + startDelay);
    startTime = audioCtx.currentTime; // songTime = ctx.currentTime - startTime, audio starts at startDelay

    audioSource.onended = () => {
      if (gameState === 'playing') {
        setTimeout(endGame, 1000);
      }
    };

    gameState = 'playing';
    requestAnimationFrame(gameLoop);
  }

  function stopAudio() {
    try {
      if (audioSource) { audioSource.stop(); audioSource.disconnect(); }
      if (audioCtx)    audioCtx.close();
    } catch(e) {}
    audioSource = null;
    audioCtx    = null;
  }

  /* ─── Game Loop ─── */
  let lastTimestamp = 0;
  function gameLoop(timestamp) {
    if (gameState !== 'playing') return;

    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;

    const songTime = audioCtx ? (audioCtx.currentTime - startTime) : 0;

    update(songTime, dt);
    render(songTime);

    requestAnimationFrame(gameLoop);
  }

  function update(songTime, dt) {
    // 更新音符位置
    for (const note of noteObjects) {
      if (note.state !== 'active') continue;
      // note 应该在 note.time 时刻到达 HIT_Y
      // 所以 y = HIT_Y - (note.time - songTime) * NOTE_SPEED
      note.y = HIT_Y - (note.time - songTime) * NOTE_SPEED;

      // 超时 miss
      if (songTime > note.time + MISS_WINDOW) {
        note.state = 'miss';
        combo = 0;
        counts.miss++;
        spawnJudge('MISS', note.track, '#ff4444');
      }
    }

    // 更新粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt; // gravity
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // 更新判定文字
    for (let i = judgeFX.length - 1; i >= 0; i--) {
      const j = judgeFX[i];
      j.y  -= 60 * dt;
      j.age += dt;
      j.alpha = Math.max(0, 1 - j.age / 0.8);
      if (j.alpha <= 0) judgeFX.splice(i, 1);
    }

    // HUD 在 canvas 内绘制，无需操作 DOM

    // 检查结束
    const allDone = noteObjects.every(n => n.state !== 'active');
    const songEnded = audioCtx && (audioCtx.currentTime - startTime) > songDuration + 2;
    if (allDone || songEnded) endGame();
  }

  /* ─── Render ─── */
  function render(songTime) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    drawBackground();
    drawTracks();
    drawHitLine();
    drawNotes(songTime);
    drawParticles();
    drawJudgeFX();
    drawProgressBar(songTime);
    drawHUD(songTime);
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#0a0020');
    grad.addColorStop(1, '#12002a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 0; y < CANVAS_H; y += 4) {
      ctx.fillRect(0, y, CANVAS_W, 2);
    }
  }

  function drawTracks() {
    for (let t = 0; t < TRACK_COUNT; t++) {
      const x = t * TRACK_W;
      const color = TRACK_COLORS[t];

      // track bg
      ctx.fillStyle = `rgba(${hexToRgb(color)},0.04)`;
      ctx.fillRect(x, 0, TRACK_W, CANVAS_H);

      // separator line
      if (t > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_H);
        ctx.stroke();
      }

      // hit glow flash
      const age = (performance.now() - hitFlashes[t]) / 1000;
      if (age < 0.2) {
        const alpha = (1 - age / 0.2) * 0.25;
        ctx.fillStyle = `rgba(${hexToRgb(color)},${alpha})`;
        ctx.fillRect(x, 0, TRACK_W, CANVAS_H);
      }

      // key label at bottom
      const keyLabel = AudioAnalyzer.TRACKS[t].label;
      const bx = x + TRACK_W / 2;
      const by = HIT_Y + 38;

      // key circle
      ctx.beginPath();
      ctx.arc(bx, by, 18, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      const keyAge = (performance.now() - hitFlashes[t]) / 1000;
      if (keyAge < 0.15) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${hexToRgb(color)},0.1)`;
        ctx.fill();
      }
      ctx.stroke();

      ctx.fillStyle = keyAge < 0.15 ? '#000' : color;
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(keyLabel, bx, by);
    }
  }

  function drawHitLine() {
    // outer glow
    const grad = ctx.createLinearGradient(0, HIT_Y - 4, 0, HIT_Y + 4);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, HIT_Y - 4, CANVAS_W, 8);

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, HIT_Y);
    ctx.lineTo(CANVAS_W, HIT_Y);
    ctx.stroke();
  }

  function drawNotes(songTime) {
    for (const note of noteObjects) {
      if (note.state === 'miss' && note.y > CANVAS_H + NOTE_RADIUS) continue;
      if (note.state === 'hit') continue;

      const x = note.track * TRACK_W + TRACK_W / 2;
      const y = note.y;
      const color = TRACK_COLORS[note.track];

      if (y < -NOTE_RADIUS || y > CANVAS_H + NOTE_RADIUS) continue;

      // glow
      const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, NOTE_RADIUS * 2);
      glowGrad.addColorStop(0, `rgba(${hexToRgb(color)},0.4)`);
      glowGrad.addColorStop(1, `rgba(${hexToRgb(color)},0)`);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(x, y, NOTE_RADIUS * 2, 0, Math.PI * 2);
      ctx.fill();

      // note body
      ctx.beginPath();
      ctx.arc(x, y, NOTE_RADIUS, 0, Math.PI * 2);
      const noteGrad = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, NOTE_RADIUS);
      noteGrad.addColorStop(0, '#ffffff');
      noteGrad.addColorStop(0.4, color);
      noteGrad.addColorStop(1, darken(color, 0.5));
      ctx.fillStyle = noteGrad;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // miss fade
      if (note.state === 'miss') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x, y, NOTE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawJudgeFX() {
    for (const j of judgeFX) {
      ctx.globalAlpha = j.alpha;
      ctx.fillStyle = j.color;
      ctx.font = `bold ${j.size}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(j.text, j.x, j.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawProgressBar(songTime) {
    const pct = Math.min(1, songTime / songDuration);
    const h = 4;
    const y = CANVAS_H - h;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, y, CANVAS_W, h);
    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
    grad.addColorStop(0, '#cc00ff');
    grad.addColorStop(1, '#ff6600');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, CANVAS_W * pct, h);
  }

  function drawHUD(songTime) {
    // 分数
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // 半透明顶部背景带
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, CANVAS_W, 52);

    // 歌名
    ctx.fillStyle = 'rgba(150,100,200,0.9)';
    ctx.font = '12px Arial';
    ctx.fillText(songName.length > 40 ? songName.slice(0, 40) + '…' : songName, CANVAS_W / 2, 6);

    // 分数
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(score.toLocaleString(), CANVAS_W / 2, 20);

    // combo
    if (combo >= 4) {
      ctx.fillStyle = '#ff66cc';
      ctx.font = `bold 14px Arial`;
      ctx.fillText(`${combo} COMBO`, CANVAS_W / 2 + 80, 22);
    }

    // accuracy 小字
    const total = counts.perfect + counts.good + counts.miss;
    if (total > 0) {
      const acc = (counts.perfect + counts.good * 0.5) / total * 100;
      ctx.fillStyle = 'rgba(180,140,220,0.8)';
      ctx.font = '11px Arial';
      ctx.textAlign = 'right';
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

    const track = KEY_MAP[key];
    const songTime = audioCtx ? (audioCtx.currentTime - startTime) : 0;

    hitFlashes[track] = performance.now();

    // 找最近的 active note 在该轨道
    let bestNote = null, bestDiff = Infinity;
    for (const note of noteObjects) {
      if (note.state !== 'active' || note.track !== track) continue;
      const diff = Math.abs(note.time - songTime);
      if (diff < bestDiff) { bestDiff = diff; bestNote = note; }
    }

    if (!bestNote || bestDiff > GOOD_WINDOW) {
      // empty hit — no penalty, just flash
      return;
    }

    bestNote.state = 'hit';

    if (bestDiff <= PERFECT_WINDOW) {
      counts.perfect++;
      combo++;
      score += 300 + combo * 10;
      spawnJudge('PERFECT', track, '#ffcc00', 22);
    } else {
      counts.good++;
      combo++;
      score += 100 + combo * 3;
      spawnJudge('GOOD', track, '#00ff88', 18);
    }

    maxCombo = Math.max(maxCombo, combo);
    spawnParticles(bestNote.track * TRACK_W + TRACK_W / 2, HIT_Y, TRACK_COLORS[track]);
  });

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
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        r: 2 + Math.random() * 4,
        color,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
      });
    }
  }

  /* ─── End Game ─── */
  function endGame() {
    if (gameState !== 'playing') return;
    gameState = 'result';
    stopAudio();

    const total = counts.perfect + counts.good + counts.miss;
    const acc   = total > 0 ? (counts.perfect * 1 + counts.good * 0.5) / total : 0;

    let grade, gradeClass;
    if (acc >= 0.95) { grade = 'S'; gradeClass = 'grade-s'; }
    else if (acc >= 0.85) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (acc >= 0.70) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (acc >= 0.55) { grade = 'C'; gradeClass = 'grade-c'; }
    else { grade = 'D'; gradeClass = 'grade-d'; }

    resultGrade.textContent = grade;
    resultGrade.className   = `result-grade ${gradeClass}`;
    resultScore.textContent = score.toLocaleString();
    resultStats.innerHTML   =
      `Perfect: <b>${counts.perfect}</b> &nbsp; Good: <b>${counts.good}</b> &nbsp; Miss: <b>${counts.miss}</b><br>` +
      `Max Combo: <b>${maxCombo}</b> &nbsp; Accuracy: <b>${(acc * 100).toFixed(1)}%</b>`;

    showScreen('result');
  }

  /* ─── Color utils ─── */
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  }

  function darken(hex, factor) {
    const r = Math.floor(parseInt(hex.slice(1, 3), 16) * factor);
    const g = Math.floor(parseInt(hex.slice(3, 5), 16) * factor);
    const b = Math.floor(parseInt(hex.slice(5, 7), 16) * factor);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  /* ─── Init ─── */
  showScreen('start');

})();
