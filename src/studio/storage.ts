import type { IslandScene } from "../core/types";
import { parseIslandScene } from "../data/schema";

const STORAGE_KEY = "museeka.studio.scene.v1";

export function saveStudioScene(scene: IslandScene) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
}

export function loadStudioScene(): IslandScene | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return parseIslandScene(JSON.parse(raw));
}

export function clearStudioScene() {
  localStorage.removeItem(STORAGE_KEY);
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
