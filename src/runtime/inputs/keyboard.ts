import type { FreeFlyInput } from "../FreeFlyController";

export type KeyboardState = {
  forward: number;
  right: number;
  up: number;
  sprint: boolean;
};

export function createKeyboardListener() {
  const keys = new Set<string>();
  let attached = false;

  const handleDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    keys.add(key);
    if ([" ", "shift"].includes(key) || key.startsWith("arrow")) {
      event.preventDefault();
    }
  };

  const handleUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };

  return {
    attach() {
      if (attached) return;
      window.addEventListener("keydown", handleDown);
      window.addEventListener("keyup", handleUp);
      window.addEventListener("blur", () => keys.clear());
      attached = true;
    },
    detach() {
      if (!attached) return;
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      keys.clear();
      attached = false;
    },
    state(): KeyboardState {
      let forward = 0;
      let right = 0;
      let up = 0;
      if (keys.has("w") || keys.has("z") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("d") || keys.has("arrowright")) right += 1;
      if (keys.has("a") || keys.has("q") || keys.has("arrowleft")) right -= 1;
      if (keys.has(" ")) up += 1;
      if (keys.has("control") || keys.has("c")) up -= 1;
      return { forward, right, up, sprint: keys.has("shift") };
    }
  };
}

export function emptyInput(): FreeFlyInput {
  return { forward: 0, right: 0, up: 0, lookDx: 0, lookDy: 0, targetPoint: null, sprint: false };
}
