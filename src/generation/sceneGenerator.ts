import type { FoldingPlan, GenerationReport, IslandScene, MusicScore, Path3D, SoundObject, Vec3 } from "../core/types";
import { terrainGroundY } from "../core/terrain";
import { spatialFold, spatialFoldReport, runDeflectionPass } from "./spatialFold";
import { simulateParcours } from "./scoreSimulator";
import { compareProduced } from "./scoreCompare";

export type SceneGenerationResult = {
  scene: IslandScene;
  reports: GenerationReport[];
  plans: FoldingPlan[];
};

/**
 * Shared-space scene generator.
 *
 *   • Anchors (pitch class + octave + instrument) are SHARED across scores.
 *     Two scores that both need C4 piano reference the SAME physical anchor.
 *   • A globally shared "lowest octave" forces matching (pitchClass, octave)
 *     pairs to land at the same altitude across all scores — required for
 *     the dedup to be musically valid.
 *   • Aggregates (chord / phrase / drone) stay per-event with a per-score
 *     id suffix because their content varies per event.
 *   • No runtime suffix filter: every sound object on the island is always
 *     live — music truly emerges from spatial encounters regardless of
 *     which parcours plays.
 *
 * After per-score generation, a multi-path deflection pass routes every
 * path around brushes into other scores' objects until no path improves.
 */
export function generateSceneFromScores(scores: MusicScore[], seed = 12345): SceneGenerationResult {
  const terrain: IslandScene["terrain"] = {
    type: "simple_island",
    radius: 96,
    heightScale: 10,
    seed
  };

  // Global lowest octave so cross-score anchor positions are consistent.
  let globalLowestOctave = Number.POSITIVE_INFINITY;
  for (const score of scores) {
    for (const event of score.events) {
      for (const noteName of event.notes) {
        const match = noteName.match(/^[A-G]#?(-?\d+)$/);
        if (match) {
          const oct = parseInt(match[1], 10);
          if (oct < globalLowestOctave) globalLowestOctave = oct;
        }
      }
    }
  }
  if (!Number.isFinite(globalLowestOctave)) globalLowestOctave = 4;
  console.log(`  global lowestOctave = ${globalLowestOctave}`);

  type ScoreState = {
    score: MusicScore;
    index: number;
    path: Path3D;
    plan: FoldingPlan;
    ownObjects: SoundObject[];
  };

  const states: ScoreState[] = [];

  for (let index = 0; index < scores.length; index += 1) {
    const score = scores[index];
    const t = Date.now();
    const result = spatialFold(score, terrain, {
      seed,
      anchorIdSuffix: `_s${index}`,
      skipDeflection: true,
      lowestOctaveOverride: globalLowestOctave
    });
    // Drop audibleSuffix so the runtime fires every object, not just this
    // path's. The per-score suffix in object ids stays for uniqueness.
    const { audibleSuffix: _drop, ...pathRest } = result.path;
    const path = pathRest as Path3D;

    // Strip per-score suffix from ANCHOR ids only, so anchors with matching
    // (pitch class, octave, instrument) deduplicate to one shared physical
    // anchor across scores. Aggregates keep their per-score suffix because
    // each one represents a specific score event with its own content.
    const suffix = `_s${index}`;
    const renamedObjects = result.objects.map((object) =>
      object.id.startsWith("pc_") && object.id.endsWith(suffix)
        ? { ...object, id: object.id.slice(0, -suffix.length) }
        : object
    );

    console.log(`  spatialFold ${score.id}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
    states.push({ score, index, path, plan: result.plan, ownObjects: renamedObjects });
  }

  // Dedup: anchors with same canonical id (different scores requested the
  // same pitch) collapse to ONE physical anchor; aggregates always stay
  // distinct (per-score suffixes guarantee unique ids).
  const sharedObjects = (() => {
    const byId = new Map<string, SoundObject>();
    for (const state of states) {
      for (const object of state.ownObjects) {
        if (!byId.has(object.id)) byId.set(object.id, object);
      }
    }
    return [...byId.values()];
  })();

  // Multi-path deflection: each path is re-routed to dodge brushes from
  // every other score's objects. Object positions stay fixed.
  const MAX_GLOBAL_ITER = 4;
  for (let pass = 0; pass < MAX_GLOBAL_ITER; pass += 1) {
    let anyChanged = false;
    for (const state of states) {
      const before = countExtras(state.path, state.score, sharedObjects);
      if (before === 0) continue;
      const deflected = runDeflectionPass({
        path: state.path,
        score: state.score,
        terrain,
        objects: sharedObjects
      });
      const after = countExtras(deflected, state.score, sharedObjects);
      if (after < before) {
        state.path = deflected;
        anyChanged = true;
        console.log(`  deflect pass ${pass + 1} on ${state.score.id}: ${before} → ${after} extras`);
      }
    }
    if (!anyChanged) break;
  }

  const scene: IslandScene = {
    version: "0.1",
    meta: {
      name: "Museeka Demo Island",
      author: "Museeka",
      description: "Île générée par tissage spatial : chaque parcours rejoue sa partition par rencontres.",
      generatedAt: new Date(0).toISOString()
    },
    terrain,
    paths: states.map((s) => s.path),
    soundObjects: sharedObjects,
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
      defaultPathId: states[0]?.path.id ?? "path-01",
      audio: {
        masterVolume: 0.78,
        maxActiveVoices: 32
      }
    }
  };

  for (const state of states) {
    const sim = simulateParcours(state.path, sharedObjects);
    const cmp = compareProduced(state.score, sim.produced);
    state.plan.analysis = {
      produced: sim.produced,
      expected: cmp.expected,
      matches: cmp.matches,
      missing: cmp.missing,
      extra: cmp.extra,
      counts: cmp.counts,
      accuracy: cmp.accuracy
    };
  }

  return {
    scene,
    reports: states.map((s) => spatialFoldReport(s.plan)),
    plans: states.map((s) => s.plan)
  };
}

function countExtras(path: Path3D, score: MusicScore, objects: SoundObject[]): number {
  const sim = simulateParcours(path, objects);
  const cmp = compareProduced(score, sim.produced);
  return cmp.counts.extra;
}
