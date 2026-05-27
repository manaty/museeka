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
  let loadingMessage = "Chargement des instruments";
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
          loadingMessage = progress.ready ? "Instruments prêts" : `Chargement des instruments ${progress.loaded}/${progress.total}`;
        })
        .catch((caught) => {
          error = caught instanceof Error ? caught.message : String(caught);
        });
      loop(lastTime);
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
    if (!runtime || !samplesReady) return;
    await runtime.unlockAudio();
    runtime.setPlaying(true);
    started = true;
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
    <section class="start-screen">
      <div>
        <p class="kicker">Museeka</p>
        <h1>Une île-instrument</h1>
        <div class="load-block" aria-label="Chargement audio">
          <div class="progress-track">
            <div class="progress-fill" style={`width: ${sampleProgress}%`}></div>
          </div>
          <span>{loadingMessage} · {sampleProgress}%</span>
        </div>
        <button class="primary" on:click={start} disabled={!samplesReady} data-testid="start-button">
          {samplesReady ? "Start Museeka" : "Loading samples"}
        </button>
      </div>
    </section>
  {/if}

  {#if scene && runtime && samplesReady}
    <section class="hud" class:collapsed={hudCollapsed} aria-label="Contrôles Museeka">
      <button class="hud-toggle" on:click={() => (hudCollapsed = !hudCollapsed)} aria-label={hudCollapsed ? "Déployer le menu" : "Replier le menu"} data-testid="hud-toggle">
        {hudCollapsed ? "≡" : "×"}
      </button>

      <div class="brand">
        <span>Museeka</span>
        <small>{mode === "freefly" ? "Mode libre" : scene.paths.find((path) => path.id === selectedPathId)?.name}</small>
      </div>

      <div class="mode-switch">
        <button class:active={mode === "path"} on:click={exitFreeFly} data-testid="mode-path">Parcours</button>
        <button class:active={mode === "freefly"} on:click={enterFreeFly} data-testid="mode-freefly">Vol libre</button>
      </div>

      {#if mode === "path"}
        <label>
          Parcours
          <select bind:value={selectedPathId} on:change={changePath} data-testid="path-select">
            {#each scene.paths as path}
              <option value={path.id}>{path.name}</option>
            {/each}
          </select>
        </label>

        <div class="button-row">
          <button on:click={togglePlay} disabled={!started}>{snapshot?.playing ? "Pause" : "Play"}</button>
          <button on:click={restart} disabled={!started}>Restart</button>
        </div>

        <label>
          Vitesse
          <input type="range" min="0.35" max="2" step="0.05" bind:value={speed} on:input={changeSpeed} />
        </label>
      {:else}
        <label>
          Contrôles
          <select bind:value={driverKey} on:change={changeDriver} data-testid="driver-select">
            <option value="pointerlock">Souris + clavier (FPS)</option>
            <option value="drag">Clic-glisser + clavier</option>
            <option value="joystick">Joysticks tactiles</option>
            <option value="click">Tap-pour-aller</option>
          </select>
        </label>

        {#if driverKey === "click"}
          <div class="vertical-pad">
            <button on:pointerdown={() => holdVerticalButton("up", true)} on:pointerup={() => holdVerticalButton("up", false)} on:pointerleave={() => holdVerticalButton("up", false)}>▲</button>
            <button on:pointerdown={() => holdVerticalButton("down", true)} on:pointerup={() => holdVerticalButton("down", false)} on:pointerleave={() => holdVerticalButton("down", false)}>▼</button>
          </div>
        {/if}

        {#if driverHint}
          <p class="driver-hint" data-testid="driver-hint">{driverHint}</p>
        {/if}
      {/if}

      <label>
        Volume
        <input type="range" min="0" max="1" step="0.01" bind:value={volume} on:input={changeVolume} />
      </label>

      <label class="inline">
        <input type="checkbox" bind:checked={debug} on:change={changeDebug} data-testid="debug-toggle" />
        Debug
      </label>

      <div class="hud-links">
        <a href="studio/" data-testid="studio-link">Ouvrir le Studio →</a>
        <a href="https://github.com/manaty/museeka" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
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
