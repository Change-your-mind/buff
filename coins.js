// coins.js
import * as THREE from "three";

let scene, player, coinElement;
const coins = [];

let coinCount = 0;

const COIN_ATTRACT_RADIUS = 8;
const COIN_COLLECT_RADIUS = 1.0;
const COIN_SPEED = 0.4;

const coinGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const coinMaterial = new THREE.MeshPhongMaterial({ color: 0xffa500 });

export function initCoins(sceneRef, playerRef, coinElementRef) {
  scene = sceneRef;
  player = playerRef;
  coinElement = coinElementRef;
  coinCount = 0;
  updateCoinDisplay();
}

function updateCoinDisplay() {
  if (coinElement) {
    coinElement.textContent = `Coins: ${coinCount}`;
  }
}

export function getCoinCount() {
  return coinCount;
}

export function setCoinCount(v) {
  coinCount = v;
  updateCoinDisplay();
}

export function addCoins(amount) {
  coinCount += amount;
  updateCoinDisplay();
}

// 敌人死亡时掉落
export function spawnCoinAtPosition(pos) {
  if (!scene) return;
  const coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
  coinMesh.position.set(pos.x, 0.5, pos.z);
  scene.add(coinMesh);
  coins.push({ mesh: coinMesh });
}

// 每帧更新金币吸附 & 收集
export function updateCoins(isLastSecond) {
  if (!scene || !player) return;

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const cp = c.mesh.position;

    const dx = player.position.x - cp.x;
    const dz = player.position.z - cp.z;
    const distSq = dx * dx + dz * dz;

    // 吸附逻辑
    if (isLastSecond || distSq < COIN_ATTRACT_RADIUS * COIN_ATTRACT_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const step = COIN_SPEED;
      cp.x += (dx / dist) * step;
      cp.z += (dz / dist) * step;
      cp.y = 0.5;
    }

    // 收集
    if (distSq < COIN_COLLECT_RADIUS * COIN_COLLECT_RADIUS) {
      coinCount += 1;
      updateCoinDisplay();
      scene.remove(c.mesh);
      coins.splice(i, 1);
    }
  }
}

// 波次结束：把场上所有金币直接收集
export function collectAllCoinsImmediately() {
  if (!scene) return;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    coinCount += 1;
    scene.remove(c.mesh);
    coins.splice(i, 1);
  }
  updateCoinDisplay();
}

// 重置（用于 Restart）
export function resetCoins(sceneRef) {
  for (const c of coins) {
    sceneRef.remove(c.mesh);
  }
  coins.length = 0;
  coinCount = 0;
  updateCoinDisplay();
}
