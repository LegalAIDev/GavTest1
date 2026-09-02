const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlay-text");

const CELL = 20;
const COLS = canvas.width / CELL;
const ROWS = canvas.height / CELL;
const STEP_MS = 110;

let snake, direction, nextDirection, food, score, best, running, paused, loopId;

function loadBest() {
  const stored = Number(localStorage.getItem("snake-best"));
  return Number.isFinite(stored) ? stored : 0;
}

function saveBest(value) {
  try {
    localStorage.setItem("snake-best", String(value));
  } catch (e) {
    /* storage unavailable, ignore */
  }
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
  draw();
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.hidden = false;
}

function hideOverlay() {
  overlay.hidden = true;
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
  showOverlay(`Game over — score ${score}. Press Space or tap to restart`);
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
    draw();
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

  draw();
}

function draw() {
  ctx.fillStyle = "#16161f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#f87171";
  ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);

  snake.forEach((segment, i) => {
    ctx.fillStyle = i === 0 ? "#4ade80" : "#22c55e";
    ctx.fillRect(segment.x * CELL + 1, segment.y * CELL + 1, CELL - 2, CELL - 2);
  });
}

function setDirection(x, y) {
  // Prevent reversing directly into the snake's own neck.
  if (direction.x === -x && direction.y === -y) return;
  nextDirection = { x, y };
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

best = loadBest();
bestEl.textContent = String(best);
resetGame();
showOverlay("Press Space or tap to start");
