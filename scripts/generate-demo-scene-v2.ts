import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateSceneFromScoresV2 } from "../src/generation/sceneGeneratorV2";
import { parseIslandScene } from "../src/data/schema";
import { parseMidiArrayBuffer, groupMidiNotes } from "../src/music/midi";
import type { MusicEvent, MusicScore } from "../src/core/types";

const MIDI_SOURCES: Array<{ id: string; name: string; file: string; maxDuration?: number }> = [
  { id: "ode_to_joy", name: "Ode to Joy", file: "public/data/midi/01-ode-to-joy.mid", maxDuration: 30 },
  { id: "pachelbel_canon", name: "Canon in D", file: "public/data/midi/02-pachelbel-canon.mid", maxDuration: 45 },
  { id: "frere_jacques", name: "Frère Jacques", file: "public/data/midi/03-frere-jacques.mid", maxDuration: 18 },
  { id: "bach_prelude_c", name: "Prelude in C (BWV 846)", file: "public/data/midi/04-bach-prelude-c.mid", maxDuration: 45 },
  { id: "greensleeves", name: "Greensleeves", file: "public/data/midi/05-greensleeves.mid", maxDuration: 45 }
];

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
  if ((score.tracks?.length ?? 0) > 1) {
    score = flattenToMonoPiano(score);
  }
  if (spec.maxDuration && score.duration > spec.maxDuration) {
    score = truncateScore(score, spec.maxDuration);
  }
  return { ...score, id: `path_${spec.id}`, name: spec.name };
}

const scenePath = resolve("public/data/museeka_demo_scene_v2.json");
const reportPath = resolve("public/data/museeka_generation_report_v2.json");

const scores = await Promise.all(MIDI_SOURCES.map(loadScore));
for (const score of scores) {
  console.log(`Loaded ${score.name}: ${score.events.length} events, ${score.tracks?.length ?? 0} tracks, ${score.duration.toFixed(1)}s`);
}

console.log("Generating scene (V2 organic)...");
const t0 = Date.now();
const { scene, reports, plans } = generateSceneFromScoresV2(scores, 12345);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

parseIslandScene(scene);

await mkdir(dirname(scenePath), { recursive: true });
await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify({ version: "0.1", algorithm: "v2-organic", reports }, null, 2)}\n`, "utf8");

console.log(`\nGenerated [V2 organic] in ${elapsed}s: ${scene.paths.length} paths, ${scene.soundObjects.length} sound objects.`);
for (const plan of plans) {
  const a = plan.analysis;
  if (!a) continue;
  console.log(`  ${plan.scoreId}: matched ${a.counts.matched}/${a.counts.expected} (${(a.accuracy * 100).toFixed(1)}%), extras ${a.counts.extra}`);
}
