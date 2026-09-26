import { definePage } from '../dom/page.js';

// three.js se carga en diferido: solo quien visita /portafolio/ paga ese peso.
// Dentro de un iframe no se monta: la vitrina incrusta el inicio, nunca a sí misma, pero esto evita cualquier recursión.
export const { init, destroy } = definePage((container, { motion }) => {
  if (window.self !== window.top) return;
  let cleanup = null;
  let cancelled = false;
  import('../portfolio/showcase.js').then(({ setupPortfolioShowcase }) => {
    if (cancelled) return;
    cleanup = setupPortfolioShowcase(container, { motion });
  });
  return () => {
    cancelled = true;
    cleanup?.();
  };
});
