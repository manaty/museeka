# Museeka — Spécification complète MVP v0.1

**Domaine :** `museeka.com`  
**Type :** application web statique HTML / JavaScript / TypeScript, servie par GitHub Pages  
**Objectif du document :** fournir à l’agent Codex une spécification suffisamment précise pour réaliser une première version jouable et extensible de Museeka.

---

## 1. Vision produit

Museeka est un jeu musical en 3D où une île est construite comme une **partition spatiale**.

Le joueur ne lit pas une partition sur une portée : il suit un parcours aérien dans l’île. En approchant des objets — plantes, rochers, statues, animaux, artefacts, cascades, ruines — il produit une musique. Le son n’est pas déclenché par une timeline cachée indépendante : il est produit par l’interaction entre le parcours et les objets sonores.

La version 1 doit démontrer le principe suivant :

> Une même île contient plusieurs musiques, chacune révélée par un parcours 3D physiquement possible.

Le modèle souhaité est proche d’une **protéine musicale** :

```text
MIDI / partition linéaire
→ chaîne musicale abstraite
→ repliement 3D dans l’île
→ réutilisation d’objets sonores
→ parcours qui révèle la musique
```

Le parcours n’est pas nécessairement un sentier au sol. Il peut être une trajectoire d’oiseau, de luciole, d’esprit ou de drone, avec des variations d’altitude par rapport au terrain.

---

## 2. Principe non négociable

Museeka utilise la **méthode 1** :

> L’île est construite de sorte qu’un parcours dans l’espace reproduise la musique.

Il ne faut pas implémenter une solution où un fichier MIDI est simplement joué en arrière-plan pendant qu’une caméra suit un chemin décoratif.

La musique doit être générée par les objets de l’île via leurs champs sonores.

Acceptable pour le MVP :

- les objets peuvent être placés à partir de données pré-calculées ;
- les parcours peuvent être prédéfinis ;
- les sons peuvent être synthétiques ;
- les objets peuvent avoir des comportements très simples au début.

Non acceptable :

- jouer un MIDI caché indépendamment de la scène ;
- synchroniser simplement une animation 3D avec une piste audio préenregistrée ;
- donner à un objet la connaissance explicite du morceau en cours.

Un objet sonore doit répondre principalement à :

```text
position relative du joueur
vitesse relative
direction d’approche
altitude relative
distance
angle
temps local de rencontre, uniquement pour les phrases internes
```

---

## 3. Objectif du MVP

La première version doit être une démo jouable sur navigateur.

### 3.1 Fonctionnalités attendues

Le MVP doit permettre :

1. d’afficher une île 3D stylisée ;
2. de choisir un des 5 parcours prédéfinis ;
3. de lancer / mettre en pause / redémarrer le parcours ;
4. de régler la vitesse globale de lecture ;
5. de voir la trajectoire 3D ;
6. de voir les objets sonores ;
7. d’entendre les sons générés par proximité avec les objets ;
8. de voir optionnellement les objets actifs s’illuminer ;
9. de charger toute la scène depuis des fichiers JSON statiques ;
10. de fonctionner sans backend sur GitHub Pages.

### 3.2 Fonctionnalités non attendues en MVP

Pas nécessaire dans la première version :

- compte utilisateur ;
- sauvegarde serveur ;
- upload MIDI public ;
- édition graphique complète de l’île ;
- génération automatique parfaite depuis un MIDI ;
- multi-joueur ;
- VR ;
- mobile parfaitement optimisé.

Cependant l’architecture doit être préparée pour ces extensions.

---

## 4. Stack technique recommandée

### 4.1 Runtime

- TypeScript recommandé, JavaScript acceptable.
- Three.js pour la 3D.
- Tone.js ou Web Audio API directe pour la synthèse sonore.
- Application statique déployable sur GitHub Pages.

Three.js fournit déjà des primitives utiles pour la 3D et des objets audio, dont `Audio`, `AudioListener` et `PositionalAudio`. Tone.js fournit une couche musicale pratique, notamment `PolySynth`, les synthétiseurs, les enveloppes et la gestion temporelle. Le Web Audio API reste la base technique pour contrôle audio, effets, spatialisation et analyse.

### 4.2 Build

Deux options acceptables :

#### Option A — simple ES modules

```text
/index.html
/src/*.js
/assets/*
/data/*.json
```

Avantage : ultra simple pour GitHub Pages.

#### Option B — Vite + TypeScript

```text
/package.json
/vite.config.ts
/src/*.ts
/public/data/*.json
```

Avantage : meilleure structure, typage, bundling.

Recommandation : **Vite + TypeScript**, mais produire une sortie statique dans `dist/` déployable sur GitHub Pages.

---

## 5. Architecture logicielle

Structure recommandée :

```text
src/
  main.ts
  app/
    MuseekaApp.ts
    SceneLoader.ts
    PlaybackController.ts
  graphics/
    ThreeScene.ts
    IslandRenderer.ts
    PathRenderer.ts
    ObjectRenderer.ts
    DebugOverlay.ts
  audio/
    AudioEngine.ts
    Instruments.ts
    SoundObjectPlayer.ts
    ToneAdapter.ts
  music/
    MusicTypes.ts
    SpatialScore.ts
    MidiLikeParser.ts
    EventGrouper.ts
  geometry/
    Vec3.ts
    Curve3D.ts
    CatmullRomPath.ts
    Terrain.ts
    Fields.ts
    FieldCurves.ts
  simulation/
    Encounter.ts
    PlayerState.ts
    PathFollower.ts
    SoundSimulation.ts
  generation/
    ChainBuilder.ts
    FoldingHeuristic.ts
    ObjectReusePlanner.ts
    IslandGenerator.ts
  data/
    SchemaTypes.ts
```

Pour le MVP, les modules `generation/*` peuvent être simples et servir surtout à préparer le futur. Le runtime principal doit surtout charger une scène JSON déjà générée.

---

## 6. Modèle conceptuel

### 6.1 MusicScore

Représentation musicale pure.

```text
notes
accords
phrases
tempo
durées
instruments
velocity
```

### 6.2 SpatialScore

Représentation intermédiaire : la musique devient une chaîne de gestes spatiaux.

```text
événement musical
→ rôle spatial
→ type d’objet possible
→ contraintes de rencontre
```

Exemple :

```json
{
  "time": 12.5,
  "kind": "chord",
  "notes": ["C3", "E3", "G3"],
  "duration": 1.2,
  "role": "harmony",
  "suggestedObjectKinds": ["stone_arch", "temple_gate", "large_tree"],
  "spatialIntent": "frontal_approach"
}
```

### 6.3 IslandScene

Représentation finale de l’île.

```text
terrain
parcours 3D
objets sonores
champs sonores
mappings audio
animations
caméra
```

---

## 7. Parcours 3D

Un parcours est une courbe 3D paramétrée par le temps ou par l’abscisse curviligne.

```text
P(t) = (x(t), y(t), z(t))
```

Il doit respecter :

```text
vitesse ≤ vitesse_max
accélération ≤ accélération_max
courbure ≤ courbure_max
altitude ≥ terrain(x, y) + marge_min
```

### 7.1 Format JSON d’un parcours

```json
{
  "id": "path_ode_to_joy",
  "name": "Ode to Joy Flight",
  "duration": 42.0,
  "mode": "flying",
  "speedScale": 1.0,
  "constraints": {
    "maxSpeed": 6.0,
    "maxAcceleration": 8.0,
    "maxCurvature": 1.2,
    "minGroundClearance": 1.0,
    "maxGroundClearance": 40.0
  },
  "points": [
    { "t": 0.0, "p": [0, 8, 0] },
    { "t": 2.0, "p": [5, 9, -2] },
    { "t": 4.0, "p": [9, 12, -4] }
  ],
  "interpolation": "catmull-rom"
}
```

Convention recommandée :

```text
x = est/ouest
y = altitude
z = nord/sud
```

Le terrain est une fonction approximative `groundY(x, z)`.

---

## 8. Objets sonores

Un objet sonore n’est pas seulement une note. C’est :

```text
objet sonore = transform 3D + champ spatial + générateur audio + mappings
```

Il peut produire :

- une note ;
- un accord ;
- une phrase ;
- un arpège ;
- une percussion ;
- un drone ;
- une texture ;
- un sample ;
- une combinaison.

### 8.1 Format général

```json
{
  "id": "tree_harp_01",
  "kind": "tree_harp",
  "transform": {
    "position": [12, 4, -8],
    "rotation": [0, 35, 0],
    "scale": [1, 1, 1]
  },
  "field": {
    "shape": "ellipsoid",
    "params": {
      "radius": [6, 10, 4]
    },
    "falloff": {
      "distance": { "type": "smoothstep", "inner": 0.15, "outer": 1.0 },
      "angle": { "type": "linear" },
      "altitude": { "type": "linear" }
    }
  },
  "audio": {
    "generator": "note",
    "instrument": "glass_bell",
    "baseNote": "E4",
    "duration": 0.35,
    "velocity": 0.8
  },
  "mappings": [
    {
      "input": "field.intensity",
      "output": "volume",
      "curve": { "type": "smoothstep" },
      "range": [0, 1]
    },
    {
      "input": "encounter.altitudeRelative",
      "output": "pitchSemitones",
      "curve": { "type": "linear" },
      "range": [-2, 2]
    },
    {
      "input": "encounter.approachSpeed",
      "output": "brightness",
      "curve": { "type": "exponential", "k": 2 },
      "range": [0.2, 1.0]
    }
  ],
  "visual": {
    "model": "lowpoly_tree",
    "color": "#55aa66",
    "activeGlow": true
  }
}
```

---

## 9. Champs sonores

### 9.1 Principe

Le volume n’est pas une simple fonction linéaire de la distance. Chaque objet possède un **champ d’influence sonore**.

Ce champ retourne plusieurs valeurs :

```ts
type FieldOutput = {
  inside: boolean
  intensity: number       // 0..1
  distanceFactor: number  // 0..1
  angleFactor: number     // 0..1
  altitudeFactor: number  // 0..1
  radialFactor?: number
  localPosition: Vec3
}
```

La forme du champ peut être isotrope ou anisotrope.

### 9.2 Formes de champs à implémenter en MVP

Priorité MVP :

1. `sphere`
2. `ellipsoid`
3. `cone`
4. `ring`

Optionnel :

5. `capsule`
6. `box`
7. `custom`

### 9.3 Sphere

```json
{
  "shape": "sphere",
  "params": { "radius": 5 }
}
```

### 9.4 Ellipsoid

```json
{
  "shape": "ellipsoid",
  "params": { "radius": [8, 4, 3] }
}
```

### 9.5 Cone

```json
{
  "shape": "cone",
  "params": {
    "range": 12,
    "angleDegrees": 50,
    "direction": [0, 0, 1]
  }
}
```

### 9.6 Ring

```json
{
  "shape": "ring",
  "params": {
    "centerRadius": 6,
    "thickness": 1.2,
    "heightRange": [-2, 5]
  }
}
```

---

## 10. Courbes de champ

Le moteur doit permettre plusieurs courbes :

```ts
type Curve =
  | { type: "linear" }
  | { type: "smoothstep" }
  | { type: "smootherstep" }
  | { type: "exponential"; k: number }
  | { type: "gaussian"; center: number; sigma: number }
  | { type: "threshold"; threshold: number }
  | { type: "plateau"; inner: number; outer: number }
```

Fonctions recommandées :

```ts
function clamp01(x: number): number
function smoothstep(x: number): number
function smootherstep(x: number): number
function gaussian(x: number, center: number, sigma: number): number
function applyCurve(x: number, curve: Curve): number
```

---

## 11. Rencontre joueur-objet

À chaque frame, pour chaque objet proche, on calcule une rencontre.

```ts
type Encounter = {
  objectId: string
  playerPosition: Vec3
  playerVelocity: Vec3
  objectPosition: Vec3
  relativePosition: Vec3
  localPosition: Vec3
  distance: number
  approachSpeed: number
  tangentialSpeed: number
  altitudeRelative: number
  approachDirection: Vec3
  field: FieldOutput
}
```

`approachSpeed` est la composante de vitesse vers l’objet.

```text
approachSpeed > 0 : le joueur approche
approachSpeed < 0 : le joueur s’éloigne
```

---

## 12. Générateurs audio

### 12.1 Note

```json
{
  "generator": "note",
  "instrument": "glass_bell",
  "baseNote": "E4",
  "duration": 0.3,
  "velocity": 0.8
}
```

### 12.2 Chord

```json
{
  "generator": "chord",
  "instrument": "warm_pad",
  "notes": ["C3", "E3", "G3"],
  "duration": 1.2,
  "velocity": 0.7
}
```

### 12.3 Phrase

```json
{
  "generator": "phrase",
  "instrument": "flute",
  "notes": [
    { "dt": 0.0, "note": "E5", "duration": 0.15, "velocity": 0.7 },
    { "dt": 0.2, "note": "F5", "duration": 0.15, "velocity": 0.7 },
    { "dt": 0.4, "note": "G5", "duration": 0.25, "velocity": 0.8 }
  ]
}
```

### 12.4 Drone

```json
{
  "generator": "drone",
  "instrument": "low_pad",
  "notes": ["C2", "G2"],
  "continuous": true
}
```

### 12.5 Percussion

```json
{
  "generator": "percussion",
  "instrument": "woodblock",
  "pattern": [
    { "dt": 0.0, "velocity": 0.8 },
    { "dt": 0.25, "velocity": 0.5 }
  ]
}
```

---

## 13. Déclenchement sonore

Il y a deux modes fondamentaux.

### 13.1 Continuous

L’objet produit un son continu quand le joueur est dans le champ.

Utilisé pour :

- cascade ;
- vent ;
- grotte ;
- rocher-basse ;
- temple ;
- mer ;
- forêt.

### 13.2 Triggered

L’objet déclenche un événement quand le joueur entre dans une zone ou passe un seuil.

Utilisé pour :

- fleur ;
- coquillage ;
- cloche ;
- statue ;
- oiseau ;
- percussion.

Format :

```json
{
  "trigger": {
    "mode": "enter",
    "threshold": 0.45,
    "cooldown": 0.4,
    "retrigger": false
  }
}
```

Modes MVP :

```text
enter
peak
continuous
```

- `enter` : déclenche quand `intensity` passe au-dessus du seuil.
- `peak` : déclenche quand l’intensité atteint un maximum local.
- `continuous` : le son suit l’intensité du champ.

---

## 14. Mappings audio

Un mapping transforme une variable de rencontre ou de champ en paramètre audio.

Exemples :

```json
{
  "input": "field.intensity",
  "output": "volume",
  "curve": { "type": "smoothstep" },
  "range": [0, 1]
}
```

```json
{
  "input": "encounter.altitudeRelative",
  "output": "pitchSemitones",
  "curve": { "type": "linear" },
  "range": [-7, 7],
  "clampInput": [-5, 5]
}
```

```json
{
  "input": "encounter.approachSpeed",
  "output": "filterCutoff",
  "curve": { "type": "exponential", "k": 2 },
  "range": [500, 6000]
}
```

Sorties audio à supporter en MVP :

```text
volume
pitchSemitones
filterCutoff
attack
release
brightness
pan
reverbSend
```

---

## 15. Fichiers de données

Structure recommandée :

```text
public/
  data/
    museeka-scene.json
    paths/
      path_01.json
      path_02.json
      path_03.json
      path_04.json
      path_05.json
    objects/
      island_objects.json
    scores/
      demo_01_spatial_score.json
      demo_02_spatial_score.json
```

Mais pour simplifier, le MVP peut tout mettre dans un seul fichier :

```text
public/data/museeka_demo_scene.json
```

### 15.1 Schéma global de scène

```json
{
  "version": "0.1",
  "meta": {
    "name": "Museeka Demo Island",
    "author": "Museeka",
    "description": "First static demo island"
  },
  "terrain": {
    "type": "heightfield",
    "size": [120, 120],
    "heightScale": 18,
    "seed": 12345
  },
  "paths": [],
  "soundObjects": [],
  "visualObjects": [],
  "settings": {
    "defaultPathId": "path_01",
    "audio": {
      "masterVolume": 0.8,
      "maxActiveVoices": 32
    }
  }
}
```

---

## 16. Les 5 parcours de démonstration

La V1 doit contenir 5 parcours, pas forcément très longs. Chaque parcours doit démontrer une capacité différente.

### Parcours 1 — mélodie simple

Objectif : montrer immédiatement que le concept fonctionne.

- 20 à 40 secondes.
- Mélodie monophonique.
- Objets simples : fleurs / coquillages.
- Champs plutôt sphériques ou ellipsoïdes.

### Parcours 2 — accord et harmonie

Objectif : montrer des accords et objets continus.

- Statues, arbres, rochers.
- Accords déclenchés.
- Drones et pads.
- Variation de timbre selon angle et distance.

### Parcours 3 — parcours rythmique

Objectif : montrer rythme et percussions.

- Crabes, bambous, tambours, pierres.
- Déclenchements courts.
- Champs étroits.
- Quelques motifs phrase.

### Parcours 4 — parcours vertical / altitude

Objectif : montrer que le parcours est 3D.

- Trajectoire autour d’un arbre, d’une falaise ou d’un temple.
- Pitch ou octave lié à l’altitude.
- Réutilisation d’un même objet à plusieurs hauteurs.

### Parcours 5 — parcours complet

Objectif : combiner tout.

- Mélodie + accords + phrases + drones.
- Au moins 3 objets réutilisés.
- Au moins 1 animal animé.
- Parcours plus spectaculaire.

---

## 17. Construction de l’île depuis un MIDI

Cette section décrit la direction algorithmique. Pour le MVP, elle peut être partiellement implémentée en scripts de génération ou utilisée manuellement pour créer les JSON.

### 17.1 Pipeline

```text
MIDI
→ MusicScore
→ simplification
→ segmentation
→ clustering d’événements compatibles
→ chaîne musicale
→ repliement 3D
→ placement des objets
→ simulation
→ optimisation
→ IslandScene JSON
```

### 17.2 MIDI vers MusicScore

Extraire :

- tempo ;
- notes on/off ;
- pitch ;
- velocity ;
- durée ;
- canal ;
- instrument ;
- accords ;
- phrases rapides.

Format cible :

```ts
type MusicEvent =
  | NoteEvent
  | ChordEvent
  | PhraseEvent
  | DroneEvent
  | PercussionEvent
```

### 17.3 Simplification

Le MIDI brut peut être trop dense. Il faut prévoir :

- sélectionner une mélodie principale ;
- regrouper les notes simultanées en accords ;
- regrouper les phrases rapides ;
- ignorer ou réduire certains ornements ;
- limiter la polyphonie ;
- limiter le nombre d’événements par seconde.

Paramètres recommandés :

```json
{
  "maxEventsPerSecond": 8,
  "minNoteDuration": 0.08,
  "chordTimeWindow": 0.04,
  "phraseGapThreshold": 0.18
}
```

### 17.4 Segmentation

Règles simples :

- notes quasi simultanées → `ChordEvent`;
- notes très proches sur une même voix → `PhraseEvent`;
- note longue basse → `DroneEvent` ou `BassObject`;
- percussions → `PercussionEvent`;
- note isolée → `NoteEvent`.

---

## 18. Clustering pour réutilisation d’objets

L’objectif est de réduire le nombre d’objets en regroupant des événements compatibles.

### 18.1 Compatibilité

Deux événements sont compatibles si un même objet peut les produire selon une rencontre différente.

Critères :

```text
même note exacte
même classe de hauteur
même accord
accords inversables
notes dans une même gamme
même instrument ou famille sonore
même rôle musical
phrase similaire
rythme similaire
```

Exemples :

```text
C4 et C5 → même arbre, altitude différente
C-E-G et E-G-C → même statue, angle/voicing différent
petites notes rapides → même oiseau-phrase
basses longues → même rocher/volcan
```

### 18.2 Score de compatibilité

```ts
function compatibility(a: MusicEvent, b: MusicEvent): number
```

Retourne `0..1`.

Critères :

```text
pitchSimilarity
chordSimilarity
instrumentSimilarity
roleSimilarity
durationSimilarity
gesturePossibility
```

### 18.3 Clusters

```ts
type EventCluster = {
  id: string
  events: MusicEvent[]
  candidateObjectKinds: string[]
  reuseScore: number
}
```

---

## 19. Repliement 3D

Le repliement cherche une courbe `P(t)` qui rapproche les événements compatibles et éloigne les événements incompatibles.

### 19.1 Objectif

Minimiser :

```text
E =
  erreur_musicale
+ coût_des_objets
+ pénalité_sons_parasites
+ pénalité_vitesse
+ pénalité_accélération
+ pénalité_courbure
+ pénalité_collision_terrain
- bonus_réutilisation
- bonus_beauté_spatiale
```

Pour le MVP, il n’est pas nécessaire de résoudre ce problème parfaitement. Une heuristique suffit.

### 19.2 Heuristique MVP

1. Initialiser une courbe 3D sinueuse ou hélicoïdale.
2. Identifier les clusters réutilisables.
3. Créer une ancre spatiale pour chaque cluster important.
4. Déformer la courbe pour que les instants du cluster passent près de l’ancre.
5. Lisser la courbe.
6. Vérifier vitesse, altitude, courbure.
7. Placer les objets aux ancres.
8. Simuler.
9. Corriger manuellement ou automatiquement.

### 19.3 Pseudo-code

```ts
function foldMusicalPath(events, clusters, constraints): Path3D {
  let path = initializePath(events, constraints)

  for (let iter = 0; iter < 300; iter++) {
    const forces = createZeroForces(path)

    for (const cluster of clusters) {
      const anchor = estimateClusterAnchor(path, cluster)
      for (const event of cluster.events) {
        addAttractionForce(forces, event.time, anchor, cluster.reuseScore)
      }
    }

    for (const pair of nearbyEventPairs(path)) {
      if (compatibility(pair.a, pair.b) < 0.3) {
        addRepulsionForce(forces, pair)
      }
    }

    addTerrainRepulsion(forces, path)
    addSmoothnessForces(forces, path)
    addCurvatureForces(forces, path)

    path = integratePath(path, forces)
    path = enforcePhysicalConstraints(path, constraints)
  }

  return path
}
```

---

## 20. Placement des objets après repliement

Pour chaque cluster :

```text
objet.position = centre optimal des positions P(t_i)
objet.orientation = orientation qui couvre les rencontres utiles
objet.field = forme couvrant les rencontres utiles sans trop couvrir les parasites
objet.audio = générateur capable de produire les événements du cluster
```

### 20.1 Split de cluster

Si un cluster est trop dispersé :

```text
un seul objet crée trop de parasites
→ diviser le cluster en deux ou plusieurs objets
```

### 20.2 Champs anisotropes

Utiliser des champs anisotropes pour densifier l’île sans cacophonie :

- `cone` pour statue ;
- `ellipsoid` pour arbre ;
- `ring` pour objet autour duquel on tourne ;
- `sphere` pour notes simples ;
- `capsule` pour nappes le long d’un volume.

---

## 21. Simulation audio

À chaque frame :

```text
1. calculer état du joueur sur le parcours
2. calculer rencontres avec les objets proches
3. mettre à jour les objets continus
4. déclencher les objets enter/peak
5. appliquer mappings audio
6. mettre à jour visuals actifs
```

### 21.1 Loop principal

```ts
function update(dt: number) {
  playback.update(dt)

  const player = pathFollower.getState()
  sceneRenderer.updatePlayer(player)

  const encounters = soundSimulation.computeEncounters(player, soundObjects)

  audioEngine.updateContinuous(encounters)
  audioEngine.triggerEvents(encounters)

  objectRenderer.updateActiveStates(encounters)
}
```

---

## 22. Important : activation audio navigateur

Les navigateurs bloquent souvent l’audio tant que l’utilisateur n’a pas interagi avec la page. Prévoir un écran initial :

```text
[Start Museeka]
```

Au clic :

```ts
await audioEngine.start()
```

Ensuite seulement lancer Tone.js / AudioContext.

---

## 23. Interface utilisateur MVP

### 23.1 Écran principal

Éléments :

- canvas 3D plein écran ;
- bouton Start ;
- sélection de parcours ;
- Play / Pause / Restart ;
- slider vitesse ;
- slider volume ;
- toggle debug ;
- nom du parcours courant ;
- indicateur objet actif.

### 23.2 Debug overlay

Très utile pour Codex et le réglage :

- FPS ;
- temps du parcours ;
- vitesse ;
- position ;
- nombre d’objets actifs ;
- nom des objets récemment déclenchés ;
- courbes de champ visibles en mode debug ;
- sphères/cones/rings d’influence visibles.

---

## 24. Représentation visuelle

Style recommandé pour MVP :

- low-poly ;
- île simple ;
- mer plane ;
- terrain généré ou mesh simple ;
- objets symboliques ;
- couleurs lisibles ;
- pas de besoin d’assets lourds.

Objets visuels MVP :

```text
flower
tree
rock
statue
arch
bird
crab
crystal
temple
waterfall
```

Chaque objet peut être généré par primitives Three.js au début.

Exemple :

- fleur = tige cylinder + pétales spheres/cones ;
- rocher = icoSphere déformée ;
- arbre = cylinder + sphere/cone ;
- oiseau = petit mesh simplifié animé ;
- temple = boîtes/colonnes.

---

## 25. Animaux animés

Un animal a sa propre trajectoire.

```json
{
  "id": "bird_01",
  "kind": "bird",
  "trajectory": {
    "mode": "loop",
    "points": [
      { "t": 0, "p": [4, 14, 2] },
      { "t": 2, "p": [8, 16, -3] }
    ]
  },
  "field": {
    "shape": "sphere",
    "params": { "radius": 4 }
  },
  "audio": {
    "generator": "phrase",
    "instrument": "flute",
    "notes": [
      { "dt": 0.0, "note": "E5", "duration": 0.15 },
      { "dt": 0.2, "note": "G5", "duration": 0.2 }
    ]
  }
}
```

Pour le MVP, un animal animé peut être synchronisé au parcours par temps global. Dans une version plus pure, il répondra au monde indépendamment.

---

## 26. Critères d’acceptation

Le MVP est accepté si :

1. le site démarre dans un navigateur moderne ;
2. il fonctionne servi statiquement ;
3. une île 3D est visible ;
4. on peut choisir 5 parcours ;
5. chaque parcours anime une caméra ou un avatar volant ;
6. les objets sonores sont visibles ;
7. au moins 3 types de champs sont utilisés ;
8. au moins 4 types de générateurs audio sont utilisés :
   - note ;
   - chord ;
   - phrase ;
   - drone ou percussion ;
9. le volume dépend du champ spatial, pas d’une timeline cachée ;
10. au moins un objet est réutilisé par deux moments du même parcours ;
11. au moins un parcours exploite l’altitude ;
12. au moins un champ anisotrope est audible ;
13. la scène est chargée depuis JSON ;
14. le bouton debug permet de visualiser les champs ;
15. le code est structuré pour permettre une future génération depuis MIDI.

---

## 27. Plan de développement conseillé

### Phase 1 — squelette app

- Initialiser projet Vite/TS.
- Installer Three.js et Tone.js.
- Créer canvas 3D.
- Créer UI minimale.
- Déployer localement.

### Phase 2 — scène 3D

- Générer terrain simple.
- Ajouter mer.
- Ajouter caméra.
- Ajouter path follower.
- Afficher une trajectoire.

### Phase 3 — audio simple

- Démarrer AudioContext au clic.
- Créer AudioEngine.
- Créer instruments basiques.
- Jouer note/chord/phrase/drone via API interne.

### Phase 4 — champs sonores

- Implémenter sphere, ellipsoid, cone, ring.
- Implémenter courbes.
- Calculer Encounter.
- Mapper intensity vers volume.

### Phase 5 — objets sonores

- Charger objects depuis JSON.
- Rendre objets visuellement.
- Déclencher son selon rencontre.
- Afficher glow actif.

### Phase 6 — 5 parcours

- Créer 5 path JSON.
- Créer objets pour chaque parcours.
- Ajouter réutilisation d’objets.
- Régler à l’oreille.

### Phase 7 — debug et polish

- Overlay debug.
- Visualisation champs.
- Contrôle vitesse / volume.
- Optimisation performance.

### Phase 8 — préparation future MIDI

- Ajouter types MusicScore / SpatialScore.
- Ajouter un script simple `generate-demo-scene.ts`.
- Documenter le pipeline.

---

## 28. Tests techniques

### 28.1 Tests unitaires recommandés

- `applyCurve()`
- `evaluateSphereField()`
- `evaluateEllipsoidField()`
- `evaluateConeField()`
- `evaluateRingField()`
- `samplePathAtTime()`
- `computeEncounter()`
- `noteNameToFrequency()`
- `mapping input/output`

### 28.2 Tests manuels

- si le joueur reste loin, aucun son déclenché ;
- si le joueur passe au centre d’une sphère, intensité proche de 1 ;
- si le joueur passe derrière un cône, intensité faible ;
- si la vitesse augmente, le parcours lit plus vite ;
- si volume master = 0, silence ;
- si pause, les sons continus s’arrêtent ou se relâchent proprement ;
- si restart, les états de déclenchement sont réinitialisés.

---

## 29. Performance

Objectifs MVP :

- 60 FPS sur desktop raisonnable ;
- acceptable sur mobile récent ;
- maximum 200 objets sonores ;
- maximum 32 voix audio actives ;
- spatialisation simplifiée si nécessaire.

Optimisations :

- calculer seulement les objets proches ;
- broad phase par grille spatiale ;
- limiter les synthés actifs ;
- relâcher proprement les notes ;
- ne pas créer/détruire des synthés à chaque frame ;
- utiliser object pooling si nécessaire.

---

## 30. Règles musicales pour éviter la cacophonie

- Limiter le nombre d’objets actifs simultanés.
- Préférer pentatonique ou gamme simple pour les premiers parcours.
- Utiliser des champs étroits pour les notes courtes.
- Utiliser des champs larges pour drones/pads.
- Les accords doivent souvent être portés par un seul objet.
- Les phrases rapides doivent être portées par un animal ou un objet-phrase.
- Les silences doivent être des volumes d’espace sans objets actifs.
- Les objets réutilisés doivent être anisotropes ou contrôlés par altitude/angle.

---

## 31. Règles de pureté du concept

À respecter autant que possible :

1. Un objet ne connaît pas le parcours sélectionné.
2. Un objet répond à une rencontre spatiale.
3. La timeline ne doit pas déclencher directement la musique.
4. Les animaux peuvent avoir une animation temporelle.
5. Les objets peuvent avoir un état interne minimal : cooldown, phrase déjà déclenchée, release.
6. Le parcours peut être prédéfini, mais il doit lire l’île.

Tolérance MVP :

- quelques réglages spécifiques peuvent être acceptés dans les JSON de démo si nécessaire, mais il faut éviter une architecture qui dépend de cette triche.

---

## 32. Exemple minimal de scène

```json
{
  "version": "0.1",
  "meta": {
    "name": "Museeka Minimal Demo"
  },
  "terrain": {
    "type": "simple_island",
    "radius": 60,
    "heightScale": 12
  },
  "paths": [
    {
      "id": "path_01",
      "name": "First Flight",
      "duration": 16,
      "mode": "flying",
      "points": [
        { "t": 0, "p": [-20, 8, 0] },
        { "t": 4, "p": [-5, 12, 8] },
        { "t": 8, "p": [8, 16, 4] },
        { "t": 12, "p": [18, 10, -8] },
        { "t": 16, "p": [25, 7, 0] }
      ],
      "interpolation": "catmull-rom"
    }
  ],
  "soundObjects": [
    {
      "id": "flower_c4",
      "kind": "flower",
      "transform": { "position": [-15, 8, 1], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "field": {
        "shape": "sphere",
        "params": { "radius": 4 },
        "falloff": { "distance": { "type": "gaussian", "center": 0, "sigma": 0.45 } }
      },
      "trigger": { "mode": "enter", "threshold": 0.35, "cooldown": 0.5 },
      "audio": {
        "generator": "note",
        "instrument": "glass_bell",
        "baseNote": "C4",
        "duration": 0.35,
        "velocity": 0.8
      },
      "mappings": [
        { "input": "field.intensity", "output": "volume", "curve": { "type": "smoothstep" }, "range": [0, 1] }
      ],
      "visual": { "model": "flower", "color": "#88ccff", "activeGlow": true }
    }
  ]
}
```

---

## 33. Prompt de travail pour Codex

Utiliser ce prompt pour lancer l’agent :

```text
You are implementing the first MVP of Museeka, a static 3D musical island playable in the browser.

Read the specification carefully. Implement a Vite + TypeScript static app deployable to GitHub Pages. Use Three.js for rendering and Tone.js/Web Audio for sound. The core rule is that music must be produced by encounters between a flying path and sound objects with spatial fields, not by playing a hidden MIDI track.

Deliver:
1. A working app with a 3D low-poly island.
2. Five selectable predefined flying paths.
3. JSON-loaded scene data.
4. Sound objects with configurable fields: sphere, ellipsoid, cone, ring.
5. Field curves: linear, smoothstep, exponential, gaussian, plateau.
6. Audio generators: note, chord, phrase, drone/percussion.
7. Mappings from encounter/field variables to audio parameters.
8. A debug overlay and field visualization mode.
9. At least one reused object and one altitude-sensitive object.
10. Clean modular TypeScript code prepared for future MIDI-to-island generation.

Avoid implementing a fake timeline audio player. The path must read the island.
```

---

## 34. Future V2

Après MVP :

1. éditeur manuel d’objets ;
2. édition de parcours 3D ;
3. import MIDI ;
4. extraction MusicScore ;
5. génération SpatialScore ;
6. repliement automatique ;
7. modification minimale d’une île existante ;
8. sauvegarde locale ;
9. backend pour partage ;
10. marketplace / galerie de parcours.

Le cœur V2 :

```text
upload MIDI
→ proposer modifications minimales de l’environnement
→ conserver autant que possible les objets existants
→ ajouter / déplacer / reparamétrer seulement ce qui est nécessaire
```

Fonction objectif :

```text
score =
  erreur_musicale
+ coût_modifications
+ sons_parasites
- réutilisation_objets
```

---

## 35. Résumé final

Museeka n’est pas un visualizer musical.  
Museeka n’est pas un lecteur MIDI décoré.

Museeka est une île-instrument.

Le moteur doit permettre de dire :

```text
Voici une musique.
Construis une trajectoire 3D physiquement possible.
Plie cette trajectoire dans l’île.
Place des objets sonores réutilisables.
Fais en sorte que le parcours révèle la musique.
```

La V1 doit prouver ce concept avec 5 parcours prédéfinis, une île simple, des champs sonores paramétrables et une architecture prête pour la génération depuis MIDI.
