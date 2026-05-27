import * as THREE from "three";
import type { Encounter, IslandScene, Path3D, SoundField, SoundObject, SoundObjectVisual, Transform } from "../core/types";
import { samplePathAtTime } from "../core/path";
import type { RuntimeSnapshot } from "../runtime/MuseekaRuntime";
import { groundY } from "./terrain";

type ObjectRecord = {
  root: THREE.Group;
  baseScale: THREE.Vector3;
};

type WaveVertex = {
  x: number;
  z: number;
  phase: number;
};

type CloudRecord = {
  group: THREE.Group;
  baseX: number;
  drift: number;
};

const GROUND_ROOTED_MODELS = new Set<SoundObjectVisual["model"]>([
  "flower",
  "tree",
  "rock",
  "statue",
  "arch",
  "crab",
  "crystal",
  "temple",
  "waterfall"
]);

const SKY_TOP_COLOR = "#5cb6ee";
const SKY_HORIZON_COLOR = "#cfe9ff";

export class MuseekaRenderer {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene3d = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 500);
  private readonly scene: IslandScene;
  private readonly objects = new Map<string, ObjectRecord>();
  private readonly pathGroup = new THREE.Group();
  private readonly fieldGroup = new THREE.Group();
  private readonly waveGroup = new THREE.Group();
  private seaGeometry: THREE.BufferGeometry | null = null;
  private seaVertices: WaveVertex[] = [];
  private readonly cloudGroup = new THREE.Group();
  private clouds: CloudRecord[] = [];
  private playerAvatar: THREE.Group | null = null;
  private playerLight: THREE.PointLight | null = null;
  private trailGeometry: THREE.BufferGeometry | null = null;
  private trailPositions: Float32Array | null = null;
  private trailColors: Float32Array | null = null;
  private trailHead = 0;
  private trailFilled = 0;
  private debug = false;
  private selectedPathId: string;
  private animationTime = 0;
  private readonly TRAIL_LENGTH = 64;

  constructor(container: HTMLElement, scene: IslandScene) {
    this.container = container;
    this.scene = scene;
    this.selectedPathId = scene.settings.defaultPathId;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(SKY_HORIZON_COLOR);
    this.container.appendChild(this.renderer.domElement);

    this.scene3d.background = this.buildSkyTexture();
    this.scene3d.fog = new THREE.Fog(SKY_HORIZON_COLOR, 120, 260);
    this.scene3d.add(this.pathGroup, this.fieldGroup, this.waveGroup, this.cloudGroup);
    this.createLights();
    this.createTerrain();
    this.createClouds();
    this.createEnvironmentProps();
    this.createObjects();
    this.createPaths();
    this.createFields();
    this.createPlayerAvatar();
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  private buildSkyTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, SKY_TOP_COLOR);
      gradient.addColorStop(0.55, "#9fd2f3");
      gradient.addColorStop(1, SKY_HORIZON_COLOR);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private createClouds() {
    this.cloudGroup.clear();
    this.clouds = [];
    const random = this.seededRandom(this.scene.terrain.seed + 9182);
    const cloudMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#dde8f5", emissiveIntensity: 0.18, roughness: 1, flatShading: false, transparent: true, opacity: 0.92 });
    const islandRadius = this.scene.terrain.radius;

    for (let index = 0; index < 14; index += 1) {
      const cloud = new THREE.Group();
      const distance = (0.5 + random() * 1.6) * islandRadius;
      const angle = random() * Math.PI * 2;
      const cx = Math.cos(angle) * distance;
      const cz = Math.sin(angle) * distance;
      const cy = 32 + random() * 28;
      const puffCount = 4 + Math.floor(random() * 4);

      for (let p = 0; p < puffCount; p += 1) {
        const puffSize = 3.2 + random() * 4.5;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(puffSize, 10, 8), cloudMaterial);
        mesh.position.set((random() - 0.5) * puffSize * 2.4, (random() - 0.5) * puffSize * 0.4, (random() - 0.5) * puffSize * 2);
        cloud.add(mesh);
      }

      cloud.position.set(cx, cy, cz);
      cloud.scale.setScalar(0.85 + random() * 0.7);
      this.cloudGroup.add(cloud);
      this.clouds.push({ group: cloud, baseX: cx, drift: 0.5 + random() * 1.2 });
    }
  }

  private updateClouds(dt: number) {
    if (this.clouds.length === 0) return;
    const wrapDistance = this.scene.terrain.radius * 2.4;
    for (const cloud of this.clouds) {
      cloud.group.position.x += cloud.drift * dt;
      if (cloud.group.position.x > cloud.baseX + wrapDistance) {
        cloud.group.position.x = cloud.baseX - wrapDistance;
      }
    }
  }

  private buildStarTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const center = 32;
      const radial = ctx.createRadialGradient(center, center, 0, center, center, 30);
      radial.addColorStop(0, "rgba(255, 255, 235, 1)");
      radial.addColorStop(0.35, "rgba(255, 241, 168, 0.75)");
      radial.addColorStop(0.7, "rgba(255, 200, 90, 0.15)");
      radial.addColorStop(1, "rgba(255, 200, 90, 0)");
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = "rgba(255, 255, 220, 0.85)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(center, 6);
      ctx.lineTo(center, 58);
      ctx.moveTo(6, center);
      ctx.lineTo(58, center);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 200, 0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, 14);
      ctx.lineTo(50, 50);
      ctx.moveTo(50, 14);
      ctx.lineTo(14, 50);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private createPlayerAvatar() {
    this.playerAvatar = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#fffae0" })
    );
    this.playerAvatar.add(core);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.92, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#fff1a8", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.playerAvatar.add(halo);
    const outerHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 16, 12),
      new THREE.MeshBasicMaterial({ color: "#ffd770", transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.playerAvatar.add(outerHalo);
    this.playerLight = new THREE.PointLight("#fff1a8", 2.2, 22, 1.8);
    this.playerAvatar.add(this.playerLight);
    this.scene3d.add(this.playerAvatar);

    this.trailPositions = new Float32Array(this.TRAIL_LENGTH * 3);
    this.trailColors = new Float32Array(this.TRAIL_LENGTH * 3);
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute("color", new THREE.BufferAttribute(this.trailColors, 3));
    this.trailGeometry.setDrawRange(0, 0);

    const trailMaterial = new THREE.PointsMaterial({
      size: 1.1,
      map: this.buildStarTexture(),
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    const trail = new THREE.Points(this.trailGeometry, trailMaterial);
    trail.renderOrder = 2;
    this.scene3d.add(trail);
  }

  private updatePlayerAvatar(snapshot: RuntimeSnapshot) {
    if (!this.playerAvatar || !this.trailGeometry || !this.trailPositions || !this.trailColors) return;

    const visible = snapshot.mode !== "freefly";
    this.playerAvatar.visible = visible;
    if (!visible) {
      this.trailGeometry.setDrawRange(0, 0);
      this.trailFilled = 0;
      this.trailHead = 0;
      return;
    }

    const [px, py, pz] = snapshot.player.position;
    const wobble = Math.sin(this.animationTime * 7) * 0.08;
    this.playerAvatar.position.set(px, py + wobble, pz);
    const pulse = 1 + Math.sin(this.animationTime * 9) * 0.07;
    this.playerAvatar.scale.setScalar(pulse);
    if (this.playerLight) {
      this.playerLight.intensity = 2.0 + Math.sin(this.animationTime * 9) * 0.4;
    }

    const headIndex = this.trailHead * 3;
    this.trailPositions[headIndex] = px;
    this.trailPositions[headIndex + 1] = py + wobble;
    this.trailPositions[headIndex + 2] = pz;
    this.trailHead = (this.trailHead + 1) % this.TRAIL_LENGTH;
    this.trailFilled = Math.min(this.TRAIL_LENGTH, this.trailFilled + 1);

    for (let count = 0; count < this.trailFilled; count += 1) {
      const slot = (this.trailHead - 1 - count + this.TRAIL_LENGTH) % this.TRAIL_LENGTH;
      const age = count / this.TRAIL_LENGTH;
      const fade = Math.pow(1 - age, 1.8);
      const ci = slot * 3;
      this.trailColors[ci] = 1.0 * fade;
      this.trailColors[ci + 1] = 0.94 * fade;
      this.trailColors[ci + 2] = 0.55 * fade;
    }

    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.color.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, this.trailFilled);
  }

  private resetTrail() {
    if (!this.trailGeometry) return;
    this.trailHead = 0;
    this.trailFilled = 0;
    this.trailGeometry.setDrawRange(0, 0);
  }

  setSelectedPath(pathId: string) {
    this.selectedPathId = pathId;
    this.createPaths();
    this.resetTrail();
  }

  setDebug(debug: boolean) {
    this.debug = debug;
    this.pathGroup.visible = debug;
    this.fieldGroup.visible = debug;
  }

  render(snapshot: RuntimeSnapshot) {
    this.animationTime += 0.016;
    const activeSet = new Set(snapshot.activeObjects);
    this.updateSea();
    this.updateClouds(0.016);
    this.updateObjectActivity(activeSet);
    this.updatePlayerAvatar(snapshot);
    this.updateCamera(snapshot);
    this.renderer.render(this.scene3d, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  raycastToTerrain(ndcX: number, ndcY: number): [number, number, number] | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;
    if (Math.abs(direction.y) < 0.0001) return null;
    // Approximate intersection with island surface using groundY iteration
    let t = (0.5 - origin.y) / direction.y;
    if (t < 0) t = 50;
    for (let iter = 0; iter < 8; iter += 1) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      const ground = groundY(x, z, this.scene);
      const targetY = ground;
      const newT = (targetY - origin.y) / direction.y;
      if (newT <= 0 || Math.abs(newT - t) < 0.05) {
        t = newT > 0 ? newT : t;
        break;
      }
      t = newT;
    }
    const point: [number, number, number] = [origin.x + direction.x * t, origin.y + direction.y * t, origin.z + direction.z * t];
    return Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2]) ? point : null;
  }

  private resize = () => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private createLights() {
    const hemi = new THREE.HemisphereLight("#bcdcf4", "#3a5547", 2.4);
    this.scene3d.add(hemi);
    const sun = new THREE.DirectionalLight("#fff5d2", 3.4);
    sun.position.set(36, 64, 22);
    this.scene3d.add(sun);
    const rim = new THREE.DirectionalLight("#a2caf2", 0.9);
    rim.position.set(-42, 24, -30);
    this.scene3d.add(rim);
  }

  private createTerrain() {
    this.createSea();

    const foam = new THREE.Mesh(
      new THREE.RingGeometry(this.scene.terrain.radius * 0.92, this.scene.terrain.radius * 1.015, 128),
      new THREE.MeshBasicMaterial({ color: "#d8fff2", transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = 0.04;
    this.scene3d.add(foam);

    const beach = new THREE.Mesh(
      new THREE.RingGeometry(this.scene.terrain.radius * 0.72, this.scene.terrain.radius * 0.96, 128),
      new THREE.MeshStandardMaterial({ color: "#d7c27d", roughness: 0.96, flatShading: true })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.02;
    this.scene3d.add(beach);

    const size = this.scene.terrain.radius * 2.04;
    const geometry = new THREE.PlaneGeometry(size, size, 112, 112);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors: number[] = [];
    const sand = new THREE.Color("#d7c27d");
    const grass = new THREE.Color("#4f9b65");
    const darkGrass = new THREE.Color("#2f7251");
    const rock = new THREE.Color("#7f887d");
    const cliff = new THREE.Color("#5e6861");
    const underwater = new THREE.Color("#0f5961");

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const distance = Math.sqrt(x * x + z * z);
      const radial = distance / this.scene.terrain.radius;
      const y = radial > 1 ? -0.8 : groundY(x, z, this.scene);
      positions.setY(index, y);

      const color = new THREE.Color();
      if (radial > 1) {
        color.copy(underwater);
      } else if (radial > 0.76 || y < 1.2) {
        color.copy(sand).lerp(grass, Math.max(0, Math.min(1, y / 2.4)));
      } else if (y > this.scene.terrain.heightScale * 1.2) {
        color.copy(rock).lerp(cliff, Math.min(1, (y - this.scene.terrain.heightScale * 1.2) / 5));
      } else {
        color.copy(grass).lerp(darkGrass, Math.max(0, Math.min(1, (y - 2) / 10)));
      }
      colors.push(color.r, color.g, color.b);
    }

    positions.needsUpdate = true;
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const island = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        flatShading: true
      })
    );
    this.scene3d.add(island);
  }

  private createSea() {
    // Sea disk extends well past the fog band (fog ends at 260 m) so its edge
    // never enters the player's view; what they see is always sea fading into
    // sky via the fog blend.
    const seaRadius = Math.max(800, this.scene.terrain.radius * 12);
    const geometry = this.buildSeaDiskGeometry(seaRadius, 32, 128);
    const sea = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: "#1f7fb8", roughness: 0.36, metalness: 0.18 })
    );
    sea.position.y = -0.42;
    this.scene3d.add(sea);
    this.seaGeometry = geometry;
    const positions = this.seaGeometry.attributes.position;
    this.seaVertices = [];

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      this.seaVertices.push({ x, z, phase: Math.sin(x * 0.07 + z * 0.05) });
    }

    this.createWaveCrests();
  }

  /**
   * Tessellated disk in the XZ plane (Y = 0), with concentric rings of vertices
   * so wave displacement on Y looks smooth across the whole surface.
   */
  private buildSeaDiskGeometry(radius: number, rings: number, sectors: number): THREE.BufferGeometry {
    const positions: number[] = [0, 0, 0]; // centre
    const indices: number[] = [];
    for (let r = 1; r <= rings; r += 1) {
      const ringRadius = (r / rings) * radius;
      for (let s = 0; s < sectors; s += 1) {
        const angle = (s / sectors) * Math.PI * 2;
        positions.push(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
      }
    }
    // Inner fan: centre → first ring. Winding is reversed (0, b, a) so the
    // triangle normal points +Y (up); otherwise the sea is back-face-culled
    // when viewed from above and the underwater terrain shows through.
    for (let s = 0; s < sectors; s += 1) {
      const a = 1 + s;
      const b = 1 + ((s + 1) % sectors);
      indices.push(0, b, a);
    }
    // Outer rings: quads between consecutive rings (same flipped winding).
    for (let r = 2; r <= rings; r += 1) {
      const prevStart = 1 + (r - 2) * sectors;
      const currStart = 1 + (r - 1) * sectors;
      for (let s = 0; s < sectors; s += 1) {
        const a = prevStart + s;
        const b = prevStart + ((s + 1) % sectors);
        const c = currStart + s;
        const d = currStart + ((s + 1) % sectors);
        indices.push(a, d, c);
        indices.push(a, b, d);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  private updateSea() {
    if (!this.seaGeometry) return;

    const positions = this.seaGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const vertex = this.seaVertices[index];
      const wave =
        Math.sin(vertex.x * 0.08 + this.animationTime * 1.4 + vertex.phase) * 0.18 +
        Math.cos(vertex.z * 0.065 + this.animationTime * 1.1) * 0.12 +
        Math.sin((vertex.x + vertex.z) * 0.035 + this.animationTime * 0.72) * 0.08;
      positions.setY(index, wave);
    }
    positions.needsUpdate = true;
    this.seaGeometry.computeVertexNormals();

    this.waveGroup.children.forEach((child, index) => {
      child.position.y = 0.04 + Math.sin(this.animationTime * 1.4 + index * 0.7) * 0.08;
      child.scale.setScalar(1 + ((this.animationTime * 0.02 + index * 0.018) % 0.08));
      const material = (child as THREE.Line).material;
      if (material instanceof THREE.LineBasicMaterial) {
        material.opacity = 0.18 + Math.sin(this.animationTime * 1.1 + index) * 0.05;
      }
    });
  }

  private createWaveCrests() {
    const random = this.seededRandom(this.scene.terrain.seed + 404);
    const materialColors = ["#d8fff2", "#9fe8ef", "#bff6ff"];

    for (let index = 0; index < 18; index += 1) {
      const nearShore = index < 8;
      const radius = nearShore ? this.scene.terrain.radius * (0.95 + index * 0.035) : this.scene.terrain.radius * (1.35 + random() * 1.25);
      const start = random() * Math.PI * 2;
      const length = nearShore ? 0.45 + random() * 0.55 : 0.25 + random() * 0.45;
      const points: THREE.Vector3[] = [];

      for (let step = 0; step < 28; step += 1) {
        const t = step / 27;
        const angle = start + (t - 0.5) * length;
        const ripple = Math.sin(t * Math.PI * 3 + index) * 0.7;
        points.push(new THREE.Vector3(Math.cos(angle) * (radius + ripple), 0.08, Math.sin(angle) * (radius + ripple)));
      }

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: materialColors[index % materialColors.length],
          transparent: true,
          opacity: nearShore ? 0.34 : 0.2,
          depthTest: false,
          depthWrite: false
        })
      );
      this.waveGroup.add(line);
    }
  }

  private createEnvironmentProps() {
    const random = this.seededRandom(this.scene.terrain.seed + 7331);
    const props: Array<{ visual: SoundObjectVisual; transform: Transform }> = [];

    for (let index = 0; index < 52; index += 1) {
      const radius = 6 + Math.sqrt(random()) * this.scene.terrain.radius * 0.62;
      const angle = random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = groundY(x, z, this.scene);
      if (y < 1.4) continue;
      const scale = 0.62 + random() * 0.9;
      props.push({
        visual: { model: random() > 0.38 ? "tree" : "rock", color: random() > 0.5 ? "#4f9b65" : "#6c8f5d" },
        transform: { position: [x, y + 0.08, z], rotation: [0, random() * 360, 0], scale: [scale, scale, scale] }
      });
    }

    for (let index = 0; index < 90; index += 1) {
      const radius = 8 + Math.sqrt(random()) * this.scene.terrain.radius * 0.72;
      const angle = random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = groundY(x, z, this.scene);
      if (y < 0.7 || y > 11) continue;
      const scale = 0.28 + random() * 0.42;
      props.push({
        visual: { model: "flower", color: random() > 0.5 ? "#ff9d8d" : "#e8a2ff" },
        transform: { position: [x, y + 0.05, z], rotation: [0, random() * 360, 0], scale: [scale, scale, scale] }
      });
    }

    for (const prop of props) {
      this.scene3d.add(this.createVisual(prop.visual, prop.transform));
    }
  }

  private seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  private createObjects() {
    for (const object of this.scene.soundObjects) {
      const visualTransform = this.visualTransformFor(object.visual, object.transform);
      const root = this.createVisual(object.visual, visualTransform);
      root.name = object.id;
      this.scene3d.add(root);
      this.objects.set(object.id, { root, baseScale: root.scale.clone() });
    }

    for (const object of this.scene.visualObjects) {
      const visualTransform = this.visualTransformFor(object.visual, object.transform);
      const root = this.createVisual(object.visual, visualTransform);
      root.name = object.id;
      this.scene3d.add(root);
    }
  }

  private visualTransformFor(visual: SoundObjectVisual, transform: Transform): Transform {
    if (!GROUND_ROOTED_MODELS.has(visual.model)) {
      return transform;
    }
    const [x, , z] = transform.position;
    const y = groundY(x, z, this.scene);
    return { ...transform, position: [x, y, z] };
  }

  private createVisual(visual: SoundObjectVisual, transform: Transform): THREE.Group {
    const group = new THREE.Group();
    group.position.set(transform.position[0], transform.position[1], transform.position[2]);
    group.rotation.set(THREE.MathUtils.degToRad(transform.rotation[0]), THREE.MathUtils.degToRad(transform.rotation[1]), THREE.MathUtils.degToRad(transform.rotation[2]));
    group.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
    const baseColor = new THREE.Color(visual.color);

    const addMesh = (
      geometry: THREE.BufferGeometry,
      position: [number, number, number],
      scale: [number, number, number] = [1, 1, 1],
      color: THREE.ColorRepresentation = visual.color,
      rotation: [number, number, number] = [0, 0, 0],
      roughness = 0.7
    ) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }));
      mesh.position.set(position[0], position[1], position[2]);
      mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      group.add(mesh);
      return mesh;
    };

    switch (visual.model) {
      case "flower": {
        addMesh(new THREE.CylinderGeometry(0.045, 0.065, 1.05, 6), [0, 0.52, 0], [1, 1, 1], "#3f8f55");
        addMesh(new THREE.SphereGeometry(0.13, 8, 6), [0, 1.14, 0], [1, 1, 1], "#f5c95d", [0, 0, 0], 0.5);
        for (let index = 0; index < 7; index += 1) {
          const angle = (index / 7) * Math.PI * 2;
          addMesh(
            new THREE.SphereGeometry(0.18, 8, 6),
            [Math.cos(angle) * 0.22, 1.14 + Math.sin(index) * 0.015, Math.sin(angle) * 0.22],
            [1.15, 0.34, 0.78],
            baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.14),
            [0, angle, Math.PI * 0.08],
            0.55
          );
        }
        addMesh(new THREE.ConeGeometry(0.16, 0.45, 5), [-0.18, 0.52, 0], [0.5, 0.25, 1], "#4fae62", [0, 0, Math.PI * 0.72]);
        addMesh(new THREE.ConeGeometry(0.16, 0.45, 5), [0.18, 0.68, 0], [0.5, 0.25, 1], "#4fae62", [0, 0, -Math.PI * 0.72]);
        break;
      }
      case "tree": {
        addMesh(new THREE.CylinderGeometry(0.24, 0.42, 2.35, 7), [0, 1.18, 0], [1, 1, 1], "#77533a", [0.04, 0, -0.05], 0.86);
        addMesh(new THREE.CylinderGeometry(0.07, 0.11, 1.0, 5), [-0.35, 2.05, 0], [1, 1, 1], "#77533a", [0.15, 0, Math.PI * 0.31], 0.86);
        addMesh(new THREE.CylinderGeometry(0.06, 0.1, 0.85, 5), [0.34, 2.22, 0.08], [1, 1, 1], "#77533a", [0.2, 0.2, -Math.PI * 0.34], 0.86);
        addMesh(new THREE.IcosahedronGeometry(1.0, 1), [-0.36, 2.95, 0.02], [1.05, 0.82, 1.0], baseColor.clone().lerp(new THREE.Color("#2d6b46"), 0.25));
        addMesh(new THREE.IcosahedronGeometry(1.15, 1), [0.45, 3.08, 0.1], [1.0, 0.9, 1.12], baseColor.clone().lerp(new THREE.Color("#73c45c"), 0.18));
        addMesh(new THREE.IcosahedronGeometry(0.86, 1), [0.06, 3.72, -0.22], [0.9, 0.72, 0.88], baseColor.clone().lerp(new THREE.Color("#2b6540"), 0.08));
        break;
      }
      case "rock":
        addMesh(new THREE.IcosahedronGeometry(1.0, 1), [-0.24, 0.72, 0.05], [1.25, 0.7, 0.95], "#6f766f", [0.1, 0.4, -0.05], 0.92);
        addMesh(new THREE.IcosahedronGeometry(0.76, 1), [0.56, 0.58, -0.16], [1.0, 0.58, 0.8], "#8a9188", [0.2, 0.1, 0.12], 0.92);
        addMesh(new THREE.IcosahedronGeometry(0.48, 0), [-0.75, 0.42, -0.36], [0.9, 0.56, 0.72], "#59645f", [0.25, 0.5, 0.1], 0.95);
        break;
      case "statue":
        addMesh(new THREE.CylinderGeometry(0.7, 0.9, 0.48, 8), [0, 0.24, 0], [1, 1, 1], "#9a9d8d");
        addMesh(new THREE.BoxGeometry(0.88, 1.8, 0.58), [0, 1.36, 0], [1, 1, 1], "#b7b59d", [0, 0.05, 0]);
        addMesh(new THREE.CylinderGeometry(0.16, 0.18, 1.25, 6), [-0.62, 1.42, 0], [1, 1, 1], "#a9a894", [0, 0, -0.25]);
        addMesh(new THREE.CylinderGeometry(0.16, 0.18, 1.25, 6), [0.62, 1.42, 0], [1, 1, 1], "#a9a894", [0, 0, 0.25]);
        addMesh(new THREE.IcosahedronGeometry(0.42, 1), [0, 2.48, 0], [0.85, 1.05, 0.85], "#c6c0a5");
        break;
      case "arch":
        addMesh(new THREE.BoxGeometry(0.48, 2.45, 0.58), [-0.9, 1.22, 0], [1, 1, 1], "#9b937a");
        addMesh(new THREE.BoxGeometry(0.48, 2.45, 0.58), [0.9, 1.22, 0], [1, 1, 1], "#9b937a");
        addMesh(new THREE.BoxGeometry(2.32, 0.48, 0.62), [0, 2.5, 0], [1, 1, 1], "#b6aa89");
        addMesh(new THREE.BoxGeometry(0.62, 0.3, 0.72), [-0.9, 0.15, 0], [1, 1, 1], "#766f61");
        addMesh(new THREE.BoxGeometry(0.62, 0.3, 0.72), [0.9, 0.15, 0], [1, 1, 1], "#766f61");
        break;
      case "bird":
        addMesh(new THREE.IcosahedronGeometry(0.32, 1), [0, 0.72, 0], [1.2, 0.8, 0.9], baseColor);
        addMesh(new THREE.ConeGeometry(0.26, 0.75, 3), [-0.52, 0.72, 0], [0.6, 0.16, 1.25], baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.12), [0, 0, Math.PI * 0.5]);
        addMesh(new THREE.ConeGeometry(0.26, 0.75, 3), [0.52, 0.72, 0], [0.6, 0.16, 1.25], baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.12), [0, 0, -Math.PI * 0.5]);
        addMesh(new THREE.ConeGeometry(0.12, 0.34, 4), [0, 0.72, 0.36], [0.8, 0.8, 0.8], "#f6d365", [Math.PI * 0.5, 0, 0]);
        break;
      case "crab":
        addMesh(new THREE.IcosahedronGeometry(0.55, 1), [0, 0.35, 0], [1.25, 0.45, 0.8], baseColor);
        addMesh(new THREE.SphereGeometry(0.14, 8, 6), [-0.55, 0.58, 0.25], [1, 1, 1], "#fff1d7");
        addMesh(new THREE.SphereGeometry(0.14, 8, 6), [0.55, 0.58, 0.25], [1, 1, 1], "#fff1d7");
        for (const side of [-1, 1]) {
          for (let index = 0; index < 3; index += 1) {
            addMesh(new THREE.CylinderGeometry(0.035, 0.045, 0.8, 5), [side * (0.45 + index * 0.16), 0.22, -0.22 + index * 0.19], [1, 1, 1], baseColor, [Math.PI * 0.5, 0, side * (0.72 + index * 0.13)]);
          }
        }
        break;
      case "temple":
        addMesh(new THREE.BoxGeometry(4.0, 0.38, 3.2), [0, 0.19, 0], [1, 1, 1], "#afa47e");
        addMesh(new THREE.BoxGeometry(3.2, 0.28, 2.55), [0, 0.56, 0], [1, 1, 1], "#d1c395");
        for (const x of [-1.25, 0, 1.25]) {
          addMesh(new THREE.CylinderGeometry(0.17, 0.22, 2.15, 8), [x, 1.62, -0.88], [1, 1, 1], "#e0d5aa");
          addMesh(new THREE.CylinderGeometry(0.17, 0.22, 2.15, 8), [x, 1.62, 0.88], [1, 1, 1], "#e0d5aa");
        }
        addMesh(new THREE.BoxGeometry(3.6, 0.3, 2.75), [0, 2.84, 0], [1, 1, 1], "#b8ab82");
        addMesh(new THREE.ConeGeometry(2.5, 1.2, 4), [0, 3.54, 0], [1, 1, 1], "#8b7867", [0, Math.PI * 0.25, 0]);
        break;
      case "waterfall":
        addMesh(new THREE.IcosahedronGeometry(1.25, 1), [-0.9, 0.8, -0.2], [1.15, 0.7, 0.75], "#66706d");
        addMesh(new THREE.IcosahedronGeometry(1.15, 1), [0.9, 0.75, -0.25], [1.0, 0.65, 0.85], "#7d8580");
        addMesh(new THREE.BoxGeometry(1.35, 4.8, 0.16), [0, 2.7, 0.08], [1, 1, 1], "#8be7ff", [0.08, 0, 0], 0.28);
        addMesh(new THREE.SphereGeometry(0.55, 10, 6), [0, 0.35, 0.35], [1.6, 0.22, 0.8], "#d5fbff", [0, 0, 0], 0.18);
        break;
      case "crystal":
      default:
        addMesh(new THREE.OctahedronGeometry(0.75, 0), [0, 0.85, 0], [0.85, 1.4, 0.85], baseColor.clone().lerp(new THREE.Color("#ffffff"), 0.18), [0.12, 0.4, 0], 0.3);
        addMesh(new THREE.CylinderGeometry(0.36, 0.5, 0.16, 6), [0, 0.08, 0], [1, 1, 1], "#59645f", [0, 0.2, 0]);
        break;
    }

    return group;
  }

  private createPaths() {
    this.pathGroup.clear();
    for (const path of this.scene.paths) {
      const points = this.samplePathPoints(path, 90).map((point) => new THREE.Vector3(point[0], point[1], point[2]));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: path.id === this.selectedPathId ? "#fff1a8" : "#8fd8ff", transparent: true, opacity: path.id === this.selectedPathId ? 0.95 : 0.35 });
      this.pathGroup.add(new THREE.Line(geometry, material));
    }
    this.pathGroup.visible = this.debug;
  }

  private createFields() {
    this.fieldGroup.clear();
    for (const object of this.scene.soundObjects) {
      const mesh = this.fieldMesh(object.field, object.visual.color);
      mesh.position.set(object.transform.position[0], object.transform.position[1], object.transform.position[2]);
      this.fieldGroup.add(mesh);
    }
    this.fieldGroup.visible = this.debug;
  }

  private fieldMesh(field: SoundField, color: string): THREE.Object3D {
    const material = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.24 });
    if (field.shape === "sphere") {
      return new THREE.Mesh(new THREE.SphereGeometry(field.params.radius, 16, 10), material);
    }
    if (field.shape === "ellipsoid") {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material);
      mesh.scale.set(field.params.radius[0], field.params.radius[1], field.params.radius[2]);
      return mesh;
    }
    if (field.shape === "cone") {
      const radius = Math.tan(THREE.MathUtils.degToRad(field.params.angleDegrees / 2)) * field.params.range;
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, field.params.range, 24, 1, true), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = field.params.range / 2;
      return mesh;
    }
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(field.params.centerRadius, field.params.thickness, 8, 40), material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private samplePathPoints(path: Path3D, count: number) {
    return Array.from({ length: count }, (_, index) => samplePathAtTime(path, (path.duration * index) / Math.max(1, count - 1)));
  }

  private updateObjectActivity(activeSet: Set<string>) {
    for (const [id, record] of this.objects) {
      const active = activeSet.has(id);
      const pulse = active ? 1.12 + Math.sin(this.animationTime * 8) * 0.04 : 1;
      record.root.scale.copy(record.baseScale).multiplyScalar(pulse);
      record.root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.set(active ? "#fff1a8" : "#000000");
          child.material.emissiveIntensity = active ? 0.55 : 0;
        }
      });
    }
  }

  private updateCamera(snapshot: RuntimeSnapshot) {
    const position = snapshot.player.position;

    if (snapshot.mode === "freefly") {
      const yaw = snapshot.freeFlyYaw ?? 0;
      const pitch = snapshot.freeFlyPitch ?? 0;
      const cosPitch = Math.cos(pitch);
      const look = new THREE.Vector3(Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
      this.camera.position.set(position[0], position[1], position[2]);
      const target = this.camera.position.clone().add(look);
      this.camera.lookAt(target);
      return;
    }

    const velocity = snapshot.player.velocity;
    const cameraTarget = new THREE.Vector3(position[0], position[1], position[2]);
    // Camera trails behind & above the firefly, pulled back a bit more
    // than before so the scene reads better.
    const offset = new THREE.Vector3(-velocity[0] * 0.5, 10, -velocity[2] * 0.5);
    if (offset.length() < 14) {
      offset.set(15, 11, 18);
    }
    offset.clampLength(16, 28);
    const desired = cameraTarget.clone().add(offset);
    // Ensure the camera stays well clear of the terrain at its own XZ —
    // hills shouldn't poke into or above the camera. Min clearance accounts
    // for the tallest objects (anchor visuals + sphere top ≈ 4 m).
    const camGround = groundY(desired.x, desired.z, this.scene);
    const minCamY = camGround + 8;
    if (desired.y < minCamY) desired.y = minCamY;
    this.camera.position.lerp(desired, 0.08);
    this.camera.lookAt(cameraTarget);
  }
}
