// combat.js
import * as THREE from "three";

let scene, player, camera, raycaster, mouseNDC;
let hasMouseGetter;
let getGameState; // () => { isGameStarted, isGameOver, isWaveComplete, isShopOpen }
let onBulletHitEnemy; // (bp, now, hitRadius, damage, explosionRadius, splashFactor) => hitResult
let innerHalfSize;

// 子弹数组
const bullets = [];
const BULLET_SPEED = 1.2;        // 基础弹速

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
// 现在的含义：子弹撞到墙时，如果 ricochetRemaining > 0，就按照光反射角反弹。
// 第一次获得 BUFF：2 次反弹；之后每次购买：+1 次反弹
let ricochetEnabled = false;
let ricochetBounces = 0; // 一发子弹最大反弹次数（由 BUFF 决定）
const RICOCHET_DAMAGE_FALLOFF = 0.75; // 现阶段未使用，保留以便以后想让反弹后伤害衰减时用

// ===== 穿透相关 =====  ⭐ 新增
// pierceCount 表示每发子弹最多还能“穿透几次敌人”。
// 例如 pierceCount = 2 → 一发子弹最多命中 3 个敌人（2 次穿透）。
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
let fireRateMultiplier = 1.0;   // 射击频率倍率（1.0 = 不加成）

let isShooting = false;
let lastShotTime = -Infinity;


// 基础伤害
const BASE_BULLET_DAMAGE = 1;

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
    // 第一次：+2，变 3 发
    current += 2;
  } else {
    // 之后每次 +1
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
    // 第一次获得 BUFF：开启弹射，并给 2 次反弹
    ricochetEnabled = true;
    ricochetBounces = 2;
  } else {
    // 后续每次购买 +1 次反弹
    ricochetBounces += 1;
  }
  console.log("[BUFF] 弹射升级，最大墙体反弹次数 =", ricochetBounces);
}

// ========== 穿透相关 ==========  ⭐ 新增
export function upgradePierce() {
  if (!pierceEnabled) {
    // 第一次购买：开启穿透，并给予 2 次穿透
    pierceEnabled = true;
    pierceCount = 2;
  } else {
    // 之后每次购买 +1 次穿透
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
// 第一次 +10%，之后每次 +5%
export function upgradeFireRate() {
  if (fireRateMultiplier === 1.0) {
    // 第一次购买：+10%
    fireRateMultiplier += 0.10;
  } else {
    // 之后每次购买：+5%
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

  let baseDamage = BASE_BULLET_DAMAGE;

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

    // 选择材质：火箭弹优先保持自己的颜色，其次是火焰子弹（红色），否则为普通黄色
    let bulletMaterial;
    if (useRocket) {
      bulletMaterial = bulletMatRocket;
    } else if (fireBulletEnabled) {
      bulletMaterial = bulletMatFire;
    } else {
      bulletMaterial = bulletMatNormal;
    }

    const bulletMesh = new THREE.Mesh(
      bulletGeom,
      useRocket ? bulletMatRocket : bulletMatNormal
    );
    bulletMesh.position.copy(spawnPos);
    scene.add(bulletMesh);

    const bullet = {
      mesh: bulletMesh,
      dir: dirRot,
      distance: 0,

      // 子弹特性
      isRocket: useRocket,

      // ⭐ 现在的 ricochetRemaining：表示“还能在墙上反弹几次”
      ricochetRemaining: ricochetEnabled ? getRicochetBounceCount() : 0,

      damage: baseDamage,
      explosionRadius: useRocket ? rocketExplosionRadius : 0,
      splashFactor: useRocket ? ROCKET_SPLASH_FACTOR : 0,
    };

    // ⭐ 穿透：现在普通子弹 + 火箭弹都可以吃穿透
    if (pierceEnabled) {
      bullet.pierceRemaining = pierceCount; // 一发子弹最多可穿透 pierceCount 次
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

  // 生成上半球（y ∈ [0, 1]），原点在地面
  const baseRadius = 1;
  const geom = new THREE.SphereGeometry(
    baseRadius,
    24,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2 // 只要上半球
  );
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, mat);

  // 几何本身是 y∈[0,1] 的半球，所以直接放在 y=0 即“贴地”
  mesh.position.set(center.x, 0, center.z);

  // 半径要等于爆炸范围半径：最终缩放 = radius / baseRadius
  const targetScale = radius / baseRadius;
  const initialScale = targetScale * 0.1; // 初始 10% 大小

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
      // 0.8 秒结束，移除半球
      scene.remove(ex.mesh);
      ex.mesh.geometry.dispose();
      ex.material.dispose();
      explosions.splice(i, 1);
      continue;
    }

    const t = Math.max(0, Math.min(1, tRaw));

    // 尺寸：从 initialScale 线性放大到 targetScale
    const scale =
      ex.initialScale + (ex.targetScale - ex.initialScale) * t;
    ex.mesh.scale.set(scale, scale, scale);

    // 透明度：前 30% 渐显，后 70% 渐隐
    let alpha;
    if (t < 0.3) {
      alpha = 0.9 * (t / 0.3);
    } else {
      const k = (t - 0.3) / 0.7; // 0 ~ 1
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
    const speed = getBulletSpeed();  // ⭐ 这里读当前弹速
    b.mesh.position.add(b.dir.clone().multiplyScalar(speed));
    b.distance += speed;

    let removeBullet = false;
    let bp = b.mesh.position;

    // ====== 先检测是否撞墙（地图边界） ======
    const hitWall =
      Math.abs(bp.x) >= wallInner || Math.abs(bp.z) >= wallInner;

    if (hitWall) {
      // ⭐ 火箭弹：撞墙会爆炸（无论是否有弹射）
      if (b.isRocket && b.explosionRadius > 0) {
        spawnExplosionVisual(bp, b.explosionRadius, now);

        // 通知敌人模块执行爆炸伤害逻辑
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
        // ⭐ 有弹射次数 → 按光反射角反弹，并刷新存在时间
        const epsilon = 0.01;
        const absX = Math.abs(bp.x);
        const absZ = Math.abs(bp.z);

        // 撞左右墙：反转 x 方向，并把位置稍微夹回边界以内
        if (absX >= wallInner) {
          b.dir.x *= -1;
          bp.x =
            (bp.x > 0 ? 1 : -1) * (wallInner - epsilon);
        }

        // 撞上下墙：反转 z 方向，并把位置稍微夹回边界以内
        if (absZ >= wallInner) {
          b.dir.z *= -1;
          bp.z =
            (bp.z > 0 ? 1 : -1) * (wallInner - epsilon);
        }

        b.ricochetRemaining -= 1;

        // ⭐ 刷新存在时间：让子弹可以再飞一段完整距离
        b.distance = 0;

        // 子弹继续存在，不移除
      } else {
        // 没有反弹次数了，撞墙就消失（火箭已经在上面爆炸过了）
        removeBullet = true;
      }
    }
    // ====== 未撞墙：再检测是否飞太远 / 打到敌人 ======
    else if (b.distance > BULLET_MAX_DISTANCE) {
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
        // 命中后，把子弹位置校正到命中点（敌人中心 / 第一死亡点）
        if (hitResult.position) {
          b.mesh.position.copy(hitResult.position);
          bp = b.mesh.position;
        }

        // ⭐ 火箭弹命中敌人时：每次命中都爆一次
        //    普通子弹 explosionRadius = 0，不会生成爆炸特效
        if (b.explosionRadius > 0 && hitResult.position) {
          spawnExplosionVisual(hitResult.position, b.explosionRadius, now);
        }

        // ⭐ 穿透逻辑：
        //   无论普通子弹还是火箭弹，只要还有穿透次数，就继续往前飞；
        //   撞墙的逻辑仍然在上面，照样会被墙体挡住，不会穿墙。
        const canPierce =
          typeof b.pierceRemaining === "number" && b.pierceRemaining > 0;

        if (canPierce) {
          b.pierceRemaining -= 1;

          // 为避免下一帧再次命中同一个敌人，把子弹沿着前进方向稍微推远一点
          const pushDist = BULLET_HIT_RADIUS * 1.1;
          b.mesh.position.add(b.dir.clone().multiplyScalar(pushDist));
          b.distance += pushDist;

          // 子弹继续存在，不移除
        } else {
          // 没有穿透次数：命中敌人后子弹消失
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
  // 清空子弹
  for (const b of bullets) {
    sceneRef.remove(b.mesh);
  }
  bullets.length = 0;

  // 清空爆炸半球
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

  // 重置 BUFF 状态
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
