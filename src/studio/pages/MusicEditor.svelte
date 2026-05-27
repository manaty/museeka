<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import { listMidis, getMidi, type StoredMidi } from "../storage";
  import { MuseekaRenderer } from "../../graphics/MuseekaRenderer";
  import { MuseekaRuntime, type RuntimeSnapshot } from "../../runtime/MuseekaRuntime";
  import { generateSceneFromScores } from "../../generation/sceneGenerator";
  import type { FoldingPlan, IslandScene, MusicScore, SoundObject } from "../../core/types";

  let midis: StoredMidi[] = [];
  let selectedMidiId: string | null = null;
  let seed = 12345;
  let scene: IslandScene | null = null;
  let plan: FoldingPlan | null = null;
  let runtime: MuseekaRuntime | null = null;
  let renderer: MuseekaRenderer | null = null;
  let snapshot: RuntimeSnapshot | null = null;
  let host: HTMLDivElement;
  let frame = 0;
  let lastTime = performance.now();
  let busy = false;
  let error = "";
  let samplePercent = 0;
  let samplesReady = false;
  let selectedObjectId: string | null = null;

  onMount(() => {
    midis = listMidis();
    if (midis.length > 0) selectedMidiId = midis[0].id;
  });

  onDestroy(() => {
    cancelAnimationFrame(frame);
    renderer?.dispose();
    runtime?.dispose();
  });

  async function generate() {
    if (!selectedMidiId) return;
    const entry = getMidi(selectedMidiId);
    if (!entry) return;
    busy = true;
    error = "";
    try {
      const score: MusicScore = { ...entry.score, id: `path_${entry.id}`, name: entry.score.name || entry.fileName };
      const result = generateSceneFromScores([score], seed);
      scene = result.scene;
      plan = result.plans[0] ?? null;
      await tick();
      await mountRuntime();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }

  async function mountRuntime() {
    if (!scene || !host) return;
    cancelAnimationFrame(frame);
    renderer?.dispose();
    runtime?.dispose();
    samplePercent = 0;
    samplesReady = false;
    runtime = new MuseekaRuntime(scene);
    renderer = new MuseekaRenderer(host, scene);
    renderer.setIntroCamera(false);
    void runtime.prepareAudioSamples((p) => {
      samplePercent = p.percent;
      samplesReady = p.ready;
    }).catch((caught) => (error = caught instanceof Error ? caught.message : String(caught)));
    lastTime = performance.now();
    loop(lastTime);
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (runtime && renderer) {
      snapshot = runtime.update(dt);
      renderer.render(snapshot);
    }
    frame = requestAnimationFrame(loop);
  }

  function play() {
    runtime?.setPlaying(!(snapshot?.playing ?? false));
  }
  function restart() {
    runtime?.restart();
    runtime?.setPlaying(true);
  }

  function selectObject(id: string) {
    selectedObjectId = id;
  }

  $: midiInLibrary = midis.find((m) => m.id === selectedMidiId) ?? null;
  $: selectedObject = scene && selectedObjectId ? scene.soundObjects.find((o) => o.id === selectedObjectId) ?? null : null;
  $: noteAnchors = scene ? scene.soundObjects.filter((o) => o.id.startsWith("note_")) : [];
  $: aggregates = scene ? scene.soundObjects.filter((o) => o.id.startsWith("aggregate_")) : [];

  function deleteObject(id: string) {
    if (!scene) return;
    scene = { ...scene, soundObjects: scene.soundObjects.filter((o) => o.id !== id) };
    if (selectedObjectId === id) selectedObjectId = null;
    void mountRuntime();
  }

  function moveSelected(axis: 0 | 1 | 2, delta: number) {
    if (!scene || !selectedObject) return;
    const p = selectedObject.transform.position;
    const next: [number, number, number] = [p[0], p[1], p[2]];
    next[axis] = +(next[axis] + delta).toFixed(2);
    const updated: SoundObject = {
      ...selectedObject,
      transform: { ...selectedObject.transform, position: next }
    };
    scene = {
      ...scene,
      soundObjects: scene.soundObjects.map((o) => (o.id === updated.id ? updated : o))
    };
    selectedObjectId = updated.id;
    void mountRuntime();
  }
</script>

<section class="music-editor">
  <header>
    <h1>{t("studio_music_title")}</h1>
    <p class="lead">{t("studio_music_desc")}</p>
  </header>

  <div class="music-toolbar">
    <label>
      MIDI
      <select bind:value={selectedMidiId} on:change={() => { scene = null; plan = null; }}>
        {#if midis.length === 0}
          <option value={null}>— Aucun MIDI en bibliothèque —</option>
        {/if}
        {#each midis as midi}
          <option value={midi.id}>{midi.score.name || midi.fileName}</option>
        {/each}
      </select>
    </label>
    <label class="seed">
      Seed
      <input type="number" bind:value={seed} />
    </label>
    <button class="primary" on:click={generate} disabled={!selectedMidiId || busy}>
      {busy ? "Génération…" : "Spatialiser"}
    </button>
    {#if error}<span class="error">{error}</span>{/if}
  </div>

  {#if midis.length === 0}
    <p class="hint">
      Importe d'abord un MIDI dans
      <button class="inline-link" on:click={() => navigate("midi")}>l'éditeur MIDI</button>.
    </p>
  {/if}

  {#if scene}
    <div class="music-grid">
      <div class="music-preview" bind:this={host}></div>
      <aside class="music-side">
        <div class="play-row">
          <button on:click={play}>{snapshot?.playing ? "⏸ Pause" : "▶ Play"}</button>
          <button on:click={restart}>↻ Restart</button>
          {#if !samplesReady}
            <span class="info">Samples · {samplePercent}%</span>
          {/if}
        </div>
        {#if snapshot}
          <p class="time">{snapshot.time.toFixed(1)} / {snapshot.duration.toFixed(1)} s</p>
        {/if}

        {#if plan?.analysis}
          <div class="accuracy">
            <span class="label">Accuracy</span>
            <span class="value">{(plan.analysis.accuracy * 100).toFixed(1)}%</span>
            <span class="sub">{plan.analysis.counts.matched}/{plan.analysis.counts.expected} matched · {plan.analysis.counts.extra} extras</span>
          </div>
        {/if}

        <details open>
          <summary>Ancres ({noteAnchors.length})</summary>
          <ul class="object-list">
            {#each noteAnchors as obj}
              <li class:active={obj.id === selectedObjectId}>
                <button on:click={() => selectObject(obj.id)}>{obj.id}</button>
              </li>
            {/each}
          </ul>
        </details>

        <details>
          <summary>Agrégats ({aggregates.length})</summary>
          <ul class="object-list">
            {#each aggregates as obj}
              <li class:active={obj.id === selectedObjectId}>
                <button on:click={() => selectObject(obj.id)}>{obj.id}</button>
              </li>
            {/each}
          </ul>
        </details>

        {#if selectedObject}
          <div class="object-inspector">
            <h3>Objet sélectionné</h3>
            <p class="id">{selectedObject.id}</p>
            <p class="pos">
              x: {selectedObject.transform.position[0].toFixed(1)},
              y: {selectedObject.transform.position[1].toFixed(1)},
              z: {selectedObject.transform.position[2].toFixed(1)}
            </p>
            <div class="nudge">
              <span>X</span>
              <button on:click={() => moveSelected(0, -1)}>−</button>
              <button on:click={() => moveSelected(0, +1)}>+</button>
              <span>Y</span>
              <button on:click={() => moveSelected(1, -1)}>−</button>
              <button on:click={() => moveSelected(1, +1)}>+</button>
              <span>Z</span>
              <button on:click={() => moveSelected(2, -1)}>−</button>
              <button on:click={() => moveSelected(2, +1)}>+</button>
            </div>
            <button class="danger" on:click={() => deleteObject(selectedObject.id)}>Supprimer</button>
          </div>
        {/if}
      </aside>
    </div>
  {/if}

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
