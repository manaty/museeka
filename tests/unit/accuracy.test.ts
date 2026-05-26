import { describe, expect, it } from "vitest";
import { demoScores } from "../../src/generation/demoScores";
import { generateSceneFromScores } from "../../src/generation/sceneGenerator";

/**
 * Regression guard: every demo MIDI must reproduce its source partition exactly
 * via spatial encounters. matched = expected and extras = 0 for all five demos.
 */
describe("render accuracy on demo scores", () => {
  const { plans } = generateSceneFromScores(demoScores, 12345);

  for (const score of demoScores) {
    it(`${score.id} reproduces exactly with no extras`, () => {
      const plan = plans.find((p) => p.scoreId === score.id);
      expect(plan, `plan for ${score.id}`).toBeDefined();
      if (!plan?.analysis) throw new Error(`no analysis for ${score.id}`);
      const a = plan.analysis;
      expect(a.counts.matched, `matched for ${score.id}`).toBe(a.counts.expected);
      expect(a.counts.extra, `extras for ${score.id}`).toBe(0);
      expect(a.counts.wrongPitch, `wrong-pitch for ${score.id}`).toBe(0);
      expect(a.counts.missing, `missing for ${score.id}`).toBe(0);
    });
  }
});
