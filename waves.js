// waves.js —— 管理波次 / 计时 / 安全波次逻辑

export const WAVE_DURATION = 60000; // 每一波 60 秒

let currentWave = 1;
let waveStartTime = 0;
let waveRemainingTimeSeconds = WAVE_DURATION / 1000;
let isSafeWave = false;
let isWaveComplete = false;

// DOM & 回调引用
let waveElementRef = null;
let timeElementRef = null;
let waveCompleteOverlayRef = null;
let waveCompleteTitleRef = null;

let collectCoinsCallback = () => {};
let clearEnemiesAndBulletsCallback = () => {};
let enterSafeWaveSceneCallback = () => {};
let exitSafeWaveSceneCallback = () => {};

// ===== 对外 state 访问 =====
export function getCurrentWave() {
  return currentWave;
}
export function getIsSafeWave() {
  return isSafeWave;
}
export function getIsWaveComplete() {
  return isWaveComplete;
}
export function getWaveRemainingTimeSeconds() {
  return waveRemainingTimeSeconds;
}

// ===== 控制：某个战斗波结束后是否进入商店（安全波次） =====
// 这里设置为：打完 2、4、6、8、... 波之后进入商店。
function shouldEnterSafeWaveAfter(waveNumber) {
  return waveNumber % 2 === 0;
}

// ===== 初始化，把 UI 元素和回调传进来 =====
export function initWaveSystem({
  waveElement,
  timeElement,
  waveCompleteOverlay,
  waveCompleteTitle,
  onCollectAllCoinsAtWaveEnd,
  onClearEnemiesAndBullets,
  onEnterSafeWaveScene,
  onExitSafeWaveScene,
}) {
  waveElementRef = waveElement;
  timeElementRef = timeElement;
  waveCompleteOverlayRef = waveCompleteOverlay;
  waveCompleteTitleRef = waveCompleteTitle;

  collectCoinsCallback = onCollectAllCoinsAtWaveEnd || (() => {});
  clearEnemiesAndBulletsCallback = onClearEnemiesAndBullets || (() => {});
  enterSafeWaveSceneCallback = onEnterSafeWaveScene || (() => {});
  exitSafeWaveSceneCallback = onExitSafeWaveScene || (() => {});

  updateWaveLabel();
  if (timeElementRef) {
    timeElementRef.textContent = `Time: ${(WAVE_DURATION / 1000).toFixed(1)}s`;
  }
}

// ===== UI: 更新波次文字 =====
export function updateWaveLabel() {
  if (!waveElementRef) return;
  if (isSafeWave) {
    waveElementRef.textContent = "Wave: Shop";
  } else {
    waveElementRef.textContent = `Wave: ${currentWave}`;
  }
}

// ===== 新游戏 / 重新开始时重置波次并开启第一波 =====
export function startWavesForNewGame(now) {
  currentWave = 1;
  isSafeWave = false;
  isWaveComplete = false;
  waveStartTime = now;
  waveRemainingTimeSeconds = WAVE_DURATION / 1000;

  updateWaveLabel();
  if (timeElementRef) {
    timeElementRef.textContent = `Time: ${(WAVE_DURATION / 1000).toFixed(1)}s`;
  }
}

// 如果想区分“重新开始”和“第一次开始”，也可以用这个包装
export function resetWavesForRestart(now) {
  startWavesForNewGame(now);
}

// ===== 每帧更新计时，检查是否结束当前战斗波 =====
export function updateWaveTimerAndCheck({ now, isGameStarted, isGameOver }) {
  if (!timeElementRef) return;

  // 游戏尚未开始：显示满时间
  if (!isGameStarted) {
    waveRemainingTimeSeconds = WAVE_DURATION / 1000;
    timeElementRef.textContent = `Time: ${(WAVE_DURATION / 1000).toFixed(1)}s`;
    return;
  }

  // 安全波次：无限时间
  if (isSafeWave) {
    waveRemainingTimeSeconds = Infinity;
    timeElementRef.textContent = "Time: ∞";
    return;
  }

  // Game Over：冻结时间，使用最后一次计算结果
  if (isGameOver) {
    if (waveRemainingTimeSeconds === Infinity) {
      timeElementRef.textContent = "Time: ∞";
    } else {
      timeElementRef.textContent = `Time: ${waveRemainingTimeSeconds.toFixed(
        1
      )}s`;
    }
    return;
  }

  // 胜利界面已经弹出
  if (isWaveComplete) {
    const remaining = Math.max(
      0,
      (WAVE_DURATION - (now - waveStartTime)) / 1000
    );
    waveRemainingTimeSeconds = remaining;
    timeElementRef.textContent = `Time: ${remaining.toFixed(1)}s`;
    return;
  }

  // 正常战斗中的计时
  const elapsed = now - waveStartTime;
  let remaining = (WAVE_DURATION - elapsed) / 1000;
  if (remaining < 0) remaining = 0;
  waveRemainingTimeSeconds = remaining;
  timeElementRef.textContent = `Time: ${remaining.toFixed(1)}s`;

  if (elapsed >= WAVE_DURATION) {
    onWaveCompleteInternal();
  }
}

// ===== 内部：战斗波结束（时间到） =====
function onWaveCompleteInternal() {
  if (isWaveComplete) return;
  isWaveComplete = true;

  // 收集所有金币
  collectCoinsCallback();

  // 显示波次完成 UI
  if (waveCompleteTitleRef && waveCompleteOverlayRef) {
    waveCompleteTitleRef.textContent = `Wave ${currentWave} cleared!`;
    waveCompleteOverlayRef.style.display = "flex";
  }
}

// ===== “下一波”按钮点击逻辑 =====
// 返回 { enteredSafeWave, startedCombatWave }
export function handleNextWaveClick(now) {
  if (waveCompleteOverlayRef) {
    waveCompleteOverlayRef.style.display = "none";
  }

  // 情况 1：刚刚结束的是“战斗波次”，并且该波次之后应该进入商店波次
  // 例如 currentWave = 2 / 4 / 6 / ... 且当前不是安全波次
  if (!isSafeWave && shouldEnterSafeWaveAfter(currentWave)) {
    // 进入安全波次：不改变 currentWave，本波被视为“战斗波次”
    isSafeWave = true;
    isWaveComplete = false;
    waveRemainingTimeSeconds = Infinity;

    clearEnemiesAndBulletsCallback();
    enterSafeWaveSceneCallback();

    updateWaveLabel();
    if (timeElementRef) {
      timeElementRef.textContent = "Time: ∞";
    }

    return { enteredSafeWave: true, startedCombatWave: false };
  }

  // 情况 2：其他情况——直接进入下一“战斗波次”
  // - 打完非 2 的倍数波：直接下一战斗波
  // - 从安全波次结束（例如你不通过绿地板而是用按钮逻辑）也会走这里
  isSafeWave = false;
  isWaveComplete = false;
  currentWave += 1; // ⭐ 商店波次不计数，只有战斗波才 ++
  waveStartTime = now;
  waveRemainingTimeSeconds = WAVE_DURATION / 1000;

  clearEnemiesAndBulletsCallback();
  updateWaveLabel();
  if (timeElementRef) {
    timeElementRef.textContent = `Time: ${(WAVE_DURATION / 1000).toFixed(1)}s`;
  }

  return { enteredSafeWave: false, startedCombatWave: true };
}

// ===== 安全波次中，从绿地板进入下一战斗波 =====
export function startCombatWaveFromSafe(now) {
  if (!isSafeWave) return false;

  isSafeWave = false;
  isWaveComplete = false;
  currentWave += 1; // 从商店出来进入下一战斗波，才真正增加波数
  waveStartTime = now;
  waveRemainingTimeSeconds = WAVE_DURATION / 1000;

  clearEnemiesAndBulletsCallback();
  exitSafeWaveSceneCallback();
  updateWaveLabel();
  if (timeElementRef) {
    timeElementRef.textContent = `Time: ${(WAVE_DURATION / 1000).toFixed(1)}s`;
  }

  return true;
}
