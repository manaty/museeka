import type { IslandScene } from "../core/types";
import { terrainGroundY } from "../core/terrain";

export function groundY(x: number, z: number, scene: IslandScene): number {
  return terrainGroundY(x, z, scene.terrain);
}
