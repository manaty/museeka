<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import { parseMidiFile } from "../../music/midi";
  import { listAllMidis, saveMidi, deleteMidi, makeMidiId, type StoredMidi } from "../storage";
  import type { MusicEvent } from "../../core/types";

  let midis: StoredMidi[] = [];
  let selectedId: string | null = null;
  let importing = false;
  let error = "";

  onMount(async () => {
    midis = await listAllMidis();
    if (midis.length > 0 && !selectedId) selectedId = midis[0].id;
  });

  async function refresh() {
    midis = await listAllMidis();
  }

  async function onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;
    importing = true;
    error = "";
    try {
      for (const file of files) {
        const score = await parseMidiFile(file);
        const entry: StoredMidi = {
          id: makeMidiId(),
          fileName: file.name,
          importedAt: Date.now(),
          score
        };
        saveMidi(entry);
      }
      await refresh();
      if (!selectedId && midis.length > 0) selectedId = midis[0].id;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      importing = false;
      input.value = "";
    }
  }

  function selectMidi(id: string) {
    selectedId = id;
  }

  async function onDelete(id: string) {
    deleteMidi(id);
    await refresh();
    if (selectedId === id) selectedId = midis[0]?.id ?? null;
  }

  $: selected = midis.find((m) => m.id === selectedId) ?? null;

  /* ─── Derived analysis ──────────────────────────────────────────── */

  type KindStat = { kind: MusicEvent["kind"]; count: number };

  function kindStats(events: MusicEvent[]): KindStat[] {
    const m = new Map<MusicEvent["kind"], number>();
    for (const e of events) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return Array.from(m.entries()).map(([kind, count]) => ({ kind, count }));
  }

  function midiNumber(noteName: string): number {
    const m = noteName.match(/^([A-G]#?)(-?\d+)$/);
    if (!m) return 60;
    const map: Record<string, number> = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
    return (parseInt(m[2], 10) + 1) * 12 + map[m[1]];
  }

  /** A "piano roll" laid out as positioned div bars. We compute on-the-fly. */
  type Note = { time: number; duration: number; midi: number; kind: MusicEvent["kind"] };

  function flattenNotes(events: MusicEvent[], limit = 800): Note[] {
    const out: Note[] = [];
    for (const e of events) {
      for (const n of e.notes) {
        out.push({ time: e.time, duration: e.duration, midi: midiNumber(n), kind: e.kind });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  $: notes = selected ? flattenNotes(selected.score.events) : [];
  $: stats = selected ? kindStats(selected.score.events) : [];
  $: pitchRange = (() => {
    if (notes.length === 0) return { min: 60, max: 72 };
    let min = notes[0].midi;
    let max = notes[0].midi;
    for (const n of notes) {
      if (n.midi < min) min = n.midi;
      if (n.midi > max) max = n.midi;
    }
    return { min: Math.max(0, min - 1), max: Math.min(127, max + 1) };
  })();
  $: pitchSpan = Math.max(1, pitchRange.max - pitchRange.min);
  $: durationVisible = selected ? Math.max(2, selected.score.duration) : 2;

  function colorForKind(kind: MusicEvent["kind"]): string {
    switch (kind) {
      case "note":       return "#ffd770";
      case "chord":      return "#9be9ff";
      case "phrase":     return "#a4b0ff";
      case "drone":      return "#b89dff";
      case "percussion": return "#ff9a5a";
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }
</script>

<section class="midi-editor">
  <header>
    <h1>{t("studio_midi_title")}</h1>
    <p class="lead">{t("studio_midi_desc")}</p>
  </header>

  <div class="midi-toolbar">
    <label class="file-button">
      📁 Importer un MIDI
      <input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" multiple on:change={onFileChange} hidden />
    </label>
    {#if importing}<span class="info">Import…</span>{/if}
    {#if error}<span class="error">{error}</span>{/if}
  </div>

  <div class="midi-grid">
    <aside class="midi-library">
      <h2>Bibliothèque ({midis.length})</h2>
      {#if midis.length === 0}
        <p class="empty">Aucun fichier importé. Charge un .mid pour commencer.</p>
      {:else}
        <ul>
          {#each midis as midi}
            <li class:active={midi.id === selectedId}>
              <button class="select" on:click={() => selectMidi(midi.id)}>
                <strong>
                  {midi.score.name || midi.fileName}
                  {#if midi.builtin}<span class="builtin-badge">livré</span>{/if}
                </strong>
                <span class="sub">
                  {midi.score.events.length} évts · {midi.score.duration.toFixed(1)} s
                </span>
                {#if !midi.builtin}<span class="ts">{formatDate(midi.importedAt)}</span>{/if}
              </button>
              {#if !midi.builtin}
                <button class="danger" title="Supprimer" on:click={() => onDelete(midi.id)}>×</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </aside>

    <div class="midi-detail">
      {#if !selected}
        <div class="placeholder-block">Sélectionne un MIDI dans la bibliothèque.</div>
      {:else}
        <div class="detail-header">
          <h2>{selected.score.name || selected.fileName}</h2>
          <p class="sub">
            {selected.score.events.length} événements · {selected.score.tracks?.length ?? 0} pistes · {selected.score.duration.toFixed(2)} s
          </p>
        </div>

        <section class="analysis-block">
          <h3>Analyse</h3>
          <ul class="kind-stats">
            {#each stats as s}
              <li style="--accent: {colorForKind(s.kind)}">
                <span class="dot" style="background: {colorForKind(s.kind)}"></span>
                <strong>{s.kind}</strong>
                <span>{s.count}</span>
              </li>
            {/each}
          </ul>
        </section>

        <section class="roll-block">
          <h3>Piano roll <span class="muted">(jusqu'à 800 notes affichées)</span></h3>
          <div class="piano-roll">
            {#each notes as note}
              <div
                class="note"
                style="
                  left: {(note.time / durationVisible) * 100}%;
                  width: {Math.max(0.4, (note.duration / durationVisible) * 100)}%;
                  top: {((pitchRange.max - note.midi) / pitchSpan) * 100}%;
                  background: {colorForKind(note.kind)};
                "
                title="{note.kind} · midi {note.midi} · t={note.time.toFixed(2)}s · dur={note.duration.toFixed(2)}s"
              ></div>
            {/each}
          </div>
          <div class="roll-axis">
            <span>0 s</span>
            <span>{(durationVisible / 2).toFixed(1)} s</span>
            <span>{durationVisible.toFixed(1)} s</span>
          </div>
        </section>

        <section class="raw-block">
          <h3>Événements bruts (50 premiers)</h3>
          <table>
            <thead>
              <tr><th>t (s)</th><th>kind</th><th>dur</th><th>notes</th><th>vel</th><th>inst</th></tr>
            </thead>
            <tbody>
              {#each selected.score.events.slice(0, 50) as e}
                <tr>
                  <td>{e.time.toFixed(2)}</td>
                  <td><span class="kind-tag" style="background: {colorForKind(e.kind)}">{e.kind}</span></td>
                  <td>{e.duration.toFixed(2)}</td>
                  <td>{e.notes.join(", ")}</td>
                  <td>{(e.velocity ?? 0).toFixed(2)}</td>
                  <td>{e.instrument}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}
    </div>
  </div>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
