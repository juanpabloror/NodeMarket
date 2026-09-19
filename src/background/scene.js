import { Color, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three';
import { gsap } from 'gsap';
import { NodeNetwork } from './NodeNetwork.js';
import { TIERS, createFpsMonitor, forcedTier, initialTier, nextLowerTier } from './quality.js';
import { on, state } from '../state.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const BLOOM_SCALE = 0.5;

export function start(container) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  renderer.domElement.classList.add('node-scene__canvas');
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(bg || '#05060b');
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 24);

  let tierName = initialTier();
  let tier = TIERS[tierName];
  const network = new NodeNetwork(scene, camera, {
    nodeCount: TIERS.high.count,
    initialCount: tier.count,
    reducedMotion: reducedMotion.matches,
  });
  const applyFormation = () => network.setFormation(state.formation, { stages: state.stages });
  applyFormation();

  let bloom = null;
  let bloomWanted = false;
  let size = { width: 1, height: 1, pixelRatio: 1 };

  const draw = () => (bloom ? bloom.composer.render() : renderer.render(scene, camera));
  const monitor = forcedTier()
    ? null
    : createFpsMonitor(() => {
        const lower = nextLowerTier(tierName);
        if (lower) applyTier(lower);
      });

  const tick = (_time, deltaMs) => {
    network.setScroll(state.scroll);
    network.setFocus(state.activeGroup);
    network.update(Math.min(deltaMs / 1000, 0.05));
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
    setBloom(tier.bloom);
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

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', onMotionChange);

  container.dataset.quality = tierName;
  setBloom(tier.bloom);
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
