import { Midi } from "@tonejs/midi";
import type { InstrumentId, MusicEvent, MusicScore, MusicTrack } from "../core/types";

const DEFAULT_INSTRUMENT: InstrumentId = "glass_bell";

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

  const rawNotes = tracks.flatMap((track) =>
    track.notes.map((note) => ({
      id: note.id,
      time: note.time,
      duration: note.duration,
      kind: eventKindFromTrack(track.name, note.duration, 1),
      notes: [note.note],
      velocity: note.velocity,
      channel: note.channel,
      instrument: DEFAULT_INSTRUMENT
    }))
  );

  const events = groupMidiNotes(rawNotes);
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

    if (chord.length >= 3) {
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
