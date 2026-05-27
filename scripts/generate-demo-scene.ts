import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateSceneFromScores } from "../src/generation/sceneGenerator";
import { parseIslandScene } from "../src/data/schema";
import { parseMidiArrayBuffer, groupMidiNotes } from "../src/music/midi";
import type { MusicEvent, MusicScore } from "../src/core/types";

const MIDI_SOURCES: Array<{ id: string; name: string; file: string; maxDuration?: number }> = [
  { id: "ode_to_joy", name: "Ode to Joy", file: "public/data/midi/01-ode-to-joy.mid" },
  // Pachelbel intégral = 324 s / 3133 notes → fait exploser le générateur
  // (O(n²) motif detection + relaxer répété). On le coupe à 90 s.
  { id: "pachelbel_canon", name: "Canon in D", file: "public/data/midi/02-pachelbel-canon.mid", maxDuration: 90 },
  { id: "frere_jacques", name: "Frère Jacques", file: "public/data/midi/03-frere-jacques.mid" },
  { id: "bach_prelude_c", name: "Prelude in C (BWV 846)", file: "public/data/midi/04-bach-prelude-c.mid" },
  { id: "greensleeves", name: "Greensleeves", file: "public/data/midi/05-greensleeves.mid" }
];

/**
 * Flatten all tracks of a score into a single mono-instrument stream and re-run
 * chord-grouping across the unified note stream. Used for multi-instrument scores
 * (Pachelbel) so that simultaneous notes from different instruments combine into
 * playable chord aggregates — the single-path architecture can then traverse one
 * coherent timeline instead of competing for distinct anchor visits per voice.
 */
function flattenToMonoPiano(score: MusicScore): MusicScore {
  const allRawNotes: MusicEvent[] = (score.tracks ?? []).flatMap((track) =>
    track.notes.map((note) => ({
      id: note.id,
      time: note.time,
      duration: note.duration,
      kind: "note" as const,
      notes: [note.note],
      velocity: note.velocity,
      channel: 0,
      instrument: "piano" as const
    }))
  );
  // Sort by time then re-group so simultaneous notes across former tracks form chords.
  allRawNotes.sort((a, b) => a.time - b.time);
  const events = groupMidiNotes(allRawNotes);
  return {
    ...score,
    events,
    tracks: [
      {
        id: "merged",
        name: "Piano",
        channel: 0,
        notes: (score.tracks ?? []).flatMap((t) => t.notes).sort((a, b) => a.time - b.time)
      }
    ]
  };
}

function truncateScore(score: MusicScore, maxDuration: number): MusicScore {
  if (score.duration <= maxDuration) return score;
  const events = score.events.filter((e) => e.time + e.duration <= maxDuration);
  const tracks = score.tracks?.map((t) => ({
    ...t,
    notes: t.notes.filter((n) => n.time + n.duration <= maxDuration)
  }));
  const duration = Math.max(...events.map((e) => e.time + e.duration), 1);
  return { ...score, events, tracks, duration };
}

async function loadScore(spec: { id: string; name: string; file: string; maxDuration?: number }): Promise<MusicScore> {
  const buf = await readFile(resolve(spec.file));
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  let score = parseMidiArrayBuffer(arrayBuffer, spec.name);
  // Flatten multi-track scores to a single piano stream so simultaneous voices
  // from different instruments form playable chord aggregates on the shared path.
  if ((score.tracks?.length ?? 0) > 1) {
    const beforeEvents = score.events.length;
    score = flattenToMonoPiano(score);
    console.log(`  flattened ${spec.name} ${beforeEvents} events → ${score.events.length} events (mono piano)`);
  }
  if (spec.maxDuration && score.duration > spec.maxDuration) {
    const before = score.events.length;
    score = truncateScore(score, spec.maxDuration);
    console.log(`  truncated ${spec.name} from ${before} to ${score.events.length} events (${spec.maxDuration}s cap)`);
  }
  return { ...score, id: `path_${spec.id}`, name: spec.name };
}

const scenePath = resolve("public/data/museeka_demo_scene.json");
const reportPath = resolve("public/data/museeka_generation_report.json");
const sourcesPath = resolve("public/data/museeka_demo_sources.json");

const scores = await Promise.all(MIDI_SOURCES.map(loadScore));
for (const score of scores) {
  console.log(`Loaded ${score.name}: ${score.events.length} events, ${score.tracks?.length ?? 0} tracks, ${score.duration.toFixed(1)}s`);
}

console.log("Generating scene...");
const t0 = Date.now();
const { scene, reports, plans } = generateSceneFromScores(scores, 12345);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

parseIslandScene(scene);

await mkdir(dirname(scenePath), { recursive: true });
await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify({ version: "0.1", reports }, null, 2)}\n`, "utf8");
await writeFile(sourcesPath, `${JSON.stringify({ version: "0.1", scores }, null, 2)}\n`, "utf8");

console.log(`\nGenerated in ${elapsed}s: ${scene.paths.length} paths, ${scene.soundObjects.length} sound objects.`);
for (const plan of plans) {
  const a = plan.analysis;
  if (!a) continue;
  console.log(`  ${plan.scoreId}: matched ${a.counts.matched}/${a.counts.expected} (${(a.accuracy * 100).toFixed(1)}%), extras ${a.counts.extra}`);
}
