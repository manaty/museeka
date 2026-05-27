<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import { AudioEngine } from "../../audio/AudioEngine";
  import type { InstrumentId, SoundObject } from "../../core/types";

  // Built-in instrument catalogue shown in the editor.
  const INSTRUMENTS: Array<{
    id: InstrumentId;
    label: string;
    color: string;
    sampleNote: string;
    description: string;
  }> = [
    { id: "glass_bell", label: "Glass Bell", color: "#ffd770", sampleNote: "C5", description: "Cloches cristallines aiguës." },
    { id: "warm_pad",   label: "Warm Pad",   color: "#a4b0ff", sampleNote: "A3", description: "Nappe enveloppante et ronde." },
    { id: "flute",      label: "Flute",      color: "#9be9ff", sampleNote: "G5", description: "Souffle aérien et chantant." },
    { id: "woodblock",  label: "Woodblock",  color: "#f6c98f", sampleNote: "C4", description: "Bois percussif sec." },
    { id: "low_pad",    label: "Low Pad",    color: "#b89dff", sampleNote: "F2", description: "Pad grave et profond." },
    { id: "pluck",      label: "Pluck",      color: "#8ff0d2", sampleNote: "E4", description: "Pincé léger, court attaque." },
    { id: "crystal",    label: "Crystal",    color: "#d2d7ff", sampleNote: "B4", description: "Tintement aérien." },
    { id: "piano",      label: "Piano",      color: "#ecd9b5", sampleNote: "C4", description: "Piano acoustique sample." },
    { id: "violin",     label: "Violin",     color: "#ff9a5a", sampleNote: "A4", description: "Cordes aiguës chantantes." },
    { id: "cello",      label: "Cello",      color: "#c97746", sampleNote: "C3", description: "Cordes graves chaleureuses." }
  ];

  let engine: AudioEngine | null = null;
  let loadedPercent = 0;
  let ready = false;
  let activeId: InstrumentId | null = null;
  let error = "";

  onMount(async () => {
    try {
      engine = new AudioEngine();
      await engine.start();
      await engine.prepareSamples((progress) => {
        loadedPercent = progress.percent;
        ready = progress.ready;
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  });

  onDestroy(() => engine?.dispose());

  function previewObject(instrument: InstrumentId, note: string): SoundObject {
    return {
      id: `preview_${instrument}_${note}`,
      kind: "preview",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      field: { shape: "sphere", params: { radius: 3 }, falloff: { distance: { type: "linear" } } },
      trigger: { mode: "peak", threshold: 0.4, cooldown: 0.1, retrigger: true },
      audio: { generator: "note", instrument, baseNote: note, duration: 1.2, velocity: 0.9 },
      mappings: [],
      visual: { model: "crystal", color: "#fff1a8", activeGlow: false }
    };
  }

  async function play(id: InstrumentId, note: string) {
    if (!engine || !ready) return;
    activeId = id;
    try {
      engine.triggerPreview(previewObject(id, note));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    setTimeout(() => {
      if (activeId === id) activeId = null;
    }, 600);
  }
</script>

<section class="instruments-editor">
  <header>
    <h1>{t("studio_instruments_title")}</h1>
    <p class="lead">{t("studio_instruments_desc")}</p>
    {#if !ready && !error}
      <p class="loading">{t("loading_samples")} · {loadedPercent}%</p>
    {/if}
    {#if error}
      <p class="error">{error}</p>
    {/if}
  </header>

  <div class="instrument-grid">
    {#each INSTRUMENTS as ins}
      <div class="instrument-card" style="--accent: {ins.color}" class:active={activeId === ins.id}>
        <span class="swatch" style="background: {ins.color}"></span>
        <div class="meta">
          <h3>{ins.label}</h3>
          <p class="id">{ins.id}</p>
          <p class="desc">{ins.description}</p>
        </div>
        <button class="preview" on:click={() => play(ins.id, ins.sampleNote)} disabled={!ready}>
          ▶ {ins.sampleNote}
        </button>
      </div>
    {/each}
  </div>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
