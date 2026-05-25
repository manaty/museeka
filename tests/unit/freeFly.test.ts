import { describe, expect, it } from "vitest";
import { FreeFlyController } from "../../src/runtime/FreeFlyController";

describe("FreeFlyController", () => {
  it("moves forward toward decreasing Z when yaw=0 and forward=1", () => {
    const ctrl = new FreeFlyController();
    ctrl.initialize([0, 10, 0], 0, 0);
    let state = ctrl.update(0.05, { forward: 1, right: 0, up: 0, lookDx: 0, lookDy: 0, targetPoint: null, sprint: false });
    // Run a few frames to escape damping ramp
    for (let i = 0; i < 30; i += 1) {
      state = ctrl.update(0.05, { forward: 1, right: 0, up: 0, lookDx: 0, lookDy: 0, targetPoint: null, sprint: false });
    }
    expect(state.position[2]).toBeLessThan(0);
    expect(Math.abs(state.position[0])).toBeLessThan(0.5);
  });

  it("strafes right toward increasing X when right=1", () => {
    const ctrl = new FreeFlyController();
    ctrl.initialize([0, 10, 0], 0, 0);
    let state = ctrl.update(0.05, { forward: 0, right: 1, up: 0, lookDx: 0, lookDy: 0, targetPoint: null, sprint: false });
    for (let i = 0; i < 30; i += 1) {
      state = ctrl.update(0.05, { forward: 0, right: 1, up: 0, lookDx: 0, lookDy: 0, targetPoint: null, sprint: false });
    }
    expect(state.position[0]).toBeGreaterThan(0);
  });

  it("clamps pitch between ±π/2", () => {
    const ctrl = new FreeFlyController();
    ctrl.initialize([0, 10, 0], 0, 0);
    for (let i = 0; i < 100; i += 1) {
      ctrl.update(0.016, { forward: 0, right: 0, up: 0, lookDx: 0, lookDy: 0.5, targetPoint: null, sprint: false });
    }
    expect(ctrl.getPitch()).toBeLessThan(Math.PI * 0.49);
    expect(ctrl.getPitch()).toBeGreaterThan(-Math.PI * 0.49);
  });

  it("flies toward a target point and arrives within radius", () => {
    const ctrl = new FreeFlyController();
    ctrl.initialize([0, 10, 0], 0, 0);
    ctrl.update(0.016, { forward: 0, right: 0, up: 0, lookDx: 0, lookDy: 0, targetPoint: [20, 10, -20], sprint: false });
    let state;
    for (let i = 0; i < 600; i += 1) {
      state = ctrl.update(0.016, { forward: 0, right: 0, up: 0, lookDx: 0, lookDy: 0, targetPoint: null, sprint: false });
    }
    if (!state) throw new Error("no state");
    const dist = Math.hypot(state.position[0] - 20, state.position[2] - (-20));
    expect(dist).toBeLessThan(3);
  });

  it("never lets the player fall below the minimum altitude", () => {
    const ctrl = new FreeFlyController();
    ctrl.initialize([0, 5, 0], 0, 0);
    let state;
    for (let i = 0; i < 200; i += 1) {
      state = ctrl.update(0.05, { forward: 0, right: 0, up: -1, lookDx: 0, lookDy: 0, targetPoint: null, sprint: true });
    }
    if (!state) throw new Error("no state");
    expect(state.position[1]).toBeGreaterThanOrEqual(2);
  });
});
