const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");
const nameEntry = document.getElementById("name-entry");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const skipNameBtn = document.getElementById("skip-name");
const pendingScoreEl = document.getElementById("pending-score");
const leaderboardList = document.getElementById("leaderboard-list");
const boardWrap = document.getElementById("board-wrap");
const effectBadge = document.getElementById("effect-badge");
const pickupToast = document.getElementById("pickup-toast");

const CELL = 20;
const COLS = canvas.width / CELL;
const ROWS = canvas.height / CELL;
const STEP_MS = 180;
const LEADERBOARD_KEY = "snake-leaderboard";
const MAX_LEADERBOARD_ENTRIES = 5;

const POWER_UP_DEFS = {
  speed: { label: "Speed Boost", glyph: "⚡", color: "#facc15", glow: "rgba(250, 204, 21, 0.85)", duration: 6000 },
  slow: { label: "Slow-Mo", glyph: "🐢", color: "#38bdf8", glow: "rgba(56, 189, 248, 0.85)", duration: 6000 },
  double: { label: "Double Score", glyph: "2×", color: "#fb923c", glow: "rgba(251, 146, 60, 0.85)", duration: 8000 },
  shrink: { label: "Shrink", glyph: "✂", color: "#c084fc", glow: "rgba(192, 132, 252, 0.85)", duration: 0 },
};
const POWER_UP_TYPES = Object.keys(POWER_UP_DEFS);
const POWERUP_LIFETIME = 7000;
const POWERUP_MIN_INTERVAL = 8000;
const POWERUP_MAX_INTERVAL = 14000;

let snake, direction, nextDirection, food, score, best, running, paused, pendingScore;
let powerUp, activeEffect, powerUpSpawnTimer, tickAccumulator, lastFrameTime, flashTimeoutId, toastTimeoutId, toastFadeId;

function loadBest() {
  try {
    const stored = Number(localStorage.getItem("snake-best"));
    return Number.isFinite(stored) ? stored : 0;
  } catch (e) {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem("snake-best", String(value));
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

function loadLeaderboard() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEADERBOARD_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveLeaderboard(list) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

function qualifiesForLeaderboard(list, value) {
  if (value <= 0) return false;
  if (list.length < MAX_LEADERBOARD_ENTRIES) return true;
  return value > list[list.length - 1].score;
}

function renderLeaderboard(list, highlightIndex) {
  leaderboardList.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.className = "leaderboard-empty";
    li.textContent = "No scores yet — be the first!";
    leaderboardList.appendChild(li);
    return;
  }

  list.forEach((entry, i) => {
    const li = document.createElement("li");
    li.className = "leaderboard-row" + (i === highlightIndex ? " is-new" : "");

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(i + 1);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = entry.name;

    const points = document.createElement("span");
    points.className = "points";
    points.textContent = String(entry.score);

    li.append(rank, name, points);
    leaderboardList.appendChild(li);
  });
}

function randomCell() {
  return {
    x: Math.floor(Math.random() * COLS),
    y: Math.floor(Math.random() * ROWS),
  };
}

function cellTaken(cell) {
  return (
    snake.some((s) => s.x === cell.x && s.y === cell.y) ||
    (food && food.x === cell.x && food.y === cell.y) ||
    (powerUp && powerUp.x === cell.x && powerUp.y === cell.y)
  );
}

function placeFood() {
  let cell;
  do {
    cell = randomCell();
  } while (snake.some((s) => s.x === cell.x && s.y === cell.y) || (powerUp && powerUp.x === cell.x && powerUp.y === cell.y));
  food = cell;
}

function scheduleNextPowerUp() {
  powerUpSpawnTimer = POWERUP_MIN_INTERVAL + Math.random() * (POWERUP_MAX_INTERVAL - POWERUP_MIN_INTERVAL);
}

function spawnPowerUp() {
  const type = POWER_UP_TYPES[Math.floor(Math.random() * POWER_UP_TYPES.length)];
  let cell;
  do {
    cell = randomCell();
  } while (cellTaken(cell));
  powerUp = { type, x: cell.x, y: cell.y, ttl: POWERUP_LIFETIME };
}

function flashBoard(glowColor) {
  boardWrap.style.setProperty("--flash-glow", glowColor);
  boardWrap.classList.add("power-flash");
  clearTimeout(flashTimeoutId);
  flashTimeoutId = setTimeout(() => boardWrap.classList.remove("power-flash"), 350);
}

function showPickupToast(text, color) {
  pickupToast.textContent = text;
  pickupToast.style.color = color;
  pickupToast.hidden = false;
  pickupToast.style.opacity = "1";

  clearTimeout(toastTimeoutId);
  clearTimeout(toastFadeId);
  toastTimeoutId = setTimeout(() => {
    pickupToast.style.opacity = "0";
    toastFadeId = setTimeout(() => {
      pickupToast.hidden = true;
    }, 300);
  }, 1300);
}

function applyPowerUp(type) {
  const def = POWER_UP_DEFS[type];
  let toastText = `${def.glyph} ${def.label}`;

  if (type === "shrink") {
    const removable = Math.max(0, snake.length - 4);
    const removeCount = Math.min(3, removable);
    for (let i = 0; i < removeCount; i++) snake.pop();
    toastText = removeCount > 0 ? `${def.glyph} Shrink −${removeCount}` : `${def.glyph} Already short!`;
  } else {
    activeEffect = { type, ttl: def.duration };
  }

  showPickupToast(toastText, def.color);
  flashBoard(def.glow);
}

function clearActiveEffect() {
  activeEffect = null;
}

function currentStepMs() {
  if (activeEffect?.type === "speed") return STEP_MS * 0.55;
  if (activeEffect?.type === "slow") return STEP_MS * 1.6;
  return STEP_MS;
}

function currentScoreMultiplier() {
  return activeEffect?.type === "double" ? 2 : 1;
}

function updatePowerUps(delta) {
  if (activeEffect) {
    activeEffect.ttl -= delta;
    if (activeEffect.ttl <= 0) clearActiveEffect();
  }

  if (powerUp) {
    powerUp.ttl -= delta;
    if (powerUp.ttl <= 0) {
      powerUp = null;
      scheduleNextPowerUp();
    }
  } else {
    powerUpSpawnTimer -= delta;
    if (powerUpSpawnTimer <= 0) spawnPowerUp();
  }
}

function renderEffectBadge() {
  if (!activeEffect) {
    effectBadge.hidden = true;
    return;
  }
  const def = POWER_UP_DEFS[activeEffect.type];
  const seconds = Math.max(0, Math.ceil(activeEffect.ttl / 1000));
  effectBadge.textContent = `${def.glyph} ${def.label} · ${seconds}s`;
  effectBadge.style.color = def.color;
  effectBadge.hidden = false;
}

function resetGame() {
  snake = [
    { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) },
    { x: Math.floor(COLS / 2) - 1, y: Math.floor(ROWS / 2) },
    { x: Math.floor(COLS / 2) - 2, y: Math.floor(ROWS / 2) },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = direction;
  score = 0;
  paused = false;
  scoreEl.textContent = "0";
  powerUp = null;
  activeEffect = null;
  tickAccumulator = 0;
  scheduleNextPowerUp();
  placeFood();
  renderEffectBadge();
  hidePickupToast();
}

function hidePickupToast() {
  clearTimeout(toastTimeoutId);
  clearTimeout(toastFadeId);
  pickupToast.hidden = true;
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
}

function showNameEntry(value) {
  hideOverlay();
  pendingScoreEl.textContent = String(value);
  nameInput.value = "";
  nameEntry.hidden = false;
  nameInput.focus();
}

function hideNameEntry() {
  nameEntry.hidden = true;
}

function startGame() {
  resetGame();
  running = true;
  hideOverlay();
}

function endGame() {
  running = false;
  powerUp = null;
  clearActiveEffect();
  renderEffectBadge();
  hidePickupToast();
  if (score > best) {
    best = score;
    bestEl.textContent = String(best);
    saveBest(best);
  }

  if (qualifiesForLeaderboard(loadLeaderboard(), score)) {
    pendingScore = score;
    showNameEntry(score);
  } else {
    showOverlay(`Game over — score ${score}. Press Space or tap to restart`);
  }
}

function finishScoreEntry(name) {
  const list = loadLeaderboard();
  const trimmedName = name.trim().slice(0, 12) || "Anonymous";
  const entry = { name: trimmedName, score: pendingScore };

  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX_LEADERBOARD_ENTRIES);

  saveLeaderboard(top);
  renderLeaderboard(top, top.indexOf(entry));
  hideNameEntry();
  showOverlay(`Game over — score ${pendingScore}. Press Space or tap to restart`);
  pendingScore = undefined;
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  if (paused) {
    showOverlay("Paused — press Space to resume");
  } else {
    hideOverlay();
  }
}

function tick() {
  direction = nextDirection;

  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };

  const hitsWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
  const hitsSelf = snake.some((s) => s.x === head.x && s.y === head.y);

  if (hitsWall || hitsSelf) {
    endGame();
    return;
  }

  snake.unshift(head);

  let grew = false;
  if (head.x === food.x && head.y === food.y) {
    score += 10 * currentScoreMultiplier();
    scoreEl.textContent = String(score);
    placeFood();
    grew = true;
  }

  if (powerUp && head.x === powerUp.x && head.y === powerUp.y) {
    applyPowerUp(powerUp.type);
    powerUp = null;
    scheduleNextPowerUp();
  }

  if (!grew) {
    snake.pop();
  }
}

function setDirection(x, y) {
  // Prevent reversing directly into the snake's own neck.
  if (direction.x === -x && direction.y === -y) return;
  nextDirection = { x, y };
}

function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function drawBackground() {
  ctx.fillStyle = "#14141c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }
}

function drawFood(now) {
  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;
  const pulse = Math.sin(now / 220) * 1.4;
  const radius = CELL / 2 - 3 + pulse;

  ctx.save();
  ctx.shadowColor = "rgba(248, 113, 113, 0.85)";
  ctx.shadowBlur = 14;

  const gradient = ctx.createRadialGradient(
    cx - radius / 3,
    cy - radius / 3,
    1,
    cx,
    cy,
    radius
  );
  gradient.addColorStop(0, "#fecaca");
  gradient.addColorStop(0.5, "#f87171");
  gradient.addColorStop(1, "#dc2626");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDiamondPath(cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function drawBoltIcon(cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.15, cy - s * 0.85);
  ctx.lineTo(cx - s * 0.35, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.05, cy + s * 0.05);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.85);
  ctx.lineTo(cx + s * 0.35, cy - s * 0.1);
  ctx.lineTo(cx + s * 0.05, cy - s * 0.1);
  ctx.closePath();
  ctx.fill();
}

function drawHourglassIcon(cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s * 0.8);
  ctx.lineTo(cx + s * 0.7, cy - s * 0.8);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy + s * 0.8);
  ctx.lineTo(cx + s * 0.7, cy + s * 0.8);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

function drawStarIcon(cx, cy, r) {
  const spikes = 5;
  const outerR = r;
  const innerR = r * 0.45;

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCompressIcon(cx, cy, s) {
  const gap = s * 0.15;

  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.4);
  ctx.lineTo(cx - gap, cy);
  ctx.lineTo(cx - s, cy + s * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + s, cy - s * 0.4);
  ctx.lineTo(cx + gap, cy);
  ctx.lineTo(cx + s, cy + s * 0.4);
  ctx.closePath();
  ctx.fill();
}

const POWER_UP_ICONS = {
  speed: drawBoltIcon,
  slow: drawHourglassIcon,
  double: drawStarIcon,
  shrink: drawCompressIcon,
};

function drawPowerUp(now) {
  if (!powerUp) return;

  const def = POWER_UP_DEFS[powerUp.type];
  const cx = powerUp.x * CELL + CELL / 2;
  const cy = powerUp.y * CELL + CELL / 2;
  const pulse = Math.sin(now / 180) * 1.2;
  const radius = CELL / 2 - 2 + pulse;

  ctx.save();
  ctx.shadowColor = def.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = def.color;
  drawDiamondPath(cx, cy, radius);
  ctx.fill();
  ctx.restore();

  const fraction = Math.max(0, powerUp.ttl / POWERUP_LIFETIME);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL / 2 + 3, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = "#0b0b12";
  POWER_UP_ICONS[powerUp.type](cx, cy, radius * 0.55);
  ctx.restore();
}

function drawSnake() {
  const len = snake.length;

  for (let i = len - 1; i >= 0; i--) {
    const segment = snake[i];
    const t = len > 1 ? i / (len - 1) : 0;
    const lightness = 52 - t * 20;
    const x = segment.x * CELL + 1.5;
    const y = segment.y * CELL + 1.5;
    const size = CELL - 3;

    ctx.save();
    if (i === 0) {
      ctx.shadowColor = "rgba(74, 222, 128, 0.65)";
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = `hsl(142, 65%, ${lightness}%)`;
    roundedRectPath(x, y, size, size, i === 0 ? 7 : 5);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    roundedRectPath(x, y, size, size, i === 0 ? 7 : 5);
    ctx.stroke();
  }

  drawHeadFace();
}

function drawHeadFace() {
  const head = snake[0];
  const cx = head.x * CELL + CELL / 2;
  const cy = head.y * CELL + CELL / 2;
  const perp = { x: -direction.y, y: direction.x };
  const forward = 3.5;
  const spread = 4.5;
  const eyeRadius = 2.6;
  const pupilRadius = 1.3;

  [1, -1].forEach((side) => {
    const ex = cx + direction.x * forward + perp.x * spread * side;
    const ey = cy + direction.y * forward + perp.y * spread * side;

    ctx.fillStyle = "#f4fff8";
    ctx.beginPath();
    ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0b0b12";
    ctx.beginPath();
    ctx.arc(ex + direction.x * 1, ey + direction.y * 1, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function draw(now) {
  drawBackground();
  drawFood(now || 0);
  drawPowerUp(now || 0);
  drawSnake();
}

function animate(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  const delta = Math.min(now - lastFrameTime, 250);
  lastFrameTime = now;

  if (running && !paused) {
    tickAccumulator += delta;
    const stepMs = currentStepMs();
    while (tickAccumulator >= stepMs) {
      tickAccumulator -= stepMs;
      tick();
      if (!running) break;
    }
    updatePowerUps(delta);
    renderEffectBadge();
  }

  draw(now);
  requestAnimationFrame(animate);
}

const KEY_MAP = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

window.addEventListener("keydown", (e) => {
  if (document.activeElement === nameInput) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (!running) {
      startGame();
    } else {
      togglePause();
    }
    return;
  }

  const move = KEY_MAP[e.key];
  if (move) {
    e.preventDefault();
    setDirection(move[0], move[1]);
  }
});

overlay.addEventListener("click", () => {
  if (!running) {
    startGame();
  } else {
    togglePause();
  }
});

nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  finishScoreEntry(nameInput.value);
});

skipNameBtn.addEventListener("click", () => {
  finishScoreEntry("Anonymous");
});

best = loadBest();
bestEl.textContent = String(best);
renderLeaderboard(loadLeaderboard(), -1);
lastFrameTime = null;
resetGame();
showOverlay("Press Space or tap to start");
requestAnimationFrame(animate);
