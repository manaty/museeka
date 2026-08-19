import type { MusicScore, MusicTrack } from "../../core/types";
import type { Melody, MelodyNote } from "../types";

export const MELODY_EXTRACTOR_ID = "museeka-track-skyline";
export const MELODY_EXTRACTOR_VERSION = "0.1.0";

export type MelodyExtractionCandidate = {
  id: string;
  sourceId: string;
  sourceTrackIndex: number;
  trackName: string;
  channel: number;
  extractor: {
    id: string;
    version: string;
    method: "track-skyline";
  };
  metrics: {
    sourceNotes: number;
    extractedNotes: number;
    onsetCount: number;
    monophonyRatio: number;
    pitchRange: number;
    medianPitch: number;
    notesPerBeat: number;
    confidence: number;
  };
  melody: Melody;
};

function median(values: number[]): number {
  if (values.length === 0) return 60;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function nameHint(trackName: string): number {
  const name = trackName.toLowerCase();
  let score = 0;
  if (/melod|lead|vocal|voice|chant|theme|solo/.test(name)) score += 2;
  if (/flute|violin|oboe|clarinet|sax|trumpet/.test(name)) score += 0.5;
  if (/bass|drum|perc|chord|pad|accomp/.test(name)) score -= 2;
  return score;
}

function groupByOnset(track: MusicTrack): Array<{ tick: number; notes: MusicTrack["notes"] }> {
  const groups = new Map<number, MusicTrack["notes"]>();
  for (const note of track.notes) {
    const tick = note.ticks ?? Math.round(note.time * 1000);
    const list = groups.get(tick) ?? [];
    list.push(note);
    groups.set(tick, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tick, notes]) => ({ tick, notes: [...notes].sort((a, b) => b.midi - a.midi) }));
}

function extractTrack(track: MusicTrack, trackIndex: number, score: MusicScore, sourceId: string): MelodyExtractionCandidate | null {
  if (track.channel === 9 || track.notes.length < 4) return null;

  const ppq = Math.max(1, score.ppq ?? 480);
  const onsetGroups = groupByOnset(track);
  if (onsetGroups.length < 4) return null;

  const firstTick = onsetGroups[0].tick;
  const selected = onsetGroups.map((group) => group.notes[0]);
  const melodyNotes: MelodyNote[] = selected.map((note, index) => {
    const rawTick = note.ticks ?? Math.round(note.time * ppq * (score.tempo / 60));
    const tick = Math.max(0, rawTick - firstTick);
    const nextRawTick = index + 1 < selected.length
      ? (selected[index + 1].ticks ?? Math.round(selected[index + 1].time * ppq * (score.tempo / 60)))
      : null;
    const rawDuration = note.durationTicks ?? Math.max(1, Math.round(note.duration * ppq * (score.tempo / 60)));
    const untilNext = nextRawTick === null ? rawDuration : Math.max(1, nextRawTick - rawTick);
    return {
      id: `${sourceId}_track_${trackIndex}_note_${index}`,
      midi: note.midi,
      tick,
      durationTicks: Math.max(1, Math.min(rawDuration, untilNext)),
      velocity: note.velocity
    };
  });

  const pitches = melodyNotes.map((note) => note.midi);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const durationTicks = Math.max(...melodyNotes.map((note) => note.tick + note.durationTicks), ppq);
  const durationBeats = durationTicks / ppq;
  const singletonOnsets = onsetGroups.filter((group) => group.notes.length === 1).length;
  const monophonyRatio = singletonOnsets / onsetGroups.length;
  const notesPerBeat = melodyNotes.length / Math.max(0.25, durationBeats);
  const medianPitch = median(pitches);
  const pitchRange = maxPitch - minPitch;

  let confidence = monophonyRatio * 0.52;
  confidence += medianPitch >= 52 && medianPitch <= 88 ? 0.16 : 0;
  confidence += pitchRange <= 30 ? 0.12 : pitchRange <= 42 ? 0.05 : -0.08;
  confidence += notesPerBeat >= 0.4 && notesPerBeat <= 4.5 ? 0.1 : -0.08;
  confidence += nameHint(track.name) * 0.08;
  confidence = Math.max(0, Math.min(1, confidence));

  const trackName = track.name || `Track ${trackIndex + 1}`;
  const melody: Melody = {
    id: `melody_${sourceId}_track_${trackIndex}_${MELODY_EXTRACTOR_VERSION.replace(/\./g, "_")}`,
    name: `${score.name} — ${trackName}`,
    ppq,
    tempo: score.tempo,
    notes: melodyNotes
  };

  return {
    id: `candidate_${sourceId}_${trackIndex}_${MELODY_EXTRACTOR_VERSION}`,
    sourceId,
    sourceTrackIndex: trackIndex,
    trackName,
    channel: track.channel,
    extractor: {
      id: MELODY_EXTRACTOR_ID,
      version: MELODY_EXTRACTOR_VERSION,
      method: "track-skyline"
    },
    metrics: {
      sourceNotes: track.notes.length,
      extractedNotes: melodyNotes.length,
      onsetCount: onsetGroups.length,
      monophonyRatio,
      pitchRange,
      medianPitch,
      notesPerBeat,
      confidence
    },
    melody
  };
}

export function extractMelodyCandidates(score: MusicScore, sourceId: string): MelodyExtractionCandidate[] {
  const tracks = score.tracks ?? [];
  return tracks
    .map((track, index) => extractTrack(track, index, score, sourceId))
    .filter((candidate): candidate is MelodyExtractionCandidate => candidate !== null)
    .sort((a, b) => b.metrics.confidence - a.metrics.confidence || b.metrics.extractedNotes - a.metrics.extractedNotes);
}
