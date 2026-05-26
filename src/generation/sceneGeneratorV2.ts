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
 * Algorithm V2 — "shared-space, no runtime filter".
 *
 * Differences vs V1:
 *   • No runtime filter — every sound object is always live; music truly
 *     emerges from spatial encounters regardless of which parcours plays.
 *   • Each parcours still owns its anchors and aggregates (with a per-score
 *     id suffix so they remain distinct objects). The "sharing" happens via
 *     a global deflection pass that, for each path, steers around brushes
 *     into any other score's objects.
 *
 * The algorithm runs each score through V1 with deflection disabled, then
 * runs a multi-path deflection pass against the merged object pool until
 * no path has extras, or convergence stalls.
 */
export function generateSceneFromScoresV2(scores: MusicScore[], seed = 12345): SceneGenerationResult {
  const terrain: IslandScene["terrain"] = {
    type: "simple_island",
    radius: 96,
    heightScale: 10,
    seed
  };

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
      skipDeflection: true
    });
    // Drop audibleSuffix so the runtime plays every object, not just this
    // path's. The per-score suffix in object ids stays for uniqueness.
    const { audibleSuffix: _drop, ...pathRest } = result.path;
    const path = pathRest as Path3D;
    console.log(`  [v2] spatialFold ${score.id}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
    states.push({ score, index, path, plan: result.plan, ownObjects: result.objects });
  }

  const allObjects = (): SoundObject[] => states.flatMap((s) => s.ownObjects);

  // Multi-path deflection: each path is re-routed to dodge brushes from
  // every other score's objects. Iterate until no path improves.
  const MAX_GLOBAL_ITER = 4;
  for (let pass = 0; pass < MAX_GLOBAL_ITER; pass += 1) {
    let anyChanged = false;
    for (const state of states) {
      const before = countExtras(state.path, state.score, allObjects());
      if (before === 0) continue;
      const deflected = runDeflectionPass({
        path: state.path,
        score: state.score,
        terrain,
        objects: allObjects()
      });
      const after = countExtras(deflected, state.score, allObjects());
      if (after < before) {
        state.path = deflected;
        anyChanged = true;
        console.log(`  [v2] deflect pass ${pass + 1} on ${state.score.id}: ${before} → ${after} extras`);
      }
    }
    if (!anyChanged) break;
  }

  const sceneObjects = allObjects();
  const scene: IslandScene = {
    version: "0.1",
    meta: {
      name: "Museeka Demo Island (V2)",
      author: "Museeka",
      description: "Algo V2 — espace partagé, aucun filtre runtime.",
      generatedAt: new Date(0).toISOString()
    },
    terrain,
    paths: states.map((s) => s.path),
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
      defaultPathId: states[0]?.path.id ?? "path-01",
      audio: {
        masterVolume: 0.78,
        maxActiveVoices: 32
      }
    }
  };

  for (const state of states) {
    const sim = simulateParcours(state.path, sceneObjects);
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
