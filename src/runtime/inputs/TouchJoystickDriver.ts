import type { FreeFlyInput } from "../FreeFlyController";
import type { InputDriver, InputDriverContext } from "./InputDriver";

const LOOK_RATE = 2.6;

type StickState = {
  pad: HTMLDivElement;
  knob: HTMLDivElement;
  pointerId: number;
  centerX: number;
  centerY: number;
  radius: number;
  x: number;
  y: number;
};

function createPad(side: "left" | "right"): { pad: HTMLDivElement; knob: HTMLDivElement } {
  const pad = document.createElement("div");
  pad.className = `joystick-pad joystick-${side}`;
  const knob = document.createElement("div");
  knob.className = "joystick-knob";
  pad.appendChild(knob);
  return { pad, knob };
}

export class TouchJoystickDriver implements InputDriver {
  private context: InputDriverContext | null = null;
  private left: StickState | null = null;
  private right: StickState | null = null;
  private lastConsumeTime = performance.now();

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.left || !this.right) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const padEl = target.closest(".joystick-pad");
    if (!padEl) return;
    const stick = padEl === this.left.pad ? this.left : padEl === this.right.pad ? this.right : null;
    if (!stick || stick.pointerId !== -1) return;
    const rect = stick.pad.getBoundingClientRect();
    stick.centerX = rect.left + rect.width / 2;
    stick.centerY = rect.top + rect.height / 2;
    stick.radius = rect.width / 2;
    stick.pointerId = event.pointerId;
    event.preventDefault();
    event.stopPropagation();
    this.updateStick(stick, event.clientX, event.clientY);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (this.left && event.pointerId === this.left.pointerId) {
      event.preventDefault();
      this.updateStick(this.left, event.clientX, event.clientY);
    } else if (this.right && event.pointerId === this.right.pointerId) {
      event.preventDefault();
      this.updateStick(this.right, event.clientX, event.clientY);
    }
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (this.left && event.pointerId === this.left.pointerId) {
      this.resetStick(this.left);
    } else if (this.right && event.pointerId === this.right.pointerId) {
      this.resetStick(this.right);
    }
  };

  private updateStick(stick: StickState, clientX: number, clientY: number) {
    const dx = clientX - stick.centerX;
    const dy = clientY - stick.centerY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, stick.radius);
    const nx = dist > 0 ? (dx / dist) * clamped : 0;
    const ny = dist > 0 ? (dy / dist) * clamped : 0;
    stick.knob.style.transform = `translate(${nx}px, ${ny}px)`;
    stick.x = stick.radius > 0 ? nx / stick.radius : 0;
    stick.y = stick.radius > 0 ? ny / stick.radius : 0;
  }

  private resetStick(stick: StickState) {
    stick.pointerId = -1;
    stick.x = 0;
    stick.y = 0;
    stick.knob.style.transform = "translate(0px, 0px)";
  }

  attach(context: InputDriverContext) {
    this.context = context;
    const leftCreated = createPad("left");
    const rightCreated = createPad("right");
    this.left = { pad: leftCreated.pad, knob: leftCreated.knob, pointerId: -1, centerX: 0, centerY: 0, radius: 0, x: 0, y: 0 };
    this.right = { pad: rightCreated.pad, knob: rightCreated.knob, pointerId: -1, centerX: 0, centerY: 0, radius: 0, x: 0, y: 0 };

    document.body.appendChild(this.left.pad);
    document.body.appendChild(this.right.pad);

    document.addEventListener("pointerdown", this.handlePointerDown);
    document.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("pointerup", this.handlePointerUp);
    document.addEventListener("pointercancel", this.handlePointerUp);
  }

  detach() {
    document.removeEventListener("pointerdown", this.handlePointerDown);
    document.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("pointerup", this.handlePointerUp);
    document.removeEventListener("pointercancel", this.handlePointerUp);
    this.left?.pad.remove();
    this.right?.pad.remove();
    this.left = null;
    this.right = null;
    this.context = null;
  }

  consume(): FreeFlyInput {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastConsumeTime) / 1000);
    this.lastConsumeTime = now;

    const stickForward = this.left ? -this.left.y : 0;
    const stickRight = this.left ? this.left.x : 0;
    const lookDx = this.right ? this.right.x * LOOK_RATE * dt : 0;
    const lookDy = this.right ? -this.right.y * LOOK_RATE * dt : 0;

    // Forward follows the camera direction: looking up + push forward → ascend.
    const pitch = this.context?.getCameraDirection().pitch ?? 0;
    const forward = stickForward * Math.cos(pitch);
    const up = stickForward * Math.sin(pitch);
    return { forward, right: stickRight, up, lookDx, lookDy, targetPoint: null, sprint: false };
  }

  needsUiHint(): string {
    return "hint_joystick";
  }
}
