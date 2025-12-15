// enemies.js
import * as THREE from "three";
import { getEnemyTypesForWave, ELITE_CHANCE } from "./enemyTypes.js";
import { getCurrentWave } from "./waves.js";


// ==========================================================
// 🐭 Mouse enemy model helpers (cone head + cylinder body + tail)
// ==========================================================
function createMouseModel({ color, scale = 1, hasHat = false }) {
  const group = new THREE.Group();      // 外层：敌人的mesh（会被 enemy.rotation.y 控制）
  const modelRoot = new THREE.Group();  // 内层：模型修正朝向（不会被覆盖）
  group.add(modelRoot);

  // ✅ 方式A真正生效的地方：把修正角度放到内层
  modelRoot.rotation.y = - Math.PI / 2; // 180° 翻转（如果你需要的是反向）

  const bodyMat = new THREE.MeshPhongMaterial({ color });
  const eyeMat = new THREE.MeshPhongMaterial({ color: 0x000000 });
  const hatMat = new THREE.MeshPhongMaterial({ color: 0x00aa00 });

  // ===== 身体（圆柱横放）=====
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.48, 1.15, 16),
    bodyMat
  );
  body.rotation.z = Math.PI / 2;
  modelRoot.add(body);

  // ===== 头（圆锥横放，尖尖朝“前方”）=====
  const HEAD_H = 0.75;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, HEAD_H, 16),
    bodyMat
  );

  // 这两行决定“圆锥尖尖朝哪边”：
  head.rotation.z = -Math.PI / 2;
  head.rotation.x = Math.PI; // ✅ 如果你现在看到尖尖没朝前，就保留这一行

  // ✅ 圆底对齐圆柱前端（圆底贴身体）
  const BODY_LEN = 1.15;
  head.position.x = (BODY_LEN / 2) + (HEAD_H / 2);

  modelRoot.add(head);

  // ===== 眼睛 =====
  const eyeGeom = new THREE.SphereGeometry(0.07, 10, 10);
  const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
  eyeL.position.set(head.position.x + 0.20, 0.28,  0.16);
  eyeR.position.set(head.position.x + 0.20, 0.28, -0.16);
  modelRoot.add(eyeL, eyeR);

  // ===== 尾巴（pivot 摇摆）=====
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-0.70, 0.18, 0);
  modelRoot.add(tailPivot);

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 0.06, 0.06),
    bodyMat
  );
  tail.position.x = -0.72;
  tailPivot.add(tail);

  // ===== 盾兵帽子 =====
  let hat = null;
  if (hasHat) {
    hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.30, 0.20, 16),
      hatMat
    );
    hat.position.set(head.position.x - 0.05, 0.58, 0);
    modelRoot.add(hat);
  }

  group.scale.setScalar(scale);

  const colorMeshes = [body, head, tail];
  if (hat) colorMeshes.push(hat);

  return { group, tailPivot, colorMeshes };
}



function setEnemyColor(enemyData, color) {
  if (!enemyData || !enemyData.colorMeshes) return;
  for (const m of enemyData.colorMeshes) {
    if (m?.material?.color) m.material.color.set(color);
  }
}

function restoreEnemyBaseColor(enemyData) {
  if (!enemyData || !enemyData.baseColor) return;
  setEnemyColor(enemyData, enemyData.baseColor);
}

let scene, player, camera;
let innerHalfSize;
let ENEMY_COLLISION_RADIUS = 2.0;
let PLAYER_COLLISION_RADIUS = 1.5;

const enemies = [];

// ========= 伤害数字 Sprite =========
const damageTexts = [];
const DAMAGE_TEXT_DURATION = 600; // ms
const DAMAGE_TEXT_RISE_HEIGHT = 2.0;

// ========= 滞留弹叠伤 BUFF 状态 =========
let stickyBuffEnabled = false;
let stickyMaxStacks = 3; // 初始最多叠 3 层

// ========= 流血弹 BUFF 状态（全局） =========
let bleedStacks = 0; // 每秒流血伤害 = bleedStacks
const BLEED_TICK_INTERVAL = 1000; // ms
const BLEED_DURATION = 5000; // ms
const BLEED_DELAY = 1000; // ms，命中后 1 秒开始生效

// ========= 减速弹 BUFF 状态（全局） =========
let slowBuffEnabled = false;
const SLOW_BASE_DURATION = 5000; // 初始 5 秒
let slowDurationExtraMs = 0; // 每拿一次 BUFF +1000 ms
const SLOW_MOVE_FACTOR = 0.7; // 移动速度乘以 0.7（= 降低 30%）
const SLOW_ATTACK_FACTOR = 1.5; // 攻击间隔 *1.5（= 间隔增加 50%）

// ========= 引力弹 BUFF 状态（全局） =========
let gravityBuffEnabled = false;
const GRAVITY_BASE_RADIUS = 10;
let gravityRadiusMultiplier = 1.0;

function getGravityRadius() {
  if (!gravityBuffEnabled) return 0;
  return GRAVITY_BASE_RADIUS * gravityRadiusMultiplier;
}

// ========= 火焰子弹 BUFF 状态（全局） =========
let fireTrailBuffEnabled = false;
const FIRE_TRAIL_BASE_DURATION = 1000; // ms
let fireTrailExtraDurationMs = 0; // 每次 BUFF +500ms
const FIRE_TRAIL_MAX_DURATION = 4000; // 上限 4s

const FIRE_TRAIL_SPAWN_INTERVAL = 150; // 敌人每隔 0.15s 留下一段火焰
const FIRE_TILE_LIFETIME = 3000; // 单块火焰默认在地上存在 3s
const FIRE_BURN_TICK_INTERVAL = 1000; // 每秒结算一次伤害
const FIRE_BURN_DAMAGE_PER_TICK = 0.5; // 每秒 0.5 点伤害
const FIRE_TILE_RADIUS = 2.0;

const fireTiles = []; // { mesh, expireTime, owner }
let nextFireBurnTickTime = 0;

const fireTileGeometry = new THREE.CircleGeometry(
  ENEMY_COLLISION_RADIUS * 1.5,
  16
);
const fireTileMaterial = new THREE.MeshBasicMaterial({
  color: 0xff3300,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});

// ========= 敌人攻击间隔（基础，用于减速 BUFF） =========
const ENEMY_BASE_ATTACK_INTERVAL = 300; // ms

// ===== BUFF 升级接口 =====
export function upgradeSticky() {
  stickyBuffEnabled = true;
  stickyMaxStacks += 1;
  console.log("[BUFF] 滞留弹叠加上限 =", stickyMaxStacks);
}

export function upgradeBleed() {
  bleedStacks += 1;
  console.log("[BUFF] 流血弹等级提升，每秒流血伤害 =", bleedStacks);
}

export function upgradeSlow() {
  slowBuffEnabled = true;
  slowDurationExtraMs += 1000;
  const totalSec = (SLOW_BASE_DURATION + slowDurationExtraMs) / 1000;
  console.log("[BUFF] 减速弹持续时间提升，当前持续时间 =", totalSec, "秒");
}

export function upgradeGravity() {
  gravityBuffEnabled = true;
  gravityRadiusMultiplier *= 1.1;
  console.log(
    "[BUFF] 引力弹升级，当前引力半径 =",
    getGravityRadius().toFixed(2)
  );
}

export function upgradeFireTrail() {
  fireTrailBuffEnabled = true;
  fireTrailExtraDurationMs = Math.min(
    FIRE_TRAIL_MAX_DURATION - FIRE_TRAIL_BASE_DURATION,
    fireTrailExtraDurationMs + 500
  );
  const totalSec =
    (FIRE_TRAIL_BASE_DURATION + fireTrailExtraDurationMs) / 1000;
  console.log(
    "[BUFF] 火焰子弹持续时间提升，当前敌人留火时间 =",
    totalSec,
    "秒"
  );
}

export function getFireTrailTotalDurationMs() {
  if (!fireTrailBuffEnabled) return 0;
  const total = FIRE_TRAIL_BASE_DURATION + fireTrailExtraDurationMs;
  return Math.min(total, FIRE_TRAIL_MAX_DURATION);
}

// ===== 狙击兵子弹 =====
const sniperBullets = [];
// 玩家子弹速度 = combat.js 里的 BULLET_SPEED = 1.2
// 狙击兵子弹 = 1.8 倍玩家子弹速度 = 2.16
const SNIPER_BULLET_SPEED = 2.16;
const SNIPER_BULLET_MAX_DISTANCE = 300;
const SNIPER_BULLET_HIT_RADIUS = 1.0; // 子弹自身碰撞半径

const sniperBulletGeom = new THREE.SphereGeometry(0.25, 8, 8);
const sniperBulletMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// ===== 自爆兵爆炸圈效果 =====
const bomberExplosions = [];
const BOMBER_EXPLOSION_DURATION = 300; // 0.3 秒

// ===== 地面 AoE（6 号小兵释放的毒池 / 减速池） =====
const groundAoes = [];
const GROUND_AOE_TELEGRAPH_MS = 1000; // 黄色预警 1 秒
const GROUND_AOE_DURATION_MS = 8000; // 绿色伤害圈持续 8 秒
const GROUND_AOE_TICK_MS = 1000; // 每秒伤害一次

// 刷怪控制
const MAX_ENEMIES = 40;
const SPAWN_MIN_DISTANCE = 80;
const SPAWN_MAX_DISTANCE = 120;
const MAP_MARGIN = 2;
let lastSpawnTime = 0;

// ===== 初始化 / 清理 =====
export function initEnemies(sceneRef, playerRef, cameraRef, config) {
  scene = sceneRef;
  player = playerRef;
  camera = cameraRef;
  innerHalfSize = config.innerHalfSize;
  ENEMY_COLLISION_RADIUS = config.enemyCollisionRadius;
  PLAYER_COLLISION_RADIUS = config.playerCollisionRadius;
}

// ✅ 修复点 1：清除敌人时，把火焰地板 + 伤害数字 Sprite 一起清掉
export function clearEnemiesAndBullets(sceneRef) {
  // 敌人
  for (const e of enemies) {
    sceneRef.remove(e.mesh);
    if (e.sniperLine) {
      sceneRef.remove(e.sniperLine);
    }
  }
  enemies.length = 0;

  // 狙击子弹
  for (const b of sniperBullets) {
    sceneRef.remove(b.mesh);
  }
  sniperBullets.length = 0;

  // 自爆圈
  for (const fx of bomberExplosions) {
    sceneRef.remove(fx.mesh);
  }
  bomberExplosions.length = 0;

  // 地面 AoE
  for (const aoe of groundAoes) {
    sceneRef.remove(aoe.mesh);
  }
  groundAoes.length = 0;

  // 火焰地板
  for (const ft of fireTiles) {
    sceneRef.remove(ft.mesh);
  }
  fireTiles.length = 0;
  nextFireBurnTickTime = 0;

  // 伤害数字 Sprite
  for (const dt of damageTexts) {
    sceneRef.remove(dt.sprite);
    dt.material.dispose();
    dt.texture.dispose();
  }
  damageTexts.length = 0;
}

// ✅ 修复点 2：Restart 时，重置所有 BUFF 状态
export function resetEnemies(sceneRef) {
  clearEnemiesAndBullets(sceneRef);
  lastSpawnTime = 0;

  // 子弹 BUFF 相关全部重置（重要）
  stickyBuffEnabled = false;
  stickyMaxStacks = 3;

  bleedStacks = 0;

  slowBuffEnabled = false;
  slowDurationExtraMs = 0;

  gravityBuffEnabled = false;
  gravityRadiusMultiplier = 1.0;

  fireTrailBuffEnabled = false;
  fireTrailExtraDurationMs = 0;
}

// ===== 伤害数字 Sprite =====
function spawnDamageText(damageValue, worldPos, now, isCrit = false) {
  if (!scene) return;

  let text;
  if (Number.isInteger(damageValue)) {
    text = damageValue.toString();
  } else {
    text = damageValue.toFixed(1);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.font = "bold 64px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

  // 普通伤害：黄色；暴击：红色
  ctx.fillStyle = isCrit ? "#ff0000" : "#ffdd55";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);

  const spriteWorldWidth = 6;
  const aspect = canvas.height / canvas.width;
  sprite.scale.set(spriteWorldWidth, spriteWorldWidth * aspect, 1);

  sprite.position.set(worldPos.x, worldPos.y + 3.5, worldPos.z);

  scene.add(sprite);

  damageTexts.push({
    sprite,
    startTime: now,
    duration: DAMAGE_TEXT_DURATION,
    baseY: sprite.position.y,
    texture,
    material,
  });
}

export function updateDamageTexts(now) {
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dt = damageTexts[i];
    const t = (now - dt.startTime) / dt.duration;

    if (t >= 1) {
      scene.remove(dt.sprite);
      dt.material.dispose();
      dt.texture.dispose();
      damageTexts.splice(i, 1);
      continue;
    }

    const offsetY = DAMAGE_TEXT_RISE_HEIGHT * t;
    dt.sprite.position.y = dt.baseY + offsetY;

    const opacity = 1 - t;
    dt.material.opacity = opacity;
  }
}

// ===== 视锥裁剪判断：避免在镜头内刷怪 =====
function isInViewFrustum(worldPos) {
  const projected = worldPos.clone().project(camera);
  return (
    projected.x >= -1 &&
    projected.x <= 1 &&
    projected.y >= -1 &&
    projected.y <= 1 &&
    projected.z >= -1 &&
    projected.z <= 1
  );
}

// ===== 对单个敌人造成伤害（给 AoE 用） =====
function damageEnemy(enemyWrapper, amount, now) {
  if (!enemyWrapper) return { killed: false, position: null, damage: 0 };

  const e = enemyWrapper;
  const enemyMesh = e.mesh;

  const dmg = Math.max(0, amount || 0);
  if (dmg <= 0) {
    return { killed: false, position: enemyMesh.position.clone(), damage: 0 };
  }

  e.hp -= dmg;

  setEnemyColor(e, 0xffffff);
  e.flashEndTime = now + 300;

  let killed = false;
  let pos = null;

  if (e.hp <= 0) {
    killed = true;
    pos = enemyMesh.position.clone();
  }

  return { killed, position: pos, damage: dmg };
}

// 当前暴击率：从全局 window.critChance 读取（由 combat / shop 维护）
function getCurrentCritChance() {
  if (typeof window !== "undefined" && typeof window.critChance === "number") {
    return window.critChance;
  }
  return 0;
}

// ===== 生成一个敌人 Mesh + 数据（多类型敌人） =====
function spawnEnemyAtPosition(typeConfig, worldPos, wave) {
  // ---- 基础数值 ----
  const baseHP = typeConfig.baseHP ?? 1;
  const baseDamage = typeConfig.baseDamage ?? 1;
  const baseCoins = typeConfig.baseCoins ?? 1;
  const baseSpeed = typeConfig.baseSpeed ?? 0.6;

  let hp = baseHP;
  let damage = baseDamage;
  let coins = baseCoins;
  const speed = baseSpeed;

  // tier: 1级=1号/2号; 2级=3号/4号; 3级=5号/6号
  const tier = typeConfig.tier ?? typeConfig.level ?? 1;
  const w = Math.max(1, wave | 0);

  // ===== 波次增强逻辑 =====
  // 1) 1级怪：每两个回合后血量+1，伤害+1，掉落的金币+1
  //    从第 3 波开始生效（3,4 → +1；5,6 → +2；...）
  if (tier === 1) {
    const inc = w >= 3 ? Math.floor((w - 1) / 2) : 0;
    hp += inc * 1;
    damage += inc * 1;
    coins += inc * 1;
  }

  // 2) 2级怪：在第4回合后每两个回合后血量+2，伤害+1，掉落的金币+1
  //    从第 6 波开始生效（6,7 → 第一次；8,9 → 第二次；...）
  if (tier === 2) {
    const inc = w >= 6 ? Math.floor((w - 4) / 2) : 0;
    hp += inc * 2;
    damage += inc * 1;
    coins += inc * 1;
  }

  // 3) 3级怪：在第5回合后每两个回合后血量+1，伤害+1，掉落的金币+1
  //    从第 7 波开始生效（7,8 → 第一次；9,10 → 第二次；...）
  if (tier === 3) {
    const inc = w >= 7 ? Math.floor((w - 5) / 2) : 0;
    hp += inc * 1;
    damage += inc * 1;
    coins += inc * 1;
  }

  // 4) 在第十波次之后，所有小怪每个回合血量+1
  //    11 波 +1，12 波 +2，13 波 +3 ...
  if (w > 10) {
    hp += w - 10;
  }

  // 防止负数 / 0
  hp = Math.max(1, Math.round(hp));
  damage = Math.max(0, Math.round(damage));
  coins = Math.max(1, Math.round(coins));

  // ===== 精英怪处理 =====
  const isElite = Math.random() < ELITE_CHANCE;

  let sizeScale = typeConfig.sizeScale ?? 1.0;
  if (isElite) {
    hp *= 2;
    damage *= 2;
    sizeScale *= 1.3;
  }

  
// ===== Mouse look (override per enemy type) =====
let mouseColor = 0xffff00; // standard: yellow
let extraScale = 1.0;
let hasHat = false;

switch (typeConfig.id) {
  case 1: // 标准：黄色
    mouseColor = 0xffff00;
    break;
  case 2: // 迅捷：绿色，小一点
    mouseColor = 0x00ff00;
    extraScale = 0.8;
    break;
  case 3: // 盾兵：蓝色，大一点 + 绿帽子
    mouseColor = 0x3366ff;
    extraScale = 1.3;
    hasHat = true;
    break;
  case 4: // 自爆：红色
    mouseColor = 0xff0000;
    break;
  case 5: // 狙击：紫色
    mouseColor = 0x9933ff;
    break;
  case 6: // 刺客：橙色
    mouseColor = 0xff8800;
    break;
  default:
    mouseColor = typeConfig.color ?? 0xffffff;
    break;
}

// Elite: keep your elite stat scaling, but paint it magenta
if (isElite) {
  mouseColor = 0xff00ff;
}

const finalScale = (sizeScale ?? 1.0) * extraScale;

const mouse = createMouseModel({
  color: mouseColor,
  scale: finalScale,
  hasHat,
});

const enemyMesh = mouse.group;
enemyMesh.position.copy(worldPos);

// ===== Body radius: used for bomber/sniper/caster ranges =====
const baseLength = 1.4 * finalScale; // approximate mouse length in XZ

  // ===== 身长半径：用于自爆 & 狙击射击距离计算 =====
  const bodyRadius = baseLength / 2;

  const isBomber = typeConfig.id === 4;
  const isSniper = typeConfig.id === 5;
  const isGroundCaster = typeConfig.id === 6; // 6 号地面 AoE 小兵

  // ===== 自爆兵：触发范围 / 爆炸范围 =====
  let triggerRadius = 0;
  let explosionRadius = 0;
  if (isBomber) {
    triggerRadius = bodyRadius * 6;
    explosionRadius = bodyRadius * 7;
  }

  // ===== 狙击兵：瞄准触发范围 =====
  const sniperAimRadius = isSniper ? bodyRadius * 14 : 0;

  // ===== 地面 AoE 小兵：触发范围 =====
  let groundCastRadius = 0;
  let groundAoeRadius = 0;
  if (isGroundCaster) {
    groundCastRadius = bodyRadius * 12;
    groundAoeRadius = bodyRadius * 4;
  }

  // 狙击兵辅助线
  let sniperLine = null;
  if (isSniper) {
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    sniperLine = new THREE.Line(lineGeom, lineMat);
    sniperLine.frustumCulled = false;
    sniperLine.visible = false;
    scene.add(sniperLine);
  }

  const attackIntervalMs =
    typeConfig.attackIntervalMs ?? ENEMY_BASE_ATTACK_INTERVAL;

  const enemyData = {
    mesh: enemyMesh,
    typeId: typeConfig.id,
    name: typeConfig.name,
    tier,
    isElite,
    hp,
    maxHp: hp,
    damage,
    speed,
    attackIntervalMs,
    coins,
    baseColor: new THREE.Color(mouseColor),
    colorMeshes: mouse.colorMeshes,
    tailPivot: mouse.tailPivot,
    tailPhase: Math.random() * Math.PI * 2,
    prevPosXZ: new THREE.Vector2(worldPos.x, worldPos.z),
    flashEndTime: 0,
    nextDamageTime: 0,

    // ===== BUFF 相关状态 =====
    stickyStacks: 0,

    // 流血
    bleedStartTime: 0,
    bleedEndTime: 0,
    bleedNextTickTime: 0,

    // 减速：保留基础攻速 + 当前状态
    baseAttackIntervalMs: attackIntervalMs,
    slowEndTime: 0,

    // 火焰轨迹
    fireTrailEndTime: 0,
    nextFireTrailSpawnTime: 0,

    // 额外移动 / 攻速因子
    speedFactor: 1.0,
    attackIntervalFactor: 1.0,

    // ===== 自爆兵字段 =====
    isBomber,
    isArming: false,
    armStartTime: 0,
    triggerRadius,
    explosionRadius,
    explodeDelayMs: isBomber ? 500 : 0,
    toRemove: false,

    // ===== 狙击兵字段 =====
    isSniper,
    sniperState: isSniper ? "approach" : null, // "approach" | "aiming" | "cooldown"
    sniperAimStartTime: 0,
    sniperLastAttackTime: 0,
    sniperFireIntervalMs: 3000, // 3 秒一次
    sniperAimDurationMs: 1000, // 瞄准 1 秒
    sniperWarnTimeMs: 700, // 前 0.7 秒红线常亮，然后闪烁
    sniperAimRadius,
    sniperLine,

    // ===== 地面 AoE 小兵字段（6 号） =====
    isGroundCaster,
    groundCastRadius,
    groundAoeRadius,
    groundCastState: isGroundCaster ? "approach" : null, // "approach" | "aiming" | "cooldown"
    groundAimStartTime: 0,
    groundLastCastTime: 0,
    groundCastIntervalMs: isGroundCaster ? 4000 : 0, // 4 秒冷却
  };

  scene.add(enemyMesh);
  enemies.push(enemyData);
}

function trySpawnEnemy(now, isSafeWave) {
  if (enemies.length >= MAX_ENEMIES) return;
  if (isSafeWave) return;
  if (now - lastSpawnTime < 1000) return;

  const wave = getCurrentWave ? getCurrentWave() : 1;
  const availableTypes = getEnemyTypesForWave(wave);
  if (availableTypes.length === 0) return;

  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist =
      SPAWN_MIN_DISTANCE +
      Math.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);

    const x = player.position.x + Math.cos(angle) * dist;
    const z = player.position.z + Math.sin(angle) * dist;

    if (
      x < -innerHalfSize + MAP_MARGIN ||
      x > innerHalfSize - MAP_MARGIN ||
      z < -innerHalfSize + MAP_MARGIN ||
      z > innerHalfSize - MAP_MARGIN
    ) {
      continue;
    }

    const testPos = new THREE.Vector3(x, player.position.y + 0.6, z);
    if (isInViewFrustum(testPos)) continue;

    const typeCfg =
      availableTypes[(Math.random() * availableTypes.length) | 0];

    spawnEnemyAtPosition(typeCfg, testPos, wave);

    lastSpawnTime = now;
    break;
  }
}

// ===== 引力弹：把附近敌人往某个点拉拢 =====
function applyGravityPull(center) {
  if (!gravityBuffEnabled) return;

  const radius = getGravityRadius();
  if (radius <= 0) return;

  const r2 = radius * radius;
  const pullFactor = 0.6;

  const enemyHalf = innerHalfSize - ENEMY_COLLISION_RADIUS;

  for (const e of enemies) {
    const pos = e.mesh.position;

    const dx = center.x - pos.x;
    const dz = center.z - pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq <= 1e-4 || distSq > r2) continue;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const nz = dz / dist;

    const move = Math.min(dist * pullFactor, radius * 0.5 * pullFactor);

    pos.x += nx * move;
    pos.z += nz * move;

    pos.x = THREE.MathUtils.clamp(pos.x, -enemyHalf, enemyHalf);
    pos.z = THREE.MathUtils.clamp(pos.z, -enemyHalf, enemyHalf);
  }
}

// ===== 子弹命中：直击 + 范围伤害 + 滞留弹 + 流血 + 减速 + 弹射目标 =====
export function handleBulletHit(
  bulletPos,
  now,
  bulletHitRadius,
  damage = 1,
  explosionRadius = 0,
  splashFactor = 0
) {
  let hit = false;
  const killPositions = [];

  const r2 = bulletHitRadius * bulletHitRadius;

  // ① 找到“直接命中”的敌人索引
  let primaryIndex = -1;
  for (let j = 0; j < enemies.length; j++) {
    const e = enemies[j];
    const ep = e.mesh.position;

    const dx = bulletPos.x - ep.x;
    const dz = bulletPos.z - ep.z;
    const distSq = dx * dx + dz * dz;

    if (distSq <= r2) {
      hit = true;
      primaryIndex = j;
      break;
    }
  }

  if (!hit || primaryIndex < 0) {
    return {
      hit: false,
      killed: false,
      position: null,
      ricochetTarget: null,
      killPositions: [],
    };
  }

  // 命中点：直接命中敌人的中心
  const primaryEnemy = enemies[primaryIndex];
  const hitPos = primaryEnemy.mesh.position.clone();

  const hasExplosion = explosionRadius > 0 && splashFactor > 0;
  const explosionR2 = hasExplosion ? explosionRadius * explosionRadius : 0;

  // ② 应用伤害（直击 + 溅射）
  for (let k = enemies.length - 1; k >= 0; k--) {
    const e = enemies[k];
    const ep = e.mesh.position;

    const dx = ep.x - hitPos.x;
    const dz = ep.z - hitPos.z;
    const distSq = dx * dx + dz * dz;

    const isPrimary = k === primaryIndex;
    const inExplosion = hasExplosion && distSq <= explosionR2;

    if (!isPrimary && !inExplosion) continue;

    let appliedDamage;

    if (isPrimary) {
      // 滞留弹：直击目标叠层
      if (stickyBuffEnabled) {
        if (typeof e.stickyStacks !== "number") e.stickyStacks = 0;
        e.stickyStacks = Math.min(
          stickyMaxStacks,
          (e.stickyStacks || 0) + 1
        );
        appliedDamage = damage * e.stickyStacks;
      } else {
        appliedDamage = damage;
      }

      // 流血
      if (bleedStacks > 0) {
        e.bleedStartTime = now + BLEED_DELAY;
        e.bleedEndTime = e.bleedStartTime + BLEED_DURATION;
        e.bleedNextTickTime = e.bleedStartTime;
      }

      // 减速：移动 & 攻速
      if (slowBuffEnabled) {
        const duration = SLOW_BASE_DURATION + slowDurationExtraMs;
        e.slowEndTime = now + duration;

        e.attackIntervalMs =
          (e.baseAttackIntervalMs || ENEMY_BASE_ATTACK_INTERVAL) *
          SLOW_ATTACK_FACTOR;

        e.speedFactor = SLOW_MOVE_FACTOR;
      }

      // 火焰轨迹：只对直击目标开启
      if (fireTrailBuffEnabled) {
        const duration = Math.min(
          FIRE_TRAIL_MAX_DURATION,
          FIRE_TRAIL_BASE_DURATION + fireTrailExtraDurationMs
        );
        e.fireTrailEndTime = now + duration;
        e.nextFireTrailSpawnTime = now;
      }
    } else {
      // 溅射目标：只吃溅射伤害，不触发 BUFF
      appliedDamage = damage * splashFactor;
    }

    // 暴击判定
    let finalDamage = appliedDamage;
    let isCrit = false;
    const critChance = getCurrentCritChance();
    if (critChance > 0 && Math.random() < critChance) {
      isCrit = true;
      finalDamage = appliedDamage * 2;
    }

    spawnDamageText(finalDamage, ep, now, isCrit);

    e.hp -= finalDamage;

    setEnemyColor(e, 0xffffff);
    e.flashEndTime = now + 300;

    if (e.hp <= 0) {
      killPositions.push(ep.clone());
      if (e.sniperLine) scene.remove(e.sniperLine);
      scene.remove(e.mesh);
      enemies.splice(k, 1);

      if (k < primaryIndex) {
        primaryIndex -= 1;
      } else if (k === primaryIndex) {
        primaryIndex = -1;
      }
    }
  }

  const killedAny = killPositions.length > 0;
  const firstKillPos = killedAny ? killPositions[0].clone() : hitPos.clone();

  // ③ 引力弹：在命中点拉怪
  if (gravityBuffEnabled) {
    applyGravityPull(hitPos);
  }

  // ④ 弹射目标：从剩余敌人中找一个最近的
  let ricochetTarget = null;
  let minDistSq = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    if (i === primaryIndex && primaryIndex !== -1) continue;
    const ep = enemies[i].mesh.position;
    const dx = ep.x - hitPos.x;
    const dz = ep.z - hitPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minDistSq) {
      minDistSq = d2;
      ricochetTarget = ep.clone();
    }
  }

  return {
    hit: true,
    killed: killedAny,
    position: firstKillPos,
    ricochetTarget,
    killPositions,
  };
}

// ===== 范围爆炸伤害：火箭 AoE 使用（对敌人） =====
export function applyExplosionDamage(center, radius, damage, now) {
  const results = [];
  if (!center || radius <= 0 || damage <= 0) return results;

  const r2 = radius * radius;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const ep = e.mesh.position;

    const dx = ep.x - center.x;
    const dz = ep.z - center.z;
    const distSq = dx * dx + dz * dz;

    if (distSq <= r2) {
      const res = damageEnemy(e, damage, now);
      results.push({
        position: ep.clone(),
        damage: res.damage,
        killed: res.killed,
      });

      if (res.killed) {
        if (e.sniperLine) scene.remove(e.sniperLine);
        scene.remove(e.mesh);
        enemies.splice(i, 1);
      }
    }
  }

  return results;
}

// ===== 生成狙击兵子弹（实体） =====
function spawnSniperBullet(enemyData) {
  const enemy = enemyData.mesh;

  const start = enemy.position.clone();
  start.y += 1.5;

  // 瞬间锁定玩家当前的位置作为目标
  const target = player.position.clone();
  target.y += 1.0;

  const dir = target.clone().sub(start);
  dir.y = 0; // 只在平面上飞
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();

  const bulletMesh = new THREE.Mesh(sniperBulletGeom, sniperBulletMat);
  bulletMesh.position.copy(start);
  scene.add(bulletMesh);

  sniperBullets.push({
    mesh: bulletMesh,
    dir,
    distance: 0,
    damage: enemyData.damage ?? 3,
  });
}

// ===== 更新狙击兵子弹 =====
function updateSniperBullets(now, onPlayerDamaged) {
  for (let i = sniperBullets.length - 1; i >= 0; i--) {
    const b = sniperBullets[i];
    const step = SNIPER_BULLET_SPEED;
    b.mesh.position.add(b.dir.clone().multiplyScalar(step));
    b.distance += step;

    const bp = b.mesh.position;

    // 边界 & 最大距离判定
    if (
      Math.abs(bp.x) > innerHalfSize ||
      Math.abs(bp.z) > innerHalfSize ||
      b.distance > SNIPER_BULLET_MAX_DISTANCE
    ) {
      scene.remove(b.mesh);
      sniperBullets.splice(i, 1);
      continue;
    }

    // 命中玩家判定
    const dx = bp.x - player.position.x;
    const dz = bp.z - player.position.z;
    const hitDist = SNIPER_BULLET_HIT_RADIUS + PLAYER_COLLISION_RADIUS;
    if (dx * dx + dz * dz <= hitDist * hitDist) {
      if (onPlayerDamaged) {
        onPlayerDamaged(b.damage);
      }
      scene.remove(b.mesh);
      sniperBullets.splice(i, 1);
    }
  }
}

// ===== 生成自爆红圈视觉效果 =====
function spawnBomberExplosionVisual(centerPos, radius, now) {
  if (!scene || radius <= 0) return;

  const geom = new THREE.CircleGeometry(radius, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2; // 平躺在地面
  mesh.position.set(centerPos.x, 0.05, centerPos.z);
  scene.add(mesh);

  bomberExplosions.push({
    mesh,
    startTime: now,
    endTime: now + BOMBER_EXPLOSION_DURATION,
  });
}

// ===== 生成地面 AoE（黄色预警 -> 绿色持续伤害） =====
function spawnGroundAoe(centerPos, radius, now) {
  if (!scene || radius <= 0) return;

  const geom = new THREE.CircleGeometry(radius, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffff00, // 初始黄色
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(centerPos.x, 0.04, centerPos.z);
  scene.add(mesh);

  groundAoes.push({
    mesh,
    center: centerPos.clone(),
    radius,
    startTime: now,
    activeStartTime: now + GROUND_AOE_TELEGRAPH_MS,
    endTime: now + GROUND_AOE_TELEGRAPH_MS + GROUND_AOE_DURATION_MS,
    lastTickTime: now,
    active: false,
  });
}

// ===== 更新自爆红圈渐隐 & 删除 =====
function updateBomberExplosions(now) {
  for (let i = bomberExplosions.length - 1; i >= 0; i--) {
    const fx = bomberExplosions[i];
    const { mesh, startTime, endTime } = fx;

    const total = endTime - startTime;
    const remain = endTime - now;

    if (remain <= 0) {
      scene.remove(mesh);
      bomberExplosions.splice(i, 1);
      continue;
    }

    // 简单渐隐效果
    const t = remain / total; // 1 -> 0
    const mat = mesh.material;
    mat.opacity = 0.6 * t;
  }
}

// ===== 更新地面 AoE：颜色变化 + 持续伤害 =====
function updateGroundAoes(now, onPlayerDamaged) {
  let playerInAnyAoe = false;

  for (let i = groundAoes.length - 1; i >= 0; i--) {
    const aoe = groundAoes[i];
    const { mesh, center, radius, activeStartTime, endTime } = aoe;

    if (now >= endTime) {
      scene.remove(mesh);
      groundAoes.splice(i, 1);
      continue;
    }

    const mat = mesh.material;

    // 进入绿色伤害阶段
    if (!aoe.active && now >= activeStartTime) {
      aoe.active = true;
      mat.color.set(0x00ff00); // 绿色
      mat.opacity = 0.35;
    }

    // 玩家是否在圈内
    const dx = player.position.x - center.x;
    const dz = player.position.z - center.z;
    const r2 = radius * radius;
    const distSq = dx * dx + dz * dz;
    const inside = distSq <= r2;

    if (inside) {
      playerInAnyAoe = true;
    }

    // 仅在绿色阶段造成伤害
    if (aoe.active && inside && !isNaN(aoe.lastTickTime)) {
      if (now - aoe.lastTickTime >= GROUND_AOE_TICK_MS) {
        if (onPlayerDamaged) {
          onPlayerDamaged(1);
        }
        aoe.lastTickTime = now;
      }
    }
  }

  return playerInAnyAoe;
}

// ===== 流血 DOT =====
function applyBleedDamage(now) {
  if (bleedStacks <= 0) return;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.bleedEndTime || now < e.bleedStartTime) continue;

    if (now >= e.bleedEndTime) {
      e.bleedStartTime = 0;
      e.bleedEndTime = 0;
      e.bleedNextTickTime = 0;
      continue;
    }

    if (now < e.bleedNextTickTime) continue;

    e.bleedNextTickTime += BLEED_TICK_INTERVAL;
    const dmg = bleedStacks;
    const ep = e.mesh.position;
    spawnDamageText(dmg, ep, now);

    e.hp -= dmg;
    setEnemyColor(e, 0xaa0000);
    e.flashEndTime = Math.max(e.flashEndTime, now + 150);

    if (e.hp <= 0) {
      if (e.sniperLine) scene.remove(e.sniperLine);
      scene.remove(e.mesh);
      enemies.splice(i, 1);
    }
  }
}

// ===== 火焰地板 DOT =====
function applyFireDamage(now) {
  // 清过期火焰
  for (let i = fireTiles.length - 1; i >= 0; i--) {
    const ft = fireTiles[i];
    if (now >= ft.expireTime) {
      scene.remove(ft.mesh);
      fireTiles.splice(i, 1);
    }
  }
  if (fireTiles.length === 0) return;

  if (now < nextFireBurnTickTime) return;
  nextFireBurnTickTime = now + FIRE_BURN_TICK_INTERVAL;

  const r = FIRE_TILE_RADIUS + ENEMY_COLLISION_RADIUS;
  const r2 = r * r;

  for (const ft of fireTiles) {
    const pos = ft.mesh.position;

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e === ft.owner) continue;

      const ep = e.mesh.position;
      const dx = ep.x - pos.x;
      const dz = ep.z - pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > r2) continue;

      const dmg = FIRE_BURN_DAMAGE_PER_TICK;
      spawnDamageText(dmg, ep, now);

      e.hp -= dmg;
      setEnemyColor(e, 0xff6600);
      e.flashEndTime = Math.max(e.flashEndTime, now + 150);

      if (e.hp <= 0) {
        if (e.sniperLine) scene.remove(e.sniperLine);
        scene.remove(e.mesh);
        enemies.splice(i, 1);
      }
    }
  }
}

// ===== 敌人移动 / 碰撞 / 伤害玩家 =====
export function updateEnemies(now, options) {
  const {
    isGameOver,
    isWaveComplete,
    isSafeWave,
    isRolling,
    onPlayerDamaged,
  } = options;

  trySpawnEnemy(now, isSafeWave);

  // --- 1. 敌人朝玩家移动 + 朝向（包含自爆 & 狙击 & AoE 小兵特殊逻辑） ---
  for (const e of enemies) {
    const enemy = e.mesh;
    const toPlayer = player.position.clone().sub(enemy.position);
    toPlayer.y = 0;
    const distSq = toPlayer.lengthSq();

    // ===== 自爆兵逻辑 =====
    if (e.isBomber) {
      const triggerR = e.triggerRadius || 0;
      const triggerR2 = triggerR * triggerR;

      if (e.isArming) {
        // 已进入引爆阶段：停下，只面向玩家
        if (distSq > 1e-6) {
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }
      } else {
        // 未进入引爆阶段：判断是否进入触发半径
        if (triggerR > 0 && distSq <= triggerR2) {
          e.isArming = true;
          e.armStartTime = now;
        } else if (distSq > 1e-6) {
          // 还没进入触发半径：正常追玩家
          toPlayer.normalize();
          const step = e.speed || 0.6;
          enemy.position.add(toPlayer.multiplyScalar(step));
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }
      }
      continue;
    }

    // ===== 狙击兵逻辑 =====
    if (e.isSniper) {
      const aimRadius = e.sniperAimRadius || 0;
      const aimRadius2 = aimRadius * aimRadius;

      if (e.sniperState === "approach") {
        // 接近阶段：移动靠近玩家
        if (distSq > 1e-6) {
          toPlayer.normalize();
          const step = e.speed || 0.3;
          enemy.position.add(toPlayer.multiplyScalar(step));
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }
        // 玩家进入射击距离 且 冷却结束 -> 开始瞄准
        const canAttack =
          now >= e.sniperLastAttackTime + e.sniperFireIntervalMs;
        if (aimRadius > 0 && distSq <= aimRadius2 && canAttack) {
          e.sniperState = "aiming";
          e.sniperAimStartTime = now;
          if (e.sniperLine) {
            e.sniperLine.visible = true;
          }
        }
      } else if (e.sniperState === "aiming") {
        // 瞄准阶段：不移动，只转向玩家 + 绘制红线
        if (distSq > 1e-6) {
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }

        const elapsed = now - e.sniperAimStartTime;

        // 更新辅助线
        if (e.sniperLine) {
          const start = enemy.position.clone();
          start.y += 1.5;
          const end = player.position.clone();
          end.y += 1.5;
          e.sniperLine.geometry.setFromPoints([start, end]);

          const mat = e.sniperLine.material;
          if (elapsed < e.sniperWarnTimeMs) {
            // 前 0.7 秒：常亮红色
            mat.color.set(0xff0000);
          } else {
            // 之后 0.3 秒：红白闪烁
            const blinkPhase = Math.floor(
              (elapsed - e.sniperWarnTimeMs) / 100
            );
            if (blinkPhase % 2 === 0) {
              mat.color.set(0xff0000);
            } else {
              mat.color.set(0xffffff);
            }
          }
        }

        // 满 1 秒：开枪（发射实体子弹）
        if (elapsed >= e.sniperAimDurationMs) {
          if (!isGameOver && !isWaveComplete && !isSafeWave) {
            spawnSniperBullet(e);
          }
          e.sniperLastAttackTime = now;
          e.sniperState = "cooldown";
          if (e.sniperLine) {
            e.sniperLine.visible = false;
          }
        }
      } else if (e.sniperState === "cooldown") {
        // 冷却 + 追击阶段：移动追玩家
        if (distSq > 1e-6) {
          toPlayer.normalize();
          const step = e.speed || 0.3;
          enemy.position.add(toPlayer.multiplyScalar(step));
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }

        // 冷却结束后，回到“approach”状态
        if (now >= e.sniperLastAttackTime + e.sniperFireIntervalMs) {
          e.sniperState = "approach";
        }
      }

      continue;
    }

    // ===== 地面 AoE 小兵逻辑（6 号） =====
    if (e.isGroundCaster) {
      const castR = e.groundCastRadius || 0;
      const castR2 = castR * castR;

      if (e.groundCastState === "approach") {
        if (distSq > 1e-6) {
          toPlayer.normalize();
          const step = e.speed || 0.5;
          enemy.position.add(toPlayer.multiplyScalar(step));
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }

        // 进入施法触发距离
        if (castR > 0 && distSq <= castR2) {
          e.groundCastState = "aiming";
          e.groundAimStartTime = now;
        }
      } else if (e.groundCastState === "aiming") {
        // 瞄准阶段：停止移动，只转向玩家
        if (distSq > 1e-6) {
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }

        const elapsed = now - e.groundAimStartTime;
        // 到 1 秒时，在玩家脚下放 AoE，然后进入 cooldown
        if (elapsed >= 1000) {
          const center = new THREE.Vector3(
            player.position.x,
            0,
            player.position.z
          );
          const aoeRadius = e.groundAoeRadius || 0;
          spawnGroundAoe(center, aoeRadius, now);

          e.groundLastCastTime = now;
          e.groundCastState = "cooldown";
        }
      } else if (e.groundCastState === "cooldown") {
        // 冷却阶段：照常追玩家
        if (distSq > 1e-6) {
          toPlayer.normalize();
          const step = e.speed || 0.5;
          enemy.position.add(toPlayer.multiplyScalar(step));
          const angle = Math.atan2(
            player.position.x - enemy.position.x,
            player.position.z - enemy.position.z
          );
          enemy.rotation.y = angle;
        }

        // 冷却结束再回到 approach，等待下一次进入触发范围
        if (now >= e.groundLastCastTime + e.groundCastIntervalMs) {
          e.groundCastState = "approach";
        }
      }

      continue;
    }

    // ===== 普通怪：直接追玩家 =====
    if (distSq > 1e-6) {
      toPlayer.normalize();
      const step = e.speed || 0.6;
      enemy.position.add(toPlayer.multiplyScalar(step));
      const angle = Math.atan2(
        player.position.x - enemy.position.x,
        player.position.z - enemy.position.z
      );
      enemy.rotation.y = angle;
    }

    // 火焰子弹：处于“留火”时间内的敌人，每隔一段时间在脚下生成火焰
    if (
      fireTrailBuffEnabled &&
      e.fireTrailEndTime &&
      now <= e.fireTrailEndTime
    ) {
      if (!e.nextFireTrailSpawnTime || now >= e.nextFireTrailSpawnTime) {
        const tileMesh = new THREE.Mesh(fireTileGeometry, fireTileMaterial);
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.position.set(enemy.position.x, 0.01, enemy.position.z);
        scene.add(tileMesh);

        fireTiles.push({
          mesh: tileMesh,
          expireTime: now + FIRE_TILE_LIFETIME,
          owner: e,
        });

        e.nextFireTrailSpawnTime = now + FIRE_TRAIL_SPAWN_INTERVAL;
      }
    }
  }

  // --- 2. 敌人之间分离 ---
  const minEnemyDist = ENEMY_COLLISION_RADIUS * 2;
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const e1 = enemies[i].mesh;
      const e2 = enemies[j].mesh;

      const diff = new THREE.Vector3().subVectors(e2.position, e1.position);
      diff.y = 0;
      const dist = diff.length();

      if (dist > 0 && dist < minEnemyDist) {
        const overlap = (minEnemyDist - dist) * 0.5;
        diff.normalize();
        e1.position.addScaledVector(diff, -overlap);
        e2.position.addScaledVector(diff, overlap);
      }
    }
  }

  let playerShouldBeSlowed = false;
  let slowFactor = 1.0;

  // --- 3. 边界 / 颜色恢复 / 玩家伤害 / 自爆结算 ---
  for (const e of enemies) {
    const enemy = e.mesh;

    // 被子弹击中后的变白恢复
    if (e.flashEndTime > 0 && now >= e.flashEndTime) {
      if (e.baseColor) {
        restoreEnemyBaseColor(e);
      }
      e.flashEndTime = 0;
    }

    const enemyHalf = innerHalfSize - ENEMY_COLLISION_RADIUS;
    enemy.position.x = THREE.MathUtils.clamp(
      enemy.position.x,
      -enemyHalf,
      enemyHalf
    );
    enemy.position.z = THREE.MathUtils.clamp(
      enemy.position.z,
      -enemyHalf,
      enemyHalf
    );


// 🐭 Tail sway: swing left-right only when moving
if (e.tailPivot) {
  const prev = e.prevPosXZ || new THREE.Vector2(enemy.position.x, enemy.position.z);
  const mdx = enemy.position.x - prev.x;
  const mdz = enemy.position.z - prev.y;
  const moved = mdx * mdx + mdz * mdz > 1e-6;

  e.prevPosXZ = new THREE.Vector2(enemy.position.x, enemy.position.z);

  if (moved) {
    e.tailPhase = (e.tailPhase || 0) + 0.25;
    e.tailPivot.rotation.y = Math.sin(e.tailPhase) * 0.7;
  } else {
    e.tailPivot.rotation.y *= 0.85;
  }
}

    const dx = enemy.position.x - player.position.x;
    const dz = enemy.position.z - player.position.z;
    const distSq = dx * dx + dz * dz;
    const touchDist = ENEMY_COLLISION_RADIUS + PLAYER_COLLISION_RADIUS;
    const isTouchingPlayer = distSq <= touchDist * touchDist;

    // 自爆兵：0.5 秒后爆炸
    if (
      e.isBomber &&
      e.isArming &&
      !isGameOver &&
      !isWaveComplete &&
      !isSafeWave
    ) {
      const delay = e.explodeDelayMs || 500;
      if (now >= e.armStartTime + delay) {
        const radius = e.explosionRadius || 0;
        const r2 = radius * radius;

        spawnBomberExplosionVisual(enemy.position, radius, now);

        if (radius > 0 && distSq <= r2) {
          if (onPlayerDamaged) {
            onPlayerDamaged(e.damage ?? 2);
          }
        }

        e.toRemove = true;
        continue;
      }
    }

    // 普通怪贴身攻击（不包括自爆 / 狙击 / 地面 AoE 小兵）
    if (
      !e.isBomber &&
      !e.isSniper &&
      !e.isGroundCaster &&
      isTouchingPlayer &&
      !isGameOver
    ) {
      if (!isRolling && !isWaveComplete && !isSafeWave) {
        playerShouldBeSlowed = true;
        slowFactor = Math.min(slowFactor, 0.6);

        const interval = e.attackIntervalMs || 300;
        if (e.nextDamageTime === 0) {
          e.nextDamageTime = now + interval;
        } else if (now >= e.nextDamageTime) {
          if (onPlayerDamaged) {
            onPlayerDamaged(e.damage ?? 1);
          }
          e.nextDamageTime = now + interval;
        }
      } else {
        e.nextDamageTime = 0;
      }
    } else if (!e.isBomber && !e.isSniper && !e.isGroundCaster) {
      e.nextDamageTime = 0;
    }

    // 与玩家分离（避免重叠）
    if (distSq > 0 && distSq < touchDist * touchDist) {
      const dist = Math.sqrt(distSq);
      const overlap = touchDist - dist;
      const nx = dx / dist;
      const nz = dz / dist;
      enemy.position.x += nx * overlap;
      enemy.position.z += nz * overlap;
    }
  }

  // --- 4. 清理需要移除的敌人（例如自爆结束） ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].toRemove) {
      if (enemies[i].sniperLine) scene.remove(enemies[i].sniperLine);
      scene.remove(enemies[i].mesh);
      enemies.splice(i, 1);
    }
  }

  // --- 5. 更新狙击子弹 & 自爆圈 & 地面 AoE ---
  updateSniperBullets(now, onPlayerDamaged);
  updateBomberExplosions(now);
  const playerInGroundAoe = updateGroundAoes(now, onPlayerDamaged);

  if (playerInGroundAoe) {
    playerShouldBeSlowed = true;
    slowFactor = Math.min(slowFactor, 0.75);
  }

  // BUFF DOT & 伤害飘字更新
  applyBleedDamage(now);
  applyFireDamage(now);
  updateDamageTexts(now);

  return { playerShouldBeSlowed, slowFactor };
}
