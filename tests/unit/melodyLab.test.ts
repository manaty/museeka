import { describe, expect, it } from "vitest";
import { analyzeMelody } from "../../src/melody/analysis/basic";
import { findRecurringMotifs } from "../../src/melody/analysis/motifs";
import { createAnalysisSnapshot, FEATURE_ORDER } from "../../src/melody/analysis/snapshot";
import { collapseRepeatedAttacks } from "../../src/melody/transform";
import type { Melody } from "../../src/melody/types";

function melodyFromPitches(pitches: number[], step = 240): Melody {
  return {
    id: "test_melody",
    name: "Test melody",
    ppq: 480,
    tempo: 120,
    notes: pitches.map((midi, index) => ({
      id: `n_${index}`,
      midi,
      tick: index * step,
      durationTicks: step,
      velocity: 0.8
    }))
  };
}

describe("melody analysis", () => {
  it("distinguishes rhythmic attacks from pitch movement", () => {
    const melody = melodyFromPitches([60, 60, 64, 64, 62, 62, 67, 67]);
    const analysis = analyzeMelody(melody);

    expect(analysis.attacks).toBe(8);
    expect(analysis.pitchChanges).toBe(3);
    expect(analysis.repeatedTransitions).toBe(4);
    expect(analysis.pitchChangeRatio).toBeCloseTo(3 / 7);
    expect(analysis.repeatedAttackShare).toBe(1);
    expect(analysis.contour).toEqual(["=", "↑", "=", "↓", "=", "↑", "="]);
  });

  it("keeps A A distinct from one sustained A until explicitly transformed", () => {
    const melody = melodyFromPitches([60, 60, 64, 64]);
    const sustained = collapseRepeatedAttacks(melody);

    expect(melody.notes).toHaveLength(4);
    expect(sustained.notes).toHaveLength(2);
    expect(sustained.notes[0].midi).toBe(60);
    expect(sustained.notes[0].durationTicks).toBe(480);
    expect(sustained.notes[1].midi).toBe(64);
    expect(sustained.notes[1].durationTicks).toBe(480);
  });
});

describe("recurring melodic identity", () => {
  it("detects a motif repeated under transposition", () => {
    const melody = melodyFromPitches([60, 60, 64, 64, 62, 62, 66, 66]);
    const motifs = findRecurringMotifs(melody, { minLength: 4, maxLength: 4 });

    expect(motifs.length).toBeGreaterThanOrEqual(1);
    const motif = motifs[0];
    expect(motif.length).toBe(4);
    expect(motif.signature.intervals).toEqual([0, 4, 0]);
    expect(motif.occurrences).toHaveLength(2);
    expect(motif.occurrences[1].transposition).toBe(2);
  });
});

describe("versioned analysis snapshots", () => {
  it("produces a stable fixed-order feature vector plus interpretable features", () => {
    const melody = melodyFromPitches([60, 60, 64, 64, 62, 62, 67, 67]);
    const snapshot = createAnalysisSnapshot(melody, "deadbeef");

    expect(snapshot.melodyId).toBe(melody.id);
    expect(snapshot.melodyHash).toMatch(/^[0-9a-f]{8}$/);
    expect(snapshot.analyzer.version).toBe("0.1.0");
    expect(snapshot.analyzer.commit).toBe("deadbeef");
    expect(snapshot.vector).toHaveLength(FEATURE_ORDER.length);
    expect(snapshot.features.attacks).toBe(8);
    expect(snapshot.structural.contour).toBe("=↑=↓=↑=");
  });
});
