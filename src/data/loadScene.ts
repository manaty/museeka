import type { IslandScene } from "../core/types";
import { parseIslandScene } from "./schema";

export async function loadScene(url = `${import.meta.env.BASE_URL}data/museeka_demo_scene.json`): Promise<IslandScene> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load scene ${url}: ${response.status}`);
  }

  return parseIslandScene(await response.json());
}
