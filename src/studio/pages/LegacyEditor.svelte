<script lang="ts">
  /* Wraps the original monolithic StudioApp so the previous workflow stays
   * available during the v2 transition. Will be dismantled in phase 2. */
  import LegacyStudio from "../../ui/StudioApp.svelte";
</script>

<LegacyStudio />
