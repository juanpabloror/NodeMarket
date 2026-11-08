import { definePage } from '../dom/page.js';
import { ScrollTrigger } from '../gsap.js';
import { emit, on, setState } from '../../state.js';

/* Recorrido de "la casa": 3 escenas ancladas al scroll.
   - El scroll mueve state.house (0..2) y la escena 3D (src/background/house.js) mueve la cámara.
   - Los botones .hotspot se posicionan desde la escena; aquí solo se conectan sus clics y su estado.
   - Sin 3D (movimiento reducido, sin WebGL o "Vista sin 3D") las escenas son bloques apilados. */

const root = document.documentElement;
const PREF_KEY = 'nm-3d';
const STEPS = 3;
const SNAP_DELAY = 180;

const is3d = () => root.classList.contains('story-3d');
const remember = (value) => {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch {
    /* sin almacenamiento: la preferencia solo dura la visita */
  }
};

function setup(container) {
  const story = container.querySelector('.story');
  if (!story) return;

  const panels = [...story.querySelectorAll('.story__panel')];
  const stepButtons = [...story.querySelectorAll('.story__step')];
  const sceneName = story.querySelector('.story__scene-name');
  const sceneCount = story.querySelector('.story__count');
  const toggle = story.querySelector('[data-toggle-3d]');
  const hotspots = [...story.querySelectorAll('[data-hotspot]')];
  const serviceLinks = [...story.querySelectorAll('.story__services a')];
  const detail = story.querySelector('.story__detail');
  const timers = new Set();
  const cleanups = [];
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  };

  /* — botón "Vista sin 3D" / "Ver en 3D" — */
  const syncToggle = () => {
    if (!toggle) return;
    const on3d = is3d();
    toggle.textContent = on3d ? 'Vista sin 3D' : 'Ver en 3D';
    toggle.setAttribute('aria-pressed', String(!on3d));
  };
  syncToggle();
  if (toggle) {
    listen(toggle, 'click', () => {
      const next = !is3d();
      root.classList.toggle('story-3d', next);
      remember(next ? 'on' : 'off');
      setState({ house3d: next });
      rebuild();
    });
  }
  // si WebGL falla, scene.js avisa y el recorrido pasa a bloques apilados
  cleanups.push(
    on('webglFailed', () => {
      root.classList.remove('story-3d');
      setState({ house3d: false });
      rebuild();
    }),
  );

  /* — servicios: lista ↔ objetos de la casa — */
  const serviceItems = hotspots.filter((el) => el.dataset.service);
  const setHover = (anchor) => setState({ hotspotHover: anchor });
  const selectService = (index) => {
    serviceItems.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.service) === index));
    serviceLinks.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.service) === index));
    const link = serviceLinks.find((el) => Number(el.dataset.service) === index);
    if (detail && link) {
      detail.replaceChildren();
      const text = document.createElement('span');
      text.textContent = `${link.dataset.resumen} `;
      const more = document.createElement('a');
      more.href = link.getAttribute('href');
      more.className = 'text-link';
      more.textContent = 'Ver más';
      detail.append(text, more);
    }
    if (link) emit('housePulse', link.dataset.anchor);
  };

  [...hotspots, ...serviceLinks].forEach((el) => {
    const anchor = el.dataset.hotspot ?? el.dataset.anchor;
    listen(el, 'pointerenter', () => setHover(anchor));
    listen(el, 'pointerleave', () => setHover(''));
    listen(el, 'focus', () => setHover(anchor));
    listen(el, 'blur', () => setHover(''));
  });
  serviceItems.forEach((el) => listen(el, 'click', () => selectService(Number(el.dataset.service))));

  if (!is3d()) {
    setState({ houseActive: false, hotspots: [], house: 0, houseExit: 0 });
    return () => {
      cleanups.forEach((fn) => fn());
      timers.forEach(clearTimeout);
      setState({ hotspotHover: '' });
    };
  }

  /* — modo 3D — */
  setState({
    houseActive: true,
    house3d: true,
    housePanel: false,
    hotspots: hotspots.map((el) => ({ el, anchor: el.dataset.hotspot, scene: Number(el.dataset.scene) })),
  });

  let step = -1;
  const setStep = (next) => {
    if (next === step) return;
    step = next;
    panels.forEach((panel, i) => panel.classList.toggle('is-active', i === next));
    stepButtons.forEach((button, i) => (i === next ? button.setAttribute('aria-current', 'step') : button.removeAttribute('aria-current')));
    if (sceneName) sceneName.textContent = panels[next]?.dataset.name ?? '';
    if (sceneCount) sceneCount.textContent = `0${next + 1} / 0${STEPS}`;
    if (next !== 0) later(() => setState({ doorOpen: false }), 1400);
  };
  setStep(0);

  const headerHeight = () => document.querySelector('.site-header')?.offsetHeight ?? 72;
  let snapTimer = 0;

  const scrollToStep = (index) => {
    const y = main.start + (index / (STEPS - 1)) * (main.end - main.start);
    emit('scrollTo', { y, duration: 1.1 });
  };

  const main = ScrollTrigger.create({
    trigger: story,
    start: () => `top ${headerHeight()}px`,
    end: 'bottom bottom',
    onUpdate: (self) => {
      const p = self.progress * (STEPS - 1);
      setState({ house: p });
      setStep(Math.round(p));
      // imán suave: al dejar de hacer scroll, la escena se acomoda en el paso más cercano
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        const frac = Math.abs(p - Math.round(p));
        if (frac > 0.04 && self.isActive) scrollToStep(Math.round(p));
      }, SNAP_DELAY);
    },
    onRefresh: (self) => {
      setState({ house: self.progress * (STEPS - 1) });
      setStep(Math.round(self.progress * (STEPS - 1)));
    },
  });
  cleanups.push(() => clearTimeout(snapTimer));

  // al terminar el recorrido, el escenario sube con el contenido y la casa lo acompaña
  ScrollTrigger.create({
    trigger: story,
    start: 'bottom bottom',
    end: 'bottom top',
    onUpdate: (self) => setState({ houseExit: self.scroll() - self.start }),
    onLeaveBack: () => setState({ houseExit: 0 }),
  });

  story.querySelectorAll('[data-story-go]').forEach((el) => {
    listen(el, 'click', (event) => {
      event.preventDefault();
      scrollToStep(Number(el.dataset.storyGo));
    });
  });

  // la puerta: se abre y la cámara entra a la casa
  const door = hotspots.find((el) => el.dataset.hotspot === 'door');
  if (door) {
    listen(door, 'click', () => {
      setState({ doorOpen: true });
      later(() => scrollToStep(1), 650);
    });
  }

  return () => {
    cleanups.forEach((fn) => fn());
    timers.forEach(clearTimeout);
    setState({ hotspots: [], doorOpen: false, hotspotHover: '' });
  };
}

const page = definePage(setup);
let current = null;

// al cambiar entre 3D y bloques apilados cambia todo el layout: se reconstruye la página
function rebuild() {
  if (!current) return;
  const container = current;
  setTimeout(() => {
    page.destroy();
    page.init(container);
    window.scrollTo(0, 0);
    ScrollTrigger.refresh();
  }, 0);
}

export const init = (container) => {
  current = container;
  page.init(container);
};

export const destroy = () => {
  current = null;
  page.destroy();
};
