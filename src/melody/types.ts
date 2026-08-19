export type MelodyNote = {
  id: string;
  midi: number;
  tick: number;
  durationTicks: number;
  velocity: number;
};

export type Melody = {
  id: string;
  name: string;
  ppq: number;
  tempo: number;
  notes: MelodyNote[];
};

export function sortMelodyNotes(notes: MelodyNote[]): MelodyNote[] {
  return [...notes].sort((a, b) => a.tick - b.tick || a.midi - b.midi || a.id.localeCompare(b.id));
}

export function midiToNoteName(midi: number): string {
  const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const normalized = Math.max(0, Math.min(127, Math.round(midi)));
  const pitchClass = pitchClasses[normalized % 12];
  const octave = Math.floor(normalized / 12) - 1;
  return `${pitchClass}${octave}`;
}
