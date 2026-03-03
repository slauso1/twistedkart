# GLO Karts — Track Implementation Strategy

## Problem

Players spawn in non-viable areas because tracks lack defined drivable surfaces,
start/finish lines, and track boundaries. The converted STK `.glb` files contain
only geometry and textures — the metadata that defines **where karts can drive**
was stripped during the Blender-to-glTF export.

## Root Cause Analysis

SuperTuxKart defines track racing data in **three XML files** alongside the 3D
model:

| File | Purpose |
|------|---------|
| `quads.xml` | Series of 4-vertex quads forming the **driveline** (racing surface centreline). Quad 0 = start/finish line. |
| `graph.xml` | Connectivity / successor graph between quads. Defines main loop, shortcuts, and alternate routes. |
| `scene.xml` | Scene graph — contains `<default-start>` (grid spacing), `<checks>` (lap/checkpoint lines), `<cannon>` (jumps), item placements. |

Additionally, arenas use a `navmesh.xml` (vertex-soup polygons with adjacency)
instead of a driveline.

None of these files made it into the `.glb` exports in `public/models/stk/`.

## Solution: Sidecar `track.json` Metadata

Rather than trying to embed XML data into glTF or re-export from Blender, we use
a **sidecar JSON manifest** that sits next to each `.glb` file:

```
public/models/maps/map1/
  ├── track.glb           ← geometry + textures (unchanged)
  ├── decorations.glb
  ├── gates.glb
  ├── track-outline.glb
  └── track.json          ← NEW: racing metadata
```

### track.json Specification

```jsonc
{
  "id": "map1",
  "name": "GLO Karts - Map 1",
  "type": "race",               // "race" | "arena"
  "version": 1,
  "defaultLaps": 3,
  "reverseAvailable": false,

  "start": {
    "position": { "x": 0, "y": 2.5, "z": 5 },   // world-space start point
    "heading": 0,                 // radians, 0 = facing −Z
    "kartsPerRow": 2,             // grid columns
    "forwardsDistance": 2.0,      // row spacing (behind start line)
    "sidewardsDistance": 3.0,     // column spacing
    "upwardsDistance": 0.5        // height offset above surface
  },

  "checkpoints": [
    { "kind": "lap",      "p1": {"x":-5,"z":5}, "p2": {"x":5,"z":5} },
    { "kind": "activate", "p1": {...}, "p2": {...}, "activates": "..." }
  ],

  "bounds": {                     // out-of-bounds rescue box
    "min": { "x": -80, "y": -10, "z": -80 },
    "max": { "x":  80, "y":  50, "z":  80 }
  },

  "rescueHeight": -5,            // Y threshold for instant rescue

  "itemBoxPositions": [           // server-side item box spawns
    { "x": 0, "y": 2, "z": -20 },
    ...
  ],

  "scale": 8,                    // geometry scale factor
  "model": "track.glb",
  "decorations": "decorations.glb",
  "gates": "gates.glb",
  "outline": "track-outline.glb"
}
```

Arenas add a `spawnPoints` array instead of grid parameters.

### Runtime Loader: `track-data.js`

The new module (`src/modules/track-data.js`) provides:

| Function | Purpose |
|----------|---------|
| `loadTrackData(id)` | Async fetch + cache of `track.json` |
| `computeStartPositions(td, n)` | Builds an array of N kart spawn transforms from the grid spec |
| `isOutOfBounds(td, pos)` | Returns true if position needs rescue |
| `getTrackData(id)` | Sync cache lookup |

### Integration Points

1. **`main.js`** — calls `loadTrackData()` before creating the car, passes start
   position to `createVehicle()`, uses `isOutOfBounds()` for rescue detection.

2. **`car.js`** — `createVehicle()` now accepts an optional `startPos` parameter
   to set initial chassis translation.

3. **Server rooms** — `RaceRoom.js` / `BattleRoom.js` can read `itemBoxPositions`
   from the track data to place item boxes on the actual track instead of random
   radius.

---

## STK Track Data Extraction

### Source

All STK track XML data lives in the official SVN repository:
```
https://svn.code.sf.net/p/supertuxkart/code/stk-assets/tracks/{id}/
```

### Extraction Script

`scripts/generate-stk-track-json.js` contains pre-extracted start positions for
all 18+ STK tracks (parsed from `quads.xml` quad 0 centres). Running the script
generates `track.json` files for any STK track directories present locally.

### Start Position Formula

STK computes kart grid positions from the **first driveline quad**:

1. Find the centre of quad 0 → this is the start line
2. Walk backward along the driveline (predecessor quads)
3. Place karts in rows of `kartsPerRow`, alternating left/right of centre
4. Each row is `forwardsDistance` metres behind the previous
5. Columns are `sidewardsDistance` metres apart

Our `computeStartPositions()` recreates this algorithm using the heading angle
and row/column layout from `track.json`.

---

## Strategy for New / Custom Tracks

### Option A: Hand-Authored (Recommended for Custom Tracks)

1. Model the track in Blender
2. Export as `.glb`
3. Manually create `track.json` with:
   - Walk through the 3D scene to identify start position coords
   - Place checkpoint lines at key track points
   - Define bounding box
   - Place item box positions along the racing line

This is the simplest approach and gives full control. Use the Blender viewport
or a runtime debug overlay to read coordinates.

### Option B: Semi-Automated (For STK Tracks)

1. Parse `quads.xml` → extract quad 0 centre as start position
2. Parse `scene.xml` → extract `<checks>` as checkpoints
3. Parse `graph.xml` → compute bounding box from all quads
4. Output `track.json`

The extraction script already handles step 1. Steps 2-4 can be extended.

### Option C: Procedural Track Generation

For future expansion, a track generator could:

1. Generate a spline-based centreline
2. Extrude road geometry along the spline
3. Auto-place checkpoints at regular intervals
4. Auto-compute driveline quads for AI pathfinding
5. Export both `.glb` and `track.json` simultaneously

This is a Phase 5/6 feature and would integrate with a track editor tool.

### Option D: Runtime Mesh Analysis

At load time, analyze the `.glb` mesh:

1. Identify road surfaces by material name (e.g., `road_*`, `asphalt_*`)
2. Compute a bounding box of road geometry
3. Raycast downward at grid points to find drivable height
4. Generate spawn positions from the lowest viable Y point

This is a fallback for tracks without `track.json` and is approximate. The
`buildFallback()` function in `track-data.js` handles this case with safe
defaults.

---

## File Summary

| File | Status | Purpose |
|------|--------|---------|
| `frontend/src/modules/track-data.js` | **NEW** | Runtime track metadata loader |
| `frontend/public/models/maps/map1/track.json` | **NEW** | Map 1 racing metadata |
| `frontend/public/models/maps/map2/track.json` | **NEW** | Map 2 racing metadata |
| `scripts/generate-stk-track-json.js` | **NEW** | STK metadata extraction script |
| `frontend/src/main.js` | **MODIFIED** | Imports track-data, uses start positions |
| `frontend/src/modules/car.js` | **MODIFIED** | `createVehicle()` accepts startPos |

---

## Next Steps

1. **Test** — Verify karts now spawn on the track surface for map1/map2
2. **Run extraction** — Execute `generate-stk-track-json.js` to create track.json
   files for all STK tracks with .glb directories
3. **Refine positions** — Load each STK track and visually verify/adjust the start
   positions in their `track.json` files
4. **Add checkpoints** — Parse `scene.xml` check-lines for remaining tracks
5. **Server integration** — Update `RaceRoom.js` to read `itemBoxPositions` from
   track metadata instead of random placement
6. **Track editor** — Build a debug overlay tool for positioning start lines and
   checkpoints visually in-game
