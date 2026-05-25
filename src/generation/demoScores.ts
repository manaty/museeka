import type { InstrumentId, MusicEvent, MusicScore } from "../core/types";

function note(id: string, time: number, pitch: string, duration = 0.45, instrument: InstrumentId = "glass_bell", velocity = 0.82): MusicEvent {
  return { id, time, duration, kind: "note", notes: [pitch], velocity, channel: 0, instrument };
}

function chord(id: string, time: number, notes: string[], duration = 1.1, instrument: InstrumentId = "warm_pad", velocity = 0.72): MusicEvent {
  return { id, time, duration, kind: "chord", notes, velocity, channel: 1, instrument };
}

function phrase(id: string, time: number, notes: string[], instrument: InstrumentId = "flute", velocity = 0.74): MusicEvent {
  return { id, time, duration: Math.max(0.6, notes.length * 0.2), kind: "phrase", notes, velocity, channel: 2, instrument };
}

function percussion(id: string, time: number, instrument: InstrumentId = "woodblock", velocity = 0.78): MusicEvent {
  return { id, time, duration: 0.12, kind: "percussion", notes: ["C5"], velocity, channel: 9, instrument };
}

function drone(id: string, time: number, notes: string[], duration = 4, instrument: InstrumentId = "low_pad", velocity = 0.55): MusicEvent {
  return { id, time, duration, kind: "drone", notes, velocity, channel: 3, instrument };
}

function melody(prefix: string, pitches: string[], start: number, step: number, instrument: InstrumentId, duration = 0.48): MusicEvent[] {
  return pitches.map((pitch, index) => note(`${prefix}_${index}`, start + index * step, pitch, duration, instrument));
}

export const demoScores: MusicScore[] = [
  {
    id: "path_01_ode_to_joy",
    name: "Ode to Joy",
    duration: 24,
    tempo: 112,
    events: [
      ...melody("ode", ["E4", "E4", "F4", "G4", "G4", "F4", "E4", "D4", "C4", "C4", "D4", "E4", "E4", "D4", "D4"], 1.0, 1.15, "glass_bell", 0.5),
      phrase("ode_answer", 18.8, ["E4", "E4", "F4", "G4", "G4", "F4", "E4"], "flute", 0.68)
    ]
  },
  {
    id: "path_02_pachelbel",
    name: "Canon Ground",
    duration: 30,
    tempo: 78,
    events: [
      drone("canon_bass", 0.5, ["D2", "A2"], 10, "low_pad", 0.5),
      chord("canon_01", 2.0, ["D3", "F#3", "A3"], 1.4),
      chord("canon_02", 5.5, ["A2", "C#3", "E3"], 1.4),
      chord("canon_03", 9.0, ["B2", "D3", "F#3"], 1.4),
      chord("canon_04", 12.5, ["F#2", "A2", "C#3"], 1.4),
      chord("canon_05", 16.0, ["G2", "B2", "D3"], 1.4),
      chord("canon_06", 19.5, ["D3", "F#3", "A3"], 1.4),
      chord("canon_07", 23.0, ["G2", "B2", "D3"], 1.4),
      chord("canon_08", 26.0, ["A2", "C#3", "E3"], 1.4)
    ]
  },
  {
    id: "path_03_frere_jacques",
    name: "Frere Jacques",
    duration: 24,
    tempo: 108,
    events: [
      ...melody("frere_a", ["C4", "D4", "E4", "C4", "C4", "D4", "E4", "C4"], 0.8, 0.75, "pluck", 0.34),
      phrase("frere_b", 7.2, ["E4", "F4", "G4"], "flute"),
      phrase("frere_c", 9.6, ["E4", "F4", "G4"], "flute"),
      percussion("frere_tick_01", 12.0),
      percussion("frere_tick_02", 12.75, "woodblock", 0.55),
      percussion("frere_tick_03", 13.5),
      phrase("frere_d", 14.4, ["G4", "A4", "G4", "F4", "E4", "C4"], "flute", 0.76),
      percussion("frere_tick_04", 19.4),
      percussion("frere_tick_05", 20.2, "woodblock", 0.6)
    ]
  },
  {
    id: "path_04_bach_prelude",
    name: "C Major Prelude",
    duration: 32,
    tempo: 92,
    events: [
      drone("bach_bass", 0.5, ["C2", "G2"], 12, "low_pad", 0.48),
      phrase("bach_arpeggio_01", 2.0, ["C4", "E4", "G4", "C5", "E5"], "crystal", 0.72),
      phrase("bach_arpeggio_02", 6.0, ["D4", "F4", "A4", "D5", "F5"], "crystal", 0.72),
      phrase("bach_arpeggio_03", 10.0, ["G3", "B3", "D4", "G4", "B4"], "crystal", 0.72),
      phrase("bach_arpeggio_04", 14.0, ["C4", "E4", "G4", "C5", "E5"], "crystal", 0.72),
      chord("bach_chord_01", 19.0, ["F3", "A3", "C4"], 1.2, "warm_pad"),
      phrase("bach_arpeggio_05", 22.2, ["G3", "B3", "D4", "G4", "B4"], "crystal", 0.72),
      chord("bach_chord_02", 27.0, ["C3", "E3", "G3"], 1.5, "warm_pad")
    ]
  },
  {
    id: "path_05_greensleeves",
    name: "Greensleeves Island",
    duration: 38,
    tempo: 96,
    events: [
      drone("green_bass", 0.3, ["A2", "E2"], 12, "low_pad", 0.5),
      note("green_01", 1.0, "A4", 0.56, "glass_bell"),
      note("green_02", 2.2, "C5", 0.56, "glass_bell"),
      note("green_03", 3.4, "D5", 0.56, "glass_bell"),
      phrase("green_04", 4.8, ["E5", "F5", "E5", "D5"], "flute", 0.72),
      chord("green_harmony_01", 8.2, ["A2", "C3", "E3"], 1.2),
      percussion("green_tick_01", 10.2),
      note("green_05", 11.2, "B4", 0.5, "crystal"),
      note("green_06", 12.4, "G4", 0.5, "crystal"),
      chord("green_harmony_02", 14.0, ["G2", "B2", "D3"], 1.2),
      phrase("green_07", 17.0, ["A4", "B4", "C5", "D5", "E5"], "flute", 0.72),
      chord("green_harmony_03", 21.0, ["F2", "A2", "C3"], 1.2),
      percussion("green_tick_02", 23.0, "woodblock", 0.62),
      phrase("green_08", 25.0, ["D5", "C5", "B4", "A4"], "flute", 0.72),
      chord("green_harmony_04", 29.0, ["E2", "G#2", "B2"], 1.2),
      note("green_09", 32.0, "A4", 0.8, "glass_bell"),
      chord("green_harmony_05", 34.2, ["A2", "C3", "E3"], 1.6)
    ]
  }
];
