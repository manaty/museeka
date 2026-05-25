<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { loadScene } from "../data/loadScene";
  import type { IslandScene } from "../core/types";
  import { MuseekaRenderer } from "../graphics/MuseekaRenderer";
  import { MuseekaRuntime, type RuntimeSnapshot } from "../runtime/MuseekaRuntime";

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
    renderer?.dispose();
    runtime?.dispose();
  });

  function loop(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (runtime && renderer) {
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
    <section class="hud" aria-label="Contrôles Museeka">
      <div class="brand">
        <span>Museeka</span>
        <small>{scene.paths.find((path) => path.id === selectedPathId)?.name}</small>
      </div>

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
        <b>{snapshot.time.toFixed(1)} / {snapshot.duration.toFixed(1)}s</b>
        <span>position {snapshot.player.position.map((value) => value.toFixed(1)).join(", ")}</span>
        <span>vitesse {snapshot.player.speed.toFixed(2)}</span>
        <span>objets actifs {snapshot.activeObjects.length}</span>
        <span>{snapshot.recentTriggers.slice(0, 3).join(" · ")}</span>
      </aside>
    {/if}
  {/if}
</main>
