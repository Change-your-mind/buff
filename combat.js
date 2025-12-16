// combat.js
import * as THREE from "three";

let scene, player, camera, raycaster, mouseNDC;
let hasMouseGetter;
let getGameState; // () => { isGameStarted, isGameOver, isWaveComplete, isShopOpen }
let onBulletHitEnemy; // (bp, now, hitRadius, damage, explosionRadius, splashFactor) => hitResult
let innerHalfSize;

// 子弹数组
const bullets = [];
const BULLET_SPEED = 1.2; // 基础弹速

// 通过全局的倍率来计算当前真实弹速（倍率在 main.js 里改）
function getBulletSpeed() {
  const mul = window.projectileSpeedMultiplier ?? 1.0;
  return BULLET_SPEED * mul;
}

const BULLET_MAX_DISTANCE = 300;
const BULLET_HIT_RADIUS = 2.0;

const bulletGeom = new THREE.SphereGeometry(0.25, 8, 8);
const bulletMatNormal = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const bulletMatRocket = new THREE.MeshBasicMaterial({ color: 0xff5522 });
const bulletMatFire = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // 🔥 火焰子弹材质

// ===== 火焰子弹相关 =====
let fireBulletEnabled = false;

// ===== 散射相关 =====
let scatterBulletCount = 1;
const SCATTER_ANGLE_DEG = 10;
const SCATTER_MAX_BULLETS = 36;

// ===== 弹射（墙体反弹）相关 =====
let ricochetEnabled = false;
let ricochetBounces = 0; // 一发子弹最大反弹次数（由 BUFF 决定）
const RICOCHET_DAMAGE_FALLOFF = 0.75; // 现阶段未使用，保留

// ===== 穿透相关 =====
let pierceEnabled = false;
let pierceCount = 0;

// ===== 火箭弹相关 =====
let rocketEnabled = false;
let rocketLevel = 0;
const ROCKET_BASE_EXPLOSION_RADIUS = 8; // 小怪长度 4 * 2
const ROCKET_BASE_DIRECT_MULTIPLIER = 1.0;
const ROCKET_SPLASH_FACTOR = 0.8; // 范围伤害 80%

let rocketExplosionRadius = 0;
let rocketDirectMultiplier = 1.0;

// 自动连发：基础间隔 + 可被 BUFF 修改的射击频率
const BASE_FIRE_INTERVAL = 500; // 0.5 秒，基础攻击间隔
let fireRateMultiplier = 1.0; // 射击频率倍率（1.0 = 不加成）

let isShooting = false;
let lastShotTime = -Infinity;

// 基础伤害
const BASE_BULLET_DAMAGE = 1;

// ✅ NEW：读取 Tier1 的基础伤害加成（buff.js 会写 window.baseDamageBonus）
function getBaseDamageBonus() {
  return typeof window.baseDamageBonus === "number" ? window.baseDamageBonus : 0;
}

// ===== 初始绑定 =====
export function initCombat(options) {
  scene = options.scene;
  player = options.player;
  camera = options.camera;
  raycaster = options.raycaster;
  mouseNDC = options.mouseNDC;
  hasMouseGetter = options.hasMouseGetter;
  getGameState = options.getGameState;
  onBulletHitEnemy = options.onBulletHitEnemy;
  innerHalfSize = options.innerHalfSize;
}

// ========== 散射相关 ==========
export function getScatterBulletCount() {
  return scatterBulletCount;
}

export function upgradeScatter() {
  let current = scatterBulletCount;

  if (current >= SCATTER_MAX_BULLETS) {
    console.log("[BUFF] 散射已达最大弹道数：", SCATTER_MAX_BULLETS);
    return;
  }

  if (current === 1) {
    current += 2;
  } else {
    current += 1;
  }

  if (current > SCATTER_MAX_BULLETS) {
    current = SCATTER_MAX_BULLETS;
  }

  scatterBulletCount = current;
  console.log("[BUFF] 散射升级，当前弹道数 =", scatterBulletCount);
}

// ========== 弹射（墙体反弹）相关 ==========
export function getRicochetBounceCount() {
  return ricochetEnabled ? ricochetBounces : 0;
}

export function upgradeRicochet() {
  if (!ricochetEnabled) {
    ricochetEnabled = true;
    ricochetBounces = 2;
  } else {
    ricochetBounces += 1;
  }
  console.log("[BUFF] 弹射升级，最大墙体反弹次数 =", ricochetBounces);
}

// ========== 穿透相关 ==========
export function upgradePierce() {
  if (!pierceEnabled) {
    pierceEnabled = true;
    pierceCount = 2;
  } else {
    pierceCount += 1;
  }
  console.log("[BUFF] 穿透子弹升级，每发子弹可穿透次数 =", pierceCount);
}

// ========== 火箭弹相关 ==========
function recomputeRocketStats() {
  if (!rocketEnabled || rocketLevel <= 0) {
    rocketExplosionRadius = 0;
    rocketDirectMultiplier = 1.0;
    return;
  }

  const extraLevel = rocketLevel - 1;
  rocketExplosionRadius =
    ROCKET_BASE_EXPLOSION_RADIUS * (1 + 0.25 * extraLevel);
  rocketDirectMultiplier =
    ROCKET_BASE_DIRECT_MULTIPLIER * (1 + 0.1 * extraLevel);

  console.log(
    "[BUFF] 火箭弹等级 =",
    rocketLevel,
    "爆炸半径 =",
    rocketExplosionRadius.toFixed(2),
    "直击伤害倍率 =",
    rocketDirectMultiplier.toFixed(2)
  );
}

export function upgradeRocket() {
  rocketEnabled = true;
  rocketLevel += 1;
  recomputeRocketStats();
}

// ========== 火焰子弹：只负责子弹外观 ==========
export function upgradeFireBullet() {
  if (!fireBulletEnabled) {
    console.log("[BUFF] 火焰子弹启用，子弹变为红色");
  } else {
    console.log("[BUFF] 再次购买火焰子弹（持续时间由敌人模块控制）");
  }
  fireBulletEnabled = true;
}

// ========== 射击频率（攻速）相关 ==========
export function upgradeFireRate() {
  if (fireRateMultiplier === 1.0) {
    fireRateMultiplier += 0.10;
  } else {
    fireRateMultiplier += 0.05;
  }
  console.log("[BUFF] 射击频率提升，当前倍率 =", fireRateMultiplier.toFixed(2));
}

// ========== 鼠标输入 ==========
export function handleMouseDown(button) {
  if (button !== 0) return; // 左键
  isShooting = true;
  const now = performance.now();
  tryShootBullet(now);
}

export function handleMouseUp(button) {
  if (button !== 0) return;
  isShooting = false;
}

export function handleMouseLeaveCanvas() {
  isShooting = false;
}

// ========== 射击逻辑 ==========
function tryShootBullet(now) {
  if (!hasMouseGetter || !hasMouseGetter()) return;
  const state = getGameState ? getGameState() : null;
  if (!state) return;

  const { isGameStarted, isGameOver, isWaveComplete, isShopOpen } = state;

  if (!isGameStarted || isGameOver || isWaveComplete || isShopOpen) {
    return;
  }

  const currentInterval = BASE_FIRE_INTERVAL / fireRateMultiplier;
  if (now - lastShotTime < currentInterval) return;
  lastShotTime = now;

  // 射线计算目标点（落在地面 y=0）
  raycaster.setFromCamera(mouseNDC, camera);
  const origin = raycaster.ray.origin.clone();
  const dirRay = raycaster.ray.direction.clone();
  const t = (0 - origin.y) / dirRay.y;
  if (t <= 0) return;
  const hit = origin.add(dirRay.multiplyScalar(t));

  // 基础方向
  const baseDir = hit.clone().sub(player.position);
  baseDir.y = 0;
  if (baseDir.lengthSq() < 1e-6) return;
  baseDir.normalize();

  // ✅ NEW：基础伤害 = 原本基础伤害 + Tier1加成（兼容所有攻击方式）
  let baseDamage = BASE_BULLET_DAMAGE + getBaseDamageBonus();

  const useRocket = rocketEnabled;
  if (useRocket) {
    baseDamage *= rocketDirectMultiplier;
  }

  // 散射：围绕 Y 轴旋转
  const count = scatterBulletCount;
  const angleStepRad = (SCATTER_ANGLE_DEG * Math.PI) / 180;
  const centerIndex = (count - 1) / 2;

  for (let i = 0; i < count; i++) {
    const offset = (i - centerIndex) * angleStepRad;
    const cos = Math.cos(offset);
    const sin = Math.sin(offset);

    const dirRot = new THREE.Vector3(
      baseDir.x * cos - baseDir.z * sin,
      0,
      baseDir.x * sin + baseDir.z * cos
    ).normalize();

    const spawnPos = player.position.clone();
    spawnPos.y += 1;
    spawnPos.add(dirRot.clone().multiplyScalar(2.0));

    // ✅ 修复：真正用 bulletMaterial（否则火焰子弹不会变红）
    let bulletMaterial;
    if (useRocket) {
      bulletMaterial = bulletMatRocket;
    } else if (fireBulletEnabled) {
      bulletMaterial = bulletMatFire;
    } else {
      bulletMaterial = bulletMatNormal;
    }

    const bulletMesh = new THREE.Mesh(bulletGeom, bulletMaterial);
    bulletMesh.position.copy(spawnPos);
    scene.add(bulletMesh);

    const bullet = {
      mesh: bulletMesh,
      dir: dirRot,
      distance: 0,

      // 子弹特性
      isRocket: useRocket,

      // ⭐ 还能在墙上反弹几次
      ricochetRemaining: ricochetEnabled ? getRicochetBounceCount() : 0,

      damage: baseDamage,
      explosionRadius: useRocket ? rocketExplosionRadius : 0,
      splashFactor: useRocket ? ROCKET_SPLASH_FACTOR : 0,
    };

    // ⭐ 穿透：普通子弹 + 火箭弹都可以吃穿透
    if (pierceEnabled) {
      bullet.pierceRemaining = pierceCount;
    } else {
      bullet.pierceRemaining = 0;
    }

    bullets.push(bullet);
  }
}

export function updateShooting(now) {
  if (!isShooting) return;
  tryShootBullet(now);
}

// ========== 火箭爆炸特效：半球 + 由小到大，0.8 秒后消失 ==========
const explosions = [];
const EXPLOSION_DURATION = 800; // 0.8s

function spawnExplosionVisual(center, radius, now) {
  if (!scene || radius <= 0) return;

  const baseRadius = 1;
  const geom = new THREE.SphereGeometry(
    baseRadius,
    24,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2
  );
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(center.x, 0, center.z);

  const targetScale = radius / baseRadius;
  const initialScale = targetScale * 0.1;

  mesh.scale.set(initialScale, initialScale, initialScale);
  scene.add(mesh);

  explosions.push({
    mesh,
    material: mat,
    startTime: now,
    duration: EXPLOSION_DURATION,
    initialScale,
    targetScale,
  });
}

export function updateExplosions(now) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    const tRaw = (now - ex.startTime) / ex.duration;

    if (tRaw >= 1) {
      scene.remove(ex.mesh);
      ex.mesh.geometry.dispose();
      ex.material.dispose();
      explosions.splice(i, 1);
      continue;
    }

    const t = Math.max(0, Math.min(1, tRaw));
    const scale = ex.initialScale + (ex.targetScale - ex.initialScale) * t;
    ex.mesh.scale.set(scale, scale, scale);

    let alpha;
    if (t < 0.3) alpha = 0.9 * (t / 0.3);
    else {
      const k = (t - 0.3) / 0.7;
      alpha = 0.9 * (1 - k);
    }
    ex.material.opacity = alpha;
  }
}

// ========== 子弹更新（火箭爆炸 + 墙体反弹 + 敌人命中） ==========
export function updateBullets(now) {
  const wallInner = innerHalfSize;

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const speed = getBulletSpeed();
    b.mesh.position.add(b.dir.clone().multiplyScalar(speed));
    b.distance += speed;

    let removeBullet = false;
    let bp = b.mesh.position;

    const hitWall = Math.abs(bp.x) >= wallInner || Math.abs(bp.z) >= wallInner;

    if (hitWall) {
      if (b.isRocket && b.explosionRadius > 0) {
        spawnExplosionVisual(bp, b.explosionRadius, now);

        if (onBulletHitEnemy) {
          onBulletHitEnemy(
            bp,
            now,
            BULLET_HIT_RADIUS,
            b.damage,
            b.explosionRadius,
            b.splashFactor
          );
        }
      }

      if (b.ricochetRemaining > 0) {
        const epsilon = 0.01;
        const absX = Math.abs(bp.x);
        const absZ = Math.abs(bp.z);

        if (absX >= wallInner) {
          b.dir.x *= -1;
          bp.x = (bp.x > 0 ? 1 : -1) * (wallInner - epsilon);
        }

        if (absZ >= wallInner) {
          b.dir.z *= -1;
          bp.z = (bp.z > 0 ? 1 : -1) * (wallInner - epsilon);
        }

        b.ricochetRemaining -= 1;
        b.distance = 0;
      } else {
        removeBullet = true;
      }
    } else if (b.distance > BULLET_MAX_DISTANCE) {
      removeBullet = true;
    } else if (onBulletHitEnemy) {
      const hitResult = onBulletHitEnemy(
        bp,
        now,
        BULLET_HIT_RADIUS,
        b.damage,
        b.explosionRadius,
        b.splashFactor
      );

      if (hitResult && hitResult.hit) {
        if (hitResult.position) {
          b.mesh.position.copy(hitResult.position);
          bp = b.mesh.position;
        }

        if (b.explosionRadius > 0 && hitResult.position) {
          spawnExplosionVisual(hitResult.position, b.explosionRadius, now);
        }

        const canPierce =
          typeof b.pierceRemaining === "number" && b.pierceRemaining > 0;

        if (canPierce) {
          b.pierceRemaining -= 1;

          const pushDist = BULLET_HIT_RADIUS * 1.1;
          b.mesh.position.add(b.dir.clone().multiplyScalar(pushDist));
          b.distance += pushDist;
        } else {
          removeBullet = true;
        }
      }
    }

    if (removeBullet) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

// ========== 只清子弹（切换波次用，不清 BUFF） ==========
export function clearBulletsForWaveChange(sceneRef) {
  for (const b of bullets) {
    sceneRef.remove(b.mesh);
  }
  bullets.length = 0;

  for (const ex of explosions) {
    sceneRef.remove(ex.mesh);
    ex.mesh.geometry.dispose();
    ex.material.dispose();
  }
  explosions.length = 0;

  isShooting = false;
  lastShotTime = -Infinity;
}

// ========== 完整重置（Restart 用：子弹 + BUFF 全清） ==========
export function resetCombatState(sceneRef) {
  clearBulletsForWaveChange(sceneRef);

  scatterBulletCount = 1;

  ricochetEnabled = false;
  ricochetBounces = 0;

  rocketEnabled = false;
  rocketLevel = 0;
  recomputeRocketStats();

  fireBulletEnabled = false;

  pierceEnabled = false;
  pierceCount = 0;

  fireRateMultiplier = 1.0;
}
