import type { FreeFlyInput } from "../FreeFlyController";

export type InputDriverContext = {
  canvas: HTMLCanvasElement;
  getCameraDirection: () => { yaw: number; pitch: number };
  raycastToTerrain: (ndcX: number, ndcY: number) => [number, number, number] | null;
};

export interface InputDriver {
  attach(context: InputDriverContext): void;
  detach(): void;
  consume(): FreeFlyInput;
  needsUiHint(): string;
}
