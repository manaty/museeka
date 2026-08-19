import { sortMelodyNotes, type Melody } from "../types";

export type RepeatedRun = {
  midi: number;
  startIndex: number;
  length: number;
};

export type MelodyAnalysis = {
  attacks: number;
  pitchChanges: number;
  pitchChangeRatio: number;
  repeatedTransitions: number;
  repeatedAttackShare: number;
  repeatedRuns: RepeatedRun[];
  uniquePitches: number;
  pitchRange: number;
  durationBeats: number;
  attacksPerBeat: number;
  pitchChangesPerBeat: number;
  intervals: number[];
  contour: Array<"=" | "↑" | "↓">;
};

export function analyzeMelody(melody: Melody): MelodyAnalysis {
  const notes = sortMelodyNotes(melody.notes);
  const intervals: number[] = [];
  const contour: Array<"=" | "↑" | "↓"> = [];
  let pitchChanges = 0;
  let repeatedTransitions = 0;

  for (let index = 1; index < notes.length; index += 1) {
    const interval = notes[index].midi - notes[index - 1].midi;
    intervals.push(interval);
    if (interval === 0) {
      repeatedTransitions += 1;
      contour.push("=");
    } else if (interval > 0) {
      pitchChanges += 1;
      contour.push("↑");
    } else {
      pitchChanges += 1;
      contour.push("↓");
    }
  }

  const repeatedRuns: RepeatedRun[] = [];
  let runStart = 0;
  for (let index = 1; index <= notes.length; index += 1) {
    const continues = index < notes.length && notes[index].midi === notes[runStart].midi;
    if (continues) continue;
    const length = index - runStart;
    if (length >= 2) {
      repeatedRuns.push({ midi: notes[runStart].midi, startIndex: runStart, length });
    }
    runStart = index;
  }

  const repeatedNoteCount = repeatedRuns.reduce((sum, run) => sum + run.length, 0);
  const firstTick = notes[0]?.tick ?? 0;
  const lastTick = notes.reduce((max, note) => Math.max(max, note.tick + note.durationTicks), firstTick);
  const durationTicks = Math.max(0, lastTick - firstTick);
  const durationBeats = melody.ppq > 0 ? durationTicks / melody.ppq : 0;
  const attacks = notes.length;
  const transitions = Math.max(0, attacks - 1);
  const pitchValues = notes.map((note) => note.midi);
  const minPitch = pitchValues.length > 0 ? Math.min(...pitchValues) : 0;
  const maxPitch = pitchValues.length > 0 ? Math.max(...pitchValues) : 0;

  return {
    attacks,
    pitchChanges,
    pitchChangeRatio: transitions > 0 ? pitchChanges / transitions : 0,
    repeatedTransitions,
    repeatedAttackShare: attacks > 0 ? repeatedNoteCount / attacks : 0,
    repeatedRuns,
    uniquePitches: new Set(pitchValues).size,
    pitchRange: maxPitch - minPitch,
    durationBeats,
    attacksPerBeat: durationBeats > 0 ? attacks / durationBeats : 0,
    pitchChangesPerBeat: durationBeats > 0 ? pitchChanges / durationBeats : 0,
    intervals,
    contour
  };
}
