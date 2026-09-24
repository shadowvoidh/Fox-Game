const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('wrapper');

let W, H;

function resize() {
  W = canvas.width = wrapper.clientWidth;
  H = canvas.height = wrapper.clientHeight;
}

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
  gravity: 0.38,      
  jumpForce: -10,   
  moveSpeed: 3.7,
  dashForce: 16,
  dashDuration: 5,
  dashCooldown: 360,
  lavaSpeedBase: 0.43,
  lavaSpeedMax: 3.6,
  winHeight: 10000,
  platGap: 125,
  ballInterval: 300,
};

// ── Game Variables ──
let player, platforms, lava, balls, cameraY, meter, frame, ballTimer;

function initGame() {
  // 1. Recalcula a dimensão da tela no canvas
  resize();

  // 2. Trava posições iniciais fixas do jogador
  player = {
    x: W / 2 - 18,
    y: H - 120,
    w: 36,
    h: 48,
    vx: 0,
    vy: 0,
    jumps: 0,
    maxJumps: 2,
    dashTimer: 0,
    dashCooldownTimer: 0,
    dashDir: 0,
    facing: 1,
    dead: false,
    maxY: H - 120, // Garante que a altura máxima comece cravada no ponto zero
    scaleX: 1,
    scaleY: 1,
    trail: [],
    targetPlatform: null,
    isAutoJumping: false,
  };

  // 3. Define a câmera ANTES de gerar qualquer plataforma
  cameraY = player.y - H * 0.45;

  // 4. Gera o chão base e as plataformas superiores
  platforms = [];
  platforms.push({
    x: 0,
    y: H - 30,
    w: W,
    h: 30,
    type: 'static',
    alpha: 1,
    initialX: 0,
    initialY: H - 30
  });

  for (let i = 1; i < 15; i++) {
    spawnPlatform(H - 30 - i * CFG.platGap);
  }

  // 5. Oculta a lava abaixo do campo visível
  lava = {
    y: H + 300,
    speed: CFG.lavaSpeedBase,
    wave: 0,
    bubbles: Array.from({ length: 8 }, (_, i) => ({
      x: 40 + i * (W / 8),
      y: H + 320 + i * 20,
      r: 4 + Math.random() * 6,
      vy: -0.4 - Math.random() * 0.3,
    })),
  };

  balls = [];
  history = [];

  // 6. Zeramento estrito de placar e loops
  meter = 0;
  mEl.textContent = '0';
  frame = 0;
  ballTimer = CFG.ballInterval;
}
window.addEventListener('load', () => {
  resize();
  initGame();
  requestAnimationFrame(loop);
});

// Executa também um resize imediato
resize();
function spawnPlatform(y) {
  // Garante que W seja válido
  const canvasWidth = W || canvas.width || 400;
  
  const types = ['static', 'static', 'moving', 'crumble', 'spring'];
  const type = types[Math.floor(Math.random() * types.length)];
  const w = 70 + Math.random() * 40;
  const x = Math.random() * (canvasWidth - w);

  platforms.push({
    x, y, w, h: 14,
    type,
    vx: type === 'moving' ? (Math.random() > 0.5 ? 1.5 : -1.5) : 0,
    alpha: 1,
    initialX: x,
    initialY: y
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
    if (state === 'playing' && !player.dead) {
  // Garante que o metro só suba quando o jogador subir além do ponto inicial
  const currentHeight = Math.floor(( (H - 120) - player.y ) / 10);
  meter = Math.max(0, currentHeight);
  mEl.textContent = meter;
}
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

  if (state === 'start') return;
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

function drawPlatform(p) {
  const py = p.y - cameraY;
  
  // Oculta plataformas que estão fora da tela
  if (py + p.h < -50 || py > H + 50) return;

  ctx.save();
  ctx.globalAlpha = p.alpha !== undefined ? p.alpha : 1;

  // Cor base por tipo de plataforma
  let color = '#475569'; // Estática
  let accentColor = '#64748b';

  if (p.type === 'moving') {
    color = '#2563eb';
    accentColor = '#60a5fa';
  } else if (p.type === 'crumble') {
    color = '#d97706';
    accentColor = '#f59e0b';
  } else if (p.type === 'spring') {
    color = '#16a34a';
    accentColor = '#4ade80';
  }

  // Corpo da plataforma
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(p.x, py, p.w, p.h, 6);
  ctx.fill();

  // Borda superior brilhante
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(p.x, py, p.w, 4, [6, 6, 0, 0]);
  ctx.fill();

  ctx.restore();
}


function drawBG() {
  // Preenche o fundo com a cor do céu noturno
  ctx.fillStyle = '#1b263b';
  ctx.fillRect(0, 0, W, H);

  // Desenha estrelas estáticas ao fundo
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 30; i++) {
    // Posições baseadas num padrão simples e fixo
    let sx = (i * 137) % W;
    let sy = ((i * 219) - cameraY * 0.2) % H;
    if (sy < 0) sy += H;
    ctx.fillRect(sx, sy, 2, 2);
  }
}
function draw() {
  // Limpa e desenha o fundo com as estrelas
  drawBG();

  if (!player || !platforms || !balls || !lava) return;

  // Rastro do jogador (Trail)
  player.trail.forEach(t => {
    ctx.save();
    ctx.globalAlpha = t.a * 0.5;
    ctx.fillStyle = player.dashTimer > 0 ? '#22d3ee' : '#ff8c42';
    ctx.beginPath();
    ctx.ellipse(t.x + player.w/2, t.y + player.h/2 - cameraY, player.w*0.4, player.h*0.3, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });

  // Desenha as Plataformas
  platforms.forEach(drawPlatform);

  // Desenha as Bolas de Fogo
  if (typeof drawBall === 'function') {
    balls.forEach(drawBall);
  }

  // Desenha o Jogador (Raposa)
 if (typeof drawFox === 'function') {
  ctx.save();
  const py = player.y - cameraY;
  ctx.translate(player.x + player.w/2, py + player.h/2);
  ctx.scale(player.scaleX, player.scaleY);
  ctx.translate(-(player.x + player.w/2), -(py + player.h/2));
  
  // 🔴 CORREÇÃO AQUI: Passamos (player.dashTimer > 0) em vez de uma variável solta 'isDashing'
  drawFox(
    player.x, 
    py, 
    player.w, 
    player.h, 
    player.facing, 
    player.vy < -1, 
    player.dead, 
    player.dashTimer > 0
  );
  
  ctx.restore();
}


  
  // Desenha a Lava
  if (typeof drawLava === 'function') {
    drawLava();
  }
}

function drawBall(b) {
  const py = b.y - cameraY;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(b.x, py, b.r || 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawLava() {
  const ly = lava.y - cameraY;
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, ly, W, H + 500);
}

function drawFox(x, y, w, h, facing, isJumping, isDead, isDashing) {
  ctx.save();
  
  // 1. Orientação (espelha na horizontal se olhar para a esquerda)
  if (facing < 0) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }

  // 2. Sistema de Cores (Skins e Estados)
  let mainColor = '#f97316'; // Raposa Clássica (Laranja)
  
  // Verifica qual skin está ativa
  if (typeof currentSkin !== 'undefined') {
    if (currentSkin === 'ice') mainColor = '#38bdf8';
    if (currentSkin === 'shadow') mainColor = '#334155';
  }

  // Estados do jogador sobrescrevem a skin
  if (isDashing) mainColor = '#06b6d4';
  if (isDead) mainColor = '#64748b';

  const innerEarColor = isDashing ? '#a5f3fc' : '#ffedd5';
  const bellyColor = '#ffffff';

  // 3. Desenho da Cauda
  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.ellipse(-4, h * 0.7, 10, 6, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = bellyColor;
  ctx.beginPath();
  ctx.ellipse(-8, h * 0.72, 4, 3, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // 4. Desenho das Orelhas
  ctx.fillStyle = mainColor; // Orelha Esquerda
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.35);
  ctx.lineTo(w * 0.05, h * 0.02);
  ctx.lineTo(w * 0.4, h * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = innerEarColor;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.3);
  ctx.lineTo(w * 0.12, h * 0.08);
  ctx.lineTo(w * 0.35, h * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = mainColor; // Orelha Direita
  ctx.beginPath();
  ctx.moveTo(w * 0.6, h * 0.2);
  ctx.lineTo(w * 0.95, h * 0.02);
  ctx.lineTo(w * 0.9, h * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = innerEarColor;
  ctx.beginPath();
  ctx.moveTo(w * 0.65, h * 0.22);
  ctx.lineTo(w * 0.88, h * 0.08);
  ctx.lineTo(w * 0.85, h * 0.3);
  ctx.closePath();
  ctx.fill();

  // 5. Corpo, Barriga e Patas
  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.roundRect(w * 0.2, h * 0.45, w * 0.6, h * 0.5, 8);
  ctx.fill();

  ctx.fillStyle = bellyColor;
  ctx.beginPath();
  ctx.roundRect(w * 0.3, h * 0.5, w * 0.4, h * 0.38, 6);
  ctx.fill();

  ctx.fillStyle = '#1e293b'; // Patas
  ctx.fillRect(w * 0.22, h * 0.88, w * 0.2, h * 0.12);
  ctx.fillRect(w * 0.58, h * 0.88, w * 0.2, h * 0.12);

  // 6. Cabeça e Bochechas
  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.38, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = bellyColor;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.38);
  ctx.lineTo(w * 0.5, h * 0.58);
  ctx.lineTo(w * 0.92, h * 0.38);
  ctx.closePath();
  ctx.fill();

  // 7. Olhos e Focinho
  ctx.fillStyle = '#0f172a';
  
  if (isDead) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.32); ctx.lineTo(w * 0.38, h * 0.40);
    ctx.moveTo(w * 0.38, h * 0.32); ctx.lineTo(w * 0.28, h * 0.40);
    ctx.moveTo(w * 0.62, h * 0.32); ctx.lineTo(w * 0.72, h * 0.40);
    ctx.moveTo(w * 0.72, h * 0.32); ctx.lineTo(w * 0.62, h * 0.40);
    ctx.stroke();
  } else {
    const eyeY = isJumping ? h * 0.32 : h * 0.35;
    ctx.beginPath();
    ctx.arc(w * 0.32, eyeY, 3, 0, Math.PI * 2);
    ctx.arc(w * 0.68, eyeY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff'; // Brilho nos olhos
    ctx.beginPath();
    ctx.arc(w * 0.30, eyeY - 1, 1, 0, Math.PI * 2);
    ctx.arc(w * 0.66, eyeY - 1, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nariz
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.52, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Variáveis de Skins
let currentSkin = localStorage.getItem('foxSkin') || 'orange';
let unlockedSkins = JSON.parse(localStorage.getItem('unlockedSkins') || '["orange"]');

const shopBtn = document.getElementById('shopBtn');
const shopScreen = document.getElementById('shopScreen');
const closeShopBtn = document.getElementById('closeShopBtn');
const shopCoins = document.getElementById('shopCoins');

// Abrir e Fechar Loja
shopBtn.addEventListener('click', () => {
  shopCoins.textContent = highscore + 'm';
  updateShopUI();
  shopScreen.classList.remove('hidden');
});

closeShopBtn.addEventListener('click', () => {
  shopScreen.classList.add('hidden');
});

// Comprar Skin
function buySkin(skin, cost) {
  if (unlockedSkins.includes(skin)) {
    selectSkin(skin);
    return;
  }
  if (highscore >= cost) {
    unlockedSkins.push(skin);
    localStorage.setItem('unlockedSkins', JSON.stringify(unlockedSkins));
    selectSkin(skin);
    updateShopUI();
  } else {
    alert('Você precisa de um recorde de altura maior!');
  }
}

// Selecionar Skin
function selectSkin(skin) {
  if (unlockedSkins.includes(skin)) {
    currentSkin = skin;
    localStorage.setItem('foxSkin', skin);
    updateShopUI();
  }
}

function updateShopUI() {
  ['ice', 'shadow'].forEach(skin => {
    const btn = document.getElementById(`btnSkin${skin.charAt(0).toUpperCase() + skin.slice(1)}`);
    if (unlockedSkins.includes(skin)) {
      btn.textContent = currentSkin === skin ? 'Equipado' : 'Usar';
      btn.style.background = currentSkin === skin ? '#22c55e' : '#3b82f6';
    }
  });
}

function loop() {
  try { update(); draw(); } catch(e) { console.warn('loop:', e); }
  requestAnimationFrame(loop);
}

loop();