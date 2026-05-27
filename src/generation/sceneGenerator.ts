import type {
  AudioGenerator,
  FoldingPlan,
  GenerationReport,
  InstrumentId,
  IslandScene,
  MusicEvent,
  MusicScore,
  Path3D,
  PathPoint,
  PitchClassAnchor,
  SoundField,
  SoundObject,
  Vec3
} from "../core/types";
import { terrainGroundY } from "../core/terrain";
import { simulateParcours } from "./scoreSimulator";
import { compareProduced } from "./scoreCompare";
import {
  noteNameToMidi,
  buildAnchorSoundObject,
  buildAggregateSoundObject,
  runDeflectionPass,
  ANCHOR_FIELD_RADIUS,
  ANCHOR_FIELD_ALTITUDE,
  MAX_PATH_SPEED
} from "./spatialFold";

export type SceneGenerationResult = {
  scene: IslandScene;
  reports: GenerationReport[];
  plans: FoldingPlan[];
};

/**
 * Organic incremental scene generation.
 *
 * No fixed chromatic ring. Objects are scattered organically as each
 * parcours is spatialised, one event at a time, in MIDI_SOURCES order:
 *
 *   1. For each NOTE event, look for an EXISTING note-object playing the
 *      right midi+instrument that is reachable within MAX_PATH_SPEED × gap
 *      from the current path position. If found → reuse it.
 *   2. Otherwise → create a NEW note-object at a candidate position that:
 *        - is within reach of the current path position,
 *        - doesn't sit inside any already-placed object's field,
 *        - doesn't sit on any PRIOR score's path trajectory (so playing
 *          that prior parcours won't brush this brand-new object).
 *   3. CHORD / PHRASE / DRONE events always make a new aggregate (event
 *      content is score-specific) placed under the same constraints.
 *
 * The firefly path is built simultaneously by adding a waypoint at each
 * chosen object position. A final multi-path deflection pass routes paths
 * around any residual brushes into other scores' objects.
 */
export function generateSceneFromScores(scores: MusicScore[], seed = 12345): SceneGenerationResult {
  const terrain: IslandScene["terrain"] = {
    type: "simple_island",
    radius: 96,
    heightScale: 10,
    seed
  };

  let globalLowestOctave = Number.POSITIVE_INFINITY;
  let globalHighestOctave = Number.NEGATIVE_INFINITY;
  for (const score of scores) {
    for (const event of score.events) {
      for (const noteName of event.notes) {
        const m = noteName.match(/^[A-G]#?(-?\d+)$/);
        if (m) {
          const oct = parseInt(m[1], 10);
          if (oct < globalLowestOctave) globalLowestOctave = oct;
          if (oct > globalHighestOctave) globalHighestOctave = oct;
        }
      }
    }
  }
  if (!Number.isFinite(globalLowestOctave)) globalLowestOctave = 4;
  if (!Number.isFinite(globalHighestOctave)) globalHighestOctave = globalLowestOctave;
  const octaveSpread = Math.max(1, globalHighestOctave - globalLowestOctave);
  const tintForOctave = (oct: number): number =>
    ((oct - globalLowestOctave) / octaveSpread) * 2 - 1; // → [-1, +1]

  const rng = mulberry32(seed);
  const noteObjects = new Map<string, SoundObject>(); // key = `${midi}_${instr}`
  const aggregateObjects: SoundObject[] = [];

  type PathBuild = {
    score: MusicScore;
    index: number;
    waypoints: PathPoint[];
    samples: Vec3[];
  };
  const builds: PathBuild[] = [];

  function allObjects(): SoundObject[] {
    return [...noteObjects.values(), ...aggregateObjects];
  }

  for (let scoreIndex = 0; scoreIndex < scores.length; scoreIndex += 1) {
    const score = scores[scoreIndex];
    const t0 = Date.now();
    const events = [...score.events].sort((a, b) => a.time - b.time);
    if (events.length === 0) continue;

    const startGround = terrainGroundY(0, -28, terrain);
    const waypoints: PathPoint[] = [{ t: 0, p: [0, Math.max(startGround + 12, 14), -28] }];
    let prevPos: Vec3 = waypoints[0].p;
    let prevT = 0;
    let prevObjectId: string | null = null;

    let createdAnchors = 0;
    let reusedAnchors = 0;

    for (const event of events) {
      const gapT = Math.max(0.06, event.time - prevT);
      const reach = MAX_PATH_SPEED * gapT * 0.85;

      let chosen: SoundObject | null = null;

      if (event.kind === "note") {
        const midi = noteNameToMidi(event.notes[0]);
        const key = `${midi}_${event.instrument}`;
        const existing = noteObjects.get(key);
        if (existing) {
          // ALWAYS reuse an existing same-note anchor — even if it's beyond
          // the reach budget. Creating a duplicate at a closer position
          // would mean the same musical note has two different physical
          // homes, which breaks the perceptual mapping (cycles in a canon
          // would visit different points each loop). The path may move
          // faster than ideal between cycles, but the music stays right.
          chosen = existing;
          reusedAnchors += 1;
        } else {
          const pos = pickPosition({
            from: prevPos,
            reach,
            terrain,
            midi,
            priorBuilds: builds,
            existingObjects: allObjects(),
            rng,
            isAggregate: false
          });
          chosen = createNoteObject(midi, event.instrument, pos, tintForOctave(midiOctave(midi)));
          noteObjects.set(key, chosen);
          createdAnchors += 1;
        }
      } else {
        const pos = pickPosition({
          from: prevPos,
          reach,
          terrain,
          midi: null,
          priorBuilds: builds,
          existingObjects: allObjects(),
          rng,
          isAggregate: true
        });
        chosen = createAggregateObjectFor(event, pos, scoreIndex, aggregateObjects.length);
        aggregateObjects.push(chosen);
      }

      if (!chosen) continue;

      // If we're revisiting the SAME anchor as last event, insert a release
      // waypoint between them so the path leaves the field cleanly and the
      // simulator's peak detector re-arms.
      if (chosen.id === prevObjectId) {
        const releaseT = (prevT + event.time) / 2;
        const releasePos = pickReleaseWaypoint(chosen.transform.position, prevPos);
        waypoints.push({ t: releaseT, p: releasePos });
      }

      waypoints.push({ t: event.time, p: chosen.transform.position });
      prevPos = chosen.transform.position;
      prevT = event.time;
      prevObjectId = chosen.id;
    }

    const exitGround = terrainGroundY(0, 28, terrain);
    waypoints.push({ t: score.duration, p: [0, Math.max(prevPos[1], exitGround + 8), 28] });

    // Sample the path so later scores avoid placing new objects on it.
    const samples: Vec3[] = [];
    const sampleDt = 0.15;
    const samplesCount = Math.ceil(score.duration / sampleDt);
    for (let i = 0; i <= samplesCount; i += 1) {
      const t = Math.min(score.duration, i * sampleDt);
      samples.push(samplePath(waypoints, t));
    }

    builds.push({ score, index: scoreIndex, waypoints, samples });
    console.log(`  [gen] ${score.id}: ${((Date.now() - t0) / 1000).toFixed(1)}s — ${createdAnchors} new anchors, ${reusedAnchors} reused, ${aggregateObjects.length} aggregates total`);
  }

  // Final deflection pass: each path may brush through OTHER scores'
  // objects (because we reused anchors that other scores' paths placed
  // far away, and the new path crosses where it shouldn't). The shared
  // deflection routine adds path waypoints to steer around them.
  const sceneObjectsForDeflection = allObjects();
  const MAX_GLOBAL_ITER = 4;
  for (let pass = 0; pass < MAX_GLOBAL_ITER; pass += 1) {
    let anyChanged = false;
    for (const build of builds) {
      const currentPath: Path3D = {
        id: build.score.id.replace(/_/g, "-"),
        name: build.score.name,
        duration: build.score.duration,
        mode: "flying",
        speedScale: 1,
        constraints: { maxSpeed: MAX_PATH_SPEED, maxAcceleration: 18, maxCurvature: 1.6, minGroundClearance: 1.5, maxGroundClearance: 60 },
        points: [...build.waypoints].sort((a, b) => a.t - b.t),
        interpolation: "catmull-rom"
      };
      const beforeSim = simulateParcours(currentPath, sceneObjectsForDeflection);
      const beforeCmp = compareProduced(build.score, beforeSim.produced);
      if (beforeCmp.counts.extra === 0) continue;
      const deflected = runDeflectionPass({
        path: currentPath,
        score: build.score,
        terrain,
        objects: sceneObjectsForDeflection
      });
      const afterSim = simulateParcours(deflected, sceneObjectsForDeflection);
      const afterCmp = compareProduced(build.score, afterSim.produced);
      if (afterCmp.counts.extra < beforeCmp.counts.extra) {
        build.waypoints = deflected.points;
        anyChanged = true;
        console.log(`  [gen] deflect pass ${pass + 1} on ${build.score.id}: ${beforeCmp.counts.extra} → ${afterCmp.counts.extra} extras`);
      }
    }
    if (!anyChanged) break;
  }

  // Build Path3D objects.
  const paths: Path3D[] = builds.map((build) => {
    const sorted = [...build.waypoints].sort((a, b) => a.t - b.t);
    const dedup: PathPoint[] = [];
    for (const pt of sorted) {
      const prev = dedup[dedup.length - 1];
      if (prev && Math.abs(prev.t - pt.t) < 0.001) continue;
      dedup.push(pt);
    }
    return {
      id: build.score.id.replace(/_/g, "-"),
      name: build.score.name,
      duration: build.score.duration,
      mode: "flying",
      speedScale: 1,
      constraints: { maxSpeed: MAX_PATH_SPEED, maxAcceleration: 18, maxCurvature: 1.6, minGroundClearance: 1.5, maxGroundClearance: 60 },
      points: dedup,
      interpolation: "catmull-rom"
    };
  });

  const sceneObjects = allObjects();

  const plans: FoldingPlan[] = builds.map((build, i) => {
    const path = paths[i];
    const sim = simulateParcours(path, sceneObjects);
    const cmp = compareProduced(build.score, sim.produced);
    const anchors: PitchClassAnchor[] = [...noteObjects.values()].map(anchorMetaFromObject);
    return {
      scoreId: build.score.id,
      pathId: path.id,
      anchors,
      motifs: [],
      aggregates: aggregateObjects,
      steps: [],
      reuseRate: 0,
      analysis: {
        produced: sim.produced,
        expected: cmp.expected,
        matches: cmp.matches,
        missing: cmp.missing,
        extra: cmp.extra,
        counts: cmp.counts,
        accuracy: cmp.accuracy
      }
    };
  });

  for (const plan of plans) {
    if (!plan.analysis) continue;
    console.log(`  [gen] ${plan.scoreId}: matched ${plan.analysis.counts.matched}/${plan.analysis.counts.expected} (${(plan.analysis.accuracy * 100).toFixed(1)}%), extras ${plan.analysis.counts.extra}`);
  }

  const scene: IslandScene = {
    version: "0.1",
    meta: {
      name: "Museeka Demo Island",
      author: "Museeka",
      description: "Île générée par placement organique incrémental — la luciole tisse les parcours en partageant les ancres entre morceaux.",
      generatedAt: new Date(0).toISOString()
    },
    terrain,
    paths,
    soundObjects: sceneObjects,
    visualObjects: [
      {
        id: "central_temple",
        kind: "temple",
        transform: { position: [0, terrainGroundY(0, 0, terrain) + 0.15, 0] as Vec3, rotation: [0, 20, 0], scale: [1.4, 1.4, 1.4] },
        visual: { model: "temple", color: "#d7d0a1", activeGlow: false }
      },
      {
        id: "north_waterfall",
        kind: "waterfall",
        transform: { position: [6, terrainGroundY(6, -34, terrain) + 1.8, -34] as Vec3, rotation: [0, 0, 0], scale: [1.2, 1.2, 1.2] },
        visual: { model: "waterfall", color: "#7dc7ff", activeGlow: false }
      }
    ],
    settings: {
      defaultPathId: paths[0]?.id ?? "path-01",
      audio: {
        masterVolume: 0.78,
        maxActiveVoices: 32
      }
    }
  };

  const reports: GenerationReport[] = plans.map((plan) => ({
    scoreId: plan.scoreId,
    pathId: plan.pathId,
    clusters: []
  }));

  return { scene, reports, plans };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function midiOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

function midiPitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

/**
 * Every note anchor sits at the same low altitude — the firefly walks
 * THROUGH each arch instead of having to fly to a sphere floating in the
 * sky. Each anchor has a unique XZ thanks to organic placement, so we
 * don't need altitude to distinguish octaves. Octave is encoded by colour
 * (see `tintByOctave`) instead.
 *
 * Sphere centred just above ground so the wireframe field sphere visibly
 * SITS INSIDE the arch. Field Y radius 1.6 m → sphere spans roughly
 * 0 → 3.2 m, matching the arch's ~2.5 m height.
 */
const ANCHOR_GROUND_OFFSET = 1.6;

function anchorGroundAltitude(ground: number): number {
  return ground + ANCHOR_GROUND_OFFSET;
}

function createNoteObject(
  midi: number,
  instrument: InstrumentId,
  position: Vec3,
  octaveTint: number // -1 (darkest = low octave) … +1 (lightest = high octave)
): SoundObject {
  const pitchClass = midiPitchClass(midi);
  const octave = midiOctave(midi);
  const anchor: PitchClassAnchor = {
    id: `note_${midi}_${instrument}`,
    pitchClass,
    octave,
    instrument,
    position,
    baseOctave: octave,
    visits: 1
  };
  const obj = buildAnchorSoundObject(anchor, 0.5);
  // Tint the visual color by octave so visually-distinct arches still
  // communicate their pitch register.
  obj.visual = { ...obj.visual, color: tintByOctave(obj.visual.color, octaveTint) };
  return obj;
}

function tintByOctave(hex: string, t: number): string {
  // t in [-1, 1]. Negative → mix with black (darken). Positive → mix with white.
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const target = t >= 0 ? 255 : 0;
  const amount = Math.min(1, Math.abs(t)) * 0.55;
  const mix = (c: number) => Math.round(c + (target - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function createAggregateObjectFor(event: MusicEvent, position: Vec3, scoreIndex: number, indexInScene: number): SoundObject {
  return buildAggregateSoundObject(event, position, indexInScene, `_s${scoreIndex}`);
}

type PickArgs = {
  from: Vec3;
  reach: number;
  terrain: IslandScene["terrain"];
  midi: number | null;
  priorBuilds: { samples: Vec3[] }[];
  existingObjects: SoundObject[];
  rng: () => number;
  isAggregate: boolean;
};

function pickPosition(args: PickArgs): Vec3 {
  const { from, reach, terrain, midi, priorBuilds, existingObjects, rng, isAggregate } = args;
  const ownRadius = isAggregate ? 2.5 : ANCHOR_FIELD_RADIUS;
  const islandBound = terrain.radius * 0.88;
  const TRIES = 64;

  // Tiered constraint relaxation: try the strict criteria first; if no
  // candidate satisfies, progressively loosen so we always place rather
  // than dropping the event entirely.
  const tiers = [
    { minClearance: 1.5, priorMargin: 1.5, reachMul: 1.0 },
    { minClearance: 0.5, priorMargin: 0.5, reachMul: 1.5 },
    { minClearance: 0.0, priorMargin: 0.0, reachMul: 3.0 }
  ];

  for (const tier of tiers) {
    let best: { pos: Vec3; score: number } | null = null;
    const effectiveReach = reach * tier.reachMul;
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const radial = Math.min(effectiveReach, 3 + rng() * Math.max(2, effectiveReach - 3));
      const x = from[0] + Math.cos(angle) * radial;
      const z = from[2] + Math.sin(angle) * radial;
      if (Math.hypot(x, z) > islandBound) continue;
      const ground = terrainGroundY(x, z, terrain);
      // Every object (anchor + aggregate) sits just above ground so the
      // firefly walks THROUGH the visual to trigger it. Octave is encoded
      // via color tint on anchors, not altitude.
      const y = anchorGroundAltitude(ground);
      const candidate: Vec3 = [x, y, z];

      let collides = false;
      for (const o of existingObjects) {
        const op = o.transform.position;
        const horiz = Math.hypot(x - op[0], z - op[2]);
        const vert = Math.abs(y - op[1]);
        const otherR = fieldRadiusXZApprox(o.field);
        if (horiz < ownRadius + otherR + tier.minClearance && vert < ANCHOR_FIELD_ALTITUDE + 1) {
          collides = true;
          break;
        }
      }
      if (collides) continue;

      let intrudes = false;
      for (const build of priorBuilds) {
        for (const sample of build.samples) {
          const horiz = Math.hypot(x - sample[0], z - sample[2]);
          const vert = Math.abs(y - sample[1]);
          if (horiz < ownRadius + tier.priorMargin && vert < ANCHOR_FIELD_ALTITUDE + 0.5) {
            intrudes = true;
            break;
          }
        }
        if (intrudes) break;
      }
      if (intrudes) continue;

      const dist = Math.hypot(x - from[0], z - from[2]);
      const edgePenalty = Math.max(0, Math.hypot(x, z) - islandBound * 0.7);
      const score = -dist - edgePenalty * 0.5;
      if (!best || score > best.score) best = { pos: candidate, score };
    }
    if (best) return best.pos;
  }

  // True last resort: a position immediately next to `from`, ignoring
  // every constraint. Should be extremely rare.
  const fallbackAngle = rng() * Math.PI * 2;
  const fallbackDist = Math.min(reach * 2, 4);
  const fx = from[0] + Math.cos(fallbackAngle) * fallbackDist;
  const fz = from[2] + Math.sin(fallbackAngle) * fallbackDist;
  const fg = terrainGroundY(fx, fz, terrain);
  const fy = anchorGroundAltitude(fg);
  return [fx, fy, fz];
}

function pickReleaseWaypoint(anchorPos: Vec3, prevPos: Vec3): Vec3 {
  // Move halfway along (prev → anchor), then push outward perpendicular by
  // 2× field radius so the path exits the field cleanly.
  const mid: Vec3 = [
    (anchorPos[0] + prevPos[0]) / 2,
    (anchorPos[1] + prevPos[1]) / 2 + 2,
    (anchorPos[2] + prevPos[2]) / 2
  ];
  const dx = anchorPos[0] - prevPos[0];
  const dz = anchorPos[2] - prevPos[2];
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;
  const offset = ANCHOR_FIELD_RADIUS * 2.2;
  return [mid[0] + px * offset, mid[1], mid[2] + pz * offset];
}

function fieldRadiusXZApprox(field: SoundField): number {
  if (field.shape === "sphere") return field.params.radius;
  if (field.shape === "ellipsoid") return Math.max(field.params.radius[0], field.params.radius[2]);
  if (field.shape === "cone") return field.params.range;
  return field.params.centerRadius;
}

function distance3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function samplePath(waypoints: PathPoint[], time: number): Vec3 {
  if (waypoints.length === 0) return [0, 0, 0];
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  if (time <= sorted[0].t) return [...sorted[0].p] as Vec3;
  if (time >= sorted[sorted.length - 1].t) return [...sorted[sorted.length - 1].p] as Vec3;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].t >= time) {
      const a = sorted[i - 1];
      const b = sorted[i];
      const u = (time - a.t) / Math.max(0.0001, b.t - a.t);
      return [
        a.p[0] + (b.p[0] - a.p[0]) * u,
        a.p[1] + (b.p[1] - a.p[1]) * u,
        a.p[2] + (b.p[2] - a.p[2]) * u
      ];
    }
  }
  return [...sorted[sorted.length - 1].p] as Vec3;
}

function anchorMetaFromObject(object: SoundObject): PitchClassAnchor {
  const audio = object.audio as Extract<AudioGenerator, { generator: "note" }>;
  const midi = noteNameToMidi(audio.baseNote);
  return {
    id: object.id,
    pitchClass: midiPitchClass(midi),
    octave: midiOctave(midi),
    instrument: audio.instrument,
    position: object.transform.position,
    baseOctave: midiOctave(midi),
    visits: 1
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
