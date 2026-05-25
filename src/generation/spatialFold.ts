import type {
  AudioGenerator,
  FoldingPlan,
  FoldingStep,
  GenerationReport,
  InstrumentId,
  IslandScene,
  Mapping,
  Motif,
  MusicEvent,
  MusicScore,
  NoteToken,
  Path3D,
  PathPoint,
  PitchClassAnchor,
  SoundField,
  SoundObject,
  SoundObjectVisual,
  Vec3
} from "../core/types";
import { samplePathAtTime } from "../core/path";
import { terrainGroundY } from "../core/terrain";
import { distance } from "../core/vec3";
import { detectMotifs, tokensCoveredByMotifs } from "./motifDetect";
import { simulateParcours } from "./scoreSimulator";
import { compareProduced } from "./scoreCompare";

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OCTAVE_HEIGHT_M = 6;
const ANCHOR_BASE_RADIUS = 18;
const ANCHOR_RING_STEP = 4;
const ANCHOR_FIELD_RADIUS = 3.2;
const ANCHOR_FIELD_ALTITUDE = 7;
const ANCHOR_VISITS_BEFORE_SPLIT = 9;
const AGGREGATE_OFFSET = 4;
const MIN_SEGMENT_DURATION = 0.05;
const MAX_PATH_SPEED = 26;

const VISUAL_BY_INSTRUMENT: Record<InstrumentId, SoundObjectVisual["model"]> = {
  glass_bell: "flower",
  warm_pad: "statue",
  flute: "bird",
  woodblock: "rock",
  low_pad: "crystal",
  pluck: "tree",
  crystal: "crystal"
};

const COLOR_BY_INSTRUMENT: Record<InstrumentId, string> = {
  glass_bell: "#ffd770",
  warm_pad: "#a4b0ff",
  flute: "#9be9ff",
  woodblock: "#f6c98f",
  low_pad: "#b89dff",
  pluck: "#8ff0d2",
  crystal: "#d2d7ff"
};

const INSTRUMENT_RING_INDEX: Record<InstrumentId, number> = {
  glass_bell: 0,
  flute: 1,
  pluck: 2,
  crystal: 3,
  warm_pad: 4,
  woodblock: 5,
  low_pad: 6
};

const AGGREGATE_VISUAL_BY_KIND: Record<string, SoundObjectVisual["model"]> = {
  chord: "arch",
  drone: "temple",
  percussion: "rock"
};

export type SpatialFoldOptions = {
  seed?: number;
};

type Waypoint = {
  t: number;
  p: Vec3;
  source: "entry" | "exit" | "anchor" | "aggregate";
  refId?: string;
};

function pitchClassName(pc: number): string {
  return PITCH_CLASS_NAMES[((pc % 12) + 12) % 12];
}

function noteNameToMidi(name: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!match) return 60;
  const [, letter, accidental, octaveStr] = match;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semitone = base[letter.toUpperCase()] ?? 0;
  if (accidental === "#") semitone += 1;
  if (accidental === "b") semitone -= 1;
  const octave = parseInt(octaveStr, 10);
  return (octave + 1) * 12 + semitone;
}

function midiToNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${PITCH_CLASS_NAMES[pc]}${octave}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 4;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function tokenizeScore(score: MusicScore): { tokens: NoteToken[]; aggregates: MusicEvent[] } {
  const tokens: NoteToken[] = [];
  const aggregates: MusicEvent[] = [];

  for (const event of score.events) {
    if (event.kind === "note") {
      const midi = noteNameToMidi(event.notes[0]);
      tokens.push({
        id: `tok_${event.id}`,
        time: event.time,
        duration: event.duration,
        midi,
        pitchClass: ((midi % 12) + 12) % 12,
        octave: Math.floor(midi / 12) - 1,
        velocity: event.velocity,
        instrument: event.instrument,
        role: "melody",
        sourceEventId: event.id
      });
      continue;
    }

    if (event.kind === "phrase") {
      const step = event.notes.length > 1 ? event.duration / event.notes.length : event.duration;
      const noteDuration = Math.max(0.08, step * 0.85);
      event.notes.forEach((noteName, index) => {
        const midi = noteNameToMidi(noteName);
        tokens.push({
          id: `tok_${event.id}_${index}`,
          time: event.time + index * step,
          duration: noteDuration,
          midi,
          pitchClass: ((midi % 12) + 12) % 12,
          octave: Math.floor(midi / 12) - 1,
          velocity: event.velocity,
          instrument: event.instrument,
          role: "ornament",
          sourceEventId: event.id
        });
      });
      continue;
    }

    aggregates.push(event);
  }

  tokens.sort((a, b) => a.time - b.time);
  aggregates.sort((a, b) => a.time - b.time);
  return { tokens, aggregates };
}

function ringRadiusFor(instrument: InstrumentId): number {
  return ANCHOR_BASE_RADIUS + (INSTRUMENT_RING_INDEX[instrument] ?? 0) * ANCHOR_RING_STEP;
}

function placeAnchorPosition(pitchClass: number, instrument: InstrumentId, baseOctave: number, terrain: IslandScene["terrain"]): Vec3 {
  const ringRadius = ringRadiusFor(instrument);
  const angle = (pitchClass / 12) * Math.PI * 2;
  const x = Math.cos(angle) * ringRadius;
  const z = Math.sin(angle) * ringRadius;
  const ground = terrainGroundY(x, z, terrain);
  const y = Math.max(ground + 3, 6) + baseOctave * 0.6;
  return [x, y, z];
}

export function buildPitchClassAnchors(tokens: NoteToken[], terrain: IslandScene["terrain"]): PitchClassAnchor[] {
  const groups = new Map<string, NoteToken[]>();
  for (const token of tokens) {
    const key = `${token.instrument}_${token.pitchClass}`;
    const list = groups.get(key) ?? [];
    list.push(token);
    groups.set(key, list);
  }

  const anchors: PitchClassAnchor[] = [];
  for (const [, list] of groups) {
    const first = list[0];
    const baseOctave = Math.round(median(list.map((token) => token.octave)));
    anchors.push({
      id: `pc_${pitchClassName(first.pitchClass).replace("#", "s")}_${first.instrument}`,
      pitchClass: first.pitchClass,
      instrument: first.instrument,
      position: placeAnchorPosition(first.pitchClass, first.instrument, baseOctave, terrain),
      baseOctave,
      visits: list.length
    });
  }

  return anchors;
}

function anchorIdFor(token: NoteToken): string {
  return `pc_${pitchClassName(token.pitchClass).replace("#", "s")}_${token.instrument}`;
}

function altitudeForToken(token: NoteToken, anchor: PitchClassAnchor): number {
  const octaveDelta = token.octave - anchor.baseOctave;
  return anchor.position[1] + octaveDelta * OCTAVE_HEIGHT_M;
}

function buildAnchorSoundObject(anchor: PitchClassAnchor): SoundObject {
  const noteName = `${pitchClassName(anchor.pitchClass)}${anchor.baseOctave}`;
  const audio: AudioGenerator = {
    generator: "note",
    instrument: anchor.instrument,
    baseNote: noteName,
    duration: 0.5,
    velocity: 0.8
  };
  const mappings: Mapping[] = [
    { input: "field.intensity", output: "volume", curve: { type: "smoothstep" }, range: [0, 1] },
    { input: "encounter.altitudeRelative", output: "pitchSemitones", curve: { type: "linear" }, range: [-12, 12], clampInput: [-6, 6] },
    { input: "encounter.approachSpeed", output: "brightness", curve: { type: "exponential", k: 1.4 }, range: [0.3, 1] }
  ];
  const field: SoundField = {
    shape: "ellipsoid",
    params: { radius: [ANCHOR_FIELD_RADIUS, ANCHOR_FIELD_ALTITUDE, ANCHOR_FIELD_RADIUS] },
    falloff: { distance: { type: "smoothstep" }, altitude: { type: "linear" } }
  };

  return {
    id: anchor.id,
    kind: `pitch_${pitchClassName(anchor.pitchClass)}`,
    transform: { position: anchor.position, rotation: [0, (anchor.pitchClass * 30) % 360, 0], scale: [1, 1, 1] },
    field,
    trigger: { mode: "peak", threshold: 0.42, cooldown: 0.18, retrigger: true },
    audio,
    mappings,
    visual: {
      model: VISUAL_BY_INSTRUMENT[anchor.instrument],
      color: COLOR_BY_INSTRUMENT[anchor.instrument],
      activeGlow: true
    },
    pitchClass: anchor.pitchClass
  };
}

function audioForAggregate(event: MusicEvent): AudioGenerator {
  if (event.kind === "chord") {
    return { generator: "chord", instrument: event.instrument, notes: event.notes, duration: Math.max(0.6, event.duration), velocity: event.velocity };
  }
  if (event.kind === "drone") {
    return { generator: "drone", instrument: event.instrument, notes: event.notes, continuous: true, velocity: event.velocity };
  }
  return {
    generator: "percussion",
    instrument: event.instrument,
    pattern: [
      { dt: 0, velocity: event.velocity },
      { dt: 0.14, velocity: event.velocity * 0.55 }
    ]
  };
}

function fieldForAggregate(event: MusicEvent): SoundField {
  if (event.kind === "drone") {
    return {
      shape: "ellipsoid",
      params: { radius: [Math.max(7, event.duration * 1.2), 5, Math.max(7, event.duration * 1.2)] },
      falloff: { distance: { type: "plateau", inner: 0.25, outer: 0.95 } }
    };
  }
  if (event.kind === "chord") {
    return {
      shape: "sphere",
      params: { radius: 5.5 },
      falloff: { distance: { type: "smoothstep" } }
    };
  }
  return {
    shape: "sphere",
    params: { radius: 3.8 },
    falloff: { distance: { type: "smoothstep" } }
  };
}

function triggerForAggregate(event: MusicEvent) {
  if (event.kind === "drone") return { mode: "continuous" as const, threshold: 0.3, cooldown: 0.5, retrigger: true };
  if (event.kind === "percussion") return { mode: "peak" as const, threshold: 0.5, cooldown: 0.35, retrigger: true };
  return { mode: "peak" as const, threshold: 0.42, cooldown: 0.6, retrigger: true };
}

function colorForAggregate(event: MusicEvent): string {
  if (event.kind === "drone") return "#7e6bff";
  if (event.kind === "percussion") return "#ff9d8d";
  return "#a4b0ff";
}

function buildEntryWaypoint(firstToken: NoteToken | null, anchors: Map<string, PitchClassAnchor>, terrain: IslandScene["terrain"]): Waypoint {
  if (!firstToken) {
    return { t: 0, p: [0, 14, -30], source: "entry" };
  }
  const anchor = anchors.get(anchorIdFor(firstToken));
  if (!anchor) {
    return { t: 0, p: [0, 14, -30], source: "entry" };
  }
  const direction: Vec3 = [-anchor.position[0], 0, -anchor.position[2]];
  const len = Math.hypot(direction[0], direction[2]);
  const scale = len > 0.0001 ? 18 / len : 0;
  const x = anchor.position[0] + direction[0] * scale;
  const z = anchor.position[2] + direction[2] * scale;
  const ground = terrainGroundY(x, z, terrain);
  return { t: 0, p: [x, Math.max(ground + 12, 14), z], source: "entry" };
}

function buildExitWaypoint(lastToken: NoteToken | null, anchors: Map<string, PitchClassAnchor>, terrain: IslandScene["terrain"], duration: number): Waypoint {
  if (!lastToken) {
    return { t: duration, p: [0, 14, 30], source: "exit" };
  }
  const anchor = anchors.get(anchorIdFor(lastToken));
  if (!anchor) {
    return { t: duration, p: [0, 14, 30], source: "exit" };
  }
  const direction: Vec3 = [anchor.position[0], 0, anchor.position[2]];
  const len = Math.hypot(direction[0], direction[2]);
  const scale = len > 0.0001 ? 18 / len : 0;
  const x = anchor.position[0] + direction[0] * scale;
  const z = anchor.position[2] + direction[2] * scale;
  const ground = terrainGroundY(x, z, terrain);
  return { t: duration, p: [x, Math.max(ground + 12, 14), z], source: "exit" };
}

function waypointForToken(token: NoteToken, anchors: Map<string, PitchClassAnchor>): Waypoint | null {
  const anchor = anchors.get(anchorIdFor(token));
  if (!anchor) return null;
  return {
    t: token.time,
    p: [anchor.position[0], altitudeForToken(token, anchor), anchor.position[2]],
    source: "anchor",
    refId: token.id
  };
}

function waypointsToPath(waypoints: Waypoint[], scoreId: string, scoreName: string, duration: number): Path3D {
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  const dedup: Waypoint[] = [];
  for (const wp of sorted) {
    const previous = dedup[dedup.length - 1];
    if (previous && Math.abs(previous.t - wp.t) < 0.001 && distance(previous.p, wp.p) < 0.05) continue;
    dedup.push(wp);
  }

  const points: PathPoint[] = dedup.map((wp) => ({ t: wp.t, p: wp.p }));

  return {
    id: scoreId.replace(/_/g, "-"),
    name: scoreName,
    duration,
    mode: "flying",
    speedScale: 1,
    constraints: { maxSpeed: MAX_PATH_SPEED, maxAcceleration: 18, maxCurvature: 1.6, minGroundClearance: 1.5, maxGroundClearance: 60 },
    points,
    interpolation: "catmull-rom"
  };
}

function annotateSpeeds(path: Path3D): { path: Path3D; violations: number; maxObservedSpeed: number } {
  let violations = 0;
  let maxObservedSpeed = 0;
  const annotated = path.points.map((point, index) => {
    if (index === 0) return { ...point, speed: 0 };
    const previous = path.points[index - 1];
    const dt = Math.max(MIN_SEGMENT_DURATION, point.t - previous.t);
    const speed = distance(point.p, previous.p) / dt;
    maxObservedSpeed = Math.max(maxObservedSpeed, speed);
    if (speed > path.constraints.maxSpeed) violations += 1;
    return { ...point, speed };
  });
  return { path: { ...path, points: annotated }, violations, maxObservedSpeed };
}

function liftAboveTerrain(path: Path3D, terrain: IslandScene["terrain"]): Path3D {
  const minClearance = path.constraints.minGroundClearance;
  const lifted = path.points.map((point) => {
    const ground = terrainGroundY(point.p[0], point.p[2], terrain);
    const desiredY = Math.max(point.p[1], ground + minClearance + 0.6);
    return { ...point, p: [point.p[0], desiredY, point.p[2]] as Vec3 };
  });
  return { ...path, points: lifted };
}

function aggregatePositionAlongPath(time: number, basePath: Path3D, offsetSign: number, terrain: IslandScene["terrain"], hasTokens: boolean, aggregateIndex: number, aggregateCount: number): Vec3 {
  if (!hasTokens || basePath.points.length < 3) {
    // No melody to follow: distribute aggregates on a wide ring so they don't pile up on the entry.
    const angle = aggregateCount > 0 ? (aggregateIndex / aggregateCount) * Math.PI * 1.6 - Math.PI * 0.8 : 0;
    const radius = 22 + (aggregateIndex % 3) * 4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const ground = terrainGroundY(x, z, terrain);
    return [x, Math.max(ground + 4, 8), z];
  }
  const sample = samplePathAtTime(basePath, time);
  const next = samplePathAtTime(basePath, Math.min(basePath.duration, time + 0.4));
  const previous = samplePathAtTime(basePath, Math.max(0, time - 0.4));
  const tangent: Vec3 = [next[0] - previous[0], 0, next[2] - previous[2]];
  const tangentLen = Math.hypot(tangent[0], tangent[2]) || 1;
  const lateral: Vec3 = [-tangent[2] / tangentLen, 0, tangent[0] / tangentLen];
  const offsetPos: Vec3 = [sample[0] + lateral[0] * AGGREGATE_OFFSET * offsetSign, sample[1] - 1.5, sample[2] + lateral[2] * AGGREGATE_OFFSET * offsetSign];
  const ground = terrainGroundY(offsetPos[0], offsetPos[2], terrain);
  return [offsetPos[0], Math.max(ground + 0.8, offsetPos[1]), offsetPos[2]];
}

function buildAggregateSoundObject(event: MusicEvent, position: Vec3, index: number): SoundObject {
  const visualModel = AGGREGATE_VISUAL_BY_KIND[event.kind] ?? "crystal";
  return {
    id: `aggregate_${event.id}_${index}`,
    kind: `${event.kind}_aggregate`,
    transform: { position, rotation: [0, (index * 47) % 360, 0], scale: event.kind === "drone" ? [1.4, 1.4, 1.4] : [1.05, 1.05, 1.05] },
    field: fieldForAggregate(event),
    trigger: triggerForAggregate(event),
    audio: audioForAggregate(event),
    mappings: [
      { input: "field.intensity", output: "volume", curve: { type: "smoothstep" }, range: [0, 1] },
      { input: "encounter.approachSpeed", output: "brightness", curve: { type: "exponential", k: 1.3 }, range: [0.25, 1] }
    ],
    visual: { model: visualModel, color: colorForAggregate(event), activeGlow: true }
  };
}

function snapshotPath(waypoints: Waypoint[]): PathPoint[] {
  return [...waypoints]
    .sort((a, b) => a.t - b.t)
    .map((wp) => ({ t: wp.t, p: [...wp.p] as Vec3 }));
}

function snapshotObjects(objects: SoundObject[]): SoundObject[] {
  return objects.map((object) => ({
    ...object,
    transform: { ...object.transform, position: [...object.transform.position] as Vec3 }
  }));
}

export function spatialFold(score: MusicScore, terrain: IslandScene["terrain"], _options: SpatialFoldOptions = {}): { path: Path3D; objects: SoundObject[]; plan: FoldingPlan } {
  const { tokens, aggregates } = tokenizeScore(score);
  const anchors = buildPitchClassAnchors(tokens, terrain);
  const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const motifs = detectMotifs(tokens);
  const coveredIds = tokensCoveredByMotifs(motifs);

  const anchorObjects = anchors.map(buildAnchorSoundObject);
  const objectsCollected: SoundObject[] = [...anchorObjects];

  const firstToken = tokens[0] ?? null;
  const lastToken = tokens[tokens.length - 1] ?? null;
  const entry = buildEntryWaypoint(firstToken, anchorMap, terrain);
  const exit = buildExitWaypoint(lastToken, anchorMap, terrain, score.duration);

  const waypoints: Waypoint[] = [entry, exit];
  const steps: FoldingStep[] = [];

  steps.push({
    index: steps.length,
    kind: "init_anchors",
    description: `Île vierge : ${anchors.length} ancres pitch-class placées (${tokens.length} notes mélodiques, ${aggregates.length} agrégats).`,
    pathSnapshot: snapshotPath(waypoints),
    objectsAfter: snapshotObjects(objectsCollected),
    highlightObjectIds: anchorObjects.map((object) => object.id)
  });

  const sortedMotifs = [...motifs].sort((a, b) => b.reuseScore - a.reuseScore);
  for (const motif of sortedMotifs) {
    const addedIds: string[] = [];
    for (const occurrence of motif.occurrences) {
      for (const token of occurrence.tokens) {
        const wp = waypointForToken(token, anchorMap);
        if (!wp) continue;
        waypoints.push(wp);
        addedIds.push(anchorIdFor(token));
      }
    }
    steps.push({
      index: steps.length,
      kind: "weave_motif",
      description: `Motif ${motif.id} tissé : ${motif.occurrences.length} occurrences × ${motif.signature.intervals.length + 1} notes → mêmes ancres revisitées.`,
      pathSnapshot: snapshotPath(waypoints),
      objectsAfter: snapshotObjects(objectsCollected),
      highlightObjectIds: [...new Set(addedIds)],
      motifId: motif.id
    });
  }

  const residualTokens = tokens.filter((token) => !coveredIds.has(token.id));
  if (residualTokens.length > 0) {
    const addedIds: string[] = [];
    for (const token of residualTokens) {
      const wp = waypointForToken(token, anchorMap);
      if (!wp) continue;
      waypoints.push(wp);
      addedIds.push(anchorIdFor(token));
    }
    steps.push({
      index: steps.length,
      kind: "weave_residual_note",
      description: `${residualTokens.length} notes résiduelles tissées (hors motifs).`,
      pathSnapshot: snapshotPath(waypoints),
      objectsAfter: snapshotObjects(objectsCollected),
      highlightObjectIds: [...new Set(addedIds)]
    });
  }

  const aggregateObjects: SoundObject[] = [];
  if (aggregates.length > 0) {
    const skeletonPath = waypointsToPath(waypoints, score.id, score.name, score.duration);
    const hasTokens = tokens.length > 0;
    aggregates.forEach((event, index) => {
      const offsetSign = index % 2 === 0 ? 1 : -1;
      const position = aggregatePositionAlongPath(event.time, skeletonPath, offsetSign, terrain, hasTokens, index, aggregates.length);
      const object = buildAggregateSoundObject(event, position, index);
      aggregateObjects.push(object);
      objectsCollected.push(object);
      waypoints.push({ t: event.time, p: [position[0], position[1] + 1.2, position[2]], source: "aggregate", refId: event.id });
    });
    steps.push({
      index: steps.length,
      kind: "weave_aggregate",
      description: `${aggregates.length} agrégats placés (accords, drones, percussions) — le path les effleure au bon temps.`,
      pathSnapshot: snapshotPath(waypoints),
      objectsAfter: snapshotObjects(objectsCollected),
      highlightObjectIds: aggregateObjects.map((object) => object.id)
    });
  }

  let path = waypointsToPath(waypoints, score.id, score.name, score.duration);
  const speedAnalysis = annotateSpeeds(path);
  path = speedAnalysis.path;

  steps.push({
    index: steps.length,
    kind: "check_speed",
    description: `Vitesses calculées : max ${speedAnalysis.maxObservedSpeed.toFixed(1)} m/s, ${speedAnalysis.violations} dépassement(s) de ${MAX_PATH_SPEED} m/s.`,
    pathSnapshot: path.points.map((point) => ({ ...point, p: [...point.p] as Vec3 })),
    objectsAfter: snapshotObjects(objectsCollected)
  });

  path = liftAboveTerrain(path, terrain);

  steps.push({
    index: steps.length,
    kind: "smooth",
    description: `Path lissé et soulevé au-dessus du terrain (clearance ≥ ${path.constraints.minGroundClearance} m).`,
    pathSnapshot: path.points.map((point) => ({ ...point, p: [...point.p] as Vec3 })),
    objectsAfter: snapshotObjects(objectsCollected)
  });

  const reuseRate = tokens.length > 0 ? coveredIds.size / tokens.length : 0;

  const simulation = simulateParcours(path, objectsCollected);
  const comparison = compareProduced(score, simulation.produced);

  const plan: FoldingPlan = {
    scoreId: score.id,
    pathId: path.id,
    anchors,
    motifs,
    aggregates: aggregateObjects,
    steps,
    reuseRate,
    analysis: {
      produced: simulation.produced,
      expected: comparison.expected,
      matches: comparison.matches,
      missing: comparison.missing,
      extra: comparison.extra,
      counts: comparison.counts,
      accuracy: comparison.accuracy
    }
  };

  return { path, objects: objectsCollected, plan };
}

export function spatialFoldReport(plan: FoldingPlan): GenerationReport {
  return {
    scoreId: plan.scoreId,
    pathId: plan.pathId,
    clusters: [
      ...plan.anchors.map((anchor) => ({
        clusterId: anchor.id,
        objectId: anchor.id,
        eventIds: [],
        anchor: anchor.position,
        reuseScore: anchor.visits
      })),
      ...plan.motifs.map((motif) => ({
        clusterId: motif.id,
        objectId: motif.id,
        eventIds: motif.occurrences.flatMap((occurrence) => occurrence.tokens.map((token) => token.sourceEventId)),
        anchor: [0, 0, 0] as Vec3,
        reuseScore: motif.reuseScore
      }))
    ]
  };
}

// Re-export helpers used by tests / UI
export { anchorIdFor, midiToNoteName, noteNameToMidi };
