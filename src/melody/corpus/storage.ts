import { BUILTIN_MELODY_CORPUS, type CorpusMelodyRecord } from "./builtin";

const USER_CORPUS_KEY = "museeka.melody.userCorpus.v1";

export function listUserCorpus(): CorpusMelodyRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(USER_CORPUS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as CorpusMelodyRecord[] : [];
  } catch {
    return [];
  }
}

export function saveUserCorpusRecord(record: CorpusMelodyRecord): void {
  if (typeof window === "undefined") return;
  const rest = listUserCorpus().filter((item) => item.entry.id !== record.entry.id);
  window.localStorage?.setItem(USER_CORPUS_KEY, JSON.stringify([...rest, record]));
}

export function deleteUserCorpusRecord(id: string): void {
  if (typeof window === "undefined") return;
  const rest = listUserCorpus().filter((item) => item.entry.id !== id);
  window.localStorage?.setItem(USER_CORPUS_KEY, JSON.stringify(rest));
}

export function listAllCorpusRecords(): CorpusMelodyRecord[] {
  return [...BUILTIN_MELODY_CORPUS, ...listUserCorpus()];
}
