import type { Path3D, PathPoint, Vec3 } from "./types";
import { clamp, distance, lerp, scale, sub } from "./vec3";

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    0.5 * (2 * p1[2] + (-p0[2] + p2[2]) * t + (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 + (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3)
  ];
}

function sortedPoints(path: Path3D): PathPoint[] {
  return [...path.points].sort((a, b) => a.t - b.t);
}

export function samplePathAtTime(path: Path3D, time: number): Vec3 {
  const points = sortedPoints(path);

  if (points.length === 0) {
    return [0, 8, 0];
  }

  if (points.length === 1 || time <= points[0].t) {
    return points[0].p;
  }

  const last = points[points.length - 1];
  if (time >= last.t) {
    return last.p;
  }

  const segmentIndex = points.findIndex((point, index) => index < points.length - 1 && time >= point.t && time <= points[index + 1].t);
  const i = Math.max(0, segmentIndex);
  const a = points[i];
  const b = points[i + 1];
  const localT = clamp((time - a.t) / Math.max(0.0001, b.t - a.t), 0, 1);

  if (path.interpolation !== "catmull-rom" || points.length < 4) {
    return lerp(a.p, b.p, localT);
  }

  const p0 = points[Math.max(0, i - 1)].p;
  const p1 = a.p;
  const p2 = b.p;
  const p3 = points[Math.min(points.length - 1, i + 2)].p;
  return catmullRom(p0, p1, p2, p3, localT);
}

export function samplePathState(path: Path3D, time: number, previousTime: number) {
  const wrappedTime = clamp(time, 0, path.duration);
  const previous = samplePathAtTime(path, clamp(previousTime, 0, path.duration));
  const position = samplePathAtTime(path, wrappedTime);
  const dt = Math.max(0.016, Math.abs(wrappedTime - previousTime));
  const velocity = scale(sub(position, previous), 1 / dt);

  return {
    time: wrappedTime,
    pathId: path.id,
    position,
    previousPosition: previous,
    velocity,
    speed: distance(position, previous) / dt
  };
}
