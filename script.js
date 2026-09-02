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

const CELL = 20;
const COLS = canvas.width / CELL;
const ROWS = canvas.height / CELL;
const STEP_MS = 180;
const LEADERBOARD_KEY = "snake-leaderboard";
const MAX_LEADERBOARD_ENTRIES = 5;

let snake, direction, nextDirection, food, score, best, running, paused, loopId, pendingScore;

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

function placeFood() {
  let cell;
  do {
    cell = randomCell();
  } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
  food = cell;
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
  placeFood();
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
  clearInterval(loopId);
  loopId = setInterval(tick, STEP_MS);
}

function endGame() {
  running = false;
  clearInterval(loopId);
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
  if (paused) return;
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

  if (head.x === food.x && head.y === food.y) {
    score += 10;
    scoreEl.textContent = String(score);
    placeFood();
  } else {
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
  drawSnake();
}

function animate(now) {
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
resetGame();
showOverlay("Press Space or tap to start");
requestAnimationFrame(animate);
