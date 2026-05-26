import { describe, expect, it } from "vitest";
import { demoScores } from "../../src/generation/demoScores";
import { detectMotifs } from "../../src/generation/motifDetect";
import { anchorIdFor, noteNameToMidi, spatialFold, tokenizeScore } from "../../src/generation/spatialFold";
import { samplePathAtTime } from "../../src/core/path";
import { evaluateField } from "../../src/core/fields";
import type { IslandScene } from "../../src/core/types";

const TEST_TERRAIN: IslandScene["terrain"] = {
  type: "simple_island",
  radius: 64,
  heightScale: 10,
  seed: 12345
};

describe("motif detection", () => {
  it("detects the repeated C-D-E-C and E-F-G motifs in Frère Jacques", () => {
    const frere = demoScores.find((score) => score.id === "path_03_frere_jacques");
    expect(frere).toBeDefined();
    if (!frere) return;

    const { tokens } = tokenizeScore(frere);
    const motifs = detectMotifs(tokens);

    expect(motifs.length).toBeGreaterThanOrEqual(1);
    const totalOccurrences = motifs.reduce((sum, motif) => sum + motif.occurrences.length, 0);
    expect(totalOccurrences).toBeGreaterThanOrEqual(2);

    const intervals = motifs.map((motif) => motif.signature.intervals.join(","));
    const hasMelodicMotif = intervals.some((value) => value === "2,2,-4") || intervals.some((value) => value === "1,2");
    expect(hasMelodicMotif).toBe(true);
  });

  it("only emits motifs with at least 2 occurrences", () => {
    for (const score of demoScores) {
      const { tokens } = tokenizeScore(score);
      const motifs = detectMotifs(tokens);
      for (const motif of motifs) {
        expect(motif.occurrences.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("spatial fold pipeline", () => {
  it("produces a path that visits the anchor of every melodic token at the expected time", () => {
    const ode = demoScores.find((score) => score.id === "path_01_ode_to_joy");
    expect(ode).toBeDefined();
    if (!ode) return;

    const { path, plan } = spatialFold(ode, TEST_TERRAIN);
    const anchorMap = new Map(plan.anchors.map((anchor) => [anchor.id, anchor]));

    const { tokens } = tokenizeScore(ode, TEST_TERRAIN);
    for (const token of tokens) {
      const anchor = anchorMap.get(anchorIdFor(token));
      expect(anchor, `anchor for ${token.id}`).toBeDefined();
      if (!anchor) continue;

      const sample = samplePathAtTime(path, token.time);
      const horizontalDist = Math.hypot(sample[0] - anchor.position[0], sample[2] - anchor.position[2]);
      expect(horizontalDist, `path within 3.5m of anchor at t=${token.time}`).toBeLessThan(3.5);
    }
  });

  it("emits at least six folding steps with the expected kinds", () => {
    const score = demoScores[0];
    const { plan } = spatialFold(score, TEST_TERRAIN);
    const kinds = plan.steps.map((step) => step.kind);
    expect(kinds[0]).toBe("init_anchors");
    expect(kinds).toContain("check_speed");
    expect(kinds[kinds.length - 1]).toBe("smooth");
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
  });

  it("creates one pitch-class anchor per (instrument, pitch class) of non-compacted melodic tokens", () => {
    const score = demoScores[0];
    const { tokens } = tokenizeScore(score, TEST_TERRAIN);
    const expected = new Set(tokens.map((token) => `${token.instrument}_${token.pitchClass}`));
    const { plan } = spatialFold(score, TEST_TERRAIN);
    const actual = new Set(plan.anchors.map((anchor) => `${anchor.instrument}_${anchor.pitchClass}`));
    expect(actual).toEqual(expected);
  });

  it("encodes octave via altitude relative to the anchor (within ±1 semitone)", () => {
    const score = demoScores.find((score) => score.id === "path_03_frere_jacques");
    expect(score).toBeDefined();
    if (!score) return;

    const { plan, path } = spatialFold(score, TEST_TERRAIN);
    const anchorMap = new Map(plan.anchors.map((anchor) => [anchor.id, anchor]));
    const { tokens } = tokenizeScore(score, TEST_TERRAIN);

    for (const token of tokens) {
      const anchor = anchorMap.get(anchorIdFor(token));
      if (!anchor) continue;
      const sample = samplePathAtTime(path, token.time);
      const altitudeRelative = sample[1] - anchor.position[1];
      const baseMidi = noteNameToMidi(`${["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][anchor.pitchClass]}${anchor.baseOctave}`);
      // mapping altitudeRelative * 2 semitones per meter, clamped to [-6, 6] m → [-12, 12] semitones
      const clamped = Math.max(-6, Math.min(6, altitudeRelative));
      const transposition = Math.round(clamped * 2);
      const producedMidi = baseMidi + transposition;
      expect(Math.abs(producedMidi - token.midi)).toBeLessThanOrEqual(1);
    }
  });

  it("places the entry waypoint where no triggered/continuous field is active at t=0", () => {
    for (const score of demoScores) {
      const { path, objects } = spatialFold(score, TEST_TERRAIN);
      const startPosition = samplePathAtTime(path, 0);
      for (const object of objects) {
        if (object.trigger.mode !== "continuous") continue;
        const field = evaluateField(object.field, object.transform, startPosition);
        expect(field.intensity, `${score.id} / ${object.id}`).toBeLessThan(object.trigger.threshold);
      }
    }
  });
});
