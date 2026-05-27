<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { loadScene } from "../data/loadScene";
  import type { IslandScene } from "../core/types";
  import { MuseekaRenderer } from "../graphics/MuseekaRenderer";
  import { MuseekaRuntime, type RuntimeMode, type RuntimeSnapshot } from "../runtime/MuseekaRuntime";
  import type { InputDriver } from "../runtime/inputs/InputDriver";
  import { PointerLockDriver } from "../runtime/inputs/PointerLockDriver";
  import { DragLookDriver } from "../runtime/inputs/DragLookDriver";
  import { ClickToGoDriver } from "../runtime/inputs/ClickToGoDriver";
  import { TouchJoystickDriver } from "../runtime/inputs/TouchJoystickDriver";
  import { t, locale, type StringKey } from "./i18n";

  // Set HTML lang so screen readers and CSS selectors get the right locale.
  if (typeof document !== "undefined") document.documentElement.lang = locale;

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Asset base for static URLs (matches Vite's BASE_URL).
  const baseUrl = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

  // 10 random firefly positions / delays / durations — generated once.
  const fireflies = Array.from({ length: 10 }, (_, i) => ({
    x: Math.round((i / 9) * 110 - 5 + (Math.random() - 0.5) * 8),
    delay: -Math.random() * 14,
    duration: 14 + Math.random() * 8,
    size: 6 + Math.random() * 4
  }));

  type DriverKey = "pointerlock" | "drag" | "click" | "joystick";

  function isTouchPrimary(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  }

  function isNarrowViewport(): boolean {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 900;
  }

  let host: HTMLDivElement;
  let scene: IslandScene | null = null;
  let runtime: MuseekaRuntime | null = null;
  let renderer: MuseekaRenderer | null = null;
  let snapshot: RuntimeSnapshot | null = null;
  let selectedPathId = "";
  let error = "";
  let started = false;
  let samplesReady = false;
  let sampleProgress = 0;
  let loadingMessage = t("loading_samples");
  let debug = false;
  let speed = 1;
  let volume = 0.78;
  let frame = 0;
  let lastTime = performance.now();
  let mode: RuntimeMode = "path";
  let driverKey: DriverKey = isTouchPrimary() ? "joystick" : "pointerlock";
  let activeDriver: InputDriver | null = null;
  let driverHint = "";
  let hudCollapsed = isNarrowViewport();
  let showSplash = !prefersReducedMotion;
  let startScreenFadingOut = false;

  onMount(async () => {
    try {
      scene = await loadScene();
      selectedPathId = scene.settings.defaultPathId;
      volume = scene.settings.audio.masterVolume;
      runtime = new MuseekaRuntime(scene);
      renderer = new MuseekaRenderer(host, scene);
      renderer.setDebug(debug);
      void runtime
        .prepareAudioSamples((progress) => {
          sampleProgress = progress.percent;
          samplesReady = progress.ready;
          loadingMessage = progress.ready ? t("samples_ready") : `${t("loading_samples")} ${progress.loaded}/${progress.total}`;
        })
        .catch((caught) => {
          error = caught instanceof Error ? caught.message : String(caught);
        });
      loop(lastTime);
      if (showSplash) setTimeout(() => (showSplash = false), 1850);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  });

  onDestroy(() => {
    cancelAnimationFrame(frame);
    detachDriver();
    renderer?.dispose();
    runtime?.dispose();
  });

  function loop(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (runtime && renderer) {
      if (mode === "freefly" && activeDriver) {
        runtime.setFreeFlyInput(activeDriver.consume());
        driverHint = activeDriver.needsUiHint();
      }
      snapshot = runtime.update(dt);
      renderer.render(snapshot);
    }

    frame = requestAnimationFrame(loop);
  }

  async function start() {
    if (!runtime || !samplesReady || startScreenFadingOut) return;
    await runtime.unlockAudio();
    runtime.setPlaying(true);
    // Hand the camera over from the orbital intro to gameplay-trail mode
    // (the renderer's existing smoothing lerps from the current intro
    // position into the trail target over ~1 s — no visible jump).
    renderer?.setIntroCamera(false);
    // Fade the start-screen out before swapping in the HUD.
    if (prefersReducedMotion) {
      started = true;
      return;
    }
    startScreenFadingOut = true;
    setTimeout(() => (started = true), 520);
  }

  function togglePlay() {
    if (!runtime || !snapshot) return;
    runtime.setPlaying(!snapshot.playing);
  }

  function restart() {
    runtime?.restart();
    runtime?.setPlaying(true);
  }

  function changePath() {
    runtime?.setPath(selectedPathId);
    renderer?.setSelectedPath(selectedPathId);
  }

  function changeSpeed() {
    runtime?.setSpeed(speed);
  }

  function changeVolume() {
    runtime?.setMasterVolume(volume);
  }

  function changeDebug() {
    renderer?.setDebug(debug);
  }

  function buildDriver(key: DriverKey): InputDriver {
    if (key === "drag") return new DragLookDriver();
    if (key === "click") return new ClickToGoDriver();
    if (key === "joystick") return new TouchJoystickDriver();
    return new PointerLockDriver();
  }

  function attachDriver() {
    if (!renderer || activeDriver) return;
    activeDriver = buildDriver(driverKey);
    activeDriver.attach({
      canvas: renderer.getCanvas(),
      getCameraDirection: () => ({ yaw: runtime?.freeFly.getYaw() ?? 0, pitch: runtime?.freeFly.getPitch() ?? 0 }),
      raycastToTerrain: (x, y) => renderer?.raycastToTerrain(x, y) ?? null
    });
    driverHint = activeDriver.needsUiHint();
  }

  function detachDriver() {
    activeDriver?.detach();
    activeDriver = null;
    driverHint = "";
  }

  function enterFreeFly() {
    if (!runtime) return;
    runtime.setMode("freefly");
    mode = "freefly";
    attachDriver();
  }

  function exitFreeFly() {
    if (!runtime) return;
    detachDriver();
    runtime.setMode("path");
    mode = "path";
  }

  function changeDriver() {
    if (mode !== "freefly") return;
    detachDriver();
    attachDriver();
  }

  function holdVerticalButton(direction: "up" | "down", pressed: boolean) {
    if (activeDriver instanceof ClickToGoDriver) {
      activeDriver.setVerticalButton(direction, pressed);
    }
  }
</script>

<main class="app-shell">
  <div class="canvas-host" bind:this={host} data-testid="demo-canvas-host"></div>

  {#if error}
    <section class="center-panel">
      <h1>Museeka</h1>
      <p>{error}</p>
    </section>
  {:else if !started}
    {#if showSplash}
      <section class="manaty-splash" aria-hidden="true">
        <img src="{baseUrl}images/manaty_games.png" alt={t("manaty_logo_alt")} />
        <div class="splash-progress" aria-label={t("loading_short")}>
          <div class="progress-track">
            <div class="progress-fill" style={`width: ${sampleProgress}%`}></div>
          </div>
          <span>{loadingMessage} · {sampleProgress}%</span>
        </div>
      </section>
    {/if}
    <section class="start-screen" class:fading-out={startScreenFadingOut} class:behind-splash={showSplash}>
      <div class="firefly-field" aria-hidden="true">
        {#each fireflies as ff}
          <span
            class="firefly"
            style="--x: {ff.x}vw; --delay: {ff.delay}s; --duration: {ff.duration}s; --size: {ff.size}px;"
          ></span>
        {/each}
      </div>
      <div class="intro-content">
        <p class="kicker">{t("brand")}</p>
        <h1>{t("app_subtitle")}</h1>
        <div class="load-block" aria-label={t("loading_short")}>
          <div class="progress-track">
            <div class="progress-fill" style={`width: ${sampleProgress}%`}></div>
          </div>
          <span>{loadingMessage} · {sampleProgress}%</span>
        </div>
        <button
          class="primary"
          class:breathing={samplesReady}
          on:click={start}
          disabled={!samplesReady}
          data-testid="start-button"
        >
          {samplesReady ? t("start_button") : t("start_button_wait")}
        </button>
      </div>
    </section>
  {/if}

  {#if scene && runtime && samplesReady && started}
    <section class="hud" class:collapsed={hudCollapsed} aria-label={t("brand")}>
      <button class="hud-toggle" on:click={() => (hudCollapsed = !hudCollapsed)} aria-label={hudCollapsed ? t("hud_expand") : t("hud_collapse")} data-testid="hud-toggle">
        {hudCollapsed ? "≡" : "×"}
      </button>

      <div class="brand">
        <span>{t("brand")}</span>
        <small>{mode === "freefly" ? t("mode_freefly_label") : scene.paths.find((path) => path.id === selectedPathId)?.name}</small>
      </div>

      <div class="mode-switch">
        <button class:active={mode === "path"} on:click={exitFreeFly} data-testid="mode-path">{t("mode_path")}</button>
        <button class:active={mode === "freefly"} on:click={enterFreeFly} data-testid="mode-freefly">{t("mode_freefly")}</button>
      </div>

      {#if mode === "path"}
        <label>
          {t("parcours_label")}
          <select bind:value={selectedPathId} on:change={changePath} data-testid="path-select">
            {#each scene.paths as path}
              <option value={path.id}>{path.name}</option>
            {/each}
          </select>
        </label>

        <div class="button-row">
          <button on:click={togglePlay} disabled={!started}>{snapshot?.playing ? t("pause") : t("play")}</button>
          <button on:click={restart} disabled={!started}>{t("restart")}</button>
        </div>

        <label>
          {t("speed")}
          <input type="range" min="0.35" max="2" step="0.05" bind:value={speed} on:input={changeSpeed} />
        </label>
      {:else}
        <label>
          {t("controls_label")}
          <select bind:value={driverKey} on:change={changeDriver} data-testid="driver-select">
            <option value="pointerlock">{t("driver_fps")}</option>
            <option value="drag">{t("driver_drag")}</option>
            <option value="joystick">{t("driver_joystick")}</option>
            <option value="click">{t("driver_click")}</option>
          </select>
        </label>

        {#if driverKey === "click"}
          <div class="vertical-pad">
            <button on:pointerdown={() => holdVerticalButton("up", true)} on:pointerup={() => holdVerticalButton("up", false)} on:pointerleave={() => holdVerticalButton("up", false)}>▲</button>
            <button on:pointerdown={() => holdVerticalButton("down", true)} on:pointerup={() => holdVerticalButton("down", false)} on:pointerleave={() => holdVerticalButton("down", false)}>▼</button>
          </div>
        {/if}

        {#if driverHint}
          <p class="driver-hint" data-testid="driver-hint">{t(driverHint as StringKey)}</p>
        {/if}
      {/if}

      <label>
        {t("volume")}
        <input type="range" min="0" max="1" step="0.01" bind:value={volume} on:input={changeVolume} />
      </label>

      <label class="inline">
        <input type="checkbox" bind:checked={debug} on:change={changeDebug} data-testid="debug-toggle" />
        {t("debug")}
      </label>

      <div class="hud-links">
        <a href="studio/" data-testid="studio-link">{t("open_studio")}</a>
        <a href="https://github.com/manaty/museeka" target="_blank" rel="noopener noreferrer">{t("github")}</a>
      </div>
    </section>

    {#if debug && snapshot}
      <aside class="debug-panel" data-testid="debug-panel">
        <b>{mode === "freefly" ? "vol libre" : `${snapshot.time.toFixed(1)} / ${snapshot.duration.toFixed(1)}s`}</b>
        <span>position {snapshot.player.position.map((value) => value.toFixed(1)).join(", ")}</span>
        <span>vitesse {snapshot.player.speed.toFixed(2)}</span>
        <span>objets actifs {snapshot.activeObjects.length}</span>
        <span>{snapshot.recentTriggers.slice(0, 3).join(" · ")}</span>
      </aside>
    {/if}
  {/if}
</main>
