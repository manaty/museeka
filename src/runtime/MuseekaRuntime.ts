import type { Encounter, IslandScene, Path3D, SoundObject } from "../core/types";
import { computeEncounters } from "../core/encounter";
import { AudioEngine, type SampleLoadProgress } from "../audio/AudioEngine";
import { PlaybackController } from "./PlaybackController";

export type RuntimeSnapshot = {
  time: number;
  duration: number;
  playing: boolean;
  player: ReturnType<PlaybackController["getState"]>;
  activeObjects: string[];
  recentTriggers: string[];
  encounters: Encounter[];
};

export class MuseekaRuntime {
  readonly audio = new AudioEngine();
  private scene: IslandScene;
  private playback: PlaybackController;
  private activeObjects: string[] = [];
  private recentTriggers: string[] = [];
  private previousActive = new Set<string>();

  constructor(scene: IslandScene) {
    this.scene = scene;
    this.playback = new PlaybackController(this.currentPath());
    this.audio.setMasterVolume(scene.settings.audio.masterVolume);
  }

  currentPath(): Path3D {
    return this.scene.paths.find((path) => path.id === this.scene.settings.defaultPathId) ?? this.scene.paths[0];
  }

  setPath(pathId: string) {
    const path = this.scene.paths.find((candidate) => candidate.id === pathId);
    if (!path) return;
    this.scene = { ...this.scene, settings: { ...this.scene.settings, defaultPathId: pathId } };
    this.playback.setPath(path);
    this.audio.reset();
  }

  setPlaying(playing: boolean) {
    this.playback.setPlaying(playing);
  }

  setSpeed(speed: number) {
    this.playback.setSpeed(speed);
  }

  restart() {
    this.playback.restart();
    this.audio.reset();
    this.previousActive.clear();
  }

  setMasterVolume(volume: number) {
    this.audio.setMasterVolume(volume);
  }

  async unlockAudio() {
    await this.audio.start();
  }

  prepareAudioSamples(onProgress?: (progress: SampleLoadProgress) => void): Promise<void> {
    return this.audio.prepareSamples(onProgress);
  }

  update(dt: number): RuntimeSnapshot {
    const player = this.playback.update(dt);
    const encounters = computeEncounters(player, this.scene.soundObjects);
    this.audio.update(this.scene.soundObjects, encounters, this.playback.getTime());

    const currentActive = new Set(encounters.filter((encounter) => encounter.field.intensity >= 0.2).map((encounter) => encounter.objectId));
    this.activeObjects = [...currentActive];
    const newTriggers = [...currentActive].filter((id) => !this.previousActive.has(id));
    if (newTriggers.length > 0) {
      this.recentTriggers = [...newTriggers, ...this.recentTriggers].slice(0, 6);
    }
    this.previousActive = currentActive;

    const path = this.currentPath();
    return {
      time: this.playback.getTime(),
      duration: path.duration,
      playing: this.playback.isPlaying(),
      player,
      activeObjects: this.activeObjects,
      recentTriggers: this.recentTriggers,
      encounters
    };
  }

  getObjects(): SoundObject[] {
    return this.scene.soundObjects;
  }

  dispose() {
    this.audio.dispose();
  }
}
