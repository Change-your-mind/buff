// main.js
import * as THREE from "three";
import { createShopBuilding } from "./buildings.js";

import {
  initWaveSystem,
  startWavesForNewGame,
  updateWaveTimerAndCheck,
  handleNextWaveClick,
  startCombatWaveFromSafe,
  getIsSafeWave,
  getIsWaveComplete,
  getWaveRemainingTimeSeconds,
} from "./waves.js";

import {
  initCombat,
  updateShooting,
  updateBullets,
  resetCombatState,
  getScatterBulletCount,
  upgradeScatter,
  handleMouseDown,
  handleMouseUp,
  handleMouseLeaveCanvas,
  upgradeRicochet,
  upgradeRocket,
  updateExplosions,
  clearBulletsForWaveChange,
  upgradeFireBullet,
  upgradePierce,
  upgradeFireRate,
} from "./combat.js";

import {
  initEnemies,
  updateEnemies,
  resetEnemies,
  handleBulletHit,
  clearEnemiesAndBullets,
  upgradeBleed,
  upgradeSlow,
  updateDamageTexts,
  upgradeSticky,
  upgradeGravity,
  upgradeFireTrail,
  getFireTrailTotalDurationMs,
} from "./enemies.js";

import {
  initCoins,
  updateCoins,
  resetCoins,
  collectAllCoinsImmediately,
  spawnCoinAtPosition,
  getCoinCount,
  setCoinCount,
  addCoins,
  setCoinTextureEnabled, // ✅ NEW
} from "./coins.js";

import {
  initShopSystem,
  isShopOpen,
  resetShop,
  handleShopInteractInSafeWave,
} from "./shopSystem.js";

// ===== Global texture toggle =====
window.USE_TEXTURES = true;

// ===== Textures =====
const texLoader = new THREE.TextureLoader();
const Textures = {
  ground: texLoader.load("./assets/textures/ground.png"),
  wall: texLoader.load("./assets/textures/wall.png"),
  face: texLoader.load("./assets/textures/face.jpg"),
};

Textures.ground.wrapS = Textures.ground.wrapT = THREE.RepeatWrapping;
Textures.ground.repeat.set(12, 12);

Textures.wall.wrapS = Textures.wall.wrapT = THREE.RepeatWrapping;
Textures.wall.repeat.set(4, 1);

// ===== Audio Manager (start on user gesture) =====
const AudioMgr = (() => {
  let bgm = null;
  let muted = false;
  let volume = 0.35;
  const sfx = new Map();

  function safeNewAudio(url) {
    try {
      return new Audio(url);
    } catch {
      return null;
    }
  }

  function initOnce() {
    if (bgm) return;

    bgm = safeNewAudio("./assets/audio/bgm.mp3");
    if (bgm) {
      bgm.loop = true;
      bgm.volume = volume;
    }

    const coin = safeNewAudio("./assets/audio/coin.mp3");
    if (coin) {
      coin.volume = Math.min(1, volume + 0.1);
      sfx.set("coin", coin);
    }
  }

  async function startBgm() {
    initOnce();
    if (!bgm || muted) return;
    try { await bgm.play(); } catch (e) {}
  }

  function stopBgm() {
    if (!bgm) return;
    bgm.pause();
    bgm.currentTime = 0;
  }

  function play(name) {
    if (muted) return;
    const a = sfx.get(name);
    if (!a) return;
    try {
      a.currentTime = 0;
      a.play();
    } catch (e) {}
  }

  function setMuted(m) {
    muted = !!m;
    if (bgm) {
      if (muted) bgm.pause();
      else bgm.play().catch(()=>{});
    }
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (bgm) bgm.volume = volume;
    for (const a of sfx.values()) a.volume = Math.min(1, volume + 0.15);
  }

  return { initOnce, startBgm, stopBgm, play, setMuted, setVolume, get muted(){return muted;} };
})();

window.__playSfx = (name) => AudioMgr.play(name);

// ======= 基础设置 =======
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// ======= 地图 & 碰撞参数 =======
const mapSize = 200;
const MAP_HALF_SIZE = mapSize / 2;

const ENEMY_COLLISION_RADIUS = 2.0;
const PLAYER_COLLISION_RADIUS = 1.5;

const WALL_THICKNESS = 4;
const WALL_HALF_THICKNESS = WALL_THICKNESS / 2;
const INNER_HALF_SIZE = MAP_HALF_SIZE - WALL_THICKNESS;

// ======= UI 相关 =======
const hpElement = document.getElementById("ui-hp");
const rollCDElement = document.getElementById("roll-cd");
const waveElement = document.getElementById("ui-wave");
const timeElement = document.getElementById("ui-time");
const coinElement = document.getElementById("ui-coin");

// Audio UI
const muteBtn = document.getElementById("btn-mute");
const volSlider = document.getElementById("slider-vol");

// Texture toggle UI
const textureBtn = document.getElementById("btn-toggle-texture");

// 作弊 UI 元素
const cheatCoinsInput = document.getElementById("cheat-coins");
const cheatCoinsApplyBtn = document.getElementById("cheat-coins-apply");
const cheatSpeedInput = document.getElementById("cheat-speed");
const cheatSpeedApplyBtn = document.getElementById("cheat-speed-apply");
const cheatHpInput = document.getElementById("cheat-hp");
const cheatHpApplyBtn = document.getElementById("cheat-hp-apply");
const cheatNextWaveBtn = document.getElementById("cheat-next-wave");

const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");

const gameOverOverlay = document.getElementById("game-over-overlay");
const restartBtn = document.getElementById("restart-btn");

const waveCompleteOverlay = document.getElementById("wave-complete-overlay");
const waveCompleteTitle = document.getElementById("wave-complete-title");
const nextWaveBtn = document.getElementById("next-wave-btn");

// 商店 UI
const shopOverlay = document.getElementById("shop-overlay");
const shopCloseBtn = document.getElementById("shop-close-btn");
const shopOpt1Btn = document.getElementById("shop-opt-1");
const shopOpt2Btn = document.getElementById("shop-opt-2");
const shopOpt3Btn = document.getElementById("shop-opt-3");
const shopRefreshBtn = document.getElementById("shop-refresh-btn");

// Audio handlers
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    AudioMgr.setMuted(!AudioMgr.muted);
    muteBtn.textContent = AudioMgr.muted ? "Unmute" : "Mute";
  });
}
if (volSlider) {
  volSlider.addEventListener("input", (e) => {
    AudioMgr.setVolume(parseFloat(e.target.value));
  });
}

// ======= 全局状态 =======
let isGameStarted = false;
let isGameOver = false;

// ======= 相机 =======
const CAMERA_RADIUS = 70;
const CAMERA_HEIGHT = 60;
const CAMERA_LOOK_AT_HEIGHT = 5;
let cameraAngle = Math.PI / 4;

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

function updateCamera() {
  const playerPos = player.position;
  const camX = playerPos.x + CAMERA_RADIUS * Math.cos(cameraAngle);
  const camZ = playerPos.z + CAMERA_RADIUS * Math.sin(cameraAngle);
  const camY = CAMERA_HEIGHT;

  camera.position.set(camX, camY, camZ);
  camera.lookAt(
    playerPos.x,
    playerPos.y + CAMERA_LOOK_AT_HEIGHT,
    playerPos.z
  );
}

// ======= 灯光 =======
{
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(50, 80, 30);
  scene.add(dir);
}

// ======= 地面（两套材质：贴图 / 纯色） =======
const groundMatTextured = new THREE.MeshPhongMaterial({ map: Textures.ground });
const groundMatPlain = new THREE.MeshPhongMaterial({ color: 0x3a7d2e });

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(mapSize, mapSize),
  groundMatTextured
);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

scene.add(new THREE.GridHelper(mapSize, 40));

// ======= 墙（两套材质：贴图 / 纯色） =======
const wallMatTextured = new THREE.MeshPhongMaterial({ map: Textures.wall });
const wallMatPlain = new THREE.MeshPhongMaterial({ color: 0x555555 });

const wallHeight = 8;

const wallLengthX = INNER_HALF_SIZE * 2;
const wallGeomX = new THREE.BoxGeometry(wallLengthX, wallHeight, WALL_THICKNESS);

const wallLengthZ = INNER_HALF_SIZE * 2;
const wallGeomZ = new THREE.BoxGeometry(WALL_THICKNESS, wallHeight, wallLengthZ);

const wallNorth = new THREE.Mesh(wallGeomX, wallMatTextured);
wallNorth.position.set(0, wallHeight / 2, INNER_HALF_SIZE + WALL_HALF_THICKNESS);
scene.add(wallNorth);

const wallSouth = new THREE.Mesh(wallGeomX, wallMatTextured);
wallSouth.position.set(0, wallHeight / 2, -INNER_HALF_SIZE - WALL_HALF_THICKNESS);
scene.add(wallSouth);

const wallEast = new THREE.Mesh(wallGeomZ, wallMatTextured);
wallEast.position.set(INNER_HALF_SIZE + WALL_HALF_THICKNESS, wallHeight / 2, 0);
scene.add(wallEast);

const wallWest = new THREE.Mesh(wallGeomZ, wallMatTextured);
wallWest.position.set(-INNER_HALF_SIZE - WALL_HALF_THICKNESS, wallHeight / 2, 0);
scene.add(wallWest);

// ======= 商店建筑（安全波次用） =======
const shopData = createShopBuilding(scene);
const shopGroup = shopData.group;
const shopRedTile = shopData.redTile;
const shopGreenTile = shopData.greenTile;
const shopCollider = shopData.collider || null;
shopGroup.visible = false;

// ======= 安全关卡：治疗小人 + 绿色地毯 =======
const HEAL_COST = 10;
const HEAL_RADIUS = 2.6;

const healerGroup = new THREE.Group();
healerGroup.visible = false;
scene.add(healerGroup);

{
  const matSkin = new THREE.MeshPhongMaterial({ color: 0xffffff });
  const matCloth = new THREE.MeshPhongMaterial({ color: 0xdddddd });
  const matPants = new THREE.MeshPhongMaterial({ color: 0x888888 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), matCloth);
  body.position.set(0, 1.2, 0);
  healerGroup.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), matSkin);
  head.position.set(0, 2.25, 0);
  healerGroup.add(head);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), matPants);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), matPants);
  legL.position.set(-0.25, 0.45, 0);
  legR.position.set(0.25, 0.45, 0);
  healerGroup.add(legL, legR);
}

const healCarpet = new THREE.Mesh(
  new THREE.BoxGeometry(4.8, 0.15, 3.6),
  new THREE.MeshPhongMaterial({ color: 0x33ff66, emissive: 0x003300, shininess: 60 })
);
healCarpet.position.set(0, 0.1, 0);
healerGroup.add(healCarpet);

healerGroup.position.set(0, 0, 15);
healerGroup.rotation.y = Math.PI;

function isPlayerOnHealCarpet() {
  if (!healerGroup.visible) return false;
  const carpetWorld = new THREE.Vector3();
  healCarpet.getWorldPosition(carpetWorld);

  const dx = player.position.x - carpetWorld.x;
  const dz = player.position.z - carpetWorld.z;
  return dx * dx + dz * dz <= HEAL_RADIUS * HEAL_RADIUS;
}

function tryHealToFull() {
  if (playerHP >= playerMaxHP) return;
  const coins = getCoinCount();
  if (coins < HEAL_COST) return;

  addCoins(-HEAL_COST);
  playerHP = playerMaxHP;
  updateHPDisplay();
}

// ======= 商店碰撞 =======
function resolveCircleAABB(pos, radius, boxCenter, halfX, halfZ) {
  const closestX = THREE.MathUtils.clamp(pos.x, boxCenter.x - halfX, boxCenter.x + halfX);
  const closestZ = THREE.MathUtils.clamp(pos.z, boxCenter.z - halfZ, boxCenter.z + halfZ);

  const dx = pos.x - closestX;
  const dz = pos.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return;

  const dist = Math.sqrt(Math.max(1e-8, distSq));
  const push = radius - dist;

  const nx = dist > 1e-6 ? dx / dist : 0;
  const nz = dist > 1e-6 ? dz / dist : 1;

  pos.x += nx * push;
  pos.z += nz * push;
}

function applyShopCollision() {
  if (!shopGroup?.visible) return;
  if (!shopCollider) return;

  const c = new THREE.Vector3();
  shopCollider.getWorldPosition(c);

  const halfX = shopCollider.userData?.halfX ?? 7.5;
  const halfZ = shopCollider.userData?.halfZ ?? 6.0;

  resolveCircleAABB(player.position, PLAYER_COLLISION_RADIUS, c, halfX, halfZ);
}

// ======= 玩家（方块人 + 脸片引用） =======
const player = new THREE.Group();
player.position.set(0, 1, 0);
scene.add(player);

let walkPhase = 0;
let limb = null;
let facePlaneRef = null; // ✅ for toggling

{
  const humanoid = createBlockHumanoid();
  player.add(humanoid.root);
  limb = humanoid.limbRefs;
  facePlaneRef = humanoid.facePlane;
}

function createBlockHumanoid() {
  const root = new THREE.Group();

  const matSkin = new THREE.MeshPhongMaterial({ color: 0xffffff });
  const matCloth = new THREE.MeshPhongMaterial({ color: 0xdddddd });
  const matPants = new THREE.MeshPhongMaterial({ color: 0x888888 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.0), matCloth);
  body.position.set(0, 1.5, 0);
  root.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), matSkin);
  head.position.set(0, 2.7, 0);
  root.add(head);

  // Face sticker (Option C)
  const faceMat = new THREE.MeshBasicMaterial({
    map: Textures.face,
    side: THREE.DoubleSide,
  });
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), faceMat);
  facePlane.position.set(0, 0, 0.61); // if reversed, change to -0.61
  head.add(facePlane);

  const armGeom = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const armL = new THREE.Mesh(armGeom, matSkin);
  const armR = new THREE.Mesh(armGeom, matSkin);

  const armPivotL = new THREE.Group();
  const armPivotR = new THREE.Group();
  armPivotL.position.set(-1.15, 2.15, 0);
  armPivotR.position.set(1.15, 2.15, 0);

  armL.position.set(0, -0.7, 0);
  armR.position.set(0, -0.7, 0);

  armPivotL.add(armL);
  armPivotR.add(armR);
  root.add(armPivotL, armPivotR);

  const legGeom = new THREE.BoxGeometry(0.6, 1.6, 0.6);
  const legL = new THREE.Mesh(legGeom, matPants);
  const legR = new THREE.Mesh(legGeom, matPants);

  const legPivotL = new THREE.Group();
  const legPivotR = new THREE.Group();
  legPivotL.position.set(-0.45, 0.9, 0);
  legPivotR.position.set(0.45, 0.9, 0);

  legL.position.set(0, -0.8, 0);
  legR.position.set(0, -0.8, 0);

  legPivotL.add(legL);
  legPivotR.add(legR);
  root.add(legPivotL, legPivotR);

  return {
    root,
    limbRefs: { armPivotL, armPivotR, legPivotL, legPivotR, body, head },
    facePlane, // ✅ expose for toggle
  };
}

// ======= 贴图开关应用函数（地面/墙/脸/金币） =======
function applyTextureToggle() {
  if (window.USE_TEXTURES) {
    plane.material = groundMatTextured;
    wallNorth.material = wallMatTextured;
    wallSouth.material = wallMatTextured;
    wallEast.material = wallMatTextured;
    wallWest.material = wallMatTextured;
    if (facePlaneRef) facePlaneRef.visible = true;
  } else {
    plane.material = groundMatPlain;
    wallNorth.material = wallMatPlain;
    wallSouth.material = wallMatPlain;
    wallEast.material = wallMatPlain;
    wallWest.material = wallMatPlain;
    if (facePlaneRef) facePlaneRef.visible = false;
  }

  // ✅ also convert coins already on the ground
  setCoinTextureEnabled(!!window.USE_TEXTURES);
}

if (textureBtn) {
  textureBtn.addEventListener("click", () => {
    window.USE_TEXTURES = !window.USE_TEXTURES;
    textureBtn.textContent = window.USE_TEXTURES ? "Textures: ON" : "Textures: OFF";
    applyTextureToggle();
  });
}

// ======= 玩家血量 / UI =======
let playerHP = 10;
let playerMaxHP = 10;

function updateHPDisplay() {
  if (playerHP < 0) playerHP = 0;
  if (playerHP > playerMaxHP) playerHP = playerMaxHP;
  hpElement.textContent = `HP: ${playerHP} / ${playerMaxHP}`;
}
updateHPDisplay();

// ======= 翻滚机制 & 移速 =======
const BASE_MOVE_SPEED = 0.6;
let currentMoveSpeed = BASE_MOVE_SPEED;
let moveSpeedCheatMultiplier = 1.0;

const ROLL_SPEED_MULTIPLIER = 2;
const ROLL_DURATION = 300;

const BASE_ROLL_COOLDOWN = 5000;
const MIN_ROLL_COOLDOWN = 1000;
let currentRollCooldown = BASE_ROLL_COOLDOWN;

let isRolling = false;
let rollEndTime = 0;
let lastRollTime = -Infinity;

function startRoll() {
  if (!isGameStarted || isGameOver || getIsWaveComplete() || isShopOpen()) return;
  const now = performance.now();
  if (now - lastRollTime < currentRollCooldown) return;
  if (isRolling && now < rollEndTime) return;

  isRolling = true;
  rollEndTime = now + ROLL_DURATION;
  lastRollTime = now;
}

function updateRollCDDisplay() {
  const now = performance.now();
  const elapsed = now - lastRollTime;
  if (elapsed >= currentRollCooldown) {
    rollCDElement.textContent = "Roll: Ready";
  } else {
    const remaining = Math.max(0, (currentRollCooldown - elapsed) / 1000);
    rollCDElement.textContent = `Roll CD: ${remaining.toFixed(1)}s`;
  }
}

function upgradeRollCooldownBuff() {
  currentRollCooldown = Math.max(MIN_ROLL_COOLDOWN, currentRollCooldown - 500);
}
function getCurrentRollCooldownMs() {
  return currentRollCooldown;
}

// ======= Game Over =======
function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  if (playerHP < 0) playerHP = 0;
  updateHPDisplay();
  AudioMgr.stopBgm();
  gameOverOverlay.style.display = "flex";
}

// ======= 重置公共状态 =======
function resetCommonState() {
  resetEnemies(scene);
  resetCombatState(scene);
  resetCoins(scene);

  player.position.set(0, 1, 0);
  player.rotation.set(0, 0, 0);

  cameraAngle = Math.PI / 4;

  playerMaxHP = 10;
  playerHP = 10;
  updateHPDisplay();

  currentMoveSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
  isRolling = false;
  rollEndTime = 0;
  lastRollTime = -Infinity;
  currentRollCooldown = BASE_ROLL_COOLDOWN;
  updateRollCDDisplay();

  window.projectileSpeedMultiplier = 1.0;
  window.baseDamageBonus = 0;


  if (typeof window.critChance !== "number") window.critChance = 0.1;
  else window.critChance = 0.1;

  resetShop();
  shopGroup.visible = false;

  setCoinCount(0);

  walkPhase = 0;
  updateWalkAnimation(false);

  // make sure current toggle is applied after reset
  applyTextureToggle();
}

// ======= Restart =======
function restartGame() {
  AudioMgr.initOnce();
  AudioMgr.startBgm();

  resetCommonState();

  const now = performance.now();
  startWavesForNewGame(now);
  isGameOver = false;
  isGameStarted = true;

  gameOverOverlay.style.display = "none";
  waveCompleteOverlay.style.display = "none";
  startOverlay.style.display = "none";
}
restartBtn.addEventListener("click", restartGame);

// ======= Start Game =======
function startGame() {
  if (isGameStarted) return;

  AudioMgr.initOnce();
  AudioMgr.startBgm();

  resetCommonState();

  const now = performance.now();
  startWavesForNewGame(now);

  isGameStarted = true;
  isGameOver = false;

  startOverlay.style.display = "none";
  gameOverOverlay.style.display = "none";
  waveCompleteOverlay.style.display = "none";
}
startBtn.addEventListener("click", startGame);

// ======= 键盘输入 =======
const keys = { KeyW:false, KeyA:false, KeyS:false, KeyD:false, KeyQ:false, KeyE:false };

window.addEventListener("keydown", (e) => {
  if (e.code in keys) keys[e.code] = true;

  if (e.code === "Space") startRoll();

  if (e.code === "KeyF") {
    if (getIsSafeWave()) {
      if (isPlayerOnHealCarpet()) tryHealToFull();
      else handleShopInteractInSafeWave(performance.now());
    }
  }

  if (e.code === "KeyN") devSkipWave();

  if (e.code === "KeyH") {
    const panel = document.getElementById("cheat-panel");
    if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code in keys) keys[e.code] = false;
});

// ======= 玩家移动 =======
function updatePlayerMovement() {
  if (isShopOpen()) {
    updateWalkAnimation(false);
    return;
  }

  const now = performance.now();
  if (isRolling && now >= rollEndTime) isRolling = false;

  const moveCamSpace = new THREE.Vector3();
  if (keys.KeyW) moveCamSpace.z -= 1;
  if (keys.KeyS) moveCamSpace.z += 1;
  if (keys.KeyA) moveCamSpace.x -= 1;
  if (keys.KeyD) moveCamSpace.x += 1;

  const baseSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
  const speed = isRolling ? baseSpeed * ROLL_SPEED_MULTIPLIER : currentMoveSpeed;

  const isMoving = moveCamSpace.lengthSq() > 0;

  if (isMoving) {
    moveCamSpace.normalize().multiplyScalar(speed);
    moveCamSpace.applyQuaternion(camera.quaternion);
    moveCamSpace.y = 0;
    if (moveCamSpace.lengthSq() > 0) moveCamSpace.normalize().multiplyScalar(speed);

    player.position.add(moveCamSpace);

    const half = INNER_HALF_SIZE - PLAYER_COLLISION_RADIUS;
    player.position.x = THREE.MathUtils.clamp(player.position.x, -half, half);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -half, half);

    applyShopCollision();
  }

  updateWalkAnimation(isMoving);

  const rotateSpeed = Math.PI / 4;
  if (keys.KeyQ) { cameraAngle += rotateSpeed; keys.KeyQ = false; }
  if (keys.KeyE) { cameraAngle -= rotateSpeed; keys.KeyE = false; }
}

// ======= 走路动画 =======
function updateWalkAnimation(isMoving) {
  if (!limb) return;

  if (!isMoving) {
    const k = 0.15;
    limb.armPivotL.rotation.x *= 1 - k;
    limb.armPivotR.rotation.x *= 1 - k;
    limb.legPivotL.rotation.x *= 1 - k;
    limb.legPivotR.rotation.x *= 1 - k;

    limb.body.position.y += (1.5 - limb.body.position.y) * 0.2;
    limb.head.position.y += (2.7 - limb.head.position.y) * 0.2;
    limb.body.rotation.z *= 1 - k;
    limb.head.rotation.z *= 1 - k;
    return;
  }

  walkPhase += 0.18;

  const swing = Math.sin(walkPhase) * 0.8;
  const bob = Math.cos(walkPhase) * 0.06;

  limb.armPivotL.rotation.x = swing;
  limb.armPivotR.rotation.x = -swing;
  limb.legPivotL.rotation.x = -swing;
  limb.legPivotR.rotation.x = swing;

  limb.body.position.y = 1.5 + bob;
  limb.head.position.y = 2.7 + bob * 0.6;

  limb.body.rotation.z = Math.sin(walkPhase) * 0.08;
  limb.head.rotation.z = Math.sin(walkPhase) * 0.05;
}

// ======= 鼠标瞄准 =======
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
let mouseWorld = new THREE.Vector3();
let hasMouse = false;

const crosshairGeom = new THREE.RingGeometry(1, 1.4, 32);
const crosshairMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
const crosshair = new THREE.Mesh(crosshairGeom, crosshairMat);
crosshair.rotation.x = -Math.PI / 2;
crosshair.visible = false;
scene.add(crosshair);

const lineGeom = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0),
]);
const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
const aimLine = new THREE.Line(lineGeom, lineMat);
aimLine.frustumCulled = false;
scene.add(aimLine);

window.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  hasMouse = true;
});

function updateAim() {
  if (!hasMouse) return;

  raycaster.setFromCamera(mouseNDC, camera);

  const origin = raycaster.ray.origin.clone();
  const dir = raycaster.ray.direction.clone();
  const t = (0 - origin.y) / dir.y;
  if (t <= 0) {
    crosshair.visible = false;
    return;
  }

  mouseWorld = origin.add(dir.multiplyScalar(t));
  crosshair.position.set(mouseWorld.x, 0.01, mouseWorld.z);
  crosshair.visible = true;

  const dx = mouseWorld.x - player.position.x;
  const dz = mouseWorld.z - player.position.z;
  const angle = Math.atan2(dx, dz);
  player.rotation.y = angle;

  const points = [
    new THREE.Vector3(player.position.x, player.position.y + 1, player.position.z),
    new THREE.Vector3(mouseWorld.x, player.position.y + 1, mouseWorld.z),
  ];
  aimLine.geometry.setFromPoints(points);
}

// ======= 鼠标事件交给 combat 模块 =======
window.addEventListener("mousedown", (e) => handleMouseDown(e.button));
window.addEventListener("mouseup", (e) => handleMouseUp(e.button));
canvas.addEventListener("mouseleave", () => handleMouseLeaveCanvas());

// ======= 开发者模式：N 键快进 =======
function devSkipWave() {
  if (!isGameStarted || isGameOver) return;

  addCoins(3000);
  const now = performance.now();

  if (getIsSafeWave()) startCombatWaveFromSafe(now);
  else handleNextWaveClick(now);
}

// ======= 自适应 =======
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

// ======= 金币模块初始化 =======
initCoins(scene, player, coinElement);

// ======= 敌人模块初始化 =======
initEnemies(scene, player, camera, {
  innerHalfSize: INNER_HALF_SIZE,
  enemyCollisionRadius: ENEMY_COLLISION_RADIUS,
  playerCollisionRadius: PLAYER_COLLISION_RADIUS,
});

// ======= 商店系统初始化 =======
initShopSystem({
  shopOverlay,
  shopCloseBtn,
  shopOptButtons: [shopOpt1Btn, shopOpt2Btn, shopOpt3Btn],
  shopRefreshBtn,
  shopGroup,
  shopRedTile,
  shopGreenTile,
  player,
  scene,

  getCoinCount,
  addCoins,
  getHP: () => playerHP,
  addHP: (amount) => {
    playerHP += amount;
    updateHPDisplay();
  },
  increaseMaxHP: (delta, cap) => {
    const maxCap = typeof cap === "number" ? cap : Infinity;
    playerMaxHP = Math.min(maxCap, playerMaxHP + delta);
    if (playerHP > playerMaxHP) playerHP = playerMaxHP;
    updateHPDisplay();
  },

  getScatterBulletCount,
  upgradeScatter,

  upgradeRicochet,
  upgradeRocket,
  upgradeSticky,
  upgradeBleed,
  upgradeSlow,
  upgradeGravity,
  upgradeFireTrail,
  upgradeFireBullet,
  upgradePierce,

  getMaxHP: () => playerMaxHP,
  getFireTrailDurationMs: () => getFireTrailTotalDurationMs(),

  getRollCooldownMs: () => getCurrentRollCooldownMs(),
  upgradeRollCooldown: () => upgradeRollCooldownBuff(),

  upgradeProjectileSpeed: () => upgradeProjectileSpeed(),
  upgradeCritChance: () => upgradeCritChance(),
  upgradeFireRate: () => upgradeFireRate(),

  onRequestNextWaveFromSafe: (now) => startCombatWaveFromSafe(now),
});

// 放在全局，方便 combat.js 通过 window 读取
window.projectileSpeedMultiplier = 1.0;

function upgradeProjectileSpeed() {
  if (window.projectileSpeedMultiplier === 1.0) {
    window.projectileSpeedMultiplier += 0.1;
  } else {
    window.projectileSpeedMultiplier += 0.05;
  }
}

if (typeof window.critChance !== "number") {
  window.critChance = 0.1;
}

function upgradeCritChance() {
  const current = typeof window.critChance === "number" ? window.critChance : 0.1;
  const next = Math.min(1.0, current + 0.1);
  window.critChance = next;
}

// ======= 战斗模块初始化 =======
initCombat({
  scene,
  player,
  camera,
  raycaster,
  mouseNDC,
  hasMouseGetter: () => hasMouse,
  getGameState: () => ({
    isGameStarted,
    isGameOver,
    isWaveComplete: getIsWaveComplete(),
    isShopOpen: isShopOpen(),
  }),
  onBulletHitEnemy: (
    bulletPos,
    now,
    bulletHitRadius,
    bulletDamage,
    explosionRadius,
    splashFactor
  ) => {
    const hitResult = handleBulletHit(
      bulletPos,
      now,
      bulletHitRadius,
      bulletDamage,
      explosionRadius,
      splashFactor
    );

    if (hitResult && hitResult.killPositions) {
      for (const pos of hitResult.killPositions) {
        spawnCoinAtPosition(pos);
      }
    }

    return hitResult;
  },
  innerHalfSize: INNER_HALF_SIZE,
});

initWaveSystem({
  waveElement,
  timeElement,
  waveCompleteOverlay,
  waveCompleteTitle,
  onCollectAllCoinsAtWaveEnd: collectAllCoinsImmediately,

  onClearEnemiesAndBullets: () => {
    clearEnemiesAndBullets(scene);
    clearBulletsForWaveChange(scene);
  },

  onEnterSafeWaveScene: () => {
    clearEnemiesAndBullets(scene);
    clearBulletsForWaveChange(scene);
    shopGroup.visible = true;
    healerGroup.visible = true;
    updateWalkAnimation(false);
  },

  onExitSafeWaveScene: () => {
    shopGroup.visible = false;
    healerGroup.visible = false;
    resetShop();
  },
});

// “下一波”按钮事件
nextWaveBtn.addEventListener("click", () => {
  const now = performance.now();
  handleNextWaveClick(now);
});

// ======= 作弊菜单逻辑 =======
if (cheatCoinsApplyBtn) {
  cheatCoinsApplyBtn.addEventListener("click", () => {
    if (!cheatCoinsInput) return;
    const v = parseInt(cheatCoinsInput.value, 10);
    if (!Number.isNaN(v)) {
      setCoinCount(v);
    }
  });
}

if (cheatSpeedApplyBtn) {
  cheatSpeedApplyBtn.addEventListener("click", () => {
    if (!cheatSpeedInput) return;
    const v = parseFloat(cheatSpeedInput.value);
    if (!Number.isNaN(v) && v > 0) {
      moveSpeedCheatMultiplier = v;
      currentMoveSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
    }
  });
}

if (cheatHpApplyBtn) {
  cheatHpApplyBtn.addEventListener("click", () => {
    if (!cheatHpInput) return;
    const v = parseInt(cheatHpInput.value, 10);
    if (!Number.isNaN(v)) {
      playerHP = Math.max(0, Math.min(playerMaxHP, v));
      updateHPDisplay();
    }
  });
}

if (cheatNextWaveBtn) {
  cheatNextWaveBtn.addEventListener("click", () => {
    if (!isGameStarted || isGameOver) return;
    const now = performance.now();

    if (getIsSafeWave()) {
      startCombatWaveFromSafe(now);
    } else {
      handleNextWaveClick(now);
    }
  });
}

// Apply initial toggle state once everything exists
applyTextureToggle();

// ======= 主循环 =======
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();

  if (isGameStarted && !isGameOver && !getIsWaveComplete()) {
    updateCamera();
    updatePlayerMovement();
    updateAim();

    updateShooting(now);
    updateBullets(now);
    updateExplosions(now);

    const enemyUpdateResult = updateEnemies(now, {
      isGameOver,
      isWaveComplete: getIsWaveComplete(),
      isSafeWave: getIsSafeWave(),
      isRolling,
      onPlayerDamaged: () => {
        if (playerHP > 0) {
          playerHP -= 1;
          updateHPDisplay();
          if (playerHP <= 0) {
            triggerGameOver();
          }
        }
      },
    });

    if (!isGameOver) {
      if (isRolling) {
        currentMoveSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
      } else if (
        !getIsWaveComplete() &&
        enemyUpdateResult.playerShouldBeSlowed &&
        !getIsSafeWave()
      ) {
        currentMoveSpeed = BASE_MOVE_SPEED * 0.6 * moveSpeedCheatMultiplier;
      } else {
        currentMoveSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
      }
    }

    const isLastSecond =
      isGameStarted &&
      !isGameOver &&
      !getIsWaveComplete() &&
      !getIsSafeWave() &&
      getWaveRemainingTimeSeconds() <= 1.0;

    updateCoins(isLastSecond);
  } else {
    updateCamera();
    updateWalkAnimation(false);
  }

  updateDamageTexts(now);
  updateRollCDDisplay();
  updateWaveTimerAndCheck({
    now,
    isGameStarted,
    isGameOver,
  });

  renderer.render(scene, camera);
}

animate();
