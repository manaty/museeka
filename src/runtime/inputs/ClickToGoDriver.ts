import type { FreeFlyInput } from "../FreeFlyController";
import type { Vec3 } from "../../core/types";
import type { InputDriver, InputDriverContext } from "./InputDriver";

type ButtonState = { up: boolean; down: boolean };

export class ClickToGoDriver implements InputDriver {
  private context: InputDriverContext | null = null;
  private targetPoint: Vec3 | null = null;
  private buttons: ButtonState = { up: false, down: false };

  private handleClick = (event: PointerEvent) => {
    if (!this.context) return;
    const rect = this.context.canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    const hit = this.context.raycastToTerrain(ndcX, ndcY);
    if (hit) {
      this.targetPoint = [hit[0], hit[1] + 10, hit[2]];
    }
  };

  attach(context: InputDriverContext) {
    this.context = context;
    context.canvas.addEventListener("pointerdown", this.handleClick);
  }

  detach() {
    if (!this.context) return;
    this.context.canvas.removeEventListener("pointerdown", this.handleClick);
    this.context = null;
  }

  setVerticalButton(direction: "up" | "down", pressed: boolean) {
    this.buttons[direction] = pressed;
  }

  consume(): FreeFlyInput {
    const target = this.targetPoint;
    this.targetPoint = null;
    return {
      forward: 0,
      right: 0,
      up: this.buttons.up ? 1 : this.buttons.down ? -1 : 0,
      lookDx: 0,
      lookDy: 0,
      targetPoint: target,
      sprint: false
    };
  }

  needsUiHint(): string {
    return "Clique sur l'île pour t'y rendre · ▲/▼ pour monter/descendre";
  }
}
