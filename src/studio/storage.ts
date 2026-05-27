import type { IslandScene, MusicScore } from "../core/types";
import { parseIslandScene } from "../data/schema";

const STORAGE_KEY = "museeka.studio.scene.v1";
const MIDI_KEY = "museeka.studio.midiCatalog.v1";

export type StoredMidi = {
  id: string;
  fileName: string;
  importedAt: number;
  score: MusicScore;
  /** When true, the MIDI is part of the default catalogue shipped with the
   * app (loaded from /data/midi/*). Such items can't be deleted by the user. */
  builtin?: boolean;
};

/** Default MIDIs shipped in public/data/midi/. Available everywhere as
 * builtin items merged with localStorage entries. */
export const BUILTIN_MIDIS: Array<{ id: string; fileName: string; displayName: string }> = [
  { id: "builtin_ode_to_joy",    fileName: "01-ode-to-joy.mid",     displayName: "Ode to Joy" },
  { id: "builtin_pachelbel",     fileName: "02-pachelbel-canon.mid", displayName: "Canon in D" },
  { id: "builtin_frere_jacques", fileName: "03-frere-jacques.mid",   displayName: "Frère Jacques" },
  { id: "builtin_bach_prelude",  fileName: "04-bach-prelude-c.mid",  displayName: "Prelude in C (BWV 846)" },
  { id: "builtin_greensleeves",  fileName: "05-greensleeves.mid",    displayName: "Greensleeves" }
];

export function listMidis(): StoredMidi[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage?.getItem(MIDI_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredMidi[];
    if (!Array.isArray(parsed)) return [];
    // Auto-migrate: strip the bloated `tracks` field from any legacy entry
    // and rewrite the catalogue compacted (so quota errors don't keep firing).
    let needsRewrite = false;
    const compact = parsed.map((m) => {
      if (m.score && (m.score as { tracks?: unknown }).tracks) {
        needsRewrite = true;
        return { ...m, score: trimScoreForStorage(m.score) };
      }
      return m;
    });
    if (needsRewrite) {
      try {
        window.localStorage?.setItem(MIDI_KEY, JSON.stringify(compact));
      } catch {
        // best-effort migration; ignore if even the slimmed version overflows
      }
    }
    return compact;
  } catch {
    return [];
  }
}

/**
 * Strip the redundant raw `tracks` field before persisting. `events` already
 * contains everything the editor and the generator need; tracks doubles the
 * size of the JSON for nothing in our use case. This drastically reduces
 * the chance of hitting the localStorage quota.
 */
function trimScoreForStorage(score: MusicScore): MusicScore {
  const { tracks: _tracks, ...rest } = score;
  return rest as MusicScore;
}

export class MidiStorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MidiStorageQuotaError";
  }
}

export function saveMidi(entry: StoredMidi): void {
  if (typeof window === "undefined") return;
  const slim: StoredMidi = { ...entry, score: trimScoreForStorage(entry.score) };
  const items = listMidis().filter((m) => m.id !== slim.id);
  items.push(slim);
  try {
    window.localStorage?.setItem(MIDI_KEY, JSON.stringify(items));
  } catch (err) {
    if (err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22)) {
      throw new MidiStorageQuotaError(
        "Stockage local saturé — supprime des MIDIs déjà importés pour faire de la place. Limite navigateur ~5 Mo."
      );
    }
    throw err;
  }
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

// In-memory cache so we don't refetch the builtin MIDIs every time the
// MIDI / Music editor mounts.
let builtinCache: StoredMidi[] | null = null;
let builtinPromise: Promise<StoredMidi[]> | null = null;

export async function fetchBuiltinMidis(): Promise<StoredMidi[]> {
  if (builtinCache) return builtinCache;
  if (builtinPromise) return builtinPromise;
  const base = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
  const { parseMidiArrayBuffer } = await import("../music/midi");
  builtinPromise = Promise.all(
    BUILTIN_MIDIS.map(async (entry) => {
      const response = await fetch(`${base}data/midi/${entry.fileName}`);
      if (!response.ok) throw new Error(`Cannot load ${entry.fileName}: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const score = parseMidiArrayBuffer(buffer, entry.displayName);
      return {
        id: entry.id,
        fileName: entry.fileName,
        importedAt: 0,
        score,
        builtin: true
      } satisfies StoredMidi;
    })
  ).then((items) => {
    builtinCache = items;
    return items;
  });
  return builtinPromise;
}

/** Merge built-in MIDIs (first) with user-imported MIDIs from localStorage. */
export async function listAllMidis(): Promise<StoredMidi[]> {
  const builtins = await fetchBuiltinMidis();
  return [...builtins, ...listMidis()];
}

/** Lookup a MIDI by id, searching both built-in cache and localStorage. */
export async function findMidi(id: string): Promise<StoredMidi | undefined> {
  const builtins = await fetchBuiltinMidis();
  return builtins.find((m) => m.id === id) ?? getMidi(id);
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
