/**
 * kart.js – Kart-specific mechanics: weight classes, drift, mini-turbo boost.
 *
 * Designed to be imported by physics.js (per-step logic) and main.js (UI / state reads).
 * All functions are pure / stateless except createKartState().
 */

// ─── Weight-class presets (like MK64 light / medium / heavy) ─────────────────
export const WEIGHT_CLASSES = {
  light: {
    name: 'Light',
    mass: 80,
    maxEngineForce: 2800,   // forward thrust
    reverseForce: 1000,     // reverse thrust
    grip: 7.0,              // front + rear friction slip (normal)
    driftRearGrip: 1.8,     // rear friction while drifting (less = more slide)
    turboRate: 40,          // drift-charge %/sec
    miniThreshold: 60,      // charge % needed for mini-turbo
    superThreshold: 100,    // charge % needed for super-turbo
    miniBoostDuration: 0.65,
    superBoostDuration: 1.4,
    boostMultiplier: 1.9,   // engine force ×multiplier during boost
  },
  medium: {
    name: 'Medium',
    mass: 120,
    maxEngineForce: 2200,
    reverseForce: 800,
    grip: 8.0,
    driftRearGrip: 2.2,
    turboRate: 32,
    miniThreshold: 60,
    superThreshold: 100,
    miniBoostDuration: 0.7,
    superBoostDuration: 1.5,
    boostMultiplier: 1.8,
  },
  heavy: {
    name: 'Heavy',
    mass: 170,
    maxEngineForce: 1800,
    reverseForce: 650,
    grip: 9.5,
    driftRearGrip: 3.0,
    turboRate: 24,
    miniThreshold: 60,
    superThreshold: 100,
    miniBoostDuration: 0.75,
    superBoostDuration: 1.6,
    boostMultiplier: 1.7,
  },
};

// ─── State factory ────────────────────────────────────────────────────────────
export function createKartState(weightClass = 'medium') {
  const preset = WEIGHT_CLASSES[weightClass] ?? WEIGHT_CLASSES.medium;
  return {
    weightClass,
    preset,
    // drift
    isDrifting: false,
    driftDir: 0,       // -1 = left, +1 = right
    driftCharge: 0,    // 0–100
    sparksLevel: 0,    // 0=none, 1=blue (mini ready), 2=orange (super ready)
    // boost
    isBoosting: false,
    boostTimer: 0,
    pendingBoost: null, // 'mini' | 'super' | null
  };
}

// ─── Per-physics-step update (called from physics.js) ────────────────────────
export function updateKart(kart, keys, dt, speedKPH) {
  const p       = kart.preset;
  const turning = keys.a || keys.d;
  const fast    = speedKPH > 20;

  // ── Drift initiation ──────────────────────────────────────────
  if (keys.shift && turning && fast && !kart.isDrifting) {
    kart.isDrifting  = true;
    kart.driftDir    = keys.a ? -1 : 1;
    kart.driftCharge = 0;
    kart.sparksLevel = 0;
  }

  // ── Drift tick ────────────────────────────────────────────────
  if (kart.isDrifting) {
    if (!keys.shift || speedKPH < 12) {
      // Release drift – award boost if charged enough
      if      (kart.driftCharge >= p.superThreshold) kart.pendingBoost = 'super';
      else if (kart.driftCharge >= p.miniThreshold)  kart.pendingBoost = 'mini';
      kart.isDrifting  = false;
      kart.driftCharge = 0;
      kart.sparksLevel = 0;
    } else if (keys.w && turning) {
      // Build charge while actively accelerating and drifting
      kart.driftCharge = Math.min(100, kart.driftCharge + dt * p.turboRate);
      kart.sparksLevel =
        kart.driftCharge >= p.superThreshold ? 2 :
        kart.driftCharge >= p.miniThreshold  ? 1 : 0;
    }
  }

  // ── Activate pending boost ─────────────────────────────────────
  if (!kart.isBoosting && kart.pendingBoost) {
    kart.isBoosting  = true;
    kart.boostTimer  = kart.pendingBoost === 'super'
      ? p.superBoostDuration : p.miniBoostDuration;
    kart.pendingBoost = null;
  }

  // ── Tick active boost ──────────────────────────────────────────
  if (kart.isBoosting) {
    kart.boostTimer = Math.max(0, kart.boostTimer - dt);
    if (kart.boostTimer === 0) kart.isBoosting = false;
  }

  return kart;
}

// ─── Derived values consumed by physics.js ────────────────────────────────────

/** Engine force to apply this step. Compatible with race & battle state shapes. */
export function getEngineForce(kart, keys, dotForward, gameState) {
  const started  = gameState.raceStarted  || gameState.battleStarted  || false;
  const finished = gameState.raceFinished || gameState.battleFinished || false;
  if (!started || finished) return 0;

  const p = kart.preset;
  if (keys.w) {
    return kart.isBoosting ? p.maxEngineForce * p.boostMultiplier : p.maxEngineForce;
  }
  if (keys.s && dotForward <= 0.1) return -p.reverseForce; // reverse only when ~stopped
  return 0;
}

/** Braking force to apply this step. */
export function getBrakingForce(keys, dotForward, gameState) {
  const started  = gameState.raceStarted  || gameState.battleStarted  || false;
  const finished = gameState.raceFinished || gameState.battleFinished || false;
  if (!started || finished) return 80; // locked before race
  if (keys.s && dotForward > 0.1) return 80;  // hard brake
  if (!keys.w && !keys.s)         return 22;  // coast / rolling resistance
  return 0;
}

/** Rear-wheel friction slip. Lower during drift = more oversteer. */
export function getRearFriction(kart) {
  return kart.isDrifting ? kart.preset.driftRearGrip : kart.preset.grip;
}
