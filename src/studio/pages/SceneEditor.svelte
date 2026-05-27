<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import * as THREE from "three";
  import { t } from "../../ui/i18n";
  import { navigate } from "../router";
  import { terrainGroundY } from "../../core/terrain";

  /* ─── Persisted scene config ─────────────────────────────────────── */

  const STORAGE_KEY = "museeka.studio.scenePreset.v2";
  const HEIGHTMAP_RES = 64;
  const MESH_SEGMENTS = 128;

  type GradientStop = { t: number; color: string };

  type SceneConfig = {
    radius: number;
    heightScale: number;
    seed: number;
    heightmap: number[]; // additive deltas, length = HEIGHTMAP_RES²
    stops: GradientStop[];
  };

  const DEFAULT_STOPS: GradientStop[] = [
    { t: 0.00, color: "#0f5961" }, // underwater
    { t: 0.10, color: "#d7c27d" }, // beach
    { t: 0.30, color: "#4f9b65" }, // grass
    { t: 0.55, color: "#2f7251" }, // dark grass
    { t: 0.80, color: "#7f887d" }, // rock
    { t: 1.00, color: "#5e6861" }  // cliff
  ];

  function defaultConfig(): SceneConfig {
    return {
      radius: 96,
      heightScale: 10,
      seed: 12345,
      heightmap: new Array(HEIGHTMAP_RES * HEIGHTMAP_RES).fill(0),
      stops: DEFAULT_STOPS.map((s) => ({ ...s }))
    };
  }

  let cfg: SceneConfig = defaultConfig();

  /* ─── 2D heightmap canvas ────────────────────────────────────────── */

  let mapCanvas: HTMLCanvasElement;
  let mapCtx: CanvasRenderingContext2D | null = null;
  let painting = false;
  let brushRadius = 8;     // pixels in the 2D canvas
  let brushStrength = 0.6; // delta per second of paint contact (m)
  let brushSign: 1 | -1 = 1;
  let brushShape: "round" | "square" = "round";

  function redrawMap() {
    if (!mapCtx) return;
    const img = mapCtx.createImageData(HEIGHTMAP_RES, HEIGHTMAP_RES);
    for (let y = 0; y < HEIGHTMAP_RES; y += 1) {
      for (let x = 0; x < HEIGHTMAP_RES; x += 1) {
        const idx = y * HEIGHTMAP_RES + x;
        // Combined base (procedural) + delta for visualization
        const worldX = (x / (HEIGHTMAP_RES - 1) - 0.5) * 2 * cfg.radius;
        const worldZ = (y / (HEIGHTMAP_RES - 1) - 0.5) * 2 * cfg.radius;
        const base = terrainGroundY(worldX, worldZ, { type: "simple_island", radius: cfg.radius, heightScale: cfg.heightScale, seed: cfg.seed });
        const total = base + cfg.heightmap[idx];
        // Map total → grayscale; -2 → 0, +heightScale*1.5 → 255
        const norm = Math.max(0, Math.min(1, (total + 2) / (cfg.heightScale * 1.5 + 2)));
        const v = Math.round(norm * 255);
        const o = idx * 4;
        img.data[o] = v;
        img.data[o + 1] = v;
        img.data[o + 2] = v;
        img.data[o + 3] = 255;
      }
    }
    // Draw upscaled to canvas size
    const tmp = document.createElement("canvas");
    tmp.width = HEIGHTMAP_RES;
    tmp.height = HEIGHTMAP_RES;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    mapCtx.imageSmoothingEnabled = false;
    mapCtx.drawImage(tmp, 0, 0, mapCanvas.width, mapCanvas.height);
    // Overlay an island-bound circle
    const cx = mapCanvas.width / 2;
    const cy = mapCanvas.height / 2;
    mapCtx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, mapCanvas.width / 2 - 1, 0, Math.PI * 2);
    mapCtx.stroke();
  }

  function paintAt(canvasX: number, canvasY: number, deltaSeconds: number) {
    const px = Math.round((canvasX / mapCanvas.width) * HEIGHTMAP_RES);
    const py = Math.round((canvasY / mapCanvas.height) * HEIGHTMAP_RES);
    const radius = brushRadius * (HEIGHTMAP_RES / mapCanvas.width);
    const strength = brushStrength * brushSign * deltaSeconds;
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(px - radius));
    const x1 = Math.min(HEIGHTMAP_RES - 1, Math.ceil(px + radius));
    const y0 = Math.max(0, Math.floor(py - radius));
    const y1 = Math.min(HEIGHTMAP_RES - 1, Math.ceil(py + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x - px;
        const dy = y - py;
        let f = 0;
        if (brushShape === "round") {
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          f = 1 - Math.sqrt(d2) / radius; // linear falloff
        } else {
          if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
          f = 1;
        }
        cfg.heightmap[y * HEIGHTMAP_RES + x] += strength * f;
      }
    }
  }

  function onMapPointerDown(e: PointerEvent) {
    painting = true;
    mapCanvas.setPointerCapture(e.pointerId);
    const rect = mapCanvas.getBoundingClientRect();
    paintAt(e.clientX - rect.left, e.clientY - rect.top, 1 / 30);
    refresh();
  }

  function onMapPointerMove(e: PointerEvent) {
    if (!painting) return;
    const rect = mapCanvas.getBoundingClientRect();
    paintAt(e.clientX - rect.left, e.clientY - rect.top, 1 / 30);
    refresh();
  }

  function onMapPointerUp(e: PointerEvent) {
    painting = false;
    try { mapCanvas.releasePointerCapture(e.pointerId); } catch {}
    persist();
  }

  function resetHeightmap() {
    cfg.heightmap = new Array(HEIGHTMAP_RES * HEIGHTMAP_RES).fill(0);
    refresh();
    persist();
  }

  /* ─── Gradient editor ────────────────────────────────────────────── */

  function addStop() {
    cfg.stops = [...cfg.stops, { t: 0.5, color: "#ffffff" }].sort((a, b) => a.t - b.t);
    refresh();
  }

  function removeStop(i: number) {
    if (cfg.stops.length <= 2) return;
    cfg.stops = cfg.stops.filter((_, idx) => idx !== i);
    refresh();
  }

  function updateStop() {
    cfg.stops = cfg.stops.slice().sort((a, b) => a.t - b.t);
    refresh();
  }

  function hexToRgb(hex: string): [number, number, number] {
    const c = hex.replace("#", "");
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  }

  /** Sample gradient at normalized altitude t ∈ [0, 1]. */
  function sampleGradient(tNorm: number): [number, number, number] {
    const stops = cfg.stops.slice().sort((a, b) => a.t - b.t);
    if (tNorm <= stops[0].t) return hexToRgb(stops[0].color);
    if (tNorm >= stops[stops.length - 1].t) return hexToRgb(stops[stops.length - 1].color);
    for (let i = 1; i < stops.length; i += 1) {
      if (tNorm <= stops[i].t) {
        const a = stops[i - 1];
        const b = stops[i];
        const u = (tNorm - a.t) / Math.max(0.0001, b.t - a.t);
        const ca = hexToRgb(a.color);
        const cb = hexToRgb(b.color);
        return [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];
      }
    }
    return hexToRgb(stops[stops.length - 1].color);
  }

  $: gradientCss = (() => {
    const sorted = cfg.stops.slice().sort((a, b) => a.t - b.t);
    return `linear-gradient(0deg, ${sorted.map((s) => `${s.color} ${(s.t * 100).toFixed(1)}%`).join(", ")})`;
  })();

  /* ─── Custom Three.js preview ────────────────────────────────────── */

  let host: HTMLDivElement;
  let renderer3: THREE.WebGLRenderer | null = null;
  let scene3d: THREE.Scene | null = null;
  let camera3: THREE.PerspectiveCamera | null = null;
  let mesh: THREE.Mesh | null = null;
  let waterMesh: THREE.Mesh | null = null;
  let frame = 0;

  function sampleHeightmapDelta(x: number, z: number): number {
    // x, z in world coords [-radius, radius]
    const u = (x + cfg.radius) / (2 * cfg.radius);
    const v = (z + cfg.radius) / (2 * cfg.radius);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const fx = u * (HEIGHTMAP_RES - 1);
    const fy = v * (HEIGHTMAP_RES - 1);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const idx = (xi: number, yi: number) => Math.min(HEIGHTMAP_RES - 1, Math.max(0, yi)) * HEIGHTMAP_RES + Math.min(HEIGHTMAP_RES - 1, Math.max(0, xi));
    const h00 = cfg.heightmap[idx(ix, iy)];
    const h10 = cfg.heightmap[idx(ix + 1, iy)];
    const h01 = cfg.heightmap[idx(ix, iy + 1)];
    const h11 = cfg.heightmap[idx(ix + 1, iy + 1)];
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  }

  function buildTerrainMesh(): THREE.Mesh {
    const size = cfg.radius * 2.04;
    const geometry = new THREE.PlaneGeometry(size, size, MESH_SEGMENTS, MESH_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors: number[] = [];
    const peak = cfg.heightScale * 1.4;
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const radial = Math.hypot(x, z) / cfg.radius;
      const procedural = radial > 1
        ? -0.8
        : terrainGroundY(x, z, { type: "simple_island", radius: cfg.radius, heightScale: cfg.heightScale, seed: cfg.seed });
      const y = procedural + sampleHeightmapDelta(x, z);
      positions.setY(i, y);
      // Color by altitude (normalized to [waterLevel, peak])
      const normY = Math.max(0, Math.min(1, (y + 1) / (peak + 1)));
      const [r, g, b] = sampleGradient(normY);
      colors.push(r / 255, g / 255, b / 255);
    }
    positions.needsUpdate = true;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
  }

  function buildWater(): THREE.Mesh {
    const geom = new THREE.CircleGeometry(Math.max(cfg.radius * 1.5, 200), 64);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: "#1f7fb8", roughness: 0.36, metalness: 0.18 });
    const m = new THREE.Mesh(geom, mat);
    m.position.y = -0.42;
    return m;
  }

  function rebuildMesh() {
    if (!scene3d) return;
    if (mesh) {
      scene3d.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    mesh = buildTerrainMesh();
    scene3d.add(mesh);
  }

  function initThree() {
    renderer3 = new THREE.WebGLRenderer({ antialias: true });
    renderer3.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer3.setSize(host.clientWidth, host.clientHeight, false);
    renderer3.setClearColor("#0c1418");
    host.appendChild(renderer3.domElement);
    scene3d = new THREE.Scene();
    scene3d.fog = new THREE.Fog("#cfe9ff", 120, 320);
    camera3 = new THREE.PerspectiveCamera(48, host.clientWidth / host.clientHeight, 0.1, 800);
    camera3.position.set(cfg.radius * 0.9, cfg.heightScale * 4 + 35, cfg.radius * 0.9);
    const hemi = new THREE.HemisphereLight("#e9f1ff", "#1a2a30", 0.95);
    const dir = new THREE.DirectionalLight("#fffbe6", 0.7);
    dir.position.set(40, 80, 30);
    scene3d.add(hemi, dir);
    waterMesh = buildWater();
    scene3d.add(waterMesh);
    rebuildMesh();
    loop();
  }

  function loop() {
    if (!renderer3 || !scene3d || !camera3) return;
    const t = performance.now() * 0.00012;
    const r = cfg.radius * 1.4;
    camera3.position.set(Math.cos(t) * r, cfg.heightScale * 4 + 30, Math.sin(t) * r);
    camera3.lookAt(0, cfg.heightScale * 0.5, 0);
    renderer3.render(scene3d, camera3);
    frame = requestAnimationFrame(loop);
  }

  function refresh() {
    redrawMap();
    rebuildMesh();
  }

  function persist() {
    try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  }

  function load() {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Partial<SceneConfig>;
      cfg = {
        radius: saved.radius ?? cfg.radius,
        heightScale: saved.heightScale ?? cfg.heightScale,
        seed: saved.seed ?? cfg.seed,
        heightmap: Array.isArray(saved.heightmap) && saved.heightmap.length === HEIGHTMAP_RES * HEIGHTMAP_RES
          ? saved.heightmap
          : new Array(HEIGHTMAP_RES * HEIGHTMAP_RES).fill(0),
        stops: Array.isArray(saved.stops) && saved.stops.length >= 2 ? saved.stops : cfg.stops
      };
    } catch {
      // ignore
    }
  }

  onMount(async () => {
    load();
    await tick();
    mapCtx = mapCanvas.getContext("2d");
    redrawMap();
    initThree();
  });

  onDestroy(() => {
    cancelAnimationFrame(frame);
    renderer3?.dispose();
    if (mesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    if (waterMesh) {
      waterMesh.geometry.dispose();
      (waterMesh.material as THREE.Material).dispose();
    }
  });

  function reset() {
    cfg = defaultConfig();
    refresh();
    persist();
  }

  function randomSeed() {
    cfg.seed = Math.floor(Math.random() * 999999);
    refresh();
    persist();
  }
</script>

<section class="scene-editor-v2">
  <header>
    <h1>{t("studio_scene_title")}</h1>
    <p class="lead">{t("studio_scene_desc")}</p>
  </header>

  <div class="scene-editor-layout">
    <!-- Top row: 3D preview + 2D heightmap -->
    <div class="scene-preview-3d" bind:this={host}></div>

    <div class="scene-tools">
      <div class="map-block">
        <h3>Vue de dessus · heightmap</h3>
        <canvas
          class="heightmap-canvas"
          bind:this={mapCanvas}
          width="420"
          height="420"
          on:pointerdown={onMapPointerDown}
          on:pointermove={onMapPointerMove}
          on:pointerup={onMapPointerUp}
          on:pointercancel={onMapPointerUp}
        ></canvas>
        <p class="hint">Maintiens et glisse pour peindre. Le rendu 3D se met à jour en temps réel.</p>
      </div>

      <div class="brush-block">
        <h3>Pinceau</h3>
        <label>Rayon ({brushRadius} px)
          <input type="range" min="3" max="60" step="1" bind:value={brushRadius} />
        </label>
        <label>Intensité ({brushStrength.toFixed(2)} m/coup)
          <input type="range" min="0.05" max="2" step="0.05" bind:value={brushStrength} />
        </label>
        <div class="row">
          <label class="seg">Sens
            <div class="seg-group">
              <button class:active={brushSign === 1} on:click={() => (brushSign = 1)}>▲ Élever</button>
              <button class:active={brushSign === -1} on:click={() => (brushSign = -1)}>▼ Abaisser</button>
            </div>
          </label>
          <label class="seg">Forme
            <div class="seg-group">
              <button class:active={brushShape === "round"} on:click={() => (brushShape = "round")}>● Rond</button>
              <button class:active={brushShape === "square"} on:click={() => (brushShape = "square")}>■ Carré</button>
            </div>
          </label>
        </div>
        <button on:click={resetHeightmap}>Effacer le relief peint</button>
      </div>
    </div>

    <div class="scene-bottom">
      <div class="terrain-params">
        <h3>Terrain de base</h3>
        <label>Rayon ({cfg.radius} m)
          <input type="range" min="40" max="160" step="1" bind:value={cfg.radius} on:change={refresh} />
        </label>
        <label>Échelle verticale ({cfg.heightScale.toFixed(1)})
          <input type="range" min="0" max="20" step="0.5" bind:value={cfg.heightScale} on:change={refresh} />
        </label>
        <label>Seed
          <input type="number" bind:value={cfg.seed} on:change={refresh} />
        </label>
        <div class="row">
          <button on:click={randomSeed}>🎲 Nouveau seed</button>
          <button on:click={reset}>Réinitialiser tout</button>
        </div>
      </div>

      <div class="gradient-block">
        <h3>Gradient d'altitude</h3>
        <div class="gradient-row">
          <div class="gradient-strip" style="background: {gradientCss}"></div>
          <div class="gradient-stops">
            {#each cfg.stops as stop, i}
              <div class="stop">
                <input type="color" bind:value={stop.color} on:input={updateStop} />
                <input
                  type="range"
                  min="0" max="1" step="0.01"
                  bind:value={stop.t}
                  on:input={updateStop}
                />
                <span class="t">{(stop.t * 100).toFixed(0)}%</span>
                <button class="danger" on:click={() => removeStop(i)} disabled={cfg.stops.length <= 2}>×</button>
              </div>
            {/each}
            <button on:click={addStop}>+ Ajouter un palier</button>
          </div>
        </div>
        <p class="hint">Les couleurs sont interpolées entre les paliers. 0 % = mer, 100 % = sommet.</p>
      </div>
    </div>
  </div>

  <button class="back" on:click={() => navigate("home")}>{t("studio_back_to_home")}</button>
</section>
