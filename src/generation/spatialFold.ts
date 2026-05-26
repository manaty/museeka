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
// Field Y radius is small (2.5 m) so vertically-stacked octave anchors
// (separated by OCTAVE_HEIGHT_M) don't bleed intensity into each other.
const ANCHOR_FIELD_ALTITUDE = 2.5;
const ANCHOR_VISITS_BEFORE_SPLIT = 9;
const AGGREGATE_OFFSET = 7;
const AGGREGATE_ANGLE_SEQUENCE = [
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI / 3,
  -Math.PI / 3,
  (Math.PI * 2) / 3,
  -(Math.PI * 2) / 3
];
const MIN_SEGMENT_DURATION = 0.05;
const MAX_PATH_SPEED = 26;
const MIN_COOLDOWN = 0.12;
const MAX_COOLDOWN = 0.8;
const COOLDOWN_DURATION_FACTOR = 0.4;
const COOLDOWN_GAP_FACTOR = 0.45;
const DENSE_PHRASE_GAP = 0.5;
const PHRASE_FEASIBLE_MARGIN = 0.6;

const VISUAL_BY_INSTRUMENT: Record<InstrumentId, SoundObjectVisual["model"]> = {
  glass_bell: "flower",
  warm_pad: "statue",
  flute: "bird",
  woodblock: "rock",
  low_pad: "crystal",
  pluck: "tree",
  crystal: "crystal",
  piano: "statue",
  violin: "bird",
  cello: "tree"
};

const COLOR_BY_INSTRUMENT: Record<InstrumentId, string> = {
  glass_bell: "#ffd770",
  warm_pad: "#a4b0ff",
  flute: "#9be9ff",
  woodblock: "#f6c98f",
  low_pad: "#b89dff",
  pluck: "#8ff0d2",
  crystal: "#d2d7ff",
  piano: "#ecd9b5",
  violin: "#ff9a5a",
  cello: "#c97746"
};

const INSTRUMENT_RING_INDEX: Record<InstrumentId, number> = {
  glass_bell: 0,
  flute: 1,
  pluck: 2,
  crystal: 3,
  warm_pad: 4,
  woodblock: 5,
  low_pad: 6,
  piano: 7,
  violin: 8,
  cello: 9
};

const AGGREGATE_VISUAL_BY_KIND: Record<string, SoundObjectVisual["model"]> = {
  chord: "arch",
  drone: "temple",
  percussion: "rock",
  phrase: "crystal"
};

export type SpatialFoldOptions = {
  seed?: number;
  /** Optional override of object positions, keyed by object id. Used by the relaxer. */
  positionOverrides?: Map<string, Vec3>;
  /** Extra radius (m) added to anchor ring radius so each score occupies its
   * own concentric band — prevents paths from one score brushing through
   * another score's anchors when they share the scene. */
  ringRadiusOffset?: number;
  /** Suffix added to anchor ids so different scores get distinct anchor
   * objects even at overlapping pitch classes. */
  anchorIdSuffix?: string;
};

type Waypoint = {
  t: number;
  p: Vec3;
  source: "entry" | "exit" | "anchor" | "aggregate" | "release";
  refId?: string;
  anchorId?: string;
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

function estimatePhrasePathDistance(event: MusicEvent, terrain: IslandScene["terrain"]): number {
  let total = 0;
  for (let i = 1; i < event.notes.length; i += 1) {
    const prevMidi = noteNameToMidi(event.notes[i - 1]);
    const curMidi = noteNameToMidi(event.notes[i]);
    const prevPc = ((prevMidi % 12) + 12) % 12;
    const curPc = ((curMidi % 12) + 12) % 12;
    const a = placeAnchorPosition(prevPc, event.instrument, 4, 4, terrain);
    const b = placeAnchorPosition(curPc, event.instrument, 4, 4, terrain);
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

function shouldCompactPhrase(event: MusicEvent, terrain: IslandScene["terrain"]): boolean {
  if (event.notes.length < 2) return false;
  const step = event.duration / event.notes.length;
  if (step >= DENSE_PHRASE_GAP) return false;
  const required = estimatePhrasePathDistance(event, terrain);
  const feasible = MAX_PATH_SPEED * step * (event.notes.length - 1) * PHRASE_FEASIBLE_MARGIN;
  return required > feasible;
}

export function tokenizeScore(score: MusicScore, terrain?: IslandScene["terrain"]): { tokens: NoteToken[]; aggregates: MusicEvent[] } {
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
      // Compact dense phrases the path could never reach in time: emit as a single
      // aggregate whose generator schedules all notes when the player enters its field.
      if (terrain && shouldCompactPhrase(event, terrain)) {
        aggregates.push(event);
        continue;
      }
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

function ringRadiusFor(instrument: InstrumentId, ringOffset = 0): number {
  return ANCHOR_BASE_RADIUS + (INSTRUMENT_RING_INDEX[instrument] ?? 0) * ANCHOR_RING_STEP + ringOffset;
}

function placeAnchorPosition(
  pitchClass: number,
  instrument: InstrumentId,
  octave: number,
  lowestOctave: number,
  terrain: IslandScene["terrain"],
  ringOffset = 0
): Vec3 {
  const ringRadius = ringRadiusFor(instrument, ringOffset);
  const angle = (pitchClass / 12) * Math.PI * 2;
  const x = Math.cos(angle) * ringRadius;
  const z = Math.sin(angle) * ringRadius;
  const ground = terrainGroundY(x, z, terrain);
  // Stack octaves vertically — lowest octave at ground+base altitude, each
  // successive octave OCTAVE_HEIGHT_M above. Each (pc, octave) has its own
  // physical anchor with its own exact baseNote.
  const y = ground + ANCHOR_FIELD_ALTITUDE + (octave - lowestOctave) * OCTAVE_HEIGHT_M;
  return [x, y, z];
}

export function buildPitchClassAnchors(
  tokens: NoteToken[],
  terrain: IslandScene["terrain"],
  ringOffset = 0,
  idSuffix = ""
): { anchors: PitchClassAnchor[]; minGapById: Map<string, number> } {
  const groups = new Map<string, NoteToken[]>();
  let lowestOctave = Number.POSITIVE_INFINITY;
  for (const token of tokens) {
    const key = `${token.instrument}_${token.pitchClass}_${token.octave}`;
    const list = groups.get(key) ?? [];
    list.push(token);
    groups.set(key, list);
    if (token.octave < lowestOctave) lowestOctave = token.octave;
  }
  if (!Number.isFinite(lowestOctave)) lowestOctave = 4;

  const anchors: PitchClassAnchor[] = [];
  const minGapById = new Map<string, number>();
  for (const [, list] of groups) {
    list.sort((a, b) => a.time - b.time);
    const first = list[0];
    const octave = first.octave;
    const id = `pc_${pitchClassName(first.pitchClass).replace("#", "s")}_${first.instrument}_o${octave}${idSuffix}`;
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 1; i < list.length; i += 1) {
      const gap = list[i].time - list[i - 1].time;
      if (gap < minGap) minGap = gap;
    }
    anchors.push({
      id,
      pitchClass: first.pitchClass,
      octave,
      instrument: first.instrument,
      position: placeAnchorPosition(first.pitchClass, first.instrument, octave, lowestOctave, terrain, ringOffset),
      baseOctave: octave,
      visits: list.length
    });
    minGapById.set(id, Number.isFinite(minGap) ? minGap : 0);
  }

  return { anchors, minGapById };
}

function anchorIdFor(token: NoteToken, idSuffix = ""): string {
  return `pc_${pitchClassName(token.pitchClass).replace("#", "s")}_${token.instrument}_o${token.octave}${idSuffix}`;
}

function altitudeForToken(_token: NoteToken, anchor: PitchClassAnchor): number {
  return anchor.position[1];
}

function clampCooldown(value: number): number {
  return Math.max(MIN_COOLDOWN, Math.min(MAX_COOLDOWN, value));
}

function buildAnchorSoundObject(anchor: PitchClassAnchor, minGap: number): SoundObject {
  const noteName = `${pitchClassName(anchor.pitchClass)}${anchor.octave}`;
  const audio: AudioGenerator = {
    generator: "note",
    instrument: anchor.instrument,
    baseNote: noteName,
    duration: 0.5,
    velocity: 0.8
  };
  // pitchSemitones is no longer derived from altitude — each (pitch class, octave)
  // pair is its own anchor with the exact baseNote, so altitude doesn't shift pitch.
  const mappings: Mapping[] = [
    { input: "field.intensity", output: "volume", curve: { type: "smoothstep" }, range: [0, 1] },
    { input: "encounter.approachSpeed", output: "brightness", curve: { type: "exponential", k: 1.4 }, range: [0.3, 1] }
  ];
  const field: SoundField = {
    shape: "ellipsoid",
    params: { radius: [ANCHOR_FIELD_RADIUS, ANCHOR_FIELD_ALTITUDE, ANCHOR_FIELD_RADIUS] },
    falloff: { distance: { type: "smoothstep" }, altitude: { type: "linear" } }
  };

  // Cooldown must be SHORTER than the shortest gap between visits to this anchor,
  // otherwise back-to-back same-pitch notes get dropped. Derived from minGap so the
  // rule is purely structural — independent of any specific demo MIDI.
  const cooldown = clampCooldown(minGap > 0 ? minGap * COOLDOWN_GAP_FACTOR : MIN_COOLDOWN);

  return {
    id: anchor.id,
    kind: `pitch_${pitchClassName(anchor.pitchClass)}`,
    transform: { position: anchor.position, rotation: [0, (anchor.pitchClass * 30) % 360, 0], scale: [1, 1, 1] },
    field,
    trigger: { mode: "peak", threshold: 0.42, cooldown, retrigger: true },
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
  if (event.kind === "phrase") {
    const step = event.notes.length > 1 ? event.duration / event.notes.length : event.duration;
    return {
      generator: "phrase",
      instrument: event.instrument,
      notes: event.notes.map((note, index) => ({
        dt: index * step,
        note,
        duration: Math.max(0.08, step * 0.85),
        velocity: event.velocity
      }))
    };
  }
  return {
    generator: "percussion",
    instrument: event.instrument,
    pattern: [{ dt: 0, velocity: event.velocity }]
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
      params: { radius: 3 },
      falloff: { distance: { type: "smoothstep" } }
    };
  }
  if (event.kind === "phrase") {
    return {
      shape: "ellipsoid",
      params: { radius: [Math.max(5, event.duration * 0.8), 5, Math.max(5, event.duration * 0.8)] },
      falloff: { distance: { type: "smoothstep" } }
    };
  }
  return {
    shape: "sphere",
    params: { radius: 3.0 },
    falloff: { distance: { type: "smoothstep" } }
  };
}

function aggregateFieldRadiusY(event: MusicEvent): number {
  if (event.kind === "drone") return 5;
  if (event.kind === "chord") return 3;
  if (event.kind === "phrase") return 5;
  return 3.0;
}

function triggerForAggregate(event: MusicEvent) {
  // Percussion cooldown is short (events are tiny). For sustained events
  // (chord, drone, phrase) the cooldown must cover the full natural duration
  // so the path stationing inside the field doesn't trigger many re-fires.
  if (event.kind === "percussion") {
    return { mode: "peak" as const, threshold: 0.5, cooldown: clampCooldown(event.duration * COOLDOWN_DURATION_FACTOR), retrigger: true };
  }
  const sustainCooldown = Math.max(MIN_COOLDOWN, event.duration);
  if (event.kind === "drone") return { mode: "continuous" as const, threshold: 0.3, cooldown: sustainCooldown, retrigger: true };
  if (event.kind === "phrase") return { mode: "peak" as const, threshold: 0.56, cooldown: sustainCooldown, retrigger: true };
  // Chord aggregates use a higher trigger threshold than anchors so a
  // passing brush doesn't fire — only a direct centre-visit can trigger.
  return { mode: "peak" as const, threshold: 0.56, cooldown: sustainCooldown, retrigger: true };
}

function colorForAggregate(event: MusicEvent): string {
  if (event.kind === "drone") return "#7e6bff";
  if (event.kind === "percussion") return "#ff9d8d";
  if (event.kind === "phrase") return "#9be9ff";
  return "#a4b0ff";
}

function buildEntryWaypoint(firstToken: NoteToken | null, anchors: Map<string, PitchClassAnchor>, terrain: IslandScene["terrain"], idSuffix = ""): Waypoint {
  if (!firstToken) {
    return { t: 0, p: [0, 14, -30], source: "entry" };
  }
  const anchor = anchors.get(anchorIdFor(firstToken, idSuffix));
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

function buildExitWaypoint(lastToken: NoteToken | null, anchors: Map<string, PitchClassAnchor>, terrain: IslandScene["terrain"], duration: number, idSuffix = ""): Waypoint {
  if (!lastToken) {
    return { t: duration, p: [0, 14, 30], source: "exit" };
  }
  const anchor = anchors.get(anchorIdFor(lastToken, idSuffix));
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

function waypointForToken(token: NoteToken, anchors: Map<string, PitchClassAnchor>, idSuffix = ""): Waypoint | null {
  const anchor = anchors.get(anchorIdFor(token, idSuffix));
  if (!anchor) return null;
  return {
    t: token.time,
    p: [anchor.position[0], altitudeForToken(token, anchor), anchor.position[2]],
    source: "anchor",
    refId: token.id,
    anchorId: anchor.id
  };
}

/**
 * Insert "release" waypoints between consecutive visits to the same anchor so
 * the path physically leaves the field and re-enters. Without this, two
 * back-to-back same-pitch notes don't re-trigger because intensity stays high.
 */
function insertReleaseWaypoints(waypoints: Waypoint[], anchorMap: Map<string, PitchClassAnchor>): Waypoint[] {
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  const result: Waypoint[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const wp = sorted[i];
    result.push(wp);
    if (wp.source !== "anchor" || !wp.anchorId) continue;
    // Find the next anchor waypoint
    let nextIdx = -1;
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].source === "anchor") {
        nextIdx = j;
        break;
      }
    }
    if (nextIdx < 0) continue;
    const next = sorted[nextIdx];
    if (next.anchorId !== wp.anchorId) continue;
    const anchor = anchorMap.get(wp.anchorId);
    if (!anchor) continue;
    const gap = next.t - wp.t;
    if (gap < 0.001) continue;
    const tRelease = (wp.t + next.t) / 2;
    const radial = Math.hypot(anchor.position[0], anchor.position[2]);
    const ux = radial > 0.0001 ? anchor.position[0] / radial : 1;
    const uz = radial > 0.0001 ? anchor.position[2] / radial : 0;
    const dist = ANCHOR_FIELD_RADIUS + 1.2;
    const rx = anchor.position[0] + ux * dist;
    const rz = anchor.position[2] + uz * dist;
    const ry = anchor.position[1] + ANCHOR_FIELD_ALTITUDE + 1.5;
    result.push({ t: tRelease, p: [rx, ry, rz], source: "release", anchorId: anchor.id });
  }

  return result;
}

/**
 * Insert release waypoints between aggregate visits placed close in time, so the
 * path leaves each aggregate's field cleanly before entering the next one's.
 * Prevents intensity bleed-over from causing premature triggers.
 */
function insertAggregateReleases(waypoints: Waypoint[], aggregateObjects: SoundObject[]): Waypoint[] {
  if (aggregateObjects.length === 0) return waypoints;
  const fieldById = new Map(aggregateObjects.map((object) => [object.id, object.field]));
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  const result: Waypoint[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const wp = sorted[i];
    result.push(wp);
    if (wp.source !== "aggregate" || !wp.refId) continue;
    let nextIdx = -1;
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (sorted[j].source === "aggregate") {
        nextIdx = j;
        break;
      }
    }
    if (nextIdx < 0) continue;
    const next = sorted[nextIdx];
    const gap = next.t - wp.t;
    if (gap < 0.001 || gap > 3.0) continue;
    // Place release between the two aggregate positions, lifted up and pushed
    // outward from the origin to leave both fields cleanly.
    const tRelease = (wp.t + next.t) / 2;
    const midX = (wp.p[0] + next.p[0]) / 2;
    const midZ = (wp.p[2] + next.p[2]) / 2;
    const radial = Math.hypot(midX, midZ);
    const ux = radial > 0.0001 ? midX / radial : 1;
    const uz = radial > 0.0001 ? midZ / radial : 0;
    const field = fieldById.get(wp.refId.startsWith("aggregate_") ? wp.refId : `aggregate_${wp.refId}`);
    const fallbackRadius = field ? fieldRadiusXZ(field) + 2 : 6;
    const releaseX = midX + ux * fallbackRadius;
    const releaseZ = midZ + uz * fallbackRadius;
    const releaseY = Math.max(wp.p[1], next.p[1]) + 3.5;
    result.push({ t: tRelease, p: [releaseX, releaseY, releaseZ], source: "release", refId: `release_agg_${wp.refId}` });
  }

  return result;
}

const SOURCE_PRIORITY: Record<string, number> = {
  anchor: 10,
  aggregate: 8,
  release: 5,
  entry: 2,
  exit: 2
};

function waypointsToPath(waypoints: Waypoint[], scoreId: string, scoreName: string, duration: number, audibleSuffix = ""): Path3D {
  const sorted = [...waypoints].sort((a, b) => a.t - b.t);
  const dedup: Waypoint[] = [];
  for (const wp of sorted) {
    const previous = dedup[dedup.length - 1];
    if (previous && Math.abs(previous.t - wp.t) < 0.001) {
      // Same time — keep the higher-priority waypoint. The path can't be at
      // two distinct positions at one instant; without this, Catmull-Rom
      // interpolation goes haywire and a real anchor visit may be skipped.
      const prevPriority = SOURCE_PRIORITY[previous.source] ?? 0;
      const wpPriority = SOURCE_PRIORITY[wp.source] ?? 0;
      if (wpPriority > prevPriority) dedup[dedup.length - 1] = wp;
      continue;
    }
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
    interpolation: "catmull-rom",
    audibleSuffix
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

function fieldRadiusXZ(field: SoundField): number {
  if (field.shape === "sphere") return field.params.radius;
  if (field.shape === "ellipsoid") return Math.max(field.params.radius[0], field.params.radius[2]);
  if (field.shape === "cone") return field.params.range;
  return field.params.centerRadius;
}

function distance2D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

type PlacedAggregate = { position: Vec3; field: SoundField };
type PlacedAnchor = { position: Vec3; radius: number };

function aggregatePositionAlongPath(
  event: MusicEvent,
  basePath: Path3D,
  terrain: IslandScene["terrain"],
  hasTokens: boolean,
  aggregateIndex: number,
  aggregateCount: number,
  placed: PlacedAggregate[],
  anchors: PlacedAnchor[]
): Vec3 {
  const fieldRy = aggregateFieldRadiusY(event);
  const ownField = fieldForAggregate(event);
  const ownRadius = fieldRadiusXZ(ownField);

  // Build base anchor (sampled along path, or ring fallback)
  let baseX: number;
  let baseZ: number;
  let tangent: Vec3 = [1, 0, 0];
  if (!hasTokens || basePath.points.length < 3) {
    const angle = aggregateCount > 0 ? (aggregateIndex / aggregateCount) * Math.PI * 1.6 - Math.PI * 0.8 : 0;
    const radius = 22 + (aggregateIndex % 3) * 4;
    baseX = Math.cos(angle) * radius;
    baseZ = Math.sin(angle) * radius;
    tangent = [-Math.sin(angle), 0, Math.cos(angle)];
  } else {
    const sample = samplePathAtTime(basePath, event.time);
    const next = samplePathAtTime(basePath, Math.min(basePath.duration, event.time + 0.4));
    const previous = samplePathAtTime(basePath, Math.max(0, event.time - 0.4));
    baseX = sample[0];
    baseZ = sample[2];
    tangent = [next[0] - previous[0], 0, next[2] - previous[2]];
  }
  const tangentLen = Math.hypot(tangent[0], tangent[2]) || 1;
  const tx = tangent[0] / tangentLen;
  const tz = tangent[2] / tangentLen;

  // Try the angle rotation sequence at increasing distances. Separation between
  // field boundaries prevents the path entering one aggregate from grazing a
  // neighbour's and firing extras.
  const AGG_SEPARATION = 1.5;
  const distanceMultipliers = [1.0, 1.25, 1.5];
  let bestPos: Vec3 | null = null;
  let bestClearance = -Infinity;
  for (const distMult of distanceMultipliers) {
    for (let i = 0; i < AGGREGATE_ANGLE_SEQUENCE.length; i += 1) {
      const angle = AGGREGATE_ANGLE_SEQUENCE[(aggregateIndex + i) % AGGREGATE_ANGLE_SEQUENCE.length];
      const dx = tx * Math.cos(angle) + (-tz) * Math.sin(angle);
      const dz = tz * Math.cos(angle) + tx * Math.sin(angle);
      const x = baseX + dx * AGGREGATE_OFFSET * distMult;
      const z = baseZ + dz * AGGREGATE_OFFSET * distMult;
      // Keep position inside the playable island (terrain radius - safety margin).
      const distFromCenter = Math.hypot(x, z);
      if (distFromCenter > terrain.radius * 0.85) continue;
      const ground = terrainGroundY(x, z, terrain);
      const pos: Vec3 = [x, ground + fieldRy, z];

      let clearance = Infinity;
      let collides = false;
      for (const p of placed) {
        const dist = distance2D(pos, p.position);
        const minDist = ownRadius + fieldRadiusXZ(p.field) + AGG_SEPARATION;
        clearance = Math.min(clearance, dist - (ownRadius + fieldRadiusXZ(p.field)));
        if (dist < minDist) collides = true;
      }
      for (const a of anchors) {
        const dist = distance2D(pos, a.position);
        // Margin includes ANCHOR_FIELD_RADIUS so the Catmull-Rom curve
        // joining the aggregate to neighbouring waypoints can't overshoot
        // through the anchor field and trigger an unintended note.
        const minDist = ownRadius + a.radius + ANCHOR_FIELD_RADIUS + 2;
        clearance = Math.min(clearance, dist - (ownRadius + a.radius));
        if (dist < minDist) collides = true;
      }
      if (!collides) return pos;
      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestPos = pos;
      }
    }
  }
  return bestPos!;
}

function buildAggregateSoundObject(event: MusicEvent, position: Vec3, index: number, idSuffix = ""): SoundObject {
  const visualModel = AGGREGATE_VISUAL_BY_KIND[event.kind] ?? "crystal";
  return {
    id: `aggregate_${event.id}_${index}${idSuffix}`,
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

export function spatialFold(score: MusicScore, terrain: IslandScene["terrain"], options: SpatialFoldOptions = {}): { path: Path3D; objects: SoundObject[]; plan: FoldingPlan } {
  const overrides = options.positionOverrides ?? new Map<string, Vec3>();
  const ringOffset = options.ringRadiusOffset ?? 0;
  const idSuffix = options.anchorIdSuffix ?? "";
  const { tokens, aggregates } = tokenizeScore(score, terrain);
  const { anchors: rawAnchors, minGapById } = buildPitchClassAnchors(tokens, terrain, ringOffset, idSuffix);
  const anchors = rawAnchors.map((anchor) => {
    const override = overrides.get(anchor.id);
    return override ? { ...anchor, position: override } : anchor;
  });
  const anchorMap = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const motifs = detectMotifs(tokens);
  const coveredIds = tokensCoveredByMotifs(motifs);

  const anchorObjects = anchors.map((anchor) => buildAnchorSoundObject(anchor, minGapById.get(anchor.id) ?? 0));
  const objectsCollected: SoundObject[] = [...anchorObjects];

  const firstToken = tokens[0] ?? null;
  const lastToken = tokens[tokens.length - 1] ?? null;
  const entry = buildEntryWaypoint(firstToken, anchorMap, terrain, idSuffix);
  const exit = buildExitWaypoint(lastToken, anchorMap, terrain, score.duration, idSuffix);

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
        const wp = waypointForToken(token, anchorMap, idSuffix);
        if (!wp) continue;
        waypoints.push(wp);
        addedIds.push(anchorIdFor(token, idSuffix));
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
      const wp = waypointForToken(token, anchorMap, idSuffix);
      if (!wp) continue;
      waypoints.push(wp);
      addedIds.push(anchorIdFor(token, idSuffix));
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

  // Insert release waypoints between same-anchor visits so the path leaves
  // the field briefly and re-triggers on the next visit.
  const withReleases = insertReleaseWaypoints(waypoints, anchorMap);
  waypoints.length = 0;
  waypoints.push(...withReleases);

  const aggregateObjects: SoundObject[] = [];
  if (aggregates.length > 0) {
    const skeletonPath = waypointsToPath(waypoints, score.id, score.name, score.duration);
    const hasTokens = tokens.length > 0;
    const placed: PlacedAggregate[] = [];
    const placedAnchors: PlacedAnchor[] = anchorObjects.map((a) => ({
      position: a.transform.position,
      radius: fieldRadiusXZ(a.field)
    }));
    aggregates.forEach((event, index) => {
      const naturalPos = aggregatePositionAlongPath(event, skeletonPath, terrain, hasTokens, index, aggregates.length, placed, placedAnchors);
      const objectId = `aggregate_${event.id}_${index}${idSuffix}`;
      const position = overrides.get(objectId) ?? naturalPos;
      const object = buildAggregateSoundObject(event, position, index, idSuffix);
      placed.push({ position, field: object.field });
      aggregateObjects.push(object);
      objectsCollected.push(object);
      // Path waypoint is at the field centre so the player traverses straight through the audio zone.
      waypoints.push({ t: event.time, p: [position[0], position[1], position[2]], source: "aggregate", refId: event.id });
    });
    steps.push({
      index: steps.length,
      kind: "weave_aggregate",
      description: `${aggregates.length} agrégats placés (accords, drones, percussions) — le path les effleure au bon temps.`,
      pathSnapshot: snapshotPath(waypoints),
      objectsAfter: snapshotObjects(objectsCollected),
      highlightObjectIds: aggregateObjects.map((object) => object.id)
    });

    // Force the path to leave each aggregate cleanly before the next.
    const withAggReleases = insertAggregateReleases(waypoints, aggregateObjects);
    waypoints.length = 0;
    waypoints.push(...withAggReleases);
  }

  let path = waypointsToPath(waypoints, score.id, score.name, score.duration, idSuffix);
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
