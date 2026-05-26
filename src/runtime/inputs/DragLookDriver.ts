import type { FreeFlyInput } from "../FreeFlyController";
import { createKeyboardListener } from "./keyboard";
import type { InputDriver, InputDriverContext } from "./InputDriver";

const SENSITIVITY = 0.005;

export class DragLookDriver implements InputDriver {
  private context: InputDriverContext | null = null;
  private readonly keyboard = createKeyboardListener();
  private lookDx = 0;
  private lookDy = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private handlePointerDown = (event: PointerEvent) => {
    if (!this.context || event.button !== 0) return;
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.context.canvas.setPointerCapture?.(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lookDx += dx * SENSITIVITY;
    this.lookDy -= dy * SENSITIVITY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (!this.context) return;
    this.dragging = false;
    try {
      this.context.canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  };

  attach(context: InputDriverContext) {
    this.context = context;
    this.keyboard.attach();
    context.canvas.addEventListener("pointerdown", this.handlePointerDown);
    context.canvas.addEventListener("pointermove", this.handlePointerMove);
    context.canvas.addEventListener("pointerup", this.handlePointerUp);
    context.canvas.addEventListener("pointercancel", this.handlePointerUp);
  }

  detach() {
    if (!this.context) return;
    this.keyboard.detach();
    this.context.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.context.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.context.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.context.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.dragging = false;
    this.context = null;
  }

  consume(): FreeFlyInput {
    const kb = this.keyboard.state();
    // W follows the camera direction (look up + W → ascend), matching the
    // mobile joystick behaviour. Space/Ctrl provide additional pure vertical.
    const pitch = this.context?.getCameraDirection().pitch ?? 0;
    const forwardHorizontal = kb.forward * Math.cos(pitch);
    const verticalFromForward = kb.forward * Math.sin(pitch);
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
    return input;
  }

  needsUiHint(): string {
    return "Clique-glisse pour orienter · WASD/ZQSD : déplacer · Espace : monter · Ctrl : descendre";
  }
}
