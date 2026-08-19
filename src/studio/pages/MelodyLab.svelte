<script lang="ts">
  import { onDestroy } from "svelte";
  import * as Tone from "tone";
  import { locale, t } from "../../ui/i18n";
  import { analyzeMelody } from "../../melody/analysis/basic";
  import { findRecurringMotifs } from "../../melody/analysis/motifs";
  import { collapseRepeatedAttacks, transposeFinalRun } from "../../melody/transform";
  import { midiToNoteName, sortMelodyNotes, type Melody } from "../../melody/types";
  import { navigate } from "../router";

  const PPQ = 480;
  const STEP_TICKS = PPQ / 2;
  const STEP_COUNT = 16;
  const STEPS = Array.from({ length: STEP_COUNT }, (_, index) => index);
  const PITCHES = Array.from({ length: 13 }, (_, index) => 72 - index);

  const copy = locale === "fr"
    ? {
        intro: "Construire une phrase, l’écouter et mesurer ce qui la rend reconnaissable. Le Lab travaille sur les attaques individuelles, sans les agréger en phrases.",
        play: "▶ Écouter A",
        playSustained: "▶ Écouter B",
        reset: "Réinitialiser",
        alterEnding: "Fin +2 demi-tons",
        experimentTitle: "Expérience : réarticulation vs note tenue",
        experimentBody: "B conserve les mêmes hauteurs et la même durée globale, mais fusionne chaque répétition contiguë en une note tenue. La différence audible vient donc surtout de la réarticulation.",
        current: "A · attaques répétées",
        sustained: "B · notes tenues",
        analysis: "Analyse",
        contour: "Contour",
        motifs: "Motifs récurrents",
        sequence: "Séquence",
        noMotif: "Aucun motif récurrent détecté.",
        hint: "Clique une case pour placer/remplacer une note. Re-clique la case active pour créer un silence.",
        attacks: "Attaques",
        pitchChanges: "Changements de hauteur",
        changeRatio: "Ratio de changement",
        repeatedShare: "Notes dans des runs répétés",
        attacksPerBeat: "Attaques / temps",
        changesPerBeat: "Changements / temps",
        motifLength: "notes",
        occurrences: "occurrences"
      }
    : {
        intro: "Build a phrase, listen to it, and measure what makes it recognizable. The Lab works on individual attacks without aggregating them into phrases.",
        play: "▶ Play A",
        playSustained: "▶ Play B",
        reset: "Reset",
        alterEnding: "Ending +2 semitones",
        experimentTitle: "Experiment: rearticulation vs sustained pitch",
        experimentBody: "B keeps the same pitches and overall duration but merges each contiguous repeated pitch into one sustained note. The audible difference therefore comes mainly from rearticulation.",
        current: "A · repeated attacks",
        sustained: "B · sustained notes",
        analysis: "Analysis",
        contour: "Contour",
        motifs: "Recurring motifs",
        sequence: "Sequence",
        noMotif: "No recurring motif detected.",
        hint: "Click a cell to place/replace a note. Click the active cell again to create a rest.",
        attacks: "Attacks",
        pitchChanges: "Pitch changes",
        changeRatio: "Pitch-change ratio",
        repeatedShare: "Notes inside repeated runs",
        attacksPerBeat: "Attacks / beat",
        changesPerBeat: "Changes / beat",
        motifLength: "notes",
        occurrences: "occurrences"
      };

  function makeExample(): Melody {
    const pitches = [60, 60, 64, 64, 62, 62, 67, 67, 60, 60, 64, 64, 62, 62, 69, 69];
    return {
      id: "melody_lab_example",
      name: "Paired contour A / A′",
      ppq: PPQ,
      tempo: 132,
      notes: pitches.map((midi, index) => ({
        id: `lab_${index}`,
        midi,
        tick: index * STEP_TICKS,
        durationTicks: STEP_TICKS,
        velocity: 0.76
      }))
    };
  }

  let melody = makeExample();
  let synth: Tone.PolySynth | null = null;

  $: analysis = analyzeMelody(melody);
  $: motifs = findRecurringMotifs(melody, { minLength: 3, maxLength: 8 });
  $: bestMotif = motifs[0] ?? null;
  $: sustainedMelody = collapseRepeatedAttacks(melody);
  $: sustainedAnalysis = analyzeMelody(sustainedMelody);
  $: sequence = sortMelodyNotes(melody.notes).map((note) => midiToNoteName(note.midi)).join(" · ");

  onDestroy(() => synth?.dispose());

  function stepPitch(step: number): number | null {
    const tick = step * STEP_TICKS;
    return melody.notes.find((note) => note.tick === tick)?.midi ?? null;
  }

  function toggleStep(step: number, midi: number) {
    const tick = step * STEP_TICKS;
    const existing = melody.notes.find((note) => note.tick === tick);
    const remaining = melody.notes.filter((note) => note.tick !== tick);
    if (existing?.midi === midi) {
      melody = { ...melody, notes: remaining };
      return;
    }
    melody = {
      ...melody,
      notes: [
        ...remaining,
        {
          id: `lab_${step}_${midi}`,
          midi,
          tick,
          durationTicks: STEP_TICKS,
          velocity: 0.76
        }
      ]
    };
  }

  async function play(target: Melody) {
    await Tone.start();
    if (!synth) synth = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.releaseAll(Tone.now());

    const notes = sortMelodyNotes(target.notes);
    if (notes.length === 0) return;
    const originTick = notes[0].tick;
    const beatSeconds = 60 / Math.max(1, target.tempo);
    const startTime = Tone.now() + 0.06;

    for (const note of notes) {
      const offset = ((note.tick - originTick) / target.ppq) * beatSeconds;
      const duration = Math.max(0.035, (note.durationTicks / target.ppq) * beatSeconds * 0.94);
      const frequency = Tone.Frequency(note.midi, "midi").toFrequency();
      synth.triggerAttackRelease(frequency, duration, startTime + offset, note.velocity);
    }
  }

  function reset() {
    melody = makeExample();
  }

  function alterEnding() {
    melody = transposeFinalRun(melody, 2);
  }

  function pct(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function dec(value: number): string {
    return value.toFixed(2);
  }
</script>

<section class="melody-lab">
  <header class="lab-header">
    <div>
      <h1>{t("studio_melody_title")}</h1>
      <p>{copy.intro}</p>
    </div>
    <div class="toolbar">
      <button class="primary" on:click={() => play(melody)}>{copy.play}</button>
      <button on:click={alterEnding}>{copy.alterEnding}</button>
      <button on:click={reset}>{copy.reset}</button>
    </div>
  </header>

  <p class="hint">{copy.hint}</p>

  <div class="roll-wrap" aria-label="Melody piano roll">
    <div class="roll">
      {#each PITCHES as pitch}
        <div class="roll-row">
          <span class="pitch-label">{midiToNoteName(pitch)}</span>
          {#each STEPS as step}
            <button
              class="cell"
              class:active={stepPitch(step) === pitch}
              class:beat={step % 2 === 0}
              aria-label={`${midiToNoteName(pitch)} step ${step + 1}`}
              aria-pressed={stepPitch(step) === pitch}
              on:click={() => toggleStep(step, pitch)}
            ></button>
          {/each}
        </div>
      {/each}
      <div class="step-row">
        <span></span>
        {#each STEPS as step}
          <span class:beat-number={step % 2 === 0}>{step % 2 === 0 ? step / 2 + 1 : "·"}</span>
        {/each}
      </div>
    </div>
  </div>

  <div class="sequence-card">
    <span class="eyebrow">{copy.sequence}</span>
    <code>{sequence || "—"}</code>
  </div>

  <div class="dashboard">
    <section class="panel">
      <h2>{copy.analysis}</h2>
      <div class="metrics">
        <div><span>{copy.attacks}</span><strong>{analysis.attacks}</strong></div>
        <div><span>{copy.pitchChanges}</span><strong>{analysis.pitchChanges}</strong></div>
        <div><span>{copy.changeRatio}</span><strong>{pct(analysis.pitchChangeRatio)}</strong></div>
        <div><span>{copy.repeatedShare}</span><strong>{pct(analysis.repeatedAttackShare)}</strong></div>
        <div><span>{copy.attacksPerBeat}</span><strong>{dec(analysis.attacksPerBeat)}</strong></div>
        <div><span>{copy.changesPerBeat}</span><strong>{dec(analysis.pitchChangesPerBeat)}</strong></div>
      </div>
    </section>

    <section class="panel">
      <h2>{copy.contour}</h2>
      <div class="contour">{analysis.contour.join("  ") || "—"}</div>
      <h2>{copy.motifs}</h2>
      {#if bestMotif}
        <p class="motif-result">
          <strong>{bestMotif.length} {copy.motifLength}</strong>
          · {bestMotif.occurrences.length} {copy.occurrences}
          · reuse {bestMotif.reuseScore}
        </p>
        <code>{bestMotif.signature.intervals.join(" · ")}</code>
      {:else}
        <p>{copy.noMotif}</p>
      {/if}
    </section>
  </div>

  <section class="experiment">
    <div>
      <span class="eyebrow">A/B</span>
      <h2>{copy.experimentTitle}</h2>
      <p>{copy.experimentBody}</p>
    </div>
    <div class="ab-grid">
      <article>
        <h3>{copy.current}</h3>
        <strong>{analysis.attacks} attacks</strong>
        <span>{pct(analysis.pitchChangeRatio)} pitch-change ratio</span>
        <button class="primary" on:click={() => play(melody)}>{copy.play}</button>
      </article>
      <article>
        <h3>{copy.sustained}</h3>
        <strong>{sustainedAnalysis.attacks} attacks</strong>
        <span>{pct(sustainedAnalysis.pitchChangeRatio)} pitch-change ratio</span>
        <button on:click={() => play(sustainedMelody)}>{copy.playSustained}</button>
      </article>
    </div>
  </section>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>

<style>
  .melody-lab { max-width: 1180px; margin: 0 auto; padding: 2rem; color: #f7f4e8; }
  .lab-header { display: flex; gap: 2rem; align-items: flex-start; justify-content: space-between; }
  .lab-header h1 { margin: 0 0 .55rem; font-size: clamp(2rem, 4vw, 3.2rem); }
  .lab-header p { max-width: 760px; margin: 0; color: #b8b7b0; line-height: 1.55; }
  .toolbar { display: flex; gap: .6rem; flex-wrap: wrap; justify-content: flex-end; }
  button { border: 1px solid #4b4a43; background: #22231f; color: #f7f4e8; border-radius: .55rem; padding: .62rem .8rem; cursor: pointer; }
  button:hover { border-color: #7d7a6c; }
  button.primary { background: #f0d477; color: #1d1e1b; border-color: #f0d477; font-weight: 700; }
  .hint { color: #8f9088; margin: 1.5rem 0 .65rem; font-size: .92rem; }
  .roll-wrap { overflow-x: auto; border: 1px solid #383934; border-radius: .8rem; background: #151613; padding: .75rem; }
  .roll { min-width: 620px; }
  .roll-row, .step-row { display: grid; grid-template-columns: 54px repeat(16, minmax(28px, 1fr)); }
  .pitch-label { padding-right: .6rem; text-align: right; color: #97988f; font: 12px/28px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cell { height: 28px; min-width: 28px; padding: 0; border-radius: 0; border: 0; border-left: 1px solid #242520; border-bottom: 1px solid #242520; background: transparent; }
  .cell.beat { border-left-color: #44453e; }
  .cell.active { background: #f0d477; box-shadow: inset 0 0 0 2px #151613; }
  .step-row span { color: #73756d; text-align: center; font: 11px/22px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .step-row .beat-number { color: #c6c5ba; }
  .sequence-card, .panel, .experiment { border: 1px solid #383934; background: #1a1b18; border-radius: .8rem; }
  .sequence-card { margin-top: 1rem; padding: 1rem 1.1rem; display: flex; gap: 1rem; align-items: baseline; overflow-x: auto; }
  .eyebrow { color: #f0d477; text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; font-weight: 800; }
  code { color: #e8e1c4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dashboard { display: grid; grid-template-columns: 1.1fr .9fr; gap: 1rem; margin-top: 1rem; }
  .panel { padding: 1.15rem; }
  .panel h2 { margin: 0 0 .9rem; font-size: 1rem; color: #d8d6ca; }
  .panel h2:not(:first-child) { margin-top: 1.4rem; }
  .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
  .metrics div { padding: .75rem; border-radius: .55rem; background: #22231f; display: flex; align-items: baseline; justify-content: space-between; gap: .8rem; }
  .metrics span { color: #9b9d94; font-size: .84rem; }
  .metrics strong { font-size: 1.1rem; }
  .contour { font: 700 1.35rem/1.8 ui-monospace, SFMono-Regular, Menlo, monospace; color: #f0d477; overflow-wrap: anywhere; }
  .motif-result { color: #b8b7b0; }
  .experiment { margin-top: 1rem; padding: 1.25rem; display: grid; grid-template-columns: .8fr 1.2fr; gap: 1.3rem; }
  .experiment h2 { margin: .35rem 0 .5rem; }
  .experiment p { margin: 0; color: #aaa9a2; line-height: 1.5; }
  .ab-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
  .ab-grid article { background: #22231f; border-radius: .65rem; padding: 1rem; display: grid; gap: .55rem; }
  .ab-grid h3 { margin: 0; font-size: .95rem; }
  .ab-grid span { color: #92938b; font-size: .82rem; }
  .back { margin-top: 1.4rem; }
  @media (max-width: 800px) {
    .melody-lab { padding: 1rem; }
    .lab-header { display: grid; }
    .toolbar { justify-content: flex-start; }
    .dashboard, .experiment { grid-template-columns: 1fr; }
  }
  @media (max-width: 540px) {
    .metrics, .ab-grid { grid-template-columns: 1fr; }
  }
</style>
