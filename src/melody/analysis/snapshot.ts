import { analyzeMelody } from "./basic";
import { findRecurringMotifs } from "./motifs";
import { sortMelodyNotes, type Melody } from "../types";
import type { AnalysisSnapshot } from "../research/types";

export const MELODY_ANALYZER_ID = "museeka-melody";
export const MELODY_ANALYZER_VERSION = "0.1.0";
export const MELODY_FEATURE_SCHEMA_VERSION = "1";

export const FEATURE_ORDER = [
  "attacks",
  "pitchChanges",
  "pitchChangeRatio",
  "repeatedTransitions",
  "repeatedAttackShare",
  "uniquePitches",
  "pitchRange",
  "durationBeats",
  "attacksPerBeat",
  "pitchChangesPerBeat",
  "motifCount",
  "bestMotifLength",
  "bestMotifOccurrences",
  "bestMotifReuse"
] as const;

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function melodyHash(melody: Melody): string {
  const canonical = sortMelodyNotes(melody.notes)
    .map((note) => [note.tick, note.durationTicks, note.midi, Math.round(note.velocity * 1000)].join(":"))
    .join("|");
  return fnv1a(`${melody.ppq};${canonical}`);
}

export function createAnalysisSnapshot(melody: Melody, commit?: string): AnalysisSnapshot {
  const analysis = analyzeMelody(melody);
  const motifs = findRecurringMotifs(melody);
  const bestMotif = motifs[0];

  const features: Record<(typeof FEATURE_ORDER)[number], number> = {
    attacks: analysis.attacks,
    pitchChanges: analysis.pitchChanges,
    pitchChangeRatio: analysis.pitchChangeRatio,
    repeatedTransitions: analysis.repeatedTransitions,
    repeatedAttackShare: analysis.repeatedAttackShare,
    uniquePitches: analysis.uniquePitches,
    pitchRange: analysis.pitchRange,
    durationBeats: analysis.durationBeats,
    attacksPerBeat: analysis.attacksPerBeat,
    pitchChangesPerBeat: analysis.pitchChangesPerBeat,
    motifCount: motifs.length,
    bestMotifLength: bestMotif?.length ?? 0,
    bestMotifOccurrences: bestMotif?.occurrences.length ?? 0,
    bestMotifReuse: bestMotif?.reuseScore ?? 0
  };

  return {
    melodyId: melody.id,
    melodyHash: melodyHash(melody),
    analyzer: {
      id: MELODY_ANALYZER_ID,
      version: MELODY_ANALYZER_VERSION,
      featureSchemaVersion: MELODY_FEATURE_SCHEMA_VERSION,
      ...(commit ? { commit } : {})
    },
    createdAt: new Date().toISOString(),
    features,
    vector: FEATURE_ORDER.map((key) => features[key]),
    structural: {
      contour: analysis.contour.join(""),
      intervals: analysis.intervals,
      recurringMotifs: motifs.slice(0, 12).map((motif) => ({
        length: motif.length,
        occurrences: motif.occurrences.length,
        reuseScore: motif.reuseScore
      }))
    }
  };
}
