import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Function to load the track model and add to scene
// Signature change: `ammo` removed, `physicsWorld` replaced with `world`
export function loadTrackModel(mapId = 'map1', scene, world, loadingManager, callback) {
  // Use the loading manager with your loader
  const loader = new GLTFLoader(loadingManager);
  
  loader.load(
    `/models/maps/${mapId}/track.glb`,
    (gltf) => {
      const track = gltf.scene;
      
      // Scale to match the world scale
      track.scale.set(8, 8, 8);
      
      // Position at origin
      track.position.set(0, 0, 0);
      track.rotation.set(0, 0, 0);
      
      // Make sure track casts and receives shadows
      track.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true; // Enable for better lighting
          
          // Enhance track materials
          if (node.material) {
            node.material.roughness = 0.7;
            node.material.metalness = 0.3;
          }
        }
      });
      
      // Add to scene
      scene.add(track);
      console.log(`Map ${mapId} track loaded successfully`);
      
      // Add physics collider for the track
      addTrackCollider(track, world);
      
      // Call the callback with the track model if provided
      if (callback && typeof callback === 'function') {
        callback(track);
      }
    },
    (xhr) => {
      console.log(`Loading track: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
    },
    (error) => {
      console.error(`Error loading track for ${mapId}:`, error);
    }
  );
}

// Build a Rapier trimesh collider from every mesh in the loaded track model
function addTrackCollider(trackModel, world) {
  trackModel.updateMatrixWorld(true);

  const tempVert = new THREE.Vector3();
  let totalTriangles = 0;

  trackModel.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;

    child.updateMatrixWorld(true);
    const geo = child.geometry;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;

    const vertexCount = posAttr.count;

    // Build world-space vertex array
    const positions = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      tempVert.fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld);
      positions[i * 3]     = tempVert.x;
      positions[i * 3 + 1] = tempVert.y;
      positions[i * 3 + 2] = tempVert.z;
    }

    // Build index array (Rapier requires Uint32Array)
    let indices;
    if (geo.index) {
      const src = geo.index.array;
      indices = src instanceof Uint32Array ? src : new Uint32Array(src);
    } else {
      indices = new Uint32Array(vertexCount);
      for (let i = 0; i < vertexCount; i++) indices[i] = i;
    }

    if (positions.length === 0 || indices.length < 3) return;

    // Attach a static trimesh collider (no rigid body = fixed)
    const desc = RAPIER.ColliderDesc.trimesh(positions, indices)
      .setFriction(1.0)
      .setRestitution(0.1);
    world.createCollider(desc);

    totalTriangles += indices.length / 3;
  });

  console.log(`Track physics collider created: ${Math.round(totalTriangles)} triangles`);
}

// Function to load map decorations
export function loadMapDecorations(mapId = "map1", scene, renderer, camera, loadingManager) {
  // Use the loading manager with your loader
  const loader = new GLTFLoader(loadingManager);
  
  loader.load(
    `/models/maps/${mapId}/decorations.glb`,
    (gltf) => {
      const decorations = gltf.scene;
      
      // Scale to match track scale
      decorations.scale.set(8, 8, 8);
      decorations.position.set(0, 0, 0);
      
      // Important: Process all materials in the decoration model
      const materials = new Set();
      
      decorations.traverse((node) => {
        if (node.isMesh) {
          // Critical: Clone materials to ensure unique instances
          if (node.material) {
            // Add to set to track unique materials
            materials.add(node.material);
            
            // Create a new instance of the material
            node.material = node.material.clone();
            
            // Enhance material properties
            node.material.roughness = 0.7;
            node.material.metalness = 0.2;
            node.material.needsUpdate = true;
            
            // Enable shadows
            node.castShadow = true;
            node.receiveShadow = true;
          }
        }
      });
      
      console.log(`Processed ${materials.size} unique materials in decorations`);
      
      // Add to scene
      scene.add(decorations);
      
      // Force a renderer update to ensure materials are processed
      if (renderer && camera) {
        renderer.renderLists.dispose();
        renderer.render(scene, camera);
      }
      
      console.log(`Map ${mapId} decorations loaded successfully`);
    },
    undefined,
    (error) => {
      console.error(`Error loading map decorations for ${mapId}:`, error);
    }
  );
}

// Export checkGroundCollision – Rapier version (no ammo param)
export function checkGroundCollision(carBody, resetFunction) {
  if (!carBody) return;
  const pos = carBody.translation(); // plain {x, y, z}
  if (pos.y < 0) {
    console.log('Car fell off track – resetting');
    if (resetFunction) resetFunction();
  }
}