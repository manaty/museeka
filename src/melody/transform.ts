import { sortMelodyNotes, type Melody, type MelodyNote } from "./types";

export function collapseRepeatedAttacks(melody: Melody): Melody {
  const notes = sortMelodyNotes(melody.notes);
  const collapsed: MelodyNote[] = [];

  for (const note of notes) {
    const previous = collapsed[collapsed.length - 1];
    const previousEnd = previous ? previous.tick + previous.durationTicks : -1;
    const contiguous = previous && note.tick <= previousEnd + 1;

    if (previous && contiguous && previous.midi === note.midi) {
      const mergedEnd = Math.max(previousEnd, note.tick + note.durationTicks);
      previous.durationTicks = mergedEnd - previous.tick;
      previous.velocity = Math.max(previous.velocity, note.velocity);
      continue;
    }

    collapsed.push({ ...note });
  }

  return {
    ...melody,
    id: `${melody.id}_sustained`,
    name: `${melody.name} — sustained`,
    notes: collapsed
  };
}

export function transposeFinalRun(melody: Melody, semitones: number): Melody {
  const notes = sortMelodyNotes(melody.notes).map((note) => ({ ...note }));
  if (notes.length === 0) return { ...melody, notes };

  const finalPitch = notes[notes.length - 1].midi;
  let start = notes.length - 1;
  while (start > 0 && notes[start - 1].midi === finalPitch) start -= 1;

  for (let index = start; index < notes.length; index += 1) {
    notes[index].midi = Math.max(0, Math.min(127, notes[index].midi + semitones));
  }

  return {
    ...melody,
    id: `${melody.id}_ending_${semitones}`,
    name: `${melody.name} — ending ${semitones >= 0 ? "+" : ""}${semitones}`,
    notes
  };
}

export function splitNotesIntoRepeatedPairs(melody: Melody): Melody {
  const notes = sortMelodyNotes(melody.notes);
  const paired: MelodyNote[] = [];

  for (const note of notes) {
    if (note.durationTicks < 2) {
      paired.push({ ...note });
      continue;
    }
    const firstDuration = Math.floor(note.durationTicks / 2);
    const secondDuration = note.durationTicks - firstDuration;
    paired.push(
      { ...note, id: `${note.id}_a`, durationTicks: firstDuration },
      {
        ...note,
        id: `${note.id}_b`,
        tick: note.tick + firstDuration,
        durationTicks: secondDuration
      }
    );
  }

  return {
    ...melody,
    id: `${melody.id}_paired`,
    name: `${melody.name} — paired attacks`,
    notes: paired
  };
}
