// enemyTypes.js
// 存放所有敌人“配置数据”

export const EnemyTypes = {
  // ===== 1 级怪：1 号、2 号 =====
  1: {
    id: 1,
    tier: 1,
    name: "标准小兵",
    boxSize: { x: 2, y: 3, z: 4 },
    color: 0xff0000,
    baseHP: 3,
    baseSpeed: 0.48,          // 玩家 0.8 倍
    baseDamage: 1,
    attackIntervalMs: 600,
    baseCoins: 1,
    sizeScale: 1.0,
  },

  2: {
    id: 2,
    tier: 1,
    name: "迅捷小兵",
    boxSize: { x: 2, y: 2, z: 2 },
    color: 0xffff00,
    baseHP: 2,
    baseSpeed: 0.66,          // 玩家 1.1 倍
    baseDamage: 1,
    attackIntervalMs: 300,
    baseCoins: 1,
    sizeScale: 0.9,
  },

  // ===== 2 级怪：3 号、4 号 =====
  // 3 号：盾兵
  3: {
    id: 3,
    tier: 2,
    name: "盾兵",
    boxSize: { x: 2.6, y: 3.4, z: 4.2 },
    color: 0x55aaff,
    baseHP: 7,
    baseSpeed: 0.42,
    baseDamage: 2,
    attackIntervalMs: 1000,   // 1 秒一次攻击
    baseCoins: 2,
    sizeScale: 1.15,
  },

  // 4 号：自爆小兵
  4: {
    id: 4,
    tier: 2,
    name: "自爆小兵",
    boxSize: { x: 2.2, y: 3, z: 3.5 },
    color: 0xff8800,          // 橙色
    baseHP: 3,
    baseSpeed: 0.6,
    baseDamage: 2,            // 自爆基础伤害（会再乘波次系数）
    attackIntervalMs: 1000,   // 对自爆兵没用，只占位
    baseCoins: 2,
    sizeScale: 1.0,
  },

  // ===== 3 级怪：5 号、6 号 =====
  // ⭐ 5 号：远程狙击兵（Sniper）
  5: {
    id: 5,
    tier: 3,
    name: "远程狙击兵",
    boxSize: { x: 2, y: 3, z: 4 }, // 正常大小
    color: 0x9933ff,               // 紫色，远程感
    baseHP: 3,                     // 你要求默认血量 3
    baseSpeed: 0.3,                // 移动速度 0.3
    baseDamage: 3,                 // 每次狙击 3 点基础伤害（之后会乘波次系数）
    attackIntervalMs: 3000,        // 攻击频率 3 秒 1 次（用作冷却参考）
    baseCoins: 3,                  // 3 级怪：掉落 3 金币
    sizeScale: 1.0,
  },

  // 6 号：先保留原来的“迅猛刺客”占位
  6: {
    id: 6,
    tier: 3,
    name: "迅猛刺客",
    boxSize: { x: 2, y: 2.5, z: 3.5 },
    color: 0x009000,
    baseHP: 4,
    baseSpeed: 0.7,
    baseDamage: 2,
    attackIntervalMs: 450,
    baseCoins: 3,
    sizeScale: 1.0,
  },
};

// 精英怪 10% 概率
export const ELITE_CHANCE = 0.1;

/**
 * 按波次数解锁敌人类型：
 * Wave 1: 1
 * Wave 2: 1,2
 * Wave 3: 1,2,3
 * Wave 4: 1,2,3,4
 * Wave 5: 1,2,3,4,5
 * Wave 6+: 1,2,3,4,5,6
 */
export function getEnemyTypesForWave(wave) {
  const result = [];
  const w = Math.max(1, wave | 0);

  let maxId = 1;
  if (w >= 2) maxId = 2;
  if (w >= 3) maxId = 3;
  if (w >= 4) maxId = 4;
  if (w >= 5) maxId = 5;
  if (w >= 6) maxId = 6;

  for (let id = 1; id <= maxId; id++) {
    if (EnemyTypes[id]) {
      result.push(EnemyTypes[id]);
    }
  }

  return result;
}
