<script lang="ts">
  import * as Tone from "tone";
  import { onDestroy, onMount, tick } from "svelte";
  import type { AudioGenerator, FoldingPlan, FoldingStep, GenerationReport, IslandScene, MusicEvent, MusicEventKind, MusicScore, PathPoint, SoundField, SoundObject, SoundObjectVisual, SpatialScore } from "../core/types";
  import type { AudioDebugAnalysis } from "../audio/AudioEngine";
  import { terrainGroundY } from "../core/terrain";
  import { parseIslandScene } from "../data/schema";
  import { loadScene } from "../data/loadScene";
  import { demoScores } from "../generation/demoScores";
  import { toSpatialScore } from "../generation/clustering";
  import { generateSceneFromScores } from "../generation/sceneGenerator";
  import { parseMidiFile } from "../music/midi";
  import { velocityToGain } from "../music/velocity";
  import { MuseekaRenderer } from "../graphics/MuseekaRenderer";
  import { MuseekaRuntime, type RuntimeMode } from "../runtime/MuseekaRuntime";
  import type { InputDriver } from "../runtime/inputs/InputDriver";
  import { PointerLockDriver } from "../runtime/inputs/PointerLockDriver";
  import { DragLookDriver } from "../runtime/inputs/DragLookDriver";
  import { ClickToGoDriver } from "../runtime/inputs/ClickToGoDriver";
  import { downloadJson, loadStudioScene, saveStudioScene } from "../studio/storage";

  type VisualMidiNote = {
    id: string;
    note: string;
    midi: number;
    time: number;
    duration: number;
    ticks?: number;
    durationTicks?: number;
    velocity: number;
    channel: number;
    trackName: string;
    kind: MusicEventKind;
  };

  type RawMidiRow = VisualMidiNote & {
    source: "MIDI" | "score interne";
    eventId: string;
  };

  type PhraseMotif = {
    id: string;
    notes: string[];
    occurrences: MusicEvent[];
  };

  type PitchRange = {
    min: number;
    max: number;
  };

  type StudioStage = "source" | "analysis" | "spatial-fold";

  const studioSteps: Array<{ id: StudioStage; label: string }> = [
    { id: "source", label: "Source MIDI" },
    { id: "analysis", label: "Analyse" },
    { id: "spatial-fold", label: "Spatial + Pliage" }
  ];

  let host: HTMLDivElement | null = null;
  let scene: IslandScene | null = null;
  let renderer: MuseekaRenderer | null = null;
  let runtime: MuseekaRuntime | null = null;
  let scorePlayer: Tone.PolySynth | null = null;
  let studioStage: StudioStage = "source";
  let selectedObjectId = "";
  let selectedPathId = "";
  let status = "";
  let frame = 0;
  let lastTime = performance.now();
  let studioPlaying = true;
  let debug = true;
  let audioRecording = false;
  let audioDebugStatus = "";
  let audioAnalysis: AudioDebugAnalysis | null = null;
  let audioRecordingUrl = "";
  let sourceScores: MusicScore[] = [];
  let spatialScores: SpatialScore[] = [];
  let generationReports: GenerationReport[] = [];
  let foldingPlans: FoldingPlan[] = [];
  let foldingStepIndex = -1;
  let foldingPlaying = false;
  let foldingPlayTimer = 0;
  let analysisOnlyErrors = true;
  const ANALYSIS_DISPLAY_LIMIT = 80;

  type DriverKey = "pointerlock" | "drag" | "click";
  let runtimeMode: RuntimeMode = "path";
  let driverKey: DriverKey = "pointerlock";
  let activeDriver: InputDriver | null = null;
  let driverHint = "";
  let midiPlaying = false;
  let midiPlaybackProgress = 0;
  let midiPlaybackCursor = 0;
  let midiPlaybackDuration = 0;
  let midiPlaybackFrame = 0;
  let midiStatus = "";

  $: selectedObject = scene?.soundObjects.find((object) => object.id === selectedObjectId) ?? null;
  $: selectedPath = scene?.paths.find((path) => path.id === selectedPathId) ?? scene?.paths[0] ?? null;
  $: selectedScore = sourceScores.find((score) => pathIdForScore(score.id) === selectedPathId) ?? sourceScores[0] ?? null;
  $: selectedSpatialScore = selectedScore ? (spatialScores.find((score) => score.id === `${selectedScore.id}_spatial`) ?? null) : null;
  $: selectedReport = selectedPath ? (generationReports.find((report) => report.pathId === selectedPath.id) ?? null) : null;
  $: selectedFoldingPlan = selectedPath ? (foldingPlans.find((plan) => plan.pathId === selectedPath.id) ?? null) : null;
  $: foldingTotalSteps = selectedFoldingPlan?.steps.length ?? 0;
  $: foldingStep = selectedFoldingPlan && foldingStepIndex >= 0 ? (selectedFoldingPlan.steps[Math.min(foldingStepIndex, foldingTotalSteps - 1)] ?? null) : null;
  $: analysisAllRows = selectedFoldingPlan?.analysis ? buildAnalysisRows(selectedFoldingPlan.analysis) : [];
  $: filteredAnalysisRows = analysisOnlyErrors ? analysisAllRows.filter((row) => row.status !== "matched") : analysisAllRows;
  $: analysisRows = filteredAnalysisRows.slice(0, ANALYSIS_DISPLAY_LIMIT);
  $: analysisRowsTotal = filteredAnalysisRows.length;
  $: eventKindCounts = selectedScore ? countBy(selectedScore.events, (event) => event.kind) : {};
  $: roleCounts = selectedSpatialScore ? countBy(selectedSpatialScore.events, (event) => event.role) : {};
  $: intentCounts = selectedSpatialScore ? countBy(selectedSpatialScore.events, (event) => event.spatialIntent) : {};
  $: analyzedEvents = selectedScore?.events.slice(0, studioStage === "analysis" ? 80 : 16) ?? [];
  $: phraseMotifs = selectedScore ? phraseMotifsForScore(selectedScore) : [];
  $: phraseMotifLabels = phraseMotifLabelsByEvent(phraseMotifs);
  $: foldedClusters = selectedReport?.clusters.slice(0, 14) ?? [];
  $: visualMidiNotes = selectedScore ? notesForScore(selectedScore) : [];
  $: displayedMidiNotes = visualMidiNotes.slice(0, 700);
  $: rawMidiRows = selectedScore ? rawRowsForScore(selectedScore) : [];
  $: displayedRawMidiRows = rawMidiRows.slice(0, studioStage === "source" ? 200 : 80);
  $: pitchRange = rangeForNotes(visualMidiNotes);
  $: trackSummaries = summarizeTracks(visualMidiNotes);
  $: midiPlaybackDuration = selectedScore?.duration ?? 0;

  onMount(async () => {
    try {
      const generatedDemo = generateSceneFromScores(demoScores, 12345);
      const savedScene = loadStudioScene();
      scene = savedScene ?? generatedDemo.scene;
      sourceScores = savedScene ? [] : demoScores;
      spatialScores = savedScene ? [] : demoScores.map(toSpatialScore);
      generationReports = savedScene ? [] : generatedDemo.reports;
      foldingPlans = savedScene ? [] : generatedDemo.plans;
      selectedPathId = scene.settings.defaultPathId;
      selectedObjectId = scene.soundObjects[0]?.id ?? "";
      foldingStepIndex = computeLastStepIndex();
      loop(lastTime);
    } catch (caught) {
      status = caught instanceof Error ? caught.message : String(caught);
    }
  });

  function computeLastStepIndex(): number {
    const plan = foldingPlans.find((candidate) => candidate.pathId === selectedPathId) ?? foldingPlans[0];
    return plan ? plan.steps.length - 1 : -1;
  }

  function partialSceneForStep(step: FoldingStep | null): IslandScene | null {
    if (!scene) return null;
    if (!step) return scene;
    const stepPath: PathPoint[] = step.pathSnapshot.length >= 2 ? step.pathSnapshot : [{ t: 0, p: [0, 14, -30] }, { t: 1, p: [0, 14, 30] }];
    const fullPath = scene.paths.find((candidate) => candidate.id === selectedPathId) ?? scene.paths[0];
    if (!fullPath) return scene;
    const stagedPath = { ...fullPath, points: stepPath };
    return {
      ...scene,
      paths: scene.paths.map((path) => (path.id === stagedPath.id ? stagedPath : path)),
      soundObjects: step.objectsAfter.length > 0 ? step.objectsAfter : scene.soundObjects,
      settings: { ...scene.settings, defaultPathId: stagedPath.id }
    };
  }

  onDestroy(() => {
    cancelAnimationFrame(frame);
    stopMidiPlayback();
    stopFoldingPlayback();
    detachDriver();
    renderer?.dispose();
    runtime?.dispose();
    if (audioRecordingUrl) URL.revokeObjectURL(audioRecordingUrl);
  });

  async function rebuildRenderer() {
    if (!scene) return;
    renderer?.dispose();
    runtime?.dispose();
    await tick();
    if (!host) return;
    const lastIndex = computeLastStepIndex();
    const activeScene = foldingStepIndex >= 0 && foldingStepIndex < lastIndex && foldingStep
      ? partialSceneForStep(foldingStep) ?? scene
      : scene;
    renderer = new MuseekaRenderer(host, activeScene);
    renderer.setSelectedPath(selectedPathId || activeScene.settings.defaultPathId);
    renderer.setDebug(debug);
    runtime = new MuseekaRuntime(activeScene);
    runtime.setPlaying(studioPlaying);
  }

  async function setStudioStage(stage: StudioStage) {
    studioStage = stage;
    if (stage === "spatial-fold") {
      await rebuildRenderer();
      return;
    }

    stopFoldingPlayback();
    detachDriver();
    runtimeMode = "path";
    renderer?.dispose();
    renderer = null;
    runtime?.dispose();
    runtime = null;
  }

  function setFoldingStepIndex(index: number) {
    const lastIndex = (selectedFoldingPlan?.steps.length ?? 0) - 1;
    foldingStepIndex = Math.max(-1, Math.min(lastIndex, index));
    void rebuildRenderer();
  }

  function nextFoldingStep() {
    const lastIndex = (selectedFoldingPlan?.steps.length ?? 0) - 1;
    if (foldingStepIndex >= lastIndex) {
      stopFoldingPlayback();
      return;
    }
    setFoldingStepIndex(foldingStepIndex + 1);
  }

  function previousFoldingStep() {
    setFoldingStepIndex(foldingStepIndex - 1);
  }

  function resetFolding() {
    stopFoldingPlayback();
    setFoldingStepIndex(0);
  }

  function jumpToFinalFolding() {
    stopFoldingPlayback();
    setFoldingStepIndex((selectedFoldingPlan?.steps.length ?? 0) - 1);
  }

  function stopFoldingPlayback() {
    if (foldingPlayTimer) {
      window.clearTimeout(foldingPlayTimer);
      foldingPlayTimer = 0;
    }
    foldingPlaying = false;
  }

  function playAllFoldingSteps() {
    if (foldingPlaying) {
      stopFoldingPlayback();
      return;
    }
    foldingPlaying = true;
    const tick = () => {
      if (!foldingPlaying) return;
      const lastIndex = (selectedFoldingPlan?.steps.length ?? 0) - 1;
      if (foldingStepIndex >= lastIndex) {
        stopFoldingPlayback();
        return;
      }
      setFoldingStepIndex(foldingStepIndex + 1);
      foldingPlayTimer = window.setTimeout(tick, 900);
    };
    foldingPlayTimer = window.setTimeout(tick, 600);
  }

  type AnalysisRow = {
    expectedTime: string;
    kind: string;
    expectedNote: string;
    producedNote: string;
    midiDelta: string;
    timeDelta: string;
    statusLabel: string;
    status: "matched" | "wrong-pitch" | "missing" | "extra";
  };

  function midiToNoteLabel(midi: number): string {
    if (midi <= 0) return "-";
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const pc = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    return `${names[pc]}${octave}`;
  }

  function buildAnalysisRows(analysis: NonNullable<FoldingPlan["analysis"]>): AnalysisRow[] {
    const rows: AnalysisRow[] = [];
    for (const match of analysis.matches) {
      rows.push({
        expectedTime: match.expected.time.toFixed(2),
        kind: match.expected.kind,
        expectedNote: midiToNoteLabel(match.expected.midi),
        producedNote: midiToNoteLabel(match.produced.midi),
        midiDelta: match.midiDelta === 0 ? "0" : (match.midiDelta > 0 ? `+${match.midiDelta}` : `${match.midiDelta}`),
        timeDelta: `${match.timeDelta >= 0 ? "+" : ""}${match.timeDelta.toFixed(2)}s`,
        statusLabel: match.status === "matched" ? "✓ correcte" : `✗ pitch (${match.midiDelta > 0 ? "+" : ""}${match.midiDelta})`,
        status: match.status === "matched" ? "matched" : "wrong-pitch"
      });
    }
    for (const miss of analysis.missing) {
      rows.push({
        expectedTime: miss.time.toFixed(2),
        kind: miss.kind,
        expectedNote: midiToNoteLabel(miss.midi),
        producedNote: "—",
        midiDelta: "—",
        timeDelta: "—",
        statusLabel: "✗ manquante",
        status: "missing"
      });
    }
    for (const extra of analysis.extra) {
      rows.push({
        expectedTime: extra.time.toFixed(2),
        kind: extra.kind,
        expectedNote: "—",
        producedNote: midiToNoteLabel(extra.midi),
        midiDelta: "—",
        timeDelta: "—",
        statusLabel: `✗ en trop (${extra.sourceObjectId})`,
        status: "extra"
      });
    }
    rows.sort((a, b) => parseFloat(a.expectedTime) - parseFloat(b.expectedTime));
    return rows;
  }

  function exportRenderAnalysis() {
    if (!selectedFoldingPlan || !selectedFoldingPlan.analysis || !selectedScore) return;
    const payload = {
      score: {
        id: selectedScore.id,
        name: selectedScore.name,
        duration: selectedScore.duration,
        events: selectedScore.events
      },
      pathId: selectedFoldingPlan.pathId,
      anchors: selectedFoldingPlan.anchors,
      motifs: selectedFoldingPlan.motifs.map((motif) => ({
        id: motif.id,
        signature: motif.signature,
        occurrences: motif.occurrences.length,
        reuseScore: motif.reuseScore
      })),
      analysis: selectedFoldingPlan.analysis
    };
    downloadJson(`museeka_render_analysis_${selectedScore.id}.json`, payload);
    status = `Analyse du rendu exportée pour ${selectedScore.name}.`;
  }

  function describeStepKind(kind: FoldingStep["kind"]): string {
    switch (kind) {
      case "init_anchors": return "Init ancres";
      case "weave_motif": return "Motif";
      case "weave_residual_note": return "Notes résiduelles";
      case "weave_aggregate": return "Agrégats";
      case "check_speed": return "Vitesse";
      case "smooth": return "Lissage";
    }
  }

  function loop(now: number) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (runtime && renderer) {
      if (runtimeMode === "path") {
        runtime.setPlaying(studioPlaying);
      }
      if (runtimeMode === "freefly" && activeDriver) {
        runtime.setFreeFlyInput(activeDriver.consume());
        driverHint = activeDriver.needsUiHint();
      }
      const snapshot = runtime.update(dt);
      renderer.render(snapshot);
    }

    frame = requestAnimationFrame(loop);
  }

  function buildDriver(key: DriverKey): InputDriver {
    if (key === "drag") return new DragLookDriver();
    if (key === "click") return new ClickToGoDriver();
    return new PointerLockDriver();
  }

  function attachDriver() {
    if (!renderer || activeDriver) return;
    activeDriver = buildDriver(driverKey);
    activeDriver.attach({
      canvas: renderer.getCanvas(),
      getCameraDirection: () => ({ yaw: runtime?.freeFly.getYaw() ?? 0, pitch: runtime?.freeFly.getPitch() ?? 0 }),
      raycastToTerrain: (x, y) => renderer?.raycastToTerrain(x, y) ?? null
    });
    driverHint = activeDriver.needsUiHint();
  }

  function detachDriver() {
    activeDriver?.detach();
    activeDriver = null;
    driverHint = "";
  }

  function enterFreeFly() {
    if (!runtime) return;
    runtime.setMode("freefly");
    runtimeMode = "freefly";
    attachDriver();
  }

  function exitFreeFly() {
    if (!runtime) return;
    detachDriver();
    runtime.setMode("path");
    runtimeMode = "path";
  }

  function changeDriver() {
    if (runtimeMode !== "freefly") return;
    detachDriver();
    attachDriver();
  }

  function holdVerticalButton(direction: "up" | "down", pressed: boolean) {
    if (activeDriver instanceof ClickToGoDriver) {
      activeDriver.setVerticalButton(direction, pressed);
    }
  }

  function setScene(next: IslandScene, message: string) {
    scene = parseIslandScene(next);
    selectedPathId = scene.settings.defaultPathId;
    selectedObjectId = scene.soundObjects.find((object) => object.id === selectedObjectId)?.id ?? scene.soundObjects[0]?.id ?? "";
    status = message;
    foldingStepIndex = computeLastStepIndex();
    if (studioStage === "spatial-fold") {
      void rebuildRenderer();
    }
  }

  function pathIdForScore(scoreId: string) {
    return scoreId.replace(/_/g, "-");
  }

  function countBy<T, K extends string>(items: T[], read: (item: T) => K): Record<K, number> {
    return items.reduce(
      (acc, item) => {
        const key = read(item);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      },
      {} as Record<K, number>
    );
  }

  function formatSeconds(value: number) {
    return `${value.toFixed(1)}s`;
  }

  function eventNotes(event: MusicEvent) {
    return event.notes.join(" ");
  }

  function phraseMotifKey(event: MusicEvent) {
    return event.notes.join(" ");
  }

  function phraseMotifsForScore(score: MusicScore): PhraseMotif[] {
    const motifs = new Map<string, PhraseMotif>();

    for (const event of score.events) {
      if (event.kind !== "phrase") continue;
      const key = phraseMotifKey(event);
      const motif = motifs.get(key) ?? {
        id: `motif_${motifs.size + 1}`,
        notes: event.notes,
        occurrences: []
      };
      motif.occurrences.push(event);
      motifs.set(key, motif);
    }

    return Array.from(motifs.values()).sort((a, b) => a.occurrences[0].time - b.occurrences[0].time);
  }

  function eventTimes(events: MusicEvent[]) {
    return events.map((event) => formatSeconds(event.time)).join(", ");
  }

  function phraseMotifLabelsByEvent(motifs: PhraseMotif[]) {
    const labels = new Map<string, string>();
    motifs.forEach((motif, index) => {
      for (const event of motif.occurrences) {
        labels.set(event.id, `motif ${index + 1}`);
      }
    });
    return labels;
  }

  function motifLabelForEvent(event: MusicEvent) {
    return phraseMotifLabels.get(event.id) ?? "-";
  }

  function compactObjectId(id: string) {
    return id.replace(/^path-[^_]+_/, "").replace(/^cluster_/, "");
  }

  function kindExplanation(kind: MusicEventKind) {
    const explanations: Record<MusicEventKind, string> = {
      note: "note isolée gardée comme événement simple",
      chord: "notes simultanées regroupées en accord",
      phrase: "suite courte de notes rapprochées regroupée",
      drone: "note ou accord long traité comme nappe",
      percussion: "impact rythmique détecté sur une piste percussive"
    };
    return explanations[kind];
  }

  function noteMidiNumber(note: string) {
    const midi = Tone.Frequency(note).toMidi();
    return Number.isFinite(midi) ? midi : 60;
  }

  function notesForEvent(event: MusicEvent): VisualMidiNote[] {
    if (event.kind === "phrase") {
      const step = event.notes.length > 1 ? event.duration / event.notes.length : 0;
      const duration = Math.max(0.08, step * 0.8 || event.duration);
      return event.notes.map((note, index) => ({
        id: `${event.id}_${index}`,
        note,
        midi: noteMidiNumber(note),
        time: event.time + index * step,
        duration,
        velocity: event.velocity,
        channel: event.channel,
        trackName: "Score analysé",
        kind: event.kind
      }));
    }

    return event.notes.map((note, index) => ({
      id: `${event.id}_${index}`,
      note,
      midi: noteMidiNumber(note),
      time: event.time,
      duration: Math.max(0.08, event.duration),
      velocity: event.velocity,
      channel: event.channel,
      trackName: "Score analysé",
      kind: event.kind
    }));
  }

  function notesForScore(score: MusicScore): VisualMidiNote[] {
    const trackNotes = score.tracks?.flatMap((track) =>
      track.notes.map((note) => ({
        id: note.id,
        note: note.note,
        midi: note.midi,
        time: note.time,
        duration: Math.max(0.05, note.duration),
        ticks: note.ticks,
        durationTicks: note.durationTicks,
        velocity: note.velocity,
        channel: note.channel,
        trackName: note.trackName || track.name,
        kind: "note" as const
      }))
    );

    return (trackNotes?.length ? trackNotes : score.events.flatMap(notesForEvent)).sort((a, b) => a.time - b.time || a.midi - b.midi);
  }

  function rawRowsForScore(score: MusicScore): RawMidiRow[] {
    if (score.tracks?.some((track) => track.notes.length > 0)) {
      return score.tracks
        .flatMap((track) =>
          track.notes.map((note) => ({
            id: note.id,
            eventId: note.id,
            source: "MIDI" as const,
            note: note.note,
            midi: note.midi,
            time: note.time,
            duration: note.duration,
            ticks: note.ticks,
            durationTicks: note.durationTicks,
            velocity: note.velocity,
            channel: note.channel,
            trackName: note.trackName || track.name,
            kind: "note" as const
          }))
        )
        .sort((a, b) => a.time - b.time || a.midi - b.midi);
    }

    return score.events
      .flatMap((event) =>
        notesForEvent(event).map((note) => ({
          ...note,
          eventId: event.id,
          source: "score interne" as const
        }))
      )
      .sort((a, b) => a.time - b.time || a.midi - b.midi);
  }

  function formatTick(value: number | undefined) {
    return typeof value === "number" ? String(value) : "-";
  }

  function rangeForNotes(notes: VisualMidiNote[]): PitchRange {
    if (!notes.length) return { min: 48, max: 72 };
    const min = Math.min(...notes.map((note) => note.midi));
    const max = Math.max(...notes.map((note) => note.midi));
    return { min: Math.max(0, min - 2), max: Math.min(127, max + 2) };
  }

  function trackColor(index: number) {
    const colors = ["#fff1a8", "#7dc7ff", "#8fe388", "#e8a2ff", "#ff9d8d", "#8ff0d2", "#d2d7ff"];
    return colors[Math.abs(index) % colors.length];
  }

  function summarizeTracks(notes: VisualMidiNote[]) {
    const byTrack = new Map<string, { name: string; channel: number; count: number; color: string }>();
    for (const note of notes) {
      const key = `${note.trackName}_${note.channel}`;
      const current = byTrack.get(key) ?? { name: note.trackName, channel: note.channel, count: 0, color: trackColor(byTrack.size) };
      current.count += 1;
      byTrack.set(key, current);
    }
    return Array.from(byTrack.values()).slice(0, 6);
  }

  function midiNoteStyle(note: VisualMidiNote, range: PitchRange, duration: number) {
    const total = Math.max(0.1, duration);
    const pitchSpan = Math.max(1, range.max - range.min);
    const left = Math.max(0, Math.min(100, (note.time / total) * 100));
    const width = Math.max(0.35, Math.min(100 - left, (note.duration / total) * 100));
    const bottom = Math.max(2, Math.min(92, ((note.midi - range.min) / pitchSpan) * 92 + 2));
    const height = Math.max(3, Math.min(12, 92 / Math.max(8, pitchSpan)));
    const color = trackColor(note.channel);
    return `left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;bottom:${bottom.toFixed(3)}%;height:${height.toFixed(2)}px;background:${color};opacity:${(0.42 + note.velocity * 0.56).toFixed(2)};`;
  }

  function cursorStyle() {
    return `left:${Math.max(0, Math.min(100, midiPlaybackProgress * 100)).toFixed(2)}%;`;
  }

  async function toggleMidiPlayback() {
    if (midiPlaying) {
      stopMidiPlayback();
      midiStatus = "Lecture MIDI arrêtée.";
      return;
    }
    await playSelectedScore();
  }

  async function playSelectedScore() {
    if (!selectedScore) return;
    const notes = notesForScore(selectedScore);
    if (!notes.length) {
      midiStatus = "Aucune note à jouer dans cette source.";
      return;
    }

    stopMidiPlayback();
    await Tone.start();
    scorePlayer = new Tone.PolySynth(Tone.Synth).toDestination();
    scorePlayer.volume.value = -8;

    const startAt = Tone.now() + 0.08;
    midiPlaybackDuration = Math.max(selectedScore.duration, ...notes.map((note) => note.time + note.duration));
    midiPlaybackCursor = 0;
    midiPlaybackProgress = 0;
    midiPlaying = true;
    midiStatus = `Lecture MIDI source: ${notes.length} notes.`;

    for (const note of notes) {
      scorePlayer.triggerAttackRelease(note.note, Math.max(0.05, note.duration), startAt + note.time, velocityToGain(note.velocity));
    }

    const startedAt = performance.now() + 80;
    const animate = () => {
      if (!midiPlaying) return;
      midiPlaybackCursor = Math.max(0, (performance.now() - startedAt) / 1000);
      midiPlaybackProgress = midiPlaybackDuration > 0 ? Math.min(1, midiPlaybackCursor / midiPlaybackDuration) : 1;
      if (midiPlaybackProgress >= 1) {
        stopMidiPlayback(true);
        midiStatus = "Lecture MIDI terminée.";
        return;
      }
      midiPlaybackFrame = requestAnimationFrame(animate);
    };
    midiPlaybackFrame = requestAnimationFrame(animate);
  }

  function stopMidiPlayback(finished = false) {
    if (midiPlaybackFrame) {
      cancelAnimationFrame(midiPlaybackFrame);
      midiPlaybackFrame = 0;
    }
    scorePlayer?.dispose();
    scorePlayer = null;
    midiPlaying = false;
    midiPlaybackCursor = finished ? midiPlaybackDuration : 0;
    midiPlaybackProgress = finished && midiPlaybackDuration > 0 ? 1 : 0;
  }

  function selectFoldedObject(objectId: string) {
    selectedObjectId = objectId;
    status = `Objet sélectionné depuis le pliage: ${objectId}`;
  }

  function selectPath() {
    stopMidiPlayback();
    stopFoldingPlayback();
    foldingStepIndex = computeLastStepIndex();
    renderer?.setSelectedPath(selectedPathId);
    if (!scene) return;
    selectedObjectId = scene.soundObjects.find((object) => object.id.startsWith(`${selectedPathId}_`))?.id ?? scene.soundObjects[0]?.id ?? "";
    if (studioStage === "spatial-fold") {
      void rebuildRenderer();
    }
  }

  async function importMidi(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    stopMidiPlayback();
    const score = await parseMidiFile(file);
    const generated = generateSceneFromScores([score], 777);
    sourceScores = [score];
    spatialScores = [toSpatialScore(score)];
    generationReports = generated.reports;
    foldingPlans = generated.plans;
    setScene(generated.scene, `MIDI importé: ${score.events.length} événements, ${generated.scene.soundObjects.length} objets, ${generated.plans[0]?.motifs.length ?? 0} motifs détectés.`);
  }

  async function importJson(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    stopMidiPlayback();
    sourceScores = [];
    spatialScores = [];
    generationReports = [];
    foldingPlans = [];
    setScene(parseIslandScene(JSON.parse(await file.text())), "Scène JSON importée.");
  }

  function saveLocal() {
    if (!scene) return;
    saveStudioScene(scene);
    status = "Scène sauvegardée localement.";
  }

  function exportScene() {
    if (!scene) return;
    downloadJson("museeka_demo_scene.json", scene);
    status = "Scène JSON exportée: IslandScene finale pour la démo publique, sans MIDI source ni rapport d'analyse.";
  }

  function addObject() {
    if (!scene) return;
    const id = `studio_object_${Date.now()}`;
    const ground = terrainGroundY(0, 0, scene.terrain);
    const object: SoundObject = {
      id,
      kind: "crystal",
      transform: { position: [0, ground + 0.15, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      field: { shape: "ellipsoid", params: { radius: [4, 10, 4] }, falloff: { distance: { type: "smoothstep" } } },
      trigger: { mode: "enter", threshold: 0.35, cooldown: 0.45, retrigger: true },
      audio: { generator: "note", instrument: "glass_bell", baseNote: "C4", duration: 0.35, velocity: 0.8 },
      mappings: [
        { input: "field.intensity", output: "volume", curve: { type: "smoothstep" }, range: [0, 1] },
        { input: "encounter.approachSpeed", output: "brightness", curve: { type: "linear" }, range: [0.2, 1], clampInput: [0, 8] }
      ],
      visual: { model: "crystal", color: "#8ff0d2", activeGlow: true }
    };
    scene = { ...scene, soundObjects: [...scene.soundObjects, object] };
    selectedObjectId = id;
    status = "Objet créé.";
    void rebuildRenderer();
  }

  function deleteObject() {
    if (!scene || !selectedObject) return;
    scene = { ...scene, soundObjects: scene.soundObjects.filter((object) => object.id !== selectedObject.id) };
    selectedObjectId = scene.soundObjects[0]?.id ?? "";
    status = "Objet supprimé.";
    void rebuildRenderer();
  }

  function updateSelectedObject(updater: (object: SoundObject) => SoundObject) {
    if (!scene || !selectedObject) return;
    scene = {
      ...scene,
      soundObjects: scene.soundObjects.map((object) => (object.id === selectedObject.id ? updater(object) : object))
    };
    void rebuildRenderer();
  }

  function updatePosition(axis: 0 | 1 | 2, value: number) {
    updateSelectedObject((object) => {
      const position = [...object.transform.position] as [number, number, number];
      position[axis] = value;
      return { ...object, transform: { ...object.transform, position } };
    });
  }

  function updateFieldShape(shape: SoundField["shape"]) {
    const next: Record<SoundField["shape"], SoundField> = {
      sphere: { shape: "sphere", params: { radius: 4 }, falloff: { distance: { type: "smoothstep" } } },
      ellipsoid: { shape: "ellipsoid", params: { radius: [5, 8, 5] }, falloff: { distance: { type: "smoothstep" } } },
      cone: { shape: "cone", params: { range: 10, angleDegrees: 65, direction: [0, 0, 1] }, falloff: { distance: { type: "smoothstep" } } },
      ring: { shape: "ring", params: { centerRadius: 6, thickness: 2, heightRange: [-2, 5] }, falloff: { distance: { type: "plateau", inner: 0.2, outer: 1 } } }
    };
    updateSelectedObject((object) => ({ ...object, field: next[shape] }));
  }

  function updateRadius(value: number) {
    updateSelectedObject((object) => {
      if (object.field.shape === "sphere") return { ...object, field: { ...object.field, params: { radius: value } } };
      if (object.field.shape === "ellipsoid") return { ...object, field: { ...object.field, params: { radius: [value, value * 1.5, value] } } };
      if (object.field.shape === "cone") return { ...object, field: { ...object.field, params: { ...object.field.params, range: value * 2.2 } } };
      return { ...object, field: { ...object.field, params: { ...object.field.params, centerRadius: value } } };
    });
  }

  function updateAudioGenerator(generator: AudioGenerator["generator"]) {
    const next: Record<AudioGenerator["generator"], AudioGenerator> = {
      note: { generator: "note", instrument: "glass_bell", baseNote: "C4", duration: 0.35, velocity: 0.8 },
      chord: { generator: "chord", instrument: "warm_pad", notes: ["C3", "E3", "G3"], duration: 1.1, velocity: 0.7 },
      phrase: { generator: "phrase", instrument: "flute", notes: [{ dt: 0, note: "E5", duration: 0.16 }, { dt: 0.18, note: "G5", duration: 0.18 }] },
      drone: { generator: "drone", instrument: "low_pad", notes: ["C2", "G2"], continuous: true, velocity: 0.55 },
      percussion: { generator: "percussion", instrument: "woodblock", pattern: [{ dt: 0, velocity: 0.85 }, { dt: 0.2, velocity: 0.55 }] }
    };
    updateSelectedObject((object) => ({ ...object, audio: next[generator], trigger: { ...object.trigger, mode: generator === "drone" ? "continuous" : "enter" } }));
  }

  function updateNoteList(value: string) {
    const notes = value.split(",").map((note) => note.trim()).filter(Boolean);
    updateSelectedObject((object) => {
      if (object.audio.generator === "note") return { ...object, audio: { ...object.audio, baseNote: notes[0] ?? "C4" } };
      if (object.audio.generator === "chord" || object.audio.generator === "drone") return { ...object, audio: { ...object.audio, notes: notes.length ? notes : ["C4"] } };
      if (object.audio.generator === "phrase") return { ...object, audio: { ...object.audio, notes: (notes.length ? notes : ["C5"]).map((note, index) => ({ dt: index * 0.18, note, duration: 0.16 })) } };
      return object;
    });
  }

  function updateVisualModel(model: SoundObjectVisual["model"]) {
    updateSelectedObject((object) => ({ ...object, kind: model, visual: { ...object.visual, model } }));
  }

  async function previewObject() {
    if (!runtime || !selectedObject) return;
    await runtime.unlockAudio();
    runtime.audio.triggerPreview(selectedObject);
  }

  async function recordAudioDebug() {
    if (!runtime || audioRecording) return;
    audioRecording = true;
    audioDebugStatus = "Enregistrement audio 5s...";
    studioPlaying = true;

    try {
      await runtime.audio.startDebugRecording();
      window.setTimeout(async () => {
        if (!runtime) return;
        const result = await runtime.audio.stopDebugRecording();
        if (audioRecordingUrl) URL.revokeObjectURL(audioRecordingUrl);
        audioRecordingUrl = URL.createObjectURL(result.blob);
        audioAnalysis = result.analysis;
        audioDebugStatus = `RMS ${result.analysis.rms.toFixed(4)} · peak ${result.analysis.peak.toFixed(3)} · voix continues ${result.analysis.activeContinuousVoices}`;
        audioRecording = false;
      }, 5000);
    } catch (caught) {
      audioDebugStatus = caught instanceof Error ? caught.message : String(caught);
      audioRecording = false;
    }
  }

  function currentNotes(object: SoundObject): string {
    if (object.audio.generator === "note") return object.audio.baseNote;
    if (object.audio.generator === "chord" || object.audio.generator === "drone") return object.audio.notes.join(", ");
    if (object.audio.generator === "phrase") return object.audio.notes.map((note) => note.note).join(", ");
    return "C2";
  }
</script>

<main class="studio-shell" class:stage-wide={studioStage !== "spatial-fold"}>
  <section class="studio-sidebar">
    <div class="studio-title">
      <span>Museeka Studio</span>
      <small>atelier de composition</small>
    </div>

    <div class="studio-topbar">
      <div class="tool-group">
        <label class="file-button">
          Import MIDI
          <input type="file" accept=".mid,.midi,audio/midi" on:change={importMidi} data-testid="midi-input" />
        </label>
        <label class="file-button">
          Import JSON
          <input type="file" accept="application/json,.json" on:change={importJson} />
        </label>
        <button on:click={saveLocal}>Sauver local</button>
        <button on:click={exportScene} data-testid="export-json">Exporter scène JSON</button>
      </div>

      {#if scene}
        <label class="path-combo">
          <span>Parcours</span>
          <select bind:value={selectedPathId} on:change={selectPath} data-testid="top-path-select">
            {#each scene.paths as path}
              <option value={path.id}>{path.name}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>

    {#if scene}
      <nav class="studio-steps" aria-label="Étapes studio">
        {#each studioSteps as step}
          <button class:active={studioStage === step.id} data-testid={`studio-stage-${step.id}`} on:click={() => void setStudioStage(step.id)}>
            {step.label}
          </button>
        {/each}
      </nav>

      <section class="pipeline-panel" data-testid="pipeline-panel">
        <div class="pipeline-title">
          <span>Analyse → pliage</span>
          <small>{selectedScore?.name ?? "Aucune source musicale chargée"}</small>
        </div>

        {#if selectedScore}
          <div class="pipeline-metrics">
            <span>{selectedScore.events.length} événements</span>
            <span>{visualMidiNotes.length} notes source</span>
            <span>{formatSeconds(selectedScore.duration)}</span>
            <span>{selectedScore.tempo.toFixed(0)} bpm</span>
          </div>

          {#if studioStage === "source"}
          <div class="pipeline-card" data-testid="midi-visualizer">
            <h2>0. Source MIDI</h2>
            <div class="midi-toolbar">
              <button on:click={toggleMidiPlayback} disabled={!visualMidiNotes.length} data-testid="midi-play-button">
                {midiPlaying ? "Stop MIDI" : "Jouer MIDI"}
              </button>
              <span>{formatSeconds(midiPlaybackCursor)} / {formatSeconds(midiPlaybackDuration || selectedScore.duration)}</span>
            </div>
            <div class="progress-track compact">
              <div class="progress-fill" style={`width: ${Math.round(midiPlaybackProgress * 100)}%;`}></div>
            </div>
            <div class="track-legend">
              {#each trackSummaries as track}
                <span><i style={`background:${track.color};`}></i>{track.name} · ch {track.channel} · {track.count}</span>
              {/each}
            </div>
            <div class="midi-roll" data-testid="midi-roll" aria-label="Visualisation MIDI">
              {#each displayedMidiNotes as note}
                <span class="midi-note" style={midiNoteStyle(note, pitchRange, selectedScore.duration)} title={`${note.note} · ${formatSeconds(note.time)} · ${note.trackName}`}></span>
              {/each}
              <span class="midi-cursor" style={cursorStyle()}></span>
            </div>
            <div class="raw-midi-panel" data-testid="raw-midi-table">
              <div class="raw-midi-summary">
                <span>{selectedScore.tracks?.some((track) => track.notes.length > 0) ? "MIDI parsé" : "Score interne reconstruit"}</span>
                <span>{rawMidiRows.length} lignes</span>
                {#if selectedScore.ppq}
                  <span>PPQ {selectedScore.ppq}</span>
                {/if}
              </div>
              <div class="column-help" data-testid="midi-column-help">
                <span><b>#</b> ordre</span>
                <span><b>t</b> début en secondes</span>
                <span><b>dur</b> durée en secondes</span>
                <span><b>note</b> hauteur musicale</span>
                <span><b>midi</b> numéro 0-127</span>
                <span><b>vel</b> vélocité 0-1</span>
                <span><b>ch</b> canal MIDI</span>
                <span><b>tick</b> position MIDI brute</span>
                <span><b>dTick</b> durée en ticks</span>
                <span><b>piste</b> piste ou reconstruction</span>
              </div>
              <div class="raw-midi-table">
                <div class="raw-midi-row raw-midi-head">
                  <span>#</span>
                  <span>t</span>
                  <span>dur</span>
                  <span>note</span>
                  <span>midi</span>
                  <span>vel</span>
                  <span>ch</span>
                  <span>tick</span>
                  <span>dTick</span>
                  <span>piste</span>
                </div>
                {#each displayedRawMidiRows as row, index}
                  <div class="raw-midi-row" title={`${row.source} · ${row.kind} · ${row.trackName} · ${row.eventId}`}>
                    <span>{index + 1}</span>
                    <span>{row.time.toFixed(2)}</span>
                    <span>{row.duration.toFixed(2)}</span>
                    <span>{row.note}</span>
                    <span>{row.midi}</span>
                    <span>{row.velocity.toFixed(2)}</span>
                    <span>{row.channel}</span>
                    <span>{formatTick(row.ticks)}</span>
                    <span>{formatTick(row.durationTicks)}</span>
                    <span>{row.trackName}</span>
                  </div>
                {/each}
              </div>
            </div>
            {#if displayedMidiNotes.length < visualMidiNotes.length}
              <small class="pipeline-hint">{displayedMidiNotes.length} notes affichées sur {visualMidiNotes.length} pour garder l'interface fluide.</small>
            {/if}
            {#if displayedRawMidiRows.length < rawMidiRows.length}
              <small class="pipeline-hint">{displayedRawMidiRows.length} lignes raw affichées sur {rawMidiRows.length}.</small>
            {/if}
            {#if midiStatus}
              <small class="pipeline-hint">{midiStatus}</small>
            {/if}
          </div>

          {:else if studioStage === "analysis"}
          <div class="pipeline-card" data-testid="analysis-events">
            <h2>1. Analyse musicale</h2>
            <div class="analysis-kind-grid">
              {#each Object.entries(eventKindCounts) as [kind, count]}
                <div>
                  <b>
                    {kind}: {count}
                    {#if kind === "phrase" && phraseMotifs.length}
                      · {phraseMotifs.length} motifs distincts
                    {/if}
                  </b>
                  <small>{kindExplanation(kind as MusicEventKind)}</small>
                </div>
              {/each}
            </div>
            {#if phraseMotifs.length}
              <div class="motif-panel" data-testid="phrase-motifs">
                <h3>Motifs de phrase</h3>
                <div class="motif-list">
                  {#each phraseMotifs as motif, index}
                    <div class="motif-row">
                      <b>motif {index + 1} · {motif.occurrences.length} occurrence{motif.occurrences.length > 1 ? "s" : ""}</b>
                      <span>{motif.notes.join(" ")}</span>
                      <em>{eventTimes(motif.occurrences)}</em>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            <div class="event-list">
              <div class="event-row event-head">
                <span>temps</span>
                <span>type</span>
                <span>motif</span>
                <span>notes</span>
              </div>
              {#each analyzedEvents as event}
                <div class="event-row">
                  <b>{formatSeconds(event.time)}</b>
                  <span>{event.kind}</span>
                  <span>{motifLabelForEvent(event)}</span>
                  <em>{eventNotes(event)}</em>
                </div>
              {/each}
            </div>
          </div>

          {:else if studioStage === "spatial-fold"}
          <div class="pipeline-card" data-testid="spatial-fold-panel">
            <h2>2. Spatial + Pliage</h2>
            <div class="chip-row">
              <span>{selectedSpatialScore?.events.length ?? 0} évts spatial</span>
              <span>{selectedFoldingPlan?.anchors.length ?? 0} ancres pitch</span>
              <span>{selectedFoldingPlan?.motifs.length ?? 0} motifs</span>
              <span>{selectedFoldingPlan?.aggregates.length ?? 0} agrégats</span>
              <span>{Math.round((selectedFoldingPlan?.reuseRate ?? 0) * 100)}% réutilisation</span>
            </div>

            {#if selectedFoldingPlan}
              <div class="fold-timeline" data-testid="fold-timeline">
                <div class="fold-controls">
                  <button on:click={resetFolding} title="Île vierge">⏮︎</button>
                  <button on:click={previousFoldingStep} disabled={foldingStepIndex <= 0}>◀︎</button>
                  <button class="primary" on:click={playAllFoldingSteps} data-testid="fold-play-all">
                    {foldingPlaying ? "⏸︎ Pause" : "▶︎ Tout dérouler"}
                  </button>
                  <button on:click={nextFoldingStep} disabled={foldingStepIndex >= foldingTotalSteps - 1}>▶︎</button>
                  <button on:click={jumpToFinalFolding} title="État final">⏭︎</button>
                  <span class="fold-progress">{Math.max(0, foldingStepIndex + 1)} / {foldingTotalSteps}</span>
                </div>

                <ol class="fold-step-list">
                  {#each selectedFoldingPlan.steps as step, index}
                    <li class:active={index === foldingStepIndex} class:past={index < foldingStepIndex}>
                      <button on:click={() => setFoldingStepIndex(index)}>
                        <b>{index + 1}. {describeStepKind(step.kind)}</b>
                        <em>{step.description}</em>
                      </button>
                    </li>
                  {/each}
                </ol>
              </div>

              {#if selectedFoldingPlan.motifs.length > 0}
                <div class="motif-panel" data-testid="detected-motifs">
                  <h3>Motifs réutilisés</h3>
                  <div class="motif-list">
                    {#each selectedFoldingPlan.motifs as motif}
                      <div class="motif-row">
                        <b>{motif.id} · {motif.occurrences.length} occurrences</b>
                        <span>intervalles: {motif.signature.intervals.join(" ")}</span>
                        <em>gain {motif.reuseScore} note(s)</em>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if selectedFoldingPlan.analysis}
                <div class="analysis-panel" data-testid="render-analysis">
                  <div class="analysis-header">
                    <h3>Analyse du rendu (simulation déterministe)</h3>
                    <button on:click={exportRenderAnalysis} data-testid="export-analysis">Exporter JSON</button>
                  </div>
                  <div class="chip-row">
                    <span class="chip-good">{selectedFoldingPlan.analysis.counts.matched} correctes</span>
                    <span class="chip-warn">{selectedFoldingPlan.analysis.counts.wrongPitch} hauteur fausse</span>
                    <span class="chip-bad">{selectedFoldingPlan.analysis.counts.missing} manquantes</span>
                    <span class="chip-bad">{selectedFoldingPlan.analysis.counts.extra} en trop</span>
                    <span>sur {selectedFoldingPlan.analysis.counts.expected} attendues · précision {(selectedFoldingPlan.analysis.accuracy * 100).toFixed(1)}%</span>
                  </div>

                  <div class="analysis-controls">
                    <label class="inline">
                      <input type="checkbox" bind:checked={analysisOnlyErrors} />
                      Afficher uniquement les erreurs
                    </label>
                  </div>

                  <div class="analysis-table">
                    <div class="analysis-row analysis-head">
                      <span>t attendu</span>
                      <span>type</span>
                      <span>note att.</span>
                      <span>note prod.</span>
                      <span>Δ semitones</span>
                      <span>Δ temps</span>
                      <span>statut</span>
                    </div>
                    {#each analysisRows as row}
                      <div class="analysis-row analysis-status-{row.status}">
                        <span>{row.expectedTime}</span>
                        <span>{row.kind}</span>
                        <span>{row.expectedNote}</span>
                        <span>{row.producedNote}</span>
                        <span>{row.midiDelta}</span>
                        <span>{row.timeDelta}</span>
                        <span>{row.statusLabel}</span>
                      </div>
                    {/each}
                  </div>
                  {#if analysisRowsTotal > analysisRows.length}
                    <small class="pipeline-hint">{analysisRows.length} lignes affichées sur {analysisRowsTotal}.</small>
                  {/if}
                </div>
              {/if}
            {:else}
              <p class="pipeline-hint">Aucun plan de pliage disponible pour ce parcours (scène JSON importée sans source MIDI).</p>
            {/if}
          </div>
          {/if}
        {:else}
          <p class="pipeline-empty">Importe un MIDI pour voir les événements extraits, leurs rôles spatiaux, puis les clusters pliés dans l'île.</p>
        {/if}
      </section>

      {#if studioStage === "spatial-fold"}
      <div class="mode-switch">
        <button class:active={runtimeMode === "path"} on:click={exitFreeFly}>Parcours</button>
        <button class:active={runtimeMode === "freefly"} on:click={enterFreeFly} data-testid="studio-mode-freefly">Vol libre</button>
      </div>

      {#if runtimeMode === "path"}
        <label class="inline">
          <input type="checkbox" bind:checked={studioPlaying} />
          Prévisualiser
        </label>
      {:else}
        <label>
          Contrôles
          <select bind:value={driverKey} on:change={changeDriver}>
            <option value="pointerlock">Souris + clavier (FPS)</option>
            <option value="drag">Clic-glisser + clavier</option>
            <option value="click">Tap-pour-aller</option>
          </select>
        </label>
        {#if driverKey === "click"}
          <div class="vertical-pad">
            <button on:pointerdown={() => holdVerticalButton("up", true)} on:pointerup={() => holdVerticalButton("up", false)} on:pointerleave={() => holdVerticalButton("up", false)}>▲</button>
            <button on:pointerdown={() => holdVerticalButton("down", true)} on:pointerup={() => holdVerticalButton("down", false)} on:pointerleave={() => holdVerticalButton("down", false)}>▼</button>
          </div>
        {/if}
        {#if driverHint}
          <p class="driver-hint">{driverHint}</p>
        {/if}
      {/if}

      <label class="inline">
        <input type="checkbox" bind:checked={debug} on:change={() => renderer?.setDebug(debug)} />
        Champs
      </label>

      <div class="tool-group">
        <button on:click={addObject} data-testid="add-object">Créer objet</button>
        <button on:click={deleteObject} disabled={!selectedObject}>Supprimer</button>
      </div>

      <div class="audio-debug">
        <button on:click={recordAudioDebug} disabled={audioRecording} data-testid="record-audio-debug">
          {audioRecording ? "Enregistrement..." : "Enregistrer audio 5s"}
        </button>
        {#if audioRecordingUrl}
          <a href={audioRecordingUrl} download="museeka-debug-audio.webm">Télécharger</a>
        {/if}
        {#if audioAnalysis}
          <small>RMS {audioAnalysis.rms.toFixed(4)} · peak {audioAnalysis.peak.toFixed(3)} · ZCR {audioAnalysis.zeroCrossingRate.toFixed(3)}</small>
        {/if}
      </div>

      <label>
        Objets
        <select bind:value={selectedObjectId} data-testid="object-select">
          {#each scene.soundObjects as object}
            <option value={object.id}>{object.id}</option>
          {/each}
        </select>
      </label>
      {/if}
    {/if}

    {#if studioStage === "spatial-fold" && selectedObject}
      <div class="inspector" data-testid="object-inspector">
        <h2>{selectedObject.id}</h2>

        <label>
          Modèle
          <select value={selectedObject.visual.model} on:change={(event) => updateVisualModel((event.currentTarget as HTMLSelectElement).value as SoundObjectVisual["model"])}>
            {#each ["flower", "tree", "rock", "statue", "arch", "bird", "crab", "crystal", "temple", "waterfall"] as model}
              <option value={model}>{model}</option>
            {/each}
          </select>
        </label>

        <div class="triple">
          <label>X <input type="number" step="0.5" value={selectedObject.transform.position[0]} on:change={(event) => updatePosition(0, Number((event.currentTarget as HTMLInputElement).value))} /></label>
          <label>Y <input type="number" step="0.5" value={selectedObject.transform.position[1]} on:change={(event) => updatePosition(1, Number((event.currentTarget as HTMLInputElement).value))} /></label>
          <label>Z <input type="number" step="0.5" value={selectedObject.transform.position[2]} on:change={(event) => updatePosition(2, Number((event.currentTarget as HTMLInputElement).value))} /></label>
        </div>

        <label>
          Champ
          <select value={selectedObject.field.shape} on:change={(event) => updateFieldShape((event.currentTarget as HTMLSelectElement).value as SoundField["shape"])}>
            <option value="sphere">sphere</option>
            <option value="ellipsoid">ellipsoid</option>
            <option value="cone">cone</option>
            <option value="ring">ring</option>
          </select>
        </label>

        <label>
          Rayon
          <input type="range" min="2" max="14" step="0.5" value={selectedObject.field.shape === "sphere" ? selectedObject.field.params.radius : selectedObject.field.shape === "ring" ? selectedObject.field.params.centerRadius : 5} on:input={(event) => updateRadius(Number((event.currentTarget as HTMLInputElement).value))} />
        </label>

        <label>
          Générateur
          <select value={selectedObject.audio.generator} on:change={(event) => updateAudioGenerator((event.currentTarget as HTMLSelectElement).value as AudioGenerator["generator"])}>
            <option value="note">note</option>
            <option value="chord">chord</option>
            <option value="phrase">phrase</option>
            <option value="drone">drone</option>
            <option value="percussion">percussion</option>
          </select>
        </label>

        <label>
          Notes
          <input value={currentNotes(selectedObject)} on:change={(event) => updateNoteList((event.currentTarget as HTMLInputElement).value)} />
        </label>

        <button class="primary" on:click={previewObject}>Tester le son</button>
      </div>
    {/if}

    <p class="status">{status}</p>
    <p class="status">{audioDebugStatus}</p>
  </section>

  {#if studioStage === "spatial-fold"}
    <div class="studio-canvas" bind:this={host} data-testid="studio-canvas-host"></div>
  {/if}
</main>
