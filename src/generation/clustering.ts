import type { EventCluster, MusicEvent, MusicScore, SpatialScore, SpatialScoreEvent, Vec3 } from "../core/types";
import { createSeededRandom } from "./random";

const pitchClass = (note: string) => note.replace(/[0-9-]/g, "");

function roleFor(event: MusicEvent): SpatialScoreEvent["role"] {
  if (event.kind === "chord") return "harmony";
  if (event.kind === "drone") return "drone";
  if (event.kind === "percussion") return "rhythm";
  if (event.kind === "phrase") return "ornament";
  return "melody";
}

function intentFor(event: MusicEvent, score: MusicScore): SpatialScoreEvent["spatialIntent"] {
  if (score.id.includes("vertical")) return "vertical_pass";
  if (event.kind === "chord") return "frontal_approach";
  if (event.kind === "drone" || event.kind === "phrase") return "orbit";
  return "direct_pass";
}

function objectsFor(role: SpatialScoreEvent["role"]): string[] {
  switch (role) {
    case "harmony":
      return ["statue", "arch", "tree"];
    case "rhythm":
      return ["rock", "crab", "crystal"];
    case "drone":
      return ["temple", "waterfall", "rock"];
    case "ornament":
      return ["bird", "crystal", "flower"];
    case "melody":
      return ["flower", "crystal", "tree"];
  }
}

export function toSpatialScore(score: MusicScore): SpatialScore {
  return {
    id: `${score.id}_spatial`,
    name: `${score.name} spatial`,
    events: score.events.map((event) => {
      const role = roleFor(event);
      return {
        ...event,
        role,
        spatialIntent: intentFor(event, score),
        suggestedObjectKinds: objectsFor(role)
      };
    })
  };
}

export function compatibility(a: SpatialScoreEvent, b: SpatialScoreEvent): number {
  if (a.kind !== b.kind && a.role !== b.role) {
    return 0.1;
  }

  const samePitchClass = a.notes.some((left) => b.notes.some((right) => pitchClass(left) === pitchClass(right)));
  const sameChord = a.kind === "chord" && b.kind === "chord" && a.notes.map(pitchClass).sort().join("-") === b.notes.map(pitchClass).sort().join("-");
  const sameInstrument = a.instrument === b.instrument;
  const roleBonus = a.role === b.role ? 0.25 : 0;
  const pitchBonus = sameChord ? 0.55 : samePitchClass ? 0.38 : 0;
  const instrumentBonus = sameInstrument ? 0.2 : 0;
  const durationBonus = 0.2 * (1 - Math.min(1, Math.abs(a.duration - b.duration) / Math.max(a.duration, b.duration, 0.1)));

  return Math.min(1, roleBonus + pitchBonus + instrumentBonus + durationBonus);
}

function clusterKey(event: SpatialScoreEvent): string {
  if (event.kind === "chord") return `chord_${event.notes.map(pitchClass).sort().join("_")}`;
  if (event.kind === "drone") return `drone_${event.notes.map(pitchClass).sort().join("_")}`;
  if (event.kind === "percussion") return `rhythm_${event.instrument}`;
  if (event.kind === "phrase") return `phrase_${event.instrument}_${event.notes.length}`;
  return `note_${pitchClass(event.notes[0])}_${event.instrument}`;
}

export function clusterSpatialEvents(spatialScore: SpatialScore, seed = 1234): EventCluster[] {
  const random = createSeededRandom(seed);
  const buckets = new Map<string, SpatialScoreEvent[]>();

  for (const event of spatialScore.events) {
    const key = clusterKey(event);
    buckets.set(key, [...(buckets.get(key) ?? []), event]);
  }

  return [...buckets.entries()].map(([key, events], index) => {
    const angle = index * 1.173 + random() * 0.35;
    const radius = 12 + (index % 5) * 5 + random() * 4;
    const y = 5 + (events[0].role === "drone" ? 1 : events[0].role === "harmony" ? 4 : 7) + random() * 4;
    const anchor: Vec3 = [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    const averageCompatibility =
      events.length <= 1
        ? 0.35
        : events.reduce((sum, event, outerIndex) => sum + events.slice(outerIndex + 1).reduce((innerSum, other) => innerSum + compatibility(event, other), 0), 0) /
          Math.max(1, (events.length * (events.length - 1)) / 2);

    return {
      id: `cluster_${key}`,
      events,
      candidateObjectKinds: events[0].suggestedObjectKinds,
      reuseScore: Math.max(0.35, Math.min(1, averageCompatibility + events.length * 0.08)),
      anchor
    };
  });
}
