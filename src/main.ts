import "./styles.css";
import { mount } from "svelte";
import DemoApp from "./ui/DemoApp.svelte";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Missing #app root element");
}

mount(DemoApp, { target });
