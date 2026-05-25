import type { FieldOutput, SoundField, Transform, Vec3 } from "./types";
import { applyCurve } from "./curves";
import { clamp, clamp01, dot, length, normalize, sub } from "./vec3";

const zeroOutput = (localPosition: Vec3): FieldOutput => ({
  inside: false,
  intensity: 0,
  distanceFactor: 0,
  angleFactor: 1,
  altitudeFactor: 1,
  localPosition
});

function applyDistanceFalloff(raw: number, field: SoundField): number {
  const curve = field.falloff?.distance ?? { type: "smoothstep" as const };
  return applyCurve(raw, curve);
}

export function evaluateField(field: SoundField, transform: Transform, worldPosition: Vec3): FieldOutput {
  const localPosition = sub(worldPosition, transform.position);

  if (field.shape === "sphere") {
    const normalizedDistance = length(localPosition) / Math.max(0.0001, field.params.radius);
    const base = clamp01(1 - normalizedDistance);
    const intensity = applyDistanceFalloff(base, field);
    return {
      inside: normalizedDistance <= 1,
      intensity,
      distanceFactor: base,
      angleFactor: 1,
      altitudeFactor: 1,
      localPosition
    };
  }

  if (field.shape === "ellipsoid") {
    const [rx, ry, rz] = field.params.radius.map((value) => Math.max(0.0001, value)) as Vec3;
    const normalizedDistance = Math.sqrt((localPosition[0] / rx) ** 2 + (localPosition[1] / ry) ** 2 + (localPosition[2] / rz) ** 2);
    const base = clamp01(1 - normalizedDistance);
    const intensity = applyDistanceFalloff(base, field);
    return {
      inside: normalizedDistance <= 1,
      intensity,
      distanceFactor: base,
      angleFactor: 1,
      altitudeFactor: clamp01(1 - Math.abs(localPosition[1]) / ry),
      localPosition
    };
  }

  if (field.shape === "cone") {
    const range = Math.max(0.0001, field.params.range);
    const direction = normalize(field.params.direction);
    const distanceToObject = length(localPosition);

    if (distanceToObject <= 0.0001) {
      return {
        inside: true,
        intensity: 1,
        distanceFactor: 1,
        angleFactor: 1,
        altitudeFactor: 1,
        localPosition
      };
    }

    const approach = normalize(localPosition);
    const cosine = clamp(dot(approach, direction), -1, 1);
    const angle = Math.acos(cosine);
    const halfAngle = (field.params.angleDegrees * Math.PI) / 360;
    const distanceFactor = clamp01(1 - distanceToObject / range);
    const angleFactor = clamp01(1 - angle / Math.max(0.0001, halfAngle));
    const raw = distanceFactor * angleFactor;
    const intensity = applyDistanceFalloff(raw, field);

    return {
      inside: distanceToObject <= range && angle <= halfAngle,
      intensity,
      distanceFactor,
      angleFactor,
      altitudeFactor: 1,
      localPosition
    };
  }

  if (field.shape === "ring") {
    const horizontalRadius = Math.sqrt(localPosition[0] ** 2 + localPosition[2] ** 2);
    const radialDistance = Math.abs(horizontalRadius - field.params.centerRadius);
    const radialFactor = clamp01(1 - radialDistance / Math.max(0.0001, field.params.thickness));
    const [minY, maxY] = field.params.heightRange;
    const centerY = (minY + maxY) / 2;
    const halfHeight = Math.max(0.0001, (maxY - minY) / 2);
    const altitudeFactor = clamp01(1 - Math.abs(localPosition[1] - centerY) / halfHeight);
    const raw = radialFactor * altitudeFactor;
    const intensity = applyDistanceFalloff(raw, field);

    return {
      inside: radialFactor > 0 && localPosition[1] >= minY && localPosition[1] <= maxY,
      intensity,
      distanceFactor: radialFactor,
      angleFactor: 1,
      altitudeFactor,
      radialFactor,
      localPosition
    };
  }

  return zeroOutput(localPosition);
}
