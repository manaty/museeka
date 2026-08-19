import { beforeEach, describe, expect, it } from "vitest";
import { findAnnotation, listAnnotations, saveAnnotation } from "../../src/melody/research/storage";
import type { MelodyAnnotation } from "../../src/melody/research/types";

const annotation = (preference: number): MelodyAnnotation => ({
  stimulusId: "stimulus_test_structural_v1",
  melodyId: "melody_test",
  listenerId: "listener_test",
  createdAt: "2026-08-19T00:00:00.000Z",
  preference,
  emotion: { valence: 0.2 },
  perception: { familiarity: 0.1 }
});

describe("melody research storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists an annotation", () => {
    saveAnnotation(annotation(0.7));
    expect(listAnnotations()).toHaveLength(1);
    expect(findAnnotation("stimulus_test_structural_v1", "listener_test")?.preference).toBe(0.7);
  });

  it("replaces the previous rating for the same listener and stimulus", () => {
    saveAnnotation(annotation(0.2));
    saveAnnotation(annotation(0.9));
    expect(listAnnotations()).toHaveLength(1);
    expect(findAnnotation("stimulus_test_structural_v1", "listener_test")?.preference).toBe(0.9);
  });
});
