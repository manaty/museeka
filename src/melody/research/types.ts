export type MelodyCorpusEntry = {
  id: string;
  title: string;
  composer?: string;
  artist?: string;
  year?: number;
  era?: string;
  genres: string[];
  sourceKind: "builtin" | "imported" | "manual" | "external-reference";
  sourceUri?: string;
  license?: string;
  sourceHash?: string;
  melodyId: string;
  melodyHash: string;
  extraction?: {
    method: "curated-track" | "manual" | "algorithm";
    trackIndex?: number;
    extractorVersion?: string;
  };
};

export type AnalyzerIdentity = {
  id: string;
  version: string;
  featureSchemaVersion: string;
  commit?: string;
};

export type AnalysisSnapshot = {
  melodyId: string;
  melodyHash: string;
  analyzer: AnalyzerIdentity;
  createdAt: string;
  features: Record<string, number>;
  vector: number[];
  structural: {
    contour?: string;
    intervals?: number[];
    recurringMotifs?: Array<{
      length: number;
      occurrences: number;
      reuseScore: number;
    }>;
  };
};

export type MelodyAnnotation = {
  melodyId: string;
  analysisVersion?: string;
  listenerId: string;
  createdAt: string;
  preference?: number;
  replayDesire?: number;
  emotion?: {
    valence?: number;
    arousal?: number;
    tension?: number;
    labels?: Record<string, number>;
  };
  perception?: {
    familiarity?: number;
    memorability?: number;
    hummability?: number;
    surprise?: number;
  };
};

export type PairwiseJudgment = {
  listenerId: string;
  leftMelodyId: string;
  rightMelodyId: string;
  changedVariables: string[];
  preference: "left" | "right" | "equal";
  confidence?: number;
  createdAt: string;
};
