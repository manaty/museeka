<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { t, type StringKey, locale } from "../ui/i18n";
  import { navigate, readRoute, subscribe, type Route } from "./router";
  import Home from "./pages/Home.svelte";
  import MidiEditor from "./pages/MidiEditor.svelte";
  import SceneEditor from "./pages/SceneEditor.svelte";
  import InstrumentsEditor from "./pages/InstrumentsEditor.svelte";
  import ObjectsEditor from "./pages/ObjectsEditor.svelte";
  import MusicEditor from "./pages/MusicEditor.svelte";
  import LegacyEditor from "./pages/LegacyEditor.svelte";

  if (typeof document !== "undefined") document.documentElement.lang = locale;

  let route: Route = readRoute();
  let unsub: (() => void) | null = null;

  onMount(() => {
    unsub = subscribe((r) => (route = r));
  });

  onDestroy(() => unsub?.());

  const PAGES: Record<Route, typeof Home> = {
    home: Home,
    midi: MidiEditor,
    scene: SceneEditor,
    instruments: InstrumentsEditor,
    objects: ObjectsEditor,
    music: MusicEditor,
    legacy: LegacyEditor
  };

  const ROUTE_TITLES: Record<Route, StringKey | null> = {
    home: null,
    midi: "studio_midi_title",
    scene: "studio_scene_title",
    instruments: "studio_instruments_title",
    objects: "studio_objects_title",
    music: "studio_music_title",
    legacy: "studio_legacy_link"
  };

  $: currentPage = PAGES[route];
  $: pageTitleKey = ROUTE_TITLES[route];
</script>

<main class="studio-shell-v2" class:fullbleed={route === "legacy"}>
  <header class="studio-header">
    <a class="brand" href="#/" on:click|preventDefault={() => navigate("home")}>
      <span class="logo">●</span>
      {t("studio_title")}
    </a>
    {#if route !== "home"}
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="#/" on:click|preventDefault={() => navigate("home")}>{t("studio_title")}</a>
        <span class="sep">›</span>
        <span class="current">{pageTitleKey ? t(pageTitleKey) : ""}</span>
      </nav>
    {/if}
    <div class="header-right">
      <a class="demo-link" href="../">← Museeka</a>
    </div>
  </header>

  <div class="studio-main">
    <svelte:component this={currentPage} />
  </div>
</main>
