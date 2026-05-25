import type { Curve } from "./types";
import { clamp, clamp01 } from "./vec3";

export function smoothstep(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

export function smootherstep(x: number): number {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function gaussian(x: number, center: number, sigma: number): number {
  const safeSigma = Math.max(0.0001, sigma);
  const z = (x - center) / safeSigma;
  return Math.exp(-0.5 * z * z);
}

export function applyCurve(x: number, curve: Curve): number {
  const t = clamp01(x);

  switch (curve.type) {
    case "linear":
      return t;
    case "smoothstep":
      return smoothstep(t);
    case "smootherstep":
      return smootherstep(t);
    case "exponential":
      return Math.pow(t, Math.max(0.001, curve.k));
    case "gaussian":
      return clamp01(gaussian(t, curve.center, curve.sigma));
    case "threshold":
      return t >= curve.threshold ? 1 : 0;
    case "plateau": {
      if (t <= curve.inner) {
        return 0;
      }
      if (t >= curve.outer) {
        return 1;
      }
      return smoothstep(clamp((t - curve.inner) / Math.max(0.0001, curve.outer - curve.inner), 0, 1));
    }
  }
}

export function remap(value: number, input: [number, number], output: [number, number]): number {
  const [inMin, inMax] = input;
  const [outMin, outMax] = output;
  const t = inMax === inMin ? 0 : clamp01((value - inMin) / (inMax - inMin));
  return outMin + (outMax - outMin) * t;
}
