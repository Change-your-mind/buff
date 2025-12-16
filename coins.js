// coins.js — Cheese Coin + Texture Toggle Support
import * as THREE from "three";

let scene, player, coinElement;
const coins = [];

let coinCount = 0;

const COIN_ATTRACT_RADIUS = 8;
const COIN_COLLECT_RADIUS = 1.0;
const COIN_SPEED = 0.4;

// ===== Textured (cheese) coin as Sprite =====
const texLoader = new THREE.TextureLoader();
const cheeseTex = texLoader.load("./assets/textures/coin.png");

const baseCheeseMat = new THREE.SpriteMaterial({
  map: cheeseTex,
  transparent: true,
  alphaTest: 0.4,
  color: new THREE.Color(1.0, 0.92, 0.6), // slightly cheesier tint
});

const BASE_SIZE = 1.3;
const ROTATE_SPEED = 0.04;
const PULSE_SPEED = 0.08;
const PULSE_AMOUNT = 0.15;

// ===== Plain coin as Box =====
const plainGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
function makePlainMesh() {
  const mat = new THREE.MeshPhongMaterial({ color: 0xffcc66 });
  return new THREE.Mesh(plainGeom, mat);
}

function makeCheeseSprite() {
  const mat = baseCheeseMat.clone();
  const s = new THREE.Sprite(mat);
  s.scale.set(BASE_SIZE, BASE_SIZE, 1);
  return s;
}

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

// Call from main.js when toggling textures
export function setCoinTextureEnabled(enabled) {
  if (!scene) return;

  for (const c of coins) {
    const old = c.mesh;
    const pos = old.position.clone();

    scene.remove(old);

    const newMesh = enabled ? makeCheeseSprite() : makePlainMesh();
    newMesh.position.copy(pos);

    scene.add(newMesh);

    c.mesh = newMesh;
    c.isSprite = enabled;
  }
}

// Enemy death drop
export function spawnCoinAtPosition(pos) {
  if (!scene) return;

  const useTex = !!window.USE_TEXTURES;

  const mesh = useTex ? makeCheeseSprite() : makePlainMesh();
  mesh.position.set(pos.x, 0.9, pos.z);

  scene.add(mesh);
  coins.push({
    mesh,
    phase: Math.random() * Math.PI * 2,
    isSprite: useTex,
  });
}

// Per-frame update: attract + collect + (sprite-only animation)
export function updateCoins(isLastSecond) {
  if (!scene || !player) return;

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const mesh = c.mesh;
    const cp = mesh.position;

    // --- cheese animation (only for sprite mode) ---
    if (c.isSprite) {
      c.phase += PULSE_SPEED;

      const pulse = 1 + Math.sin(c.phase) * PULSE_AMOUNT;
      mesh.scale.set(BASE_SIZE * pulse, BASE_SIZE * pulse, 1);

      // Sprite rotation is on material
      mesh.material.rotation += ROTATE_SPEED;
    }

    // --- attract logic ---
    const dx = player.position.x - cp.x;
    const dz = player.position.z - cp.z;
    const distSq = dx * dx + dz * dz;

    if (isLastSecond || distSq < COIN_ATTRACT_RADIUS * COIN_ATTRACT_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.0001;
      cp.x += (dx / dist) * COIN_SPEED;
      cp.z += (dz / dist) * COIN_SPEED;
      cp.y = 0.9;
    }

    // --- collect ---
    if (distSq < COIN_COLLECT_RADIUS * COIN_COLLECT_RADIUS) {
      coinCount += 1;
      updateCoinDisplay();

      window.__playSfx?.("coin");

      scene.remove(mesh);
      coins.splice(i, 1);
    }
  }
}

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

export function resetCoins(sceneRef) {
  for (const c of coins) {
    sceneRef.remove(c.mesh);
  }
  coins.length = 0;
  coinCount = 0;
  updateCoinDisplay();
}
