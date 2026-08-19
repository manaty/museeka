import type { MelodyAnnotation, PairwiseJudgment } from "./types";
import { listUserCorpus } from "../corpus/storage";

const ANNOTATION_KEY = "museeka.melody.annotations.v1";
const PAIRWISE_KEY = "museeka.melody.pairwise.v1";
const LISTENER_KEY = "museeka.melody.listener.v1";

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, items: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage?.setItem(key, JSON.stringify(items));
}

export function getLocalListenerId(): string {
  if (typeof window === "undefined") return "local-listener";
  const existing = window.localStorage?.getItem(LISTENER_KEY);
  if (existing) return existing;
  const id = `listener_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage?.setItem(LISTENER_KEY, id);
  return id;
}

export function listAnnotations(): MelodyAnnotation[] {
  return readArray<MelodyAnnotation>(ANNOTATION_KEY);
}

export function findAnnotation(stimulusId: string, listenerId = getLocalListenerId()): MelodyAnnotation | undefined {
  return listAnnotations().find((item) => item.stimulusId === stimulusId && item.listenerId === listenerId);
}

export function saveAnnotation(annotation: MelodyAnnotation): void {
  const rest = listAnnotations().filter((item) => !(
    item.stimulusId === annotation.stimulusId && item.listenerId === annotation.listenerId
  ));
  writeArray(ANNOTATION_KEY, [...rest, annotation]);
}

export function listPairwiseJudgments(): PairwiseJudgment[] {
  return readArray<PairwiseJudgment>(PAIRWISE_KEY);
}

export function savePairwiseJudgment(judgment: PairwiseJudgment): void {
  writeArray(PAIRWISE_KEY, [...listPairwiseJudgments(), judgment]);
}

export function clearMelodyResearchData(): void {
  if (typeof window === "undefined") return;
  window.localStorage?.removeItem(ANNOTATION_KEY);
  window.localStorage?.removeItem(PAIRWISE_KEY);
}

export function exportMelodyResearchData(): void {
  if (typeof window === "undefined") return;
  const data = {
    schemaVersion: "2",
    exportedAt: new Date().toISOString(),
    listenerId: getLocalListenerId(),
    userCorpus: listUserCorpus(),
    annotations: listAnnotations(),
    pairwiseJudgments: listPairwiseJudgments()
  };
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `museeka-melody-research-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
