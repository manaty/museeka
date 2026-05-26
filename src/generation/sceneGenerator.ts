import type { FoldingPlan, GenerationReport, IslandScene, MusicScore, SoundObject, Vec3 } from "../core/types";
import { terrainGroundY } from "../core/terrain";
import { spatialFold, spatialFoldReport } from "./spatialFold";
import { relaxScenes } from "./sceneRelaxer";

export type SceneGenerationResult = {
  scene: IslandScene;
  reports: GenerationReport[];
  plans: FoldingPlan[];
};

export function generateSceneFromScores(scores: MusicScore[], seed = 12345): SceneGenerationResult {
  const terrain: IslandScene["terrain"] = {
    type: "simple_island",
    radius: 64,
    heightScale: 10,
    seed
  };

  const initial = scores.map((score) => {
    const t = Date.now();
    const result = spatialFold(score, terrain, { seed });
    console.log(`  spatialFold ${score.id}: ${((Date.now() - t) / 1000).toFixed(1)}s`);
    return { score, ...result };
  });
  console.log("Running relaxer...");
  const tRelax = Date.now();
  const generated = relaxScenes(initial, terrain);
  console.log(`  relaxer: ${((Date.now() - tRelax) / 1000).toFixed(1)}s`);

  const scene: IslandScene = {
    version: "0.1",
    meta: {
      name: "Museeka Demo Island",
      author: "Museeka",
      description: "Île générée par tissage spatial : chaque parcours rejoue sa partition par rencontres.",
      generatedAt: new Date(0).toISOString()
    },
    terrain,
    paths: generated.map((item) => item.path),
    soundObjects: dedupeSoundObjects(generated.flatMap((item) => item.objects)),
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
      defaultPathId: generated[0]?.path.id ?? "path-01",
      audio: {
        masterVolume: 0.78,
        maxActiveVoices: 32
      }
    }
  };

  return {
    scene,
    reports: generated.map((item) => spatialFoldReport(item.plan)),
    plans: generated.map((item) => item.plan)
  };
}

function dedupeSoundObjects(objects: SoundObject[]): SoundObject[] {
  const seen = new Map<string, SoundObject>();
  for (const object of objects) {
    if (!seen.has(object.id)) {
      seen.set(object.id, object);
    }
  }
  return [...seen.values()];
}
