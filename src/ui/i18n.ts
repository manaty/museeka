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
