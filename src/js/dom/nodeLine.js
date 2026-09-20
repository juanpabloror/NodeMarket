import { gsap, ScrollTrigger } from '../gsap.js';

const NS = 'http://www.w3.org/2000/svg';
const X = 7; // posición horizontal fija: la línea es recta, no un zigzag
const ANCHORS = '.eyebrow, .hero__eyebrow, h1, h2, h3';

const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

// Línea SVG que une las secciones de la página: se dibuja con el scroll y cada sección enciende su nodo.
export function setupNodeLine(container, { motion }) {
  const sections = [...container.querySelectorAll('.hero, .page-hero, .section')];
  if (sections.length < 2) return;

  const svg = el('svg', { class: 'node-line', 'aria-hidden': 'true', focusable: 'false' });
  const path = el('path');
  const dots = sections.map(() => el('circle', { r: 3 }));
  svg.append(path, ...dots);
  container.prepend(svg);

  let ys = [];
  let length = 0;
  let raf = 0;

  const layout = () => {
    const top = container.getBoundingClientRect().top + window.scrollY;
    ys = sections.map((section) => {
      const anchor = section.querySelector(ANCHORS);
      if (anchor) {
        const box = anchor.getBoundingClientRect();
        return box.top + window.scrollY - top + Math.min(box.height / 2, 14);
      }
      const box = section.getBoundingClientRect();
      return box.top + window.scrollY - top + parseFloat(getComputedStyle(section).paddingTop);
    });
    path.setAttribute('d', ys.map((y, i) => `${i ? 'L' : 'M'}${X} ${y}`).join(' '));
    dots.forEach((dot, i) => {
      dot.setAttribute('cx', X);
      dot.setAttribute('cy', ys[i]);
    });
    length = path.getTotalLength();
    path.style.strokeDasharray = length;
    if (!motion) path.style.strokeDashoffset = 0;
  };
  layout();

  if (!motion) {
    return () => svg.remove();
  }

  const progress = { value: 0 };
  const draw = () => (path.style.strokeDashoffset = length * (1 - progress.value));
  draw();

  const spanStart = () => `top+=${ys[0]} 62%`;
  const spanEnd = () => `top+=${ys[ys.length - 1]} 62%`;
  gsap.to(progress, {
    value: 1,
    ease: 'none',
    onUpdate: draw,
    scrollTrigger: { trigger: container, start: spanStart, end: spanEnd, scrub: 0.4 },
  });

  dots.forEach((dot, i) => {
    ScrollTrigger.create({
      trigger: container,
      start: () => `top+=${ys[i]} 62%`,
      onEnter: () => dot.classList.add('is-lit'),
      onLeaveBack: () => dot.classList.remove('is-lit'),
    });
  });

  const relayout = () => {
    layout();
    draw();
  };
  ScrollTrigger.addEventListener('refreshInit', relayout);
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      relayout();
      ScrollTrigger.refresh();
    });
  });
  observer.observe(container);

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    ScrollTrigger.removeEventListener('refreshInit', relayout);
    svg.remove();
  };
}
