
"use strict";

// Canvas and context
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

let currMapID = 0;

// Game state variables
let currentMap = null;
let lives = 0;
let cash = 0;
let waveNumber = 0;
let enemies = [];
let turrets = [];
let gamePaused = false;
let gameOver = false;
let fastForward = false;
let placingTurretType = null;
let selectedTurret = null;

/** Audio Setup **/
const themeAudio = new Audio("assets/theme.mp3");
themeAudio.loop = true;
const gameoverAudio = new Audio("assets/gameover.mp3");
// Prepare multiple instances for overlapping shoot sounds
const shootAudios = [];
for (let i = 0; i < 10; i++) {
  shootAudios[i] = new Audio("assets/shoot.mp3");
}
let shootIndex = 0;
function playShootSound() {
  shootAudios[shootIndex].currentTime = 0;
  shootAudios[shootIndex].play();
  shootIndex = (shootIndex + 1) % shootAudios.length;
}
// Start theme music (looping) on main menu, with autoplay fallback
themeAudio.play().catch((e) => {
  console.log("Theme music autoplay might be blocked - will play on first user interaction");
});
document.body.addEventListener("click", function startThemeOnFirstClick() {
  if (themeAudio.paused) {
    themeAudio.play();
  }
  document.body.removeEventListener("click", startThemeOnFirstClick);
}, { once: true });

// Constants / initial settings
const initialLives = 10;
const initialCash = 100;
const enemyBaseHealth = 20;
const enemyBaseSpeed = 1.25;
const enemyHealthGrowth = 1.2;
const enemySpeedGrowth = 1.05;
const waveEnemyCount = 10;
const spawnInterval = 60;

// Turret types
const TURRET_TYPES = {
  laser: {
    name: "Laser Turret",
    cost: 50,
    range: 100,
    damage: 5,
    fireInterval: 15,
    upgradeMultiplier: 1.05,
  },
  cannon: {
    name: "Cannon Turret",
    cost: 100,
    range: 120,
    damage: 20,
    fireInterval: 60,
    upgradeMultiplier: 1.15,
  },
};

// Maps
const maps = [
  {
    name: "Map 1",
    background: "assets/space.jpg",
    path: [
      { x: 0, y: 250 },
      { x: 800, y: 250 },
    ],
  },
  {
    name: "Map 2",
    background: "assets/space.jpg",
    path: [
      { x: 0, y: 100 },
      { x: 600, y: 100 },
      { x: 600, y: 400 },
      { x: 800, y: 400 },
    ],
  },
];

// Enemy constructor
function Enemy(x, y, health, speed) {
  this.x = x;
  this.y = y;
  this.health = health;
  this.speed = speed;
  this.waypointIndex = 1;
}

// Turret constructor
function Turret(x, y, typeKey) {
  const type = TURRET_TYPES[typeKey];
  this.type = typeKey;
  this.name = type.name;
  this.x = x;
  this.y = y;
  this.range = type.range;
  this.damage = type.damage;
  this.fireInterval = type.fireInterval;
  this.cooldown = 0;
  this.upgradeMultiplier = type.upgradeMultiplier;
  this.cost = type.cost;
}

function previewGame(mapIndex) {
  currentMap = maps[mapIndex];
  currMapID = mapIndex;
  const context = document.getElementById("preview-canvas").getContext("2d");
  if (currentMap.backgroundImage)
    context.drawImage(
      currentMap.backgroundImage,
      0, 0,
      canvas.width, canvas.height
    );
  else {
    context.fillStyle = "#004";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.strokeStyle = "#00F";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(currentMap.path[0].x, currentMap.path[0].y);
  currentMap.path.slice(1).forEach((p) => context.lineTo(p.x, p.y));
  context.stroke();
}

// Reset and start game
function startGame(mapIndex) {
  // Hide other screens, show game screen
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("instructions").style.display = "none";
  document.getElementById("map-select").style.display = "none";
  document.getElementById("game-screen").style.display = "flex";

  currentMap = maps[mapIndex];
  lives = initialLives;
  cash = initialCash;
  enemies = [];
  turrets = [];
  gamePaused = false;
  gameOver = false;
  selectedTurret = null;
  placingTurretType = null;
  fastForward = false;
  // Resume theme music if paused 
  themeAudio.play();

  updateHUD();
  document.getElementById("game-over").style.display = "none";
  requestAnimationFrame(gameLoop);
}

let waveInProgress = false;

// Spawn wave
function spawnWave(wave) {
  waveInProgress = true;
  const health = enemyBaseHealth * Math.pow(enemyHealthGrowth, wave - 1);
  const speed = enemyBaseSpeed * Math.pow(enemySpeedGrowth, wave - 1);
  const spawnPoint = currentMap.path[0];
  for (let i = 0; i < waveEnemyCount; i++) {
    setTimeout(() => {
      if (!gameOver) {
        enemies.push(new Enemy(spawnPoint.x, spawnPoint.y, health, speed));
      }
      if (i === waveEnemyCount - 1) {
        waveInProgress = false;
      }
    }, i * spawnInterval * (1000 / 60));
  }
}

// Update HUD
function updateHUD() {
  document.getElementById("hud-lives").textContent = `Lives: ${lives}`;
  document.getElementById("hud-cash").textContent = `Cash: $${Math.round(cash)}`;
  document.getElementById("hud-wave").textContent = `Wave: ${waveNumber}`;
}

// Game loop
function gameLoop() {
  if (gamePaused || gameOver) return;
  let steps = fastForward ? 2 : 1;
  for (let s = 0; s < steps; s++) updateGame();
  renderGame();
  requestAnimationFrame(gameLoop);
}

// Update tick
function updateGame() {
  const pathArr = currentMap.path;
  // Move enemies along the path
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const target = pathArr[e.waypointIndex];
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < e.speed) {
      // Enemy reached the current waypoint
      e.x = target.x;
      e.y = target.y;
      e.waypointIndex++;
      if (e.waypointIndex >= pathArr.length) {
        // Enemy reached end of path – remove it and decrement life
        enemies.splice(i, 1);
        lives--;
        updateHUD();
        if (lives <= 0) {
          gameOver = true;
          showGameOver();
        }
      }
    } else {
      // Move enemy towards next waypoint
      e.x += e.speed * (dx / dist);
      e.y += e.speed * (dy / dist);
    }
  }
  // Remove defeated enemies and add cash
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].health <= 0) {
      enemies.splice(i, 1);
      cash += 10;
      updateHUD();
    }
  }
  // Turrets attack
  turrets.forEach((t) => {
    if (t.cooldown > 0) {
      t.cooldown--;
    }
    if (t.cooldown <= 0) {
      let target = null;
      for (let e of enemies) {
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        if (dx * dx + dy * dy <= t.range * t.range) {
          target = e;
          break;
        }
      }
      if (target) {
        // Fire at target
        target.health -= t.damage;
        t.cooldown = t.fireInterval;
        playShootSound();
      }
    }
  });
}

// Render game state to canvas
function renderGame() {
  // Draw background
  if (currentMap.backgroundImage) {
    ctx.drawImage(currentMap.backgroundImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#004";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  // Draw path
  ctx.strokeStyle = "#00F";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(currentMap.path[0].x, currentMap.path[0].y);
  currentMap.path.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();
  // Draw enemies
  ctx.fillStyle = "cyan";
  enemies.forEach((e) => {
    ctx.fillRect(e.x - 10, e.y - 10, 20, 20);
  });
  // Draw turrets
  turrets.forEach((t) => {
    if (t.name === "Laser Turret") ctx.fillStyle = "lightgreen";
    if (t.name === "Cannon Turret") ctx.fillStyle = "darkgreen";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8, 0, 2 * Math.PI);
    ctx.fill();
  });
  // Draw firing lines (laser/beams) for effect
  ctx.strokeStyle = "#FF0";
  ctx.lineWidth = 2;
  turrets.forEach((t) => {
    if (t.cooldown === t.fireInterval) {
      // Just fired this tick, draw a line towards its target
      for (let e of enemies) {
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        if (dx * dx + dy * dy <= t.range * t.range) {
          ctx.beginPath();
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
          break;
        }
      }
    }
  });
  // Draw range circle if a turret is selected
  if (selectedTurret) {
    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(selectedTurret.x, selectedTurret.y, selectedTurret.range, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

function upgradeSelectedTurret(type) {
  if (!selectedTurret) return;
  if (cash >= selectedTurret.cost) {
    cash -= selectedTurret.cost;
    let mult = selectedTurret.upgradeMultiplier;
    selectedTurret.cost *= mult;
    document.getElementById("lbl-cost").innerHTML = "Next Upgrade: $" + selectedTurret.cost;
    if (type === "R") selectedTurret.range *= mult;
    else if (type === "D") selectedTurret.damage *= mult;
    else selectedTurret.fireInterval /= mult;
  } else {
    alert("Not enough cash!");
  }
}

// Game over handler
function showGameOver() {
  document.getElementById("game-over").style.display = "flex";
  themeAudio.pause();
  gameoverAudio.currentTime = 0;
  gameoverAudio.play();
}

// UI event handlers
document.getElementById("btn-play").onclick = () => {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("map-select").style.display = "flex";
  previewGame(0);
};
document.getElementById("btn-instructions").onclick = () => {
  document.getElementById("main-menu").style.display = "none";
  document.getElementById("instructions").style.display = "flex";
};
document.getElementById("btn-exit").onclick = () => window.close();
document.getElementById("btn-back-menu").onclick = () => {
  document.getElementById("instructions").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
};
document.getElementById("btn-back-menu2").onclick = () => {
  document.getElementById("map-select").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
};
document.getElementById("map-1").onclick = () => previewGame(0);
document.getElementById("map-2").onclick = () => previewGame(1);
document.getElementById("btn-play2").onclick = () => startGame(currMapID);
document.getElementById("build-turret1").onclick = () => {
  placingTurretType = "laser";
  document.body.classList.add("build-mode");
};
document.getElementById("build-turret2").onclick = () => {
  placingTurretType = "cannon";
  document.body.classList.add("build-mode");
};
document.getElementById("upgrade-range").onclick = () => {
  if (selectedTurret) upgradeSelectedTurret("R");
};
document.getElementById("upgrade-damage").onclick = () => {
  if (selectedTurret) upgradeSelectedTurret("D");
};
document.getElementById("upgrade-firespeed").onclick = () => {
  if (selectedTurret) upgradeSelectedTurret("F");
};
document.getElementById("btn-play-in").onclick = () => {
  if (!waveInProgress) {
    waveNumber++;
    spawnWave(waveNumber);
  }
};
document.getElementById("btn-fast").onclick = () => {
  fastForward = !fastForward;
};
document.getElementById("btn-pause").onclick = () => {
  gamePaused = !gamePaused;
  if (gamePaused) {
    themeAudio.pause();
  } else {
    themeAudio.play();
    requestAnimationFrame(gameLoop);
  }
};
document.getElementById("btn-reset").onclick = () => {
  if (currentMap !== null) {
    startGame(maps.indexOf(currentMap));
  }
};
document.getElementById("btn-reset-gameover").onclick = () => {
  gameoverAudio.pause();
  gameoverAudio.currentTime = 0;
  document.getElementById("game-over").style.display = "none";
  if (currentMap !== null) {
    startGame(maps.indexOf(currentMap));
  }
};
document.getElementById("btn-main-menu").onclick = () => {
  gameoverAudio.pause();
  gameoverAudio.currentTime = 0;
  document.getElementById("game-screen").style.display = "none";
  document.getElementById("game-over").style.display = "none";
  document.getElementById("main-menu").style.display = "flex";
  themeAudio.play();
};
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (placingTurretType) {
    const type = TURRET_TYPES[placingTurretType];
    if (!type) return;
    if (cash >= type.cost) {
      turrets.push(new Turret(x, y, placingTurretType));
      cash -= type.cost;
      updateHUD();
    } else {
      alert("Not enough cash!");
    }
    placingTurretType = null;
    document.body.classList.remove("build-mode");
  } else {
    // No build mode: check for turret selection
    let found = false;
    for (let t of turrets) {
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy <= 8 * 8) {  // 8px radius
        selectedTurret = t;
        document.getElementById("upgrade-range").style.display = "block";
        document.getElementById("upgrade-damage").style.display = "block";
        document.getElementById("upgrade-firespeed").style.display = "block";
        document.getElementById("lbl-cost").innerHTML = "Next Upgrade: $" + t.cost;
        found = true;
        break;
      }
    }
    if (!found) {
      document.getElementById("upgrade-range").style.display = "none";
      document.getElementById("upgrade-damage").style.display = "none";
      document.getElementById("upgrade-firespeed").style.display = "none";
      document.getElementById("lbl-cost").innerHTML = "";
      selectedTurret = null;  // deselect
    }
  }
});

// key controls which we can implement in the future
document.addEventListener("keydown", (e) => {
  /* shortcuts can be implemented if needed */
});

// Preload map background images
maps.forEach((map) => {
  if (map.background) {
    const img = new Image();
    img.src = map.background;
    map.backgroundImage = img;
  }
});
