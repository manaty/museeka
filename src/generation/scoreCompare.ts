import type { InstrumentId, MusicScore } from "../core/types";
import type { ProducedNote } from "./scoreSimulator";
import { noteNameToMidi } from "./spatialFold";

const TIME_TOLERANCE = 0.35;
const PITCH_TOLERANCE_SEMITONES = 0;

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

export function compareProduced(score: MusicScore, produced: ProducedNote[]): ComparisonResult {
  const expected = buildExpectedNotes(score);
  const consumed = new Set<number>();
  const matches: NoteMatch[] = [];
  const missing: ExpectedNote[] = [];

  for (const exp of expected) {
    let bestIndex = -1;
    let bestScore = Infinity;
    let bestPitchOk = false;

    for (let i = 0; i < produced.length; i += 1) {
      if (consumed.has(i)) continue;
      const prod = produced[i];
      if (prod.instrument !== exp.instrument) continue;
      if (!producedKindMatches(exp.kind, prod.kind)) continue;

      const timeDelta = Math.abs(prod.time - exp.time);
      if (timeDelta > TIME_TOLERANCE) continue;

      const midiDelta = Math.abs(prod.midi - exp.midi);
      const pitchOk = exp.kind === "percussion" || midiDelta <= PITCH_TOLERANCE_SEMITONES;
      // Prefer correct pitch over closer time
      const score = (pitchOk ? 0 : 100 + midiDelta) + timeDelta;

      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
        bestPitchOk = pitchOk;
      }
    }

    if (bestIndex === -1) {
      missing.push(exp);
      continue;
    }

    consumed.add(bestIndex);
    const prod = produced[bestIndex];
    const midiDelta = prod.midi - exp.midi;
    const timeDelta = prod.time - exp.time;
    matches.push({
      expected: exp,
      produced: prod,
      midiDelta,
      timeDelta,
      status: bestPitchOk ? "matched" : "wrong-pitch"
    });
  }

  const extra: ProducedNote[] = [];
  for (let i = 0; i < produced.length; i += 1) {
    if (!consumed.has(i) && produced[i].kind !== "drone-off") {
      extra.push(produced[i]);
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
