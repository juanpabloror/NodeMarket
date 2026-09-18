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

boot();
