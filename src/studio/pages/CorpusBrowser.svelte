<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import * as Tone from "tone";
  import { BUILTIN_MELODY_CORPUS, type CorpusMelodyRecord } from "../../melody/corpus/builtin";
  import { listAllCorpusRecords } from "../../melody/corpus/storage";
  import { createAnalysisSnapshot } from "../../melody/analysis/snapshot";
  import { sortMelodyNotes } from "../../melody/types";
  import {
    exportMelodyResearchData,
    getLocalListenerId,
    listAnnotations,
    saveAnnotation
  } from "../../melody/research/storage";
  import type { MelodyAnnotation, MelodyStimulus } from "../../melody/research/types";
  import { navigate } from "../router";
  import { locale, t } from "../../ui/i18n";

  const NORMALIZED_TEMPO = 110;
  const TARGET_CENTER_MIDI = 64;

  const copy = locale === "fr"
    ? {
        intro: "Écouter, classer et annoter le corpus. Les métriques d’analyse restent masquées jusqu’à la première sauvegarde afin de limiter le biais expérimental.",
        search: "Rechercher",
        allGenres: "Tous les genres",
        allStatus: "Tout",
        rated: "Notées",
        unrated: "À noter",
        progress: "Progression",
        play: "▶ Écouter",
        save: "Enregistrer l’annotation",
        saved: "Annotation enregistrée",
        next: "Suivante non notée",
        export: "Exporter mes données",
        preference: "J’aime cette mélodie",
        replay: "Envie de la réécouter",
        valence: "Impression triste ↔ joyeuse",
        arousal: "Calme ↔ énergique",
        tension: "Tension",
        familiarity: "Familiarité",
        memorability: "Mémorabilité",
        hummability: "Facile à fredonner",
        surprise: "Surprise",
        impressions: "Impressions",
        joy: "joie",
        sadness: "tristesse",
        nostalgia: "nostalgie",
        unease: "inquiétude",
        tenderness: "tendresse",
        researchMode: "Stimulus normalisé",
        researchHint: "Même tempo cible, même synthé et registre recentré pour mieux isoler la structure mélodique.",
        analysisLocked: "Analyse masquée jusqu’à l’enregistrement de ton jugement.",
        analysis: "Analyse v",
        attacks: "attaques",
        pitchChange: "changement de hauteur",
        repetition: "attaques répétées",
        motifs: "motifs",
        corpusEmpty: "Aucune mélodie ne correspond aux filtres.",
        license: "Licence",
        source: "Source",
        rating: "Classification",
        structure: "Structure",
        imported: "importée"
      }
    : {
        intro: "Listen to, classify, and annotate the corpus. Analysis metrics stay hidden until the first saved rating to reduce experimental bias.",
        search: "Search",
        allGenres: "All genres",
        allStatus: "All",
        rated: "Rated",
        unrated: "Unrated",
        progress: "Progress",
        play: "▶ Play",
        save: "Save annotation",
        saved: "Annotation saved",
        next: "Next unrated",
        export: "Export my data",
        preference: "I like this melody",
        replay: "I want to replay it",
        valence: "Sad/dark ↔ joyful/bright",
        arousal: "Calm ↔ energetic",
        tension: "Tension",
        familiarity: "Familiarity",
        memorability: "Memorability",
        hummability: "Easy to hum",
        surprise: "Surprise",
        impressions: "Impressions",
        joy: "joy",
        sadness: "sadness",
        nostalgia: "nostalgia",
        unease: "unease",
        tenderness: "tenderness",
        researchMode: "Normalized stimulus",
        researchHint: "Same target tempo, same synth, and recentered register to better isolate melodic structure.",
        analysisLocked: "Analysis stays hidden until you save your judgment.",
        analysis: "Analysis v",
        attacks: "attacks",
        pitchChange: "pitch change",
        repetition: "repeated attacks",
        motifs: "motifs",
        corpusEmpty: "No melody matches these filters.",
        license: "License",
        source: "Source",
        rating: "Classification",
        structure: "Structure",
        imported: "imported"
      };

  let corpus: CorpusMelodyRecord[] = BUILTIN_MELODY_CORPUS;
  let query = "";
  let genre = "all";
  let status = "all";
  let selectedId = corpus[0]?.entry.id ?? "";
  let annotations: MelodyAnnotation[] = [];
  let listenerId = "local-listener";
  let synth: Tone.PolySynth | null = null;
  let saveMessage = "";

  let preference = 0;
  let replayDesire = 0.5;
  let valence = 0;
  let arousal = 0.5;
  let tension = 0.5;
  let familiarity = 0;
  let memorability = 0.5;
  let hummability = 0.5;
  let surprise = 0.5;
  let joy = false;
  let sadness = false;
  let nostalgia = false;
  let unease = false;
  let tenderness = false;

  onMount(() => {
    corpus = listAllCorpusRecords();
    if (!corpus.some((item) => item.entry.id === selectedId)) selectedId = corpus[0]?.entry.id ?? "";
    listenerId = getLocalListenerId();
    annotations = listAnnotations();
    loadDraft();
  });

  onDestroy(() => synth?.dispose());

  $: genres = Array.from(new Set(corpus.flatMap((item) => item.entry.genres))).sort();
  $: selected = corpus.find((item) => item.entry.id === selectedId) ?? corpus[0];
  $: selectedStimulus = selected ? stimulusFor(selected) : null;
  $: selectedAnnotation = selectedStimulus
    ? annotations.find((item) => item.listenerId === listenerId && item.stimulusId === selectedStimulus.id)
    : undefined;
  $: snapshot = selected ? createAnalysisSnapshot(selected.melody) : null;
  $: ratedCount = corpus.filter((item) => isRated(item)).length;
  $: filtered = corpus.filter((item) => {
    const haystack = `${item.entry.title} ${item.entry.composer ?? ""} ${item.entry.artist ?? ""}`.toLowerCase();
    const queryOk = haystack.includes(query.trim().toLowerCase());
    const genreOk = genre === "all" || item.entry.genres.includes(genre);
    const rated = isRated(item);
    const statusOk = status === "all" || (status === "rated" ? rated : !rated);
    return queryOk && genreOk && statusOk;
  });

  function stimulusFor(record: CorpusMelodyRecord): MelodyStimulus {
    const notes = sortMelodyNotes(record.melody.notes);
    const mean = notes.length === 0 ? TARGET_CENTER_MIDI : notes.reduce((sum, note) => sum + note.midi, 0) / notes.length;
    const transposeSemitones = Math.round(TARGET_CENTER_MIDI - mean);
    return {
      id: `stimulus_${record.entry.id}_structural_v1`,
      melodyId: record.melody.id,
      melodyHash: record.entry.melodyHash,
      renderingProfile: {
        mode: "structural-normalized",
        instrument: "tone-synth-v1",
        tempo: NORMALIZED_TEMPO,
        transposeSemitones,
        velocityScale: 1
      }
    };
  }

  function isRated(record: CorpusMelodyRecord): boolean {
    const stimulus = stimulusFor(record);
    return annotations.some((item) => item.listenerId === listenerId && item.stimulusId === stimulus.id);
  }

  function selectRecord(id: string) {
    selectedId = id;
    saveMessage = "";
    queueMicrotask(loadDraft);
  }

  function loadDraft() {
    const record = corpus.find((item) => item.entry.id === selectedId);
    if (!record) return;
    const stimulus = stimulusFor(record);
    const saved = annotations.find((item) => item.listenerId === listenerId && item.stimulusId === stimulus.id);
    preference = saved?.preference ?? 0;
    replayDesire = saved?.replayDesire ?? 0.5;
    valence = saved?.emotion?.valence ?? 0;
    arousal = saved?.emotion?.arousal ?? 0.5;
    tension = saved?.emotion?.tension ?? 0.5;
    familiarity = saved?.perception?.familiarity ?? 0;
    memorability = saved?.perception?.memorability ?? 0.5;
    hummability = saved?.perception?.hummability ?? 0.5;
    surprise = saved?.perception?.surprise ?? 0.5;
    joy = (saved?.emotion?.labels?.joy ?? 0) > 0;
    sadness = (saved?.emotion?.labels?.sadness ?? 0) > 0;
    nostalgia = (saved?.emotion?.labels?.nostalgia ?? 0) > 0;
    unease = (saved?.emotion?.labels?.unease ?? 0) > 0;
    tenderness = (saved?.emotion?.labels?.tenderness ?? 0) > 0;
  }

  async function play(record: CorpusMelodyRecord) {
    await Tone.start();
    if (!synth) synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.releaseAll(Tone.now());
    const stimulus = stimulusFor(record);
    const transpose = stimulus.renderingProfile.transposeSemitones ?? 0;
    const tempo = stimulus.renderingProfile.tempo;
    const notes = sortMelodyNotes(record.melody.notes);
    if (notes.length === 0) return;
    const origin = notes[0].tick;
    const beatSeconds = 60 / tempo;
    const start = Tone.now() + 0.06;
    for (const note of notes) {
      const offset = ((note.tick - origin) / record.melody.ppq) * beatSeconds;
      const duration = Math.max(0.04, (note.durationTicks / record.melody.ppq) * beatSeconds * 0.92);
      const frequency = Tone.Frequency(note.midi + transpose, "midi").toFrequency();
      synth.triggerAttackRelease(frequency, duration, start + offset, note.velocity);
    }
  }

  function saveCurrent() {
    if (!selected || !selectedStimulus) return;
    const labels: Record<string, number> = {};
    if (joy) labels.joy = 1;
    if (sadness) labels.sadness = 1;
    if (nostalgia) labels.nostalgia = 1;
    if (unease) labels.unease = 1;
    if (tenderness) labels.tenderness = 1;

    const annotation: MelodyAnnotation = {
      stimulusId: selectedStimulus.id,
      melodyId: selected.melody.id,
      analysisVersion: snapshot?.analyzer.version,
      listenerId,
      createdAt: new Date().toISOString(),
      preference,
      replayDesire,
      emotion: { valence, arousal, tension, labels },
      perception: { familiarity, memorability, hummability, surprise }
    };
    saveAnnotation(annotation);
    annotations = listAnnotations();
    saveMessage = copy.saved;
  }

  function nextUnrated() {
    if (corpus.length === 0) return;
    const currentIndex = corpus.findIndex((item) => item.entry.id === selectedId);
    for (let offset = 1; offset <= corpus.length; offset += 1) {
      const candidate = corpus[(Math.max(0, currentIndex) + offset) % corpus.length];
      if (!isRated(candidate)) {
        selectRecord(candidate.entry.id);
        return;
      }
    }
  }

  function formatSigned(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return rounded > 0 ? `+${rounded}` : String(rounded);
  }
</script>

<section class="corpus-page">
  <header class="page-header">
    <div>
      <h1>{t("studio_corpus_title")}</h1>
      <p>{copy.intro}</p>
    </div>
    <div class="header-actions">
      <button on:click={exportMelodyResearchData}>{copy.export}</button>
      <button on:click={() => navigate("melody")}>← {t("studio_melody_title")}</button>
    </div>
  </header>

  <div class="progress-card">
    <span>{copy.progress}</span>
    <strong>{ratedCount} / {corpus.length}</strong>
    <div class="progress-track"><i style={`width:${corpus.length ? ratedCount / corpus.length * 100 : 0}%`}></i></div>
  </div>

  <div class="filters">
    <input bind:value={query} placeholder={copy.search} aria-label={copy.search} />
    <select bind:value={genre} aria-label="Genre">
      <option value="all">{copy.allGenres}</option>
      {#each genres as value}<option value={value}>{value}</option>{/each}
    </select>
    <select bind:value={status} aria-label="Status">
      <option value="all">{copy.allStatus}</option>
      <option value="rated">{copy.rated}</option>
      <option value="unrated">{copy.unrated}</option>
    </select>
  </div>

  <div class="corpus-grid">
    <aside class="library">
      {#if filtered.length === 0}
        <p class="muted">{copy.corpusEmpty}</p>
      {:else}
        {#each filtered as item, index}
          <button class="corpus-item" class:active={item.entry.id === selectedId} on:click={() => selectRecord(item.entry.id)}>
            <span class="status-dot" class:rated={isRated(item)}></span>
            <span>
              <strong>
                {item.entry.title}
                {#if item.entry.sourceKind === "imported"}<b class="imported-badge">{copy.imported}</b>{/if}
              </strong>
              <small>{item.entry.composer ?? item.entry.artist ?? "—"} · {item.entry.era ?? item.entry.year ?? "—"}</small>
            </span>
            <em>{index + 1}</em>
          </button>
        {/each}
      {/if}
    </aside>

    {#if selected && selectedStimulus}
      <main class="classifier">
        <section class="identity-card">
          <div>
            <span class="eyebrow">{copy.researchMode}</span>
            <h2>{selected.entry.title}</h2>
            <p>{selected.entry.composer ?? selected.entry.artist ?? "—"} · {selected.entry.era ?? selected.entry.year ?? "—"}</p>
            <div class="tags">{#each selected.entry.genres as tag}<span>{tag}</span>{/each}</div>
          </div>
          <button class="play primary" on:click={() => play(selected)}>{copy.play}</button>
        </section>
        <p class="research-hint">{copy.researchHint}</p>

        <section class="rating-card">
          <h3>{copy.rating}</h3>
          <div class="sliders">
            <label><span>{copy.preference}</span><output>{formatSigned(preference)}</output><input type="range" min="-1" max="1" step="0.1" bind:value={preference} /></label>
            <label><span>{copy.replay}</span><output>{Math.round(replayDesire * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={replayDesire} /></label>
            <label><span>{copy.valence}</span><output>{formatSigned(valence)}</output><input type="range" min="-1" max="1" step="0.1" bind:value={valence} /></label>
            <label><span>{copy.arousal}</span><output>{Math.round(arousal * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={arousal} /></label>
            <label><span>{copy.tension}</span><output>{Math.round(tension * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={tension} /></label>
            <label><span>{copy.familiarity}</span><output>{Math.round(familiarity * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={familiarity} /></label>
            <label><span>{copy.memorability}</span><output>{Math.round(memorability * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={memorability} /></label>
            <label><span>{copy.hummability}</span><output>{Math.round(hummability * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={hummability} /></label>
            <label><span>{copy.surprise}</span><output>{Math.round(surprise * 100)}%</output><input type="range" min="0" max="1" step="0.1" bind:value={surprise} /></label>
          </div>

          <div class="impressions">
            <span>{copy.impressions}</span>
            <label><input type="checkbox" bind:checked={joy} /> {copy.joy}</label>
            <label><input type="checkbox" bind:checked={sadness} /> {copy.sadness}</label>
            <label><input type="checkbox" bind:checked={nostalgia} /> {copy.nostalgia}</label>
            <label><input type="checkbox" bind:checked={unease} /> {copy.unease}</label>
            <label><input type="checkbox" bind:checked={tenderness} /> {copy.tenderness}</label>
          </div>

          <div class="save-row">
            <button class="primary" on:click={saveCurrent}>{copy.save}</button>
            <button on:click={nextUnrated} disabled={ratedCount >= corpus.length}>{copy.next}</button>
            {#if saveMessage}<span class="saved">✓ {saveMessage}</span>{/if}
          </div>
        </section>

        <section class="analysis-card">
          <h3>{copy.structure}</h3>
          {#if selectedAnnotation && snapshot}
            <span class="eyebrow">{copy.analysis}{snapshot.analyzer.version}</span>
            <div class="metrics">
              <div><strong>{snapshot.features.attacks}</strong><span>{copy.attacks}</span></div>
              <div><strong>{Math.round(snapshot.features.pitchChangeRatio * 100)}%</strong><span>{copy.pitchChange}</span></div>
              <div><strong>{Math.round(snapshot.features.repeatedAttackShare * 100)}%</strong><span>{copy.repetition}</span></div>
              <div><strong>{snapshot.features.motifCount}</strong><span>{copy.motifs}</span></div>
            </div>
            <code>{snapshot.structural.contour ?? "—"}</code>
          {:else}
            <p class="locked">{copy.analysisLocked}</p>
          {/if}
        </section>

        <footer class="meta">
          <span>{copy.license}: {selected.entry.license ?? "—"}</span>
          <span>{copy.source}: {selected.entry.sourceKind}</span>
          {#if selected.entry.extraction?.extractorVersion}<span>extractor {selected.entry.extraction.extractorVersion}</span>{/if}
          <span>hash {selected.entry.melodyHash}</span>
        </footer>
      </main>
    {/if}
  </div>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>

<style>
  .corpus-page { max-width: 1240px; margin: 0 auto; padding: 2rem; color: #f7f4e8; }
  .page-header { display:flex; justify-content:space-between; gap:2rem; align-items:flex-start; }
  .page-header h1 { margin:0 0 .5rem; font-size:clamp(2rem,4vw,3.1rem); }
  .page-header p { margin:0; color:#a9aaa2; max-width:760px; line-height:1.55; }
  .header-actions { display:flex; gap:.55rem; flex-wrap:wrap; justify-content:flex-end; }
  button, input, select { border:1px solid #41423c; background:#20211d; color:#f7f4e8; border-radius:.55rem; padding:.65rem .8rem; }
  button { cursor:pointer; }
  button.primary { background:#f0d477; border-color:#f0d477; color:#1b1c19; font-weight:800; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .progress-card { margin:1.4rem 0 .8rem; display:grid; grid-template-columns:auto auto 1fr; gap:.8rem; align-items:center; padding:.8rem 1rem; border:1px solid #34352f; border-radius:.7rem; background:#191a17; }
  .progress-card span { color:#999a92; } .progress-card strong { color:#f0d477; }
  .progress-track { height:6px; border-radius:99px; background:#2d2e29; overflow:hidden; } .progress-track i { display:block; height:100%; background:#f0d477; }
  .filters { display:grid; grid-template-columns:1fr auto auto; gap:.6rem; margin-bottom:1rem; }
  .corpus-grid { display:grid; grid-template-columns:minmax(250px, .72fr) minmax(0, 1.8fr); gap:1rem; align-items:start; }
  .library { border:1px solid #34352f; border-radius:.8rem; background:#171815; max-height:740px; overflow:auto; padding:.4rem; }
  .corpus-item { width:100%; display:grid; grid-template-columns:10px 1fr auto; gap:.7rem; align-items:center; text-align:left; border-color:transparent; background:transparent; margin:0; }
  .corpus-item:hover, .corpus-item.active { background:#24251f; border-color:#42433c; }
  .corpus-item strong { display:block; } .corpus-item small { display:block; margin-top:.15rem; color:#91928a; }
  .corpus-item em { color:#666860; font-style:normal; font-size:.8rem; }
  .imported-badge { display:inline-block; margin-left:.35rem; padding:.08rem .35rem; border-radius:99px; background:#9be9ff1c; color:#9be9ff; font-size:.66rem; font-weight:700; vertical-align:middle; }
  .status-dot { width:8px; height:8px; border-radius:50%; background:#4e5048; } .status-dot.rated { background:#8ff0d2; box-shadow:0 0 9px #8ff0d277; }
  .classifier { display:grid; gap:1rem; }
  .identity-card, .rating-card, .analysis-card { border:1px solid #383934; border-radius:.8rem; background:#191a17; padding:1.1rem; }
  .identity-card { display:flex; justify-content:space-between; gap:1rem; align-items:center; }
  .identity-card h2 { margin:.25rem 0; font-size:1.65rem; } .identity-card p { margin:.15rem 0 .6rem; color:#a6a79f; }
  .eyebrow { font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; color:#f0d477; font-weight:800; }
  .tags { display:flex; gap:.35rem; flex-wrap:wrap; } .tags span { background:#2a2b26; color:#c7c7bf; border-radius:99px; padding:.22rem .5rem; font-size:.78rem; }
  .play { min-width:110px; }
  .research-hint { margin:-.45rem .2rem 0; color:#85877e; font-size:.88rem; }
  h3 { margin:0 0 1rem; }
  .sliders { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem 1rem; }
  .sliders label { display:grid; grid-template-columns:1fr auto; gap:.35rem .7rem; align-items:center; padding:.65rem .7rem; background:#22231f; border-radius:.6rem; }
  .sliders label span { color:#b7b7af; font-size:.88rem; } .sliders output { color:#f0d477; font:700 .85rem ui-monospace,monospace; }
  .sliders input { grid-column:1 / -1; width:100%; padding:0; accent-color:#f0d477; }
  .impressions { display:flex; gap:.45rem; align-items:center; flex-wrap:wrap; margin-top:1rem; }
  .impressions > span { color:#9d9e96; margin-right:.3rem; } .impressions label { padding:.4rem .55rem; border:1px solid #3d3e38; border-radius:99px; color:#c9c9c2; font-size:.85rem; }
  .save-row { display:flex; gap:.55rem; align-items:center; flex-wrap:wrap; margin-top:1rem; } .saved { color:#8ff0d2; font-size:.88rem; }
  .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.55rem; margin:.7rem 0; }
  .metrics div { background:#22231f; border-radius:.55rem; padding:.7rem; } .metrics strong { display:block; font-size:1.2rem; color:#f0d477; } .metrics span { color:#96978f; font-size:.8rem; }
  .analysis-card code { color:#d8d1b8; font:700 1rem ui-monospace,monospace; word-break:break-all; }
  .locked { color:#8d8f87; font-style:italic; }
  .meta { display:flex; gap:1rem; flex-wrap:wrap; color:#73756d; font-size:.78rem; padding:0 .2rem; }
  .muted { color:#85877e; padding:1rem; }
  .back { margin-top:1.2rem; }
  @media (max-width: 860px) { .page-header{display:block}.header-actions{justify-content:flex-start;margin-top:1rem}.corpus-grid{grid-template-columns:1fr}.library{max-height:280px}.sliders{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr}.identity-card{align-items:flex-start}.progress-card{grid-template-columns:auto auto}.progress-track{grid-column:1/-1} }
</style>
