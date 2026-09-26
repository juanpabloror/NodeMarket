import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { gsap } from '../gsap.js';

const DEVICES = ['desktop', 'tablet', 'mobile'];
const CHROME_RATIO = 0.05; // alto de la barra del navegador, relativo al alto de cada captura
const TARGET_SPAN = 1.9; // dimensión mayor a la que se normaliza cada dispositivo, para que todos se vean en un tamaño consistente
const DRAG_LIMIT = { x: 0.3, y: 0.55 };
const BODY_COLOR = 0x1a1e33;
const EDGE_COLOR = 0xf5a35a;
const EMBED_SRC = '/'; // la vitrina siempre incrusta el inicio, nunca /portafolio/, para no anidarse a sí misma
// Tamaño real (px CSS) que se le da al iframe por dispositivo, para que el sitio use sus propios breakpoints de verdad.
const IFRAME_SIZE = { desktop: [1440, 900], tablet: [820, 1180], mobile: [390, 844] };

// Reposo por dispositivo: la laptop se inclina hacia atrás para ver también el teclado; tablet/móvil quedan casi de frente.
const REST = {
  desktop: { x: 0.34, y: -0.26 },
  tablet: { x: 0.08, y: -0.24 },
  mobile: { x: 0.08, y: -0.24 },
};

// Compone la captura en una "ventana de navegador": barra superior con puntos + la captura debajo, sin distorsión.
function buildCardTexture(image) {
  const chromeHeight = Math.round(image.naturalHeight * CHROME_RATIO);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + chromeHeight;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#13172a';
  ctx.fillRect(0, 0, canvas.width, chromeHeight);
  const r = chromeHeight * 0.16;
  ['#f5a35a', '#8b9bff', '#3a4160'].forEach((color, i) => {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(chromeHeight * 0.7 + i * r * 3, chromeHeight / 2, r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.drawImage(image, 0, chromeHeight);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: canvas.width / canvas.height };
}

const waitLoaded = (img) =>
  img.complete && img.naturalWidth
    ? Promise.resolve()
    : new Promise((resolve) => img.addEventListener('load', resolve, { once: true }));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const bodyMaterial = () => new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.55, metalness: 0.2 });
const edgesOf = (mesh, opacity = 0.5) => {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity })
  );
  mesh.add(edges);
};

// Cámara frontal: un lente oscuro con un anillo ámbar, como un nodo más de la red.
function addCameraDot(parent, x, y, z, radius) {
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 1.8, 20),
    new THREE.MeshBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.55 })
  );
  ring.position.set(x, y, z);
  parent.add(ring);

  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshStandardMaterial({ color: 0x03040a, roughness: 0.25, metalness: 0.5 })
  );
  lens.position.set(x, y, z + 0.0008);
  parent.add(lens);
}

// Carcasa plana (tablet/celular): cuerpo redondeado + pantalla insertada con la captura + cámara frontal.
function buildSlabRig({ width, height, depth, bezel, texture }) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, Math.min(width, height) * 0.07), bodyMaterial());
  edgesOf(body);
  group.add(body);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(width - bezel * 2, height - bezel * 2),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  screen.position.z = depth / 2 + 0.002;
  group.add(screen);

  addCameraDot(group, 0, height / 2 - bezel / 2, depth / 2 + 0.003, Math.min(width, height) * 0.03);

  group.userData.screen = screen;
  return group;
}

const buildPhoneRig = (texture) => buildSlabRig({ width: 0.42, height: 0.87, depth: 0.045, bezel: 0.035, texture });
const buildTabletRig = (texture) => buildSlabRig({ width: 0.8, height: 1.08, depth: 0.045, bezel: 0.045, texture });

// Rejilla de teclas instanciada (un solo draw call) para el "deck" de la laptop.
function buildKeyboard(baseW, baseD) {
  const cols = 13;
  const rows = 4;
  const kbWidth = baseW * 0.78;
  const kbDepth = baseD * 0.34;
  const kbCenterZ = -baseD * 0.16;
  const gapX = kbWidth / cols;
  const gapZ = kbDepth / rows;
  const keyW = gapX * 0.8;
  const keyD = gapZ * 0.76;
  const keyH = 0.012;

  const keys = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x20243a, roughness: 0.55, metalness: 0.1 }),
    cols * rows + 1
  );

  const dummy = new THREE.Object3D();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dummy.position.set(-kbWidth / 2 + gapX * (c + 0.5), 0.021, kbCenterZ - kbDepth / 2 + gapZ * (r + 0.5));
      dummy.scale.set(keyW, keyH, keyD);
      dummy.updateMatrix();
      keys.setMatrixAt(i++, dummy.matrix);
    }
  }
  // barra espaciadora
  dummy.position.set(0, 0.021, kbCenterZ + kbDepth / 2 + gapZ * 0.62);
  dummy.scale.set(kbWidth * 0.4, keyH, gapZ * 0.7);
  dummy.updateMatrix();
  keys.setMatrixAt(i++, dummy.matrix);
  keys.instanceMatrix.needsUpdate = true;

  return keys;
}

// Laptop: base con teclado + touchpad + pantalla montada en una bisagra que la abre hacia atrás.
function buildLaptopRig(texture) {
  const group = new THREE.Group();
  const baseW = 1.32;
  const baseD = 0.86;

  const base = new THREE.Mesh(new RoundedBoxGeometry(baseW, 0.035, baseD, 3, 0.035), bodyMaterial());
  edgesOf(base);
  group.add(base);

  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(baseW * 0.86, baseD * 0.78),
    new THREE.MeshStandardMaterial({ color: 0x0d0f1c, roughness: 0.85 })
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.019;
  group.add(deck);

  group.add(buildKeyboard(baseW, baseD));

  const trackpad = new THREE.Mesh(
    new THREE.BoxGeometry(baseW * 0.34, 0.004, baseD * 0.3),
    new THREE.MeshStandardMaterial({ color: 0x181c33, roughness: 0.3, metalness: 0.15 })
  );
  trackpad.position.set(0, 0.021, baseD * 0.25);
  edgesOf(trackpad, 0.4);
  group.add(trackpad);

  const hinge = new THREE.Group();
  hinge.position.set(0, 0.017, -baseD / 2);
  hinge.rotation.x = -0.35; // abre la pantalla ~110° respecto a la base
  group.add(hinge);

  const lidW = baseW;
  const lidH = baseD * 0.98;
  const lidDepth = 0.035;
  const lid = new THREE.Mesh(new RoundedBoxGeometry(lidW, lidH, lidDepth, 3, 0.035), bodyMaterial());
  edgesOf(lid);
  lid.position.y = lidH / 2;
  hinge.add(lid);

  const bezel = 0.045;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(lidW - bezel * 2, lidH - bezel * 2),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  screen.position.z = lidDepth / 2 + 0.002;
  lid.add(screen);

  addCameraDot(lid, 0, lidH / 2 - bezel / 2, lidDepth / 2 + 0.003, 0.011);

  group.userData.screen = screen;
  return group;
}

// Centra el rig en su propio origen y lo escala para que todos los dispositivos ocupen un espacio similar en cuadro.
function normalizeRig(group, targetSpan) {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  group.position.sub(center);

  const mount = new THREE.Group();
  mount.add(group);
  const baseScale = targetSpan / Math.max(size.x, size.y, size.z);
  mount.scale.setScalar(baseScale);
  mount.userData.baseScale = baseScale;
  mount.userData.screen = group.userData.screen;
  return mount;
}

// Vitrina 3D: cada tamaño de pantalla se ve "corriendo" dentro de su propio dispositivo (laptop/tablet/celular),
// que se puede arrastrar para girar. Los botones cambian de dispositivo con una transición de escala.
export function setupPortfolioShowcase(container, { motion } = {}) {
  const showcases = [...container.querySelectorAll('.portfolio-showcase')];
  if (!showcases.length) return;

  const cleanups = showcases.map((showcase) => setupOne(showcase, motion));
  return () => cleanups.forEach((cleanup) => cleanup?.());
}

function setupOne(showcase, motion) {
  const stage = showcase.querySelector('.portfolio-showcase__stage');
  const imgs = DEVICES.map((device) => stage.querySelector(`img[data-device="${device}"]`));
  const buttons = [...showcase.querySelectorAll('.portfolio-showcase__controls button')];
  let mounted = null;

  const showDevice = (device) => {
    imgs.forEach((img) => (img.hidden = img.dataset.device !== device));
    buttons.forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.device === device)));
  };

  const onControlsClick = (event) => {
    const btn = event.target.closest('button[data-device]');
    if (!btn) return;
    showDevice(btn.dataset.device);
    mounted?.goTo(btn.dataset.device);
  };
  showcase.querySelector('.portfolio-showcase__controls').addEventListener('click', onControlsClick);

  let cancelled = false;
  Promise.all(imgs.map(waitLoaded)).then(() => {
    if (!cancelled) mounted = mountScene(stage, imgs, motion);
  });

  return () => {
    cancelled = true;
    showcase.querySelector('.portfolio-showcase__controls').removeEventListener('click', onControlsClick);
    mounted?.dispose();
  };
}

function mountScene(stage, imgs, motion) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }

  renderer.domElement.className = 'portfolio-showcase__canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.appendChild(renderer.domElement);
  stage.classList.add('is-3d');

  // El "sitio insertado" es un solo iframe vivo, reubicado dentro del dispositivo activo con CSS3DRenderer
  // (la técnica estándar de three.js para mezclar DOM real con una escena WebGL).
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.className = 'portfolio-showcase__css3d';
  stage.appendChild(cssRenderer.domElement);

  const iframe = document.createElement('iframe');
  iframe.src = EMBED_SRC;
  iframe.loading = 'lazy';
  iframe.tabIndex = -1;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.border = '0';
  const cssScreen = new CSS3DObject(iframe);
  cssScreen.element.style.pointerEvents = 'none'; // el arrastre para girar sigue viviendo en el canvas WebGL

  const built = Object.fromEntries(imgs.map((img) => [img.dataset.device, buildCardTexture(img)]));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  camera.position.set(0, 0.05, 4.4);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x0a0c16, 1.15));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.05);
  key.position.set(2, 3, 4);
  scene.add(key);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const rigs = {
    desktop: normalizeRig(buildLaptopRig(built.desktop.texture), TARGET_SPAN),
    tablet: normalizeRig(buildTabletRig(built.tablet.texture), TARGET_SPAN),
    mobile: normalizeRig(buildPhoneRig(built.mobile.texture), TARGET_SPAN),
  };
  Object.entries(rigs).forEach(([device, rig]) => {
    rig.visible = device === 'desktop';
    pivot.add(rig);
  });

  let activeDevice = 'desktop';
  pivot.rotation.set(REST.desktop.x, REST.desktop.y, 0);

  // Mueve el iframe compartido a la pantalla del dispositivo activo y lo redimensiona a su resolución real,
  // para que el sitio insertado dispare sus propios breakpoints (no es un simple reescalado visual).
  const attachScreen = (device) => {
    const screen = rigs[device].userData.screen;
    screen.parent.add(cssScreen);
    cssScreen.position.copy(screen.position);
    cssScreen.position.z += 0.002;

    const [pxW, pxH] = IFRAME_SIZE[device];
    if (iframe.dataset.device !== device) {
      iframe.dataset.device = device;
      iframe.style.width = `${pxW}px`;
      iframe.style.height = `${pxH}px`;
    }
    const { width: screenW, height: screenH } = screen.geometry.parameters;
    cssScreen.scale.set(screenW / pxW, screenH / pxH, 1);
  };
  attachScreen('desktop');

  const goTo = (device) => {
    if (device === activeDevice || !rigs[device]) return;
    const prev = rigs[activeDevice];
    const next = rigs[device];
    activeDevice = device;
    attachScreen(device);

    gsap.killTweensOf(pivot.rotation);
    if (motion) {
      const target = next.userData.baseScale;
      gsap.killTweensOf(prev.scale);
      gsap.to(prev.scale, {
        x: 0,
        y: 0,
        z: 0,
        duration: 0.26,
        ease: 'power2.in',
        onComplete: () => {
          prev.visible = false;
          prev.scale.setScalar(prev.userData.baseScale);
        },
      });
      next.scale.setScalar(0.001);
      next.visible = true;
      gsap.to(next.scale, { x: target, y: target, z: target, duration: 0.5, delay: 0.14, ease: 'back.out(1.6)' });
      gsap.to(pivot.rotation, { x: REST[device].x, y: REST[device].y, duration: 0.6, ease: 'power3.out' });
    } else {
      prev.visible = false;
      next.visible = true;
      next.scale.setScalar(next.userData.baseScale);
      pivot.rotation.set(REST[device].x, REST[device].y, 0);
    }
  };

  // — arrastrar para girar, con regreso elástico a la posición de reposo del dispositivo activo —
  let dragging = false;
  let start = { x: 0, y: 0 };
  let base = { x: REST.desktop.x, y: REST.desktop.y };

  const onPointerDown = (event) => {
    dragging = true;
    start = { x: event.clientX, y: event.clientY };
    base = { x: pivot.rotation.x, y: pivot.rotation.y };
    renderer.domElement.setPointerCapture(event.pointerId);
    gsap.killTweensOf(pivot.rotation);
  };
  const onPointerMove = (event) => {
    if (!dragging) return;
    const rest = REST[activeDevice];
    const dx = (event.clientX - start.x) / renderer.domElement.clientWidth;
    const dy = (event.clientY - start.y) / renderer.domElement.clientHeight;
    pivot.rotation.y = clamp(base.y + dx * 2.2, rest.y - DRAG_LIMIT.y, rest.y + DRAG_LIMIT.y);
    pivot.rotation.x = clamp(base.x - dy * 2.2, rest.x - DRAG_LIMIT.x, rest.x + DRAG_LIMIT.x);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    const rest = REST[activeDevice];
    if (motion) {
      gsap.to(pivot.rotation, { x: rest.x, y: rest.y, duration: 1.1, ease: 'elastic.out(1, 0.6)' });
    } else {
      pivot.rotation.set(rest.x, rest.y, 0);
    }
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  // — tamaño y render —
  const render = () => {
    renderer.render(scene, camera);
    cssRenderer.render(scene, camera);
  };
  const resize = () => {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    cssRenderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };

  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    gsap.ticker.add(render);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(render);
  };
  const onVisibility = () => (document.hidden ? stop() : run());

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  run();

  return {
    goTo,
    dispose() {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      gsap.killTweensOf(pivot.rotation);
      Object.values(rigs).forEach((rig) => {
        gsap.killTweensOf(rig.scale);
        rig.traverse((obj) => {
          obj.geometry?.dispose();
          obj.material?.dispose();
        });
      });
      Object.values(built).forEach(({ texture }) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      iframe.remove();
      cssRenderer.domElement.remove();
      stage.classList.remove('is-3d');
    },
  };
}
