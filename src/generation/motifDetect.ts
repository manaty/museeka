import type { InstrumentId, Motif, MotifInstance, MotifSignature, NoteToken } from "../core/types";

const DEFAULT_MIN_LENGTH = 3;
const DEFAULT_MAX_LENGTH = 8;
const DURATION_RATIO_BUCKET = 0.15;

export type MotifDetectionOptions = {
  minLength?: number;
  maxLength?: number;
  minOccurrences?: number;
};

function signatureKey(intervals: number[], durationRatios: number[], instrument: InstrumentId): string {
  const intervalsKey = intervals.join(",");
  const durationsKey = durationRatios.map((value) => Math.round(value / DURATION_RATIO_BUCKET)).join(",");
  return `${instrument}|${intervalsKey}|${durationsKey}`;
}

function computeSignature(window: NoteToken[]): MotifSignature {
  const intervals: number[] = [];
  const durationRatios: number[] = [];

  for (let i = 1; i < window.length; i += 1) {
    intervals.push(window[i].midi - window[i - 1].midi);
    const prev = Math.max(0.001, window[i - 1].duration);
    const current = Math.max(0.001, window[i].duration);
    durationRatios.push(Math.log2(current / prev));
  }

  return { intervals, durationRatios, instrument: window[0].instrument };
}

function tokensByInstrument(tokens: NoteToken[]): Map<InstrumentId, NoteToken[]> {
  const grouped = new Map<InstrumentId, NoteToken[]>();
  for (const token of tokens) {
    const list = grouped.get(token.instrument) ?? [];
    list.push(token);
    grouped.set(token.instrument, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.time - b.time);
  }
  return grouped;
}

type RawCandidate = {
  key: string;
  length: number;
  signature: MotifSignature;
  starts: number[];
};

function collectCandidates(tokens: NoteToken[], minLength: number, maxLength: number, minOccurrences: number): RawCandidate[] {
  const candidates = new Map<string, RawCandidate>();
  const upper = Math.min(maxLength, tokens.length);

  for (let length = upper; length >= minLength; length -= 1) {
    for (let start = 0; start + length <= tokens.length; start += 1) {
      const window = tokens.slice(start, start + length);
      const signature = computeSignature(window);
      const key = signatureKey(signature.intervals, signature.durationRatios, signature.instrument);
      const existing = candidates.get(key);
      if (existing) {
        existing.starts.push(start);
      } else {
        candidates.set(key, { key, length, signature, starts: [start] });
      }
    }
  }

  return [...candidates.values()].filter((candidate) => candidate.starts.length >= minOccurrences);
}

function overlaps(start: number, length: number, covered: boolean[]): boolean {
  for (let i = start; i < start + length; i += 1) {
    if (covered[i]) return true;
  }
  return false;
}

function markCovered(start: number, length: number, covered: boolean[]) {
  for (let i = start; i < start + length; i += 1) {
    covered[i] = true;
  }
}

function buildMotif(motifIndex: number, candidate: RawCandidate, tokens: NoteToken[], retainedStarts: number[]): Motif {
  const motifId = `motif_${motifIndex + 1}`;
  const first = tokens[retainedStarts[0]];
  const occurrences: MotifInstance[] = retainedStarts.map((start) => {
    const windowTokens = tokens.slice(start, start + candidate.length);
    return {
      motifId,
      startTokenIndex: start,
      tokens: windowTokens,
      startTime: windowTokens[0].time,
      transposition: windowTokens[0].midi - first.midi
    };
  });

  return {
    id: motifId,
    signature: candidate.signature,
    occurrences,
    reuseScore: candidate.length * (retainedStarts.length - 1)
  };
}

export function detectMotifs(tokens: NoteToken[], options: MotifDetectionOptions = {}): Motif[] {
  const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const minOccurrences = options.minOccurrences ?? 2;

  const byInstrument = tokensByInstrument(tokens);
  const motifs: Motif[] = [];

  for (const [, instrumentTokens] of byInstrument) {
    if (instrumentTokens.length < minLength * minOccurrences) continue;

    const candidates = collectCandidates(instrumentTokens, minLength, maxLength, minOccurrences);
    candidates.sort((a, b) => {
      const gainA = a.length * (a.starts.length - 1);
      const gainB = b.length * (b.starts.length - 1);
      if (gainB !== gainA) return gainB - gainA;
      if (b.length !== a.length) return b.length - a.length;
      return b.starts.length - a.starts.length;
    });

    const covered = new Array<boolean>(instrumentTokens.length).fill(false);

    for (const candidate of candidates) {
      const retained = candidate.starts.filter((start) => !overlaps(start, candidate.length, covered));
      if (retained.length < minOccurrences) continue;

      motifs.push(buildMotif(motifs.length, candidate, instrumentTokens, retained));
      for (const start of retained) {
        markCovered(start, candidate.length, covered);
      }
    }
  }

  return motifs;
}

export function tokensCoveredByMotifs(motifs: Motif[]): Set<string> {
  const ids = new Set<string>();
  for (const motif of motifs) {
    for (const occurrence of motif.occurrences) {
      for (const token of occurrence.tokens) {
        ids.add(token.id);
      }
    }
  }
  return ids;
}
