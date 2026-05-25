import type { PlayerState, Vec3 } from "../core/types";
import { add, length, normalize, scale, sub } from "../core/vec3";

export type FreeFlyInput = {
  forward: number;
  right: number;
  up: number;
  lookDx: number;
  lookDy: number;
  targetPoint: Vec3 | null;
  sprint: boolean;
};

const EMPTY_INPUT: FreeFlyInput = {
  forward: 0,
  right: 0,
  up: 0,
  lookDx: 0,
  lookDy: 0,
  targetPoint: null,
  sprint: false
};

const MAX_PITCH = Math.PI * 0.48;
const DAMPING = 8;
const BASE_SPEED = 16;
const SPRINT_MULTIPLIER = 2.4;
const TARGET_ARRIVE_RADIUS = 1.5;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class FreeFlyController {
  private position: Vec3 = [0, 18, 32];
  private previousPosition: Vec3 = [0, 18, 32];
  private velocity: Vec3 = [0, 0, 0];
  private yaw = Math.PI;
  private pitch = -0.18;
  private currentTarget: Vec3 | null = null;

  initialize(position: Vec3, yaw = this.yaw, pitch = this.pitch) {
    this.position = [...position];
    this.previousPosition = [...position];
    this.velocity = [0, 0, 0];
    this.yaw = yaw;
    this.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
    this.currentTarget = null;
  }

  setPosition(position: Vec3) {
    this.position = [...position];
    this.previousPosition = [...position];
    this.velocity = [0, 0, 0];
  }

  getYaw() {
    return this.yaw;
  }

  getPitch() {
    return this.pitch;
  }

  getLookDirection(): Vec3 {
    const cosPitch = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch];
  }

  update(dt: number, input: FreeFlyInput = EMPTY_INPUT): PlayerState {
    this.yaw += input.lookDx;
    this.pitch = clamp(this.pitch + input.lookDy, -MAX_PITCH, MAX_PITCH);

    if (input.targetPoint) {
      this.currentTarget = [...input.targetPoint];
    }

    const cosPitch = Math.cos(this.pitch);
    const forwardDir: Vec3 = [Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const rightDir: Vec3 = [Math.cos(this.yaw), 0, Math.sin(this.yaw)];

    const speed = BASE_SPEED * (input.sprint ? SPRINT_MULTIPLIER : 1);
    let desired: Vec3 = [
      forwardDir[0] * input.forward * speed + rightDir[0] * input.right * speed,
      input.up * speed,
      forwardDir[2] * input.forward * speed + rightDir[2] * input.right * speed
    ];

    if (this.currentTarget) {
      const offset = sub(this.currentTarget, this.position);
      const distance = length(offset);
      if (distance <= TARGET_ARRIVE_RADIUS || input.forward !== 0 || input.right !== 0 || input.up !== 0) {
        this.currentTarget = null;
      } else {
        const dir = normalize(offset);
        const approachSpeed = Math.min(speed, Math.max(2, distance * 1.6));
        desired = scale(dir, approachSpeed);
      }
    }

    const blend = clamp(dt * DAMPING, 0, 1);
    this.velocity = lerpVec(this.velocity, desired, blend);

    this.previousPosition = [...this.position];
    this.position = add(this.position, scale(this.velocity, dt));

    if (this.position[1] < 2) {
      this.position[1] = 2;
      this.velocity[1] = Math.max(0, this.velocity[1]);
    }

    // Keep yaw bounded to avoid drift
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    void cosPitch;

    const moved = sub(this.position, this.previousPosition);
    return {
      time: 0,
      pathId: "freefly",
      position: this.position,
      previousPosition: this.previousPosition,
      velocity: this.velocity,
      speed: length(moved) / Math.max(dt, 0.0001)
    };
  }
}
