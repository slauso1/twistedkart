#!/usr/bin/env node
/**
 * generate-stk-track-json.js
 *
 * Generates `track.json` sidecar metadata files for converted STK tracks.
 *
 * Data sources:
 *   - Start positions extracted from quads.xml (first quad = start line)
 *     at: https://svn.code.sf.net/p/supertuxkart/code/stk-assets/tracks/{id}/quads.xml
 *   - Track info from track.xml (name, laps, arena flag)
 *   - Checkline data from scene.xml
 *
 * Since the .glb exports preserve STK's Y-up coordinate system and original
 * units, positions are used 1:1 without transformation.
 *
 * Usage:
 *   node scripts/generate-stk-track-json.js [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Extracted STK track data ─────────────────────────────────────────────────
// Start positions derived from the centre of quad 0 in each track's quads.xml.
// Heading is estimated from the quad orientation (p0→p3 direction).

const STK_TRACKS = {
  abyss: {
    name: 'Abyss',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -5.842, y: 1.506, z: -131.870 },
    // Quad 0 runs roughly along Z, heading ≈ 0
    heading: 0,
    checkpoints: [
      { kind: 'lap', p1: { x: -6.88, z: -136.87 }, p2: { x: -4.85, z: -136.88 } }
    ]
  },
  black_forest: {
    name: 'Black Forest',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -104.994, y: 6.232, z: 63.053 },
    heading: -0.65, // diagonal quad
    checkpoints: []
  },
  candela_city: {
    name: 'Candela City',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -11.614, y: -9.951, z: 110.551 },
    heading: -0.4,
    checkpoints: []
  },
  cocoa_temple: {
    name: 'Cocoa Temple',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 26.168, y: -1.434, z: 43.756 },
    heading: 0,
    checkpoints: [
      { kind: 'lap',      p1: { x: 281.82, z: -42.82 }, p2: { x: 270.62, z: -58.40 } },
      { kind: 'activate', p1: { x: -38.02, z: -222.26 }, p2: { x: -61.97, z: -228.00 } }
    ]
  },
  cornfield_crossing: {
    name: 'Cornfield Crossing',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 0.410, y: 0.355, z: 21.760 },
    heading: 0,
    checkpoints: [
      { kind: 'lap',      p1: { x: 189.89, z: 52.45 }, p2: { x: 173.63, z: 52.45 } },
      { kind: 'activate', p1: { x: 128.35, z: -246.91 }, p2: { x: 112.09, z: -246.91 } }
    ]
  },
  gran_paradiso_island: {
    name: 'Gran Paradiso Island',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 132.111, y: 5.992, z: 86.830 },
    heading: 0.83,
    checkpoints: []
  },
  hacienda: {
    name: 'Hacienda',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 0, y: -0.990, z: 5.000 },
    heading: 0,
    checkpoints: []
  },
  lighthouse: {
    name: 'Around the Lighthouse',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 26.262, y: -14.323, z: -51.253 },
    heading: 0,
    checkpoints: []
  },
  mines: {
    name: 'Old Mine',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 0.349, y: -0.120, z: 15.354 },
    heading: 0,
    checkpoints: []
  },
  minigolf: {
    name: 'Minigolf',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -0.078, y: 0.483, z: -40.984 },
    heading: Math.PI,
    checkpoints: []
  },
  olivermath: {
    name: 'Oliver\'s Math Class',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -13.293, y: -0.064, z: -2.884 },
    heading: -0.1,
    checkpoints: []
  },
  sandtrack: {
    name: 'Shifting Sands',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 1.373, y: -140.338, z: 11.154 },
    heading: 0,
    checkpoints: []
  },
  scotland: {
    name: 'Northern Resort',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -1.569, y: 0.378, z: 5.496 },
    heading: 0,
    checkpoints: []
  },
  snowmountain: {
    name: 'Snow Mountain',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 0.024, y: -2.241, z: 5.187 },
    heading: 0,
    checkpoints: []
  },
  snowtuxpeak: {
    name: 'Snow Tux Peak',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -197.576, y: -0.056, z: 37.242 },
    heading: 0.13,
    checkpoints: []
  },
  stk_enterprise: {
    name: 'STK Enterprise',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -7.241, y: -1.851, z: 45.412 },
    heading: Math.PI,
    checkpoints: []
  },
  volcano_island: {
    name: 'Volcano Island',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -36.382, y: 12.980, z: -135.975 },
    heading: Math.PI / 2,
    checkpoints: []
  },
  xr591: {
    name: 'XR591',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: -0.329, y: 0.402, z: -12.348 },
    heading: 0,
    checkpoints: []
  },
  zengarden: {
    name: 'Zen Garden',
    type: 'race',
    defaultLaps: 3,
    startCenter: { x: 1.493, y: 0.258, z: 0.121 },
    heading: 0,
    checkpoints: []
  }
};

const STK_ARENAS = {
  battleisland: {
    name: 'Battle Island',
    type: 'arena',
    startCenter: { x: 0, y: 1, z: 0 },    // navmesh centre approximation
    spawnPoints: [
      { x: 10,  y: 2, z: 10 },
      { x: -10, y: 2, z: 10 },
      { x: 10,  y: 2, z: -10 },
      { x: -10, y: 2, z: -10 },
      { x: 0,   y: 2, z: 0 },
      { x: 20,  y: 2, z: 0 },
    ]
  },
  fortmagma: {
    name: 'Fort Magma',
    type: 'arena',
    startCenter: { x: -72.082, y: 1.0, z: 52.425 },
    spawnPoints: [
      { x: -72, y: 2, z: 52 },
      { x: -65, y: 2, z: 47 },
      { x: -78, y: 2, z: 47 },
      { x: -72, y: 2, z: 58 },
      { x: -65, y: 2, z: 58 },
      { x: -78, y: 2, z: 58 },
    ]
  },
  stadium: {
    name: 'The Stadium',
    type: 'arena',
    startCenter: { x: 0, y: 0, z: 0 },
    spawnPoints: [
      { x: 10,  y: 2, z: 10 },
      { x: -10, y: 2, z: 10 },
      { x: 10,  y: 2, z: -10 },
      { x: -10, y: 2, z: -10 },
      { x: 0,   y: 2, z: 0 },
      { x: 20,  y: 2, z: 0 },
    ]
  }
};

// ── Generator ────────────────────────────────────────────────────────────────

function buildTrackJson(id, data) {
  const isArena = data.type === 'arena';

  const json = {
    id,
    name: data.name,
    type: data.type,
    version: 1,
    defaultLaps: data.defaultLaps ?? 3,
    reverseAvailable: false,

    start: {
      position: data.startCenter,
      heading: data.heading ?? 0,
      kartsPerRow: 2,
      forwardsDistance: 2.0,
      sidewardsDistance: 3.0,
      upwardsDistance: 0.5
    },

    checkpoints: data.checkpoints ?? [],

    bounds: null,     // TODO: compute from quad bounding box when available
    rescueHeight: data.startCenter.y - 30,

    itemBoxPositions: generateItemBoxPositions(data.startCenter, 8),

    scale: 1,         // STK tracks are loaded unscaled
    model: isArena ? 'arena.glb' : 'track.glb',
  };

  if (isArena && data.spawnPoints) {
    json.spawnPoints = data.spawnPoints;
  }

  return json;
}

/** Generate N item box positions in a circle around the start position. */
function generateItemBoxPositions(centre, count) {
  const radius = 20;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    positions.push({
      x: Math.round((centre.x + Math.cos(angle) * radius) * 100) / 100,
      y: Math.round((centre.y + 2) * 100) / 100,
      z: Math.round((centre.z + Math.sin(angle) * radius) * 100) / 100
    });
  }
  return positions;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run');

const tracksDir  = path.resolve(__dirname, '../frontend/public/models/stk/tracks');
const arenasDir  = path.resolve(__dirname, '../frontend/public/models/stk/arenas');

let created = 0;
let skipped = 0;

// Race tracks
for (const [id, data] of Object.entries(STK_TRACKS)) {
  const dir  = path.join(tracksDir, id);
  const file = path.join(dir, 'track.json');

  if (!fs.existsSync(dir)) {
    console.log(`  SKIP ${id} — no .glb directory at ${dir}`);
    skipped++;
    continue;
  }

  const json = buildTrackJson(id, data);
  if (dryRun) {
    console.log(`  DRY  ${id} → ${file}`);
    console.log(JSON.stringify(json, null, 2).slice(0, 200) + '…\n');
  } else {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    console.log(`  WRITE ${file}`);
  }
  created++;
}

// Arenas
for (const [id, data] of Object.entries(STK_ARENAS)) {
  const dir  = path.join(arenasDir, id);
  const file = path.join(dir, 'track.json');

  if (!fs.existsSync(dir)) {
    console.log(`  SKIP ${id} — no .glb directory at ${dir}`);
    skipped++;
    continue;
  }

  const json = buildTrackJson(id, data);
  if (dryRun) {
    console.log(`  DRY  ${id} → ${file}`);
    console.log(JSON.stringify(json, null, 2).slice(0, 200) + '…\n');
  } else {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    console.log(`  WRITE ${file}`);
  }
  created++;
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
if (dryRun) console.log('(dry run — no files written)');
