import type { IslandScene, MusicScore } from "../core/types";
import { parseIslandScene } from "../data/schema";

const STORAGE_KEY = "museeka.studio.scene.v1";
const MIDI_KEY = "museeka.studio.midiCatalog.v1";

export type StoredMidi = {
  id: string;
  fileName: string;
  importedAt: number;
  score: MusicScore;
};

export function listMidis(): StoredMidi[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage?.getItem(MIDI_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredMidi[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMidi(entry: StoredMidi): void {
  if (typeof window === "undefined") return;
  const items = listMidis().filter((m) => m.id !== entry.id);
  items.push(entry);
  window.localStorage?.setItem(MIDI_KEY, JSON.stringify(items));
}

export function deleteMidi(id: string): void {
  if (typeof window === "undefined") return;
  const items = listMidis().filter((m) => m.id !== id);
  window.localStorage?.setItem(MIDI_KEY, JSON.stringify(items));
}

export function getMidi(id: string): StoredMidi | undefined {
  return listMidis().find((m) => m.id === id);
}

export function makeMidiId(): string {
  return `midi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

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
