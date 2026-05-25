import type { IslandScene } from "./types";

export function terrainGroundY(x: number, z: number, terrain: IslandScene["terrain"]): number {
  const radius = terrain.radius;
  const distance = Math.sqrt(x * x + z * z);
  const radial = distance / radius;

  if (radial >= 1) {
    return 0;
  }

  const edgeFade = Math.min(1, Math.max(0, (1 - radial) / 0.24));
  const beachFade = Math.min(1, Math.max(0, (0.86 - radial) / 0.2));
  const centralDome = Math.pow(1 - radial, 1.22) * terrain.heightScale * 0.95;
  const summit = Math.exp(-((x - 4) * (x - 4) + (z + 6) * (z + 6)) / 560) * terrain.heightScale * 1.1;
  const ridge = Math.exp(-Math.pow(z * 0.72 + x * 0.28 + 8, 2) / 230) * terrain.heightScale * 0.42;
  const secondaryHill = Math.exp(-((x + 20) * (x + 20) + (z - 18) * (z - 18)) / 360) * terrain.heightScale * 0.52;
  const roughness =
    Math.sin(x * 0.22 + terrain.seed * 0.013) * 0.45 +
    Math.cos(z * 0.18 - terrain.seed * 0.017) * 0.36 +
    Math.sin((x + z) * 0.11) * 0.28;
  const landHeight = centralDome + summit + ridge + secondaryHill + roughness;
  const beachShelf = Math.max(0, (0.9 - radial) * terrain.heightScale * 0.18);

  return Math.max(0, (landHeight * beachFade + beachShelf * (1 - beachFade)) * edgeFade);
}
