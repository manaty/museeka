export type Vec3 = [number, number, number];

export type Curve =
  | { type: "linear" }
  | { type: "smoothstep" }
  | { type: "smootherstep" }
  | { type: "exponential"; k: number }
  | { type: "gaussian"; center: number; sigma: number }
  | { type: "threshold"; threshold: number }
  | { type: "plateau"; inner: number; outer: number };

export type FieldShape = "sphere" | "ellipsoid" | "cone" | "ring";

export type SoundField =
  | {
      shape: "sphere";
      params: { radius: number };
      falloff?: FieldFalloff;
    }
  | {
      shape: "ellipsoid";
      params: { radius: Vec3 };
      falloff?: FieldFalloff;
    }
  | {
      shape: "cone";
      params: { range: number; angleDegrees: number; direction: Vec3 };
      falloff?: FieldFalloff;
    }
  | {
      shape: "ring";
      params: { centerRadius: number; thickness: number; heightRange: [number, number] };
      falloff?: FieldFalloff;
    };

export type FieldFalloff = {
  distance?: Curve;
  angle?: Curve;
  altitude?: Curve;
};

export type FieldOutput = {
  inside: boolean;
  intensity: number;
  distanceFactor: number;
  angleFactor: number;
  altitudeFactor: number;
  radialFactor?: number;
  localPosition: Vec3;
};

export type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type TriggerMode = "enter" | "peak" | "continuous";

export type Trigger = {
  mode: TriggerMode;
  threshold: number;
  cooldown: number;
  retrigger?: boolean;
};

export type InstrumentId =
  | "glass_bell"
  | "warm_pad"
  | "flute"
  | "woodblock"
  | "low_pad"
  | "pluck"
  | "crystal"
  | "piano"
  | "violin"
  | "cello";

export type AudioGenerator =
  | {
      generator: "note";
      instrument: InstrumentId;
      baseNote: string;
      duration: number;
      velocity: number;
    }
  | {
      generator: "chord";
      instrument: InstrumentId;
      notes: string[];
      duration: number;
      velocity: number;
    }
  | {
      generator: "phrase";
      instrument: InstrumentId;
      notes: Array<{ dt: number; note: string; duration: number; velocity?: number }>;
    }
  | {
      generator: "drone";
      instrument: InstrumentId;
      notes: string[];
      continuous: true;
      velocity?: number;
    }
  | {
      generator: "percussion";
      instrument: InstrumentId;
      pattern: Array<{ dt: number; velocity: number }>;
    };

export type MappingInput =
  | "field.intensity"
  | "field.distanceFactor"
  | "field.angleFactor"
  | "field.altitudeFactor"
  | "encounter.distance"
  | "encounter.approachSpeed"
  | "encounter.altitudeRelative"
  | "encounter.tangentialSpeed";

export type MappingOutput =
  | "volume"
  | "pitchSemitones"
  | "filterCutoff"
  | "attack"
  | "release"
  | "brightness"
  | "pan"
  | "reverbSend";

export type Mapping = {
  input: MappingInput;
  output: MappingOutput;
  curve: Curve;
  range: [number, number];
  clampInput?: [number, number];
};

export type SoundObjectVisual = {
  model: "flower" | "tree" | "rock" | "statue" | "arch" | "bird" | "crab" | "crystal" | "temple" | "waterfall";
  color: string;
  activeGlow?: boolean;
};

export type SoundObject = {
  id: string;
  kind: string;
  transform: Transform;
  field: SoundField;
  trigger: Trigger;
  audio: AudioGenerator;
  mappings: Mapping[];
  visual: SoundObjectVisual;
  pitchClass?: number;
};

export type PathPoint = {
  t: number;
  p: Vec3;
  speed?: number;
};

export type Path3D = {
  id: string;
  name: string;
  duration: number;
  mode: "flying";
  speedScale: number;
  constraints: {
    maxSpeed: number;
    maxAcceleration: number;
    maxCurvature: number;
    minGroundClearance: number;
    maxGroundClearance: number;
  };
  points: PathPoint[];
  interpolation: "catmull-rom";
};

export type IslandScene = {
  version: "0.1";
  meta: {
    name: string;
    author: string;
    description: string;
    generatedAt?: string;
  };
  terrain: {
    type: "simple_island";
    radius: number;
    heightScale: number;
    seed: number;
  };
  paths: Path3D[];
  soundObjects: SoundObject[];
  visualObjects: Array<{ id: string; kind: string; transform: Transform; visual: SoundObjectVisual }>;
  settings: {
    defaultPathId: string;
    audio: {
      masterVolume: number;
      maxActiveVoices: number;
    };
  };
};

export type PlayerState = {
  time: number;
  pathId: string;
  position: Vec3;
  previousPosition: Vec3;
  velocity: Vec3;
  speed: number;
};

export type Encounter = {
  objectId: string;
  playerPosition: Vec3;
  playerVelocity: Vec3;
  objectPosition: Vec3;
  relativePosition: Vec3;
  localPosition: Vec3;
  distance: number;
  approachSpeed: number;
  tangentialSpeed: number;
  altitudeRelative: number;
  approachDirection: Vec3;
  field: FieldOutput;
};

export type MusicEventKind = "note" | "chord" | "phrase" | "drone" | "percussion";

export type MusicEvent = {
  id: string;
  time: number;
  duration: number;
  kind: MusicEventKind;
  notes: string[];
  velocity: number;
  channel: number;
  instrument: InstrumentId;
};

export type MusicNote = {
  id: string;
  time: number;
  duration: number;
  note: string;
  midi: number;
  ticks?: number;
  durationTicks?: number;
  velocity: number;
  channel: number;
  trackIndex: number;
  trackName: string;
};

export type MusicTrack = {
  id: string;
  name: string;
  channel: number;
  notes: MusicNote[];
};

export type MusicScore = {
  id: string;
  name: string;
  duration: number;
  tempo: number;
  ppq?: number;
  events: MusicEvent[];
  tracks?: MusicTrack[];
};

export type SpatialScoreEvent = MusicEvent & {
  role: "melody" | "harmony" | "rhythm" | "drone" | "ornament";
  spatialIntent: "direct_pass" | "frontal_approach" | "orbit" | "vertical_pass";
  suggestedObjectKinds: string[];
};

export type SpatialScore = {
  id: string;
  name: string;
  events: SpatialScoreEvent[];
};

export type EventCluster = {
  id: string;
  events: SpatialScoreEvent[];
  candidateObjectKinds: string[];
  reuseScore: number;
  anchor: Vec3;
};

export type GenerationReport = {
  scoreId: string;
  pathId: string;
  clusters: Array<{
    clusterId: string;
    objectId: string;
    eventIds: string[];
    anchor: Vec3;
    reuseScore: number;
  }>;
};

export type NoteRole = "melody" | "ornament" | "chord" | "drone" | "percussion";

export type NoteToken = {
  id: string;
  time: number;
  duration: number;
  midi: number;
  pitchClass: number;
  octave: number;
  velocity: number;
  instrument: InstrumentId;
  role: NoteRole;
  sourceEventId: string;
};

export type MotifSignature = {
  intervals: number[];
  durationRatios: number[];
  instrument: InstrumentId;
};

export type MotifInstance = {
  motifId: string;
  startTokenIndex: number;
  tokens: NoteToken[];
  startTime: number;
  transposition: number;
};

export type Motif = {
  id: string;
  signature: MotifSignature;
  occurrences: MotifInstance[];
  reuseScore: number;
};

export type PitchClassAnchor = {
  id: string;
  pitchClass: number;
  octave: number;
  instrument: InstrumentId;
  position: Vec3;
  baseOctave: number;
  visits: number;
};

export type FoldingStepKind =
  | "init_anchors"
  | "weave_motif"
  | "weave_residual_note"
  | "weave_aggregate"
  | "check_speed"
  | "smooth";

export type FoldingStep = {
  index: number;
  kind: FoldingStepKind;
  description: string;
  pathSnapshot: PathPoint[];
  objectsAfter: SoundObject[];
  highlightObjectIds?: string[];
  motifId?: string;
};

export type ProducedNoteRecord = {
  time: number;
  midi: number;
  noteName: string;
  velocity: number;
  duration: number;
  instrument: InstrumentId;
  sourceObjectId: string;
  kind: "note" | "chord" | "phrase" | "drone-on" | "drone-off" | "percussion";
  pitchSemitones: number;
};

export type ExpectedNoteRecord = {
  id: string;
  time: number;
  midi: number;
  instrument: InstrumentId;
  kind: "note" | "phrase" | "chord" | "drone" | "percussion";
  sourceEventId: string;
};

export type NoteMatchRecord = {
  expected: ExpectedNoteRecord;
  produced: ProducedNoteRecord;
  midiDelta: number;
  timeDelta: number;
  status: "matched" | "wrong-pitch" | "wrong-time" | "ok";
};

export type RenderAnalysis = {
  produced: ProducedNoteRecord[];
  expected: ExpectedNoteRecord[];
  matches: NoteMatchRecord[];
  missing: ExpectedNoteRecord[];
  extra: ProducedNoteRecord[];
  counts: {
    expected: number;
    produced: number;
    matched: number;
    wrongPitch: number;
    missing: number;
    extra: number;
  };
  accuracy: number;
};

export type FoldingPlan = {
  scoreId: string;
  pathId: string;
  anchors: PitchClassAnchor[];
  motifs: Motif[];
  aggregates: SoundObject[];
  steps: FoldingStep[];
  reuseRate: number;
  analysis?: RenderAnalysis;
};
