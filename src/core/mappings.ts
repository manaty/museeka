import type { Encounter, Mapping, MappingInput } from "./types";
import { applyCurve } from "./curves";
import { clamp01, clamp } from "./vec3";

export function readMappingInput(encounter: Encounter, input: MappingInput): number {
  switch (input) {
    case "field.intensity":
      return encounter.field.intensity;
    case "field.distanceFactor":
      return encounter.field.distanceFactor;
    case "field.angleFactor":
      return encounter.field.angleFactor;
    case "field.altitudeFactor":
      return encounter.field.altitudeFactor;
    case "encounter.distance":
      return encounter.distance;
    case "encounter.approachSpeed":
      return encounter.approachSpeed;
    case "encounter.altitudeRelative":
      return encounter.altitudeRelative;
    case "encounter.tangentialSpeed":
      return encounter.tangentialSpeed;
  }
}

export function evaluateMapping(encounter: Encounter, mapping: Mapping): number {
  const raw = readMappingInput(encounter, mapping.input);
  const normalized = mapping.clampInput ? clamp((raw - mapping.clampInput[0]) / Math.max(0.0001, mapping.clampInput[1] - mapping.clampInput[0]), 0, 1) : clamp01(raw);
  const curved = applyCurve(normalized, mapping.curve);
  const [min, max] = mapping.range;
  return min + (max - min) * curved;
}
