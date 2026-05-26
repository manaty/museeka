import * as Tone from "tone";
import type { AudioGenerator, Encounter, InstrumentId, MappingOutput, SoundObject } from "../core/types";
import { evaluateMapping } from "../core/mappings";
import { velocityToGain } from "../music/velocity";
import bassAs1 from "tonejs-instrument-bass-electric-mp3/As1.mp3?url";
import bassCs2 from "tonejs-instrument-bass-electric-mp3/Cs2.mp3?url";
import bassE2 from "tonejs-instrument-bass-electric-mp3/E2.mp3?url";
import bassG2 from "tonejs-instrument-bass-electric-mp3/G2.mp3?url";
import fluteA4 from "tonejs-instrument-flute-mp3/A4.mp3?url";
import fluteA5 from "tonejs-instrument-flute-mp3/A5.mp3?url";
import fluteC4 from "tonejs-instrument-flute-mp3/C4.mp3?url";
import fluteC5 from "tonejs-instrument-flute-mp3/C5.mp3?url";
import fluteC6 from "tonejs-instrument-flute-mp3/C6.mp3?url";
import fluteE4 from "tonejs-instrument-flute-mp3/E4.mp3?url";
import fluteE5 from "tonejs-instrument-flute-mp3/E5.mp3?url";
import fluteE6 from "tonejs-instrument-flute-mp3/E6.mp3?url";
import harpA2 from "tonejs-instrument-harp-mp3/A2.mp3?url";
import harpA4 from "tonejs-instrument-harp-mp3/A4.mp3?url";
import harpB3 from "tonejs-instrument-harp-mp3/B3.mp3?url";
import harpC3 from "tonejs-instrument-harp-mp3/C3.mp3?url";
import harpC5 from "tonejs-instrument-harp-mp3/C5.mp3?url";
import harpD4 from "tonejs-instrument-harp-mp3/D4.mp3?url";
import harpE3 from "tonejs-instrument-harp-mp3/E3.mp3?url";
import harpE5 from "tonejs-instrument-harp-mp3/E5.mp3?url";
import harpG3 from "tonejs-instrument-harp-mp3/G3.mp3?url";
import harpG5 from "tonejs-instrument-harp-mp3/G5.mp3?url";
import pianoC2 from "tonejs-instrument-piano-mp3/C2.mp3?url";
import pianoC3 from "tonejs-instrument-piano-mp3/C3.mp3?url";
import pianoC4 from "tonejs-instrument-piano-mp3/C4.mp3?url";
import pianoC5 from "tonejs-instrument-piano-mp3/C5.mp3?url";
import pianoE3 from "tonejs-instrument-piano-mp3/E3.mp3?url";
import pianoE4 from "tonejs-instrument-piano-mp3/E4.mp3?url";
import pianoG2 from "tonejs-instrument-piano-mp3/G2.mp3?url";
import pianoG3 from "tonejs-instrument-piano-mp3/G3.mp3?url";
import pianoG4 from "tonejs-instrument-piano-mp3/G4.mp3?url";
import xylophoneC5 from "tonejs-instrument-xylophone-mp3/C5.mp3?url";
import xylophoneC6 from "tonejs-instrument-xylophone-mp3/C6.mp3?url";
import xylophoneG4 from "tonejs-instrument-xylophone-mp3/G4.mp3?url";
import xylophoneG5 from "tonejs-instrument-xylophone-mp3/G5.mp3?url";
import pianoF2 from "tonejs-instrument-piano-mp3/F2.mp3?url";
import pianoA2 from "tonejs-instrument-piano-mp3/A2.mp3?url";
import pianoE2 from "tonejs-instrument-piano-mp3/E2.mp3?url";
import pianoC6 from "tonejs-instrument-piano-mp3/C6.mp3?url";
import violinG3 from "tonejs-instrument-violin-mp3/G3.mp3?url";
import violinC4 from "tonejs-instrument-violin-mp3/C4.mp3?url";
import violinG4 from "tonejs-instrument-violin-mp3/G4.mp3?url";
import violinA4 from "tonejs-instrument-violin-mp3/A4.mp3?url";
import violinC5 from "tonejs-instrument-violin-mp3/C5.mp3?url";
import violinE5 from "tonejs-instrument-violin-mp3/E5.mp3?url";
import violinG5 from "tonejs-instrument-violin-mp3/G5.mp3?url";
import violinA5 from "tonejs-instrument-violin-mp3/A5.mp3?url";
import violinC6 from "tonejs-instrument-violin-mp3/C6.mp3?url";
import violinE6 from "tonejs-instrument-violin-mp3/E6.mp3?url";
import celloC2 from "tonejs-instrument-cello-mp3/C2.mp3?url";
import celloE2 from "tonejs-instrument-cello-mp3/E2.mp3?url";
import celloA2 from "tonejs-instrument-cello-mp3/A2.mp3?url";
import celloC3 from "tonejs-instrument-cello-mp3/C3.mp3?url";
import celloE3 from "tonejs-instrument-cello-mp3/E3.mp3?url";
import celloA3 from "tonejs-instrument-cello-mp3/A3.mp3?url";
import celloC4 from "tonejs-instrument-cello-mp3/C4.mp3?url";
import celloE4 from "tonejs-instrument-cello-mp3/E4.mp3?url";
import celloA4 from "tonejs-instrument-cello-mp3/A4.mp3?url";
import celloC5 from "tonejs-instrument-cello-mp3/C5.mp3?url";

type TriggerState = {
  lastIntensity: number;
  lastTriggeredAt: number;
  peakIntensity: number;
  rising: boolean;
};

type ContinuousVoice = {
  synth: MuseekaInstrument;
  notes: string[];
  activeNotes: string[];
  active: boolean;
  everTriggered: boolean;
};

type MappedParams = Partial<Record<MappingOutput, number>>;

export type AudioDebugAnalysis = {
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  frames: number;
  samples: number;
  activeContinuousVoices: number;
};

export type AudioDebugRecording = {
  blob: Blob;
  analysis: AudioDebugAnalysis;
};

type AnalysisAccumulator = {
  squareSum: number;
  peak: number;
  zeroCrossings: number;
  samples: number;
  frames: number;
};

type MuseekaInstrument = Tone.PolySynth | Tone.Sampler;

export type SampleLoadProgress = {
  loaded: number;
  total: number;
  percent: number;
  ready: boolean;
};

function toneDuration(seconds: number): string | number {
  return Math.max(0.05, seconds);
}

function transposeNote(note: string, semitones = 0): string {
  if (Math.abs(semitones) < 0.01) {
    return note;
  }

  return Tone.Frequency(note).transpose(Math.round(semitones)).toNote();
}

function createSampleMap(instrument: InstrumentId): Record<string, string> | null {
  switch (instrument) {
    case "glass_bell":
      return {
        G4: xylophoneG4,
        C5: xylophoneC5,
        G5: xylophoneG5,
        C6: xylophoneC6
      };
    case "crystal":
    case "pluck":
      return {
        A2: harpA2,
        C3: harpC3,
        E3: harpE3,
        G3: harpG3,
        B3: harpB3,
        D4: harpD4,
        A4: harpA4,
        C5: harpC5,
        E5: harpE5,
        G5: harpG5
      };
    case "warm_pad":
      return {
        C2: pianoC2,
        G2: pianoG2,
        C3: pianoC3,
        E3: pianoE3,
        G3: pianoG3,
        C4: pianoC4,
        E4: pianoE4,
        G4: pianoG4,
        C5: pianoC5
      };
    case "flute":
      return {
        C4: fluteC4,
        E4: fluteE4,
        A4: fluteA4,
        C5: fluteC5,
        E5: fluteE5,
        A5: fluteA5,
        C6: fluteC6,
        E6: fluteE6
      };
    case "low_pad":
      return {
        "A#1": bassAs1,
        "C#2": bassCs2,
        E2: bassE2,
        G2: bassG2
      };
    case "woodblock":
      return {
        G4: xylophoneG4,
        C5: xylophoneC5,
        G5: xylophoneG5
      };
    case "piano":
      return {
        E2: pianoE2,
        F2: pianoF2,
        A2: pianoA2,
        C2: pianoC2,
        G2: pianoG2,
        C3: pianoC3,
        E3: pianoE3,
        G3: pianoG3,
        C4: pianoC4,
        E4: pianoE4,
        G4: pianoG4,
        C5: pianoC5,
        C6: pianoC6
      };
    case "violin":
      return {
        G3: violinG3,
        C4: violinC4,
        G4: violinG4,
        A4: violinA4,
        C5: violinC5,
        E5: violinE5,
        G5: violinG5,
        A5: violinA5,
        C6: violinC6,
        E6: violinE6
      };
    case "cello":
      return {
        C2: celloC2,
        E2: celloE2,
        A2: celloA2,
        C3: celloC3,
        E3: celloE3,
        A3: celloA3,
        C4: celloC4,
        E4: celloE4,
        A4: celloA4,
        C5: celloC5
      };
    default:
      return null;
  }
}

function createInstrument(instrument: InstrumentId, output: Tone.Gain, onload?: () => void): MuseekaInstrument {
  const sampleMap = createSampleMap(instrument);
  const synth = sampleMap
    ? new Tone.Sampler({
        urls: sampleMap,
        curve: "exponential",
        onload,
        release: instrument === "low_pad" || instrument === "warm_pad" ? 1.4 : 0.45
      })
    : new Tone.PolySynth(Tone.Synth);

  if (!sampleMap) {
    queueMicrotask(() => onload?.());
  }

  return synth.connect(output);
}

export class AudioEngine {
  private started = false;
  private masterVolume = 0.8;
  private triggerStates = new Map<string, TriggerState>();
  private continuousVoices = new Map<string, ContinuousVoice>();
  private output = new Tone.Gain(1);
  private analyser = new Tone.Analyser("waveform", 2048);
  private recorder: Tone.Recorder | null = null;
  private analysisAccumulator: AnalysisAccumulator | null = null;
  private instruments = new Map<InstrumentId, MuseekaInstrument>();
  private samplesLoading = false;
  private samplePreparation: Promise<void> | null = null;
  private loadedSampleInstruments = new Set<InstrumentId>();
  private sampleProgressListeners = new Set<(progress: SampleLoadProgress) => void>();
  private readonly sampleInstrumentIds: InstrumentId[] = ["glass_bell", "warm_pad", "flute", "woodblock", "low_pad", "pluck", "crystal", "piano", "violin", "cello"];

  constructor() {
    this.output.toDestination();
    this.output.connect(this.analyser);
  }

  async start() {
    if (!this.started) {
      await Tone.start();
      void this.prepareSamples();
      this.started = true;
      this.setMasterVolume(this.masterVolume);
    }
  }

  prepareSamples(onProgress?: (progress: SampleLoadProgress) => void): Promise<void> {
    if (onProgress) {
      this.sampleProgressListeners.add(onProgress);
      onProgress(this.currentSampleProgress());
    }

    if (!this.samplePreparation) {
      this.samplesLoading = true;
      this.preloadInstruments();
      this.samplePreparation = Tone.loaded()
        .then(() => {
          for (const id of this.sampleInstrumentIds) {
            this.loadedSampleInstruments.add(id);
          }
          this.emitSampleProgress();
        })
        .finally(() => {
          this.samplesLoading = false;
        });
    }

    return onProgress
      ? this.samplePreparation.finally(() => {
          this.sampleProgressListeners.delete(onProgress);
        })
      : this.samplePreparation;
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    Tone.Destination.volume.value = Tone.gainToDb(Math.max(0.0001, this.masterVolume));
  }

  reset() {
    for (const voice of this.continuousVoices.values()) {
      voice.synth.releaseAll();
      voice.active = false;
      voice.everTriggered = false;
    }
    this.triggerStates.clear();
  }

  dispose() {
    for (const voice of this.continuousVoices.values()) {
      voice.synth.dispose();
    }
    for (const instrument of this.instruments.values()) {
      instrument.dispose();
    }
    this.recorder?.dispose();
    this.analyser.dispose();
    this.output.dispose();
    this.continuousVoices.clear();
    this.instruments.clear();
  }

  update(objects: SoundObject[], encounters: Encounter[], elapsed: number) {
    if (!this.started) {
      return;
    }

    const encounterById = new Map(encounters.map((encounter) => [encounter.objectId, encounter]));

    for (const object of objects) {
      const encounter = encounterById.get(object.id);
      if (!encounter) continue;

      if (object.trigger.mode === "continuous") {
        this.updateContinuous(object, encounter);
      } else {
        this.updateTriggered(object, encounter, elapsed);
      }
    }

    this.accumulateRecordingAnalysis();
  }

  triggerPreview(object: SoundObject) {
    const params: MappedParams = { volume: 0.9 };
    this.playGenerator(object.audio, params);
  }

  private mappedParams(object: SoundObject, encounter: Encounter): MappedParams {
    return Object.fromEntries(object.mappings.map((mapping) => [mapping.output, evaluateMapping(encounter, mapping)])) as MappedParams;
  }

  private preloadInstruments() {
    for (const id of this.sampleInstrumentIds) {
      this.getPooledInstrument(id);
    }
  }

  private getPooledInstrument(instrument: InstrumentId): MuseekaInstrument {
    let synth = this.instruments.get(instrument);
    if (!synth) {
      synth = createInstrument(instrument, this.output, () => {
        this.loadedSampleInstruments.add(instrument);
        this.emitSampleProgress();
      });
      this.instruments.set(instrument, synth);
    } else if (synth instanceof Tone.Sampler && synth.loaded) {
      this.loadedSampleInstruments.add(instrument);
    }
    return synth;
  }

  private updateContinuous(object: SoundObject, encounter: Encounter) {
    const params = this.mappedParams(object, encounter);
    const volume = Math.max(0, Math.min(1, params.volume ?? encounter.field.intensity));
    let voice = this.continuousVoices.get(object.id);

    if (!voice) {
      voice = { synth: createInstrument(object.audio.instrument, this.output), notes: this.notesForGenerator(object.audio), activeNotes: [], active: false, everTriggered: false };
      this.continuousVoices.set(object.id, voice);
    }

    voice.synth.volume.value = Tone.gainToDb(Math.max(0.0001, volume * 0.28));

    // Drone-on fires once per session (matches simulator semantics).
    if (encounter.field.intensity >= object.trigger.threshold && !voice.active && !voice.everTriggered) {
      voice.activeNotes = voice.notes.map((note) => transposeNote(note, params.pitchSemitones ?? 0));
      voice.synth.triggerAttack(voice.activeNotes, Tone.now(), 0.45);
      voice.active = true;
      voice.everTriggered = true;
    }

    if (encounter.field.intensity < object.trigger.threshold * 0.5 && voice.active) {
      voice.synth.triggerRelease(voice.activeNotes.length > 0 ? voice.activeNotes : voice.notes);
      voice.activeNotes = [];
      voice.active = false;
    }
  }

  private updateTriggered(object: SoundObject, encounter: Encounter, elapsed: number) {
    const state = this.triggerStates.get(object.id) ?? { lastIntensity: 0, lastTriggeredAt: -Infinity, peakIntensity: 0, rising: false };
    const intensity = encounter.field.intensity;
    const threshold = object.trigger.threshold;
    const cooledDown = elapsed - state.lastTriggeredAt >= object.trigger.cooldown;

    if (object.trigger.mode === "peak") {
      if (intensity >= threshold) {
        if (intensity > state.peakIntensity + 0.001) {
          state.peakIntensity = intensity;
          state.rising = true;
        } else if (state.rising && intensity < state.peakIntensity - 0.005 && cooledDown) {
          this.playGenerator(object.audio, this.mappedParams(object, encounter));
          state.lastTriggeredAt = elapsed;
          state.rising = false;
        }
      } else if (state.peakIntensity > 0) {
        state.peakIntensity = 0;
        state.rising = false;
      }
    } else {
      const entered = intensity >= threshold && state.lastIntensity < threshold;
      if (entered && cooledDown) {
        this.playGenerator(object.audio, this.mappedParams(object, encounter));
        state.lastTriggeredAt = elapsed;
      }
    }

    state.lastIntensity = intensity;
    this.triggerStates.set(object.id, state);
  }

  async startDebugRecording() {
    await this.start();
    if (!Tone.Recorder.supported) {
      throw new Error("MediaRecorder is not supported in this browser.");
    }
    if (this.recorder) {
      await this.stopDebugRecording();
    }

    this.recorder = new Tone.Recorder();
    this.output.connect(this.recorder);
    this.analysisAccumulator = { squareSum: 0, peak: 0, zeroCrossings: 0, samples: 0, frames: 0 };
    await this.recorder.start();
  }

  async stopDebugRecording(): Promise<AudioDebugRecording> {
    if (!this.recorder) {
      throw new Error("No audio debug recording is running.");
    }

    const recorder = this.recorder;
    this.recorder = null;
    const blob = await recorder.stop();
    this.output.disconnect(recorder);
    recorder.dispose();
    const analysis = this.getAccumulatedAnalysis();
    this.analysisAccumulator = null;
    return { blob, analysis };
  }

  getAnalysisSnapshot(): AudioDebugAnalysis {
    const data = this.getWaveform();
    return this.analyzeWaveform(data, 1);
  }

  private notesForGenerator(generator: AudioGenerator): string[] {
    switch (generator.generator) {
      case "note":
        return [generator.baseNote];
      case "chord":
      case "drone":
        return generator.notes;
      case "phrase":
        return generator.notes.map((note) => note.note);
      case "percussion":
        return ["C2"];
    }
  }

  private playGenerator(generator: AudioGenerator, params: MappedParams) {
    const synth = this.getPooledInstrument(generator.instrument);
    const volume = Math.max(0, Math.min(1, params.volume ?? 0.85));
    const velocityScale = volume * Math.max(0.1, params.brightness ?? 0.85);
    synth.volume.value = Tone.gainToDb(Math.max(0.0001, volume));

    const pitch = params.pitchSemitones ?? 0;
    const now = Tone.now();

    if (generator.generator === "note") {
      synth.triggerAttackRelease(transposeNote(generator.baseNote, pitch), toneDuration(generator.duration), now, velocityToGain(generator.velocity) * velocityScale);
      return;
    }

    if (generator.generator === "chord") {
      synth.triggerAttackRelease(generator.notes.map((note) => transposeNote(note, pitch)), toneDuration(generator.duration), now, velocityToGain(generator.velocity) * velocityScale);
      return;
    }

    if (generator.generator === "phrase") {
      for (const phraseNote of generator.notes) {
        synth.triggerAttackRelease(transposeNote(phraseNote.note, pitch), toneDuration(phraseNote.duration), now + phraseNote.dt, velocityToGain(phraseNote.velocity ?? 0.7) * velocityScale);
      }
      return;
    }

    if (generator.generator === "percussion") {
      for (const hit of generator.pattern) {
        synth.triggerAttackRelease("C5", 0.08, now + hit.dt, velocityToGain(hit.velocity) * velocityScale);
      }
      return;
    }

    if (generator.generator === "drone") {
      synth.triggerAttackRelease(generator.notes.map((note) => transposeNote(note, pitch)), toneDuration(2), now, velocityToGain(generator.velocity ?? 0.5) * velocityScale);
    }
  }

  private getWaveform(): Float32Array {
    const value = this.analyser.getValue();
    return Array.isArray(value) ? value[0] : value;
  }

  private accumulateRecordingAnalysis() {
    if (!this.analysisAccumulator) {
      return;
    }

    const data = this.getWaveform();
    let previous = data[0] ?? 0;
    for (const sample of data) {
      const abs = Math.abs(sample);
      this.analysisAccumulator.squareSum += sample * sample;
      this.analysisAccumulator.peak = Math.max(this.analysisAccumulator.peak, abs);
      if ((previous < 0 && sample >= 0) || (previous >= 0 && sample < 0)) {
        this.analysisAccumulator.zeroCrossings += 1;
      }
      previous = sample;
    }
    this.analysisAccumulator.samples += data.length;
    this.analysisAccumulator.frames += 1;
  }

  private getAccumulatedAnalysis(): AudioDebugAnalysis {
    const acc = this.analysisAccumulator;
    if (!acc || acc.samples === 0) {
      return this.getAnalysisSnapshot();
    }

    return {
      rms: Math.sqrt(acc.squareSum / acc.samples),
      peak: acc.peak,
      zeroCrossingRate: acc.zeroCrossings / acc.samples,
      frames: acc.frames,
      samples: acc.samples,
      activeContinuousVoices: [...this.continuousVoices.values()].filter((voice) => voice.active).length
    };
  }

  private analyzeWaveform(data: Float32Array, frames: number): AudioDebugAnalysis {
    let squareSum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let previous = data[0] ?? 0;

    for (const sample of data) {
      squareSum += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      if ((previous < 0 && sample >= 0) || (previous >= 0 && sample < 0)) {
        zeroCrossings += 1;
      }
      previous = sample;
    }

    return {
      rms: data.length > 0 ? Math.sqrt(squareSum / data.length) : 0,
      peak,
      zeroCrossingRate: data.length > 0 ? zeroCrossings / data.length : 0,
      frames,
      samples: data.length,
      activeContinuousVoices: [...this.continuousVoices.values()].filter((voice) => voice.active).length
    };
  }

  private currentSampleProgress(): SampleLoadProgress {
    const total = this.sampleInstrumentIds.length;
    const loaded = Math.min(total, this.loadedSampleInstruments.size);
    return {
      loaded,
      total,
      percent: total > 0 ? Math.round((loaded / total) * 100) : 100,
      ready: loaded >= total
    };
  }

  private emitSampleProgress() {
    const progress = this.currentSampleProgress();
    for (const listener of this.sampleProgressListeners) {
      listener(progress);
    }
  }
}
