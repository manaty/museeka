import type { InstrumentId, MusicScore } from "../core/types";
import type { ProducedNote } from "./scoreSimulator";
import { noteNameToMidi } from "./spatialFold";

const TIME_TOLERANCE = 0.6;
const PITCH_TOLERANCE_SEMITONES = 0;
const PITCH_MISMATCH_PENALTY = 100;
const INF_COST = 1e9;

export type ExpectedNote = {
  id: string;
  time: number;
  midi: number;
  instrument: InstrumentId;
  kind: "note" | "phrase" | "chord" | "drone" | "percussion";
  sourceEventId: string;
};

export type NoteMatch = {
  expected: ExpectedNote;
  produced: ProducedNote;
  midiDelta: number;
  timeDelta: number;
  status: "matched" | "wrong-pitch" | "wrong-time" | "ok";
};

export type ComparisonResult = {
  expected: ExpectedNote[];
  matches: NoteMatch[];
  missing: ExpectedNote[];
  extra: ProducedNote[];
  counts: {
    expected: number;
    produced: number;
    matched: number;
    wrongPitch: number;
    missing: number;
    extra: number;
  };
  accuracy: number;
};

export function buildExpectedNotes(score: MusicScore): ExpectedNote[] {
  const expected: ExpectedNote[] = [];

  for (const event of score.events) {
    if (event.kind === "note") {
      expected.push({
        id: `exp_${event.id}`,
        time: event.time,
        midi: noteNameToMidi(event.notes[0]),
        instrument: event.instrument,
        kind: "note",
        sourceEventId: event.id
      });
      continue;
    }

    if (event.kind === "phrase") {
      const step = event.notes.length > 1 ? event.duration / event.notes.length : event.duration;
      event.notes.forEach((noteName, index) => {
        expected.push({
          id: `exp_${event.id}_${index}`,
          time: event.time + index * step,
          midi: noteNameToMidi(noteName),
          instrument: event.instrument,
          kind: "phrase",
          sourceEventId: event.id
        });
      });
      continue;
    }

    if (event.kind === "chord") {
      event.notes.forEach((noteName, index) => {
        expected.push({
          id: `exp_${event.id}_${index}`,
          time: event.time,
          midi: noteNameToMidi(noteName),
          instrument: event.instrument,
          kind: "chord",
          sourceEventId: event.id
        });
      });
      continue;
    }

    if (event.kind === "drone") {
      event.notes.forEach((noteName, index) => {
        expected.push({
          id: `exp_${event.id}_${index}`,
          time: event.time,
          midi: noteNameToMidi(noteName),
          instrument: event.instrument,
          kind: "drone",
          sourceEventId: event.id
        });
      });
      continue;
    }

    if (event.kind === "percussion") {
      expected.push({
        id: `exp_${event.id}`,
        time: event.time,
        midi: 0,
        instrument: event.instrument,
        kind: "percussion",
        sourceEventId: event.id
      });
    }
  }

  expected.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return expected;
}

function producedKindMatches(expectedKind: ExpectedNote["kind"], producedKind: ProducedNote["kind"]): boolean {
  if (expectedKind === "drone") return producedKind === "drone-on";
  if (expectedKind === "percussion") return producedKind === "percussion";
  if (expectedKind === "chord") return producedKind === "chord";
  if (expectedKind === "phrase") return producedKind === "phrase" || producedKind === "note";
  return producedKind === "note" || producedKind === "phrase";
}

function pairCost(exp: ExpectedNote, prod: ProducedNote): number {
  if (prod.instrument !== exp.instrument) return INF_COST;
  if (!producedKindMatches(exp.kind, prod.kind)) return INF_COST;
  const timeDelta = Math.abs(prod.time - exp.time);
  if (timeDelta > TIME_TOLERANCE) return INF_COST;
  const midiDelta = Math.abs(prod.midi - exp.midi);
  const pitchOk = exp.kind === "percussion" || midiDelta <= PITCH_TOLERANCE_SEMITONES;
  return timeDelta + (pitchOk ? 0 : PITCH_MISMATCH_PENALTY + midiDelta);
}

/**
 * Jonker-Volgenant assignment. Returns assignment[row] = col or -1 if unassigned.
 * Handles rectangular matrices by padding with INF on dummy columns.
 * O(n^2 m) where n = rows, m = max(rows, cols).
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const origM = cost[0].length;
  if (origM === 0) return new Array(n).fill(-1);

  const m = Math.max(n, origM);
  const padded: number[][] = cost.map((row) => {
    if (row.length === m) return row;
    const r = [...row];
    while (r.length < m) r.push(INF_COST);
    return r;
  });
  while (padded.length < m) {
    padded.push(new Array(m).fill(INF_COST));
  }
  const dim = padded.length;

  const u = new Array<number>(dim + 1).fill(0);
  const v = new Array<number>(dim + 1).fill(0);
  const p = new Array<number>(dim + 1).fill(0);
  const way = new Array<number>(dim + 1).fill(0);

  for (let i = 1; i <= dim; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(dim + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(dim + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;

      for (let j = 1; j <= dim; j += 1) {
        if (used[j]) continue;
        const cur = padded[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }

      for (let j = 0; j <= dim; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= dim; j += 1) {
    const row = p[j];
    if (row >= 1 && row <= n) {
      const col = j - 1;
      if (col < origM && padded[row - 1][col] < INF_COST) {
        assignment[row - 1] = col;
      }
    }
  }
  return assignment;
}

export function compareProduced(score: MusicScore, produced: ProducedNote[]): ComparisonResult {
  const expected = buildExpectedNotes(score);

  if (expected.length === 0) {
    return {
      expected,
      matches: [],
      missing: [],
      extra: produced.filter((p) => p.kind !== "drone-off"),
      counts: { expected: 0, produced: produced.length, matched: 0, wrongPitch: 0, missing: 0, extra: produced.length },
      accuracy: 0
    };
  }

  const N = expected.length;
  const M = produced.length;

  let assignment: number[];
  if (M === 0) {
    assignment = new Array(N).fill(-1);
  } else {
    const cost: number[][] = expected.map((exp) => produced.map((prod) => pairCost(exp, prod)));
    assignment = hungarian(cost);
  }

  const matches: NoteMatch[] = [];
  const missing: ExpectedNote[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < N; i += 1) {
    const j = assignment[i];
    if (j < 0) {
      missing.push(expected[i]);
      continue;
    }
    consumed.add(j);
    const prod = produced[j];
    const exp = expected[i];
    const midiDelta = prod.midi - exp.midi;
    const timeDelta = prod.time - exp.time;
    const pitchOk = exp.kind === "percussion" || prod.midi === exp.midi;
    matches.push({
      expected: exp,
      produced: prod,
      midiDelta,
      timeDelta,
      status: pitchOk ? "matched" : "wrong-pitch"
    });
  }

  const extra: ProducedNote[] = [];
  for (let j = 0; j < M; j += 1) {
    if (!consumed.has(j) && produced[j].kind !== "drone-off") {
      extra.push(produced[j]);
    }
  }

  const matched = matches.filter((m) => m.status === "matched").length;
  const wrongPitch = matches.filter((m) => m.status === "wrong-pitch").length;

  return {
    expected,
    matches,
    missing,
    extra,
    counts: {
      expected: expected.length,
      produced: produced.length,
      matched,
      wrongPitch,
      missing: missing.length,
      extra: extra.length
    },
    accuracy: expected.length > 0 ? matched / expected.length : 0
  };
}
