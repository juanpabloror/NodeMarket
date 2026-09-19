import { emit, setState } from '../state.js';

const page = document.body.dataset.page;
let currentModule = null;

async function boot() {
  if (page) {
    try {
      currentModule = await import(`./pages/${page}.js`);
      currentModule.init?.();
    } catch (err) {
      console.error(`No se pudo cargar el módulo de la página "${page}".`, err);
    }
  }
  setState({ formation: document.querySelector('main')?.dataset.formation ?? 'calma' });
}

window.addEventListener('pagehide', () => currentModule?.destroy?.());

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

const updateScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  setState({ scroll: max > 0 ? window.scrollY / max : 0 });
};
window.addEventListener('scroll', updateScroll, { passive: true });
window.addEventListener('resize', updateScroll, { passive: true });
updateScroll();

let lastBurst = 0;
const launchBurst = (event) => {
  const cta = event.target.closest?.('.btn--accent.btn--lg');
  if (!cta || cta.contains(event.relatedTarget)) return;
  const now = performance.now();
  if (now - lastBurst < 1200) return;
  lastBurst = now;
  emit('burst');
};
document.addEventListener('pointerover', launchBurst);
document.addEventListener('focusin', launchBurst);

const sceneEl = document.getElementById('node-scene');
if (sceneEl) {
  const loadScene = () =>
    import('../background/scene.js')
      .then((scene) => scene.start(sceneEl))
      .catch((err) => console.error('No se pudo iniciar el fondo 3D.', err));
  requestAnimationFrame(() =>
    'requestIdleCallback' in window ? requestIdleCallback(loadScene, { timeout: 2000 }) : setTimeout(loadScene, 300)
  );
}

boot();
