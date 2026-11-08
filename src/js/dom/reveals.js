import { gsap, ScrollTrigger, SplitText } from '../gsap.js';
import { isPanelMode } from './layout.js';

const START = 'top 88%';

// Con movimiento: titulares por líneas con máscara (SplitText) y el resto con fade-up al entrar.
// Sin movimiento: solo un fade corto. Los estados iniciales ocultos viven en motion.css bajo html.js.
export function setupReveals(container, { motion }) {
  // El contenido del panel tiene su propio scroll: no depende del scroll de la página, así que no se anima al entrar.
  const outside = (el) => !(isPanelMode() && el.closest('.room-panel'));
  const titles = [...container.querySelectorAll('[data-split]')].filter(outside);
  const fades = [...container.querySelectorAll('[data-reveal]')].filter(outside);
  const grouped = [...container.querySelectorAll('[data-stagger]')].flatMap((group) => [...group.children]).filter(outside);
  const items = [...fades, ...grouped];

  if (!motion) {
    gsap.set(titles, { visibility: 'visible' });
    gsap.from([...titles, ...items], { opacity: 0, duration: 0.3, ease: 'none' });
    return;
  }

  titles.forEach((title) => {
    SplitText.create(title, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'split-line',
      autoSplit: true,
      onSplit(split) {
        gsap.set(title, { visibility: 'visible' });
        return gsap.from(split.lines, {
          yPercent: 110,
          duration: 0.9,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: { trigger: title, start: START, once: true },
        });
      },
    });
  });

  ScrollTrigger.batch(items, {
    start: START,
    once: true,
    interval: 0.08,
    batchMax: 6,
    onEnter: (batch) =>
      gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, overwrite: true }),
  });
}
