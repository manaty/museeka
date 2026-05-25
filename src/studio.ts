import "./styles.css";
import { mount } from "svelte";
import StudioApp from "./ui/StudioApp.svelte";

const target = document.getElementById("studio-app");

if (!target) {
  throw new Error("Missing #studio-app root element");
}

mount(StudioApp, { target });
