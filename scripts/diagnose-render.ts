import { demoScores } from "../src/generation/demoScores";
import { spatialFold } from "../src/generation/spatialFold";

const TERRAIN = { type: "simple_island" as const, radius: 64, heightScale: 10, seed: 12345 };

for (const score of demoScores) {
  const { plan } = spatialFold(score, TERRAIN);
  const a = plan.analysis;
  if (!a) continue;
  const expected = a.counts.expected;
  const matched = a.counts.matched;
  const wrong = a.counts.wrongPitch;
  const missing = a.counts.missing;
  const extra = a.counts.extra;
  console.log(`\n=== ${score.id} (${score.name}) ===`);
  console.log(`expected: ${expected}  produced: ${a.counts.produced}  matched: ${matched} (${(matched/expected*100).toFixed(1)}%)  wrong-pitch: ${wrong}  missing: ${missing}  extra: ${extra}`);
  if (missing > 0) {
    console.log("  missing examples:");
    for (const m of a.missing.slice(0, 5)) {
      console.log(`    t=${m.time.toFixed(2)} kind=${m.kind} midi=${m.midi} (${m.instrument})`);
    }
  }
  if (a.matches.filter(m => m.status === "wrong-pitch").length > 0) {
    console.log("  wrong-pitch examples:");
    for (const m of a.matches.filter(x => x.status === "wrong-pitch").slice(0, 5)) {
      console.log(`    expected t=${m.expected.time.toFixed(2)} midi=${m.expected.midi}  got midi=${m.produced.midi} (Δ=${m.midiDelta})`);
    }
  }
  if (a.extra.length > 0) {
    console.log(`  extra examples (top 5/${a.extra.length}):`);
    for (const e of a.extra.slice(0, 5)) {
      console.log(`    t=${e.time.toFixed(2)} kind=${e.kind} midi=${e.midi} from=${e.sourceObjectId}`);
    }
  }
}
