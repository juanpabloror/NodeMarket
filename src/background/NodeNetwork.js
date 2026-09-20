import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  LineSegments,
  MathUtils,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { buildFormation } from './formations.js';

const DEFAULTS = {
  nodeCount: 180, // capacidad máxima; la calidad decide cuántos se ven
  initialCount: null,
  bounds: { x: 36, y: 20, z: 14 }, // volumen de la formación "calma", en unidades del mundo
  speed: 0.45, // unidades/s
  connectionDistance: 6,
  maxLinksPerNode: 2, // cada nodo enlaza con sus N vecinos más cercanos
  linkOpacity: 0.5,
  explicitOpacity: 0.38, // opacidad de las conexiones propias de cada formación
  linkFade: 5, // rapidez con que aparecen/desaparecen las conexiones
  nodeSize: 26, // px CSS
  pulseAmount: 1, // 0 apaga el latido de los nodos
  rotationSpeed: 0.1, // rad/s de la fase de giro
  swayScale: 1, // multiplica el vaivén de cada formación; Infinity = giro continuo de 360°
  parallax: 0.1, // inclinación máxima en rad
  parallaxSmoothing: 2.5,
  hoverRadius: 70, // px
  cursorRadius: 5.5, // unidades: alcance con que el cursor desplaza nodos
  cursorLinkRadius: 7, // unidades: alcance de las conexiones del cursor
  cursorPush: 1.1,
  dataPulseInterval: [1.5, 3.5], // s entre pulsos de datos
  dataPulseSpeed: 6, // unidades/s
  maxDataPulses: 3, // pulsos simultáneos en reposo
  maxBurstPulses: 10, // pulsos extra que puede lanzar burst()
  designAspect: 16 / 9,
  colors: { node: '#f5a35a', link: '#6f82ff', pulse: '#f3f6ff', highlight: '#ffe6c7' },
  reducedMotion: false,
};

const MAX_GROUPS = 8;
const TRANSITION = 1.7; // s (cada nodo se mueve ~1.2 s dentro de esta ventana)
const STAGGER = 0.3;
const POSE_KEYS = ['rotX', 'sway', 'camZ', 'advance', 'wander'];

const TRAIL = [
  { gap: 0, alpha: 1, size: 0.6 },
  { gap: 0.45, alpha: 0.55, size: 0.48 },
  { gap: 0.9, alpha: 0.3, size: 0.38 },
  { gap: 1.35, alpha: 0.15, size: 0.3 },
];

const POINTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aScale;
  attribute float aPhase;
  attribute float aHighlight;
  attribute float aAlpha;
  uniform float uTime;
  uniform float uPulse;
  uniform float uFade;
  uniform float uPixelRatio;
  uniform float uCamDist;
  uniform vec2 uDepth;
  varying float vAlpha;
  varying float vHighlight;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float s = sin(uTime * 1.4 + aPhase);
    float att = clamp(uCamDist / -mv.z, 0.55, 1.7);
    gl_PointSize = aSize * aScale * (1.0 + uPulse * 0.22 * s) * (1.0 + aHighlight * 0.9) * att * uPixelRatio;
    float depth = clamp((uDepth.y + mv.z) / (uDepth.y - uDepth.x), 0.0, 1.0);
    vAlpha = aAlpha * uFade * mix(0.3, 1.0, depth) * (1.0 + uPulse * 0.3 * s);
    vHighlight = aHighlight;
    gl_Position = projectionMatrix * mv;
  }
`;

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHighlightColor;
  varying float vAlpha;
  varying float vHighlight;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.42, 0.0, d);
    float halo = pow(1.0 - d, 2.4);
    float a = clamp((halo * 0.5 + core) * vAlpha, 0.0, 1.0);
    vec3 col = mix(uColor, uHighlightColor, clamp(vHighlight, 0.0, 1.0) * 0.85 + core * 0.3);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

const LINES_VERT = /* glsl */ `
  attribute float aAlpha;
  uniform float uFade;
  uniform vec2 uDepth;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = clamp((uDepth.y + mv.z) / (uDepth.y - uDepth.x), 0.0, 1.0);
    vAlpha = aAlpha * uFade * mix(0.3, 1.0, depth);
    gl_Position = projectionMatrix * mv;
  }
`;

const LINES_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha);
    #include <colorspace_fragment>
  }
`;

const rgbUniform = (css) => {
  const c = new Color(css);
  return new Vector3(c.r, c.g, c.b);
};

const rand = (min, max) => min + Math.random() * (max - min);
const smoothstep = (a, b, x) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class NodeNetwork {
  constructor(scene, camera, options = {}) {
    this.scene = scene;
    this.camera = camera;
    const o = (this.options = {
      ...DEFAULTS,
      ...options,
      bounds: { ...DEFAULTS.bounds, ...options.bounds },
      colors: { ...DEFAULTS.colors, ...options.colors },
    });

    const N = (this.max = o.nodeCount);
    const K = (this.k = Math.max(1, o.maxLinksPerNode | 0));
    this.count = Math.min(N, o.initialCount ?? N);
    this.animate = !o.reducedMotion;
    this.time = 0;
    this.phase = 0;
    this.intro = this.animate ? 0 : 1;
    this.tiltX = 0;
    this.tiltY = 0;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    this.scroll = 0;
    this.scrollS = 0;
    this.focusGroup = -1;
    this.blend = 1;
    this.gate = 1;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.pointer = { x: 0, y: 0, active: false };
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.spawnTimer = rand(...o.dataPulseInterval);
    this.dirty = true;

    this.free = new Float32Array(N * 3);
    this.freeVel = new Float32Array(N * 3);
    this.speeds = new Float32Array(N);
    this.anchor = new Float32Array(N * 3);
    this.from = new Float32Array(N * 3);
    this.delay = Float32Array.from({ length: N }, Math.random);
    this.wanderPhase = Float32Array.from({ length: N * 3 }, () => rand(0, Math.PI * 2));
    this.wanderFreq = Float32Array.from({ length: N * 3 }, () => rand(0.2, 0.55));
    this.push = new Float32Array(N * 3);
    this.hover = new Float32Array(N);
    this.flash = new Float32Array(N);
    this.groupFocus = new Float32Array(MAX_GROUPS);
    this.presence = new Float32Array(N * N);
    this.target = new Uint8Array(N * N);
    this.kind = new Uint8Array(N * N);
    this.nbrIdx = new Int16Array(N * K);
    this.nbrD2 = new Float32Array(N * K);
    this.curIdx = new Int16Array(3);
    this.curD2 = new Float32Array(3);

    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      this.free[i3] = rand(-0.5, 0.5) * o.bounds.x;
      this.free[i3 + 1] = rand(-0.5, 0.5) * o.bounds.y;
      this.free[i3 + 2] = rand(-0.5, 0.5) * o.bounds.z;
      const theta = Math.random() * Math.PI * 2;
      const z = rand(-1, 1);
      const r = Math.sqrt(1 - z * z);
      this.speeds[i] = o.speed * rand(0.5, 1.5);
      this.freeVel[i3] = Math.cos(theta) * r * this.speeds[i];
      this.freeVel[i3 + 1] = Math.sin(theta) * r * this.speeds[i];
      this.freeVel[i3 + 2] = z * this.speeds[i];
      size[i] = o.nodeSize * rand(0.7, 1.5);
      phase[i] = Math.random() * Math.PI * 2;
    }
    this.anchor.set(this.free);
    this.from.set(this.free);

    this.formationName = 'calma';
    this.formationData = {};
    this.f = buildFormation('calma', this.count, { bounds: o.bounds });
    this.top = this.f;
    this.pose = { ...this.f.pose };

    const shared = {
      uFade: { value: this.intro },
      uPixelRatio: { value: 1 },
      uCamDist: { value: camera.position.length() },
      uDepth: { value: new Vector2(1, 2) },
    };

    this.nodeMaterial = this._pointsMaterial({
      ...shared,
      uTime: { value: 0 },
      uPulse: { value: this.animate ? o.pulseAmount : 0 },
      uColor: { value: rgbUniform(o.colors.node) },
      uHighlightColor: { value: rgbUniform(o.colors.highlight) },
    });

    this.pos = new Float32Array(N * 3);
    this.litAttr = new BufferAttribute(new Float32Array(N), 1).setUsage(DynamicDrawUsage);
    this.scaleAttr = new BufferAttribute(new Float32Array(N).fill(1), 1).setUsage(DynamicDrawUsage);
    this.highlightAttr = new BufferAttribute(new Float32Array(N), 1).setUsage(DynamicDrawUsage);
    this.nodeGeometry = new BufferGeometry();
    this.nodeGeometry.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.nodeGeometry.setAttribute('aSize', new BufferAttribute(size, 1));
    this.nodeGeometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
    this.nodeGeometry.setAttribute('aScale', this.scaleAttr);
    this.nodeGeometry.setAttribute('aAlpha', this.litAttr);
    this.nodeGeometry.setAttribute('aHighlight', this.highlightAttr);
    this.nodeGeometry.setDrawRange(0, this.count);
    this.points = new Points(this.nodeGeometry, this.nodeMaterial);

    this.maxSegments = Math.ceil(N * (K + 1) * 1.5) + 4;
    this.linkGeometry = new BufferGeometry();
    this.linkPosAttr = new BufferAttribute(new Float32Array(this.maxSegments * 6), 3).setUsage(DynamicDrawUsage);
    this.linkAlphaAttr = new BufferAttribute(new Float32Array(this.maxSegments * 2), 1).setUsage(DynamicDrawUsage);
    this.linkGeometry.setAttribute('position', this.linkPosAttr);
    this.linkGeometry.setAttribute('aAlpha', this.linkAlphaAttr);
    this.linkGeometry.setDrawRange(0, 0);
    this.linkMaterial = new ShaderMaterial({
      uniforms: { uFade: shared.uFade, uDepth: shared.uDepth, uColor: { value: rgbUniform(o.colors.link) } },
      vertexShader: LINES_VERT,
      fragmentShader: LINES_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
    this.links = new LineSegments(this.linkGeometry, this.linkMaterial);

    const P = (this.maxPulses = o.maxDataPulses + o.maxBurstPulses);
    const T = TRAIL.length;
    this.pulseA = new Int16Array(P);
    this.pulseB = new Int16Array(P);
    this.pulseT = new Float32Array(P).fill(-1);
    this.pulseSpeed = new Float32Array(P);
    const pulseSize = new Float32Array(P * T);
    for (let p = 0; p < P; p++) for (let s = 0; s < T; s++) pulseSize[p * T + s] = o.nodeSize * TRAIL[s].size;
    this.pulseGeometry = new BufferGeometry();
    this.pulsePosAttr = new BufferAttribute(new Float32Array(P * T * 3), 3).setUsage(DynamicDrawUsage);
    this.pulseAlphaAttr = new BufferAttribute(new Float32Array(P * T), 1).setUsage(DynamicDrawUsage);
    this.pulseGeometry.setAttribute('position', this.pulsePosAttr);
    this.pulseGeometry.setAttribute('aAlpha', this.pulseAlphaAttr);
    this.pulseGeometry.setAttribute('aSize', new BufferAttribute(pulseSize, 1));
    this.pulseGeometry.setAttribute('aScale', new BufferAttribute(new Float32Array(P * T).fill(1), 1));
    this.pulseGeometry.setAttribute('aPhase', new BufferAttribute(new Float32Array(P * T), 1));
    this.pulseGeometry.setAttribute('aHighlight', new BufferAttribute(new Float32Array(P * T), 1));
    this.pulseMaterial = this._pointsMaterial({
      ...shared,
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColor: { value: rgbUniform(o.colors.pulse) },
      uHighlightColor: { value: rgbUniform(o.colors.pulse) },
    });
    this.pulsePoints = new Points(this.pulseGeometry, this.pulseMaterial);

    this.uniforms = shared;
    this.group = new Group();
    for (const object of [this.links, this.points, this.pulsePoints]) {
      object.frustumCulled = false;
      this.group.add(object);
    }
    scene.add(this.group);

    this.tmp = new Vector3();
    this.cur = new Vector3();
    this.onPointerMove = this._onPointerMove.bind(this);
    this.onPointerLeave = () => (this.pointer.active = false);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', this.onPointerLeave);

    this.resize();
  }

  _pointsMaterial(uniforms) {
    return new ShaderMaterial({
      uniforms,
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
    });
  }

  _onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.active = true;
  }

  setFormation(name, data = {}, { instant = !this.animate } = {}) {
    this.formationName = name;
    this.formationData = data;
    this.from.set(this.anchor);
    this.f = buildFormation(name, this.count, { bounds: this.options.bounds, ...data });
    this.blend = instant ? 1 : 0;
    if (instant) {
      this.top = this.f;
      this.pulseT.fill(-1);
      for (const key of POSE_KEYS) this.pose[key] = this.f.pose[key];
    }
    this.dirty = true;
  }

  setNodeCount(count) {
    const n = MathUtils.clamp(Math.round(count), 20, this.max);
    if (n === this.count) return;
    this.count = n;
    this.nodeGeometry.setDrawRange(0, n);
    this.setFormation(this.formationName, this.formationData);
  }

  setScroll(progress) {
    this.scroll = MathUtils.clamp(progress, 0, 1);
  }

  setFocus(group) {
    this.focusGroup = group;
  }

  burst(count = 6) {
    if (!this.animate) return;
    this.burstLeft = Math.min(this.burstLeft + count, this.options.maxBurstPulses);
  }

  resize({ width = window.innerWidth, height = window.innerHeight, pixelRatio } = {}) {
    const o = this.options;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? Math.min(window.devicePixelRatio || 1, 2);

    const aspect = this.camera.aspect || width / height;
    this.group.scale.x = MathUtils.clamp(aspect / o.designAspect, 0.45, 1.35);
    this.uniforms.uPixelRatio.value = this.pixelRatio;
    this._updateCameraUniforms();
    this.dirty = true;
  }

  _updateCameraUniforms() {
    const { bounds } = this.options;
    const camDist = this.camera.position.length();
    const radius = 0.5 * Math.hypot(bounds.x, bounds.z);
    this.uniforms.uCamDist.value = camDist;
    this.uniforms.uDepth.value.set(camDist - radius, camDist + radius);
    this.camera.updateMatrixWorld();
  }

  setReducedMotion(reduced) {
    this.animate = !reduced;
    this.nodeMaterial.uniforms.uPulse.value = this.animate ? this.options.pulseAmount : 0;
    this.nodeMaterial.uniforms.uTime.value = 0;
    this.uniforms.uFade.value = this.intro = 1;
    this.tiltX = this.tiltY = this.targetTiltX = this.targetTiltY = 0;
    this.hover.fill(0);
    this.flash.fill(0);
    this.push.fill(0);
    this.burstLeft = 0;
    this.pulseT.fill(-1);
    this.pulseAlphaAttr.array.fill(0);
    this.pulseAlphaAttr.needsUpdate = true;
    this.dirty = true;
  }

  update(delta) {
    if (!this.animate) {
      if (this.dirty) {
        this.dirty = false;
        this._snap();
      }
      return;
    }
    const dt = Math.min(delta, 0.05);
    this.time += dt;
    if (this.intro < 1) this.uniforms.uFade.value = this.intro = Math.min(1, this.intro + dt / 1.6);
    this.nodeMaterial.uniforms.uTime.value = this.time;
    this.scrollS += (this.scroll - this.scrollS) * (1 - Math.exp(-4 * dt));

    this._simulateFree(dt);
    this._advance(dt);
    this._pose(dt);
    this._updateCursor(dt);
    this._compose();
    this._updateHover(dt);
    this._updateAttributes(dt, false);
    this._updateLinks(dt, false);
    this._updatePulses(dt);
  }

  _snap() {
    this.blend = 1;
    this.gate = 1;
    this.top = this.f;
    this.scrollS = this.scroll;
    for (const key of POSE_KEYS) this.pose[key] = this.f.pose[key];
    this.pulseT.fill(-1);
    this._pose(0);
    this._compose();
    this._updateAttributes(0, true);
    this._updateLinks(0, true);
    this.pulseAlphaAttr.array.fill(0);
    this.pulseAlphaAttr.needsUpdate = true;
  }

  _simulateFree(dt) {
    const { free, freeVel: vel, speeds } = this;
    const { x, y, z } = this.options.bounds;
    const half = [x / 2, y / 2, z / 2];
    const margin = 3;
    const steer = 2.5;
    const wander = 1.2 * dt;

    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3;
      let v0 = vel[i3];
      let v1 = vel[i3 + 1];
      let v2 = vel[i3 + 2];
      const p0 = free[i3];
      const p1 = free[i3 + 1];
      const p2 = free[i3 + 2];

      v0 += rand(-0.5, 0.5) * wander;
      v1 += rand(-0.5, 0.5) * wander;
      v2 += rand(-0.5, 0.5) * wander;
      if (p0 > half[0] - margin) v0 -= ((p0 - half[0] + margin) / margin) * steer * dt;
      else if (p0 < margin - half[0]) v0 += ((margin - half[0] - p0) / margin) * steer * dt;
      if (p1 > half[1] - margin) v1 -= ((p1 - half[1] + margin) / margin) * steer * dt;
      else if (p1 < margin - half[1]) v1 += ((margin - half[1] - p1) / margin) * steer * dt;
      if (p2 > half[2] - margin) v2 -= ((p2 - half[2] + margin) / margin) * steer * dt;
      else if (p2 < margin - half[2]) v2 += ((margin - half[2] - p2) / margin) * steer * dt;

      const s = speeds[i] / (Math.hypot(v0, v1, v2) || 1);
      v0 *= s;
      v1 *= s;
      v2 *= s;
      let q0 = p0 + v0 * dt;
      let q1 = p1 + v1 * dt;
      let q2 = p2 + v2 * dt;

      if (q0 > half[0]) (q0 = half[0]), (v0 = -Math.abs(v0));
      else if (q0 < -half[0]) (q0 = -half[0]), (v0 = Math.abs(v0));
      if (q1 > half[1]) (q1 = half[1]), (v1 = -Math.abs(v1));
      else if (q1 < -half[1]) (q1 = -half[1]), (v1 = Math.abs(v1));
      if (q2 > half[2]) (q2 = half[2]), (v2 = -Math.abs(v2));
      else if (q2 < -half[2]) (q2 = -half[2]), (v2 = Math.abs(v2));

      vel[i3] = v0;
      vel[i3 + 1] = v1;
      vel[i3 + 2] = v2;
      free[i3] = q0;
      free[i3 + 1] = q1;
      free[i3 + 2] = q2;
    }
  }

  _advance(dt) {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / TRANSITION);
      if (this.top !== this.f && this.blend >= 0.3) {
        this.top = this.f;
        this.pulseT.fill(-1);
      }
    }
    const b = this.blend;
    this.gate = b >= 1 ? 1 : b < 0.3 ? 1 - b / 0.3 : b < 0.65 ? 0 : (b - 0.65) / 0.35;
  }

  _pose(dt) {
    const o = this.options;
    const target = this.f.pose;
    const kp = 1 - Math.exp(-2.2 * dt);
    for (const key of POSE_KEYS) this.pose[key] += (target[key] - this.pose[key]) * kp;

    this.phase += o.rotationSpeed * dt;
    const sway = this.pose.sway * o.swayScale;
    const yaw = Number.isFinite(sway) ? sway * Math.sin(this.phase) : this.phase;

    if (this.animate && this.pointer.active) {
      this.targetTiltY = (this.pointer.x / this.width - 0.5) * 2 * o.parallax;
      this.targetTiltX = (this.pointer.y / this.height - 0.5) * 2 * o.parallax;
    } else {
      this.targetTiltX = this.targetTiltY = 0;
    }
    const k = 1 - Math.exp(-o.parallaxSmoothing * dt);
    this.tiltX += (this.targetTiltX - this.tiltX) * k;
    this.tiltY += (this.targetTiltY - this.tiltY) * k;

    this.camera.position.z = this.pose.camZ - this.pose.advance * this.scrollS;
    this._updateCameraUniforms();
    this.group.rotation.set(this.pose.rotX + this.tiltX, yaw + this.tiltY, 0);
    this.group.updateMatrixWorld();
  }

  _updateCursor(dt) {
    const { push, anchor } = this;
    const on = this.animate && this.pointer.active;
    const R = this.options.cursorRadius;
    const R2 = R * R;
    const k = 1 - Math.exp(-7 * dt);

    if (on) {
      const th = Math.tan((this.camera.fov * Math.PI) / 360);
      const z0 = this.camera.position.z;
      const nx = (this.pointer.x / this.width) * 2 - 1;
      const ny = 1 - (this.pointer.y / this.height) * 2;
      this.cur.set(nx * th * this.camera.aspect * z0, ny * th * z0, 0);
      this.group.worldToLocal(this.cur);
    }

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      let tx = 0;
      let ty = 0;
      let tz = 0;
      if (on) {
        const dx = anchor[i3] - this.cur.x;
        const dy = anchor[i3 + 1] - this.cur.y;
        const dz = anchor[i3 + 2] - this.cur.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const s = ((1 - d / R) ** 2 * this.options.cursorPush) / d;
          tx = dx * s;
          ty = dy * s;
          tz = dz * s;
        }
      }
      push[i3] += (tx - push[i3]) * k;
      push[i3 + 1] += (ty - push[i3 + 1]) * k;
      push[i3 + 2] += (tz - push[i3 + 2]) * k;
    }
  }

  _compose() {
    const { pos, anchor, from, delay, free, wanderPhase: wp, wanderFreq: wf, push, f } = this;
    const n = this.count;
    const live = f.live;
    const tg = f.targets;
    const blend = this.blend;
    const amp = this.pose.wander;
    const t = this.time;

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const e = blend < 1 ? easeInOut(MathUtils.clamp((blend - delay[i] * STAGGER) / (1 - STAGGER), 0, 1)) : 1;
      for (let a = 0; a < 3; a++) {
        const j = i3 + a;
        const to = live ? free[j] : tg[j];
        const an = from[j] + (to - from[j]) * e;
        anchor[j] = an;
        pos[j] = an + amp * Math.sin(t * wf[j] + wp[j]) + push[j];
      }
    }
    this.nodeGeometry.attributes.position.needsUpdate = true;
  }

  _updateHover(dt) {
    const { pos, hover, flash, tmp } = this;
    let best = -1;

    if (this.animate && this.pointer.active) {
      let bestD2 = this.options.hoverRadius ** 2;
      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        tmp.set(pos[i3], pos[i3 + 1], pos[i3 + 2]).applyMatrix4(this.group.matrixWorld).project(this.camera);
        if (tmp.z > 1) continue;
        const dx = (tmp.x * 0.5 + 0.5) * this.width - this.pointer.x;
        const dy = (0.5 - tmp.y * 0.5) * this.height - this.pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
    }

    const kHover = 1 - Math.exp(-9 * dt);
    const kFlash = Math.exp(-2.5 * dt);
    for (let i = 0; i < this.count; i++) {
      hover[i] += ((i === best ? 1 : 0) - hover[i]) * kHover;
      flash[i] *= kFlash;
    }
  }

  _updateAttributes(dt, instant) {
    const n = this.count;
    const f = this.f;
    const kLit = instant ? 1 : 1 - Math.exp(-5 * dt);
    const kScale = instant ? 1 : 1 - Math.exp(-4 * dt);
    const kFocus = instant ? 1 : 1 - Math.exp(-7 * dt);
    const gain = MathUtils.clamp(f.revealBase + f.revealScroll * this.scrollS, 0, 1);
    const focus = this.focusGroup;
    const lit = this.litAttr.array;
    const scale = this.scaleAttr.array;
    const highlight = this.highlightAttr.array;

    for (let g = 0; g < MAX_GROUPS; g++) {
      const target = Math.max(g === focus ? 1 : 0, f.focusDefault[g]);
      this.groupFocus[g] += (target - this.groupFocus[g]) * kFocus;
    }

    for (let i = 0; i < n; i++) {
      const g = f.group[i];
      let target = f.dim[i] * smoothstep(f.reveal[i] - 0.08, f.reveal[i], gain);
      if (focus >= 0 && f.hasGroups && g !== focus) target *= 0.5;
      lit[i] += (target - lit[i]) * kLit;
      scale[i] += (f.scale[i] - scale[i]) * kScale;
      let h = Math.max(this.hover[i], this.flash[i] * 0.7);
      if (g >= 0) h = Math.max(h, this.groupFocus[g] * 0.5);
      highlight[i] = h;
    }
    this.litAttr.needsUpdate = true;
    this.scaleAttr.needsUpdate = true;
    this.highlightAttr.needsUpdate = true;
  }

  _updateLinks(dt, instant) {
    const { pos, presence, target, kind, nbrIdx, nbrD2, k: K, max: N, count: n, top } = this;
    const { connectionDistance: maxD, linkOpacity, explicitOpacity, linkFade } = this.options;
    const maxD2 = maxD * maxD;
    const mask = top.mask;
    const hl = this.highlightAttr.array;
    const lit = this.litAttr.array;

    nbrIdx.fill(-1);
    nbrD2.fill(Infinity);
    target.fill(0);

    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      const i3 = i * 3;
      for (let j = i + 1; j < n; j++) {
        if (!mask[j]) continue;
        const j3 = j * 3;
        const dx = pos[i3] - pos[j3];
        const dy = pos[i3 + 1] - pos[j3 + 1];
        const dz = pos[i3 + 2] - pos[j3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= maxD2) continue;
        this._insertNeighbor(i, j, d2);
        this._insertNeighbor(j, i, d2);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < K; s++) {
        const j = nbrIdx[i * K + s];
        if (j >= 0) target[i < j ? i * N + j : j * N + i] = 1;
      }
    }
    const edges = top.edges;
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e];
      const b = edges[e + 1];
      if (a < n && b < n) target[a < b ? a * N + b : b * N + a] = 2;
    }

    const fade = instant ? 1 : 1 - Math.exp(-linkFade * dt);
    const gate = this.gate;
    const linkPos = this.linkPosAttr.array;
    const linkAlpha = this.linkAlphaAttr.array;
    const cap = this.maxSegments - 3;
    let seg = 0;

    for (let i = 0; i < n && seg < cap; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < n; j++) {
        const idx = i * N + j;
        const t = target[idx];
        let p = presence[idx];
        if (t === 0 && p === 0) continue;
        p += ((t ? 1 : 0) - p) * fade;
        if (t === 0 && p < 0.004) p = 0;
        presence[idx] = p;
        if (t) kind[idx] = t;
        if (p === 0) continue;

        const j3 = j * 3;
        const dx = pos[i3] - pos[j3];
        const dy = pos[i3 + 1] - pos[j3 + 1];
        const dz = pos[i3 + 2] - pos[j3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;

        let alpha;
        if (kind[idx] === 2) {
          alpha = p * explicitOpacity;
        } else {
          if (d2 >= maxD2) continue;
          const proximity = 1 - Math.sqrt(d2) / maxD;
          alpha = p * proximity * proximity * linkOpacity;
        }
        alpha = Math.min(1, alpha * gate * Math.min(lit[i], lit[j]) * (1 + 2.2 * Math.max(hl[i], hl[j])));
        if (alpha < 0.003) continue;

        const s6 = seg * 6;
        linkPos[s6] = pos[i3];
        linkPos[s6 + 1] = pos[i3 + 1];
        linkPos[s6 + 2] = pos[i3 + 2];
        linkPos[s6 + 3] = pos[j3];
        linkPos[s6 + 4] = pos[j3 + 1];
        linkPos[s6 + 5] = pos[j3 + 2];
        linkAlpha[seg * 2] = alpha;
        linkAlpha[seg * 2 + 1] = alpha;
        if (++seg >= cap) break;
      }
    }

    seg = this._cursorLinks(seg);
    this.linkGeometry.setDrawRange(0, seg * 2);
    this.linkPosAttr.needsUpdate = true;
    this.linkAlphaAttr.needsUpdate = true;
  }

  _cursorLinks(seg) {
    if (!this.animate || !this.pointer.active) return seg;
    const { pos, cur, curIdx, curD2 } = this;
    const R = this.options.cursorLinkRadius;
    const R2 = R * R;
    const lit = this.litAttr.array;
    const linkPos = this.linkPosAttr.array;
    const linkAlpha = this.linkAlphaAttr.array;
    curIdx.fill(-1);
    curD2.fill(Infinity);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const dx = pos[i3] - cur.x;
      const dy = pos[i3 + 1] - cur.y;
      const dz = pos[i3 + 2] - cur.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R2 || d2 >= curD2[2]) continue;
      let s = 2;
      while (s > 0 && curD2[s - 1] > d2) {
        curD2[s] = curD2[s - 1];
        curIdx[s] = curIdx[s - 1];
        s--;
      }
      curD2[s] = d2;
      curIdx[s] = i;
    }

    for (let s = 0; s < 3; s++) {
      const i = curIdx[s];
      if (i < 0) continue;
      const i3 = i * 3;
      const proximity = 1 - Math.sqrt(curD2[s]) / R;
      const s6 = seg * 6;
      linkPos[s6] = cur.x;
      linkPos[s6 + 1] = cur.y;
      linkPos[s6 + 2] = cur.z;
      linkPos[s6 + 3] = pos[i3];
      linkPos[s6 + 4] = pos[i3 + 1];
      linkPos[s6 + 5] = pos[i3 + 2];
      const alpha = Math.min(1, 0.75 * proximity * proximity * lit[i]);
      linkAlpha[seg * 2] = alpha;
      linkAlpha[seg * 2 + 1] = alpha;
      seg++;
    }
    return seg;
  }

  _insertNeighbor(i, j, d2) {
    const { nbrIdx, nbrD2, k: K } = this;
    const base = i * K;
    if (d2 >= nbrD2[base + K - 1]) return;
    let p = K - 1;
    while (p > 0 && nbrD2[base + p - 1] > d2) {
      nbrD2[base + p] = nbrD2[base + p - 1];
      nbrIdx[base + p] = nbrIdx[base + p - 1];
      p--;
    }
    nbrD2[base + p] = d2;
    nbrIdx[base + p] = j;
  }

  _spawnPulse() {
    let slot = -1;
    for (let p = 0; p < this.maxPulses; p++) {
      if (this.pulseT[p] < 0) {
        slot = p;
        break;
      }
    }
    if (slot < 0) return false;

    const { presence, max: N, count: n, pos } = this;
    for (let attempt = 0; attempt < 8; attempt++) {
      const from = (Math.random() * n) | 0;
      let active = 0;
      for (let j = 0; j < n; j++) {
        if (j !== from && presence[from < j ? from * N + j : j * N + from] > 0.6) active++;
      }
      if (!active) continue;

      let pick = (Math.random() * active) | 0;
      for (let j = 0; j < n; j++) {
        if (j === from || presence[from < j ? from * N + j : j * N + from] <= 0.6) continue;
        if (pick-- > 0) continue;
        let a = from;
        let b = j;
        if (this.f.converge) {
          const ra = Math.hypot(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]);
          const rb = Math.hypot(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
          if (rb > ra) [a, b] = [b, a];
        }
        this.pulseA[slot] = a;
        this.pulseB[slot] = b;
        this.pulseT[slot] = 0;
        this.pulseSpeed[slot] = this.options.dataPulseSpeed * rand(0.8, 1.25);
        return true;
      }
    }
    return false;
  }

  _updatePulses(dt) {
    const { pos, pulseA, pulseB, pulseT, pulseSpeed, flash } = this;
    const outPos = this.pulsePosAttr.array;
    const outAlpha = this.pulseAlphaAttr.array;
    const [minGap, maxGap] = this.options.dataPulseInterval;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      let running = 0;
      for (let p = 0; p < this.maxPulses; p++) if (pulseT[p] >= 0) running++;
      this.spawnTimer = running < this.options.maxDataPulses && this._spawnPulse() ? rand(minGap, maxGap) : 0.3;
    }
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this._spawnPulse();
        this.burstLeft--;
        this.burstTimer = 0.07;
      }
    }

    for (let p = 0; p < this.maxPulses; p++) {
      const base = p * TRAIL.length;
      if (pulseT[p] < 0) {
        for (let s = 0; s < TRAIL.length; s++) outAlpha[base + s] = 0;
        continue;
      }
      const a3 = pulseA[p] * 3;
      const b3 = pulseB[p] * 3;
      const dx = pos[b3] - pos[a3];
      const dy = pos[b3 + 1] - pos[a3 + 1];
      const dz = pos[b3 + 2] - pos[a3 + 2];
      const dist = Math.max(Math.hypot(dx, dy, dz), 0.1);

      pulseT[p] += (pulseSpeed[p] * dt) / dist;
      if (pulseT[p] >= 1) {
        flash[pulseB[p]] = 1;
        pulseT[p] = -1;
        for (let s = 0; s < TRAIL.length; s++) outAlpha[base + s] = 0;
        continue;
      }

      for (let s = 0; s < TRAIL.length; s++) {
        const t = pulseT[p] - TRAIL[s].gap / dist;
        const o3 = (base + s) * 3;
        if (t < 0) {
          outAlpha[base + s] = 0;
          continue;
        }
        outPos[o3] = pos[a3] + dx * t;
        outPos[o3 + 1] = pos[a3 + 1] + dy * t;
        outPos[o3 + 2] = pos[a3 + 2] + dz * t;
        outAlpha[base + s] = TRAIL[s].alpha * Math.min(1, t * 8) * Math.min(1, (1 - t) * 8);
      }
    }
    this.pulsePosAttr.needsUpdate = true;
    this.pulseAlphaAttr.needsUpdate = true;
  }

  dispose() {
    window.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('mouseleave', this.onPointerLeave);
    this.scene.remove(this.group);
    this.nodeGeometry.dispose();
    this.linkGeometry.dispose();
    this.pulseGeometry.dispose();
    this.nodeMaterial.dispose();
    this.linkMaterial.dispose();
    this.pulseMaterial.dispose();
  }
}
