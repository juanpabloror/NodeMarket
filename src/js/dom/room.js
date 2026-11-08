import { definePage } from './page.js';
import { gsap, ScrollTrigger } from '../gsap.js';
import { emit, on, setState, state } from '../../state.js';
import { PANEL_QUERY, isPanelMode } from './layout.js';

/* Cada página interna es una parte distinta de la oficina de Node Market (ver POSES en
   src/background/house.js): servicios = el taller, paquetes = la repisa, portafolio = la pizarra,
   nosotros = el sofá, preguntas = el archivero, contacto = el teléfono, 404 = la puerta.
   defineRoomPage(view, setup) = definePage + la cámara de la casa apuntando a esa vista.
   Sin html.story-3d (movimiento reducido, sin WebGL, iframe o "Vista sin 3D") la página es solo contenido. */

const root = document.documentElement;
const PREF_KEY = 'nm-3d';

export function defineRoomPage(view, setup) {
  let current = null;

  const page = definePage((container, conditions) => {
    const cleanups = [setup?.(container, conditions)];
    const listen = (target, type, handler) => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };
    const rebuild = () =>
      setTimeout(() => {
        if (!current) return;
        page.destroy();
        page.init(current);
        ScrollTrigger.refresh();
      }, 0);
    const is3d = root.classList.contains('story-3d');

    const toggle = container.querySelector('[data-toggle-3d]');
    if (toggle) {
      toggle.textContent = is3d ? 'Vista sin 3D' : 'Ver en 3D';
      listen(toggle, 'click', () => {
        const next = !root.classList.contains('story-3d');
        root.classList.toggle('story-3d', next);
        try {
          localStorage.setItem(PREF_KEY, next ? 'on' : 'off');
        } catch {
          /* sin almacenamiento */
        }
        setState({ house3d: next });
        rebuild();
      });
    }
    cleanups.push(
      on('webglFailed', () => {
        root.classList.remove('story-3d');
        setState({ house3d: false });
        rebuild();
      }),
    );

    // los botones con data-scroll-to bajan al contenido de la página
    container.querySelectorAll('[data-scroll-to]').forEach((el) => {
      listen(el, 'click', (event) => {
        const target = container.querySelector(el.dataset.scrollTo);
        if (!target) return;
        event.preventDefault();
        if (isPanelMode()) {
          // el contenido vive en su propio panel: se regresa al inicio del panel y se enfoca
          target.scrollTo({ top: 0, behavior: 'smooth' });
          target.focus({ preventScroll: true });
          return;
        }
        const header = document.querySelector('.site-header')?.offsetHeight ?? 72;
        emit('scrollTo', { y: target.getBoundingClientRect().top + window.scrollY - header, duration: 1.1 });
      });
    });

    if (!is3d) {
      setState({ houseActive: false, hotspots: [] });
      return () => cleanups.forEach((fn) => typeof fn === 'function' && fn());
    }

    const panelMode = isPanelMode();
    // al cruzar el ancho de 62rem cambia todo el layout: se reconstruye la página
    const widthQuery = window.matchMedia(PANEL_QUERY);
    const onWidth = () => rebuild();
    widthQuery.addEventListener('change', onWidth);
    cleanups.push(() => widthQuery.removeEventListener('change', onWidth));

    // línea que une el objeto de la oficina con su panel de contenido
    const panel = container.querySelector('.room-panel');
    if (panelMode && panel) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'room-link');
      svg.setAttribute('aria-hidden', 'true');
      const line = document.createElementNS(NS, 'line');
      const from = document.createElementNS(NS, 'circle');
      const to = document.createElementNS(NS, 'circle');
      from.setAttribute('r', '4');
      to.setAttribute('r', '4');
      svg.append(line, from, to);
      container.append(svg);
      const draw = () => {
        const a = state.anchorScreen;
        svg.style.opacity = a.on ? '1' : '0';
        if (!a.on) return;
        const m = container.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const x1 = a.x - m.left;
        const y1 = a.y - m.top;
        const x2 = p.left - m.left;
        const y2 = Math.min(Math.max(a.y, p.top + 28), p.bottom - 28) - m.top;
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        from.setAttribute('cx', x1);
        from.setAttribute('cy', y1);
        to.setAttribute('cx', x2);
        to.setAttribute('cy', y2);
      };
      gsap.ticker.add(draw);
      cleanups.push(() => {
        gsap.ticker.remove(draw);
        svg.remove();
      });
    }

    const hotspots = [...container.querySelectorAll('[data-hotspot]')];
    [...hotspots].forEach((el) => {
      listen(el, 'pointerenter', () => setState({ hotspotHover: el.dataset.hotspot }));
      listen(el, 'pointerleave', () => setState({ hotspotHover: '' }));
      listen(el, 'focus', () => setState({ hotspotHover: el.dataset.hotspot }));
      listen(el, 'blur', () => setState({ hotspotHover: '' }));
    });
    setState({
      houseActive: true,
      house3d: true,
      house: view,
      housePanel: panelMode,
      houseExit: window.scrollY,
      doorOpen: false,
      hotspots: hotspots.map((el) => ({ el, anchor: el.dataset.hotspot, scene: view })),
    });
    // la vista sube junto con el contenido: la oficina "se queda" en la portada de la página
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => setState({ houseExit: self.scroll() }),
    });

    return () => {
      cleanups.forEach((fn) => typeof fn === 'function' && fn());
      setState({ hotspots: [], hotspotHover: '' });
    };
  });

  return {
    init(container) {
      current = container;
      page.init(container);
    },
    destroy() {
      current = null;
      page.destroy();
    },
  };
}
