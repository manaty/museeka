/**
 * Minimal i18n: French (default for fr-* browsers) and English (fallback for
 * everything else). One flat dictionary, one t() function. Detected once at
 * module load.
 */

export type Locale = "fr" | "en";

const STRINGS = {
  // Loading + start screen
  app_subtitle:       { fr: "Une île-instrument",                                      en: "An island-instrument" },
  loading_samples:    { fr: "Chargement des instruments",                              en: "Loading instruments" },
  samples_ready:      { fr: "Instruments prêts",                                       en: "Instruments ready" },
  scene_loading:      { fr: "Chargement de la scène",                                  en: "Loading scene" },
  loading_short:      { fr: "Chargement",                                              en: "Loading" },
  start_button:       { fr: "Lancer Museeka",                                          en: "Start Museeka" },
  start_button_wait:  { fr: "Chargement des samples",                                  en: "Loading samples" },
  manaty_logo_alt:    { fr: "Manaty Games",                                            en: "Manaty Games" },

  // Studio shell
  studio_title:               { fr: "Museeka Studio",                                              en: "Museeka Studio" },
  studio_subtitle:            { fr: "Cinq éditeurs pour composer ton île musicale",               en: "Five editors to compose your musical island" },
  studio_back_to_home:        { fr: "← Retour à l'accueil",                                       en: "← Back to home" },
  studio_legacy_link:         { fr: "Ouvrir le Studio classique →",                               en: "Open the classic Studio →" },
  studio_coming_soon:         { fr: "Bientôt",                                                    en: "Coming soon" },
  studio_placeholder_intro:   { fr: "Cet éditeur est en construction. À venir :",                 en: "This editor is under construction. Planned:" },

  // Per-editor titles + descriptions
  studio_midi_title:          { fr: "MIDI",                                                       en: "MIDI" },
  studio_midi_desc:           { fr: "Importer, visualiser et analyser des fichiers MIDI.",        en: "Import, visualize, and analyse MIDI files." },
  studio_midi_planned:        { fr: "Import multi-fichiers · Piano roll interactif · Analyse événementielle · Édition note à note · Quantize / transpose · Export MIDI", en: "Multi-file import · Interactive piano roll · Event analysis · Note-by-note editing · Quantize / transpose · MIDI export" },

  studio_scene_title:         { fr: "Scène",                                                      en: "Scene" },
  studio_scene_desc:          { fr: "Sculpter la forme et le terrain de ton île.",                en: "Sculpt the shape and terrain of your island." },
  studio_scene_planned:       { fr: "Paramètres de terrain (rayon, hauteur) · Heightmap personnalisée · Preview 3D en direct · Couleurs et matières · Export de scènes", en: "Terrain parameters (radius, height) · Custom heightmap · Live 3D preview · Colors and materials · Scene export" },

  studio_instruments_title:   { fr: "Instruments",                                                en: "Instruments" },
  studio_instruments_desc:    { fr: "Charger et configurer les samples de chaque instrument.",    en: "Load and configure the samples of each instrument." },
  studio_instruments_planned: { fr: "Bibliothèque des 10 instruments · Aperçu rapide · Upload de samples personnalisés · Édition de l'enveloppe (ADSR) · Mapping note → sample", en: "Library of 10 instruments · Quick preview · Custom sample upload · ADSR envelope editing · Note → sample mapping" },

  studio_objects_title:       { fr: "Objets",                                                     en: "Objects" },
  studio_objects_desc:        { fr: "Créer des modèles, choisir couleurs et formes, associer un instrument.", en: "Build models, pick colors and shapes, attach an instrument." },
  studio_objects_planned:     { fr: "Bibliothèque de presets visuels · Création de nouvelles formes · Choix de la couleur / texture · Définition du champ (sphère, ellipsoïde…) · Association à un instrument", en: "Visual preset library · New shape creation · Color / texture picker · Field definition (sphere, ellipsoid…) · Bind to an instrument" },

  studio_music_title:         { fr: "Musique",                                                    en: "Music" },
  studio_music_desc:          { fr: "Spatialiser la musique sur la scène, note à note.",         en: "Spatialise the music on the scene, note by note." },
  studio_music_planned:       { fr: "Génération automatique du parcours · Édition note à note · Ajout/suppression d'objets en direct · Édition du tracé · Mesure d'accuracy en temps réel · Export de la scène finale", en: "Automatic parcours generation · Note-by-note editing · Live add/remove of objects · Path editing · Real-time accuracy measurement · Export of the final scene" },

  // HUD
  brand:              { fr: "Museeka",                                                 en: "Museeka" },
  mode_freefly_label: { fr: "Mode libre",                                              en: "Free-fly mode" },
  mode_path:          { fr: "Parcours",                                                en: "Parcours" },
  mode_freefly:       { fr: "Vol libre",                                               en: "Free fly" },
  parcours_label:     { fr: "Parcours",                                                en: "Track" },
  speed:              { fr: "Vitesse",                                                 en: "Speed" },
  volume:             { fr: "Volume",                                                  en: "Volume" },
  debug:              { fr: "Debug",                                                   en: "Debug" },
  controls_label:     { fr: "Contrôles",                                               en: "Controls" },
  play:               { fr: "Play",                                                    en: "Play" },
  pause:              { fr: "Pause",                                                   en: "Pause" },
  restart:            { fr: "Restart",                                                 en: "Restart" },
  open_studio:        { fr: "Ouvrir le Studio →",                                      en: "Open Studio →" },
  github:             { fr: "GitHub ↗",                                                en: "GitHub ↗" },
  hud_expand:         { fr: "Déployer le menu",                                        en: "Expand menu" },
  hud_collapse:       { fr: "Replier le menu",                                         en: "Collapse menu" },

  // Driver picker
  driver_fps:         { fr: "Souris + clavier (FPS)",                                  en: "Mouse + keyboard (FPS)" },
  driver_drag:        { fr: "Clic-glisser + clavier",                                  en: "Click-drag + keyboard" },
  driver_joystick:    { fr: "Joysticks tactiles",                                      en: "Touch joysticks" },
  driver_click:       { fr: "Tap-pour-aller",                                          en: "Tap-to-go" },

  // Driver hints
  hint_pointerlock_locked:   { fr: "Souris : regarder · WASD/ZQSD : se déplacer · Espace : monter · Ctrl : descendre · Maj : sprint · Esc : libérer",  en: "Mouse: look · WASD: move · Space: rise · Ctrl: descend · Shift: sprint · Esc: release" },
  hint_pointerlock_unlocked: { fr: "Clique sur la scène pour verrouiller la souris (Esc pour libérer)",                                                en: "Click the scene to lock the mouse (Esc to release)" },
  hint_drag:                 { fr: "Clique-glisse pour orienter · WASD/ZQSD : déplacer · Espace : monter · Ctrl : descendre",                          en: "Click-drag to look · WASD: move · Space: rise · Ctrl: descend" },
  hint_click:                { fr: "Clique sur l'île pour t'y rendre · ▲/▼ pour monter/descendre",                                                     en: "Click the island to fly there · ▲/▼ to go up/down" },
  hint_joystick:             { fr: "Pouce gauche : voler · pouce droit : regarder · vise vers le haut pour monter",                                    en: "Left thumb: fly · right thumb: look · aim up to rise" },
} as const;

export type StringKey = keyof typeof STRINGS;

function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const lang = (navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || "en").toLowerCase();
  return lang.startsWith("fr") ? "fr" : "en";
}

export const locale: Locale = detectLocale();

export function t(key: StringKey): string {
  const entry = STRINGS[key];
  return entry[locale] ?? entry.en;
}

/** Convenience: split a translated string on " · " into list items. */
export function tList(key: StringKey): string[] {
  return t(key).split(" · ").map((item) => item.trim()).filter(Boolean);
}
