import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Vehicle parameters – kart proportions
const VEHICLE_WIDTH = 1.8;
const VEHICLE_HEIGHT = 0.5;
const VEHICLE_LENGTH = 3.2;
const WHEEL_RADIUS = 0.35;
const WHEEL_WIDTH = 0.22;
const SUSPENSION_REST_LENGTH = 0.25;
const WHEEL_X_OFFSET = 0.75;
const WHEEL_Z_OFFSET = 1.3;

// Physics tuning – arcade kart feel
const SUSPENSION_STIFFNESS = 28;
const SUSPENSION_DAMPING = 4;
const SUSPENSION_COMPRESSION = 2.0;
const WHEEL_FRICTION = 8;           // base; overridden dynamically during drift
const CHASSIS_MASS = 120;           // medium weight class

// Steering parameters
const MAX_STEERING_ANGLE = 0.55;    // used as ceiling in calculateMaxSteeringAngle
const STEERING_SPEED = 3.5;         // how fast the wheel turns
const STEERING_RETURN_SPEED = 5.0;  // how fast it centres

// ─────────────────────────────────────────────────────────────────────────────
// createVehicle – builds Rapier chassis + vehicle controller, then loads model
// Signature change: removed `ammo` and `physicsWorld` params, replaced with `world`
// Added optional `startPos` param: { x, y, z, heading }
// ─────────────────────────────────────────────────────────────────────────────
export function createVehicle(scene, world, debugObjects, onCarLoaded, startPos = null) {
  console.log('Starting vehicle creation (Rapier)');

  // Determine spawn position — use track-data start pos or fallback
  const spawnX = startPos?.x ?? 0;
  const spawnY = (startPos?.y ?? 3) + 2;  // +2m above surface for drop-in
  const spawnZ = startPos?.z ?? 0;

  // ── Chassis rigid body ────────────────────────────────────────────
  const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnX, spawnY, spawnZ)
    .setLinearDamping(0.05)
    .setAngularDamping(0.3);
  const carBody = world.createRigidBody(chassisDesc);

  const chassisCollider = world.createCollider(
    RAPIER.ColliderDesc
      .cuboid(VEHICLE_WIDTH / 2, VEHICLE_HEIGHT / 2 * 0.8, VEHICLE_LENGTH / 2 * 0.9)
      .setFriction(0.1)
      .setMass(CHASSIS_MASS),
    carBody
  );

  // ── Rapier vehicle controller ─────────────────────────────────────
  const vehicle = world.createVehicleController(carBody);

  // Wheel connection points in chassis local space
  const wheelPositions = [
    { name: 'wheel-fl', x: -WHEEL_X_OFFSET, y: 0, z:  WHEEL_Z_OFFSET },
    { name: 'wheel-fr', x:  WHEEL_X_OFFSET, y: 0, z:  WHEEL_Z_OFFSET },
    { name: 'wheel-bl', x: -WHEEL_X_OFFSET, y: 0, z: -WHEEL_Z_OFFSET },
    { name: 'wheel-br', x:  WHEEL_X_OFFSET, y: 0, z: -WHEEL_Z_OFFSET },
  ];

  for (const wp of wheelPositions) {
    vehicle.addWheel(
      { x: wp.x, y: wp.y, z: wp.z },  // chassis connection (local)
      { x: 0, y: -1, z: 0 },           // suspension direction (down, local)
      { x: -1, y: 0, z: 0 },           // axle direction (local)
      SUSPENSION_REST_LENGTH,
      WHEEL_RADIUS
    );
  }

  for (let i = 0; i < 4; i++) {
    vehicle.setWheelSuspensionStiffness(i, SUSPENSION_STIFFNESS);
    vehicle.setWheelMaxSuspensionForce(i, 6000);
    vehicle.setWheelSuspensionCompression(i, SUSPENSION_COMPRESSION);
    vehicle.setWheelSuspensionRelaxation(i, SUSPENSION_DAMPING);
    vehicle.setWheelFrictionSlip(i, WHEEL_FRICTION);
    vehicle.setWheelSideFrictionStiffness(i, 1.0);
    vehicle.setWheelMaxSuspensionTravel(i, 0.5);
  }

  const carComponents = {
    carBody,
    vehicle,
    chassisCollider,
    wheelMeshes: [null, null, null, null],
    carModel: null,
    currentSteeringAngle: 0,
  };

  // Load visual model asynchronously; physics is already live
  loadCarModel(scene, carComponents, wheelPositions, (updated) => {
    if (onCarLoaded) onCarLoaded(updated);
  });

  return carComponents;
}

// Internal: load the GLTF car model and wire up wheel meshes
function loadCarModel(scene, carComponents, wheelPositions, onModelLoaded) {
  const loader = new GLTFLoader();


  // Get the player ID
  const myPlayerId = localStorage.getItem('myPlayerId');
  
  // Determine car color with proper priority:
  let carColor = 'red';
  
  // Try getting from gameConfig that might be in sessionStorage
  try {
    const savedConfig = sessionStorage.getItem('gameConfig');
    if (savedConfig) {
      const gameConfig = JSON.parse(savedConfig);
      if (gameConfig && gameConfig.players) {
        const playerInfo = gameConfig.players.find(p => p.id === myPlayerId);
        if (playerInfo && playerInfo.playerColor) {
          carColor = playerInfo.playerColor;
          console.log(`Using car color from gameConfig: ${carColor}`);
        }
      }
    }
  } catch (e) {
    console.error('Error getting car color from game config:', e);
  }
  
  // Fall back to sessionStorage if not found in gameConfig
  if (carColor === 'red') {
    const storedColor = sessionStorage.getItem('carColor');
    if (storedColor) {
      carColor = storedColor;
      console.log(`Using car color from sessionStorage: ${carColor}`);
    } else {
      console.log('Using default red color');
    }
  }
  
  // Load the appropriate colored car model
  loader.load(
    `/models/car_${carColor}.glb`,
    (gltf) => {
      const carModel = gltf.scene;
      
      // Adjust model scale and position if needed
      carModel.scale.set(4, 4, 4); // Adjust scale as needed
      carModel.position.set(0, 0, 0); // Position will be updated by physics
      
      // Make sure car casts shadows
      carModel.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = false;
        }
      });
      
      // Find wheel meshes in the car model
      let wheelMeshFL = carModel.getObjectByName('wheel-fr');
      let wheelMeshFR = carModel.getObjectByName('wheel-fl');
      let wheelMeshBL = carModel.getObjectByName('wheel-br');
      let wheelMeshBR = carModel.getObjectByName('wheel-bl');
      
      const wheelModelMeshes = [wheelMeshFL, wheelMeshFR, wheelMeshBL, wheelMeshBR];
      
      // Store reference to wheel meshes and detach them from car model
      for (let i = 0; i < wheelModelMeshes.length; i++) {
        if (wheelModelMeshes[i]) {
          // Get the original world matrix before removal to preserve transformations
          wheelModelMeshes[i].updateMatrixWorld(true);
          
          // Remove from car model
          carModel.remove(wheelModelMeshes[i]);
          
          // Add directly to scene so we can control it separately
          scene.add(wheelModelMeshes[i]);
          
          // Apply the same scale as the car model
          wheelModelMeshes[i].scale.set(4, 4, 4);
          
          // Save reference
          carComponents.wheelMeshes[i] = wheelModelMeshes[i];
          
          console.log(`Found and set up wheel: ${wheelPositions[i].name}`);
        } else {
          console.warn(`Could not find wheel mesh: ${wheelPositions[i].name}`);
          
          // Create a default wheel as fallback
          const wheelGeometry = new THREE.CylinderGeometry(
            WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 24
          );
          wheelGeometry.rotateZ(Math.PI/2); 
          
          const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
          const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
          wheelMesh.castShadow = true;
          scene.add(wheelMesh);
          
          // Scale the default wheel to match too
          wheelMesh.scale.set(4, 4, 4);
          
          // Use this default wheel
          carComponents.wheelMeshes[i] = wheelMesh;
        }
      }
      
      // Add car model to scene
      scene.add(carModel);
      carComponents.carModel = carModel;
      
      console.log('Car model loaded successfully');
      
      // Now call the callback with the updated components
      if (onModelLoaded) onModelLoaded(carComponents);
    },
    undefined,
    (error) => {
      console.error(`Error loading ${carColor} car model:`, error);
      // Handle fallback with callback
      if (carColor !== 'red') {
        loadFallbackCarModel(scene, carComponents, wheelPositions, onModelLoaded);
      }
    }
  );
}

// Fallback model loader (no ammo param needed)
function loadFallbackCarModel(scene, carComponents, wheelPositions, onModelLoaded) {
  console.log('Falling back to red car model');
  const loader = new GLTFLoader();
  
  loader.load(
    '/models/car_red.glb',
    (gltf) => {
      const carModel = gltf.scene;
      
      // Adjust model scale and position
      carModel.scale.set(4, 4, 4);
      carModel.position.set(0, 0, 0);
      
      // Make sure car casts shadows
      carModel.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = false;
        }
      });
      
      // Process wheel meshes (same as in loadCarModel)
      let wheelMeshFL = carModel.getObjectByName('wheel-fr');
      let wheelMeshFR = carModel.getObjectByName('wheel-fl');
      let wheelMeshBL = carModel.getObjectByName('wheel-br');
      let wheelMeshBR = carModel.getObjectByName('wheel-bl');
      
      const wheelModelMeshes = [wheelMeshFL, wheelMeshFR, wheelMeshBL, wheelMeshBR];
      
      for (let i = 0; i < wheelModelMeshes.length; i++) {
        if (wheelModelMeshes[i]) {
          wheelModelMeshes[i].updateMatrixWorld(true);
          carModel.remove(wheelModelMeshes[i]);
          scene.add(wheelModelMeshes[i]);
          wheelModelMeshes[i].scale.set(4, 4, 4);
          carComponents.wheelMeshes[i] = wheelModelMeshes[i];
        } else {
          // Create default wheel
          const wheelGeometry = new THREE.CylinderGeometry(
            WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 24
          );
          wheelGeometry.rotateZ(Math.PI/2);
          
          const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
          const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
          wheelMesh.castShadow = true;
          scene.add(wheelMesh);
          
          wheelMesh.scale.set(4, 4, 4);
          carComponents.wheelMeshes[i] = wheelMesh;
        }
      }
      
      scene.add(carModel);
      carComponents.carModel = carModel;
      
      console.log('Fallback car model loaded successfully');
      
      // Call the callback when complete
      if (onModelLoaded) onModelLoaded(carComponents);
    },
    undefined,
    (error) => {
      console.error('Error loading fallback red car model:', error);
    }
  );
}

// Update steering based on key state
export function updateSteering(deltaTime, vehicle, keyState, currentSteeringAngle, currentSpeed = 0, isDrifting = false) {
  // Calculate dynamic maximum steering angle based on speed (wider during drift)
  const maxSteeringAngle = calculateMaxSteeringAngle(currentSpeed, isDrifting);
  
  // Calculate target steering angle based on key state
  let targetSteeringAngle = 0;
  
  if (keyState.a) {
    targetSteeringAngle = maxSteeringAngle; 
  } else if (keyState.d) {
    targetSteeringAngle = -maxSteeringAngle;
  }
  
  // Determine appropriate steering speed
  const steeringSpeed = (targetSteeringAngle === 0 || 
                         (currentSteeringAngle > 0 && targetSteeringAngle < 0) || 
                         (currentSteeringAngle < 0 && targetSteeringAngle > 0)) ? 
    STEERING_RETURN_SPEED : 
    STEERING_SPEED;         
  
  // Smoothly interpolate current steering angle towards target
  const steeringDelta = targetSteeringAngle - currentSteeringAngle;
  const maxSteeringDelta = steeringSpeed * deltaTime;
  
  let newSteeringAngle = currentSteeringAngle;
  
  // Limit the steering change per frame
  if (Math.abs(steeringDelta) > maxSteeringDelta) {
    newSteeringAngle += Math.sign(steeringDelta) * maxSteeringDelta;
  } else {
    newSteeringAngle = targetSteeringAngle;
  }
  
  // Apply steering to front wheels (Rapier API)
  for (let i = 0; i < 2; i++) {
    vehicle.setWheelSteering(i, newSteeringAngle);
  }
  
  return newSteeringAngle;
}

// Calculate max steering angle – wide at low speed, tighter at top speed
function calculateMaxSteeringAngle(speedKPH, isDrifting = false) {
  const MIN_ANGLE = 0.28;  // tight at top speed
  const MAX_ANGLE = 0.55;  // wide at low speed
  const MAX_SPEED = 180;

  const t = Math.max(0, Math.min(1, speedKPH / MAX_SPEED));
  const angle = MAX_ANGLE - t * (MAX_ANGLE - MIN_ANGLE);

  // Allow slightly more rotation into the drift
  return isDrifting ? Math.min(angle * 1.12, MAX_ANGLE * 1.1) : angle;
}

// Reset car position – Rapier version (no ammo param)
export function resetCarPosition(carBody, vehicle, currentSteeringAngle, currentGatePosition, currentGateQuaternion) {
  // Zero all movement
  carBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  carBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

  // Teleport to last gate position (+ 2 m up)
  carBody.setTranslation({
    x: currentGatePosition.x,
    y: currentGatePosition.y + 2,
    z: currentGatePosition.z,
  }, true);

  carBody.setRotation({
    x: currentGateQuaternion.x,
    y: currentGateQuaternion.y,
    z: currentGateQuaternion.z,
    w: currentGateQuaternion.w,
  }, true);

  // Reset steering on front wheels
  for (let i = 0; i < 2; i++) {
    vehicle.setWheelSteering(i, 0);
  }

  return 0; // new steering angle
}

// Update car and wheel positions from physics – Rapier version
// Signature change: `ammo` removed, `carBody` added as 2nd param
export function updateCarPosition(vehicle, carBody, carModel, wheelMeshes) {
  if (!vehicle || !carModel || !carBody) return;

  // Chassis transform comes directly from the Rapier rigid body
  const pos = carBody.translation(); // {x, y, z}
  const rot = carBody.rotation();    // {x, y, z, w}
  carModel.position.set(pos.x, pos.y, pos.z);
  carModel.quaternion.set(rot.x, rot.y, rot.z, rot.w);

  // Wheel transforms from vehicle controller
  // Rapier's DynamicRayCastVehicleController provides:
  //   wheelChassisConnectionPointCs(i) – local connection point
  //   wheelSuspensionLength(i)         – current compression
  //   wheelRotation(i)                 – spin angle on axle
  //   wheelIsInContact(i)              – ground contact flag
  const numWheels = vehicle.numWheels();
  const chassisQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const chassisPos  = new THREE.Vector3(pos.x, pos.y, pos.z);

  for (let i = 0; i < numWheels; i++) {
    if (!wheelMeshes[i]) continue;

    // Get the local connection point on the chassis
    const connCs = vehicle.wheelChassisConnectionPointCs(i);
    if (!connCs) continue;

    // Direction is down in local space {0, -1, 0}
    const suspLen = vehicle.wheelSuspensionLength(i) ?? SUSPENSION_REST_LENGTH;
    const spinAngle = vehicle.wheelRotation(i) ?? 0;

    // Compute wheel centre in local space: connection point + suspension direction * length
    const localWheelPos = new THREE.Vector3(connCs.x, connCs.y - suspLen, connCs.z);

    // Transform to world space
    const worldWheelPos = localWheelPos.applyQuaternion(chassisQuat).add(chassisPos);
    wheelMeshes[i].position.copy(worldWheelPos);

    // Wheel orientation: chassis rotation * spin rotation around the axle (X axis)
    const steerAngle = vehicle.wheelSteering(i) ?? 0;
    const wheelQuat = chassisQuat.clone();

    // Apply steering (Y-axis rotation) for front wheels (index 0, 1)
    if (i < 2) {
      wheelQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), steerAngle
      ));
    }

    // Apply spin rotation around the axle
    wheelQuat.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(-1, 0, 0), spinAngle
    ));

    wheelMeshes[i].quaternion.copy(wheelQuat);
  }
}