<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import { MuseekaRenderer } from "../../graphics/MuseekaRenderer";
  import type { IslandScene } from "../../core/types";
  import type { RuntimeSnapshot } from "../../runtime/MuseekaRuntime";

  const STORAGE_KEY = "museeka.studio.scenePreset.v1";

  // Editable terrain params.
  let radius = 96;
  let heightScale = 10;
  let seed = 12345;

  let host: HTMLDivElement;
  let renderer: MuseekaRenderer | null = null;
  let frame = 0;
  let lastTime = performance.now();

  onMount(async () => {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        radius = saved.radius ?? radius;
        heightScale = saved.heightScale ?? heightScale;
        seed = saved.seed ?? seed;
      } catch {
        // ignore
      }
    }
    await tick();
    mountRenderer();
    lastTime = performance.now();
    frame = requestAnimationFrame(loop);
  });

  onDestroy(() => {
    cancelAnimationFrame(frame);
    renderer?.dispose();
  });

  function buildScene(): IslandScene {
    return {
      version: "0.1",
      meta: { name: "scene-preview", author: "studio", description: "" },
      terrain: { type: "simple_island", radius, heightScale, seed },
      paths: [{
        id: "preview",
        name: "preview",
        duration: 30,
        mode: "flying",
        speedScale: 1,
        constraints: { maxSpeed: 26, maxAcceleration: 18, maxCurvature: 1.6, minGroundClearance: 1.5, maxGroundClearance: 60 },
        points: [
          { t: 0, p: [-radius * 0.4, 20, -radius * 0.4] },
          { t: 30, p: [radius * 0.4, 20, radius * 0.4] }
        ],
        interpolation: "catmull-rom"
      }],
      soundObjects: [],
      visualObjects: [],
      settings: { defaultPathId: "preview", audio: { masterVolume: 0.5, maxActiveVoices: 8 } }
    };
  }

  function mountRenderer() {
    if (!host) return;
    renderer?.dispose();
    renderer = new MuseekaRenderer(host, buildScene());
    renderer.setIntroCamera(true); // orbital sweep
  }

  function previewSnapshot(): RuntimeSnapshot {
    return {
      time: 0,
      duration: 30,
      playing: false,
      mode: "path",
      player: { time: 0, pathId: "preview", position: [0, 20, 0], previousPosition: [0, 20, 0], velocity: [0, 0, 0], speed: 0 },
      activeObjects: [],
      recentTriggers: [],
      encounters: []
    };
  }

  function loop(now: number) {
    lastTime = now;
    if (renderer) renderer.render(previewSnapshot());
    frame = requestAnimationFrame(loop);
  }

  function rebuild() {
    mountRenderer();
    persist();
  }

  function persist() {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ radius, heightScale, seed }));
  }

  function randomSeed() {
    seed = Math.floor(Math.random() * 999999);
    rebuild();
  }

  function reset() {
    radius = 96;
    heightScale = 10;
    seed = 12345;
    rebuild();
  }
</script>

<section class="scene-editor">
  <header>
    <h1>{t("studio_scene_title")}</h1>
    <p class="lead">{t("studio_scene_desc")}</p>
  </header>

  <div class="scene-editor-grid">
    <div class="scene-preview" bind:this={host}></div>
    <div class="scene-controls">
      <label>
        Rayon de l'île ({radius} m)
        <input type="range" min="40" max="160" step="1" bind:value={radius} on:change={rebuild} />
      </label>
      <label>
        Échelle verticale ({heightScale.toFixed(1)})
        <input type="range" min="0" max="20" step="0.5" bind:value={heightScale} on:change={rebuild} />
      </label>
      <label>
        Seed
        <input type="number" bind:value={seed} on:change={rebuild} />
      </label>
      <div class="row">
        <button on:click={randomSeed}>🎲 Nouveau seed</button>
        <button on:click={reset}>Réinitialiser</button>
      </div>
      <p class="hint">Les paramètres sont sauvegardés localement et seront utilisés par l'éditeur Musique.</p>
    </div>
  </div>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
