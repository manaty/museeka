import type { FreeFlyInput } from "../FreeFlyController";
import { createKeyboardListener, emptyInput } from "./keyboard";
import type { InputDriver, InputDriverContext } from "./InputDriver";

const SENSITIVITY = 0.0028;

export class PointerLockDriver implements InputDriver {
  private context: InputDriverContext | null = null;
  private readonly keyboard = createKeyboardListener();
  private lookDx = 0;
  private lookDy = 0;
  private locked = false;

  private handleMouseMove = (event: MouseEvent) => {
    if (!this.locked) return;
    this.lookDx += event.movementX * SENSITIVITY;
    this.lookDy -= event.movementY * SENSITIVITY;
  };

  private handlePointerLockChange = () => {
    this.locked = document.pointerLockElement === this.context?.canvas;
  };

  private handleCanvasClick = () => {
    if (!this.context) return;
    if (!this.locked) {
      void this.context.canvas.requestPointerLock?.();
    }
  };

  attach(context: InputDriverContext) {
    this.context = context;
    this.keyboard.attach();
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    context.canvas.addEventListener("click", this.handleCanvasClick);
  }

  detach() {
    if (!this.context) return;
    this.keyboard.detach();
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.context.canvas.removeEventListener("click", this.handleCanvasClick);
    if (document.pointerLockElement === this.context.canvas) {
      document.exitPointerLock?.();
    }
    this.locked = false;
    this.context = null;
  }

  consume(): FreeFlyInput {
    const kb = this.keyboard.state();
    // W follows the camera direction (look up + W → ascend), matching the
    // mobile joystick behaviour. Space/Ctrl provide additional pure vertical.
    const pitch = this.context?.getCameraDirection().pitch ?? 0;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const forwardHorizontal = kb.forward * cosP;
    const verticalFromForward = kb.forward * sinP;
    const input: FreeFlyInput = {
      forward: forwardHorizontal,
      right: kb.right,
      up: verticalFromForward + kb.up,
      lookDx: this.lookDx,
      lookDy: this.lookDy,
      targetPoint: null,
      sprint: kb.sprint
    };
    this.lookDx = 0;
    this.lookDy = 0;
    return this.locked
      ? input
      : { ...emptyInput(), forward: forwardHorizontal, right: kb.right, up: verticalFromForward + kb.up, sprint: kb.sprint };
  }

  needsUiHint(): string {
    return this.locked ? "hint_pointerlock_locked" : "hint_pointerlock_unlocked";
  }
}
