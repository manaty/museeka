<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import type { InstrumentId } from "../../core/types";

  type FieldShape = "sphere" | "ellipsoid" | "cone" | "ring";
  type VisualModel =
    | "flower"
    | "tree"
    | "rock"
    | "statue"
    | "arch"
    | "bird"
    | "crab"
    | "crystal";

  const INSTRUMENTS: InstrumentId[] = [
    "glass_bell", "warm_pad", "flute", "woodblock", "low_pad",
    "pluck", "crystal", "piano", "violin", "cello"
  ];

  const VISUALS: VisualModel[] = ["flower", "tree", "rock", "statue", "arch", "bird", "crab", "crystal"];

  const FIELDS: FieldShape[] = ["sphere", "ellipsoid", "cone", "ring"];

  type Preset = {
    id: string;
    name: string;
    visual: VisualModel;
    color: string;
    instrument: InstrumentId;
    field: FieldShape;
  };

  // Built-in presets (one per default instrument visual mapping).
  const BUILTIN_PRESETS: Preset[] = [
    { id: "b_flower",  name: "Glass Bell Flower",  visual: "flower",  color: "#ffd770", instrument: "glass_bell", field: "ellipsoid" },
    { id: "b_statue",  name: "Warm Pad Statue",    visual: "statue",  color: "#a4b0ff", instrument: "warm_pad",   field: "ellipsoid" },
    { id: "b_bird",    name: "Flute Bird",         visual: "bird",    color: "#9be9ff", instrument: "flute",      field: "ellipsoid" },
    { id: "b_rock",    name: "Woodblock Rock",     visual: "rock",    color: "#f6c98f", instrument: "woodblock",  field: "ellipsoid" },
    { id: "b_crystal", name: "Low Pad Crystal",    visual: "crystal", color: "#b89dff", instrument: "low_pad",    field: "ellipsoid" },
    { id: "b_tree",    name: "Pluck Tree",         visual: "tree",    color: "#8ff0d2", instrument: "pluck",      field: "ellipsoid" },
    { id: "b_arch",    name: "Piano Arch",         visual: "arch",    color: "#ecd9b5", instrument: "piano",      field: "ellipsoid" },
    { id: "b_violin",  name: "Violin Bird",        visual: "bird",    color: "#ff9a5a", instrument: "violin",     field: "ellipsoid" },
    { id: "b_cello",   name: "Cello Tree",         visual: "tree",    color: "#c97746", instrument: "cello",      field: "ellipsoid" }
  ];

  const STORAGE_KEY = "museeka.studio.objectPresets.v1";

  let customPresets: Preset[] = [];
  let editing: Preset = { id: "", name: "", visual: "flower", color: "#fff1a8", instrument: "glass_bell", field: "sphere" };
  let editingId: string | null = null;

  onMount(() => {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(STORAGE_KEY) : null;
    if (raw) {
      try {
        customPresets = JSON.parse(raw);
      } catch {
        customPresets = [];
      }
    }
  });

  function persist() {
    if (typeof window === "undefined") return;
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(customPresets));
  }

  function resetForm() {
    editing = { id: "", name: "", visual: "flower", color: "#fff1a8", instrument: "glass_bell", field: "sphere" };
    editingId = null;
  }

  function save() {
    if (!editing.name.trim()) return;
    if (editingId) {
      customPresets = customPresets.map((p) => (p.id === editingId ? { ...editing, id: editingId } : p));
    } else {
      const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      customPresets = [...customPresets, { ...editing, id }];
    }
    persist();
    resetForm();
  }

  function edit(preset: Preset) {
    editing = { ...preset };
    editingId = preset.id;
  }

  function remove(id: string) {
    customPresets = customPresets.filter((p) => p.id !== id);
    persist();
    if (editingId === id) resetForm();
  }
</script>

<section class="objects-editor">
  <header>
    <h1>{t("studio_objects_title")}</h1>
    <p class="lead">{t("studio_objects_desc")}</p>
  </header>

  <div class="preset-grid">
    <h2>Presets intégrés</h2>
    <div class="preset-cards">
      {#each BUILTIN_PRESETS as preset}
        <div class="preset-card builtin" style="--accent: {preset.color}">
          <span class="swatch" style="background: {preset.color}"></span>
          <div class="meta">
            <strong>{preset.name}</strong>
            <span class="line">{preset.visual} · {preset.instrument} · {preset.field}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="preset-grid">
    <h2>Mes presets</h2>
    {#if customPresets.length === 0}
      <p class="empty">Aucun preset personnalisé pour l'instant. Crée le premier ci-dessous.</p>
    {:else}
      <div class="preset-cards">
        {#each customPresets as preset}
          <div class="preset-card custom" style="--accent: {preset.color}">
            <span class="swatch" style="background: {preset.color}"></span>
            <div class="meta">
              <strong>{preset.name}</strong>
              <span class="line">{preset.visual} · {preset.instrument} · {preset.field}</span>
            </div>
            <div class="actions">
              <button on:click={() => edit(preset)}>Éditer</button>
              <button class="danger" on:click={() => remove(preset.id)}>×</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <form class="preset-form" on:submit|preventDefault={save}>
    <h2>{editingId ? "Modifier le preset" : "Nouveau preset"}</h2>
    <div class="form-row">
      <label>
        Nom
        <input type="text" bind:value={editing.name} placeholder="Mon preset" maxlength="40" required />
      </label>
      <label>
        Modèle
        <select bind:value={editing.visual}>
          {#each VISUALS as v}<option value={v}>{v}</option>{/each}
        </select>
      </label>
      <label>
        Couleur
        <input type="color" bind:value={editing.color} />
      </label>
      <label>
        Instrument
        <select bind:value={editing.instrument}>
          {#each INSTRUMENTS as i}<option value={i}>{i}</option>{/each}
        </select>
      </label>
      <label>
        Champ
        <select bind:value={editing.field}>
          {#each FIELDS as f}<option value={f}>{f}</option>{/each}
        </select>
      </label>
    </div>
    <div class="form-actions">
      <button type="submit" class="primary">{editingId ? "Mettre à jour" : "Ajouter"}</button>
      {#if editingId}<button type="button" on:click={resetForm}>Annuler</button>{/if}
    </div>
  </form>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
