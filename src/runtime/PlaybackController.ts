import type { Path3D, PlayerState } from "../core/types";
import { samplePathState } from "../core/path";

export class PlaybackController {
  private path: Path3D;
  private playing = false;
  private time = 0;
  private previousTime = 0;
  private speed = 1;

  constructor(path: Path3D) {
    this.path = path;
  }

  setPath(path: Path3D) {
    this.path = path;
    this.restart();
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(2.5, speed));
  }

  restart() {
    this.time = 0;
    this.previousTime = 0;
  }

  update(dt: number): PlayerState {
    this.previousTime = this.time;

    if (this.playing) {
      this.time += dt * this.speed * this.path.speedScale;
      if (this.time > this.path.duration) {
        this.time = this.path.duration;
        this.playing = false;
      }
    }

    return samplePathState(this.path, this.time, this.previousTime);
  }

  getState(): PlayerState {
    return samplePathState(this.path, this.time, this.previousTime);
  }

  getTime() {
    return this.time;
  }

  isPlaying() {
    return this.playing;
  }
}
