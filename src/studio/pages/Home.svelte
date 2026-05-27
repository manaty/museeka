<script lang="ts">
  import { t, type StringKey } from "../../ui/i18n";
  import { navigate, type Route } from "../router";

  type Card = {
    route: Route;
    titleKey: StringKey;
    descKey: StringKey;
    color: string;
    icon: string; // inline SVG path inside <svg viewBox="0 0 24 24">
  };

  const cards: Card[] = [
    {
      route: "midi",
      titleKey: "studio_midi_title",
      descKey: "studio_midi_desc",
      color: "#ffd770",
      // Note + bars
      icon: '<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />'
    },
    {
      route: "scene",
      titleKey: "studio_scene_title",
      descKey: "studio_scene_desc",
      color: "#9be9ff",
      // Mountains over ground
      icon: '<path d="M3 20l5-8 4 5 3-3 6 6Z" /><path d="M3 20h18" />'
    },
    {
      route: "instruments",
      titleKey: "studio_instruments_title",
      descKey: "studio_instruments_desc",
      color: "#ff9a5a",
      // Guitar-like silhouette
      icon: '<path d="M14 4l6 6-2 2-1-1-2 2 1 1-2 2-6-6 2-2 1 1 2-2-1-1Z" /><circle cx="8" cy="16" r="3" />'
    },
    {
      route: "objects",
      titleKey: "studio_objects_title",
      descKey: "studio_objects_desc",
      color: "#a4b0ff",
      // Cube + sphere
      icon: '<path d="M4 8l5-3 5 3v6l-5 3-5-3Z" /><circle cx="17" cy="16" r="4" />'
    },
    {
      route: "music",
      titleKey: "studio_music_title",
      descKey: "studio_music_desc",
      color: "#8ff0d2",
      // Sphere with orbit (parcours)
      icon: '<ellipse cx="12" cy="12" rx="9" ry="4" /><circle cx="12" cy="12" r="3" />'
    }
  ];
</script>

<section class="studio-home">
  <div class="hero">
    <h1>{t("studio_title")}</h1>
    <p>{t("studio_subtitle")}</p>
  </div>

  <div class="studio-cards">
    {#each cards as card}
      <button
        class="studio-card"
        style="--accent: {card.color}"
        on:click={() => navigate(card.route)}
        data-testid={`studio-card-${card.route}`}
      >
        <div class="icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            {@html card.icon}
          </svg>
        </div>
        <h3>{t(card.titleKey)}</h3>
        <p>{t(card.descKey)}</p>
      </button>
    {/each}
  </div>

  <a class="legacy-link" href="#/legacy" on:click|preventDefault={() => navigate("legacy")}>
    {t("studio_legacy_link")}
  </a>
</section>
