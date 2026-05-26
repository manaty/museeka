import * as midiModule from "@tonejs/midi";
type MidiCtor = new (data: ArrayBufferLike) => {
  header: { tempos: { bpm: number }[]; ppq?: number };
  tracks: Array<{
    channel: number;
    name: string;
    notes: Array<{ time: number; duration: number; name: string; midi: number; ticks: number; durationTicks: number; velocity: number }>;
    instrument?: { number: number };
  }>;
};
const Midi: MidiCtor = ((midiModule as unknown as { Midi?: MidiCtor }).Midi
  ?? (midiModule as unknown as { default: { Midi: MidiCtor } }).default?.Midi) as MidiCtor;
import type { InstrumentId, MusicEvent, MusicScore, MusicTrack } from "../core/types";

const DEFAULT_INSTRUMENT: InstrumentId = "piano";

/**
 * Map GM (General MIDI) program number + channel to our Museeka InstrumentId.
 * Channel 10 (= track.channel === 9) is always drums in GM.
 */
export function instrumentFromGm(program: number, channel: number): InstrumentId {
  if (channel === 9) return "woodblock"; // GM drum channel
  // Piano family (0-7)
  if (program <= 7) return "piano";
  // Chromatic percussion (8-15): celesta, glockenspiel, music box, vibraphone, marimba, xylophone
  if (program <= 15) return "glass_bell";
  // Organ (16-23) — closest is warm sustain
  if (program <= 23) return "warm_pad";
  // Guitar (24-31)
  if (program <= 31) return "pluck";
  // Bass (32-39)
  if (program <= 39) return "low_pad";
  // Strings (40-47): violin 40, viola 41, cello 42, contrabass 43, tremolo 44, pizzicato 45, harp 46, timpani 47
  if (program === 42 || program === 43) return "cello";
  if (program === 46) return "crystal"; // harp
  if (program <= 47) return "violin";
  // Ensemble (48-55) — strings ensemble, voice — keep as violin
  if (program <= 55) return "violin";
  // Brass (56-63)
  if (program <= 63) return "warm_pad";
  // Reed (64-71) — sax, oboe, etc.
  if (program <= 71) return "flute";
  // Pipe (72-79): flute, piccolo, recorder
  if (program <= 79) return "flute";
  // Synth lead (80-87)
  if (program <= 87) return "crystal";
  // Synth pad (88-95)
  if (program <= 95) return "warm_pad";
  // Synth effects (96-103)
  if (program <= 103) return "warm_pad";
  // Ethnic (104-111)
  if (program <= 111) return "pluck";
  // Percussive (112-119)
  if (program <= 119) return "woodblock";
  // Sound effects (120-127)
  return "warm_pad";
}

function eventKindFromTrack(trackName: string, duration: number, noteCount: number): MusicEvent["kind"] {
  const lower = trackName.toLowerCase();
  if (lower.includes("drum") || lower.includes("perc")) {
    return "percussion";
  }
  if (duration > 2.5) {
    return "drone";
  }
  if (noteCount > 1) {
    return "chord";
  }
  return "note";
}

export async function parseMidiFile(file: File): Promise<MusicScore> {
  const buffer = await file.arrayBuffer();
  return parseMidiArrayBuffer(buffer, file.name.replace(/\.[^.]+$/, ""));
}

export function parseMidiArrayBuffer(buffer: ArrayBuffer, name = "Imported MIDI"): MusicScore {
  const midi = new Midi(buffer);
  const tempo = midi.header.tempos[0]?.bpm ?? 120;
  const trackInstruments: InstrumentId[] = midi.tracks.map((track) => {
    const program = track.instrument?.number ?? 0;
    const channel = track.channel ?? 0;
    return instrumentFromGm(program, channel);
  });
  const tracks: MusicTrack[] = midi.tracks.map((track, trackIndex) => {
    const trackName = track.name || `Track ${trackIndex + 1}`;
    const channel = track.channel ?? trackIndex;
    return {
      id: `midi_track_${trackIndex}`,
      name: trackName,
      channel,
      notes: track.notes.map((note, noteIndex) => ({
        id: `midi_${trackIndex}_${note.ticks}_${noteIndex}`,
        time: note.time,
        duration: note.duration,
        note: note.name,
        midi: note.midi,
        ticks: note.ticks,
        durationTicks: note.durationTicks,
        velocity: note.velocity,
        channel,
        trackIndex,
        trackName
      }))
    };
  });

  // Group notes per track so chord detection happens within each instrument
  // (avoids merging notes from different instruments that happen to overlap).
  const events: MusicEvent[] = [];
  tracks.forEach((track, trackIndex) => {
    const instrument = trackInstruments[trackIndex] ?? DEFAULT_INSTRUMENT;
    const rawNotes = track.notes.map((note) => ({
      id: note.id,
      time: note.time,
      duration: note.duration,
      kind: eventKindFromTrack(track.name, note.duration, 1),
      notes: [note.note],
      velocity: note.velocity,
      channel: note.channel,
      instrument
    }));
    events.push(...groupMidiNotes(rawNotes));
  });
  events.sort((a, b) => a.time - b.time);
  const duration = Math.max(...tracks.flatMap((track) => track.notes.map((note) => note.time + note.duration)), ...events.map((event) => event.time + event.duration), 8);

  return {
    id: `midi_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    name,
    duration,
    tempo,
    ppq: midi.header.ppq,
    events,
    tracks
  };
}

export function groupMidiNotes(notes: MusicEvent[], chordWindow = 0.045, phraseGap = 0.18): MusicEvent[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.notes[0].localeCompare(b.notes[0]));
  const grouped: MusicEvent[] = [];
  let index = 0;

  while (index < sorted.length) {
    const current = sorted[index];
    const chord = [current];
    let cursor = index + 1;

    while (cursor < sorted.length && Math.abs(sorted[cursor].time - current.time) <= chordWindow) {
      chord.push(sorted[cursor]);
      cursor += 1;
    }

    if (chord.length >= 2) {
      grouped.push({
        ...current,
        id: `chord_${current.id}`,
        kind: "chord",
        notes: chord.map((note) => note.notes[0]),
        duration: Math.max(...chord.map((note) => note.duration)),
        velocity: Math.max(...chord.map((note) => note.velocity))
      });
      index = cursor;
      continue;
    }

    const phrase = [current];
    cursor = index + 1;

    while (cursor < sorted.length && sorted[cursor].time - phrase[phrase.length - 1].time <= phraseGap && phrase.length < 5) {
      phrase.push(sorted[cursor]);
      cursor += 1;
    }

    if (phrase.length >= 3) {
      grouped.push({
        ...current,
        id: `phrase_${current.id}`,
        kind: "phrase",
        notes: phrase.map((note) => note.notes[0]),
        duration: phrase[phrase.length - 1].time + phrase[phrase.length - 1].duration - current.time,
        velocity: Math.max(...phrase.map((note) => note.velocity))
      });
      index = cursor;
      continue;
    }

    grouped.push(current);
    index += 1;
  }

  return grouped.map((event, eventIndex) => ({
    ...event,
    id: `${event.kind}_${eventIndex}_${event.notes.join("_")}`
  }));
}
