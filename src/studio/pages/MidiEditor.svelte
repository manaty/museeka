<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as Tone from "tone";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import { parseMidiFile } from "../../music/midi";
  import { listAllMidis, saveMidi, deleteMidi, makeMidiId, type StoredMidi } from "../storage";
  import { AudioEngine } from "../../audio/AudioEngine";
  import type { AudioGenerator, MusicEvent, SoundObject } from "../../core/types";
  import { extractMelodyCandidates, type MelodyExtractionCandidate } from "../../melody/extraction/extractor";
  import { melodyHash } from "../../melody/analysis/snapshot";
  import { sortMelodyNotes } from "../../melody/types";
  import { saveUserCorpusRecord } from "../../melody/corpus/storage";

  let midis: StoredMidi[] = [];
  let selectedId: string | null = null;
  let importing = false;
  let error = "";
  let sourcesOpen = false;
  let corpusMessage = "";

  type MidiSource = {
    name: string;
    url: string;
    description: string;
    license: "PD" | "CC" | "Mixed" | "User";
  };

  const MIDI_SOURCES_LIST: MidiSource[] = [
    { name: "Mutopia Project",   url: "https://www.mutopiaproject.org/",     description: "Partitions et MIDIs classiques, domaine public.",        license: "PD" },
    { name: "IMSLP / Petrucci",   url: "https://imslp.org/",                  description: "Vaste bibliothèque libre de droits (classique).",       license: "PD" },
    { name: "Kunst der Fuge",     url: "https://www.kunstderfuge.com/",       description: "Bach, baroque, classique — MIDIs très complets.",        license: "PD" },
    { name: "Classical Midi",     url: "https://classicalmidi.co.uk/",        description: "Catalogue classique anglais, téléchargements libres.",  license: "PD" },
    { name: "8notes",             url: "https://www.8notes.com/midi/",        description: "Partitions + MIDIs, sections libres et premium.",       license: "Mixed" },
    { name: "MidiWorld",          url: "https://www.midiworld.com/",          description: "Pop, rock, classique — vieux site mais riche.",         license: "Mixed" },
    { name: "FreeMidi",           url: "https://freemidi.org/",                description: "Sélection populaire, varié.",                            license: "User" },
    { name: "BitMidi",            url: "https://bitmidi.com/",                description: "Recherche rapide, 100k+ fichiers utilisateurs.",        license: "User" },
    { name: "MuseScore",          url: "https://musescore.com/",              description: "Communauté de partitions, export MIDI souvent dispo.",  license: "CC" },
    { name: "VGMusic",            url: "https://www.vgmusic.com/",            description: "Musiques de jeux vidéo (fan-made, vérifier la licence).", license: "Mixed" }
  ];

  function licenseLabel(license: MidiSource["license"]): { text: string; color: string } {
    switch (license) {
      case "PD":    return { text: "Domaine public", color: "#8ff0d2" };
      case "CC":    return { text: "Creative Commons", color: "#a4b0ff" };
      case "Mixed": return { text: "Mixte", color: "#ffd770" };
      case "User":  return { text: "User-submitted", color: "#f6c98f" };
    }
  }

  function toggleSources() {
    sourcesOpen = !sourcesOpen;
  }

  function closeSources() {
    sourcesOpen = false;
  }

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
    corpusMessage = "";
    try {
      for (const file of files) {
        const id = makeMidiId();
        const score = await parseMidiFile(file);
        const entry: StoredMidi = {
          id,
          fileName: file.name,
          importedAt: Date.now(),
          score,
          melodyCandidates: extractMelodyCandidates(score, id)
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
    corpusMessage = "";
  }

  async function onDelete(id: string) {
    deleteMidi(id);
    await refresh();
    if (selectedId === id) selectedId = midis[0]?.id ?? null;
  }

  $: selected = midis.find((m) => m.id === selectedId) ?? null;
  $: if (selected) { stop(); }

  let engine: AudioEngine | null = null;
  let samplesReady = false;
  let samplePercent = 0;
  let playing = false;
  let playTime = 0;
  let playStart = 0;
  let nextIndex = 0;
  let currentEventIndex = -1;
  let frame = 0;
  let rawTableRef: HTMLTableSectionElement | null = null;
  let candidateSynth: Tone.PolySynth | null = null;

  onMount(async () => {
    try {
      engine = new AudioEngine();
      await engine.start();
      void engine.prepareSamples((p) => {
        samplePercent = p.percent;
        samplesReady = p.ready;
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  });

  onDestroy(() => {
    cancelAnimationFrame(frame);
    engine?.dispose();
    candidateSynth?.dispose();
  });

  function eventToSoundObject(event: MusicEvent, idx: number): SoundObject {
    let audio: AudioGenerator;
    if (event.kind === "note") {
      audio = { generator: "note", instrument: event.instrument, baseNote: event.notes[0], duration: event.duration, velocity: event.velocity ?? 0.8 };
    } else if (event.kind === "chord") {
      audio = { generator: "chord", instrument: event.instrument, notes: event.notes, duration: event.duration, velocity: event.velocity ?? 0.8 };
    } else if (event.kind === "phrase") {
      const step = event.notes.length > 1 ? event.duration / event.notes.length : event.duration;
      audio = {
        generator: "phrase",
        instrument: event.instrument,
        notes: event.notes.map((n, i) => ({ note: n, dt: i * step, duration: step, velocity: event.velocity ?? 0.7 }))
      };
    } else if (event.kind === "drone") {
      audio = { generator: "drone", instrument: event.instrument, notes: event.notes, continuous: true, velocity: event.velocity ?? 0.5 };
    } else {
      audio = { generator: "percussion", instrument: event.instrument, pattern: [{ dt: 0, velocity: event.velocity ?? 0.9 }] };
    }
    return {
      id: `midi_preview_${idx}`,
      kind: "midi_preview",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      field: { shape: "sphere", params: { radius: 3 }, falloff: { distance: { type: "linear" } } },
      trigger: { mode: "peak", threshold: 0.4, cooldown: 0.05, retrigger: true },
      audio,
      mappings: [],
      visual: { model: "crystal", color: "#fff1a8", activeGlow: false }
    };
  }

  function play() {
    if (!selected || !engine) return;
    if (!samplesReady) return;
    if (playing) {
      pause();
      return;
    }
    playing = true;
    playStart = performance.now() - playTime * 1000;
    frame = requestAnimationFrame(tick);
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(frame);
  }

  function stop() {
    pause();
    playTime = 0;
    nextIndex = 0;
    currentEventIndex = -1;
  }

  function restart() {
    stop();
    if (selected) play();
  }

  function tick(now: number) {
    if (!selected || !engine) return;
    playTime = (now - playStart) / 1000;
    while (
      nextIndex < selected.score.events.length &&
      selected.score.events[nextIndex].time <= playTime
    ) {
      const ev = selected.score.events[nextIndex];
      try {
        engine.triggerPreview(eventToSoundObject(ev, nextIndex));
      } catch {
        // ignore individual trigger failures
      }
      currentEventIndex = nextIndex;
      nextIndex += 1;
      if (rawTableRef) {
        const row = rawTableRef.querySelector(`tr[data-evt="${currentEventIndex}"]`) as HTMLElement | null;
        if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
    if (playTime >= selected.score.duration) {
      stop();
      return;
    }
    if (playing) frame = requestAnimationFrame(tick);
  }

  async function playCandidate(candidate: MelodyExtractionCandidate) {
    await Tone.start();
    if (!candidateSynth) candidateSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    candidateSynth.releaseAll(Tone.now());
    const notes = sortMelodyNotes(candidate.melody.notes);
    if (notes.length === 0) return;
    const origin = notes[0].tick;
    const beatSeconds = 60 / Math.max(1, candidate.melody.tempo);
    const start = Tone.now() + 0.06;
    for (const note of notes) {
      const offset = ((note.tick - origin) / candidate.melody.ppq) * beatSeconds;
      const duration = Math.max(0.035, (note.durationTicks / candidate.melody.ppq) * beatSeconds * 0.92);
      candidateSynth.triggerAttackRelease(Tone.Frequency(note.midi, "midi"), duration, start + offset, note.velocity);
    }
  }

  function addCandidateToCorpus(candidate: MelodyExtractionCandidate) {
    if (!selected) return;
    const hash = melodyHash(candidate.melody);
    const title = `${selected.score.name || selected.fileName} — ${candidate.trackName}`;
    saveUserCorpusRecord({
      melody: { ...candidate.melody, name: title },
      entry: {
        id: `imported_${selected.id}_track_${candidate.sourceTrackIndex}_${hash}`,
        title,
        genres: ["imported"],
        sourceKind: "imported",
        license: "User supplied — verify redistribution rights",
        sourceHash: selected.id,
        melodyId: candidate.melody.id,
        melodyHash: hash,
        extraction: {
          method: "algorithm",
          trackIndex: candidate.sourceTrackIndex,
          extractorVersion: candidate.extractor.version
        }
      }
    });
    corpusMessage = `✓ ${candidate.trackName} ajouté au corpus`;
  }

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

  type Note = { time: number; duration: number; midi: number; kind: MusicEvent["kind"]; eventIndex: number };

  function flattenNotes(events: MusicEvent[]): Note[] {
    const out: Note[] = [];
    events.forEach((e, eventIndex) => {
      for (const n of e.notes) {
        out.push({ time: e.time, duration: e.duration, midi: midiNumber(n), kind: e.kind, eventIndex });
      }
    });
    return out;
  }

  $: notes = selected ? flattenNotes(selected.score.events) : [];
  $: ratio = Math.max(0, Math.min(1, playTime / Math.max(0.001, durationVisible)));
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

    <div class="midi-sources" class:open={sourcesOpen}>
      <button type="button" class="sources-trigger" on:click={toggleSources}>
        🌐 Où trouver des MIDI ? <span class="caret">▾</span>
      </button>
      {#if sourcesOpen}
        <div class="sources-dropdown" role="menu">
          <p class="sources-hint">Sites externes — favoris : domaine public.</p>
          {#each MIDI_SOURCES_LIST as source}
            {@const lic = licenseLabel(source.license)}
            <a
              class="source-link"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              on:click={closeSources}
            >
              <div class="source-main">
                <strong>{source.name}</strong>
                <span class="lic" style="background: {lic.color}22; color: {lic.color}; border-color: {lic.color}55;">{lic.text}</span>
              </div>
              <span class="source-desc">{source.description}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>

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
                  {#if midi.melodyCandidates?.length} · {midi.melodyCandidates.length} candidats{/if}
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

        <section class="analysis-block extraction-block">
          <div class="extraction-title">
            <div>
              <h3>Extraction de mélodie</h3>
              <p>Les candidats sont calculés avant compactage du MIDI. Une piste polyphonique utilise une skyline explicite et versionnée.</p>
            </div>
            <button on:click={() => navigate("corpus")}>Ouvrir le corpus →</button>
          </div>
          {#if selected.melodyCandidates?.length}
            <div class="candidate-list">
              {#each selected.melodyCandidates.slice(0, 8) as candidate, rank}
                <article class="candidate-card">
                  <div class="candidate-rank">#{rank + 1}</div>
                  <div class="candidate-main">
                    <strong>{candidate.trackName}</strong>
                    <span>
                      confiance {Math.round(candidate.metrics.confidence * 100)}%
                      · monophonie {Math.round(candidate.metrics.monophonyRatio * 100)}%
                      · {candidate.metrics.extractedNotes} notes
                      · ambitus {candidate.metrics.pitchRange} st
                    </span>
                    <small>{candidate.extractor.id} v{candidate.extractor.version} · track {candidate.sourceTrackIndex + 1}</small>
                  </div>
                  <div class="candidate-actions">
                    <button on:click={() => playCandidate(candidate)}>▶ Isoler</button>
                    <button class="candidate-add" on:click={() => addCandidateToCorpus(candidate)}>+ Corpus</button>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="empty">Aucun candidat mélodique compact n’est disponible pour ce MIDI. Les anciens imports déjà compactés peuvent devoir être réimportés.</p>
          {/if}
          {#if corpusMessage}<p class="corpus-message">{corpusMessage}</p>{/if}
        </section>

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
          <div class="player-with-roll">
            <div class="player-controls-row">
              <button class="player-play" on:click={play} disabled={!samplesReady} title={playing ? "Pause" : "Play"}>
                {playing ? "⏸" : "▶"}
              </button>
              <button class="player-restart" on:click={restart} disabled={!samplesReady} title="Restart">↻</button>
              <h3 class="player-title">Piano roll</h3>
              <span class="player-time">
                {playTime.toFixed(1)} / {durationVisible.toFixed(1)} s
              </span>
              {#if !samplesReady}<span class="info">Samples · {samplePercent}%</span>{/if}
            </div>

            <button
              type="button"
              class="player-progress"
              aria-label="Seek"
              on:click={(e) => {
                if (!selected) return;
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                const r = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                playTime = r * selected.score.duration;
                nextIndex = selected.score.events.findIndex((ev) => ev.time > playTime);
                if (nextIndex === -1) nextIndex = selected.score.events.length;
                currentEventIndex = nextIndex - 1;
                playStart = performance.now() - playTime * 1000;
              }}
            >
              <span class="player-progress-fill" style="width: {ratio * 100}%"></span>
              <span class="player-progress-cursor" style="left: {ratio * 100}%"></span>
            </button>

            <div class="player-roll-connector" aria-hidden="true">
              <span class="connector-line" style="left: {ratio * 100}%"></span>
            </div>
          <div class="piano-roll">
            {#each notes as note}
              <div
                class="note"
                class:playing={note.eventIndex === currentEventIndex}
                style="
                  left: {(note.time / durationVisible) * 100}%;
                  width: {Math.max(0.4, (note.duration / durationVisible) * 100)}%;
                  top: {((pitchRange.max - note.midi) / pitchSpan) * 100}%;
                  background: {colorForKind(note.kind)};
                "
                title="{note.kind} · midi {note.midi} · t={note.time.toFixed(2)}s · dur={note.duration.toFixed(2)}s"
              ></div>
            {/each}
            <div class="playhead" style="left: {ratio * 100}%"></div>
          </div>
          <div class="roll-axis">
            <span>0 s</span>
            <span>{(durationVisible / 2).toFixed(1)} s</span>
            <span>{durationVisible.toFixed(1)} s</span>
          </div>
          </div>
        </section>

        <section class="raw-block">
          <h3>Événements bruts ({selected.score.events.length})</h3>
          <div class="raw-scroll">
            <table>
              <thead>
                <tr><th>#</th><th>t (s)</th><th>kind</th><th>dur</th><th>notes</th><th>vel</th><th>inst</th></tr>
              </thead>
              <tbody bind:this={rawTableRef}>
                {#each selected.score.events as e, idx}
                  <tr data-evt={idx} class:playing={idx === currentEventIndex}>
                    <td>{idx}</td>
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
          </div>
        </section>
      {/if}
    </div>
  </div>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>

<style>
  .extraction-block { margin-bottom: 1rem; }
  .extraction-title { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
  .extraction-title h3 { margin-bottom:.25rem; }
  .extraction-title p { margin:0; color:#92948b; max-width:720px; font-size:.88rem; line-height:1.45; }
  .candidate-list { display:grid; gap:.55rem; margin-top:.9rem; }
  .candidate-card { display:grid; grid-template-columns:34px minmax(0,1fr) auto; gap:.7rem; align-items:center; padding:.7rem; background:#20211d; border:1px solid #3c3d37; border-radius:.6rem; }
  .candidate-rank { color:#f0d477; font-weight:800; }
  .candidate-main strong, .candidate-main span, .candidate-main small { display:block; }
  .candidate-main span { color:#b4b5ad; font-size:.84rem; margin-top:.18rem; }
  .candidate-main small { color:#71736b; margin-top:.15rem; }
  .candidate-actions { display:flex; gap:.4rem; flex-wrap:wrap; justify-content:flex-end; }
  .candidate-add { border-color:#8ff0d255; color:#bff5e5; }
  .corpus-message { margin:.7rem 0 0; color:#8ff0d2; }
  @media (max-width: 760px) { .candidate-card{grid-template-columns:28px 1fr}.candidate-actions{grid-column:2;justify-content:flex-start}.extraction-title{display:block}.extraction-title button{margin-top:.65rem} }
</style>
