import "./styles.css";
import { mount } from "svelte";
import StudioApp from "./studio/StudioApp.svelte";

const target = document.getElementById("studio-app");

if (!target) {
  throw new Error("Missing #studio-app root element");
}

// The shared stylesheet locks `body { overflow: hidden }` for the demo's
// full-screen 3D canvas. The Studio needs page scrolling.
document.body.style.overflow = "auto";

mount(StudioApp, { target });
