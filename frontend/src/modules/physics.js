import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { updateKart, getEngineForce, getBrakingForce, getRearFriction } from './kart.js';

// Physics time step – exported so callers can reference it
export const FIXED_PHYSICS_STEP = 1 / 60; // 60 Hz

/**
 * Initialise the Rapier physics world.
 * Must be awaited before any other physics calls.
 * Returns { world } — the Rapier World instance.
 */
export async function initPhysics() {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0.0, y: -20.0, z: 0.0 });
  world.timestep = FIXED_PHYSICS_STEP;

  console.log('✅ Rapier physics world initialised');
  return { world };
}

/**
 * Utility: create a static (fixed) box collider in the world.
 * Replaces the old addRigidBody helper.
 */
export function addBoxCollider(
  world, halfExtents, position, quaternion,
  friction = 0.7, restitution = 0.2
) {
  const bodyDesc = RAPIER.RigidBodyDesc.fixed()
    .setTranslation(position.x, position.y, position.z);
  if (quaternion) {
    bodyDesc.setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w });
  }
  const body = world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc
    .cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
    .setFriction(friction)
    .setRestitution(restitution);
  world.createCollider(colliderDesc, body);
  return body;
}

// Legacy alias kept for API compatibility
export const addRigidBody = addBoxCollider;

// Update physics simulation
/**
 * Per-step physics update.
 * Signature change: `ammo` and `{ physicsWorld, tmpTrans }` arguments removed.
 * physicsState = { world }  (Rapier World)
 */
export function updatePhysics(
  deltaTime, physicsState, carState, debugObjects, raceState, kartState = null
) {
  const { world } = physicsState;
  const {
    carBody, vehicle, carModel,
    keyState, currentSteeringAngle, updateSteering,
  } = carState;

  if (!vehicle || !carModel) {
    return { currentSpeed: 0, currentSteeringAngle: currentSteeringAngle ?? 0 };
  }

  // ── Read velocity from Rapier rigid body (plain {x,y,z} object) ──
  const vel = carBody.linvel();
  const velocityThree = new THREE.Vector3(vel.x, vel.y, vel.z);
  const carForward = new THREE.Vector3();
  carModel.getWorldDirection(carForward);
  const dotForward = carForward.dot(velocityThree);
  const speedKPH   = velocityThree.length() * 3.6;

  // ── Kart state update (drift charge, boost tick) ──────────────────
  if (kartState) updateKart(kartState, keyState, deltaTime, speedKPH);

  // ── Engine & braking forces ────────────────────────────────────────
  let engineForce, brakingForce;
  if (kartState) {
    engineForce  = getEngineForce(kartState, keyState, dotForward, raceState);
    brakingForce = getBrakingForce(keyState, dotForward, raceState);
  } else {
    const started  = raceState.raceStarted  || raceState.battleStarted  || false;
    const finished = raceState.raceFinished || raceState.battleFinished || false;
    if (started && !finished) {
      if (keyState.w)                          { engineForce = 2200; brakingForce = 0;  }
      else if (keyState.s && dotForward > 0.1) { engineForce = 0;    brakingForce = 80; }
      else if (keyState.s)                     { engineForce = -800; brakingForce = 0;  }
      else                                     { engineForce = 0;    brakingForce = 22; }
    } else {
      engineForce = 0; brakingForce = 80;
    }
  }

  // ── Apply to Rapier vehicle controller wheels ─────────────────────
  const numWheels = vehicle.numWheels();
  for (let i = 0; i < numWheels; i++) {
    if (i >= 2) { // rear wheels: engine
      vehicle.setWheelEngineForce(i, engineForce);
      if (kartState) vehicle.setWheelFrictionSlip(i, getRearFriction(kartState));
    }
    vehicle.setWheelBrake(i, brakingForce);
  }

  // ── Drift lateral impulse (initiates / sustains rear slide) ──────
  if (kartState?.isDrifting && carModel) {
    const lateralWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(carModel.quaternion);
    const pushStr = 700 * deltaTime;
    const pos = carBody.translation();
    carBody.applyImpulseAtPoint(
      {
        x: lateralWorld.x * kartState.driftDir * pushStr,
        y: 0,
        z: lateralWorld.z * kartState.driftDir * pushStr,
      },
      { x: pos.x, y: pos.y + 0.3, z: pos.z - 1.5 },
      true
    );
  }

  // ── Steering (wider range while drifting) ─────────────────────────
  let newSteeringAngle = currentSteeringAngle ?? 0;
  const gameFinished = raceState.raceFinished || raceState.battleFinished || false;
  if (!gameFinished) {
    newSteeringAngle = updateSteering(
      deltaTime, vehicle, keyState, currentSteeringAngle ?? 0, speedKPH,
      kartState?.isDrifting ?? false
    );
  }

  // ── Step vehicle controller THEN world (order is critical) ───────
  // Filter predicate: exclude the car's own chassis collider from wheel raycasts
  // so the wheels detect the track surface, not the car body itself.
  // filterFlags = 0 means no category exclusions; filterGroups = null means no
  // interaction-group filtering.
  const chassisCol = carState.chassisCollider;
  const filterPredicate = chassisCol
    ? (collider) => collider !== chassisCol
    : undefined;
  vehicle.updateVehicle(deltaTime, 0, null, filterPredicate);
  world.step();

  return { currentSpeed: speedKPH, currentSteeringAngle: newSteeringAngle };
}