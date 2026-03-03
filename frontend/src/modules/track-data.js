/**
 * track-data.js — Track Metadata Loader
 *
 * Loads sidecar `track.json` files that describe racing surface metadata
 * for each track/arena: start grid, checkpoints, boundaries, item-box
 * positions, rescue height, etc.
 *
 * This data is NOT embedded in the .glb geometry — it lives in a small
 * JSON manifest next to each track model.
 *
 * Usage:
 *   import { loadTrackData, computeStartPositions } from './track-data.js';
 *   const td = await loadTrackData('map1');
 *   const spawns = computeStartPositions(td, 8);   // 8 karts
 */

// ── Cache ────────────────────────────────────────────────────────────────────
const _cache = new Map();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and cache the track.json manifest for a given track id.
 * Works for both custom maps (`/models/maps/{id}/track.json`) and
 * future STK tracks (`/models/stk/tracks/{id}/track.json`).
 *
 * @param {string} trackId  e.g. "map1", "cocoa_temple"
 * @param {object} [opts]
 * @param {"map"|"stk-track"|"stk-arena"} [opts.source="map"]
 * @returns {Promise<TrackData>}
 */
export async function loadTrackData(trackId, opts = {}) {
  if (_cache.has(trackId)) return _cache.get(trackId);

  const source = opts.source ?? 'map';
  let basePath;
  switch (source) {
    case 'stk-track': basePath = `/models/stk/tracks/${trackId}`; break;
    case 'stk-arena': basePath = `/models/stk/arenas/${trackId}`; break;
    default:          basePath = `/models/maps/${trackId}`;        break;
  }

  const url = `${basePath}/track.json`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const td  = normalise(raw, trackId, basePath);
    _cache.set(trackId, td);
    console.log(`[track-data] Loaded metadata for "${trackId}"`);
    return td;
  } catch (err) {
    console.warn(`[track-data] No track.json for "${trackId}" – using defaults`, err.message);
    const fallback = buildFallback(trackId, basePath);
    _cache.set(trackId, fallback);
    return fallback;
  }
}

/**
 * Compute per-kart start transforms from the track's start-grid spec.
 * Mimics STK's `DriveGraph::setDefaultStartPositions`:
 *   • Karts line up in rows behind the start point
 *   • Alternating left/right of centre
 *
 * @param {TrackData} td            loaded track data
 * @param {number}    numKarts      how many karts to place
 * @returns {Array<{x:number, y:number, z:number, heading:number}>}
 */
export function computeStartPositions(td, numKarts) {
  const s = td.start;
  const positions = [];

  const fwd  = s.forwardsDistance  ?? 2.0;
  const side = s.sidewardsDistance ?? 3.0;
  const up   = s.upwardsDistance   ?? 0.5;
  const cols = s.kartsPerRow       ?? 2;
  const heading = s.heading        ?? 0;

  // Direction vector — heading 0 = looking toward −Z (STK convention)
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);

  // Forward direction (direction karts face)
  const fwdX = -sinH;
  const fwdZ = -cosH;

  // Right direction (perpendicular)
  const rightX = cosH;
  const rightZ = -sinH;

  for (let i = 0; i < numKarts; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Centre columns around 0
    const halfCols = (cols - 1) / 2;
    const lateralOffset = (col - halfCols) * side;

    // Place behind the start line
    const forwardOffset = -(row + 1) * fwd;

    const x = s.position.x + fwdX * forwardOffset + rightX * lateralOffset;
    const y = s.position.y + up;
    const z = s.position.z + fwdZ * forwardOffset + rightZ * lateralOffset;

    positions.push({ x, y, z, heading });
  }

  return positions;
}

/**
 * Check if a world-space position is out-of-bounds and needs rescue.
 * @param {TrackData} td
 * @param {{x:number, y:number, z:number}} pos
 * @returns {boolean}
 */
export function isOutOfBounds(td, pos) {
  // Below rescue floor?
  if (pos.y < (td.rescueHeight ?? -20)) return true;

  // Outside bounding box?
  const b = td.bounds;
  if (b) {
    if (pos.x < b.min.x || pos.x > b.max.x) return true;
    if (pos.z < b.min.z || pos.z > b.max.z) return true;
  }

  return false;
}

/**
 * Retrieve cached track data synchronously. Returns null if not yet loaded.
 * @param {string} trackId
 * @returns {TrackData|null}
 */
export function getTrackData(trackId) {
  return _cache.get(trackId) ?? null;
}

/**
 * Clear the cache (useful for hot-reload during dev).
 */
export function clearTrackDataCache() {
  _cache.clear();
}

// ── Internal ─────────────────────────────────────────────────────────────────

/** Fill in any missing fields with sensible defaults. */
function normalise(raw, id, basePath) {
  return {
    id,
    name:          raw.name          ?? id,
    type:          raw.type          ?? 'race',       // race | arena
    version:       raw.version       ?? 1,
    defaultLaps:   raw.defaultLaps   ?? 3,
    reverseAvailable: raw.reverseAvailable ?? false,

    start: {
      position:          raw.start?.position          ?? { x: 0, y: 3, z: 0 },
      heading:           raw.start?.heading           ?? 0,
      kartsPerRow:       raw.start?.kartsPerRow       ?? 2,
      forwardsDistance:   raw.start?.forwardsDistance   ?? 2.0,
      sidewardsDistance:  raw.start?.sidewardsDistance  ?? 3.0,
      upwardsDistance:    raw.start?.upwardsDistance    ?? 0.5,
    },

    checkpoints:       raw.checkpoints       ?? [],
    bounds:            raw.bounds            ?? null,
    rescueHeight:      raw.rescueHeight      ?? -20,
    itemBoxPositions:  raw.itemBoxPositions  ?? [],

    scale:        raw.scale        ?? 1,
    modelUrl:     `${basePath}/${raw.model        ?? 'track.glb'}`,
    decorUrl:     `${basePath}/${raw.decorations  ?? 'decorations.glb'}`,
    gatesUrl:     raw.gates   ? `${basePath}/${raw.gates}`   : null,
    outlineUrl:   raw.outline ? `${basePath}/${raw.outline}` : null,

    // Keep the raw object for any game-mode-specific extras
    _raw: raw,
  };
}

/** Generate a bare-minimum fallback when no track.json exists. */
function buildFallback(id, basePath) {
  return normalise({}, id, basePath);
}

// ── Type doc (JSDoc only, no TS required) ────────────────────────────────────
/**
 * @typedef {object} TrackData
 * @property {string}  id
 * @property {string}  name
 * @property {"race"|"arena"} type
 * @property {number}  version
 * @property {number}  defaultLaps
 * @property {boolean} reverseAvailable
 * @property {StartGrid} start
 * @property {Checkpoint[]} checkpoints
 * @property {{min:{x,y,z}, max:{x,y,z}}|null} bounds
 * @property {number}  rescueHeight
 * @property {{x,y,z}[]} itemBoxPositions
 * @property {number}  scale
 * @property {string}  modelUrl
 * @property {string}  decorUrl
 * @property {string|null} gatesUrl
 * @property {string|null} outlineUrl
 *
 * @typedef {object} StartGrid
 * @property {{x,y,z}} position
 * @property {number}  heading         radians, 0 = facing −Z
 * @property {number}  kartsPerRow
 * @property {number}  forwardsDistance
 * @property {number}  sidewardsDistance
 * @property {number}  upwardsDistance
 *
 * @typedef {object} Checkpoint
 * @property {"lap"|"activate"} kind
 * @property {{x,z}} p1
 * @property {{x,z}} p2
 * @property {number} [minHeight]
 * @property {string} [activates]    id of next checkpoint
 */
