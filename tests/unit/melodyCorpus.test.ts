import { describe, expect, it } from "vitest";
import { BUILTIN_MELODY_CORPUS } from "../../src/melody/corpus/builtin";
import { createAnalysisSnapshot, melodyHash } from "../../src/melody/analysis/snapshot";


describe("melody corpus", () => {
  it("ships a small public-domain seed corpus with stable canonical hashes", () => {
    expect(BUILTIN_MELODY_CORPUS.length).toBeGreaterThanOrEqual(5);
    const ids = new Set<string>();

    for (const item of BUILTIN_MELODY_CORPUS) {
      expect(item.entry.license).toBe("Public domain");
      expect(item.melody.notes.length).toBeGreaterThan(4);
      expect(item.entry.melodyId).toBe(item.melody.id);
      expect(item.entry.melodyHash).toBe(melodyHash(item.melody));
      expect(ids.has(item.entry.id)).toBe(false);
      ids.add(item.entry.id);
    }
  });

  it("can produce a versioned compact analysis snapshot for every corpus melody", () => {
    for (const item of BUILTIN_MELODY_CORPUS) {
      const snapshot = createAnalysisSnapshot(item.melody);
      expect(snapshot.melodyHash).toBe(item.entry.melodyHash);
      expect(snapshot.analyzer.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(snapshot.vector.length).toBeGreaterThan(8);
      expect(snapshot.features.attacks).toBe(item.melody.notes.length);
    }
  });
});
