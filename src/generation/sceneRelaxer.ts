import type { FoldingPlan, IslandScene, MusicScore, Path3D, SoundObject, Vec3 } from "../core/types";
import { spatialFold } from "./spatialFold";
import { simulateParcours } from "./scoreSimulator";
import { compareProduced } from "./scoreCompare";
import { terrainGroundY } from "../core/terrain";

export type GeneratedScene = {
  score: MusicScore;
  path: Path3D;
  objects: SoundObject[];
  plan: FoldingPlan;
};

type Measure = {
  scoreId: string;
  matched: number;
  extras: number;
  extraBySource: Map<string, number>;
};

const MAX_ITERATIONS = 100;
const ANGLE_OFFSETS_DEG = [10, -10, 20, -20, 35, -35, 55, -55, 80, -80, 110, -110, 150, -150];
const RADIAL_VARIATIONS = [0, 2, -2, 4, -4, 7, -7];
/** Above this many expected notes, the relaxer regeneration cost dwarfs any
 * accuracy gain and we skip the relaxer for that score's culprits. We still
 * run it on the smaller scenes alongside. */
const RELAXER_SKIP_EXPECTED_THRESHOLD = 500;

function measure(scene: GeneratedScene, _allObjects: SoundObject[]): Measure {
  // The runtime filters to objects with the path's suffix at playback time,
  // so simulate the same filtered set — exactly what the runtime will play.
  const suffix = scene.path.audibleSuffix ?? "";
  const activeObjects = suffix ? scene.objects.filter((o) => o.id.endsWith(suffix)) : scene.objects;
  const sim = simulateParcours(scene.path, activeObjects);
  const cmp = compareProduced(scene.score, sim.produced);
  const extraBySource = new Map<string, number>();
  for (const extra of cmp.extra) {
    extraBySource.set(extra.sourceObjectId, (extraBySource.get(extra.sourceObjectId) ?? 0) + 1);
  }
  return {
    scoreId: scene.score.id,
    matched: cmp.counts.matched,
    extras: cmp.counts.extra,
    extraBySource
  };
}

function mergeObjects(scenes: GeneratedScene[]): SoundObject[] {
  const byId = new Map<string, SoundObject>();
  for (const scene of scenes) {
    for (const object of scene.objects) {
      if (!byId.has(object.id)) byId.set(object.id, object);
    }
  }
  return [...byId.values()];
}

function generateCandidates(currentPos: Vec3, terrain: IslandScene["terrain"]): Vec3[] {
  const [cx, , cz] = currentPos;
  const baseRadial = Math.hypot(cx, cz);
  const baseAngle = Math.atan2(cz, cx);
  const candidates: Vec3[] = [];
  for (const angleDeg of ANGLE_OFFSETS_DEG) {
    for (const dr of RADIAL_VARIATIONS) {
      const ang = baseAngle + (angleDeg * Math.PI) / 180;
      const r = Math.max(8, baseRadial + dr);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const ground = terrainGroundY(x, z, terrain);
      // Preserve the original altitude offset above the ground so the field's
      // bottom still touches the visual rendered on the terrain.
      const aboveGround = currentPos[1] - terrainGroundY(cx, cz, terrain);
      const y = ground + Math.max(0.5, aboveGround);
      candidates.push([x, y, z]);
    }
  }
  return candidates;
}

function buildOverrideMap(scene: GeneratedScene): Map<string, Vec3> {
  return new Map(scene.objects.map((object) => [object.id, object.transform.position]));
}

function nonRegression(trial: Measure[], baseline: Measure[]): boolean {
  for (let i = 0; i < trial.length; i += 1) {
    if (trial[i].matched < baseline[i].matched) return false;
    if (trial[i].extras > baseline[i].extras) return false;
  }
  return true;
}

function pickWorstScene(measures: Measure[], expectedSizes: number[]): number {
  let bestIdx = -1;
  let bestExtras = 0;
  for (let i = 0; i < measures.length; i += 1) {
    // Skip scenes too large to relax in reasonable time.
    if (expectedSizes[i] > RELAXER_SKIP_EXPECTED_THRESHOLD) continue;
    if (measures[i].extras > bestExtras) {
      bestExtras = measures[i].extras;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function pickWorstAggregate(measure: Measure): string | null {
  let worstId: string | null = null;
  let worstCount = 0;
  for (const [id, count] of measure.extraBySource) {
    if (!id.startsWith("aggregate_")) continue;
    if (count > worstCount) {
      worstCount = count;
      worstId = id;
    }
  }
  return worstId;
}

function regenerateScene(scene: GeneratedScene, terrain: IslandScene["terrain"], overrides: Map<string, Vec3>): GeneratedScene {
  const result = spatialFold(scene.score, terrain, { positionOverrides: overrides });
  return { score: scene.score, path: result.path, objects: result.objects, plan: result.plan };
}

/**
 * Greedy spatial relaxation: identify the SoundObject responsible for the most
 * extras in any score, try alternative positions for it, accept the first move
 * that strictly reduces that score's extras without regressing any other score.
 *
 * Generic algorithm: no demo-specific tuning. Operates on simulator output
 * (purely structural feedback loop).
 */
export function relaxScenes(scenes: GeneratedScene[], terrain: IslandScene["terrain"], opts: { verbose?: boolean } = {}): GeneratedScene[] {
  const log = (msg: string) => { if (opts.verbose) console.log("[relaxer] " + msg); };
  let current = scenes.map((scene) => ({ ...scene }));
  let baseline = current.map((scene) => measure(scene, mergeObjects(current)));
  const expectedSizes = current.map((scene) => scene.plan.analysis?.counts.expected ?? 0);
  const triedPositions = new Set<string>();
  let triesSinceProgress = 0;

  log(`baseline: ${baseline.map((m) => `${m.scoreId}=${m.matched}m/${m.extras}e`).join(" ")}`);

  for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
    const worstIdx = pickWorstScene(baseline, expectedSizes);
    if (worstIdx < 0 || baseline[worstIdx].extras === 0) {
      log(`iter ${iter}: no scene with extras > 0 → stop`);
      break;
    }

    const worstScene = current[worstIdx];
    const worstObjectId = pickWorstAggregate(baseline[worstIdx]);
    if (!worstObjectId) {
      log(`iter ${iter}: no aggregate culprit in ${baseline[worstIdx].scoreId} → stop`);
      break;
    }
    const worstObject = worstScene.objects.find((o) => o.id === worstObjectId);
    if (!worstObject) {
      log(`iter ${iter}: object ${worstObjectId} not found → stop`);
      break;
    }

    const candidates = generateCandidates(worstObject.transform.position, terrain);
    log(`iter ${iter}: trying ${candidates.length} candidates for ${worstObjectId} (current extras ${baseline[worstIdx].extras})`);
    let accepted = false;
    let bestCandidateExtras = baseline[worstIdx].extras;
    for (const cand of candidates) {
      const key = `${worstIdx}|${worstObjectId}|${cand[0].toFixed(2)}|${cand[2].toFixed(2)}`;
      if (triedPositions.has(key)) continue;
      triedPositions.add(key);

      // Build per-scene override map: only the affected scene gets the override.
      // Other scenes are regenerated from their original (= current) state.
      // Only regenerate + re-measure the affected scene; other scenes are unchanged.
      const newScene = (() => {
        const overrides = buildOverrideMap(worstScene);
        overrides.set(worstObjectId, cand);
        return regenerateScene(worstScene, terrain, overrides);
      })();
      const trial = current.map((scene, i) => (i === worstIdx ? newScene : scene));
      const trialMerged = mergeObjects(trial);
      const trialMeasure = trial.map((scene) => measure(scene, trialMerged));
      if (trialMeasure[worstIdx].extras < bestCandidateExtras) bestCandidateExtras = trialMeasure[worstIdx].extras;

      const regression = !nonRegression(trialMeasure, baseline);
      if (
        !regression &&
        trialMeasure[worstIdx].extras < baseline[worstIdx].extras
      ) {
        log(`  accepted candidate at (${cand[0].toFixed(1)},${cand[2].toFixed(1)}): ${baseline[worstIdx].extras}→${trialMeasure[worstIdx].extras}`);
        current = trial;
        baseline = trialMeasure;
        triesSinceProgress = 0;
        accepted = true;
        break;
      }
    }
    if (!accepted) {
      log(`  no candidate improved (best would have been ${bestCandidateExtras}, but regression blocked or no gain)`);
      triesSinceProgress += 1;
      if (triesSinceProgress >= 4) break;
    }
  }

  log(`final: ${baseline.map((m) => `${m.scoreId}=${m.matched}m/${m.extras}e`).join(" ")}`);
  return current;
}

