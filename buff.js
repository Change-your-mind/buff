// buff.js
// Manage buff definitions / rarity / roll logic / UI text formatting

// Rarity enum: tiers 1–4
export const RARITY = {
  LEVEL1: 1, // green
  LEVEL2: 2, // blue
  LEVEL3: 3, // purple
  LEVEL4: 4, // gold
};

// Rarity metadata: display info (label text + background color)
export const RARITY_META = {
  [RARITY.LEVEL1]: {
    label: "Tier I",
    color: "#2ecc71", // green
  },
  [RARITY.LEVEL2]: {
    label: "Tier II",
    color: "#3498db", // blue
  },
  [RARITY.LEVEL3]: {
    label: "Tier III",
    color: "#9b59b6", // purple
  },
  [RARITY.LEVEL4]: {
    label: "Tier IV",
    color: "#f1c40f", // gold
  },
};

/**
 * Rarity roll probabilities:
 * Tier 1: 50%
 * Tier 2: 30%
 * Tier 3: 17%
 * Tier 4:  3%
 */
function rollRarity() {
  const r = Math.random();
  if (r < 0.5) return RARITY.LEVEL1;   // 0.00 - 0.50
  if (r < 0.8) return RARITY.LEVEL2;   // 0.50 - 0.80
  if (r < 0.97) return RARITY.LEVEL3;  // 0.80 - 0.97
  return RARITY.LEVEL4;                // 0.97 - 1.00
}

/**
 * Buff definition pool
 */
export const BUFF_POOL = [
  {
    id: "placeholder_lv1",
    name: "Placeholder: Tier I Basic Buff",
    rarity: RARITY.LEVEL1,
    description: "Tier I placeholder buff used for testing the shop UI.",
  },
  {
    id: "placeholder_lv1_b",
    name: "Placeholder: Tier I Basic Buff B",
    rarity: RARITY.LEVEL1,
    description: "Another Tier I placeholder buff used to test duplicate rolls.",
  },
  {
    id: "placeholder_lv2",
    name: "Placeholder: Tier II Advanced Buff",
    rarity: RARITY.LEVEL2,
    description: "Tier II placeholder buff used for testing mid-tier rarity.",
  },
  {
    id: "placeholder_lv3",
    name: "Placeholder: Tier III Strong Buff",
    rarity: RARITY.LEVEL3,
    description: "Tier III placeholder buff used for testing high rarity.",
  },
  {
    id: "placeholder_lv4",
    name: "Placeholder: Tier IV Legendary Buff",
    rarity: RARITY.LEVEL4,
    description: "Tier IV placeholder buff used for testing legendary rarity.",
  },

  // 🌟 Tier 3 – Scatter Shot
  {
    id: "scatter_lv3",
    name: "Scatter Shot",
    rarity: RARITY.LEVEL3,
    description:
      "On first purchase, gain 2 extra projectiles (3 total). Each additional purchase adds +1 projectile, up to 36 projectiles, spaced 10° apart.",
  },

  // 🌟 Tier 3 – Ricochet Rounds
  {
    id: "ricochet_lv3",
    name: "Ricochet Rounds",
    rarity: RARITY.LEVEL3,
    description:
      "Bullets bounce to the nearest other enemy after hitting a target. Starts with 3 bounces. Each time you gain this buff, max bounces +1. Each bounce reduces damage by 25%.",
  },

  // 🌟 Tier 3 – Rocket Rounds
  {
    id: "rocket_lv3",
    name: "Rocket Rounds",
    rarity: RARITY.LEVEL3,
    description:
      "Bullets become rockets, dealing AoE damage on hit: direct hit deals 100% damage, enemies in the explosion radius take 80% damage. Each stack increases explosion radius by 25% and direct hit damage by 10%.",
  },

  // 🌟 Tier 3 – Sticky Rounds
  {
    id: "sticky_lv3",
    name: "Sticky Rounds",
    rarity: RARITY.LEVEL3,
    description:
      "Consecutive hits on the same enemy stack damage: the next hit adds the previous hit’s damage on top. Starts with up to 3 stacks; each stack of this buff increases the maximum number of stacks by 1. Affects direct hits only.",
  },

  // 🌟 Tier 3 – Gravity Rounds  ✅ New
  {
    id: "gravity_lv3",
    name: "Gravity Rounds",
    rarity: RARITY.LEVEL3,
    description:
      "When a bullet hits an enemy, it creates a small gravity field at the hit point, pulling nearby enemies toward the center. Each stack of this buff increases the pull radius by 10%.",
  },

  // 🌟 Tier 3 – Piercing Shots  ⭐ New
  {
    id: "pierce_lv3",
    name: "Piercing Shots",
    rarity: RARITY.LEVEL3,
    description:
      "Bullets can pierce enemies 2 times (one shot can hit up to 3 enemies). Each additional stack increases the number of pierces by 1. Bullets are still blocked by walls and cannot pierce through them.",
  },

  // 🌟 Tier 2 – Flame Rounds
  {
    id: "fire_lv2",
    name: "Flame Rounds",
    rarity: RARITY.LEVEL2,
    description:
      "Bullets turn red. When a direct hit lands, that enemy leaves a trail of flames while moving. Other enemies standing in the flames take 0.5 damage per second. Flames last 1 second initially; each stack adds +0.5 seconds up to a maximum of 4 seconds.",
  },

  // 🌟 Tier 2 – Bleed Rounds
  {
    id: "bleed_lv2",
    name: "Bleed Rounds",
    rarity: RARITY.LEVEL2,
    description:
      "Direct hits inflict Bleed: after 1 second delay, the target takes 1 damage per second for 5 seconds. Stacks additively: each additional stack of this buff increases bleed damage by +1 per second with no upper limit.",
  },

  // 🌟 Tier 2 – Slowing Rounds
  {
    id: "slow_lv2",
    name: "Slowing Rounds",
    rarity: RARITY.LEVEL2,
    description:
      "On hit, the enemy’s move speed is reduced by 30% and their attack interval is increased by 50% for 5 seconds. Each additional stack increases the duration by +1 second. Can stack with other effects.",
  },

  // 🌟 Tier 1 – Max HP Up
  {
    id: "maxhp_lv1",
    name: "Max HP Up",
    rarity: RARITY.LEVEL1,
    description:
      "Increases maximum HP: first purchase +5 HP, each later purchase +3 HP, up to a maximum of 30 HP. Does not heal current HP.",
  },

  // 🌟 Tier 1 – Roll Cooldown Reduction
  {
    id: "rollcd_lv1",
    name: "Agile Roll",
    rarity: RARITY.LEVEL1,
    description:
      "Reduces roll cooldown: each stack reduces cooldown by 0.5 seconds, to a minimum of 1 second.",
  },

  // 🌟 Tier 1 – Projectile Speed Up
  {
    id: "proj_speed_lv1",
    name: "Projectile Speed Up",
    rarity: RARITY.LEVEL1,
    description:
      "Increases bullet travel speed: first purchase +10%, each subsequent purchase +0.5%. Stacks without limit.",
  },

  // 🌟 Tier 1 – Fire Rate Up
  {
    id: "firerate_lv1",
    name: "Rapid Fire",
    rarity: RARITY.LEVEL1,
    description:
      "Increases fire rate: first purchase +10%, each additional purchase +5%. Stacks without limit.",
  },

  // 🌟 Tier 1 – Critical Boost  ⭐ New
  {
    id: "crit_lv1",
    name: "Critical Boost",
    rarity: RARITY.LEVEL1,
    description:
      "Unlocks critical hits: base critical chance is 10%. Each stack adds +10% crit chance, up to a maximum of 100%.",
  },
];

/**
 * Group buffs by rarity for easier rarity-based selection.
 */
function groupBuffsByRarity() {
  const map = {};
  for (const buff of BUFF_POOL) {
    if (!map[buff.rarity]) map[buff.rarity] = [];
    map[buff.rarity].push(buff);
  }
  return map;
}

/**
 * Roll a single buff
 */
function rollOneBuff(excludeIds = new Set()) {
  const grouped = groupBuffsByRarity();

  for (let attempt = 0; attempt < 10; attempt++) {
    const rarity = rollRarity();
    const list = grouped[rarity];
    if (!list || list.length === 0) continue;

    const candidates = list.filter((b) => !excludeIds.has(b.id));
    if (candidates.length === 0) continue;

    const idx = (Math.random() * candidates.length) | 0;
    return candidates[idx];
  }

  // Fallback: pick any non-duplicate buff from the full pool
  const fallback = BUFF_POOL.filter((b) => !excludeIds.has(b.id));
  if (fallback.length === 0) return null;
  const idx = (Math.random() * fallback.length) | 0;
  return fallback[idx];
}

/**
 * Roll a certain number of unique buffs
 */
export function getRandomBuffChoices(count = 3) {
  const result = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    const buff = rollOneBuff(usedIds);
    if (!buff) break;
    result.push(buff);
    usedIds.add(buff.id);
  }

  return result;
}

/**
 * Format buff text for display on buttons
 */
export function formatBuffText(buff) {
  if (!buff) return "No buff";

  const meta = RARITY_META[buff.rarity] || {};
  const prefix = meta.label ? `[${meta.label}] ` : "";
  return `${prefix}${buff.name}: ${buff.description}`;
}

/**
 * Entry point: apply a buff’s effect to the game.
 *
 * gameCtx currently may include (optionally):
 * - player: THREE.Mesh (player model)
 * - scene: THREE.Scene
 * - coinCount: current coin count (by value, read-only)
 * - hp: current HP (by value, read-only)
 * - ownedBuffs: array of already owned buffs
 * - addCoins(amount)
 * - addHP(amount)
 * - increaseMaxHP(delta, cap)
 * - getScatterBulletCount()
 * - upgradeScatter()
 * - upgradeRicochet()
 * - upgradeRocket()
 * - upgradeSticky()
 * - upgradeBleed()
 * - upgradeSlow()
 * - upgradeRollCooldown()
 */
export function applyBuffToGame(buff, gameCtx) {
  console.log("[BUFF] applyBuffToGame", buff);

  if (!buff || !gameCtx) return;

  switch (buff.id) {
    case "scatter_lv3": {
      if (typeof gameCtx.upgradeScatter === "function") {
        gameCtx.upgradeScatter();
      }
      break;
    }

    case "ricochet_lv3": {
      if (typeof gameCtx.upgradeRicochet === "function") {
        gameCtx.upgradeRicochet();
      }
      break;
    }

    case "rocket_lv3": {
      if (typeof gameCtx.upgradeRocket === "function") {
        gameCtx.upgradeRocket();
      }
      break;
    }

    case "sticky_lv3": {
      if (typeof gameCtx.upgradeSticky === "function") {
        gameCtx.upgradeSticky();
      }
      break;
    }

    case "gravity_lv3": {
      if (typeof gameCtx.upgradeGravity === "function") {
        gameCtx.upgradeGravity();
      }
      break;
    }

    case "pierce_lv3": {
      if (typeof gameCtx.upgradePierce === "function") {
        gameCtx.upgradePierce();
      }
      break;
    }

    case "fire_lv2": {
      // Flame rounds: change projectile visuals + enemy flame trail logic
      if (typeof gameCtx.upgradeFireBullet === "function") {
        gameCtx.upgradeFireBullet();
      }
      if (typeof gameCtx.upgradeFireTrail === "function") {
        gameCtx.upgradeFireTrail();
      }
      break;
    }

    case "bleed_lv2": {
      if (typeof gameCtx.upgradeBleed === "function") {
        gameCtx.upgradeBleed();
      }
      break;
    }

    case "slow_lv2": {
      if (typeof gameCtx.upgradeSlow === "function") {
        gameCtx.upgradeSlow();
      }
      break;
    }

    case "maxhp_lv1": {
      if (typeof gameCtx.increaseMaxHP === "function") {
        // Number of times this buff has been purchased (including this time)
        const times =
          gameCtx.ownedBuffs?.filter((b) => b.id === "maxhp_lv1").length ?? 1;

        const MAX_CAP = 30;
        let delta;

        // First time +5, afterwards +3 each time
        if (times === 1) {
          delta = 5;
        } else {
          delta = 3;
        }
        gameCtx.increaseMaxHP(delta, MAX_CAP);
      }
      break;
    }

    case "rollcd_lv1": {
      if (typeof gameCtx.upgradeRollCooldown === "function") {
        gameCtx.upgradeRollCooldown();
      }
      break;
    }

    case "proj_speed_lv1": {
      if (typeof gameCtx.upgradeProjectileSpeed === "function") {
        gameCtx.upgradeProjectileSpeed();
      }
      break;
    }

    case "firerate_lv1": {
      if (typeof gameCtx.upgradeFireRate === "function") {
        gameCtx.upgradeFireRate();
      }
      break;
    }

    // ⭐ New: Critical Boost buff
    case "crit_lv1": {
      if (typeof gameCtx.upgradeCritChance === "function") {
        gameCtx.upgradeCritChance();
      }
      break;
    }

    default:
      // Placeholder / not-yet-implemented buffs
      break;
  }
}
