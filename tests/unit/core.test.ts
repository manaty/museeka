import { describe, expect, it } from "vitest";
import { applyCurve } from "../../src/core/curves";
import { evaluateField } from "../../src/core/fields";
import { samplePathAtTime } from "../../src/core/path";
import { computeEncounter } from "../../src/core/encounter";
import type { Path3D, PlayerState, SoundObject, Transform } from "../../src/core/types";

const transform: Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

describe("core spatial math", () => {
  it("applies supported field curves", () => {
    expect(applyCurve(0.5, { type: "linear" })).toBeCloseTo(0.5);
    expect(applyCurve(0.5, { type: "smoothstep" })).toBeCloseTo(0.5);
    expect(applyCurve(0.5, { type: "exponential", k: 2 })).toBeCloseTo(0.25);
    expect(applyCurve(0.5, { type: "gaussian", center: 0.5, sigma: 0.2 })).toBeCloseTo(1);
    expect(applyCurve(0.1, { type: "plateau", inner: 0.2, outer: 0.8 })).toBe(0);
    expect(applyCurve(0.9, { type: "plateau", inner: 0.2, outer: 0.8 })).toBe(1);
  });

  it("evaluates sphere, ellipsoid, cone and ring fields", () => {
    expect(evaluateField({ shape: "sphere", params: { radius: 5 } }, transform, [0, 0, 0]).intensity).toBeCloseTo(1);
    expect(evaluateField({ shape: "ellipsoid", params: { radius: [3, 6, 3] } }, transform, [0, 5, 0]).inside).toBe(true);
    expect(evaluateField({ shape: "cone", params: { range: 10, angleDegrees: 60, direction: [0, 0, 1] } }, transform, [0, 0, 4]).inside).toBe(true);
    expect(evaluateField({ shape: "ring", params: { centerRadius: 4, thickness: 1, heightRange: [-1, 1] } }, transform, [4, 0, 0]).inside).toBe(true);
  });

  it("samples catmull-rom paths and computes encounters", () => {
    const path: Path3D = {
      id: "path",
      name: "Path",
      duration: 4,
      mode: "flying",
      speedScale: 1,
      constraints: { maxSpeed: 8, maxAcceleration: 10, maxCurvature: 1, minGroundClearance: 1, maxGroundClearance: 40 },
      interpolation: "catmull-rom",
      points: [
        { t: 0, p: [0, 5, 0] },
        { t: 1, p: [2, 5, 0] },
        { t: 2, p: [4, 5, 0] },
        { t: 3, p: [6, 5, 0] },
        { t: 4, p: [8, 5, 0] }
      ]
    };
    expect(samplePathAtTime(path, 2)[0]).toBeCloseTo(4);

    const player: PlayerState = { time: 1, pathId: "path", position: [1, 0, 0], previousPosition: [0, 0, 0], velocity: [1, 0, 0], speed: 1 };
    const object: SoundObject = {
      id: "object",
      kind: "flower",
      transform: { position: [3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      field: { shape: "sphere", params: { radius: 4 } },
      trigger: { mode: "enter", threshold: 0.4, cooldown: 0.2 },
      audio: { generator: "note", instrument: "glass_bell", baseNote: "C4", duration: 0.2, velocity: 0.8 },
      mappings: [],
      visual: { model: "flower", color: "#ffffff" }
    };
    expect(computeEncounter(player, object).approachSpeed).toBeGreaterThan(0);
  });
});
