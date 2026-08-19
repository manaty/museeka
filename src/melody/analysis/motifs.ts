import { sortMelodyNotes, type Melody, type MelodyNote } from "../types";

export type MelodyMotifSignature = {
  intervals: number[];
  onsetRatios: number[];
  durationRatios: number[];
};

export type MelodyMotifOccurrence = {
  startIndex: number;
  startTick: number;
  transposition: number;
};

export type MelodyMotif = {
  length: number;
  signature: MelodyMotifSignature;
  occurrences: MelodyMotifOccurrence[];
  reuseScore: number;
};

export type MotifOptions = {
  minLength?: number;
  maxLength?: number;
  minOccurrences?: number;
};

function quantize(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalize(values: number[]): number[] {
  const base = values.find((value) => Math.abs(value) > 0.000001) ?? 1;
  return values.map((value) => quantize(value / base));
}

export function motifSignature(notes: MelodyNote[]): MelodyMotifSignature {
  const intervals: number[] = [];
  const onsetDeltas: number[] = [];
  const durations: number[] = [];

  for (let index = 0; index < notes.length; index += 1) {
    durations.push(Math.max(1, notes[index].durationTicks));
    if (index === 0) continue;
    intervals.push(notes[index].midi - notes[index - 1].midi);
    onsetDeltas.push(Math.max(1, notes[index].tick - notes[index - 1].tick));
  }

  return {
    intervals,
    onsetRatios: normalize(onsetDeltas),
    durationRatios: normalize(durations)
  };
}

function signatureKey(signature: MelodyMotifSignature): string {
  return [
    signature.intervals.join(","),
    signature.onsetRatios.join(","),
    signature.durationRatios.join(",")
  ].join("|");
}

export function findRecurringMotifs(melody: Melody, options: MotifOptions = {}): MelodyMotif[] {
  const notes = sortMelodyNotes(melody.notes);
  const minLength = Math.max(2, options.minLength ?? 3);
  const maxLength = Math.min(notes.length, options.maxLength ?? 8);
  const minOccurrences = Math.max(2, options.minOccurrences ?? 2);
  const candidates = new Map<string, { length: number; signature: MelodyMotifSignature; starts: number[] }>();

  for (let length = maxLength; length >= minLength; length -= 1) {
    for (let start = 0; start + length <= notes.length; start += 1) {
      const window = notes.slice(start, start + length);
      const signature = motifSignature(window);
      const key = `${length}:${signatureKey(signature)}`;
      const existing = candidates.get(key);
      if (existing) existing.starts.push(start);
      else candidates.set(key, { length, signature, starts: [start] });
    }
  }

  const motifs: MelodyMotif[] = [];
  for (const candidate of candidates.values()) {
    if (candidate.starts.length < minOccurrences) continue;

    const retained: number[] = [];
    let lastEnd = -1;
    for (const start of candidate.starts) {
      if (start < lastEnd) continue;
      retained.push(start);
      lastEnd = start + candidate.length;
    }
    if (retained.length < minOccurrences) continue;

    const referencePitch = notes[retained[0]].midi;
    motifs.push({
      length: candidate.length,
      signature: candidate.signature,
      occurrences: retained.map((start) => ({
        startIndex: start,
        startTick: notes[start].tick,
        transposition: notes[start].midi - referencePitch
      })),
      reuseScore: candidate.length * (retained.length - 1)
    });
  }

  return motifs.sort((a, b) => {
    if (b.reuseScore !== a.reuseScore) return b.reuseScore - a.reuseScore;
    if (b.length !== a.length) return b.length - a.length;
    return b.occurrences.length - a.occurrences.length;
  });
}
