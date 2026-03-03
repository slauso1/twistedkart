import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Load a simple battle arena into the scene and physics world
// Signature change: `ammo` removed, `world` replaces `physicsWorld`
export function loadArena(scene, world, arenaId = 'box') {
  switch (arenaId) {
    case 'box':
    default:
      return createBoxArena(scene, world);
  }
}

function createBoxArena(scene, world) {
  // Dimensions
  const width = 100;
  const depth = 100;
  const wallHeight = 5;

  // ── Visual ground ─────────────────────────────────────────────────
  const groundGeometry = new THREE.PlaneGeometry(width, depth);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a, roughness: 0.8, metalness: 0.2,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── Physics ground (Rapier fixed box) ────────────────────────────
  const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(width / 2, 0.5, depth / 2).setFriction(0.9),
    groundBody
  );

  // ── Walls ─────────────────────────────────────────────────────────
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xff6b6b, roughness: 0.7,
  });

  const walls = [
    { pos: [0, wallHeight / 2, depth / 2],  rotY: 0,           size: [width, wallHeight, 1] },
    { pos: [0, wallHeight / 2, -depth / 2], rotY: 0,           size: [width, wallHeight, 1] },
    { pos: [width / 2,  wallHeight / 2, 0], rotY: Math.PI / 2, size: [depth, wallHeight, 1] },
    { pos: [-width / 2, wallHeight / 2, 0], rotY: Math.PI / 2, size: [depth, wallHeight, 1] },
  ];

  walls.forEach((w) => {
    // Visual mesh
    const wallGeo = new THREE.BoxGeometry(w.size[0], w.size[1], w.size[2]);
    const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
    wallMesh.position.set(w.pos[0], w.pos[1], w.pos[2]);
    wallMesh.rotation.y = w.rotY;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);

    // Physics body
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.rotY);
    const wallBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(w.pos[0], w.pos[1], w.pos[2])
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w.size[0] / 2, w.size[1] / 2, w.size[2] / 2).setFriction(0.7),
      wallBody
    );
  });

  // Visual grid
  const gridHelper = new THREE.GridHelper(width, 20, 0x000000, 0x000000);
  gridHelper.material.opacity = 0.2;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Spawn points
  const spawnPoints = [
    { x: 0,   y: 3, z: 0   },
    { x: 10,  y: 3, z: 0   },
    { x: -10, y: 3, z: 0   },
    { x: 0,   y: 3, z: 10  },
    { x: 0,   y: 3, z: -10 },
  ];

  return { spawnPoints, bounds: { width, depth } };
}

