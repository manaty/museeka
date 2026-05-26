import type { IslandScene } from "../core/types";
import { parseIslandScene } from "./schema";

export async function loadScene(url = `${import.meta.env.BASE_URL}data/museeka_demo_scene.json`): Promise<IslandScene> {
  // Disable HTTP cache for the scene file so a fresh deploy is picked up
  // immediately — the CDN's 10 min max-age was serving stale scenes.
  const response = await fetch(url, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Unable to load scene ${url}: ${response.status}`);
  }

  return parseIslandScene(await response.json());
}
