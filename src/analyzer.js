/**
 * Audio Analyzer — fast onset detection
 * 策略：对整个信号做一次离线渲染（无滤波），提取降采样包络，
 * 再在时域用简单的带通思路区分7个轨道（按音符密度 + 时间分配）
 * 对任意 MP3 速度快、效果稳定。
 */

export const TRACKS = [
  { key: 'a', label: 'A',   color: '#ff3264' },
  { key: 's', label: 'S',   color: '#ff9900' },
  { key: 'd', label: 'D',   color: '#ffff00' },
  { key: ' ', label: 'SPC', color: '#00ff88' },
  { key: 'j', label: 'J',   color: '#00c8ff' },
  { key: 'k', label: 'K',   color: '#6432ff' },
  { key: 'l', label: 'L',   color: '#ff00c8' },
];

export async function analyze(arrayBuffer, onProgress) {
  onProgress(0.05, '解码音频...');

  // 解码
  const decCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuf;
  try {
    audioBuf = await decCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    decCtx.close();
    throw new Error('音频解码失败: ' + e.message);
  }
  decCtx.close();

  const sr       = audioBuf.sampleRate;
  const duration = audioBuf.duration;

  // 混合为单声道
  const nCh = audioBuf.numberOfChannels;
  const mono = new Float32Array(audioBuf.length);
  for (let c = 0; c < nCh; c++) {
    const ch = audioBuf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / nCh;
  }

  onProgress(0.15, '提取包络...');

  // 1. 降采样到 100 Hz 的 RMS 包络
  const envSr   = 100;
  const hop     = Math.floor(sr / envSr);
  const envLen  = Math.floor(mono.length / hop);
  const env     = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let sum = 0;
    const base = i * hop;
    const end  = Math.min(base + hop, mono.length);
    for (let j = base; j < end; j++) sum += mono[j] * mono[j];
    env[i] = Math.sqrt(sum / (end - base));
  }

  onProgress(0.30, '检测 onset...');

  // 2. Spectral flux on envelope → onset list
  const flux = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) {
    const d = env[i] - env[i - 1];
    flux[i] = d > 0 ? d : 0;
  }

  // 自适应阈值
  const W    = 30;   // ±300ms
  const mult = 1.4;
  const minGap = 8; // 80ms 最小间隔

  const rawOnsets = [];          // time in seconds
  const rawOnsetsWithFlux = [];  // { time, flux } — 只含真实检测的 onset，不含 BPM 填充
  let lastI = -minGap;

  for (let i = W + 1; i < envLen - W; i++) {
    let sum = 0;
    for (let w = i - W; w <= i + W; w++) sum += flux[w];
    const threshold = (sum / (2 * W + 1)) * mult;
    if (
      flux[i] > threshold &&
      flux[i] >= flux[i - 1] &&
      flux[i] >= flux[i + 1] &&
      (i - lastI) >= minGap
    ) {
      rawOnsets.push(i / envSr);
      rawOnsetsWithFlux.push({ time: i / envSr, flux: flux[i] });
      lastI = i;
    }
  }

  onProgress(0.55, '估算 BPM...');

  // 3. 估算 BPM
  const bpm = estimateBPM(env, envSr);

  // 4. 如果 onset 太少，用 BPM 填补
  let onsets = rawOnsets.slice();
  const minDensity = 1.5; // notes/sec
  if (onsets.length / duration < minDensity) {
    const beatInterval = 60 / bpm;
    // 在 beat grid 上补充缺失的点
    for (let t = 0.5; t < duration - 0.5; t += beatInterval * 0.5) {
      const near = onsets.some(o => Math.abs(o - t) < beatInterval * 0.3);
      if (!near) onsets.push(t);
    }
    onsets.sort((a, b) => a - b);
  }

  onProgress(0.70, '生成谱面...');

  // 5. 把 onset 分配到 7 个轨道
  const beats = assignTracks(onsets, env, envSr, duration, bpm);

  onProgress(0.90, '优化谱面...');

  // 6. 去掉同一时刻超过 2 个的 note
  const finalBeats = [];
  const slotMap = new Map();
  for (const b of beats) {
    const slot = Math.round(b.time / 0.06); // 60ms slot
    const cnt = slotMap.get(slot) || 0;
    if (cnt < 2) {
      finalBeats.push(b);
      slotMap.set(slot, cnt + 1);
    }
  }

  onProgress(1.0, '完成!');

  return { beats: finalBeats, duration, sampleRate: sr, tracks: TRACKS, rawOnsetsWithFlux };
}

/**
 * 把 onset 时间列表分配到 7 个轨道
 */
function assignTracks(onsets, env, envSr, duration, bpm) {
  const beatInterval = 60 / bpm;
  const beats = [];
  let prevTrack = -1;
  let prevPrevTrack = -1;

  let globalRMS = 0;
  for (let i = 0; i < env.length; i++) globalRMS += env[i];
  globalRMS /= env.length;

  const trackCounts = new Array(7).fill(0);

  for (let idx = 0; idx < onsets.length; idx++) {
    const t = onsets[idx];

    const beatPhase   = (t / beatInterval) % 1;
    const subdivision = Math.floor(beatPhase * 8);

    const envIdx = Math.min(Math.round(t * envSr), env.length - 1);
    const localE = env[envIdx];
    const isStrong = localE > globalRMS * 1.3;

    let base;
    const s = subdivision;
    if (s === 0 || s === 4) {
      base = isStrong ? 3 : ((idx % 5 < 2) ? 2 : 4);
    } else if (s === 2 || s === 6) {
      base = idx % 3;
    } else if (s === 1 || s === 5) {
      base = 4 + (idx % 3);
    } else {
      base = idx % 7;
    }
    base = Math.max(0, Math.min(6, base));

    let track = base;
    if (track === prevTrack && track === prevPrevTrack) {
      let minCnt = Infinity, minT = -1;
      for (let tt = 0; tt < 7; tt++) {
        if (tt !== prevTrack && trackCounts[tt] < minCnt) {
          minCnt = trackCounts[tt]; minT = tt;
        }
      }
      track = minT >= 0 ? minT : (base + 1) % 7;
    } else if (track === prevTrack) {
      track = (base + 1 + (idx % 2)) % 7;
    }

    trackCounts[track]++;
    beats.push({ time: t, track });
    prevPrevTrack = prevTrack;
    prevTrack = track;
  }

  return beats;
}

function estimateBPM(env, envSr) {
  const len = Math.min(env.length, envSr * 60);

  let bestBpm = 120, bestCorr = -Infinity;
  for (let bpm = 60; bpm <= 200; bpm++) {
    const lag = Math.round(envSr * 60 / bpm);
    if (lag >= len) continue;
    let corr = 0;
    const maxN = Math.min(len - lag, envSr * 20);
    for (let i = 0; i < maxN; i++) corr += env[i] * env[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestBpm = bpm; }
  }
  return bestBpm;
}
