import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { gsap } from 'gsap';
import { NodeNetwork } from './NodeNetwork.js';

const CAMERA_Z = 24;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const getPixelRatio = () => Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);

export function start(container) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  renderer.setClearColor(bg || '#05060b');
  renderer.domElement.classList.add('node-scene__canvas');
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  const network = new NodeNetwork(scene, camera, { reducedMotion: reducedMotion.matches });

  const draw = () => renderer.render(scene, camera);
  const tick = (_time, deltaMs) => {
    network.update(Math.min(deltaMs / 1000, 0.05));
    draw();
  };

  let running = false;
  const run = () => {
    if (running || reducedMotion.matches || document.hidden) return;
    running = true;
    gsap.ticker.add(tick);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  };

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    const pixelRatio = getPixelRatio();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    network.resize({ width, height, pixelRatio });
    if (!running) {
      network.update(0);
      draw();
    }
  };

  const onVisibility = () => (document.hidden ? stop() : run());
  const onMotionChange = () => {
    network.setReducedMotion(reducedMotion.matches);
    if (reducedMotion.matches) {
      stop();
      network.update(0);
      draw();
    } else {
      run();
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  document.addEventListener('visibilitychange', onVisibility);
  reducedMotion.addEventListener('change', onMotionChange);

  resize();
  network.update(0);
  draw();
  container.classList.add('is-ready');
  run();

  return {
    network,
    dispose() {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', onMotionChange);
      network.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      container.classList.remove('is-ready');
    },
  };
}
