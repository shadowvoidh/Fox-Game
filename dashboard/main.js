 const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('wrapper');

let W, H;
function resize() {
  W = canvas.width = wrapper.clientWidth;
  H = canvas.height = wrapper.clientHeight;
}
resize();
window.addEventListener('resize', resize);

// ── DOM Elements ──
const mEl = document.getElementById('mEl');
const hsEl = document.getElementById('hsEl');
const playerRadar = document.getElementById('playerRadar');
const lavaRadar = document.getElementById('lavaRadar');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const victoryScreen = document.getElementById('victoryScreen');
const goScore = document.getElementById('goScore');
const newRecord = document.getElementById('newRecord');
const dashIndicator = document.getElementById('dashIndicator');
const replayIndicator = document.getElementById('replayIndicator');
const replaySpeedLabel = document.getElementById('replaySpeedLabel');

// ── State ──
let state = 'start'; // 'start' | 'playing' | 'dead' | 'victory' | 'replay'
let highscore = parseInt(localStorage.getItem('foxBlazeHS') || '0');
hsEl.textContent = highscore + 'm';

// Replay Storage
let history = [];
let replayFrame = 0;
let replaySpeed = 1;

// ── Audio Web API ──
const AC = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, type, dur, vol = 0.08) {
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, AC.currentTime);
    o.frequency.exponentialRampToValueAtTime(10, AC.currentTime + dur);
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g);
    g.connect(AC.destination);
    o.start();
    o.stop(AC.currentTime + dur);
  } catch(e) {}
}

const SFX = {
  jump: () => playSound(420, 'triangle', 0.15),
  dj:   () => playSound(620, 'triangle', 0.18),
  dash: () => playSound(800, 'square', 0.15, 0.05),
  die:  () => playSound(120, 'sawtooth', 0.4, 0.15),
  ball: () => playSound(300, 'square', 0.1, 0.05),
  victory: () => {
    playSound(523, 'sine', 0.25);
    setTimeout(() => playSound(659, 'sine', 0.25), 120);
    setTimeout(() => playSound(783, 'sine', 0.4), 240);
  }
};

// ── Config ──
const CFG = {
  gravity: 0.55,
  jumpForce: -12.5,
  moveSpeed: 4.8,
  dashForce: 16,
  dashDuration: 10,
  dashCooldown: 60,
  lavaSpeedBase: 0.85,
  lavaSpeedMax: 4.8,
  winHeight: 2000, // Altura em metros para vitória
  platGap: 125,
  ballInterval: 220,
};

// ── Game Variables ──
let player, platforms, lava, balls, cameraY, meter, frame, ballTimer;

// Drawing Fox Sprite
function drawFox(x, y, w, h, facing, isJumping, isDead, isDashing) {
  ctx.save();
  ctx.translate(x + w/2, y + h/2);
  if (facing < 0) ctx.scale(-1, 1);

  // Tail
  ctx.fillStyle = isDead ? '#777' : (isDashing ? '#22d3ee' : '#ff8c42');
  ctx.beginPath();
  ctx.ellipse(-w*0.55, h*0.1, w*0.32, h*0.22, Math.PI * 0.35, 0, Math.PI*2);
  ctx.fill();

  // Tail tip
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-w*0.68, h*0.05, w*0.15, h*0.11, Math.PI * 0.35, 0, Math.PI*2);
  ctx.fill();

  // Body
  ctx.fillStyle = isDead ? '#666' : (isDashing ? '#0ea5e9' : '#ff6b2b');
  ctx.beginPath();
  ctx.ellipse(0, h*0.08, w*0.38, h*0.34, 0, 0, Math.PI*2);
  ctx.fill();

  // Belly
  ctx.fillStyle = isDead ? '#888' : '#ffd4a8';
  ctx.beginPath();
  ctx.ellipse(w*0.06, h*0.14, w*0.22, h*0.22, 0, 0, Math.PI*2);
  ctx.fill();

  // Head
  ctx.fillStyle = isDead ? '#666' : (isDashing ? '#0ea5e9' : '#ff6b2b');
  ctx.beginPath();
  ctx.ellipse(w*0.15, -h*0.2, w*0.3, h*0.28, 0, 0, Math.PI*2);
  ctx.fill();

  // Ears
  ctx.fillStyle = isDead ? '#666' : (isDashing ? '#0ea5e9' : '#ff6b2b');
  ctx.beginPath();
  ctx.moveTo(w*0.02, -h*0.4);
  ctx.lineTo(-w*0.08, -h*0.58);
  ctx.lineTo(w*0.14, -h*0.44);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w*0.2, -h*0.4);
  ctx.lineTo(w*0.32, -h*0.58);
  ctx.lineTo(w*0.28, -h*0.44);
  ctx.closePath();
  ctx.fill();

  // Inner ears
  ctx.fillStyle = isDead ? '#888' : '#ffb3a0';
  ctx.beginPath();
  ctx.moveTo(w*0.04, -h*0.42);
  ctx.lineTo(-w*0.04, -h*0.52);
  ctx.lineTo(w*0.12, -h*0.46);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w*0.22, -h*0.42);
  ctx.lineTo(w*0.30, -h*0.52);
  ctx.lineTo(w*0.26, -h*0.46);
  ctx.closePath();
  ctx.fill();

  // Face mask
  ctx.fillStyle = isDead ? '#888' : '#ffd4a8';
  ctx.beginPath();
  ctx.ellipse(w*0.2, -h*0.16, w*0.18, h*0.18, 0, 0, Math.PI*2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#330000';
  ctx.beginPath();
  ctx.ellipse(w*0.3, -h*0.1, w*0.05, h*0.035, 0, 0, Math.PI*2);
  ctx.fill();

  // Eyes
  if (isDead) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    [[-h*0.26], [-h*0.24]].forEach(([ey], i) => {
      const ex = i===0 ? w*0.07 : w*0.2;
      ctx.beginPath();
      ctx.moveTo(ex - 4, ey - 3); ctx.lineTo(ex + 4, ey + 3);
      ctx.moveTo(ex + 4, ey - 3); ctx.lineTo(ex - 4, ey + 3);
      ctx.stroke();
    });
  } else {
    ctx.fillStyle = '#1a0000';
    ctx.beginPath(); ctx.arc(w*0.07, -h*0.24, h*0.05, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(w*0.21, -h*0.25, h*0.05, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(w*0.09, -h*0.26, h*0.02, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(w*0.23, -h*0.27, h*0.02, 0, Math.PI*2); ctx.fill();
  }

  // Legs
  const legH = isJumping ? h*0.08 : h*0.12;
  ctx.fillStyle = isDead ? '#666' : (isDashing ? '#0ea5e9' : '#ff6b2b');
  ctx.beginPath(); ctx.roundRect(-w*0.22, h*0.32, w*0.18, legH, 4); ctx.fill();
  ctx.beginPath(); ctx.roundRect(w*0.04, h*0.32, w*0.18, legH, 4); ctx.fill();

  ctx.restore();
}

function drawBall(b) {
  ctx.save();
  ctx.translate(b.x, b.y - cameraY);

  const grd = ctx.createRadialGradient(0,0, b.r*0.2, 0,0, b.r*1.5);
  grd.addColorStop(0, 'rgba(255,100,0,0.4)');
  grd.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0,0, b.r*1.5, 0, Math.PI*2); ctx.fill();

  const ballGrd = ctx.createRadialGradient(-b.r*0.3, -b.r*0.3, b.r*0.1, 0, 0, b.r);
  ballGrd.addColorStop(0, '#ffdd44');
  ballGrd.addColorStop(0.4, '#ff6600');
  ballGrd.addColorStop(1, '#cc1100');
  ctx.fillStyle = ballGrd;
  ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI*2); ctx.fill();

  ctx.strokeStyle = 'rgba(255,200,0,0.6)';
  ctx.lineWidth = 1.5;
  for (let i=0; i<4; i++) {
    ctx.save();
    ctx.rotate(b.spin + i * Math.PI/2);
    ctx.beginPath(); ctx.arc(0,0, b.r*0.6, 0, Math.PI*0.8);
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

function drawPlatform(p) {
  const py = p.y - cameraY;
  if (py > H + 20 || py < -40) return;
  ctx.save();

  let color1, color2, glow;
  if (p.type === 'static') {
    color1 = '#475569'; color2 = '#1e293b'; glow = null;
  } else if (p.type === 'move') {
    color1 = '#0ea5e9'; color2 = '#0369a1'; glow = 'rgba(14,165,233,0.4)';
  } else if (p.type === 'vertical') {
    color1 = '#8b5cf6'; color2 = '#5b21b6'; glow = 'rgba(139,92,246,0.4)';
  } else if (p.type === 'fade') {
    ctx.globalAlpha = p.alpha;
    color1 = '#ec4899'; color2 = '#be185d'; glow = 'rgba(236,72,153,0.4)';
  }

  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
  }

  const grad = ctx.createLinearGradient(p.x, py, p.x, py + p.h);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(p.x, py, p.w, p.h, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.roundRect(p.x + 4, py + 2, p.w - 8, 3, 2);
  ctx.fill();

  ctx.restore();
}

function drawLava() {
  if (!lava) return;
  const relY = lava.y - cameraY;

  const gl = ctx.createLinearGradient(0, relY - 180, 0, relY);
  gl.addColorStop(0, 'rgba(249, 115, 22, 0)');
  gl.addColorStop(1, 'rgba(249, 115, 22, 0.5)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, relY - 180, W, 180);

  ctx.beginPath();
  ctx.moveTo(0, relY);
  for (let x = 0; x <= W; x += 10) {
    ctx.lineTo(x, relY + Math.sin(x * 0.03 + lava.wave) * 10 + Math.cos(x * 0.02 + lava.wave*0.7) * 5);
  }
  ctx.lineTo(W, H + 100);
  ctx.lineTo(0, H + 100);
  ctx.closePath();

  const lavGrad = ctx.createLinearGradient(0, relY, 0, relY + 300);
  lavGrad.addColorStop(0, '#fb923c');
  lavGrad.addColorStop(0.2, '#ea580c');
  lavGrad.addColorStop(0.6, '#9a3412');
  lavGrad.addColorStop(1, '#431407');
  ctx.fillStyle = lavGrad;
  ctx.fill();

  lava.bubbles.forEach(b => {
    const bRelY = b.y - cameraY;
    if (bRelY > H || bRelY < relY - 30) return;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.arc(b.x, bRelY, b.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function drawBG() {
  const skyT = Math.min(1, (meter || 0) / CFG.winHeight);
  const r1 = Math.round(30 - skyT*20), g1 = Math.round(41 - skyT*30), b1 = Math.round(59 + skyT*20);
  const r2 = Math.round(15 - skyT*10), g2 = Math.round(23 - skyT*15), b2 = Math.round(42 - skyT*20);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, `rgb(${r1},${g1},${b1})`);
  skyGrad.addColorStop(1, `rgb(${r2},${g2},${b2})`);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i=0; i<35; i++) {
    const sx = (i * 137.5 + 50) % W;
    const sy = (i * 251.3 + 20) % H;
    const ss = ((i * 0.7) % 1.5) + 0.5;
    ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI*2); ctx.fill();
  }
}

function initGame() {
  player = {
    x: W/2 - 18, y: H - 120,
    w: 36, h: 48,
    vx: 0, vy: 0,
    jumps: 0, maxJumps: 2,
    dashTimer: 0,
    dashCooldownTimer: 0,
    dashDir: 0,
    facing: 1,
    dead: false,
    maxY: H - 120,
    scaleX: 1, scaleY: 1,
    trail: [],
    targetPlatform: null,
    isAutoJumping: false,
  };

  platforms = [];
  platforms.push({ x: 0, y: H - 30, w: W, h: 30, type: 'static', alpha: 1, initialX: 0, initialY: H-30 });
  for (let i = 1; i < 14; i++) {
    spawnPlatform(H - 30 - i * CFG.platGap);
  }

  lava = {
    y: H + 180,
    speed: CFG.lavaSpeedBase,
    wave: 0,
    bubbles: Array.from({length:8}, (_,i) => ({
      x: 40 + i * (W/8),
      y: H + 200 + i*20,
      r: 4 + Math.random()*6,
      vy: -0.4 - Math.random()*0.3,
    })),
  };

  balls = [];
  history = [];
  cameraY = 0;
  meter = 0;
  frame = 0;
  ballTimer = CFG.ballInterval;
  mEl.textContent = '0';
}

function spawnPlatform(y) {
  const diff = Math.min(1, Math.max(0, meter / CFG.winHeight));
  const minW = 85 - diff * 45;
  const w = Math.max(35, minW + Math.random() * 45);
  const x = Math.random() * (W - w);
  
  let type = 'static';
  const r = Math.random();
  if (r < 0.25 + diff * 0.25) type = 'move';
  else if (r < 0.4 + diff * 0.2) type = 'vertical';
  else if (r < 0.5 + diff * 0.2) type = 'fade';

  platforms.push({
    x, y, w, h: 14, type,
    initialX: x,
    initialY: y,
    moveRange: 40 + Math.random()*70,
    moveSpeed: 0.8 + diff*2,
    time: Math.random()*100,
    alpha: 1,
    stepOn: false,
  });
}

function spawnBall() {
  const by = lava.y - 80 - Math.random() * (H * 0.5);
  balls.push({
    x: W + 30,
    y: by,
    r: 16 + Math.random() * 10,
    vx: -(2.5 + Math.random() * 2 + Math.min(3, meter/800)),
    spin: 0,
  });
  SFX.ball();
}

// Controls
const keys = {};

function triggerJump() {
  if (state !== 'playing') return;
  if (player.jumps < player.maxJumps) {
    player.vy = CFG.jumpForce;
    player.jumps === 0 ? SFX.jump() : SFX.dj();
    player.jumps++;
    player.scaleX = 0.7; player.scaleY = 1.4;
    player.isAutoJumping = false;
  }
}

function triggerDash() {
  if (state !== 'playing') return;
  if (player.dashCooldownTimer <= 0) {
    let dir = keys['left'] ? -1 : (keys['right'] ? 1 : player.facing);
    player.dashDir = dir;
    player.dashTimer = CFG.dashDuration;
    player.dashCooldownTimer = CFG.dashCooldown;
    SFX.dash();
    player.isAutoJumping = false;
  }
}

document.getElementById('btn-left').addEventListener('pointerdown', e => { keys['left'] = true; e.currentTarget.classList.add('pressed'); });
document.getElementById('btn-left').addEventListener('pointerup', e => { keys['left'] = false; e.currentTarget.classList.remove('pressed'); });
document.getElementById('btn-left').addEventListener('pointerleave', e => { keys['left'] = false; e.currentTarget.classList.remove('pressed'); });
document.getElementById('btn-right').addEventListener('pointerdown', e => { keys['right'] = true; e.currentTarget.classList.add('pressed'); });
document.getElementById('btn-right').addEventListener('pointerup', e => { keys['right'] = false; e.currentTarget.classList.remove('pressed'); });
document.getElementById('btn-right').addEventListener('pointerleave', e => { keys['right'] = false; e.currentTarget.classList.remove('pressed'); });

document.getElementById('btn-jump').addEventListener('pointerdown', triggerJump);
document.getElementById('btn-dash').addEventListener('pointerdown', triggerDash);

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys['left'] = true;
  if (e.key === 'ArrowRight' || e.key === 'd') keys['right'] = true;
  if ((e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w')) triggerJump();
  if (e.key === 'Shift') triggerDash();
  if (e.key.toLowerCase() === 'h' && state === 'playing') findNextPlatform();
});

window.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys['left'] = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys['right'] = false;
});

// Auto Jump Helper
function findNextPlatform() {
  let best = null;
  let minDistanceAbove = Infinity;
  platforms.forEach(p => {
    const dist = player.y - p.y;
    if (dist > 15 && dist < minDistanceAbove) {
      minDistanceAbove = dist;
      best = p;
    }
  });
  if (best) {
    player.targetPlatform = best;
    player.isAutoJumping = true;
  }
}

function handleAutoJump() {
  if (!player.targetPlatform) return;
  const p = player.targetPlatform;
  const targetX = p.x + (p.w / 2) - (player.w / 2);
  const horizontalDist = targetX - player.x;
  const verticalDist = player.y - p.y;

  if (Math.abs(horizontalDist) > 2) {
    player.vx = horizontalDist > 0 ? CFG.moveSpeed : -CFG.moveSpeed;
    player.facing = horizontalDist > 0 ? 1 : -1;
  } else {
    player.vx *= 0.5;
  }

  if (player.vy === 0 && player.jumps === 0) {
    player.vy = CFG.jumpForce;
    player.jumps++;
    SFX.jump();
  } else if (player.vy > -1 && player.jumps === 1 && verticalDist > 40) {
    player.vy = CFG.jumpForce;
    player.jumps++;
    SFX.dj();
  }
}

// Replay System
function recordFrame() {
  history.push({
    px: player.x, py: player.y,
    pvx: player.vx, pvy: player.vy,
    pFacing: player.facing, pDead: player.dead,
    pDash: player.dashTimer > 0,
    pTrail: player.trail.map(t => ({...t})),
    camY: cameraY,
    lavaY: lava.y,
    lavaWave: lava.wave,
    meter: meter,
    platforms: platforms.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, type: p.type, alpha: p.alpha })),
    balls: balls.map(b => ({ x: b.x, y: b.y, r: b.r, spin: b.spin }))
  });
}

function startReplay(speed) {
  if (history.length === 0) return;
  replaySpeed = speed;
  replayFrame = 0;
  state = 'replay';
  gameOverScreen.classList.add('hidden');
  replayIndicator.style.display = 'block';
  replaySpeedLabel.textContent = speed + 'x';
}

document.getElementById('btnReplay1x').addEventListener('click', () => startReplay(1));
document.getElementById('btnReplay2x').addEventListener('click', () => startReplay(2));

// Game State Buttons
document.getElementById('btnStart').addEventListener('click', () => {
  AC.resume();
  startScreen.classList.add('hidden');
  initGame();
  state = 'playing';
});

document.getElementById('btnRestart').addEventListener('click', () => {
  gameOverScreen.classList.add('hidden');
  initGame();
  state = 'playing';
});

document.getElementById('btnVictoryRestart').addEventListener('click', () => {
  victoryScreen.classList.add('hidden');
  initGame();
  state = 'playing';
});

function die() {
  if (player.dead) return;
  player.dead = true;
  player.vy = -8;
  SFX.die();
  setTimeout(() => {
    state = 'dead';
    goScore.textContent = meter + 'm';
    const isNew = meter > highscore;
    if (isNew) {
      highscore = meter;
      localStorage.setItem('foxBlazeHS', highscore);
      hsEl.textContent = highscore + 'm';
      newRecord.classList.remove('hidden');
    } else {
      newRecord.classList.add('hidden');
    }
    gameOverScreen.classList.remove('hidden');
  }, 800);
}

function winGame() {
  if (state === 'victory') return;
  state = 'victory';
  SFX.victory();
  victoryScreen.classList.remove('hidden');
}

function update() {
  if (state === 'replay') {
    for (let i = 0; i < replaySpeed; i++) {
      if (replayFrame < history.length) {
        const f = history[replayFrame];
        player.x = f.px; player.y = f.py;
        player.vx = f.pvx; player.vy = f.pvy;
        player.facing = f.pFacing; player.dead = f.pDead;
        player.trail = f.pTrail;
        cameraY = f.camY;
        lava.y = f.lavaY; lava.wave = f.lavaWave;
        meter = f.meter;
        mEl.textContent = meter;
        platforms = f.platforms;
        balls = f.balls;

        const pProg = Math.min(1, Math.max(0, meter / CFG.winHeight));
        const lavaMeters = Math.max(0, Math.floor((H - 120 - lava.y) / 10));
        const lProg = Math.min(1, Math.max(0, lavaMeters / CFG.winHeight));
        playerRadar.style.bottom = (pProg * 96) + '%';
        lavaRadar.style.bottom = Math.max(0, lProg * 96) + '%';

        replayFrame++;
      } else {
        state = 'dead';
        gameOverScreen.classList.remove('hidden');
        replayIndicator.style.display = 'none';
        break;
      }
    }
    return;
  }

  if (state !== 'playing' && !player?.dead) return;
  if (!player || !lava || !platforms || !balls) return;

  frame++;

  // Cooldown Dash UI
  if (player.dashCooldownTimer > 0) player.dashCooldownTimer--;
  if (player.dashCooldownTimer <= 0) {
    dashIndicator.classList.add('dash-ready');
    dashIndicator.textContent = 'SHIFT / ⚡: DASH PRONTO';
  } else {
    dashIndicator.classList.remove('dash-ready');
    dashIndicator.textContent = 'RECARREGANDO DASH...';
  }

  if (player.isAutoJumping) {
    handleAutoJump();
  }

  // Dash Mechanics
  if (player.dashTimer > 0) {
    player.vx = player.dashDir * CFG.dashForce;
    player.vy = 0;
    player.dashTimer--;
    player.trail.push({ x: player.x, y: player.y, a: 0.8 });
  } else {
    // Normal Movement
    if (!player.dead) {
      if (!player.isAutoJumping) {
        if (keys['left']) { player.vx = -CFG.moveSpeed; player.facing = -1; }
        else if (keys['right']) { player.vx = CFG.moveSpeed; player.facing = 1; }
        else player.vx *= 0.75;
      }
    }
    player.vy += CFG.gravity;
  }

  player.x += player.vx;
  player.y += player.vy;

  player.scaleX += (1 - player.scaleX) * 0.2;
  player.scaleY += (1 - player.scaleY) * 0.2;

  if (Math.abs(player.vx) > 2 || player.vy < -3) {
    player.trail.push({ x: player.x, y: player.y, a: 0.4 });
  }
  player.trail = player.trail.filter(t => (t.a -= 0.06) > 0);

  // Screen Boundaries
  if (player.x < 0) { player.x = 0; player.vx = 0; }
  if (player.x + player.w > W) { player.x = W - player.w; player.vx = 0; }

  // Platform Collision
  if (!player.dead) {
    platforms.forEach(p => {
      if (p.type === 'move') {
        p.x = p.initialX + Math.sin(p.time) * p.moveRange;
        p.time += 0.015 * p.moveSpeed;
      } else if (p.type === 'vertical') {
        p.y = p.initialY + Math.sin(p.time) * (p.moveRange / 2);
        p.time += 0.015 * p.moveSpeed;
      }

      if (p.type === 'fade' && p.stepOn) {
        p.alpha -= 0.015;
        if (p.alpha <= 0) p.alpha = 0;
      }

      if (player.vy > 0 &&
          player.x + player.w > p.x + 4 &&
          player.x < p.x + p.w - 4 &&
          player.y + player.h > p.y &&
          player.y + player.h < p.y + p.h + player.vy + 5) {
        if (p.alpha <= 0.05) return;
        
        if (player.isAutoJumping && p === player.targetPlatform) {
          player.isAutoJumping = false;
          player.targetPlatform = null;
        }

        player.y = p.y - player.h;
        player.vy = 0;
        player.jumps = 0;
        player.scaleX = 1.3; player.scaleY = 0.7;
        if (p.type === 'fade') p.stepOn = true;
      }
    });
  }

  // Altitude Tracking
  if (player.y < player.maxY) player.maxY = player.y;
  meter = Math.max(0, Math.floor((H - 120 - player.maxY) / 10));
  mEl.textContent = meter;

  if (meter >= CFG.winHeight) {
    winGame();
    return;
  }

  // Camera Follow
  const targetCam = player.y - H * 0.45;
  cameraY += (targetCam - cameraY) * 0.1;

  // Lava Progression
  lava.speed = Math.min(CFG.lavaSpeedMax, CFG.lavaSpeedBase + meter / 800);
  lava.y -= lava.speed;
  lava.wave += 0.04;

  lava.bubbles.forEach(b => {
    b.y += b.vy;
    if (b.y < lava.y - 20) {
      b.y = lava.y + 30;
      b.x = Math.random() * W;
      b.r = 4 + Math.random() * 6;
    }
  });

  if (!player.dead && player.y + player.h > lava.y) die();

  // Balls Spawning & Collision
  ballTimer--;
  if (ballTimer <= 0 && !player.dead) {
    spawnBall();
    ballTimer = Math.max(70, CFG.ballInterval - meter / 20);
  }

  balls.forEach(b => {
    b.x += b.vx;
    b.spin += 0.08;
    if (!player.dead) {
      const dx = (player.x + player.w/2) - b.x;
      const dy = (player.y + player.h/2) - b.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < b.r + 14) die();
    }
  });
  balls = balls.filter(b => b.x > -60);

  // Platform Generation
  const highestP = Math.min(...platforms.map(p => p.y));
  if (highestP > cameraY - 450) spawnPlatform(highestP - CFG.platGap);
  platforms = platforms.filter(p => p.y < lava.y + 400 && p.alpha > 0.01);

  // Radar Updates
  const pProg = Math.min(1, Math.max(0, meter / CFG.winHeight));
  const lavaMeters = Math.max(0, Math.floor((H - 120 - lava.y) / 10));
  const lavaProg = Math.min(1, Math.max(0, lavaMeters / CFG.winHeight));
  playerRadar.style.bottom = (pProg * 96) + '%';
  lavaRadar.style.bottom = Math.max(0, lavaProg * 96) + '%';

  recordFrame();
}

function draw() {
  drawBG();

  if (!player || !platforms || !balls || !lava) return;

  // Trail
  player.trail.forEach(t => {
    ctx.save();
    ctx.globalAlpha = t.a * 0.5;
    ctx.fillStyle = player.dashTimer > 0 ? '#22d3ee' : '#ff8c42';
    ctx.beginPath();
    ctx.ellipse(t.x + player.w/2, t.y + player.h/2 - cameraY, player.w*0.4, player.h*0.3, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });

  // Platforms
  platforms.forEach(drawPlatform);

  // Balls
  balls.forEach(drawBall);

  // Player
  ctx.save();
  const py = player.y - cameraY;
  ctx.translate(player.x + player.w/2, py + player.h/2);
  ctx.scale(player.scaleX, player.scaleY);
  ctx.translate(-(player.x + player.w/2), -(py + player.h/2));
  drawFox(player.x, py, player.w, player.h, player.facing, player.vy < -1, player.dead, player.dashTimer > 0);
  ctx.restore();

  drawLava();
}

function loop() {
  try { update(); draw(); } catch(e) { console.warn('loop:', e); }
  requestAnimationFrame(loop);
}

loop();