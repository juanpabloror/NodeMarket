import Swup from 'swup';
import SwupHeadPlugin from '@swup/head-plugin';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap.js';
import { setupMagnetic } from './dom/magnetic.js';
import { emit, setState, state } from '../state.js';

const modules = import.meta.glob('./pages/*.js', { eager: true });
const root = document.documentElement;
const CONTAINER = '#contenido';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const getMain = () => document.querySelector(CONTAINER);
const announcer = document.getElementById('route-announcer');

let lenis = null;
let page = null;

/* — scroll suave (Lenis) sincronizado con el ticker de GSAP — */

const motion = gsap.matchMedia();

motion.add('(prefers-reduced-motion: no-preference)', () => {
  lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
    lenis = null;
  };
});

motion.add('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)', () => setupMagnetic());

/* — progreso de scroll → estado compartido con la escena 3D — */

const progress = { value: 0 };
gsap.to(progress, {
  value: 1,
  ease: 'none',
  onUpdate: () => setState({ scroll: progress.value }),
  scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.6 },
});

/* — ciclo de vida de cada página: destroy() de la saliente, init() de la entrante — */

function markNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.site-nav a:not(.btn)').forEach((link) => {
    if (new URL(link.href).pathname === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function enterPage({ announce }) {
  const main = getMain();
  if (!main) return;

  document.body.dataset.page = main.dataset.page ?? '';
  main.setAttribute('tabindex', '-1');
  page = modules[`./pages/${main.dataset.page}.js`] ?? null;
  page?.init?.(main);
  setState({ formation: main.dataset.formation ?? 'calma', activeGroup: -1 });
  markNav();
  ScrollTrigger.refresh();

  if (announce) {
    if (announcer) announcer.textContent = document.title;
    main.focus({ preventScroll: true });
  }
}

function leavePage() {
  const main = getMain();
  return new Promise((resolve) => {
    gsap.to(main, {
      opacity: 0,
      y: reduceMotion.matches ? 0 : -14,
      duration: reduceMotion.matches ? 0.15 : 0.32,
      ease: reduceMotion.matches ? 'none' : 'power2.in',
      onComplete: resolve,
    });
  });
}

/* — navegación sin recarga (Swup) con transiciones dirigidas por GSAP — */

const swup = new Swup({
  containers: [CONTAINER],
  animationSelector: false,
  animateHistoryBrowsing: true,
  ignoreVisit: (url, { el } = {}) => !!el?.closest('[data-no-swup], [target="_blank"]'),
  plugins: [new SwupHeadPlugin({ persistAssets: true, awaitAssets: true })],
});

swup.hooks.on('visit:start', () => {
  lenis?.stop();
  const toggle = document.getElementById('nav-toggle');
  if (toggle) toggle.checked = false;
});
swup.hooks.replace('animation:out:await', () => leavePage());
swup.hooks.before('content:replace', () => {
  page?.destroy?.();
  page = null;
});
swup.hooks.replace('content:scroll', () => {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
  return true;
});
swup.hooks.on('page:view', () => {
  enterPage({ announce: true });
  lenis?.start();
});

/* — extras globales — */

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* — tema claro/oscuro — */
/* Cambia el color de las tarjetas/formulario/footer (ver components.css) y el de la escena 3D
   (fondo, nodos y conexiones — ver scene.js). Claro es el modo por defecto (sin importar la
   preferencia del sistema); el tema ya se aplicó antes del primer pintado en head-shared.html.
   setState() avisa a la escena, que puede estar cargada o no todavía. */
const THEME_KEY = 'nm-theme';
const themeToggle = document.getElementById('theme-toggle');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle?.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeColorMeta?.setAttribute('content', theme === 'light' ? '#ffffff' : '#05060b');
  setState({ theme });
}

applyTheme(root.dataset.theme || 'light');

themeToggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

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

/* — arranque — */

enterPage({ announce: false });
document.fonts?.ready.then(() => ScrollTrigger.refresh());
root.classList.add('is-ready');

const sceneEl = document.getElementById('node-scene');
// Dentro de un iframe (la vitrina 3D de /portafolio/ incrusta el sitio) no arrancamos el fondo:
// no compite por GPU con la escena que ya lo está mostrando "por fuera".
if (sceneEl && window.self === window.top) {
  const loadScene = () =>
    import('../background/scene.js')
      .then((scene) => scene.start(sceneEl))
      .catch((err) => console.error('No se pudo iniciar el fondo 3D.', err));
  // La escena 3D espera a que la página termine de cargar para no competir con el contenido del héroe.
  const scheduleScene = () =>
    setTimeout(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(loadScene, { timeout: 2500 });
      else loadScene();
    }, 400);
  if (document.readyState === 'complete') scheduleScene();
  else window.addEventListener('load', scheduleScene, { once: true });
}

if (import.meta.env.DEV) window.__nm = { swup, ScrollTrigger, state, getLenis: () => lenis };
