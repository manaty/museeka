import type { CorpusMelodyRecord } from "../corpus/builtin";
import { melodyHash } from "../analysis/snapshot";
import type { MelodyAnnotation, MelodyStimulus } from "../research/types";

const SUPABASE_URL = "https://wavmytuzsjnbjnkjtxqk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YXsrK2Chb61w0MFYaX9r9A_hUKR340e";
const SESSION_KEY = "museeka.supabase.session.v1";

export type CloudSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: { id: string; email?: string };
};

type CloudMelodyRow = {
  id: string;
  owner_id: string;
  title: string;
  composer: string | null;
  artist: string | null;
  year: number | null;
  era: string | null;
  genres: string[];
  source_kind: "builtin" | "imported" | "manual" | "external-reference";
  source_name: string | null;
  source_uri: string | null;
  source_midi_path: string | null;
  rights_status: string;
  license: string | null;
  source_hash: string | null;
  extraction_method: "curated-track" | "manual" | "algorithm" | null;
  track_index: number | null;
  extractor_id: string | null;
  extractor_version: string | null;
  melody_hash: string;
  ppq: number;
  tempo: number;
  notes: Array<{ id?: string; midi: number; tick: number; durationTicks: number; velocity: number }>;
};

type CloudAnnotationRow = {
  stimulus_id: string;
  melody_id: string;
  analysis_version: string | null;
  preference: number | null;
  replay_desire: number | null;
  valence: number | null;
  arousal: number | null;
  tension: number | null;
  familiarity: number | null;
  memorability: number | null;
  hummability: number | null;
  surprise: number | null;
  labels: Record<string, number>;
  stimulus: Record<string, unknown>;
  created_at: string;
};

function loadSession(): CloudSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as CloudSession : null;
  } catch {
    return null;
  }
}

function saveSession(session: CloudSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) window.localStorage.removeItem(SESSION_KEY);
  else window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function withExpiry(session: CloudSession): CloudSession {
  return {
    ...session,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in
  };
}

export function getCloudSession(): CloudSession | null {
  return loadSession();
}

async function authRequest(path: string, body: unknown): Promise<CloudSession> {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.msg ?? data?.message ?? data?.error_description ?? `Auth failed (${response.status})`);
  const session = withExpiry(data as CloudSession);
  saveSession(session);
  return session;
}

export async function signUpCloud(email: string, password: string): Promise<CloudSession | null> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.msg ?? data?.message ?? data?.error_description ?? `Signup failed (${response.status})`);
  if (!data?.access_token) return null;
  const session = withExpiry(data as CloudSession);
  saveSession(session);
  return session;
}

export function signInCloud(email: string, password: string): Promise<CloudSession> {
  return authRequest("/auth/v1/token?grant_type=password", { email, password });
}

export async function signOutCloud(): Promise<void> {
  const session = loadSession();
  if (session) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`
      }
    }).catch(() => undefined);
  }
  saveSession(null);
}

async function accessToken(): Promise<string> {
  let session = loadSession();
  if (!session) throw new Error("Not signed in");
  const now = Math.floor(Date.now() / 1000);
  if ((session.expires_at ?? 0) > now + 60) return session.access_token;
  session = await authRequest("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
  return session.access_token;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message ?? data?.hint ?? `Supabase request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function ownerId(): string {
  const session = loadSession();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

function melodyPayload(record: CorpusMelodyRecord) {
  return {
    owner_id: ownerId(),
    title: record.entry.title,
    composer: record.entry.composer ?? null,
    artist: record.entry.artist ?? null,
    year: record.entry.year ?? null,
    era: record.entry.era ?? null,
    genres: record.entry.genres,
    source_kind: record.entry.sourceKind,
    source_name: record.entry.sourceUri ?? null,
    source_uri: record.entry.sourceUri ?? null,
    rights_status: record.entry.sourceKind === "builtin" ? "public-domain" : "private-research",
    license: record.entry.license ?? null,
    source_hash: record.entry.sourceHash ?? null,
    extraction_method: record.entry.extraction?.method ?? null,
    track_index: record.entry.extraction?.trackIndex ?? null,
    extractor_id: record.entry.extraction?.extractorVersion ? "museeka-track-skyline" : null,
    extractor_version: record.entry.extraction?.extractorVersion ?? null,
    melody_hash: melodyHash(record.melody),
    ppq: record.melody.ppq,
    tempo: record.melody.tempo,
    notes: record.melody.notes
  };
}

export async function upsertCloudMelody(record: CorpusMelodyRecord): Promise<CloudMelodyRow> {
  const rows = await rest<CloudMelodyRow[]>("melodies?on_conflict=owner_id,melody_hash", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(melodyPayload(record))
  });
  if (!rows[0]) throw new Error("Supabase did not return the saved melody");
  return rows[0];
}

export async function listCloudMelodies(): Promise<CloudMelodyRow[]> {
  return rest<CloudMelodyRow[]>("melodies?select=*&order=updated_at.desc");
}

export function cloudRowToRecord(row: CloudMelodyRow): CorpusMelodyRecord {
  const melodyId = `cloud_${row.id}`;
  return {
    melody: {
      id: melodyId,
      name: row.title,
      ppq: row.ppq,
      tempo: row.tempo,
      notes: row.notes.map((note, index) => ({
        id: note.id ?? `${melodyId}_${index}`,
        midi: note.midi,
        tick: note.tick,
        durationTicks: note.durationTicks,
        velocity: note.velocity
      }))
    },
    entry: {
      id: `cloud_${row.id}`,
      title: row.title,
      ...(row.composer ? { composer: row.composer } : {}),
      ...(row.artist ? { artist: row.artist } : {}),
      ...(row.year ? { year: row.year } : {}),
      ...(row.era ? { era: row.era } : {}),
      genres: row.genres,
      sourceKind: row.source_kind,
      ...(row.source_uri ? { sourceUri: row.source_uri } : {}),
      ...(row.license ? { license: row.license } : {}),
      ...(row.source_hash ? { sourceHash: row.source_hash } : {}),
      melodyId,
      melodyHash: row.melody_hash,
      extraction: row.extraction_method ? {
        method: row.extraction_method,
        ...(row.track_index != null ? { trackIndex: row.track_index } : {}),
        ...(row.extractor_version ? { extractorVersion: row.extractor_version } : {})
      } : undefined
    }
  };
}

export async function upsertCloudAnnotation(record: CorpusMelodyRecord, annotation: MelodyAnnotation, stimulus: MelodyStimulus): Promise<void> {
  const melody = await upsertCloudMelody(record);
  const body = {
    owner_id: ownerId(),
    stimulus_id: annotation.stimulusId,
    melody_id: melody.id,
    analysis_version: annotation.analysisVersion ?? null,
    preference: annotation.preference ?? null,
    replay_desire: annotation.replayDesire ?? null,
    valence: annotation.emotion?.valence ?? null,
    arousal: annotation.emotion?.arousal ?? null,
    tension: annotation.emotion?.tension ?? null,
    familiarity: annotation.perception?.familiarity ?? null,
    memorability: annotation.perception?.memorability ?? null,
    hummability: annotation.perception?.hummability ?? null,
    surprise: annotation.perception?.surprise ?? null,
    labels: annotation.emotion?.labels ?? {},
    stimulus
  };
  await rest("melody_annotations?on_conflict=owner_id,stimulus_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body)
  });
}

export async function listCloudAnnotations(): Promise<CloudAnnotationRow[]> {
  return rest<CloudAnnotationRow[]>("melody_annotations?select=*&order=updated_at.desc");
}
