# Museeka

Static 3D musical island for `museeka.com`. La musique émerge des rencontres entre un parcours volant et des objets sonores spatialisés — pas de timeline cachée.

- Démo publique : `/`
- Studio de composition : `/studio/`
- Melody Lab : `/studio/#/melody`
- Corpus & goûts : `/studio/#/corpus`
- Build : `npm run build`
- Dev local : `npm run dev`
- Tests : `npm test` (unit) / `npm run test:e2e` (Playwright)
- Diagnostic du rendu : `npx tsx scripts/diagnose-render.ts`

Le Melody Lab ajoute un domaine indépendant de la 3D pour éditer et analyser des mélodies, détecter des motifs, mener des expériences A/B et collecter localement des annotations de préférence, émotion et perception. Le build génère également des snapshots d'analyse compacts et versionnés pour le corpus.

L'import MIDI calcule désormais des candidats mélodiques compacts avant suppression des pistes brutes : l'utilisateur peut écouter chaque candidat isolément, choisir la ligne pertinente et l'ajouter au corpus avec la version exacte de l'extracteur.

La démo utilise du matériel musical traditionnel (domaine public) et des samples d'instruments. Voir `public/audio/ATTRIBUTION.md`.
