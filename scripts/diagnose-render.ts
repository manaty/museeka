import { demoScores } from "../src/generation/demoScores";
import { generateSceneFromScores } from "../src/generation/sceneGenerator";

const { plans } = generateSceneFromScores(demoScores, 12345);

let totalExpected = 0;
let totalMatched = 0;
let totalExtras = 0;
let failingScores = 0;

for (const plan of plans) {
  const score = demoScores.find((s) => s.id === plan.scoreId);
  const a = plan.analysis;
  if (!a || !score) continue;
  const expected = a.counts.expected;
  const matched = a.counts.matched;
  const wrong = a.counts.wrongPitch;
  const missing = a.counts.missing;
  const extra = a.counts.extra;
  const acc = (matched / expected * 100).toFixed(1);
  totalExpected += expected;
  totalMatched += matched;
  totalExtras += extra;
  if (extra > 0 || matched < expected) failingScores += 1;

  console.log(`\n=== ${score.id} (${score.name}) ===`);
  console.log(`expected: ${expected}  produced: ${a.counts.produced}  matched: ${matched} (${acc}%)  wrong-pitch: ${wrong}  missing: ${missing}  extra: ${extra}`);
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

const aggregateAcc = (totalMatched / totalExpected * 100).toFixed(2);
console.log(`\n=== AGGREGATE ===`);
console.log(`matched ${totalMatched}/${totalExpected} (${aggregateAcc}%)  extras: ${totalExtras}  failing: ${failingScores}/${plans.length}`);

if (failingScores > 0) {
  console.error(`\nFAIL: ${failingScores} score(s) below 100% matched / 0 extras`);
  process.exit(1);
}
