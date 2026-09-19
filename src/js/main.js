const page = document.body.dataset.page;
let currentModule = null;

async function boot() {
  if (!page) return;
  try {
    currentModule = await import(`./pages/${page}.js`);
    currentModule.init?.();
  } catch (err) {
    console.error(`No se pudo cargar el módulo de la página "${page}".`, err);
  }
}

window.addEventListener('pagehide', () => currentModule?.destroy?.());

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

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
