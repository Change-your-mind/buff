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
  clearBulletsForWaveChange, // ⭐ 新增：只清子弹，不清 BUFF
  upgradeFireBullet, // 🔥 新增
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
  upgradeGravity, // ✅ 新增
  upgradeFireTrail, // 🔥 新增
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
} from "./coins.js";

import {
  initShopSystem,
  isShopOpen,
  resetShop,
  handleShopInteractInSafeWave,
} from "./shopSystem.js";

// ======= 基础设置 =======
// 白色主角：这里没变，玩家 mesh 材质里是白色
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
const INNER_HALF_SIZE = MAP_HALF_SIZE - WALL_THICKNESS; // 玩家/敌人中心最大坐标

// ======= UI 相关 =======
const hpElement = document.getElementById("ui-hp");
const rollCDElement = document.getElementById("roll-cd");
const waveElement = document.getElementById("ui-wave");
const timeElement = document.getElementById("ui-time");
const coinElement = document.getElementById("ui-coin");

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

// ======= 全局状态 =======
let isGameStarted = false;
let isGameOver = false;

// ======= 相机：斜俯视角，可旋转 =======
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

// ======= 地面 & 网格 =======
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(mapSize, mapSize),
  new THREE.MeshPhongMaterial({ color: 0x3a7d2e })
);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

scene.add(new THREE.GridHelper(mapSize, 40));

// ======= 内边界墙 =======
const wallHeight = 8;
const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x555555 });

const wallLengthX = INNER_HALF_SIZE * 2;
const wallGeomX = new THREE.BoxGeometry(
  wallLengthX,
  wallHeight,
  WALL_THICKNESS
);

const wallLengthZ = INNER_HALF_SIZE * 2;
const wallGeomZ = new THREE.BoxGeometry(
  WALL_THICKNESS,
  wallHeight,
  wallLengthZ
);

// 北面（+Z）
const wallNorth = new THREE.Mesh(wallGeomX, wallMaterial);
wallNorth.position.set(
  0,
  wallHeight / 2,
  INNER_HALF_SIZE + WALL_HALF_THICKNESS
);
scene.add(wallNorth);

// 南面（-Z）
const wallSouth = new THREE.Mesh(wallGeomX, wallMaterial);
wallSouth.position.set(
  0,
  wallHeight / 2,
  -INNER_HALF_SIZE - WALL_HALF_THICKNESS
);
scene.add(wallSouth);

// 东面（+X）
const wallEast = new THREE.Mesh(wallGeomZ, wallMaterial);
wallEast.position.set(
  INNER_HALF_SIZE + WALL_HALF_THICKNESS,
  wallHeight / 2,
  0
);
scene.add(wallEast);

// 西面（-X）
const wallWest = new THREE.Mesh(wallGeomZ, wallMaterial);
wallWest.position.set(
  -INNER_HALF_SIZE - WALL_HALF_THICKNESS,
  wallHeight / 2,
  0
);
scene.add(wallWest);

// ======= 商店建筑（安全波次用） =======
const shopData = createShopBuilding(scene);
const shopGroup = shopData.group;
const shopRedTile = shopData.redTile;
const shopGreenTile = shopData.greenTile;
const shopCollider = shopData.collider || null; // ✅ 商店碰撞体（buildings.js 里返回）
shopGroup.visible = false;

// ======= 安全关卡：治疗小人 + 绿色地毯（按 F 花费 10 货币回满血） =======
const HEAL_COST = 10;
const HEAL_RADIUS = 2.6; // 玩家站在地毯附近即可触发

const healerGroup = new THREE.Group();
healerGroup.visible = false;
scene.add(healerGroup);

// 小人（简单方块人）
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

// 绿色地毯（治疗区）
const healCarpet = new THREE.Mesh(
  new THREE.BoxGeometry(4.8, 0.15, 3.6),
  new THREE.MeshPhongMaterial({ color: 0x33ff66, emissive: 0x003300, shininess: 60 })
);
healCarpet.position.set(0, 0.1, 0);
healerGroup.add(healCarpet);

// 把治疗小人放在商店前面一点（安全波次才显示）
healerGroup.position.set(0, 0, 15); // 你想换位置就改这里
healerGroup.rotation.y = Math.PI;   // 面向玩家来的方向

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
  if (coins < HEAL_COST) {
    console.log(`[HEAL] not enough coins: need ${HEAL_COST}, have ${coins}`);
    return;
  }

  // 扣钱并回满血
  addCoins(-HEAL_COST);
  playerHP = playerMaxHP;
  updateHPDisplay();
  console.log(`[HEAL] healed to full for ${HEAL_COST} coins`);
}

// ======= 商店碰撞（玩家圆形 vs 商店 AABB） =======
function resolveCircleAABB(pos, radius, boxCenter, halfX, halfZ) {
  // 最近点（AABB 上距圆心最近的点）
  const closestX = THREE.MathUtils.clamp(pos.x, boxCenter.x - halfX, boxCenter.x + halfX);
  const closestZ = THREE.MathUtils.clamp(pos.z, boxCenter.z - halfZ, boxCenter.z + halfZ);

  const dx = pos.x - closestX;
  const dz = pos.z - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) return; // 没碰到

  const dist = Math.sqrt(Math.max(1e-8, distSq));
  const push = radius - dist;

  // dist 很小时给一个默认方向
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


// ======= 玩家（方块小人模型 + 走路动画） =======
const player = new THREE.Group();
player.position.set(0, 1, 0);
scene.add(player);

// 走路动画状态
let walkPhase = 0;

// 四肢引用（用于走路摆动）
let limb = null;

// 创建“方块小人”
{
  const humanoid = createBlockHumanoid();
  player.add(humanoid.root);
  limb = humanoid.limbRefs;
}

// --- 方块小人构造函数：头/身/手/腿全用 BoxGeometry 拼 ---
function createBlockHumanoid() {
  const root = new THREE.Group();

  const matSkin = new THREE.MeshPhongMaterial({ color: 0xffffff });
  const matCloth = new THREE.MeshPhongMaterial({ color: 0xdddddd });
  const matPants = new THREE.MeshPhongMaterial({ color: 0x888888 });

  // 身体
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 1.0), matCloth);
  body.position.set(0, 1.5, 0);
  root.add(body);

  // 头
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), matSkin);
  head.position.set(0, 2.7, 0);
  root.add(head);

  // 手臂：用 pivot 让它绕肩膀摆动
  const armGeom = new THREE.BoxGeometry(0.5, 1.4, 0.5);
  const armL = new THREE.Mesh(armGeom, matSkin);
  const armR = new THREE.Mesh(armGeom, matSkin);

  const armPivotL = new THREE.Group();
  const armPivotR = new THREE.Group();
  armPivotL.position.set(-1.15, 2.15, 0); // 左肩
  armPivotR.position.set(1.15, 2.15, 0); // 右肩

  // 把手臂中心移到 pivot 下方（pivot 在肩）
  armL.position.set(0, -0.7, 0);
  armR.position.set(0, -0.7, 0);

  armPivotL.add(armL);
  armPivotR.add(armR);
  root.add(armPivotL);
  root.add(armPivotR);

  // 腿：用 pivot 让它绕胯部摆动
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
  root.add(legPivotL);
  root.add(legPivotR);

  return {
    root,
    limbRefs: { armPivotL, armPivotR, legPivotL, legPivotR, body, head },
  };
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

// ⭐ 作弊用移动速度倍率（1.0 = 默认）
let moveSpeedCheatMultiplier = 1.0;

const ROLL_SPEED_MULTIPLIER = 2;
const ROLL_DURATION = 300; // ms

// ⭐ 翻滚 CD 支持被 BUFF 修改
const BASE_ROLL_COOLDOWN = 5000; // ms，基础冷却 5 秒
const MIN_ROLL_COOLDOWN = 1000; // ms，最小冷却 1 秒
let currentRollCooldown = BASE_ROLL_COOLDOWN;

let isRolling = false;
let rollEndTime = 0;
let lastRollTime = -Infinity;

function startRoll() {
  if (!isGameStarted || isGameOver || getIsWaveComplete() || isShopOpen()) {
    return;
  }
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

// ⭐ 供 BUFF 使用：每次调用冷却 -0.5s，但不会低于 1s
function upgradeRollCooldownBuff() {
  currentRollCooldown = Math.max(
    MIN_ROLL_COOLDOWN,
    currentRollCooldown - 500 // 0.5 秒
  );
  console.log("[BUFF] roll CD upgraded, current:", currentRollCooldown, "ms");
}

// ⭐ 供商店检查上限：返回当前冷却时间（毫秒）
function getCurrentRollCooldownMs() {
  return currentRollCooldown;
}

// ======= Game Over 逻辑 =======
function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  if (playerHP < 0) playerHP = 0;
  updateHPDisplay();
  gameOverOverlay.style.display = "flex";
}

// ======= 重置公共状态（用于 Start / Restart） =======
function resetCommonState() {
  // 敌人 & 子弹 & 金币
  resetEnemies(scene);
  resetCombatState(scene);
  resetCoins(scene);

  // 玩家
  player.position.set(0, 1, 0);
  player.rotation.set(0, 0, 0);

  // 相机
  cameraAngle = Math.PI / 4;

  // 血量
  playerMaxHP = 10;
  playerHP = 10;
  updateHPDisplay();

  // 翻滚
  currentMoveSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
  isRolling = false;
  rollEndTime = 0;
  lastRollTime = -Infinity;
  currentRollCooldown = BASE_ROLL_COOLDOWN;
  updateRollCDDisplay();

  // ⭐ 弹速 BUFF 重置
  window.projectileSpeedMultiplier = 1.0;

  // ⭐ 暴击率重置：基础 10%
  window.critChance = 0.1;

  // 商店 / 安全波次场景
  resetShop();
  shopGroup.visible = false;

  // 金币 UI 数值重置
  setCoinCount(0);

  // 动画相位重置
  walkPhase = 0;
  updateWalkAnimation(false);
}

// ======= Restart =======
function restartGame() {
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
const keys = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
  KeyQ: false,
  KeyE: false,
};

window.addEventListener("keydown", (e) => {
  if (e.code in keys) {
    keys[e.code] = true;
  }
  if (e.code === "Space") {
    startRoll();
  }
  if (e.code === "KeyF") {
    if (getIsSafeWave()) {
      // 在绿色地毯上：花 10 货币回满血；否则：商店交互
      if (isPlayerOnHealCarpet()) {
        tryHealToFull();
      } else {
        handleShopInteractInSafeWave(performance.now());
      }
    }
  }
  if (e.code === "KeyN") {
    devSkipWave();
  }

  // 可选：按 H 键隐藏/显示作弊面板（方便演示）
  if (e.code === "KeyH") {
    const panel = document.getElementById("cheat-panel");
    if (panel) {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code in keys) {
    keys[e.code] = false;
  }
});

// ======= 玩家移动（相对屏幕的 WASD） =======
function updatePlayerMovement() {
  // 商店里不动，并且保持站立姿势
  if (isShopOpen()) {
    updateWalkAnimation(false);
    return;
  }

  const now = performance.now();
  if (isRolling && now >= rollEndTime) {
    isRolling = false;
  }

  const moveCamSpace = new THREE.Vector3();
  if (keys.KeyW) moveCamSpace.z -= 1;
  if (keys.KeyS) moveCamSpace.z += 1;
  if (keys.KeyA) moveCamSpace.x -= 1;
  if (keys.KeyD) moveCamSpace.x += 1;

  const baseSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
  const speed = isRolling
    ? baseSpeed * ROLL_SPEED_MULTIPLIER
    : currentMoveSpeed;

  const isMoving = moveCamSpace.lengthSq() > 0;

  if (isMoving) {
    moveCamSpace.normalize().multiplyScalar(speed);
    moveCamSpace.applyQuaternion(camera.quaternion);
    moveCamSpace.y = 0;
    if (moveCamSpace.lengthSq() > 0) {
      moveCamSpace.normalize().multiplyScalar(speed);
    }

    player.position.add(moveCamSpace);

    const half = INNER_HALF_SIZE - PLAYER_COLLISION_RADIUS;
    player.position.x = THREE.MathUtils.clamp(player.position.x, -half, half);
    player.position.z = THREE.MathUtils.clamp(player.position.z, -half, half);

  // ✅ 避免玩家穿过商店主体
  applyShopCollision();
  }

  // ✅ 走路动画：移动时摆动四肢，不动时回正
  updateWalkAnimation(isMoving);

  const rotateSpeed = Math.PI / 4;
  if (keys.KeyQ) {
    cameraAngle += rotateSpeed;
    keys.KeyQ = false;
  }
  if (keys.KeyE) {
    cameraAngle -= rotateSpeed;
    keys.KeyE = false;
  }
}

// ======= 走路动画：移动时触发 =======
function updateWalkAnimation(isMoving) {
  if (!limb) return;

  if (!isMoving) {
    // 不动：慢慢回到站立姿势
    const k = 0.15;
    limb.armPivotL.rotation.x *= 1 - k;
    limb.armPivotR.rotation.x *= 1 - k;
    limb.legPivotL.rotation.x *= 1 - k;
    limb.legPivotR.rotation.x *= 1 - k;

    // 身体/头回正（轻微）
    limb.body.position.y += (1.5 - limb.body.position.y) * 0.2;
    limb.head.position.y += (2.7 - limb.head.position.y) * 0.2;
    limb.body.rotation.z *= 1 - k;
    limb.head.rotation.z *= 1 - k;
    return;
  }

  // 移动：推进相位
  walkPhase += 0.18;

  // 手脚摆幅（可调）
  const swing = Math.sin(walkPhase) * 0.8;
  const bob = Math.cos(walkPhase) * 0.06;

  // 手臂与腿对摆
  limb.armPivotL.rotation.x = swing;
  limb.armPivotR.rotation.x = -swing;
  limb.legPivotL.rotation.x = -swing;
  limb.legPivotR.rotation.x = swing;

  // 轻微身体起伏 + 左右摆动（更像走路）
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
const crosshairMat = new THREE.MeshBasicMaterial({
  color: 0xffff00,
  side: THREE.DoubleSide,
});
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

  // 与地面 y=0 相交
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

  // 让玩家朝向鼠标点
  const dx = mouseWorld.x - player.position.x;
  const dz = mouseWorld.z - player.position.z;
  const angle = Math.atan2(dx, dz);
  player.rotation.y = angle;

  // 更新瞄准线
  const points = [
    new THREE.Vector3(player.position.x, player.position.y + 1, player.position.z),
    new THREE.Vector3(mouseWorld.x, player.position.y + 1, mouseWorld.z),
  ];
  aimLine.geometry.setFromPoints(points);
}

// ======= 鼠标事件交给 combat 模块 =======
window.addEventListener("mousedown", (e) => {
  handleMouseDown(e.button);
});
window.addEventListener("mouseup", (e) => {
  handleMouseUp(e.button);
});
canvas.addEventListener("mouseleave", () => {
  handleMouseLeaveCanvas();
});

// ======= 开发者模式：N 键快进到下一个回合并 +3000 金币 =======
function devSkipWave() {
  if (!isGameStarted || isGameOver) return;

  addCoins(3000);

  const now = performance.now();

  if (getIsSafeWave()) {
    startCombatWaveFromSafe(now);
  } else {
    handleNextWaveClick(now);
  }
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

  onRequestNextWaveFromSafe: (now) => {
    startCombatWaveFromSafe(now);
  },
});

// 放在全局，方便 combat.js 通过 window 读取
window.projectileSpeedMultiplier = 1.0;

function upgradeProjectileSpeed() {
  if (window.projectileSpeedMultiplier === 1.0) {
    window.projectileSpeedMultiplier += 0.1;
  } else {
    window.projectileSpeedMultiplier += 0.05;
  }
  console.log("[BUFF] 子弹速度提升，当前倍率 =", window.projectileSpeedMultiplier);
}

// ⭐ 暴击率：放在全局，供 enemies.js 使用
if (typeof window.critChance !== "number") {
  window.critChance = 0.1; // 初始 10%
}

// ⭐ 暴击提升：每次 BUFF +10%，最大 100%
function upgradeCritChance() {
  const current = typeof window.critChance === "number" ? window.critChance : 0.1;
  const next = Math.min(1.0, current + 0.1);
  window.critChance = next;
  console.log("[BUFF] 暴击率提升，当前暴击率 =", (next * 100).toFixed(0) + "%");
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

    // 进商店强制站立
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

// 设置金币
if (cheatCoinsApplyBtn) {
  cheatCoinsApplyBtn.addEventListener("click", () => {
    if (!cheatCoinsInput) return;
    const v = parseInt(cheatCoinsInput.value, 10);
    if (!Number.isNaN(v)) {
      setCoinCount(v);
      console.log("[CHEAT] Coins set to", v);
    }
  });
}

// 设置移动速度倍率（1.0 = 默认）
if (cheatSpeedApplyBtn) {
  cheatSpeedApplyBtn.addEventListener("click", () => {
    if (!cheatSpeedInput) return;
    const v = parseFloat(cheatSpeedInput.value);
    if (!Number.isNaN(v) && v > 0) {
      moveSpeedCheatMultiplier = v;
      console.log("[CHEAT] Move speed multiplier set to", v);

      // 立即刷新当前移动速度
      currentMoveSpeed = BASE_MOVE_SPEED * moveSpeedCheatMultiplier;
    }
  });
}

// 设置当前 HP
if (cheatHpApplyBtn) {
  cheatHpApplyBtn.addEventListener("click", () => {
    if (!cheatHpInput) return;
    const v = parseInt(cheatHpInput.value, 10);
    if (!Number.isNaN(v)) {
      playerHP = Math.max(0, Math.min(playerMaxHP, v));
      updateHPDisplay();
      console.log("[CHEAT] HP set to", playerHP);
    }
  });
}

// 跳到下一波
if (cheatNextWaveBtn) {
  cheatNextWaveBtn.addEventListener("click", () => {
    if (!isGameStarted || isGameOver) return;
    const now = performance.now();

    if (getIsSafeWave()) {
      startCombatWaveFromSafe(now);
      console.log("[CHEAT] Start combat wave from safe wave");
    } else {
      const result = handleNextWaveClick(now);
      console.log("[CHEAT] Next wave triggered", result);
    }
  });
}

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
      // 根据减速 BUFF / 安全波次更新 currentMoveSpeed，但保留作弊倍率
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
    // 非战斗/暂停时保持站立
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
