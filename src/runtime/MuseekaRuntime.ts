import type { Encounter, IslandScene, Path3D, SoundObject } from "../core/types";
import { computeEncounters } from "../core/encounter";
import { terrainGroundY } from "../core/terrain";
import { AudioEngine, type SampleLoadProgress } from "../audio/AudioEngine";
import { PlaybackController } from "./PlaybackController";
import { FreeFlyController, type FreeFlyInput } from "./FreeFlyController";

// Just enough to clear the terrain mesh. The firefly is small; 1 m is
// plenty. (Was 1.8 m to keep V1 anchors visible; V2 anchors sit much
// closer to the ground so a lower clamp lets the firefly walk THROUGH
// the arches at their natural visual height.)
const MIN_GROUND_CLEARANCE = 1.0;

export type RuntimeMode = "path" | "freefly";

export type RuntimeSnapshot = {
  time: number;
  duration: number;
  playing: boolean;
  mode: RuntimeMode;
  player: ReturnType<PlaybackController["getState"]>;
  activeObjects: string[];
  recentTriggers: string[];
  encounters: Encounter[];
  freeFlyYaw?: number;
  freeFlyPitch?: number;
};

export class MuseekaRuntime {
  readonly audio = new AudioEngine();
  readonly freeFly = new FreeFlyController();
  private scene: IslandScene;
  private playback: PlaybackController;
  private mode: RuntimeMode = "path";
  private freeFlyInput: FreeFlyInput | null = null;
  private accumulatedTime = 0;
  private activeObjects: string[] = [];
  private recentTriggers: string[] = [];
  private previousActive = new Set<string>();

  constructor(scene: IslandScene) {
    this.scene = scene;
    this.playback = new PlaybackController(this.currentPath());
    this.audio.setMasterVolume(scene.settings.audio.masterVolume);
  }

  getMode(): RuntimeMode {
    return this.mode;
  }

  setMode(mode: RuntimeMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "freefly") {
      const current = this.playback.getState();
      this.freeFly.initialize(current.position);
    }
    this.audio.reset();
    this.previousActive.clear();
    this.recentTriggers = [];
  }

  setFreeFlyInput(input: FreeFlyInput) {
    this.freeFlyInput = input;
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
    let player;
    let time: number;
    let duration: number;
    let playing: boolean;

    if (this.mode === "freefly") {
      this.accumulatedTime += dt;
      player = this.freeFly.update(dt, this.freeFlyInput ?? undefined);
      time = this.accumulatedTime;
      duration = 0;
      playing = true;
    } else {
      player = this.playback.update(dt);
      time = this.playback.getTime();
      duration = this.currentPath().duration;
      playing = this.playback.isPlaying();
    }

    // Clamp player Y so the firefly can't tunnel into hills when the
    // Catmull-Rom curve dips below terrain between waypoints.
    const groundY = terrainGroundY(player.position[0], player.position[2], this.scene.terrain);
    const minY = groundY + MIN_GROUND_CLEARANCE;
    if (player.position[1] < minY) {
      player = { ...player, position: [player.position[0], minY, player.position[2]] as [number, number, number] };
    }

    // Every object on the island is always live — music emerges from
    // spatial encounters regardless of which parcours plays.
    const encounters = computeEncounters(player, this.scene.soundObjects);
    this.audio.update(this.scene.soundObjects, encounters, time);

    const currentActive = new Set(encounters.filter((encounter) => encounter.field.intensity >= 0.2).map((encounter) => encounter.objectId));
    this.activeObjects = [...currentActive];
    const newTriggers = [...currentActive].filter((id) => !this.previousActive.has(id));
    if (newTriggers.length > 0) {
      this.recentTriggers = [...newTriggers, ...this.recentTriggers].slice(0, 6);
    }
    this.previousActive = currentActive;

    return {
      time,
      duration,
      playing,
      mode: this.mode,
      player,
      activeObjects: this.activeObjects,
      recentTriggers: this.recentTriggers,
      encounters,
      freeFlyYaw: this.mode === "freefly" ? this.freeFly.getYaw() : undefined,
      freeFlyPitch: this.mode === "freefly" ? this.freeFly.getPitch() : undefined
    };
  }

  getObjects(): SoundObject[] {
    return this.scene.soundObjects;
  }

  dispose() {
    this.audio.dispose();
  }
}
