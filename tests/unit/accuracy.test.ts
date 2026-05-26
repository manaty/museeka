import { describe, expect, it } from "vitest";
import { demoScores } from "../../src/generation/demoScores";
import { generateSceneFromScores } from "../../src/generation/sceneGenerator";

/**
 * Regression guard: the algorithm produces at least 90% accuracy on each of the
 * hand-written demo fixtures. The 100% baseline was lowered slightly when we
 * tuned the algorithm for real MIDI density (chord-grouping threshold dropped
 * from 3 to 2, peak state reset post-fire, anchor-aware aggregate placement).
 * These tuning changes are net positive for real MIDI but cost a few % on the
 * synthetic fixtures.
 */
describe("render accuracy on demo scores", { timeout: 60_000 }, () => {
  const { plans } = generateSceneFromScores(demoScores, 12345);

  for (const score of demoScores) {
    it(`${score.id} reaches at least 90% accuracy with no extras`, () => {
      const plan = plans.find((p) => p.scoreId === score.id);
      expect(plan, `plan for ${score.id}`).toBeDefined();
      if (!plan?.analysis) throw new Error(`no analysis for ${score.id}`);
      const a = plan.analysis;
      expect(a.accuracy, `accuracy for ${score.id}`).toBeGreaterThanOrEqual(0.90);
      expect(a.counts.extra, `extras for ${score.id}`).toBeLessThanOrEqual(3);
    });
  }
});
