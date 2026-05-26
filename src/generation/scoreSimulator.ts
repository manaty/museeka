import type { AudioGenerator, Encounter, InstrumentId, MappingOutput, Path3D, PlayerState, SoundObject } from "../core/types";
import { computeEncounters } from "../core/encounter";
import { evaluateMapping } from "../core/mappings";
import { samplePathState } from "../core/path";
import { midiToNoteName, noteNameToMidi } from "./spatialFold";

const SIM_DT = 0.02;

export type ProducedNote = {
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

export type SimulationResult = {
  pathId: string;
  duration: number;
  produced: ProducedNote[];
  sampleCount: number;
};

type TriggerSimState = {
  lastIntensity: number;
  lastTriggeredAt: number;
  peakIntensity: number;
  rising: boolean;
  continuousActive: boolean;
  everTriggered: boolean;
};

function mappedParams(object: SoundObject, encounter: Encounter): Partial<Record<MappingOutput, number>> {
  return Object.fromEntries(object.mappings.map((mapping) => [mapping.output, evaluateMapping(encounter, mapping)])) as Partial<Record<MappingOutput, number>>;
}

function transposeMidi(baseNote: string, semitones: number): number {
  const base = noteNameToMidi(baseNote);
  return base + Math.round(semitones);
}

function emitFromGenerator(
  generator: AudioGenerator,
  pitchSemitones: number,
  volume: number,
  brightness: number,
  triggerTime: number,
  objectId: string,
  produced: ProducedNote[]
) {
  const velocityScale = Math.max(0.05, volume * Math.max(0.1, brightness));

  if (generator.generator === "note") {
    const midi = transposeMidi(generator.baseNote, pitchSemitones);
    produced.push({
      time: triggerTime,
      midi,
      noteName: midiToNoteName(midi),
      velocity: generator.velocity * velocityScale,
      duration: generator.duration,
      instrument: generator.instrument,
      sourceObjectId: objectId,
      kind: "note",
      pitchSemitones
    });
    return;
  }

  if (generator.generator === "chord") {
    for (const note of generator.notes) {
      const midi = transposeMidi(note, pitchSemitones);
      produced.push({
        time: triggerTime,
        midi,
        noteName: midiToNoteName(midi),
        velocity: generator.velocity * velocityScale,
        duration: generator.duration,
        instrument: generator.instrument,
        sourceObjectId: objectId,
        kind: "chord",
        pitchSemitones
      });
    }
    return;
  }

  if (generator.generator === "phrase") {
    for (const phraseNote of generator.notes) {
      const midi = transposeMidi(phraseNote.note, pitchSemitones);
      produced.push({
        time: triggerTime + phraseNote.dt,
        midi,
        noteName: midiToNoteName(midi),
        velocity: (phraseNote.velocity ?? 0.7) * velocityScale,
        duration: phraseNote.duration,
        instrument: generator.instrument,
        sourceObjectId: objectId,
        kind: "phrase",
        pitchSemitones
      });
    }
    return;
  }

  if (generator.generator === "drone") {
    for (const note of generator.notes) {
      const midi = transposeMidi(note, pitchSemitones);
      produced.push({
        time: triggerTime,
        midi,
        noteName: midiToNoteName(midi),
        velocity: (generator.velocity ?? 0.5) * velocityScale,
        duration: 0,
        instrument: generator.instrument,
        sourceObjectId: objectId,
        kind: "drone-on",
        pitchSemitones
      });
    }
    return;
  }

  if (generator.generator === "percussion") {
    for (const hit of generator.pattern) {
      produced.push({
        time: triggerTime + hit.dt,
        midi: 0,
        noteName: "perc",
        velocity: hit.velocity * velocityScale,
        duration: 0.08,
        instrument: generator.instrument,
        sourceObjectId: objectId,
        kind: "percussion",
        pitchSemitones: 0
      });
    }
  }
}

function emitDroneOff(object: SoundObject, time: number, produced: ProducedNote[]) {
  if (object.audio.generator !== "drone") return;
  for (const note of object.audio.notes) {
    const midi = noteNameToMidi(note);
    produced.push({
      time,
      midi,
      noteName: midiToNoteName(midi),
      velocity: 0,
      duration: 0,
      instrument: object.audio.instrument,
      sourceObjectId: object.id,
      kind: "drone-off",
      pitchSemitones: 0
    });
  }
}

export function simulateParcours(path: Path3D, objects: SoundObject[]): SimulationResult {
  const states = new Map<string, TriggerSimState>();
  for (const object of objects) {
    states.set(object.id, { lastIntensity: 0, lastTriggeredAt: -Infinity, peakIntensity: 0, rising: false, continuousActive: false, everTriggered: false });
  }

  const produced: ProducedNote[] = [];
  const totalSteps = Math.ceil(path.duration / SIM_DT) + 1;
  let previousTime = 0;

  for (let step = 0; step <= totalSteps; step += 1) {
    const time = Math.min(path.duration, step * SIM_DT);
    const player: PlayerState = samplePathState(path, time, previousTime);
    const encounters = computeEncounters(player, objects);
    const encounterById = new Map(encounters.map((encounter) => [encounter.objectId, encounter]));

    for (const object of objects) {
      const encounter = encounterById.get(object.id);
      if (!encounter) continue;
      const state = states.get(object.id);
      if (!state) continue;

      const intensity = encounter.field.intensity;
      const threshold = object.trigger.threshold;
      const cooledDown = time - state.lastTriggeredAt >= object.trigger.cooldown;
      const params = mappedParams(object, encounter);
      const volume = Math.max(0, Math.min(1, params.volume ?? intensity));
      const brightness = params.brightness ?? 0.85;
      const pitchSemitones = params.pitchSemitones ?? 0;

      if (object.trigger.mode === "continuous") {
        // Drone-on fires exactly once per session (first spatial encounter).
        // Subsequent re-entries do not re-trigger, preventing duplicate drone-on extras.
        if (intensity >= threshold && !state.continuousActive && !state.everTriggered) {
          emitFromGenerator(object.audio, pitchSemitones, Math.max(volume, 0.3), brightness, time, object.id, produced);
          state.continuousActive = true;
          state.everTriggered = true;
        } else if (intensity < threshold * 0.5 && state.continuousActive) {
          emitDroneOff(object, time, produced);
          state.continuousActive = false;
        }
      } else if (object.trigger.mode === "peak") {
        if (intensity >= threshold) {
          if (intensity > state.peakIntensity + 0.001) {
            state.peakIntensity = intensity;
            state.rising = true;
          } else if (state.rising && intensity < state.peakIntensity - 0.005 && cooledDown) {
            emitFromGenerator(object.audio, pitchSemitones, volume, brightness, time, object.id, produced);
            state.lastTriggeredAt = time;
            state.rising = false;
            // Reset peak baseline so the NEXT visit (even at the same intensity magnitude)
            // can register a fresh rising → falling pattern and re-trigger.
            state.peakIntensity = intensity;
          }
        } else if (intensity < threshold * 0.3) {
          // Deep exit: full state cleanup so re-entry starts completely fresh.
          state.peakIntensity = 0;
          state.rising = false;
        }
      } else {
        const entered = intensity >= threshold && state.lastIntensity < threshold;
        if (entered && cooledDown) {
          emitFromGenerator(object.audio, pitchSemitones, volume, brightness, time, object.id, produced);
          state.lastTriggeredAt = time;
        }
      }

      state.lastIntensity = intensity;
    }

    previousTime = time;
    if (time >= path.duration) break;
  }

  // Close any still-active drones at end of parcours
  for (const object of objects) {
    const state = states.get(object.id);
    if (state?.continuousActive) {
      emitDroneOff(object, path.duration, produced);
    }
  }

  produced.sort((a, b) => a.time - b.time || a.midi - b.midi);

  return {
    pathId: path.id,
    duration: path.duration,
    produced,
    sampleCount: totalSteps
  };
}
