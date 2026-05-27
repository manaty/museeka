<script lang="ts">
  import { t, tList } from "../../ui/i18n";
  import { navigate } from "../router";
</script>

<section class="studio-placeholder">
  <header>
    <span class="tag">{t("studio_coming_soon")}</span>
    <h1>{t("studio_instruments_title")}</h1>
    <p class="lead">{t("studio_instruments_desc")}</p>
  </header>
  <div class="planned">
    <p>{t("studio_placeholder_intro")}</p>
    <ul>
      {#each tList("studio_instruments_planned") as item}
        <li>{item}</li>
      {/each}
    </ul>
  </div>
  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
