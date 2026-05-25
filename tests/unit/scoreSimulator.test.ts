import { describe, expect, it } from "vitest";
import { demoScores } from "../../src/generation/demoScores";
import { spatialFold } from "../../src/generation/spatialFold";
import { simulateParcours } from "../../src/generation/scoreSimulator";
import { buildExpectedNotes, compareProduced } from "../../src/generation/scoreCompare";
import type { IslandScene } from "../../src/core/types";

const TERRAIN: IslandScene["terrain"] = { type: "simple_island", radius: 64, heightScale: 10, seed: 12345 };

describe("score simulator", () => {
  it("emits at least one produced note for a melodic score", () => {
    const ode = demoScores.find((score) => score.id === "path_01_ode_to_joy");
    expect(ode).toBeDefined();
    if (!ode) return;
    const { path, objects } = spatialFold(ode, TERRAIN);
    const result = simulateParcours(path, objects);
    expect(result.produced.length).toBeGreaterThan(0);
    expect(result.produced.every((note) => note.time >= 0 && note.time <= path.duration + 0.05)).toBe(true);
  });

  it("produces drone-on and drone-off events for a continuous drone", () => {
    const canon = demoScores.find((score) => score.id === "path_02_pachelbel");
    expect(canon).toBeDefined();
    if (!canon) return;
    const { path, objects } = spatialFold(canon, TERRAIN);
    const result = simulateParcours(path, objects);
    const droneEvents = result.produced.filter((note) => note.kind === "drone-on" || note.kind === "drone-off");
    expect(droneEvents.length).toBeGreaterThanOrEqual(2);
  });
});

describe("score comparator", () => {
  it("attaches an analysis with counts on every generated plan", () => {
    for (const score of demoScores) {
      const { plan } = spatialFold(score, TERRAIN);
      expect(plan.analysis).toBeDefined();
      if (!plan.analysis) continue;
      expect(plan.analysis.counts.expected).toBeGreaterThan(0);
      expect(plan.analysis.counts.matched + plan.analysis.counts.missing).toBeLessThanOrEqual(plan.analysis.counts.expected);
    }
  });

  it("builds the expected note count consistent with the source events", () => {
    const ode = demoScores.find((score) => score.id === "path_01_ode_to_joy");
    if (!ode) return;
    const expected = buildExpectedNotes(ode);
    // Ode has 15 melody notes + 7 phrase notes = 22 expected entries
    expect(expected.length).toBe(22);
  });

  it("detects extra notes vs missing notes separately", () => {
    const score = demoScores[0];
    const expected = buildExpectedNotes(score);
    // Build a fake produced list with one missing + one extra
    const fakeProduced = [{
      time: 99,
      midi: 60,
      noteName: "C4",
      velocity: 0.5,
      duration: 0.2,
      instrument: "glass_bell" as const,
      sourceObjectId: "fake",
      kind: "note" as const,
      pitchSemitones: 0
    }];
    const result = compareProduced(score, fakeProduced);
    expect(result.counts.missing).toBe(expected.length);
    expect(result.counts.extra).toBe(1);
    expect(result.counts.matched).toBe(0);
  });
});
