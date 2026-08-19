<script lang="ts">
  import { onMount } from "svelte";
  import { BUILTIN_MELODY_CORPUS, type CorpusMelodyRecord } from "../../melody/corpus/builtin";
  import { listAllCorpusRecords, saveUserCorpusRecord } from "../../melody/corpus/storage";
  import { getLocalListenerId, listAnnotations, saveAnnotation } from "../../melody/research/storage";
  import type { MelodyAnnotation, MelodyStimulus } from "../../melody/research/types";
  import { sortMelodyNotes } from "../../melody/types";
  import {
    cloudRowToRecord,
    getCloudSession,
    listCloudAnnotations,
    listCloudMelodies,
    signInCloud,
    signOutCloud,
    signUpCloud,
    upsertCloudAnnotation,
    upsertCloudMelody,
    type CloudSession
  } from "../../melody/cloud/supabase";
  import { locale, t } from "../../ui/i18n";
  import { navigate } from "../router";

  const NORMALIZED_TEMPO = 110;
  const TARGET_CENTER_MIDI = 64;

  const copy = locale === "fr"
    ? {
        intro: "Synchroniser ton corpus personnel et tes annotations avec le projet Supabase privé de Museeka.",
        email: "Email",
        password: "Mot de passe",
        signIn: "Se connecter",
        signUp: "Créer le compte",
        signOut: "Se déconnecter",
        sync: "Synchroniser maintenant",
        signedIn: "Connecté",
        signedOut: "Non connecté",
        localCorpus: "Corpus local",
        cloudCorpus: "Corpus cloud",
        localRatings: "Annotations locales",
        cloudRatings: "Annotations cloud",
        signupMail: "Compte créé. Vérifie ton email si Supabase demande une confirmation avant la première connexion.",
        syncDone: "Synchronisation terminée",
        privateHint: "Les données sont privées par utilisateur via RLS. La clé présente dans le navigateur est une clé publishable, pas un secret serveur.",
        restoreHint: "Sur un nouvel appareil : connecte-toi puis clique Synchroniser. Les mélodies canoniques sont restaurées sans réimporter les fichiers MIDI.",
        busy: "Synchronisation…"
      }
    : {
        intro: "Synchronize your personal melody corpus and annotations with Museeka's private Supabase project.",
        email: "Email",
        password: "Password",
        signIn: "Sign in",
        signUp: "Create account",
        signOut: "Sign out",
        sync: "Sync now",
        signedIn: "Signed in",
        signedOut: "Signed out",
        localCorpus: "Local corpus",
        cloudCorpus: "Cloud corpus",
        localRatings: "Local annotations",
        cloudRatings: "Cloud annotations",
        signupMail: "Account created. Confirm your email first if Supabase requires email confirmation.",
        syncDone: "Synchronization complete",
        privateHint: "Data is private per user through RLS. The browser contains only a publishable key, never a server secret.",
        restoreHint: "On a new device: sign in and press Sync. Canonical melodies are restored without importing the MIDI files again.",
        busy: "Synchronizing…"
      };

  let session: CloudSession | null = null;
  let email = "";
  let password = "";
  let message = "";
  let error = "";
  let busy = false;
  let localCorpusCount = 0;
  let cloudCorpusCount = 0;
  let localAnnotationCount = 0;
  let cloudAnnotationCount = 0;

  onMount(async () => {
    session = getCloudSession();
    refreshLocalCounts();
    if (session) await refreshCloudCounts();
  });

  function refreshLocalCounts() {
    localCorpusCount = listAllCorpusRecords().length;
    localAnnotationCount = listAnnotations().length;
  }

  async function refreshCloudCounts() {
    if (!getCloudSession()) {
      cloudCorpusCount = 0;
      cloudAnnotationCount = 0;
      return;
    }
    const [melodies, annotations] = await Promise.all([listCloudMelodies(), listCloudAnnotations()]);
    cloudCorpusCount = melodies.length;
    cloudAnnotationCount = annotations.length;
  }

  async function handleSignIn() {
    busy = true;
    error = "";
    message = "";
    try {
      session = await signInCloud(email.trim(), password);
      password = "";
      await refreshCloudCounts();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }

  async function handleSignUp() {
    busy = true;
    error = "";
    message = "";
    try {
      session = await signUpCloud(email.trim(), password);
      password = "";
      if (session) await refreshCloudCounts();
      else message = copy.signupMail;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }

  async function handleSignOut() {
    await signOutCloud();
    session = null;
    cloudCorpusCount = 0;
    cloudAnnotationCount = 0;
    message = "";
    error = "";
  }

  function stimulusFor(record: CorpusMelodyRecord): MelodyStimulus {
    const notes = sortMelodyNotes(record.melody.notes);
    const mean = notes.length === 0 ? TARGET_CENTER_MIDI : notes.reduce((sum, note) => sum + note.midi, 0) / notes.length;
    return {
      id: `stimulus_${record.entry.id}_structural_v1`,
      melodyId: record.melody.id,
      melodyHash: record.entry.melodyHash,
      renderingProfile: {
        mode: "structural-normalized",
        instrument: "tone-synth-v1",
        tempo: NORMALIZED_TEMPO,
        transposeSemitones: Math.round(TARGET_CENTER_MIDI - mean),
        velocityScale: 1
      }
    };
  }

  function localAnnotationFromCloud(
    row: Awaited<ReturnType<typeof listCloudAnnotations>>[number],
    record: CorpusMelodyRecord,
    listenerId: string
  ): MelodyAnnotation {
    return {
      stimulusId: row.stimulus_id,
      melodyId: record.melody.id,
      analysisVersion: row.analysis_version ?? undefined,
      listenerId,
      createdAt: row.created_at,
      preference: row.preference ?? undefined,
      replayDesire: row.replay_desire ?? undefined,
      emotion: {
        valence: row.valence ?? undefined,
        arousal: row.arousal ?? undefined,
        tension: row.tension ?? undefined,
        labels: row.labels ?? {}
      },
      perception: {
        familiarity: row.familiarity ?? undefined,
        memorability: row.memorability ?? undefined,
        hummability: row.hummability ?? undefined,
        surprise: row.surprise ?? undefined
      }
    };
  }

  async function synchronize() {
    if (!session) return;
    busy = true;
    error = "";
    message = "";
    try {
      const localRecords = listAllCorpusRecords();
      const localAnnotations = listAnnotations();

      // Push canonical melodies first so annotations always have a valid FK target.
      for (const record of localRecords) {
        await upsertCloudMelody(record);
      }

      const byMelodyId = new Map(localRecords.map((record) => [record.melody.id, record]));
      for (const annotation of localAnnotations) {
        const record = byMelodyId.get(annotation.melodyId);
        if (!record) continue;
        await upsertCloudAnnotation(record, annotation, stimulusFor(record));
      }

      // Pull melodies. Built-ins already exist in code; only persist non-builtins locally.
      const cloudRows = await listCloudMelodies();
      const builtinIds = new Set(BUILTIN_MELODY_CORPUS.map((record) => record.entry.id));
      const cloudRecordByUuid = new Map<string, CorpusMelodyRecord>();
      for (const row of cloudRows) {
        const record = cloudRowToRecord(row);
        cloudRecordByUuid.set(row.id, record);
        if (!builtinIds.has(record.entry.id)) saveUserCorpusRecord(record);
      }

      // Pull annotations into the browser-local research store for offline use.
      const listenerId = getLocalListenerId();
      const cloudAnnotations = await listCloudAnnotations();
      for (const row of cloudAnnotations) {
        const record = cloudRecordByUuid.get(row.melody_id);
        if (!record) continue;
        saveAnnotation(localAnnotationFromCloud(row, record, listenerId));
      }

      refreshLocalCounts();
      cloudCorpusCount = cloudRows.length;
      cloudAnnotationCount = cloudAnnotations.length;
      message = copy.syncDone;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      busy = false;
    }
  }
</script>

<section class="cloud-page">
  <header>
    <div>
      <span class="eyebrow">Supabase</span>
      <h1>{t("studio_cloud_title")}</h1>
      <p>{copy.intro}</p>
    </div>
    <button on:click={() => navigate("corpus")}>← {t("studio_corpus_title")}</button>
  </header>

  <div class="security-note">
    <strong>{session ? copy.signedIn : copy.signedOut}</strong>
    <span>{session?.user?.email ?? copy.privateHint}</span>
  </div>

  {#if !session}
    <section class="auth-card">
      <label>{copy.email}<input type="email" bind:value={email} autocomplete="email" /></label>
      <label>{copy.password}<input type="password" bind:value={password} autocomplete="current-password" /></label>
      <div class="actions">
        <button class="primary" disabled={busy || !email || password.length < 6} on:click={handleSignIn}>{copy.signIn}</button>
        <button disabled={busy || !email || password.length < 6} on:click={handleSignUp}>{copy.signUp}</button>
      </div>
    </section>
  {:else}
    <section class="sync-card">
      <div class="counts">
        <div><strong>{localCorpusCount}</strong><span>{copy.localCorpus}</span></div>
        <div><strong>{cloudCorpusCount}</strong><span>{copy.cloudCorpus}</span></div>
        <div><strong>{localAnnotationCount}</strong><span>{copy.localRatings}</span></div>
        <div><strong>{cloudAnnotationCount}</strong><span>{copy.cloudRatings}</span></div>
      </div>
      <p>{copy.restoreHint}</p>
      <div class="actions">
        <button class="primary" disabled={busy} on:click={synchronize}>{busy ? copy.busy : copy.sync}</button>
        <button disabled={busy} on:click={handleSignOut}>{copy.signOut}</button>
      </div>
    </section>
  {/if}

  {#if message}<p class="message">✓ {message}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>

<style>
  .cloud-page { max-width: 880px; margin: 0 auto; padding: 2rem; color: #f7f4e8; }
  header { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; }
  h1 { margin:.2rem 0 .45rem; font-size:clamp(2rem,4vw,3.2rem); }
  header p { margin:0; color:#aaa; max-width:650px; line-height:1.55; }
  .eyebrow { color:#8ff0d2; text-transform:uppercase; letter-spacing:.13em; font-size:.72rem; font-weight:800; }
  button,input { border:1px solid #41423c; background:#20211d; color:#f7f4e8; border-radius:.55rem; padding:.68rem .82rem; }
  button { cursor:pointer; } button:disabled { opacity:.45; cursor:not-allowed; }
  button.primary { background:#8ff0d2; border-color:#8ff0d2; color:#13221e; font-weight:800; }
  .security-note,.auth-card,.sync-card { margin-top:1rem; border:1px solid #393a34; background:#191a17; border-radius:.8rem; padding:1rem; }
  .security-note { display:flex; justify-content:space-between; gap:1rem; color:#9fa097; }
  .security-note strong { color:#8ff0d2; }
  .auth-card { display:grid; gap:.8rem; }
  .auth-card label { display:grid; gap:.35rem; color:#aaa; }
  .actions { display:flex; gap:.55rem; flex-wrap:wrap; }
  .counts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.6rem; }
  .counts div { background:#22231f; padding:.8rem; border-radius:.6rem; }
  .counts strong { display:block; color:#8ff0d2; font-size:1.45rem; }
  .counts span { color:#999a92; font-size:.82rem; }
  .sync-card p { color:#aaa; line-height:1.5; }
  .message { color:#8ff0d2; } .error { color:#ff9a8a; }
  .back { margin-top:1rem; }
  @media(max-width:700px){ header{display:block} header>button{margin-top:1rem}.counts{grid-template-columns:repeat(2,1fr)}.security-note{display:block}.security-note span{display:block;margin-top:.3rem} }
</style>
