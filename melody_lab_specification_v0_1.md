# Museeka Melody Lab — research specification v0.1

## Research question

What structural properties make a melody recognizably itself, memorable, emotionally expressive, and pleasurable to a particular listener?

The Melody Lab is both a composition tool and an experimental environment. It must keep musical source data, algorithmic analysis, human judgments, and learned models separate so that hypotheses remain testable as the algorithms evolve.

## Core pipeline

```text
source MIDI / hand-entered phrase
        ↓
melody extraction / curation
        ↓
canonical Melody (immutable note attacks in ticks)
        ↓
Analyzer vN
        ↓
versioned compact AnalysisSnapshot
        ↓
listener annotations + pairwise judgments
        ↓
interpretable preference/emotion models
        ↓
(optional later) learned melody embeddings / deep models
        ↓
analysis, recommendation, controlled generation
```

## 1. Melody corpus

Museeka should maintain a corpus ranging from public-domain classical material to modern popular melodies when their source and redistribution rights permit it.

A corpus item is not merely a file name. It records provenance and the exact canonical melody being analyzed.

```ts
type MelodyCorpusEntry = {
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
```

For a multi-track MIDI, extracting the foreground melody is a separate operation from analyzing it. Extraction must therefore be independently versioned.

The canonical `Melody` preserves every attack individually. A repeated `A A` must never be silently collapsed to one sustained `A`, because rearticulation itself may be perceptually important.

## 2. Versioned analysis snapshots

The analyzer will evolve. We must never overwrite an old analysis result when a new algorithm is introduced.

Every `(melody, analyzer version)` pair can have a compact immutable snapshot:

```ts
type AnalysisSnapshot = {
  melodyId: string;
  melodyHash: string;
  analyzer: {
    id: string;
    version: string;
    featureSchemaVersion: string;
    commit?: string;
  };
  createdAt: string;
  features: Record<string, number>;
  vector: number[];
  structural: {
    contour?: string;
    intervals?: number[];
    recurringMotifs?: unknown[];
  };
};
```

The fixed-order `vector` is intended for statistical/ML models. Named `features` remain available for interpretation and debugging.

Candidate features include:

- attacks per beat
- pitch changes per beat
- pitch-change ratio
- repeated-attack share
- repeated-pitch run length distribution
- interval histogram and interval entropy
- pitch range
- contour changes and contour run lengths
- rhythmic density and syncopation descriptors
- duration entropy
- recurring motif count, length, reuse and near-recurrence
- phrase-boundary strength
- exact repetition vs altered repetition
- ending divergence / surprise
- tonal stability and scale-degree statistics
- harmonic reinterpretation of sustained/repeated pitches when harmony is available
- compression-oriented measures: how compactly the phrase can be described by repeated structures

No single scalar "melody quality" score should be introduced at this stage.

## 3. Human annotation

Preference and perceived emotion are different targets and must be recorded separately.

```ts
type MelodyAnnotation = {
  melodyId: string;
  analysisVersion?: string;
  listenerId: string;
  createdAt: string;

  preference?: number;      // -1 disliked … +1 loved
  replayDesire?: number;    // 0 … 1

  emotion?: {
    valence?: number;       // -1 sad/dark … +1 joyful/bright
    arousal?: number;       // 0 calm … 1 activated
    tension?: number;       // 0 … 1
    labels?: Record<string, number>; // sadness, joy, nostalgia, unease, tenderness, etc.
  };

  perception?: {
    familiarity?: number;   // 0 … 1
    memorability?: number;  // 0 … 1
    hummability?: number;   // 0 … 1
    surprise?: number;      // 0 … 1
  };
};
```

Familiarity is especially important: liking a famous melody after hundreds of prior exposures is not the same signal as liking an unfamiliar generated phrase.

## 4. Pairwise experiments

Absolute ratings are useful, but controlled A/B comparisons are often more informative.

Examples:

- repeated attacks vs sustained notes
- exact motif recurrence vs continuous mutation
- same pitch contour with faster/slower pitch-change rate
- identical motif with one altered ending
- same melody under different harmony
- regular meter vs one controlled metric displacement

```ts
type PairwiseJudgment = {
  listenerId: string;
  leftMelodyId: string;
  rightMelodyId: string;
  changedVariables: string[];
  preference: "left" | "right" | "equal";
  confidence?: number;
  createdAt: string;
};
```

Pairwise tests let the Lab estimate causal effects more cleanly because only one or a few variables change.

## 5. Learning strategy

### Phase A — interpretable models first

Do not start with deep learning. Early data will be small and the scientific goal is understanding, not merely prediction.

Initial models can include:

- regularized linear/logistic models over named analysis features
- pairwise preference models (Bradley-Terry / logistic ranking)
- shallow trees or boosted trees for nonlinear interactions
- clustering of melodies and listeners by feature profile
- separate regressors/classifiers for valence, arousal, tension, memorability and liking

These models can answer questions such as:

> For this listener, does lower pitch-change ratio predict preference after controlling for familiarity?

or:

> Does exact motif recurrence increase memorability but reduce surprise?

### Phase B — learned representations

Once the corpus and annotation set are large enough, add learned symbolic-music representations.

Possible direction:

```text
MIDI note sequence → sequence encoder / transformer → melody embedding
                                                 ↓
                                       listener embedding
                                                 ↓
                           liking / emotion / memorability heads
```

A two-tower or conditioning architecture can learn that two listeners prefer different regions of melody space.

Deep models should augment, not replace, the interpretable feature layer. Their predictions should always retain the analyzer version, model version and training-data manifest used to produce them.

## 6. Static GitHub Pages constraint

The public Studio can remain fully static.

In-browser responsibilities:

- edit/play melodies
- compute deterministic analysis features
- collect local ratings and A/B judgments
- run small personalized models
- export/import annotations as JSON
- load precomputed analysis snapshots and pretrained model artifacts

Offline/build-time responsibilities can later include:

- bulk corpus analysis
- model training
- dataset validation
- generating compact analysis manifests

A future shared multi-user dataset would require a backend, but it is not required for the first research loop.

## 7. First corpus

The existing Museeka built-in MIDIs already provide a seed set (Ode to Joy, Pachelbel, Frère Jacques, Bach Prelude in C, Greensleeves). The corpus layer should be generalized rather than creating a second unrelated library.

For research on melody, multi-track or strongly polyphonic works should either have a curated melody track or an explicit extraction snapshot. Whole-score statistics must not be silently treated as melody statistics.

## 8. Immediate v0.1 experiments

The first Melody Lab milestone should support:

1. canonical tick-based melody editing;
2. playback of individual attacks;
3. contour and repeated-pitch analysis;
4. recurring motif detection;
5. A/B rearticulation experiment (`A A` vs sustained `A`);
6. an annotation object model ready for later persistence;
7. versioned `AnalysisSnapshot` output.

This gives Museeka a reproducible experimental loop before introducing any learned model.
