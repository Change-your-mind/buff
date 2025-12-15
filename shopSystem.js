// shopSystem.js
import * as THREE from "three";

import {
  getRandomBuffChoices,
  formatBuffText,
  applyBuffToGame,
  RARITY,
  RARITY_META,
} from "./buff.js";

let shopOverlay;
let shopCloseBtn;
let shopButtons = [];
let shopRefreshBtn;

let shopGroup;
let shopRedTile;
let shopGreenTile;
let player;
let scene;

let getCoinCount;
let addCoins;
let getHP;
let addHP;
let increaseMaxHPFunc;

let getScatterBulletCount;
let upgradeScatterFunc;

let upgradeRicochetFunc;
let upgradeRocketFunc;
let upgradeStickyFunc;
let upgradeBleedFunc;
let upgradeSlowFunc;
let upgradeGravityFunc;
let upgradePierceFunc;
let upgradeFireTrailFunc;  // 🔥 敌人留火逻辑
let upgradeFireBulletFunc; // 🔥 子弹变红逻辑
let upgradeRollCooldownFunc;
let upgradeProjectileSpeedFunc;
let upgradeCritChanceFunc; // ⭐ 暴击率提升

let getMaxHP;
let getFireTrailDurationMs;
let getRollCooldownMs;
let upgradeFireRateFunc;

let onRequestNextWaveFromSafe;

let isShopOpened = false;
let currentShopBuffs = [];
const ownedBuffs = [];

// 价格
const REFRESH_COST = 3;
const BUFF_COST = {
  [RARITY.LEVEL1]: 10,
  [RARITY.LEVEL2]: 15,
  [RARITY.LEVEL3]: 18,
  [RARITY.LEVEL4]: 20,
};

export function initShopSystem(options) {
  shopOverlay = options.shopOverlay;
  shopCloseBtn = options.shopCloseBtn;
  shopButtons = options.shopOptButtons || [];
  shopRefreshBtn = options.shopRefreshBtn;

  shopGroup = options.shopGroup;
  shopRedTile = options.shopRedTile;
  shopGreenTile = options.shopGreenTile;
  player = options.player;
  scene = options.scene;

  getCoinCount = options.getCoinCount;
  addCoins = options.addCoins;
  getHP = options.getHP;
  addHP = options.addHP;
  increaseMaxHPFunc = options.increaseMaxHP;

  getScatterBulletCount = options.getScatterBulletCount;
  upgradeScatterFunc = options.upgradeScatter;

  upgradeRicochetFunc = options.upgradeRicochet;
  upgradeRocketFunc = options.upgradeRocket;
  upgradeStickyFunc = options.upgradeSticky;
  upgradeBleedFunc = options.upgradeBleed;
  upgradeSlowFunc = options.upgradeSlow;
  upgradeGravityFunc = options.upgradeGravity;
  upgradeFireTrailFunc = options.upgradeFireTrail;
  upgradeFireBulletFunc = options.upgradeFireBullet;
  upgradePierceFunc = options.upgradePierce;
  upgradeRollCooldownFunc = options.upgradeRollCooldown;
  upgradeProjectileSpeedFunc = options.upgradeProjectileSpeed;
  upgradeCritChanceFunc = options.upgradeCritChance; // ⭐ 暴击率

  getMaxHP = options.getMaxHP;
  getFireTrailDurationMs = options.getFireTrailDurationMs;
  getRollCooldownMs = options.getRollCooldownMs;
  upgradeFireRateFunc = options.upgradeFireRate;
  onRequestNextWaveFromSafe = options.onRequestNextWaveFromSafe;

  if (shopCloseBtn) {
    shopCloseBtn.addEventListener("click", () => {
      closeShop();
    });
  }

  if (shopRefreshBtn) {
    shopRefreshBtn.addEventListener("click", () => {
      handleRefresh();
    });
  }

  shopButtons.forEach((btn, index) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
      chooseBuff(index);
    });
  });

  resetShop();
}

export function isShopOpen() {
  return isShopOpened;
}

export function resetShop() {
  isShopOpened = false;
  currentShopBuffs = [];
  if (shopOverlay) shopOverlay.style.display = "none";

  shopButtons.forEach((btn) => {
    if (!btn) return;
    btn.disabled = false;
    btn.style.backgroundColor = "";
    btn.style.borderColor = "";
    btn.style.color = "";
    btn.textContent = "暂无增益";
  });
}

function openShop() {
  if (!shopOverlay || isShopOpened) return;
  isShopOpened = true;
  rollShopOptions();
  shopOverlay.style.display = "flex";
}

function closeShop() {
  if (!shopOverlay || !isShopOpened) return;
  isShopOpened = false;
  shopOverlay.style.display = "none";
}

function handleRefresh() {
  if (!getCoinCount || !addCoins) return;
  const coins = getCoinCount();
  if (coins < REFRESH_COST) {
    console.log("金币不足，无法刷新商店");
    return;
  }
  addCoins(-REFRESH_COST);
  console.log("消耗 3 金币刷新商店选项");
  rollShopOptions();
}

function rollShopOptions() {
  currentShopBuffs = getRandomBuffChoices(3);

  for (let i = 0; i < shopButtons.length; i++) {
    const btn = shopButtons[i];
    if (!btn) continue;

    const buff = currentShopBuffs[i];
    if (buff) {
      btn.disabled = false;
      btn.textContent = formatBuffText(buff);

      const meta = RARITY_META[buff.rarity];
      if (meta && meta.color) {
        btn.style.backgroundColor = meta.color;
        btn.style.borderColor = meta.color;
        btn.style.color = "#ffffff";
      } else {
        btn.style.backgroundColor = "";
        btn.style.borderColor = "";
        btn.style.color = "";
      }
    } else {
      btn.disabled = true;
      btn.textContent = "暂无增益";
      btn.style.backgroundColor = "";
      btn.style.borderColor = "";
      btn.style.color = "";
    }
  }
}

function chooseBuff(index) {
  const buff = currentShopBuffs[index];
  if (!buff) return;

  const btn = shopButtons[index];
  if (!btn) return;
  if (btn.disabled) return;

  // 散射上限检查
  if (
    buff.id === "scatter_lv3" &&
    getScatterBulletCount &&
    getScatterBulletCount() >= 36
  ) {
    console.log("散射弹道数已达上限，无法继续购买该 BUFF");
    return;
  }

  // ★ 血量上限 BUFF 上限检查（maxhp_lv1）
  if (buff.id === "maxhp_lv1" && typeof getMaxHP === "function") {
    const maxHP = getMaxHP();
    if (maxHP >= 30) {
      console.log("血量上限已达最大值，无法继续购买该 BUFF");
      return;
    }
  }

  // ★ 火焰子弹 BUFF 上限检查（fire_lv2）
  if (
    buff.id === "fire_lv2" &&
    typeof getFireTrailDurationMs === "function"
  ) {
    const durationMs = getFireTrailDurationMs(); // 当前火焰持续时间（毫秒）
    if (durationMs >= 4000) { // 4 秒 = 4000ms
      console.log("火焰持续时间已达上限，无法继续购买该 BUFF");
      return;
    }
  }

    // ★ 翻滚冷却 BUFF 上限检查（rollcd_lv1）
  if (
    buff.id === "rollcd_lv1" &&
    typeof getRollCooldownMs === "function"
  ) {
    const cdMs = getRollCooldownMs(); // 当前翻滚冷却（毫秒）
    if (cdMs <= 1000) { // 已经是 1 秒或更低
      console.log("翻滚冷却时间已达最小值，无法继续购买该 BUFF");
      return;
    }
  }


  if (!getCoinCount || !addCoins) return;
  const cost = BUFF_COST[buff.rarity] ?? 0;
  const coins = getCoinCount();
  if (coins < cost) {
    console.log("金币不足，无法购买该增益");
    return;
  }

  addCoins(-cost);
  ownedBuffs.push(buff);

  const gameCtx = {
    player,
    scene,
    coinCount: getCoinCount ? getCoinCount() : 0,
    hp: getHP ? getHP() : 0,
    ownedBuffs,
    addCoins(amount) {
      if (addCoins) addCoins(amount);
    },
    addHP(amount) {
      if (addHP) addHP(amount);
    },
    increaseMaxHP(delta, cap) {
      if (increaseMaxHPFunc) increaseMaxHPFunc(delta, cap);
    },

    getScatterBulletCount: () =>
      getScatterBulletCount ? getScatterBulletCount() : 1,
    upgradeScatter: () => {
      if (upgradeScatterFunc) upgradeScatterFunc();
    },

    upgradeRicochet: () => {
      if (upgradeRicochetFunc) upgradeRicochetFunc();
    },
    upgradeRocket: () => {
      if (upgradeRocketFunc) upgradeRocketFunc();
    },
    upgradeSticky: () => {
      if (upgradeStickyFunc) upgradeStickyFunc();
    },
    upgradeBleed: () => {
      if (upgradeBleedFunc) upgradeBleedFunc();
    },
    upgradeSlow: () => {
      if (upgradeSlowFunc) upgradeSlowFunc();
    },
    upgradeGravity: () => {
      if (upgradeGravityFunc) upgradeGravityFunc();
    },
    upgradeFireTrail: () => {
      if (upgradeFireTrailFunc) upgradeFireTrailFunc();
    },
    upgradeFireBullet: () => {
      if (upgradeFireBulletFunc) upgradeFireBulletFunc();
    },
    upgradePierce: () => {
      if (upgradePierceFunc) upgradePierceFunc();
    },
    upgradeRollCooldown: () => {
      if (upgradeRollCooldownFunc) upgradeRollCooldownFunc();
    },
    upgradeProjectileSpeed: () => {
      if (upgradeProjectileSpeedFunc) upgradeProjectileSpeedFunc();
    },
    upgradeFireRate: () => {
      if (upgradeFireRateFunc) upgradeFireRateFunc();
    },
    upgradeCritChance: () => {
      if (upgradeCritChanceFunc) upgradeCritChanceFunc();
    },

  };

  applyBuffToGame(buff, gameCtx);

  btn.disabled = true;
  btn.textContent = formatBuffText(buff) + "（已购买）";
  btn.style.backgroundColor = "#555555";
  btn.style.borderColor = "#555555";
  btn.style.color = "#aaaaaa";
}

// 安全波次中，按 F 交互红/绿地板
export function handleShopInteractInSafeWave(now) {
  if (!player || !shopRedTile || !shopGreenTile) return;
  if (isShopOpened) return;

  const INTERACT_RADIUS = 3.0;

  const playerPos = player.position.clone();
  const redWorld = new THREE.Vector3();
  const greenWorld = new THREE.Vector3();
  shopRedTile.getWorldPosition(redWorld);
  shopGreenTile.getWorldPosition(greenWorld);

  const distRedSq = playerPos.distanceToSquared(redWorld);
  const distGreenSq = playerPos.distanceToSquared(greenWorld);

  if (distRedSq <= INTERACT_RADIUS * INTERACT_RADIUS) {
    // 红地板：打开商店
    openShop();
  } else if (distGreenSq <= INTERACT_RADIUS * INTERACT_RADIUS) {
    // 绿地板：请求进入下一波次
    if (typeof onRequestNextWaveFromSafe === "function") {
      onRequestNextWaveFromSafe(now);
    }
  }
}
