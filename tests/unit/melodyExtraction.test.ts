import { beforeEach, describe, expect, it } from "vitest";
import type { MusicScore, MusicTrack } from "../../src/core/types";
import { extractMelodyCandidates, MELODY_EXTRACTOR_VERSION } from "../../src/melody/extraction/extractor";
import { deleteUserCorpusRecord, listUserCorpus, saveUserCorpusRecord } from "../../src/melody/corpus/storage";
import { melodyHash } from "../../src/melody/analysis/snapshot";

function note(id: string, midi: number, ticks: number, durationTicks = 240) {
  return {
    id,
    time: ticks / 480,
    duration: durationTicks / 480,
    note: "C4",
    midi,
    ticks,
    durationTicks,
    velocity: 0.8,
    channel: 0,
    trackIndex: 0,
    trackName: "Lead Melody"
  };
}

function track(name: string, channel: number, notes: MusicTrack["notes"]): MusicTrack {
  return { id: `track_${channel}_${name}`, name, channel, notes };
}

function score(tracks: MusicTrack[]): MusicScore {
  return {
    id: "source_score",
    name: "Extraction Fixture",
    duration: 4,
    tempo: 120,
    ppq: 480,
    events: [],
    tracks
  };
}

describe("versioned melody extraction", () => {
  it("preserves repeated attacks and chooses the skyline at simultaneous onsets", () => {
    const lead = track("Lead Melody", 0, [
      note("a1", 60, 0),
      note("a2", 60, 240),
      note("low", 62, 480),
      note("high", 67, 480),
      note("d", 65, 720),
      note("e", 64, 960)
    ]);

    const candidates = extractMelodyCandidates(score([lead]), "fixture");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].extractor.version).toBe(MELODY_EXTRACTOR_VERSION);
    expect(candidates[0].melody.notes.map((n) => n.midi)).toEqual([60, 60, 67, 65, 64]);
    expect(candidates[0].melody.notes[0].tick).toBe(0);
    expect(candidates[0].metrics.sourceNotes).toBe(6);
    expect(candidates[0].metrics.extractedNotes).toBe(5);
    expect(candidates[0].metrics.monophonyRatio).toBeLessThan(1);
  });

  it("ignores General MIDI drum channel tracks", () => {
    const drums = track("Drums", 9, [
      note("d1", 36, 0), note("d2", 38, 240), note("d3", 42, 480), note("d4", 36, 720)
    ]);
    expect(extractMelodyCandidates(score([drums]), "drums")).toEqual([]);
  });

  it("ranks a named monophonic lead above a polyphonic accompaniment", () => {
    const lead = track("Lead Melody", 0, [
      note("l1", 64, 0), note("l2", 64, 240), note("l3", 67, 480), note("l4", 69, 720)
    ]);
    const accompaniment = track("Chord Pad", 1, [
      { ...note("c1", 48, 0), channel: 1 }, { ...note("c2", 55, 0), channel: 1 },
      { ...note("c3", 50, 480), channel: 1 }, { ...note("c4", 57, 480), channel: 1 },
      { ...note("c5", 52, 960), channel: 1 }, { ...note("c6", 59, 960), channel: 1 },
      { ...note("c7", 53, 1440), channel: 1 }, { ...note("c8", 60, 1440), channel: 1 }
    ]);
    const candidates = extractMelodyCandidates(score([accompaniment, lead]), "ranking");
    expect(candidates[0].trackName).toBe("Lead Melody");
  });
});

describe("user corpus storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists a canonical imported melody together with extraction provenance", () => {
    const melody = {
      id: "user_melody",
      name: "User melody",
      ppq: 480,
      tempo: 120,
      notes: [
        { id: "n1", midi: 60, tick: 0, durationTicks: 240, velocity: 0.8 },
        { id: "n2", midi: 60, tick: 240, durationTicks: 240, velocity: 0.8 },
        { id: "n3", midi: 64, tick: 480, durationTicks: 240, velocity: 0.8 },
        { id: "n4", midi: 67, tick: 720, durationTicks: 240, velocity: 0.8 }
      ]
    };
    const hash = melodyHash(melody);
    saveUserCorpusRecord({
      melody,
      entry: {
        id: "imported_fixture",
        title: "Imported fixture",
        genres: ["imported"],
        sourceKind: "imported",
        melodyId: melody.id,
        melodyHash: hash,
        extraction: { method: "algorithm", trackIndex: 2, extractorVersion: MELODY_EXTRACTOR_VERSION }
      }
    });

    const saved = listUserCorpus();
    expect(saved).toHaveLength(1);
    expect(saved[0].entry.melodyHash).toBe(hash);
    expect(saved[0].entry.extraction?.extractorVersion).toBe(MELODY_EXTRACTOR_VERSION);

    deleteUserCorpusRecord("imported_fixture");
    expect(listUserCorpus()).toEqual([]);
  });
});
