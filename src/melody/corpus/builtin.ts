import { melodyHash } from "../analysis/snapshot";
import type { Melody } from "../types";
import type { MelodyCorpusEntry } from "../research/types";

const PPQ = 480;

export type CorpusMelodyRecord = {
  entry: MelodyCorpusEntry;
  melody: Melody;
};

function makeMelody(
  id: string,
  name: string,
  tempo: number,
  steps: Array<[midi: number, beats: number]>
): Melody {
  let tick = 0;
  const notes = steps.map(([midi, beats], index) => {
    const durationTicks = Math.round(beats * PPQ);
    const note = {
      id: `${id}_${index}`,
      midi,
      tick,
      durationTicks,
      velocity: 0.76
    };
    tick += durationTicks;
    return note;
  });
  return { id, name, ppq: PPQ, tempo, notes };
}

function record(
  melody: Melody,
  meta: Omit<MelodyCorpusEntry, "melodyId" | "melodyHash" | "sourceKind" | "extraction">
): CorpusMelodyRecord {
  return {
    melody,
    entry: {
      ...meta,
      sourceKind: "builtin",
      melodyId: melody.id,
      melodyHash: melodyHash(melody),
      extraction: { method: "manual" }
    }
  };
}

const frereJacques = makeMelody("corpus_frere_jacques", "Frère Jacques", 108, [
  [60, 1], [62, 1], [64, 1], [60, 1],
  [60, 1], [62, 1], [64, 1], [60, 1],
  [64, 1], [65, 1], [67, 2],
  [64, 1], [65, 1], [67, 2]
]);

const odeToJoy = makeMelody("corpus_ode_to_joy", "Ode to Joy", 116, [
  [64, 1], [64, 1], [65, 1], [67, 1],
  [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1],
  [64, 1.5], [62, 0.5], [62, 2]
]);

const twinkle = makeMelody("corpus_twinkle", "Ah! vous dirai-je, maman", 100, [
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2]
]);

const auClair = makeMelody("corpus_au_clair", "Au clair de la lune", 92, [
  [60, 1], [60, 1], [60, 1], [62, 1], [64, 2], [62, 2],
  [60, 1], [64, 1], [62, 1], [62, 1], [60, 4],
  [60, 1], [60, 1], [60, 1], [62, 1], [64, 2], [62, 2]
]);

const furElise = makeMelody("corpus_fur_elise", "Für Elise", 112, [
  [76, 0.5], [75, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [71, 0.5], [74, 0.5], [72, 0.5],
  [69, 1.5], [60, 0.5], [64, 0.5], [69, 0.5], [71, 1.5], [64, 0.5], [68, 0.5], [71, 0.5],
  [72, 1.5], [64, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [71, 0.5]
]);

export const BUILTIN_MELODY_CORPUS: CorpusMelodyRecord[] = [
  record(frereJacques, {
    id: "frere_jacques",
    title: "Frère Jacques",
    composer: "Traditional",
    era: "Traditional",
    genres: ["traditional", "children"],
    license: "Public domain"
  }),
  record(odeToJoy, {
    id: "ode_to_joy",
    title: "Ode to Joy",
    composer: "Ludwig van Beethoven",
    year: 1824,
    era: "19th century",
    genres: ["classical"],
    license: "Public domain"
  }),
  record(twinkle, {
    id: "ah_vous_dirai_je_maman",
    title: "Ah! vous dirai-je, maman",
    composer: "Traditional",
    era: "18th century",
    genres: ["traditional", "children"],
    license: "Public domain"
  }),
  record(auClair, {
    id: "au_clair_de_la_lune",
    title: "Au clair de la lune",
    composer: "Traditional",
    era: "18th century",
    genres: ["traditional", "children"],
    license: "Public domain"
  }),
  record(furElise, {
    id: "fur_elise",
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    year: 1810,
    era: "19th century",
    genres: ["classical", "romantic"],
    license: "Public domain"
  })
];

export function findBuiltinCorpusRecord(id: string): CorpusMelodyRecord | undefined {
  return BUILTIN_MELODY_CORPUS.find((record) => record.entry.id === id);
}
