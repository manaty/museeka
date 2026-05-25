export function clampVelocity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function velocityToGain(value: number) {
  const velocity = clampVelocity(value);
  if (velocity <= 0) return 0;
  return Math.min(1, 0.18 + Math.pow(velocity, 0.72) * 0.82);
}
