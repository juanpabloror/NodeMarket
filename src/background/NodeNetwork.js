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
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

const DEFAULTS = {
  nodeCount: 120,
  mobileNodeCount: 60,
  mobileBreakpoint: 768, // px de ancho de ventana
  bounds: { x: 36, y: 20, z: 14 }, // volumen completo, en unidades del mundo
  speed: 0.45, // unidades/s
  connectionDistance: 6,
  maxLinksPerNode: 2, // cada nodo enlaza con sus N vecinos más cercanos
  linkOpacity: 0.5,
  linkFade: 5, // rapidez con que aparecen/desaparecen las conexiones
  nodeSize: 17, // px CSS
  pulseAmount: 1, // 0 apaga el latido de los nodos
  rotationSpeed: 0.1, // rad/s de la fase de giro
  rotationAmplitude: 0.4, // rad; Infinity = giro continuo de 360°
  parallax: 0.1, // inclinación máxima en rad
  parallaxSmoothing: 2.5,
  hoverRadius: 70, // px
  dataPulseInterval: [1.5, 3.5], // s entre pulsos de datos
  dataPulseSpeed: 6, // unidades/s
  maxDataPulses: 3,
  designAspect: 16 / 9,
  maxPixelRatio: 2,
  colors: { node: '#f5a35a', link: '#6f82ff', pulse: '#f3f6ff', highlight: '#ffe6c7' },
  reducedMotion: false,
};

const TRAIL = [
  { gap: 0, alpha: 1, size: 0.6 },
  { gap: 0.45, alpha: 0.55, size: 0.48 },
  { gap: 0.9, alpha: 0.3, size: 0.38 },
  { gap: 1.35, alpha: 0.15, size: 0.3 },
];

const POINTS_VERT = /* glsl */ `
  attribute float aSize;
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
    gl_PointSize = aSize * (1.0 + uPulse * 0.22 * s) * (1.0 + aHighlight * 0.9) * att * uPixelRatio;
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
  }
`;

const rgbUniform = (css) => {
  const rgb = new Color(css).getRGB({ r: 0, g: 0, b: 0 }, SRGBColorSpace);
  return new Vector3(rgb.r, rgb.g, rgb.b);
};

const rand = (min, max) => min + Math.random() * (max - min);

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
    this.count = N;
    this.animate = !o.reducedMotion;
    this.time = 0;
    this.phase = 0;
    this.intro = this.animate ? 0 : 1;
    this.tiltX = 0;
    this.tiltY = 0;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    this.pointer = { x: 0, y: 0, active: false };
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.spawnTimer = rand(...o.dataPulseInterval);
    this.dirty = true;

    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.speeds = new Float32Array(N);
    this.hover = new Float32Array(N);
    this.flash = new Float32Array(N);
    this.presence = new Float32Array(N * N);
    this.target = new Uint8Array(N * N);
    this.nbrIdx = new Int16Array(N * K);
    this.nbrD2 = new Float32Array(N * K);

    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      this.pos[i3] = rand(-0.5, 0.5) * o.bounds.x;
      this.pos[i3 + 1] = rand(-0.5, 0.5) * o.bounds.y;
      this.pos[i3 + 2] = rand(-0.5, 0.5) * o.bounds.z;
      const theta = Math.random() * Math.PI * 2;
      const z = rand(-1, 1);
      const r = Math.sqrt(1 - z * z);
      this.speeds[i] = o.speed * rand(0.5, 1.5);
      this.vel[i3] = Math.cos(theta) * r * this.speeds[i];
      this.vel[i3 + 1] = Math.sin(theta) * r * this.speeds[i];
      this.vel[i3 + 2] = z * this.speeds[i];
      size[i] = o.nodeSize * rand(0.7, 1.5);
      phase[i] = Math.random() * Math.PI * 2;
    }

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

    this.nodeGeometry = new BufferGeometry();
    this.nodeGeometry.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.nodeGeometry.setAttribute('aSize', new BufferAttribute(size, 1));
    this.nodeGeometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
    this.nodeGeometry.setAttribute('aAlpha', new BufferAttribute(new Float32Array(N).fill(1), 1));
    this.highlightAttr = new BufferAttribute(new Float32Array(N), 1).setUsage(DynamicDrawUsage);
    this.nodeGeometry.setAttribute('aHighlight', this.highlightAttr);
    this.points = new Points(this.nodeGeometry, this.nodeMaterial);

    this.maxSegments = Math.ceil(N * K * 1.5);
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

    const P = (this.maxPulses = o.maxDataPulses);
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

  resize({ width = window.innerWidth, height = window.innerHeight, pixelRatio } = {}) {
    const o = this.options;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio ?? Math.min(window.devicePixelRatio || 1, o.maxPixelRatio);

    const aspect = this.camera.aspect || width / height;
    this.group.scale.x = MathUtils.clamp(aspect / o.designAspect, 0.45, 1.35);

    this.count = window.innerWidth < o.mobileBreakpoint ? Math.min(o.mobileNodeCount, this.max) : this.max;
    this.nodeGeometry.setDrawRange(0, this.count);

    const camDist = this.camera.position.length();
    const radius = 0.5 * Math.hypot(o.bounds.x, o.bounds.z);
    this.uniforms.uPixelRatio.value = this.pixelRatio;
    this.uniforms.uCamDist.value = camDist;
    this.uniforms.uDepth.value.set(camDist - radius, camDist + radius);

    this.camera.updateMatrixWorld();
    this.dirty = true;
  }

  setReducedMotion(reduced) {
    this.animate = !reduced;
    this.nodeMaterial.uniforms.uPulse.value = this.animate ? this.options.pulseAmount : 0;
    this.nodeMaterial.uniforms.uTime.value = 0;
    this.uniforms.uFade.value = this.intro = 1;
    this.tiltX = this.tiltY = this.targetTiltX = this.targetTiltY = 0;
    this.group.rotation.set(0, 0, 0);
    this.hover.fill(0);
    this.flash.fill(0);
    this.highlightAttr.array.fill(0);
    this.highlightAttr.needsUpdate = true;
    this.pulseT.fill(-1);
    this.pulseAlphaAttr.array.fill(0);
    this.pulseAlphaAttr.needsUpdate = true;
    this.dirty = true;
  }

  update(delta) {
    if (!this.animate) {
      if (this.dirty) {
        this.dirty = false;
        this.group.updateMatrixWorld();
        this._updateLinks(0, true);
      }
      return;
    }
    const dt = Math.min(delta, 0.05);
    this.time += dt;
    if (this.intro < 1) this.uniforms.uFade.value = this.intro = Math.min(1, this.intro + dt / 1.6);
    this.nodeMaterial.uniforms.uTime.value = this.time;

    this._move(dt);
    this._orient(dt);
    this._updateHover(dt);
    this._updateLinks(dt, false);
    this._updatePulses(dt);
  }

  _move(dt) {
    const { pos, vel, speeds } = this;
    const { x, y, z } = this.options.bounds;
    const half = [x / 2, y / 2, z / 2];
    const margin = 3;
    const steer = 2.5;
    const wander = 1.2 * dt;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      let vx = vel[i3] + rand(-0.5, 0.5) * wander;
      let vy = vel[i3 + 1] + rand(-0.5, 0.5) * wander;
      let vz = vel[i3 + 2] + rand(-0.5, 0.5) * wander;
      let px = pos[i3];
      let py = pos[i3 + 1];
      let pz = pos[i3 + 2];

      if (px > half[0] - margin) vx -= ((px - half[0] + margin) / margin) * steer * dt;
      else if (px < margin - half[0]) vx += ((margin - half[0] - px) / margin) * steer * dt;
      if (py > half[1] - margin) vy -= ((py - half[1] + margin) / margin) * steer * dt;
      else if (py < margin - half[1]) vy += ((margin - half[1] - py) / margin) * steer * dt;
      if (pz > half[2] - margin) vz -= ((pz - half[2] + margin) / margin) * steer * dt;
      else if (pz < margin - half[2]) vz += ((margin - half[2] - pz) / margin) * steer * dt;

      const s = speeds[i] / (Math.hypot(vx, vy, vz) || 1);
      vx *= s;
      vy *= s;
      vz *= s;
      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;

      if (px > half[0]) (px = half[0]), (vx = -Math.abs(vx));
      else if (px < -half[0]) (px = -half[0]), (vx = Math.abs(vx));
      if (py > half[1]) (py = half[1]), (vy = -Math.abs(vy));
      else if (py < -half[1]) (py = -half[1]), (vy = Math.abs(vy));
      if (pz > half[2]) (pz = half[2]), (vz = -Math.abs(vz));
      else if (pz < -half[2]) (pz = -half[2]), (vz = Math.abs(vz));

      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }
    this.nodeGeometry.attributes.position.needsUpdate = true;
  }

  _orient(dt) {
    const o = this.options;
    this.phase += o.rotationSpeed * dt;
    const yaw = Number.isFinite(o.rotationAmplitude) ? o.rotationAmplitude * Math.sin(this.phase) : this.phase;

    if (this.pointer.active) {
      this.targetTiltY = (this.pointer.x / this.width - 0.5) * 2 * o.parallax;
      this.targetTiltX = (this.pointer.y / this.height - 0.5) * 2 * o.parallax;
    } else {
      this.targetTiltX = this.targetTiltY = 0;
    }
    const k = 1 - Math.exp(-o.parallaxSmoothing * dt);
    this.tiltX += (this.targetTiltX - this.tiltX) * k;
    this.tiltY += (this.targetTiltY - this.tiltY) * k;

    this.group.rotation.set(this.tiltX, yaw + this.tiltY, 0);
    this.group.updateMatrixWorld();
  }

  _updateHover(dt) {
    const { pos, hover, flash, tmp } = this;
    const attr = this.highlightAttr.array;
    let best = -1;

    if (this.pointer.active) {
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
      attr[i] = Math.max(hover[i], flash[i] * 0.7);
    }
    this.highlightAttr.needsUpdate = true;
  }

  _updateLinks(dt, instant) {
    const { pos, presence, target, nbrIdx, nbrD2, k: K, max: N, count: n } = this;
    const { connectionDistance: maxD, linkOpacity, linkFade } = this.options;
    const maxD2 = maxD * maxD;
    const hl = this.highlightAttr.array;

    nbrIdx.fill(-1);
    nbrD2.fill(Infinity);
    target.fill(0);

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < n; j++) {
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

    const fade = instant ? 1 : 1 - Math.exp(-linkFade * dt);
    const linkPos = this.linkPosAttr.array;
    const linkAlpha = this.linkAlphaAttr.array;
    let seg = 0;

    for (let i = 0; i < n && seg < this.maxSegments; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < n; j++) {
        const idx = i * N + j;
        const t = target[idx];
        let p = presence[idx];
        if (t === 0 && p === 0) continue;
        p += (t - p) * fade;
        if (t === 0 && p < 0.004) p = 0;
        presence[idx] = p;
        if (p === 0) continue;

        const j3 = j * 3;
        const dx = pos[i3] - pos[j3];
        const dy = pos[i3 + 1] - pos[j3 + 1];
        const dz = pos[i3 + 2] - pos[j3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= maxD2) continue;

        const proximity = 1 - Math.sqrt(d2) / maxD;
        const alpha = Math.min(1, p * proximity * proximity * linkOpacity * (1 + 2.2 * Math.max(hl[i], hl[j])));
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
        if (++seg >= this.maxSegments) break;
      }
    }

    this.linkGeometry.setDrawRange(0, seg * 2);
    this.linkPosAttr.needsUpdate = true;
    this.linkAlphaAttr.needsUpdate = true;
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
    if (slot < 0) return true;

    const { presence, max: N, count: n } = this;
    const from = (Math.random() * n) | 0;
    let active = 0;
    for (let j = 0; j < n; j++) {
      if (j !== from && presence[from < j ? from * N + j : j * N + from] > 0.6) active++;
    }
    if (!active) return false;

    let pick = (Math.random() * active) | 0;
    for (let j = 0; j < n; j++) {
      if (j === from || presence[from < j ? from * N + j : j * N + from] <= 0.6) continue;
      if (pick-- === 0) {
        this.pulseA[slot] = from;
        this.pulseB[slot] = j;
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
    if (this.spawnTimer <= 0) this.spawnTimer = this._spawnPulse() ? rand(minGap, maxGap) : 0.3;

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
