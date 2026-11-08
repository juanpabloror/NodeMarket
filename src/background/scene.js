import { Color, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three';
import { gsap } from 'gsap';
import { DEFAULT_COLORS, NodeNetwork } from './NodeNetwork.js';
import { createHouse } from './house.js';
import { TIERS, createFpsMonitor, forcedTier, initialTier, nextLowerTier } from './quality.js';
import { on, state } from '../state.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const BLOOM_SCALE = 0.5;

// El fondo y los colores de la escena solo tienen una variante clara; el resto del sitio también
// tiene una oscura porque flota sobre este mismo canvas (ver tokens.css).
const readVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const readTheme = () => ({
  bg: readVar('--color-scene-light-bg', '#ffffff'),
  colors: {
    node: readVar('--color-scene-light-node', DEFAULT_COLORS.node),
    link: readVar('--color-scene-light-link', DEFAULT_COLORS.link),
    pulse: readVar('--color-scene-light-pulse', DEFAULT_COLORS.pulse),
    highlight: readVar('--color-scene-light-highlight', DEFAULT_COLORS.highlight),
  },
});

export function start(container) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const darkBg = new Color(readVar('--color-scene-dark-bg', '#05060b'));
  const light = readTheme();
  const lightBg = new Color(light.bg);
  renderer.domElement.classList.add('node-scene__canvas');
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 24);

  let tierName = initialTier();
  let tier = TIERS[tierName];
  const network = new NodeNetwork(scene, camera, {
    nodeCount: TIERS.high.count,
    nodeSize: 15,
    initialCount: tier.count,
    reducedMotion: reducedMotion.matches,
  });
  const applyFormation = () => network.setFormation(state.formation, { stages: state.stages });
  applyFormation();

  const applyTheme = (theme) => {
    const isLight = theme === 'light';
    scene.background = isLight ? lightBg : darkBg;
    network.setColors({ ...(isLight ? light.colors : DEFAULT_COLORS), additive: !isLight });
    setBloom(tier.bloom && !isLight);
    house?.setTheme(theme);
    if (!running) staticHouseFrame();
  };

  let bloom = null;
  let bloomWanted = false;
  let size = { width: 1, height: 1, pixelRatio: 1 };

  // La casa (inicio) vive en una segunda escena que se dibuja encima de la red de nodos; se crea la primera vez que se necesita.
  let house = null;
  const houseOn = () => state.houseActive && state.house3d && !!house;
  const ensureHouse = () => {
    if (house || !state.houseActive || !state.house3d) return;
    house = createHouse(renderer);
    house.setTheme(state.theme);
    house.resize(size.width, size.height, size.pixelRatio);
  };
  const staticHouseFrame = () => {
    ensureHouse();
    if (houseOn()) house.update(0, state, { snap: true });
    draw();
  };

  const draw = () => {
    if (bloom) bloom.composer.render();
    else renderer.render(scene, camera);
    if (houseOn()) house.render();
  };
  const monitor = forcedTier()
    ? null
    : createFpsMonitor(() => {
        const lower = nextLowerTier(tierName);
        if (lower) applyTier(lower);
      });

  const tick = (_time, deltaMs) => {
    network.setScroll(state.scroll);
    network.setFocus(state.activeGroup);
    const dt = Math.min(deltaMs / 1000, 0.05);
    network.update(dt);
    ensureHouse();
    if (houseOn()) house.update(dt, state);
    draw();
    monitor?.sample();
  };

  let running = false;
  const run = () => {
    if (running || reducedMotion.matches || document.hidden) return;
    running = true;
    monitor?.reset();
    gsap.ticker.add(tick);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  };

  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, tier.dpr, window.innerWidth < 768 ? 1.5 : 2);

  const resizeBloom = () => {
    if (!bloom) return;
    const { width, height, pixelRatio: pr } = size;
    bloom.composer.setPixelRatio(pr);
    bloom.composer.setSize(width, height);
    bloom.pass.setSize(width * pr * BLOOM_SCALE, height * pr * BLOOM_SCALE);
  };

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    size = { width, height, pixelRatio: pixelRatio() };
    renderer.setPixelRatio(size.pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    network.resize(size);
    house?.resize(width, height, size.pixelRatio);
    resizeBloom();
    if (!running) {
      network.update(0);
      draw();
    }
  };

  const setBloom = async (enabled) => {
    bloomWanted = enabled;
    if (!enabled) {
      bloom?.composer.dispose();
      bloom = null;
      return;
    }
    if (bloom) return;
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js'),
    ]);
    if (!bloomWanted || bloom) return;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const pass = new UnrealBloomPass(new Vector2(1, 1), 0.55, 0.6, 0.3);
    composer.addPass(pass);
    composer.addPass(new OutputPass());
    bloom = { composer, pass };
    resizeBloom();
    if (!running) draw();
  };

  function applyTier(name) {
    tierName = name;
    tier = TIERS[name];
    container.dataset.quality = name;
    network.setNodeCount(tier.count);
    setBloom(tier.bloom && state.theme !== 'light');
    resize();
  }

  const onVisibility = () => (document.hidden ? stop() : run());
  const onMotionChange = () => {
    network.setReducedMotion(reducedMotion.matches);
    applyFormation();
    if (reducedMotion.matches) {
      stop();
      network.update(0);
      draw();
    } else {
      run();
    }
  };

  const offFormation = on('formation', applyFormation);
  const offStages = on('stages', () => state.formation === 'ruta' && applyFormation());
  const offBurst = on('burst', () => network.burst());
  const offTheme = on('theme', applyTheme);
  const offHouse = ['house', 'houseExit', 'houseActive', 'house3d', 'doorOpen', 'hotspotHover', 'hotspots'].map((key) => on(key, () => !running && staticHouseFrame()));
  const offPulse = on('housePulse', (id) => house?.pulse(id));

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', onMotionChange);

  container.dataset.quality = tierName;
  applyTheme(state.theme);
  resize();
  network.update(0);
  draw();
  container.classList.add('is-ready');
  run();

  return {
    network,
    dispose() {
      stop();
      offFormation();
      offStages();
      offBurst();
      offTheme();
      offHouse.forEach((off) => off());
      offPulse();
      house?.dispose();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      bloom?.composer.dispose();
      network.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      container.classList.remove('is-ready');
    },
  };
}
